import { AppError } from '../../shared/errors/index.js';
import { dbMediaStorage } from '../../shared/media/index.js';
import { DEFAULT_TIMEZONE } from '../../shared/validation/index.js';
import {
  createMeasurement,
  findProfileByUserId,
  listMeasurements,
  updateAvatarUrl,
  updateProfile,
  type MeasurementRow,
  type ProfileRow,
} from './profile.repository.js';
import type {
  CreateMeasurementBody,
  ListMeasurementsQuery,
  UpdateProfileBody,
  UploadAvatarBody,
} from './profile.schemas.js';

export interface ProfileDto {
  displayName: string | null;
  avatarUrl: string | null;
  weightKg: number | null;
  heightCm: number | null;
  waistCm: number | null;
  chestCm: number | null;
  onboardingCompletedAt: string | null;
  timezone: string;
}

export interface MeasurementDto {
  id: string;
  weightKg: number | null;
  heightCm: number | null;
  waistCm: number | null;
  chestCm: number | null;
  createdAt: string;
}

function toProfileDto(profile: ProfileRow): ProfileDto {
  return {
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    waistCm: profile.waistCm,
    chestCm: profile.chestCm,
    onboardingCompletedAt: profile.onboardingCompletedAt?.toISOString() ?? null,
    timezone: profile.timezone,
  };
}

function toMeasurementDto(measurement: MeasurementRow): MeasurementDto {
  return {
    id: measurement.id,
    weightKg: measurement.weightKg,
    heightCm: measurement.heightCm,
    waistCm: measurement.waistCm,
    chestCm: measurement.chestCm,
    createdAt: measurement.createdAt.toISOString(),
  };
}

async function requireProfile(userId: string): Promise<ProfileRow> {
  const profile = await findProfileByUserId(userId);

  // Toda conta ganha um `user_profiles` no cadastro (nested write em `createUserWithProfile`,
  // Fase 1.1); chegar aqui sem perfil indica um bug em outro lugar, nao um caso de negocio.
  if (!profile) {
    throw AppError.notFound('Perfil nao encontrado');
  }

  return profile;
}

export async function getProfile(userId: string): Promise<ProfileDto> {
  return toProfileDto(await requireProfile(userId));
}

export async function patchProfile(userId: string, input: UpdateProfileBody): Promise<ProfileDto> {
  await requireProfile(userId);

  const profile = await updateProfile(userId, input);

  return toProfileDto(profile);
}

export async function addMeasurement(
  userId: string,
  input: CreateMeasurementBody,
): Promise<MeasurementDto> {
  await requireProfile(userId);

  return toMeasurementDto(await createMeasurement(userId, input));
}

export async function getMeasurements(
  userId: string,
  query: ListMeasurementsQuery,
): Promise<{ items: MeasurementDto[]; total: number; page: number; limit: number }> {
  const { items, total } = await listMeasurements(userId, {
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    page: query.page,
    limit: query.limit,
  });

  return { items: items.map(toMeasurementDto), total, page: query.page, limit: query.limit };
}

/**
 * Upload de avatar reaproveita `dbMediaStorage` (Fase 0) tal como esta: sem resize/WebP
 * nem limite de 2 MB dedicado (mesmo descope ja documentado em `sdd/fase-0-fundacao-tecnica.md`).
 * Valida contra o limite global `MEDIA_MAX_SIZE_MB`.
 */
export async function uploadAvatar(userId: string, input: UploadAvatarBody): Promise<string> {
  await requireProfile(userId);

  const stored = await dbMediaStorage.upload({
    data: input.data,
    declaredMimeType: input.mimeType,
    filename: input.filename,
    ownerId: userId,
  });

  await updateAvatarUrl(userId, stored.url);

  return stored.url;
}

/**
 * Fuso do usuario para as features que agrupam por dia local (calendario 2.2, progressao 2.4).
 * Sem perfil cai no default da coluna em vez de falhar: a agregacao continua respondendo.
 */
export async function getUserTimezone(userId: string): Promise<string> {
  return (await findProfileByUserId(userId))?.timezone ?? DEFAULT_TIMEZONE;
}
