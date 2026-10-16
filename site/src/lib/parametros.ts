/** Um controle numérico de simulador: faixa, escala e como ele aparece na URL. */
export interface LimiteDoControle {
  /** Nome curto do parâmetro na URL. */
  url: string;
  rotulo: string;
  unidade: string;
  min: number;
  max: number;
  /** Controle em escala logarítmica: os valores vão de frações a milhares. */
  log: boolean;
  passo: number;
}

export interface ParametrosDaSimulacao<S, K extends keyof S> {
  /** Lê da URL. Ausente ou inválido vale o padrão; fora da faixa, é trazido para dentro. */
  ler(parametros: Readonly<Record<string, string>>): S;
  /** Muda um parâmetro, respeitando a faixa. Valor que não é número é ignorado. */
  comValor(s: S, chave: K, valor: number): S;
  /** Para a URL, só com o que difere do padrão (o resto vai como `null`, para sair da URL). */
  paraParametros(s: S): Record<string, string | null>;
}

function limitar(valor: number, { min, max }: LimiteDoControle): number {
  return Math.min(max, Math.max(min, valor));
}

/**
 * Leitura e escrita de uma simulação na URL, a partir das faixas dos controles. Toda simulação tem uma
 * `semente` inteira para o ruído. `ajustar` aplica restrições entre parâmetros (por exemplo, u₁ + u₂ ≤ 1).
 */
export function criarParametros<K extends string, S extends Record<K, number> & { semente: number }>(
  limites: Readonly<Record<K, LimiteDoControle>>,
  padrao: Readonly<S>,
  ajustar: (s: S) => S = (s) => s,
): ParametrosDaSimulacao<S, K> {
  const chaves = Object.keys(limites) as K[];
  return {
    ler(parametros) {
      const s: S = { ...padrao };
      for (const chave of chaves) {
        const limite = limites[chave];
        const texto = parametros[limite.url];
        const valor = texto === undefined || texto.trim() === "" ? Number.NaN : Number(texto);
        if (Number.isFinite(valor)) (s as Record<K, number>)[chave] = limitar(valor, limite);
      }
      const semente = Number(parametros.semente);
      if (Number.isInteger(semente) && semente > 0) s.semente = semente;
      return ajustar(s);
    },
    comValor(s, chave, valor) {
      if (!Number.isFinite(valor)) return s;
      return ajustar({ ...s, [chave]: limitar(valor, limites[chave]) });
    },
    paraParametros(s) {
      const saida: Record<string, string | null> = {};
      for (const chave of chaves) {
        const { url } = limites[chave];
        saida[url] = s[chave] === padrao[chave] ? null : String(Number(s[chave].toPrecision(6)));
      }
      saida.semente = s.semente === padrao.semente ? null : String(s.semente);
      return saida;
    },
  };
}
