import urllib.request
import json

overpass_url = "https://overpass-api.de/api/interpreter"
query = """
[out:json][timeout:10];
(
  way["highway"](37.205,126.970,37.216,126.983);
);
out body;
>;
out skel qt;
"""

req = urllib.request.Request(overpass_url, data=query.encode('utf-8'), headers={'User-Agent': 'USW-Campus-Nav/1.0'})
try:
    with urllib.request.urlopen(req, timeout=10) as res:
        data = json.loads(res.read().decode('utf-8'))
        ways = [e for e in data['elements'] if e['type'] == 'way']
        nodes = [e for e in data['elements'] if e['type'] == 'node']
        print(f"Overpass fetched: {len(ways)} ways, {len(nodes)} nodes")
        # save to file for inspection
        with open('c:/Users/imsae/Desktop/AIEHDDKFL/scratch/overpass_campus.json', 'w', encoding='utf-8') as out:
            json.dump(data, out, ensure_ascii=False, indent=2)
except Exception as e:
    print('Overpass error:', e)

