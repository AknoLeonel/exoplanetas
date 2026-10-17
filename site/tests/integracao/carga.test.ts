import { afterEach, describe, expect, it, vi } from "vitest";
import { aoMudarProgresso, type EstadoDoProgresso } from "../../src/data/acompanhar";
import * as telemetria from "../../src/telemetry";
import { carregarSecao, ehFalhaDeArquivo, importarModulo, iniciarSecao } from "../../src/ui/carga";
import { h } from "../../src/ui/dom";
import { criarSecao, esperar, esperarAte } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("carregarSecao", () => {
  it("troca o skeleton pelo conteúdo e marca a seção como pronta", async () => {
    const host = criarSecao();
    expect(host.getAttribute("aria-busy")).toBe("true");
    await carregarSecao({
      host,
      nome: "t",
      carregar: async () => "oi",
      renderizar: (d) => h("p", { class: "conteudo" }, d),
    });
    expect(host.querySelector(".conteudo")?.textContent).toBe("oi");
    expect(host.querySelector("[data-skeleton]")).toBeNull();
    expect(host.getAttribute("aria-busy")).toBe("false");
    expect(host.classList.contains("troca")).toBe(false);
    expect((host.querySelector(".conteudo") as HTMLElement).dataset.anim).toBe("pronto");
  });

  it("repassa o progresso para a barra do skeleton", async () => {
    const host = criarSecao();
    const barra = host.querySelector<HTMLElement>(".progresso-secao") as HTMLElement;
    let liberar: () => void = () => {};
    const pronto = carregarSecao({
      host,
      nome: "t",
      carregar: async (aoProgredir) => {
        aoProgredir(0.5);
        expect(barra.style.getPropertyValue("--fracao")).toBe("0.5");
        expect(barra.hasAttribute("data-indeterminado")).toBe(false);
        aoProgredir(null);
        expect(barra.hasAttribute("data-indeterminado")).toBe(true);
        expect(barra.style.getPropertyValue("--fracao")).toBe("");
        await new Promise<void>((r) => (liberar = r));
        return 1;
      },
      renderizar: () => h("div"),
    });
    await esperar();
    liberar();
    await pronto;
  });

  it("tolera skeleton sem barra de progresso", async () => {
    const host = document.createElement("div");
    host.innerHTML = "<div data-skeleton></div>";
    document.body.append(host);
    await carregarSecao({
      host,
      nome: "t",
      carregar: async (aoProgredir) => {
        aoProgredir(0.2);
        return 1;
      },
      renderizar: () => h("div", { class: "ok" }),
    });
    expect(host.querySelector(".ok")).not.toBeNull();
  });

  it("falha: mostra o erro com 'Tentar de novo' e avisa a telemetria", async () => {
    const host = criarSecao();
    const espiao = vi.spyOn(telemetria, "erro");
    await carregarSecao({
      host,
      nome: "explorador",
      carregar: async () => {
        throw new Error("HTTP 500");
      },
      renderizar: () => h("div"),
    });
    const erro = host.querySelector<HTMLElement>(".erro");
    expect(erro?.getAttribute("role")).toBe("alert");
    expect(erro?.textContent).toContain("HTTP 500");
    expect(erro?.textContent).toContain("Não foi possível carregar");
    expect(host.querySelector("[data-skeleton]")).toBeNull();
    expect(host.getAttribute("aria-busy")).toBe("false");
    expect(espiao).toHaveBeenCalledWith(expect.any(Error), { secao: "explorador" });
  });

  it("falha que não é Error mostra mensagem genérica", async () => {
    const host = criarSecao();
    await carregarSecao({
      host,
      nome: "t",
      carregar: () => Promise.reject("x"),
      renderizar: () => h("div"),
    });
    expect(host.querySelector(".erro")?.textContent).toContain("Erro desconhecido.");
  });

  it("'Tentar de novo' devolve o skeleton, tenta outra vez e mostra o conteúdo", async () => {
    const host = criarSecao();
    const carregar = vi.fn().mockRejectedValueOnce(new Error("sem rede")).mockResolvedValueOnce("agora foi");
    await carregarSecao({ host, nome: "t", carregar, renderizar: (d: string) => h("p", { class: "conteudo" }, d) });
    host.querySelector<HTMLButtonElement>(".erro button")?.click();
    await esperarAte(() => expect(host.querySelector(".conteudo")?.textContent).toBe("agora foi"));
    expect(host.querySelector(".erro")).toBeNull();
    expect(carregar).toHaveBeenCalledTimes(2);
    expect(host.getAttribute("aria-busy")).toBe("false");
  });

  it("a nova tentativa pode falhar de novo e oferecer outra", async () => {
    const host = criarSecao();
    const carregar = vi.fn().mockRejectedValue(new Error("falha"));
    await carregarSecao({ host, nome: "t", carregar, renderizar: () => h("div") });
    host.querySelector<HTMLButtonElement>(".erro button")?.click();
    await esperarAte(() => expect(carregar).toHaveBeenCalledTimes(2));
    await esperarAte(() => expect(host.querySelectorAll(".erro")).toHaveLength(1));
    await esperarAte(() => expect(host.querySelector("[data-skeleton]")).toBeNull());
  });

  it("o botão 'Tentar de novo' desativa no primeiro clique: cliques repetidos não abrem outra tentativa", async () => {
    const host = criarSecao();
    const carregar = vi.fn().mockRejectedValueOnce(new Error("falha")).mockResolvedValue("ok");
    await carregarSecao({ host, nome: "t", carregar, renderizar: (d: string) => h("p", { class: "conteudo" }, d) });
    const botao = host.querySelector<HTMLButtonElement>(".erro button") as HTMLButtonElement;
    botao.click();
    expect(botao.disabled).toBe(true);
    botao.click();
    botao.dispatchEvent(new MouseEvent("click"));
    await esperarAte(() => expect(host.querySelectorAll(".conteudo")).toHaveLength(1));
    expect(carregar).toHaveBeenCalledTimes(2);
    expect(host.querySelectorAll("[data-skeleton]")).toHaveLength(0);
  });

  it("exige o skeleton no HTML", async () => {
    const host = document.createElement("div");
    await expect(
      carregarSecao({ host, nome: "sem", carregar: async () => 1, renderizar: () => h("div") }),
    ).rejects.toThrow("seção sem sem skeleton");
  });
});

describe("importarModulo", () => {
  it("devolve o módulo e conta no progresso global", async () => {
    const eventos: EstadoDoProgresso[] = [];
    const parar = aoMudarProgresso((e) => eventos.push(e));
    const modulo = await importarModulo(Promise.resolve({ montar: 1 }));
    parar();
    expect(modulo).toEqual({ montar: 1 });
    expect(eventos[0]?.pendentes).toBe(1);
    expect(eventos.at(-1)).toEqual({ fracao: 1, pendentes: 0 });
  });
});

describe("iniciarSecao", () => {
  it("importa o módulo e o monta", async () => {
    const host = criarSecao();
    const montar = vi.fn(async () => {});
    await iniciarSecao(host, "t", async () => ({ montar }));
    expect(montar).toHaveBeenCalledWith(host);
  });

  it("se o código não chegar, mostra erro com 'Tentar de novo' em vez de deixar o skeleton parado", async () => {
    const host = criarSecao();
    const espiao = vi.spyOn(telemetria, "erro");
    const importar = vi.fn().mockRejectedValueOnce(new Error("sem rede"));
    await iniciarSecao(host, "explorador", importar);
    expect(host.querySelector(".erro")?.textContent).toContain("sem rede");
    expect(host.querySelector(".erro button")?.textContent).toBe("Tentar de novo");
    expect(host.querySelector("[data-skeleton]")).toBeNull();
    expect(host.getAttribute("aria-busy")).toBe("false");
    expect(espiao).toHaveBeenCalledWith(expect.any(Error), { secao: "explorador", etapa: "modulo" });
  });

  it("'Tentar de novo' volta ao skeleton, importa outra vez e monta, uma única vez mesmo com cliques repetidos", async () => {
    const host = criarSecao();
    const montar = vi.fn(async (h: HTMLElement) => {
      h.append("montado");
    });
    const importar = vi.fn().mockRejectedValueOnce(new Error("rede")).mockResolvedValue({ montar });
    await iniciarSecao(host, "t", importar);
    const botao = host.querySelector<HTMLButtonElement>(".erro button") as HTMLButtonElement;
    botao.click();
    botao.click();
    await esperarAte(() => expect(montar).toHaveBeenCalledTimes(1));
    expect(importar).toHaveBeenCalledTimes(2);
    expect(host.querySelector(".erro")).toBeNull();
    expect(host.getAttribute("aria-busy")).toBe("true");
  });

  it("sem skeleton só registra o erro", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const espiao = vi.spyOn(telemetria, "erro");
    await iniciarSecao(host, "t", () => Promise.reject(new Error("x")));
    expect(espiao).toHaveBeenCalledOnce();
    expect(host.querySelector(".erro")).toBeNull();
  });

  it("erro de código que não é Error mostra mensagem genérica", async () => {
    const host = criarSecao();
    await iniciarSecao(host, "t", () => Promise.reject("x"));
    expect(host.querySelector(".erro")?.textContent).toContain("Erro desconhecido.");
  });

  describe("arquivo que sumiu depois de um deploy novo", () => {
    const sumiu = () => new Error("Failed to fetch dynamically imported module: https://x/assets/ml-ANTIGO.js");

    it("reconhece as mensagens dos três navegadores e ignora o resto", () => {
      expect(ehFalhaDeArquivo(sumiu())).toBe(true);
      expect(ehFalhaDeArquivo(new Error("error loading dynamically imported module"))).toBe(true);
      expect(ehFalhaDeArquivo(new Error("Importing a module script failed."))).toBe(true);
      expect(ehFalhaDeArquivo(new Error("sem rede"))).toBe(false);
      expect(ehFalhaDeArquivo("dynamically imported module")).toBe(false);
    });

    it("recarrega a página uma vez, sozinha, e mantém o skeleton enquanto isso", async () => {
      const host = criarSecao();
      const recarregar = vi.fn();
      await iniciarSecao(host, "ml", () => Promise.reject(sumiu()), recarregar);
      expect(recarregar).toHaveBeenCalledOnce();
      expect(host.querySelector(".erro")).toBeNull();
      expect(host.querySelector("[data-skeleton]")).not.toBeNull();
    });

    it("se depois da recarga ainda falha, explica e o botão recarrega em vez de repetir o import", async () => {
      const host = criarSecao();
      const recarregar = vi.fn();
      const importar = vi.fn(() => Promise.reject(sumiu()));
      await iniciarSecao(host, "ml", importar, recarregar);
      recarregar.mockClear();
      const segunda = criarSecao();
      await iniciarSecao(segunda, "ml", importar, recarregar);
      expect(recarregar).not.toHaveBeenCalled();
      expect(segunda.querySelector(".erro")?.textContent).toContain("O site foi atualizado");
      const botao = segunda.querySelector<HTMLButtonElement>(".erro button") as HTMLButtonElement;
      expect(botao.textContent).toBe("Recarregar a página");
      botao.click();
      expect(recarregar).toHaveBeenCalledOnce();
      expect(importar).toHaveBeenCalledTimes(2);
    });

    it("um módulo que carrega com sucesso libera a recarga para o próximo deploy", async () => {
      sessionStorage.setItem("exoplanetas:recarregou-por-versao-nova", "1");
      await iniciarSecao(criarSecao(), "ml", async () => ({ montar: async () => {} }));
      expect(sessionStorage.getItem("exoplanetas:recarregou-por-versao-nova")).toBeNull();
      const recarregar = vi.fn();
      await iniciarSecao(criarSecao(), "ml", () => Promise.reject(sumiu()), recarregar);
      expect(recarregar).toHaveBeenCalledOnce();
    });

    it("sem sessionStorage não recarrega (evita laço) e mostra o painel", async () => {
      vi.stubGlobal("sessionStorage", {
        getItem: () => {
          throw new Error("bloqueado");
        },
        setItem: () => {
          throw new Error("bloqueado");
        },
        removeItem: () => {
          throw new Error("bloqueado");
        },
      });
      const host = criarSecao();
      const recarregar = vi.fn();
      await iniciarSecao(host, "ml", () => Promise.reject(sumiu()), recarregar);
      expect(recarregar).not.toHaveBeenCalled();
      expect(host.querySelector(".erro button")?.textContent).toBe("Recarregar a página");
    });

    it("o botão padrão recarrega a janela", async () => {
      const recarga = vi.fn();
      vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload: recarga } as Location);
      sessionStorage.setItem("exoplanetas:recarregou-por-versao-nova", "1");
      const host = criarSecao();
      await iniciarSecao(host, "ml", () => Promise.reject(sumiu()));
      host.querySelector<HTMLButtonElement>(".erro button")?.click();
      expect(recarga).toHaveBeenCalledOnce();
    });
  });
});
