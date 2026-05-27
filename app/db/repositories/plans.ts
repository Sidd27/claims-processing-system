import { eq } from 'drizzle-orm';
import { db } from '../client';
import { plans, planCoverageRules } from '../schema';
import type { Plan, PlanCoverageRule, CoverageRuleConfig } from '../../domain/policies/types';

type DbClient = typeof db;

export async function listPlans(dbClient: DbClient = db): Promise<Plan[]> {
  const rows = await dbClient.select().from(plans);
  return rows.map(toPlan);
}

export async function getPlan(id: string, dbClient: DbClient = db): Promise<Plan | null> {
  const rows = await dbClient.select().from(plans).where(eq(plans.id, id));
  return rows[0] ? toPlan(rows[0]) : null;
}

export async function getPlanByCode(planCode: string, dbClient: DbClient = db): Promise<Plan | null> {
  const rows = await dbClient.select().from(plans).where(eq(plans.planCode, planCode));
  return rows[0] ? toPlan(rows[0]) : null;
}

export async function createPlan(
  data: { planCode: string; name: string; description?: string },
  dbClient: DbClient = db
): Promise<Plan> {
  const rows = await dbClient.insert(plans).values(data).returning();
  return toPlan(rows[0]);
}

export async function getPlanCoverageRules(planId: string, dbClient: DbClient = db): Promise<PlanCoverageRule[]> {
  const rows = await dbClient.select().from(planCoverageRules).where(eq(planCoverageRules.planId, planId));
  return rows.map(toPlanCoverageRule);
}

export async function setPlanCoverageRules(
  planId: string,
  rules: Array<{ serviceType: string; ruleType: string; config: CoverageRuleConfig }>,
  dbClient: DbClient = db
): Promise<PlanCoverageRule[]> {
  await dbClient.delete(planCoverageRules).where(eq(planCoverageRules.planId, planId));
  if (rules.length === 0) return [];
  const rows = await dbClient
    .insert(planCoverageRules)
    .values(rules.map((r) => ({ planId, ...r })))
    .returning();
  return rows.map(toPlanCoverageRule);
}

function toPlan(row: typeof plans.$inferSelect): Plan {
  return {
    id: row.id,
    planCode: row.planCode,
    name: row.name,
    description: row.description,
  };
}

function toPlanCoverageRule(row: typeof planCoverageRules.$inferSelect): PlanCoverageRule {
  return {
    id: row.id,
    planId: row.planId,
    serviceType: row.serviceType as PlanCoverageRule['serviceType'],
    ruleType: row.ruleType as PlanCoverageRule['ruleType'],
    config: row.config as CoverageRuleConfig,
  };
}
