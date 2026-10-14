import { carregarMetricas } from "../data/carregar";
import { milhar, percentual } from "../lib/formato";
import type { Metricas } from "../lib/tipos";
import { carregarSecao } from "./carga";
import { h } from "./dom";

function cartao(rotulo: string, valor: string, detalhe: string): HTMLElement {
  return h(
    "div",
    { class: "cartao" },
    h("span", { class: "rotulo" }, rotulo),
    h("span", { class: "valor" }, valor),
    h("span", { class: "detalhe" }, detalhe),
  );
}

/** Dia/mês/ano da coleta, em UTC, a partir do ISO de metadados.json. */
export function dataDaColeta(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** Erro do melhor modelo e o da linha de base "Mediana (referência)" (se faltar, o pior modelo). */
export function erroDoMelhorEDaReferencia(m: Metricas): { melhor: number; referencia: number } {
  const resultados = Object.entries(m.modelo.resultados);
  const erros = resultados.map(([, r]) => r.erro_percentual_mediano);
  const base = resultados.find(([nome]) => nome.startsWith("Mediana"));
  return { melhor: Math.min(...erros), referencia: base ? base[1].erro_percentual_mediano : Math.max(...erros) };
}

export function montarResumo(m: Metricas): HTMLElement {
  const { melhor, referencia } = erroDoMelhorEDaReferencia(m);
  return h(
    "div",
    { class: "cartoes" },
    cartao("Planetas confirmados", milhar(m.dados.planetas), `em ${milhar(m.dados.estrelas)} estrelas`),
    cartao("Período das descobertas", `${m.dados.primeiro_ano}–${m.dados.ultimo_ano}`, "do primeiro ao mais recente"),
    cartao(
      "Ano com mais descobertas",
      String(m.descobertas.ano_de_pico),
      `${milhar(m.descobertas.planetas_no_pico)} planetas, ${milhar(m.descobertas.kepler_no_pico)} pelo Kepler`,
    ),
    cartao("Erro do modelo de raio", percentual(melhor), `contra ${percentual(referencia)} de chutar a mediana`),
  );
}

export async function montar(host: HTMLElement): Promise<void> {
  await carregarSecao({
    host,
    nome: "resumo",
    carregar: (aoProgredir) => carregarMetricas({ aoProgredir }),
    renderizar: (m) => {
      const data = dataDaColeta(m.dados.coletado_em);
      const coleta = document.getElementById("coleta");
      if (coleta && data) coleta.textContent = `Coleta de ${data}.`;
      return montarResumo(m);
    },
  });
}
