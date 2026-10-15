import { describe, expect, it } from "vitest";
import { anosLuz, celsius, compacto, decimal, eixo, milhar, percentual } from "../../src/lib/formato";

describe("formato", () => {
  it("separa milhares com ponto", () => {
    expect(milhar(6445)).toBe("6.445");
    expect(milhar(12)).toBe("12");
    expect(milhar(1504.4)).toBe("1.504");
  });

  it("usa vírgula decimal", () => {
    expect(decimal(18.6355)).toBe("18,6");
    expect(decimal(18.6355, 2)).toBe("18,64");
    expect(decimal(3, 2)).toBe("3,00");
  });

  it("formata percentuais já em %", () => {
    expect(percentual(18.6355)).toBe("18,6%");
    expect(percentual(5.2882, 0)).toBe("5%");
  });

  it("compacto escolhe as casas pela ordem de grandeza", () => {
    expect(compacto(1432)).toBe("1.432");
    expect(compacto(100)).toBe("100");
    expect(compacto(99.96)).toBe("100,0");
    expect(compacto(10)).toBe("10,0");
    expect(compacto(8.4634)).toBe("8,46");
    expect(compacto(1)).toBe("1,00");
    expect(compacto(0.112)).toBe("0,112");
  });

  it("rótulos de eixo não têm zeros sobrando", () => {
    expect(eixo(0.1)).toBe("0,1");
    expect(eixo(1)).toBe("1");
    expect(eixo(10000)).toBe("10.000");
  });

  it("converte kelvin em graus Celsius, arredondado", () => {
    expect(celsius(273.15)).toBe("0 °C");
    expect(celsius(288)).toBe("15 °C");
    expect(celsius(314.6)).toBe("41 °C");
    expect(celsius(80)).toBe("-193 °C");
    expect(celsius(273)).toBe("0 °C"); // nunca "-0 °C"
    expect(celsius(272.9)).toBe("0 °C");
    expect(celsius(1500)).toBe("1.227 °C");
  });

  it("converte parsecs em anos-luz", () => {
    expect(anosLuz(12.4299)).toBe("41 anos-luz");
    expect(anosLuz(1000)).toBe("3.262 anos-luz");
  });
});
