export type ReductionReason =
  | 'NOT_COVERED'
  | 'DEDUCTIBLE_APPLIED'
  | 'PER_CLAIM_CAP'
  | 'ANNUAL_LIMIT_PARTIAL'
  | 'ANNUAL_LIMIT_EXHAUSTED';

export type ReviewTrigger = 'AMOUNT_THRESHOLD_EXCEEDED';

export type AdjudicationTrigger = 'initial_submission' | 'dispute_overturn' | 'manual_review';

export interface ExplanationStep {
  rule: string;
  description: string;
  amountBefore: number;
  amountAfter: number;
}

export type AdjudicationOutput =
  | {
      outcome: 'complete';
      approvedAmount: number;
      deductibleAppliedAmount: number;
      lineItemStatus: 'covered' | 'partially_covered' | 'denied';
      reductionReasons: ReductionReason[];
      explanationSteps: ExplanationStep[];
    }
  | {
      outcome: 'needs_review';
      trigger: ReviewTrigger;
      explanationSteps: ExplanationStep[];
    };

export interface PriorUsage {
  deductiblePaidAmount: number;
  annualUsageAmount: number;
}
