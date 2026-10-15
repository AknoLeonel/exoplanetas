import { anosLuz, compacto, milhar } from "../lib/formato";
import { type ColunaOrdenavel, type Direcao, ordenar } from "../lib/planetas";
import type { Planeta } from "../lib/tipos";
import { entrar, sair } from "./animacao";
import { h } from "./dom";

const POR_PAGINA = 20;

const COLUNAS: { id: ColunaOrdenavel; titulo: string; celula(p: Planeta): string }[] = [
  { id: "nome", titulo: "Planeta", celula: (p) => p.nome },
  { id: "ano", titulo: "Ano", celula: (p) => String(p.ano) },
  { id: "periodo", titulo: "Período (dias)", celula: (p) => compacto(p.periodo) },
  {
    id: "raio",
    titulo: "Raio (Terra = 1)",
    celula: (p) => (p.medido ? compacto(p.raio) : `${compacto(p.raio)} (est.)`),
  },
  { id: "massa", titulo: "Massa (Terra = 1)", celula: (p) => (p.massa === null ? "—" : compacto(p.massa)) },
  { id: "temperatura", titulo: "Temp. (K)", celula: (p) => (p.temperatura === null ? "—" : milhar(p.temperatura)) },
  { id: "distancia", titulo: "Distância", celula: (p) => (p.distancia === null ? "—" : anosLuz(p.distancia)) },
];

export interface Tabela {
  elemento: HTMLElement;
  /** `animar` só para mudanças discretas (clique); digitar e arrastar atualizam na hora. */
  atualizar(planetas: readonly Planeta[], animar: boolean): Promise<void>;
}

export function criarTabela(): Tabela {
  let planetas: readonly Planeta[] = [];
  let coluna: ColunaOrdenavel = "ano";
  let direcao: Direcao = "desc";
  let visiveis = POR_PAGINA;
  let versao = 0;

  const legenda = h("caption", {});
  const cabecalhos = COLUNAS.map((c) => {
    const botao = h("button", { type: "button" }, c.titulo);
    botao.addEventListener("click", () => {
      if (coluna === c.id) direcao = direcao === "asc" ? "desc" : "asc";
      else {
        coluna = c.id;
        direcao = c.id === "nome" ? "asc" : "desc";
      }
      visiveis = POR_PAGINA;
      void preencher(true);
    });
    return { id: c.id, th: h("th", { scope: "col" }, botao) };
  });
  const corpo = h("tbody", { "data-anim": "pronto" });
  const tabela = h("table", {}, legenda, h("thead", {}, h("tr", {}, ...cabecalhos.map((c) => c.th))), corpo);
  const mais = h("button", { class: "botao secundario", type: "button" }, `Mostrar mais ${POR_PAGINA}`);
  mais.addEventListener("click", () => {
    visiveis += POR_PAGINA;
    void preencher(false);
  });
  const rodape = h("div", { class: "mais" }, mais);
  const elemento = h("div", { class: "tabela-wrap" }, tabela, rodape);

  function escrever(): void {
    const ordenados = ordenar(planetas, coluna, direcao);
    const linhas = ordenados.slice(0, visiveis);
    for (const c of cabecalhos) {
      if (c.id === coluna) c.th.setAttribute("aria-sort", direcao === "asc" ? "ascending" : "descending");
      else c.th.setAttribute("aria-sort", "none");
    }
    legenda.textContent = `Planetas que passam nos filtros e na busca, ordenados por ${COLUNAS.find((c) => c.id === coluna)?.titulo.toLowerCase()}. Mostrando ${milhar(linhas.length)} de ${milhar(planetas.length)}.`;
    if (linhas.length === 0) {
      corpo.replaceChildren(
        h("tr", {}, h("td", { colspan: COLUNAS.length, class: "vazio" }, "Nenhum planeta com esses filtros.")),
      );
    } else {
      corpo.replaceChildren(...linhas.map((p) => h("tr", {}, ...COLUNAS.map((c) => h("td", {}, c.celula(p))))));
    }
    mais.hidden = linhas.length >= planetas.length;
  }

  async function preencher(animar: boolean): Promise<void> {
    const minha = ++versao;
    if (animar) {
      await sair(corpo);
      if (minha !== versao) return;
    }
    escrever();
    if (animar) await entrar(corpo);
    else corpo.dataset.anim = "pronto";
  }

  return {
    elemento,
    async atualizar(novos, animar) {
      planetas = novos;
      visiveis = POR_PAGINA;
      await preencher(animar);
    },
  };
}
