import type { LimiteDoControle } from "../lib/parametros";
import { erro as registrarErro, evento as registrarEvento } from "../telemetry";
import { entrar } from "./animacao";
import { h } from "./dom";

/** Peças comuns dos simuladores (trânsito, velocidade radial): controles, animação, busca, roteiro e cartões. */

/** Chama `fn` só depois de `ms` sem novas chamadas. */
export function adiar(ms: number, fn: () => void): () => void {
  let espera: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(espera);
    espera = setTimeout(fn, ms);
  };
}

export function baixarArquivo(nome: string, conteudo: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
  const link = h("a", { href: url, download: nome });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** "curva-de-luz" + "Kepler-7 b" -> "curva-de-luz-kepler-7-b.csv". */
export function nomeDoArquivo(prefixo: string, referencia: string | null): string {
  const base = (referencia ?? "simulacao")
    .normalize("NFD")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-");
  return `${prefixo}-${base.replace(/^-|-$/g, "").toLowerCase()}.csv`;
}

// ---------- Controles ----------

export interface Controles<K extends string> {
  lista: HTMLElement;
  /** Atualiza cursores e textos com os valores atuais. */
  mostrar(valores: Readonly<Record<K, number>>): void;
  /** Mostra só estes controles (no Aprender, os do passo); `null` mostra todos. */
  filtrar(visiveis: readonly K[] | null): void;
}

/** Um controle deslizante por parâmetro, com escala log quando a faixa pede, `aria-valuetext` e saída visível. */
export function criarControles<K extends string>(opcoes: {
  prefixo: string;
  limites: Readonly<Record<K, LimiteDoControle>>;
  formatar(chave: K, valor: number): string;
  aoMudar(chave: K, valor: number): void;
}): Controles<K> {
  const { prefixo, limites, formatar, aoMudar } = opcoes;
  const lista = h("div", { class: "controles-sim" });
  const itens = new Map<K, { rotulo: HTMLElement; entrada: HTMLInputElement; saida: HTMLOutputElement }>();
  for (const chave of Object.keys(limites) as K[]) {
    const limite = limites[chave];
    const id = `${prefixo}-${limite.url}`;
    const entrada = h("input", {
      type: "range",
      id,
      min: limite.log ? Math.log10(limite.min) : limite.min,
      max: limite.log ? Math.log10(limite.max) : limite.max,
      step: limite.log ? 0.001 : limite.passo,
    });
    const saida = h("output", { for: id });
    const rotulo = h(
      "label",
      { class: "controle-sim", for: id, "data-controle": chave },
      h("span", { class: "controle-sim-topo" }, h("span", {}, limite.rotulo), saida),
      entrada,
    );
    entrada.addEventListener("input", () => {
      const bruto = Number(entrada.value);
      aoMudar(chave, limite.log ? Number((10 ** bruto).toPrecision(4)) : bruto);
    });
    itens.set(chave, { rotulo, entrada, saida });
    lista.append(rotulo);
  }
  return {
    lista,
    mostrar(valores) {
      for (const [chave, { entrada, saida }] of itens) {
        const limite = limites[chave];
        const v = valores[chave];
        // Só reposiciona o cursor se o valor mudou por fora (planeta carregado, limite), para não brigar com o arrasto.
        const posicao = limite.log ? Math.log10(v) : v;
        if (Math.abs(Number(entrada.value) - posicao) > (limite.log ? 0.0005 : limite.passo / 2)) {
          entrada.value = String(posicao);
        }
        const texto = formatar(chave, v);
        saida.textContent = texto;
        entrada.setAttribute("aria-valuetext", texto);
      }
    },
    filtrar(visiveis) {
      const conjunto = visiveis ? new Set<K>(visiveis) : null;
      for (const [chave, { rotulo }] of itens) rotulo.hidden = conjunto !== null && !conjunto.has(chave);
    },
  };
}

// ---------- Animação ----------

export interface Animacao {
  botao: HTMLButtonElement;
  parar(): void;
}

/** Botão "Animar"/"Pausar". Nada anima sozinho; o laço para quando o simulador sai da página. */
export function criarAnimacao(raiz: () => HTMLElement, aoAvancar: (segundos: number) => void): Animacao {
  const botao = h("button", { class: "botao", type: "button", "aria-pressed": "false" }, "Animar");
  let animando = false;
  let quadro = 0;
  let ultimo = 0;

  function parar(): void {
    animando = false;
    cancelAnimationFrame(quadro);
    botao.textContent = "Animar";
    botao.setAttribute("aria-pressed", "false");
  }

  function passo(agora: number): void {
    if (!raiz().isConnected) {
      parar();
      return;
    }
    const segundos = ultimo ? (agora - ultimo) / 1000 : 0;
    ultimo = agora;
    aoAvancar(segundos);
    quadro = requestAnimationFrame(passo);
  }

  botao.addEventListener("click", () => {
    if (animando) {
      parar();
      return;
    }
    animando = true;
    ultimo = 0;
    botao.textContent = "Pausar";
    botao.setAttribute("aria-pressed", "true");
    quadro = requestAnimationFrame(passo);
  });
  return { botao, parar };
}

// ---------- Planeta do catálogo ----------

export interface BuscaDePlaneta<P> {
  formulario: HTMLElement;
  /** Texto de estado da busca (`role="status"`). */
  estado: HTMLElement;
  campo: HTMLInputElement;
  abrir(): Promise<P[]>;
  limpar(): void;
}

/** Campo com a lista de planetas (carregada só quando a pessoa chega no campo) e busca pelo nome exato. */
export function criarBuscaDePlaneta<P extends { nome: string }>(opcoes: {
  prefixo: string;
  /** "planetas de trânsito", "planetas com massa medida". */
  descricao: string;
  exemplo: string;
  carregar(): Promise<P[]>;
  aoEscolher(p: P): void;
}): BuscaDePlaneta<P> {
  const { prefixo, descricao } = opcoes;
  const idLista = `${prefixo}-lista-planetas`;
  const idCampo = `${prefixo}-planeta`;
  const lista = h("datalist", { id: idLista });
  const campo = h("input", {
    type: "search",
    id: idCampo,
    list: idLista,
    placeholder: `Ex.: ${opcoes.exemplo}`,
    autocomplete: "off",
  });
  const estado = h("p", { class: "nota", role: "status" });
  let catalogo: Promise<P[]> | null = null;

  function abrir(): Promise<P[]> {
    if (!catalogo) {
      estado.textContent = `Carregando os ${descricao}…`;
      const pedido = opcoes.carregar();
      catalogo = pedido;
      pedido.then(
        (planetas) => {
          lista.replaceChildren(...planetas.map((p) => h("option", { value: p.nome })));
          if (estado.textContent?.startsWith("Carregando")) {
            estado.textContent = `${new Intl.NumberFormat("pt-BR").format(planetas.length)} ${descricao} disponíveis.`;
          }
        },
        (e: unknown) => {
          registrarErro(e, { secao: `${prefixo}-catalogo` });
          catalogo = null;
          estado.textContent = "Não foi possível carregar o catálogo. Tente de novo.";
        },
      );
    }
    return catalogo;
  }

  async function procurar(nome: string): Promise<void> {
    const alvo = nome.trim().toLowerCase();
    if (!alvo) return;
    try {
      const planetas = await abrir();
      const achado = planetas.find((p) => p.nome.toLowerCase() === alvo);
      if (achado) {
        campo.value = achado.nome;
        registrarEvento(`${prefixo}-planeta`, { planeta: achado.nome });
        opcoes.aoEscolher(achado);
      } else estado.textContent = `Não achei “${nome.trim()}” entre os ${descricao}.`;
    } catch {
      // A mensagem de erro já está no estado.
    }
  }

  const formulario = h(
    "form",
    { class: "busca-planeta" },
    h("label", { for: idCampo }, "Carregar um planeta real"),
    h("div", { class: "busca-planeta-linha" }, campo, h("button", { class: "botao", type: "submit" }, "Carregar")),
    lista,
    estado,
  );
  formulario.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void procurar(campo.value);
  });
  campo.addEventListener("focus", () => void abrir().catch(() => undefined), { once: true });
  // Escolher uma opção da lista já carrega o planeta.
  campo.addEventListener("change", () => void procurar(campo.value));

  return {
    formulario,
    estado,
    campo,
    abrir,
    limpar() {
      campo.value = "";
      estado.textContent = "";
    },
  };
}

// ---------- Roteiro (Aprender) ----------

export interface PassoDoRoteiro<S, L, K extends string> {
  titulo: string;
  texto: string;
  /** O que a pessoa deve fazer neste passo. */
  tarefa: string;
  /** Controles que aparecem no passo. Vazio: só o tempo e a animação. */
  controles: readonly K[];
  /** A conta do passo, com os números da simulação atual. */
  conta(s: S, l: L): string;
}

/** Passo pedido na URL (1 a N), dentro da faixa, contado a partir de 0. */
export function lerPasso(texto: string | undefined, total: number): number {
  const n = Number(texto);
  if (!Number.isInteger(n)) return 0;
  return Math.min(total - 1, Math.max(0, n - 1));
}

export interface Roteiro {
  elemento: HTMLElement;
  passo(): number;
  /** Atualiza a conta do passo (depois de mexer num controle). */
  atualizar(): void;
}

export function criarRoteiro<S, L, K extends string>(opcoes: {
  passos: readonly PassoDoRoteiro<S, L, K>[];
  inicial: number;
  estado(): { s: S; l: L };
  /** Mostra os controles do passo. */
  aoTrocar(passo: number, controles: readonly K[]): void;
  irParaExplorar(): void;
  telemetria: string;
}): Roteiro {
  const { passos } = opcoes;
  const elemento = h("section", { class: "roteiro painel", "aria-labelledby": "roteiro-titulo" });
  let atual = opcoes.inicial;

  function desenhar(): void {
    const p = passos[atual];
    if (!p) return;
    const { s, l } = opcoes.estado();
    const anterior = h("button", { class: "botao secundario", type: "button" }, "Anterior");
    anterior.disabled = atual === 0;
    anterior.addEventListener("click", () => void irPara(atual - 1));
    const ultimo = atual === passos.length - 1;
    const proximo = h("button", { class: "botao", type: "button" }, ultimo ? "Explorar à vontade" : "Próximo");
    proximo.addEventListener("click", () => (ultimo ? opcoes.irParaExplorar() : void irPara(atual + 1)));
    elemento.replaceChildren(
      h("p", { class: "roteiro-passo" }, `Passo ${atual + 1} de ${passos.length}`),
      h("h2", { id: "roteiro-titulo", tabindex: "-1" }, p.titulo),
      h("p", {}, p.texto),
      h("p", { class: "roteiro-tarefa" }, h("strong", {}, "Experimente: "), p.tarefa),
      h("p", { class: "conta", "data-conta": "" }, p.conta(s, l)),
      h("div", { class: "roteiro-acoes" }, anterior, proximo),
    );
    opcoes.aoTrocar(atual, p.controles);
  }

  async function irPara(novo: number): Promise<void> {
    if (novo < 0 || novo >= passos.length) return;
    atual = novo;
    registrarEvento(opcoes.telemetria, { passo: novo + 1 });
    desenhar();
    elemento.querySelector<HTMLElement>("#roteiro-titulo")?.focus({ preventScroll: true });
    await entrar(elemento);
  }

  desenhar();
  return {
    elemento,
    passo: () => atual,
    atualizar() {
      const p = passos[atual];
      const conta = elemento.querySelector<HTMLElement>("[data-conta]");
      if (p && conta) {
        const { s, l } = opcoes.estado();
        conta.textContent = p.conta(s, l);
      }
    },
  };
}

// ---------- Cartões de leitura ----------

export interface Cartao {
  elemento: HTMLElement;
  valor: HTMLElement;
  detalhe: HTMLElement;
}

/** Cartão de leitura, no mesmo formato dos cartões do catálogo. */
export function criarCartao(rotulo: string): Cartao {
  const valor = h("span", { class: "valor" });
  const detalhe = h("span", { class: "detalhe" });
  return {
    elemento: h("div", { class: "cartao" }, valor, h("span", { class: "rotulo" }, rotulo), detalhe),
    valor,
    detalhe,
  };
}

export function preencher(cartao: Cartao, valor: string, detalhe: string): void {
  cartao.valor.textContent = valor;
  cartao.detalhe.textContent = detalhe;
}

/** Parâmetros da URL sem os nulos (para montar um link). */
export function semNulos(p: Readonly<Record<string, string | null>>): Record<string, string> {
  return Object.fromEntries(Object.entries(p).filter((e): e is [string, string] => e[1] !== null));
}
