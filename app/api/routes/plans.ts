import type { FastifyPluginAsync } from 'fastify';
import { createPlan, getPlan, listPlans, getPlanCoverageRules, setPlanCoverageRules } from '../../db/repositories/plans';
import { DomainError } from '../../domain/errors';

const plansRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/plans', async (_request, reply) => {
    return reply.send(await listPlans());
  });

  fastify.post<{ Body: { planCode: string; name: string; description?: string; coverageRules?: Array<{ serviceType: string; ruleType: string; config: object }> } }>(
    '/plans',
    async (request, reply) => {
      const { planCode, name, description, coverageRules } = request.body;
      const plan = await createPlan({ planCode, name, description });
      if (coverageRules && coverageRules.length > 0) {
        await setPlanCoverageRules(plan.id, coverageRules as Parameters<typeof setPlanCoverageRules>[1]);
      }
      return reply.status(201).send(plan);
    }
  );

  fastify.get<{ Params: { id: string } }>('/plans/:id', async (request, reply) => {
    const plan = await getPlan(request.params.id);
    if (!plan) throw new DomainError('PLAN_NOT_FOUND');
    const rules = await getPlanCoverageRules(plan.id);
    return reply.send({ ...plan, coverageRules: rules });
  });

  fastify.put<{ Params: { id: string }; Body: Array<{ serviceType: string; ruleType: string; config: object }> }>(
    '/plans/:id/rules',
    async (request, reply) => {
      const plan = await getPlan(request.params.id);
      if (!plan) throw new DomainError('PLAN_NOT_FOUND');
      const rules = await setPlanCoverageRules(plan.id, request.body as Parameters<typeof setPlanCoverageRules>[1]);
      return reply.send(rules);
    }
  );
};

export default plansRoutes;
