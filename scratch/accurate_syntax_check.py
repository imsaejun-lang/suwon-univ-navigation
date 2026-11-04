import sys
sys.stdout.reconfigure(encoding='utf-8')

def check_js_syntax(fpath):
    with open(fpath, 'r', encoding='utf-8') as f:
        src = f.read()

    i = 0
    n = len(src)
    line = 1
    col = 1
    stack = []
    
    while i < n:
        ch = src[i]
        if ch == '\n':
            line += 1
            col = 1
            i += 1
            continue

        # Line comment
        if ch == '/' and i + 1 < n and src[i+1] == '/':
            i += 2
            while i < n and src[i] != '\n':
                i += 1
            continue

        # Block comment
        if ch == '/' and i + 1 < n and src[i+1] == '*':
            i += 2
            while i + 1 < n and not (src[i] == '*' and src[i+1] == '/'):
                if src[i] == '\n':
                    line += 1
                    col = 1
                i += 1
            i += 2
            continue

        # Single quote string
        if ch == "'":
            i += 1
            while i < n:
                if src[i] == '\\':
                    i += 2
                elif src[i] == "'":
                    i += 1
                    break
                else:
                    if src[i] == '\n':
                        line += 1
                        col = 1
                    i += 1
            continue

        # Double quote string
        if ch == '"':
            i += 1
            while i < n:
                if src[i] == '\\':
                    i += 2
                elif src[i] == '"':
                    i += 1
                    break
                else:
                    if src[i] == '\n':
                        line += 1
                        col = 1
                    i += 1
            continue

        # Template literal
        if ch == '`':
            i += 1
            while i < n:
                if src[i] == '\\':
                    i += 2
                elif src[i] == '`':
                    i += 1
                    break
                elif src[i] == '$' and i + 1 < n and src[i+1] == '{':
                    # nested expression in template literal
                    stack.append(('}', line, col, 'template_expr'))
                    i += 2
                    break
                else:
                    if src[i] == '\n':
                        line += 1
                        col = 1
                    i += 1
            continue

        if ch in '({[':
            match = ')' if ch == '(' else ('}' if ch == '{' else ']')
            stack.append((match, line, col, ch))
        elif ch in ')}]':
            if not stack:
                print(f"Error in {fpath}:{line}:{col} - Unexpected '{ch}'")
                return False
            expected, eline, ecol, orig = stack.pop()
            if ch != expected:
                print(f"Error in {fpath}:{line}:{col} - Expected '{expected}' (opened at {eline}:{ecol}), found '{ch}'")
                return False

        i += 1
        col += 1

    if stack:
        print(f"Error in {fpath} - Unclosed: {stack}")
        return False

    print(f"{fpath.split('/')[-1]}: Syntax/Balance OK!")
    return True

for f in ['campusData.js', 'dijkstra.js', 'indoorData.js', 'indoorNavigator.js', 'app.js']:
    check_js_syntax(f"c:/Users/imsae/Desktop/AIEHDDKFL/js/{f}")

