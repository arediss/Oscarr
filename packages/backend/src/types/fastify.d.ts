import type { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by RBAC middleware — true when user should only see own resources */
    ownerScoped?: boolean;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: number; email: string; role: string };
    user: { id: number; email: string; role: string };
  }
}
