import { describe, expect, it } from "vitest";
import { LAMBDA_H_ALFA_NM, M_JUPITER, M_TERRA } from "../../src/lib/fisica/constantes";
import { densidadeGcm3 } from "../../src/lib/fisica/planeta";
import { deslocamentoDoppler } from "../../src/lib/fisica/velocidade-radial";
import {
  comValorVR,
  curvaVRParaCsv,
  densidadeDoPlaneta,
  LIMITES_VR,
  lerSimulacaoVR,
  lerVelocidades,
  lerVR,
  PADRAO_VR,
  type PlanetaComMassa,
  paraParametrosVR,
  posicoesNaOrbita,
  type SimulacaoVR,
  simulacaoDoPlanetaVR,
  simularCurvaVR,
  velocidadeNaFase,
} from "../../src/lib/simulacao-velocidade-radial";
import { ErroDados } from "../../src/lib/tipos";

const MJUP = M_JUPITER / M_TERRA;
const jupiterNoSol: SimulacaoVR = {
  ...PADRAO_VR,
  massaPlanetaMterra: MJUP,
  periodoDias: 4332.59,
  massaEstrelaMsol: 1,
};

function semNulos(p: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(Object.entries(p).filter((e): e is [string, string] => e[1] !== null));
}

describe("leitura", () => {
  it("51 Pegasi b (Butler et al. 2006): K = 55,9 m/s e massa mínima de volta em 0,468 Mjup", () => {
    const l = lerVR(PADRAO_VR);
    expect(Math.abs(l.semiAmplitudeMs / 55.9 - 1)).toBeLessThan(0.03);
    expect(l.massaMinimaMterra / MJUP).toBeCloseTo(0.468, 2);
    expect(l.fatorDaInclinacao).toBeCloseTo(1, 12);
  });

  it("Júpiter faz o Sol balançar 12,5 m/s, a 5,2 UA", () => {
    const l = lerVR(jupiterNoSol);
    expect(l.semiAmplitudeMs).toBeCloseTo(12.45, 1);
    // NASA Planetary Fact Sheet: semi-eixo de Júpiter = 5,2038 UA.
    expect(l.semiEixoUA).toBeCloseTo(5.204, 2);
  });

  it("com a órbita inclinada, K cai por sin i e só se deduz m·sin i", () => {
    const de30 = lerVR({ ...jupiterNoSol, inclinacaoGraus: 30 });
    expect(de30.semiAmplitudeMs).toBeCloseTo(lerVR(jupiterNoSol).semiAmplitudeMs / 2, 6);
    expect(de30.massaMinimaMterra / MJUP).toBeCloseTo(0.5, 2);
    expect(de30.fatorDaInclinacao).toBeCloseTo(2, 12);
  });

  it("o deslocamento de H-alfa é λ·K/c, em picômetros", () => {
    const l = lerVR(PADRAO_VR);
    expect(l.deslocamentoHalfaPm).toBeCloseTo(deslocamentoDoppler(LAMBDA_H_ALFA_NM, l.semiAmplitudeMs) * 1000, 12);
    // A milésima parte da luz desloca a linha em um milésimo do comprimento de onda.
    expect(deslocamentoDoppler(LAMBDA_H_ALFA_NM, 299_792.458)).toBeCloseTo(LAMBDA_H_ALFA_NM / 1000, 12);
    expect(() => deslocamentoDoppler(0, 1)).toThrow("comprimentoDeOnda");
  });
});

describe("URL", () => {
  it("sem parâmetros, é o padrão; e o padrão não aparece na URL", () => {
    expect(lerSimulacaoVR({})).toEqual(PADRAO_VR);
    expect(semNulos(paraParametrosVR(PADRAO_VR))).toEqual({});
  });

  it("vai e volta, e traz para dentro da faixa", () => {
    const s = { ...PADRAO_VR, excentricidade: 0.3, omegaGraus: 45, inclinacaoGraus: 60, ruidoMs: 5, semente: 3 };
    const p = semNulos(paraParametrosVR(s));
    expect(p).toEqual({ e: "0.3", w: "45", i: "60", ruido: "5", semente: "3" });
    expect(lerSimulacaoVR(p)).toEqual(s);
    expect(lerSimulacaoVR({ e: "2", mp: "-3" }).excentricidade).toBe(LIMITES_VR.excentricidade.max);
    expect(lerSimulacaoVR({ mp: "-3" }).massaPlanetaMterra).toBe(LIMITES_VR.massaPlanetaMterra.min);
    expect(comValorVR(PADRAO_VR, "omegaGraus", Number.NaN)).toBe(PADRAO_VR);
  });
});

describe("curva", () => {
  it("órbita circular: senoide de amplitude K que fecha no periastro seguinte", () => {
    const curva = simularCurvaVR(PADRAO_VR, 201);
    const K = lerVR(PADRAO_VR).semiAmplitudeMs;
    const vs = curva.modelo.map((p) => p.velocidadeMs);
    expect(Math.max(...vs)).toBeCloseTo(K, 1);
    expect(Math.min(...vs)).toBeCloseTo(-K, 1);
    expect(curva.modelo[0]?.velocidadeMs).toBeCloseTo(curva.modelo.at(-1)?.velocidadeMs ?? Number.NaN, 6);
    expect(curva.modelo[0]?.fase).toBe(0);
    expect(curva.modelo.at(-1)?.fase).toBe(1);
    expect(curva.medida).toBe(curva.modelo);
  });

  it("velocidadeNaFase bate com a curva", () => {
    const s = { ...PADRAO_VR, excentricidade: 0.5, omegaGraus: 30 };
    const K = lerVR(s).semiAmplitudeMs;
    const curva = simularCurvaVR(s, 11);
    expect(curva.modelo[3]?.velocidadeMs).toBeCloseTo(velocidadeNaFase(s, K, 0.3), 9);
  });

  it("o ruído tem a semente e o desvio pedidos", () => {
    const s = { ...PADRAO_VR, ruidoMs: 10 };
    const a = simularCurvaVR(s, 3000);
    expect(a.medida).toEqual(simularCurvaVR(s, 3000).medida);
    expect(a.medida).not.toEqual(simularCurvaVR({ ...s, semente: 2 }, 3000).medida);
    const residuos = a.medida.map((p, i) => p.velocidadeMs - (a.modelo[i]?.velocidadeMs ?? 0));
    const desvio = Math.sqrt(residuos.reduce((x, y) => x + y * y, 0) / residuos.length);
    expect(desvio).toBeGreaterThan(9.5);
    expect(desvio).toBeLessThan(10.5);
  });

  it("rejeita poucos pontos", () => {
    expect(() => simularCurvaVR(PADRAO_VR, 1)).toThrow("pontos");
    expect(() => simularCurvaVR(PADRAO_VR, 2.5)).toThrow("pontos");
  });

  it("exporta CSV com fase, tempo em dias e as duas velocidades", () => {
    const s = { ...PADRAO_VR, ruidoMs: 3 };
    const csv = curvaVRParaCsv(s, simularCurvaVR(s, 3));
    const [cabecalho, primeira, segunda, terceira, fim] = csv.split("\n");
    expect(cabecalho).toBe("fase,tempo_dias,velocidade_medida_ms,velocidade_modelo_ms");
    expect(primeira?.startsWith("0.00000,0.000000,")).toBe(true);
    expect(segunda?.startsWith(`0.50000,${(s.periodoDias / 2).toFixed(6)},`)).toBe(true);
    expect(terceira?.startsWith(`1.00000,${s.periodoDias.toFixed(6)},`)).toBe(true);
    expect(fim).toBe("");
  });
});

describe("posições na órbita", () => {
  it("estrela e planeta ficam em lados opostos do centro de massa, na razão das massas", () => {
    const s = { ...jupiterNoSol, excentricidade: 0.3, omegaGraus: 40 };
    for (const fase of [0, 0.2, 0.55, 0.9]) {
      const { planeta, estrela } = posicoesNaOrbita(s, fase);
      const razao = Math.hypot(estrela.x, estrela.z) / Math.hypot(planeta.x, planeta.z);
      expect(razao).toBeCloseTo((MJUP * M_TERRA) / 1.98841e30, 6);
      expect(Math.sign(estrela.x)).toBe(-Math.sign(planeta.x));
    }
  });

  it("no periastro a separação é a(1 − e), e no apoastro a(1 + e)", () => {
    const s = { ...jupiterNoSol, excentricidade: 0.4 };
    const a = lerVR(s).semiEixoUA;
    const separacao = (fase: number) => {
      const { planeta, estrela } = posicoesNaOrbita(s, fase);
      return Math.hypot(planeta.x - estrela.x, planeta.z - estrela.z);
    };
    expect(separacao(0)).toBeCloseTo(a * 0.6, 6);
    expect(separacao(0.5)).toBeCloseTo(a * 1.4, 6);
  });

  it("vista de cima (i pequena), quase nada fica na linha de visada", () => {
    const { planeta } = posicoesNaOrbita({ ...PADRAO_VR, inclinacaoGraus: 1 }, 0);
    const deLado = posicoesNaOrbita(PADRAO_VR, 0).planeta;
    expect(Math.abs(planeta.z)).toBeLessThan(Math.abs(deLado.z) * 0.02);
  });
});

describe("planetas do catálogo", () => {
  const bruto = {
    colunas: ["nome", "periodo", "massa", "tipo_massa", "massa_estrela", "excentricidade", "raio"],
    linhas: [
      ["Massa verdadeira b", 2.218575, 360.2, "verdadeira", 0.81, 0, 12.7],
      ["Massa mínima b", 61.1166, 723.2, "minima", 0.32, 0.0324, null],
      ["Sem e b", 10, 5, "minima", 1, null, null],
    ],
  };

  it("lê massa, tipo, excentricidade e raio", () => {
    const [hd, gj, sem] = lerVelocidades(bruto);
    expect(hd).toEqual({
      nome: "Massa verdadeira b",
      periodoDias: 2.218575,
      massaMterra: 360.2,
      massaVerdadeira: true,
      massaEstrelaMsol: 0.81,
      excentricidade: 0,
      raioRterra: 12.7,
    });
    expect(gj?.massaVerdadeira).toBe(false);
    expect(gj?.raioRterra).toBeNull();
    expect(sem?.excentricidade).toBeNull();
  });

  it("rejeita formato e linhas inválidas", () => {
    expect(() => lerVelocidades(null)).toThrow(ErroDados);
    expect(() => lerVelocidades({ colunas: ["nome"], linhas: [] })).toThrow("fora do formato");
    expect(() => lerVelocidades({ ...bruto, linhas: [3] })).toThrow("linha inválida");
    expect(() => lerVelocidades({ ...bruto, linhas: [["X b", 1, 1, "estimada", 1, 0, null]] })).toThrow("X b");
    expect(() => lerVelocidades({ ...bruto, linhas: [["Y b", 1, 1, "minima", 1, 1.5, null]] })).toThrow("Y b");
    expect(() => lerVelocidades({ ...bruto, linhas: [["Z b", 1, 0, "minima", 1, 0, null]] })).toThrow("Z b");
  });

  it("carregar um planeta põe a órbita de lado, ω no padrão, e mantém o ruído", () => {
    const [, gj, sem] = lerVelocidades(bruto) as PlanetaComMassa[];
    if (!gj || !sem) throw new Error("sem planetas");
    const atual = { ...PADRAO_VR, inclinacaoGraus: 30, omegaGraus: 10, ruidoMs: 4, semente: 9 };
    expect(simulacaoDoPlanetaVR(gj, atual)).toEqual({
      ...atual,
      inclinacaoGraus: 90,
      omegaGraus: PADRAO_VR.omegaGraus,
      massaPlanetaMterra: 723.2,
      periodoDias: 61.1166,
      massaEstrelaMsol: 0.32,
      excentricidade: 0.0324,
    });
    expect(simulacaoDoPlanetaVR(sem, atual).excentricidade).toBe(0);
  });

  it("massa e raio dão a densidade; com massa mínima, ela é um piso", () => {
    const [hd, gj] = lerVelocidades(bruto) as PlanetaComMassa[];
    if (!hd || !gj) throw new Error("sem planetas");
    const d = densidadeDoPlaneta(hd);
    expect(d?.gcm3).toBeCloseTo(densidadeGcm3(360.2, 12.7), 12);
    expect(d?.piso).toBe(false);
    expect(densidadeDoPlaneta(gj)).toBeNull();
    expect(densidadeDoPlaneta({ ...gj, raioRterra: 10 })?.piso).toBe(true);
  });
});

describe("contratos que a interface usa", () => {
  it("faixas: rótulos e URLs únicos, escala log só nas que cobrem ordens de grandeza, e as unidades mostradas", () => {
    const limites = Object.values(LIMITES_VR);
    expect(new Set(limites.map((l) => l.url)).size).toBe(limites.length);
    expect(new Set(limites.map((l) => l.rotulo)).size).toBe(limites.length);
    for (const l of limites) {
      expect(l.rotulo.length).toBeGreaterThan(3);
      expect(l.log).toBe(l.min > 0 && l.max / l.min >= 100);
    }
    expect(Object.fromEntries(Object.entries(LIMITES_VR).map(([k, l]) => [k, l.unidade]))).toEqual({
      massaPlanetaMterra: "× Terra",
      periodoDias: "dias",
      massaEstrelaMsol: "× Sol",
      excentricidade: "",
      omegaGraus: "°",
      inclinacaoGraus: "°",
      ruidoMs: "m/s",
    });
  });

  it("o ruído é exatamente ruído × normal sorteada com a semente, somado ao modelo", async () => {
    const { aleatorio, gaussiano } = await import("../../src/lib/aleatorio");
    const s = { ...PADRAO_VR, ruidoMs: 7, semente: 5 };
    const curva = simularCurvaVR(s, 5);
    const sortear = aleatorio(5);
    curva.medida.forEach((p, i) => {
      expect(p.velocidadeMs - (curva.modelo[i]?.velocidadeMs ?? 0)).toBeCloseTo(7 * gaussiano(sortear), 10);
    });
    expect(simularCurvaVR(PADRAO_VR, 2).modelo).toHaveLength(2);
  });

  it("ω gira a órbita: com ω = 90° o planeta começa na linha de visada; com ω = 0°, de lado", () => {
    const a90 = posicoesNaOrbita({ ...PADRAO_VR, omegaGraus: 90 }, 0).planeta;
    const a0 = posicoesNaOrbita({ ...PADRAO_VR, omegaGraus: 0 }, 0).planeta;
    const r = Math.hypot(a0.x, a0.z);
    expect(a90.x).toBeCloseTo(0, 9);
    expect(a90.z).toBeCloseTo(r, 9);
    expect(a0.z).toBeCloseTo(0, 9);
    const a30 = posicoesNaOrbita({ ...PADRAO_VR, omegaGraus: 30 }, 0).planeta;
    expect(a30.x).toBeCloseTo(r * Math.cos(Math.PI / 6), 9);
    expect(a30.z).toBeCloseTo(r * Math.sin(Math.PI / 6), 9);
  });

  it("cada campo inválido do velocidades.json é recusado, com a origem do erro", () => {
    const colunas = ["nome", "periodo", "massa", "tipo_massa", "massa_estrela", "excentricidade", "raio"];
    const ok: unknown[] = ["A b", 10, 5, "minima", 1, 0.1, null];
    const tentar = (linha: unknown[]) => () => lerVelocidades({ colunas, linhas: [linha] });
    expect(lerVelocidades({ colunas, linhas: [ok] })).toHaveLength(1);
    for (const [i, ruim] of [
      [0, 3],
      [1, null],
      [1, "10"],
      [1, Number.POSITIVE_INFINITY],
      [2, -5],
      [4, null],
      [5, -0.1],
      [5, 1],
      [5, "0.1"],
    ] as const) {
      const linha = [...ok];
      linha[i] = ruim;
      expect(tentar(linha), `coluna ${i} = ${String(ruim)}`).toThrow(ErroDados);
    }
    expect(lerVelocidades({ colunas, linhas: [["B b", 10, 5, "minima", 1, 0.1, "grande"]] })[0]?.raioRterra).toBeNull();
    expect(() => lerVelocidades({ colunas: [...colunas.slice(0, 6), "outra"], linhas: [] })).toThrow("fora do formato");
    try {
      lerVelocidades({ colunas, linhas: [7] });
    } catch (e) {
      expect((e as ErroDados).origem).toBe("velocidades");
    }
  });
});
