import { trocar } from "./animacao";
import { iniciarSecao, type ModuloDeSecao } from "./carga";
import { h } from "./dom";
import { quandoVisivel } from "./lazy";
import type { ContextoDoModulo } from "./shell";

/** Cada seção carrega o próprio código e os próprios dados só quando chega perto da tela. */
const SECOES: Record<string, () => Promise<ModuloDeSecao>> = {
  resumo: () => import("./resumo"),
  explorador: () => import("./explorador"),
  descobertas: () => import("./descobertas"),
  modelo: () => import("./modelo"),
  terra: () => import("./terra"),
};

export function iniciarSecoes(raiz: ParentNode): void {
  for (const host of raiz.querySelectorAll<HTMLElement>("[data-secao]")) {
    const nome = host.dataset.secao ?? "";
    const carregarModulo = SECOES[nome];
    if (!carregarModulo) continue;
    quandoVisivel(host, () => void iniciarSecao(host, nome, carregarModulo));
  }
}

/** O catálogo é o conteúdo que já existia: o molde vem do `<template id="modelo-catalogo">` do HTML. */
export async function montar(ctx: ContextoDoModulo): Promise<void> {
  const molde = document.getElementById("modelo-catalogo");
  if (!(molde instanceof HTMLTemplateElement)) throw new Error("O molde do catálogo não está na página.");
  const pagina = h("div", { class: "catalogo" });
  pagina.append(molde.content.cloneNode(true));
  await trocar(ctx.host, ctx.host.querySelector<HTMLElement>("[data-skeleton]"), pagina);
  iniciarSecoes(pagina);
}
