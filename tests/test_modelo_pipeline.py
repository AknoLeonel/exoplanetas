import json

import numpy as np
import pandas as pd

from exoplanetas import dados, graficos, modelo, pipeline


def sintetico(n=300, semente=0):
    """Planetas com raio = 1,2 · massa^0,4, ruído pequeno e 3 planetas por estrela."""
    rng = np.random.default_rng(semente)
    massa = 10 ** rng.uniform(-0.5, 3.5, n)
    raio = 1.2 * massa**0.4 * 10 ** rng.normal(0, 0.03, n)
    return pd.DataFrame(
        {
            "pl_name": [f"P{i}" for i in range(n)],
            "hostname": [f"S{i // 3}" for i in range(n)],
            "discoverymethod": "Transit",
            "disc_year": rng.integers(1995, 2026, n),
            "disc_facility": "Kepler",
            "pl_orbper": 10 ** rng.uniform(0, 2.5, n),
            "pl_orbsmax": 0.1,
            "pl_rade": raio,
            "pl_bmasse": massa,
            "pl_bmassprov": "Mass",
            "pl_dens": 5.0,
            "pl_eqt": rng.uniform(300, 2000, n),
            "pl_insol": 10 ** rng.uniform(-1, 3, n),
            "pl_orbeccen": 0.0,
            "st_teff": rng.uniform(3000, 7000, n),
            "st_rad": 1.0,
            "st_mass": rng.uniform(0.2, 1.5, n),
            "st_met": rng.normal(0, 0.2, n),
            "sy_dist": rng.uniform(5, 500, n),
            "sy_pnum": 3,
        }
    )


def test_metricas_perfeitas_e_conhecidas():
    y = np.log10([1.0, 2.0, 10.0])
    m = modelo.metricas(y, y)
    assert m["mae_log10"] == 0
    assert m["r2_log"] == 1
    assert m["erro_percentual_mediano"] == 0
    assert m["dentro_de_20pct"] == 100
    dobro = modelo.metricas(np.log10([1.0, 1.0]), np.log10([2.0, 2.0]))
    assert round(dobro["erro_percentual_mediano"]) == 100
    assert dobro["dentro_de_20pct"] == 0


def test_lei_de_potencia_recupera_o_expoente():
    base = dados.adicionar_features(sintetico())
    lei = modelo.lei_de_potencia(base)
    assert abs(lei["expoente"] - 0.4) < 0.02
    assert abs(lei["constante"] - 1.2) < 0.1


def test_avaliar_compara_com_referencias_e_prevê_fora_da_amostra():
    base = dados.adicionar_features(sintetico())
    r = modelo.avaliar(base, n_dobras=3)
    assert set(r.metricas) == set(modelo.modelos())
    mediana = r.metricas["Mediana (referência)"]["mae_log10"]
    lei = r.metricas["Lei de potência massa-raio"]["mae_log10"]
    assert lei < mediana / 5
    for prev in r.previsoes.values():
        assert prev.shape == (len(base),)
        assert np.isfinite(prev).all()


def test_dobras_nunca_separam_planetas_da_mesma_estrela():
    from sklearn.model_selection import GroupKFold

    base = dados.adicionar_features(sintetico())
    for treino, teste in GroupKFold(n_splits=5).split(base, base[dados.ALVO], base["hostname"]):
        assert not set(base.iloc[treino]["hostname"]) & set(base.iloc[teste]["hostname"])


def test_importancia_destaca_a_massa():
    base = dados.adicionar_features(sintetico())
    imp = modelo.importancia(base, repeticoes=3)
    assert next(iter(imp)) == "log_massa"
    assert set(imp) == set(dados.FEATURES)


def test_milhar():
    assert graficos.milhar(1504) == "1.504"
    assert graficos.milhar(6445) == "6.445"
    assert graficos.milhar(12) == "12"


def test_pipeline_gera_metricas_e_figuras(tmp_path):
    pasta_dados = tmp_path / "data"
    pasta_dados.mkdir()
    csv = pasta_dados / "exoplanetas.csv"
    sintetico().to_csv(csv, index=False)
    (pasta_dados / "metadados.json").write_text(json.dumps({"coletado_em": "2026-01-01T00:00:00Z"}))
    saida = tmp_path / "reports"
    pasta_site = tmp_path / "site"
    r = pipeline.executar(csv=csv, saida=saida, site=pasta_site)
    salvo = json.loads((saida / "metricas.json").read_text(encoding="utf-8"))
    assert salvo == r
    assert r["dados"]["planetas"] == 300
    assert r["dados"]["coletado_em"] == "2026-01-01T00:00:00Z"
    assert r["modelo"]["planetas"] == 300
    assert pipeline.MODELO_FINAL in r["modelo"]["resultados"]
    figuras = sorted(p.name for p in (saida / "figuras").iterdir())
    assert len(figuras) == 8
    assert all(p.stat().st_size > 10_000 for p in (saida / "figuras").iterdir())
    planetas = json.loads((pasta_site / "dados" / "planetas.json").read_text(encoding="utf-8"))
    assert planetas["colunas"][0] == "nome"
    assert len(planetas["linhas"]) == 300
    assert all(linha[-1] is True for linha in planetas["linhas"])
    descobertas = json.loads((pasta_site / "dados" / "descobertas.json").read_text(encoding="utf-8"))
    assert sum(map(sum, descobertas["series"].values())) == 300
    assert json.loads((pasta_site / "dados" / "metricas.json").read_text(encoding="utf-8")) == r


def test_dados_do_site_marca_raios_estimados_e_descarta_incompletos():
    df = sintetico(n=4)
    df.loc[1, "discoverymethod"] = "Radial Velocity"
    df.loc[2, "pl_orbper"] = np.nan
    linhas = pipeline.dados_do_site(df)["linhas"]
    assert [linha[0] for linha in linhas] == ["P0", "P1", "P3"]
    assert [linha[-1] for linha in linhas] == [True, False, True]


def test_sig_arredonda_e_trata_nan():
    assert pipeline._sig(123456.0) == 123500.0
    assert pipeline._sig(0.00123456) == 0.001235
    assert pipeline._sig(float("nan")) is None
