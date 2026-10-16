import { escalaLinear, marcasLineares } from "../lib/escala";
import { type EscurecimentoDeBorda, intensidadeNoDisco, type PosicaoNoCeu } from "../lib/fisica/transito";
import { decimal, fracaoDoBrilho } from "../lib/formato";
import type { Curva } from "../lib/simulacao-transito";
import { criarTela, type Tela } from "./tela";

export interface EstadoDaEstrela {
  razaoDeRaios: number;
  escurecimento: EscurecimentoDeBorda;
  posicao: PosicaoNoCeu;
}

/** Meia largura da cena em raios estelares: cabe a entrada e a saída do planeta. */
const MEIA_CENA = 1.75;
const ANEIS_DO_DESENHO = 24;

/** A estrela vista da Terra, com o escurecimento de borda, e o planeta na posição do instante escolhido. */
export function criarVistaDaEstrela(estado: () => EstadoDaEstrela): Tela {
  return criarTela(
    "vista-estrela",
    "Disco da estrela com o planeta passando na frente.",
    (contexto, largura, altura, cores) => {
      const { razaoDeRaios, escurecimento, posicao } = estado();
      const raio = Math.min(altura * 0.42, largura / (2 * MEIA_CENA));
      const cx = largura / 2;
      const cy = altura / 2;

      contexto.beginPath();
      contexto.arc(cx, cy, raio, 0, Math.PI * 2);
      contexto.fillStyle = cores.estrela;
      contexto.fill();
      // Escurecimento de borda: anéis de sombra, mais opacos onde a intensidade é menor.
      const gradiente = contexto.createRadialGradient(cx, cy, 0, cx, cy, raio);
      for (let i = 0; i <= ANEIS_DO_DESENHO; i++) {
        const r = i / ANEIS_DO_DESENHO;
        const sombra = 1 - Math.max(0, intensidadeNoDisco(Math.min(r, 0.999), escurecimento));
        gradiente.addColorStop(r, `rgba(0, 0, 0, ${(0.85 * sombra).toFixed(3)})`);
      }
      contexto.fillStyle = gradiente;
      contexto.fill();

      // Atrás da estrela o planeta não aparece; na frente, é uma silhueta escura.
      if (!posicao.naFrente) return;
      const px = cx + posicao.x * raio;
      const py = cy - posicao.y * raio;
      contexto.beginPath();
      contexto.arc(px, py, Math.max(1.5, razaoDeRaios * raio), 0, Math.PI * 2);
      contexto.fillStyle = cores.planeta;
      contexto.fill();
      contexto.lineWidth = 1;
      contexto.strokeStyle = cores.texto3;
      contexto.stroke();
    },
  );
}

export interface EstadoDaCurva {
  curva: Curva;
  /** Curva do planeta do catálogo, para comparar; null sem planeta carregado. */
  referencia: Curva | null;
  tempoDias: number;
  fluxoAgora: number;
  /** Desvio do ruído, em fração do brilho. */
  ruido: number;
}

const MARGEM = { esquerda: 64, direita: 16, topo: 14, base: 40 };

/** Queda máxima que o eixo precisa mostrar: o fundo do trânsito, a curva de comparação e três desvios do ruído. */
function quedaDoEixo(e: EstadoDaCurva): number {
  let minimo = 1;
  for (const p of e.curva.modelo) minimo = Math.min(minimo, p.fluxo);
  for (const p of e.referencia?.modelo ?? []) minimo = Math.min(minimo, p.fluxo);
  return Math.max(1 - minimo + 3 * e.ruido, 1e-4) * 1.15;
}

/** Curva de luz: brilho relativo contra o tempo desde o meio do trânsito, em horas. */
export function criarCurvaDeLuz(estado: () => EstadoDaCurva): Tela {
  return criarTela(
    "vista-curva",
    "Curva de luz: brilho da estrela ao longo do trânsito.",
    (contexto, largura, altura, cores) => {
      const e = estado();
      const horas = e.curva.meiaJanelaDias * 24;
      const queda = quedaDoEixo(e);
      const folga = Math.max(queda * 0.12, 3 * e.ruido);
      const x = escalaLinear([-horas, horas], [MARGEM.esquerda, largura - MARGEM.direita]);
      // y em queda de brilho: 0 no alto, a queda máxima embaixo.
      const y = escalaLinear([-folga, queda], [MARGEM.topo, altura - MARGEM.base]);
      const base = altura - MARGEM.base;

      contexto.font = "11px system-ui, sans-serif";
      contexto.textBaseline = "middle";
      contexto.lineWidth = 1;
      contexto.strokeStyle = cores.grade;
      contexto.fillStyle = cores.texto3;
      contexto.textAlign = "right";
      for (const m of marcasLineares(queda, 4)) {
        const py = Math.round(y(m)) + 0.5;
        contexto.beginPath();
        contexto.moveTo(MARGEM.esquerda, py);
        contexto.lineTo(largura - MARGEM.direita, py);
        contexto.stroke();
        contexto.fillText(m === 0 ? "0" : `−${fracaoDoBrilho(m)}`, MARGEM.esquerda - 8, py);
      }
      contexto.textAlign = "center";
      for (const m of marcasLineares(horas, 3)) {
        for (const v of m === 0 ? [0] : [-m, m]) {
          const px = Math.round(x(v)) + 0.5;
          contexto.beginPath();
          contexto.moveTo(px, base);
          contexto.lineTo(px, base + 4);
          contexto.stroke();
          contexto.fillText(
            `${v > 0 ? "+" : v < 0 ? "−" : ""}${decimal(Math.abs(v), Math.abs(v) < 1 ? 2 : 1)} h`,
            px,
            base + 15,
          );
        }
      }
      contexto.fillStyle = cores.texto2;
      contexto.fillText("Tempo desde o meio do trânsito", (MARGEM.esquerda + largura - MARGEM.direita) / 2, altura - 8);
      contexto.save();
      contexto.translate(12, (MARGEM.topo + base) / 2);
      contexto.rotate(-Math.PI / 2);
      contexto.fillText("Queda do brilho", 0, 0);
      contexto.restore();

      const linha = (curva: Curva) => {
        contexto.beginPath();
        curva.modelo.forEach((p, i) => {
          const px = x(p.tempoDias * 24);
          const py = y(1 - p.fluxo);
          if (i === 0) contexto.moveTo(px, py);
          else contexto.lineTo(px, py);
        });
        contexto.stroke();
      };

      if (e.referencia) {
        contexto.setLineDash([5, 4]);
        contexto.strokeStyle = cores.texto3;
        contexto.lineWidth = 1.5;
        linha(e.referencia);
        contexto.setLineDash([]);
      }
      if (e.curva.medida !== e.curva.modelo) {
        contexto.fillStyle = cores.texto3;
        contexto.globalAlpha = 0.55;
        for (const p of e.curva.medida) contexto.fillRect(x(p.tempoDias * 24) - 1, y(1 - p.fluxo) - 1, 2, 2);
        contexto.globalAlpha = 1;
      }
      contexto.strokeStyle = cores.destaque;
      contexto.lineWidth = 2;
      linha(e.curva);

      // Instante mostrado na vista da estrela.
      const px = x(e.tempoDias * 24);
      contexto.strokeStyle = cores.texto3;
      contexto.lineWidth = 1;
      contexto.beginPath();
      contexto.moveTo(px, MARGEM.topo);
      contexto.lineTo(px, base);
      contexto.stroke();
      contexto.beginPath();
      contexto.arc(px, y(1 - e.fluxoAgora), 4, 0, Math.PI * 2);
      contexto.fillStyle = cores.destaque;
      contexto.fill();
    },
  );
}
