// Service worker de El Resacón: guarda la "carcasa" de la app para que abra
// rápido. Los datos (Supabase) nunca se guardan aquí: siempre van a internet.
// Al cambiar la app, sube el número de VERSION para que los móviles la actualicen.
const VERSION = 'resacon-v1';
const CARCASA = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/config.js', 'js/tema.js', 'js/app.js', 'js/supa.js', 'js/util.js', 'js/estado.js', 'js/nav.js',
  'js/vistas/publico.js', 'js/vistas/inicio.js', 'js/vistas/eventos.js', 'js/vistas/pagos.js',
  'js/vistas/musica.js', 'js/vistas/mas.js', 'js/vistas/admin.js', 'js/vistas/tutorial.js', 'js/vistas/comun.js',
  'img/logo.svg', 'img/icon-192.png', 'img/icon-512.png', 'img/apple-touch-icon.png', 'img/favicon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CARCASA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Solo archivos de la propia app (y la librería de Supabase del CDN)
  const propio = url.origin === location.origin;
  const cdn = url.hostname === 'cdn.jsdelivr.net';
  if (!propio && !cdn) return;
  // Red primero (para tener siempre lo último); si no hay conexión, lo guardado
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && (propio || cdn)) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
