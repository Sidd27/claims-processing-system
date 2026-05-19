import { describe, it, expect } from 'vitest';
import { assertCanOpenDispute, assertDisputeNotAlreadyResolved } from './disputeLogic';
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

describe('assertCanOpenDispute', () => {
  it('throws CLAIM_NOT_DISPUTABLE when claim is approved — fully approved claims cannot be disputed', () => {
    expect(catchCode(() => assertCanOpenDispute('approved'))).toBe('CLAIM_NOT_DISPUTABLE');
  });

  it('allows dispute when claim is partially_approved', () => {
    expect(() => assertCanOpenDispute('partially_approved')).not.toThrow();
  });

  it('allows dispute when claim is denied', () => {
    expect(() => assertCanOpenDispute('denied')).not.toThrow();
  });

  it('throws CLAIM_NOT_DISPUTABLE when claim is paid', () => {
    expect(catchCode(() => assertCanOpenDispute('paid'))).toBe('CLAIM_NOT_DISPUTABLE');
  });

  it('throws CLAIM_NOT_DISPUTABLE when claim is submitted', () => {
    expect(catchCode(() => assertCanOpenDispute('submitted'))).toBe('CLAIM_NOT_DISPUTABLE');
  });

  it('throws CLAIM_NOT_DISPUTABLE when claim is under_review', () => {
    expect(catchCode(() => assertCanOpenDispute('under_review'))).toBe('CLAIM_NOT_DISPUTABLE');
  });

  it('throws CLAIM_NOT_DISPUTABLE when claim is already disputed — resolve current dispute first', () => {
    expect(catchCode(() => assertCanOpenDispute('disputed'))).toBe('CLAIM_NOT_DISPUTABLE');
  });
});

describe('assertDisputeNotAlreadyResolved', () => {
  it('allows resolution when dispute is open', () => {
    expect(() => assertDisputeNotAlreadyResolved('open')).not.toThrow();
  });

  it('throws DISPUTE_ALREADY_RESOLVED when dispute is already resolved', () => {
    expect(catchCode(() => assertDisputeNotAlreadyResolved('resolved'))).toBe('DISPUTE_ALREADY_RESOLVED');
  });
});
