/**
 * Cria 3 usuarios de demonstracao com historico realista: planilhas, sessoes com series e
 * progressao de carga, atividades livres e medidas corporais. Serve para ver o calendario
 * (2.2) e os graficos de progressao (2.4) com dados, e para o front montar telas.
 *
 *   yarn seed:demo
 *
 * Idempotente: apaga os 3 e-mails de demo (cascade leva todo o historico) e recria. Datas
 * sao relativas a hoje, entao rodar de novo "avanca" o historico. Deterministico: o ruido
 * usa PRNG com seed fixa por usuario. Ferramenta de desenvolvimento — nao roda em producao.
 *
 * Escreve direto no banco (e nao pela API) porque precisa de `createdAt` retroativo nas
 * medidas e de centenas de sessoes sem passar pelo rate limit.
 */
import * as argon2 from 'argon2';

import { env } from '../config/env.js';
import { prisma } from '../shared/db/client.js';
import { addDays, todayIn } from '../shared/time/index.js';

const PASSWORD = 'forma1234';
const TIMEZONE = 'America/Sao_Paulo';
/** Sao Paulo nao tem horario de verao desde 2019: offset fixo basta para montar os horarios. */
const UTC_OFFSET = '-03:00';

interface LiftPlan {
  /** Nome exato do catalogo, ou `custom:<nome>` para exercicio personalizado do usuario. */
  exercise: string;
  startKg: number;
  incrementKg: number;
  /** A carga sobe `incrementKg` a cada N semanas. */
  everyWeeks: number;
  sets: number;
  reps: number;
  /** Peso corporal: a progressao e em repeticoes (+1 a cada `everyWeeks`). */
  bodyweight?: boolean;
}

interface SheetDayPlan {
  weekday: number;
  lifts: LiftPlan[];
}

interface ActivityPlan {
  slug: string;
  weekdays: number[];
  minutes: [min: number, max: number];
  time: string;
  probability: number;
  comments?: string[];
}

interface MeasurementPlan {
  weightKg: [start: number, end: number];
  waistCm: [start: number, end: number];
  chestCm: [start: number, end: number];
  heightCm: number;
}

interface DemoUser {
  email: string;
  displayName: string;
  seed: number;
  weeks: number;
  sheetName: string;
  sessionTime: string;
  days: SheetDayPlan[];
  activities: ActivityPlan[];
  measurements: MeasurementPlan;
  /** Semanas (0 = a mais antiga) sem nenhum registro — ferias, doenca. */
  offWeeks?: number[];
  /** Semanas em que a carga nao sobe (platô). */
  stallWeeks?: number[];
  /** Semanas com 80% da carga (deload). */
  deloadWeeks?: number[];
  /** Chance de faltar a uma sessao planejada. */
  skipChance: number;
  sessionComments: string[];
}

const DEMO_USERS: DemoUser[] = [
  {
    email: 'ana.demo@forma.dev',
    displayName: 'Ana Souza',
    seed: 11,
    weeks: 16,
    sheetName: 'ABCD Hipertrofia',
    sessionTime: '18:30',
    skipChance: 0.05,
    sessionComments: [
      'Treino pesado hoje',
      'Boa energia',
      'Senti a carga nova',
      'Dormi mal, mas fui',
    ],
    days: [
      {
        weekday: 1,
        lifts: [
          {
            exercise: 'Supino reto com barra',
            startKg: 30,
            incrementKg: 2.5,
            everyWeeks: 2,
            sets: 4,
            reps: 10,
          },
          {
            exercise: 'Supino inclinado com halteres',
            startKg: 12,
            incrementKg: 1,
            everyWeeks: 3,
            sets: 3,
            reps: 10,
          },
          {
            exercise: 'Crucifixo máquina',
            startKg: 25,
            incrementKg: 2.5,
            everyWeeks: 3,
            sets: 3,
            reps: 12,
          },
          {
            exercise: 'Triceps pulley (corda)',
            startKg: 15,
            incrementKg: 2.5,
            everyWeeks: 3,
            sets: 3,
            reps: 12,
          },
        ],
      },
      {
        weekday: 2,
        lifts: [
          {
            exercise: 'Puxada frontal no pulley',
            startKg: 35,
            incrementKg: 2.5,
            everyWeeks: 2,
            sets: 4,
            reps: 10,
          },
          {
            exercise: 'Remada baixa no cabo',
            startKg: 30,
            incrementKg: 2.5,
            everyWeeks: 2,
            sets: 3,
            reps: 10,
          },
          {
            exercise: 'Rosca direta com barra',
            startKg: 15,
            incrementKg: 2.5,
            everyWeeks: 4,
            sets: 3,
            reps: 10,
          },
          {
            exercise: 'Rosca martelo',
            startKg: 8,
            incrementKg: 1,
            everyWeeks: 4,
            sets: 3,
            reps: 12,
          },
        ],
      },
      {
        weekday: 4,
        lifts: [
          {
            exercise: 'Agachamento livre com barra',
            startKg: 40,
            incrementKg: 5,
            everyWeeks: 2,
            sets: 4,
            reps: 8,
          },
          {
            exercise: 'Leg press 45',
            startKg: 100,
            incrementKg: 10,
            everyWeeks: 2,
            sets: 4,
            reps: 10,
          },
          {
            exercise: 'Cadeira extensora',
            startKg: 30,
            incrementKg: 2.5,
            everyWeeks: 2,
            sets: 3,
            reps: 12,
          },
          {
            exercise: 'Mesa flexora',
            startKg: 25,
            incrementKg: 2.5,
            everyWeeks: 3,
            sets: 3,
            reps: 12,
          },
          {
            exercise: 'Elevacao pelvica (hip thrust)',
            startKg: 50,
            incrementKg: 5,
            everyWeeks: 2,
            sets: 4,
            reps: 10,
          },
        ],
      },
      {
        weekday: 5,
        lifts: [
          {
            exercise: 'Desenvolvimento com halteres',
            startKg: 10,
            incrementKg: 1,
            everyWeeks: 3,
            sets: 4,
            reps: 10,
          },
          {
            exercise: 'Elevacao lateral com halteres',
            startKg: 5,
            incrementKg: 1,
            everyWeeks: 4,
            sets: 3,
            reps: 12,
          },
          {
            exercise: 'Face pull no cabo',
            startKg: 15,
            incrementKg: 2.5,
            everyWeeks: 4,
            sets: 3,
            reps: 15,
          },
          {
            exercise: 'Abdominal no cabo (ajoelhado)',
            startKg: 20,
            incrementKg: 2.5,
            everyWeeks: 4,
            sets: 3,
            reps: 15,
          },
        ],
      },
    ],
    activities: [
      { slug: 'yoga', weekdays: [0], minutes: [50, 70], time: '09:00', probability: 0.85 },
      {
        slug: 'caminhada',
        weekdays: [6],
        minutes: [30, 60],
        time: '08:00',
        probability: 0.5,
        comments: ['Parque Ibirapuera', 'Com o cachorro'],
      },
    ],
    measurements: { weightKg: [62, 60.5], waistCm: [72, 69], chestCm: [88, 89], heightCm: 165 },
  },
  {
    email: 'bruno.demo@forma.dev',
    displayName: 'Bruno Lima',
    seed: 23,
    weeks: 14,
    sheetName: 'Full body 3x',
    sessionTime: '07:00',
    skipChance: 0.12,
    stallWeeks: [5, 6],
    deloadWeeks: [7],
    sessionComments: ['Antes do trabalho', 'Corrido, treino curto', 'Recorde no terra!'],
    days: [
      {
        weekday: 1,
        lifts: [
          {
            exercise: 'Agachamento livre com barra',
            startKg: 80,
            incrementKg: 5,
            everyWeeks: 2,
            sets: 5,
            reps: 5,
          },
          {
            exercise: 'Supino reto com barra',
            startKg: 70,
            incrementKg: 2.5,
            everyWeeks: 2,
            sets: 5,
            reps: 5,
          },
          {
            exercise: 'Remada curvada com barra',
            startKg: 60,
            incrementKg: 2.5,
            everyWeeks: 2,
            sets: 4,
            reps: 8,
          },
        ],
      },
      {
        weekday: 3,
        lifts: [
          {
            exercise: 'Levantamento terra',
            startKg: 100,
            incrementKg: 5,
            everyWeeks: 2,
            sets: 3,
            reps: 5,
          },
          {
            exercise: 'Desenvolvimento militar com barra',
            startKg: 40,
            incrementKg: 2.5,
            everyWeeks: 3,
            sets: 4,
            reps: 6,
          },
          {
            exercise: 'Barra fixa (pull-up)',
            startKg: 0,
            incrementKg: 0,
            everyWeeks: 2,
            sets: 4,
            reps: 6,
            bodyweight: true,
          },
          {
            exercise: 'custom:Supino com corrente',
            startKg: 60,
            incrementKg: 2.5,
            everyWeeks: 2,
            sets: 4,
            reps: 6,
          },
        ],
      },
      {
        weekday: 5,
        lifts: [
          {
            exercise: 'Leg press 45',
            startKg: 180,
            incrementKg: 10,
            everyWeeks: 2,
            sets: 4,
            reps: 10,
          },
          {
            exercise: 'Supino inclinado com barra',
            startKg: 55,
            incrementKg: 2.5,
            everyWeeks: 2,
            sets: 4,
            reps: 8,
          },
          {
            exercise: 'Puxada frontal no pulley',
            startKg: 60,
            incrementKg: 2.5,
            everyWeeks: 3,
            sets: 4,
            reps: 10,
          },
          {
            exercise: 'Rosca direta com barra W',
            startKg: 30,
            incrementKg: 2.5,
            everyWeeks: 4,
            sets: 3,
            reps: 10,
          },
        ],
      },
    ],
    activities: [
      {
        slug: 'corrida',
        weekdays: [2, 4],
        minutes: [30, 45],
        time: '06:30',
        probability: 0.8,
        comments: ['5 km', 'Intervalado', '6 km leve'],
      },
      {
        slug: 'futebol',
        weekdays: [6],
        minutes: [80, 100],
        time: '10:00',
        probability: 0.9,
        comments: ['Pelada com os amigos', 'Ganhamos 5x3'],
      },
    ],
    measurements: { weightKg: [84, 80], waistCm: [92, 88], chestCm: [104, 105], heightCm: 180 },
  },
  {
    email: 'camila.demo@forma.dev',
    displayName: 'Camila Rocha',
    seed: 37,
    weeks: 10,
    sheetName: 'Treino A/B iniciante',
    sessionTime: '19:00',
    skipChance: 0.08,
    offWeeks: [5],
    sessionComments: [
      'Primeira vez sem ajuda do professor',
      'Gostei do treino B',
      'Cansada mas feliz',
    ],
    days: [
      {
        weekday: 1,
        lifts: [
          {
            exercise: 'Leg press 45',
            startKg: 60,
            incrementKg: 10,
            everyWeeks: 1,
            sets: 3,
            reps: 12,
          },
          {
            exercise: 'Cadeira extensora',
            startKg: 15,
            incrementKg: 5,
            everyWeeks: 2,
            sets: 3,
            reps: 12,
          },
          {
            exercise: 'Supino máquina',
            startKg: 20,
            incrementKg: 5,
            everyWeeks: 2,
            sets: 3,
            reps: 12,
          },
          {
            exercise: 'Puxada frontal no pulley',
            startKg: 25,
            incrementKg: 2.5,
            everyWeeks: 1,
            sets: 3,
            reps: 12,
          },
        ],
      },
      {
        weekday: 3,
        lifts: [
          {
            exercise: 'Agachamento no smith',
            startKg: 20,
            incrementKg: 5,
            everyWeeks: 2,
            sets: 3,
            reps: 12,
          },
          {
            exercise: 'Elevacao pelvica (hip thrust)',
            startKg: 30,
            incrementKg: 5,
            everyWeeks: 1,
            sets: 3,
            reps: 12,
          },
          {
            exercise: 'Remada máquina articulada',
            startKg: 20,
            incrementKg: 5,
            everyWeeks: 2,
            sets: 3,
            reps: 12,
          },
          {
            exercise: 'Desenvolvimento máquina',
            startKg: 10,
            incrementKg: 2.5,
            everyWeeks: 2,
            sets: 3,
            reps: 12,
          },
          {
            exercise: 'Cadeira abdutora',
            startKg: 25,
            incrementKg: 5,
            everyWeeks: 2,
            sets: 3,
            reps: 15,
          },
        ],
      },
      {
        weekday: 5,
        lifts: [
          {
            exercise: 'Leg press 45',
            startKg: 60,
            incrementKg: 10,
            everyWeeks: 1,
            sets: 3,
            reps: 12,
          },
          {
            exercise: 'Cadeira extensora',
            startKg: 15,
            incrementKg: 5,
            everyWeeks: 2,
            sets: 3,
            reps: 12,
          },
          {
            exercise: 'Supino máquina',
            startKg: 20,
            incrementKg: 5,
            everyWeeks: 2,
            sets: 3,
            reps: 12,
          },
          {
            exercise: 'Puxada frontal no pulley',
            startKg: 25,
            incrementKg: 2.5,
            everyWeeks: 1,
            sets: 3,
            reps: 12,
          },
        ],
      },
    ],
    activities: [
      {
        slug: 'natacao',
        weekdays: [2, 4],
        minutes: [40, 50],
        time: '07:00',
        probability: 0.85,
        comments: ['1.200 m', '1.500 m crawl', 'Treino de pernada'],
      },
    ],
    measurements: { weightKg: [70, 66], waistCm: [80, 75], chestCm: [94, 92], heightCm: 168 },
  },
];

/** PRNG deterministico (Park-Miller, so aritmetica): mesmo historico a cada execucao. */
function createRandom(seed: number): () => number {
  const modulus = 2147483647;
  let state = seed % modulus;

  return () => {
    state = (state * 48271) % modulus;

    return (state - 1) / (modulus - 1);
  };
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function localInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${UTC_OFFSET}`);
}

function round(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function pick<T>(random: () => number, items: T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

/**
 * Quantas vezes a carga ja subiu ate a semana `week`. Semanas de plato e semanas sem treino
 * (ferias) nao contam: a volta das ferias retoma a carga de antes, sem salto.
 */
function progressionSteps(user: DemoUser, lift: LiftPlan, week: number): number {
  const stalled = [...(user.stallWeeks ?? []), ...(user.offWeeks ?? [])].filter(
    (stall) => stall <= week,
  ).length;

  return Math.floor(Math.max(0, week - stalled) / lift.everyWeeks);
}

function buildSets(
  user: DemoUser,
  lift: LiftPlan,
  week: number,
  random: () => number,
): { setNumber: number; reps: number; weightKg: number; completed: boolean }[] {
  const steps = progressionSteps(user, lift, week);
  const deload = (user.deloadWeeks ?? []).includes(week) ? 0.8 : 1;

  return Array.from({ length: lift.sets }, (_, index) => {
    const isLastSet = index === lift.sets - 1;
    // Ultima serie as vezes sai com 1-2 reps a menos: fadiga, nao regressao
    const fatigue = isLastSet && random() < 0.4 ? Math.ceil(random() * 2) : 0;

    if (lift.bodyweight) {
      return {
        setNumber: index + 1,
        reps: lift.reps + steps - fatigue,
        weightKg: 0,
        completed: true,
      };
    }

    const step = lift.startKg >= 20 ? 2.5 : 0.5;

    return {
      setNumber: index + 1,
      reps: Math.max(1, lift.reps - fatigue),
      weightKg: round((lift.startKg + steps * lift.incrementKg) * deload, step),
      completed: true,
    };
  });
}

function lerp([start, end]: [number, number], ratio: number, random: () => number, noise: number) {
  return Math.round((start + (end - start) * ratio + (random() - 0.5) * noise) * 10) / 10;
}

async function seedUser(user: DemoUser, passwordHash: string, today: string): Promise<string> {
  const random = createRandom(user.seed);
  const firstDay = addDays(today, -(user.weeks * 7 - 1));
  const now = Date.now();

  const created = await prisma.user.create({
    data: {
      email: user.email,
      passwordHash,
      profile: {
        create: {
          displayName: user.displayName,
          timezone: TIMEZONE,
          onboardingCompletedAt: localInstant(firstDay, '08:00'),
        },
      },
    },
  });

  const catalogNames = user.days.flatMap((day) =>
    day.lifts.map((lift) => lift.exercise).filter((name) => !name.startsWith('custom:')),
  );
  const catalog = await prisma.exercise.findMany({ where: { name: { in: catalogNames } } });
  const catalogIdByName = new Map(catalog.map((exercise) => [exercise.name, exercise.id]));
  const missing = [...new Set(catalogNames)].filter((name) => !catalogIdByName.has(name));

  if (missing.length > 0) {
    throw new Error(`Exercicios ausentes no catalogo (rode yarn db:seed): ${missing.join(', ')}`);
  }

  const customNames = [
    ...new Set(
      user.days.flatMap((day) =>
        day.lifts
          .filter((lift) => lift.exercise.startsWith('custom:'))
          .map((lift) => lift.exercise),
      ),
    ),
  ];
  const customIdByName = new Map<string, string>();

  await Promise.all(
    customNames.map(async (name) => {
      const custom = await prisma.customExercise.create({
        data: { userId: created.id, name: name.slice('custom:'.length) },
      });

      customIdByName.set(name, custom.id);
    }),
  );

  const refOf = (name: string) =>
    name.startsWith('custom:')
      ? { customExerciseId: customIdByName.get(name)! }
      : { exerciseId: catalogIdByName.get(name)! };

  const sheet = await prisma.workoutSheet.create({
    data: {
      userId: created.id,
      name: user.sheetName,
      createdAt: localInstant(firstDay, '08:00'),
      days: {
        create: user.days.map((day, order) => ({
          weekday: day.weekday,
          order,
          exercises: {
            create: day.lifts.map((lift, sortOrder) => ({
              ...refOf(lift.exercise),
              sortOrder,
              targetSets: lift.sets,
              targetReps: lift.reps,
            })),
          },
        })),
      },
    },
  });

  const activityTypes = await prisma.activityType.findMany({
    where: { slug: { in: user.activities.map((activity) => activity.slug) } },
  });
  const typeIdBySlug = new Map(activityTypes.map((type) => [type.slug, type.id]));

  let sessions = 0;
  let activities = 0;

  // Sequencial de proposito: o PRNG precisa ser consumido sempre na mesma ordem
  /* eslint-disable no-restricted-syntax, no-await-in-loop */
  for (let offset = 0; offset < user.weeks * 7; offset += 1) {
    const date = addDays(firstDay, offset);
    const week = Math.floor(offset / 7);
    const weekday = weekdayOf(date);

    if (!(user.offWeeks ?? []).includes(week)) {
      const day = user.days.find((planned) => planned.weekday === weekday);
      const performedAt = localInstant(date, user.sessionTime);

      // Deload nunca e pulado: e a semana que mostra a queda planejada no grafico
      const isDeload = (user.deloadWeeks ?? []).includes(week);

      if (day && performedAt.getTime() <= now && (isDeload || random() >= user.skipChance)) {
        const isToday = date === today;

        await prisma.workoutSession.create({
          data: {
            userId: created.id,
            sheetId: sheet.id,
            performedAt,
            // Sessao de hoje fica "em andamento" para o client ter esse estado na tela
            completedAt: isToday ? null : new Date(performedAt.getTime() + 70 * 60 * 1000),
            comment: random() < 0.2 ? pick(random, user.sessionComments) : null,
            exercises: {
              create: day.lifts.map((lift, sortOrder) => ({
                ...refOf(lift.exercise),
                sortOrder,
                sets: { create: buildSets(user, lift, week, random) },
              })),
            },
          },
        });
        sessions += 1;
      }

      for (const plan of user.activities) {
        const at = localInstant(date, plan.time);

        if (plan.weekdays.includes(weekday) && at.getTime() <= now && random() < plan.probability) {
          const [min, max] = plan.minutes;

          await prisma.freeActivity.create({
            data: {
              userId: created.id,
              activityTypeId: typeIdBySlug.get(plan.slug)!,
              performedAt: at,
              durationMinutes: Math.round(min + random() * (max - min)),
              comment: plan.comments && random() < 0.4 ? pick(random, plan.comments) : null,
            },
          });
          activities += 1;
        }
      }
    }
  }
  /* eslint-enable no-restricted-syntax, no-await-in-loop */

  // Medida a cada 14 dias (mais uma hoje), com ruido pequeno em torno da tendencia
  const measurementOffsets = Array.from(
    { length: Math.floor((user.weeks * 7 - 1) / 14) + 1 },
    (_, index) => index * 14,
  );
  const lastOffset = user.weeks * 7 - 1;

  if (measurementOffsets.at(-1) !== lastOffset) {
    measurementOffsets.push(lastOffset);
  }

  const rows = measurementOffsets.map((offset, index) => {
    const ratio = offset / lastOffset;

    return {
      userId: created.id,
      weightKg: lerp(user.measurements.weightKg, ratio, random, 0.6),
      waistCm: lerp(user.measurements.waistCm, ratio, random, 0.8),
      chestCm: lerp(user.measurements.chestCm, ratio, random, 0.8),
      // Altura so na primeira medida: ninguem mede altura a cada 2 semanas
      heightCm: index === 0 ? user.measurements.heightCm : null,
      createdAt: localInstant(addDays(firstDay, offset), '07:30'),
    };
  });
  const latest = rows.at(-1)!;

  await prisma.bodyMeasurement.createMany({ data: rows });
  await prisma.userProfile.update({
    where: { userId: created.id },
    data: {
      weightKg: latest.weightKg,
      waistCm: latest.waistCm,
      chestCm: latest.chestCm,
      heightCm: user.measurements.heightCm,
    },
  });

  return `${user.displayName.padEnd(13)} ${user.email.padEnd(22)} ${String(user.weeks)} semanas · ${String(sessions)} sessoes · ${String(activities)} atividades · ${String(rows.length)} medidas`;
}

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('seed-demo e uma ferramenta de desenvolvimento e nao roda em producao');
  }

  const emails = DEMO_USERS.map((user) => user.email);
  const existing = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });

  // `media_assets.owner_id` nao tem FK (Fase 0): limpa a midia antes do cascade de `users`
  await prisma.mediaAsset.deleteMany({
    where: { ownerId: { in: existing.map((user) => user.id) } },
  });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });

  const passwordHash = await argon2.hash(PASSWORD);
  const today = todayIn(TIMEZONE);
  const lines: string[] = [];

  /* eslint-disable no-restricted-syntax, no-await-in-loop */
  for (const user of DEMO_USERS) {
    lines.push(await seedUser(user, passwordHash, today));
  }
  /* eslint-enable no-restricted-syntax, no-await-in-loop */

  process.stdout.write(
    `Usuarios de demo criados (senha: ${PASSWORD}):\n${lines.map((line) => `  ${line}`).join('\n')}\n`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
