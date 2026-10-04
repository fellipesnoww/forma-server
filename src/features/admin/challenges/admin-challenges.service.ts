import { isDeepStrictEqual } from 'node:util';

import { prisma, type TransactionClient } from '../../../shared/db/client.js';
import { AppError } from '../../../shared/errors/index.js';
import type { ChallengeGoal } from '../../../shared/gamification/index.js';
import { isDefaultActivityType } from '../../activities/index.js';
import type { Page } from '../admin.schemas.js';
import { countAchievementsForChallenge } from '../achievements/admin-achievements.repository.js';
import { runAudited } from '../audit/audit.service.js';
import {
  createChallenge,
  deleteChallenge,
  findChallenge,
  listChallenges,
  updateChallenge,
  type ChallengeRow,
} from './admin-challenges.repository.js';
import type {
  ChallengeDto,
  ChallengePeriod,
  CreateChallengeBody,
  ListChallengesQuery,
  UpdateChallengeBody,
} from './admin-challenges.schemas.js';

/** `endsAt` exclusivo: no instante exato do fim o desafio ja esta encerrado. */
export function challengePeriod(startsAt: Date, endsAt: Date, now: Date): ChallengePeriod {
  if (now < startsAt) {
    return 'upcoming';
  }

  return now < endsAt ? 'ongoing' : 'ended';
}

function toDto(row: ChallengeRow, now = new Date()): ChallengeDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    // So entra no banco depois de passar por `challengeGoalSchema`
    goal: row.goal as ChallengeGoal,
    reward: row.reward,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    isActive: row.isActive,
    period: challengePeriod(row.startsAt, row.endsAt, now),
    participantCount: row._count.participants,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function snapshot(row: ChallengeRow) {
  return {
    name: row.name,
    description: row.description,
    goal: row.goal,
    reward: row.reward,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    isActive: row.isActive,
  };
}

/** Desafio e global: so tipos de atividade padrao fazem sentido (custom e de um usuario so). */
async function assertGoalReferences(goal: ChallengeGoal) {
  if (
    goal.type !== 'workout_count' &&
    goal.activityTypeId &&
    !(await isDefaultActivityType(goal.activityTypeId))
  ) {
    throw AppError.badRequest(`Tipo de atividade padrao '${goal.activityTypeId}' nao existe`, {
      field: 'goal.activityTypeId',
    });
  }
}

async function requireChallenge(tx: TransactionClient, id: string): Promise<ChallengeRow> {
  const challenge = await findChallenge(tx, id);

  if (!challenge) {
    throw AppError.notFound('Desafio nao encontrado');
  }

  return challenge;
}

export async function getChallenges(query: ListChallengesQuery): Promise<Page<ChallengeDto>> {
  const now = new Date();
  const { items, total } = await listChallenges({
    search: query.q,
    isActive: query.status === 'all' ? undefined : query.status === 'active',
    period: query.period,
    now,
    page: query.page,
    limit: query.limit,
  });

  return {
    items: items.map((row) => toDto(row, now)),
    total,
    page: query.page,
    limit: query.limit,
  };
}

export async function getChallenge(id: string): Promise<ChallengeDto> {
  return toDto(await requireChallenge(prisma, id));
}

export async function addChallenge(
  actorId: string,
  input: CreateChallengeBody,
): Promise<ChallengeDto> {
  await assertGoalReferences(input.goal);

  return runAudited(actorId, async (tx, log) => {
    const created = await createChallenge(tx, {
      name: input.name,
      description: input.description ?? null,
      goal: input.goal,
      reward: input.reward ?? null,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      isActive: input.isActive,
    });

    await log({
      action: 'challenge.created',
      targetType: 'challenge',
      targetId: created.id,
      metadata: { after: snapshot(created) },
    });

    return toDto(created);
  });
}

/**
 * A meta fica congelada depois que alguem entrou: `user_challenges.progress` esta na unidade
 * da meta (treinos, atividades ou minutos) e trocar a regra no meio invalidaria o ranking.
 * Periodo, nome, recompensa e status continuam editaveis.
 */
export async function editChallenge(
  actorId: string,
  id: string,
  input: UpdateChallengeBody,
): Promise<ChallengeDto> {
  if (input.goal) {
    await assertGoalReferences(input.goal);
  }

  return runAudited(actorId, async (tx, log) => {
    const before = await requireChallenge(tx, id);

    const startsAt = input.startsAt ? new Date(input.startsAt) : before.startsAt;
    const endsAt = input.endsAt ? new Date(input.endsAt) : before.endsAt;

    if (endsAt <= startsAt) {
      throw AppError.badRequest('endsAt precisa ser depois de startsAt', {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      });
    }

    const goalChanged = input.goal !== undefined && !isDeepStrictEqual(input.goal, before.goal);

    if (goalChanged && before._count.participants > 0) {
      throw AppError.conflict('A meta nao pode mudar depois que usuarios entraram no desafio', {
        participantCount: before._count.participants,
      });
    }

    const updated = await updateChallenge(tx, id, {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(goalChanged && input.goal ? { goal: input.goal } : {}),
      ...(input.reward === undefined ? {} : { reward: input.reward }),
      ...(input.startsAt === undefined ? {} : { startsAt }),
      ...(input.endsAt === undefined ? {} : { endsAt }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    });

    await log({
      action: 'challenge.updated',
      targetType: 'challenge',
      targetId: id,
      metadata: { before: snapshot(before), after: snapshot(updated) },
    });

    return toDto(updated);
  });
}

/**
 * Exclusao so de desafio sem participantes e sem conquista que dependa dele
 * (`criteria.type = challenge_complete`); caso contrario, desative.
 */
export function removeChallenge(actorId: string, id: string): Promise<void> {
  return runAudited(actorId, async (tx, log) => {
    const before = await requireChallenge(tx, id);

    if (before._count.participants > 0) {
      throw AppError.conflict(
        'Desafio com participantes; desative (isActive: false) em vez de excluir',
        { participantCount: before._count.participants },
      );
    }

    const dependents = await countAchievementsForChallenge(tx, id);

    if (dependents > 0) {
      throw AppError.conflict('Desafio referenciado por conquistas (challenge_complete)', {
        achievementCount: dependents,
      });
    }

    await deleteChallenge(tx, id);
    await log({
      action: 'challenge.deleted',
      targetType: 'challenge',
      targetId: id,
      metadata: { before: snapshot(before) },
    });
  });
}
