import { prisma } from '../db/client.js';
import type { Role, UserStatus } from '../../generated/prisma/client.js';

/**
 * Lookup minimo por PK, usado pelo decorator `authenticate` a cada requisicao autenticada.
 * Separado de `features/auth/` porque e consumido por `plugins/`, que nao pode depender
 * de uma feature (features so se importam pelo `index.ts` umas das outras).
 *
 * Devolve tambem o `role` (Fase 3.1): promocao/rebaixamento pelo painel admin precisa valer
 * na hora, e nao so quando o access token de 15 min expirar.
 */
export async function findUserAccess(
  userId: string,
): Promise<{ status: UserStatus; role: Role } | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, role: true },
  });
}
