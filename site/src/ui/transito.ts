import { carregarTransitos } from "../data/carregar";
import { curvaDeLuz, fluxoRelativo, posicaoNoCeu, separacaoProjetada } from "../lib/fisica/transito";
import { compacto, decimal, fracaoDoBrilho, milhar } from "../lib/formato";
import { montarHash } from "../lib/rota";
import {
  type ChaveDaSimulacao,
  type Curva,
  comValor,
  curvaParaCsv,
  geometria,
  type Leitura,
  LIMITES,
  ler,
  lerSimulacao,
  PADRAO,
  type PlanetaDeTransito,
  paraParametros,
  type Simulacao,
  simulacaoDoPlaneta,
  simularCurva,
} from "../lib/simulacao-transito";
import { erro as registrarErro, evento as registrarEvento } from "../telemetry";
import { entrar, trocar } from "./animacao";
import { h } from "./dom";
import type { ContextoDoModulo } from "./shell";
import { criarCurvaDeLuz, criarVistaDaEstrela } from "./transito-desenho";
import { lerPasso, ROTEIRO } from "./transito-roteiro";

/** Segundos que a animação leva para atravessar a janela da curva. */
const SEGUNDOS_POR_PASSAGEM = 6;
const ESPERA_DA_URL_MS = 250;
const ESPERA_DO_ANUNCIO_MS = 600;
/** Pontos de cada curva: suficiente para o fundo arredondado e leve para redesenhar a cada controle. */
const PONTOS = 300;

export interface OpcoesDoSimulador {
  carregarCatalogo?: () => Promise<PlanetaDeTransito[]>;
  baixar?: (nome: string, conteudo: string) => void;
}

type ContextoDoSimulador = Pick<ContextoDoModulo, "modo" | "parametros" | "definirParametros">;

/** Valor de um controle como texto, com a unidade. */
export function formatarValor(chave: ChaveDaSimulacao, v: number): string {
  switch (chave) {
    case "inclinacaoGraus":
      return `${decimal(v, 2)}°`;
    case "u1":
    case "u2":
      return decimal(v, 2);
    case "ruidoPpm":
      return `${milhar(v)} ppm`;
    default:
      return `${compacto(v)} ${LIMITES[chave].unidade}`;
  }
}

function baixarArquivo(nome: string, conteudo: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
  const link = h("a", { href: url, download: nome });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function nomeDoArquivo(referencia: string | null): string {
  const base = (referencia ?? "simulacao")
    .normalize("NFD")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-");
  return `curva-de-luz-${base.replace(/^-|-$/g, "").toLowerCase()}.csv`;
}

interface Controle {
  rotulo: HTMLElement;
  entrada: HTMLInputElement;
  saida: HTMLOutputElement;
}

/** O simulador inteiro: vistas, controles, leituras e, no modo Aprender, o roteiro guiado. */
export function montarSimulador(ctx: ContextoDoSimulador, opcoes: OpcoesDoSimulador = {}): HTMLElement {
  const aprender = ctx.modo === "aprender";
  const carregarCatalogo = opcoes.carregarCatalogo ?? (() => carregarTransitos());
  const baixar = opcoes.baixar ?? baixarArquivo;

  let s: Simulacao = lerSimulacao(ctx.parametros);
  let passo = lerPasso(ctx.parametros.passo);
  /** Planeta do catálogo para comparar: os valores dele e o nome. */
  let referencia: { nome: string; simulacao: Simulacao } | null = null;
  let curva: Curva = simularCurva(s, PONTOS);
  let curvaDeReferencia: Curva | null = null;
  let leitura: Leitura = ler(s);
  /** Instante mostrado, como fração da meia janela: −1 (antes) a 1 (depois). */
  let fracaoDoTempo = 0;
  let animando = false;
  let quadroDaAnimacao = 0;
  let ultimoQuadro = 0;
  let esperaDaUrl: ReturnType<typeof setTimeout> | undefined;
  let esperaDoAnuncio: ReturnType<typeof setTimeout> | undefined;

  const tempoDias = () => fracaoDoTempo * curva.meiaJanelaDias;
  function fluxoAgora(): number {
    if (leitura.dentroDaEstrela) return 1;
    const g = geometria(s);
    return fluxoRelativo(separacaoProjetada(g, tempoDias()), g.razaoDeRaios, s);
  }

  const estrela = criarVistaDaEstrela(() => ({
    razaoDeRaios: leitura.razaoDeRaios,
    escurecimento: s,
    posicao: posicaoNoCeu(geometria(s), tempoDias()),
  }));
  const grafico = criarCurvaDeLuz(() => ({
    curva,
    referencia: curvaDeReferencia,
    tempoDias: tempoDias(),
    fluxoAgora: fluxoAgora(),
    ruido: s.ruidoPpm * 1e-6,
  }));

  const anuncio = h("p", { class: "so-leitor", "aria-live": "polite", "data-anuncio-transito": "" });
  const aviso = h("p", { class: "aviso-transito", role: "status" });

  // ---------- Tempo e animação ----------
  const botaoAnimar = h("button", { class: "botao", type: "button", "aria-pressed": "false" }, "Animar");
  const tempo = h("input", {
    type: "range",
    id: "transito-tempo",
    min: -1,
    max: 1,
    step: 0.001,
    value: 0,
    "aria-describedby": "transito-tempo-saida",
  });
  const saidaDoTempo = h("output", { id: "transito-tempo-saida", for: "transito-tempo" });

  function mostrarTempo(): void {
    const horas = tempoDias() * 24;
    const texto = `${horas > 0 ? "+" : horas < 0 ? "−" : ""}${decimal(Math.abs(horas), 2)} h`;
    saidaDoTempo.textContent = texto;
    tempo.value = String(fracaoDoTempo);
    tempo.setAttribute("aria-valuetext", `${texto} do meio do trânsito, brilho ${decimal(fluxoAgora() * 100, 3)}%`);
    estrela.agendar();
    grafico.agendar();
  }

  function pararAnimacao(): void {
    animando = false;
    cancelAnimationFrame(quadroDaAnimacao);
    botaoAnimar.textContent = "Animar";
    botaoAnimar.setAttribute("aria-pressed", "false");
  }

  function quadro(agora: number): void {
    if (!raiz.isConnected) {
      pararAnimacao();
      return;
    }
    const passou = ultimoQuadro ? (agora - ultimoQuadro) / 1000 : 0;
    ultimoQuadro = agora;
    fracaoDoTempo += (2 * passou) / SEGUNDOS_POR_PASSAGEM;
    if (fracaoDoTempo > 1) fracaoDoTempo = -1;
    mostrarTempo();
    quadroDaAnimacao = requestAnimationFrame(quadro);
  }

  botaoAnimar.addEventListener("click", () => {
    if (animando) return pararAnimacao();
    animando = true;
    ultimoQuadro = 0;
    botaoAnimar.textContent = "Pausar";
    botaoAnimar.setAttribute("aria-pressed", "true");
    quadroDaAnimacao = requestAnimationFrame(quadro);
  });
  tempo.addEventListener("input", () => {
    pararAnimacao();
    fracaoDoTempo = Number(tempo.value);
    mostrarTempo();
  });

  // ---------- Controles da simulação ----------
  const controles = new Map<ChaveDaSimulacao, Controle>();
  for (const chave of Object.keys(LIMITES) as ChaveDaSimulacao[]) {
    const limite = LIMITES[chave];
    const id = `transito-${limite.url}`;
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
      const valor = limite.log ? Number((10 ** bruto).toPrecision(4)) : bruto;
      s = comValor(s, chave, valor);
      aoMudar(chave);
    });
    controles.set(chave, { rotulo, entrada, saida });
  }

  function mostrarControles(): void {
    for (const [chave, { entrada, saida }] of controles) {
      const limite = LIMITES[chave];
      const v = s[chave];
      // Só reposiciona o cursor se o valor mudou por fora (planeta carregado, borda limitada), para não brigar com o arrasto.
      const posicao = limite.log ? Math.log10(v) : v;
      if (Math.abs(Number(entrada.value) - posicao) > (limite.log ? 0.0005 : limite.passo / 2)) {
        entrada.value = String(posicao);
      }
      const texto = formatarValor(chave, v);
      saida.textContent = texto;
      entrada.setAttribute("aria-valuetext", texto);
    }
  }

  // ---------- Leituras ----------
  const cartoes = {
    profundidade: criarCartao("Profundidade"),
    duracao: criarCartao("Duração do trânsito"),
    impacto: criarCartao("Parâmetro de impacto, b"),
    raio: criarCartao("Raio deduzido da curva"),
    massa: criarCartao("Massa da estrela (Kepler)"),
  };
  const contas = h("dl", { class: "contas" });

  function mostrarLeituras(): void {
    const l = leitura;
    const ref = referencia ? ler(referencia.simulacao) : null;
    const doCatalogo = (texto: string) => (referencia ? ` · ${referencia.nome} no catálogo: ${texto}` : "");
    preencher(
      cartoes.profundidade,
      l.haTransito ? fracaoDoBrilho(l.profundidade) : "sem trânsito",
      `(Rp/R★)² = ${fracaoDoBrilho(l.profundidadeSimples)}${ref ? doCatalogo(fracaoDoBrilho(ref.profundidade)) : ""}`,
    );
    preencher(
      cartoes.duracao,
      l.haTransito ? `${decimal(l.duracaoHoras, 2)} h` : "—",
      `do primeiro ao último contato${ref ? doCatalogo(`${decimal(ref.duracaoHoras, 2)} h`) : ""}`,
    );
    preencher(
      cartoes.impacto,
      decimal(l.parametroDeImpacto, 2),
      `há trânsito se b < ${decimal(1 + l.razaoDeRaios, 2)}`,
    );
    preencher(
      cartoes.raio,
      l.haTransito ? `${compacto(l.raioInferidoRterra)} × Terra` : "—",
      `Rp = R★·√δ; o simulado é ${compacto(s.raioPlanetaRterra)} × Terra${s.u1 + s.u2 > 0 ? " (a borda escura engana essa conta: o centro fica mais fundo)" : ""}`,
    );
    preencher(cartoes.massa, `${compacto(l.massaDaEstrelaMsol)} × Sol`, "M = 4π²a³ / (G·P²)");
    contas.replaceChildren(
      ...ROTEIRO.slice(1).flatMap((p) => [h("dt", {}, p.titulo), h("dd", { class: "conta" }, p.conta(s, l))]),
    );
    aviso.textContent = l.dentroDaEstrela
      ? "Com esse semi-eixo, a órbita passaria por dentro da estrela. Afaste o planeta ou diminua a estrela."
      : l.haTransito
        ? ""
        : "Com essa inclinação, o planeta passa por cima da estrela: visto daqui, não há trânsito.";
  }

  // ---------- Atualização ----------
  function recalcular(): void {
    curva = simularCurva(s, PONTOS);
    leitura = ler(s);
    curvaDeReferencia = referencia
      ? {
          modelo: curvaDeLuz(geometria(referencia.simulacao), curva.meiaJanelaDias, PONTOS, referencia.simulacao),
          medida: [],
          meiaJanelaDias: curva.meiaJanelaDias,
        }
      : null;
  }

  function gravarNaUrl(): void {
    clearTimeout(esperaDaUrl);
    esperaDaUrl = setTimeout(() => {
      ctx.definirParametros({
        ...paraParametros(s),
        // O Aprender não compara com planetas, mas guarda o da URL para a volta ao Explorar.
        planeta: aprender ? (ctx.parametros.planeta ?? null) : (referencia?.nome ?? null),
        passo: aprender ? String(passo + 1) : (ctx.parametros.passo ?? null),
      });
    }, ESPERA_DA_URL_MS);
  }

  function anunciar(chave: ChaveDaSimulacao | null): void {
    clearTimeout(esperaDoAnuncio);
    esperaDoAnuncio = setTimeout(() => {
      const inicio = chave ? `${LIMITES[chave].rotulo}: ${formatarValor(chave, s[chave])}. ` : "";
      anuncio.textContent = leitura.haTransito
        ? `${inicio}Profundidade ${fracaoDoBrilho(leitura.profundidade)}, duração ${decimal(leitura.duracaoHoras, 1)} horas.`
        : `${inicio}Sem trânsito.`;
    }, ESPERA_DO_ANUNCIO_MS);
  }

  function aoMudar(chave: ChaveDaSimulacao | null): void {
    recalcular();
    mostrarControles();
    mostrarLeituras();
    mostrarTempo();
    mostrarRoteiro(false);
    botaoRuido.disabled = s.ruidoPpm === 0;
    gravarNaUrl();
    anunciar(chave);
  }

  // ---------- Ações ----------
  const botaoCsv = h("button", { class: "botao secundario", type: "button" }, "Exportar CSV");
  botaoCsv.addEventListener("click", () => {
    baixar(nomeDoArquivo(referencia?.nome ?? null), curvaParaCsv(curva));
    registrarEvento("transito-exportar", { pontos: curva.medida.length });
  });
  const botaoRuido = h("button", { class: "botao secundario", type: "button" }, "Nova amostra de ruído");
  botaoRuido.addEventListener("click", () => {
    s = { ...s, semente: s.semente + 1 };
    aoMudar(null);
  });
  const botaoPadrao = h("button", { class: "botao secundario", type: "button" }, "Voltar ao início");
  botaoPadrao.addEventListener("click", () => {
    s = { ...PADRAO };
    referencia = null;
    campoPlaneta.value = "";
    estadoDoCatalogo.textContent = "";
    aoMudar(null);
  });

  // ---------- Planeta do catálogo ----------
  const lista = h("datalist", { id: "transito-lista-planetas" });
  const campoPlaneta = h("input", {
    type: "search",
    id: "transito-planeta",
    list: "transito-lista-planetas",
    placeholder: "Ex.: Kepler-7 b",
    autocomplete: "off",
  });
  const estadoDoCatalogo = h("p", { class: "nota", role: "status" });
  let catalogo: Promise<PlanetaDeTransito[]> | null = null;

  function abrirCatalogo(): Promise<PlanetaDeTransito[]> {
    if (!catalogo) {
      estadoDoCatalogo.textContent = "Carregando os planetas de trânsito…";
      const pedido = carregarCatalogo();
      catalogo = pedido;
      pedido.then(
        (planetas) => {
          lista.replaceChildren(...planetas.map((p) => h("option", { value: p.nome })));
          if (estadoDoCatalogo.textContent?.startsWith("Carregando")) {
            estadoDoCatalogo.textContent = `${milhar(planetas.length)} planetas de trânsito disponíveis.`;
          }
        },
        (e: unknown) => {
          registrarErro(e, { secao: "transito-catalogo" });
          catalogo = null;
          estadoDoCatalogo.textContent = "Não foi possível carregar o catálogo. Tente de novo.";
        },
      );
    }
    return catalogo;
  }

  function usarPlaneta(p: PlanetaDeTransito): void {
    s = simulacaoDoPlaneta(p, s);
    referencia = { nome: p.nome, simulacao: { ...s } };
    campoPlaneta.value = p.nome;
    estadoDoCatalogo.textContent = `${p.nome}: valores do catálogo, com trânsito central${
      p.semiEixoCalculado ? " (semi-eixo calculado pela terceira lei de Kepler)" : ""
    }. A linha tracejada é a curva dele; mexa nos controles para comparar.`;
    registrarEvento("transito-planeta", { planeta: p.nome });
    aoMudar(null);
  }

  async function procurar(nome: string): Promise<void> {
    const alvo = nome.trim().toLowerCase();
    if (!alvo) return;
    try {
      const planetas = await abrirCatalogo();
      const achado = planetas.find((p) => p.nome.toLowerCase() === alvo);
      if (achado) usarPlaneta(achado);
      else estadoDoCatalogo.textContent = `Não achei “${nome.trim()}” entre os planetas de trânsito.`;
    } catch {
      // A mensagem de erro já está no estado do catálogo.
    }
  }

  const formulario = h(
    "form",
    { class: "busca-planeta" },
    h("label", { for: "transito-planeta" }, "Carregar um planeta real"),
    h(
      "div",
      { class: "busca-planeta-linha" },
      campoPlaneta,
      h("button", { class: "botao", type: "submit" }, "Carregar"),
    ),
    lista,
    estadoDoCatalogo,
  );
  formulario.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void procurar(campoPlaneta.value);
  });
  campoPlaneta.addEventListener("focus", () => void abrirCatalogo().catch(() => undefined), { once: true });
  // Escolher uma opção da lista já carrega o planeta.
  campoPlaneta.addEventListener("change", () => void procurar(campoPlaneta.value));

  // ---------- Roteiro (Aprender) ----------
  const roteiro = h("section", { class: "roteiro painel", "aria-labelledby": "roteiro-titulo" });
  const listaDeControles = h("div", { class: "controles-sim" });

  function mostrarRoteiro(trocouDePasso: boolean): void {
    if (!aprender) return;
    const atual = ROTEIRO[passo];
    if (!atual) return;
    if (trocouDePasso || !roteiro.firstChild) {
      const anterior = h("button", { class: "botao secundario", type: "button" }, "Anterior");
      anterior.disabled = passo === 0;
      anterior.addEventListener("click", () => void irPara(passo - 1));
      const ultimo = passo === ROTEIRO.length - 1;
      const proximo = h("button", { class: "botao", type: "button" }, ultimo ? "Explorar à vontade" : "Próximo");
      proximo.addEventListener("click", () => {
        if (!ultimo) return void irPara(passo + 1);
        const parametros = Object.fromEntries(
          Object.entries(paraParametros(s)).filter((e): e is [string, string] => e[1] !== null),
        );
        location.hash = montarHash({ modulo: "transito", modo: "explorar", parametros });
      });
      roteiro.replaceChildren(
        h("p", { class: "roteiro-passo" }, `Passo ${passo + 1} de ${ROTEIRO.length}`),
        h("h2", { id: "roteiro-titulo", tabindex: "-1" }, atual.titulo),
        h("p", {}, atual.texto),
        h("p", { class: "roteiro-tarefa" }, h("strong", {}, "Experimente: "), atual.tarefa),
        h("p", { class: "conta", "data-conta": "" }, atual.conta(s, leitura)),
        h("div", { class: "roteiro-acoes" }, anterior, proximo),
      );
      const visiveis = new Set<ChaveDaSimulacao>(atual.controles);
      for (const [chave, { rotulo }] of controles) rotulo.hidden = !visiveis.has(chave);
      return;
    }
    const conta = roteiro.querySelector<HTMLElement>("[data-conta]");
    if (conta) conta.textContent = atual.conta(s, leitura);
  }

  async function irPara(novo: number): Promise<void> {
    if (novo < 0 || novo >= ROTEIRO.length) return;
    passo = novo;
    registrarEvento("transito-passo", { passo: novo + 1 });
    mostrarRoteiro(true);
    gravarNaUrl();
    roteiro.querySelector<HTMLElement>("#roteiro-titulo")?.focus({ preventScroll: true });
    await entrar(roteiro);
  }

  for (const { rotulo } of controles.values()) listaDeControles.append(rotulo);

  // ---------- Página ----------
  const raiz = h(
    "div",
    { class: "transito", "data-modo": ctx.modo },
    h(
      "header",
      { class: "hero hero-modulo" },
      h("h1", {}, "Simulador de trânsito"),
      h(
        "p",
        { class: "lead" },
        aprender
          ? "Um passo de cada vez: por que o brilho cai quando um planeta passa na frente da estrela, e como essa queda conta o tamanho do planeta."
          : "Todos os parâmetros na mão. A curva de luz é recalculada a cada mudança, com escurecimento de borda e ruído.",
      ),
    ),
    aprender ? roteiro : null,
    h(
      "div",
      { class: "transito-grade" },
      h(
        "section",
        { class: "transito-vistas painel", "aria-label": "Visualização" },
        estrela.elemento,
        grafico.elemento,
        h(
          "div",
          { class: "transito-tempo" },
          botaoAnimar,
          h("label", { class: "controle", for: "transito-tempo" }, "Tempo", tempo, saidaDoTempo),
        ),
        aviso,
      ),
      h(
        "section",
        { class: "transito-controles painel", "aria-label": "Controles" },
        aprender ? null : formulario,
        listaDeControles,
        h("div", { class: "transito-acoes" }, botaoCsv, botaoRuido, aprender ? null : botaoPadrao),
      ),
    ),
    h(
      "section",
      { class: "secao secao-curta", "aria-labelledby": "t-leituras" },
      h("header", {}, h("h2", { id: "t-leituras" }, "O que a curva diz")),
      h("div", { class: "cartoes" }, ...Object.values(cartoes).map((c) => c.elemento)),
    ),
    aprender
      ? null
      : h(
          "section",
          { class: "secao secao-curta", "aria-labelledby": "t-contas" },
          h(
            "header",
            {},
            h("h2", { id: "t-contas" }, "As contas"),
            h("p", {}, "As mesmas fórmulas do modo Aprender, com os números da simulação atual."),
          ),
          contas,
        ),
    anuncio,
  );

  recalcular();
  mostrarControles();
  mostrarLeituras();
  mostrarTempo();
  mostrarRoteiro(true);
  botaoRuido.disabled = s.ruidoPpm === 0;

  // Link compartilhado com um planeta: traz o catálogo para a comparação, sem mexer nos valores da URL.
  const pedido = ctx.parametros.planeta;
  if (pedido && !aprender) {
    campoPlaneta.value = pedido;
    void abrirCatalogo()
      .then((planetas) => {
        const achado = planetas.find((p) => p.nome === pedido);
        if (!achado) return;
        referencia = { nome: achado.nome, simulacao: simulacaoDoPlaneta(achado, s) };
        estadoDoCatalogo.textContent = `Comparando com ${achado.nome} (linha tracejada).`;
        aoMudar(null);
      })
      .catch(() => undefined);
  }
  return raiz;
}

/** Cartão de leitura, no mesmo formato dos cartões do catálogo. */
function criarCartao(rotulo: string): { elemento: HTMLElement; valor: HTMLElement; detalhe: HTMLElement } {
  const valor = h("span", { class: "valor" });
  const detalhe = h("span", { class: "detalhe" });
  return {
    elemento: h("div", { class: "cartao" }, valor, h("span", { class: "rotulo" }, rotulo), detalhe),
    valor,
    detalhe,
  };
}

function preencher(cartao: ReturnType<typeof criarCartao>, valor: string, detalhe: string): void {
  cartao.valor.textContent = valor;
  cartao.detalhe.textContent = detalhe;
}

export async function montar(ctx: ContextoDoModulo): Promise<void> {
  await trocar(ctx.host, ctx.host.querySelector<HTMLElement>("[data-skeleton]"), montarSimulador(ctx));
}
