import { carregarPlanetas } from "../data/carregar";
import { milhar } from "../lib/formato";
import { CLASSES, contarPorClasse, type Filtro, filtrar, intervaloDeAnos } from "../lib/planetas";
import type { IdClasse, Planeta } from "../lib/tipos";
import { carregarSecao } from "./carga";
import { h } from "./dom";
import { criarGrafico } from "./grafico-periodo-raio";
import { criarTabela } from "./tabela";

const TODAS: ReadonlySet<IdClasse> = new Set(CLASSES.map((c) => c.id));

/** Painel de exploração: filtros, gráfico período × raio e tabela, todos sobre o mesmo recorte. */
export function montarExplorador(planetas: readonly Planeta[]): HTMLElement {
  const [anoMin, anoMax] = intervaloDeAnos(planetas);
  const filtro: { classes: Set<IdClasse>; anoMinimo: number; soComMassa: boolean; busca: string } = {
    classes: new Set(TODAS),
    anoMinimo: anoMin,
    soComMassa: false,
    busca: "",
  };

  const raiz = h("div", { class: "explorador" });
  const resumo = h("p", { class: "resumo-grafico", "aria-live": "polite" });
  const grafico = criarGrafico(raiz);
  const tabela = criarTabela();

  const fichas = new Map<IdClasse, { botao: HTMLButtonElement; contagem: HTMLElement }>();
  const grupo = h("fieldset", { class: "fichas" }, h("legend", { class: "so-leitor" }, "Tamanho do planeta"));
  for (const c of CLASSES) {
    const contagem = h("span", { class: "n" });
    const botao = h(
      "button",
      { class: "ficha", type: "button", "aria-pressed": "true" },
      h("span", { class: "ponto", style: `background: var(--classe-${c.id})` }),
      c.nome,
      contagem,
    );
    botao.addEventListener("click", () => {
      if (filtro.classes.has(c.id)) filtro.classes.delete(c.id);
      else filtro.classes.add(c.id);
      botao.setAttribute("aria-pressed", String(filtro.classes.has(c.id)));
      aplicar(true);
    });
    fichas.set(c.id, { botao, contagem });
    grupo.append(botao);
  }

  const saidaAno = h("output", {}, String(anoMin));
  const ano = h("input", { type: "range", min: anoMin, max: anoMax, step: 1, value: anoMin, id: "filtro-ano" });
  ano.addEventListener("input", () => {
    filtro.anoMinimo = Number(ano.value);
    saidaAno.textContent = ano.value;
    aplicar(false);
  });

  const massa = h("input", { type: "checkbox", id: "filtro-massa" });
  massa.addEventListener("change", () => {
    filtro.soComMassa = massa.checked;
    aplicar(true);
  });

  const busca = h("input", { type: "search", id: "filtro-busca", placeholder: "Buscar planeta", autocomplete: "off" });
  busca.addEventListener("input", () => {
    filtro.busca = busca.value;
    aplicar(false);
  });

  const barra = h(
    "div",
    { class: "filtros" },
    grupo,
    h("label", { class: "controle", for: "filtro-ano" }, "Descobertos a partir de", ano, saidaAno),
    h("label", { class: "controle", for: "filtro-massa" }, massa, "Só com massa medida"),
    h(
      "label",
      { class: "controle so-leitor-rotulo", for: "filtro-busca" },
      h("span", { class: "so-leitor" }, "Buscar planeta pelo nome"),
      busca,
    ),
  );
  raiz.prepend(barra);
  raiz.append(resumo, tabela.elemento);

  function aplicar(animar: boolean): void {
    const recorte: Filtro = { ...filtro, classes: filtro.classes };
    const filtrados = filtrar(planetas, recorte);
    // As contagens das fichas ignoram a própria seleção de classes, para mostrar o que cada ficha traria.
    const semClasses = contarPorClasse(filtrar(planetas, { ...recorte, classes: TODAS }));
    for (const [id, ficha] of fichas) ficha.contagem.textContent = milhar(semClasses[id]);
    grafico.atualizar(filtrados);
    void tabela.atualizar(filtrados, animar);
    resumo.textContent = `Mostrando ${milhar(filtrados.length)} de ${milhar(planetas.length)} planetas com raio medido.`;
  }

  aplicar(false);
  return raiz;
}

export async function montar(host: HTMLElement): Promise<void> {
  await carregarSecao({
    host,
    nome: "explorador",
    carregar: (aoProgredir) => carregarPlanetas({ aoProgredir }),
    renderizar: montarExplorador,
  });
}
