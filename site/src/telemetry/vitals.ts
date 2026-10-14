import { onCLS, onINP, onLCP } from "web-vitals";
import type { Contexto } from "./provedor";

type Reportar = (nome: string, dados: Contexto) => void;

/**
 * Reporta LCP, CLS e INP pela fachada. Este módulo só é importado (via `import()`) quando algum
 * fornecedor está ligado, então o pacote `web-vitals` não pesa para quem não configurou nada.
 */
export function medirWebVitals(reportar: Reportar): void {
  const enviar = (m: { name: string; value: number; rating: string }) =>
    reportar("web-vital", {
      metrica: m.name,
      valor: Math.round(m.name === "CLS" ? m.value * 1000 : m.value),
      nota: m.rating,
    });
  onLCP(enviar);
  onCLS(enviar);
  onINP(enviar);
}
