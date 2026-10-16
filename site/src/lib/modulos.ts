export type Modo = "aprender" | "explorar";

export const MODOS: readonly Modo[] = ["aprender", "explorar"];

export const NOMES_DOS_MODOS: Record<Modo, { nome: string; dica: string }> = {
  aprender: { nome: "Aprender", dica: "Guiado, passo a passo, com a conta explicada" },
  explorar: { nome: "Explorar", dica: "Livre, com todos os parâmetros na mão" },
};

export interface DefinicaoDeModulo {
  id: string;
  titulo: string;
  resumo: string;
  /** `em-breve` aparece no início como roteiro, sem link. */
  status: "disponivel" | "em-breve";
  /** Modos que o módulo suporta. O alternador só aparece quando há mais de um. */
  modos: readonly Modo[];
}

export const MODULO_INICIAL = "inicio";

/** Todos os módulos do laboratório, na ordem em que aparecem. O `inicio` não entra na lista de cartões. */
export const MODULOS: readonly DefinicaoDeModulo[] = [
  {
    id: "inicio",
    titulo: "Início",
    resumo: "Visão geral do laboratório.",
    status: "disponivel",
    modos: ["explorar"],
  },
  {
    id: "catalogo",
    titulo: "Catálogo de exoplanetas",
    resumo: "Todos os planetas confirmados: diagrama período × raio, descobertas por ano e o modelo que estima o raio.",
    status: "disponivel",
    modos: ["explorar"],
  },
  {
    id: "transito",
    titulo: "Simulador de trânsito",
    resumo: "Mude o planeta e a estrela e veja a curva de luz se desenhar ao vivo.",
    status: "disponivel",
    modos: ["aprender", "explorar"],
  },
  {
    id: "velocidade-radial",
    titulo: "Simulador de velocidade radial",
    resumo: "O balanço da estrela causado por um planeta, e por que só dá a massa mínima.",
    status: "disponivel",
    modos: ["aprender", "explorar"],
  },
  {
    id: "ml",
    titulo: "Machine learning interativo",
    resumo: "O modelo de raio rodando no seu navegador, com incerteza e explicação de cada previsão.",
    status: "disponivel",
    modos: ["aprender", "explorar"],
  },
  {
    id: "sistema-solar",
    titulo: "Sistema Solar 3D",
    resumo: "Posições reais dos planetas e luas em qualquer data, em escala didática ou real.",
    status: "em-breve",
    modos: ["aprender", "explorar"],
  },
  {
    id: "calculadoras",
    titulo: "Calculadoras de astrofísica",
    resumo: "Kepler, zona habitável, temperatura de equilíbrio e mais, com a conta mostrada.",
    status: "em-breve",
    modos: ["aprender", "explorar"],
  },
  {
    id: "hr",
    titulo: "Diagrama HR e vida das estrelas",
    resumo: "As estrelas com planetas no diagrama mais importante da astrofísica estelar.",
    status: "em-breve",
    modos: ["aprender", "explorar"],
  },
  {
    id: "dados",
    titulo: "Explorador de dados livre",
    resumo: "Qualquer coluna em qualquer eixo, com filtros, correlação e exportação.",
    status: "em-breve",
    modos: ["aprender", "explorar"],
  },
  {
    id: "trilhas",
    titulo: "Trilhas de estudo",
    resumo: "Roteiros curtos com quiz e glossário que levam de um módulo ao outro.",
    status: "em-breve",
    modos: ["aprender"],
  },
];

export function acharModulo(id: string): DefinicaoDeModulo | undefined {
  return MODULOS.find((m) => m.id === id);
}

/** Módulos com página própria, ou seja, que dá para abrir agora. */
export function modulosDisponiveis(): DefinicaoDeModulo[] {
  return MODULOS.filter((m) => m.status === "disponivel");
}

/** O modo pedido, se o módulo o suporta; senão o primeiro que ele suporta. */
export function modoSuportado(modulo: DefinicaoDeModulo, pedido: Modo): Modo {
  if (modulo.modos.includes(pedido)) return pedido;
  return modulo.modos[0] ?? "explorar";
}
