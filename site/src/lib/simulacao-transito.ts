import { aleatorio, gaussiano } from "./aleatorio";
import { DIA, G, M_SOL, R_SOL, R_TERRA, UA } from "./fisica/constantes";
import { semiEixoUA } from "./fisica/orbita";
import {
  curvaDeLuz,
  duracaoDoTransitoDias,
  type GeometriaDoTransito,
  haTransito,
  type PontoDaCurva,
  parametroDeImpacto,
  profundidadeNoCentro,
} from "./fisica/transito";
import { criarParametros, type LimiteDoControle } from "./parametros";
import { ErroDados } from "./tipos";

/** Tudo o que o simulador de trânsito deixa mexer. */
export interface Simulacao {
  /** raios terrestres */
  raioPlanetaRterra: number;
  /** raios solares */
  raioEstrelaRsol: number;
  periodoDias: number;
  semiEixoUA: number;
  /** 90° = trânsito central */
  inclinacaoGraus: number;
  /** Coeficientes do escurecimento de borda quadrático. */
  u1: number;
  u2: number;
  /** Desvio padrão do ruído da medida, em partes por milhão. */
  ruidoPpm: number;
  /** Semente do ruído: a mesma URL desenha os mesmos pontos. */
  semente: number;
}

export type ChaveDaSimulacao = Exclude<keyof Simulacao, "semente">;

/**
 * Faixas dos controles. Cobrem os planetas de trânsito do catálogo (raio de 0,3 a 33 R⊕, estrela de
 * 0,01 a 6 R☉, período de 0,1 a 3.650 dias, semi-eixo de 0,005 a 4,5 UA).
 */
export const LIMITES: Readonly<Record<ChaveDaSimulacao, LimiteDoControle>> = {
  raioPlanetaRterra: {
    url: "rp",
    rotulo: "Raio do planeta",
    unidade: "× Terra",
    min: 0.3,
    max: 35,
    log: true,
    passo: 0.001,
  },
  raioEstrelaRsol: {
    url: "rs",
    rotulo: "Raio da estrela",
    unidade: "× Sol",
    min: 0.01,
    max: 10,
    log: true,
    passo: 0.001,
  },
  periodoDias: { url: "p", rotulo: "Período", unidade: "dias", min: 0.1, max: 4000, log: true, passo: 0.001 },
  semiEixoUA: { url: "a", rotulo: "Semi-eixo", unidade: "UA", min: 0.003, max: 6, log: true, passo: 0.001 },
  inclinacaoGraus: { url: "i", rotulo: "Inclinação", unidade: "°", min: 70, max: 90, log: false, passo: 0.01 },
  u1: { url: "u1", rotulo: "Escurecimento de borda, u₁", unidade: "", min: 0, max: 1, log: false, passo: 0.01 },
  u2: { url: "u2", rotulo: "Escurecimento de borda, u₂", unidade: "", min: -0.5, max: 1, log: false, passo: 0.01 },
  ruidoPpm: { url: "ruido", rotulo: "Ruído da medida", unidade: "ppm", min: 0, max: 5000, log: false, passo: 10 },
};

/**
 * Ponto de partida: os valores de HD 209458 b no catálogo (o primeiro planeta visto em trânsito, mas descoberto
 * por velocidade radial, por isso fora da lista de trânsitos), com
 * trânsito central, sem escurecimento de borda e sem ruído. Quem abre o módulo vê uma queda clara.
 */
export const PADRAO: Readonly<Simulacao> = {
  raioPlanetaRterra: 15.58,
  raioEstrelaRsol: 1.19,
  periodoDias: 3.524749,
  semiEixoUA: 0.04707,
  inclinacaoGraus: 90,
  u1: 0,
  u2: 0,
  ruidoPpm: 0,
  semente: 1,
};

/**
 * A intensidade na borda é 1 − u₁ − u₂; acima de 1 a borda ficaria com brilho negativo.
 * Reduz u₂ para manter u₁ + u₂ ≤ 1.
 */
function bordaNaoNegativa(s: Simulacao): Simulacao {
  return s.u1 + s.u2 > 1 ? { ...s, u2: 1 - s.u1 } : s;
}

const PARAMETROS = criarParametros(LIMITES, PADRAO, bordaNaoNegativa);

/** Lê a simulação da URL. Parâmetro ausente ou inválido vale o padrão; fora da faixa, é trazido para dentro. */
export const lerSimulacao = PARAMETROS.ler;
/** Muda um parâmetro, respeitando a faixa e a borda não negativa. */
export const comValor = PARAMETROS.comValor;
/** A simulação como parâmetros de URL, só com o que difere do padrão. */
export const paraParametros = PARAMETROS.paraParametros;

/** Geometria em raios estelares, a partir das unidades dos controles. */
export function geometria(s: Simulacao): GeometriaDoTransito {
  const raioEstrela = s.raioEstrelaRsol * R_SOL;
  return {
    razaoDeRaios: (s.raioPlanetaRterra * R_TERRA) / raioEstrela,
    semiEixoEmRaiosEstelares: (s.semiEixoUA * UA) / raioEstrela,
    inclinacaoGraus: s.inclinacaoGraus,
    periodoDias: s.periodoDias,
  };
}

export interface Leitura {
  razaoDeRaios: number;
  semiEixoEmRaiosEstelares: number;
  parametroDeImpacto: number;
  /** A órbita passa dentro da estrela: não é um sistema possível. */
  dentroDaEstrela: boolean;
  haTransito: boolean;
  /** Fração do brilho no meio do trânsito, com escurecimento de borda. */
  profundidade: number;
  /** Aproximação (Rp/R★)², a primeira conta que se faz. */
  profundidadeSimples: number;
  duracaoHoras: number;
  /** O raio que um astrônomo deduziria da profundidade: Rp = R★·√δ. */
  raioInferidoRterra: number;
  /** A massa da estrela que o período e o semi-eixo exigem pela terceira lei de Kepler. */
  massaDaEstrelaMsol: number;
}

function orbitaDentroDaEstrela(g: GeometriaDoTransito): boolean {
  return g.semiEixoEmRaiosEstelares <= 1 + g.razaoDeRaios;
}

/** Massa (M☉) que faz um corpo a `semiEixoUA` orbitar em `periodoDias`: M = 4π²a³ / (G·P²). */
export function massaPelaTerceiraLei(semiEixo: number, periodoDias: number): number {
  const a = semiEixo * UA;
  const p = periodoDias * DIA;
  return (4 * Math.PI ** 2 * a ** 3) / (G * p ** 2) / M_SOL;
}

export function ler(s: Simulacao): Leitura {
  const g = geometria(s);
  const b = Math.abs(parametroDeImpacto(g));
  const dentroDaEstrela = orbitaDentroDaEstrela(g);
  const transita = !dentroDaEstrela && haTransito(g);
  const profundidade = transita ? profundidadeNoCentro(g, s) : 0;
  return {
    razaoDeRaios: g.razaoDeRaios,
    semiEixoEmRaiosEstelares: g.semiEixoEmRaiosEstelares,
    parametroDeImpacto: b,
    dentroDaEstrela,
    haTransito: transita,
    profundidade,
    profundidadeSimples: g.razaoDeRaios ** 2,
    duracaoHoras: transita ? duracaoDoTransitoDias(g) * 24 : 0,
    raioInferidoRterra: (s.raioEstrelaRsol * R_SOL * Math.sqrt(profundidade)) / R_TERRA,
    massaDaEstrelaMsol: massaPelaTerceiraLei(s.semiEixoUA, s.periodoDias),
  };
}

/**
 * Meia janela da curva, em dias: 80% da duração do trânsito central, para sobrar um pouco de linha reta
 * antes e depois. Com a órbita dentro da estrela, um vigésimo da órbita.
 */
export function meiaJanelaDias(s: Simulacao): number {
  const g = geometria(s);
  if (orbitaDentroDaEstrela(g)) return s.periodoDias / 20;
  return Math.min(0.8 * duracaoDoTransitoDias({ ...g, inclinacaoGraus: 90 }), s.periodoDias / 2);
}

export interface Curva {
  /** Modelo sem ruído. */
  modelo: PontoDaCurva[];
  /** O que um telescópio mediria: modelo + ruído gaussiano. Igual ao modelo quando o ruído é zero. */
  medida: PontoDaCurva[];
  meiaJanelaDias: number;
}

export function simularCurva(s: Simulacao, pontos = 300): Curva {
  const janela = meiaJanelaDias(s);
  const g = geometria(s);
  const modelo = orbitaDentroDaEstrela(g)
    ? Array.from({ length: pontos }, (_, i) => ({ tempoDias: -janela + (2 * janela * i) / (pontos - 1), fluxo: 1 }))
    : curvaDeLuz(g, janela, pontos, s);
  if (s.ruidoPpm === 0) return { modelo, medida: modelo, meiaJanelaDias: janela };
  const sortear = aleatorio(s.semente);
  const sigma = s.ruidoPpm * 1e-6;
  const medida = modelo.map((p) => ({ tempoDias: p.tempoDias, fluxo: p.fluxo + sigma * gaussiano(sortear) }));
  return { modelo, medida, meiaJanelaDias: janela };
}

/** CSV com ponto decimal (o que planilhas e Python leem sem configurar nada). */
export function curvaParaCsv(curva: Curva): string {
  const linhas = curva.medida.map((p, i) => {
    const modelo = curva.modelo[i]?.fluxo ?? p.fluxo;
    return `${(p.tempoDias * 24).toFixed(5)},${p.fluxo.toFixed(8)},${modelo.toFixed(8)}`;
  });
  return `tempo_horas,fluxo_medido,fluxo_modelo\n${linhas.join("\n")}\n`;
}

/** Um planeta de trânsito do catálogo, com o que o simulador precisa. */
export interface PlanetaDeTransito {
  nome: string;
  periodoDias: number;
  raioRterra: number;
  raioEstrelaRsol: number;
  /** Do catálogo, ou calculado pela terceira lei de Kepler quando o catálogo não traz. */
  semiEixoUA: number;
  semiEixoCalculado: boolean;
}

const COLUNAS_TRANSITOS = ["nome", "periodo", "raio", "raio_estrela", "semi_eixo", "massa_estrela"] as const;

function positivo(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/** Valida o transitos.json gerado pelo pipeline. */
export function lerTransitos(bruto: unknown): PlanetaDeTransito[] {
  const obj = bruto as { colunas?: unknown; linhas?: unknown } | null;
  if (
    !obj ||
    !Array.isArray(obj.colunas) ||
    !Array.isArray(obj.linhas) ||
    obj.colunas.length !== COLUNAS_TRANSITOS.length ||
    !COLUNAS_TRANSITOS.every((c, i) => (obj.colunas as unknown[])[i] === c)
  ) {
    throw new ErroDados("transitos.json fora do formato esperado", "transitos");
  }
  return (obj.linhas as unknown[]).map((linha) => {
    if (!Array.isArray(linha)) throw new ErroDados("linha inválida em transitos.json", "transitos");
    const [nome, periodo, raio, raioEstrela, semiEixo, massaEstrela] = linha as unknown[];
    const p = positivo(periodo);
    const r = positivo(raio);
    const rs = positivo(raioEstrela);
    const a = positivo(semiEixo);
    const m = positivo(massaEstrela);
    if (typeof nome !== "string" || p === null || r === null || rs === null || (a === null && m === null)) {
      throw new ErroDados(`planeta inválido em transitos.json: ${String(nome)}`, "transitos");
    }
    return {
      nome,
      periodoDias: p,
      raioRterra: r,
      raioEstrelaRsol: rs,
      semiEixoUA: a ?? semiEixoUA(p, m as number),
      semiEixoCalculado: a === null,
    };
  });
}

/** Simulação com os parâmetros de um planeta real, em trânsito central. Escurecimento e ruído continuam como estavam. */
export function simulacaoDoPlaneta(p: PlanetaDeTransito, atual: Simulacao): Simulacao {
  let s: Simulacao = { ...atual, inclinacaoGraus: 90 };
  s = comValor(s, "raioPlanetaRterra", p.raioRterra);
  s = comValor(s, "raioEstrelaRsol", p.raioEstrelaRsol);
  s = comValor(s, "periodoDias", p.periodoDias);
  return comValor(s, "semiEixoUA", p.semiEixoUA);
}
