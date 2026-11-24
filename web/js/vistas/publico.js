// Pantallas sin sesión: entrar, registrarse con invitación, nueva contraseña e instalación
import { sb } from '../supa.js';
import { S } from '../estado.js';
import { $, esc, toast, textoError, conCarga, dispositivo, copiar, activarCopiar } from '../util.js';
import { ir } from '../nav.js';

const urlBase = () => location.origin + location.pathname;
const cabecera = (titulo, sub = '') => `<img class="logo-grande" src="img/logo.svg" alt="El Resacón"><h1>${esc(titulo)}</h1>${sub ? `<p class="sub" style="text-align:center">${sub}</p>` : ''}`;

// ---------- Entrar ----------
export async function entrar(main, _p, q) {
  main.innerHTML = `<div class="publica">${cabecera('Bienvenido a la peña')}
    <form id="f-entrar" class="tarjeta">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="email" required>
      <label for="clave">Contraseña</label>
      <input id="clave" name="clave" type="password" autocomplete="current-password" required minlength="6">
      <div id="msg"></div>
      <div class="botones"><button class="btn principal bloque" type="submit">Entrar</button></div>
      <p class="sub" style="text-align:center;margin-top:1rem">
        <button type="button" class="enlace" id="b-magico">Entrar sin contraseña (enlace al email)</button><br>
        <button type="button" class="enlace" id="b-olvido">He olvidado la contraseña</button>
      </p>
    </form>
    <div class="tarjeta" style="text-align:center">
      <p><strong>¿Eres nuevo?</strong> Necesitas un código de invitación de Sergio.</p>
      <div class="botones"><a class="btn" href="#/registro">Tengo un código</a><a class="btn fantasma" href="#/instalar">Cómo instalar la app</a></div>
    </div></div>`;
  const f = $('#f-entrar', main), msg = $('#msg', main);
  if (q.email) f.email.value = q.email;
  f.onsubmit = e => {
    e.preventDefault();
    conCarga($('button[type=submit]', f), async () => {
      msg.innerHTML = '';
      const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.clave.value });
      if (error) msg.innerHTML = `<div class="error-caja">${esc(textoError(error))}</div>`;
    });
  };
  $('#b-magico', main).onclick = e => conCarga(e.target, async () => {
    const email = f.email.value.trim();
    if (!email) { msg.innerHTML = '<div class="error-caja">Escribe tu email primero.</div>'; return; }
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: urlBase() } });
    msg.innerHTML = error ? `<div class="error-caja">${esc(textoError(error))}</div>`
      : '<div class="ok-caja">Te hemos enviado un enlace. Ábrelo desde este mismo móvil.</div>';
  });
  $('#b-olvido', main).onclick = e => conCarga(e.target, async () => {
    const email = f.email.value.trim();
    if (!email) { msg.innerHTML = '<div class="error-caja">Escribe tu email primero.</div>'; return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: urlBase() });
    msg.innerHTML = error ? `<div class="error-caja">${esc(textoError(error))}</div>`
      : '<div class="ok-caja">Si hay una cuenta con ese email, te llegará un correo para cambiar la contraseña.</div>';
  });
}

// ---------- Registro con invitación ----------
export async function registro(main, _p, q) {
  const codigo = (q.c || q.codigo || '').toUpperCase();
  main.innerHTML = `<div class="publica">${cabecera('Únete a El Resacón', 'Crea tu cuenta con el código que te ha pasado Sergio.')}
    <form id="f-reg" class="tarjeta">
      <label for="codigo">Código de invitación</label>
      <input id="codigo" name="codigo" type="text" required autocapitalize="characters" value="${esc(codigo)}" style="text-transform:uppercase;letter-spacing:.15em;font-weight:700">
      <label for="apodo">Tu nombre o apodo</label>
      <input id="apodo" name="apodo" type="text" required maxlength="30" autocomplete="nickname" placeholder="Así te verá la peña">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" required autocomplete="email">
      <label for="clave">Contraseña (mínimo 6 caracteres)</label>
      <input id="clave" name="clave" type="password" required minlength="6" autocomplete="new-password">
      <div id="msg"></div>
      <div class="botones"><button class="btn principal bloque" type="submit">Crear cuenta</button></div>
    </form>
    <p class="sub" style="text-align:center"><a href="#/instalar${codigo ? '?c=' + esc(codigo) : ''}">Cómo instalar la app en el móvil</a> · <a href="#/entrar">Ya tengo cuenta</a></p></div>`;
  const f = $('#f-reg', main), msg = $('#msg', main);
  f.onsubmit = e => {
    e.preventDefault();
    conCarga($('button[type=submit]', f), async () => {
      msg.innerHTML = '';
      const cod = f.codigo.value.trim().toUpperCase();
      const { data: valido, error: e1 } = await sb.rpc('comprobar_invitacion', { p_codigo: cod });
      if (e1) { msg.innerHTML = `<div class="error-caja">${esc(textoError(e1))}</div>`; return; }
      if (!valido) { msg.innerHTML = '<div class="error-caja">Ese código no vale o ha caducado. Pide otro a Sergio.</div>'; return; }
      const { data, error } = await sb.auth.signUp({
        email: f.email.value.trim(), password: f.clave.value,
        options: { data: { apodo: f.apodo.value.trim(), invitacion: cod }, emailRedirectTo: urlBase() },
      });
      if (error) { msg.innerHTML = `<div class="error-caja">${esc(textoError(error))}</div>`; return; }
      if (!data.session) {
        f.innerHTML = `<div class="ok-caja"><strong>¡Cuenta creada!</strong><br>Te hemos enviado un email a <b>${esc(f.email.value)}</b>.
          Ábrelo y pulsa el enlace para confirmarla (mira también en spam). Después entra con tu email y contraseña.</div>
          <a class="btn principal bloque" href="#/entrar">Ir a entrar</a>`;
      }
      // Si hay sesión directa, la app pasa sola al tutorial
    });
  };
}

// ---------- Nueva contraseña (desde el email de recuperación) ----------
export async function nuevaClave(main) {
  if (!S.sesion) { ir('#/entrar'); return; }
  main.innerHTML = `<div class="publica">${cabecera('Nueva contraseña')}
    <form id="f-clave" class="tarjeta"><label for="clave">Escribe tu nueva contraseña</label>
    <input id="clave" name="clave" type="password" minlength="6" required autocomplete="new-password">
    <div class="botones"><button class="btn principal bloque">Guardar</button></div></form></div>`;
  const f = $('#f-clave', main);
  f.onsubmit = e => {
    e.preventDefault();
    conCarga($('button', f), async () => {
      const { error } = await sb.auth.updateUser({ password: f.clave.value });
      if (error) { toast(textoError(error), 'error'); return; }
      toast('Contraseña cambiada');
      ir('#/inicio');
    });
  };
}

// ---------- Guía de instalación (pública) ----------
export async function instalar(main, _p, q) {
  const d = dispositivo();
  const codigo = (q.c || '').toUpperCase();
  const enlace = urlBase() + (codigo ? '#/registro?c=' + encodeURIComponent(codigo) : '#/instalar');
  const apk = S.config.apk_url || window.RESACON_CONFIG?.apkUrl || '';
  const tipo = q.ver || (d.ios ? 'iphone' : d.android ? 'android' : 'otro');

  const android = `
    <h2>📱 Android</h2>
    ${apk ? `<p><strong>Opción 1 (recomendada): la app de El Resacón</strong></p>
    <ol class="pasos">
      <li>Pulsa <a class="btn peq principal" href="${esc(apk)}">Descargar la app</a></li>
      <li>Abre el archivo descargado. Si el móvil avisa, pulsa <span class="dibujo">Ajustes</span> y activa <span class="dibujo">Permitir de esta fuente</span> («instalar apps desconocidas»). Es normal: la app no está en Google Play.</li>
      <li>Pulsa <span class="dibujo">Instalar</span> y ábrela desde el icono amarillo.</li>
    </ol>
    <p style="margin-top:1rem"><strong>Opción 2: desde Chrome</strong></p>` : ''}
    <ol class="pasos">
      <li>Abre este enlace en <strong>Chrome</strong>.</li>
      <li>Pulsa el menú <span class="dibujo">⋮</span> arriba a la derecha.</li>
      <li>Pulsa <span class="dibujo">Instalar app</span> o <span class="dibujo">Añadir a pantalla de inicio</span>.</li>
      <li>Abre la app desde el icono de El Resacón.</li>
    </ol>`;
  const iphone = `
    <h2>🍏 iPhone</h2>
    ${d.ios && !d.safari ? '<div class="error-caja">Estás en otro navegador. <strong>Abre este enlace en Safari</strong> (copia el enlace de abajo y pégalo en Safari).</div>' : ''}
    <ol class="pasos">
      <li>Abre el enlace en <strong>Safari</strong> (la brújula azul).</li>
      <li>Pulsa el botón <span class="dibujo">Compartir ⬆︎</span> (abajo en el centro; en iPad, arriba).</li>
      <li>Baja y pulsa <span class="dibujo">Añadir a pantalla de inicio ⊞</span> y luego <span class="dibujo">Añadir</span>.</li>
      <li>Abre la app <strong>desde el icono</strong> nuevo de El Resacón.</li>
    </ol>
    <div class="info-caja">⚠️ En iPhone, <strong>sin este paso no te llegan los avisos</strong> (necesitas iOS 16.4 o más nuevo).</div>`;
  const despues = `
    <h2>✅ Después</h2>
    <ol class="pasos">
      <li>Crea tu cuenta con el <strong>código de invitación</strong>${codigo ? ` (<b>${esc(codigo)}</b>)` : ''}.</li>
      <li>Pulsa <span class="dibujo">Activar avisos</span> cuando la app te lo pida.</li>
    </ol>`;

  main.innerHTML = `<div class="publica">${cabecera('Instala la app', 'Así la tienes en el móvil como una app más.')}
    ${d.enApp ? '<div class="ok-caja">✅ Ya estás usando la app instalada.</div>' : ''}
    <div class="pestanas" style="justify-content:center">
      <a href="#/instalar?ver=android${codigo ? '&c=' + esc(codigo) : ''}" class="${tipo === 'android' ? 'activa' : ''}">Android</a>
      <a href="#/instalar?ver=iphone${codigo ? '&c=' + esc(codigo) : ''}" class="${tipo === 'iphone' ? 'activa' : ''}">iPhone</a>
      <a href="#/instalar?ver=otro${codigo ? '&c=' + esc(codigo) : ''}" class="${tipo === 'otro' ? 'activa' : ''}">Ordenador</a>
    </div>
    <div class="tarjeta">${tipo === 'iphone' ? iphone : tipo === 'android' ? android
      : '<h2>💻 Ordenador</h2><p>Puedes usarla en el navegador sin instalar nada. En Chrome o Edge verás un icono de instalar en la barra de direcciones.</p>'}</div>
    <div class="tarjeta">${despues}</div>
    <div class="tarjeta"><h3>Pasa el enlace por WhatsApp</h3>
      <div class="copiable"><code>${esc(enlace)}</code></div>
      <div class="botones"><button class="btn principal" id="b-copiar">Copiar enlace</button>
      <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Instala la app de El Resacón: ' + enlace)}">WhatsApp</a></div></div>
    <p style="text-align:center"><a href="${S.sesion ? '#/mas' : (codigo ? '#/registro?c=' + esc(codigo) : '#/entrar')}">${S.sesion ? '← Volver' : 'Ir a crear cuenta / entrar'}</a></p></div>`;
  $('#b-copiar', main).onclick = () => copiar(enlace, 'Enlace copiado');
  activarCopiar(main);
}
