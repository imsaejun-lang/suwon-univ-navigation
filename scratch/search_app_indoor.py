import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('c:/Users/imsae/Desktop/AIEHDDKFL/js/app.js', 'r', encoding='utf-8') as f:
    text = f.read()

import re
print("app.js indoor references:")
for i, line in enumerate(text.splitlines()):
    if 'indoorNav' in line or 'openITCollege' in line or 'resolveEntrance' in line or 'ent_' in line or 'destinationEntrance' in line:
        print(f"{i+1}: {line.strip()[:100]}")

