import { aoMudarProgresso } from "../data/acompanhar";
import { duracao } from "./animacao";

/** Barra fina no topo: preenche conforme as tarefas terminam e some ao concluir a última. */
export function montarBarraGlobal(barra: HTMLElement): () => void {
  const preenchimento = barra.querySelector("span") as HTMLElement | null;
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  const parar = aoMudarProgresso(({ fracao, pendentes }) => {
    clearTimeout(temporizador);
    if (!preenchimento) return;
    // Mostra sempre ao menos uma pontinha, para a carga em andamento ser visível.
    preenchimento.style.transform = `scaleX(${Math.max(fracao, 0.08)})`;
    if (pendentes > 0) {
      barra.dataset.estado = "ativo";
      return;
    }
    // Termina em 100%, espera um instante e some (a saída é uma transição de opacidade).
    temporizador = setTimeout(() => {
      barra.dataset.estado = "oculto";
      temporizador = setTimeout(() => {
        preenchimento.style.transform = "scaleX(0)";
      }, duracao("--dur-saida") + 40);
    }, duracao("--dur-entrada") + 60);
  });
  return () => {
    clearTimeout(temporizador);
    parar();
  };
}
