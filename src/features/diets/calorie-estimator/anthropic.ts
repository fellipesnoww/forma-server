import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

import { SYSTEM_PROMPT, userPrompt } from './prompt.js';
import {
  CalorieEstimatorError,
  estimateOutputSchema,
  type CalorieEstimateInput,
  type CalorieEstimator,
  type EstimateOutput,
} from './types.js';

export function createAnthropicEstimator(options: {
  apiKey: string;
  model: string;
  timeoutMs: number;
}): CalorieEstimator {
  const client = new Anthropic({
    apiKey: options.apiKey,
    timeout: options.timeoutMs,
    // O usuario esta esperando o botao "IA" responder: uma nova tentativa no maximo
    maxRetries: 1,
  });

  return {
    provider: 'anthropic',
    model: options.model,

    async estimate(input: CalorieEstimateInput): Promise<EstimateOutput> {
      try {
        const response = await client.beta.messages.parse({
          model: options.model,
          max_tokens: 16000,
          // Recusa do classificador de seguranca e re-executada no modelo recomendado
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt(input) }],
          // Consulta simples e curta: esforco baixo reduz latencia e custo
          output_config: { effort: 'low', format: betaZodOutputFormat(estimateOutputSchema) },
        });

        if (response.stop_reason === 'refusal') {
          throw new CalorieEstimatorError('Modelo recusou a estimativa');
        }

        if (!response.parsed_output) {
          throw new CalorieEstimatorError(
            `Resposta sem saida estruturada (stop_reason=${String(response.stop_reason)})`,
          );
        }

        return response.parsed_output;
      } catch (error) {
        if (error instanceof CalorieEstimatorError) {
          throw error;
        }

        if (error instanceof Anthropic.AuthenticationError) {
          throw new CalorieEstimatorError('Credencial da Anthropic invalida', { cause: error });
        }

        if (error instanceof Anthropic.RateLimitError) {
          throw new CalorieEstimatorError('Limite de uso da Anthropic atingido', { cause: error });
        }

        if (error instanceof Anthropic.APIError) {
          throw new CalorieEstimatorError(`Erro da Anthropic (${String(error.status)})`, {
            cause: error,
          });
        }

        throw new CalorieEstimatorError('Falha ao consultar a Anthropic', { cause: error });
      }
    },
  };
}
