import { describe, it, expect } from 'vitest';
import { adjudicate } from './adjudicator';
import type { ClaimLineItem } from '../claims/types';
import type { CoverageRule } from '../policies/types';
import type { PriorUsage } from './types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeLineItem(overrides: Partial<ClaimLineItem> = {}): ClaimLineItem {
  return {
    id: 'li-1',
    claimId: 'claim-1',
    serviceType: 'MEDICAL',
    cptCode: '99213',
    description: 'Office Visit',
    serviceDate: '2026-01-15',
    billedAmountCents: 10000, // $100
    status: 'pending',
    ...overrides,
  };
}

function makeRule(
  config: CoverageRule['config'],
  serviceType: CoverageRule['serviceType'] = 'MEDICAL'
): CoverageRule {
  return { id: 'r-1', policyId: 'p-1', serviceType, ruleType: config.type, config };
}

const zeroPrior: PriorUsage = { deductiblePaidCents: 0, annualUsageCents: 0 };

// ── NOT_COVERED ───────────────────────────────────────────────────────────────

describe('NOT_COVERED', () => {
  it('returns denied with no approved amount', () => {
    const result = adjudicate(makeLineItem(), [makeRule({ type: 'NOT_COVERED' })], zeroPrior);
    expect(result.outcome).toBe('complete');
    if (result.outcome !== 'complete') return;
    expect(result.lineItemStatus).toBe('denied');
    expect(result.approvedAmountCents).toBe(0);
    expect(result.reductionReasons).toContain('NOT_COVERED');
  });

  it('short-circuits — no further steps after NOT_COVERED', () => {
    const result = adjudicate(
      makeLineItem(),
      [makeRule({ type: 'NOT_COVERED' }), makeRule({ type: 'COINSURANCE', coveragePercent: 0.8 })],
      zeroPrior
    );
    if (result.outcome !== 'complete') return;
    expect(result.explanationSteps).toHaveLength(1);
    expect(result.explanationSteps[0].rule).toBe('NOT_COVERED');
  });
});

// ── REVIEW_THRESHOLD ──────────────────────────────────────────────────────────

describe('REVIEW_THRESHOLD', () => {
  it('returns needs_review when billed exceeds threshold', () => {
    const result = adjudicate(
      makeLineItem({ billedAmountCents: 60000 }),
      [makeRule({ type: 'REVIEW_THRESHOLD', thresholdCents: 50000 })],
      zeroPrior
    );
    expect(result.outcome).toBe('needs_review');
    if (result.outcome !== 'needs_review') return;
    expect(result.trigger).toBe('AMOUNT_THRESHOLD_EXCEEDED');
  });

  it('does not trigger review when billed equals threshold', () => {
    const result = adjudicate(
      makeLineItem({ billedAmountCents: 50000 }),
      [
        makeRule({ type: 'REVIEW_THRESHOLD', thresholdCents: 50000 }),
        makeRule({ type: 'COINSURANCE', coveragePercent: 0.8 }),
      ],
      zeroPrior
    );
    expect(result.outcome).toBe('complete');
  });

  it('does not carry approvedAmountCents on needs_review output', () => {
    const result = adjudicate(
      makeLineItem({ billedAmountCents: 60000 }),
      [makeRule({ type: 'REVIEW_THRESHOLD', thresholdCents: 50000 })],
      zeroPrior
    );
    expect(result.outcome).toBe('needs_review');
    // TypeScript structurally prevents accessing approvedAmountCents here
    expect('approvedAmountCents' in result).toBe(false);
  });
});

// ── COINSURANCE ───────────────────────────────────────────────────────────────

describe('COINSURANCE', () => {
  it('returns covered when only coinsurance reduces amount — contractual, not partial', () => {
    const result = adjudicate(
      makeLineItem({ billedAmountCents: 10000 }),
      [makeRule({ type: 'COINSURANCE', coveragePercent: 0.8 })],
      zeroPrior
    );
    expect(result.outcome).toBe('complete');
    if (result.outcome !== 'complete') return;
    expect(result.lineItemStatus).toBe('covered');
    expect(result.approvedAmountCents).toBe(8000);
    expect(result.reductionReasons).toHaveLength(0);
  });

  it('returns covered for full 100% coverage', () => {
    const result = adjudicate(
      makeLineItem({ billedAmountCents: 10000 }),
      [makeRule({ type: 'COINSURANCE', coveragePercent: 1.0 })],
      zeroPrior
    );
    if (result.outcome !== 'complete') return;
    expect(result.lineItemStatus).toBe('covered');
    expect(result.approvedAmountCents).toBe(10000);
  });
});

// ── DEDUCTIBLE ────────────────────────────────────────────────────────────────

describe('DEDUCTIBLE', () => {
  it('applies deductible before coinsurance and marks partially_covered', () => {
    const result = adjudicate(
      makeLineItem({ billedAmountCents: 20000 }), // $200
      [
        makeRule({ type: 'DEDUCTIBLE', deductibleCents: 10000 }), // $100 deductible
        makeRule({ type: 'COINSURANCE', coveragePercent: 0.8 }),
      ],
      zeroPrior
    );
    expect(result.outcome).toBe('complete');
    if (result.outcome !== 'complete') return;
    // $200 - $100 deductible = $100, then $100 * 80% = $80
    expect(result.approvedAmountCents).toBe(8000);
    expect(result.lineItemStatus).toBe('partially_covered');
    expect(result.reductionReasons).toContain('DEDUCTIBLE_APPLIED');
  });

  it('skips deductible step when deductible is already fully met', () => {
    const result = adjudicate(
      makeLineItem({ billedAmountCents: 10000 }),
      [
        makeRule({ type: 'DEDUCTIBLE', deductibleCents: 50000 }),
        makeRule({ type: 'COINSURANCE', coveragePercent: 0.8 }),
      ],
      { deductiblePaidCents: 50000, annualUsageCents: 0 } // fully met
    );
    if (result.outcome !== 'complete') return;
    expect(result.lineItemStatus).toBe('covered');
    expect(result.approvedAmountCents).toBe(8000);
    expect(result.reductionReasons).not.toContain('DEDUCTIBLE_APPLIED');
  });

  it('returns denied when deductible consumes the entire billed amount', () => {
    const result = adjudicate(
      makeLineItem({ billedAmountCents: 10000 }), // $100
      [makeRule({ type: 'DEDUCTIBLE', deductibleCents: 50000 })], // $500 deductible, none met
      zeroPrior
    );
    if (result.outcome !== 'complete') return;
    expect(result.lineItemStatus).toBe('denied');
    expect(result.approvedAmountCents).toBe(0);
    expect(result.reductionReasons).toContain('DEDUCTIBLE_APPLIED');
  });
});

// ── ANNUAL_LIMIT ──────────────────────────────────────────────────────────────

describe('ANNUAL_LIMIT', () => {
  it('marks partially_covered when annual limit partially reduces amount', () => {
    const result = adjudicate(
      makeLineItem({ billedAmountCents: 20000, serviceType: 'MENTAL_HEALTH' }), // $200
      [makeRule({ type: 'ANNUAL_LIMIT', limitCents: 50000 }, 'MENTAL_HEALTH')], // $500 limit
      { deductiblePaidCents: 0, annualUsageCents: 40000 } // $400 used, $100 remaining
    );
    if (result.outcome !== 'complete') return;
    expect(result.lineItemStatus).toBe('partially_covered');
    expect(result.approvedAmountCents).toBe(10000); // $100 remaining
    expect(result.reductionReasons).toContain('ANNUAL_LIMIT_PARTIAL');
  });

  it('marks denied when annual limit is fully exhausted', () => {
    const result = adjudicate(
      makeLineItem({ billedAmountCents: 10000, serviceType: 'MENTAL_HEALTH' }),
      [makeRule({ type: 'ANNUAL_LIMIT', limitCents: 50000 }, 'MENTAL_HEALTH')],
      { deductiblePaidCents: 0, annualUsageCents: 50000 } // fully exhausted
    );
    if (result.outcome !== 'complete') return;
    expect(result.lineItemStatus).toBe('denied');
    expect(result.approvedAmountCents).toBe(0);
    expect(result.reductionReasons).toContain('ANNUAL_LIMIT_EXHAUSTED');
  });

  it('does not reduce amount when usage is below limit', () => {
    const result = adjudicate(
      makeLineItem({ billedAmountCents: 10000, serviceType: 'MENTAL_HEALTH' }),
      [makeRule({ type: 'ANNUAL_LIMIT', limitCents: 50000 }, 'MENTAL_HEALTH')],
      { deductiblePaidCents: 0, annualUsageCents: 0 }
    );
    if (result.outcome !== 'complete') return;
    expect(result.approvedAmountCents).toBe(10000);
    expect(result.reductionReasons).not.toContain('ANNUAL_LIMIT_PARTIAL');
  });
});

// ── PER_CLAIM_CAP ─────────────────────────────────────────────────────────────

describe('PER_CLAIM_CAP', () => {
  it('caps approved amount and marks partially_covered', () => {
    const result = adjudicate(
      makeLineItem({ billedAmountCents: 30000, serviceType: 'DENTAL' }), // $300
      [makeRule({ type: 'PER_CLAIM_CAP', capCents: 20000 }, 'DENTAL')], // $200 cap
      zeroPrior
    );
    if (result.outcome !== 'complete') return;
    expect(result.lineItemStatus).toBe('partially_covered');
    expect(result.approvedAmountCents).toBe(20000);
    expect(result.reductionReasons).toContain('PER_CLAIM_CAP');
  });

  it('does not cap when billed amount is under the cap', () => {
    const result = adjudicate(
      makeLineItem({ billedAmountCents: 10000, serviceType: 'DENTAL' }),
      [makeRule({ type: 'PER_CLAIM_CAP', capCents: 20000 }, 'DENTAL')],
      zeroPrior
    );
    if (result.outcome !== 'complete') return;
    expect(result.approvedAmountCents).toBe(10000);
    expect(result.reductionReasons).not.toContain('PER_CLAIM_CAP');
  });
});

// ── No rules ─────────────────────────────────────────────────────────────────

describe('no matching rules', () => {
  it('approves full billed amount when no rules match', () => {
    const result = adjudicate(makeLineItem(), [], zeroPrior);
    if (result.outcome !== 'complete') return;
    expect(result.lineItemStatus).toBe('covered');
    expect(result.approvedAmountCents).toBe(10000);
    expect(result.reductionReasons).toHaveLength(0);
  });
});

// ── Explanation integrity ─────────────────────────────────────────────────────

describe('explanation step ordering and consistency', () => {
  it('explanation steps appear in pipeline order: DEDUCTIBLE before COINSURANCE before ANNUAL_LIMIT', () => {
    // Set up so all three steps fire
    const result = adjudicate(
      makeLineItem({ billedAmountCents: 50000 }), // $500
      [
        makeRule({ type: 'DEDUCTIBLE', deductibleCents: 5000 }), // $50 remaining deductible
        makeRule({ type: 'COINSURANCE', coveragePercent: 0.8 }),
        makeRule({ type: 'ANNUAL_LIMIT', limitCents: 20000 }), // $200 limit, $150 used → $50 remaining
      ],
      { deductiblePaidCents: 0, annualUsageCents: 15000 }
    );
    expect(result.outcome).toBe('complete');
    if (result.outcome !== 'complete') return;

    const rules = result.explanationSteps.map((s) => s.rule);
    const dIdx = rules.indexOf('DEDUCTIBLE');
    const cIdx = rules.indexOf('COINSURANCE');
    const aIdx = rules.indexOf('ANNUAL_LIMIT');

    expect(dIdx).toBeGreaterThanOrEqual(0);
    expect(cIdx).toBeGreaterThan(dIdx);
    expect(aIdx).toBeGreaterThan(cIdx);
  });

  it('amountAfter of step N equals amountBefore of step N+1', () => {
    const result = adjudicate(
      makeLineItem({ billedAmountCents: 50000 }),
      [
        makeRule({ type: 'DEDUCTIBLE', deductibleCents: 5000 }),
        makeRule({ type: 'COINSURANCE', coveragePercent: 0.8 }),
        makeRule({ type: 'ANNUAL_LIMIT', limitCents: 20000 }),
      ],
      { deductiblePaidCents: 0, annualUsageCents: 15000 }
    );
    if (result.outcome !== 'complete') return;

    const steps = result.explanationSteps;
    for (let i = 0; i < steps.length - 1; i++) {
      expect(steps[i].amountAfter).toBe(steps[i + 1].amountBefore);
    }
  });
});
