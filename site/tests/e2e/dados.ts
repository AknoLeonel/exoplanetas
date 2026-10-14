import { readFileSync } from "node:fs";
import { lerPlanetas } from "../../src/lib/planetas";
import type { Metricas } from "../../src/lib/tipos";

const PASTA = new URL("../../public/dados/", import.meta.url);

/** Os mesmos arquivos que a página baixa: o teste confere a tela contra eles. */
export function planetas() {
  return lerPlanetas(JSON.parse(readFileSync(new URL("planetas.json", PASTA), "utf-8")));
}

export function metricas(): Metricas {
  return JSON.parse(readFileSync(new URL("metricas.json", PASTA), "utf-8"));
}
