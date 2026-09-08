# Islandia 2026

App de viaje para dos iPhones. Página estática, sin framework y sin paso de compilación:
se puede editar desde `github.com` en el teléfono y queda desplegada en 30 segundos.

```
app/                 lo que se publica
  index.html         las seis pantallas
  app.css
  app.js
  sw.js              modo offline. Sube la versión cuando cambies algo.
  manifest.webmanifest
  data/viaje.json    14 días, paradas, sol, luna, alojamientos, avisos   (13 KB)
  data/poi.json      1,114 gasolineras, supermercados, baños, farmacias  (44 KB)

data/                fuentes y análisis, NO se publican
investigacion/       los 5 reportes verificados y las 41 comprobaciones
PLAN.md              el plan aprobado
```

Peso total de la app: **160 KB**. Cabe entera en el teléfono.

## Publicar en GitHub Pages

```bash
git init && git add . && git commit -m "Islandia 2026"
gh repo create islandia-2026 --public --source=. --push
gh api -X POST repos/:owner/islandia-2026/pages -f "source[branch]=main" -f "source[path]=/app"
```

Queda en `https://<usuario>.github.io/islandia-2026/`.

**El repositorio es público.** El bundle no lleva ningún código de reserva, monto ni tarjeta —
está auditado. Esos datos se capturan una vez en cada teléfono, desde la pantalla **El sobre**,
y viven solo en el almacenamiento local del navegador.

Si prefieren repositorio privado, Cloudflare Pages lo permite en el plan gratuito:
conectar el repo y poner `app` como directorio de salida.

## Instalar en el iPhone

1. Abrir la URL en **Safari** (no en Chrome: solo Safari instala en la pantalla de inicio).
2. Compartir → **Añadir a pantalla de inicio**.
3. Abrirla desde el icono, no desde Safari.
4. Dejarla cargar una vez con señal. A partir de ahí funciona sin conexión.

El límite de 7 días con que Safari borra datos de sitios **no aplica** a las apps de la
pantalla de inicio: WebKit las trata como apps aparte, con su propio contador.

**La única forma de perder el caché** es entrar a Ajustes → Safari → *Borrar historial y datos
de sitios web*. Desde iOS 14 la app comparte el CacheStorage con Safari. No lo toquen durante el viaje.

## Probar el modo offline antes de volar

No es opcional. Si el service worker no intercepta la navegación, la app abre en blanco sin señal.

1. Abrir la app y navegar por las seis pantallas.
2. Poner el teléfono en **modo avión**.
3. Cerrarla del todo y volver a abrirla desde el icono.
4. Debe pintar los 14 días, los teléfonos de emergencia y las paradas con sus enlaces a mapas.

Probado aquí apagando el servidor: la red falla y la app sigue pintando los 14 días completos.

## Editar durante el viaje

Desde el iPhone: `github.com` → el archivo → el lápiz → commit. Se redespliega solo.

- Cambiar un alojamiento o una hora: `app/data/viaje.json`
- Añadir un pendiente: la constante `TAREAS` en `app/app.js`
- **Si cambias cualquier archivo, sube `V` en `app/sw.js`** (`is26-v1` → `is26-v2`).
  Sin eso los teléfonos siguen sirviendo la versión vieja del caché.

## De dónde salen los datos

| Qué | Fuente | Sin llave | CORS |
|---|---|---|---|
| Clima y ráfagas | `api.open-meteo.com` | sí | abierto |
| Índice Kp de auroras | `services.swpc.noaa.gov` | sí | abierto |
| Gasolineras, súper, baños | OpenStreetMap vía Overpass, congelado en `poi.json` | — | offline |
| Coordenadas de los 68 puntos | Nominatim, congeladas | — | offline |
| Sol y luna | calculados, congelados | — | offline |

Solo el clima y el Kp necesitan red, y ambos guardan la última lectura con su hora.
Todo lo demás funciona en modo avión.

**Lo que no está y no puede estar:** la condición de carreteras en vivo. La API de Vegagerðin
(`gagnaveita.vegagerdin.is/api/faerd2014_1`) no manda cabeceras CORS, así que un sitio estático
no puede leerla. Hay que revisar `umferdin.is` cada mañana, o llamar al **1777**.
