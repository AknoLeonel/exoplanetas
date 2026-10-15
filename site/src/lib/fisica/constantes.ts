/**
 * Constantes físicas e astronômicas, em unidades do SI.
 * Valores nominais da IAU 2015 (resolução B3) e CODATA 2018, os mesmos que o astropy usa.
 */
export const G = 6.6743e-11; // m³ kg⁻¹ s⁻² (CODATA 2018)
export const SIGMA_SB = 5.670374419e-8; // W m⁻² K⁻⁴ (CODATA 2018)

export const UA = 1.495978707e11; // m (IAU 2012, exato)
export const DIA = 86_400; // s
export const ANO_JULIANO = 365.25 * DIA; // s

export const R_SOL = 6.957e8; // m (IAU 2015 nominal)
export const L_SOL = 3.828e26; // W (IAU 2015 nominal)
export const T_SOL = 5772; // K (IAU 2015 nominal)
export const M_SOL = 1.98841e30; // kg (GM☉ nominal / G)

export const R_TERRA = 6.3781e6; // m (equatorial, IAU 2015 nominal)
export const M_TERRA = 5.9722e24; // kg (GM⊕ nominal / G)

export const R_JUPITER = 7.1492e7; // m (equatorial, IAU 2015 nominal)
export const M_JUPITER = 1.89813e27; // kg (GM♃ nominal / G)

/** Fluxos estelares limite da zona habitável (relativos ao que a Terra recebe), de Kopparapu et al. 2013, com as correções de 2014. */
export const FLUXO_LIMITE_INTERNO = 1.107; // estufa descontrolada
export const FLUXO_LIMITE_EXTERNO = 0.356; // estufa máxima
