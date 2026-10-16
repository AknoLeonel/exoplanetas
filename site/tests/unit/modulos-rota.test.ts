import { describe, expect, it } from "vitest";
import { acharModulo, MODULO_INICIAL, MODULOS, modoSuportado, modulosDisponiveis } from "../../src/lib/modulos";
import { ehRota, lerRota, montarHash, type Rota } from "../../src/lib/rota";

const validos = new Set(["inicio", "catalogo", "transito"]);

describe("registro de módulos", () => {
  it("os ids são únicos e o início existe", () => {
    const ids = MODULOS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(acharModulo(MODULO_INICIAL)?.status).toBe("disponivel");
  });

  it("todo módulo tem pelo menos um modo, título e resumo", () => {
    for (const m of MODULOS) {
      expect(m.modos.length).toBeGreaterThan(0);
      expect(m.titulo).not.toBe("");
      expect(m.resumo).not.toBe("");
    }
  });

  it("só os disponíveis têm página; os demais são roteiro", () => {
    const disponiveis = modulosDisponiveis().map((m) => m.id);
    expect(disponiveis).toEqual(expect.arrayContaining(["catalogo", "transito", "velocidade-radial"]));
    expect(disponiveis).not.toContain("ml");
    expect(MODULOS.filter((m) => m.status === "em-breve").length).toBeGreaterThan(0);
  });

  it("acharModulo devolve undefined para id desconhecido", () => {
    expect(acharModulo("nao-existe")).toBeUndefined();
  });

  it("modoSuportado respeita o pedido ou cai no primeiro modo do módulo", () => {
    const duplo = { id: "x", titulo: "x", resumo: "x", status: "disponivel", modos: ["aprender", "explorar"] } as const;
    const so = { ...duplo, modos: ["aprender"] } as const;
    expect(modoSuportado(duplo, "explorar")).toBe("explorar");
    expect(modoSuportado(duplo, "aprender")).toBe("aprender");
    expect(modoSuportado(so, "explorar")).toBe("aprender");
    expect(modoSuportado({ ...duplo, modos: [] }, "aprender")).toBe("explorar");
  });
});

describe("ehRota", () => {
  it("rotas começam com #/, e o hash vazio também conta", () => {
    expect(ehRota("")).toBe(true);
    expect(ehRota("#")).toBe(true);
    expect(ehRota("#/catalogo")).toBe(true);
    expect(ehRota("#explorar")).toBe(false);
    expect(ehRota("#principal")).toBe(false);
  });
});

describe("lerRota", () => {
  it("lê módulo, modo e parâmetros", () => {
    expect(lerRota("#/transito?modo=aprender&raio=1.2&p=3", validos)).toEqual({
      modulo: "transito",
      modo: "aprender",
      parametros: { raio: "1.2", p: "3" },
    });
  });

  it("hash vazio, #, #/ ou módulo desconhecido levam ao início", () => {
    for (const h of ["", "#", "#/", "#/nao-existe", "#/nao-existe?modo=aprender", "#explorar"]) {
      expect(lerRota(h, validos).modulo).toBe("inicio");
    }
  });

  it("lê também sem a barra (#catalogo), embora o shell só reaja a hashes que começam com #/", () => {
    expect(lerRota("#catalogo", validos).modulo).toBe("catalogo");
  });

  it("modo ausente ou inválido vira explorar", () => {
    expect(lerRota("#/transito", validos).modo).toBe("explorar");
    expect(lerRota("#/transito?modo=zzz", validos).modo).toBe("explorar");
    expect(lerRota("#/transito?modo=", validos).modo).toBe("explorar");
  });

  it("parâmetros repetidos ficam com o último; modo não vaza para os parâmetros", () => {
    const r = lerRota("#/transito?a=1&a=2&modo=aprender", validos);
    expect(r.parametros).toEqual({ a: "2" });
  });

  it("decodifica valores com acento e espaço", () => {
    expect(lerRota("#/catalogo?busca=Kepler-22%20b&nome=A%C3%A7o", validos).parametros).toEqual({
      busca: "Kepler-22 b",
      nome: "Aço",
    });
  });

  it("aceita barras extras e subcaminhos (só o primeiro segmento é o módulo)", () => {
    expect(lerRota("#//transito/outra/coisa", validos).modulo).toBe("transito");
  });

  it("um ? sem nada depois não quebra", () => {
    expect(lerRota("#/transito?", validos)).toEqual({ modulo: "transito", modo: "explorar", parametros: {} });
  });
});

describe("montarHash", () => {
  it("o modo padrão não aparece na URL", () => {
    expect(montarHash({ modulo: "catalogo", modo: "explorar", parametros: {} })).toBe("#/catalogo");
    expect(montarHash({ modulo: "transito", modo: "aprender", parametros: {} })).toBe("#/transito?modo=aprender");
  });

  it("parâmetros saem em ordem alfabética, codificados", () => {
    expect(montarHash({ modulo: "transito", modo: "explorar", parametros: { z: "1", a: "x y" } })).toBe(
      "#/transito?a=x+y&z=1",
    );
  });

  it("é o inverso de lerRota", () => {
    const rotas: Rota[] = [
      { modulo: "inicio", modo: "explorar", parametros: {} },
      { modulo: "transito", modo: "aprender", parametros: { raio: "1.2", nome: "Aço & cia" } },
      { modulo: "catalogo", modo: "explorar", parametros: { busca: "TRAPPIST-1 e" } },
    ];
    for (const r of rotas) expect(lerRota(montarHash(r), validos)).toEqual(r);
  });
});
