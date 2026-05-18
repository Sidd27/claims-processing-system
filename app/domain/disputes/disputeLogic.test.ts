import { describe, it, expect } from 'vitest'
import { assertCanOpenDispute, assertDisputeNotAlreadyResolved } from './disputeLogic'
import { DomainError } from '../errors'

describe('assertCanOpenDispute', () => {
  it('allows dispute when claim is approved', () => {
    expect(() => assertCanOpenDispute('approved')).not.toThrow()
  })

  it('allows dispute when claim is partially_approved', () => {
    expect(() => assertCanOpenDispute('partially_approved')).not.toThrow()
  })

  it('allows dispute when claim is denied', () => {
    expect(() => assertCanOpenDispute('denied')).not.toThrow()
  })

  it('throws CLAIM_IS_PAID_TERMINAL when claim is paid', () => {
    expect(() => assertCanOpenDispute('paid')).toThrow('CLAIM_IS_PAID_TERMINAL')
  })

  it('throws CLAIM_NOT_DISPUTABLE when claim is submitted', () => {
    expect(() => assertCanOpenDispute('submitted')).toThrow('CLAIM_NOT_DISPUTABLE')
  })

  it('throws CLAIM_NOT_DISPUTABLE when claim is under_review', () => {
    expect(() => assertCanOpenDispute('under_review')).toThrow('CLAIM_NOT_DISPUTABLE')
  })

  it('throws CLAIM_NOT_DISPUTABLE when claim is already disputed — resolve current dispute first', () => {
    expect(() => assertCanOpenDispute('disputed')).toThrow('CLAIM_NOT_DISPUTABLE')
  })
})

describe('assertDisputeNotAlreadyResolved', () => {
  it('allows resolution when dispute is open', () => {
    expect(() => assertDisputeNotAlreadyResolved('open')).not.toThrow()
  })

  it('throws DISPUTE_ALREADY_RESOLVED when dispute is already resolved', () => {
    expect(() => assertDisputeNotAlreadyResolved('resolved')).toThrow('DISPUTE_ALREADY_RESOLVED')
  })
})
