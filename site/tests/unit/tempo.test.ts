import { describe, expect, it } from "vitest";
import { paraMs } from "../../src/lib/tempo";

describe("paraMs", () => {
  it("lê milissegundos e segundos", () => {
    expect(paraMs("240ms")).toBe(240);
    expect(paraMs(" 0.24s ")).toBe(240);
    expect(paraMs("0.01ms")).toBe(0.01);
    expect(paraMs("1s")).toBe(1000);
  });

  it("devolve null para o que não é tempo", () => {
    expect(paraMs("")).toBeNull();
    expect(paraMs("abc")).toBeNull();
    expect(paraMs("240")).toBeNull();
    expect(paraMs("240px")).toBeNull();
  });
});
