import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PADRAO_VR, posicoesNaOrbita, simularCurvaVR } from "../../src/lib/simulacao-velocidade-radial";
import {
  criarCurvaVR,
  criarVistaDaOrbita,
  type EstadoDaOrbita,
  rotuloDeVelocidade,
  textoDoExagero,
} from "../../src/ui/vr-desenho";
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

describe("rótulos", () => {
  it("velocidade em m/s, ou cm/s abaixo de 1 m/s, com sinal", () => {
    expect(rotuloDeVelocidade(0)).toBe("0");
    expect(rotuloDeVelocidade(55.9)).toBe("+56 m/s");
    expect(rotuloDeVelocidade(-3.24)).toBe("−3,2 m/s");
    expect(rotuloDeVelocidade(0.0895)).toBe("+9 cm/s");
  });

  it("o exagero do balanço é arredondado, e some quando não há exagero", () => {
    expect(textoDoExagero(1)).toBe("Balanço da estrela em escala real");
    expect(textoDoExagero(312)).toBe("Balanço da estrela exagerado 300 vezes");
    expect(textoDoExagero(4870)).toBe("Balanço da estrela exagerado 5.000 vezes");
  });
});

function estadoDaOrbita(velocidadeMs: number): EstadoDaOrbita {
  const trajeto = Array.from({ length: 20 }, (_, i) => posicoesNaOrbita(PADRAO_VR, i / 20).planeta);
  const { planeta, estrela } = posicoesNaOrbita(PADRAO_VR, 0.1);
  return {
    trajeto,
    planeta,
    estrela,
    balancoMaximo: Math.hypot(estrela.x, estrela.z),
    velocidadeMs,
    velocidadeMaximaMs: 56,
  };
}

describe("vista da órbita", () => {
  it("desenha trajeto, centro de massa, estrela e planeta, e diz o exagero", async () => {
    const tela = criarVistaDaOrbita(() => estadoDaOrbita(30));
    document.body.append(tela.elemento);
    await esperarAte(() => expect(falso.de("arc")).toHaveLength(2));
    expect(falso.de("lineTo").length).toBeGreaterThan(19);
    const textos = falso.de("fillText").map((c) => c.args[0]);
    expect(textos).toContain("↓ para a Terra");
    expect(textos.some((t) => typeof t === "string" && t.startsWith("Balanço da estrela exagerado"))).toBe(true);
    tela.destruir();
  });

  it("a estrela ganha o tom do Doppler só quando se move na linha de visada", async () => {
    const parada = criarVistaDaOrbita(() => estadoDaOrbita(0));
    document.body.append(parada.elemento);
    await esperarAte(() => expect(falso.de("arc")).toHaveLength(2));
    // estrela + planeta, sem a camada de cor
    expect(falso.de("fill")).toHaveLength(2);
    parada.destruir();
  });
});

describe("curva de velocidade radial", () => {
  it("eixos simétricos, curva, pontos de ruído e linha de comparação", async () => {
    const curva = simularCurvaVR({ ...PADRAO_VR, ruidoMs: 5 }, 40);
    const tela = criarCurvaVR(() => ({
      curva,
      referencia: simularCurvaVR(PADRAO_VR, 40),
      fase: 0.25,
      velocidadeAgora: -50,
      ruidoMs: 5,
    }));
    document.body.append(tela.elemento);
    await esperarAte(() => expect(falso.de("fillRect")).toHaveLength(40));
    const textos = falso.de("fillText").map((c) => c.args[0]);
    expect(textos).toContain("0");
    expect(textos).toContain("Fase da órbita (0 = periastro)");
    expect(textos.some((t) => typeof t === "string" && /^\+\d+ m\/s$/.test(t))).toBe(true);
    expect(textos.some((t) => typeof t === "string" && /^−\d+ m\/s$/.test(t))).toBe(true);
    expect(falso.de("setLineDash").map((c) => c.args[0])).toEqual([[5, 4], []]);
    tela.destruir();
  });
});
