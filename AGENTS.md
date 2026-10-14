# AGENTS.md

Instruções obrigatórias para qualquer agente de IA (de qualquer modelo ou ferramenta) e qualquer pessoa que trabalhe neste repositório.

## Fluxo: Issue → Branch → PR

1. Toda tarefa começa com uma Issue com o tipo no título: `[Correção]`, `[Melhoria]` ou `[Nova função]`.
2. Nunca faça commit direto na `main`. Crie uma branch: `feat/`, `fix/`, `docs/`, `chore/` ou `data/`.
3. Toda mudança entra por Pull Request que menciona a Issue (`Closes #N`). Use `.github/pull_request_template.md`.
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
