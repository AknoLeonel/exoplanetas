import { R_JUPITER, R_SOL } from "./constantes";
import { assertPositivo } from "./orbita";

export interface GeometriaDoTransito {
  /** Raio do planeta dividido pelo raio da estrela. */
  razaoDeRaios: number;
  /** Semi-eixo dividido pelo raio da estrela. */
  semiEixoEmRaiosEstelares: number;
  /** Inclinação da órbita, em graus (90 = transito central). */
  inclinacaoGraus: number;
  /** Período orbital, em dias. */
  periodoDias: number;
}

export interface EscurecimentoDeBorda {
  /** Coeficientes da lei quadrática: I(μ)/I(1) = 1 − u1(1−μ) − u2(1−μ)². */
  u1: number;
  u2: number;
}

export const SEM_ESCURECIMENTO: EscurecimentoDeBorda = { u1: 0, u2: 0 };

/** Razão entre o raio de um planeta e o da estrela. */
export function razaoDeRaios(raioPlanetaRjup: number, raioEstrelaRsol: number): number {
  assertPositivo(raioPlanetaRjup, "raioPlanetaRjup");
  assertPositivo(raioEstrelaRsol, "raioEstrelaRsol");
  return (raioPlanetaRjup * R_JUPITER) / (raioEstrelaRsol * R_SOL);
}

/** Parâmetro de impacto b = (a/R★)·cos i, em raios estelares (órbita circular). */
export function parametroDeImpacto(
  g: Pick<GeometriaDoTransito, "semiEixoEmRaiosEstelares" | "inclinacaoGraus">,
): number {
  return g.semiEixoEmRaiosEstelares * Math.cos((g.inclinacaoGraus * Math.PI) / 180);
}

/** Profundidade aproximada do trânsito (fração do brilho), sem escurecimento de borda: k². */
export function profundidadeSimples(razao: number): number {
  assertPositivo(razao, "razaoDeRaios");
  return razao ** 2;
}

/** Duração total do trânsito, T14, em dias (órbita circular). Zero se não há trânsito. */
export function duracaoDoTransitoDias(g: GeometriaDoTransito): number {
  assertPositivo(g.razaoDeRaios, "razaoDeRaios");
  assertPositivo(g.semiEixoEmRaiosEstelares, "semiEixoEmRaiosEstelares");
  assertPositivo(g.periodoDias, "periodoDias");
  const b = parametroDeImpacto(g);
  const folga = (1 + g.razaoDeRaios) ** 2 - b ** 2;
  if (folga <= 0) return 0;
  const seno = Math.sin((g.inclinacaoGraus * Math.PI) / 180);
  const argumento = Math.sqrt(folga) / (g.semiEixoEmRaiosEstelares * seno);
  if (argumento >= 1) return g.periodoDias / 2;
  return (g.periodoDias / Math.PI) * Math.asin(argumento);
}

/** O planeta passa na frente da estrela, visto da Terra? (b < 1 + k) */
export function haTransito(g: GeometriaDoTransito): boolean {
  return Math.abs(parametroDeImpacto(g)) < 1 + g.razaoDeRaios;
}

/** Distância projetada entre os centros, em raios estelares, `tempoDias` depois do meio do trânsito (órbita circular). */
export function separacaoProjetada(g: GeometriaDoTransito, tempoDias: number): number {
  const fase = (2 * Math.PI * tempoDias) / g.periodoDias;
  const cosI = Math.cos((g.inclinacaoGraus * Math.PI) / 180);
  const frente = Math.cos(fase);
  // Do outro lado da estrela (atrás) não há trânsito: devolve um valor grande.
  if (frente < 0) return Number.POSITIVE_INFINITY;
  return g.semiEixoEmRaiosEstelares * Math.sqrt(Math.sin(fase) ** 2 + cosI * cosI * frente ** 2);
}

const ANEIS = 600;

/** Intensidade relativa no disco estelar, a uma distância r do centro (em raios estelares). */
function intensidade(r: number, { u1, u2 }: EscurecimentoDeBorda): number {
  const mu = Math.sqrt(Math.max(0, 1 - r * r));
  return 1 - u1 * (1 - mu) - u2 * (1 - mu) ** 2;
}

/** Fração da circunferência de raio r (centrada na estrela) coberta pelo disco do planeta (raio k, a distância z). */
function fracaoCoberta(r: number, z: number, k: number): number {
  if (z + r <= k) return 1;
  if (r > z + k || r < z - k) return 0;
  if (z === 0) return 0;
  const c = (r * r + z * z - k * k) / (2 * r * z);
  return Math.acos(Math.min(1, Math.max(-1, c))) / Math.PI;
}

/**
 * Fluxo relativo (1 = sem trânsito) quando o planeta, de raio k (em raios estelares), está a uma
 * distância projetada z do centro da estrela. Integra o disco por anéis, com escurecimento de borda
 * quadrático. Erro típico menor que 1e-5 da profundidade com os 600 anéis usados.
 */
export function fluxoRelativo(z: number, k: number, escurecimento: EscurecimentoDeBorda = SEM_ESCURECIMENTO): number {
  assertPositivo(k, "razaoDeRaios");
  if (!Number.isFinite(z) || z >= 1 + k) return 1;
  let total = 0;
  let bloqueado = 0;
  for (let i = 0; i < ANEIS; i++) {
    const r = (i + 0.5) / ANEIS;
    const peso = intensidade(r, escurecimento) * r; // 2π cancela na razão
    total += peso;
    bloqueado += peso * fracaoCoberta(r, Math.abs(z), k);
  }
  return 1 - bloqueado / total;
}

/** Profundidade no meio do trânsito, em fração do brilho, com escurecimento de borda. */
export function profundidadeNoCentro(
  g: GeometriaDoTransito,
  escurecimento: EscurecimentoDeBorda = SEM_ESCURECIMENTO,
): number {
  const z = Math.abs(parametroDeImpacto(g));
  return 1 - fluxoRelativo(z, g.razaoDeRaios, escurecimento);
}

export interface PontoDaCurva {
  tempoDias: number;
  fluxo: number;
}

/** Curva de luz amostrada em `n` pontos, de −`janelaDias` a +`janelaDias` em torno do meio do trânsito. */
export function curvaDeLuz(
  g: GeometriaDoTransito,
  janelaDias: number,
  n: number,
  escurecimento: EscurecimentoDeBorda = SEM_ESCURECIMENTO,
): PontoDaCurva[] {
  assertPositivo(janelaDias, "janelaDias");
  if (!Number.isInteger(n) || n < 2) throw new RangeError(`n precisa ser um inteiro maior que 1 (recebeu ${n})`);
  const pontos: PontoDaCurva[] = [];
  for (let i = 0; i < n; i++) {
    const tempoDias = -janelaDias + (2 * janelaDias * i) / (n - 1);
    const z = separacaoProjetada(g, tempoDias);
    pontos.push({ tempoDias, fluxo: fluxoRelativo(z, g.razaoDeRaios, escurecimento) });
  }
  return pontos;
}
