import { eq } from 'drizzle-orm';
import { db } from '../client';
import { policies, coverageRules } from '../schema';
import type { CoverageRule, CoverageRuleConfig } from '../../domain/policies/types';

type DbClient = typeof db;

export async function getActivePolicy(memberId: string, dbClient: DbClient = db) {
  const result = await dbClient.select().from(policies).where(eq(policies.memberId, memberId));
  return result[0] ?? null;
}

export async function getCoverageRules(policyId: string, dbClient: DbClient = db): Promise<CoverageRule[]> {
  const rows = await dbClient.select().from(coverageRules).where(eq(coverageRules.policyId, policyId));

  return rows.map((row) => ({
    id: row.id,
    policyId: row.policyId,
    serviceType: row.serviceType as CoverageRule['serviceType'],
    ruleType: row.ruleType as CoverageRule['ruleType'],
    config: row.config as CoverageRuleConfig,
  }));
}
