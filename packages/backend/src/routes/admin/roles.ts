import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';
import { logEvent } from '../../utils/logEvent.js';
import { invalidateRoleCache, getAllPermissions } from '../../middleware/rbac.js';
import { parseId } from '../../utils/params.js';

export async function rolesRoutes(app: FastifyInstance) {
  // === RBAC: ROLES MANAGEMENT ===

  // List all roles
  app.get('/roles', async () => {
    return prisma.role.findMany({ orderBy: { position: 'asc' } });
  });

  // List all available permissions (core + plugins)
  app.get('/permissions', async () => {
    return getAllPermissions();
  });

  // Create a new role
  app.post('/roles', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'permissions'],
        properties: {
          name: { type: 'string' },
          permissions: { type: 'array', items: { type: 'string' } },
          position: { type: 'number' },
        },
      },
    },
  }, async (request, reply) => {
    const { name, permissions, position } = request.body as { name: string; permissions: string[]; position?: number };

    if (!name?.trim()) return reply.status(400).send({ error: 'Name required' });

    const existing = await prisma.role.findUnique({ where: { name: name.trim().toLowerCase() } });
    if (existing) return reply.status(409).send({ error: 'This role already exists' });

    const maxPos = await prisma.role.aggregate({ _max: { position: true } });
    const role = await prisma.role.create({
      data: {
        name: name.trim().toLowerCase(),
        permissions: JSON.stringify(permissions),
        position: position ?? (maxPos._max.position ?? 0) + 1,
      },
    });

    await invalidateRoleCache();
    logEvent('info', 'Admin', `Role created: ${role.name}`);
    return reply.status(201).send(role);
  });

  // Update a role
  app.put('/roles/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          permissions: { type: 'array', items: { type: 'string' } },
          isDefault: { type: 'boolean' },
          position: { type: 'number' },
        },
      },
    },
  }, async (request, reply) => {
    const roleId = parseId((request.params as { id: string }).id);
    if (!roleId) return reply.status(400).send({ error: 'Invalid ID' });

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return reply.status(404).send({ error: 'Role not found' });

    const { name, permissions, isDefault, position } = request.body as {
      name?: string; permissions?: string[]; isDefault?: boolean; position?: number;
    };

    // System roles cannot be renamed
    if (role.isSystem && name && name !== role.name) {
      return reply.status(400).send({ error: 'Cannot rename a system role' });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.role.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }

    const updated = await prisma.role.update({
      where: { id: roleId },
      data: {
        ...(name && !role.isSystem ? { name: name.trim().toLowerCase() } : {}),
        ...(permissions ? { permissions: JSON.stringify(permissions) } : {}),
        ...(isDefault !== undefined ? { isDefault } : {}),
        ...(position !== undefined ? { position } : {}),
      },
    });

    await invalidateRoleCache();
    logEvent('info', 'Admin', `Role updated: ${updated.name}`);
    return updated;
  });

  // Delete a role (optionally reassigning any users currently holding it via ?reassignTo=<roleName>)
  app.delete('/roles/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      querystring: {
        type: 'object',
        properties: {
          reassignTo: { type: 'string', description: 'Name of the role users holding this one should be moved to' },
        },
      },
    },
  }, async (request, reply) => {
    const roleId = parseId((request.params as { id: string }).id);
    if (!roleId) return reply.status(400).send({ error: 'Invalid ID' });

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return reply.status(404).send({ error: 'Role not found' });
    if (role.isSystem) return reply.status(400).send({ error: 'Cannot delete a system role' });

    const { reassignTo } = (request.query as { reassignTo?: string }) ?? {};
    const usersWithRole = await prisma.user.count({ where: { role: role.name } });

    if (usersWithRole > 0) {
      // Surface a structured 409 so the UI can offer a migration path instead
      // of silently failing with a free-text 400 error.
      if (!reassignTo) {
        return reply.status(409).send({
          error: 'ROLE_IN_USE',
          userCount: usersWithRole,
          message: `${usersWithRole} user(s) still have this role. Reassign them first.`,
        });
      }
      if (reassignTo === role.name) {
        return reply.status(400).send({ error: 'reassignTo cannot be the role being deleted' });
      }
      const target = await prisma.role.findUnique({ where: { name: reassignTo } });
      if (!target) return reply.status(400).send({ error: `Target role "${reassignTo}" not found` });

      await prisma.$transaction([
        prisma.user.updateMany({ where: { role: role.name }, data: { role: target.name } }),
        prisma.role.delete({ where: { id: roleId } }),
      ]);
      await invalidateRoleCache();
      logEvent('info', 'Admin', `Role deleted: ${role.name} (${usersWithRole} user(s) reassigned to ${target.name})`);
      return { ok: true, reassigned: usersWithRole };
    }

    await prisma.role.delete({ where: { id: roleId } });
    await invalidateRoleCache();
    logEvent('info', 'Admin', `Role deleted: ${role.name}`);
    return { ok: true };
  });
}
