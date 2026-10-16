// O modelo real é lido do arquivo do pipeline: o teste confere a interface com o modelo de verdade.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lerEntradaML, lerML, lerModelo, lerPlanetasDoTreino, PADRAO_ML } from "../../src/lib/modelo-raio";
import type { Modo } from "../../src/lib/modulos";
import { formatarValorML, montar, montarML, previsaoParaCsv } from "../../src/ui/ml";
import { criarGraficoML } from "../../src/ui/ml-desenho";
import { ROTEIRO_ML, textoDoFator } from "../../src/ui/ml-roteiro";
import { contextoFalso, criarSecao, esperarAte } from "./fixtures";

// No happy-dom, import.meta.url não é um caminho de arquivo: o caminho sai da pasta do site (a raiz do Vitest).
const ler = (arquivo: string) => JSON.parse(readFileSync(`public/dados/${arquivo}`, "utf-8"));
const modelo = lerModelo(ler("modelo-raio.json"));
const planetas = lerPlanetasDoTreino(ler("modelo-planetas.json"));

function abrir(modo: Modo, parametros: Record<string, string> = {}) {
  const definirParametros = vi.fn();
  const baixar = vi.fn();
  const raiz = montarML({ modo, parametros, definirParametros }, { modelo, planetas }, { baixar });
  document.body.replaceChildren(raiz);
  return { raiz, definirParametros, baixar };
}

function cartao(raiz: HTMLElement, rotulo: string): { valor: string; detalhe: string } {
  const alvo = Array.from(raiz.querySelectorAll(".cartao")).find((c) => c.textContent?.includes(rotulo));
  return {
    valor: alvo?.querySelector(".valor")?.textContent ?? "",
    detalhe: alvo?.querySelector(".detalhe")?.textContent ?? "",
  };
}

function mexer(raiz: HTMLElement, id: string, valor: number): void {
  const entrada = raiz.querySelector<HTMLInputElement>(`#${id}`);
  if (!entrada) throw new Error(`sem ${id}`);
  entrada.value = String(valor);
  entrada.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("ML, modo Explorar", () => {
  it("abre com a Terra: previsão, intervalo, tamanho, fatores e o aviso de borda no período", () => {
    const { raiz } = abrir("explorar");
    const l = lerML(modelo, PADRAO_ML);
    expect(raiz.querySelector("h1")?.textContent).toBe("Machine learning interativo");
    expect(cartao(raiz, "Raio previsto").valor).toMatch(/^\d+,\d+ × Terra$/);
    expect(cartao(raiz, "Intervalo de 80%").valor).toMatch(/ a /);
    expect(raiz.querySelectorAll(".fator")).toHaveLength(6);
    // Os fatores vêm do maior para o menor efeito.
    const efeitos = Array.from(raiz.querySelectorAll<HTMLElement>(".fator")).map((f) => f.dataset.variavel);
    expect(efeitos[0]).toBe("log_massa");
    expect(raiz.querySelector<HTMLElement>(".aviso-sim")?.dataset.nivel).toBe(
      Object.values(l.extrapolacao).includes("fora") ? "fora" : "borda",
    );
    expect(raiz.querySelectorAll(".contas dt")).toHaveLength(ROTEIRO_ML.length - 1);
  });

  it("mudar a massa recalcula, grava a URL e anuncia; fora do treino, avisa", async () => {
    const { raiz, definirParametros } = abrir("explorar");
    const antes = cartao(raiz, "Raio previsto").valor;
    mexer(raiz, "ml-mp", Math.log10(318));
    expect(cartao(raiz, "Raio previsto").valor).not.toBe(antes);
    await esperarAte(() => expect(definirParametros).toHaveBeenCalledWith(expect.objectContaining({ mp: "318" })));
    await esperarAte(() =>
      expect(raiz.querySelector("[data-anuncio]")?.textContent).toMatch(/^Massa do planeta: .*Raio previsto/),
    );
    mexer(raiz, "ml-mp", Math.log10(30_000));
    expect(raiz.querySelector<HTMLElement>(".aviso-sim")?.dataset.nivel).toBe("fora");
    expect(raiz.querySelector(".aviso-sim")?.textContent).toContain("não confie");
  });

  it("dentro dos dados, sem aviso", () => {
    // Um planeta do treino com todas as variáveis dentro dos percentis 1–99.
    const tipico = planetas.find((p) => {
      const l = lerML(modelo, { ...p, semente: 1 });
      return Object.values(l.extrapolacao).every((v) => v === "dentro");
    });
    if (!tipico) throw new Error("nenhum planeta típico no treino");
    const { raiz } = abrir("explorar", { planeta: tipico.nome });
    expect(raiz.querySelector<HTMLElement>(".aviso-sim")?.dataset.nivel).toBe("dentro");
    expect(raiz.querySelector(".aviso-sim")?.textContent).toBe("");
  });

  it("carregar um planeta do treino mostra o raio medido, o erro e os links para os simuladores", async () => {
    const { raiz, definirParametros } = abrir("explorar");
    const p = planetas.find((x) => x.nome === "Kepler-7 b") ?? planetas[0];
    if (!p) throw new Error("sem planetas");
    const campo = raiz.querySelector<HTMLInputElement>("#ml-planeta");
    if (!campo) throw new Error("sem campo");
    campo.value = p.nome;
    raiz.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true }));
    await esperarAte(() => expect(cartao(raiz, "Raio previsto").detalhe).toContain(`raio medido de ${p.nome}`));
    expect(raiz.querySelector(".busca-planeta .nota")?.textContent).toContain("fez parte do treino");
    const links = Array.from(raiz.querySelectorAll<HTMLAnchorElement>(".ligacoes-modulo a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(links[0]).toMatch(/^#\/transito\?planeta=/);
    expect(links[1]).toMatch(/^#\/velocidade-radial\?planeta=/);
    await esperarAte(() =>
      expect(definirParametros).toHaveBeenCalledWith(expect.objectContaining({ planeta: p.nome })),
    );
    // Mexer num controle tira o destaque: já não é mais o planeta.
    mexer(raiz, "ml-fe", 0.5);
    expect(cartao(raiz, "Raio previsto").detalhe).not.toContain("raio medido");
    expect(raiz.querySelector<HTMLElement>(".ligacoes-modulo")?.hidden).toBe(true);
  });

  it("link só com o planeta aplica os valores; com valores, só destaca", () => {
    const p = planetas[3];
    if (!p) throw new Error("sem planetas");
    const so = abrir("explorar", { planeta: p.nome });
    expect(so.raiz.querySelector<HTMLInputElement>("#ml-t")?.getAttribute("aria-valuetext")).toBe(
      formatarValorML("teffK", p.teffK),
    );
    const com = abrir("explorar", { planeta: p.nome, mp: "5" });
    expect(com.raiz.querySelector<HTMLInputElement>("#ml-mp")?.getAttribute("aria-valuetext")).toBe("5,00 × Terra");
    expect(cartao(com.raiz, "Raio previsto").detalhe).toContain("raio medido");
  });

  it("exporta CSV e volta à Terra", () => {
    const { raiz, baixar } = abrir("explorar", { mp: "100" });
    const botao = (t: string) => Array.from(raiz.querySelectorAll("button")).find((b) => b.textContent === t);
    botao("Exportar CSV")?.click();
    const [nome, csv] = baixar.mock.calls[0] as [string, string];
    expect(nome).toBe("previsao-de-raio-simulacao.csv");
    expect(csv).toContain("massaMterra,100\n");
    expect(csv).toContain("fator_log_massa,");
    botao("Voltar à Terra")?.click();
    expect(raiz.querySelector<HTMLInputElement>("#ml-mp")?.getAttribute("aria-valuetext")).toBe("1,00 × Terra");
  });
});

describe("ML, modo Aprender", () => {
  it("passo a passo, com os controles de cada passo, e a conta acompanha", async () => {
    const { raiz, definirParametros } = abrir("aprender");
    expect(raiz.querySelector(".roteiro h2")?.textContent).toBe(ROTEIRO_ML[0]?.titulo);
    expect(raiz.querySelector(".roteiro [data-conta]")?.textContent).toContain("A Terra real tem 1 × Terra");
    Array.from(raiz.querySelectorAll(".roteiro button"))
      .find((b) => b.textContent === "Próximo")
      ?.dispatchEvent(new Event("click"));
    const visiveis = Array.from(raiz.querySelectorAll<HTMLElement>(".controle-sim:not([hidden])"));
    expect(visiveis.map((v) => v.dataset.controle)).toEqual(["massaMterra"]);
    const conta = () => raiz.querySelector(".roteiro [data-conta]")?.textContent ?? "";
    const antes = conta();
    mexer(raiz, "ml-mp", 2);
    expect(conta()).not.toBe(antes);
    await esperarAte(() => expect(definirParametros).toHaveBeenCalledWith(expect.objectContaining({ passo: "2" })));
    expect(raiz.querySelector("#ml-planeta")).toBeNull();
  });

  it("todas as contas saem sem NaN, dentro e fora dos dados", () => {
    for (const p of [{}, { mp: "30000", p: "10000" }, { mp: "0.03", s: "100000", fe: "-1" }]) {
      const e = lerEntradaML(p);
      const l = lerML(modelo, e);
      for (const passo of ROTEIRO_ML) expect(passo.conta(e, l)).not.toMatch(/NaN|undefined|Infinity/);
    }
  });
});

describe("peças do ML", () => {
  it("o texto do fator mostra multiplicação ou divisão", () => {
    expect(textoDoFator(1)).toBe("×1,00");
    expect(textoDoFator(1.8)).toBe("×1,80");
    expect(textoDoFator(0.5)).toBe("÷2,00");
  });

  it("formata os valores dos controles com as unidades", () => {
    expect(formatarValorML("teffK", 5772)).toBe("5.772 K");
    expect(formatarValorML("metalicidade", 0.12)).toBe("+0,12 dex");
    expect(formatarValorML("metalicidade", -0.3)).toBe("-0,30 dex");
    expect(formatarValorML("massaEstrelaMsol", 1)).toBe("1,00 × Sol");
    expect(formatarValorML("periodoDias", 365.25)).toBe("365 dias");
  });

  it("o CSV tem uma linha por grandeza", () => {
    const csv = previsaoParaCsv(PADRAO_ML, lerML(modelo, PADRAO_ML));
    const linhas = csv.trim().split("\n");
    expect(linhas[0]).toBe("grandeza,valor");
    expect(linhas).toHaveLength(1 + 6 + 4 + 6);
  });
});

describe("gráfico e carga do módulo", () => {
  let falso: ReturnType<typeof contextoFalso>;
  beforeEach(() => {
    falso = contextoFalso();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(falso.contexto as CanvasRenderingContext2D);
  });

  it("desenha os planetas do treino, o planeta destacado e a previsão com o intervalo", async () => {
    const tela = criarGraficoML(() => ({
      planetas: planetas.slice(0, 30),
      previsao: { massa: 10, raio: 3, inferior: 2, superior: 4.5 },
      destaque: planetas[0] ?? null,
      extrapolando: false,
    }));
    document.body.append(tela.elemento);
    // 30 planetas + o círculo do destacado + o ponto da previsão.
    await esperarAte(() => expect(falso.de("arc")).toHaveLength(32));
    const textos = falso.de("fillText").map((c) => c.args[0]);
    expect(textos).toContain("Massa (Terra = 1)");
    expect(textos).toContain("Raio (Terra = 1)");
    tela.destruir();
  });

  it("montar mostra o módulo depois de baixar o modelo e os planetas", async () => {
    const respostas: Record<string, unknown> = {
      "/dados/modelo-raio.json": ler("modelo-raio.json"),
      "/dados/modelo-planetas.json": ler("modelo-planetas.json"),
    };
    vi.stubGlobal("fetch", (url: string) => Promise.resolve(new Response(JSON.stringify(respostas[url]))));
    const host = criarSecao();
    await montar({ host, modo: "explorar", parametros: {}, definirParametros: vi.fn() });
    await esperarAte(() => expect(host.querySelector(".ml h1")?.textContent).toBe("Machine learning interativo"));
    vi.unstubAllGlobals();
  });
});
