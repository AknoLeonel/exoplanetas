import { datadogRum } from "@datadog/browser-rum";
import type { Configuracao } from "../config";
import type { Provedor } from "../provedor";

export async function iniciar(config: Configuracao): Promise<Provedor> {
  if (!config.datadog) throw new Error("Datadog sem credenciais");
  datadogRum.init({
    applicationId: config.datadog.applicationId,
    clientToken: config.datadog.clientToken,
    site: config.datadog.site,
    service: config.servico,
    env: config.ambiente,
    version: config.versao,
    sessionSampleRate: 100,
    sessionReplaySampleRate: 0,
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel: "mask-user-input",
  });
  return {
    nome: "datadog",
    capturaAutomatica: true,
    erro: (e, contexto) => {
      datadogRum.addError(e, contexto ? { ...contexto } : undefined);
    },
    evento: (nome, dados) => {
      datadogRum.addAction(nome, dados ? { ...dados } : undefined);
    },
  };
}
