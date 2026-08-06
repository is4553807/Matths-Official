import {
  getRankTier,
  normalizeRankTier,
  resolveRankTierMedia,
} from "./rank-motion-tiers.js";

const TEMPLATE = document.createElement("template");

TEMPLATE.innerHTML = `
  <style>
    :host {
      --rank-motion-surface: #05080d;
      --rank-motion-accent: #65f6ee;
      --rank-motion-accent-deep: #123f43;
      --rank-motion-border: color-mix(in srgb, var(--rank-motion-accent) 34%, transparent);
      --rank-motion-control-bg: rgba(3, 8, 14, 0.76);
      --rank-motion-radius: 1.5rem;
      --rank-motion-card-max: 30rem;
      --rank-motion-aspect-ratio: 9 / 16;
      display: block;
      inline-size: 100%;
      color: #f7fbff;
      contain: layout paint;
      isolation: isolate;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    .shell {
      position: relative;
      inline-size: 100%;
      aspect-ratio: var(--rank-motion-aspect-ratio);
      overflow: hidden;
      border: 1px solid var(--rank-motion-border);
      border-radius: var(--rank-motion-radius);
      background: var(--rank-motion-surface);
      box-shadow:
        0 1.5rem 5rem rgba(0, 0, 0, 0.38),
        inset 0 0 0 1px rgba(255, 255, 255, 0.025);
      outline: none;
      touch-action: manipulation;
    }

    .shell:focus-visible {
      box-shadow:
        0 0 0 3px color-mix(in srgb, var(--rank-motion-accent) 48%, transparent),
        0 1.5rem 5rem rgba(0, 0, 0, 0.38);
    }

    :host([mode="card"]) {
      max-inline-size: var(--rank-motion-card-max);
    }

    :host([mode="viewport"]) .shell {
      inline-size: 100%;
      block-size: 100vh;
      min-block-size: 100vh;
      block-size: 100dvh;
      min-block-size: 100svh;
      aspect-ratio: auto;
      border: 0;
      border-radius: 0;
    }

    :host([mode="fill"]) {
      block-size: 100%;
      min-block-size: 0;
    }

    :host([mode="fill"]) .shell {
      block-size: 100%;
      aspect-ratio: auto;
    }

    :host([mode="modal"]) {
      inline-size: min(92vw, calc(90vh * 9 / 16));
      inline-size: min(92vw, calc(90dvh * 9 / 16));
      max-inline-size: none;
    }

    :host([mode="modal"]) .shell {
      max-block-size: 90vh;
      max-block-size: 90dvh;
    }

    .media,
    .backdrop-poster,
    .foreground {
      position: absolute;
      inset: 0;
      inline-size: 100%;
      block-size: 100%;
    }

    .media {
      overflow: hidden;
      background:
        radial-gradient(
          circle at 50% 44%,
          color-mix(in srgb, var(--rank-motion-accent-deep) 74%, transparent),
          transparent 52%
        ),
        var(--rank-motion-surface);
    }

    .backdrop-poster {
      transform: scale(1.16);
      object-fit: cover;
      filter: blur(clamp(2rem, 5vw, 4rem)) saturate(0.7) brightness(0.25);
      opacity: 0.72;
    }

    .backdrop-poster {
      display: block;
    }

    .backdrop-poster[hidden] {
      display: none;
    }

    .foreground {
      z-index: 1;
      object-fit: contain;
      object-position: 50% 50%;
      background: transparent;
    }

    .shade {
      position: absolute;
      z-index: 2;
      inset: 0;
      pointer-events: none;
      background:
        linear-gradient(180deg, rgba(0, 0, 0, 0.08) 58%, rgba(0, 4, 9, 0.66) 100%),
        radial-gradient(circle at center, transparent 44%, rgba(0, 3, 8, 0.22) 100%);
    }

    .tier-chip {
      position: absolute;
      z-index: 3;
      inset-block-start: max(0.75rem, env(safe-area-inset-top));
      inset-inline-start: max(0.75rem, env(safe-area-inset-left));
      display: none;
      margin: 0;
      padding: 0.35rem 0.58rem;
      border: 1px solid color-mix(in srgb, var(--rank-motion-accent) 36%, transparent);
      border-radius: 999px;
      color: color-mix(in srgb, var(--rank-motion-accent) 84%, white);
      background: rgba(2, 7, 12, 0.66);
      font: 800 0.64rem/1 ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif;
      letter-spacing: 0.12em;
      backdrop-filter: blur(0.75rem);
      -webkit-backdrop-filter: blur(0.75rem);
    }

    :host([debug-label]) .tier-chip {
      display: block;
    }

    .controls {
      position: absolute;
      z-index: 4;
      inset-inline: max(0.75rem, env(safe-area-inset-left)) max(0.75rem, env(safe-area-inset-right));
      inset-block-end: max(0.75rem, env(safe-area-inset-bottom));
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      pointer-events: none;
    }

    .control {
      display: inline-grid;
      place-items: center;
      inline-size: 2.75rem;
      block-size: 2.75rem;
      padding: 0;
      border: 1px solid color-mix(in srgb, var(--rank-motion-accent) 26%, transparent);
      border-radius: 999px;
      color: #f7fbff;
      background: var(--rank-motion-control-bg);
      box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(0.8rem);
      -webkit-backdrop-filter: blur(0.8rem);
      cursor: pointer;
      pointer-events: auto;
      -webkit-tap-highlight-color: transparent;
    }

    .control:hover {
      border-color: color-mix(in srgb, var(--rank-motion-accent) 58%, transparent);
      background: color-mix(in srgb, var(--rank-motion-accent-deep) 42%, rgba(3, 8, 14, 0.92));
    }

    .control:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--rank-motion-accent) 52%, transparent);
      outline-offset: 2px;
    }

    .control svg {
      inline-size: 1.2rem;
      block-size: 1.2rem;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.8;
    }

    .play-icon,
    .pause-icon,
    .sound-on-icon,
    .sound-off-icon {
      display: none;
    }

    :host([data-state="paused"]) .play-icon,
    :host([data-state="idle"]) .play-icon,
    :host([data-state="ended"]) .play-icon,
    :host([data-state="error"]) .play-icon,
    :host([data-state="playing"]) .pause-icon,
    :host([data-muted="false"]) .sound-on-icon,
    :host([data-muted="true"]) .sound-off-icon {
      display: block;
    }

    .message {
      position: absolute;
      z-index: 5;
      inset: 50% auto auto 50%;
      transform: translate(-50%, -50%);
      max-inline-size: min(80%, 22rem);
      margin: 0;
      padding: 0.65rem 0.9rem;
      border: 1px solid color-mix(in srgb, var(--rank-motion-accent) 20%, transparent);
      border-radius: 999px;
      color: rgba(247, 251, 255, 0.9);
      background: rgba(3, 8, 14, 0.72);
      font: 600 0.78rem/1.35 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif;
      letter-spacing: -0.01em;
      text-align: center;
      backdrop-filter: blur(0.75rem);
      -webkit-backdrop-filter: blur(0.75rem);
    }

    .message[hidden],
    :host([data-controls="false"]) .controls,
    :host([data-backdrop="false"]) .backdrop-poster {
      display: none;
    }

    :host([data-backdrop="false"]) .media {
      background: var(--rank-motion-surface);
    }

    @supports not (color: color-mix(in srgb, white 50%, black)) {
      .shell,
      .control,
      .message {
        border-color: rgba(200, 230, 240, 0.24);
      }
    }

    @media (orientation: landscape) and (max-height: 34rem) {
      .control {
        inline-size: 2.35rem;
        block-size: 2.35rem;
      }

      .controls {
        justify-content: flex-end;
      }
    }

  </style>

  <div class="shell" tabindex="0">
    <div class="media">
      <img class="backdrop-poster" alt="" aria-hidden="true" />
      <video class="foreground" playsinline></video>
      <div class="shade" aria-hidden="true"></div>
    </div>

    <p class="tier-chip" aria-hidden="true"></p>
    <p class="message" role="status" aria-live="polite" hidden></p>

    <div class="controls" aria-label="랭크 승급 영상 제어">
      <button class="control play-toggle" type="button" aria-label="재생">
        <svg class="play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z" /></svg>
        <svg class="pause-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14" /></svg>
      </button>
      <button class="control replay" type="button" aria-label="처음부터 다시 재생">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 2 7M4 10V5m0 5h5" /></svg>
      </button>
      <button class="control sound-toggle" type="button" aria-label="소리 켜기">
        <svg class="sound-on-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h4l5-4v14l-5-4H5zM17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" /></svg>
        <svg class="sound-off-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h4l5-4v14l-5-4H5zM17 10l4 4m0-4-4 4" /></svg>
      </button>
    </div>
  </div>
`;

class MatthsRankMotion extends HTMLElement {
  static observedAttributes = [
    "tier",
    "asset-base",
    "src",
    "poster",
    "label",
    "autoplay",
    "loop",
    "muted",
    "backdrop",
    "controls",
    "preload",
  ];

  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(TEMPLATE.content.cloneNode(true));

    this._connected = false;
    this._eventsBound = false;
    this._attemptedAutoplay = false;
    this._userRequestedPlayback = false;
    this._motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

    this._shell = this.shadowRoot.querySelector(".shell");
    this._video = this.shadowRoot.querySelector(".foreground");
    this._backdropPoster = this.shadowRoot.querySelector(".backdrop-poster");
    this._tierChip = this.shadowRoot.querySelector(".tier-chip");
    this._message = this.shadowRoot.querySelector(".message");
    this._playButton = this.shadowRoot.querySelector(".play-toggle");
    this._replayButton = this.shadowRoot.querySelector(".replay");
    this._soundButton = this.shadowRoot.querySelector(".sound-toggle");
    this._onMotionPreferenceChange = () => this._handleMotionPreference();
  }

  connectedCallback() {
    if (this._connected) return;
    this._connected = true;

    if (!this._eventsBound) {
      this._bindEvents();
      this._eventsBound = true;
    }

    this._applyAttributes();
    this._setState("idle");

    if (this._motionPreference.addEventListener) {
      this._motionPreference.addEventListener("change", this._onMotionPreferenceChange);
    } else {
      this._motionPreference.addListener(this._onMotionPreferenceChange);
    }

    if (this._booleanAttribute("autoplay", false)) this._attemptAutoplay();
  }

  disconnectedCallback() {
    this._connected = false;

    if (this._motionPreference.removeEventListener) {
      this._motionPreference.removeEventListener("change", this._onMotionPreferenceChange);
    } else {
      this._motionPreference.removeListener(this._onMotionPreferenceChange);
    }
  }

  attributeChangedCallback() {
    if (this._connected) this._applyAttributes();
  }

  get tier() {
    return normalizeRankTier(this.getAttribute("tier"));
  }

  get currentTime() {
    return this._video.currentTime;
  }

  set currentTime(value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) this._video.currentTime = seconds;
  }

  get duration() {
    return Number.isFinite(this._video.duration) ? this._video.duration : 0;
  }

  get paused() {
    return this._video.paused;
  }

  get muted() {
    return this._video.muted;
  }

  setTier(value) {
    const slug = normalizeRankTier(value);
    if (!slug) throw new TypeError(`MatthsRankMotion: unknown tier "${value}".`);
    this.setAttribute("tier", slug);
    return getRankTier(slug);
  }

  async play({ sound = false } = {}) {
    this._userRequestedPlayback = true;
    if (sound) this.setMuted(false);
    return this._requestPlay();
  }

  pause() {
    this._video.pause();
  }

  async replay({ sound = false } = {}) {
    this._userRequestedPlayback = true;
    this._video.currentTime = 0;
    if (sound) this.setMuted(false);
    return this._requestPlay();
  }

  setMuted(muted) {
    this._video.muted = Boolean(muted);
    this._reflectMutedState();
    this.dispatchEvent(
      new CustomEvent("rankmotionaudiochange", {
        detail: { muted: this._video.muted, tier: this.tier },
        bubbles: true,
      }),
    );
  }

  _bindEvents() {
    this._playButton.addEventListener("click", () => {
      if (this._video.paused || this._video.ended) {
        if (this._video.ended) this._video.currentTime = 0;
        this.play();
      } else {
        this.pause();
      }
    });

    this._replayButton.addEventListener("click", () => this.replay());
    this._soundButton.addEventListener("click", () => this.setMuted(!this._video.muted));

    this._shell.addEventListener("keydown", (event) => {
      if (event.target.closest("button")) return;

      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        this._playButton.click();
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        this.replay();
      } else if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        this.setMuted(!this._video.muted);
      }
    });

    this._video.addEventListener("loadedmetadata", () => {
      if (this._booleanAttribute("autoplay", false)) this._attemptAutoplay();
    });

    this._video.addEventListener("play", () => {
      this._setState("playing");
      this._hideMessage();
      this.dispatchEvent(
        new CustomEvent("rankmotionplay", { detail: { tier: this.tier }, bubbles: true }),
      );
    });

    this._video.addEventListener("pause", () => {
      if (!this._video.ended) this._setState("paused");
      this.dispatchEvent(
        new CustomEvent("rankmotionpause", { detail: { tier: this.tier }, bubbles: true }),
      );
    });

    this._video.addEventListener("ended", () => {
      this._setState("ended");
      this.dispatchEvent(
        new CustomEvent("rankmotionended", { detail: { tier: this.tier }, bubbles: true }),
      );
    });

    this._video.addEventListener("volumechange", () => this._reflectMutedState());
    this._video.addEventListener("error", () => this._handleError());
  }

  _applyAttributes() {
    const tier = getRankTier(this.getAttribute("tier"));
    const resolved = tier
      ? resolveRankTierMedia(tier.slug, this.getAttribute("asset-base") || "/media/rank-motion")
      : null;
    const source = this.getAttribute("src") || resolved?.src || "";
    const poster = this.getAttribute("poster") || resolved?.posterSrc || "";
    const label =
      this.getAttribute("label") ||
      (tier ? `${tier.koLabel} (${tier.label}) 랭크 승급 애니메이션` : "랭크 승급 애니메이션");
    const preload = this.getAttribute("preload") || "metadata";
    const autoplay = this._booleanAttribute("autoplay", false);
    const requestedMuted = this._booleanAttribute("muted", false);

    if (tier) {
      this.dataset.tier = tier.slug;
      this.style.setProperty("--rank-motion-accent", tier.accent);
      this.style.setProperty("--rank-motion-accent-deep", tier.accentDeep);
      this._tierChip.textContent = tier.label;
    } else {
      delete this.dataset.tier;
      this._tierChip.textContent = "";
    }

    if (this._video.getAttribute("src") !== source) {
      const previousTier = this._video.dataset.tier || null;
      if (source) {
        this._video.src = source;
      } else {
        this._video.removeAttribute("src");
      }
      this._video.dataset.tier = tier?.slug || "";
      this._attemptedAutoplay = false;
      this._video.load();
      this._setState("idle");

      if (previousTier !== (tier?.slug || null)) {
        this.dispatchEvent(
          new CustomEvent("rankmotiontierchange", {
            detail: { previousTier, tier: tier?.slug || null, source },
            bubbles: true,
          }),
        );
      }
    }

    this._video.poster = poster;
    this._backdropPoster.src = poster;
    this._backdropPoster.hidden = !poster;
    this._video.preload = preload;
    this._video.loop = this._booleanAttribute("loop", false);
    this._video.setAttribute("aria-label", label);
    this._shell.setAttribute("aria-label", label);
    this._video.muted = autoplay ? true : requestedMuted;

    const backdropEnabled = this._booleanAttribute("backdrop", true);
    this.dataset.backdrop = String(backdropEnabled);
    this.dataset.controls = String(this._booleanAttribute("controls", true));
    this._reflectMutedState();
  }

  async _attemptAutoplay() {
    if (this._attemptedAutoplay || this._motionPreference.matches) {
      if (this._motionPreference.matches) {
        this._setState("paused");
        this._showMessage("동작 줄이기 설정으로 자동 재생을 멈췄습니다.");
      }
      return;
    }

    this._attemptedAutoplay = true;
    this._video.muted = true;
    this._reflectMutedState();

    try {
      await this._requestPlay();
    } catch {
      this._setState("paused");
      this._showMessage("재생 버튼을 눌러 승급 영상을 시작하세요.");
    }
  }

  async _requestPlay() {
    if (!this._video.getAttribute("src")) {
      this._handleError("티어 또는 영상 파일 경로를 지정하세요.");
      throw new Error("MatthsRankMotion: tier or src is required.");
    }

    try {
      await this._video.play();
    } catch (error) {
      this._setState("paused");
      this._showMessage("브라우저가 자동 재생을 막았습니다. 재생 버튼을 눌러주세요.");
      throw error;
    }
  }

  _handleMotionPreference() {
    if (this._motionPreference.matches && !this._userRequestedPlayback) {
      this.pause();
      this._showMessage("동작 줄이기 설정으로 자동 재생을 멈췄습니다.");
    }
  }

  _handleError(message = "승급 영상을 불러오지 못했습니다. 파일 경로를 확인하세요.") {
    this._setState("error");
    this._showMessage(message);
    this.dispatchEvent(
      new CustomEvent("rankmotionerror", {
        detail: { mediaError: this._video.error, tier: this.tier },
        bubbles: true,
      }),
    );
  }

  _setState(state) {
    this.dataset.state = state;
    this._playButton.setAttribute("aria-label", state === "playing" ? "일시정지" : "재생");
  }

  _reflectMutedState() {
    this.dataset.muted = String(this._video.muted);
    this._soundButton.setAttribute("aria-label", this._video.muted ? "소리 켜기" : "소리 끄기");
  }

  _booleanAttribute(name, fallback) {
    if (!this.hasAttribute(name)) return fallback;
    return this.getAttribute(name) !== "false";
  }

  _showMessage(text) {
    this._message.textContent = text;
    this._message.hidden = false;
  }

  _hideMessage() {
    this._message.hidden = true;
  }
}

if (!customElements.get("matths-rank-motion")) {
  customElements.define("matths-rank-motion", MatthsRankMotion);
}

export { MatthsRankMotion };
