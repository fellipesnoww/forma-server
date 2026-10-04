import { prisma, type TransactionClient } from '../../../shared/db/client.js';
import { AppError } from '../../../shared/errors/index.js';
import type { AchievementCriteria } from '../../../shared/gamification/index.js';
import { uploadCatalogMedia } from '../admin.media.js';
import type { Page, PaginationQuery } from '../admin.schemas.js';
import { runAudited } from '../audit/audit.service.js';
import { findChallenge } from '../challenges/admin-challenges.repository.js';
import {
  createAchievement,
  deleteAchievement,
  findAchievement,
  findAchievementNamed,
  listAchievements,
  listUnlocks,
  updateAchievement,
  type AchievementRow,
} from './admin-achievements.repository.js';
import type {
  AchievementDto,
  AchievementUnlockDto,
  CreateAchievementBody,
  ListAchievementsQuery,
  UpdateAchievementBody,
} from './admin-achievements.schemas.js';

function toDto(row: AchievementRow): AchievementDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    iconUrl: row.iconUrl,
    // So entra no banco depois de passar por `achievementCriteriaSchema`
    criteria: row.criteria as AchievementCriteria,
    isActive: row.isActive,
    unlockCount: row._count.unlocks,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function snapshot(row: AchievementRow) {
  return {
    name: row.name,
    description: row.description,
    iconUrl: row.iconUrl,
    criteria: row.criteria,
    isActive: row.isActive,
  };
}

/** O JSON ja passou pelo Zod; aqui so o que depende do banco. */
async function assertCriteriaReferences(tx: TransactionClient, criteria: AchievementCriteria) {
  if (criteria.type === 'challenge_complete' && !(await findChallenge(tx, criteria.challengeId))) {
    throw AppError.badRequest(`Desafio '${criteria.challengeId}' nao existe`, {
      field: 'criteria.challengeId',
    });
  }
}

async function assertNameFree(tx: TransactionClient, name: string, exceptId?: string) {
  if (await findAchievementNamed(tx, name, exceptId)) {
    throw AppError.conflict(`Ja existe conquista chamada '${name}'`);
  }
}

async function requireAchievement(tx: TransactionClient, id: string): Promise<AchievementRow> {
  const achievement = await findAchievement(tx, id);

  if (!achievement) {
    throw AppError.notFound('Conquista nao encontrada');
  }

  return achievement;
}

export async function getAchievements(query: ListAchievementsQuery): Promise<Page<AchievementDto>> {
  const { items, total } = await listAchievements({
    search: query.q,
    isActive: query.status === 'all' ? undefined : query.status === 'active',
    page: query.page,
    limit: query.limit,
  });

  return { items: items.map(toDto), total, page: query.page, limit: query.limit };
}

export async function getAchievement(id: string): Promise<AchievementDto> {
  return toDto(await requireAchievement(prisma, id));
}

export async function addAchievement(
  actorId: string,
  input: CreateAchievementBody,
): Promise<AchievementDto> {
  const iconUrl = input.icon ? await uploadCatalogMedia(input.icon) : null;

  return runAudited(actorId, async (tx, log) => {
    await assertNameFree(tx, input.name);
    await assertCriteriaReferences(tx, input.criteria);

    const created = await createAchievement(tx, {
      name: input.name,
      description: input.description ?? null,
      iconUrl,
      criteria: input.criteria,
      isActive: input.isActive,
    });

    await log({
      action: 'achievement.created',
      targetType: 'achievement',
      targetId: created.id,
      metadata: { after: snapshot(created) },
    });

    return toDto(created);
  });
}

/**
 * Trocar o criterio nao revoga desbloqueios ja concedidos: quem desbloqueou pela regra antiga
 * mantem a conquista (o motor da 4.1 so avalia daqui para frente).
 */
export async function editAchievement(
  actorId: string,
  id: string,
  input: UpdateAchievementBody,
): Promise<AchievementDto> {
  const uploadedIconUrl = input.icon ? await uploadCatalogMedia(input.icon) : undefined;

  return runAudited(actorId, async (tx, log) => {
    const before = await requireAchievement(tx, id);

    if (input.name !== undefined) {
      await assertNameFree(tx, input.name, id);
    }

    if (input.criteria) {
      await assertCriteriaReferences(tx, input.criteria);
    }

    const updated = await updateAchievement(tx, id, {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.criteria === undefined ? {} : { criteria: input.criteria }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(uploadedIconUrl === undefined ? {} : { iconUrl: uploadedIconUrl }),
      ...(input.iconUrl === null ? { iconUrl: null } : {}),
    });

    await log({
      action: 'achievement.updated',
      targetType: 'achievement',
      targetId: id,
      metadata: { before: snapshot(before), after: snapshot(updated) },
    });

    return toDto(updated);
  });
}

/** Conquista ja desbloqueada nao e apagada (sumiria do perfil de quem a tem): desative. */
export function removeAchievement(actorId: string, id: string): Promise<void> {
  return runAudited(actorId, async (tx, log) => {
    const before = await requireAchievement(tx, id);

    if (before._count.unlocks > 0) {
      throw AppError.conflict(
        'Conquista ja desbloqueada por usuarios; desative (isActive: false) em vez de excluir',
        { unlockCount: before._count.unlocks },
      );
    }

    await deleteAchievement(tx, id);
    await log({
      action: 'achievement.deleted',
      targetType: 'achievement',
      targetId: id,
      metadata: { before: snapshot(before) },
    });
  });
}

export async function getAchievementUnlocks(
  id: string,
  query: PaginationQuery,
): Promise<Page<AchievementUnlockDto>> {
  await getAchievement(id);

  const { items, total } = await listUnlocks(id, query.page, query.limit);

  return {
    items: items.map((unlock) => ({
      userId: unlock.user.id,
      email: unlock.user.email,
      displayName: unlock.user.profile?.displayName ?? null,
      unlockedAt: unlock.unlockedAt.toISOString(),
    })),
    total,
    page: query.page,
    limit: query.limit,
  };
}
