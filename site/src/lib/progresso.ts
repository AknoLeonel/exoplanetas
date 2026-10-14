export interface Progresso {
  /** Registra `n` tarefas novas. */
  adicionar(n?: number): void;
  /** Marca `n` tarefas como concluídas. */
  concluir(n?: number): void;
  /** De 0 a 1. Sem tarefas, 1. */
  fracao(): number;
  /** Quantas tarefas ainda não terminaram. */
  pendentes(): number;
}

/** Contador de tarefas. Quando a última termina, zera, e a próxima rodada começa do zero. */
export function criarProgresso(): Progresso {
  let total = 0;
  let feitas = 0;
  return {
    adicionar(n = 1) {
      total += n;
    },
    concluir(n = 1) {
      feitas = Math.min(total, feitas + n);
      if (feitas === total) {
        total = 0;
        feitas = 0;
      }
    },
    fracao() {
      return total === 0 ? 1 : feitas / total;
    },
    pendentes() {
      return total - feitas;
    },
  };
}
