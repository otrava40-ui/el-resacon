// Avisos al móvil (Web Push). El móvil se apunta al pulsar «Activar avisos»
// y se vuelve a apuntar solo cada vez que se abre la app con el permiso dado.
import { sb } from './supa.js';
import { S, cfg } from './estado.js';
import { dispositivo } from './util.js';

export const pushDisponible = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && location.protocol === 'https:';

// Clave pública VAPID (base64url) -> bytes
function bytes(b64) {
  const relleno = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function nombreDispositivo() {
  const d = dispositivo(), ua = navigator.userAgent;
  const modelo = (ua.match(/Android [\d.]+; ([^;)]+)/) || [])[1];
  return (d.ios ? 'iPhone' : d.android ? 'Android' + (modelo ? ' · ' + modelo.trim() : '') : 'Ordenador') + (d.enApp ? ' (app)' : '');
}

// Apunta este móvil para recibir avisos de la cuenta actual
export async function suscribir() {
  if (!pushDisponible()) throw new Error('Este navegador no admite avisos. En iPhone, abre la app desde el icono de la pantalla de inicio.');
  const clave = cfg('vapid_publica');
  if (!clave) throw new Error('Los avisos aún no están configurados (falta la clave en Ajustes del servidor).');
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, rej) => setTimeout(() => rej(new Error('La app no está lista para avisos. Ciérrala y vuelve a abrirla.')), 8000)),
  ]);
  let sub = await reg.pushManager.getSubscription();
  // Si la clave del servidor cambió, se rehace la suscripción
  if (sub && sub.options?.applicationServerKey) {
    const actual = new Uint8Array(sub.options.applicationServerKey);
    const nueva = bytes(clave);
    if (actual.length !== nueva.length || actual.some((v, i) => v !== nueva[i])) { await sub.unsubscribe(); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(clave) });
  const j = sub.toJSON();
  const { error } = await sb.rpc('registrar_push', { p_endpoint: j.endpoint, p_datos: j.keys, p_dispositivo: nombreDispositivo() });
  if (error) throw error;
  return true;
}

// Al abrir la app: si ya dio permiso, se asegura de que el móvil siga apuntado
let asegurado = false;
export async function asegurarPush() {
  if (asegurado || !S.uid || !pushDisponible() || Notification.permission !== 'granted' || !cfg('vapid_publica')) return;
  asegurado = true;
  try { await suscribir(); } catch (e) { console.warn('Avisos:', e); asegurado = false; }
}

// Cerrar sesión: este móvil deja de recibir los avisos de esta cuenta
export async function cerrarSesion() {
  try {
    if (pushDisponible()) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await sb.rpc('borrar_mi_push', { p_endpoint: sub.endpoint });
    }
  } catch (e) { console.warn(e); }
  asegurado = false;
  await sb.auth.signOut();
}
