import type { TransactionClient } from '../../../shared/db/client.js';
import { AppError } from '../../../shared/errors/index.js';
import { uploadCatalogMedia } from '../admin.media.js';
import type { Page } from '../admin.schemas.js';
import { runAudited } from '../audit/audit.service.js';
import {
  createExercise,
  createMuscleGroup,
  findExercise,
  findExerciseNamed,
  findMuscleGroup,
  findMuscleGroupBySlug,
  findMuscleGroupNamed,
  listExercises,
  listMuscleGroups,
  updateExercise,
  updateMuscleGroup,
  type AdminExerciseRow,
  type MuscleGroupRow,
} from './admin-exercises.repository.js';
import type {
  AdminExerciseDto,
  CreateAdminExerciseBody,
  CreateMuscleGroupBody,
  ListAdminExercisesQuery,
  MuscleGroupDto,
  UpdateAdminExerciseBody,
  UpdateMuscleGroupBody,
} from './admin-exercises.schemas.js';

function toExerciseDto(row: AdminExerciseRow): AdminExerciseDto {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscleGroup
      ? { id: row.muscleGroup.id, slug: row.muscleGroup.slug, name: row.muscleGroup.name }
      : null,
    isActive: row.isActive,
    mediaUrl: row.mediaUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMuscleGroupDto(row: MuscleGroupRow): MuscleGroupDto {
  return { id: row.id, slug: row.slug, name: row.name, exerciseCount: row._count.exercises };
}

/** 'Posterior de Coxa' -> 'posterior-de-coxa'; 'Glúteos' -> 'gluteos'. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/** Snapshot enxuto gravado no audit log (antes/depois). */
function exerciseSnapshot(row: AdminExerciseRow) {
  return {
    name: row.name,
    muscleGroup: row.muscleGroup?.slug ?? null,
    isActive: row.isActive,
    mediaUrl: row.mediaUrl,
  };
}

async function resolveMuscleGroupId(
  tx: TransactionClient,
  slug: string | null | undefined,
): Promise<string | null | undefined> {
  if (slug === undefined || slug === null) {
    return slug;
  }

  const group = await findMuscleGroupBySlug(tx, slug);

  if (!group) {
    throw AppError.badRequest(`Grupo muscular '${slug}' nao existe`);
  }

  return group.id;
}

async function assertExerciseNameFree(tx: TransactionClient, name: string, exceptId?: string) {
  if (await findExerciseNamed(tx, name, exceptId)) {
    throw AppError.conflict(`Ja existe exercicio no catalogo chamado '${name}'`);
  }
}

export async function getAdminExercises(
  query: ListAdminExercisesQuery,
): Promise<Page<AdminExerciseDto>> {
  const { items, total } = await listExercises({
    search: query.q,
    muscleGroupSlug: query.muscleGroup,
    isActive: query.status === 'all' ? undefined : query.status === 'active',
    page: query.page,
    limit: query.limit,
  });

  return { items: items.map(toExerciseDto), total, page: query.page, limit: query.limit };
}

export async function addAdminExercise(
  actorId: string,
  input: CreateAdminExerciseBody,
): Promise<AdminExerciseDto> {
  const mediaUrl = input.media ? await uploadCatalogMedia(input.media) : null;

  return runAudited(actorId, async (tx, log) => {
    await assertExerciseNameFree(tx, input.name);

    const created = await createExercise(tx, {
      name: input.name,
      muscleGroupId: (await resolveMuscleGroupId(tx, input.muscleGroupSlug)) ?? null,
      isActive: input.isActive,
      mediaUrl,
    });

    await log({
      action: 'exercise.created',
      targetType: 'exercise',
      targetId: created.id,
      metadata: { after: exerciseSnapshot(created) },
    });

    return toExerciseDto(created);
  });
}

async function requireExercise(tx: TransactionClient, id: string): Promise<AdminExerciseRow> {
  const exercise = await findExercise(tx, id);

  if (!exercise) {
    throw AppError.notFound('Exercicio nao encontrado');
  }

  return exercise;
}

export async function editAdminExercise(
  actorId: string,
  id: string,
  input: UpdateAdminExerciseBody,
): Promise<AdminExerciseDto> {
  const uploadedUrl = input.media ? await uploadCatalogMedia(input.media) : undefined;

  return runAudited(actorId, async (tx, log) => {
    const before = await requireExercise(tx, id);

    if (input.name !== undefined) {
      await assertExerciseNameFree(tx, input.name, id);
    }

    const updated = await updateExercise(tx, id, {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.muscleGroupSlug === undefined
        ? {}
        : { muscleGroupId: await resolveMuscleGroupId(tx, input.muscleGroupSlug) }),
      ...(uploadedUrl === undefined ? {} : { mediaUrl: uploadedUrl }),
      ...(input.mediaUrl === null ? { mediaUrl: null } : {}),
    });

    await log({
      action: 'exercise.updated',
      targetType: 'exercise',
      targetId: id,
      metadata: { before: exerciseSnapshot(before), after: exerciseSnapshot(updated) },
    });

    return toExerciseDto(updated);
  });
}

/**
 * Desativar tira o exercicio do catalogo (`GET /exercises`) e impede novas referencias em
 * planilhas/sessoes; o que ja foi registrado continua apontando para ele. Repetir o status
 * atual e no-op e nao gera audit log.
 */
export function setAdminExerciseStatus(
  actorId: string,
  id: string,
  isActive: boolean,
): Promise<AdminExerciseDto> {
  return runAudited(actorId, async (tx, log) => {
    const before = await requireExercise(tx, id);

    if (before.isActive === isActive) {
      return toExerciseDto(before);
    }

    const updated = await updateExercise(tx, id, { isActive });

    await log({
      action: 'exercise.status_changed',
      targetType: 'exercise',
      targetId: id,
      metadata: { from: before.isActive, to: isActive },
    });

    return toExerciseDto(updated);
  });
}

export async function getMuscleGroups(): Promise<MuscleGroupDto[]> {
  return (await listMuscleGroups()).map(toMuscleGroupDto);
}

async function assertMuscleGroupFree(
  tx: TransactionClient,
  data: { name?: string; slug?: string },
  exceptId?: string,
) {
  if (data.name !== undefined && (await findMuscleGroupNamed(tx, data.name, exceptId))) {
    throw AppError.conflict(`Ja existe grupo muscular chamado '${data.name}'`);
  }

  if (data.slug !== undefined) {
    const sameSlug = await findMuscleGroupBySlug(tx, data.slug);

    if (sameSlug && sameSlug.id !== exceptId) {
      throw AppError.conflict(`Slug '${data.slug}' ja esta em uso`);
    }
  }
}

export async function addMuscleGroup(
  actorId: string,
  input: CreateMuscleGroupBody,
): Promise<MuscleGroupDto> {
  const slug = input.slug ?? slugify(input.name);

  if (!slug) {
    throw AppError.badRequest('Nao foi possivel derivar um slug do nome; envie `slug`');
  }

  return runAudited(actorId, async (tx, log) => {
    await assertMuscleGroupFree(tx, { name: input.name, slug });

    const created = await createMuscleGroup(tx, { name: input.name, slug });

    await log({
      action: 'muscle_group.created',
      targetType: 'muscle_group',
      targetId: created.id,
      metadata: { after: { name: created.name, slug: created.slug } },
    });

    return toMuscleGroupDto(created);
  });
}

export function editMuscleGroup(
  actorId: string,
  id: string,
  input: UpdateMuscleGroupBody,
): Promise<MuscleGroupDto> {
  return runAudited(actorId, async (tx, log) => {
    const before = await findMuscleGroup(tx, id);

    if (!before) {
      throw AppError.notFound('Grupo muscular nao encontrado');
    }

    await assertMuscleGroupFree(tx, input, id);

    const updated = await updateMuscleGroup(tx, id, input);

    await log({
      action: 'muscle_group.updated',
      targetType: 'muscle_group',
      targetId: id,
      metadata: {
        before: { name: before.name, slug: before.slug },
        after: { name: updated.name, slug: updated.slug },
      },
    });

    return toMuscleGroupDto(updated);
  });
}
