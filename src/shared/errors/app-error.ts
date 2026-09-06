/**
 * Codigos de erro expostos no envelope HTTP.
 * Sao contrato publico da API: o client pode ramificar por `code`, nunca pela `message`.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ErrorDetails = Record<string, unknown>;

/**
 * Erro de dominio com resposta HTTP previsivel.
 *
 * O handler global (`plugins/error-handler.ts`) devolve `statusCode`, `code`, `message`
 * e `details` como estao. Qualquer outra excecao vira 500 com mensagem generica, entao
 * so use `AppError` para o que o cliente pode de fato entender e corrigir.
 */
export class AppError extends Error {
  readonly statusCode: number;

  readonly code: ErrorCode;

  readonly details: ErrorDetails | undefined;

  constructor(statusCode: number, code: ErrorCode, message: string, details?: ErrorDetails) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: ErrorDetails): AppError {
    return new AppError(400, ERROR_CODES.VALIDATION_ERROR, message, details);
  }

  static unauthorized(message = 'Autenticacao necessaria', details?: ErrorDetails): AppError {
    return new AppError(401, ERROR_CODES.UNAUTHORIZED, message, details);
  }

  static forbidden(message = 'Permissao insuficiente', details?: ErrorDetails): AppError {
    return new AppError(403, ERROR_CODES.FORBIDDEN, message, details);
  }

  static notFound(message = 'Recurso nao encontrado', details?: ErrorDetails): AppError {
    return new AppError(404, ERROR_CODES.NOT_FOUND, message, details);
  }

  static conflict(message: string, details?: ErrorDetails): AppError {
    return new AppError(409, ERROR_CODES.CONFLICT, message, details);
  }

  static payloadTooLarge(message: string, details?: ErrorDetails): AppError {
    return new AppError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, message, details);
  }

  static unsupportedMediaType(message: string, details?: ErrorDetails): AppError {
    return new AppError(415, ERROR_CODES.UNSUPPORTED_MEDIA_TYPE, message, details);
  }

  static tooManyRequests(message = 'Muitas requisicoes', details?: ErrorDetails): AppError {
    return new AppError(429, ERROR_CODES.RATE_LIMITED, message, details);
  }

  static internal(message = 'Erro interno do servidor', details?: ErrorDetails): AppError {
    return new AppError(500, ERROR_CODES.INTERNAL_ERROR, message, details);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
