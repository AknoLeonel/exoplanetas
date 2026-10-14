import { describe, expect, it } from "vitest";
import { escalaLinear, escalaLog, maisProximo, marcasLineares, marcasLog } from "../../src/lib/escala";

describe("escalaLog", () => {
  const e = escalaLog([1, 100], [0, 200]);
  it("mapeia os extremos e o meio geométrico", () => {
    expect(e(1)).toBeCloseTo(0);
    expect(e(100)).toBeCloseTo(200);
    expect(e(10)).toBeCloseTo(100);
  });
  it("aceita imagem invertida (eixo y de tela)", () => {
    const y = escalaLog([1, 100], [200, 0]);
    expect(y(1)).toBeCloseTo(200);
    expect(y(100)).toBeCloseTo(0);
  });
});

describe("escalaLinear", () => {
  it("interpola linearmente", () => {
    const e = escalaLinear([0, 10], [100, 200]);
    expect(e(0)).toBe(100);
    expect(e(5)).toBe(150);
    expect(e(10)).toBe(200);
  });
});

describe("marcasLog", () => {
  it("dá 1, 2 e 5 por década e destaca só as potências de dez", () => {
    const m = marcasLog(0.1, 100);
    expect(m.map((x) => x.valor)).toEqual([0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100]);
    expect(m.filter((x) => x.principal).map((x) => x.valor)).toEqual([0.1, 1, 10, 100]);
  });
  it("não passa dos limites do domínio", () => {
    const m = marcasLog(0.3, 30);
    expect(Math.min(...m.map((x) => x.valor))).toBeGreaterThanOrEqual(0.3);
    expect(Math.max(...m.map((x) => x.valor))).toBeLessThanOrEqual(30);
  });
});

describe("marcasLineares", () => {
  it("escolhe passos 1, 2 ou 5 vezes uma potência de dez", () => {
    expect(marcasLineares(1504, 5)).toEqual([0, 500, 1000, 1500]);
    expect(marcasLineares(10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(marcasLineares(100, 4)).toEqual([0, 50, 100]);
  });
  it("respeita o limite de marcas", () => {
    expect(marcasLineares(1504, 5).length).toBeLessThanOrEqual(6);
  });
});

describe("maisProximo", () => {
  const pontos = [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 20, y: 0 },
  ];
  it("acha o ponto mais próximo dentro do alcance", () => {
    expect(maisProximo(pontos, 11, 9, 5)).toBe(1);
    expect(maisProximo(pontos, 1, 1, 5)).toBe(0);
  });
  it("devolve -1 quando todos estão longe", () => {
    expect(maisProximo(pontos, 100, 100, 5)).toBe(-1);
    expect(maisProximo([], 0, 0, 5)).toBe(-1);
  });
  it("o alcance é inclusivo", () => {
    expect(maisProximo([{ x: 3, y: 4 }], 0, 0, 5)).toBe(0);
    expect(maisProximo([{ x: 3, y: 4 }], 0, 0, 4.99)).toBe(-1);
  });
  it("em empate de distância fica com o último (o desenhado por cima)", () => {
    expect(
      maisProximo(
        [
          { x: 1, y: 0 },
          { x: -1, y: 0 },
        ],
        0,
        0,
        5,
      ),
    ).toBe(1);
  });
});
