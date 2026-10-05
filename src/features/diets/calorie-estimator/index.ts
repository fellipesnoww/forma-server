import { env } from '../../../config/env.js';
import { createAnthropicEstimator } from './anthropic.js';
import { createGeminiEstimator } from './gemini.js';
import type { CalorieEstimator } from './types.js';

export {
  CalorieEstimatorError,
  FOOD_UNITS,
  MAX_FOOD_KCAL,
  type CalorieEstimateInput,
  type CalorieEstimator,
  type FoodUnit,
} from './types.js';

function firstConfiguredProvider(): 'anthropic' | 'gemini' | null {
  if (env.ANTHROPIC_API_KEY) {
    return 'anthropic';
  }

  return env.GEMINI_API_KEY ? 'gemini' : null;
}

/**
 * Provedor escolhido por env: `CALORIE_AI_PROVIDER` explicito ou, sem ele, o primeiro com
 * chave (Anthropic, depois Gemini). `null` = IA desligada (a rota responde 503).
 */
function fromEnv(): CalorieEstimator | null {
  const provider = env.CALORIE_AI_PROVIDER ?? firstConfiguredProvider();
  const timeoutMs = env.CALORIE_AI_TIMEOUT_MS;

  if (provider === 'anthropic' && env.ANTHROPIC_API_KEY) {
    return createAnthropicEstimator({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL,
      timeoutMs,
    });
  }

  if (provider === 'gemini' && env.GEMINI_API_KEY) {
    return createGeminiEstimator({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
      timeoutMs,
    });
  }

  return null;
}

let override: CalorieEstimator | null | undefined;
let cached: CalorieEstimator | null | undefined;

export function getCalorieEstimator(): CalorieEstimator | null {
  if (override !== undefined) {
    return override;
  }

  cached ??= fromEnv();

  return cached;
}

/** So para testes: troca o provedor real por um fake (`undefined` restaura o do env). */
export function setCalorieEstimatorForTests(estimator: CalorieEstimator | null | undefined): void {
  override = estimator;
}
