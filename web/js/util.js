// Utilidades comunes: formato, HTML seguro, hojas, avisos, fotos…
import { sb } from './supa.js';

export const $  = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

// Escapa texto para meterlo en HTML
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Dinero (siempre en céntimos) ----------
const fmtEur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
export const eur = c => fmtEur.format((Number(c) || 0) / 100);
// "25,5" / "25.50" / "25" -> 2550 ; vacío o inválido -> null
export function aCentimos(txt) {
  if (txt === null || txt === undefined) return null;
  const s = String(txt).trim().replace(/\s|€/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
export const aEurosTexto = c => (c === null || c === undefined || c === '') ? '' : (Number(c) / 100).toFixed(2).replace('.', ',');

// ---------- Fechas (zona Europe/Madrid) ----------
const TZ = 'Europe/Madrid';
export function fecha(f, opciones = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!f) return '';
  const d = typeof f === 'string' && f.length === 10 ? new Date(f + 'T12:00:00') : new Date(f);
  return d.toLocaleDateString('es-ES', { timeZone: TZ, ...opciones });
}
export const fechaHora = f => f ? new Date(f).toLocaleString('es-ES', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
export function hoyISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export const vencido = fechaLimite => !!fechaLimite && fechaLimite < hoyISO();
export function rangoFechas(ini, fin) {
  if (!ini) return 'Sin fecha';
  if (!fin || fin === ini) return fecha(ini, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  return `${fecha(ini, { day: 'numeric', month: 'short' })} – ${fecha(fin, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

// ---------- Estados ----------
export const ESTADO_CARGO = {
  sin_pagar: { txt: 'Sin pagar', clase: 'gris' },
  pendiente: { txt: 'Pendiente de confirmar', clase: 'naranja' },
  pagado:    { txt: 'Pagado', clase: 'verde' },
  anulado:   { txt: 'Anulado', clase: 'borde' },
};
export const ESTADO_TICKET = {
  enviado:     { txt: 'Enviado', clase: 'gris' },
  aprobado:    { txt: 'Aprobado', clase: 'azul' },
  reembolsado: { txt: 'Reembolsado', clase: 'verde' },
  rechazado:   { txt: 'Rechazado', clase: 'rojo' },
};
export const METODOS = { revolut: 'Revolut', transferencia: 'Transferencia', bizum: 'Bizum', efectivo: 'Efectivo', compensacion: 'Descontado de un ticket', manual: 'Marcado a mano' };
export function chipCargo(c) {
  if (c.estado === 'sin_pagar' && vencido(c.fecha_limite)) return '<span class="chip rojo">Fuera de plazo</span>';
  const e = ESTADO_CARGO[c.estado] || ESTADO_CARGO.sin_pagar;
  return `<span class="chip ${e.clase}">${e.txt}</span>`;
}
export function chipTicket(t) {
  const e = ESTADO_TICKET[t.estado] || ESTADO_TICKET.enviado;
  return `<span class="chip ${e.clase}">${e.txt}</span>`;
}

// ---------- Avisos rápidos (toast) ----------
export function toast(msg, tipo = '') {
  const caja = $('#avisos-toast');
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.textContent = msg;
  caja.appendChild(t);
  setTimeout(() => t.remove(), tipo === 'error' ? 5000 : 2600);
}
// Traduce errores de Supabase a algo entendible
export function textoError(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e || 'Error');
  if (/Invalid login credentials/i.test(m)) return 'Email o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Todavía no has confirmado tu email. Mira tu correo (y la carpeta de spam).';
  if (/User already registered/i.test(m)) return 'Ya hay una cuenta con ese email. Entra con tu contraseña.';
  if (/Password should be at least/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera un minuto y vuelve a probar.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sin conexión. Comprueba tus datos o la WiFi.';
  if (/Database error saving new user/i.test(m)) return 'Código de invitación no válido o caducado.';
  if (/row-level security|permission denied/i.test(m)) return 'No tienes permiso para hacer eso.';
  return m;
}
export function fallo(e) { console.error(e); toast(textoError(e), 'error'); }

// ---------- Hoja inferior (modal) ----------
let alCerrarHoja = null;
export function abrirHoja(html, { alCerrar } = {}) {
  const capa = $('#capa-hoja');
  capa.innerHTML = `<div class="hoja" role="dialog" aria-modal="true"><button class="cerrar" aria-label="Cerrar">×</button><div class="tirador"></div><div class="contenido">${html}</div></div>`;
  capa.hidden = false;
  document.body.style.overflow = 'hidden';
  alCerrarHoja = alCerrar || null;
  $('.cerrar', capa).onclick = cerrarHoja;
  capa.onclick = e => { if (e.target === capa) cerrarHoja(); };
  return $('.contenido', capa);
}
export function cerrarHoja() {
  const capa = $('#capa-hoja');
  if (capa.hidden) return;
  capa.hidden = true; capa.innerHTML = '';
  document.body.style.overflow = '';
  const f = alCerrarHoja; alCerrarHoja = null;
  if (f) f();
}
export function confirmar(texto, { si = 'Sí', no = 'Cancelar', peligro = false } = {}) {
  return new Promise(res => {
    let respondido = false;
    const c = abrirHoja(`<p style="font-size:1.05rem;font-weight:600">${esc(texto)}</p>
      <div class="botones"><button class="btn fantasma" data-r="no">${esc(no)}</button><button class="btn ${peligro ? 'rojo' : 'principal'}" data-r="si">${esc(si)}</button></div>`,
      { alCerrar: () => { if (!respondido) res(false); } });
    $$('[data-r]', c).forEach(b => b.onclick = () => { respondido = true; res(b.dataset.r === 'si'); cerrarHoja(); });
  });
}
export function pedirTexto(titulo, { etiqueta = '', valor = '', boton = 'Aceptar', obligatorio = true } = {}) {
  return new Promise(res => {
    let respondido = false;
    const c = abrirHoja(`<h2>${esc(titulo)}</h2><form><label>${esc(etiqueta)}</label><textarea name="t" ${obligatorio ? 'required' : ''}>${esc(valor)}</textarea>
      <div class="botones"><button type="submit" class="btn principal">${esc(boton)}</button></div></form>`,
      { alCerrar: () => { if (!respondido) res(null); } });
    const f = $('form', c);
    $('textarea', c).focus();
    f.onsubmit = e => { e.preventDefault(); respondido = true; res(f.t.value.trim()); cerrarHoja(); };
  });
}

// ---------- Copiar al portapapeles ----------
export async function copiar(texto, msg = 'Copiado') {
  try { await navigator.clipboard.writeText(texto); }
  catch {
    const ta = document.createElement('textarea'); ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  toast(msg);
}
export const copiable = (texto, etiqueta = 'Copiar') =>
  `<div class="copiable"><code>${esc(texto)}</code><button type="button" class="btn peq" data-copiar="${esc(texto)}">${esc(etiqueta)}</button></div>`;
// Activa todos los botones data-copiar dentro de un contenedor
export function activarCopiar(raiz) {
  $$('[data-copiar]', raiz).forEach(b => b.onclick = () => copiar(b.dataset.copiar));
}

// ---------- Fotos ----------
// Reduce la foto antes de subirla (máx. 1600 px, JPEG ~75 %)
export async function comprimirImagen(archivo, max = 1600, calidad = 0.75) {
  if (!archivo || !archivo.type.startsWith('image/') || archivo.type === 'image/gif') return archivo;
  try {
    const bmp = await cargarBitmap(archivo);
    const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * escala), h = Math.round(bmp.height * escala);
    const lienzo = document.createElement('canvas');
    lienzo.width = w; lienzo.height = h;
    lienzo.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(r => lienzo.toBlob(r, 'image/jpeg', calidad));
    if (!blob || blob.size >= archivo.size) return archivo;
    return new File([blob], (archivo.name || 'foto').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch (e) {
    console.warn('No se pudo comprimir (se sube tal cual):', e);
    return archivo;
  }
}
function cargarBitmap(archivo) {
  if ('createImageBitmap' in window) return createImageBitmap(archivo, { imageOrientation: 'from-image' }).catch(() => cargarImg(archivo));
  return cargarImg(archivo);
}
function cargarImg(archivo) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(archivo);
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = rej; img.src = url;
  });
}
// Sube a un almacén. Devuelve la ruta guardada (p. ej. "<uid>/1700000000.jpg")
export async function subirFoto(bucket, carpeta, archivo, nombre) {
  const f = await comprimirImagen(archivo);
  const ext = (f.type === 'image/jpeg') ? 'jpg' : (f.name.split('.').pop() || 'jpg').toLowerCase();
  const ruta = `${carpeta}/${nombre || Date.now() + '-' + Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await sb.storage.from(bucket).upload(ruta, f, { contentType: f.type, upsert: false });
  if (error) throw error;
  return ruta;
}
// URLs firmadas (las fotos son privadas). Se guardan 50 min en memoria.
const cacheUrls = new Map();
export async function urlFoto(bucket, ruta) {
  if (!ruta) return '';
  const k = bucket + ':' + ruta, c = cacheUrls.get(k);
  if (c && c.hasta > Date.now()) return c.url;
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(ruta, 3600);
  if (error) { console.warn(error); return ''; }
  cacheUrls.set(k, { url: data.signedUrl, hasta: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}
// <img data-bucket="tickets" data-ruta="..."> -> rellena el src
export function cargarFotos(raiz = document) {
  $$('img[data-bucket][data-ruta]', raiz).forEach(async img => {
    const url = await urlFoto(img.dataset.bucket, img.dataset.ruta);
    if (url) img.src = url; else img.alt = 'Foto no disponible';
    if (img.dataset.ampliar !== undefined) img.onclick = e => { e.stopPropagation(); verFoto(url); };
  });
}
export const imgFoto = (bucket, ruta, clase = 'miniatura', ampliar = true) =>
  ruta ? `<img class="${clase}" data-bucket="${bucket}" data-ruta="${esc(ruta)}" ${ampliar ? 'data-ampliar' : ''} alt="Foto" loading="lazy">` : '';
export function verFoto(url) {
  if (!url) return;
  const v = document.createElement('div');
  v.className = 'visor';
  v.innerHTML = `<img src="${esc(url)}" alt="Foto ampliada">`;
  v.onclick = () => v.remove();
  document.body.appendChild(v);
}

// ---------- Avatar ----------
export function avatar(perfil, grande = false) {
  const cls = 'avatar' + (grande ? ' grande' : '');
  if (perfil?.foto_url) return `<img class="${cls}" data-bucket="fotos" data-ruta="${esc(perfil.foto_url)}" alt="">`;
  return `<span class="${cls}">${esc((perfil?.apodo || '?').trim().charAt(0).toUpperCase())}</span>`;
}

// ---------- Pistas: burbuja que sale la primera vez y no vuelve ----------
export function pista(clave, texto) {
  try { if (localStorage.getItem('pista:' + clave)) return ''; } catch { return ''; }
  return `<div class="pista" data-pista="${esc(clave)}">${esc(texto)}<button aria-label="Cerrar pista">×</button></div>`;
}
export function activarPistas(raiz) {
  $$('[data-pista]', raiz).forEach(p => {
    $('button', p).onclick = () => { try { localStorage.setItem('pista:' + p.dataset.pista, '1'); } catch {} p.remove(); };
  });
}

// ---------- Dispositivo ----------
export function dispositivo() {
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const enApp = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true || /ElResaconApp/.test(ua);
  const safari = ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|GSA/.test(ua);
  return { ios, android, enApp, safari, escritorio: !ios && !android };
}

// ---------- CSV ----------
export function descargarCSV(nombre, filas) {
  const csv = filas.map(f => f.map(v => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Bloquea un botón mientras se hace algo
export async function conCarga(boton, fn) {
  const txt = boton?.innerHTML;
  if (boton) { boton.disabled = true; boton.innerHTML = 'Un momento…'; }
  try { return await fn(); }
  finally { if (boton && boton.isConnected) { boton.disabled = false; boton.innerHTML = txt; } }
}
