import { afterEach, describe, expect, it, vi } from "vitest";
import { duracao, entrar, reduzMovimento, sair, trocar } from "../../src/ui/animacao";
import { esperar } from "./fixtures";

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("style");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function el(): HTMLElement {
  const e = document.createElement("div");
  document.body.append(e);
  return e;
}

describe("duracao", () => {
  it("lê o token de movimento do CSS", () => {
    document.documentElement.style.setProperty("--dur-saida", "160ms");
    document.documentElement.style.setProperty("--dur-entrada", "0.26s");
    expect(duracao("--dur-saida")).toBe(160);
    expect(duracao("--dur-entrada")).toBe(260);
  });

  it("sem o token (ou valor inválido) vale 0", () => {
    expect(duracao("--dur-barra")).toBe(0);
    document.documentElement.style.setProperty("--dur-barra", "rápido");
    expect(duracao("--dur-barra")).toBe(0);
  });
});

describe("reduzMovimento", () => {
  it("segue a preferência do sistema", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce") }));
    expect(reduzMovimento()).toBe(true);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(reduzMovimento()).toBe(false);
  });

  it("sem matchMedia, não reduz", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(reduzMovimento()).toBe(false);
  });
});

describe("entrar e sair", () => {
  it("entrar vai de 'entrando' a 'pronto' depois de pintar o estado inicial", async () => {
    const e = el();
    const p = entrar(e);
    expect(e.dataset.anim).toBe("entrando");
    await p;
    expect(e.dataset.anim).toBe("pronto");
  });

  it("entrar não sobrescreve se algo interrompeu no meio", async () => {
    const e = el();
    const p = entrar(e);
    e.dataset.anim = "saindo";
    await p;
    expect(e.dataset.anim).toBe("saindo");
  });

  it("entrar funciona sem requestAnimationFrame", async () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    const e = el();
    await entrar(e);
    expect(e.dataset.anim).toBe("pronto");
  });

  it("sair marca 'saindo' e espera a duração do token", async () => {
    document.documentElement.style.setProperty("--dur-saida", "60ms");
    const e = el();
    const inicio = performance.now();
    await sair(e);
    expect(e.dataset.anim).toBe("saindo");
    expect(performance.now() - inicio).toBeGreaterThanOrEqual(75);
  });
});

describe("trocar", () => {
  it("o antigo sai, o novo entra e o contêiner volta ao normal", async () => {
    const host = el();
    const antigo = document.createElement("div");
    antigo.className = "antigo";
    host.append(antigo);
    const novo = document.createElement("div");
    novo.className = "novo";
    const p = trocar(host, antigo, novo);
    expect(host.classList.contains("troca")).toBe(true);
    expect(host.contains(novo)).toBe(true);
    await p;
    expect(host.contains(antigo)).toBe(false);
    expect(novo.dataset.anim).toBe("pronto");
    expect(host.classList.contains("troca")).toBe(false);
  });

  it("sem antigo (ou já removido), só entra o novo", async () => {
    const host = el();
    const novo = document.createElement("span");
    await trocar(host, null, novo);
    expect(host.contains(novo)).toBe(true);
    const solto = document.createElement("div");
    const outro = document.createElement("span");
    await trocar(host, solto, outro);
    expect(host.contains(outro)).toBe(true);
  });

  it("dá tempo de o antigo sumir antes de liberar o layout", async () => {
    document.documentElement.style.setProperty("--dur-saida", "50ms");
    document.documentElement.style.setProperty("--dur-entrada", "50ms");
    const host = el();
    const antigo = document.createElement("div");
    host.append(antigo);
    const p = trocar(host, antigo, document.createElement("div"));
    await esperar(20);
    expect(antigo.isConnected).toBe(true);
    await p;
    expect(antigo.isConnected).toBe(false);
  });
});
