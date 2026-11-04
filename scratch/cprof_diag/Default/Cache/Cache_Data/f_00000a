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
    showGraphDebug: true,
    activeCategory: 'building', // 'building' | 'food' | 'amenity'
    activeSheetView: 'explore', // 'explore' | 'building' | 'route' | 'saved'
    activeBottomTab: 'map', // 'map' | 'route' | 'saved'
    startNodeId: 'main_gate', // 기본 출발지: 정문
    customGpsCoord: null,
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
      traveledLine: null,
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
    panelState: {
      mode: 'default', // 'default' | 'mini' | 'compact' | 'sidebar'
      lastModeBeforeMini: 'default',
      isDragging: false,
      dragOffset: { x: 0, y: 0 },
      isResizing: false,
      resizeHandle: null,
      initialRect: null,
      initialPointer: null,
    },
    roadEditor: {
      active: false,
      points: [], // [ { id, lat, lng, marker }, ... ]
      polylineLayer: null,
      layerGroup: null,
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

    dom.navVoiceHud = document.getElementById('navVoiceHud');
    dom.hudTurnIconBox = document.getElementById('hudTurnIconBox');
    dom.hudStepBadge = document.getElementById('hudStepBadge');
    dom.hudSoundWave = document.getElementById('hudSoundWave');
    dom.hudVoiceText = document.getElementById('hudVoiceText');
    dom.hudRepeatVoiceBtn = document.getElementById('hudRepeatVoiceBtn');

    dom.resetCampusViewBtn = document.getElementById('resetCampusViewBtn');
    dom.toggleGraphDebugBtn = document.getElementById('toggleGraphDebugBtn');
    dom.mapLayerToggleBtn = document.getElementById('mapLayerToggleBtn');
    dom.mapLayerLabel = document.getElementById('mapLayerLabel');
    dom.myLocationBtn = document.getElementById('myLocationBtn');
    dom.ttsToggleBtn = document.getElementById('ttsToggleBtn');
    dom.ttsToggleIconWrap = document.getElementById('ttsToggleIconWrap');
    dom.ttsStatusBadge = document.getElementById('ttsStatusBadge');
    dom.floatingSimBtn = document.getElementById('floatingSimBtn');
    dom.floatingSimIconWrap = document.getElementById('floatingSimIconWrap');
    dom.floatingSimLabel = document.getElementById('floatingSimLabel');

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

    // 패널 윈도우 조절 버튼군 (최소화, 컴팩트, 사이드바, 리셋)
    dom.sheetBtnMinimize = document.getElementById('sheetBtnMinimize');
    dom.sheetBtnCompact = document.getElementById('sheetBtnCompact');
    dom.sheetBtnSidebar = document.getElementById('sheetBtnSidebar');
    dom.sheetBtnReset = document.getElementById('sheetBtnReset');

    // 최소화 슬림 정보 바
    dom.sheetMiniBar = document.getElementById('sheetMiniBar');
    dom.miniBarTitle = document.getElementById('miniBarTitle');
    dom.miniBarMetrics = document.getElementById('miniBarMetrics');
    dom.miniStartNavBtn = document.getElementById('miniStartNavBtn');
    dom.miniStartNavBtnText = document.getElementById('miniStartNavBtnText');
    dom.miniOpenIndoorBtn = document.getElementById('miniOpenIndoorBtn');
    dom.miniExpandBtn = document.getElementById('miniExpandBtn');

    dom.simProgressPanel = document.getElementById('simProgressPanel');
    dom.simStatusText = document.getElementById('simStatusText');
    dom.simProgressBar = document.getElementById('simProgressBar');
    dom.simTraveledDist = document.getElementById('simTraveledDist');
    dom.simRemainingDist = document.getElementById('simRemainingDist');
    dom.simProgressPercent = document.getElementById('simProgressPercent');

    dom.indoorTransitionBanner = document.getElementById('indoorTransitionBanner');
    dom.indoorBannerSub = document.getElementById('indoorBannerSub');
    dom.openIndoorGuideBtn = document.getElementById('openIndoorGuideBtn');

    dom.startNavBtn = document.getElementById('startNavBtn');
    dom.startNavBtnText = document.getElementById('startNavBtnText');
    dom.sheetSimBtn = document.getElementById('sheetSimBtn');
    dom.sheetSimBtnText = document.getElementById('sheetSimBtnText');
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

    // [길 교정 모드] Road Editor Elements
    dom.floatingRoadEditorBtn = document.getElementById('floatingRoadEditorBtn');
    dom.floatingRoadEditorLabel = document.getElementById('floatingRoadEditorLabel');
    dom.roadEditorToolbar = document.getElementById('roadEditorToolbar');
    dom.retPointCount = document.getElementById('retPointCount');
    dom.retCloseBtn = document.getElementById('retCloseBtn');
    dom.retUndoBtn = document.getElementById('retUndoBtn');
    dom.retClearBtn = document.getElementById('retClearBtn');
    dom.retApplyBtn = document.getElementById('retApplyBtn');
    dom.retCopyJsonBtn = document.getElementById('retCopyJsonBtn');

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
   * 1. 지도 및 레이어 초기화
   */
  function initMap() {
    state.map = L.map('map', {
      center: SUWON_CAMPUS_CONFIG.center,
      zoom: SUWON_CAMPUS_CONFIG.defaultZoom,
      minZoom: SUWON_CAMPUS_CONFIG.minZoom,
      maxZoom: SUWON_CAMPUS_CONFIG.maxZoom,
      maxBounds: SUWON_CAMPUS_CONFIG.maxBounds,
      maxBoundsViscosity: 0.92,
      zoomControl: false,
    });

    // API Key 없이 로컬(file://) 및 모바일 웹뷰에서 100% 작동하는 구글 한국어 지도 타일 & 위성 타일 적용
    state.tileLayers.streetWithLabels = L.tileLayer(
      'https://{s}.google.com/vt/lyrs=m&hl=ko&x={x}&y={y}&z={z}',
      {
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        maxZoom: 20,
      }
    );

    state.tileLayers.satellite = L.tileLayer(
      'https://{s}.google.com/vt/lyrs=y&hl=ko&x={x}&y={y}&z={z}',
      {
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        maxZoom: 20,
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
    renderCampusGraphNetwork();
    renderBuildingMarkers();
    createOrUpdateUserMarker(
      state.userPosition.lat,
      state.userPosition.lng,
      state.userPosition.bearing
    );

    state.map.on('click', () => {
      hideAutocomplete();
    });

    state.map.on('dragstart', () => {
      state.gpsFollowMode = false;
    });
  }

  /**
   * UI 예시(01·02)와 동일한 캠퍼스 건물 폴리곤(연한 블루그레이 블록) 및 보행로 벡터 렌더링
   * 로컬 데이터(campusVectorMap.js) 기반으로 오프라인이나 file:// 환경에서도 항상 선명하게 표시됨
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

    // 2) 수원대 캠퍼스 내 83개 실제 건물 폴리곤 (UI 예시의 #cbd6e2 블루그레이 블록 스타일)
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
   * UI 예시 배경에 보이는 서브 건물명 라벨(교양학관, 음악대학, 대운동장, 제2공학관 등) 표시
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
   * 2. 캠퍼스 보행로 네트워크(간선 & 교차점) 표시
   */
  function renderCampusGraphNetwork() {
    state.layers.graphGroup.clearLayers();
    if (!state.showGraphDebug) return;

    CAMPUS_EDGES.forEach((edge) => {
      const fromNode = CAMPUS_NODES[edge.from];
      const toNode = CAMPUS_NODES[edge.to];
      if (!fromNode || !toNode) return;

      L.polyline(
        [
          [fromNode.lat, fromNode.lng],
          [toNode.lat, toNode.lng],
        ],
        {
          color: '#94a3b8',
          weight: 2,
          opacity: 0.4,
          dashArray: '4, 6',
          interactive: false,
        }
      ).addTo(state.layers.graphGroup);
    });
  }

  /**
   * 3. UI 예시(01·02)와 동일한 건물 마커 렌더링
   * - 기본 상태: 흰색 둥근 카드 + 네이비 빌딩 아이콘 + 네이비 텍스트 + 하단 노란 점
   * - 선택 상태: 짙은 네이비(#08386b) 카드 + 흰색 아이콘 + 흰색 텍스트 + 하단 노란 점
   */
  function renderBuildingMarkers() {
    Object.values(state.buildingMarkers).forEach((m) => state.map.removeLayer(m));
    state.buildingMarkers = {};

    CAMPUS_BUILDINGS.forEach((building) => {
      // 현재 활성 카테고리 필터에 해당하지 않으면 마커 숨김
      if (
        state.activeCategory !== 'building' &&
        !(building.filterCategories || []).includes(state.activeCategory)
      ) {
        return;
      }

      const icon = L.divIcon({
        className: 'custom-usw-building-icon',
        html: createBuildingMarkerHtml(building),
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([building.lat, building.lng], {
        icon,
        zIndexOffset: state.selectedDestId === building.id ? 850 : 450,
      }).addTo(state.map);

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        hideAutocomplete();
        openBuildingDetailView(building.id);
      });

      state.buildingMarkers[building.id] = marker;
    });
  }

  function createBuildingMarkerHtml(building) {
    const isSelected = state.selectedDestId === building.id;
    const wrapClass = isSelected
      ? 'usw-building-marker-wrap is-selected'
      : 'usw-building-marker-wrap';

    // UI 예시의 건물 아이콘 SVG
    const buildingSvg = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="3" width="10" height="18" rx="1"></rect>
        <path d="M14 8h5a1 1 0 0 1 1 1v12h-6"></path>
        <path d="M7 7h4M7 11h4M7 15h4M17 12h1M17 16h1"></path>
      </svg>
    `;

    return `
      <div class="${wrapClass}" data-building-id="${building.id}">
        <div class="usw-building-card">
          ${buildingSvg}
          <span class="b-name">${building.name}</span>
        </div>
        <div class="usw-marker-gold-dot"></div>
      </div>
    `;
  }

  function refreshBuildingMarkersStyle() {
    renderBuildingMarkers();
  }

  /**
   * 4. 내 위치(GPS / 시뮬레이션) 마커 생성 (UI 예시의 반투명 원 + 네이비 점 + '내 위치' 라벨)
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
        zIndexOffset: 1000,
      }).addTo(state.map);
    } else {
      state.userMarker.setLatLng([lat, lng]);
      state.userMarker.setIcon(icon);
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
   * 5. 바텀 시트 3단계 뷰 전환 (01 홈 탐색 / 02 건물 선택 상세 / 03 길찾기 안내)
   * =======================================================================
   */
  function switchSheetView(viewName) {
    state.activeSheetView = viewName;
    dom.bottomSheet.classList.remove('collapsed');

    dom.sheetViewExplore.classList.toggle('hidden', viewName !== 'explore');
    dom.sheetViewBuilding.classList.toggle('hidden', viewName !== 'building');
    dom.sheetViewRoute.classList.toggle('hidden', viewName !== 'route');
    dom.sheetViewSaved.classList.toggle('hidden', viewName !== 'saved');

    // 하단 탭 바 활성 상태 동기화
    if (viewName === 'route') {
      setActiveBottomTab('route');
    } else if (viewName === 'saved') {
      setActiveBottomTab('saved');
    } else {
      setActiveBottomTab('map');
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

    if (state.startNodeId === targetId) {
      const fallbackStart = targetId === 'main_gate' ? 'main_building' : 'main_gate';
      state.startNodeId = fallbackStart;
      dom.startNodeSelect.value = fallbackStart;
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
    if (dom.startNodeSelect) {
      dom.startNodeSelect.value = state.startNodeId;
    }

    // 출발 위치 마커 설정 (출입구 도로 스냅 우선)
    const startNode = CAMPUS_NODES[state.startNodeId];
    if (startNode) {
      const startLat = startNode.entranceLat || startNode.lat;
      const startLng = startNode.entranceLng || startNode.lng;
      createOrUpdateUserMarker(startLat, startLng, 180);
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

    // IT대학 목적지인 경우: 야외 최단 경로가 실제로 안내한 도착 출입구(1F/2F/3F)를 상태에 확실히 보존
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
    switchSheetView('route');

    if (!options.skipFitBounds) {
      fitMapToRoute(route);
    }
  }

  /**
   * 지도 위에 경로 듀얼 렌더링
   * - 선택된 활성 경로: 선명한 파란색(Blue) 실선 + 화살표 + 체크포인트
   * - 선택되지 않은 대안 경로: 연한 하늘색/회색 점선(Dashed) + 툴팁 및 클릭 전환
   */
  function renderRouteOnMap(route) {
    state.layers.routeGroup.clearLayers();
    state.layers.arrowGroup.clearLayers();
    state.layers.checkpointGroup.clearLayers();

    const coords = route.coordinates;
    if (!coords || coords.length < 2) return;

    // 1. 선택되지 않은 다른 대안 경로를 연한 회색/하늘색 점선으로 동시 렌더링 (비교용)
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
        opacity: 0.78,
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
    }

    // 2. 외곽 흰색 케이싱 라인
    L.polyline(coords, {
      color: '#ffffff',
      weight: 12.5,
      opacity: 0.98,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(state.layers.routeGroup);

    // 3. 메인 경로선 (네이버/구글 지도 스타일 선명한 블루-네이비)
    L.polyline(coords, {
      color: '#0068ff',
      weight: 7.5,
      opacity: 0.98,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(state.layers.routeGroup);

    // 이동 완료 구간 표시용 라인
    state.activeRoutePolylines.traveledLine = L.polyline([], {
      color: '#03c75a',
      weight: 7.5,
      opacity: 0.96,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(state.layers.routeGroup);

    // 구간별 방향 화살표 마커
    route.segments.forEach((seg) => {
      if (seg.distance < 25) return;
      const fractions = seg.distance > 140 ? [0.35, 0.7] : [0.5];
      fractions.forEach((f) => {
        const lat = seg.from[0] + (seg.to[0] - seg.from[0]) * f;
        const lng = seg.from[1] + (seg.to[1] - seg.from[1]) * f;

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

        L.marker([lat, lng], {
          icon: arrowIcon,
          interactive: false,
          zIndexOffset: 300,
        }).addTo(state.layers.arrowGroup);
      });
    });

    // 출발/도착 및 회전 체크포인트 배지
    route.checkpoints.forEach((cp, idx) => {
      if (cp.type === 'start') {
        const startPin = L.divIcon({
          className: 'custom-endpoint-pin',
          html: `<div class="route-endpoint-pin start-pin">출발 · ${route.startName}</div>`,
          iconSize: [0, 0],
        });
        L.marker([cp.lat, cp.lng], { icon: startPin, zIndexOffset: 650 }).addTo(
          state.layers.checkpointGroup
        );
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
            : indoorNav.router.resolveEntranceForOutdoorOrigin(state.startNodeId);
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
            switchToIndoorMapMode('it_college', state.pendingIndoorRoomId || 'room_203');
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
      }
    });
  }

  function fitMapToRoute(route) {
    if (!route || !route.coordinates || route.coordinates.length === 0) return;
    const bounds = L.latLngBounds(route.coordinates);
    state.map.fitBounds(bounds, {
      paddingTopLeft: [45, 140],
      paddingBottomRight: [45, 360],
      maxZoom: 17,
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

    dom.sheetCategoryTag.textContent = route.isCalibrated
      ? `${dest.category || '캠퍼스 건물'} · 🛠️ 직접 교정한 길`
      : route.isOSRM
      ? `${dest.category || '캠퍼스 건물'} · 🌐 ${modeBadge}`
      : `${dest.category || '캠퍼스 건물'} · ${modeBadge}`;
    dom.sheetBuildingName.textContent = dest.fullName || dest.name;
    dom.startNodeSelect.value = state.startNodeId;

    // IT대학 목적지인 경우, 실제 계산된 야외 최단 경로의 도착 출입구(1F/2F/3F)로 표시
    if (dest.id === 'it_college' && window.IT_COLLEGE_INDOOR_DATA && indoorNav) {
      const entId =
        route.destinationEntranceId ||
        state.currentOutdoorEntranceId ||
        state.pendingIndoorEntranceId;
      const resolvedEnt = entId
        ? indoorNav.getEntranceById(entId)
        : indoorNav.router.resolveEntranceForOutdoorOrigin(state.startNodeId);
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

    // [야외 출입구 추천 가이드 박스 동기화]
    if (dom.sheetEntranceGuideBox) {
      if (dest.id === 'it_college' && window.IT_COLLEGE_INDOOR_DATA && indoorNav) {
        dom.sheetEntranceGuideBox.classList.remove('hidden');
        const entId =
          route.destinationEntranceId ||
          state.currentOutdoorEntranceId ||
          state.pendingIndoorEntranceId;
        const resolvedEnt = entId
          ? indoorNav.getEntranceById(entId)
          : indoorNav.router.resolveEntranceForOutdoorOrigin(state.startNodeId);

        if (resolvedEnt) {
          if (dom.guideEntranceTitle) dom.guideEntranceTitle.textContent = resolvedEnt.name;
          if (dom.guideEntranceFloorTag) dom.guideEntranceFloorTag.textContent = `🏢 ${resolvedEnt.entryFloor} 진입`;

          let desc = '';
          if (resolvedEnt.id === 'ent_1f_main') {
            desc = '정문에서 출발 시 가장 빠른 1층 로비 출입구입니다. 진입 즉시 1층 도면으로 연결됩니다.';
          } else if (resolvedEnt.id === 'ent_2f_south') {
            desc = '후문에서 제4공학관을 지나 바로 도달하는 2층 중앙출입구입니다. 200호대 강의실로 바로 연결됩니다.';
          } else if (resolvedEnt.id === 'ent_3f_west') {
            desc = '경상관 CU 쪽문에서 올라와 바로 진입하는 3층 언덕출입구입니다. 300호대 강의실로 즉시 연결됩니다.';
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
        }
      } else {
        dom.sheetEntranceGuideBox.classList.add('hidden');
      }
    }

    // 최소화 슬림 바(한 줄 모드) 동기화
    if (dom.miniBarTitle) {
      dom.miniBarTitle.textContent = dest.name || '목적지';
    }
    if (dom.miniBarMetrics) {
      dom.miniBarMetrics.textContent = `약 ${route.estimatedMinutes}분 · ${route.totalDistance}m`;
    }

    dom.simProgressPanel.classList.add('hidden');
    if (dest.id === 'it_college') {
      dom.indoorTransitionBanner.classList.remove('hidden');
      const entId =
        route.destinationEntranceId ||
        state.currentOutdoorEntranceId ||
        state.pendingIndoorEntranceId;
      const resolvedEnt =
        indoorNav &&
        (entId
          ? indoorNav.getEntranceById(entId)
          : indoorNav.router.resolveEntranceForOutdoorOrigin(state.startNodeId));
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
   * 사용자가 [큰길 우선] 또는 [최단거리] 탭을 눌렀을 때 즉시 경로 전환 및 지도 동기화
   */
  function switchRouteOption(prefKey) {
    if (!state.dualRoutes || !state.dualRoutes[prefKey]) return;
    state.activeRoutePreference = prefKey;
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
    showToast(`🧭 [${label}] 경로로 전환했습니다. (${route.totalDistance}m)`);
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

      let badgeSymbol = index + 1;
      if (cp.turnType === 'start') badgeSymbol = '출발';
      else if (cp.turnType === 'right') badgeSymbol = '우';
      else if (cp.turnType === 'left') badgeSymbol = '좌';
      else if (cp.turnType === 'arrive') badgeSymbol = '도착';

      li.innerHTML = `
        <div class="cp-icon-badge">${badgeSymbol}</div>
        <div class="cp-body">
          <div class="cp-title">${cp.instruction}</div>
          <div class="cp-voice-sub">음성: "${cp.voiceText}"</div>
        </div>
        <div class="cp-dist-badge">${cp.cumulativeDist}m</div>
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
    // 먼저 현재 출발지(예: 정문, 후문 등)에서 IT대학 입구까지의 야외 최단 경로를 함께 계산하여 입구를 100% 동기화
    if (!state.currentRoute || state.currentRoute.destinationId !== 'it_college') {
      await startRouteFindingToBuilding('it_college', {
        skipFitBounds: true,
        keepIndoorEntrance: Boolean(options.entranceId || state.currentOutdoorEntranceId || state.pendingIndoorEntranceId),
      });
    }

    // 야외에서 안내받은 입구를 최우선으로 실내 길안내 시작 입구로 설정!
    // 1) 옵션으로 전달된 입구
    // 2) 야외 최단 경로가 실제로 안내한 도착 입구 (destinationEntranceId)
    // 3) state.currentOutdoorEntranceId / state.pendingIndoorEntranceId
    // 4) 출발지 기반 자동 판별 입구
    const resolvedOutdoorEnt = indoorNav.router.resolveEntranceForOutdoorOrigin(
      state.startNodeId
    );
    const entranceId =
      options.entranceId ||
      state.currentOutdoorEntranceId ||
      (state.currentRoute && state.currentRoute.destinationEntranceId) ||
      state.pendingIndoorEntranceId ||
      (resolvedOutdoorEnt ? resolvedOutdoorEnt.id : 'ent_1f_main');

    // 상태 보존
    state.currentOutdoorEntranceId = entranceId;
    state.pendingIndoorEntranceId = entranceId;

    state.selectedDestId = 'it_college';
    refreshBuildingMarkersStyle();
    updateQuickChipsActiveState();

    // 바텀 시트 안내 문구도 현재 선택된 강의실(예: 310호, 203호)과 진입 입구로 즉시 동기화
    if (state.currentRoute && state.currentRoute.destinationId === 'it_college') {
      populateRouteSheet(state.currentRoute);
    }

    indoorNav.open({
      roomId,
      entranceId,
      outdoorOriginId: state.startNodeId,
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
   * 6-B. 마우스 클릭 '경로/도로 직접 교정 모드 (Road Calibration Tool)' (관리자 툴)
   * =========================================================================
   */
  function initRoadEditor() {
    state.roadEditor.layerGroup = L.layerGroup().addTo(state.map);

    // 플로팅 토글 버튼
    if (dom.floatingRoadEditorBtn) {
      dom.floatingRoadEditorBtn.addEventListener('click', () => {
        toggleRoadEditor();
      });
    }

    // 툴바 닫기 버튼
    if (dom.retCloseBtn) {
      dom.retCloseBtn.addEventListener('click', () => {
        toggleRoadEditor(false);
      });
    }

    // 취소 (Undo)
    if (dom.retUndoBtn) {
      dom.retUndoBtn.addEventListener('click', () => {
        undoRoadEditorPoint();
      });
    }

    // 전체 삭제 (Clear)
    if (dom.retClearBtn) {
      dom.retClearBtn.addEventListener('click', () => {
        clearRoadEditorPoints();
      });
    }

    // 현재 경로에 즉시 반영
    if (dom.retApplyBtn) {
      dom.retApplyBtn.addEventListener('click', () => {
        applyRoadEditorToCurrentRoute();
      });
    }

    // JSON 복사
    if (dom.retCopyJsonBtn) {
      dom.retCopyJsonBtn.addEventListener('click', () => {
        copyRoadEditorJson();
      });
    }

    // 지도 클릭 시 교정 점 추가
    state.map.on('click', (e) => {
      if (!state.roadEditor.active) return;
      addRoadEditorPoint(e.latlng.lat, e.latlng.lng);
    });
  }

  function toggleRoadEditor(forceActive) {
    const nextState =
      typeof forceActive === 'boolean' ? forceActive : !state.roadEditor.active;
    state.roadEditor.active = nextState;

    if (dom.floatingRoadEditorBtn) {
      dom.floatingRoadEditorBtn.classList.toggle('active', nextState);
    }
    if (dom.roadEditorToolbar) {
      dom.roadEditorToolbar.classList.toggle('hidden', !nextState);
    }

    const mapContainer = state.map.getContainer();
    if (nextState) {
      mapContainer.style.cursor = 'crosshair';
      // 만약 기존에 찍어둔 점이 없고 현재 활성화된 경로가 있다면,
      // 현재 경로의 곡선 좌표들을 에디터 포인트들로 자동 로드하여 바로 수정할 수 있게 함!
      if (
        state.roadEditor.points.length === 0 &&
        state.currentRoute &&
        Array.isArray(state.currentRoute.coordinates) &&
        state.currentRoute.coordinates.length > 0
      ) {
        loadCoordinatesIntoRoadEditor(state.currentRoute.coordinates);
      }
      showToast('🛠️ 길 교정 모드 활성화: 큰길 위를 클릭해 도로 점을 추가하세요');
    } else {
      mapContainer.style.cursor = '';
    }
  }

  function loadCoordinatesIntoRoadEditor(coords) {
    clearRoadEditorPoints(false);
    coords.forEach(([lat, lng]) => {
      addRoadEditorPoint(lat, lng, false);
    });
    updateRoadEditorPolyline();
    updateRoadEditorUI();
  }

  function addRoadEditorPoint(lat, lng, shouldUpdate = true) {
    const idx = state.roadEditor.points.length;
    const icon = L.divIcon({
      className: 'ret-div-icon',
      html: `<div class="ret-map-marker">${idx + 1}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    const marker = L.marker([lat, lng], {
      icon,
      draggable: true,
      zIndexOffset: 1000 + idx,
    }).addTo(state.roadEditor.layerGroup);

    // 마커 드래그 시 실시간 도로선 업데이트
    marker.on('drag', () => {
      const pos = marker.getLatLng();
      const ptObj = state.roadEditor.points.find((p) => p.marker === marker);
      if (ptObj) {
        ptObj.lat = pos.lat;
        ptObj.lng = pos.lng;
      }
      updateRoadEditorPolyline();
    });

    // 마커 클릭 시 삭제 팝업
    marker.bindPopup(`
      <div style="font-size:12px; font-family:sans-serif; text-align:center; padding:4px;">
        <strong style="color:#0f172a;">#${idx + 1} 도로 노드</strong><br>
        <span style="font-size:10px; color:#64748b;">${lat.toFixed(5)}, ${lng.toFixed(5)}</span><br>
        <button type="button" style="margin-top:6px; padding:3px 8px; font-size:11px; background:#ef4444; color:#fff; border:none; border-radius:4px; cursor:pointer;" onclick="window._deleteRoadPoint(${idx})">이 점 삭제</button>
      </div>
    `);

    state.roadEditor.points.push({
      id: `pt_${Date.now()}_${idx}`,
      lat,
      lng,
      marker,
    });

    if (shouldUpdate) {
      updateRoadEditorPolyline();
      updateRoadEditorUI();
    }
  }

  function removeRoadEditorPoint(index) {
    if (index < 0 || index >= state.roadEditor.points.length) return;
    const item = state.roadEditor.points.splice(index, 1)[0];
    if (item && item.marker) {
      state.roadEditor.layerGroup.removeLayer(item.marker);
    }
    // 마커 번호 재할당
    state.roadEditor.points.forEach((p, i) => {
      p.marker.setIcon(
        L.divIcon({
          className: 'ret-div-icon',
          html: `<div class="ret-map-marker">${i + 1}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        })
      );
    });
    updateRoadEditorPolyline();
    updateRoadEditorUI();
  }

  window._deleteRoadPoint = function (idx) {
    removeRoadEditorPoint(idx);
    if (state.map) {
      state.map.closePopup();
    }
  };

  function undoRoadEditorPoint() {
    if (state.roadEditor.points.length === 0) return;
    removeRoadEditorPoint(state.roadEditor.points.length - 1);
  }

  function clearRoadEditorPoints(updateUI = true) {
    state.roadEditor.points.forEach((p) => {
      state.roadEditor.layerGroup.removeLayer(p.marker);
    });
    state.roadEditor.points = [];
    if (state.roadEditor.polylineLayer) {
      state.roadEditor.layerGroup.removeLayer(state.roadEditor.polylineLayer);
      state.roadEditor.polylineLayer = null;
    }
    if (updateUI) {
      updateRoadEditorUI();
    }
  }

  function updateRoadEditorPolyline() {
    if (state.roadEditor.polylineLayer) {
      state.roadEditor.layerGroup.removeLayer(state.roadEditor.polylineLayer);
      state.roadEditor.polylineLayer = null;
    }

    const latlngs = state.roadEditor.points.map((p) => [p.lat, p.lng]);
    if (latlngs.length >= 2) {
      state.roadEditor.polylineLayer = L.polyline(latlngs, {
        color: '#f59e0b',
        weight: 6,
        opacity: 0.92,
        dashArray: '8, 8',
      }).addTo(state.roadEditor.layerGroup);
    }
  }

  function updateRoadEditorUI() {
    if (dom.retPointCount) {
      dom.retPointCount.textContent = `${state.roadEditor.points.length}개 포인트`;
    }
  }

  function applyRoadEditorToCurrentRoute() {
    if (state.roadEditor.points.length < 2) {
      showToast('최소 2개 이상의 도로 점을 찍어주세요.');
      return;
    }

    const newCoordinates = state.roadEditor.points.map((p) => [p.lat, p.lng]);

    // 실제 거리 및 세그먼트 재계산
    let totalDist = 0;
    const segments = [];
    for (let i = 0; i < newCoordinates.length - 1; i++) {
      const segDist = CampusRouter.haversineDistance(
        newCoordinates[i][0],
        newCoordinates[i][1],
        newCoordinates[i + 1][0],
        newCoordinates[i + 1][1]
      );
      const bearing = CampusRouter.calculateBearing(
        newCoordinates[i][0],
        newCoordinates[i][1],
        newCoordinates[i + 1][0],
        newCoordinates[i + 1][1]
      );
      segments.push({
        index: i,
        from: newCoordinates[i],
        to: newCoordinates[i + 1],
        distance: segDist,
        startCumulativeDist: totalDist,
        endCumulativeDist: totalDist + segDist,
        bearing,
      });
      totalDist += segDist;
    }

    totalDist = Math.round(totalDist);

    if (!state.currentRoute) {
      state.currentRoute = {
        startNodeId: state.startNodeId,
        endNodeId: state.selectedDestId || 'it_college',
        startName: '교정된 출발지',
        destinationName: '교정된 목적지',
        destinationBuilding: CAMPUS_NODES[state.selectedDestId || 'it_college'],
        checkpoints: [],
      };
    }

    state.currentRoute.coordinates = newCoordinates;
    state.currentRoute.segments = segments;
    state.currentRoute.totalDistance = totalDist;
    state.currentRoute.estimatedMinutes = Math.max(1, Math.ceil(totalDist / 68));
    state.currentRoute.isCalibrated = true;

    // 시뮬레이터 및 지도 갱신
    renderRouteOnMap(state.currentRoute);
    populateRouteSheet(state.currentRoute);
    simulator.loadRoute(state.currentRoute);
    if (gpsTracker) {
      gpsTracker.setActiveRoute(state.currentRoute);
    }

    showToast('교정된 도로선이 현재 경로에 즉시 적용되었습니다!');
  }

  function copyRoadEditorJson() {
    if (state.roadEditor.points.length === 0) {
      showToast('복사할 도로 포인트가 없습니다.');
      return;
    }

    const rawPoints = state.roadEditor.points.map((p) => ({
      lat: Number(p.lat.toFixed(6)),
      lng: Number(p.lng.toFixed(6)),
    }));

    const jsonString = JSON.stringify(rawPoints, null, 2);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(jsonString).then(
        () => {
          showToast(`📋 도로 좌표 JSON이 클립보드에 복사되었습니다! (${rawPoints.length}개)`);
        },
        () => {
          fallbackPromptCopy(jsonString);
        }
      );
    } else {
      fallbackPromptCopy(jsonString);
    }
  }

  function fallbackPromptCopy(text) {
    window.prompt('아래 JSON 데이터를 복사하세요 (Ctrl+C):', text);
    showToast('JSON 데이터를 확인하세요.');
  }

  /**
   * =========================================================================
   * 8. 길찾기 창(패널) 자유 이동(Draggable), 크기 조절(Resizable), 3단계 모드
   * =========================================================================
   */
  function initDraggableAndResizablePanel() {
    const panel = dom.bottomSheet;
    if (!panel) return;

    // --- 1. 창 크기 모드 버튼 이벤트 바인딩 ---
    if (dom.sheetBtnMinimize) {
      dom.sheetBtnMinimize.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanelMode('mini');
      });
    }

    if (dom.sheetBtnCompact) {
      dom.sheetBtnCompact.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanelMode('compact');
      });
    }

    if (dom.sheetBtnSidebar) {
      dom.sheetBtnSidebar.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanelMode('sidebar');
      });
    }

    if (dom.sheetBtnReset) {
      dom.sheetBtnReset.addEventListener('click', (e) => {
        e.stopPropagation();
        resetPanelPositionAndSize();
      });
    }

    // 최소화 슬림 바 클릭 시 원래 모드로 복귀 (펼치기)
    if (dom.sheetMiniBar) {
      dom.sheetMiniBar.addEventListener('click', (e) => {
        if (e.target.closest('#miniStartNavBtn') || e.target.closest('#miniOpenIndoorBtn')) return;
        setPanelMode(state.panelState.lastModeBeforeMini || 'default');
      });
    }

    if (dom.miniExpandBtn) {
      dom.miniExpandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setPanelMode(state.panelState.lastModeBeforeMini || 'default');
      });
    }

    // 최소화 슬림 바 내부 버튼
    if (dom.miniStartNavBtn) {
      dom.miniStartNavBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dom.startNavBtn?.click();
      });
    }
    if (dom.miniOpenIndoorBtn) {
      dom.miniOpenIndoorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openIndoorFloorPlanModal(state.selectedDestId);
      });
    }

    // 경로 옵션 탭 클릭 (큰길 우선 vs 최단 거리)
    if (dom.tabMainRoadRoute) {
      dom.tabMainRoadRoute.addEventListener('click', () => switchRouteOption('mainRoad'));
    }
    if (dom.tabShortestRoute) {
      dom.tabShortestRoute.addEventListener('click', () => switchRouteOption('shortest'));
    }

    // --- 2. 드래그 이동 (Drag & Drop) ---
    const handleEl = dom.sheetHandleArea;
    if (handleEl) {
      handleEl.addEventListener('pointerdown', onDragStart);
    }

    function onDragStart(e) {
      if (e.target.closest('button') || e.target.closest('select') || e.target.closest('input')) return;
      if (state.panelState.mode === 'sidebar') return;

      e.stopPropagation();
      try {
        handleEl.setPointerCapture(e.pointerId);
      } catch (err) {}

      const rect = panel.getBoundingClientRect();
      state.panelState.isDragging = true;
      state.panelState.dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      panel.classList.add('mode-floating');
      panel.style.transition = 'none';

      window.addEventListener('pointermove', onDragMove);
      window.addEventListener('pointerup', onDragEnd);
      window.addEventListener('pointercancel', onDragEnd);
    }

    function onDragMove(e) {
      if (!state.panelState.isDragging) return;
      e.stopPropagation();

      const panelWidth = panel.offsetWidth;
      const panelHeight = panel.offsetHeight;

      let newX = e.clientX - state.panelState.dragOffset.x;
      let newY = e.clientY - state.panelState.dragOffset.y;

      const minX = 8;
      const maxX = window.innerWidth - panelWidth - 8;
      const minY = 8;
      const maxY = window.innerHeight - panelHeight - 8;

      newX = Math.max(minX, Math.min(newX, maxX));
      newY = Math.max(minY, Math.min(newY, maxY));

      panel.style.left = `${newX}px`;
      panel.style.top = `${newY}px`;
      panel.style.bottom = 'auto';
      panel.style.transform = 'none';

      state.panelState.posX = newX;
      state.panelState.posY = newY;
    }

    function onDragEnd(e) {
      if (!state.panelState.isDragging) return;
      state.panelState.isDragging = false;
      panel.style.transition = '';

      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', onDragEnd);
      window.removeEventListener('pointercancel', onDragEnd);
    }

    // --- 3. 크기 직접 조절 (Resizable) ---
    const resizeHandles = panel.querySelectorAll('.sheet-resize-handle');
    resizeHandles.forEach((handle) => {
      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        try {
          handle.setPointerCapture(e.pointerId);
        } catch (err) {}

        state.panelState.isResizing = true;
        state.panelState.resizeHandle = handle.dataset.handle;
        state.panelState.initialRect = panel.getBoundingClientRect();
        state.panelState.initialPointer = { x: e.clientX, y: e.clientY };

        panel.classList.add('mode-floating');
        panel.style.transition = 'none';

        window.addEventListener('pointermove', onResizeMove);
        window.addEventListener('pointerup', onResizeEnd);
        window.addEventListener('pointercancel', onResizeEnd);
      });
    });

    function onResizeMove(e) {
      if (!state.panelState.isResizing) return;
      e.stopPropagation();

      const { initialRect, initialPointer, resizeHandle } = state.panelState;
      const dx = e.clientX - initialPointer.x;
      const dy = e.clientY - initialPointer.y;

      let newWidth = initialRect.width;
      let newHeight = initialRect.height;
      let newTop = initialRect.top;
      let newLeft = initialRect.left;

      if (resizeHandle.includes('top')) {
        newHeight = initialRect.height - dy;
        newTop = initialRect.top + dy;
      }
      if (resizeHandle.includes('left')) {
        newWidth = initialRect.width - dx;
        newLeft = initialRect.left + dx;
      }
      if (resizeHandle.includes('right')) {
        newWidth = initialRect.width + dx;
      }

      const minW = 310;
      const maxW = window.innerWidth - 16;
      const minH = 160;
      const maxH = window.innerHeight - 30;

      if (newWidth >= minW && newWidth <= maxW) {
        panel.style.width = `${newWidth}px`;
        if (resizeHandle.includes('left')) {
          panel.style.left = `${newLeft}px`;
        }
      }

      if (newHeight >= minH && newHeight <= maxH) {
        panel.style.maxHeight = `${newHeight}px`;
        panel.style.height = `${newHeight}px`;
        if (resizeHandle.includes('top')) {
          panel.style.top = `${newTop}px`;
          panel.style.bottom = 'auto';
        }
      }

      panel.style.transform = 'none';
    }

    function onResizeEnd() {
      if (!state.panelState.isResizing) return;
      state.panelState.isResizing = false;
      panel.style.transition = '';

      window.removeEventListener('pointermove', onResizeMove);
      window.removeEventListener('pointerup', onResizeEnd);
      window.removeEventListener('pointercancel', onResizeEnd);
    }
  }

  function setPanelMode(targetMode) {
    const panel = dom.bottomSheet;
    if (!panel) return;

    if (state.panelState.mode !== 'mini') {
      state.panelState.lastModeBeforeMini = state.panelState.mode;
    }

    state.panelState.mode = targetMode;

    panel.classList.remove('mode-mini', 'mode-compact', 'mode-sidebar');
    dom.sheetBtnMinimize?.classList.remove('active');
    dom.sheetBtnCompact?.classList.remove('active');
    dom.sheetBtnSidebar?.classList.remove('active');

    if (targetMode === 'mini') {
      panel.classList.add('mode-mini');
      dom.sheetBtnMinimize?.classList.add('active');
      showToast('창이 최소화되었습니다. 슬림 바를 누르면 다시 펼쳐집니다.');
    } else if (targetMode === 'compact') {
      panel.classList.add('mode-compact');
      dom.sheetBtnCompact?.classList.add('active');
    } else if (targetMode === 'sidebar') {
      panel.classList.add('mode-sidebar');
      dom.sheetBtnSidebar?.classList.add('active');
    } else {
      // default 모드
      if (!panel.classList.contains('mode-floating')) {
        resetPanelPositionAndSize();
      }
    }

    if (window.lucide) window.lucide.createIcons();
  }

  function togglePanelMode(mode) {
    if (state.panelState.mode === mode) {
      setPanelMode('default');
    } else {
      setPanelMode(mode);
    }
  }

  function resetPanelPositionAndSize() {
    const panel = dom.bottomSheet;
    if (!panel) return;

    panel.className = 'bottom-sheet';
    panel.style.left = '';
    panel.style.top = '';
    panel.style.bottom = '';
    panel.style.width = '';
    panel.style.height = '';
    panel.style.maxHeight = '';
    panel.style.transform = '';
    panel.style.transition = '';

    state.panelState.mode = 'default';
    state.panelState.lastModeBeforeMini = 'default';
    state.panelState.posX = null;
    state.panelState.posY = null;

    dom.sheetBtnMinimize?.classList.remove('active');
    dom.sheetBtnCompact?.classList.remove('active');
    dom.sheetBtnSidebar?.classList.remove('active');

    showToast('창 위치 및 크기가 기본값으로 초기화되었습니다.');
  }

  function updateTestOriginChipsActiveState() {
    if (!dom.testOriginChipsBar) return;
    dom.testOriginChipsBar.querySelectorAll('.test-origin-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.originId === state.startNodeId);
    });
  }

  function setNavigationStartOrigin(originId, options = {}) {
    const originNode = CAMPUS_NODES[originId];
    if (!originNode) return;

    state.startNodeId = originId;
    state.customGpsCoord = null;
    state.pendingIndoorEntranceId = null;

    if (dom.startNodeSelect) {
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
   * 7. 상단 검색창 자동완성 및 카테고리 필터 초기화
   */
  function initSearchAndCategories() {
    // 출발지 셀렉트박스 전체 건물 동적 생성 (주요 출입구를 최상단에 우선 배치)
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

    // 길찾기 바텀 시트 내 빠른 출발지 프리셋 칩 이벤트 바인딩
    if (dom.testOriginChipsBar) {
      dom.testOriginChipsBar.querySelectorAll('.test-origin-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          setNavigationStartOrigin(btn.dataset.originId, { announce: true });
        });
      });
      updateTestOriginChipsActiveState();
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
          hideAutocomplete();
          if (targetItem.dataset.indoorRoomId) {
            openITCollegeIndoorNavigation({
              roomId: targetItem.dataset.indoorRoomId,
              speak: true,
            });
          } else if (targetItem.dataset.buildingId) {
            openBuildingDetailView(targetItem.dataset.buildingId);
          }
        }
      } else if (e.key === 'Escape') {
        hideAutocomplete();
      }
    });

    dom.searchSubmitBtn.addEventListener('click', () => {
      const items = dom.autocompleteList.querySelectorAll('.autocomplete-item');
      if (items.length > 0) {
        const first = items[0];
        hideAutocomplete();
        if (first.dataset.indoorRoomId) {
          openITCollegeIndoorNavigation({
            roomId: first.dataset.indoorRoomId,
            speak: true,
          });
        } else if (first.dataset.buildingId) {
          openBuildingDetailView(first.dataset.buildingId);
        }
      } else {
        dom.searchInput.focus();
      }
    });

    dom.clearSearchBtn.addEventListener('click', () => {
      dom.searchInput.value = '';
      dom.clearSearchBtn.classList.add('hidden');
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

    // 1) IT대학 실내 강의실(예: "IT대학 203호", "203호", "101호", "303호" 등) 검색 매칭
    let matchedIndoorRooms = [];
    if (window.IT_COLLEGE_INDOOR_DATA && window.IT_COLLEGE_INDOOR_DATA.nodes) {
      const allRooms = Object.values(window.IT_COLLEGE_INDOOR_DATA.nodes).filter(
        (n) => n.type === 'classroom'
      );

      if (!normalized) {
        // 검색어가 비어있을 때도 대표 강의실(IT대학 203호, 310호, 101호, 303호)을 최상단에 추천
        matchedIndoorRooms = allRooms
          .filter((r) => ['room_203', 'room_310', 'room_101', 'room_303'].includes(r.id))
          .map((r) => ({
            room: r,
            score: r.id === 'room_203' ? 200 : r.id === 'room_310' ? 190 : 150,
          }));
      } else {
        allRooms.forEach((r) => {
          const fullText = `it대학 ${r.roomNumber} ${r.name} ${r.dept} ${(r.aliases || []).join(' ')}`.toLowerCase();
          const compactFull = fullText.replace(/\s+/g, '');
          const roomNumClean = (r.roomNumber || '').toLowerCase();

          let score = 0;
          if (
            compactFull.includes(compactQuery) ||
            fullText.includes(normalized)
          ) {
            score = 120;
            if (
              roomNumClean.startsWith(compactQuery.replace('it대학', '').replace('it', '')) ||
              (r.aliases || []).some((a) => a.toLowerCase().replace(/\s+/g, '') === compactQuery)
            ) {
              score = 220;
            }
            if (r.id === 'room_203' && compactQuery.includes('203')) {
              score = 260;
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

    // 2) 야외 캠퍼스 건물 검색 매칭
    const results = CAMPUS_BUILDINGS.map((b) => {
      const dist = Math.round(
        CampusRouter.haversineDistance(
          state.userPosition.lat,
          state.userPosition.lng,
          b.lat,
          b.lng
        )
      );
      const matchName =
        b.name.toLowerCase().includes(normalized) ||
        b.fullName.toLowerCase().includes(normalized);
      const matchKeyword = (b.keywords || []).some((k) =>
        k.toLowerCase().includes(normalized)
      );
      const matchRoom = (b.rooms || []).some((r) =>
        r.toLowerCase().includes(normalized)
      );

      let score = 0;
      if (!normalized) score = 10;
      else if (b.name.toLowerCase().startsWith(normalized)) score = 100;
      else if (matchName) score = 85;
      else if (matchRoom) score = 75;
      else if (matchKeyword) score = 60;

      return { building: b, dist, score };
    })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.dist - b.dist);

    const totalCount = matchedIndoorRooms.length + results.length;
    dom.dropdownHeaderTitle.textContent = normalized
      ? `'${query}' 검색 결과 (${totalCount}건)`
      : '수원대학교 주요 건물 · IT대학 실내 강의실 추천';

    dom.autocompleteList.innerHTML = '';
    state.focusedAutocompleteIndex = -1;

    // 실내 강의실 검색 결과를 상단에 먼저 렌더링
    matchedIndoorRooms.forEach(({ room }) => {
      const li = document.createElement('li');
      li.className = 'autocomplete-item indoor-room-ac-item';
      li.dataset.indoorRoomId = room.id;
      li.innerHTML = `
        <div class="ac-left">
          <div class="ac-icon-circle indoor-room-icon">${room.floor}</div>
          <div class="ac-text-wrap">
            <div class="ac-title-row">
              <span class="ac-name">IT대학 ${room.name}</span>
              <span class="ac-category indoor-badge-cat">2D 실내도면 · ${room.floor}</span>
            </div>
            <div class="ac-desc">${room.dept} · 엘리베이터/계단 최단경로 동시 안내</div>
          </div>
        </div>
        <div class="ac-right">
          <span class="ac-dist">IT대학 ${room.floor}</span>
          <span class="ac-go-tag indoor-go-tag">실내 안내 &rarr;</span>
        </div>
      `;
      li.addEventListener('click', () => {
        dom.searchInput.value = `IT대학 ${room.roomNumber}`;
        dom.clearSearchBtn.classList.remove('hidden');
        hideAutocomplete();
        openITCollegeIndoorNavigation({ roomId: room.id, speak: true });
      });
      dom.autocompleteList.appendChild(li);
    });

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
        dom.hudSoundWave.classList.add('speaking');
      },
      onSpeakEnd: () => {
        dom.hudSoundWave.classList.remove('speaking');
      },
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

        if (state.currentRoute && state.activeRoutePolylines.traveledLine) {
          const passedCoords = state.currentRoute.coordinates.slice(
            0,
            pos.currentSegmentIndex + 1
          );
          passedCoords.push([pos.lat, pos.lng]);
          state.activeRoutePolylines.traveledLine.setLatLngs(passedCoords);
        }

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

        dom.indoorTransitionBanner.classList.remove('hidden');
        if (route.destinationId === 'it_college' && indoorNav) {
          const entId =
            route.destinationEntranceId ||
            state.currentOutdoorEntranceId ||
            state.pendingIndoorEntranceId;
          const resolvedEnt = entId
            ? indoorNav.getEntranceById(entId)
            : indoorNav.router.resolveEntranceForOutdoorOrigin(state.startNodeId);
          const roomNode =
            window.IT_COLLEGE_INDOOR_DATA &&
            window.IT_COLLEGE_INDOOR_DATA.nodes[state.pendingIndoorRoomId || 'room_203'];
          const roomLabel = roomNode ? roomNode.roomNumber : '203호';
          dom.indoorBannerSub.textContent = resolvedEnt
            ? `IT대학 ${resolvedEnt.name}(${resolvedEnt.entryFloor} 진입)에 도착했습니다! 버튼을 눌러 ${roomLabel} 2D 실내 길안내로 전환하세요.`
            : `IT대학 입구에 도착했습니다! 2D 실내 도면(${roomLabel}) 안내로 전환할 수 있습니다.`;
        } else {
          dom.indoorBannerSub.textContent = `${route.destinationName} 실내 평면도(${
            route.destinationBuilding.floors || '실내 도면'
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

  function updateVoiceHud(logItem) {
    dom.navVoiceHud.classList.remove('hidden');
    dom.hudVoiceText.textContent = logItem.text;

    let iconName = 'navigation';
    let badgeText = '실시간 음성 길안내';
    if (logItem.turnType === 'right') {
      iconName = 'corner-up-right';
      badgeText = '우회전 안내';
    } else if (logItem.turnType === 'left') {
      iconName = 'corner-up-left';
      badgeText = '좌회전 안내';
    } else if (logItem.turnType === 'arrive') {
      iconName = 'map-pin';
      badgeText = '목적지 도착 완료';
    }

    dom.hudStepBadge.textContent = badgeText;
    setLucideIcon(dom.hudTurnIconBox, iconName);
  }

  /**
   * 9. 버튼 및 UI 인터랙션 이벤트 바인딩
   */
  function bindControlEvents() {
    // USW 로고 및 나침반 클릭 시 캠퍼스 중심 복귀
    const resetToCampusCenter = () => {
      state.map.setView(
        SUWON_CAMPUS_CONFIG.center,
        SUWON_CAMPUS_CONFIG.defaultZoom,
        { animate: true }
      );
      showToast('수원대학교 캠퍼스 중심으로 이동했습니다.');
    };
    dom.uswBrandBtn.addEventListener('click', resetToCampusCenter);
    dom.resetCampusViewBtn.addEventListener('click', resetToCampusCenter);

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
      refreshBuildingMarkersStyle();
      switchSheetView('explore');
    });

    // State 03 (길찾기 시트) 닫기 버튼
    dom.closeSheetBtn.addEventListener('click', () => {
      if (simulator && simulator.state !== 'idle') {
        simulator.stop();
      }
      tts.stop();
      state.isNavigating = false;
      dom.navVoiceHud.classList.add('hidden');
      state.layers.routeGroup.clearLayers();
      state.layers.arrowGroup.clearLayers();
      state.layers.checkpointGroup.clearLayers();
      if (state.selectedDestId) {
        switchSheetView('building');
      } else {
        switchSheetView('explore');
      }
    });

    // [안내 시작] 버튼
    dom.startNavBtn.addEventListener('click', () => {
      if (!state.currentRoute) {
        startRouteFindingToBuilding(state.selectedDestId || 'it_college');
      }
      const route = state.currentRoute;
      if (!route) return;

      const startCoord = route.coordinates[0];
      const firstBearing = route.segments[0] ? route.segments[0].bearing : 180;
      createOrUpdateUserMarker(startCoord[0], startCoord[1], firstBearing);
      state.map.setView(startCoord, 17, { animate: true });

      const startCp = route.checkpoints[0];
      renderCheckpointTimeline(route.checkpoints, 0);
      tts.speak(startCp.voiceText, { turnType: 'start' });

      state.isNavigating = true;
      state.triggeredGpsCheckpoints.clear();
      state.triggeredGpsCheckpoints.add(startCp.id);
      dom.startNavBtnText.textContent = '실시간 안내 중';
      dom.startNavBtn.classList.add('active-nav');
      showToast(`${route.destinationName} 입구까지 음성 길안내를 시작합니다.`);

      // 요구사항: 안내 시작 시 창을 자동으로 '최소화(한 줄 모드)'로 접어 지도를 시원하게 표시
      setPanelMode('mini');
    });

    // [가상 이동 시뮬레이션] 버튼 (우측 플로팅 & 바텀 시트 공통)
    const handleSimulationTrigger = () => {
      if (state.activeSheetView !== 'route' || !state.currentRoute) {
        startRouteFindingToBuilding(state.selectedDestId || 'it_college');
      }
      if (simulator.state === 'running') {
        simulator.pause();
        showToast('가상 이동 시뮬레이션을 일시정지했습니다.');
      } else {
        switchSheetView('route');
        simulator.start(state.currentRoute);
        showToast('가상 이동 시뮬레이션을 시작합니다.');

        // 요구사항: 시뮬레이션 시작 시 창을 자동으로 '최소화(한 줄 모드)'로 접어 이동 경로를 한눈에 표시
        setPanelMode('mini');
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

    dom.hudRepeatVoiceBtn.addEventListener('click', () => {
      if (state.lastSpokenText) {
        tts.setEnabled(true);
        tts.speak(state.lastSpokenText, { turnType: 'start' });
      }
    });

    // 내 위치(GPS) 버튼
    dom.myLocationBtn.addEventListener('click', () => {
      state.gpsFollowMode = true;
      state.map.setView(
        [state.userPosition.lat, state.userPosition.lng],
        17,
        { animate: true }
      );
      showToast('현재 내 위치로 지도를 이동했습니다.');
    });

    // 우측 상단 [로드뷰 / 위성] 전환 카드 버튼
    dom.mapLayerToggleBtn.addEventListener('click', () => {
      if (state.currentMapMode === 'street') {
        state.map.removeLayer(state.tileLayers.streetWithLabels);
        state.tileLayers.satellite.addTo(state.map);
        state.currentMapMode = 'satellite';
        dom.mapLayerLabel.textContent = '일반맵';
        dom.mapLayerToggleBtn.classList.add('satellite-active');
        showToast('캠퍼스 위성/항공뷰로 전환되었습니다.');
      } else {
        state.map.removeLayer(state.tileLayers.satellite);
        state.tileLayers.streetWithLabels.addTo(state.map);
        state.currentMapMode = 'street';
        dom.mapLayerLabel.textContent = '로드뷰';
        dom.mapLayerToggleBtn.classList.remove('satellite-active');
        showToast('캠퍼스 일반 지도로 전환되었습니다.');
      }
    });

    // 보행로 그래프 표시 토글
    dom.toggleGraphDebugBtn.addEventListener('click', () => {
      state.showGraphDebug = !state.showGraphDebug;
      dom.toggleGraphDebugBtn.classList.toggle('active', state.showGraphDebug);
      renderCampusGraphNetwork();
    });

    // 바텀 시트 드래그 핸들 클릭 시 접기/펼치기
    dom.sheetHandleArea.addEventListener('click', () => {
      dom.bottomSheet.classList.toggle('collapsed');
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
    initSearchAndCategories();
    initVoiceAndSimulation();
    initRoadEditor();
    initDraggableAndResizablePanel();

    if (window.IndoorNavigator && window.IT_COLLEGE_INDOOR_DATA) {
      indoorNav = new window.IndoorNavigator({
        tts,
        onSpeakHud: (text, badgeTitle) => {
          state.lastSpokenText = text;
          dom.navVoiceHud.classList.remove('hidden');
          dom.hudVoiceText.textContent = text;
          dom.hudStepBadge.textContent = badgeTitle || '실내 음성 길안내';
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
        onRequestOutdoorRouteToEntrance: (entrance, roomId) => {
          state.pendingIndoorEntranceId = entrance.id;
          state.pendingIndoorRoomId = roomId || 'room_203';
          indoorNav.close();
          startRouteFindingToBuilding('it_college', { keepIndoorEntrance: true });
          showToast(
            `IT대학 ${entrance.name}(${entrance.entryFloor} 진입)까지 야외 최단 경로를 안내합니다.`
          );
        },
      });
    }

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
