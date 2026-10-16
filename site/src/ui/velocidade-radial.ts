import { carregarVelocidades } from "../data/carregar";
import { compacto, decimal, milhar } from "../lib/formato";
import { montarHash } from "../lib/rota";
import {
  type ChaveDaSimulacaoVR,
  type CurvaVR,
  comValorVR,
  curvaVRParaCsv,
  densidadeDoPlaneta,
  type LeituraVR,
  LIMITES_VR,
  lerSimulacaoVR,
  lerVR,
  PADRAO_VR,
  type PlanetaComMassa,
  paraParametrosVR,
  posicoesNaOrbita,
  type SimulacaoVR,
  simulacaoDoPlanetaVR,
  simularCurvaVR,
  velocidadeNaFase,
} from "../lib/simulacao-velocidade-radial";
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
import type { ContextoDoSimulador, OpcoesDoSimulador } from "./transito";
import { criarCurvaVR, criarVistaDaOrbita, rotuloDeVelocidade } from "./vr-desenho";
import { ROTEIRO_VR } from "./vr-roteiro";

const SEGUNDOS_POR_ORBITA = 6;
const ESPERA_DA_URL_MS = 250;
const ESPERA_DO_ANUNCIO_MS = 600;
const PONTOS = 300;
const PONTOS_DO_TRAJETO = 120;

/** Valor de um controle como texto, com a unidade. */
export function formatarValorVR(chave: ChaveDaSimulacaoVR, v: number): string {
  switch (chave) {
    case "excentricidade":
      return decimal(v, 2);
    case "omegaGraus":
      return `${milhar(v)}°`;
    case "inclinacaoGraus":
      return `${decimal(v, 1)}°`;
    case "ruidoMs":
      return `${decimal(v, 1)} m/s`;
    default:
      return `${compacto(v)} ${LIMITES_VR[chave].unidade}`;
  }
}

/** O simulador de velocidade radial: órbita vista de cima, curva, controles, leituras e roteiro. */
export function montarSimuladorVR(
  ctx: ContextoDoSimulador,
  opcoes: OpcoesDoSimulador<PlanetaComMassa> = {},
): HTMLElement {
  const aprender = ctx.modo === "aprender";
  const baixar = opcoes.baixar ?? baixarArquivo;

  let s: SimulacaoVR = lerSimulacaoVR(ctx.parametros);
  let referencia: { planeta: PlanetaComMassa; simulacao: SimulacaoVR } | null = null;
  let leitura: LeituraVR = lerVR(s);
  let curva: CurvaVR = simularCurvaVR(s, PONTOS);
  let curvaDeReferencia: CurvaVR | null = null;
  let trajeto: { x: number; z: number }[] = [];
  let balancoMaximo = 0;
  let velocidadeMaxima = 0;
  let fase = 0;

  const velocidadeAgora = () => velocidadeNaFase(s, leitura.semiAmplitudeMs, fase);

  const orbita = criarVistaDaOrbita(() => {
    const { planeta, estrela } = posicoesNaOrbita(s, fase);
    return {
      trajeto,
      planeta,
      estrela,
      balancoMaximo,
      velocidadeMs: velocidadeAgora(),
      velocidadeMaximaMs: velocidadeMaxima,
    };
  });
  const grafico = criarCurvaVR(() => ({
    curva,
    referencia: curvaDeReferencia,
    fase,
    velocidadeAgora: velocidadeAgora(),
    ruidoMs: s.ruidoMs,
  }));

  const anuncio = h("p", { class: "so-leitor", "aria-live": "polite", "data-anuncio": "" });

  // ---------- Tempo e animação ----------
  const tempo = h("input", {
    type: "range",
    id: "vr-tempo",
    min: 0,
    max: 1,
    step: 0.001,
    value: 0,
    "aria-describedby": "vr-tempo-saida",
  });
  const saidaDoTempo = h("output", { id: "vr-tempo-saida", for: "vr-tempo" });

  function mostrarTempo(): void {
    const v = velocidadeAgora();
    saidaDoTempo.textContent = `${decimal(fase * s.periodoDias, 2)} d`;
    tempo.value = String(fase);
    tempo.setAttribute(
      "aria-valuetext",
      `${decimal(fase * 100, 0)}% da órbita, estrela a ${rotuloDeVelocidade(v)} (${v > 0 ? "se afastando" : v < 0 ? "se aproximando" : "parada na linha de visada"})`,
    );
    orbita.agendar();
    grafico.agendar();
  }

  const animacao = criarAnimacao(
    () => raiz,
    (segundos) => {
      fase = (fase + segundos / SEGUNDOS_POR_ORBITA) % 1;
      mostrarTempo();
    },
  );
  tempo.addEventListener("input", () => {
    animacao.parar();
    fase = Number(tempo.value);
    mostrarTempo();
  });

  // ---------- Controles ----------
  const controles = criarControles<ChaveDaSimulacaoVR>({
    prefixo: "vr",
    limites: LIMITES_VR,
    formatar: formatarValorVR,
    aoMudar(chave, valor) {
      s = comValorVR(s, chave, valor);
      aoMudar(chave);
    },
  });

  // ---------- Leituras ----------
  const cartoes = {
    k: criarCartao("Semi-amplitude, K"),
    minima: criarCartao("Massa mínima deduzida, m·sen i"),
    semiEixo: criarCartao("Semi-eixo (Kepler)"),
    doppler: criarCartao("Deslocamento de H-alfa"),
    densidade: criarCartao("Massa + raio = densidade"),
  };
  const ligacao = h("a", { class: "ligacao-modulo", hidden: true }, "Abrir este planeta no simulador de trânsito");
  cartoes.densidade.elemento.append(ligacao);
  const contas = h("dl", { class: "contas" });

  function mostrarLeituras(): void {
    const l = leitura;
    const ref = referencia;
    preencher(
      cartoes.k,
      rotuloDeVelocidade(l.semiAmplitudeMs).replace("+", ""),
      `a estrela vai e vem a essa velocidade${ref ? ` · ${ref.planeta.nome} com estes valores: ${rotuloDeVelocidade(lerVR(ref.simulacao).semiAmplitudeMs).replace("+", "")}` : ""}`,
    );
    preencher(
      cartoes.minima,
      `${compacto(l.massaMinimaMterra)} × Terra`,
      `a verdadeira é ${compacto(s.massaPlanetaMterra)} × Terra (× ${decimal(l.fatorDaInclinacao, 2)})`,
    );
    preencher(cartoes.semiEixo, `${compacto(l.semiEixoUA)} UA`, "a³ = G(M★ + m)·P² / 4π²");
    preencher(cartoes.doppler, `${decimal(l.deslocamentoHalfaPm, 3)} pm`, "Δλ = λ·K/c, com λ = 656,28 nm");

    const densidade = ref ? densidadeDoPlaneta(ref.planeta) : null;
    if (ref && densidade) {
      preencher(
        cartoes.densidade,
        `${densidade.piso ? "≥ " : ""}${decimal(densidade.gcm3, 2)} g/cm³`,
        `${ref.planeta.nome}: ${compacto(ref.planeta.massaMterra)} × Terra ${densidade.piso ? "(massa mínima)" : "(massa verdadeira)"} e raio de ${compacto(ref.planeta.raioRterra ?? 0)} × Terra medido no trânsito`,
      );
      ligacao.hidden = false;
      ligacao.setAttribute(
        "href",
        montarHash({ modulo: "transito", modo: "explorar", parametros: { planeta: ref.planeta.nome } }),
      );
    } else {
      preencher(
        cartoes.densidade,
        "—",
        ref
          ? `${ref.planeta.nome} não tem raio medido: sem trânsito, a densidade fica desconhecida`
          : "carregue um planeta que também tem trânsito, como Kepler-10 b",
      );
      ligacao.hidden = true;
    }
    contas.replaceChildren(
      ...ROTEIRO_VR.slice(1).flatMap((p) => [h("dt", {}, p.titulo), h("dd", { class: "conta" }, p.conta(s, l))]),
    );
  }

  // ---------- Atualização ----------
  function recalcular(): void {
    leitura = lerVR(s);
    curva = simularCurvaVR(s, PONTOS);
    curvaDeReferencia = referencia ? simularCurvaVR({ ...referencia.simulacao, ruidoMs: 0 }, PONTOS) : null;
    trajeto = [];
    balancoMaximo = 0;
    for (let i = 0; i < PONTOS_DO_TRAJETO; i++) {
      const { planeta, estrela } = posicoesNaOrbita(s, i / PONTOS_DO_TRAJETO);
      trajeto.push(planeta);
      balancoMaximo = Math.max(balancoMaximo, Math.hypot(estrela.x, estrela.z));
    }
    velocidadeMaxima = Math.max(...curva.modelo.map((p) => Math.abs(p.velocidadeMs)));
  }

  const gravarNaUrl = adiar(ESPERA_DA_URL_MS, () => {
    ctx.definirParametros({
      ...paraParametrosVR(s),
      planeta: aprender ? (ctx.parametros.planeta ?? null) : (referencia?.planeta.nome ?? null),
      passo: roteiro ? String(roteiro.passo() + 1) : (ctx.parametros.passo ?? null),
    });
  });

  let ultimaChave: ChaveDaSimulacaoVR | null = null;
  const anunciar = adiar(ESPERA_DO_ANUNCIO_MS, () => {
    const inicio = ultimaChave
      ? `${LIMITES_VR[ultimaChave].rotulo}: ${formatarValorVR(ultimaChave, s[ultimaChave])}. `
      : "";
    anuncio.textContent = `${inicio}Semi-amplitude ${decimal(leitura.semiAmplitudeMs, 2)} metros por segundo, massa mínima ${compacto(leitura.massaMinimaMterra)} vezes a da Terra.`;
  });

  function aoMudar(chave: ChaveDaSimulacaoVR | null): void {
    recalcular();
    controles.mostrar(s);
    mostrarLeituras();
    mostrarTempo();
    roteiro?.atualizar();
    botaoRuido.disabled = s.ruidoMs === 0;
    gravarNaUrl();
    ultimaChave = chave;
    anunciar();
  }

  // ---------- Ações ----------
  const botaoCsv = h("button", { class: "botao secundario", type: "button" }, "Exportar CSV");
  botaoCsv.addEventListener("click", () => {
    baixar(nomeDoArquivo("velocidade-radial", referencia?.planeta.nome ?? null), curvaVRParaCsv(s, curva));
    registrarEvento("vr-exportar", { pontos: curva.medida.length });
  });
  const botaoRuido = h("button", { class: "botao secundario", type: "button" }, "Nova amostra de ruído");
  botaoRuido.addEventListener("click", () => {
    s = { ...s, semente: s.semente + 1 };
    aoMudar(null);
  });
  const botaoPadrao = h("button", { class: "botao secundario", type: "button" }, "Voltar ao início");
  botaoPadrao.addEventListener("click", () => {
    s = { ...PADRAO_VR };
    referencia = null;
    busca.limpar();
    aoMudar(null);
  });

  // ---------- Planeta do catálogo ----------
  function comparar(p: PlanetaComMassa, aplicar: boolean): void {
    if (aplicar) s = simulacaoDoPlanetaVR(p, s);
    referencia = { planeta: p, simulacao: simulacaoDoPlanetaVR(p, s) };
  }

  const busca = criarBuscaDePlaneta<PlanetaComMassa>({
    prefixo: "vr",
    descricao: "planetas com massa medida",
    exemplo: "Kepler-10 b",
    carregar: opcoes.carregarCatalogo ?? (() => carregarVelocidades()),
    aoEscolher(p) {
      comparar(p, true);
      busca.estado.textContent = `${p.nome}: valores do catálogo, com a órbita de lado${
        p.massaVerdadeira ? "" : " (o catálogo só tem a massa mínima, m·sen i)"
      }${p.excentricidade === null ? "; sem excentricidade no catálogo, a órbita é circular" : ""}. A linha tracejada é a curva dele.`;
      aoMudar(null);
    },
  });

  // ---------- Roteiro (Aprender) ----------
  const roteiro = aprender
    ? criarRoteiro({
        passos: ROTEIRO_VR,
        inicial: lerPasso(ctx.parametros.passo, ROTEIRO_VR.length),
        estado: () => ({ s, l: leitura }),
        aoTrocar(_passo, chaves) {
          controles.filtrar(chaves);
          gravarNaUrl();
        },
        irParaExplorar() {
          location.hash = montarHash({
            modulo: "velocidade-radial",
            modo: "explorar",
            parametros: semNulos(paraParametrosVR(s)),
          });
        },
        telemetria: "vr-passo",
      })
    : null;

  // ---------- Página ----------
  const raiz = h(
    "div",
    { class: "simulador velocidade-radial", "data-modo": ctx.modo },
    h(
      "header",
      { class: "hero hero-modulo" },
      h("h1", {}, "Simulador de velocidade radial"),
      h(
        "p",
        { class: "lead" },
        aprender
          ? "Um passo de cada vez: como um planeta faz a estrela balançar, como o efeito Doppler mede esse balanço e por que ele só dá a massa mínima."
          : "Todos os parâmetros na mão. A curva de velocidade é recalculada a cada mudança, com excentricidade, inclinação e ruído.",
      ),
    ),
    roteiro?.elemento,
    h(
      "div",
      { class: "sim-grade" },
      h(
        "section",
        { class: "sim-vistas painel", "aria-label": "Visualização" },
        orbita.elemento,
        grafico.elemento,
        h(
          "div",
          { class: "sim-tempo" },
          animacao.botao,
          h("label", { class: "controle", for: "vr-tempo" }, "Tempo", tempo, saidaDoTempo),
        ),
      ),
      h(
        "section",
        { class: "sim-controles painel", "aria-label": "Controles" },
        aprender ? null : busca.formulario,
        controles.lista,
        h("div", { class: "sim-acoes" }, botaoCsv, botaoRuido, aprender ? null : botaoPadrao),
      ),
    ),
    h(
      "section",
      { class: "secao secao-curta", "aria-labelledby": "t-leituras-vr" },
      h("header", {}, h("h2", { id: "t-leituras-vr" }, "O que a curva diz")),
      h("div", { class: "cartoes" }, ...Object.values(cartoes).map((c) => c.elemento)),
    ),
    aprender
      ? null
      : h(
          "section",
          { class: "secao secao-curta", "aria-labelledby": "t-contas-vr" },
          h(
            "header",
            {},
            h("h2", { id: "t-contas-vr" }, "As contas"),
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
  botaoRuido.disabled = s.ruidoMs === 0;

  // Link com um planeta. Sem outros valores na URL (como no link vindo do trânsito), o planeta é aplicado;
  // com valores, eles são mantidos e o planeta entra só para comparar.
  const pedido = ctx.parametros.planeta;
  if (pedido && !aprender) {
    busca.campo.value = pedido;
    const soOPlaneta = Object.keys(semNulos(paraParametrosVR(s))).length === 0;
    void busca
      .abrir()
      .then((planetas) => {
        const achado = planetas.find((p) => p.nome === pedido);
        if (!achado) {
          busca.estado.textContent = `${pedido} não tem massa medida no catálogo.`;
          return;
        }
        comparar(achado, soOPlaneta);
        busca.estado.textContent = `Comparando com ${achado.nome} (linha tracejada).`;
        aoMudar(null);
      })
      .catch(() => undefined);
  }
  return raiz;
}

export async function montar(ctx: ContextoDoModulo): Promise<void> {
  await trocar(ctx.host, ctx.host.querySelector<HTMLElement>("[data-skeleton]"), montarSimuladorVR(ctx));
}
