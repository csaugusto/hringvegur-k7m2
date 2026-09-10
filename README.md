# Islandia 2026

App de viaje para dos iPhones. Página estática, sin framework y sin paso de compilación:
se puede editar desde `github.com` en el teléfono y queda desplegada en 30 segundos.

```
app/                 lo que se publica
  index.html         las seis pantallas
  app.css            paleta Paisaje: basalto, glaciar, musgo, aurora y azufre
  app.js
  fonts/archivo.woff2   la tipografía de señalética, variable  (35 KB)
  sw.js              modo offline. Sube la versión cuando cambies algo.
  manifest.webmanifest
  data/viaje.json    14 días, paradas, sol, luna, alojamientos, avisos
                     y los 25 puntos de gasolina/provisiones con su estrategia  (24 KB)
  data/poi.json      1,114 gasolineras, supermercados, baños, farmacias  (44 KB)
  data/carreteras.json  estado de 339 tramos, lo reescribe una GitHub Action  (33 KB)

scripts/carreteras.py   baja el feed de Vegagerðin y lo filtra a la ruta
.github/workflows/      la Action que lo corre cada 30 min y publica en Pages

data/                fuentes y análisis, NO se publican
investigacion/       los 5 reportes verificados y las 41 comprobaciones
PLAN.md              el plan aprobado
```

Peso total de la app: **300 KB**. Cabe entera en el teléfono.

## Publicar en GitHub Pages

El sitio vive en `app/`, no en la raíz, y Pages en modo rama solo acepta `/` o `/docs`.
La salida es publicar desde el propio workflow, que además resuelve un problema peor:
**un push hecho por el GITHUB_TOKEN no dispara ningún workflow.** Si el deploy viviera
aparte con `on: push`, los commits del espejo no lo despertarían y el sitio se quedaría
congelado, en verde y sin avisar. Por eso espejo y publicación van en la misma corrida.

```bash
git init && git add . && git commit -m "Islandia 2026"
gh repo create <nombre> --public --source=. --remote=origin --push
gh api -X POST repos/<usuario>/<nombre>/pages -f "build_type=workflow"
```

Queda en `https://<usuario>.github.io/<nombre>/`, en la raíz y sin el `/app/`.

Vale la pena activar el aviso por correo cuando falle: Settings → Notifications → Actions
→ Email, *"Only notify for failed workflows"*, a un correo que se abra desde el iPhone.
Si el espejo se rompe a media Islandia, ese correo es la única forma de enterarse.

**El repositorio es público.** El bundle no lleva ningún código de reserva, monto ni tarjeta —
está auditado. Esos datos se capturan una vez en cada teléfono, desde la pantalla **Guía**,
y viven solo en el almacenamiento local del navegador.

**No usar Cloudflare Pages con este cron.** Permite repo privado, sí, pero su plan
gratuito da 500 builds al mes y aquí puede haber hasta 1,440 push: se quedaría sin
builds alrededor del día 10 del viaje, y la forma de fallar es la peor —la app sigue
abriendo y el sitio se congela sin error visible. GitHub Pages aguanta 2 builds por hora
sin despeinarse. Pagar Pro por un repo privado tampoco esconde el sitio: la URL sigue
siendo pública, y de paso mete el cron en una cuota de minutos que sí se puede agotar.

## Instalar en el iPhone

1. Abrir la URL en **Safari** (no en Chrome: solo Safari instala en la pantalla de inicio).
2. Compartir → **Añadir a pantalla de inicio**.
3. Abrirla desde el icono, no desde Safari.
4. Dejarla cargar una vez con señal. A partir de ahí funciona sin conexión.

El límite de 7 días con que Safari borra datos de sitios **no aplica** a las apps de la
pantalla de inicio: WebKit las trata como apps aparte, con su propio contador.

**La forma más fácil de perder el caché** es entrar a Ajustes → Safari → *Borrar historial y
datos de sitios web*. No lo toquen durante el viaje.

Desde iOS 14 el CacheStorage se comparte con Safari según Firtman, pero Apple solo garantiza
que las cookies y el almacenamiento local están separados. No cuenten con eso: capturen los
datos de la pantalla **Guía** desde el icono, no desde una pestaña de Safari, en cada teléfono.

## Probar el modo offline antes de volar

No es opcional. Si el service worker no intercepta la navegación, la app abre en blanco sin señal.

1. Abrir la app y navegar por las seis pantallas.
2. Poner el teléfono en **modo avión**.
3. Cerrarla del todo y volver a abrirla desde el icono.
4. Debe pintar los 14 días, los teléfonos de emergencia y las paradas con sus enlaces a mapas.

Probado aquí apagando el servidor: la red falla y la app sigue pintando los 14 días completos.

## Actualizar los alojamientos

`app/data/alojamientos.json` es el único archivo pensado para editarse a mano. Está
indentado y con una entrada por noche, así que se puede cambiar desde `github.com` en
el iPhone: abrir el archivo, el lápiz, editar, commit. En 30 segundos está en los dos
teléfonos. **No hay que correr nada** — la app lo lee al arrancar y lo mezcla con el
itinerario.

```json
"2026-10-03": {
  "lugar": "Akureyri",
  "estado": "por_reservar",        // reservada · mover · por_reservar
  "nombre": "",
  "direccion": "",
  "lat": null, "lon": null,        // decimal: 65.6839 / -18.1122
  "tel": "",                       // con +354; enciende el botón Llamar
  "checkin": "", "checkout": "",
  "cierre": "",                    // hora tope de llegada, si la hay
  "llegada_tarde": "",
  "desayuno": "",
  "cancela": "",                   // AAAA-MM-DD
  "url": "", "notas": ""
}
```

Con `tel` aparece el botón **Llamar**. Con `lat`/`lon` aparece **Cómo llegar**, que abre
el mapa del teléfono con las coordenadas y funciona sin señal. Mientras estén vacíos, la
tarjeta dice "Falta el teléfono" — a propósito, para que se note el hueco.

**Nunca pongas aquí códigos de reserva ni montos:** el repositorio es público. Eso se
captura una vez en cada teléfono desde la pantalla **Guía** y se guarda solo ahí.

## Agregar consejos y advertencias de guías

`app/data/consejos.json` es el otro archivo editable a mano. Cada consejo cae solo
en el lugar correcto según los campos que traiga:

| Campo | Dónde aparece |
|---|---|
| `dia: "2026-10-08"` | En ese día, en Hoy y en Los 14 días |
| `punto: "Reynisfjara"` | Bajo esa parada, el día que toque |
| ninguno de los dos | En la pantalla Guía, como consejo general |

`tipo` pinta el color del borde: `peligro` rojo, `peaje` naranja, `reserva` violeta,
`ruta`, `acceso`, `dinero`, `tip`. `fuente` es opcional y sirve para saber de dónde
salió por si hay que volver a revisarlo.

El nombre en `punto` tiene que coincidir exacto con el de la parada en `viaje.json`
(por ejemplo `Reynisfjara`, no `Playa de Reynisfjara`).

## Cambiar cualquier otra cosa

Desde el iPhone: `github.com` → el archivo → el lápiz → commit. Se redespliega solo.

- Paradas, avisos, cámaras o sol: `app/data/viaje.json` (minificado; mejor desde la compu)
- **Si cambias cualquier archivo, sube `V` en `app/sw.js`** (`is26-v28` → `is26-v29`)
  en el MISMO commit. Sin eso los teléfonos siguen sirviendo la versión vieja del caché.

### Reparar algo desde el teléfono, estando en Islandia

1. `github.com` → el archivo → el lápiz → editar → commit.
2. Subir `V` en `app/sw.js` en ese mismo commit.
3. Esperar 1 o 2 minutos a que termine la Action.
4. Abrir la app, **cerrarla del Selector de apps**, y volver a abrirla. Dos veces:
   la primera descarga la versión nueva, la segunda la muestra.

Si lo que se rompió es el espejo de carreteras, el atajo es Actions → el workflow →
**Run workflow**. Conviene ensayarlo una vez antes de volar.

## El fondo que sigue la luz

`app.js` le pone a `<html>` un atributo `data-luz` con uno de cuatro valores —
`amanecer`, `dia`, `ocaso`, `noche`— comparando la hora de Islandia con el amanecer,
el ocaso y el fin del crepúsculo de ese día. `app.css` solo mueve dos variables por
franja: el fondo y el color del horizonte de arriba. El texto conserva siempre el
mismo contraste.

No es adorno: manejando a las siete de la tarde en octubre la pantalla se oscurece
sola, sin que nadie toque nada.

La tipografía es **Archivo variable**, un solo archivo de 35 KB servido desde el
propio repo y precargado por el service worker, así que funciona en modo avión. Si
por lo que sea no cargara, cae a la del sistema y la app se sigue viendo bien.

## De dónde salen los datos

| Qué | Fuente | Sin llave | CORS |
|---|---|---|---|
| Clima y ráfagas | `api.open-meteo.com` | sí | abierto |
| Peligro de olas en Reynisfjara | SafeTravel, espejado por la Action | — | mismo dominio |
| Avisos oficiales del clima | `api.vedur.is/cap` | sí | abierto |
| Alertas de ICE-SAR | `safetravel.is/wp-json` | sí | abierto |
| Estaciones de carretera | Vegagerðin, espejado por la Action | — | mismo dominio |
| Índice Kp de auroras | `services.swpc.noaa.gov` | sí | abierto |
| Gasolineras, súper, baños | OpenStreetMap vía Overpass, congelado en `poi.json` | — | offline |
| Estrategia de combustible y compras | las 3 capas del Google My Maps original | — | offline |
| Coordenadas de los 68 puntos | Nominatim, congeladas | — | offline |
| Sol y luna | calculados, congelados | — | offline |

Solo el clima y el Kp necesitan red, y ambos guardan la última lectura con su hora.
Todo lo demás funciona en modo avión.

### El estado de carreteras, y cómo se resolvió el CORS

La API de Vegagerðin (`gagnaveita.vegagerdin.is/api/faerd2014_1`) **no manda cabeceras CORS**,
así que el navegador no puede leerla desde una página estática. La vuelta:

```
GitHub Action cada 30 min  →  scripts/carreteras.py  →  app/data/carreteras.json  →  commit
```

Al vivir en el repo, GitHub Pages lo sirve desde el mismo dominio y el CORS deja de existir.
Sin servidor y sin costo. De 969 tramos del país filtra los **339 que pisan la ruta**, y ordena
primero lo que estorba. El service worker usa **red primero** para este archivo — es el único
donde la frescura importa más que la velocidad — y cae al caché si no hay señal.

Si la Action falla o pasan días sin correr, la app muestra la hora del último dato.
El teléfono de la Vegagerðin es el **1777**, en inglés, de 06:30 a 22:00.

### Cámaras de carretera

Vegagerðin tiene 500 cámaras; **45 quedan cerca de la ruta**, asignadas por día por cercanía y
priorizando pasos de montaña, brezales y túneles sobre las cámaras de tráfico urbano de Reikiavik.
Las imágenes se cargan directo en `<img>` desde `vegagerdin.is`: eso **no necesita CORS**, así que
funcionan sin proxy. Sin señal no cargan y cada marco muestra "sin imagen".

## Transcribir videos

Los reels de consejos suelen tener el contenido en el audio, no en pantalla.

```bash
brew install whisper-cpp
curl -L -o small.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin
ffmpeg -i video.mp4 -ar 16000 -ac 1 -c:a pcm_s16le audio.wav
whisper-cli -m small.en.bin -f audio.wav -l en --no-timestamps -np
```

Las transcripciones quedan en `investigacion/transcripciones/`.

## Lo que se guarda solo en el teléfono

Tres cosas viven en el almacenamiento local del navegador y **no** están en el
repositorio, así que no se sincronizan entre los dos teléfonos:

- Códigos de reserva, teléfonos y datos del auto (pantalla Guía)
- La app de mapas elegida
- La bitácora de combustible: odómetro inicial y cada carga

Para la bitácora conviene que siempre la anote la misma persona.
