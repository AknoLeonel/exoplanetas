import { T_SOL } from "./fisica/constantes";
import { criarParametros, type LimiteDoControle } from "./parametros";
import { ErroDados } from "./tipos";

/** As variáveis do modelo, na ordem em que o pipeline as exporta (`dados.FEATURES` no Python). */
export const VARIAVEIS = ["log_massa", "log_periodo", "log_insolacao", "st_teff", "st_mass", "st_met"] as const;
export type Variavel = (typeof VARIAVEIS)[number];

export const NOMES_DAS_VARIAVEIS: Readonly<Record<Variavel, string>> = {
  log_massa: "Massa do planeta",
  log_periodo: "Período",
  log_insolacao: "Luz recebida",
  st_teff: "Temperatura da estrela",
  st_mass: "Massa da estrela",
  st_met: "Metalicidade da estrela",
};

interface Arvore {
  variavel: number[];
  limiar: number[];
  esquerda: number[];
  direita: number[];
  ausenteEsquerda: boolean[];
  valor: number[];
}

interface FaixaDoIntervalo {
  /** Erro em log10 do raio: o quantil 10% (negativo) e o 90% (positivo). */
  inferior: number;
  superior: number;
  planetas: number;
  /** Fração dos erros fora da dobra que caiu dentro do intervalo. */
  cobertura: number;
}

interface FaixaDosDados {
  minimo: number;
  p01: number;
  p99: number;
  maximo: number;
}

export interface ModeloRaio {
  base: number;
  arvores: Arvore[];
  intervalo: { quantis: [number, number]; cortesLogMassa: number[]; faixas: FaixaDoIntervalo[] };
  faixas: Record<Variavel, FaixaDosDados>;
  validacao: { metodo: string; planetas: number; erroPercentualMediano: number; dentroDe20pct: number };
  verificacao: { entradas: number[][]; previsoes: number[] };
}

function numero(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function listaDe<T>(v: unknown, eh: (x: unknown) => x is T): v is T[] {
  return Array.isArray(v) && v.every(eh);
}

const ehBooleano = (x: unknown): x is boolean => typeof x === "boolean";
const ehInteiro = (x: unknown): x is number => Number.isInteger(x);

function erro(motivo: string): never {
  throw new ErroDados(`modelo-raio.json: ${motivo}`, "modelo-raio");
}

function lerArvore(bruta: unknown, i: number): Arvore {
  const a = bruta as Record<string, unknown> | null;
  if (!a) erro(`árvore ${i} vazia`);
  const { variavel, limiar, esquerda, direita, ausente_esquerda: ausente, valor } = a;
  if (
    !listaDe(variavel, ehInteiro) ||
    !listaDe(limiar, numero) ||
    !listaDe(esquerda, ehInteiro) ||
    !listaDe(direita, ehInteiro) ||
    !listaDe(ausente, ehBooleano) ||
    !listaDe(valor, numero)
  ) {
    erro(`árvore ${i} fora do formato`);
  }
  const n = variavel.length;
  if (n === 0 || [limiar, esquerda, direita, ausente, valor].some((l) => l.length !== n))
    erro(`árvore ${i} incompleta`);
  for (let k = 0; k < n; k++) {
    const f = variavel[k] ?? -1;
    if (f === -1) continue;
    const e = esquerda[k] ?? 0;
    const d = direita[k] ?? 0;
    // Os filhos sempre vêm depois do pai: isso também garante que o percurso termina.
    if (f < 0 || f >= VARIAVEIS.length || e <= k || d <= k || e >= n || d >= n)
      erro(`árvore ${i} com nó ${k} inválido`);
  }
  return { variavel, limiar, esquerda, direita, ausenteEsquerda: ausente, valor };
}

/** Valida o modelo-raio.json gerado pelo pipeline. */
export function lerModelo(bruto: unknown): ModeloRaio {
  const m = bruto as Record<string, unknown> | null;
  if (!m || typeof m !== "object") erro("fora do formato esperado");
  const variaveis = m.variaveis;
  if (
    !Array.isArray(variaveis) ||
    variaveis.length !== VARIAVEIS.length ||
    !VARIAVEIS.every((v, i) => variaveis[i] === v)
  ) {
    erro("variáveis diferentes das esperadas");
  }
  if (!numero(m.base) || !Array.isArray(m.arvores) || m.arvores.length === 0) erro("sem base ou sem árvores");
  const arvores = m.arvores.map(lerArvore);

  const intervalo = m.intervalo as Record<string, unknown> | undefined;
  const cortes = intervalo?.cortes_log_massa;
  const quantis = intervalo?.quantis;
  const faixasDoIntervalo = intervalo?.faixas;
  if (
    !listaDe(cortes, numero) ||
    !listaDe(quantis, numero) ||
    quantis.length !== 2 ||
    !Array.isArray(faixasDoIntervalo) ||
    faixasDoIntervalo.length !== cortes.length + 1
  ) {
    erro("intervalo fora do formato");
  }
  const faixasLidas = faixasDoIntervalo.map((f: Record<string, unknown>) => {
    if (
      !numero(f.inferior) ||
      !numero(f.superior) ||
      !numero(f.planetas) ||
      !numero(f.cobertura) ||
      f.inferior > f.superior
    ) {
      erro("faixa do intervalo inválida");
    }
    return { inferior: f.inferior, superior: f.superior, planetas: f.planetas, cobertura: f.cobertura };
  });

  const faixasBrutas = m.faixas as Record<string, Record<string, unknown>> | undefined;
  const faixas = {} as Record<Variavel, FaixaDosDados>;
  for (const v of VARIAVEIS) {
    const f = faixasBrutas?.[v];
    if (!f || !numero(f.minimo) || !numero(f.p01) || !numero(f.p99) || !numero(f.maximo))
      erro(`faixa de ${v} inválida`);
    faixas[v] = { minimo: f.minimo, p01: f.p01, p99: f.p99, maximo: f.maximo };
  }

  const validacao = m.validacao as Record<string, unknown> | undefined;
  if (
    !validacao ||
    typeof validacao.metodo !== "string" ||
    !numero(validacao.planetas) ||
    !numero(validacao.erro_percentual_mediano) ||
    !numero(validacao.dentro_de_20pct)
  ) {
    erro("validação fora do formato");
  }
  const verificacao = m.verificacao as Record<string, unknown> | undefined;
  const entradas = verificacao?.entradas;
  const previsoes = verificacao?.previsoes;
  if (
    !Array.isArray(entradas) ||
    !entradas.every((e) => listaDe(e, numero) && e.length === VARIAVEIS.length) ||
    !listaDe(previsoes, numero) ||
    previsoes.length !== entradas.length
  ) {
    erro("verificação fora do formato");
  }
  return {
    base: m.base,
    arvores,
    intervalo: { quantis: [quantis[0] as number, quantis[1] as number], cortesLogMassa: cortes, faixas: faixasLidas },
    faixas,
    validacao: {
      metodo: validacao.metodo,
      planetas: validacao.planetas,
      erroPercentualMediano: validacao.erro_percentual_mediano,
      dentroDe20pct: validacao.dentro_de_20pct,
    },
    verificacao: { entradas: entradas as number[][], previsoes },
  };
}

export interface Previsao {
  /** log10 do raio previsto, em raios terrestres. */
  logRaio: number;
  /** Ponto de partida: o que o modelo prevê antes de olhar qualquer variável (perto da média do treino). */
  logBase: number;
  /** Quanto cada variável moveu a previsão, em log10, na ordem de VARIAVEIS. Somadas à base, dão logRaio. */
  contribuicoes: number[];
}

/**
 * Soma as árvores. Em cada árvore, a diferença de valor entre o nó e o filho escolhido é creditada à variável
 * daquela divisão (o método de Saabas). Por construção, base + contribuições = previsão.
 */
export function prever(modelo: ModeloRaio, x: readonly number[]): Previsao {
  if (x.length !== VARIAVEIS.length) throw new RangeError(`esperava ${VARIAVEIS.length} variáveis`);
  const contribuicoes = VARIAVEIS.map(() => 0);
  let logBase = modelo.base;
  let logRaio = modelo.base;
  for (const a of modelo.arvores) {
    let no = 0;
    logBase += a.valor[0] ?? 0;
    for (let f = a.variavel[no] ?? -1; f !== -1; f = a.variavel[no] ?? -1) {
      const v = x[f] ?? Number.NaN;
      const esquerda = Number.isNaN(v) ? a.ausenteEsquerda[no] : v <= (a.limiar[no] ?? 0);
      const proximo = (esquerda ? a.esquerda[no] : a.direita[no]) ?? 0;
      contribuicoes[f] = (contribuicoes[f] ?? 0) + (a.valor[proximo] ?? 0) - (a.valor[no] ?? 0);
      no = proximo;
    }
    logRaio += a.valor[no] ?? 0;
  }
  return { logRaio, logBase, contribuicoes };
}

/** A faixa de massa do intervalo: a de cima no corte exato, como o `searchsorted(side="right")` do pipeline. */
function faixaDoIntervalo(modelo: ModeloRaio, logMassa: number): FaixaDoIntervalo {
  const { cortesLogMassa, faixas } = modelo.intervalo;
  const faixa = faixas[cortesLogMassa.filter((c) => c <= logMassa).length] ?? faixas.at(-1);
  if (!faixa) throw new RangeError("modelo sem faixas de intervalo");
  return faixa;
}

/** Intervalo de 80%, em raios terrestres, com os erros fora da dobra da faixa de massa da entrada. */
export function intervaloDoRaio(
  modelo: ModeloRaio,
  logMassa: number,
  logRaio: number,
): { inferior: number; superior: number } {
  const faixa = faixaDoIntervalo(modelo, logMassa);
  return { inferior: 10 ** (logRaio + faixa.inferior), superior: 10 ** (logRaio + faixa.superior) };
}

export type Extrapolacao = "dentro" | "borda" | "fora";

/** Onde cada variável cai em relação ao treino: entre os percentis 1 e 99, só na borda, ou fora de tudo. */
export function extrapolacao(modelo: ModeloRaio, x: readonly number[]): Record<Variavel, Extrapolacao> {
  const saida = {} as Record<Variavel, Extrapolacao>;
  VARIAVEIS.forEach((v, i) => {
    const valor = x[i] ?? Number.NaN;
    const f = modelo.faixas[v];
    saida[v] = !(valor >= f.minimo && valor <= f.maximo) ? "fora" : valor < f.p01 || valor > f.p99 ? "borda" : "dentro";
  });
  return saida;
}

// ---------- Entrada nas unidades dos controles ----------

export interface LeituraML {
  raio: number;
  /** Intervalo de 80%, em raios terrestres. */
  inferior: number;
  superior: number;
  /** Raio de partida (antes de olhar as variáveis). */
  raioBase: number;
  /** Fator multiplicativo de cada variável no raio (10^contribuição), na ordem de VARIAVEIS. */
  fatores: number[];
  extrapolacao: Record<Variavel, Extrapolacao>;
  /** Faixa de massa do intervalo usada nesta entrada. */
  faixaDoIntervalo: FaixaDoIntervalo;
  validacao: ModeloRaio["validacao"];
}

/** Tudo o que a interface mostra sobre uma entrada. */
export function lerML(modelo: ModeloRaio, e: EntradaML): LeituraML {
  const x = vetorDaEntrada(e);
  const p = prever(modelo, x);
  const { inferior, superior } = intervaloDoRaio(modelo, x[0] ?? 0, p.logRaio);
  return {
    raio: 10 ** p.logRaio,
    inferior,
    superior,
    raioBase: 10 ** p.logBase,
    fatores: p.contribuicoes.map((c) => 10 ** c),
    extrapolacao: extrapolacao(modelo, x),
    faixaDoIntervalo: faixaDoIntervalo(modelo, x[0] ?? 0),
    validacao: modelo.validacao,
  };
}

export interface EntradaML {
  /** massas terrestres */
  massaMterra: number;
  periodoDias: number;
  /** luz recebida, em unidades da que a Terra recebe */
  insolacao: number;
  teffK: number;
  massaEstrelaMsol: number;
  /** [Fe/H], em dex */
  metalicidade: number;
  /** Sem uso no modelo; existe porque o estado na URL dos simuladores sempre tem uma semente. */
  semente: number;
}

export type ChaveDaEntrada = Exclude<keyof EntradaML, "semente">;

/** Faixas dos controles: um pouco além das do treino, para a pessoa poder ver o modelo extrapolar. */
export const LIMITES_ML: Readonly<Record<ChaveDaEntrada, LimiteDoControle>> = {
  massaMterra: {
    url: "mp",
    rotulo: "Massa do planeta",
    unidade: "× Terra",
    min: 0.03,
    max: 30_000,
    log: true,
    passo: 0.001,
  },
  periodoDias: { url: "p", rotulo: "Período", unidade: "dias", min: 0.1, max: 10_000, log: true, passo: 0.001 },
  insolacao: { url: "s", rotulo: "Luz recebida", unidade: "× Terra", min: 0.03, max: 100_000, log: true, passo: 0.001 },
  teffK: { url: "t", rotulo: "Temperatura da estrela", unidade: "K", min: 2000, max: 10_000, log: false, passo: 10 },
  massaEstrelaMsol: {
    url: "ms",
    rotulo: "Massa da estrela",
    unidade: "× Sol",
    min: 0.05,
    max: 3.5,
    log: false,
    passo: 0.01,
  },
  metalicidade: {
    url: "fe",
    rotulo: "Metalicidade da estrela, [Fe/H]",
    unidade: "dex",
    min: -1,
    max: 1,
    log: false,
    passo: 0.01,
  },
};

/** A Terra em volta do Sol: fora do treino (que só tem planetas de trânsito com massa medida), um teste honesto. */
export const PADRAO_ML: Readonly<EntradaML> = {
  massaMterra: 1,
  periodoDias: 365.25,
  insolacao: 1,
  teffK: T_SOL,
  massaEstrelaMsol: 1,
  metalicidade: 0,
  semente: 1,
};

const PARAMETROS = criarParametros(LIMITES_ML, PADRAO_ML);
export const lerEntradaML = PARAMETROS.ler;
export const comValorML = PARAMETROS.comValor;
export const paraParametrosML = PARAMETROS.paraParametros;

/** A entrada como o modelo a recebe, na ordem de VARIAVEIS. */
export function vetorDaEntrada(e: EntradaML): number[] {
  return [
    Math.log10(e.massaMterra),
    Math.log10(e.periodoDias),
    Math.log10(e.insolacao),
    e.teffK,
    e.massaEstrelaMsol,
    e.metalicidade,
  ];
}

// ---------- Planetas do treino ----------

export interface PlanetaDoTreino extends Omit<EntradaML, "semente"> {
  nome: string;
  /** raio medido no trânsito, em raios terrestres */
  raioRterra: number;
}

const COLUNAS_DO_TREINO = ["nome", "massa", "periodo", "insolacao", "st_teff", "st_mass", "st_met", "raio"] as const;

export function lerPlanetasDoTreino(bruto: unknown): PlanetaDoTreino[] {
  const obj = bruto as { colunas?: unknown; linhas?: unknown } | null;
  if (
    !obj ||
    !Array.isArray(obj.colunas) ||
    !Array.isArray(obj.linhas) ||
    obj.colunas.length !== COLUNAS_DO_TREINO.length ||
    !COLUNAS_DO_TREINO.every((c, i) => (obj.colunas as unknown[])[i] === c)
  ) {
    throw new ErroDados("modelo-planetas.json fora do formato esperado", "modelo-planetas");
  }
  return (obj.linhas as unknown[]).map((linha) => {
    const [nome, massa, periodo, insolacao, teff, ms, met, raio] = Array.isArray(linha) ? linha : [];
    const positivos = [massa, periodo, insolacao, teff, ms, raio];
    if (typeof nome !== "string" || !positivos.every((v) => numero(v) && v > 0) || !numero(met)) {
      throw new ErroDados(`planeta inválido em modelo-planetas.json: ${String(nome)}`, "modelo-planetas");
    }
    return {
      nome,
      massaMterra: massa as number,
      periodoDias: periodo as number,
      insolacao: insolacao as number,
      teffK: teff as number,
      massaEstrelaMsol: ms as number,
      metalicidade: met,
      raioRterra: raio as number,
    };
  });
}

/** Entrada com os valores de um planeta do treino. Fora da faixa dos controles, o valor é trazido para dentro. */
export function entradaDoPlaneta(p: PlanetaDoTreino, atual: EntradaML): EntradaML {
  let e: EntradaML = { ...atual };
  for (const chave of Object.keys(LIMITES_ML) as ChaveDaEntrada[]) e = comValorML(e, chave, p[chave]);
  return e;
}
