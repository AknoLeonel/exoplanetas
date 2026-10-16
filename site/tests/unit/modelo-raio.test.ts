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
  lerModelo,
  lerPlanetasDoTreino,
  type ModeloRaio,
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
