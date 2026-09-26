import { createRemoteJWKSet, jwtVerify } from 'jose';

import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/index.js';

export interface VerifiedOAuthIdentity {
  subject: string;
  email: string;
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

async function verifyIdToken(
  token: string,
  jwks: ReturnType<typeof createRemoteJWKSet>,
  issuers: string[],
  audience: string,
  invalidMessage: string,
): Promise<VerifiedOAuthIdentity> {
  let payload;

  try {
    ({ payload } = await jwtVerify(token, jwks, { issuer: issuers, audience }));
  } catch {
    throw AppError.unauthorized(invalidMessage);
  }

  const email = typeof payload.email === 'string' ? payload.email : null;

  if (!payload.sub || !email || !normalizeEmailVerified(payload.email_verified)) {
    throw AppError.unauthorized(invalidMessage);
  }

  return { subject: payload.sub, email };
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
