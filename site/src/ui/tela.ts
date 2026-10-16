import { h } from "./dom";

/** Cores dos simuladores em canvas, lidas dos tokens do CSS para acompanhar o tema. */
interface CoresDaTela {
  texto: string;
  texto2: string;
  texto3: string;
  grade: string;
  destaque: string;
  estrela: string;
  planeta: string;
  aproximando: string;
  afastando: string;
}

function lerCoresDaTela(): CoresDaTela {
  const estilo = getComputedStyle(document.documentElement);
  const v = (nome: string, padrao: string) => estilo.getPropertyValue(nome).trim() || padrao;
  return {
    texto: v("--texto", "#000"),
    texto2: v("--texto-2", "#555"),
    texto3: v("--texto-3", "#777"),
    grade: v("--grade", "rgba(0,0,0,.08)"),
    destaque: v("--destaque", "#2a78d6"),
    estrela: v("--estrela", "#f4b63f"),
    planeta: v("--planeta", "#141413"),
    aproximando: v("--aproximando", "#2a78d6"),
    afastando: v("--afastando", "#d03b2a"),
  };
}

export type Pintor = (contexto: CanvasRenderingContext2D, largura: number, altura: number, cores: CoresDaTela) => void;

export interface Tela {
  elemento: HTMLElement;
  canvas: HTMLCanvasElement;
  /** Pede um redesenho no próximo quadro (vários pedidos no mesmo quadro viram um). */
  agendar(): void;
  destruir(): void;
}

/** Canvas que acompanha o tamanho da caixa, a densidade de pixels e o tema. */
export function criarTela(classe: string, rotulo: string, pintar: Pintor): Tela {
  const canvas = h("canvas", { role: "img", "aria-label": rotulo });
  const elemento = h("div", { class: classe }, canvas);
  const contexto = canvas.getContext("2d");
  let largura = 0;
  let altura = 0;
  let quadro = 0;
  let cores: CoresDaTela | null = null;

  function desenhar(): void {
    if (!contexto || largura === 0) return;
    cores ??= lerCoresDaTela();
    const dpr = window.devicePixelRatio || 1;
    contexto.setTransform(dpr, 0, 0, dpr, 0, 0);
    contexto.clearRect(0, 0, largura, altura);
    pintar(contexto, largura, altura, cores);
  }

  function agendar(): void {
    if (quadro) return;
    quadro = requestAnimationFrame(() => {
      quadro = 0;
      desenhar();
    });
  }

  function medir(): void {
    const caixa = elemento.getBoundingClientRect();
    largura = Math.max(1, Math.floor(caixa.width));
    altura = Math.max(1, Math.floor(caixa.height));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(largura * dpr);
    canvas.height = Math.floor(altura * dpr);
    agendar();
  }

  const observador = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
  observador?.observe(elemento);
  const esquema = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  const aoTrocarDeTema = () => {
    cores = null;
    agendar();
  };
  esquema?.addEventListener("change", aoTrocarDeTema);
  window.addEventListener("tema-alterado", aoTrocarDeTema);
  medir();

  return {
    elemento,
    canvas,
    agendar,
    destruir() {
      cancelAnimationFrame(quadro);
      observador?.disconnect();
      esquema?.removeEventListener("change", aoTrocarDeTema);
      window.removeEventListener("tema-alterado", aoTrocarDeTema);
    },
  };
}
