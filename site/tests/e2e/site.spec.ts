import { expect, type Page, test } from "@playwright/test";
import { escalaLog } from "../../src/lib/escala";
import { milhar } from "../../src/lib/formato";
import { paraMs } from "../../src/lib/tempo";
import { DOMINIO_PERIODO, DOMINIO_RAIO, MARGEM } from "../../src/ui/grafico-periodo-raio";
import { metricas, planetas } from "./dados";

const todos = planetas();

/** Falhas que o teste não deve ignorar: erros no console, exceções e requisições que falham. */
function vigiar(page: Page) {
  const problemas: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problemas.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problemas.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => problemas.push(`requestfailed: ${r.url()}`));
  page.on("response", (r) => {
    if (r.status() >= 400) problemas.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  return problemas;
}

/** As seções carregam sob demanda: em telas altas o explorador já está perto, em celular é preciso rolar. */
async function irParaExplorar(page: Page) {
  await page.goto("/#/catalogo");
  await page.locator("#explorar").scrollIntoViewIfNeeded();
  await page.locator("#explorar canvas").waitFor();
}

test.describe("carregamento", () => {
  test("a página carrega sem erros e mostra os números do pipeline", async ({ page }) => {
    const problemas = vigiar(page);
    await page.goto("/#/catalogo");
    await expect(page).toHaveTitle(/Exoplanetas/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Os mundos além do Sol");
    const m = metricas();
    const cartoes = page.locator(".cartoes .cartao");
    await expect(cartoes).toHaveCount(4);
    await expect(cartoes.first()).toContainText(milhar(m.dados.planetas));
    await expect(cartoes.first()).toContainText(`em ${milhar(m.dados.estrelas)} estrelas`);
    await expect(cartoes.nth(2)).toContainText(String(m.descobertas.ano_de_pico));
    await expect(page.locator("#coleta")).toContainText("Coleta de");
    expect(problemas).toEqual([]);
  });

  test("mostra skeleton e progresso enquanto os dados não chegam, e troca pelo conteúdo", async ({ page }) => {
    let liberar: () => void = () => {};
    const segurar = new Promise<void>((r) => (liberar = r));
    await page.route("**/dados/planetas.json", async (rota) => {
      await segurar;
      await rota.continue();
    });
    await page.goto("/#/catalogo");
    await page.locator("#explorar").scrollIntoViewIfNeeded();
    const painel = page.locator('[data-secao="explorador"]');
    await expect(painel).toHaveAttribute("aria-busy", "true");
    await expect(painel.locator("[data-skeleton]")).toBeVisible();
    await expect(page.locator("#progresso-global")).toHaveAttribute("data-estado", "ativo");
    await expect(painel.locator("canvas")).toHaveCount(0);
    liberar();
    await expect(painel.locator("canvas")).toBeVisible();
    await expect(painel.locator("[data-skeleton]")).toHaveCount(0);
    await expect(painel).toHaveAttribute("aria-busy", "false");
    await expect(page.locator("#progresso-global")).toHaveAttribute("data-estado", "oculto");
  });

  test("lazy loading: seções distantes só baixam dados e código quando se aproximam", async ({ page }) => {
    const pedidos: string[] = [];
    page.on("request", (r) => pedidos.push(new URL(r.url()).pathname));
    await page.goto("/#/catalogo");
    await expect(page.locator(".cartoes .cartao")).toHaveCount(4);
    expect(pedidos.some((p) => p.endsWith("/dados/descobertas.json"))).toBe(false);
    expect(pedidos.some((p) => /\/assets\/descobertas-/.test(p))).toBe(false);
    expect(pedidos.some((p) => /\/assets\/terra-/.test(p))).toBe(false);
    await page.locator("#descobertas").scrollIntoViewIfNeeded();
    await expect(page.locator("#descobertas svg.grafico-barras")).toBeVisible();
    expect(pedidos.some((p) => p.endsWith("/dados/descobertas.json"))).toBe(true);
  });

  test("sem variáveis de observabilidade, nenhum SDK de fornecedor é baixado", async ({ page }) => {
    const pedidos: string[] = [];
    page.on("request", (r) => pedidos.push(new URL(r.url()).pathname));
    await page.goto("/#/catalogo");
    await page.locator("#terra").scrollIntoViewIfNeeded();
    await expect(page.locator("#terra li").first()).toBeVisible();
    for (const fornecedor of ["sentry", "datadog", "newrelic", "otel"]) {
      expect(pedidos.filter((p) => p.includes(fornecedor))).toEqual([]);
    }
  });

  test("falha ao baixar: mostra o erro e 'Tentar de novo' recupera", async ({ page }) => {
    await page.route("**/dados/planetas.json", (rota) => rota.abort());
    await page.goto("/#/catalogo");
    await page.locator("#explorar").scrollIntoViewIfNeeded();
    const painel = page.locator('[data-secao="explorador"]');
    await expect(painel.locator(".erro")).toBeVisible();
    await expect(painel.locator(".erro")).toContainText("Não foi possível carregar");
    await page.unroute("**/dados/planetas.json");
    await painel.getByRole("button", { name: "Tentar de novo" }).click();
    await expect(painel.locator("canvas")).toBeVisible();
    await expect(painel.locator(".erro")).toHaveCount(0);
  });
});

test.describe("gráfico período × raio", () => {
  test("passar o mouse sobre um planeta mostra o tooltip com os dados dele", async ({ page }) => {
    await irParaExplorar(page);
    const canvas = page.locator("#explorar canvas");
    await canvas.scrollIntoViewIfNeeded();
    const caixa = await canvas.boundingBox();
    if (!caixa) throw new Error("canvas sem caixa");
    const x = escalaLog(DOMINIO_PERIODO, [MARGEM.esquerda, caixa.width - MARGEM.direita]);
    const y = escalaLog(DOMINIO_RAIO, [caixa.height - MARGEM.base, MARGEM.topo]);
    // Um planeta isolado (o de maior período): sem vizinhos, o mais próximo é ele.
    const alvo = [...todos].sort((a, b) => b.periodo - a.periodo)[0];
    if (!alvo) throw new Error("sem planetas");
    await page.mouse.move(caixa.x + x(alvo.periodo), caixa.y + y(alvo.raio));
    const tooltip = page.locator("#explorar .tooltip");
    await expect(tooltip).toHaveAttribute("data-visivel", "true");
    await expect(tooltip.locator("strong")).toHaveText(alvo.nome);
    await expect(tooltip).toContainText(String(alvo.ano));
    await page.mouse.move(caixa.x + 2, caixa.y + 2);
    await expect(tooltip).toHaveAttribute("data-visivel", "false");
  });

  test("o gráfico preenche a largura e a altura esperadas e o canvas não tem tamanho zero", async ({ page }) => {
    await irParaExplorar(page);
    const caixa = await page.locator("#explorar canvas").boundingBox();
    expect(caixa?.width).toBeGreaterThan(250);
    expect(caixa?.height).toBeGreaterThan(250);
  });

  test("o canvas tem alternativa em texto e a tabela lista os mesmos planetas", async ({ page }) => {
    await irParaExplorar(page);
    await expect(page.locator("#explorar canvas")).toHaveAttribute(
      "aria-label",
      new RegExp(`${milhar(todos.length)} planetas`),
    );
    await expect(page.locator("#explorar caption")).toContainText(`de ${milhar(todos.length)}`);
  });
});

test.describe("filtros e tabela", () => {
  test("a ficha de classe tira os planetas do gráfico e da tabela", async ({ page }) => {
    await irParaExplorar(page);
    const netuno = todos.filter((p) => p.classe === "netuno").length;
    await page.getByRole("button", { name: /^Netuno/ }).click();
    await expect(page.getByRole("button", { name: /^Netuno/ })).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".resumo-grafico")).toHaveText(
      `Mostrando ${milhar(todos.length - netuno)} de ${milhar(todos.length)} planetas com raio medido.`,
    );
    await page.getByRole("button", { name: /^Netuno/ }).click();
    await expect(page.locator(".resumo-grafico")).toHaveText(
      `Mostrando ${milhar(todos.length)} de ${milhar(todos.length)} planetas com raio medido.`,
    );
  });

  test("as fichas mostram a contagem de cada classe", async ({ page }) => {
    await irParaExplorar(page);
    for (const [nome, classe] of [
      ["Terra", "terra"],
      ["Júpiter", "jupiter"],
    ] as const) {
      const n = todos.filter((p) => p.classe === classe).length;
      await expect(page.getByRole("button", { name: new RegExp(`^${nome}`) })).toContainText(milhar(n));
    }
  });

  test("o filtro de ano e o de massa medida reduzem o recorte", async ({ page }) => {
    await irParaExplorar(page);
    await page.locator("#filtro-ano").fill("2020");
    const desde2020 = todos.filter((p) => p.ano >= 2020).length;
    await expect(page.locator(".resumo-grafico")).toContainText(`Mostrando ${milhar(desde2020)} de`);
    await page.locator("#filtro-massa").check();
    const ambos = todos.filter((p) => p.ano >= 2020 && p.massa !== null).length;
    await expect(page.locator(".resumo-grafico")).toContainText(`Mostrando ${milhar(ambos)} de`);
  });

  test("buscar por nome encontra o planeta na tabela", async ({ page }) => {
    await irParaExplorar(page);
    await page.locator("#filtro-busca").fill("trappist-1 e");
    const linhas = page.locator("#explorar tbody tr");
    await expect(linhas).toHaveCount(1);
    await expect(linhas.first().locator("td").first()).toHaveText("TRAPPIST-1 e");
    await page.locator("#filtro-busca").fill("zzzz");
    await expect(page.locator("#explorar .vazio")).toHaveText("Nenhum planeta com esses filtros.");
  });

  test("ordenar por raio e mostrar mais", async ({ page }) => {
    await irParaExplorar(page);
    await page.getByRole("button", { name: "Raio (Terra = 1)" }).click();
    await expect(page.locator("th", { hasText: "Raio" })).toHaveAttribute("aria-sort", "descending");
    const maior = Math.max(...todos.map((p) => p.raio));
    await expect(page.locator("#explorar tbody tr").first().locator("td").nth(3)).toContainText(
      String(Math.trunc(maior)),
    );
    await expect(page.locator("#explorar tbody tr")).toHaveCount(20);
    await page.getByRole("button", { name: /Mostrar mais/ }).click();
    await expect(page.locator("#explorar tbody tr")).toHaveCount(40);
  });
});

test.describe("descobertas por ano", () => {
  test("o tooltip de um ano mostra o total e os métodos", async ({ page }) => {
    await page.goto("/#/catalogo");
    await page.locator("#descobertas").scrollIntoViewIfNeeded();
    const svg = page.locator("#descobertas svg.grafico-barras");
    await svg.waitFor();
    // O conteúdo das seções de cima pode ter empurrado a página: rola até o gráfico, como o leitor faria.
    await svg.scrollIntoViewIfNeeded();
    await expect(svg).toHaveAttribute("data-visivel", "true");
    const alvo = page.locator('#descobertas .coluna-alvo[aria-label^="2016:"]');
    await alvo.hover();
    const tooltip = page.locator("#descobertas .tooltip");
    await expect(tooltip).toHaveAttribute("data-visivel", "true");
    await expect(tooltip.locator("strong")).toContainText(`2016: ${milhar(metricas().descobertas.planetas_no_pico)}`);
    await expect(tooltip).toContainText("Trânsito");
  });

  test("existe a versão em tabela", async ({ page }) => {
    await page.goto("/#/catalogo");
    await page.locator("#descobertas").scrollIntoViewIfNeeded();
    await page.getByText("Ver os números em tabela").click();
    await expect(page.locator("#descobertas details tbody tr").first()).toBeVisible();
  });
});

test.describe("modelo e parecidos com a Terra", () => {
  test("mostra o erro mediano do melhor modelo", async ({ page }) => {
    await page.goto("/#/catalogo");
    await page.locator("#modelo").scrollIntoViewIfNeeded();
    const m = metricas();
    const melhor = Math.min(...Object.values(m.modelo.resultados).map((r) => r.erro_percentual_mediano));
    await expect(page.locator("#modelo .painel").first()).toContainText(melhor.toFixed(1).replace(".", ","));
    await expect(page.locator("#modelo .barras")).toHaveCount(2);
  });

  test("lista os planetas mais próximos parecidos com a Terra", async ({ page }) => {
    await page.goto("/#/catalogo");
    await page.locator("#terra").scrollIntoViewIfNeeded();
    const m = metricas();
    await expect(page.locator("#terra li")).toHaveCount(m.parecidos_com_a_terra_mais_proximos.length);
    await expect(page.locator("#terra li").first()).toContainText(
      m.parecidos_com_a_terra_mais_proximos[0]?.pl_name ?? "",
    );
  });
});

test.describe("movimento e acessibilidade", () => {
  test("com movimento reduzido, as durações viram quase zero e o skeleton não brilha", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/dados/metricas.json", async (rota) => {
      await new Promise((r) => setTimeout(r, 800));
      await rota.continue();
    });
    await page.goto("/#/catalogo");
    const duracao = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--dur-entrada").trim(),
    );
    expect(paraMs(duracao)).toBe(0.01);
    const animacao = await page
      .locator(".cartao .skeleton")
      .first()
      .evaluate((el) => getComputedStyle(el, "::after").animationName);
    expect(animacao).toBe("none");
  });

  test("sem preferência, o skeleton brilha e as durações são as dos tokens", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.route("**/dados/metricas.json", async (rota) => {
      await new Promise((r) => setTimeout(r, 800));
      await rota.continue();
    });
    await page.goto("/#/catalogo");
    const duracao = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--dur-entrada").trim(),
    );
    expect(paraMs(duracao)).toBe(260);
    const animacao = await page
      .locator(".cartao .skeleton")
      .first()
      .evaluate((el) => getComputedStyle(el, "::after").animationName);
    expect(animacao).toBe("brilho");
  });

  test("o conteúdo de uma seção entra com transição (opacidade) e termina visível", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/#/catalogo");
    await page.locator("#explorar").scrollIntoViewIfNeeded();
    const painel = page.locator('[data-secao="explorador"] canvas');
    await expect(painel).toBeVisible();
    const conteudo = page.locator('[data-secao="explorador"] .explorador');
    await expect(conteudo).toHaveAttribute("data-anim", "pronto");
    // A transição leva alguns quadros: a opacidade chega a 1, sem pular.
    await expect.poll(() => conteudo.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  });

  test("tema escuro muda as superfícies", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/#/catalogo");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(19, 19, 18)");
    await page.emulateMedia({ colorScheme: "light" });
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(252, 252, 251)");
  });

  test("estrutura básica: idioma, um h1, navegação e link para pular", async ({ page }) => {
    await page.goto("/#/catalogo");
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Módulos" })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Pular para o conteúdo" })).toBeFocused();
  });

  test("as fichas funcionam pelo teclado", async ({ page }) => {
    await irParaExplorar(page);
    const ficha = page.getByRole("button", { name: /^Terra/ });
    await ficha.focus();
    await page.keyboard.press("Enter");
    await expect(ficha).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("Space");
    await expect(ficha).toHaveAttribute("aria-pressed", "true");
  });

  test("a página não rola na horizontal", async ({ page }) => {
    await irParaExplorar(page);
    await page.locator("#terra").scrollIntoViewIfNeeded();
    const estouro = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(estouro).toBeLessThanOrEqual(0);
  });
});

test.describe("shell de módulos", () => {
  test("a página inicial apresenta o laboratório, os dois modos e os módulos", async ({ page }) => {
    const problemas = vigiar(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Laboratório de astrofísica");
    await expect(page).toHaveTitle("Exoplanetas");
    await expect(page.getByRole("heading", { name: "Dois jeitos de usar cada módulo" })).toBeVisible();
    await expect(page.locator("a.cartao-modulo")).toHaveCount(1);
    await expect(page.locator(".cartao-modulo.em-breve").first()).toContainText("Em breve");
    expect(problemas).toEqual([]);
  });

  test("abrir o catálogo pelo cartão, usar o botão voltar e o link direto", async ({ page }) => {
    await page.goto("/");
    await page.locator("a.cartao-modulo").first().click();
    await expect(page).toHaveURL(/#\/catalogo$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Os mundos além do Sol");
    await expect(page).toHaveTitle(/Catálogo de exoplanetas/);
    await expect(page.getByRole("navigation", { name: "Módulos" }).locator('a[aria-current="page"]')).toHaveText(
      "Catálogo de exoplanetas",
    );
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Laboratório de astrofísica");
    await page.goForward();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Os mundos além do Sol");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Os mundos além do Sol");
  });

  test("o link do topo volta ao início e um módulo desconhecido cai no início", async ({ page }) => {
    await page.goto("/#/catalogo");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Os mundos além do Sol");
    await page.getByRole("link", { name: "Exoplanetas", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Laboratório de astrofísica");
    await page.goto("/#/nao-existe");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Laboratório de astrofísica");
  });

  test("a navegação de dentro do catálogo rola até a seção sem sair da rota", async ({ page }) => {
    await page.goto("/#/catalogo");
    await page.getByRole("link", { name: "Descobertas", exact: true }).click();
    await expect(page.locator("#descobertas svg.grafico-barras")).toBeVisible();
    await expect(page).toHaveURL(/#\/catalogo$/);
  });

  test("o link para pular leva o foco ao conteúdo", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.locator("#principal")).toBeFocused();
    await expect(page).toHaveURL(/\/$/);
  });

  test("uma rota que muda dentro do catálogo preserva a URL e o carregamento sob demanda continua", async ({
    page,
  }) => {
    const pedidos: string[] = [];
    page.on("request", (r) => pedidos.push(new URL(r.url()).pathname));
    await page.goto("/");
    // O código do catálogo só é baixado quando o catálogo é aberto.
    expect(pedidos.some((p) => /\/assets\/catalogo-/.test(p))).toBe(false);
    await page.locator("a.cartao-modulo").first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Os mundos além do Sol");
    expect(pedidos.some((p) => /\/assets\/catalogo-/.test(p))).toBe(true);
  });
});
