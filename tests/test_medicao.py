"""Medição própria de trânsitos: período e Rp/R★ recuperados de curvas sintéticas com valores injetados."""

import dataclasses
import importlib.util
import math
import urllib.parse

import numpy as np
import pytest
from astropy import constants
from astropy import units as u

from exoplanetas import dados, medicao

# Planeta injetado nas curvas sintéticas.
T0, PERIODO, RAZAO, A, IMPACTO, Q1, Q2 = 1.3, 2.5, 0.1, 8.0, 0.3, 0.4, 0.3
RUIDO = 3e-4
CADENCIA = 10 / 1440  # 10 minutos, para os testes serem rápidos
# Variação da estrela (manchas girando): 0,5% com período de 10 dias.
VARIACAO, PERIODO_DA_VARIACAO = 5e-3, 10.0


def sintetica(trechos=((0.0, 27.0),), semente=1, variacao=0.0):
    rng = np.random.default_rng(semente)
    t = np.concatenate([np.arange(a, b, CADENCIA) for a, b in trechos])
    estrela = 1 + variacao * np.sin(2 * np.pi * t / PERIODO_DA_VARIACAO)
    f = medicao.curva_modelo(t, T0, PERIODO, RAZAO, A, IMPACTO, Q1, Q2) * estrela + rng.normal(0, RUIDO, t.size)
    return t, f


@pytest.fixture(scope="module")
def medido():
    t, f = sintetica(((0.0, 27.0), (400.0, 427.0)), variacao=VARIACAO)
    return medicao.medir(t, f, reamostragens=20)


def test_o_modelo_vale_um_fora_do_transito_e_afunda_cerca_de_rp_ao_quadrado_no_centro():
    t = np.array([T0 - PERIODO / 2, T0])
    fora, centro = medicao.curva_modelo(t, T0, PERIODO, RAZAO, A, IMPACTO, Q1, Q2)
    assert fora == 1.0
    # Com escurecimento de borda, o centro fica mais fundo que rp² (a borda é mais escura que a média).
    assert RAZAO**2 < 1 - centro < 1.5 * RAZAO**2


def test_validar_recusa_vetores_desiguais_ou_curtos_e_ordena_sem_nan():
    with pytest.raises(ValueError, match="mesmo tamanho"):
        medicao._validar(np.zeros(200), np.zeros(199))
    with pytest.raises(ValueError, match="mesmo tamanho"):
        medicao._validar(np.zeros((2, 200)), np.zeros((2, 200)))
    with pytest.raises(ValueError, match="insuficientes"):
        medicao._validar(np.arange(99.0), np.ones(99))
    t = np.r_[np.arange(150.0)[::-1], np.nan]
    f = np.r_[np.ones(150), 1.0]
    f[0] = np.nan
    tv, fv = medicao._validar(t, f)
    assert tv.size == 149 and np.all(np.diff(tv) > 0) and np.all(np.isfinite(fv))


def test_primeiro_trecho_para_na_primeira_lacuna_grande():
    t = np.r_[np.arange(0, 10, 0.5), np.arange(30, 40, 0.5)]
    assert medicao.primeiro_trecho(t).sum() == 20
    assert medicao.primeiro_trecho(t, lacuna=50).all()
    assert medicao.primeiro_trecho(np.arange(0, 10, 0.5)).all()


def test_achatar_tira_a_variacao_lenta_da_estrela_trecho_a_trecho():
    t = np.r_[np.arange(0.0, 27.0, CADENCIA), np.arange(30.0, 30.5, CADENCIA)]
    f = 1 + 0.01 * np.sin(2 * np.pi * t / PERIODO_DA_VARIACAO)
    tp, plano = medicao.achatar(t[::-1], f[::-1])
    assert np.all(np.diff(tp) > 0)
    longo = tp < 28
    assert np.std(f[longo]) > 5e-3
    assert np.std(plano[longo]) < 5e-4
    # Trecho mais curto que a janela: dividido pela própria mediana.
    curto = f[~longo]
    assert plano[~longo] == pytest.approx(curto / np.median(curto))


def test_bls_acha_o_periodo_num_setor():
    t, f = sintetica()
    p = medicao.bls(t, f)
    assert abs(p.periodo - PERIODO) / PERIODO < 5e-3
    assert abs((p.t0 - T0 + PERIODO / 2) % PERIODO - PERIODO / 2) < 0.02
    assert p.profundidade == pytest.approx(RAZAO**2, rel=0.25)
    assert 0.05 < p.duracao < 0.2
    # Com uma grade dada, o pico sai dela.
    grade = np.linspace(2.4, 2.6, 201)
    assert medicao.bls(t, f, grade).periodo in grade


def test_um_setor_so_nao_refina_e_dois_setores_refinam_o_periodo():
    t, f = sintetica()
    assert medicao.buscar_periodo(t, f) == medicao.bls(t, f)
    t, f = sintetica(((0.0, 27.0), (400.0, 427.0)))
    assert abs(medicao.buscar_periodo(t, f).periodo - PERIODO) / PERIODO < 1e-4


def test_a_grade_refinada_cobre_a_incerteza_com_passo_fino():
    estimativa = medicao.Periodo(periodo=2.5, t0=0.0, duracao=0.1, profundidade=0.01)
    grade = medicao.grade_refinada(estimativa, trecho=27.0, base=427.0)
    assert grade[0] == pytest.approx(2.5 - 2 * 2.5 * 0.1 / 27)
    assert grade[-1] == pytest.approx(2.5 + 2 * 2.5 * 0.1 / 27)
    assert np.max(np.diff(grade)) <= 2.5 * 0.1 / (4 * 427.0)
    assert grade.size == math.ceil(2 * (2 * 2.5 * 0.1 / 27) / (2.5 * 0.1 / (4 * 427.0))) + 1


def test_a_duracao_total_bate_com_o_trecho_em_que_o_modelo_fica_abaixo_de_um():
    passo = 1e-5
    for razao, a, impacto in ((RAZAO, A, IMPACTO), (0.05, 4.9, 0.4), (0.15, 3.5, 0.9)):
        t = np.arange(T0 - 0.3, T0 + 0.3, passo)
        abaixo = t[medicao.curva_modelo(t, T0, PERIODO, razao, a, impacto, Q1, Q2) < 1]
        assert medicao.duracao_total(PERIODO, razao, a, impacto) == pytest.approx(abaixo[-1] - abaixo[0], abs=3 * passo)
    # Impacto além de 1 + k: o planeta não cruza o disco.
    assert medicao.duracao_total(PERIODO, 0.1, 8.0, 1.1) == 0.0
    # a/R★ pequeno demais para a fórmula: o arco-seno satura em meio período.
    assert medicao.duracao_total(PERIODO, 0.5, 1.01, 0.0) == pytest.approx(PERIODO / 2)


def test_normalizar_transitos_tira_a_tendencia_e_preserva_a_profundidade():
    t, f = sintetica(variacao=VARIACAO)
    duracao = medicao.duracao_total(PERIODO, RAZAO, A, IMPACTO)
    janelas = medicao.normalizar_transitos(t, f, PERIODO, T0, duracao)
    epocas = np.unique(janelas.epoca)
    assert epocas.tolist() == list(range(0, 11)) and janelas.transitos == 11
    dt = janelas.tempo - (T0 + janelas.epoca * PERIODO)
    assert np.all(np.abs(dt) < medicao.MEIA_JANELA_LOCAL * duracao)
    fora = np.abs(dt) > medicao.MARGEM_DO_TRANSITO * duracao
    assert np.mean(janelas.fluxo[fora]) == pytest.approx(1.0, abs=2e-5)
    assert np.std(janelas.fluxo[fora]) == pytest.approx(RUIDO, rel=0.1)
    modelo = medicao.curva_modelo(janelas.tempo, T0, PERIODO, RAZAO, A, IMPACTO, Q1, Q2)
    assert np.mean(janelas.fluxo[~fora] - modelo[~fora]) == pytest.approx(0.0, abs=2e-5)
    # Filtrar mantém as três colunas alinhadas.
    so_fora = janelas.filtrar(fora)
    assert so_fora.tempo.size == so_fora.fluxo.size == so_fora.epoca.size == fora.sum()


def test_normalizar_transitos_descarta_trânsitos_sem_base_dos_dois_lados_ou_sem_o_meio():
    t, f = sintetica()
    duracao = medicao.duracao_total(PERIODO, RAZAO, A, IMPACTO)
    centro1, centro2 = T0 + PERIODO, T0 + 3 * PERIODO
    # Lacuna logo depois do trânsito 1 (sem base à direita) e no meio do trânsito 3 (sem o trânsito).
    tira = ((t > centro1 + 0.6 * duracao) & (t < centro1 + 3 * duracao)) | (np.abs(t - centro2) < 0.5 * duracao)
    janelas = medicao.normalizar_transitos(t[~tira], f[~tira], PERIODO, T0, duracao)
    assert 1 not in janelas.epoca and 3 not in janelas.epoca
    assert {0, 2, 4} <= set(janelas.epoca.tolist())
    with pytest.raises(ValueError, match="nenhum trânsito completo"):
        medicao.normalizar_transitos(t, f, PERIODO, T0 + PERIODO / 2, duracao, meia_janela=0.3)


def test_pontos_fora_da_curva_saem_e_o_resto_fica():
    rng = np.random.default_rng(5)
    r = rng.normal(0, 1e-3, 2000)
    r[[10, 500]] = [0.02, -0.02]
    ok = medicao.sem_pontos_fora_da_curva(r)
    assert not ok[10] and not ok[500]
    assert ok.sum() >= 1990


def test_a_medicao_recupera_os_valores_injetados_com_a_estrela_variando(medido):
    m, janelas = medido
    aj = m.ajuste
    assert abs(aj.periodo - PERIODO) < 4 * m.periodo_sigma
    assert abs(aj.razao_de_raios - RAZAO) < 4 * m.razao_de_raios_sigma
    assert m.razao_de_raios_sigma < 0.01 * RAZAO
    assert aj.duracao_total == pytest.approx(medicao.duracao_total(PERIODO, RAZAO, A, IMPACTO), rel=0.02)
    assert aj.a_sobre_raio == pytest.approx(A, rel=0.1)
    assert 0 <= aj.impacto < 0.6
    assert 0 <= aj.q1 <= 1 and 0 <= aj.q2 <= 1
    assert aj.residuo_ppm == pytest.approx(RUIDO * 1e6, rel=0.1)
    # Época de referência num trânsito perto do meio dos dados.
    ciclos = (aj.t0 - T0) / PERIODO
    assert abs(ciclos - round(ciclos)) < 1e-3
    # 11 trânsitos inteiros em cada setor de 27 dias.
    assert m.transitos == janelas.transitos == 22
    assert aj.pontos == janelas.tempo.size
    assert m.reamostragens == 20
    assert m.bls.periodo == pytest.approx(PERIODO, rel=1e-4)
    assert m.densidade_estelar == pytest.approx(medicao.densidade_estelar(aj.periodo, aj.a_sobre_raio))
    d = m.como_dict()
    assert d["ajuste"]["razao_de_raios"] == aj.razao_de_raios
    assert d["bls"]["periodo"] == m.bls.periodo
    assert {"transitos", "periodo_sigma", "razao_de_raios_sigma", "reamostragens", "densidade_estelar"} <= d.keys()
    assert aj.vetor().tolist() == [aj.t0, aj.periodo, aj.razao_de_raios, aj.a_sobre_raio, aj.impacto, aj.q1, aj.q2]


def test_a_incerteza_do_bootstrap_acompanha_o_espalhamento_real_com_ruido_vermelho():
    # 12 realizações com ruído correlacionado de ~1 hora (manchas, granulação) por cima do ruído branco:
    # a incerteza do bootstrap de uma medição tem de ser da ordem do espalhamento entre as medições.
    t = np.concatenate([np.arange(a, b, CADENCIA) for a, b in ((0.0, 27.0), (400.0, 427.0))])
    modelo = medicao.curva_modelo(t, T0, PERIODO, RAZAO, A, IMPACTO, Q1, Q2)
    duracao = medicao.duracao_total(PERIODO, RAZAO, A, IMPACTO)
    inicio = medicao.Periodo(PERIODO, T0, duracao, RAZAO**2)
    nucleo = np.exp(-0.5 * (np.arange(-24, 25) / 6) ** 2)
    nucleo /= np.sqrt(np.sum(nucleo**2))
    razoes, sigmas = [], []
    for semente in range(12):
        rng = np.random.default_rng(semente)
        vermelho = np.convolve(rng.normal(0, 1, t.size), nucleo, "same") * 3e-4
        janelas = medicao.normalizar_transitos(t, modelo + rng.normal(0, 1e-4, t.size) + vermelho, PERIODO, T0, duracao)
        ajuste = medicao.ajustar_transito(janelas.tempo, janelas.fluxo, inicio)
        razoes.append(ajuste.razao_de_raios)
        sigmas.append(medicao.bootstrap(janelas, inicio, ajuste, reamostragens=20)[2])
    assert 0.5 < np.mean(sigmas) / np.std(razoes, ddof=1) < 2
    # Mesma semente, mesmo resultado.
    primeira = medicao.bootstrap(janelas, inicio, ajuste, reamostragens=5)
    assert np.array_equal(primeira, medicao.bootstrap(janelas, inicio, ajuste, reamostragens=5))


def test_incertezas_da_regressao_linear_batem_com_a_formula_fechada():
    rng = np.random.default_rng(3)
    x = np.linspace(0, 1, 50)
    r = rng.normal(0, 0.1, 50)
    j = np.c_[x, np.ones_like(x)]
    s2 = np.sum(r**2) / 48
    esperado = np.sqrt(np.diag(np.linalg.inv(j.T @ j)) * s2)
    assert medicao.incertezas(j, r) == pytest.approx(esperado)


def test_densidade_da_estrela_pela_terceira_lei_de_kepler_e_pelo_catalogo():
    # Terra em volta do Sol: a/R★ = 1 UA / R☉ e P = 1 ano sideral (365,256363 dias) dão a densidade do Sol.
    a_sobre_raio = (constants.au / constants.R_sun).decompose().value
    assert medicao.densidade_estelar(365.256363, a_sobre_raio) == pytest.approx(medicao.DENSIDADE_SOLAR, rel=1e-4)
    # NASA Sun Fact Sheet: densidade média de 1.408 kg/m³.
    assert pytest.approx(1.408, rel=2e-3) == medicao.DENSIDADE_SOLAR
    assert (1 * u.day).to(u.s).value == medicao.SEGUNDOS_POR_DIA
    assert medicao.densidade_do_catalogo({"st_mass": 1.0, "st_rad": 1.0}) == pytest.approx(medicao.DENSIDADE_SOLAR)
    assert medicao.densidade_do_catalogo({"st_mass": 1.0, "st_rad": 2.0}) == pytest.approx(medicao.DENSIDADE_SOLAR / 8)
    assert medicao.densidade_do_catalogo({"st_mass": None, "st_rad": 1.0}) is None
    assert medicao.densidade_do_catalogo({}) is None


def test_sigma_simetrico():
    assert medicao.sigma_simetrico(0.2, -0.4) == pytest.approx(0.3)
    assert medicao.sigma_simetrico(0.2, None) == 0.2
    assert medicao.sigma_simetrico(None, float("nan")) is None


def test_razao_do_catalogo_usa_pl_ratror_ou_os_raios():
    assert medicao.razao_do_catalogo({"pl_ratror": 0.1, "pl_ratrorerr1": 0.002, "pl_ratrorerr2": -0.002}) == (0.1, 0.002)
    assert medicao.razao_do_catalogo({"pl_ratror": 0.1}) == (0.1, None)
    assert medicao.razao_do_catalogo({"pl_ratror": None, "pl_rade": 11.0}) == (None, None)
    linha = {"pl_rade": 11.0, "st_rad": 1.0}
    razao, sigma = medicao.razao_do_catalogo(linha)
    assert razao == pytest.approx(11.0 * medicao.RAIO_DA_TERRA_EM_RAIOS_DO_SOL)
    assert sigma is None
    # Raio da Terra ÷ raio do Sol (IAU 2015: 6.378,1 km e 695.700 km).
    assert pytest.approx(6378.1 / 695700, rel=1e-6) == medicao.RAIO_DA_TERRA_EM_RAIOS_DO_SOL
    linha |= {"pl_radeerr1": 0.11, "pl_radeerr2": -0.11, "st_raderr1": 0.02, "st_raderr2": -0.02}
    razao, sigma = medicao.razao_do_catalogo(linha)
    assert sigma == pytest.approx(razao * math.hypot(0.01, 0.02))


def test_criterios_de_periodo_e_de_sigmas():
    assert medicao.periodo_bate(2.5025, 2.5)
    assert not medicao.periodo_bate(2.5026, 2.5)
    assert medicao.periodo_bate(2.6, 2.5, tolerancia=0.05)
    assert medicao.dentro_de_sigmas(0.105, 0.003, 0.1, 0.0)  # 5e-3 ≤ 2·3e-3
    assert not medicao.dentro_de_sigmas(0.105, 0.002, 0.1, None)
    assert medicao.dentro_de_sigmas(0.105, 0.002, 0.1, 0.0015)  # 2·2,5e-3
    assert not medicao.dentro_de_sigmas(0.105, 0.002, 0.1, 0.0015, n=1.9)


def test_comparar_usa_a_incerteza_do_bootstrap_e_veredito(medido):
    m, _ = medido
    aj = m.ajuste
    linha = {
        "pl_orbper": PERIODO,
        "pl_orbpererr1": 1e-5,
        "pl_orbpererr2": -1e-5,
        "pl_ratror": RAZAO,
        "pl_ratrorerr1": 0.001,
        "st_mass": 1.0,
        "st_rad": 1.0,
    }
    c = medicao.comparar(m, linha)
    assert c["periodo"]["bate"] and c["razao_de_raios"]["bate"]
    assert c["periodo"]["sigma"] == m.periodo_sigma and c["periodo"]["sigma_formal"] == aj.periodo_sigma
    assert c["periodo"]["sigma_catalogo"] == 1e-5
    assert c["periodo"]["diferenca_relativa"] == pytest.approx((aj.periodo - PERIODO) / PERIODO)
    r = c["razao_de_raios"]
    assert r["sigma"] == m.razao_de_raios_sigma and r["sigma_formal"] == aj.razao_de_raios_sigma
    assert r["origem_catalogo"] == "pl_ratror"
    assert r["diferenca_em_sigmas"] == pytest.approx((aj.razao_de_raios - RAZAO) / math.hypot(m.razao_de_raios_sigma, 0.001))
    assert c["densidade_estelar"] == {
        "ajuste": m.densidade_estelar,
        "catalogo": pytest.approx(medicao.DENSIDADE_SOLAR),
        "razao": pytest.approx(m.densidade_estelar / medicao.DENSIDADE_SOLAR),
    }
    # Uma diferença de 2,5σ só da nossa incerteza não passa.
    longe = dataclasses.replace(m, razao_de_raios_sigma=abs(aj.razao_de_raios - RAZAO - 0.01) / 2.5)
    assert not medicao.comparar(longe, linha | {"pl_ratror": RAZAO + 0.01, "pl_ratrorerr1": None})["razao_de_raios"]["bate"]

    sem = medicao.comparar(m, {"pl_orbper": None, "pl_ratror": None, "pl_rade": 1.0, "st_rad": 1.0})
    assert not sem["periodo"]["bate"] and sem["periodo"]["diferenca_relativa"] is None
    assert sem["razao_de_raios"]["origem_catalogo"] == "pl_rade / st_rad"
    assert sem["densidade_estelar"]["catalogo"] is None and sem["densidade_estelar"]["razao"] is None
    vazio = medicao.comparar(m, {})["razao_de_raios"]
    assert not vazio["bate"] and vazio["diferenca_em_sigmas"] is None
    sem_sigma = medicao.comparar(dataclasses.replace(m, razao_de_raios_sigma=0.0), {"pl_ratror": RAZAO})
    assert sem_sigma["razao_de_raios"]["diferenca_em_sigmas"] is None

    ok = {"periodo": {"bate": True}, "razao_de_raios": {"bate": True}}
    so_periodo = {"periodo": {"bate": True}, "razao_de_raios": {"bate": False}}
    erro = {"planeta": "X", "erro": "falhou"}
    assert medicao.veredito([ok] * 4 + [erro]) == {
        "alvos": 5,
        "minimo": 4,
        "periodo_bate": 4,
        "razao_bate": 4,
        "aprovado": True,
    }
    assert not medicao.veredito([ok] * 3 + [so_periodo, erro])["aprovado"]
    assert medicao.veredito([ok], minimo=1)["aprovado"]


def _script():
    spec = importlib.util.spec_from_file_location("medir_transitos", dados.RAIZ / "scripts" / "medir_transitos.py")
    script = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(script)
    return script


def test_o_script_consulta_o_catalogo_e_resume_o_resultado():
    script = _script()
    consulta = urllib.parse.parse_qs(urllib.parse.urlparse(script.montar_url(["WASP-18 b", "K2-18 b"])).query)
    assert consulta["format"] == ["json"]
    assert consulta["query"][0].endswith("from pscomppars where pl_name in ('WASP-18 b','K2-18 b')")
    assert "pl_ratror" in consulta["query"][0] and "st_mass" in consulta["query"][0]
    assert "('O''Neil b')" in urllib.parse.unquote_plus(script.montar_url(["O'Neil b"]))
    medido = {
        "planeta": "X b",
        "setores_tess": [2, 29],
        "transitos": 40,
        "periodo": {"medido": 2.5, "sigma": 1e-6, "catalogo": 2.5, "bate": True},
        "razao_de_raios": {
            "medido": 0.1,
            "sigma": 1e-3,
            "catalogo": None,
            "sigma_catalogo": None,
            "diferenca_em_sigmas": None,
            "bate": False,
        },
        "densidade_estelar": {"ajuste": 1.0, "catalogo": None, "razao": None},
    }
    com_catalogo = medido | {
        "planeta": "Z b",
        "razao_de_raios": medido["razao_de_raios"] | {"catalogo": 0.1, "sigma_catalogo": 1e-3, "diferenca_em_sigmas": -1.234},
        "densidade_estelar": {"ajuste": 1.0, "catalogo": 1.25, "razao": 0.8},
    }
    alvos = [medido, com_catalogo, {"planeta": "Y b", "erro": "sem curva"}]
    resultado = {"alvos": alvos, "veredito": medicao.veredito([medido], minimo=1)}
    texto = script.resumo(resultado)
    assert texto.startswith("## Medição própria de trânsitos: reprovado")
    assert "| X b | 2.5000000 ± 1.0e-06 ✅ | 2.5 | 0.10000 ± 0.00100 ❌ | — | — | — | 40 | 2, 29 |" in texto
    assert "| Z b | 2.5000000 ± 1.0e-06 ✅ | 2.5 | 0.10000 ± 0.00100 ❌ | 0.10000 ± 0.00100 | -1.2 | 0.80 | 40 | 2, 29 |" in texto
    assert "| Y b | erro: sem curva |" in texto
