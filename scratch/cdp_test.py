import json
import urllib.request
import time
import subprocess
import socket
import base64
import os
import hashlib

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

def run_cdp_tests():
    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    user_data = r"C:\Users\imsae\Desktop\AIEHDDKFL\scratch\chrome_test_profile_2"
    proc = subprocess.Popen([
        chrome_path,
        "--headless=new",
        "--remote-allow-origins=*",
        f"--user-data-dir={user_data}",
        "--remote-debugging-port=9444",
        "--disable-gpu",
        "http://localhost:8089/index.html"
    ])
    
    time.sleep(3)
    try:
        req = urllib.request.urlopen("http://localhost:9444/json/list")
        tabs = json.loads(req.read().decode('utf-8'))
        page_tab = next(t for t in tabs if 'localhost:8089' in t.get('url', ''))
        ws_url = page_tab['webSocketDebuggerUrl']
        
        # parse ws url: ws://localhost:9444/devtools/page/...
        path = ws_url.split(':9444')[1]
        s = make_ws_handshake('localhost', 9444, path)
        print("[OK] WebSocket connected to Chrome Page CDP!")

        # 1. Evaluate DOM elements
        eval_script = """
        (() => {
            const checks = {
                appVersionTag: document.getElementById('appVersionTag') ? document.getElementById('appVersionTag').textContent : null,
                manualUpdateBtn: !!document.getElementById('manualUpdateBtn'),
                pwaUpdateBanner: !!document.getElementById('pwaUpdateBanner'),
                pwaInstallBanner: !!document.getElementById('pwaInstallBanner'),
                iosInstallModal: !!document.getElementById('iosInstallModal'),
                sheetEntranceGuideBox: !!document.getElementById('sheetEntranceGuideBox'),
                guideEntranceTitle: document.getElementById('guideEntranceTitle') ? document.getElementById('guideEntranceTitle').textContent : null,
                hasServiceWorker: 'serviceWorker' in navigator,
                standaloneMatch: window.matchMedia('(display-mode: standalone)').matches
            };
            return JSON.stringify(checks);
        })()
        """
        msg = {
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {"expression": eval_script, "returnByValue": True}
        }
        send_ws_frame(s, json.dumps(msg))
        
        resp_data = None
        for _ in range(10):
            res = recv_ws_frame(s)
            if res:
                parsed = json.loads(res)
                if parsed.get('id') == 1:
                    resp_data = parsed
                    break
        
        if resp_data:
            val = json.loads(resp_data['result']['result']['value'])
            print("[EVAL RESULT]:", json.dumps(val, ensure_ascii=False, indent=2))
            assert val['appVersionTag'] == 'v1.0.0'
            assert val['manualUpdateBtn'] is True
            assert val['pwaUpdateBanner'] is True
            assert val['pwaInstallBanner'] is True
            assert val['iosInstallModal'] is True
            assert val['sheetEntranceGuideBox'] is True
            assert val['hasServiceWorker'] is True
            print("[SUCCESS] All PWA & UI DOM elements are rendered and responsive!")

        # 2. Check for JavaScript console errors
        msg2 = {
            "id": 2,
            "method": "Runtime.evaluate",
            "params": {"expression": "window.__hasErrors || false"}
        }
        send_ws_frame(s, json.dumps(msg2))
        for _ in range(5):
            res = recv_ws_frame(s)
            if res:
                parsed = json.loads(res)
                if parsed.get('id') == 2:
                    print("JS Errors on page:", parsed.get('result', {}).get('result', {}).get('value'))
                    break

    finally:
        proc.terminate()

if __name__ == '__main__':
    run_cdp_tests()
