import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import type { Configuracao } from "../config";
import type { Provedor } from "../provedor";

export async function iniciar(config: Configuracao): Promise<Provedor> {
  if (!config.otel) throw new Error("OpenTelemetry sem endpoint");
  const provedor = new WebTracerProvider({
    resource: resourceFromAttributes({
      "service.name": config.servico,
      "service.version": config.versao,
      "deployment.environment.name": config.ambiente,
    }),
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: config.otel.urlDeTracos }))],
  });
  provedor.register();
  registerInstrumentations({
    instrumentations: [
      new DocumentLoadInstrumentation(),
      // Não rastreia o envio dos próprios traços.
      new FetchInstrumentation({ ignoreUrls: [config.otel.urlDeTracos] }),
    ],
  });
  const tracer = trace.getTracer(config.servico, config.versao);
  return {
    nome: "otel",
    capturaAutomatica: false,
    erro: (e, contexto) => {
      const span = tracer.startSpan("erro");
      span.recordException(e instanceof Error ? e : String(e));
      if (contexto) span.setAttributes({ ...contexto });
      span.setStatus({ code: 2 });
      span.end();
    },
    evento: (nome, dados) => {
      const span = tracer.startSpan(nome);
      if (dados) span.setAttributes({ ...dados });
      span.end();
    },
  };
}
