// Hojas compartidas: pagar un cargo, ver un cargo y subir un ticket
import { sb } from '../supa.js';
import { S, cfg, cfgSi } from '../estado.js';
import { $, esc, eur, fecha, fechaHora, chipCargo, ESTADO_CARGO, METODOS, abrirHoja, cerrarHoja, toast, fallo,
         copiable, activarCopiar, copiar, subirFoto, conCarga, aCentimos, imgFoto, cargarFotos, vencido } from '../util.js';
import { refrescar } from '../nav.js';

// Concepto para la transferencia: PEÑA · <Evento> · <Apodo> (máx. 35 caracteres)
export function conceptoPago(cargo) {
  const apodo = (S.perfil?.apodo || '').trim() + (cargo.guest_id ? ' +1' : '');
  const evento = (cargo.events?.nombre || cargo.concepto || '').trim();
  let texto = `PEÑA · ${evento} · ${apodo}`;
  if (texto.length > 35) {
    const sitio = 35 - `PEÑA ·  · ${apodo}`.length;
    texto = sitio >= 4 ? `PEÑA · ${evento.slice(0, sitio - 1).trim()}… · ${apodo}` : texto.slice(0, 35);
  }
  return texto.slice(0, 35);
}

// Enlace de Revolut con el importe si el enlace lo admite: si Sergio pone
// {importe} en el enlace (p. ej. https://revolut.me/sergio/{importe}), se
// sustituye por 25.50. Si no, se abre el enlace tal cual.
export function enlaceRevolut(cents) {
  const base = cfg('revolut_enlace').trim();
  if (!base) return '';
  const imp = (cents / 100).toFixed(2);
  return base.includes('{importe}') ? base.replaceAll('{importe}', imp) : base;
}

// ---------- Hoja «Pagar» ----------
export function hojaPagar(cargo) {
  const concepto = conceptoPago(cargo);
  const revolut = enlaceRevolut(cargo.importe_cents);
  const iban = cfg('iban').trim(), titular = cfg('titular').trim();
  const bizum = cfgSi('bizum_activo') ? cfg('bizum_numero').trim() : '';
  const admin = cfg('admin_nombre', 'Sergio');
  const sinDatos = !revolut && !iban && !bizum;

  const c = abrirHoja(`
    <h2>Pagar ${esc(cargo.concepto || cargo.events?.nombre)}</h2>
    <div class="total-grande">${eur(cargo.importe_cents)}</div>
    ${cargo.fecha_limite ? `<p class="${vencido(cargo.fecha_limite) ? 'rojo-texto' : 'sub'}">Fecha límite: ${fecha(cargo.fecha_limite)}</p>` : ''}
    <p class="seccion-titulo">1 · Copia el concepto</p>
    ${copiable(concepto)}
    <p class="ayuda">Ponlo en el concepto del pago para que ${esc(admin)} sepa que es tuyo.</p>
    <p class="seccion-titulo">2 · Paga al bote como prefieras</p>
    ${sinDatos ? `<div class="info-caja">${esc(admin)} todavía no ha puesto los datos de pago. Pregúntale o paga en mano.</div>` : ''}
    ${revolut ? `<div class="tarjeta" style="margin-bottom:.6rem"><h3>Revolut</h3>
       <p class="sub">Con la app de Revolut o con tarjeta. ${revolut.includes(String((cargo.importe_cents / 100).toFixed(2))) ? '' : 'Escribe tú el importe.'}</p>
       <a class="btn principal bloque" href="${esc(revolut)}" target="_blank" rel="noopener" data-metodo="revolut">Abrir Revolut</a></div>` : ''}
    ${iban ? `<div class="tarjeta" style="margin-bottom:.6rem"><h3>Transferencia</h3>
       <label>IBAN</label>${copiable(iban.replace(/\s+/g, ' '))}
       ${titular ? `<label>Titular</label>${copiable(titular)}` : ''}</div>` : ''}
    ${bizum ? `<div class="tarjeta" style="margin-bottom:.6rem"><h3>Bizum</h3>
       <p class="sub">Al número de ${esc(admin)}:</p>${copiable(bizum)}</div>` : ''}
    <p class="seccion-titulo">3 · Cuando hayas pagado</p>
    <form id="f-pagado">
      <label for="metodo">¿Cómo has pagado?</label>
      <select id="metodo" name="metodo">
        ${revolut ? '<option value="revolut">Revolut</option>' : ''}
        ${iban ? '<option value="transferencia">Transferencia</option>' : ''}
        ${bizum ? '<option value="bizum">Bizum</option>' : ''}
        <option value="efectivo">En mano (efectivo)</option>
      </select>
      <label for="captura">Captura del pago (opcional)</label>
      <input id="captura" name="captura" type="file" accept="image/*">
      <div class="botones"><button class="btn verde bloque" type="submit">✅ Ya he pagado</button></div>
      <p class="ayuda">Quedará <strong>pendiente de confirmar</strong> hasta que ${esc(admin)} lo vea en el bote.</p>
    </form>`);
  activarCopiar(c);
  $('[data-metodo=revolut]', c)?.addEventListener('click', () => { copiar(concepto, 'Concepto copiado'); $('#metodo', c).value = 'revolut'; });
  const f = $('#f-pagado', c);
  f.onsubmit = e => {
    e.preventDefault();
    conCarga($('button[type=submit]', f), async () => {
      try {
        let ruta = null;
        const archivo = f.captura.files[0];
        if (archivo) ruta = await subirFoto('capturas', S.uid, archivo, `cargo-${cargo.id}-${Date.now()}`);
        const { error } = await sb.rpc('marcar_pagado', { p_charge_id: cargo.id, p_metodo: f.metodo.value, p_captura_url: ruta });
        if (error) throw error;
        cerrarHoja();
        toast('¡Hecho! Queda pendiente de confirmar');
        refrescar();
      } catch (err) { fallo(err); }
    });
  };
}

// ---------- Detalle de un cargo (con historial) ----------
export async function hojaCargo(cargo) {
  const c = abrirHoja('<div class="cargando"></div>');
  const { data: hist } = await sb.from('payment_events').select('*').eq('charge_id', cargo.id).order('creado_en');
  c.innerHTML = `
    <h2>${esc(cargo.concepto)}</h2>
    <div class="fila entre"><div class="total-grande">${eur(cargo.importe_cents)}</div>${chipCargo(cargo)}</div>
    ${cargo.events ? `<p class="sub">Evento: <a href="#/evento/${cargo.event_id}">${esc(cargo.events.nombre)}</a></p>` : ''}
    ${cargo.fecha_limite ? `<p class="sub">Fecha límite: ${fecha(cargo.fecha_limite)}</p>` : ''}
    ${cargo.metodo ? `<p class="sub">Forma de pago: ${esc(METODOS[cargo.metodo] || cargo.metodo)}</p>` : ''}
    ${cargo.motivo_rechazo && cargo.estado === 'sin_pagar' ? `<div class="error-caja"><strong>${esc(cfg('admin_nombre', 'Sergio'))} no encontró tu pago:</strong> ${esc(cargo.motivo_rechazo)}</div>` : ''}
    ${cargo.captura_url ? `<p class="sub">Tu captura:</p>${imgFoto('capturas', cargo.captura_url, 'foto-ticket')}` : ''}
    <p class="seccion-titulo">Historial</p>
    <ul class="lista">${(hist || []).map(h => `<li><div class="crece"><div>${h.de_estado ? esc(ESTADO_CARGO[h.de_estado]?.txt || h.de_estado) + ' → ' : ''}<strong>${esc(ESTADO_CARGO[h.a_estado]?.txt || h.a_estado)}</strong></div>
      ${h.motivo ? `<div class="sub peq">${esc(h.motivo)}</div>` : ''}</div><span class="sub peq">${fechaHora(h.creado_en)}</span></li>`).join('') || '<li class="sub">Sin cambios todavía</li>'}</ul>
    ${cargo.estado === 'sin_pagar' && cargo.user_id === S.uid ? '<div class="botones"><button class="btn principal bloque" id="b-pagar">Pagar</button></div>' : ''}`;
  cargarFotos(c);
  $('#b-pagar', c)?.addEventListener('click', () => hojaPagar(cargo));
}

// ---------- Subir ticket ----------
// opciones: { eventId, taskId, titulo }
export async function hojaTicket(opciones = {}) {
  const c = abrirHoja('<div class="cargando"></div>');
  const { data: eventos } = await sb.from('events').select('id, nombre, fecha_inicio, estado').order('fecha_inicio', { ascending: false, nullsFirst: false });
  const abiertos = (eventos || []).filter(e => e.estado === 'abierto' || e.id === Number(opciones.eventId));
  const pr = S.privado || {};
  c.innerHTML = `
    <h2>🧾 Subir ticket</h2>
    ${opciones.titulo ? `<p class="sub">Encargo: <strong>${esc(opciones.titulo)}</strong></p>` : ''}
    <p class="sub">Si has pagado algo de tu bolsillo para la peña, sube el ticket y te lo devolvemos del bote.</p>
    <form id="f-ticket">
      <label for="foto">Foto del ticket</label>
      <input id="foto" name="foto" type="file" accept="image/*" required>
      <p class="ayuda">Puedes hacer la foto con la cámara o elegirla de la galería.</p>
      <div class="dos-col">
        <div><label for="importe">Importe (€)</label><input id="importe" name="importe" type="text" inputmode="decimal" placeholder="42,30" required></div>
        <div><label for="evento">Evento</label>
          <select id="evento" name="evento" ${opciones.taskId ? 'disabled' : ''}><option value="">Ninguno</option>
          ${abiertos.map(e => `<option value="${e.id}" ${Number(opciones.eventId) === e.id ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select></div>
      </div>
      <label for="concepto">¿Qué has comprado?</label>
      <input id="concepto" name="concepto" type="text" required maxlength="80" placeholder="Hielo y vasos" value="${esc(opciones.titulo || '')}">
      <label for="metodo_cobro">¿Cómo quieres que te lo devolvamos?</label>
      <select id="metodo_cobro" name="metodo_cobro">
        <option value="bizum" ${pr.metodo_cobro === 'bizum' ? 'selected' : ''}>Bizum</option>
        <option value="revolut" ${pr.metodo_cobro === 'revolut' ? 'selected' : ''}>Revolut</option>
        <option value="transferencia" ${pr.metodo_cobro === 'transferencia' ? 'selected' : ''}>Transferencia</option>
      </select>
      <label for="dato_cobro">Tu número, Revtag o IBAN</label>
      <input id="dato_cobro" name="dato_cobro" type="text" value="${esc(pr.dato_cobro || '')}" placeholder="600 000 000">
      <label class="check"><input type="checkbox" name="guardar" checked> Guardarlo en mi perfil para la próxima vez</label>
      <div class="botones"><button class="btn principal bloque" type="submit">Enviar ticket</button></div>
    </form>`;
  const f = $('#f-ticket', c);
  f.onsubmit = e => {
    e.preventDefault();
    const cents = aCentimos(f.importe.value);
    if (!cents) { toast('Pon un importe válido, por ejemplo 12,50', 'error'); return; }
    conCarga($('button[type=submit]', f), async () => {
      try {
        const ruta = await subirFoto('tickets', S.uid, f.foto.files[0]);
        const fila = {
          user_id: S.uid, concepto: f.concepto.value.trim(), importe_cents: cents, foto_url: ruta,
          event_id: opciones.taskId ? null : (f.evento.value ? Number(f.evento.value) : null),
          task_id: opciones.taskId ? Number(opciones.taskId) : null,
          metodo_cobro: f.metodo_cobro.value, dato_cobro: f.dato_cobro.value.trim() || null,
        };
        const { error } = await sb.from('tickets').insert(fila);
        if (error) throw error;
        if (f.guardar.checked && (f.dato_cobro.value.trim() !== (pr.dato_cobro || '') || f.metodo_cobro.value !== pr.metodo_cobro)) {
          await sb.from('perfil_privado').update({ metodo_cobro: f.metodo_cobro.value, dato_cobro: f.dato_cobro.value.trim() || null }).eq('user_id', S.uid);
          S.privado = { ...pr, metodo_cobro: f.metodo_cobro.value, dato_cobro: f.dato_cobro.value.trim() || null };
        }
        cerrarHoja();
        toast('Ticket enviado. Te avisaremos cuando esté revisado');
        refrescar();
      } catch (err) { fallo(err); }
    });
  };
}

// Línea de un cargo para listas
export function lineaCargo(cg, { boton = true } = {}) {
  const pagar = boton && cg.estado === 'sin_pagar';
  return `<li data-cargo="${cg.id}">
    <div class="crece"><div class="titulo ${cg.estado === 'anulado' ? 'tachado' : ''}">${esc(cg.concepto)}</div>
      <div class="sub peq">${cg.fecha_limite ? (vencido(cg.fecha_limite) && cg.estado === 'sin_pagar' ? '<span class="rojo-texto">Venció el ' + fecha(cg.fecha_limite) + '</span>' : 'Antes del ' + fecha(cg.fecha_limite)) : fecha(cg.creado_en)}</div>
      <div style="margin-top:.25rem">${chipCargo(cg)}</div></div>
    <div style="text-align:right"><div class="importe ${cg.estado === 'anulado' ? 'tachado' : ''}">${eur(cg.importe_cents)}</div>
      ${pagar ? `<button class="btn principal peq" data-pagar="${cg.id}" style="margin-top:.35rem">Pagar</button>` : ''}</div></li>`;
}
export function activarCargos(raiz, cargos) {
  const porId = Object.fromEntries(cargos.map(c => [c.id, c]));
  raiz.querySelectorAll('[data-pagar]').forEach(b => b.onclick = e => { e.stopPropagation(); hojaPagar(porId[b.dataset.pagar]); });
  raiz.querySelectorAll('[data-cargo]').forEach(li => li.onclick = () => hojaCargo(porId[li.dataset.cargo]));
}
