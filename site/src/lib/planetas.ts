import { ErroDados, type IdClasse, type Planeta } from "./tipos";

/** Mesmas fronteiras do pipeline Python (dados.CLASSES_TAMANHO), em raios terrestres. */
export const CLASSES: readonly { id: IdClasse; nome: string; min: number; max: number }[] = [
  { id: "terra", nome: "Terra", min: 0, max: 1.25 },
  { id: "super-terra", nome: "Super-Terra", min: 1.25, max: 2 },
  { id: "netuno", nome: "Netuno", min: 2, max: 6 },
  { id: "jupiter", nome: "Júpiter", min: 6, max: 15 },
  { id: "super-jupiter", nome: "Super-Júpiter", min: 15, max: Number.POSITIVE_INFINITY },
];

export function classificar(raio: number): IdClasse {
  const classe = CLASSES.find((c) => raio >= c.min && raio < c.max);
  return (classe ?? CLASSES[CLASSES.length - 1])?.id ?? "super-jupiter";
}

const COLUNAS = ["nome", "ano", "periodo", "raio", "massa", "temperatura", "distancia"] as const;

function numeroOuNulo(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Valida o planetas.json gerado pelo pipeline (colunas + linhas) e devolve objetos tipados. */
export function lerPlanetas(bruto: unknown): Planeta[] {
  const obj = bruto as { colunas?: unknown; linhas?: unknown } | null;
  if (!obj || !Array.isArray(obj.colunas) || !Array.isArray(obj.linhas)) {
    throw new ErroDados("planetas.json fora do formato esperado", "planetas");
  }
  if (COLUNAS.some((c, i) => obj.colunas && (obj.colunas as unknown[])[i] !== c)) {
    throw new ErroDados("planetas.json com colunas diferentes das esperadas", "planetas");
  }
  const planetas: Planeta[] = [];
  for (const linha of obj.linhas as unknown[]) {
    if (!Array.isArray(linha)) throw new ErroDados("linha inválida em planetas.json", "planetas");
    const [nome, ano, periodo, raio, massa, temperatura, distancia] = linha as unknown[];
    const p = numeroOuNulo(periodo);
    const r = numeroOuNulo(raio);
    const a = numeroOuNulo(ano);
    if (typeof nome !== "string" || p === null || r === null || a === null || p <= 0 || r <= 0) {
      throw new ErroDados(`planeta inválido em planetas.json: ${String(nome)}`, "planetas");
    }
    planetas.push({
      nome,
      ano: a,
      periodo: p,
      raio: r,
      massa: numeroOuNulo(massa),
      temperatura: numeroOuNulo(temperatura),
      distancia: numeroOuNulo(distancia),
      classe: classificar(r),
    });
  }
  return planetas;
}

export interface Filtro {
  classes: ReadonlySet<IdClasse>;
  anoMinimo: number;
  soComMassa: boolean;
  busca: string;
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function filtrar(planetas: readonly Planeta[], filtro: Filtro): Planeta[] {
  const busca = normalizar(filtro.busca);
  return planetas.filter(
    (p) =>
      filtro.classes.has(p.classe) &&
      p.ano >= filtro.anoMinimo &&
      (!filtro.soComMassa || p.massa !== null) &&
      (busca === "" || normalizar(p.nome).includes(busca)),
  );
}

export function contarPorClasse(planetas: readonly Planeta[]): Record<IdClasse, number> {
  const contagem: Record<IdClasse, number> = { terra: 0, "super-terra": 0, netuno: 0, jupiter: 0, "super-jupiter": 0 };
  for (const p of planetas) contagem[p.classe]++;
  return contagem;
}

export function intervaloDeAnos(planetas: readonly Planeta[]): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const p of planetas) {
    if (p.ano < min) min = p.ano;
    if (p.ano > max) max = p.ano;
  }
  return [min, max];
}

export type ColunaOrdenavel = "nome" | "ano" | "periodo" | "raio" | "massa" | "temperatura" | "distancia";
export type Direcao = "asc" | "desc";

/** Ordena sem alterar a lista original. Valores ausentes ficam sempre no fim, em qualquer direção. */
export function ordenar(planetas: readonly Planeta[], coluna: ColunaOrdenavel, direcao: Direcao): Planeta[] {
  const sinal = direcao === "asc" ? 1 : -1;
  return [...planetas].sort((a, b) => {
    const va = a[coluna];
    const vb = b[coluna];
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === "string" && typeof vb === "string")
      return sinal * va.localeCompare(vb, "pt-BR", { numeric: true });
    return sinal * (Number(va) - Number(vb));
  });
}
