import type { FastifyPluginAsync } from 'fastify';
import { listMembers, getMember } from '../../db/repositories/members';
import { getActivePolicy, getCoverageRules } from '../../db/repositories/policies';
import { DomainError } from '../../domain/errors';

const membersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/members', async (_request, reply) => {
    return reply.send(await listMembers());
  });

  fastify.get<{ Params: { id: string } }>('/members/:id', async (request, reply) => {
    const member = await getMember(request.params.id);
    if (!member) throw new DomainError('MEMBER_NOT_FOUND');
    return reply.send(member);
  });

  fastify.get<{ Params: { id: string } }>('/members/:id/policy', async (request, reply) => {
    const member = await getMember(request.params.id);
    if (!member) throw new DomainError('MEMBER_NOT_FOUND');

    const policy = await getActivePolicy(request.params.id);
    if (!policy) throw new DomainError('NO_ACTIVE_POLICY');

    const rules = await getCoverageRules(policy.id);
    return reply.send({ policy, coverageRules: rules });
  });
};

export default membersRoutes;
