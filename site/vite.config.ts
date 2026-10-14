/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  define: {
    // A Vercel expõe esses valores no build. Localmente ficam "dev" e "local".
    __VERSAO__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev"),
    __AMBIENTE__: JSON.stringify(process.env.VERCEL_ENV ?? "local"),
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    environment: "happy-dom",
    include: ["tests/unit/**/*.test.ts", "tests/integracao/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/telemetry/provedores/**", "src/app/main.ts", "src/vite-env.d.ts"],
      reporter: ["text", "lcov", "json-summary"],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 80 },
    },
  },
});
