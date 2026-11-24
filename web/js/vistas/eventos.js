// Eventos: lista, detalle (compra, reparto, participantes, tareas) y edición
import { sb } from '../supa.js';
import { S } from '../estado.js';
import { miembros } from '../estado.js';
import { $, $$, esc, eur, fecha, hoyISO, rangoFechas, chipCargo, chipTicket, aCentimos, aEurosTexto, abrirHoja, cerrarHoja,
         toast, fallo, confirmar, conCarga, subirFoto, imgFoto, cargarFotos, pista, activarPistas, avatar } from '../util.js';
import { hojaPagar, hojaCargo, hojaTicket } from './comun.js';
import { refrescar, ir } from '../nav.js';

const MODOS = { igual: 'A partes iguales', fijo: 'Importe fijo por persona', manual: 'Importe a mano por persona' };

// ---------- Lista ----------
export async function lista(main) {
  const { data, error } = await sb.from('events').select('id, nombre, fecha_inicio, fecha_fin, estado, autoapuntarse').order('fecha_inicio', { ascending: true, nullsFirst: false });
  if (error) throw error;
  const hoy = hoyISO();
  const esPasado = e => e.estado === 'cerrado' || ((e.fecha_fin || e.fecha_inicio) && (e.fecha_fin || e.fecha_inicio) < hoy);
  const proximos = (data || []).filter(e => !esPasado(e));
  const pasados = (data || []).filter(esPasado).reverse();
  const item = (e, pasado) => `<a class="tarjeta evento-item ${pasado ? 'pasado' : ''}" href="#/evento/${e.id}">
      <div class="evento-fecha"><span class="dia">${e.fecha_inicio ? fecha(e.fecha_inicio, { day: 'numeric' }) : '–'}</span><span class="mes">${e.fecha_inicio ? fecha(e.fecha_inicio, { month: 'short' }) : ''}</span></div>
      <div class="crece"><div class="titulo"><strong>${esc(e.nombre)}</strong></div><div class="sub peq">${rangoFechas(e.fecha_inicio, e.fecha_fin)}</div>
      ${e.autoapuntarse && !pasado ? '<span class="chip amarillo">Apúntate</span>' : ''}${e.estado === 'cerrado' ? '<span class="chip borde">Cerrado</span>' : ''}</div>
      <span style="font-size:1.5rem">›</span></a>`;
  main.innerHTML = `
    <div class="fila entre"><h1>Eventos</h1>${S.esAdmin ? '<a class="btn principal peq" href="#/evento/nuevo">＋ Nuevo</a>' : ''}</div>
    ${S.esAdmin ? '<p class="sub">Para una cuota, multa o derrama sin evento: <a href="#/admin/cargos">Admin → Cargos sueltos</a>.</p>' : ''}
    ${proximos.length ? proximos.map(e => item(e, false)).join('') : '<div class="vacio"><span class="grande">🎉</span>No hay eventos próximos.</div>'}
    ${pasados.length ? `<p class="seccion-titulo">Pasados</p>${pasados.map(e => item(e, true)).join('')}` : ''}`;
  return 'Eventos';
}

// ---------- Detalle ----------
export async function detalle(main, { id }) {
  id = Number(id);
  const consultas = [
    sb.from('events').select('*').eq('id', id).maybeSingle(),
    sb.from('purchase_items').select('*, profiles(apodo)').eq('event_id', id).order('creado_en'),
    sb.from('event_participants').select('user_id, importe_manual_cents, profiles(apodo, foto_url, activo)').eq('event_id', id),
    sb.from('event_tasks').select('*, task_assignees(user_id, profiles(apodo))').eq('event_id', id).order('fecha', { nullsFirst: false }),
    sb.from('charges').select('*, events(nombre), profiles!charges_user_id_fkey(apodo)').eq('event_id', id).neq('estado', 'anulado'),
    sb.from('tickets').select('id, user_id, task_id, concepto, importe_cents, estado').eq('event_id', id),
  ];
  const [evR, compraR, partR, tareasR, cargosR, ticketsR] = await Promise.all(consultas);
  if (evR.error) throw evR.error;
  const ev = evR.data;
  if (!ev) { main.innerHTML = '<div class="vacio"><span class="grande">🤷</span>Este evento no existe.</div>'; return; }
  const compra = compraR.data || [], part = (partR.data || []).filter(p => p.profiles), tareas = tareasR.data || [];
  const cargos = cargosR.data || [], tickets = ticketsR.data || [];
  const miCargo = cargos.find(c => c.user_id === S.uid);
  const participo = part.some(p => p.user_id === S.uid);
  const total = compra.reduce((s, i) => s + i.total_cents, 0);
  const nActivos = part.filter(p => p.profiles.activo).length;
  const parte = ev.modo_reparto === 'igual' ? (nActivos ? Math.floor(total / nActivos) : 0)
    : ev.modo_reparto === 'fijo' ? (ev.importe_fijo_cents || 0) : null;
  const abierto = ev.estado === 'abierto';
  const cargoPorUsuario = Object.fromEntries(cargos.map(c => [c.user_id, c]));

  main.innerHTML = `
    ${ev.portada_url ? imgFoto('portadas', ev.portada_url, 'portada', false) : ''}
    <div class="fila entre envolver"><h1 class="crece">${esc(ev.nombre)}</h1>${S.esAdmin ? `<a class="btn peq" href="#/evento/${id}/editar">✏️ Editar</a>` : ''}</div>
    <p class="sub">📅 ${rangoFechas(ev.fecha_inicio, ev.fecha_fin)}${ev.estado === 'cerrado' ? ' · <span class="chip borde">Cerrado</span>' : ''}</p>
    ${ev.descripcion ? `<p style="white-space:pre-line">${esc(ev.descripcion)}</p>` : ''}

    ${miCargo ? `<section class="tarjeta ${miCargo.estado === 'pagado' ? 'al-dia' : 'debe'}">
        <div class="fila entre"><div><div class="sub peq">Tu parte</div><div class="total-grande">${eur(miCargo.importe_cents)}</div></div>${chipCargo(miCargo)}</div>
        ${ev.fecha_limite_pago && miCargo.estado === 'sin_pagar' ? `<p class="sub">Antes del ${fecha(ev.fecha_limite_pago)}</p>` : ''}
        <div class="botones">${miCargo.estado === 'sin_pagar' ? '<button class="btn principal" id="b-pagar">Pagar mi parte</button>' : ''}<button class="btn fantasma" id="b-vercargo">Ver detalle</button></div>
      </section>` : participo ? `<section class="tarjeta"><p class="sub">Estás apuntado. Tu parte aparecerá aquí cuando ${esc(S.config.admin_nombre || 'Sergio')} cierre las cuentas.</p></section>` : ''}

    ${ev.autoapuntarse && abierto && !(miCargo && miCargo.estado !== 'sin_pagar') ? `<div class="botones" style="margin-bottom:1rem">
        ${participo ? '<button class="btn fantasma" id="b-desapuntar">Me desapunto</button>' : '<button class="btn principal bloque" id="b-apuntar">🙋 Me apunto</button>'}</div>` : ''}

    <section class="tarjeta">
      <div class="fila entre"><h2>🛒 Lista de la compra</h2>${S.esAdmin ? '<button class="btn peq" id="b-item">＋ Añadir</button>' : ''}</div>
      ${compra.length ? `<table class="tabla"><thead><tr><th>Concepto</th><th class="num">Total</th><th></th></tr></thead><tbody>
        ${compra.map(i => `<tr data-item="${i.id}">
          <td><div class="${i.comprado ? '' : ''}">${i.comprado ? '✅' : '⬜'} ${esc(i.concepto)}</div>
            <div class="sub peq">${Number(i.cantidad) !== 1 ? `${String(i.cantidad).replace('.', ',')} × ${eur(i.precio_unitario_cents)}` : ''}${i.profiles?.apodo ? (Number(i.cantidad) !== 1 ? ' · ' : '') + 'Compra: ' + esc(i.profiles.apodo) : ''}</div></td>
          <td class="num"><strong>${eur(i.total_cents)}</strong></td>
          <td style="width:52px">${imgFoto('tickets', i.ticket_url)}</td></tr>`).join('')}
        </tbody><tfoot><tr><td><strong>Total del evento</strong></td><td class="num"><strong>${eur(total)}</strong></td><td></td></tr></tfoot></table>`
      : '<p class="sub">Todavía no hay nada apuntado.</p>'}
    </section>

    <section class="tarjeta">
      <h2>➗ Reparto</h2>
      <p>${MODOS[ev.modo_reparto]}${ev.modo_reparto !== 'manual' ? `: <strong>${eur(parte)}</strong> por persona` : ''}</p>
      <p class="sub">${nActivos} participante${nActivos === 1 ? '' : 's'}${ev.modo_reparto === 'igual' && nActivos && total % nActivos ? ' · los céntimos que sobran los pone el bote' : ''}</p>
      ${S.esAdmin ? `${pista('admin-reparto', 'Cuando la compra y los participantes estén listos, pulsa «Guardar reparto» para que a cada uno le aparezca lo que debe. Puedes repetirlo si cambia algo: lo ya pagado no se toca.')}
        <div class="botones"><button class="btn principal" id="b-reparto">💾 Guardar reparto y crear cargos</button><button class="btn" id="b-part">👥 Participantes</button></div>` : ''}
    </section>

    <section class="tarjeta">
      <h2>👥 Participantes</h2>
      ${part.length ? `<ul class="lista">${part.sort((a, b) => a.profiles.apodo.localeCompare(b.profiles.apodo)).map(p => {
        const cg = cargoPorUsuario[p.user_id];
        return `<li style="flex-wrap:wrap">${avatar(p.profiles)}<div class="crece"><span class="titulo ${p.profiles.activo ? '' : 'tachado'}">${esc(p.profiles.apodo)}</span>
          ${ev.modo_reparto === 'manual' && S.esAdmin ? `<div class="sub peq">A mano: ${p.importe_manual_cents != null ? eur(p.importe_manual_cents) : 'sin importe'}</div>` : ''}</div>
          ${S.esAdmin ? (cg ? `<div class="acciones-fila">${chipCargo(cg)}${cg.estado === 'pendiente' ? `<button class="btn verde peq" data-confirmar="${cg.id}">Confirmar</button>` : ''}${cg.estado === 'sin_pagar' ? `<button class="btn peq" data-amano="${cg.id}" title="Marcar pagado a mano">💵 Pagado</button>` : ''}</div>` : '<span class="chip borde">Sin cargo</span>')
            : (p.user_id === S.uid && cg ? chipCargo(cg) : '')}</li>`;
      }).join('')}</ul>` : '<p class="sub">Nadie apuntado todavía.</p>'}
    </section>

    <section class="tarjeta">
      <div class="fila entre"><h2>📋 Tareas y encargados</h2>${S.esAdmin ? '<button class="btn peq" id="b-tarea">＋ Tarea</button>' : ''}</div>
      ${tareas.length ? `<ul class="lista">${tareas.map(t => {
        const soyEnc = t.task_assignees.some(a => a.user_id === S.uid);
        const tks = tickets.filter(k => k.task_id === t.id);
        return `<li style="flex-wrap:wrap"><div class="crece">
          <div class="titulo">${t.estado === 'hecha' ? '✅' : '⬜'} ${esc(t.titulo)} ${soyEnc ? '<span class="chip amarillo">Tú</span>' : ''}</div>
          <div class="sub peq">${t.task_assignees.map(a => esc(a.profiles?.apodo)).join(', ') || 'Sin encargado'}${t.fecha ? ' · ' + fecha(t.fecha) : ''}${t.presupuesto_cents ? ' · máx. ' + eur(t.presupuesto_cents) : ''}</div>
          ${t.descripcion ? `<div class="sub peq">${esc(t.descripcion)}</div>` : ''}
          ${tks.length && (S.esAdmin || soyEnc) ? `<div class="peq" style="margin-top:.2rem">${tks.map(k => `🧾 ${eur(k.importe_cents)} ${chipTicket(k)}`).join(' ')}</div>` : ''}</div>
          ${soyEnc || S.esAdmin ? `<div class="botones" style="width:100%">
            ${t.estado === 'pendiente' ? `<button class="btn verde peq" data-hecha="${t.id}">✔ Hecha</button>` : `<button class="btn fantasma peq" data-deshacer="${t.id}">Marcar pendiente</button>`}
            ${soyEnc || S.esAdmin ? `<button class="btn peq" data-tticket="${t.id}" data-titulo="${esc(t.titulo)}">🧾 Subir ticket</button>` : ''}
            ${S.esAdmin ? `<button class="btn rojo peq" data-borrartarea="${t.id}">Borrar</button>` : ''}</div>` : ''}</li>`;
      }).join('')}</ul>` : '<p class="sub">No hay tareas.</p>'}
    </section>

    <button class="btn principal bloque" id="b-ticket">＋ Subir ticket de este evento</button>
    ${S.esAdmin && tickets.length ? `<p class="sub" style="text-align:center;margin-top:.8rem"><a href="#/admin/tickets?evento=${id}">Ver los ${tickets.length} tickets de este evento</a></p>` : ''}
  `;
  cargarFotos(main);
  activarPistas(main);

  // --- acciones de miembro ---
  $('#b-pagar', main)?.addEventListener('click', () => hojaPagar(miCargo));
  $('#b-vercargo', main)?.addEventListener('click', () => hojaCargo(miCargo));
  $('#b-ticket', main).onclick = () => hojaTicket({ eventId: id });
  $('#b-apuntar', main)?.addEventListener('click', e => conCarga(e.target, async () => {
    const { error } = await sb.rpc('apuntarme', { p_event_id: id, p_apuntar: true });
    if (error) return fallo(error);
    toast('¡Apuntado!'); refrescar();
  }));
  $('#b-desapuntar', main)?.addEventListener('click', async e => {
    if (!await confirmar('¿Seguro que te desapuntas?')) return;
    const { error } = await sb.rpc('apuntarme', { p_event_id: id, p_apuntar: false });
    if (error) return fallo(error);
    toast('Te has desapuntado'); refrescar();
  });
  $$('[data-hecha],[data-deshacer]', main).forEach(b => b.onclick = async () => {
    const hecha = !!b.dataset.hecha;
    const { error } = await sb.rpc('marcar_tarea', { p_task_id: Number(b.dataset.hecha || b.dataset.deshacer), p_hecha: hecha });
    if (error) return fallo(error);
    toast(hecha ? '¡Tarea hecha!' : 'Tarea pendiente'); refrescar();
  });
  $$('[data-tticket]', main).forEach(b => b.onclick = () => hojaTicket({ taskId: b.dataset.tticket, titulo: b.dataset.titulo, eventId: id }));

  if (!S.esAdmin) return ev.nombre;

  // --- acciones de administrador ---
  $('#b-item', main).onclick = () => hojaItem(id);
  $$('[data-item]', main).forEach(tr => tr.onclick = e => {
    if (e.target.closest('img')) return;
    hojaItem(id, compra.find(i => i.id === Number(tr.dataset.item)));
  });
  $('#b-reparto', main).onclick = e => conCarga(e.target, async () => {
    if (!part.length) { toast('Primero añade participantes', 'error'); return; }
    const { data, error } = await sb.rpc('guardar_reparto', { p_event_id: id });
    if (error) return fallo(error);
    const r = data || {};
    abrirHoja(`<h2>Reparto guardado</h2>
      <p>Total: <strong>${eur(r.total_cents)}</strong> · ${r.participantes} participantes${r.parte_cents != null ? ` · <strong>${eur(r.parte_cents)}</strong> cada uno` : ''}</p>
      <ul class="lista"><li>Cargos nuevos <span class="importe" style="margin-left:auto">${r.creados}</span></li>
      <li>Cargos actualizados <span class="importe" style="margin-left:auto">${r.actualizados}</span></li>
      <li>Cargos anulados <span class="importe" style="margin-left:auto">${r.anulados}</span></li></ul>
      ${r.pagados_con_otro_importe ? `<div class="info-caja">${r.pagados_con_otro_importe} persona(s) ya habían pagado o marcado el pago con otro importe. No se ha tocado: revísalo en Admin → Pagos.</div>` : ''}
      <button class="btn principal bloque" onclick="document.querySelector('#capa-hoja .cerrar').click()">Vale</button>`, { alCerrar: refrescar });
  });
  $('#b-part', main).onclick = () => hojaParticipantes(ev, part);
  $('#b-tarea', main).onclick = () => hojaTarea(id);
  $$('[data-borrartarea]', main).forEach(b => b.onclick = async () => {
    if (!await confirmar('¿Borrar esta tarea?', { si: 'Borrar', peligro: true })) return;
    const { error } = await sb.from('event_tasks').delete().eq('id', Number(b.dataset.borrartarea));
    if (error) return fallo(error);
    refrescar();
  });
  $$('[data-confirmar]', main).forEach(b => b.onclick = async () => {
    const { error } = await sb.rpc('confirmar_pago', { p_ids: [Number(b.dataset.confirmar)] });
    if (error) return fallo(error);
    toast('Pago confirmado'); refrescar();
  });
  $$('[data-amano]', main).forEach(b => b.onclick = async () => {
    if (!await confirmar('¿Marcar como pagado en efectivo / a mano?', { si: 'Marcar pagado' })) return;
    const { error } = await sb.rpc('confirmar_pago', { p_ids: [Number(b.dataset.amano)], p_metodo: 'efectivo' });
    if (error) return fallo(error);
    toast('Marcado como pagado'); refrescar();
  });
  return ev.nombre;
}

// Añadir / editar un artículo de la lista de la compra (admin)
async function hojaItem(eventId, item = null) {
  const gente = (await miembros()).filter(m => m.activo);
  const c = abrirHoja(`<h2>${item ? 'Editar' : 'Añadir'} a la compra</h2>
    <form id="f-item">
      <label>Concepto</label><input name="concepto" required maxlength="80" value="${esc(item?.concepto || '')}" placeholder="Cerveza (caja 24)">
      <div class="dos-col">
        <div><label>Cantidad</label><input name="cantidad" type="text" inputmode="decimal" value="${esc(String(item?.cantidad ?? 1).replace('.', ','))}" required></div>
        <div><label>Precio unidad (€)</label><input name="precio" type="text" inputmode="decimal" value="${esc(aEurosTexto(item?.precio_unitario_cents))}" required placeholder="15,99"></div>
      </div>
      <label>¿Quién lo compra? (opcional)</label>
      <select name="comprado_por"><option value="">—</option>${gente.map(m => `<option value="${m.id}" ${item?.comprado_por === m.id ? 'selected' : ''}>${esc(m.apodo)}</option>`).join('')}</select>
      <label class="check"><input type="checkbox" name="comprado" ${item?.comprado ? 'checked' : ''}> Ya está comprado</label>
      <label>Foto del ticket (opcional)</label><input name="foto" type="file" accept="image/*">
      ${item?.ticket_url ? `<p class="sub peq">Ya tiene ticket. Si subes otro, se cambia.</p>` : ''}
      <div class="botones">${item ? '<button type="button" class="btn rojo" id="b-borrar">Borrar</button>' : ''}<button class="btn principal" type="submit">Guardar</button></div>
    </form>`);
  const f = $('#f-item', c);
  f.onsubmit = e => {
    e.preventDefault();
    const cantidad = Number(String(f.cantidad.value).replace(',', '.'));
    const precio = aCentimos(f.precio.value);
    if (!(cantidad > 0) || precio === null) { toast('Revisa la cantidad y el precio', 'error'); return; }
    conCarga($('button[type=submit]', f), async () => {
      try {
        const fila = { event_id: eventId, concepto: f.concepto.value.trim(), cantidad, precio_unitario_cents: precio,
          comprado_por: f.comprado_por.value || null, comprado: f.comprado.checked };
        if (f.foto.files[0]) fila.ticket_url = await subirFoto('tickets', S.uid, f.foto.files[0]);
        const { error } = item ? await sb.from('purchase_items').update(fila).eq('id', item.id) : await sb.from('purchase_items').insert(fila);
        if (error) throw error;
        cerrarHoja(); toast('Guardado. Recuerda «Guardar reparto» si cambia el total'); refrescar();
      } catch (err) { fallo(err); }
    });
  };
  $('#b-borrar', c)?.addEventListener('click', async () => {
    if (!await confirmar(`¿Borrar «${item.concepto}» de la compra?`, { si: 'Borrar', peligro: true })) return;
    const { error } = await sb.from('purchase_items').delete().eq('id', item.id);
    if (error) return fallo(error);
    toast('Borrado'); refrescar();
  });
}

// Elegir participantes (y su importe si el reparto es manual)
async function hojaParticipantes(ev, part) {
  const gente = await miembros(true);
  const actuales = Object.fromEntries(part.map(p => [p.user_id, p]));
  const manual = ev.modo_reparto === 'manual';
  const c = abrirHoja(`<h2>Participantes</h2>
    <p class="sub">${manual ? 'Marca quién participa y cuánto paga cada uno.' : 'Marca quién participa.'} Los miembros inactivos no reciben cargos.</p>
    <div class="botones"><button type="button" class="btn peq" id="b-todos">Todos los activos</button><button type="button" class="btn peq fantasma" id="b-ninguno">Ninguno</button></div>
    <form id="f-part"><ul class="lista">${gente.map(m => `<li>
      <label class="check crece" style="margin:0"><input type="checkbox" name="u" value="${m.id}" ${actuales[m.id] ? 'checked' : ''} ${m.activo ? '' : 'data-inactivo'}>
        <span class="${m.activo ? '' : 'tachado'}">${esc(m.apodo)}</span></label>
      ${manual ? `<input type="text" inputmode="decimal" name="imp-${m.id}" placeholder="€" style="width:96px" value="${esc(aEurosTexto(actuales[m.id]?.importe_manual_cents))}">` : ''}</li>`).join('')}</ul>
    <div class="botones"><button class="btn principal bloque" type="submit">Guardar participantes</button></div></form>`);
  const f = $('#f-part', c);
  $('#b-todos', c).onclick = () => $$('input[name=u]', f).forEach(i => i.checked = !i.hasAttribute('data-inactivo'));
  $('#b-ninguno', c).onclick = () => $$('input[name=u]', f).forEach(i => i.checked = false);
  f.onsubmit = e => {
    e.preventDefault();
    conCarga($('button[type=submit]', f), async () => {
      try {
        const elegidos = $$('input[name=u]:checked', f).map(i => i.value);
        const quitar = part.map(p => p.user_id).filter(u => !elegidos.includes(u));
        if (quitar.length) {
          const { error } = await sb.from('event_participants').delete().eq('event_id', ev.id).in('user_id', quitar);
          if (error) throw error;
        }
        if (elegidos.length) {
          const filas = elegidos.map(u => ({ event_id: ev.id, user_id: u,
            importe_manual_cents: manual ? aCentimos(f.elements['imp-' + u]?.value) : (actuales[u]?.importe_manual_cents ?? null) }));
          const { error } = await sb.from('event_participants').upsert(filas, { onConflict: 'event_id,user_id' });
          if (error) throw error;
        }
        cerrarHoja(); toast('Participantes guardados. Pulsa «Guardar reparto» para actualizar los cargos'); refrescar();
      } catch (err) { fallo(err); }
    });
  };
}

// Nueva tarea con encargados (admin)
async function hojaTarea(eventId) {
  const gente = (await miembros()).filter(m => m.activo);
  const c = abrirHoja(`<h2>Nueva tarea</h2><form id="f-tarea">
    <label>Tarea</label><input name="titulo" required maxlength="80" placeholder="Coger y poner bebidas">
    <label>Detalles (opcional)</label><textarea name="descripcion" placeholder="Hielo en el arcón, vasos en la barra…"></textarea>
    <div class="dos-col"><div><label>Presupuesto máx. (€)</label><input name="presupuesto" inputmode="decimal" placeholder="50"></div>
      <div><label>Fecha</label><input name="fecha" type="date"></div></div>
    <label>Encargados</label>
    <ul class="lista">${gente.map(m => `<li><label class="check" style="margin:0"><input type="checkbox" name="enc" value="${m.id}"> ${esc(m.apodo)}</label></li>`).join('')}</ul>
    <div class="botones"><button class="btn principal bloque" type="submit">Crear tarea</button></div></form>`);
  const f = $('#f-tarea', c);
  f.onsubmit = e => {
    e.preventDefault();
    const enc = $$('input[name=enc]:checked', f).map(i => i.value);
    if (!enc.length) { toast('Elige al menos un encargado', 'error'); return; }
    conCarga($('button[type=submit]', f), async () => {
      try {
        const { data, error } = await sb.from('event_tasks').insert({
          event_id: eventId, titulo: f.titulo.value.trim(), descripcion: f.descripcion.value.trim() || null,
          presupuesto_cents: aCentimos(f.presupuesto.value), fecha: f.fecha.value || null, creado_por: S.uid,
        }).select('id').single();
        if (error) throw error;
        const { error: e2 } = await sb.from('task_assignees').insert(enc.map(u => ({ task_id: data.id, user_id: u })));
        if (e2) throw e2;
        cerrarHoja(); toast('Tarea creada'); refrescar();
      } catch (err) { fallo(err); }
    });
  };
}

// ---------- Crear / editar evento (admin) ----------
export async function editar(main, { id }) {
  if (!S.esAdmin) { ir('#/eventos'); return; }
  let ev = { nombre: '', descripcion: '', modo_reparto: 'igual', estado: 'abierto', autoapuntarse: false };
  if (id) {
    const { data, error } = await sb.from('events').select('*').eq('id', Number(id)).single();
    if (error) throw error;
    ev = data;
  }
  main.innerHTML = `<h1>${id ? 'Editar evento' : 'Nuevo evento'}</h1>
    <form id="f-ev" class="tarjeta">
      <label>Nombre</label><input name="nombre" required maxlength="80" value="${esc(ev.nombre)}" placeholder="Fiestas San Lorenzo 2027">
      <label>Descripción (opcional)</label><textarea name="descripcion">${esc(ev.descripcion || '')}</textarea>
      <div class="dos-col"><div><label>Empieza</label><input type="date" name="fecha_inicio" value="${ev.fecha_inicio || ''}"></div>
        <div><label>Termina (opcional)</label><input type="date" name="fecha_fin" value="${ev.fecha_fin || ''}"></div></div>
      <label>Fecha límite para pagar (opcional)</label><input type="date" name="fecha_limite_pago" value="${ev.fecha_limite_pago || ''}">
      <label>Cómo se reparte</label>
      ${Object.entries(MODOS).map(([k, v]) => `<label class="check"><input type="radio" name="modo_reparto" value="${k}" ${ev.modo_reparto === k ? 'checked' : ''}> ${v}</label>`).join('')}
      <div id="caja-fijo" ${ev.modo_reparto === 'fijo' ? '' : 'hidden'}><label>Importe por persona (€)</label><input name="importe_fijo" inputmode="decimal" value="${esc(aEurosTexto(ev.importe_fijo_cents))}"></div>
      <label class="check"><input type="checkbox" name="autoapuntarse" ${ev.autoapuntarse ? 'checked' : ''}> Los miembros se apuntan ellos con «Me apunto»</label>
      ${!id ? '<label class="check"><input type="checkbox" name="todos" checked> Apuntar ya a todos los miembros activos</label>' : ''}
      ${id ? `<label class="check"><input type="checkbox" name="cerrado" ${ev.estado === 'cerrado' ? 'checked' : ''}> Evento cerrado (ya no se apunta nadie)</label>` : ''}
      <label>Foto de portada (opcional)</label><input type="file" name="portada" accept="image/*">
      <div class="botones">${id ? `<button type="button" class="btn rojo" id="b-borrar">Borrar evento</button>` : ''}<button class="btn principal" type="submit">${id ? 'Guardar' : 'Crear evento'}</button></div>
    </form>`;
  const f = $('#f-ev', main);
  $$('input[name=modo_reparto]', f).forEach(r => r.onchange = () => { $('#caja-fijo', f).hidden = f.modo_reparto.value !== 'fijo'; });
  f.onsubmit = e => {
    e.preventDefault();
    const fijo = aCentimos(f.importe_fijo.value);
    if (f.modo_reparto.value === 'fijo' && !fijo) { toast('Pon el importe por persona', 'error'); return; }
    if (f.fecha_fin.value && f.fecha_inicio.value && f.fecha_fin.value < f.fecha_inicio.value) { toast('La fecha de fin es anterior al inicio', 'error'); return; }
    conCarga($('button[type=submit]', f), async () => {
      try {
        const fila = {
          nombre: f.nombre.value.trim(), descripcion: f.descripcion.value.trim() || null,
          fecha_inicio: f.fecha_inicio.value || null, fecha_fin: f.fecha_fin.value || null,
          fecha_limite_pago: f.fecha_limite_pago.value || null, modo_reparto: f.modo_reparto.value,
          importe_fijo_cents: f.modo_reparto.value === 'fijo' ? fijo : null, autoapuntarse: f.autoapuntarse.checked,
          estado: f.cerrado?.checked ? 'cerrado' : 'abierto',
        };
        if (f.portada.files[0]) fila.portada_url = await subirFoto('portadas', 'eventos', f.portada.files[0]);
        let eventId = Number(id);
        if (id) {
          const { error } = await sb.from('events').update(fila).eq('id', eventId);
          if (error) throw error;
        } else {
          const { data, error } = await sb.from('events').insert(fila).select('id').single();
          if (error) throw error;
          eventId = data.id;
          if (f.todos.checked) {
            const activos = (await miembros(true)).filter(m => m.activo);
            if (activos.length) {
              const { error: e2 } = await sb.from('event_participants').insert(activos.map(m => ({ event_id: eventId, user_id: m.id })));
              if (e2) throw e2;
            }
          }
        }
        toast(id ? 'Evento guardado' : 'Evento creado. Ahora añade la compra');
        ir('#/evento/' + eventId);
      } catch (err) { fallo(err); }
    });
  };
  $('#b-borrar', main)?.addEventListener('click', async () => {
    if (!await confirmar(`¿Borrar «${ev.nombre}»? Se borran su compra, tareas y participantes. Los cargos se quedan sin evento.`, { si: 'Borrar', peligro: true })) return;
    const { error } = await sb.from('events').delete().eq('id', Number(id));
    if (error) return fallo(error);
    toast('Evento borrado'); ir('#/eventos');
  });
  return id ? 'Editar' : 'Nuevo evento';
}
