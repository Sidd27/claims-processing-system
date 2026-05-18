import 'dotenv/config'
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { buildServer } from './server'
import { db, pool } from '../db/client'
import {
  disputes, adjudicationResults, claimLineItems, claims, coverageRules, policies, members
} from '../db/schema'

const app = buildServer()

async function clearDb() {
  await db.delete(disputes)
  await db.delete(adjudicationResults)
  await db.delete(claimLineItems)
  await db.delete(claims)
  await db.delete(coverageRules)
  await db.delete(policies)
  await db.delete(members)
}

interface MemberFixture {
  memberId: string
  policyId: string
}

async function createMember(rules: typeof coverageRules.$inferInsert[]): Promise<MemberFixture> {
  const [member] = await db.insert(members).values({
    externalMemberId: `TEST-${Date.now()}`,
    name: 'Test Member',
    dateOfBirth: '1990-01-01'
  }).returning()

  const [policy] = await db.insert(policies).values({
    memberId: member.id,
    planName: 'Test Plan',
    effectiveDate: '2026-01-01'
  }).returning()

  if (rules.length > 0) {
    await db.insert(coverageRules).values(rules.map(r => ({ ...r, policyId: policy.id })))
  }

  return { memberId: member.id, policyId: policy.id }
}

async function submitClaim(memberId: string, lineItems: object[]) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/claims',
    payload: {
      memberId,
      providerName: 'Test Provider',
      providerNpi: '0000000000',
      diagnosisCode: 'Z00.00',
      lineItems
    }
  })
}

beforeEach(clearDb)

afterAll(async () => {
  await app.close()
  await pool.end()
})

// ── 1. Annual limit exhaustion ────────────────────────────────────────────────

describe('annual limit exhaustion across claims', () => {
  it('three sequential claims correctly exhaust a $1,000 annual limit', async () => {
    const { memberId } = await createMember([
      { serviceType: 'MENTAL_HEALTH', ruleType: 'ANNUAL_LIMIT',  config: { type: 'ANNUAL_LIMIT', limitCents: 100000 } },
      { serviceType: 'MENTAL_HEALTH', ruleType: 'COINSURANCE',   config: { type: 'COINSURANCE', coveragePercent: 0.8 } }
    ] as any)

    // Claim 1: $600 → 80% = $480 approved (within $1,000 limit)
    const r1 = await submitClaim(memberId, [{
      serviceType: 'MENTAL_HEALTH', cptCode: '90837', description: 'Therapy',
      serviceDate: '2026-01-10', billedAmountCents: 60000
    }])
    expect(r1.statusCode).toBe(201)
    const c1 = JSON.parse(r1.body)
    expect(c1.claim.status).toBe('approved')
    expect(c1.lineItems[0].status).toBe('covered')

    // Claim 2: $800 → 80% = $640, but only $520 remaining → $520 approved (partial limit)
    const r2 = await submitClaim(memberId, [{
      serviceType: 'MENTAL_HEALTH', cptCode: '90837', description: 'Therapy',
      serviceDate: '2026-02-10', billedAmountCents: 80000
    }])
    expect(r2.statusCode).toBe(201)
    const c2 = JSON.parse(r2.body)
    expect(c2.claim.status).toBe('partially_approved')
    expect(c2.lineItems[0].status).toBe('partially_covered')

    // Claim 3: $200 → limit exhausted → denied
    const r3 = await submitClaim(memberId, [{
      serviceType: 'MENTAL_HEALTH', cptCode: '90837', description: 'Therapy',
      serviceDate: '2026-03-10', billedAmountCents: 20000
    }])
    expect(r3.statusCode).toBe(201)
    const c3 = JSON.parse(r3.body)
    expect(c3.claim.status).toBe('denied')
    expect(c3.lineItems[0].status).toBe('denied')

    // Verify final approved amounts via claim detail
    const detail2 = await app.inject({ method: 'GET', url: `/api/v1/claims/${c2.claim.id}` })
    const d2 = JSON.parse(detail2.body)
    expect(d2.lineItems[0].adjudicationResult.approvedAmountCents).toBe(52000) // $520

    const detail3 = await app.inject({ method: 'GET', url: `/api/v1/claims/${c3.claim.id}` })
    const d3 = JSON.parse(detail3.body)
    expect(d3.lineItems[0].adjudicationResult.approvedAmountCents).toBe(0)
  })
})

// ── 2. Dispute overturn re-derives claim status ───────────────────────────────

describe('dispute overturn re-derives claim status', () => {
  it('overturning a dispute on the only line item changes claim to approved', async () => {
    const { memberId } = await createMember([
      { serviceType: 'DENTAL', ruleType: 'PER_CLAIM_CAP', config: { type: 'PER_CLAIM_CAP', capCents: 20000 } },
      { serviceType: 'DENTAL', ruleType: 'COINSURANCE',   config: { type: 'COINSURANCE', coveragePercent: 0.8 } }
    ] as any)

    // Submit claim: $500 billed → capped at $200 → 80% = $160 approved → partially_approved
    const r1 = await submitClaim(memberId, [{
      serviceType: 'DENTAL', cptCode: 'D2750', description: 'Crown',
      serviceDate: '2026-04-01', billedAmountCents: 50000
    }])
    expect(r1.statusCode).toBe(201)
    const { claim, lineItems } = JSON.parse(r1.body)
    expect(claim.status).toBe('partially_approved')

    // Open dispute
    const r2 = await app.inject({
      method: 'POST',
      url: `/api/v1/claims/${claim.id}/line-items/${lineItems[0].id}/dispute`,
      payload: { memberReason: 'Cap should not apply — medically necessary procedure.' }
    })
    expect(r2.statusCode).toBe(201)
    const dispute = JSON.parse(r2.body)

    // Resolve as overturned
    const r3 = await app.inject({
      method: 'POST',
      url: `/api/v1/disputes/${dispute.id}/resolve`,
      payload: { resolution: 'overturned', resolverNote: 'Approved after clinical review.' }
    })
    expect(r3.statusCode).toBe(200)
    const resolved = JSON.parse(r3.body)
    expect(resolved.resolution).toBe('overturned')
    expect(resolved.status).toBe('resolved')

    // Claim must now be approved with full billed amount
    const detail = await app.inject({ method: 'GET', url: `/api/v1/claims/${claim.id}` })
    const d = JSON.parse(detail.body)
    expect(d.claim.status).toBe('approved')
    expect(d.lineItems[0].adjudicationResult.approvedAmountCents).toBe(50000)
  })

  it('upholding a dispute leaves claim status as partially_approved', async () => {
    const { memberId } = await createMember([
      { serviceType: 'DENTAL', ruleType: 'PER_CLAIM_CAP', config: { type: 'PER_CLAIM_CAP', capCents: 20000 } }
    ] as any)

    const r1 = await submitClaim(memberId, [{
      serviceType: 'DENTAL', cptCode: 'D2750', description: 'Crown',
      serviceDate: '2026-04-01', billedAmountCents: 50000
    }])
    const { claim, lineItems } = JSON.parse(r1.body)

    const r2 = await app.inject({
      method: 'POST',
      url: `/api/v1/claims/${claim.id}/line-items/${lineItems[0].id}/dispute`,
      payload: { memberReason: 'I disagree with the cap.' }
    })
    const dispute = JSON.parse(r2.body)

    await app.inject({
      method: 'POST',
      url: `/api/v1/disputes/${dispute.id}/resolve`,
      payload: { resolution: 'upheld', resolverNote: 'Cap correctly applied per plan terms.' }
    })

    const detail = await app.inject({ method: 'GET', url: `/api/v1/claims/${claim.id}` })
    const d = JSON.parse(detail.body)
    expect(d.claim.status).toBe('partially_approved')
  })
})

// ── 3. Only committed (isActive) results count toward prior usage ─────────────

describe('prior usage reflects only active adjudication results', () => {
  it('deactivated results are excluded from the annual limit calculation', async () => {
    const { memberId } = await createMember([
      { serviceType: 'MENTAL_HEALTH', ruleType: 'ANNUAL_LIMIT', config: { type: 'ANNUAL_LIMIT', limitCents: 100000 } }
    ] as any)

    // Submit a claim to create an active result
    const r1 = await submitClaim(memberId, [{
      serviceType: 'MENTAL_HEALTH', cptCode: '90837', description: 'Therapy',
      serviceDate: '2026-01-10', billedAmountCents: 80000
    }])
    const c1 = JSON.parse(r1.body)
    expect(c1.claim.status).toBe('approved') // $800 within $1,000 limit

    // Manually deactivate that result (simulates a re-adjudication pass)
    const lineItemId = c1.lineItems[0].id
    await db.update(adjudicationResults)
      .set({ isActive: false })
      .where(eq(adjudicationResults.lineItemId, lineItemId))

    // Now submit a second claim — should see $0 prior usage (deactivated result ignored)
    const r2 = await submitClaim(memberId, [{
      serviceType: 'MENTAL_HEALTH', cptCode: '90837', description: 'Therapy',
      serviceDate: '2026-02-10', billedAmountCents: 100000
    }])
    const c2 = JSON.parse(r2.body)
    // With $0 prior usage, $1,000 billed = $1,000 approved (within $1,000 limit)
    expect(c2.claim.status).toBe('approved')
    expect(c2.lineItems[0].status).toBe('covered')

    const detail = await app.inject({ method: 'GET', url: `/api/v1/claims/${c2.claim.id}` })
    const d = JSON.parse(detail.body)
    expect(d.lineItems[0].adjudicationResult.approvedAmountCents).toBe(100000)
  })
})

// ── 4. Multi-line-item claim with mixed outcomes ──────────────────────────────

describe('multi-line-item claim with mixed adjudication outcomes', () => {
  it('derives partially_approved when one line item is covered and another is denied', async () => {
    const { memberId } = await createMember([
      { serviceType: 'MEDICAL', ruleType: 'COINSURANCE', config: { type: 'COINSURANCE', coveragePercent: 0.8 } },
      { serviceType: 'VISION',  ruleType: 'NOT_COVERED', config: { type: 'NOT_COVERED' } }
    ] as any)

    const r = await submitClaim(memberId, [
      { serviceType: 'MEDICAL', cptCode: '99213', description: 'Office visit',
        serviceDate: '2026-04-01', billedAmountCents: 20000 },
      { serviceType: 'VISION',  cptCode: '92004', description: 'Eye exam',
        serviceDate: '2026-04-01', billedAmountCents: 10000 }
    ])
    expect(r.statusCode).toBe(201)
    const { claim, lineItems } = JSON.parse(r.body)

    expect(claim.status).toBe('partially_approved')

    const detail = await app.inject({ method: 'GET', url: `/api/v1/claims/${claim.id}` })
    const { lineItems: detailItems } = JSON.parse(detail.body)
    const medical = detailItems.find((li: any) => li.serviceType === 'MEDICAL')
    const vision  = detailItems.find((li: any) => li.serviceType === 'VISION')
    expect(medical.status).toBe('covered')
    expect(medical.adjudicationResult.approvedAmountCents).toBe(16000) // 80%
    expect(vision.status).toBe('denied')
    expect(vision.adjudicationResult.approvedAmountCents).toBe(0)
  })
})

// ── 5. Deductible carries across claims ───────────────────────────────────────

describe('deductible paid carries across claims via deductibleAppliedCents', () => {
  it('second claim sees reduced deductible remaining after first claim pays into it', async () => {
    const { memberId } = await createMember([
      { serviceType: 'MEDICAL', ruleType: 'DEDUCTIBLE',  config: { type: 'DEDUCTIBLE', deductibleCents: 50000 } },
      { serviceType: 'MEDICAL', ruleType: 'COINSURANCE', config: { type: 'COINSURANCE', coveragePercent: 0.8 } }
    ] as any)

    // Claim 1: $300 billed — fully absorbed by $500 deductible → $0 approved
    const r1 = await submitClaim(memberId, [{
      serviceType: 'MEDICAL', cptCode: '99213', description: 'Visit',
      serviceDate: '2026-01-10', billedAmountCents: 30000
    }])
    const c1 = JSON.parse(r1.body)
    const d1 = await app.inject({ method: 'GET', url: `/api/v1/claims/${c1.claim.id}` })
    const detail1 = JSON.parse(d1.body)
    expect(detail1.lineItems[0].adjudicationResult.approvedAmountCents).toBe(0)
    expect(detail1.lineItems[0].adjudicationResult.deductibleAppliedCents).toBe(30000)

    // Claim 2: $400 billed — only $200 of deductible remains; $200 approved after 80% coinsurance
    const r2 = await submitClaim(memberId, [{
      serviceType: 'MEDICAL', cptCode: '99213', description: 'Follow-up',
      serviceDate: '2026-02-10', billedAmountCents: 40000
    }])
    const c2 = JSON.parse(r2.body)
    const d2 = await app.inject({ method: 'GET', url: `/api/v1/claims/${c2.claim.id}` })
    const detail2 = JSON.parse(d2.body)
    // $400 - $200 remaining deductible = $200, then 80% = $160
    expect(detail2.lineItems[0].adjudicationResult.approvedAmountCents).toBe(16000)
    expect(detail2.lineItems[0].adjudicationResult.deductibleAppliedCents).toBe(20000)
  })
})

// ── 6. Pay guard ──────────────────────────────────────────────────────────────

describe('pay claim guard', () => {
  it('returns 422 CLAIM_NOT_PAYABLE when paying a denied claim', async () => {
    const { memberId } = await createMember([
      { serviceType: 'VISION', ruleType: 'NOT_COVERED', config: { type: 'NOT_COVERED' } }
    ] as any)

    const r = await submitClaim(memberId, [{
      serviceType: 'VISION', cptCode: '92004', description: 'Eye exam',
      serviceDate: '2026-04-01', billedAmountCents: 10000
    }])
    const { claim } = JSON.parse(r.body)
    expect(claim.status).toBe('denied')

    const payResponse = await app.inject({ method: 'POST', url: `/api/v1/claims/${claim.id}/pay` })
    expect(payResponse.statusCode).toBe(422)
    expect(JSON.parse(payResponse.body).error).toBe('CLAIM_NOT_PAYABLE')
  })

  it('returns 422 CLAIM_NOT_PAYABLE when paying an under_review claim', async () => {
    const { memberId } = await createMember([
      { serviceType: 'MEDICAL', ruleType: 'REVIEW_THRESHOLD', config: { type: 'REVIEW_THRESHOLD', thresholdCents: 10000 } }
    ] as any)

    const r = await submitClaim(memberId, [{
      serviceType: 'MEDICAL', cptCode: '99213', description: 'Expensive visit',
      serviceDate: '2026-04-01', billedAmountCents: 50000
    }])
    const { claim } = JSON.parse(r.body)
    expect(claim.status).toBe('under_review')

    const payResponse = await app.inject({ method: 'POST', url: `/api/v1/claims/${claim.id}/pay` })
    expect(payResponse.statusCode).toBe(422)
    expect(JSON.parse(payResponse.body).error).toBe('CLAIM_NOT_PAYABLE')
  })
})

// ── 7. Disputing a covered line item ─────────────────────────────────────────

describe('disputing a covered line item', () => {
  it('allows opening a dispute when the line item is covered and claim is approved', async () => {
    const { memberId } = await createMember([
      { serviceType: 'MEDICAL', ruleType: 'COINSURANCE', config: { type: 'COINSURANCE', coveragePercent: 0.8 } }
    ] as any)

    const r = await submitClaim(memberId, [{
      serviceType: 'MEDICAL', cptCode: '99213', description: 'Office visit',
      serviceDate: '2026-04-01', billedAmountCents: 20000
    }])
    const { claim, lineItems } = JSON.parse(r.body)
    expect(claim.status).toBe('approved')
    expect(lineItems[0].status).toBe('covered')

    const dr = await app.inject({
      method: 'POST',
      url: `/api/v1/claims/${claim.id}/line-items/${lineItems[0].id}/dispute`,
      payload: { memberReason: 'I was charged incorrectly for this visit.' }
    })
    expect(dr.statusCode).toBe(201)
    const dispute = JSON.parse(dr.body)
    expect(dispute.status).toBe('open')

    const detail = await app.inject({ method: 'GET', url: `/api/v1/claims/${claim.id}` })
    expect(JSON.parse(detail.body).claim.status).toBe('disputed')
  })
})

// ── 8. Empty line items rejected ──────────────────────────────────────────────

describe('empty line items rejected', () => {
  it('returns 422 CLAIM_HAS_NO_LINE_ITEMS when lineItems array is empty', async () => {
    const { memberId } = await createMember([])

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/claims',
      payload: {
        memberId,
        providerName: 'Test Provider',
        providerNpi: '0000000000',
        diagnosisCode: 'Z00.00',
        lineItems: []
      }
    })

    expect(response.statusCode).toBe(422)
    const body = JSON.parse(response.body)
    expect(body.error).toBe('CLAIM_HAS_NO_LINE_ITEMS')
  })
})
