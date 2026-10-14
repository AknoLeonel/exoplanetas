"""O README só pode citar números que o pipeline gerou (ver AGENTS.md)."""

import json

from exoplanetas.dados import RAIZ
from exoplanetas.graficos import milhar
from exoplanetas.pipeline import MODELO_FINAL

METRICAS = RAIZ / "reports" / "metricas.json"
README = RAIZ / "README.md"


def pct(x: float) -> str:
    return f"{x:.1f}%".replace(".", ",")


def test_readme_cita_os_numeros_do_metricas_json():
    m = json.loads(METRICAS.read_text(encoding="utf-8"))
    texto = README.read_text(encoding="utf-8")
    d, desc, mod = m["dados"], m["descobertas"], m["modelo"]
    deserto = m["deserto_netunos_quentes"]
    esperados = [
        milhar(d["planetas"]),
        milhar(d["estrelas"]),
        milhar(d["massas_estimadas_por_relacao_mr"]),
        f"**{desc['ano_de_pico']}**: {milhar(desc['planetas_no_pico'])} planetas, {milhar(desc['kepler_no_pico'])} deles",
        f"Até {desc['virada_do_transito']['ano'] - 1}, **{desc['virada_do_transito']['fracao_velocidade_radial_antes'] * 100:.0f}%**",
        *(f"| {milhar(v)} |" for v in m["tamanhos_raio_medido"].values()),
        *(f"| {milhar(v)} |" for v in desc["por_metodo"].values()),
        f"**{pct(deserto['fracao_netunos_geral'] * 100)}**",
        f"**{pct(deserto['fracao_netunos_orbita_curta'] * 100)}**",
        f"(de {milhar(deserto['planetas_orbita_curta'])} planetas)",
        f"**{milhar(mod['planetas'])} planetas**",
        f"{milhar(mod['estrelas'])} estrelas",
        f"R ∝ M^{mod['lei_de_potencia']['expoente']:.2f}".replace(".", ","),
    ]
    for r in mod["resultados"].values():
        esperados += [pct(r["erro_percentual_mediano"]), pct(r["dentro_de_20pct"]), f"{r['r2_log']:.2f}".replace(".", ",")]
    for ano, v in desc["dois_maiores_anos"].items():
        sufixo = f"de {ano}" if ano == str(desc["ano_de_pico"]) else f"planetas de {ano}"
        esperados.append(f"{milhar(v['kepler'])} dos {milhar(v['total'])} {sufixo}")
    for p in m["parecidos_com_a_terra_mais_proximos"][:1]:
        esperados.append(p["pl_name"])
    faltando = [e for e in esperados if e not in texto]
    assert not faltando, f"README desatualizado; não encontrei: {faltando}"
    assert f"Erro mediano do modelo de raio | **{pct(mod['resultados'][MODELO_FINAL]['erro_percentual_mediano'])}**" in texto
