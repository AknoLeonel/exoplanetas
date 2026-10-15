export type Tema = "claro" | "escuro";

const CHAVE = "tema";

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
  return janela.matchMedia?.("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

function aplicar(janela: Window, tema: Tema): void {
  janela.document.documentElement.dataset.tema = tema;
  try {
    janela.localStorage.setItem(CHAVE, tema);
  } catch {
    // Sem armazenamento (janela privada, por exemplo) a escolha vale só nesta visita.
  }
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
