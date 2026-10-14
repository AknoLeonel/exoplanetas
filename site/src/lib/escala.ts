/** Escala logarítmica: leva um valor do domínio [a, b] para o intervalo de pixels [c, d]. */
export function escalaLog(
  dominio: readonly [number, number],
  imagem: readonly [number, number],
): (v: number) => number {
  const [a, b] = dominio;
  const [c, d] = imagem;
  const la = Math.log10(a);
  const lb = Math.log10(b);
  return (v) => c + ((Math.log10(v) - la) / (lb - la)) * (d - c);
}

/** Escala linear: leva [a, b] para [c, d]. */
export function escalaLinear(
  dominio: readonly [number, number],
  imagem: readonly [number, number],
): (v: number) => number {
  const [a, b] = dominio;
  const [c, d] = imagem;
  return (v) => c + ((v - a) / (b - a)) * (d - c);
}

export interface Marca {
  valor: number;
  /** Só as potências de dez recebem rótulo, para o eixo não ficar poluído. */
  principal: boolean;
}

/** Marcas 1, 2 e 5 por década dentro do domínio. */
export function marcasLog(min: number, max: number): Marca[] {
  const marcas: Marca[] = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    for (const m of [1, 2, 5]) {
      const valor = Number((m * 10 ** e).toPrecision(12));
      if (valor >= min && valor <= max) marcas.push({ valor, principal: m === 1 });
    }
  }
  return marcas;
}

/** Marcas "bonitas" (1, 2, 5 × 10^k) para um eixo linear de 0 até `max`, com no máximo `n` marcas. */
export function marcasLineares(max: number, n = 5): number[] {
  const bruto = max / n;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = ([1, 2, 5, 10].find((m) => m * potencia >= bruto) ?? 10) * potencia;
  const marcas: number[] = [];
  for (let v = 0; v <= max; v += passo) marcas.push(Number(v.toPrecision(12)));
  return marcas;
}

export interface Ponto {
  x: number;
  y: number;
}

/** Índice do ponto mais próximo do cursor, ou -1 se nenhum estiver a menos de `raioMax` pixels. */
export function maisProximo(pontos: readonly Ponto[], x: number, y: number, raioMax: number): number {
  let melhor = -1;
  let menor = raioMax * raioMax;
  for (let i = 0; i < pontos.length; i++) {
    const p = pontos[i];
    if (!p) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d <= menor) {
      menor = d;
      melhor = i;
    }
  }
  return melhor;
}
