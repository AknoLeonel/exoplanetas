import { C_LUZ, LAMBDA_H_ALFA_NM, M_JUPITER, M_TERRA, R_JUPITER, R_TERRA } from "../lib/fisica/constantes";
import { densidadeGcm3 } from "../lib/fisica/planeta";
import { semiAmplitudeMs } from "../lib/fisica/velocidade-radial";
import { compacto, decimal, milhar } from "../lib/formato";
import {
  type ChaveDaSimulacaoVR,
  type LeituraVR,
  type SimulacaoVR,
  simularCurvaVR,
} from "../lib/simulacao-velocidade-radial";
import type { PassoDoRoteiro } from "./simulador";
import { rotuloDeVelocidade } from "./vr-desenho";

export type PassoDaVR = PassoDoRoteiro<SimulacaoVR, LeituraVR, ChaveDaSimulacaoVR>;

/** O quanto a Terra balança o Sol: o alvo que os espectrógrafos ainda perseguem. */
const TERRA_NO_SOL = semiAmplitudeMs({
  periodoDias: 365.256,
  massaPlanetaMjup: M_TERRA / M_JUPITER,
  massaEstrelaMsol: 1,
});
const DENSIDADE_DA_TERRA = densidadeGcm3(1, 1);
const DENSIDADE_DE_JUPITER = densidadeGcm3(M_JUPITER / M_TERRA, R_JUPITER / R_TERRA);

function picoEVale(s: SimulacaoVR): { pico: number; vale: number } {
  const vs = simularCurvaVR({ ...s, ruidoMs: 0 }, 180).modelo.map((p) => p.velocidadeMs);
  return { pico: Math.max(...vs), vale: Math.min(...vs) };
}

/** Roteiro do modo Aprender: do balanço da estrela até a densidade, juntando com o trânsito. */
export const ROTEIRO_VR: readonly PassoDaVR[] = [
  {
    titulo: "A estrela também se move",
    texto:
      "Um planeta não gira em volta do centro da estrela, e sim os dois em volta do centro de massa comum. Como a estrela é muito mais pesada, o centro de massa fica perto dela, e ela descreve um círculo pequeno, no mesmo período do planeta. Daqui, só dá para perceber a parte desse movimento que vem na nossa direção ou vai para longe: a velocidade radial.",
    tarefa: "Aperte “Animar” ou arraste o tempo e acompanhe a estrela indo e voltando enquanto o planeta dá a volta.",
    controles: [],
    conta: (_s, l) =>
      `K = ${rotuloDeVelocidade(l.semiAmplitudeMs).replace("+", "")}: a estrela vai e vem a essa velocidade máxima, a cada órbita do planeta.`,
  },
  {
    titulo: "O efeito Doppler",
    texto:
      "Quando a estrela vem para cá, as ondas de luz chegam comprimidas e as linhas do espectro se deslocam para o azul; quando ela se afasta, para o vermelho. O deslocamento é minúsculo, uma fração de picômetro, mas espectrógrafos estáveis medem a posição de milhares de linhas ao mesmo tempo e chegam à precisão de metros por segundo.",
    tarefa: "Anime e observe a cor da estrela: azulada quando vem para cá, avermelhada quando se afasta.",
    controles: [],
    conta: (_s, l) =>
      `Δλ = λ · v / c = ${decimal(LAMBDA_H_ALFA_NM, 2)} nm × ${decimal(l.semiAmplitudeMs, 1)} m/s ÷ ${milhar(C_LUZ)} m/s = ${decimal(l.deslocamentoHalfaPm, 3)} pm na linha H-alfa.`,
  },
  {
    titulo: "Mais massa, mais balanço",
    texto:
      "A semi-amplitude K cresce na proporção da massa do planeta e cai com o período: planetas pesados e próximos fazem a estrela balançar mais. Por isso os primeiros planetas achados por esse método foram Júpiteres quentes, como 51 Pegasi b.",
    tarefa:
      "Dobre a massa do planeta e veja K dobrar. Depois multiplique o período por 8: K cai pela metade (K ∝ P^(−1/3)).",
    controles: ["massaPlanetaMterra", "periodoDias"],
    conta: (s, l) =>
      `K = (2πG / P)^(1/3) · m·sen i / (M★ + m)^(2/3) / √(1 − e²). Com P = ${compacto(s.periodoDias)} dias, m = ${compacto(s.massaPlanetaMterra)} M⊕, M★ = ${compacto(s.massaEstrelaMsol)} M☉, i = ${decimal(s.inclinacaoGraus, 1)}° e e = ${decimal(s.excentricidade, 2)}: K = ${decimal(l.semiAmplitudeMs, 2)} m/s.`,
  },
  {
    titulo: "Órbitas alongadas",
    texto:
      "Numa órbita circular a curva é uma senoide. Numa órbita excêntrica o planeta corre perto do periastro e se arrasta longe dele, e a curva fica torta: um pico estreito e um vale largo (ou o contrário, conforme o ângulo ω de onde vemos a elipse).",
    tarefa: "Aumente a excentricidade e mude ω: a forma da curva conta como é a órbita.",
    controles: ["excentricidade", "omegaGraus"],
    conta: (s) => {
      const { pico, vale } = picoEVale(s);
      return `v = K · [cos(ν + ω) + e · cos ω]. Com e = ${decimal(s.excentricidade, 2)} e ω = ${decimal(s.omegaGraus, 0)}°: pico de ${rotuloDeVelocidade(pico)} e vale de ${rotuloDeVelocidade(vale)}.`;
    },
  },
  {
    titulo: "O que a inclinação esconde",
    texto:
      "Só vemos a parte do balanço na nossa linha de visada, que é a velocidade real vezes sen i. Sem saber a inclinação, a mesma curva serve para um planeta leve visto de lado ou um pesado visto quase de cima. Por isso a velocidade radial sozinha dá só a massa mínima, m·sen i.",
    tarefa: "Baixe a inclinação: a massa verdadeira não muda, mas K cai, e a massa que um astrônomo deduziria também.",
    controles: ["inclinacaoGraus"],
    conta: (s, l) =>
      `m·sen i = ${compacto(l.massaMinimaMterra)} M⊕, contra a massa verdadeira de ${compacto(s.massaPlanetaMterra)} M⊕ (fator 1 / sen ${decimal(s.inclinacaoGraus, 1)}° = ${decimal(l.fatorDaInclinacao, 2)}).`,
  },
  {
    titulo: "Ruído e planetas pequenos",
    texto: `A atmosfera da estrela ferve, o instrumento tem limites e cada medida vem com ruído. A Terra faz o Sol balançar só ${rotuloDeVelocidade(TERRA_NO_SOL).replace("+", "")}: achar gêmeos da Terra por velocidade radial ainda está no limite do que os melhores espectrógrafos conseguem.`,
    tarefa: "Diminua a massa até a de uma super-Terra e aumente o ruído até a curva sumir no meio dos pontos.",
    controles: ["massaPlanetaMterra", "ruidoMs"],
    conta: (s, l) =>
      `K = ${decimal(l.semiAmplitudeMs, 2)} m/s, contra um ruído de ${decimal(s.ruidoMs, 1)} m/s por medida: ${l.semiAmplitudeMs > 3 * s.ruidoMs ? "o balanço aparece" : "o balanço se perde no ruído"}.`,
  },
  {
    titulo: "Trânsito + velocidade radial = densidade",
    texto:
      "O trânsito dá o raio do planeta e, como a órbita está de lado, a inclinação. A velocidade radial dá a massa. Juntos dão a massa verdadeira e a densidade, que diz do que o planeta é feito: rocha, gelo ou gás.",
    tarefa:
      "No modo Explorar, carregue Kepler-10 b e depois Kepler-7 b: o primeiro é mais denso que a Terra, o segundo menos denso que a água. Cada um abre também no simulador de trânsito.",
    controles: [],
    conta: () =>
      `ρ = m / (4/3 · π · R³). Terra: ${decimal(DENSIDADE_DA_TERRA, 2)} g/cm³. Júpiter: ${decimal(DENSIDADE_DE_JUPITER, 2)} g/cm³. Água: 1 g/cm³.`,
  },
];
