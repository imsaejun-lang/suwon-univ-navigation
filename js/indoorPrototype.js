/**
 * 수원대학교 스마트 캠퍼스 내비게이션 - 전체화면 실내 지도 프로토타입 뷰 (Full-Screen Indoor UI Prototype)
 * - 기존 IndoorNavigator(레거시 실내 지도)의 데이터·다익스트라 엔진·상태를 100% 공유하면서
 *   언제든 [✨ 새 실내 UI (프로토타입)] ↔ [기존 실내 지도] 간 안전하게 토글 전환 가능
 * - 하드코딩 없이 IT_COLLEGE_INDOOR_DATA의 실제 층별 호실·복도·계단·엘리베이터·출입구 데이터를 동적 렌더링
 */

class IndoorPrototypeView {
  constructor(indoorNav) {
    this.nav = indoorNav;
    this.isOpen = false;
    this.isOriginalPlanView = false; // false: 깔끔한 벡터 도면 | true: 원본 피난안내도 이미지 대조 뷰
    this.isDetailModalOpen = false;
    this.origViewFloor = null; // 원본 도면 보기 시 선택 층

    // 프로토타입 전용 애니메이션/안내 상태
    this.protoSimTimer = null;
    this.isProtoNavigating = false;
    this.protoSimPos = null; // { floor, x, y }
    this.protoWaitingFloorConfirm = false;

    this.dom = {};
    this.initDom();
    this.bindEvents();
  }

  initDom() {
    this.dom.overlay = document.getElementById('indoorProtoOverlay');
    if (!this.dom.overlay) return;

    this.dom.backBtn = document.getElementById('protoBackBtn');
    this.dom.switchLegacyBtn = document.getElementById('protoSwitchToLegacyBtn');
    this.dom.legacySwitchToProtoBtn = document.getElementById('indoorSwitchToProtoBtn');

    // 출발·도착 요약 카드
    this.dom.originRowBtn = document.getElementById('protoOriginRowBtn');
    this.dom.destRowBtn = document.getElementById('protoDestRowBtn');
    this.dom.originText = document.getElementById('protoOriginText');
    this.dom.destText = document.getElementById('protoDestText');
    this.dom.metricText = document.getElementById('protoMetricText');
    this.dom.inlinePickerBox = document.getElementById('protoInlinePickerBox');
    this.dom.inlinePickerLabel = document.getElementById('protoInlinePickerLabel');
    this.dom.inlinePickerSelect = document.getElementById('protoInlinePickerSelect');
    this.dom.inlinePickerClose = document.getElementById('protoInlinePickerClose');

    // 계단 / 엘리베이터 탭
    this.dom.tabStairsBtn = document.getElementById('protoTabStairsBtn');
    this.dom.tabStairsTime = document.getElementById('protoTabStairsTime');
    this.dom.tabElevatorBtn = document.getElementById('protoTabElevatorBtn');
    this.dom.tabElevatorTime = document.getElementById('protoTabElevatorTime');

    // 도면 카드 영역
    this.dom.floorplanCard = document.getElementById('protoFloorplanCard');
    this.dom.vectorWrap = document.getElementById('protoVectorWrap');
    this.dom.originalWrap = document.getElementById('protoOriginalWrap');
    this.dom.floorTransitionBar = document.getElementById('protoFloorTransitionBar');
    this.dom.floorTransitionMsg = document.getElementById('protoFloorTransitionMsg');
    this.dom.floorTransitionConfirmBtn = document.getElementById('protoFloorTransitionConfirmBtn');

    // 단계별 핵심 요약 리스트
    this.dom.stepList = document.getElementById('protoStepList');

    // 하단 액션 버튼 3종
    this.dom.startNavBtn = document.getElementById('protoStartNavBtn');
    this.dom.startNavLabel = document.getElementById('protoStartNavLabel');
    this.dom.detailRouteBtn = document.getElementById('protoDetailRouteBtn');
    this.dom.originalPlanBtn = document.getElementById('protoOriginalPlanBtn');
    this.dom.originalPlanLabel = document.getElementById('protoOriginalPlanLabel');

    // 상세 경로 모달
    this.dom.detailModal = document.getElementById('protoDetailModal');
    this.dom.detailModalClose = document.getElementById('protoDetailModalClose');
    this.dom.detailModalSubtitle = document.getElementById('protoDetailModalSubtitle');
    this.dom.detailModalList = document.getElementById('protoDetailModalList');
  }

  bindEvents() {
    if (!this.dom.overlay || !this.nav) return;

    // 기존 실내 지도 헤더의 [✨ 새 실내 UI (프로토타입)] 토글 버튼
    if (this.dom.legacySwitchToProtoBtn) {
      this.dom.legacySwitchToProtoBtn.addEventListener('click', () => {
        this.open();
      });
    }

    // 프로토타입 헤더의 [기존 실내 지도] 복귀 토글 버튼
    if (this.dom.switchLegacyBtn) {
      this.dom.switchLegacyBtn.addEventListener('click', () => {
        this.switchToLegacyUI();
      });
    }

    // 좌측 상단 뒤로가기(←) -> 실내 지도 종료하고 야외 지도로 복귀
    if (this.dom.backBtn) {
      this.dom.backBtn.addEventListener('click', () => {
        this.closeAllToOutdoor();
      });
    }

    // 계단 / 엘리베이터 탭 전환 (실제 다익스트라 경로 재계산 및 즉시 UI 갱신)
    if (this.dom.tabStairsBtn) {
      this.dom.tabStairsBtn.addEventListener('click', () => {
        this.stopProtoNavigation();
        this.nav.selectRouteMode('stairs', { speak: true });
        this.render();
      });
    }

    if (this.dom.tabElevatorBtn) {
      this.dom.tabElevatorBtn.addEventListener('click', () => {
        this.stopProtoNavigation();
        this.nav.selectRouteMode('elevator', { speak: true });
        this.render();
      });
    }

    // 출발지 / 도착지 카드 행 클릭 -> 인라인 빠른 호실/출입구 선택기 열기
    if (this.dom.originRowBtn) {
      this.dom.originRowBtn.addEventListener('click', () => {
        this.openInlinePicker('origin');
      });
    }
    if (this.dom.destRowBtn) {
      this.dom.destRowBtn.addEventListener('click', () => {
        this.openInlinePicker('destination');
      });
    }
    if (this.dom.inlinePickerClose) {
      this.dom.inlinePickerClose.addEventListener('click', () => {
        this.closeInlinePicker();
      });
    }
    if (this.dom.inlinePickerSelect) {
      this.dom.inlinePickerSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        const mode = this.dom.inlinePickerBox?.dataset.pickerRole;
        if (!val || !mode) return;
        this.stopProtoNavigation();
        if (mode === 'origin') {
          if (val.startsWith('ent_')) {
            this.nav.directionMode = 'enter';
            this.nav.customOriginNodeId = null;
            this.nav.selectEntrance(val, { speak: true });
          } else {
            this.nav.directionMode = 'indoor';
            this.nav.setOriginRoom(val, { speak: true });
          }
        } else {
          if (val.startsWith('ent_')) {
            this.nav.directionMode = 'exit';
            this.nav.selectEntrance(val, { speak: true });
          } else {
            if (this.nav.directionMode === 'exit') {
              this.nav.directionMode = 'indoor';
            }
            this.nav.setDestinationRoom(val, { speak: true, resetFloorToStart: false });
          }
        }
        this.closeInlinePicker();
        this.render();
      });
    }

    // 하단 메인 버튼: [길안내 시작] / [안내 중지]
    if (this.dom.startNavBtn) {
      this.dom.startNavBtn.addEventListener('click', () => {
        if (this.isProtoNavigating) {
          this.stopProtoNavigation();
          this.render();
        } else {
          this.startProtoNavigation();
        }
      });
    }

    // 층간 이동 완료 버튼 (프로토타입 내 인라인 바)
    if (this.dom.floorTransitionConfirmBtn) {
      this.dom.floorTransitionConfirmBtn.addEventListener('click', () => {
        this.confirmProtoFloorTransition();
      });
    }

    // 하단 좌측 버튼: [상세 경로]
    if (this.dom.detailRouteBtn) {
      this.dom.detailRouteBtn.addEventListener('click', () => {
        this.openDetailModal();
      });
    }
    if (this.dom.detailModalClose) {
      this.dom.detailModalClose.addEventListener('click', () => {
        this.closeDetailModal();
      });
    }
    if (this.dom.detailModal) {
      this.dom.detailModal.addEventListener('click', (e) => {
        if (e.target === this.dom.detailModal) {
          this.closeDetailModal();
        }
      });
    }

    // 하단 우측 버튼: [원본 도면] <-> [깔끔한 도면] 전환
    if (this.dom.originalPlanBtn) {
      this.dom.originalPlanBtn.addEventListener('click', () => {
        this.toggleOriginalPlanView();
      });
    }

    // IndoorNavigator 상태 변경 시 자동 동기화
    this.nav.onStateUpdated = () => {
      if (this.isOpen) {
        this.render();
      }
    };
  }

  /**
   * 프로토타입 전체화면 열기 (기존 실내 지도 컨테이너를 덮지 않고 별도 전체화면 오버레이로 표시)
   */
  open(options = {}) {
    if (!this.dom.overlay || !this.nav) return;

    // 기존 실내 지도가 아직 열려 있지 않거나 경로가 계산되지 않은 경우 안전하게 초기화
    if (!this.nav.dualRoutes || (!this.nav.dualRoutes.elevator && !this.nav.dualRoutes.stairs)) {
      this.nav.recalculateAndRender({ resetFloorToStart: true });
    }

    this.nav.stopIndoorSimulation();
    this.stopProtoNavigation();
    this.isOriginalPlanView = Boolean(options.showOriginalPlan);
    this.closeDetailModal();
    this.closeInlinePicker();

    this.isOpen = true;
    this.dom.overlay.classList.remove('hidden');

    // 기존 실내 컨테이너는 데이터/DOM 보존 상태로만 숨김
    if (this.nav.dom && this.nav.dom.container) {
      this.nav.dom.container.classList.add('hidden');
    }

    this.render();
    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * [기존 실내 지도] 화면으로 안전하게 즉시 전환 (현재 경로·호실·모드 100% 유지)
   */
  switchToLegacyUI() {
    this.stopProtoNavigation();
    this.closeDetailModal();
    this.closeInlinePicker();
    this.isOpen = false;

    if (this.dom.overlay) {
      this.dom.overlay.classList.add('hidden');
    }

    if (this.nav && this.nav.dom && this.nav.dom.container) {
      this.nav.isOpen = true;
      this.nav.dom.container.classList.remove('hidden');
      this.nav.recalculateAndRender({ resetFloorToStart: false });
      this.nav.syncImageAndOverlayBounds();
      if (this.nav.onShowToast) {
        this.nav.onShowToast('기존 2D 실내 지도 화면으로 전환했습니다.');
      }
    }
    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * 프로토타입 및 실내 지도 모두 닫고 야외 지도로 복귀
   */
  closeAllToOutdoor() {
    this.stopProtoNavigation();
    this.closeDetailModal();
    this.closeInlinePicker();
    this.isOpen = false;

    if (this.dom.overlay) {
      this.dom.overlay.classList.add('hidden');
    }
    if (this.nav) {
      this.nav.close();
    }
  }

  /**
   * 출발지/도착지 인라인 빠른 선택기 열기
   */
  openInlinePicker(role) {
    if (!this.dom.inlinePickerBox || !this.dom.inlinePickerSelect) return;

    const isOrigin = role === 'origin';
    this.dom.inlinePickerBox.dataset.pickerRole = role;
    if (this.dom.inlinePickerLabel) {
      this.dom.inlinePickerLabel.textContent = isOrigin
        ? '출발 위치 변경 (출입구 또는 현재 호실)'
        : '목적지 강의실 변경';
    }

    const activeRoute = this.nav.getActiveRoute();
    const currentId = isOrigin
      ? activeRoute?.startNode?.id
      : activeRoute?.endNode?.id;

    let html = '';

    // 출입구 목록 (출발지 또는 탈출 목적지 선택용)
    html += `<optgroup label="🚪 IT대학 출입구">`;
    (this.nav.data.entrances || []).forEach((ent) => {
      const sel = ent.nodeId === currentId ? 'selected' : '';
      html += `<option value="${ent.nodeId}" ${sel}>[${ent.entryFloor}] ${ent.name}</option>`;
    });
    html += `</optgroup>`;

    // 층별 실제 강의실 목록 (IT_COLLEGE_INDOOR_DATA 기반 동적 생성)
    const classrooms = Object.values(this.nav.data.nodes).filter((n) => n.type === 'classroom');
    ['1F', '2F', '3F', '4F', '5F'].forEach((fId) => {
      const rooms = classrooms
        .filter((r) => r.floor === fId)
        .sort((a, b) => String(a.roomNumber).localeCompare(String(b.roomNumber), 'ko', { numeric: true }));
      if (!rooms.length) return;
      html += `<optgroup label="🏢 IT대학 ${fId.replace('F', '층')}">`;
      rooms.forEach((r) => {
        const sel = r.id === currentId ? 'selected' : '';
        html += `<option value="${r.id}" ${sel}>[${fId}] ${r.name}</option>`;
      });
      html += `</optgroup>`;
    });

    this.dom.inlinePickerSelect.innerHTML = html;
    this.dom.inlinePickerBox.classList.remove('hidden');
    this.dom.inlinePickerSelect.focus();
  }

  closeInlinePicker() {
    if (this.dom.inlinePickerBox) {
      this.dom.inlinePickerBox.classList.add('hidden');
    }
  }

  /**
   * [원본 도면] ↔ [깔끔한 벡터 도면] 전환
   */
  toggleOriginalPlanView() {
    this.isOriginalPlanView = !this.isOriginalPlanView;
    const activeRoute = this.nav.getActiveRoute();
    if (this.isOriginalPlanView && activeRoute) {
      this.origViewFloor = activeRoute.startNode.floor;
    }
    this.renderFloorplanSection(activeRoute);
    this.updateOriginalPlanBtnLabel();
  }

  updateOriginalPlanBtnLabel() {
    if (!this.dom.originalPlanBtn || !this.dom.originalPlanLabel) return;
    this.dom.originalPlanBtn.classList.toggle('active', this.isOriginalPlanView);
    this.dom.originalPlanLabel.textContent = this.isOriginalPlanView ? '깔끔한 도면' : '원본 도면';
  }

  /**
   * 노드 표시명 포맷 (예: "IT대학 3층 308호", "IT대학 1층 남동측 주출입구")
   */
  formatNodeDisplayName(node) {
    if (!node) return 'IT대학';
    const floorKo = String(node.floor || '1F').replace('F', '층');
    const bld = this.nav.data.buildingName || 'IT대학';
    if (node.type === 'classroom') {
      return `${bld} ${floorKo} ${node.roomNumber || node.name}`;
    }
    if (node.type === 'entrance') {
      const cleanName = String(node.name || '').replace(/^(남동측|동측|북측|남측|서측 언덕)\s*\d층\s*/, '$1 ');
      return `${bld} ${floorKo} ${cleanName || node.name}`;
    }
    return `${bld} ${floorKo} ${node.name || node.id}`;
  }

  /**
   * 전체 프로토타입 화면 렌더링
   */
  render() {
    if (!this.isOpen || !this.nav) return;

    const elvRoute = this.nav.dualRoutes.elevator;
    const stairRoute = this.nav.dualRoutes.stairs;
    const activeRoute = this.nav.getActiveRoute();
    if (!activeRoute) return;

    // 1. 출발 · 도착 · 소요시간/거리 요약 카드 업데이트
    if (this.dom.originText) {
      this.dom.originText.textContent = this.formatNodeDisplayName(activeRoute.startNode);
    }
    if (this.dom.destText) {
      const destBase = this.formatNodeDisplayName(activeRoute.endNode);
      this.dom.destText.textContent =
        this.nav.directionMode === 'exit' && this.nav.outdoorDestName
          ? `${destBase} ➔ ${this.nav.outdoorDestName}`
          : destBase;
    }
    if (this.dom.metricText) {
      this.dom.metricText.textContent = `약 ${activeRoute.estimatedMinutes}분 · ${activeRoute.totalDistanceMeters}m`;
    }

    // 2. [계단 N분] vs [엘리베이터 N분] 탭 업데이트
    const isStairs = this.nav.activeRouteMode === 'stairs';
    if (this.dom.tabStairsBtn && stairRoute) {
      this.dom.tabStairsBtn.classList.toggle('active', isStairs);
      this.dom.tabStairsBtn.setAttribute('aria-selected', String(isStairs));
      if (this.dom.tabStairsTime) {
        this.dom.tabStairsTime.textContent = activeRoute.isSameFloor
          ? `도보 ${stairRoute.estimatedMinutes}분`
          : `${stairRoute.estimatedMinutes}분`;
      }
    }
    if (this.dom.tabElevatorBtn && elvRoute) {
      this.dom.tabElevatorBtn.classList.toggle('active', !isStairs);
      this.dom.tabElevatorBtn.setAttribute('aria-selected', String(!isStairs));
      if (this.dom.tabElevatorTime) {
        this.dom.tabElevatorTime.textContent = activeRoute.isSameFloor
          ? `같은 층 ${elvRoute.estimatedMinutes}분`
          : `${elvRoute.estimatedMinutes}분`;
      }
    }

    // 3. 가독성 극대화 도면 섹션 (벡터 도면 또는 원본 도면)
    this.renderFloorplanSection(activeRoute);

    // 4. 단계별 핵심 요약 리스트 (3~4줄)
    this.renderStepSummaryList(activeRoute);

    // 5. 하단 버튼 상태 동기화
    this.updateActionButtonsState();
    this.updateOriginalPlanBtnLabel();
  }

  /**
   * 도면 카드 렌더링 (미니멀 벡터 SVG 뷰 vs 원본 피난안내도 이미지 뷰)
   */
  renderFloorplanSection(activeRoute) {
    if (!activeRoute || !this.dom.vectorWrap || !this.dom.originalWrap) return;

    if (this.isOriginalPlanView) {
      this.dom.vectorWrap.classList.add('hidden');
      this.dom.originalWrap.classList.remove('hidden');
      this.renderOriginalFloorplanCompare(activeRoute);
    } else {
      this.dom.originalWrap.classList.add('hidden');
      this.dom.vectorWrap.classList.remove('hidden');
      this.dom.vectorWrap.innerHTML = this.buildUnifiedProtoSvg(activeRoute);
      this.bindVectorRoomClickEvents();
    }
  }

  /**
   * 벡터 도면 내 강의실 클릭 시 해당 강의실로 즉시 목적지 변경 지원
   */
  bindVectorRoomClickEvents() {
    if (!this.dom.vectorWrap) return;
    this.dom.vectorWrap.querySelectorAll('[data-proto-room-id]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const roomId = el.getAttribute('data-proto-room-id');
        if (!roomId || roomId === this.nav.selectedRoomId) return;
        this.stopProtoNavigation();
        if (this.nav.directionMode === 'exit') {
          this.nav.directionMode = 'indoor';
        }
        this.nav.setDestinationRoom(roomId, { speak: true, resetFloorToStart: false });
        this.render();
      });
    });
  }

  /**
   * 특정 층의 실제 노드/간선 데이터를 바탕으로 미니멀 건축 도면 크롭 영역(Y축 범위) 계산
   * - 상단 빈 ROOF/OPEN 영역을 자동 제외하여 실제 강의실/복도가 큼직하게 보이도록 최적화
   */
  computeFloorCropY(floorId, routeNodesOnFloor = []) {
    const allNodes = Object.values(this.nav.data.nodes).filter((n) => n.floor === floorId);
    const routeMinY = routeNodesOnFloor.length
      ? Math.min(...routeNodesOnFloor.map((n) => Number(n.y)))
      : 60;
    const routeMaxY = routeNodesOnFloor.length
      ? Math.max(...routeNodesOnFloor.map((n) => Number(n.y)))
      : 90;

    // 3F/4F/5F 및 1F/2F 남측 주 강의실 동(y >= 46) 위주 경로일 때는 상단 거대 ROOF/대극장 여백을 크롭!
    const needsNorthWing = routeMinY < 46;
    if (needsNorthWing) {
      const minAll = Math.min(...allNodes.map((n) => Number(n.y)));
      const maxAll = Math.max(...allNodes.map((n) => Number(n.y)));
      return {
        yMin: Math.max(2, minAll - 7),
        yMax: Math.min(97, maxAll + 7),
      };
    }

    // 주 복도/강의실 동 기준 깔끔한 수평 띠 뷰 (사진2.jpg 비율과 유사)
    const wingNodes = allNodes.filter((n) => Number(n.y) >= 52);
    const baseMin = wingNodes.length ? Math.min(...wingNodes.map((n) => Number(n.y))) : 56;
    const baseMax = wingNodes.length ? Math.max(...wingNodes.map((n) => Number(n.y))) : 89;

    return {
      yMin: Math.max(48, Math.min(baseMin, routeMinY) - 6.5),
      yMax: Math.min(95.5, Math.max(baseMax, routeMaxY) + 6.5),
    };
  }

  /**
   * 한 개 층의 깔끔한 건축 벡터 SVG 내부 요소 생성
   * - x: 0..100 (건물 좌우), y: yMin..yMax 를 (offsetY .. offsetY + tierHeight)로 매핑
   */
  buildSingleFloorTierSvg(floorId, segNodes, activeRoute, transformFn, tierBounds) {
    const { mapX, mapY, scaleX, scaleY } = transformFn;
    const { xMin, xMax, yMin, yMax } = tierBounds;

    const nodesOnFloor = Object.values(this.nav.data.nodes).filter(
      (n) => n.floor === floorId && n.y >= yMin - 2 && n.y <= yMax + 2
    );
    const nodeMapOnFloor = {};
    nodesOnFloor.forEach((n) => {
      nodeMapOnFloor[n.id] = n;
    });

    const corridors = nodesOnFloor.filter((n) => n.type === 'corridor');
    const classrooms = nodesOnFloor.filter((n) => n.type === 'classroom');
    const restrooms = nodesOnFloor.filter((n) => n.type === 'restroom');
    const stairsNodes = nodesOnFloor.filter((n) => n.type === 'stairs');
    const elevatorNodes = nodesOnFloor.filter((n) => n.type === 'elevator');
    const entranceNodes = nodesOnFloor.filter((n) => n.type === 'entrance');

    const startId = activeRoute.startNode?.id;
    const endId = activeRoute.endNode?.id;
    const activeDepTransitId = activeRoute.verticalTransition?.departureNode?.id;
    const activeArrTransitId = activeRoute.verticalTransition?.arrivalNode?.id;

    let svg = '';
    const highlightedOverlays = [];
    const highlightedBoxMap = {};

    // 1. 건물 외곽 쉘 (보이는 노드들의 경계를 감싸는 연한 건축 평면 배경)
    const visiblePts = nodesOnFloor.filter((n) => n.type !== 'custom_origin');
    if (visiblePts.length > 0) {
      const bMinX = Math.max(xMin + 1, Math.min(...visiblePts.map((n) => n.x)) - 4.2);
      const bMaxX = Math.min(xMax - 1, Math.max(...visiblePts.map((n) => n.x)) + 4.2);
      const bMinY = Math.max(yMin + 0.5, Math.min(...visiblePts.map((n) => n.y)) - 4.5);
      const bMaxY = Math.min(yMax - 0.5, Math.max(...visiblePts.map((n) => n.y)) + 4.5);

      svg += `
        <rect
          x="${mapX(bMinX).toFixed(1)}"
          y="${mapY(bMinY).toFixed(1)}"
          width="${((bMaxX - bMinX) * scaleX).toFixed(1)}"
          height="${((bMaxY - bMinY) * scaleY).toFixed(1)}"
          rx="3"
          fill="#ffffff"
          stroke="#cbd5e1"
          stroke-width="1.25"
        />
      `;
    }

    // 2. 실제 복도 네트워크(Corridor Edges)를 깔끔한 흰색 복도 + 얇은 회색 벽선으로 렌더링
    const floorCorridorEdges = (this.nav.data.edges || []).filter(
      (e) =>
        !e.isVertical &&
        nodeMapOnFloor[e.from] &&
        nodeMapOnFloor[e.to] &&
        nodeMapOnFloor[e.from].type === 'corridor' &&
        nodeMapOnFloor[e.to].type === 'corridor'
    );

    floorCorridorEdges.forEach((e) => {
      const a = nodeMapOnFloor[e.from];
      const b = nodeMapOnFloor[e.to];
      svg += `
        <line
          x1="${mapX(a.x).toFixed(1)}" y1="${mapY(a.y).toFixed(1)}"
          x2="${mapX(b.x).toFixed(1)}" y2="${mapY(b.y).toFixed(1)}"
          stroke="#e2e8f0"
          stroke-width="${(3.8 * Math.min(scaleX, scaleY)).toFixed(1)}"
          stroke-linecap="square"
        />
      `;
    });
    floorCorridorEdges.forEach((e) => {
      const a = nodeMapOnFloor[e.from];
      const b = nodeMapOnFloor[e.to];
      svg += `
        <line
          x1="${mapX(a.x).toFixed(1)}" y1="${mapY(a.y).toFixed(1)}"
          x2="${mapX(b.x).toFixed(1)}" y2="${mapY(b.y).toFixed(1)}"
          stroke="#ffffff"
          stroke-width="${(3.1 * Math.min(scaleX, scaleY)).toFixed(1)}"
          stroke-linecap="square"
        />
      `;
    });

    // 3. 강의실 구획(Rooms) 계산 및 비강조 방 먼저 렌더링 (강조 방은 경로선 위로 깔끔히 올려 글자 가림 원천 차단!)
    classrooms.forEach((room) => {
      const isHighlighted = room.id === startId || room.id === endId;

      let minDx = 11.0;
      classrooms.forEach((other) => {
        if (other.id === room.id) return;
        if (Math.abs(other.y - room.y) < 5.5) {
          const dx = Math.abs(other.x - room.x);
          if (dx > 1.5 && dx < minDx) minDx = dx;
        }
      });

      let nearestCorrDy = 7.0;
      corridors.forEach((c) => {
        if (Math.abs(c.x - room.x) < 10) {
          const dy = Math.abs(c.y - room.y);
          if (dy > 1.5 && dy < nearestCorrDy) nearestCorrDy = dy;
        }
      });

      const isLargeHall = room.id === 'room_105' || room.id === 'room_101' || room.id === 'room_109';
      const rwUnits = isLargeHall ? Math.min(14, minDx - 0.6) : Math.max(5.0, Math.min(8.4, minDx - 0.55));
      const rhUnits = isLargeHall ? 9.5 : Math.max(4.6, Math.min(7.8, nearestCorrDy * 1.38));

      let rw = rwUnits * scaleX;
      let rh = rhUnits * scaleY;
      if (isHighlighted) {
        rw = Math.max(rw, 40);
        rh = Math.max(rh, 25);
      }

      const cx = mapX(room.x);
      const cy = mapY(room.y);
      const rx = Math.max(6, Math.min(344 - rw, cx - rw / 2));
      const ry = cy - rh / 2;
      const labelText = room.roomNumber || room.shortLabel || '';

      if (isHighlighted) {
        highlightedBoxMap[room.id] = { rx, ry, rw, rh, cx: rx + rw / 2, cy: ry + rh / 2 };
        highlightedOverlays.push(`
          <g class="proto-room-box highlighted" data-proto-room-id="${room.id}" style="cursor:pointer;">
            <rect
              x="${rx.toFixed(1)}" y="${ry.toFixed(1)}"
              width="${rw.toFixed(1)}" height="${rh.toFixed(1)}"
              rx="3.5"
              fill="#bae6fd"
              stroke="#0284c7"
              stroke-width="1.8"
            />
            <text
              x="${(rx + rw / 2).toFixed(1)}"
              y="${(ry + rh / 2 + 4.2).toFixed(1)}"
              text-anchor="middle"
              font-size="11.5"
              font-weight="900"
              fill="#08386b"
            >${labelText}</text>
          </g>
        `);
      } else {
        svg += `
          <g class="proto-room-box" data-proto-room-id="${room.id}" style="cursor:pointer;">
            <rect
              x="${rx.toFixed(1)}" y="${ry.toFixed(1)}"
              width="${rw.toFixed(1)}" height="${rh.toFixed(1)}"
              rx="2.5"
              fill="#eef2f7"
              stroke="#b8c4d4"
              stroke-width="1.05"
            />
            ${
              rw >= 22
                ? `<text
                    x="${(rx + rw / 2).toFixed(1)}"
                    y="${(ry + rh / 2 + 3.0).toFixed(1)}"
                    text-anchor="middle"
                    font-size="8.0"
                    font-weight="600"
                    fill="#94a3b8"
                  >${labelText.replace('호', '')}</text>`
                : ''
            }
          </g>
        `;
      }
    });

    // 4. 화장실 구획
    restrooms.forEach((wc) => {
      const rw = 4.2 * scaleX;
      const rh = 3.8 * scaleY;
      svg += `
        <rect
          x="${(mapX(wc.x) - rw / 2).toFixed(1)}"
          y="${(mapY(wc.y) - rh / 2).toFixed(1)}"
          width="${rw.toFixed(1)}"
          height="${rh.toFixed(1)}"
          rx="2"
          fill="#f1f5f9"
          stroke="#cbd5e1"
          stroke-width="0.9"
        />
      `;
    });

    // 5. 계단 구획 (미니멀 계단 가로선 기호)
    stairsNodes.forEach((st) => {
      const isUsed = st.id === activeDepTransitId || st.id === activeArrTransitId;
      const sw = 4.6 * scaleX;
      const sh = 5.4 * scaleY;
      const sx = mapX(st.x) - sw / 2;
      const sy = mapY(st.y) - sh / 2;

      let stepsLines = '';
      for (let k = 1; k <= 5; k++) {
        const ly = sy + (sh * k) / 6;
        stepsLines += `<line x1="${(sx + 1.5).toFixed(1)}" y1="${ly.toFixed(1)}" x2="${(sx + sw - 1.5).toFixed(1)}" y2="${ly.toFixed(1)}" stroke="${isUsed ? '#93c5fd' : '#cbd5e1'}" stroke-width="1" />`;
      }
      svg += `
        <g class="proto-stair-glyph">
          <rect
            x="${sx.toFixed(1)}" y="${sy.toFixed(1)}"
            width="${sw.toFixed(1)}" height="${sh.toFixed(1)}"
            rx="2"
            fill="${isUsed ? '#eff6ff' : '#f8fafc'}"
            stroke="${isUsed ? '#60a5fa' : '#b8c4d4'}"
            stroke-width="1.1"
          />
          ${stepsLines}
        </g>
      `;
    });

    // 6. 엘리베이터 샤프트 구획
    elevatorNodes.forEach((elv) => {
      const isUsed = elv.id === activeDepTransitId || elv.id === activeArrTransitId;
      const ew = 4.2 * scaleX;
      const eh = 4.6 * scaleY;
      const ex = mapX(elv.x) - ew / 2;
      const ey = mapY(elv.y) - eh / 2;
      svg += `
        <g class="proto-elv-glyph">
          <rect
            x="${ex.toFixed(1)}" y="${ey.toFixed(1)}"
            width="${ew.toFixed(1)}" height="${eh.toFixed(1)}"
            rx="2"
            fill="${isUsed ? '#eff6ff' : '#f1f5f9'}"
            stroke="${isUsed ? '#60a5fa' : '#b8c4d4'}"
            stroke-width="1.1"
          />
          <line x1="${ex.toFixed(1)}" y1="${ey.toFixed(1)}" x2="${(ex + ew).toFixed(1)}" y2="${(ey + eh).toFixed(1)}" stroke="${isUsed ? '#93c5fd' : '#cbd5e1'}" stroke-width="0.8" />
          <line x1="${(ex + ew).toFixed(1)}" y1="${ey.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${(ey + eh).toFixed(1)}" stroke="${isUsed ? '#93c5fd' : '#cbd5e1'}" stroke-width="0.8" />
        </g>
      `;
    });

    // 7. 출입구 표시 (출발/도착 출입구는 경로선 위로 올려 글자 가림 방지)
    entranceNodes.forEach((ent) => {
      const isHighlighted = ent.id === startId || ent.id === endId;
      if (!isHighlighted) {
        svg += `
          <circle cx="${mapX(ent.x).toFixed(1)}" cy="${mapY(ent.y).toFixed(1)}" r="2.8" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1" />
        `;
        return;
      }
      const bw = 54;
      const bh = 23;
      const bx = Math.max(8, Math.min(342 - bw, mapX(ent.x) - bw / 2));
      const by = mapY(ent.y) - bh / 2;
      const shortEntLabel = `${ent.floor} 입구`;
      highlightedBoxMap[ent.id] = { rx: bx, ry: by, rw: bw, rh: bh, cx: bx + bw / 2, cy: by + bh / 2 };
      highlightedOverlays.push(`
        <g class="proto-entrance-box highlighted">
          <rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw}" height="${bh}" rx="5" fill="#bae6fd" stroke="#0284c7" stroke-width="1.7" />
          <text x="${(bx + bw / 2).toFixed(1)}" y="${(by + 15.2).toFixed(1)}" text-anchor="middle" font-size="10.8" font-weight="900" fill="#08386b">${shortEntLabel}</text>
        </g>
      `);
    });

    // 8. 직각(ㄱ/ㄴ) 복도 경로선 + 최소한의 깔끔한 파란 원형 방향 화살표 (강조 방 아래에 그려 글자를 절대 가리지 않음!)
    if (Array.isArray(segNodes) && segNodes.length >= 2) {
      const orthoPts = this.nav.ensureOrthogonalPoints(segNodes);
      const mappedPts = orthoPts.map((p) => ({ x: mapX(p.x), y: mapY(p.y) }));
      const pathD = this.buildRoundedPolylinePath(mappedPts, 6);

      svg += `
        <path
          d="${pathD}"
          fill="none"
          stroke="#ffffff"
          stroke-width="7.0"
          stroke-linecap="round"
          stroke-linejoin="round"
          opacity="0.92"
        />
        <path
          d="${pathD}"
          fill="none"
          stroke="#0068ff"
          stroke-width="4.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      `;

      let lastArrowPt = null;
      for (let i = 0; i < mappedPts.length - 1; i++) {
        const a = mappedPts[i];
        const b = mappedPts[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const segPx = Math.hypot(dx, dy);
        if (segPx < 36) continue;

        const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
        const count = segPx >= 145 ? 2 : 1;

        for (let k = 1; k <= count; k++) {
          const r = count === 1 ? 0.5 : k === 1 ? 0.34 : 0.68;
          const cx = a.x + dx * r;
          const cy = a.y + dy * r;
          if (lastArrowPt && Math.hypot(cx - lastArrowPt.x, cy - lastArrowPt.y) < 44) continue;
          const startPx = mappedPts[0];
          const endPx = mappedPts[mappedPts.length - 1];
          if (Math.hypot(cx - startPx.x, cy - startPx.y) < 26) continue;
          if (Math.hypot(cx - endPx.x, cy - endPx.y) < 26) continue;

          lastArrowPt = { x: cx, y: cy };
          svg += `
            <g transform="translate(${cx.toFixed(1)}, ${cy.toFixed(1)}) rotate(${angleDeg.toFixed(1)})">
              <circle cx="0" cy="0" r="6.0" fill="#0068ff" stroke="#ffffff" stroke-width="1.5" />
              <path d="M -1.8 -2.5 L 2.2 0 L -1.8 2.5" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </g>
          `;
        }
      }
    }

    // 9. 강조된 출발·도착 방/출입구 박스 렌더링 (항상 파란 경로선 위에 선명하게 표시!)
    svg += highlightedOverlays.join('');

    // 10. 출발지 / 도착지 파란 핀 아이콘 (강조 방 상단 테두리에 깔끔히 안착)
    const renderBluePin = (node) => {
      if (!node || node.floor !== floorId) return '';
      const box = highlightedBoxMap[node.id];
      const px = box ? box.cx : mapX(node.x);
      const py = box ? box.ry + 2 : mapY(node.y) - 10;
      return `
        <g transform="translate(${px.toFixed(1)}, ${py.toFixed(1)})" filter="url(#protoPinShadow)">
          <path
            d="M 0 0 C -5 -6 -8.8 -9.8 -8.8 -14.2 A 8.8 8.8 0 1 1 8.8 -14.2 C 8.8 -9.8 5 -6 0 0 Z"
            fill="#0068ff"
            stroke="#ffffff"
            stroke-width="1.7"
          />
          <circle cx="0" cy="-14.2" r="3.3" fill="#ffffff" />
        </g>
      `;
    };

    if (activeRoute.startNode && activeRoute.startNode.floor === floorId) {
      svg += renderBluePin(activeRoute.startNode);
    }
    if (activeRoute.endNode && activeRoute.endNode.floor === floorId) {
      svg += renderBluePin(activeRoute.endNode);
    }

    // 11. 실시간 안내 시뮬레이션 진행 중 사용자 마커 (pulsing dot)
    if (this.isProtoNavigating && this.protoSimPos && this.protoSimPos.floor === floorId) {
      const ux = mapX(this.protoSimPos.x);
      const uy = mapY(this.protoSimPos.y);
      svg += `
        <g transform="translate(${ux.toFixed(1)}, ${uy.toFixed(1)})">
          <circle cx="0" cy="0" r="11" fill="#0068ff" opacity="0.22" class="proto-user-pulse" />
          <circle cx="0" cy="0" r="5.5" fill="#0068ff" stroke="#ffffff" stroke-width="2.2" />
        </g>
      `;
    }

    return svg;
  }

  /**
   * 꺾이는 복도 코너를 부드럽게 라운드 처리한 SVG Path 생성
   */
  buildRoundedPolylinePath(pts, radius = 6) {
    if (!pts || pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    if (pts.length === 2) {
      return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
    }

    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const next = pts[i + 1];
      const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const d2 = Math.hypot(next.x - curr.x, next.y - curr.y);
      if (d1 < 1 || d2 < 1) {
        d += ` L ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
        continue;
      }
      const r = Math.min(radius, d1 * 0.4, d2 * 0.4);
      const p1x = curr.x - ((curr.x - prev.x) / d1) * r;
      const p1y = curr.y - ((curr.y - prev.y) / d1) * r;
      const p2x = curr.x + ((next.x - curr.x) / d2) * r;
      const p2y = curr.y + ((next.y - curr.y) / d2) * r;
      d += ` L ${p1x.toFixed(1)} ${p1y.toFixed(1)} Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)} ${p2x.toFixed(1)} ${p2y.toFixed(1)}`;
    }
    const last = pts[pts.length - 1];
    d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
    return d;
  }

  /**
   * [핵심] 단일 층(같은 층 이동) 또는 2단 수직 연결(층간 이동) 통합 벡터 SVG 생성
   */
  buildUnifiedProtoSvg(activeRoute) {
    const svgWidth = 350;
    const padX = 12;
    const xMin = 2;
    const xMax = 98;
    const scaleX = (svgWidth - padX * 2) / (xMax - xMin);
    const mapX = (x) => padX + (x - xMin) * scaleX;

    const defsSvg = `
      <defs>
        <filter id="protoPinShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#08386b" flood-opacity="0.28" />
        </filter>
        <filter id="protoBadgeShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" flood-color="#08386b" flood-opacity="0.32" />
        </filter>
        <linearGradient id="protoDividerGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f1f5f9" stop-opacity="0.95" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.2" />
        </linearGradient>
      </defs>
    `;

    // A. 같은 층 이동: 해당 1개 층 도면을 큼직하게 표시
    if (activeRoute.isSameFloor) {
      const floorId = activeRoute.startNode.floor;
      const seg = activeRoute.floorSegments.find((s) => s.floor === floorId);
      const segNodes = seg ? seg.nodes : activeRoute.fullNodes;
      const { yMin, yMax } = this.computeFloorCropY(floorId, segNodes);
      const tierH = Math.max(165, Math.min(240, (yMax - yMin) * 3.6));
      const padTop = 34;
      const padBottom = 16;
      const totalH = padTop + tierH + padBottom;
      const scaleY = tierH / (yMax - yMin);
      const mapY = (y) => padTop + (y - yMin) * scaleY;

      const tierSvg = this.buildSingleFloorTierSvg(
        floorId,
        segNodes,
        activeRoute,
        { mapX, mapY, scaleX, scaleY },
        { xMin, xMax, yMin, yMax }
      );

      return `
        <svg class="proto-floorplan-svg" viewBox="0 0 ${svgWidth} ${totalH.toFixed(0)}" role="img" aria-label="IT대학 ${floorId} 실내 경로 도면">
          ${defsSvg}
          <rect x="0" y="0" width="${svgWidth}" height="${totalH.toFixed(0)}" fill="#fafcff" />
          ${tierSvg}
          <!-- 좌상단 층수 배지 -->
          <g transform="translate(12, 10)">
            <rect x="0" y="0" width="42" height="22" rx="11" fill="#08386b" />
            <text x="21" y="15" text-anchor="middle" font-size="11.5" font-weight="800" fill="#ffffff">${floorId}</text>
          </g>
          <text x="62" y="25" font-size="11" font-weight="700" fill="#64748b">같은 층 직통 이동</text>
        </svg>
      `;
    }

    // B. 층간 이동 (2단 연결 뷰): 출발 층(위) + 도착 층(아래) + 계단/엘리베이터 수직 점선 화살표 연결!
    const vt = activeRoute.verticalTransition;
    const startFloor = activeRoute.startNode.floor;
    const endFloor = activeRoute.endNode.floor;
    const topSeg = activeRoute.floorSegments[0];
    const bottomSeg = activeRoute.floorSegments[activeRoute.floorSegments.length - 1];

    const topCrop = this.computeFloorCropY(startFloor, topSeg ? topSeg.nodes : []);
    const bottomCrop = this.computeFloorCropY(endFloor, bottomSeg ? bottomSeg.nodes : []);

    const topTierH = Math.max(108, Math.min(138, (topCrop.yMax - topCrop.yMin) * 2.55));
    const bottomTierH = Math.max(108, Math.min(138, (bottomCrop.yMax - bottomCrop.yMin) * 2.55));

    const topPadY = 22;
    const midGapH = 28;
    const bottomPadY = 12;

    const topStartY = topPadY;
    const dividerY = topStartY + topTierH + 4;
    const bottomStartY = dividerY + midGapH;
    const totalH = bottomStartY + bottomTierH + bottomPadY;

    const topScaleY = topTierH / (topCrop.yMax - topCrop.yMin);
    const topMapY = (y) => topStartY + (y - topCrop.yMin) * topScaleY;

    const bottomScaleY = bottomTierH / (bottomCrop.yMax - bottomCrop.yMin);
    const bottomMapY = (y) => bottomStartY + (y - bottomCrop.yMin) * bottomScaleY;

    const topTierSvg = this.buildSingleFloorTierSvg(
      startFloor,
      topSeg ? topSeg.nodes : [],
      activeRoute,
      { mapX, mapY: topMapY, scaleX, scaleY: topScaleY },
      { xMin, xMax, yMin: topCrop.yMin, yMax: topCrop.yMax }
    );

    const bottomTierSvg = this.buildSingleFloorTierSvg(
      endFloor,
      bottomSeg ? bottomSeg.nodes : [],
      activeRoute,
      { mapX, mapY: bottomMapY, scaleX, scaleY: bottomScaleY },
      { xMin, xMax, yMin: bottomCrop.yMin, yMax: bottomCrop.yMax }
    );

    // 수직 이동 점선 화살표 및 짙은 남색 계단/엘리베이터 배지 (사진2.jpg 핵심 시그니처)
    let connectorSvg = '';
    let isWestShaft = false;
    if (vt && vt.departureNode && vt.arrivalNode) {
      const depX = mapX(vt.departureNode.x);
      const depY = topMapY(vt.departureNode.y);
      const arrX = mapX(vt.arrivalNode.x);
      const arrY = bottomMapY(vt.arrivalNode.y);
      isWestShaft = depX < 85 || arrX < 85;

      const midY = dividerY + midGapH * 0.5;
      const isElv = vt.transitType === 'elevator';

      const connPath =
        Math.abs(depX - arrX) < 3
          ? `M ${depX.toFixed(1)} ${(depY + 13).toFixed(1)} L ${arrX.toFixed(1)} ${(arrY - 2).toFixed(1)}`
          : `M ${depX.toFixed(1)} ${(depY + 13).toFixed(1)} L ${depX.toFixed(1)} ${midY.toFixed(1)} L ${arrX.toFixed(1)} ${midY.toFixed(1)} L ${arrX.toFixed(1)} ${(arrY - 2).toFixed(1)}`;

      const arrowX = Math.abs(depX - arrX) < 3 ? depX : arrX;
      const arrowY = Math.min(arrY - 12, midY + 5);

      const transitIconSvg = isElv
        ? `
          <rect x="-8" y="-6.5" width="16" height="13" rx="2" fill="none" stroke="#ffffff" stroke-width="1.5" />
          <circle cx="-3" cy="-2.2" r="1.4" fill="#ffffff" />
          <path d="M -5 3.5 L -5 0.5 L -1 0.5 L -1 3.5" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" />
          <circle cx="3" cy="-2.2" r="1.4" fill="#ffffff" />
          <path d="M 1 3.5 L 1 0.5 L 5 0.5 L 5 3.5" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" />
        `
        : `
          <path d="M -9 6 L -4 6 L -4 2 L 1 2 L 1 -2 L 6 -2 L 6 -6 L 9 -6" fill="none" stroke="#ffffff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" />
        `;

      connectorSvg = `
        <g class="proto-vertical-connector">
          <path
            d="${connPath}"
            fill="none"
            stroke="#ffffff"
            stroke-width="6.5"
            stroke-linecap="round"
            opacity="0.88"
          />
          <path
            d="${connPath}"
            fill="none"
            stroke="#0068ff"
            stroke-width="3.2"
            stroke-dasharray="4 4.2"
            stroke-linecap="round"
          />
          <g transform="translate(${arrowX.toFixed(1)}, ${arrowY.toFixed(1)})">
            <circle cx="0" cy="0" r="6.5" fill="#ffffff" />
            <path d="M -4 -1.8 L 0 2.8 L 4 -1.8" fill="none" stroke="#0068ff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" />
          </g>
          <g transform="translate(${depX.toFixed(1)}, ${depY.toFixed(1)})" filter="url(#protoBadgeShadow)">
            <rect x="-15" y="-13" width="30" height="26" rx="6" fill="#08386b" stroke="#ffffff" stroke-width="2" />
            ${transitIconSvg}
          </g>
        </g>
      `;
    }

    // 서측 계단/엘리베이터 사용 시 층 배지가 수직 점선과 겹치지 않도록 우상단 배치 (동측 사용 시 좌상단 배치)
    const floorBadgeX = isWestShaft ? svgWidth - 54 : 12;

    return `
      <svg class="proto-floorplan-svg" viewBox="0 0 ${svgWidth} ${totalH.toFixed(0)}" role="img" aria-label="IT대학 ${startFloor}에서 ${endFloor} 다층 이동 도면">
        ${defsSvg}
        <!-- 상단(출발 층) 영역 -->
        <rect x="0" y="0" width="${svgWidth}" height="${dividerY.toFixed(0)}" fill="#f8fafd" />
        <!-- 층 구분 부드러운 그라데이션 띠 -->
        <rect x="0" y="${dividerY.toFixed(0)}" width="${svgWidth}" height="${midGapH}" fill="url(#protoDividerGrad)" />
        <line x1="12" y1="${dividerY.toFixed(0)}" x2="${svgWidth - 12}" y2="${dividerY.toFixed(0)}" stroke="#e2e8f0" stroke-width="1" />
        <!-- 하단(도착 층) 영역 -->
        <rect x="0" y="${bottomStartY.toFixed(0)}" width="${svgWidth}" height="${(totalH - bottomStartY).toFixed(0)}" fill="#ffffff" />

        ${topTierSvg}
        ${bottomTierSvg}
        ${connectorSvg}

        <!-- 상단 출발 층 배지 -->
        <g transform="translate(${floorBadgeX}, 7)">
          <rect x="0" y="0" width="42" height="21" rx="10.5" fill="#08386b" />
          <text x="21" y="14.5" text-anchor="middle" font-size="11.5" font-weight="800" fill="#ffffff">${startFloor}</text>
        </g>

        <!-- 하단 도착 층 배지 -->
        <g transform="translate(${floorBadgeX}, ${(dividerY + 7).toFixed(0)})">
          <rect x="0" y="0" width="42" height="21" rx="10.5" fill="#08386b" />
          <text x="21" y="14.5" text-anchor="middle" font-size="11.5" font-weight="800" fill="#ffffff">${endFloor}</text>
        </g>
      </svg>
    `;
  }

  /**
   * [원본 도면] 대조 뷰 렌더링: 실제 프로젝트의 피난안내도 이미지(it_floor_Nf.png) + 직각 복도 경로 SVG 오버레이
   */
  renderOriginalFloorplanCompare(activeRoute) {
    if (!this.dom.originalWrap || !activeRoute) return;

    const startFloor = activeRoute.startNode.floor;
    const endFloor = activeRoute.endNode.floor;
    const floorsToChoose = activeRoute.isSameFloor ? [startFloor] : [startFloor, endFloor];
    if (!this.origViewFloor || !floorsToChoose.includes(this.origViewFloor)) {
      this.origViewFloor = startFloor;
    }

    const floorMeta = this.nav.getFloorMeta(this.origViewFloor);
    const seg = activeRoute.floorSegments.find((s) => s.floor === this.origViewFloor);
    let routeSvgInner = '';

    if (seg && seg.nodes.length >= 2) {
      const orthoPts = this.nav.ensureOrthogonalPoints(seg.nodes);
      const ptsAttr = orthoPts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
      routeSvgInner = `
        <polyline points="${ptsAttr}" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        <polyline points="${ptsAttr}" fill="none" stroke="#0068ff" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" />
      `;
      if (activeRoute.startNode.floor === this.origViewFloor) {
        routeSvgInner += `<circle cx="${activeRoute.startNode.x}" cy="${activeRoute.startNode.y}" r="2.1" fill="#0068ff" stroke="#ffffff" stroke-width="0.6" />`;
      }
      if (activeRoute.endNode.floor === this.origViewFloor) {
        routeSvgInner += `<circle cx="${activeRoute.endNode.x}" cy="${activeRoute.endNode.y}" r="2.1" fill="#e11d48" stroke="#ffffff" stroke-width="0.6" />`;
      }
    }

    const floorTabsHtml = floorsToChoose
      .map((fId, idx) => {
        const isAct = fId === this.origViewFloor;
        const roleTag = activeRoute.isSameFloor ? '' : idx === 0 ? ' 출발층' : ' 도착층';
        return `<button type="button" class="proto-orig-floor-tab ${isAct ? 'active' : ''}" data-orig-floor="${fId}">${fId}${roleTag}</button>`;
      })
      .join('');

    this.dom.originalWrap.innerHTML = `
      <div class="proto-orig-toolbar">
        <div class="proto-orig-tabs">${floorTabsHtml}</div>
        ${
          floorMeta && floorMeta.pdf
            ? `<a href="${encodeURI(floorMeta.pdf)}" target="_blank" rel="noopener" class="proto-orig-pdf-link">원본 PDF ↗</a>`
            : ''
        }
      </div>
      <div class="proto-orig-stage">
        <img src="${floorMeta ? floorMeta.image : 'assets/floorplans/it_floor_1f.png'}" alt="IT대학 ${this.origViewFloor} 원본 피난안내도" class="proto-orig-img" />
        <svg class="proto-orig-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${routeSvgInner}</svg>
      </div>
      <div class="proto-orig-caption">${floorMeta ? floorMeta.title : this.origViewFloor} · 실제 건축 평면도 대조 모드</div>
    `;

    this.dom.originalWrap.querySelectorAll('[data-orig-floor]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.origViewFloor = btn.getAttribute('data-orig-floor');
        this.renderOriginalFloorplanCompare(activeRoute);
      });
    });
  }

  /**
   * 계산된 실제 경로에서 3~4줄 핵심 요약 단계 생성
   */
  buildConciseSteps(activeRoute) {
    const steps = [];
    const startFloorKo = String(activeRoute.startNode.floor || '1F').replace('F', '층');
    const endFloorKo = String(activeRoute.endNode.floor || '1F').replace('F', '층');
    const destShort =
      activeRoute.endNode.type === 'classroom'
        ? activeRoute.endNode.roomNumber || activeRoute.endNode.name
        : activeRoute.endNode.name;

    if (activeRoute.isSameFloor) {
      const startShort =
        activeRoute.startNode.type === 'classroom'
          ? activeRoute.startNode.roomNumber
          : activeRoute.startNode.name;
      steps.push({
        num: 1,
        icon: 'arrow',
        text: `${startFloorKo} ${startShort}에서 복도로 이동`,
      });
      steps.push({
        num: 2,
        icon: 'arrow',
        text: `${startFloorKo} 복도를 따라 직진 (${activeRoute.totalDistanceMeters}m)`,
      });
      steps.push({
        num: 3,
        icon: 'pin',
        text: `${destShort} 도착`,
      });
      return steps;
    }

    const vt = activeRoute.verticalTransition;
    const isElv = vt && vt.transitType === 'elevator';
    const transitKo = isElv ? '엘리베이터' : '계단';
    const depSeg = activeRoute.floorSegments[0];
    const arrSeg = activeRoute.floorSegments[activeRoute.floorSegments.length - 1];

    const depDist = this.estimateSegmentMeters(depSeg ? depSeg.nodes : []);
    const arrDist = this.estimateSegmentMeters(arrSeg ? arrSeg.nodes : []);

    // Step 1: 출발 층 복도 이동
    steps.push({
      num: 1,
      icon: 'arrow',
      text:
        depDist >= 10
          ? `${startFloorKo} 복도를 따라 ${transitKo} 방면 직진 (${depDist}m)`
          : `${startFloorKo} ${transitKo} 방향으로 이동`,
    });

    // Step 2: 계단 / 엘리베이터 층간 이동
    const dirHint = vt && vt.direction === 'up' ? '올라가기' : '내려가기';
    const transitWithParticle = isElv ? '엘리베이터로' : '계단으로';
    steps.push({
      num: 2,
      icon: isElv ? 'elevator' : 'stairs',
      text: `${transitWithParticle} ${endFloorKo} 이동 (${vt ? vt.floorDiff : 1}개 층 ${dirHint})`,
    });

    // Step 3 (필요 시): 도착 층 복도 이동이 충분한 거리일 때
    if (arrDist >= 22) {
      steps.push({
        num: 3,
        icon: 'arrow',
        text: `${endFloorKo} 복도를 따라 ${destShort} 방면 직진 (${arrDist}m)`,
      });
      steps.push({
        num: 4,
        icon: 'pin',
        text: `${destShort}까지 이동 · 도착`,
      });
    } else {
      steps.push({
        num: 3,
        icon: 'pin',
        text: `${destShort}까지 이동`,
      });
    }

    return steps;
  }

  estimateSegmentMeters(nodes) {
    if (!Array.isArray(nodes) || nodes.length < 2) return 0;
    const ortho = this.nav.ensureOrthogonalPoints(nodes);
    let total = 0;
    for (let i = 0; i < ortho.length - 1; i++) {
      total += Math.hypot(ortho[i + 1].x - ortho[i].x, ortho[i + 1].y - ortho[i].y);
    }
    return Math.max(3, Math.round(total * 1.15));
  }

  getStepIconSvg(iconType) {
    if (iconType === 'stairs') {
      return `<svg viewBox="0 0 24 24" class="proto-step-svg" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4v-4h4v-4h4V8h4"/></svg>`;
    }
    if (iconType === 'elevator') {
      return `<svg viewBox="0 0 24 24" class="proto-step-svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M9 3l-2 2-2-2M19 5l-2-2-2 2"/><circle cx="10" cy="11" r="1.2"/><path d="M8.5 17v-3h3v3"/><circle cx="14.5" cy="11" r="1.2"/><path d="M13 17v-3h3v3"/></svg>`;
    }
    if (iconType === 'pin') {
      return `<svg viewBox="0 0 24 24" class="proto-step-svg pin" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg>`;
    }
    return `<svg viewBox="0 0 24 24" class="proto-step-svg" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>`;
  }

  renderStepSummaryList(activeRoute) {
    if (!this.dom.stepList || !activeRoute) return;
    const conciseSteps = this.buildConciseSteps(activeRoute);

    this.dom.stepList.innerHTML = conciseSteps
      .map(
        (step) => `
          <li class="proto-step-item">
            <span class="proto-step-num">${step.num}</span>
            <span class="proto-step-icon-wrap">${this.getStepIconSvg(step.icon)}</span>
            <span class="proto-step-text">${step.text}</span>
          </li>
        `
      )
      .join('');
  }

  /**
   * [상세 경로] 모달: 실제 직교 복도 세그먼트의 회전(좌회전/우회전/직진) 및 거리 상세 안내 생성
   */
  openDetailModal() {
    if (!this.dom.detailModal || !this.dom.detailModalList) return;
    const activeRoute = this.nav.getActiveRoute();
    if (!activeRoute) return;

    this.isDetailModalOpen = true;
    const modeLabel = this.nav.activeRouteMode === 'elevator' ? '엘리베이터 우선' : '계단 우선';
    if (this.dom.detailModalSubtitle) {
      this.dom.detailModalSubtitle.textContent = `${modeLabel} · 총 ${activeRoute.totalDistanceMeters}m (약 ${activeRoute.estimatedMinutes}분)`;
    }

    const detailedItems = this.buildDetailedTurnByTurnItems(activeRoute);
    this.dom.detailModalList.innerHTML = detailedItems
      .map(
        (item, idx) => `
          <li class="proto-detail-row" data-tts-idx="${idx}">
            <div class="proto-detail-badge ${item.kind}">${item.floor}</div>
            <div class="proto-detail-body">
              <strong>${item.title}</strong>
              <span>${item.sub}</span>
            </div>
            ${item.distLabel ? `<span class="proto-detail-dist">${item.distLabel}</span>` : ''}
          </li>
        `
      )
      .join('');

    this.dom.detailModalList.querySelectorAll('.proto-detail-row').forEach((row) => {
      row.addEventListener('click', () => {
        const idx = Number(row.getAttribute('data-tts-idx'));
        const item = detailedItems[idx];
        if (item && item.voice) {
          this.nav.speak(item.voice, '상세 실내 안내');
        }
      });
    });

    this.dom.detailModal.classList.remove('hidden');
  }

  closeDetailModal() {
    this.isDetailModalOpen = false;
    if (this.dom.detailModal) {
      this.dom.detailModal.classList.add('hidden');
    }
  }

  buildDetailedTurnByTurnItems(activeRoute) {
    const items = [];
    const startNode = activeRoute.startNode;
    const endNode = activeRoute.endNode;

    items.push({
      floor: startNode.floor,
      kind: 'start',
      title: `${startNode.name || startNode.roomNumber} 출발`,
      sub: '실내 복도 안내를 시작합니다.',
      distLabel: '0m',
      voice: `${startNode.name || startNode.roomNumber}에서 출발합니다.`,
    });

    const addFloorTurns = (seg) => {
      if (!seg || !Array.isArray(seg.nodes) || seg.nodes.length < 2) return;
      const ortho = this.nav.ensureOrthogonalPoints(seg.nodes);
      let accumUnits = 0;

      for (let i = 0; i < ortho.length - 1; i++) {
        const a = ortho[i];
        const b = ortho[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        accumUnits += len;

        if (i < ortho.length - 2) {
          const c = ortho[i + 2];
          const v1x = b.x - a.x;
          const v1y = b.y - a.y;
          const v2x = c.x - b.x;
          const v2y = c.y - b.y;
          const cross = v1x * v2y - v1y * v2x;
          const dot = v1x * v2x + v1y * v2y;
          const angle = Math.abs((Math.atan2(cross, dot) * 180) / Math.PI);

          if (angle >= 45 && accumUnits >= 2.5) {
            const turnDir = cross > 0 ? '우회전' : '좌회전';
            const meters = Math.max(3, Math.round(accumUnits * 1.15));
            items.push({
              floor: seg.floor,
              kind: 'turn',
              title: `${meters}m 이동 후 ${turnDir}`,
              sub: `${seg.floor.replace('F', '층')} 복도 코너에서 ${turnDir}하세요.`,
              distLabel: `${meters}m`,
              voice: `${meters}미터 앞 복도 코너에서 ${turnDir}하세요.`,
            });
            accumUnits = 0;
          }
        } else if (accumUnits >= 3) {
          const meters = Math.max(3, Math.round(accumUnits * 1.15));
          items.push({
            floor: seg.floor,
            kind: 'straight',
            title: `복도를 따라 ${meters}m 직진`,
            sub: `${seg.floor.replace('F', '층')} 복도 구간 이동`,
            distLabel: `${meters}m`,
            voice: `복도를 따라 ${meters}미터 직진하세요.`,
          });
        }
      }
    };

    if (activeRoute.isSameFloor) {
      addFloorTurns(activeRoute.floorSegments[0]);
    } else {
      const vt = activeRoute.verticalTransition;
      addFloorTurns(activeRoute.floorSegments[0]);

      if (vt) {
        const isElv = vt.transitType === 'elevator';
        const transitKo = isElv ? '엘리베이터' : '계단';
        items.push({
          floor: `${vt.fromFloor}➔${vt.toFloor}`,
          kind: 'transit',
          title: `${vt.departureNode.name} ➔ ${vt.toFloor.replace('F', '층')} 이동`,
          sub: `${transitKo}을 이용해 ${vt.toFloor.replace('F', '층')}으로 ${vt.direction === 'up' ? '올라가세요' : '내려가세요'}.`,
          distLabel: `${vt.floorDiff}개 층`,
          voice: vt.ttsPrompt,
        });
      }

      addFloorTurns(activeRoute.floorSegments[activeRoute.floorSegments.length - 1]);
    }

    items.push({
      floor: endNode.floor,
      kind: 'arrive',
      title: `${endNode.roomNumber || endNode.name} 도착`,
      sub: `${this.formatNodeDisplayName(endNode)} 문 앞에 도착합니다.`,
      distLabel: `총 ${activeRoute.totalDistanceMeters}m`,
      voice: `목적지 ${endNode.roomNumber || endNode.name} 앞에 도착했습니다.`,
    });

    return items;
  }

  /**
   * [길안내 시작] 실행: 프로토타입 벡터 도면 위 실시간 안내 시뮬레이션 + 음성 안내(TTS)
   */
  startProtoNavigation() {
    const activeRoute = this.nav.getActiveRoute();
    if (!activeRoute) return;

    this.stopProtoNavigation();
    this.isProtoNavigating = true;
    this.protoWaitingFloorConfirm = false;

    // 원본 도면 모드였다면 벡터 도면으로 보여줘서 2단 애니메이션이 한눈에 보이게 처리
    if (this.isOriginalPlanView) {
      this.isOriginalPlanView = false;
      this.updateOriginalPlanBtnLabel();
    }

    this.updateActionButtonsState();

    const firstSeg = activeRoute.floorSegments[0];
    if (activeRoute.steps && activeRoute.steps[0]) {
      this.nav.speak(activeRoute.steps[0].ttsText, '실내 길안내 시작');
    }

    this.animateProtoSegment(firstSeg.nodes, () => {
      if (activeRoute.isSameFloor) {
        this.finishProtoNavigation(activeRoute);
      } else if (activeRoute.verticalTransition) {
        this.promptProtoFloorTransition(activeRoute.verticalTransition);
      }
    });
  }

  promptProtoFloorTransition(vt) {
    this.protoWaitingFloorConfirm = true;
    this.protoSimPos = {
      floor: vt.departureNode.floor,
      x: vt.departureNode.x,
      y: vt.departureNode.y,
    };
    this.renderFloorplanSection(this.nav.getActiveRoute());

    if (this.dom.floorTransitionBar && this.dom.floorTransitionMsg && this.dom.floorTransitionConfirmBtn) {
      this.dom.floorTransitionMsg.textContent = vt.ttsPrompt;
      this.dom.floorTransitionConfirmBtn.textContent = vt.buttonLabel || `${vt.toFloor.replace('F', '층')} 이동 완료`;
      this.dom.floorTransitionBar.classList.remove('hidden');
    }

    this.nav.speak(vt.ttsPrompt, vt.transitType === 'elevator' ? '엘리베이터 이동' : '계단 이동');
  }

  confirmProtoFloorTransition() {
    const activeRoute = this.nav.getActiveRoute();
    if (!activeRoute || !activeRoute.verticalTransition) return;

    this.protoWaitingFloorConfirm = false;
    if (this.dom.floorTransitionBar) {
      this.dom.floorTransitionBar.classList.add('hidden');
    }

    const lastSeg = activeRoute.floorSegments[activeRoute.floorSegments.length - 1];
    const arriveTransitStep = (activeRoute.steps || []).find((s) => s.type === 'transit_arrive');
    if (arriveTransitStep) {
      this.nav.speak(arriveTransitStep.ttsText, `${lastSeg.floor} 이동 완료`);
    }

    this.animateProtoSegment(lastSeg.nodes, () => {
      this.finishProtoNavigation(activeRoute);
    });
  }

  animateProtoSegment(nodes, onComplete) {
    if (this.protoSimTimer) {
      clearInterval(this.protoSimTimer);
      this.protoSimTimer = null;
    }
    if (!nodes || nodes.length < 2) {
      if (onComplete) onComplete();
      return;
    }

    const floorId = nodes[0].floor;
    const ortho = this.nav.ensureOrthogonalPoints(nodes);
    const pts = [];
    for (let i = 0; i < ortho.length - 1; i++) {
      const a = ortho[i];
      const b = ortho[i + 1];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(5, Math.round(d * 0.9));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        pts.push({
          floor: floorId,
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
        });
      }
    }
    const last = ortho[ortho.length - 1];
    pts.push({ floor: floorId, x: last.x, y: last.y });

    let idx = 0;
    this.protoSimTimer = setInterval(() => {
      if (!this.isOpen || !this.isProtoNavigating) {
        clearInterval(this.protoSimTimer);
        this.protoSimTimer = null;
        return;
      }
      if (idx >= pts.length) {
        clearInterval(this.protoSimTimer);
        this.protoSimTimer = null;
        if (onComplete) onComplete();
        return;
      }
      this.protoSimPos = pts[idx];
      this.renderFloorplanSection(this.nav.getActiveRoute());
      idx += 1;
    }, 55);
  }

  finishProtoNavigation(activeRoute) {
    this.isProtoNavigating = false;
    this.protoWaitingFloorConfirm = false;
    this.updateActionButtonsState();

    const endLabel = activeRoute.endNode.roomNumber || activeRoute.endNode.name;
    const msg = `목적지 IT대학 ${endLabel}에 도착했습니다!`;
    if (this.nav.onShowToast) this.nav.onShowToast(`🎉 ${msg}`);
    this.nav.speak(msg, '실내 도착 완료');
  }

  stopProtoNavigation() {
    if (this.protoSimTimer) {
      clearInterval(this.protoSimTimer);
      this.protoSimTimer = null;
    }
    this.isProtoNavigating = false;
    this.protoWaitingFloorConfirm = false;
    this.protoSimPos = null;
    if (this.dom.floorTransitionBar) {
      this.dom.floorTransitionBar.classList.add('hidden');
    }
    this.updateActionButtonsState();
  }

  updateActionButtonsState() {
    if (!this.dom.startNavBtn || !this.dom.startNavLabel) return;
    this.dom.startNavBtn.classList.toggle('running', this.isProtoNavigating);
    this.dom.startNavLabel.textContent = this.isProtoNavigating ? '길안내 중지' : '길안내 시작';
  }
}

window.IndoorPrototypeView = IndoorPrototypeView;
