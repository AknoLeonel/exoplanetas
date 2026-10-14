"""Roda tudo: python -m exoplanetas.pipeline

Gera reports/metricas.json e reports/figuras/*-{claro,escuro}.png.
Todo número citado no README vem do metricas.json.
"""

import json
from pathlib import Path

from exoplanetas import analise, dados, graficos, modelo

SAIDA = dados.RAIZ / "reports"
SITE = dados.RAIZ / "site"
MODELO_FINAL = "Gradient boosting (todas as variáveis)"


def _arredondar(obj, casas: int = 4):
    if isinstance(obj, float):
        return round(obj, casas)
    if isinstance(obj, dict):
        return {k: _arredondar(v, casas) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_arredondar(v, casas) for v in obj]
    return obj


def _sig(x: float, digitos: int = 4) -> float | None:
    """Arredonda para `digitos` algarismos significativos (deixa o JSON do site leve)."""
    if x is None or x != x:  # NaN
        return None
    return float(f"{x:.{digitos}g}")


def dados_do_site(df) -> dict:
    """Planetas com período e raio, em formato de colunas, para o gráfico do site.

    `medido` diz se o raio veio de trânsito (medido) ou de uma estimativa do arquivo.
    """
    base = df[df["pl_orbper"].gt(0) & df["pl_rade"].gt(0)].sort_values("pl_name")
    medido = base["discoverymethod"].eq("Transit")
    return {
        "colunas": ["nome", "metodo", "ano", "periodo", "raio", "massa", "medido"],
        "linhas": [
            [
                r.pl_name,
                r.discoverymethod,
                int(r.disc_year),
                _sig(r.pl_orbper),
                _sig(r.pl_rade),
                _sig(r.pl_bmasse),
                bool(m),
            ]
            for r, m in zip(base.itertuples(index=False), medido, strict=True)
        ],
    }


def executar(csv: Path = dados.CSV_PADRAO, saida: Path = SAIDA, figuras: bool = True, site: Path | None = SITE) -> dict:
    df = dados.carregar(csv)
    meta_path = csv.parent / "metadados.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}

    tabela = analise.descobertas_por_ano(df)
    ano_pico, n_pico = analise.ano_de_pico(df)
    kepler_pico = int(((df["disc_year"] == ano_pico) & (df["disc_facility"] == "Kepler")).sum())

    base = dados.adicionar_features(dados.selecionar_modelaveis(df))
    avaliacao = modelo.avaliar(base)
    lei = modelo.lei_de_potencia(base)
    imp = modelo.importancia(base)
    parecidos = analise.mais_proximos_parecidos_com_a_terra(df)

    resultado = {
        "dados": {
            "coletado_em": meta.get("coletado_em"),
            "planetas": len(df),
            "estrelas": int(df["hostname"].nunique()),
            "primeiro_ano": int(df["disc_year"].min()),
            "ultimo_ano": int(df["disc_year"].max()),
            "massas_estimadas_por_relacao_mr": int((df["pl_bmassprov"] == "M-R relationship").sum()),
        },
        "descobertas": {
            "por_metodo": analise.resumo_metodos(df),
            "ano_de_pico": ano_pico,
            "planetas_no_pico": n_pico,
            "kepler_no_pico": kepler_pico,
            "virada_do_transito": analise.virada_do_transito(df),
            "dois_maiores_anos": analise.kepler_por_ano(df, sorted(df["disc_year"].value_counts().index[:2].tolist())),
        },
        "tamanhos_raio_medido": analise.contagem_por_tamanho(df),
        "deserto_netunos_quentes": analise.deserto_netunos_quentes(df),
        "parecidos_com_a_terra_mais_proximos": parecidos.to_dict(orient="records"),
        "modelo": {
            "planetas": len(base),
            "estrelas": int(base["hostname"].nunique()),
            "validacao": "GroupKFold (5 dobras) agrupado por estrela hospedeira",
            "features": dados.FEATURES,
            "resultados": avaliacao.metricas,
            "lei_de_potencia": lei,
            "importancia_permutacao": imp,
        },
    }
    resultado = _arredondar(resultado)

    saida.mkdir(parents=True, exist_ok=True)
    (saida / "metricas.json").write_text(json.dumps(resultado, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if site is not None:
        pasta_site = site / "dados"
        pasta_site.mkdir(parents=True, exist_ok=True)
        (pasta_site / "metricas.json").write_text(json.dumps(resultado, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        (pasta_site / "descobertas.json").write_text(
            json.dumps({"anos": [int(a) for a in tabela.index], "series": {k: [int(v) for v in tabela[k]] for k in tabela.columns}}),
            encoding="utf-8",
        )
        (pasta_site / "planetas.json").write_text(json.dumps(dados_do_site(df), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    if figuras:
        transito = analise.com_raio_medido(df)
        transito = transito[transito["pl_orbper"].notna()]
        nota = f"({graficos.milhar(kepler_pico)} pelo telescópio Kepler)"
        pasta = saida / "figuras"
        for tema in graficos.TEMAS:
            graficos.descobertas(tabela, nota, tema, pasta / f"descobertas-{tema}.png")
            graficos.periodo_raio(transito, tema, pasta / f"periodo-raio-{tema}.png")
            graficos.massa_raio(base, avaliacao.previsoes[MODELO_FINAL], lei, tema, pasta / f"massa-raio-{tema}.png")
            graficos.importancias(imp, tema, pasta / f"importancia-{tema}.png")
    return resultado


if __name__ == "__main__":
    r = executar()
    final = r["modelo"]["resultados"][MODELO_FINAL]
    print(f"{r['dados']['planetas']} planetas · modelo: erro mediano {final['erro_percentual_mediano']:.1f}% · R² {final['r2_log']:.3f}")
