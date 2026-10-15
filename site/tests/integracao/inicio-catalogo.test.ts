import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULOS } from "../../src/lib/modulos";
import { iniciarSecoes, montar as montarCatalogo } from "../../src/ui/catalogo";
import { h } from "../../src/ui/dom";
import { montarInicio as criarInicio, montar as montarInicio } from "../../src/ui/inicio";
import type { ContextoDoModulo } from "../../src/ui/shell";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function contexto(): ContextoDoModulo {
  const host = h("div", {}, h("div", { "data-skeleton": "" }, "carregando"));
  document.body.append(host);
  return { host, modo: "explorar", parametros: {}, definirParametros: () => {} };
}

describe("início", () => {
  it("apresenta o laboratório, os dois modos e um cartão por módulo", () => {
    const inicio = criarInicio();
    expect(inicio.querySelector("h1")?.textContent).toBe("Laboratório de astrofísica");
    expect(inicio.textContent).toContain("Aprender");
    expect(inicio.textContent).toContain("Explorar");
    expect(inicio.querySelectorAll(".cartao-modulo")).toHaveLength(MODULOS.length - 1);
  });

  it("módulos disponíveis são links; os 'em breve' são cartões sem link, marcados como desativados", () => {
    const inicio = criarInicio();
    const link = inicio.querySelector<HTMLAnchorElement>("a.cartao-modulo");
    expect(link?.getAttribute("href")).toBe("#/catalogo");
    const emBreve = inicio.querySelectorAll(".cartao-modulo.em-breve");
    expect(emBreve.length).toBeGreaterThan(0);
    for (const c of emBreve) {
      expect(c.tagName).toBe("DIV");
      expect(c.getAttribute("aria-disabled")).toBe("true");
      expect(c.textContent).toContain("Em breve");
    }
  });

  it("cada cartão diz os modos que o módulo suporta", () => {
    const inicio = criarInicio();
    expect(inicio.textContent).toContain("Aprender · Explorar");
    const trilhas = [...inicio.querySelectorAll(".cartao-modulo")].find((c) =>
      c.textContent?.includes("Trilhas de estudo"),
    );
    expect(trilhas?.querySelector(".cartao-modulo-modos")?.textContent).toBe("Aprender");
  });

  it("montar troca o skeleton pelo conteúdo", async () => {
    const ctx = contexto();
    await montarInicio(ctx);
    expect(ctx.host.querySelector("[data-skeleton]")).toBeNull();
    expect(ctx.host.querySelector(".inicio")).not.toBeNull();
  });
});

describe("catálogo como módulo", () => {
  it("clona o molde da página, tira o skeleton e inicia as seções sob demanda", async () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<template id="modelo-catalogo"><h1>Catálogo</h1><div data-secao="desconhecida"></div><div data-secao="resumo" id="r"><div data-skeleton></div></div></template>',
    );
    const observados: Element[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe(el: Element) {
          observados.push(el);
        }
        disconnect() {}
      },
    );
    const ctx = contexto();
    await montarCatalogo(ctx);
    expect(ctx.host.querySelector(".catalogo h1")?.textContent).toBe("Catálogo");
    expect(ctx.host.querySelector(":scope > [data-skeleton]")).toBeNull();
    // Só a seção conhecida é observada; a desconhecida é ignorada.
    expect(observados.map((o) => o.id)).toEqual(["r"]);
  });

  it("sem o molde no HTML, falha com uma mensagem clara", async () => {
    await expect(montarCatalogo(contexto())).rejects.toThrow("molde do catálogo");
  });

  it("iniciarSecoes ignora um contêiner sem seções", () => {
    expect(() => iniciarSecoes(h("div"))).not.toThrow();
  });
});
