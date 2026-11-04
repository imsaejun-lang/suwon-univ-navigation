import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('c:/Users/imsae/Desktop/AIEHDDKFL/index.html', 'r', encoding='utf-8') as f:
    text = f.read()

start = text.find('id="sheetViewRoute"')
print(text[start:start+3500])

