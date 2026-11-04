import sys
import math
sys.stdout.reconfigure(encoding='utf-8')

# Haversine distance
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

# parse CAMPUS_NODES
nodes_text = campus_data_js[campus_data_js.find('const CAMPUS_NODES = {'):campus_data_js.find('const CAMPUS_EDGES = [')]
nodes = {}
for m in re.finditer(r"(\w+):\s*\{\s*id:\s*['\"](\w+)['\"].*?name:\s*['\"]([^'\"]+)['\"].*?lat:\s*([0-9.]+),\s*lng:\s*([0-9.]+)", nodes_text, re.DOTALL):
    nodes[m.group(1)] = {
        'id': m.group(2),
        'name': m.group(3),
        'lat': float(m.group(4)),
        'lng': float(m.group(5))
    }

# parse CAMPUS_EDGES
edges_text = campus_data_js[campus_data_js.find('const CAMPUS_EDGES = ['):campus_data_js.find('];', campus_data_js.find('const CAMPUS_EDGES = ['))]
edges = []
edge_pattern = r"\{\s*from:\s*['\"](\w+)['\"],\s*to:\s*['\"](\w+)['\"],\s*roadName:\s*['\"]([^'\"]+)['\"](?:,\s*(isMainRoad|isTrail|isSubRoad):\s*(true|false))?"
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

print(f"Loaded {len(nodes)} nodes and {len(edges)} edges from campusData.js.")

# Check for deleted bad edge
has_bad_edge = any((e['from'] == 'j_it_north_path' and e['to'] == 'j_it_walkway_ne') or (e['to'] == 'j_it_north_path' and e['from'] == 'j_it_walkway_ne') for e in edges)
print(f"Has bad edge (j_it_north_path <-> j_it_walkway_ne): {has_bad_edge} (Should be False)")

# Check for new south edge
has_south_edge = any((e['from'] == 'j_field_south' and e['to'] == 'j_it_plaza') or (e['to'] == 'j_field_south' and e['from'] == 'j_it_plaza') for e in edges)
print(f"Has new south edge (j_field_south <-> j_it_plaza): {has_south_edge} (Should be True)")

import heapq

def run_dijkstra(start_node_id, end_node_id):
    adj = {k: [] for k in nodes}
    for e in edges:
        u, v = e['from'], e['to']
        if u not in nodes or v not in nodes: continue
        phys_dist = haversine(nodes[u]['lat'], nodes[u]['lng'], nodes[v]['lat'], nodes[v]['lng'])
        weight_mult = 1.0
        if e['isMainRoad']: weight_mult = 0.72
        elif e['isTrail']: weight_mult = 1.50
        weight = max(1, round(phys_dist * weight_mult))
        adj[u].append((v, weight, round(phys_dist), e['roadName']))
        adj[v].append((u, weight, round(phys_dist), e['roadName']))

    dist_map = {k: float('inf') for k in nodes}
    dist_map[start_node_id] = 0
    prev_map = {k: None for k in nodes}
    pq = [(0, start_node_id)]

    while pq:
        d, u = heapq.heappop(pq)
        if d > dist_map[u]: continue
        if u == end_node_id: break
        for v, w, phys, rname in adj[u]:
            if dist_map[u] + w < dist_map[v]:
                dist_map[v] = dist_map[u] + w
                prev_map[v] = u
                heapq.heappush(pq, (dist_map[v], v))

    path = []
    curr = end_node_id
    if prev_map[curr] or curr == start_node_id:
        while curr:
            path.insert(0, curr)
            curr = prev_map[curr]

    if not path: return None

    # Calculate physical cumulative distance
    total_physical_dist = 0
    for i in range(len(path) - 1):
        total_physical_dist += haversine(
            nodes[path[i]]['lat'], nodes[path[i]]['lng'],
            nodes[path[i+1]]['lat'], nodes[path[i+1]]['lng']
        )

    # Destination entrance resolution
    last_prev = path[-2] if len(path) >= 2 else None
    ent_id = 'ent_1f_main'
    ent_name = '1층 남동측 주출입구'
    ent_floor = '1F'
    if last_prev in ['j_lib_it_conn', 'central_library', 'science_college']:
        ent_id = 'ent_2f_south'
        ent_name = '2층 남측 중앙출입구'
        ent_floor = '2F'
    elif last_prev in ['j_it_north_path', 'j_dorm_east', 'west_gate_cu']:
        ent_id = 'ent_3f_west'
        ent_name = '3층 서측 언덕 출입구'
        ent_floor = '3F'

    return {
        'path': path,
        'path_names': [nodes[p]['name'] for p in path],
        'total_distance': round(total_physical_dist),
        'destinationEntranceId': ent_id,
        'destinationEntranceName': ent_name,
        'destinationEntranceFloor': ent_floor,
    }

print("\n=== VERIFYING ROUTES TO IT COLLEGE FROM ALL KEY POINTS ===")
test_cases = [
    ('main_gate', '정문'),
    ('back_gate', '후문'),
    ('west_gate_cu', '글로벌경상관 CU 쪽문'),
    ('central_library', '중앙도서관'),
    ('student_union', '학생회관'),
    ('science_college', '자연과학대학'),
    ('law_college', '법정대학'),
    ('humanities_college', '인문사회대학'),
    ('future_innovation', '미래혁신관')
]

for start_id, name in test_cases:
    res = run_dijkstra(start_id, 'it_college')
    print(f"\n[출발지: {name} ({start_id})]")
    print(f"  총 거리: {res['total_distance']}m")
    print(f"  도착 입구: {res['destinationEntranceName']} ({res['destinationEntranceId']}, {res['destinationEntranceFloor']} 직결)")
    print(f"  경로: {' -> '.join(res['path_names'])}")

