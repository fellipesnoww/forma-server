import { SYSTEM_PROMPT, userPrompt } from './prompt.js';
import {
  CalorieEstimatorError,
  estimateOutputSchema,
  type CalorieEstimateInput,
  type CalorieEstimator,
  type EstimateOutput,
} from './types.js';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

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

/** Gemini via REST (sem SDK): uma chamada `generateContent` com saida JSON. */
export function createGeminiEstimator(options: {
  apiKey: string;
  model: string;
  timeoutMs: number;
}): CalorieEstimator {
  return {
    provider: 'gemini',
    model: options.model,

    async estimate(input: CalorieEstimateInput): Promise<EstimateOutput> {
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
        throw new CalorieEstimatorError('Falha ao consultar o Gemini', { cause: error });
      }

      if (!response.ok) {
        throw new CalorieEstimatorError(`Erro do Gemini (${String(response.status)})`, {
          cause: await response.text().catch(() => null),
        });
      }

      const body = (await response.json()) as GenerateContentResponse;
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text;

      try {
        return estimateOutputSchema.parse(JSON.parse(text ?? ''));
      } catch (error) {
        throw new CalorieEstimatorError('Resposta do Gemini fora do formato esperado', {
          cause: error,
        });
      }
    },
  };
}
