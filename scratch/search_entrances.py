import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('c:/Users/imsae/Desktop/AIEHDDKFL/js/indoorData.js', 'r', encoding='utf-8') as f:
    text = f.read()

import re
print("indoorData entrances:")
for m in re.finditer(r"entrances:\s*\[(.*?)\]", text, re.DOTALL):
    print(m.group(0)[:500])

for m in re.finditer(r"ent_\w+", text):
    print(m.group(0))

