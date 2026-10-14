import { criarProgresso } from "../lib/progresso";

export interface EstadoDoProgresso {
  fracao: number;
  pendentes: number;
}

const progresso = criarProgresso();
const ouvintes = new Set<(estado: EstadoDoProgresso) => void>();

function notificar(estado: EstadoDoProgresso): void {
  for (const ouvinte of ouvintes) ouvinte(estado);
}

/** Registra uma tarefa assíncrona (carga de código ou de dados) no progresso global do site. */
export async function acompanhar<T>(tarefa: Promise<T>): Promise<T> {
  progresso.adicionar();
  notificar({ fracao: progresso.fracao(), pendentes: progresso.pendentes() });
  try {
    return await tarefa;
  } finally {
    const antes = progresso.pendentes();
    progresso.concluir();
    // Ao terminar a última tarefa a rodada zera; avisamos como 100% antes disso.
    notificar({ fracao: antes === 1 ? 1 : progresso.fracao(), pendentes: progresso.pendentes() });
  }
}

export function aoMudarProgresso(ouvinte: (estado: EstadoDoProgresso) => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}
