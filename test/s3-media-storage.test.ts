import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

import mediaUrlsPlugin from '../src/plugins/media-urls.js';

import { prisma } from '../src/shared/db/client.js';
import {
  createMediaUrlSigner,
  createS3MediaStorage,
  type S3Sender,
} from '../src/shared/media/index.js';
import { PNG_1X1_BASE64, createTestContext, type TestContext, type TestUser } from './helpers.js';

const BUCKET = 'forma-test-bucket';

/** Stub do S3Client: registra os comandos e pode falhar o proximo `send`. */
function createStubClient() {
  const sent: (PutObjectCommand | DeleteObjectCommand)[] = [];
  let failNext = false;

  const client: S3Sender = {
    send: (command) => {
      if (failNext) {
        failNext = false;

        return Promise.reject(new Error('S3 indisponivel'));
      }

      sent.push(command);

      return Promise.resolve({});
    },
  };

  return {
    client,
    sent,
    failNextSend: () => {
      failNext = true;
    },
  };
}

let ctx: TestContext;
let owner: TestUser;
const createdIds: string[] = [];

before(async () => {
  ctx = await createTestContext();
  owner = await ctx.createUser();
});

after(async () => {
  await prisma.mediaAsset.deleteMany({ where: { id: { in: createdIds } } });
  await ctx.close();
});

describe('S3 media storage', () => {
  it('upload grava o objeto no bucket e so o metadado no banco', async () => {
    const stub = createStubClient();
    const storage = createS3MediaStorage({
      client: stub.client,
      bucket: BUCKET,
      keyPrefix: 'media',
    });

    const stored = await storage.upload({
      data: PNG_1X1_BASE64,
      declaredMimeType: 'image/png',
      filename: 'foto.png',
      ownerId: owner.id,
    });
    createdIds.push(stored.id);

    const key = `media/${stored.id}.png`;
    const [put] = stub.sent;

    assert.ok(put instanceof PutObjectCommand);
    assert.equal(put.input.Bucket, BUCKET);
    assert.equal(put.input.Key, key);
    assert.equal(put.input.ContentType, 'image/png');
    assert.equal(put.input.CacheControl, 'private, max-age=31536000, immutable');
    // Referencia, nao URL: o bucket e privado e a URL so nasce assinada na resposta
    assert.equal(stored.url, `s3:${key}`);

    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: stored.id } });

    assert.equal(row.storageKey, key);
    assert.equal(row.data, null);
    assert.equal(row.ownerId, owner.id);
  });

  it('upload invalido nao chega ao bucket', async () => {
    const stub = createStubClient();
    const storage = createS3MediaStorage({ client: stub.client, bucket: BUCKET, keyPrefix: '' });

    await assert.rejects(
      storage.upload({ data: PNG_1X1_BASE64, declaredMimeType: 'image/jpeg', ownerId: owner.id }),
    );
    assert.equal(stub.sent.length, 0);
  });

  it('falha no bucket nao cria linha', async () => {
    const stub = createStubClient();
    const storage = createS3MediaStorage({ client: stub.client, bucket: BUCKET, keyPrefix: '' });
    const countBefore = await prisma.mediaAsset.count({ where: { ownerId: owner.id } });

    stub.failNextSend();
    await assert.rejects(
      storage.upload({ data: PNG_1X1_BASE64, declaredMimeType: 'image/png', ownerId: owner.id }),
    );

    assert.equal(await prisma.mediaAsset.count({ where: { ownerId: owner.id } }), countBefore);
  });

  it('delete remove o objeto e a linha', async () => {
    const stub = createStubClient();
    const storage = createS3MediaStorage({ client: stub.client, bucket: BUCKET, keyPrefix: '' });
    const stored = await storage.upload({
      data: PNG_1X1_BASE64,
      declaredMimeType: 'image/png',
      ownerId: owner.id,
    });

    await storage.delete(stored.id);

    const deleteCommand = stub.sent.at(-1);

    assert.ok(deleteCommand instanceof DeleteObjectCommand);
    assert.equal(deleteCommand.input.Key, `${stored.id}.png`);
    assert.equal(await prisma.mediaAsset.findUnique({ where: { id: stored.id } }), null);
  });
});

const BUCKET_REGION = 'sa-east-1';
const TTL = 3600;

/** Assinatura e local (HMAC): credenciais falsas bastam, nada sai para a rede. */
function createTestSigner(now: () => Date) {
  const client = new S3Client({
    region: BUCKET_REGION,
    credentials: { accessKeyId: 'AKIATESTEXAMPLE', secretAccessKey: 'test-secret' },
  });

  return createMediaUrlSigner({ client, bucket: BUCKET, ttlSeconds: TTL, now });
}

describe('URL pre-assinada', () => {
  it('assina GET do objeto com a validade configurada', async () => {
    const signer = createTestSigner(() => new Date('2026-10-05T12:10:00Z'));
    const url = new URL(await signer.sign('s3:media/abc.png'));

    assert.equal(url.host, `${BUCKET}.s3.${BUCKET_REGION}.amazonaws.com`);
    assert.equal(url.pathname, '/media/abc.png');
    assert.equal(url.searchParams.get('X-Amz-Expires'), String(TTL));
    assert.ok(url.searchParams.get('X-Amz-Signature'));
  });

  it('mesma URL dentro da janela de TTL/2, outra na janela seguinte (cache do browser)', async () => {
    let now = new Date('2026-10-05T12:01:00Z');
    const signer = createTestSigner(() => now);

    const first = await signer.sign('s3:media/abc.png');
    now = new Date('2026-10-05T12:29:00Z');
    const sameWindow = await signer.sign('s3:media/abc.png');
    now = new Date('2026-10-05T12:31:00Z');
    const nextWindow = await signer.sign('s3:media/abc.png');

    assert.equal(sameWindow, first);
    assert.notEqual(nextWindow, first);
  });

  it('plugin assina so campos de midia com referencia s3: e passa pelo schema Zod', async () => {
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(mediaUrlsPlugin, {
      signer: createTestSigner(() => new Date('2026-10-05T12:00:00Z')),
    });

    app.withTypeProvider<ZodTypeProvider>().get(
      '/sample',
      {
        schema: {
          response: {
            200: z.object({
              photoUrl: z.string(),
              avatarUrl: z.string(),
              comment: z.string(),
              days: z.array(z.object({ photoUrls: z.array(z.string()) })),
            }),
          },
        },
      },
      () => ({
        photoUrl: 's3:media/a.png',
        avatarUrl: 'https://lh3.googleusercontent.com/pic',
        comment: 's3:texto do usuario',
        days: [{ photoUrls: ['s3:media/b.webp', '/media/legado'] }],
      }),
    );

    const body = (await app.inject({ method: 'GET', url: '/sample' })).json<{
      photoUrl: string;
      avatarUrl: string;
      comment: string;
      days: { photoUrls: string[] }[];
    }>();
    await app.close();

    assert.match(body.photoUrl, /^https:\/\/.+\/media\/a\.png\?.*X-Amz-Signature=/);
    assert.equal(body.avatarUrl, 'https://lh3.googleusercontent.com/pic');
    assert.equal(body.comment, 's3:texto do usuario');
    assert.match(body.days[0]?.photoUrls[0] ?? '', /\/media\/b\.webp\?.*X-Amz-Signature=/);
    assert.equal(body.days[0]?.photoUrls[1], '/media/legado');
  });
});
