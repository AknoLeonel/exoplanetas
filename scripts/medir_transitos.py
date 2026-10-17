"""Teste de viabilidade da medição própria (Issue #41): mede trânsitos com as curvas de luz do TESS.

Uso: python scripts/medir_transitos.py [--alvos "WASP-18 b,KELT-11 b"] [--setores 6] [--saida medicoes.json]

Para cada alvo:
1. lê período e Rp/R★, com as incertezas, na tabela pscomppars do NASA Exoplanet Archive;
2. baixa as curvas SPOC de 2 minutos do TESS pelo MAST (lightkurve);
3. tira a tendência da estrela, acha o período por BLS e ajusta o trânsito (src/exoplanetas/medicao.py);
4. compara com o catálogo.

Grava o resultado em JSON e um resumo em Markdown (no resumo do job, quando roda no GitHub Actions).
Sai com código 1 se o teste for reprovado. Precisa de rede e do lightkurve: roda pelo workflow medicao.yml.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "src"))

from exoplanetas import medicao  # noqa: E402

TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
ALVOS = ("WASP-18 b", "WASP-121 b", "WASP-19 b", "KELT-11 b", "HD 209458 b")
COLUNAS = [
    "pl_name",
    "hostname",
    "pl_orbper",
    "pl_orbpererr1",
    "pl_orbpererr2",
    "pl_ratror",
    "pl_ratrorerr1",
    "pl_ratrorerr2",
    "pl_rade",
    "pl_radeerr1",
    "pl_radeerr2",
    "st_rad",
    "st_raderr1",
    "st_raderr2",
]
# Janela do filtro que tira a tendência da estrela: 0,75 dia em cadência de 2 minutos (ímpar).
JANELA_DO_FILTRO = 541


def montar_url(nomes: list[str]) -> str:
    lista = ",".join("'" + n.replace("'", "''") + "'" for n in nomes)
    consulta = f"select {','.join(COLUNAS)} from pscomppars where pl_name in ({lista})"
    return f"{TAP}?{urllib.parse.urlencode({'query': consulta, 'format': 'json'})}"


def consultar_catalogo(nomes: list[str]) -> tuple[dict[str, dict], str]:
    url = montar_url(nomes)
    with urllib.request.urlopen(url, timeout=120) as resposta:
        linhas = json.loads(resposta.read().decode("utf-8"))
    return {linha["pl_name"]: linha for linha in linhas}, url


def baixar(estrela: str, setores: int):
    import lightkurve as lk

    busca = lk.search_lightcurve(estrela, mission="TESS", author="SPOC", exptime=120)
    if len(busca) == 0:
        raise RuntimeError(f"nenhuma curva SPOC de 2 minutos para {estrela}")
    colecao = busca[:setores].download_all(quality_bitmask="default", flux_column="pdcsap_flux")
    curva = colecao.stitch().remove_nans().remove_outliers(sigma_upper=4, sigma_lower=50)
    lista = sorted({int(s) for s in busca[:setores].table["sequence_number"]})
    return curva, lista


def medir(nome: str, linha: dict, setores: int) -> dict:
    inicio = time.monotonic()
    curva, lista = baixar(linha["hostname"], setores)
    plana = curva.flatten(window_length=JANELA_DO_FILTRO)
    periodo = medicao.buscar_periodo(plana.time.value, plana.flux.value)
    # Segunda passada: a tendência é recalculada sem os trânsitos, para não comer a profundidade.
    mascara = medicao.mascara_de_transito(curva.time.value, periodo, janela=1.0)
    plana = curva.flatten(window_length=JANELA_DO_FILTRO, mask=mascara)
    ajuste = medicao.ajustar_transito(plana.time.value, plana.flux.value, periodo)
    return {
        "planeta": nome,
        "estrela": linha["hostname"],
        "setores_tess": lista,
        "bls": asdict(periodo),
        "ajuste": ajuste.como_dict(),
        **medicao.comparar(ajuste, linha),
        "segundos": round(time.monotonic() - inicio, 1),
    }


def resumo(resultado: dict) -> str:
    """Tabela em Markdown com a medição, o catálogo e o veredito."""
    v = resultado["veredito"]
    linhas = [
        f"## Medição própria de trânsitos: {'aprovado' if v['aprovado'] else 'reprovado'}",
        "",
        f"Período bate (≤ {medicao.TOLERANCIA_DO_PERIODO:.1%}): {v['periodo_bate']} de {v['alvos']}. "
        f"Rp/R★ bate (≤ {medicao.SIGMAS_DA_RAZAO:g}σ): {v['razao_bate']} de {v['alvos']}. Mínimo: {v['minimo']}.",
        "",
        "| Planeta | Período medido (d) | Catálogo (d) | Rp/R★ medido | Catálogo | Setores |",
        "| :-- | --: | --: | --: | --: | :-- |",
    ]
    for c in resultado["alvos"]:
        if "erro" in c:
            linhas.append(f"| {c['planeta']} | erro: {c['erro']} | | | | |")
            continue
        p, r = c["periodo"], c["razao_de_raios"]
        catalogo_r = "—" if r["catalogo"] is None else f"{r['catalogo']:.5f} ± {r['sigma_catalogo'] or 0:.5f}"
        linhas.append(
            f"| {c['planeta']} | {p['medido']:.7f} ± {p['sigma']:.1e} {'✅' if p['bate'] else '❌'} | {p['catalogo']} "
            f"| {r['medido']:.5f} ± {r['sigma']:.5f} {'✅' if r['bate'] else '❌'} | {catalogo_r} "
            f"| {', '.join(map(str, c['setores_tess']))} |"
        )
    return "\n".join(linhas) + "\n"


def main(argv: list[str] | None = None) -> int:
    argumentos = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    argumentos.add_argument("--alvos", default=",".join(ALVOS))
    argumentos.add_argument("--setores", type=int, default=6, help="máximo de setores do TESS por alvo")
    argumentos.add_argument("--saida", default="medicoes.json")
    a = argumentos.parse_args(argv)
    nomes = [n.strip() for n in a.alvos.split(",") if n.strip()]
    catalogo, url = consultar_catalogo(nomes)
    alvos = []
    for nome in nomes:
        try:
            if nome not in catalogo:
                raise KeyError("planeta não encontrado no pscomppars")
            alvos.append(medir(nome, catalogo[nome], a.setores))
        except Exception as erro:  # um alvo com problema não derruba os outros
            alvos.append({"planeta": nome, "erro": f"{type(erro).__name__}: {erro}"})
        print(json.dumps(alvos[-1], ensure_ascii=False), flush=True)
    resultado = {
        "gerado_em": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fonte_da_curva": "TESS SPOC, cadência de 2 minutos (MAST)",
        "fonte_do_catalogo": url,
        "metodo": medicao.__doc__.strip(),
        "alvos": alvos,
        "veredito": medicao.veredito(alvos),
    }
    Path(a.saida).write_text(json.dumps(resultado, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    texto = resumo(resultado)
    print(texto)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as arquivo:
            arquivo.write(texto)
    return 0 if resultado["veredito"]["aprovado"] else 1


if __name__ == "__main__":
    sys.exit(main())
