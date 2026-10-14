import { describe, expect, it } from "vitest";
import {
  CLASSES,
  classificar,
  contarPorClasse,
  type Filtro,
  filtrar,
  intervaloDeAnos,
  lerPlanetas,
  ordenar,
} from "../../src/lib/planetas";
import { ErroDados, type Planeta } from "../../src/lib/tipos";

const COLUNAS = ["nome", "ano", "periodo", "raio", "massa", "temperatura", "distancia"];

function bruto(linhas: unknown[]) {
  return { colunas: COLUNAS, linhas };
}

function planeta(parcial: Partial<Planeta> & { nome: string }): Planeta {
  return {
    ano: 2020,
    periodo: 10,
    raio: 2.5,
    massa: null,
    temperatura: null,
    distancia: null,
    classe: "netuno",
    ...parcial,
  };
}

const TODAS = new Set(CLASSES.map((c) => c.id));
const SEM_FILTRO: Filtro = { classes: TODAS, anoMinimo: 0, soComMassa: false, busca: "" };

describe("classificar", () => {
  it("usa as fronteiras do pipeline, com limite inferior inclusivo", () => {
    expect(classificar(0.3)).toBe("terra");
    expect(classificar(1.249)).toBe("terra");
    expect(classificar(1.25)).toBe("super-terra");
    expect(classificar(1.999)).toBe("super-terra");
    expect(classificar(2)).toBe("netuno");
    expect(classificar(5.99)).toBe("netuno");
    expect(classificar(6)).toBe("jupiter");
    expect(classificar(14.99)).toBe("jupiter");
    expect(classificar(15)).toBe("super-jupiter");
    expect(classificar(32.6)).toBe("super-jupiter");
  });
});

describe("lerPlanetas", () => {
  it("converte linhas em planetas tipados, com classe", () => {
    const [p] = lerPlanetas(bruto([["Kepler-1 b", 2010, 2.47, 1.3, 8.1, 1500, 210.5]]));
    expect(p).toEqual({
      nome: "Kepler-1 b",
      ano: 2010,
      periodo: 2.47,
      raio: 1.3,
      massa: 8.1,
      temperatura: 1500,
      distancia: 210.5,
      classe: "super-terra",
    });
  });

  it("aceita massa, temperatura e distância ausentes", () => {
    const [p] = lerPlanetas(bruto([["X b", 2010, 2, 1, null, null, null]]));
    expect(p?.massa).toBeNull();
    expect(p?.temperatura).toBeNull();
    expect(p?.distancia).toBeNull();
  });

  it.each([
    ["não é objeto", null],
    ["sem linhas", { colunas: COLUNAS }],
    ["sem colunas", { linhas: [] }],
    ["colunas fora de ordem", { colunas: [...COLUNAS].reverse(), linhas: [] }],
    ["linha que não é lista", bruto(["x"])],
    ["nome que não é texto", bruto([[1, 2010, 2, 1, null, null, null]])],
    ["período ausente", bruto([["a", 2010, null, 1, null, null, null]])],
    ["raio ausente", bruto([["a", 2010, 2, null, null, null, null]])],
    ["ano ausente", bruto([["a", null, 2, 1, null, null, null]])],
    ["período zero", bruto([["a", 2010, 0, 1, null, null, null]])],
    ["raio negativo", bruto([["a", 2010, 2, -1, null, null, null]])],
    ["NaN", bruto([["a", 2010, Number.NaN, 1, null, null, null]])],
  ])("rejeita %s com ErroDados", (_nome, entrada) => {
    expect(() => lerPlanetas(entrada)).toThrow(ErroDados);
  });

  it("aceita lista vazia", () => {
    expect(lerPlanetas(bruto([]))).toEqual([]);
  });
});

describe("filtrar", () => {
  const todos = [
    planeta({ nome: "Alfa b", classe: "terra", ano: 2005, massa: 1 }),
    planeta({ nome: "Beta b", classe: "netuno", ano: 2015 }),
    planeta({ nome: "Ção c", classe: "jupiter", ano: 2020, massa: 300 }),
  ];

  it("sem filtro devolve tudo", () => {
    expect(filtrar(todos, SEM_FILTRO)).toHaveLength(3);
  });

  it("filtra por classe", () => {
    const r = filtrar(todos, { ...SEM_FILTRO, classes: new Set(["terra", "jupiter"] as const) });
    expect(r.map((p) => p.nome)).toEqual(["Alfa b", "Ção c"]);
    expect(filtrar(todos, { ...SEM_FILTRO, classes: new Set() })).toEqual([]);
  });

  it("filtra por ano mínimo, inclusivo", () => {
    expect(filtrar(todos, { ...SEM_FILTRO, anoMinimo: 2015 }).map((p) => p.nome)).toEqual(["Beta b", "Ção c"]);
  });

  it("filtra só os de massa medida", () => {
    expect(filtrar(todos, { ...SEM_FILTRO, soComMassa: true }).map((p) => p.nome)).toEqual(["Alfa b", "Ção c"]);
  });

  it("busca ignora maiúsculas e acentos", () => {
    expect(filtrar(todos, { ...SEM_FILTRO, busca: "CAO" }).map((p) => p.nome)).toEqual(["Ção c"]);
    expect(filtrar(todos, { ...SEM_FILTRO, busca: "  beta " }).map((p) => p.nome)).toEqual(["Beta b"]);
    expect(filtrar(todos, { ...SEM_FILTRO, busca: "zzz" })).toEqual([]);
  });

  it("combina os filtros", () => {
    const r = filtrar(todos, { classes: TODAS, anoMinimo: 2010, soComMassa: true, busca: "c" });
    expect(r.map((p) => p.nome)).toEqual(["Ção c"]);
  });
});

describe("contarPorClasse", () => {
  it("conta cada classe, incluindo as vazias", () => {
    const c = contarPorClasse([
      planeta({ nome: "a", classe: "terra" }),
      planeta({ nome: "b", classe: "terra" }),
      planeta({ nome: "c" }),
    ]);
    expect(c).toEqual({ terra: 2, "super-terra": 0, netuno: 1, jupiter: 0, "super-jupiter": 0 });
  });
});

describe("intervaloDeAnos", () => {
  it("devolve o menor e o maior ano", () => {
    expect(
      intervaloDeAnos([
        planeta({ nome: "a", ano: 2010 }),
        planeta({ nome: "b", ano: 1995 }),
        planeta({ nome: "c", ano: 2024 }),
      ]),
    ).toEqual([1995, 2024]);
  });
});

describe("ordenar", () => {
  const lista = [
    planeta({ nome: "P10", raio: 3, massa: null }),
    planeta({ nome: "P2", raio: 1, massa: 5 }),
    planeta({ nome: "P1", raio: 2, massa: 1 }),
  ];

  it("ordena números nos dois sentidos", () => {
    expect(ordenar(lista, "raio", "asc").map((p) => p.nome)).toEqual(["P2", "P1", "P10"]);
    expect(ordenar(lista, "raio", "desc").map((p) => p.nome)).toEqual(["P10", "P1", "P2"]);
  });

  it("ordena nomes de forma natural (P2 antes de P10)", () => {
    expect(ordenar(lista, "nome", "asc").map((p) => p.nome)).toEqual(["P1", "P2", "P10"]);
    expect(ordenar(lista, "nome", "desc").map((p) => p.nome)).toEqual(["P10", "P2", "P1"]);
  });

  it("valores ausentes ficam no fim em qualquer direção", () => {
    expect(ordenar(lista, "massa", "asc").map((p) => p.nome)).toEqual(["P1", "P2", "P10"]);
    expect(ordenar(lista, "massa", "desc").map((p) => p.nome)).toEqual(["P2", "P1", "P10"]);
  });

  it("não altera a lista original", () => {
    const copia = [...lista];
    ordenar(lista, "raio", "asc");
    expect(lista).toEqual(copia);
  });

  it("ausentes entre si ficam como estão", () => {
    const r = ordenar([planeta({ nome: "a" }), planeta({ nome: "b" })], "massa", "asc");
    expect(r.map((p) => p.nome)).toEqual(["a", "b"]);
  });
});
