/**
 * Ponto de entrada dos seeds (`yarn db:seed`, configurado em prisma.config.ts).
 *
 * Cada seeder deve ser idempotente — `yarn db:seed` pode rodar varias vezes no mesmo banco.
 */
import { prisma } from '../../shared/db/client.js';
import { seedExercises } from './exercises.seed.js';

interface Seeder {
  name: string;
  run: () => Promise<void>;
}

const seeders: Seeder[] = [{ name: 'grupos musculares + exercicios (1.3)', run: seedExercises }];

async function main(): Promise<void> {
  if (seeders.length === 0) {
    process.stdout.write('Nenhum seeder registrado.\n');

    return;
  }

  // Sequencial de proposito: um seeder pode depender de dados criados pelo anterior,
  // entao paralelizar com Promise.all quebraria a ordem de dependencia.
  /* eslint-disable no-restricted-syntax, no-await-in-loop */
  for (const seeder of seeders) {
    process.stdout.write(`Seed: ${seeder.name}...\n`);
    await seeder.run();
  }
  /* eslint-enable no-restricted-syntax, no-await-in-loop */

  process.stdout.write(`${String(seeders.length)} seeder(s) aplicado(s).\n`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
