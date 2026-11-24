/**
 * 수원대학교 전 건물(23개동) 도식화 실내지도 & 복도 전용 다층 길찾기 컨트롤러
 * - suwon-univ-navigation-penelmap/suwon_building_maps/suwonBuildingMap.js API 연동
 * - viewer.html 및 README_AI_GUIDE.md 스펙을 메인 앱(모바일/데스크톱 반응형)에 완전 통합
 */
(function (global) {
  'use strict';

  const DEFAULT_BASE_URL = './suwon-univ-navigation-penelmap/suwon_building_maps';

  // 야외 지도(CAMPUS_NODES) ID -> suwon_building_maps catalog ID 매핑
  const CAMPUS_TO_PANEL_ID = {
    humanities_college: 'humanities_college',
    law_college: 'law_college',
    science_college: 'science_college',
    natural_science_hall: 'natural_science_hall',
    eng_main: 'eng_main',
    eng_building_1: 'eng_building_1',
    eng_building_2: 'eng_building_2',
    global_talent: 'global_talent',
    sports_college: 'sports_college',
    future_innovation: 'future_innovation',
    global_business: 'global_business',
    central_library: 'central_library',
    student_union: 'student_union',
    art_college: 'art_college',
    sculpture_hall: 'sculpture_hall',
    advanced_tech_inst: 'advanced_tech_inst',
    dormitory: 'dormitory_a',
    dormitory_a: 'dormitory_a',
    dormitory_b: 'dormitory_b',
    dormitory_c: 'dormitory_c',
    music_college: 'music_college',
    amaranth_hall: 'amaranth_hall',
    lecture_hall: 'lecture_hall',
    it_college: 'it_college',
  };

  // catalog ID -> 야외 지도(CAMPUS_NODES) ID 역매핑 (야외 길찾기 연동용)
  const PANEL_TO_CAMPUS_ID = {
    natural_science_hall: 'science_college',
    dormitory_a: 'dormitory',
    dormitory_b: 'dormitory',
    dormitory_c: 'dormitory',
  };

  const SECTOR_TYPE_LABELS = {
    classroom: '강의실',
    office: '사무실/연구실',
    lounge: '휴게실',
    facility: '편의시설',
    auditorium: '대강당/홀',
    restroom_men: '남자화장실',
    restroom_women: '여자화장실',
    stairs: '계단',
    elevator: '엘리베이터',
    entrance: '출입구',
    void: '오픈공간',
  };

  class PanelMapIndoorController {
    constructor(options = {}) {
      this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
      this.nav = options.indoorNav || null; // [SSOT] IT대학 단일 엔진(IndoorNavigator) 공유
      this.onClose = options.onClose || null;
      this.onShowToast = options.onShowToast || null;
      this.onSpeak = options.onSpeak || null;
      this.onRequestOutdoorRoute = options.onRequestOutdoorRoute || null;
      this.onSwitchToOutdoorGuidance = options.onSwitchToOutdoorGuidance || null;
      this.onGetCurrentGps = options.onGetCurrentGps || null;
      this.onSwitchToITLegacy = options.onSwitchToITLegacy || null;

      this.isOpen = false;
      this.catalog = null;
      this.catalogPromise = null;
      this.curBldgMeta = null;
      this.curData = null;
      this.curFloor = null;
      this.startId = null;
      this.endId = null;
      this.curRoute = null;
      this.routeMode = 'any'; // 'any' | 'stairs' | 'elevator'
      this.searchScope = 'floor'; // 'floor' | 'all'
      this.drawerTab = 'sectors'; // 'sectors' | 'refs'
      this.drawerCollapsed = true;

      // 타 건물(22개동)용 실시간 실내 GPS 추적 & 2단계 오차 보정 상태 (IT대학은 this.nav 단일 상태 공유)
      this.liveGpsEnabled = false;
      this.liveGpsPos = null; // { buildingId, floor, x, y, snappedTo }
      this.pendingAutoSector = null;
      this.pendingMappedXY = null;
      this._lastTickRenderAt = 0;

      // SVG 줌/팬 상태
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this._dragState = null;
      this._pinchState = null;
      this._suppressNextClick = false;

      this.dom = {};
      this.cacheDom();
      this.bindEvents();
      this.bindSharedEngineHooks();
    }

    isUsingSharedEngine() {
      return Boolean(this.nav && this.curData && this.curData.buildingId === 'it_college');
    }

    bindSharedEngineHooks() {
      if (!this.nav) return;

      this.nav.onStateUpdated = () => {
        if (!this.nav.isOpen && !this.nav.isSchematicViewActive && this.isOpen && this.isUsingSharedEngine()) {
          this.close({ silent: true, skipNavClose: true });
          return;
        }
        if (this.isOpen && this.isUsingSharedEngine()) {
          this.syncFromSharedEngine({ autoFollowFloor: false });
        }
      };

      this.nav.onSimTick = (meta) => {
        if (this.isOpen && this.isUsingSharedEngine()) {
          this.onSharedEngineTick(meta);
        }
      };
    }

    static resolvePanelBuildingId(campusOrPanelId) {
      if (!campusOrPanelId) return null;
      return CAMPUS_TO_PANEL_ID[campusOrPanelId] || null;
    }

    static resolveCampusBuildingId(panelId) {
      if (!panelId) return null;
      return PANEL_TO_CAMPUS_ID[panelId] || panelId;
    }

    static hasBuilding(campusOrPanelId) {
      return Boolean(PanelMapIndoorController.resolvePanelBuildingId(campusOrPanelId));
    }

    cacheDom() {
      this.dom.overlay = document.getElementById('panelMapOverlay');
      if (!this.dom.overlay) return;

      this.dom.backBtn = document.getElementById('pmBackBtn');
      this.dom.buildingSelect = document.getElementById('pmBuildingSelect');
      this.dom.statusText = document.getElementById('pmStatusText');
      this.dom.itLegacySwitchBtn = document.getElementById('pmItLegacyBtn');
      this.dom.outdoorRouteBtn = document.getElementById('pmOutdoorRouteBtn');

      // 경로 탐색 컨트롤 바
      this.dom.routeToggleBtn = document.getElementById('pmRoutePanelToggleBtn');
      this.dom.routePanel = document.getElementById('pmRoutePanel');
      this.dom.startSelect = document.getElementById('pmStartSelect');
      this.dom.endSelect = document.getElementById('pmEndSelect');
      this.dom.swapBtn = document.getElementById('pmSwapBtn');
      this.dom.modeBtns = Array.from(this.dom.overlay.querySelectorAll('.pm-mode-btn'));
      this.dom.routeBtn = document.getElementById('pmRouteBtn');
      this.dom.simToggleBtn = document.getElementById('pmSimToggleBtn');
      this.dom.clearBtn = document.getElementById('pmClearBtn');
      this.dom.routeLog = document.getElementById('pmRouteLog');
      this.dom.routeFloorChips = document.getElementById('pmRouteFloorChips');
      this.dom.floorTransitionBar = document.getElementById('pmFloorTransitionBar');
      this.dom.floorTransitionMsg = document.getElementById('pmFloorTransitionMsg');
      this.dom.floorTransitionConfirmBtn = document.getElementById('pmFloorTransitionConfirmBtn');

      // 층 선택 및 요약
      this.dom.floorPills = document.getElementById('pmFloorPills');
      this.dom.floorSummary = document.getElementById('pmFloorSummary');

      // SVG 캔버스 & 줌 컨트롤
      this.dom.canvasWrap = document.getElementById('pmCanvasWrap');
      this.dom.svgStage = document.getElementById('pmSvgStage');
      this.dom.svgHost = document.getElementById('pmSvgHost');
      this.dom.loadingState = document.getElementById('pmLoadingState');
      this.dom.zoomInBtn = document.getElementById('pmZoomInBtn');
      this.dom.zoomOutBtn = document.getElementById('pmZoomOutBtn');
      this.dom.zoomResetBtn = document.getElementById('pmZoomResetBtn');

      // 표시 옵션 & 실시간 GPS 오차 보정 확인 배너
      this.dom.gpsLocateBtn = document.getElementById('pmGpsLocateBtn');
      this.dom.gpsConfirmBanner = document.getElementById('pmGpsConfirmBanner');
      this.dom.gpsConfirmStep1 = document.getElementById('pmGpsConfirmStep1');
      this.dom.gpsConfirmQuestion = document.getElementById('pmGpsConfirmQuestion');
      this.dom.gpsConfirmYesBtn = document.getElementById('pmGpsConfirmYesBtn');
      this.dom.gpsConfirmNoBtn = document.getElementById('pmGpsConfirmNoBtn');
      this.dom.gpsConfirmStep2 = document.getElementById('pmGpsConfirmStep2');
      this.dom.gpsConfirmCloseBtn = document.getElementById('pmGpsConfirmCloseBtn');
      this.dom.gpsNearbyList = document.getElementById('pmGpsNearbyList');
      this.dom.chkLabels = document.getElementById('pmChkLabels');
      this.dom.chkGraph = document.getElementById('pmChkGraph');

      // 하단/사이드 공간 검색 & 참고도 드로어
      this.dom.drawer = document.getElementById('pmDrawer');
      this.dom.drawerToggleBtn = document.getElementById('pmDrawerToggleBtn');
      this.dom.drawerToggleLabel = document.getElementById('pmDrawerToggleLabel');
      this.dom.tabSectorsBtn = document.getElementById('pmTabSectorsBtn');
      this.dom.tabRefsBtn = document.getElementById('pmTabRefsBtn');
      this.dom.refsCountBadge = document.getElementById('pmRefsCountBadge');
      this.dom.sectorsPane = document.getElementById('pmSectorsPane');
      this.dom.refsPane = document.getElementById('pmRefsPane');
      this.dom.sectorSearch = document.getElementById('pmSectorSearch');
      this.dom.scopeFloorBtn = document.getElementById('pmScopeFloorBtn');
      this.dom.scopeAllBtn = document.getElementById('pmScopeAllBtn');
      this.dom.sectorList = document.getElementById('pmSectorList');
      this.dom.refsGrid = document.getElementById('pmRefsGrid');

      // 참고도 이미지 라이트박스
      this.dom.refLightbox = document.getElementById('pmRefLightbox');
      this.dom.refLightboxImg = document.getElementById('pmRefLightboxImg');
      this.dom.refLightboxCaption = document.getElementById('pmRefLightboxCaption');
      this.dom.refLightboxClose = document.getElementById('pmRefLightboxClose');
    }

    bindEvents() {
      if (!this.dom.overlay) return;

      if (this.dom.backBtn) {
        this.dom.backBtn.addEventListener('click', () => this.close());
      }

      if (this.dom.buildingSelect) {
        this.dom.buildingSelect.addEventListener('change', () => {
          this.selectBuilding(this.dom.buildingSelect.value);
        });
      }

      if (this.dom.itLegacySwitchBtn) {
        this.dom.itLegacySwitchBtn.addEventListener('click', () => {
          this.switchToOriginalFloorplan();
        });
      }

      if (this.dom.simToggleBtn) {
        this.dom.simToggleBtn.addEventListener('click', () => {
          if (!this.isUsingSharedEngine()) return;
          const isRunning =
            this.nav.isSimulating || this.nav.simPhase === 'waiting_floor_change';
          if (isRunning) {
            this.nav.stopIndoorSimulation();
          } else {
            this.nav.startIndoorSimulation();
          }
          this.syncFromSharedEngine({ autoFollowFloor: true });
        });
      }

      if (this.dom.floorTransitionConfirmBtn) {
        this.dom.floorTransitionConfirmBtn.addEventListener('click', () => {
          if (this.isUsingSharedEngine()) {
            this.nav.completeVerticalFloorTransition();
            this.syncFromSharedEngine({ autoFollowFloor: true });
          }
        });
      }

      if (this.dom.outdoorRouteBtn) {
        this.dom.outdoorRouteBtn.addEventListener('click', () => {
          const panelId = this.curData ? this.curData.buildingId : this.dom.buildingSelect?.value;
          const campusId = PanelMapIndoorController.resolveCampusBuildingId(panelId);
          this.close({ silent: true });
          if (typeof this.onRequestOutdoorRoute === 'function' && campusId) {
            this.onRequestOutdoorRoute(campusId);
          }
        });
      }

      if (this.dom.routeToggleBtn && this.dom.routePanel) {
        this.dom.routeToggleBtn.addEventListener('click', () => {
          const collapsed = this.dom.routePanel.classList.toggle('collapsed');
          this.dom.routeToggleBtn.setAttribute('aria-expanded', String(!collapsed));
        });
      }

      if (this.dom.startSelect) {
        this.dom.startSelect.addEventListener('change', () => {
          this.startId = this.dom.startSelect.value || null;
          if (this.isUsingSharedEngine() && this.startId) {
            this.applySharedEngineOriginSector(this.startId);
            return;
          }
          if (this.startId && this.endId) {
            this.runRoute();
          } else {
            this.curRoute = null;
            this.jumpToSectorFloor(this.startId);
            this.renderFloor();
          }
        });
      }

      if (this.dom.endSelect) {
        this.dom.endSelect.addEventListener('change', () => {
          this.endId = this.dom.endSelect.value || null;
          if (this.isUsingSharedEngine() && this.endId) {
            this.applySharedEngineDestSector(this.endId);
            return;
          }
          if (this.startId && this.endId) {
            this.runRoute();
          } else {
            this.curRoute = null;
            this.jumpToSectorFloor(this.endId);
            this.renderFloor();
          }
        });
      }

      if (this.dom.swapBtn) {
        this.dom.swapBtn.addEventListener('click', () => {
          const tmp = this.startId;
          this.startId = this.endId;
          this.endId = tmp;
          if (this.dom.startSelect) this.dom.startSelect.value = this.startId || '';
          if (this.dom.endSelect) this.dom.endSelect.value = this.endId || '';
          if (this.isUsingSharedEngine() && this.startId && this.endId) {
            this.applySharedEngineOriginSector(this.startId, { silent: true });
            this.applySharedEngineDestSector(this.endId);
            return;
          }
          if (this.startId && this.endId) {
            this.runRoute();
          } else {
            this.renderFloor();
          }
        });
      }

      this.dom.modeBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          this.routeMode = btn.dataset.mode || 'any';
          this.dom.modeBtns.forEach((b) => b.classList.toggle('active', b === btn));
          if (this.isUsingSharedEngine()) {
            const targetMode = this.routeMode === 'stairs' ? 'stairs' : 'elevator';
            this.nav.selectRouteMode(targetMode, { speak: true });
            this.syncFromSharedEngine({ autoFollowFloor: false });
            return;
          }
          if (this.startId && this.endId) {
            this.runRoute();
          }
        });
      });

      if (this.dom.routeBtn) {
        this.dom.routeBtn.addEventListener('click', () => this.runRoute());
      }

      if (this.dom.clearBtn) {
        this.dom.clearBtn.addEventListener('click', () => this.clearSelection());
      }

      if (this.dom.chkLabels) {
        this.dom.chkLabels.addEventListener('change', () => this.renderFloor());
      }
      if (this.dom.chkGraph) {
        this.dom.chkGraph.addEventListener('change', () => this.renderFloor());
      }

      // 실시간 실내 GPS 위치 인식 & 2단계 오차 보정 버튼 (IT대학은 단일 엔진 IndoorNavigator 직접 위임)
      if (this.dom.gpsLocateBtn) {
        this.dom.gpsLocateBtn.addEventListener('click', () => {
          this.liveGpsEnabled = true;
          this.dom.gpsLocateBtn.classList.add('active');
          if (this.isUsingSharedEngine()) {
            const rawGps = this.nav.getLatestGpsSample();
            if (rawGps && Number.isFinite(rawGps.lat)) {
              this.nav.selectFloorAndAutoMatchRoom(this.curFloor || '3F', { showConfirm: true, rawGps });
            } else {
              this.nav.requestFreshGpsAndMatch(this.curFloor || '3F');
            }
            return;
          }
          this.locateOnCurrentFloorWithGps({ showConfirm: true });
        });
      }
      if (this.dom.gpsConfirmYesBtn) {
        this.dom.gpsConfirmYesBtn.addEventListener('click', () => {
          if (this.isUsingSharedEngine()) {
            this.nav.confirmDetectedRoomYes();
            return;
          }
          this.handlePmConfirmYes();
        });
      }
      if (this.dom.gpsConfirmNoBtn) {
        this.dom.gpsConfirmNoBtn.addEventListener('click', () => {
          if (this.isUsingSharedEngine()) {
            this.nav.openNearbyCalibrationStep2();
            return;
          }
          this.showPmConfirmStep2();
        });
      }
      if (this.dom.gpsConfirmCloseBtn) {
        this.dom.gpsConfirmCloseBtn.addEventListener('click', () => {
          if (this.isUsingSharedEngine()) {
            this.nav.dismissGpsConfirm();
            return;
          }
          this.hidePmConfirmBanner();
        });
      }

      // 드로어 탭 및 검색
      if (this.dom.drawerToggleBtn) {
        this.dom.drawerToggleBtn.addEventListener('click', () => {
          this.setDrawerCollapsed(!this.drawerCollapsed);
        });
      }
      if (this.dom.tabSectorsBtn) {
        this.dom.tabSectorsBtn.addEventListener('click', () => {
          this.setDrawerTab('sectors');
          this.setDrawerCollapsed(false);
        });
      }
      if (this.dom.tabRefsBtn) {
        this.dom.tabRefsBtn.addEventListener('click', () => {
          this.setDrawerTab('refs');
          this.setDrawerCollapsed(false);
        });
      }
      if (this.dom.sectorSearch) {
        this.dom.sectorSearch.addEventListener('input', () => {
          const q = this.dom.sectorSearch.value.trim();
          if (q.length >= 2 && this.searchScope === 'floor') {
            this.searchScope = 'all';
            this.updateScopeButtons();
          }
          this.renderSectorList();
        });
      }
      if (this.dom.scopeFloorBtn) {
        this.dom.scopeFloorBtn.addEventListener('click', () => {
          this.searchScope = 'floor';
          this.updateScopeButtons();
          this.renderSectorList();
        });
      }
      if (this.dom.scopeAllBtn) {
        this.dom.scopeAllBtn.addEventListener('click', () => {
          this.searchScope = 'all';
          this.updateScopeButtons();
          this.renderSectorList();
        });
      }

      // 라이트박스 닫기
      if (this.dom.refLightboxClose) {
        this.dom.refLightboxClose.addEventListener('click', () => this.closeRefLightbox());
      }
      if (this.dom.refLightbox) {
        this.dom.refLightbox.addEventListener('click', (e) => {
          if (e.target === this.dom.refLightbox) this.closeRefLightbox();
        });
      }

      // 줌/팬 컨트롤
      if (this.dom.zoomInBtn) {
        this.dom.zoomInBtn.addEventListener('click', () => this.setZoom(this.zoom * 1.25));
      }
      if (this.dom.zoomOutBtn) {
        this.dom.zoomOutBtn.addEventListener('click', () => this.setZoom(this.zoom / 1.25));
      }
      if (this.dom.zoomResetBtn) {
        this.dom.zoomResetBtn.addEventListener('click', () => this.resetViewTransform());
      }

      this.initZoomPanGestures();
    }

    initZoomPanGestures() {
      const wrap = this.dom.canvasWrap;
      if (!wrap) return;

      wrap.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.15 : 0.87;
          this.setZoom(this.zoom * factor);
        },
        { passive: false }
      );

      wrap.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        this._dragState = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          originPanX: this.panX,
          originPanY: this.panY,
          moved: false,
        };
      });

      wrap.addEventListener('pointermove', (e) => {
        if (!this._dragState || this._dragState.pointerId !== e.pointerId) return;
        const dx = e.clientX - this._dragState.startX;
        const dy = e.clientY - this._dragState.startY;
        if (Math.hypot(dx, dy) > 6) {
          this._dragState.moved = true;
          this.panX = this._dragState.originPanX + dx;
          this.panY = this._dragState.originPanY + dy;
          this.applyViewTransform();
        }
      });

      const endPointer = (e) => {
        if (this._dragState && this._dragState.pointerId === e.pointerId) {
          if (this._dragState.moved) {
            this._suppressNextClick = true;
            setTimeout(() => {
              this._suppressNextClick = false;
            }, 80);
          }
          this._dragState = null;
        }
      };

      wrap.addEventListener('pointerup', endPointer);
      wrap.addEventListener('pointercancel', endPointer);

      // 모바일 두 손가락 핀치 줌
      wrap.addEventListener(
        'touchstart',
        (e) => {
          if (e.touches.length === 2) {
            const d = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
            );
            this._pinchState = { startDist: d, startZoom: this.zoom };
            this._dragState = null;
          }
        },
        { passive: true }
      );

      wrap.addEventListener(
        'touchmove',
        (e) => {
          if (e.touches.length === 2 && this._pinchState) {
            e.preventDefault();
            const d = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
            );
            if (this._pinchState.startDist > 0) {
              this.setZoom(this._pinchState.startZoom * (d / this._pinchState.startDist));
            }
          }
        },
        { passive: false }
      );

      wrap.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) this._pinchState = null;
      });
    }

    setZoom(nextZoom) {
      this.zoom = Math.max(0.75, Math.min(4.2, nextZoom));
      if (this.zoom <= 1.01) {
        this.panX = 0;
        this.panY = 0;
      }
      this.applyViewTransform();
    }

    resetViewTransform() {
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this.applyViewTransform();
    }

    applyViewTransform() {
      if (!this.dom.svgStage) return;
      this.dom.svgStage.style.transform = `translate3d(${this.panX}px, ${this.panY}px, 0) scale(${this.zoom})`;
    }

    loadScriptData(jsRelPath, regKey) {
      const store = (global.__USW_PM_STORE__ = global.__USW_PM_STORE__ || {});
      if (store[regKey]) return Promise.resolve(store[regKey]);

      global.__USW_PM_REGISTER__ =
        global.__USW_PM_REGISTER__ ||
        function (k, v) {
          (global.__USW_PM_STORE__ = global.__USW_PM_STORE__ || {})[k] = v;
        };

      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const url = `${this.baseUrl.replace(/\/+$/, '')}/${jsRelPath}`;
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error(`스크립트 로드 시간 초과: ${jsRelPath}`));
        }, 12000);

        script.src = url;
        script.async = true;
        script.onload = () => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          const loaded = global.__USW_PM_STORE__ && global.__USW_PM_STORE__[regKey];
          if (loaded) resolve(loaded);
          else reject(new Error(`데이터 등록 확인 실패: ${regKey}`));
        };
        script.onerror = () => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          reject(new Error(`도면 데이터 파일(${jsRelPath})을 찾을 수 없습니다.`));
        };
        document.head.appendChild(script);
      });
    }

    async loadDataWithFallback(jsonRelPath, jsRelPath, regKey) {
      const isFileProto =
        typeof window !== 'undefined' &&
        window.location &&
        window.location.protocol === 'file:';

      if (isFileProto) {
        return this.loadScriptData(jsRelPath, regKey);
      }

      const jsonUrl = `${this.baseUrl.replace(/\/+$/, '')}/${jsonRelPath}`;
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 12000) : null;
        const res = await fetch(jsonUrl, controller ? { signal: controller.signal } : undefined);
        if (timer) clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (fetchErr) {
        console.warn(`[PanelMapIndoor] fetch(${jsonRelPath}) 실패, script 폴백 시도:`, fetchErr);
        return this.loadScriptData(jsRelPath, regKey);
      }
    }

    renderLoadError(message, retryCallback) {
      if (this.dom.statusText) {
        this.dom.statusText.textContent = '도면 데이터를 불러오지 못했습니다';
      }
      if (this.dom.floorSummary) {
        this.dom.floorSummary.textContent = '로드 실패';
      }
      if (!this.dom.svgHost) return;
      this.dom.svgHost.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;color:#334155;">
          <div style="font-size:32px;">🗺️</div>
          <strong style="font-size:15px;color:#0f172a;">실내 도면 데이터를 불러오지 못했습니다</strong>
          <p style="font-size:12.5px;color:#64748b;max-width:360px;line-height:1.5;">${this.escapeHtml(message || '네트워크 상태 또는 도면 데이터 경로를 확인해 주세요.')}</p>
          <button type="button" id="pmRetryLoadBtn" class="pm-btn-primary" style="padding:9px 18px;">다시 시도</button>
        </div>
      `;
      const retryBtn = this.dom.svgHost.querySelector('#pmRetryLoadBtn');
      if (retryBtn && typeof retryCallback === 'function') {
        retryBtn.addEventListener('click', retryCallback);
      }
    }

    async ensureCatalog() {
      if (this.catalog) return this.catalog;
      if (!global.SuwonBuildingMap) {
        throw new Error('SuwonBuildingMap 라이브러리가 로드되지 않았습니다.');
      }
      if (!this.catalogPromise) {
        this.catalogPromise = this.loadDataWithFallback('catalog.json', 'catalog.js', 'catalog')
          .then((cat) => {
            this.catalog = cat;
            this.populateBuildingSelect(cat);
            return cat;
          })
          .catch((err) => {
            this.catalogPromise = null;
            throw err;
          });
      }
      return this.catalogPromise;
    }

    populateBuildingSelect(cat) {
      if (!this.dom.buildingSelect || !cat || !Array.isArray(cat.buildings)) return;
      this.dom.buildingSelect.innerHTML = cat.buildings
        .map(
          (b) =>
            `<option value="${b.id}">${b.dir.slice(0, 2)}. ${b.name} (${b.floorOrder.length}개층)</option>`
        )
        .join('');
    }

    /**
     * [SSOT 무초기화 전환] 원본 도면 지도(IndoorNavigator) -> 도식화 실내지도(#panelMapOverlay)
     * - 진행 중인 시뮬레이션, 실시간 GPS 내 위치 마커, 층간 이동 대기, 남은 경로선을 절대 초기화하지 않고 그대로 이어받음!
     */
    async openFromIndoorNav() {
      if (!this.dom.overlay || !this.nav) return false;

      if (!this.nav.dualRoutes || (!this.nav.dualRoutes.elevator && !this.nav.dualRoutes.stairs)) {
        this.nav.recalculateAndRender({ resetFloorToStart: true });
      }

      this.isOpen = true;
      this.nav.isOpen = true;
      this.nav.isSchematicViewActive = true;

      if (this.nav.dom && this.nav.dom.container) {
        this.nav.dom.container.classList.add('hidden');
      }
      this.nav.hideFloorTransitionPopup();
      this.dom.overlay.classList.remove('hidden');
      this.setDrawerCollapsed(true);

      const targetFloor =
        (this.nav.userMarkerPos && this.nav.userMarkerPos.floor) ||
        this.nav.currentFloor ||
        '1F';

      // 이미 IT대학 도식화 데이터가 로드되어 있으면 0ms 즉시 동기화 렌더링!
      if (this.curData && this.curData.buildingId === 'it_college') {
        this.curFloor = targetFloor;
        if (this.dom.buildingSelect) this.dom.buildingSelect.value = 'it_college';
        this.syncFromSharedEngine({ autoFollowFloor: true });
        if (global.lucide) global.lucide.createIcons();
        return true;
      }

      this.setLoading(true);
      try {
        await this.ensureCatalog();
        if (this.dom.buildingSelect) this.dom.buildingSelect.value = 'it_college';
        await this.selectBuilding('it_college', {
          floorId: targetFloor,
          fromSharedEngine: true,
        });
        if (global.lucide) global.lucide.createIcons();
        return true;
      } catch (err) {
        console.error('[PanelMapIndoor] openFromIndoorNav failed:', err);
        this.setLoading(false);
        this.renderLoadError(err.message, () => this.openFromIndoorNav());
        return false;
      }
    }

    /**
     * [SSOT 무초기화 복귀] 도식화 실내지도(#panelMapOverlay) -> 원본 도면 지도(#indoorMapModeContainer)
     * - 시뮬레이션·GPS 내 위치 마커·층간 이동 팝업·남은 경로선 100% 유지!
     */
    switchToOriginalFloorplan() {
      this.isOpen = false;
      if (this.dom.overlay) {
        this.dom.overlay.classList.add('hidden');
      }
      this.closeRefLightbox();

      if (this.nav && this.nav.dom && this.nav.dom.container) {
        this.nav.isSchematicViewActive = false;
        this.nav.isOpen = true;
        this.nav.dom.container.classList.remove('hidden');

        if (!this.nav.dualRoutes || (!this.nav.dualRoutes.elevator && !this.nav.dualRoutes.stairs)) {
          this.nav.recalculateAndRender({ resetFloorToStart: false });
        } else {
          if (this.nav.userMarkerPos && this.nav.userMarkerPos.floor) {
            this.nav.currentFloor = this.nav.userMarkerPos.floor;
          } else if (this.curFloor) {
            this.nav.currentFloor = this.curFloor;
          }
          this.nav.renderEntranceChips();
          this.nav.renderRightFloorButtons();
          this.nav.updateBottomSheetUI();
          this.nav.renderCurrentFloorCanvas();
          this.nav.syncImageAndOverlayBounds();
        }

        if (this.nav.dom.startIndoorSimBtn) {
          this.nav.dom.startIndoorSimBtn.classList.toggle('running', this.nav.isSimulating);
        }
        if (this.nav.dom.startIndoorSimText) {
          this.nav.dom.startIndoorSimText.textContent = this.nav.isSimulating
            ? '실내 시뮬레이션 중지'
            : '실내 이동 시뮬레이션';
        }

        if (this.nav.simPhase === 'waiting_floor_change' && this.nav.pendingVerticalTransition) {
          this.nav.showFloorTransitionPopup(this.nav.pendingVerticalTransition);
        }

        this.notify('원본 도면 실내 지도 화면으로 전환했습니다. (현재 위치·경로 실시간 유지)');
        if (global.lucide) global.lucide.createIcons();
        return;
      }

      if (typeof this.onSwitchToITLegacy === 'function') {
        this.onSwitchToITLegacy();
      }
    }

    async open(options = {}) {
      if (!this.dom.overlay) return false;
      const requestedId = options.buildingId || 'it_college';
      const panelBuildingId =
        PanelMapIndoorController.resolvePanelBuildingId(requestedId) || requestedId;

      if (panelBuildingId === 'it_college' && this.nav && options.useSharedEngine !== false) {
        if (this.nav.isOpen || this.nav.isSchematicViewActive) {
          return this.openFromIndoorNav();
        }
      }

      this.isOpen = true;
      this.dom.overlay.classList.remove('hidden');
      this.setDrawerCollapsed(true);
      this.setLoading(true);

      try {
        await this.ensureCatalog();
        const exists = this.catalog.buildings.some((b) => b.id === panelBuildingId);
        const finalId = exists ? panelBuildingId : this.catalog.buildings[0].id;
        if (this.dom.buildingSelect) {
          this.dom.buildingSelect.value = finalId;
        }
        await this.selectBuilding(finalId, {
          roomQuery: options.roomQuery || null,
          floorId: options.floorId || null,
        });
        if (global.lucide) global.lucide.createIcons();
        return true;
      } catch (err) {
        console.error('[PanelMapIndoor] open failed:', err);
        this.setLoading(false);
        this.renderLoadError(err.message, () => this.open(options));
        this.notify(`도식화 실내지도를 불러오지 못했습니다: ${err.message}`);
        return false;
      }
    }

    close(options = {}) {
      if (!this.dom.overlay) return;
      const wasShared = this.isUsingSharedEngine();
      this.isOpen = false;
      this.dom.overlay.classList.add('hidden');
      this.closeRefLightbox();
      if (wasShared && this.nav && !options.skipNavClose) {
        this.nav.close();
      }
      if (!options.silent && typeof this.onClose === 'function') {
        this.onClose();
      }
    }

    async selectBuilding(bId, options = {}) {
      if (!this.catalog || !global.SuwonBuildingMap) return;
      this.curBldgMeta =
        this.catalog.buildings.find((b) => b.id === bId || b.dir === bId) || null;
      if (!this.curBldgMeta) return;
      if (this.dom.buildingSelect && this.dom.buildingSelect.value !== this.curBldgMeta.id) {
        this.dom.buildingSelect.value = this.curBldgMeta.id;
      }

      this.setLoading(true);
      try {
        this._buildingCache = this._buildingCache || {};
        let data = this._buildingCache[this.curBldgMeta.id];
        if (!data) {
          data = await this.loadDataWithFallback(
            this.curBldgMeta.dataPath,
            `${this.curBldgMeta.dir}/data.js`,
            `bldg:${this.curBldgMeta.dir}`
          );
          this._buildingCache[this.curBldgMeta.id] = data;
        }
        this.curData = data;
        this.startId = null;
        this.endId = null;
        this.curRoute = null;
        this.resetViewTransform();

        if (this.dom.itLegacySwitchBtn) {
          this.dom.itLegacySwitchBtn.classList.toggle('hidden', data.buildingId !== 'it_college');
        }
        if (this.dom.simToggleBtn) {
          this.dom.simToggleBtn.classList.toggle('hidden', !(this.nav && data.buildingId === 'it_college'));
        }
        if (this.nav) {
          this.nav.isSchematicViewActive = Boolean(this.isOpen && data.buildingId === 'it_college');
        }

        const fids = global.SuwonBuildingMap.getFloorIds(data);
        let initialFloor = fids.includes('1F') ? '1F' : fids[0];
        if (options.floorId && fids.includes(String(options.floorId).toUpperCase())) {
          initialFloor = String(options.floorId).toUpperCase();
        }

        // [SSOT] IT대학인 경우 IndoorNavigator 단일 엔진의 현재 경로·시뮬레이션·GPS 상태를 즉시 동기화
        if (this.nav && data.buildingId === 'it_college') {
          if (!this.nav.dualRoutes || (!this.nav.dualRoutes.elevator && !this.nav.dualRoutes.stairs)) {
            this.nav.recalculateAndRender({ resetFloorToStart: true });
          }
          if (options.roomQuery && !options.fromSharedEngine) {
            const normQ = String(options.roomQuery).replace(/호$/, '').trim();
            const navMatch = Object.values(this.nav.data.nodes).find(
              (n) => n.type === 'classroom' && String(n.roomNumber || '').replace(/호$/, '') === normQ
            );
            if (navMatch) {
              this.nav.setDestinationRoom(navMatch.id, { speak: false, resetFloorToStart: false });
            }
          }
          this.curFloor =
            (options.fromSharedEngine && this.nav.userMarkerPos && this.nav.userMarkerPos.floor) ||
            (options.floorId && fids.includes(String(options.floorId).toUpperCase()) ? String(options.floorId).toUpperCase() : null) ||
            (this.nav.userMarkerPos && this.nav.userMarkerPos.floor) ||
            this.nav.currentFloor ||
            initialFloor;
          this.renderFloorPills(fids);
          this.populateSectorDropdowns();
          this.renderReferences();

          // 이미 건물 내부에 있는 실시간 GPS가 수신되어 있으면 열자마자 즉시 내 위치 마커 표시
          const initialRawGps = this.nav.getLatestGpsSample();
          if (initialRawGps && Number.isFinite(initialRawGps.lat) && !this.nav.isSimulating) {
            this.nav.updateUserGpsPosition(initialRawGps.lat, initialRawGps.lng);
          }

          this.syncFromSharedEngine({ autoFollowFloor: Boolean(options.fromSharedEngine) });
          return;
        }

        // 검색으로 들어온 특정 호실이 있으면 해당 섹터를 자동 탐색·강조
        // (options.floorId가 명시된 경우 타 층의 '13F 공간 201' 같은 임의 이름 오매칭 방지)
        let matchedTarget = null;
        if (options.roomQuery) {
          const normQ = String(options.roomQuery).toLowerCase().replace(/\s+/g, '').replace(/호$/, '');
          const desiredFloor = options.floorId ? String(options.floorId).toUpperCase() : null;
          const allSectors = global.SuwonBuildingMap.listSectors(data, null, { excludeVoids: true });

          // 1순위: 정확한 roomNumber 매칭 (요청 층 우선)
          matchedTarget =
            allSectors.find(
              (s) =>
                (!desiredFloor || s.floor === desiredFloor) &&
                s.roomNumber &&
                String(s.roomNumber).toLowerCase().replace(/\s+/g, '').replace(/호$/, '') === normQ
            ) ||
            allSectors.find(
              (s) =>
                s.roomNumber &&
                String(s.roomNumber).toLowerCase().replace(/\s+/g, '').replace(/호$/, '') === normQ
            ) ||
            null;

          // 2순위: 요청 층 내부 이름 매칭 (타 층의 '공간 NNN' 오매칭 차단)
          if (!matchedTarget && desiredFloor) {
            const floorSectors = global.SuwonBuildingMap.listSectors(data, desiredFloor, { excludeVoids: true });
            matchedTarget =
              floorSectors.find((s) => {
                const hay = `${s.name || ''} ${s.shortLabel || ''}`.toLowerCase().replace(/\s+/g, '');
                return hay.includes(normQ) && !hay.includes('공간' + normQ);
              }) || null;
          } else if (!matchedTarget && !desiredFloor) {
            matchedTarget = global.SuwonBuildingMap.findSector(data, options.roomQuery);
          }

          if (matchedTarget) {
            this.endId = matchedTarget.id;
            initialFloor = matchedTarget.floor;
          }
        }

        this.curFloor = initialFloor;
        this.renderFloorPills(fids);
        this.populateSectorDropdowns();
        this.renderReferences();
        this.updateRouteLogDefault(matchedTarget);
        this.renderFloor();

        // 타 건물(22개동)도 이미 건물 내부 실시간 GPS가 수신되어 있으면 열자마자 즉시 내 위치 마커 표시
        const cachedGps = this.getLatestRawGps();
        if (cachedGps && Number.isFinite(cachedGps.lat) && Number.isFinite(cachedGps.lng)) {
          this.updateLiveGpsPosition(cachedGps.lat, cachedGps.lng);
        }

        if (matchedTarget) {
          this.notify(`📍 [${matchedTarget.floor}] ${matchedTarget.name || matchedTarget.roomNumber} 위치를 도면에서 강조했습니다.`);
        }
      } catch (err) {
        console.error('[PanelMapIndoor] selectBuilding error:', err);
        this.renderLoadError(err.message, () => this.selectBuilding(bId, options));
        this.notify(`건물 도면 로드 실패: ${err.message}`);
      } finally {
        this.setLoading(false);
      }
    }

    setLoading(isLoading) {
      if (this.dom.loadingState) {
        this.dom.loadingState.classList.toggle('hidden', !isLoading);
      }
    }

    renderFloorPills(fids) {
      if (!this.dom.floorPills) return;
      this.dom.floorPills.innerHTML = '';
      // 높은 층을 위/앞에 보이게 하거나 원본 floorOrder 유지 (viewer.html 동일하게 오름차순)
      fids.forEach((fid) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pm-floor-pill';
        btn.dataset.floor = fid;
        btn.innerHTML = `<span class="pm-fp-label">${fid}</span><span class="pm-fp-tag"></span>`;
        btn.addEventListener('click', () => {
          this.curFloor = fid;
          this.resetViewTransform();
          if (this.isUsingSharedEngine()) {
            this.nav.currentFloor = fid;
            this.renderFloor();
            // IT대학 도식화 지도에서 층 선택 시: 시뮬레이션 중이 아니면 GPS 자동 호실 판별 + 2단계 확인 실행!
            if (!this.nav.isSimulating && (this.liveGpsEnabled || this.nav.isRealGpsNavigating || this.nav.getLatestGpsSample())) {
              this.nav.selectFloorAndAutoMatchRoom(fid, { showConfirm: true });
            }
            return;
          }
          this.renderFloor();
          if (this.liveGpsEnabled) {
            this.locateOnCurrentFloorWithGps({ showConfirm: true });
          }
        });
        this.dom.floorPills.appendChild(btn);
      });
    }

    updateFloorPillBadges() {
      if (!this.dom.floorPills || !this.curData) return;
      const startSec = this.startId
        ? global.SuwonBuildingMap.findSector(this.curData, this.startId)
        : null;
      const endSec = this.endId
        ? global.SuwonBuildingMap.findSector(this.curData, this.endId)
        : null;

      this.dom.floorPills.querySelectorAll('.pm-floor-pill').forEach((pill) => {
        const fid = pill.dataset.floor;
        pill.classList.toggle('active', fid === this.curFloor);
        const tagEl = pill.querySelector('.pm-fp-tag');
        if (!tagEl) return;
        const isStartFl = startSec && startSec.floor === fid;
        const isEndFl = endSec && endSec.floor === fid;
        const isRouteFl =
          this.curRoute &&
          this.curRoute.ok &&
          Array.isArray(this.curRoute.floors) &&
          this.curRoute.floors.includes(fid);

        pill.classList.toggle('in-route', Boolean(isRouteFl));
        if (isStartFl && isEndFl) {
          tagEl.textContent = '출·도착';
          tagEl.className = 'pm-fp-tag both';
        } else if (isStartFl) {
          tagEl.textContent = '출발';
          tagEl.className = 'pm-fp-tag start';
        } else if (isEndFl) {
          tagEl.textContent = '도착';
          tagEl.className = 'pm-fp-tag end';
        } else {
          tagEl.textContent = '';
          tagEl.className = 'pm-fp-tag';
        }
      });
    }

    populateSectorDropdowns() {
      if (!this.curData || !this.dom.startSelect || !this.dom.endSelect) return;
      const secs = global.SuwonBuildingMap.listSectors(this.curData, null, { excludeVoids: true });
      const opts = [];
      for (let i = 0; i < secs.length; i++) {
        const s = secs[i];
        if (s.type === 'stairs' || s.type === 'elevator') continue;
        const namePart = s.name || s.roomNumber || s.id;
        opts.push(`<option value="${s.id}">[${s.floor}] ${this.escapeHtml(namePart)}</option>`);
      }
      const html = opts.join('');
      this.dom.startSelect.innerHTML = `<option value="">출발 공간 선택...</option>${html}`;
      this.dom.endSelect.innerHTML = `<option value="">도착 공간 선택...</option>${html}`;
      this.dom.startSelect.value = this.startId || '';
      this.dom.endSelect.value = this.endId || '';
    }

    renderFloor() {
      if (!this.curData || !this.curFloor || !this.dom.svgHost) return;
      const fl = global.SuwonBuildingMap.getFloor(this.curData, this.curFloor);
      if (!fl) return;

      if (this.dom.floorSummary) {
        this.dom.floorSummary.textContent = fl.summary || fl.label || this.curFloor;
      }
      if (this.dom.statusText) {
        this.dom.statusText.textContent = `${this.curData.name} · ${this.curFloor} (독립 섹터 ${fl.sectors.length}개)`;
      }

      this.updateFloorPillBadges();

      const svgEl = global.SuwonBuildingMap.render(this.dom.svgHost, this.curData, this.curFloor, {
        startSectorId: this.startId,
        endSectorId: this.endId,
        showRoomLabels: Boolean(this.dom.chkLabels && this.dom.chkLabels.checked),
        showCorridorGraph: Boolean(this.dom.chkGraph && this.dom.chkGraph.checked),
        route: this.isUsingSharedEngine() ? null : this.curRoute,
        onSectorClick: (sec) => {
          if (this._suppressNextClick) return;
          this.handleSectorPick(sec);
        },
      });

      if (this.isUsingSharedEngine()) {
        this.drawSharedEngineRouteOverlay(svgEl);
      }
      this.drawLiveGpsOverlayOnSvg(svgEl);
      this.renderSectorList();
    }

    /**
     * [SSOT] IndoorNavigator 0~100% 좌표계 -> IT대학 도식화 SVG viewBox(1140x930) 1:1 변환
     */
    navXYToPanelSvg(xPct, yPct, floorId) {
      const fl = this.curData
        ? global.SuwonBuildingMap.getFloor(this.curData, floorId || this.curFloor)
        : null;
      const vw = (fl && fl.viewBox && fl.viewBox[2]) || 1140;
      const vh = (fl && fl.viewBox && fl.viewBox[3]) || 930;
      return {
        x: (Number(xPct) / 100) * vw,
        y: (Number(yPct) / 100) * vh,
      };
    }

    resolvePanelSectorForNavNode(navNode) {
      if (!navNode || !this.curData) return null;
      const byId = global.SuwonBuildingMap.findSector(this.curData, navNode.id);
      if (byId) return byId;

      if (navNode.roomNumber) {
        const norm = String(navNode.roomNumber).replace(/호$/, '').trim();
        const floorSecs = global.SuwonBuildingMap.listSectors(this.curData, navNode.floor, {
          excludeVoids: true,
        });
        const matched = floorSecs.find(
          (s) => s.roomNumber && String(s.roomNumber).replace(/호$/, '').trim() === norm
        );
        if (matched) return matched;
      }

      const pt = this.navXYToPanelSvg(navNode.x, navNode.y, navNode.floor);
      const floorSecs = global.SuwonBuildingMap.listSectors(this.curData, navNode.floor, {
        excludeVoids: true,
      });
      let best = null;
      let bestDist = Infinity;
      floorSecs.forEach((s) => {
        if (!s.center) return;
        const d = Math.hypot(s.center[0] - pt.x, s.center[1] - pt.y);
        if (d < bestDist) {
          bestDist = d;
          best = s;
        }
      });
      return bestDist < 110 ? best : null;
    }

    resolveNavNodeIdForPanelSector(sec) {
      if (!sec || !this.nav || !this.nav.data) return null;
      if (this.nav.data.nodes[sec.id]) return sec.id;

      if (sec.roomNumber) {
        const norm = String(sec.roomNumber).replace(/호$/, '').trim();
        const byNum = Object.values(this.nav.data.nodes).find(
          (n) =>
            n.floor === sec.floor &&
            n.roomNumber &&
            String(n.roomNumber).replace(/호$/, '').trim() === norm
        );
        if (byNum) return byNum.id;
      }

      // 좌표 기반 최인접 호실/출입구 매칭
      const fl = global.SuwonBuildingMap.getFloor(this.curData, sec.floor);
      const vw = (fl && fl.viewBox && fl.viewBox[2]) || 1140;
      const vh = (fl && fl.viewBox && fl.viewBox[3]) || 930;
      const xPct = (sec.center[0] / vw) * 100;
      const yPct = (sec.center[1] / vh) * 100;

      if (sec.type === 'entrance') {
        let bestEnt = null;
        let bestD = Infinity;
        (this.nav.data.entrances || []).forEach((ent) => {
          const n = this.nav.data.nodes[ent.nodeId];
          if (!n || n.floor !== sec.floor) return;
          const d = Math.hypot(n.x - xPct, n.y - yPct);
          if (d < bestD) {
            bestD = d;
            bestEnt = ent;
          }
        });
        if (bestEnt) return bestEnt.nodeId;
      }

      const candidates = Object.values(this.nav.data.nodes).filter(
        (n) => n.floor === sec.floor && n.type === 'classroom'
      );
      let bestNode = null;
      let minD = Infinity;
      candidates.forEach((n) => {
        const d = Math.hypot(n.x - xPct, n.y - yPct);
        if (d < minD) {
          minD = d;
          bestNode = n;
        }
      });
      return bestNode ? bestNode.id : null;
    }

    applySharedEngineOriginSector(sectorId, options = {}) {
      if (!this.isUsingSharedEngine()) return;
      const sec = global.SuwonBuildingMap.findSector(this.curData, sectorId);
      const navId = this.resolveNavNodeIdForPanelSector(sec);
      if (!navId) return;
      this.nav.stopIndoorSimulation();
      if (navId.startsWith('ent_')) {
        this.nav.directionMode = 'enter';
        this.nav.customOriginNodeId = null;
        this.nav.selectEntrance(navId, { speak: !options.silent });
      } else {
        this.nav.directionMode = 'indoor';
        this.nav.setOriginRoom(navId, { speak: !options.silent });
      }
      this.syncFromSharedEngine({ autoFollowFloor: true });
    }

    applySharedEngineDestSector(sectorId, options = {}) {
      if (!this.isUsingSharedEngine()) return;
      const sec = global.SuwonBuildingMap.findSector(this.curData, sectorId);
      const navId = this.resolveNavNodeIdForPanelSector(sec);
      if (!navId) return;
      this.nav.stopIndoorSimulation();
      if (navId.startsWith('ent_')) {
        this.nav.directionMode = 'exit';
        this.nav.selectEntrance(navId, { speak: !options.silent });
      } else {
        if (this.nav.directionMode === 'exit') this.nav.directionMode = 'indoor';
        this.nav.setDestinationRoom(navId, { speak: !options.silent, resetFloorToStart: false });
      }
      this.syncFromSharedEngine({ autoFollowFloor: false });
    }

    /**
     * [SSOT] 단일 엔진(IndoorNavigator)의 전체 상태를 도식화 지도 UI에 1:1 반영
     */
    syncFromSharedEngine(options = {}) {
      if (!this.isUsingSharedEngine()) return;
      const activeRoute = this.nav.getActiveRoute();

      if (activeRoute) {
        const startSec = this.resolvePanelSectorForNavNode(activeRoute.startNode);
        const endSec = this.resolvePanelSectorForNavNode(activeRoute.endNode);
        this.startId = startSec ? startSec.id : null;
        this.endId = endSec ? endSec.id : null;
        if (this.dom.startSelect && this.startId) this.dom.startSelect.value = this.startId;
        if (this.dom.endSelect && this.endId) this.dom.endSelect.value = this.endId;

        this.routeMode = this.nav.activeRouteMode === 'stairs' ? 'stairs' : 'elevator';
        this.dom.modeBtns.forEach((b) => {
          b.classList.toggle('active', b.dataset.mode === this.routeMode);
        });

        const floors = Array.from(
          new Set((activeRoute.floorSegments || []).map((s) => s.floor))
        );
        this.curRoute = { ok: true, floors };

        if (options.autoFollowFloor) {
          const followFloor =
            (this.nav.userMarkerPos && this.nav.userMarkerPos.floor) ||
            (activeRoute.startNode && activeRoute.startNode.floor) ||
            this.curFloor;
          if (followFloor && followFloor !== this.curFloor) {
            this.curFloor = followFloor;
          }
        }

        if (this.dom.routeLog) {
          const sLabel = `${activeRoute.startNode.floor} ${activeRoute.startNode.roomNumber || activeRoute.startNode.name}`;
          const eLabel = `${activeRoute.endNode.floor} ${activeRoute.endNode.roomNumber || activeRoute.endNode.name}`;
          const modeKo = this.nav.activeRouteMode === 'stairs' ? '계단 우선' : '엘리베이터 우선';
          const statusPrefix = this.nav.isSimulating ? '🚶 이동 중 · ' : '';
          this.dom.routeLog.textContent = `${statusPrefix}${sLabel} → ${eLabel} (약 ${activeRoute.estimatedMinutes}분 · ${activeRoute.totalDistanceMeters}m · ${modeKo})`;
        }

        this.renderRouteFloorChips({ ok: true, floors });
      }

      if (this.dom.gpsLocateBtn) {
        this.dom.gpsLocateBtn.classList.toggle(
          'active',
          Boolean(this.nav.isRealGpsNavigating || this.liveGpsEnabled)
        );
      }

      this.syncSharedSimAndTransitionUI();
      this.renderSharedGpsConfirmBanner();
      this.renderFloor();
    }

    /**
     * [SSOT 60fps 틱] 시뮬레이션/GPS 이동 시 SVG 전체를 재생성하지 않고 경로선과 '내 위치' 레이어만 경량 갱신
     */
    onSharedEngineTick(meta) {
      const now = Date.now();
      const isImmediate = Boolean(meta && meta.immediate);
      if (!isImmediate && now - this._lastTickRenderAt < 40) return;
      this._lastTickRenderAt = now;

      const pos = this.nav.userMarkerPos;
      if (pos && pos.floor && pos.floor !== this.curFloor && this.nav.isSimulating) {
        this.curFloor = pos.floor;
        this.syncFromSharedEngine({ autoFollowFloor: false });
        return;
      }

      const svgEl = this.dom.svgHost ? this.dom.svgHost.querySelector('svg') : null;
      if (svgEl) {
        this.drawSharedEngineRouteOverlay(svgEl);
        this.drawLiveGpsOverlayOnSvg(svgEl);
      }
      this.syncSharedSimAndTransitionUI();
    }

    syncSharedSimAndTransitionUI() {
      if (!this.isUsingSharedEngine()) {
        if (this.dom.floorTransitionBar) this.dom.floorTransitionBar.classList.add('hidden');
        return;
      }

      const isRunning = Boolean(
        this.nav.isSimulating || this.nav.simPhase === 'waiting_floor_change'
      );
      if (this.dom.simToggleBtn) {
        this.dom.simToggleBtn.classList.remove('hidden');
        this.dom.simToggleBtn.classList.toggle('running', isRunning);
        this.dom.simToggleBtn.textContent = isRunning ? '■ 길안내 중지' : '▶ 길안내 시작';
      }

      if (this.dom.floorTransitionBar) {
        const vt = this.nav.pendingVerticalTransition;
        if (this.nav.simPhase === 'waiting_floor_change' && vt) {
          if (this.dom.floorTransitionMsg) {
            this.dom.floorTransitionMsg.textContent = vt.ttsPrompt;
          }
          if (this.dom.floorTransitionConfirmBtn) {
            this.dom.floorTransitionConfirmBtn.textContent =
              vt.buttonLabel || `${vt.toFloor.replace('F', '층')} 이동 완료`;
          }
          this.dom.floorTransitionBar.classList.remove('hidden');
        } else {
          this.dom.floorTransitionBar.classList.add('hidden');
        }
      }
    }

    /**
     * [SSOT] 단일 엔진(IndoorNavigator)의 2단계 GPS 오차 보정 상태를 #pmGpsConfirmBanner에 렌더링
     */
    renderSharedGpsConfirmBanner() {
      if (!this.dom.gpsConfirmBanner || !this.nav) return;
      const st = this.nav.gpsConfirmState || { stage: 0, room: null, nearbyRooms: [] };
      if (!st.stage || st.stage === 0 || !st.room) {
        this.dom.gpsConfirmBanner.classList.add('hidden');
        return;
      }

      const bld = this.nav.data.buildingName || 'IT대학';
      const floorKo = String(st.room.floor || this.curFloor || '3F').replace('F', '층');
      const roomLabel = st.room.roomNumber || st.room.name;

      this.dom.gpsConfirmBanner.classList.remove('hidden');

      if (st.stage === 1) {
        if (this.dom.gpsConfirmQuestion) {
          this.dom.gpsConfirmQuestion.textContent = `📍 현재 위치가 [${bld} ${floorKo} ${roomLabel}]가 맞나요?`;
        }
        if (this.dom.gpsConfirmStep1) this.dom.gpsConfirmStep1.classList.remove('hidden');
        if (this.dom.gpsConfirmStep2) this.dom.gpsConfirmStep2.classList.add('hidden');
        return;
      }

      if (st.stage === 2 && this.dom.gpsNearbyList) {
        if (this.dom.gpsConfirmStep1) this.dom.gpsConfirmStep1.classList.add('hidden');
        if (this.dom.gpsConfirmStep2) this.dom.gpsConfirmStep2.classList.remove('hidden');

        this.dom.gpsNearbyList.innerHTML = '';
        (st.nearbyRooms || []).forEach((room) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'igc-nearby-chip';
          btn.dataset.nearbyRoomId = room.id;
          btn.textContent = room.roomNumber || room.name;
          btn.addEventListener('click', () => {
            this.nav.applyCalibratedRoomSelection(room);
          });
          this.dom.gpsNearbyList.appendChild(btn);
        });

        const outdoorBtn = document.createElement('button');
        outdoorBtn.type = 'button';
        outdoorBtn.id = 'pmGpsOutdoorBtn';
        outdoorBtn.className = 'igc-nearby-chip outdoor';
        outdoorBtn.textContent = '🌳 외부 (건물 밖)';
        outdoorBtn.addEventListener('click', () => {
          this.liveGpsEnabled = false;
          this.close({ silent: true, skipNavClose: true });
          this.nav.switchToOutdoorFromCalibration();
        });
        this.dom.gpsNearbyList.appendChild(outdoorBtn);
      }
    }

    /**
     * [SSOT] 단일 엔진(IndoorNavigator)의 현재 층 경로 + 실시간 지나온 길 트리밍을 도식화 SVG 위에 직접 렌더링
     */
    drawSharedEngineRouteOverlay(svgEl) {
      if (!svgEl || !this.isUsingSharedEngine()) return;
      const old = svgEl.querySelector('#layer-route');
      if (old && old.parentNode) old.parentNode.removeChild(old);

      const activeRoute = this.nav.getActiveRoute();
      if (!activeRoute) return;

      const SVG_NS = 'http://www.w3.org/2000/svg';
      const mk = (tag, attrs, text) => {
        const el = document.createElementNS(SVG_NS, tag);
        Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, String(attrs[k])));
        if (text !== undefined) el.textContent = text;
        return el;
      };

      const layer = mk('g', { id: 'layer-route', 'pointer-events': 'none' });
      const seg = (activeRoute.floorSegments || []).find((s) => s.floor === this.curFloor);

      if (seg && Array.isArray(seg.nodes) && seg.nodes.length >= 2) {
        const fullOrtho = this.nav.ensureOrthogonalPoints(seg.nodes);
        const isDepartureDone =
          !activeRoute.isSameFloor &&
          this.curFloor === activeRoute.startNode.floor &&
          (this.nav.simPhase === 'walking_to_room' || this.nav.simPhase === 'arrived');

        const ptsPct = isDepartureDone
          ? fullOrtho
          : this.nav.getTrimmedOrthogonalPoints(fullOrtho, true, this.curFloor);
        const ptsSvg = ptsPct.map((p) => this.navXYToPanelSvg(p.x, p.y, this.curFloor));
        const ptsAttr = ptsSvg.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

        if (isDepartureDone) {
          layer.appendChild(
            mk('polyline', {
              points: ptsAttr,
              fill: 'none',
              stroke: '#94a3b8',
              'stroke-width': 5,
              'stroke-dasharray': '10 8',
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
              opacity: 0.65,
            })
          );
        } else {
          const lineColor = this.nav.activeRouteMode === 'stairs' ? '#16a34a' : '#0068ff';
          layer.appendChild(
            mk('polyline', {
              points: ptsAttr,
              fill: 'none',
              stroke: '#ffffff',
              'stroke-width': 10,
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
              opacity: 0.94,
            })
          );
          layer.appendChild(
            mk('polyline', {
              points: ptsAttr,
              fill: 'none',
              stroke: lineColor,
              'stroke-width': 5.6,
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
            })
          );

          // 깔끔한 진행 방향 화살표 마커 (적정 간격)
          let lastArrow = null;
          for (let i = 0; i < ptsSvg.length - 1; i++) {
            const a = ptsSvg[i];
            const b = ptsSvg[i + 1];
            const segLen = Math.hypot(b.x - a.x, b.y - a.y);
            if (segLen < 42) continue;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            if (lastArrow && Math.hypot(mx - lastArrow.x, my - lastArrow.y) < 75) continue;
            lastArrow = { x: mx, y: my };
            const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
            const ag = mk('g', {
              transform: `translate(${mx.toFixed(1)},${my.toFixed(1)}) rotate(${ang.toFixed(1)})`,
            });
            ag.appendChild(mk('circle', { cx: 0, cy: 0, r: 8, fill: lineColor, stroke: '#ffffff', 'stroke-width': 1.8 }));
            ag.appendChild(mk('path', { d: 'M -2.5 -3.5 L 3.2 0 L -2.5 3.5', fill: 'none', stroke: '#ffffff', 'stroke-width': 2.1, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
            layer.appendChild(ag);
          }
        }
      }

      // 층간 수직 이동(엘리베이터/계단) 배지
      const vt = activeRoute.verticalTransition;
      if (vt && (vt.fromFloor === this.curFloor || vt.toFloor === this.curFloor)) {
        const isFrom = vt.fromFloor === this.curFloor;
        const vNode = isFrom ? vt.departureNode : vt.arrivalNode;
        if (vNode) {
          const vp = this.navXYToPanelSvg(vNode.x, vNode.y, this.curFloor);
          const bg = mk('g', { transform: `translate(${vp.x.toFixed(1)},${vp.y.toFixed(1)})` });
          const labelTxt = isFrom
            ? `${vt.transitType === 'elevator' ? 'ELV' : '계단'} → ${vt.toFloor}`
            : `${vt.fromFloor} → ${vt.toFloor}`;
          bg.appendChild(mk('rect', { x: -38, y: -26, width: 76, height: 20, rx: 7, fill: '#08386b', stroke: '#ffffff', 'stroke-width': 1.6 }));
          bg.appendChild(mk('text', { x: 0, y: -12.5, 'text-anchor': 'middle', 'font-size': 10.5, 'font-weight': 800, fill: '#ffffff', 'font-family': 'Pretendard, Noto Sans KR, sans-serif' }, labelTxt));
          layer.appendChild(bg);
        }
      }

      // 출발/도착 핀 마커
      const appendPin = (node, label, fill) => {
        if (!node || node.floor !== this.curFloor) return;
        const p = this.navXYToPanelSvg(node.x, node.y, this.curFloor);
        const pg = mk('g', { transform: `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})` });
        pg.appendChild(mk('circle', { cx: 0, cy: 0, r: 5.5, fill: '#ffffff', stroke: fill, 'stroke-width': 2.5 }));
        pg.appendChild(mk('path', { d: 'M 0 -4 C -11 -16, -14 -29, 0 -36 C 14 -29, 11 -16, 0 -4 Z', fill, stroke: '#ffffff', 'stroke-width': 1.8 }));
        pg.appendChild(mk('text', { x: 0, y: -20, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 800, fill: '#ffffff', 'font-family': 'Pretendard, Noto Sans KR, sans-serif' }, label));
        layer.appendChild(pg);
      };

      appendPin(activeRoute.startNode, '출발', '#0284c7');
      appendPin(activeRoute.endNode, '도착', '#1d4ed8');

      // live-gps 레이어 바로 아래에 삽입하여 '내 위치' 마커가 항상 최상단에 보이도록 유지
      const gpsLayer = svgEl.querySelector('#layer-live-gps');
      if (gpsLayer && gpsLayer.parentNode === svgEl) {
        svgEl.insertBefore(layer, gpsLayer);
      } else {
        svgEl.appendChild(layer);
      }
    }

    getLatestRawGps() {
      if (global.IndoorGpsEngine && global.IndoorGpsEngine.getLastRawGps()) {
        return global.IndoorGpsEngine.getLastRawGps();
      }
      if (typeof this.onGetCurrentGps === 'function') {
        const s = this.onGetCurrentGps();
        if (s && Number.isFinite(s.lat) && Number.isFinite(s.lng)) return s;
      }
      return null;
    }

    drawLiveGpsOverlayOnSvg(svgEl) {
      if (!svgEl || !this.curData) return;
      const old = svgEl.querySelector('#layer-live-gps');
      if (old && old.parentNode) old.parentNode.removeChild(old);

      let markerXY = null;
      if (this.isUsingSharedEngine()) {
        const navPos = this.nav.userMarkerPos;
        if (
          navPos &&
          navPos.floor === this.curFloor &&
          (this.nav.isSimulating ||
            this.nav.isRealGpsNavigating ||
            this.nav.simPhase === 'waiting_floor_change' ||
            this.nav.simPhase === 'arrived' ||
            this.liveGpsEnabled)
        ) {
          markerXY = this.navXYToPanelSvg(navPos.x, navPos.y, this.curFloor);
        }
      } else if (
        this.liveGpsPos &&
        this.liveGpsPos.buildingId === this.curData.buildingId &&
        this.liveGpsPos.floor === this.curFloor
      ) {
        markerXY = { x: this.liveGpsPos.x, y: this.liveGpsPos.y };
      }

      if (!markerXY) return;

      const SVG_NS = 'http://www.w3.org/2000/svg';
      const mk = (tag, attrs, text) => {
        const el = document.createElementNS(SVG_NS, tag);
        Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, String(attrs[k])));
        if (text !== undefined) el.textContent = text;
        return el;
      };

      const g = mk('g', {
        id: 'layer-live-gps',
        transform: `translate(${markerXY.x.toFixed(1)}, ${markerXY.y.toFixed(1)})`,
        'pointer-events': 'none',
      });
      g.appendChild(mk('circle', { cx: 0, cy: 0, r: 24, fill: '#0068ff', opacity: 0.22 }));
      g.appendChild(mk('circle', { cx: 0, cy: 0, r: 10.5, fill: '#0068ff', stroke: '#ffffff', 'stroke-width': 3.5 }));
      g.appendChild(mk('rect', { x: -28, y: -36, width: 56, height: 19, rx: 9.5, fill: '#0068ff', stroke: '#ffffff', 'stroke-width': 1.8 }));
      g.appendChild(mk('text', { x: 0, y: -23, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#ffffff', 'font-family': 'Pretendard, Noto Sans KR, sans-serif' }, '내 위치'));
      svgEl.appendChild(g);
    }

    /**
     * [요구사항 1] 전 건물(23개동) 도식화 SVG 위 실시간 GPS '내 위치' 마커 갱신
     */
    updateLiveGpsPosition(rawLat, rawLng) {
      if (!this.isOpen || !this.curData || !this.curFloor || !global.IndoorGpsEngine) return;
      if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) return;

      const fl = global.SuwonBuildingMap.getFloor(this.curData, this.curFloor);
      if (!fl) return;

      const mapped = global.IndoorGpsEngine.gpsToPanelSvgXY(
        this.curData.buildingId,
        fl,
        rawLat,
        rawLng
      );
      if (!mapped.isInside && !this.liveGpsEnabled) return;

      const snapped = global.IndoorGpsEngine.snapAndSmoothPanelPosition(
        this.curData.buildingId,
        fl,
        mapped.x,
        mapped.y,
        { alpha: 0.35 }
      );

      this.liveGpsEnabled = true;
      if (this.dom.gpsLocateBtn) this.dom.gpsLocateBtn.classList.add('active');
      this.liveGpsPos = {
        buildingId: this.curData.buildingId,
        floor: this.curFloor,
        x: snapped.x,
        y: snapped.y,
        snappedTo: snapped.snappedTo,
      };

      const svgEl = this.dom.svgHost ? this.dom.svgHost.querySelector('svg') : null;
      if (svgEl) this.drawLiveGpsOverlayOnSvg(svgEl);
    }

    /**
     * [요구사항 2·3] 현재 층 기준 GPS 자동 호실 판별 + 2단계 확인 배너 표시
     */
    locateOnCurrentFloorWithGps(options = {}) {
      if (!this.curData || !this.curFloor || !global.IndoorGpsEngine) return;
      const fl = global.SuwonBuildingMap.getFloor(this.curData, this.curFloor);
      if (!fl) return;

      const rawGps = options.rawGps || this.getLatestRawGps();
      const b = global.IndoorGpsEngine.getFloorShellBounds(fl);
      let rawX = (b.minX + b.maxX) / 2;
      let rawY = (b.minY + b.maxY) / 2;

      if (rawGps && Number.isFinite(rawGps.lat) && Number.isFinite(rawGps.lng)) {
        const mapped = global.IndoorGpsEngine.gpsToPanelSvgXY(
          this.curData.buildingId,
          fl,
          rawGps.lat,
          rawGps.lng
        );
        rawX = mapped.x;
        rawY = mapped.y;
      }

      const snapped = global.IndoorGpsEngine.snapAndSmoothPanelPosition(
        this.curData.buildingId,
        fl,
        rawX,
        rawY,
        { instant: true }
      );
      const nearest = global.IndoorGpsEngine.findNearestPanelSectors(fl, snapped.x, snapped.y, 5);
      if (!nearest.length) {
        this.notify('현재 층에 매칭 가능한 호실 정보가 없습니다.');
        return;
      }

      const topSector = nearest[0].sector;
      this.pendingAutoSector = topSector;
      this.pendingMappedXY = { x: snapped.x, y: snapped.y, floor: this.curFloor };

      // 판별된 호실을 즉시 출발지로 설정 (목적지가 있으면 바로 복도 경로 렌더링!)
      this.startId = topSector.id;
      if (this.dom.startSelect) this.dom.startSelect.value = topSector.id;
      this.liveGpsPos = {
        buildingId: this.curData.buildingId,
        floor: this.curFloor,
        x: topSector.center[0],
        y: topSector.center[1],
        snappedTo: 'auto',
      };

      if (this.endId && this.endId !== this.startId) {
        this.runRoute();
      } else {
        this.renderFloor();
      }

      if (options.showConfirm !== false) {
        this.showPmConfirmStep1(topSector);
      }
    }

    showPmConfirmStep1(sector) {
      if (!this.dom.gpsConfirmBanner || !sector || !this.curData) return;
      const floorKo = String(sector.floor || this.curFloor).replace('F', '층');
      const secLabel = sector.roomNumber ? `${sector.roomNumber}호` : (sector.name || sector.shortLabel || sector.id);
      if (this.dom.gpsConfirmQuestion) {
        this.dom.gpsConfirmQuestion.textContent = `📍 현재 위치가 [${this.curData.name} ${floorKo} ${secLabel}]가 맞나요?`;
      }
      if (this.dom.gpsConfirmStep1) this.dom.gpsConfirmStep1.classList.remove('hidden');
      if (this.dom.gpsConfirmStep2) this.dom.gpsConfirmStep2.classList.add('hidden');
      this.dom.gpsConfirmBanner.classList.remove('hidden');
    }

    handlePmConfirmYes() {
      const sec = this.pendingAutoSector;
      if (sec && this.curData && global.IndoorGpsEngine) {
        global.IndoorGpsEngine.setConfirmedLocation(this.curData.buildingId, {
          floorId: sec.floor,
          roomId: sec.id,
          roomNumber: sec.roomNumber || sec.shortLabel || sec.name,
          roomName: sec.name || sec.id,
        });
      }
      this.hidePmConfirmBanner();
      if (sec) {
        this.notify(`✅ 현재 위치를 [${this.curData.name} ${sec.floor} ${sec.name || sec.roomNumber}]로 확정했습니다.`);
      }
    }

    showPmConfirmStep2() {
      if (!this.dom.gpsConfirmStep2 || !this.dom.gpsNearbyList || !this.curData || !global.IndoorGpsEngine) return;
      const fl = global.SuwonBuildingMap.getFloor(this.curData, this.curFloor);
      if (!fl) return;

      const rx = this.pendingMappedXY ? this.pendingMappedXY.x : (this.pendingAutoSector ? this.pendingAutoSector.center[0] : 500);
      const ry = this.pendingMappedXY ? this.pendingMappedXY.y : (this.pendingAutoSector ? this.pendingAutoSector.center[1] : 400);
      const nearest = global.IndoorGpsEngine.findNearestPanelSectors(fl, rx, ry, 6);
      const rejectedId = this.pendingAutoSector ? this.pendingAutoSector.id : null;
      const candidates = nearest.filter((x) => x.sector.id !== rejectedId).slice(0, 4);

      this.dom.gpsNearbyList.innerHTML = '';
      candidates.forEach(({ sector }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'igc-nearby-chip';
        btn.textContent = sector.roomNumber ? `${sector.roomNumber}호` : (sector.shortLabel || sector.name || sector.id);
        btn.addEventListener('click', () => {
          const rawGps = this.getLatestRawGps();
          global.IndoorGpsEngine.calibrateToPanelSector(
            this.curData.buildingId,
            fl,
            sector,
            rawGps ? rawGps.lat : NaN,
            rawGps ? rawGps.lng : NaN
          );
          this.pendingAutoSector = sector;
          this.startId = sector.id;
          if (this.dom.startSelect) this.dom.startSelect.value = sector.id;
          this.liveGpsPos = {
            buildingId: this.curData.buildingId,
            floor: this.curFloor,
            x: sector.center[0],
            y: sector.center[1],
            snappedTo: 'calibrated',
          };
          this.hidePmConfirmBanner();
          if (this.endId && this.endId !== this.startId) {
            this.runRoute();
          } else {
            this.renderFloor();
          }
          this.notify(`📍 GPS 오차 보정 완료: [${this.curData.name} ${this.curFloor} ${sector.name || sector.roomNumber}] 기준으로 추적합니다.`);
        });
        this.dom.gpsNearbyList.appendChild(btn);
      });

      const outdoorBtn = document.createElement('button');
      outdoorBtn.type = 'button';
      outdoorBtn.className = 'igc-nearby-chip outdoor';
      outdoorBtn.textContent = '🌳 외부 (건물 밖)';
      outdoorBtn.addEventListener('click', () => {
        const campusId = PanelMapIndoorController.resolveCampusBuildingId(this.curData.buildingId);
        global.IndoorGpsEngine.clearOffset(this.curData.buildingId);
        this.liveGpsEnabled = false;
        this.liveGpsPos = null;
        this.hidePmConfirmBanner();
        this.close({ silent: true });
        if (typeof this.onSwitchToOutdoorGuidance === 'function' && campusId) {
          this.onSwitchToOutdoorGuidance(campusId);
        }
      });
      this.dom.gpsNearbyList.appendChild(outdoorBtn);

      if (this.dom.gpsConfirmStep1) this.dom.gpsConfirmStep1.classList.add('hidden');
      this.dom.gpsConfirmStep2.classList.remove('hidden');
    }

    hidePmConfirmBanner() {
      if (this.dom.gpsConfirmBanner) {
        this.dom.gpsConfirmBanner.classList.add('hidden');
      }
    }

    jumpToSectorFloor(sectorId) {
      if (!sectorId || !this.curData) return;
      const sec = global.SuwonBuildingMap.findSector(this.curData, sectorId);
      if (sec && sec.floor && sec.floor !== this.curFloor) {
        this.curFloor = sec.floor;
        this.resetViewTransform();
      }
    }

    handleSectorPick(sec) {
      if (!sec || sec.type === 'void') return;

      // [SSOT] IT대학은 클릭한 강의실을 단일 엔진(IndoorNavigator)의 목적지로 즉시 연동!
      if (this.isUsingSharedEngine()) {
        const navId = this.resolveNavNodeIdForPanelSector(sec);
        if (navId) {
          this.applySharedEngineDestSector(sec.id);
          return;
        }
      }

      // 출발지가 없거나 이미 경로가 완성된 상태에서 새 공간 클릭 -> 출발지로 재설정
      if (!this.startId || (this.startId && this.endId)) {
        this.startId = sec.id;
        this.endId = null;
        this.curRoute = null;
        if (this.dom.routeLog) {
          this.dom.routeLog.textContent = `출발 선택: [${sec.floor}] ${sec.name || sec.roomNumber || sec.id} — 도착 공간을 클릭하거나 선택하세요.`;
        }
        if (this.dom.routeFloorChips) this.dom.routeFloorChips.innerHTML = '';
        this.notify(`🔵 출발: [${sec.floor}] ${sec.name || sec.roomNumber || sec.id}`);
      } else if (this.startId === sec.id) {
        this.clearSelection();
        return;
      } else {
        this.endId = sec.id;
        if (this.dom.startSelect) this.dom.startSelect.value = this.startId || '';
        if (this.dom.endSelect) this.dom.endSelect.value = this.endId || '';
        this.runRoute();
        return;
      }

      if (this.dom.startSelect) this.dom.startSelect.value = this.startId || '';
      if (this.dom.endSelect) this.dom.endSelect.value = this.endId || '';

      if (sec.floor !== this.curFloor) {
        this.curFloor = sec.floor;
        this.resetViewTransform();
      }
      this.renderFloor();
    }

    runRoute() {
      if (!this.curData) return;
      if (this.isUsingSharedEngine()) {
        if (this.dom.startSelect && this.dom.startSelect.value) {
          this.applySharedEngineOriginSector(this.dom.startSelect.value, { silent: true });
        }
        if (this.dom.endSelect && this.dom.endSelect.value) {
          this.applySharedEngineDestSector(this.dom.endSelect.value);
        } else {
          this.syncFromSharedEngine({ autoFollowFloor: true });
        }
        return;
      }
      if (this.dom.startSelect && this.dom.startSelect.value) {
        this.startId = this.dom.startSelect.value;
      }
      if (this.dom.endSelect && this.dom.endSelect.value) {
        this.endId = this.dom.endSelect.value;
      }
      if (!this.startId || !this.endId) {
        this.notify('출발 공간과 도착 공간을 모두 선택해 주세요.');
        return;
      }

      const route = global.SuwonBuildingMap.findCorridorRoute(
        this.curData,
        this.startId,
        this.endId,
        { mode: this.routeMode }
      );
      this.curRoute = route;

      if (!route.ok) {
        if (this.dom.routeLog) {
          this.dom.routeLog.textContent = `⚠️ 경로 탐색 실패: ${route.error}`;
        }
        if (this.dom.routeFloorChips) this.dom.routeFloorChips.innerHTML = '';
        this.notify(route.error || '경로를 찾을 수 없습니다.');
      } else {
        const stepsTxt =
          route.steps && route.steps.length
            ? ` · 이동: ${route.steps.map((st) => st.label).join(', ')}`
            : ' · 동일 층 복도 이동';
        const summaryMsg = `${route.start.floor} ${route.start.name || route.start.roomNumber} → ${route.end.floor} ${route.end.name || route.end.roomNumber} (복도 거리 ${route.totalDistance}${stepsTxt})`;
        if (this.dom.routeLog) {
          this.dom.routeLog.textContent = summaryMsg;
        }
        this.renderRouteFloorChips(route);

        // 출발 층으로 자동 포커스 이동
        if (route.start && route.start.floor && route.start.floor !== this.curFloor) {
          this.curFloor = route.start.floor;
          this.resetViewTransform();
        }

        if (typeof this.onSpeak === 'function') {
          this.onSpeak(
            `${this.curData.name} ${route.start.floor} ${route.start.name || route.start.roomNumber}에서 ${route.end.floor} ${route.end.name || route.end.roomNumber}까지 복도 경로를 안내합니다.`
          );
        }
      }

      this.renderFloor();
    }

    renderRouteFloorChips(route) {
      if (!this.dom.routeFloorChips) return;
      this.dom.routeFloorChips.innerHTML = '';
      if (!route || !route.ok || !Array.isArray(route.floors) || route.floors.length <= 1) {
        return;
      }

      route.floors.forEach((fid, idx) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `pm-route-floor-chip ${fid === this.curFloor ? 'active' : ''}`;
        const role =
          idx === 0 ? '출발' : idx === route.floors.length - 1 ? '도착' : '경유';
        chip.textContent = `${fid} (${role})`;
        chip.addEventListener('click', () => {
          this.curFloor = fid;
          this.resetViewTransform();
          this.renderFloor();
          this.renderRouteFloorChips(route);
        });
        this.dom.routeFloorChips.appendChild(chip);

        if (idx < route.floors.length - 1) {
          const arrow = document.createElement('span');
          arrow.className = 'pm-route-floor-arrow';
          arrow.textContent = '→';
          this.dom.routeFloorChips.appendChild(arrow);
        }
      });
    }

    clearSelection() {
      this.startId = null;
      this.endId = null;
      this.curRoute = null;
      if (this.dom.startSelect) this.dom.startSelect.value = '';
      if (this.dom.endSelect) this.dom.endSelect.value = '';
      if (this.dom.routeFloorChips) this.dom.routeFloorChips.innerHTML = '';
      this.updateRouteLogDefault(null);
      this.renderFloor();
    }

    updateRouteLogDefault(matchedTarget) {
      if (!this.dom.routeLog) return;
      if (matchedTarget) {
        this.dom.routeLog.textContent = `목적지 [${matchedTarget.floor}] ${matchedTarget.name || matchedTarget.roomNumber} 선택됨 — 출발 공간을 클릭하면 복도 최단경로를 바로 그립니다.`;
      } else {
        this.dom.routeLog.textContent =
          '도면의 강의실/공간을 차례로 클릭하면 단독 색칠 및 복도 전용 다층 경로가 즉시 그려집니다.';
      }
    }

    renderSectorList() {
      if (!this.curData || !this.dom.sectorList) return;
      const q = (this.dom.sectorSearch ? this.dom.sectorSearch.value : '').trim().toLowerCase();
      const targetFloor = this.searchScope === 'all' ? null : this.curFloor;
      const secs = global.SuwonBuildingMap.listSectors(this.curData, targetFloor, {
        excludeVoids: true,
      });

      this.dom.sectorList.innerHTML = '';
      let rendered = 0;

      for (let i = 0; i < secs.length; i++) {
        const s = secs[i];
        const typeKo = SECTOR_TYPE_LABELS[s.type] || s.type;
        const hay = `${s.floor} ${s.roomNumber || ''} ${s.name || ''} ${s.shortLabel || ''} ${typeKo} ${s.type}`.toLowerCase();
        if (q && !hay.includes(q)) continue;

        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'pm-sector-item';
        if (s.id === this.startId) item.classList.add('is-start');
        if (s.id === this.endId) item.classList.add('is-end');

        const displayName = s.name || s.roomNumber || s.id;
        item.innerHTML = `
          <span class="pm-sec-left">
            <span class="pm-sec-floor">${this.escapeHtml(s.floor)}</span>
            <span class="pm-sec-name">${this.escapeHtml(displayName)}</span>
          </span>
          <span class="pm-sec-badge type-${s.type}">${this.escapeHtml(typeKo)}</span>
        `;
        item.addEventListener('click', () => {
          if (s.floor !== this.curFloor) {
            this.curFloor = s.floor;
            this.resetViewTransform();
          }
          this.handleSectorPick(s);
        });
        this.dom.sectorList.appendChild(item);
        rendered++;
        if (rendered >= 120) break;
      }

      if (rendered === 0) {
        this.dom.sectorList.innerHTML =
          '<div class="pm-empty-msg">일치하는 강의실이나 시설이 없습니다.</div>';
      }
    }

    renderReferences() {
      if (!this.dom.refsGrid || !this.curData || !this.curBldgMeta) return;
      const imgs = (this.curData.references || []).filter((r) => !r.endsWith('.txt'));

      if (this.dom.refsCountBadge) {
        this.dom.refsCountBadge.textContent = String(imgs.length);
      }
      if (this.dom.tabRefsBtn) {
        this.dom.tabRefsBtn.classList.toggle('hidden', imgs.length === 0);
      }
      if (imgs.length === 0 && this.drawerTab === 'refs') {
        this.setDrawerTab('sectors');
      }

      this.dom.refsGrid.innerHTML = '';
      imgs.forEach((relPath) => {
        const src = encodeURI(`${this.baseUrl}/${this.curBldgMeta.dir}/${relPath}`);
        const cleanName = relPath.split('/').pop().replace(/\.[^.]+$/, '');
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'pm-ref-card';
        card.innerHTML = `
          <img src="${src}" alt="${this.escapeHtml(cleanName)}" loading="lazy" />
          <span>${this.escapeHtml(cleanName)}</span>
        `;
        card.addEventListener('click', () => this.openRefLightbox(src, `${this.curData.name} · ${cleanName}`));
        this.dom.refsGrid.appendChild(card);
      });
    }

    openRefLightbox(src, caption) {
      if (!this.dom.refLightbox || !this.dom.refLightboxImg) {
        window.open(src, '_blank', 'noopener');
        return;
      }
      this.dom.refLightboxImg.src = src;
      if (this.dom.refLightboxCaption) {
        this.dom.refLightboxCaption.textContent = caption || '';
      }
      this.dom.refLightbox.classList.remove('hidden');
    }

    closeRefLightbox() {
      if (this.dom.refLightbox) {
        this.dom.refLightbox.classList.add('hidden');
      }
    }

    setDrawerTab(tabName) {
      this.drawerTab = tabName;
      if (this.dom.tabSectorsBtn) {
        this.dom.tabSectorsBtn.classList.toggle('active', tabName === 'sectors');
      }
      if (this.dom.tabRefsBtn) {
        this.dom.tabRefsBtn.classList.toggle('active', tabName === 'refs');
      }
      if (this.dom.sectorsPane) {
        this.dom.sectorsPane.classList.toggle('hidden', tabName !== 'sectors');
      }
      if (this.dom.refsPane) {
        this.dom.refsPane.classList.toggle('hidden', tabName !== 'refs');
      }
    }

    setDrawerCollapsed(collapsed) {
      this.drawerCollapsed = Boolean(collapsed);
      if (this.dom.drawer) {
        this.dom.drawer.classList.toggle('collapsed', this.drawerCollapsed);
      }
      if (this.dom.drawerToggleLabel) {
        this.dom.drawerToggleLabel.textContent = this.drawerCollapsed
          ? '공간 검색 · 참고도 펼치기'
          : '목록 접기';
      }
    }

    updateScopeButtons() {
      if (this.dom.scopeFloorBtn) {
        this.dom.scopeFloorBtn.classList.toggle('active', this.searchScope === 'floor');
      }
      if (this.dom.scopeAllBtn) {
        this.dom.scopeAllBtn.classList.toggle('active', this.searchScope === 'all');
      }
    }

    notify(msg) {
      if (typeof this.onShowToast === 'function') {
        this.onShowToast(msg);
      }
    }

    escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  }

  global.PanelMapIndoorController = PanelMapIndoorController;
})(window);
