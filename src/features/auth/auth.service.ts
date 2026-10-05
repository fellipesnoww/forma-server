import * as argon2 from 'argon2';
import { jwtVerify, SignJWT } from 'jose';

import { getActiveDietSummary, type DietSummary } from '../diets/index.js';
import { env } from '../../config/env.js';
import type { Role } from '../../shared/auth/index.js';
import { AppError } from '../../shared/errors/index.js';
import {
  createUserWithProfile,
  findUserByEmail,
  findUserById,
  findUserByOAuth,
  incrementTokenVersion,
  linkOAuthToUser,
  type UserWithProfile,
} from './auth.repository.js';
import { verifyAppleIdentityToken, verifyGoogleIdToken } from './oauth-verifiers.js';
import type { LoginBody, RegisterBody } from './auth.schemas.js';

export type OAuthProviderName = 'google' | 'apple';

export interface AuthUserDto {
  id: string;
  email: string;
  role: Role;
  status: 'active' | 'inactive' | 'banned';
  createdAt: string;
}

export interface ProfileDto {
  displayName: string | null;
  avatarUrl: string | null;
  onboardingCompletedAt: string | null;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUserDto;
  profile: ProfileDto;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

async function signAccessToken(user: Pick<UserWithProfile, 'id' | 'role'>): Promise<string> {
  return new SignJWT({ role: user.role, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_TTL)
    .sign(toKey(env.JWT_ACCESS_SECRET));
}

async function signRefreshToken(
  user: Pick<UserWithProfile, 'id' | 'tokenVersion'>,
): Promise<string> {
  return new SignJWT({ typ: 'refresh', tv: user.tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(env.JWT_REFRESH_TTL)
    .sign(toKey(env.JWT_REFRESH_SECRET));
}

interface RefreshClaims {
  sub: string;
  tv: number;
}

async function verifyRefreshToken(token: string): Promise<RefreshClaims> {
  let payload;

  try {
    ({ payload } = await jwtVerify(token, toKey(env.JWT_REFRESH_SECRET)));
  } catch {
    throw AppError.unauthorized();
  }

  if (
    payload.typ !== 'refresh' ||
    typeof payload.sub !== 'string' ||
    typeof payload.tv !== 'number'
  ) {
    throw AppError.unauthorized();
  }

  return { sub: payload.sub, tv: payload.tv };
}

function toUserDto(user: UserWithProfile): AuthUserDto {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}

function toProfileDto(user: UserWithProfile): ProfileDto {
  return {
    displayName: user.profile?.displayName ?? null,
    avatarUrl: user.profile?.avatarUrl ?? null,
    onboardingCompletedAt: user.profile?.onboardingCompletedAt?.toISOString() ?? null,
  };
}

function assertActive(user: UserWithProfile): void {
  if (user.status !== 'active') {
    throw AppError.forbidden('Conta banida ou inativa');
  }
}

async function issueAuthResult(user: UserWithProfile): Promise<AuthResult> {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(user),
    signRefreshToken(user),
  ]);

  return { accessToken, refreshToken, user: toUserDto(user), profile: toProfileDto(user) };
}

export async function registerWithPassword(input: RegisterBody): Promise<AuthResult> {
  const email = normalizeEmail(input.email);

  const existing = await findUserByEmail(email);

  if (existing) {
    throw AppError.conflict('Email ja cadastrado');
  }

  const passwordHash = await argon2.hash(input.password);
  const user = await createUserWithProfile({
    email,
    passwordHash,
    displayName: input.displayName ?? null,
  });

  return issueAuthResult(user);
}

export async function loginWithPassword(input: LoginBody): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const user = await findUserByEmail(email);

  // Mesma mensagem para email inexistente e senha errada: nao vira oraculo de contas cadastradas.
  if (!user || !user.passwordHash) {
    throw AppError.unauthorized('Credenciais invalidas');
  }

  const valid = await argon2.verify(user.passwordHash, input.password);

  if (!valid) {
    throw AppError.unauthorized('Credenciais invalidas');
  }

  assertActive(user);

  return issueAuthResult(user);
}

export async function loginOrLinkOAuth(
  provider: OAuthProviderName,
  token: string,
): Promise<AuthResult> {
  const identity =
    provider === 'google'
      ? await verifyGoogleIdToken(token)
      : await verifyAppleIdentityToken(token);

  let user = await findUserByOAuth(provider, identity.subject);

  if (!user) {
    const email = normalizeEmail(identity.email);
    const byEmail = await findUserByEmail(email);

    // Conta ja existia (criada via /auth/register): vincula em vez de duplicar, preservando
    // planilhas/historico que ja pendurem em `byEmail.id`.
    user = byEmail
      ? await linkOAuthToUser(byEmail.id, provider, identity.subject)
      : await createUserWithProfile({
          email,
          oauthProvider: provider,
          oauthSubject: identity.subject,
        });
  }

  assertActive(user);

  return issueAuthResult(user);
}

export async function refreshSession(refreshToken: string): Promise<{ accessToken: string }> {
  const claims = await verifyRefreshToken(refreshToken);
  const user = await findUserById(claims.sub);

  if (!user) {
    throw AppError.unauthorized();
  }

  assertActive(user);

  // `tokenVersion` diferente do `tv` gravado no token = sessao encerrada via logout.
  if (user.tokenVersion !== claims.tv) {
    throw AppError.unauthorized('Sessao invalidada');
  }

  return { accessToken: await signAccessToken(user) };
}

export async function logout(userId: string): Promise<void> {
  await incrementTokenVersion(userId);
}

/**
 * Dados de boot do app. Inclui a dieta ativa (dashboard "Dieta ativa / proxima refeicao")
 * para o client nao precisar de uma segunda chamada; os endpoints de login nao a trazem.
 */
export async function getMe(
  userId: string,
): Promise<{ user: AuthUserDto; profile: ProfileDto; activeDiet: DietSummary | null }> {
  const [user, activeDiet] = await Promise.all([
    findUserById(userId),
    getActiveDietSummary(userId),
  ]);

  if (!user) {
    throw AppError.unauthorized();
  }

  return { user: toUserDto(user), profile: toProfileDto(user), activeDiet };
}
