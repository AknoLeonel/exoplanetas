import { beforeEach, describe, expect, it, vi } from "vitest";

const registrados: Record<string, (m: { name: string; value: number; rating: string }) => void> = {};

vi.mock("web-vitals", () => ({
  onLCP: (cb: never) => {
    registrados.LCP = cb;
  },
  onCLS: (cb: never) => {
    registrados.CLS = cb;
  },
  onINP: (cb: never) => {
    registrados.INP = cb;
  },
}));

import { medirWebVitals } from "../../src/telemetry/vitals";

describe("medirWebVitals", () => {
  beforeEach(() => {
    for (const k of Object.keys(registrados)) delete registrados[k];
  });

  it("registra LCP, CLS e INP e reporta pela fachada", () => {
    const reportar = vi.fn();
    medirWebVitals(reportar);
    expect(Object.keys(registrados).sort()).toEqual(["CLS", "INP", "LCP"]);
    registrados.LCP?.({ name: "LCP", value: 1234.6, rating: "good" });
    expect(reportar).toHaveBeenCalledWith("web-vital", { metrica: "LCP", valor: 1235, nota: "good" });
  });

  it("CLS não tem unidade: vai em milésimos para não virar zero", () => {
    const reportar = vi.fn();
    medirWebVitals(reportar);
    registrados.CLS?.({ name: "CLS", value: 0.0456, rating: "good" });
    expect(reportar).toHaveBeenCalledWith("web-vital", { metrica: "CLS", valor: 46, nota: "good" });
    registrados.INP?.({ name: "INP", value: 180.2, rating: "needs-improvement" });
    expect(reportar).toHaveBeenLastCalledWith("web-vital", { metrica: "INP", valor: 180, nota: "needs-improvement" });
  });
});
