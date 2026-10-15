import {
  FLUXO_LIMITE_EXTERNO,
  FLUXO_LIMITE_INTERNO,
  G,
  L_SOL,
  M_TERRA,
  R_SOL,
  R_TERRA,
  SIGMA_SB,
  UA,
} from "./constantes";
import { assertPositivo } from "./orbita";

/** Velocidade de escape (km/s) na superfície. Massa e raio em unidades da Terra. */
export function velocidadeDeEscapeKms(massaMterra: number, raioRterra: number): number {
  assertPositivo(massaMterra, "massaMterra");
  assertPositivo(raioRterra, "raioRterra");
  return Math.sqrt((2 * G * massaMterra * M_TERRA) / (raioRterra * R_TERRA)) / 1000;
}

/** Gravidade na superfície (m/s²). Massa e raio em unidades da Terra. */
export function gravidadeDeSuperficie(massaMterra: number, raioRterra: number): number {
  assertPositivo(massaMterra, "massaMterra");
  assertPositivo(raioRterra, "raioRterra");
  return (G * massaMterra * M_TERRA) / (raioRterra * R_TERRA) ** 2;
}

/** Densidade média (g/cm³). Massa e raio em unidades da Terra. */
export function densidadeGcm3(massaMterra: number, raioRterra: number): number {
  assertPositivo(massaMterra, "massaMterra");
  assertPositivo(raioRterra, "raioRterra");
  const volume = (4 / 3) * Math.PI * (raioRterra * R_TERRA) ** 3;
  return (massaMterra * M_TERRA) / volume / 1000;
}

/** Luminosidade (em L☉) de uma estrela de raio R (R☉) e temperatura efetiva T (K): L = 4πR²σT⁴. */
export function luminosidadeLsol(raioEstrelaRsol: number, temperaturaEfetivaK: number): number {
  assertPositivo(raioEstrelaRsol, "raioEstrelaRsol");
  assertPositivo(temperaturaEfetivaK, "temperaturaEfetivaK");
  return (4 * Math.PI * (raioEstrelaRsol * R_SOL) ** 2 * SIGMA_SB * temperaturaEfetivaK ** 4) / L_SOL;
}

/** Fluxo que o planeta recebe, em unidades do que a Terra recebe: L/a². */
export function insolacao(luminosidadeEstrelaLsol: number, semiEixoUA: number): number {
  assertPositivo(luminosidadeEstrelaLsol, "luminosidadeEstrelaLsol");
  assertPositivo(semiEixoUA, "semiEixoUA");
  return luminosidadeEstrelaLsol / semiEixoUA ** 2;
}

/**
 * Temperatura de equilíbrio (K) de um planeta, com redistribuição de calor total:
 * T = T★·√(R★/2a)·(1 − A)^¼. `albedo` de Bond, entre 0 e 1.
 */
export function temperaturaDeEquilibrioK(args: {
  temperaturaEstrelaK: number;
  raioEstrelaRsol: number;
  semiEixoUA: number;
  albedo?: number;
}): number {
  const { temperaturaEstrelaK, raioEstrelaRsol, semiEixoUA, albedo = 0 } = args;
  assertPositivo(temperaturaEstrelaK, "temperaturaEstrelaK");
  assertPositivo(raioEstrelaRsol, "raioEstrelaRsol");
  assertPositivo(semiEixoUA, "semiEixoUA");
  if (!Number.isFinite(albedo) || albedo < 0 || albedo >= 1)
    throw new RangeError(`o albedo precisa estar em [0, 1) (recebeu ${albedo})`);
  return temperaturaEstrelaK * Math.sqrt((raioEstrelaRsol * R_SOL) / (2 * semiEixoUA * UA)) * (1 - albedo) ** 0.25;
}

export interface ZonaHabitavel {
  /** Borda interna (UA): estufa descontrolada. */
  internaUA: number;
  /** Borda externa (UA): estufa máxima. */
  externaUA: number;
}

/**
 * Zona habitável **aproximada**: usa os fluxos limite de Kopparapu et al. (2013, com as correções de 2014)
 * calibrados para o Sol, sem a dependência com a temperatura da estrela. Boa como primeira estimativa
 * para estrelas do tipo solar; a fórmula completa fica para uma versão futura.
 */
export function zonaHabitavelAproximada(luminosidadeEstrelaLsol: number): ZonaHabitavel {
  assertPositivo(luminosidadeEstrelaLsol, "luminosidadeEstrelaLsol");
  return {
    internaUA: Math.sqrt(luminosidadeEstrelaLsol / FLUXO_LIMITE_INTERNO),
    externaUA: Math.sqrt(luminosidadeEstrelaLsol / FLUXO_LIMITE_EXTERNO),
  };
}
