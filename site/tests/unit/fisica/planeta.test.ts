import { describe, expect, it } from "vitest";
import { M_JUPITER, M_TERRA, R_JUPITER, R_TERRA, T_SOL } from "../../../src/lib/fisica/constantes";
import {
  densidadeGcm3,
  gravidadeDeSuperficie,
  insolacao,
  luminosidadeLsol,
  temperaturaDeEquilibrioK,
  velocidadeDeEscapeKms,
  zonaHabitavelAproximada,
} from "../../../src/lib/fisica/planeta";

const MASSA_JUPITER_EM_TERRAS = M_JUPITER / M_TERRA;
const RAIO_JUPITER_EM_TERRAS = R_JUPITER / R_TERRA;

describe("propriedades de superfície", () => {
  // Referências: NASA Planetary Fact Sheet.
  // As constantes usam o raio EQUATORIAL (IAU 2015). A ficha da NASA usa o raio médio (6371 km na Terra),
  // então os valores diferem na terceira casa, e o teste confere a diferença esperada.
  it("Terra: escape 11,2 km/s, gravidade 9,80 m/s², densidade 5,5 g/cm³", () => {
    expect(velocidadeDeEscapeKms(1, 1)).toBeCloseTo(11.18, 2); // 11,186 com o raio médio
    expect(gravidadeDeSuperficie(1, 1)).toBeCloseTo(9.8, 1);
    expect(densidadeGcm3(1, 1)).toBeCloseTo(5.5, 1); // 5,51 com o raio médio
  });

  it("com o raio médio da Terra (6371 km), reproduz a ficha da NASA: 11,186 km/s e 5,51 g/cm³", () => {
    const raioMedio = 6.371e6 / R_TERRA;
    expect(velocidadeDeEscapeKms(1, raioMedio)).toBeCloseTo(11.186, 2);
    expect(densidadeGcm3(1, raioMedio)).toBeCloseTo(5.51, 2);
  });

  it("Júpiter: escape 59,5 km/s; densidade 1,33 g/cm³ com o raio volumétrico médio (69 911 km)", () => {
    expect(velocidadeDeEscapeKms(MASSA_JUPITER_EM_TERRAS, RAIO_JUPITER_EM_TERRAS)).toBeCloseTo(59.5, 0);
    expect(densidadeGcm3(MASSA_JUPITER_EM_TERRAS, 6.9911e7 / R_TERRA)).toBeCloseTo(1.33, 2);
  });

  it("Júpiter é achatado: com o raio equatorial a densidade sai menor (1,24 g/cm³)", () => {
    expect(densidadeGcm3(MASSA_JUPITER_EM_TERRAS, RAIO_JUPITER_EM_TERRAS)).toBeCloseTo(1.24, 2);
  });

  it("Lua: escape 2,38 km/s", () => {
    expect(velocidadeDeEscapeKms(7.342e22 / M_TERRA, 1.7374e6 / R_TERRA)).toBeCloseTo(2.38, 2);
  });

  it("a gravidade cai com o quadrado do raio e cresce com a massa", () => {
    expect(gravidadeDeSuperficie(1, 2)).toBeCloseTo(gravidadeDeSuperficie(1, 1) / 4, 10);
    expect(gravidadeDeSuperficie(3, 1)).toBeCloseTo(3 * gravidadeDeSuperficie(1, 1), 10);
  });

  it.each([0, -1, Number.NaN])("rejeita massa ou raio inválidos (%s)", (v) => {
    expect(() => velocidadeDeEscapeKms(v, 1)).toThrow(RangeError);
    expect(() => velocidadeDeEscapeKms(1, v)).toThrow(RangeError);
    expect(() => gravidadeDeSuperficie(v, 1)).toThrow(RangeError);
    expect(() => gravidadeDeSuperficie(1, v)).toThrow(RangeError);
    expect(() => densidadeGcm3(v, 1)).toThrow(RangeError);
    expect(() => densidadeGcm3(1, v)).toThrow(RangeError);
  });
});

describe("luminosidade, insolação e temperatura de equilíbrio", () => {
  it("o Sol (R = 1 R☉, T = 5772 K) tem 1 L☉", () => {
    expect(luminosidadeLsol(1, T_SOL)).toBeCloseTo(1, 3);
  });

  it("a luminosidade cresce com R² e com T⁴", () => {
    expect(luminosidadeLsol(2, 5772)).toBeCloseTo(4 * luminosidadeLsol(1, 5772), 10);
    expect(luminosidadeLsol(1, 2 * 5772)).toBeCloseTo(16 * luminosidadeLsol(1, 5772), 10);
  });

  it("a Terra recebe 1; Marte recebe ~0,43; Júpiter ~0,037 (lei do inverso do quadrado)", () => {
    expect(insolacao(1, 1)).toBe(1);
    expect(insolacao(1, 1.523679)).toBeCloseTo(0.431, 3);
    expect(insolacao(1, 5.2044)).toBeCloseTo(0.0369, 4);
  });

  it("Terra: 278 K sem albedo e ~254 K com albedo de Bond 0,306 (ficha da NASA: 254,3 K)", () => {
    const base = { temperaturaEstrelaK: 5772, raioEstrelaRsol: 1, semiEixoUA: 1 };
    expect(temperaturaDeEquilibrioK(base)).toBeCloseTo(278.3, 0);
    expect(Math.abs(temperaturaDeEquilibrioK({ ...base, albedo: 0.306 }) - 254.3)).toBeLessThan(1);
  });

  it("Júpiter (albedo de Bond 0,343): ~110 K (ficha da NASA: 109,9 K)", () => {
    const T = temperaturaDeEquilibrioK({
      temperaturaEstrelaK: 5772,
      raioEstrelaRsol: 1,
      semiEixoUA: 5.2044,
      albedo: 0.343,
    });
    expect(Math.abs(T - 109.9)).toBeLessThan(1);
  });

  it("cai com a raiz da distância", () => {
    const base = { temperaturaEstrelaK: 5772, raioEstrelaRsol: 1 };
    expect(temperaturaDeEquilibrioK({ ...base, semiEixoUA: 4 })).toBeCloseTo(
      temperaturaDeEquilibrioK({ ...base, semiEixoUA: 1 }) / 2,
      10,
    );
  });

  it.each([-0.1, 1, 2, Number.NaN])("rejeita albedo %s", (albedo) => {
    expect(() =>
      temperaturaDeEquilibrioK({ temperaturaEstrelaK: 5772, raioEstrelaRsol: 1, semiEixoUA: 1, albedo }),
    ).toThrow("albedo");
  });

  it("rejeita entradas inválidas", () => {
    expect(() => luminosidadeLsol(0, 5772)).toThrow("raioEstrelaRsol");
    expect(() => luminosidadeLsol(1, -5)).toThrow("temperaturaEfetivaK");
    expect(() => insolacao(0, 1)).toThrow("luminosidadeEstrelaLsol");
    expect(() => insolacao(1, 0)).toThrow("semiEixoUA");
    expect(() => temperaturaDeEquilibrioK({ temperaturaEstrelaK: 0, raioEstrelaRsol: 1, semiEixoUA: 1 })).toThrow(
      "temperaturaEstrelaK",
    );
    expect(() => temperaturaDeEquilibrioK({ temperaturaEstrelaK: 5772, raioEstrelaRsol: 0, semiEixoUA: 1 })).toThrow(
      "raioEstrelaRsol",
    );
    expect(() => temperaturaDeEquilibrioK({ temperaturaEstrelaK: 5772, raioEstrelaRsol: 1, semiEixoUA: 0 })).toThrow(
      "semiEixoUA",
    );
  });
});

describe("zona habitável aproximada", () => {
  it("para o Sol: de 0,95 a 1,68 UA (Kopparapu et al. 2013, conservadora)", () => {
    const z = zonaHabitavelAproximada(1);
    expect(z.internaUA).toBeCloseTo(0.95, 2);
    expect(z.externaUA).toBeCloseTo(1.68, 2);
  });

  it("a Terra está dentro e Marte está fora, perto da borda externa", () => {
    const z = zonaHabitavelAproximada(1);
    expect(1).toBeGreaterThan(z.internaUA);
    expect(1).toBeLessThan(z.externaUA);
    expect(1.523679).toBeLessThan(z.externaUA);
    expect(5.2).toBeGreaterThan(z.externaUA);
  });

  it("uma estrela 100 vezes mais luminosa tem a zona 10 vezes mais longe", () => {
    const sol = zonaHabitavelAproximada(1);
    const grande = zonaHabitavelAproximada(100);
    expect(grande.internaUA).toBeCloseTo(10 * sol.internaUA, 10);
    expect(grande.externaUA).toBeCloseTo(10 * sol.externaUA, 10);
  });

  it("os planetas nas bordas recebem exatamente o fluxo limite", () => {
    const L = 0.3;
    const z = zonaHabitavelAproximada(L);
    expect(insolacao(L, z.internaUA)).toBeCloseTo(1.107, 10);
    expect(insolacao(L, z.externaUA)).toBeCloseTo(0.356, 10);
  });

  it("rejeita luminosidade inválida", () => {
    expect(() => zonaHabitavelAproximada(0)).toThrow(RangeError);
  });
});
