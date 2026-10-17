import { acompanhar } from "../data/acompanhar";
import { erro as registrarErro } from "../telemetry";
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

function painelDeErro(mensagem: string, tentarDeNovo: () => void, rotulo = "Tentar de novo"): HTMLElement {
  const botao = h("button", { class: "botao", type: "button" }, rotulo);
  botao.addEventListener("click", () => {
    // Um clique só: o painel ainda está saindo e outro clique abriria uma segunda tentativa.
    botao.disabled = true;
    tentarDeNovo();
  });
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
      registrarErro(e, { secao: pedido.nome });
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

export interface ModuloDeSecao {
  montar(host: HTMLElement): Promise<void>;
}

/** As mensagens que os navegadores dão quando o arquivo de um `import()` não existe mais (Chrome, Firefox, Safari). */
const FALHA_DE_ARQUIVO = /dynamically imported module|importing a module script failed|module script failed/i;
const CHAVE_DA_RECARGA = "exoplanetas:recarregou-por-versao-nova";

export function ehFalhaDeArquivo(e: unknown): boolean {
  return e instanceof Error && FALHA_DE_ARQUIVO.test(e.message);
}

/** Recarrega uma vez só por sessão: sem esse guarda, um arquivo que continua faltando viraria um laço de recargas. */
function recarregarUmaVez(recarregar: () => void): boolean {
  try {
    if (sessionStorage.getItem(CHAVE_DA_RECARGA)) return false;
    sessionStorage.setItem(CHAVE_DA_RECARGA, "1");
  } catch {
    return false;
  }
  recarregar();
  return true;
}

function liberarRecarga(): void {
  try {
    sessionStorage.removeItem(CHAVE_DA_RECARGA);
  } catch {
    // Sem sessionStorage, a recarga automática simplesmente não acontece.
  }
}

export interface ModuloDeSecao {
  montar(host: HTMLElement): Promise<void>;
}

const recarregarPagina = (): void => window.location.reload();

/**
 * Baixa o código de uma seção e o monta. Se o código não chegar, mostra o mesmo painel de erro com
 * "Tentar de novo" das falhas de dados, em vez de deixar o skeleton parado.
 * Se o arquivo sumiu porque saiu um deploy novo (o `index.html` desta aba é antigo), repetir o `import()`
 * falharia para sempre: a página recarrega uma vez sozinha e, se ainda falhar, o botão recarrega em vez de repetir.
 */
export async function iniciarSecao(
  host: HTMLElement,
  nome: string,
  importar: () => Promise<ModuloDeSecao>,
  recarregar: () => void = recarregarPagina,
): Promise<void> {
  const skeleton = host.querySelector<HTMLElement>("[data-skeleton]");
  let modulo: ModuloDeSecao;
  try {
    modulo = await importarModulo(importar());
  } catch (e) {
    registrarErro(e, { secao: nome, etapa: "modulo" });
    const versaoNova = ehFalhaDeArquivo(e);
    if (versaoNova && recarregarUmaVez(recarregar)) return;
    if (!skeleton) return;
    const mensagem = versaoNova
      ? "O site foi atualizado enquanto esta página estava aberta. Recarregue para pegar a versão nova."
      : e instanceof Error
        ? e.message
        : "Erro desconhecido.";
    const erro = painelDeErro(
      mensagem,
      () => {
        if (versaoNova) return recarregar();
        host.setAttribute("aria-busy", "true");
        void trocar(host, erro, skeleton).then(() => iniciarSecao(host, nome, importar, recarregar));
      },
      versaoNova ? "Recarregar a página" : "Tentar de novo",
    );
    await trocar(host, skeleton, erro);
    host.setAttribute("aria-busy", "false");
    return;
  }
  liberarRecarga();
  await modulo.montar(host);
}
