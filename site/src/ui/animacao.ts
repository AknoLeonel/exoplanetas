import { paraMs } from "../lib/tempo";

export type TokenDeTempo = "--dur-entrada" | "--dur-saida" | "--dur-rapida" | "--dur-barra";

/** Duração em ms de um token de movimento (definidos em estilos/tokens.css). Com movimento reduzido, ~0. */
export function duracao(token: TokenDeTempo): number {
  // Os tokens vivem em :root, então lê-los de lá não depende de herança.
  const valor = getComputedStyle(document.documentElement).getPropertyValue(token);
  return paraMs(valor) ?? 0;
}

export function reduzMovimento(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function proximoQuadro(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") return resolve();
    // Dois quadros garantem que o estado inicial foi pintado antes de mudar para o final.
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Estado `entrando` -> `pronto`: opacidade e deslocamento por transição, que pode ser interrompida. */
export async function entrar(el: HTMLElement): Promise<void> {
  el.dataset.anim = "entrando";
  await proximoQuadro();
  if (el.dataset.anim === "entrando") el.dataset.anim = "pronto";
}

/** Anima a saída e espera terminar. Quem chama remove o elemento. */
export async function sair(el: HTMLElement): Promise<void> {
  el.dataset.anim = "saindo";
  await esperar(duracao("--dur-saida") + 20);
}

/**
 * Troca o conteúdo de `host`: o antigo sai e o novo entra sobrepostos, então o layout não salta.
 * Sem movimento reduzido a troca é instantânea porque as durações viram ~0.
 */
export async function trocar(host: HTMLElement, antigo: HTMLElement | null, novo: HTMLElement): Promise<void> {
  host.classList.add("troca");
  host.append(novo);
  const entrada = entrar(novo);
  if (antigo?.isConnected) {
    await sair(antigo);
    antigo.remove();
  }
  await entrada;
  await esperar(duracao("--dur-entrada"));
  host.classList.remove("troca");
}
