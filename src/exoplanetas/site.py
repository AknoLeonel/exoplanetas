"""Dados do site: tabelas compactas em JSON, derivadas dos mesmos DataFrames do pipeline."""

import json
import math
from pathlib import Path

import pandas as pd

from exoplanetas import analise, dados

SITE_DADOS = dados.RAIZ / "site" / "public" / "dados"

# Ordem das colunas de planetas.json: o site lê cada linha por posição.
COLUNAS_PLANETAS = ["nome", "ano", "periodo", "raio", "massa", "temperatura", "distancia", "medido"]
CASAS = {"periodo": 4, "raio": 3, "massa": 2, "temperatura": 0, "distancia": 1}

# Ordem das colunas de transitos.json, para o simulador de trânsito.
COLUNAS_TRANSITOS = ["nome", "periodo", "raio", "raio_estrela", "semi_eixo", "massa_estrela"]
CASAS_TRANSITOS = {"periodo": 6, "raio": 3, "raio_estrela": 4, "semi_eixo": 5, "massa_estrela": 3}


def _valor(x, casas: int | None):
    """Número JSON: NaN vira None e floats são arredondados."""
    if x is None or pd.isna(x):
        return None
    if casas is None:
        return int(x)
    return round(float(x), casas) if casas else round(float(x))


def planetas_com_raio(df: pd.DataFrame) -> dict:
    """Planetas com raio e período, para o gráfico período × raio.

    `medido` é verdadeiro quando o raio veio de um trânsito (os números do README). Nos demais
    planetas o arquivo da NASA estima o raio por uma relação massa-raio, e o site os mostra à parte.
    """
    t = df[df["pl_orbper"].gt(0) & df["pl_rade"].gt(0)].sort_values("pl_name")
    t = t.assign(massa=t["pl_bmasse"].where(t["pl_bmassprov"] == "Mass"), medido=analise.raio_e_medido(t))
    linhas = [
        [
            str(r.pl_name),
            _valor(r.disc_year, None),
            _valor(r.pl_orbper, CASAS["periodo"]),
            _valor(r.pl_rade, CASAS["raio"]),
            _valor(r.massa, CASAS["massa"]),
            _valor(r.pl_eqt, CASAS["temperatura"]),
            _valor(r.sy_dist, CASAS["distancia"]),
            bool(r.medido),
        ]
        for r in t.itertuples()
    ]
    return {"colunas": COLUNAS_PLANETAS, "linhas": linhas}


def transitos(df: pd.DataFrame) -> dict:
    """Planetas de trânsito com o que o simulador precisa para refazer a curva de luz.

    Entra quem tem período, raio do planeta e raio da estrela, e ao menos o semi-eixo ou a massa
    da estrela (sem semi-eixo, o site o calcula pela terceira lei de Kepler). A inclinação não está
    no arquivo coletado, então o simulador começa num trânsito central.
    """
    t = analise.com_raio_medido(df)
    t = t[t["pl_orbper"].gt(0) & t["pl_rade"].gt(0) & t["st_rad"].gt(0) & (t["pl_orbsmax"].gt(0) | t["st_mass"].gt(0))]
    t = t.sort_values("pl_name")
    c = CASAS_TRANSITOS
    linhas = [
        [
            str(r.pl_name),
            _valor(r.pl_orbper, c["periodo"]),
            _valor(r.pl_rade, c["raio"]),
            _valor(r.st_rad, c["raio_estrela"]),
            _valor(r.pl_orbsmax if r.pl_orbsmax > 0 else None, c["semi_eixo"]),
            _valor(r.st_mass if r.st_mass > 0 else None, c["massa_estrela"]),
        ]
        for r in t.itertuples()
    ]
    return {"colunas": COLUNAS_TRANSITOS, "linhas": linhas}


def descobertas(df: pd.DataFrame) -> dict:
    """Descobertas por ano e método, para o gráfico de barras empilhadas."""
    tabela = analise.descobertas_por_ano(df)
    return {
        "anos": [int(a) for a in tabela.index],
        "metodos": {str(metodo): [int(v) for v in tabela[metodo]] for metodo in tabela.columns},
        "nomes": {m: dados.NOMES_METODOS[m] for m in tabela.columns},
    }


def parametros() -> dict:
    """Constantes da análise que o site desenha (fronteiras de tamanho e deserto)."""
    return {
        "classes": [
            {"nome": nome, "min": minimo, "max": None if math.isinf(maximo) else maximo} for nome, minimo, maximo in dados.CLASSES_TAMANHO
        ],
        "deserto": {
            "periodo_max": analise.DESERTO_PERIODO_DIAS,
            "raio_min": analise.DESERTO_RAIO[0],
            "raio_max": analise.DESERTO_RAIO[1],
        },
    }


def sem_nan(obj):
    """Troca NaN e infinitos por None: o JSON do site não aceita `NaN` e o navegador leria `null`."""
    if isinstance(obj, float) and not math.isfinite(obj):
        return None
    if isinstance(obj, dict):
        return {k: sem_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sem_nan(v) for v in obj]
    return obj


def gerar(df: pd.DataFrame, metricas: dict) -> dict[str, dict]:
    """Todos os arquivos de dados do site, indexados pelo nome do arquivo."""
    return {
        "planetas.json": planetas_com_raio(df),
        "transitos.json": transitos(df),
        "descobertas.json": descobertas(df),
        "metricas.json": sem_nan(metricas),
        "parametros.json": parametros(),
    }


def gravar(arquivos: dict[str, dict], pasta: Path = SITE_DADOS) -> None:
    pasta.mkdir(parents=True, exist_ok=True)
    for nome, conteudo in arquivos.items():
        texto = json.dumps(conteudo, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        (pasta / nome).write_text(texto + "\n", encoding="utf-8")
