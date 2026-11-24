// Más: gastos del bote, miembros, perfil y ajustes, tutorial, instalar
import { sb } from '../supa.js';
import { S, cargarPerfil, miembros, olvidarMiembros } from '../estado.js';
import { $, $$, esc, eur, fecha, avatar, imgFoto, cargarFotos, toast, fallo, conCarga, subirFoto, confirmar, dispositivo } from '../util.js';
import { activarAvisos } from './inicio.js';
import { refrescar, ir } from '../nav.js';

export async function vista(main) {
  const d = dispositivo();
  main.innerHTML = `
    <div class="tarjeta fila">${avatar(S.perfil, true)}<div class="crece"><h2 style="margin:0">${esc(S.perfil.apodo)}</h2>
      <div class="sub">${S.esAdmin ? 'Administrador' : 'Miembro de la peña'}</div></div></div>
    <div class="tarjeta"><ul class="lista pulsable">
      <li data-ir="#/gastos"><span style="font-size:1.4rem">🧾</span><div class="crece"><div class="titulo">Gastos del bote</div><div class="sub peq">En qué se ha gastado el dinero, con sus tickets</div></div>›</li>
      <li data-ir="#/miembros"><span style="font-size:1.4rem">👥</span><div class="crece"><div class="titulo">Miembros</div></div>›</li>
      <li data-ir="#/perfil"><span style="font-size:1.4rem">👤</span><div class="crece"><div class="titulo">Perfil y ajustes</div><div class="sub peq">Nombre, foto, avisos, datos para que te devuelvan dinero</div></div>›</li>
      <li data-ir="#/tutorial"><span style="font-size:1.4rem">🎓</span><div class="crece"><div class="titulo">Ver tutorial</div></div>›</li>
      <li data-ir="#/instalar"><span style="font-size:1.4rem">📲</span><div class="crece"><div class="titulo">Cómo instalar la app</div>${d.enApp ? '<div class="sub peq">Ya la tienes instalada ✅</div>' : ''}</div>›</li>
      ${S.esAdmin ? '<li data-ir="#/admin"><span style="font-size:1.4rem">⚙️</span><div class="crece"><div class="titulo">Panel de administrador</div></div>›</li>' : ''}
    </ul></div>
    <button class="btn rojo bloque" id="b-salir">Cerrar sesión</button>
    <p class="sub peq" style="text-align:center;margin-top:1.5rem">El Resacón · fase 1</p>`;
  $$('[data-ir]', main).forEach(li => li.onclick = () => ir(li.dataset.ir));
  $('#b-salir', main).onclick = async () => { if (await confirmar('¿Cerrar sesión en este móvil?', { si: 'Cerrar sesión' })) await sb.auth.signOut(); };
  cargarFotos(main);
  return 'Más';
}

export async function gastos(main) {
  const { data, error } = await sb.from('pot_movements').select('*, events(nombre)').eq('tipo', 'gasto').order('fecha', { ascending: false }).order('id', { ascending: false });
  if (error) throw error;
  const g = data || [];
  const total = g.reduce((s, m) => s + m.importe_cents, 0);
  main.innerHTML = `<h1>🧾 Gastos del bote</h1>
    <p class="sub">Todo lo que se ha pagado con el dinero de la peña.</p>
    <div class="tarjeta"><div class="sub peq">Total gastado</div><div class="total-grande">${eur(total)}</div></div>
    ${g.length ? `<div class="tarjeta"><ul class="lista">${g.map(m => `<li>${imgFoto('tickets', m.ticket_url) || '<span class="miniatura" style="display:grid;place-items:center">🧾</span>'}
      <div class="crece"><div class="titulo">${esc(m.concepto)}</div><div class="sub peq">${fecha(m.fecha)}${m.events ? ' · <a href="#/evento/' + m.event_id + '">' + esc(m.events.nombre) + '</a>' : ''}</div></div>
      <div class="importe">${eur(m.importe_cents)}</div></li>`).join('')}</ul></div>` : '<div class="vacio"><span class="grande">🪙</span>Todavía no hay gastos.</div>'}`;
  cargarFotos(main);
  return 'Gastos';
}

export async function miembrosVista(main) {
  const gente = await miembros(true);
  const activos = gente.filter(m => m.activo), inactivos = gente.filter(m => !m.activo);
  const fila = m => `<li>${avatar(m)}<div class="crece"><div class="titulo">${esc(m.apodo)}</div>${m.rol === 'admin' ? '<span class="chip amarillo">Admin</span>' : ''}</div></li>`;
  main.innerHTML = `<h1>👥 Miembros (${activos.length})</h1>
    <div class="tarjeta"><ul class="lista">${activos.map(fila).join('')}</ul></div>
    ${inactivos.length ? `<p class="seccion-titulo">Inactivos</p><div class="tarjeta"><ul class="lista">${inactivos.map(fila).join('')}</ul></div>` : ''}`;
  cargarFotos(main);
  return 'Miembros';
}

// Tipos de aviso que cada uno puede apagar (los de pagos confirmados/rechazados no)
export const TIPOS_AVISO = [
  ['nuevo_cargo', 'Nuevos cargos', 'Cuando te toca pagar algo'],
  ['recordatorio_pago', 'Recordatorios de pago', 'Si tienes algo sin pagar'],
  ['evento_proximo', 'Eventos próximos', 'El día antes de un evento'],
  ['nuevo_encargo', 'Encargos', 'Cuando te nombran encargado y el día antes'],
  ['ticket_estado', 'Mis tickets', 'Cuando revisan o te devuelven un ticket'],
  ['aviso_manual', 'Avisos de la peña', 'Mensajes que manda el administrador'],
];

export async function perfil(main) {
  const { data: prefs } = await sb.from('notification_prefs').select('*').eq('user_id', S.uid);
  const apagado = Object.fromEntries((prefs || []).map(p => [p.tipo, !p.activo]));
  const pr = S.privado || {};
  const permiso = 'Notification' in window ? Notification.permission : 'no';
  main.innerHTML = `<h1>👤 Perfil y ajustes</h1>
    <form id="f-perfil" class="tarjeta">
      <div class="fila">${avatar(S.perfil, true)}<div class="crece"><label for="foto" style="margin-top:0">Foto (opcional)</label><input id="foto" name="foto" type="file" accept="image/*"></div></div>
      <label for="apodo">Nombre o apodo</label><input id="apodo" name="apodo" required maxlength="30" value="${esc(S.perfil.apodo)}">
      <label for="telefono">Teléfono (opcional, solo lo ve el administrador)</label><input id="telefono" name="telefono" type="tel" value="${esc(pr.telefono || '')}">
      <p class="seccion-titulo">Para que te devuelvan dinero</p>
      <label for="metodo_cobro">Cómo prefieres cobrar</label>
      <select id="metodo_cobro" name="metodo_cobro"><option value="">—</option>
        ${['bizum', 'revolut', 'transferencia'].map(m => `<option value="${m}" ${pr.metodo_cobro === m ? 'selected' : ''}>${m[0].toUpperCase() + m.slice(1)}</option>`).join('')}</select>
      <label for="dato_cobro">Tu número de Bizum, Revtag o IBAN</label><input id="dato_cobro" name="dato_cobro" value="${esc(pr.dato_cobro || '')}">
      <p class="ayuda">Solo lo ves tú y el administrador.</p>
      <div class="botones"><button class="btn principal bloque" type="submit">Guardar perfil</button></div>
    </form>
    <div class="tarjeta"><h2>🔔 Avisos</h2>
      ${permiso === 'granted' ? '<p class="verde-texto">Avisos activados en este móvil.</p>'
        : permiso === 'denied' ? '<p class="rojo-texto">Bloqueados en este navegador: actívalos en sus ajustes.</p>'
        : `<div class="botones"><button class="btn principal" id="b-avisos">Activar avisos</button></div>`}
      <p class="sub">Elige qué avisos quieres recibir. Los de «pago confirmado» y «pago rechazado» llegan siempre.</p>
      ${TIPOS_AVISO.map(([k, t, d]) => `<label class="check"><input type="checkbox" data-pref="${k}" ${apagado[k] ? '' : 'checked'}><span><strong>${t}</strong><br><span class="sub peq">${d}</span></span></label>`).join('')}
    </div>
    <div class="botones"><a class="btn" href="#/tutorial">🎓 Ver tutorial</a><button class="btn rojo" id="b-salir">Cerrar sesión</button></div>`;
  const f = $('#f-perfil', main);
  f.onsubmit = e => {
    e.preventDefault();
    conCarga($('button[type=submit]', f), async () => {
      try {
        const cambios = { apodo: f.apodo.value.trim() };
        if (f.foto.files[0]) cambios.foto_url = await subirFoto('fotos', S.uid, f.foto.files[0]);
        const r1 = await sb.from('profiles').update(cambios).eq('id', S.uid);
        if (r1.error) throw r1.error;
        const r2 = await sb.from('perfil_privado').update({ telefono: f.telefono.value.trim() || null,
          metodo_cobro: f.metodo_cobro.value || null, dato_cobro: f.dato_cobro.value.trim() || null }).eq('user_id', S.uid);
        if (r2.error) throw r2.error;
        await cargarPerfil(); olvidarMiembros();
        toast('Perfil guardado'); refrescar();
      } catch (err) { fallo(err); }
    });
  };
  $$('[data-pref]', main).forEach(ch => ch.onchange = async () => {
    const { error } = await sb.from('notification_prefs').upsert({ user_id: S.uid, tipo: ch.dataset.pref, activo: ch.checked }, { onConflict: 'user_id,tipo' });
    if (error) { ch.checked = !ch.checked; return fallo(error); }
    toast(ch.checked ? 'Aviso activado' : 'Aviso desactivado');
  });
  $('#b-avisos', main)?.addEventListener('click', () => activarAvisos());
  $('#b-salir', main).onclick = async () => { if (await confirmar('¿Cerrar sesión en este móvil?', { si: 'Cerrar sesión' })) await sb.auth.signOut(); };
  cargarFotos(main);
  return 'Perfil';
}
