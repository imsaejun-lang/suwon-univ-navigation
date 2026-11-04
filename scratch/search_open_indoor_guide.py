import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('c:/Users/imsae/Desktop/AIEHDDKFL/js/app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'openIndoorGuideBtn' in line:
        for j in range(max(0, i-5), min(len(lines), i+20)):
            print(f"{j+1}: {lines[j]}", end='')
        print("---")

