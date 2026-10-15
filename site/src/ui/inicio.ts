import { type DefinicaoDeModulo, MODULOS, NOMES_DOS_MODOS } from "../lib/modulos";
import { montarHash } from "../lib/rota";
import { trocar } from "./animacao";
import { h } from "./dom";
import type { ContextoDoModulo } from "./shell";

function cartaoDoModulo(m: DefinicaoDeModulo): HTMLElement {
  const modos = h("p", { class: "cartao-modulo-modos" }, m.modos.map((modo) => NOMES_DOS_MODOS[modo].nome).join(" · "));
  if (m.status === "disponivel") {
    return h(
      "a",
      { class: "cartao-modulo", href: montarHash({ modulo: m.id, modo: "explorar", parametros: {} }) },
      h("h3", {}, m.titulo),
      h("p", {}, m.resumo),
      modos,
    );
  }
  return h(
    "div",
    { class: "cartao-modulo em-breve", "aria-disabled": "true" },
    h("span", { class: "selo" }, "Em breve"),
    h("h3", {}, m.titulo),
    h("p", {}, m.resumo),
    modos,
  );
}

export function montarInicio(): HTMLElement {
  const modulos = MODULOS.filter((m) => m.id !== "inicio");
  return h(
    "div",
    { class: "inicio" },
    h(
      "section",
      { class: "hero" },
      h("h1", {}, "Laboratório de astrofísica"),
      h(
        "p",
        { class: "lead" },
        "Um lugar para estudar e para explorar: astronomia, astrofísica, análise de dados e machine learning, com os dados reais da NASA.",
      ),
    ),
    h(
      "section",
      { class: "secao", "aria-labelledby": "t-modos" },
      h("header", {}, h("h2", { id: "t-modos" }, "Dois jeitos de usar cada módulo")),
      h(
        "div",
        { class: "grade-2" },
        h(
          "div",
          { class: "painel" },
          h("h3", {}, "Aprender"),
          h(
            "p",
            { class: "sub" },
            `${NOMES_DOS_MODOS.aprender.dica}. Cada passo mostra a conta e pede para você mexer em um controle.`,
          ),
        ),
        h(
          "div",
          { class: "painel" },
          h("h3", {}, "Explorar"),
          h(
            "p",
            { class: "sub" },
            `${NOMES_DOS_MODOS.explorar.dica}. Sem explicação no caminho, com exportação dos resultados.`,
          ),
        ),
      ),
    ),
    h(
      "section",
      { class: "secao", "aria-labelledby": "t-modulos" },
      h("header", {}, h("h2", { id: "t-modulos" }, "Módulos")),
      h("div", { class: "grade-modulos" }, ...modulos.map(cartaoDoModulo)),
    ),
  );
}

export async function montar(ctx: ContextoDoModulo): Promise<void> {
  await trocar(ctx.host, ctx.host.querySelector<HTMLElement>("[data-skeleton]"), montarInicio());
}
