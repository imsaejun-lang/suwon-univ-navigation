import sys
import math
sys.stdout.reconfigure(encoding='utf-8')

def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    to_rad = lambda deg: deg * math.pi / 180
    dlat = to_rad(lat2 - lat1)
    dlng = to_rad(lng2 - lng1)
    a = math.sin(dlat / 2)**2 + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(dlng / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

with open('c:/Users/imsae/Desktop/AIEHDDKFL/js/campusData.js', 'r', encoding='utf-8') as f:
    campus_data_js = f.read()

import re

# parse nodes
nodes_text = campus_data_js[campus_data_js.find('const CAMPUS_NODES = {'):campus_data_js.find('const CAMPUS_EDGES = [')]
nodes = {}
for m in re.finditer(r"(\w+):\s*\{\s*id:\s*['\"](\w+)['\"].*?name:\s*['\"]([^'\"]+)['\"].*?lat:\s*([0-9.]+),\s*lng:\s*([0-9.]+)", nodes_text, re.DOTALL):
    nodes[m.group(1)] = {
        'id': m.group(2),
        'name': m.group(3),
        'lat': float(m.group(4)),
        'lng': float(m.group(5))
    }

# parse edges
edges_text = campus_data_js[campus_data_js.find('const CAMPUS_EDGES = ['):campus_data_js.find('];', campus_data_js.find('const CAMPUS_EDGES = ['))]
edges = []
for line in edges_text.splitlines():
    line = line.strip()
    if not line.startswith('{'): continue
    m_from = re.search(r"from:\s*['\"](\w+)['\"]", line)
    m_to = re.search(r"to:\s*['\"](\w+)['\"]", line)
    m_road = re.search(r"roadName:\s*['\"]([^'\"]+)['\"]", line)
    is_main = 'isMainRoad: true' in line
    is_trail = 'isTrail: true' in line or 'isSubRoad: true' in line
    if m_from and m_to and m_road:
        edges.append({
            'from': m_from.group(1),
            'to': m_to.group(1),
            'roadName': m_road.group(1),
            'isMainRoad': is_main,
            'isTrail': is_trail
        })

import heapq

def run_route(start_id, end_id, pref='mainRoad'):
    adj = {k: [] for k in nodes}
    for e in edges:
        u, v = e['from'], e['to']
        if u not in nodes or v not in nodes: continue
        d = haversine(nodes[u]['lat'], nodes[u]['lng'], nodes[v]['lat'], nodes[v]['lng'])
        if pref == 'shortest':
            w = d
        else: # mainRoad
            mult = 1.0
            if e['isMainRoad']: mult = 0.65
            elif e['isTrail']: mult = 1.80
            w = d * mult
        adj[u].append((v, w, d, e['roadName']))
        adj[v].append((u, w, d, e['roadName']))

    dist_map = {k: float('inf') for k in nodes}
    dist_map[start_id] = 0
    prev_map = {k: None for k in nodes}
    pq = [(0, start_id)]

    while pq:
        d, u = heapq.heappop(pq)
        if d > dist_map[u]: continue
        if u == end_id: break
        for v, w, phys, rname in adj[u]:
            if dist_map[u] + w < dist_map[v]:
                dist_map[v] = dist_map[u] + w
                prev_map[v] = u
                heapq.heappush(pq, (dist_map[v], v))

    path = []
    curr = end_id
    if prev_map[curr] or curr == start_id:
        while curr:
            path.insert(0, curr)
            curr = prev_map[curr]

    if not path: return None

    tot_dist = 0
    for i in range(len(path) - 1):
        tot_dist += haversine(
            nodes[path[i]]['lat'], nodes[path[i]]['lng'],
            nodes[path[i+1]]['lat'], nodes[path[i+1]]['lng']
        )

    return path, round(tot_dist)

print("=== DUAL ROUTE COMPARISON (Main Road vs Shortest) ===")
pairs = [
    ('main_gate', 'it_college', '정문 -> IT대학'),
    ('back_gate', 'it_college', '후문 -> IT대학'),
    ('central_library', 'main_building', '중앙도서관 -> 본관'),
    ('humanities_college', 'it_college', '인문사회대 -> IT대학'),
]

for s, e, label in pairs:
    mr_path, mr_dist = run_route(s, e, 'mainRoad')
    sh_path, sh_dist = run_route(s, e, 'shortest')
    print(f"\n[{label}]")
    print(f"  🏛️ 큰길 우선: {mr_dist}m (약 {math.ceil(mr_dist/68)}분) | 경로: {' -> '.join([nodes[p]['name'] for p in mr_path])}")
    print(f"  ⚡ 최단 거리: {sh_dist}m (약 {math.ceil(sh_dist/68)}분) | 경로: {' -> '.join([nodes[p]['name'] for p in sh_path])}")

