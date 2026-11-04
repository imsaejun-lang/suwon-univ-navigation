import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('c:/Users/imsae/Desktop/AIEHDDKFL/js/indoorData.js', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find("entrances: [")
end_idx = text.find("floors: {", idx)
print(text[idx:end_idx])

