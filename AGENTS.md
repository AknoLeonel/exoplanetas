# AGENTS.md

Instruções obrigatórias para qualquer agente de IA (de qualquer modelo ou ferramenta) e qualquer pessoa que trabalhe neste repositório.

## Fluxo: Issue → Branch → PR

1. Toda tarefa (Correção, Melhoria ou Nova função) começa com uma Issue **antes do código**, com o tipo no título: `[Correção]`, `[Melhoria]` ou `[Nova função]`, e critérios de aceite no corpo. Uma Issue por tarefa.
2. Nunca faça commit direto na `main`. Crie uma branch: `feat/`, `fix/`, `docs/`, `chore/` ou `data/`.
3. Toda mudança entra por Pull Request que menciona a Issue na descrição (`Closes #N`, uma por linha se forem várias; `Refs #N` para Issues só relacionadas). Use `.github/pull_request_template.md`.
4. O CI (lint e testes) precisa passar antes do merge.
5. Commits seguem Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `data:`), com o assunto em minúsculas.

## Dados

- A fonte é o [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu), tabela `pscomppars` (um registro por planeta confirmado).
- Nunca edite `data/exoplanetas.csv` à mão. Ele só muda pelo workflow `dados.yml`, que guarda junto a data da coleta em `data/metadados.json`.
- Toda análise precisa ser reprodutível com `python -m exoplanetas.pipeline`.

## Código

- Lógica em `src/exoplanetas/` como funções puras e testadas. Os gráficos e o pipeline só orquestram.
- Testes em `tests/` com pytest. Toda nova função vem com teste.
- Lint e formatação com Ruff (`ruff check` e `ruff format --check`).
- Números citados no README precisam vir de `reports/metricas.json`, gerado pelo pipeline. Nunca escreva um número à mão.

## Deploys

- A Vercel publica a `main` (produção) e cria uma **prévia automática para cada branch e PR**. É assim que os deploys são geridos: por PR. Nunca faça deploy manual nem aponte a produção para outra branch.
- Confira a prévia antes do merge. A configuração está em `vercel.json` (só o `site/` é publicado).
- Se um PR depende de outro ainda não mergeado, abra-o com base na branch dele e diga isso na descrição. Quando o PR de baixo for mergeado, aponte este para a `main`.
- Segredos e chaves de observabilidade ficam nas variáveis de ambiente da Vercel, nunca no repositório. Toda variável nova entra em `site/.env.example`.

## Site (`site/`)

- Camadas (verificadas pelo `arch-contract`): `lib` (lógica pura, sem DOM nem rede) ← `data` ← `ui` ← `app`. Só `src/telemetry/provedores/` conhece SDKs de fornecedor; o resto usa a fachada `telemetria` (`erro`, `evento`, `tempo`).
- Dados do site saem do pipeline (`python -m exoplanetas.pipeline` grava `site/public/dados/`). Nunca edite esses JSON à mão e nunca digite no HTML ou no código um número que venha deles.
- **Interface e movimento** (skill [design-motion-principles](https://github.com/kylezantos/design-motion-principles); aqui: Emil Kowalski como lente principal, Jakub Krehel como secundária):
  - Todo conteúdo assíncrono tem **skeleton** do mesmo tamanho do conteúdo final e progresso; toda seção carrega **sob demanda** (`quandoVisivel` + `import()`).
  - Entrada e saída por transição de `opacity` e `transform`, com a saída mais curta e sutil que a entrada. Nunca anime `width`, `height`, `top` ou `left`.
  - Sem movimento em texto estático, hover repetido, digitação e atalhos de teclado. Sem animação em laço para chamar atenção.
  - Toda duração e curva vem de `src/estilos/tokens.css`, e `prefers-reduced-motion` é tratado no mesmo código, não depois.
- **Qualidade** antes de abrir o PR, dentro de `site/`: `npm run qualidade`, `npm test`, `npm run e2e`. Mudou a lógica em `src/lib`? Rode também `npm run mutacao` (nota mínima 80).
- **Testes**: toda função nova em `src/lib` vem com teste unitário; todo componente novo, com teste de integração; todo comportamento visível ao usuário, com teste Playwright. A cobertura mínima está em `site/vite.config.ts` e vai para o Codecov.
- Mensagens de commit passam no `commitlint` (assunto em minúsculas, tipos listados em `site/commitlint.config.mjs`).
