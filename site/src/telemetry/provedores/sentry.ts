import * as Sentry from "@sentry/browser";
import type { Configuracao } from "../config";
import type { Provedor } from "../provedor";

export async function iniciar(config: Configuracao): Promise<Provedor> {
  if (!config.sentry) throw new Error("Sentry sem DSN");
  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.ambiente,
    release: config.versao,
    tracesSampleRate: config.sentry.taxaDeTracos,
    integrations: [Sentry.browserTracingIntegration()],
  });
  return {
    nome: "sentry",
    capturaAutomatica: true,
    erro: (e, contexto) => {
      Sentry.captureException(e, contexto ? { extra: { ...contexto } } : undefined);
    },
    evento: (nome, dados) => {
      Sentry.addBreadcrumb({ category: "app", message: nome, ...(dados ? { data: { ...dados } } : {}) });
    },
  };
}
