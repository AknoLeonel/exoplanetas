import { describe, expect, it } from "vitest";
import { M_EARTH_EM_MJUP, massaMinimaMjup, semiAmplitudeMs, velocidadeRadialMs } from "./auxiliar-vr";

describe("semi-amplitude da velocidade radial", () => {
  // Referências: Júpiter → Sol ≈ 12,5 m/s; Terra → Sol ≈ 0,09 m/s; 51 Peg b: K = 55,9 m/s (Butler et al. 2006).
  it("Júpiter faz o Sol balançar 12,5 m/s", () => {
    expect(semiAmplitudeMs({ periodoDias: 4332.59, massaPlanetaMjup: 1, massaEstrelaMsol: 1 })).toBeCloseTo(12.45, 1);
  });

  it("a Terra faz o Sol balançar 9 cm/s", () => {
    expect(
      semiAmplitudeMs({ periodoDias: 365.256, massaPlanetaMjup: M_EARTH_EM_MJUP, massaEstrelaMsol: 1 }),
    ).toBeCloseTo(0.0895, 3);
  });

  it("51 Pegasi b: ~56 m/s", () => {
    const K = semiAmplitudeMs({
      periodoDias: 4.2308,
      massaPlanetaMjup: 0.468,
      massaEstrelaMsol: 1.11,
      excentricidade: 0.0,
    });
    expect(Math.abs(K / 55.9 - 1)).toBeLessThan(0.03);
  });

  it("depende de sin i e da excentricidade", () => {
    const base = { periodoDias: 10, massaPlanetaMjup: 1, massaEstrelaMsol: 1 };
    const K90 = semiAmplitudeMs(base);
    expect(semiAmplitudeMs({ ...base, inclinacaoGraus: 30 })).toBeCloseTo(K90 * 0.5, 6);
    expect(semiAmplitudeMs({ ...base, inclinacaoGraus: 0 })).toBeCloseTo(0, 6);
    expect(semiAmplitudeMs({ ...base, excentricidade: 0.6 })).toBeCloseTo(K90 / 0.8, 6);
  });

  it("cai com o período (K ∝ P^(−1/3)) e cresce com a massa do planeta", () => {
    const base = { periodoDias: 10, massaPlanetaMjup: 1, massaEstrelaMsol: 1 };
    expect(semiAmplitudeMs({ ...base, periodoDias: 80 })).toBeCloseTo(semiAmplitudeMs(base) / 2, 3);
    expect(semiAmplitudeMs({ ...base, massaPlanetaMjup: 2 })).toBeGreaterThan(1.9 * semiAmplitudeMs(base));
  });

  it("rejeita entradas inválidas", () => {
    const ok = { periodoDias: 10, massaPlanetaMjup: 1, massaEstrelaMsol: 1 };
    expect(() => semiAmplitudeMs({ ...ok, periodoDias: 0 })).toThrow("periodoDias");
    expect(() => semiAmplitudeMs({ ...ok, massaPlanetaMjup: -1 })).toThrow("massaPlanetaMjup");
    expect(() => semiAmplitudeMs({ ...ok, massaEstrelaMsol: 0 })).toThrow("massaEstrelaMsol");
    expect(() => semiAmplitudeMs({ ...ok, excentricidade: 1 })).toThrow(RangeError);
  });
});

describe("massa mínima", () => {
  it("é a inversa de K para planetas muito menos massivos que a estrela", () => {
    const entrada = { periodoDias: 4.2308, massaPlanetaMjup: 0.5, massaEstrelaMsol: 1.1, excentricidade: 0.2 };
    const K = semiAmplitudeMs(entrada);
    const m = massaMinimaMjup({ semiAmplitudeMs: K, periodoDias: 4.2308, massaEstrelaMsol: 1.1, excentricidade: 0.2 });
    expect(m).toBeCloseTo(0.5, 2);
  });

  it("K de 12,45 m/s a 11,86 anos dá 1 Mjup em torno do Sol", () => {
    expect(massaMinimaMjup({ semiAmplitudeMs: 12.45, periodoDias: 4332.59, massaEstrelaMsol: 1 })).toBeCloseTo(1, 1);
  });

  it("rejeita entradas inválidas", () => {
    expect(() => massaMinimaMjup({ semiAmplitudeMs: 0, periodoDias: 1, massaEstrelaMsol: 1 })).toThrow(
      "semiAmplitudeMs",
    );
    expect(() => massaMinimaMjup({ semiAmplitudeMs: 1, periodoDias: 0, massaEstrelaMsol: 1 })).toThrow("periodoDias");
    expect(() => massaMinimaMjup({ semiAmplitudeMs: 1, periodoDias: 1, massaEstrelaMsol: 0 })).toThrow(
      "massaEstrelaMsol",
    );
    expect(() =>
      massaMinimaMjup({ semiAmplitudeMs: 1, periodoDias: 1, massaEstrelaMsol: 1, excentricidade: 1 }),
    ).toThrow(RangeError);
  });
});

describe("curva de velocidade radial", () => {
  const K = 50;
  const P = 10;

  it("órbita circular: senoide de amplitude K e período P", () => {
    const v = (t: number) =>
      velocidadeRadialMs({ tempoDias: t, periodoDias: P, semiAmplitudeMs: K, argumentoDoPeriastroGraus: 0 });
    expect(v(0)).toBeCloseTo(K, 9);
    expect(v(P / 4)).toBeCloseTo(0, 9);
    expect(v(P / 2)).toBeCloseTo(-K, 9);
    expect(v(P)).toBeCloseTo(K, 9);
  });

  it("a média sobre uma volta é zero, mesmo com excentricidade", () => {
    let soma = 0;
    const n = 4000;
    for (let i = 0; i < n; i++)
      soma += velocidadeRadialMs({
        tempoDias: (i * P) / n,
        periodoDias: P,
        semiAmplitudeMs: K,
        excentricidade: 0.5,
        argumentoDoPeriastroGraus: 40,
      });
    expect(Math.abs(soma / n)).toBeLessThan(0.05);
  });

  it("com excentricidade a curva fica assimétrica: o máximo passa de K", () => {
    let maximo = Number.NEGATIVE_INFINITY;
    let minimo = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 2000; i++) {
      const v = velocidadeRadialMs({
        tempoDias: (i * P) / 2000,
        periodoDias: P,
        semiAmplitudeMs: K,
        excentricidade: 0.6,
        argumentoDoPeriastroGraus: 0,
      });
      maximo = Math.max(maximo, v);
      minimo = Math.min(minimo, v);
    }
    expect(maximo).toBeCloseTo(K * 1.6, 1);
    expect(minimo).toBeCloseTo(-K * 0.4, 1);
  });
});
