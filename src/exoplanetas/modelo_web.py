"""O modelo de raio no formato que o site avalia no navegador (árvores em JSON, sem runtime de ML).

O gradient boosting do scikit-learn é uma soma de árvores de regressão. Cada árvore vira listas paralelas
(variável, limiar, filho esquerdo, filho direito, valor, para onde vai o valor ausente); o site percorre as
árvores e soma as folhas. Um conjunto fixo de entradas com a previsão do Python vai junto, para o teste de
contrato do site conferir que as duas contas batem.
"""

import math

import numpy as np
import pandas as pd

from exoplanetas.dados import ALVO, FEATURES
from exoplanetas.modelo import modelos

NOME_DO_MODELO = "Gradient boosting (todas as variáveis)"
# Intervalo de 80%: os erros fora da dobra entre os quantis 10% e 90%.
QUANTIS = (0.10, 0.90)
FAIXAS_DE_MASSA = 4
PONTOS_DE_VERIFICACAO = 25
CASAS_DO_VALOR = 9


def _valor(x: float) -> float:
    return float(f"{x:.{CASAS_DO_VALOR}g}")


def arvore(predictor) -> dict:
    """Uma árvore do HistGradientBoosting em listas paralelas.

    Nas folhas, `valor` já vem com a taxa de aprendizado aplicada. Nos nós internos, o scikit-learn guarda o
    valor sem essa taxa; aqui ele é recalculado como a média das folhas abaixo, ponderada pelo número de
    amostras. Assim, a diferença de valor entre um nó e o filho escolhido diz quanto aquela divisão moveu a
    previsão, o que permite explicar cada previsão variável por variável.
    """
    nos = predictor.nodes
    if np.any(nos["is_categorical"]):
        raise ValueError("variáveis categóricas não são exportadas")
    valores = nos["value"].astype(float).copy()
    contagens = nos["count"].astype(float)
    # Os filhos sempre vêm depois do pai, então percorrer de trás para a frente resolve os nós internos.
    for i in range(len(nos) - 1, -1, -1):
        if not nos["is_leaf"][i]:
            esq, dir_ = int(nos["left"][i]), int(nos["right"][i])
            valores[i] = (valores[esq] * contagens[esq] + valores[dir_] * contagens[dir_]) / (contagens[esq] + contagens[dir_])
    folha = nos["is_leaf"].astype(bool)
    return {
        "variavel": [-1 if f else int(v) for f, v in zip(folha, nos["feature_idx"], strict=True)],
        "limiar": [0.0 if f else float(t) for f, t in zip(folha, nos["num_threshold"], strict=True)],
        "esquerda": [0 if f else int(e) for f, e in zip(folha, nos["left"], strict=True)],
        "direita": [0 if f else int(d) for f, d in zip(folha, nos["right"], strict=True)],
        "ausente_esquerda": [bool(m) for m in nos["missing_go_to_left"]],
        "valor": [_valor(v) for v in valores],
    }


def prever_exportado(exportado: dict, x: np.ndarray) -> np.ndarray:
    """Avalia o modelo exportado, como o site faz. Serve para testar a exportação contra o scikit-learn."""
    saida = np.full(len(x), exportado["base"], dtype=float)
    for a in exportado["arvores"]:
        for k, linha in enumerate(x):
            no = 0
            while a["variavel"][no] != -1:
                v = linha[a["variavel"][no]]
                vai_esquerda = a["ausente_esquerda"][no] if np.isnan(v) else v <= a["limiar"][no]
                no = a["esquerda"][no] if vai_esquerda else a["direita"][no]
            saida[k] += a["valor"][no]
    return saida


def intervalos(base: pd.DataFrame, previsoes_fora_da_dobra: np.ndarray) -> dict:
    """Erros fora da dobra (log10 do raio real menos o previsto) por faixa de massa: os quantis 10% e 90%.

    O erro depende do regime (rochosos, Netunos, gigantes), por isso um intervalo por faixa de massa.
    """
    residuo = base[ALVO].to_numpy() - previsoes_fora_da_dobra
    log_massa = base["log_massa"].to_numpy()
    cortes = np.quantile(log_massa, np.linspace(0, 1, FAIXAS_DE_MASSA + 1)[1:-1])
    faixa = np.searchsorted(cortes, log_massa, side="right")
    faixas = []
    for i in range(FAIXAS_DE_MASSA):
        r = residuo[faixa == i]
        baixo, alto = np.quantile(r, QUANTIS)
        cobertura = float(np.mean((r >= baixo) & (r <= alto)))
        faixas.append({"inferior": _valor(baixo), "superior": _valor(alto), "planetas": len(r), "cobertura": round(cobertura, 4)})
    return {"quantis": list(QUANTIS), "cortes_log_massa": [_valor(c) for c in cortes], "faixas": faixas}


def faixas_dos_dados(base: pd.DataFrame) -> dict:
    """Mínimo, percentis 1% e 99% e máximo de cada variável no treino: o que conta como extrapolar."""
    return {
        f: {
            "minimo": _valor(base[f].min()),
            "p01": _valor(base[f].quantile(0.01)),
            "p99": _valor(base[f].quantile(0.99)),
            "maximo": _valor(base[f].max()),
        }
        for f in FEATURES
    }


def planetas_do_treino(base: pd.DataFrame) -> dict:
    """Os planetas do treino, nas unidades dos controles, para o gráfico e para carregar um planeta real."""
    t = base.sort_values("pl_name")
    colunas = ["nome", "massa", "periodo", "insolacao", "st_teff", "st_mass", "st_met", "raio"]
    linhas = [
        [
            str(r.pl_name),
            round(float(r.pl_bmasse), 3),
            round(float(r.pl_orbper), 5),
            round(float(r.pl_insol), 3),
            round(float(r.st_teff)),
            round(float(r.st_mass), 3),
            round(float(r.st_met), 3),
            round(float(r.pl_rade), 3),
        ]
        for r in t.itertuples()
    ]
    return {"colunas": colunas, "linhas": linhas}


def exportar(base: pd.DataFrame, previsoes_fora_da_dobra: np.ndarray, resultado: dict) -> dict:
    """Treina o gradient boosting em todos os planetas modeláveis e devolve o JSON do site."""
    estimador, colunas = modelos()[NOME_DO_MODELO]
    x = base[colunas].to_numpy(dtype=float)
    estimador.fit(x, base[ALVO].to_numpy())
    exportado = {
        "variaveis": list(colunas),
        "base": float(np.ravel(estimador._baseline_prediction)[0]),
        "arvores": [arvore(iteracao[0]) for iteracao in estimador._predictors],
    }
    passo = max(1, len(x) // PONTOS_DE_VERIFICACAO)
    amostra = x[::passo][:PONTOS_DE_VERIFICACAO]
    return {
        **exportado,
        "alvo": "log10 do raio, em raios terrestres",
        "intervalo": intervalos(base, previsoes_fora_da_dobra),
        "faixas": faixas_dos_dados(base),
        "validacao": {
            "metodo": resultado["validacao"],
            "planetas": resultado["planetas"],
            "erro_percentual_mediano": resultado["resultados"][NOME_DO_MODELO]["erro_percentual_mediano"],
            "dentro_de_20pct": resultado["resultados"][NOME_DO_MODELO]["dentro_de_20pct"],
        },
        "verificacao": {
            "entradas": amostra.tolist(),
            "previsoes": estimador.predict(amostra).tolist(),
        },
    }


def arquivos(base: pd.DataFrame, previsoes_fora_da_dobra: np.ndarray, resultado: dict) -> dict[str, dict]:
    """Os dois arquivos do módulo de ML do site: o modelo e os planetas do treino."""
    return {
        "modelo-raio.json": exportar(base, previsoes_fora_da_dobra, resultado),
        "modelo-planetas.json": planetas_do_treino(base),
    }


def diferencas(antigo, novo, tolerancia: float = 1e-9, caminho: str = "") -> list[str]:
    """Onde dois JSON do modelo diferem além da tolerância relativa nos números.

    O último bit dos limiares muda de um processador para outro (o log10 do numpy usa instruções diferentes),
    sem mudar nenhuma previsão. Por isso o CI compara este arquivo assim, e não byte a byte.
    """
    if isinstance(antigo, bool) or isinstance(novo, bool):
        return [] if antigo == novo else [caminho or "/"]
    if isinstance(antigo, int | float) and isinstance(novo, int | float):
        return [] if math.isclose(antigo, novo, rel_tol=tolerancia, abs_tol=1e-12) else [caminho or "/"]
    if isinstance(antigo, dict) and isinstance(novo, dict):
        if antigo.keys() != novo.keys():
            return [f"{caminho}/ (chaves)"]
        return [d for k in antigo for d in diferencas(antigo[k], novo[k], tolerancia, f"{caminho}/{k}")]
    if isinstance(antigo, list) and isinstance(novo, list):
        if len(antigo) != len(novo):
            return [f"{caminho}/ (tamanho)"]
        return [d for i, (a, b) in enumerate(zip(antigo, novo, strict=True)) for d in diferencas(a, b, tolerancia, f"{caminho}/{i}")]
    return [] if antigo == novo else [caminho or "/"]
