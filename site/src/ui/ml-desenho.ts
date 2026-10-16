import { escalaLog, marcasLog } from "../lib/escala";
import { eixo } from "../lib/formato";
import type { PlanetaDoTreino } from "../lib/modelo-raio";
import { criarTela, type Tela } from "./tela";

export interface EstadoDoGraficoML {
  planetas: readonly PlanetaDoTreino[];
  /** A previsão atual: massa da entrada, raio previsto e o intervalo de 80%. */
  previsao: { massa: number; raio: number; inferior: number; superior: number };
  /** Planeta do treino carregado, com o raio medido; null sem planeta. */
  destaque: PlanetaDoTreino | null;
  /** A entrada está fora dos dados de treino em alguma variável. */
  extrapolando: boolean;
}

/** Domínio fixo, para o gráfico não pular de escala ao mexer nos controles. */
const DOMINIO_MASSA: readonly [number, number] = [0.01, 30_000];
const DOMINIO_RAIO: readonly [number, number] = [0.2, 40];
const MARGEM = { esquerda: 56, direita: 16, topo: 12, base: 42 };

function limitar(v: number, [a, b]: readonly [number, number]): number {
  return Math.min(b, Math.max(a, v));
}

/** Massa × raio dos planetas do treino (log × log), com a previsão e o intervalo por cima. */
export function criarGraficoML(estado: () => EstadoDoGraficoML): Tela {
  return criarTela(
    "vista-curva grafico-ml",
    "Massa contra raio dos planetas usados no treino, com a previsão atual e o intervalo de 80%.",
    (contexto, largura, altura, cores) => {
      const e = estado();
      const x = escalaLog(DOMINIO_MASSA, [MARGEM.esquerda, largura - MARGEM.direita]);
      const y = escalaLog(DOMINIO_RAIO, [altura - MARGEM.base, MARGEM.topo]);
      const base = altura - MARGEM.base;

      contexto.font = "11px system-ui, sans-serif";
      contexto.textBaseline = "middle";
      contexto.lineWidth = 1;
      contexto.strokeStyle = cores.grade;
      contexto.fillStyle = cores.texto3;
      contexto.textAlign = "center";
      for (const m of marcasLog(...DOMINIO_MASSA)) {
        if (!m.principal) continue;
        const px = Math.round(x(m.valor)) + 0.5;
        contexto.beginPath();
        contexto.moveTo(px, MARGEM.topo);
        contexto.lineTo(px, base);
        contexto.stroke();
        contexto.fillText(eixo(m.valor), px, base + 14);
      }
      contexto.textAlign = "right";
      for (const m of marcasLog(...DOMINIO_RAIO)) {
        if (!m.principal && m.valor !== 5) continue;
        const py = Math.round(y(m.valor)) + 0.5;
        contexto.beginPath();
        contexto.moveTo(MARGEM.esquerda, py);
        contexto.lineTo(largura - MARGEM.direita, py);
        contexto.stroke();
        contexto.fillText(eixo(m.valor), MARGEM.esquerda - 8, py);
      }
      contexto.fillStyle = cores.texto2;
      contexto.textAlign = "center";
      contexto.fillText("Massa (Terra = 1)", (MARGEM.esquerda + largura - MARGEM.direita) / 2, altura - 8);
      contexto.save();
      contexto.translate(12, (MARGEM.topo + base) / 2);
      contexto.rotate(-Math.PI / 2);
      contexto.fillText("Raio (Terra = 1)", 0, 0);
      contexto.restore();

      // Planetas do treino.
      contexto.globalAlpha = 0.45;
      contexto.fillStyle = cores.texto3;
      contexto.beginPath();
      for (const p of e.planetas) {
        const px = x(limitar(p.massaMterra, DOMINIO_MASSA));
        const py = y(limitar(p.raioRterra, DOMINIO_RAIO));
        contexto.moveTo(px + 2, py);
        contexto.arc(px, py, 2, 0, Math.PI * 2);
      }
      contexto.fill();
      contexto.globalAlpha = 1;

      // Raio medido do planeta carregado.
      if (e.destaque) {
        const px = x(limitar(e.destaque.massaMterra, DOMINIO_MASSA));
        const py = y(limitar(e.destaque.raioRterra, DOMINIO_RAIO));
        contexto.beginPath();
        contexto.arc(px, py, 6, 0, Math.PI * 2);
        contexto.lineWidth = 2;
        contexto.strokeStyle = cores.texto;
        contexto.stroke();
      }

      // Previsão e intervalo de 80%.
      const { massa, raio, inferior, superior } = e.previsao;
      const px = x(limitar(massa, DOMINIO_MASSA));
      const cor = e.extrapolando ? cores.afastando : cores.destaque;
      contexto.strokeStyle = cor;
      contexto.lineWidth = 2;
      contexto.beginPath();
      contexto.moveTo(px, y(limitar(inferior, DOMINIO_RAIO)));
      contexto.lineTo(px, y(limitar(superior, DOMINIO_RAIO)));
      for (const r of [inferior, superior]) {
        const py = y(limitar(r, DOMINIO_RAIO));
        contexto.moveTo(px - 5, py);
        contexto.lineTo(px + 5, py);
      }
      contexto.stroke();
      contexto.beginPath();
      contexto.arc(px, y(limitar(raio, DOMINIO_RAIO)), 5, 0, Math.PI * 2);
      contexto.fillStyle = cor;
      contexto.fill();
    },
  );
}
