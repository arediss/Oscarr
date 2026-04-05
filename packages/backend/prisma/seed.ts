import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed default roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: {
      name: 'admin',
      permissions: '["*"]',
      isDefault: false,
      isSystem: true,
      position: 0,
    },
  });
  console.log(`[Seed] Role "${adminRole.name}" ready`);

  const userRole = await prisma.role.upsert({
    where: { name: 'user' },
    update: {},
    create: {
      name: 'user',
      permissions: '["$authenticated","requests.read","requests.create","requests.delete","support.read","support.create","support.write"]',
      isDefault: true,
      isSystem: true,
      position: 1,
    },
  });
  console.log(`[Seed] Role "${userRole.name}" ready`);

  // Seed default app settings
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, updatedAt: new Date() },
  });
  console.log('[Seed] AppSettings ready');

  console.log('[Seed] Done!');
}

main()
  .catch((e) => {
    console.error('[Seed] Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
