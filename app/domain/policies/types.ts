export const SERVICE_TYPES = ['MEDICAL', 'DENTAL', 'VISION', 'MENTAL_HEALTH', 'PRESCRIPTION'] as const
export type ServiceType = typeof SERVICE_TYPES[number]

export type CoverageRuleConfig =
  | { type: 'NOT_COVERED' }
  | { type: 'COINSURANCE';      coveragePercent: number }
  | { type: 'DEDUCTIBLE';       deductibleCents: number }
  | { type: 'ANNUAL_LIMIT';     limitCents: number }
  | { type: 'PER_CLAIM_CAP';    capCents: number }
  | { type: 'REVIEW_THRESHOLD'; thresholdCents: number }

export interface CoverageRule {
  id: string
  policyId: string
  serviceType: ServiceType
  ruleType: CoverageRuleConfig['type']
  config: CoverageRuleConfig
}

export interface Policy {
  id: string
  memberId: string
  planName: string
  effectiveDate: string
  termDate: string | null
}
