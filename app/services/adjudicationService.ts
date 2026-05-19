import { db } from '../db/client';
import { getClaim, updateClaimStatus } from '../db/repositories/claims';
import { getLineItem, getLineItemsByClaimId, updateLineItemStatus } from '../db/repositories/lineItems';
import { getCoverageRules } from '../db/repositories/policies';
import { createAdjudicationResult, deactivateResults } from '../db/repositories/adjudicationResults';
import { computePriorUsage } from '../db/repositories/limitUsage';
import { adjudicate } from '../domain/adjudication/adjudicator';
import { deriveClaimStatus, assertCanFlagForReview } from '../domain/claims/stateMachine';
import { DomainError } from '../domain/errors';
import type { ServiceType } from '../domain/policies/types';
import type { AdjudicationTrigger } from '../domain/adjudication/types';
type ManualDecision = 'approved' | 'denied';

export async function manualReviewLineItem(lineItemId: string, decision: ManualDecision): Promise<void> {
  await db.transaction(async (tx) => {
    const anyTx = tx as unknown as typeof db;

    const lineItem = await getLineItem(lineItemId, anyTx);
    if (!lineItem) throw new DomainError('LINE_ITEM_NOT_FOUND');
    if (lineItem.status !== 'needs_review')
      throw new DomainError('LINE_ITEM_NOT_UNDER_REVIEW', `Line item is not under review (current: ${lineItem.status})`);

    const approvedAmount = decision === 'approved' ? lineItem.billedAmount : 0;
    const lineItemStatus = decision === 'approved' ? 'covered' : 'denied';
    const description =
      decision === 'approved'
        ? 'Manually approved by ops after review. Full billed amount approved.'
        : 'Manually denied by ops after review.';

    await deactivateResults(lineItemId, anyTx);
    await createAdjudicationResult(
      {
        lineItemId,
        approvedAmount,
        deductibleAppliedAmount: 0,
        reductionReasons: [],
        explanationSteps: [
          { rule: 'MANUAL_REVIEW', description, amountBefore: lineItem.billedAmount, amountAfter: approvedAmount },
        ],
        trigger: 'manual_review',
      },
      anyTx
    );
    await updateLineItemStatus(lineItemId, lineItemStatus as any, anyTx);

    const allLineItems = await getLineItemsByClaimId(lineItem.claimId, anyTx);
    const newStatus = deriveClaimStatus(allLineItems.map((li) => li.status));
    await updateClaimStatus(lineItem.claimId, newStatus, anyTx);
  });
}

export async function adjudicateClaim(claimId: string, trigger: AdjudicationTrigger): Promise<void> {
  await db.transaction(async (tx) => {
    const anyTx = tx as unknown as typeof db;

    const claim = await getClaim(claimId, anyTx);
    if (!claim) throw new DomainError('CLAIM_NOT_FOUND');

    assertCanFlagForReview(claim.status as any);

    const lineItems = await getLineItemsByClaimId(claimId, anyTx);
    const rules = await getCoverageRules(claim.policyId, anyTx);

    for (const li of lineItems.filter((li) => li.status === 'pending' || li.status === 'needs_review')) {
      const filteredRules = rules.filter((r) => r.serviceType === li.serviceType);
      const year = new Date(li.serviceDate).getFullYear();
      const priorUsage = await computePriorUsage(claim.memberId, li.serviceType as ServiceType, year, anyTx);
      const output = adjudicate(li, filteredRules, priorUsage);

      if (output.outcome === 'complete') {
        await deactivateResults(li.id, anyTx);
        await createAdjudicationResult(
          {
            lineItemId: li.id,
            approvedAmount: output.approvedAmount,
            deductibleAppliedAmount: output.deductibleAppliedAmount,
            reductionReasons: output.reductionReasons,
            explanationSteps: output.explanationSteps,
            trigger,
          },
          anyTx
        );
        await updateLineItemStatus(li.id, output.lineItemStatus, anyTx);
      } else {
        await updateLineItemStatus(li.id, 'needs_review', anyTx);
      }
    }

    const updatedItems = await getLineItemsByClaimId(claimId, anyTx);
    const newStatus = deriveClaimStatus(updatedItems.map((li) => li.status));
    await updateClaimStatus(claimId, newStatus, anyTx);
  });
}
