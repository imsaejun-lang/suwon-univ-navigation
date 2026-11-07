/**
 * 수원대학교 전용 스마트 캠퍼스 내비게이션 (USW Smart Map)
 * UI 예시(01 앱을 켰을 때 / 02 건물을 선택했을 때) + 구글·네이버 지도 스타일 길찾기 & 도면 뷰어 통합 컨트롤러
 */

(function () {
  'use strict';

  // 전역 상태 관리
  const state = {
    map: null,
    tileLayers: {},
    currentMapMode: 'street', // 'street' | 'satellite'
    activeCategory: 'building', // 'building' | 'food' | 'amenity'
    activeSheetView: 'explore', // 'explore' | 'building' | 'route' | 'saved'
    activeBottomTab: 'map', // 'map' | 'route' | 'saved'
    startNodeId: 'main_gate', // 기본 출발지: 정문
    customGpsCoord: null,
    isPickOriginMode: false, // 시뮬레이션용 지도 클릭 출발지 지정 모드
    lastTrimSegIdx: 0, // 지나온 경로 삭제 시 역방향 점프 방지 인덱스
    selectedDestId: null, // 현재 선택된 건물 ID
    currentRoute: null, // Dijkstra 최단 경로 결과
    isNavigating: false,
    savedBuildingIds: new Set(['future_innovation', 'it_college', 'central_library']),
    buildingMarkers: {},
    userMarker: null,
    accuracyCircle: null,
    gpsFollowMode: false,
    triggeredGpsCheckpoints: new Set(),
    // 초기 내 위치: UI 예시 화면처럼 캠퍼스 중심(대운동장 서측/중앙광장 부근)에 표시
    userPosition: {
      lat: 37.21045,
      lng: 126.97735,
      bearing: 0,
    },
    layers: {
      bgLabelGroup: null,
      graphGroup: null,
      routeGroup: null,
      arrowGroup: null,
      checkpointGroup: null,
    },
    activeRoutePolylines: {
      mainLine: null,
      casingLine: null,
      altLine: null,
      arrowMarkers: [], // [{ marker, lat, lng, cumulativeDist }]
    },
    lastSpokenText: '',
    focusedAutocompleteIndex: -1,
    pendingIndoorRoomId: 'room_203',
    pendingIndoorEntranceId: null,
    currentOutdoorEntranceId: null, // 야외 최단 경로가 실제로 도달한 IT대학 출입구 ID (야외-실내 100% 동기화)
    activeRoutePreference: 'shortest', // 'shortest' (최단거리 - 보행로·지름길 포함) | 'mainRoad' (큰길 우선 - 차도 중심)
    dualRoutes: {
      mainRoad: null,
      shortest: null,
    },
    // 네이버 지도식 하단 고정 바텀 시트 1~3단계 스냅 상태
    sheetSnapStage: 2, // 1 (최소화 한 줄) | 2 (기본 중간 높이) | 3 (전체 화면 상세)
    sheetSwipeState: {
      isSwiping: false,
      startY: 0,
      currentY: 0,
      startTime: 0,
    },
    // 지도 360도 회전 및 나침반 모드 상태
    mapBearing: 0, // 0 ~ 360 deg
    compassMode: 'north-up', // 'north-up' (북쪽 고정) | 'heading-up' (내 진행 방향 자동 회전)
    mapTouchRotateState: null,
    mapMouseRotateState: null,
    // 검색 하이라이트 건물 집합
    highlightedBuildingIds: new Set(),
    // 경로 이탈 자동 재탐색 쿨다운 타임스탬프
    lastRerouteTimestamp: 0,
    // 실내 층·호실 출발 모달 상태
    floorSelectState: {
      buildingId: 'it_college',
      selectedFloor: '3F',
      matchedRoomId: 'room_308',
      matchedRoomNumber: '308호',
    },
  };

  let router = null;
  let tts = null;
  let simulator = null;
  let gpsTracker = null;
  let indoorNav = null;

  const dom = {};

  function cacheDom() {
    dom.uswBrandBtn = document.getElementById('uswBrandBtn');
    dom.searchInput = document.getElementById('searchInput');
    dom.clearSearchBtn = document.getElementById('clearSearchBtn');
    dom.searchSubmitBtn = document.getElementById('searchSubmitBtn');
    dom.autocompleteDropdown = document.getElementById('autocompleteDropdown');
    dom.dropdownHeaderTitle = document.getElementById('dropdownHeaderTitle');
    dom.autocompleteList = document.getElementById('autocompleteList');

    // 나침반 및 지도 회전 컨트롤
    dom.resetCampusViewBtn = document.getElementById('resetCampusViewBtn');
    dom.compassNeedleWrap = document.getElementById('compassNeedleWrap');
    dom.compassModeLabel = document.getElementById('compassModeLabel');
    dom.rotateMapLeftBtn = document.getElementById('rotateMapLeftBtn');
    dom.rotateMapRightBtn = document.getElementById('rotateMapRightBtn');

    dom.mapLayerToggleBtn = document.getElementById('mapLayerToggleBtn');
    dom.mapLayerLabel = document.getElementById('mapLayerLabel');
    dom.myLocationBtn = document.getElementById('myLocationBtn');
    dom.ttsToggleBtn = document.getElementById('ttsToggleBtn');
    dom.ttsToggleIconWrap = document.getElementById('ttsToggleIconWrap');
    dom.ttsStatusBadge = document.getElementById('ttsStatusBadge');
    dom.floatingSimBtn = document.getElementById('floatingSimBtn');
    dom.floatingSimIconWrap = document.getElementById('floatingSimIconWrap');
    dom.floatingSimLabel = document.getElementById('floatingSimLabel');
    dom.floatingPickOriginBtn = document.getElementById('floatingPickOriginBtn');
    dom.floatingPickOriginLabel = document.getElementById('floatingPickOriginLabel');

    dom.bottomSheet = document.getElementById('bottomSheet');
    dom.sheetHandleArea = document.getElementById('sheetHandleArea');

    // Sheet Views (01 Explore, 02 Building Detail, 03 Route, 04 Saved)
    dom.sheetViewExplore = document.getElementById('sheetViewExplore');
    dom.exploreTitle = document.getElementById('exploreTitle');
    dom.exploreSubtitle = document.getElementById('exploreSubtitle');
    dom.explorePreviewList = document.getElementById('explorePreviewList');
    dom.quickBuildingChips = document.getElementById('quickBuildingChips');

    dom.sheetViewBuilding = document.getElementById('sheetViewBuilding');
    dom.detailBuildingName = document.getElementById('detailBuildingName');
    dom.bookmarkBuildingBtn = document.getElementById('bookmarkBuildingBtn');
    dom.detailBuildingSub = document.getElementById('detailBuildingSub');
    dom.closeDetailSheetBtn = document.getElementById('closeDetailSheetBtn');
    dom.detailBuildingImg = document.getElementById('detailBuildingImg');
    dom.detailFloorBadge = document.getElementById('detailFloorBadge');
    dom.detailBuildingCopy = document.getElementById('detailBuildingCopy');
    dom.openFloorPlanBtn = document.getElementById('openFloorPlanBtn');
    dom.goRouteViewBtn = document.getElementById('goRouteViewBtn');

    dom.sheetViewRoute = document.getElementById('sheetViewRoute');
    dom.closeSheetBtn = document.getElementById('closeSheetBtn');
    dom.sheetRouteTag = document.getElementById('sheetRouteTag');
    dom.sheetCategoryTag = document.getElementById('sheetCategoryTag');
    dom.sheetBuildingName = document.getElementById('sheetBuildingName');
    dom.startNodeSelect = document.getElementById('startNodeSelect');
    dom.testOriginChipsBar = document.getElementById('testOriginChipsBar');
    dom.pickOriginOnMapBtn = document.getElementById('pickOriginOnMapBtn');
    dom.openFloorSelectModalBtn = document.getElementById('openFloorSelectModalBtn');
    dom.sheetEndName = document.getElementById('sheetEndName');
    dom.sheetEstTime = document.getElementById('sheetEstTime');
    dom.sheetTotalDist = document.getElementById('sheetTotalDist');
    dom.sheetCheckpointCount = document.getElementById('sheetCheckpointCount');

    // 경로 옵션 선택 탭 (큰길 우선 vs 최단 거리)
    dom.routeOptionTabs = document.getElementById('routeOptionTabs');
    dom.tabMainRoadRoute = document.getElementById('tabMainRoadRoute');
    dom.tabShortestRoute = document.getElementById('tabShortestRoute');
    dom.tabMainRoadMetrics = document.getElementById('tabMainRoadMetrics');
    dom.tabShortestMetrics = document.getElementById('tabShortestMetrics');

    // 1단계(최소화 한 줄 모드) 네이버 지도식 미니 바
    dom.sheetMiniBar = document.getElementById('sheetMiniBar');
    dom.miniBarTitle = document.getElementById('miniBarTitle');
    dom.miniBarMetrics = document.getElementById('miniBarMetrics');
    dom.miniBarTime = document.getElementById('miniBarTime');
    dom.miniBarDist = document.getElementById('miniBarDist');
    dom.miniBarEta = document.getElementById('miniBarEta');
    dom.miniStopNavBtn = document.getElementById('miniStopNavBtn');
    dom.miniStartNavBtn = document.getElementById('miniStartNavBtn');
    dom.miniStartNavBtnText = document.getElementById('miniStartNavBtnText');
    dom.miniOpenIndoorBtn = document.getElementById('miniOpenIndoorBtn');
    dom.snap1ProgressTrack = document.getElementById('snap1ProgressTrack');
    dom.snap1ProgressFill = document.getElementById('snap1ProgressFill');
    dom.snap1ProgressHead = document.getElementById('snap1ProgressHead');
    dom.miniExpandBtn = document.getElementById('miniExpandBtn');

    // 3단계(전체 화면 상세 경로) 도착지 건물 공식 사진 카드
    dom.routeDestBuildingCard = document.getElementById('routeDestBuildingCard');
    dom.rdbcBuildingName = document.getElementById('rdbcBuildingName');
    dom.rdbcBuildingSub = document.getElementById('rdbcBuildingSub');
    dom.rdbcBuildingImg = document.getElementById('rdbcBuildingImg');
    dom.rdbcEntranceCaption = document.getElementById('rdbcEntranceCaption');

    // 실내 층수 선택 ➔ 호실 자동 매칭 모달
    dom.floorSelectModal = document.getElementById('floorSelectModal');
    dom.floorSelectModalTitle = document.getElementById('floorSelectModalTitle');
    dom.closeFloorSelectModalBtn = document.getElementById('closeFloorSelectModalBtn');
    dom.autoMatchedBuildingBanner = document.getElementById('autoMatchedBuildingBanner');
    dom.autoMatchedBuildingName = document.getElementById('autoMatchedBuildingName');
    dom.floorSelectBuildingRow = document.getElementById('floorSelectBuildingRow');
    dom.floorSelectBuildingDropdown = document.getElementById('floorSelectBuildingDropdown');
    dom.floorSelectButtonsGrid = document.getElementById('floorSelectButtonsGrid');
    dom.floorSelectRoomMatchBox = document.getElementById('floorSelectRoomMatchBox');
    dom.floorSelectAutoRoomText = document.getElementById('floorSelectAutoRoomText');
    dom.floorSelectRoomDropdown = document.getElementById('floorSelectRoomDropdown');
    dom.floorSelectIntegratedPreview = document.getElementById('floorSelectIntegratedPreview');
    dom.cancelFloorSelectBtn = document.getElementById('cancelFloorSelectBtn');
    dom.confirmFloorSelectStartBtn = document.getElementById('confirmFloorSelectStartBtn');

    dom.simProgressPanel = document.getElementById('simProgressPanel');
    dom.simStatusText = document.getElementById('simStatusText');
    dom.simProgressBar = document.getElementById('simProgressBar');
    dom.simTraveledDist = document.getElementById('simTraveledDist');
    dom.simRemainingDist = document.getElementById('simRemainingDist');
    dom.simProgressPercent = document.getElementById('simProgressPercent');
    dom.simCancelBtn = document.getElementById('simCancelBtn');

    dom.indoorTransitionBanner = document.getElementById('indoorTransitionBanner');
    dom.indoorBannerSub = document.getElementById('indoorBannerSub');
    dom.openIndoorGuideBtn = document.getElementById('openIndoorGuideBtn');

    dom.startNavBtn = document.getElementById('startNavBtn');
    dom.startNavBtnText = document.getElementById('startNavBtnText');
    dom.sheetSimBtn = document.getElementById('sheetSimBtn');
    dom.sheetSimBtnText = document.getElementById('sheetSimBtnText');
    dom.stopNavBtn = document.getElementById('stopNavBtn');
    dom.sheetFacilitiesList = document.getElementById('sheetFacilitiesList');
    dom.checkpointTimeline = document.getElementById('checkpointTimeline');

    dom.sheetViewSaved = document.getElementById('sheetViewSaved');
    dom.savedBuildingsList = document.getElementById('savedBuildingsList');

    // Bottom Tab Bar
    dom.tabBtnMap = document.getElementById('tabBtnMap');
    dom.tabBtnRoute = document.getElementById('tabBtnRoute');
    dom.tabBtnSaved = document.getElementById('tabBtnSaved');

    // Indoor Floor Plan Modal
    dom.indoorModal = document.getElementById('indoorModal');
    dom.indoorModalTitle = document.getElementById('indoorModalTitle');
    dom.closeIndoorModalBtn = document.getElementById('closeIndoorModalBtn');
    dom.floorSelectorBar = document.getElementById('floorSelectorBar');
    dom.floorSummaryText = document.getElementById('floorSummaryText');
    dom.floorplanPdfFrame = document.getElementById('floorplanPdfFrame');
    dom.floorplanFallbackBox = document.getElementById('floorplanFallbackBox');
    dom.modalBuildingName = document.getElementById('modalBuildingName');
    dom.modalBuildingFloors = document.getElementById('modalBuildingFloors');
    dom.modalBuildingPreview = document.getElementById('modalBuildingPreview');
    dom.openPdfNewTabLink = document.getElementById('openPdfNewTabLink');
    dom.confirmIndoorModalBtn = document.getElementById('confirmIndoorModalBtn');

    // [Step 4 PWA & 버전 관리 UI 요소]
    dom.appVersionBar = document.getElementById('appVersionBar');
    dom.appVersionTag = document.getElementById('appVersionTag');
    dom.manualUpdateBtn = document.getElementById('manualUpdateBtn');
    dom.pwaUpdateBanner = document.getElementById('pwaUpdateBanner');
    dom.pwaUpdateBannerMsg = document.getElementById('pwaUpdateBannerMsg');
    dom.applyUpdateBtn = document.getElementById('applyUpdateBtn');
    dom.dismissUpdateBtn = document.getElementById('dismissUpdateBtn');
    dom.pwaInstallBanner = document.getElementById('pwaInstallBanner');
    dom.pwaInstallBtn = document.getElementById('pwaInstallBtn');
    dom.pwaDismissBannerBtn = document.getElementById('pwaDismissBannerBtn');
    dom.iosInstallModal = document.getElementById('iosInstallModal');
    dom.closeIosInstallModalBtn = document.getElementById('closeIosInstallModalBtn');
    dom.confirmIosInstallBtn = document.getElementById('confirmIosInstallBtn');

    // [야외 출입구 추천 가이드 박스]
    dom.sheetEntranceGuideBox = document.getElementById('sheetEntranceGuideBox');
    dom.guideEntranceBadge = document.getElementById('guideEntranceBadge');
    dom.guideEntranceTitle = document.getElementById('guideEntranceTitle');
    dom.guideEntranceDesc = document.getElementById('guideEntranceDesc');
    dom.guideEntranceFloorTag = document.getElementById('guideEntranceFloorTag');
    dom.guideTargetRoomTag = document.getElementById('guideTargetRoomTag');

    dom.toastContainer = document.getElementById('toastContainer');
  }

  /**
   * Lucide 아이콘 동적 교체 헬퍼
   */
  function setLucideIcon(wrapperEl, iconName) {
    if (!wrapperEl) return;
    wrapperEl.innerHTML = `<i data-lucide="${iconName}"></i>`;
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  /**
   * 1. 지도 및 레이어 초기화 (Zoom 13 ~ 22 대폭 확장 & Zoom 비례 건물명 표시 연동)
   */
  function initMap() {
    state.map = L.map('map', {
      center: SUWON_CAMPUS_CONFIG.center,
      zoom: SUWON_CAMPUS_CONFIG.defaultZoom,
      minZoom: SUWON_CAMPUS_CONFIG.minZoom, // 13
      maxZoom: SUWON_CAMPUS_CONFIG.maxZoom, // 22
      maxBounds: SUWON_CAMPUS_CONFIG.maxBounds,
      maxBoundsViscosity: 0.85,
      zoomControl: false,
    });

    // API Key 없이 로컬(file://) 및 모바일 웹뷰에서 100% 작동하는 구글 한국어 지도 타일 & 위성 타일 적용
    // maxNativeZoom: 20, maxZoom: 22 설정으로 건물 세밀 구조까지 초고배율 확대 지원
    state.tileLayers.streetWithLabels = L.tileLayer(
      'https://{s}.google.com/vt/lyrs=m&hl=ko&x={x}&y={y}&z={z}',
      {
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        maxNativeZoom: 20,
        maxZoom: 22,
      }
    );

    state.tileLayers.satellite = L.tileLayer(
      'https://{s}.google.com/vt/lyrs=y&hl=ko&x={x}&y={y}&z={z}',
      {
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        maxNativeZoom: 20,
        maxZoom: 22,
      }
    );

    state.tileLayers.streetWithLabels.addTo(state.map);

    // 레이어 그룹 초기화
    state.layers.vectorFootprintGroup = L.layerGroup().addTo(state.map);
    state.layers.bgLabelGroup = L.layerGroup().addTo(state.map);
    state.layers.graphGroup = L.layerGroup().addTo(state.map);
    state.layers.routeGroup = L.layerGroup().addTo(state.map);
    state.layers.arrowGroup = L.layerGroup().addTo(state.map);
    state.layers.checkpointGroup = L.layerGroup().addTo(state.map);

    renderVectorCampusFootprints();
    renderBackgroundCampusLabels();
    renderBuildingMarkers();
    updateZoomBasedLabelVisibility();

    createOrUpdateUserMarker(
      state.userPosition.lat,
      state.userPosition.lng,
      state.userPosition.bearing
    );

    // [요구사항 6 핵심] 시뮬레이션용 지도 클릭 출발지 직접 지정 인터랙션
    state.map.on('click', async (e) => {
      hideAutocomplete();
      if (!state.isPickOriginMode) return;

      const clickedLat = e.latlng.lat;
      const clickedLng = e.latlng.lng;
      toggleMapPickOriginMode(false);

      state.customGpsCoord = {
        lat: clickedLat,
        lng: clickedLng,
        name: '지도 클릭 출발지',
      };
      state.pendingIndoorEntranceId = null;
      state.currentOutdoorEntranceId = null;

      createOrUpdateUserMarker(clickedLat, clickedLng, 180);
      updateTestOriginChipsActiveState();

      const destId = state.selectedDestId || 'it_college';
      await startRouteFindingToBuilding(destId, {
        skipFitBounds: false,
        snapStage: state.sheetSnapStage || 2,
      });

      showToast('📍 클릭한 지도 위치를 출발지로 지정하여 바로 경로를 계산했습니다!');
    });

    state.map.on('dragstart', () => {
      state.gpsFollowMode = false;
    });

    // 확대/축소(Zoom Level)에 따른 건물명 표시 자동 제어
    state.map.on('zoomend', () => {
      updateZoomBasedLabelVisibility();
    });
  }

  /**
   * [요구사항 2 핵심] 확대/축소(Zoom) 비례 건물명 표시 제어
   * - Zoom < 16 (축소 시): 건물 이름들이 다닥다닥 붙어 길을 막지 않도록 일반 건물명을 숨기고 주요 랜드마크(본관, 중앙도서관)만 아주 작게 표시
   * - Zoom >= 16 (일정 수준 이상 확대 시): 각 건물 영역 안에 시야를 가리지 않는 작고 얇은 외곽선 텍스트로 건물 이름 표시
   */
  function updateZoomBasedLabelVisibility() {
    if (!state.map) return;
    const zoom = state.map.getZoom();
    const mapEl = state.map.getContainer();
    if (!mapEl) return;

    mapEl.classList.toggle('map-zoom-low', zoom < 16);
    mapEl.classList.toggle('map-zoom-high', zoom >= 16);
    mapEl.classList.toggle('map-zoom-detail', zoom >= 17);
  }

  /**
   * 캠퍼스 건물 폴리곤(연한 블루그레이 블록) 및 녹지 벡터 렌더링
   */
  function renderVectorCampusFootprints() {
    if (!state.layers.vectorFootprintGroup || !window.SUWON_VECTOR_MAP) return;
    state.layers.vectorFootprintGroup.clearLayers();

    const vec = window.SUWON_VECTOR_MAP;

    // 1) 대운동장 및 녹지 영역
    (vec.lands || []).forEach((land) => {
      if (!land.coords || land.coords.length < 3) return;
      L.polygon(land.coords, {
        color: '#c5d6be',
        weight: 1,
        fillColor: '#dce6d5',
        fillOpacity: 0.45,
        interactive: false,
      }).addTo(state.layers.vectorFootprintGroup);
    });

    // 2) 수원대 캠퍼스 내 83개 실제 건물 폴리곤
    (vec.buildings || []).forEach((b) => {
      if (!b.coords || b.coords.length < 3) return;
      L.polygon(b.coords, {
        color: '#b0c0d2',
        weight: 1.2,
        fillColor: '#cdd8e5',
        fillOpacity: 0.72,
        interactive: false,
      }).addTo(state.layers.vectorFootprintGroup);
    });
  }

  /**
   * 배경 서브 건물명 라벨(교양학관, 음악대학, 대운동장, 제2공학관 등) 표시
   */
  function renderBackgroundCampusLabels() {
    state.layers.bgLabelGroup.clearLayers();
    if (!window.CAMPUS_BACKGROUND_LABELS) return;

    CAMPUS_BACKGROUND_LABELS.forEach((item) => {
      const icon = L.divIcon({
        className: 'custom-bg-label-icon',
        html: `<div class="campus-bg-label">${item.name}</div>`,
        iconSize: [0, 0],
      });
      L.marker([item.lat, item.lng], {
        icon,
        interactive: false,
        zIndexOffset: 50,
      }).addTo(state.layers.bgLabelGroup);
    });
  }

  /**
   * [요구사항 6] 시뮬레이션용 지도에서 출발지 직접 클릭 모드 토글
   */
  function toggleMapPickOriginMode(forceState) {
    const nextState =
      typeof forceState === 'boolean' ? forceState : !state.isPickOriginMode;
    state.isPickOriginMode = nextState;

    if (dom.floatingPickOriginBtn) {
      dom.floatingPickOriginBtn.classList.toggle('active', nextState);
    }
    if (dom.pickOriginOnMapBtn) {
      dom.pickOriginOnMapBtn.classList.toggle('active', nextState);
    }
    if (dom.floatingPickOriginLabel) {
      dom.floatingPickOriginLabel.textContent = nextState ? '지도 클릭 대기' : '출발지 클릭';
    }

    const mapEl = state.map && state.map.getContainer();
    if (mapEl) {
      mapEl.classList.toggle('pick-origin-cursor', nextState);
    }

    if (nextState) {
      // 지도가 넓게 보이도록 바텀시트가 전체화면(3단계)이면 2단계로 내림
      if (state.sheetSnapStage === 3) {
        setSheetSnapStage(2);
      }
      showToast('🖱️ 지도의 원하는 도로·위치를 클릭하면 그 지점이 바로 출발지로 설정됩니다.');
    }
  }

  /**
   * [요구사항 5] 길안내 중간 취소(안내 종료) 통합 함수
   * - 실제 주행 및 시뮬레이션 도중 언제든 안내를 그만둘 수 있도록 모든 경로선·음성(TTS)·시뮬레이션 타이머·GPS 추적을 즉시 중단하고 초기 지도 화면으로 깔끔하게 복귀
   */
  function cancelAllNavigation(options = {}) {
    if (simulator && simulator.state !== 'idle') {
      simulator.stop();
    }
    if (tts) {
      tts.stop();
    }
    if (indoorNav && indoorNav.isOpen) {
      indoorNav.close();
    }

    state.isNavigating = false;
    state.gpsFollowMode = false;
    state.isPickOriginMode = false;
    state.customGpsCoord = null;
    state.currentRoute = null;
    state.dualRoutes = { mainRoad: null, shortest: null };
    state.lastTrimSegIdx = 0;
    state.triggeredGpsCheckpoints.clear();

    toggleMapPickOriginMode(false);

    if (state.layers.routeGroup) state.layers.routeGroup.clearLayers();
    if (state.layers.arrowGroup) state.layers.arrowGroup.clearLayers();
    if (state.layers.checkpointGroup) state.layers.checkpointGroup.clearLayers();

    state.activeRoutePolylines.mainLine = null;
    state.activeRoutePolylines.casingLine = null;
    state.activeRoutePolylines.altLine = null;
    state.activeRoutePolylines.arrowMarkers = [];
    state.activeRoutePolylines.checkpointMarkers = [];
    state.activeRoutePolylines.startMarker = null;

    if (dom.simProgressPanel) dom.simProgressPanel.classList.add('hidden');
    if (dom.indoorTransitionBanner) dom.indoorTransitionBanner.classList.add('hidden');
    if (dom.startNavBtn) dom.startNavBtn.classList.remove('active-nav');
    if (dom.startNavBtnText) dom.startNavBtnText.textContent = '안내 시작';

    state.selectedDestId = null;
    state.highlightedBuildingIds.clear();
    refreshBuildingMarkersStyle();
    updateQuickChipsActiveState();
    updateTestOriginChipsActiveState();

    renderExploreView();
    switchSheetView('explore', { snapStage: 2 });

    if (!options.silent) {
      showToast('길안내를 취소하고 초기 지도 화면으로 돌아왔습니다.');
    }
  }

  /**
   * 3. 네이버 지도 스타일 건물명 라벨 & 선택 시 강조 핀 마커 렌더링
   * - Zoom < 16: 주요 랜드마크(본관, 중앙도서관) 2개만 작게 표시하고 나머지 건물명은 숨김
   * - Zoom >= 16: 건물 영역 안에 시야를 가리지 않는 작고 얇은 외곽선 텍스트로 건물명 표시
   * - 검색/출발지/목적지 선택 시: 해당 건물 위에만 눈에 확 띄는 강조 핀 배지 표시
   */
  function renderBuildingMarkers() {
    Object.values(state.buildingMarkers).forEach((m) => state.map.removeLayer(m));
    state.buildingMarkers = {};

    CAMPUS_BUILDINGS.forEach((building) => {
      if (
        state.activeCategory !== 'building' &&
        !(building.filterCategories || []).includes(state.activeCategory)
      ) {
        return;
      }

      const isDest = state.selectedDestId === building.id;
      const isOrigin = state.activeSheetView === 'route' && state.startNodeId === building.id;
      const isSearchMatch = state.highlightedBuildingIds && state.highlightedBuildingIds.has(building.id);

      const icon = L.divIcon({
        className: 'custom-usw-building-icon',
        html: createBuildingMarkerHtml(building, { isDest, isOrigin, isSearchMatch }),
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([building.lat, building.lng], {
        icon,
        zIndexOffset: isDest ? 920 : isOrigin || isSearchMatch ? 860 : 320,
      }).addTo(state.map);

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        hideAutocomplete();
        state.highlightedBuildingIds.clear();
        openBuildingDetailView(building.id);
      });

      state.buildingMarkers[building.id] = marker;
    });

    updateZoomBasedLabelVisibility();
  }

  function createBuildingMarkerHtml(building, flags = {}) {
    const isDest = flags.isDest !== undefined ? flags.isDest : state.selectedDestId === building.id;
    const isOrigin =
      flags.isOrigin !== undefined
        ? flags.isOrigin
        : state.activeSheetView === 'route' && state.startNodeId === building.id;
    const isSearchMatch =
      flags.isSearchMatch !== undefined
        ? flags.isSearchMatch
        : state.highlightedBuildingIds && state.highlightedBuildingIds.has(building.id);

    // 선택·검색·출발 건물일 때만 눈에 확 띄는 강조 핀 배지 표시 (모든 줌 레벨에서 유지)
    if (isDest || isOrigin || isSearchMatch) {
      const roleClass = isDest ? 'is-selected' : isOrigin ? 'is-origin' : 'is-search-match';
      const roleBadge = isDest ? '도착' : isOrigin ? '출발' : '검색';
      return `
        <div class="usw-building-marker-wrap ${roleClass}" data-building-id="${building.id}">
          <div class="usw-building-card">
            <span class="b-role-pill">${roleBadge}</span>
            <span class="b-name">${building.name}</span>
          </div>
          <div class="usw-marker-pin-tail"></div>
          <div class="usw-marker-gold-dot"></div>
        </div>
      `;
    }

    // 축소 시(Zoom < 16)에도 아주 작게 보여줄 핵심 랜드마크 2개 지정 (본관, 중앙도서관)
    const isMajorLandmark =
      building.id === 'main_building' || building.id === 'central_library';

    // 평상시에는 지도의 길과 건물을 가리지 않는 네이버 지도식 작고 얇은 외곽선 텍스트만 표시
    return `
      <div class="usw-building-marker-wrap is-clean-text ${
        isMajorLandmark ? 'is-major-landmark' : 'is-normal-building'
      }" data-building-id="${building.id}">
        <span class="usw-clean-label-dot"></span>
        <span class="usw-clean-label-text">${building.name}</span>
      </div>
    `;
  }

  function refreshBuildingMarkersStyle() {
    renderBuildingMarkers();
  }

  /**
   * 4. 내 위치(GPS / 시뮬레이션) 마커 생성 및 주행 방향 자동 회전 연동
   */
  function createOrUpdateUserMarker(lat, lng, bearing = 0, accuracy = null) {
    state.userPosition = { lat, lng, bearing };

    const html = `
      <div class="user-gps-marker-wrap">
        <div class="user-gps-halo"></div>
        <div class="user-gps-cone" style="transform: rotate(${Math.round(bearing)}deg)"></div>
        <div class="user-gps-dot"></div>
        <span class="user-gps-label">내 위치</span>
      </div>
    `;

    const icon = L.divIcon({
      className: 'custom-user-gps-icon',
      html,
      iconSize: [64, 64],
      iconAnchor: [32, 32],
    });

    if (!state.userMarker) {
      state.userMarker = L.marker([lat, lng], {
        icon,
        draggable: true,
        zIndexOffset: 1000,
      }).addTo(state.map);

      // 마커를 드래그하면 실제 도보 이동/경로 이탈 또는 시뮬레이션 출발지 직접 이동을 테스트할 수 있도록 연동
      state.userMarker.on('drag', (e) => {
        const pos = e.target.getLatLng();
        state.userPosition.lat = pos.lat;
        state.userPosition.lng = pos.lng;
        if (state.currentRoute && state.isNavigating) {
          updateRemainingRouteOnMap(pos.lat, pos.lng, { allowReroute: true });
        }
      });

      state.userMarker.on('dragend', async (e) => {
        const pos = e.target.getLatLng();
        state.userPosition.lat = pos.lat;
        state.userPosition.lng = pos.lng;
        if (state.isNavigating && state.currentRoute) {
          updateRemainingRouteOnMap(pos.lat, pos.lng, { allowReroute: true });
        } else if (state.activeSheetView === 'route' || state.selectedDestId) {
          state.customGpsCoord = {
            lat: pos.lat,
            lng: pos.lng,
            name: '드래그 지정 출발지',
          };
          state.pendingIndoorEntranceId = null;
          state.currentOutdoorEntranceId = null;
          await startRouteFindingToBuilding(state.selectedDestId || 'it_college', {
            skipFitBounds: true,
            snapStage: state.sheetSnapStage || 2,
          });
          showToast('📍 드래그한 위치에서 바로 도착지까지 경로를 재계산했습니다.');
        }
      });
    } else {
      state.userMarker.setLatLng([lat, lng]);
      state.userMarker.setIcon(icon);
    }

    // [내 진행 방향 기준 자동 회전 모드 (Heading-Up)] 활성 시 지도 회전 동기화
    if (
      state.compassMode === 'heading-up' &&
      typeof bearing === 'number' &&
      !Number.isNaN(bearing)
    ) {
      setMapBearing(-bearing, { fromHeadingUp: true });
    }

    if (accuracy && accuracy > 3) {
      if (!state.accuracyCircle) {
        state.accuracyCircle = L.circle([lat, lng], {
          radius: Math.min(accuracy, 60),
          color: '#08386b',
          weight: 1,
          opacity: 0.35,
          fillColor: '#08386b',
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(state.map);
      } else {
        state.accuracyCircle.setLatLng([lat, lng]);
        state.accuracyCircle.setRadius(Math.min(accuracy, 60));
      }
    }
  }

  /**
   * =======================================================================
   * 5. 바텀 시트 뷰 전환 (01 홈 탐색 / 02 건물 선택 상세 / 03 길찾기 안내 / 04 저장)
   * =======================================================================
   */
  function switchSheetView(viewName, options = {}) {
    state.activeSheetView = viewName;
    dom.bottomSheet.classList.remove('collapsed');

    dom.sheetViewExplore.classList.toggle('hidden', viewName !== 'explore');
    dom.sheetViewBuilding.classList.toggle('hidden', viewName !== 'building');
    dom.sheetViewRoute.classList.toggle('hidden', viewName !== 'route');
    dom.sheetViewSaved.classList.toggle('hidden', viewName !== 'saved');

    // 길찾기 실행 시 기본 상태는 2단계(중간 높이)로 표시
    if (viewName === 'route') {
      setActiveBottomTab('route');
      setSheetSnapStage(options.snapStage || 2);
    } else if (viewName === 'saved') {
      setActiveBottomTab('saved');
      setSheetSnapStage(2);
    } else {
      setActiveBottomTab('map');
      setSheetSnapStage(2);
    }
  }

  function setActiveBottomTab(tabName) {
    state.activeBottomTab = tabName;
    [dom.tabBtnMap, dom.tabBtnRoute, dom.tabBtnSaved].forEach((btn) => {
      if (!btn) return;
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
  }

  /**
   * [State 01] 앱을 켰을 때 홈 탐색 뷰 렌더링 ("어디로 가볼까요?" + 사진으로 미리보기 카드)
   */
  function renderExploreView() {
    const cat = state.activeCategory;
    if (cat === 'building') {
      dom.exploreTitle.textContent = '어디로 가볼까요?';
      dom.exploreSubtitle.textContent = '건물부터 강의실까지 한 번에 찾아요';
    } else if (cat === 'food') {
      dom.exploreTitle.textContent = '캠퍼스 식당 · 카페';
      dom.exploreSubtitle.textContent = '학생식당(학식)부터 교내 카페까지 빠르게 찾아요';
    } else {
      dom.exploreTitle.textContent = '캠퍼스 편의시설';
      dom.exploreSubtitle.textContent = '편의점, 열람실, 무인발급기, 서점 위치를 안내해요';
    }

    const filteredBuildings = CAMPUS_BUILDINGS.filter((b) =>
      cat === 'building' ? true : (b.filterCategories || []).includes(cat)
    );

    // UI 예시 01과 동일하게 대표 카드(미래혁신관 우선) 및 전체 건물 카드 목록 렌더링
    dom.explorePreviewList.innerHTML = '';
    const displayList = filteredBuildings;

    displayList.forEach((b) => {
      if (!b) return;
      const subLabel =
        cat === 'food' && b.foodLabel
          ? b.foodLabel
          : cat === 'amenity' && b.amenityLabel
          ? b.amenityLabel
          : '사진으로 미리보기';

      const card = document.createElement('div');
      card.className = 'preview-building-card';
      card.innerHTML = `
        <img src="${b.thumbUrl || 'assets/future_thumb.png'}" alt="${b.name}" class="preview-thumb-img" />
        <div class="preview-card-body">
          <div class="preview-card-sub">${subLabel}</div>
          <div class="preview-card-title">${b.name}</div>
        </div>
        <div class="preview-card-arrow">
          <i data-lucide="chevron-right"></i>
        </div>
      `;
      card.addEventListener('click', () => {
        openBuildingDetailView(b.id);
      });
      dom.explorePreviewList.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
    updateQuickChipsActiveState();
  }

  /**
   * [State 02] 건물을 선택했을 때 상세 뷰 열기 (UI 예시 02: 미래혁신관 + 학교 공식 사진 + [실내 보기] / [길찾기])
   */
  function openBuildingDetailView(buildingId) {
    const building = CAMPUS_NODES[buildingId];
    if (!building) return;

    // 진행 중인 시뮬레이션이 있다면 정지
    if (simulator && simulator.state !== 'idle') {
      simulator.stop();
    }

    state.selectedDestId = buildingId;
    refreshBuildingMarkersStyle();
    updateQuickChipsActiveState();

    // 바텀 시트 02 데이터 바인딩
    dom.detailBuildingName.textContent = building.name;
    dom.detailBuildingSub.textContent = building.subtitle || '수원대학교 · 건물 안내';
    dom.detailBuildingImg.src = building.photoUrl || 'assets/future_innovation.png';
    dom.detailFloorBadge.textContent = building.floors || '캠퍼스 주요 건물';
    dom.detailBuildingCopy.textContent = building.indoorAvailable
      ? '건물을 확인하고, 실내로 이어가세요'
      : building.description;

    // 북마크 상태 반영
    dom.bookmarkBuildingBtn.classList.toggle(
      'saved',
      state.savedBuildingIds.has(buildingId)
    );

    switchSheetView('building');

    // 선택된 건물이 화면 중앙 상단에 잘 보이도록 지도 패닝
    state.map.panTo([building.lat - 0.0008, building.lng], {
      animate: true,
      duration: 0.45,
    });
  }

  /**
   * [State 03] [길찾기] 클릭 시 OSRM 실제 보행 도로망 API 우선 탐색 및 오프라인 다익스트라 Fallback
   */
  async function startRouteFindingToBuilding(destBuildingId, options = {}) {
    const targetId = destBuildingId || state.selectedDestId || 'future_innovation';
    const building = CAMPUS_NODES[targetId];
    if (!building) return;

    if (simulator && simulator.state !== 'idle') {
      simulator.stop();
    }

    state.lastTrimSegIdx = 0;

    if (!state.customGpsCoord && state.startNodeId === targetId) {
      const fallbackStart = targetId === 'main_gate' ? 'main_building' : 'main_gate';
      state.startNodeId = fallbackStart;
      if (dom.startNodeSelect) dom.startNodeSelect.value = fallbackStart;
    }

    // 야외 길안내 시 사용자 고정 요청이 없으면 이전 입구 상태를 초기화
    if (!options.keepIndoorEntrance) {
      state.pendingIndoorEntranceId = null;
      state.currentOutdoorEntranceId = null;
    }

    state.selectedDestId = targetId;
    refreshBuildingMarkersStyle();
    updateQuickChipsActiveState();
    updateTestOriginChipsActiveState();
    if (dom.startNodeSelect && !state.customGpsCoord) {
      dom.startNodeSelect.value = state.startNodeId;
    }

    // 출발 위치 마커 설정: 임의 지정/GPS 좌표가 있으면 해당 좌표에, 없으면 선택된 출발지 노드에 표시
    if (state.customGpsCoord) {
      createOrUpdateUserMarker(state.customGpsCoord.lat, state.customGpsCoord.lng, 180);
    } else {
      const startNode = CAMPUS_NODES[state.startNodeId];
      if (startNode) {
        const startLat = startNode.entranceLat || startNode.lat;
        const startLng = startNode.entranceLng || startNode.lng;
        createOrUpdateUserMarker(startLat, startLng, 180);
      }
    }

    // 듀얼 경로 동시 계산: [큰길 우선 경로] vs [최단 거리 경로]
    let dualRoutes = null;
    if (router.findHybridDualPaths) {
      dualRoutes = await router.findHybridDualPaths(
        state.startNodeId,
        targetId,
        state.customGpsCoord
      );
    } else if (router.findDualRoutes) {
      dualRoutes = router.findDualRoutes(
        state.startNodeId,
        targetId,
        state.customGpsCoord
      );
    } else {
      const singleRoute = router.findShortestPath(state.startNodeId, targetId, state.customGpsCoord);
      dualRoutes = { mainRoad: singleRoute, shortest: singleRoute };
    }

    state.dualRoutes = dualRoutes;
    const prefKey = state.activeRoutePreference || 'shortest';
    const route = (dualRoutes && dualRoutes[prefKey]) || dualRoutes.shortest || dualRoutes.mainRoad;

    if (!route) {
      showToast('경로를 계산할 수 없습니다.');
      return;
    }

    // 탭 UI 지표(예상 시간, 거리) 갱신
    updateRouteOptionTabsUI();

    if (route.isOSRM) {
      const prefLabel = prefKey === 'mainRoad' ? '큰길 우선(차도)' : '최단거리(보행로)';
      showToast(`🌐 실제 도로망(OSRM ${prefLabel} · ${route.coordinates.length}개 곡선) 경로 적용 완료`);
    }

    // IT대학 목적지인 경우: 야외 경로(큰길 우선 vs 최단거리)가 실제로 도착한 출입구(1F/2F/3F)를 상태에 보존
    if (targetId === 'it_college' && route.destinationEntranceId) {
      state.currentOutdoorEntranceId = route.destinationEntranceId;
      state.pendingIndoorEntranceId = route.destinationEntranceId;
    }

    state.currentRoute = route;
    simulator.loadRoute(route);
    if (gpsTracker) {
      gpsTracker.setActiveRoute(route);
    }

    renderRouteOnMap(route);
    populateRouteSheet(route);
    switchSheetView('route', { snapStage: options.snapStage || 2 });

    if (!options.skipFitBounds) {
      fitMapToRoute(route);
    }
  }

  /**
   * 도착 예정 시각(예: 오후 12:38 도착) 포맷 헬퍼
   */
  function formatArrivalEtaText(estimatedMinutes) {
    const mins = Math.max(0, Math.round(Number(estimatedMinutes) || 0));
    const target = new Date(Date.now() + mins * 60 * 1000);
    let h = target.getHours();
    const m = String(target.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? '오후' : '오전';
    h = h % 12 || 12;
    return `${ampm} ${h}:${m} 도착`;
  }

  /**
   * 지도 위에 경로 듀얼 렌더링
   * - 선택된 활성 경로: 선명한 파란색(Blue) 실선 + 진행 화살표 + 체크포인트
   * - 이동에 따라 이미 지나온 파란 선과 화살표는 updateRemainingRouteOnMap()에서 실시간으로 지워짐
   */
  function renderRouteOnMap(route) {
    state.layers.routeGroup.clearLayers();
    state.layers.arrowGroup.clearLayers();
    state.layers.checkpointGroup.clearLayers();

    state.activeRoutePolylines.mainLine = null;
    state.activeRoutePolylines.casingLine = null;
    state.activeRoutePolylines.altLine = null;
    state.activeRoutePolylines.arrowMarkers = [];
    state.activeRoutePolylines.checkpointMarkers = [];
    state.activeRoutePolylines.startMarker = null;

    const coords = route.coordinates;
    if (!coords || coords.length < 2) return;

    // 1. 선택되지 않은 다른 대안 경로를 연한 하늘색 점선으로 동시 렌더링 (비교용)
    const currentPref = route.routePreference || state.activeRoutePreference || 'shortest';
    const altKey = currentPref === 'shortest' ? 'mainRoad' : 'shortest';
    const altRoute = state.dualRoutes && state.dualRoutes[altKey];

    if (altRoute && altRoute.coordinates && altRoute.coordinates.length >= 2) {
      const altLabel =
        altKey === 'mainRoad'
          ? '🛣️ 큰길 우선 (차도 중심)'
          : '🚶 최단거리 (보행로·지름길 포함)';

      const altPolyline = L.polyline(altRoute.coordinates, {
        color: '#60a5fa',
        weight: 5.5,
        opacity: 0.72,
        dashArray: '8, 9',
        lineCap: 'round',
        lineJoin: 'round',
        className: 'route-alt-polyline',
      }).addTo(state.layers.routeGroup);

      altPolyline.bindTooltip(
        `대안 경로: <strong>${altLabel}</strong> (약 ${altRoute.estimatedMinutes}분 · ${altRoute.totalDistance}m)<br>👉 클릭 시 이 경로로 전환`,
        { sticky: true, direction: 'top' }
      );

      altPolyline.on('click', () => {
        switchRouteOption(altKey);
      });

      state.activeRoutePolylines.altLine = altPolyline;
    }

    // 2. 외곽 흰색 케이싱 라인 (지나온 구간 실시간 삭제 대상)
    state.activeRoutePolylines.casingLine = L.polyline(coords, {
      color: '#ffffff',
      weight: 12.5,
      opacity: 0.98,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(state.layers.routeGroup);

    // 3. 메인 파란색 경로선 (지나온 구간 실시간 삭제 대상)
    state.activeRoutePolylines.mainLine = L.polyline(coords, {
      color: '#0068ff',
      weight: 7.5,
      opacity: 0.98,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(state.layers.routeGroup);

    // 4. 구간별 방향 화살표 마커 (누적 거리와 함께 저장하여 지나온 화살표를 실시간으로 제거)
    (route.segments || []).forEach((seg) => {
      if (seg.distance < 15) return;
      const fractions = seg.distance > 90 ? [0.3, 0.7] : [0.5];
      fractions.forEach((f) => {
        const lat = seg.from[0] + (seg.to[0] - seg.from[0]) * f;
        const lng = seg.from[1] + (seg.to[1] - seg.from[1]) * f;
        const cumDist = (seg.startCumulativeDist || 0) + seg.distance * f;

        const arrowIcon = L.divIcon({
          className: 'custom-route-arrow',
          html: `
            <div class="route-direction-arrow" style="transform: rotate(${Math.round(seg.bearing - 90)}deg)">
              &#10148;
            </div>
          `,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        const marker = L.marker([lat, lng], {
          icon: arrowIcon,
          interactive: false,
          zIndexOffset: 300,
        }).addTo(state.layers.arrowGroup);

        state.activeRoutePolylines.arrowMarkers.push({
          marker,
          lat,
          lng,
          cumulativeDist: cumDist,
          removed: false,
        });
      });
    });

    // 5. 출발/도착 및 회전 체크포인트 배지
    route.checkpoints.forEach((cp, idx) => {
      if (cp.type === 'start') {
        const startPin = L.divIcon({
          className: 'custom-endpoint-pin',
          html: `<div class="route-endpoint-pin start-pin">출발 · ${route.startName}</div>`,
          iconSize: [0, 0],
        });
        state.activeRoutePolylines.startMarker = L.marker([cp.lat, cp.lng], {
          icon: startPin,
          zIndexOffset: 650,
        }).addTo(state.layers.checkpointGroup);
      } else if (cp.type === 'arrive') {
        const dest = route.destinationBuilding;
        const isItCollege = dest && dest.id === 'it_college';
        let entranceName = '주출입구';
        let entranceFloor = '1F';

        if (isItCollege && window.IT_COLLEGE_INDOOR_DATA && indoorNav) {
          const entId =
            route.destinationEntranceId ||
            state.currentOutdoorEntranceId ||
            state.pendingIndoorEntranceId;
          const ent = entId
            ? indoorNav.getEntranceById(entId)
            : indoorNav.router.resolveEntranceForOutdoorOrigin(
                state.startNodeId,
                route.routePreference || state.activeRoutePreference
              );
          if (ent) {
            entranceName = ent.name;
            entranceFloor = ent.entryFloor;
          }
        }

        const endPin = L.divIcon({
          className: 'custom-endpoint-pin',
          html: isItCollege
            ? `<div class="route-endpoint-pin end-pin-enhanced" title="클릭 시 IT대학 2D 실내 도면 모드로 전환합니다">
                 <span class="end-pin-badge">🚩 추천 진입 출입구</span>
                 <span class="end-pin-title">${route.destinationName} [${entranceName}]</span>
                 <span class="end-pin-sub">👉 건물 ${entranceFloor}으로 진입 · 실내로 연결</span>
               </div>`
            : `<div class="route-endpoint-pin end-pin">도착 · ${route.destinationName} 주출입구</div>`,
          iconSize: [0, 0],
        });
        const arriveMarker = L.marker([cp.lat, cp.lng], {
          icon: endPin,
          zIndexOffset: 700,
        }).addTo(state.layers.checkpointGroup);

        if (isItCollege && indoorNav) {
          arriveMarker.on('click', () => {
            openITCollegeIndoorNavigation({
              roomId: state.pendingIndoorRoomId || 'room_203',
              entranceId:
                route.destinationEntranceId ||
                state.currentOutdoorEntranceId ||
                state.pendingIndoorEntranceId,
              speak: true,
            });
          });
        }
      } else if (cp.turnType === 'right' || cp.turnType === 'left') {
        const cpIcon = L.divIcon({
          className: 'custom-cp-badge',
          html: `<div class="checkpoint-map-badge">${cp.turnLabel}</div>`,
          iconSize: [0, 0],
        });
        const cpMarker = L.marker([cp.lat, cp.lng], {
          icon: cpIcon,
          zIndexOffset: 500,
        }).addTo(state.layers.checkpointGroup);

        cpMarker.on('click', () => {
          simulator.jumpToCheckpoint(idx);
        });

        state.activeRoutePolylines.checkpointMarkers.push({
          marker: cpMarker,
          cumulativeDist: cp.cumulativeDist || 0,
          removed: false,
        });
      }
    });
  }

  /**
   * [요구사항 2 핵심] 지나온 길 실시간 삭제(Trimming) 렌더링 버그 수정
   * - 내 위치를 경로 폴리라인 위의 가장 가까운 투영점(Projected Point)으로 계산해 선을 두 개(지나온 선 / 남은 선)로 분할하되,
   *   지나온 선은 아예 렌더링하지 않고 투영점에서부터 목적지까지 '앞으로 가야 할 남은 선'만 깔끔하게 렌더링합니다.
   * - 마커와 사라지는 지점 사이에 이상한 직선이 이어지거나 선이 꼬이는 현상을 원천 차단합니다.
   */
  function updateRemainingRouteOnMap(currentLat, currentLng, opts = {}) {
    const route = state.currentRoute;
    if (!route || !Array.isArray(route.coordinates) || route.coordinates.length < 2) return;

    const coords = route.coordinates;
    let bestSegIdx = 0;
    let bestRatio = 0;
    let bestProjLat = coords[0][0];
    let bestProjLng = coords[0][1];
    let minDistMeters = 0;

    if (
      typeof opts.exactSegIdx === 'number' &&
      opts.exactSegIdx >= 0 &&
      opts.exactSegIdx < coords.length - 1
    ) {
      bestSegIdx = opts.exactSegIdx;
      const a = coords[bestSegIdx];
      const b = coords[bestSegIdx + 1];
      const proj = CampusRouter.projectPointOnSegment(
        currentLat,
        currentLng,
        a[0],
        a[1],
        b[0],
        b[1]
      );
      bestProjLat = proj.lat;
      bestProjLng = proj.lng;
      bestRatio = proj.t;
      minDistMeters = proj.distance;
      state.lastTrimSegIdx = bestSegIdx;
    } else {
      minDistMeters = Infinity;
      const startSearchIdx = Math.max(0, (state.lastTrimSegIdx || 0) - 2);
      for (let i = startSearchIdx; i < coords.length - 1; i++) {
        const a = coords[i];
        const b = coords[i + 1];
        const proj = CampusRouter.projectPointOnSegment(
          currentLat,
          currentLng,
          a[0],
          a[1],
          b[0],
          b[1]
        );
        if (proj.distance < minDistMeters) {
          minDistMeters = proj.distance;
          bestSegIdx = i;
          bestRatio = proj.t;
          bestProjLat = proj.lat;
          bestProjLng = proj.lng;
        }
      }
      // 만약 전체 경로에서 탐색해야 하는 경우 (초기 점프 등)
      if (minDistMeters > 20 && startSearchIdx > 0) {
        for (let i = 0; i < startSearchIdx; i++) {
          const a = coords[i];
          const b = coords[i + 1];
          const proj = CampusRouter.projectPointOnSegment(
            currentLat,
            currentLng,
            a[0],
            a[1],
            b[0],
            b[1]
          );
          if (proj.distance < minDistMeters) {
            minDistMeters = proj.distance;
            bestSegIdx = i;
            bestRatio = proj.t;
            bestProjLat = proj.lat;
            bestProjLng = proj.lng;
          }
        }
      }
      state.lastTrimSegIdx = bestSegIdx;
    }

    // 1. 경로 이탈(Off-route >= 28m) 감지 시 자동 재탐색 (실제 GPS 주행 / 마커 드래그 시)
    if (opts.allowReroute && minDistMeters >= 28) {
      const now = Date.now();
      if (now - state.lastRerouteTimestamp > 6500) {
        state.lastRerouteTimestamp = now;
        triggerAutomaticReroute(currentLat, currentLng, Math.round(minDistMeters));
        return;
      }
    }

    // 2. 주행 거리 계산 및 대안 경로 점선(altLine)·출발 핀 숨김
    let traveledMeters = 0;
    if (typeof opts.exactTraveledDist === 'number') {
      traveledMeters = opts.exactTraveledDist;
    } else if (route.segments && route.segments[bestSegIdx]) {
      const seg = route.segments[bestSegIdx];
      traveledMeters = (seg.startCumulativeDist || 0) + (seg.distance || 0) * bestRatio;
    } else {
      traveledMeters = Math.round(
        (bestSegIdx / Math.max(1, coords.length - 1)) * (route.totalDistance || 100)
      );
    }

    if (
      traveledMeters > 3 ||
      state.isNavigating ||
      (simulator && simulator.state === 'running')
    ) {
      if (state.activeRoutePolylines.altLine && state.layers.routeGroup) {
        state.layers.routeGroup.removeLayer(state.activeRoutePolylines.altLine);
        state.activeRoutePolylines.altLine = null;
      }
      if (state.activeRoutePolylines.startMarker && state.layers.checkpointGroup) {
        state.layers.checkpointGroup.removeLayer(state.activeRoutePolylines.startMarker);
        state.activeRoutePolylines.startMarker = null;
      }
    }

    // 3. 투영점([bestProjLat, bestProjLng])에서부터 목적지까지 남은 폴리라인 좌표만 구성 (미세 중복점으로 인한 꺾임 방지)
    const tailCoords = coords.slice(bestSegIdx + 1);
    while (
      tailCoords.length > 1 &&
      CampusRouter.haversineDistance(bestProjLat, bestProjLng, tailCoords[0][0], tailCoords[0][1]) < 0.4
    ) {
      tailCoords.shift();
    }

    const remainingCoords = [[bestProjLat, bestProjLng], ...tailCoords];

    if (remainingCoords.length >= 2) {
      if (state.activeRoutePolylines.mainLine) {
        state.activeRoutePolylines.mainLine.setLatLngs(remainingCoords);
      }
      if (state.activeRoutePolylines.casingLine) {
        state.activeRoutePolylines.casingLine.setLatLngs(remainingCoords);
      }
    } else {
      if (state.activeRoutePolylines.mainLine) {
        state.activeRoutePolylines.mainLine.setLatLngs([]);
      }
      if (state.activeRoutePolylines.casingLine) {
        state.activeRoutePolylines.casingLine.setLatLngs([]);
      }
    }

    // 4. 이미 지나온 방향 화살표 마커(arrowMarkers) 및 회전 배지(checkpointMarkers) 실시간 삭제
    (state.activeRoutePolylines.arrowMarkers || []).forEach((item) => {
      if (item.cumulativeDist <= traveledMeters + 6) {
        if (!item.removed && state.layers.arrowGroup) {
          state.layers.arrowGroup.removeLayer(item.marker);
          item.removed = true;
        }
      } else if (item.removed && state.layers.arrowGroup) {
        item.marker.addTo(state.layers.arrowGroup);
        item.removed = false;
      }
    });

    (state.activeRoutePolylines.checkpointMarkers || []).forEach((cpItem) => {
      if (cpItem.cumulativeDist <= traveledMeters + 5) {
        if (!cpItem.removed && state.layers.checkpointGroup) {
          state.layers.checkpointGroup.removeLayer(cpItem.marker);
          cpItem.removed = true;
        }
      } else if (cpItem.removed && state.layers.checkpointGroup) {
        cpItem.marker.addTo(state.layers.checkpointGroup);
        cpItem.removed = false;
      }
    });

    // 5. 남은 거리·시간·진행률 및 1단계 미니바 실시간 업데이트
    const totalDist = Math.max(1, route.totalDistance || 100);
    const remainingDist = Math.max(0, Math.round(totalDist - traveledMeters));
    const remainingMins = Math.max(0, Math.ceil(remainingDist / 68));
    const progressPct = Math.min(100, Math.max(0, Math.round((traveledMeters / totalDist) * 100)));

    updateSnap1MiniBarMetrics(remainingMins, remainingDist, progressPct);
  }

  /**
   * 경로 이탈 시 현재 GPS 위치에서 목적지까지 새로운 경로를 즉시 재계산
   */
  async function triggerAutomaticReroute(currentLat, currentLng, offDistMeters) {
    if (!state.selectedDestId) return;
    state.customGpsCoord = {
      lat: currentLat,
      lng: currentLng,
      name: '현재 내 위치(재탐색)',
    };

    showToast(`🔄 경로에서 ${offDistMeters}m 벗어나 현재 위치 기준으로 새 경로를 재탐색합니다.`);
    if (tts) {
      tts.speak('경로를 이탈하여 현재 위치에서 새로운 경로를 안내합니다.', {
        interrupt: true,
        turnType: 'start',
      });
    }

    await startRouteFindingToBuilding(state.selectedDestId, {
      skipFitBounds: true,
      snapStage: state.sheetSnapStage,
    });
  }

  /**
   * 네이버 지도 1단계(최소화 한 줄 모드) 미니바 수치 및 진행바 업데이트
   * 형식: "미래혁신관 308호 (약 8분 · 520m) | 안내 종료"
   */
  function updateSnap1MiniBarMetrics(remainingMins, remainingDist, progressPct = 0) {
    const minsText = remainingMins > 0 ? `${remainingMins}분` : '곧 도착';
    const distText = `${remainingDist}m`;
    const etaText = formatArrivalEtaText(remainingMins);

    if (dom.miniBarTime) dom.miniBarTime.textContent = minsText;
    if (dom.miniBarDist) dom.miniBarDist.textContent = distText;
    if (dom.miniBarEta) dom.miniBarEta.textContent = etaText;
    if (dom.snap1ProgressFill) dom.snap1ProgressFill.style.width = `${progressPct}%`;
    if (dom.snap1ProgressHead) dom.snap1ProgressHead.style.left = `${progressPct}%`;
  }

  function fitMapToRoute(route) {
    if (!route || !route.coordinates || route.coordinates.length === 0) return;
    const bounds = L.latLngBounds(route.coordinates);
    state.map.fitBounds(bounds, {
      paddingTopLeft: [45, 140],
      paddingBottomRight: [45, 320],
      maxZoom: 18,
      animate: true,
      duration: 0.55,
    });
  }

  function populateRouteSheet(route) {
    const dest = route.destinationBuilding;
    const modeBadge =
      route.routePreference === 'mainRoad'
        ? '🛣️ 큰길 우선(차도 중심)'
        : '🚶 최단거리(보행로·지름길)';

    if (dom.sheetRouteTag) {
      dom.sheetRouteTag.textContent =
        route.routePreference === 'mainRoad' ? '차도 중심 큰길' : '보행자 최단경로';
    }

    dom.sheetCategoryTag.textContent = route.isOSRM
      ? `${dest.category || '캠퍼스 건물'} · 🌐 ${modeBadge}`
      : `${dest.category || '캠퍼스 건물'} · ${modeBadge}`;
    dom.sheetBuildingName.textContent = dest.fullName || dest.name;

    // 출발지 드롭다운 동기화 (클릭/GPS 출발지인 경우 전용 옵션 표시)
    if (dom.startNodeSelect) {
      let customOpt = dom.startNodeSelect.querySelector('option[value="__custom__"]');
      if (state.customGpsCoord) {
        if (!customOpt) {
          customOpt = document.createElement('option');
          customOpt.value = '__custom__';
          dom.startNodeSelect.insertBefore(customOpt, dom.startNodeSelect.firstChild);
        }
        customOpt.textContent = `📍 ${state.customGpsCoord.name || '지도 클릭 출발지'}`;
        dom.startNodeSelect.value = '__custom__';
      } else {
        if (customOpt) customOpt.remove();
        dom.startNodeSelect.value = state.startNodeId;
      }
    }

    // IT대학 목적지인 경우, 선택된 루트(큰길 우선 vs 최단거리)가 도착한 출입구(1F/2F/3F)로 동적 표시
    let resolvedEnt = null;
    if (dest.id === 'it_college' && window.IT_COLLEGE_INDOOR_DATA && indoorNav) {
      const entId =
        route.destinationEntranceId ||
        state.currentOutdoorEntranceId ||
        state.pendingIndoorEntranceId;
      resolvedEnt = entId
        ? indoorNav.getEntranceById(entId)
        : indoorNav.router.resolveEntranceForOutdoorOrigin(
            state.startNodeId,
            route.routePreference || state.activeRoutePreference
          );
      if (resolvedEnt) {
        dom.sheetEndName.textContent = `IT대학 ${resolvedEnt.name} (${resolvedEnt.entryFloor} 진입)`;
      } else {
        dom.sheetEndName.textContent = `${dest.name} 입구`;
      }
    } else {
      dom.sheetEndName.textContent = `${dest.name} 입구`;
    }

    dom.sheetEstTime.textContent = `약 ${route.estimatedMinutes}분`;
    dom.sheetTotalDist.textContent = `${route.totalDistance}m`;
    dom.sheetCheckpointCount.textContent = `${route.checkpoints.length}구간`;

    // [1단계(최소화 한 줄 모드) 네이버 지도식 미니바 목적지명 + 수치 동기화]
    if (dom.miniBarTitle && dest) {
      let roomSuffix = '';
      if (dest.id === 'it_college' && state.pendingIndoorRoomId && window.IT_COLLEGE_INDOOR_DATA) {
        const rNode = window.IT_COLLEGE_INDOOR_DATA.nodes[state.pendingIndoorRoomId];
        if (rNode && rNode.roomNumber) roomSuffix = ` ${rNode.roomNumber}`;
      }
      dom.miniBarTitle.textContent = `${dest.name}${roomSuffix}`;
    }
    updateSnap1MiniBarMetrics(route.estimatedMinutes, route.totalDistance, 0);

    // [3단계(전체 화면 상세 모드) 도착지 건물 공식 사진 카드 동기화]
    if (dom.routeDestBuildingCard && dest) {
      if (dom.rdbcBuildingName) {
        dom.rdbcBuildingName.textContent = `수원대학교 ${dest.fullName || dest.name}`;
      }
      if (dom.rdbcBuildingSub) {
        dom.rdbcBuildingSub.textContent = `경기 화성시 봉담읍 와우안길 17 · ${dest.floors || '캠퍼스 주요 건물'}`;
      }
      if (dom.rdbcBuildingImg) {
        dom.rdbcBuildingImg.src = dest.photoUrl || dest.thumbUrl || 'assets/future_innovation.png';
        dom.rdbcBuildingImg.alt = dest.name;
      }
      if (dom.rdbcEntranceCaption) {
        dom.rdbcEntranceCaption.textContent = resolvedEnt
          ? `도로를 따라 이동 후 [${resolvedEnt.name} (${resolvedEnt.entryFloor})]로 진입하세요.`
          : `보행로를 따라 이동 후 ${dest.name} 주출입구로 진입하세요.`;
      }
    }

    // [야외 출입구 추천 가이드 박스 동기화]
    if (dom.sheetEntranceGuideBox) {
      if (dest.id === 'it_college' && window.IT_COLLEGE_INDOOR_DATA && indoorNav && resolvedEnt) {
        dom.sheetEntranceGuideBox.classList.remove('hidden');
        if (dom.guideEntranceTitle) dom.guideEntranceTitle.textContent = resolvedEnt.name;
        if (dom.guideEntranceFloorTag) dom.guideEntranceFloorTag.textContent = `🏢 ${resolvedEnt.entryFloor} 진입`;

        let desc = '';
        if (resolvedEnt.id === 'ent_1f_main') {
          desc = '동측 보행로·광장(최단거리)에서 바로 이어지는 1층 남동측 주출입구입니다. 진입 즉시 1층 실내 도면으로 연결됩니다.';
        } else if (resolvedEnt.id === 'ent_2f_south') {
          desc =
            route.routePreference === 'mainRoad'
              ? '중앙 사거리·서측 학술로(큰길 우선)에서 1층으로 돌아가지 않고 바로 연결되는 2층 남측 입구입니다. 진입 즉시 2층 실내 도면으로 이어집니다.'
              : '후문·중앙도서관 및 서측 학술로 방면과 바로 연결되는 2층 남측 중앙출입구입니다. 진입 즉시 2층 실내 도면으로 이어집니다.';
        } else if (resolvedEnt.id === 'ent_3f_west') {
          desc = '경상관 CU 쪽문·자연과학대 서측 언덕길에서 바로 진입하는 3층 서측 출입구입니다. 진입 즉시 3층 실내 도면으로 연결됩니다.';
        } else {
          desc = `${resolvedEnt.name}를 통해 건물 ${resolvedEnt.entryFloor}으로 가장 빠르게 진입합니다.`;
        }
        if (dom.guideEntranceDesc) dom.guideEntranceDesc.textContent = desc;

        const targetRoomId = state.pendingIndoorRoomId || 'room_203';
        const roomNode = window.IT_COLLEGE_INDOOR_DATA.nodes[targetRoomId];
        const roomNum = roomNode ? roomNode.roomNumber : '203호';
        if (dom.guideTargetRoomTag) {
          dom.guideTargetRoomTag.textContent = `📍 실내 ${roomNum}까지 최단 동선`;
        }
      } else {
        dom.sheetEntranceGuideBox.classList.add('hidden');
      }
    }

    dom.simProgressPanel.classList.add('hidden');
    if (dest.id === 'it_college') {
      dom.indoorTransitionBanner.classList.remove('hidden');
      const roomNode =
        window.IT_COLLEGE_INDOOR_DATA &&
        window.IT_COLLEGE_INDOOR_DATA.nodes[state.pendingIndoorRoomId || 'room_203'];
      const roomLabel = roomNode ? roomNode.roomNumber : '203호';
      dom.indoorBannerSub.textContent = resolvedEnt
        ? `현재 야외 경로는 [${resolvedEnt.name}]를 통해 건물 ${resolvedEnt.entryFloor}으로 진입합니다. 2D 실내 도면(${roomLabel}) 안내로 바로 전환할 수 있습니다.`
        : `IT대학 2D 실내 도면 및 ${roomLabel} 강의실 길안내로 전환할 수 있습니다.`;
    } else {
      dom.indoorTransitionBanner.classList.add('hidden');
    }
    dom.startNavBtnText.textContent = '안내 시작';
    dom.startNavBtn.classList.remove('active-nav');

    dom.sheetFacilitiesList.innerHTML = '';
    (dest.facilities || []).forEach((fac) => {
      const span = document.createElement('span');
      span.className = 'facility-chip';
      span.textContent = fac;
      dom.sheetFacilitiesList.appendChild(span);
    });

    renderCheckpointTimeline(route.checkpoints);
  }

  /**
   * [🛣️ 큰길 우선 (차도 중심)] vs [🚶 최단거리 (보행로·지름길 포함)] 탭 UI 상태 및 지표 동기화
   */
  function updateRouteOptionTabsUI() {
    if (!state.dualRoutes) return;
    const mr = state.dualRoutes.mainRoad;
    const sh = state.dualRoutes.shortest;

    if (mr && dom.tabMainRoadMetrics) {
      dom.tabMainRoadMetrics.textContent = `약 ${mr.estimatedMinutes}분 · ${mr.totalDistance}m`;
    }
    if (sh && dom.tabShortestMetrics) {
      dom.tabShortestMetrics.textContent = `약 ${sh.estimatedMinutes}분 · ${sh.totalDistance}m`;
    }

    const currentPref = state.activeRoutePreference || 'shortest';
    if (dom.tabMainRoadRoute) {
      dom.tabMainRoadRoute.classList.toggle('active', currentPref === 'mainRoad');
      dom.tabMainRoadRoute.setAttribute('aria-selected', currentPref === 'mainRoad');
    }
    if (dom.tabShortestRoute) {
      dom.tabShortestRoute.classList.toggle('active', currentPref === 'shortest');
      dom.tabShortestRoute.setAttribute('aria-selected', currentPref === 'shortest');
    }
  }

  /**
   * 사용자가 [큰길 우선] 또는 [최단거리] 탭을 눌렀을 때 즉시 경로 전환 및 지도·출입구 동기화
   */
  function switchRouteOption(prefKey) {
    if (!state.dualRoutes || !state.dualRoutes[prefKey]) return;
    state.activeRoutePreference = prefKey;
    state.lastTrimSegIdx = 0;
    const route = state.dualRoutes[prefKey];

    state.currentRoute = route;
    if (route.destinationEntranceId) {
      state.currentOutdoorEntranceId = route.destinationEntranceId;
      state.pendingIndoorEntranceId = route.destinationEntranceId;
    }

    updateRouteOptionTabsUI();
    renderRouteOnMap(route);
    populateRouteSheet(route);
    simulator.loadRoute(route);
    if (gpsTracker) {
      gpsTracker.setActiveRoute(route);
    }

    const label =
      prefKey === 'mainRoad'
        ? '🛣️ 큰길 우선 (차도 중심)'
        : '🚶 최단거리 (보행로·지름길 포함)';
    const entInfo = route.destinationEntranceName
      ? ` · 진입: ${route.destinationEntranceName}(${route.destinationEntranceFloor || ''})`
      : '';
    showToast(`🧭 [${label}] 경로로 전환했습니다. (${route.totalDistance}m${entInfo})`);
    if (tts) {
      tts.speak(
        `${prefKey === 'mainRoad' ? '큰길 우선' : '최단거리'} 경로로 안내를 시작합니다.`,
        { interrupt: true }
      );
    }
  }

  function renderCheckpointTimeline(checkpoints, activeIdx = -1) {
    dom.checkpointTimeline.innerHTML = '';
    checkpoints.forEach((cp, index) => {
      const li = document.createElement('li');
      const statusClass =
        index === activeIdx ? 'active' : index < activeIdx ? 'passed' : '';
      li.className = `checkpoint-item turn-${cp.turnType} ${statusClass}`.trim();
      li.dataset.index = index;

      let badgeSymbol = '↑';
      if (cp.turnType === 'start') badgeSymbol = '출발';
      else if (cp.turnType === 'right') badgeSymbol = '↱';
      else if (cp.turnType === 'left') badgeSymbol = '↰';
      else if (cp.turnType === 'arrive') badgeSymbol = '도착';

      const prevDist = index > 0 ? checkpoints[index - 1].cumulativeDist || 0 : 0;
      const segDist = Math.max(0, (cp.cumulativeDist || 0) - prevDist);
      const distLabel =
        cp.turnType === 'start'
          ? '출발지'
          : cp.turnType === 'arrive'
            ? `총 ${cp.cumulativeDist}m`
            : `${segDist || cp.cumulativeDist}m`;

      li.innerHTML = `
        <div class="cp-icon-badge">${badgeSymbol}</div>
        <div class="cp-body">
          <div class="cp-title">${cp.instruction}</div>
          <div class="cp-voice-sub">${cp.voiceText}</div>
        </div>
        <div class="cp-dist-badge">${distLabel}</div>
      `;

      li.addEventListener('click', () => {
        simulator.jumpToCheckpoint(index);
        state.map.panTo([cp.lat, cp.lng], { animate: true });
      });

      dom.checkpointTimeline.appendChild(li);
    });
  }

  /**
   * [State 04] 저장 탭 뷰 렌더링
   */
  function renderSavedView() {
    dom.savedBuildingsList.innerHTML = '';
    const savedIds = Array.from(state.savedBuildingIds);

    if (savedIds.length === 0) {
      dom.savedBuildingsList.innerHTML = `
        <div class="preview-building-card">
          <div class="preview-card-body">
            <div class="preview-card-sub">저장된 건물이 없습니다</div>
            <div class="preview-card-title">건물 상세 화면에서 북마크를 눌러보세요</div>
          </div>
        </div>
      `;
      return;
    }

    savedIds.forEach((id) => {
      const b = CAMPUS_NODES[id];
      if (!b) return;
      const card = document.createElement('div');
      card.className = 'preview-building-card';
      card.innerHTML = `
        <img src="${b.thumbUrl || 'assets/future_thumb.png'}" alt="${b.name}" class="preview-thumb-img" />
        <div class="preview-card-body">
          <div class="preview-card-sub">${b.category} · ${b.floors}</div>
          <div class="preview-card-title">${b.name}</div>
        </div>
        <div class="preview-card-arrow">
          <i data-lucide="chevron-right"></i>
        </div>
      `;
      card.addEventListener('click', () => {
        openBuildingDetailView(b.id);
      });
      dom.savedBuildingsList.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * =======================================================================
   * 6. 실내 도면 뷰어 모달 & Step 2 2D 실내 길안내 모드 (IT대학 우선 적용)
   * =======================================================================
   */
  async function openITCollegeIndoorNavigation(options = {}) {
    if (!indoorNav) return;

    if (simulator && simulator.state === 'running') {
      simulator.pause();
    }

    const roomId = options.roomId || state.pendingIndoorRoomId || 'room_203';
    state.pendingIndoorRoomId = roomId;

    // 야외 경로가 아직 계산되지 않았거나 다른 건물을 가리키고 있었다면
    // 먼저 현재 출발지(또는 클릭 좌표)에서 IT대학 입구까지의 야외 경로를 계산하여 도착 입구를 100% 동기화
    const isCurrentRouteItCollege =
      state.currentRoute &&
      (state.currentRoute.endNodeId === 'it_college' ||
        state.currentRoute.destinationId === 'it_college' ||
        (state.currentRoute.destinationBuilding &&
          state.currentRoute.destinationBuilding.id === 'it_college'));

    if (!isCurrentRouteItCollege) {
      await startRouteFindingToBuilding('it_college', {
        skipFitBounds: true,
        keepIndoorEntrance: Boolean(
          options.entranceId || state.currentOutdoorEntranceId || state.pendingIndoorEntranceId
        ),
      });
    }

    // 야외에서 안내받은 입구(루트별 동적 매칭 입구)를 최우선으로 실내 길안내 시작 입구로 설정!
    const currentPref =
      (state.currentRoute && state.currentRoute.routePreference) ||
      state.activeRoutePreference ||
      'shortest';
    const resolvedOutdoorEnt = indoorNav.router.resolveEntranceForOutdoorOrigin(
      state.startNodeId,
      currentPref
    );
    const entranceId =
      options.entranceId ||
      (state.currentRoute && state.currentRoute.destinationEntranceId) ||
      state.currentOutdoorEntranceId ||
      state.pendingIndoorEntranceId ||
      (resolvedOutdoorEnt ? resolvedOutdoorEnt.id : 'ent_1f_main');

    // 상태 보존
    state.currentOutdoorEntranceId = entranceId;
    state.pendingIndoorEntranceId = entranceId;

    state.selectedDestId = 'it_college';
    refreshBuildingMarkersStyle();
    updateQuickChipsActiveState();

    // 바텀 시트 안내 문구도 현재 선택된 강의실과 진입 입구로 즉시 동기화
    if (state.currentRoute) {
      populateRouteSheet(state.currentRoute);
    }

    indoorNav.open({
      roomId,
      entranceId,
      outdoorOriginId: state.startNodeId,
      routePreference: currentPref,
      autoStartSim: Boolean(options.autoStartSim),
      speak: options.speak !== false,
    });

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function openIndoorFloorPlanModal(buildingId) {
    const targetId = buildingId || state.selectedDestId || 'it_college';

    // IT대학인 경우 Step 2 2D 실내 도면 및 강의실 길안내 모드로 즉시 전환!
    // 야외에서 안내받은 도착 입구를 반드시 유지하여 전달!
    if (targetId === 'it_college' && indoorNav) {
      const entId =
        state.currentOutdoorEntranceId ||
        (state.currentRoute && state.currentRoute.destinationEntranceId) ||
        state.pendingIndoorEntranceId ||
        null;
      openITCollegeIndoorNavigation({
        roomId: state.pendingIndoorRoomId || 'room_203',
        entranceId: entId,
        speak: true,
      });
      return;
    }

    const b = CAMPUS_NODES[targetId];
    if (!b) return;

    dom.indoorModalTitle.textContent = `${b.name} 실내 도면 안내`;
    dom.floorSelectorBar.innerHTML = '';

    const plans = b.floorPlans || [];
    if (plans.length > 0) {
      // 기본으로 지상 1층(1F) 또는 첫 번째 층 선택
      const defaultIdx = Math.max(
        0,
        plans.findIndex((p) => p.floor === '1F')
      );

      plans.forEach((plan, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `floor-tab-btn ${idx === defaultIdx ? 'active' : ''}`;
        btn.textContent = plan.floor;
        btn.title = plan.label;
        btn.addEventListener('click', () => {
          dom.floorSelectorBar
            .querySelectorAll('.floor-tab-btn')
            .forEach((el) => el.classList.remove('active'));
          btn.classList.add('active');
          loadFloorPlanEntry(b, plan);
        });
        dom.floorSelectorBar.appendChild(btn);
      });

      loadFloorPlanEntry(b, plans[defaultIdx]);
    } else {
      loadFloorPlanEntry(b, null);
    }

    dom.indoorModal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  function loadFloorPlanEntry(building, plan) {
    if (plan && plan.file) {
      const encodedUrl = encodeURI(plan.file);
      dom.floorSummaryText.textContent = `${plan.label} (${plan.floor}): ${plan.summary}`;
      dom.floorplanPdfFrame.src = encodedUrl;
      dom.floorplanPdfFrame.classList.remove('hidden');
      dom.floorplanFallbackBox.classList.add('hidden');
      dom.openPdfNewTabLink.href = encodedUrl;
      dom.openPdfNewTabLink.classList.remove('hidden');
    } else {
      dom.floorSummaryText.textContent = plan
        ? `${plan.label}: ${plan.summary}`
        : `${building.name} 층별 안내`;
      dom.floorplanPdfFrame.src = 'about:blank';
      dom.floorplanPdfFrame.classList.add('hidden');
      dom.floorplanFallbackBox.classList.remove('hidden');
      dom.openPdfNewTabLink.classList.add('hidden');

      dom.modalBuildingName.textContent = building.fullName || building.name;
      dom.modalBuildingFloors.textContent = building.floors || '지상 1층 ~ 5층';
      dom.modalBuildingPreview.textContent =
        plan ? plan.summary : building.indoorPreview || (building.facilities || []).join(' · ');
    }
  }

  /**
   * =========================================================================
   * 8. 네이버 지도식 하단 고정 바텀 시트 1~3단계 스냅(Snap) 컨트롤러
   * - 상하좌우 자유 이동 및 우측 창 크기 조절 버튼 제거
   * - 상단 중앙 회색 핸들바(#sheetHandleArea) 스와이프/클릭으로만 1단계 ↔ 2단계 ↔ 3단계 전환
   *   * 1단계 (snap-1): 최소화 한 줄 모드 ("미래혁신관 308호 (약 8분 · 520m) | 안내 종료" + 진행 바)
   *   * 2단계 (snap-2): 기본 중간 높이 상태 (소요 시간, 거리, 경로 옵션 탭, 요약 정보, 안내 시작 버튼)
   *   * 3단계 (snap-3): 전체 화면 상세 상태 (출발지~도착지 전체 상세 경로 타임라인 + 도착지 건물 사진 카드)
   * =========================================================================
   */
  function initBottomSheetSnapController() {
    const panel = dom.bottomSheet;
    if (!panel) return;

    // 경로 옵션 탭 클릭 (큰길 우선 vs 최단 거리)
    if (dom.tabMainRoadRoute) {
      dom.tabMainRoadRoute.addEventListener('click', () => switchRouteOption('mainRoad'));
    }
    if (dom.tabShortestRoute) {
      dom.tabShortestRoute.addEventListener('click', () => switchRouteOption('shortest'));
    }

    // 1단계 미니바 또는 펼치기 버튼 클릭 시 2단계(기본 상태)로 복귀
    if (dom.sheetMiniBar) {
      dom.sheetMiniBar.addEventListener('click', (e) => {
        if (e.target.closest('button') && !e.target.closest('#miniExpandBtn')) return;
        setSheetSnapStage(2);
      });
    }
    if (dom.miniExpandBtn) {
      dom.miniExpandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setSheetSnapStage(2);
      });
    }

    // 1단계 미니바 내 [안내 종료] 버튼 ➔ 즉시 안내 취소 및 초기 화면 복귀
    if (dom.miniStopNavBtn) {
      dom.miniStopNavBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelAllNavigation();
      });
    }

    // 1단계 미니바 내 [안내] 버튼
    if (dom.miniStartNavBtn) {
      dom.miniStartNavBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dom.startNavBtn?.click();
      });
    }

    // 1단계 미니바 내 [실내] 버튼
    if (dom.miniOpenIndoorBtn) {
      dom.miniOpenIndoorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openIndoorFloorPlanModal(state.selectedDestId);
      });
    }

    const handleEl = dom.sheetHandleArea;
    if (!handleEl) return;

    let pointerStartY = 0;
    let pointerCurrentY = 0;
    let isPointerDown = false;
    let hasMovedVertically = false;

    handleEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      isPointerDown = true;
      hasMovedVertically = false;
      pointerStartY = e.clientY;
      pointerCurrentY = e.clientY;
      try {
        handleEl.setPointerCapture(e.pointerId);
      } catch (err) {}
    });

    handleEl.addEventListener('pointermove', (e) => {
      if (!isPointerDown) return;
      e.stopPropagation();
      pointerCurrentY = e.clientY;
      if (Math.abs(pointerCurrentY - pointerStartY) > 8) {
        hasMovedVertically = true;
      }
    });

    const finishHandleGesture = (e) => {
      if (!isPointerDown) return;
      isPointerDown = false;
      e.stopPropagation();

      const dy = pointerCurrentY - pointerStartY;
      const curStage = state.sheetSnapStage || 2;

      if (hasMovedVertically && Math.abs(dy) >= 22) {
        if (dy < -22) {
          // 위로 쓸어올림 (Swipe Up): 1단계 -> 2단계 -> 3단계
          setSheetSnapStage(Math.min(3, curStage + 1));
        } else if (dy > 22) {
          // 아래로 쓸어내림 (Swipe Down): 3단계 -> 2단계 -> 1단계
          setSheetSnapStage(Math.max(1, curStage - 1));
        }
      } else {
        // 단순 클릭 시: 1단계면 2단계로, 2단계면 3단계로, 3단계면 2단계로 전환
        if (curStage === 1) setSheetSnapStage(2);
        else if (curStage === 2) setSheetSnapStage(3);
        else setSheetSnapStage(2);
      }
    };

    handleEl.addEventListener('pointerup', finishHandleGesture);
    handleEl.addEventListener('pointercancel', () => {
      isPointerDown = false;
    });
  }

  function setSheetSnapStage(stageNum) {
    const panel = dom.bottomSheet;
    if (!panel) return;

    const validStage = Math.max(1, Math.min(3, Number(stageNum) || 2));
    state.sheetSnapStage = validStage;

    // 항상 하단에 반듯하게 고정 (자유 이동 인라인 좌표 초기화)
    panel.style.left = '';
    panel.style.top = '';
    panel.style.bottom = '';
    panel.style.width = '';
    panel.style.height = '';
    panel.style.maxHeight = '';
    panel.style.transform = '';

    panel.classList.remove(
      'collapsed',
      'mode-floating',
      'mode-mini',
      'mode-compact',
      'mode-sidebar',
      'snap-1',
      'snap-2',
      'snap-3'
    );
    panel.classList.add(`snap-${validStage}`);

    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * =========================================================================
   * 8-B. 지도 화면 360도 회전 기능 및 네이버 지도식 나침반(방향 고정) 모드
   * - 두 손가락 비틀기(Touch Rotate), Alt/우클릭 드래그, 좌우 회전 버튼 지원
   * - 나침반 버튼 클릭 시 [북쪽 고정 모드(North-Up)] ↔ [내 진행 방향 자동 회전 모드(Heading-Up)] 전환
   * - 지도가 회전해도 건물명 텍스트·마커·안내 라벨은 거꾸로 뒤집히지 않고 항상 수평 유지(--map-rotation-neg)
   * =========================================================================
   */
  function initMapRotationAndCompass() {
    const mapContainer = state.map && state.map.getContainer();
    if (!mapContainer) return;

    // 좌측 상단 나침반 버튼 클릭: [북쪽 고정(North-Up)] ↔ [내 진행 방향 자동 회전(Heading-Up)]
    if (dom.resetCampusViewBtn) {
      dom.resetCampusViewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.compassMode === 'north-up' && Math.abs(state.mapBearing) > 1) {
          // 수동 회전 상태에서 누르면 먼저 북쪽(0도)으로 정렬
          setMapBearing(0);
          showToast('🧭 지도를 정북(North-Up) 방향으로 정렬했습니다.');
          return;
        }

        if (state.compassMode === 'north-up') {
          state.compassMode = 'heading-up';
          dom.resetCampusViewBtn.classList.add('heading-up-active');
          if (dom.compassModeLabel) dom.compassModeLabel.textContent = '방향추적';
          const userBearing = (state.userPosition && state.userPosition.bearing) || 0;
          setMapBearing(-userBearing, { fromHeadingUp: true });
          showToast('🧭 [내 진행 방향 자동 회전(Heading-Up)] 모드가 켜졌습니다.');
        } else {
          state.compassMode = 'north-up';
          dom.resetCampusViewBtn.classList.remove('heading-up-active');
          if (dom.compassModeLabel) dom.compassModeLabel.textContent = '북쪽고정';
          setMapBearing(0);
          showToast('🧭 [북쪽 고정(North-Up)] 모드로 전환했습니다.');
        }
      });
    }

    // 회전 버튼 (↺ -45°, ↻ +45°)
    if (dom.rotateMapLeftBtn) {
      dom.rotateMapLeftBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.compassMode = 'north-up';
        dom.resetCampusViewBtn?.classList.remove('heading-up-active');
        if (dom.compassModeLabel) dom.compassModeLabel.textContent = '수동회전';
        setMapBearing(state.mapBearing - 45);
      });
    }
    if (dom.rotateMapRightBtn) {
      dom.rotateMapRightBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.compassMode = 'north-up';
        dom.resetCampusViewBtn?.classList.remove('heading-up-active');
        if (dom.compassModeLabel) dom.compassModeLabel.textContent = '수동회전';
        setMapBearing(state.mapBearing + 45);
      });
    }

    // 마우스 우클릭 드래그 또는 Alt + 드래그로 360도 자유 회전
    mapContainer.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    mapContainer.addEventListener('mousedown', (e) => {
      if (e.button === 2 || e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        if (state.map && state.map.dragging) state.map.dragging.disable();
        const rect = mapContainer.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const startAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
        state.mapMouseRotateState = {
          cx,
          cy,
          startAngle,
          startBearing: state.mapBearing,
        };
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!state.mapMouseRotateState) return;
      const { cx, cy, startAngle, startBearing } = state.mapMouseRotateState;
      const curAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
      const delta = curAngle - startAngle;
      state.compassMode = 'north-up';
      if (dom.compassModeLabel) dom.compassModeLabel.textContent = `${Math.round(((startBearing + delta) % 360 + 360) % 360)}°`;
      setMapBearing(startBearing + delta);
    });

    window.addEventListener('mouseup', () => {
      if (state.mapMouseRotateState) {
        state.mapMouseRotateState = null;
        if (state.map && state.map.dragging) state.map.dragging.enable();
      }
    });

    // 스마트폰 두 손가락 비틀기(Touch Rotate) 360도 회전 지원
    mapContainer.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 2) {
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const startAngle =
            (Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180) / Math.PI;
          state.mapTouchRotateState = {
            startAngle,
            startBearing: state.mapBearing,
          };
        }
      },
      { passive: true }
    );

    mapContainer.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length === 2 && state.mapTouchRotateState) {
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const curAngle =
            (Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180) / Math.PI;
          const delta = curAngle - state.mapTouchRotateState.startAngle;
          if (Math.abs(delta) > 4) {
            state.compassMode = 'north-up';
            setMapBearing(state.mapTouchRotateState.startBearing + delta);
          }
        }
      },
      { passive: true }
    );

    mapContainer.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        state.mapTouchRotateState = null;
      }
    });
  }

  function setMapBearing(deg, opts = {}) {
    let norm = Number(deg) || 0;
    norm = ((norm % 360) + 360) % 360;
    if (norm > 180) norm -= 360;
    state.mapBearing = norm;

    const mapEl = document.getElementById('map');
    if (mapEl) {
      if (Math.abs(norm) < 0.5) {
        mapEl.classList.remove('is-rotated');
        mapEl.style.transform = '';
      } else {
        mapEl.classList.add('is-rotated');
        mapEl.style.transform = `rotate(${norm.toFixed(1)}deg) scale(1.32)`;
      }
    }

    // 모든 건물명 라벨, 마커 텍스트, 체크포인트 배지가 항상 정방향(수평)을 유지하도록 역회전 각도 주입
    document.documentElement.style.setProperty('--map-rotation', `${norm.toFixed(1)}deg`);
    document.documentElement.style.setProperty('--map-rotation-neg', `${(-norm).toFixed(1)}deg`);

    // 나침반 바늘 회전 동기화
    if (dom.compassNeedleWrap) {
      dom.compassNeedleWrap.style.transform = `rotate(${norm.toFixed(1)}deg)`;
    }
    if (!opts.fromHeadingUp && dom.compassModeLabel) {
      dom.compassModeLabel.textContent =
        Math.abs(norm) < 1 ? '북쪽고정' : `${Math.round((norm + 360) % 360)}°`;
    }
  }

  /**
   * =========================================================================
   * 8-C. [요구사항 7 핵심] GPS 기반 실시간 '실내 vs 실외' 자동 판별 및 층수 선택 모달
   * - 실제 스마트폰 GPS 좌표가 캠퍼스 내 특정 건물 폴리곤(또는 건물 내부 반경 <= 28m) 안에 속할 때만
   *   "현재 OO건물 몇 층에 계신가요?" 팝업을 띄우고, 야외(도로, 광장, 정문 등)에 있을 때는 절대 띄우지 않음!
   * =========================================================================
   */
  function initFloorSelectModal() {
    if (dom.openFloorSelectModalBtn) {
      dom.openFloorSelectModalBtn.addEventListener('click', () => {
        const nearestBld = detectBuildingContainingGps(
          state.userPosition.lat,
          state.userPosition.lng
        );
        openFloorSelectModal(nearestBld ? nearestBld.id : 'it_college');
      });
    }

    if (dom.closeFloorSelectModalBtn) {
      dom.closeFloorSelectModalBtn.addEventListener('click', () => {
        dom.floorSelectModal?.classList.add('hidden');
      });
    }

    if (dom.cancelFloorSelectBtn) {
      dom.cancelFloorSelectBtn.addEventListener('click', () => {
        dom.floorSelectModal?.classList.add('hidden');
      });
    }

    // "내 위치 기반 건물 자동 매칭: IT대학 (틀렸다면 클릭 ∨)" 배지 클릭 시 건물 직접 선택 드롭다운 토글
    if (dom.autoMatchedBuildingBanner) {
      dom.autoMatchedBuildingBanner.addEventListener('click', () => {
        if (dom.floorSelectBuildingRow) {
          dom.floorSelectBuildingRow.classList.toggle('hidden');
          if (!dom.floorSelectBuildingRow.classList.contains('hidden')) {
            dom.floorSelectBuildingDropdown?.focus();
          }
        }
      });
    }

    if (dom.floorSelectBuildingDropdown) {
      // 캠퍼스 건물 목록 채우기 (출입구 제외, 실제 건물만)
      let html = '';
      CAMPUS_BUILDINGS.filter(
        (b) => !['main_gate', 'back_gate', 'west_gate_cu'].includes(b.id)
      ).forEach((b) => {
        const sel = b.id === 'it_college' ? 'selected' : '';
        html += `<option value="${b.id}" ${sel}>${b.name} (${b.floors || '1F~5F'})</option>`;
      });
      dom.floorSelectBuildingDropdown.innerHTML = html;

      dom.floorSelectBuildingDropdown.addEventListener('change', (e) => {
        const selectedBldId = e.target.value;
        state.floorSelectState.buildingId = selectedBldId;
        const bldObj = CAMPUS_NODES[selectedBldId];
        if (dom.autoMatchedBuildingName && bldObj) {
          dom.autoMatchedBuildingName.textContent = bldObj.name;
        }
        if (dom.floorSelectModalTitle && bldObj) {
          dom.floorSelectModalTitle.textContent = `현재 ${bldObj.name} 몇 층에 계신가요?`;
        }
        renderFloorSelectModalFloors(selectedBldId, '3F');
      });
    }

    if (dom.floorSelectRoomDropdown) {
      dom.floorSelectRoomDropdown.addEventListener('change', (e) => {
        const roomId = e.target.value;
        state.floorSelectState.matchedRoomId = roomId;
        const roomNode =
          window.IT_COLLEGE_INDOOR_DATA && window.IT_COLLEGE_INDOOR_DATA.nodes[roomId];
        if (roomNode) {
          state.floorSelectState.matchedRoomNumber = roomNode.roomNumber;
          if (dom.floorSelectAutoRoomText) {
            dom.floorSelectAutoRoomText.textContent = `IT대학 ${roomNode.roomNumber} 앞`;
          }
          updateFloorSelectIntegratedPreview();
        }
      });
    }

    if (dom.confirmFloorSelectStartBtn) {
      dom.confirmFloorSelectStartBtn.addEventListener('click', async () => {
        dom.floorSelectModal?.classList.add('hidden');
        await startIntegratedIndoorToOutdoorNavigation();
      });
    }
  }

  /**
   * Ray-casting 다각형 내부 포함 여부 검사 헬퍼
   */
  function isPointInPolygon(lat, lng, polyCoords) {
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
   * [요구사항 7 핵심] 현재 GPS 위치가 캠퍼스 내 '건물 내부(실내)'에 속하는지 엄격히 판별
   * - 정문, 후문, 쪽문, 야외 도로, 광장 등 건물 밖일 때는 반드시 null을 반환하여 층수 질문 팝업이 뜨지 않게 함
   * - 건물 폴리곤 내부이거나 건물 중심점 반경 28m 이내일 때만 해당 건물 객체 반환
   */
  function detectBuildingContainingGps(lat, lng) {
    const outdoorGates = new Set(['main_gate', 'back_gate', 'west_gate_cu']);
    const actualBuildings = CAMPUS_BUILDINGS.filter((b) => !outdoorGates.has(b.id));

    // 1. 실제 건물 폴리곤(SUWON_VECTOR_MAP.buildings) 내부에 있는지 먼저 검사
    let isInsideAnyBuildingPoly = false;
    if (window.SUWON_VECTOR_MAP && Array.isArray(window.SUWON_VECTOR_MAP.buildings)) {
      for (const polyBld of window.SUWON_VECTOR_MAP.buildings) {
        if (polyBld.coords && isPointInPolygon(lat, lng, polyBld.coords)) {
          isInsideAnyBuildingPoly = true;
          break;
        }
      }
    }

    // 2. 가장 가까운 캠퍼스 건물 노드와의 거리 계산
    let closest = null;
    let minDist = Infinity;
    actualBuildings.forEach((b) => {
      const d = CampusRouter.haversineDistance(lat, lng, b.lat, b.lng);
      if (d < minDist) {
        minDist = d;
        closest = b;
      }
    });

    // 폴리곤 내부이면서 건물과 55m 이내이거나, 건물 중심 반경 28m 이내(실내 영역)일 때만 실내로 판정
    if (isInsideAnyBuildingPoly && minDist <= 55) {
      return closest;
    }
    return minDist <= 28 ? closest : null;
  }

  /**
   * 해당 건물에 실제로 존재하는 층수 목록만 추출 (예: IT대학 1층, 2층, 3층, 4층, 5층)
   */
  function getAvailableFloorsForBuilding(buildingId) {
    if (buildingId === 'it_college' && window.IT_COLLEGE_INDOOR_DATA) {
      return ['1F', '2F', '3F', '4F', '5F'];
    }
    const b = CAMPUS_NODES[buildingId];
    if (!b) return ['1F', '2F', '3F', '4F', '5F'];

    if (Array.isArray(b.floorPlans) && b.floorPlans.length > 0) {
      return b.floorPlans.map((p) => p.floor);
    }

    // floors 문자열(예: "지상 1층 ~ 5층", "지하 1층 ~ 지상 6층")에서 지상 층수 파싱
    const maxMatch = (b.floors || '').match(/(\d+)층\s*$/);
    const maxF = maxMatch ? Math.min(9, Math.max(1, parseInt(maxMatch[1], 10))) : 5;
    const list = [];
    for (let f = 1; f <= maxF; f++) {
      list.push(`${f}F`);
    }
    return list;
  }

  function openFloorSelectModal(buildingId = 'it_college', defaultFloor = '3F') {
    if (!dom.floorSelectModal) return;

    const targetBldId = CAMPUS_NODES[buildingId] ? buildingId : 'it_college';
    state.floorSelectState.buildingId = targetBldId;
    const bldObj = CAMPUS_NODES[targetBldId] || CAMPUS_NODES.it_college;

    if (dom.floorSelectModalTitle && bldObj) {
      dom.floorSelectModalTitle.textContent = `현재 ${bldObj.name} 몇 층에 계신가요?`;
    }
    if (dom.autoMatchedBuildingName && bldObj) {
      dom.autoMatchedBuildingName.textContent = bldObj.name;
    }
    if (dom.floorSelectBuildingDropdown) {
      dom.floorSelectBuildingDropdown.value = targetBldId;
    }
    if (dom.floorSelectBuildingRow) {
      dom.floorSelectBuildingRow.classList.add('hidden');
    }

    renderFloorSelectModalFloors(targetBldId, defaultFloor);
    dom.floorSelectModal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  function renderFloorSelectModalFloors(buildingId, selectedFloorId = '3F') {
    if (!dom.floorSelectButtonsGrid) return;

    const floors = getAvailableFloorsForBuilding(buildingId);
    const activeFloor = floors.includes(selectedFloorId) ? selectedFloorId : floors[0];
    state.floorSelectState.selectedFloor = activeFloor;

    dom.floorSelectButtonsGrid.innerHTML = floors
      .map((fId) => {
        const floorKo = fId.replace('F', '층');
        const isActive = fId === activeFloor;
        return `
          <button
            type="button"
            class="floor-select-chip-btn ${isActive ? 'active' : ''}"
            data-floor-id="${fId}"
          >
            <span class="fsc-num">${fId}</span>
            <span class="fsc-sub">${floorKo} 출발</span>
          </button>
        `;
      })
      .join('');

    dom.floorSelectButtonsGrid.querySelectorAll('.floor-select-chip-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const chosenFloor = btn.dataset.floorId;
        renderFloorSelectModalFloors(buildingId, chosenFloor);
        // 층수를 터치하면 즉시 GPS와 도면 인식을 통해 현위치(예: IT대학 308호 앞)를 출발점으로 하여 실내외 연속 최단 경로 안내 시작!
        dom.floorSelectModal?.classList.add('hidden');
        await startIntegratedIndoorToOutdoorNavigation();
      });
    });

    // 선택한 층의 도면 데이터와 현재 GPS 위치를 대조해 자동으로 가장 가까운 호실 매칭 (예: 3층 -> 308호)
    matchRoomForSelectedFloor(buildingId, activeFloor);
  }

  function matchRoomForSelectedFloor(buildingId, floorId) {
    const floorNum = parseInt(floorId, 10) || 3;

    if (buildingId === 'it_college' && indoorNav && indoorNav.router) {
      const matchedRoom = indoorNav.router.matchRoomByGpsAndFloor(
        state.userPosition.lat,
        state.userPosition.lng,
        floorId
      );
      const roomsOnFloor = Object.values(window.IT_COLLEGE_INDOOR_DATA.nodes)
        .filter((n) => n.type === 'classroom' && n.floor === floorId)
        .sort((a, b) => String(a.roomNumber).localeCompare(String(b.roomNumber), 'ko', { numeric: true }));

      if (matchedRoom) {
        state.floorSelectState.matchedRoomId = matchedRoom.id;
        state.floorSelectState.matchedRoomNumber = matchedRoom.roomNumber;
        if (dom.floorSelectAutoRoomText) {
          dom.floorSelectAutoRoomText.textContent = `GPS 위치 대조 결과: IT대학 ${floorId.replace('F', '층')} ${matchedRoom.name}`;
        }
      }

      if (dom.floorSelectRoomDropdown) {
        dom.floorSelectRoomDropdown.innerHTML = roomsOnFloor
          .map(
            (r) =>
              `<option value="${r.id}" ${r.id === state.floorSelectState.matchedRoomId ? 'selected' : ''}>[${r.floor}] ${r.name} (${r.dept})</option>`
          )
          .join('');
      }
    } else {
      const b = CAMPUS_NODES[buildingId];
      const defaultRoomNum = `${floorNum}01호`;
      state.floorSelectState.matchedRoomId = `room_${floorNum}01`;
      state.floorSelectState.matchedRoomNumber = defaultRoomNum;
      if (dom.floorSelectAutoRoomText) {
        dom.floorSelectAutoRoomText.textContent = `GPS 위치 대조 결과: ${b ? b.name : '건물'} ${floorNum}층 ${defaultRoomNum}`;
      }
      if (dom.floorSelectRoomDropdown) {
        const sampleRooms = [1, 2, 3, 5, 8, 10].map((n) => {
          const numStr = `${floorNum}${String(n).padStart(2, '0')}호`;
          return `<option value="room_${floorNum}${String(n).padStart(2, '0')}">${floorNum}층 ${numStr}</option>`;
        });
        dom.floorSelectRoomDropdown.innerHTML = sampleRooms.join('');
      }
    }

    updateFloorSelectIntegratedPreview();
  }

  function updateFloorSelectIntegratedPreview() {
    if (!dom.floorSelectIntegratedPreview) return;

    const bld = CAMPUS_NODES[state.floorSelectState.buildingId] || CAMPUS_NODES.it_college;
    const floorKo = (state.floorSelectState.selectedFloor || '3F').replace('F', '층');
    const roomNum = state.floorSelectState.matchedRoomNumber || '308호';

    // 목적지가 현재 출발 건물과 같다면 기본 목적지를 '정문'으로 설정하여 실내->야외 탈출 경로 예시와 일치시킴
    const outdoorDestId =
      state.selectedDestId && state.selectedDestId !== bld.id ? state.selectedDestId : 'main_gate';
    const destNode = CAMPUS_NODES[outdoorDestId] || CAMPUS_NODES.main_gate;

    let exitEntName = '1층 주출입구';
    if (bld.id === 'it_college' && indoorNav) {
      const ent = indoorNav.router.resolveEntranceForOutdoorOrigin(
        outdoorDestId,
        state.activeRoutePreference
      );
      if (ent) exitEntName = `${ent.entryFloor.replace('F', '층')} ${ent.name}`;
    }

    dom.floorSelectIntegratedPreview.innerHTML = `
      <strong>[${bld.name} ${roomNum} ➔ ${floorKo} 복도 ➔ ${floorKo} 계단/엘리베이터 ➔ ${exitEntName} ➔ 야외 도로 ➔ ${destNode.name}]</strong>
      실내외 통합 최단 경로를 한 번에 생성합니다.
    `;
  }

  /**
   * 층수·호실 선택 완료 시 [호실 ➔ 복도 ➔ 계단/엘리베이터 ➔ 1층 출입구 ➔ 야외 도로 ➔ 목적지] 통합 길안내 실행
   */
  async function startIntegratedIndoorToOutdoorNavigation() {
    const bldId = state.floorSelectState.buildingId || 'it_college';
    const bld = CAMPUS_NODES[bldId] || CAMPUS_NODES.it_college;
    const roomId = state.floorSelectState.matchedRoomId || 'room_308';
    const roomNum = state.floorSelectState.matchedRoomNumber || '308호';
    const floorKo = (state.floorSelectState.selectedFloor || '3F').replace('F', '층');

    // 목적지가 설정되어 있지 않거나 출발 건물과 같으면 '정문(main_gate)'을 목적지로 자동 지정
    const targetOutdoorDestId =
      state.selectedDestId && state.selectedDestId !== bldId ? state.selectedDestId : 'main_gate';
    const destNode = CAMPUS_NODES[targetOutdoorDestId] || CAMPUS_NODES.main_gate;

    state.startNodeId = bldId;
    state.selectedDestId = targetOutdoorDestId;
    state.customGpsCoord = null;

    if (dom.startNodeSelect) {
      dom.startNodeSelect.value = bldId;
    }

    // 1. 야외 구간 경로(출발 건물 입구 -> 목적지) 먼저 계산 및 지도에 표시
    await startRouteFindingToBuilding(targetOutdoorDestId, {
      skipFitBounds: false,
      snapStage: 2,
    });

    // 2. IT대학인 경우 2D 실내 도면을 '실내 호실 출발(exit)' 모드로 즉시 열어
    //    [308호 -> 3층 복도 -> 엘리베이터/계단 -> 1층 남동측 주출입구 -> 정문]을 한 번에 안내!
    if (bldId === 'it_college' && indoorNav) {
      const exitEnt = indoorNav.router.resolveEntranceForOutdoorOrigin(
        targetOutdoorDestId,
        state.activeRoutePreference
      );
      indoorNav.open({
        directionMode: 'exit',
        roomId,
        entranceId: exitEnt ? exitEnt.id : 'ent_1f_main',
        outdoorDestId: targetOutdoorDestId,
        outdoorDestName: destNode.name,
        routePreference: state.activeRoutePreference || 'shortest',
        speak: true,
      });
    } else {
      showToast(
        `🏢 ${bld.name} ${floorKo} ${roomNum}에서 출발하여 1층 출입구를 거쳐 ${destNode.name}까지 안내합니다.`
      );
      if (tts) {
        tts.speak(
          `${bld.name} ${floorKo} ${roomNum}에서 출발하여 복도와 엘리베이터를 이용해 1층 출입구로 이동한 뒤 야외 도로를 따라 ${destNode.name}까지 이동하세요.`,
          { interrupt: true }
        );
      }
    }
  }

  function updateTestOriginChipsActiveState() {
    if (!dom.testOriginChipsBar) return;
    dom.testOriginChipsBar.querySelectorAll('.test-origin-btn').forEach((btn) => {
      if (btn.id === 'openFloorSelectModalBtn') return;
      if (btn.id === 'pickOriginOnMapBtn') {
        btn.classList.toggle('active', Boolean(state.isPickOriginMode || state.customGpsCoord));
        return;
      }
      btn.classList.toggle(
        'active',
        !state.customGpsCoord && btn.dataset.originId === state.startNodeId
      );
    });
  }

  function setNavigationStartOrigin(originId, options = {}) {
    if (originId === '__custom__') return;
    const originNode = CAMPUS_NODES[originId];
    if (!originNode) return;

    state.startNodeId = originId;
    state.customGpsCoord = null;
    state.pendingIndoorEntranceId = null;
    state.currentOutdoorEntranceId = null;
    toggleMapPickOriginMode(false);

    if (dom.startNodeSelect) {
      const customOpt = dom.startNodeSelect.querySelector('option[value="__custom__"]');
      if (customOpt) customOpt.remove();
      dom.startNodeSelect.value = originId;
    }

    updateTestOriginChipsActiveState();

    // 내 위치 마커를 선택된 출발지 좌표로 즉시 이동
    createOrUpdateUserMarker(originNode.lat, originNode.lng, 180);

    if (state.selectedDestId && state.selectedDestId !== originId) {
      startRouteFindingToBuilding(state.selectedDestId);
    } else {
      state.map.panTo([originNode.lat, originNode.lng], { animate: true, duration: 0.45 });
    }

    if (options.announce) {
      showToast(`출발지를 [${originNode.name}]으로 변경했습니다.`);
      if (tts) {
        tts.speak(`출발지를 ${originNode.name}으로 설정했습니다.`, { interrupt: true });
      }
    }
  }

  /**
   * =========================================================================
   * 7. 상단 검색창 '스마트 키워드 검색' (축약어·영문·숫자 호실/층수 자동 조합 파서)
   * - 예: 'it 310', 'it310', '아이티 310', '아이티 308', '경상 201', '미래 102', '본관'
   * - 대소문자·띄어쓰기 무시, 접미사(~대학, ~관, ~동, ~호, ~층) 생략 허용
   * - 건물 키워드 + 숫자 3자리 입력 시 첫 번째 숫자를 층수(3층, 2층, 1층)로 자동 인식해 즉시 매칭
   * =========================================================================
   */
  const BUILDING_SMART_ALIASES = {
    it_college: ['it', 'it대', 'it대학', '아이티', '아이티대', '아이티대학', '지능형', '지능형sw', 'sw', '소프트웨어', '컴공', '컴퓨터', '정보보호', '데이터과학'],
    global_business: ['경상', '경상관', '글로벌경상', '글로벌경상관', '경상대', '경영', '경제', '회계', '호텔'],
    future_innovation: ['미래', '미래관', '미래혁신', '미래혁신관', '혁신관', '디자인', '전자', '기계'],
    main_building: ['본관', '대학본관', '본부', '총장실', '교무처'],
    central_library: ['중도', '도서관', '중앙도서관', '열람실'],
    student_union: ['학회관', '학생회관', '학식', '학생식당'],
    engineering_1: ['1공학', '제1공학', '제1공학관', '1공대', '공대1', '건축', '토목'],
    engineering_2: ['2공학', '제2공학', '제2공학관', '2공대', '공대2', '산공', '도시'],
    innovation_eng: ['혁신공학', '혁신공과', '혁신공과대학', '4공학', '제4공학'],
    humanities: ['인문', '인문대', '인문사회', '인문사회대학', '법정', '법대', '행정'],
    natural_science: ['자과', '자과대', '자연', '자연대', '자연과학', '자연과학대학'],
    global_talent: ['글로벌', '글로벌인재', '글로벌인재대학', '외국어'],
    amaranth_hall: ['복지관', '아마랜스', '아마랜스홀', '아마란스', '아마란스홀', '문화예술'],
    dormitory: ['기숙사', '고운학사', '생활관'],
    fine_arts: ['미대', '미술', '미술대학', '조형', '조형관'],
    music_college: ['음대', '음악', '음악대학', '벨칸토'],
    physical_edu: ['체대', '체육', '체육대학', '무용'],
    ace_edu: ['ace', '에이스', '교양', '교양학관', 'ace교육관'],
    advanced_science: ['고운첨단', '첨단과학', '연구원', '고운첨단과학기술연구원'],
  };

  /**
   * 검색어에서 불필요한 접미사(~대학교, ~대학, ~관, ~동, ~호, ~층, ~실)를 제거하여 핵심 토큰 추출
   */
  function stripKoreanBuildingSuffixes(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/(대학교|대학|학관|연구관|교육관|회관|도서관|관|동|홀|호실|강의실|호|층|실)$/g, '');
  }

  /**
   * 스마트 검색 파서: 건물 축약어 + 호실/층수 숫자 조합을 자동 분석
   */
  function parseSmartSearchQuery(rawQuery) {
    const trimmed = String(rawQuery || '').trim();
    if (!trimmed) return { hasRoomNumber: false, matchedBuildingId: null };

    const lower = trimmed.toLowerCase();
    const compact = lower.replace(/\s+/g, '');

    // 패턴 1: [건물 키워드(선택)] + [숫자 3자리(예: 310, 308, 201, 102)] + [호/층(선택)]
    const comboMatch = compact.match(/^([a-z가-힣]*?)([1-9]\d{2})(?:호|층|실|강의실)?$/);
    if (comboMatch) {
      const rawPrefix = comboMatch[1];
      const roomDigits = comboMatch[2];
      const floorNum = parseInt(roomDigits.charAt(0), 10);
      const floorId = `${floorNum}F`;

      let matchedBuildingId = null;
      if (!rawPrefix) {
        // 숫자만 입력한 경우(예: "310", "308", "203") 기본으로 IT대학 호실 우선 매칭
        matchedBuildingId = 'it_college';
      } else {
        const cleanPrefix = stripKoreanBuildingSuffixes(rawPrefix) || rawPrefix;
        for (const [bldId, aliases] of Object.entries(BUILDING_SMART_ALIASES)) {
          if (
            aliases.some(
              (a) =>
                a === rawPrefix ||
                a === cleanPrefix ||
                a.startsWith(cleanPrefix) ||
                cleanPrefix.startsWith(a)
            )
          ) {
            matchedBuildingId = bldId;
            break;
          }
        }
        if (!matchedBuildingId) {
          const foundBld = CAMPUS_BUILDINGS.find((b) => {
            const bClean = stripKoreanBuildingSuffixes(b.name);
            return bClean.includes(cleanPrefix) || cleanPrefix.includes(bClean);
          });
          if (foundBld) matchedBuildingId = foundBld.id;
        }
      }

      return {
        hasRoomNumber: true,
        matchedBuildingId: matchedBuildingId || 'it_college',
        roomDigits,
        roomNumber: `${roomDigits}호`,
        floorNum,
        floorId,
      };
    }

    // 패턴 2: 건물 축약어만 입력한 경우 (예: "it", "아이티", "경상", "미래", "본관", "중도")
    const cleanQuery = stripKoreanBuildingSuffixes(compact) || compact;
    let matchedBuildingId = null;
    for (const [bldId, aliases] of Object.entries(BUILDING_SMART_ALIASES)) {
      if (aliases.some((a) => a === compact || a === cleanQuery || a.startsWith(cleanQuery))) {
        matchedBuildingId = bldId;
        break;
      }
    }

    return {
      hasRoomNumber: false,
      matchedBuildingId,
      cleanQuery,
    };
  }

  function initSearchAndCategories() {
    dom.startNodeSelect.innerHTML = '';

    const priorityOrigins = ['main_gate', 'back_gate', 'west_gate_cu'];
    const priorityGroup = document.createElement('optgroup');
    priorityGroup.label = '캠퍼스 주요 출입구 (테스트 프리셋)';

    priorityOrigins.forEach((id) => {
      const b = CAMPUS_NODES[id];
      if (!b) return;
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = `${b.name} (${b.category || '출입구'})`;
      priorityGroup.appendChild(opt);
    });
    dom.startNodeSelect.appendChild(priorityGroup);

    const buildingsGroup = document.createElement('optgroup');
    buildingsGroup.label = '캠퍼스 주요 건물';
    CAMPUS_BUILDINGS.filter((b) => !priorityOrigins.includes(b.id)).forEach((b) => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.name;
      buildingsGroup.appendChild(opt);
    });
    dom.startNodeSelect.appendChild(buildingsGroup);
    dom.startNodeSelect.value = state.startNodeId;

    // 길찾기 바텀 시트 내 빠른 출발지 프리셋 칩 및 지도 클릭 출발지 지정 이벤트 바인딩
    if (dom.testOriginChipsBar) {
      dom.testOriginChipsBar.querySelectorAll('.test-origin-btn').forEach((btn) => {
        if (btn.id === 'openFloorSelectModalBtn' || btn.id === 'pickOriginOnMapBtn') return;
        btn.addEventListener('click', () => {
          setNavigationStartOrigin(btn.dataset.originId, { announce: true });
        });
      });
      updateTestOriginChipsActiveState();
    }

    if (dom.pickOriginOnMapBtn) {
      dom.pickOriginOnMapBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMapPickOriginMode();
      });
    }
    if (dom.floatingPickOriginBtn) {
      dom.floatingPickOriginBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMapPickOriginMode();
      });
    }

    // 빠른 건물 칩 생성 (실내 길안내 및 주요 출입구 프리셋 포함)
    dom.quickBuildingChips.innerHTML = '';

    const createFeaturedChip = (label, onClick, customClass = '') => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `building-chip ${customClass}`.trim();
      chip.innerHTML = label;
      chip.addEventListener('click', onClick);
      dom.quickBuildingChips.appendChild(chip);
    };

    createFeaturedChip('🎯 IT대학 310호 (실내길안내)', () => {
      hideAutocomplete();
      openITCollegeIndoorNavigation({ roomId: 'room_310', speak: true });
    }, 'indoor-featured-chip');

    createFeaturedChip('🎯 IT대학 308호 (실내길안내)', () => {
      hideAutocomplete();
      openITCollegeIndoorNavigation({ roomId: 'room_308', speak: true });
    }, 'indoor-featured-chip');

    createFeaturedChip('🎯 IT대학 203호 (실내길안내)', () => {
      hideAutocomplete();
      openITCollegeIndoorNavigation({ roomId: 'room_203', speak: true });
    }, 'indoor-featured-chip');

    createFeaturedChip('🚪 후문 (출발지 설정)', () => {
      hideAutocomplete();
      setNavigationStartOrigin('back_gate', { announce: true });
    }, 'origin-preset-chip');

    createFeaturedChip('🏪 경상관 CU 쪽문 (출발지)', () => {
      hideAutocomplete();
      setNavigationStartOrigin('west_gate_cu', { announce: true });
    }, 'origin-preset-chip');

    CAMPUS_BUILDINGS.forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'building-chip';
      btn.dataset.buildingId = b.id;
      btn.textContent = b.name;
      btn.addEventListener('click', () => {
        hideAutocomplete();
        openBuildingDetailView(b.id);
      });
      dom.quickBuildingChips.appendChild(btn);
    });

    // 상단 3대 카테고리 알약 탭 ([건물] [식당·카페] [편의시설])
    document.querySelectorAll('.cat-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.cat-pill').forEach((p) => {
          p.classList.remove('active');
          p.setAttribute('aria-selected', 'false');
        });
        pill.classList.add('active');
        pill.setAttribute('aria-selected', 'true');

        state.activeCategory = pill.dataset.category || 'building';
        renderBuildingMarkers();
        renderExploreView();
        if (state.activeSheetView !== 'explore') {
          switchSheetView('explore');
        }
      });
    });

    // 검색 입력 및 포커스
    dom.searchInput.addEventListener('focus', () => {
      renderAutocompleteList(dom.searchInput.value.trim());
    });

    dom.searchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      dom.clearSearchBtn.classList.toggle('hidden', q.length === 0);
      renderAutocompleteList(q);
    });

    dom.searchInput.addEventListener('keydown', (e) => {
      const items = dom.autocompleteList.querySelectorAll('.autocomplete-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.focusedAutocompleteIndex = Math.min(
          items.length - 1,
          state.focusedAutocompleteIndex + 1
        );
        highlightAutocompleteItem(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.focusedAutocompleteIndex = Math.max(
          0,
          state.focusedAutocompleteIndex - 1
        );
        highlightAutocompleteItem(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const targetItem =
          state.focusedAutocompleteIndex >= 0
            ? items[state.focusedAutocompleteIndex]
            : items[0];
        if (targetItem) {
          targetItem.click();
        }
      } else if (e.key === 'Escape') {
        hideAutocomplete();
      }
    });

    dom.searchSubmitBtn.addEventListener('click', () => {
      const items = dom.autocompleteList.querySelectorAll('.autocomplete-item');
      if (items.length > 0) {
        items[0].click();
      } else {
        dom.searchInput.focus();
      }
    });

    dom.clearSearchBtn.addEventListener('click', () => {
      dom.searchInput.value = '';
      dom.clearSearchBtn.classList.add('hidden');
      state.highlightedBuildingIds.clear();
      refreshBuildingMarkersStyle();
      dom.searchInput.focus();
      renderAutocompleteList('');
    });

    // 출발지 변경 시 경로 즉시 재탐색 및 마커·칩 동기화
    dom.startNodeSelect.addEventListener('change', (e) => {
      setNavigationStartOrigin(e.target.value, { announce: true });
    });
  }

  function renderAutocompleteList(query) {
    const normalized = query.toLowerCase().replace(/\s+/g, ' ').trim();
    const compactQuery = normalized.replace(/\s+/g, '');
    const smartParsed = parseSmartSearchQuery(query);

    let matchedIndoorRooms = [];
    let smartOtherBuildingRooms = [];

    // 1) 스마트 파서가 [건물 + 호실 숫자 3자리] (예: 'it 310', 'it310', '아이티 310', '경상 201', '미래 102')를 감지한 경우
    if (smartParsed.hasRoomNumber) {
      if (smartParsed.matchedBuildingId === 'it_college' && indoorNav && indoorNav.router) {
        const ensuredRoom = indoorNav.router.ensureDynamicRoomNode(smartParsed.roomDigits);
        if (ensuredRoom) {
          matchedIndoorRooms.push({ room: ensuredRoom, score: 500 });
        }
      } else if (smartParsed.matchedBuildingId && CAMPUS_NODES[smartParsed.matchedBuildingId]) {
        const bld = CAMPUS_NODES[smartParsed.matchedBuildingId];
        smartOtherBuildingRooms.push({
          building: bld,
          roomNumber: smartParsed.roomNumber,
          floorNum: smartParsed.floorNum,
          floorId: smartParsed.floorId,
          score: 480,
        });
      }
    }

    // 2) IT대학 실내 강의실 목록 검색 매칭
    if (window.IT_COLLEGE_INDOOR_DATA && window.IT_COLLEGE_INDOOR_DATA.nodes) {
      const allRooms = Object.values(window.IT_COLLEGE_INDOOR_DATA.nodes).filter(
        (n) => n.type === 'classroom'
      );

      if (!normalized) {
        matchedIndoorRooms = allRooms
          .filter((r) => ['room_310', 'room_308', 'room_203', 'room_101'].includes(r.id))
          .map((r) => ({
            room: r,
            score: r.id === 'room_310' ? 220 : r.id === 'room_308' ? 210 : 190,
          }));
      } else {
        allRooms.forEach((r) => {
          if (matchedIndoorRooms.some((m) => m.room.id === r.id)) return;
          const fullText = `it대학 아이티대학 아이티 it ${r.roomNumber} ${r.name} ${r.dept} ${(r.aliases || []).join(' ')}`.toLowerCase();
          const compactFull = fullText.replace(/\s+/g, '');
          const roomDigitsOnly = (r.roomNumber || '').replace(/\D/g, '');
          const queryDigitsOnly = compactQuery.replace(/\D/g, '');

          let score = 0;
          if (
            compactFull.includes(compactQuery) ||
            fullText.includes(normalized) ||
            (queryDigitsOnly.length >= 2 &&
              roomDigitsOnly.startsWith(queryDigitsOnly) &&
              (!smartParsed.matchedBuildingId || smartParsed.matchedBuildingId === 'it_college'))
          ) {
            score = 150;
            if (queryDigitsOnly && roomDigitsOnly === queryDigitsOnly) {
              score = 320;
            }
          }
          if (score > 0) {
            matchedIndoorRooms.push({ room: r, score });
          }
        });
        matchedIndoorRooms.sort((a, b) => b.score - a.score);
        matchedIndoorRooms = matchedIndoorRooms.slice(0, 6);
      }
    }

    // 3) 야외 캠퍼스 건물 스마트 검색 매칭 (축약어·접미사 생략 포함)
    const cleanSearchToken = stripKoreanBuildingSuffixes(compactQuery);
    const results = CAMPUS_BUILDINGS.map((b) => {
      const dist = Math.round(
        CampusRouter.haversineDistance(
          state.userPosition.lat,
          state.userPosition.lng,
          b.lat,
          b.lng
        )
      );
      const bNameLower = b.name.toLowerCase().replace(/\s+/g, '');
      const bFullLower = (b.fullName || '').toLowerCase().replace(/\s+/g, '');
      const bClean = stripKoreanBuildingSuffixes(b.name);
      const aliases = BUILDING_SMART_ALIASES[b.id] || [];

      const matchExactSmart = smartParsed.matchedBuildingId === b.id;
      const matchAlias =
        compactQuery.length > 0 &&
        aliases.some(
          (a) =>
            a === compactQuery ||
            a === cleanSearchToken ||
            a.includes(cleanSearchToken) ||
            cleanSearchToken.includes(a)
        );
      const matchName =
        bNameLower.includes(compactQuery) ||
        bFullLower.includes(compactQuery) ||
        (cleanSearchToken.length >= 2 && bClean.includes(cleanSearchToken));
      const matchKeyword = (b.keywords || []).some((k) =>
        k.toLowerCase().replace(/\s+/g, '').includes(compactQuery)
      );
      const matchRoom = (b.rooms || []).some((r) =>
        r.toLowerCase().replace(/\s+/g, '').includes(compactQuery)
      );

      let score = 0;
      if (!normalized) score = 10;
      else if (matchExactSmart) score = 350;
      else if (bNameLower.startsWith(compactQuery) || bClean === cleanSearchToken) score = 200;
      else if (matchAlias) score = 175;
      else if (matchName) score = 130;
      else if (matchRoom) score = 110;
      else if (matchKeyword) score = 85;

      return { building: b, dist, score };
    })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.dist - b.dist);

    // 검색 중일 때 매칭된 상위 건물의 마커만 지도에서 강조 표시
    state.highlightedBuildingIds.clear();
    if (normalized) {
      if (matchedIndoorRooms.length > 0) state.highlightedBuildingIds.add('it_college');
      smartOtherBuildingRooms.forEach((item) => state.highlightedBuildingIds.add(item.building.id));
      results.slice(0, 2).forEach((item) => state.highlightedBuildingIds.add(item.building.id));
      refreshBuildingMarkersStyle();
    }

    const totalCount =
      matchedIndoorRooms.length + smartOtherBuildingRooms.length + results.length;
    dom.dropdownHeaderTitle.textContent = normalized
      ? `'${query}' 스마트 검색 결과 (${totalCount}건)`
      : '수원대학교 주요 건물 · IT대학 실내 강의실 추천';

    dom.autocompleteList.innerHTML = '';
    state.focusedAutocompleteIndex = -1;

    // A) IT대학 실내 강의실 매칭 결과 (예: it 310 -> IT대학 3층 310호)
    matchedIndoorRooms.forEach(({ room }) => {
      const li = document.createElement('li');
      li.className = 'autocomplete-item indoor-room-ac-item';
      li.dataset.indoorRoomId = room.id;
      const floorKo = room.floor.replace('F', '층');
      li.innerHTML = `
        <div class="ac-left">
          <div class="ac-icon-circle indoor-room-icon">${room.floor}</div>
          <div class="ac-text-wrap">
            <div class="ac-title-row">
              <span class="ac-name">IT대학 ${floorKo} ${room.name}</span>
              <span class="ac-category indoor-badge-cat">2D 실내도면 · ${floorKo} 자동인식</span>
            </div>
            <div class="ac-desc">${room.dept || 'IT대학 강의실'} · 복도 직각(ㄱ/ㄴ) 최단경로 안내</div>
          </div>
        </div>
        <div class="ac-right">
          <span class="ac-dist">IT대학 ${floorKo}</span>
          <span class="ac-go-tag indoor-go-tag">실내 안내 &rarr;</span>
        </div>
      `;
      li.addEventListener('click', () => {
        dom.searchInput.value = `IT대학 ${room.roomNumber}`;
        dom.clearSearchBtn.classList.remove('hidden');
        state.highlightedBuildingIds.clear();
        state.highlightedBuildingIds.add('it_college');
        hideAutocomplete();
        openITCollegeIndoorNavigation({ roomId: room.id, speak: true });
      });
      dom.autocompleteList.appendChild(li);
    });

    // B) 타 단과대 건물 + 호실 번호 조합 매칭 결과 (예: '경상 201' -> 글로벌경상관 2층 201호, '미래 102' -> 미래혁신관 1층 102호)
    smartOtherBuildingRooms.forEach(({ building, roomNumber, floorNum }) => {
      const li = document.createElement('li');
      li.className = 'autocomplete-item indoor-room-ac-item';
      li.dataset.buildingId = building.id;
      li.innerHTML = `
        <div class="ac-left">
          <div class="ac-icon-circle indoor-room-icon">${floorNum}F</div>
          <div class="ac-text-wrap">
            <div class="ac-title-row">
              <span class="ac-name">${building.name} ${floorNum}층 ${roomNumber}</span>
              <span class="ac-category indoor-badge-cat">${floorNum}층 호실 자동인식</span>
            </div>
            <div class="ac-desc">${building.fullName} · ${building.name} 입구까지 최단 경로 및 ${floorNum}층 안내</div>
          </div>
        </div>
        <div class="ac-right">
          <span class="ac-dist">${floorNum}층 ${roomNumber}</span>
          <span class="ac-go-tag indoor-go-tag">바로 길찾기 &rarr;</span>
        </div>
      `;
      li.addEventListener('click', async () => {
        dom.searchInput.value = `${building.name} ${roomNumber}`;
        dom.clearSearchBtn.classList.remove('hidden');
        state.highlightedBuildingIds.clear();
        state.highlightedBuildingIds.add(building.id);
        hideAutocomplete();
        await startRouteFindingToBuilding(building.id);
        showToast(`🎯 ${building.name} ${floorNum}층 ${roomNumber} 목적지로 경로를 안내합니다.`);
        if (tts) {
          tts.speak(
            `${building.name} ${floorNum}층 ${roomNumber}까지 보행자 최단 경로를 안내합니다.`,
            { interrupt: true }
          );
        }
      });
      dom.autocompleteList.appendChild(li);
    });

    // C) 일반 캠퍼스 건물 매칭 결과
    results.forEach(({ building, dist }) => {
      const li = document.createElement('li');
      li.className = 'autocomplete-item';
      li.dataset.buildingId = building.id;
      li.innerHTML = `
        <div class="ac-left">
          <div class="ac-icon-circle">${building.name.charAt(0)}</div>
          <div class="ac-text-wrap">
            <div class="ac-title-row">
              <span class="ac-name">${building.fullName}</span>
              <span class="ac-category">${building.category}</span>
            </div>
            <div class="ac-desc">${(building.rooms || building.facilities || []).slice(0, 3).join(' · ')}</div>
          </div>
        </div>
        <div class="ac-right">
          <span class="ac-dist">약 ${dist}m</span>
          <span class="ac-go-tag">선택 &rarr;</span>
        </div>
      `;
      li.addEventListener('click', () => {
        dom.searchInput.value = building.name;
        dom.clearSearchBtn.classList.remove('hidden');
        state.highlightedBuildingIds.clear();
        state.highlightedBuildingIds.add(building.id);
        hideAutocomplete();
        openBuildingDetailView(building.id);
      });
      dom.autocompleteList.appendChild(li);
    });

    dom.autocompleteDropdown.classList.remove('hidden');
  }

  function highlightAutocompleteItem(items) {
    items.forEach((el, idx) => {
      el.classList.toggle('focused', idx === state.focusedAutocompleteIndex);
    });
  }

  function hideAutocomplete() {
    dom.autocompleteDropdown.classList.add('hidden');
    state.focusedAutocompleteIndex = -1;
  }

  function updateQuickChipsActiveState() {
    dom.quickBuildingChips.querySelectorAll('.building-chip').forEach((chip) => {
      chip.classList.toggle(
        'active',
        chip.dataset.buildingId === state.selectedDestId
      );
    });
  }

  /**
   * 8. 음성 길안내(TTS) 및 가상 이동 시뮬레이션 & 모바일 GPS 초기화
   */
  function initVoiceAndSimulation() {
    tts = new VoiceGuideManager({
      onSpeakStart: (logItem) => {
        if (logItem.isSystemNotice) return;
        state.lastSpokenText = logItem.text;
        updateVoiceHud(logItem);
      },
      onSpeakEnd: () => {},
      onStateChange: (enabled) => {
        dom.ttsToggleBtn.classList.toggle('active', enabled);
        dom.ttsToggleBtn.classList.toggle('muted', !enabled);
        dom.ttsStatusBadge.textContent = enabled ? 'ON' : 'OFF';
        setLucideIcon(
          dom.ttsToggleIconWrap,
          enabled ? 'volume-2' : 'volume-x'
        );
        showToast(
          enabled
            ? '음성 길안내(TTS)가 켜졌습니다.'
            : '음성 길안내(TTS)가 꺼졌습니다.'
        );
      },
    });

    simulator = new RouteSimulator({
      onSimulationStart: (route) => {
        dom.simProgressPanel.classList.remove('hidden');
        dom.indoorTransitionBanner.classList.add('hidden');
        dom.simStatusText.textContent = `${route.destinationName} 입구로 이동 중...`;
        dom.startNavBtnText.textContent = '안내 진행 중';
        dom.startNavBtn.classList.add('active-nav');
      },

      onPositionUpdate: (pos) => {
        createOrUpdateUserMarker(pos.lat, pos.lng, pos.bearing);

        dom.simProgressBar.style.width = `${pos.progress}%`;
        dom.simTraveledDist.textContent = `${pos.traveledDist}m`;
        dom.simRemainingDist.textContent = `${pos.remainingDist}m`;
        dom.simProgressPercent.textContent = `${pos.progress}%`;
        dom.sheetEstTime.textContent =
          pos.remainingMinutes > 0 ? `약 ${pos.remainingMinutes}분` : '곧 도착';

        // 이동에 따라 이미 지나온 파란색 경로선과 화살표를 실시간으로 지움!
        updateRemainingRouteOnMap(pos.lat, pos.lng, {
          allowReroute: false,
          exactSegIdx: pos.currentSegmentIndex,
          exactTraveledDist: pos.traveledDist,
        });

        if (!state.map.getBounds().pad(-0.22).contains([pos.lat, pos.lng])) {
          state.map.panTo([pos.lat, pos.lng], { animate: true, duration: 0.35 });
        }
      },

      onCheckpointReached: (cp, index) => {
        if (state.currentRoute) {
          renderCheckpointTimeline(state.currentRoute.checkpoints, index);
          const activeEl = dom.checkpointTimeline.querySelector(
            `.checkpoint-item[data-index="${index}"]`
          );
          if (activeEl) {
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }

        tts.speak(cp.voiceText, {
          checkpointType: cp.type,
          turnType: cp.turnType,
          title: cp.title,
        });
      },

      onSimulationComplete: (route) => {
        dom.simStatusText.textContent = `${route.destinationName} 입구 도착 완료!`;
        dom.sheetEstTime.textContent = '도착 완료';
        dom.startNavBtnText.textContent = '안내 다시 시작';
        dom.startNavBtn.classList.remove('active-nav');
        updateSnap1MiniBarMetrics(0, 0, 100);

        dom.indoorTransitionBanner.classList.remove('hidden');
        if (
          (route.endNodeId === 'it_college' || route.destinationId === 'it_college') &&
          indoorNav
        ) {
          const entId =
            route.destinationEntranceId ||
            state.currentOutdoorEntranceId ||
            state.pendingIndoorEntranceId;
          const resolvedEnt = entId
            ? indoorNav.getEntranceById(entId)
            : indoorNav.router.resolveEntranceForOutdoorOrigin(
                state.startNodeId,
                route.routePreference || state.activeRoutePreference
              );
          const roomNode =
            window.IT_COLLEGE_INDOOR_DATA &&
            window.IT_COLLEGE_INDOOR_DATA.nodes[state.pendingIndoorRoomId || 'room_203'];
          const roomLabel = roomNode ? roomNode.roomNumber : '203호';
          dom.indoorBannerSub.textContent = resolvedEnt
            ? `IT대학 ${resolvedEnt.name}(${resolvedEnt.entryFloor} 진입)에 도착했습니다! 버튼을 눌러 ${roomLabel} 2D 실내 길안내로 전환하세요.`
            : `IT대학 입구에 도착했습니다! 2D 실내 도면(${roomLabel}) 안내로 전환할 수 있습니다.`;
        } else {
          dom.indoorBannerSub.textContent = `${route.destinationName} 실내 평면도(${
            (route.destinationBuilding && route.destinationBuilding.floors) || '실내 도면'
          })로 전환할 수 있습니다.`;
        }
      },

      onStateChange: (simState) => {
        const isRunning = simState === 'running';
        dom.floatingSimBtn.classList.toggle('running', isRunning);
        dom.sheetSimBtn.classList.toggle('running', isRunning);
        setLucideIcon(
          dom.floatingSimIconWrap,
          isRunning ? 'pause-circle' : 'play-circle'
        );

        dom.floatingSimLabel.textContent = isRunning ? '일시정지' : '시뮬레이션';
        dom.sheetSimBtnText.textContent = isRunning
          ? '일시정지'
          : simState === 'paused'
          ? '이동 계속하기'
          : '가상 이동 시뮬레이션';
      },
    });
  }

  function initGpsTracker() {
    gpsTracker = new MobileGpsTracker({
      onLocationUpdate: (gpsData) => {
        if (simulator && simulator.state === 'running') return;

        // 캠퍼스 바운더리 내부에 실제로 있을 때만 내 위치 마커를 실제 GPS로 이동
        const campusBounds = L.latLngBounds(SUWON_CAMPUS_CONFIG.maxBounds);
        if (campusBounds.contains([gpsData.lat, gpsData.lng])) {
          createOrUpdateUserMarker(
            gpsData.lat,
            gpsData.lng,
            gpsData.heading,
            gpsData.accuracy
          );
          if (state.gpsFollowMode) {
            state.map.panTo([gpsData.lat, gpsData.lng], { animate: true, duration: 0.4 });
          }
          if (state.isNavigating && state.currentRoute) {
            // 실시간 지나온 길 삭제 + 경로 이탈(>=28m) 시 자동 재탐색 수행
            updateRemainingRouteOnMap(gpsData.lat, gpsData.lng, { allowReroute: true });
            handleRealWalkingGeofence(gpsData);
          }
        }
      },
      onHeadingUpdate: (heading) => {
        if (simulator && simulator.state === 'running') return;
        createOrUpdateUserMarker(
          state.userPosition.lat,
          state.userPosition.lng,
          heading
        );
      },
    });

    gpsTracker.start();
  }

  function handleRealWalkingGeofence(gpsData) {
    const route = state.currentRoute;
    if (!route || !route.checkpoints) return;

    const checkpoints = route.checkpoints;
    const destCp = checkpoints[checkpoints.length - 1];
    const distToDest = CampusRouter.haversineDistance(
      gpsData.lat,
      gpsData.lng,
      destCp.lat,
      destCp.lng
    );

    if (distToDest <= 18 && !state.triggeredGpsCheckpoints.has(destCp.id)) {
      state.triggeredGpsCheckpoints.add(destCp.id);
      renderCheckpointTimeline(checkpoints, checkpoints.length - 1);
      tts.speak(destCp.voiceText, { turnType: 'arrive' });
      dom.indoorTransitionBanner.classList.remove('hidden');
      state.isNavigating = false;
      return;
    }

    for (let i = 1; i < checkpoints.length - 1; i++) {
      const cp = checkpoints[i];
      if (state.triggeredGpsCheckpoints.has(cp.id)) continue;
      const dist = CampusRouter.haversineDistance(
        gpsData.lat,
        gpsData.lng,
        cp.lat,
        cp.lng
      );
      if (dist <= 45) {
        state.triggeredGpsCheckpoints.add(cp.id);
        renderCheckpointTimeline(checkpoints, i);
        tts.speak(cp.voiceText, { turnType: cp.turnType });
        break;
      }
    }
  }

  // 상단 파란색 음성 배너 UI 제거 요구사항 반영 (음성 TTS 소리는 그대로 유지)
  function updateVoiceHud() {
    // UI 배너를 표시하지 않음
  }

  /**
   * 9. 버튼 및 UI 인터랙션 이벤트 바인딩
   */
  function bindControlEvents() {
    // USW 로고 클릭 시 캠퍼스 중심 복귀
    const resetToCampusCenter = () => {
      setMapBearing(0);
      state.map.setView(
        SUWON_CAMPUS_CONFIG.center,
        SUWON_CAMPUS_CONFIG.defaultZoom,
        { animate: true }
      );
      showToast('수원대학교 캠퍼스 중심으로 이동했습니다.');
    };
    dom.uswBrandBtn.addEventListener('click', resetToCampusCenter);

    // State 02 (건물 상세 시트) 내 버튼들: [실내 보기] / [길찾기] / [북마크] / [닫기]
    dom.openFloorPlanBtn.addEventListener('click', () => {
      openIndoorFloorPlanModal(state.selectedDestId);
    });

    dom.goRouteViewBtn.addEventListener('click', () => {
      startRouteFindingToBuilding(state.selectedDestId || 'future_innovation');
    });

    dom.bookmarkBuildingBtn.addEventListener('click', () => {
      const id = state.selectedDestId;
      if (!id) return;
      if (state.savedBuildingIds.has(id)) {
        state.savedBuildingIds.delete(id);
        dom.bookmarkBuildingBtn.classList.remove('saved');
        showToast('저장 목록에서 해제되었습니다.');
      } else {
        state.savedBuildingIds.add(id);
        dom.bookmarkBuildingBtn.classList.add('saved');
        showToast('저장한 장소에 추가되었습니다.');
      }
    });

    dom.closeDetailSheetBtn.addEventListener('click', () => {
      state.selectedDestId = null;
      state.highlightedBuildingIds.clear();
      refreshBuildingMarkersStyle();
      switchSheetView('explore');
    });

    // 안내 종료 / 취소 버튼들 (중간에 언제든 길안내 취소 가능)
    if (dom.closeSheetBtn) {
      dom.closeSheetBtn.addEventListener('click', () => {
        cancelAllNavigation();
      });
    }
    if (dom.stopNavBtn) {
      dom.stopNavBtn.addEventListener('click', () => {
        cancelAllNavigation();
      });
    }
    if (dom.simCancelBtn) {
      dom.simCancelBtn.addEventListener('click', () => {
        cancelAllNavigation();
      });
    }

    // [안내 시작] 버튼: 실제 스마트폰 GPS 위치에서 출발 & '실내 vs 실외' 자동 판별
    dom.startNavBtn.addEventListener('click', async () => {
      if (simulator && simulator.state !== 'idle') {
        simulator.stop();
      }
      if (state.isPickingOriginOnMap) {
        toggleMapPickOriginMode(false);
      }

      if (gpsTracker) {
        gpsTracker.start();
      }
      state.gpsFollowMode = true;

      // 1) 스마트폰 실제 GPS 좌표 획득 시도
      const acquireRealGpsPosition = () =>
        new Promise((resolve) => {
          if (!('geolocation' in navigator)) {
            resolve(null);
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              resolve({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy || 15,
                heading:
                  typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading)
                    ? pos.coords.heading
                    : state.userPosition.heading || 180,
              });
            },
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 2500, maximumAge: 5000 }
          );
        });

      const liveGps = await acquireRealGpsPosition();
      const campusBounds = L.latLngBounds(SUWON_CAMPUS_CONFIG.maxBounds);

      let realLat = state.userPosition.lat;
      let realLng = state.userPosition.lng;
      let realHeading = state.userPosition.heading || 180;
      let realAccuracy = 14;

      if (liveGps && campusBounds.contains([liveGps.lat, liveGps.lng])) {
        realLat = liveGps.lat;
        realLng = liveGps.lng;
        realHeading = liveGps.heading;
        realAccuracy = liveGps.accuracy;
      }

      createOrUpdateUserMarker(realLat, realLng, realHeading, realAccuracy);

      // 2) 현재 GPS 좌표가 캠퍼스 내 건물 폴리곤(실내)에 속하는지 엄격 판별
      const indoorBuilding = detectBuildingContainingGps(realLat, realLng);

      if (indoorBuilding) {
        // [실내일 때] "현재 OO건물 몇 층에 계신가요?" 팝업을 띄우고 선택된 층 도면에서 안내 시작
        openFloorSelectModal(indoorBuilding.id, '3F');
        return;
      }

      // [야외일 때] 절대 층수 팝업을 띄우지 않고 즉시 현재 야외 GPS 위치에서부터 목적지까지 바로 안내 시작!
      state.customGpsCoord = {
        lat: realLat,
        lng: realLng,
        name: `내 현재 위치 (GPS ${realLat.toFixed(5)}, ${realLng.toFixed(5)})`,
      };
      updateTestOriginChipsActiveState('__gps_live__');

      await startRouteFindingToBuilding(state.selectedDestId || 'it_college', {
        snapStage: 1,
      });

      const route = state.currentRoute;
      if (!route) return;

      const startCoord = route.coordinates[0];
      const firstBearing = route.segments[0] ? route.segments[0].bearing : realHeading;
      createOrUpdateUserMarker(startCoord[0], startCoord[1], firstBearing, realAccuracy);
      state.map.setView(startCoord, 18, { animate: true });

      const startCp = route.checkpoints[0];
      renderCheckpointTimeline(route.checkpoints, 0);
      tts.speak(startCp.voiceText, { turnType: 'start' });

      state.isNavigating = true;
      state.triggeredGpsCheckpoints.clear();
      state.triggeredGpsCheckpoints.add(startCp.id);
      dom.startNavBtnText.textContent = '실시간 GPS 안내 중';
      dom.startNavBtn.classList.add('active-nav');
      showToast(
        `📍 현재 야외 GPS 위치에서 ${route.destinationName}까지 실시간 길안내를 시작합니다.`
      );

      // 안내 시작 시 바텀 시트를 네이버 지도 1단계(최소화 한 줄 모드)로 스냅
      setSheetSnapStage(1);
    });

    // [가상 이동 시뮬레이션] 버튼 (우측 플로팅 & 바텀 시트 공통)
    const handleSimulationTrigger = async () => {
      if (state.isPickingOriginOnMap) {
        toggleMapPickOriginMode(false);
      }
      if (state.activeSheetView !== 'route' || !state.currentRoute) {
        await startRouteFindingToBuilding(state.selectedDestId || 'it_college');
      }
      if (simulator.state === 'running') {
        simulator.pause();
        showToast('가상 이동 시뮬레이션을 일시정지했습니다.');
      } else {
        // 다시 시작할 때 전체 경로선 복원 후 출발
        if (state.currentRoute) {
          renderRouteOnMap(state.currentRoute);
        }
        switchSheetView('route', { snapStage: 1 });
        simulator.start(state.currentRoute);
        showToast('가상 이동 시뮬레이션을 시작합니다. 지나온 경로는 실시간으로 지워집니다.');
      }
    };

    dom.floatingSimBtn.addEventListener('click', handleSimulationTrigger);
    dom.sheetSimBtn.addEventListener('click', handleSimulationTrigger);

    // 배속 변경 (1x, 2x, 3x)
    document.querySelectorAll('.speed-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-chip').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const speed = Number(btn.dataset.speed) || 1;
        simulator.setSpeed(speed);
        showToast(`시뮬레이션 속도를 ${speed}배속으로 변경했습니다.`);
      });
    });

    // 음성 안내(TTS) 켜기/끄기
    dom.ttsToggleBtn.addEventListener('click', () => {
      tts.toggle();
    });

    // 내 위치(GPS) 버튼
    dom.myLocationBtn.addEventListener('click', () => {
      state.gpsFollowMode = true;
      if (gpsTracker) gpsTracker.start();
      state.map.setView(
        [state.userPosition.lat, state.userPosition.lng],
        18,
        { animate: true }
      );
      showToast('현재 내 위치로 지도를 이동했습니다.');
    });

    // 우측 상단 [🛰️ 위성 모드] 온/오프 토글 버튼 (실제 위성 사진과 일반 지도 전환)
    dom.mapLayerToggleBtn.addEventListener('click', () => {
      const mapContainer = document.getElementById('map');
      if (state.currentMapMode === 'street') {
        state.map.removeLayer(state.tileLayers.streetWithLabels);
        if (state.layers.vectorFootprintGroup && state.map.hasLayer(state.layers.vectorFootprintGroup)) {
          state.map.removeLayer(state.layers.vectorFootprintGroup);
        }
        state.tileLayers.satellite.addTo(state.map);
        state.currentMapMode = 'satellite';
        dom.mapLayerLabel.textContent = '위성 ON';
        dom.mapLayerToggleBtn.classList.add('satellite-active');
        if (mapContainer) mapContainer.classList.add('satellite-mode-active');
        showToast('🛰️ 실제 위성 지도(Satellite View) 모드로 전환되었습니다.');
      } else {
        state.map.removeLayer(state.tileLayers.satellite);
        state.tileLayers.streetWithLabels.addTo(state.map);
        if (state.layers.vectorFootprintGroup && !state.map.hasLayer(state.layers.vectorFootprintGroup)) {
          state.layers.vectorFootprintGroup.addTo(state.map);
        }
        state.currentMapMode = 'street';
        dom.mapLayerLabel.textContent = '위성 모드';
        dom.mapLayerToggleBtn.classList.remove('satellite-active');
        if (mapContainer) mapContainer.classList.remove('satellite-mode-active');
        showToast('🗺️ 캠퍼스 일반 지도로 전환되었습니다.');
      }
    });

    // 하단 고정 탭 바 ([지도] [길찾기] [저장]) 클릭 이벤트
    dom.tabBtnMap.addEventListener('click', () => {
      if (state.selectedDestId && state.activeSheetView === 'building') {
        switchSheetView('building');
      } else {
        renderExploreView();
        switchSheetView('explore');
      }
    });

    dom.tabBtnRoute.addEventListener('click', () => {
      startRouteFindingToBuilding(state.selectedDestId || 'it_college');
    });

    dom.tabBtnSaved.addEventListener('click', () => {
      renderSavedView();
      switchSheetView('saved');
    });

    // 실내 도면 모달 제어
    dom.openIndoorGuideBtn.addEventListener('click', () => {
      openIndoorFloorPlanModal(state.selectedDestId);
    });

    const closeIndoorModal = () => {
      dom.indoorModal.classList.add('hidden');
      dom.floorplanPdfFrame.src = 'about:blank';
    };

    dom.closeIndoorModalBtn.addEventListener('click', closeIndoorModal);
    dom.confirmIndoorModalBtn.addEventListener('click', () => {
      closeIndoorModal();
      startRouteFindingToBuilding(state.selectedDestId || 'future_innovation');
    });
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, 2400);
  }

  /**
   * 애플리케이션 초기화 엔트리
   */
  function initApp() {
    cacheDom();

    router = new CampusRouter({
      nodes: CAMPUS_NODES,
      edges: CAMPUS_EDGES,
    });

    initMap();
    initMapRotationAndCompass();
    initSearchAndCategories();
    initVoiceAndSimulation();
    initBottomSheetSnapController();

    if (window.IndoorNavigator && window.IT_COLLEGE_INDOOR_DATA) {
      indoorNav = new window.IndoorNavigator({
        tts,
        onSpeakHud: (text, badgeTitle) => {
          state.lastSpokenText = text;
          if (tts) {
            tts.speak(text, { turnType: 'start', title: badgeTitle });
          }
        },
        onShowToast: (msg) => {
          showToast(msg);
        },
        onExitIndoor: () => {
          if (window.lucide) window.lucide.createIcons();
        },
        onRequestOutdoorRouteToEntrance: (entrance, roomId, directionMode) => {
          state.pendingIndoorEntranceId = entrance.id;
          state.pendingIndoorRoomId = roomId || 'room_203';
          indoorNav.close();
          if (directionMode === 'exit') {
            startRouteFindingToBuilding(state.selectedDestId || 'main_gate', {
              keepIndoorEntrance: true,
            });
            showToast(
              `IT대학 ${entrance.name}에서 야외 목적지까지 경로를 이어서 안내합니다.`
            );
          } else {
            startRouteFindingToBuilding('it_college', { keepIndoorEntrance: true });
            showToast(
              `IT대학 ${entrance.name}(${entrance.entryFloor} 진입)까지 야외 최단 경로를 안내합니다.`
            );
          }
        },
      });
    }

    initFloorSelectModal();
    initGpsTracker();
    initPwaManager();
    bindControlEvents();

    // 초기 화면: UI 예시 01 ("01 앱을 켰을 때") 상태로 시작!
    renderExploreView();
    switchSheetView('explore');

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  /**
   * [Step 4 핵심] PWA 모바일 앱 설치 & 실시간 버전 업데이트 관리자
   */
  function initPwaManager() {
    let deferredPrompt = null;
    let swRegistration = null;

    // 1. Standalone 실행 감지
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    // 2. iOS 환경 감지
    const isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    // Standalone 모드이면 설치 플로팅 배너 영구 숨김
    if (isStandalone) {
      if (dom.pwaInstallBanner) dom.pwaInstallBanner.classList.add('hidden');
    } else {
      // 이전에 닫기를 누른 기록이 없다면 배너 노출
      const isDismissed = localStorage.getItem('usw_pwa_dismissed') === 'true';
      if (!isDismissed && dom.pwaInstallBanner) {
        setTimeout(() => {
          dom.pwaInstallBanner.classList.remove('hidden');
          if (window.lucide) window.lucide.createIcons();
        }, 1200);
      }
    }

    // 3. Android / Chrome PWA 설치 이벤트(beforeinstallprompt) 캡처
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (!isStandalone && dom.pwaInstallBanner) {
        dom.pwaInstallBanner.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
      }
    });

    window.addEventListener('appinstalled', () => {
      showToast('🎉 수원대 길찾기 앱이 스마트폰에 설치되었습니다!');
      if (dom.pwaInstallBanner) dom.pwaInstallBanner.classList.add('hidden');
      deferredPrompt = null;
    });

    // 4. [앱 다운로드] 버튼 클릭 리스너
    if (dom.pwaInstallBtn) {
      dom.pwaInstallBtn.addEventListener('click', async () => {
        if (isIos) {
          // iOS Safari는 시스템 설치 프롬프트가 없으므로 홈 화면 추가 가이드 모달 표시
          if (dom.iosInstallModal) dom.iosInstallModal.classList.remove('hidden');
          return;
        }

        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') {
            showToast('수원대 길찾기 앱 설치를 시작합니다.');
            if (dom.pwaInstallBanner) dom.pwaInstallBanner.classList.add('hidden');
          }
          deferredPrompt = null;
        } else {
          showToast('💡 브라우저 메뉴의 [홈 화면에 추가] 또는 [앱 설치]를 선택하세요.');
        }
      });
    }

    // 배너 닫기 버튼
    if (dom.pwaDismissBannerBtn) {
      dom.pwaDismissBannerBtn.addEventListener('click', () => {
        localStorage.setItem('usw_pwa_dismissed', 'true');
        if (dom.pwaInstallBanner) dom.pwaInstallBanner.classList.add('hidden');
      });
    }

    // iOS 모달 닫기
    const closeIosModal = () => {
      if (dom.iosInstallModal) dom.iosInstallModal.classList.add('hidden');
    };
    if (dom.closeIosInstallModalBtn) dom.closeIosInstallModalBtn.addEventListener('click', closeIosModal);
    if (dom.confirmIosInstallBtn) dom.confirmIosInstallBtn.addEventListener('click', closeIosModal);

    // 5. Service Worker 등록 및 실시간 버전 업데이트 감지
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('sw.js')
        .then((reg) => {
          swRegistration = reg;
          console.log('[PWA] ServiceWorker registered:', reg.scope);

          // 이미 대기 중인 새 버전 서비스워커가 있는 경우
          if (reg.waiting) {
            triggerUpdateNotice(reg.waiting);
          }

          // 새로운 서비스워커 설치 발견
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                triggerUpdateNotice(newWorker);
              }
            });
          });
        })
        .catch((err) => {
          console.warn('[PWA] ServiceWorker register failed:', err);
        });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    function triggerUpdateNotice(worker) {
      if (!dom.pwaUpdateBanner) return;
      dom.pwaUpdateBanner.classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons();

      if (dom.applyUpdateBtn) {
        dom.applyUpdateBtn.onclick = async () => {
          showToast('🚀 최신 버전을 적용하고 즉시 새로고침합니다...');
          if (worker) {
            worker.postMessage({ action: 'skipWaiting' });
          } else {
            window.location.reload();
          }
        };
      }

      if (dom.dismissUpdateBtn) {
        dom.dismissUpdateBtn.onclick = () => {
          dom.pwaUpdateBanner.classList.add('hidden');
        };
      }
    }

    // 6. [🔄 최신 버전 확인] 수동 강제 업데이트 & 캐시 초기화 버튼
    if (dom.manualUpdateBtn) {
      dom.manualUpdateBtn.addEventListener('click', async () => {
        dom.manualUpdateBtn.classList.add('spinning');
        showToast('🔄 최신 버전 여부를 확인하고 있습니다...');

        try {
          if (swRegistration) {
            await swRegistration.update();
            if (swRegistration.waiting) {
              dom.manualUpdateBtn.classList.remove('spinning');
              triggerUpdateNotice(swRegistration.waiting);
              return;
            }
          }

          // 모든 캐시 강제 삭제 (테스트 환경에서 가장 확실한 최신 코드 보장!)
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map((name) => caches.delete(name)));
          }

          setTimeout(() => {
            dom.manualUpdateBtn.classList.remove('spinning');
            showToast('✅ 최신 버전으로 캐시를 갱신했습니다! 화면을 새로고침합니다.');
            setTimeout(() => {
              window.location.reload(true);
            }, 600);
          }, 800);
        } catch (err) {
          console.warn('[PWA] Manual update check error:', err);
          dom.manualUpdateBtn.classList.remove('spinning');
          showToast('최신 버전을 확인했습니다. 새로고침합니다.');
          window.location.reload(true);
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', initApp);
})();
