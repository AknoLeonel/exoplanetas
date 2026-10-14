"""Carregamento e limpeza: funções puras sobre DataFrames."""

from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parents[2]
CSV_PADRAO = RAIZ / "data" / "exoplanetas.csv"

# Classes de tamanho do Kepler (Borucki et al. 2011), em raios terrestres.
CLASSES_TAMANHO = [
    ("Terra", 0.0, 1.25),
    ("Super-Terra", 1.25, 2.0),
    ("Netuno", 2.0, 6.0),
    ("Júpiter", 6.0, 15.0),
    ("Super-Júpiter", 15.0, np.inf),
]

METODOS_PRINCIPAIS = ["Transit", "Radial Velocity", "Microlensing", "Imaging"]
NOMES_METODOS = {
    "Transit": "Trânsito",
    "Radial Velocity": "Velocidade radial",
    "Microlensing": "Microlente",
    "Imaging": "Imagem direta",
    "Outros": "Outros",
}

# Entradas do modelo de raio. Nenhuma depende do raio do planeta.
FEATURES = ["log_massa", "log_periodo", "log_insolacao", "st_teff", "st_mass", "st_met"]
ALVO = "log_raio"


def carregar(caminho: Path | str = CSV_PADRAO) -> pd.DataFrame:
    return pd.read_csv(caminho)


def agrupar_metodo(metodo: pd.Series) -> pd.Series:
    """Mantém os quatro métodos principais e agrupa o resto em 'Outros'."""
    return metodo.where(metodo.isin(METODOS_PRINCIPAIS), "Outros")


def classificar_tamanho(raio: pd.Series) -> pd.Series:
    """Classe de tamanho do Kepler para cada raio (em raios terrestres)."""
    rotulos = [nome for nome, _, _ in CLASSES_TAMANHO]
    limites = [CLASSES_TAMANHO[0][1]] + [fim for _, _, fim in CLASSES_TAMANHO]
    classes = pd.cut(raio, bins=limites, labels=rotulos, right=False)
    return classes.astype("object").where(raio.notna(), None)


def selecionar_modelaveis(df: pd.DataFrame) -> pd.DataFrame:
    """Planetas onde massa e raio foram MEDIDOS.

    Na tabela pscomppars, quando falta a massa (ou o raio) o arquivo preenche
    a lacuna com uma relação massa-raio empírica. Usar esses valores para
    prever o raio seria vazamento: a resposta já estaria embutida na entrada.
    Por isso exigimos:
      - massa medida de fato (pl_bmassprov == "Mass"), não Msini nem M-R;
      - descoberta por trânsito, o único método que mede o raio diretamente;
      - todas as entradas presentes e positivas.
    """
    obrigatorias = ["pl_rade", "pl_bmasse", "pl_orbper", "pl_insol", "st_teff", "st_mass", "st_met"]
    filtro = (df["pl_bmassprov"] == "Mass") & (df["discoverymethod"] == "Transit") & df[obrigatorias].notna().all(axis=1)
    positivos = (df[["pl_rade", "pl_bmasse", "pl_orbper", "pl_insol"]] > 0).all(axis=1)
    return df.loc[filtro & positivos].copy()


def adicionar_features(df: pd.DataFrame) -> pd.DataFrame:
    """Logaritmos das grandezas que variam por ordens de grandeza."""
    out = df.copy()
    out["log_massa"] = np.log10(out["pl_bmasse"])
    out["log_periodo"] = np.log10(out["pl_orbper"])
    out["log_insolacao"] = np.log10(out["pl_insol"])
    out[ALVO] = np.log10(out["pl_rade"])
    return out
