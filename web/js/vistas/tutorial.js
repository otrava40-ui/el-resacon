// Tutorial de bienvenida (la primera vez y desde Más → Ver tutorial)
import { sb } from '../supa.js';
import { S, cfg } from '../estado.js';
import { $, $$, esc, dispositivo } from '../util.js';
import { activarAvisos } from './inicio.js';
import { ir } from '../nav.js';

export async function vista(main) {
  const admin = cfg('admin_nombre', 'Sergio');
  const d = dispositivo();
  const diapos = [
    ['<img src="img/logo.svg" alt="">', `¡Bienvenido, ${esc(S.perfil.apodo)}!`, 'Esta es la app de El Resacón: cuentas claras, eventos, encargos y música del local, todo en un sitio.'],
    ['🏠', 'Inicio', 'Aquí ves de un vistazo <strong>lo que debes</strong> y tus <strong>encargos</strong>. Si sale «Estás al día» en verde, no debes nada.'],
    ['💶', 'Cómo pagar', `Pulsa <strong>Pagar</strong>, copia el concepto y paga al bote por Revolut, transferencia o Bizum. Después pulsa <strong>«Ya he pagado»</strong>: queda en naranja hasta que ${esc(admin)} lo confirme y se pone en verde.`],
    ['🧾', 'Tickets', `¿Has pagado algo de tu bolsillo para la peña? Pulsa <strong>＋ Subir ticket</strong>, hazle una foto y ${esc(admin)} te lo devuelve del bote.`],
    ['📋', 'Encargos', 'Si eres <strong>encargado</strong> de una tarea (por ejemplo, poner las bebidas), te sale en Inicio. Márcala como hecha y sube el ticket si has gastado algo.'],
    ['🎵', 'Música', 'En el local, conéctate a la WiFi <strong>El Resacon</strong> y entra en la pestaña Música para pedir canciones.'],
    ['🔔', 'Activa los avisos', d.ios && !d.enApp ? 'En iPhone primero tienes que <strong>añadir la app a la pantalla de inicio</strong> (Más → Cómo instalar la app). Luego podrás activar los avisos.'
      : 'Así te enteras cuando te toca pagar, cuando confirman tu pago y de los eventos.'],
  ];
  if (S.esAdmin) diapos.push(['⚙️', 'Eres el administrador', 'En la pestaña <strong>Admin</strong> creas eventos, confirmas pagos, revisas tickets e invitas a gente. Empieza por <strong>Admin → Ajustes</strong> para poner los datos del bote.']);

  main.innerHTML = `<div class="tutorial">
    <div class="diapos" id="diapos">${diapos.map(([ico, t, p], i) => `<section class="diapo"><div class="ilustra ${ico.startsWith('<img') ? 'logo' : ''}">${ico}</div><h1>${t}</h1><p>${p}</p>
      ${i === diapos.length - 1 - (S.esAdmin ? 1 : 0) && 'Notification' in window && Notification.permission === 'default' && !(d.ios && !d.enApp)
        ? '<button class="btn principal" id="b-avisos" style="margin-top:1rem">🔔 Activar avisos</button>' : ''}</section>`).join('')}</div>
    <div class="pie"><button class="btn fantasma" id="b-saltar">Saltar</button>
      <div class="puntos">${diapos.map((_, i) => `<span class="${i ? '' : 'activo'}"></span>`).join('')}</div>
      <button class="btn principal" id="b-sig">Siguiente</button></div></div>`;
  const cont = $('#diapos', main), puntos = $$('.puntos span', main), sig = $('#b-sig', main);
  const actual = () => Math.round(cont.scrollLeft / cont.clientWidth);
  const pintar = () => {
    const i = actual();
    puntos.forEach((p, j) => p.classList.toggle('activo', i === j));
    sig.textContent = i === diapos.length - 1 ? '¡Empezar!' : 'Siguiente';
  };
  cont.addEventListener('scroll', () => requestAnimationFrame(pintar), { passive: true });
  sig.onclick = () => {
    const i = actual();
    if (i >= diapos.length - 1) terminar();
    else cont.scrollTo({ left: (i + 1) * cont.clientWidth, behavior: 'smooth' });
  };
  $('#b-saltar', main).onclick = terminar;
  $('#b-avisos', main)?.addEventListener('click', async e => {
    const r = await activarAvisos(false);
    if (r === 'granted') { e.target.textContent = '✅ Avisos activados'; e.target.disabled = true; }
  });
  return '';
}

async function terminar() {
  if (!S.perfil.tutorial_visto) {
    await sb.from('profiles').update({ tutorial_visto: true }).eq('id', S.uid);
    S.perfil.tutorial_visto = true;
  }
  ir('#/inicio');
}
