export type IdClasse = "terra" | "super-terra" | "netuno" | "jupiter" | "super-jupiter";

export interface Planeta {
  nome: string;
  ano: number;
  /** dias */
  periodo: number;
  /** raios terrestres */
  raio: number;
  /** massas terrestres; só quando medida de fato */
  massa: number | null;
  /** kelvin */
  temperatura: number | null;
  /** parsecs */
  distancia: number | null;
  /** O raio veio de um trânsito. Se for falso, é uma estimativa por relação massa-raio. */
  medido: boolean;
  classe: IdClasse;
}

export interface Descobertas {
  anos: number[];
  metodos: Record<string, number[]>;
  nomes: Record<string, string>;
}

interface ResultadoModelo {
  erro_percentual_mediano: number;
  r2_log: number;
  dentro_de_20pct: number;
}

interface ParecidoComATerra {
  pl_name: string;
  pl_rade: number;
  pl_insol: number;
  pl_eqt: number | null;
  sy_dist: number;
}

/** Só os campos de reports/metricas.json que o site usa. */
export interface Metricas {
  dados: { coletado_em: string | null; planetas: number; estrelas: number; primeiro_ano: number; ultimo_ano: number };
  descobertas: { ano_de_pico: number; planetas_no_pico: number; kepler_no_pico: number };
  deserto_netunos_quentes: {
    fracao_netunos_geral: number;
    fracao_netunos_orbita_curta: number;
    planetas_orbita_curta: number;
    periodo_curto_dias: number;
  };
  parecidos_com_a_terra_mais_proximos: ParecidoComATerra[];
  modelo: {
    planetas: number;
    validacao: string;
    resultados: Record<string, ResultadoModelo>;
    importancia_permutacao: Record<string, number>;
  };
}

export class ErroDados extends Error {
  constructor(
    message: string,
    readonly origem: string,
  ) {
    super(message);
    this.name = "ErroDados";
  }
}
