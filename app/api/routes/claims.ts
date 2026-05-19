import type { FastifyPluginAsync } from 'fastify';
import {
  submitClaim,
  getClaimDetail,
  getAllClaims,
  markClaimPaid,
  reAdjudicateClaim,
} from '../../services/claimService';
import type { SubmitClaimInput } from '../../services/claimService';

const claimsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/claims', async (_request, reply) => {
    const claims = await getAllClaims();
    return reply.send(claims);
  });

  fastify.get<{ Params: { id: string } }>('/claims/:id', async (request, reply) => {
    const detail = await getClaimDetail(request.params.id);
    return reply.send(detail);
  });

  fastify.post<{ Body: SubmitClaimInput }>('/claims', async (request, reply) => {
    const result = await submitClaim(request.body);
    return reply.status(201).send(result);
  });

  fastify.post<{ Params: { id: string } }>('/claims/:id/adjudicate', async (request, reply) => {
    const claim = await reAdjudicateClaim(request.params.id);
    return reply.send(claim);
  });

  fastify.post<{ Params: { id: string } }>('/claims/:id/pay', async (request, reply) => {
    const claim = await markClaimPaid(request.params.id);
    return reply.send(claim);
  });
};

export default claimsRoutes;
