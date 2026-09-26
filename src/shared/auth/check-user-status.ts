import { prisma } from '../db/client.js';
import type { UserStatus } from '../../generated/prisma/client.js';

/**
 * Lookup minimo por PK, usado pelo decorator `authenticate` a cada requisicao autenticada.
 * Separado de `features/auth/` porque e consumido por `plugins/`, que nao pode depender
 * de uma feature (features so se importam pelo `index.ts` umas das outras).
 */
export async function findUserStatus(userId: string): Promise<UserStatus | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });

  return user?.status ?? null;
}
