import { lerDescobertas, lerMetricas } from "../lib/dados";
import { lerPlanetas } from "../lib/planetas";
import { lerTransitos, type PlanetaDeTransito } from "../lib/simulacao-transito";
import { lerVelocidades, type PlanetaComMassa } from "../lib/simulacao-velocidade-radial";
import { type Descobertas, ErroDados, type Metricas, type Planeta } from "../lib/tipos";
import { tempo as registrarTempo } from "../telemetry";
import { acompanhar } from "./acompanhar";

type Buscar = (url: string) => Promise<Response>;

export interface OpcoesDeCarga {
  buscar?: Buscar;
  /** Fração de 0 a 1, ou null quando o tamanho total é desconhecido. */
  aoProgredir?: (fracao: number | null) => void;
}

/** Lê o corpo da resposta aos poucos para informar o progresso. */
async function lerCorpo(resposta: Response, aoProgredir?: (fracao: number | null) => void): Promise<string> {
  // Sem quem acompanhe o progresso, lê de uma vez: pegar o leitor antes travaria o corpo para `text()`.
  if (!aoProgredir || !resposta.body) return resposta.text();
  const leitor = resposta.body.getReader();
  const comprimido = resposta.headers.has("content-encoding");
  const total = Number(resposta.headers.get("content-length"));
  const conhecido = !comprimido && Number.isFinite(total) && total > 0;
  const decodificador = new TextDecoder();
  let texto = "";
  let lidos = 0;
  aoProgredir(conhecido ? 0 : null);
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    lidos += value.byteLength;
    texto += decodificador.decode(value, { stream: true });
    aoProgredir(conhecido ? Math.min(1, lidos / total) : null);
  }
  return texto + decodificador.decode();
}

/** @public Exportada para os testes: as seções usam os carregadores memorizados abaixo. */
export async function baixarJson(url: string, opcoes: OpcoesDeCarga = {}): Promise<unknown> {
  const buscar: Buscar = opcoes.buscar ?? ((u) => fetch(u));
  const inicio = performance.now();
  let resposta: Response;
  try {
    resposta = await buscar(url);
  } catch (e) {
    throw new ErroDados(`sem conexão ao baixar ${url}: ${e instanceof Error ? e.message : String(e)}`, url);
  }
  if (!resposta.ok) throw new ErroDados(`HTTP ${resposta.status} ao baixar ${url}`, url);
  const texto = await lerCorpo(resposta, opcoes.aoProgredir);
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new ErroDados(`JSON inválido em ${url}`, url);
  }
  registrarTempo("carga-de-dados", performance.now() - inicio, { arquivo: url, bytes: texto.length });
  return json;
}

/** Uma carga por arquivo, compartilhada entre seções. Se falhar, a próxima tentativa começa do zero. */
function memorizar<T>(url: string, ler: (bruto: unknown) => T): (opcoes?: OpcoesDeCarga) => Promise<T> {
  let promessa: Promise<T> | null = null;
  return (opcoes) => {
    if (!promessa) {
      const atual: Promise<T> = acompanhar(baixarJson(url, opcoes)).then(ler);
      promessa = atual;
      atual.catch(() => {
        if (promessa === atual) promessa = null;
      });
    }
    return promessa;
  };
}

export const carregarPlanetas: (opcoes?: OpcoesDeCarga) => Promise<Planeta[]> = memorizar(
  "/dados/planetas.json",
  lerPlanetas,
);
export const carregarDescobertas: (opcoes?: OpcoesDeCarga) => Promise<Descobertas> = memorizar(
  "/dados/descobertas.json",
  lerDescobertas,
);
export const carregarMetricas: (opcoes?: OpcoesDeCarga) => Promise<Metricas> = memorizar(
  "/dados/metricas.json",
  lerMetricas,
);
export const carregarTransitos: (opcoes?: OpcoesDeCarga) => Promise<PlanetaDeTransito[]> = memorizar(
  "/dados/transitos.json",
  lerTransitos,
);
export const carregarVelocidades: (opcoes?: OpcoesDeCarga) => Promise<PlanetaComMassa[]> = memorizar(
  "/dados/velocidades.json",
  lerVelocidades,
);
