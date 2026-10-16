import { afterEach, describe, expect, it, vi } from "vitest";
import type { Modo } from "../../src/lib/modulos";
import { ler, lerSimulacao, type PlanetaDeTransito } from "../../src/lib/simulacao-transito";
import { formatarValor, montarSimulador } from "../../src/ui/transito";
import { ROTEIRO } from "../../src/ui/transito-roteiro";
import { esperarAte } from "./fixtures";

const CATALOGO: PlanetaDeTransito[] = [
  {
    nome: "HD 209458 b",
    periodoDias: 3.524749,
    raioRterra: 15.58,
    raioEstrelaRsol: 1.19,
    semiEixoUA: 0.04707,
    semiEixoCalculado: false,
  },
  {
    nome: "TRAPPIST-1 e",
    periodoDias: 6.101013,
    raioRterra: 0.92,
    raioEstrelaRsol: 0.1192,
    semiEixoUA: 0.02925,
    semiEixoCalculado: false,
  },
];

function abrir(modo: Modo, parametros: Record<string, string> = {}, extras: { falhar?: boolean } = {}) {
  const definirParametros = vi.fn();
  const baixar = vi.fn();
  const carregarCatalogo = vi.fn(() =>
    extras.falhar ? Promise.reject(new Error("sem rede")) : Promise.resolve(CATALOGO),
  );
  const raiz = montarSimulador({ modo, parametros, definirParametros }, { carregarCatalogo, baixar });
  document.body.replaceChildren(raiz);
  return { raiz, definirParametros, baixar, carregarCatalogo };
}

function controle(raiz: HTMLElement, url: string): HTMLInputElement {
  const el = raiz.querySelector<HTMLInputElement>(`#transito-${url}`);
  if (!el) throw new Error(`sem controle ${url}`);
  return el;
}

function mexer(entrada: HTMLInputElement, valor: number): void {
  entrada.value = String(valor);
  entrada.dispatchEvent(new Event("input", { bubbles: true }));
}

function cartao(raiz: HTMLElement, rotulo: string): string {
  const alvo = Array.from(raiz.querySelectorAll(".cartao")).find((c) => c.textContent?.includes(rotulo));
  return alvo?.querySelector(".valor")?.textContent ?? "";
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("simulador de trânsito, modo Explorar", () => {
  it("abre com HD 209458 b em trânsito central e mostra profundidade, duração e as contas", () => {
    const { raiz } = abrir("explorar");
    expect(raiz.querySelector("h1")?.textContent).toBe("Simulador de trânsito");
    expect(cartao(raiz, "Profundidade")).toBe("1,44%");
    expect(cartao(raiz, "Parâmetro de impacto")).toBe("0,00");
    expect(cartao(raiz, "Duração")).toMatch(/^\d,\d\d h$/);
    expect(raiz.querySelectorAll(".contas dt")).toHaveLength(ROTEIRO.length - 1);
    expect(raiz.querySelectorAll(".controle-sim:not([hidden])")).toHaveLength(8);
    expect(raiz.querySelector(".roteiro")).toBeNull();
  });

  it("mudar um controle recalcula a leitura, grava a URL e anuncia o novo valor", async () => {
    const { raiz, definirParametros } = abrir("explorar");
    const rp = controle(raiz, "rp");
    mexer(rp, Math.log10(31.16)); // o dobro do raio: a queda fica quatro vezes maior
    expect(cartao(raiz, "Profundidade")).toBe("5,76%");
    expect(rp.getAttribute("aria-valuetext")).toBe(formatarValor("raioPlanetaRterra", 31.16));
    await esperarAte(() => expect(definirParametros).toHaveBeenCalledWith(expect.objectContaining({ rp: "31.16" })));
    await esperarAte(() =>
      expect(raiz.querySelector("[data-anuncio-transito]")?.textContent).toMatch(
        /^Raio do planeta: .*Profundidade 5,76%/,
      ),
    );
  });

  it("inclinação baixa: avisa que não há trânsito", () => {
    const { raiz } = abrir("explorar", { i: "75" });
    expect(cartao(raiz, "Profundidade")).toBe("sem trânsito");
    expect(raiz.querySelector(".aviso-transito")?.textContent).toMatch(/não há trânsito/);
  });

  it("órbita dentro da estrela: avisa que o sistema não é possível", () => {
    const { raiz } = abrir("explorar", { a: "0.003", rs: "5" });
    expect(raiz.querySelector(".aviso-transito")?.textContent).toMatch(/dentro da estrela/);
  });

  it("carrega um planeta do catálogo e compara com ele", async () => {
    const { raiz, definirParametros, carregarCatalogo } = abrir("explorar", { i: "85" });
    const campo = raiz.querySelector<HTMLInputElement>("#transito-planeta");
    if (!campo) throw new Error("sem campo");
    campo.value = "trappist-1 e";
    raiz.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true }));
    await esperarAte(() => expect(controle(raiz, "rs").getAttribute("aria-valuetext")).toBe("0,119 × Sol"));
    expect(controle(raiz, "i").getAttribute("aria-valuetext")).toBe("90,00°");
    expect(raiz.querySelector(".busca-planeta .nota")?.textContent).toMatch(/^TRAPPIST-1 e: valores do catálogo/);
    expect(raiz.textContent).toContain("TRAPPIST-1 e no catálogo");
    expect(raiz.querySelectorAll("#transito-lista-planetas option")).toHaveLength(2);
    await esperarAte(() =>
      expect(definirParametros).toHaveBeenCalledWith(expect.objectContaining({ planeta: "TRAPPIST-1 e", i: null })),
    );
    expect(carregarCatalogo).toHaveBeenCalledTimes(1);
  });

  it("planeta que não existe e catálogo fora do ar dão mensagem, sem quebrar", async () => {
    const ok = abrir("explorar");
    const campo = ok.raiz.querySelector<HTMLInputElement>("#transito-planeta");
    if (!campo) throw new Error("sem campo");
    campo.value = "Planeta X";
    campo.dispatchEvent(new Event("change"));
    await esperarAte(() => expect(ok.raiz.querySelector(".busca-planeta .nota")?.textContent).toMatch(/Não achei/));

    const fora = abrir("explorar", {}, { falhar: true });
    const campo2 = fora.raiz.querySelector<HTMLInputElement>("#transito-planeta");
    if (!campo2) throw new Error("sem campo");
    campo2.value = "HD 209458 b";
    campo2.dispatchEvent(new Event("change"));
    await esperarAte(() =>
      expect(fora.raiz.querySelector(".busca-planeta .nota")?.textContent).toMatch(/Não foi possível/),
    );
    expect(cartao(fora.raiz, "Profundidade")).toBe("1,44%");
  });

  it("link com planeta traz a comparação sem trocar os valores da URL", async () => {
    const { raiz } = abrir("explorar", { planeta: "HD 209458 b", rp: "2" });
    await esperarAte(() => expect(raiz.textContent).toContain("HD 209458 b no catálogo: 1,44%"));
    expect(controle(raiz, "rp").getAttribute("aria-valuetext")).toBe("2,00 × Terra");
  });

  it("exporta a curva em CSV e sorteia outro ruído", () => {
    const { raiz, baixar } = abrir("explorar", { ruido: "500" });
    const botoes = Array.from(raiz.querySelectorAll("button"));
    botoes.find((b) => b.textContent === "Exportar CSV")?.click();
    expect(baixar).toHaveBeenCalledTimes(1);
    const [nome, csv] = baixar.mock.calls[0] as [string, string];
    expect(nome).toBe("curva-de-luz-simulacao.csv");
    expect(csv.split("\n")[0]).toBe("tempo_horas,fluxo_medido,fluxo_modelo");
    expect(csv.trim().split("\n")).toHaveLength(301);

    const ruido = botoes.find((b) => b.textContent === "Nova amostra de ruído");
    expect(ruido?.disabled).toBe(false);
    ruido?.click();
    botoes.find((b) => b.textContent === "Exportar CSV")?.click();
    expect(baixar.mock.calls[1]?.[1]).not.toBe(csv);
  });

  it("o tempo move o planeta e anima com o botão", () => {
    const { raiz } = abrir("explorar");
    const tempo = raiz.querySelector<HTMLInputElement>("#transito-tempo");
    if (!tempo) throw new Error("sem tempo");
    mexer(tempo, -1);
    expect(raiz.querySelector("#transito-tempo-saida")?.textContent).toMatch(/^−\d,\d\d h$/);
    expect(tempo.getAttribute("aria-valuetext")).toMatch(/brilho 100,000%/);
    const animar = Array.from(raiz.querySelectorAll("button")).find((b) => b.textContent === "Animar");
    animar?.click();
    expect(animar?.getAttribute("aria-pressed")).toBe("true");
    expect(animar?.textContent).toBe("Pausar");
    animar?.click();
    expect(animar?.getAttribute("aria-pressed")).toBe("false");
  });

  it("voltar ao início desfaz tudo", () => {
    const { raiz } = abrir("explorar", { rp: "3", i: "80" });
    Array.from(raiz.querySelectorAll("button"))
      .find((b) => b.textContent === "Voltar ao início")
      ?.click();
    expect(cartao(raiz, "Profundidade")).toBe("1,44%");
  });
});

describe("simulador de trânsito, modo Aprender", () => {
  it("começa no primeiro passo, só com o tempo, e avança mostrando o controle do passo", async () => {
    const { raiz, definirParametros } = abrir("aprender");
    expect(raiz.querySelector(".roteiro h2")?.textContent).toBe(ROTEIRO[0]?.titulo);
    expect(raiz.querySelector(".roteiro-passo")?.textContent).toBe(`Passo 1 de ${ROTEIRO.length}`);
    expect(raiz.querySelectorAll(".controle-sim:not([hidden])")).toHaveLength(0);
    expect(raiz.querySelector("#transito-planeta")).toBeNull();

    Array.from(raiz.querySelectorAll(".roteiro button"))
      .find((b) => b.textContent === "Próximo")
      ?.dispatchEvent(new Event("click"));
    expect(raiz.querySelector(".roteiro h2")?.textContent).toBe(ROTEIRO[1]?.titulo);
    const visiveis = Array.from(raiz.querySelectorAll<HTMLElement>(".controle-sim:not([hidden])"));
    expect(visiveis.map((v) => v.dataset.controle)).toEqual(["raioPlanetaRterra"]);
    await esperarAte(() => expect(definirParametros).toHaveBeenCalledWith(expect.objectContaining({ passo: "2" })));
  });

  it("a conta do passo acompanha o controle", () => {
    const { raiz } = abrir("aprender", { passo: "2" });
    const conta = () => raiz.querySelector(".roteiro [data-conta]")?.textContent ?? "";
    expect(conta()).toMatch(/= 1,44%$/);
    mexer(controle(raiz, "rp"), Math.log10(31.16));
    expect(conta()).toMatch(/= 5,76%$/);
  });

  it("passo fora da faixa vira o mais próximo, e o último leva ao modo Explorar", () => {
    const { raiz } = abrir("aprender", { passo: "99", rp: "4" });
    expect(raiz.querySelector(".roteiro-passo")?.textContent).toBe(`Passo ${ROTEIRO.length} de ${ROTEIRO.length}`);
    const botoes = Array.from(raiz.querySelectorAll<HTMLButtonElement>(".roteiro button"));
    botoes.find((b) => b.textContent === "Explorar à vontade")?.click();
    // Explorar é o modo padrão, então não aparece na URL.
    expect(location.hash).toBe("#/transito?rp=4");
    expect(abrir("aprender", { passo: "1" }).raiz.querySelector<HTMLButtonElement>(".roteiro button")?.disabled).toBe(
      true,
    );
  });

  it("todos os passos têm conta sem NaN, com e sem trânsito", () => {
    for (const parametros of [{}, { i: "75" }, { u1: "0.5", ruido: "800" }, { a: "0.003", rs: "5" }]) {
      const s = lerSimulacao(parametros);
      const l = ler(s);
      for (const passo of ROTEIRO) {
        const texto = passo.conta(s, l);
        expect(texto).not.toMatch(/NaN|undefined|Infinity/);
        expect(texto.length).toBeGreaterThan(10);
      }
    }
  });
});
