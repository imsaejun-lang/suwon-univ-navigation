import json, urllib.request, time, subprocess, socket, base64, os

def make_ws_handshake(host, port, path):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect((host, port))
    key = base64.b64encode(os.urandom(16)).decode('utf-8')
    req = (f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nOrigin: http://localhost:8089\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
    s.sendall(req.encode('utf-8'))
    resp = s.recv(4096)
    assert b"101" in resp
    return s

def send_ws_frame(s, text):
    payload = text.encode('utf-8')
    frame = bytearray([0x81])
    length = len(payload)
    mask_key = os.urandom(4)
    if length <= 125: frame.append(0x80 | length)
    elif length <= 65535: frame.append(0x80 | 126); frame.extend(length.to_bytes(2, 'big'))
    else: frame.append(0x80 | 127); frame.extend(length.to_bytes(8, 'big'))
    frame.extend(mask_key)
    masked = bytearray(b ^ mask_key[i % 4] for i, b in enumerate(payload))
    frame.extend(masked)
    s.sendall(frame)

def recv_ws_frame(s):
    hdr = s.recv(2)
    if not hdr: return None
    b2 = hdr[1]
    masked = (b2 & 0x80) != 0
    length = b2 & 0x7F
    if length == 126: length = int.from_bytes(s.recv(2), 'big')
    elif length == 127: length = int.from_bytes(s.recv(8), 'big')
    if masked: mask = s.recv(4)
    data = bytearray()
    while len(data) < length:
        chunk = s.recv(min(4096, length - len(data)))
        if not chunk: break
        data.extend(chunk)
    if masked: data = bytearray(b ^ mask[i % 4] for i, b in enumerate(data))
    return data.decode('utf-8', errors='ignore')

def eval_js(s, req_id, expr):
    msg = {"id": req_id, "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True, "awaitPromise": True}}
    send_ws_frame(s, json.dumps(msg))
    for _ in range(15):
        res = recv_ws_frame(s)
        if res:
            parsed = json.loads(res)
            if parsed.get('id') == req_id:
                return parsed.get('result', {}).get('result', {}).get('value')
    return None

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
user_data = r"C:\Users\imsae\Desktop\AIEHDDKFL\scratch\cprof_all_test"
proc = subprocess.Popen([chrome_path, "--headless=new", "--remote-allow-origins=*", f"--user-data-dir={user_data}", "--remote-debugging-port=9991", "--disable-gpu", "http://localhost:8089/index.html"])
time.sleep(3)
try:
    tabs = json.loads(urllib.request.urlopen("http://localhost:9991/json/list").read().decode('utf-8'))
    page_tab = next(t for t in tabs if 'localhost:8089' in t.get('url', ''))
    path = page_tab['webSocketDebuggerUrl'].split(':9991')[1]
    s = make_ws_handshake('localhost', 9991, path)

    # 1. Main Gate to IT College
    print("Testing 1: Main Gate -> IT College")
    res1 = eval_js(s, 1, """
    (async () => {
        const itChip = Array.from(document.querySelectorAll('.building-chip')).find(c => c.textContent.includes('IT대학'));
        itChip.click();
        document.getElementById('goRouteViewBtn').click();
        await new Promise(r => setTimeout(r, 1000));
        return {
            origin: document.getElementById('startNodeSelect').value,
            title: document.getElementById('guideEntranceTitle').textContent,
            floor: document.getElementById('guideEntranceFloorTag').textContent
        };
    })()
    """)
    print("Main Gate:", json.dumps(res1, ensure_ascii=True))

    # 2. Back Gate to IT College
    print("Testing 2: Back Gate -> IT College")
    res2 = eval_js(s, 2, """
    (async () => {
        const select = document.getElementById('startNodeSelect');
        select.value = 'back_gate';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 5000));
        return {
            origin: select.value,
            title: document.getElementById('guideEntranceTitle').textContent,
            floor: document.getElementById('guideEntranceFloorTag').textContent,
            debugRouteEntId: window.__debugRoute ? window.__debugRoute.destinationEntranceId : null,
            stateStart: window.__debugState ? window.__debugState.startNodeId : null
        };
    })()
    """)
    print("Back Gate:", json.dumps(res2, ensure_ascii=True))

    # 3. CU West Gate to IT College
    print("Testing 3: CU West Gate -> IT College")
    res3 = eval_js(s, 3, """
    (async () => {
        const select = document.getElementById('startNodeSelect');
        select.value = 'west_gate_cu';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 1500));
        return {
            origin: select.value,
            title: document.getElementById('guideEntranceTitle').textContent,
            floor: document.getElementById('guideEntranceFloorTag').textContent
        };
    })()
    """)
    print("CU West Gate:", json.dumps(res3, ensure_ascii=True))

    # 4. Verify all 3
    assert "남동측" in res1['title']
    assert "1F" in res1['floor'] or "1층" in res1['floor']

    assert "남측" in res2['title']
    assert "2F" in res2['floor'] or "2층" in res2['floor']

    assert "서측" in res3['title']
    assert "3F" in res3['floor'] or "3층" in res3['floor']

    print("=== [PASSED] ALL 3 ORIGINS TO IT COLLEGE VERIFIED PERFECTLY! ===")
finally:
    proc.terminate()
