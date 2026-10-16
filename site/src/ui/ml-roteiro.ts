import { M_JUPITER, M_TERRA } from "../lib/fisica/constantes";
import { compacto, decimal, milhar, percentual } from "../lib/formato";
import {
  type ChaveDaEntrada,
  type EntradaML,
  type LeituraML,
  NOMES_DAS_VARIAVEIS,
  VARIAVEIS,
  type Variavel,
} from "../lib/modelo-raio";
import type { PassoDoRoteiro } from "./simulador";

const MASSA_DE_JUPITER = M_JUPITER / M_TERRA;

export type PassoDoML = PassoDoRoteiro<EntradaML, LeituraML, ChaveDaEntrada>;

/** "×1,8" quando a variável aumenta o raio, "÷1,3" quando diminui. */
export function textoDoFator(fator: number): string {
  if (Math.abs(Math.log10(fator)) < 0.001) return "×1,00";
  return fator >= 1 ? `×${decimal(fator, 2)}` : `÷${decimal(1 / fator, 2)}`;
}

function fatorDe(l: LeituraML, v: Variavel): string {
  return `${NOMES_DAS_VARIAVEIS[v]}: ${textoDoFator(l.fatores[VARIAVEIS.indexOf(v)] ?? 1)}`;
}

function previsao(l: LeituraML): string {
  return `raio previsto de ${compacto(l.raio)} × Terra (80% de chance entre ${compacto(l.inferior)} e ${compacto(l.superior)})`;
}

/** Roteiro do modo Aprender: o que o modelo usa, quanto confiar nele e onde ele deixa de valer. */
export const ROTEIRO_ML: readonly PassoDoML[] = [
  {
    titulo: "Um modelo que aprendeu com planetas medidos",
    texto:
      "Quando um planeta é achado por velocidade radial, sabemos a massa, mas não o raio. Este modelo de gradient boosting (centenas de árvores de decisão somadas) aprendeu a estimar o raio com os planetas que têm as duas medidas, a partir da massa, da órbita, da luz recebida e da estrela. Ele roda aqui no seu navegador.",
    tarefa:
      "Veja a previsão para a Terra, que não estava no treino: um teste honesto. O modelo erra, e o motivo ensina muito: os planetas pequenos do treino têm órbitas de poucos dias, e quase todos os de órbita longa são gigantes. Diminua o período para 10 dias e veja a previsão cair.",
    controles: ["periodoDias"],
    conta: (e, l) => {
      const terra = e.massaMterra === 1 && e.insolacao === 1;
      return `Treinado com ${milhar(l.validacao.planetas)} planetas. Para a entrada atual: ${previsao(l)}.${
        terra
          ? ` A Terra real tem 1 × Terra: ${l.inferior <= 1 && l.superior >= 1 ? "dentro" : "fora"} do intervalo.`
          : ""
      }`;
    },
  },
  {
    titulo: "A massa manda, até certo ponto",
    texto:
      "Planetas rochosos crescem com a massa. Nos gigantes, a gravidade comprime o gás e o raio quase para de crescer: um planeta dez vezes mais pesado que Júpiter tem quase o mesmo tamanho. Uma reta não captura isso; as árvores, sim.",
    tarefa: "Leve a massa de 1 a 3.000 × Terra e veja o raio subir e depois parar.",
    controles: ["massaMterra"],
    conta: (_e, l) =>
      `${fatorDe(l, "log_massa")} sobre o ponto de partida de ${compacto(l.raioBase)} × Terra → ${previsao(l)}.`,
  },
  {
    titulo: "Planetas muito iluminados incham",
    texto:
      "Gigantes muito perto da estrela recebem tanta energia que a atmosfera esquenta e se expande: são os Júpiteres inflados. O modelo aprendeu isso com a luz recebida.",
    tarefa: `Com massa de Júpiter (${milhar(MASSA_DE_JUPITER)} × Terra), aumente a luz recebida até milhares de vezes a da Terra.`,
    controles: ["massaMterra", "insolacao"],
    conta: (_e, l) => `${fatorDe(l, "log_insolacao")}; ${fatorDe(l, "log_massa")} → ${previsao(l)}.`,
  },
  {
    titulo: "A estrela também entra na conta",
    texto:
      "A temperatura, a massa e a metalicidade da estrela (quanto ela tem de elementos mais pesados que o hélio) ajudam a refinar a previsão. O efeito delas é menor que o da massa do planeta, e o modelo mostra quanto cada uma moveu o resultado.",
    tarefa: "Mexa nas três e compare o tamanho dos fatores com o da massa.",
    controles: ["teffK", "massaEstrelaMsol", "metalicidade"],
    conta: (_e, l) => `${fatorDe(l, "st_teff")}; ${fatorDe(l, "st_mass")}; ${fatorDe(l, "st_met")}.`,
  },
  {
    titulo: "Quanto confiar na previsão",
    texto:
      "O intervalo não é um chute: ele vem dos erros do modelo em planetas que ele não viu durante o treino (validação cruzada). Para cada faixa de massa, guardamos onde caíram 80% desses erros.",
    tarefa: "Mude a massa e veja o intervalo ficar mais largo ou mais estreito conforme a faixa.",
    controles: ["massaMterra"],
    conta: (_e, l) =>
      `Nesta faixa de massa, ${percentual(l.faixaDoIntervalo.cobertura * 100, 0)} de ${milhar(l.faixaDoIntervalo.planetas)} planetas de validação ficaram entre ${textoDoFator(10 ** l.faixaDoIntervalo.inferior)} e ${textoDoFator(10 ** l.faixaDoIntervalo.superior)} do previsto.`,
  },
  {
    titulo: "Por que a validação é agrupada por estrela",
    texto:
      "Planetas do mesmo sistema compartilham a estrela. Se um irmão ficasse no treino e o outro no teste, o modelo pareceria melhor do que é, porque já teria visto aquela estrela: é o vazamento. Por isso a validação separa por estrela: nenhum sistema aparece nos dois lados.",
    tarefa: "Compare o erro mediano com o que você vê ao carregar planetas reais no modo Explorar.",
    controles: [],
    conta: (_e, l) =>
      `${l.validacao.metodo}: erro mediano de ${percentual(l.validacao.erroPercentualMediano)} e ${percentual(l.validacao.dentroDe20pct)} das previsões a menos de 20% do raio real.`,
  },
  {
    titulo: "Fora dos dados, o modelo só repete a borda",
    texto:
      "Árvores de decisão não extrapolam: além do último planeta visto no treino, a previsão fica constante. O site avisa quando alguma entrada está na borda dos dados (fora dos 98% centrais) ou além de tudo o que o modelo já viu.",
    tarefa: "Leve o período a milhares de dias, ou a massa ao máximo, e veja o aviso aparecer.",
    controles: ["periodoDias", "massaMterra"],
    conta: (_e, l) => {
      const problemas = VARIAVEIS.filter((v) => l.extrapolacao[v] !== "dentro").map(
        (v) => `${NOMES_DAS_VARIAVEIS[v]} ${l.extrapolacao[v] === "fora" ? "fora do treino" : "na borda"}`,
      );
      return problemas.length
        ? `Atenção: ${problemas.join("; ")}.`
        : "Todas as entradas estão dentro dos dados de treino.";
    },
  },
];
