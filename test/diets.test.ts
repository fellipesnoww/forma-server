import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, describe, it, mock } from 'node:test';

import {
  CalorieEstimatorError,
  setCalorieEstimatorForTests,
  type CalorieEstimateInput,
  type CalorieEstimator,
} from '../src/features/diets/calorie-estimator/index.js';
import { createGeminiEstimator } from '../src/features/diets/calorie-estimator/gemini.js';
import { createTestContext, type TestContext, type TestUser } from './helpers.js';

/** Dietas: CRUD, totais caloricos, dieta ativa (inclusive em /auth/me) e estimativa por IA. */

interface Food {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  kcal: number;
}

interface Meal {
  id: string;
  name: string;
  time: string;
  totalKcal: number;
  foodCount: number;
  foods?: Food[];
}

interface Diet {
  id: string;
  name: string;
  goal: string | null;
  isActive: boolean;
  totalKcal: number;
  mealCount: number;
  foodCount: number;
  meals: Meal[];
}

let ctx: TestContext;
let user: TestUser;

const SAMPLE = {
  name: 'Cutting',
  goal: 'Perder gordura',
  meals: [
    {
      name: 'Almoco',
      time: '12:30',
      foods: [
        { name: 'Arroz branco cozido', quantity: 150, unit: 'G', kcal: 192 },
        { name: 'Frango grelhado', quantity: 0.12, unit: 'KG', kcal: 198 },
      ],
    },
    {
      name: 'Cafe da manha',
      time: '07:00',
      foods: [
        { name: 'Leite desnatado', quantity: 200, unit: 'ML', kcal: 70 },
        { name: 'Pao integral', quantity: 50, unit: 'G', kcal: 125 },
      ],
    },
    { name: 'Ceia', time: '22:00', foods: [] },
  ],
};

function post(owner: TestUser | null, url: string, payload?: object) {
  return ctx.request(owner, { method: 'POST', url, ...(payload ? { payload } : {}) });
}

async function createDiet(owner: TestUser, payload: object = SAMPLE): Promise<Diet> {
  const response = await post(owner, '/diets', payload);

  assert.equal(response.statusCode, 201, response.body);

  return response.json<Diet>();
}

async function me(owner: TestUser): Promise<{ activeDiet: Diet | null }> {
  return (await ctx.request(owner, { method: 'GET', url: '/auth/me' })).json();
}

function fakeEstimator(
  impl: (
    input: CalorieEstimateInput,
  ) => Promise<{ recognized: boolean; kcal: number; notes: string }>,
): CalorieEstimator & { calls: CalorieEstimateInput[] } {
  const calls: CalorieEstimateInput[] = [];

  return {
    provider: 'anthropic',
    model: 'fake-model',
    calls,
    estimate: async (input) => {
      calls.push(input);

      return impl(input);
    },
  };
}

before(async () => {
  ctx = await createTestContext();
  user = await ctx.createUser();
});

after(async () => {
  setCalorieEstimatorForTests(undefined);
  await ctx.close();
});

describe('POST /diets', () => {
  it('cria com totais por refeicao e do dia; refeicoes por horario, alimentos na ordem enviada', async () => {
    const diet = await createDiet(user);

    assert.equal(diet.name, 'Cutting');
    assert.equal(diet.goal, 'Perder gordura');
    assert.equal(diet.isActive, false, 'nasce inativa');
    assert.equal(diet.totalKcal, 585);
    assert.equal(diet.mealCount, 3);
    assert.equal(diet.foodCount, 4);
    assert.deepEqual(
      diet.meals.map((meal) => [meal.time, meal.name, meal.totalKcal, meal.foodCount]),
      [
        ['07:00', 'Cafe da manha', 195, 2],
        ['12:30', 'Almoco', 390, 2],
        ['22:00', 'Ceia', 0, 0],
      ],
    );
    assert.deepEqual(
      diet.meals[1]!.foods!.map(({ name, quantity, unit, kcal }) => ({
        name,
        quantity,
        unit,
        kcal,
      })),
      SAMPLE.meals[0]!.foods,
    );
  });

  it('aceita dieta sem refeicoes e sem objetivo', async () => {
    const diet = await createDiet(user, { name: 'Rascunho' });

    assert.equal(diet.goal, null);
    assert.equal(diet.totalKcal, 0);
    assert.deepEqual(diet.meals, []);
  });

  const meal = (food: object, time = '08:00') => ({
    name: 'Dieta',
    meals: [
      {
        name: 'Refeicao',
        time,
        foods: [{ name: 'Ovo', quantity: 1, unit: 'G', kcal: 70, ...food }],
      },
    ],
  });

  const invalid: [string, object][] = [
    ['horario 24:00', meal({}, '24:00')],
    ['horario sem zero a esquerda', meal({}, '7:00')],
    ['unidade fora de G/KG/ML/L', meal({ unit: 'OZ' })],
    ['unidade minuscula', meal({ unit: 'g' })],
    ['kcal negativa', meal({ kcal: -1 })],
    ['kcal fracionada', meal({ kcal: 10.5 })],
    ['quantidade zero', meal({ quantity: 0 })],
    ['nome do alimento vazio', meal({ name: '   ' })],
    ['nome da dieta vazio', { name: '' }],
    [
      'mais de 20 refeicoes',
      { name: 'x', meals: Array.from({ length: 21 }, () => ({ name: 'r', time: '08:00' })) },
    ],
  ];

  invalid.forEach(([label, payload]) => {
    it(`${label} -> 400`, async () => {
      const response = await post(user, '/diets', payload);

      assert.equal(response.statusCode, 400, response.body);
    });
  });
});

describe('GET /diets e GET /diets/:id', () => {
  it('listagem: ativa primeiro, refeicoes sem alimentos, so do usuario', async () => {
    const owner = await ctx.createUser();
    const other = await ctx.createUser();
    const first = await createDiet(owner, { ...SAMPLE, name: 'Primeira' });
    await createDiet(owner, { ...SAMPLE, name: 'Segunda' });
    await createDiet(other, { ...SAMPLE, name: 'De outro' });
    await post(owner, `/diets/${first.id}/activate`);

    const { items } = (await ctx.request(owner, { method: 'GET', url: '/diets' })).json<{
      items: Diet[];
    }>();

    assert.deepEqual(
      items.map((diet) => [diet.name, diet.isActive]),
      [
        ['Primeira', true],
        ['Segunda', false],
      ],
    );
    assert.equal(items[0]!.totalKcal, 585);
    assert.equal(items[0]!.meals[0]!.totalKcal, 195);
    assert.equal('foods' in items[0]!.meals[0]!, false);
  });

  it('detalhe de dieta de outro usuario ou inexistente -> 404', async () => {
    const other = await ctx.createUser();
    const diet = await createDiet(other);

    const responses = await Promise.all(
      [diet.id, randomUUID()].map((id) =>
        ctx.request(user, { method: 'GET', url: `/diets/${id}` }),
      ),
    );

    assert.deepEqual(
      responses.map((response) => response.statusCode),
      [404, 404],
    );
  });
});

describe('PATCH /diets/:id', () => {
  it('meals substitui refeicoes e alimentos; totais recalculados', async () => {
    const diet = await createDiet(user);
    const response = await ctx.request(user, {
      method: 'PATCH',
      url: `/diets/${diet.id}`,
      payload: {
        meals: [
          {
            name: 'Unica',
            time: '10:00',
            foods: [{ name: 'Banana', quantity: 1, unit: 'KG', kcal: 890 }],
          },
        ],
      },
    });
    const updated = response.json<Diet>();

    assert.equal(response.statusCode, 200, response.body);
    assert.equal(updated.name, 'Cutting', 'nome intacto');
    assert.equal(updated.totalKcal, 890);
    assert.deepEqual(
      updated.meals.map((meal) => meal.name),
      ['Unica'],
    );
  });

  it('so nome mantem refeicoes; goal null remove o objetivo', async () => {
    const diet = await createDiet(user);
    const updated = (
      await ctx.request(user, {
        method: 'PATCH',
        url: `/diets/${diet.id}`,
        payload: { name: 'Bulking', goal: null },
      })
    ).json<Diet>();

    assert.equal(updated.name, 'Bulking');
    assert.equal(updated.goal, null);
    assert.equal(updated.mealCount, 3);
    assert.equal(updated.totalKcal, 585);
  });

  it('body vazio -> 400; dieta de outro usuario -> 404', async () => {
    const diet = await createDiet(user);
    const other = await ctx.createUser();

    assert.equal(
      (await ctx.request(user, { method: 'PATCH', url: `/diets/${diet.id}`, payload: {} }))
        .statusCode,
      400,
    );
    assert.equal(
      (
        await ctx.request(other, {
          method: 'PATCH',
          url: `/diets/${diet.id}`,
          payload: { name: 'x' },
        })
      ).statusCode,
      404,
    );
  });
});

describe('DELETE /diets/:id', () => {
  it('remove de vez (204, depois 404); de outro usuario -> 404', async () => {
    const diet = await createDiet(user);
    const other = await ctx.createUser();

    assert.equal(
      (await ctx.request(other, { method: 'DELETE', url: `/diets/${diet.id}` })).statusCode,
      404,
    );
    assert.equal(
      (await ctx.request(user, { method: 'DELETE', url: `/diets/${diet.id}` })).statusCode,
      204,
    );
    assert.equal(
      (await ctx.request(user, { method: 'GET', url: `/diets/${diet.id}` })).statusCode,
      404,
    );
  });
});

describe('dieta ativa', () => {
  it('ativar outra desativa a anterior; ativar de novo e idempotente', async () => {
    const owner = await ctx.createUser();
    const a = await createDiet(owner, { name: 'A' });
    const b = await createDiet(owner, { name: 'B' });

    assert.equal((await post(owner, `/diets/${a.id}/activate`)).json<Diet>().isActive, true);
    assert.equal((await post(owner, `/diets/${b.id}/activate`)).json<Diet>().isActive, true);

    const again = await post(owner, `/diets/${b.id}/activate`);
    const { items } = (await ctx.request(owner, { method: 'GET', url: '/diets' })).json<{
      items: Diet[];
    }>();

    assert.equal(again.statusCode, 200);
    assert.deepEqual(
      items.map((diet) => [diet.name, diet.isActive]),
      [
        ['B', true],
        ['A', false],
      ],
    );
  });

  it('ativacoes concorrentes terminam com exatamente uma ativa', async () => {
    const owner = await ctx.createUser();
    const diets = await Promise.all(
      ['A', 'B', 'C', 'D'].map((name) => createDiet(owner, { name })),
    );

    const responses = await Promise.all(
      diets.map((diet) => post(owner, `/diets/${diet.id}/activate`)),
    );
    const { items } = (await ctx.request(owner, { method: 'GET', url: '/diets' })).json<{
      items: Diet[];
    }>();

    assert.ok(responses.every((response) => response.statusCode === 200));
    assert.equal(items.filter((diet) => diet.isActive).length, 1);
  });

  it('deactivate deixa o usuario sem dieta ativa', async () => {
    const owner = await ctx.createUser();
    const diet = await createDiet(owner);
    await post(owner, `/diets/${diet.id}/activate`);

    const response = await post(owner, `/diets/${diet.id}/deactivate`);

    assert.equal(response.json<Diet>().isActive, false);
    assert.equal((await me(owner)).activeDiet, null);
  });

  it('ativar/desativar dieta de outro usuario -> 404', async () => {
    const other = await ctx.createUser();
    const diet = await createDiet(other);

    assert.equal((await post(user, `/diets/${diet.id}/activate`)).statusCode, 404);
    assert.equal((await post(user, `/diets/${diet.id}/deactivate`)).statusCode, 404);
  });

  it('GET /auth/me traz a dieta ativa (resumo) ou null', async () => {
    const owner = await ctx.createUser();

    assert.equal((await me(owner)).activeDiet, null);

    const diet = await createDiet(owner);
    await post(owner, `/diets/${diet.id}/activate`);
    const { activeDiet } = await me(owner);

    assert.equal(activeDiet?.id, diet.id);
    assert.equal(activeDiet.totalKcal, 585);
    assert.deepEqual(
      activeDiet.meals.map((meal) => [meal.time, meal.name]),
      [
        ['07:00', 'Cafe da manha'],
        ['12:30', 'Almoco'],
        ['22:00', 'Ceia'],
      ],
    );

    await ctx.request(owner, { method: 'DELETE', url: `/diets/${diet.id}` });
    assert.equal((await me(owner)).activeDiet, null, 'remover a ativa zera a dieta ativa');
  });
});

describe('POST /diets/calorie-estimate', () => {
  const body = { name: '  Arroz branco cozido ', quantity: 150, unit: 'G' };

  afterEach(() => {
    setCalorieEstimatorForTests(undefined);
  });

  it('sem provedor configurado -> 503 SERVICE_UNAVAILABLE', async () => {
    setCalorieEstimatorForTests(null);

    const response = await post(user, '/diets/calorie-estimate', body);

    assert.equal(response.statusCode, 503);
    assert.equal(response.json<{ error: { code: string } }>().error.code, 'SERVICE_UNAVAILABLE');
  });

  it('devolve a sugestao do provedor sem gravar nada', async () => {
    const estimator = fakeEstimator(async () => ({
      recognized: true,
      kcal: 192,
      notes: 'arroz branco cozido, 128 kcal/100 g',
    }));
    setCalorieEstimatorForTests(estimator);

    const response = await post(user, '/diets/calorie-estimate', body);

    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), {
      kcal: 192,
      notes: 'arroz branco cozido, 128 kcal/100 g',
      provider: 'anthropic',
      model: 'fake-model',
    });
    assert.deepEqual(estimator.calls, [{ name: 'Arroz branco cozido', quantity: 150, unit: 'G' }]);
  });

  it('texto que nao e alimento -> 400', async () => {
    setCalorieEstimatorForTests(
      fakeEstimator(async () => ({ recognized: false, kcal: 0, notes: '' })),
    );

    const response = await post(user, '/diets/calorie-estimate', { ...body, name: 'teclado' });

    assert.equal(response.statusCode, 400);
  });

  it('falha do provedor -> 503 sem vazar o erro interno', async () => {
    setCalorieEstimatorForTests(
      fakeEstimator(async () => {
        throw new CalorieEstimatorError('Credencial da Anthropic invalida');
      }),
    );

    const response = await post(user, '/diets/calorie-estimate', body);

    assert.equal(response.statusCode, 503);
    assert.doesNotMatch(response.body, /Credencial/);
  });

  it('entrada invalida -> 400 sem chamar o provedor; sem token -> 401', async () => {
    const estimator = fakeEstimator(async () => ({ recognized: true, kcal: 1, notes: '' }));
    setCalorieEstimatorForTests(estimator);

    assert.equal(
      (await post(user, '/diets/calorie-estimate', { ...body, unit: 'XICARA' })).statusCode,
      400,
    );
    assert.equal(
      (await post(user, '/diets/calorie-estimate', { ...body, quantity: -1 })).statusCode,
      400,
    );
    assert.equal((await post(null, '/diets/calorie-estimate', body)).statusCode, 401);
    assert.equal(estimator.calls.length, 0);
  });
});

describe('estimador Gemini (REST)', () => {
  const input: CalorieEstimateInput = { name: 'Banana', quantity: 100, unit: 'G' };
  const estimator = createGeminiEstimator({
    apiKey: 'test-key',
    model: 'gemini-test',
    timeoutMs: 1000,
    retryDelayMs: 0,
  });

  afterEach(() => {
    mock.restoreAll();
  });

  function stubFetch(response: Response) {
    return mock.method(globalThis, 'fetch', async () => response);
  }

  /** Cada chamada consome o proximo item da fila (Error = falha de rede). */
  function stubFetchSequence(queue: (Response | Error)[]) {
    let index = 0;

    return mock.method(globalThis, 'fetch', async () => {
      const next = queue[index];

      index += 1;

      if (next instanceof Error) {
        throw next;
      }

      return next;
    });
  }

  function candidate(text?: string): Response {
    return Response.json({ candidates: [{ content: { parts: text ? [{ text }] : [] } }] });
  }

  it('envia a chave no header e pede JSON estruturado; le o primeiro candidato', async () => {
    const fetchMock = stubFetch(
      Response.json({
        candidates: [
          {
            content: { parts: [{ text: '{"recognized":true,"kcal":89,"notes":"banana prata"}' }] },
          },
        ],
      }),
    );

    assert.deepEqual(await estimator.estimate(input), {
      recognized: true,
      kcal: 89,
      notes: 'banana prata',
    });

    const [url, init] = fetchMock.mock.calls[0]!.arguments as [string, RequestInit];
    const sent = JSON.parse(String(init.body)) as {
      contents: { parts: { text: string }[] }[];
      generationConfig: { responseMimeType: string };
    };

    assert.match(url, /models\/gemini-test:generateContent$/);
    assert.equal((init.headers as Record<string, string>)['x-goog-api-key'], 'test-key');
    assert.doesNotMatch(url, /test-key/, 'chave nunca na URL');
    assert.equal(sent.generationConfig.responseMimeType, 'application/json');
    assert.match(sent.contents[0]!.parts[0]!.text, /<alimento>Banana<\/alimento>/);
  });

  it('HTTP de erro ou resposta fora do formato -> CalorieEstimatorError', async () => {
    stubFetch(new Response('quota', { status: 429 }));
    await assert.rejects(estimator.estimate(input), CalorieEstimatorError);

    mock.restoreAll();
    stubFetch(
      Response.json({ candidates: [{ content: { parts: [{ text: '{"kcal":"muito"}' }] } }] }),
    );
    await assert.rejects(estimator.estimate(input), CalorieEstimatorError);
  });

  it('sem resposta (5xx, rede, candidato vazio) -> tenta de novo ate 3 vezes', async () => {
    const fetchMock = stubFetchSequence([
      new Response('high demand', { status: 503 }),
      new TypeError('fetch failed'),
      candidate(),
      candidate('{"recognized":true,"kcal":89,"notes":"banana prata"}'),
    ]);

    assert.equal((await estimator.estimate(input)).kcal, 89);
    assert.equal(fetchMock.mock.callCount(), 4);
  });

  it('desiste apos 3 novas tentativas', async () => {
    const fetchMock = stubFetchSequence(
      Array.from({ length: 4 }, () => new Response('high demand', { status: 503 })),
    );

    await assert.rejects(estimator.estimate(input), /Erro do Gemini \(503\)/);
    assert.equal(fetchMock.mock.callCount(), 4);
  });

  it('erro nao transitorio (4xx) ou formato invalido -> sem nova tentativa', async () => {
    let fetchMock = stubFetch(new Response('forbidden', { status: 403 }));

    await assert.rejects(estimator.estimate(input), /Erro do Gemini \(403\)/);
    assert.equal(fetchMock.mock.callCount(), 1);

    mock.restoreAll();
    fetchMock = stubFetch(candidate('{"kcal":"muito"}'));
    await assert.rejects(estimator.estimate(input), /fora do formato esperado/);
    assert.equal(fetchMock.mock.callCount(), 1);
  });
});
