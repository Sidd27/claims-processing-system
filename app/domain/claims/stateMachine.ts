import { DomainError } from '../errors';
import type { ClaimStatus, LineItemStatus } from './types';

const TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  submitted: ['under_review', 'approved', 'partially_approved', 'denied'],
  under_review: ['approved', 'partially_approved', 'denied'],
  approved: ['paid'],
  partially_approved: ['paid', 'disputed'],
  denied: ['disputed'],
  paid: [],
  disputed: ['approved', 'partially_approved', 'denied'],
};

export const DISPUTABLE_STATES: ClaimStatus[] = ['partially_approved', 'denied'];
export const PAYABLE_STATES: ClaimStatus[] = ['approved', 'partially_approved'];

export function deriveClaimStatus(statuses: LineItemStatus[]): ClaimStatus {
  if (statuses.length === 0)
    throw new DomainError('CLAIM_HAS_NO_LINE_ITEMS', 'A claim must have at least one line item');
  if (statuses.some((s) => s === 'pending'))
    throw new DomainError(
      'LINE_ITEMS_NOT_YET_ADJUDICATED',
      'All line items must be adjudicated before deriving claim status'
    );
  if (statuses.some((s) => s === 'needs_review')) return 'under_review';
  if (statuses.every((s) => s === 'denied')) return 'denied';
  if (statuses.every((s) => s === 'covered')) return 'approved';
  return 'partially_approved';
}

export function assertValidTransition(from: ClaimStatus, to: ClaimStatus): void {
  const allowed = TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new DomainError(`INVALID_TRANSITION`, `Cannot transition from '${from}' to '${to}'`);
  }
}

export function assertCanFlagForReview(claimStatus: ClaimStatus): void {
  if (claimStatus === 'paid')
    throw new DomainError('CLAIM_IS_PAID_TERMINAL', 'Claim has been paid and cannot be modified');
}
