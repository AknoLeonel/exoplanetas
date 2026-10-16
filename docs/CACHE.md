# Cache

Checklist de produção, item 8. Configurado em `vercel.json`.

| O quê | Cabeçalho | Por quê |
|---|---|---|
| `/assets/*` (JS e CSS com hash no nome) | `public, max-age=31536000, immutable` | O nome muda a cada build, então pode ficar em cache para sempre. |
| `/dados/*` (JSON do pipeline) | `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400` | O navegador sempre revalida; a CDN segura por 1 hora e serve o antigo enquanto busca o novo. |
| HTML | padrão da Vercel | Cada deploy publica um HTML novo, que aponta para os assets novos. |

- [x] TTL explícito em tudo que é cacheado
- [x] Invalidação por evento: um deploy novo troca os nomes dos assets, e os JSON mudam só quando o pipeline roda num PR
- [x] Nenhum dado privado (não existe dado privado)
