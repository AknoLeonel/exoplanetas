import { describe, expect, it } from "vitest";
import { duracaoDoTransitoDias } from "../../src/lib/fisica/transito";
import {
  comValor,
  curvaParaCsv,
  geometria,
  LIMITES,
  ler,
  lerSimulacao,
  lerTransitos,
  massaPelaTerceiraLei,
  meiaJanelaDias,
  PADRAO,
  paraParametros,
  type Simulacao,
  simulacaoDoPlaneta,
  simularCurva,
} from "../../src/lib/simulacao-transito";
import { ErroDados } from "../../src/lib/tipos";

function comParametros(p: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(Object.entries(p).filter((e): e is [string, string] => e[1] !== null));
}

describe("terceira lei de Kepler ao contrário", () => {
  it("a Terra (1 UA, ano sideral de 365,256 dias) pede uma estrela de 1 massa solar", () => {
    expect(massaPelaTerceiraLei(1, 365.256363)).toBeCloseTo(1, 4);
  });

  it("Júpiter (5,2044 UA, 4.332,59 dias, NASA Planetary Fact Sheet) também, somando a própria massa", () => {
    // A massa de Júpiter é ~0,000955 M☉, e a conta devolve a soma.
    expect(massaPelaTerceiraLei(5.2044, 4332.59)).toBeCloseTo(1.001, 2);
  });
});

describe("lerSimulacao e paraParametros", () => {
  it("sem parâmetros, é o padrão", () => {
    expect(lerSimulacao({})).toEqual(PADRAO);
  });

  it("traz para dentro da faixa e ignora o que não é número", () => {
    const s = lerSimulacao({ rp: "1000", rs: "-1", p: "abc", i: "", ruido: "50" });
    expect(s.raioPlanetaRterra).toBe(LIMITES.raioPlanetaRterra.max);
    expect(s.raioEstrelaRsol).toBe(LIMITES.raioEstrelaRsol.min);
    expect(s.periodoDias).toBe(PADRAO.periodoDias);
    expect(s.inclinacaoGraus).toBe(PADRAO.inclinacaoGraus);
    expect(s.ruidoPpm).toBe(50);
  });

  it("semente só inteira e positiva", () => {
    expect(lerSimulacao({ semente: "7" }).semente).toBe(7);
    expect(lerSimulacao({ semente: "0" }).semente).toBe(PADRAO.semente);
    expect(lerSimulacao({ semente: "2.5" }).semente).toBe(PADRAO.semente);
  });

  it("mantém a borda da estrela com brilho não negativo: u₁ + u₂ ≤ 1", () => {
    const s = lerSimulacao({ u1: "0.8", u2: "0.6" });
    expect(s.u1).toBe(0.8);
    expect(s.u2).toBeCloseTo(0.2, 12);
    expect(comValor(s, "u1", 1).u2).toBe(0);
  });

  it("vai e volta pela URL, e o padrão não aparece nela", () => {
    expect(comParametros(paraParametros(PADRAO))).toEqual({});
    const s: Simulacao = {
      ...PADRAO,
      raioPlanetaRterra: 2.5,
      inclinacaoGraus: 88.5,
      u1: 0.4,
      ruidoPpm: 300,
      semente: 4,
    };
    const p = comParametros(paraParametros(s));
    expect(p).toEqual({ rp: "2.5", i: "88.5", u1: "0.4", ruido: "300", semente: "4" });
    expect(lerSimulacao(p)).toEqual(s);
  });

  it("comValor ignora número inválido e respeita a faixa", () => {
    expect(comValor(PADRAO, "periodoDias", Number.NaN)).toBe(PADRAO);
    expect(comValor(PADRAO, "inclinacaoGraus", 120).inclinacaoGraus).toBe(90);
  });
});

describe("leitura do trânsito", () => {
  it("geometria converte R⊕, R☉ e UA para raios estelares", () => {
    const g = geometria({ ...PADRAO, raioPlanetaRterra: 1, raioEstrelaRsol: 1, semiEixoUA: 1 });
    // R⊕/R☉ = 6.378,1 km / 695.700 km e 1 UA = 215,03 R☉ (IAU 2015).
    expect(g.razaoDeRaios).toBeCloseTo(0.009168, 6);
    expect(g.semiEixoEmRaiosEstelares).toBeCloseTo(215.03, 2);
  });

  it("sem escurecimento e com trânsito central, a profundidade é (Rp/R★)² e o raio deduzido é o raio real", () => {
    const l = ler(PADRAO);
    expect(l.haTransito).toBe(true);
    // A integração por anéis erra menos de 1e-5 do brilho (ver fluxoRelativo).
    expect(Math.abs(l.profundidade - l.profundidadeSimples)).toBeLessThan(1e-5);
    expect(l.profundidadeSimples).toBeCloseTo(l.razaoDeRaios ** 2, 15);
    expect(Math.abs(l.raioInferidoRterra / PADRAO.raioPlanetaRterra - 1)).toBeLessThan(1e-3);
    expect(l.duracaoHoras).toBeCloseTo(duracaoDoTransitoDias(geometria(PADRAO)) * 24, 10);
    expect(l.parametroDeImpacto).toBeLessThan(1e-9);
  });

  it("com escurecimento de borda, o centro fica mais fundo que (Rp/R★)²", () => {
    const l = ler({ ...PADRAO, u1: 0.4, u2: 0.25 });
    expect(l.profundidade).toBeGreaterThan(l.profundidadeSimples);
  });

  it("inclinação baixa demais: o planeta passa por cima da estrela e não há queda", () => {
    const l = ler({ ...PADRAO, inclinacaoGraus: 75 });
    expect(l.haTransito).toBe(false);
    expect(l.profundidade).toBe(0);
    expect(l.duracaoHoras).toBe(0);
    expect(l.parametroDeImpacto).toBeGreaterThan(1);
  });

  it("órbita dentro da estrela não é um sistema possível", () => {
    const l = ler({ ...PADRAO, semiEixoUA: 0.003, raioEstrelaRsol: 5 });
    expect(l.dentroDaEstrela).toBe(true);
    expect(l.haTransito).toBe(false);
    const curva = simularCurva({ ...PADRAO, semiEixoUA: 0.003, raioEstrelaRsol: 5 }, 10);
    expect(curva.modelo.every((p) => p.fluxo === 1)).toBe(true);
  });

  it("a massa implícita do padrão é a de uma estrela parecida com o Sol", () => {
    // HD 209458: 1,23 M☉ no catálogo; período e semi-eixo do catálogo dão um valor próximo.
    expect(ler(PADRAO).massaDaEstrelaMsol).toBeGreaterThan(1);
    expect(ler(PADRAO).massaDaEstrelaMsol).toBeLessThan(1.3);
  });
});

describe("curva simulada", () => {
  it("a janela cobre o trânsito inteiro, com folga dos dois lados", () => {
    const janela = meiaJanelaDias(PADRAO);
    const t14 = duracaoDoTransitoDias(geometria(PADRAO));
    expect(janela).toBeCloseTo(0.8 * t14, 12);
    const curva = simularCurva(PADRAO, 101);
    expect(curva.modelo[0]?.fluxo).toBe(1);
    expect(curva.modelo.at(-1)?.fluxo).toBe(1);
    const fundo = Math.min(...curva.modelo.map((p) => p.fluxo));
    expect(Math.abs(fundo - (1 - ler(PADRAO).profundidade))).toBeLessThan(2e-5);
  });

  it("com a órbita dentro da estrela, a janela é um vigésimo da órbita", () => {
    const s = { ...PADRAO, semiEixoUA: 0.003, raioEstrelaRsol: 5 };
    expect(meiaJanelaDias(s)).toBeCloseTo(s.periodoDias / 20, 12);
  });

  it("sem ruído, a medida é o próprio modelo", () => {
    const curva = simularCurva(PADRAO, 20);
    expect(curva.medida).toBe(curva.modelo);
  });

  it("o ruído é determinístico pela semente e tem o desvio pedido", () => {
    // Sem trânsito (i = 75°) a curva é plana e barata: o teste mede só o ruído.
    const s = { ...PADRAO, inclinacaoGraus: 75, ruidoPpm: 1000 };
    const a = simularCurva(s, 4000);
    const b = simularCurva(s, 4000);
    const c = simularCurva({ ...s, semente: 2 }, 4000);
    expect(a.medida).toEqual(b.medida);
    expect(a.medida).not.toEqual(c.medida);
    const residuos = a.medida.map((p, i) => p.fluxo - (a.modelo[i]?.fluxo ?? 0));
    const media = residuos.reduce((x, y) => x + y, 0) / residuos.length;
    const desvio = Math.sqrt(residuos.reduce((x, y) => x + (y - media) ** 2, 0) / residuos.length);
    expect(Math.abs(media)).toBeLessThan(1e-4);
    expect(desvio).toBeGreaterThan(0.00095);
    expect(desvio).toBeLessThan(0.00105);
  });

  it("exporta CSV com cabeçalho, horas e ponto decimal", () => {
    const csv = curvaParaCsv(simularCurva({ ...PADRAO, ruidoPpm: 100 }, 3));
    const [cabecalho, primeira, , terceira, fim] = csv.split("\n");
    expect(cabecalho).toBe("tempo_horas,fluxo_medido,fluxo_modelo");
    const horas = meiaJanelaDias(PADRAO) * 24;
    expect(Number(primeira?.split(",")[0])).toBeCloseTo(-horas, 4);
    expect(Number(terceira?.split(",")[0])).toBeCloseTo(horas, 4);
    expect(primeira?.split(",")[2]).toBe("1.00000000");
    expect(fim).toBe("");
  });
});

describe("planetas do catálogo", () => {
  const bruto = {
    colunas: ["nome", "periodo", "raio", "raio_estrela", "semi_eixo", "massa_estrela"],
    linhas: [
      ["HD 209458 b", 3.524749, 15.58, 1.19, 0.04707, 1.23],
      ["Sem semi-eixo b", 365.256363, 1, 1, null, 1],
    ],
  };

  it("lê as linhas e calcula o semi-eixo pela terceira lei quando falta", () => {
    const [hd, sem] = lerTransitos(bruto);
    expect(hd).toEqual({
      nome: "HD 209458 b",
      periodoDias: 3.524749,
      raioRterra: 15.58,
      raioEstrelaRsol: 1.19,
      semiEixoUA: 0.04707,
      semiEixoCalculado: false,
    });
    expect(sem?.semiEixoCalculado).toBe(true);
    expect(sem?.semiEixoUA).toBeCloseTo(1, 4);
  });

  it("rejeita formato e linhas inválidas", () => {
    expect(() => lerTransitos(null)).toThrow(ErroDados);
    expect(() => lerTransitos({ colunas: ["nome"], linhas: [] })).toThrow("fora do formato");
    expect(() => lerTransitos({ ...bruto, linhas: ["x"] })).toThrow("linha inválida");
    expect(() => lerTransitos({ ...bruto, linhas: [["X b", 1, 1, 1, null, null]] })).toThrow("X b");
    expect(() => lerTransitos({ ...bruto, linhas: [["Y b", 0, 1, 1, 0.1, 1]] })).toThrow("Y b");
  });

  it("carregar um planeta põe o trânsito central e mantém escurecimento e ruído", () => {
    const [hd] = lerTransitos(bruto);
    if (!hd) throw new Error("sem planeta");
    const atual: Simulacao = { ...PADRAO, inclinacaoGraus: 80, u1: 0.3, ruidoPpm: 200, raioPlanetaRterra: 1 };
    const s = simulacaoDoPlaneta(hd, atual);
    expect(s).toEqual({
      ...atual,
      inclinacaoGraus: 90,
      raioPlanetaRterra: 15.58,
      raioEstrelaRsol: 1.19,
      periodoDias: 3.524749,
      semiEixoUA: 0.04707,
    });
  });
});

describe("contratos que a interface usa", () => {
  it("faixas: rótulos e URLs únicos, escala log só nas que cobrem ordens de grandeza, e as unidades mostradas", () => {
    const limites = Object.values(LIMITES);
    expect(new Set(limites.map((l) => l.url)).size).toBe(limites.length);
    expect(new Set(limites.map((l) => l.rotulo)).size).toBe(limites.length);
    for (const l of limites) {
      expect(l.rotulo.length).toBeGreaterThan(3);
      expect(l.log).toBe(l.min > 0 && l.max / l.min >= 100);
    }
    expect(Object.fromEntries(Object.entries(LIMITES).map(([k, l]) => [k, l.unidade]))).toEqual({
      raioPlanetaRterra: "× Terra",
      raioEstrelaRsol: "× Sol",
      periodoDias: "dias",
      semiEixoUA: "UA",
      inclinacaoGraus: "°",
      u1: "",
      u2: "",
      ruidoPpm: "ppm",
    });
    // u₂ pode ser negativo (borda mais clara que o meio do disco, em algumas leis de escurecimento).
    expect(LIMITES.u2.min).toBeLessThan(0);
  });

  it("o ruído é exatamente ruído × normal sorteada com a semente, somado ao modelo", async () => {
    const { aleatorio, gaussiano } = await import("../../src/lib/aleatorio");
    const s = { ...PADRAO, inclinacaoGraus: 75, ruidoPpm: 300, semente: 4 };
    const curva = simularCurva(s, 5);
    const sortear = aleatorio(4);
    curva.medida.forEach((p, i) => {
      expect(p.fluxo - (curva.modelo[i]?.fluxo ?? 0)).toBeCloseTo(300e-6 * gaussiano(sortear), 12);
    });
  });

  it("com a órbita dentro da estrela, a curva é plana mas os tempos cobrem a janela", () => {
    const s = { ...PADRAO, semiEixoUA: 0.003, raioEstrelaRsol: 5 };
    const curva = simularCurva(s, 5);
    const janela = meiaJanelaDias(s);
    [-janela, -janela / 2, 0, janela / 2, janela].forEach((esperado, i) => {
      expect(curva.modelo[i]?.tempoDias).toBeCloseTo(esperado, 12);
    });
    expect(janela).toBeLessThan(s.periodoDias);
  });

  it("cada campo inválido do transitos.json é recusado, com a origem do erro", () => {
    const colunas = ["nome", "periodo", "raio", "raio_estrela", "semi_eixo", "massa_estrela"];
    const ok = ["A b", 10, 2, 1, 0.1, 1];
    expect(lerTransitos({ colunas, linhas: [ok] })).toHaveLength(1);
    for (const [i, ruim] of [
      [0, 3],
      [1, null],
      [1, "10"],
      [2, Number.NaN],
      [3, 0],
    ] as const) {
      const linha = [...ok];
      linha[i] = ruim;
      expect(() => lerTransitos({ colunas, linhas: [linha] }), `coluna ${i}`).toThrow(ErroDados);
    }
    // Só a massa da estrela basta para o semi-eixo; só o semi-eixo também.
    expect(lerTransitos({ colunas, linhas: [["B b", 10, 2, 1, 0.1, null]] })[0]?.semiEixoCalculado).toBe(false);
    expect(() => lerTransitos({ colunas: [...colunas.slice(0, 5), "outra"], linhas: [] })).toThrow("fora do formato");
    try {
      lerTransitos({ colunas, linhas: [7] });
    } catch (e) {
      expect((e as ErroDados).origem).toBe("transitos");
    }
  });
});
