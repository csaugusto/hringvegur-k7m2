import json, math, datetime
pts=json.load(open('puntos_geocoded.json'))
res=json.load(open('analisis_dias.json'))

def sun(lat,lon,date,alt=-0.833):
    n=(date.toordinal()-datetime.date(2000,1,1).toordinal())-lon/360.0
    M=(357.5291+0.98560028*n)%360
    Mr=math.radians(M)
    C=1.9148*math.sin(Mr)+0.02*math.sin(2*Mr)+0.0003*math.sin(3*Mr)
    lam=math.radians((M+C+180+102.9372)%360)
    Jt=2451545.0+n+0.0053*math.sin(Mr)-0.0069*math.sin(2*lam)
    dec=math.asin(math.sin(lam)*math.sin(math.radians(23.44)))
    la=math.radians(lat)
    c=(math.sin(math.radians(alt))-math.sin(la)*math.sin(dec))/(math.cos(la)*math.cos(dec))
    if abs(c)>1: return None,None
    w=math.degrees(math.acos(c))/360.0
    def f(J):
        m=round(((J-2451545.0+0.5)%1)*1440)
        return f"{m//60:02d}:{m%60:02d}"
    return f(Jt-w), f(Jt+w)

def mins(t): return int(t[:2])*60+int(t[3:])
FECHA={d:datetime.date(2026,9,30)+datetime.timedelta(days=d) for d in range(14)}

print(f"{'D':<3}{'fecha':<7}{'km':>6}{'manejo':>8}{'amanec':>8}{'ocaso':>7}{'luz':>7}{'crep.fin':>9}   {'holgura':>8}  veredicto")
print('-'*104)
for r in res:
    d=r['dia']
    dp=[p for p in pts if int(float(p['Día']))==d and p['lat']]
    mid=dp[len(dp)//2]
    sr,ss=sun(mid['lat'],mid['lon'],FECHA[d])
    _,cs=sun(mid['lat'],mid['lon'],FECHA[d],alt=-6)
    luz=mins(ss)-mins(sr)
    r.update(amanecer=sr,ocaso=ss,crep_fin=cs,luz_min=luz)
    manejo=(r['manejo_h'] or 0)*60
    nparadas=max(0,len(r['paradas'])-2)
    # 35 min per intermediate stop (walk + photos), 20 min buffer/gas per 100km
    paradas_min=nparadas*35
    extra=((r['km'] or 0)/100)*20
    total=manejo+paradas_min+extra
    holg=luz-total
    v='HOLGADO' if holg>210 else 'JUSTO' if holg>60 else 'APRETADO' if holg>-30 else 'NO CABE'
    r.update(tiempo_estimado_min=round(total),holgura_min=round(holg),veredicto=v)
    print(f"{d:<3}{FECHA[d].strftime('%d %b'):<7}{r['km'] or 0:>6.0f}"
          f"{int(manejo//60)}:{int(manejo%60):02d}".rjust(8)
          +f"{sr:>8}{ss:>7}"
          +f"{luz//60}:{luz%60:02d}".rjust(7)
          +f"{cs:>9}   "
          +(f"{'-' if holg<0 else ''}{abs(int(holg))//60}:{abs(int(holg))%60:02d}").rjust(8)
          +f"  {v}   ({nparadas} paradas ×35min)")
json.dump(res,open('analisis_dias.json','w'),ensure_ascii=False,indent=1)
print(f"\nLuz perdida del 30 sep al 13 oct: {res[0]['luz_min']-res[13]['luz_min']} min ({(res[0]['luz_min']-res[13]['luz_min'])/13:.0f} min/día)")
