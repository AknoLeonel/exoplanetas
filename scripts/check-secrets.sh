#!/usr/bin/env bash
# Falha se encontrar padrões típicos de chave vazada no código versionado, ou um .env versionado.
# Roda no CI. Para rodar antes de cada commit: ln -s ../../scripts/check-secrets.sh .git/hooks/pre-commit
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

PADROES='(AKIA[0-9A-Z]{16}|sk_live_[0-9a-zA-Z]{20,}|ghp_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{40,}|xox[baprs]-[0-9A-Za-z-]{10,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|password\s*=\s*["'\''][^"'\'']+["'\''])'
if git grep -nIE "$PADROES" -- ':!*.md' ':!scripts/check-secrets.sh' ':!scripts/novo-projeto.sh'; then
  echo "ERRO: possível segredo encontrado no repositório." >&2
  exit 1
fi

if git ls-files | grep -E '(^|/)\.env(\.[^/]*)?$' | grep -vE '\.env\.example$'; then
  echo "ERRO: arquivo .env versionado." >&2
  exit 1
fi
echo "OK: nenhum segredo óbvio encontrado."
