# Rate limiting

Checklist de produção, item 7.

**Não se aplica hoje.** O site é estático: não há endpoint nosso, nem rota que gere custo (IA, e-mail, API paga). A Vercel serve os arquivos pela CDN e absorve o tráfego.

A única chamada externa é a coleta mensal na NASA, feita pelo CI uma vez por mês (`dados.yml`), bem abaixo de qualquer limite do arquivo.

Se entrar um endpoint (função serverless, API, IA):
- Limite por IP e por usuário autenticado
- Limite mais rígido em login, cadastro e recuperação de senha
- Resposta 429 com `Retry-After`
- Sugestão: Vercel Firewall, Upstash Ratelimit ou middleware do framework
