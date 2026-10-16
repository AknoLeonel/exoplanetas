#!/usr/bin/env bash
# novo-projeto.sh: cria um projeto novo já com o checklist de produção.
# Uso: ./scripts/novo-projeto.sh <nome-do-projeto> [next|node|python]
# O projeto é criado no diretório atual, fora deste repositório.
set -euo pipefail

NAME="${1:?Uso: $0 <nome-do-projeto> [next|node|python]}"
STACK="${2:-node}"

case "$STACK" in
  next|node|python) ;;
  *) echo "Erro: stack '$STACK' desconhecida (use next, node ou python)." >&2; exit 1 ;;
esac

if [ -e "$NAME" ]; then
  echo "Erro: já existe '$NAME'." >&2
  exit 1
fi

echo "==> Criando projeto '$NAME' (stack: $STACK)"
mkdir -p "$NAME"/{src/frontend,src/backend,src/shared,docs,scripts,tests,infra/ci,.github/workflows}
cd "$NAME"

# ---------------------------------------------------------------
# 1. Camadas: front separado do back, segredos fora do bundle
# ---------------------------------------------------------------
cat > docs/ARCHITECTURE.md <<'EOF'
# Arquitetura

- src/frontend: só o que vai pro navegador. NUNCA colocar chave secreta aqui.
- src/backend: API, regras de negócio, integrações externas, acesso ao banco.
- src/shared: tipos e validações compartilhados (sem segredo, sem lógica interna sensível).

Fluxo: frontend -> backend (autenticado) -> banco / APIs externas.
EOF

# ---------------------------------------------------------------
# 2 e 3. Dados + autenticação/permissão
# ---------------------------------------------------------------
cat > docs/SECURITY.md <<'EOF'
# Dados e permissões

## Banco
- [ ] RLS ativo em TODAS as tabelas expostas (ver docs/RLS_TEMPLATE.sql)
- [ ] Política escrita por tabela: quem lê, quem escreve, quem apaga
- [ ] Nenhuma tabela com acesso público por padrão

## Autenticação / autorização
- [ ] Regra documentada: quem acessa o quê (matriz de papéis)
- [ ] Permissão checada no backend, nunca só no frontend
- [ ] Tokens de sessão com expiração e rotação

## Segredos
- [ ] Segredos só em variáveis de ambiente (.env, nunca commitado)
- [ ] Chaves de serviço (service role) somente no backend
EOF

cat > docs/RLS_TEMPLATE.sql <<'EOF'
-- Template de RLS (Postgres / Supabase). Adapte nome da tabela e coluna de dono.
-- Exemplo: tabela "items" com coluna "user_id".

ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE items FORCE ROW LEVEL SECURITY;

CREATE POLICY "items_select_own" ON items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "items_insert_own" ON items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "items_update_own" ON items
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "items_delete_own" ON items
  FOR DELETE USING (auth.uid() = user_id);
EOF

# ---------------------------------------------------------------
# 4. Versionamento
# ---------------------------------------------------------------
cat > .gitignore <<'EOF'
node_modules/
dist/
build/
.next/
__pycache__/
.venv/
.env
.env.*
!.env.example
*.log
.DS_Store
coverage/
EOF

cat > .env.example <<'EOF'
# Copie para .env e preencha. NÃO commitar o .env.
APP_ENV=development
APP_URL=http://localhost:3000
DATABASE_URL=
AUTH_SECRET=
EXTERNAL_API_KEY=
SENTRY_DSN=
EOF

# ---------------------------------------------------------------
# 5. Integrações: wrapper único para APIs externas
# ---------------------------------------------------------------
mkdir -p src/backend/integrations
cat > src/backend/integrations/README.md <<'EOF'
Cada API externa tem um arquivo aqui.
Regras: timeout, retry com backoff, tratamento de erro e nenhuma chamada direta do frontend.
EOF

# ---------------------------------------------------------------
# 6. Deploy / ambiente
# ---------------------------------------------------------------
if [ "$STACK" = "python" ]; then
  cat > Dockerfile <<'EOF'
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV APP_ENV=production
EXPOSE 8000
CMD ["python", "-m", "app"]
EOF
else
  cat > Dockerfile <<'EOF'
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
EOF
fi

cat > .github/workflows/ci.yml <<'EOF'
name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Varredura de segredos
        run: bash scripts/check-secrets.sh
      - name: Lint e testes
        run: |
          if [ -f package.json ]; then npm ci && npm run lint --if-present && npm test --if-present; fi
          if [ -f requirements.txt ]; then pip install -r requirements.txt pytest && pytest; fi
  deploy:
    needs: check
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - run: echo "Configurar deploy do provedor aqui (Vercel, Railway, Fly, etc.)"
EOF

# ---------------------------------------------------------------
# 7. Segurança: varredura de segredos + rate limit
# ---------------------------------------------------------------
cat > scripts/check-secrets.sh <<'EOF'
#!/usr/bin/env bash
# Falha se encontrar padrões típicos de chave vazada no código versionado.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
PATTERNS='(AKIA[0-9A-Z]{16}|sk_live_[0-9a-zA-Z]{20,}|ghp_[0-9A-Za-z]{36}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|password\s*=\s*["'\''][^"'\'']+["'\''])'
if git grep -nIE "$PATTERNS" -- ':!*.md' ':!scripts/check-secrets.sh'; then
  echo "ERRO: possível segredo encontrado no repositório." >&2
  exit 1
fi
if git ls-files | grep -E '(^|/)\.env(\.[^/]*)?$' | grep -vE '\.env\.example$'; then
  echo "ERRO: .env está versionado." >&2
  exit 1
fi
echo "OK: nenhum segredo óbvio encontrado."
EOF
chmod +x scripts/check-secrets.sh

cat > docs/RATE_LIMIT.md <<'EOF'
# Rate limiting

Aplicar em todo endpoint público e em toda rota que gera custo (IA, envio de e-mail, APIs pagas).
- Limite por IP e por usuário autenticado
- Limite mais rígido em login, cadastro e recuperação de senha
- Resposta 429 com cabeçalho Retry-After
Sugestão: Upstash Ratelimit, Cloudflare, ou middleware do framework.
EOF

# ---------------------------------------------------------------
# 8. Cache
# ---------------------------------------------------------------
cat > docs/CACHE.md <<'EOF'
# Cache

- Dados lidos com frequência e pouco mutáveis: cache com TTL explícito
- Invalidação definida por evento (ex.: update invalida a chave)
- Cabeçalhos HTTP (Cache-Control / ETag) para assets e respostas públicas
- Nunca cachear dados privados em cache compartilhado
EOF

# ---------------------------------------------------------------
# 9. Escala
# ---------------------------------------------------------------
cat > docs/SCALING.md <<'EOF'
# Escala

Não escalar antes da hora. Revisar quando:
- Latência p95 passar do alvo de forma recorrente
- CPU ou memória ficarem acima de ~70% em horário de pico
- Fila de jobs crescer sem parar

Antes disso: app stateless, sessão fora da memória, jobs pesados em fila.
EOF

# ---------------------------------------------------------------
# 10. Observabilidade
# ---------------------------------------------------------------
cat > docs/OBSERVABILITY.md <<'EOF'
# Observabilidade

- [ ] Error tracking ligado (ex.: Sentry) com SENTRY_DSN em variável de ambiente
- [ ] Logs estruturados (JSON) com nível e request id
- [ ] Alerta para taxa de erro 5xx acima do normal
- [ ] Health check em /health
EOF

# ---------------------------------------------------------------
# README + checklist geral
# ---------------------------------------------------------------
cat > README.md <<EOF
# $NAME

Stack: $STACK

## Checklist de produção
- [ ] 1. Camadas separadas (docs/ARCHITECTURE.md)
- [ ] 2. RLS e política de dados (docs/SECURITY.md, docs/RLS_TEMPLATE.sql)
- [ ] 3. Autenticação e permissões documentadas
- [ ] 4. Git com branch main/develop e rollback (tags)
- [ ] 5. Integrações com timeout e retry
- [ ] 6. Deploy com variáveis de ambiente e domínio
- [ ] 7. Segurança: sem chave exposta, rate limit (docs/RATE_LIMIT.md)
- [ ] 8. Cache com TTL e invalidação (docs/CACHE.md)
- [ ] 9. Escala sob demanda (docs/SCALING.md)
- [ ] 10. Observabilidade (docs/OBSERVABILITY.md)

## Setup
\`\`\`bash
cp .env.example .env
\`\`\`
EOF

# ---------------------------------------------------------------
# Git: repositório, branches e hook de segredo
# ---------------------------------------------------------------
git init -q -b main
cat > .git/hooks/pre-commit <<'EOF'
#!/usr/bin/env bash
bash scripts/check-secrets.sh
EOF
chmod +x .git/hooks/pre-commit

git add -A
git commit -q -m "chore: scaffold inicial com checklist de produção"
git branch develop
git tag v0.0.0

echo "==> Pronto: $NAME"
echo "    Branches: main, develop | Tag: v0.0.0"
echo "    Próximo passo: preencher docs/SECURITY.md e configurar o deploy em .github/workflows/ci.yml"
