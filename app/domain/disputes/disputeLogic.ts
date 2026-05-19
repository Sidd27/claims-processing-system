import { DomainError } from '../errors';
import { DISPUTABLE_STATES } from '../constants';
import type { ClaimStatus } from '../claims/types';
import type { DisputeStatus } from './types';

export function assertCanOpenDispute(claimStatus: ClaimStatus): void {
  if (!DISPUTABLE_STATES.includes(claimStatus))
    throw new DomainError(
      'CLAIM_NOT_DISPUTABLE',
      `Claim must be in partially_approved or denied status to open a dispute (current: ${claimStatus})`
    );
}

export function assertDisputeNotAlreadyResolved(disputeStatus: DisputeStatus): void {
  if (disputeStatus === 'resolved')
    throw new DomainError('DISPUTE_ALREADY_RESOLVED', 'This dispute has already been resolved');
}
