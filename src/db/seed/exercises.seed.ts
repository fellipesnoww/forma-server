import { prisma } from '../../shared/db/client.js';

/**
 * Grupos musculares e catalogo inicial de exercicios (Fase 1.3). Upsert por `slug`/`name`
 * torna o seeder idempotente — rodar `yarn db:seed` varias vezes nao duplica linhas.
 */
const MUSCLE_GROUPS = [
  { slug: 'peito', name: 'Peito' },
  { slug: 'costas', name: 'Costas' },
  { slug: 'ombros', name: 'Ombros' },
  { slug: 'biceps', name: 'Biceps' },
  { slug: 'triceps', name: 'Triceps' },
  { slug: 'antebraco', name: 'Antebraco' },
  { slug: 'quadriceps', name: 'Quadriceps' },
  { slug: 'posterior-coxa', name: 'Posterior de coxa' },
  { slug: 'gluteos', name: 'Gluteos' },
  { slug: 'panturrilha', name: 'Panturrilha' },
  { slug: 'abdomen', name: 'Abdomen' },
  { slug: 'cardio', name: 'Cardio' },
] as const;

const EXERCISES: { name: string; muscleGroup: (typeof MUSCLE_GROUPS)[number]['slug'] }[] = [
  // Peito
  { name: 'Supino reto com barra', muscleGroup: 'peito' },
  { name: 'Supino inclinado com barra', muscleGroup: 'peito' },
  { name: 'Supino declinado com barra', muscleGroup: 'peito' },
  { name: 'Supino reto com halteres', muscleGroup: 'peito' },
  { name: 'Supino inclinado com halteres', muscleGroup: 'peito' },
  { name: 'Crucifixo reto com halteres', muscleGroup: 'peito' },
  { name: 'Crucifixo inclinado com halteres', muscleGroup: 'peito' },
  { name: 'Crossover no cabo', muscleGroup: 'peito' },
  { name: 'Peck deck (voador)', muscleGroup: 'peito' },
  { name: 'Flexao de braco', muscleGroup: 'peito' },
  { name: 'Supino máquina', muscleGroup: 'peito' },
  { name: 'Paralelas (mergulho para peito)', muscleGroup: 'peito' },
  // Costas
  { name: 'Barra fixa (pull-up)', muscleGroup: 'costas' },
  { name: 'Puxada frontal no pulley', muscleGroup: 'costas' },
  { name: 'Puxada por tras', muscleGroup: 'costas' },
  { name: 'Remada curvada com barra', muscleGroup: 'costas' },
  { name: 'Remada unilateral com halter (serrote)', muscleGroup: 'costas' },
  { name: 'Remada cavalinho (T-bar)', muscleGroup: 'costas' },
  { name: 'Remada baixa no cabo', muscleGroup: 'costas' },
  { name: 'Levantamento terra', muscleGroup: 'costas' },
  { name: 'Levantamento terra romeno', muscleGroup: 'costas' },
  { name: 'Pullover com halter', muscleGroup: 'costas' },
  { name: 'Hiperextensao lombar', muscleGroup: 'costas' },
  { name: 'Remada máquina articulada', muscleGroup: 'costas' },
  // Ombros
  { name: 'Desenvolvimento militar com barra', muscleGroup: 'ombros' },
  { name: 'Desenvolvimento com halteres', muscleGroup: 'ombros' },
  { name: 'Desenvolvimento Arnold', muscleGroup: 'ombros' },
  { name: 'Elevacao lateral com halteres', muscleGroup: 'ombros' },
  { name: 'Elevacao frontal com halteres', muscleGroup: 'ombros' },
  { name: 'Elevacao lateral no cabo', muscleGroup: 'ombros' },
  { name: 'Crucifixo inverso (posterior de ombro)', muscleGroup: 'ombros' },
  { name: 'Remada alta com barra', muscleGroup: 'ombros' },
  { name: 'Encolhimento de ombros (shrug)', muscleGroup: 'ombros' },
  { name: 'Face pull no cabo', muscleGroup: 'ombros' },
  // Biceps
  { name: 'Rosca direta com barra', muscleGroup: 'biceps' },
  { name: 'Rosca direta com barra W', muscleGroup: 'biceps' },
  { name: 'Rosca alternada com halteres', muscleGroup: 'biceps' },
  { name: 'Rosca martelo', muscleGroup: 'biceps' },
  { name: 'Rosca concentrada', muscleGroup: 'biceps' },
  { name: 'Rosca scott', muscleGroup: 'biceps' },
  { name: 'Rosca no cabo', muscleGroup: 'biceps' },
  { name: 'Rosca inversa', muscleGroup: 'biceps' },
  // Triceps
  { name: 'Triceps testa com barra', muscleGroup: 'triceps' },
  { name: 'Triceps pulley (corda)', muscleGroup: 'triceps' },
  { name: 'Triceps pulley (barra reta)', muscleGroup: 'triceps' },
  { name: 'Triceps frances com halter', muscleGroup: 'triceps' },
  { name: 'Mergulho no banco (banco triceps)', muscleGroup: 'triceps' },
  { name: 'Paralelas (mergulho para triceps)', muscleGroup: 'triceps' },
  { name: 'Kickback com halter', muscleGroup: 'triceps' },
  { name: 'Supino fechado', muscleGroup: 'triceps' },
  // Antebraco
  { name: 'Rosca de punho com barra', muscleGroup: 'antebraco' },
  { name: 'Rosca de punho inversa', muscleGroup: 'antebraco' },
  { name: 'Flexao de punho no cabo', muscleGroup: 'antebraco' },
  { name: 'Farmer walk (caminhada com halteres)', muscleGroup: 'antebraco' },
  // Quadriceps
  { name: 'Agachamento livre com barra', muscleGroup: 'quadriceps' },
  { name: 'Agachamento frontal', muscleGroup: 'quadriceps' },
  { name: 'Leg press 45', muscleGroup: 'quadriceps' },
  { name: 'Cadeira extensora', muscleGroup: 'quadriceps' },
  { name: 'Agachamento no smith', muscleGroup: 'quadriceps' },
  { name: 'Afundo (passada) com halteres', muscleGroup: 'quadriceps' },
  { name: 'Agachamento búlgaro', muscleGroup: 'quadriceps' },
  { name: 'Hack squat', muscleGroup: 'quadriceps' },
  // Posterior de coxa
  { name: 'Mesa flexora', muscleGroup: 'posterior-coxa' },
  { name: 'Cadeira flexora', muscleGroup: 'posterior-coxa' },
  { name: 'Stiff com barra', muscleGroup: 'posterior-coxa' },
  { name: 'Stiff com halteres', muscleGroup: 'posterior-coxa' },
  { name: 'Good morning', muscleGroup: 'posterior-coxa' },
  // Gluteos
  { name: 'Elevacao pelvica (hip thrust)', muscleGroup: 'gluteos' },
  { name: 'Cadeira abdutora', muscleGroup: 'gluteos' },
  { name: 'Coice no cabo (glúteo)', muscleGroup: 'gluteos' },
  { name: 'Agachamento sumo com halter', muscleGroup: 'gluteos' },
  { name: 'Elevacao pelvica unilateral', muscleGroup: 'gluteos' },
  // Panturrilha
  { name: 'Panturrilha em pe (gemeos)', muscleGroup: 'panturrilha' },
  { name: 'Panturrilha sentado', muscleGroup: 'panturrilha' },
  { name: 'Panturrilha no leg press', muscleGroup: 'panturrilha' },
  // Abdomen
  { name: 'Abdominal supra (crunch)', muscleGroup: 'abdomen' },
  { name: 'Abdominal infra (elevacao de pernas)', muscleGroup: 'abdomen' },
  { name: 'Prancha abdominal (plank)', muscleGroup: 'abdomen' },
  { name: 'Abdominal obliquo (bicicleta)', muscleGroup: 'abdomen' },
  { name: 'Abdominal no cabo (ajoelhado)', muscleGroup: 'abdomen' },
  { name: 'Elevacao de pernas na barra fixa', muscleGroup: 'abdomen' },
  { name: 'Rollout com roda abdominal', muscleGroup: 'abdomen' },
  // Cardio
  { name: 'Esteira (corrida)', muscleGroup: 'cardio' },
  { name: 'Bicicleta ergometrica', muscleGroup: 'cardio' },
  { name: 'Eliptico', muscleGroup: 'cardio' },
  { name: 'Pular corda', muscleGroup: 'cardio' },
  { name: 'Remo ergometro', muscleGroup: 'cardio' },
  { name: 'Escada (stairmaster)', muscleGroup: 'cardio' },
];

export async function seedExercises(): Promise<void> {
  const muscleGroups = await Promise.all(
    MUSCLE_GROUPS.map((group) =>
      prisma.muscleGroup.upsert({
        where: { slug: group.slug },
        update: { name: group.name },
        create: group,
      }),
    ),
  );

  const groupIdBySlug = new Map(muscleGroups.map((group) => [group.slug, group.id]));

  // Sequencial de proposito: mesmo racional do `main()` em index.ts (idempotencia > paralelismo aqui).
  /* eslint-disable no-restricted-syntax, no-await-in-loop */
  for (const exercise of EXERCISES) {
    const muscleGroupId = groupIdBySlug.get(exercise.muscleGroup);

    await prisma.exercise.upsert({
      where: { name: exercise.name },
      update: { muscleGroupId },
      create: { name: exercise.name, muscleGroupId },
    });
  }
  /* eslint-enable no-restricted-syntax, no-await-in-loop */
}
