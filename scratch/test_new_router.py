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

import re

with open('c:/Users/imsae/Desktop/AIEHDDKFL/js/campusData.js', 'r', encoding='utf-8') as f:
    text = f.read()

nodes_text = text[text.find('const CAMPUS_NODES = {'):text.find('const CAMPUS_EDGES = [')]
nodes = {}
for m in re.finditer(r"(\w+):\s*\{\s*id:\s*['\"](\w+)['\"].*?name:\s*['\"]([^'\"]+)['\"].*?lat:\s*([0-9.]+),\s*lng:\s*([0-9.]+)", nodes_text, re.DOTALL):
    nodes[m.group(1)] = {
        'name': m.group(3),
        'lat': float(m.group(4)),
        'lng': float(m.group(5))
    }

# Read edges, remove j_it_north_path <-> j_it_walkway_ne, add j_field_south <-> j_it_plaza
edges_text = text[text.find('const CAMPUS_EDGES = ['):text.find('];', text.find('const CAMPUS_EDGES = ['))]
raw_edges = []
for m in re.finditer(r"\{\s*from:\s*['\"](\w+)['\"],\s*to:\s*['\"](\w+)['\"],\s*roadName:\s*['\"]([^'\"]+)['\"]", edges_text):
    u, v, r = m.group(1), m.group(2), m.group(3)
    if (u == 'j_it_north_path' and v == 'j_it_walkway_ne') or (u == 'j_it_walkway_ne' and v == 'j_it_north_path'):
        continue # delete invalid crossing edge!
    raw_edges.append((u, v, r))

# add j_field_south <-> j_it_plaza
raw_edges.append(('j_field_south', 'j_it_plaza', '대운동장 남측 도로'))

# Mark main roads & trails
main_keywords = ['중앙로', '광장', '순환', '가로수길', '사거리', '정문 진입', '후문 보행', '대로', '대운동장 서측', '대운동장 남측']
trail_keywords = ['단풍나무 숲길', '도서관-본관 산책로']

processed_edges = []
for u, v, r in raw_edges:
    is_main = any(kw in r for kw in main_keywords)
    is_trail = any(kw in r for kw in trail_keywords)
    processed_edges.append({
        'from': u,
        'to': v,
        'roadName': r,
        'isMainRoad': is_main,
        'isTrail': is_trail
    })

import heapq

def test_router(start, end):
    adj = {k: [] for k in nodes}
    for e in processed_edges:
        u, v = e['from'], e['to']
        if u not in nodes or v not in nodes: continue
        d = haversine(nodes[u]['lat'], nodes[u]['lng'], nodes[v]['lat'], nodes[v]['lng'])
        w = d
        if e['isMainRoad']:
            w = d * 0.72
        elif e['isTrail']:
            w = d * 1.50
        adj[u].append((v, w, d, e['roadName']))
        adj[v].append((u, w, d, e['roadName']))

    q = [(0, start, [start], 0)]
    visited = {}
    while q:
        w_acc, u, path, d_acc = heapq.heappop(q)
        if u in visited and visited[u] <= w_acc: continue
        visited[u] = w_acc
        if u == end:
            # Determine entrance
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
            elif last_prev in ['j_it_plaza', 'j_it_walkway_ne', 'j_field_south']:
                ent_id = 'ent_1f_main'
                ent_name = '1층 남동측 주출입구'
                ent_floor = '1F'
            return path, d_acc, ent_id, ent_name, ent_floor

        for v, w, d, road in adj[u]:
            if v not in visited or visited[v] > w_acc + w:
                heapq.heappush(q, (w_acc + w, v, path + [v], d_acc + d))
    return None, 0, None, None, None

origins = [
    ('main_gate', '정문'),
    ('back_gate', '후문'),
    ('west_gate_cu', '글로벌경상관 CU 쪽문'),
    ('central_library', '중앙도서관'),
    ('student_union', '학생회관'),
    ('humanities_college', '인문사회대학'),
    ('science_college', '자연과학대학'),
    ('law_college', '법정대학')
]

print("=== NEW ROUTING RESULTS WITH MAIN ROAD PRIORITY & ENTRANCE RESOLUTION ===")
for orig_id, orig_name in origins:
    path, dist, ent_id, ent_name, ent_floor = test_router(orig_id, 'it_college')
    path_names = [nodes[n]['name'] for n in path]
    print(f"\n[{orig_name} ({orig_id}) ➔ IT대학]")
    print(f"  총 거리: {round(dist)}m")
    print(f"  도착 입구: {ent_name} ({ent_id}, {ent_floor} 직결)")
    print(f"  경로: {' ➔ '.join(path_names)}")
