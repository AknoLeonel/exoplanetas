import { DIA, G, M_JUPITER, M_SOL } from "./constantes";
import { anomaliaVerdadeiraNoTempo, assertExcentricidade, assertPositivo } from "./orbita";

/**
 * Semi-amplitude da velocidade radial da estrela (m/s), com a massa do planeta em massas de Júpiter.
 * Para a massa verdadeira, divida a massa mínima (m·sin i) por sin i; aqui `inclinacaoGraus` faz esse papel.
 */
export function semiAmplitudeMs(args: {
  periodoDias: number;
  massaPlanetaMjup: number;
  massaEstrelaMsol: number;
  excentricidade?: number;
  inclinacaoGraus?: number;
}): number {
  const { periodoDias, massaPlanetaMjup, massaEstrelaMsol, excentricidade = 0, inclinacaoGraus = 90 } = args;
  assertPositivo(periodoDias, "periodoDias");
  assertPositivo(massaPlanetaMjup, "massaPlanetaMjup");
  assertPositivo(massaEstrelaMsol, "massaEstrelaMsol");
  assertExcentricidade(excentricidade);
  const mp = massaPlanetaMjup * M_JUPITER;
  const ms = massaEstrelaMsol * M_SOL;
  const seno = Math.sin((inclinacaoGraus * Math.PI) / 180);
  const periodo = periodoDias * DIA;
  return (
    (((2 * Math.PI * G) / periodo) ** (1 / 3) * mp * seno) / (ms + mp) ** (2 / 3) / Math.sqrt(1 - excentricidade ** 2)
  );
}

/** Massa mínima (m·sin i, em massas de Júpiter) que uma semi-amplitude K (m/s) implica. Massa do planeta ≪ massa da estrela. */
export function massaMinimaMjup(args: {
  semiAmplitudeMs: number;
  periodoDias: number;
  massaEstrelaMsol: number;
  excentricidade?: number;
}): number {
  const { semiAmplitudeMs: K, periodoDias, massaEstrelaMsol, excentricidade = 0 } = args;
  assertPositivo(K, "semiAmplitudeMs");
  assertPositivo(periodoDias, "periodoDias");
  assertPositivo(massaEstrelaMsol, "massaEstrelaMsol");
  assertExcentricidade(excentricidade);
  const periodo = periodoDias * DIA;
  const ms = massaEstrelaMsol * M_SOL;
  const mp = (K * Math.sqrt(1 - excentricidade ** 2) * ms ** (2 / 3)) / ((2 * Math.PI * G) / periodo) ** (1 / 3);
  return mp / M_JUPITER;
}

/**
 * Velocidade radial (m/s) da estrela, `tempoDias` depois do periastro:
 * v = K·[cos(ν + ω) + e·cos ω].
 */
export function velocidadeRadialMs(args: {
  tempoDias: number;
  periodoDias: number;
  semiAmplitudeMs: number;
  excentricidade?: number;
  argumentoDoPeriastroGraus?: number;
}): number {
  const { tempoDias, periodoDias, semiAmplitudeMs: K, excentricidade = 0, argumentoDoPeriastroGraus = 90 } = args;
  const nu = anomaliaVerdadeiraNoTempo(tempoDias, periodoDias, excentricidade);
  const omega = (argumentoDoPeriastroGraus * Math.PI) / 180;
  return K * (Math.cos(nu + omega) + excentricidade * Math.cos(omega));
}
