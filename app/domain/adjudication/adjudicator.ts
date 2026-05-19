import type { ClaimLineItem } from '../claims/types';
import type { CoverageRule } from '../policies/types';
import type { AdjudicationOutput, ExplanationStep, PriorUsage, ReductionReason } from './types';

const CAPACITY_CONSTRAINTS: ReductionReason[] = [
  'DEDUCTIBLE_APPLIED',
  'PER_CLAIM_CAP',
  'ANNUAL_LIMIT_PARTIAL',
  'ANNUAL_LIMIT_EXHAUSTED',
];

export function adjudicate(lineItem: ClaimLineItem, rules: CoverageRule[], priorUsage: PriorUsage): AdjudicationOutput {
  // Caller is responsible for passing only rules matching lineItem.serviceType

  // Step 1: NOT_COVERED (short-circuit, no math)
  if (rules.some((r) => r.config.type === 'NOT_COVERED')) {
    return {
      outcome: 'complete',
      approvedAmount: 0,
      deductibleAppliedAmount: 0,
      lineItemStatus: 'denied',
      reductionReasons: ['NOT_COVERED'],
      explanationSteps: [
        {
          rule: 'NOT_COVERED',
          description: `${lineItem.serviceType} is not covered under your plan.`,
          amountBefore: lineItem.billedAmount,
          amountAfter: 0,
        },
      ],
    };
  }

  // Step 2: REVIEW_THRESHOLD (short-circuit, no math)
  const reviewRule = rules.find((r) => r.config.type === 'REVIEW_THRESHOLD');
  if (reviewRule && reviewRule.config.type === 'REVIEW_THRESHOLD') {
    if (lineItem.billedAmount > reviewRule.config.thresholdAmount) {
      return {
        outcome: 'needs_review',
        trigger: 'AMOUNT_THRESHOLD_EXCEEDED',
        explanationSteps: [
          {
            rule: 'REVIEW_THRESHOLD',
            description: `Billed amount $${fmt(lineItem.billedAmount)} exceeds the $${fmt(reviewRule.config.thresholdAmount)} review threshold for ${lineItem.serviceType}.`,
            amountBefore: lineItem.billedAmount,
            amountAfter: lineItem.billedAmount,
          },
        ],
      };
    }
  }

  // ── Math begins ───────────────────────────────────────────────────────────
  let current = lineItem.billedAmount;
  let deductibleApplied = 0;
  const reasons: ReductionReason[] = [];
  const steps: ExplanationStep[] = [];

  // Step 3: DEDUCTIBLE
  const deductibleRule = rules.find((r) => r.config.type === 'DEDUCTIBLE');
  if (deductibleRule && deductibleRule.config.type === 'DEDUCTIBLE') {
    const remaining = deductibleRule.config.deductibleAmount - priorUsage.deductiblePaidAmount;
    if (remaining > 0) {
      const applied = Math.min(remaining, current);
      deductibleApplied = applied;
      const before = current;
      current -= applied;
      reasons.push('DEDUCTIBLE_APPLIED');
      steps.push({
        rule: 'DEDUCTIBLE',
        description: `Annual deductible: $${fmt(deductibleRule.config.deductibleAmount)}. Already met: $${fmt(priorUsage.deductiblePaidAmount)}. $${fmt(applied)} applied to remaining deductible.`,
        amountBefore: before,
        amountAfter: current,
      });
    }
  }

  // Step 4: COINSURANCE (contractual — no reduction reason added)
  const coinsuranceRule = rules.find((r) => r.config.type === 'COINSURANCE');
  if (coinsuranceRule && coinsuranceRule.config.type === 'COINSURANCE') {
    const before = current;
    current = Math.round(current * coinsuranceRule.config.coveragePercent);
    steps.push({
      rule: 'COINSURANCE',
      description: `Plan covers ${Math.round(coinsuranceRule.config.coveragePercent * 100)}% of covered expenses. Insurer pays $${fmt(current)}.`,
      amountBefore: before,
      amountAfter: current,
    });
  }

  // Step 5: PER_CLAIM_CAP
  const capRule = rules.find((r) => r.config.type === 'PER_CLAIM_CAP');
  if (capRule && capRule.config.type === 'PER_CLAIM_CAP' && current > capRule.config.capAmount) {
    const before = current;
    current = capRule.config.capAmount;
    reasons.push('PER_CLAIM_CAP');
    steps.push({
      rule: 'PER_CLAIM_CAP',
      description: `Per-claim cap for ${lineItem.serviceType}: $${fmt(capRule.config.capAmount)}. Amount capped.`,
      amountBefore: before,
      amountAfter: current,
    });
  }

  // Step 6: ANNUAL_LIMIT
  const limitRule = rules.find((r) => r.config.type === 'ANNUAL_LIMIT');
  if (limitRule && limitRule.config.type === 'ANNUAL_LIMIT') {
    const remaining = limitRule.config.limitAmount - priorUsage.annualUsageAmount;
    if (remaining <= 0) {
      const before = current;
      current = 0;
      reasons.push('ANNUAL_LIMIT_EXHAUSTED');
      steps.push({
        rule: 'ANNUAL_LIMIT',
        description: `Annual ${lineItem.serviceType} benefit of $${fmt(limitRule.config.limitAmount)} is fully exhausted. No benefit payable.`,
        amountBefore: before,
        amountAfter: 0,
      });
    } else if (remaining < current) {
      const before = current;
      current = remaining;
      reasons.push('ANNUAL_LIMIT_PARTIAL');
      steps.push({
        rule: 'ANNUAL_LIMIT',
        description: `Annual ${lineItem.serviceType} benefit: $${fmt(limitRule.config.limitAmount)}. Used: $${fmt(priorUsage.annualUsageAmount)}. Remaining: $${fmt(remaining)}. Amount limited to remaining benefit.`,
        amountBefore: before,
        amountAfter: current,
      });
    }
  }

  const lineItemStatus =
    reasons.includes('NOT_COVERED') || current === 0
      ? 'denied'
      : reasons.some((r) => CAPACITY_CONSTRAINTS.includes(r))
        ? 'partially_covered'
        : 'covered';

  return {
    outcome: 'complete',
    approvedAmount: current,
    deductibleAppliedAmount: deductibleApplied,
    lineItemStatus,
    reductionReasons: reasons,
    explanationSteps: steps,
  };
}

function fmt(amount: number): string {
  return (amount / 100).toFixed(2);
}
