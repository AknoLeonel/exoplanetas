import { carregarMetricas } from "../data/carregar";
import { anosLuz, decimal, milhar } from "../lib/formato";
import type { Metricas } from "../lib/tipos";
import { carregarSecao } from "./carga";
import { h } from "./dom";

export function montarTerra(m: Metricas): HTMLElement {
  return h(
    "ul",
    { class: "lista-terra" },
    ...m.parecidos_com_a_terra_mais_proximos.map((p) =>
      h(
        "li",
        {},
        h("strong", {}, p.pl_name),
        h(
          "dl",
          {},
          h("dt", {}, "Raio"),
          h("dd", {}, `${decimal(p.pl_rade, 2)}× a Terra`),
          h("dt", {}, "Luz recebida"),
          h("dd", {}, `${decimal(p.pl_insol, 2)}× a da Terra`),
          h("dt", {}, "Temperatura"),
          h("dd", {}, p.pl_eqt === null ? "—" : `${milhar(Math.round(p.pl_eqt))} K`),
          h("dt", {}, "Distância"),
          h("dd", {}, anosLuz(p.sy_dist)),
        ),
      ),
    ),
  );
}

export async function montar(host: HTMLElement): Promise<void> {
  await carregarSecao({
    host,
    nome: "terra",
    carregar: (aoProgredir) => carregarMetricas({ aoProgredir }),
    renderizar: montarTerra,
  });
}
