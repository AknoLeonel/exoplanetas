import { vi } from "vitest";
import { classificar } from "../../src/lib/planetas";
import type { Descobertas, Metricas, Planeta } from "../../src/lib/tipos";

/** Planetas sintéticos e determinísticos: 60 planetas, 3 por estrela, de 2005 a 2024. */
export function planetasDeTeste(n = 60): Planeta[] {
  return Array.from({ length: n }, (_, i) => {
    const raio = 0.5 + ((i * 7) % 30) * 0.9;
    return {
      nome: `Teste-${i + 1} b`,
      ano: 2005 + (i % 20),
      periodo: 0.5 + ((i * 13) % 100) * 3,
      raio,
      massa: i % 3 === 0 ? 1 + i : null,
      temperatura: i % 5 === 0 ? null : 300 + i * 10,
      distancia: i % 7 === 0 ? null : 10 + i,
      medido: true,
      classe: classificar(raio),
    };
  });
}

export const descobertasDeTeste: Descobertas = {
  anos: [2013, 2014, 2015, 2016],
  metodos: {
    Transit: [100, 810, 99, 1432],
    "Radial Velocity": [60, 40, 50, 30],
    Microlensing: [0, 5, 0, 10],
    Imaging: [2, 0, 3, 1],
    Outros: [1, 1, 1, 1],
  },
  nomes: {
    Transit: "Trânsito",
    "Radial Velocity": "Velocidade radial",
    Microlensing: "Microlente",
    Imaging: "Imagem direta",
    Outros: "Outros",
  },
};

export const metricasDeTeste: Metricas = {
  dados: { coletado_em: "2026-10-14T21:25:43Z", planetas: 6445, estrelas: 4842, primeiro_ano: 1992, ultimo_ano: 2026 },
  descobertas: { ano_de_pico: 2016, planetas_no_pico: 1504, kepler_no_pico: 1276 },
  deserto_netunos_quentes: {
    fracao_netunos_geral: 0.4421,
    fracao_netunos_orbita_curta: 0.1351,
    planetas_orbita_curta: 792,
    periodo_curto_dias: 3,
  },
  parecidos_com_a_terra_mais_proximos: [
    { pl_name: "Gliese 12 b", pl_rade: 0.93, pl_insol: 1.62, pl_eqt: 314.6, sy_dist: 12.21 },
    { pl_name: "TRAPPIST-1 f", pl_rade: 1.045, pl_insol: 0.373, pl_eqt: 217.7, sy_dist: 12.4299 },
  ],
  modelo: {
    planetas: 1683,
    validacao: "GroupKFold (5 dobras) agrupado por estrela hospedeira",
    resultados: {
      "Mediana (referência)": { erro_percentual_mediano: 60.7, r2_log: -0.055, dentro_de_20pct: 5.3 },
      "Lei de potência massa-raio": { erro_percentual_mediano: 29.1, r2_log: 0.678, dentro_de_20pct: 32.4 },
      "Gradient boosting (todas as variáveis)": { erro_percentual_mediano: 18.6, r2_log: 0.79, dentro_de_20pct: 53.1 },
    },
    importancia_permutacao: { log_massa: 0.272, st_mass: 0.035, st_met: -0.001 },
  },
};

/** Host de seção como no index.html: um skeleton com barra de progresso. */
export function criarSecao(): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML =
    '<div data-skeleton class="skel"><div class="progresso-secao" data-indeterminado><span></span></div></div>';
  host.setAttribute("aria-busy", "true");
  document.body.append(host);
  return host;
}

export function esperar(ms = 40): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `vi.waitFor` com prazo folgado: com os arquivos de teste rodando em paralelo, 1 s pode não bastar. */
export function esperarAte<T>(verificacao: () => T | Promise<T>): Promise<T> {
  return vi.waitFor(verificacao, { timeout: 5000 });
}

/** Contexto 2D falso: o happy-dom não desenha, então o teste confere as chamadas que o pintor faz. */
export function contextoFalso() {
  const chamadas: { nome: string; args: unknown[] }[] = [];
  const contexto = new Proxy(
    {},
    {
      get(_alvo, nome: string) {
        if (nome === "createRadialGradient")
          return () => ({ addColorStop: (...args: unknown[]) => chamadas.push({ nome: "addColorStop", args }) });
        return (...args: unknown[]) => chamadas.push({ nome, args });
      },
      set: () => true,
    },
  );
  return { contexto, chamadas, de: (nome: string) => chamadas.filter((c) => c.nome === nome) };
}
