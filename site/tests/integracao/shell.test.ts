import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acharModulo, modulosDisponiveis } from "../../src/lib/modulos";
import { criarAlternador } from "../../src/ui/alternador-de-modo";
import { h } from "../../src/ui/dom";
import {
  type Carregadores,
  type ContextoDoModulo,
  type ModuloDoLab,
  montarShell,
  type Shell,
} from "../../src/ui/shell";
import { esperar, esperarAte } from "./fixtures";

let shell: Shell | null = null;
let palco: HTMLElement;
let navegacao: HTMLElement;
let anuncio: HTMLElement;

function preparar() {
  document.body.innerHTML = '<ul id="nav"></ul><p id="anuncio"></p><main id="principal" tabindex="-1"></main>';
  palco = document.getElementById("principal") as HTMLElement;
  navegacao = document.getElementById("nav") as HTMLElement;
  anuncio = document.getElementById("anuncio") as HTMLElement;
}

/** Módulo de mentira que escreve o contexto que recebeu. */
function falso() {
  return {
    montar: vi.fn<ModuloDoLab["montar"]>(async (ctx) => {
      ctx.host.replaceChildren(
        h("div", { class: "conteudo", "data-modo": ctx.modo, "data-params": JSON.stringify(ctx.parametros) }, "pronto"),
      );
    }),
  };
}

function iniciar(carregadores: Carregadores) {
  shell = montarShell({ palco, navegacao, anuncio, carregadores });
  return shell;
}

const modulo = () => palco.querySelector<HTMLElement>(".modulo");
const conteudo = () => palco.querySelector<HTMLElement>(".conteudo");

beforeEach(() => {
  preparar();
  window.location.hash = "";
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(() => {
  shell?.parar();
  shell = null;
  document.body.innerHTML = "";
  document.title = "";
  vi.restoreAllMocks();
});

describe("shell", () => {
  it("sem hash abre o início, com skeleton primeiro e título da página depois", async () => {
    const inicio = falso();
    iniciar({ inicio: async () => inicio, catalogo: async () => falso() });
    expect(modulo()?.dataset.modulo).toBe("inicio");
    await esperarAte(() => expect(conteudo()?.textContent).toBe("pronto"));
    expect(inicio.montar).toHaveBeenCalledOnce();
    expect(palco.querySelector("[data-skeleton]")).toBeNull();
    expect(document.title).toBe("Exoplanetas");
    expect(anuncio.textContent).toBe("Página: Início");
  });

  it("abre o módulo da URL, com modo e parâmetros, e marca o link ativo na navegação", async () => {
    window.location.hash = "#/catalogo?modo=explorar&busca=kepler";
    const catalogo = falso();
    iniciar({ inicio: async () => falso(), catalogo: async () => catalogo });
    await esperarAte(() => expect(conteudo()?.dataset.params).toBe('{"busca":"kepler"}'));
    expect(conteudo()?.dataset.modo).toBe("explorar");
    expect(document.title).toBe("Catálogo de exoplanetas · Exoplanetas");
    const ativo = navegacao.querySelector('a[aria-current="page"]');
    expect(ativo?.textContent).toBe("Catálogo de exoplanetas");
    expect(ativo?.getAttribute("href")).toBe("#/catalogo");
    // Só os módulos disponíveis, sem o início.
    expect(navegacao.querySelectorAll("a")).toHaveLength(modulosDisponiveis().length - 1);
  });

  it("mudar o hash troca de módulo, com foco, rolagem e anúncio", async () => {
    iniciar({ inicio: async () => falso(), catalogo: async () => falso() });
    await esperarAte(() => expect(conteudo()).not.toBeNull());
    window.location.hash = "#/catalogo";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await esperarAte(() => expect(modulo()?.dataset.modulo).toBe("catalogo"));
    await esperarAte(() => expect(anuncio.textContent).toBe("Página: Catálogo de exoplanetas"));
    expect(window.scrollTo).toHaveBeenCalled();
    expect(document.activeElement).toBe(palco);
    expect(palco.querySelectorAll(".modulo")).toHaveLength(1);
  });

  it("não reage a âncoras da página (#explorar não é rota)", async () => {
    window.location.hash = "#/catalogo";
    const catalogo = falso();
    iniciar({ inicio: async () => falso(), catalogo: async () => catalogo });
    await esperarAte(() => expect(catalogo.montar).toHaveBeenCalledOnce());
    window.location.hash = "#explorar";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await esperar(60);
    expect(catalogo.montar).toHaveBeenCalledOnce();
    expect(modulo()?.dataset.modulo).toBe("catalogo");
  });

  it("módulo desconhecido ou ainda 'em breve' cai no início", async () => {
    window.location.hash = "#/sistema-solar";
    const inicio = falso();
    iniciar({ inicio: async () => inicio, catalogo: async () => falso() });
    await esperarAte(() => expect(inicio.montar).toHaveBeenCalledOnce());
    expect(modulo()?.dataset.modulo).toBe("inicio");
  });

  it("uma rota nova durante o carregamento vence a anterior", async () => {
    let liberar: (m: ReturnType<typeof falso>) => void = () => {};
    const lento = new Promise<ReturnType<typeof falso>>((r) => (liberar = r));
    const catalogo = falso();
    const inicio = falso();
    window.location.hash = "#/catalogo";
    iniciar({ inicio: async () => inicio, catalogo: () => lento });
    await esperar(30);
    window.location.hash = "#/";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await esperarAte(() => expect(inicio.montar).toHaveBeenCalledOnce());
    liberar(catalogo);
    await esperar(60);
    expect(modulo()?.dataset.modulo).toBe("inicio");
    expect(document.title).toBe("Exoplanetas");
  });

  it("falha ao baixar o código do módulo mostra o erro com nova tentativa", async () => {
    window.location.hash = "#/catalogo";
    const carregar = vi.fn().mockRejectedValueOnce(new Error("rede caiu")).mockResolvedValue(falso());
    iniciar({ inicio: async () => falso(), catalogo: carregar });
    await esperarAte(() => expect(palco.querySelector(".erro")?.textContent).toContain("rede caiu"));
    palco.querySelector<HTMLButtonElement>(".erro button")?.click();
    await esperarAte(() => expect(conteudo()?.textContent).toBe("pronto"));
    expect(carregar).toHaveBeenCalledTimes(2);
  });

  it("definirParametros atualiza a URL sem remontar o módulo, e null remove o parâmetro", async () => {
    window.location.hash = "#/catalogo?a=1";
    const catalogo = falso();
    const s = iniciar({ inicio: async () => falso(), catalogo: async () => catalogo });
    await esperarAte(() => expect(catalogo.montar).toHaveBeenCalledOnce());
    const ctx = catalogo.montar.mock.calls[0]?.[0] as ContextoDoModulo;
    ctx.definirParametros({ b: "2" });
    expect(window.location.hash).toBe("#/catalogo?a=1&b=2");
    ctx.definirParametros({ a: null });
    expect(window.location.hash).toBe("#/catalogo?b=2");
    expect(s.rotaAtual()?.parametros).toEqual({ b: "2" });
    await esperar(40);
    expect(catalogo.montar).toHaveBeenCalledOnce();
  });

  it("registra a navegação na telemetria", async () => {
    const telemetria = await import("../../src/telemetry");
    const espiao = vi.spyOn(telemetria, "evento");
    iniciar({ inicio: async () => falso(), catalogo: async () => falso() });
    await esperarAte(() => expect(espiao).toHaveBeenCalledWith("navegacao", { modulo: "inicio", modo: "explorar" }));
  });

  it("âncoras com data-ancora rolam até o alvo e focam, sem mudar a rota", async () => {
    window.location.hash = "#/catalogo";
    iniciar({ inicio: async () => falso(), catalogo: async () => falso() });
    await esperarAte(() => expect(conteudo()).not.toBeNull());
    const alvo = h("section", { id: "secao-alvo" });
    alvo.scrollIntoView = vi.fn();
    document.body.append(alvo, h("a", { id: "ancora", href: "#secao-alvo", "data-ancora": "secao-alvo" }, "ir"));
    document.getElementById("ancora")?.click();
    expect(alvo.scrollIntoView).toHaveBeenCalledWith({
      behavior: expect.stringMatching(/auto|smooth/),
      block: "start",
    });
    expect(document.activeElement).toBe(alvo);
    expect(alvo.getAttribute("tabindex")).toBe("-1");
    expect(window.location.hash).toBe("#/catalogo");
  });

  it("âncora para um alvo que não existe não faz nada, e cliques fora de âncoras são ignorados", async () => {
    iniciar({ inicio: async () => falso(), catalogo: async () => falso() });
    document.body.append(h("a", { id: "x", href: "#nada", "data-ancora": "nada" }, "x"), h("button", { id: "b" }, "b"));
    const evento = new MouseEvent("click", { bubbles: true, cancelable: true });
    document.getElementById("x")?.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(false);
    document.getElementById("b")?.click();
  });

  it("parar remove os ouvintes: o hash deixa de abrir módulos", async () => {
    const catalogo = falso();
    const s = iniciar({ inicio: async () => falso(), catalogo: async () => catalogo });
    await esperarAte(() => expect(conteudo()).not.toBeNull());
    s.parar();
    window.location.hash = "#/catalogo";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await esperar(60);
    expect(catalogo.montar).not.toHaveBeenCalled();
  });
});

describe("alternador Aprender/Explorar no shell", () => {
  it("um módulo com os dois modos mostra o alternador, e trocar de modo mantém os parâmetros", async () => {
    // O registro real ainda não tem um módulo disponível com dois modos; abre o 'catalogo' com um registro de teste.
    const definicao = acharModulo("catalogo");
    if (!definicao) throw new Error("registro");
    const original = definicao.modos;
    (definicao as { modos: readonly string[] }).modos = ["aprender", "explorar"];
    try {
      window.location.hash = "#/catalogo?modo=aprender&x=7";
      const catalogo = falso();
      iniciar({ inicio: async () => falso(), catalogo: async () => catalogo });
      await esperarAte(() => expect(conteudo()?.dataset.modo).toBe("aprender"));
      const botoes = palco.querySelectorAll<HTMLButtonElement>(".alternador-opcao");
      expect([...botoes].map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
        ["Aprender", "true"],
        ["Explorar", "false"],
      ]);
      expect(anuncio.textContent).toBe("Página: Catálogo de exoplanetas, modo aprender");
      botoes[1]?.click();
      expect(window.location.hash).toBe("#/catalogo?x=7");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      await esperarAte(() => expect(conteudo()?.dataset.modo).toBe("explorar"));
      expect(conteudo()?.dataset.params).toBe('{"x":"7"}');
      expect(catalogo.montar).toHaveBeenCalledTimes(2);
    } finally {
      (definicao as { modos: readonly string[] }).modos = original;
    }
  });

  it("um módulo com um só modo não mostra o alternador, e um modo não suportado vira o suportado", async () => {
    window.location.hash = "#/catalogo?modo=aprender";
    iniciar({ inicio: async () => falso(), catalogo: async () => falso() });
    await esperarAte(() => expect(conteudo()?.dataset.modo).toBe("explorar"));
    expect(palco.querySelector(".alternador")).toBeNull();
  });
});

describe("criarAlternador", () => {
  it("marca o atual, avisa a escolha e ignora clique no modo que já está ativo", () => {
    const escolher = vi.fn();
    const alternador = criarAlternador({ modos: ["aprender", "explorar"], atual: "explorar", aoEscolher: escolher });
    const [aprender, explorar] = alternador.querySelectorAll<HTMLButtonElement>("button");
    expect(aprender?.getAttribute("aria-pressed")).toBe("false");
    expect(explorar?.getAttribute("aria-pressed")).toBe("true");
    expect(aprender?.title).toContain("Guiado");
    explorar?.click();
    expect(escolher).not.toHaveBeenCalled();
    aprender?.click();
    expect(escolher).toHaveBeenCalledWith("aprender");
    expect(alternador.getAttribute("role")).toBe("group");
  });
});
