// Música: puerta de entrada al jukebox del local, sin tocarlo.
//  · Android: abre la app del jukebox (APK es.elresacon.jukebox) si está
//    instalada; si no, abre la web del jukebox en el navegador.
//  · iPhone / ordenador: abre la web del jukebox.
// El jukebox vive en la WiFi «El Resacon» (http://10.77.77.1) y funciona sin internet.
import { cfg } from '../estado.js';
import { $, esc, dispositivo, copiar, pista, activarPistas } from '../util.js';

const PAQUETE_APK = 'es.elresacon.jukebox';

// Enlace que en Android abre directamente la APK del jukebox (que ya responde a
// http://10.77.77.1) y, si no está instalada, abre la web en el navegador.
function enlaceAndroid(url) {
  const u = new URL(url);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(':', '')};package=${PAQUETE_APK};` +
    `S.browser_fallback_url=${encodeURIComponent(url)};end`;
}

export async function vista(main) {
  const url = cfg('jukebox_url', 'http://10.77.77.1') || 'http://10.77.77.1';
  const apk = cfg('apk_url');
  const d = dispositivo();
  const destino = d.android ? enlaceAndroid(url) : url;

  main.innerHTML = `
    <h1>🎵 Música</h1>
    <div class="tarjeta destacada">
      <h2>Pide canciones en el local</h2>
      ${pista('musica-wifi', 'El jukebox solo funciona conectado a la WiFi del local. Fuera del local no abrirá, y es normal.')}
      <ol class="pasos">
        <li>Conéctate a la WiFi <strong>El Resacon</strong>.</li>
        <li>Pulsa <strong>Abrir el jukebox</strong>${d.android ? ' (se abre la app del jukebox si la tienes instalada)' : ''}.</li>
        <li>Busca la canción y añádela a la cola. Suena por los altavoces del local.</li>
      </ol>
      <div class="botones"><a class="btn principal bloque" id="b-jukebox" href="${esc(destino)}" ${d.android ? '' : 'target="_blank" rel="noopener"'}>▶ Abrir el jukebox</a></div>
      <p class="ayuda">Si no abre o sale «sin conexión», es que no estás en la WiFi El Resacon. El resto de esta app sigue funcionando con tus datos.</p>
    </div>

    ${d.android ? `<div class="tarjeta">
      <h2>📱 App del jukebox</h2>
      <p class="sub">Con la app del jukebox, los botones de volumen del móvil suben y bajan la música del local, tienes la canción que suena en las notificaciones y puedes compartir canciones desde YouTube.</p>
      ${apk ? `<div class="botones"><a class="btn bloque" href="${esc(apk)}">⬇️ Descargar la app del jukebox</a></div>
        <p class="ayuda">Al instalarla, permite «instalar apps desconocidas» si el móvil lo pide.</p>`
        : '<p class="ayuda">Pídele la app a Sergio.</p>'}
    </div>` : ''}

    <div class="tarjeta">
      <h2>🏷️ También con la pegatina</h2>
      <p class="sub">En el local, acerca el móvil a la pegatina NFC o escribe esta dirección en el navegador:</p>
      <div class="copiable"><code>${esc(url.replace(/^https?:\/\//, ''))}</code><button type="button" class="btn peq" id="b-copiar-url">Copiar</button></div>
      ${d.ios ? '<p class="ayuda">En iPhone puedes añadir el jukebox a la pantalla de inicio desde Safari (Compartir → Añadir a pantalla de inicio) para tenerlo a mano.</p>' : ''}
    </div>`;
  activarPistas(main);
  $('#b-copiar-url', main).onclick = () => copiar(url, 'Dirección copiada');
  return 'Música';
}
