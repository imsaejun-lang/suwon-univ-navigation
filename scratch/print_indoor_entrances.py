import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('c:/Users/imsae/Desktop/AIEHDDKFL/js/indoorData.js', 'r', encoding='utf-8') as f:
    text = f.read()

import re
m = re.search(r"entrances:\s*\[(.*?)\]\s*,", text, re.DOTALL)
if m:
    print(m.group(0))
else:
    idx = text.find("entrances: [")
    print(text[idx:idx+2500])

