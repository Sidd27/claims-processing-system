import { db } from '../db/client';
import { policies, coverageRules } from '../db/schema';
import { getPlan, getPlanCoverageRules } from '../db/repositories/plans';
import { DomainError } from '../domain/errors';
import type { Policy } from '../domain/policies/types';

export async function enrollMember(
  memberId: string,
  planId: string,
  effectiveDate: string
): Promise<Policy> {
  const plan = await getPlan(planId);
  if (!plan) throw new DomainError('PLAN_NOT_FOUND');

  const planRules = await getPlanCoverageRules(planId);

  return await db.transaction(async (tx) => {
    const [policy] = await tx
      .insert(policies)
      .values({ memberId, planId, planName: plan.name, effectiveDate })
      .returning();

    if (planRules.length > 0) {
      await tx.insert(coverageRules).values(
        planRules.map((r) => ({
          policyId: policy.id,
          serviceType: r.serviceType,
          ruleType: r.ruleType,
          config: r.config,
        }))
      );
    }

    return {
      id: policy.id,
      memberId: policy.memberId,
      planId: policy.planId,
      planName: policy.planName,
      effectiveDate: policy.effectiveDate,
      termDate: policy.termDate,
    };
  });
}
