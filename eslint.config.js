import { configs, plugins } from 'eslint-config-airbnb-extended';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**'],
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
        projectService: true,
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

  // Sempre por ultimo: desliga regras que conflitam com o Prettier
  prettierConfig,
];
