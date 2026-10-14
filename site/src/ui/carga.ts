import { acompanhar } from "../data/acompanhar";
import * as telemetria from "../telemetry";
import { trocar } from "./animacao";
import { h } from "./dom";

export interface PedidoDeCarga<T> {
  /** Elemento da seção; o skeleton é o filho marcado com `data-skeleton`. */
  host: HTMLElement;
  nome: string;
  carregar(aoProgredir: (fracao: number | null) => void): Promise<T>;
  renderizar(dados: T): HTMLElement;
  /** Roda depois que o conteúdo entrou (por exemplo, para disparar a animação das barras). */
  aposMontar?(conteudo: HTMLElement): void;
}

function atualizarBarra(skeleton: HTMLElement, fracao: number | null): void {
  const barra = skeleton.querySelector<HTMLElement>(".progresso-secao");
  if (!barra) return;
  if (fracao === null) {
    barra.setAttribute("data-indeterminado", "");
    barra.style.removeProperty("--fracao");
    return;
  }
  barra.removeAttribute("data-indeterminado");
  barra.style.setProperty("--fracao", String(fracao));
}

function painelDeErro(mensagem: string, tentarDeNovo: () => void): HTMLElement {
  const botao = h("button", { class: "botao", type: "button" }, "Tentar de novo");
  botao.addEventListener("click", tentarDeNovo);
  return h(
    "div",
    { class: "erro", role: "alert" },
    h("strong", {}, "Não foi possível carregar esta seção."),
    h("span", {}, mensagem),
    botao,
  );
}

/**
 * Mostra o skeleton, carrega, e troca por conteúdo (ou por um erro com "Tentar de novo").
 * Cada passo registra no progresso global e na telemetria.
 */
export async function carregarSecao<T>(pedido: PedidoDeCarga<T>): Promise<void> {
  const { host } = pedido;
  const skeleton = host.querySelector<HTMLElement>("[data-skeleton]");
  if (!skeleton) throw new Error(`seção ${pedido.nome} sem skeleton`);
  let atual: HTMLElement = skeleton;

  const tentar = async (): Promise<void> => {
    host.setAttribute("aria-busy", "true");
    try {
      const dados = await pedido.carregar((fracao) => atualizarBarra(skeleton, fracao));
      const conteudo = pedido.renderizar(dados);
      await trocar(host, atual, conteudo);
      pedido.aposMontar?.(conteudo);
    } catch (e) {
      telemetria.erro(e, { secao: pedido.nome });
      const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
      const erro = painelDeErro(mensagem, () => {
        // O erro sai e o skeleton volta antes de nova tentativa.
        const anterior = atual;
        atual = skeleton;
        void trocar(host, anterior, skeleton).then(tentar);
      });
      await trocar(host, atual, erro);
      atual = erro;
    } finally {
      host.setAttribute("aria-busy", "false");
    }
  };
  await tentar();
}

/** Importa o módulo de uma seção registrando a carga de código no progresso. */
export function importarModulo<M>(importacao: Promise<M>): Promise<M> {
  return acompanhar(importacao);
}
