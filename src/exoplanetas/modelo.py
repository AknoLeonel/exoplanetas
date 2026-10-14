"""Modelo que estima o raio de um exoplaneta a partir de massa, órbita e estrela.

Avaliação com validação cruzada AGRUPADA POR ESTRELA: planetas do mesmo sistema
compartilham as variáveis da estrela, então deixá-los em treino e teste ao mesmo
tempo inflaria o resultado.
"""

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import GroupKFold

from exoplanetas.dados import ALVO, FEATURES

SEMENTE = 42


def modelos() -> dict:
    """Do mais simples ao mais completo. Cada um recebe só as colunas que usa."""
    return {
        "Mediana (referência)": (DummyRegressor(strategy="median"), ["log_massa"]),
        "Lei de potência massa-raio": (LinearRegression(), ["log_massa"]),
        "Gradient boosting (todas as variáveis)": (
            HistGradientBoostingRegressor(max_iter=400, learning_rate=0.05, max_leaf_nodes=15, l2_regularization=1.0, random_state=SEMENTE),
            FEATURES,
        ),
    }


def metricas(y_log_real: np.ndarray, y_log_prev: np.ndarray) -> dict[str, float]:
    """Métricas em log10 e em raios terrestres."""
    y_log_real = np.asarray(y_log_real, dtype=float)
    y_log_prev = np.asarray(y_log_prev, dtype=float)
    erro_log = y_log_prev - y_log_real
    raio_real = 10**y_log_real
    raio_prev = 10**y_log_prev
    ss_res = float(np.sum(erro_log**2))
    ss_tot = float(np.sum((y_log_real - y_log_real.mean()) ** 2))
    return {
        "mae_log10": float(np.mean(np.abs(erro_log))),
        "r2_log": 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan"),
        "erro_percentual_mediano": float(np.median(np.abs(raio_prev - raio_real) / raio_real) * 100),
        "dentro_de_20pct": float(np.mean(np.abs(raio_prev - raio_real) / raio_real <= 0.20) * 100),
    }


@dataclass
class ResultadoAvaliacao:
    metricas: dict[str, dict[str, float]]
    previsoes: dict[str, np.ndarray]


def avaliar(df: pd.DataFrame, n_dobras: int = 5) -> ResultadoAvaliacao:
    """Validação cruzada agrupada por estrela hospedeira; previsões fora da dobra."""
    y = df[ALVO].to_numpy()
    grupos = df["hostname"].to_numpy()
    dobras = list(GroupKFold(n_splits=n_dobras).split(df, y, grupos))
    resultado_metricas: dict[str, dict[str, float]] = {}
    previsoes: dict[str, np.ndarray] = {}
    for nome, (estimador, cols) in modelos().items():
        prev = np.empty_like(y, dtype=float)
        for treino, teste in dobras:
            estimador.fit(df.iloc[treino][cols], y[treino])
            prev[teste] = estimador.predict(df.iloc[teste][cols])
        previsoes[nome] = prev
        resultado_metricas[nome] = metricas(y, prev)
    return ResultadoAvaliacao(resultado_metricas, previsoes)


def lei_de_potencia(df: pd.DataFrame) -> dict[str, float]:
    """Ajuste R = C · M^k em todo o conjunto (log10 R = log10 C + k log10 M)."""
    reg = LinearRegression().fit(df[["log_massa"]], df[ALVO])
    return {"expoente": float(reg.coef_[0]), "constante": float(10**reg.intercept_)}


def importancia(df: pd.DataFrame, repeticoes: int = 10) -> dict[str, float]:
    """Importância por permutação do gradient boosting, em uma divisão por estrela.

    Quanto o erro (MAE em log10) piora ao embaralhar cada variável.
    """
    y = df[ALVO].to_numpy()
    treino, teste = next(GroupKFold(n_splits=5).split(df, y, df["hostname"]))
    estimador, cols = modelos()["Gradient boosting (todas as variáveis)"]
    estimador.fit(df.iloc[treino][cols], y[treino])
    r = permutation_importance(
        estimador,
        df.iloc[teste][cols],
        y[teste],
        n_repeats=repeticoes,
        random_state=SEMENTE,
        scoring="neg_mean_absolute_error",
    )
    return dict(sorted(((c, float(v)) for c, v in zip(cols, r.importances_mean, strict=True)), key=lambda kv: -kv[1]))
