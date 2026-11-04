/**
 * 수원대학교 스마트 캠퍼스 내비게이션 - 모바일 고정밀 실시간 GPS & 센서 트래커 모듈
 * 1) watchPosition 고정밀 연속 위성 추적 (enableHighAccuracy: true)
 * 2) 스마트폰 자이로/나침반 센서(DeviceOrientation) 연동
 * 3) 보행로 경로 선 위 수직 투영 스냅(Map-Matching / Road Snapping)
 * 4) 화면 꺼짐 방지(Screen Wake Lock API)
 */

class MobileGpsTracker {
  constructor(options = {}) {
    this.options = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 12000,
      snapThresholdMeters: 14, // 경로 선에서 14m 이내면 보행로 위로 스냅
      ...options,
    };

    this.watchId = null;
    this.isTracking = false;
    this.compassHeading = 0;
    this.hasOrientationListener = false;
    this.wakeLock = null;

    // 콜백 함수들
    this.onLocationUpdate = options.onLocationUpdate || null;
    this.onHeadingUpdate = options.onHeadingUpdate || null;
    this.onError = options.onError || null;
    this.onStatusChange = options.onStatusChange || null;

    // 마지막 수신된 위치 상태
    this.lastPosition = null;
    this.currentRoute = null; // 스냅 대상 경로 객체
  }

  /**
   * 스냅 연산을 위한 활성 경로 설정
   */
  setActiveRoute(route) {
    this.currentRoute = route;
  }

  /**
   * 실시간 고정밀 GPS 추적 시작
   */
  start() {
    if (!('geolocation' in navigator)) {
      if (this.onError) {
        this.onError({ code: -1, message: '이 기기/브라우저는 GPS(Geolocation)를 지원하지 않습니다.' });
      }
      return false;
    }

    if (this.isTracking) return true;

    this.isTracking = true;
    this._requestWakeLock();
    this._initCompass();

    if (this.onStatusChange) {
      this.onStatusChange('locating');
    }

    const geoOptions = {
      enableHighAccuracy: this.options.enableHighAccuracy,
      maximumAge: this.options.maximumAge,
      timeout: this.options.timeout,
    };

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this._handleGpsSuccess(pos),
      (err) => this._handleGpsError(err),
      geoOptions
    );

    return true;
  }

  /**
   * 실시간 GPS 추적 중지
   */
  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.isTracking = false;
    this._releaseWakeLock();

    if (this.onStatusChange) {
      this.onStatusChange('idle');
    }
  }

  /**
   * 위치 수신 성공 처리 (오차 보정 및 경로 스냅)
   */
  _handleGpsSuccess(position) {
    const coords = position.coords;
    const rawLat = coords.latitude;
    const rawLng = coords.longitude;
    const accuracy = Math.round(coords.accuracy || 15);
    const speed = coords.speed !== null && !isNaN(coords.speed) ? Math.max(0, coords.speed) : 0;

    // GPS 칩셋이 제공하는 이동 헤딩(이동 중일 때) 또는 나침반 센서 헤딩
    let heading = this.compassHeading;
    if (coords.heading !== null && !isNaN(coords.heading) && speed > 0.4) {
      heading = coords.heading;
    }

    let lat = rawLat;
    let lng = rawLng;
    let isSnapped = false;
    let snapDistance = 0;

    // 활성 경로가 존재할 경우, 보행로 경로 선 위로 스냅(Map-Matching)
    if (this.currentRoute && this.currentRoute.coordinates && this.currentRoute.coordinates.length > 1) {
      const snapResult = this._snapToRoute(rawLat, rawLng, this.currentRoute.coordinates);
      if (snapResult.distance <= this.options.snapThresholdMeters) {
        lat = snapResult.lat;
        lng = snapResult.lng;
        isSnapped = true;
        snapDistance = snapResult.distance;
      }
    }

    const gpsData = {
      lat,
      lng,
      rawLat,
      rawLng,
      accuracy,
      heading,
      speed,
      isSnapped,
      snapDistance,
      timestamp: position.timestamp,
    };

    this.lastPosition = gpsData;

    if (this.onStatusChange) {
      this.onStatusChange('tracking');
    }

    if (this.onLocationUpdate) {
      this.onLocationUpdate(gpsData);
    }
  }

  /**
   * GPS 수신 에러 처리
   */
  _handleGpsError(err) {
    console.warn('GPS 수신 에러 또는 지연:', err.message);
    if (this.onError) {
      this.onError(err);
    }
    if (this.onStatusChange) {
      this.onStatusChange('error');
    }
  }

  /**
   * 스마트폰 나침반(디바이스 오리엔테이션) 센서 초기화 (iOS/Android)
   */
  async _initCompass() {
    if (this.hasOrientationListener) return;

    const handleOrientation = (e) => {
      let compass = 0;
      if (e.webkitCompassHeading) {
        // iOS Safari: 0=북, 90=동, 180=남, 270=서
        compass = e.webkitCompassHeading;
      } else if (e.alpha !== null) {
        // Android Chrome: alpha 각도를 북쪽 기준 방위각으로 변환
        compass = (360 - e.alpha) % 360;
      }

      this.compassHeading = Math.round(compass);
      if (this.onHeadingUpdate) {
        this.onHeadingUpdate(this.compassHeading);
      }
    };

    // iOS 13+ 권한 요청 처리
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        const response = await DeviceOrientationEvent.requestPermission();
        if (response === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation, true);
          this.hasOrientationListener = true;
        }
      } catch (err) {
        console.warn('나침반 센서 권한 요청 거부 또는 미지원:', err);
      }
    } else if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', handleOrientation, true);
      this.hasOrientationListener = true;
    } else if ('ondeviceorientation' in window) {
      window.addEventListener('deviceorientation', handleOrientation, true);
      this.hasOrientationListener = true;
    }
  }

  /**
   * 화면 꺼짐 방지 (내비게이션 안내 중 화면 유지)
   */
  async _requestWakeLock() {
    if ('wakeLock' in navigator && !this.wakeLock) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });
      } catch (err) {
        // 저전력 모드 등에서 거부될 수 있음
      }
    }
  }

  _releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  /**
   * 다각형 경로 선(Polyline)에서 가장 가까운 수직 지점으로 좌표 스냅
   */
  _snapToRoute(lat, lng, coords) {
    let minDistance = Infinity;
    let closestPoint = { lat, lng };

    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const proj = this._projectPointOnSegment(lat, lng, p1[0], p1[1], p2[0], p2[1]);
      const dist = CampusRouter.haversineDistance(lat, lng, proj.lat, proj.lng);

      if (dist < minDistance) {
        minDistance = dist;
        closestPoint = proj;
      }
    }

    return {
      lat: closestPoint.lat,
      lng: closestPoint.lng,
      distance: Math.round(minDistance),
    };
  }

  /**
   * 선분 (A, B) 위에 점 P의 수직 투영점 계산
   */
  _projectPointOnSegment(py, px, y1, x1, y2, x2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      return { lat: y1, lng: x1 };
    }

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    return {
      lat: y1 + t * dy,
      lng: x1 + t * dx,
    };
  }
}

window.MobileGpsTracker = MobileGpsTracker;

