// @vitest-environment node
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  comValorML,
  entradaDoPlaneta,
  extrapolacao,
  intervaloDoRaio,
  LIMITES_ML,
  lerEntradaML,
  lerML,
  lerModelo,
  lerPlanetasDoTreino,
  type ModeloRaio,
  NOMES_DAS_VARIAVEIS,
  PADRAO_ML,
  paraParametrosML,
  prever,
  VARIAVEIS,
  vetorDaEntrada,
} from "../../src/lib/modelo-raio";
import { ErroDados } from "../../src/lib/tipos";

const ARQUIVO = new URL("../../public/dados/modelo-raio.json", import.meta.url);
const bruto = JSON.parse(readFileSync(ARQUIVO, "utf-8"));
const modelo = lerModelo(bruto);
const planetas = lerPlanetasDoTreino(
  JSON.parse(readFileSync(new URL("../../public/dados/modelo-planetas.json", import.meta.url), "utf-8")),
);

/** Limite de tamanho do modelo: passar disso pede menos árvores ou outro formato. */
const LIMITE_DO_MODELO_KB = 600;

describe("contrato com o Python", () => {
  it("a previsão do navegador bate com a do scikit-learn nas entradas de verificação", () => {
    expect(modelo.verificacao.entradas.length).toBeGreaterThan(10);
    modelo.verificacao.entradas.forEach((x, i) => {
      const esperada = modelo.verificacao.previsoes[i] ?? Number.NaN;
      // Os valores das folhas vão com 9 algarismos: o erro acumulado nas 400 árvores fica bem abaixo de 1e-6.
      expect(Math.abs(prever(modelo, x).logRaio - esperada)).toBeLessThan(1e-6);
    });
  });

  it(`o modelo cabe no limite de ${LIMITE_DO_MODELO_KB} KB`, () => {
    expect(statSync(ARQUIVO).size / 1024).toBeLessThan(LIMITE_DO_MODELO_KB);
  });

  it("os planetas do treino são os da validação", () => {
    expect(planetas).toHaveLength(modelo.validacao.planetas);
  });
});

describe("explicação de cada previsão", () => {
  it("a base mais as contribuições dá exatamente a previsão", () => {
    for (const x of modelo.verificacao.entradas.slice(0, 8)) {
      const p = prever(modelo, x);
      const soma = p.contribuicoes.reduce((a, b) => a + b, p.logBase);
      expect(soma).toBeCloseTo(p.logRaio, 9);
      expect(p.contribuicoes).toHaveLength(VARIAVEIS.length);
    }
  });

  it("a massa é a variável que mais pesa num Júpiter e numa super-Terra", () => {
    for (const massa of [300, 5]) {
      const p = prever(modelo, vetorDaEntrada({ ...PADRAO_ML, massaMterra: massa, periodoDias: 10, insolacao: 100 }));
      const absolutas = p.contribuicoes.map(Math.abs);
      expect(absolutas.indexOf(Math.max(...absolutas))).toBe(VARIAVEIS.indexOf("log_massa"));
    }
  });

  it("um Júpiter quente sai bem maior que uma super-Terra", () => {
    const jupiter = prever(modelo, vetorDaEntrada({ ...PADRAO_ML, massaMterra: 318, periodoDias: 3, insolacao: 1000 }));
    const superTerra = prever(
      modelo,
      vetorDaEntrada({ ...PADRAO_ML, massaMterra: 5, periodoDias: 10, insolacao: 100 }),
    );
    expect(10 ** jupiter.logRaio).toBeGreaterThan(8);
    expect(10 ** superTerra.logRaio).toBeLessThan(3);
  });

  it("valor ausente segue o lado aprendido na divisão", () => {
    const m: ModeloRaio = {
      ...modelo,
      base: 0,
      arvores: [
        {
          variavel: [0, -1, -1],
          limiar: [1, 0, 0],
          esquerda: [1, 0, 0],
          direita: [2, 0, 0],
          ausenteEsquerda: [true, false, false],
          valor: [0.5, 0, 1],
        },
      ],
    };
    const x = (v: number) => [v, 0, 0, 0, 0, 0];
    expect(prever(m, x(0)).logRaio).toBe(0);
    expect(prever(m, x(2)).logRaio).toBe(1);
    expect(prever(m, x(Number.NaN)).logRaio).toBe(0);
    expect(prever(m, x(2)).contribuicoes[0]).toBe(0.5);
    expect(prever(m, x(2)).logBase).toBe(0.5);
    expect(() => prever(m, [1])).toThrow(RangeError);
  });
});

describe("incerteza e extrapolação", () => {
  it("o intervalo de 80% contém a previsão e usa a faixa de massa certa", () => {
    const { cortesLogMassa, faixas } = modelo.intervalo;
    expect(faixas).toHaveLength(cortesLogMassa.length + 1);
    const logRaio = 0.3;
    const abaixo = intervaloDoRaio(modelo, (cortesLogMassa[0] ?? 0) - 1, logRaio);
    const acima = intervaloDoRaio(modelo, (cortesLogMassa.at(-1) ?? 0) + 1, logRaio);
    expect(abaixo.inferior).toBeCloseTo(10 ** (logRaio + (faixas[0]?.inferior ?? 0)), 12);
    expect(acima.superior).toBeCloseTo(10 ** (logRaio + (faixas.at(-1)?.superior ?? 0)), 12);
    for (const i of [abaixo, acima]) {
      expect(i.inferior).toBeLessThan(10 ** logRaio);
      expect(i.superior).toBeGreaterThan(10 ** logRaio);
    }
    // No corte exato, a faixa é a de cima (como o searchsorted do Python, side="right").
    const corte = cortesLogMassa[0] ?? 0;
    expect(intervaloDoRaio(modelo, corte, 0).inferior).toBeCloseTo(10 ** (faixas[1]?.inferior ?? 0), 12);
    for (const f of faixas) expect(f.cobertura).toBeGreaterThan(0.75);
  });

  it("dentro, na borda (fora dos percentis 1–99) e fora do treino", () => {
    const f = modelo.faixas.st_teff;
    const x = (teff: number) => vetorDaEntrada({ ...PADRAO_ML, teffK: teff });
    expect(extrapolacao(modelo, x((f.p01 + f.p99) / 2)).st_teff).toBe("dentro");
    expect(extrapolacao(modelo, x((f.minimo + f.p01) / 2)).st_teff).toBe("borda");
    expect(extrapolacao(modelo, x(f.maximo + 100)).st_teff).toBe("fora");
    expect(extrapolacao(modelo, x(f.minimo - 100)).st_teff).toBe("fora");
    expect(extrapolacao(modelo, [Number.NaN, 0, 0, 5000, 1, 0]).log_massa).toBe("fora");
  });

  it("a Terra fica na borda do treino no período (o treino é quase todo de órbitas curtas)", () => {
    const e = extrapolacao(modelo, vetorDaEntrada(PADRAO_ML));
    expect(e.log_periodo).not.toBe("dentro");
  });
});

describe("leitores e URL", () => {
  it("recusa modelo fora do formato", () => {
    expect(() => lerModelo(null)).toThrow(ErroDados);
    expect(() => lerModelo({ ...bruto, variaveis: ["x"] })).toThrow("variáveis");
    expect(() => lerModelo({ ...bruto, arvores: [] })).toThrow("árvores");
    const arvore = bruto.arvores[0];
    expect(() => lerModelo({ ...bruto, arvores: [{ ...arvore, valor: ["a"] }] })).toThrow("árvore 0");
    expect(() => lerModelo({ ...bruto, arvores: [{ ...arvore, valor: [1] }] })).toThrow("incompleta");
    expect(() => lerModelo({ ...bruto, arvores: [{ ...arvore, esquerda: arvore.esquerda.map(() => 0) }] })).toThrow(
      "inválido",
    );
    expect(() => lerModelo({ ...bruto, intervalo: { ...bruto.intervalo, faixas: [] } })).toThrow("intervalo");
    expect(() => lerModelo({ ...bruto, faixas: { ...bruto.faixas, st_met: {} } })).toThrow("st_met");
    expect(() => lerModelo({ ...bruto, validacao: {} })).toThrow("validação");
    expect(() => lerModelo({ ...bruto, verificacao: { entradas: [[1]], previsoes: [1] } })).toThrow("verificação");
  });

  it("lê os planetas do treino e recusa linhas inválidas", () => {
    const p = planetas[0];
    expect(p?.raioRterra).toBeGreaterThan(0);
    const colunas = ["nome", "massa", "periodo", "insolacao", "st_teff", "st_mass", "st_met", "raio"];
    expect(() => lerPlanetasDoTreino({ colunas: ["nome"], linhas: [] })).toThrow("fora do formato");
    expect(() => lerPlanetasDoTreino({ colunas, linhas: [["X b", 1, 1, 1, 5000, 1, 0, 0]] })).toThrow("X b");
    expect(() => lerPlanetasDoTreino({ colunas, linhas: [7] })).toThrow(ErroDados);
    expect(lerPlanetasDoTreino({ colunas, linhas: [["Y b", 1, 2, 3, 5000, 1, -0.2, 1.1]] })[0]?.metalicidade).toBe(
      -0.2,
    );
  });

  it("a entrada vai e volta pela URL, e o padrão é a Terra", () => {
    expect(lerEntradaML({})).toEqual(PADRAO_ML);
    expect(Object.values(paraParametrosML(PADRAO_ML)).every((v) => v === null)).toBe(true);
    const e = comValorML(PADRAO_ML, "massaMterra", 17);
    expect(lerEntradaML({ mp: paraParametrosML(e).mp ?? "" }).massaMterra).toBe(17);
    expect(comValorML(PADRAO_ML, "metalicidade", 9).metalicidade).toBe(LIMITES_ML.metalicidade.max);
  });

  it("carregar um planeta do treino copia os valores dele", () => {
    const p = planetas.find((x) => x.massaMterra > 100);
    if (!p) throw new Error("sem gigante no treino");
    const e = entradaDoPlaneta(p, PADRAO_ML);
    expect(e.massaMterra).toBe(p.massaMterra);
    expect(e.teffK).toBe(p.teffK);
    expect(e.metalicidade).toBe(p.metalicidade);
    expect(vetorDaEntrada(e)[0]).toBeCloseTo(Math.log10(p.massaMterra), 12);
  });
});

/** Cópia do JSON real com um campo trocado (caminho de chaves e índices). */
function trocar(caminho: (string | number)[], valor: unknown): unknown {
  const copia = structuredClone(bruto);
  let alvo = copia;
  for (const chave of caminho.slice(0, -1)) alvo = alvo[chave];
  alvo[caminho[caminho.length - 1] as string | number] = valor;
  return copia;
}

describe("cada condição do leitor do modelo", () => {
  it("a origem do erro é sempre modelo-raio", () => {
    try {
      lerModelo(null);
    } catch (e) {
      expect(e).toBeInstanceOf(ErroDados);
      expect((e as ErroDados).origem).toBe("modelo-raio");
      expect((e as ErroDados).message).toBe("modelo-raio.json: fora do formato esperado");
    }
    expect(() => lerModelo("texto")).toThrow("fora do formato esperado");
  });

  it.each([
    ["variáveis não é lista", ["variaveis"], "x", "variáveis diferentes"],
    ["variáveis a menos", ["variaveis"], VARIAVEIS.slice(0, 5), "variáveis diferentes"],
    ["variáveis fora de ordem", ["variaveis"], [...VARIAVEIS].reverse(), "variáveis diferentes"],
    ["base não numérica", ["base"], "1", "sem base"],
    ["base infinita", ["base"], Number.POSITIVE_INFINITY, "sem base"],
    ["árvores não é lista", ["arvores"], {}, "sem base"],
    ["árvore vazia", ["arvores", 0], null, "árvore 0 vazia"],
    ["variável não inteira", ["arvores", 0, "variavel", 0], 1.5, "árvore 0 fora do formato"],
    ["limiar não numérico", ["arvores", 0, "limiar", 0], "x", "árvore 0 fora do formato"],
    ["esquerda não inteira", ["arvores", 0, "esquerda", 0], 1.5, "árvore 0 fora do formato"],
    ["direita não inteira", ["arvores", 0, "direita", 0], 1.5, "árvore 0 fora do formato"],
    ["ausente não booleano", ["arvores", 0, "ausente_esquerda", 0], 1, "árvore 0 fora do formato"],
    ["valor não numérico", ["arvores", 0, "valor", 0], null, "árvore 0 fora do formato"],
    ["lista que não é lista", ["arvores", 0, "valor"], 3, "árvore 0 fora do formato"],
    ["variável negativa", ["arvores", 0, "variavel", 0], -2, "nó 0 inválido"],
    ["variável além das seis", ["arvores", 0, "variavel", 0], 6, "nó 0 inválido"],
    ["filho esquerdo antes do pai", ["arvores", 0, "esquerda", 0], 0, "nó 0 inválido"],
    ["filho direito antes do pai", ["arvores", 0, "direita", 0], 0, "nó 0 inválido"],
    ["filho esquerdo além da árvore", ["arvores", 0, "esquerda", 0], 9999, "nó 0 inválido"],
    ["filho direito além da árvore", ["arvores", 0, "direita", 0], 9999, "nó 0 inválido"],
    ["cortes não numéricos", ["intervalo", "cortes_log_massa", 0], "x", "intervalo fora do formato"],
    ["quantis não numéricos", ["intervalo", "quantis", 0], "x", "intervalo fora do formato"],
    ["três quantis", ["intervalo", "quantis"], [0.1, 0.5, 0.9], "intervalo fora do formato"],
    ["faixas não é lista", ["intervalo", "faixas"], {}, "intervalo fora do formato"],
    ["faixas a menos", ["intervalo", "faixas"], [], "intervalo fora do formato"],
    ["inferior não numérico", ["intervalo", "faixas", 0, "inferior"], "x", "faixa do intervalo inválida"],
    ["superior não numérico", ["intervalo", "faixas", 0, "superior"], "x", "faixa do intervalo inválida"],
    ["planetas não numérico", ["intervalo", "faixas", 0, "planetas"], "x", "faixa do intervalo inválida"],
    ["cobertura não numérica", ["intervalo", "faixas", 0, "cobertura"], "x", "faixa do intervalo inválida"],
    ["inferior acima do superior", ["intervalo", "faixas", 0, "inferior"], 9, "faixa do intervalo inválida"],
    ["faixa sem variável", ["faixas", "log_massa"], undefined, "faixa de log_massa"],
    ["mínimo não numérico", ["faixas", "st_teff", "minimo"], "x", "faixa de st_teff"],
    ["p01 não numérico", ["faixas", "st_teff", "p01"], "x", "faixa de st_teff"],
    ["p99 não numérico", ["faixas", "st_teff", "p99"], "x", "faixa de st_teff"],
    ["máximo não numérico", ["faixas", "st_teff", "maximo"], "x", "faixa de st_teff"],
    ["sem validação", ["validacao"], null, "validação fora do formato"],
    ["método não é texto", ["validacao", "metodo"], 3, "validação fora do formato"],
    ["planetas não numérico", ["validacao", "planetas"], "x", "validação fora do formato"],
    ["erro não numérico", ["validacao", "erro_percentual_mediano"], "x", "validação fora do formato"],
    ["dentro de 20% não numérico", ["validacao", "dentro_de_20pct"], "x", "validação fora do formato"],
    ["entradas não é lista", ["verificacao", "entradas"], {}, "verificação fora do formato"],
    ["entrada curta", ["verificacao", "entradas", 0], [1, 2], "verificação fora do formato"],
    ["entrada não numérica", ["verificacao", "entradas", 0, 0], "x", "verificação fora do formato"],
    ["previsão não numérica", ["verificacao", "previsoes", 0], "x", "verificação fora do formato"],
    ["previsões a menos", ["verificacao", "previsoes"], [1], "verificação fora do formato"],
  ] as const)("recusa %s", (_nome, caminho, valor, mensagem) => {
    expect(() => lerModelo(trocar([...caminho], valor))).toThrow(mensagem);
  });

  it("recusa árvore sem nós e listas de tamanhos diferentes", () => {
    const vazia = { variavel: [], limiar: [], esquerda: [], direita: [], ausente_esquerda: [], valor: [] };
    expect(() => lerModelo(trocar(["arvores", 0], vazia))).toThrow("árvore 0 incompleta");
    for (const campo of ["limiar", "esquerda", "direita", "ausente_esquerda", "valor"]) {
      const lista = structuredClone(bruto.arvores[0][campo]);
      lista.pop();
      expect(() => lerModelo(trocar(["arvores", 0, campo], lista)), campo).toThrow("árvore 0 incompleta");
    }
    expect(() => lerModelo(trocar(["arvores"], []))).toThrow("sem base ou sem árvores");
  });

  it("lê os campos com os nomes do site", () => {
    expect(modelo.base).toBe(bruto.base);
    expect(modelo.arvores).toHaveLength(bruto.arvores.length);
    expect(modelo.arvores[0]?.ausenteEsquerda).toEqual(bruto.arvores[0].ausente_esquerda);
    expect(modelo.intervalo.quantis).toEqual(bruto.intervalo.quantis);
    expect(modelo.intervalo.cortesLogMassa).toEqual(bruto.intervalo.cortes_log_massa);
    expect(modelo.intervalo.faixas[0]).toEqual(bruto.intervalo.faixas[0]);
    expect(modelo.faixas.st_teff).toEqual(bruto.faixas.st_teff);
    expect(modelo.validacao).toEqual({
      metodo: bruto.validacao.metodo,
      planetas: bruto.validacao.planetas,
      erroPercentualMediano: bruto.validacao.erro_percentual_mediano,
      dentroDe20pct: bruto.validacao.dentro_de_20pct,
    });
    expect(modelo.verificacao).toEqual(bruto.verificacao);
  });
});

describe("cada condição do leitor dos planetas do treino", () => {
  const colunas = ["nome", "massa", "periodo", "insolacao", "st_teff", "st_mass", "st_met", "raio"];
  const ok: unknown[] = ["A b", 2, 3, 4, 5000, 1.1, -0.2, 1.3];

  it("recusa formato", () => {
    for (const ruim of [null, { linhas: [] }, { colunas, linhas: {} }, { colunas: colunas.slice(1), linhas: [] }]) {
      expect(() => lerPlanetasDoTreino(ruim)).toThrow("modelo-planetas.json fora do formato esperado");
    }
    expect(() => lerPlanetasDoTreino({ colunas: [...colunas.slice(0, 7), "outra"], linhas: [] })).toThrow(
      "fora do formato",
    );
  });

  it.each([
    [0, 3],
    [1, 0],
    [2, -1],
    [3, "4"],
    [4, Number.NaN],
    [5, null],
    [6, "x"],
    [7, 0],
  ] as const)("recusa a coluna %i = %s", (i, ruim) => {
    const linha = [...ok];
    linha[i] = ruim;
    expect(() => lerPlanetasDoTreino({ colunas, linhas: [linha] })).toThrow("planeta inválido em modelo-planetas.json");
  });

  it("lê cada coluna no campo certo, com a origem do erro", () => {
    expect(lerPlanetasDoTreino({ colunas, linhas: [ok] })).toEqual([
      {
        nome: "A b",
        massaMterra: 2,
        periodoDias: 3,
        insolacao: 4,
        teffK: 5000,
        massaEstrelaMsol: 1.1,
        metalicidade: -0.2,
        raioRterra: 1.3,
      },
    ]);
    try {
      lerPlanetasDoTreino({ colunas, linhas: [7] });
    } catch (e) {
      expect((e as ErroDados).origem).toBe("modelo-planetas");
    }
  });
});

describe("contratos que a interface usa", () => {
  it("nomes de todas as variáveis, na ordem do pipeline", () => {
    expect(Object.keys(NOMES_DAS_VARIAVEIS)).toEqual([...VARIAVEIS]);
    expect(Object.values(NOMES_DAS_VARIAVEIS)).toEqual([
      "Massa do planeta",
      "Período",
      "Luz recebida",
      "Temperatura da estrela",
      "Massa da estrela",
      "Metalicidade da estrela",
    ]);
  });

  it("faixas dos controles: URLs e rótulos únicos, log só nas grandezas de várias ordens, unidades e o treino dentro", () => {
    const limites = Object.values(LIMITES_ML);
    expect(new Set(limites.map((l) => l.url)).size).toBe(limites.length);
    expect(new Set(limites.map((l) => l.rotulo)).size).toBe(limites.length);
    for (const l of limites) expect(l.log).toBe(l.min > 0 && l.max / l.min >= 100);
    expect(Object.fromEntries(Object.entries(LIMITES_ML).map(([k, l]) => [k, [l.url, l.unidade]]))).toEqual({
      massaMterra: ["mp", "× Terra"],
      periodoDias: ["p", "dias"],
      insolacao: ["s", "× Terra"],
      teffK: ["t", "K"],
      massaEstrelaMsol: ["ms", "× Sol"],
      metalicidade: ["fe", "dex"],
    });
    expect(LIMITES_ML.metalicidade.rotulo).toContain("[Fe/H]");
    // Os controles cobrem todo o treino: dá para chegar em qualquer planeta dele.
    for (const p of planetas) {
      expect(p.massaMterra).toBeGreaterThanOrEqual(LIMITES_ML.massaMterra.min);
      expect(p.massaMterra).toBeLessThanOrEqual(LIMITES_ML.massaMterra.max);
      expect(p.periodoDias).toBeLessThanOrEqual(LIMITES_ML.periodoDias.max);
      expect(p.insolacao).toBeLessThanOrEqual(LIMITES_ML.insolacao.max);
      expect(p.teffK).toBeGreaterThanOrEqual(LIMITES_ML.teffK.min);
      expect(p.teffK).toBeLessThanOrEqual(LIMITES_ML.teffK.max);
      expect(p.massaEstrelaMsol).toBeLessThanOrEqual(LIMITES_ML.massaEstrelaMsol.max);
      expect(Math.abs(p.metalicidade)).toBeLessThanOrEqual(LIMITES_ML.metalicidade.max);
    }
  });

  it("prever recusa vetor curto ou longo, com a mensagem", () => {
    expect(() => prever(modelo, [1, 2, 3, 4, 5])).toThrow("esperava 6 variáveis");
    expect(() => prever(modelo, [1, 2, 3, 4, 5, 6, 7])).toThrow("esperava 6 variáveis");
  });

  it("extrapolação nas bordas exatas: o mínimo e o máximo ainda contam como borda; p01 e p99, como dentro", () => {
    const f = modelo.faixas.st_met;
    const x = (met: number) => vetorDaEntrada({ ...PADRAO_ML, metalicidade: met });
    expect(extrapolacao(modelo, x(f.minimo)).st_met).toBe("borda");
    expect(extrapolacao(modelo, x(f.maximo)).st_met).toBe("borda");
    expect(extrapolacao(modelo, x(f.p01)).st_met).toBe("dentro");
    expect(extrapolacao(modelo, x(f.p99)).st_met).toBe("dentro");
  });

  it("modelo sem faixas de intervalo não inventa intervalo", () => {
    const semFaixas = { ...modelo, intervalo: { ...modelo.intervalo, cortesLogMassa: [], faixas: [] } };
    expect(() => intervaloDoRaio(semFaixas, 0, 0)).toThrow("modelo sem faixas de intervalo");
    expect(() => lerML(semFaixas, PADRAO_ML)).toThrow("modelo sem faixas de intervalo");
  });

  it("lerML junta previsão, intervalo da faixa, fatores e extrapolação", () => {
    const e = { ...PADRAO_ML, massaMterra: 50, periodoDias: 8, insolacao: 200 };
    const x = vetorDaEntrada(e);
    const p = prever(modelo, x);
    const l = lerML(modelo, e);
    expect(l.raio).toBeCloseTo(10 ** p.logRaio, 12);
    expect(l.raioBase).toBeCloseTo(10 ** p.logBase, 12);
    expect(l.fatores).toEqual(p.contribuicoes.map((c) => 10 ** c));
    expect(l.fatores.reduce((a, b) => a * b, l.raioBase)).toBeCloseTo(l.raio, 9);
    const faixa = modelo.intervalo.faixas[modelo.intervalo.cortesLogMassa.filter((c) => c <= (x[0] ?? 0)).length];
    expect(l.faixaDoIntervalo).toEqual(faixa);
    expect(l.inferior).toBeCloseTo(10 ** (p.logRaio + (faixa?.inferior ?? 0)), 12);
    expect(l.superior).toBeCloseTo(10 ** (p.logRaio + (faixa?.superior ?? 0)), 12);
    expect(l.extrapolacao).toEqual(extrapolacao(modelo, x));
    expect(l.validacao).toBe(modelo.validacao);
  });

  it("carregar um planeta copia todos os campos e traz para dentro da faixa", () => {
    const p = { ...(planetas[0] as (typeof planetas)[number]), massaMterra: 1e9, metalicidade: 0.31, teffK: 4321 };
    const e = entradaDoPlaneta(p, { ...PADRAO_ML, semente: 7 });
    expect(e).toEqual({
      massaMterra: LIMITES_ML.massaMterra.max,
      periodoDias: p.periodoDias,
      insolacao: p.insolacao,
      teffK: 4321,
      massaEstrelaMsol: p.massaEstrelaMsol,
      metalicidade: 0.31,
      semente: 7,
    });
  });
});
