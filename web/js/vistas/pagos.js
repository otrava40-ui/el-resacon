// Mis pagos: Pendientes · Pagados · Mis tickets
import { sb } from '../supa.js';
import { S } from '../estado.js';
import { $, $$, esc, eur, fecha, hoyISO, chipTicket, METODOS, imgFoto, cargarFotos, abrirHoja, cerrarHoja, toast, fallo,
         confirmar, aCentimos, aEurosTexto, conCarga, pista, activarPistas } from '../util.js';
import { lineaCargo, activarCargos, hojaTicket } from './comun.js';
import { refrescar } from '../nav.js';

export async function vista(main, { tab = 'pendientes' }) {
  const pest = [['pendientes', 'Pendientes'], ['pagados', 'Pagados'], ['tickets', 'Mis tickets']];
  const cab = `<h1>Mis pagos</h1><div class="pestanas">${pest.map(([k, v]) => `<a href="#/pagos/${k}" class="${tab === k ? 'activa' : ''}">${v}</a>`).join('')}</div>`;

  if (tab === 'tickets') return misTickets(main, cab);

  const { data, error } = await sb.from('charges').select('*, events(nombre)').eq('user_id', S.uid).order('creado_en', { ascending: false });
  if (error) throw error;
  const cargos = data || [];
  const anio = hoyISO().slice(0, 4);
  const pagadoAnio = cargos.filter(c => c.estado === 'pagado' && (c.confirmado_en || c.creado_en || '').slice(0, 4) === anio)
    .reduce((s, c) => s + c.importe_cents, 0);

  if (tab === 'pagados') {
    const lista = cargos.filter(c => c.estado === 'pagado' || c.estado === 'anulado');
    main.innerHTML = `${cab}
      <div class="tarjeta"><div class="sub peq">Pagado en ${anio}</div><div class="total-grande">${eur(pagadoAnio)}</div></div>
      ${lista.length ? `<div class="tarjeta"><ul class="lista pulsable" id="l">${lista.map(c => lineaCargo(c, { boton: false })).join('')}</ul></div>`
        : '<div class="vacio"><span class="grande">🧾</span>Todavía no has pagado nada.</div>'}`;
    if (lista.length) activarCargos($('#l', main), lista);
    return 'Mis pagos';
  }

  const lista = cargos.filter(c => c.estado === 'sin_pagar' || c.estado === 'pendiente')
    .sort((a, b) => (a.estado === b.estado ? (a.fecha_limite || '9999').localeCompare(b.fecha_limite || '9999') : a.estado === 'sin_pagar' ? -1 : 1));
  const total = lista.filter(c => c.estado === 'sin_pagar').reduce((s, c) => s + c.importe_cents, 0);
  main.innerHTML = `${cab}
    ${lista.length ? `
      <div class="tarjeta ${total ? 'debe' : ''}"><div class="sub peq">Te falta por pagar</div><div class="total-grande">${eur(total)}</div></div>
      ${pista('pagos-lista', 'Toca cualquier línea para ver el detalle y el historial del pago.')}
      <div class="tarjeta"><ul class="lista pulsable" id="l">${lista.map(c => lineaCargo(c)).join('')}</ul></div>`
    : '<div class="tarjeta al-dia"><h2>✅ Estás al día</h2><p class="sub">No tienes nada pendiente.</p></div>'}
    <p class="sub" style="text-align:center">Pagado en ${anio}: <strong>${eur(pagadoAnio)}</strong></p>`;
  activarPistas(main);
  if (lista.length) activarCargos($('#l', main), lista);
  return 'Mis pagos';
}

async function misTickets(main, cab) {
  const { data, error } = await sb.from('tickets').select('*, events(nombre), event_tasks(titulo)').eq('user_id', S.uid).order('creado_en', { ascending: false });
  if (error) throw error;
  const tks = data || [];
  const porDevolver = tks.filter(t => t.estado === 'enviado' || t.estado === 'aprobado').reduce((s, t) => s + t.importe_cents, 0);
  main.innerHTML = `${cab}
    <button class="btn principal bloque" id="b-nuevo" style="margin-bottom:1rem">＋ Subir ticket</button>
    ${porDevolver ? `<div class="tarjeta"><div class="sub peq">Pendiente de que te devuelvan</div><div class="total-grande">${eur(porDevolver)}</div></div>` : ''}
    ${tks.length ? `<div class="tarjeta"><ul class="lista pulsable">${tks.map(t => `<li data-t="${t.id}">
        ${imgFoto('tickets', t.foto_url)}
        <div class="crece"><div class="titulo">${esc(t.concepto)}</div>
          <div class="sub peq">${fecha(t.creado_en)}${t.events ? ' · ' + esc(t.events.nombre) : ''}${t.event_tasks ? ' · ' + esc(t.event_tasks.titulo) : ''}</div>
          <div style="margin-top:.25rem">${chipTicket(t)}</div>
          ${t.estado === 'rechazado' && t.motivo_rechazo ? `<div class="sub peq rojo-texto">${esc(t.motivo_rechazo)}</div>` : ''}</div>
        <div class="importe">${eur(t.importe_cents)}</div></li>`).join('')}</ul></div>`
      : '<div class="vacio"><span class="grande">🧾</span>No has subido ningún ticket.</div>'}`;
  cargarFotos(main);
  $('#b-nuevo', main).onclick = () => hojaTicket();
  $$('[data-t]', main).forEach(li => li.onclick = () => hojaMiTicket(tks.find(t => t.id === Number(li.dataset.t))));
  return 'Mis pagos';
}

function hojaMiTicket(t) {
  const editable = t.estado === 'enviado';
  const c = abrirHoja(`<h2>${esc(t.concepto)}</h2>
    <div class="fila entre"><div class="total-grande">${eur(t.importe_cents)}</div>${chipTicket(t)}</div>
    ${imgFoto('tickets', t.foto_url, 'foto-ticket')}
    <p class="sub">Subido el ${fecha(t.creado_en)}${t.events ? ' · ' + esc(t.events.nombre) : ''}</p>
    <p class="sub">Cobro: ${esc(METODOS[t.metodo_cobro] || '—')} ${t.dato_cobro ? '· ' + esc(t.dato_cobro) : ''}</p>
    ${t.estado === 'reembolsado' ? `<div class="ok-caja">${t.compensado_charge_id ? 'Se ha descontado de lo que debías.' : 'Te lo han devuelto el ' + fecha(t.reembolsado_en) + '.'}</div>` : ''}
    ${t.estado === 'rechazado' ? `<div class="error-caja">Rechazado: ${esc(t.motivo_rechazo || '')}</div>` : ''}
    ${editable ? `<form id="f-ed"><p class="seccion-titulo">Corregir (solo mientras está «Enviado»)</p>
      <div class="dos-col"><div><label>Importe (€)</label><input name="importe" inputmode="decimal" value="${aEurosTexto(t.importe_cents)}"></div>
      <div><label>Concepto</label><input name="concepto" value="${esc(t.concepto)}" maxlength="80"></div></div>
      <div class="botones"><button type="button" class="btn rojo" id="b-borrar">Borrar ticket</button><button class="btn principal" type="submit">Guardar</button></div></form>` : ''}`);
  cargarFotos(c);
  const f = $('#f-ed', c);
  if (!f) return;
  f.onsubmit = e => {
    e.preventDefault();
    const cents = aCentimos(f.importe.value);
    if (!cents) { toast('Importe no válido', 'error'); return; }
    conCarga($('button[type=submit]', f), async () => {
      const { error } = await sb.from('tickets').update({ importe_cents: cents, concepto: f.concepto.value.trim() }).eq('id', t.id);
      if (error) return fallo(error);
      cerrarHoja(); toast('Ticket corregido'); refrescar();
    });
  };
  $('#b-borrar', c).onclick = async () => {
    if (!await confirmar('¿Borrar este ticket?', { si: 'Borrar', peligro: true })) return;
    const { error } = await sb.from('tickets').delete().eq('id', t.id);
    if (error) return fallo(error);
    if (t.foto_url) await sb.storage.from('tickets').remove([t.foto_url]);
    toast('Ticket borrado'); refrescar();
  };
}
