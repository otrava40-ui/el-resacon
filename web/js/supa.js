// Conexión con Supabase. La URL y la clave pública (anon) vienen de js/config.js,
// que se genera al publicar en GitHub (ver README). La clave "anon" es pública
// por diseño: lo que protege los datos son las reglas RLS del SQL.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.RESACON_CONFIG || {};
export const configurado = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);

export const sb = configurado
  ? createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
