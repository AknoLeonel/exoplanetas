import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PADRAO, simularCurva } from "../../src/lib/simulacao-transito";
import { criarCurvaDeLuz, criarVistaDaEstrela, type EstadoDaCurva } from "../../src/ui/transito-desenho";
import { contextoFalso, esperarAte } from "./fixtures";

let falso: ReturnType<typeof contextoFalso>;

beforeEach(() => {
  falso = contextoFalso();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(falso.contexto as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("vista da estrela", () => {
  it("desenha a estrela com o escurecimento de borda e o planeta na frente", async () => {
    const tela = criarVistaDaEstrela(() => ({
      razaoDeRaios: 0.1,
      escurecimento: { u1: 0.4, u2: 0.25 },
      posicao: { x: 0.2, y: 0.1, naFrente: true },
    }));
    document.body.append(tela.elemento);
    await esperarAte(() => expect(falso.de("arc")).toHaveLength(2));
    const paradas = falso.de("addColorStop");
    expect(paradas.length).toBeGreaterThan(10);
    // Centro sem sombra, borda com a sombra de 1 − (1 − u₁ − u₂).
    expect(paradas[0]?.args[1]).toBe("rgba(0, 0, 0, 0.000)");
    expect(paradas.at(-1)?.args[1]).not.toBe("rgba(0, 0, 0, 0.000)");
    tela.destruir();
  });

  it("atrás da estrela o planeta não aparece", async () => {
    const tela = criarVistaDaEstrela(() => ({
      razaoDeRaios: 0.1,
      escurecimento: { u1: 0, u2: 0 },
      posicao: { x: 0, y: 0, naFrente: false },
    }));
    document.body.append(tela.elemento);
    await esperarAte(() => expect(falso.de("fill").length).toBeGreaterThan(0));
    expect(falso.de("arc")).toHaveLength(1);
    tela.destruir();
  });

  it("trocar o tema redesenha", async () => {
    const tela = criarVistaDaEstrela(() => ({
      razaoDeRaios: 0.1,
      escurecimento: { u1: 0, u2: 0 },
      posicao: { x: 0, y: 0, naFrente: true },
    }));
    document.body.append(tela.elemento);
    await esperarAte(() => expect(falso.de("clearRect")).toHaveLength(1));
    window.dispatchEvent(new Event("tema-alterado"));
    await esperarAte(() => expect(falso.de("clearRect")).toHaveLength(2));
    tela.destruir();
  });
});

describe("curva de luz", () => {
  function estado(extra: Partial<EstadoDaCurva> = {}): EstadoDaCurva {
    return { curva: simularCurva(PADRAO, 50), referencia: null, tempoDias: 0, fluxoAgora: 0.9856, ruido: 0, ...extra };
  }

  it("desenha eixos com rótulos, a curva e o marcador do instante", async () => {
    const tela = criarCurvaDeLuz(() => estado());
    document.body.append(tela.elemento);
    await esperarAte(() => expect(falso.de("fillText").length).toBeGreaterThan(4));
    const textos = falso.de("fillText").map((c) => c.args[0]);
    expect(textos).toContain("0");
    expect(textos).toContain("Tempo desde o meio do trânsito");
    expect(textos).toContain("Queda do brilho");
    expect(textos.some((t) => typeof t === "string" && /^−\d/.test(t))).toBe(true);
    expect(textos.some((t) => typeof t === "string" && /^\+.* h$/.test(t))).toBe(true);
    expect(falso.de("lineTo").length).toBeGreaterThan(49);
    expect(falso.de("fillRect")).toHaveLength(0); // sem ruído, sem pontos
    tela.destruir();
  });

  it("com ruído desenha os pontos, e com planeta do catálogo a linha tracejada", async () => {
    const ruidosa = simularCurva({ ...PADRAO, ruidoPpm: 500 }, 50);
    const tela = criarCurvaDeLuz(() => estado({ curva: ruidosa, referencia: simularCurva(PADRAO, 50), ruido: 5e-4 }));
    document.body.append(tela.elemento);
    await esperarAte(() => expect(falso.de("fillRect")).toHaveLength(50));
    expect(falso.de("setLineDash").map((c) => c.args[0])).toEqual([[5, 4], []]);
    tela.destruir();
  });
});
