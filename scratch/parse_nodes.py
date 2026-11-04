import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('c:/Users/imsae/Desktop/AIEHDDKFL/js/campusData.js', 'r', encoding='utf-8') as f:
    text = f.read()

import re
nodes_part = text[text.find('const CAMPUS_NODES = {'):text.find('const CAMPUS_EDGES = [')]

# Find all node entries
pattern = r"(\w+):\s*\{\s*id:\s*['\"](\w+)['\"],\s*name:\s*['\"]([^'\"]+)['\"].*?lat:\s*([0-9.]+),\s*lng:\s*([0-9.]+)"
for m in re.finditer(pattern, nodes_part, re.DOTALL):
    print(f"{m.group(1)}: {m.group(3)} ({m.group(4)}, {m.group(5)})")

