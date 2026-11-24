// Tema de la app: auto (como el móvil), claro, oscuro o morado.
// Se guarda en este móvil (localStorage). Se carga sin módulos y antes del CSS
// para que no se vea un parpadeo de color al abrir.
(function () {
  var COLORES = { claro: '#f5f4ee', oscuro: '#101010', morado: '#2a0e47' };
  var medio = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  function elegido() { try { return localStorage.getItem('resacon-tema') || 'auto'; } catch (e) { return 'auto'; } }
  function aplicar() {
    var t = elegido();
    var efectivo = t === 'auto' ? (medio && medio.matches ? 'claro' : 'oscuro') : t;
    document.documentElement.setAttribute('data-te', efectivo);
    var meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', COLORES[efectivo]);
  }
  window.resaconTema = {
    actual: elegido,
    poner: function (t) { try { localStorage.setItem('resacon-tema', t); } catch (e) {} aplicar(); },
  };
  if (medio && medio.addEventListener) medio.addEventListener('change', aplicar);
  aplicar();
})();
