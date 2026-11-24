// El Resacón · función «enviar-avisos» (Supabase Edge Function)
// Manda como notificación push los avisos pendientes de la tabla «avisos».
// La llama la base de datos (pg_net) cada vez que se crea un aviso.
//
// Secretos que hay que poner en Supabase → Edge Functions → Secrets:
//   AVISOS_SECRETO   contraseña que también está en la tabla ajustes_privados
//   VAPID_PRIVADA    clave privada de los avisos (JSON que empieza por {"kty":"EC"…)
//   AVISOS_CONTACTO  mailto:tu-email (lo piden Google/Apple por si hay problemas)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo.
//
// En la configuración de la función, «Verify JWT» tiene que estar DESACTIVADO
// (la protege AVISOS_SECRETO).

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildPushHTTPRequest } from "npm:@pushforge/builder@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const SECRETO = Deno.env.get("AVISOS_SECRETO") ?? "";
const CONTACTO = Deno.env.get("AVISOS_CONTACTO") || "mailto:admin@example.com";

let clavePrivada: Record<string, string> | null = null;
function clave() {
  if (!clavePrivada) clavePrivada = JSON.parse(Deno.env.get("VAPID_PRIVADA") ?? "null");
  if (!clavePrivada?.d) throw new Error("Falta el secreto VAPID_PRIVADA o no es válido");
  return clavePrivada;
}

type Fila = {
  aviso_id: number; user_id: string; tipo: string; titulo: string;
  cuerpo: string | null; url: string | null; endpoint: string; datos: { p256dh: string; auth: string };
};

Deno.serve(async (req) => {
  if (!SECRETO || req.headers.get("x-secreto") !== SECRETO) {
    return new Response("No autorizado", { status: 401 });
  }

  const { data, error } = await sb.rpc("tomar_avisos_pendientes", { p_max: 300 });
  if (error) {
    console.error("tomar_avisos_pendientes:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const filas = (data ?? []) as Fila[];
  let enviados = 0, fallidos = 0, borrados = 0;

  // De 10 en 10 para no tardar si hay muchos
  for (let i = 0; i < filas.length; i += 10) {
    await Promise.all(filas.slice(i, i + 10).map(async (f) => {
      try {
        const { endpoint, headers, body } = await buildPushHTTPRequest({
          privateJWK: clave(),
          subscription: { endpoint: f.endpoint, keys: { p256dh: f.datos.p256dh, auth: f.datos.auth } },
          message: {
            payload: { titulo: f.titulo, cuerpo: f.cuerpo ?? "", url: f.url ?? "#/inicio", id: f.aviso_id, tipo: f.tipo },
            adminContact: CONTACTO,
            options: { ttl: 60 * 60 * 12, urgency: "normal" },  // máximo permitido: menos de 24 h
          },
        });
        const r = await fetch(endpoint, { method: "POST", headers, body });
        if (r.status === 404 || r.status === 410) {
          // Ese móvil ya no existe o quitó el permiso: se borra
          await sb.rpc("borrar_suscripcion", { p_endpoint: f.endpoint });
          borrados++;
        } else if (r.ok) {
          enviados++;
        } else {
          fallidos++;
          console.error("Push", r.status, await r.text());
        }
      } catch (e) {
        fallidos++;
        console.error("Error enviando aviso", f.aviso_id, e);
      }
    }));
  }

  console.log(`Avisos: ${filas.length} envíos, ${enviados} ok, ${fallidos} fallidos, ${borrados} móviles borrados`);
  return Response.json({ envios: filas.length, enviados, fallidos, borrados });
});
