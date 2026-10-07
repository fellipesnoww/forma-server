/**
 * Move a midia legada (binario em `media_assets.data`, Fase 0) para o bucket S3 e reescreve
 * as URLs ja persistidas (`/media/<id>`) para a referencia `s3:<chave>`.
 *
 *   yarn media:migrate-s3 --dry-run   # so lista o que seria migrado
 *   yarn media:migrate-s3
 *
 * Idempotente: so pega linhas com `data` e sem `storage_key`, entao pode ser re-executado
 * apos uma falha. Cada asset e um passo independente (objeto -> linha -> URLs); se cair no
 * meio, o objeto fica no bucket e a proxima execucao o sobrescreve com a mesma chave.
 * Roda tambem em producao (`node dist/scripts/migrate-media-to-s3.js`).
 */
import { PutObjectCommand } from '@aws-sdk/client-s3';

import { env } from '../config/env.js';
import { prisma } from '../shared/db/client.js';
import { buildMediaUrl, createDefaultS3Client, extensionFor } from '../shared/media/index.js';

const BATCH_SIZE = 50;

/** Colunas que guardam URL de midia. Todas recebem o valor devolvido pelo upload, como esta. */
const URL_COLUMNS = [
  { table: 'user_profiles', column: 'avatar_url' },
  { table: 'workout_sessions', column: 'photo_url' },
  { table: 'free_activities', column: 'photo_url' },
  { table: 'exercises', column: 'media_url' },
  { table: 'exercises', column: 'female_media_url' },
  { table: 'achievements', column: 'icon_url' },
] as const;

async function rewriteUrls(id: string, newUrl: string): Promise<number> {
  let updated = 0;

  /* eslint-disable no-restricted-syntax, no-await-in-loop */
  for (const { table, column } of URL_COLUMNS) {
    // Nome de tabela/coluna vem da lista fixa acima, nunca de entrada externa
    updated += await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "${column}" = $1 WHERE "${column}" LIKE $2`,
      newUrl,
      `%/media/${id}`,
    );
  }
  /* eslint-enable no-restricted-syntax, no-await-in-loop */

  return updated;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  if (!env.AWS_REGION || !env.AWS_S3_BUCKET) {
    throw new Error('Configure AWS_REGION e AWS_S3_BUCKET antes de migrar');
  }

  const pending = await prisma.mediaAsset.count({
    where: { storageKey: null, data: { not: null } },
  });

  process.stdout.write(
    `${String(pending)} asset(s) legado(s) para migrar${dryRun ? ' (dry-run)' : ''}\n`,
  );

  if (dryRun || pending === 0) {
    return;
  }

  const client = createDefaultS3Client();
  const prefix = env.AWS_S3_KEY_PREFIX ? `${env.AWS_S3_KEY_PREFIX}/` : '';
  let migrated = 0;

  /* eslint-disable no-restricted-syntax, no-await-in-loop */
  for (;;) {
    const batch = await prisma.mediaAsset.findMany({
      where: { storageKey: null, data: { not: null } },
      select: { id: true, mimeType: true, data: true },
      take: BATCH_SIZE,
    });

    if (batch.length === 0) {
      break;
    }

    // O filtro do where ja garante `data`; o narrowing e so para o tipo
    for (const asset of batch.filter((row) => row.data !== null)) {
      const key = `${prefix}${asset.id}.${extensionFor(asset.mimeType)}`;

      await client.send(
        new PutObjectCommand({
          Bucket: env.AWS_S3_BUCKET,
          Key: key,
          Body: asset.data ?? undefined,
          ContentType: asset.mimeType,
          CacheControl: 'private, max-age=31536000, immutable',
        }),
      );

      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { storageKey: key, data: null },
      });

      const references = await rewriteUrls(
        asset.id,
        buildMediaUrl({ id: asset.id, storageKey: key }),
      );

      migrated += 1;
      process.stdout.write(
        `  ${asset.id} -> ${key} (${String(references)} referencia(s) atualizada(s))\n`,
      );
    }
  }
  /* eslint-enable no-restricted-syntax, no-await-in-loop */

  process.stdout.write(`Concluido: ${String(migrated)} asset(s) migrado(s)\n`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
