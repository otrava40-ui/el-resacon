// Pantalla de Inicio: lo que debo, mis encargos, próximo evento y lo que suena
import { sb } from '../supa.js';
import { S, cfg } from '../estado.js';
import { $, esc, eur, fecha, fechaHora, hoyISO, rangoFechas, pista, activarPistas, dispositivo, fallo, toast, cargarFotos } from '../util.js';
import { lineaCargo, activarCargos, hojaTicket } from './comun.js';
import { refrescar } from '../nav.js';
import { suscribir } from '../push.js';

export async function vista(main) {
  const hoy = hoyISO();
  const [cargosR, tareasR, eventoR, suenaR, comprasR] = await Promise.all([
    sb.from('charges').select('*, events(nombre)').eq('user_id', S.uid).in('estado', ['sin_pagar', 'pendiente']).order('fecha_limite', { nullsFirst: false }),
    sb.from('task_assignees').select('event_tasks(id, titulo, descripcion, fecha, estado, presupuesto_cents, event_id, events(nombre))').eq('user_id', S.uid),
    sb.from('events').select('id, nombre, fecha_inicio, fecha_fin').eq('estado', 'abierto').or(`fecha_fin.gte.${hoy},and(fecha_fin.is.null,fecha_inicio.gte.${hoy})`).order('fecha_inicio').limit(1),
    sb.from('now_playing').select('*').maybeSingle(),
    sb.from('purchase_items').select('id, concepto, event_id, events(nombre)').eq('comprado_por', S.uid).eq('comprado', false),
  ]);
  if (cargosR.error) throw cargosR.error;
  const cargos = cargosR.data || [];
  const sinPagar = cargos.filter(c => c.estado === 'sin_pagar');
  const pendientes = cargos.filter(c => c.estado === 'pendiente');
  const total = sinPagar.reduce((s, c) => s + c.importe_cents, 0);
  const tareas = (tareasR.data || []).map(r => r.event_tasks).filter(t => t && t.estado === 'pendiente')
    .sort((a, b) => (a.fecha || '9999').localeCompare(b.fecha || '9999'));
  const compras = comprasR.data || [];
  const proximo = eventoR.data?.[0];
  const suena = suenaR.data;
  const suenaReciente = suena?.titulo && (Date.now() - new Date(suena.actualizado_en).getTime() < 15 * 60 * 1000);

  const avisosOff = 'Notification' in window ? Notification.permission !== 'granted' : !dispositivo().enApp;

  main.innerHTML = `
    <h1>Hola, ${esc(S.perfil.apodo)} 👋</h1>
    ${avisosOff ? bannerAvisos() : ''}
    ${sinPagar.length ? `
      <section class="tarjeta debe">
        <h2>💶 Te toca pagar</h2>
        <div class="total-grande">${eur(total)}</div>
        ${pista('inicio-pagar', 'Pulsa «Pagar» y te explicamos cómo pagar al bote en un momento.')}
        <ul class="lista" id="l-cargos">${sinPagar.map(c => lineaCargo(c)).join('')}</ul>
      </section>` : `
      <section class="tarjeta al-dia"><h2>✅ Estás al día</h2><p class="sub">No debes nada al bote. ¡Así da gusto!</p></section>`}
    ${pendientes.length ? `
      <section class="tarjeta"><h2>⏳ Esperando confirmación</h2>
        <p class="sub">${esc(cfg('admin_nombre', 'Sergio'))} tiene que comprobarlo en el bote.</p>
        <ul class="lista" id="l-pend">${pendientes.map(c => lineaCargo(c, { boton: false })).join('')}</ul></section>` : ''}
    ${tareas.length || compras.length ? `
      <section class="tarjeta destacada"><h2>📋 Mis encargos</h2>
        ${pista('inicio-encargos', 'Eres encargado: cuando lo tengas, márcalo como hecho y sube el ticket si has pagado algo.')}
        <ul class="lista">${tareas.map(t => `<li style="flex-wrap:wrap">
          <div class="crece"><div class="titulo">${esc(t.titulo)}</div>
            <div class="sub peq"><a href="#/evento/${t.event_id}">${esc(t.events?.nombre || '')}</a>${t.fecha ? ' · ' + fecha(t.fecha) : ''}${t.presupuesto_cents ? ' · máx. ' + eur(t.presupuesto_cents) : ''}</div></div>
          <div class="botones" style="width:100%"><button class="btn verde peq" data-hecha="${t.id}">✔ Marcar como hecha</button>
            <button class="btn peq" data-ticket="${t.id}" data-titulo="${esc(t.titulo)}">🧾 Subir ticket</button></div></li>`).join('')}
          ${compras.map(i => `<li style="flex-wrap:wrap">
          <div class="crece"><div class="titulo">🛒 ${esc(i.concepto)}</div>
            <div class="sub peq">Te toca comprarlo · <a href="#/evento/${i.event_id}">${esc(i.events?.nombre || '')}</a></div></div>
          <div class="botones" style="width:100%"><button class="btn verde peq" data-comprado="${i.id}">✔ Ya lo he comprado</button>
            <button class="btn peq" data-cticket="${i.event_id}" data-titulo="${esc(i.concepto)}">🧾 Subir ticket</button></div></li>`).join('')}</ul></section>` : ''}
    <button class="btn principal bloque" id="b-ticket" style="margin-bottom:1rem">＋ Subir ticket</button>
    ${proximo ? `
      <a class="tarjeta evento-item" href="#/evento/${proximo.id}" style="display:flex">
        <div class="evento-fecha"><span class="dia">${proximo.fecha_inicio ? fecha(proximo.fecha_inicio, { day: 'numeric' }) : '?'}</span><span class="mes">${proximo.fecha_inicio ? fecha(proximo.fecha_inicio, { month: 'short' }) : ''}</span></div>
        <div class="crece"><div class="sub peq">Próximo evento</div><div class="titulo"><strong>${esc(proximo.nombre)}</strong></div><div class="sub peq">${rangoFechas(proximo.fecha_inicio, proximo.fecha_fin)}</div></div>
        <span style="font-size:1.5rem">›</span></a>` : ''}
    ${suenaReciente ? `
      <a class="tarjeta fila" href="#/musica" style="text-decoration:none">
        ${suena.portada_url ? `<img class="miniatura" src="${esc(suena.portada_url)}" alt="">` : '<span class="miniatura" style="display:grid;place-items:center;font-size:1.4rem">🎵</span>'}
        <div class="crece"><div class="sub peq">Ahora suena en el local</div><div class="titulo"><strong>${esc(suena.titulo)}</strong></div><div class="sub peq">${esc(suena.artista || '')}</div></div>
        <span style="font-size:1.5rem">›</span></a>` : ''}
    ${S.esAdmin ? `
      <a class="tarjeta fila" href="#/admin" style="text-decoration:none">
        <div class="crece"><div class="sub peq">Saldo del bote (solo lo ves tú)</div><div class="total-grande" style="font-size:1.6rem">${eur(Number(cfg('saldo_bote_cents', '0')))}</div>
        <div class="sub peq">${cfg('saldo_actualizado_en') ? 'Actualizado ' + fechaHora(cfg('saldo_actualizado_en')) : 'Actualízalo en Admin → Ajustes'}</div></div><span style="font-size:1.5rem">›</span></a>` : ''}
  `;
  activarPistas(main);
  if ($('#l-cargos', main)) activarCargos($('#l-cargos', main), sinPagar);
  if ($('#l-pend', main)) activarCargos($('#l-pend', main), pendientes);
  $('#b-ticket', main).onclick = () => hojaTicket({ eventId: proximo?.id });
  main.querySelectorAll('[data-hecha]').forEach(b => b.onclick = async () => {
    const { error } = await sb.rpc('marcar_tarea', { p_task_id: Number(b.dataset.hecha), p_hecha: true });
    if (error) return fallo(error);
    toast('¡Encargo hecho!'); refrescar();
  });
  main.querySelectorAll('[data-ticket]').forEach(b => b.onclick = () => hojaTicket({ taskId: b.dataset.ticket, titulo: b.dataset.titulo }));
  main.querySelectorAll('[data-cticket]').forEach(b => b.onclick = () => hojaTicket({ eventId: b.dataset.cticket, titulo: b.dataset.titulo }));
  main.querySelectorAll('[data-comprado]').forEach(b => b.onclick = async () => {
    const { error } = await sb.rpc('marcar_comprado', { p_item_id: Number(b.dataset.comprado), p_comprado: true });
    if (error) return fallo(error);
    toast('¡Apuntado como comprado!'); refrescar();
  });
  $('#b-avisos', main)?.addEventListener('click', () => activarAvisos());
  cargarFotos(main);
  return 'Inicio';
}

function bannerAvisos() {
  const d = dispositivo();
  if (d.ios && !d.enApp) {
    return `<div class="info-caja">🔔 Para recibir avisos en iPhone, primero <a href="#/instalar?ver=iphone">añade la app a la pantalla de inicio</a>.</div>`;
  }
  if (!('Notification' in window) || Notification.permission === 'denied') {
    return Notification?.permission === 'denied'
      ? '<div class="info-caja">🔕 Tienes los avisos bloqueados. Actívalos en los ajustes del navegador para esta web.</div>' : '';
  }
  return `<div class="info-caja fila entre envolver"><span>🔔 Activa los avisos para enterarte de lo que debes y de los eventos.</span>
    <button class="btn principal peq" id="b-avisos">Activar avisos</button></div>`;
}

// Pide permiso de notificaciones (solo al pulsar el botón). En la fase 2
// la app registrará este móvil para mandarle los avisos.
export async function activarAvisos(repintar = true) {
  try {
    const r = await Notification.requestPermission();
    if (r === 'granted') {
      await suscribir();
      toast('¡Avisos activados en este móvil!');
    } else toast('No se han activado los avisos', 'error');
    if (repintar) refrescar();
    return r;
  } catch (e) { fallo(e); }
}
