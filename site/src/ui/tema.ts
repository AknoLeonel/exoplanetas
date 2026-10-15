export type Tema = "claro" | "escuro";

/** Chave do localStorage. O script do <head> do index.html usa a mesma (um teste confere). */
export const CHAVE_DO_TEMA = "tema";
const CHAVE = CHAVE_DO_TEMA;

function guardado(janela: Window): Tema | null {
  try {
    const v = janela.localStorage.getItem(CHAVE);
    return v === "claro" || v === "escuro" ? v : null;
  } catch {
    return null;
  }
}

/** O tema que está valendo: a escolha manual, ou a preferência do sistema. */
export function temaAtual(janela: Window = window): Tema {
  const manual = janela.document.documentElement.dataset.tema;
  if (manual === "claro" || manual === "escuro") return manual;
  return doSistema(janela);
}

function doSistema(janela: Window): Tema {
  return janela.matchMedia?.("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

/**
 * Aplica o tema e o lembra. Se a escolha é igual ao tema do sistema, a escolha manual some e a página volta
 * a acompanhar o sistema: é assim que se desfaz uma escolha, sem precisar de um terceiro botão.
 */
function aplicar(janela: Window, tema: Tema): void {
  const acompanhaOSistema = tema === doSistema(janela);
  try {
    if (acompanhaOSistema) janela.localStorage.removeItem(CHAVE);
    else janela.localStorage.setItem(CHAVE, tema);
  } catch {
    // Sem armazenamento (janela privada, por exemplo) a escolha vale só nesta visita.
  }
  if (acompanhaOSistema) delete janela.document.documentElement.dataset.tema;
  else janela.document.documentElement.dataset.tema = tema;
  // O gráfico em canvas não enxerga o CSS mudar sozinho: ele escuta este evento para redesenhar.
  janela.dispatchEvent(new Event("tema-alterado"));
}

/**
 * Liga o botão que alterna claro/escuro. A escolha fica salva; sem escolha, vale o tema do sistema.
 * `aria-pressed` diz se o tema escuro está ativo.
 */
export function iniciarTema(botao: HTMLElement, janela: Window = window): () => void {
  const salvo = guardado(janela);
  if (salvo) janela.document.documentElement.dataset.tema = salvo;
  const sincronizar = () => botao.setAttribute("aria-pressed", String(temaAtual(janela) === "escuro"));
  const aoClicar = () => {
    aplicar(janela, temaAtual(janela) === "escuro" ? "claro" : "escuro");
    sincronizar();
  };
  sincronizar();
  botao.addEventListener("click", aoClicar);
  const esquema = janela.matchMedia?.("(prefers-color-scheme: dark)");
  esquema?.addEventListener("change", sincronizar);
  return () => {
    botao.removeEventListener("click", aoClicar);
    esquema?.removeEventListener("change", sincronizar);
  };
}
