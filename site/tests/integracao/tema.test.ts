import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAVE_DO_TEMA, iniciarTema, temaAtual } from "../../src/ui/tema";

function botao() {
  const b = document.createElement("button");
  document.body.append(b);
  return b;
}

function sistema(escuro: boolean) {
  let ouvinte: () => void = () => {};
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: escuro && q.includes("dark"),
    addEventListener: (_: string, cb: () => void) => {
      ouvinte = cb;
    },
    removeEventListener: () => {},
  }));
  return () => ouvinte();
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.tema;
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("tema claro/escuro", () => {
  it("sem escolha segue o sistema", () => {
    sistema(true);
    expect(temaAtual()).toBe("escuro");
    sistema(false);
    expect(temaAtual()).toBe("claro");
    vi.stubGlobal("matchMedia", undefined);
    expect(temaAtual()).toBe("claro");
  });

  it("o botão alterna, salva a escolha que difere do sistema, avisa o gráfico e atualiza aria-pressed", () => {
    sistema(false);
    const b = botao();
    const aviso = vi.fn();
    window.addEventListener("tema-alterado", aviso);
    iniciarTema(b);
    expect(b.getAttribute("aria-pressed")).toBe("false");
    b.click();
    expect(document.documentElement.dataset.tema).toBe("escuro");
    expect(localStorage.getItem(CHAVE_DO_TEMA)).toBe("escuro");
    expect(b.getAttribute("aria-pressed")).toBe("true");
    expect(aviso).toHaveBeenCalledTimes(1);
    window.removeEventListener("tema-alterado", aviso);
  });

  it("voltar ao tema do sistema desfaz a escolha: apaga o que foi salvo e volta a acompanhar o sistema", () => {
    const mudarSistema = sistema(false);
    const b = botao();
    const aviso = vi.fn();
    window.addEventListener("tema-alterado", aviso);
    iniciarTema(b);
    b.click(); // escuro, diferente do sistema (claro): salva
    b.click(); // claro, igual ao sistema: some a escolha manual
    expect(localStorage.getItem(CHAVE_DO_TEMA)).toBeNull();
    expect(document.documentElement.dataset.tema).toBeUndefined();
    expect(b.getAttribute("aria-pressed")).toBe("false");
    expect(aviso).toHaveBeenCalledTimes(2);
    // Sem escolha manual, o botão acompanha o sistema quando ele muda.
    sistema(true);
    mudarSistema();
    expect(b.getAttribute("aria-pressed")).toBe("true");
    window.removeEventListener("tema-alterado", aviso);
  });

  it("com o sistema escuro, o primeiro clique vai para o claro e é salvo", () => {
    sistema(true);
    const b = botao();
    iniciarTema(b);
    expect(b.getAttribute("aria-pressed")).toBe("true");
    b.click();
    expect(document.documentElement.dataset.tema).toBe("claro");
    expect(localStorage.getItem(CHAVE_DO_TEMA)).toBe("claro");
    b.click();
    expect(localStorage.getItem(CHAVE_DO_TEMA)).toBeNull();
  });

  it("lembra a escolha da visita anterior", () => {
    sistema(false);
    localStorage.setItem(CHAVE_DO_TEMA, "escuro");
    const b = botao();
    iniciarTema(b);
    expect(document.documentElement.dataset.tema).toBe("escuro");
    expect(b.getAttribute("aria-pressed")).toBe("true");
  });

  it("ignora um valor salvo inválido", () => {
    sistema(false);
    localStorage.setItem(CHAVE_DO_TEMA, "roxo");
    iniciarTema(botao());
    expect(document.documentElement.dataset.tema).toBeUndefined();
  });

  it("sem armazenamento (janela privada) o botão ainda funciona, só não lembra", () => {
    sistema(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const b = botao();
    expect(() => iniciarTema(b)).not.toThrow();
    expect(() => b.click()).not.toThrow();
    expect(document.documentElement.dataset.tema).toBe("escuro");
    expect(() => b.click()).not.toThrow(); // voltar ao sistema também não quebra sem armazenamento
    expect(document.documentElement.dataset.tema).toBeUndefined();
  });

  it("acompanha a mudança do sistema quando não há escolha, e parar desliga os ouvintes", () => {
    const mudar = sistema(false);
    const b = botao();
    const parar = iniciarTema(b);
    mudar();
    expect(b.getAttribute("aria-pressed")).toBe("false");
    parar();
    b.click();
    expect(document.documentElement.dataset.tema).toBeUndefined();
  });
});
