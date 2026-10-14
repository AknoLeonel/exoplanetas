"""Baixa os planetas confirmados do NASA Exoplanet Archive (tabela pscomppars).

Uso: python scripts/coletar_dados.py
Gera data/exoplanetas.csv e data/metadados.json.
"""

import csv
import io
import json
import sys
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
COLUNAS = [
    "pl_name",
    "hostname",
    "discoverymethod",
    "disc_year",
    "disc_facility",
    "pl_orbper",
    "pl_orbsmax",
    "pl_rade",
    "pl_bmasse",
    "pl_bmassprov",
    "pl_dens",
    "pl_eqt",
    "pl_insol",
    "pl_orbeccen",
    "st_teff",
    "st_rad",
    "st_mass",
    "st_met",
    "sy_dist",
    "sy_pnum",
]
MINIMO_ESPERADO = 5000  # o arquivo tinha 6.445 planetas em out/2026

RAIZ = Path(__file__).resolve().parent.parent
SAIDA_CSV = RAIZ / "data" / "exoplanetas.csv"
SAIDA_META = RAIZ / "data" / "metadados.json"


def montar_url() -> str:
    consulta = f"select {','.join(COLUNAS)} from pscomppars order by pl_name"
    return f"{TAP}?{urllib.parse.urlencode({'query': consulta, 'format': 'csv'})}"


def validar(texto: str) -> int:
    leitor = csv.reader(io.StringIO(texto))
    cabecalho = next(leitor)
    if cabecalho != COLUNAS:
        raise ValueError(f"colunas inesperadas: {cabecalho}")
    linhas = sum(1 for _ in leitor)
    if linhas < MINIMO_ESPERADO:
        raise ValueError(f"só {linhas} planetas; esperado ao menos {MINIMO_ESPERADO}")
    return linhas


def main() -> int:
    url = montar_url()
    with urllib.request.urlopen(url, timeout=120) as resposta:
        texto = resposta.read().decode("utf-8")
    linhas = validar(texto)
    SAIDA_CSV.parent.mkdir(parents=True, exist_ok=True)
    SAIDA_CSV.write_text(texto, encoding="utf-8")
    SAIDA_META.write_text(
        json.dumps(
            {
                "fonte": "NASA Exoplanet Archive, tabela pscomppars",
                "url": url,
                "coletado_em": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "planetas": linhas,
                "colunas": COLUNAS,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"{linhas} planetas salvos em {SAIDA_CSV.relative_to(RAIZ)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
