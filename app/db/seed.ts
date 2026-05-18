import 'dotenv/config'
import { db } from './client'
import { members, policies, coverageRules, claims, claimLineItems, adjudicationResults, disputes } from './schema'
import { submitClaim } from '../services/claimService'
import { openDispute, resolveDispute } from '../services/disputeService'

async function clearAll() {
  await db.delete(disputes)
  await db.delete(adjudicationResults)
  await db.delete(claimLineItems)
  await db.delete(claims)
  await db.delete(coverageRules)
  await db.delete(policies)
  await db.delete(members)
}

async function seed() {
  console.log('Clearing existing data...')
  await clearAll()

  // ── Members ───────────────────────────────────────────────────────────────

  console.log('Creating members...')
  const [alice, bob, carol, dave, emma] = await db.insert(members).values([
    { externalMemberId: 'M-ALICE-001', name: 'Alice Chen',    dateOfBirth: '1985-03-12' },
    { externalMemberId: 'M-BOB-002',   name: 'Bob Martinez',  dateOfBirth: '1978-07-24' },
    { externalMemberId: 'M-CAROL-003', name: 'Carol White',   dateOfBirth: '1992-11-05' },
    { externalMemberId: 'M-DAVE-004',  name: 'Dave Patel',    dateOfBirth: '1969-01-30' },
    { externalMemberId: 'M-EMMA-005',  name: 'Emma Rodriguez',dateOfBirth: '2001-06-18' },
  ]).returning()

  // ── Policies ──────────────────────────────────────────────────────────────

  console.log('Creating policies...')
  const [alicePolicy, bobPolicy, carolPolicy, davePolicy, emmaPolicy] = await db.insert(policies).values([
    { memberId: alice.id, planName: 'Premier PPO',     effectiveDate: '2026-01-01' },
    { memberId: bob.id,   planName: 'Standard HMO',    effectiveDate: '2026-01-01' },
    { memberId: carol.id, planName: 'Behavioral Plus',  effectiveDate: '2026-01-01' },
    { memberId: dave.id,  planName: 'Dental Select',    effectiveDate: '2026-01-01' },
    { memberId: emma.id,  planName: 'Basic Vision Plan', effectiveDate: '2026-01-01' },
  ]).returning()

  // ── Coverage Rules ────────────────────────────────────────────────────────

  console.log('Creating coverage rules...')
  await db.insert(coverageRules).values([
    // Alice — MEDICAL: 80% coinsurance, no deductible
    { policyId: alicePolicy.id, serviceType: 'MEDICAL',       ruleType: 'COINSURANCE',   config: { type: 'COINSURANCE', coveragePercent: 0.8 } },

    // Bob — MEDICAL: $5,000 deductible + 80% coinsurance
    { policyId: bobPolicy.id,   serviceType: 'MEDICAL',       ruleType: 'DEDUCTIBLE',    config: { type: 'DEDUCTIBLE', deductibleCents: 500000 } },
    { policyId: bobPolicy.id,   serviceType: 'MEDICAL',       ruleType: 'COINSURANCE',   config: { type: 'COINSURANCE', coveragePercent: 0.8 } },

    // Carol — MENTAL_HEALTH: $5,000 annual limit, 80% coinsurance
    { policyId: carolPolicy.id, serviceType: 'MENTAL_HEALTH', ruleType: 'ANNUAL_LIMIT',  config: { type: 'ANNUAL_LIMIT', limitCents: 500000 } },
    { policyId: carolPolicy.id, serviceType: 'MENTAL_HEALTH', ruleType: 'COINSURANCE',   config: { type: 'COINSURANCE', coveragePercent: 0.8 } },

    // Dave — DENTAL: $300 per-claim cap, 80% coinsurance; VISION: not covered
    { policyId: davePolicy.id,  serviceType: 'DENTAL',        ruleType: 'PER_CLAIM_CAP', config: { type: 'PER_CLAIM_CAP', capCents: 30000 } },
    { policyId: davePolicy.id,  serviceType: 'DENTAL',        ruleType: 'COINSURANCE',   config: { type: 'COINSURANCE', coveragePercent: 0.8 } },
    { policyId: davePolicy.id,  serviceType: 'VISION',        ruleType: 'NOT_COVERED',   config: { type: 'NOT_COVERED' } },

    // Emma — VISION: not covered (demonstrates fully denied claim)
    { policyId: emmaPolicy.id,  serviceType: 'VISION',        ruleType: 'NOT_COVERED',   config: { type: 'NOT_COVERED' } },
  ])

  // ── Carol: prior claim to consume $4,500 of the $5,000 annual limit ──────

  console.log('Creating Carol prior claim (prior annual usage)...')
  await submitClaim({
    memberId: carol.id,
    providerName: 'Sunrise Behavioral Health',
    providerNpi: '1234567890',
    diagnosisCode: 'F32.1',
    lineItems: [
      {
        serviceType: 'MENTAL_HEALTH',
        cptCode: '90837',
        description: 'Individual therapy — prior session block',
        serviceDate: '2026-01-15',
        billedAmountCents: 562500, // $5,625 billed; 80% = $4,500 approved (within $5,000 limit)
      }
    ]
  })

  // ── Alice: straightforward full approval ─────────────────────────────────

  console.log('Creating Alice claim...')
  const { claim: aliceClaim } = await submitClaim({
    memberId: alice.id,
    providerName: 'General Hospital',
    providerNpi: '9876543210',
    diagnosisCode: 'J06.9',
    lineItems: [
      {
        serviceType: 'MEDICAL',
        cptCode: '99213',
        description: 'Office visit — upper respiratory infection',
        serviceDate: '2026-03-10',
        billedAmountCents: 25000, // $250 billed; 80% = $200 approved
      }
    ]
  })
  console.log(`  Alice claim ${aliceClaim.id} → ${aliceClaim.status}`)

  // ── Bob: deductible partially met, then coinsurance ──────────────────────

  console.log('Creating Bob claim...')
  const { claim: bobClaim } = await submitClaim({
    memberId: bob.id,
    providerName: 'City Medical Center',
    providerNpi: '1122334455',
    diagnosisCode: 'M54.5',
    lineItems: [
      {
        serviceType: 'MEDICAL',
        cptCode: '27447',
        description: 'Total knee replacement',
        serviceDate: '2026-04-02',
        billedAmountCents: 1200000, // $12,000 billed; -$5,000 deductible = $7,000; 80% = $5,600 approved
      }
    ]
  })
  console.log(`  Bob claim ${bobClaim.id} → ${bobClaim.status}`)

  // ── Carol: second claim hits the annual limit ─────────────────────────────

  console.log('Creating Carol second claim (hits annual limit)...')
  const { claim: carolClaim } = await submitClaim({
    memberId: carol.id,
    providerName: 'Sunrise Behavioral Health',
    providerNpi: '1234567890',
    diagnosisCode: 'F32.1',
    lineItems: [
      {
        serviceType: 'MENTAL_HEALTH',
        cptCode: '90837',
        description: 'Individual therapy — follow-up sessions',
        serviceDate: '2026-05-10',
        billedAmountCents: 100000, // $1,000 billed; only $500 remaining on limit; 80% of $500 = $400 approved
      }
    ]
  })
  console.log(`  Carol claim ${carolClaim.id} → ${carolClaim.status}`)

  // ── Dave: capped dental claim → dispute → overturn ───────────────────────

  console.log('Creating Dave claim...')
  const { claim: daveClaim, lineItems: daveLineItems } = await submitClaim({
    memberId: dave.id,
    providerName: 'Smile Dental Group',
    providerNpi: '5566778899',
    diagnosisCode: 'K02.9',
    lineItems: [
      {
        serviceType: 'DENTAL',
        cptCode: 'D2750',
        description: 'Crown — posterior tooth',
        serviceDate: '2026-05-14',
        billedAmountCents: 80000, // $800 billed; capped at $300; 80% of $300 = $240 approved
      }
    ]
  })
  console.log(`  Dave claim ${daveClaim.id} → ${daveClaim.status}`)

  const daveLineItem = daveLineItems[0]
  const dispute = await openDispute(
    daveLineItem.id,
    'Crown is medically necessary — per-claim cap should not apply per my EOB from last year.'
  )
  console.log(`  Dispute ${dispute.id} opened on Dave line item`)

  await resolveDispute(
    dispute.id,
    'overturned',
    'Reviewed with clinical team — crown is medically necessary. Approving full billed amount.'
  )
  console.log(`  Dispute ${dispute.id} resolved: overturned — Dave claim fully approved`)

  // ── Emma: fully denied — VISION not covered ──────────────────────────────

  console.log('Creating Emma claim (denied — NOT_COVERED)...')
  const { claim: emmaClaim } = await submitClaim({
    memberId: emma.id,
    providerName: 'Vision Plus Optometry',
    providerNpi: '9988776655',
    diagnosisCode: 'H52.1',
    lineItems: [
      {
        serviceType: 'VISION',
        cptCode: '92004',
        description: 'Comprehensive eye exam',
        serviceDate: '2026-05-19',
        billedAmountCents: 15000, // $150 billed; VISION not covered → $0 approved
      }
    ]
  })
  console.log(`  Emma claim ${emmaClaim.id} → ${emmaClaim.status}`)

  console.log('\nSeed complete.')
  process.exit(0)
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
