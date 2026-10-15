import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EstadoDoProgresso } from "../../src/data/acompanhar";

const PLANETAS = {
  colunas: ["nome", "ano", "periodo", "raio", "massa", "temperatura", "distancia", "medido"],
  linhas: [["A b", 2010, 3, 1.5, null, null, null, true]],
};

function resposta(corpo: unknown, init: ResponseInit = {}): Response {
  return new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status: 200, ...init });
}

function fluxo(pedacos: string[], headers: Record<string, string> = {}): Response {
  const enc = new TextEncoder();
  const corpo = new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of pedacos) c.enqueue(enc.encode(p));
      c.close();
    },
  });
  return new Response(corpo, { status: 200, headers });
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// `vi.resetModules()` cria instâncias novas dos módulos; por isso tudo vem do mesmo `import()` dinâmico.
async function carregador() {
  const carregar = await import("../../src/data/carregar");
  const { ErroDados } = await import("../../src/lib/tipos");
  const telemetria = await import("../../src/telemetry");
  return { ...carregar, ErroDados, telemetria };
}

describe("baixarJson", () => {
  it("devolve o JSON da resposta", async () => {
    const { baixarJson } = await carregador();
    expect(await baixarJson("/x.json", { buscar: async () => resposta({ a: 1 }) })).toEqual({ a: 1 });
  });

  it("erro HTTP vira ErroDados com o status", async () => {
    const { baixarJson, ErroDados } = await carregador();
    const p = baixarJson("/x.json", { buscar: async () => resposta("não achei", { status: 404 }) });
    await expect(p).rejects.toThrow(ErroDados);
    await expect(p).rejects.toThrow("HTTP 404");
  });

  it("falha de rede vira ErroDados", async () => {
    const { baixarJson } = await carregador();
    const p = baixarJson("/x.json", {
      buscar: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    await expect(p).rejects.toThrow(/sem conexão.*Failed to fetch/);
  });

  it("falha de rede que não é Error também vira ErroDados", async () => {
    const { baixarJson } = await carregador();
    await expect(
      baixarJson("/x.json", {
        buscar: async () => {
          throw "queda";
        },
      }),
    ).rejects.toThrow(/sem conexão.*queda/);
  });

  it("JSON inválido vira ErroDados", async () => {
    const { baixarJson } = await carregador();
    await expect(baixarJson("/x.json", { buscar: async () => resposta("{quebrado") })).rejects.toThrow("JSON inválido");
  });

  it("informa o progresso quando o tamanho é conhecido", async () => {
    const { baixarJson } = await carregador();
    const json = JSON.stringify({ a: "x".repeat(20) });
    const partes = [json.slice(0, 10), json.slice(10, 20), json.slice(20)];
    const visto: (number | null)[] = [];
    const r = await baixarJson("/x.json", {
      buscar: async () => fluxo(partes, { "content-length": String(json.length) }),
      aoProgredir: (f) => visto.push(f),
    });
    expect(r).toEqual({ a: "x".repeat(20) });
    expect(visto[0]).toBe(0);
    expect(visto.at(-1)).toBe(1);
    expect(visto).toEqual([...visto].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it("sem content-length, ou com corpo comprimido, o progresso é indeterminado (null)", async () => {
    const { baixarJson } = await carregador();
    const semTamanho: (number | null)[] = [];
    await baixarJson("/x.json", { buscar: async () => fluxo(['{"a"', ":1}"]), aoProgredir: (f) => semTamanho.push(f) });
    expect(semTamanho.every((f) => f === null)).toBe(true);
    expect(semTamanho.length).toBeGreaterThan(1);

    const comprimido: (number | null)[] = [];
    await baixarJson("/x.json", {
      buscar: async () => fluxo(['{"a":1}'], { "content-length": "7", "content-encoding": "br" }),
      aoProgredir: (f) => comprimido.push(f),
    });
    expect(comprimido.every((f) => f === null)).toBe(true);
  });

  it("o progresso nunca passa de 1, mesmo com content-length menor que o corpo", async () => {
    const { baixarJson } = await carregador();
    const visto: (number | null)[] = [];
    await baixarJson("/x.json", {
      buscar: async () => fluxo(['{"a":1}'], { "content-length": "2" }),
      aoProgredir: (f) => visto.push(f),
    });
    expect(Math.max(...(visto as number[]))).toBe(1);
  });

  it("registra o tempo da carga na telemetria", async () => {
    const { baixarJson, telemetria } = await carregador();
    const espiao = vi.spyOn(telemetria, "tempo");
    await baixarJson("/x.json", { buscar: async () => resposta({ a: 1 }) });
    expect(espiao).toHaveBeenCalledWith("carga-de-dados", expect.any(Number), { arquivo: "/x.json", bytes: 7 });
  });
});

describe("cargas memorizadas", () => {
  it("baixa uma vez só e compartilha o resultado", async () => {
    const buscar = vi.fn(async () => resposta(PLANETAS));
    const { carregarPlanetas } = await carregador();
    const [a, b] = await Promise.all([carregarPlanetas({ buscar }), carregarPlanetas({ buscar })]);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(a[0]?.nome).toBe("A b");
    await carregarPlanetas({ buscar });
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("depois de uma falha, a próxima chamada tenta de novo", async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(resposta("x", { status: 500 }))
      .mockResolvedValueOnce(resposta(PLANETAS));
    const { carregarPlanetas } = await carregador();
    await expect(carregarPlanetas({ buscar })).rejects.toThrow("HTTP 500");
    await expect(carregarPlanetas({ buscar })).resolves.toHaveLength(1);
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("dados fora do formato também derrubam a memória", async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(resposta({ ruim: true }))
      .mockResolvedValueOnce(resposta(PLANETAS));
    const { carregarPlanetas, ErroDados } = await carregador();
    await expect(carregarPlanetas({ buscar })).rejects.toThrow(ErroDados);
    await expect(carregarPlanetas({ buscar })).resolves.toHaveLength(1);
  });

  it("descobertas e métricas usam os próprios arquivos", async () => {
    const urls: string[] = [];
    const buscar = async (u: string) => {
      urls.push(u);
      return resposta(
        u.includes("descobertas")
          ? { anos: [2000], metodos: { Transit: [1] }, nomes: { Transit: "Trânsito" } }
          : {
              dados: {},
              descobertas: {},
              deserto_netunos_quentes: {},
              parecidos_com_a_terra_mais_proximos: [],
              modelo: { resultados: { a: {} }, importancia_permutacao: {} },
            },
      );
    };
    const { carregarDescobertas, carregarMetricas } = await carregador();
    await carregarDescobertas({ buscar });
    await carregarMetricas({ buscar });
    expect(urls).toEqual(["/dados/descobertas.json", "/dados/metricas.json"]);
  });
});

describe("acompanhar", () => {
  it("avisa o progresso global ao começar e ao terminar, e termina em 100%", async () => {
    const { acompanhar } = await import("../../src/data/acompanhar");
    const { aoMudarProgresso: ouvir } = await import("../../src/data/acompanhar");
    const eventos: EstadoDoProgresso[] = [];
    const parar = ouvir((e) => eventos.push(e));
    let liberar: (v: number) => void = () => {};
    const tarefa = acompanhar(new Promise<number>((r) => (liberar = r)));
    expect(eventos.at(-1)).toEqual({ fracao: 0, pendentes: 1 });
    liberar(7);
    expect(await tarefa).toBe(7);
    expect(eventos.at(-1)).toEqual({ fracao: 1, pendentes: 0 });
    parar();
  });

  it("conta tarefas que falham como concluídas e repassa o erro", async () => {
    const { acompanhar, aoMudarProgresso: ouvir } = await import("../../src/data/acompanhar");
    const eventos: EstadoDoProgresso[] = [];
    ouvir((e) => eventos.push(e));
    await expect(acompanhar(Promise.reject(new Error("falhou")))).rejects.toThrow("falhou");
    expect(eventos.at(-1)).toEqual({ fracao: 1, pendentes: 0 });
  });

  it("com duas tarefas, a fração intermediária é 0,5", async () => {
    const { acompanhar, aoMudarProgresso: ouvir } = await import("../../src/data/acompanhar");
    const eventos: EstadoDoProgresso[] = [];
    ouvir((e) => eventos.push(e));
    let liberarA: () => void = () => {};
    let liberarB: () => void = () => {};
    const a = acompanhar(new Promise<void>((r) => (liberarA = r)));
    const b = acompanhar(new Promise<void>((r) => (liberarB = r)));
    liberarA();
    await a;
    expect(eventos.at(-1)).toEqual({ fracao: 0.5, pendentes: 1 });
    liberarB();
    await b;
    expect(eventos.at(-1)).toEqual({ fracao: 1, pendentes: 0 });
  });

  it("quem para de ouvir deixa de ser avisado", async () => {
    const { acompanhar, aoMudarProgresso: ouvir } = await import("../../src/data/acompanhar");
    const ouvinte = vi.fn();
    const parar = ouvir(ouvinte);
    parar();
    await acompanhar(Promise.resolve());
    expect(ouvinte).not.toHaveBeenCalled();
  });
});
