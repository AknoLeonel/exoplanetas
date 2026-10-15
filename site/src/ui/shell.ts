import { acharModulo, type DefinicaoDeModulo, type Modo, modoSuportado, modulosDisponiveis } from "../lib/modulos";
import { ehRota, lerRota, montarHash, type Rota } from "../lib/rota";
import { evento as registrarEvento } from "../telemetry";
import { criarAlternador } from "./alternador-de-modo";
import { reduzMovimento, trocar } from "./animacao";
import { iniciarSecao } from "./carga";
import { h } from "./dom";

/** O que cada módulo recebe ao ser aberto. */
export interface ContextoDoModulo {
  host: HTMLElement;
  modo: Modo;
  /** Estado do módulo, vindo da URL. */
  parametros: Readonly<Record<string, string>>;
  /** Atualiza a URL (sem recarregar o módulo) para o estado ficar compartilhável. `null` remove o parâmetro. */
  definirParametros(novos: Readonly<Record<string, string | null>>): void;
}

export interface ModuloDoLab {
  montar(ctx: ContextoDoModulo): Promise<void>;
}

export type Carregadores = Readonly<Record<string, () => Promise<ModuloDoLab>>>;

export interface OpcoesDoShell {
  palco: HTMLElement;
  navegacao: HTMLElement;
  /** Região `aria-live` onde a mudança de página é anunciada. */
  anuncio: HTMLElement;
  carregadores: Carregadores;
  janela?: Window;
}

export interface Shell {
  rotaAtual(): Rota | null;
  parar(): void;
}

const TITULO_BASE = "Exoplanetas";

function esqueleto(): HTMLElement {
  return h("div", { "data-skeleton": "" }, h("div", { class: "skeleton bloco-lista" }));
}

function renderizarNavegacao(navegacao: HTMLElement, ativo: string): void {
  const itens = modulosDisponiveis()
    .filter((m) => m.id !== "inicio")
    .map((m) => {
      const link = h("a", { href: montarHash({ modulo: m.id, modo: "explorar", parametros: {} }) }, m.titulo);
      if (m.id === ativo) link.setAttribute("aria-current", "page");
      return h("li", {}, link);
    });
  navegacao.replaceChildren(...itens);
}

/**
 * Liga a URL (`#/modulo?modo=...`) ao palco: cada rota abre um módulo sob demanda, com skeleton,
 * progresso e erro com nova tentativa, e mostra o alternador Aprender/Explorar quando o módulo tem os dois.
 */
export function montarShell(opcoes: OpcoesDoShell): Shell {
  const { palco, navegacao, anuncio, carregadores } = opcoes;
  const janela = opcoes.janela ?? window;
  const validos = new Set(modulosDisponiveis().map((m) => m.id));
  let atual: Rota | null = null;
  let versao = 0;
  let primeira = true;

  function definirParametros(novos: Readonly<Record<string, string | null>>): void {
    if (!atual) return;
    const parametros: Record<string, string> = { ...atual.parametros };
    for (const [chave, valor] of Object.entries(novos)) {
      if (valor === null) delete parametros[chave];
      else parametros[chave] = valor;
    }
    atual = { ...atual, parametros };
    // replaceState não dispara `hashchange`: o módulo continua aberto e a URL acompanha.
    janela.history.replaceState(null, "", montarHash(atual));
  }

  function barraDoModulo(definicao: DefinicaoDeModulo, rota: Rota): HTMLElement | null {
    if (definicao.modos.length < 2) return null;
    const alternador = criarAlternador({
      modos: definicao.modos,
      atual: rota.modo,
      aoEscolher: (modo) => {
        janela.location.hash = montarHash({ ...(atual ?? rota), modo });
      },
    });
    return h("div", { class: "modulo-barra" }, h("span", { class: "modulo-titulo" }, definicao.titulo), alternador);
  }

  async function ir(rotaPedida: Rota): Promise<void> {
    const definicao = acharModulo(rotaPedida.modulo);
    const carregar = carregadores[rotaPedida.modulo];
    if (!definicao || !carregar) return;
    const minha = ++versao;
    const rota: Rota = { ...rotaPedida, modo: modoSuportado(definicao, rotaPedida.modo) };
    atual = rota;
    renderizarNavegacao(navegacao, rota.modulo);

    const corpo = h("div", { class: "modulo-corpo" }, esqueleto());
    const barra = barraDoModulo(definicao, rota);
    const pagina = h("div", { class: "modulo", "data-modulo": rota.modulo, "data-modo": rota.modo }, barra, corpo);
    const antiga =
      Array.from(palco.children).find(
        (c): c is HTMLElement => c instanceof HTMLElement && c.classList.contains("modulo"),
      ) ?? null;
    await trocar(palco, antiga, pagina);
    if (minha !== versao) return;

    registrarEvento("navegacao", { modulo: rota.modulo, modo: rota.modo });
    const contexto = (host: HTMLElement): ContextoDoModulo => ({
      host,
      modo: rota.modo,
      parametros: rota.parametros,
      definirParametros,
    });
    // Se outra rota já assumiu enquanto o código baixava, este módulo nem chega a montar.
    await iniciarSecao(corpo, rota.modulo, () =>
      carregar().then((m) => ({ montar: (host) => (minha === versao ? m.montar(contexto(host)) : Promise.resolve()) })),
    );
    if (minha !== versao) return;

    const titulo = rota.modulo === "inicio" ? TITULO_BASE : `${definicao.titulo} · ${TITULO_BASE}`;
    janela.document.title = titulo;
    anuncio.textContent = `Página: ${definicao.titulo}${definicao.modos.length > 1 ? `, modo ${rota.modo}` : ""}`;
    if (!primeira) {
      janela.scrollTo({ top: 0 });
      palco.focus({ preventScroll: true });
    }
    primeira = false;
  }

  function aoMudarOHash(): void {
    if (!ehRota(janela.location.hash)) return;
    // A URL que o próprio shell acabou de escrever (definirParametros) não é uma navegação.
    if (atual && janela.location.hash === montarHash(atual)) return;
    void ir(lerRota(janela.location.hash, validos));
  }

  /** Âncoras dentro do módulo (`data-ancora`) rolam até o alvo sem mexer na rota da URL. */
  function aoClicar(ev: Event): void {
    const link = (ev.target as Element | null)?.closest<HTMLElement>("a[data-ancora]");
    if (!link) return;
    const alvo = janela.document.getElementById(link.dataset.ancora ?? "");
    if (!alvo) return;
    ev.preventDefault();
    alvo.scrollIntoView({ behavior: reduzMovimento() ? "auto" : "smooth", block: "start" });
    if (!alvo.hasAttribute("tabindex")) alvo.setAttribute("tabindex", "-1");
    alvo.focus({ preventScroll: true });
  }

  janela.addEventListener("hashchange", aoMudarOHash);
  janela.document.addEventListener("click", aoClicar);
  void ir(lerRota(janela.location.hash, validos));

  return {
    rotaAtual: () => atual,
    parar() {
      janela.removeEventListener("hashchange", aoMudarOHash);
      janela.document.removeEventListener("click", aoClicar);
      versao++;
    },
  };
}
