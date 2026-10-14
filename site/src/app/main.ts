import * as telemetria from "../telemetry";
import { lerConfiguracao } from "../telemetry/config";
import { montarBarraGlobal } from "../ui/barra-global";
import { importarModulo } from "../ui/carga";
import { quandoVisivel } from "../ui/lazy";

/** Cada seção carrega o próprio código e os próprios dados só quando chega perto da tela. */
const SECOES: Record<string, () => Promise<{ montar(host: HTMLElement): Promise<void> }>> = {
  resumo: () => import("../ui/resumo"),
  explorador: () => import("../ui/explorador"),
  descobertas: () => import("../ui/descobertas"),
  modelo: () => import("../ui/modelo"),
  terra: () => import("../ui/terra"),
};

function iniciarSecoes(): void {
  for (const host of document.querySelectorAll<HTMLElement>("[data-secao]")) {
    const nome = host.dataset.secao ?? "";
    const carregarModulo = SECOES[nome];
    if (!carregarModulo) continue;
    // O resumo está no topo da página, então carrega logo; as demais esperam chegar perto da tela.
    quandoVisivel(host, () => {
      importarModulo(carregarModulo())
        .then((m) => m.montar(host))
        .catch((e: unknown) => telemetria.erro(e, { secao: nome, etapa: "modulo" }));
    });
  }
}

async function iniciar(): Promise<void> {
  const barra = document.getElementById("progresso-global");
  if (barra) montarBarraGlobal(barra);
  iniciarSecoes();

  const config = lerConfiguracao(import.meta.env, __AMBIENTE__, __VERSAO__);
  telemetria.instalarCapturaGlobal(window);
  const { ativos } = await telemetria.iniciarTelemetria(config);
  // Sem fornecedor ligado ninguém receberia as métricas, então nem baixamos o medidor.
  if (ativos.length > 0) (await import("../telemetry/vitals")).medirWebVitals(telemetria.evento);
}

iniciar().catch(() => {
  // A telemetria nunca pode quebrar a página; as seções já foram iniciadas.
});
