/**
 * 수원대학교 스마트 캠퍼스 내비게이션 - 야외 실제 보행자 도로망 라우팅 엔진
 * - OpenStreetMap 실시간 보행자 라우팅 API (routed-foot / alternatives=true) 연동
 * - 교내 정밀 OSM 도로망(Node-Edge Graph) + 강/호수(연못)/대운동장 펜스/건물 폴리곤 관통 원천 차단
 * - 내 GPS 위치 및 건물 출입구 수선의 발(Nearest Point on Road Segment) 도로 스냅
 * - [야외 실제 도로 ➔ 건물 최적 출입구 ➔ 실내 복도] 완벽 연결
 */

const BLOCKED_EDGES_STORAGE_KEY = 'usw_nav_blocked_edges_v1';

// 캠퍼스 중앙 호수(연못) 기본 폴리곤 (SUWON_VECTOR_MAP 로드 전 폴백용)
const FALLBACK_CAMPUS_WATERS = [
  {
    name: '캠퍼스 중앙 연못(고운호)',
    coords: [
      [37.21054, 126.97656],
      [37.21053, 126.97665],
      [37.21048, 126.97673],
      [37.21010, 126.97689],
      [37.20995, 126.97694],
      [37.20981, 126.97693],
      [37.20972, 126.97686],
      [37.20971, 126.97678],
      [37.20974, 126.97670],
      [37.20987, 126.97662],
      [37.21008, 126.97654],
      [37.21041, 126.97654],
      [37.21054, 126.97656],
    ],
  },
];

class CampusRouter {
  /**
   * 양방향 간선 고유 키 생성
   */
  static makeEdgeKey(nodeA, nodeB) {
    return [String(nodeA), String(nodeB)].sort().join('__');
  }

  /**
   * 폴리라인 좌표 배열을 일정 간격(기본 18m)으로 촘촘하게 보간하여
   * 주행 중 '지나온 길 실시간 삭제'와 화살표 렌더링이 부드럽게 작동하도록 지원
   */
  static densifyCoordinates(coords, maxStepMeters = 18) {
    if (!Array.isArray(coords) || coords.length < 2) return coords || [];
    const result = [coords[0]];
    for (let i = 0; i < coords.length - 1; i++) {
      const [lat1, lng1] = coords[i];
      const [lat2, lng2] = coords[i + 1];
      const dist = CampusRouter.haversineDistance(lat1, lng1, lat2, lng2);
      if (dist > maxStepMeters) {
        const steps = Math.ceil(dist / maxStepMeters);
        for (let s = 1; s < steps; s++) {
          const r = s / steps;
          result.push([
            Number((lat1 + (lat2 - lat1) * r).toFixed(6)),
            Number((lng1 + (lng2 - lng1) * r).toFixed(6)),
          ]);
        }
      }
      if (dist > 0.05 || i === coords.length - 2) {
        result.push(coords[i + 1]);
      }
    }
    return result;
  }

  /**
   * 점 P(lat, lng)에서 선분 AB까지의 최소 거리(m) 계산
   */
  static pointToSegmentDistanceMeters(pLat, pLng, aLat, aLng, bLat, bLng) {
    const scaleLng = Math.cos((pLat * Math.PI) / 180) * 111320;
    const scaleLat = 110540;
    const px = (pLng - aLng) * scaleLng;
    const py = (pLat - aLat) * scaleLat;
    const bx = (bLng - aLng) * scaleLng;
    const by = (bLat - aLat) * scaleLat;
    const lenSq = bx * bx + by * by;
    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
    }
    const projLng = aLng + t * (bLng - aLng);
    const projLat = aLat + t * (bLat - aLat);
    return CampusRouter.haversineDistance(pLat, pLng, projLat, projLng);
  }

  /**
   * 점 P(lat, lng)를 선분 AB에 직교 투영(수선의 발)한 좌표 및 거리 반환
   */
  static projectPointOnSegment(pLat, pLng, aLat, aLng, bLat, bLng) {
    const scaleLng = Math.cos((pLat * Math.PI) / 180) * 111320;
    const scaleLat = 110540;
    const px = (pLng - aLng) * scaleLng;
    const py = (pLat - aLat) * scaleLat;
    const bx = (bLng - aLng) * scaleLng;
    const by = (bLat - aLat) * scaleLat;
    const lenSq = bx * bx + by * by;
    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
    }
    const projLng = aLng + t * (bLng - aLng);
    const projLat = aLat + t * (bLat - aLat);
    const dist = CampusRouter.haversineDistance(pLat, pLng, projLat, projLng);
    return { lat: projLat, lng: projLng, t, distance: dist };
  }

  /**
   * Ray-casting 다각형 내부 포함 여부 검사
   */
  static isPointInPolygon(lat, lng, polyCoords) {
    if (!Array.isArray(polyCoords) || polyCoords.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polyCoords.length - 1; i < polyCoords.length; j = i++) {
      const xi = polyCoords[i][0];
      const yi = polyCoords[i][1];
      const xj = polyCoords[j][0];
      const yj = polyCoords[j][1];
      const intersect =
        yi > lng !== yj > lng &&
        lat < ((xj - xi) * (lng - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * 두 선분 AB와 CD의 교차 여부 판정
   */
  static doLineSegmentsIntersect(aLat, aLng, bLat, bLng, cLat, cLng, dLat, dLng) {
    const ccw = (p1Lat, p1Lng, p2Lat, p2Lng, p3Lat, p3Lng) =>
      (p2Lng - p1Lng) * (p3Lat - p1Lat) - (p2Lat - p1Lat) * (p3Lng - p1Lng);
    const d1 = ccw(aLat, aLng, bLat, bLng, cLat, cLng);
    const d2 = ccw(aLat, aLng, bLat, bLng, dLat, dLng);
    const d3 = ccw(cLat, cLng, dLat, dLng, aLat, aLng);
    const d4 = ccw(cLat, cLng, dLat, dLng, bLat, bLng);
    return (
      ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    );
  }

  /**
   * 선분 (lat1, lng1) -> (lat2, lng2)가 다각형(polyCoords)을 관통하는지 판정
   */
  static doesSegmentCrossPolygon(lat1, lng1, lat2, lng2, polyCoords) {
    if (!Array.isArray(polyCoords) || polyCoords.length < 3) return false;
    const minLat = Math.min(lat1, lat2);
    const maxLat = Math.max(lat1, lat2);
    const minLng = Math.min(lng1, lng2);
    const maxLng = Math.max(lng1, lng2);

    let pMinLat = Infinity;
    let pMaxLat = -Infinity;
    let pMinLng = Infinity;
    let pMaxLng = -Infinity;
    for (let i = 0; i < polyCoords.length; i++) {
      const [plat, plng] = polyCoords[i];
      if (plat < pMinLat) pMinLat = plat;
      if (plat > pMaxLat) pMaxLat = plat;
      if (plng < pMinLng) pMinLng = plng;
      if (plng > pMaxLng) pMaxLng = plng;
    }
    if (maxLat < pMinLat || minLat > pMaxLat || maxLng < pMinLng || minLng > pMaxLng) {
      return false;
    }

    const ratios = [0.15, 0.35, 0.5, 0.65, 0.85];
    for (let rIdx = 0; rIdx < ratios.length; rIdx++) {
      const r = ratios[rIdx];
      const mLat = lat1 + (lat2 - lat1) * r;
      const mLng = lng1 + (lng2 - lng1) * r;
      if (CampusRouter.isPointInPolygon(mLat, mLng, polyCoords)) {
        return true;
      }
    }

    for (let i = 0; i < polyCoords.length; i++) {
      const [cLat, cLng] = polyCoords[i];
      const [dLat, dLng] = polyCoords[(i + 1) % polyCoords.length];
      if (CampusRouter.doLineSegmentsIntersect(lat1, lng1, lat2, lng2, cLat, cLng, dLat, dLng)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 선분이 호수(연못)·하천·건물·대운동장 펜스 장애물을 관통하는지 엄격 검사
   * @param {number} lat1
   * @param {number} lng1
   * @param {number} lat2
   * @param {number} lng2
   * @param {boolean} allowEndpointExitBuilding - 출발/도착점이 건물 내부일 때 해당 건물 탈출 스냅 허용 여부
   */
  static doesSegmentCrossObstacle(lat1, lng1, lat2, lng2, allowEndpointExitBuilding = false) {
    const vec = (typeof window !== 'undefined' && window.SUWON_VECTOR_MAP) || null;
    const waters =
      vec && Array.isArray(vec.waters) && vec.waters.length > 0
        ? vec.waters
        : FALLBACK_CAMPUS_WATERS;

    // 1. 호수(연못) 및 저수지 관통 절대 차단
    for (let i = 0; i < waters.length; i++) {
      const w = waters[i];
      if (!w || !w.coords) continue;
      if (
        CampusRouter.isPointInPolygon(lat1, lng1, w.coords) ||
        CampusRouter.isPointInPolygon(lat2, lng2, w.coords) ||
        CampusRouter.doesSegmentCrossPolygon(lat1, lng1, lat2, lng2, w.coords)
      ) {
        return true;
      }
    }

    // 2. 건물 폴리곤 관통 차단
    if (vec && Array.isArray(vec.buildings)) {
      for (let i = 0; i < vec.buildings.length; i++) {
        const b = vec.buildings[i];
        if (!b || !b.coords) continue;
        if (allowEndpointExitBuilding) {
          if (
            CampusRouter.isPointInPolygon(lat1, lng1, b.coords) ||
            CampusRouter.isPointInPolygon(lat2, lng2, b.coords)
          ) {
            continue;
          }
        }
        if (CampusRouter.doesSegmentCrossPolygon(lat1, lng1, lat2, lng2, b.coords)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 전체 폴리라인 좌표열이 물(호수/연못)이나 건물 폴리곤을 관통하는지 검사
   */
  static doesPolylineCrossObstacle(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) return true;
    for (let i = 0; i < coordinates.length - 1; i++) {
      const [lat1, lng1] = coordinates[i];
      const [lat2, lng2] = coordinates[i + 1];
      const isTerminal = i === 0 || i === coordinates.length - 2;
      if (CampusRouter.doesSegmentCrossObstacle(lat1, lng1, lat2, lng2, isTerminal)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 선택된 이동 루트(큰길 우선 vs 최단거리)의 마지막 접근 도로 및 방향에 따른
   * IT대학(경사지 층별 입구 건물) 최적 출입구 및 진입 층수 동적 결정
   * - 동측 보행로/광장 접근 (j_it_ent_1f, j_it_plaza, j_it_walkway_ne 등) ➔ 1층 남동측 주출입구 (ent_1f_main, 1F)
   * - 중앙 사거리·남측 큰길/학술로 접근 (j_it_ent_2f, j_lib_it_conn, j_lib_north 등) ➔ 2층 남측 중앙출입구 (ent_2f_south, 2F)
   * - 서측 언덕길/순환도로 접근 (j_it_ent_3f, j_it_north_path, j_sci_west 등) ➔ 3층 서측 언덕출입구 (ent_3f_west, 3F)
   */
  static resolveDestinationEntrance(
    startCoord,
    startNodeId,
    destNodeId,
    routePreference = 'shortest',
    approachNodeId = null,
    approachCoord = null
  ) {
    if (destNodeId !== 'it_college') {
      return null;
    }

    const ENT_1F = {
      id: 'ent_1f_main',
      name: '1층 남동측 주출입구',
      floor: '1F',
      lat: 37.209976,
      lng: 126.975865,
      roadNodeId: 'j_it_ent_1f',
      description: '동측 보행로 및 대운동장 광장과 바로 이어지는 1층 동쪽 출입구',
    };
    const ENT_2F = {
      id: 'ent_2f_south',
      name: '2층 남측 중앙출입구',
      floor: '2F',
      lat: 37.209850,
      lng: 126.975378,
      roadNodeId: 'j_it_ent_2f',
      description: '중앙 사거리·서측 학술로(큰길) 및 중앙도서관 방면과 직결되는 2층 남쪽 출입구',
    };
    const ENT_3F = {
      id: 'ent_3f_west',
      name: '3층 서측 언덕출입구',
      floor: '3F',
      lat: 37.210055,
      lng: 126.974607,
      roadNodeId: 'j_it_ent_3f',
      description: '서측 언덕길 및 자연과학대·경상관 방면과 직결되는 3층 서쪽 출입구',
    };

    // 1순위: 실제 계산된 경로의 마지막 접근 도로 노드(approachNodeId) 기준 동적 매칭
    if (approachNodeId) {
      if (
        approachNodeId === 'j_it_ent_1f' ||
        approachNodeId === 'j_it_plaza' ||
        approachNodeId === 'j_it_walkway_ne' ||
        approachNodeId === 'j_field_west'
      ) {
        return ENT_1F;
      }
      if (
        approachNodeId === 'j_it_ent_2f' ||
        approachNodeId === 'j_lib_it_conn' ||
        approachNodeId === 'j_lib_north' ||
        approachNodeId === 'j_central_cross' ||
        approachNodeId === 'central_library' ||
        approachNodeId === 'student_union' ||
        approachNodeId === 'j_lib_east'
      ) {
        return ENT_2F;
      }
      if (
        approachNodeId === 'j_it_ent_3f' ||
        approachNodeId === 'j_it_north_path' ||
        approachNodeId === 'j_sci_west' ||
        approachNodeId === 'science_college' ||
        approachNodeId === 'j_law_east' ||
        approachNodeId === 'j_music_south' ||
        approachNodeId === 'j_dorm_east' ||
        approachNodeId === 'west_gate_cu'
      ) {
        return ENT_3F;
      }
    }

    // 2순위: 마지막 접근 도로 좌표(approachCoord)와 각 층 출입구 간의 거리 비교
    if (approachCoord && Number.isFinite(approachCoord.lat) && Number.isFinite(approachCoord.lng)) {
      const d1 = CampusRouter.haversineDistance(approachCoord.lat, approachCoord.lng, ENT_1F.lat, ENT_1F.lng);
      const d2 = CampusRouter.haversineDistance(approachCoord.lat, approachCoord.lng, ENT_2F.lat, ENT_2F.lng);
      const d3 = CampusRouter.haversineDistance(approachCoord.lat, approachCoord.lng, ENT_3F.lat, ENT_3F.lng);
      if (d2 <= d1 && d2 <= d3) return ENT_2F;
      if (d3 <= d1 && d3 <= d2) return ENT_3F;
      return ENT_1F;
    }

    // 3순위: [큰길 우선 (mainRoad)] 선택 시 -> 교내 메인 아스팔트 순환차도는 2층 남측 중앙출입구로 직결
    if (routePreference === 'mainRoad') {
      return ENT_2F;
    }

    const startLng = startCoord ? startCoord.lng : 126.978;
    const startLat = startCoord ? startCoord.lat : 37.213;

    // 4순위: 서측 권역 출발 (CU 쪽문, 경상관, 기숙사, 음악대, 법정대, 복지관 등)
    if (
      startNodeId === 'west_gate_cu' ||
      startNodeId === 'global_business' ||
      startNodeId === 'dormitory' ||
      startNodeId === 'music_college' ||
      startNodeId === 'law_college' ||
      startNodeId === 'amaranth_hall' ||
      startNodeId === 'science_college' ||
      startLng <= 126.9748
    ) {
      return ENT_3F;
    }

    // 5순위: [최단거리 (shortest)] 선택 시 북동측/동측은 1층 남동측 주출입구, 남서측(도서관·본관 등)은 2층 남측 출입구
    if (
      startNodeId === 'central_library' ||
      startNodeId === 'main_building' ||
      startNodeId === 'global_talent' ||
      (startLat < 37.2093 && startLng <= 126.9765)
    ) {
      return ENT_2F;
    }

    return ENT_1F;
  }

  /**
   * @param {Object} graphData - { nodes: Object, edges: Array }
   */
  constructor(graphData) {
    this.nodes = graphData.nodes;
    this.edges = graphData.edges;
    this.adjacencyList = new Map();
    this.blockedEdgeKeys = new Set();
    try {
      localStorage.removeItem(BLOCKED_EDGES_STORAGE_KEY);
    } catch (e) {
      // ignore storage errors
    }
    this._buildGraph();
  }

  _loadBlockedEdgesFromStorage() {
    try {
      const saved = localStorage.getItem(BLOCKED_EDGES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          parsed.forEach((k) => this.blockedEdgeKeys.add(String(k)));
        }
      }
    } catch (e) {
      // ignore storage errors
    }
  }

  _saveBlockedEdgesToStorage() {
    try {
      localStorage.setItem(
        BLOCKED_EDGES_STORAGE_KEY,
        JSON.stringify(Array.from(this.blockedEdgeKeys))
      );
    } catch (e) {
      // ignore storage errors
    }
  }

  isEdgeBlocked(nodeA, nodeB) {
    return this.blockedEdgeKeys.has(CampusRouter.makeEdgeKey(nodeA, nodeB));
  }

  toggleBlockedEdge(nodeA, nodeB) {
    const key = CampusRouter.makeEdgeKey(nodeA, nodeB);
    if (this.blockedEdgeKeys.has(key)) {
      this.blockedEdgeKeys.delete(key);
      this._saveBlockedEdgesToStorage();
      return false;
    } else {
      this.blockedEdgeKeys.add(key);
      this._saveBlockedEdgesToStorage();
      return true;
    }
  }

  clearBlockedEdges() {
    this.blockedEdgeKeys.clear();
    this._saveBlockedEdgesToStorage();
  }

  getBlockedEdges() {
    const list = [];
    this.edges.forEach((edge) => {
      const key = CampusRouter.makeEdgeKey(edge.from, edge.to);
      if (this.blockedEdgeKeys.has(key)) {
        list.push({
          key,
          from: edge.from,
          to: edge.to,
          roadName: edge.roadName || '캠퍼스 보행로',
        });
      }
    });
    return list;
  }

  doesPolylineTouchBlockedEdge(coordinates) {
    if (!this.blockedEdgeKeys || this.blockedEdgeKeys.size === 0) return false;
    if (!Array.isArray(coordinates) || coordinates.length === 0) return false;

    for (const edge of this.edges) {
      const key = CampusRouter.makeEdgeKey(edge.from, edge.to);
      if (!this.blockedEdgeKeys.has(key)) continue;
      const nA = this.nodes[edge.from];
      const nB = this.nodes[edge.to];
      if (!nA || !nB) continue;

      const midLat = (nA.lat + nB.lat) / 2;
      const midLng = (nA.lng + nB.lng) / 2;

      for (let i = 0; i < coordinates.length; i++) {
        const [lat, lng] = coordinates[i];
        const distMid = CampusRouter.haversineDistance(lat, lng, midLat, midLng);
        if (distMid <= 18) return true;
        const distSeg = CampusRouter.pointToSegmentDistanceMeters(
          lat,
          lng,
          nA.lat,
          nA.lng,
          nB.lat,
          nB.lng
        );
        if (distSeg <= 12) return true;
      }
    }
    return false;
  }

  /**
   * 경로가 대운동장 펜스/트랙 내부를 관통하거나, 교내 이동인데 외부 공도(안녕북길·와우로34번길)로 우회하는지 검사
   */
  static isOutsideCampusOrInvalidShortcut(coordinates, allowExternalOrigin = false) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) return true;

    // 호수/연못/건물 폴리곤 관통 시 즉시 차단
    if (CampusRouter.doesPolylineCrossObstacle(coordinates)) {
      return true;
    }

    for (const [lat, lng] of coordinates) {
      // 1) 대운동장 북측 철망 및 운동장 트랙 내부 관통 차단 (lat: 37.21015~37.21188, lng: 126.97772~126.97902)
      if (lat >= 37.21015 && lat <= 37.21188 && lng >= 126.97772 && lng <= 126.97902) {
        return true;
      }

      if (!allowExternalOrigin) {
        // 2) 교내 출발/도착 시 동측 외곽 공도(안녕북길·청구빌라 골목) 우회 차단
        if (lat > 37.21155 && lat <= 37.2136 && lng >= 126.97945) {
          return true;
        }
        // 3) 교내 출발/도착 시 북서측 외곽 도로(와우로34번길 아파트 단지 앞) 우회 차단
        if (lat > 37.21215 && lng < 126.9768) {
          return true;
        }
        // 4) 정문 북측 외곽 대로변 과도한 우회 차단
        if (lat > 37.21455 || lng > 126.9804) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 양방향 보행로 인접 리스트 그래프 생성
   */
  _buildGraph() {
    this.adjacencyList.clear();
    Object.keys(this.nodes).forEach((nodeId) => {
      this.adjacencyList.set(nodeId, []);
    });

    this.edges.forEach((edge) => {
      const fromNode = this.nodes[edge.from];
      const toNode = this.nodes[edge.to];
      if (!fromNode || !toNode) return;

      const fLat = fromNode.entranceLat || fromNode.lat;
      const fLng = fromNode.entranceLng || fromNode.lng;
      const tLat = toNode.entranceLat || toNode.lat;
      const tLng = toNode.entranceLng || toNode.lng;

      const physicalDist = edge.isEntranceLink
        ? 1
        : Math.max(1, CampusRouter.haversineDistance(fLat, fLng, tLat, tLng));

      let weightMultiplier = 1.0;
      if (edge.isExternal) {
        weightMultiplier = 4.0;
      } else if (edge.isDriveway || edge.isMainRoad) {
        weightMultiplier = 0.65;
      } else if (edge.isTrail) {
        weightMultiplier = 1.5;
      }

      const weight = edge.weight || Math.max(1, Math.round(physicalDist * weightMultiplier));
      const edgeProps = {
        weight,
        distance: Math.round(physicalDist),
        roadName: edge.roadName || '캠퍼스 도로',
        isDriveway: Boolean(edge.isDriveway),
        isMainRoad: Boolean(edge.isMainRoad || (edge.isDriveway && !edge.isExternal)),
        isTrail: Boolean(edge.isTrail || edge.isSubRoad),
        isExternal: Boolean(edge.isExternal),
        isEntranceLink: Boolean(edge.isEntranceLink),
      };

      this.adjacencyList.get(edge.from).push({
        node: edge.to,
        ...edgeProps,
      });

      this.adjacencyList.get(edge.to).push({
        node: edge.from,
        ...edgeProps,
      });
    });
  }

  static haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  static calculateBearing(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const toDeg = (rad) => (rad * 180) / Math.PI;
    const dLng = toRad(lng2 - lng1);
    const y = Math.sin(dLng) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
    const brng = toDeg(Math.atan2(y, x));
    return (brng + 360) % 360;
  }

  findNearestNode(lat, lng, onlyWalkwayOrBuilding = false) {
    let minDistance = Infinity;
    let nearestNodeId = null;

    Object.entries(this.nodes).forEach(([nodeId, node]) => {
      if (onlyWalkwayOrBuilding && node.type === 'hidden') return;
      const nLat = node.entranceLat || node.lat;
      const nLng = node.entranceLng || node.lng;
      if (CampusRouter.doesSegmentCrossObstacle(lat, lng, nLat, nLng, true)) {
        return;
      }
      const dist = CampusRouter.haversineDistance(lat, lng, nLat, nLng);
      if (dist < minDistance) {
        minDistance = dist;
        nearestNodeId = nodeId;
      }
    });

    if (!nearestNodeId) {
      Object.entries(this.nodes).forEach(([nodeId, node]) => {
        if (onlyWalkwayOrBuilding && node.type === 'hidden') return;
        const nLat = node.entranceLat || node.lat;
        const nLng = node.entranceLng || node.lng;
        const dist = CampusRouter.haversineDistance(lat, lng, nLat, nLng);
        if (dist < minDistance) {
          minDistance = dist;
          nearestNodeId = nodeId;
        }
      });
    }

    return { nodeId: nearestNodeId, distance: Math.round(minDistance) };
  }

  /**
   * [요구사항 3 핵심] 임의의 GPS/클릭 좌표(lat, lng)에서 강·호수·건물을 관통하지 않는
   * 가장 가까운 실제 도로 선분(Edge) 위의 수선의 발(Nearest Point on Road Segment) 탐색
   */
  findNearestEdgeProjection(lat, lng) {
    let bestEdge = null;
    let bestProj = null;
    let minScore = Infinity;

    let fallbackEdge = null;
    let fallbackProj = null;
    let minFallbackDist = Infinity;

    for (const edge of this.edges) {
      if (edge.isEntranceLink) continue;
      const fromNode = this.nodes[edge.from];
      const toNode = this.nodes[edge.to];
      if (!fromNode || !toNode) continue;
      if (fromNode.type === 'building' || toNode.type === 'building') continue;

      const proj = CampusRouter.projectPointOnSegment(
        lat,
        lng,
        fromNode.lat,
        fromNode.lng,
        toNode.lat,
        toNode.lng
      );

      if (proj.distance < minFallbackDist) {
        minFallbackDist = proj.distance;
        fallbackEdge = edge;
        fallbackProj = proj;
      }

      // 수선의 발까지의 스냅 선분이 호수(연못)나 건물을 관통하면 스냅 후보에서 제외!
      if (CampusRouter.doesSegmentCrossObstacle(lat, lng, proj.lat, proj.lng, true)) {
        continue;
      }

      const penalty = edge.isExternal ? 18 : 0;
      const score = proj.distance + penalty;
      if (score < minScore) {
        minScore = score;
        bestEdge = edge;
        bestProj = proj;
      }
    }

    if (bestEdge && bestProj) {
      return { edge: bestEdge, projection: bestProj, distance: bestProj.distance, unobstructed: true };
    }
    return {
      edge: fallbackEdge,
      projection: fallbackProj,
      distance: minFallbackDist,
      unobstructed: false,
    };
  }

  /**
   * 교내 정밀 OSM 도로망 다익스트라(Dijkstra) 최단 경로 탐색
   * - 직선 연결(Crow-flies) 예외 처리 완전 제거
   * - 출발 GPS 좌표는 가장 가까운 실제 도로 선분의 수선의 발로 스냅한 뒤 해당 도로 선분 양 끝 노드로만 진입
   */
  findShortestPath(
    startNodeId,
    endNodeId,
    customStartCoord = null,
    routePreference = 'mainRoad',
    destCoordMeta = null,
    ignoreBlockedFallback = false
  ) {
    if (!this.nodes[endNodeId]) {
      return null;
    }
    const hasCustomOrigin =
      customStartCoord &&
      Number.isFinite(customStartCoord.lat) &&
      Number.isFinite(customStartCoord.lng);

    if (!hasCustomOrigin && !this.nodes[startNodeId]) {
      return null;
    }

    const VIRTUAL_START_ID = '__custom_origin__';
    let effectiveStartId = startNodeId;
    let virtualStartNode = null;
    const virtualNeighbors = [];
    let snapInfo = null;

    if (hasCustomOrigin) {
      effectiveStartId = VIRTUAL_START_ID;
      snapInfo = this.findNearestEdgeProjection(customStartCoord.lat, customStartCoord.lng);
      const projLat = snapInfo.projection ? snapInfo.projection.lat : customStartCoord.lat;
      const projLng = snapInfo.projection ? snapInfo.projection.lng : customStartCoord.lng;

      virtualStartNode = {
        id: VIRTUAL_START_ID,
        name: customStartCoord.name || '내 위치',
        lat: projLat,
        lng: projLng,
        type: 'junction',
      };

      const pushVirtualNeighbor = (targetNodeId, edgeMeta = {}) => {
        if (!targetNodeId || !this.nodes[targetNodeId]) return;
        const tNode = this.nodes[targetNodeId];
        const tLat = tNode.entranceLat || tNode.lat;
        const tLng = tNode.entranceLng || tNode.lng;
        const dist = Math.max(
          1,
          Math.round(CampusRouter.haversineDistance(projLat, projLng, tLat, tLng))
        );
        virtualNeighbors.push({
          node: targetNodeId,
          weight: dist,
          distance: dist,
          roadName: edgeMeta.roadName || '캠퍼스 도로',
          isDriveway: Boolean(edgeMeta.isDriveway),
          isMainRoad: Boolean(edgeMeta.isMainRoad),
          isTrail: Boolean(edgeMeta.isTrail),
          isExternal: Boolean(edgeMeta.isExternal),
        });
      };

      // ★ 직선 연결(Crow-flies) 원천 차단: 오직 수선의 발이 투영된 실제 도로 선분(Edge)의 양 끝점으로만 연결!
      if (snapInfo.edge) {
        pushVirtualNeighbor(snapInfo.edge.from, snapInfo.edge);
        pushVirtualNeighbor(snapInfo.edge.to, snapInfo.edge);
      }
    }

    const distances = {};
    const previous = {};
    const unvisited = new Set();

    Object.keys(this.nodes).forEach((nodeId) => {
      distances[nodeId] = Infinity;
      previous[nodeId] = null;
      unvisited.add(nodeId);
    });

    if (hasCustomOrigin) {
      distances[VIRTUAL_START_ID] = 0;
      previous[VIRTUAL_START_ID] = null;
      unvisited.add(VIRTUAL_START_ID);
    } else {
      distances[startNodeId] = 0;
    }

    while (unvisited.size > 0) {
      let currentNode = null;
      let smallestDist = Infinity;

      for (const nodeId of unvisited) {
        if (distances[nodeId] < smallestDist) {
          smallestDist = distances[nodeId];
          currentNode = nodeId;
        }
      }

      if (currentNode === null || smallestDist === Infinity) break;
      if (currentNode === endNodeId) break;

      unvisited.delete(currentNode);

      // 건물 노드는 출발지가 아닌 이상 중간 통과 노드로 절대 사용하지 않음 (건물 관통 원천 차단)
      if (
        currentNode !== effectiveStartId &&
        this.nodes[currentNode] &&
        this.nodes[currentNode].type === 'building'
      ) {
        continue;
      }

      const neighbors =
        currentNode === VIRTUAL_START_ID
          ? virtualNeighbors
          : this.adjacencyList.get(currentNode) || [];

      for (const neighbor of neighbors) {
        if (!unvisited.has(neighbor.node)) continue;

        if (!ignoreBlockedFallback && this.isEdgeBlocked(currentNode, neighbor.node)) {
          continue;
        }

        // 다중 출입구 전용 가상 링크는 목적지 진입 또는 출발지 탈출 시에만 허용
        if (
          neighbor.isEntranceLink &&
          neighbor.node !== endNodeId &&
          currentNode !== effectiveStartId
        ) {
          continue;
        }

        let edgeCost = neighbor.weight;
        if (routePreference === 'shortest') {
          const extMult = neighbor.isExternal ? 3.0 : 1.0;
          edgeCost = Math.max(1, Math.round(neighbor.distance * extMult));
        } else if (routePreference === 'mainRoad') {
          let mult = 1.0;
          if (neighbor.isExternal) {
            mult = 25.0; // 목적지가 캠퍼스 내부일 때 학교 밖 외곽 도로 우회 강력 억제
          } else if (neighbor.isMainRoad || neighbor.isDriveway) {
            mult = 0.55; // 교내 메인 아스팔트 순환차도 최우선 우대
          } else if (neighbor.isTrail) {
            mult = 14.0;
          } else {
            mult = 8.5;
          }
          edgeCost = Math.max(1, Math.round(neighbor.distance * mult));
        }

        const alt = distances[currentNode] + edgeCost;
        if (alt < distances[neighbor.node]) {
          distances[neighbor.node] = alt;
          previous[neighbor.node] = currentNode;
        }
      }
    }

    const pathNodeIds = [];
    let curr = endNodeId;
    if (previous[curr] !== null || curr === effectiveStartId) {
      while (curr !== null) {
        pathNodeIds.unshift(curr);
        curr = previous[curr];
      }
    }

    if (pathNodeIds.length === 0) {
      if (!ignoreBlockedFallback && this.blockedEdgeKeys.size > 0) {
        return this.findShortestPath(
          startNodeId,
          endNodeId,
          customStartCoord,
          routePreference,
          destCoordMeta,
          true
        );
      }
      return null;
    }

    const pathNodes = pathNodeIds.map((id) =>
      id === VIRTUAL_START_ID && virtualStartNode
        ? virtualStartNode
        : {
            id,
            ...this.nodes[id],
          }
    );

    const approachNodeId =
      pathNodeIds.length >= 2 ? pathNodeIds[pathNodeIds.length - 2] : effectiveStartId;
    const approachNodeObj =
      pathNodes.length >= 2 ? pathNodes[pathNodes.length - 2] : pathNodes[0];

    let dynamicEntrance = null;
    if (endNodeId === 'it_college') {
      dynamicEntrance = CampusRouter.resolveDestinationEntrance(
        customStartCoord || this.nodes[startNodeId],
        startNodeId,
        endNodeId,
        routePreference,
        approachNodeId,
        approachNodeObj
      );
    }

    const rawCoordinates = [];
    if (hasCustomOrigin && virtualStartNode) {
      const snapDist = CampusRouter.haversineDistance(
        customStartCoord.lat,
        customStartCoord.lng,
        virtualStartNode.lat,
        virtualStartNode.lng
      );
      // 장애물이 없고 도로 인근(45m 이내)일 때만 현재 위치 -> 도로 수선의 발 짧은 스냅 선분 추가
      if (
        snapDist > 1.5 &&
        snapDist <= 45 &&
        snapInfo &&
        snapInfo.unobstructed &&
        !CampusRouter.doesSegmentCrossObstacle(
          customStartCoord.lat,
          customStartCoord.lng,
          virtualStartNode.lat,
          virtualStartNode.lng,
          true
        )
      ) {
        rawCoordinates.push([customStartCoord.lat, customStartCoord.lng]);
      }
      rawCoordinates.push([virtualStartNode.lat, virtualStartNode.lng]);
    }

    pathNodes.forEach((n, idx) => {
      if (idx === 0) {
        if (!hasCustomOrigin) {
          if (n.entranceLat && n.entranceLng) {
            rawCoordinates.push([n.entranceLat, n.entranceLng]);
          } else {
            rawCoordinates.push([n.lat, n.lng]);
          }
        }
      } else if (idx === pathNodes.length - 1) {
        if (endNodeId === 'it_college' && dynamicEntrance) {
          rawCoordinates.push([dynamicEntrance.lat, dynamicEntrance.lng]);
        } else if (destCoordMeta && destCoordMeta.lat && destCoordMeta.lng) {
          rawCoordinates.push([destCoordMeta.lat, destCoordMeta.lng]);
        } else if (n.entranceLat && n.entranceLng) {
          rawCoordinates.push([n.entranceLat, n.entranceLng]);
        } else {
          rawCoordinates.push([n.lat, n.lng]);
        }
      } else {
        rawCoordinates.push([n.lat, n.lng]);
      }
    });

    const coordinates = CampusRouter.densifyCoordinates(rawCoordinates, 18);

    let totalDistance = 0;
    const segments = [];
    for (let i = 0; i < coordinates.length - 1; i++) {
      const [lat1, lng1] = coordinates[i];
      const [lat2, lng2] = coordinates[i + 1];
      const segDist = CampusRouter.haversineDistance(lat1, lng1, lat2, lng2);
      const bearing = CampusRouter.calculateBearing(lat1, lng1, lat2, lng2);
      segments.push({
        index: i,
        from: coordinates[i],
        to: coordinates[i + 1],
        distance: segDist,
        startCumulativeDist: totalDistance,
        endCumulativeDist: totalDistance + segDist,
        bearing,
      });
      totalDistance += segDist;
    }

    totalDistance = Math.round(totalDistance);
    const estimatedMinutes = Math.max(1, Math.ceil(totalDistance / 68));
    const estimatedCalories = Math.max(4, Math.round(totalDistance * 0.045));

    const destinationEntranceId =
      (dynamicEntrance && dynamicEntrance.id) ||
      (destCoordMeta && destCoordMeta.entranceId) ||
      null;
    const destinationEntranceName =
      (dynamicEntrance && dynamicEntrance.name) ||
      (destCoordMeta && destCoordMeta.entranceName) ||
      null;
    const destinationEntranceFloor =
      (dynamicEntrance && dynamicEntrance.floor) ||
      (destCoordMeta && destCoordMeta.entranceFloor) ||
      null;

    const destinationNode = this.nodes[endNodeId];
    const startNode = hasCustomOrigin
      ? {
          id: VIRTUAL_START_ID,
          name: customStartCoord.name || '내 위치',
          lat: rawCoordinates[0][0],
          lng: rawCoordinates[0][1],
        }
      : this.nodes[startNodeId];

    const checkpoints = this._generateCheckpoints(
      pathNodes,
      rawCoordinates,
      segments,
      totalDistance,
      startNode,
      destinationNode,
      { destinationEntranceId, destinationEntranceName, destinationEntranceFloor }
    );

    const preferenceLabel =
      routePreference === 'mainRoad'
        ? '큰길 우선 (차도 중심)'
        : '최단거리 (보행로·지름길 포함)';

    return {
      startNodeId: hasCustomOrigin ? VIRTUAL_START_ID : startNodeId,
      endNodeId,
      startName: startNode.name || '현재 위치',
      destinationName: destinationNode.name,
      destinationBuilding: destinationNode,
      destinationEntranceId,
      destinationEntranceName,
      destinationEntranceFloor,
      routePreference,
      preferenceLabel,
      pathNodeIds,
      pathNodes,
      coordinates,
      segments,
      totalDistance,
      estimatedMinutes,
      estimatedCalories,
      checkpoints,
    };
  }

  findDualRoutes(startNodeId, endNodeId, customStartCoord = null) {
    const mainRoadRoute = this.findShortestPath(startNodeId, endNodeId, customStartCoord, 'mainRoad');
    const shortestRoute = this.findShortestPath(startNodeId, endNodeId, customStartCoord, 'shortest');
    return {
      mainRoad: mainRoadRoute || shortestRoute,
      shortest: shortestRoute || mainRoadRoute,
    };
  }

  _generateCheckpoints(
    pathNodes,
    coordinates,
    segments,
    totalDistance,
    startNode,
    destinationNode,
    entranceMeta = {}
  ) {
    const checkpoints = [];

    checkpoints.push({
      id: 'cp_start',
      type: 'start',
      icon: 'flag',
      title: `${startNode.name || '출발지'}에서 출발`,
      instruction: `${destinationNode.name} 입구까지 실제 보행로 안내를 시작합니다.`,
      voiceText: `${destinationNode.name} 입구까지 안내를 시작합니다.`,
      lat: coordinates[0][0],
      lng: coordinates[0][1],
      cumulativeDist: 0,
      remainingDist: totalDistance,
      turnType: 'start',
    });

    let hasRightTurnPrompt = false;
    let cumulative = 0;
    let lastCheckpointDist = 0;

    const coordOffset = Math.max(0, coordinates.length - pathNodes.length);
    for (let k = 0; k < coordOffset; k++) {
      cumulative += CampusRouter.haversineDistance(
        coordinates[k][0],
        coordinates[k][1],
        coordinates[k + 1][0],
        coordinates[k + 1][1]
      );
    }

    for (let i = 1; i < pathNodes.length - 1; i++) {
      const prevCoord = coordinates[i + coordOffset - 1];
      const currCoord = coordinates[i + coordOffset];
      const nextCoord = coordinates[i + coordOffset + 1];
      if (!prevCoord || !currCoord || !nextCoord) continue;
      const nodeObj = pathNodes[i];

      cumulative += CampusRouter.haversineDistance(
        prevCoord[0],
        prevCoord[1],
        currCoord[0],
        currCoord[1]
      );
      const roundedCumulative = Math.round(cumulative);

      const bearingIn = CampusRouter.calculateBearing(
        prevCoord[0],
        prevCoord[1],
        currCoord[0],
        currCoord[1]
      );
      const bearingOut = CampusRouter.calculateBearing(
        currCoord[0],
        currCoord[1],
        nextCoord[0],
        nextCoord[1]
      );

      const delta = ((bearingOut - bearingIn + 540) % 360) - 180;
      const absDelta = Math.abs(delta);

      if (!nodeObj.isMajorJunction && absDelta < 34) {
        continue;
      }
      if (roundedCumulative - lastCheckpointDist < 28 && !nodeObj.isMajorJunction) {
        continue;
      }

      let turnType = 'straight';
      let turnLabel = '직진';
      let icon = 'arrow-up';
      let voiceText = '';
      let instruction = '';

      const landmarkName = nodeObj.isMajorJunction
        ? nodeObj.name || '갈림길'
        : '캠퍼스 도로 갈림길';

      if (delta >= 24) {
        turnType = 'right';
        turnLabel = '우회전';
        icon = 'corner-up-right';
        if (!hasRightTurnPrompt) {
          voiceText = '50미터 앞 갈림길에서 우회전하세요.';
          instruction = `50m 앞 ${landmarkName}에서 우회전`;
          hasRightTurnPrompt = true;
        } else {
          voiceText = `잠시 후 ${landmarkName}에서 우회전하세요.`;
          instruction = `${landmarkName}에서 우회전`;
        }
      } else if (delta <= -24) {
        turnType = 'left';
        turnLabel = '좌회전';
        icon = 'corner-up-left';
        voiceText = `50미터 앞 ${landmarkName}에서 좌회전하세요.`;
        instruction = `50m 앞 ${landmarkName}에서 좌회전`;
      } else {
        if (!nodeObj.isMajorJunction || roundedCumulative - lastCheckpointDist < 55) {
          continue;
        }
        turnType = 'straight';
        turnLabel = '직진';
        icon = 'arrow-up';
        voiceText = `${landmarkName} 방향으로 계속 직진하세요.`;
        instruction = `${landmarkName} 방면 직진`;
      }

      lastCheckpointDist = roundedCumulative;
      checkpoints.push({
        id: `cp_${i}_${nodeObj.id}`,
        nodeId: nodeObj.id,
        type: 'turn',
        turnType,
        turnLabel,
        icon,
        title: landmarkName,
        instruction,
        voiceText,
        lat: currCoord[0],
        lng: currCoord[1],
        cumulativeDist: roundedCumulative,
        remainingDist: Math.max(0, totalDistance - roundedCumulative),
        angle: Math.round(absDelta),
      });
    }

    if (!hasRightTurnPrompt && checkpoints.length === 1 && segments.length > 0) {
      const midIdx = Math.floor(coordinates.length / 2);
      const midCoord = coordinates[midIdx] || coordinates[0];
      const midDist = Math.round(totalDistance * 0.5);
      checkpoints.push({
        id: 'cp_mid_junction',
        type: 'turn',
        turnType: 'right',
        turnLabel: '우회전',
        icon: 'corner-up-right',
        title: '캠퍼스 중앙 갈림길',
        instruction: '50m 앞 갈림길에서 우회전',
        voiceText: '50미터 앞 갈림길에서 우회전하세요.',
        lat: midCoord[0],
        lng: midCoord[1],
        cumulativeDist: midDist,
        remainingDist: Math.max(0, totalDistance - midDist),
      });
    }

    const lastCoord = coordinates[coordinates.length - 1];
    let arriveTitle = `${destinationNode.name} 입구 도착`;
    let arriveInstruction = '목적지 건물 입구에 도착했습니다. 건물 내부 안내로 전환할 수 있습니다.';
    let arriveVoice = '목적지 건물 입구에 도착했습니다. 건물 내부 안내로 전환할 수 있습니다.';

    if (entranceMeta && entranceMeta.destinationEntranceName) {
      arriveTitle = `${destinationNode.name} ${entranceMeta.destinationEntranceName} (${entranceMeta.destinationEntranceFloor}) 도착`;
      arriveInstruction = `목적지 IT대학 ${entranceMeta.destinationEntranceName}(${entranceMeta.destinationEntranceFloor} 진입)에 도착했습니다. 건물 내부 안내로 전환할 수 있습니다.`;
      arriveVoice = `목적지 IT대학 ${entranceMeta.destinationEntranceName}에 도착했습니다. 건물 내부 안내로 전환할 수 있습니다.`;
    }

    checkpoints.push({
      id: 'cp_arrive',
      type: 'arrive',
      turnType: 'arrive',
      turnLabel: '도착',
      icon: 'map-pin',
      title: arriveTitle,
      instruction: arriveInstruction,
      voiceText: arriveVoice,
      lat: lastCoord[0],
      lng: lastCoord[1],
      cumulativeDist: totalDistance,
      remainingDist: 0,
      destinationEntranceId: entranceMeta.destinationEntranceId || null,
      destinationEntranceFloor: entranceMeta.destinationEntranceFloor || null,
    });

    return checkpoints;
  }

  /**
   * =========================================================================
   * [요구사항 1 핵심] 실제 지도 기반 보행자 전용 길찾기 API (routed-foot) 실시간 연동
   * URL: https://routing.openstreetmap.de/routed-foot/route/v1/foot/{출발lng},{출발lat};{도착lng},{도착lat}?overview=full&geometries=geojson&alternatives=true
   * =========================================================================
   */

  /**
   * OSRM 다중 경유지 또는 출발-도착 후보 경로 배열(routes) 조회
   * @param {Array<{lat:number, lng:number}>} waypoints
   * @param {string} profile - 'foot' | 'car'
   * @param {number} timeoutMs
   * @returns {Promise<Array>}
   */
  static async fetchOSRMRoutes(waypoints, profile = 'foot', timeoutMs = 4500) {
    if (!Array.isArray(waypoints) || waypoints.length < 2) return [];
    const isCar = profile === 'car';
    const service = isCar ? 'routed-car' : 'routed-foot';
    const modePath = isCar ? 'driving' : 'foot';

    const coordPart = waypoints
      .map((pt) => `${Number(pt.lng).toFixed(6)},${Number(pt.lat).toFixed(6)}`)
      .join(';');
    const url = `https://routing.openstreetmap.de/${service}/route/v1/${modePath}/${coordPart}?overview=full&geometries=geojson&alternatives=true&steps=true`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`OSRM (${service}/${modePath}) HTTP Status: ${response.status}`);
      }

      const data = await response.json();
      if (!data || data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
        throw new Error(`OSRM (${service}/${modePath}) returned empty route`);
      }

      return data.routes;
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[CampusRouter] OSRM (${service}/${modePath}) fetch fallback:`, err.message);
      return [];
    }
  }

  /**
   * 단일 OSRM 경로 조회 호환 메서드
   */
  static async fetchOSRMRoute(startCoord, endCoord, profile = 'foot', timeoutMs = 4500) {
    const routes = await CampusRouter.fetchOSRMRoutes([startCoord, endCoord], profile, timeoutMs);
    return routes.length > 0 ? routes[0] : null;
  }

  /**
   * 교내 다익스트라 경로(graphRoute)에서 OSRM에 전달할 핵심 도로 굴곡점/교차점 경유지 추출
   */
  static extractGuideWaypointsFromGraphRoute(graphRoute, startSnapCoord, destCoord, startFromNodeId = null) {
    if (!graphRoute || !Array.isArray(graphRoute.pathNodes) || graphRoute.pathNodes.length < 2) {
      return [startSnapCoord, destCoord];
    }
    const waypoints = [{ lat: startSnapCoord.lat, lng: startSnapCoord.lng }];
    let accumDist = 0;
    let prevLat = startSnapCoord.lat;
    let prevLng = startSnapCoord.lng;

    let startIndex = 1;
    if (startFromNodeId && Array.isArray(graphRoute.pathNodeIds)) {
      const idx = graphRoute.pathNodeIds.indexOf(startFromNodeId);
      if (idx >= 0) {
        startIndex = idx + 1;
      }
    }

    for (let i = startIndex; i < graphRoute.pathNodes.length - 1; i++) {
      const node = graphRoute.pathNodes[i];
      if (!node || node.type === 'building') continue;
      if (node.id === 'j_cu_inner_9') continue;
      const segD = CampusRouter.haversineDistance(prevLat, prevLng, node.lat, node.lng);
      accumDist += segD;
      prevLat = node.lat;
      prevLng = node.lng;

      if (node.isMajorJunction || accumDist >= 115) {
        const distToEnd = CampusRouter.haversineDistance(node.lat, node.lng, destCoord.lat, destCoord.lng);
        if (distToEnd > 22) {
          waypoints.push({ lat: node.lat, lng: node.lng });
          accumDist = 0;
        }
      }
    }

    waypoints.push({ lat: destCoord.lat, lng: destCoord.lng });
    return waypoints;
  }

  /**
   * OSRM GeoJSON 데이터 및 steps를 앱 표준 라우트 포맷으로 변환
   * - 장애물(강/호수/건물)을 가로지르는 직선 스냅(unshift/push) 완전 제거
   */
  _formatOSRMRoute(
    osrmRoute,
    startNodeId,
    endNodeId,
    startCoord,
    destNode,
    routePreference = 'shortest',
    destCoordMeta = null,
    prependCoords = null
  ) {
    if (!osrmRoute || !osrmRoute.geometry || !Array.isArray(osrmRoute.geometry.coordinates)) {
      return null;
    }
    const rawCoords = osrmRoute.geometry.coordinates; // [ [lng, lat], ... ]
    if (rawCoords.length < 2) return null;

    // Leaflet 형식: [ [lat, lng], ... ]
    let rawCoordinates = rawCoords.map(([lng, lat]) => [lat, lng]);

    // CU 쪽문 등 선행 도로 폴리라인이 있는 경우 결합
    if (Array.isArray(prependCoords) && prependCoords.length > 0) {
      rawCoordinates = [...prependCoords, ...rawCoordinates];
    }

    // 1. 출발점 도로 스냅 연결: 오직 장애물(물/건물)을 관통하지 않고 35m 이내인 경우에만 연결
    if (startCoord && rawCoordinates.length > 0) {
      const dStart = CampusRouter.haversineDistance(
        startCoord.lat,
        startCoord.lng,
        rawCoordinates[0][0],
        rawCoordinates[0][1]
      );
      if (dStart > 1.5 && dStart <= 35) {
        if (
          !CampusRouter.doesSegmentCrossObstacle(
            startCoord.lat,
            startCoord.lng,
            rawCoordinates[0][0],
            rawCoordinates[0][1],
            true
          )
        ) {
          rawCoordinates.unshift([startCoord.lat, startCoord.lng]);
        }
      } else if (dStart > 90) {
        // OSRM 시작점이 출발지에서 90m 이상 떨어진 엉뚱한 도로인 경우 기각
        return null;
      }
    }

    // 2. 도착점(건물 출입구) 스냅 연결: 오직 장애물(물/건물)을 관통하지 않고 30m 이내인 경우에만 연결
    if (destNode && rawCoordinates.length > 0) {
      const destLat = (destCoordMeta && destCoordMeta.lat) || destNode.entranceLat || destNode.lat;
      const destLng = (destCoordMeta && destCoordMeta.lng) || destNode.entranceLng || destNode.lng;
      const lastCoord = rawCoordinates[rawCoordinates.length - 1];
      const dEnd = CampusRouter.haversineDistance(lastCoord[0], lastCoord[1], destLat, destLng);
      if (dEnd > 1.5 && dEnd <= 30) {
        if (
          !CampusRouter.doesSegmentCrossObstacle(
            lastCoord[0],
            lastCoord[1],
            destLat,
            destLng,
            true
          )
        ) {
          rawCoordinates.push([destLat, destLng]);
        } else {
          return null;
        }
      } else if (dEnd > 30) {
        // OSRM 끝점이 건물 출입구까지 도달하지 못한 경우 기각 (직선 잇기 절대 금지)
        return null;
      }
    }

    const coordinates = CampusRouter.densifyCoordinates(rawCoordinates, 18);

    // 최종 폴리라인이 호수(연못)나 건물을 단 한 곳이라도 관통하면 즉시 기각
    if (CampusRouter.doesPolylineCrossObstacle(coordinates)) {
      return null;
    }

    let totalDistance = 0;
    const segments = [];
    for (let i = 0; i < coordinates.length - 1; i++) {
      const [lat1, lng1] = coordinates[i];
      const [lat2, lng2] = coordinates[i + 1];
      const segDist = CampusRouter.haversineDistance(lat1, lng1, lat2, lng2);
      const bearing = CampusRouter.calculateBearing(lat1, lng1, lat2, lng2);
      segments.push({
        index: i,
        from: coordinates[i],
        to: coordinates[i + 1],
        distance: segDist,
        startCumulativeDist: totalDistance,
        endCumulativeDist: totalDistance + segDist,
        bearing,
      });
      totalDistance += segDist;
    }

    totalDistance = Math.round(totalDistance || osrmRoute.distance);
    const estimatedMinutes = Math.max(1, Math.ceil(totalDistance / 68));
    const estimatedCalories = Math.max(4, Math.round(totalDistance * 0.045));

    let destinationEntranceId = (destCoordMeta && destCoordMeta.entranceId) || null;
    let destinationEntranceName = (destCoordMeta && destCoordMeta.entranceName) || null;
    let destinationEntranceFloor = (destCoordMeta && destCoordMeta.entranceFloor) || null;

    if (endNodeId === 'it_college' && !destinationEntranceId) {
      const penult =
        rawCoordinates.length >= 2
          ? { lat: rawCoordinates[rawCoordinates.length - 2][0], lng: rawCoordinates[rawCoordinates.length - 2][1] }
          : startCoord;
      const resolved = CampusRouter.resolveDestinationEntrance(
        startCoord,
        startNodeId,
        endNodeId,
        routePreference,
        null,
        penult
      );
      if (resolved) {
        destinationEntranceId = resolved.id;
        destinationEntranceName = resolved.name;
        destinationEntranceFloor = resolved.floor;
      }
    }

    const allSteps = [];
    if (Array.isArray(osrmRoute.legs)) {
      osrmRoute.legs.forEach((leg) => {
        if (Array.isArray(leg.steps)) {
          allSteps.push(...leg.steps);
        }
      });
    }

    const checkpoints = this._parseOSRMSteps(
      allSteps,
      coordinates,
      segments,
      totalDistance,
      startCoord,
      destNode,
      { destinationEntranceId, destinationEntranceName, destinationEntranceFloor }
    );

    const preferenceLabel =
      routePreference === 'mainRoad'
        ? '큰길 우선 (차도 중심)'
        : '최단거리 (보행로·지름길 포함)';

    return {
      startNodeId,
      endNodeId,
      startName: startCoord.name || '출발지',
      destinationName: destNode.name,
      destinationBuilding: destNode,
      destinationEntranceId,
      destinationEntranceName,
      destinationEntranceFloor,
      routePreference,
      preferenceLabel,
      pathNodeIds: [startNodeId, endNodeId],
      pathNodes: [
        { id: startNodeId, name: startCoord.name, lat: startCoord.lat, lng: startCoord.lng },
        { id: endNodeId, name: destNode.name, lat: destNode.lat, lng: destNode.lng },
      ],
      coordinates,
      segments,
      totalDistance,
      estimatedMinutes,
      estimatedCalories,
      checkpoints,
      isOSRM: true,
      profile: routePreference === 'mainRoad' ? 'car' : 'foot',
      rawOSRMRoute: osrmRoute,
    };
  }

  _parseOSRMSteps(
    steps,
    coordinates,
    segments,
    totalDistance,
    startCoord,
    destNode,
    entranceMeta = {}
  ) {
    const checkpoints = [];

    checkpoints.push({
      id: 'cp_start',
      type: 'start',
      icon: 'flag',
      title: `${startCoord.name || '출발지'}에서 출발`,
      instruction: `${destNode.name} 입구까지 실제 보행로 안내를 시작합니다.`,
      voiceText: `${destNode.name} 입구까지 안내를 시작합니다.`,
      lat: coordinates[0][0],
      lng: coordinates[0][1],
      cumulativeDist: 0,
      remainingDist: totalDistance,
      turnType: 'start',
    });

    if (steps && steps.length > 0) {
      let cumulative = 0;
      steps.forEach((step, idx) => {
        const stepDist = step.distance || 0;
        const maneuver = step.maneuver || {};
        const mType = maneuver.type;
        const mMod = maneuver.modifier;
        const loc = maneuver.location;
        const roadName = step.name && step.name.trim() ? step.name : '캠퍼스 보행로';

        if (mType === 'depart' || mType === 'arrive') {
          cumulative += stepDist;
          return;
        }

        let turnType = 'straight';
        let turnLabel = '직진';
        let icon = 'arrow-up';

        if (mMod === 'right' || mMod === 'sharp right') {
          turnType = 'right';
          turnLabel = '우회전';
          icon = 'corner-up-right';
        } else if (mMod === 'left' || mMod === 'sharp left') {
          turnType = 'left';
          turnLabel = '좌회전';
          icon = 'corner-up-left';
        } else if (mMod === 'slight right') {
          turnType = 'right';
          turnLabel = '우측 방향';
          icon = 'arrow-up-right';
        } else if (mMod === 'slight left') {
          turnType = 'left';
          turnLabel = '좌측 방향';
          icon = 'arrow-up-left';
        } else if (mType === 'fork') {
          turnType = mMod && mMod.includes('left') ? 'left' : 'right';
          turnLabel = mMod && mMod.includes('left') ? '좌측 갈림길' : '우측 갈림길';
          icon = 'git-branch';
        } else {
          cumulative += stepDist;
          return;
        }

        const pointLat = loc ? loc[1] : coordinates[Math.min(idx, coordinates.length - 1)][0];
        const pointLng = loc ? loc[0] : coordinates[Math.min(idx, coordinates.length - 1)][1];

        const voiceText =
          stepDist >= 25
            ? `${Math.round(stepDist)}미터 앞 ${roadName} 방면으로 ${turnLabel}하세요.`
            : `잠시 후 ${roadName}에서 ${turnLabel}하세요.`;

        checkpoints.push({
          id: `cp_osrm_${idx}`,
          type: 'turn',
          turnType,
          turnLabel,
          icon,
          title: `${roadName} (${turnLabel})`,
          instruction: `${Math.round(stepDist)}m 앞 ${turnLabel}`,
          voiceText,
          lat: pointLat,
          lng: pointLng,
          cumulativeDist: Math.round(cumulative),
          remainingDist: Math.max(0, Math.round(totalDistance - cumulative)),
        });

        cumulative += stepDist;
      });
    }

    const lastCoord = coordinates[coordinates.length - 1];
    let arriveTitle = `${destNode.name} 입구 도착`;
    let arriveInstruction = '목적지 건물 입구에 도착했습니다. 건물 내부 안내로 전환할 수 있습니다.';
    let arriveVoice = '목적지 건물 입구에 도착했습니다. 건물 내부 안내로 전환할 수 있습니다.';

    if (entranceMeta && entranceMeta.destinationEntranceName) {
      arriveTitle = `${destNode.name} ${entranceMeta.destinationEntranceName} (${entranceMeta.destinationEntranceFloor}) 도착`;
      arriveInstruction = `목적지 IT대학 ${entranceMeta.destinationEntranceName}(${entranceMeta.destinationEntranceFloor} 진입)에 도착했습니다. 건물 내부 안내로 전환할 수 있습니다.`;
      arriveVoice = `목적지 IT대학 ${entranceMeta.destinationEntranceName}에 도착했습니다. 건물 내부 안내로 전환할 수 있습니다.`;
    }

    checkpoints.push({
      id: 'cp_arrive',
      type: 'arrive',
      turnType: 'arrive',
      turnLabel: '도착',
      icon: 'map-pin',
      title: arriveTitle,
      instruction: arriveInstruction,
      voiceText: arriveVoice,
      lat: lastCoord[0],
      lng: lastCoord[1],
      cumulativeDist: totalDistance,
      remainingDist: 0,
      destinationEntranceId: entranceMeta.destinationEntranceId || null,
      destinationEntranceFloor: entranceMeta.destinationEntranceFloor || null,
    });

    return checkpoints;
  }

  /**
   * [요구사항 1~4 통합] 실시간 보행자 라우팅 API(routed-foot) + 교내 정밀 도로망 하이브리드 탐색
   * @param {string} startNodeId
   * @param {string} endNodeId
   * @param {Object|null} customStartCoord
   * @param {string} routePreference - 'shortest' (보행로 최단거리) | 'mainRoad' (큰길 우선)
   */
  async findHybridPath(startNodeId, endNodeId, customStartCoord = null, routePreference = 'shortest') {
    const startNode = this.nodes[startNodeId];
    const destNode = this.nodes[endNodeId];

    if (!destNode) return null;

    let rawStartCoord = null;
    if (customStartCoord && Number.isFinite(customStartCoord.lat) && Number.isFinite(customStartCoord.lng)) {
      rawStartCoord = {
        lat: customStartCoord.lat,
        lng: customStartCoord.lng,
        name: customStartCoord.name || '내 위치 (실시간 GPS)',
      };
    } else if (startNode) {
      rawStartCoord = {
        lat: startNode.entranceLat || startNode.lat,
        lng: startNode.entranceLng || startNode.lng,
        name: startNode.name,
      };
    } else {
      return null;
    }

    // 1. 출발 좌표 도로 스냅 (수선의 발): 캠퍼스 내부(도로에서 65m 이내)인 경우 가장 가까운 장애물 없는 도로 선분으로 스냅
    const snapResult = this.findNearestEdgeProjection(rawStartCoord.lat, rawStartCoord.lng);
    const isExternalOrigin = !snapResult.projection || snapResult.distance > 75;

    let snappedStartCoord = { ...rawStartCoord };
    if (!isExternalOrigin && snapResult.projection && snapResult.unobstructed) {
      snappedStartCoord = {
        lat: snapResult.projection.lat,
        lng: snapResult.projection.lng,
        name: rawStartCoord.name,
      };
    }

    // 2. 교내 정밀 OSM 도로망 다익스트라 경로 계산 (출입구 동적 매칭 & 교내 큰길 경유지 산출 & 오프라인 폴백용)
    const graphRoute = this.findShortestPath(
      startNodeId,
      endNodeId,
      customStartCoord,
      routePreference
    );

    // 3. 목적지 건물 최적 출입구 결정 (IT대학: 1F 남동측 / 2F 남측 큰길 / 3F 서측 언덕)
    let targetEntrance = null;
    let destLat = destNode.entranceLat || destNode.lat;
    let destLng = destNode.entranceLng || destNode.lng;

    if (endNodeId === 'it_college') {
      const approachNodeId =
        graphRoute && graphRoute.pathNodeIds && graphRoute.pathNodeIds.length >= 2
          ? graphRoute.pathNodeIds[graphRoute.pathNodeIds.length - 2]
          : null;
      const approachNodeObj =
        graphRoute && graphRoute.pathNodes && graphRoute.pathNodes.length >= 2
          ? graphRoute.pathNodes[graphRoute.pathNodes.length - 2]
          : null;
      targetEntrance = CampusRouter.resolveDestinationEntrance(
        rawStartCoord,
        startNodeId,
        endNodeId,
        routePreference,
        approachNodeId,
        approachNodeObj
      );
      if (targetEntrance) {
        destLat = targetEntrance.lat;
        destLng = targetEntrance.lng;
      }
    }

    const destCoord = {
      lat: destLat,
      lng: destLng,
      name: targetEntrance ? `${destNode.name} ${targetEntrance.name}` : destNode.name,
      entranceId: targetEntrance ? targetEntrance.id : null,
      entranceName: targetEntrance ? targetEntrance.name : null,
      entranceFloor: targetEntrance ? targetEntrance.floor : null,
    };

    // CU 쪽문 출발 시: 공개 OSM에 누락된 CU 쪽문 골목(west_gate_cu -> j_dorm_east)을 선행 연결하고 j_dorm_east부터 OSRM 호출
    const isCuGateStart =
      startNodeId === 'west_gate_cu' ||
      (CampusRouter.haversineDistance(rawStartCoord.lat, rawStartCoord.lng, 37.21205, 126.97035) <= 35);

    let osrmOriginCoord = snappedStartCoord;
    let cuPrependCoords = null;
    if (isCuGateStart && this.nodes.j_dorm_east) {
      const cuSubRoute = this.findShortestPath(
        'west_gate_cu',
        'j_dorm_east',
        customStartCoord,
        'shortest'
      );
      if (cuSubRoute && Array.isArray(cuSubRoute.coordinates) && cuSubRoute.coordinates.length >= 2) {
        cuPrependCoords = cuSubRoute.coordinates.slice(0, -1);
        osrmOriginCoord = {
          lat: this.nodes.j_dorm_east.lat,
          lng: this.nodes.j_dorm_east.lng,
          name: rawStartCoord.name,
        };
      }
    }

    // 4. [실시간 보행자 길찾기 API (routed-foot / alternatives=true) 호출]
    try {
      if (routePreference === 'shortest') {
        // (A) 최단거리 (보행로): 2점 직통 routed-foot (alternatives=true) 먼저 조회
        const directRoutes = await CampusRouter.fetchOSRMRoutes(
          [osrmOriginCoord, destCoord],
          'foot',
          4000
        );

        const sortedDirect = [...directRoutes].sort(
          (a, b) => (a.distance || Infinity) - (b.distance || Infinity)
        );

        for (const candidate of sortedDirect) {
          const formatted = this._formatOSRMRoute(
            candidate,
            startNodeId || '__custom_origin__',
            endNodeId,
            rawStartCoord,
            destNode,
            'shortest',
            destCoord,
            cuPrependCoords
          );
          if (
            formatted &&
            !CampusRouter.isOutsideCampusOrInvalidShortcut(formatted.coordinates, isExternalOrigin) &&
            !this.doesPolylineTouchBlockedEdge(formatted.coordinates)
          ) {
            // 캠퍼스 내부 출발인데 OSRM이 학교 밖으로 크게 우회한 경우(교내 그래프보다 35% 이상 긴 경우) 경유지 유도로 전환
            if (
              !isExternalOrigin &&
              graphRoute &&
              formatted.totalDistance > graphRoute.totalDistance * 1.35 + 60
            ) {
              continue;
            }
            return formatted;
          }
        }

        // (B) 2점 직통 OSRM이 대운동장 트랙을 가로질렀거나 외곽 우회한 경우: 교내 도로 경유지를 주입해 routed-foot 재호출
        if (graphRoute) {
          const guideWaypoints = CampusRouter.extractGuideWaypointsFromGraphRoute(
            graphRoute,
            osrmOriginCoord,
            destCoord,
            isCuGateStart ? 'j_dorm_east' : null
          );
          if (guideWaypoints.length >= 3) {
            const guidedRoutes = await CampusRouter.fetchOSRMRoutes(guideWaypoints, 'foot', 4000);
            for (const candidate of guidedRoutes) {
              const formatted = this._formatOSRMRoute(
                candidate,
                startNodeId || '__custom_origin__',
                endNodeId,
                rawStartCoord,
                destNode,
                'shortest',
                destCoord,
                cuPrependCoords
              );
              if (
                formatted &&
                !CampusRouter.doesPolylineCrossObstacle(formatted.coordinates) &&
                !this.doesPolylineTouchBlockedEdge(formatted.coordinates)
              ) {
                return formatted;
              }
            }
          }
        }
      } else {
        // [큰길 우선 (mainRoad)] 모드:
        // 목적지가 캠퍼스 내부일 때 학교 밖 외곽 도로로 우회하지 않고 교내 메인 아스팔트 순환차도를 우선 타도록
        // 교내 메인 차도 그래프 경유지(또는 외부 출발 시 routed-car / alternatives 결합)로 routed-foot 호출!
        if (isExternalOrigin) {
          const [carRoutes, footRoutes] = await Promise.all([
            CampusRouter.fetchOSRMRoutes([osrmOriginCoord, destCoord], 'car', 4000),
            CampusRouter.fetchOSRMRoutes([osrmOriginCoord, destCoord], 'foot', 4000),
          ]);
          const combined = [...carRoutes, ...footRoutes.slice().reverse()];
          for (const candidate of combined) {
            const formatted = this._formatOSRMRoute(
              candidate,
              startNodeId || '__custom_origin__',
              endNodeId,
              rawStartCoord,
              destNode,
              'mainRoad',
              destCoord
            );
            if (formatted && !CampusRouter.doesPolylineCrossObstacle(formatted.coordinates)) {
              return formatted;
            }
          }
        } else if (graphRoute) {
          const mainRoadWaypoints = CampusRouter.extractGuideWaypointsFromGraphRoute(
            graphRoute,
            osrmOriginCoord,
            destCoord,
            isCuGateStart ? 'j_dorm_east' : null
          );
          const guidedMainRoutes = await CampusRouter.fetchOSRMRoutes(
            mainRoadWaypoints,
            'foot',
            4000
          );
          for (const candidate of guidedMainRoutes) {
            const formatted = this._formatOSRMRoute(
              candidate,
              startNodeId || '__custom_origin__',
              endNodeId,
              rawStartCoord,
              destNode,
              'mainRoad',
              destCoord,
              cuPrependCoords
            );
            if (
              formatted &&
              !CampusRouter.doesPolylineCrossObstacle(formatted.coordinates) &&
              !this.doesPolylineTouchBlockedEdge(formatted.coordinates)
            ) {
              return formatted;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[CampusRouter] OSRM hybrid routing fallback to precision campus graph:', e);
    }

    // 5. 오프라인 또는 API 응답 지연 시: OSM과 100% 일치하는 교내 정밀 도로망 다익스트라 경로 반환
    return (
      graphRoute ||
      this.findShortestPath(startNodeId, endNodeId, customStartCoord, routePreference, destCoord)
    );
  }

  /**
   * [🛣️ 큰길 우선 (차도 중심)]과 [🚶 최단거리 (보행로·지름길 포함)]를 비동기 OSRM 및 정밀 도로 그래프로 동시 계산
   */
  async findHybridDualPaths(startNodeId, endNodeId, customStartCoord = null) {
    const [shortestRoute, mainRoadRoute] = await Promise.all([
      this.findHybridPath(startNodeId, endNodeId, customStartCoord, 'shortest'),
      this.findHybridPath(startNodeId, endNodeId, customStartCoord, 'mainRoad'),
    ]);

    const finalShortest =
      shortestRoute || this.findShortestPath(startNodeId, endNodeId, customStartCoord, 'shortest');
    const finalMainRoad =
      mainRoadRoute || this.findShortestPath(startNodeId, endNodeId, customStartCoord, 'mainRoad');

    if (finalShortest) {
      finalShortest.routePreference = 'shortest';
      finalShortest.preferenceLabel = '최단거리 (보행로·지름길 포함)';
    }
    if (finalMainRoad) {
      finalMainRoad.routePreference = 'mainRoad';
      finalMainRoad.preferenceLabel = '큰길 우선 (차도 중심)';
    }

    return {
      shortest: finalShortest,
      mainRoad: finalMainRoad,
    };
  }
}

window.CampusRouter = CampusRouter;
