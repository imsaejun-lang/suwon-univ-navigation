import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('c:/Users/imsae/Desktop/AIEHDDKFL/index.html', 'r', encoding='utf-8') as f:
    text = f.read()

start = text.find('<section id="bottomSheet"')
print(text[start:start+2500])

