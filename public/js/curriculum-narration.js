(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MatthsCurriculumNarration = api;
  if (root?.document) {
    const start = () => api.mountCurriculumNarration(root.document, root);
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  // 브라우저 SpeechSynthesis의 1.0은 수학 기호와 수식을 강의하기에 너무 빠르다.
  // 플랫폼별 엔진 차이를 감안해 웹은 차분한 강의 속도로 고정한다.
  const CALM_LECTURE_RATE = 0.68;

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/gu, " ").trim();
  }

  function splitOversizeChunk(text, maximumCharacters) {
    const chunks = [];
    let remaining = normalizeWhitespace(text);
    while (remaining.length > maximumCharacters) {
      const windowText = remaining.slice(0, maximumCharacters + 1);
      const preferred = Math.max(
        windowText.lastIndexOf(", "),
        windowText.lastIndexOf("; "),
        windowText.lastIndexOf(" "),
      );
      const breakAt = preferred >= Math.floor(maximumCharacters * 0.55)
        ? preferred + 1
        : maximumCharacters;
      chunks.push(remaining.slice(0, breakAt).trim());
      remaining = remaining.slice(breakAt).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
  }

  function splitNarrationIntoChunks(text, maximumCharacters = 180) {
    const normalized = normalizeWhitespace(text);
    if (!normalized) return [];
    let sentences;
    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
      const segmenter = new Intl.Segmenter("ko", { granularity: "sentence" });
      sentences = [...segmenter.segment(normalized)].map(({ segment }) => segment.trim());
    } else {
      sentences = normalized.match(/[^.!?。！？…]+(?:[.!?。！？]+|…+|$)/gu) || [normalized];
    }
    return sentences
      .filter(Boolean)
      .flatMap((sentence) => splitOversizeChunk(sentence, maximumCharacters));
  }

  function buildNarrationChunks(story, maximumCharacters = 180) {
    return (story?.scenes || []).flatMap((scene, sceneIndex) =>
      splitNarrationIntoChunks(scene.narration, maximumCharacters).map((text) => ({
        text,
        sceneId: scene.id,
        sceneTitle: scene.title,
        sceneIndex,
      })),
    );
  }

  function curriculumNarrationCheckpointKey(story, rawScope) {
    const scope = /^[a-f0-9]{16}$/u.test(String(rawScope || ""))
      ? String(rawScope)
      : "anonymous";
    const revision = Number.isInteger(story?.revision) && story.revision >= 0
      ? story.revision
      : 0;
    return `matths.curriculumNarration.${scope}.${String(story?.id || "unknown")}.r${revision}`;
  }

  function preferredKoreanVoice(voices) {
    const korean = (voices || []).filter((voice) =>
      /^ko(?:-|$)/iu.test(String(voice.lang || "")),
    );
    const femaleName = /(yuna|sora|sunhi|nari|female|woman|여성|유나|소라|선히|나리)/iu;
    return korean.find((voice) => femaleName.test(voice.name || ""))
      || korean.find((voice) => voice.default)
      || korean[0]
      || null;
  }

  class SystemSpeechProvider {
    constructor({
      speechSynthesis,
      SpeechSynthesisUtterance,
      setTimer = setTimeout,
      clearTimer = clearTimeout,
      voiceWaitMilliseconds = 900,
    } = {}) {
      this.synth = speechSynthesis || null;
      this.Utterance = SpeechSynthesisUtterance || null;
      this.activeUtterance = null;
      this.requestId = 0;
      this.setTimer = setTimer;
      this.clearTimer = clearTimer;
      this.voiceWaitMilliseconds = voiceWaitMilliseconds;
    }

    get isAvailable() {
      return Boolean(this.synth && this.Utterance);
    }

    waitForVoices() {
      if (!this.isAvailable || this.synth.getVoices().some((voice) => /^ko(?:-|$)/iu.test(voice.lang || ""))) {
        return Promise.resolve();
      }
      if (typeof this.synth.addEventListener !== "function") return Promise.resolve();

      return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          this.clearTimer(timer);
          this.synth.removeEventListener?.("voiceschanged", finish);
          resolve();
        };
        const timer = this.setTimer(finish, this.voiceWaitMilliseconds);
        this.synth.addEventListener("voiceschanged", finish, { once: true });
      });
    }

    async speak(text, { onEnd, onError, onInterrupted } = {}) {
      if (!this.isAvailable) {
        onError?.(new Error("SYSTEM_SPEECH_UNAVAILABLE"));
        return;
      }
      const requestId = ++this.requestId;
      this.synth.cancel();
      await this.waitForVoices();
      if (requestId !== this.requestId) return;
      const utterance = new this.Utterance(text);
      utterance.lang = "ko-KR";
      utterance.rate = CALM_LECTURE_RATE;
      utterance.pitch = 1;
      const voice = preferredKoreanVoice(this.synth.getVoices());
      if (voice) utterance.voice = voice;
      utterance.onend = () => {
        if (this.activeUtterance !== utterance) return;
        this.activeUtterance = null;
        onEnd?.();
      };
      utterance.onerror = (event) => {
        if (this.activeUtterance !== utterance) return;
        this.activeUtterance = null;
        if (event.error === "canceled") return;
        if (event.error === "interrupted") {
          onInterrupted?.();
          return;
        }
        onError?.(new Error(event.error || "SYSTEM_SPEECH_FAILED"));
      };
      this.activeUtterance = utterance;
      this.synth.speak(utterance);
    }

    pause() {
      if (!this.isAvailable) return false;
      if (!this.synth.speaking) {
        // voiceschanged를 기다리던 요청도 취소한다. resume 시 같은 문장 경계에서 새로 읽는다.
        this.requestId += 1;
        return false;
      }
      if (this.synth.paused) return false;
      this.synth.pause();
      return true;
    }

    resume() {
      if (!this.isAvailable || !this.synth.paused) return false;
      this.synth.resume();
      return true;
    }

    stop() {
      if (!this.isAvailable) return;
      this.requestId += 1;
      this.activeUtterance = null;
      this.synth.cancel();
    }
  }

  function isCurriculumSpeechProvider(provider) {
    return Boolean(
      provider
      && typeof provider.speak === "function"
      && typeof provider.pause === "function"
      && typeof provider.resume === "function"
      && typeof provider.stop === "function",
    );
  }

  function createCurriculumSpeechProvider({ kind = "system", providers = {}, systemOptions } = {}) {
    const provider = kind === "system"
      ? new SystemSpeechProvider(systemOptions)
      : providers[kind];
    if (!isCurriculumSpeechProvider(provider)) {
      throw new Error(`Curriculum speech provider is not registered: ${kind}`);
    }
    return provider;
  }

  class NarrationCheckpointStore {
    constructor(storage, key) {
      this.storage = storage || null;
      this.key = key;
    }

    load(maximum) {
      try {
        const value = Number(this.storage?.getItem(this.key));
        return Number.isInteger(value) && value >= 0 && value < maximum ? value : 0;
      } catch (_error) {
        return 0;
      }
    }

    save(value) {
      try {
        this.storage?.setItem(this.key, String(value));
      } catch (_error) {
        // Private browsing can reject storage. Playback still works in memory.
      }
    }

    clear() {
      try {
        this.storage?.removeItem(this.key);
      } catch (_error) {
        // No persistent checkpoint is safer than blocking playback.
      }
    }
  }

  class CurriculumNarrationSession {
    constructor({
      story,
      provider,
      checkpointStore,
      onChange,
      setTimer = setTimeout,
      clearTimer = clearTimeout,
    } = {}) {
      this.story = story;
      this.provider = provider;
      this.chunks = buildNarrationChunks(story);
      this.checkpointStore = checkpointStore;
      this.onChange = onChange || (() => {});
      this.index = checkpointStore?.load(this.chunks.length) || 0;
      this.state = this.index > 0 ? "paused" : "idle";
      this.error = null;
      this.watchdog = null;
      this.activePlayback = null;
      this.setTimer = setTimer;
      this.clearTimer = clearTimer;
      this.emit();
    }

    snapshot() {
      return {
        state: this.state,
        index: this.index,
        total: this.chunks.length,
        chunk: this.chunks[this.index] || null,
        error: this.error,
      };
    }

    emit() {
      this.onChange(this.snapshot());
    }

    clearWatchdog() {
      if (this.watchdog !== null) this.clearTimer(this.watchdog);
      this.watchdog = null;
    }

    startWatchdog(chunk) {
      this.clearWatchdog();
      const maximumWait = Math.max(20000, chunk.text.length * 300);
      this.watchdog = this.setTimer(() => {
        this.watchdog = null;
        if (this.state !== "playing") return;
        this.activePlayback = null;
        this.provider.stop();
        this.checkpointStore?.save(this.index);
        this.state = "paused";
        this.error = "음성이 오래 멈춰 현재 문장을 보존했습니다. 이어 듣기를 눌러 다시 시작해 주세요.";
        this.emit();
      }, maximumWait);
    }

    start() {
      if (!this.provider?.isAvailable || !this.chunks.length) {
        this.state = "failed";
        this.error = "이 브라우저에서는 음성 읽기를 사용할 수 없습니다. 아래 원문으로 학습해 주세요.";
        this.emit();
        return;
      }
      if (this.state === "playing") return;
      if (this.state === "paused" && this.provider.resume()) {
        this.state = "playing";
        const chunk = this.chunks[this.index];
        if (chunk) this.startWatchdog(chunk);
        this.emit();
        return;
      }
      if (this.state === "completed") this.index = 0;
      this.speakCurrent();
    }

    speakCurrent() {
      const chunk = this.chunks[this.index];
      if (!chunk) {
        this.state = "completed";
        this.checkpointStore?.clear();
        this.emit();
        return;
      }
      this.state = "playing";
      this.error = null;
      this.checkpointStore?.save(this.index);
      this.emit();
      const playback = {};
      this.activePlayback = playback;
      this.startWatchdog(chunk);
      this.provider.speak(chunk.text, {
        onEnd: () => {
          if (this.activePlayback !== playback) return;
          this.activePlayback = null;
          this.clearWatchdog();
          if (this.state !== "playing") return;
          this.index += 1;
          this.checkpointStore?.save(this.index);
          this.speakCurrent();
        },
        onError: () => {
          if (this.activePlayback !== playback) return;
          this.activePlayback = null;
          this.clearWatchdog();
          this.state = "failed";
          this.error = "음성을 재생하지 못했습니다. 원문으로 계속 학습해 주세요.";
          this.emit();
        },
        onInterrupted: () => {
          if (this.activePlayback !== playback) return;
          this.activePlayback = null;
          this.clearWatchdog();
          this.provider.stop();
          this.checkpointStore?.save(this.index);
          this.state = "paused";
          this.error = "다른 음성이나 시스템 동작으로 멈췄습니다. 현재 문장부터 이어 들을 수 있습니다.";
          this.emit();
        },
      });
    }

    pause() {
      if (this.state !== "playing") return;
      const paused = this.provider.pause();
      if (!paused) {
        this.activePlayback = null;
        this.provider.stop();
      }
      this.clearWatchdog();
      this.checkpointStore?.save(this.index);
      this.state = "paused";
      this.emit();
    }

    toggle() {
      if (this.state === "playing") this.pause();
      else this.start();
    }

    restart() {
      this.activePlayback = null;
      this.provider?.stop();
      this.clearWatchdog();
      this.index = 0;
      this.checkpointStore?.clear();
      this.state = "idle";
      this.error = null;
      this.emit();
      this.start();
    }

    dispose() {
      if (this.state === "playing") this.checkpointStore?.save(this.index);
      this.activePlayback = null;
      this.clearWatchdog();
      this.provider?.stop();
    }
  }

  function mountCurriculumNarration(document, browserWindow) {
    const dataNode = document.getElementById("curriculum-narration-data");
    const toggle = document.querySelector("[data-curriculum-narration-toggle]");
    const restart = document.querySelector("[data-curriculum-narration-restart]");
    const status = document.querySelector("[data-curriculum-narration-status]");
    if (!dataNode || !toggle || !status) return null;

    let story;
    try {
      story = JSON.parse(dataNode.textContent || "null");
    } catch (_error) {
      toggle.disabled = true;
      status.textContent = "해설 데이터를 읽지 못했습니다. 아래 원문으로 학습해 주세요.";
      return null;
    }

    // Browser SpeechSynthesis에는 gender 메타데이터가 없다. 한국어 여성 이름을
    // 우선 선택하고 없으면 기기의 기본 한국어 음성으로 안전하게 후퇴한다.
    const provider = createCurriculumSpeechProvider({
      kind: "system",
      systemOptions: {
        speechSynthesis: browserWindow.speechSynthesis,
        SpeechSynthesisUtterance: browserWindow.SpeechSynthesisUtterance,
      },
    });
    const checkpointStore = new NarrationCheckpointStore(
      browserWindow.sessionStorage,
      curriculumNarrationCheckpointKey(story, dataNode.dataset.checkpointScope),
    );
    const beats = [...document.querySelectorAll("[data-memory-scene-id]")];

    const session = new CurriculumNarrationSession({
      story,
      provider,
      checkpointStore,
      onChange(snapshot) {
        if (
          typeof browserWindow.CustomEvent === "function"
          && typeof document.dispatchEvent === "function"
        ) {
          document.dispatchEvent(new browserWindow.CustomEvent(
            "matths:curriculum-narration-state",
            { detail: snapshot },
          ));
        }
        const label = toggle.querySelector("b");
        const symbol = toggle.querySelector("span");
        const chunk = snapshot.chunk;
        const hasProgress = snapshot.index > 0 || snapshot.state === "completed";
        restart.hidden = !hasProgress;
        beats.forEach((beat) => {
          const active = chunk && beat.dataset.memorySceneId === chunk.sceneId
            && ["playing", "paused"].includes(snapshot.state);
          beat.classList.toggle("is-speaking", Boolean(active));
          if (active) beat.setAttribute("aria-current", "step");
          else beat.removeAttribute("aria-current");
        });

        if (snapshot.state === "playing") {
          label.textContent = "잠시 멈추기";
          symbol.textContent = "Ⅱ";
          status.textContent = `${chunk.sceneTitle} · 문장 ${snapshot.index + 1} / ${snapshot.total}`;
        } else if (snapshot.state === "paused") {
          label.textContent = "이어서 듣기";
          symbol.textContent = "▶";
          status.textContent = snapshot.error || (chunk
            ? `${chunk.sceneTitle}에서 멈췄습니다. 문장 경계부터 이어집니다.`
            : "멈춘 곳에서 이어 들을 수 있습니다.");
        } else if (snapshot.state === "completed") {
          label.textContent = "다시 듣기";
          symbol.textContent = "↺";
          status.textContent = "5분 해설을 모두 들었습니다.";
        } else if (snapshot.state === "failed") {
          label.textContent = "음성 사용 불가";
          symbol.textContent = "×";
          toggle.disabled = true;
          status.textContent = snapshot.error;
        } else {
          label.textContent = "5분 해설 듣기";
          symbol.textContent = "▶";
          status.textContent = "기기의 한국어 여성 음성을 우선 사용합니다.";
        }
      },
    });

    dataNode.curriculumNarrationSession = session;

    toggle.addEventListener("click", () => session.toggle());
    restart.addEventListener("click", () => session.restart());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) session.pause();
    });
    browserWindow.addEventListener("pagehide", () => session.dispose(), { once: true });
    return session;
  }

  return {
    CALM_LECTURE_RATE,
    CurriculumNarrationSession,
    NarrationCheckpointStore,
    SystemSpeechProvider,
    buildNarrationChunks,
    createCurriculumSpeechProvider,
    curriculumNarrationCheckpointKey,
    isCurriculumSpeechProvider,
    mountCurriculumNarration,
    normalizeWhitespace,
    preferredKoreanVoice,
    splitNarrationIntoChunks,
  };
});
