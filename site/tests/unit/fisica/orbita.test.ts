import { describe, expect, it } from "vitest";
import { ANO_JULIANO, DIA, M_JUPITER, M_SOL } from "../../../src/lib/fisica/constantes";
import {
  anomaliaExcentrica,
  anomaliaVerdadeira,
  anomaliaVerdadeiraNoTempo,
  distanciaOrbital,
  periodoOrbitalDias,
  semiEixoUA,
} from "../../../src/lib/fisica/orbita";

describe("terceira lei de Kepler", () => {
  // Valores de referência: períodos do Sistema Solar (NASA Planetary Fact Sheet), em dias.
  it.each([
    ["Terra", 1.0, 365.256],
    ["Marte", 1.523679, 686.98],
    ["Júpiter", 5.2044, 4332.59],
    ["Netuno", 30.07, 60190],
  ])("%s: a = %f UA dá o período conhecido", (_nome, a, periodo) => {
    // Os semi-eixos da ficha têm 3–4 algarismos: 0,5% de folga.
    expect(Math.abs(periodoOrbitalDias(a, 1) / periodo - 1)).toBeLessThan(0.005);
  });

  it("a Terra tem período de um ano juliano (a massa da Terra faz diferença de ~3 ppm)", () => {
    expect(periodoOrbitalDias(1, 1)).toBeCloseTo(365.25, 1);
    expect(Math.abs((periodoOrbitalDias(1, 1) * DIA) / ANO_JULIANO - 1)).toBeLessThan(1e-4);
    expect(periodoOrbitalDias(1, 1, 3.003e-6)).toBeLessThan(periodoOrbitalDias(1, 1));
  });

  it("semiEixoUA é a inversa de periodoOrbitalDias", () => {
    for (const [a, m] of [
      [0.05, 1.1],
      [1, 1],
      [30, 0.5],
    ] as const) {
      expect(semiEixoUA(periodoOrbitalDias(a, m), m)).toBeCloseTo(a, 9);
    }
  });

  it("51 Pegasi b: P = 4,23 dias em torno de uma estrela de 1,1 M☉ dá a ≈ 0,052 UA", () => {
    expect(semiEixoUA(4.2308, 1.11)).toBeCloseTo(0.0527, 3);
  });

  it("a massa do planeta encurta o período (massa total maior)", () => {
    const sem = periodoOrbitalDias(0.05, 1);
    const com = periodoOrbitalDias(0.05, 1, (10 * M_JUPITER) / M_SOL);
    expect(com).toBeLessThan(sem);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejeita semi-eixo inválido %s", (a) => {
    expect(() => periodoOrbitalDias(a, 1)).toThrow(RangeError);
    expect(() => semiEixoUA(a, 1)).toThrow(RangeError);
  });

  it("rejeita massa da estrela inválida", () => {
    expect(() => periodoOrbitalDias(1, 0)).toThrow("massaEstrelaMsol");
    expect(() => semiEixoUA(1, -2)).toThrow("massaEstrelaMsol");
  });
});

describe("equação de Kepler", () => {
  it("órbita circular: a anomalia excêntrica é a própria anomalia média", () => {
    for (const M of [0, 0.5, 1, 3, 5.5]) expect(anomaliaExcentrica(M, 0)).toBeCloseTo(M, 12);
  });

  it("satisfaz M = E − e·sin E em toda a faixa de excentricidades", () => {
    for (const e of [0.01, 0.1, 0.3, 0.6, 0.8, 0.9, 0.99]) {
      for (let M = 0.01; M < 2 * Math.PI; M += 0.37) {
        const E = anomaliaExcentrica(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 10);
      }
    }
  });

  it("aceita anomalias fora de [0, 2π) e negativas", () => {
    const e = 0.3;
    expect(anomaliaExcentrica(0.7 + 4 * Math.PI, e)).toBeCloseTo(anomaliaExcentrica(0.7, e), 10);
    expect(anomaliaExcentrica(-0.7, e)).toBeCloseTo(anomaliaExcentrica(2 * Math.PI - 0.7, e), 10);
  });

  it("no periastro e no afastamento máximo, as anomalias coincidem", () => {
    expect(anomaliaExcentrica(0, 0.5)).toBeCloseTo(0, 12);
    expect(anomaliaExcentrica(Math.PI, 0.5)).toBeCloseTo(Math.PI, 12);
  });

  it.each([-0.1, 1, 1.5, Number.NaN])("rejeita excentricidade %s", (e) => {
    expect(() => anomaliaExcentrica(1, e)).toThrow(RangeError);
    expect(() => anomaliaVerdadeira(1, e)).toThrow(RangeError);
  });
});

describe("anomalia verdadeira e distância orbital", () => {
  it("em órbita circular, ν = E", () => {
    expect(anomaliaVerdadeira(1.2, 0)).toBeCloseTo(1.2, 12);
  });

  it("ν fica no mesmo semiplano que E e cresce junto", () => {
    const e = 0.6;
    let anterior = -1;
    for (let E = 0.1; E < 2 * Math.PI; E += 0.2) {
      const nu = anomaliaVerdadeira(E, e);
      expect(nu).toBeGreaterThan(anterior);
      anterior = nu;
      expect(Math.sin(nu) * Math.sin(E)).toBeGreaterThanOrEqual(0);
    }
  });

  it("a distância vai de a(1−e) no periastro a a(1+e) no afélio", () => {
    expect(distanciaOrbital(1, 0.2, 0)).toBeCloseTo(0.8, 12);
    expect(distanciaOrbital(1, 0.2, Math.PI)).toBeCloseTo(1.2, 12);
    expect(distanciaOrbital(5, 0, 1.3)).toBe(5);
  });

  it("o planeta passa mais rápido no periastro (lei das áreas)", () => {
    const e = 0.5;
    const P = 100;
    const perto = anomaliaVerdadeiraNoTempo(1, P, e) - anomaliaVerdadeiraNoTempo(0, P, e);
    const longe = anomaliaVerdadeiraNoTempo(P / 2 + 1, P, e) - anomaliaVerdadeiraNoTempo(P / 2, P, e);
    expect(perto).toBeGreaterThan(longe * 3);
  });

  it("uma volta completa devolve a anomalia verdadeira ao início", () => {
    expect(anomaliaVerdadeiraNoTempo(0, 365.25, 0.0167)).toBeCloseTo(0, 12);
    expect(anomaliaVerdadeiraNoTempo(365.25, 365.25, 0.0167) % (2 * Math.PI)).toBeCloseTo(0, 9);
  });

  it("rejeita período inválido", () => {
    expect(() => anomaliaVerdadeiraNoTempo(1, 0, 0.1)).toThrow("periodoDias");
  });
});
