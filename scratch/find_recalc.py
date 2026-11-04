import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('c:/Users/imsae/Desktop/AIEHDDKFL/js/indoorNavigator.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'recalculateAndRender' in line:
        for j in range(max(0, i-2), min(len(lines), i+60)):
            print(f"{j+1}: {lines[j]}", end='')
        break

