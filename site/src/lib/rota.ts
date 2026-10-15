import { MODOS, MODULO_INICIAL, type Modo } from "./modulos";

export interface Rota {
  modulo: string;
  modo: Modo;
  /** Estado do módulo (controles, seleção...), que vai na URL para ser compartilhável. */
  parametros: Readonly<Record<string, string>>;
}

const MODO_PADRAO: Modo = "explorar";

/** Só hashes que começam com `#/` são rotas; `#explorar` e afins são âncoras dentro da página. */
export function ehRota(hash: string): boolean {
  return hash === "" || hash === "#" || hash.startsWith("#/");
}

/**
 * Lê `#/modulo?modo=aprender&x=1`. Módulo desconhecido vira o início, modo inválido vira `explorar`.
 * Parâmetros repetidos ficam com o último valor.
 */
export function lerRota(hash: string, modulosValidos: ReadonlySet<string>): Rota {
  const texto = hash.startsWith("#") ? hash.slice(1) : hash;
  const [caminho = "", consulta = ""] = texto.split(/\?(.*)/s, 2);
  const id = caminho.replace(/^\/+/, "").split("/")[0] ?? "";
  const modulo = modulosValidos.has(id) ? id : MODULO_INICIAL;
  const params = new URLSearchParams(consulta);
  const modoPedido = params.get("modo");
  const modo = (MODOS as readonly string[]).includes(modoPedido ?? "") ? (modoPedido as Modo) : MODO_PADRAO;
  const parametros: Record<string, string> = {};
  for (const [chave, valor] of params) if (chave !== "modo") parametros[chave] = valor;
  return { modulo, modo, parametros };
}

/** O inverso de `lerRota`, com parâmetros em ordem estável. O modo padrão não aparece. */
export function montarHash(rota: Rota): string {
  const params = new URLSearchParams();
  if (rota.modo !== MODO_PADRAO) params.set("modo", rota.modo);
  for (const chave of Object.keys(rota.parametros).sort()) params.set(chave, rota.parametros[chave] ?? "");
  const consulta = params.toString();
  return `#/${rota.modulo}${consulta ? `?${consulta}` : ""}`;
}
