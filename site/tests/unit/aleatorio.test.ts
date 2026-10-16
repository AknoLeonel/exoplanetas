import { describe, expect, it } from "vitest";
import { aleatorio, gaussiano } from "../../src/lib/aleatorio";

describe("sorteios reproduzíveis", () => {
  it("aleatorio fica em [0, 1) e repete com a mesma semente", () => {
    const a = aleatorio(42);
    const b = aleatorio(42);
    const c = aleatorio(43);
    let diferentes = 0;
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      if (x !== c()) diferentes++;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(diferentes).toBeGreaterThan(990);
  });

  it("gaussiano tem média 0 e desvio 1", () => {
    const sortear = aleatorio(7);
    const n = 20000;
    const valores = Array.from({ length: n }, () => gaussiano(sortear));
    const media = valores.reduce((x, y) => x + y, 0) / n;
    const desvio = Math.sqrt(valores.reduce((x, y) => x + (y - media) ** 2, 0) / n);
    expect(Math.abs(media)).toBeLessThan(0.03);
    expect(Math.abs(desvio - 1)).toBeLessThan(0.03);
  });

  it("gaussiano nunca dá infinito, mesmo quando o sorteio dá 0", () => {
    const zeros = () => 0;
    expect(Number.isFinite(gaussiano(zeros))).toBe(true);
  });
});
