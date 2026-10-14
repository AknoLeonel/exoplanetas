import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import type { Carregadores } from "../../src/telemetry";
import * as telemetria from "../../src/telemetry";
import { lerConfiguracao } from "../../src/telemetry/config";
import type { Provedor } from "../../src/telemetry/provedor";

type ProvedorFalso = Provedor & { erro: Mock<Provedor["erro"]>; evento: Mock<Provedor["evento"]> };

function falso(nome: Provedor["nome"], capturaAutomatica: boolean): ProvedorFalso {
  return { nome, capturaAutomatica, erro: vi.fn<Provedor["erro"]>(), evento: vi.fn<Provedor["evento"]>() };
}

function carregadores(mapa: Partial<Record<Provedor["nome"], Provedor | Error>>): Carregadores {
  const faz = (nome: Provedor["nome"]) => async () => ({
    iniciar: async () => {
      const r = mapa[nome];
      if (r instanceof Error) throw r;
      if (!r) throw new Error("não configurado");
      return r;
    },
  });
  return { sentry: faz("sentry"), datadog: faz("datadog"), newrelic: faz("newrelic"), otel: faz("otel") };
}

const TUDO = lerConfiguracao(
  {
    VITE_SENTRY_DSN: "d",
    VITE_DD_APPLICATION_ID: "a",
    VITE_DD_CLIENT_TOKEN: "t",
    VITE_NR_LICENSE_KEY: "k",
    VITE_NR_APPLICATION_ID: "a",
    VITE_OTEL_EXPORTER_URL: "u",
  },
  "teste",
  "v1",
);

afterEach(() => telemetria.reiniciarTelemetria());

describe("fachada de telemetria", () => {
  it("sem configuração não carrega nenhum SDK", async () => {
    const carregar = vi.fn();
    const r = await telemetria.iniciarTelemetria(lerConfiguracao({}, "t", "v"), {
      sentry: carregar,
      datadog: carregar,
      newrelic: carregar,
      otel: carregar,
    });
    expect(carregar).not.toHaveBeenCalled();
    expect(r).toEqual({ ativos: [], falhas: [] });
    expect(telemetria.provedoresAtivos()).toEqual([]);
  });

  it("só carrega os fornecedores configurados", async () => {
    const sentry = falso("sentry", true);
    const carregar = carregadores({ sentry });
    const espiao = vi.fn(carregar.otel);
    const r = await telemetria.iniciarTelemetria(lerConfiguracao({ VITE_SENTRY_DSN: "d" }, "t", "v"), {
      ...carregar,
      otel: espiao,
    });
    expect(r.ativos).toEqual(["sentry"]);
    expect(espiao).not.toHaveBeenCalled();
  });

  it("repassa erros e eventos a todos os fornecedores", async () => {
    const todos = {
      sentry: falso("sentry", true),
      datadog: falso("datadog", true),
      newrelic: falso("newrelic", true),
      otel: falso("otel", false),
    };
    const r = await telemetria.iniciarTelemetria(TUDO, carregadores(todos));
    expect(r.ativos.sort()).toEqual(["datadog", "newrelic", "otel", "sentry"]);
    const e = new Error("falhou");
    telemetria.erro(e, { secao: "x" });
    telemetria.evento("clique", { a: 1 });
    for (const p of Object.values(todos)) {
      expect(p.erro).toHaveBeenCalledWith(e, { secao: "x" });
      expect(p.evento).toHaveBeenCalledWith("clique", { a: 1 });
    }
  });

  it("tempo vira evento com a duração arredondada", async () => {
    const p = falso("sentry", true);
    await telemetria.iniciarTelemetria(
      lerConfiguracao({ VITE_SENTRY_DSN: "d" }, "t", "v"),
      carregadores({ sentry: p }),
    );
    telemetria.tempo("carga", 12.6, { arquivo: "a" });
    expect(p.evento).toHaveBeenCalledWith("carga", { arquivo: "a", duracao_ms: 13 });
  });

  it("um fornecedor que falha ao iniciar não derruba os outros", async () => {
    const dd = falso("datadog", true);
    const r = await telemetria.iniciarTelemetria(
      TUDO,
      carregadores({
        sentry: new Error("dsn inválido"),
        datadog: dd,
        newrelic: new Error("rede"),
        otel: falso("otel", false),
      }),
    );
    expect(r.ativos.sort()).toEqual(["datadog", "otel"]);
    expect(r.falhas.map((f) => [f.nome, f.motivo]).sort()).toEqual([
      ["newrelic", "rede"],
      ["sentry", "dsn inválido"],
    ]);
    telemetria.evento("ok");
    expect(dd.evento).toHaveBeenCalledWith("ok", undefined);
  });

  it("falha que não é Error também vira mensagem", async () => {
    const carregar = carregadores({});
    carregar.sentry = async () => ({
      iniciar: async () => {
        throw "texto solto";
      },
    });
    const r = await telemetria.iniciarTelemetria(lerConfiguracao({ VITE_SENTRY_DSN: "d" }, "t", "v"), carregar);
    expect(r.falhas).toEqual([{ nome: "sentry", motivo: "texto solto" }]);
  });

  it("um fornecedor que lança ao registrar um erro não afeta os outros", async () => {
    const ruim = falso("sentry", true);
    ruim.erro.mockImplementation(() => {
      throw new Error("sdk quebrado");
    });
    const bom = falso("datadog", true);
    await telemetria.iniciarTelemetria(
      lerConfiguracao({ VITE_SENTRY_DSN: "d", VITE_DD_APPLICATION_ID: "a", VITE_DD_CLIENT_TOKEN: "t" }, "t", "v"),
      carregadores({ sentry: ruim, datadog: bom }),
    );
    expect(() => telemetria.erro(new Error("x"))).not.toThrow();
    expect(bom.erro).toHaveBeenCalledOnce();
  });

  it("guarda o que acontece durante a inicialização e entrega depois", async () => {
    const p = falso("sentry", true);
    const carregar = carregadores({ sentry: p });
    const promessa = telemetria.iniciarTelemetria(lerConfiguracao({ VITE_SENTRY_DSN: "d" }, "t", "v"), carregar);
    telemetria.evento("cedo", { n: 1 });
    telemetria.erro(new Error("cedo"));
    expect(p.evento).not.toHaveBeenCalled();
    await promessa;
    expect(p.evento).toHaveBeenCalledWith("cedo", { n: 1 });
    expect(p.erro).toHaveBeenCalledOnce();
  });

  it("a fila tem limite de 50 itens", async () => {
    const p = falso("sentry", true);
    const promessa = telemetria.iniciarTelemetria(
      lerConfiguracao({ VITE_SENTRY_DSN: "d" }, "t", "v"),
      carregadores({ sentry: p }),
    );
    for (let i = 0; i < 80; i++) telemetria.evento(`e${i}`);
    await promessa;
    expect(p.evento).toHaveBeenCalledTimes(50);
    expect(p.evento).toHaveBeenLastCalledWith("e49", undefined);
  });

  it("erro global só vai para quem não captura sozinho", async () => {
    const sentry = falso("sentry", true);
    const otel = falso("otel", false);
    await telemetria.iniciarTelemetria(
      lerConfiguracao({ VITE_SENTRY_DSN: "d", VITE_OTEL_EXPORTER_URL: "u" }, "t", "v"),
      carregadores({ sentry, otel }),
    );
    telemetria.erroGlobal(new Error("solto"), { origem: "teste" });
    expect(sentry.erro).not.toHaveBeenCalled();
    expect(otel.erro).toHaveBeenCalledOnce();
  });

  it("erro global antes de os SDKs iniciarem vai para todos, porque nenhum SDK o viu", async () => {
    const sentry = falso("sentry", true);
    const otel = falso("otel", false);
    const promessa = telemetria.iniciarTelemetria(
      lerConfiguracao({ VITE_SENTRY_DSN: "d", VITE_OTEL_EXPORTER_URL: "u" }, "t", "v"),
      carregadores({ sentry, otel }),
    );
    telemetria.erroGlobal(new Error("cedo"), { origem: "window.error" });
    await promessa;
    expect(sentry.erro).toHaveBeenCalledOnce();
    expect(otel.erro).toHaveBeenCalledOnce();
    telemetria.erroGlobal(new Error("tarde"));
    expect(sentry.erro).toHaveBeenCalledOnce();
    expect(otel.erro).toHaveBeenCalledTimes(2);
  });

  it("captura erros e rejeições da janela e permite desligar", async () => {
    const otel = falso("otel", false);
    await telemetria.iniciarTelemetria(
      lerConfiguracao({ VITE_OTEL_EXPORTER_URL: "u" }, "t", "v"),
      carregadores({ otel }),
    );
    const alvo = new EventTarget() as unknown as Window;
    const desligar = telemetria.instalarCapturaGlobal(alvo);

    const erro = new Error("boom");
    alvo.dispatchEvent(Object.assign(new Event("error"), { error: erro, message: "boom" }));
    expect(otel.erro).toHaveBeenLastCalledWith(erro, { origem: "window.error" });

    alvo.dispatchEvent(Object.assign(new Event("error"), { message: "só mensagem" }));
    expect(otel.erro).toHaveBeenLastCalledWith("só mensagem", { origem: "window.error" });

    alvo.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "motivo" }));
    expect(otel.erro).toHaveBeenLastCalledWith("motivo", { origem: "unhandledrejection" });
    expect(otel.erro).toHaveBeenCalledTimes(3);

    desligar();
    alvo.dispatchEvent(Object.assign(new Event("error"), { error: erro }));
    alvo.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "x" }));
    expect(otel.erro).toHaveBeenCalledTimes(3);
  });

  it("reiniciar limpa fornecedores e fila", async () => {
    const p = falso("sentry", true);
    await telemetria.iniciarTelemetria(
      lerConfiguracao({ VITE_SENTRY_DSN: "d" }, "t", "v"),
      carregadores({ sentry: p }),
    );
    expect(telemetria.provedoresAtivos()).toEqual(["sentry"]);
    telemetria.reiniciarTelemetria();
    expect(telemetria.provedoresAtivos()).toEqual([]);
    telemetria.evento("depois");
    expect(p.evento).not.toHaveBeenCalled();
  });
});
