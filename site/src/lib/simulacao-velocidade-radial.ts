import { aleatorio, gaussiano } from "./aleatorio";
import { LAMBDA_H_ALFA_NM, M_JUPITER, M_SOL, M_TERRA } from "./fisica/constantes";
import { anomaliaVerdadeiraNoTempo, distanciaOrbital, semiEixoUA } from "./fisica/orbita";
import { densidadeGcm3 } from "./fisica/planeta";
import { deslocamentoDoppler, massaMinimaMjup, semiAmplitudeMs, velocidadeRadialMs } from "./fisica/velocidade-radial";
import { criarParametros, type LimiteDoControle } from "./parametros";
import { ErroDados } from "./tipos";

/** Tudo o que o simulador de velocidade radial deixa mexer. */
export interface SimulacaoVR {
  /** massas terrestres (a massa verdadeira, não m·sin i) */
  massaPlanetaMterra: number;
  periodoDias: number;
  /** massas solares */
  massaEstrelaMsol: number;
  excentricidade: number;
  /** Argumento do periastro ω: onde, na órbita, fica o ponto mais próximo da estrela. */
  omegaGraus: number;
  /** 90° = órbita vista de lado; perto de 0°, vista de cima e quase sem balanço na linha de visada. */
  inclinacaoGraus: number;
  /** Desvio padrão do ruído da medida, em m/s. */
  ruidoMs: number;
  /** Semente do ruído: a mesma URL desenha os mesmos pontos. */
  semente: number;
}

export type ChaveDaSimulacaoVR = Exclude<keyof SimulacaoVR, "semente">;

/**
 * Faixas dos controles. Cobrem os planetas com massa do catálogo (de 0,02 a 9.300 M⊕, períodos de 0,09 dia a
 * dezenas de milhares de dias, estrelas de 0,01 a 9 M☉, excentricidade até 0,95).
 */
export const LIMITES_VR: Readonly<Record<ChaveDaSimulacaoVR, LimiteDoControle>> = {
  massaPlanetaMterra: {
    url: "mp",
    rotulo: "Massa do planeta",
    unidade: "× Terra",
    min: 0.01,
    max: 10_000,
    log: true,
    passo: 0.001,
  },
  periodoDias: { url: "p", rotulo: "Período", unidade: "dias", min: 0.05, max: 100_000, log: true, passo: 0.001 },
  massaEstrelaMsol: {
    url: "ms",
    rotulo: "Massa da estrela",
    unidade: "× Sol",
    min: 0.01,
    max: 10,
    log: true,
    passo: 0.001,
  },
  excentricidade: { url: "e", rotulo: "Excentricidade", unidade: "", min: 0, max: 0.95, log: false, passo: 0.01 },
  omegaGraus: { url: "w", rotulo: "Argumento do periastro, ω", unidade: "°", min: 0, max: 360, log: false, passo: 1 },
  inclinacaoGraus: { url: "i", rotulo: "Inclinação", unidade: "°", min: 1, max: 90, log: false, passo: 0.1 },
  ruidoMs: { url: "ruido", rotulo: "Ruído da medida", unidade: "m/s", min: 0, max: 200, log: false, passo: 0.5 },
};

const MJUP_EM_MTERRA = M_JUPITER / M_TERRA;

/**
 * Ponto de partida: 51 Pegasi b, o primeiro planeta achado em volta de uma estrela parecida com o Sol (1995),
 * justamente por velocidade radial. Valores de Butler et al. 2006: m·sin i = 0,468 Mjup, M★ = 1,11 M☉,
 * P = 4,2308 dias, órbita circular, o que dá K = 55,9 m/s. Órbita de lado e sem ruído.
 */
export const PADRAO_VR: Readonly<SimulacaoVR> = {
  massaPlanetaMterra: Number((0.468 * MJUP_EM_MTERRA).toPrecision(6)),
  periodoDias: 4.2308,
  massaEstrelaMsol: 1.11,
  excentricidade: 0,
  omegaGraus: 90,
  inclinacaoGraus: 90,
  ruidoMs: 0,
  semente: 1,
};

const PARAMETROS = criarParametros(LIMITES_VR, PADRAO_VR);

export const lerSimulacaoVR = PARAMETROS.ler;
export const comValorVR = PARAMETROS.comValor;
export const paraParametrosVR = PARAMETROS.paraParametros;

export interface LeituraVR {
  /** Semi-amplitude K, em m/s. */
  semiAmplitudeMs: number;
  /** A massa que um astrônomo deduz de K, sem saber a inclinação: m·sin i, em M⊕. */
  massaMinimaMterra: number;
  /** Massa verdadeira ÷ massa mínima = 1/sin i. */
  fatorDaInclinacao: number;
  semiEixoUA: number;
  /** Deslocamento da linha H-alfa no pico do balanço, em picômetros. */
  deslocamentoHalfaPm: number;
}

export function lerVR(s: SimulacaoVR): LeituraVR {
  const massaPlanetaMjup = s.massaPlanetaMterra / MJUP_EM_MTERRA;
  const K = semiAmplitudeMs({
    periodoDias: s.periodoDias,
    massaPlanetaMjup,
    massaEstrelaMsol: s.massaEstrelaMsol,
    excentricidade: s.excentricidade,
    inclinacaoGraus: s.inclinacaoGraus,
  });
  const minima =
    massaMinimaMjup({
      semiAmplitudeMs: K,
      periodoDias: s.periodoDias,
      massaEstrelaMsol: s.massaEstrelaMsol,
      excentricidade: s.excentricidade,
    }) * MJUP_EM_MTERRA;
  return {
    semiAmplitudeMs: K,
    massaMinimaMterra: minima,
    fatorDaInclinacao: 1 / Math.sin((s.inclinacaoGraus * Math.PI) / 180),
    semiEixoUA: semiEixoUA(s.periodoDias, s.massaEstrelaMsol, (s.massaPlanetaMterra * M_TERRA) / M_SOL),
    // nm → pm
    deslocamentoHalfaPm: deslocamentoDoppler(LAMBDA_H_ALFA_NM, K) * 1000,
  };
}

interface PontoVR {
  /** Fração da órbita desde o periastro, de 0 a 1. */
  fase: number;
  velocidadeMs: number;
}

export interface CurvaVR {
  modelo: PontoVR[];
  /** Modelo + ruído gaussiano. Igual ao modelo quando o ruído é zero. */
  medida: PontoVR[];
}

export function velocidadeNaFase(s: SimulacaoVR, K: number, fase: number): number {
  return velocidadeRadialMs({
    tempoDias: fase * s.periodoDias,
    periodoDias: s.periodoDias,
    semiAmplitudeMs: K,
    excentricidade: s.excentricidade,
    argumentoDoPeriastroGraus: s.omegaGraus,
  });
}

/** Uma órbita inteira, do periastro ao periastro seguinte. */
export function simularCurvaVR(s: SimulacaoVR, pontos = 300): CurvaVR {
  if (!Number.isInteger(pontos) || pontos < 2) throw new RangeError(`pontos precisa ser um inteiro maior que 1`);
  const K = lerVR(s).semiAmplitudeMs;
  const modelo = Array.from({ length: pontos }, (_, i) => {
    const fase = i / (pontos - 1);
    return { fase, velocidadeMs: velocidadeNaFase(s, K, fase) };
  });
  if (s.ruidoMs === 0) return { modelo, medida: modelo };
  const sortear = aleatorio(s.semente);
  const medida = modelo.map((p) => ({ fase: p.fase, velocidadeMs: p.velocidadeMs + s.ruidoMs * gaussiano(sortear) }));
  return { modelo, medida };
}

/** CSV com ponto decimal. */
export function curvaVRParaCsv(s: SimulacaoVR, curva: CurvaVR): string {
  const linhas = curva.medida.map((p, i) => {
    const modelo = curva.modelo[i]?.velocidadeMs ?? p.velocidadeMs;
    return `${p.fase.toFixed(5)},${(p.fase * s.periodoDias).toFixed(6)},${p.velocidadeMs.toFixed(4)},${modelo.toFixed(4)}`;
  });
  return `fase,tempo_dias,velocidade_medida_ms,velocidade_modelo_ms\n${linhas.join("\n")}\n`;
}

export interface PosicaoNoPlano {
  /** Ao longo da órbita, perpendicular à linha de visada, em UA. */
  x: number;
  /** Na linha de visada, em UA: positivo = se afastando de nós (por trás). */
  z: number;
}

/**
 * Planeta e estrela vistos de cima, em volta do centro de massa, na fração `fase` da órbita. A estrela fica do lado
 * oposto, a uma distância m/M menor. A componente na linha de visada está projetada por sin i.
 */
export function posicoesNaOrbita(s: SimulacaoVR, fase: number): { planeta: PosicaoNoPlano; estrela: PosicaoNoPlano } {
  const nu = anomaliaVerdadeiraNoTempo(fase * s.periodoDias, s.periodoDias, s.excentricidade);
  const a = semiEixoUA(s.periodoDias, s.massaEstrelaMsol, (s.massaPlanetaMterra * M_TERRA) / M_SOL);
  const r = distanciaOrbital(a, s.excentricidade, nu);
  const angulo = nu + (s.omegaGraus * Math.PI) / 180;
  const seno = Math.sin((s.inclinacaoGraus * Math.PI) / 180);
  const razao = (s.massaPlanetaMterra * M_TERRA) / (s.massaEstrelaMsol * M_SOL);
  // Cada corpo fica a uma fração da separação: o planeta a M/(m+M), a estrela a m/(m+M).
  const planeta = { x: r * Math.cos(angulo), z: r * Math.sin(angulo) * seno };
  const f = razao / (1 + razao);
  return {
    planeta: { x: planeta.x * (1 - f), z: planeta.z * (1 - f) },
    estrela: { x: -planeta.x * f, z: -planeta.z * f },
  };
}

/** Um planeta do catálogo com massa medida por velocidade radial (mínima) ou por outro método (verdadeira). */
export interface PlanetaComMassa {
  nome: string;
  periodoDias: number;
  massaMterra: number;
  /** A massa do catálogo é a verdadeira (inclinação conhecida) ou só m·sin i? */
  massaVerdadeira: boolean;
  massaEstrelaMsol: number;
  /** null quando o catálogo não traz (o simulador usa órbita circular). */
  excentricidade: number | null;
  /** Só quando medido num trânsito. */
  raioRterra: number | null;
}

const COLUNAS_VELOCIDADES = [
  "nome",
  "periodo",
  "massa",
  "tipo_massa",
  "massa_estrela",
  "excentricidade",
  "raio",
] as const;

function positivo(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/** Valida o velocidades.json gerado pelo pipeline. */
export function lerVelocidades(bruto: unknown): PlanetaComMassa[] {
  const obj = bruto as { colunas?: unknown; linhas?: unknown } | null;
  if (
    !obj ||
    !Array.isArray(obj.colunas) ||
    !Array.isArray(obj.linhas) ||
    obj.colunas.length !== COLUNAS_VELOCIDADES.length ||
    !COLUNAS_VELOCIDADES.every((c, i) => (obj.colunas as unknown[])[i] === c)
  ) {
    throw new ErroDados("velocidades.json fora do formato esperado", "velocidades");
  }
  return (obj.linhas as unknown[]).map((linha) => {
    if (!Array.isArray(linha)) throw new ErroDados("linha inválida em velocidades.json", "velocidades");
    const [nome, periodo, massa, tipo, massaEstrela, excentricidade, raio] = linha as unknown[];
    const p = positivo(periodo);
    const m = positivo(massa);
    const ms = positivo(massaEstrela);
    const e = typeof excentricidade === "number" && excentricidade >= 0 && excentricidade < 1 ? excentricidade : null;
    if (
      typeof nome !== "string" ||
      p === null ||
      m === null ||
      ms === null ||
      (tipo !== "verdadeira" && tipo !== "minima") ||
      (excentricidade !== null && e === null)
    ) {
      throw new ErroDados(`planeta inválido em velocidades.json: ${String(nome)}`, "velocidades");
    }
    return {
      nome,
      periodoDias: p,
      massaMterra: m,
      massaVerdadeira: tipo === "verdadeira",
      massaEstrelaMsol: ms,
      excentricidade: e,
      raioRterra: positivo(raio),
    };
  });
}

/**
 * Simulação com os valores de um planeta real. A órbita fica de lado (i = 90°): com massa mínima, é o caso em que
 * a massa simulada é a do catálogo; com massa verdadeira, a inclinação real não está entre as colunas coletadas.
 * ω não está no catálogo coletado e volta ao padrão. Ruído e semente continuam como estavam.
 */
export function simulacaoDoPlanetaVR(p: PlanetaComMassa, atual: SimulacaoVR): SimulacaoVR {
  let s: SimulacaoVR = { ...atual, inclinacaoGraus: 90, omegaGraus: PADRAO_VR.omegaGraus };
  s = comValorVR(s, "massaPlanetaMterra", p.massaMterra);
  s = comValorVR(s, "periodoDias", p.periodoDias);
  s = comValorVR(s, "massaEstrelaMsol", p.massaEstrelaMsol);
  return comValorVR(s, "excentricidade", p.excentricidade ?? 0);
}

export interface Densidade {
  gcm3: number;
  /** Com massa mínima, a densidade real é maior ou igual: o valor é um piso. */
  piso: boolean;
}

/** Massa + raio = densidade: só possível quando o planeta tem as duas medidas. */
export function densidadeDoPlaneta(p: PlanetaComMassa): Densidade | null {
  if (p.raioRterra === null) return null;
  return { gcm3: densidadeGcm3(p.massaMterra, p.raioRterra), piso: !p.massaVerdadeira };
}
