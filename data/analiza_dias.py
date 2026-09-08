import json, urllib.request, math, datetime, time

pts=json.load(open('puntos_geocoded.json'))
FECHA={d:datetime.date(2026,9,30)+datetime.timedelta(days=d) for d in range(14)}

def sun(lat,lon,date):
    """sunrise/sunset UTC (Iceland = UTC year-round), NOAA algorithm"""
    n=date.toordinal()-datetime.date(2000,1,1).toordinal()+0.5-lon/360
    M=(357.5291+0.98560028*n)%360
    C=1.9148*math.sin(math.radians(M))+0.02*math.sin(math.radians(2*M))+0.0003*math.sin(math.radians(3*M))
    lam=(M+C+180+102.9372)%360
    Jt=2451545.0+n+0.0053*math.sin(math.radians(M))-0.0069*math.sin(math.radians(2*lam))
    dec=math.degrees(math.asin(math.sin(math.radians(lam))*math.sin(math.radians(23.44))))
    def ha(alt):
        c=(math.sin(math.radians(alt))-math.sin(math.radians(lat))*math.sin(math.radians(dec)))/(math.cos(math.radians(lat))*math.cos(math.radians(dec)))
        return None if abs(c)>1 else math.degrees(math.acos(c))
    res={}
    for k,alt in (('sun',-0.833),('civil',-6)):
        h=ha(alt)
        if h is None: res[k]=(None,None); continue
        Js=Jt+h/360; Jr=Jt-h/360
        def fmt(J):
            frac=(J-2451545.0+0.5)%1
            mins=round(frac*1440)
            return f"{mins//60:02d}:{mins%60:02d}"
        res[k]=(fmt(Jr),fmt(Js))
    return res

def osrm(coords):
    s=';'.join(f'{c[0]},{c[1]}' for c in coords)
    url=f'http://router.project-osrm.org/route/v1/driving/{s}?overview=false'
    try:
        d=json.load(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'islandia/1.0'}),timeout=40))
        r=d['routes'][0]
        return r['distance']/1000, r['duration']/3600, [l['duration']/3600 for l in r['legs']], [l['distance']/1000 for l in r['legs']]
    except Exception as e:
        return None,None,None,str(e)

print(f"{'Día':<4}{'Fecha':<8}{'km':>7}{'manejo':>8}  {'amanecer':>9}{'ocaso':>7}{'luz':>7}  paradas")
print('-'*100)
resumen=[]
for d in range(14):
    dp=[p for p in pts if int(float(p['Día']))==d and p['lat']]
    dp.sort(key=lambda p: float(p.get('Orden') or 0))
    # dedupe consecutive identical coords
    seq=[]
    for p in dp:
        if not seq or (seq[-1]['lat'],seq[-1]['lon'])!=(p['lat'],p['lon']): seq.append(p)
    coords=[(p['lon'],p['lat']) for p in seq]
    km=hrs=None; legs=legkm=None
    if len(coords)>=2:
        km,hrs,legs,legkm=osrm(coords); time.sleep(0.6)
    mid=seq[len(seq)//2] if seq else pts[0]
    s=sun(mid['lat'],mid['lon'],FECHA[d])
    (sr,ss)=s['sun']; (cr,cs)=s['civil']
    luz=''
    if sr and ss:
        a=int(sr[:2])*60+int(sr[3:]); b=int(ss[:2])*60+int(ss[3:])
        luz=f"{(b-a)//60}:{(b-a)%60:02d}"
    row={'dia':d,'fecha':FECHA[d].isoformat(),'km':round(km,1) if km else None,
         'manejo_h':round(hrs,2) if hrs else None,'amanecer':sr,'ocaso':ss,
         'crep_ini':cr,'crep_fin':cs,'luz':luz,
         'paradas':[p['Nombre'] for p in seq],
         'tramos':[{'de':seq[i]['Nombre'],'a':seq[i+1]['Nombre'],'km':round(legkm[i],1),'h':round(legs[i],2)} for i in range(len(legs))] if legs else []}
    resumen.append(row)
    print(f"{d:<4}{FECHA[d].strftime('%d %b'):<8}{km or 0:>7.0f}{(f'{int(hrs)}:{int((hrs%1)*60):02d}' if hrs else '-'):>8}  {sr or '-':>9}{ss or '-':>7}{luz:>7}  {len(seq)} · {' → '.join(p['Nombre'] for p in seq)[:120]}")
json.dump(resumen,open('analisis_dias.json','w'),ensure_ascii=False,indent=1)
