import 'dotenv/config';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { buildServer } from './server';
import { db, pool } from '../db/client';
import { disputes, adjudicationResults, claimLineItems, claims, coverageRules, policies, members, planCoverageRules, plans } from '../db/schema';
import { enrollMember } from '../services/planService';
import { getCoverageRules } from '../db/repositories/policies';

const app = buildServer();

async function clearDb() {
  await db.delete(disputes);
  await db.delete(adjudicationResults);
  await db.delete(claimLineItems);
  await db.delete(claims);
  await db.delete(coverageRules);
  await db.delete(policies);
  await db.delete(members);
  await db.delete(planCoverageRules);
  await db.delete(plans);
}

async function createMember() {
  const [member] = await db
    .insert(members)
    .values({ externalMemberId: `TEST-${Date.now()}`, name: 'Test Member', dateOfBirth: '1990-01-01' })
    .returning();
  return member;
}

async function submitClaim(memberId: string, billedAmount: number, serviceType = 'MEDICAL') {
  return app.inject({
    method: 'POST',
    url: '/api/v1/claims',
    payload: {
      memberId,
      providerName: 'Test Provider',
      providerNpi: '0000000000',
      diagnosisCode: 'Z00.00',
      lineItems: [{ serviceType, cptCode: '99213', description: 'Visit', serviceDate: '2026-01-10', billedAmount }],
    },
  });
}

beforeEach(clearDb);

afterAll(async () => {
  await app.close();
  await pool.end();
});

// ── Plans API ─────────────────────────────────────────────────────────────────

describe('GET /plans', () => {
  it('returns empty array when no plans exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/plans' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it('returns all created plans', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/plans',
      payload: { planCode: 'PLAN_A', name: 'Plan A' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/plans',
      payload: { planCode: 'PLAN_B', name: 'Plan B' },
    });

    const res = await app.inject({ method: 'GET', url: '/api/v1/plans' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(2);
    expect(body.map((p: any) => p.planCode).sort()).toEqual(['PLAN_A', 'PLAN_B']);
  });
});

describe('POST /plans', () => {
  it('creates a plan without coverage rules', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/plans',
      payload: { planCode: 'SIMPLE_PLAN', name: 'Simple Plan', description: 'Test plan' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.planCode).toBe('SIMPLE_PLAN');
    expect(body.name).toBe('Simple Plan');
    expect(body.id).toBeDefined();
  });

  it('creates a plan with inline coverage rules', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/plans',
      payload: {
        planCode: 'COINSURANCE_PLAN',
        name: 'Coinsurance Plan',
        coverageRules: [
          { serviceType: 'MEDICAL', ruleType: 'COINSURANCE', config: { type: 'COINSURANCE', coveragePercent: 0.8 } },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const { id } = JSON.parse(res.body);

    const detail = await app.inject({ method: 'GET', url: `/api/v1/plans/${id}` });
    const plan = JSON.parse(detail.body);
    expect(plan.coverageRules).toHaveLength(1);
    expect(plan.coverageRules[0].ruleType).toBe('COINSURANCE');
  });
});

describe('GET /plans/:id', () => {
  it('returns plan with its coverage rules', async () => {
    const created = JSON.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/plans',
          payload: {
            planCode: 'DETAIL_PLAN',
            name: 'Detail Plan',
            coverageRules: [
              { serviceType: 'DENTAL', ruleType: 'PER_CLAIM_CAP', config: { type: 'PER_CLAIM_CAP', capAmount: 500 } },
              { serviceType: 'DENTAL', ruleType: 'COINSURANCE', config: { type: 'COINSURANCE', coveragePercent: 0.8 } },
            ],
          },
        })
      ).body
    );

    const res = await app.inject({ method: 'GET', url: `/api/v1/plans/${created.id}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(created.id);
    expect(body.coverageRules).toHaveLength(2);
  });

  it('returns 422 PLAN_NOT_FOUND for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/plans/00000000-0000-0000-0000-000000000000' });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toBe('PLAN_NOT_FOUND');
  });
});

describe('PUT /plans/:id/rules', () => {
  it('replaces the plan rules entirely', async () => {
    const plan = JSON.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/plans',
          payload: {
            planCode: 'MUTABLE_PLAN',
            name: 'Mutable Plan',
            coverageRules: [
              { serviceType: 'MEDICAL', ruleType: 'COINSURANCE', config: { type: 'COINSURANCE', coveragePercent: 0.8 } },
            ],
          },
        })
      ).body
    );

    // Replace with two new rules
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/plans/${plan.id}/rules`,
      payload: [
        { serviceType: 'MEDICAL', ruleType: 'DEDUCTIBLE', config: { type: 'DEDUCTIBLE', deductibleAmount: 2000 } },
        { serviceType: 'MEDICAL', ruleType: 'COINSURANCE', config: { type: 'COINSURANCE', coveragePercent: 0.5 } },
      ],
    });
    expect(res.statusCode).toBe(200);
    const rules = JSON.parse(res.body);
    expect(rules).toHaveLength(2);
    expect(rules.map((r: any) => r.ruleType).sort()).toEqual(['COINSURANCE', 'DEDUCTIBLE']);
  });

  it('clears all rules when an empty array is sent', async () => {
    const plan = JSON.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/plans',
          payload: {
            planCode: 'CLEARABLE_PLAN',
            name: 'Clearable Plan',
            coverageRules: [
              { serviceType: 'MEDICAL', ruleType: 'COINSURANCE', config: { type: 'COINSURANCE', coveragePercent: 0.8 } },
            ],
          },
        })
      ).body
    );

    await app.inject({ method: 'PUT', url: `/api/v1/plans/${plan.id}/rules`, payload: [] });

    const detail = await app.inject({ method: 'GET', url: `/api/v1/plans/${plan.id}` });
    expect(JSON.parse(detail.body).coverageRules).toHaveLength(0);
  });
});

// ── Snapshot isolation ────────────────────────────────────────────────────────

describe('snapshot isolation: enrolled policy rules are frozen at enrollment time', () => {
  it('enrollMember copies plan rules into policy coverageRules', async () => {
    const plan = JSON.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/plans',
          payload: {
            planCode: 'SNAPSHOT_PLAN',
            name: 'Snapshot Plan',
            coverageRules: [
              { serviceType: 'MEDICAL', ruleType: 'COINSURANCE', config: { type: 'COINSURANCE', coveragePercent: 0.8 } },
            ],
          },
        })
      ).body
    );

    const member = await createMember();
    const policy = await enrollMember(member.id, plan.id, '2026-01-01');

    const policyCoverageRules = await getCoverageRules(policy.id);
    expect(policyCoverageRules).toHaveLength(1);
    expect(policyCoverageRules[0].ruleType).toBe('COINSURANCE');
    expect((policyCoverageRules[0].config as any).coveragePercent).toBe(0.8);
  });

  it('updating plan rules does not change already-enrolled policy rules', async () => {
    const plan = JSON.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/plans',
          payload: {
            planCode: 'FROZEN_PLAN',
            name: 'Frozen Plan',
            coverageRules: [
              { serviceType: 'MEDICAL', ruleType: 'COINSURANCE', config: { type: 'COINSURANCE', coveragePercent: 0.7 } },
            ],
          },
        })
      ).body
    );

    const member = await createMember();
    const policy = await enrollMember(member.id, plan.id, '2026-01-01');

    // Mutate plan: add deductible, change coinsurance to 50%
    await app.inject({
      method: 'PUT',
      url: `/api/v1/plans/${plan.id}/rules`,
      payload: [
        { serviceType: 'MEDICAL', ruleType: 'DEDUCTIBLE', config: { type: 'DEDUCTIBLE', deductibleAmount: 2000 } },
        { serviceType: 'MEDICAL', ruleType: 'COINSURANCE', config: { type: 'COINSURANCE', coveragePercent: 0.5 } },
      ],
    });

    // Policy still has the original single rule at 70%
    const policyCoverageRules = await getCoverageRules(policy.id);
    expect(policyCoverageRules).toHaveLength(1);
    expect(policyCoverageRules[0].ruleType).toBe('COINSURANCE');
    expect((policyCoverageRules[0].config as any).coveragePercent).toBe(0.7);

    // Plan now has two updated rules
    const planDetail = await app.inject({ method: 'GET', url: `/api/v1/plans/${plan.id}` });
    const planRules = JSON.parse(planDetail.body).coverageRules;
    expect(planRules).toHaveLength(2);
    expect(planRules.find((r: any) => r.ruleType === 'COINSURANCE').config.coveragePercent).toBe(0.5);
  });

  it('claim adjudicates at the frozen enrollment-time rules, not the updated plan rules', async () => {
    // Plan v1: 70% coinsurance
    const plan = JSON.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/plans',
          payload: {
            planCode: 'ADJ_SNAPSHOT_PLAN',
            name: 'Adjudication Snapshot Plan',
            coverageRules: [
              { serviceType: 'MEDICAL', ruleType: 'COINSURANCE', config: { type: 'COINSURANCE', coveragePercent: 0.7 } },
            ],
          },
        })
      ).body
    );

    const member = await createMember();
    await enrollMember(member.id, plan.id, '2026-01-01');

    // Plan v2: 50% coinsurance + $2,000 deductible (member already enrolled, should be unaffected)
    await app.inject({
      method: 'PUT',
      url: `/api/v1/plans/${plan.id}/rules`,
      payload: [
        { serviceType: 'MEDICAL', ruleType: 'DEDUCTIBLE', config: { type: 'DEDUCTIBLE', deductibleAmount: 2000 } },
        { serviceType: 'MEDICAL', ruleType: 'COINSURANCE', config: { type: 'COINSURANCE', coveragePercent: 0.5 } },
      ],
    });

    // $1,000 billed → expected: 70% = $700 (v1 snapshot), not 50% = $500 (v2) and not deducted
    const claimRes = await submitClaim(member.id, 1000);
    expect(claimRes.statusCode).toBe(201);
    const { claim, lineItems } = JSON.parse(claimRes.body);
    expect(claim.status).toBe('approved');

    const detail = await app.inject({ method: 'GET', url: `/api/v1/claims/${claim.id}` });
    const approvedAmount = JSON.parse(detail.body).lineItems[0].adjudicationResult.approvedAmount;
    expect(approvedAmount).toBe(700); // 70% of $1,000 — v1 rules
  });
});
