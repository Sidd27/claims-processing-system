const BASE = '/api/v1'

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message ?? 'Request failed')
  return data as T
}

export const api = {
  getMembers: () => req<Member[]>('GET', '/members'),
  getClaims: () => req<Claim[]>('GET', '/claims'),
  getClaim: (id: string) => req<ClaimDetail>('GET', `/claims/${id}`),
  submitClaim: (body: SubmitClaimBody) => req<ClaimDetail>('POST', '/claims', body),
  payClaim: (id: string) => req<Claim>('POST', `/claims/${id}/pay`),
  adjudicateClaim: (id: string) => req<Claim>('POST', `/claims/${id}/adjudicate`),
  openDispute: (claimId: string, lineItemId: string, memberReason: string) =>
    req<Dispute>('POST', `/claims/${claimId}/line-items/${lineItemId}/dispute`, { memberReason }),
  resolveDispute: (id: string, resolution: 'upheld' | 'overturned', resolverNote: string) =>
    req<Dispute>('POST', `/disputes/${id}/resolve`, { resolution, resolverNote })
}

export interface Member {
  id: string
  externalMemberId: string
  name: string
  dateOfBirth: string
}

export interface Claim {
  id: string
  memberId: string
  policyId: string
  providerName: string
  providerNpi: string
  diagnosisCode: string
  status: string
  submittedAt: string
}

export interface AdjudicationResult {
  id: string
  lineItemId: string
  approvedAmountCents: number
  deductibleAppliedCents: number
  reductionReasons: string[]
  explanationSteps: { rule: string; description: string; amountBefore: number; amountAfter: number }[]
  isActive: boolean
  trigger: string
  adjudicatedAt: string
}

export interface LineItemWithResult {
  id: string
  claimId: string
  serviceType: string
  cptCode: string
  description: string
  serviceDate: string
  billedAmountCents: number
  status: string
  adjudicationResult: AdjudicationResult | null
}

export interface ClaimDetail {
  claim: Claim
  lineItems: LineItemWithResult[]
}

export interface Dispute {
  id: string
  lineItemId: string
  memberReason: string
  status: string
  resolution: string | null
  resolverNote: string | null
  resolvedAt: string | null
  createdAt: string
}

export interface LineItemInput {
  serviceType: string
  cptCode: string
  description: string
  serviceDate: string
  billedAmountCents: number
}

export interface SubmitClaimBody {
  memberId: string
  providerName: string
  providerNpi: string
  diagnosisCode: string
  lineItems: LineItemInput[]
}
