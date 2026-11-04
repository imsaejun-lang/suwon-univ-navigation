import sys
sys.stdout.reconfigure(encoding='utf-8')

files = [
    'c:/Users/imsae/Desktop/AIEHDDKFL/js/campusData.js',
    'c:/Users/imsae/Desktop/AIEHDDKFL/js/dijkstra.js',
    'c:/Users/imsae/Desktop/AIEHDDKFL/js/indoorData.js',
    'c:/Users/imsae/Desktop/AIEHDDKFL/js/indoorNavigator.js',
    'c:/Users/imsae/Desktop/AIEHDDKFL/js/app.js',
]

# Check parenthesis / braces balance
for fpath in files:
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    stack = []
    pairs = {'{': '}', '(': ')', '[': ']'}
    line_no = 1
    in_str = None
    in_comment = False
    escape = False

    # simple counter
    opens = {'{': 0, '(': 0, '[': 0}
    closes = {'}': 0, ')': 0, ']': 0}

    # count total occurrences
    for ch in content:
        if ch in opens: opens[ch] += 1
        elif ch in closes: closes[ch] += 1

    print(f"File {fpath.split('/')[-1]}:")
    print(f"  {{}}: {opens['{']} vs {closes['}']}")
    print(f"  (): {opens['(']} vs {closes[')']}")
    print(f"  []: {opens['[']} vs {closes[']']}")
    assert opens['{'] == closes['}'], f"Brace mismatch in {fpath}"
    assert opens['('] == closes[')'], f"Paren mismatch in {fpath}"
    assert opens['['] == closes[']'], f"Bracket mismatch in {fpath}"

print("\nAll JS files have perfectly balanced braces, parens, and brackets!")

