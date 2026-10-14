import { type Configuracao, type NomeProvedor, provedoresConfigurados } from "./config";
import type { Contexto, ModuloProvedor, Provedor } from "./provedor";

export type { Contexto } from "./provedor";

export type Carregadores = Record<NomeProvedor, () => Promise<ModuloProvedor>>;

/** Cada fornecedor é um `import()` próprio: só baixa o SDK de quem foi configurado. */
const carregadoresPadrao: Carregadores = {
  sentry: () => import("./provedores/sentry"),
  datadog: () => import("./provedores/datadog"),
  newrelic: () => import("./provedores/newrelic"),
  otel: () => import("./provedores/otel"),
};

export interface ResultadoDaInicializacao {
  ativos: NomeProvedor[];
  falhas: { nome: NomeProvedor; motivo: string }[];
}

type Pendente = (p: Provedor) => void;

/** Itens guardados enquanto os SDKs iniciam. O que passar disso é descartado: a prioridade é não pesar. */
const LIMITE_DA_FILA = 50;

let provedores: Provedor[] = [];
let fila: Pendente[] = [];
let iniciando = false;

function despachar(acao: Pendente): void {
  if (iniciando) {
    if (fila.length < LIMITE_DA_FILA) fila.push(acao);
    return;
  }
  for (const p of provedores) {
    try {
      acao(p);
    } catch {
      // Telemetria nunca pode derrubar a página.
    }
  }
}

export async function iniciarTelemetria(
  config: Configuracao,
  carregadores: Carregadores = carregadoresPadrao,
): Promise<ResultadoDaInicializacao> {
  iniciando = true;
  const resultado: ResultadoDaInicializacao = { ativos: [], falhas: [] };
  const lista: Provedor[] = [];
  await Promise.all(
    provedoresConfigurados(config).map(async (nome) => {
      try {
        const modulo = await carregadores[nome]();
        lista.push(await modulo.iniciar(config));
        resultado.ativos.push(nome);
      } catch (e) {
        resultado.falhas.push({ nome, motivo: e instanceof Error ? e.message : String(e) });
      }
    }),
  );
  provedores = lista;
  iniciando = false;
  const pendentes = fila;
  fila = [];
  for (const acao of pendentes) despachar(acao);
  return resultado;
}

/** Erro tratado pelo código (por exemplo, falha ao carregar dados). */
export function erro(e: unknown, contexto?: Contexto): void {
  despachar((p) => p.erro(e, contexto));
}

export function evento(nome: string, dados?: Contexto): void {
  despachar((p) => p.evento(nome, dados));
}

/** Duração de uma operação, em milissegundos. */
export function tempo(nome: string, ms: number, dados?: Contexto): void {
  evento(nome, { ...dados, duracao_ms: Math.round(ms) });
}

/**
 * Erro não tratado: vai só para quem não o captura sozinho, para não duplicar. A exceção são os erros
 * que acontecem antes de os SDKs iniciarem: nenhum SDK os viu, então todos recebem.
 */
export function erroGlobal(e: unknown, contexto?: Contexto): void {
  const antesDosSdks = iniciando;
  despachar((p) => {
    if (antesDosSdks || !p.capturaAutomatica) p.erro(e, contexto);
  });
}

/** Liga os ouvintes de `error` e `unhandledrejection`. Devolve a função que os remove. */
export function instalarCapturaGlobal(alvo: Pick<Window, "addEventListener" | "removeEventListener">): () => void {
  const aoErrar = (ev: Event) =>
    erroGlobal((ev as ErrorEvent).error ?? (ev as ErrorEvent).message, { origem: "window.error" });
  const aoRejeitar = (ev: Event) => erroGlobal((ev as PromiseRejectionEvent).reason, { origem: "unhandledrejection" });
  alvo.addEventListener("error", aoErrar);
  alvo.addEventListener("unhandledrejection", aoRejeitar);
  return () => {
    alvo.removeEventListener("error", aoErrar);
    alvo.removeEventListener("unhandledrejection", aoRejeitar);
  };
}

export function provedoresAtivos(): NomeProvedor[] {
  return provedores.map((p) => p.nome);
}

/** Só para testes. */
export function reiniciarTelemetria(): void {
  provedores = [];
  fila = [];
  iniciando = false;
}
