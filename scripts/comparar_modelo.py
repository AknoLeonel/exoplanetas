"""Compara dois modelo-raio.json com tolerância nos números.

Uso: python scripts/comparar_modelo.py <versionado.json> <gerado.json>
Sai com erro e lista onde diferem; o CI usa no lugar do git diff para este arquivo.
"""

import json
import sys

from exoplanetas.modelo_web import diferencas


def main(antigo: str, novo: str) -> int:
    with open(antigo, encoding="utf-8") as a, open(novo, encoding="utf-8") as b:
        lista = diferencas(json.load(a), json.load(b))
    for d in lista[:20]:
        print(f"difere: {d}")
    if lista:
        print(f"{len(lista)} diferença(s): rode python -m exoplanetas.pipeline e versione o modelo-raio.json.")
        return 1
    print("modelo-raio.json igual ao versionado (dentro da tolerância).")
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:3]))
