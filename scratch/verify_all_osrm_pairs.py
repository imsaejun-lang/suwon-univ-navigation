import urllib.request
import json

test_pairs = [
    ('정문 -> IT대학', 126.97828, 37.21335, 126.97587, 37.20998),
    ('후문 -> IT대학', 126.97960, 37.20720, 126.97587, 37.20998),
    ('중앙도서관 -> IT대학', 126.97595, 37.20872, 126.97538, 37.21005),
    ('경상관 쪽문 -> IT대학', 126.97035, 37.21205, 126.97578, 37.21188),
]

for label, lng1, lat1, lng2, lat2 in test_pairs:
    url = f"https://routing.openstreetmap.de/routed-foot/route/v1/driving/{lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson&steps=true"
    req = urllib.request.Request(url, headers={'User-Agent': 'USW-Campus-Nav/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=4) as res:
            data = json.loads(res.read().decode('utf-8'))
            if data.get('code') == 'Ok' and data.get('routes'):
                r = data['routes'][0]
                coords = r['geometry']['coordinates']
                steps = r['legs'][0]['steps']
                print(f"[{label}] OK! Dist: {round(r['distance'])}m, Road Points: {len(coords)}, Steps: {len(steps)}")
            else:
                print(f"[{label}] OSRM returned non-ok: {data.get('code')}")
    except Exception as e:
        print(f"[{label}] Error: {e}")

