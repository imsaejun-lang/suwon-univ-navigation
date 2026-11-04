import urllib.request
import json

# Gate to Back Gate
url = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/126.97828,37.21335;126.97960,37.20720?overview=full&geometries=geojson&steps=true'
req = urllib.request.Request(url, headers={'User-Agent': 'USW-Campus-Nav/1.0'})
with urllib.request.urlopen(req, timeout=5) as res:
    data = json.loads(res.read().decode('utf-8'))
route = data['routes'][0]
print('Gate to Back Gate: dist =', route['distance'], 'coords =', len(route['geometry']['coordinates']))

