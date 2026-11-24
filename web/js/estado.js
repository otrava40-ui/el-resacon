// Estado compartido de la sesión: usuario, perfil y ajustes del bote
import { sb } from './supa.js';

export const S = {
  sesion: null,
  uid: null,
  perfil: null,      // { id, apodo, foto_url, rol, activo, tutorial_visto }
  privado: null,     // { telefono, metodo_cobro, dato_cobro }
  config: {},        // clave -> valor (los de 'admin' solo llegan si eres admin)
  get esAdmin() { return this.perfil?.rol === 'admin' && this.perfil?.activo; },
};

export const cfg = (clave, def = '') => (S.config[clave] ?? def);
export const cfgSi = clave => String(S.config[clave] ?? '').toLowerCase() === 'true';

export async function cargarPerfil() {
  if (!S.uid) { S.perfil = null; S.privado = null; return; }
  const [p, pr] = await Promise.all([
    sb.from('profiles').select('*').eq('id', S.uid).maybeSingle(),
    sb.from('perfil_privado').select('*').eq('user_id', S.uid).maybeSingle(),
  ]);
  if (p.error) throw p.error;
  S.perfil = p.data;
  S.privado = pr.data || { user_id: S.uid };
}

export async function cargarConfig() {
  const { data, error } = await sb.from('config').select('clave, valor');
  if (error) throw error;
  S.config = Object.fromEntries((data || []).map(r => [r.clave, r.valor]));
}

// Miembros (apodo y foto), con caché corta
let cacheMiembros = null, cacheHasta = 0;
export async function miembros(forzar = false) {
  if (!forzar && cacheMiembros && cacheHasta > Date.now()) return cacheMiembros;
  const { data, error } = await sb.from('profiles').select('id, apodo, foto_url, rol, activo, creado_en').order('apodo');
  if (error) throw error;
  cacheMiembros = data || []; cacheHasta = Date.now() + 60_000;
  return cacheMiembros;
}
export function olvidarMiembros() { cacheMiembros = null; }
