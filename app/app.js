/* Islandia 2026 — sin framework, sin build.
   Se puede editar desde github.com en el iPhone y queda desplegado en 30 segundos. */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const hm  = m => `${Math.floor(m / 60)}:${pad(Math.round(m % 60))}`;

// Islandia usa UTC todo el año, sin horario de verano.
const ahoraISL = () => new Date(Date.now() + new Date().getTimezoneOffset() * 60000);
const hoyISO   = () => ahoraISL().toISOString().slice(0, 10);

const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('is26.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('is26.' + k, JSON.stringify(v)); } catch {} }
};

let VIAJE = null, POI = null;

// ─────────────────────────── carga ───────────────────────────
async function boot() {
  try {
    [VIAJE, POI] = await Promise.all([
      fetch('data/viaje.json').then(r => r.json()),
      fetch('data/poi.json').then(r => r.json())
    ]);
  } catch (e) {
    document.body.innerHTML = '<p style="padding:40px;text-align:center">No se pudieron cargar los datos.<br><small>Recarga la página con señal una vez.</small></p>';
    return;
  }
  pintarHoy(); pintarDias(); pintarNoches(); pintarSobre(); pintarPendientes();
  setInterval(tickLuz, 1000); tickLuz();

  // Traer clima si hay red y el caché ya venció
  if (navigator.onLine) {
    const c = LS.get('clima');
    if (!c || Date.now() - c.t > 3 * 3600e3) cargarClima();
    else { renderVientoHoy(c); renderClima(c); }
    const k = LS.get('kp');
    if (!k || Date.now() - k.t > 3600e3) cargarKp(); else renderKp(k);
    cargarVias();
  } else {
    const c = LS.get('clima'); if (c) { renderVientoHoy(c); renderClima(c); }
    const k = LS.get('kp');    if (k) renderKp(k);
    const v = LS.get('vias');  if (v) renderVias(v.d);
  }
}

// ─────────────────────────── navegación ───────────────────────────
$$('#tabs button').forEach(b => b.onclick = () => ir(b.dataset.v));
function ir(v) {
  $$('.view').forEach(s => s.hidden = s.id !== 'v-' + v);
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  scrollTo(0, 0);
  location.hash = v;
}
if (location.hash) ir(location.hash.slice(1));

const setOffline = () => $('#offline-bar').hidden = navigator.onLine;
addEventListener('online', setOffline); addEventListener('offline', setOffline); setOffline();

// ─────────────────────────── helpers ───────────────────────────
const diaDeHoy = () => VIAJE.dias.find(d => d.fecha === hoyISO());
const diaActivo = () => diaDeHoy() || VIAJE.dias[0];

const FECHA_LARGA = f => {
  const [y, m, d] = f.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const mes  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${dias[dt.getUTCDay()]} ${d} de ${mes[m - 1]}`;
};
const FECHA_CORTA = f => {
  const [, m, d] = f.split('-').map(Number);
  return `${d} ${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][m - 1]}`;
};

// Enlaces que SÍ abren sin internet: el mapa del teléfono ya tiene los tiles.
const mapaURL = (lat, lon, n) => `maps://?ll=${lat},${lon}&q=${encodeURIComponent(n)}`;
const rutaURL = (lat, lon) => `maps://?daddr=${lat},${lon}&dirflg=d`;

const dist = (a, b, c, d) => {
  const R = 6371, r = Math.PI / 180;
  const x = (c - a) * r, y = (d - b) * r;
  const h = Math.sin(x/2)**2 + Math.cos(a*r) * Math.cos(c*r) * Math.sin(y/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// ─────────────────────────── HOY ───────────────────────────
function pintarHoy() {
  const d = diaActivo(), esHoy = !!diaDeHoy();
  $('#hoy-titulo').textContent = esHoy ? `Día ${d.d}` : 'El viaje empieza pronto';
  $('#hoy-sub').textContent = `${FECHA_LARGA(d.fecha)} · ${d.plan}`;

  if (!esHoy) {
    const faltan = Math.ceil((Date.UTC(...VIAJE.dias[0].fecha.split('-').map((v, i) => i === 1 ? v - 1 : +v)) - ahoraISL()) / 864e5);
    const n = $('#hoy-precuenta');
    n.hidden = false;
    n.innerHTML = `<h3>Faltan ${faltan} días</h3><p class="sub" style="margin-bottom:0">Mostrando el día 0. Cuando llegue el 30 de septiembre, esta pantalla cambia sola.</p>`;
  }

  // dormir
  const dm = d.dormir, box = $('#hoy-dormir');
  if (!dm) {
    box.innerHTML = `<h2>Hoy vuelan</h2><p class="dormir-lugar">Keflavík 17:05</p>
      <p class="sub">Entrega del auto a las 14:00. Salgan de Reikiavik a las 12:00.</p>`;
  } else {
    const priv = LS.get('privado', {})[d.fecha] || {};
    const tel = priv.tel, dirn = priv.dir;
    box.innerHTML = `
      <div class="card-head"><h2>Esta noche duermen en</h2>
        <span class="estado ${dm.estado}">${dm.estado_txt}</span></div>
      <p class="dormir-lugar">${dm.lugar}</p>
      ${dm.nombre ? `<p class="dormir-nombre">${dm.nombre}</p>` : ''}
      ${dirn ? `<p class="dormir-nombre">${dirn}</p>` : ''}
      <div class="horas">
        ${dm.checkin ? `<span>Entrada <b>${dm.checkin}${dm.cierre ? ' a ' + dm.cierre : ''}</b></span>` : ''}
        ${dm.checkout ? `<span>Salida <b>${dm.checkout}</b></span>` : ''}
      </div>
      <div class="acciones">
        <a class="call ${tel ? '' : 'falta'}" href="${tel ? 'tel:' + tel.replace(/\s/g, '') : '#'}">${tel ? 'Llamar' : 'Falta el teléfono'}</a>
        ${priv.lat ? `<a href="${rutaURL(priv.lat, priv.lon)}">Cómo llegar</a>` : ''}
        ${dm.url ? `<a href="${dm.url}" target="_blank" rel="noopener">Booking</a>` : ''}
      </div>
      ${dm.cierre ? `<p class="nota">Corte duro a las ${dm.cierre}. Si van a llegar después, avisen hoy mismo mientras haya señal.</p>` : ''}`;
  }

  // ruta
  $('#hoy-cifras').textContent = `${d.km} km · ${hm(d.manejo_min)} manejando`;
  $('#hoy-paradas').innerHTML = d.puntos.map((p, i) => `
    <li class="cat-${p.cat || 'Interés'}">
      <span class="num">${i + 1}</span>
      <span class="np"><strong>${p.n}</strong>${p.nota ? `<small>${p.nota}</small>` : (p.cat === 'Opcional' ? '<small>opcional</small>' : '')}</span>
      <a class="go" href="${mapaURL(p.lat, p.lon, p.n)}">Mapa</a>
    </li>`).join('');

  // gasolina y provisiones — la estrategia que traía el mapa
  const sv = $('#hoy-servicios');
  sv.hidden = !d.servicios?.length;
  if (!sv.hidden) $('#servicios-cuerpo').innerHTML = servicios(d.servicios);

  // avisos
  $('#hoy-avisos').innerHTML = d.avisos.map(a => aviso(a)).join('');
}

// Los 25 puntos que alguien pensó a mano: nivel de riesgo, con cuánto tanque entrar,
// qué comprar dónde y a qué hora cierran. Vale más que las 264 gasolineras genéricas.
const servicios = lista => lista.map(s => {
  const nv = (s.nivel || '').toUpperCase();
  const cls = nv === 'ROJO' ? 'rojo' : nv === 'AMARILLO' ? 'amarillo' : s.tipo === 'tienda' ? 'tienda' : 'verde';
  const etiqueta = s.compra || s.nivel || s.clase || '';
  return `<div class="svc ${cls}">
    <div class="svc-t">
      <span class="svc-ic">${s.tipo === 'tienda' ? '🛒' : nv === 'AMARILLO' ? '⚠' : '⛽'}</span>
      <span class="svc-n"><strong>${s.n}</strong>${etiqueta ? `<em>${etiqueta}</em>` : ''}</span>
      ${s.lat ? `<a class="go" href="${mapaURL(s.lat, s.lon, s.n)}">Mapa</a>` : ''}
    </div>
    ${s.accion ? `<p class="svc-a">${s.accion}</p>` : ''}
    ${s.contexto ? `<p class="svc-x">${s.contexto}</p>` : ''}
    ${s.horario ? `<p class="svc-x">Horario: ${s.horario}</p>` : ''}
    ${s.nota ? `<p class="svc-x">${s.nota}</p>` : ''}
  </div>`;
}).join('');

const ICONO = { peaje: '⊘', ruta: '⇱', acceso: '⌂', peligro: '⚠', reserva: '◷' };
const TITULO = { peaje: 'Peaje', ruta: 'Carretera', acceso: 'Acceso', peligro: 'Peligro', reserva: 'Reservar' };
const aviso = a => `<div class="aviso ${a.t}"><span class="ic">${ICONO[a.t] || '•'}</span>
  <span><b>${TITULO[a.t] || 'Aviso'}</b>${a.x}</span></div>`;

// ─────────────────────────── cuenta regresiva de luz ───────────────────────────
function tickLuz() {
  if (!VIAJE) return;
  const d = diaActivo(), n = ahoraISL();
  const min = n.getUTCHours() * 60 + n.getUTCMinutes() + n.getUTCSeconds() / 60;
  const [ah, am] = d.amanecer.split(':').map(Number), [oh, om] = d.ocaso.split(':').map(Number);
  const [ch, cm] = d.crep_fin.split(':').map(Number);
  const amanecer = ah * 60 + am, ocaso = oh * 60 + om, crep = ch * 60 + cm;

  $('#luz-amanecer').textContent = d.amanecer;
  $('#luz-ocaso').textContent = d.ocaso;
  $('#luz-crep').textContent = d.crep_fin;

  const card = $('.luz'), el = $('#luz-cuenta');

  // Antes de volar no hay cuenta regresiva que valga: mostramos la luz total del día.
  if (!diaDeHoy()) {
    card.classList.remove('noche');
    $('.luz .label').textContent = 'Luz ese día';
    el.textContent = hm(d.luz_min).replace(':', 'h ') + 'm';
    $('#luz-fill').style.width = (d.luz_min / 720 * 100).toFixed(1) + '%';
    return;
  }
  $('.luz .label').textContent = 'Luz restante';

  if (min < amanecer) {
    card.classList.add('noche');
    el.textContent = `Amanece en ${hm(amanecer - min)}`;
    $('#luz-fill').style.width = '0%';
  } else if (min < ocaso) {
    card.classList.remove('noche');
    const q = ocaso - min;
    el.textContent = `${Math.floor(q / 60)}h ${pad(Math.floor(q % 60))}m`;
    $('#luz-fill').style.width = ((min - amanecer) / (ocaso - amanecer) * 100).toFixed(1) + '%';
  } else if (min < crep) {
    card.classList.add('noche');
    el.textContent = `Crepúsculo · ${Math.round(crep - min)} min`;
    $('#luz-fill').style.width = '100%';
  } else {
    card.classList.add('noche');
    el.textContent = d.luna <= 30 ? `Noche · luna ${d.luna}%` : 'Noche';
    $('#luz-fill').style.width = '100%';
  }
}

// ─────────────────────────── LOS 14 DÍAS ───────────────────────────
function pintarDias() {
  const hy = hoyISO();
  $('#dias-lista').innerHTML = VIAJE.dias.map(d => {
    const es = d.fecha === hy, pas = d.fecha < hy;
    return `<div class="dia ${es ? 'hoy' : ''} ${pas ? 'pasado' : ''}" data-d="${d.d}">
      <button class="dia-t">
        <span class="dia-n"><b>${d.d}</b><small>${FECHA_CORTA(d.fecha)}</small></span>
        <span class="dia-c"><strong>${d.plan}</strong>
          <small>${d.km} km · ${hm(d.manejo_min)} · luz ${hm(d.luz_min)}</small></span>
        <span class="dia-r">
          ${d.dormir ? `<span class="estado ${d.dormir.estado}">${d.dormir.lugar}</span>` : '<span class="estado">vuelo</span>'}
          <span class="luna">luna ${d.luna}%</span></span>
      </button>
      <div class="dia-body" hidden></div>
    </div>`;
  }).join('');

  $$('.dia-t').forEach(b => b.onclick = () => {
    const wrap = b.parentElement, body = $('.dia-body', wrap);
    if (!body.hidden) { body.hidden = true; return; }
    const d = VIAJE.dias[+wrap.dataset.d];
    body.innerHTML = `
      <div class="card"><div class="card-head"><h2>Sol</h2></div>
        <div class="luz-pies" style="margin:0">
          <span>Amanece <b>${d.amanecer}</b></span><span>Ocaso <b>${d.ocaso}</b></span>
          <span>Crepúsculo <b>${d.crep_fin}</b></span></div></div>
      <div class="card"><h2 style="margin-bottom:8px">Paradas</h2>
        <ol class="paradas">${d.puntos.map((p, i) => `
          <li class="cat-${p.cat || 'Interés'}"><span class="num">${i + 1}</span>
            <span class="np"><strong>${p.n}</strong>${p.nota ? `<small>${p.nota}</small>` : ''}</span>
            <a class="go" href="${mapaURL(p.lat, p.lon, p.n)}">Mapa</a></li>`).join('')}</ol></div>
      ${d.servicios?.length ? `<div class="card"><h2 style="margin-bottom:8px">Gasolina y provisiones</h2>${servicios(d.servicios)}</div>` : ''}
      ${d.avisos.map(aviso).join('')}`;
    body.hidden = false;
  });

  const j = $('#hoy-jump');
  if (diaDeHoy()) { j.hidden = false; j.onclick = () => { ir('dias'); $(`.dia[data-d="${diaDeHoy().d}"] .dia-t`).click(); }; }
}

// ─────────────────────────── CARRETERAS ───────────────────────────
// El feed de Vegagerðin no manda CORS. Una GitHub Action lo copia al repo cada
// 30 min, así que esto es una petición al mismo dominio: sin CORS y cacheable.
async function cargarVias() {
  const r = $('#vias-resumen');
  try {
    const d = await fetch('data/carreteras.json', { cache: 'no-cache' }).then(x => x.json());
    LS.set('vias', { t: Date.now(), d });
    renderVias(d);
  } catch {
    const g = LS.get('vias');
    if (g) { renderVias(g.d); r.insertAdjacentHTML('beforeend', '<p class="nota">No se pudo actualizar. Esto es lo último guardado.</p>'); }
    else r.innerHTML = '<p class="muted">Sin datos todavía. Necesita una carga con señal.</p>';
  }
}

function renderVias(d) {
  const s = d.resumen, algo = d.tramos.filter(t => t.v !== 'ok');
  const hace = (() => {
    const m = Math.round((Date.now() - Date.parse(d.actualizado)) / 60000);
    return m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`;
  })();

  $('#vias-resumen').innerHTML = `
    <div class="card-head"><h2>Resumen de la ruta</h2><span class="edad">Vegagerðin · ${hace}</span></div>
    <div class="vias-cifras">
      <div class="vc ok"><b>${s.ok}</b><span>transitables</span></div>
      <div class="vc ojo"><b>${s.ojo}</b><span>con algo</span></div>
      <div class="vc grave"><b>${s.grave}</b><span>graves</span></div>
    </div>
    ${s.grave ? '<p class="nota" style="border-color:var(--bad);color:var(--bad)">Hay tramos intransitables o cerrados. Revisen cuáles antes de salir.</p>' : ''}`;

  $('#vias-ojo').innerHTML = algo.length
    ? algo.map(fila).join('')
    : '<p class="muted">Nada. Los tramos de su ruta están todos en Greiðfært.</p>';
  $('#vias-todos').innerHTML = d.tramos.map(fila).join('');

  // cámaras del día
  const dia = diaActivo();
  $('#cam-hora').textContent = 'en vivo';
  $('#cam-grid').innerHTML = (dia.camaras || []).length
    ? dia.camaras.map(c => `
        <figure class="cam">
          <img loading="lazy" src="${c.img}?t=${Math.floor(Date.now() / 3e5)}" alt="${c.n}"
               onerror="this.parentElement.classList.add('rota')">
          <figcaption><strong>${c.n}</strong><small>${c.d || ''} · a ${c.km} km</small></figcaption>
        </figure>`).join('')
    : '<p class="muted">No hay cámaras cerca de la ruta de hoy.</p>';
}

const fila = t => `<div class="via ${t.v}">
  <span class="via-n">${t.n}</span>
  <span class="via-e">${t.e}</span>
  ${t.a ? `<span class="via-a">${t.a}</span>` : ''}
</div>`;

$('#vias-refrescar').onclick = cargarVias;

// ─────────────────────────── CLIMA ───────────────────────────
// Open-Meteo: sin llave, CORS abierto, verificado el 8 de septiembre de 2026.
// El pronóstico solo llega a 16 días. Pedir más allá devuelve 400, así que ni lo intentamos.
const ALCANCE_DIAS = 16;
const diasVista = f => Math.round((Date.parse(f) - Date.parse(hoyISO())) / 864e5);

async function cargarClima() {
  const cuerpo = $('#clima-cuerpo');
  const objetivo = VIAJE.dias
    .filter(d => { const v = diasVista(d.fecha); return v >= 0 && v < ALCANCE_DIAS; })
    .map(d => {
      const p = d.puntos[Math.floor(d.puntos.length / 2)] || d.puntos[0];
      return { d: d.d, fecha: d.fecha, nombre: p.n, lat: p.lat, lon: p.lon };
    });

  if (!objetivo.length) {
    const primera = VIAJE.dias[0].fecha, v = diasVista(primera);
    LS.set('clima', { t: Date.now(), dias: {}, espera: v - ALCANCE_DIAS + 1 });
    renderClima(LS.get('clima')); renderVientoHoy(LS.get('clima'));
    return;
  }

  cuerpo.innerHTML = '<p class="muted">Consultando…</p>';
  try {
    const res = await Promise.all(objetivo.map(o =>
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${o.lat}&longitude=${o.lon}`
        + `&hourly=temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation,cloud_cover`
        + `&start_date=${o.fecha}&end_date=${o.fecha}&timezone=GMT`)
        .then(r => r.ok ? r.json() : null).catch(() => null)));
    const datos = { t: Date.now(), dias: {} };
    objetivo.forEach((o, i) => { if (res[i]?.hourly) datos.dias[o.d] = { nombre: o.nombre, h: res[i].hourly }; });
    LS.set('clima', datos);
    renderClima(datos); renderVientoHoy(datos);
  } catch {
    cuerpo.innerHTML = '<p class="muted">No se pudo. Reintenta con señal.</p>';
  }
}
$('#clima-refrescar').onclick = cargarClima;

const nivel = g => g >= 25 ? 4 : g >= 20 ? 3 : g >= 15 ? 2 : 1;
const edadTxt = t => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`;
};

function renderClima(datos) {
  $('#clima-edad').textContent = 'Descargado ' + edadTxt(datos.t);
  const hay = Object.keys(datos.dias).length;
  if (!hay) {
    const e = datos.espera;
    $('#clima-cuerpo').innerHTML = `<div class="card"><h2>Todavía no hay pronóstico</h2>
      <p class="sub" style="margin-bottom:0">El pronóstico llega a 16 días vista.
      ${e > 0 ? `El primer día del viaje aparece en <b>${e} día${e === 1 ? '' : 's'}</b>` : 'Los primeros días ya deberían aparecer'},
      y el viaje completo hacia el 27 de septiembre. Vuelve entonces y toca Actualizar.</p></div>`;
    return;
  }
  $('#clima-cuerpo').innerHTML = VIAJE.dias.map(d => {
    const c = datos.dias[d.d];
    if (!c) return '';
    const idx = c.h.time.map((t, i) => [+t.slice(11, 13), i]).filter(([h]) => h >= 7 && h <= 21);
    const maxG = Math.max(...idx.map(([, i]) => c.h.wind_gusts_10m[i] || 0));
    return `<div class="card">
      <div class="card-head"><h2>Día ${d.d} · ${FECHA_CORTA(d.fecha)} · ${c.nombre}</h2>
        <span class="pill">ráfaga máx ${Math.round(maxG)} m/s</span></div>
      <div class="horas-grid">${idx.map(([h, i]) => {
        const g = Math.round(c.h.wind_gusts_10m[i] || 0);
        return `<div class="h g${nivel(g)}"><div class="hh">${pad(h)}h</div>
          <div class="hg">${g}</div><div class="ht">${Math.round(c.h.temperature_2m[i])}°</div></div>`;
      }).join('')}</div>
      ${maxG >= 20 ? `<p class="nota" style="border-color:var(--bad)">Con ${Math.round(maxG)} m/s hay que replantear el día. Arriba de 25 cierran carreteras a vehículos altos.</p>`
        : maxG >= 15 ? '<p class="nota">Cuidado al abrir las puertas del auto.</p>' : ''}
    </div>`;
  }).join('');
}

function renderVientoHoy(datos) {
  const d = diaActivo(), c = datos.dias[d.d];
  $('#viento-edad').textContent = edadTxt(datos.t);
  if (!c) {
    $('#viento-cuerpo').innerHTML = datos.espera > 0
      ? `<p class="muted">El pronóstico llega a 16 días vista. Aparece en ${datos.espera} día${datos.espera === 1 ? '' : 's'}.</p>`
      : '<p class="muted">Todavía sin pronóstico para esta fecha.</p>';
    return;
  }
  const n = ahoraISL(), h = n.getUTCHours();
  const i = c.h.time.findIndex(t => +t.slice(11, 13) === h);
  const g = Math.round(c.h.wind_gusts_10m[i >= 0 ? i : 12] || 0);
  const nv = nivel(g);
  const msg = ['', 'Sin problema.', 'Sujeta bien la puerta al abrir. Avísense en voz alta.',
    'Vendaval. Reconsideren las paradas expuestas.', 'Cierran carreteras a vehículos altos. Revisen umferdin.is antes de salir.'][nv];
  const col = ['', 'var(--ok)', 'var(--warn)', 'var(--hot)', 'var(--bad)'][nv];
  $('#viento-cuerpo').innerHTML = `<div class="viento-hoy">
      <span class="vg" style="color:${col}">${g}</span><span class="vu">m/s de ráfaga</span></div>
    <p class="viento-msg" style="color:${col}">${msg}</p>`;
}

// ─────────────────────────── AURORAS ───────────────────────────
async function cargarKp() {
  try {
    const r = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json');
    const j = await r.json();
    const filas = j.slice(1).map(f => ({ t: f[0], kp: parseFloat(f[1]) }));
    const datos = { t: Date.now(), filas: filas.slice(0, 24) };
    LS.set('kp', datos); renderKp(datos);
  } catch { $('#kp-cuerpo').innerHTML = '<p class="muted">No se pudo. Reintenta con señal.</p>'; }
}
$('#aurora-refrescar').onclick = cargarKp;

function renderKp(datos) {
  $('#kp-edad').textContent = edadTxt(datos.t);
  const max = Math.max(...datos.filas.map(f => f.kp));
  const col = max >= 5 ? 'var(--ok)' : max >= 3 ? 'var(--warn)' : 'var(--tx3)';
  const txt = max >= 5 ? 'Tormenta geomagnética. Si el cielo está despejado, salgan.'
    : max >= 3 ? 'Visible desde zonas oscuras si no hay nubes.'
    : 'Actividad baja. Se necesitaría cielo muy limpio y estar lejos de luces.';
  $('#kp-cuerpo').innerHTML = `<div class="kp"><b style="color:${col}">${max.toFixed(1)}</b>
    <span class="muted">máximo previsto<br>en las próximas 24 h</span></div>
    <p style="margin-top:10px;font-size:14px">${txt}</p>
    <p class="nota">El Kp solo dice si hay actividad. Lo que decide de verdad es la nubosidad — revisen
    <a href="https://en.vedur.is/weather/forecasts/aurora" target="_blank" rel="noopener">el mapa de nubes de vedur.is</a>.</p>`;
}

function pintarNoches() {
  // Tres cosas deciden una noche de auroras: qué tan oscuro está el cielo donde duermes,
  // cuánta luna hay, y si el día siguiente te deja dormir. Trasnochar cuesta ~6 h de sueño.
  const filas = VIAJE.dias.slice(0, 13).filter(d => d.dormir).map(d => {
    const sig = VIAJE.dias[d.d + 1];
    const carga = sig ? sig.manejo_min + (sig.puntos.length - 2) * 35 : 0;
    const holgura = sig ? sig.luz_min - carga : 300;
    const cielo = d.dormir.cielo ?? 0.7;
    const puntos = cielo * 45                        // oscuridad del sitio
                 + (100 - d.luna) / 100 * 35         // luna
                 + Math.min(holgura, 300) / 300 * 20; // poder dormir al día siguiente
    return { d, holgura, cielo, puntos };
  }).sort((a, b) => b.puntos - a.puntos);

  $('#noches-lista').innerHTML = filas.map((f, i) => {
    const r = i < 3 ? 'si' : f.puntos >= 62 ? 'tal' : 'no';
    const et = i < 3 ? 'Sí' : f.puntos >= 62 ? 'Tal vez' : 'Mejor dormir';
    const razon = f.holgura < 150
      ? 'El día siguiente arranca temprano y va apretado'
      : `Al día siguiente sobran ${hm(f.holgura)}`;
    const ciudad = f.cielo < 0.5 ? ' · <b>hay que salir de la ciudad</b>' : '';
    return `<div class="noche">
      <span class="nd">${FECHA_CORTA(f.d.fecha)}</span>
      <span class="nc"><strong>${f.d.dormir.lugar}</strong>
        <small>Luna ${f.d.luna}%${ciudad} · ${razon}</small>
        ${f.d.dormir.mirador ? `<small style="color:var(--tx2)">↳ ${f.d.dormir.mirador}</small>` : ''}</span>
      <span class="nr"><span class="rank ${r}">${et}</span></span></div>`;
  }).join('');
}

// ─────────────────────────── CERCA DE MÍ ───────────────────────────
$('#btn-ubic').onclick = () => {
  const c = $('#cerca-cuerpo');
  c.innerHTML = '<p class="muted">Buscando…</p>';
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: la, longitude: lo } = pos.coords;
    const grupos = [[0, 'Gasolina'], [1, 'Supermercado'], [5, 'Baño']];
    c.innerHTML = grupos.map(([tipo, etiqueta]) => {
      const cand = POI.p.filter(p => p[0] === tipo)
        .map(p => ({ p, km: dist(la, lo, p[1], p[2]) }))
        .sort((a, b) => a.km - b.km).slice(0, 2);
      return cand.map(({ p, km }) => `<div class="kv">
        <span>${etiqueta}</span>
        <b><a href="${mapaURL(p[1], p[2], p[3] || etiqueta)}">${p[3] || 'sin nombre'} · ${km.toFixed(1)} km</a></b>
      </div>`).join('');
    }).join('');
  }, () => {
    c.innerHTML = '<p class="muted">No se pudo obtener la ubicación. Revisa el permiso en Ajustes.</p>';
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
};

// ─────────────────────────── EL SOBRE ───────────────────────────
function pintarSobre() {
  const a = LS.get('auto', {});
  $('#auto-cuerpo').innerHTML = `
    <div class="kv"><span>Placa</span><b>${a.placa || '— anotarla al recoger'}</b></div>
    <div class="kv"><span>Asistencia 24 h</span><b>${a.tel ? `<a href="tel:${a.tel.replace(/\s/g, '')}">${a.tel}</a>` : '— sacarlo del voucher'}</b></div>
    <div class="kv"><span>Reserva</span><b>${a.ref || '<span style="color:var(--tx3)">sin capturar</span>'}</b></div>
    <div class="kv"><span>Recoger</span><b>KEF · 30 sep 07:30</b></div>
    <div class="kv"><span>Entregar</span><b>KEF · 13 oct 14:00</b></div>
    <button class="ghost" style="margin-top:12px;width:100%" onclick="editarAuto()">Editar datos del auto</button>`;

  const p = LS.get('privado', {});
  const con = VIAJE.dias.filter(d => d.dormir);
  $('#privado-cuerpo').innerHTML = con.map(d => {
    const v = p[d.fecha] || {};
    return `<div class="kv"><span>${FECHA_CORTA(d.fecha)} · ${d.dormir.lugar}</span>
      <b>${v.ref ? v.ref : '<span style="color:var(--tx3)">sin capturar</span>'}${v.tel ? `<br><a href="tel:${v.tel.replace(/\s/g, '')}">${v.tel}</a>` : ''}</b></div>`;
  }).join('');
}

window.editarAuto = () => {
  const a = LS.get('auto', {});
  const placa = prompt('Placa del auto', a.placa || ''); if (placa === null) return;
  const tel = prompt('Teléfono de asistencia 24 h de la rentadora', a.tel || '');
  const ref = prompt('Número de reserva del auto', a.ref || '');
  LS.set('auto', { ...a, placa, tel: tel ?? a.tel, ref: ref ?? a.ref });
  pintarSobre();
};

$('#btn-privado').onclick = () => {
  const p = LS.get('privado', {});
  const con = VIAJE.dias.filter(d => d.dormir);
  const lista = con.map((d, i) => `${i + 1}. ${FECHA_CORTA(d.fecha)} ${d.dormir.lugar}`).join('\n');
  const n = prompt(`¿Cuál editas?\n\n${lista}`);
  const i = parseInt(n) - 1;
  if (isNaN(i) || !con[i]) return;
  const f = con[i].fecha, v = p[f] || {};
  const ref = prompt('Código de reserva', v.ref || ''); if (ref === null) return;
  const tel = prompt('Teléfono del alojamiento (+354 …)', v.tel || '');
  const dir = prompt('Dirección', v.dir || '');
  const co  = prompt('Coordenadas "lat,lon" (opcional)', v.lat ? `${v.lat},${v.lon}` : '');
  const nu = { ref, tel, dir };
  if (co && co.includes(',')) { const [x, y] = co.split(',').map(s => parseFloat(s.trim())); if (!isNaN(x)) { nu.lat = x; nu.lon = y; } }
  LS.set('privado', { ...p, [f]: nu });
  pintarSobre(); pintarHoy();
};

// ─────────────────────────── PENDIENTES ───────────────────────────
const TAREAS = [
  { id: 'eta',      f: '2026-09-08', t: 'Confirmar si el "ETA ✓" es el de Canadá',
    n: 'México es país con visa para Canadá desde feb-2024. Solo califican para eTA si tienen visa americana vigente o tuvieron visa canadiense en los últimos 10 años. Hacen escala en Toronto y Canadá obliga a pasar migración. Es el único error sin arreglo en el aeropuerto.' },
  { id: 'cueva',    f: '2026-09-10', t: 'Reservar el tour de cueva de hielo',
    n: 'Sí operan el 7-8 de octubre, contra lo que suele decirse. Local Guide ya marca esos días en ámbar. Arctic Adventures USD 182, Glacier Guides EUR 155.' },
  { id: 'blue',     f: '2026-09-10', t: 'Reservar Blue Lagoon, franja 09:00 del 30 de septiembre',
    n: 'Resuelve las 7 horas muertas entre aterrizar y el check-in. A 20 km de KEF. Reserva obligatoria por franja.' },
  { id: 'vik',      f: '2026-09-12', t: 'Mover Vík del 8-9 al 9-10 de octubre',
    n: 'Se paga el 21 de septiembre y no tiene fecha de cancelación anotada. Verificar disponibilidad ANTES de cancelar.' },
  { id: 'myvatn',   f: '2026-09-12', t: 'Mover Mývatn del 3-5 al 4-6 de octubre',
    n: 'Dos noches. Se paga el 23 de septiembre, sin fecha de cancelación anotada.' },
  { id: 'akureyri', f: '2026-09-14', t: 'Reservar Akureyri para el 3 de octubre',
    n: 'La noche que faltaba y que causaba el desfase.' },
  { id: 'rentadora',f: '2026-09-10', t: 'Escribir a la rentadora, por escrito',
    n: '¿Llantas de invierno sin clavos desde el 30 de septiembre? ¿Monto del depósito? ¿Teléfono de asistencia 24 h? ¿El impuesto por kilómetro es tarifa fija de 1,390-1,550 ISK/día o por km real a 8.69-8.81?' },
  { id: 'amex',     f: '2026-09-10', t: 'Llamar a Amex México',
    n: '¿La cobertura de auto rentado aplica en Islandia y cubre grava, ceniza, viento y agua? Casi ninguna las cubre, y son justo los riesgos islandeses.' },
  { id: 'seguro',   f: '2026-09-14', t: 'Contratar seguro médico de viaje',
    n: 'México no tiene convenio con Islandia. Urgencias: 88,557 ISK solo por llegar. El rescate en montaña sí es gratuito.' },
  { id: 'egils',    f: '2026-09-26', t: 'Mover Egilsstaðir del 5-6 al 6-7 de octubre',
    n: 'Cancelación gratis hasta el 28 de septiembre.' },
  { id: 'hofn',     f: '2026-09-27', t: 'Mover Höfn del 6-7 al 7-8 de octubre',
    n: 'Cancelación gratis hasta el 29 de septiembre.' },
  { id: 'klaustur', f: '2026-09-28', t: 'Mover Kirkjubæjarklaustur del 7-8 al 8-9 de octubre',
    n: 'Ya está cobrada. Cancelación gratis hasta el 30 de septiembre.' },
  { id: 'selfoss',  f: '2026-09-16', t: 'Reservar Selfoss o Flúðir · 10 de octubre', n: '' },
  { id: 'rvk',      f: '2026-09-16', t: 'Reservar Reikiavik · 11 y 12 de octubre', n: 'Dos noches.' },
  { id: 'toronto',  f: '2026-09-16', t: 'Reservar hotel en Toronto · 13 de octubre',
    n: 'Aterrizan 19:10 y salen 11:00 del día siguiente. Esa noche no estaba en ninguna hoja.' },
  { id: 'datos',    f: '2026-09-20', t: 'Plan de datos · eSIM sobre la red de Síminn',
    n: 'Síminn es la de mejor cobertura rural. Nova es la más barata y la peor fuera de Reikiavik.' },
  { id: 'nip',      f: '2026-09-20', t: 'Activar el NIP de 4 dígitos en dos tarjetas Visa o Mastercard',
    n: 'Las bombas desatendidas lo piden y retienen entre 22,000 y 30,000 ISK. Amex no funciona ahí.' },
  { id: 'mapas',    f: '2026-09-24', t: 'Descargar mapas offline en los dos teléfonos',
    n: 'Google Maps en tres áreas: suroeste, norte y este. Más Organic Maps como respaldo, que sí busca nombres islandeses sin internet.' },
  { id: 'ios',      f: '2026-09-20', t: 'Actualizar iOS en los dos teléfonos y no volver a actualizar',
    n: 'Una actualización mayor a mitad del viaje puede romper el modo offline.' },
  { id: 'prueba',   f: '2026-09-21', t: 'Probar esta app en modo avión, un día entero, en los dos teléfonos',
    n: 'No negociable. Si el service worker no intercepta la navegación, la app abre en blanco sin señal.' },
  { id: 'playlist', f: '2026-09-24', t: 'Descargar playlists y podcasts', n: 'Son unas 40 horas de manejo.' },
  { id: 'skogafoss',f: '2026-09-24', t: 'Investigar el hiking en Skógafoss', n: 'La escalera al mirador y el sendero Fimmvörðuháls.' },
  { id: 'termo',    f: '2026-09-26', t: 'Toallas, chanclas, bolsa, termo y bolsita de agua', n: '' },
  { id: 'hotdog',   f: '2026-10-12', t: 'Hot dog de Bæjarins Beztu y la granja de tiburones', n: 'Lo importante.' },
];

function pintarPendientes() {
  const hechas = LS.get('hechas', {});
  const hy = hoyISO();
  const ord = [...TAREAS].sort((a, b) => (hechas[a.id] ? 1 : 0) - (hechas[b.id] ? 1 : 0) || a.f.localeCompare(b.f));
  $('#pend-lista').innerHTML = ord.map(t => {
    const done = !!hechas[t.id];
    const dd = Math.round((Date.parse(t.f) - Date.parse(hy)) / 864e5);
    const cls = done ? 'listo' : dd <= 2 ? 'urge' : dd <= 7 ? 'pronto' : '';
    const et = done ? 'hecho' : dd < 0 ? `hace ${-dd} d` : dd === 0 ? 'hoy' : `en ${dd} d`;
    return `<label class="pend ${cls}">
      <input type="checkbox" data-id="${t.id}" ${done ? 'checked' : ''}>
      <span class="pc"><strong>${t.t}</strong>${t.n ? `<small>${t.n}</small>` : ''}</span>
      <span class="pd">${et}</span></label>`;
  }).join('');

  $$('#pend-lista input').forEach(i => i.onchange = () => {
    const h = LS.get('hechas', {}); h[i.dataset.id] = i.checked; LS.set('hechas', h); pintarPendientes();
  });

  const faltan = TAREAS.filter(t => !hechas[t.id]).length;
  const urgen = TAREAS.filter(t => !hechas[t.id] && Math.round((Date.parse(t.f) - Date.parse(hy)) / 864e5) <= 2).length;
  $('#pend-resumen').textContent = `${faltan} pendientes · ${urgen} vencen en 48 horas`;
  const b = $('#pend-badge'); b.hidden = !urgen; b.textContent = urgen;
}

// ─────────────────────────── arranque ───────────────────────────
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
boot();
