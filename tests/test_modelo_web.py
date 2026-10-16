"""A exportação do modelo para o site: as árvores em JSON precisam prever o mesmo que o scikit-learn."""

import json

import numpy as np
import pytest
from test_modelo_pipeline import sintetico

from exoplanetas import dados, modelo, modelo_web, pipeline


@pytest.fixture(scope="module")
def base_e_previsoes():
    base = dados.adicionar_features(dados.selecionar_modelaveis(sintetico(n=240)))
    avaliacao = modelo.avaliar(base)
    resultado = {"validacao": "GroupKFold", "planetas": len(base), "resultados": avaliacao.metricas}
    return base, avaliacao.previsoes[modelo_web.NOME_DO_MODELO], resultado


def test_o_nome_do_modelo_e_o_do_pipeline():
    assert modelo_web.NOME_DO_MODELO == pipeline.MODELO_FINAL


def test_as_arvores_exportadas_preveem_o_mesmo_que_o_scikit_learn(base_e_previsoes):
    base, prev, resultado = base_e_previsoes
    exportado = modelo_web.exportar(base, prev, resultado)
    entradas = np.array(exportado["verificacao"]["entradas"])
    esperadas = np.array(exportado["verificacao"]["previsoes"])
    assert len(entradas) == modelo_web.PONTOS_DE_VERIFICACAO
    assert np.max(np.abs(modelo_web.prever_exportado(exportado, entradas) - esperadas)) < 1e-6
    # Em todo o conjunto, não só na amostra de verificação.
    estimador, cols = modelo.modelos()[modelo_web.NOME_DO_MODELO]
    x = base[cols].to_numpy(dtype=float)
    estimador.fit(x, base[dados.ALVO].to_numpy())
    assert np.max(np.abs(modelo_web.prever_exportado(exportado, x) - estimador.predict(x))) < 1e-6
    assert exportado["variaveis"] == dados.FEATURES
    assert len(exportado["arvores"]) == estimador.n_iter_


def test_o_valor_de_cada_no_interno_e_a_media_ponderada_dos_filhos(base_e_previsoes):
    base, prev, resultado = base_e_previsoes
    arvore = modelo_web.exportar(base, prev, resultado)["arvores"][0]
    for i, f in enumerate(arvore["variavel"]):
        if f == -1:
            continue
        e, d = arvore["esquerda"][i], arvore["direita"][i]
        filhos = sorted([arvore["valor"][e], arvore["valor"][d]])
        assert filhos[0] - 1e-9 <= arvore["valor"][i] <= filhos[1] + 1e-9


def test_valor_ausente_segue_o_lado_aprendido():
    exportado = {
        "base": 1.0,
        "arvores": [
            {
                "variavel": [0, -1, -1],
                "limiar": [0.5, 0, 0],
                "esquerda": [1, 0, 0],
                "direita": [2, 0, 0],
                "ausente_esquerda": [False, False, False],
                "valor": [0, -1.0, 2.0],
            }
        ],
    }
    x = np.array([[0.2], [0.9], [np.nan]])
    assert modelo_web.prever_exportado(exportado, x).tolist() == [0.0, 3.0, 3.0]


def test_intervalo_por_faixa_de_massa_cobre_80_porcento(base_e_previsoes):
    base, prev, _ = base_e_previsoes
    intervalo = modelo_web.intervalos(base, prev)
    assert intervalo["quantis"] == [0.1, 0.9]
    assert len(intervalo["faixas"]) == modelo_web.FAIXAS_DE_MASSA
    assert len(intervalo["cortes_log_massa"]) == modelo_web.FAIXAS_DE_MASSA - 1
    assert sum(f["planetas"] for f in intervalo["faixas"]) == len(base)
    for f in intervalo["faixas"]:
        assert f["inferior"] < 0 < f["superior"]
        assert 0.7 <= f["cobertura"] <= 0.9


def test_faixas_e_planetas_do_treino(base_e_previsoes):
    base, _, _ = base_e_previsoes
    faixas = modelo_web.faixas_dos_dados(base)
    assert set(faixas) == set(dados.FEATURES)
    for f in faixas.values():
        assert f["minimo"] <= f["p01"] <= f["p99"] <= f["maximo"]
    planetas = modelo_web.planetas_do_treino(base)
    assert planetas["colunas"][0] == "nome" and planetas["colunas"][-1] == "raio"
    assert len(planetas["linhas"]) == len(base)
    assert [linha[0] for linha in planetas["linhas"]] == sorted(base["pl_name"])


def test_arquivos_vao_para_o_site_e_sao_json_valido(base_e_previsoes, tmp_path):
    from exoplanetas import site

    base, prev, resultado = base_e_previsoes
    arquivos = modelo_web.arquivos(base, prev, resultado)
    assert set(arquivos) == {"modelo-raio.json", "modelo-planetas.json"}
    site.gravar(arquivos, tmp_path)
    lido = json.loads((tmp_path / "modelo-raio.json").read_text(encoding="utf-8"))
    assert lido["validacao"]["planetas"] == len(base)


def test_variavel_categorica_nao_e_exportada():
    class Falso:
        nodes = np.zeros(1, dtype=[("is_categorical", "u1")])
        nodes["is_categorical"] = 1

    with pytest.raises(ValueError, match="categóricas"):
        modelo_web.arvore(Falso())
