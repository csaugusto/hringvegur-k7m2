/* Islandia 2026 — offline primero.
   Sube la versión cuando cambies archivos: fuerza la actualización en los dos teléfonos. */
const V = 'is26-v46';
// Lo imprescindible para que la app abra sin señal. addAll es todo-o-nada:
// si uno solo de estos falla, la instalación entera se cae y el teléfono se
// queda sirviendo la versión vieja para siempre. Por eso el icono y la
// tipografía —bonitos pero prescindibles— van aparte y se toleran fallidos.
const NUCLEO = ['./','./index.html','./app.css','./app.js','./manifest.webmanifest',
                './data/viaje.json','./data/poi.json','./data/carreteras.json',
                './data/alojamientos.json','./data/consejos.json','./data/quehacer.json','./data/prohibido.json','./data/estacionamiento.json','./data/peajes.json','./data/islandes.json',
                './data/reynisfjara.json','./data/estaciones.json'];
const EXTRA = ['./icon.png','./fonts/archivo.woff2'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    // 'reload' salta el caché HTTP del navegador. Pages sirve con max-age=600,
    // así que sin esto una instalación nueva podría cachear archivos viejos.
    await c.addAll(NUCLEO.map(u => new Request(u, { cache: 'reload' })));
    await Promise.allSettled(EXTRA.map(u => c.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
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

  // TODOS los datos, no solo los tres del espejo: red primero con 3 segundos de
  // paciencia, y el caché si la red falla o tarda más. Antes alojamientos.json,
  // viaje.json y consejos.json se servían de caché primero, así que corregir un
  // hotel desde github.com a media carretera no se veía hasta el segundo
  // arranque. El requisito es poder arreglar cosas desde el teléfono y verlas.
  if (url.pathname.includes('/data/')) {
    e.respondWith((async () => {
      const guardado = await caches.match(e.request);
      try {
        const res = await Promise.race([
          fetch(e.request),
          new Promise((_, rechaza) => setTimeout(() => rechaza(new Error('lento')), 3000))
        ]);
        if (res && res.ok) { (await caches.open(V)).put(e.request, res.clone()); return res; }
        return guardado || res;
      } catch { return guardado || fetch(e.request); }
    })());
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
