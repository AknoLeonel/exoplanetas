const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

function formatador(casas: number): Intl.NumberFormat {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** 6445 -> "6.445" */
export function milhar(n: number): string {
  return inteiro.format(n);
}

/** 18.6355 -> "18,6" */
export function decimal(n: number, casas = 1): string {
  return formatador(casas).format(n);
}

/** Já em porcentagem: 18.6355 -> "18,6%" */
export function percentual(n: number, casas = 1): string {
  return `${decimal(n, casas)}%`;
}

/** Número com algarismos significativos suficientes para ler o valor sem ruído: 8.4634 -> "8,46", 1432 -> "1.432". */
export function compacto(n: number): string {
  if (n >= 100) return milhar(Math.round(n));
  if (n >= 10) return decimal(n, 1);
  if (n >= 1) return decimal(n, 2);
  return decimal(n, 3);
}

/** Rótulo de eixo: sem zeros à direita (0,1 · 1 · 10 · 10.000). */
export function eixo(n: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(n);
}

/** Kelvin para graus Celsius, arredondado: 288 K -> "15 °C". */
export function celsius(kelvin: number): string {
  return `${milhar(Math.round(kelvin - 273.15))} °C`;
}

/** Parsecs para anos-luz, arredondado: 12.43 pc -> "41 anos-luz". */
export function anosLuz(parsecs: number): string {
  return `${milhar(Math.round(parsecs * 3.26156))} anos-luz`;
}
