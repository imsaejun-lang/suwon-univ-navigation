import urllib.request
import json

url = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/126.97828,37.21335;126.97587,37.20998?overview=full&geometries=geojson&steps=true'
req = urllib.request.Request(url, headers={'User-Agent': 'USW-Campus-Nav/1.0'})
with urllib.request.urlopen(req, timeout=5) as res:
    data = json.loads(res.read().decode('utf-8'))
steps = data['routes'][0]['legs'][0]['steps']
for i, s in enumerate(steps):
    m = s['maneuver']
    t = m.get('type')
    mod = m.get('modifier')
    name = s.get('name') or '캠퍼스 도로'
    dist = round(s.get('distance', 0))
    loc = m.get('location')
    print(f"Step {i}: type={t}, mod={mod}, name={name}, dist={dist}m, loc={loc}")

