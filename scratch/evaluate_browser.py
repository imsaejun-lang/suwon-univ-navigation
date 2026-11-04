import json
import urllib.request
import time
import subprocess

def evaluate_page():
    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    user_data = r"C:\Users\imsae\Desktop\AIEHDDKFL\scratch\chrome_test_profile"
    proc = subprocess.Popen([
        chrome_path,
        "--headless=new",
        f"--user-data-dir={user_data}",
        "--remote-debugging-port=9333",
        "--disable-gpu",
        "http://localhost:8089/index.html"
    ])
    
    time.sleep(3)
    try:
        # get tabs
        req = urllib.request.urlopen("http://localhost:9333/json/list")
        tabs = json.loads(req.read().decode('utf-8'))
        page_tab = None
        for t in tabs:
            if 'localhost:8089' in t.get('url', ''):
                page_tab = t
                break
        
        if not page_tab and tabs:
            page_tab = tabs[0]
            
        print("Page tab found:", page_tab.get('url'))
    finally:
        proc.terminate()

if __name__ == '__main__':
    evaluate_page()

