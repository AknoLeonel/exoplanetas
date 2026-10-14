import { defineConfig, devices } from "@playwright/test";

// No CI o Playwright baixa o próprio Chromium. Localmente, PW_CHROMIUM_PATH aponta para um já instalado.
const executavel = process.env.PW_CHROMIUM_PATH;
const lancamento = executavel ? { executablePath: executavel } : {};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: lancamento } },
    { name: "celular", use: { ...devices["Pixel 7"], launchOptions: lancamento } },
  ],
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
