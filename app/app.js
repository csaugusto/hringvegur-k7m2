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
const FMT_ESTADO = {
  reservada: 'Reservada',
  mover: 'Hay que mover la fecha',
  por_reservar: 'Sin reservar',
};

let CONSEJOS = [];

async function boot() {
  let ALOJ, CONS;
  try {
    // 'no-cache' obliga a revalidar contra el servidor en vez de creerle al
    // caché del navegador. Sin esto, editar un JSON no se refleja hasta que el
    // caché caduca solo. Sin señal no estorba: el service worker responde antes.
    const dato = u => fetch(u, { cache: 'no-cache' }).then(r => r.json());
    [VIAJE, POI, ALOJ, CONS] = await Promise.all([
      dato('data/viaje.json'),
      dato('data/poi.json'),
      dato('data/alojamientos.json'),
      dato('data/consejos.json').catch(() => ({ consejos: [] }))
    ]);
  } catch (e) {
    document.body.innerHTML = '<p style="padding:40px;text-align:center">No se pudieron cargar los datos.<br><small>Recarga la página con señal una vez.</small></p>';
    return;
  }

  // Los alojamientos viven aparte porque son lo único que se edita a mano,
  // incluso desde el teléfono a media carretera. Aquí se mezclan con el itinerario.
  for (const d of VIAJE.dias) {
    const a = ALOJ.alojamientos?.[d.fecha];
    if (!a) { d.dormir = null; continue; }
    d.dormir = { ...(d.dormir || {}), ...a, estado_txt: FMT_ESTADO[a.estado] || a.estado };
  }

  // Consejos de guías y posts. Los que traen fecha caen en su día; los que traen
  // un punto, bajo esa parada; el resto vive en la Guía.
  CONSEJOS = (CONS.consejos || []).filter(c => c.que);
  for (const d of VIAJE.dias) {
    const nombres = new Set(d.puntos.map(p => p.n));
    for (const c of CONSEJOS) {
      const porDia = c.dia === d.fecha;
      const porPunto = c.punto && nombres.has(c.punto);
      if (porDia || porPunto) {
        d.avisos = [...(d.avisos || []),
          { t: c.tipo || 'tip', x: (porPunto && !porDia ? `${c.punto}: ` : '') + c.que }];
      }
    }
  }
  pintarHoy(); pintarDias(); pintarNoches(LS.get('nubes')?.d); pintarSobre();
  pintarPasosGas();
  pintarGasLog();
  pintarAlertas(LS.get('alertas'));
  pintarEstaciones(LS.get('est')?.d);
  pintarConversor(LS.get('fx'));
  cargarTasa().then(pintarConversor);
  setInterval(tickLuz, 1000); tickLuz();

  // Traer clima si hay red y el caché ya venció
  if (navigator.onLine) {
    const c = LS.get('clima');
    if (!c || Date.now() - c.t > 3 * 3600e3) cargarClima();
    else { renderVientoHoy(c); renderClima(c); }
    const k = LS.get('kp');
    if (!k || Date.now() - k.t > 3600e3) cargarKp(); else renderKp(k);
    cargarVias();
    cargarGasolina();
    cargarAlertas().then(pintarAlertas);
    cargarNubes().then(pintarNoches);
    cargarEstaciones().then(pintarEstaciones);
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
  // Las cámaras solo se piden con la pestaña a la vista, así que hay que
  // arrancarlas al entrar: en el arranque esta vista está oculta y no cargan.
  if (v === 'carreteras') refrescarCamaras();
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

// Esquemas nativos y no URLs https: abren la app instalada sin resolver nada
// en la red, y el mapa ya tiene los tiles descargados.
const APPS_MAPA = {
  apple:  { n: 'Apple Maps',   ver: (la, lo, q) => `maps://?ll=${la},${lo}&q=${encodeURIComponent(q)}`,
                               ir:  (la, lo)    => `maps://?daddr=${la},${lo}&dirflg=d` },
  google: { n: 'Google Maps',  ver: (la, lo)    => `comgooglemaps://?q=${la},${lo}&center=${la},${lo}&zoom=14`,
                               ir:  (la, lo)    => `comgooglemaps://?daddr=${la},${lo}&directionsmode=driving` },
};
const appMapa = () => APPS_MAPA[LS.get('mapa', 'apple')] || APPS_MAPA.apple;
const mapaURL = (lat, lon, n) => appMapa().ver(lat, lon, n);
const rutaURL = (lat, lon) => appMapa().ir(lat, lon);

const dist = (a, b, c, d) => {
  const R = 6371, r = Math.PI / 180;
  const x = (c - a) * r, y = (d - b) * r;
  const h = Math.sin(x/2)**2 + Math.cos(a*r) * Math.cos(c*r) * Math.sin(y/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// ─────────────────────────── HOY ───────────────────────────
function pintarHoy() {
  const d = diaActivo(), esHoy = !!diaDeHoy();
  // La antefirma dice cuándo estamos; el título, qué toca. Manda el plan del día.
  $('#hoy-kicker').innerHTML =
    `<b>Día ${d.d} de ${VIAJE.dias.length - 1}</b> ${FECHA_LARGA(d.fecha)}`;
  const tit = $('#hoy-titulo');
  tit.textContent = d.plan;
  // Los planes van de 9 a 58 caracteres: el titular se achica en vez de romperse.
  tit.className = d.plan.length > 42 ? 't-xl' : d.plan.length > 26 ? 't-l' : '';

  if (!esHoy) {
    const faltan = Math.ceil((Date.UTC(...VIAJE.dias[0].fecha.split('-').map((v, i) => i === 1 ? v - 1 : +v)) - ahoraISL()) / 864e5);
    const n = $('#hoy-precuenta');
    n.hidden = false;
    n.innerHTML = `Faltan <b>${faltan}</b> días para volar.`;
  }

  // dormir
  const dm = d.dormir, box = $('#hoy-dormir');
  if (!dm) {
    box.innerHTML = `<h2>Hoy vuelan</h2><p class="dormir-lugar">Keflavík 17:05</p>
      <p class="sub">Entrega del auto a las 14:00. Salgan de Reikiavik a las 12:00.</p>`;
  } else {
    const priv = LS.get('privado', {})[d.fecha] || {};
    const tel  = dm.tel  || priv.tel;            // el archivo manda; el teléfono complementa
    const dirn = dm.direccion || priv.dir;
    const lat  = dm.lat ?? priv.lat, lon = dm.lon ?? priv.lon;
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
        ${lat ? `<a href="${rutaURL(lat, lon)}">Cómo llegar</a>` : ''}
        ${dm.url ? `<a href="${dm.url}" target="_blank" rel="noopener">Booking</a>` : ''}
      </div>
      ${dm.cierre ? `<p class="nota">Corte duro a las ${dm.cierre}. Si van a llegar después, avisen hoy mismo mientras haya señal.</p>` : ''}
      ${dm.llegada_tarde ? `<p class="nota">Llegada tardía: ${dm.llegada_tarde}</p>` : ''}
      ${dm.desayuno ? `<p class="nota">Desayuno: ${dm.desayuno}</p>` : ''}
      ${dm.notas ? `<p class="nota">${dm.notas}</p>` : ''}`;
  }

  // ruta
  $('#hoy-cifras').textContent = `${d.km} km · ${hm(d.manejo_min)} manejando`;
  $('#hoy-paradas').innerHTML = d.puntos.map((p, i) => `
    <li class="cat-${p.cat || 'Interés'}">
      <span class="num">${i + 1}</span>
      <span class="np"><strong>${p.n}</strong>${p.nota ? `<small>${p.nota}</small>` : (p.cat === 'Opcional' ? '<small>opcional</small>' : '')}</span>
      <a class="go" href="${mapaURL(p.lat, p.lon, p.n)}">Mapa</a>
    </li>`).join('');

  // peligro de olas, solo si hoy pasan por Reynisfjara
  pintarOlas(d);

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

const ICONO = { peaje: '⊘', ruta: '⇱', acceso: '⌂', peligro: '⚠', reserva: '◷', dinero: '¤', tip: '•' };
const TITULO = { peaje: 'Peaje', ruta: 'Carretera', acceso: 'Acceso', peligro: 'Peligro', reserva: 'Reservar', dinero: 'Dinero', tip: 'Consejo' };
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

  // No es adorno: el fondo se oscurece solo cuando de verdad oscurece afuera.
  document.documentElement.dataset.luz =
      (min < amanecer - 55 || min > crep) ? 'noche'
    : (min < amanecer + 55)               ? 'amanecer'
    : (min > ocaso - 70)                  ? 'ocaso'
    :                                       'dia';

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
          <small>${d.km} km · ${hm(d.manejo_min)} · luz ${hm(d.luz_min)}</small>
          <span class="dia-r">
            ${d.dormir ? `<span class="estado ${d.dormir.estado}">${d.dormir.lugar}</span>` : '<span class="estado">vuelo</span>'}
            <span class="luna">luna ${d.luna}%</span></span></span>
      </button>
      <div class="dia-body" hidden></div>
    </div>`;
  }).join('');

  $$('.dia-t').forEach(b => b.onclick = () => {
    const wrap = b.parentElement, body = $('.dia-body', wrap);
    if (!body.hidden) { body.hidden = true; return; }
    const d = VIAJE.dias[+wrap.dataset.d];
    body.innerHTML = `
      <section class="bloque"><h2>Sol</h2>
        <div class="luz-pies" style="margin-top:10px">
          <span>Amanece <b>${d.amanecer}</b></span><span>Ocaso <b>${d.ocaso}</b></span>
          <span>Crepúsculo <b>${d.crep_fin}</b></span></div></section>
      <section class="bloque"><h2 style="margin-bottom:10px">Paradas</h2>
        <ol class="paradas">${d.puntos.map((p, i) => `
          <li class="cat-${p.cat || 'Interés'}"><span class="num">${i + 1}</span>
            <span class="np"><strong>${p.n}</strong>${p.nota ? `<small>${p.nota}</small>` : ''}</span>
            <a class="go" href="${mapaURL(p.lat, p.lon, p.n)}">Mapa</a></li>`).join('')}</ol></section>
      ${d.servicios?.length ? `<section class="bloque"><h2 style="margin-bottom:10px">Gasolina y provisiones</h2>${servicios(d.servicios)}</section>` : ''}
      ${d.avisos.map(aviso).join('')}`;
    body.hidden = false;
  });

  const j = $('#hoy-jump');
  if (diaDeHoy()) { j.hidden = false; j.onclick = () => { ir('dias'); $(`.dia[data-d="${diaDeHoy().d}"] .dia-t`).click(); }; }
}

// ─────────────────────────── REYNISFJARA ───────────────────────────
// Pronóstico oficial de SafeTravel, espejado en el repo porque tampoco manda CORS.
// El color orienta pero NO autoriza: en agosto de 2025 murió una niña de nueve
// años con el semáforo en amarillo.
const COLOR_OLA = { GREEN: 'var(--ok)', YELLOW: 'var(--warn)', ORANGE: 'var(--hot)', RED: 'var(--bad)' };

async function pintarOlas(dia) {
  const caja = $('#hoy-olas');
  if (!dia.puntos.some(p => p.n === 'Reynisfjara')) { caja.hidden = true; return; }
  caja.hidden = false;

  let d = LS.get('olas')?.d;
  if (navigator.onLine) {
    try { d = await fetch('data/reynisfjara.json', { cache: 'no-cache' }).then(r => r.json());
          LS.set('olas', { t: Date.now(), d }); } catch {}
  }
  if (!d) { $('#olas-cuerpo').innerHTML = '<p class="muted">Sin datos. Necesita una carga con señal.</p>'; return; }

  // las horas de hoy con luz, que es cuando van a estar ahí
  const hoy = dia.fecha;
  const hs = d.horas.filter(h => h.t.startsWith(hoy));
  const ahora = hs.length ? hs : d.horas.slice(0, 8);
  const peor = ahora.reduce((p, h) => (['GREEN','YELLOW','ORANGE','RED'].indexOf(h.c) >
                                       ['GREEN','YELLOW','ORANGE','RED'].indexOf(p.c) ? h : p), ahora[0]);

  $('#olas-edad').textContent = d.actualizado ? edadTxt(Date.parse(d.actualizado)) : '';
  $('#olas-cuerpo').innerHTML = `
    <div class="ola-peor" style="border-color:${COLOR_OLA[peor.c]}">
      <strong style="color:${COLOR_OLA[peor.c]}">${peor.color.toUpperCase()}</strong>
      <span>${peor.txt}</span>
    </div>
    <div class="horas-grid" style="margin-top:10px">${ahora.map(h => `
      <div class="h" style="border-color:${COLOR_OLA[h.c]}">
        <div class="hh">${h.t.slice(11, 16)}</div>
        <div class="hg" style="font-size:11px;color:${COLOR_OLA[h.c]}">${h.color}</div>
      </div>`).join('')}</div>
    <p class="alerta">${d.aviso}</p>`;
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

// Cuántas horas de antigüedad convierten el dato en sospechoso. Subir o bajar
// esto según lo que acabe cumpliendo el cron de GitHub; hoy la cadencia real
// ronda las 3 horas, así que 4 avisa de verdad sin volverse ruido de fondo.
const HORAS_VIEJO = 4;
// Abre la pestaña Actions con el botón "Run workflow". Dos toques y 20 segundos:
// más fiable que cualquier cadena automática, porque no se puede romper sola.
const REFRESCAR = 'https://github.com/csaugusto/hringvegur-k7m2/actions/workflows/carreteras.yml';

function renderVias(d) {
  const s = d.resumen, algo = d.tramos.filter(t => t.v !== 'ok');
  // edadTxt sí distingue días; el cálculo que había aquí decía "hace 72 h".
  const t = Date.parse(d.actualizado);
  const hace = edadTxt(t);
  // GitHub descarta la mayoría de las corridas programadas: medido el 10 de
  // septiembre de 2026, sólo corrió 3 de 26 veces en 13 horas. El umbral tiene
  // que reflejar la cadencia REAL o la alerta se enciende siempre y nadie la lee.
  // Lo peligroso no es no tener datos, es que la pantalla diga "0 graves" con la
  // misma cara de siempre cuando en realidad está ciega.
  const viejo = (Date.now() - t) > HORAS_VIEJO * 3600e3;

  $('#vias-resumen').innerHTML = `
    <div class="card-head"><h2>Resumen de la ruta</h2>
      <span class="edad">espejo · ${hace} · <a href="${REFRESCAR}" class="refrescar">refrescar</a></span></div>
    ${viejo ? `<p class="alerta"><b>Estos datos son de ${hace}.</b> El espejo no se está
      actualizando, así que lo de abajo puede estar equivocado.
      <a href="${REFRESCAR}">Refrescar a mano</a> tarda 20 segundos y necesita señal.
      Sin señal, confirmen en <a href="https://umferdin.is/en">umferdin.is</a> o al 1777
      antes de salir.</p>` : ''}
    <div class="vias-cifras">
      <div class="vc ok"><b>${s.ok}</b><span>transitables</span></div>
      <div class="vc ojo${s.ojo ? '' : ' cero'}"><b>${s.ojo}</b><span>con algo</span></div>
      <div class="vc grave${s.grave ? '' : ' cero'}"><b>${s.grave}</b><span>graves</span></div>
    </div>
    ${s.grave ? '<p class="alerta">Hay tramos intransitables o cerrados. <b>Revisen cuáles antes de salir.</b></p>' : ''}`;

  $('#vias-ojo').innerHTML = algo.length
    ? algo.map(fila).join('')
    : '<p class="muted">Nada. Los 339 tramos de la ruta están despejados.</p>';
  $('#vias-todos').innerHTML = d.tramos.map(fila).join('');

  // cámaras del día
  const dia = diaActivo();
  $('#cam-grid').innerHTML = (dia.camaras || []).length
    ? dia.camaras.map(c => `
        <figure class="cam">
          <img loading="lazy" data-src="${c.img}" alt="${c.n}"
               onerror="this.parentElement.classList.add('rota')">
          <figcaption><strong>${c.n}</strong><small>${c.d || ''} · a ${c.km} km</small></figcaption>
        </figure>`).join('')
    : '<p class="muted">No hay cámaras cerca de la ruta de hoy.</p>';
  refrescarCamaras();
}

// Vegagerðin publica fotos, no video: se renuevan cada pocos minutos
// (la propia imagen trae cache-control de 60 s). Volviéndolas a pedir cada
// 45 s con un parámetro distinto, se comportan como un directo lento.
let relojCam = null;
function refrescarCamaras() {
  const imgs = $$('#cam-grid img');
  if (!imgs.length) return;
  let primera = true;
  const recargar = () => {
    // La primera vez siempre se piden. Después solo si la pestaña está de verdad
    // a la vista: no tiene sentido gastar datos refrescando fotos que nadie mira.
    if (!primera && ($('#v-carreteras').hidden || document.hidden)) return;
    primera = false;
    const t = Date.now();
    imgs.forEach(i => { i.parentElement.classList.remove('rota'); i.src = `${i.dataset.src}?t=${t}`; });
    const h = new Date(t + new Date().getTimezoneOffset() * 60000);
    $('#cam-hora').textContent = `${pad(h.getUTCHours())}:${pad(h.getUTCMinutes())} hora de Islandia`;
  };
  recargar();
  clearInterval(relojCam);
  relojCam = setInterval(recargar, 45000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescarCamaras(); });

const fila = t => `<div class="via ${t.v}">
  <span class="via-n">${t.n}</span>
  <span class="via-e">${t.e}</span>
  ${t.isl && t.isl !== t.e ? `<span class="via-isl">${t.isl}</span>` : ''}
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
    $('#clima-cuerpo').innerHTML = `<section class="bloque"><h2>Todavía no hay pronóstico</h2>
      <p class="sub" style="margin-bottom:0">El pronóstico llega a 16 días vista.
      ${e > 0 ? `El primer día del viaje aparece en <b>${e} día${e === 1 ? '' : 's'}</b>` : 'Los primeros días ya deberían aparecer'},
      y el viaje completo hacia el 27 de septiembre. Vuelve entonces y toca Actualizar.</p></section>`;
    return;
  }
  $('#clima-cuerpo').innerHTML = VIAJE.dias.map(d => {
    const c = datos.dias[d.d];
    if (!c) return '';
    const idx = c.h.time.map((t, i) => [+t.slice(11, 13), i]).filter(([h]) => h >= 7 && h <= 21);
    const maxG = Math.max(...idx.map(([, i]) => c.h.wind_gusts_10m[i] || 0));
    return `<section class="bloque">
      <div class="card-head"><h2>Día ${d.d} · ${FECHA_CORTA(d.fecha)} · ${c.nombre}</h2>
        <span class="pill">ráfaga máx ${Math.round(maxG)} m/s</span></div>
      <div class="horas-grid">${idx.map(([h, i]) => {
        const g = Math.round(c.h.wind_gusts_10m[i] || 0);
        return `<div class="h g${nivel(g)}"><div class="hh">${pad(h)}h</div>
          <div class="hg">${g}</div><div class="ht">${Math.round(c.h.temperature_2m[i])}°</div></div>`;
      }).join('')}</div>
      ${maxG >= 20 ? `<p class="alerta">Con ${Math.round(maxG)} m/s hay que replantear el día. Arriba de 25 cierran carreteras a vehículos altos.</p>`
        : maxG >= 15 ? '<p class="nota">Cuidado al abrir las puertas del auto.</p>' : ''}
    </section>`;
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
$('#aurora-refrescar').onclick = () => { cargarKp(); cargarNubes().then(pintarNoches); };

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

// Nubosidad de la ventana de auroras, 20:00 a 02:00, pedida en el punto donde
// DUERMEN esa noche y no en el medio del recorrido del día. El Kp dice si hay
// actividad; las nubes deciden si se ve algo.
async function cargarNubes() {
  const g = LS.get('nubes');
  if (g && Date.now() - g.t < 3 * 3600e3) return g.d;
  if (!navigator.onLine) return g?.d || null;

  const noches = VIAJE.dias.slice(0, 13).filter(d => {
    const v = diasVista(d.fecha);
    return d.dormir && v >= 0 && v < ALCANCE_DIAS - 1;   // hace falta también el día siguiente
  });
  if (!noches.length) {
    // Todavía fuera del alcance del pronóstico: se dice, en vez de callar.
    const v = diasVista(VIAJE.dias[0].fecha) - ALCANCE_DIAS + 2;
    LS.set('nubes', { t: Date.now(), d: {}, espera: v });
    return {};
  }

  try {
    const res = await Promise.all(noches.map(d => {
      const p = d.puntos[d.puntos.length - 1];           // la última parada es donde duermen
      const sig = new Date(Date.parse(d.fecha) + 864e5).toISOString().slice(0, 10);
      return fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}`
        + `&hourly=cloud_cover&start_date=${d.fecha}&end_date=${sig}&timezone=GMT`)
        .then(r => r.ok ? r.json() : null).catch(() => null);
    }));
    const d = {};
    noches.forEach((n, i) => {
      const h = res[i]?.hourly;
      if (!h) return;
      const sig = new Date(Date.parse(n.fecha) + 864e5).toISOString().slice(0, 10);
      // 20:00–23:00 de esa noche y 00:00–02:00 de la madrugada siguiente
      d[n.d] = h.time.map((t, j) => ({ t, c: h.cloud_cover[j] })).filter(x => {
        const hora = +x.t.slice(11, 13);
        return (x.t.startsWith(n.fecha) && hora >= 20) || (x.t.startsWith(sig) && hora <= 2);
      });
    });
    LS.set('nubes', { t: Date.now(), d });
    return d;
  } catch { return g?.d || null; }
}

function pintarNoches(nubes) {
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
  });

  const espera = LS.get('nubes')?.espera;
  $('#nubes-aviso').innerHTML = (nubes && Object.keys(nubes).length) || !espera || espera <= 0
    ? ''
    : `<p class="nota">El pronóstico de nubes llega a 16 días vista: aparece en
       <b>${espera} día${espera === 1 ? '' : 's'}</b>. Hasta entonces el orden solo pesa luna,
       oscuridad del sitio y carga del día siguiente.</p>`;

  // El puntaje decide el veredicto, pero la lista se lee en orden de calendario:
  // sirve para planear la noche que viene, no para consultar un ranking.
  const top3 = new Set([...filas].sort((a, b) => b.puntos - a.puntos).slice(0, 3).map(f => f.d.fecha));

  $('#noches-lista').innerHTML = filas.map(f => {
    const mejor = top3.has(f.d.fecha);
    let r = mejor ? 'si' : f.puntos >= 62 ? 'tal' : 'no';
    let et = mejor ? 'Sí' : f.puntos >= 62 ? 'Tal vez' : 'Mejor dormir';

    // Si ya hay pronóstico de nubes, manda sobre el puntaje: con el cielo
    // tapado da igual que la luna esté nueva y el Kp por las nubes.
    const hs = nubes?.[f.d.d];
    let bloqNubes = '';
    if (hs?.length) {
      const med = Math.round(hs.reduce((s, x) => s + x.c, 0) / hs.length);
      const despejadas = hs.filter(x => x.c <= 35).length;
      if (med >= 80) { r = 'no'; et = 'Nublado'; }
      else if (med >= 55 && r === 'si') { r = 'tal'; et = 'Tal vez'; }
      else if (med <= 30 && r !== 'si') { r = 'si'; et = 'Sí'; }
      bloqNubes = `<div class="nubes">
        <span class="nubes-med">${med}% nubes</span>
        ${hs.map(x => `<i class="${x.c <= 35 ? 'lim' : x.c <= 70 ? 'med' : 'tap'}"
             title="${x.t.slice(11, 16)} · ${x.c}%"></i>`).join('')}
        <span class="nubes-pie">${despejadas ? `${despejadas} h despejadas de 20:00 a 02:00` : 'cielo tapado toda la noche'}</span>
      </div>`;
    }

    const razon = f.holgura < 150
      ? 'El día siguiente arranca temprano y va apretado'
      : `Al día siguiente sobran ${hm(f.holgura)}`;
    const ciudad = f.cielo < 0.5 ? ' · <b>hay que salir de la ciudad</b>' : '';
    return `<div class="noche">
      <span class="nd">${FECHA_CORTA(f.d.fecha)}</span>
      <span class="nc"><strong>${f.d.dormir.lugar}</strong>
        <small>Luna ${f.d.luna}%${ciudad} · ${razon}</small>
        ${f.d.dormir.mirador ? `<small style="color:var(--tx2)">↳ ${f.d.dormir.mirador}</small>` : ''}
        ${bloqNubes}</span>
      <span class="nr"><span class="rank ${r}">${et}</span></span></div>`;
  }).join('');
}

// ─────────────────────────── CERCA DE MÍ ───────────────────────────
// Precios de combustible de Gasvaktin: 245 estaciones con coordenadas y precio
// del día. Tiene CORS abierto, así que se pide directo. Entre la más cara y la
// más barata hay unos 47 ISK/L, que sobre el viaje entero son miles de coronas.
async function cargarGasolina() {
  const g = LS.get('gas');
  if (g && Date.now() - g.t < 12 * 3600e3) return g.d;
  if (!navigator.onLine) return g?.d || null;
  try {
    const j = await fetch('https://raw.githubusercontent.com/gasvaktin/gasvaktin/master/vaktin/gas.json')
      .then(r => r.json());
    const d = j.stations.filter(s => s.geo && s.bensin95).map(s => ({
      n: s.name, c: s.company, p: s.bensin95, pd: s.bensin95_discount,
      di: s.diesel, lat: s.geo.lat, lon: s.geo.lon,
    }));
    LS.set('gas', { t: Date.now(), d });
    return d;
  } catch { return g?.d || null; }
}

$('#btn-ubic').onclick = async () => {
  const c = $('#cerca-cuerpo');
  c.innerHTML = '<p class="muted">Buscando…</p>';
  const gas = await cargarGasolina();
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: la, longitude: lo } = pos.coords;
    let html = '';

    // Gasolina: si hay precios, se muestran las 3 más cercanas con su precio;
    // si no hay red y nunca se cargaron, se cae a los POI de OpenStreetMap.
    if (gas?.length) {
      const cerca = gas.map(s => ({ s, km: dist(la, lo, s.lat, s.lon) }))
        .sort((a, b) => a.km - b.km).slice(0, 3);
      const barata = Math.min(...cerca.map(x => x.s.p));
      html += cerca.map(({ s, km }) => `<div class="kv">
        <span>${s.c}${s.p === barata && cerca.length > 1 ? ' · la más barata' : ''}</span>
        <b><a href="${mapaURL(s.lat, s.lon, s.n)}">${s.n} · ${km.toFixed(1)} km</a>
           <em class="precio${s.p === barata ? ' mejor' : ''}">${s.p} ISK/L</em></b>
      </div>`).join('');
    } else {
      html += POI.p.filter(p => p[0] === 0).map(p => ({ p, km: dist(la, lo, p[1], p[2]) }))
        .sort((a, b) => a.km - b.km).slice(0, 2)
        .map(({ p, km }) => `<div class="kv"><span>Gasolina</span>
          <b><a href="${mapaURL(p[1], p[2], p[3] || 'Gasolina')}">${p[3] || 'sin nombre'} · ${km.toFixed(1)} km</a></b></div>`).join('');
    }

    for (const [tipo, etiqueta] of [[1, 'Supermercado'], [5, 'Baño']]) {
      html += POI.p.filter(p => p[0] === tipo).map(p => ({ p, km: dist(la, lo, p[1], p[2]) }))
        .sort((a, b) => a.km - b.km).slice(0, 2)
        .map(({ p, km }) => `<div class="kv"><span>${etiqueta}</span>
          <b><a href="${mapaURL(p[1], p[2], p[3] || etiqueta)}">${p[3] || 'sin nombre'} · ${km.toFixed(1)} km</a></b></div>`).join('');
    }
    c.innerHTML = html;
  }, () => {
    c.innerHTML = '<p class="muted">No se pudo obtener la ubicación. Revisa el permiso en Ajustes.</p>';
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
};

// ─────────────────────────── EL SOBRE ───────────────────────────
function pintarSobre() {
  // Qué app abren los botones Mapa y Cómo llegar
  const elegida = LS.get('mapa', 'apple');
  $('#mapa-sel').innerHTML = Object.entries(APPS_MAPA).map(([k, v]) =>
    `<button data-m="${k}" class="${k === elegida ? 'on' : ''}">${v.n}</button>`).join('');
  $$('#mapa-sel button').forEach(b => b.onclick = () => {
    LS.set('mapa', b.dataset.m); pintarSobre(); pintarHoy(); pintarDias();
  });
  $('#mapa-nota').innerHTML = elegida === 'google'
    ? 'Abre Google Maps con la ruta trazada. Necesita las áreas offline ya descargadas: suroeste, norte y este.'
    : 'Apple Maps siempre está instalado y desde iOS 17 navega sin conexión.';

  // Los consejos sin fecha ni punto: los generales
  const generales = CONSEJOS.filter(c => !c.dia && !c.punto);
  $('#consejos-cuerpo').innerHTML = generales.length
    ? generales.map(c => aviso({ t: c.tipo || 'tip', x: c.que + (c.fuente ? ` <em style="color:var(--tx3)">— ${c.fuente}</em>` : '') })).join('')
    : '<p class="muted">Todavía no hay consejos generales capturados.</p>';

  const a = LS.get('auto', {});
  // Los tres teléfonos están verificados contra holdurcarrental.is y contra la
  // ficha del aeropuerto en kefairport.com. El de asistencia en carretera es el
  // que sirve a las 3 de la mañana en medio de los fiordos; los otros dos no.
  $('#auto-cuerpo').innerHTML = `
    <a class="tel grande" href="tel:+3544192400"><span>+354 419 2400</span>
      <small>Höldur · asistencia en carretera, 24 horas</small></a>
    <a class="tel" href="tel:+3548406000"><span>+354 840 6000</span>
      <small>Emergencia fuera del horario de oficina</small></a>
    <a class="tel" href="tel:+3544616000"><span>+354 461 6000</span>
      <small>Mostrador de Keflavík y atención a clientes · lun a vie 8-17</small></a>
    ${a.tel ? `<a class="tel" href="tel:${a.tel.replace(/\s/g, '')}"><span>${a.tel}</span>
      <small>El que ustedes anotaron</small></a>` : ''}
    <div class="kv"><span>El auto</span><b>Kia Sportage automático<br><i>«o similar» · preguntar si es 4x4</i></b></div>
    <div class="kv"><span>Placa</span><b>${a.placa || '— anotarla al recoger'}</b></div>
    <div class="kv"><span>Reserva</span><b>${a.ref || '<span style="color:var(--tx3)">sin capturar</span>'}</b></div>
    <div class="kv"><span>Recoger</span><b>KEF · 30 sep 07:30<br><i>mostrador dentro de la terminal, a la izquierda al salir de aduanas</i></b></div>
    <div class="kv"><span>Entregar</span><b>KEF · 13 oct 14:00<br><i>NO en el P2 donde lo recogen: la devolución está 300 m antes de la entrada de salidas</i></b></div>
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
  const tel = prompt('Otro teléfono de la rentadora (los tres de Höldur ya vienen puestos)', a.tel || '');
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

// ─────────────────────────── ALERTAS OFICIALES ───────────────────────────
// Las dos fuentes que la app no tenía: los avisos de la Veðurstofa (amarillo,
// naranja, rojo) y las alertas de ICE-SAR. Ambas con CORS abierto, sin espejo.
// Se piden en cada arranque y se guardan: sin señal se ve la última.
async function cargarAlertas() {
  const g = LS.get('alertas');
  if (!navigator.onLine) return g;
  const salida = { t: Date.now(), imo: [], safe: [] };

  try {
    const r = await fetch('https://api.vedur.is/cap/capbroker/active/detailed/all');
    if (r.status !== 204) {                       // 204 = no hay ninguna activa
      const j = await r.json();
      salida.imo = (Array.isArray(j) ? j : j?.alerts || []).slice(0, 6);
    }
  } catch { salida.imo = g?.imo || []; }

  try {
    const j = await fetch('https://safetravel.is/wp-json/wp/v2/alert?per_page=6').then(r => r.json());
    const limpio = s => new DOMParser().parseFromString(s || '', 'text/html').body.textContent.trim();
    salida.safe = j.map(a => ({
      t: limpio(a.title?.rendered),
      x: limpio(a.excerpt?.rendered).slice(0, 260),
      f: (a.date || '').slice(0, 10),
      url: a.link,
    })).filter(a => a.t);
  } catch { salida.safe = g?.safe || []; }

  LS.set('alertas', salida);
  return salida;
}

function pintarAlertas(a) {
  const caja = $('#hoy-alertas');
  if (!caja) return;
  const imo = a?.imo || [], safe = a?.safe || [];
  if (!imo.length && !safe.length) { caja.hidden = true; return; }
  caja.hidden = false;

  const fila = (etiq, titulo, texto, url, grave) => `
    <div class="aviso ${grave ? 'peligro' : 'reserva'}">
      <span class="ic">${grave ? '⚠' : '◉'}</span>
      <span><b>${etiq}</b>${titulo ? `<strong style="display:block;font-size:14.5px;margin-bottom:2px">${titulo}</strong>` : ''}${texto}
      ${url ? ` <a href="${url}" target="_blank" rel="noopener">ver más</a>` : ''}</span>
    </div>`;

  caja.innerHTML =
    imo.map(x => {
      const p = x.info?.[0] || x;
      const sev = (p.severity || '').toLowerCase();
      return fila('Veðurstofa · aviso oficial', p.event || p.headline || '',
        p.description || p.headline || '', null, sev !== 'minor');
    }).join('') +
    safe.map(x => fila(`SafeTravel · ${x.f}`, x.t, x.x, x.url, /danger|closed|warning|storm|flood/i.test(x.t + x.x))).join('');
}

// ─────────────────────────── ESTACIONES DE CARRETERA ───────────────────────────
// Ráfaga medida y temperatura del asfalto en las estaciones cercanas a la ruta
// de hoy. Es el dato que ningún pronóstico da y que decide si hay hielo.
async function cargarEstaciones() {
  try {
    const d = await fetch('data/estaciones.json', { cache: 'no-cache' }).then(r => r.json());
    LS.set('est', { t: Date.now(), d });
    return d;
  } catch { return LS.get('est')?.d || null; }
}

function pintarEstaciones(d) {
  const caja = $('#est-cuerpo');
  if (!caja) return;
  if (!d) { caja.innerHTML = '<p class="muted">Sin datos. Necesita una carga con señal.</p>'; return; }

  const dia = diaActivo();
  const cerca = d.estaciones
    .map(e => ({ e, km: Math.min(...dia.puntos.map(p => dist(p.lat, p.lon, e.lat, e.lon))) }))
    .filter(x => x.km <= 30)
    .sort((a, b) => (b.e.r || 0) - (a.e.r || 0))
    .slice(0, 6);

  $('#est-edad').textContent = d.actualizado ? edadTxt(Date.parse(d.actualizado)) : '';
  if (!cerca.length) { caja.innerHTML = '<p class="muted">No hay estaciones cerca de la ruta de hoy.</p>'; return; }

  caja.innerHTML = cerca.map(({ e, km }) => {
    const nv = e.r >= 25 ? 4 : e.r >= 20 ? 3 : e.r >= 15 ? 2 : 1;
    const col = ['', 'var(--ok)', 'var(--warn)', 'var(--hot)', 'var(--bad)'][nv];
    const hielo = e.ta !== null && e.ta <= 1 && (e.h || 0) >= 80;
    return `<div class="est ${hielo ? 'hielo' : ''}">
      <div class="est-t">
        <span class="est-n"><strong>${e.n}</strong><small>a ${km.toFixed(0)} km${e.alt ? ` · ${e.alt} m` : ''}</small></span>
        <span class="est-v" style="color:${col}">${e.r ?? '—'}<em>m/s ráfaga</em></span>
      </div>
      <div class="est-d">
        ${e.t !== null ? `<span>Aire <b>${e.t}°</b></span>` : ''}
        ${e.ta !== null ? `<span>Asfalto <b style="${hielo ? 'color:var(--bad)' : ''}">${e.ta}°</b></span>` : ''}
        ${e.h !== null ? `<span>Humedad <b>${e.h}%</b></span>` : ''}
        ${e.d ? `<span>Viento <b>${e.d}</b></span>` : ''}
      </div>
      ${hielo ? '<p class="est-hielo">Asfalto cerca de cero con humedad alta: hay que contar con hielo.</p>' : ''}
    </div>`;
  }).join('');
}

// ─────────────────────────── CÓMO CARGAR GASOLINA ───────────────────────────
// Los pasos reales de una bomba de autoservicio islandesa, con lo que dice la
// pantalla en islandés. Pensado para leerse ahí parado, de noche y con frío.
const PASOS_GAS = [
  ['Estaciónate y apaga el motor',
   'Con la tapa del tanque del lado del surtidor. Fíjate en el <b>número de tu bomba</b>: el terminal de pago es una columna aparte que atiende dos.'],
  ['Confirma el combustible',
   'Abre la tapa y lee la etiqueta de adentro. Si dudas, revisa el contrato de renta. Nunca elijas por el precio: aquí el diésel es el caro.'],
  ['Pasa la llave de descuento, si traes',
   'Antes de la tarjeta. La de Orkan se escanea acercando el celular al lector rojo, a unos 15 cm.'],
  ['Paga <em>antes</em> de cargar',
   'Acerca o inserta la tarjeta y teclea el <b>NIP de 4 dígitos</b>. La pantalla dice <i>«Kortið hefur verið lesið»</i> — tarjeta leída.'],
  ['Elige el combustible',
   'Aparece <i>«Veljið eldsneyti»</i> con dos botones: <b>Dísel</b> y <b>95 Blýlaust</b>. Blýlaust es sin plomo, o sea la gasolina.'],
  ['Elige el número de bomba',
   'Este es el error clásico: la máquina no sabe dónde está tu auto. Ponle el número que viste en el paso 1.'],
  ['Espera la autorización',
   '<i>«Beðið er eftir heimild fyrir kort»</i>. Aquí aparta <b>22,000 ISK en N1</b> o <b>30,000 en Olís, ÓB y Orkan</b>. Es una retención, no un cobro: después te cobran solo lo que cargaste.'],
  ['Carga',
   'La pantalla te da luz verde con el monto autorizado. Ese número es el techo, no lo que vas a pagar. La bomba corta sola al llenarse.'],
  ['Cuelga la pistola',
   'Ese gesto es el que cierra la operación y manda al banco el importe real. El recibo, <i>«kvittun»</i>, es opcional.'],
];

function pintarPasosGas() {
  const ol = $('#pasos-gas');
  if (!ol) return;
  ol.innerHTML = PASOS_GAS.map(([t, d]) =>
    `<li><strong>${t}</strong><span>${d}</span></li>`).join('');
}

// ─────────────────────────── BITÁCORA DE COMBUSTIBLE ───────────────────────────
// Odómetro al recoger + cada carga = rendimiento real contra el estimado.
// Y de paso el kílómetragjald acumulado, que se cobra por km al devolver.
// Kia Sportage automático «o similar»: SUV compacto. El estimado de 8.5 asume
// gasolina; si les toca diésel gastarán más cerca de 7 y el contador lo dirá solo.
const KM_PLAN = 2600;        // los kilómetros del itinerario completo
const LKM_PLAN = 8.5;        // consumo estimado, L/100 km
const DIAS_RENTA = 14;       // 30 sep 07:30 → 13 oct 14:00, facturado como 14 días

// El kílómetragjald es un IMPUESTO DEL ESTADO desde enero de 2026, no un cobro
// de la rentadora: tener kilometraje ilimitado no exime de pagarlo. Cada empresa
// lo traslada de una de dos formas, y hay que preguntar cuál usa la suya.
const KMG = {
  km:  { n: 'Su caso · 8.81', tasa: 8.81, nota: 'Höldur publica el desglose exacto: impuesto del Estado 6.95 ISK/km más su comisión de 1.50 con IVA, o sea 1.86. Total 8.81 ISK por kilómetro recorrido, cobrado al devolver el auto. El IVA solo cae sobre la comisión, nunca sobre el impuesto.' },
  alto:{ n: 'Colchón · 12',   tasa: 12,  nota: 'El techo del rango «ISK 6 to ISK 12» que dice su contrato. No les va a tocar: la tarifa estatal es escalonada por peso y los 12 corresponden a vehículos de más de 8 toneladas. Su SUV pesa menos de 3.5 y paga la banda base. Sirve solo para presupuestar con holgura.' },
  dia: { n: 'Cuota fija diaria', tasa: 1550, nota: 'Otras rentadoras lo cobran así, pero NO es su caso: Höldur cobra por kilómetro al devolver.' },
};
const modoKmg = () => LS.get('kmg', 'km');
const costoKmg = km => modoKmg() === 'dia' ? KMG.dia.tasa * DIAS_RENTA : KMG[modoKmg()].tasa * km;

const gasLog = () => LS.get('gaslog', { inicial: null, cargas: [] });
const num = v => { const n = parseFloat(String(v).replace(',', '.').replace(/[^\d.]/g, '')); return isFinite(n) ? n : null; };

function pintarGasLog() {
  const g = gasLog(), res = $('#gas-resumen'), lis = $('#gas-lista');
  if (!res) return;
  const tasa = LS.get('fx')?.v || TASA_RESPALDO;
  const mx = isk => Math.round(isk * tasa).toLocaleString('es-MX');

  if (g.inicial === null) {
    res.innerHTML = `<p class="muted">Primero anota el <b>odómetro al recoger el auto</b>.</p>
      <button class="ghost" style="width:100%;margin-top:10px" onclick="odometroInicial()">Anotar odómetro inicial</button>`;
    lis.innerHTML = '';
    return;
  }

  const cs = [...g.cargas].sort((a, b) => a.km - b.km);
  const km = cs.length ? cs[cs.length - 1].km - g.inicial : 0;
  const litros = cs.reduce((s, c) => s + c.l, 0);
  const gasto = cs.reduce((s, c) => s + (c.isk || 0), 0);
  // Su política es "like for like": lo devuelven al nivel en que lo recibieron.
  // El cálculo solo cuadra si cada carga es a tanque lleno; si cargan a medias,
  // el rendimiento sale optimista hasta la siguiente carga completa.
  const lkm = km > 0 && litros > 0 ? (litros / km) * 100 : null;
  const dif = lkm ? lkm - LKM_PLAN : null;

  res.innerHTML = `
    <div class="gas-cifras">
      <div class="gc"><b>${lkm ? lkm.toFixed(1) : '—'}</b><span>L/100 km reales</span>
        ${dif !== null ? `<em class="${dif > 0.6 ? 'mal' : dif < -0.6 ? 'bien' : ''}">${dif > 0 ? '+' : ''}${dif.toFixed(1)} vs el plan de ${LKM_PLAN}</em>` : ''}</div>
      <div class="gc"><b>${km.toLocaleString('es-MX')}</b><span>km recorridos</span>
        <em>${Math.round(km / KM_PLAN * 100)}% de los ${KM_PLAN.toLocaleString('es-MX')} del plan</em></div>
    </div>
    <div class="kv"><span>Gasolina gastada</span><b>${Math.round(gasto).toLocaleString('es-MX')} ISK<br><i>${mx(gasto)} MXN</i></b></div>
    <div class="kv"><span>Impuesto kilométrico${modoKmg() === 'dia' ? ' del viaje completo' : ' acumulado'}
      <em>${modoKmg() === 'dia' ? `cuota fija, ${DIAS_RENTA} días · no depende de los km` : 'se cobra al devolver el auto'}</em></span>
      <b>${Math.round(costoKmg(km)).toLocaleString('es-MX')} ISK<br><i>${mx(costoKmg(km))} MXN</i></b></div>
    ${lkm ? `<div class="kv"><span>Proyección a los ${KM_PLAN.toLocaleString('es-MX')} km<em>gasolina más impuesto, a este ritmo</em></span>
      <b>${Math.round(gasto / km * KM_PLAN + costoKmg(KM_PLAN)).toLocaleString('es-MX')} ISK<br><i>${mx(gasto / km * KM_PLAN + costoKmg(KM_PLAN))} MXN</i></b></div>` : ''}
    <div class="kmg-sel">
      <span class="kmg-t">Cómo les cobra la rentadora el impuesto kilométrico</span>
      <div class="segmentado">${Object.entries(KMG).map(([k, v]) =>
        `<button data-kmg="${k}" class="${k === modoKmg() ? 'on' : ''}">${v.n}</button>`).join('')}</div>
      <p class="nota">${KMG[modoKmg()].nota} <b>Ojo:</b> tener kilometraje ilimitado no exime de este
        impuesto — el ilimitado es la política de la rentadora, y esto es un impuesto del Estado
        desde enero de 2026 que ellos solo trasladan.</p>
    </div>
    <div class="kv"><span>Odómetro al recoger</span><b>${g.inicial.toLocaleString('es-MX')} km
      <button class="lnk" onclick="odometroInicial()">cambiar</button></b></div>`;

  $$('#gas-resumen [data-kmg]').forEach(b => b.onclick = () => { LS.set('kmg', b.dataset.kmg); pintarGasLog(); });

  lis.innerHTML = !cs.length
    ? '<p class="muted" style="margin-top:12px">Aún no hay cargas anotadas.</p>'
    : '<div class="gas-tabla">' + cs.map((c, i) => {
        const prev = i ? cs[i - 1].km : g.inicial;
        const tramo = c.km - prev;
        const r = tramo > 0 ? (c.l / tramo) * 100 : null;
        return `<div class="gcarga">
          <div class="gc-t"><strong>${c.l.toFixed(1)} L</strong>
            <span>${c.km.toLocaleString('es-MX')} km${c.lugar ? ` · ${c.lugar}` : ''}</span>
            <button class="lnk" onclick="borrarCarga(${c.id})">borrar</button></div>
          <div class="gc-d">
            ${tramo > 0 ? `<span>${tramo} km este tramo</span>` : ''}
            ${r ? `<span><b>${r.toFixed(1)}</b> L/100</span>` : ''}
            ${c.isk ? `<span>${Math.round(c.isk).toLocaleString('es-MX')} ISK</span>` : ''}
            ${c.isk && c.l ? `<span>${(c.isk / c.l).toFixed(0)} ISK/L</span>` : ''}
          </div></div>`;
      }).join('') + '</div>';
}

window.odometroInicial = () => {
  const g = gasLog();
  const v = num(prompt('Odómetro al recoger el auto, en km', g.inicial ?? ''));
  if (v === null) return;
  LS.set('gaslog', { ...g, inicial: v });
  pintarGasLog();
};

window.borrarCarga = id => {
  const g = gasLog();
  LS.set('gaslog', { ...g, cargas: g.cargas.filter(c => c.id !== id) });
  pintarGasLog();
};

$('#gas-nueva')?.addEventListener('click', () => {
  const g = gasLog();
  if (g.inicial === null) { odometroInicial(); if (gasLog().inicial === null) return; }
  const km = num(prompt('Odómetro ahora, en km'));
  if (km === null) return;
  const l = num(prompt('Litros cargados'));
  if (l === null) return;
  const isk = num(prompt('Cuánto pagaste, en coronas (opcional)')) ?? 0;
  const lugar = (prompt('Dónde, para acordarse (opcional)') || '').trim();
  const cargas = [...gasLog().cargas, { id: Date.now(), km, l, isk, lugar, f: hoyISO() }];
  LS.set('gaslog', { ...gasLog(), cargas });
  pintarGasLog();
});

// ─────────────────────────── CONVERSOR ───────────────────────────
// Tipo de cambio del BCE vía Frankfurter, con open.er-api de respaldo. Ambos
// traen CORS abierto. Se guarda el último valor: sin señal se sigue convirtiendo
// con el de ayer, que para decidir si un plato es caro sobra.
const TASA_RESPALDO = 0.1403;   // congelada el 8 de septiembre de 2026, por si nunca hubo red

// Precios reales que van a ver, todos verificados en esta investigación.
const PRECIOS = [
  ['Gasolina, 1 litro',            250, 'entre 226 en zona barata y 262 en la Ring Road'],
  ['Llenar el tanque, ~54 L',    13500, 'de vacío a lleno'],
  ['Hot dog de gasolinera',       1200, ''],
  ['Bæjarins Beztu',               800, 'el famoso de Reikiavik'],
  ['Café',                         800, 'gratis en Orkan con la llave'],
  ['Cerveza',                     1550, ''],
  ['Sopa de pescado',             2900, ''],
  ['Plato fuerte en pueblo',      6400, 'entre 4,900 y 7,900'],
  ['Cena para dos con cerveza',  21000, 'tres tiempos'],
  ['Súper: día de comida los dos',16000, 'estilo mixto, desayuno y lunch de súper'],
  ['Estacionamiento de cascada',  1000, 'Skógafoss, Seljalandsfoss, Reynisfjara'],
  ['Jökulsárlón',                 1110, 'incluye Diamond Beach'],
  ['Peaje Vaðlaheiðargöng',       2216, 'por sentido'],
  ['Peaje Hornafjörður',          1500, 'por cruce'],
  ['Stokksnes',                   1100, 'por persona'],
  ['Kerið',                        600, 'por persona'],
  ['Ballenas en Húsavík',        12990, 'por persona, 3 horas'],
  ['Snorkel en Silfra',          18000, 'por persona'],
  ['Cueva de hielo',             23900, 'por persona'],
  ['Urgencias en Landspítali',   88557, 'solo por llegar'],
];

async function cargarTasa() {
  const g = LS.get('fx');
  if (g && Date.now() - g.t < 12 * 3600e3) return g;
  if (!navigator.onLine) return g;
  for (const [url, saca] of [
    ['https://api.frankfurter.dev/v1/latest?from=ISK&to=MXN', j => j.rates?.MXN],
    ['https://open.er-api.com/v6/latest/ISK',              j => j.rates?.MXN],
  ]) {
    try {
      const v = saca(await fetch(url).then(r => r.json()));
      if (v > 0) { const d = { t: Date.now(), v }; LS.set('fx', d); return d; }
    } catch {}
  }
  return g;
}

function pintarConversor(fx) {
  const tasa = fx?.v || TASA_RESPALDO;
  $('#fx-edad').textContent = fx
    ? `1000 ISK = ${Math.round(1000 * tasa)} MXN · ${edadTxt(fx.t)}`
    : `1000 ISK ≈ ${Math.round(1000 * TASA_RESPALDO)} MXN · sin conexión`;

  const isk = $('#fx-isk'), mxn = $('#fx-mxn');
  const fmt = n => n >= 1000 ? Math.round(n).toLocaleString('es-MX') : (Math.round(n * 10) / 10).toString();
  const leer = el => parseFloat(el.value.replace(/[^\d.,]/g, '').replace(/,/g, '')) || 0;
  const deISK = () => { mxn.value = fmt(leer(isk) * tasa); };
  const deMXN = () => { isk.value = fmt(leer(mxn) / tasa); };
  isk.oninput = deISK; mxn.oninput = deMXN; deISK();

  $('#fx-atajos').innerHTML = [500, 1000, 2500, 5000, 10000].map(v =>
    `<button data-v="${v}">${v.toLocaleString('es-MX')}</button>`).join('');
  $$('#fx-atajos button').forEach(b => b.onclick = () => { isk.value = b.dataset.v; deISK(); });

  $('#fx-tabla').innerHTML = PRECIOS.map(([q, v, n]) => `<div class="kv">
    <span>${q}${n ? `<em>${n}</em>` : ''}</span>
    <b>${v.toLocaleString('es-MX')} ISK<br><i>${Math.round(v * tasa).toLocaleString('es-MX')} MXN</i></b>
  </div>`).join('');
}


// ─────────────────────────── arranque ───────────────────────────
if ('serviceWorker' in navigator) addEventListener('load', () => {
  navigator.serviceWorker.register('sw.js');
  // Con los dos teléfonos llenos de fotos, el desalojo por falta de espacio es
  // el único borrado que todavía alcanza a una app instalada. Esto le pide a
  // iOS que no la tire. No siempre lo concede, pero pedirlo no cuesta nada.
  navigator.storage?.persist?.();
});
boot();
