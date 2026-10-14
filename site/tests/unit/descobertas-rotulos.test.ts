import { describe, expect, it } from "vitest";
import { rotuloDoAno } from "../../src/ui/descobertas";

const anos = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe("rotuloDoAno", () => {
  it("mostra o primeiro ano e os múltiplos de 5", () => {
    const lista = anos(1992, 2026);
    const mostrados = lista.filter((a) => rotuloDoAno(a, lista));
    expect(mostrados).toEqual([1992, 1995, 2000, 2005, 2010, 2015, 2020, 2025]);
  });

  it("não mostra o último ano se ele encostaria no rótulo anterior", () => {
    const lista = anos(1992, 2026);
    expect(rotuloDoAno(2026, lista)).toBe(false);
    expect(rotuloDoAno(2025, lista)).toBe(true);
  });

  it("mostra o último ano quando há espaço (3 anos ou mais depois do último múltiplo de 5)", () => {
    const lista = anos(1992, 2028);
    expect(rotuloDoAno(2028, lista)).toBe(true);
    expect(rotuloDoAno(2027, lista)).toBe(false);
  });

  it("o primeiro ano aparece mesmo sem ser múltiplo de 5", () => {
    expect(rotuloDoAno(1992, anos(1992, 2000))).toBe(true);
    expect(rotuloDoAno(1993, anos(1992, 2000))).toBe(false);
  });
});
