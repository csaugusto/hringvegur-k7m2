#!/usr/bin/env python3
"""Espeja el estado de carreteras de Vegagerðin dentro del repo.

El feed no manda cabeceras CORS, así que una página estática no puede leerlo
desde el navegador. Al copiarlo aquí, GitHub Pages lo sirve desde el mismo
dominio y el problema desaparece. Corre cada 30 minutos por GitHub Actions.

Uso: python3 scripts/carreteras.py
"""
import json, re, sys, urllib.request
from datetime import datetime, timezone
from pathlib import Path

FEED = "https://gagnaveita.vegagerdin.is/api/faerd2014_1"
SALIDA = Path(__file__).resolve().parent.parent / "app" / "data" / "carreteras.json"

# Los tramos que de verdad pisan. Sin esto son 969 y 383 KB.
RUTA = re.compile(
    r"hringvegur|snæfellsnesvegur|útnesvegur|grundarfj|stykkishólms|vatnaleið|"
    r"norðurlandsveg|siglufjarðarveg|ólafsfjarðarveg|héðinsfjarðar|strákagöng|"
    r"öxnadalsheiði|vaðlaheið|víkurskarð|mývatns|kísilveg|dettifoss|ásbyrgi|"
    r"norðausturveg|möðrudals|fjarðarheiði|fagridalur|reyðarfj|fáskrúðsfj|"
    r"axarveg|djúpavogs|almannaskarð|stokksnes|skaftafell|kirkjubæjar|"
    r"mýrdalssand|dyrhólaey|reynis|sólheima|skógar|seljalands|"
    r"biskupstungnabraut|gullfoss|geysir|þingvalla|lyngdalsheiði|kjósarskarð|"
    r"suðurlandsveg|reykjanesbraut|grindavíkurveg|hellisheiði|mosfellsheiði|"
    r"kolugljúfur|víðidalur|vatnsskarð|fjaðrárgljúfur|jökulsárlón",
    re.I,
)

# No pisan los Vestfirðir ni las tierras altas. "Fjarðarheiði" (fiordos del este)
# sí, pero "Kollafjarðarheiði" y "Þorskafjarðarheiði" son del noroeste y estorban.
FUERA = re.compile(
    r"kollafjarðarheiði|þorskafjarðarheiði|steingrímsfjarðarheiði|dynjandisheiði|"
    r"klettsháls|hrafnseyrarheiði|ísafjarðar|patreks|barðastrand|strandaveg|"
    r"kjölur|kjalveg|sprengisand|fjallabaksleið|kaldidalur",
    re.I,
)

# El feed viene en islandés. En octubre aparecen los estados de nieve y hielo,
# así que se traduce el vocabulario completo, no solo lo que se ve hoy.
# Van por RAÍZ, sin la terminación: el islandés declina y "aurbleyta" aparece
# en el feed como "aurbleytu", "snjóþekja" como "snjóþekju", etc.
TERMINOS_ = [
    ("fært fjallabílum 4x4 (og stærri bílum)", "solo 4x4 de montaña o más grande"),
    ("fært fjallabílum",   "solo vehículos 4x4 de montaña"),
    ("vegur ekki í þjónustu", "sin servicio de mantenimiento"),
    ("takmörkun öxulþung", "límite de peso por eje"),
    ("leyfður ásþung",     "peso máximo por eje"),
    ("hálkublett",         "placas de hielo aisladas"),
    ("skafrenning",        "ventisca de nieve"),
    ("greiðfær",           "despejado"),
    ("snjóþekj",           "cubierto de nieve"),
    ("éljagang",           "chubascos de nieve"),
    ("vatnavext",          "inundación"),
    ("hvassviðri",         "viento fuerte"),
    ("steinkast",          "proyección de piedras"),
    ("þungfær",            "paso difícil"),
    ("aurbleyt",           "lodo por deshielo"),
    ("vegavinn",           "obras"),
    ("þæfing",             "nieve profunda"),
    ("óveður",             "temporal"),
    ("hálka",              "hielo en el pavimento"),
    ("krapi",              "aguanieve"),
    ("lokað",              "CERRADO"),
    ("ófær",               "INTRANSITABLE"),
    ("vegna",              "por"),
    ("tonn",               "toneladas"),
]
TERMINOS = sorted(TERMINOS_, key=lambda x: -len(x[0]))

# El islandés declina: "aurbleyta" aparece como "aurbleytu", "snjóþekja" como
# "snjóþekju". Por eso se busca por raíz y se sustituyen TODOS los términos que
# aparezcan, no solo el primero.
def traducir(estado: str) -> str:
    """Traduce respetando los compuestos tipo 'Hálka - Skafrenningur'."""
    partes = []
    for p in re.split(r"\s+-\s+", estado):
        q = p.strip()
        if not q:
            continue
        for raiz, esp in TERMINOS:                       # los largos van primero
            q = re.sub(re.escape(raiz) + r"[a-záðéíóúýþæö]*", esp, q, flags=re.I)
        partes.append(q.strip())
    t = " · ".join(x for x in partes if x)
    return t[0].upper() + t[1:] if t else estado


GRAVE = re.compile(r"ófær|lokað|hálka(?!blett)|snjóþekj|þæfing|þungfær|óveður|vatnavext|skafrenning", re.I)
OJO   = re.compile(r"4x4|fjallabíl|ekki í þjónustu|steinkast|vegavinn|öxulþung|krapi|hálkublett|éljagang|aurbleyt|hvassviðri", re.I)


def nivel(estado: str) -> str:
    if GRAVE.search(estado):
        return "grave"
    if OJO.search(estado):
        return "ojo"
    return "ok"


def main() -> int:
    req = urllib.request.Request(FEED, headers={"User-Agent": "islandia-2026/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            crudo = json.load(r)
    except Exception as e:
        print(f"no se pudo leer el feed: {e}", file=sys.stderr)
        return 1

    tramos = []
    for t in crudo:
        nombre = t.get("LangtNafn") or t.get("StuttNafn") or ""
        if not RUTA.search(nombre) or FUERA.search(nombre):
            continue
        estado = (t.get("FulltAstand") or "").strip()
        tramos.append({
            "n": nombre,
            "e": traducir(estado),
            "isl": estado,          # el original: los letreros y umferdin.is están en islandés
            "c": t.get("Linulitur") or "",
            "v": nivel(estado),
            "a": (t.get("Aths") or "").strip() or None,
        })

    # Primero lo que estorba, luego alfabético. Así lo urgente queda arriba.
    orden = {"grave": 0, "ojo": 1, "ok": 2}
    tramos.sort(key=lambda x: (orden[x["v"]], x["n"]))

    salida = {
        "actualizado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "total_pais": len(crudo),
        "resumen": {
            "grave": sum(1 for t in tramos if t["v"] == "grave"),
            "ojo": sum(1 for t in tramos if t["v"] == "ojo"),
            "ok": sum(1 for t in tramos if t["v"] == "ok"),
        },
        "tramos": tramos,
    }

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    r = salida["resumen"]
    print(f"{len(tramos)} tramos de {len(crudo)} · "
          f"{r['grave']} graves, {r['ojo']} con ojo, {r['ok']} bien · "
          f"{SALIDA.stat().st_size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
