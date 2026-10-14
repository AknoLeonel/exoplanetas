import { describe, expect, it } from "vitest";
import { criarProgresso } from "../../src/lib/progresso";

describe("criarProgresso", () => {
  it("sem tarefas está completo", () => {
    const p = criarProgresso();
    expect(p.fracao()).toBe(1);
    expect(p.pendentes()).toBe(0);
  });

  it("calcula a fração e as pendentes", () => {
    const p = criarProgresso();
    p.adicionar(4);
    p.concluir();
    expect(p.fracao()).toBe(0.25);
    expect(p.pendentes()).toBe(3);
    p.concluir(2);
    expect(p.fracao()).toBe(0.75);
  });

  it("zera quando a última termina e a rodada seguinte começa do zero", () => {
    const p = criarProgresso();
    p.adicionar(2);
    p.concluir(2);
    expect(p.pendentes()).toBe(0);
    p.adicionar();
    expect(p.fracao()).toBe(0);
    expect(p.pendentes()).toBe(1);
  });

  it("não conclui mais do que existe", () => {
    const p = criarProgresso();
    p.adicionar();
    p.concluir(5);
    expect(p.pendentes()).toBe(0);
    expect(p.fracao()).toBe(1);
  });

  it("tarefas novas durante a rodada entram na conta", () => {
    const p = criarProgresso();
    p.adicionar(2);
    p.concluir();
    p.adicionar();
    expect(p.fracao()).toBeCloseTo(1 / 3);
  });
});
