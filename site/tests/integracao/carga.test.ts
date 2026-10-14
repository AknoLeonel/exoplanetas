import { afterEach, describe, expect, it, vi } from "vitest";
import { aoMudarProgresso, type EstadoDoProgresso } from "../../src/data/acompanhar";
import * as telemetria from "../../src/telemetry";
import { carregarSecao, importarModulo } from "../../src/ui/carga";
import { h } from "../../src/ui/dom";
import { criarSecao, esperar } from "./fixtures";

afterEach(() => {
  document.body.innerHTML = "";
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
    await vi.waitFor(() => expect(host.querySelector(".conteudo")?.textContent).toBe("agora foi"));
    expect(host.querySelector(".erro")).toBeNull();
    expect(carregar).toHaveBeenCalledTimes(2);
    expect(host.getAttribute("aria-busy")).toBe("false");
  });

  it("a nova tentativa pode falhar de novo e oferecer outra", async () => {
    const host = criarSecao();
    const carregar = vi.fn().mockRejectedValue(new Error("falha"));
    await carregarSecao({ host, nome: "t", carregar, renderizar: () => h("div") });
    host.querySelector<HTMLButtonElement>(".erro button")?.click();
    await vi.waitFor(() => expect(carregar).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(host.querySelectorAll(".erro")).toHaveLength(1));
    await vi.waitFor(() => expect(host.querySelector("[data-skeleton]")).toBeNull());
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
