/**
 * 수원대학교 스마트 캠퍼스 내비게이션 - Step 2 건물 실내 도면 연동 및 강의실 길안내 컨트롤러
 * - 야외 경로에서 도착한 건물 입구(예: 정문 출발 시 '1층 남동측 정문 주출입구')를 기준으로 실내 출발점 100% 고정 연동
 * - 네이버 지도 실내지도 스타일 컬러 조닝(강의실·복도·엘리베이터·계단·화장실·홀) + 클린 건축 도면 캔버스
 * - 우측 층수 선택 버튼 (5F, 4F, 3F, 2F, 1F)
 * - 엘리베이터 루트(파란색 화살표) vs 계단 루트(초록색 화살표) 동시 표시 및 선택
 * - 수직 통로 도달 시 TTS 음성 안내 및 [N층 이동 완료] 팝업 스무스 층 전환
 */

class IndoorNavigator {
  constructor(options = {}) {
    this.data = window.IT_COLLEGE_INDOOR_DATA;
    this.router = new window.IndoorMultiFloorRouter(this.data);
    this.tts = options.tts || null;
    this.onSpeakHud = options.onSpeakHud || null;
    this.onShowToast = options.onShowToast || null;
    this.onExitIndoor = options.onExitIndoor || null;
    this.onRequestOutdoorRouteToEntrance = options.onRequestOutdoorRouteToEntrance || null;

    // 상태 관리
    this.isOpen = false;
    this.currentFloor = '1F';
    this.outdoorOriginId = 'main_gate'; // 야외 출발지 ID (기본: 정문)
    this.outdoorOriginName = '정문';
    this.selectedEntranceId = this.data.defaultEntranceId; // 'ent_1f_main' (1층 남동측 주출입구)
    this.selectedRoomId = this.data.defaultRoomId; // 'room_203' (2F 203호)
    this.activeRouteMode = 'elevator'; // 'elevator' | 'stairs'
    this.dualRoutes = { elevator: null, stairs: null };

    // 실내 시뮬레이션 상태
    this.simTimer = null;
    this.isSimulating = false;
    this.simPhase = 'idle';
    this.userMarkerPos = null; // { floor, x, y }

    // 캔버스 줌/팬 상태
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };

    this.dom = {};
    this.initDom();
    this.bindEvents();
  }

  initDom() {
    this.dom.container = document.getElementById('indoorMapModeContainer');
    if (!this.dom.container) return;

    this.dom.backToOutdoorBtn = document.getElementById('indoorBackToOutdoorBtn');
    this.dom.buildingTitle = document.getElementById('indoorHeaderBuildingTitle');
    this.dom.targetRoomSelect = document.getElementById('indoorTargetRoomSelect');
    this.dom.openOriginalPdfBtn = document.getElementById('indoorOpenOriginalPdfBtn');

    // 다중 출입구 선택 칩 바
    this.dom.entranceChipsRow = document.getElementById('indoorEntranceChipsRow');
    this.dom.entranceFloorExplain = document.getElementById('indoorEntranceFloorExplain');

    // 2D 평면도 뷰포트 및 스테이지
    this.dom.viewport = document.getElementById('indoorCanvasViewport');
    this.dom.stage = document.getElementById('indoorCanvasStage');
    this.dom.floorImg = document.getElementById('indoorFloorPlanImg');
    this.dom.routeSvg = document.getElementById('indoorRouteSvg');
    this.dom.overlayLayer = document.getElementById('indoorBadgesOverlay');
    this.dom.userMarkerEl = document.getElementById('indoorUserMarker');

    // 현재 층 정보 플로팅 배지
    this.dom.currentFloorBadge = document.getElementById('indoorCurrentFloorBadge');
    this.dom.currentFloorTitle = document.getElementById('indoorCurrentFloorTitle');

    // 우측 네이버 지도 스타일 층수 선택 버튼 (5F ~ 1F)
    this.dom.floorBtnList = document.getElementById('indoorRightFloorSelector');

    // 줌 컨트롤
    this.dom.zoomInBtn = document.getElementById('indoorZoomInBtn');
    this.dom.zoomOutBtn = document.getElementById('indoorZoomOutBtn');
    this.dom.zoomResetBtn = document.getElementById('indoorZoomResetBtn');

    // [N층 이동 완료] 층간 이동 확인 팝업
    this.dom.floorTransitionPopup = document.getElementById('indoorFloorTransitionPopup');
    this.dom.transitionPopupIcon = document.getElementById('indoorTransitionPopupIcon');
    this.dom.transitionPopupTitle = document.getElementById('indoorTransitionPopupTitle');
    this.dom.transitionPopupDesc = document.getElementById('indoorTransitionPopupDesc');
    this.dom.confirmFloorTransitionBtn = document.getElementById('indoorConfirmFloorTransitionBtn');
    this.dom.confirmFloorTransitionText = document.getElementById('indoorConfirmFloorTransitionText');

    // 하단 바텀 시트 (실내 전용 컨트롤)
    this.dom.routeTabsWrap = document.getElementById('indoorDualRouteTabs');
    this.dom.tabElevatorBtn = document.getElementById('indoorTabElevatorBtn');
    this.dom.tabElevatorTime = document.getElementById('indoorTabElevatorTime');
    this.dom.tabElevatorMeta = document.getElementById('indoorTabElevatorMeta');
    this.dom.tabStairsBtn = document.getElementById('indoorTabStairsBtn');
    this.dom.tabStairsTime = document.getElementById('indoorTabStairsTime');
    this.dom.tabStairsMeta = document.getElementById('indoorTabStairsMeta');

    this.dom.sameFloorNotice = document.getElementById('indoorSameFloorNotice');
    this.dom.routeStepSummary = document.getElementById('indoorRouteStepSummary');
    this.dom.startIndoorSimBtn = document.getElementById('indoorStartSimBtn');
    this.dom.startIndoorSimText = document.getElementById('indoorStartSimText');
    this.dom.switchFloorPreviewBtn = document.getElementById('indoorSwitchFloorPreviewBtn');
    this.dom.switchFloorPreviewText = document.getElementById('indoorSwitchFloorPreviewText');
    this.dom.outdoorToEntranceBtn = document.getElementById('indoorOutdoorToEntranceBtn');
  }

  bindEvents() {
    if (!this.dom.container) return;

    // 야외 지도로 돌아가기
    if (this.dom.backToOutdoorBtn) {
      this.dom.backToOutdoorBtn.addEventListener('click', () => {
        this.close();
      });
    }

    // 목적지 강의실 드롭다운 변경 -> 항상 야외에서 들어간 입구 층(예: 1F 주출입구)을 유지한 채 안내!
    if (this.dom.targetRoomSelect) {
      this.dom.targetRoomSelect.addEventListener('change', (e) => {
        this.setDestinationRoom(e.target.value, { speak: true, resetFloorToStart: true });
      });
    }

    // 원본 CAD PDF 새 창 열기
    if (this.dom.openOriginalPdfBtn) {
      this.dom.openOriginalPdfBtn.addEventListener('click', () => {
        const floorMeta = this.getFloorMeta(this.currentFloor);
        if (floorMeta && floorMeta.pdf) {
          window.open(encodeURI(floorMeta.pdf), '_blank', 'noopener');
        }
      });
    }

    // 엘리베이터 경로 탭 선택
    if (this.dom.tabElevatorBtn) {
      this.dom.tabElevatorBtn.addEventListener('click', () => {
        this.selectRouteMode('elevator', { speak: true });
      });
    }

    // 계단 경로 탭 선택
    if (this.dom.tabStairsBtn) {
      this.dom.tabStairsBtn.addEventListener('click', () => {
        this.selectRouteMode('stairs', { speak: true });
      });
    }

    // [N층 이동 완료] 팝업 버튼 클릭
    if (this.dom.confirmFloorTransitionBtn) {
      this.dom.confirmFloorTransitionBtn.addEventListener('click', () => {
        this.completeVerticalFloorTransition();
      });
    }

    // [실내 안내 시작 (시뮬레이션)] 버튼 클릭
    if (this.dom.startIndoorSimBtn) {
      this.dom.startIndoorSimBtn.addEventListener('click', () => {
        if (this.isSimulating) {
          this.stopIndoorSimulation();
          this.recalculateAndRender({ resetFloorToStart: true });
        } else {
          this.startIndoorSimulation();
        }
      });
    }

    // [도착 층 도면 보기 / 출발 입구 층 보기] 토글 버튼
    if (this.dom.switchFloorPreviewBtn) {
      this.dom.switchFloorPreviewBtn.addEventListener('click', () => {
        const activeRoute = this.getActiveRoute();
        if (!activeRoute) return;
        const startFloor = activeRoute.startNode.floor;
        const endFloor = activeRoute.endNode.floor;
        if (this.currentFloor === startFloor && startFloor !== endFloor) {
          this.setFloor(endFloor, { animate: true });
        } else {
          this.setFloor(startFloor, { animate: true });
        }
      });
    }

    // [야외 경로 다시 보기] 버튼
    if (this.dom.outdoorToEntranceBtn) {
      this.dom.outdoorToEntranceBtn.addEventListener('click', () => {
        const ent = this.getSelectedEntrance();
        if (this.onRequestOutdoorRouteToEntrance && ent) {
          this.onRequestOutdoorRouteToEntrance(ent, this.selectedRoomId);
        }
      });
    }

    // 줌 컨트롤
    if (this.dom.zoomInBtn) {
      this.dom.zoomInBtn.addEventListener('click', () => this.setZoom(this.zoom + 0.25));
    }
    if (this.dom.zoomOutBtn) {
      this.dom.zoomOutBtn.addEventListener('click', () => this.setZoom(this.zoom - 0.25));
    }
    if (this.dom.zoomResetBtn) {
      this.dom.zoomResetBtn.addEventListener('click', () => this.resetZoomPan());
    }

    // 마우스 및 터치 팬(드래그) 이동
    if (this.dom.viewport) {
      this.dom.viewport.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button') || e.target.closest('.indoor-badge')) return;
        this.isDragging = true;
        this.dragStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
        this.dom.viewport.classList.add('dragging');
      });

      window.addEventListener('pointermove', (e) => {
        if (!this.isDragging) return;
        this.panX = e.clientX - this.dragStart.x;
        this.panY = e.clientY - this.dragStart.y;
        this.applyStageTransform();
      });

      window.addEventListener('pointerup', () => {
        if (this.isDragging) {
          this.isDragging = false;
          if (this.dom.viewport) this.dom.viewport.classList.remove('dragging');
        }
      });

      this.dom.viewport.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.15 : -0.15;
          this.setZoom(this.zoom + delta);
        },
        { passive: false }
      );
    }
  }

  /**
   * 초기 UI 구성 (출입구 칩, 층 선택 버튼, 강의실 셀렉트 옵션)
   */
  populateStaticControls() {
    if (this.dom.targetRoomSelect) {
      const classrooms = Object.values(this.data.nodes).filter((n) => n.type === 'classroom');
      const floorsOrder = ['1F', '2F', '3F', '4F', '5F'];
      let html = '';
      floorsOrder.forEach((fId) => {
        const roomsOnFloor = classrooms.filter((r) => r.floor === fId);
        if (!roomsOnFloor.length) return;
        html += `<optgroup label="IT대학 ${fId} (${fId.replace('F', '00')}호대)">`;
        roomsOnFloor.forEach((room) => {
          const selectedAttr = room.id === this.selectedRoomId ? 'selected' : '';
          const star = room.id === 'room_203' || room.id === 'room_310' ? '★ ' : '';
          html += `<option value="${room.id}" ${selectedAttr}>[${room.floor}] ${star}${room.name}</option>`;
        });
        html += `</optgroup>`;
      });
      this.dom.targetRoomSelect.innerHTML = html;
    }

    this.renderEntranceChips();
    this.renderRightFloorButtons();
  }

  /**
   * 실내 길안내 모드 열기
   * - 야외 출발지(outdoorOriginId)에서 진입한 입구를 최우선 기준으로 설정!
   */
  open(opts = {}) {
    if (!this.dom.container) return;

    this.stopIndoorSimulation();

    if (opts.outdoorOriginId) {
      this.outdoorOriginId = opts.outdoorOriginId;
      const originNode = window.CAMPUS_NODES && window.CAMPUS_NODES[opts.outdoorOriginId];
      this.outdoorOriginName = originNode ? originNode.name : '정문';
    }

    // 핵심: 야외에서 들어간 입구를 기준으로 실내 시작 입구를 고정!
    if (opts.entranceId && this.getEntranceById(opts.entranceId)) {
      this.selectedEntranceId = opts.entranceId;
    } else {
      const resolvedEnt = this.router.resolveEntranceForOutdoorOrigin(this.outdoorOriginId);
      this.selectedEntranceId = resolvedEnt ? resolvedEnt.id : this.data.defaultEntranceId;
    }

    if (opts.roomId && this.data.nodes[opts.roomId]) {
      this.selectedRoomId = opts.roomId;
    } else if (!this.selectedRoomId || !this.data.nodes[this.selectedRoomId]) {
      this.selectedRoomId = 'room_203';
    }

    this.isOpen = true;
    this.dom.container.classList.remove('hidden');
    this.resetZoomPan();
    this.populateStaticControls();
    this.recalculateAndRender({ resetFloorToStart: true });

    const activeRoute = this.getActiveRoute();
    const ent = this.getSelectedEntrance();
    const room = this.data.nodes[this.selectedRoomId];

    if (opts.speak !== false && activeRoute && ent && room) {
      const startFloorKo = ent.entryFloor.replace('F', '층');
      const endFloorKo = room.floor.replace('F', '층');
      let msg = '';
      if (ent.entryFloor === room.floor) {
        msg = `야외 경로에서 진입한 ${ent.name}(${startFloorKo})를 기준으로 ${room.roomNumber}까지 실내 안내를 시작합니다.`;
      } else {
        const modeKo = this.activeRouteMode === 'elevator' ? '엘리베이터' : '계단';
        msg = `야외 경로에서 진입한 ${ent.name}(${startFloorKo})를 기준으로 ${endFloorKo} ${room.roomNumber}까지 ${modeKo} 최단 경로를 안내합니다.`;
      }
      this.speak(msg, '실내 도면 길안내');
    }

    if (opts.autoStartSim) {
      setTimeout(() => {
        if (this.isOpen) this.startIndoorSimulation();
      }, 600);
    }
  }

  close() {
    this.stopIndoorSimulation();
    this.hideFloorTransitionPopup();
    this.isOpen = false;
    if (this.dom.container) {
      this.dom.container.classList.add('hidden');
    }
    if (this.onExitIndoor) {
      this.onExitIndoor();
    }
  }

  getEntranceById(entranceId) {
    return this.data.entrances.find((e) => e.id === entranceId) || null;
  }

  getSelectedEntrance() {
    return this.getEntranceById(this.selectedEntranceId) || this.data.entrances[0];
  }

  getFloorMeta(floorId) {
    return this.data.floors.find((f) => f.id === floorId) || this.data.floors[this.data.floors.length - 1];
  }

  getActiveRoute() {
    return this.dualRoutes[this.activeRouteMode] || this.dualRoutes.elevator;
  }

  /**
   * 상단 출입구 칩에서 사용자가 명시적으로 다른 출입구를 테스트 선택했을 때만 변경
   */
  selectEntrance(entranceId, options = {}) {
    const ent = this.getEntranceById(entranceId);
    if (!ent) return;

    this.stopIndoorSimulation();
    this.hideFloorTransitionPopup();
    this.selectedEntranceId = ent.id;

    this.renderEntranceChips();
    this.recalculateAndRender({ resetFloorToStart: true });

    const room = this.data.nodes[this.selectedRoomId];
    if (options.speak && room) {
      const startFloorKo = ent.entryFloor.replace('F', '층');
      const endFloorKo = room.floor.replace('F', '층');
      if (ent.entryFloor === room.floor) {
        this.speak(
          `출발 입구를 ${ent.name}(${startFloorKo} 진입)로 변경했습니다. 목적지 ${room.roomNumber}와 같은 층입니다.`,
          `출입구 변경 · ${ent.entryFloor} 진입`
        );
      } else {
        this.speak(
          `출발 입구를 ${ent.name}(${startFloorKo} 진입)로 변경했습니다. ${startFloorKo}에서 ${endFloorKo} ${room.roomNumber}까지 이동합니다.`,
          `출입구 변경 · ${ent.entryFloor} 진입`
        );
      }
    }
  }

  /**
   * 목적지 강의실 변경 (예: 310호, 203호, 101호 등)
   * - 외부에서 들어간 입구(selectedEntranceId)를 절대 바꾸지 않고 그대로 유지!
   */
  setDestinationRoom(roomId, options = {}) {
    const room = this.data.nodes[roomId];
    if (!room || room.type !== 'classroom') return;

    this.stopIndoorSimulation();
    this.hideFloorTransitionPopup();
    this.selectedRoomId = roomId;

    if (this.dom.targetRoomSelect && this.dom.targetRoomSelect.value !== roomId) {
      this.dom.targetRoomSelect.value = roomId;
    }

    // 강의실을 새로 선택할 때, 야외에서 진입한 입구 층에서부터 어떻게 가는지 보여주거나 현재 층 유지
    const resetFloor = options.resetFloorToStart !== undefined ? options.resetFloorToStart : false;
    this.recalculateAndRender({ resetFloorToStart: resetFloor });

    if (options.speak) {
      const ent = this.getSelectedEntrance();
      const startFloorKo = ent.entryFloor.replace('F', '층');
      const endFloorKo = room.floor.replace('F', '층');
      this.speak(
        `외부 진입 입구인 ${ent.name}(${startFloorKo})에서 ${endFloorKo} ${room.name}까지 실내 경로를 안내합니다.`,
        '강의실 목적지 설정'
      );
    }
  }

  /**
   * 엘리베이터 경로('elevator') vs 계단 경로('stairs') 탭 전환
   */
  selectRouteMode(mode, options = {}) {
    if (mode !== 'elevator' && mode !== 'stairs') return;
    this.activeRouteMode = mode;

    this.updateBottomSheetUI();
    this.renderCurrentFloorCanvas();

    const activeRoute = this.getActiveRoute();
    if (options.speak && activeRoute) {
      const modeKo = mode === 'elevator' ? '엘리베이터 경유 최단 루트' : '계단 경유 최단 루트';
      this.speak(
        `${modeKo}를 선택했습니다. 예상 소요 시간은 약 ${activeRoute.estimatedMinutes}분, 이동 거리는 ${activeRoute.totalDistanceMeters}미터입니다.`,
        mode === 'elevator' ? '🛗 엘리베이터 경로' : '🪜 계단 경로'
      );
    }
  }

  /**
   * 엘리베이터 루트 + 계단 루트 동시 다익스트라 재계산 및 화면 갱신
   */
  recalculateAndRender(options = {}) {
    const ent = this.getSelectedEntrance();
    const startNodeId = ent.nodeId;
    const endNodeId = this.selectedRoomId;

    this.dualRoutes = this.router.findDualRoutes(startNodeId, endNodeId);

    const activeRoute = this.getActiveRoute();
    if (options.resetFloorToStart && activeRoute) {
      this.currentFloor = activeRoute.startNode.floor;
    }

    if (activeRoute && activeRoute.startNode) {
      this.userMarkerPos = {
        floor: activeRoute.startNode.floor,
        x: activeRoute.startNode.x,
        y: activeRoute.startNode.y,
      };
    }

    this.renderEntranceChips();
    this.renderRightFloorButtons();
    this.updateBottomSheetUI();
    this.renderCurrentFloorCanvas();
  }

  /**
   * 상단 다중 출입구 선택 칩 및 야외 연동 진입 층수 배너 렌더링
   */
  renderEntranceChips() {
    if (!this.dom.entranceChipsRow) return;

    const currentEnt = this.getSelectedEntrance();
    const targetRoom = this.data.nodes[this.selectedRoomId];

    this.dom.entranceChipsRow.innerHTML = this.data.entrances
      .map((ent) => {
        const isActive = ent.id === this.selectedEntranceId;
        return `
          <button
            type="button"
            class="indoor-entrance-chip ${isActive ? 'active' : ''} ${isActive ? 'outdoor-matched' : ''}"
            data-entrance-id="${ent.id}"
            title="${ent.description}"
          >
            <span class="ent-floor-pill" style="background:${ent.badgeColor}">${ent.entryFloor} 진입</span>
            <span class="ent-chip-name">${ent.name}</span>
            ${isActive ? `<span class="ent-outdoor-tag">야외안내 진입출입구</span>` : ''}
          </button>
        `;
      })
      .join('');

    this.dom.entranceChipsRow.querySelectorAll('.indoor-entrance-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectEntrance(btn.dataset.entranceId, { speak: true });
      });
    });

    if (this.dom.entranceFloorExplain && currentEnt && targetRoom) {
      const isSame = currentEnt.entryFloor === targetRoom.floor;
      const startNum = parseInt(currentEnt.entryFloor, 10) || 1;
      const endNum = parseInt(targetRoom.floor, 10) || 2;
      const diff = Math.abs(endNum - startNum);
      const dirText = endNum > startNum ? `${diff}개 층 위로 이동` : `${diff}개 층 아래로 이동`;

      this.dom.entranceFloorExplain.innerHTML = `
        <span class="explain-tag">🚶 야외 출발(${this.outdoorOriginName}) 연동 입구</span>
        <span class="explain-main">
          외부에서 들어간 <strong>${currentEnt.name}(${currentEnt.entryFloor})</strong> 기준 ➔
          목적지 <strong>${targetRoom.roomNumber}(${targetRoom.floor})</strong>까지
          <strong class="${isSame ? 'same-floor-hl' : 'cross-floor-hl'}">
            ${isSame ? '같은 층 복도 직통 이동' : `[${currentEnt.entryFloor} 입구 ➔ 엘리베이터/계단 ➔ ${targetRoom.floor} ${targetRoom.roomNumber}] (${dirText})`}
          </strong>
        </span>
      `;
    }
  }

  /**
   * 네이버 지도 실내지도 스타일 우측 층수 선택 버튼 (5F, 4F, 3F, 2F, 1F) 렌더링
   */
  renderRightFloorButtons() {
    if (!this.dom.floorBtnList) return;

    const activeRoute = this.getActiveRoute();
    const startFloor = activeRoute ? activeRoute.startNode.floor : null;
    const endFloor = activeRoute ? activeRoute.endNode.floor : null;

    this.dom.floorBtnList.innerHTML = this.data.floors
      .map((f) => {
        const isCurrent = f.id === this.currentFloor;
        const isStart = f.id === startFloor;
        const isEnd = f.id === endFloor;

        let roleTag = '';
        if (isStart && isEnd) {
          roleTag = `<span class="floor-role-dot same">출발·도착</span>`;
        } else if (isStart) {
          roleTag = `<span class="floor-role-dot start">진입층</span>`;
        } else if (isEnd) {
          roleTag = `<span class="floor-role-dot dest">목적지층</span>`;
        }

        return `
          <button
            type="button"
            class="naver-floor-btn ${isCurrent ? 'active' : ''} ${isEnd ? 'has-dest' : ''}"
            data-floor="${f.id}"
            aria-pressed="${isCurrent}"
            title="${f.title}"
          >
            <span class="floor-btn-label">${f.label}</span>
            ${roleTag}
          </button>
        `;
      })
      .join('');

    this.dom.floorBtnList.querySelectorAll('.naver-floor-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setFloor(btn.dataset.floor, { animate: true });
      });
    });
  }

  setFloor(floorId, options = {}) {
    const floorMeta = this.getFloorMeta(floorId);
    if (!floorMeta) return;

    this.currentFloor = floorId;
    this.renderRightFloorButtons();

    if (options.animate && this.dom.stage) {
      this.dom.stage.classList.remove('floor-switching');
      void this.dom.stage.offsetWidth;
      this.dom.stage.classList.add('floor-switching');
    }

    this.renderCurrentFloorCanvas();
    this.updateBottomSheetUI();
  }

  /**
   * 현재 층의 2D 평면도 배경 + 컬러 건축 조닝 + SVG 듀얼 화살표 경로 + 고대비 배지 렌더링
   */
  renderCurrentFloorCanvas() {
    const floorMeta = this.getFloorMeta(this.currentFloor);
    if (!floorMeta) return;

    if (this.dom.floorImg && this.dom.floorImg.getAttribute('src') !== floorMeta.image) {
      this.dom.floorImg.setAttribute('src', floorMeta.image);
      this.dom.floorImg.setAttribute('alt', `IT대학 ${floorMeta.title} 평면도`);
    }

    if (this.dom.currentFloorBadge) {
      this.dom.currentFloorBadge.textContent = floorMeta.label;
    }
    if (this.dom.currentFloorTitle) {
      this.dom.currentFloorTitle.textContent = floorMeta.title;
    }

    this.renderDualRoutesSvg();
    this.renderFloorBadgesOverlay();
    this.renderUserMarker();
  }

  /**
   * 도면을 화사하고 예쁘게 꾸며주는 네이버 실내지도 스타일 컬러 조닝 SVG 생성
   * - 복도(따뜻한 아이보리/스카이 통로), 강의실(스카이블루), 목적지 강의실(코랄 핑크 하이라이트),
   *   엘리베이터(로열블루), 계단(민트그린), 화장실(라벤더) 구역을 도면 위에 깔끔하게 컬러링
   */
  buildArchitecturalZonesSvg() {
    const nodesOnFloor = Object.values(this.data.nodes).filter(
      (n) => n.floor === this.currentFloor
    );
    const nodeIdsOnFloor = new Set(nodesOnFloor.map((n) => n.id));

    let zonesSvg = `<g class="indoor-arch-zones">`;

    // 1. 현재 층의 보행 복도(Corridor) 하이라이트 트랙 렌더링
    this.data.edges.forEach((edge) => {
      if (edge.isVertical) return;
      if (!nodeIdsOnFloor.has(edge.from) || !nodeIdsOnFloor.has(edge.to)) return;
      const a = this.data.nodes[edge.from];
      const b = this.data.nodes[edge.to];
      if (!a || !b) return;
      // 복도 노드 간 간선은 넓은 파스텔 복도 길로 표시
      if (a.type === 'corridor' && b.type === 'corridor') {
        zonesSvg += `
          <line
            x1="${a.x}" y1="${a.y}"
            x2="${b.x}" y2="${b.y}"
            stroke="#fef9c3"
            stroke-width="3.6"
            stroke-linecap="round"
            opacity="0.78"
          />
          <line
            x1="${a.x}" y1="${a.y}"
            x2="${b.x}" y2="${b.y}"
            stroke="#fde68a"
            stroke-width="3.9"
            stroke-linecap="round"
            opacity="0.28"
          />
        `;
      }
    });

    // 2. 강의실 / 엘리베이터 / 계단 / 화장실 파스텔 룸 블록 렌더링
    nodesOnFloor.forEach((node) => {
      if (node.type === 'classroom') {
        const isTarget = node.id === this.selectedRoomId;
        const isSpecialHall =
          node.id === 'room_105' || node.id === 'room_101' || node.id === 'room_209';

        const w = node.id === 'room_105' ? 18 : node.id === 'room_101' ? 13 : 6.8;
        const h = node.id === 'room_105' ? 16 : node.id === 'room_101' ? 12 : 6.2;
        const rx = 1.1;

        const fill = isTarget
          ? '#ffe4e6'
          : isSpecialHall
          ? '#fef3c7'
          : '#dbeafe';
        const stroke = isTarget
          ? '#f43f5e'
          : isSpecialHall
          ? '#f59e0b'
          : '#60a5fa';
        const strokeWidth = isTarget ? '0.55' : '0.28';
        const opacity = isTarget ? '0.88' : '0.62';

        zonesSvg += `
          <rect
            x="${(node.x - w / 2).toFixed(2)}"
            y="${(node.y - h / 2).toFixed(2)}"
            width="${w}"
            height="${h}"
            rx="${rx}"
            fill="${fill}"
            stroke="${stroke}"
            stroke-width="${strokeWidth}"
            opacity="${opacity}"
          />
        `;
      } else if (node.type === 'elevator') {
        zonesSvg += `
          <rect
            x="${(node.x - 2.3).toFixed(2)}"
            y="${(node.y - 2.3).toFixed(2)}"
            width="4.6"
            height="4.6"
            rx="0.9"
            fill="#bfdbfe"
            stroke="#2563eb"
            stroke-width="0.35"
            opacity="0.82"
          />
        `;
      } else if (node.type === 'stairs') {
        zonesSvg += `
          <rect
            x="${(node.x - 2.4).toFixed(2)}"
            y="${(node.y - 2.3).toFixed(2)}"
            width="4.8"
            height="4.6"
            rx="0.9"
            fill="#bbf7d0"
            stroke="#059669"
            stroke-width="0.35"
            opacity="0.82"
          />
        `;
      } else if (node.type === 'restroom') {
        zonesSvg += `
          <rect
            x="${(node.x - 2.5).toFixed(2)}"
            y="${(node.y - 2.2).toFixed(2)}"
            width="5.0"
            height="4.4"
            rx="0.9"
            fill="#f3e8ff"
            stroke="#a855f7"
            stroke-width="0.3"
            opacity="0.78"
          />
        `;
      }
    });

    zonesSvg += `</g>`;
    return zonesSvg;
  }

  /**
   * 현재 층에 해당하는 컬러 조닝 + [엘리베이터 루트(파란색)]와 [계단 루트(초록색)] 화살표를 동시에 SVG로 렌더링
   */
  renderDualRoutesSvg() {
    if (!this.dom.routeSvg) return;

    const elvRoute = this.dualRoutes.elevator;
    const stairRoute = this.dualRoutes.stairs;

    let svgContent = `
      <defs>
        <filter id="indoorRouteGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.0" stdDeviation="1.0" flood-color="#0f172a" flood-opacity="0.26" />
        </filter>
      </defs>
      ${this.buildArchitecturalZonesSvg()}
    `;

    if (!elvRoute && !stairRoute) {
      this.dom.routeSvg.innerHTML = svgContent;
      return;
    }

    const isSameFloor = elvRoute && elvRoute.isSameFloor;

    if (isSameFloor) {
      const seg = elvRoute.floorSegments.find((s) => s.floor === this.currentFloor);
      if (seg && seg.nodes.length >= 2) {
        svgContent += this.buildSvgRouteGroup(seg.nodes, {
          color: '#0068ff',
          isSelected: true,
          offsetUnits: 0,
        });
      }
    } else {
      const renderOrder =
        this.activeRouteMode === 'elevator'
          ? [
              { route: stairRoute, mode: 'stairs', color: '#03c75a', isSelected: false, offset: 0.55 },
              { route: elvRoute, mode: 'elevator', color: '#0068ff', isSelected: true, offset: -0.55 },
            ]
          : [
              { route: elvRoute, mode: 'elevator', color: '#0068ff', isSelected: false, offset: -0.55 },
              { route: stairRoute, mode: 'stairs', color: '#03c75a', isSelected: true, offset: 0.55 },
            ];

      renderOrder.forEach((item) => {
        if (!item.route) return;
        const seg = item.route.floorSegments.find((s) => s.floor === this.currentFloor);
        if (!seg || seg.nodes.length < 2) return;

        svgContent += this.buildSvgRouteGroup(seg.nodes, {
          color: item.color,
          isSelected: item.isSelected,
          offsetUnits: item.offset,
          mode: item.mode,
        });
      });
    }

    this.dom.routeSvg.innerHTML = svgContent;
  }

  buildSvgRouteGroup(nodes, opts = {}) {
    const { color = '#0068ff', isSelected = true, offsetUnits = 0 } = opts;

    const shiftedPoints = nodes.map((n, idx) => {
      if (idx === 0 || idx === nodes.length - 1 || offsetUnits === 0) {
        return { x: n.x, y: n.y };
      }
      return {
        x: n.x + offsetUnits * 0.45,
        y: n.y + offsetUnits * 0.65,
      };
    });

    const pointsAttr = shiftedPoints.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
    const opacity = isSelected ? 0.98 : 0.56;
    const strokeWidth = isSelected ? 1.55 : 0.95;
    const outlineWidth = isSelected ? 2.5 : 1.5;
    const dashArray = isSelected ? 'none' : '1.8 1.2';

    let arrowsSvg = '';
    for (let i = 0; i < shiftedPoints.length - 1; i++) {
      const p1 = shiftedPoints[i];
      const p2 = shiftedPoints[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 2.2) continue;

      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const stepDist = isSelected ? 4.6 : 6.4;
      const count = Math.max(1, Math.floor(segLen / stepDist));

      for (let k = 1; k <= count; k++) {
        const ratio = k / (count + 1);
        const cx = p1.x + dx * ratio;
        const cy = p1.y + dy * ratio;
        const scale = isSelected ? 1.05 : 0.8;

        arrowsSvg += `
          <g transform="translate(${cx.toFixed(2)}, ${cy.toFixed(2)}) rotate(${angleDeg.toFixed(1)}) scale(${scale})">
            <path
              d="M -0.95 -0.85 L 0.85 0 L -0.95 0.85"
              fill="none"
              stroke="${isSelected ? '#ffffff' : color}"
              stroke-width="${isSelected ? '0.55' : '0.45'}"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="${isSelected ? 'svg-anim-chevron' : ''}"
            />
          </g>
        `;
      }
    }

    const flowLineSvg = isSelected
      ? `<polyline
          points="${pointsAttr}"
          fill="none"
          stroke="#ffffff"
          stroke-width="0.58"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-dasharray="1.4 2.8"
          class="indoor-route-flow-line"
        />`
      : '';

    return `
      <g class="indoor-svg-route-group ${isSelected ? 'selected' : 'unselected'}" opacity="${opacity}" filter="url(#indoorRouteGlow)">
        <polyline
          points="${pointsAttr}"
          fill="none"
          stroke="#ffffff"
          stroke-width="${outlineWidth}"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <polyline
          points="${pointsAttr}"
          fill="none"
          stroke="${color}"
          stroke-width="${strokeWidth}"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-dasharray="${dashArray}"
        />
        ${flowLineSvg}
        ${arrowsSvg}
      </g>
    `;
  }

  /**
   * 현재 층의 고대비 라벨 배지 렌더링
   * - 중요: 야외에서 들어온 입구(selectedEntranceId)만 '출발 입구'로 강조하고,
   *   다른 층의 외부 출입구(예: 3F 서측 언덕출입구)를 클릭해도 출발지가 바뀌지 않도록 보호!
   * - 또한 1F에서 올라와 3F에 도착한 경우, 3F 엘리베이터/계단 위에 [1F 주출입구 ➔ 3F 도착지점] 배지를 명확히 표시!
   */
  renderFloorBadgesOverlay() {
    if (!this.dom.overlayLayer) return;

    const nodesOnFloor = Object.values(this.data.nodes).filter(
      (n) => n.floor === this.currentFloor && n.type !== 'corridor'
    );

    const activeRoute = this.getActiveRoute();
    const elvRoute = this.dualRoutes.elevator;
    const stairRoute = this.dualRoutes.stairs;
    const selectedEnt = this.getSelectedEntrance();

    const activeTransitDepId =
      activeRoute && activeRoute.verticalTransition ? activeRoute.verticalTransition.departureNode.id : null;
    const activeTransitArrId =
      activeRoute && activeRoute.verticalTransition ? activeRoute.verticalTransition.arrivalNode.id : null;

    const elvDepId =
      elvRoute && elvRoute.verticalTransition ? elvRoute.verticalTransition.departureNode.id : null;
    const stairDepId =
      stairRoute && stairRoute.verticalTransition ? stairRoute.verticalTransition.departureNode.id : null;

    let html = '';

    nodesOnFloor.forEach((node) => {
      const posStyle = `left:${node.x}%; top:${node.y}%;`;

      if (node.type === 'entrance') {
        const isSelectedEnt = node.id === this.selectedEntranceId;
        if (isSelectedEnt) {
          // 야외 경로에서 실제로 진입한 현재 출발 입구!
          html += `
            <div
              class="indoor-badge badge-entrance active-entrance"
              style="${posStyle}"
              title="야외 경로에서 진입한 출발 출입구 (${node.name})"
            >
              <span class="badge-icon">🚪</span>
              <span class="badge-text">${node.shortLabel.replace('🚪 ', '')}</span>
              <span class="badge-tag-start">출발 입구</span>
            </div>
          `;
        } else {
          // 현재 출발 입구가 아닌 보조 출입문은 참고용 서브 라벨로만 표시 (클릭해도 출발지가 바뀌지 않음!)
          html += `
            <div
              class="indoor-badge badge-entrance inactive-entrance"
              style="${posStyle}"
              title="${node.name} (보조 출입구)"
            >
              <span class="badge-text">${node.shortLabel}</span>
            </div>
          `;
        }
      } else if (node.type === 'elevator') {
        const isDep = node.id === activeTransitDepId;
        const isArr = node.id === activeTransitArrId;
        const isAltTransit = node.id === elvDepId;
        const targetFloor =
          elvRoute && elvRoute.verticalTransition ? elvRoute.verticalTransition.toFloor : null;
        const fromFloor =
          elvRoute && elvRoute.verticalTransition ? elvRoute.verticalTransition.fromFloor : null;

        html += `
          <button
            type="button"
            class="indoor-badge badge-elevator ${isDep || isArr ? 'active-transit' : ''} ${isAltTransit ? 'route-candidate' : ''}"
            style="${posStyle}"
            data-transit-node="${node.id}"
            data-transit-mode="elevator"
            title="${node.name}"
          >
            <span class="badge-icon">🛗</span>
            <span class="badge-text">${node.shortLabel.replace('🛗 ', '')}</span>
            ${isDep && targetFloor ? `<span class="transit-action-pill elv">${targetFloor} 이동 ➔</span>` : ''}
            ${
              isArr && fromFloor
                ? `<span class="transit-arrival-pill">📍 ${fromFloor} ${selectedEnt ? selectedEnt.name : '입구'}에서 올라온 곳</span>`
                : ''
            }
          </button>
        `;
      } else if (node.type === 'stairs') {
        const isDep = node.id === activeTransitDepId;
        const isArr = node.id === activeTransitArrId;
        const isAltTransit = node.id === stairDepId;
        const targetFloor =
          stairRoute && stairRoute.verticalTransition ? stairRoute.verticalTransition.toFloor : null;
        const fromFloor =
          stairRoute && stairRoute.verticalTransition ? stairRoute.verticalTransition.fromFloor : null;

        html += `
          <button
            type="button"
            class="indoor-badge badge-stairs ${isDep || isArr ? 'active-transit' : ''} ${isAltTransit ? 'route-candidate' : ''}"
            style="${posStyle}"
            data-transit-node="${node.id}"
            data-transit-mode="stairs"
            title="${node.name}"
          >
            <span class="badge-icon">🪜</span>
            <span class="badge-text">${node.shortLabel.replace('🪜 ', '')}</span>
            ${isDep && targetFloor ? `<span class="transit-action-pill stair">${targetFloor} 이동 ➔</span>` : ''}
            ${
              isArr && fromFloor
                ? `<span class="transit-arrival-pill stair">📍 ${fromFloor} ${selectedEnt ? selectedEnt.name : '입구'}에서 올라온 곳</span>`
                : ''
            }
          </button>
        `;
      } else if (node.type === 'restroom') {
        html += `
          <div class="indoor-badge badge-restroom" style="${posStyle}" title="${node.name}">
            <span class="badge-icon">🚻</span>
            <span class="badge-text">${node.shortLabel.replace('🚻 ', '')}</span>
          </div>
        `;
      } else if (node.type === 'classroom') {
        const isTargetRoom = node.id === this.selectedRoomId;
        html += `
          <button
            type="button"
            class="indoor-badge badge-classroom ${isTargetRoom ? 'target-room' : ''} ${node.isFeatured ? 'featured-room' : ''}"
            style="${posStyle}"
            data-room-id="${node.id}"
            title="${node.name} (${node.dept}) - 클릭 시 외부 진입 입구(${selectedEnt ? selectedEnt.name : '1F'})에서 이 강의실로 안내"
          >
            ${isTargetRoom ? `<span class="badge-icon">🎯</span>` : ''}
            <span class="badge-room-num">${node.roomNumber}</span>
            ${isTargetRoom ? `<span class="badge-room-sub">목적지</span>` : ''}
          </button>
        `;
      }
    });

    this.dom.overlayLayer.innerHTML = html;

    // 강의실 배지 클릭 -> 외부 진입 입구는 그대로 유지하고 목적지 강의실만 변경!
    this.dom.overlayLayer.querySelectorAll('[data-room-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setDestinationRoom(btn.dataset.roomId, { speak: true, resetFloorToStart: false });
      });
    });

    // 엘리베이터/계단 배지 클릭 -> 경로 모드 전환 또는 층 이동 트리거
    this.dom.overlayLayer.querySelectorAll('[data-transit-node]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = btn.dataset.transitMode;
        const nodeId = btn.dataset.transitNode;
        if (mode && mode !== this.activeRouteMode) {
          this.selectRouteMode(mode, { speak: false });
        }
        const route = this.getActiveRoute();
        if (
          route &&
          route.verticalTransition &&
          route.verticalTransition.departureNode.id === nodeId
        ) {
          this.triggerTransitNodeReached(route.verticalTransition);
        }
      });
    });
  }

  renderUserMarker() {
    if (!this.dom.userMarkerEl) return;

    if (!this.userMarkerPos || this.userMarkerPos.floor !== this.currentFloor) {
      this.dom.userMarkerEl.classList.add('hidden');
      return;
    }

    this.dom.userMarkerEl.classList.remove('hidden');
    this.dom.userMarkerEl.style.left = `${this.userMarkerPos.x}%`;
    this.dom.userMarkerEl.style.top = `${this.userMarkerPos.y}%`;
    this.dom.userMarkerEl.classList.toggle('stairs-mode', this.activeRouteMode === 'stairs');
  }

  updateBottomSheetUI() {
    const elvRoute = this.dualRoutes.elevator;
    const stairRoute = this.dualRoutes.stairs;
    const activeRoute = this.getActiveRoute();
    const room = this.data.nodes[this.selectedRoomId];
    const ent = this.getSelectedEntrance();

    if (!activeRoute || !room || !ent) return;

    if (this.dom.buildingTitle) {
      this.dom.buildingTitle.textContent = `IT대학 ${room.roomNumber} 실내 길안내 (${ent.entryFloor} 입구 기준)`;
    }

    const isSameFloor = activeRoute.isSameFloor;

    if (this.dom.tabElevatorBtn && elvRoute) {
      this.dom.tabElevatorBtn.classList.toggle('active', this.activeRouteMode === 'elevator');
      if (this.dom.tabElevatorTime) {
        this.dom.tabElevatorTime.textContent = isSameFloor
          ? `예상 1분`
          : `예상 ${elvRoute.estimatedMinutes}분`;
      }
      if (this.dom.tabElevatorMeta) {
        this.dom.tabElevatorMeta.textContent = isSameFloor
          ? `같은 층(${ent.entryFloor}) 복도 이동 · ${elvRoute.totalDistanceMeters}m`
          : `${ent.name}(${ent.entryFloor}) ➔ 🛗 엘리베이터 ➔ ${room.floor} ${room.roomNumber} · ${elvRoute.totalDistanceMeters}m`;
      }
    }

    if (this.dom.tabStairsBtn && stairRoute) {
      this.dom.tabStairsBtn.classList.toggle('active', this.activeRouteMode === 'stairs');
      if (this.dom.tabStairsTime) {
        this.dom.tabStairsTime.textContent = isSameFloor
          ? `예상 1분`
          : `예상 ${stairRoute.estimatedMinutes}분`;
      }
      if (this.dom.tabStairsMeta) {
        this.dom.tabStairsMeta.textContent = isSameFloor
          ? `같은 층(${ent.entryFloor}) 복도 이동 · ${stairRoute.totalDistanceMeters}m`
          : `${ent.name}(${ent.entryFloor}) ➔ 🪜 계단 ➔ ${room.floor} ${room.roomNumber} · ${stairRoute.totalDistanceMeters}m`;
      }
    }

    if (this.dom.sameFloorNotice) {
      if (isSameFloor) {
        this.dom.sameFloorNotice.classList.remove('hidden');
        this.dom.sameFloorNotice.innerHTML = `
          <i data-lucide="check-circle-2"></i>
          <span>진입하신 <strong>${ent.name}(${ent.entryFloor})</strong>와 목적지 <strong>${room.roomNumber}(${room.floor})</strong>가 같은 층이므로 계단·엘리베이터 없이 복도로 바로 이동합니다.</span>
        `;
      } else {
        this.dom.sameFloorNotice.classList.add('hidden');
      }
    }

    if (this.dom.routeStepSummary) {
      if (isSameFloor) {
        this.dom.routeStepSummary.innerHTML = `
          <span class="seq-badge start">🚪 ${ent.name} (${ent.entryFloor})</span>
          <span class="seq-arrow">➔</span>
          <span class="seq-badge corridor">${ent.entryFloor} 복도 이동</span>
          <span class="seq-arrow">➔</span>
          <span class="seq-badge dest">🎯 ${room.roomNumber} (${room.floor})</span>
        `;
      } else {
        const vt = activeRoute.verticalTransition;
        const icon = this.activeRouteMode === 'elevator' ? '🛗' : '🪜';
        const modeClass = this.activeRouteMode === 'elevator' ? 'elv' : 'stair';
        this.dom.routeStepSummary.innerHTML = `
          <span class="seq-badge start">🚪 ${ent.name} (${vt.fromFloor})</span>
          <span class="seq-arrow">➔</span>
          <span class="seq-badge transit ${modeClass}">${icon} ${vt.fromFloor} ${this.activeRouteMode === 'elevator' ? '엘리베이터' : '계단'}</span>
          <span class="seq-arrow">➔</span>
          <span class="seq-badge transit ${modeClass}">${icon} ${vt.toFloor} ${this.activeRouteMode === 'elevator' ? '엘리베이터' : '계단'}</span>
          <span class="seq-arrow">➔</span>
          <span class="seq-badge dest">🎯 ${room.roomNumber} (${vt.toFloor})</span>
        `;
      }
    }

    if (this.dom.switchFloorPreviewBtn && this.dom.switchFloorPreviewText) {
      if (isSameFloor) {
        this.dom.switchFloorPreviewBtn.classList.add('hidden');
      } else {
        this.dom.switchFloorPreviewBtn.classList.remove('hidden');
        const targetFloor = activeRoute.endNode.floor;
        const startFloor = activeRoute.startNode.floor;
        if (this.currentFloor === startFloor) {
          this.dom.switchFloorPreviewText.textContent = `도착 층(${targetFloor}) 도면 보기`;
        } else {
          this.dom.switchFloorPreviewText.textContent = `출발 입구 층(${startFloor}) 보기`;
        }
      }
    }
  }

  startIndoorSimulation() {
    const activeRoute = this.getActiveRoute();
    if (!activeRoute) return;

    this.stopIndoorSimulation();
    this.hideFloorTransitionPopup();
    this.isSimulating = true;

    if (this.dom.startIndoorSimBtn) {
      this.dom.startIndoorSimBtn.classList.add('running');
    }
    if (this.dom.startIndoorSimText) {
      this.dom.startIndoorSimText.textContent = '실내 시뮬레이션 중지';
    }

    const firstSeg = activeRoute.floorSegments[0];
    this.setFloor(firstSeg.floor, { animate: true });

    const firstStep = activeRoute.steps[0];
    if (firstStep) {
      this.speak(firstStep.ttsText, `${firstSeg.floor} 실내 출발`);
    }

    this.simPhase = 'walking_to_transit';
    this.animateNodesSegment(firstSeg.nodes, () => {
      if (activeRoute.isSameFloor) {
        this.finishIndoorSimulation(activeRoute);
      } else if (activeRoute.verticalTransition) {
        this.triggerTransitNodeReached(activeRoute.verticalTransition);
      }
    });
  }

  triggerTransitNodeReached(verticalTransition) {
    if (!verticalTransition) return;

    this.simPhase = 'waiting_floor_change';
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }

    this.userMarkerPos = {
      floor: verticalTransition.departureNode.floor,
      x: verticalTransition.departureNode.x,
      y: verticalTransition.departureNode.y,
    };
    this.renderUserMarker();

    this.speak(
      verticalTransition.ttsPrompt,
      verticalTransition.transitType === 'elevator' ? '🛗 층간 엘리베이터 탑승' : '🪜 층간 계단 이동'
    );

    this.showFloorTransitionPopup(verticalTransition);
  }

  showFloorTransitionPopup(vt) {
    if (!this.dom.floorTransitionPopup) return;

    const isElevator = vt.transitType === 'elevator';
    const targetFloorKo = vt.toFloor.replace('F', '층');
    const room = this.data.nodes[this.selectedRoomId];

    if (this.dom.transitionPopupIcon) {
      this.dom.transitionPopupIcon.textContent = isElevator ? '🛗' : '🪜';
    }
    if (this.dom.transitionPopupTitle) {
      this.dom.transitionPopupTitle.textContent = vt.ttsPrompt;
    }
    if (this.dom.transitionPopupDesc) {
      this.dom.transitionPopupDesc.textContent = `${vt.departureNode.name}에 도착했습니다. ${targetFloorKo}으로 이동한 뒤 아래 버튼을 누르면 ${targetFloorKo} 도면과 ${room ? room.roomNumber : '목적지'}까지 남은 화살표를 안내합니다.`;
    }
    if (this.dom.confirmFloorTransitionText) {
      this.dom.confirmFloorTransitionText.textContent = vt.buttonLabel;
    }

    this.dom.floorTransitionPopup.classList.remove('hidden');
  }

  hideFloorTransitionPopup() {
    if (this.dom.floorTransitionPopup) {
      this.dom.floorTransitionPopup.classList.add('hidden');
    }
  }

  completeVerticalFloorTransition() {
    const activeRoute = this.getActiveRoute();
    if (!activeRoute || !activeRoute.verticalTransition) return;

    this.hideFloorTransitionPopup();

    const vt = activeRoute.verticalTransition;
    const destSeg = activeRoute.floorSegments[activeRoute.floorSegments.length - 1];
    if (!destSeg) return;

    this.setFloor(vt.toFloor, { animate: true });

    this.userMarkerPos = {
      floor: vt.arrivalNode.floor,
      x: vt.arrivalNode.x,
      y: vt.arrivalNode.y,
    };
    this.renderUserMarker();

    const transitArriveStep = activeRoute.steps.find((s) => s.type === 'transit_arrive');
    if (transitArriveStep) {
      this.speak(transitArriveStep.ttsText, `${vt.toFloor} 도면 전환 완료`);
    }

    this.simPhase = 'walking_to_room';
    this.isSimulating = true;
    this.animateNodesSegment(destSeg.nodes, () => {
      this.finishIndoorSimulation(activeRoute);
    });
  }

  finishIndoorSimulation(activeRoute) {
    this.isSimulating = false;
    this.simPhase = 'arrived';

    if (this.dom.startIndoorSimBtn) {
      this.dom.startIndoorSimBtn.classList.remove('running');
    }
    if (this.dom.startIndoorSimText) {
      this.dom.startIndoorSimText.textContent = '실내 안내 다시 실행';
    }

    const arriveStep = activeRoute.steps[activeRoute.steps.length - 1];
    if (arriveStep) {
      this.speak(arriveStep.ttsText, '🎯 강의실 도착 완료');
    }
    if (this.onShowToast && activeRoute.endNode) {
      this.onShowToast(`목적지 IT대학 ${activeRoute.endNode.roomNumber} 앞에 도착했습니다!`);
    }
  }

  animateNodesSegment(nodes, onComplete) {
    if (!nodes || nodes.length < 2) {
      if (onComplete) onComplete();
      return;
    }

    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }

    const samplePoints = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(8, Math.round(dist * 1.4));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        samplePoints.push({
          floor: a.floor,
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
        });
      }
    }
    const last = nodes[nodes.length - 1];
    samplePoints.push({ floor: last.floor, x: last.x, y: last.y });

    let idx = 0;
    this.simTimer = setInterval(() => {
      if (idx >= samplePoints.length) {
        clearInterval(this.simTimer);
        this.simTimer = null;
        if (onComplete) onComplete();
        return;
      }
      this.userMarkerPos = samplePoints[idx];
      this.renderUserMarker();
      idx += 1;
    }, 40);
  }

  stopIndoorSimulation() {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    this.isSimulating = false;
    this.simPhase = 'idle';
    if (this.dom.startIndoorSimBtn) {
      this.dom.startIndoorSimBtn.classList.remove('running');
    }
    if (this.dom.startIndoorSimText) {
      this.dom.startIndoorSimText.textContent = '실내 이동 시뮬레이션';
    }
  }

  setZoom(nextZoom) {
    this.zoom = Math.max(1, Math.min(2.6, nextZoom));
    if (this.zoom === 1) {
      this.panX = 0;
      this.panY = 0;
    }
    this.applyStageTransform();
  }

  resetZoomPan() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyStageTransform();
  }

  applyStageTransform() {
    if (!this.dom.stage) return;
    this.dom.stage.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  speak(text, badgeTitle = '실내 음성 길안내') {
    if (!text) return;
    if (this.onSpeakHud) {
      this.onSpeakHud(text, badgeTitle);
    } else if (this.tts) {
      this.tts.speak(text, { interrupt: true });
    }
  }
}

window.IndoorNavigator = IndoorNavigator;
