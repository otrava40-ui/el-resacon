// Panel de administrador (solo Sergio)
import { sb } from '../supa.js';
import { S, cfg, cfgSi, cargarConfig, miembros, olvidarMiembros } from '../estado.js';
import { $, $$, esc, eur, fecha, fechaHora, chipCargo, chipTicket, METODOS, aCentimos, aEurosTexto, abrirHoja, cerrarHoja,
         toast, fallo, confirmar, pedirTexto, conCarga, imgFoto, cargarFotos, copiable, activarCopiar, copiar, descargarCSV, avatar, pista, activarPistas } from '../util.js';
import { refrescar, ir } from '../nav.js';

const SECCIONES = [
  ['resumen', 'Resumen'], ['pagos', 'Pagos'], ['tickets', 'Tickets'], ['tareas', 'Tareas'],
  ['cargos', 'Cargos sueltos'], ['avisos', 'Avisos'], ['miembros', 'Miembros'], ['ajustes', 'Ajustes'], ['exportar', 'Exportar'], ['guia', 'Guía'],
];

export async function vista(main, { sec = 'resumen' }, query) {
  if (!S.esAdmin) { ir('#/inicio'); return; }
  const cab = `<h1>⚙️ Admin</h1><div class="pestanas">${SECCIONES.map(([k, v]) => `<a href="#/admin/${k}" class="${sec === k ? 'activa' : ''}">${v}</a>`).join('')}</div><div id="sec"></div>`;
  main.innerHTML = cab;
  const cont = $('#sec', main);
  cont.innerHTML = '<div class="cargando"></div>';
  const fn = { resumen, pagos, tickets, tareas, cargos, avisos: avisosAdmin, miembros: miembrosAdmin, ajustes, exportar, guia }[sec] || resumen;
  await fn(cont, query);
  // deja visible la pestaña activa
  $('.pestanas .activa', main)?.scrollIntoView({ inline: 'center', block: 'nearest' });
  return 'Admin';
}

// ---------- Resumen ----------
async function resumen(c) {
  const [cg, tk] = await Promise.all([
    sb.from('charges').select('importe_cents, estado').in('estado', ['sin_pagar', 'pendiente']),
    sb.from('tickets').select('importe_cents, estado').in('estado', ['enviado', 'aprobado']),
  ]);
  if (cg.error) throw cg.error;
  const porCobrar = (cg.data || []).reduce((s, x) => s + x.importe_cents, 0);
  const porConfirmar = (cg.data || []).filter(x => x.estado === 'pendiente');
  const ticketsRevisar = (tk.data || []).filter(x => x.estado === 'enviado').length;
  const porDevolver = (tk.data || []).reduce((s, x) => s + x.importe_cents, 0);
  c.innerHTML = `
    ${!cfg('iban') && !cfg('revolut_enlace') && !cfg('bizum_numero') ? '<div class="info-caja">👉 Primero pon los datos del bote en <a href="#/admin/ajustes">Ajustes</a> para que la gente pueda pagar.</div>' : ''}
    <div class="resumen-grid">
      <a class="dato-grande" href="#/admin/pagos" style="text-decoration:none"><div class="etq">Pendiente de cobrar</div><div class="valor">${eur(porCobrar)}</div></a>
      <a class="dato-grande" href="#/admin/pagos" style="text-decoration:none"><div class="etq">Pagos por confirmar</div><div class="valor" style="color:${porConfirmar.length ? 'var(--naranja)' : 'inherit'}">${porConfirmar.length}</div></a>
      <a class="dato-grande" href="#/admin/tickets" style="text-decoration:none"><div class="etq">Tickets por revisar</div><div class="valor">${ticketsRevisar}</div></a>
      <a class="dato-grande" href="#/admin/tickets" style="text-decoration:none"><div class="etq">Pendiente de devolver</div><div class="valor">${eur(porDevolver)}</div></a>
    </div>
    <div class="tarjeta" style="margin-top:1rem">
      <div class="fila entre"><div><div class="sub peq">Saldo del bote (a mano, solo lo ves tú)</div><div class="total-grande">${eur(Number(cfg('saldo_bote_cents', '0')))}</div>
      <div class="sub peq">${cfg('saldo_actualizado_en') ? 'Actualizado ' + fechaHora(cfg('saldo_actualizado_en')) : 'Sin actualizar'}</div></div>
      <button class="btn peq" id="b-saldo">Actualizar</button></div></div>
    <div class="botones"><a class="btn principal" href="#/evento/nuevo">＋ Nuevo evento</a><a class="btn" href="#/admin/cargos">＋ Cargo suelto</a><a class="btn" href="#/admin/miembros">＋ Invitar</a></div>`;
  $('#b-saldo', c).onclick = async () => {
    const v = await pedirTexto('Saldo actual del bote', { etiqueta: 'Mira el saldo en Revolut y escríbelo (€)', valor: aEurosTexto(cfg('saldo_bote_cents', '0')), boton: 'Guardar' });
    if (v === null) return;
    const cents = aCentimos(v);
    if (cents === null) return toast('Importe no válido', 'error');
    await guardarAjustes({ saldo_bote_cents: String(cents), saldo_actualizado_en: new Date().toISOString() });
    refrescar();
  };
}

// ---------- Pagos ----------
async function pagos(c, query) {
  const { data, error } = await sb.from('charges').select('*, events(nombre), profiles!charges_user_id_fkey(apodo)')
    .in('estado', ['pendiente', 'sin_pagar']).order('marcado_en', { ascending: true, nullsFirst: false });
  if (error) throw error;
  const todos = data || [];
  const filtroEv = query.evento ? Number(query.evento) : null;
  const lista = filtroEv ? todos.filter(x => x.event_id === filtroEv) : todos;
  const pend = lista.filter(x => x.estado === 'pendiente');
  const sinPagar = lista.filter(x => x.estado === 'sin_pagar').sort((a, b) => a.profiles.apodo.localeCompare(b.profiles.apodo));
  const eventos = [...new Map(todos.filter(x => x.events).map(x => [x.event_id, x.events.nombre])).entries()];
  c.innerHTML = `
    ${eventos.length ? `<select id="filtro-ev" style="margin-bottom:1rem"><option value="">Todos los eventos y cargos</option>${eventos.map(([id, n]) => `<option value="${id}" ${filtroEv === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>` : ''}
    <section class="tarjeta">
      <h2>⏳ Por confirmar (${pend.length})</h2>
      ${pista('admin-confirmar', 'Comprueba en Revolut que ha llegado el dinero y pulsa Confirmar. Si no lo encuentras, Rechazar con el motivo.')}
      ${pend.length ? `<label class="check"><input type="checkbox" id="todos-pend"> Seleccionar todos</label>
      <ul class="lista">${pend.map(x => `<li style="flex-wrap:wrap">
        <input type="checkbox" class="sel-pend" value="${x.id}" style="width:22px;height:22px;accent-color:var(--amarillo)">
        <div class="crece"><div class="titulo">${esc(x.profiles.apodo)} · ${eur(x.importe_cents)}</div>
          <div class="sub peq">${esc(x.concepto)} · ${esc(METODOS[x.metodo] || x.metodo || '')} · marcó ${fechaHora(x.marcado_en)}</div>
          ${x.captura_url ? `<div style="margin-top:.3rem">${imgFoto('capturas', x.captura_url)}</div>` : ''}</div>
        <div class="botones" style="width:100%"><button class="btn verde peq" data-conf="${x.id}">✔ Confirmar</button><button class="btn rojo peq" data-rech="${x.id}">Rechazar</button></div></li>`).join('')}</ul>
      <div class="botones"><button class="btn verde bloque" id="b-conf-sel">Confirmar seleccionados</button></div>`
      : '<p class="sub">Nada por confirmar. 👌</p>'}
    </section>
    <section class="tarjeta">
      <h2>Sin pagar (${sinPagar.length}) · ${eur(sinPagar.reduce((s, x) => s + x.importe_cents, 0))}</h2>
      <p class="sub">Si alguien te paga en mano o se olvida de pulsar el botón, márcalo aquí.</p>
      ${sinPagar.length ? `<ul class="lista">${sinPagar.map(x => `<li><div class="crece"><div class="titulo">${esc(x.profiles.apodo)}</div>
        <div class="sub peq">${esc(x.concepto)}${x.fecha_limite ? ' · límite ' + fecha(x.fecha_limite) : ''}</div>${chipCargo(x)}</div>
        <div style="text-align:right"><div class="importe">${eur(x.importe_cents)}</div>
        <div class="botones" style="justify-content:flex-end"><button class="btn peq" data-mano="${x.id}">💵 Pagado</button><button class="btn peq fantasma" data-anular="${x.id}" title="Anular">✕</button></div></div></li>`).join('')}</ul>`
      : '<p class="sub">Todo el mundo está al día. 🎉</p>'}
    </section>`;
  cargarFotos(c); activarPistas(c);
  $('#filtro-ev', c)?.addEventListener('change', e => ir('#/admin/pagos' + (e.target.value ? '?evento=' + e.target.value : '')));
  $('#todos-pend', c)?.addEventListener('change', e => $$('.sel-pend', c).forEach(ch => ch.checked = e.target.checked));
  const confirmarIds = async (ids, metodo = null) => {
    const { data: n, error } = await sb.rpc('confirmar_pago', { p_ids: ids, p_metodo: metodo });
    if (error) return fallo(error);
    toast(n === 1 ? 'Pago confirmado' : `${n} pagos confirmados`); refrescar();
  };
  $$('[data-conf]', c).forEach(b => b.onclick = () => confirmarIds([Number(b.dataset.conf)]));
  $('#b-conf-sel', c)?.addEventListener('click', () => {
    const ids = $$('.sel-pend:checked', c).map(ch => Number(ch.value));
    if (!ids.length) return toast('Selecciona alguno', 'error');
    confirmarIds(ids);
  });
  $$('[data-rech]', c).forEach(b => b.onclick = async () => {
    const motivo = await pedirTexto('Rechazar pago', { etiqueta: 'Motivo (lo verá el miembro)', valor: 'No encuentro el pago en el bote', boton: 'Rechazar' });
    if (!motivo) return;
    const { error } = await sb.rpc('rechazar_pago', { p_charge_id: Number(b.dataset.rech), p_motivo: motivo });
    if (error) return fallo(error);
    toast('Pago rechazado'); refrescar();
  });
  $$('[data-mano]', c).forEach(b => b.onclick = async () => {
    if (!await confirmar('¿Marcar como pagado (en mano / efectivo)?', { si: 'Marcar pagado' })) return;
    confirmarIds([Number(b.dataset.mano)], 'efectivo');
  });
  $$('[data-anular]', c).forEach(b => b.onclick = async () => {
    if (!await confirmar('¿Anular este cargo? Se verá tachado y ya no lo deberá.', { si: 'Anular', peligro: true })) return;
    const { error } = await sb.rpc('anular_cargo', { p_charge_id: Number(b.dataset.anular), p_anular: true });
    if (error) return fallo(error);
    toast('Cargo anulado'); refrescar();
  });
}

// ---------- Tickets ----------
async function tickets(c, query) {
  const estado = query.estado || 'pendientes';
  const { data, error } = await sb.from('tickets')
    .select('*, profiles!tickets_user_id_fkey(apodo), events(nombre), event_tasks(titulo)')
    .order('creado_en', { ascending: false });
  if (error) throw error;
  const todos = data || [];
  const ev = query.evento ? Number(query.evento) : null;
  const filtrados = todos.filter(t => (estado === 'pendientes' ? ['enviado', 'aprobado'].includes(t.estado) : estado === 'todos' ? true : t.estado === estado)
    && (!ev || t.event_id === ev));
  const porDevolver = todos.filter(t => ['enviado', 'aprobado'].includes(t.estado)).reduce((s, t) => s + t.importe_cents, 0);
  const eventos = [...new Map(todos.filter(t => t.events).map(t => [t.event_id, t.events.nombre])).entries()];
  const q = (cambio) => '#/admin/tickets?' + new URLSearchParams({ estado, ...(ev ? { evento: ev } : {}), ...cambio }).toString();
  c.innerHTML = `
    <div class="tarjeta"><div class="sub peq">Pendiente de devolver</div><div class="total-grande">${eur(porDevolver)}</div></div>
    <div class="pestanas">${[['pendientes', 'Por resolver'], ['enviado', 'Enviados'], ['aprobado', 'Aprobados'], ['reembolsado', 'Reembolsados'], ['rechazado', 'Rechazados'], ['todos', 'Todos']]
      .map(([k, v]) => `<a href="${q({ estado: k })}" class="${estado === k ? 'activa' : ''}">${v}</a>`).join('')}</div>
    ${eventos.length ? `<select id="f-ev" style="margin-bottom:1rem"><option value="">Todos los eventos</option>${eventos.map(([id, n]) => `<option value="${id}" ${ev === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>` : ''}
    ${filtrados.length ? filtrados.map(t => `<div class="tarjeta">
      <div class="fila entre"><div><div class="titulo"><strong>${esc(t.profiles?.apodo)}</strong> · ${esc(t.concepto)}</div>
        <div class="sub peq">${fecha(t.creado_en)}${t.events ? ' · ' + esc(t.events.nombre) : ''}${t.event_tasks ? ' · tarea: ' + esc(t.event_tasks.titulo) : ''}</div></div>${chipTicket(t)}</div>
      <div class="total-grande" style="font-size:1.6rem">${eur(t.importe_cents)}</div>
      ${imgFoto('tickets', t.foto_url, 'foto-ticket')}
      <p class="sub">Cobrar por <strong>${esc(METODOS[t.metodo_cobro] || '—')}</strong>${t.dato_cobro ? ':' : ''}</p>${t.dato_cobro ? copiable(t.dato_cobro) : ''}
      ${t.motivo_rechazo ? `<p class="rojo-texto">${esc(t.motivo_rechazo)}</p>` : ''}
      ${t.estado === 'enviado' ? `<label class="check"><input type="checkbox" id="anadir-${t.id}" ${t.event_id ? 'checked' : 'disabled'}> Añadir a la lista de la compra del evento</label>` : ''}
      <div class="botones">
        ${t.estado === 'enviado' ? `<button class="btn principal peq" data-aprobar="${t.id}">Aprobar</button>` : ''}
        ${['enviado', 'aprobado'].includes(t.estado) ? `<button class="btn verde peq" data-reemb="${t.id}">💸 Marcar reembolsado</button>
          <button class="btn peq" data-comp="${t.id}">Descontar de su deuda</button><button class="btn rojo peq" data-rech="${t.id}">Rechazar</button>` : ''}
      </div></div>`).join('') : '<div class="vacio"><span class="grande">🧾</span>No hay tickets aquí.</div>'}`;
  cargarFotos(c); activarCopiar(c);
  $('#f-ev', c)?.addEventListener('change', e => ir(e.target.value ? q({ evento: e.target.value }) : '#/admin/tickets?estado=' + estado));
  const porId = Object.fromEntries(todos.map(t => [t.id, t]));
  $$('[data-aprobar]', c).forEach(b => b.onclick = () => conCarga(b, async () => {
    const id = Number(b.dataset.aprobar);
    const { error } = await sb.rpc('aprobar_ticket', { p_ticket_id: id, p_anadir_a_compra: !!$('#anadir-' + id, c)?.checked });
    if (error) return fallo(error);
    toast('Ticket aprobado'); refrescar();
  }));
  $$('[data-reemb]', c).forEach(b => b.onclick = async () => {
    const t = porId[b.dataset.reemb];
    if (!await confirmar(`¿Ya le has devuelto ${eur(t.importe_cents)} a ${t.profiles?.apodo}? Se apuntará como gasto del bote.`, { si: 'Sí, reembolsado' })) return;
    const { error } = await sb.rpc('reembolsar_ticket', { p_ticket_id: t.id });
    if (error) return fallo(error);
    toast('Reembolsado y apuntado en gastos'); refrescar();
  });
  $$('[data-rech]', c).forEach(b => b.onclick = async () => {
    const motivo = await pedirTexto('Rechazar ticket', { etiqueta: 'Motivo (lo verá el miembro)', boton: 'Rechazar' });
    if (!motivo) return;
    const { error } = await sb.rpc('rechazar_ticket', { p_ticket_id: Number(b.dataset.rech), p_motivo: motivo });
    if (error) return fallo(error);
    toast('Ticket rechazado'); refrescar();
  });
  $$('[data-comp]', c).forEach(b => b.onclick = () => hojaCompensar(porId[b.dataset.comp]));
}

async function hojaCompensar(t) {
  const { data, error } = await sb.from('charges').select('id, concepto, importe_cents, estado').eq('user_id', t.user_id).in('estado', ['sin_pagar', 'pendiente']);
  if (error) return fallo(error);
  const validos = (data || []).filter(x => x.importe_cents <= t.importe_cents);
  const c = abrirHoja(`<h2>Descontar de su deuda</h2>
    <p>Ticket de <strong>${esc(t.profiles?.apodo)}</strong>: ${eur(t.importe_cents)}. Elige qué cargo suyo queda pagado con este ticket.</p>
    ${validos.length ? `<ul class="lista">${validos.map(x => `<li><div class="crece"><div class="titulo">${esc(x.concepto)}</div>
      <div class="sub peq">Quedaría por devolverle: ${eur(t.importe_cents - x.importe_cents)}</div></div>
      <span class="importe">${eur(x.importe_cents)}</span><button class="btn principal peq" data-cargo="${x.id}">Elegir</button></li>`).join('')}</ul>`
    : `<div class="info-caja">No tiene ningún cargo sin pagar que este ticket cubra entero (no hay pagos parciales). ${data?.length ? 'Sus cargos son mayores que el ticket.' : 'No debe nada.'}</div>`}`);
  $$('[data-cargo]', c).forEach(b => b.onclick = () => conCarga(b, async () => {
    const { data: resto, error: e2 } = await sb.rpc('compensar_ticket', { p_ticket_id: t.id, p_charge_id: Number(b.dataset.cargo) });
    if (e2) return fallo(e2);
    cerrarHoja();
    if (resto > 0) abrirHoja(`<h2>Hecho</h2><div class="info-caja">El cargo queda pagado. <strong>Aún tienes que devolverle ${eur(resto)}</strong> a ${esc(t.profiles?.apodo)}.</div>
      <button class="btn principal bloque" onclick="document.querySelector('#capa-hoja .cerrar').click()">Entendido</button>`, { alCerrar: refrescar });
    else { toast('Descontado: cargo pagado y ticket reembolsado'); refrescar(); }
  }));
}

// ---------- Tareas ----------
async function tareas(c) {
  const [tR, kR] = await Promise.all([
    sb.from('event_tasks').select('*, events(id, nombre, estado), task_assignees(user_id, profiles(apodo))').order('fecha', { nullsFirst: false }),
    sb.from('tickets').select('id, task_id, importe_cents, estado').not('task_id', 'is', null),
  ]);
  if (tR.error) throw tR.error;
  const ts = tR.data || [], ks = kR.data || [];
  c.innerHTML = ts.length ? `<p class="sub">Todas las tareas de los eventos. Se crean dentro de cada evento.</p>
    <div class="tarjeta" style="overflow-x:auto"><table class="tabla"><thead><tr><th>Tarea</th><th>Encargado</th><th>Estado</th><th>Ticket</th></tr></thead><tbody>
    ${ts.map(t => { const k = ks.filter(x => x.task_id === t.id); return `<tr>
      <td><a href="#/evento/${t.event_id}"><strong>${esc(t.titulo)}</strong></a><div class="sub peq">${esc(t.events?.nombre || '')}${t.fecha ? ' · ' + fecha(t.fecha) : ''}</div></td>
      <td>${t.task_assignees.map(a => esc(a.profiles?.apodo)).join(', ')}</td>
      <td>${t.estado === 'hecha' ? '<span class="chip verde">Hecha</span>' : '<span class="chip gris">Pendiente</span>'}</td>
      <td>${k.length ? k.map(x => `${eur(x.importe_cents)} ${chipTicket(x)}`).join('<br>') : '<span class="sub peq">—</span>'}</td></tr>`; }).join('')}
    </tbody></table></div>` : '<div class="vacio"><span class="grande">📋</span>No hay tareas. Créalas dentro de un evento con «＋ Tarea».</div>';
}

// ---------- Cargos sueltos ----------
async function cargos(c) {
  const gente = (await miembros(true)).filter(m => m.activo);
  const { data: recientes } = await sb.from('charges').select('concepto, importe_cents, estado, creado_en, profiles!charges_user_id_fkey(apodo)').is('event_id', null).order('creado_en', { ascending: false }).limit(30);
  c.innerHTML = `<form id="f-cargo" class="tarjeta"><h2>Nuevo cargo suelto</h2>
      <p class="sub">Para cuotas, una multa simpática o una derrama. Sin lista de la compra.</p>
      <label>Concepto</label><input name="concepto" required maxlength="60" placeholder="Derrama arreglo del local">
      <div class="dos-col"><div><label>Importe por persona (€)</label><input name="importe" inputmode="decimal" required placeholder="10"></div>
      <div><label>Fecha límite (opcional)</label><input type="date" name="fecha"></div></div>
      <label>¿A quién?</label>
      <div class="botones"><button type="button" class="btn peq" id="b-todos">Todos</button><button type="button" class="btn peq fantasma" id="b-nadie">Nadie</button></div>
      <ul class="lista">${gente.map(m => `<li><label class="check" style="margin:0"><input type="checkbox" name="u" value="${m.id}" checked> ${esc(m.apodo)}</label></li>`).join('')}</ul>
      <div class="botones"><button class="btn principal bloque" type="submit">Crear cargos</button></div></form>
    ${recientes?.length ? `<p class="seccion-titulo">Últimos cargos sueltos</p><div class="tarjeta"><ul class="lista">${recientes.map(x => `<li><div class="crece"><div class="titulo">${esc(x.profiles?.apodo)} · ${esc(x.concepto)}</div><div class="sub peq">${fecha(x.creado_en)}</div></div>${chipCargo(x)}<span class="importe">${eur(x.importe_cents)}</span></li>`).join('')}</ul></div>` : ''}`;
  const f = $('#f-cargo', c);
  $('#b-todos', c).onclick = () => $$('input[name=u]', f).forEach(i => i.checked = true);
  $('#b-nadie', c).onclick = () => $$('input[name=u]', f).forEach(i => i.checked = false);
  f.onsubmit = e => {
    e.preventDefault();
    const cents = aCentimos(f.importe.value);
    const us = $$('input[name=u]:checked', f).map(i => i.value);
    if (!cents) return toast('Pon un importe', 'error');
    if (!us.length) return toast('Elige al menos a una persona', 'error');
    conCarga($('button[type=submit]', f), async () => {
      if (!await confirmar(`¿Cobrar ${eur(cents)} a ${us.length} persona(s) por «${f.concepto.value.trim()}»?`, { si: 'Crear cargos' })) return;
      const { data: n, error } = await sb.rpc('crear_cargos_sueltos', { p_usuarios: us, p_concepto: f.concepto.value.trim(), p_importe_cents: cents, p_fecha_limite: f.fecha.value || null });
      if (error) return fallo(error);
      toast(`${n} cargos creados`); refrescar();
    });
  };
}

// ---------- Avisos: mensaje a mano y quién los tiene activados ----------
async function avisosAdmin(c) {
  const { data, error } = await sb.rpc('resumen_avisos');
  if (error) throw error;
  const gente = data || [];
  const con = gente.filter(g => g.moviles > 0).length;
  c.innerHTML = `
    <form id="f-aviso" class="tarjeta"><h2>📣 Enviar aviso</h2>
      <p class="sub">Llega como notificación al móvil de quien tenga los avisos activados.</p>
      <label>Título</label><input name="titulo" required maxlength="80" placeholder="Reunión el viernes">
      <label>Mensaje</label><textarea name="cuerpo" maxlength="300" placeholder="A las 20:00 en el local. ¡No faltéis!"></textarea>
      <label>¿A quién?</label>
      <label class="check"><input type="radio" name="destino" value="todos" checked> A todos</label>
      <label class="check"><input type="radio" name="destino" value="deudores"> Solo a quien debe algo</label>
      <div class="botones"><button class="btn principal bloque" type="submit">Enviar aviso</button></div>
    </form>
    <div class="tarjeta"><h2>🔔 Quién tiene los avisos</h2>
      <p class="sub">${con} de ${gente.length} miembros los tienen activados. A quien no, recuérdale que pulse «Activar avisos» (en iPhone, desde el icono de la pantalla de inicio).</p>
      <ul class="lista">${gente.map(g => `<li><div class="crece"><div class="titulo">${esc(g.apodo)}</div>
        ${g.ultimo ? `<div class="sub peq">Desde ${fecha(g.ultimo)}</div>` : ''}</div>
        ${g.moviles ? `<span class="chip verde">${g.moviles} móvil${g.moviles === 1 ? '' : 'es'}</span>` : '<span class="chip gris">Sin avisos</span>'}</li>`).join('')}</ul>
    </div>
    <p class="sub">Los recordatorios automáticos se configuran en <a href="#/admin/ajustes">Ajustes</a>.</p>`;
  const f = $('#f-aviso', c);
  f.onsubmit = e => {
    e.preventDefault();
    conCarga($('button[type=submit]', f), async () => {
      const destino = f.destino.value;
      if (!await confirmar(`¿Enviar «${f.titulo.value.trim()}» ${destino === 'deudores' ? 'a quien debe algo' : 'a todos'}?`, { si: 'Enviar' })) return;
      const { data: n, error: e2 } = await sb.rpc('enviar_aviso_manual', { p_titulo: f.titulo.value.trim(), p_cuerpo: f.cuerpo.value.trim(), p_destino: destino });
      if (e2) return fallo(e2);
      toast(`Aviso enviado a ${n} persona${n === 1 ? '' : 's'}`);
      f.reset();
    });
  };
}

// ---------- Miembros e invitaciones ----------
async function miembrosAdmin(c) {
  const [gente, privR, invR] = await Promise.all([
    miembros(true),
    sb.from('perfil_privado').select('*'),
    sb.from('invites').select('*').order('creado_en', { ascending: false }).limit(20),
  ]);
  const priv = Object.fromEntries((privR.data || []).map(p => [p.user_id, p]));
  const ahora = new Date();
  const invites = (invR.data || []).filter(i => i.activa && i.usos < i.usos_max && (!i.caduca_en || new Date(i.caduca_en) > ahora));
  const base = location.origin + location.pathname;
  c.innerHTML = `
    <form id="f-inv" class="tarjeta"><h2>✉️ Invitar</h2>
      <p class="sub">Genera un código y pásalo por WhatsApp. Sin código no se puede crear cuenta.</p>
      <div class="dos-col"><div><label>¿Cuántas personas pueden usarlo?</label><input name="usos" type="number" min="1" max="100" value="1"></div>
      <div><label>Caduca en (días)</label><input name="dias" type="number" min="0" max="365" value="14"></div></div>
      <div class="botones"><button class="btn principal bloque" type="submit">Crear invitación</button></div></form>
    ${invites.length ? `<p class="seccion-titulo">Invitaciones activas</p><div class="tarjeta"><ul class="lista">${invites.map(i => `<li style="flex-wrap:wrap">
      <div class="crece"><div class="titulo" style="letter-spacing:.12em">${esc(i.codigo)}</div><div class="sub peq">Usada ${i.usos}/${i.usos_max}${i.caduca_en ? ' · caduca ' + fecha(i.caduca_en) : ''}</div></div>
      <button class="btn peq" data-copiar="${esc(base + '#/registro?c=' + i.codigo)}">Copiar enlace</button>
      <a class="btn peq" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Únete a la app de El Resacón 🍻\n1) Instálala: ${base}#/instalar?c=${i.codigo}\n2) Crea tu cuenta con el código ${i.codigo}`)}">WhatsApp</a>
      <button class="btn peq fantasma" data-desact="${esc(i.codigo)}">✕</button></li>`).join('')}</ul></div>` : ''}
    <p class="seccion-titulo">Miembros (${gente.filter(m => m.activo).length} activos)</p>
    <div class="tarjeta"><ul class="lista pulsable">${gente.map(m => `<li data-m="${m.id}">${avatar(m)}<div class="crece">
      <div class="titulo ${m.activo ? '' : 'tachado'}">${esc(m.apodo)} ${m.rol === 'admin' ? '<span class="chip amarillo">Admin</span>' : ''} ${m.activo ? '' : '<span class="chip borde">Inactivo</span>'}</div>
      <div class="sub peq">${priv[m.id]?.telefono ? esc(priv[m.id].telefono) + ' · ' : ''}${priv[m.id]?.dato_cobro ? 'Cobra por ' + esc(METODOS[priv[m.id].metodo_cobro] || '?') + ': ' + esc(priv[m.id].dato_cobro) : 'Sin datos de cobro'}</div></div>›</li>`).join('')}</ul></div>`;
  cargarFotos(c); activarCopiar(c);
  const f = $('#f-inv', c);
  f.onsubmit = e => {
    e.preventDefault();
    conCarga($('button', f), async () => {
      const { data: codigo, error } = await sb.rpc('crear_invitacion', { p_usos_max: Number(f.usos.value) || 1, p_dias: Number(f.dias.value) || 0 });
      if (error) return fallo(error);
      const enlace = base + '#/registro?c=' + codigo;
      const texto = `Únete a la app de El Resacón 🍻\n1) Instálala: ${base}#/instalar?c=${codigo}\n2) Crea tu cuenta con el código ${codigo}`;
      const h = abrirHoja(`<h2>Invitación creada</h2><p>Código:</p>${copiable(codigo)}<p>Enlace directo:</p>${copiable(enlace)}
        <div class="botones"><a class="btn principal" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(texto)}">Enviar por WhatsApp</a><button class="btn" id="b-copiar-msg">Copiar mensaje</button></div>`, { alCerrar: refrescar });
      activarCopiar(h);
      $('#b-copiar-msg', h).onclick = () => copiar(texto, 'Mensaje copiado');
    });
  };
  $$('[data-desact]', c).forEach(b => b.onclick = async () => {
    const { error } = await sb.from('invites').update({ activa: false }).eq('codigo', b.dataset.desact);
    if (error) return fallo(error);
    toast('Invitación desactivada'); refrescar();
  });
  $$('[data-m]', c).forEach(li => li.onclick = () => hojaMiembro(gente.find(m => m.id === li.dataset.m), priv[li.dataset.m] || {}));
}

function hojaMiembro(m, p) {
  const yo = m.id === S.uid;
  const h = abrirHoja(`<div class="fila">${avatar(m, true)}<div><h2 style="margin:0">${esc(m.apodo)}</h2><div class="sub">Desde ${fecha(m.creado_en)}</div></div></div>
    <form id="f-m"><label>Apodo</label><input name="apodo" maxlength="30" value="${esc(m.apodo)}" required>
    ${p.telefono ? `<label>Teléfono</label>${copiable(p.telefono)}` : ''}
    ${p.dato_cobro ? `<label>Cobra por ${esc(METODOS[p.metodo_cobro] || '')}</label>${copiable(p.dato_cobro)}` : ''}
    ${yo ? '<p class="sub">Eres tú (administrador).</p>' : `<label class="check"><input type="checkbox" name="activo" ${m.activo ? 'checked' : ''}> Activo (si lo desactivas no recibe cargos nuevos, pero conserva su historial)</label>`}
    <div class="botones"><button class="btn principal bloque" type="submit">Guardar</button></div></form>`);
  cargarFotos(h); activarCopiar(h);
  const f = $('#f-m', h);
  f.onsubmit = e => {
    e.preventDefault();
    conCarga($('button[type=submit]', f), async () => {
      const cambios = { apodo: f.apodo.value.trim() };
      if (!yo) cambios.activo = f.activo.checked;
      const { error } = await sb.from('profiles').update(cambios).eq('id', m.id);
      if (error) return fallo(error);
      olvidarMiembros(); cerrarHoja(); toast('Guardado'); refrescar();
    });
  };
}

// ---------- Ajustes ----------
async function guardarAjustes(valores) {
  const filas = Object.entries(valores).map(([clave, valor]) => ({ clave, valor: String(valor ?? '') }));
  for (const fila of filas) {
    const { error } = await sb.from('config').update({ valor: fila.valor }).eq('clave', fila.clave);
    if (error) throw error;
  }
  await cargarConfig();
  toast('Ajustes guardados');
}

async function ajustes(c) {
  const v = k => esc(cfg(k));
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  c.innerHTML = `<form id="f-aj">
    <div class="tarjeta"><h2>💳 Datos del bote</h2>
      <p class="sub">Solo los ven los miembros con sesión iniciada. No están en el código de la app.</p>
      <label>Enlace de pago de Revolut</label><input name="revolut_enlace" type="url" value="${v('revolut_enlace')}" placeholder="https://revolut.me/tuusuario">
      <p class="ayuda">Si tu enlace admite el importe en la dirección, escribe <code>{importe}</code> donde va (p. ej. <code>https://revolut.me/tuusuario/{importe}</code>) y saldrá ya puesto. Si no, deja el enlace normal: la gente escribe el importe.</p>
      <label>IBAN</label><input name="iban" value="${v('iban')}" placeholder="ES00 0000 0000 0000 0000 0000">
      <label>Titular</label><input name="titular" value="${v('titular')}">
      <label>Número de Bizum de ${esc(cfg('admin_nombre', 'Sergio'))}</label><input name="bizum_numero" type="tel" value="${v('bizum_numero')}">
      <label class="check"><input type="checkbox" name="bizum_activo" ${cfgSi('bizum_activo') ? 'checked' : ''}> Mostrar Bizum como forma de pago</label>
      <label>Saldo del bote (€) — solo lo ves tú</label><input name="saldo" inputmode="decimal" value="${esc(aEurosTexto(cfg('saldo_bote_cents', '0')))}">
    </div>
    <div class="tarjeta"><h2>🔔 Recordatorios de pago</h2>
      <p class="sub">Cuándo se avisa a quien debe algo. Se revisa cada hora (hora de España).</p>
      <label>Avisar … días antes de la fecha límite</label><input name="recordatorio_dias_antes" type="number" min="0" max="30" value="${v('recordatorio_dias_antes')}">
      <label class="check"><input type="checkbox" name="recordatorio_semanal" ${cfgSi('recordatorio_semanal') ? 'checked' : ''}> Recordatorio semanal a quien deba algo</label>
      <div class="dos-col"><div><label>Día</label><select name="recordatorio_dia_semana">${dias.map((d, i) => `<option value="${i}" ${String(i) === cfg('recordatorio_dia_semana') ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
      <div><label>Hora</label><select name="recordatorio_hora">${Array.from({ length: 15 }, (_, i) => i + 9).map(h => `<option value="${h}" ${String(h) === cfg('recordatorio_hora') ? 'selected' : ''}>${h}:00</option>`).join('')}</select></div></div>
      <label>Aviso de evento: … días antes</label><input name="aviso_evento_dias_antes" type="number" min="0" max="14" value="${v('aviso_evento_dias_antes')}">
      <label>Recordatorio a encargados: … días antes de la tarea</label><input name="aviso_tarea_dias_antes" type="number" min="0" max="14" value="${v('aviso_tarea_dias_antes')}">
    </div>
    <div class="tarjeta"><h2>📲 App y música</h2>
      <label>Enlace de descarga de la app del jukebox (APK, opcional)</label><input name="apk_url" type="url" value="${v('apk_url')}" placeholder="https://github.com/…/releases/…/el-resacon.apk">
      <label>Dirección del jukebox</label><input name="jukebox_url" value="${v('jukebox_url')}">
      <label>Nombre del administrador (sale en los textos)</label><input name="admin_nombre" value="${v('admin_nombre')}">
    </div>
    <button class="btn principal bloque" type="submit">Guardar ajustes</button></form>`;
  const f = $('#f-aj', c);
  f.onsubmit = e => {
    e.preventDefault();
    const saldo = aCentimos(f.saldo.value);
    if (saldo === null) return toast('El saldo no es válido', 'error');
    conCarga($('button[type=submit]', f), async () => {
      try {
        const nuevo = {
          revolut_enlace: f.revolut_enlace.value.trim(), iban: f.iban.value.trim().toUpperCase(), titular: f.titular.value.trim(),
          bizum_numero: f.bizum_numero.value.trim(), bizum_activo: f.bizum_activo.checked,
          recordatorio_dias_antes: f.recordatorio_dias_antes.value, recordatorio_semanal: f.recordatorio_semanal.checked,
          recordatorio_dia_semana: f.recordatorio_dia_semana.value, recordatorio_hora: f.recordatorio_hora.value,
          aviso_evento_dias_antes: f.aviso_evento_dias_antes.value, aviso_tarea_dias_antes: f.aviso_tarea_dias_antes.value,
          apk_url: f.apk_url.value.trim(), jukebox_url: f.jukebox_url.value.trim(), admin_nombre: f.admin_nombre.value.trim() || 'Sergio',
        };
        if (String(saldo) !== cfg('saldo_bote_cents')) { nuevo.saldo_bote_cents = saldo; nuevo.saldo_actualizado_en = new Date().toISOString(); }
        await guardarAjustes(nuevo);
      } catch (err) { fallo(err); }
    });
  };
}

// ---------- Exportar a CSV ----------
async function exportar(c) {
  c.innerHTML = `<div class="tarjeta"><h2>📤 Exportar</h2><p class="sub">Descarga un archivo CSV que se abre con Excel o Google Sheets.</p>
    <div class="botones" style="flex-direction:column"><button class="btn" id="x-pagos">Pagos (todos los cargos)</button><button class="btn" id="x-gastos">Movimientos del bote</button><button class="btn" id="x-tickets">Tickets</button></div></div>`;
  const hoy = new Date().toISOString().slice(0, 10);
  const eurTxt = cts => (cts / 100).toFixed(2).replace('.', ',');
  $('#x-pagos', c).onclick = e => conCarga(e.target, async () => {
    const { data, error } = await sb.from('charges').select('*, events(nombre), profiles!charges_user_id_fkey(apodo)').order('creado_en');
    if (error) return fallo(error);
    descargarCSV(`resacon-pagos-${hoy}.csv`, [['Miembro', 'Concepto', 'Evento', 'Importe (€)', 'Estado', 'Método', 'Fecha límite', 'Creado', 'Marcado pagado', 'Confirmado', 'Motivo rechazo'],
      ...data.map(x => [x.profiles?.apodo, x.concepto, x.events?.nombre || '', eurTxt(x.importe_cents), x.estado, METODOS[x.metodo] || x.metodo || '', x.fecha_limite || '', fechaHora(x.creado_en), fechaHora(x.marcado_en), fechaHora(x.confirmado_en), x.motivo_rechazo || ''])]);
  });
  $('#x-gastos', c).onclick = e => conCarga(e.target, async () => {
    const { data, error } = await sb.from('pot_movements').select('*, events(nombre)').order('fecha');
    if (error) return fallo(error);
    descargarCSV(`resacon-bote-${hoy}.csv`, [['Fecha', 'Tipo', 'Concepto', 'Evento', 'Importe (€)'],
      ...data.map(x => [x.fecha, x.tipo, x.concepto, x.events?.nombre || '', eurTxt(x.importe_cents)])]);
  });
  $('#x-tickets', c).onclick = e => conCarga(e.target, async () => {
    const { data, error } = await sb.from('tickets').select('*, events(nombre), event_tasks(titulo), profiles!tickets_user_id_fkey(apodo)').order('creado_en');
    if (error) return fallo(error);
    descargarCSV(`resacon-tickets-${hoy}.csv`, [['Fecha', 'Miembro', 'Concepto', 'Evento', 'Tarea', 'Importe (€)', 'Estado', 'Cobro', 'Dato de cobro', 'Reembolsado'],
      ...data.map(x => [fechaHora(x.creado_en), x.profiles?.apodo, x.concepto, x.events?.nombre || '', x.event_tasks?.titulo || '', eurTxt(x.importe_cents), x.estado, METODOS[x.metodo_cobro] || '', x.dato_cobro || '', fechaHora(x.reembolsado_en)])]);
  });
}

// ---------- Mini guía del administrador ----------
async function guia(c) {
  c.innerHTML = `<div class="tarjeta"><h2>🎓 Guía rápida del administrador</h2>
    <ol class="pasos">
      <li><strong>Ajustes del bote.</strong> Admin → Ajustes: enlace de Revolut, IBAN, titular y tu Bizum. Sin esto la gente no sabe dónde pagar.</li>
      <li><strong>Invitar.</strong> Admin → Miembros → Crear invitación. Pon 20 usos y pásalo al grupo de WhatsApp con el botón.</li>
      <li><strong>Crear un evento.</strong> Eventos → ＋ Nuevo. Elige cómo se reparte (iguales, fijo o a mano). Por defecto apunta a todos.</li>
      <li><strong>Lista de la compra.</strong> Dentro del evento, ＋ Añadir cada cosa con cantidad y precio. El total se calcula solo.</li>
      <li><strong>Guardar reparto.</strong> Cuando esté listo, pulsa «Guardar reparto y crear cargos»: a cada uno le aparece lo que debe. Si cambias algo, vuelve a pulsarlo (lo ya pagado no se toca).</li>
      <li><strong>Encargados.</strong> En el evento, ＋ Tarea: pon el título y elige a los encargados. Les sale en «Mis encargos».</li>
      <li><strong>Confirmar pagos.</strong> Admin → Pagos. Mira Revolut y pulsa Confirmar (o selecciona varios). Si no aparece, Rechazar con motivo. A quien paga en mano: 💵 Pagado.</li>
      <li><strong>Tickets.</strong> Admin → Tickets. Aprobar (se suma a la compra del evento), y cuando le devuelvas el dinero, «Marcar reembolsado» (se apunta en gastos). O «Descontar de su deuda» si te debe.</li>
      <li><strong>Saldo.</strong> De vez en cuando actualiza el saldo del bote en Resumen. Solo lo ves tú.</li>
    </ol></div>`;
}
