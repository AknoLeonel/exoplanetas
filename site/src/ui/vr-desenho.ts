import { escalaLinear, marcasLineares } from "../lib/escala";
import { decimal } from "../lib/formato";
import type { CurvaVR, PosicaoNoPlano } from "../lib/simulacao-velocidade-radial";
import { criarTela, type Tela } from "./tela";

export interface EstadoDaOrbita {
  /** Trajeto do planeta numa volta, em UA, em volta do centro de massa. */
  trajeto: readonly PosicaoNoPlano[];
  planeta: PosicaoNoPlano;
  estrela: PosicaoNoPlano;
  /** Maior afastamento da estrela ao centro de massa numa volta, em UA. */
  balancoMaximo: number;
  /** Velocidade radial da estrela agora (m/s): positivo = se afastando. */
  velocidadeMs: number;
  /** Maior |velocidade| numa volta, para a cor do Doppler ir de neutra a cheia. */
  velocidadeMaximaMs: number;
}

/** Fração da cena que o balanço da estrela ocupa no desenho: sem exagero, ele seria invisível. */
const BALANCO_NA_CENA = 0.14;

/** Rótulo do exagero aplicado ao balanço da estrela. */
export function textoDoExagero(fator: number): string {
  if (fator < 1.5) return "Balanço da estrela em escala real";
  const potencia = 10 ** Math.floor(Math.log10(fator));
  const redondo = Math.round(fator / potencia) * potencia;
  return `Balanço da estrela exagerado ${new Intl.NumberFormat("pt-BR").format(redondo)} vezes`;
}

/**
 * A órbita vista de cima, com a Terra embaixo: o planeta, o trajeto dele e a estrela balançando em volta do centro
 * de massa. A estrela fica azulada quando vem para cá e avermelhada quando se afasta (o efeito Doppler).
 */
export function criarVistaDaOrbita(estado: () => EstadoDaOrbita): Tela {
  return criarTela(
    "vista-orbita",
    "Órbita vista de cima: o planeta e a estrela girando em volta do centro de massa, com a Terra embaixo.",
    (contexto, largura, altura, cores) => {
      const e = estado();
      let alcance = 0;
      for (const p of e.trajeto) alcance = Math.max(alcance, Math.abs(p.x), Math.abs(p.z));
      alcance = alcance || 1;
      const cx = largura / 2;
      const cy = altura / 2 - 8;
      const escala = (Math.min(largura, altura) * 0.4) / alcance;
      const tela = (p: PosicaoNoPlano) => ({ x: cx + p.x * escala, y: cy - p.z * escala });

      contexto.lineWidth = 1;
      contexto.strokeStyle = cores.grade;
      contexto.setLineDash([3, 4]);
      contexto.beginPath();
      e.trajeto.forEach((p, i) => {
        const q = tela(p);
        if (i === 0) contexto.moveTo(q.x, q.y);
        else contexto.lineTo(q.x, q.y);
      });
      contexto.closePath();
      contexto.stroke();
      contexto.setLineDash([]);

      // Centro de massa.
      contexto.strokeStyle = cores.texto3;
      contexto.beginPath();
      contexto.moveTo(cx - 4, cy);
      contexto.lineTo(cx + 4, cy);
      contexto.moveTo(cx, cy - 4);
      contexto.lineTo(cx, cy + 4);
      contexto.stroke();

      // Estrela: o balanço é exagerado para caber na cena.
      const exagero = e.balancoMaximo > 0 ? Math.max(1, (BALANCO_NA_CENA * alcance) / e.balancoMaximo) : 1;
      const estrela = tela({ x: e.estrela.x * exagero, z: e.estrela.z * exagero });
      const raioDaEstrela = Math.max(7, Math.min(largura, altura) * 0.05);
      contexto.beginPath();
      contexto.arc(estrela.x, estrela.y, raioDaEstrela, 0, Math.PI * 2);
      contexto.fillStyle = cores.estrela;
      contexto.fill();
      const tom = e.velocidadeMaximaMs > 0 ? Math.min(1, Math.abs(e.velocidadeMs) / e.velocidadeMaximaMs) : 0;
      if (tom > 0.02) {
        contexto.globalAlpha = 0.55 * tom;
        contexto.fillStyle = e.velocidadeMs > 0 ? cores.afastando : cores.aproximando;
        contexto.fill();
        contexto.globalAlpha = 1;
      }

      const planeta = tela(e.planeta);
      contexto.beginPath();
      contexto.arc(planeta.x, planeta.y, 4, 0, Math.PI * 2);
      contexto.fillStyle = cores.texto;
      contexto.fill();

      contexto.font = "11px system-ui, sans-serif";
      contexto.textAlign = "center";
      contexto.textBaseline = "middle";
      contexto.fillStyle = cores.texto3;
      contexto.fillText("↓ para a Terra", cx, altura - 10);
      contexto.textAlign = "left";
      contexto.fillText(textoDoExagero(exagero), 8, 12);
    },
  );
}

export interface EstadoDaCurvaVR {
  curva: CurvaVR;
  /** Curva do planeta do catálogo, para comparar; null sem planeta carregado. */
  referencia: CurvaVR | null;
  /** Fração da órbita mostrada agora. */
  fase: number;
  velocidadeAgora: number;
  ruidoMs: number;
}

const MARGEM = { esquerda: 76, direita: 16, topo: 14, base: 40 };

/** Texto de uma velocidade no eixo: m/s, ou cm/s abaixo de 1 m/s (o balanço da Terra no Sol é de 9 cm/s). */
export function rotuloDeVelocidade(ms: number): string {
  const sinal = ms > 0 ? "+" : ms < 0 ? "−" : "";
  const absoluto = Math.abs(ms);
  if (absoluto === 0) return "0";
  if (absoluto < 1) return `${sinal}${decimal(absoluto * 100, 0)} cm/s`;
  return `${sinal}${decimal(absoluto, absoluto < 10 ? 1 : 0)} m/s`;
}

/** Curva de velocidade radial ao longo de uma órbita: positivo = a estrela se afasta (desvio para o vermelho). */
export function criarCurvaVR(estado: () => EstadoDaCurvaVR): Tela {
  return criarTela(
    "vista-curva",
    "Curva de velocidade radial: a velocidade da estrela na nossa direção ao longo de uma órbita.",
    (contexto, largura, altura, cores) => {
      const e = estado();
      let maximo = 0;
      for (const p of e.curva.modelo) maximo = Math.max(maximo, Math.abs(p.velocidadeMs));
      for (const p of e.referencia?.modelo ?? []) maximo = Math.max(maximo, Math.abs(p.velocidadeMs));
      const limite = Math.max(maximo + 3 * e.ruidoMs, 0.01) * 1.15;
      const x = escalaLinear([0, 1], [MARGEM.esquerda, largura - MARGEM.direita]);
      const y = escalaLinear([-limite, limite], [altura - MARGEM.base, MARGEM.topo]);
      const base = altura - MARGEM.base;

      contexto.font = "11px system-ui, sans-serif";
      contexto.textBaseline = "middle";
      contexto.lineWidth = 1;
      contexto.strokeStyle = cores.grade;
      contexto.fillStyle = cores.texto3;
      contexto.textAlign = "right";
      for (const m of marcasLineares(limite / 1.15, 3)) {
        for (const v of m === 0 ? [0] : [-m, m]) {
          const py = Math.round(y(v)) + 0.5;
          contexto.beginPath();
          contexto.moveTo(MARGEM.esquerda, py);
          contexto.lineTo(largura - MARGEM.direita, py);
          contexto.stroke();
          contexto.fillText(rotuloDeVelocidade(v), MARGEM.esquerda - 8, py);
        }
      }
      contexto.textAlign = "center";
      for (const f of [0, 0.25, 0.5, 0.75, 1]) {
        const px = Math.round(x(f)) + 0.5;
        contexto.beginPath();
        contexto.moveTo(px, base);
        contexto.lineTo(px, base + 4);
        contexto.stroke();
        contexto.fillText(decimal(f, 2), px, base + 15);
      }
      contexto.fillStyle = cores.texto2;
      contexto.fillText("Fase da órbita (0 = periastro)", (MARGEM.esquerda + largura - MARGEM.direita) / 2, altura - 8);
      contexto.save();
      contexto.translate(12, (MARGEM.topo + base) / 2);
      contexto.rotate(-Math.PI / 2);
      contexto.fillText("Velocidade da estrela", 0, 0);
      contexto.restore();

      const linha = (curva: CurvaVR) => {
        contexto.beginPath();
        curva.modelo.forEach((p, i) => {
          if (i === 0) contexto.moveTo(x(p.fase), y(p.velocidadeMs));
          else contexto.lineTo(x(p.fase), y(p.velocidadeMs));
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
        for (const p of e.curva.medida) contexto.fillRect(x(p.fase) - 1, y(p.velocidadeMs) - 1, 2, 2);
        contexto.globalAlpha = 1;
      }
      contexto.strokeStyle = cores.destaque;
      contexto.lineWidth = 2;
      linha(e.curva);

      const px = x(e.fase);
      contexto.strokeStyle = cores.texto3;
      contexto.lineWidth = 1;
      contexto.beginPath();
      contexto.moveTo(px, MARGEM.topo);
      contexto.lineTo(px, base);
      contexto.stroke();
      contexto.beginPath();
      contexto.arc(px, y(e.velocidadeAgora), 4, 0, Math.PI * 2);
      contexto.fillStyle = e.velocidadeAgora > 0 ? cores.afastando : cores.aproximando;
      contexto.fill();
    },
  );
}
