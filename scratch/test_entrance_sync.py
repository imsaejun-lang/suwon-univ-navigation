import json
import urllib.request
import time
import subprocess
import socket
import base64
import os

def make_ws_handshake(host, port, path):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect((host, port))
    key = base64.b64encode(os.urandom(16)).decode('utf-8')
    req = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        f"Upgrade: websocket\r\n"
        f"Connection: Upgrade\r\n"
        f"Origin: http://localhost:8089\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        f"Sec-WebSocket-Version: 13\r\n\r\n"
    )
    s.sendall(req.encode('utf-8'))
    resp = s.recv(4096)
    assert b"101" in resp, f"WS handshake failed: {resp}"
    return s

def send_ws_frame(s, text):
    payload = text.encode('utf-8')
    frame = bytearray([0x81])
    length = len(payload)
    mask_key = os.urandom(4)
    if length <= 125:
        frame.append(0x80 | length)
    elif length <= 65535:
        frame.append(0x80 | 126)
        frame.extend(length.to_bytes(2, 'big'))
    else:
        frame.append(0x80 | 127)
        frame.extend(length.to_bytes(8, 'big'))
    frame.extend(mask_key)
    masked = bytearray(b ^ mask_key[i % 4] for i, b in enumerate(payload))
    frame.extend(masked)
    s.sendall(frame)

def recv_ws_frame(s):
    hdr = s.recv(2)
    if not hdr:
        return None
    b2 = hdr[1]
    masked = (b2 & 0x80) != 0
    length = b2 & 0x7F
    if length == 126:
        length = int.from_bytes(s.recv(2), 'big')
    elif length == 127:
        length = int.from_bytes(s.recv(8), 'big')
    if masked:
        mask = s.recv(4)
    data = bytearray()
    while len(data) < length:
        chunk = s.recv(min(4096, length - len(data)))
        if not chunk:
            break
        data.extend(chunk)
    if masked:
        data = bytearray(b ^ mask[i % 4] for i, b in enumerate(data))
    return data.decode('utf-8', errors='ignore')

def eval_js(s, req_id, expr):
    msg = {
        "id": req_id,
        "method": "Runtime.evaluate",
        "params": {"expression": expr, "returnByValue": True, "awaitPromise": True}
    }
    send_ws_frame(s, json.dumps(msg))
    for _ in range(15):
        res = recv_ws_frame(s)
        if res:
            parsed = json.loads(res)
            if parsed.get('id') == req_id:
                return parsed.get('result', {}).get('result', {}).get('value')
    return None

def run_tests():
    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    user_data = r"C:\Users\imsae\Desktop\AIEHDDKFL\scratch\chrome_test_profile_3"
    proc = subprocess.Popen([
        chrome_path,
        "--headless=new",
        "--remote-allow-origins=*",
        f"--user-data-dir={user_data}",
        "--remote-debugging-port=9666",
        "--disable-gpu",
        "http://localhost:8089/index.html"
    ])
    
    time.sleep(3)
    try:
        req = urllib.request.urlopen("http://localhost:9666/json/list")
        tabs = json.loads(req.read().decode('utf-8'))
        page_tab = next(t for t in tabs if 'localhost:8089' in t.get('url', ''))
        ws_url = page_tab['webSocketDebuggerUrl']
        path = ws_url.split(':9666')[1]
        s = make_ws_handshake('localhost', 9666, path)

        # 1. Start route finding to IT College
        print("=== Test 1: Start finding route to IT College ===")
        expr_route = """
        (() => {
            // Click IT대학 explore preview chip or trigger route
            const itChip = Array.from(document.querySelectorAll('.building-chip')).find(c => c.textContent.includes('IT대학'));
            if (itChip) itChip.click();
            // Then click find route
            const goRouteBtn = document.getElementById('goRouteViewBtn');
            if (goRouteBtn) goRouteBtn.click();
            
            return {
                title: document.getElementById('guideEntranceTitle') ? document.getElementById('guideEntranceTitle').textContent : null,
                floorTag: document.getElementById('guideEntranceFloorTag') ? document.getElementById('guideEntranceFloorTag').textContent : null
            };
        })()
        """
        res1 = eval_js(s, 1, expr_route)
        print("Main Gate Origin Result:", json.dumps(res1, ensure_ascii=True))

        # 2. Switch to Back Gate
        print("=== Test 2: Switch origin to Back Gate ===")
        expr_back = """
        (async () => {
            const backBtn = document.querySelector('button[data-origin-id="back_gate"]');
            if (backBtn) backBtn.click();
            await new Promise(r => setTimeout(r, 2000));
            return {
                title: document.getElementById('guideEntranceTitle') ? document.getElementById('guideEntranceTitle').textContent : null,
                floorTag: document.getElementById('guideEntranceFloorTag') ? document.getElementById('guideEntranceFloorTag').textContent : null
            };
        })()
        """
        res2 = eval_js(s, 2, expr_back)
        print("Back Gate Origin Result:", json.dumps(res2, ensure_ascii=True))

        # 3. Switch to CU West Gate
        print("=== Test 3: Switch origin to CU West Gate ===")
        expr_cu = """
        (async () => {
            const cuBtn = document.querySelector('button[data-origin-id="west_gate_cu"]');
            if (cuBtn) cuBtn.click();
            await new Promise(r => setTimeout(r, 2000));
            return {
                title: document.getElementById('guideEntranceTitle') ? document.getElementById('guideEntranceTitle').textContent : null,
                floorTag: document.getElementById('guideEntranceFloorTag') ? document.getElementById('guideEntranceFloorTag').textContent : null
            };
        })()
        """
        res3 = eval_js(s, 3, expr_cu)
        print("CU West Gate Origin Result:", json.dumps(res3, ensure_ascii=True))

        # 4. Verify results
        assert "남동측" in res1['title'], f"res1 title mismatch: {res1['title']}"
        assert "1층" in res1['floorTag'] or "1F" in res1['floorTag'], f"res1 floor mismatch: {res1['floorTag']}"
        
        assert "남측" in res2['title'], f"res2 title mismatch: {res2['title']}"
        assert "2층" in res2['floorTag'] or "2F" in res2['floorTag'], f"res2 floor mismatch: {res2['floorTag']}"
        
        assert "서측" in res3['title'], f"res3 title mismatch: {res3['title']}"
        assert "3층" in res3['floorTag'] or "3F" in res3['floorTag'], f"res3 floor mismatch: {res3['floorTag']}"

        print("=== ALL 3 ORIGINS TO IT ENTRANCES VERIFIED PERFECTLY! ===")
    finally:
        proc.terminate()

if __name__ == '__main__':
    run_tests()
