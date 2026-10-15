import { acompanhar } from "../data/acompanhar";
import { evento, iniciarTelemetria, instalarCapturaGlobal } from "../telemetry";
import { lerConfiguracao } from "../telemetry/config";
import { montarBarraGlobal } from "../ui/barra-global";
import { type Carregadores, montarShell } from "../ui/shell";
import { iniciarTema } from "../ui/tema";

/**
 * Um carregador por módulo: o código de cada um só é baixado quando a rota dele é aberta.
 * O `.then(({ montar }) => ...)` é proposital: devolver o objeto de exports inteiro faz o empacotador criar um
 * auxiliar que acaba hospedado no chunk de um SDK de observabilidade, e o SDK seria baixado sem estar configurado.
 * O teste e2e "nenhum SDK de fornecedor é baixado" protege isso.
 */
const CARREGADORES: Carregadores = {
  inicio: () => import("../ui/inicio").then(({ montar }) => ({ montar })),
  catalogo: () => import("../ui/catalogo").then(({ montar }) => ({ montar })),
};

async function iniciar(): Promise<void> {
  const barra = document.getElementById("progresso-global");
  if (barra) montarBarraGlobal(barra);

  const botaoTema = document.getElementById("botao-tema");
  if (botaoTema) iniciarTema(botaoTema);

  const palco = document.getElementById("principal");
  const navegacao = document.getElementById("nav-modulos");
  const anuncio = document.getElementById("anuncio");
  if (palco && navegacao && anuncio) {
    montarShell({
      palco,
      navegacao,
      anuncio,
      carregadores: Object.fromEntries(
        Object.entries(CARREGADORES).map(([id, carregar]) => [id, () => acompanhar(carregar())]),
      ),
    });
  }

  const config = lerConfiguracao(import.meta.env, __AMBIENTE__, __VERSAO__);
  instalarCapturaGlobal(window);
  const { ativos } = await iniciarTelemetria(config);
  // Sem fornecedor ligado ninguém receberia as métricas, então nem baixamos o medidor.
  if (ativos.length > 0) (await import("../telemetry/vitals")).medirWebVitals(evento);
}

iniciar().catch(() => {
  // A telemetria nunca pode quebrar a página; o shell já foi iniciado.
});
