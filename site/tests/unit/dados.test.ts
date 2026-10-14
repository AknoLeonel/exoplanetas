import { describe, expect, it } from "vitest";
import { lerDescobertas, lerMetricas, nomeDaVariavel } from "../../src/lib/dados";
import { ErroDados } from "../../src/lib/tipos";

const metricas = {
  dados: {},
  descobertas: {},
  deserto_netunos_quentes: {},
  parecidos_com_a_terra_mais_proximos: [],
  modelo: { resultados: {}, importancia_permutacao: {} },
};

describe("lerDescobertas", () => {
  it("aceita séries do tamanho da lista de anos", () => {
    const d = { anos: [2000, 2001], metodos: { Transit: [1, 2] }, nomes: { Transit: "Trânsito" } };
    expect(lerDescobertas(d)).toBe(d);
  });

  it.each([
    ["nulo", null],
    ["lista", []],
    ["sem anos", { metodos: {}, nomes: {} }],
    ["sem métodos", { anos: [], nomes: {} }],
    ["sem nomes", { anos: [], metodos: {} }],
    ["série menor que os anos", { anos: [1, 2], metodos: { a: [1] }, nomes: {} }],
    ["série que não é lista", { anos: [1], metodos: { a: 1 }, nomes: {} }],
  ])("rejeita %s", (_n, entrada) => {
    expect(() => lerDescobertas(entrada)).toThrow(ErroDados);
  });
});

describe("lerMetricas", () => {
  it("aceita o formato do pipeline", () => {
    expect(lerMetricas(metricas)).toBe(metricas);
  });

  it.each([
    ["nulo", null],
    ["lista", []],
    ["sem dados", { ...metricas, dados: undefined }],
    ["sem descobertas", { ...metricas, descobertas: undefined }],
    ["sem deserto", { ...metricas, deserto_netunos_quentes: undefined }],
    ["parecidos que não é lista", { ...metricas, parecidos_com_a_terra_mais_proximos: {} }],
    ["sem modelo", { ...metricas, modelo: undefined }],
    ["modelo sem resultados", { ...metricas, modelo: { importancia_permutacao: {} } }],
    ["modelo sem importância", { ...metricas, modelo: { resultados: {} } }],
  ])("rejeita %s", (_n, entrada) => {
    expect(() => lerMetricas(entrada)).toThrow(ErroDados);
  });
});

describe("nomeDaVariavel", () => {
  it("traduz as colunas do pipeline", () => {
    expect(nomeDaVariavel("log_massa")).toBe("Massa do planeta");
    expect(nomeDaVariavel("st_met")).toBe("Metalicidade da estrela");
  });
  it("mantém o que não conhece", () => {
    expect(nomeDaVariavel("outra_coluna")).toBe("outra_coluna");
  });
});
