import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('c:/Users/imsae/Desktop/AIEHDDKFL/js/campusData.js', 'r', encoding='utf-8') as f:
    text = f.read()

import re
m = re.search(r"it_college:\s*\{([^}]+entrances:[^}]+(?:\[[^\]]+\])[^}]+)\}", text, re.DOTALL)
if not m:
    # try broader search
    idx = text.find("it_college: {")
    print(text[idx:idx+1500])
else:
    print(m.group(0))

