import { expect, type Page, test } from "@playwright/test";
import { fracaoDoBrilho } from "../../src/lib/formato";
import { ler, PADRAO, simulacaoDoPlaneta } from "../../src/lib/simulacao-transito";
import { ROTEIRO } from "../../src/ui/transito-roteiro";
import { transitos } from "./dados";

function vigiar(page: Page) {
  const problemas: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problemas.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problemas.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400) problemas.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  return problemas;
}

const profundidade = (page: Page) => page.locator(".cartao", { hasText: "Profundidade" }).locator(".valor");

test.describe("simulador de trânsito", () => {
  test("abre pelo cartão do início, desenha as vistas e mostra a profundidade do padrão", async ({ page }) => {
    const problemas = vigiar(page);
    await page.goto("/");
    await page
      .getByRole("link", { name: /Simulador de trânsito/ })
      .first()
      .click();
    await expect(page).toHaveURL(/#\/transito$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Simulador de trânsito");
    await expect(profundidade(page)).toHaveText(fracaoDoBrilho(ler(PADRAO).profundidade));
    for (const classe of [".vista-estrela canvas", ".vista-curva canvas"]) {
      const caixa = await page.locator(classe).boundingBox();
      expect(caixa?.width).toBeGreaterThan(200);
      expect(caixa?.height).toBeGreaterThan(150);
    }
    expect(problemas).toEqual([]);
  });

  test("mexer num controle pelo teclado muda a curva e vai para a URL", async ({ page }) => {
    await page.goto("/#/transito");
    const antes = await profundidade(page).textContent();
    await page.locator("#transito-rp").focus();
    for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowRight");
    await expect(profundidade(page)).not.toHaveText(antes ?? "");
    await expect(page).toHaveURL(/rp=/);
    await expect(page.locator("[data-anuncio-transito]")).toContainText("Raio do planeta");
    // A mesma URL reabre o mesmo estado.
    const depois = await profundidade(page).textContent();
    await page.reload();
    await expect(profundidade(page)).toHaveText(depois ?? "");
  });

  test("carrega um planeta real do catálogo", async ({ page }) => {
    // HD 209458 b, o padrão, foi descoberto por velocidade radial e por isso não está na lista de trânsitos.
    const hd = transitos().find((p) => p.nome === "Kepler-7 b");
    if (!hd) throw new Error("Kepler-7 b não está no transitos.json");
    await page.goto("/#/transito?rp=3&i=86");
    await page.locator("#transito-planeta").fill(hd.nome);
    await page.getByRole("button", { name: "Carregar" }).click();
    await expect(page.locator(".busca-planeta .nota")).toContainText(`${hd.nome}: valores do catálogo`);
    await expect(profundidade(page)).toHaveText(fracaoDoBrilho(ler(simulacaoDoPlaneta(hd, PADRAO)).profundidade));
    await expect(page).toHaveURL(/planeta=Kepler-7\+b/);
  });

  test("exporta a curva em CSV", async ({ page }) => {
    await page.goto("/#/transito?ruido=300");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Exportar CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("curva-de-luz-simulacao.csv");
    const caminho = await download.path();
    const { readFileSync } = await import("node:fs");
    const linhas = readFileSync(caminho, "utf-8").trim().split("\n");
    expect(linhas[0]).toBe("tempo_horas,fluxo_medido,fluxo_modelo");
    expect(linhas.length).toBeGreaterThan(100);
  });

  test("modo Aprender: roteiro passo a passo, e trocar de modo preserva o estado", async ({ page }) => {
    await page.goto("/#/transito?modo=aprender&rp=5");
    await expect(page.locator(".roteiro h2")).toHaveText(ROTEIRO[0]?.titulo ?? "");
    await page.getByRole("button", { name: "Próximo" }).click();
    await expect(page.locator(".roteiro h2")).toHaveText(ROTEIRO[1]?.titulo ?? "");
    await expect(page.locator(".roteiro h2")).toBeFocused();
    await expect(page.locator(".controle-sim:visible")).toHaveCount(1);
    await expect(page).toHaveURL(/passo=2/);
    await page.getByRole("button", { name: "Explorar" }).click();
    await expect(page.locator(".roteiro")).toHaveCount(0);
    await expect(page.locator("#transito-rp")).toHaveAttribute("aria-valuetext", /^5,00/);
  });

  test("com movimento reduzido nada anima sozinho, e a página não rola na horizontal", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#/transito");
    await expect(page.getByRole("button", { name: "Animar" })).toHaveAttribute("aria-pressed", "false");
    const tempo = await page.locator("#transito-tempo").inputValue();
    await page.waitForTimeout(300);
    expect(await page.locator("#transito-tempo").inputValue()).toBe(tempo);
    const larguras = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(larguras[0]).toBeLessThanOrEqual(larguras[1] ?? 0);
  });
});
