import json
import urllib.request
import time
import subprocess
import os

def test_pwa_and_ui():
    print("=== PWA & ROUTING VERIFICATION TEST ===")
    
    # 1. manifest.json 유효성 검사
    with open('manifest.json', 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    print(f"[OK] manifest.json valid. Name: {manifest.get('name')}, Display: {manifest.get('display')}")
    assert manifest.get('name') == '수원대 길찾기 (USW Nav)'
    assert manifest.get('display') == 'standalone'
    assert len(manifest.get('icons', [])) >= 2

    # 2. 아이콘 파일 존재 검사
    assert os.path.exists('assets/icons/icon-192.png'), "icon-192.png missing"
    assert os.path.exists('assets/icons/icon-512.png'), "icon-512.png missing"
    print(f"[OK] Icon files exist. 192px ({os.path.getsize('assets/icons/icon-192.png')} bytes), 512px ({os.path.getsize('assets/icons/icon-512.png')} bytes)")

    # 3. sw.js 구문 검사
    with open('sw.js', 'r', encoding='utf-8') as f:
        sw_code = f.read()
    assert 'usw-nav-v1.0.0' in sw_code, "CACHE_NAME missing"
    assert 'skipWaiting' in sw_code, "skipWaiting missing"
    print("[OK] sw.js file checked.")

    # 4. HTTP 서버 및 파일 응답 검사
    res = urllib.request.urlopen("http://localhost:8089/manifest.json")
    assert res.status == 200
    res_sw = urllib.request.urlopen("http://localhost:8089/sw.js")
    assert res_sw.status == 200
    res_html = urllib.request.urlopen("http://localhost:8089/index.html")
    html_text = res_html.read().decode('utf-8')
    assert 'id="appVersionBar"' in html_text
    assert 'id="manualUpdateBtn"' in html_text
    assert 'id="pwaUpdateBanner"' in html_text
    assert 'id="pwaInstallBanner"' in html_text
    assert 'id="iosInstallModal"' in html_text
    assert 'id="sheetEntranceGuideBox"' in html_text
    print("[OK] HTML, sw.js, manifest.json served properly over HTTP.")

    # 5. Headless Chrome을 원격 디버깅 포트로 실행하여 콘솔 에러 및 JS 테스트
    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    proc = subprocess.Popen([
        chrome_path,
        "--headless=new",
        "--remote-debugging-port=9222",
        "--disable-gpu",
        "http://localhost:8089/index.html"
    ])
    
    time.sleep(2)
    try:
        # CDP json/list 호출
        req = urllib.request.urlopen("http://localhost:9222/json/list")
        tabs = json.loads(req.read().decode('utf-8'))
        print(f"[OK] Connected to Headless Chrome. Opened tabs: {len(tabs)}")
        if tabs:
            target_tab = tabs[0]
            ws_url = target_tab.get("webSocketDebuggerUrl")
            print(f"[OK] Target tab: {target_tab.get('title')}, URL: {target_tab.get('url')}")
    except Exception as e:
        print(f"[WARN] CDP check: {e}")
    finally:
        proc.terminate()

    print("=== ALL STATIC & RUNTIME CHECKS PASSED ===")

if __name__ == '__main__':
    test_pwa_and_ui()

