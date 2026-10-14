/**
 * Chama `carregar` uma única vez, quando `el` chega perto da tela.
 * Sem IntersectionObserver (ou em navegador antigo) carrega logo.
 */
export function quandoVisivel(el: Element, carregar: () => void, margem = "320px"): () => void {
  if (typeof IntersectionObserver === "undefined") {
    carregar();
    return () => {};
  }
  const observador = new IntersectionObserver(
    (entradas) => {
      if (entradas.some((e) => e.isIntersecting)) {
        observador.disconnect();
        carregar();
      }
    },
    { rootMargin: margem },
  );
  observador.observe(el);
  return () => observador.disconnect();
}
