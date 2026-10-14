import { h } from "./dom";

export interface LinhaDeBarra {
  rotulo: string;
  /** Texto à direita (o valor já formatado). */
  valor: string;
  /** De 0 a 1: comprimento relativo da barra. */
  fracao: number;
  detalhe?: string;
  cor?: string;
}

/** Barras horizontais. O comprimento é um `scaleX`, então a animação não mexe no layout. */
export function criarBarras(linhas: readonly LinhaDeBarra[]): HTMLElement {
  const lista = h("ul", { class: "barras", "data-visivel": "false" });
  for (const l of linhas) {
    const estilo = [`--v: ${Math.max(0, Math.min(1, l.fracao))}`, l.cor ? `--cor: ${l.cor}` : ""]
      .filter(Boolean)
      .join("; ");
    lista.append(
      h(
        "li",
        {},
        h("div", { class: "rotulo-linha" }, h("span", {}, l.rotulo), h("b", {}, l.valor)),
        h("div", { class: "trilho" }, h("div", { class: "preenchimento", style: estilo })),
        l.detalhe ? h("span", { class: "sub" }, l.detalhe) : null,
      ),
    );
  }
  return lista;
}
