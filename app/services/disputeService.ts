import { db } from '../db/client'
import { getClaim, updateClaimStatus } from '../db/repositories/claims'
import { getLineItem, getLineItemsByClaimId, updateLineItemStatus } from '../db/repositories/lineItems'
import { createDispute, getDispute, getDisputesByLineItemId, markDisputeResolved } from '../db/repositories/disputes'
import { deactivateResults, createAdjudicationResult } from '../db/repositories/adjudicationResults'
import { assertCanOpenDispute, assertDisputeNotAlreadyResolved } from '../domain/disputes/disputeLogic'
import { deriveClaimStatus } from '../domain/claims/stateMachine'
import { DomainError } from '../domain/errors'
import type { DisputeResolution } from '../domain/disputes/types'

export async function openDispute(lineItemId: string, memberReason: string) {
  const lineItem = await getLineItem(lineItemId)
  if (!lineItem) throw new DomainError('LINE_ITEM_NOT_FOUND')

  const claim = await getClaim(lineItem.claimId)
  if (!claim) throw new DomainError('CLAIM_NOT_FOUND')

  assertCanOpenDispute(claim.status as any)

  const existingDisputes = await getDisputesByLineItemId(lineItemId)
  if (existingDisputes.some(d => d.status === 'open')) {
    throw new DomainError('DISPUTE_ALREADY_OPEN')
  }

  const dispute = await createDispute(lineItemId, memberReason)
  await updateClaimStatus(claim.id, 'disputed')

  return dispute
}

export async function resolveDispute(
  disputeId: string,
  resolution: DisputeResolution,
  resolverNote: string
) {
  await db.transaction(async (tx) => {
    const anyTx = tx as unknown as typeof db

    const dispute = await getDispute(disputeId, anyTx)
    if (!dispute) throw new DomainError('DISPUTE_NOT_FOUND')

    assertDisputeNotAlreadyResolved(dispute.status)

    const lineItem = await getLineItem(dispute.lineItemId, anyTx)
    if (!lineItem) throw new DomainError('LINE_ITEM_NOT_FOUND')

    const claim = await getClaim(lineItem.claimId, anyTx)
    if (!claim) throw new DomainError('CLAIM_NOT_FOUND')

    if (resolution === 'overturned') {
      await deactivateResults(lineItem.id, anyTx)
      await createAdjudicationResult({
        lineItemId: lineItem.id,
        approvedAmountCents: lineItem.billedAmountCents,
        deductibleAppliedCents: 0,
        reductionReasons: [],
        explanationSteps: [{
          rule: 'DISPUTE_OVERTURN',
          description: `Dispute resolved in member's favor. Full billed amount approved.`,
          amountBefore: lineItem.billedAmountCents,
          amountAfter: lineItem.billedAmountCents
        }],
        trigger: 'dispute_overturn'
      }, anyTx)
      await updateLineItemStatus(lineItem.id, 'covered', anyTx)
    }

    await markDisputeResolved(disputeId, resolution, resolverNote, anyTx)

    const allLineItems = await getLineItemsByClaimId(claim.id, anyTx)
    const newClaimStatus = deriveClaimStatus(allLineItems.map(li => li.status))
    await updateClaimStatus(claim.id, newClaimStatus, anyTx)
  })

  return getDispute(disputeId)
}
