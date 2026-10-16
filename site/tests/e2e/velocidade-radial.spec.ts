import { expect, type Page, test } from "@playwright/test";
import { decimal } from "../../src/lib/formato";
import { densidadeDoPlaneta, lerVR, PADRAO_VR } from "../../src/lib/simulacao-velocidade-radial";
import { rotuloDeVelocidade } from "../../src/ui/vr-desenho";
import { ROTEIRO_VR } from "../../src/ui/vr-roteiro";
import { transitos, velocidades } from "./dados";

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

const valor = (page: Page, rotulo: string) => page.locator(".cartao", { hasText: rotulo }).locator(".valor");

test.describe("simulador de velocidade radial", () => {
  test("abre pelo cartão do início, desenha as vistas e mostra o K do padrão", async ({ page }) => {
    const problemas = vigiar(page);
    await page.goto("/");
    await page
      .getByRole("link", { name: /Simulador de velocidade radial/ })
      .first()
      .click();
    await expect(page).toHaveURL(/#\/velocidade-radial$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Simulador de velocidade radial");
    await expect(valor(page, "Semi-amplitude")).toHaveText(
      rotuloDeVelocidade(lerVR(PADRAO_VR).semiAmplitudeMs).replace("+", ""),
    );
    for (const classe of [".vista-orbita canvas", ".vista-curva canvas"]) {
      const caixa = await page.locator(classe).boundingBox();
      expect(caixa?.width).toBeGreaterThan(200);
      expect(caixa?.height).toBeGreaterThan(150);
    }
    expect(problemas).toEqual([]);
  });

  test("mexer na inclinação pelo teclado muda K e vai para a URL", async ({ page }) => {
    await page.goto("/#/velocidade-radial");
    const antes = await valor(page, "Semi-amplitude").textContent();
    await page.locator("#vr-i").focus();
    for (let i = 0; i < 30; i++) await page.keyboard.press("PageDown");
    await expect(valor(page, "Semi-amplitude")).not.toHaveText(antes ?? "");
    await expect(page).toHaveURL(/i=/);
    await expect(page.locator("[data-anuncio]")).toContainText("Inclinação");
  });

  test("planeta com trânsito: densidade, e o link abre o mesmo planeta no trânsito", async ({ page }) => {
    const nomesDeTransito = new Set(transitos().map((p) => p.nome));
    const kepler10 = velocidades().find((p) => p.nome === "Kepler-10 b");
    if (!kepler10 || !nomesDeTransito.has(kepler10.nome)) throw new Error("Kepler-10 b precisa estar nas duas listas");
    const densidade = densidadeDoPlaneta(kepler10);
    await page.goto("/#/velocidade-radial");
    await page.locator("#vr-planeta").fill(kepler10.nome);
    await page.getByRole("button", { name: "Carregar" }).click();
    await expect(valor(page, "densidade")).toHaveText(`${decimal(densidade?.gcm3 ?? 0, 2)} g/cm³`);
    await page.getByRole("link", { name: "Abrir este planeta no simulador de trânsito" }).click();
    await expect(page).toHaveURL(/#\/transito\?.*planeta=Kepler-10\+b/);
    await expect(page.locator("#transito-rp")).toHaveAttribute("aria-valuetext", /^1,47/);
    await page.getByRole("link", { name: "Ver a massa no simulador de velocidade radial" }).click();
    await expect(page).toHaveURL(/#\/velocidade-radial/);
  });

  test("exporta a curva em CSV", async ({ page }) => {
    await page.goto("/#/velocidade-radial?ruido=4");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Exportar CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("velocidade-radial-simulacao.csv");
  });

  test("modo Aprender: roteiro, e trocar de modo preserva o estado", async ({ page }) => {
    await page.goto("/#/velocidade-radial?modo=aprender&e=0.3");
    await expect(page.locator(".roteiro h2")).toHaveText(ROTEIRO_VR[0]?.titulo ?? "");
    await page.getByRole("button", { name: "Próximo" }).click();
    await expect(page.locator(".roteiro h2")).toHaveText(ROTEIRO_VR[1]?.titulo ?? "");
    await expect(page).toHaveURL(/passo=2/);
    await page.getByRole("button", { name: "Explorar" }).click();
    await expect(page.locator("#vr-e")).toHaveAttribute("aria-valuetext", "0,30");
  });

  test("com movimento reduzido nada anima sozinho, e a página não rola na horizontal", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#/velocidade-radial");
    const tempo = await page.locator("#vr-tempo").inputValue();
    await page.waitForTimeout(300);
    expect(await page.locator("#vr-tempo").inputValue()).toBe(tempo);
    const larguras = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(larguras[0]).toBeLessThanOrEqual(larguras[1] ?? 0);
  });
});
