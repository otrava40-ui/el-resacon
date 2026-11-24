// Música. La integración completa del jukebox llega en la fase 3.
// De momento: acceso directo al jukebox del local (http://10.77.77.1).
import { cfg } from '../estado.js';
import { esc, dispositivo } from '../util.js';

export async function vista(main) {
  const url = cfg('jukebox_url', 'http://10.77.77.1');
  const d = dispositivo();
  main.innerHTML = `
    <h1>🎵 Música</h1>
    <div class="tarjeta destacada">
      <h2>Pide canciones en el local</h2>
      <ol class="pasos">
        <li>Conéctate a la WiFi <strong>El Resacon</strong>.</li>
        <li>Pulsa <strong>Abrir el jukebox</strong> (o acerca el móvil a la pegatina NFC).</li>
        <li>Busca la canción y añádela a la cola. Suena por los altavoces del local.</li>
      </ol>
      <div class="botones"><a class="btn principal bloque" href="${esc(url)}" target="_blank" rel="noopener">▶ Abrir el jukebox</a></div>
      <p class="ayuda">Si no abre, es que no estás conectado a la WiFi El Resacon. El resto de la app sigue funcionando con datos.</p>
    </div>
    <div class="info-caja">🛠️ Pronto el jukebox irá dentro de esta pestaña${d.android ? ' y en la app de Android' : ''}, con tu apodo en las canciones que pidas.</div>`;
  return 'Música';
}
