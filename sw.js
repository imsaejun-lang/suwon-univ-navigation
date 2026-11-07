/**
 * 수원대 길찾기 (USW Nav) - Progressive Web App Service Worker
 * Version: v1.0.0
 */

const CACHE_NAME = 'usw-nav-v1.3.0';

// 오프라인 및 빠른 로딩을 위한 핵심 앱 쉘 에셋
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/campusData.js',
  './js/dijkstra.js',
  './js/indoorData.js',
  './js/indoorNavigator.js',
  './js/simulation.js',
  './js/tts.js',
  './js/gpsTracker.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

// 1. Install Event: 핵심 에셋 프리캐싱
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Pre-caching offline app shell:', CACHE_NAME);
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        // 대기 상태 없이 즉시 활성화 준비
        return self.skipWaiting();
      })
      .catch((err) => {
        console.warn('[ServiceWorker] Pre-cache failed:', err);
      })
  );
});

// 2. Activate Event: 구버전 캐시 즉시 정리 및 클라이언트 제어
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[ServiceWorker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[ServiceWorker] Claiming clients for:', CACHE_NAME);
        return self.clients.claim();
      })
  );
});

// 3. Message Event: 프론트엔드로부터 skipWaiting 또는 버전 확인 요청 수신
self.addEventListener('message', (event) => {
  if (event.data) {
    if (event.data.action === 'skipWaiting') {
      self.skipWaiting();
    } else if (event.data.action === 'getVersion') {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ version: CACHE_NAME });
      }
    }
  }
});

// 4. Fetch Event: 정적 파일은 Network-First with Cache Fallback (최신 코드 우선 보장!)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // OSRM 외부 라우팅 API 및 지도 타일은 캐싱하지 않고 네트워크 직접 통신
  if (
    url.hostname.includes('openstreetmap') ||
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('lucide')
  ) {
    return;
  }

  // GET 요청에 대해서만 캐시 처리
  if (req.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        // 유효한 응답인 경우 로컬 캐시 갱신
        if (networkRes && networkRes.status === 200) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, resClone);
          });
        }
        return networkRes;
      })
      .catch(() => {
        // 오프라인 상태이거나 네트워크 에러 시 캐시된 리소스 반환
        return caches.match(req).then((cachedRes) => {
          if (cachedRes) {
            return cachedRes;
          }
          if (req.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Network error and no cache available', {
            status: 503,
            statusText: 'Service Unavailable',
          });
        });
      })
  );
});

