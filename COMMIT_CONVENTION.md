# Convenção de Commits

Toda mensagem de commit deve começar com um prefixo em maiúsculas entre colchetes, seguido de um espaço e da descrição.

```
[PREFIXO] descrição curta e objetiva no imperativo
```

## Prefixos válidos

| Prefixo    | Quando usar                            |
| ---------- | -------------------------------------- |
| `[FEAT] `  | Novas funcionalidades                  |
| `[FIX] `   | Correções de bugs                      |
| `[DOCS] `  | Documentação                           |
| `[TEST] `  | Testes                                 |
| `[CHORE] ` | Refatorações e manutenção              |
| `[BUILD] ` | Configurações de build, deploy e CI/CD |

## Regras

- O prefixo é obrigatório e deve estar em maiúsculas.
- Deve haver exatamente um espaço entre o `]` e a descrição.
- A linha do título tem no máximo 100 caracteres.
- Descrição no imperativo e em português.

## Exemplos

Válidos:

```
[FEAT] adiciona login com Google via OAuth
[FIX] corrige cálculo de carga máxima no gráfico de progressão
[DOCS] documenta variáveis de ambiente no README
[TEST] cobre validação de datas retroativas
[CHORE] extrai validação de env para módulo próprio
[BUILD] configura pipeline de deploy em staging
```

Inválidos:

```
feat: adiciona login          -> prefixo fora do padrão
[feat] adiciona login         -> prefixo em minúsculas
[FEAT]adiciona login          -> falta o espaço após o colchete
ajustes                       -> sem prefixo
```

## Enforcement automático

A validação é feita pelo [commitlint](https://commitlint.js.org) através do hook `commit-msg` do husky, configurado em [`commitlint.config.js`](commitlint.config.js). Commits fora do padrão são **rejeitados localmente**.

Além disso, o hook `pre-commit` roda `yarn lint` e `yarn format:check` antes de permitir o commit.

Para validar uma mensagem manualmente:

```bash
echo "[FEAT] minha mensagem" | yarn commitlint
```
