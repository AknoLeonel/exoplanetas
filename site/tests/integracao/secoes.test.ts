import { afterEach, describe, expect, it, vi } from "vitest";
import { acompanhar } from "../../src/data/acompanhar";
import { montarBarraGlobal } from "../../src/ui/barra-global";
import { criarBarras } from "../../src/ui/barras";
import { montarDescobertas } from "../../src/ui/descobertas";
import { h } from "../../src/ui/dom";
import { quandoVisivel } from "../../src/ui/lazy";
import { montarModelo } from "../../src/ui/modelo";
import { dataDaColeta, erroDoMelhorEDaReferencia, montarResumo } from "../../src/ui/resumo";
import { montarTerra } from "../../src/ui/terra";
import { criarTooltip } from "../../src/ui/tooltip";
import { descobertasDeTeste, esperar, metricasDeTeste } from "./fixtures";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("resumo", () => {
  it("mostra quatro cartões com os números de metricas.json", () => {
    const r = montarResumo(metricasDeTeste);
    const textos = [...r.querySelectorAll(".cartao")].map((c) => c.textContent);
    expect(textos).toHaveLength(4);
    expect(textos[0]).toContain("6.445");
    expect(textos[0]).toContain("em 4.842 estrelas");
    expect(textos[1]).toContain("1992–2026");
    expect(textos[2]).toContain("2016");
    expect(textos[2]).toContain("1.504 planetas, 1.276 pelo Kepler");
    expect(textos[3]).toContain("18,6%");
    expect(textos[3]).toContain("contra 60,7%");
  });

  it("a referência é a 'Mediana', não o pior modelo", () => {
    const m = structuredClone(metricasDeTeste);
    m.modelo.resultados = {
      "Mediana (referência)": { erro_percentual_mediano: 40, r2_log: 0, dentro_de_20pct: 1 },
      "Modelo ruim": { erro_percentual_mediano: 90, r2_log: -1, dentro_de_20pct: 0 },
      "Modelo bom": { erro_percentual_mediano: 10, r2_log: 0.9, dentro_de_20pct: 80 },
    };
    expect(erroDoMelhorEDaReferencia(m)).toEqual({ melhor: 10, referencia: 40 });
    expect(montarResumo(m).textContent).toContain("contra 40,0% de chutar a mediana");
  });

  it("sem linha de base, a referência é o pior modelo", () => {
    expect(erroDoMelhorEDaReferencia(metricasDeTeste)).toEqual({ melhor: 18.6, referencia: 60.7 });
    const m = structuredClone(metricasDeTeste);
    m.modelo.resultados = {
      A: { erro_percentual_mediano: 5, r2_log: 0, dentro_de_20pct: 0 },
      B: { erro_percentual_mediano: 8, r2_log: 0, dentro_de_20pct: 0 },
    };
    expect(erroDoMelhorEDaReferencia(m)).toEqual({ melhor: 5, referencia: 8 });
  });

  it("formata a data da coleta em UTC", () => {
    expect(dataDaColeta("2026-10-14T21:25:43Z")).toBe("14/10/2026");
    expect(dataDaColeta("2026-10-14T23:59:59Z")).toBe("14/10/2026");
    expect(dataDaColeta(null)).toBeNull();
    expect(dataDaColeta("")).toBeNull();
    expect(dataDaColeta("não é data")).toBeNull();
  });
});

describe("descobertas por ano", () => {
  it("desenha um segmento por método e ano com valor, empilhados na ordem fixa", () => {
    const r = montarDescobertas(descobertasDeTeste);
    const segmentos = r.querySelectorAll(".segmento");
    // 4 anos × 5 métodos, menos os 3 zeros (Microlente 2013 e 2015, Imagem 2014).
    expect(segmentos).toHaveLength(17);
    const primeiro = segmentos[0] as SVGElement;
    expect(primeiro.getAttribute("style")).toContain("var(--metodo-transit)");
  });

  it("tem legenda com todos os métodos, alvo de hover por ano e rótulo do pico", () => {
    const r = montarDescobertas(descobertasDeTeste);
    expect([...r.querySelectorAll(".legenda li")].map((l) => l.textContent)).toEqual([
      "Trânsito",
      "Velocidade radial",
      "Microlente",
      "Imagem direta",
      "Outros",
    ]);
    expect(r.querySelectorAll(".coluna-alvo")).toHaveLength(4);
    expect(r.querySelector("svg")?.textContent).toContain("2016: 1.474");
    expect(r.querySelector("svg")?.getAttribute("aria-label")).toContain("de 2013 a 2016");
    expect(r.querySelector("svg")?.getAttribute("data-visivel")).toBe("false");
  });

  it("o gráfico é um grupo (não uma imagem), para os alvos focáveis de cada ano serem lidos", () => {
    expect(montarDescobertas(descobertasDeTeste).querySelector("svg")?.getAttribute("role")).toBe("group");
  });

  it("os alvos são focáveis e anunciam o total do ano", () => {
    const r = montarDescobertas(descobertasDeTeste);
    const alvo = r.querySelector(".coluna-alvo") as SVGElement;
    expect(alvo.getAttribute("tabindex")).toBe("0");
    expect(alvo.getAttribute("aria-label")).toBe("2013: 163 planetas");
  });

  it("hover e foco mostram o tooltip com o total e cada método; sair esconde", () => {
    const r = montarDescobertas(descobertasDeTeste);
    document.body.append(r);
    const alvos = r.querySelectorAll<SVGElement>(".coluna-alvo");
    const tooltip = r.querySelector<HTMLElement>(".tooltip") as HTMLElement;
    alvos[1]?.dispatchEvent(new MouseEvent("pointermove", { clientX: 100, clientY: 50 }));
    expect(tooltip.dataset.visivel).toBe("true");
    expect(tooltip.querySelector("strong")?.textContent).toBe("2014: 856");
    expect(tooltip.textContent).toContain("Trânsito");
    expect(tooltip.textContent).toContain("810");
    expect(tooltip.textContent).not.toContain("Imagem direta"); // zero em 2014
    alvos[1]?.dispatchEvent(new MouseEvent("pointerleave"));
    expect(tooltip.dataset.visivel).toBe("false");
    alvos[3]?.dispatchEvent(new FocusEvent("focus"));
    expect(tooltip.querySelector("strong")?.textContent).toBe("2016: 1.474");
    alvos[3]?.dispatchEvent(new FocusEvent("blur"));
    expect(tooltip.dataset.visivel).toBe("false");
  });

  it("oferece os mesmos números em tabela", () => {
    const r = montarDescobertas(descobertasDeTeste);
    expect(r.querySelector("details summary")?.textContent).toBe("Ver os números em tabela");
    const linhas = r.querySelectorAll("details tbody tr");
    expect(linhas).toHaveLength(4);
    expect([...(linhas[3]?.querySelectorAll("td") ?? [])].map((c) => c.textContent)).toEqual([
      "2016",
      "1.432",
      "30",
      "10",
      "1",
      "1",
      "1.474",
    ]);
  });

  it("ignora métodos que não existem nos dados", () => {
    const r = montarDescobertas({ anos: [2000, 2001], metodos: { Transit: [1, 2] }, nomes: { Transit: "Trânsito" } });
    expect(r.querySelectorAll(".legenda li")).toHaveLength(1);
    expect(r.querySelectorAll(".segmento")).toHaveLength(2);
  });
});

describe("barras", () => {
  it("cria uma linha por item com a fração em --v e começa escondida", () => {
    const lista = criarBarras([
      { rotulo: "A", valor: "10%", fracao: 1, detalhe: "mais", cor: "red" },
      { rotulo: "B", valor: "5%", fracao: 0.5 },
    ]);
    expect(lista.getAttribute("data-visivel")).toBe("false");
    const barras = lista.querySelectorAll<HTMLElement>(".preenchimento");
    expect(barras[0]?.getAttribute("style")).toBe("--v: 1; --cor: red");
    expect(barras[1]?.getAttribute("style")).toBe("--v: 0.5");
    expect(lista.querySelectorAll(".sub")).toHaveLength(1);
    expect(lista.querySelector("li")?.textContent).toContain("A10%mais");
  });

  it("limita a fração a 0–1", () => {
    const barras = criarBarras([
      { rotulo: "a", valor: "", fracao: 7 },
      { rotulo: "b", valor: "", fracao: -3 },
    ]).querySelectorAll(".preenchimento");
    expect(barras[0]?.getAttribute("style")).toBe("--v: 1");
    expect(barras[1]?.getAttribute("style")).toBe("--v: 0");
  });
});

describe("modelo", () => {
  it("compara os modelos e destaca só o melhor", () => {
    const r = montarModelo(metricasDeTeste);
    const [erros] = r.querySelectorAll(".barras");
    const itens = [...(erros?.querySelectorAll("li") ?? [])];
    expect(itens).toHaveLength(3);
    expect(itens[0]?.textContent).toContain("60,7%");
    expect(itens[2]?.textContent).toContain("18,6%");
    expect(itens[2]?.textContent).toContain("R² 0,79 · 53% dos planetas com erro de até 20%");
    const cores = [...(erros?.querySelectorAll(".preenchimento") ?? [])].map((b) => b.getAttribute("style"));
    expect(cores[2]).toContain("var(--destaque)");
    expect(cores[0]).toContain("var(--metodo-outros)");
    expect(cores[1]).toContain("var(--metodo-outros)");
    expect(cores[0]).toContain("--v: 1;");
    expect(r.textContent).toContain("GroupKFold (5 dobras) agrupado por estrela hospedeira.");
  });

  it("lista as variáveis por importância, com nomes legíveis, e não deixa valor negativo virar barra negativa", () => {
    const r = montarModelo(metricasDeTeste);
    const pesos = r.querySelectorAll(".barras")[1] as HTMLElement;
    const itens = [...pesos.querySelectorAll("li")];
    expect(itens.map((i) => i.querySelector("span")?.textContent)).toEqual([
      "Massa do planeta",
      "Massa da estrela",
      "Metalicidade da estrela",
    ]);
    expect(itens[0]?.textContent).toContain("0,272");
    expect(itens[2]?.querySelector(".preenchimento")?.getAttribute("style")).toContain("--v: 0");
  });
});

describe("parecidos com a Terra", () => {
  it("mostra um cartão por planeta com raio, luz, temperatura e distância", () => {
    const r = montarTerra(metricasDeTeste);
    const itens = r.querySelectorAll("li");
    expect(itens).toHaveLength(2);
    expect(itens[0]?.querySelector("strong")?.textContent).toBe("Gliese 12 b");
    expect(itens[0]?.textContent).toContain("0,93× a Terra");
    expect(itens[0]?.textContent).toContain("1,62× a da Terra");
    expect(itens[0]?.textContent).toContain("315 K (42 °C)");
    expect(itens[0]?.textContent).toContain("40 anos-luz");
  });

  it("temperatura ausente aparece como traço, não como 0 K", () => {
    const m = structuredClone(metricasDeTeste);
    const [primeiro] = m.parecidos_com_a_terra_mais_proximos;
    if (primeiro) primeiro.pl_eqt = null;
    const texto = montarTerra(m).querySelector("li")?.textContent ?? "";
    expect(texto).toContain("Temperatura estimada—");
    expect(texto).not.toContain("0 K");
  });
});

describe("tooltip", () => {
  it("nasce escondido, mostra com conteúdo e posição e esconde", () => {
    const area = h("div");
    document.body.append(area);
    Object.defineProperty(area, "clientWidth", { value: 500 });
    Object.defineProperty(area, "clientHeight", { value: 300 });
    const t = criarTooltip(area);
    expect(t.elemento.dataset.visivel).toBe("false");
    t.mostrar(h("p", {}, "oi"), 100, 50);
    expect(t.elemento.dataset.visivel).toBe("true");
    expect(t.elemento.textContent).toBe("oi");
    expect(t.elemento.style.transform).toBe("translate(116px, 66px)");
    t.esconder();
    expect(t.elemento.dataset.visivel).toBe("false");
  });

  it("nunca sai pela esquerda ou pelo topo do contêiner", () => {
    const area = h("div");
    document.body.append(area);
    Object.defineProperty(area, "clientWidth", { value: 100 });
    Object.defineProperty(area, "clientHeight", { value: 100 });
    const t = criarTooltip(area);
    const corpo = t.elemento.querySelector<HTMLElement>(".tooltip-corpo") as HTMLElement;
    Object.defineProperty(corpo, "offsetWidth", { value: 300 });
    Object.defineProperty(corpo, "offsetHeight", { value: 300 });
    t.mostrar(h("p"), 10, 10);
    expect(t.elemento.style.transform).toBe("translate(0px, 0px)");
  });

  it("vira para a esquerda/cima e define a origem da animação a partir do cursor", () => {
    const area = h("div");
    document.body.append(area);
    Object.defineProperty(area, "clientWidth", { value: 500 });
    Object.defineProperty(area, "clientHeight", { value: 300 });
    const t = criarTooltip(area);
    const corpo = t.elemento.querySelector<HTMLElement>(".tooltip-corpo") as HTMLElement;
    Object.defineProperty(corpo, "offsetWidth", { value: 100 });
    Object.defineProperty(corpo, "offsetHeight", { value: 80 });
    t.mostrar(h("p"), 450, 250);
    expect(t.elemento.style.transform).toBe("translate(334px, 154px)");
    expect(corpo.style.getPropertyValue("--origem")).toBe("right bottom");
    t.mostrar(h("p"), 100, 50);
    expect(corpo.style.getPropertyValue("--origem")).toBe("left top");
  });
});

describe("quandoVisivel (lazy loading)", () => {
  it("sem IntersectionObserver carrega na hora", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const carregar = vi.fn();
    quandoVisivel(document.body, carregar);
    expect(carregar).toHaveBeenCalledOnce();
  });

  it("só carrega quando entra perto da tela, uma única vez, e desconecta", () => {
    let callback: (e: { isIntersecting: boolean }[]) => void = () => {};
    const disconnect = vi.fn();
    const observe = vi.fn();
    let opcoes: IntersectionObserverInit | undefined;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: typeof callback, o?: IntersectionObserverInit) {
          callback = cb;
          opcoes = o;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const el = document.createElement("div");
    const carregar = vi.fn();
    quandoVisivel(el, carregar, "100px");
    expect(opcoes?.rootMargin).toBe("100px");
    expect(observe).toHaveBeenCalledWith(el);
    callback([{ isIntersecting: false }]);
    expect(carregar).not.toHaveBeenCalled();
    callback([{ isIntersecting: false }, { isIntersecting: true }]);
    expect(carregar).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalled();
  });

  it("a margem padrão antecipa a carga", () => {
    let opcoes: IntersectionObserverInit | undefined;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(_cb: unknown, o?: IntersectionObserverInit) {
          opcoes = o;
        }
        observe() {}
        disconnect() {}
      },
    );
    quandoVisivel(document.body, () => {});
    expect(opcoes?.rootMargin).toBe("320px");
  });

  it("a função devolvida cancela a observação", () => {
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect = disconnect;
      },
    );
    quandoVisivel(document.body, () => {})();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});

describe("barra de progresso global", () => {
  function barra() {
    const b = h("div", { "data-estado": "oculto" }, h("span"));
    document.body.append(b);
    return b;
  }

  it("fica ativa enquanto há tarefas, preenche pela fração e some ao terminar", async () => {
    const b = barra();
    const parar = montarBarraGlobal(b);
    const span = b.querySelector("span") as HTMLElement;
    let liberarA: () => void = () => {};
    let liberarB: () => void = () => {};
    const a = acompanhar(new Promise<void>((r) => (liberarA = r)));
    const c = acompanhar(new Promise<void>((r) => (liberarB = r)));
    expect(b.dataset.estado).toBe("ativo");
    expect(span.style.transform).toBe("scaleX(0.08)"); // mínimo visível
    liberarA();
    await a;
    expect(span.style.transform).toBe("scaleX(0.5)");
    expect(b.dataset.estado).toBe("ativo");
    liberarB();
    await c;
    expect(span.style.transform).toBe("scaleX(1)");
    await esperar(150);
    expect(b.dataset.estado).toBe("oculto");
    await esperar(150);
    expect(span.style.transform).toBe("scaleX(0)");
    parar();
  });

  it("uma tarefa nova durante o fechamento cancela o sumiço", async () => {
    const b = barra();
    const parar = montarBarraGlobal(b);
    await acompanhar(Promise.resolve());
    let liberar: () => void = () => {};
    const nova = acompanhar(new Promise<void>((r) => (liberar = r)));
    await esperar(150);
    expect(b.dataset.estado).toBe("ativo");
    liberar();
    await nova;
    parar();
  });

  it("sem o span interno não quebra, e parar desliga a escuta", async () => {
    const b = h("div", { "data-estado": "oculto" });
    document.body.append(b);
    const parar = montarBarraGlobal(b);
    await acompanhar(Promise.resolve());
    expect(b.dataset.estado).toBe("oculto");
    parar();
    const antes = b.dataset.estado;
    await acompanhar(Promise.resolve());
    expect(b.dataset.estado).toBe(antes);
  });
});
