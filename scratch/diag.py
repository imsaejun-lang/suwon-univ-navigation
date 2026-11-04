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
user_data = r"C:\Users\imsae\Desktop\AIEHDDKFL\scratch\cprof_diag"
proc = subprocess.Popen([chrome_path, "--headless=new", "--remote-allow-origins=*", f"--user-data-dir={user_data}", "--remote-debugging-port=9888", "--disable-gpu", "http://localhost:8089/index.html"])
time.sleep(3)
try:
    tabs = json.loads(urllib.request.urlopen("http://localhost:9888/json/list").read().decode('utf-8'))
    page_tab = next(t for t in tabs if 'localhost:8089' in t.get('url', ''))
    path = page_tab['webSocketDebuggerUrl'].split(':9888')[1]
    s = make_ws_handshake('localhost', 9888, path)

    res = eval_js(s, 1, """
    (async () => {
        const itChip = Array.from(document.querySelectorAll('.building-chip')).find(c => c.textContent.includes('IT대학'));
        if (itChip) itChip.click();
        const goRouteBtn = document.getElementById('goRouteViewBtn');
        if (goRouteBtn) goRouteBtn.click();
        await new Promise(r => setTimeout(r, 1000));
        
        const state1 = {
            start: window.__state ? window.__state.startNodeId : null,
            destEntId: window.__state && window.__state.currentRoute ? window.__state.currentRoute.destinationEntranceId : null
        };
        
        const backBtn = document.querySelector('button[data-origin-id="back_gate"]');
        if (backBtn) backBtn.click();
        await new Promise(r => setTimeout(r, 2000));
        
        return {
            btnExists: !!backBtn,
            guideTitle: document.getElementById('guideEntranceTitle').textContent,
            guideFloor: document.getElementById('guideEntranceFloorTag').textContent
        };
    })()
    """)
    print("Diag result:", json.dumps(res, ensure_ascii=True, indent=2))
finally:
    proc.terminate()

