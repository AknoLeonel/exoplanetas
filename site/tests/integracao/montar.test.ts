import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarSecao, descobertasDeTeste, esperarAte, metricasDeTeste, planetasDeTeste } from "./fixtures";

const COLUNAS = ["nome", "ano", "periodo", "raio", "massa", "temperatura", "distancia", "medido"];

function planetasJson() {
  return {
    colunas: COLUNAS,
    linhas: planetasDeTeste(30).map((p) => [
      p.nome,
      p.ano,
      p.periodo,
      p.raio,
      p.massa,
      p.temperatura,
      p.distancia,
      p.medido,
    ]),
  };
}

function servir(rotas: Record<string, unknown>) {
  const chamadas: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      chamadas.push(url);
      if (!(url in rotas)) return new Response("não achei", { status: 404 });
      return new Response(JSON.stringify(rotas[url]), { status: 200 });
    }),
  );
  return chamadas;
}

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("montar cada seção (dados reais do pipeline pela rede, DOM de verdade)", () => {
  it("resumo: carrega métricas, mostra os cartões e preenche a data da coleta no rodapé", async () => {
    servir({ "/dados/metricas.json": metricasDeTeste });
    const coleta = document.createElement("span");
    coleta.id = "coleta";
    document.body.append(coleta);
    const host = criarSecao();
    const { montar } = await import("../../src/ui/resumo");
    await montar(host);
    expect(host.querySelectorAll(".cartao")).toHaveLength(4);
    expect(coleta.textContent).toBe("Coleta de 14/10/2026.");
    expect(host.querySelector("[data-skeleton]")).toBeNull();
  });

  it("resumo: sem data de coleta o rodapé não muda, e sem rodapé não quebra", async () => {
    servir({ "/dados/metricas.json": { ...metricasDeTeste, dados: { ...metricasDeTeste.dados, coletado_em: null } } });
    const coleta = document.createElement("span");
    coleta.id = "coleta";
    document.body.append(coleta);
    const { montar } = await import("../../src/ui/resumo");
    await montar(criarSecao());
    expect(coleta.textContent).toBe("");
    coleta.remove();
    vi.resetModules();
    servir({ "/dados/metricas.json": metricasDeTeste });
    const { montar: montar2 } = await import("../../src/ui/resumo");
    await expect(montar2(criarSecao())).resolves.toBeUndefined();
  });

  it("explorador: carrega planetas.json e monta filtros, gráfico e tabela", async () => {
    const chamadas = servir({ "/dados/planetas.json": planetasJson() });
    const host = criarSecao();
    const { montar } = await import("../../src/ui/explorador");
    await montar(host);
    expect(chamadas).toEqual(["/dados/planetas.json"]);
    expect(host.querySelector("canvas")).not.toBeNull();
    expect(host.querySelectorAll("tbody tr")).toHaveLength(20);
    expect(host.querySelector(".resumo-grafico")?.textContent).toBe("Mostrando 30 de 30 planetas com raio medido.");
  });

  it("descobertas: monta o gráfico e dispara a animação das barras ao chegar na tela", async () => {
    servir({ "/dados/descobertas.json": descobertasDeTeste });
    let callback: (e: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: typeof callback) {
          callback = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    const host = criarSecao();
    const { montar } = await import("../../src/ui/descobertas");
    await montar(host);
    const svg = host.querySelector("svg.grafico-barras") as SVGElement;
    expect(svg.getAttribute("data-visivel")).toBe("false");
    callback([{ isIntersecting: true }]);
    expect(svg.getAttribute("data-visivel")).toBe("true");
  });

  it("modelo: barras só crescem quando entram na tela", async () => {
    servir({ "/dados/metricas.json": metricasDeTeste });
    const callbacks: ((e: { isIntersecting: boolean }[]) => void)[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (typeof callbacks)[number]) {
          callbacks.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    const host = criarSecao();
    const { montar } = await import("../../src/ui/modelo");
    await montar(host);
    const listas = host.querySelectorAll(".barras");
    expect(listas).toHaveLength(2);
    expect([...listas].every((l) => l.getAttribute("data-visivel") === "false")).toBe(true);
    callbacks[0]?.([{ isIntersecting: true }]);
    expect(listas[0]?.getAttribute("data-visivel")).toBe("true");
    expect(listas[1]?.getAttribute("data-visivel")).toBe("false");
  });

  it("terra: lista os planetas parecidos com a Terra", async () => {
    servir({ "/dados/metricas.json": metricasDeTeste });
    const host = criarSecao();
    const { montar } = await import("../../src/ui/terra");
    await montar(host);
    expect(host.querySelectorAll(".lista-terra li")).toHaveLength(2);
  });

  it("uma seção com arquivo faltando mostra o erro, e 'Tentar de novo' recupera quando o arquivo volta", async () => {
    servir({});
    const host = criarSecao();
    const { montar } = await import("../../src/ui/terra");
    await montar(host);
    expect(host.querySelector(".erro")?.textContent).toContain("HTTP 404");
    servir({ "/dados/metricas.json": metricasDeTeste });
    host.querySelector<HTMLButtonElement>(".erro button")?.click();
    await esperarAte(() => expect(host.querySelectorAll(".lista-terra li")).toHaveLength(2));
  });

  it("resumo, modelo e terra compartilham um único download de metricas.json", async () => {
    const chamadas = servir({ "/dados/metricas.json": metricasDeTeste });
    const { montar: a } = await import("../../src/ui/resumo");
    const { montar: b } = await import("../../src/ui/modelo");
    const { montar: c } = await import("../../src/ui/terra");
    await Promise.all([a(criarSecao()), b(criarSecao()), c(criarSecao())]);
    expect(chamadas).toEqual(["/dados/metricas.json"]);
  });
});
