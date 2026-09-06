const PREFIXES = ['FEAT', 'FIX', 'DOCS', 'TEST', 'CHORE', 'BUILD'];
const HEADER_PATTERN = new RegExp(`^\\[(${PREFIXES.join('|')})\\] .+`);

/**
 * Convencao de commit do projeto: `[PREFIXO] mensagem`.
 * Ver COMMIT_CONVENTION.md.
 */
export default {
  parserPreset: {
    parserOpts: {
      headerPattern: new RegExp(`^\\[(${PREFIXES.join('|')})\\] (.+)$`),
      headerCorrespondence: ['type', 'subject'],
    },
  },
  plugins: [
    {
      rules: {
        'forma-header-prefix': ({ header }) => [
          HEADER_PATTERN.test(header ?? ''),
          [
            `A mensagem de commit deve comecar com um prefixo valido seguido de espaco: ${PREFIXES.map(
              (prefix) => `[${prefix}]`,
            ).join(', ')}.`,
            'Exemplo: [FEAT] adiciona login com Google',
          ].join('\n'),
        ],
      },
    },
  ],
  rules: {
    'forma-header-prefix': [2, 'always'],
    'header-max-length': [2, 'always', 100],
  },
};
