import { carregarMetricas } from "../data/carregar";
import { nomeDaVariavel } from "../lib/dados";
import { decimal, percentual } from "../lib/formato";
import type { Metricas } from "../lib/tipos";
import { criarBarras } from "./barras";
import { carregarSecao } from "./carga";
import { h } from "./dom";
import { quandoVisivel } from "./lazy";

export function montarModelo(m: Metricas): HTMLElement {
  const resultados = Object.entries(m.modelo.resultados);
  const maior = Math.max(...resultados.map(([, r]) => r.erro_percentual_mediano));
  const melhor = Math.min(...resultados.map(([, r]) => r.erro_percentual_mediano));
  const erros = criarBarras(
    resultados.map(([nome, r]) => ({
      rotulo: nome,
      valor: percentual(r.erro_percentual_mediano),
      fracao: r.erro_percentual_mediano / maior,
      detalhe: `R² ${decimal(r.r2_log, 2)} · ${percentual(r.dentro_de_20pct, 0)} dos planetas com erro de até 20%`,
      cor: r.erro_percentual_mediano === melhor ? "var(--destaque)" : "var(--metodo-outros)",
    })),
  );

  const importancias = Object.entries(m.modelo.importancia_permutacao);
  const topo = Math.max(...importancias.map(([, v]) => v));
  const pesos = criarBarras(
    importancias.map(([chave, v]) => ({
      rotulo: nomeDaVariavel(chave),
      valor: decimal(v, 3),
      fracao: Math.max(v, 0) / topo,
      cor: "var(--destaque)",
    })),
  );

  return h(
    "div",
    { class: "grade-2" },
    h(
      "div",
      { class: "painel" },
      h("h3", {}, "Erro mediano ao estimar o raio"),
      h("p", { class: "sub" }, `Quanto menor, melhor. ${m.modelo.validacao}.`),
      erros,
    ),
    h(
      "div",
      { class: "painel" },
      h("h3", {}, "O que mais pesa na previsão"),
      h("p", { class: "sub" }, "O quanto o erro (em log₁₀ do raio) piora quando a variável é embaralhada."),
      pesos,
    ),
  );
}

function revelar(conteudo: HTMLElement): void {
  for (const lista of conteudo.querySelectorAll<HTMLElement>(".barras")) {
    quandoVisivel(lista, () => lista.setAttribute("data-visivel", "true"), "0px");
  }
}

export async function montar(host: HTMLElement): Promise<void> {
  await carregarSecao({
    host,
    nome: "modelo",
    carregar: (aoProgredir) => carregarMetricas({ aoProgredir }),
    renderizar: montarModelo,
    aposMontar: revelar,
  });
}
