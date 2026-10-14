"""Gráficos estáticos para o README, em versão clara e escura.

Paleta categórica validada (skill dataviz): ordem fixa, nunca reciclada.
Rótulos e textos usam cores de texto; a cor identifica só a série.
"""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.ticker import FuncFormatter, LogLocator

from exoplanetas.dados import NOMES_METODOS

TEMAS = {
    "claro": {
        "fundo": "#fcfcfb",
        "texto": "#0b0b0b",
        "texto2": "#52514e",
        "grade": "#e6e5e0",
        "series": ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"],
    },
    "escuro": {
        "fundo": "#1a1a19",
        "texto": "#f0efec",
        "texto2": "#c3c2b7",
        "grade": "#33332f",
        "series": ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"],
    },
}
CINZA = {"claro": "#9a998f", "escuro": "#77766d"}


def _eixos(tema: str, largura: float = 9, altura: float = 5.2):
    t = TEMAS[tema]
    fig, ax = plt.subplots(figsize=(largura, altura), dpi=160)
    fig.patch.set_facecolor(t["fundo"])
    ax.set_facecolor(t["fundo"])
    for lado in ("top", "right"):
        ax.spines[lado].set_visible(False)
    for lado in ("left", "bottom"):
        ax.spines[lado].set_color(t["grade"])
    ax.tick_params(colors=t["texto2"], labelsize=9, length=0)
    ax.grid(True, color=t["grade"], linewidth=0.6)
    ax.set_axisbelow(True)
    return fig, ax, t


def _titulo(ax, t, titulo: str, subtitulo: str) -> None:
    ax.set_title(titulo, loc="left", color=t["texto"], fontsize=13, fontweight="bold", pad=24)
    ax.text(0, 1.02, subtitulo, transform=ax.transAxes, color=t["texto2"], fontsize=9.5, va="bottom")


def _salvar(fig, destino: Path) -> Path:
    destino.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(destino, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    return destino


def milhar(n: int) -> str:
    """Separador de milhar brasileiro: 1504 -> 1.504."""
    return f"{n:,}".replace(",", ".")


def _log_formatador(v, _):
    return f"{v:g}"


def descobertas(tabela: pd.DataFrame, nota_pico: str, tema: str, destino: Path) -> Path:
    """Barras empilhadas por ano e método, com 2px de separação entre segmentos."""
    fig, ax, t = _eixos(tema)
    base = np.zeros(len(tabela))
    for i, metodo in enumerate(tabela.columns):
        valores = tabela[metodo].to_numpy()
        ax.bar(
            tabela.index,
            valores,
            bottom=base,
            width=0.8,
            color=t["series"][i],
            edgecolor=t["fundo"],
            linewidth=0.8,
            label=NOMES_METODOS.get(metodo, metodo),
        )
        base += valores
    pico = int(tabela.sum(axis=1).idxmax())
    ax.annotate(
        f"{pico}: {milhar(int(base.max()))} descobertas\n{nota_pico}",
        xy=(pico, base.max()),
        xytext=(pico - 14, base.max() * 0.92),
        color=t["texto"],
        fontsize=9,
        arrowprops={"arrowstyle": "-", "color": t["texto2"], "linewidth": 0.8},
    )
    ax.set_ylabel("Planetas descobertos", color=t["texto2"], fontsize=10)
    ax.set_xlim(tabela.index.min() - 1, tabela.index.max() + 1)
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: milhar(int(v))))
    ax.grid(axis="x", visible=False)
    leg = ax.legend(frameon=False, fontsize=9, loc="upper left", ncols=1)
    for txt in leg.get_texts():
        txt.set_color(t["texto"])
    _titulo(ax, t, "Descobertas de exoplanetas por ano", "Planetas confirmados por método de detecção · NASA Exoplanet Archive")
    return _salvar(fig, destino)


def periodo_raio(df: pd.DataFrame, tema: str, destino: Path) -> Path:
    """Diagrama período × raio dos planetas de trânsito, com o deserto destacado."""
    fig, ax, t = _eixos(tema, altura=5.6)
    ax.add_patch(plt.Rectangle((0.2, 2.0), 3.0 - 0.2, 6.0 - 2.0, facecolor=t["series"][1], alpha=0.10, edgecolor="none", zorder=0))
    ax.scatter(df["pl_orbper"], df["pl_rade"], s=9, color=t["series"][0], alpha=0.45, linewidths=0)
    ax.text(0.24, 5.4, "deserto de\nNetunos quentes", color=t["texto"], fontsize=9, va="top")
    for raio, nome in [(1.0, "Terra"), (3.88, "Netuno"), (11.2, "Júpiter")]:
        ax.axhline(raio, color=t["texto2"], linewidth=0.7, linestyle=(0, (3, 3)))
        ax.text(1500, raio * 1.06, nome, color=t["texto2"], fontsize=8.5, ha="right")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlim(0.2, 1600)
    ax.set_ylim(0.3, 30)
    for eixo in (ax.xaxis, ax.yaxis):
        eixo.set_major_locator(LogLocator(base=10, subs=(1.0, 3.0)))
        eixo.set_major_formatter(FuncFormatter(_log_formatador))
    ax.set_xlabel("Período orbital (dias)", color=t["texto2"], fontsize=10)
    ax.set_ylabel("Raio (raios terrestres)", color=t["texto2"], fontsize=10)
    _titulo(ax, t, "Período × raio: onde os planetas estão", f"{milhar(len(df))} planetas de trânsito com raio medido")
    return _salvar(fig, destino)


def massa_raio(df: pd.DataFrame, prev_log: np.ndarray, lei: dict, tema: str, destino: Path) -> Path:
    """Massa × raio medidos, com a lei de potência e as previsões do modelo."""
    fig, ax, t = _eixos(tema, altura=5.6)
    ax.scatter(df["pl_bmasse"], df["pl_rade"], s=10, color=t["series"][0], alpha=0.5, linewidths=0, label="Medido")
    ax.scatter(df["pl_bmasse"], 10**prev_log, s=10, color=t["series"][1], alpha=0.5, linewidths=0, label="Previsto pelo modelo (fora da amostra)")
    xs = np.logspace(np.log10(df["pl_bmasse"].min()), np.log10(df["pl_bmasse"].max()), 100)
    ax.plot(xs, lei["constante"] * xs ** lei["expoente"], color=t["texto"], linewidth=1.6, label=f"Lei de potência R ∝ M^{lei['expoente']:.2f}")
    ax.set_xscale("log")
    ax.set_yscale("log")
    for eixo in (ax.xaxis, ax.yaxis):
        eixo.set_major_formatter(FuncFormatter(_log_formatador))
    ax.set_xlabel("Massa (massas terrestres)", color=t["texto2"], fontsize=10)
    ax.set_ylabel("Raio (raios terrestres)", color=t["texto2"], fontsize=10)
    leg = ax.legend(frameon=False, fontsize=9, loc="upper left", markerscale=2)
    for txt in leg.get_texts():
        txt.set_color(t["texto"])
    _titulo(ax, t, "Uma reta só não explica massa e raio", "Planetas com massa e raio medidos · previsões por validação cruzada agrupada por estrela")
    return _salvar(fig, destino)


def importancias(imp: dict[str, float], tema: str, destino: Path) -> Path:
    """Barras horizontais da importância por permutação."""
    nomes = {
        "log_massa": "Massa do planeta",
        "st_mass": "Massa da estrela",
        "log_periodo": "Período orbital",
        "st_teff": "Temperatura da estrela",
        "log_insolacao": "Luz recebida",
        "st_met": "Metalicidade da estrela",
    }
    itens = list(imp.items())[::-1]
    fig, ax, t = _eixos(tema, largura=8, altura=3.6)
    y = np.arange(len(itens))
    valores = [v for _, v in itens]
    ax.barh(y, valores, height=0.6, color=t["series"][0])
    ax.set_yticks(y, [nomes.get(k, k) for k, _ in itens], color=t["texto"])
    for yi, v in zip(y, valores, strict=True):
        ax.text(v + max(valores) * 0.01, yi, f"{v:.3f}", va="center", color=t["texto2"], fontsize=8.5)
    ax.grid(axis="y", visible=False)
    ax.set_xlabel("Aumento do erro ao embaralhar a variável (MAE em log10)", color=t["texto2"], fontsize=9.5)
    _titulo(ax, t, "O que o modelo usa para estimar o raio", "Importância por permutação do gradient boosting")
    return _salvar(fig, destino)
