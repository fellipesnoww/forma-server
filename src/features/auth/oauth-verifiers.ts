import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';

import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/index.js';

export interface VerifiedOAuthIdentity {
  subject: string;
  email: string;
  /** Google manda `name`/`picture` com o escopo `profile`; Apple nunca manda no token. */
  name: string | null;
  picture: string | null;
}

function optionalClaim(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

/** Google emite `iss` com ou sem esquema a depender do fluxo; aceitar os dois evita 401 falso. */
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const APPLE_ISSUERS = ['https://appleid.apple.com'];

function normalizeEmailVerified(value: unknown): boolean {
  // Google manda boolean; Apple manda string "true"/"false" no identity token.
  return value === true || value === 'true';
}

/**
 * Monta a causa interna da falha (vai so para o log, nunca para a resposta): motivo do
 * `jose` + claims nao sensiveis, para diagnosticar `aud` errado, token expirado ou
 * access token enviado no lugar do id token.
 */
function describeVerifyFailure(token: string, audience: string[], error: unknown): Error {
  const reason = error instanceof Error ? error.message : String(error);
  let claims: Record<string, unknown> = { decodable: false };

  try {
    const { aud, azp, iss, exp } = decodeJwt(token);
    claims = { aud, azp, iss, exp, expired: typeof exp === 'number' && exp * 1000 < Date.now() };
  } catch {
    // Nao e JWT (provavelmente access token em vez de id token).
  }

  return new Error(
    `OAuth verify failed: ${reason} | claims=${JSON.stringify(claims)} | expectedAud=${JSON.stringify(audience)}`,
    { cause: error },
  );
}

async function verifyIdToken(
  token: string,
  jwks: ReturnType<typeof createRemoteJWKSet>,
  issuers: string[],
  audience: string[],
  invalidMessage: string,
): Promise<VerifiedOAuthIdentity> {
  let payload;

  try {
    ({ payload } = await jwtVerify(token, jwks, { issuer: issuers, audience }));
  } catch (error) {
    const appError = AppError.unauthorized(invalidMessage);
    appError.cause = describeVerifyFailure(token, audience, error);
    throw appError;
  }

  const email = typeof payload.email === 'string' ? payload.email : null;

  if (!payload.sub || !email || !normalizeEmailVerified(payload.email_verified)) {
    throw AppError.unauthorized(invalidMessage);
  }

  return {
    subject: payload.sub,
    email,
    name: optionalClaim(payload.name)?.slice(0, 120) ?? null,
    picture: optionalClaim(payload.picture),
  };
}

export function verifyGoogleIdToken(idToken: string): Promise<VerifiedOAuthIdentity> {
  return verifyIdToken(
    idToken,
    GOOGLE_JWKS,
    GOOGLE_ISSUERS,
    env.GOOGLE_CLIENT_ID,
    'Token do Google invalido',
  );
}

export function verifyAppleIdentityToken(identityToken: string): Promise<VerifiedOAuthIdentity> {
  return verifyIdToken(
    identityToken,
    APPLE_JWKS,
    APPLE_ISSUERS,
    env.APPLE_CLIENT_ID,
    'Token da Apple invalido',
  );
}
