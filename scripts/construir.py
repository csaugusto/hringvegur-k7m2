#!/usr/bin/env python3
"""Reconstruye app/data/viaje.json desde las fuentes.

ESCENARIO A: no hay noche en Akureyri. Las reservas mandan y el 3 de octubre
absorbe lo que el Excel tenía repartido en dos días. Todo lo posterior se
recorre un día, y sobra un día libre en Reikiavik.

Uso: python3 scripts/construir.py
"""
import json, math, datetime, time, urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PUNTOS = json.load(open(RAIZ / "data" / "puntos_geocoded.json"))

# Qué días del Excel entran en cada día real. El 3 de octubre fusiona dos.
DIAS = [
    (0,  "2026-09-30", [0],    "Llegada 06:20 · Blue Lagoon 09:00 · Reikiavik por la tarde"),
    (1,  "2026-10-01", [1],    "Península de Snæfellsnes"),
    (2,  "2026-10-02", [2],    "Transición hacia el norte"),
    (3,  "2026-10-03", [3, 4], "Tröllaskagi, Akureyri, Goðafoss y Mývatn"),
    (4,  "2026-10-04", [5],    "Diamond Circle"),
    (5,  "2026-10-05", [6],    "Noreste y Möðrudalur"),
    (6,  "2026-10-06", [7],    "Fiordos del Este"),
    (7,  "2026-10-07", [8],    "Jökulsárlón y Diamond Beach"),
    (8,  "2026-10-08", [9],    "Costa sur"),
    (9,  "2026-10-09", [10],   "Cascadas del sur"),
    (10, "2026-10-10", [11],   "Círculo Dorado"),
    (11, "2026-10-11", [12],   "Día completo en la capital"),
    (12, "2026-10-12", [],     "Día libre — el que se gana al no dormir en Akureyri"),
    (13, "2026-10-13", [13],   "Salida al aeropuerto · vuelo 17:05"),
]

# El día libre no está en el Excel: se arma con lo que quedó pendiente.
LIBRE = [
    ("Sky Lagoon",       64.11647, -21.94644, "Opcional", "Ritual Skjól al atardecer, 18:19"),
    ("Perlan",           64.12925, -21.91903, "Opcional", "Museo y cúpula"),
    ("Blue Lagoon",      63.88041, -22.44953, "Opcional", "Respaldo si el día 0 cerró por actividad volcánica"),
    ("Grótta",           64.16268, -22.01470, "Opcional", "Faro. Lo más oscuro cerca de la ciudad para auroras"),
    ("Reikiavik",        64.14598, -21.94224, "Dormir",   None),
]

AVISOS = {
    3: [{"t": "ruta", "x": "El día más pesado del viaje: 363 km y ~6h45 de manejo real contra 11h05 de luz. "
                           "Margen: una hora. Salgan 07:45 con el auto ya cargado."},
        {"t": "ruta", "x": "Si el pronóstico del 2 por la noche trae viento o nieve en el norte, sáltense Tröllaskagi: "
                           "por la Ruta 1 vía Varmahlíð son 278 km y +3h de margen. Se pierde Siglufjörður, se gana el día."},
        {"t": "peaje", "x": "Túnel Vaðlaheiðargöng saliendo de Akureyri: 2,216 ISK. Paguen el mismo día en tunnel.is, "
                            "máximo 24 h después."}],
    4: [{"t": "ruta", "x": "La 862 NORTE (Dettifoss→Ásbyrgi) no tiene servicio invernal. Hagan la 862 SUR ida y vuelta, "
                           "y Ásbyrgi por la Ruta 1 + 87 + 85."},
        {"t": "ruta", "x": "La 864, orilla este de Dettifoss, ya está restringida a 4x4. No intentarla."}],
    5: [{"t": "ruta", "x": "Mývatn → Egilsstaðir son 174 km del tramo más desolado de la Ruta 1. "
                           "Salgan con 3/4 de tanque; no esperen a la luz de reserva."}],
    6: [{"t": "peaje", "x": "PEAJE NUEVO de Hornafjörður antes de Höfn: 1,500 ISK. En auto rentado solo hay 12 HORAS "
                            "para pagarlo en spolur.is. Pongan alarma al cruzar."},
        {"t": "ruta", "x": "Por la Ruta 1 son 252 km y 3h30 de manejo puro, no las 2:49 del Excel. Öxi (939) está abierto "
                           "hasta el 1 de noviembre, pero es grava y solo se despeja dos veces por semana."},
        {"t": "acceso", "x": "Stokksnes: 1,100 ISK por persona. Acceso 24 h; si el café cerró hay quiosco de autoservicio."}],
    7: [{"t": "peaje", "x": "Segundo cruce del peaje de Hornafjörður: otros 1,500 ISK, otras 12 horas."},
        {"t": "reserva", "x": "Tour de cueva de hielo desde Skaftafell o Jökulsárlón. Sí operan en octubre, pero es "
                              "arranque de temporada y los días 7 y 8 ya están en ámbar."},
        {"t": "acceso", "x": "Jökulsárlón 1,110 ISK cubre también Diamond Beach. Skaftafell el mismo día: 50% de descuento."}],
    12: [{"t": "reserva", "x": "Día libre. Sky Lagoon abre 09:00–22:00 hasta el 20 de octubre y el ritual al atardecer "
                               "es mejor experiencia que el Blue Lagoon."}],
}

CIELO = {
    "Reikiavik": (0.25, "Grótta · 15 min del centro. O Þingvellir a 50 min."),
    "Grundarfjörður": (0.85, "Kirkjufell, a 3 km."),
    "Laugarbakki": (0.95, "Cualquier punto fuera del pueblo."),
    "Mývatn": (0.95, "La orilla del lago o Hverir. Los cielos más despejados del país."),
    "Egilsstaðir": (0.60, "Lagarfljót, en la orilla del lago."),
    "Höfn": (0.85, "Vestrahorn / Stokksnes, a 16 km. Acceso 24 h."),
    "Kirkjubæjarklaustur": (0.95, "El pueblo mismo ya está oscuro."),
    "Vík": (0.80, "Reynisfjara con los Reynisdrangar de primer plano."),
    "Selfoss / Flúðir": (0.65, "Kerið o el camino a Flúðir."),
}


def sol(lat, lon, fecha, alt=-0.833):
    d = datetime.date.fromisoformat(fecha)
    n = (d.toordinal() - datetime.date(2000, 1, 1).toordinal()) - lon / 360.0
    M = (357.5291 + 0.98560028 * n) % 360
    Mr = math.radians(M)
    C = 1.9148 * math.sin(Mr) + 0.02 * math.sin(2 * Mr) + 0.0003 * math.sin(3 * Mr)
    lam = math.radians((M + C + 180 + 102.9372) % 360)
    Jt = 2451545.0 + n + 0.0053 * math.sin(Mr) - 0.0069 * math.sin(2 * lam)
    dec = math.asin(math.sin(lam) * math.sin(math.radians(23.44)))
    la = math.radians(lat)
    c = (math.sin(math.radians(alt)) - math.sin(la) * math.sin(dec)) / (math.cos(la) * math.cos(dec))
    if abs(c) > 1:
        return None, None
    w = math.degrees(math.acos(c)) / 360.0
    f = lambda J: (lambda m: f"{m // 60:02d}:{m % 60:02d}")(round(((J - 2451545.0 + 0.5) % 1) * 1440))
    return f(Jt - w), f(Jt + w)


def luna(fecha):
    y, m, dd = map(int, fecha.split("-"))
    if m < 3:
        y -= 1; m += 12
    jd = int(365.25 * (y + 4716)) + int(30.6001 * (m + 1)) + dd - 1524.5 + 2 - int(y / 100) + int(int(y / 100) / 4)
    return round(50 * (1 - math.cos(2 * math.pi * (((jd - 2451550.1) / 29.530588853) % 1))))


def osrm(coords):
    s = ";".join(f"{a},{b}" for a, b in coords)
    url = f"http://router.project-osrm.org/route/v1/driving/{s}?overview=false"
    try:
        r = json.load(urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": "islandia-2026/1.0"}), timeout=45))["routes"][0]
        return r["distance"] / 1000, r["duration"] / 3600
    except Exception:
        return None, None


def puntos_de(indices):
    out = []
    for i in indices:
        p = sorted((x for x in PUNTOS if int(float(x["Día"])) == i and x["lat"]),
                   key=lambda z: float(z.get("Orden") or 0))
        for z in p:
            if out and (out[-1]["lat"], out[-1]["lon"]) == (z["lat"], z["lon"]):
                continue
            out.append({"n": z["Nombre"], "lat": round(z["lat"], 5), "lon": round(z["lon"], 5),
                        "cat": z.get("Categoría"), "nota": z.get("Notas")})
    return out


def main():
    aloj = json.load(open(RAIZ / "app" / "data" / "alojamientos.json"))["alojamientos"]
    dias = []
    for idx, fecha, fuente, plan in DIAS:
        pts = puntos_de(fuente) if fuente else [
            {"n": n, "lat": la, "lon": lo, "cat": c, "nota": nt} for n, la, lo, c, nt in LIBRE]
        km, h = (osrm([(p["lon"], p["lat"]) for p in pts]) if len(pts) > 1 else (0, 0))
        time.sleep(0.6)
        mid = pts[len(pts) // 2]
        sr, ss = sol(mid["lat"], mid["lon"], fecha)
        _, cs = sol(mid["lat"], mid["lon"], fecha, alt=-6)
        lz = (int(ss[:2]) * 60 + int(ss[3:])) - (int(sr[:2]) * 60 + int(sr[3:]))
        lugar = (aloj.get(fecha) or {}).get("lugar", "")
        cielo, mirador = CIELO.get(lugar, (0.7, ""))
        dias.append({
            "d": idx, "fecha": fecha, "plan": plan,
            "km": round(km or 0), "manejo_min": round((h or 0) * 60 * 1.25),
            "amanecer": sr, "ocaso": ss, "crep_fin": cs, "luz_min": lz, "luna": luna(fecha),
            "dormir": ({"cielo": cielo, "mirador": mirador} if fecha in aloj else None),
            "puntos": pts, "avisos": AVISOS.get(idx, []), "servicios": [], "camaras": [],
        })
        print(f"  D{idx} {fecha[5:]} {round(km or 0):>4} km  {int((h or 0)*1.25)}h{int(((h or 0)*1.25%1)*60):02d}  "
              f"luz {lz//60}:{lz%60:02d}  luna {luna(fecha):>3}%  {len(pts)} paradas  {lugar}")

    salida = {"generado": "2026-09-08", "escenario": "A · sin noche en Akureyri", "dias": dias}
    (RAIZ / "app" / "data" / "viaje.json").write_text(
        json.dumps(salida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"\nviaje.json reconstruido · {len(dias)} días")


if __name__ == "__main__":
    main()


# ─────────── servicios del mapa y cámaras de Vegagerðin ───────────
# Se ejecuta después de main(); se separó para poder releerlo sin volver a pedir OSRM.

def enriquecer():
    import re, xml.etree.ElementTree as ET
    ns = {"k": "http://www.opengis.net/kml/2.2"}
    app = json.load(open(RAIZ / "app" / "data" / "viaje.json"))
    por_fecha = {d["fecha"]: d for d in app["dias"]}

    # 1. Gasolina y provisiones — las etiquetas del mapa traen fecha absoluta,
    #    así que siguen encajando aunque los días se hayan recorrido.
    doc = ET.parse(RAIZ / "data" / "mymap_original.kml").getroot().find("k:Document", ns)
    geo = {s["Nombre"]: s for s in json.load(open(RAIZ / "data" / "servicios_geocoded.json"))}
    MANUAL = {"Freysnes / Skaftafell fuel": (63.9905, -16.8958)}
    MES = {"sep": 9, "oct": 10}

    def fechas_de(txt):
        m = re.search(r"\(([^)]+)\)", txt or "")
        if not m:
            return []
        s = m.group(1).replace("–", "-")
        mes = next((v for k, v in MES.items() if k in s), None)
        if not mes:
            return []
        return [f"2026-{mes:02d}-{int(n):02d}" for n in re.findall(r"\d+", s)]

    for d in app["dias"]:
        d["servicios"] = []
    for f in doc.findall("k:Folder", ns):
        capa = f.find("k:name", ns).text
        if "puntos_Google" in capa:
            continue
        tipo = "tienda" if "tiendas" in capa else "combustible"
        for p in f.findall("k:Placemark", ns):
            dd = {x.get("name").lstrip("﻿"): (x.find("k:value", ns).text or "").strip()
                  for x in p.findall("k:ExtendedData/k:Data", ns)}
            nom = p.find("k:name", ns).text
            g = geo.get(nom, {})
            lat, lon = (g.get("lat"), g.get("lon"))
            if lat is None:
                lat, lon = MANUAL.get(nom, (None, None))
            item = {k: v for k, v in {
                "n": nom, "tipo": tipo, "lat": lat, "lon": lon,
                "clase": dd.get("Tipo", ""), "nivel": dd.get("Nivel", ""),
                "accion": dd.get("Acción recomendada") or dd.get("Qué comprar", ""),
                "compra": dd.get("Tipo de compra", ""), "prioridad": dd.get("Prioridad", ""),
                "horario": dd.get("Horario") or dd.get("Horario / servicio", ""),
                "contexto": dd.get("Distancia / contexto", ""),
                "nota": dd.get("Nota práctica") or dd.get("Notas", ""),
            }.items() if v not in ("", "—", None)}
            for fecha in fechas_de(dd.get("Día recomendado") or dd.get("Día / tramo", "")):
                if fecha in por_fecha:
                    por_fecha[fecha]["servicios"].append(item)

    # 2. Cámaras — pasos de montaña y túneles sí, tráfico urbano de Reikiavik no.
    cam = json.load(urllib.request.urlopen(urllib.request.Request(
        "https://gagnaveita.vegagerdin.is/api/vefmyndavelar2014_1",
        headers={"User-Agent": "islandia-2026/1.0"}), timeout=90))
    CLAVE = re.compile(r"heiði|skarð|öræfi|göng|fjall|brekka|dalur|sandur|mýri|fjörður|hraun|foss|vík", re.I)
    URBANO = re.compile(r"kringlan|bústaða|miklabraut|ártún|arnarnes|rósasel|sæbraut|höfðabakk|smáralind|breiðholt", re.I)
    validas = [x for x in cam if x.get("Breidd") and x.get("Lengd") and x.get("Slod")]

    def km2(a, b, c, e):
        R, r = 6371, math.pi / 180
        return 2 * R * math.asin(math.sqrt(
            math.sin((c - a) * r / 2) ** 2 + math.cos(a * r) * math.cos(c * r) * math.sin((e - b) * r / 2) ** 2))

    for d in app["dias"]:
        pts = [(p["lat"], p["lon"]) for p in d["puntos"]]
        cand = []
        for c in validas:
            dm = min(km2(c["Breidd"], c["Lengd"], la, lo) for la, lo in pts)
            if dm > 22 or URBANO.search(c["Myndavel"]):
                continue
            cand.append((dm - (14 if CLAVE.search(c["Myndavel"]) else 0), dm, c))
        cand.sort(key=lambda x: x[0])
        sel, vistos = [], set()
        for _, dm, c in cand:
            if c["Myndavel"] in vistos:
                continue
            vistos.add(c["Myndavel"])
            sel.append({"n": c["Myndavel"], "d": (c.get("Skyring") or "").strip(),
                        "via": c.get("NrVegur") or "", "img": c["Slod"],
                        "lat": round(c["Breidd"], 5), "lon": round(c["Lengd"], 5), "km": round(dm, 1)})
            if len(sel) >= 5:
                break
        d["camaras"] = sel

    (RAIZ / "app" / "data" / "viaje.json").write_text(
        json.dumps(app, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for d in app["dias"]:
        print(f"  D{d['d']} {d['fecha'][5:]}  {len(d['servicios'])} servicios · "
              f"{len(d['camaras'])} cámaras: {', '.join(c['n'][:18] for c in d['camaras'][:3])}")
