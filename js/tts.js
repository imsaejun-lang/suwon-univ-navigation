/**
 * 수원대학교 스마트 캠퍼스 내비게이션 - 음성 길안내 모듈 (Web Speech API - TTS)
 * 브라우저 내장 window.speechSynthesis (한국어 ko-KR) 제어 및 실시간 음성 자막 HUD 연동
 */

class VoiceGuideManager {
  constructor(options = {}) {
    this.enabled = true;
    this.synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.koreanVoice = null;
    this.isSpeaking = false;
    this.history = [];
    this.onSpeakStart = options.onSpeakStart || null;
    this.onSpeakEnd = options.onSpeakEnd || null;
    this.onStateChange = options.onStateChange || null;

    if (this.synth) {
      this._loadVoices();
      if (typeof this.synth.onvoiceschanged !== 'undefined') {
        this.synth.onvoiceschanged = () => this._loadVoices();
      }
    }
  }

  /**
   * 한국어(ko-KR) 최적 음성 엔진 로드
   */
  _loadVoices() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    if (!voices || voices.length === 0) return;

    // 한국어 음성 필터링 (자연스러운 음성 우선 선택)
    const koVoices = voices.filter(
      (v) => v.lang && (v.lang.includes('ko') || v.lang.includes('KR'))
    );

    if (koVoices.length > 0) {
      this.koreanVoice =
        koVoices.find((v) => v.name.includes('Natural') || v.name.includes('Online')) ||
        koVoices.find((v) => v.name.includes('Google')) ||
        koVoices.find((v) => v.name.includes('SunHi') || v.name.includes('Heami')) ||
        koVoices[0];
    }
  }

  /**
   * 음성 안내 켜기/끄기 토글
   */
  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled && this.synth) {
      this.synth.cancel();
      this.isSpeaking = false;
    }
    if (this.onStateChange) {
      this.onStateChange(this.enabled);
    }
    if (this.enabled) {
      this.speak('음성 안내가 켜졌습니다.', { isSystemNotice: true });
    }
    return this.enabled;
  }

  /**
   * 음성 안내 상태 직접 설정
   */
  setEnabled(flag) {
    this.enabled = Boolean(flag);
    if (!this.enabled && this.synth) {
      this.synth.cancel();
      this.isSpeaking = false;
    }
    if (this.onStateChange) {
      this.onStateChange(this.enabled);
    }
  }

  /**
   * 진행 중인 음성 즉시 중지
   */
  stop() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.isSpeaking = false;
    if (this.onSpeakEnd) {
      this.onSpeakEnd();
    }
  }

  /**
   * 내비게이션 음성 출력 (ko-KR)
   * @param {string} text - 출력할 한국어 안내 문장
   * @param {Object} meta - 체크포인트 종류 및 부가 메타데이터
   */
  speak(text, meta = {}) {
    if (!text) return;

    const logItem = {
      id: Date.now() + Math.random(),
      text,
      time: new Date().toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      muted: !this.enabled,
      ...meta,
    };
    this.history.unshift(logItem);
    if (this.history.length > 20) this.history.pop();

    // 시각적 HUD 콜백은 음소거 여부와 무관하게 표시하여 디버깅/테스트 편의성 보장
    if (this.onSpeakStart) {
      this.onSpeakStart(logItem);
    }

    if (!this.enabled || !this.synth) {
      setTimeout(() => {
        if (this.onSpeakEnd) this.onSpeakEnd(logItem);
      }, 2400);
      return;
    }

    try {
      // 이전 발화가 남아있으면 취소 후 새 안내 즉시 재생
      this.synth.cancel();

      if (!this.koreanVoice) {
        this._loadVoices();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      if (this.koreanVoice) {
        utterance.voice = this.koreanVoice;
      }
      utterance.rate = meta.rate || 1.02; // 명료하고 자연스러운 내비게이션 속도
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onstart = () => {
        this.isSpeaking = true;
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        if (this.onSpeakEnd) this.onSpeakEnd(logItem);
      };

      utterance.onerror = () => {
        this.isSpeaking = false;
        if (this.onSpeakEnd) this.onSpeakEnd(logItem);
      };

      this.synth.speak(utterance);
    } catch (err) {
      console.warn('Web Speech API 재생 중 예외 발생:', err);
      if (this.onSpeakEnd) this.onSpeakEnd(logItem);
    }
  }
}

window.VoiceGuideManager = VoiceGuideManager;

