// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLASSES } from "../../src/lib/planetas";
import { DESERTO } from "../../src/ui/grafico-periodo-raio";

/**
 * O site espelha constantes da análise Python (fronteiras de tamanho e deserto de Netunos quentes).
 * `parametros.json` é gerado pelo pipeline a partir das constantes de verdade: se o Python mudar,
 * este teste falha até o site acompanhar, em vez de o gráfico ficar inconsistente em silêncio.
 */
const parametros = JSON.parse(
  readFileSync(new URL("../../public/dados/parametros.json", import.meta.url), "utf-8"),
) as {
  classes: { nome: string; min: number; max: number | null }[];
  deserto: { periodo_max: number; raio_min: number; raio_max: number };
};

describe("contrato com o pipeline Python", () => {
  it("as classes de tamanho do site são as da análise", () => {
    expect(CLASSES.map((c) => ({ nome: c.nome, min: c.min, max: Number.isFinite(c.max) ? c.max : null }))).toEqual(
      parametros.classes,
    );
  });

  it("o deserto desenhado é o da análise", () => {
    expect(DESERTO).toEqual({
      periodoMax: parametros.deserto.periodo_max,
      raioMin: parametros.deserto.raio_min,
      raioMax: parametros.deserto.raio_max,
    });
  });
});
