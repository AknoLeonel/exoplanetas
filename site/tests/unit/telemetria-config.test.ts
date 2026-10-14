import { describe, expect, it } from "vitest";
import { lerConfiguracao, provedoresConfigurados } from "../../src/telemetry/config";

describe("lerConfiguracao", () => {
  it("sem variáveis não liga ninguém", () => {
    const c = lerConfiguracao({}, "local", "dev");
    expect(provedoresConfigurados(c)).toEqual([]);
    expect(c).toMatchObject({ ambiente: "local", versao: "dev", servico: "exoplanetas-site" });
  });

  it("variáveis vazias ou só com espaços contam como ausentes", () => {
    const c = lerConfiguracao({ VITE_SENTRY_DSN: "  ", VITE_OTEL_EXPORTER_URL: "" }, "local", "dev");
    expect(provedoresConfigurados(c)).toEqual([]);
  });

  it("liga o Sentry só com o DSN e usa a taxa padrão", () => {
    const c = lerConfiguracao({ VITE_SENTRY_DSN: "https://k@o.ingest.sentry.io/1" }, "production", "abc1234");
    expect(provedoresConfigurados(c)).toEqual(["sentry"]);
    expect(c.sentry).toEqual({ dsn: "https://k@o.ingest.sentry.io/1", taxaDeTracos: 0.1 });
  });

  it.each([
    ["0.5", 0.5],
    ["0", 0],
    ["1", 1],
    ["2", 0.1],
    ["-1", 0.1],
    ["abc", 0.1],
    ["", 0.1],
  ])("taxa de traços %j vira %j", (entrada, esperado) => {
    const c = lerConfiguracao({ VITE_SENTRY_DSN: "x", VITE_SENTRY_TRACES_SAMPLE_RATE: entrada }, "p", "v");
    expect(c.sentry?.taxaDeTracos).toBe(esperado);
  });

  it("o Datadog exige application id e client token", () => {
    expect(lerConfiguracao({ VITE_DD_APPLICATION_ID: "a" }, "p", "v").datadog).toBeNull();
    expect(lerConfiguracao({ VITE_DD_CLIENT_TOKEN: "t" }, "p", "v").datadog).toBeNull();
    const c = lerConfiguracao({ VITE_DD_APPLICATION_ID: "a", VITE_DD_CLIENT_TOKEN: "t" }, "p", "v");
    expect(c.datadog).toEqual({ applicationId: "a", clientToken: "t", site: "datadoghq.com" });
    const eu = lerConfiguracao(
      { VITE_DD_APPLICATION_ID: "a", VITE_DD_CLIENT_TOKEN: "t", VITE_DD_SITE: "datadoghq.eu" },
      "p",
      "v",
    );
    expect(eu.datadog?.site).toBe("datadoghq.eu");
  });

  it("o New Relic exige license key e application id, e completa o resto", () => {
    expect(lerConfiguracao({ VITE_NR_LICENSE_KEY: "k" }, "p", "v").newrelic).toBeNull();
    const c = lerConfiguracao(
      { VITE_NR_LICENSE_KEY: "k", VITE_NR_APPLICATION_ID: "9", VITE_NR_ACCOUNT_ID: "7" },
      "p",
      "v",
    );
    expect(c.newrelic).toEqual({ licenseKey: "k", applicationId: "9", accountId: "7", trustKey: "7", agentId: "9" });
    const completo = lerConfiguracao(
      {
        VITE_NR_LICENSE_KEY: "k",
        VITE_NR_APPLICATION_ID: "9",
        VITE_NR_ACCOUNT_ID: "7",
        VITE_NR_TRUST_KEY: "5",
        VITE_NR_AGENT_ID: "3",
      },
      "p",
      "v",
    );
    expect(completo.newrelic).toMatchObject({ trustKey: "5", agentId: "3" });
    const semConta = lerConfiguracao({ VITE_NR_LICENSE_KEY: "k", VITE_NR_APPLICATION_ID: "9" }, "p", "v");
    expect(semConta.newrelic).toMatchObject({ accountId: "", trustKey: "" });
  });

  it("liga o OpenTelemetry com o endpoint e aceita nome de serviço próprio", () => {
    const c = lerConfiguracao(
      { VITE_OTEL_EXPORTER_URL: "https://c/v1/traces", VITE_SERVICE_NAME: "meu-site" },
      "p",
      "v",
    );
    expect(c.otel).toEqual({ urlDeTracos: "https://c/v1/traces" });
    expect(c.servico).toBe("meu-site");
  });

  it("lista os fornecedores ligados na ordem fixa", () => {
    const c = lerConfiguracao(
      {
        VITE_OTEL_EXPORTER_URL: "u",
        VITE_NR_LICENSE_KEY: "k",
        VITE_NR_APPLICATION_ID: "a",
        VITE_DD_APPLICATION_ID: "a",
        VITE_DD_CLIENT_TOKEN: "t",
        VITE_SENTRY_DSN: "d",
      },
      "p",
      "v",
    );
    expect(provedoresConfigurados(c)).toEqual(["sentry", "datadog", "newrelic", "otel"]);
  });
});
