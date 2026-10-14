import { type Descobertas, ErroDados, type Metricas } from "./tipos";

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function lerDescobertas(bruto: unknown): Descobertas {
  if (!ehObjeto(bruto) || !Array.isArray(bruto.anos) || !ehObjeto(bruto.metodos) || !ehObjeto(bruto.nomes)) {
    throw new ErroDados("descobertas.json fora do formato esperado", "descobertas");
  }
  const anos = bruto.anos as number[];
  for (const serie of Object.values(bruto.metodos)) {
    if (!Array.isArray(serie) || serie.length !== anos.length) {
      throw new ErroDados("descobertas.json com séries de tamanho diferente do número de anos", "descobertas");
    }
  }
  return bruto as unknown as Descobertas;
}

export function lerMetricas(bruto: unknown): Metricas {
  const ok =
    ehObjeto(bruto) &&
    ehObjeto(bruto.dados) &&
    ehObjeto(bruto.descobertas) &&
    ehObjeto(bruto.deserto_netunos_quentes) &&
    Array.isArray(bruto.parecidos_com_a_terra_mais_proximos) &&
    ehObjeto(bruto.modelo) &&
    ehObjeto(bruto.modelo.resultados) &&
    // Sem nenhum modelo não há o que comparar (e o resumo mostraria "Infinity%").
    Object.keys(bruto.modelo.resultados).length > 0 &&
    ehObjeto(bruto.modelo.importancia_permutacao);
  if (!ok) throw new ErroDados("metricas.json fora do formato esperado", "metricas");
  return bruto as unknown as Metricas;
}

/** Nome legível de uma variável do modelo (os nomes do pipeline são colunas de DataFrame). */
export function nomeDaVariavel(chave: string): string {
  const nomes: Record<string, string> = {
    log_massa: "Massa do planeta",
    log_periodo: "Período orbital",
    log_insolacao: "Luz recebida",
    st_teff: "Temperatura da estrela",
    st_mass: "Massa da estrela",
    st_met: "Metalicidade da estrela",
  };
  return nomes[chave] ?? chave;
}
