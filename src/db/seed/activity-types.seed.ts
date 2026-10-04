import { prisma } from '../../shared/db/client.js';

/**
 * Tipos padrao de atividade livre (Fase 2.1). Upsert por `slug` torna o seeder idempotente;
 * `userId` fica null — e o que distingue tipo padrao de tipo personalizado.
 */
const ACTIVITY_TYPES = [
  { slug: 'natacao', name: 'Natação' },
  { slug: 'futebol', name: 'Futebol' },
  { slug: 'corrida', name: 'Corrida' },
  { slug: 'caminhada', name: 'Caminhada' },
  { slug: 'ciclismo', name: 'Ciclismo' },
  { slug: 'atletismo', name: 'Atletismo' },
  { slug: 'basquete', name: 'Basquete' },
  { slug: 'volei', name: 'Vôlei' },
  { slug: 'tenis', name: 'Tênis' },
  { slug: 'beach-tennis', name: 'Beach tennis' },
  { slug: 'lutas', name: 'Lutas' },
  { slug: 'danca', name: 'Dança' },
  { slug: 'yoga', name: 'Yoga' },
  { slug: 'pilates', name: 'Pilates' },
  { slug: 'trilha', name: 'Trilha' },
  { slug: 'funcional', name: 'Treino funcional' },
];

export async function seedActivityTypes(): Promise<void> {
  await Promise.all(
    ACTIVITY_TYPES.map((type) =>
      prisma.activityType.upsert({
        where: { slug: type.slug },
        update: { name: type.name },
        create: type,
      }),
    ),
  );
}
