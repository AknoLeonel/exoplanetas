// @vitest-environment node
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/** Roda o commitlint de verdade, com a configuração do projeto, sobre uma mensagem. */
function lint(mensagem: string): { ok: boolean; saida: string } {
  const r = spawnSync("npx", ["--no-install", "commitlint", "--config", "commitlint.config.mjs"], {
    input: mensagem,
    encoding: "utf-8",
  });
  return { ok: r.status === 0, saida: `${r.stdout}${r.stderr}` };
}

describe("commitlint do projeto", () => {
  it("aceita a mensagem que o workflow de coleta de dados gera todo mês", () => {
    expect(lint("data: atualiza planetas confirmados da NASA").ok).toBe(true);
  });

  it("aceita siglas no meio do assunto", () => {
    expect(lint("test: adiciona testes e o CI com codecov").ok).toBe(true);
  });

  it("aceita commits comuns do fluxo, com corpo e rodapé", () => {
    expect(lint("fix: corrige a busca\n\nExplica o motivo.\n\nCloses #1").ok).toBe(true);
  });

  it("reprova assunto que começa com maiúscula", () => {
    const r = lint("feat: Adiciona coisa");
    expect(r.ok).toBe(false);
    expect(r.saida).toContain("subject-case");
  });

  it("reprova tipo em maiúscula ou fora da lista", () => {
    expect(lint("Feat: adiciona coisa").ok).toBe(false);
    expect(lint("coisa: adiciona coisa").ok).toBe(false);
  });

  it("reprova mensagem sem tipo", () => {
    expect(lint("adiciona coisa").ok).toBe(false);
  });
});
