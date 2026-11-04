import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('c:/Users/imsae/Desktop/AIEHDDKFL/js/app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print("--- LINES 740-790 ---")
for i in range(739, min(790, len(lines))):
    print(f"{i+1}: {lines[i]}", end='')

print("\n--- LINES 875-940 ---")
for i in range(874, min(940, len(lines))):
    print(f"{i+1}: {lines[i]}", end='')

print("\n--- LINES 1480-1520 ---")
for i in range(1479, min(1520, len(lines))):
    print(f"{i+1}: {lines[i]}", end='')

