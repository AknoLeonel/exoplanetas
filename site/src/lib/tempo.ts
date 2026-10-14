/** "240ms" -> 240, "0.24s" -> 240, "0.01ms" -> 0.01. Devolve null se não for um tempo CSS. */
export function paraMs(valor: string): number | null {
  const m = /^\s*(-?\d*\.?\d+)\s*(ms|s)\s*$/.exec(valor);
  if (!m) return null;
  const n = Number.parseFloat(m[1] ?? "");
  return m[2] === "s" ? n * 1000 : n;
}
