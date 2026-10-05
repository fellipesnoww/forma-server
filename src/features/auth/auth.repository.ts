import { prisma } from '../../shared/db/client.js';
import type {
  OAuthProvider as PrismaOAuthProvider,
  Prisma,
  Role as PrismaRole,
} from '../../generated/prisma/client.js';

const WITH_PROFILE = { profile: true } as const;

export type UserWithProfile = Prisma.UserGetPayload<{ include: typeof WITH_PROFILE }>;

export function findUserByEmail(email: string): Promise<UserWithProfile | null> {
  return prisma.user.findUnique({ where: { email }, include: WITH_PROFILE });
}

export function findUserByOAuth(
  oauthProvider: PrismaOAuthProvider,
  oauthSubject: string,
): Promise<UserWithProfile | null> {
  return prisma.user.findUnique({
    where: { oauthProvider_oauthSubject: { oauthProvider, oauthSubject } },
    include: WITH_PROFILE,
  });
}

export function findUserById(id: string): Promise<UserWithProfile | null> {
  return prisma.user.findUnique({ where: { id }, include: WITH_PROFILE });
}

export function createUserWithProfile(data: {
  email: string;
  passwordHash?: string | null;
  oauthProvider?: PrismaOAuthProvider | null;
  oauthSubject?: string | null;
  role?: PrismaRole;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<UserWithProfile> {
  // Nested write: uma unica instrucao Prisma, atomica por natureza (sem precisar de $transaction).
  return prisma.user.create({
    data: {
      email: data.email,
      passwordHash: data.passwordHash ?? null,
      oauthProvider: data.oauthProvider ?? null,
      oauthSubject: data.oauthSubject ?? null,
      role: data.role ?? 'user',
      profile: {
        create: { displayName: data.displayName ?? null, avatarUrl: data.avatarUrl ?? null },
      },
    },
    include: WITH_PROFILE,
  });
}

/** Preenche so os campos ainda vazios: nunca sobrescreve o que o usuario editou. */
export function fillMissingProfileFields(
  userId: string,
  data: { displayName?: string; avatarUrl?: string },
): Promise<UserWithProfile> {
  return prisma.user.update({
    where: { id: userId },
    data: { profile: { update: data } },
    include: WITH_PROFILE,
  });
}

export function linkOAuthToUser(
  userId: string,
  oauthProvider: PrismaOAuthProvider,
  oauthSubject: string,
): Promise<UserWithProfile> {
  return prisma.user.update({
    where: { id: userId },
    data: { oauthProvider, oauthSubject },
    include: WITH_PROFILE,
  });
}

export async function incrementTokenVersion(userId: string): Promise<number> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });

  return updated.tokenVersion;
}
