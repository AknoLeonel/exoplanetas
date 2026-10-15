import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { escalaLog } from "../../src/lib/escala";
import type { Planeta } from "../../src/lib/tipos";
import { montarExplorador } from "../../src/ui/explorador";
import { DOMINIO_PERIODO, DOMINIO_RAIO } from "../../src/ui/grafico-periodo-raio";
import { esperar, esperarAte, planetasDeTeste } from "./fixtures";

const LARGURA = 800;
const ALTURA = 400;

type Contexto2d = Record<string, unknown> & { arc: ReturnType<typeof vi.fn>; fillText: ReturnType<typeof vi.fn> };
let contexto: Contexto2d;
/** Cada atribuição a uma propriedade do contexto 2D, na ordem (por exemplo, globalAlpha). */
let atribuicoes: [string, unknown][] = [];

beforeEach(() => {
  atribuicoes = [];
  // Canvas de mentira que só registra as chamadas.
  const chamadas: Record<string, ReturnType<typeof vi.fn>> = {};
  const valores: Record<string, unknown> = {};
  contexto = new Proxy(valores, {
    get(alvo, chave: string) {
      if (chave in alvo) return alvo[chave];
      chamadas[chave] ??= vi.fn();
      return chamadas[chave];
    },
    set(alvo, chave: string, valor) {
      atribuicoes.push([chave, valor]);
      alvo[chave] = valor;
      return true;
    },
  }) as Contexto2d;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(contexto as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: LARGURA,
    bottom: ALTURA,
    width: LARGURA,
    height: ALTURA,
    toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const planetas = planetasDeTeste(60);

function montar() {
  const raiz = montarExplorador(planetas);
  document.body.append(raiz);
  return raiz;
}

const linhas = (raiz: HTMLElement) => raiz.querySelectorAll("tbody tr:not(:has(.vazio))").length;
const resumo = (raiz: HTMLElement) => raiz.querySelector(".resumo-grafico")?.textContent;

describe("explorador", () => {
  it("começa com todos os planetas, fichas com contagem, filtro de ano e tabela de 20 linhas", () => {
    const raiz = montar();
    expect(resumo(raiz)).toBe("Mostrando 60 de 60 planetas com raio medido.");
    const fichas = raiz.querySelectorAll<HTMLButtonElement>(".ficha");
    expect(fichas).toHaveLength(5);
    expect([...fichas].every((f) => f.getAttribute("aria-pressed") === "true")).toBe(true);
    const total = [...raiz.querySelectorAll(".ficha .n")].reduce(
      (s, n) => s + Number((n.textContent ?? "0").replace(".", "")),
      0,
    );
    expect(total).toBe(60);
    expect(linhas(raiz)).toBe(20);
    expect(raiz.querySelector<HTMLInputElement>("#filtro-ano")?.value).toBe("2005");
    expect(raiz.querySelector("output")?.textContent).toBe("2005");
  });

  it("clicar numa ficha tira a classe do gráfico e da tabela, e clicar de novo traz de volta", async () => {
    const raiz = montar();
    const alvo = planetas[0]?.classe;
    const ficha =
      [...raiz.querySelectorAll<HTMLButtonElement>(".ficha")].find((f) =>
        f.textContent?.startsWith(alvo === "terra" ? "Terra" : ""),
      ) ?? (raiz.querySelector(".ficha") as HTMLButtonElement);
    const antes = Number((resumo(raiz) ?? "").match(/Mostrando (\d+)/)?.[1]);
    ficha.click();
    expect(ficha.getAttribute("aria-pressed")).toBe("false");
    expect(Number((resumo(raiz) ?? "").match(/Mostrando (\d+)/)?.[1])).toBeLessThan(antes);
    ficha.click();
    expect(ficha.getAttribute("aria-pressed")).toBe("true");
    expect(resumo(raiz)).toBe("Mostrando 60 de 60 planetas com raio medido.");
  });

  it("desligar todas as classes mostra o estado vazio na tabela", async () => {
    const raiz = montar();
    for (const f of raiz.querySelectorAll<HTMLButtonElement>(".ficha")) f.click();
    expect(resumo(raiz)).toBe("Mostrando 0 de 60 planetas com raio medido.");
    await esperarAte(() => expect(raiz.querySelector(".vazio")?.textContent).toBe("Nenhum planeta com esses filtros."));
    expect(raiz.querySelector<HTMLButtonElement>(".mais button")?.hidden).toBe(true);
  });

  it("as contagens das fichas ignoram a própria seleção de classes", () => {
    const raiz = montar();
    const antes = [...raiz.querySelectorAll(".ficha .n")].map((n) => n.textContent);
    raiz.querySelector<HTMLButtonElement>(".ficha")?.click();
    expect([...raiz.querySelectorAll(".ficha .n")].map((n) => n.textContent)).toEqual(antes);
  });

  it("o filtro de ano atualiza o valor mostrado e o recorte", () => {
    const raiz = montar();
    const ano = raiz.querySelector<HTMLInputElement>("#filtro-ano") as HTMLInputElement;
    ano.value = "2020";
    ano.dispatchEvent(new Event("input"));
    expect(raiz.querySelector("output")?.textContent).toBe("2020");
    const esperado = planetas.filter((p) => p.ano >= 2020).length;
    expect(resumo(raiz)).toBe(`Mostrando ${esperado} de 60 planetas com raio medido.`);
  });

  it("'só com massa medida' filtra", () => {
    const raiz = montar();
    const caixa = raiz.querySelector<HTMLInputElement>("#filtro-massa") as HTMLInputElement;
    caixa.checked = true;
    caixa.dispatchEvent(new Event("change"));
    expect(resumo(raiz)).toBe(
      `Mostrando ${planetas.filter((p) => p.massa !== null).length} de 60 planetas com raio medido.`,
    );
  });

  it("a busca filtra por nome sem animar a tabela (digitar é frequente)", async () => {
    const raiz = montar();
    const busca = raiz.querySelector<HTMLInputElement>("#filtro-busca") as HTMLInputElement;
    busca.value = "teste-12 ";
    busca.dispatchEvent(new Event("input"));
    // O gráfico continua com todos; a busca só destaca. A tabela é que filtra.
    expect(resumo(raiz)).toBe(
      "Mostrando 60 de 60 planetas com raio medido. A busca destaca 1 no gráfico e filtra a tabela.",
    );
    await esperar(5);
    expect(raiz.querySelector("tbody")?.dataset.anim).toBe("pronto");
    expect(linhas(raiz)).toBe(1);
    expect(raiz.querySelector("tbody td")?.textContent).toBe("Teste-12 b");
  });

  it("mudanças discretas (clique) animam a tabela: saindo e depois pronto", async () => {
    const raiz = montar();
    const caixa = raiz.querySelector<HTMLInputElement>("#filtro-massa") as HTMLInputElement;
    caixa.checked = true;
    caixa.dispatchEvent(new Event("change"));
    expect(raiz.querySelector("tbody")?.dataset.anim).toBe("saindo");
    await esperarAte(() => expect(raiz.querySelector("tbody")?.dataset.anim).toBe("pronto"));
  });
});

describe("tabela do explorador", () => {
  it("'Mostrar mais' acrescenta 20 linhas e some quando acabam", () => {
    const raiz = montar();
    const botao = raiz.querySelector<HTMLButtonElement>(".mais button") as HTMLButtonElement;
    expect(botao.hidden).toBe(false);
    botao.click();
    return vi
      .waitFor(() => expect(linhas(raiz)).toBe(40))
      .then(async () => {
        botao.click();
        await esperarAte(() => expect(linhas(raiz)).toBe(60));
        expect(botao.hidden).toBe(true);
      });
  });

  it("ordenar: clicar no cabeçalho ordena, clicar de novo inverte, e aria-sort acompanha", async () => {
    const raiz = montar();
    const th = (nome: string) =>
      [...raiz.querySelectorAll<HTMLElement>("th")].find((t) => t.textContent?.startsWith(nome)) as HTMLElement;
    expect(th("Ano").getAttribute("aria-sort")).toBe("descending");
    expect(th("Planeta").getAttribute("aria-sort")).toBe("none");
    th("Planeta").querySelector("button")?.click();
    await esperarAte(() => expect(th("Planeta").getAttribute("aria-sort")).toBe("ascending"));
    await esperarAte(() => expect(raiz.querySelector("tbody td")?.textContent).toBe("Teste-1 b"));
    expect(th("Ano").getAttribute("aria-sort")).toBe("none");
    th("Planeta").querySelector("button")?.click();
    await esperarAte(() => expect(th("Planeta").getAttribute("aria-sort")).toBe("descending"));
    await esperarAte(() => expect(raiz.querySelector("tbody td")?.textContent).toBe("Teste-60 b"));
    th("Raio (Terra = 1)").querySelector("button")?.click();
    await esperarAte(() => expect(th("Raio (Terra = 1)").getAttribute("aria-sort")).toBe("descending"));
    const maior = Math.max(...planetas.map((p) => p.raio));
    await esperarAte(() =>
      expect(raiz.querySelectorAll("tbody tr")[0]?.querySelectorAll("td")[3]?.textContent).toBe(
        maior >= 100 ? String(Math.round(maior)) : maior.toFixed(maior >= 10 ? 1 : 2).replace(".", ","),
      ),
    );
  });

  it("a legenda da tabela descreve a ordem e a contagem", () => {
    const raiz = montar();
    expect(raiz.querySelector("caption")?.textContent).toBe(
      "Planetas que passam nos filtros e na busca, ordenados por ano. Mostrando 20 de 60.",
    );
  });

  it("valores ausentes aparecem como traço", () => {
    const raiz = montar();
    const caixa = raiz.querySelector<HTMLInputElement>("#filtro-busca") as HTMLInputElement;
    caixa.value = "Teste-2 "; // massa nula (i=1)
    caixa.dispatchEvent(new Event("input"));
    const celulas = [...raiz.querySelectorAll("tbody tr:first-child td")].map((t) => t.textContent);
    expect(celulas[4]).toBe("—");
  });
});

describe("gráfico período × raio", () => {
  const x = escalaLog(DOMINIO_PERIODO, [56, LARGURA - 16]);
  const y = escalaLog(DOMINIO_RAIO, [ALTURA - 46, 12]);

  function mover(canvas: HTMLElement, cx: number, cy: number, tipo = "pointermove") {
    canvas.dispatchEvent(new MouseEvent(tipo, { clientX: cx, clientY: cy, bubbles: true }));
  }

  it("desenha um ponto por planeta", async () => {
    montar();
    await esperar(60);
    expect(contexto.arc).toHaveBeenCalledTimes(60);
    expect(contexto.fillText).toHaveBeenCalledWith(
      "Deserto de Netunos quentes",
      expect.any(Number),
      expect.any(Number),
    );
    expect(contexto.fillText).toHaveBeenCalledWith("Período orbital (dias)", expect.any(Number), expect.any(Number));
  });

  it("passar o mouse sobre um planeta mostra o tooltip com os dados dele, e sair esconde", async () => {
    const raiz = montar();
    const canvas = raiz.querySelector("canvas") as HTMLCanvasElement;
    const alvo = planetas[1];
    if (!alvo) throw new Error("fixture");
    mover(canvas, x(alvo.periodo) + 1, y(alvo.raio) - 1);
    const tooltip = raiz.querySelector<HTMLElement>(".tooltip") as HTMLElement;
    expect(tooltip.dataset.visivel).toBe("true");
    expect(tooltip.querySelector("strong")?.textContent).toBe(alvo.nome);
    expect(tooltip.textContent).toContain(String(alvo.ano));
    expect(tooltip.textContent).toContain("não medida");
    mover(canvas, 0, 0, "pointerleave");
    expect(tooltip.dataset.visivel).toBe("false");
  });

  it("longe de qualquer planeta o tooltip fica escondido", () => {
    const raiz = montar();
    const canvas = raiz.querySelector("canvas") as HTMLCanvasElement;
    mover(canvas, 2, 2);
    expect(raiz.querySelector<HTMLElement>(".tooltip")?.dataset.visivel).toBe("false");
  });

  it("mover de um planeta para outro troca o conteúdo; mexer dentro do mesmo só reposiciona", () => {
    const raiz = montar();
    const canvas = raiz.querySelector("canvas") as HTMLCanvasElement;
    const [a, b] = [planetas[1], planetas[2]];
    if (!a || !b) throw new Error("fixture");
    mover(canvas, x(a.periodo), y(a.raio));
    expect(raiz.querySelector(".tooltip strong")?.textContent).toBe(a.nome);
    mover(canvas, x(a.periodo) + 0.5, y(a.raio));
    expect(raiz.querySelector(".tooltip strong")?.textContent).toBe(a.nome);
    mover(canvas, x(b.periodo), y(b.raio));
    expect(raiz.querySelector(".tooltip strong")?.textContent).toBe(b.nome);
  });

  it("mexer dentro do mesmo ponto não reconstrói o tooltip", () => {
    const raiz = montar();
    const canvas = raiz.querySelector("canvas") as HTMLCanvasElement;
    const alvo = planetas[1];
    if (!alvo) throw new Error("fixture");
    mover(canvas, x(alvo.periodo), y(alvo.raio));
    const antes = raiz.querySelector(".tooltip strong");
    mover(canvas, x(alvo.periodo) + 1, y(alvo.raio) + 1);
    expect(raiz.querySelector(".tooltip strong")).toBe(antes);
  });

  it("lê as cores do tema uma vez, não a cada quadro, e de novo quando o tema muda", async () => {
    let aoTrocar: () => void = () => {};
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: (_: string, cb: () => void) => {
        aoTrocar = cb;
      },
      removeEventListener: () => {},
    }));
    const espiao = vi.spyOn(window, "getComputedStyle");
    const raiz = montar();
    await esperar(60);
    const leiturasIniciais = espiao.mock.calls.length;
    const canvas = raiz.querySelector("canvas") as HTMLCanvasElement;
    for (let i = 0; i < 5; i++) mover(canvas, 3 + i, 3 + i);
    raiz.querySelector<HTMLButtonElement>(".ficha")?.click();
    await esperar(60);
    expect(espiao.mock.calls.length - leiturasIniciais).toBeLessThan(5);
    const antes = espiao.mock.calls.length;
    aoTrocar();
    await esperar(60);
    expect(espiao.mock.calls.length).toBeGreaterThan(antes);
    vi.unstubAllGlobals();
  });

  it("tocar (pointerdown) também seleciona, para telas sensíveis ao toque", () => {
    const raiz = montar();
    const canvas = raiz.querySelector("canvas") as HTMLCanvasElement;
    const alvo = planetas[3];
    if (!alvo) throw new Error("fixture");
    mover(canvas, x(alvo.periodo), y(alvo.raio), "pointerdown");
    expect(raiz.querySelector<HTMLElement>(".tooltip")?.dataset.visivel).toBe("true");
  });

  it("filtrar esconde o tooltip e atualiza a descrição acessível do gráfico", () => {
    const raiz = montar();
    const canvas = raiz.querySelector("canvas") as HTMLCanvasElement;
    const alvo = planetas[1];
    if (!alvo) throw new Error("fixture");
    mover(canvas, x(alvo.periodo), y(alvo.raio));
    raiz.querySelector<HTMLButtonElement>(".ficha")?.click();
    expect(raiz.querySelector<HTMLElement>(".tooltip")?.dataset.visivel).toBe("false");
    expect(canvas.getAttribute("aria-label")).toMatch(/com \d+ planetas/);
  });

  it("o tooltip vira para a esquerda e para cima perto das bordas", () => {
    const raiz = montar();
    const area = raiz.querySelector<HTMLElement>(".area-grafico") as HTMLElement;
    Object.defineProperty(area, "clientWidth", { value: LARGURA, configurable: true });
    Object.defineProperty(area, "clientHeight", { value: ALTURA, configurable: true });
    const corpo = raiz.querySelector<HTMLElement>(".tooltip-corpo") as HTMLElement;
    Object.defineProperty(corpo, "offsetWidth", { value: 400, configurable: true });
    Object.defineProperty(corpo, "offsetHeight", { value: 120, configurable: true });
    const canvas = raiz.querySelector("canvas") as HTMLCanvasElement;
    const alvo = [...planetas].sort((p, q) => q.periodo - p.periodo)[0];
    if (!alvo) throw new Error("fixture");
    mover(canvas, x(alvo.periodo), y(alvo.raio));
    const tooltip = raiz.querySelector<HTMLElement>(".tooltip") as HTMLElement;
    expect(corpo.style.getPropertyValue("--origem")).toMatch(/^right/);
    const px = Number(/translate\(([\d.]+)px/.exec(tooltip.style.transform)?.[1]);
    expect(px).toBeLessThan(x(alvo.periodo));
  });
});

describe("raio medido × estimado, busca que destaca e °C", () => {
  function estimado(parcial: Partial<Planeta> & { nome: string }): Planeta {
    return {
      ano: 2020,
      periodo: 10,
      raio: 2,
      massa: null,
      temperatura: null,
      distancia: null,
      medido: false,
      classe: "super-terra",
      ...parcial,
    };
  }
  const misto: Planeta[] = [
    ...planetasDeTeste(20),
    estimado({ nome: "Estimado-1 b", raio: 3.1, periodo: 40, temperatura: 523, classe: "netuno" }),
    estimado({ nome: "Estimado-2 b", raio: 0.9, periodo: 7, classe: "terra" }),
  ];

  function montarMisto() {
    const raiz = montarExplorador(misto);
    document.body.append(raiz);
    return raiz;
  }

  it("por padrão só os de raio medido; a caixa inclui os estimados no gráfico e na tabela", () => {
    const raiz = montarMisto();
    expect(resumo(raiz)).toBe("Mostrando 20 de 20 planetas com raio medido.");
    const caixa = raiz.querySelector<HTMLInputElement>("#filtro-estimados") as HTMLInputElement;
    caixa.checked = true;
    caixa.dispatchEvent(new Event("change"));
    expect(resumo(raiz)).toBe("Mostrando 22 de 22 planetas com raio medido ou estimado.");
    caixa.checked = false;
    caixa.dispatchEvent(new Event("change"));
    expect(resumo(raiz)).toBe("Mostrando 20 de 20 planetas com raio medido.");
  });

  it("os estimados são desenhados vazados (contorno) e os medidos cheios", async () => {
    const raiz = montarMisto();
    await esperar(60);
    const preenchimentosSo = (contexto.fill as ReturnType<typeof vi.fn>).mock.calls.length;
    const contornosSo = (contexto.stroke as ReturnType<typeof vi.fn>).mock.calls.length;
    const caixa = raiz.querySelector<HTMLInputElement>("#filtro-estimados") as HTMLInputElement;
    caixa.checked = true;
    caixa.dispatchEvent(new Event("change"));
    await esperar(60);
    // Com estimados entram mais contornos de pontos (um traçado por classe presente), e os preenchimentos seguem.
    expect((contexto.stroke as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(contornosSo);
    expect((contexto.fill as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(preenchimentosSo);
  });

  it("o tooltip de um planeta estimado diz que o raio é estimado, e mostra a temperatura também em °C", () => {
    const raiz = montarMisto();
    const caixa = raiz.querySelector<HTMLInputElement>("#filtro-estimados") as HTMLInputElement;
    caixa.checked = true;
    caixa.dispatchEvent(new Event("change"));
    const canvas = raiz.querySelector("canvas") as HTMLCanvasElement;
    const x = escalaLog(DOMINIO_PERIODO, [56, LARGURA - 16]);
    const y = escalaLog(DOMINIO_RAIO, [ALTURA - 46, 12]);
    canvas.dispatchEvent(new MouseEvent("pointermove", { clientX: x(40), clientY: y(3.1), bubbles: true }));
    const tooltip = raiz.querySelector(".tooltip") as HTMLElement;
    expect(tooltip.querySelector("strong")?.textContent).toBe("Estimado-1 b");
    expect(tooltip.textContent).toContain("(estimado)");
    expect(tooltip.textContent).toContain("523 K (250 °C)");
  });

  it("a tabela marca o raio estimado", () => {
    const raiz = montarMisto();
    const caixa = raiz.querySelector<HTMLInputElement>("#filtro-estimados") as HTMLInputElement;
    caixa.checked = true;
    caixa.dispatchEvent(new Event("change"));
    const busca = raiz.querySelector<HTMLInputElement>("#filtro-busca") as HTMLInputElement;
    busca.value = "Estimado-1";
    busca.dispatchEvent(new Event("input"));
    const celulas = [...raiz.querySelectorAll("tbody tr:first-child td")].map((c) => c.textContent);
    expect(celulas[3]).toBe("3,10 (est.)");
  });

  it("a busca destaca no gráfico sem tirar os outros pontos, e limpar a busca tira o destaque", async () => {
    const raiz = montarMisto();
    await esperar(60);
    const arcosSemBusca = (contexto.arc as ReturnType<typeof vi.fn>).mock.calls.length;
    const busca = raiz.querySelector<HTMLInputElement>("#filtro-busca") as HTMLInputElement;
    busca.value = "teste-3 ";
    busca.dispatchEvent(new Event("input"));
    await esperar(60);
    const casam = misto.filter((p) => p.medido && p.nome.toLowerCase().includes("teste-3")).length;
    expect(casam).toBeGreaterThan(0);
    // Todos os pontos continuam desenhados, mais um anel por planeta buscado.
    const arcosComBusca = (contexto.arc as ReturnType<typeof vi.fn>).mock.calls.length - arcosSemBusca;
    expect(arcosComBusca).toBe(20 + casam);
    expect(raiz.querySelector("canvas")?.getAttribute("aria-label")).toContain(`${casam} destacados pela busca`);
    expect(resumo(raiz)).toContain(`A busca destaca ${casam} no gráfico`);
    busca.value = "";
    busca.dispatchEvent(new Event("input"));
    expect(resumo(raiz)).toBe("Mostrando 20 de 20 planetas com raio medido.");
    expect(raiz.querySelector("canvas")?.getAttribute("aria-label")).not.toContain("destacados");
  });

  it("uma busca sem resultado também esmaece o gráfico, para ele não parecer sem filtro", async () => {
    const raiz = montarMisto();
    await esperar(60);
    expect(atribuicoes.some(([k, v]) => k === "globalAlpha" && v === 0.22)).toBe(false);
    const busca = raiz.querySelector<HTMLInputElement>("#filtro-busca") as HTMLInputElement;
    busca.value = "zzz-nenhum";
    busca.dispatchEvent(new Event("input"));
    await esperar(60);
    expect(atribuicoes.some(([k, v]) => k === "globalAlpha" && v === 0.22)).toBe(true);
    expect(raiz.querySelector("canvas")?.getAttribute("aria-label")).toContain("0 destacados pela busca");
    expect(resumo(raiz)).toContain("A busca destaca 0 no gráfico");
    expect(raiz.querySelectorAll("tbody tr:not(:has(.vazio))")).toHaveLength(0);
  });

  it("o gráfico redesenha com as cores novas quando o tema muda pelo botão", async () => {
    montarMisto();
    await esperar(60);
    const espiao = vi.spyOn(window, "getComputedStyle");
    window.dispatchEvent(new Event("tema-alterado"));
    await esperar(60);
    expect(espiao).toHaveBeenCalled();
  });
});
