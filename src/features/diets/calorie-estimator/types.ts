import { z } from 'zod';

export const FOOD_UNITS = ['G', 'KG', 'ML', 'L'] as const;

export type FoodUnit = (typeof FOOD_UNITS)[number];

export interface CalorieEstimateInput {
  name: string;
  quantity: number;
  unit: FoodUnit;
}

/** Teto de sanidade: uma porcao isolada acima disso indica resposta errada do modelo. */
export const MAX_FOOD_KCAL = 20_000;

/**
 * Formato que os dois provedores devem devolver (structured output). `recognized: false`
 * quando o texto nao descreve um alimento — evita inventar calorias para "teclado".
 */
export const estimateOutputSchema = z.object({
  recognized: z.boolean().describe('false se o texto nao descreve um alimento ou bebida'),
  kcal: z
    .number()
    .int()
    .describe('Calorias (kcal) da porcao inteira na quantidade informada; 0 se nao reconhecido'),
  notes: z
    .string()
    .describe('Uma frase curta em portugues com a base da estimativa (ex.: "arroz branco cozido")'),
});

export type EstimateOutput = z.infer<typeof estimateOutputSchema>;

export interface CalorieEstimator {
  readonly provider: 'anthropic' | 'gemini';
  readonly model: string;
  estimate(input: CalorieEstimateInput): Promise<EstimateOutput>;
}

/** Falha do provedor (rede, credencial, limite, resposta invalida) — vira 503 na API. */
export class CalorieEstimatorError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CalorieEstimatorError';
  }
}
