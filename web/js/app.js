// Arranque de la app y navegación (rutas con #/...)
import { sb, configurado } from './supa.js';
import { S, cargarPerfil, cargarConfig } from './estado.js';
import { $, $$, esc, fallo, cerrarHoja } from './util.js';
import { asegurarPush } from './push.js';

import * as publico from './vistas/publico.js';
import * as inicio from './vistas/inicio.js';
import * as eventos from './vistas/eventos.js';
import * as pagos from './vistas/pagos.js';
import * as musica from './vistas/musica.js';
import * as mas from './vistas/mas.js';
import * as admin from './vistas/admin.js';
import * as tutorial from './vistas/tutorial.js';

// ruta -> [función de la vista, pestaña de la barra, ¿pública?, ¿con flecha atrás?]
const RUTAS = [
  ['/entrar',             publico.entrar,      null,      true],
  ['/registro',           publico.registro,    null,      true],
  ['/instalar',           publico.instalar,    null,      true],
  ['/nueva-clave',        publico.nuevaClave,  null,      true],
  ['/tutorial',           tutorial.vista,      null,      false],
  ['/inicio',             inicio.vista,        'inicio',  false],
  ['/eventos',            eventos.lista,       'eventos', false],
  ['/evento/nuevo',       eventos.editar,      'eventos', false, true],
  ['/evento/:id/editar',  eventos.editar,      'eventos', false, true],
  ['/evento/:id',         eventos.detalle,     'eventos', false, true],
  ['/pagos',              pagos.vista,         'pagos',   false],
  ['/pagos/:tab',         pagos.vista,         'pagos',   false],
  ['/musica',             musica.vista,        'musica',  false],
  ['/mas',                mas.vista,           'mas',     false],
  ['/gastos',             mas.gastos,          'mas',     false, true],
  ['/miembros',           mas.miembrosVista,   'mas',     false, true],
  ['/perfil',             mas.perfil,          'mas',     false, true],
  ['/admin',              admin.vista,         'admin',   false],
  ['/admin/:sec',         admin.vista,         'admin',   false],
];

function emparejar(ruta) {
  for (const [patron, fn, tab, publica, atras] of RUTAS) {
    const a = patron.split('/'), b = ruta.split('/');
    if (a.length !== b.length) continue;
    const params = {};
    if (a.every((p, i) => p.startsWith(':') ? (params[p.slice(1)] = decodeURIComponent(b[i]), true) : p === b[i])) {
      return { fn, tab, publica, atras, params };
    }
  }
  return null;
}

function leerHash() {
  const h = location.hash.replace(/^#/, '') || '/inicio';
  const [ruta, qs] = h.split('?');
  return { ruta: ruta || '/inicio', query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

let pintando = 0;
export async function refrescar() {
  const turno = ++pintando;
  cerrarHoja();
  const { ruta, query } = leerHash();
  let r = emparejar(ruta);
  const main = $('#vista');

  if (!S.sesion && !(r && r.publica)) { location.replace('#/entrar'); return; }
  if (S.sesion && r && r.publica && ['/entrar', '/registro'].includes(ruta)) { location.replace('#/inicio'); return; }
  if (S.sesion && S.perfil && !S.perfil.tutorial_visto && ruta !== '/tutorial' && !r?.publica) { location.replace('#/tutorial'); return; }
  if (!r) { location.replace(S.sesion ? '#/inicio' : '#/entrar'); return; }

  const conBarra = !!S.sesion && !r.publica && ruta !== '/tutorial';
  $('#barra').hidden = !conBarra;
  $('#cabecera').hidden = !conBarra;
  main.classList.toggle('sin-barra', !conBarra);
  $('#btn-atras').hidden = !r.atras;
  $$('#barra a').forEach(a => a.classList.toggle('activa', a.dataset.tab === r.tab));
  $$('.solo-admin').forEach(el => el.hidden = !S.esAdmin);
  $('#titulo-seccion').textContent = '';

  main.innerHTML = '<div class="cargando"></div>';
  try {
    const titulo = await r.fn(main, r.params, query);
    if (turno !== pintando) return;
    if (titulo) $('#titulo-seccion').textContent = titulo;
  } catch (e) {
    if (turno !== pintando) return;
    console.error(e);
    main.innerHTML = `<div class="tarjeta"><h2>Algo ha fallado</h2><p class="sub">${esc(e.message || e)}</p>
      <button class="btn" onclick="location.reload()">Volver a cargar</button></div>`;
    fallo(e);
  }
  if (!location.hash.includes('#/admin') && !location.hash.includes('#/pagos/')) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', refrescar);

$('#btn-atras').onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/inicio'));

async function alCambiarSesion(sesion) {
  S.sesion = sesion;
  S.uid = sesion?.user?.id || null;
  if (S.uid) {
    await cargarPerfil();
    if (!S.perfil) {
      // Usuario sin perfil (no debería pasar: el alta exige invitación)
      await sb.auth.signOut();
      S.sesion = null; S.uid = null;
      alert('Tu cuenta no está dada de alta en la peña. Pide una invitación a Sergio.');
      return;
    }
    await cargarConfig();
    asegurarPush();
  } else {
    S.perfil = null; S.privado = null; S.config = {};
  }
}

async function arrancar() {
  if (!configurado) {
    $('#vista').innerHTML = `<div class="publica"><img class="logo-grande" src="img/logo.svg" alt="El Resacón">
      <div class="tarjeta"><h2>Falta configurar Supabase</h2>
      <p>Rellena <code>js/config.js</code> (o los secretos de GitHub) con la URL y la clave anon de tu proyecto de Supabase. Lo tienes explicado en el README.</p></div></div>`;
    return;
  }
  try {
    const { data } = await sb.auth.getSession();
    await alCambiarSesion(data.session);
  } catch (e) { fallo(e); }

  sb.auth.onAuthStateChange(async (evento, sesion) => {
    if (evento === 'PASSWORD_RECOVERY') { S.sesion = sesion; location.hash = '#/nueva-clave'; return; }
    if (evento === 'TOKEN_REFRESHED') { S.sesion = sesion; return; }
    if (evento === 'SIGNED_IN' && S.uid === sesion?.user?.id) return;
    if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') {
      try { await alCambiarSesion(sesion); } catch (e) { fallo(e); }
      refrescar();
    }
  });
  refrescar();
}

// Service worker (app instalable y que abre rápido)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e)));
}

arrancar();
