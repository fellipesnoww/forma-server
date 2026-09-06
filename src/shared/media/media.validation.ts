import { env } from '../../config/env.js';
import { AppError } from '../errors/index.js';

const DATA_URL_PREFIX = /^data:([a-z]+\/[a-z0-9.+-]+);base64,/i;
const BASE64_CHARSET = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Assinaturas binarias (magic numbers) dos formatos aceitos.
 *
 * Comparacao via `subarray().equals()` e nao `buf[0] === 0x89`: com
 * `noUncheckedIndexedAccess` cada acesso indexado seria `number | undefined` e exigiria
 * narrowing em toda comparacao.
 */
const MAGIC_NUMBERS: readonly { mimeType: string; matches: (buffer: Buffer) => boolean }[] = [
  {
    mimeType: 'image/jpeg',
    matches: (buffer) => buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  },
  {
    mimeType: 'image/png',
    matches: (buffer) =>
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mimeType: 'image/webp',
    matches: (buffer) =>
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

export function isAllowedMimeType(mimeType: string): boolean {
  return env.MEDIA_ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase());
}

/** Detecta o formato real pelo conteudo. Null quando nenhuma assinatura conhecida bate. */
export function detectMimeType(buffer: Buffer): string | null {
  return MAGIC_NUMBERS.find((candidate) => candidate.matches(buffer))?.mimeType ?? null;
}

export interface DecodedMedia {
  buffer: Buffer;
  /** MIME detectado pelo conteudo — e este que deve ser persistido, nao o declarado. */
  mimeType: string;
  sizeBytes: number;
}

/**
 * Valida e decodifica o base64 recebido.
 *
 * A ordem das checagens e deliberada: cada etapa existe para evitar a alocacao da proxima.
 * O tamanho e verificado por aritmetica sobre o comprimento da string, antes de qualquer
 * `Buffer.from` — um payload de 50 MB e rejeitado sem nunca virar buffer na memoria.
 */
export function decodeBase64Media(rawData: string, declaredMimeType: string): DecodedMedia {
  const declared = declaredMimeType.toLowerCase();

  if (!isAllowedMimeType(declared)) {
    throw AppError.unsupportedMediaType(`Tipo '${declaredMimeType}' nao suportado`, {
      allowed: env.MEDIA_ALLOWED_MIME_TYPES,
    });
  }

  // 1. Prefixo data URL, quando presente, precisa concordar com o MIME declarado
  let payload = rawData.trim();
  const prefixMatch = DATA_URL_PREFIX.exec(payload);

  if (prefixMatch) {
    const prefixMime = prefixMatch[1]?.toLowerCase() ?? '';

    if (prefixMime !== declared) {
      throw AppError.badRequest('MIME do prefixo data URL diverge do campo mimeType', {
        prefixMimeType: prefixMime,
        declaredMimeType: declared,
      });
    }

    payload = payload.slice(prefixMatch[0].length);
  }

  if (payload.length === 0) {
    throw AppError.badRequest('Campo data vazio');
  }

  // 2. Charset e padding. `Buffer.from(s, 'base64')` do Node e leniente: descarta
  // caracteres invalidos em silencio e devolve um buffer truncado em vez de erro.
  if (payload.length % 4 !== 0 || !BASE64_CHARSET.test(payload)) {
    throw AppError.badRequest('Campo data nao e base64 valido');
  }

  // 3. Tamanho decodificado previsto, ainda sem alocar nada
  const paddingMatch = /={0,2}$/.exec(payload);
  const padding = paddingMatch?.[0].length ?? 0;
  const expectedBytes = (payload.length / 4) * 3 - padding;

  if (expectedBytes > env.MEDIA_MAX_SIZE_BYTES) {
    throw AppError.payloadTooLarge(`Arquivo excede o limite de ${env.MEDIA_MAX_SIZE_MB} MB`, {
      maxBytes: env.MEDIA_MAX_SIZE_BYTES,
      receivedBytes: expectedBytes,
    });
  }

  // 4. Decodifica e confere: divergencia significa base64 malformado que passou pelo regex
  const buffer = Buffer.from(payload, 'base64');

  if (buffer.length !== expectedBytes) {
    throw AppError.badRequest('Campo data nao e base64 valido');
  }

  // 5. Sniffing. O MIME persistido e sempre o detectado: confiar no declarado permitiria
  // servir depois um Content-Type escolhido pelo cliente (ex.: HTML como image/png -> XSS).
  const detected = detectMimeType(buffer);

  if (detected === null || !isAllowedMimeType(detected)) {
    throw AppError.unsupportedMediaType('Conteudo do arquivo nao e uma imagem suportada', {
      allowed: env.MEDIA_ALLOWED_MIME_TYPES,
    });
  }

  if (detected !== declared) {
    throw AppError.unsupportedMediaType('Conteudo do arquivo nao corresponde ao mimeType enviado', {
      declaredMimeType: declared,
      detectedMimeType: detected,
    });
  }

  return { buffer, mimeType: detected, sizeBytes: buffer.length };
}
