# Escala

Checklist de produção, item 9.

O site é estático na CDN da Vercel, então já escala sem servidor para cuidar. O que pode crescer:

| Risco | Sinal | Resposta |
|---|---|---|
| JSON de planetas pesado demais | `site/public/dados/planetas.json` passar de ~2 MB, ou o LCP piorar no Web Vitals | Mandar só as colunas que a tela usa, paginar ou comprimir num formato colunar |
| Módulos pesados (3D, ML) | Chunk do módulo passar de ~300 kB comprimido | Manter o `import()` por módulo (já é a regra) e carregar bibliotecas só dentro do módulo |
| Cálculo travando a tela | Tarefas longas (> 50 ms) ao mexer num controle | Levar a conta para um Web Worker |

Antes disso, não escalar. Se entrar backend: app sem estado, sessão fora da memória, trabalho pesado em fila.
