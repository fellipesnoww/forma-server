import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { ZodError } from 'zod';

import { env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  AppError,
  ERROR_CODES,
  type ErrorCode,
  type ErrorDetails,
} from '../shared/errors/index.js';

interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetails;
  };
}

interface NormalizedError {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: ErrorDetails;
}

/** Mensagem devolvida em 5xx quando NODE_ENV=production, para nao vazar host/usuario/senha do driver. */
const GENERIC_INTERNAL_MESSAGE = 'Erro interno do servidor';

function zodIssuesToDetails(error: ZodError): ErrorDetails {
  return {
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      code: issue.code,
      message: issue.message,
    })),
  };
}

/**
 * Erros conhecidos do Prisma que representam uma falha do cliente, nao do servidor.
 * Qualquer outro codigo cai no 500 generico.
 * Referencia: https://www.prisma.io/docs/orm/reference/error-reference
 */
function normalizePrismaError(error: Prisma.PrismaClientKnownRequestError): NormalizedError | null {
  switch (error.code) {
    case 'P2002':
      return {
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'Registro ja existente',
        details: { target: error.meta?.target },
      };
    case 'P2025':
      return {
        statusCode: 404,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Recurso nao encontrado',
      };
    case 'P2003':
      return {
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'Referencia invalida para um registro relacionado',
        details: { field: error.meta?.field_name },
      };
    default:
      return null;
  }
}

function normalize(error: unknown): NormalizedError {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }

  // Validacao de body/params/query pelos schemas Zod das rotas
  if (hasZodFastifySchemaValidationErrors(error)) {
    return {
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Dados da requisicao invalidos',
      details: {
        // `instancePath` ja vem no formato '/campo/subcampo'; normalizamos para 'campo.subcampo'
        issues: error.validation.map((issue) => ({
          path: issue.instancePath.replace(/^\//, '').replace(/\//g, '.'),
          message: issue.message ?? 'valor invalido',
        })),
      },
    };
  }

  // Response que nao bate com o schema declarado: bug do servidor, nunca do cliente
  if (isResponseSerializationError(error)) {
    return {
      statusCode: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Resposta do servidor nao corresponde ao schema declarado',
      details: { method: error.method, url: error.url },
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Dados da requisicao invalidos',
      details: zodIssuesToDetails(error),
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const normalized = normalizePrismaError(error);

    if (normalized) {
      return normalized;
    }
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as { code?: unknown; statusCode?: unknown; message?: unknown };
    const fastifyCode = typeof candidate.code === 'string' ? candidate.code : '';
    const statusCode = typeof candidate.statusCode === 'number' ? candidate.statusCode : 500;
    const message = typeof candidate.message === 'string' ? candidate.message : '';

    if (fastifyCode === 'FST_ERR_CTP_BODY_TOO_LARGE' || statusCode === 413) {
      return {
        statusCode: 413,
        code: ERROR_CODES.PAYLOAD_TOO_LARGE,
        message: 'Corpo da requisicao excede o tamanho maximo permitido',
      };
    }

    if (statusCode === 415) {
      return {
        statusCode: 415,
        code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        message: message || 'Tipo de conteudo nao suportado',
      };
    }

    if (statusCode === 429) {
      return {
        statusCode: 429,
        code: ERROR_CODES.RATE_LIMITED,
        message: message || 'Muitas requisicoes',
      };
    }

    // @fastify/jwt prefixa seus codigos com FST_JWT_ (token ausente, expirado, malformado...)
    if (fastifyCode.startsWith('FST_JWT_') || statusCode === 401) {
      return {
        statusCode: 401,
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Token de autenticacao ausente ou invalido',
      };
    }

    if (statusCode === 403) {
      return {
        statusCode: 403,
        code: ERROR_CODES.FORBIDDEN,
        message: message || 'Permissao insuficiente',
      };
    }

    if (statusCode === 404) {
      return {
        statusCode: 404,
        code: ERROR_CODES.NOT_FOUND,
        message: message || 'Recurso nao encontrado',
      };
    }

    if (statusCode >= 400 && statusCode < 500) {
      return {
        statusCode,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: message || 'Requisicao invalida',
      };
    }
  }

  return {
    statusCode: 500,
    code: ERROR_CODES.INTERNAL_ERROR,
    message: GENERIC_INTERNAL_MESSAGE,
  };
}

function toEnvelope(normalized: NormalizedError): ErrorEnvelope {
  // Em producao, mensagem e details de 5xx ficam so no log: podem conter connection string,
  // caminho de arquivo ou trecho de query.
  const leaking = normalized.statusCode >= 500 && env.NODE_ENV === 'production';

  return {
    error: {
      code: normalized.code,
      message: leaking ? GENERIC_INTERNAL_MESSAGE : normalized.message,
      ...(normalized.details === undefined || leaking ? {} : { details: normalized.details }),
    },
  };
}

async function errorHandlerPlugin(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const normalized = normalize(error);

    if (normalized.statusCode >= 500) {
      request.log.error({ err: error }, 'Erro nao tratado na requisicao');
    } else {
      request.log.debug({ err: error, statusCode: normalized.statusCode }, 'Requisicao rejeitada');
    }

    return reply.status(normalized.statusCode).send(toEnvelope(normalized));
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) =>
    reply.status(404).send(
      toEnvelope({
        statusCode: 404,
        code: ERROR_CODES.NOT_FOUND,
        message: `Rota ${request.method} ${request.url} nao encontrada`,
      }),
    ),
  );
}

export default fp(errorHandlerPlugin, { name: 'error-handler' });
