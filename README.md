# El Resacón · App de la peña (fase 1)

App web instalable (PWA) para la peña: lo que debe cada uno, eventos con lista de la compra y reparto, pagos al bote de Revolut, encargados, tickets y reembolsos, tutorial y guía de instalación. Funciona en Android, iPhone y ordenador.

Todo es gratis: **GitHub Pages** (la web) + **Supabase** (base de datos, cuentas y fotos).

```
el-resacon/
├── supabase/
│   ├── 01_esquema.sql      ← tablas, seguridad, funciones (pegar en Supabase)
│   ├── 02_almacen.sql      ← carpetas de fotos y sus permisos (pegar después)
│   └── pruebas/            ← pruebas del SQL (no hace falta tocarlas)
├── web/                    ← la app (lo que se publica)
└── .github/workflows/publicar.yml   ← publica la app sola al subir cambios
```

---

## Pasos para ponerla en marcha (unos 30 minutos)

### 1. Crear el proyecto en Supabase

1. Entra en <https://supabase.com> e inicia sesión (con tu cuenta de GitHub vale).
2. **New project**. Nombre: `el-resacon`. Pon una contraseña de base de datos (guárdala). Región: la más cercana (Europa).
3. Espera 1–2 minutos a que termine de crearse.

### 2. Cargar la base de datos

1. Menú izquierdo → **SQL Editor** → **New query**.
2. Abre `supabase/01_esquema.sql`, copia **todo**, pégalo y pulsa **Run**. Tiene que salir *Success*.
3. Otra **New query** con todo `supabase/02_almacen.sql` → **Run**.

> Se pueden volver a ejecutar sin romper nada (por ejemplo, si te paso una versión nueva).

### 3. Ajustar las cuentas (Authentication)

1. **Authentication → Sign In / Providers → Email**:
   - Deja **activado** *Enable Email provider* y *Allow new users to sign up*. No te preocupes: **sin código de invitación la base de datos no deja crear la cuenta**.
   - **Desactiva *Confirm email*** y guarda. Así la gente entra nada más crear la cuenta. Es necesario porque el servicio de email gratis de Supabase solo envía correos a los miembros de tu equipo de Supabase, no a los de la peña.
2. **Authentication → URL Configuration**: lo rellenarás en el paso 6, cuando tengas la dirección de la app.

**Opcional pero recomendable — que funcione «He olvidado la contraseña».** Sin esto, quien olvide la contraseña no puede recuperarla sola. Con tu Gmail es gratis:
1. En tu cuenta de Google activa la verificación en dos pasos y crea una **contraseña de aplicación** (busca «contraseñas de aplicación» en <https://myaccount.google.com>).
2. Supabase → **Authentication → Emails → SMTP Settings** → activa *Custom SMTP*:
   Host `smtp.gmail.com`, puerto `587`, usuario: tu Gmail, contraseña: la de aplicación, remitente: tu Gmail, nombre: `El Resacón`.
3. Con esto también funciona «Entrar sin contraseña (enlace al email)».

### 4. Subir el código a GitHub

1. En <https://github.com> → **New repository** → nombre `el-resacon` → **Público** (GitHub Pages gratis necesita repositorio público; los datos no están en el código, están protegidos en Supabase).
2. **Add file → Upload files** y arrastra **todo el contenido** de esta carpeta (incluida la carpeta oculta `.github`; si no se ve, en Windows: Vista → Elementos ocultos). Pulsa **Commit changes**.
3. Copia los datos de Supabase: **Project Settings → API** (o *API Keys*):
   - **Project URL** (tipo `https://abcd1234.supabase.co`)
   - la clave pública: **anon public** (o *Publishable key*, empieza por `sb_publishable_`). **Nunca** la *service_role* ni la *secret*.
4. En GitHub, tu repositorio → **Settings → Secrets and variables → Actions → New repository secret**, crea dos:
   - `SUPABASE_URL` = la Project URL
   - `SUPABASE_ANON_KEY` = la clave pública

### 5. Publicar con GitHub Pages

1. Repositorio → **Settings → Pages** → *Source*: **GitHub Actions**.
2. Pestaña **Actions** → «Publicar la app» → **Run workflow** (o sube cualquier cambio). Espera ~1 minuto a que salga el ✅ verde.
3. La dirección de tu app es: `https://TU-USUARIO.github.io/el-resacon/`

### 6. Decirle a Supabase cuál es la dirección

Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://TU-USUARIO.github.io/el-resacon/`
- **Redirect URLs** → *Add URL*: la misma dirección.

### 7. Crear TU cuenta (la primera es el administrador)

1. Abre la app en el móvil → **Tengo un código** → en el código pon cualquier cosa (por ejemplo `PRIMERO`), tu apodo, email y contraseña. **La primera cuenta que se crea entra sin código y queda como administrador.** Hazlo nada más publicar, antes de pasar el enlace a nadie.
2. Verás el tutorial y después la pestaña **Admin**.

> Si por lo que sea otra persona se registrara antes que tú, en Supabase → SQL Editor ejecuta:
> `update profiles set rol = 'admin' where apodo = 'TuApodo';` y `update profiles set rol = 'member' where apodo = 'SuApodo';`

### 8. Configurar el bote e invitar

1. **Admin → Ajustes**: enlace de Revolut, IBAN, titular, tu número de Bizum y el saldo. Guardar.
   - Si tu enlace de Revolut admite el importe en la dirección, pon `{importe}` donde va y la app lo rellena. Si no, pon el enlace normal (`https://revolut.me/tuusuario`) y cada uno escribe el importe.
2. **Admin → Miembros → Crear invitación**: pon, por ejemplo, 20 usos y 14 días. Pulsa **Enviar por WhatsApp** y pásalo al grupo. El mensaje lleva el enlace de instalación y el código.

¡Listo! Para el día a día tienes **Admin → Guía**.

---

## Cómo funciona por dentro (resumen)

- **Altas solo por invitación**: al crear una cuenta, la base de datos comprueba el código. Si no vale, la cuenta no se crea.
- **Pagos**: el miembro pulsa «Ya he pagado» → *Pendiente de confirmar* (naranja). Solo tú puedes pasarlo a *Pagado* (verde). Esto lo garantiza la base de datos: aunque alguien llame a la API a mano, no puede marcarse como pagado.
- **Privacidad**: cada miembro solo ve **sus** cargos (no ve lo que deben ni pagan los demás). El saldo del bote y los ingresos solo los ves tú. Los **gastos** del bote (con su ticket) los ven todos, por transparencia.
- **Datos del bote** (IBAN, Revolut, Bizum): están en la tabla `config` de Supabase, no en el código. Solo los ve quien tiene sesión.
- **Lista de la compra**: solo el nombre es obligatorio. Puedes apuntar «Coger y poner bebidas» sin precio, ponerle un encargado (le sale en *Mis encargos* con «Ya lo he comprado») y más tarde poner el coste y quién lo pagó. Lo que no tiene precio no cuenta en el total hasta que lo pongas.
- **Invitados**: en un evento, cualquiera pulsa «＋ Vengo con alguien» y apunta a su invitado (nombre y quién es). Si paga, cuenta como una plaza más en el reparto y a quien lo trae le sale un segundo cargo «invitado: Nombre». El admin decide si paga o no. El apartado de invitados solo aparece si alguien viene acompañado.
- **Apariencia**: en Más → Apariencia, cada uno elige Automático (como su móvil), Claro, Oscuro o Morado. Se guarda en su móvil.
- **Reparto**: en el evento pulsa «Guardar reparto y crear cargos». A partes iguales se redondea hacia abajo al céntimo (lo que sobra lo pone el bote). Puedes repetirlo si cambia la compra o los participantes: lo ya pagado o pendiente de confirmar no se toca.
- **Tickets**: Enviado → Aprobado (se suma a la compra del evento) → Reembolsado (se apunta como gasto del bote). O «Descontar de su deuda» si el ticket cubre un cargo suyo entero.
- **Avisos**: la app ya prepara todos los avisos en la tabla `avisos` y tiene en Ajustes cuándo mandar los recordatorios. **El envío al móvil (notificaciones push) llega en la fase 2.**

## Fases

- ✅ **Fase 1** (esta): cuentas por invitación, eventos, compra, reparto, cargos sueltos, pagos, panel de admin, encargados, tickets y reembolsos, tutorial, guía de instalación, app instalable.
- ⏭️ **Fase 2**: notificaciones push (Android e iPhone), recordatorios automáticos con los días/horas de Ajustes, «Enviar aviso» manual.
- ⏭️ **Fase 3**: música integrada (app Android de El Resacón con la pestaña Música y el jukebox dentro, tu apodo en la cola, «Ahora suena»).

## Comprobar la fase 1 (lista de pruebas)

- [ ] Crea «Fiestas San Lorenzo» con 5 compras y reparto igual entre 10 → a cada uno le aparece su parte.
- [ ] Un miembro pulsa «Ya he pagado» → sale *Pendiente de confirmar*.
- [ ] Tú confirmas → sale *Pagado* en verde. Rechazar → vuelve a *Sin pagar* con el motivo.
- [ ] Un miembro no ve lo que deben los demás.
- [ ] Crea la tarea «Coger y poner bebidas» con un encargado → le sale en *Mis encargos*; sube un ticket desde la tarea → lo ves en Admin → Tickets con la tarea y el evento.
- [ ] Un ticket suelto aprobado se suma a la compra del evento; «Marcar reembolsado» lo apunta en Gastos del bote.
- [ ] Alguien nuevo ve el tutorial al entrar y la guía de instalación muestra los pasos de su móvil.
- [ ] Se instala en Android (Chrome → Instalar app) y en iPhone (Safari → Compartir → Añadir a pantalla de inicio).

## Problemas frecuentes

| Qué pasa | Solución |
|---|---|
| Sale «Falta configurar Supabase» | Faltan los secretos del paso 4, o la publicación falló: mira la pestaña Actions. |
| «Código de invitación no válido» | El código caducó o se gastaron sus usos: crea otro en Admin → Miembros. |
| Alguien no puede entrar tras registrarse | Comprueba que *Confirm email* está **desactivado** (paso 3). |
| «He olvidado la contraseña» no manda nada | Configura el SMTP de Gmail (paso 3, opcional). |
| En el móvil sale una versión vieja | Cierra la app del todo y ábrela otra vez (se actualiza sola en cada publicación). |
| Quiero cambiar algo del SQL | Pega otra vez el archivo nuevo en el SQL Editor y Run. |

## Actualizar a una versión nueva

1. Supabase → SQL Editor → pega el `supabase/01_esquema.sql` nuevo → **Run** (actualiza sin borrar datos).
2. GitHub → **Add file → Upload files** → arrastra las carpetas `web` y `supabase` (sustituyen a las viejas) → **Commit changes**. Se publica sola en ~1 minuto.
3. En el móvil, cierra la app del todo y ábrela. Si sigue la versión vieja, espera 10 minutos.

## Para desarrolladores

- Sin compilación: HTML + CSS + JavaScript (módulos ES). `web/js/supa.js` carga `@supabase/supabase-js@2` desde jsDelivr.
- Probar en local: crea `web/js/config.js` a partir de `config.ejemplo.js` y sirve la carpeta `web` (por ejemplo `python3 -m http.server` dentro de `web/`).
- Las pruebas del SQL (`supabase/pruebas/`) se ejecutan en un PostgreSQL local con `stub_supabase.sql` (imita `auth` y `storage`) + los dos SQL + `test.sql`. Deben acabar en `TODAS LAS PRUEBAS OK`.
- Importes en céntimos (`integer`), fechas en `timestamptz`, interfaz en Europe/Madrid.
