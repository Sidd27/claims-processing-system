import { DomainError } from '../errors'
import { DISPUTABLE_STATES } from '../claims/stateMachine'
import type { ClaimStatus } from '../claims/types'
import type { DisputeStatus } from './types'

export function assertCanOpenDispute(claimStatus: ClaimStatus): void {
  if (claimStatus === 'paid') throw new DomainError('CLAIM_IS_PAID_TERMINAL')
  if (!DISPUTABLE_STATES.includes(claimStatus)) throw new DomainError('CLAIM_NOT_DISPUTABLE')
}

export function assertDisputeNotAlreadyResolved(disputeStatus: DisputeStatus): void {
  if (disputeStatus === 'resolved') throw new DomainError('DISPUTE_ALREADY_RESOLVED')
}
