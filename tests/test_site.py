"""Dados do site: o JSON que a página lê precisa bater com o DataFrame."""

import json

import pandas as pd
from test_modelo_pipeline import sintetico

from exoplanetas import analise, dados, pipeline, site


def _com_um_planeta_radial() -> pd.DataFrame:
    df = sintetico(n=30)
    radial = df.iloc[[0]].copy()
    radial["pl_name"] = "Radial b"
    radial["discoverymethod"] = "Radial Velocity"
    sem_periodo = df.iloc[[1]].copy()
    sem_periodo["pl_name"] = "Sem periodo b"
    sem_periodo["pl_orbper"] = float("nan")
    return pd.concat([df, radial, sem_periodo], ignore_index=True)


def test_planetas_com_periodo_e_raio_e_marca_os_de_raio_estimado():
    df = _com_um_planeta_radial()
    out = site.planetas_com_raio(df)
    por_nome = {linha[0]: linha for linha in out["linhas"]}
    assert out["colunas"] == site.COLUNAS_PLANETAS
    assert out["colunas"][-1] == "medido"
    assert "Sem periodo b" not in por_nome  # sem período não dá para desenhar
    assert len(por_nome) == 31  # os 30 de trânsito + o radial
    assert por_nome["Radial b"][-1] is False  # raio estimado
    assert all(linha[-1] is True for nome, linha in por_nome.items() if nome != "Radial b")
    assert list(por_nome) == sorted(por_nome)
    assert all(len(linha) == len(site.COLUNAS_PLANETAS) for linha in out["linhas"])


def test_a_origem_do_raio_segue_o_mesmo_predicado_da_analise():
    df = _com_um_planeta_radial()
    medidos = set(analise.com_raio_medido(df)["pl_name"])
    do_site = {linha[0] for linha in site.planetas_com_raio(df)["linhas"] if linha[-1]}
    assert do_site == medidos - {"Sem periodo b"}  # o sem período não entra no gráfico


def test_planeta_sem_raio_fica_de_fora():
    df = sintetico(n=5)
    df.loc[0, "pl_rade"] = float("nan")
    nomes = [linha[0] for linha in site.planetas_com_raio(df)["linhas"]]
    assert "P0" not in nomes
    assert len(nomes) == 4


def test_massa_so_quando_medida_e_nan_vira_none():
    df = sintetico(n=6)
    df.loc[0, "pl_bmassprov"] = "M-R relationship"
    df.loc[1, "pl_eqt"] = float("nan")
    out = site.planetas_com_raio(df)
    por_nome = {linha[0]: linha for linha in out["linhas"]}
    idx_massa = site.COLUNAS_PLANETAS.index("massa")
    idx_temp = site.COLUNAS_PLANETAS.index("temperatura")
    assert por_nome["P0"][idx_massa] is None
    assert por_nome["P2"][idx_massa] is not None
    assert por_nome["P1"][idx_temp] is None


def test_arredondamento():
    assert site._valor(float("nan"), 2) is None
    assert site._valor(None, 2) is None
    assert site._valor(2.0, None) == 2
    assert site._valor(1.23456, 2) == 1.23
    assert site._valor(554.6, 0) == 555
    assert isinstance(site._valor(554.6, 0), int)


def test_descobertas_por_ano_e_metodo():
    out = site.descobertas(sintetico(n=60))
    assert out["anos"] == list(range(out["anos"][0], out["anos"][-1] + 1))
    assert set(out["metodos"]) == {"Transit"}
    assert sum(out["metodos"]["Transit"]) == 60
    assert all(len(v) == len(out["anos"]) for v in out["metodos"].values())
    assert out["nomes"] == {"Transit": "Trânsito"}


def test_gravar_cria_arquivos_json_validos(tmp_path):
    arquivos = site.gerar(sintetico(n=20), {"dados": {"planetas": 20}})
    site.gravar(arquivos, tmp_path / "novo" / "dados")
    salvos = {p.name for p in (tmp_path / "novo" / "dados").iterdir()}
    assert salvos == {"planetas.json", "descobertas.json", "metricas.json", "parametros.json"}
    metricas = json.loads((tmp_path / "novo" / "dados" / "metricas.json").read_text(encoding="utf-8"))
    assert metricas == {"dados": {"planetas": 20}}


def test_pipeline_grava_dados_do_site_quando_pedido(tmp_path):
    pasta_dados = tmp_path / "data"
    pasta_dados.mkdir()
    csv = pasta_dados / "exoplanetas.csv"
    sintetico().to_csv(csv, index=False)
    destino = tmp_path / "site"
    r = pipeline.executar(csv=csv, saida=tmp_path / "reports", figuras=False, pasta_site=destino)
    assert json.loads((destino / "metricas.json").read_text(encoding="utf-8")) == r
    assert (destino / "planetas.json").stat().st_size > 1_000


def test_sem_nan_troca_nao_finitos_por_none_em_qualquer_profundidade():
    entrada = {"a": float("nan"), "b": [1.5, float("inf"), {"c": float("-inf")}], "d": "texto", "e": 3}
    assert site.sem_nan(entrada) == {"a": None, "b": [1.5, None, {"c": None}], "d": "texto", "e": 3}


def test_gravar_aceita_metricas_com_nan_depois_de_sem_nan(tmp_path):
    metricas = {"parecidos": [{"pl_eqt": float("nan")}]}
    site.gravar(site.gerar(sintetico(n=10), metricas), tmp_path)
    salvo = json.loads((tmp_path / "metricas.json").read_text(encoding="utf-8"))
    assert salvo == {"parecidos": [{"pl_eqt": None}]}


def test_parametros_vem_das_constantes_da_analise():
    p = site.parametros()
    assert [c["nome"] for c in p["classes"]] == [c[0] for c in dados.CLASSES_TAMANHO]
    assert p["classes"][-1]["max"] is None  # infinito não existe em JSON
    assert p["classes"][0] == {"nome": "Terra", "min": 0.0, "max": 1.25}
    assert p["deserto"] == {"periodo_max": analise.DESERTO_PERIODO_DIAS, "raio_min": 2.0, "raio_max": 6.0}
