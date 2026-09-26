import { z } from 'zod';

import { ROLES } from '../../shared/auth/index.js';

const roleSchema = z.enum(ROLES);
const statusSchema = z.enum(['active', 'inactive', 'banned']);

export const registerBodySchema = z.object({
  email: z.email(),
  // Minimo 8, ao menos uma letra e um digito — "regras basicas" pedidas pelo roadmap,
  // sem spec adicional.
  password: z
    .string()
    .min(8, 'Minimo de 8 caracteres')
    .regex(/[A-Za-z]/, 'Deve conter ao menos uma letra')
    .regex(/[0-9]/, 'Deve conter ao menos um digito'),
  displayName: z.string().min(1).max(120).optional(),
});

export const loginBodySchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const googleAuthBodySchema = z.object({
  idToken: z.string().min(1),
});

export const appleAuthBodySchema = z.object({
  identityToken: z.string().min(1),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});

const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: roleSchema,
  status: statusSchema,
});

const profileSchema = z.object({
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  onboardingCompletedAt: z.iso.datetime().nullable(),
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: userSchema,
  profile: profileSchema,
});

export const refreshResponseSchema = z.object({
  accessToken: z.string(),
});

export const meResponseSchema = z.object({
  user: userSchema,
  profile: profileSchema,
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type GoogleAuthBody = z.infer<typeof googleAuthBodySchema>;
export type AppleAuthBody = z.infer<typeof appleAuthBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
