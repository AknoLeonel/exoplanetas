import { type Modo, NOMES_DOS_MODOS } from "../lib/modulos";
import { h } from "./dom";

export interface OpcoesDoAlternador {
  modos: readonly Modo[];
  atual: Modo;
  aoEscolher(modo: Modo): void;
}

/** Dois botões lado a lado: o modo atual fica com `aria-pressed="true"`. */
export function criarAlternador({ modos, atual, aoEscolher }: OpcoesDoAlternador): HTMLElement {
  const grupo = h("div", { class: "alternador", role: "group", "aria-label": "Modo de uso" });
  for (const modo of modos) {
    const { nome, dica } = NOMES_DOS_MODOS[modo];
    const botao = h(
      "button",
      { type: "button", class: "alternador-opcao", "aria-pressed": String(modo === atual), title: dica },
      nome,
    );
    botao.addEventListener("click", () => {
      if (modo !== atual) aoEscolher(modo);
    });
    grupo.append(botao);
  }
  return grupo;
}
