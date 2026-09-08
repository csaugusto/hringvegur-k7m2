import json, urllib.request, urllib.parse, time
Q = """
[out:json][timeout:180];
area["ISO3166-1"="IS"][admin_level=2]->.is;
(
  nwr["amenity"="fuel"](area.is);
  nwr["shop"="supermarket"](area.is);
  nwr["shop"="convenience"](area.is);
  nwr["amenity"="charging_station"](area.is);
  nwr["amenity"="hospital"](area.is);
  nwr["amenity"="pharmacy"](area.is);
  nwr["amenity"="toilets"](area.is);
  nwr["tourism"="information"]["information"="visitor_centre"](area.is);
);
out center tags;
"""
req=urllib.request.Request('https://overpass-api.de/api/interpreter',
    data=urllib.parse.urlencode({'data':Q}).encode(),
    headers={'User-Agent':'islandia-trip-planner/1.0'})
d=json.load(urllib.request.urlopen(req,timeout=200))
els=d['elements']
print("elementos:",len(els))
out=[]
for e in els:
    lat=e.get('lat') or (e.get('center') or {}).get('lat')
    lon=e.get('lon') or (e.get('center') or {}).get('lon')
    if lat is None: continue
    t=e.get('tags',{})
    kind = t.get('amenity') or t.get('shop') or t.get('tourism')
    out.append({'id':f"{e['type']}/{e['id']}",'lat':round(lat,6),'lon':round(lon,6),
        'kind':kind,'name':t.get('name') or t.get('brand') or '',
        'brand':t.get('brand',''),'opening_hours':t.get('opening_hours',''),
        'phone':t.get('phone') or t.get('contact:phone',''),
        'self_service':t.get('self_service',''),'fee':t.get('fee','')})
from collections import Counter
print(Counter(o['kind'] for o in out).most_common())
json.dump(out,open('poi_islandia.json','w'),ensure_ascii=False,separators=(',',':'))
import os; print("KB:",round(os.path.getsize('poi_islandia.json')/1024,1))
