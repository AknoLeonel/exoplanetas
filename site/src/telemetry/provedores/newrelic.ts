import { BrowserAgent } from "@newrelic/browser-agent/loaders/browser-agent";
import type { Configuracao } from "../config";
import type { Provedor } from "../provedor";

export async function iniciar(config: Configuracao): Promise<Provedor> {
  const nr = config.newrelic;
  if (!nr) throw new Error("New Relic sem credenciais");
  const agente = new BrowserAgent({
    init: {
      distributed_tracing: { enabled: true },
      privacy: { cookies_enabled: false },
      ajax: { deny_list: ["bam.nr-data.net"] },
    },
    info: {
      beacon: "bam.nr-data.net",
      errorBeacon: "bam.nr-data.net",
      licenseKey: nr.licenseKey,
      applicationID: nr.applicationId,
      sa: 1,
    },
    loader_config: {
      accountID: nr.accountId,
      trustKey: nr.trustKey,
      agentID: nr.agentId,
      licenseKey: nr.licenseKey,
      applicationID: nr.applicationId,
    },
  });
  agente.setApplicationVersion(config.versao);
  return {
    nome: "newrelic",
    capturaAutomatica: true,
    erro: (e, contexto) => {
      agente.noticeError(e instanceof Error ? e : new Error(String(e)), contexto ? { ...contexto } : undefined);
    },
    evento: (nome, dados) => {
      agente.addPageAction(nome, dados ? { ...dados } : undefined);
    },
  };
}
