"""Medição própria de trânsitos: período por BLS e ajuste do trânsito pelo modelo de Mandel e Agol.

Funções puras sobre vetores de tempo (dias) e fluxo normalizado (1 fora do trânsito). Quem baixa
as curvas de luz do TESS e os valores do catálogo é `scripts/medir_transitos.py`.

- Período: Box Least Squares (Kovács, Zucker e Mazeh 2002), pela implementação do astropy.
- Trânsito: modelo de Mandel e Agol (2002) pelo batman (Kreidberg 2015), com escurecimento de borda
  quadrático na parametrização de Kipping (2013), q1 e q2 entre 0 e 1.
- Incerteza: covariância do ajuste por mínimos quadrados, (JᵀJ)⁻¹ escalada pela variância dos resíduos.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass

import batman
import numpy as np
from astropy import constants
from astropy.timeseries import BoxLeastSquares
from scipy.optimize import least_squares

# Critérios do teste de viabilidade (Issue #41).
TOLERANCIA_DO_PERIODO = 1e-3  # 0,1%
SIGMAS_DA_RAZAO = 2.0
MINIMO_DE_APROVADOS = 4

# Busca do período: faixa e durações testadas pelo BLS (dias).
PERIODO_MINIMO = 0.5
PERIODO_MAXIMO = 10.0
DURACOES = (0.04, 0.06, 0.08, 0.1, 0.13, 0.17, 0.22)
# Janela em volta de cada trânsito usada no ajuste, em durações.
JANELA_DO_AJUSTE = 1.5

# Pontos de partida do ajuste (não são resultados: o ajuste os move).
PARAMETRO_DE_IMPACTO_INICIAL = 0.3
Q_INICIAL = 0.36

RAIO_DA_TERRA_EM_RAIOS_DO_SOL = (constants.R_earth / constants.R_sun).decompose().value


@dataclass(frozen=True)
class Periodo:
    periodo: float
    t0: float
    duracao: float
    profundidade: float


@dataclass(frozen=True)
class Ajuste:
    periodo: float
    periodo_sigma: float
    t0: float
    t0_sigma: float
    razao_de_raios: float
    razao_de_raios_sigma: float
    a_sobre_raio: float
    impacto: float
    q1: float
    q2: float
    pontos: int
    residuo_ppm: float

    def como_dict(self) -> dict:
        return asdict(self)


def _validar(tempo: np.ndarray, fluxo: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    t = np.asarray(tempo, dtype=float)
    f = np.asarray(fluxo, dtype=float)
    if t.shape != f.shape or t.ndim != 1:
        raise ValueError("tempo e fluxo precisam ser vetores do mesmo tamanho")
    ok = np.isfinite(t) & np.isfinite(f)
    if ok.sum() < 100:
        raise ValueError("pontos válidos insuficientes para medir um trânsito")
    ordem = np.argsort(t[ok])
    return t[ok][ordem], f[ok][ordem]


def bls(
    tempo: np.ndarray,
    fluxo: np.ndarray,
    periodos: np.ndarray | None = None,
    duracoes: tuple[float, ...] = DURACOES,
) -> Periodo:
    """O pico do periodograma BLS: período, época, duração e profundidade da caixa.

    Sem `periodos`, varre de PERIODO_MINIMO a PERIODO_MAXIMO com a grade automática do astropy.
    """
    t, f = _validar(tempo, fluxo)
    modelo = BoxLeastSquares(t, f)
    if periodos is None:
        maximo = min(PERIODO_MAXIMO, (t[-1] - t[0]) / 2)
        resultado = modelo.autopower(list(duracoes), minimum_period=PERIODO_MINIMO, maximum_period=maximo, objective="snr")
    else:
        resultado = modelo.power(np.asarray(periodos, dtype=float), list(duracoes), objective="snr")
    i = int(np.argmax(resultado.power))
    return Periodo(
        periodo=float(resultado.period[i]),
        t0=float(resultado.transit_time[i]),
        duracao=float(resultado.duration[i]),
        profundidade=float(resultado.depth[i]),
    )


def primeiro_trecho(tempo: np.ndarray, lacuna: float = 5.0) -> np.ndarray:
    """Máscara do primeiro trecho contínuo (um setor do TESS): termina na primeira lacuna maior que `lacuna` dias."""
    t = np.asarray(tempo, dtype=float)
    saltos = np.flatnonzero(np.diff(t) > lacuna)
    fim = saltos[0] + 1 if saltos.size else t.size
    mascara = np.zeros(t.size, dtype=bool)
    mascara[:fim] = True
    return mascara


def grade_refinada(estimativa: Periodo, trecho: float, base: float) -> np.ndarray:
    """Períodos em volta da estimativa de um trecho curto, finos o bastante para a base inteira.

    Um erro dP no período desloca o último trânsito em (base/P)·dP; a grade mantém esse
    deslocamento abaixo de um quarto da duração, numa janela de ± duas vezes a incerteza do trecho.
    """
    p, d = estimativa.periodo, estimativa.duracao
    meia_janela = 2 * p * d / trecho
    passo = p * d / (4 * base)
    n = math.ceil(2 * meia_janela / passo) + 1
    return np.linspace(p - meia_janela, p + meia_janela, n)


def buscar_periodo(tempo: np.ndarray, fluxo: np.ndarray) -> Periodo:
    """BLS no primeiro setor e, se houver mais dados, refinamento na base inteira."""
    t, f = _validar(tempo, fluxo)
    primeiro = primeiro_trecho(t)
    estimativa = bls(t[primeiro], f[primeiro])
    base = t[-1] - t[0]
    trecho = t[primeiro][-1] - t[0]
    if base <= trecho * 1.5:
        return estimativa
    return bls(t, f, grade_refinada(estimativa, trecho, base), duracoes=(estimativa.duracao,))


def mascara_de_transito(tempo: np.ndarray, periodo: Periodo, janela: float = JANELA_DO_AJUSTE) -> np.ndarray:
    """Pontos a menos de `janela` durações do centro de algum trânsito."""
    fase = (np.asarray(tempo, dtype=float) - periodo.t0 + periodo.periodo / 2) % periodo.periodo - periodo.periodo / 2
    return np.abs(fase) < janela * periodo.duracao


def _modelo(tempo: np.ndarray):
    parametros = batman.TransitParams()
    parametros.t0, parametros.per, parametros.rp, parametros.a, parametros.inc = 0.0, 1.0, 0.1, 10.0, 90.0
    parametros.ecc, parametros.w, parametros.limb_dark, parametros.u = 0.0, 90.0, "quadratic", [0.1, 0.1]
    return parametros, batman.TransitModel(parametros, tempo)


def curva_modelo(tempo: np.ndarray, t0: float, periodo: float, razao: float, a: float, impacto: float, q1: float, q2: float):
    """Fluxo do modelo de Mandel e Agol (órbita circular, escurecimento quadrático de Kipping)."""
    parametros, modelo = _modelo(np.asarray(tempo, dtype=float))
    return _avaliar(parametros, modelo, (t0, periodo, razao, a, impacto, q1, q2))


def _avaliar(parametros, modelo, x) -> np.ndarray:
    t0, periodo, razao, a, impacto, q1, q2 = x
    parametros.t0, parametros.per, parametros.rp, parametros.a = t0, periodo, razao, a
    parametros.inc = math.degrees(math.acos(min(1.0, impacto / a)))
    raiz = math.sqrt(q1)
    parametros.u = [2 * raiz * q2, raiz * (1 - 2 * q2)]
    return modelo.light_curve(parametros)


def ajustar_transito(tempo: np.ndarray, fluxo: np.ndarray, periodo: Periodo) -> Ajuste:
    """Ajusta o trânsito nos pontos perto de cada trânsito, partindo do resultado do BLS."""
    t, f = _validar(tempo, fluxo)
    perto = mascara_de_transito(t, periodo)
    t, f = t[perto], f[perto]
    # Época de referência no meio dos dados: separa época e período no ajuste.
    ciclo = round((np.median(t) - periodo.t0) / periodo.periodo)
    t0 = periodo.t0 + ciclo * periodo.periodo
    razao = math.sqrt(max(periodo.profundidade, 1e-6))
    # Duração total ≈ (P/π)·(R★/a) para impacto zero.
    a = max(1.5, periodo.periodo / (math.pi * periodo.duracao))
    inicio = np.array([t0, periodo.periodo, razao, a, PARAMETRO_DE_IMPACTO_INICIAL, Q_INICIAL, Q_INICIAL])
    folga = periodo.duracao / 2
    inferior = [t0 - folga, periodo.periodo * (1 - 1e-3), 1e-3, 1.01, 0.0, 0.0, 0.0]
    superior = [t0 + folga, periodo.periodo * (1 + 1e-3), 0.5, 200.0, 1.0, 1.0, 1.0]
    parametros, modelo = _modelo(t)

    def residuos(x):
        return _avaliar(parametros, modelo, x) - f

    resultado = least_squares(residuos, inicio, bounds=(inferior, superior), x_scale="jac")
    sigmas = incertezas(resultado.jac, resultado.fun)
    x = resultado.x
    return Ajuste(
        periodo=float(x[1]),
        periodo_sigma=float(sigmas[1]),
        t0=float(x[0]),
        t0_sigma=float(sigmas[0]),
        razao_de_raios=float(x[2]),
        razao_de_raios_sigma=float(sigmas[2]),
        a_sobre_raio=float(x[3]),
        impacto=float(x[4]),
        q1=float(x[5]),
        q2=float(x[6]),
        pontos=int(t.size),
        residuo_ppm=float(np.std(resultado.fun) * 1e6),
    )


def incertezas(jacobiano: np.ndarray, residuos: np.ndarray) -> np.ndarray:
    """Desvio padrão de cada parâmetro: raiz da diagonal de (JᵀJ)⁻¹·s², com s² = Σr²/(n − p)."""
    j = np.asarray(jacobiano, dtype=float)
    n, p = j.shape
    s2 = float(np.sum(np.asarray(residuos, dtype=float) ** 2)) / max(n - p, 1)
    covariancia = np.linalg.pinv(j.T @ j) * s2
    return np.sqrt(np.clip(np.diag(covariancia), 0.0, None))


def sigma_simetrico(erro_superior: float | None, erro_inferior: float | None) -> float | None:
    """Média dos módulos dos erros superior e inferior do catálogo; None se faltar algum."""
    valores = [abs(v) for v in (erro_superior, erro_inferior) if v is not None and math.isfinite(v)]
    return sum(valores) / len(valores) if valores else None


def razao_do_catalogo(linha: dict) -> tuple[float | None, float | None]:
    """Rp/R★ do catálogo e o seu σ: `pl_ratror` quando existe, senão raio do planeta ÷ raio da estrela."""
    if linha.get("pl_ratror") is not None:
        return float(linha["pl_ratror"]), sigma_simetrico(linha.get("pl_ratrorerr1"), linha.get("pl_ratrorerr2"))
    raio, estrela = linha.get("pl_rade"), linha.get("st_rad")
    if raio is None or estrela is None:
        return None, None
    razao = raio * RAIO_DA_TERRA_EM_RAIOS_DO_SOL / estrela
    s_raio = sigma_simetrico(linha.get("pl_radeerr1"), linha.get("pl_radeerr2"))
    s_estrela = sigma_simetrico(linha.get("st_raderr1"), linha.get("st_raderr2"))
    if s_raio is None or s_estrela is None:
        return razao, None
    return razao, razao * math.hypot(s_raio / raio, s_estrela / estrela)


def periodo_bate(medido: float, catalogo: float, tolerancia: float = TOLERANCIA_DO_PERIODO) -> bool:
    return abs(medido - catalogo) <= tolerancia * catalogo


def dentro_de_sigmas(medido: float, sigma_medido: float, catalogo: float, sigma_catalogo: float | None, n: float = SIGMAS_DA_RAZAO) -> bool:
    """|medido − catálogo| ≤ n·√(σ_medido² + σ_catálogo²); sem σ do catálogo, só o próprio."""
    return abs(medido - catalogo) <= n * math.hypot(sigma_medido, sigma_catalogo or 0.0)


def comparar(ajuste: Ajuste, linha: dict) -> dict:
    """Medição × catálogo para um planeta, com os dois critérios do teste."""
    periodo = linha.get("pl_orbper")
    razao, sigma_razao = razao_do_catalogo(linha)
    return {
        "periodo": {
            "medido": ajuste.periodo,
            "sigma": ajuste.periodo_sigma,
            "catalogo": periodo,
            "sigma_catalogo": sigma_simetrico(linha.get("pl_orbpererr1"), linha.get("pl_orbpererr2")),
            "diferenca_relativa": None if periodo is None else (ajuste.periodo - periodo) / periodo,
            "bate": periodo is not None and periodo_bate(ajuste.periodo, periodo),
        },
        "razao_de_raios": {
            "medido": ajuste.razao_de_raios,
            "sigma": ajuste.razao_de_raios_sigma,
            "catalogo": razao,
            "sigma_catalogo": sigma_razao,
            "origem_catalogo": "pl_ratror" if linha.get("pl_ratror") is not None else "pl_rade / st_rad",
            "bate": razao is not None and dentro_de_sigmas(ajuste.razao_de_raios, ajuste.razao_de_raios_sigma, razao, sigma_razao),
        },
    }


def veredito(comparacoes: list[dict], minimo: int = MINIMO_DE_APROVADOS) -> dict:
    """Quantos alvos passaram em cada critério e se o teste de viabilidade foi aprovado."""
    periodos = sum(1 for c in comparacoes if c.get("periodo", {}).get("bate"))
    razoes = sum(1 for c in comparacoes if c.get("razao_de_raios", {}).get("bate"))
    return {
        "alvos": len(comparacoes),
        "minimo": minimo,
        "periodo_bate": periodos,
        "razao_bate": razoes,
        "aprovado": periodos >= minimo and razoes >= minimo,
    }
