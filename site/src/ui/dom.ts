type Atributos = Record<string, string | number | boolean | undefined>;
type Filho = Node | string | null | undefined | false;

/** Cria um elemento. Textos entram como nós de texto, nunca como HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  atributos: Atributos = {},
  ...filhos: Filho[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === undefined || valor === false) continue;
    el.setAttribute(chave, valor === true ? "" : String(valor));
  }
  for (const filho of filhos) {
    if (filho === null || filho === undefined || filho === false) continue;
    el.append(filho);
  }
  return el;
}

const NS_SVG = "http://www.w3.org/2000/svg";

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  atributos: Atributos = {},
  ...filhos: Filho[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS_SVG, tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === undefined || valor === false) continue;
    el.setAttribute(chave, String(valor));
  }
  for (const filho of filhos) {
    if (filho === null || filho === undefined || filho === false) continue;
    el.append(filho);
  }
  return el;
}
