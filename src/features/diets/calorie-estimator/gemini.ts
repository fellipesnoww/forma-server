import { setTimeout as sleep } from 'node:timers/promises';

import { SYSTEM_PROMPT, userPrompt } from './prompt.js';
import {
  CalorieEstimatorError,
  estimateOutputSchema,
  type CalorieEstimateInput,
  type CalorieEstimator,
  type EstimateOutput,
} from './types.js';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Novas tentativas quando o modelo nao responde (rede, timeout, 429, 5xx, resposta vazia). */
const DEFAULT_MAX_RETRIES = 3;

/** Espera antes da 1a nova tentativa; dobra a cada uma (500ms, 1s, 2s). */
const DEFAULT_RETRY_DELAY_MS = 500;

/** Mesmo contrato de `estimateOutputSchema`, no dialeto OpenAPI do `responseSchema` do Gemini. */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    recognized: { type: 'BOOLEAN' },
    kcal: { type: 'INTEGER' },
    notes: { type: 'STRING' },
  },
  required: ['recognized', 'kcal', 'notes'],
};

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/** Falha transitoria: vale tentar de novo. As demais (credencial, modelo inexistente) nao. */
class RetryableError extends CalorieEstimatorError {}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Gemini via REST (sem SDK): uma chamada `generateContent` com saida JSON. */
export function createGeminiEstimator(options: {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxRetries?: number;
  retryDelayMs?: number;
}): CalorieEstimator {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  /** Uma chamada ao Gemini: devolve o texto gerado ou lanca (`RetryableError` se transitoria). */
  async function generate(input: CalorieEstimateInput): Promise<string> {
    let response: Response;

    try {
      response = await fetch(
        `${GEMINI_BASE_URL}/${encodeURIComponent(options.model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt(input) }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: RESPONSE_SCHEMA,
            },
          }),
          signal: AbortSignal.timeout(options.timeoutMs),
        },
      );
    } catch (error) {
      throw new RetryableError('Falha ao consultar o Gemini', { cause: error });
    }

    if (!response.ok) {
      const ErrorClass = isRetryableStatus(response.status)
        ? RetryableError
        : CalorieEstimatorError;

      throw new ErrorClass(`Erro do Gemini (${String(response.status)})`, {
        cause: await response.text().catch(() => null),
      });
    }

    const body = (await response.json().catch(() => null)) as GenerateContentResponse | null;
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new RetryableError('Gemini nao devolveu resposta', { cause: body });
    }

    return text;
  }

  /** `generate` com ate `maxRetries` novas tentativas em falhas transitorias (backoff exponencial). */
  async function generateWithRetry(input: CalorieEstimateInput, attempt = 0): Promise<string> {
    try {
      return await generate(input);
    } catch (error) {
      if (!(error instanceof RetryableError) || attempt >= maxRetries) {
        throw error;
      }

      await sleep(retryDelayMs * 2 ** attempt);

      return generateWithRetry(input, attempt + 1);
    }
  }

  return {
    provider: 'gemini',
    model: options.model,

    async estimate(input: CalorieEstimateInput): Promise<EstimateOutput> {
      const text = await generateWithRetry(input);

      try {
        return estimateOutputSchema.parse(JSON.parse(text));
      } catch (error) {
        throw new CalorieEstimatorError('Resposta do Gemini fora do formato esperado', {
          cause: error,
        });
      }
    },
  };
}
