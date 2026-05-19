import { describe, it, expect } from 'vitest';
import { deriveClaimStatus, assertValidTransition, assertCanFlagForReview } from './stateMachine';
import { DISPUTABLE_STATES, PAYABLE_STATES } from '../constants';
import { DomainError } from '../errors';

function catchCode(fn: () => void): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  throw new Error('Expected DomainError to be thrown');
}

describe('deriveClaimStatus', () => {
  it('derives approved when all line items are covered', () => {
    expect(deriveClaimStatus(['covered', 'covered'])).toBe('approved');
  });

  it('derives denied when all line items are denied', () => {
    expect(deriveClaimStatus(['denied', 'denied'])).toBe('denied');
  });

  it('derives partially_approved when line items are mixed covered and denied', () => {
    expect(deriveClaimStatus(['covered', 'denied'])).toBe('partially_approved');
  });

  it('derives partially_approved when any line item is partially_covered', () => {
    expect(deriveClaimStatus(['covered', 'partially_covered'])).toBe('partially_approved');
  });

  it('derives partially_approved when all line items are partially_covered', () => {
    expect(deriveClaimStatus(['partially_covered', 'partially_covered'])).toBe('partially_approved');
  });

  it('derives under_review when any line item is needs_review', () => {
    expect(deriveClaimStatus(['covered', 'needs_review', 'denied'])).toBe('under_review');
  });

  it('under_review takes precedence over all other statuses', () => {
    expect(deriveClaimStatus(['needs_review', 'denied', 'denied'])).toBe('under_review');
  });

  it('throws CLAIM_HAS_NO_LINE_ITEMS when statuses array is empty', () => {
    expect(catchCode(() => deriveClaimStatus([]))).toBe('CLAIM_HAS_NO_LINE_ITEMS');
  });

  it('throws LINE_ITEMS_NOT_YET_ADJUDICATED when any line item is still pending', () => {
    expect(catchCode(() => deriveClaimStatus(['pending', 'pending']))).toBe('LINE_ITEMS_NOT_YET_ADJUDICATED');
  });

  it('throws LINE_ITEMS_NOT_YET_ADJUDICATED when pending is mixed with adjudicated statuses', () => {
    expect(catchCode(() => deriveClaimStatus(['covered', 'pending']))).toBe('LINE_ITEMS_NOT_YET_ADJUDICATED');
  });
});

describe('assertValidTransition', () => {
  it('allows submitted → under_review', () => {
    expect(() => assertValidTransition('submitted', 'under_review')).not.toThrow();
  });

  it('allows submitted → approved', () => {
    expect(() => assertValidTransition('submitted', 'approved')).not.toThrow();
  });

  it('allows approved → paid', () => {
    expect(() => assertValidTransition('approved', 'paid')).not.toThrow();
  });

  it('rejects approved → disputed', () => {
    expect(() => assertValidTransition('approved', 'disputed')).toThrow(DomainError);
  });

  it('rejects paid → disputed', () => {
    expect(() => assertValidTransition('paid', 'disputed')).toThrow(DomainError);
  });

  it('rejects paid → under_review', () => {
    expect(() => assertValidTransition('paid', 'under_review')).toThrow(DomainError);
  });

  it('rejects submitted → paid (skipping steps)', () => {
    expect(() => assertValidTransition('submitted', 'paid')).toThrow(DomainError);
  });
});

describe('assertCanFlagForReview', () => {
  it('allows flagging when claim is approved', () => {
    expect(() => assertCanFlagForReview('approved')).not.toThrow();
  });

  it('allows flagging when claim is denied', () => {
    expect(() => assertCanFlagForReview('denied')).not.toThrow();
  });

  it('throws CLAIM_IS_PAID_TERMINAL when claim is paid', () => {
    expect(catchCode(() => assertCanFlagForReview('paid'))).toBe('CLAIM_IS_PAID_TERMINAL');
  });
});

describe('DISPUTABLE_STATES and PAYABLE_STATES', () => {
  it('DISPUTABLE_STATES includes partially_approved and denied only', () => {
    expect(DISPUTABLE_STATES).not.toContain('approved');
    expect(DISPUTABLE_STATES).toContain('partially_approved');
    expect(DISPUTABLE_STATES).toContain('denied');
    expect(DISPUTABLE_STATES).not.toContain('paid');
  });

  it('PAYABLE_STATES includes approved and partially_approved only', () => {
    expect(PAYABLE_STATES).toContain('approved');
    expect(PAYABLE_STATES).toContain('partially_approved');
    expect(PAYABLE_STATES).not.toContain('denied');
    expect(PAYABLE_STATES).not.toContain('paid');
  });
});
