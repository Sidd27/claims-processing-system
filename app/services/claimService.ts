import { db } from '../db/client';
import { getClaim, listClaims, createClaim, updateClaimStatus } from '../db/repositories/claims';
import { getLineItemsByClaimId, createLineItems } from '../db/repositories/lineItems';
import { getActivePolicy } from '../db/repositories/policies';
import { getMember } from '../db/repositories/members';
import { getActiveResult } from '../db/repositories/adjudicationResults';
import { getDisputesByLineItemId } from '../db/repositories/disputes';
import { adjudicateClaim } from './adjudicationService';
import { assertValidTransition, PAYABLE_STATES } from '../domain/claims/stateMachine';
import { DomainError } from '../domain/errors';
import type { ServiceType } from '../domain/policies/types';

export interface SubmitClaimInput {
  memberId: string;
  providerName: string;
  providerNpi: string;
  diagnosisCode: string;
  lineItems: Array<{
    serviceType: ServiceType;
    cptCode: string;
    description: string;
    serviceDate: string;
    billedAmount: number;
  }>;
}

export async function submitClaim(input: SubmitClaimInput) {
  if (input.lineItems.length === 0) throw new DomainError('CLAIM_HAS_NO_LINE_ITEMS');

  const member = await getMember(input.memberId);
  if (!member) throw new DomainError('MEMBER_NOT_FOUND');

  const policy = await getActivePolicy(input.memberId);
  if (!policy) throw new DomainError('NO_ACTIVE_POLICY');

  const claim = await createClaim({
    memberId: input.memberId,
    policyId: policy.id,
    providerName: input.providerName,
    providerNpi: input.providerNpi,
    diagnosisCode: input.diagnosisCode,
  });

  await createLineItems(
    input.lineItems.map((li) => ({
      claimId: claim.id,
      ...li,
    }))
  );

  await adjudicateClaim(claim.id, 'initial_submission');

  const updatedClaim = await getClaim(claim.id);
  const lineItems = await getLineItemsByClaimId(claim.id);

  return { claim: updatedClaim!, lineItems };
}

export async function getClaimDetail(claimId: string) {
  const claim = await getClaim(claimId);
  if (!claim) throw new DomainError('CLAIM_NOT_FOUND');

  const lineItems = await getLineItemsByClaimId(claimId);

  const lineItemsWithResults = await Promise.all(
    lineItems.map(async (li) => {
      const disputes = await getDisputesByLineItemId(li.id);
      return {
        ...li,
        adjudicationResult: await getActiveResult(li.id),
        openDispute: disputes.find((d) => d.status === 'open') ?? null,
      };
    })
  );

  return { claim, lineItems: lineItemsWithResults };
}

export async function getAllClaims() {
  return listClaims();
}

export async function markClaimPaid(claimId: string) {
  const claim = await getClaim(claimId);
  if (!claim) throw new DomainError('CLAIM_NOT_FOUND');

  if (!PAYABLE_STATES.includes(claim.status as any)) {
    throw new DomainError('CLAIM_NOT_PAYABLE', `Claim in status '${claim.status}' cannot be paid`);
  }

  assertValidTransition(claim.status as any, 'paid');
  await updateClaimStatus(claimId, 'paid');

  return getClaim(claimId);
}

export async function reAdjudicateClaim(claimId: string) {
  const claim = await getClaim(claimId);
  if (!claim) throw new DomainError('CLAIM_NOT_FOUND');

  await adjudicateClaim(claimId, 'manual_review');

  return getClaim(claimId);
}
