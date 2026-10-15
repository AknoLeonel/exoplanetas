import { DIA, G, M_SOL, UA } from "./constantes";

/** Período orbital (dias) pela terceira lei de Kepler. Massas em massas solares, semi-eixo em UA. */
export function periodoOrbitalDias(semiEixoUA: number, massaEstrelaMsol: number, massaPlanetaMsol = 0): number {
  assertPositivo(semiEixoUA, "semiEixoUA");
  assertPositivo(massaEstrelaMsol, "massaEstrelaMsol");
  const a = semiEixoUA * UA;
  const massaTotal = (massaEstrelaMsol + massaPlanetaMsol) * M_SOL;
  return (2 * Math.PI * Math.sqrt(a ** 3 / (G * massaTotal))) / DIA;
}

/** Semi-eixo maior (UA) a partir do período (dias): a inversa de `periodoOrbitalDias`. */
export function semiEixoUA(periodoDias: number, massaEstrelaMsol: number, massaPlanetaMsol = 0): number {
  assertPositivo(periodoDias, "periodoDias");
  assertPositivo(massaEstrelaMsol, "massaEstrelaMsol");
  const massaTotal = (massaEstrelaMsol + massaPlanetaMsol) * M_SOL;
  const periodo = periodoDias * DIA;
  return (G * massaTotal * (periodo / (2 * Math.PI)) ** 2) ** (1 / 3) / UA;
}

/**
 * Resolve a equação de Kepler, M = E − e·sin E, para a anomalia excêntrica E (rad).
 * Newton-Raphson, com ponto de partida que converge também para excentricidades altas.
 */
export function anomaliaExcentrica(anomaliaMedia: number, excentricidade: number): number {
  assertExcentricidade(excentricidade);
  const M = ((anomaliaMedia % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let E = excentricidade < 0.8 ? M : Math.PI;
  for (let i = 0; i < 50; i++) {
    const passo = (E - excentricidade * Math.sin(E) - M) / (1 - excentricidade * Math.cos(E));
    E -= passo;
    if (Math.abs(passo) < 1e-13) break;
  }
  return E;
}

/** Anomalia verdadeira (rad, em [0, 2π)) a partir da excêntrica. */
export function anomaliaVerdadeira(anomaliaExcentricaRad: number, excentricidade: number): number {
  assertExcentricidade(excentricidade);
  const E = anomaliaExcentricaRad;
  const nu =
    2 * Math.atan2(Math.sqrt(1 + excentricidade) * Math.sin(E / 2), Math.sqrt(1 - excentricidade) * Math.cos(E / 2));
  return (nu + 2 * Math.PI) % (2 * Math.PI);
}

/** Anomalia verdadeira (rad) no instante `tempoDias` depois da passagem pelo periastro. */
export function anomaliaVerdadeiraNoTempo(tempoDias: number, periodoDias: number, excentricidade: number): number {
  assertPositivo(periodoDias, "periodoDias");
  const M = (2 * Math.PI * tempoDias) / periodoDias;
  return anomaliaVerdadeira(anomaliaExcentrica(M, excentricidade), excentricidade);
}

/** Distância ao astro central (mesma unidade do semi-eixo) para uma anomalia verdadeira. */
export function distanciaOrbital(semiEixo: number, excentricidade: number, anomaliaVerdadeiraRad: number): number {
  assertExcentricidade(excentricidade);
  return (semiEixo * (1 - excentricidade ** 2)) / (1 + excentricidade * Math.cos(anomaliaVerdadeiraRad));
}

export function assertPositivo(valor: number, nome: string): void {
  if (!Number.isFinite(valor) || valor <= 0)
    throw new RangeError(`${nome} precisa ser um número positivo (recebeu ${valor})`);
}

export function assertExcentricidade(e: number): void {
  if (!Number.isFinite(e) || e < 0 || e >= 1)
    throw new RangeError(`a excentricidade precisa estar em [0, 1) (recebeu ${e})`);
}
