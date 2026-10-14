"""Análise exploratória: agregações puras, sem gráficos."""

import pandas as pd

from exoplanetas.dados import CLASSES_TAMANHO, agrupar_metodo, classificar_tamanho

# O "deserto de Netunos quentes": planetas de 2 a 6 raios terrestres com período menor que 3 dias.
# O site espelha estes limites (veja site.parametros e o teste de contrato do site).
DESERTO_PERIODO_DIAS = 3.0
DESERTO_RAIO = (2.0, 6.0)


def descobertas_por_ano(df: pd.DataFrame) -> pd.DataFrame:
    """Tabela ano × método (com 'Outros') com o número de descobertas."""
    tabela = pd.crosstab(df["disc_year"], agrupar_metodo(df["discoverymethod"]))
    ordem = [c for c in ["Transit", "Radial Velocity", "Microlensing", "Imaging", "Outros"] if c in tabela.columns]
    tabela = tabela[ordem]
    anos = range(int(tabela.index.min()), int(tabela.index.max()) + 1)
    return tabela.reindex(anos, fill_value=0)


def resumo_metodos(df: pd.DataFrame) -> dict[str, int]:
    contagem = agrupar_metodo(df["discoverymethod"]).value_counts()
    return {str(k): int(v) for k, v in contagem.items()}


def ano_de_pico(df: pd.DataFrame) -> tuple[int, int]:
    """Ano com mais descobertas e quantas foram."""
    por_ano = df["disc_year"].value_counts()
    return int(por_ano.idxmax()), int(por_ano.max())


def virada_do_transito(df: pd.DataFrame) -> dict[str, float | None]:
    """Primeiro ano em que o trânsito supera a velocidade radial, e a fatia
    da velocidade radial em todas as descobertas até o ano anterior."""
    t = descobertas_por_ano(df)
    supera = t.index[t.get("Transit", 0) > t.get("Radial Velocity", 0)]
    if len(supera) == 0:
        return {"ano": None, "fracao_velocidade_radial_antes": None}
    ano = int(supera[0])
    antes = df[df["disc_year"] < ano]
    fracao = float((antes["discoverymethod"] == "Radial Velocity").mean()) if len(antes) else None
    return {"ano": ano, "fracao_velocidade_radial_antes": fracao}


def kepler_por_ano(df: pd.DataFrame, anos: list[int]) -> dict[str, dict[str, int]]:
    """Total de descobertas e quantas foram do telescópio Kepler, por ano."""
    out = {}
    for ano in anos:
        do_ano = df[df["disc_year"] == ano]
        out[str(ano)] = {"total": len(do_ano), "kepler": int((do_ano["disc_facility"] == "Kepler").sum())}
    return out


def com_raio_medido(df: pd.DataFrame) -> pd.DataFrame:
    """Planetas de trânsito: o único método que mede o raio.

    Nos demais, o arquivo preenche o raio com uma relação massa-raio.
    """
    return df[(df["discoverymethod"] == "Transit") & df["pl_rade"].notna()]


def contagem_por_tamanho(df: pd.DataFrame) -> dict[str, int]:
    """Classes de tamanho entre os planetas com raio medido."""
    classes = classificar_tamanho(com_raio_medido(df)["pl_rade"]).value_counts()
    return {nome: int(classes.get(nome, 0)) for nome, _, _ in CLASSES_TAMANHO}


def deserto_netunos_quentes(df: pd.DataFrame, periodo_curto: float = DESERTO_PERIODO_DIAS) -> dict[str, float]:
    """Compara a fração de planetas do tamanho de Netuno em órbitas curtas.

    Planetas de 2 a 6 raios terrestres são comuns em geral, mas raros com
    período menor que `periodo_curto` dias (o "deserto de Netunos quentes").
    Considera só planetas de trânsito, cujo raio é medido.
    """
    t = com_raio_medido(df)
    t = t[t["pl_orbper"].notna()]
    netuno = t["pl_rade"].between(*DESERTO_RAIO, inclusive="left")
    curto = t["pl_orbper"] < periodo_curto
    frac_geral = float(netuno.mean())
    frac_curto = float(netuno[curto].mean()) if curto.any() else float("nan")
    return {
        "planetas_transito": len(t),
        "fracao_netunos_geral": frac_geral,
        "fracao_netunos_orbita_curta": frac_curto,
        "planetas_orbita_curta": int(curto.sum()),
        "periodo_curto_dias": periodo_curto,
    }


def mais_proximos_parecidos_com_a_terra(df: pd.DataFrame, n: int = 5) -> pd.DataFrame:
    """Planetas de raio medido < 1,6 (provavelmente rochosos) que recebem entre
    0,25 e 2 vezes a luz que a Terra recebe, do mais próximo ao mais distante."""
    t = com_raio_medido(df)
    filtro = t["pl_rade"].lt(1.6) & t["pl_insol"].between(0.25, 2.0) & t["sy_dist"].notna()
    cols = ["pl_name", "pl_rade", "pl_insol", "pl_eqt", "sy_dist"]
    return t.loc[filtro, cols].sort_values("sy_dist").head(n).reset_index(drop=True)
