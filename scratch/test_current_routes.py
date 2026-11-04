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

# Let's test routing
import re

with open('c:/Users/imsae/Desktop/AIEHDDKFL/js/campusData.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Parse nodes
nodes_text = text[text.find('const CAMPUS_NODES = {'):text.find('const CAMPUS_EDGES = [')]
nodes = {}
for m in re.finditer(r"(\w+):\s*\{\s*id:\s*['\"](\w+)['\"].*?name:\s*['\"]([^'\"]+)['\"].*?lat:\s*([0-9.]+),\s*lng:\s*([0-9.]+)", nodes_text, re.DOTALL):
    nodes[m.group(1)] = {
        'name': m.group(3),
        'lat': float(m.group(4)),
        'lng': float(m.group(5))
    }

print(f"Total parsed nodes: {len(nodes)}")
edges_text = text[text.find('const CAMPUS_EDGES = ['):text.find('];', text.find('const CAMPUS_EDGES = ['))]
edges = []
for m in re.finditer(r"\{\s*from:\s*['\"](\w+)['\"],\s*to:\s*['\"](\w+)['\"],\s*roadName:\s*['\"]([^'\"]+)['\"]", edges_text):
    edges.append((m.group(1), m.group(2), m.group(3)))

print(f"Total parsed edges: {len(edges)}")

import heapq

def dijkstra(start, end, use_weights=False):
    adj = {k: [] for k in nodes}
    for u, v, road in edges:
        if u not in nodes or v not in nodes: continue
        d = haversine(nodes[u]['lat'], nodes[u]['lng'], nodes[v]['lat'], nodes[v]['lng'])
        w = d
        if use_weights:
            # check road name
            is_main = any(kw in road for kw in ['중앙로', '광장', '순환', '가로수길', '사거리', '정문 진입', '후문 보행', '대로'])
            is_trail = '숲길' in road or '산책로' in road
            if is_main: w = d * 0.75
            elif is_trail: w = d * 1.45
        adj[u].append((v, w, d, road))
        adj[v].append((u, w, d, road))

    q = [(0, start, [start], 0)]
    visited = {}
    while q:
        w_acc, u, path, d_acc = heapq.heappop(q)
        if u in visited and visited[u] <= w_acc: continue
        visited[u] = w_acc
        if u == end:
            return path, d_acc, w_acc
        for v, w, d, road in adj[u]:
            if v not in visited or visited[v] > w_acc + w:
                heapq.heappush(q, (w_acc + w, v, path + [v], d_acc + d))
    return None, 0, 0

print("\n--- Current Shortest Paths (Distance Only) ---")
for origin in ['main_gate', 'back_gate', 'west_gate_cu', 'central_library', 'student_union']:
    path, dist, _ = dijkstra(origin, 'it_college', use_weights=False)
    if path:
        print(f"[{origin}] -> {dist:.1f}m: {' -> '.join(path)}")
    else:
        print(f"[{origin}] -> No route")

print("\n--- Shortest Paths (With Main Road Weight) ---")
for origin in ['main_gate', 'back_gate', 'west_gate_cu', 'central_library', 'student_union']:
    path, dist, _ = dijkstra(origin, 'it_college', use_weights=True)
    if path:
        print(f"[{origin}] -> {dist:.1f}m: {' -> '.join(path)}")
    else:
        print(f"[{origin}] -> No route")
