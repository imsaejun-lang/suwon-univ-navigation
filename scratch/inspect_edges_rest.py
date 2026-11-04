import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('c:/Users/imsae/Desktop/AIEHDDKFL/js/campusData.js', 'r', encoding='utf-8') as f:
    text = f.read()

edges_start = text.find('const CAMPUS_EDGES = [')
edges_end = text.find('];', edges_start)
edges_code = text[edges_start:edges_end+2]

lines = edges_code.splitlines()
for i, line in enumerate(lines[60:]):
    print(f"{i+61}: {line}")

