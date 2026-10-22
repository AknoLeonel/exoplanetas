"""Medição própria de trânsitos: período por BLS e ajuste do trânsito pelo modelo de Mandel e Agol.

Funções puras sobre vetores de tempo (dias) e fluxo normalizado (1 fora do trânsito). Quem baixa
as curvas de luz do TESS e os valores do catálogo é `scripts/medir_transitos.py`.

- Período: Box Least Squares (Kovács, Zucker e Mazeh 2002), pela implementação do astropy, numa curva
  achatada por mediana móvel.
- Tendência da estrela: tirada trânsito a trânsito, com um polinômio ajustado só fora do trânsito numa
  janela proporcional à duração total T14 (Winn 2010, eq. 14), que é recalculada a cada iteração.
- Trânsito: modelo de Mandel e Agol (2002) pelo batman (Kreidberg 2015), com escurecimento de borda
  quadrático na parametrização de Kipping (2013), q1 e q2 entre 0 e 1. Pontos a mais de 5σ (robusto) saem.
- Incerteza: bootstrap de trânsitos inteiros (sorteio com reposição e novo ajuste), que inclui o ruído
  correlacionado. A incerteza formal, (JᵀJ)⁻¹ escalada pela variância dos resíduos, vai junto para comparação.
- Diagnóstico: densidade da estrela implicada por a/R★ e P (Seager e Mallén-Ornelas 2003).
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass

import batman
import numpy as np
from astropy import constants
from astropy import units as u
from astropy.timeseries import BoxLeastSquares
from scipy.ndimage import median_filter
from scipy.optimize import least_squares

# Critérios do teste de viabilidade (Issue #41).
TOLERANCIA_DO_PERIODO = 1e-3  # 0,1%
SIGMAS_DA_RAZAO = 2.0
MINIMO_DE_APROVADOS = 4

# Busca do período: faixa e durações testadas pelo BLS (dias). Vai até 0,4 dia: o KELT-11 b passa uns 0,3.
PERIODO_MINIMO = 0.5
PERIODO_MAXIMO = 10.0
DURACOES = (0.04, 0.06, 0.08, 0.1, 0.13, 0.17, 0.22, 0.3, 0.4)
# Mediana móvel que achata a curva só para o BLS achar o período (dias), e lacuna que separa trechos.
JANELA_DO_ACHATAMENTO = 1.5
LACUNA = 0.5
# A caixa do BLS é mais curta que o trânsito (não inclui toda a entrada e a saída): ponto de partida de T14.
FATOR_DA_DURACAO_DO_BLS = 1.25

# Tendência trânsito a trânsito, em unidades de T14: janela de ±2·T14, e o trânsito é |Δt| < 0,55·T14 (10% de folga).
MEIA_JANELA_LOCAL = 2.0
MARGEM_DO_TRANSITO = 0.55
GRAU_LOCAL = 2
# Um trânsito só entra se tiver pelo menos metade dos pontos esperados antes, durante e depois.
COBERTURA_MINIMA = 0.5
ITERACOES = 3
SIGMAS_DE_CORTE = 5.0
REAMOSTRAGENS = 100

# Pontos de partida do ajuste (não são resultados: o ajuste os move).
PARAMETRO_DE_IMPACTO_INICIAL = 0.3
Q_INICIAL = 0.36

RAIO_DA_TERRA_EM_RAIOS_DO_SOL = (constants.R_earth / constants.R_sun).decompose().value
SEGUNDOS_POR_DIA = (1 * u.day).to(u.s).value
# Densidade (g/cm³) de uma estrela de 1 M☉ e 1 R☉ espalhada numa esfera.
DENSIDADE_SOLAR = (constants.M_sun / (4 / 3 * math.pi * constants.R_sun**3)).to(u.g / u.cm**3).value


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
    duracao_total: float

    def como_dict(self) -> dict:
        return asdict(self)

    def vetor(self) -> np.ndarray:
        """Os sete parâmetros na ordem do ajuste: t0, P, Rp/R★, a/R★, b, q1, q2."""
        return np.array([self.t0, self.periodo, self.razao_de_raios, self.a_sobre_raio, self.impacto, self.q1, self.q2])


@dataclass(frozen=True)
class Janelas:
    """Pontos perto de cada trânsito, com o fluxo já dividido pela tendência local, e a época de cada ponto."""

    tempo: np.ndarray
    fluxo: np.ndarray
    epoca: np.ndarray

    def filtrar(self, mascara: np.ndarray) -> Janelas:
        return Janelas(self.tempo[mascara], self.fluxo[mascara], self.epoca[mascara])

    @property
    def transitos(self) -> int:
        return int(np.unique(self.epoca).size)


@dataclass(frozen=True)
class Medicao:
    bls: Periodo
    ajuste: Ajuste
    transitos: int
    # Incertezas do bootstrap de trânsitos; as formais ficam no ajuste.
    periodo_sigma: float
    razao_de_raios_sigma: float
    reamostragens: int
    densidade_estelar: float

    def como_dict(self) -> dict:
        return {
            "bls": asdict(self.bls),
            "ajuste": self.ajuste.como_dict(),
            "transitos": self.transitos,
            "periodo_sigma": self.periodo_sigma,
            "razao_de_raios_sigma": self.razao_de_raios_sigma,
            "reamostragens": self.reamostragens,
            "densidade_estelar": self.densidade_estelar,
        }


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


def achatar(
    tempo: np.ndarray, fluxo: np.ndarray, janela: float = JANELA_DO_ACHATAMENTO, lacuna: float = LACUNA
) -> tuple[np.ndarray, np.ndarray]:
    """Divide o fluxo pela mediana móvel de `janela` dias, trecho a trecho (lacunas maiores que `lacuna` separam).

    Serve só para o BLS achar o período: a profundidade sai daqui atenuada nos trânsitos longos, e o ajuste
    usa a tendência local de `normalizar_transitos`. Devolve tempo e fluxo ordenados.
    """
    t, f = _validar(tempo, fluxo)
    cortes = np.flatnonzero(np.diff(t) > lacuna) + 1
    plano = np.empty_like(f)
    for inicio, fim in zip(np.r_[0, cortes], np.r_[cortes, t.size], strict=True):
        trecho = f[inicio:fim]
        cadencia = float(np.median(np.diff(t[inicio:fim]))) if trecho.size > 1 else janela
        tamanho = int(janela / cadencia) | 1
        if tamanho >= trecho.size:
            tendencia = np.full(trecho.size, np.median(trecho))
        else:
            tendencia = median_filter(trecho, size=tamanho, mode="nearest")
        plano[inicio:fim] = trecho / tendencia
    return t, plano


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


def duracao_total(periodo: float, razao: float, a: float, impacto: float) -> float:
    """Duração total T14 do trânsito numa órbita circular (Winn 2010, eq. 14), nas unidades do período.

    T14 = (P/π)·arcsen[√((1 + k)² − b²) / (a·sen i)], com k = Rp/R★, a em raios da estrela e cos i = b/a.
    """
    corda = (1 + razao) ** 2 - impacto**2
    if corda <= 0:
        return 0.0
    seno_i = math.sqrt(1 - (impacto / a) ** 2)
    return periodo / math.pi * math.asin(min(1.0, math.sqrt(corda) / (a * seno_i)))


def normalizar_transitos(
    tempo: np.ndarray,
    fluxo: np.ndarray,
    periodo: float,
    t0: float,
    duracao: float,
    meia_janela: float = MEIA_JANELA_LOCAL,
    grau: int = GRAU_LOCAL,
) -> Janelas:
    """Recorta ±`meia_janela`·T14 em volta de cada trânsito e divide pela tendência local da estrela.

    A tendência é um polinômio de grau `grau` ajustado só aos pontos fora do trânsito (|Δt| > 0,55·T14).
    Trânsitos sem pelo menos metade dos pontos esperados antes, durante e depois ficam de fora.
    """
    t, f = _validar(tempo, fluxo)
    cadencia = float(np.median(np.diff(t)))
    w = meia_janela * duracao
    m = MARGEM_DO_TRANSITO * duracao
    # Pelo menos grau + 1 pontos de base de cada lado, para o polinômio nunca ficar indeterminado.
    esperado_fora = max(COBERTURA_MINIMA * (w - m) / cadencia, grau + 1)
    esperado_dentro = COBERTURA_MINIMA * 2 * m / cadencia
    primeira = math.floor((t[0] - t0) / periodo)
    ultima = math.ceil((t[-1] - t0) / periodo)
    partes: list[tuple[np.ndarray, np.ndarray, np.ndarray]] = []
    for e in range(primeira, ultima + 1):
        centro = t0 + e * periodo
        i0, i1 = np.searchsorted(t, [centro - w, centro + w])
        if i1 - i0 == 0:
            continue
        dt = t[i0:i1] - centro
        fora = np.abs(dt) > m
        antes, depois = (fora & (dt < 0)).sum(), (fora & (dt > 0)).sum()
        if min(antes, depois) < esperado_fora or (~fora).sum() < esperado_dentro:
            continue
        coeficientes = np.polyfit(dt[fora] / duracao, f[i0:i1][fora], grau)
        tendencia = np.polyval(coeficientes, dt / duracao)
        partes.append((t[i0:i1], f[i0:i1] / tendencia, np.full(i1 - i0, e)))
    if not partes:
        raise ValueError("nenhum trânsito completo para medir")
    return Janelas(*(np.concatenate(coluna) for coluna in zip(*partes, strict=True)))


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


def ajustar_transito(tempo: np.ndarray, fluxo: np.ndarray, inicio: Periodo, x0: np.ndarray | None = None) -> Ajuste:
    """Ajusta o trânsito em todos os pontos dados (normalizados), partindo de `inicio` ou do vetor `x0`.

    Sem `x0`, a época de referência é o trânsito mais perto do meio dos dados, o que separa época e período.
    """
    t, f = _validar(tempo, fluxo)
    if x0 is None:
        ciclo = round((np.median(t) - inicio.t0) / inicio.periodo)
        t0 = inicio.t0 + ciclo * inicio.periodo
        razao = math.sqrt(max(inicio.profundidade, 1e-6))
        # Duração total ≈ (P/π)·(R★/a) para impacto zero.
        a = max(1.5, inicio.periodo / (math.pi * inicio.duracao))
        partida = np.array([t0, inicio.periodo, razao, a, PARAMETRO_DE_IMPACTO_INICIAL, Q_INICIAL, Q_INICIAL])
    else:
        partida = np.array(x0, dtype=float)
        t0 = float(partida[0])
    folga = inicio.duracao / 2
    inferior = np.array([t0 - folga, inicio.periodo * (1 - 1e-3), 1e-3, 1.01, 0.0, 0.0, 0.0])
    superior = np.array([t0 + folga, inicio.periodo * (1 + 1e-3), 0.5, 200.0, 1.0, 1.0, 1.0])
    partida = np.clip(partida, inferior, superior)
    parametros, modelo = _modelo(t)

    def residuos(x):
        return _avaliar(parametros, modelo, x) - f

    resultado = least_squares(residuos, partida, bounds=(inferior, superior), x_scale="jac")
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
        duracao_total=duracao_total(x[1], x[2], x[3], x[4]),
    )


def sem_pontos_fora_da_curva(residuos: np.ndarray, n: float = SIGMAS_DE_CORTE) -> np.ndarray:
    """Máscara dos pontos a até `n` desvios robustos (1,4826 × desvio absoluto mediano) da mediana dos resíduos."""
    r = np.asarray(residuos, dtype=float)
    desvio = np.abs(r - np.median(r))
    return desvio <= n * 1.4826 * np.median(desvio)


def bootstrap(janelas: Janelas, inicio: Periodo, ajuste: Ajuste, reamostragens: int = REAMOSTRAGENS, semente: int = 0) -> np.ndarray:
    """Desvio padrão de cada parâmetro sorteando trânsitos inteiros com reposição e reajustando.

    Cada trânsito leva junto o seu ruído correlacionado (manchas, granulação, resto de tendência), que a
    incerteza formal ignora. A semente fixa deixa o resultado reprodutível.
    """
    gerador = np.random.default_rng(semente)
    grupos = [np.flatnonzero(janelas.epoca == e) for e in np.unique(janelas.epoca)]
    x0 = ajuste.vetor()
    amostras = np.empty((reamostragens, x0.size))
    for i in range(reamostragens):
        indices = np.concatenate([grupos[k] for k in gerador.integers(0, len(grupos), len(grupos))])
        amostras[i] = ajustar_transito(janelas.tempo[indices], janelas.fluxo[indices], inicio, x0).vetor()
    return np.std(amostras, axis=0, ddof=1)


def densidade_estelar(periodo: float, a_sobre_raio: float) -> float:
    """Densidade média da estrela (g/cm³) pela 3ª lei de Kepler: ρ★ = 3π(a/R★)³/(G·P²), P em dias.

    Seager e Mallén-Ornelas (2003), eq. 30, desprezando a massa do planeta.
    """
    p = periodo * SEGUNDOS_POR_DIA
    rho = 3 * math.pi * a_sobre_raio**3 / (constants.G.value * p**2)
    return (rho * u.kg / u.m**3).to(u.g / u.cm**3).value


def medir(tempo: np.ndarray, fluxo: np.ndarray, reamostragens: int = REAMOSTRAGENS, semente: int = 0) -> tuple[Medicao, Janelas]:
    """Do fluxo bruto (normalizado, com a variação da estrela) à medição com incerteza de bootstrap.

    1. achata e acha o período por BLS;
    2. repete ITERACOES vezes: tendência local com o T14 atual, ajuste, corte dos pontos fora da curva,
       novo ajuste e novo T14;
    3. bootstrap de trânsitos inteiros.
    """
    t, f = _validar(tempo, fluxo)
    estimativa = buscar_periodo(*achatar(t, f))
    resultado_bls = estimativa
    inicio = Periodo(estimativa.periodo, estimativa.t0, estimativa.duracao * FATOR_DA_DURACAO_DO_BLS, estimativa.profundidade)
    x0: np.ndarray | None = None
    for _ in range(ITERACOES):
        janelas = normalizar_transitos(t, f, inicio.periodo, inicio.t0, inicio.duracao)
        ajuste = ajustar_transito(janelas.tempo, janelas.fluxo, inicio, x0)
        residuos = curva_modelo(janelas.tempo, *ajuste.vetor()) - janelas.fluxo
        janelas = janelas.filtrar(sem_pontos_fora_da_curva(residuos))
        ajuste = ajustar_transito(janelas.tempo, janelas.fluxo, inicio, ajuste.vetor())
        x0 = ajuste.vetor()
        inicio = Periodo(ajuste.periodo, ajuste.t0, ajuste.duracao_total, ajuste.razao_de_raios**2)
    sigmas = bootstrap(janelas, inicio, ajuste, reamostragens, semente)
    medicao = Medicao(
        bls=resultado_bls,
        ajuste=ajuste,
        transitos=janelas.transitos,
        periodo_sigma=float(sigmas[1]),
        razao_de_raios_sigma=float(sigmas[2]),
        reamostragens=reamostragens,
        densidade_estelar=densidade_estelar(ajuste.periodo, ajuste.a_sobre_raio),
    )
    return medicao, janelas


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


def densidade_do_catalogo(linha: dict) -> float | None:
    """Densidade média da estrela (g/cm³) pela massa e pelo raio do catálogo (st_mass em M☉, st_rad em R☉)."""
    massa, raio = linha.get("st_mass"), linha.get("st_rad")
    if massa is None or raio is None:
        return None
    return DENSIDADE_SOLAR * massa / raio**3


def comparar(medicao: Medicao, linha: dict) -> dict:
    """Medição × catálogo para um planeta, com os dois critérios do teste e o diagnóstico da densidade."""
    ajuste = medicao.ajuste
    periodo = linha.get("pl_orbper")
    razao, sigma_razao = razao_do_catalogo(linha)
    combinado = math.hypot(medicao.razao_de_raios_sigma, sigma_razao or 0.0)
    rho = densidade_do_catalogo(linha)
    return {
        "periodo": {
            "medido": ajuste.periodo,
            "sigma": medicao.periodo_sigma,
            "sigma_formal": ajuste.periodo_sigma,
            "catalogo": periodo,
            "sigma_catalogo": sigma_simetrico(linha.get("pl_orbpererr1"), linha.get("pl_orbpererr2")),
            "diferenca_relativa": None if periodo is None else (ajuste.periodo - periodo) / periodo,
            "bate": periodo is not None and periodo_bate(ajuste.periodo, periodo),
        },
        "razao_de_raios": {
            "medido": ajuste.razao_de_raios,
            "sigma": medicao.razao_de_raios_sigma,
            "sigma_formal": ajuste.razao_de_raios_sigma,
            "catalogo": razao,
            "sigma_catalogo": sigma_razao,
            "origem_catalogo": "pl_ratror" if linha.get("pl_ratror") is not None else "pl_rade / st_rad",
            "diferenca_em_sigmas": None if razao is None or combinado == 0 else (ajuste.razao_de_raios - razao) / combinado,
            "bate": razao is not None and dentro_de_sigmas(ajuste.razao_de_raios, medicao.razao_de_raios_sigma, razao, sigma_razao),
        },
        "densidade_estelar": {
            "ajuste": medicao.densidade_estelar,
            "catalogo": rho,
            "razao": None if rho is None else medicao.densidade_estelar / rho,
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
