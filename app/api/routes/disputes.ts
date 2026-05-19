import type { FastifyPluginAsync } from 'fastify';
import { openDispute, resolveDispute } from '../../services/disputeService';
import type { DisputeResolution } from '../../domain/disputes/types';

const disputesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { claimId: string; lineItemId: string };
    Body: { memberReason: string };
  }>('/claims/:claimId/line-items/:lineItemId/dispute', async (request, reply) => {
    const dispute = await openDispute(request.params.lineItemId, request.body.memberReason);
    return reply.status(201).send(dispute);
  });

  fastify.post<{
    Params: { id: string };
    Body: { resolution: DisputeResolution; resolverNote: string };
  }>('/disputes/:id/resolve', async (request, reply) => {
    const dispute = await resolveDispute(
      request.params.id,
      request.body.resolution,
      request.body.resolverNote
    );
    return reply.send(dispute);
  });
};

export default disputesRoutes;
