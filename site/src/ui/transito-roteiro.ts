import { R_SOL, R_TERRA } from "../lib/fisica/constantes";
import { compacto, decimal, fracaoDoBrilho, milhar } from "../lib/formato";
import { type ChaveDaSimulacao, type Leitura, ler, type Simulacao } from "../lib/simulacao-transito";
import type { PassoDoRoteiro } from "./simulador";

export type PassoDoTransito = PassoDoRoteiro<Simulacao, Leitura, ChaveDaSimulacao>;

const KM_TERRA = R_TERRA / 1000;
const KM_SOL = R_SOL / 1000;
/** Uma anã vermelha pequena, com 12% do raio do Sol (como as menores estrelas com planetas de trânsito). */
const RAIO_DA_ANA = 0.12;
const TERRA_NO_SOL = (R_TERRA / R_SOL) ** 2;
const TERRA_NA_ANA = (R_TERRA / (RAIO_DA_ANA * R_SOL)) ** 2;

function contaDaProfundidade(s: Simulacao, l: Leitura): string {
  return `δ ≈ (Rp / R★)² = (${compacto(s.raioPlanetaRterra)} × ${milhar(KM_TERRA)} km ÷ (${compacto(s.raioEstrelaRsol)} × ${milhar(KM_SOL)} km))² = ${decimal(l.razaoDeRaios, 4)}² = ${fracaoDoBrilho(l.profundidadeSimples)}`;
}

/** Roteiro do modo Aprender: cada passo explica uma parte da curva e pede para mexer num controle. */
export const ROTEIRO: readonly PassoDoTransito[] = [
  {
    titulo: "O planeta passa na frente da estrela",
    texto:
      "Daqui da Terra não dá para ver o planeta: ele é pequeno e escuro demais perto da estrela. Mas, se a órbita estiver alinhada com a nossa linha de visão, uma vez por órbita ele cruza o disco da estrela e bloqueia um pouco da luz. Essa queda pequena e regular é um trânsito.",
    tarefa: "Aperte “Animar” ou arraste o tempo e veja a curva descer quando o planeta entra no disco.",
    controles: [],
    conta: (_s, l) => `Brilho no meio do trânsito: ${decimal((1 - l.profundidade) * 100, 2)}% do normal`,
  },
  {
    titulo: "A queda revela o tamanho do planeta",
    texto:
      "A fração de luz bloqueada é, em primeira aproximação, a área do disco do planeta dividida pela área do disco da estrela. Como as duas áreas são proporcionais ao quadrado do raio, a profundidade é a razão dos raios ao quadrado.",
    tarefa: "Mude o raio do planeta. Com o dobro do raio, a queda fica quatro vezes maior.",
    controles: ["raioPlanetaRterra"],
    conta: contaDaProfundidade,
  },
  {
    titulo: "A mesma queda, outra estrela",
    texto: `O trânsito mede o planeta em relação à estrela. Um planeta do tamanho da Terra tira ${fracaoDoBrilho(TERRA_NO_SOL)} do brilho do Sol, mas ${fracaoDoBrilho(TERRA_NA_ANA)} de uma anã vermelha com ${decimal(RAIO_DA_ANA * 100, 0)}% do raio do Sol. Por isso, estrelas pequenas são as melhores para achar planetas rochosos.`,
    tarefa: "Diminua o raio da estrela e veja a mesma queda crescer.",
    controles: ["raioEstrelaRsol"],
    conta: contaDaProfundidade,
  },
  {
    titulo: "Nem todo planeta passa na frente",
    texto:
      "A inclinação diz o quanto a órbita está de lado para nós (90° é de lado perfeito). O parâmetro de impacto b é a distância do caminho do planeta ao centro da estrela, em raios estelares. Se b passar de 1 + Rp/R★, o planeta passa por cima ou por baixo do disco e não há trânsito.",
    tarefa:
      "Baixe a inclinação até o trânsito sumir. Depois afaste o planeta (semi-eixo maior) e veja que a mesma inclinação passa a errar a estrela mais cedo.",
    controles: ["inclinacaoGraus", "semiEixoUA"],
    conta: (s, l) =>
      `b = (a / R★) · cos i = ${decimal(l.semiEixoEmRaiosEstelares, 2)} × cos ${decimal(s.inclinacaoGraus, 2)}° = ${decimal(l.parametroDeImpacto, 2)}. Há trânsito se b < 1 + Rp/R★ = ${decimal(1 + l.razaoDeRaios, 2)}: ${l.haTransito ? "sim" : "não"}.`,
  },
  {
    titulo: "Quanto tempo dura",
    texto:
      "Quanto mais longa a órbita, mais devagar o planeta anda e mais tempo leva para cruzar a estrela. A duração total T₁₄ vai do primeiro ao último contato do planeta com o disco. Período e semi-eixo não são independentes: pela terceira lei de Kepler, os dois juntos dizem a massa da estrela.",
    tarefa: "Mude o período e o semi-eixo e acompanhe a duração e a massa que a estrela precisaria ter.",
    controles: ["periodoDias", "semiEixoUA"],
    conta: (s, l) =>
      `T₁₄ = (P / π) · asen(√((1 + k)² − b²) / ((a / R★) · sen i)) = (${compacto(s.periodoDias)} d / π) · asen(√(${decimal(1 + l.razaoDeRaios, 3)}² − ${decimal(l.parametroDeImpacto, 3)}²) / (${decimal(l.semiEixoEmRaiosEstelares, 2)} × ${decimal(Math.sin((s.inclinacaoGraus * Math.PI) / 180), 4)})) = ${l.haTransito ? `${decimal(l.duracaoHoras, 2)} h` : "sem trânsito"}. Kepler: M★ = 4π²a³ / (G·P²) = ${compacto(l.massaDaEstrelaMsol)} M☉.`,
  },
  {
    titulo: "A borda da estrela é mais escura",
    texto:
      "Olhando para a borda da estrela, enxergamos camadas mais altas e mais frias, que brilham menos. Esse escurecimento de borda arredonda o fundo da curva: o planeta tapa menos luz perto da borda e mais no centro. Os coeficientes u₁ e u₂ descrevem o quanto a borda escurece.",
    tarefa: "Aumente u₁ e veja o fundo da curva ficar arredondado e mais fundo no meio.",
    controles: ["u1", "u2"],
    conta: (s, l) => {
      const semBorda = ler({ ...s, u1: 0, u2: 0 }).profundidade;
      return `I(μ) / I(centro) = 1 − u₁(1 − μ) − u₂(1 − μ)². Na borda: 1 − ${decimal(s.u1, 2)} − ${decimal(s.u2, 2)} = ${decimal(1 - s.u1 - s.u2, 2)}. Profundidade no centro: ${fracaoDoBrilho(l.profundidade)}, contra ${fracaoDoBrilho(semBorda)} sem escurecimento.`;
    },
  },
  {
    titulo: "Do brilho de volta ao raio",
    texto:
      "Na prática, o caminho é o inverso: o telescópio mede a curva, com ruído, e o astrônomo deduz o raio do planeta a partir da profundidade e do raio da estrela. Quando o ruído é maior que a queda, o planeta some no meio dos pontos. É por isso que planetas pequenos são os mais difíceis de achar.",
    tarefa: "Aumente o ruído até a queda desaparecer no meio dos pontos.",
    controles: ["ruidoPpm"],
    conta: (s, l) =>
      `Rp = R★ · √δ = ${compacto(s.raioEstrelaRsol)} × ${milhar(KM_SOL)} km × √${decimal(l.profundidade, 5)} = ${compacto(l.raioInferidoRterra)} R⊕ (o valor simulado é ${compacto(s.raioPlanetaRterra)} R⊕). Ruído: ${milhar(s.ruidoPpm)} ppm, contra uma queda de ${fracaoDoBrilho(l.profundidade)}.`,
  },
];
