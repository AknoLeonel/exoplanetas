# Arquitetura

Checklist de produção, item 1. Visão geral: [README](../README.md#checklist-de-produção).

O projeto não tem backend nem banco. São duas partes que só se falam por arquivos gerados:

```
NASA Exoplanet Archive ──(dados.yml, mensal)──> data/exoplanetas.csv
                                                      │
                          python -m exoplanetas.pipeline
                                                      │
                     ┌────────────────────────────────┴───────────────┐
             reports/metricas.json, figuras             site/public/dados/*.json
                (README, relatório)                         │
                                                  site (Vite, estático) ──> Vercel
```

| Camada | Onde | Regra |
|---|---|---|
| Análise | `src/exoplanetas/` | Funções puras e testadas; o pipeline só orquestra. |
| Coleta | `scripts/coletar_dados.py`, `.github/workflows/dados.yml` | Única forma de mudar `data/exoplanetas.csv`. |
| Site, `lib` | `site/src/lib` | Lógica pura, sem DOM nem rede. |
| Site, `data` | `site/src/data` | Busca os JSON do pipeline. |
| Site, `ui` | `site/src/ui` | DOM e componentes. |
| Site, `app` | `site/src/app` | Liga tudo. |
| Telemetria | `site/src/telemetry` | Só `provedores/` conhece SDKs de fornecedor. |

As camadas do site são verificadas no CI pelo `arch-contract` (`site/arch-contract.yaml`).

**Segredos fora do bundle:** tudo que está em `site/` vai para o navegador. Só entram lá variáveis `VITE_*` feitas para o navegador (DSN do Sentry, client token do Datadog, license key de navegador do New Relic). Chave secreta de verdade exigiria um backend, que hoje não existe.
