import type { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.status(401).send({ error: 'Non autorisé' });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    const user = request.user as { id: number; role: string };
    if (user.role !== 'admin') {
      reply.status(403).send({ error: 'Accès réservé aux administrateurs' });
      throw new Error('Unauthorized');
    }
  } catch (err) {
    if ((err as Error).message === 'Unauthorized') throw err;
    reply.status(401).send({ error: 'Non autorisé' });
    throw new Error('Unauthorized');
  }
}
