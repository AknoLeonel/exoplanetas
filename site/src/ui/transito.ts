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
import { evento as registrarEvento } from "../telemetry";
import { trocar } from "./animacao";
import { h } from "./dom";
import type { ContextoDoModulo } from "./shell";
import {
  adiar,
  baixarArquivo,
  criarAnimacao,
  criarBuscaDePlaneta,
  criarCartao,
  criarControles,
  criarRoteiro,
  lerPasso,
  nomeDoArquivo,
  preencher,
  semNulos,
} from "./simulador";
import { criarCurvaDeLuz, criarVistaDaEstrela } from "./transito-desenho";
import { ROTEIRO } from "./transito-roteiro";

/** Segundos que a animação leva para atravessar a janela da curva. */
const SEGUNDOS_POR_PASSAGEM = 6;
const ESPERA_DA_URL_MS = 250;
const ESPERA_DO_ANUNCIO_MS = 600;
/** Pontos de cada curva: suficiente para o fundo arredondado e leve para redesenhar a cada controle. */
const PONTOS = 300;

export interface OpcoesDoSimulador<P> {
  carregarCatalogo?: () => Promise<P[]>;
  baixar?: (nome: string, conteudo: string) => void;
}

export type ContextoDoSimulador = Pick<ContextoDoModulo, "modo" | "parametros" | "definirParametros">;

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

/** O simulador inteiro: vistas, controles, leituras e, no modo Aprender, o roteiro guiado. */
export function montarSimulador(
  ctx: ContextoDoSimulador,
  opcoes: OpcoesDoSimulador<PlanetaDeTransito> = {},
): HTMLElement {
  const aprender = ctx.modo === "aprender";
  const baixar = opcoes.baixar ?? baixarArquivo;

  let s: Simulacao = lerSimulacao(ctx.parametros);
  /** Planeta do catálogo para comparar: os valores dele e o nome. */
  let referencia: { nome: string; simulacao: Simulacao } | null = null;
  let curva: Curva = simularCurva(s, PONTOS);
  let curvaDeReferencia: Curva | null = null;
  let leitura: Leitura = ler(s);
  /** Instante mostrado, como fração da meia janela: −1 (antes) a 1 (depois). */
  let fracaoDoTempo = 0;

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

  const anuncio = h("p", { class: "so-leitor", "aria-live": "polite", "data-anuncio": "" });
  const aviso = h("p", { class: "aviso-sim", role: "status" });

  // ---------- Tempo e animação ----------
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

  const animacao = criarAnimacao(
    () => raiz,
    (segundos) => {
      fracaoDoTempo += (2 * segundos) / SEGUNDOS_POR_PASSAGEM;
      if (fracaoDoTempo > 1) fracaoDoTempo = -1;
      mostrarTempo();
    },
  );
  tempo.addEventListener("input", () => {
    animacao.parar();
    fracaoDoTempo = Number(tempo.value);
    mostrarTempo();
  });

  // ---------- Controles ----------
  const controles = criarControles<ChaveDaSimulacao>({
    prefixo: "transito",
    limites: LIMITES,
    formatar: formatarValor,
    aoMudar(chave, valor) {
      s = comValor(s, chave, valor);
      aoMudar(chave);
    },
  });

  // ---------- Leituras ----------
  const cartoes = {
    profundidade: criarCartao("Profundidade"),
    duracao: criarCartao("Duração do trânsito"),
    impacto: criarCartao("Parâmetro de impacto, b"),
    raio: criarCartao("Raio deduzido da curva"),
    massa: criarCartao("Massa da estrela (Kepler)"),
  };
  const contas = h("dl", { class: "contas" });

  const ligacao = h("a", { class: "ligacao-modulo", hidden: true }, "Ver a massa no simulador de velocidade radial");

  function mostrarLeituras(): void {
    const l = leitura;
    ligacao.hidden = referencia === null;
    if (referencia) {
      ligacao.setAttribute(
        "href",
        montarHash({ modulo: "velocidade-radial", modo: "explorar", parametros: { planeta: referencia.nome } }),
      );
    }
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

  const gravarNaUrl = adiar(ESPERA_DA_URL_MS, () => {
    ctx.definirParametros({
      ...paraParametros(s),
      // O Aprender não compara com planetas, mas guarda o da URL para a volta ao Explorar.
      planeta: aprender ? (ctx.parametros.planeta ?? null) : (referencia?.nome ?? null),
      passo: roteiro ? String(roteiro.passo() + 1) : (ctx.parametros.passo ?? null),
    });
  });

  let ultimaChave: ChaveDaSimulacao | null = null;
  const anunciar = adiar(ESPERA_DO_ANUNCIO_MS, () => {
    const inicio = ultimaChave ? `${LIMITES[ultimaChave].rotulo}: ${formatarValor(ultimaChave, s[ultimaChave])}. ` : "";
    anuncio.textContent = leitura.haTransito
      ? `${inicio}Profundidade ${fracaoDoBrilho(leitura.profundidade)}, duração ${decimal(leitura.duracaoHoras, 1)} horas.`
      : `${inicio}Sem trânsito.`;
  });

  function aoMudar(chave: ChaveDaSimulacao | null): void {
    recalcular();
    controles.mostrar(s);
    mostrarLeituras();
    mostrarTempo();
    roteiro?.atualizar();
    botaoRuido.disabled = s.ruidoPpm === 0;
    gravarNaUrl();
    ultimaChave = chave;
    anunciar();
  }

  // ---------- Ações ----------
  const botaoCsv = h("button", { class: "botao secundario", type: "button" }, "Exportar CSV");
  botaoCsv.addEventListener("click", () => {
    baixar(nomeDoArquivo("curva-de-luz", referencia?.nome ?? null), curvaParaCsv(curva));
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
    busca.limpar();
    aoMudar(null);
  });

  // ---------- Planeta do catálogo ----------
  const busca = criarBuscaDePlaneta<PlanetaDeTransito>({
    prefixo: "transito",
    descricao: "planetas de trânsito",
    exemplo: "Kepler-7 b",
    carregar: opcoes.carregarCatalogo ?? (() => carregarTransitos()),
    aoEscolher(p) {
      s = simulacaoDoPlaneta(p, s);
      referencia = { nome: p.nome, simulacao: { ...s } };
      busca.estado.textContent = `${p.nome}: valores do catálogo, com trânsito central${
        p.semiEixoCalculado ? " (semi-eixo calculado pela terceira lei de Kepler)" : ""
      }. A linha tracejada é a curva dele; mexa nos controles para comparar.`;
      aoMudar(null);
    },
  });

  // ---------- Roteiro (Aprender) ----------
  const roteiro = aprender
    ? criarRoteiro({
        passos: ROTEIRO,
        inicial: lerPasso(ctx.parametros.passo, ROTEIRO.length),
        estado: () => ({ s, l: leitura }),
        aoTrocar(_passo, chaves) {
          controles.filtrar(chaves);
          gravarNaUrl();
        },
        irParaExplorar() {
          location.hash = montarHash({ modulo: "transito", modo: "explorar", parametros: semNulos(paraParametros(s)) });
        },
        telemetria: "transito-passo",
      })
    : null;

  // ---------- Página ----------
  const raiz = h(
    "div",
    { class: "simulador transito", "data-modo": ctx.modo },
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
    roteiro?.elemento,
    h(
      "div",
      { class: "sim-grade" },
      h(
        "section",
        { class: "sim-vistas painel", "aria-label": "Visualização" },
        estrela.elemento,
        grafico.elemento,
        h(
          "div",
          { class: "sim-tempo" },
          animacao.botao,
          h("label", { class: "controle", for: "transito-tempo" }, "Tempo", tempo, saidaDoTempo),
        ),
        aviso,
      ),
      h(
        "section",
        { class: "sim-controles painel", "aria-label": "Controles" },
        aprender ? null : busca.formulario,
        aprender ? null : ligacao,
        controles.lista,
        h("div", { class: "sim-acoes" }, botaoCsv, botaoRuido, aprender ? null : botaoPadrao),
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
  controles.mostrar(s);
  mostrarLeituras();
  mostrarTempo();
  botaoRuido.disabled = s.ruidoPpm === 0;

  // Link com um planeta. Sem outros valores na URL (como no link vindo da velocidade radial), o planeta é
  // aplicado; com valores, eles são mantidos e o planeta entra só para comparar.
  const pedido = ctx.parametros.planeta;
  if (pedido && !aprender) {
    busca.campo.value = pedido;
    const soOPlaneta = Object.keys(semNulos(paraParametros(s))).length === 0;
    void busca
      .abrir()
      .then((planetas) => {
        const achado = planetas.find((p) => p.nome === pedido);
        if (!achado) {
          busca.estado.textContent = `${pedido} não está entre os planetas de trânsito.`;
          return;
        }
        if (soOPlaneta) s = simulacaoDoPlaneta(achado, s);
        referencia = { nome: achado.nome, simulacao: simulacaoDoPlaneta(achado, s) };
        busca.estado.textContent = `Comparando com ${achado.nome} (linha tracejada).`;
        aoMudar(null);
      })
      .catch(() => undefined);
  }
  return raiz;
}

export async function montar(ctx: ContextoDoModulo): Promise<void> {
  await trocar(ctx.host, ctx.host.querySelector<HTMLElement>("[data-skeleton]"), montarSimulador(ctx));
}
