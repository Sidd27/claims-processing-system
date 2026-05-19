import { db } from '../db/client';
import { getClaim, updateClaimStatus } from '../db/repositories/claims';
import { getLineItemsByClaimId, updateLineItemStatus } from '../db/repositories/lineItems';
import { getCoverageRules } from '../db/repositories/policies';
import {
  createAdjudicationResult,
  deactivateResults,
} from '../db/repositories/adjudicationResults';
import { computePriorUsage } from '../db/repositories/limitUsage';
import { adjudicate } from '../domain/adjudication/adjudicator';
import { deriveClaimStatus, assertCanFlagForReview } from '../domain/claims/stateMachine';
import { DomainError } from '../domain/errors';
import type { ServiceType } from '../domain/policies/types';
import type { AdjudicationTrigger } from '../domain/adjudication/types';

export async function adjudicateClaim(
  claimId: string,
  trigger: AdjudicationTrigger
): Promise<void> {
  await db.transaction(async (tx) => {
    const anyTx = tx as unknown as typeof db;

    const claim = await getClaim(claimId, anyTx);
    if (!claim) throw new DomainError('CLAIM_NOT_FOUND');

    assertCanFlagForReview(claim.status as any);

    const lineItems = await getLineItemsByClaimId(claimId, anyTx);
    const rules = await getCoverageRules(claim.policyId, anyTx);

    for (const li of lineItems.filter(
      (li) => li.status === 'pending' || li.status === 'needs_review'
    )) {
      const filteredRules = rules.filter((r) => r.serviceType === li.serviceType);
      const year = new Date(li.serviceDate).getFullYear();
      const priorUsage = await computePriorUsage(
        claim.memberId,
        li.serviceType as ServiceType,
        year,
        anyTx
      );
      const output = adjudicate(li, filteredRules, priorUsage);

      if (output.outcome === 'complete') {
        await deactivateResults(li.id, anyTx);
        await createAdjudicationResult(
          {
            lineItemId: li.id,
            approvedAmountCents: output.approvedAmountCents,
            deductibleAppliedCents: output.deductibleAppliedCents,
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
