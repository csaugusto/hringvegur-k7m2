/* Islandia 2026 — offline primero.
   Sube la versión cuando cambies archivos: fuerza la actualización en los dos teléfonos. */
const V = 'is26-v16';
const NUCLEO = ['./','./index.html','./app.css','./app.js','./manifest.webmanifest',
                './data/viaje.json','./data/poi.json','./data/carreteras.json','./data/alojamientos.json','./data/consejos.json','./data/reynisfjara.json','./icon.png','./fonts/archivo.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(NUCLEO)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // APIs externas: nunca del caché. Si no hay red, que falle y la app use lo guardado.
  if (url.origin !== location.origin) return;

  // Navegación: siempre servir el shell desde caché. Sin esto, sin señal abre en blanco.
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then(r => r || fetch(e.request)));
    return;
  }

  // El estado de carreteras cambia cada 30 min y es lo único donde la frescura
  // importa más que la velocidad: red primero, caché solo si la red falla.
  if (url.pathname.endsWith('/data/carreteras.json') || url.pathname.endsWith('/data/reynisfjara.json')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.ok) caches.open(V).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Todo lo demás: caché primero, y refresca en segundo plano.
  e.respondWith(caches.match(e.request).then(hit => {
    const red = fetch(e.request).then(res => {
      if (res && res.ok) caches.open(V).then(c => c.put(e.request, res.clone()));
      return res;
    }).catch(() => hit);
    return hit || red;
  }));
});
