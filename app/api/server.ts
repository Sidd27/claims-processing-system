import Fastify from 'fastify';
import cors from '@fastify/cors';
import { DomainError } from '../domain/errors';
import claimsRoutes from './routes/claims';
import disputesRoutes from './routes/disputes';
import membersRoutes from './routes/members';

export function buildServer() {
  const app = Fastify({ logger: true });

  app.register(cors);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) {
      return reply.status(422).send({ error: error.code, message: error.message });
    }
    app.log.error(error);
    return reply
      .status(500)
      .send({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
  });

  app.register(claimsRoutes, { prefix: '/api/v1' });
  app.register(disputesRoutes, { prefix: '/api/v1' });
  app.register(membersRoutes, { prefix: '/api/v1' });

  return app;
}
