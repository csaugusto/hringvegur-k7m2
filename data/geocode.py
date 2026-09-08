import json, time, urllib.request, urllib.parse, sys
data=json.load(open('trip_raw.json'))
pts=data['puntos']
seen={}
out=[]
UA={'User-Agent':'islandia-trip-planner/1.0 (personal trip planning)'}
for i,p in enumerate(pts):
    q=p.get('Ubicación')
    if not q: continue
    if q in seen:
        lat,lon,disp=seen[q]
    else:
        url='https://nominatim.openstreetmap.org/search?'+urllib.parse.urlencode(
            {'q':q,'format':'json','limit':1,'countrycodes':'is'})
        try:
            req=urllib.request.Request(url,headers=UA)
            r=json.load(urllib.request.urlopen(req,timeout=20))
            if r: lat,lon,disp=float(r[0]['lat']),float(r[0]['lon']),r[0]['display_name']
            else: lat,lon,disp=None,None,None
        except Exception as e:
            lat,lon,disp=None,None,'ERR '+str(e)
        seen[q]=(lat,lon,disp)
        time.sleep(1.1)
    out.append({**p,'lat':lat,'lon':lon,'osm':disp})
    print(f"{i+1}/{len(pts)} {p.get('Nombre')} -> {lat},{lon}", flush=True)
json.dump(out,open('puntos_geocoded.json','w'),ensure_ascii=False,indent=1)
miss=[o['Nombre'] for o in out if o['lat'] is None]
print("\nSIN COORDENADAS:", miss)
