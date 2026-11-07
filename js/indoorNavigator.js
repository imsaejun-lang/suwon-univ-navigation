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
    this.directionMode = 'enter'; // 'enter' (외부 입구 -> 강의실) | 'exit' (강의실 출발 -> 외부 입구 -> 야외 목적지)
    this.currentFloor = '1F';
    this.outdoorOriginId = 'main_gate'; // 야외 출발지 ID (기본: 정문)
    this.outdoorOriginName = '정문';
    this.outdoorDestId = 'main_gate'; // 실내 출발 시 야외 목적지 ID
    this.outdoorDestName = '정문';
    this.routePreference = 'shortest'; // 'shortest' | 'mainRoad'
    this.selectedEntranceId = this.data.defaultEntranceId; // 'ent_1f_main' (1층 남동측 주출입구)
    this.selectedRoomId = this.data.defaultRoomId; // 'room_203' (2F 203호)
    this.customOriginNodeId = null; // 도면 마우스 클릭으로 지정한 커스텀 출발 노드 ID
    this.isPickOriginMode = false; // 도면 위 마우스 클릭 출발지 지정 모드
    this.activeRouteMode = 'elevator'; // 'elevator' | 'stairs'
    this.dualRoutes = { elevator: null, stairs: null };

    // 실내 시뮬레이션 상태 (실시간 지나온 길 트리밍 포함)
    this.simTimer = null;
    this.isSimulating = false;
    this.simPhase = 'idle';
    this.userMarkerPos = null; // { floor, x, y, orthoEdgeIndex }

    // 캔버스 줌/팬/360도 회전 상태
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.rotation = 0; // 0 ~ 360 deg
    this.isDragging = false;
    this.isRotatingDrag = false;
    this.dragStart = { x: 0, y: 0 };
    this.rotateStartAngle = 0;
    this.touchRotateState = null;

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

    // 줌 & 360도 회전 컨트롤
    this.dom.zoomInBtn = document.getElementById('indoorZoomInBtn');
    this.dom.zoomOutBtn = document.getElementById('indoorZoomOutBtn');
    this.dom.zoomResetBtn = document.getElementById('indoorZoomResetBtn');
    this.dom.rotateLeftBtn = document.getElementById('indoorRotateLeftBtn');
    this.dom.rotateRightBtn = document.getElementById('indoorRotateRightBtn');

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
    this.dom.pickOriginBtn = document.getElementById('indoorPickOriginBtn');
    this.dom.cancelIndoorNavBtn = document.getElementById('indoorCancelNavBtn');
  }

  bindEvents() {
    if (!this.dom.container) return;

    // 야외 지도로 돌아가기
    if (this.dom.backToOutdoorBtn) {
      this.dom.backToOutdoorBtn.addEventListener('click', () => {
        this.close();
      });
    }

    // 목적지/출발지 강의실 드롭다운 변경
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

    // [도착 층 도면 보기 / 출발 층 보기] 토글 버튼
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
          this.onRequestOutdoorRouteToEntrance(ent, this.selectedRoomId, this.directionMode);
        }
      });
    }

    // [🖱️ 도면 위 클릭으로 출발지 지정] 버튼
    if (this.dom.pickOriginBtn) {
      this.dom.pickOriginBtn.addEventListener('click', () => {
        this.togglePickOriginMode();
      });
    }

    // [✕ 안내 취소 / 종료] 버튼
    if (this.dom.cancelIndoorNavBtn) {
      this.dom.cancelIndoorNavBtn.addEventListener('click', () => {
        this.stopIndoorSimulation();
        this.close();
      });
    }

    // 줌 및 360도 회전 컨트롤
    if (this.dom.zoomInBtn) {
      this.dom.zoomInBtn.addEventListener('click', () => this.setZoom(this.zoom + 0.25));
    }
    if (this.dom.zoomOutBtn) {
      this.dom.zoomOutBtn.addEventListener('click', () => this.setZoom(this.zoom - 0.25));
    }
    if (this.dom.rotateLeftBtn) {
      this.dom.rotateLeftBtn.addEventListener('click', () => this.setRotation(this.rotation - 45));
    }
    if (this.dom.rotateRightBtn) {
      this.dom.rotateRightBtn.addEventListener('click', () => this.setRotation(this.rotation + 45));
    }
    if (this.dom.zoomResetBtn) {
      this.dom.zoomResetBtn.addEventListener('click', () => this.resetZoomPan());
    }

    // 마우스 팬(드래그) 및 우클릭/Alt/Ctrl 드래그 360도 회전 + 두 손가락 터치 회전/핀치줌 + 도면 클릭 출발지 지정
    if (this.dom.viewport) {
      this.dom.viewport.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      });

      this.dom.viewport.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button') || e.target.closest('.indoor-badge')) return;
        if (this.isPickOriginMode && e.button === 0) {
          this.handleBlueprintClickForOrigin(e);
          return;
        }
        if (e.pointerType === 'touch') return; // 터치는 touchstart/touchmove에서 멀티터치와 함께 처리

        if (e.button === 2 || e.altKey || e.ctrlKey) {
          this.isRotatingDrag = true;
          const rect = this.dom.viewport.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const startPointerAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
          this.rotateStartAngle = startPointerAngle - this.rotation;
          this.dom.viewport.classList.add('dragging');
          return;
        }

        this.isDragging = true;
        this.dragStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
        this.dom.viewport.classList.add('dragging');
      });

      window.addEventListener('pointermove', (e) => {
        if (this.isRotatingDrag && this.dom.viewport) {
          const rect = this.dom.viewport.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const currentAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
          this.setRotation(currentAngle - this.rotateStartAngle);
          return;
        }
        if (!this.isDragging) return;
        this.panX = e.clientX - this.dragStart.x;
        this.panY = e.clientY - this.dragStart.y;
        this.applyStageTransform();
      });

      window.addEventListener('pointerup', () => {
        if (this.isDragging || this.isRotatingDrag) {
          this.isDragging = false;
          this.isRotatingDrag = false;
          if (this.dom.viewport) this.dom.viewport.classList.remove('dragging');
        }
      });

      // 스마트폰 터치: 1손가락 팬 이동 + 2손가락 비틀기(360도 회전) & 핀치 줌
      this.dom.viewport.addEventListener(
        'touchstart',
        (e) => {
          if (e.target.closest('button') || e.target.closest('.indoor-badge')) return;
          if (e.touches.length === 1) {
            const t = e.touches[0];
            this.isDragging = true;
            this.dragStart = { x: t.clientX - this.panX, y: t.clientY - this.panY };
          } else if (e.touches.length === 2) {
            this.isDragging = false;
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            const angle = (Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180) / Math.PI;
            this.touchRotateState = {
              startDist: Math.max(20, dist),
              startZoom: this.zoom,
              startAngle: angle,
              startRotation: this.rotation,
            };
          }
        },
        { passive: true }
      );

      this.dom.viewport.addEventListener(
        'touchmove',
        (e) => {
          if (e.touches.length === 2 && this.touchRotateState) {
            e.preventDefault();
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            const angle = (Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180) / Math.PI;
            const scaleRatio = dist / this.touchRotateState.startDist;
            const nextZoom = Math.max(0.85, Math.min(3.5, this.touchRotateState.startZoom * scaleRatio));
            const deltaAngle = angle - this.touchRotateState.startAngle;
            this.zoom = nextZoom;
            this.setRotation(this.touchRotateState.startRotation + deltaAngle);
          } else if (e.touches.length === 1 && this.isDragging) {
            const t = e.touches[0];
            this.panX = t.clientX - this.dragStart.x;
            this.panY = t.clientY - this.dragStart.y;
            this.applyStageTransform();
          }
        },
        { passive: false }
      );

      this.dom.viewport.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
          this.touchRotateState = null;
        }
        if (e.touches.length === 0) {
          this.isDragging = false;
        }
      });

      this.dom.viewport.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.18 : -0.18;
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
        const roomsOnFloor = classrooms
          .filter((r) => r.floor === fId)
          .sort((a, b) => String(a.roomNumber).localeCompare(String(b.roomNumber), 'ko', { numeric: true }));
        if (!roomsOnFloor.length) return;
        html += `<optgroup label="IT대학 ${fId} (${fId.replace('F', '00')}호대)">`;
        roomsOnFloor.forEach((room) => {
          const selectedAttr = room.id === this.selectedRoomId ? 'selected' : '';
          const star = room.id === 'room_203' || room.id === 'room_310' || room.id === 'room_308' ? '★ ' : '';
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
   * - directionMode: 'enter' (야외 출발지 -> 건물 입구 -> 강의실)
   * - directionMode: 'exit'  (실내 호실 출발 -> 건물 입구 -> 야외 목적지)
   */
  open(opts = {}) {
    if (!this.dom.container) return;

    this.stopIndoorSimulation();
    this.isPickOriginMode = false;
    this.customOriginNodeId = null;
    if (this.dom.pickOriginBtn) this.dom.pickOriginBtn.classList.remove('active');
    if (this.dom.viewport) this.dom.viewport.classList.remove('pick-origin-cursor');

    this.directionMode = opts.directionMode === 'exit' ? 'exit' : 'enter';
    if (opts.routePreference) {
      this.routePreference = opts.routePreference;
    }

    if (opts.outdoorOriginId) {
      this.outdoorOriginId = opts.outdoorOriginId;
      const originNode = window.CAMPUS_NODES && window.CAMPUS_NODES[opts.outdoorOriginId];
      this.outdoorOriginName = originNode ? originNode.name : opts.outdoorOriginName || '정문';
    }

    if (opts.outdoorDestId) {
      this.outdoorDestId = opts.outdoorDestId;
      const destNode = window.CAMPUS_NODES && window.CAMPUS_NODES[opts.outdoorDestId];
      this.outdoorDestName = destNode ? destNode.name : opts.outdoorDestName || '정문';
    }

    // 동적 강의실(예: room_308, room_310 등) 자동 보장
    if (opts.roomId) {
      if (!this.data.nodes[opts.roomId] && this.router.ensureDynamicRoomNode) {
        this.router.ensureDynamicRoomNode(opts.roomId);
      }
      if (this.data.nodes[opts.roomId]) {
        this.selectedRoomId = opts.roomId;
      }
    } else if (!this.selectedRoomId || !this.data.nodes[this.selectedRoomId]) {
      this.selectedRoomId = 'room_203';
    }

    // 핵심: 야외에서 들어간 입구 또는 선택된 루트(큰길 우선 vs 최단거리)에 맞춘 최적 입구 설정!
    if (opts.entranceId && this.getEntranceById(opts.entranceId)) {
      this.selectedEntranceId = opts.entranceId;
    } else if (this.directionMode === 'exit') {
      const resolvedExitEnt = this.router.resolveEntranceForOutdoorOrigin(
        this.outdoorDestId || 'main_gate',
        this.routePreference
      );
      this.selectedEntranceId = resolvedExitEnt ? resolvedExitEnt.id : this.data.defaultEntranceId;
    } else {
      const resolvedEnt = this.router.resolveEntranceForOutdoorOrigin(
        this.outdoorOriginId,
        this.routePreference
      );
      this.selectedEntranceId = resolvedEnt ? resolvedEnt.id : this.data.defaultEntranceId;
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
      const entFloorKo = ent.entryFloor.replace('F', '층');
      const roomFloorKo = room.floor.replace('F', '층');
      const modeKo = this.activeRouteMode === 'elevator' ? '엘리베이터' : '계단';
      let msg = '';
      if (this.directionMode === 'exit') {
        msg = `현재 위치한 ${roomFloorKo} ${room.roomNumber}에서 출발하여 ${ent.name}(${entFloorKo})를 거쳐 야외 목적지 ${this.outdoorDestName}까지 통합 최단 경로를 안내합니다.`;
      } else if (ent.entryFloor === room.floor) {
        msg = `야외 경로에서 진입한 ${ent.name}(${entFloorKo})를 기준으로 ${room.roomNumber}까지 실내 안내를 시작합니다.`;
      } else {
        msg = `야외 경로에서 진입한 ${ent.name}(${entFloorKo})를 기준으로 ${roomFloorKo} ${room.roomNumber}까지 ${modeKo} 최단 경로를 안내합니다.`;
      }
      this.speak(msg, this.directionMode === 'exit' ? '실내 출발 ➔ 야외 통합 길안내' : '실내 도면 길안내');
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
   * 도면 위 마우스 클릭으로 시뮬레이션 출발지 직접 지정 모드 토글
   */
  togglePickOriginMode(forceState) {
    this.isPickOriginMode =
      typeof forceState === 'boolean' ? forceState : !this.isPickOriginMode;
    if (this.dom.pickOriginBtn) {
      this.dom.pickOriginBtn.classList.toggle('active', this.isPickOriginMode);
    }
    if (this.dom.viewport) {
      this.dom.viewport.classList.toggle('pick-origin-cursor', this.isPickOriginMode);
    }
    if (this.isPickOriginMode && this.onShowToast) {
      this.onShowToast(
        `🖱️ 현재 ${this.currentFloor} 도면 위에서 출발할 지점을 마우스로 클릭하세요.`
      );
    }
  }

  /**
   * 실내 도면(viewport) 위를 클릭했을 때 클릭한 정확한 도면 좌표(0~100%)를 시뮬레이션 출발지로 설정
   */
  handleBlueprintClickForOrigin(e) {
    if (!this.dom.routeSvg || !this.router.ensureCustomIndoorPointNode) return;

    let xPct = 50;
    let yPct = 76;

    try {
      const pt = this.dom.routeSvg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = this.dom.routeSvg.getScreenCTM();
      if (ctm) {
        const transformed = pt.matrixTransform(ctm.inverse());
        xPct = transformed.x;
        yPct = transformed.y;
      }
    } catch (err) {
      const rect = this.dom.stage.getBoundingClientRect();
      xPct = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100;
      yPct = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100;
    }

    if (xPct < 2 || xPct > 98 || yPct < 2 || yPct > 98) return;

    this.stopIndoorSimulation();
    this.hideFloorTransitionPopup();
    this.togglePickOriginMode(false);

    const customNode = this.router.ensureCustomIndoorPointNode(
      this.currentFloor,
      xPct,
      yPct,
      '도면 클릭 출발지'
    );
    if (!customNode) return;

    this.customOriginNodeId = customNode.id;
    this.recalculateAndRender({ resetFloorToStart: false });

    const room = this.data.nodes[this.selectedRoomId];
    const destLabel = room ? `${room.floor} ${room.roomNumber}` : '목적지';
    const msg = `${this.currentFloor} 도면에서 클릭한 지점을 출발지로 설정했습니다. ${destLabel}까지 안내합니다.`;
    if (this.onShowToast) this.onShowToast(`📍 ${msg}`);
    this.speak(msg, '실내 도면 클릭 출발지 설정');
  }

  /**
   * 상단 출입구 칩에서 사용자가 명시적으로 다른 출입구를 테스트 선택했을 때만 변경
   */
  selectEntrance(entranceId, options = {}) {
    const ent = this.getEntranceById(entranceId);
    if (!ent) return;

    this.stopIndoorSimulation();
    this.hideFloorTransitionPopup();
    this.customOriginNodeId = null;
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
   * 목적지(또는 실내 출발 시 출발지) 강의실 변경 (예: 310호, 308호, 203호, 101호 등)
   * - 외부에서 들어간 입구(selectedEntranceId)를 절대 바꾸지 않고 그대로 유지!
   */
  setDestinationRoom(roomId, options = {}) {
    if (!this.data.nodes[roomId] && this.router.ensureDynamicRoomNode) {
      const created = this.router.ensureDynamicRoomNode(roomId);
      if (created) {
        roomId = created.id;
        this.populateStaticControls();
      }
    }
    const room = this.data.nodes[roomId];
    if (!room || room.type !== 'classroom') return;

    this.stopIndoorSimulation();
    this.hideFloorTransitionPopup();
    this.selectedRoomId = roomId;

    if (this.dom.targetRoomSelect && this.dom.targetRoomSelect.value !== roomId) {
      this.dom.targetRoomSelect.value = roomId;
    }

    const resetFloor = options.resetFloorToStart !== undefined ? options.resetFloorToStart : false;
    this.recalculateAndRender({ resetFloorToStart: resetFloor });

    if (options.speak) {
      const ent = this.getSelectedEntrance();
      const entFloorKo = ent.entryFloor.replace('F', '층');
      const roomFloorKo = room.floor.replace('F', '층');
      if (this.directionMode === 'exit') {
        this.speak(
          `출발 호실을 ${roomFloorKo} ${room.name}으로 설정했습니다. ${ent.name}(${entFloorKo})을 통해 야외 ${this.outdoorDestName}으로 안내합니다.`,
          '실내 출발 호실 설정'
        );
      } else {
        this.speak(
          `외부 진입 입구인 ${ent.name}(${entFloorKo})에서 ${roomFloorKo} ${room.name}까지 실내 경로를 안내합니다.`,
          '강의실 목적지 설정'
        );
      }
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
    const hasCustomOrigin =
      this.customOriginNodeId && Boolean(this.data.nodes[this.customOriginNodeId]);
    const startNodeId = hasCustomOrigin
      ? this.customOriginNodeId
      : this.directionMode === 'exit'
        ? this.selectedRoomId
        : ent.nodeId;
    const endNodeId = this.directionMode === 'exit' ? ent.nodeId : this.selectedRoomId;

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
        orthoEdgeIndex: null,
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
    const isExit = this.directionMode === 'exit';

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
            <span class="ent-floor-pill" style="background:${ent.badgeColor}">${ent.entryFloor} ${isExit ? '출구' : '진입'}</span>
            <span class="ent-chip-name">${ent.name}</span>
            ${isActive ? `<span class="ent-outdoor-tag">${isExit ? '야외탈출 최적출입구' : '야외안내 진입출입구'}</span>` : ''}
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
      const entNum = parseInt(currentEnt.entryFloor, 10) || 1;
      const roomNum = parseInt(targetRoom.floor, 10) || 2;
      const diff = Math.abs(roomNum - entNum);

      if (isExit) {
        const dirText = entNum < roomNum ? `${diff}개 층 아래로 이동` : `${diff}개 층 위로 이동`;
        this.dom.entranceFloorExplain.innerHTML = `
          <span class="explain-tag">🏢 실내 출발(${targetRoom.floor} ${targetRoom.roomNumber}) ➔ 야외(${this.outdoorDestName}) 통합 경로</span>
          <span class="explain-main">
            현재 위치한 <strong>${targetRoom.floor} ${targetRoom.roomNumber}</strong> 출발 ➔
            <strong class="${isSame ? 'same-floor-hl' : 'cross-floor-hl'}">
              ${isSame ? `${targetRoom.floor} 복도 직통 이동` : `[${targetRoom.floor} 복도 ➔ 엘리베이터/계단(${dirText}) ➔ ${currentEnt.entryFloor} ${currentEnt.name}]`}
            </strong>
            ➔ 야외 도로를 따라 <strong>${this.outdoorDestName}</strong> 도착
          </span>
        `;
      } else {
        const dirText = roomNum > entNum ? `${diff}개 층 위로 이동` : `${diff}개 층 아래로 이동`;
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
          roleTag = `<span class="floor-role-dot start">${this.directionMode === 'exit' ? '출발층' : '진입층'}</span>`;
        } else if (isEnd) {
          roleTag = `<span class="floor-role-dot dest">${this.directionMode === 'exit' ? '출구층' : '목적지층'}</span>`;
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
   * 현재 층의 2D 원본 평면도 배경 + 직각(ㄱ/ㄴ) 복도 경로 SVG + 고대비 배지 렌더링
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
   * 원본 피난안내도 도면을 가리지 않도록 불필요한 박스/노란 복도 덧칠을 제거하고,
   * 선택된 목적지(또는 출발) 호실 위치에만 깔끔한 포커스 링을 표시합니다.
   */
  buildTargetRoomHighlightSvg() {
    const targetRoom = this.data.nodes[this.selectedRoomId];
    if (!targetRoom || targetRoom.floor !== this.currentFloor) return '';

    const isExit = this.directionMode === 'exit';
    const ringColor = isExit ? '#10b981' : '#f43f5e';
    const fillColor = isExit ? 'rgba(16, 185, 129, 0.14)' : 'rgba(244, 63, 94, 0.14)';

    return `
      <g class="indoor-target-room-ring">
        <circle
          cx="${targetRoom.x.toFixed(2)}"
          cy="${targetRoom.y.toFixed(2)}"
          r="2.9"
          fill="${fillColor}"
          stroke="${ringColor}"
          stroke-width="0.45"
          stroke-dasharray="1.1 0.7"
        />
      </g>
    `;
  }

  /**
   * 실내 경로 노드 배열이 어떤 경우에도 벽을 대각선으로 관통하지 않도록
   * 모든 연속 구간을 직각(ㄱ자, ㄴ자) 복도 중심선 좌표로 보정합니다.
   */
  ensureOrthogonalPoints(nodes) {
    if (!nodes || !nodes.length) return [];
    const result = [{ x: Number(nodes[0].x), y: Number(nodes[0].y), type: nodes[0].type }];

    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const ax = Number(a.x);
      const ay = Number(a.y);
      const bx = Number(b.x);
      const by = Number(b.y);
      const dx = Math.abs(bx - ax);
      const dy = Math.abs(by - ay);

      // 만약 x와 y가 동시에 1.3% 이상 차이 나는 대각선 구간이 있다면 직각 코너(문 앞 진입점)를 자동 삽입
      if (dx > 1.3 && dy > 1.3) {
        if (a.type === 'classroom') {
          // 강의실에서 수평 복도로 나올 때는 문 앞(동일 x, 복도 y)으로 먼저 수직 진출
          result.push({ x: ax, y: by, type: 'corridor_corner' });
        } else if (b.type === 'classroom') {
          // 복도에서 강의실로 들어갈 때는 강의실 문 앞(강의실 x, 복도 y)까지 복도를 따라 이동 후 수직 진입
          result.push({ x: bx, y: ay, type: 'corridor_corner' });
        } else {
          // 일반 복도 간 코너 보정
          result.push({ x: bx, y: ay, type: 'corridor_corner' });
        }
      }
      result.push({ x: bx, y: by, type: b.type });
    }
    return result;
  }

  /**
   * 시뮬레이션 이동 중 내 위치(userMarkerPos)를 직교 경로 폴리라인 위의 투영점(Projected Point)으로 계산해
   * 이미 지나온 선은 아예 그리지 않고 투영점부터 목적지까지의 남은 선만 왜곡 없이 반환합니다.
   */
  getTrimmedOrthogonalPoints(orthoPoints, isSelectedRoute) {
    if (
      !isSelectedRoute ||
      !this.isSimulating ||
      !this.userMarkerPos ||
      this.userMarkerPos.floor !== this.currentFloor ||
      !Array.isArray(orthoPoints) ||
      orthoPoints.length < 2
    ) {
      return orthoPoints;
    }

    const ux = Number(this.userMarkerPos.x);
    const uy = Number(this.userMarkerPos.y);
    let bestSegIdx =
      typeof this.userMarkerPos.orthoEdgeIndex === 'number'
        ? Math.min(Math.max(0, this.userMarkerPos.orthoEdgeIndex), orthoPoints.length - 2)
        : 0;
    let bestProjX = ux;
    let bestProjY = uy;
    let minSqDist = Infinity;

    const searchStart =
      typeof this.userMarkerPos.orthoEdgeIndex === 'number'
        ? Math.max(0, this.userMarkerPos.orthoEdgeIndex)
        : 0;

    for (let i = searchStart; i < orthoPoints.length - 1; i++) {
      const a = orthoPoints[i];
      const b = orthoPoints[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      let t = 0;
      if (lenSq > 0) {
        t = Math.max(0, Math.min(1, ((ux - a.x) * dx + (uy - a.y) * dy) / lenSq));
      }
      const px = a.x + t * dx;
      const py = a.y + t * dy;
      const sqDist = (ux - px) * (ux - px) + (uy - py) * (uy - py);
      if (sqDist < minSqDist) {
        minSqDist = sqDist;
        bestSegIdx = i;
        bestProjX = px;
        bestProjY = py;
      }
    }

    const remaining = [
      { x: bestProjX, y: bestProjY, type: 'projected_start' },
      ...orthoPoints.slice(bestSegIdx + 1),
    ];
    return remaining.length >= 2 ? remaining : orthoPoints.slice(-2);
  }

  /**
   * 현재 층에 해당하는 [엘리베이터 루트(파란색)]와 [계단 루트(초록색)] 직각 화살표를 SVG로 렌더링
   */
  renderDualRoutesSvg() {
    if (!this.dom.routeSvg) return;

    const elvRoute = this.dualRoutes.elevator;
    const stairRoute = this.dualRoutes.stairs;

    let svgContent = `
      <defs>
        <filter id="indoorRouteGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0.8" stdDeviation="0.9" flood-color="#0f172a" flood-opacity="0.32" />
        </filter>
      </defs>
      ${this.buildTargetRoomHighlightSvg()}
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
        });
      }
    } else {
      const renderOrder =
        this.activeRouteMode === 'elevator'
          ? [
            { route: stairRoute, mode: 'stairs', color: '#03c75a', isSelected: false },
            { route: elvRoute, mode: 'elevator', color: '#0068ff', isSelected: true },
          ]
          : [
            { route: elvRoute, mode: 'elevator', color: '#0068ff', isSelected: false },
            { route: stairRoute, mode: 'stairs', color: '#03c75a', isSelected: true },
          ];

      renderOrder.forEach((item) => {
        if (!item.route) return;
        const seg = item.route.floorSegments.find((s) => s.floor === this.currentFloor);
        if (!seg || seg.nodes.length < 2) return;

        svgContent += this.buildSvgRouteGroup(seg.nodes, {
          color: item.color,
          isSelected: item.isSelected,
          mode: item.mode,
        });
      });
    }

    this.dom.routeSvg.innerHTML = svgContent;
  }

  buildSvgRouteGroup(nodes, opts = {}) {
    const { color = '#0068ff', isSelected = true } = opts;

    // 1. 먼저 원본 노드를 복도 중심선 직각(ㄱ/ㄴ) 폴리라인으로 변환
    const fullOrthogonalPoints = this.ensureOrthogonalPoints(nodes);
    // 2. 직교 폴리라인 위에서 현재 위치의 투영점(Projected Point)을 구해 지나온 구간을 삭제 (재보정으로 인한 선 꼬임 원천 차단!)
    const orthogonalPoints = this.getTrimmedOrthogonalPoints(fullOrthogonalPoints, isSelected);

    const pointsAttr = orthogonalPoints.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
    const opacity = isSelected ? 0.98 : 0.52;
    const strokeWidth = isSelected ? 1.55 : 0.92;
    const outlineWidth = isSelected ? 2.45 : 1.45;
    const dashArray = isSelected ? 'none' : '1.6 1.2';

    let arrowsSvg = '';
    for (let i = 0; i < orthogonalPoints.length - 1; i++) {
      const p1 = orthogonalPoints[i];
      const p2 = orthogonalPoints[i + 1];
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
        const isExitMode = this.directionMode === 'exit';
        if (isSelectedEnt) {
          html += `
            <div
              class="indoor-badge badge-entrance active-entrance"
              style="${posStyle}"
              title="${isExitMode ? '야외로 나가는 목표 출입구' : '야외 경로에서 진입한 출발 출입구'} (${node.name})"
            >
              <span class="badge-icon">🚪</span>
              <span class="badge-text">${node.shortLabel.replace('🚪 ', '')}</span>
              <span class="badge-tag-start">${isExitMode ? `야외 출구 ➔ ${this.outdoorDestName}` : '출발 입구'}</span>
            </div>
          `;
        } else {
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
            ${isArr && fromFloor
            ? `<span class="transit-arrival-pill">📍 ${fromFloor}에서 이동해 온 지점</span>`
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
            ${isArr && fromFloor
            ? `<span class="transit-arrival-pill stair">📍 ${fromFloor}에서 이동해 온 지점</span>`
            : ''
          }
          </button>
        `;
      } else if (node.type === 'custom_origin' && node.id === this.customOriginNodeId) {
        html += `
          <div class="indoor-badge badge-entrance active-entrance" style="${posStyle}" title="${node.name}">
            <span class="badge-icon">🚩</span>
            <span class="badge-text">클릭 출발지</span>
            <span class="badge-tag-start">시뮬레이션 시작점</span>
          </div>
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
        const isExitMode = this.directionMode === 'exit';
        html += `
          <button
            type="button"
            class="indoor-badge badge-classroom ${isTargetRoom ? 'target-room' : ''} ${node.isFeatured ? 'featured-room' : ''}"
            style="${posStyle}"
            data-room-id="${node.id}"
            title="${node.name} (${node.dept})"
          >
            ${isTargetRoom ? `<span class="badge-icon">${isExitMode ? '🚩' : '🎯'}</span>` : ''}
            <span class="badge-room-num">${node.roomNumber}</span>
            ${isTargetRoom ? `<span class="badge-room-sub">${isExitMode ? '현재 출발 호실' : '목적지'}</span>` : ''}
          </button>
        `;
      }
    });

    this.dom.overlayLayer.innerHTML = html;

    // 강의실 배지 클릭 -> 외부 진입 입구는 그대로 유지하고 목적지(또는 출발) 강의실만 변경!
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
    const isExit = this.directionMode === 'exit';

    if (!activeRoute || !room || !ent) return;

    if (this.dom.buildingTitle) {
      if (isExit) {
        this.dom.buildingTitle.textContent = `IT대학 ${room.floor} ${room.roomNumber} 출발 ➔ ${this.outdoorDestName} 통합 길안내`;
      } else {
        this.dom.buildingTitle.textContent = `IT대학 ${room.roomNumber} 실내 길안내 (${ent.entryFloor} 입구 기준)`;
      }
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
        if (isExit) {
          this.dom.tabElevatorMeta.textContent = isSameFloor
            ? `${room.floor} ${room.roomNumber} ➔ ${ent.name} · ${elvRoute.totalDistanceMeters}m`
            : `${room.floor} ${room.roomNumber} ➔ 🛗 엘리베이터 ➔ ${ent.entryFloor} ${ent.name} · ${elvRoute.totalDistanceMeters}m`;
        } else {
          this.dom.tabElevatorMeta.textContent = isSameFloor
            ? `같은 층(${ent.entryFloor}) 복도 이동 · ${elvRoute.totalDistanceMeters}m`
            : `${ent.name}(${ent.entryFloor}) ➔ 🛗 엘리베이터 ➔ ${room.floor} ${room.roomNumber} · ${elvRoute.totalDistanceMeters}m`;
        }
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
        if (isExit) {
          this.dom.tabStairsMeta.textContent = isSameFloor
            ? `${room.floor} ${room.roomNumber} ➔ ${ent.name} · ${stairRoute.totalDistanceMeters}m`
            : `${room.floor} ${room.roomNumber} ➔ 🪜 계단 ➔ ${ent.entryFloor} ${ent.name} · ${stairRoute.totalDistanceMeters}m`;
        } else {
          this.dom.tabStairsMeta.textContent = isSameFloor
            ? `같은 층(${ent.entryFloor}) 복도 이동 · ${stairRoute.totalDistanceMeters}m`
            : `${ent.name}(${ent.entryFloor}) ➔ 🪜 계단 ➔ ${room.floor} ${room.roomNumber} · ${stairRoute.totalDistanceMeters}m`;
        }
      }
    }

    if (this.dom.sameFloorNotice) {
      if (isSameFloor) {
        this.dom.sameFloorNotice.classList.remove('hidden');
        this.dom.sameFloorNotice.innerHTML = `
          <i data-lucide="check-circle-2"></i>
          <span>${isExit ? `출발 호실 <strong>${room.roomNumber}(${room.floor})</strong>와 탈출 입구 <strong>${ent.name}(${ent.entryFloor})</strong>가` : `진입하신 <strong>${ent.name}(${ent.entryFloor})</strong>와 목적지 <strong>${room.roomNumber}(${room.floor})</strong>가`} 같은 층이므로 계단·엘리베이터 없이 복도로 바로 이동합니다.</span>
        `;
      } else {
        this.dom.sameFloorNotice.classList.add('hidden');
      }
    }

    if (this.dom.routeStepSummary) {
      if (isExit) {
        if (isSameFloor) {
          this.dom.routeStepSummary.innerHTML = `
            <span class="seq-badge start">🚩 ${room.roomNumber} (${room.floor})</span>
            <span class="seq-arrow">➔</span>
            <span class="seq-badge corridor">${room.floor} 복도 이동</span>
            <span class="seq-arrow">➔</span>
            <span class="seq-badge dest">🚪 ${ent.name} ➔ ${this.outdoorDestName}</span>
          `;
        } else {
          const vt = activeRoute.verticalTransition;
          const icon = this.activeRouteMode === 'elevator' ? '🛗' : '🪜';
          const modeClass = this.activeRouteMode === 'elevator' ? 'elv' : 'stair';
          this.dom.routeStepSummary.innerHTML = `
            <span class="seq-badge start">🚩 ${room.roomNumber} (${vt.fromFloor})</span>
            <span class="seq-arrow">➔</span>
            <span class="seq-badge transit ${modeClass}">${icon} ${vt.fromFloor}➔${vt.toFloor} ${this.activeRouteMode === 'elevator' ? '엘리베이터' : '계단'}</span>
            <span class="seq-arrow">➔</span>
            <span class="seq-badge dest">🚪 ${ent.name} (${vt.toFloor})</span>
            <span class="seq-arrow">➔</span>
            <span class="seq-badge start">🌳 야외 (${this.outdoorDestName})</span>
          `;
        }
      } else if (isSameFloor) {
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
          this.dom.switchFloorPreviewText.textContent = `출발 층(${startFloor}) 도면 보기`;
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
      segEdgeIndex: null,
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
    const ent = this.getSelectedEntrance();
    const isExit = this.directionMode === 'exit';

    if (this.dom.transitionPopupIcon) {
      this.dom.transitionPopupIcon.textContent = isElevator ? '🛗' : '🪜';
    }
    if (this.dom.transitionPopupTitle) {
      this.dom.transitionPopupTitle.textContent = vt.ttsPrompt;
    }
    if (this.dom.transitionPopupDesc) {
      const destLabel = isExit ? (ent ? ent.name : '출입구') : (room ? room.roomNumber : '목적지');
      this.dom.transitionPopupDesc.textContent = `${vt.departureNode.name}에 도착했습니다. ${targetFloorKo}으로 이동한 뒤 아래 버튼을 누르면 ${targetFloorKo} 도면과 ${destLabel}까지 남은 화살표를 안내합니다.`;
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
      segEdgeIndex: 0,
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
    if (this.userMarkerPos) {
      this.userMarkerPos.segEdgeIndex = null;
    }
    this.renderDualRoutesSvg();

    if (this.dom.startIndoorSimBtn) {
      this.dom.startIndoorSimBtn.classList.remove('running');
    }
    if (this.dom.startIndoorSimText) {
      this.dom.startIndoorSimText.textContent = '실내 안내 다시 실행';
    }

    const arriveStep = activeRoute.steps[activeRoute.steps.length - 1];
    const isExit = this.directionMode === 'exit';
    if (isExit) {
      const ent = this.getSelectedEntrance();
      const msg = `${ent ? ent.name : '출입구'}에 도착했습니다! 건물 밖으로 나가 야외 도로를 따라 ${this.outdoorDestName}까지 이동하세요.`;
      this.speak(msg, '🚪 건물 출입구 도착 · 야외 경로 연결');
      if (this.onShowToast) {
        this.onShowToast(msg);
      }
    } else {
      if (arriveStep) {
        this.speak(arriveStep.ttsText, '🎯 강의실 도착 완료');
      }
      if (this.onShowToast && activeRoute.endNode) {
        this.onShowToast(`목적지 IT대학 ${activeRoute.endNode.roomNumber} 앞에 도착했습니다!`);
      }
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

    const floorId = nodes[0].floor || this.currentFloor;
    const orthoNodes = this.ensureOrthogonalPoints(nodes);
    if (orthoNodes.length < 2) {
      if (onComplete) onComplete();
      return;
    }

    const samplePoints = [];
    for (let i = 0; i < orthoNodes.length - 1; i++) {
      const a = orthoNodes[i];
      const b = orthoNodes[i + 1];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(6, Math.round(dist * 1.4));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        samplePoints.push({
          floor: floorId,
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          orthoEdgeIndex: i,
        });
      }
    }
    const last = orthoNodes[orthoNodes.length - 1];
    samplePoints.push({
      floor: floorId,
      x: last.x,
      y: last.y,
      orthoEdgeIndex: Math.max(0, orthoNodes.length - 2),
    });

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
      this.renderDualRoutesSvg(); // 이동에 따라 지나온 실내 경로선 실시간 삭제
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
    if (this.userMarkerPos) {
      this.userMarkerPos.orthoEdgeIndex = null;
    }
    if (this.dom.startIndoorSimBtn) {
      this.dom.startIndoorSimBtn.classList.remove('running');
    }
    if (this.dom.startIndoorSimText) {
      this.dom.startIndoorSimText.textContent = '실내 이동 시뮬레이션';
    }
  }

  setZoom(nextZoom) {
    this.zoom = Math.max(0.85, Math.min(3.5, nextZoom));
    if (Math.abs(this.zoom - 1) < 0.05) {
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
    }
    this.applyStageTransform();
  }

  setRotation(nextDeg) {
    let norm = Number(nextDeg) || 0;
    norm = ((norm % 360) + 360) % 360;
    if (norm > 180) norm -= 360;
    this.rotation = norm;
    this.applyStageTransform();
  }

  resetZoomPan() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.rotation = 0;
    this.applyStageTransform();
  }

  applyStageTransform() {
    if (!this.dom.stage) return;
    this.dom.stage.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom}) rotate(${this.rotation}deg)`;
    this.dom.stage.style.setProperty('--indoor-rotation-neg', `${-this.rotation}deg`);
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
