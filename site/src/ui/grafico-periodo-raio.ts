import { escalaLog, maisProximo, marcasLog, type Ponto } from "../lib/escala";
import { anosLuz, celsius, compacto, eixo, milhar } from "../lib/formato";
import type { IdClasse, Planeta } from "../lib/tipos";
import { type Cores, lerCores } from "./cores";
import { h } from "./dom";
import { criarTooltip } from "./tooltip";

/** Domínio fixo: nenhum filtro faz o gráfico "pular" de escala. */
export const DOMINIO_PERIODO: readonly [number, number] = [0.1, 10_000];
export const DOMINIO_RAIO: readonly [number, number] = [0.2, 50];
/** Região do "deserto de Netunos quentes" (mesmos limites do pipeline Python). */
export const DESERTO = { periodoMax: 3, raioMin: 2, raioMax: 6 } as const;

export const MARGEM = { esquerda: 56, direita: 16, topo: 12, base: 46 };
const RAIO_DO_PONTO = 2.4;
/** Distância máxima, em pixels, entre o cursor e o ponto mais próximo. */
const ALCANCE = 16;

export interface GraficoPeriodoRaio {
  /**
   * `destaques`: os nomes a realçar quando há uma busca. `null` (ou ausente) = sem busca. Com busca, os demais
   * pontos ficam esmaecidos mesmo que nenhum planeta case, para o gráfico não parecer sem filtro.
   */
  atualizar(planetas: readonly Planeta[], destaques?: ReadonlySet<string> | null): void;
  destruir(): void;
}

function linhaDoTooltip(rotulo: string, valor: string): [HTMLElement, HTMLElement] {
  return [h("dt", {}, rotulo), h("dd", {}, valor)];
}

function conteudoDoTooltip(p: Planeta): HTMLElement {
  const linhas = [
    linhaDoTooltip("Descoberta", String(p.ano)),
    linhaDoTooltip("Período", `${compacto(p.periodo)} dias`),
    linhaDoTooltip("Raio", `${compacto(p.raio)}× a Terra${p.medido ? "" : " (estimado)"}`),
    linhaDoTooltip("Massa", p.massa === null ? "não medida" : `${compacto(p.massa)}× a Terra`),
    linhaDoTooltip(
      "Temperatura",
      p.temperatura === null ? "—" : `${milhar(p.temperatura)} K (${celsius(p.temperatura)})`,
    ),
    linhaDoTooltip("Distância", p.distancia === null ? "—" : anosLuz(p.distancia)),
  ];
  return h("div", {}, h("strong", {}, p.nome), h("dl", {}, ...linhas.flat()));
}

function agrupar(planetas: readonly Planeta[]): { classe: IdClasse; medido: boolean; indices: number[] }[] {
  const mapa = new Map<string, { classe: IdClasse; medido: boolean; indices: number[] }>();
  planetas.forEach((p, i) => {
    const chave = `${p.classe}|${p.medido}`;
    const grupo = mapa.get(chave) ?? { classe: p.classe, medido: p.medido, indices: [] };
    grupo.indices.push(i);
    mapa.set(chave, grupo);
  });
  return [...mapa.values()];
}

export function criarGrafico(host: HTMLElement): GraficoPeriodoRaio {
  const canvas = h("canvas", {
    role: "img",
    "aria-label": "Diagrama de dispersão do período orbital contra o raio dos planetas, em escala logarítmica.",
  });
  const area = h("div", { class: "area-grafico" }, canvas);
  host.append(area);
  const tooltip = criarTooltip(area);
  const contexto = canvas.getContext("2d");

  let planetas: readonly Planeta[] = [];
  let destaques: ReadonlySet<string> | null = null;
  /** Índices dos planetas por classe e origem do raio, montados uma vez por `atualizar`. */
  let grupos: ReturnType<typeof agrupar> = [];
  let pontos: Ponto[] = [];
  let destacado = -1;
  let largura = 0;
  let altura = 0;
  let quadro = 0;
  // Os tokens de cor só mudam com o tema, então são lidos uma vez e relidos quando o tema troca.
  let cores: Cores | null = null;

  function posicoes(): void {
    const x = escalaLog(DOMINIO_PERIODO, [MARGEM.esquerda, largura - MARGEM.direita]);
    const y = escalaLog(DOMINIO_RAIO, [altura - MARGEM.base, MARGEM.topo]);
    pontos = planetas.map((p) => ({ x: x(p.periodo), y: y(p.raio) }));
  }

  function desenhar(): void {
    if (!contexto || largura === 0) return;
    cores ??= lerCores();
    const dpr = window.devicePixelRatio || 1;
    contexto.setTransform(dpr, 0, 0, dpr, 0, 0);
    contexto.clearRect(0, 0, largura, altura);
    const x = escalaLog(DOMINIO_PERIODO, [MARGEM.esquerda, largura - MARGEM.direita]);
    const y = escalaLog(DOMINIO_RAIO, [altura - MARGEM.base, MARGEM.topo]);
    const base = altura - MARGEM.base;

    contexto.font = "11px system-ui, sans-serif";
    contexto.textBaseline = "middle";

    // Deserto de Netunos quentes.
    const x0 = x(DOMINIO_PERIODO[0]);
    const x1 = x(DESERTO.periodoMax);
    const y0 = y(DESERTO.raioMax);
    const y1 = y(DESERTO.raioMin);
    contexto.fillStyle = cores.deserto;
    contexto.fillRect(x0, y0, x1 - x0, y1 - y0);
    contexto.strokeStyle = cores.desertoBorda;
    contexto.setLineDash([4, 4]);
    contexto.lineWidth = 1;
    contexto.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
    contexto.setLineDash([]);
    contexto.fillStyle = cores.texto2;
    contexto.textAlign = "left";
    contexto.fillText("Deserto de Netunos quentes", x0 + 6, y0 - 9);

    // Grade e eixos: só as potências de dez têm linha e rótulo.
    contexto.strokeStyle = cores.grade;
    contexto.fillStyle = cores.texto3;
    contexto.lineWidth = 1;
    contexto.textAlign = "center";
    for (const m of marcasLog(...DOMINIO_PERIODO)) {
      const px = Math.round(x(m.valor)) + 0.5;
      contexto.beginPath();
      contexto.moveTo(px, m.principal ? MARGEM.topo : base);
      contexto.lineTo(px, base + (m.principal ? 5 : 3));
      contexto.stroke();
      if (m.principal) contexto.fillText(eixo(m.valor), px, base + 16);
    }
    contexto.textAlign = "right";
    for (const m of marcasLog(...DOMINIO_RAIO)) {
      const py = Math.round(y(m.valor)) + 0.5;
      contexto.beginPath();
      contexto.moveTo(m.principal ? largura - MARGEM.direita : MARGEM.esquerda, py);
      contexto.lineTo(MARGEM.esquerda - (m.principal ? 5 : 3), py);
      contexto.stroke();
      if (m.principal || m.valor === 5) contexto.fillText(eixo(m.valor), MARGEM.esquerda - 9, py);
    }
    contexto.fillStyle = cores.texto2;
    contexto.textAlign = "center";
    contexto.fillText("Período orbital (dias)", (MARGEM.esquerda + largura - MARGEM.direita) / 2, altura - 10);
    contexto.save();
    contexto.translate(13, (MARGEM.topo + base) / 2);
    contexto.rotate(-Math.PI / 2);
    contexto.fillText("Raio (Terra = 1)", 0, 0);
    contexto.restore();

    // Pontos, um traçado por classe e origem do raio: cheios quando medido, vazados quando estimado.
    // Com uma busca ativa, tudo fica esmaecido e só os planetas buscados são realçados depois.
    const buscando = destaques !== null;
    contexto.globalAlpha = buscando ? 0.22 : 0.8;
    contexto.lineWidth = 1.2;
    for (const { classe, medido, indices } of grupos) {
      contexto.beginPath();
      for (const i of indices) {
        const p = pontos[i];
        if (!p) continue;
        contexto.moveTo(p.x + RAIO_DO_PONTO, p.y);
        contexto.arc(p.x, p.y, RAIO_DO_PONTO, 0, Math.PI * 2);
      }
      if (medido) {
        contexto.fillStyle = cores.classes[classe];
        contexto.fill();
      } else {
        contexto.strokeStyle = cores.classes[classe];
        contexto.stroke();
      }
    }
    contexto.globalAlpha = 1;
    if (destaques) {
      for (let i = 0; i < planetas.length; i++) {
        const p = pontos[i];
        const planeta = planetas[i];
        if (!p || !planeta || !destaques.has(planeta.nome)) continue;
        contexto.beginPath();
        contexto.arc(p.x, p.y, RAIO_DO_PONTO + 2.5, 0, Math.PI * 2);
        contexto.fillStyle = cores.classes[planeta.classe];
        contexto.fill();
        contexto.lineWidth = 1.5;
        contexto.strokeStyle = cores.texto;
        contexto.stroke();
      }
    }

    const alvo = pontos[destacado];
    const planeta = planetas[destacado];
    if (alvo && planeta) {
      contexto.beginPath();
      contexto.arc(alvo.x, alvo.y, RAIO_DO_PONTO + 3.5, 0, Math.PI * 2);
      contexto.fillStyle = cores.superficie;
      contexto.fill();
      contexto.beginPath();
      contexto.arc(alvo.x, alvo.y, RAIO_DO_PONTO + 1.5, 0, Math.PI * 2);
      contexto.fillStyle = cores.classes[planeta.classe];
      contexto.fill();
      contexto.lineWidth = 1.5;
      contexto.strokeStyle = cores.texto;
      contexto.stroke();
    }
  }

  function agendar(): void {
    if (quadro) return;
    quadro = requestAnimationFrame(() => {
      quadro = 0;
      desenhar();
    });
  }

  function medir(): void {
    const caixa = area.getBoundingClientRect();
    largura = Math.max(1, Math.floor(caixa.width));
    altura = Math.max(1, Math.floor(caixa.height));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(largura * dpr);
    canvas.height = Math.floor(altura * dpr);
    posicoes();
    agendar();
  }

  function aoMover(ev: PointerEvent): void {
    const caixa = canvas.getBoundingClientRect();
    const x = ev.clientX - caixa.left;
    const y = ev.clientY - caixa.top;
    const indice = maisProximo(pontos, x, y, ALCANCE);
    const planeta = planetas[indice];
    const ponto = pontos[indice];
    // O tooltip fica ancorado no ponto, não no cursor: mexer dentro do mesmo ponto não muda nada.
    if (indice === destacado) return;
    destacado = indice;
    if (planeta && ponto) tooltip.mostrar(conteudoDoTooltip(planeta), ponto.x, ponto.y);
    else tooltip.esconder();
    agendar();
  }

  function aoSair(): void {
    destacado = -1;
    tooltip.esconder();
    agendar();
  }

  canvas.addEventListener("pointermove", aoMover);
  canvas.addEventListener("pointerdown", aoMover);
  canvas.addEventListener("pointerleave", aoSair);

  const observador = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
  observador?.observe(area);
  const esquema = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  const aoTrocarDeTema = () => {
    cores = null;
    agendar();
  };
  esquema?.addEventListener("change", aoTrocarDeTema);
  window.addEventListener("tema-alterado", aoTrocarDeTema);
  medir();

  return {
    atualizar(novos, novosDestaques = null) {
      planetas = novos;
      destaques = novosDestaques;
      grupos = agrupar(novos);
      destacado = -1;
      tooltip.esconder();
      posicoes();
      agendar();
      canvas.setAttribute(
        "aria-label",
        `Diagrama de dispersão do período orbital contra o raio, em escala logarítmica, com ${milhar(novos.length)} planetas${novosDestaques ? `, ${milhar(novosDestaques.size)} destacados pela busca` : ""}. A tabela abaixo lista os planetas que casam com os filtros.`,
      );
    },
    destruir() {
      cancelAnimationFrame(quadro);
      observador?.disconnect();
      esquema?.removeEventListener("change", aoTrocarDeTema);
      window.removeEventListener("tema-alterado", aoTrocarDeTema);
      canvas.removeEventListener("pointermove", aoMover);
      canvas.removeEventListener("pointerdown", aoMover);
      canvas.removeEventListener("pointerleave", aoSair);
      area.remove();
    },
  };
}
