import { h } from "./dom";

export interface Tooltip {
  elemento: HTMLElement;
  /** `x` e `y` em pixels dentro do contêiner. */
  mostrar(conteudo: HTMLElement, x: number, y: number): void;
  esconder(): void;
}

/**
 * Um único tooltip por gráfico. A posição segue o cursor sem animar (hover é frequente);
 * só o aparecer e o sumir têm transição curta, saindo do ponto onde o cursor está.
 */
export function criarTooltip(contenedor: HTMLElement): Tooltip {
  const corpo = h("div", { class: "tooltip-corpo" });
  const elemento = h("div", { class: "tooltip", "data-visivel": "false", role: "status" }, corpo);
  contenedor.append(elemento);

  return {
    elemento,
    mostrar(conteudo, x, y) {
      corpo.replaceChildren(conteudo);
      const largura = contenedor.clientWidth;
      const alturaCorpo = corpo.offsetHeight;
      const larguraCorpo = corpo.offsetWidth;
      // Vira para a esquerda e para cima quando faltaria espaço.
      const paraEsquerda = x + 16 + larguraCorpo > largura;
      const paraCima = y + 16 + alturaCorpo > contenedor.clientHeight;
      const px = paraEsquerda ? x - 16 - larguraCorpo : x + 16;
      const py = paraCima ? y - 16 - alturaCorpo : y + 16;
      elemento.style.transform = `translate(${Math.max(0, px)}px, ${Math.max(0, py)}px)`;
      corpo.style.setProperty("--origem", `${paraEsquerda ? "right" : "left"} ${paraCima ? "bottom" : "top"}`);
      elemento.dataset.visivel = "true";
    },
    esconder() {
      elemento.dataset.visivel = "false";
    },
  };
}
