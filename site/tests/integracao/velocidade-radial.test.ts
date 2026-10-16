import { afterEach, describe, expect, it, vi } from "vitest";
import type { Modo } from "../../src/lib/modulos";
import { lerSimulacaoVR, lerVR, type PlanetaComMassa } from "../../src/lib/simulacao-velocidade-radial";
import { formatarValorVR, montarSimuladorVR } from "../../src/ui/velocidade-radial";
import { rotuloDeVelocidade } from "../../src/ui/vr-desenho";
import { ROTEIRO_VR } from "../../src/ui/vr-roteiro";
import { esperarAte } from "./fixtures";

/** K de 51 Pegasi b no padrão, como o cartão mostra (sai da física, não é digitado). */
const K_DO_PADRAO = rotuloDeVelocidade(lerVR(lerSimulacaoVR({})).semiAmplitudeMs).replace("+", "");

const CATALOGO: PlanetaComMassa[] = [
  {
    nome: "Com trânsito b",
    periodoDias: 0.837491,
    massaMterra: 3.24,
    massaVerdadeira: true,
    massaEstrelaMsol: 0.91,
    excentricidade: 0,
    raioRterra: 1.47,
  },
  {
    nome: "Só velocidade b",
    periodoDias: 61.1,
    massaMterra: 723,
    massaVerdadeira: false,
    massaEstrelaMsol: 0.32,
    excentricidade: null,
    raioRterra: null,
  },
];

function abrir(modo: Modo, parametros: Record<string, string> = {}, falhar = false) {
  const definirParametros = vi.fn();
  const baixar = vi.fn();
  const carregarCatalogo = vi.fn(() => (falhar ? Promise.reject(new Error("sem rede")) : Promise.resolve(CATALOGO)));
  const raiz = montarSimuladorVR({ modo, parametros, definirParametros }, { carregarCatalogo, baixar });
  document.body.replaceChildren(raiz);
  return { raiz, definirParametros, baixar };
}

function cartao(raiz: HTMLElement, rotulo: string): { valor: string; detalhe: string } {
  const alvo = Array.from(raiz.querySelectorAll(".cartao")).find((c) => c.textContent?.includes(rotulo));
  return {
    valor: alvo?.querySelector(".valor")?.textContent ?? "",
    detalhe: alvo?.querySelector(".detalhe")?.textContent ?? "",
  };
}

function mexer(raiz: HTMLElement, id: string, valor: number): void {
  const entrada = raiz.querySelector<HTMLInputElement>(`#${id}`);
  if (!entrada) throw new Error(`sem ${id}`);
  entrada.value = String(valor);
  entrada.dispatchEvent(new Event("input", { bubbles: true }));
}

async function carregar(raiz: HTMLElement, nome: string): Promise<void> {
  const campo = raiz.querySelector<HTMLInputElement>("#vr-planeta");
  if (!campo) throw new Error("sem campo");
  campo.value = nome;
  raiz.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true }));
  await esperarAte(() => expect(raiz.querySelector(".busca-planeta .nota")?.textContent).toContain(nome));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("velocidade radial, modo Explorar", () => {
  it("abre com 51 Pegasi b e mostra K, massa mínima, semi-eixo e Doppler", () => {
    const { raiz } = abrir("explorar");
    expect(raiz.querySelector("h1")?.textContent).toBe("Simulador de velocidade radial");
    expect(cartao(raiz, "Semi-amplitude").valor).toBe(K_DO_PADRAO);
    expect(cartao(raiz, "Massa mínima").valor).toMatch(/× Terra$/);
    expect(cartao(raiz, "Deslocamento de H-alfa").valor).toMatch(/ pm$/);
    expect(cartao(raiz, "densidade").valor).toBe("—");
    expect(raiz.querySelectorAll(".controle-sim:not([hidden])")).toHaveLength(7);
    expect(raiz.querySelectorAll(".contas dt")).toHaveLength(ROTEIRO_VR.length - 1);
  });

  it("dobrar a massa dobra K, grava a URL e anuncia", async () => {
    const { raiz, definirParametros } = abrir("explorar");
    const antes = lerVR(lerSimulacaoVR({})).semiAmplitudeMs;
    mexer(raiz, "vr-mp", Math.log10(lerSimulacaoVR({}).massaPlanetaMterra * 2));
    const k = Number(cartao(raiz, "Semi-amplitude").valor.replace(" m/s", ""));
    expect(k / antes).toBeGreaterThan(1.97);
    expect(k / antes).toBeLessThan(2.03);
    await esperarAte(() =>
      expect(definirParametros).toHaveBeenCalledWith(expect.objectContaining({ mp: expect.any(String) })),
    );
    await esperarAte(() =>
      expect(raiz.querySelector("[data-anuncio]")?.textContent).toMatch(/^Massa do planeta: .*Semi-amplitude/),
    );
  });

  it("inclinação baixa: K cai e a massa deduzida fica menor que a verdadeira", () => {
    const { raiz } = abrir("explorar", { i: "30" });
    expect(cartao(raiz, "Massa mínima").detalhe).toContain("(× 2,00)");
    expect(raiz.querySelector<HTMLInputElement>("#vr-i")?.getAttribute("aria-valuetext")).toBe(
      formatarValorVR("inclinacaoGraus", 30),
    );
  });

  it("planeta com trânsito: densidade e link para o simulador de trânsito", async () => {
    const { raiz, definirParametros } = abrir("explorar", { i: "40" });
    await carregar(raiz, "Com trânsito b");
    expect(cartao(raiz, "densidade").valor).toMatch(/^\d,\d\d g\/cm³$/);
    expect(cartao(raiz, "densidade").detalhe).toContain("massa verdadeira");
    const link = raiz.querySelector<HTMLAnchorElement>(".ligacao-modulo");
    expect(link?.hidden).toBe(false);
    expect(link?.getAttribute("href")).toBe("#/transito?planeta=Com+tr%C3%A2nsito+b");
    expect(raiz.querySelector<HTMLInputElement>("#vr-i")?.getAttribute("aria-valuetext")).toBe("90,0°");
    await esperarAte(() =>
      expect(definirParametros).toHaveBeenCalledWith(expect.objectContaining({ planeta: "Com trânsito b", i: null })),
    );
  });

  it("planeta só com velocidade radial: sem densidade, avisa da massa mínima e da órbita circular", async () => {
    const { raiz } = abrir("explorar");
    await carregar(raiz, "Só velocidade b");
    const nota = raiz.querySelector(".busca-planeta .nota")?.textContent ?? "";
    expect(nota).toContain("massa mínima");
    expect(nota).toContain("órbita é circular");
    expect(cartao(raiz, "densidade").detalhe).toContain("não tem raio medido");
    expect(raiz.querySelector<HTMLAnchorElement>(".ligacao-modulo")?.hidden).toBe(true);
  });

  it("link só com o planeta aplica os valores dele; com valores, só compara", async () => {
    const so = abrir("explorar", { planeta: "Com trânsito b" });
    await esperarAte(() => expect(so.raiz.querySelector(".busca-planeta .nota")?.textContent).toContain("Comparando"));
    expect(so.raiz.querySelector<HTMLInputElement>("#vr-p")?.getAttribute("aria-valuetext")).toBe("0,837 dias");

    const comValores = abrir("explorar", { planeta: "Com trânsito b", p: "10" });
    await esperarAte(() =>
      expect(comValores.raiz.querySelector(".busca-planeta .nota")?.textContent).toContain("Comparando"),
    );
    expect(comValores.raiz.querySelector<HTMLInputElement>("#vr-p")?.getAttribute("aria-valuetext")).toBe("10,0 dias");

    const sem = abrir("explorar", { planeta: "Ninguém b" });
    await esperarAte(() =>
      expect(sem.raiz.querySelector(".busca-planeta .nota")?.textContent).toContain("não tem massa"),
    );
  });

  it("catálogo fora do ar não quebra o simulador", async () => {
    const { raiz } = abrir("explorar", {}, true);
    const campo = raiz.querySelector<HTMLInputElement>("#vr-planeta");
    if (!campo) throw new Error("sem campo");
    campo.value = "Com trânsito b";
    campo.dispatchEvent(new Event("change"));
    await esperarAte(() => expect(raiz.querySelector(".busca-planeta .nota")?.textContent).toMatch(/Não foi possível/));
    expect(cartao(raiz, "Semi-amplitude").valor).toBe(K_DO_PADRAO);
  });

  it("exporta CSV, sorteia outro ruído, anima e volta ao início", () => {
    const { raiz, baixar } = abrir("explorar", { ruido: "5", e: "0.3" });
    const botao = (texto: string) => Array.from(raiz.querySelectorAll("button")).find((b) => b.textContent === texto);
    botao("Exportar CSV")?.click();
    const [nome, csv] = baixar.mock.calls[0] as [string, string];
    expect(nome).toBe("velocidade-radial-simulacao.csv");
    expect(csv.split("\n")[0]).toBe("fase,tempo_dias,velocidade_medida_ms,velocidade_modelo_ms");
    botao("Nova amostra de ruído")?.click();
    botao("Exportar CSV")?.click();
    expect(baixar.mock.calls[1]?.[1]).not.toBe(csv);

    mexer(raiz, "vr-tempo", 0.5);
    expect(raiz.querySelector("#vr-tempo")?.getAttribute("aria-valuetext")).toMatch(/^50% da órbita, estrela a /);
    const animar = botao("Animar");
    animar?.click();
    expect(animar?.getAttribute("aria-pressed")).toBe("true");
    animar?.click();
    expect(animar?.getAttribute("aria-pressed")).toBe("false");

    botao("Voltar ao início")?.click();
    expect(cartao(raiz, "Semi-amplitude").valor).toBe(K_DO_PADRAO);
  });
});

describe("velocidade radial, modo Aprender", () => {
  it("passo a passo, com os controles de cada passo", async () => {
    const { raiz, definirParametros } = abrir("aprender");
    expect(raiz.querySelector(".roteiro h2")?.textContent).toBe(ROTEIRO_VR[0]?.titulo);
    expect(raiz.querySelectorAll(".controle-sim:not([hidden])")).toHaveLength(0);
    expect(raiz.querySelector("#vr-planeta")).toBeNull();
    for (let i = 1; i < 3; i++) {
      Array.from(raiz.querySelectorAll(".roteiro button"))
        .find((b) => b.textContent === "Próximo")
        ?.dispatchEvent(new Event("click"));
    }
    expect(raiz.querySelector(".roteiro h2")?.textContent).toBe(ROTEIRO_VR[2]?.titulo);
    const visiveis = Array.from(raiz.querySelectorAll<HTMLElement>(".controle-sim:not([hidden])"));
    expect(visiveis.map((v) => v.dataset.controle)).toEqual(["massaPlanetaMterra", "periodoDias"]);
    await esperarAte(() => expect(definirParametros).toHaveBeenCalledWith(expect.objectContaining({ passo: "3" })));
  });

  it("a conta da inclinação acompanha o controle, e o último passo leva ao Explorar", () => {
    const { raiz } = abrir("aprender", { passo: "5" });
    const conta = () => raiz.querySelector(".roteiro [data-conta]")?.textContent ?? "";
    expect(conta()).toContain("= 1,00)");
    mexer(raiz, "vr-i", 30);
    expect(conta()).toContain("= 2,00)");

    const ultimo = abrir("aprender", { passo: "99", e: "0.2" });
    Array.from(ultimo.raiz.querySelectorAll<HTMLButtonElement>(".roteiro button"))
      .find((b) => b.textContent === "Explorar à vontade")
      ?.click();
    expect(location.hash).toBe("#/velocidade-radial?e=0.2");
  });

  it("todas as contas saem sem NaN, de órbita circular a muito excêntrica", () => {
    for (const p of [{}, { e: "0.9", w: "200" }, { i: "1", ruido: "200" }, { mp: "0.01", p: "100000" }]) {
      const s = lerSimulacaoVR(p);
      const l = lerVR(s);
      for (const passo of ROTEIRO_VR) {
        const texto = passo.conta(s, l);
        expect(texto).not.toMatch(/NaN|undefined|Infinity/);
      }
      for (const passo of ROTEIRO_VR) expect(passo.texto).not.toMatch(/NaN|undefined/);
    }
  });
});
