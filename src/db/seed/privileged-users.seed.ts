import * as argon2 from 'argon2';

import type { Role } from '../../shared/auth/index.js';
import { prisma } from '../../shared/db/client.js';

/**
 * Contas privilegiadas iniciais, lidas do `.env`: `ADMIN_*` cria um admin e `SUPER_USER_*`
 * um super_user (`<PREFIXO>_EMAIL`, `<PREFIXO>_PASSWORD`, `<PREFIXO>_DISPLAY_NAME`). Sem
 * email/senha o seeder daquele papel e pulado — nenhuma senha fica no codigo.
 *
 * Idempotente: se a conta ja existe, so ajusta o papel (senha e perfil ficam intactos). Toda
 * mudanca de papel gera audit log com `actor_id` null e `metadata.source = 'seed'`, como o
 * `yarn user:set-role`.
 */
async function seedPrivilegedUser(prefix: string, role: Exclude<Role, 'user'>): Promise<void> {
  const email = process.env[`${prefix}_EMAIL`]?.trim().toLowerCase();
  const password = process.env[`${prefix}_PASSWORD`];
  const displayName = process.env[`${prefix}_DISPLAY_NAME`]?.trim() || 'Admin';

  if (!email || !password) {
    process.stdout.write(`  ${prefix}_EMAIL/${prefix}_PASSWORD nao definidos; pulando.\n`);

    return;
  }

  // Mesmas regras de POST /auth (auth.schemas.ts).
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error(`${prefix}_PASSWORD precisa de 8+ caracteres, ao menos uma letra e um digito`);
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (existing?.role === role) {
    process.stdout.write(`  ${email} ja e ${role}; nada alterado.\n`);

    return;
  }

  // Hash fora da transacao: argon2 e lento e seguraria a conexao a toa.
  const passwordHash = existing ? null : await argon2.hash(password);

  await prisma.$transaction(async (tx) => {
    const user = existing
      ? await tx.user.update({ where: { id: existing.id }, data: { role }, select: { id: true } })
      : await tx.user.create({
          data: { email, passwordHash, role, profile: { create: { displayName } } },
          select: { id: true },
        });

    await tx.adminAuditLog.create({
      data: {
        actorId: null,
        action: 'user.role_changed',
        targetType: 'user',
        targetId: user.id,
        metadata: { from: existing?.role ?? null, to: role, source: 'seed' },
      },
    });
  });

  process.stdout.write(
    existing ? `  ${email} promovido a ${role}.\n` : `  ${email} criado como ${role}.\n`,
  );
}

export function seedSuperUser(): Promise<void> {
  return seedPrivilegedUser('SUPER_USER', 'super_user');
}

export function seedAdminUser(): Promise<void> {
  return seedPrivilegedUser('ADMIN', 'admin');
}
