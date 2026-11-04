/**
 * 수원대학교 스마트 캠퍼스 내비게이션 - 가상 이동 시뮬레이션 엔진
 * 경로를 따라 내 위치 마커를 부드럽게 이동시키며 체크포인트별 TTS 음성 안내를 순차 트리거함
 */

class RouteSimulator {
  /**
   * @param {Object} callbacks
   *  - onPositionUpdate({ lat, lng, bearing, traveledDist, remainingDist, progress, currentSegmentIndex })
   *  - onCheckpointReached(checkpoint, index)
   *  - onSimulationStart(route)
   *  - onSimulationComplete(route)
   *  - onStateChange(state) // 'idle' | 'running' | 'paused' | 'completed'
   */
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.route = null;
    this.state = 'idle'; // 'idle' | 'running' | 'paused' | 'completed'
    this.speedMultiplier = 1; // 1x, 2x, 3x
    this.baseSimSpeedMps = 34; // 책상에서 쾌적하게 테스트할 수 있도록 초당 약 34m 가상 이동 (전체 약 15~20초)
    this.traveledDist = 0;
    this.lastFrameTime = null;
    this.animFrameId = null;
    this.triggeredCheckpoints = new Set();
    this.checkpointHoldUntil = 0; // 음성 안내가 겹치지 않도록 최소 간격 보장
  }

  /**
   * 새로운 경로 로드 및 초기화
   */
  loadRoute(route) {
    this.stop();
    this.route = route;
    this.traveledDist = 0;
    this.triggeredCheckpoints.clear();
  }

  /**
   * 배속 변경 (1, 2, 3)
   */
  setSpeed(multiplier) {
    this.speedMultiplier = Number(multiplier) || 1;
  }

  /**
   * 시뮬레이션 시작 또는 재개
   */
  start(route = null) {
    if (route) {
      this.loadRoute(route);
    }
    if (!this.route || !this.route.segments || this.route.segments.length === 0) {
      return false;
    }

    if (this.state === 'completed') {
      this.traveledDist = 0;
      this.triggeredCheckpoints.clear();
    }

    const isFreshStart = this.traveledDist === 0 && this.triggeredCheckpoints.size === 0;
    this.state = 'running';
    this.lastFrameTime = performance.now();

    if (this.callbacks.onStateChange) {
      this.callbacks.onStateChange(this.state);
    }

    if (isFreshStart) {
      if (this.callbacks.onSimulationStart) {
        this.callbacks.onSimulationStart(this.route);
      }
      // 출발 체크포인트 즉시 트리거 ("IT대학 입구까지 안내를 시작합니다.")
      const startCp = this.route.checkpoints[0];
      if (startCp) {
        this.triggeredCheckpoints.add(startCp.id);
        this.checkpointHoldUntil = performance.now() + 2600;
        if (this.callbacks.onCheckpointReached) {
          this.callbacks.onCheckpointReached(startCp, 0);
        }
      }
    }

    this._tick(performance.now());
    return true;
  }

  /**
   * 일시정지
   */
  pause() {
    if (this.state !== 'running') return;
    this.state = 'paused';
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.callbacks.onStateChange) {
      this.callbacks.onStateChange(this.state);
    }
  }

  /**
   * 정지 및 초기화
   */
  stop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.state = 'idle';
    this.traveledDist = 0;
    this.triggeredCheckpoints.clear();
    if (this.callbacks.onStateChange) {
      this.callbacks.onStateChange(this.state);
    }
  }

  /**
   * 특정 체크포인트 위치로 즉시 점프 (디버깅 편의 기능)
   */
  jumpToCheckpoint(index) {
    if (!this.route || !this.route.checkpoints[index]) return;
    const cp = this.route.checkpoints[index];
    this.traveledDist = cp.cumulativeDist;

    // 이전 체크포인트들은 통과 처리
    for (let i = 0; i <= index; i++) {
      this.triggeredCheckpoints.add(this.route.checkpoints[i].id);
    }

    const pos = this._getPositionAtDistance(this.traveledDist);
    if (this.callbacks.onPositionUpdate) {
      this.callbacks.onPositionUpdate(pos);
    }
    if (this.callbacks.onCheckpointReached) {
      this.callbacks.onCheckpointReached(cp, index);
    }

    if (cp.type === 'arrive') {
      this.state = 'completed';
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }
      if (this.callbacks.onStateChange) {
        this.callbacks.onStateChange(this.state);
      }
      if (this.callbacks.onSimulationComplete) {
        this.callbacks.onSimulationComplete(this.route);
      }
    }
  }

  /**
   * 매 프레임 위치 보간 및 체크포인트 통과 여부 검사
   */
  _tick(now) {
    if (this.state !== 'running' || !this.route) return;

    const dt = Math.min((now - (this.lastFrameTime || now)) / 1000, 0.1);
    this.lastFrameTime = now;

    // 음성 안내 발화 직후에는 속도를 약간 완만하게 조절해 안내 음성이 끊기지 않도록 배려
    const speechDamping = now < this.checkpointHoldUntil ? 0.55 : 1.0;
    const deltaDist = dt * this.baseSimSpeedMps * this.speedMultiplier * speechDamping;

    this.traveledDist = Math.min(
      this.route.totalDistance,
      this.traveledDist + deltaDist
    );

    const posInfo = this._getPositionAtDistance(this.traveledDist);
    if (this.callbacks.onPositionUpdate) {
      this.callbacks.onPositionUpdate(posInfo);
    }

    // 중간 체크포인트 도달 검사 (갈림길 45m 전방 진입 시점에 사전 안내 발화)
    const checkpoints = this.route.checkpoints || [];
    for (let i = 1; i < checkpoints.length - 1; i++) {
      const cp = checkpoints[i];
      if (this.triggeredCheckpoints.has(cp.id)) continue;

      // 갈림길 체크포인트 약 45m 전방(또는 구간 진입 시) 안내 트리거
      const triggerDist = Math.max(15, cp.cumulativeDist - 40);
      if (this.traveledDist >= triggerDist) {
        this.triggeredCheckpoints.add(cp.id);
        this.checkpointHoldUntil = performance.now() + 2800;
        if (this.callbacks.onCheckpointReached) {
          this.callbacks.onCheckpointReached(cp, i);
        }
        break; // 한 프레임에 하나의 음성 안내만 트리거
      }
    }

    // 최종 목적지 도착 검사
    if (this.traveledDist >= this.route.totalDistance) {
      const arriveCp = checkpoints[checkpoints.length - 1];
      if (arriveCp && !this.triggeredCheckpoints.has(arriveCp.id)) {
        this.triggeredCheckpoints.add(arriveCp.id);
        if (this.callbacks.onCheckpointReached) {
          this.callbacks.onCheckpointReached(arriveCp, checkpoints.length - 1);
        }
      }

      this.state = 'completed';
      if (this.callbacks.onStateChange) {
        this.callbacks.onStateChange(this.state);
      }
      if (this.callbacks.onSimulationComplete) {
        this.callbacks.onSimulationComplete(this.route);
      }
      return;
    }

    this.animFrameId = requestAnimationFrame((nextNow) => this._tick(nextNow));
  }

  /**
   * 누적 이동 거리(m)에 해당하는 보간 위경도 좌표 및 진행 방향 방위각 계산
   */
  _getPositionAtDistance(dist) {
    const total = this.route.totalDistance || 1;
    const clampedDist = Math.max(0, Math.min(total, dist));
    const progress = Math.min(100, Math.round((clampedDist / total) * 100));
    const remainingDist = Math.max(0, Math.round(total - clampedDist));
    const remainingMinutes = Math.max(
      0,
      Math.ceil(remainingDist / 68)
    );

    const segments = this.route.segments;
    let activeSegment = segments[segments.length - 1];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (clampedDist <= seg.endCumulativeDist || i === segments.length - 1) {
        activeSegment = seg;
        break;
      }
    }

    const segLength = Math.max(0.001, activeSegment.distance);
    const segProgress = Math.max(
      0,
      Math.min(1, (clampedDist - activeSegment.startCumulativeDist) / segLength)
    );

    const lat =
      activeSegment.from[0] +
      (activeSegment.to[0] - activeSegment.from[0]) * segProgress;
    const lng =
      activeSegment.from[1] +
      (activeSegment.to[1] - activeSegment.from[1]) * segProgress;

    return {
      lat,
      lng,
      bearing: activeSegment.bearing,
      traveledDist: Math.round(clampedDist),
      remainingDist,
      remainingMinutes,
      progress,
      currentSegmentIndex: activeSegment.index,
    };
  }
}

window.RouteSimulator = RouteSimulator;

