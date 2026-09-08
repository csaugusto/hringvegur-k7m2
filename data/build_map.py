import json, html
pts=json.load(open('puntos_geocoded.json'))
svc=json.load(open('servicios_geocoded.json'))
ITIN={r['Día']:r for r in json.load(open('trip_raw.json'))['itinerario'] if r.get('Día') is not None}

COLOR={'Aeropuerto':'A52714','Ciudad':'0288D1','Interés':'0F9D58','Opcional':'F9A825',
       'Dormir':'673AB7','Inicio':'757575'}
def esc(s): return html.escape(str(s or ''))

k=['<?xml version="1.0" encoding="UTF-8"?>','<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
   '<name>Islandia 2026 — corregido</name>']
for cat,c in COLOR.items():
    k.append(f'<Style id="s{cat}"><IconStyle><color>ff{c[4:6]}{c[2:4]}{c[0:2]}</color><scale>1.1</scale>'
             f'<Icon><href>https://www.gstatic.com/mapspro/images/stock/503-wht-blank_maps.png</href></Icon></IconStyle>'
             f'<LabelStyle><scale>0.9</scale></LabelStyle></Style>')

days=sorted({int(float(p['Día'])) for p in pts})
FECHA={0:'30 sep',1:'1 oct',2:'2 oct',3:'3 oct',4:'4 oct',5:'5 oct',6:'6 oct',7:'7 oct',
       8:'8 oct',9:'9 oct',10:'10 oct',11:'11 oct',12:'12 oct',13:'13 oct'}
for d in days:
    dp=[p for p in pts if int(float(p['Día']))==d]
    dp.sort(key=lambda p: float(p.get('Orden') or 0))
    it=ITIN.get(float(d),{})
    k.append(f'<Folder><name>Día {d} · {FECHA.get(d,"")} · {esc(it.get("Plan general",""))}</name>')
    for p in dp:
        if not p['lat']: continue
        cat=p.get('Categoría','Interés')
        desc=f"Día {d} ({FECHA.get(d,'')}) · orden {int(float(p.get('Orden') or 0))}<br>Categoría: {esc(cat)}<br>Dormir: {esc(p.get('Dónde dormir'))}"
        if p.get('Notas'): desc+=f"<br>Notas: {esc(p['Notas'])}"
        k.append(f'<Placemark><name>{esc(p["Nombre"])}</name><description><![CDATA[{desc}]]></description>'
                 f'<styleUrl>#s{cat if cat in COLOR else "Interés"}</styleUrl>'
                 f'<Point><coordinates>{p["lon"]},{p["lat"]},0</coordinates></Point></Placemark>')
    # LineString of the day's route
    coords=' '.join(f'{p["lon"]},{p["lat"]},0' for p in dp if p['lat'])
    if len([p for p in dp if p['lat']])>1:
        k.append(f'<Placemark><name>Ruta día {d}</name><LineString><tessellate>1</tessellate>'
                 f'<coordinates>{coords}</coordinates></LineString></Placemark>')
    k.append('</Folder>')

for capa,label in (('tienda','Tiendas y provisiones'),('combustible','Combustible y riesgo')):
    k.append(f'<Folder><name>{label}</name>')
    for e in svc:
        if e['capa']!=capa or not e['lat']: continue
        m='<br>'.join(f'{esc(a)}: {esc(b)}' for a,b in e['meta'].items() if b)
        k.append(f'<Placemark><name>{esc(e["Nombre"])}</name><description><![CDATA[{m}]]></description>'
                 f'<Point><coordinates>{e["lon"]},{e["lat"]},0</coordinates></Point></Placemark>')
    k.append('</Folder>')
k.append('</Document></kml>')
open('Islandia2026_corregido.kml','w',encoding='utf-8').write('\n'.join(k))

# GeoJSON for the app
gj={'type':'FeatureCollection','features':[
  {'type':'Feature','geometry':{'type':'Point','coordinates':[p['lon'],p['lat']]},
   'properties':{'dia':int(float(p['Día'])),'orden':int(float(p.get('Orden') or 0)),'nombre':p['Nombre'],
     'categoria':p.get('Categoría'),'dormir':p.get('Dónde dormir'),'notas':p.get('Notas')}}
  for p in pts if p['lat']]}
json.dump(gj,open('puntos.geojson','w'),ensure_ascii=False,separators=(',',':'))

import os
print("KML:",round(os.path.getsize('Islandia2026_corregido.kml')/1024,1),"KB ·",
      sum(1 for p in pts if p['lat']),"puntos +",sum(1 for e in svc if e['lat']),"servicios + 14 rutas")
print("GeoJSON:",round(os.path.getsize('puntos.geojson')/1024,1),"KB")
