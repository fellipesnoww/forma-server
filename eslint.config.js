import { configs, plugins } from 'eslint-config-airbnb-extended';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', 'src/generated/**'],
  },

  // Registro dos plugins exigidos pelos configs do Airbnb
  plugins.stylistic,
  plugins.importX,
  plugins.node,
  plugins.typescriptEslint,

  // Regras Airbnb (base + TypeScript) e boas praticas de Node
  ...configs.base.recommended,
  ...configs.base.typescript,
  ...configs.node.recommended,

  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        // O project service e instanciado uma unica vez, a partir desta configuracao:
        // arquivos fora do `include` do tsconfig (como prisma.config.ts) precisam ser
        // listados aqui, e nao num override posterior.
        projectService: { allowDefaultProject: ['prisma.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // moduleResolution NodeNext exige a extensao .js nos imports relativos
      'import-x/extensions': ['error', 'ignorePackages', { ts: 'never', js: 'always' }],
      'import-x/prefer-default-export': 'off',
      // Fastify expoe o logger via app.log; console fica restrito ao bootstrap
      'no-console': 'error',
    },
  },

  {
    files: ['src/server.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Config da CLI do Prisma: vive fora de src/, entao nao entra no tsconfig do projeto
  {
    files: ['prisma.config.ts'],
    rules: {
      // Arquivo de configuracao de ferramenta: importar devDependencies e o esperado
      'import-x/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },

  // Sempre por ultimo: desliga regras que conflitam com o Prettier
  prettierConfig,
];
