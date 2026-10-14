import { carregarDescobertas } from "../data/carregar";
import { escalaLinear, marcasLineares } from "../lib/escala";
import { milhar } from "../lib/formato";
import type { Descobertas } from "../lib/tipos";
import { carregarSecao } from "./carga";
import { h, svg } from "./dom";
import { quandoVisivel } from "./lazy";
import { criarTooltip } from "./tooltip";

const LARGURA = 960;
const ALTURA = 400;
const M = { esquerda: 44, direita: 8, topo: 16, base: 28 };
/** De baixo para cima. */
const ORDEM = ["Transit", "Radial Velocity", "Microlensing", "Imaging", "Outros"];

function idCss(metodo: string): string {
  return metodo.toLowerCase().replace(/\s+/g, "-");
}

/** Rótulos de ano a cada 5 anos, mais o primeiro e o último, sem deixar dois rótulos se tocarem. */
export function rotuloDoAno(ano: number, anos: readonly number[]): boolean {
  const primeiro = anos[0];
  const ultimo = anos[anos.length - 1];
  if (ano === primeiro) return true;
  if (ano % 5 === 0) return ano !== primeiro;
  return ano === ultimo && ultimo - Math.floor(ultimo / 5) * 5 >= 3;
}

function totais(d: Descobertas): number[] {
  return d.anos.map((_, i) => Object.values(d.metodos).reduce((soma, serie) => soma + (serie[i] ?? 0), 0));
}

export function montarDescobertas(d: Descobertas): HTMLElement {
  const metodos = ORDEM.filter((m) => m in d.metodos);
  const total = totais(d);
  const maximo = Math.max(...total);
  const marcas = marcasLineares(maximo, 5);
  const y = escalaLinear([0, maximo], [ALTURA - M.base, M.topo]);
  const passo = (LARGURA - M.esquerda - M.direita) / d.anos.length;
  const largura = passo * 0.76;

  const raiz = h("div", { class: "descobertas" });
  const legenda = h(
    "ul",
    { class: "legenda" },
    ...metodos.map((m) =>
      h("li", {}, h("span", { class: "quadro", style: `background: var(--metodo-${idCss(m)})` }), d.nomes[m] ?? m),
    ),
  );
  const area = h("div", { class: "area-barras", style: "position: relative" });
  const tooltip = criarTooltip(area);

  const grafico = svg("svg", {
    class: "grafico-barras",
    viewBox: `0 0 ${LARGURA} ${ALTURA}`,
    // `group`, não `img`: dentro de uma imagem os alvos focáveis de cada ano seriam ignorados por leitores de tela.
    role: "group",
    "aria-label": `Barras empilhadas de descobertas por ano e método, de ${d.anos[0]} a ${d.anos[d.anos.length - 1]}. Os mesmos números estão na tabela abaixo.`,
    "data-visivel": "false",
  });
  for (const v of marcas) {
    grafico.append(
      svg("line", { class: "grade", x1: M.esquerda, x2: LARGURA - M.direita, y1: y(v), y2: y(v) }),
      svg("text", { x: M.esquerda - 8, y: y(v), "text-anchor": "end", "dominant-baseline": "middle" }, milhar(v)),
    );
  }

  d.anos.forEach((ano, i) => {
    const x = M.esquerda + passo * i + (passo - largura) / 2;
    let acumulado = 0;
    for (const m of metodos) {
      const valor = d.metodos[m]?.[i] ?? 0;
      if (valor === 0) continue;
      const topoSegmento = y(acumulado + valor);
      const altura = y(acumulado) - topoSegmento;
      grafico.append(
        svg("rect", {
          class: "segmento",
          x,
          y: topoSegmento,
          width: largura,
          height: altura,
          rx: 2,
          style: `fill: var(--metodo-${idCss(m)})`,
        }),
      );
      acumulado += valor;
    }
    if (rotuloDoAno(ano, d.anos)) {
      grafico.append(svg("text", { x: x + largura / 2, y: ALTURA - 8, "text-anchor": "middle" }, String(ano)));
    }
  });

  // Rótulo direto só no ano de pico.
  const iPico = total.indexOf(maximo);
  grafico.append(
    svg(
      "text",
      {
        x: M.esquerda + passo * iPico + passo / 2,
        y: y(maximo) - 6,
        "text-anchor": "middle",
        style: "fill: var(--texto); font-weight: 600",
      },
      `${d.anos[iPico]}: ${milhar(maximo)}`,
    ),
  );

  // Alvos de hover maiores que as barras: a coluna inteira responde.
  d.anos.forEach((ano, i) => {
    const alvo = svg("rect", {
      class: "coluna-alvo",
      x: M.esquerda + passo * i,
      y: M.topo,
      width: passo,
      height: ALTURA - M.base - M.topo,
      tabindex: 0,
      role: "img",
      "aria-label": `${ano}: ${milhar(total[i] ?? 0)} planetas`,
    });
    const mostrar = (cx: number, cy: number) => {
      const linhas = metodos
        .filter((m) => (d.metodos[m]?.[i] ?? 0) > 0)
        .flatMap((m) => [
          h("dt", {}, h("span", { class: "chave", style: `background: var(--metodo-${idCss(m)})` }), d.nomes[m] ?? m),
          h("dd", {}, milhar(d.metodos[m]?.[i] ?? 0)),
        ]);
      const conteudo = h("div", {}, h("strong", {}, `${ano}: ${milhar(total[i] ?? 0)}`), h("dl", {}, ...linhas));
      tooltip.mostrar(conteudo, cx, cy);
    };
    alvo.addEventListener("pointermove", (ev) => {
      const caixa = area.getBoundingClientRect();
      mostrar(ev.clientX - caixa.left, ev.clientY - caixa.top);
    });
    alvo.addEventListener("focus", () => {
      const caixa = area.getBoundingClientRect();
      const r = alvo.getBoundingClientRect();
      mostrar(r.left - caixa.left + r.width / 2, r.top - caixa.top + 24);
    });
    alvo.addEventListener("pointerleave", () => tooltip.esconder());
    alvo.addEventListener("blur", () => tooltip.esconder());
    grafico.append(alvo);
  });

  area.prepend(grafico);

  const cabecalho = h(
    "tr",
    {},
    h("th", { scope: "col" }, "Ano"),
    ...metodos.map((m) => h("th", { scope: "col" }, d.nomes[m] ?? m)),
    h("th", { scope: "col" }, "Total"),
  );
  const corpo = h(
    "tbody",
    {},
    ...d.anos.map((ano, i) =>
      h(
        "tr",
        {},
        h("td", {}, String(ano)),
        ...metodos.map((m) => h("td", {}, milhar(d.metodos[m]?.[i] ?? 0))),
        h("td", {}, milhar(total[i] ?? 0)),
      ),
    ),
  );
  const alternativa = h(
    "details",
    { class: "nota" },
    h("summary", {}, "Ver os números em tabela"),
    h("div", { class: "tabela-wrap" }, h("table", {}, h("thead", {}, cabecalho), corpo)),
  );

  raiz.append(legenda, area, alternativa);
  return raiz;
}

/** Dispara a animação de crescimento das barras quando o gráfico chega à tela. */
function revelarBarras(conteudo: HTMLElement): void {
  const grafico = conteudo.querySelector<SVGElement>(".grafico-barras");
  if (!grafico) return;
  quandoVisivel(grafico, () => grafico.setAttribute("data-visivel", "true"), "0px");
}

export async function montar(host: HTMLElement): Promise<void> {
  await carregarSecao({
    host,
    nome: "descobertas",
    carregar: (aoProgredir) => carregarDescobertas({ aoProgredir }),
    renderizar: montarDescobertas,
    aposMontar: revelarBarras,
  });
}
