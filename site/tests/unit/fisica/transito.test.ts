import { describe, expect, it } from "vitest";
import { R_JUPITER, R_SOL, R_TERRA, UA } from "../../../src/lib/fisica/constantes";
import {
  curvaDeLuz,
  duracaoDoTransitoDias,
  fluxoRelativo,
  type GeometriaDoTransito,
  haTransito,
  parametroDeImpacto,
  profundidadeNoCentro,
  profundidadeSimples,
  razaoDeRaios,
  SEM_ESCURECIMENTO,
  separacaoProjetada,
} from "../../../src/lib/fisica/transito";

const terra: GeometriaDoTransito = {
  razaoDeRaios: R_TERRA / R_SOL,
  semiEixoEmRaiosEstelares: UA / R_SOL,
  inclinacaoGraus: 90,
  periodoDias: 365.25,
};
const jupiter: GeometriaDoTransito = {
  razaoDeRaios: R_JUPITER / R_SOL,
  semiEixoEmRaiosEstelares: (5.2044 * UA) / R_SOL,
  inclinacaoGraus: 90,
  periodoDias: 4332.59,
};
// HD 209458 b, o primeiro planeta visto em trânsito (Torres et al. 2008): k = 0,12086, a/R★ = 8,76, i = 86,71°, P = 3,52475 d.
const hd209458b: GeometriaDoTransito = {
  razaoDeRaios: 0.12086,
  semiEixoEmRaiosEstelares: 8.76,
  inclinacaoGraus: 86.71,
  periodoDias: 3.52475,
};

describe("razão de raios e profundidade", () => {
  it("Júpiter em frente ao Sol tira 1,06% do brilho; a Terra, 84 ppm", () => {
    expect(profundidadeSimples(jupiter.razaoDeRaios)).toBeCloseTo(0.01056, 5);
    expect(profundidadeSimples(terra.razaoDeRaios) * 1e6).toBeCloseTo(84, 0);
  });

  it("razaoDeRaios converte Rjup e R☉", () => {
    expect(razaoDeRaios(1, 1)).toBeCloseTo(0.10276, 4);
    expect(razaoDeRaios(2, 1)).toBeCloseTo(2 * razaoDeRaios(1, 1), 12);
  });

  it("rejeita entradas inválidas", () => {
    expect(() => razaoDeRaios(0, 1)).toThrow("raioPlanetaRjup");
    expect(() => razaoDeRaios(1, -1)).toThrow("raioEstrelaRsol");
    expect(() => profundidadeSimples(0)).toThrow("razaoDeRaios");
  });
});

describe("geometria", () => {
  it("parâmetro de impacto: zero com i = 90°, e a·cos i fora disso", () => {
    expect(Math.abs(parametroDeImpacto(terra))).toBeLessThan(1e-9);
    expect(parametroDeImpacto(hd209458b)).toBeCloseTo(0.507, 2);
  });

  it("HD 209458 b: duração de ~3 h (Torres et al. 2008 dão T14 ≈ 3,07 h)", () => {
    const horas = duracaoDoTransitoDias(hd209458b) * 24;
    expect(Math.abs(horas - 3.07)).toBeLessThan(0.1);
  });

  it("trânsito central da Terra dura ~13 h e o de Júpiter ~32 h", () => {
    expect(duracaoDoTransitoDias(terra) * 24).toBeCloseTo(13.1, 0);
    expect(duracaoDoTransitoDias(jupiter) * 24).toBeCloseTo(32.6, 0);
  });

  it("a duração diminui quando o impacto aumenta e some quando não há trânsito", () => {
    const central = duracaoDoTransitoDias({ ...hd209458b, inclinacaoGraus: 90 });
    const rasante = duracaoDoTransitoDias({ ...hd209458b, inclinacaoGraus: 85 });
    expect(rasante).toBeLessThan(central);
    expect(duracaoDoTransitoDias({ ...hd209458b, inclinacaoGraus: 80 })).toBe(0);
  });

  it("órbita tão apertada que o planeta nunca sai de frente da estrela: metade do período", () => {
    expect(
      duracaoDoTransitoDias({ razaoDeRaios: 0.1, semiEixoEmRaiosEstelares: 1.05, inclinacaoGraus: 90, periodoDias: 2 }),
    ).toBe(1);
  });

  it("haTransito segue b < 1 + k", () => {
    expect(haTransito(hd209458b)).toBe(true);
    expect(haTransito({ ...hd209458b, inclinacaoGraus: 80 })).toBe(false);
    expect(haTransito({ ...hd209458b, inclinacaoGraus: 83.5 })).toBe(true);
  });

  it("separação projetada: zero no meio do trânsito (central) e infinita do outro lado da estrela", () => {
    expect(separacaoProjetada(terra, 0)).toBeCloseTo(0, 9);
    expect(separacaoProjetada(terra, 365.25 / 2)).toBe(Number.POSITIVE_INFINITY);
    expect(separacaoProjetada(hd209458b, 0)).toBeCloseTo(parametroDeImpacto(hd209458b), 9);
  });

  it("rejeita geometrias inválidas", () => {
    expect(() => duracaoDoTransitoDias({ ...terra, razaoDeRaios: 0 })).toThrow("razaoDeRaios");
    expect(() => duracaoDoTransitoDias({ ...terra, semiEixoEmRaiosEstelares: 0 })).toThrow("semiEixoEmRaiosEstelares");
    expect(() => duracaoDoTransitoDias({ ...terra, periodoDias: 0 })).toThrow("periodoDias");
  });
});

describe("fluxo com e sem escurecimento de borda", () => {
  it("sem escurecimento, a profundidade no centro é k² (disco uniforme)", () => {
    for (const k of [0.01, 0.05, 0.1, 0.2]) expect(1 - fluxoRelativo(0, k)).toBeCloseTo(k * k, 4);
  });

  it("antes e depois do trânsito não há queda", () => {
    expect(fluxoRelativo(1.2, 0.1)).toBe(1);
    expect(fluxoRelativo(Number.POSITIVE_INFINITY, 0.1)).toBe(1);
    expect(fluxoRelativo(1.1, 0.1)).toBeCloseTo(1, 6);
  });

  it("com escurecimento, o centro da estrela é mais brilhante e o trânsito central é mais fundo que k²", () => {
    const k = 0.05;
    const ld = { u1: 0.4, u2: 0.25 };
    // Para k pequeno: profundidade ≈ k²·I(centro)/⟨I⟩, com ⟨I⟩ = 1 − u1/3 − u2/6.
    const esperado = (k * k) / (1 - ld.u1 / 3 - ld.u2 / 6);
    expect(1 - fluxoRelativo(0, k, ld)).toBeCloseTo(esperado, 4);
    expect(1 - fluxoRelativo(0, k, ld)).toBeGreaterThan(k * k);
  });

  it("perto da borda a queda é menor que no centro (a borda é mais escura)", () => {
    const ld = { u1: 0.5, u2: 0.2 };
    expect(1 - fluxoRelativo(0.95, 0.05, ld)).toBeLessThan(1 - fluxoRelativo(0, 0.05, ld));
  });

  it("sem escurecimento a queda é igual no centro e na borda interna (planeta inteiro sobre o disco)", () => {
    expect(1 - fluxoRelativo(0.5, 0.05, SEM_ESCURECIMENTO)).toBeCloseTo(0.0025, 4);
  });

  it("ingresso e egresso: a queda cresce de forma contínua de 0 a k²", () => {
    const k = 0.1;
    let anterior = -1;
    for (let z = 1 + k; z >= 1 - k; z -= 0.01) {
      const queda = 1 - fluxoRelativo(z, k);
      expect(queda).toBeGreaterThanOrEqual(anterior - 1e-9);
      anterior = queda;
    }
    expect(anterior).toBeCloseTo(k * k, 3);
  });

  it("planeta grande o bastante para cobrir a estrela inteira: fluxo zero", () => {
    expect(fluxoRelativo(0, 1.5)).toBeCloseTo(0, 6);
  });

  it("profundidadeNoCentro usa o parâmetro de impacto", () => {
    expect(profundidadeNoCentro(hd209458b)).toBeGreaterThan(0.012);
    expect(profundidadeNoCentro(hd209458b)).toBeLessThan(0.016);
    // HD 209458 b tem ~1,5% de profundidade observada (Brown et al. 2001 mediram 1,5%).
    expect(profundidadeNoCentro({ ...hd209458b, inclinacaoGraus: 90 }, { u1: 0.3, u2: 0.3 })).toBeCloseTo(
      0.0146 / (1 - 0.1 - 0.05),
      2,
    );
  });

  it("rejeita razão de raios inválida", () => {
    expect(() => fluxoRelativo(0, 0)).toThrow("razaoDeRaios");
  });
});

describe("curva de luz", () => {
  it("tem n pontos, simétrica em torno do meio do trânsito, com o mínimo no centro", () => {
    const curva = curvaDeLuz(hd209458b, 0.1, 101);
    expect(curva).toHaveLength(101);
    const meio = curva[50];
    expect(meio?.tempoDias).toBeCloseTo(0, 12);
    for (let i = 0; i < 50; i++) expect(curva[i]?.fluxo).toBeCloseTo(curva[100 - i]?.fluxo ?? Number.NaN, 9);
    // Sem escurecimento o fundo do trânsito é plano: o mínimo coincide com o centro dentro do erro numérico da integração.
    expect(Math.min(...curva.map((p) => p.fluxo))).toBeCloseTo(meio?.fluxo ?? Number.NaN, 5);
  });

  it("fora da janela do trânsito o fluxo é 1, e dentro dela há queda", () => {
    const curva = curvaDeLuz(hd209458b, 0.2, 201);
    expect(curva[0]?.fluxo).toBe(1);
    expect(curva[200]?.fluxo).toBe(1);
    expect(curva.some((p) => p.fluxo < 0.99)).toBe(true);
  });

  it("a largura da queda bate com a duração calculada", () => {
    const n = 4001;
    const janela = 0.2;
    const curva = curvaDeLuz(hd209458b, janela, n);
    const emTransito = curva.filter((p) => p.fluxo < 1);
    const largura = (emTransito.length / n) * 2 * janela;
    expect(largura).toBeCloseTo(duracaoDoTransitoDias(hd209458b), 2);
  });

  it("rejeita janela e número de pontos inválidos", () => {
    expect(() => curvaDeLuz(hd209458b, 0, 10)).toThrow("janelaDias");
    expect(() => curvaDeLuz(hd209458b, 1, 1)).toThrow(RangeError);
    expect(() => curvaDeLuz(hd209458b, 1, 2.5)).toThrow(RangeError);
  });
});
