import { carregarModeloRaio, carregarPlanetasDoTreino } from "../data/carregar";
import { compacto, decimal, milhar, percentual } from "../lib/formato";
import {
  type ChaveDaEntrada,
  comValorML,
  type EntradaML,
  entradaDoPlaneta,
  type LeituraML,
  LIMITES_ML,
  lerEntradaML,
  lerML,
  type ModeloRaio,
  NOMES_DAS_VARIAVEIS,
  PADRAO_ML,
  type PlanetaDoTreino,
  paraParametrosML,
  VARIAVEIS,
} from "../lib/modelo-raio";
import { CLASSES, classificar } from "../lib/planetas";
import { montarHash } from "../lib/rota";
import { evento as registrarEvento } from "../telemetry";
import { carregarSecao } from "./carga";
import { h } from "./dom";
import { criarGraficoML } from "./ml-desenho";
import { ROTEIRO_ML, textoDoFator } from "./ml-roteiro";
import type { ContextoDoModulo } from "./shell";
import {
  adiar,
  baixarArquivo,
  criarBuscaDePlaneta,
  criarCartao,
  criarControles,
  criarRoteiro,
  lerPasso,
  nomeDoArquivo,
  preencher,
  semNulos,
} from "./simulador";
import type { ContextoDoSimulador } from "./transito";

const ESPERA_DA_URL_MS = 250;
const ESPERA_DO_ANUNCIO_MS = 600;
/** Fator (em log10) que enche a barra de uma variável: 0,5 = três vezes o raio. */
const LOG_DA_BARRA_CHEIA = 0.5;

export interface DadosDoML {
  modelo: ModeloRaio;
  planetas: readonly PlanetaDoTreino[];
}

export function formatarValorML(chave: ChaveDaEntrada, v: number): string {
  switch (chave) {
    case "teffK":
      return `${milhar(v)} K`;
    case "metalicidade":
      return `${v > 0 ? "+" : ""}${decimal(v, 2)} dex`;
    case "massaEstrelaMsol":
      return `${decimal(v, 2)} × Sol`;
    default:
      return `${compacto(v)} ${LIMITES_ML[chave].unidade}`;
  }
}

/** CSV de uma previsão, com a entrada, o intervalo e o fator de cada variável. */
export function previsaoParaCsv(e: EntradaML, l: LeituraML): string {
  const linhas: [string, string][] = [
    ...(Object.keys(LIMITES_ML) as ChaveDaEntrada[]).map((c): [string, string] => [c, String(e[c])]),
    ["raio_previsto", l.raio.toFixed(4)],
    ["raio_inferior_80", l.inferior.toFixed(4)],
    ["raio_superior_80", l.superior.toFixed(4)],
    ["raio_base", l.raioBase.toFixed(4)],
    ...VARIAVEIS.map((v, i): [string, string] => [`fator_${v}`, (l.fatores[i] ?? 1).toFixed(6)]),
  ];
  return `grandeza,valor\n${linhas.map(([a, b]) => `${a},${b}`).join("\n")}\n`;
}

function nomeDaClasse(raio: number): string {
  const id = classificar(raio);
  return CLASSES.find((c) => c.id === id)?.nome ?? "";
}

/** O módulo de ML: controles, previsão com intervalo, explicação por variável, gráfico e roteiro. */
export function montarML(
  ctx: ContextoDoSimulador,
  dados: DadosDoML,
  opcoes: { baixar?: (nome: string, conteudo: string) => void } = {},
): HTMLElement {
  const { modelo, planetas } = dados;
  const aprender = ctx.modo === "aprender";
  const baixar = opcoes.baixar ?? baixarArquivo;

  let e: EntradaML = lerEntradaML(ctx.parametros);
  let leitura: LeituraML = lerML(modelo, e);
  let destaque: PlanetaDoTreino | null = null;

  const grafico = criarGraficoML(() => ({
    planetas,
    previsao: { massa: e.massaMterra, raio: leitura.raio, inferior: leitura.inferior, superior: leitura.superior },
    destaque,
    extrapolando: VARIAVEIS.some((v) => leitura.extrapolacao[v] === "fora"),
  }));
  const anuncio = h("p", { class: "so-leitor", "aria-live": "polite", "data-anuncio": "" });
  const aviso = h("p", { class: "aviso-sim", role: "status" });

  const controles = criarControles<ChaveDaEntrada>({
    prefixo: "ml",
    limites: LIMITES_ML,
    formatar: formatarValorML,
    aoMudar(chave, valor) {
      e = comValorML(e, chave, valor);
      destaque = null;
      aoMudar(chave);
    },
  });

  // ---------- Leituras ----------
  const cartoes = {
    raio: criarCartao("Raio previsto"),
    intervalo: criarCartao("Intervalo de 80%"),
    classe: criarCartao("Tamanho"),
    validacao: criarCartao("Erro mediano na validação"),
  };
  const fatores = h("ol", { class: "fatores", "aria-label": "Quanto cada variável moveu a previsão" });
  const contas = h("dl", { class: "contas" });

  function mostrarFatores(): void {
    const linhas = VARIAVEIS.map((v, i) => ({ v, fator: leitura.fatores[i] ?? 1 })).sort(
      (a, b) => Math.abs(Math.log10(b.fator)) - Math.abs(Math.log10(a.fator)),
    );
    fatores.replaceChildren(
      ...linhas.map(({ v, fator }) => {
        const log = Math.log10(fator);
        const fracao = Math.min(1, Math.abs(log) / LOG_DA_BARRA_CHEIA);
        return h(
          "li",
          { class: "fator", "data-variavel": v },
          h("span", { class: "fator-nome" }, NOMES_DAS_VARIAVEIS[v]),
          h(
            "span",
            { class: "fator-trilho", "aria-hidden": "true" },
            h("span", { class: `fator-barra ${log >= 0 ? "aumenta" : "diminui"}`, style: `--v: ${fracao.toFixed(3)}` }),
          ),
          h("b", { class: "fator-valor" }, textoDoFator(fator)),
        );
      }),
    );
  }

  function mostrarLeituras(): void {
    const l = leitura;
    const medido = destaque
      ? ` · raio medido de ${destaque.nome}: ${compacto(destaque.raioRterra)} × Terra (erro de ${percentual((Math.abs(l.raio - destaque.raioRterra) / destaque.raioRterra) * 100, 0)})`
      : "";
    preencher(cartoes.raio, `${compacto(l.raio)} × Terra`, `partindo de ${compacto(l.raioBase)} × Terra${medido}`);
    preencher(
      cartoes.intervalo,
      `${compacto(l.inferior)} a ${compacto(l.superior)}`,
      "dos erros em planetas fora do treino",
    );
    preencher(cartoes.classe, nomeDaClasse(l.raio), `pelo raio previsto`);
    preencher(
      cartoes.validacao,
      percentual(l.validacao.erroPercentualMediano),
      `${percentual(l.validacao.dentroDe20pct)} das previsões a menos de 20% do real`,
    );
    mostrarFatores();
    contas.replaceChildren(
      ...ROTEIRO_ML.slice(1).flatMap((p) => [h("dt", {}, p.titulo), h("dd", { class: "conta" }, p.conta(e, l))]),
    );
    const fora = VARIAVEIS.filter((v) => l.extrapolacao[v] === "fora").map((v) => NOMES_DAS_VARIAVEIS[v]);
    const borda = VARIAVEIS.filter((v) => l.extrapolacao[v] === "borda").map((v) => NOMES_DAS_VARIAVEIS[v]);
    aviso.textContent = fora.length
      ? `Fora dos dados de treino: ${fora.join(", ")}. Aqui o modelo só repete o que viu na borda; não confie na previsão.`
      : borda.length
        ? `Na borda dos dados de treino: ${borda.join(", ")}. A previsão é menos confiável.`
        : "";
    aviso.dataset.nivel = fora.length ? "fora" : borda.length ? "borda" : "dentro";
  }

  const gravarNaUrl = adiar(ESPERA_DA_URL_MS, () => {
    ctx.definirParametros({
      ...paraParametrosML(e),
      planeta: destaque?.nome ?? null,
      passo: roteiro ? String(roteiro.passo() + 1) : (ctx.parametros.passo ?? null),
    });
  });

  let ultimaChave: ChaveDaEntrada | null = null;
  const anunciar = adiar(ESPERA_DO_ANUNCIO_MS, () => {
    const inicio = ultimaChave
      ? `${LIMITES_ML[ultimaChave].rotulo}: ${formatarValorML(ultimaChave, e[ultimaChave])}. `
      : "";
    anuncio.textContent = `${inicio}Raio previsto ${compacto(leitura.raio)} vezes o da Terra, entre ${compacto(leitura.inferior)} e ${compacto(leitura.superior)}.`;
  });

  function aoMudar(chave: ChaveDaEntrada | null): void {
    leitura = lerML(modelo, e);
    controles.mostrar(e);
    mostrarLeituras();
    mostrarLigacoes();
    grafico.agendar();
    roteiro?.atualizar();
    gravarNaUrl();
    ultimaChave = chave;
    anunciar();
  }

  // ---------- Ações ----------
  const botaoCsv = h("button", { class: "botao secundario", type: "button" }, "Exportar CSV");
  botaoCsv.addEventListener("click", () => {
    baixar(nomeDoArquivo("previsao-de-raio", destaque?.nome ?? null), previsaoParaCsv(e, leitura));
    registrarEvento("ml-exportar", {});
  });
  const botaoPadrao = h("button", { class: "botao secundario", type: "button" }, "Voltar à Terra");
  botaoPadrao.addEventListener("click", () => {
    e = { ...PADRAO_ML };
    destaque = null;
    busca.limpar();
    aoMudar(null);
  });

  // ---------- Planeta do treino ----------
  const ligacoes = h("p", { class: "ligacoes-modulo", hidden: true });
  function mostrarLigacoes(): void {
    ligacoes.hidden = destaque === null;
    if (!destaque) return;
    const parametros = { planeta: destaque.nome };
    ligacoes.replaceChildren(
      "Abrir este planeta no ",
      h("a", { href: montarHash({ modulo: "transito", modo: "explorar", parametros }) }, "simulador de trânsito"),
      " ou no ",
      h(
        "a",
        { href: montarHash({ modulo: "velocidade-radial", modo: "explorar", parametros }) },
        "de velocidade radial",
      ),
      ".",
    );
  }

  function usarPlaneta(p: PlanetaDoTreino): void {
    e = entradaDoPlaneta(p, e);
    destaque = p;
    busca.estado.textContent = `${p.nome}: raio medido de ${compacto(p.raioRterra)} × Terra (círculo no gráfico). Este planeta fez parte do treino, então o erro aqui tende a ser menor que o da validação.`;
    aoMudar(null);
  }

  const busca = criarBuscaDePlaneta<PlanetaDoTreino>({
    prefixo: "ml",
    descricao: "planetas do treino",
    exemplo: "Kepler-10 b",
    carregar: () => Promise.resolve([...planetas]),
    aoEscolher: usarPlaneta,
  });

  // ---------- Roteiro ----------
  const roteiro = aprender
    ? criarRoteiro({
        passos: ROTEIRO_ML,
        inicial: lerPasso(ctx.parametros.passo, ROTEIRO_ML.length),
        estado: () => ({ s: e, l: leitura }),
        aoTrocar(_passo, chaves) {
          controles.filtrar(chaves);
          gravarNaUrl();
        },
        irParaExplorar() {
          location.hash = montarHash({ modulo: "ml", modo: "explorar", parametros: semNulos(paraParametrosML(e)) });
        },
        telemetria: "ml-passo",
      })
    : null;

  const raiz = h(
    "div",
    { class: "simulador ml", "data-modo": ctx.modo },
    h(
      "header",
      { class: "hero hero-modulo" },
      h("h1", {}, "Machine learning interativo"),
      h(
        "p",
        { class: "lead" },
        aprender
          ? "Um passo de cada vez: o que o modelo usa para estimar o raio de um planeta, quanto confiar nele e onde ele deixa de valer."
          : "O modelo que estima o raio a partir da massa, da órbita e da estrela, rodando no seu navegador. Cada previsão vem com intervalo e com o peso de cada variável.",
      ),
    ),
    roteiro?.elemento,
    h(
      "div",
      { class: "sim-grade" },
      h(
        "section",
        { class: "sim-vistas painel", "aria-label": "Previsão" },
        h(
          "div",
          { class: "cartoes cartoes-ml" },
          cartoes.raio.elemento,
          cartoes.intervalo.elemento,
          cartoes.classe.elemento,
        ),
        aviso,
        grafico.elemento,
        h("h2", { class: "subtitulo" }, "O que puxou a previsão"),
        fatores,
      ),
      h(
        "section",
        { class: "sim-controles painel", "aria-label": "Controles" },
        aprender ? null : busca.formulario,
        aprender ? null : ligacoes,
        controles.lista,
        h("div", { class: "sim-acoes" }, botaoCsv, aprender ? null : botaoPadrao),
      ),
    ),
    aprender
      ? null
      : h(
          "section",
          { class: "secao secao-curta", "aria-labelledby": "t-contas-ml" },
          h(
            "header",
            {},
            h("h2", { id: "t-contas-ml" }, "Como ler o modelo"),
            h("p", {}, "As mesmas explicações do modo Aprender, com a previsão atual."),
          ),
          h("div", { class: "cartoes" }, cartoes.validacao.elemento),
          contas,
        ),
    anuncio,
  );

  // Link com um planeta do treino: aplica os valores dele, a não ser que a URL já traga outros.
  const pedido = ctx.parametros.planeta;
  const achado = pedido ? planetas.find((p) => p.nome === pedido) : undefined;
  if (achado && !aprender) {
    busca.campo.value = achado.nome;
    if (Object.keys(semNulos(paraParametrosML(e))).length === 0) usarPlaneta(achado);
    else destaque = achado;
  }

  leitura = lerML(modelo, e);
  controles.mostrar(e);
  mostrarLeituras();
  mostrarLigacoes();
  return raiz;
}

export async function montar(ctx: ContextoDoModulo): Promise<void> {
  await carregarSecao({
    host: ctx.host,
    nome: "ml",
    carregar: (aoProgredir) =>
      Promise.all([carregarModeloRaio({ aoProgredir }), carregarPlanetasDoTreino()]).then(([modelo, planetas]) => ({
        modelo,
        planetas,
      })),
    renderizar: (dados) => montarML(ctx, dados),
  });
}
