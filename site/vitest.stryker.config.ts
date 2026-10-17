import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vite.config";

/**
 * O Stryker muta só `src/lib` (lógica pura), que os testes unitários cobrem. Rodar só eles a cada mutante
 * mantém o job dentro do tempo: os mutantes em tabelas de constantes exigem rodar a suíte inteira de novo.
 * O teste do commitlint fica de fora: ele confere a configuração dos commits, não `src/lib`, e era o mais lento.
 */
export default mergeConfig(
  base,
  defineConfig({ test: { include: ["tests/unit/**/*.test.ts"], exclude: ["tests/unit/commitlint.test.ts"] } }),
);
