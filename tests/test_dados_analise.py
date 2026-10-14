import numpy as np
import pandas as pd

from exoplanetas import analise, dados


def planeta(**k):
    base = {
        "pl_name": "X b",
        "hostname": "X",
        "discoverymethod": "Transit",
        "disc_year": 2020,
        "disc_facility": "Kepler",
        "pl_orbper": 10.0,
        "pl_rade": 2.0,
        "pl_bmasse": 5.0,
        "pl_bmassprov": "Mass",
        "pl_insol": 50.0,
        "pl_eqt": 700.0,
        "st_teff": 5700.0,
        "st_mass": 1.0,
        "st_met": 0.0,
        "sy_dist": 100.0,
    }
    base.update(k)
    return base


def test_classificar_tamanho_usa_limites_do_kepler():
    raios = pd.Series([0.5, 1.25, 1.99, 2.0, 5.99, 6.0, 15.0, np.nan])
    assert list(dados.classificar_tamanho(raios)) == [
        "Terra",
        "Super-Terra",
        "Super-Terra",
        "Netuno",
        "Netuno",
        "Júpiter",
        "Super-Júpiter",
        None,
    ]


def test_agrupar_metodo_junta_os_raros_em_outros():
    m = pd.Series(["Transit", "Pulsar Timing", "Imaging", "Astrometry"])
    assert list(dados.agrupar_metodo(m)) == ["Transit", "Outros", "Imaging", "Outros"]


def test_selecionar_modelaveis_evita_vazamento():
    df = pd.DataFrame(
        [
            planeta(pl_name="ok"),
            planeta(pl_name="massa estimada pelo raio", pl_bmassprov="M-R relationship"),
            planeta(pl_name="msini", pl_bmassprov="Msini"),
            planeta(pl_name="raio estimado (velocidade radial)", discoverymethod="Radial Velocity"),
            planeta(pl_name="sem metalicidade", st_met=np.nan),
            planeta(pl_name="massa zero", pl_bmasse=0.0),
        ]
    )
    assert list(dados.selecionar_modelaveis(df)["pl_name"]) == ["ok"]


def test_adicionar_features_em_log10_sem_mudar_a_entrada():
    df = pd.DataFrame([planeta(pl_bmasse=100.0, pl_orbper=1000.0, pl_insol=0.1, pl_rade=10.0)])
    out = dados.adicionar_features(df)
    assert out.loc[0, "log_massa"] == 2.0
    assert out.loc[0, "log_periodo"] == 3.0
    assert out.loc[0, "log_insolacao"] == -1.0
    assert out.loc[0, dados.ALVO] == 1.0
    assert "log_massa" not in df.columns
    assert set(dados.FEATURES) <= set(out.columns)
    assert dados.ALVO not in dados.FEATURES


def test_descobertas_por_ano_preenche_anos_vazios_e_ordena_metodos():
    df = pd.DataFrame(
        [
            planeta(disc_year=2000, discoverymethod="Radial Velocity"),
            planeta(disc_year=2003),
            planeta(disc_year=2003, discoverymethod="Pulsar Timing"),
        ]
    )
    t = analise.descobertas_por_ano(df)
    assert list(t.index) == [2000, 2001, 2002, 2003]
    assert list(t.columns) == ["Transit", "Radial Velocity", "Outros"]
    assert t.loc[2001].sum() == 0
    assert t.loc[2003, "Transit"] == 1


def test_ano_de_pico_e_resumo():
    df = pd.DataFrame([planeta(disc_year=2016)] * 3 + [planeta(disc_year=2014, discoverymethod="Imaging")])
    assert analise.ano_de_pico(df) == (2016, 3)
    assert analise.resumo_metodos(df) == {"Transit": 3, "Imaging": 1}


def test_contagem_por_tamanho_ignora_raios_estimados():
    df = pd.DataFrame(
        [
            planeta(pl_rade=1.0),
            planeta(pl_rade=11.0),
            planeta(pl_rade=11.0, discoverymethod="Radial Velocity"),
        ]
    )
    c = analise.contagem_por_tamanho(df)
    assert c["Terra"] == 1
    assert c["Júpiter"] == 1
    assert sum(c.values()) == 2


def test_deserto_netunos_quentes():
    curtos = [planeta(pl_orbper=1.5, pl_rade=r) for r in (1.0, 1.5, 3.0, 12.0)]
    longos = [planeta(pl_orbper=20.0, pl_rade=r) for r in (3.0, 3.0, 4.0, 1.0)]
    estimado = [planeta(pl_orbper=1.0, pl_rade=3.0, discoverymethod="Radial Velocity")]
    r = analise.deserto_netunos_quentes(pd.DataFrame(curtos + longos + estimado))
    assert r["planetas_transito"] == 8
    assert r["planetas_orbita_curta"] == 4
    assert r["fracao_netunos_orbita_curta"] == 0.25
    assert r["fracao_netunos_geral"] == 0.5


def test_parecidos_com_a_terra_ordena_pela_distancia_e_exige_raio_medido():
    df = pd.DataFrame(
        [
            planeta(pl_name="longe", pl_rade=1.0, pl_insol=1.0, sy_dist=40.0),
            planeta(pl_name="perto", pl_rade=1.1, pl_insol=0.8, sy_dist=12.0),
            planeta(pl_name="quente", pl_rade=1.0, pl_insol=5.0, sy_dist=5.0),
            planeta(pl_name="grande", pl_rade=2.5, pl_insol=1.0, sy_dist=5.0),
            planeta(pl_name="raio estimado", pl_rade=1.0, pl_insol=1.0, sy_dist=1.3, discoverymethod="Radial Velocity"),
        ]
    )
    assert list(analise.mais_proximos_parecidos_com_a_terra(df)["pl_name"]) == ["perto", "longe"]


def test_virada_do_transito():
    df = pd.DataFrame(
        [planeta(disc_year=2000, discoverymethod="Radial Velocity")] * 3
        + [planeta(disc_year=2000)]
        + [planeta(disc_year=2001)] * 2
        + [planeta(disc_year=2001, discoverymethod="Radial Velocity")]
    )
    r = analise.virada_do_transito(df)
    assert r["ano"] == 2001
    assert r["fracao_velocidade_radial_antes"] == 0.75


def test_kepler_por_ano():
    df = pd.DataFrame([planeta(disc_year=2014)] * 2 + [planeta(disc_year=2014, disc_facility="K2")])
    assert analise.kepler_por_ano(df, [2014, 2015]) == {"2014": {"total": 3, "kepler": 2}, "2015": {"total": 0, "kepler": 0}}


def test_virada_do_transito_sem_historico_anterior():
    so_transito = pd.DataFrame([planeta(disc_year=2010)])
    assert analise.virada_do_transito(so_transito) == {"ano": 2010, "fracao_velocidade_radial_antes": None}
    so_rv = pd.DataFrame([planeta(discoverymethod="Radial Velocity")])
    assert analise.virada_do_transito(so_rv) == {"ano": None, "fracao_velocidade_radial_antes": None}
