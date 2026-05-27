export const SERVICE_TYPES = ['MEDICAL', 'DENTAL', 'VISION', 'MENTAL_HEALTH', 'PRESCRIPTION'] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export type CoverageRuleConfig =
  | { type: 'NOT_COVERED' }
  | { type: 'COINSURANCE'; coveragePercent: number }
  | { type: 'DEDUCTIBLE'; deductibleAmount: number }
  | { type: 'ANNUAL_LIMIT'; limitAmount: number }
  | { type: 'PER_CLAIM_CAP'; capAmount: number }
  | { type: 'REVIEW_THRESHOLD'; thresholdAmount: number };

export interface CoverageRule {
  id: string;
  policyId: string;
  serviceType: ServiceType;
  ruleType: CoverageRuleConfig['type'];
  config: CoverageRuleConfig;
}

export interface Policy {
  id: string;
  memberId: string;
  planId: string | null;
  planName: string;
  effectiveDate: string;
  termDate: string | null;
}

export interface Plan {
  id: string;
  planCode: string;
  name: string;
  description: string | null;
}

export interface PlanCoverageRule {
  id: string;
  planId: string;
  serviceType: ServiceType;
  ruleType: CoverageRuleConfig['type'];
  config: CoverageRuleConfig;
}
