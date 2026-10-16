import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { compacto } from "../../src/lib/formato";
import { lerML, lerModelo, lerPlanetasDoTreino, PADRAO_ML } from "../../src/lib/modelo-raio";
import { ROTEIRO_ML } from "../../src/ui/ml-roteiro";

const PASTA = new URL("../../public/dados/", import.meta.url);
const modelo = lerModelo(JSON.parse(readFileSync(new URL("modelo-raio.json", PASTA), "utf-8")));
const planetas = lerPlanetasDoTreino(JSON.parse(readFileSync(new URL("modelo-planetas.json", PASTA), "utf-8")));

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

const valor = (page: Page, rotulo: string) => page.locator(".cartao", { hasText: rotulo }).first().locator(".valor");

test.describe("ML interativo", () => {
  test("abre pelo cartão, baixa o modelo e prevê o mesmo raio que o Python preveria", async ({ page }) => {
    const problemas = vigiar(page);
    await page.goto("/");
    await page
      .getByRole("link", { name: /Machine learning interativo/ })
      .first()
      .click();
    await expect(page).toHaveURL(/#\/ml$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Machine learning interativo");
    await expect(valor(page, "Raio previsto")).toHaveText(`${compacto(lerML(modelo, PADRAO_ML).raio)} × Terra`);
    await expect(page.locator(".fator")).toHaveCount(6);
    const caixa = await page.locator(".grafico-ml canvas").boundingBox();
    expect(caixa?.height).toBeGreaterThan(200);
    expect(problemas).toEqual([]);
  });

  test("mexer na massa pelo teclado muda a previsão e vai para a URL", async ({ page }) => {
    await page.goto("/#/ml");
    const antes = await valor(page, "Raio previsto").textContent();
    await page.locator("#ml-mp").focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press("PageUp");
    await expect(valor(page, "Raio previsto")).not.toHaveText(antes ?? "");
    await expect(page).toHaveURL(/mp=/);
  });

  test("planeta do treino: raio medido e caminho para os simuladores", async ({ page }) => {
    const p = planetas.find((x) => x.nome === "Kepler-7 b");
    if (!p) throw new Error("Kepler-7 b precisa estar no treino");
    await page.goto("/#/ml");
    await page.locator("#ml-planeta").fill(p.nome);
    await page.getByRole("button", { name: "Carregar" }).click();
    await expect(page.locator(".cartao", { hasText: "Raio previsto" }).first()).toContainText(
      `raio medido de ${p.nome}: ${compacto(p.raioRterra)} × Terra`,
    );
    await page.locator(".ligacoes-modulo").getByRole("link", { name: "simulador de trânsito" }).click();
    await expect(page).toHaveURL(/#\/transito\?planeta=Kepler-7\+b/);
  });

  test("fora dos dados de treino, avisa", async ({ page }) => {
    await page.goto("/#/ml?p=9000");
    await expect(page.locator(".aviso-sim")).toHaveAttribute("data-nivel", "fora");
  });

  test("modo Aprender: roteiro e troca de modo com o estado", async ({ page }) => {
    await page.goto("/#/ml?modo=aprender&mp=20");
    await expect(page.locator(".roteiro h2")).toHaveText(ROTEIRO_ML[0]?.titulo ?? "");
    await page.getByRole("button", { name: "Próximo" }).click();
    await expect(page.locator(".roteiro h2")).toHaveText(ROTEIRO_ML[1]?.titulo ?? "");
    await page.getByRole("button", { name: "Explorar" }).click();
    await expect(page.locator("#ml-mp")).toHaveAttribute("aria-valuetext", "20,0 × Terra");
  });

  test("no celular a página não rola na horizontal", async ({ page }) => {
    await page.goto("/#/ml");
    await page.locator(".fator").first().waitFor();
    const larguras = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(larguras[0]).toBeLessThanOrEqual(larguras[1] ?? 0);
  });
});
