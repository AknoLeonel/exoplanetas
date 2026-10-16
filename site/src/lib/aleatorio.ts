/** Sorteios reproduzíveis: a mesma semente na URL desenha os mesmos pontos de ruído. */

/** Gerador pseudoaleatório pequeno e determinístico (mulberry32). Devolve números em [0, 1). */
export function aleatorio(semente: number): () => number {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal padrão por Box-Muller. */
export function gaussiano(sortear: () => number): number {
  const u = 1 - sortear(); // (0, 1]: evita log(0)
  const v = sortear();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
