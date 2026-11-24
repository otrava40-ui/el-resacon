// Navegación: volver a pintar la pantalla actual o ir a otra
export const refrescar = () => window.dispatchEvent(new Event('hashchange'));
export function ir(hash) {
  if (location.hash === hash) refrescar(); else location.hash = hash;
}
