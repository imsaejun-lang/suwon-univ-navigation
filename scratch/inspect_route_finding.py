import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('c:/Users/imsae/Desktop/AIEHDDKFL/js/app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'function startRouteFindingToBuilding' in line:
        start_line = i
        for j in range(start_line, min(start_line + 80, len(lines))):
            print(f"{j+1}: {lines[j]}", end='')
        break

