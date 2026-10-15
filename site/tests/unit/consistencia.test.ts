// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHAVE_DO_TEMA } from "../../src/ui/tema";

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf-8");

/** Declarações `--nome: valor;` de um bloco CSS, como objeto. */
function declaracoes(bloco: string): Record<string, string> {
  const r: Record<string, string> = {};
  for (const m of bloco.matchAll(/(--[\w-]+|color-scheme)\s*:\s*([^;]+);/g)) r[m[1] ?? ""] = (m[2] ?? "").trim();
  return r;
}

describe("o tema escuro tem dois blocos de CSS que precisam ficar iguais", () => {
  const css = ler("../../src/estilos/tokens.css");
  const dosSistema =
    /prefers-color-scheme: dark\)\s*\{\s*:root:where\(:not\(\[data-tema="claro"\]\)\)\s*\{([\s\S]*?)\n {2}\}/.exec(
      css,
    )?.[1];
  const manual = /:root\[data-tema="escuro"\]\s*\{([\s\S]*?)\n\}/.exec(css)?.[1];

  it("os dois blocos existem", () => {
    expect(dosSistema).toBeDefined();
    expect(manual).toBeDefined();
  });

  it("declaram as mesmas variáveis com os mesmos valores (o tema não pode mudar conforme a origem)", () => {
    const a = declaracoes(dosSistema ?? "");
    const b = declaracoes(manual ?? "");
    expect(Object.keys(a).length).toBeGreaterThan(20);
    expect(b).toEqual(a);
  });

  it("todo token do tema escuro também existe no claro", () => {
    const claro = declaracoes(/:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "");
    for (const nome of Object.keys(declaracoes(manual ?? ""))) expect(claro).toHaveProperty([nome]);
  });
});

describe("o script do <head> e o módulo do tema usam a mesma chave e os mesmos valores", () => {
  const html = ler("../../index.html");
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";

  it("lê a mesma chave do localStorage e só aceita os temas conhecidos", () => {
    expect(script).toContain(`localStorage.getItem("${CHAVE_DO_TEMA}")`);
    expect(script).toContain('"claro"');
    expect(script).toContain('"escuro"');
    expect(script).toContain("dataset.tema");
  });
});
