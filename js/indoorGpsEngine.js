/**
 * 수원대학교 스마트 캠퍼스 내비게이션 - 건물 외곽선(Polygon) 기반 실내 GPS 매핑 & 오차 보정 엔진
 * 1) 실제 건물 위경도 폴리곤(회전각·가로세로 비율 반영) ↔ 실내 도식화 도면 좌표(X, Y) 1:1 정방향/역방향 변환
 * 2) 복도 중심선 / 호실 영역 스냅(Snap) 및 지수 이동 평균(EMA) 스무딩으로 GPS 떨림 방지
 * 3) 사용자 오차 보정값(offsetLat, offsetLng) 및 확정 층/호실 상태를 프로토타입·전건물 도식화·원본 도면 간 100% 공유
 */
(function (global) {
  'use strict';

  const METERS_PER_DEG_LAT = 111320;
  const REF_LAT_RAD = (37.21 * Math.PI) / 180;
  const METERS_PER_DEG_LNG = 111320 * Math.cos(REF_LAT_RAD);

  // SUWON_VECTOR_MAP.buildings 이름 -> 앱 buildingId 매핑 테이블
  const VECTOR_NAME_TO_ID = {
    지능형SW융합대학: 'it_college',
    미래혁신관: 'future_innovation',
    중앙도서관: 'central_library',
    인문사회융합대학: 'humanities_college',
    사회관: 'law_college',
    라이프케어사이언스대학: 'science_college',
    혁신공과대학: 'eng_main',
    '제 1공학관': 'eng_building_1',
    '제 2공학관': 'eng_building_2',
    글로벌인재대학: 'global_talent',
    체육대학: 'sports_college',
    학생회관: 'student_union',
    디자인앤아트대학: 'art_college',
    조형관: 'sculpture_hall',
    고운첨단과학기술연구원: 'advanced_tech_inst',
    '고운기숙사 A동': 'dormitory_a',
    '고운기숙사 B동': 'dormitory_b',
    '고운기숙사 C동': 'dormitory_c',
    음악테크놀로지대학: 'music_college',
    ACE교육관: 'lecture_hall',
    경영공학대학: 'global_business',
    대학본부: 'main_building',
  };

  // IT대학 실제 외곽선(지능형SW융합대학) 기반 기본 폴리곤 폴백
  const IT_COLLEGE_FALLBACK_POLY = [
    [37.20983, 126.97466],
    [37.20988, 126.97538],
    [37.20989, 126.97578],
    [37.21006, 126.97578],
    [37.21058, 126.9757],
    [37.21046, 126.9747],
    [37.21011, 126.97468],
    [37.21005, 126.97461],
    [37.20983, 126.97466],
  ];

  // IT대학 실내 도면(0~100%) 좌표 범위 (서측 310호/언덕입구 ~ 동측 1F 주출입구/아트리움)
  const IT_FLOOR_BOUNDS_PCT = {
    minX: 6.0,
    maxX: 90.0,
    minY: 16.0,
    maxY: 86.0,
  };

  const _basisCache = {};

  // 전 화면(도식화 프로토타입 / 전 건물 도식화 / 원본 도면 / 레거시) 공유 실내 GPS 상태
  const sharedState = {
    lastRawGps: null, // { lat, lng, accuracy, heading, timestamp }
    offsetsByBuilding: {}, // { [buildingId]: { offsetLat, offsetLng, calibratedAt, anchorRoomLabel } }
    confirmedByBuilding: {}, // { [buildingId]: { floorId, roomId, roomNumber, roomName, confirmedAt } }
    smoothedPos: {}, // { [key]: { x, y } }
  };

  function toMeters(lat, lng, refLat, refLng) {
    return {
      e: (lng - refLng) * METERS_PER_DEG_LNG,
      n: (lat - refLat) * METERS_PER_DEG_LAT,
    };
  }

  function fromMeters(e, n, refLat, refLng) {
    return {
      lat: refLat + n / METERS_PER_DEG_LAT,
      lng: refLng + e / METERS_PER_DEG_LNG,
    };
  }

  /**
   * 건물 ID에 대응하는 실제 외곽선(Polygon) 좌표 추출
   */
  function getBuildingPolygon(buildingId) {
    const bid = buildingId || 'it_college';
    if (global.SUWON_VECTOR_MAP && Array.isArray(global.SUWON_VECTOR_MAP.buildings)) {
      for (let i = 0; i < global.SUWON_VECTOR_MAP.buildings.length; i++) {
        const b = global.SUWON_VECTOR_MAP.buildings[i];
        if (!b || !b.name || !Array.isArray(b.coords) || b.coords.length < 3) continue;
        const mappedId = VECTOR_NAME_TO_ID[b.name.trim()];
        if (
          mappedId === bid ||
          (bid === 'dormitory' && mappedId === 'dormitory_a') ||
          (bid === 'natural_science_hall' && mappedId === 'science_college')
        ) {
          return b.coords;
        }
      }
    }

    if (bid === 'it_college') {
      return IT_COLLEGE_FALLBACK_POLY;
    }

    // 폴리곤 데이터가 없는 건물은 CAMPUS_NODES 중심점 기준 기본 56m x 36m 직사각 외곽선 생성
    const node = global.CAMPUS_NODES && global.CAMPUS_NODES[bid];
    const cLat = node ? node.lat : 37.21015;
    const cLng = node ? node.lng : 126.97525;
    const dLat = 18 / METERS_PER_DEG_LAT;
    const dLng = 28 / METERS_PER_DEG_LNG;
    return [
      [cLat - dLat, cLng - dLng],
      [cLat - dLat, cLng + dLng],
      [cLat + dLat, cLng + dLng],
      [cLat + dLat, cLng - dLng],
      [cLat - dLat, cLng - dLng],
    ];
  }

  /**
   * 건물 외곽선 폴리곤의 주축 회전각(theta) 및 가로·세로 정규화 기저 계산
   * - 건물 외곽선에서 가장 긴 변의 방향을 주축(회전각)으로 삼아 실제 건물 기울기 및 종횡비를 반영
   */
  function getBuildingGeoBasis(buildingId) {
    const bid = buildingId || 'it_college';
    if (_basisCache[bid]) return _basisCache[bid];

    const poly = getBuildingPolygon(bid);
    const nPts = poly.length > 1 && poly[0][0] === poly[poly.length - 1][0] && poly[0][1] === poly[poly.length - 1][1]
      ? poly.length - 1
      : poly.length;

    let sumLat = 0;
    let sumLng = 0;
    for (let i = 0; i < nPts; i++) {
      sumLat += poly[i][0];
      sumLng += poly[i][1];
    }
    const centerLat = sumLat / Math.max(1, nPts);
    const centerLng = sumLng / Math.max(1, nPts);

    const ptsM = [];
    for (let i = 0; i < nPts; i++) {
      ptsM.push(toMeters(poly[i][0], poly[i][1], centerLat, centerLng));
    }

    // 가장 긴 외곽선 변의 각도(동서 방향 축 기준 -45°~+45° 정규화)로 건물 회전각 산출
    let longestLen = 0;
    let bestAngle = 0;
    for (let i = 0; i < ptsM.length; i++) {
      const a = ptsM[i];
      const b = ptsM[(i + 1) % ptsM.length];
      const de = b.e - a.e;
      const dn = b.n - a.n;
      const len = Math.hypot(de, dn);
      if (len > longestLen) {
        longestLen = len;
        let ang = Math.atan2(dn, de); // 라디안 (동쪽=0, 반시계+)
        // 각도를 [-PI/4, PI/4]로 접어서 도면의 X축(서->동), Y축(북->남) 방향 일관성 보장
        while (ang > Math.PI / 4) ang -= Math.PI / 2;
        while (ang < -Math.PI / 4) ang += Math.PI / 2;
        bestAngle = ang;
      }
    }

    const cosT = Math.cos(bestAngle);
    const sinT = Math.sin(bestAngle);

    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;

    ptsM.forEach((p) => {
      // 회전된 로컬 건물 좌표계: u = 건물 서->동 축, v = 건물 남->북 축
      const u = p.e * cosT + p.n * sinT;
      const v = -p.e * sinT + p.n * cosT;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    });

    const spanU = Math.max(10, maxU - minU);
    const spanV = Math.max(10, maxV - minV);

    const basis = {
      buildingId: bid,
      centerLat,
      centerLng,
      rotationRad: bestAngle,
      rotationDeg: Math.round((bestAngle * 180) / Math.PI * 10) / 10,
      cosT,
      sinT,
      minU,
      maxU,
      minV,
      maxV,
      spanU,
      spanV,
      aspectRatio: spanU / spanV,
      polygon: poly,
    };

    _basisCache[bid] = basis;
    return basis;
  }

  /**
   * 오차 보정값(offsetLat, offsetLng) 조회 및 저장
   */
  function getOffset(buildingId) {
    const bid = buildingId || 'it_college';
    return sharedState.offsetsByBuilding[bid] || { offsetLat: 0, offsetLng: 0 };
  }

  function setOffset(buildingId, offsetLat, offsetLng, meta = {}) {
    const bid = buildingId || 'it_college';
    sharedState.offsetsByBuilding[bid] = {
      offsetLat: Number(offsetLat) || 0,
      offsetLng: Number(offsetLng) || 0,
      calibratedAt: Date.now(),
      anchorRoomId: meta.roomId || null,
      anchorRoomLabel: meta.label || '',
    };
  }

  function clearOffset(buildingId) {
    const bid = buildingId || 'it_college';
    delete sharedState.offsetsByBuilding[bid];
    Object.keys(sharedState.smoothedPos).forEach((k) => {
      if (k.startsWith(bid + ':')) delete sharedState.smoothedPos[k];
    });
  }

  function recordRawGps(gps) {
    if (!gps || !Number.isFinite(gps.lat) || !Number.isFinite(gps.lng)) return;
    sharedState.lastRawGps = {
      lat: gps.lat,
      lng: gps.lng,
      accuracy: gps.accuracy || 15,
      heading: typeof gps.heading === 'number' && !Number.isNaN(gps.heading) ? gps.heading : 0,
      timestamp: gps.timestamp || Date.now(),
    };
  }

  function getLastRawGps() {
    return sharedState.lastRawGps;
  }

  function getCalibratedGps(buildingId, rawLat, rawLng) {
    const lat = Number.isFinite(rawLat) ? rawLat : sharedState.lastRawGps?.lat;
    const lng = Number.isFinite(rawLng) ? rawLng : sharedState.lastRawGps?.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const off = getOffset(buildingId);
    return {
      lat: lat + off.offsetLat,
      lng: lng + off.offsetLng,
      rawLat: lat,
      rawLng: lng,
      offsetLat: off.offsetLat,
      offsetLng: off.offsetLng,
    };
  }

  /**
   * [정방향 변환] GPS (lat, lng) -> 건물 정규화 좌표 (nu, nv) ∈ [0, 1] x [0, 1]
   * - nu: 0(서쪽/도면 좌측) ~ 1(동쪽/도면 우측)
   * - nv: 0(북쪽/도면 상단) ~ 1(남쪽/도면 하단)
   */
  function gpsToNormalizedUV(buildingId, rawLat, rawLng, options = {}) {
    const basis = getBuildingGeoBasis(buildingId);
    const applyOffset = options.applyOffset !== false;
    const off = applyOffset ? getOffset(buildingId) : { offsetLat: 0, offsetLng: 0 };
    const lat = rawLat + off.offsetLat;
    const lng = rawLng + off.offsetLng;

    const m = toMeters(lat, lng, basis.centerLat, basis.centerLng);
    const u = m.e * basis.cosT + m.n * basis.sinT;
    const v = -m.e * basis.sinT + m.n * basis.cosT;

    const rawNu = (u - basis.minU) / basis.spanU;
    const rawNv = (basis.maxV - v) / basis.spanV; // 북쪽(maxV)=0, 남쪽(minV)=1
    const isInside = rawNu >= -0.25 && rawNu <= 1.25 && rawNv >= -0.25 && rawNv <= 1.25;

    return {
      nu: Math.max(0, Math.min(1, rawNu)),
      nv: Math.max(0, Math.min(1, rawNv)),
      rawNu,
      rawNv,
      isInside,
      basis,
    };
  }

  /**
   * [역방향 변환] 건물 정규화 좌표 (nu, nv) -> 실제 위경도 (lat, lng)
   */
  function normalizedUVToGps(buildingId, nu, nv) {
    const basis = getBuildingGeoBasis(buildingId);
    const u = basis.minU + nu * basis.spanU;
    const v = basis.maxV - nv * basis.spanV;
    const e = u * basis.cosT - v * basis.sinT;
    const n = u * basis.sinT + v * basis.cosT;
    return fromMeters(e, n, basis.centerLat, basis.centerLng);
  }

  /**
   * [IT대학 전용 0~100% 도면 좌표계] GPS -> (x, y)
   */
  function gpsToITFloorXY(rawLat, rawLng, options = {}) {
    const bounds = options.bounds || IT_FLOOR_BOUNDS_PCT;
    const { nu, nv, isInside, basis } = gpsToNormalizedUV('it_college', rawLat, rawLng, options);
    const x = bounds.minX + nu * (bounds.maxX - bounds.minX);
    const y = bounds.minY + nv * (bounds.maxY - bounds.minY);
    return { x, y, nu, nv, isInside, rotationDeg: basis.rotationDeg };
  }

  function itFloorXYToGps(x, y, options = {}) {
    const bounds = options.bounds || IT_FLOOR_BOUNDS_PCT;
    const nu = (x - bounds.minX) / (bounds.maxX - bounds.minX);
    const nv = (y - bounds.minY) / (bounds.maxY - bounds.minY);
    return normalizedUVToGps('it_college', nu, nv);
  }

  /**
   * [전 건물 23개동 SuwonBuildingMap SVG 좌표계] GPS -> SVG (x, y)
   */
  function getFloorShellBounds(floorData) {
    if (!floorData) return { minX: 0, maxX: 1000, minY: 0, maxY: 800 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    const polys = floorData.shellBoundary && floorData.shellBoundary.length
      ? floorData.shellBoundary
      : [];
    polys.forEach((poly) => {
      poly.forEach((pt) => {
        if (pt[0] < minX) minX = pt[0];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minY) minY = pt[1];
        if (pt[1] > maxY) maxY = pt[1];
      });
    });

    if (!Number.isFinite(minX)) {
      const vb = floorData.viewBox || [0, 0, 1000, 800];
      return { minX: vb[0] + 40, maxX: vb[2] - 40, minY: vb[1] + 40, maxY: vb[3] - 40 };
    }
    return { minX, maxX, minY, maxY };
  }

  function gpsToPanelSvgXY(buildingId, floorData, rawLat, rawLng, options = {}) {
    const b = getFloorShellBounds(floorData);
    const { nu, nv, isInside, basis } = gpsToNormalizedUV(buildingId, rawLat, rawLng, options);
    const x = b.minX + nu * (b.maxX - b.minX);
    const y = b.minY + nv * (b.maxY - b.minY);
    return { x, y, nu, nv, isInside, bounds: b, rotationDeg: basis.rotationDeg };
  }

  function panelSvgXYToGps(buildingId, floorData, x, y) {
    const b = getFloorShellBounds(floorData);
    const nu = (x - b.minX) / Math.max(1, b.maxX - b.minX);
    const nv = (y - b.minY) / Math.max(1, b.maxY - b.minY);
    return normalizedUVToGps(buildingId, nu, nv);
  }

  /**
   * 점 (px, py)를 선분 (ax, ay)-(bx, by)에 수직 투영
   */
  function projectPointToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) return { x: ax, y: ay, dist: Math.hypot(px - ax, py - ay) };
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const x = ax + t * dx;
    const y = ay + t * dy;
    return { x, y, dist: Math.hypot(px - x, py - y) };
  }

  /**
   * [스냅 + 스무딩] IT대학 도면 좌표를 가장 가까운 복도 선분 또는 호실 중심으로 스냅하고 부드럽게 보간
   */
  function snapAndSmoothITPosition(indoorData, floorId, rawX, rawY, options = {}) {
    if (!indoorData || !indoorData.nodes) return { x: rawX, y: rawY, snappedTo: 'raw' };

    const nodes = indoorData.nodes;
    const edges = indoorData.edges || [];
    let bestPt = { x: rawX, y: rawY, dist: Infinity, kind: 'raw', nodeId: null };

    // 1. 해당 층 복도 간선 위 수직 투영 (벽 관통 방지)
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      if (e.isVertical) continue;
      const a = nodes[e.from];
      const b = nodes[e.to];
      if (!a || !b || a.floor !== floorId || b.floor !== floorId) continue;
      if (a.type !== 'corridor' && b.type !== 'corridor') continue;
      const proj = projectPointToSegment(rawX, rawY, a.x, a.y, b.x, b.y);
      if (proj.dist < bestPt.dist) {
        bestPt = { x: proj.x, y: proj.y, dist: proj.dist, kind: 'corridor', nodeId: a.id };
      }
    }

    // 2. 가장 가까운 강의실/출입구 중심과 비교 (방 내부에 서 있는 경우 방으로 스냅)
    Object.values(nodes).forEach((n) => {
      if (n.floor !== floorId) return;
      if (n.type !== 'classroom' && n.type !== 'entrance') return;
      const d = Math.hypot(n.x - rawX, n.y - rawY);
      if (d < bestPt.dist * 0.92) {
        bestPt = { x: n.x, y: n.y, dist: d, kind: n.type, nodeId: n.id };
      }
    });

    const targetX = bestPt.dist < 30 ? bestPt.x : rawX;
    const targetY = bestPt.dist < 30 ? bestPt.y : rawY;

    const smoothKey = `it_college:${floorId}`;
    const prev = sharedState.smoothedPos[smoothKey];
    const alpha = options.instant ? 1 : (options.alpha || 0.36);

    let finalX = targetX;
    let finalY = targetY;
    if (prev && !options.instant) {
      const jump = Math.hypot(targetX - prev.x, targetY - prev.y);
      // 아주 큰 점프(보정 직후 등)가 아니면 부드럽게 보간
      const a = jump > 35 ? 0.75 : alpha;
      finalX = prev.x + (targetX - prev.x) * a;
      finalY = prev.y + (targetY - prev.y) * a;
    }

    sharedState.smoothedPos[smoothKey] = { x: finalX, y: finalY };
    return {
      x: finalX,
      y: finalY,
      snappedTo: bestPt.kind,
      nearestNodeId: bestPt.nodeId,
    };
  }

  /**
   * [스냅 + 스무딩] SuwonBuildingMap 23개 전 건물 SVG 좌표를 복도 간선/섹터 중심으로 스냅 & 보간
   */
  function snapAndSmoothPanelPosition(buildingId, floorData, rawX, rawY, options = {}) {
    if (!floorData) return { x: rawX, y: rawY, snappedTo: 'raw' };

    let bestPt = { x: rawX, y: rawY, dist: Infinity, kind: 'raw', sectorId: null };
    const cg = floorData.corridorGraph;
    if (cg && cg.nodes && Array.isArray(cg.edges)) {
      for (let i = 0; i < cg.edges.length; i++) {
        const e = cg.edges[i];
        const a = cg.nodes[e.from];
        const b = cg.nodes[e.to];
        if (!a || !b) continue;
        const proj = projectPointToSegment(rawX, rawY, a.x, a.y, b.x, b.y);
        if (proj.dist < bestPt.dist) {
          bestPt = { x: proj.x, y: proj.y, dist: proj.dist, kind: 'corridor', sectorId: null };
        }
      }
    }

    if (Array.isArray(floorData.sectors)) {
      floorData.sectors.forEach((sec) => {
        if (!sec || sec.type === 'void' || !sec.center) return;
        const d = Math.hypot(sec.center[0] - rawX, sec.center[1] - rawY);
        if (d < bestPt.dist * 0.88) {
          bestPt = { x: sec.center[0], y: sec.center[1], dist: d, kind: sec.type, sectorId: sec.id };
        }
      });
    }

    const targetX = Number.isFinite(bestPt.dist) ? bestPt.x : rawX;
    const targetY = Number.isFinite(bestPt.dist) ? bestPt.y : rawY;

    const smoothKey = `${buildingId}:${floorData.floor}`;
    const prev = sharedState.smoothedPos[smoothKey];
    const alpha = options.instant ? 1 : (options.alpha || 0.36);

    let finalX = targetX;
    let finalY = targetY;
    if (prev && !options.instant) {
      finalX = prev.x + (targetX - prev.x) * alpha;
      finalY = prev.y + (targetY - prev.y) * alpha;
    }

    sharedState.smoothedPos[smoothKey] = { x: finalX, y: finalY };
    return { x: finalX, y: finalY, snappedTo: bestPt.kind, nearestSectorId: bestPt.sectorId };
  }

  /**
   * [2단계 보정용] IT대학 특정 층에서 (x, y)와 가장 가까운 호실 및 인접 호실 N개 거리순 반환
   */
  function findNearestITRooms(indoorData, floorId, x, y, count = 5) {
    if (!indoorData || !indoorData.nodes) return [];
    const normalizedFloor = String(floorId || '3F').toUpperCase();
    const rooms = Object.values(indoorData.nodes).filter(
      (n) => n.floor === normalizedFloor && n.type === 'classroom'
    );
    return rooms
      .map((room) => ({
        room,
        dist: Math.hypot(room.x - x, room.y - y),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, count);
  }

  /**
   * [2단계 보정용] 전 건물 SuwonBuildingMap 특정 층에서 (x, y)와 가장 가까운 섹터 N개 거리순 반환
   */
  function findNearestPanelSectors(floorData, x, y, count = 5) {
    if (!floorData || !Array.isArray(floorData.sectors)) return [];
    const candidates = floorData.sectors.filter(
      (s) =>
        s &&
        s.type !== 'void' &&
        s.type !== 'stairs' &&
        s.type !== 'elevator' &&
        s.corridorNodeId &&
        Array.isArray(s.center)
    );
    return candidates
      .map((sector) => ({
        sector,
        dist: Math.hypot(sector.center[0] - x, sector.center[1] - y),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, count);
  }

  /**
   * 사용자가 특정 호실로 오차를 보정했을 때 offsetLat, offsetLng 계산·저장
   */
  function calibrateToITRoom(roomNode, rawLat, rawLng) {
    if (!roomNode) return null;
    const baseRaw =
      Number.isFinite(rawLat) && Number.isFinite(rawLng)
        ? { lat: rawLat, lng: rawLng }
        : sharedState.lastRawGps;

    const targetGps = itFloorXYToGps(roomNode.x, roomNode.y);
    let offsetLat = 0;
    let offsetLng = 0;
    if (baseRaw && Number.isFinite(baseRaw.lat) && Number.isFinite(baseRaw.lng)) {
      offsetLat = targetGps.lat - baseRaw.lat;
      offsetLng = targetGps.lng - baseRaw.lng;
      setOffset('it_college', offsetLat, offsetLng, {
        roomId: roomNode.id,
        label: roomNode.roomNumber || roomNode.name,
      });
    }

    // 스무딩 캐시도 보정된 호실 위치로 즉시 동기화
    sharedState.smoothedPos[`it_college:${roomNode.floor}`] = { x: roomNode.x, y: roomNode.y };
    sharedState.confirmedByBuilding.it_college = {
      floorId: roomNode.floor,
      roomId: roomNode.id,
      roomNumber: roomNode.roomNumber || roomNode.name,
      roomName: roomNode.name || roomNode.roomNumber,
      confirmedAt: Date.now(),
    };

    return { offsetLat, offsetLng, targetGps };
  }

  function calibrateToPanelSector(buildingId, floorData, sector, rawLat, rawLng) {
    if (!floorData || !sector || !sector.center) return null;
    const baseRaw =
      Number.isFinite(rawLat) && Number.isFinite(rawLng)
        ? { lat: rawLat, lng: rawLng }
        : sharedState.lastRawGps;

    const targetGps = panelSvgXYToGps(buildingId, floorData, sector.center[0], sector.center[1]);
    let offsetLat = 0;
    let offsetLng = 0;
    if (baseRaw && Number.isFinite(baseRaw.lat) && Number.isFinite(baseRaw.lng)) {
      offsetLat = targetGps.lat - baseRaw.lat;
      offsetLng = targetGps.lng - baseRaw.lng;
      setOffset(buildingId, offsetLat, offsetLng, {
        roomId: sector.id,
        label: sector.roomNumber || sector.name,
      });
    }

    sharedState.smoothedPos[`${buildingId}:${floorData.floor}`] = {
      x: sector.center[0],
      y: sector.center[1],
    };
    sharedState.confirmedByBuilding[buildingId] = {
      floorId: floorData.floor,
      roomId: sector.id,
      roomNumber: sector.roomNumber || sector.shortLabel || sector.name,
      roomName: sector.name || sector.roomNumber || sector.id,
      confirmedAt: Date.now(),
    };

    return { offsetLat, offsetLng, targetGps };
  }

  function getConfirmedLocation(buildingId) {
    return sharedState.confirmedByBuilding[buildingId || 'it_college'] || null;
  }

  function setConfirmedLocation(buildingId, info) {
    sharedState.confirmedByBuilding[buildingId || 'it_college'] = {
      ...info,
      confirmedAt: Date.now(),
    };
  }

  global.IndoorGpsEngine = {
    sharedState,
    getBuildingPolygon,
    getBuildingGeoBasis,
    getOffset,
    setOffset,
    clearOffset,
    recordRawGps,
    getLastRawGps,
    getCalibratedGps,
    gpsToNormalizedUV,
    normalizedUVToGps,
    gpsToITFloorXY,
    itFloorXYToGps,
    getFloorShellBounds,
    gpsToPanelSvgXY,
    panelSvgXYToGps,
    snapAndSmoothITPosition,
    snapAndSmoothPanelPosition,
    findNearestITRooms,
    findNearestPanelSectors,
    calibrateToITRoom,
    calibrateToPanelSector,
    getConfirmedLocation,
    setConfirmedLocation,
  };
})(window);
