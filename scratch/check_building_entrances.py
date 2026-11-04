import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('c:/Users/imsae/Desktop/AIEHDDKFL/js/campusData.js', 'r', encoding='utf-8') as f:
    text = f.read()

import re
nodes_part = text[text.find('const CAMPUS_NODES = {'):text.find('const CAMPUS_EDGES = [')]

# Find all building nodes
pattern = r"(\w+):\s*\{\s*id:\s*['\"](\w+)['\"].*?name:\s*['\"]([^'\"]+)['\"].*?type:\s*['\"]building['\"]"
for m in re.finditer(pattern, nodes_part, re.DOTALL):
    b_id = m.group(1)
    name = m.group(3)
    # search entranceLat
    sub = nodes_part[m.start():m.start()+800]
    m_ent = re.search(r"entranceLat:\s*([0-9.]+),\s*entranceLng:\s*([0-9.]+)", sub)
    m_lat = re.search(r"lat:\s*([0-9.]+),\s*lng:\s*([0-9.]+)", sub)
    if m_ent:
        print(f"Building {b_id} ({name}): entrance = ({m_ent.group(1)}, {m_ent.group(2)})")
    else:
        print(f"Building {b_id} ({name}): NO ENTRANCE, lat/lng = ({m_lat.group(1)}, {m_lat.group(2)})")

