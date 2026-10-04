/**
 * Define o papel de uma conta existente direto no banco, com audit log (Fase 3).
 *
 * E o unico caminho para criar o PRIMEIRO super_user: pela API, so um super_user promove
 * alguem. Diferente de `src/dev/`, roda tambem em producao (`node dist/scripts/set-role.js`).
 *
 *   yarn user:set-role --email=ana@forma.dev --role=super_user
 *
 * O audit log fica com `actor_id` null e `metadata.source = 'cli'`.
 */
import { isRole } from '../shared/auth/index.js';
import { prisma } from '../shared/db/client.js';

function readFlag(name: string): string | undefined {
  const prefix = `--${name}=`;

  return process.argv
    .slice(2)
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

async function main(): Promise<void> {
  const email = readFlag('email')?.trim().toLowerCase();
  const role = readFlag('role');

  if (!email || !isRole(role)) {
    throw new Error('Uso: yarn user:set-role --email=<email> --role=<user|admin|super_user>');
  }

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email }, select: { id: true, role: true } });

    if (!user) {
      throw new Error(`Conta '${email}' nao encontrada (crie via POST /auth antes)`);
    }

    if (user.role === role) {
      return { id: user.id, changed: false };
    }

    await tx.user.update({ where: { id: user.id }, data: { role } });
    await tx.adminAuditLog.create({
      data: {
        actorId: null,
        action: 'user.role_changed',
        targetType: 'user',
        targetId: user.id,
        metadata: { from: user.role, to: role, source: 'cli' },
      },
    });

    return { id: user.id, changed: true };
  });

  process.stdout.write(
    result.changed
      ? `${email} (${result.id}) agora e ${role}.\n`
      : `${email} ja era ${role}; nada alterado.\n`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
