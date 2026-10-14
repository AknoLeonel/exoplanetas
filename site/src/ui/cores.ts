import type { IdClasse } from "../lib/tipos";

export interface Cores {
  texto: string;
  texto2: string;
  texto3: string;
  grade: string;
  superficie: string;
  deserto: string;
  desertoBorda: string;
  classes: Record<IdClasse, string>;
}

/** Lê os tokens de cor do CSS, para o canvas acompanhar o tema claro ou escuro. */
export function lerCores(): Cores {
  const estilo = getComputedStyle(document.documentElement);
  const v = (nome: string, padrao: string) => estilo.getPropertyValue(nome).trim() || padrao;
  return {
    texto: v("--texto", "#000"),
    texto2: v("--texto-2", "#555"),
    texto3: v("--texto-3", "#777"),
    grade: v("--grade", "rgba(0,0,0,.08)"),
    superficie: v("--superficie", "#fff"),
    deserto: v("--deserto", "rgba(235,104,52,.12)"),
    desertoBorda: v("--deserto-borda", "#eb6834"),
    classes: {
      terra: v("--classe-terra", "#8ecae6"),
      "super-terra": v("--classe-super-terra", "#4aa3d9"),
      netuno: v("--classe-netuno", "#2a78d6"),
      jupiter: v("--classe-jupiter", "#1d54a8"),
      "super-jupiter": v("--classe-super-jupiter", "#10306b"),
    },
  };
}
