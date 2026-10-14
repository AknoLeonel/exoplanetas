import { describe, expect, it } from "vitest";
import { h, svg } from "../../src/ui/dom";

describe("h", () => {
  it("cria elementos com atributos e filhos, e ignora valores vazios", () => {
    const el = h(
      "a",
      { href: "/x", hidden: true, "data-n": 3, "data-nada": undefined, "data-falso": false },
      "texto ",
      null,
      undefined,
      false,
      h("b", {}, "negrito"),
    );
    expect(el.outerHTML).toBe('<a href="/x" hidden="" data-n="3">texto <b>negrito</b></a>');
  });

  it("nunca interpreta texto como HTML", () => {
    const el = h("p", {}, '<img src=x onerror="alert(1)">');
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toBe('<img src=x onerror="alert(1)">');
  });
});

describe("svg", () => {
  it("cria elementos no namespace SVG", () => {
    const el = svg("rect", { width: 10, height: 5, x: undefined, rx: false }, svg("title", {}, "t"));
    expect(el.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(el.getAttribute("width")).toBe("10");
    expect(el.hasAttribute("x")).toBe(false);
    expect(el.hasAttribute("rx")).toBe(false);
    expect(el.querySelector("title")?.textContent).toBe("t");
  });

  it("aceita filhos nulos", () => {
    expect(svg("g", {}, null, undefined, false).childNodes).toHaveLength(0);
  });
});
