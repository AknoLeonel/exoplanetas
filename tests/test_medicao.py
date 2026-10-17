"""Medição própria de trânsitos: período e Rp/R★ recuperados de curvas sintéticas com valores injetados."""

import importlib.util
import math
import urllib.parse

import numpy as np
import pytest

from exoplanetas import dados, medicao

# Planeta injetado nas curvas sintéticas.
T0, PERIODO, RAZAO, A, IMPACTO, Q1, Q2 = 1.3, 2.5, 0.1, 8.0, 0.3, 0.4, 0.3
RUIDO = 3e-4
CADENCIA = 10 / 1440  # 10 minutos, para os testes serem rápidos


def sintetica(trechos=((0.0, 27.0),), semente=1):
    rng = np.random.default_rng(semente)
    t = np.concatenate([np.arange(a, b, CADENCIA) for a, b in trechos])
    f = medicao.curva_modelo(t, T0, PERIODO, RAZAO, A, IMPACTO, Q1, Q2) + rng.normal(0, RUIDO, t.size)
    return t, f


@pytest.fixture(scope="module")
def dois_setores():
    t, f = sintetica(((0.0, 27.0), (400.0, 427.0)))
    periodo = medicao.buscar_periodo(t, f)
    return t, f, periodo, medicao.ajustar_transito(t, f, periodo)


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


def test_um_setor_so_nao_refina_e_dois_setores_refinam_o_periodo(dois_setores):
    t, f = sintetica()
    assert medicao.buscar_periodo(t, f) == medicao.bls(t, f)
    _, _, periodo, _ = dois_setores
    assert abs(periodo.periodo - PERIODO) / PERIODO < 1e-4


def test_a_grade_refinada_cobre_a_incerteza_com_passo_fino():
    estimativa = medicao.Periodo(periodo=2.5, t0=0.0, duracao=0.1, profundidade=0.01)
    grade = medicao.grade_refinada(estimativa, trecho=27.0, base=427.0)
    assert grade[0] == pytest.approx(2.5 - 2 * 2.5 * 0.1 / 27)
    assert grade[-1] == pytest.approx(2.5 + 2 * 2.5 * 0.1 / 27)
    assert np.max(np.diff(grade)) <= 2.5 * 0.1 / (4 * 427.0)
    assert grade.size == math.ceil(2 * (2 * 2.5 * 0.1 / 27) / (2.5 * 0.1 / (4 * 427.0))) + 1


def test_mascara_de_transito_marca_so_perto_de_cada_centro():
    p = medicao.Periodo(periodo=2.0, t0=1.0, duracao=0.1, profundidade=0.01)
    t = np.array([1.0, 1.14, 1.16, 3.0, 2.0, 0.86, 0.84])
    assert medicao.mascara_de_transito(t, p).tolist() == [True, True, False, True, False, True, False]
    assert medicao.mascara_de_transito(t, p, janela=1.0).tolist() == [True, False, False, True, False, False, False]


def test_o_ajuste_recupera_os_valores_injetados_dentro_da_incerteza(dois_setores):
    t, _, _, ajuste = dois_setores
    assert abs(ajuste.periodo - PERIODO) < 4 * ajuste.periodo_sigma
    assert abs(ajuste.razao_de_raios - RAZAO) < 4 * ajuste.razao_de_raios_sigma
    assert ajuste.razao_de_raios_sigma < 0.01 * RAZAO
    # A época de referência fica no meio dos dados, num trânsito.
    assert abs(((ajuste.t0 - T0) / PERIODO) - round((ajuste.t0 - T0) / PERIODO)) < 1e-3
    assert abs(ajuste.t0 - T0 - round((ajuste.t0 - T0) / PERIODO) * PERIODO) < 4 * ajuste.t0_sigma + 1e-4
    assert ajuste.a_sobre_raio == pytest.approx(A, rel=0.1)
    assert 0 <= ajuste.impacto < 0.6
    assert 0 <= ajuste.q1 <= 1 and 0 <= ajuste.q2 <= 1
    assert ajuste.residuo_ppm == pytest.approx(RUIDO * 1e6, rel=0.1)
    assert 0 < ajuste.pontos < t.size
    assert ajuste.como_dict()["razao_de_raios"] == ajuste.razao_de_raios


def test_incertezas_da_regressao_linear_batem_com_a_formula_fechada():
    rng = np.random.default_rng(3)
    x = np.linspace(0, 1, 50)
    r = rng.normal(0, 0.1, 50)
    j = np.c_[x, np.ones_like(x)]
    s2 = np.sum(r**2) / 48
    esperado = np.sqrt(np.diag(np.linalg.inv(j.T @ j)) * s2)
    assert medicao.incertezas(j, r) == pytest.approx(esperado)


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


def test_comparar_e_veredito(dois_setores):
    *_, ajuste = dois_setores
    linha = {"pl_orbper": PERIODO, "pl_orbpererr1": 1e-5, "pl_orbpererr2": -1e-5, "pl_ratror": RAZAO, "pl_ratrorerr1": 0.001}
    c = medicao.comparar(ajuste, linha)
    assert c["periodo"]["bate"] and c["razao_de_raios"]["bate"]
    assert c["periodo"]["sigma_catalogo"] == 1e-5
    assert c["periodo"]["diferenca_relativa"] == pytest.approx((ajuste.periodo - PERIODO) / PERIODO)
    assert c["razao_de_raios"]["origem_catalogo"] == "pl_ratror"
    sem = medicao.comparar(ajuste, {"pl_orbper": None, "pl_ratror": None, "pl_rade": 1.0, "st_rad": 1.0})
    assert not sem["periodo"]["bate"] and sem["periodo"]["diferenca_relativa"] is None
    assert sem["razao_de_raios"]["origem_catalogo"] == "pl_rade / st_rad"
    assert not medicao.comparar(ajuste, {})["razao_de_raios"]["bate"]

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
    assert "pl_ratror" in consulta["query"][0]
    assert "('O''Neil b')" in urllib.parse.unquote_plus(script.montar_url(["O'Neil b"]))
    medido = {
        "planeta": "X b",
        "setores_tess": [2, 29],
        "periodo": {"medido": 2.5, "sigma": 1e-6, "catalogo": 2.5, "bate": True},
        "razao_de_raios": {"medido": 0.1, "sigma": 1e-3, "catalogo": None, "sigma_catalogo": None, "bate": False},
    }
    resultado = {"alvos": [medido, {"planeta": "Y b", "erro": "sem curva"}], "veredito": medicao.veredito([medido], minimo=1)}
    texto = script.resumo(resultado)
    assert texto.startswith("## Medição própria de trânsitos: reprovado")
    assert "| X b | 2.5000000 ± 1.0e-06 ✅ | 2.5 | 0.10000 ± 0.00100 ❌ | — | 2, 29 |" in texto
    assert "| Y b | erro: sem curva |" in texto
