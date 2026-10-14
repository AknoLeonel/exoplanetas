export type NomeProvedor = "sentry" | "datadog" | "newrelic" | "otel";

export type Env = Readonly<Record<string, string | undefined>>;

export interface Configuracao {
  ambiente: string;
  versao: string;
  servico: string;
  sentry: { dsn: string; taxaDeTracos: number } | null;
  datadog: { applicationId: string; clientToken: string; site: string } | null;
  newrelic: { licenseKey: string; applicationId: string; accountId: string; trustKey: string; agentId: string } | null;
  otel: { urlDeTracos: string } | null;
}

function preenchido(v: string | undefined): v is string {
  return v !== undefined && v.trim() !== "";
}

function taxa(v: string | undefined, padrao: number): number {
  const n = Number(v);
  return preenchido(v) && Number.isFinite(n) && n >= 0 && n <= 1 ? n : padrao;
}

/**
 * Lê as variáveis VITE_* e liga cada fornecedor somente se todos os campos obrigatórios dele existirem.
 * Sem variáveis, nada é carregado.
 */
export function lerConfiguracao(env: Env, ambiente: string, versao: string): Configuracao {
  const dsn = env.VITE_SENTRY_DSN;
  const ddApp = env.VITE_DD_APPLICATION_ID;
  const ddToken = env.VITE_DD_CLIENT_TOKEN;
  const nrChave = env.VITE_NR_LICENSE_KEY;
  const nrApp = env.VITE_NR_APPLICATION_ID;
  const otelUrl = env.VITE_OTEL_EXPORTER_URL;
  return {
    ambiente,
    versao,
    servico: preenchido(env.VITE_SERVICE_NAME) ? env.VITE_SERVICE_NAME : "exoplanetas-site",
    sentry: preenchido(dsn) ? { dsn, taxaDeTracos: taxa(env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0.1) } : null,
    datadog:
      preenchido(ddApp) && preenchido(ddToken)
        ? {
            applicationId: ddApp,
            clientToken: ddToken,
            site: preenchido(env.VITE_DD_SITE) ? env.VITE_DD_SITE : "datadoghq.com",
          }
        : null,
    newrelic:
      preenchido(nrChave) && preenchido(nrApp)
        ? {
            licenseKey: nrChave,
            applicationId: nrApp,
            accountId: env.VITE_NR_ACCOUNT_ID ?? "",
            trustKey: env.VITE_NR_TRUST_KEY ?? env.VITE_NR_ACCOUNT_ID ?? "",
            agentId: env.VITE_NR_AGENT_ID ?? nrApp,
          }
        : null,
    otel: preenchido(otelUrl) ? { urlDeTracos: otelUrl } : null,
  };
}

export function provedoresConfigurados(config: Configuracao): NomeProvedor[] {
  const nomes: NomeProvedor[] = [];
  if (config.sentry) nomes.push("sentry");
  if (config.datadog) nomes.push("datadog");
  if (config.newrelic) nomes.push("newrelic");
  if (config.otel) nomes.push("otel");
  return nomes;
}
