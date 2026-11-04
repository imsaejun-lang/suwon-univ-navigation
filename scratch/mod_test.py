import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('c:/Users/imsae/Desktop/AIEHDDKFL/scratch/test_new_router.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Modify trail keywords: only 단풍나무 숲길 and 도서관-본관 산책로 are pure trail
code = code.replace("trail_keywords = ['숲길', '산책로']", "trail_keywords = ['단풍나무 숲길', '도서관-본관 산책로']")

with open('c:/Users/imsae/Desktop/AIEHDDKFL/scratch/test_new_router.py', 'w', encoding='utf-8') as f:
    f.write(code)

