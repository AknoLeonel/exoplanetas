import type { Configuracao, NomeProvedor } from "./config";

export type Contexto = Readonly<Record<string, string | number | boolean>>;

/** O que a fachada exige de cada fornecedor. Só os módulos em provedores/ conhecem os SDKs. */
export interface Provedor {
  nome: NomeProvedor;
  /** O SDK já captura erros não tratados sozinho; a fachada não repassa esses. */
  capturaAutomatica: boolean;
  erro(erro: unknown, contexto?: Contexto): void;
  evento(nome: string, dados?: Contexto): void;
}

export interface ModuloProvedor {
  iniciar(config: Configuracao): Promise<Provedor>;
}
