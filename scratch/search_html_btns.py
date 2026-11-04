import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('c:/Users/imsae/Desktop/AIEHDDKFL/index.html', 'r', encoding='utf-8') as f:
    text = f.read()

import re
print("index.html indoor transition buttons:")
for m in re.finditer(r'<button[^>]+id=[\'\"]([^\'\"]*indoor[^\'\"]*)[\'\"][^>]*>(.*?)</button>', text, re.DOTALL | re.IGNORECASE):
    print(m.group(1), m.group(2).strip())

