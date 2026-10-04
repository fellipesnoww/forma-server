import type { ActivityType } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors/index.js';
import { dbMediaStorage } from '../../shared/media/index.js';
import {
  activityTypeVisibleToUser,
  createActivity,
  createActivityType,
  deleteActivity,
  findActivity,
  findVisibleActivityTypeByName,
  findVisibleActivityTypes,
  listActivities,
  updateActivity,
  type ActivityRow,
} from './activities.repository.js';
import type {
  CreateActivityBody,
  CreateActivityTypeBody,
  ListActivitiesQuery,
  UpdateActivityBody,
  UploadActivityPhotoBody,
} from './activities.schemas.js';

export interface ActivityTypeDto {
  id: string;
  name: string;
  source: 'default' | 'custom';
}

export interface ActivityDto {
  id: string;
  activityTypeId: string;
  activityTypeName: string;
  performedAt: string;
  durationMinutes: number;
  comment: string | null;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

function toTypeDto(type: ActivityType): ActivityTypeDto {
  return { id: type.id, name: type.name, source: type.userId === null ? 'default' : 'custom' };
}

function toActivityDto(activity: ActivityRow): ActivityDto {
  return {
    id: activity.id,
    activityTypeId: activity.activityTypeId,
    activityTypeName: activity.activityType.name,
    performedAt: activity.performedAt.toISOString(),
    durationMinutes: activity.durationMinutes,
    comment: activity.comment,
    photoUrl: activity.photoUrl,
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
  };
}

export async function listActivityTypes(userId: string): Promise<ActivityTypeDto[]> {
  return (await findVisibleActivityTypes(userId)).map(toTypeDto);
}

/**
 * Nome unico (case-insensitive) entre os tipos que o usuario enxerga: um "corrida" custom ao
 * lado do "Corrida" padrao so duplicaria a lista do client. Checagem na aplicacao, sem indice
 * unico — duas criacoes concorrentes com o mesmo nome podem passar (ver sdd/2.1).
 */
export async function addActivityType(
  userId: string,
  input: CreateActivityTypeBody,
): Promise<ActivityTypeDto> {
  if (await findVisibleActivityTypeByName(userId, input.name)) {
    throw AppError.conflict(`Ja existe um tipo de atividade chamado '${input.name}'`);
  }

  return toTypeDto(await createActivityType(userId, input.name));
}

async function requireVisibleActivityType(userId: string, activityTypeId: string): Promise<void> {
  if (!(await activityTypeVisibleToUser(userId, activityTypeId))) {
    throw AppError.badRequest('Tipo de atividade nao encontrado ou nao pertence ao usuario');
  }
}

async function requireActivity(userId: string, id: string): Promise<ActivityRow> {
  const activity = await findActivity(userId, id);

  if (!activity) {
    throw AppError.notFound('Atividade nao encontrada');
  }

  return activity;
}

export async function addActivity(userId: string, input: CreateActivityBody): Promise<ActivityDto> {
  await requireVisibleActivityType(userId, input.activityTypeId);

  const activity = await createActivity(userId, {
    activityTypeId: input.activityTypeId,
    performedAt: input.performedAt ? new Date(input.performedAt) : undefined,
    durationMinutes: input.durationMinutes,
    comment: input.comment,
  });

  return toActivityDto(activity);
}

export async function getActivity(userId: string, id: string): Promise<ActivityDto> {
  return toActivityDto(await requireActivity(userId, id));
}

export async function editActivity(
  userId: string,
  id: string,
  input: UpdateActivityBody,
): Promise<ActivityDto> {
  await requireActivity(userId, id);

  if (input.activityTypeId) {
    await requireVisibleActivityType(userId, input.activityTypeId);
  }

  const activity = await updateActivity(id, {
    activityTypeId: input.activityTypeId,
    performedAt: input.performedAt ? new Date(input.performedAt) : undefined,
    durationMinutes: input.durationMinutes,
    comment: input.comment,
    photoUrl: input.photoUrl,
  });

  return toActivityDto(activity);
}

/** Exclusao fisica: atividade nao e referenciada por nada. A foto em `media_assets` fica. */
export async function removeActivity(userId: string, id: string): Promise<void> {
  await requireActivity(userId, id);
  await deleteActivity(id);
}

/** Mesma decisao da foto de sessao (1.5): `dbMediaStorage` sem compressao/resize. */
export async function uploadActivityPhoto(
  userId: string,
  id: string,
  input: UploadActivityPhotoBody,
): Promise<string> {
  await requireActivity(userId, id);

  const stored = await dbMediaStorage.upload({
    data: input.data,
    declaredMimeType: input.mimeType,
    filename: input.filename,
    ownerId: userId,
  });

  await updateActivity(id, { photoUrl: stored.url });

  return stored.url;
}

export async function getActivities(
  userId: string,
  query: ListActivitiesQuery,
): Promise<{ items: ActivityDto[]; total: number; page: number; limit: number }> {
  const { items, total } = await listActivities(userId, {
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    page: query.page,
    limit: query.limit,
  });

  return { items: items.map(toActivityDto), total, page: query.page, limit: query.limit };
}
