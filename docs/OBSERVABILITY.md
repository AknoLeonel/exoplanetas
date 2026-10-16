# Observabilidade

Checklist de produção, item 10.

- [x] Fachada única (`site/src/telemetry`): `erro`, `evento`, `tempo`
- [x] Sentry, Datadog RUM, New Relic Browser e OpenTelemetry, cada um ligado só quando as variáveis `VITE_*` dele existem (`site/.env.example`)
- [x] Sem variável, nenhum SDK é baixado (teste e2e "nenhum SDK de fornecedor é baixado")
- [x] Captura global de erros e Web Vitals (só com algum fornecedor ligado)
- [x] Eventos de navegação por módulo e modo
- [ ] Preencher as variáveis na Vercel e confirmar que os dados chegam
- [ ] Alerta de taxa de erro acima do normal, configurado no painel do fornecedor escolhido

**Não se aplica hoje:** logs estruturados de servidor e `/health`, porque não há servidor. A Vercel já mostra o estado de cada deploy.
