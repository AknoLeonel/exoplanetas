# Dados, permissões e segredos

Checklist de produção, itens 2, 3 e 7.

## Banco (item 2)
**Não se aplica hoje.** Não há banco: os dados são públicos (NASA Exoplanet Archive) e o site lê JSON estáticos.
Se um dia entrar um banco (por exemplo Supabase para contas ou favoritos), passa a ser obrigatório:
- [ ] RLS ativo em todas as tabelas expostas, com política por tabela (quem lê, escreve, apaga)
- [ ] Nenhuma tabela com acesso público por padrão
- [ ] Modelo de política: [`RLS_TEMPLATE.sql`](RLS_TEMPLATE.sql)

## Autenticação e autorização (item 3)
**Não se aplica hoje.** O site não tem login nem dado privado: todo visitante vê o mesmo conteúdo.
Se entrar login: matriz de papéis documentada aqui, permissão checada no backend (nunca só no navegador), sessão com expiração e rotação.

## Integridade dos dados
- [x] `data/exoplanetas.csv` só muda pelo workflow `dados.yml`, que nunca commita na `main`: abre uma branch para virar PR
- [x] O coletor valida colunas e quantidade mínima de planetas antes de gravar
- [x] O CI reroda o pipeline e falha se `reports/metricas.json` ou `site/public/dados` divergirem do que está commitado

## Segredos (item 7)
- [x] `.env` e `.env.*` ignorados pelo git; só os `.env.example` são versionados
- [x] Chaves de observabilidade ficam nas variáveis de ambiente da Vercel (lista em `site/.env.example`)
- [x] `scripts/check-secrets.sh` roda no CI e falha se achar chave vazada ou `.env` versionado
- [x] Cabeçalhos de segurança no `vercel.json` (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`)
- [x] Workflows com permissão mínima (`contents: read` no CI)
- [ ] Rodar o hook localmente, opcional: `ln -s ../../scripts/check-secrets.sh .git/hooks/pre-commit`

Rate limit: ver [`RATE_LIMIT.md`](RATE_LIMIT.md).
