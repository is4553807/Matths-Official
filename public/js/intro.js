(function () {
  "use strict";

  // (a+b)² 넓이 모델. 4단계의 목적은 마지막 한 줄이다 —
  // "ab 가 두 칸이라서 a²+b² 이 아니다" 를 그림으로 먼저 보여준다.
  const steps = [
    "한 변의 길이가 a+b인 정사각형입니다.",
    "가로와 세로를 각각 a와 b로 나눕니다.",
    "네 칸의 넓이는 a², ab, ab, b²입니다.",
    "ab가 두 칸이라서 a²+b²이 아닙니다.",
  ];

  function initCoachModeSelector() {
    const buttons = Array.from(document.querySelectorAll(".intro-coach-mode[data-coach-mode]"));
    const tone = document.getElementById("intro-coach-tone");
    const helper = document.getElementById("intro-coach-helper");
    if (!buttons.length || !tone || !helper) return;

    const modes = {
      mild: {
        tone: "조금 헷갈렸습니다. 조건부터 다시 확인합니다.",
        helper: "막힌 단계부터 그림으로 다시 안내합니다.",
      },
      spicy: {
        tone: "공식은 기억했지만 숫자가 바뀐 순간 막혔습니다.",
        helper: "바로 다시 확인합니다. 원리까지 이해하면 다음 숫자 변화에도 흔들리지 않습니다.",
      },
      silent: {
        tone: "필요한 풀이 단계만 조용히 안내합니다.",
        helper: "문구 대신 학습 흐름과 화면 안내만 표시합니다.",
      },
    };

    function selectMode(mode, save) {
      const selected = modes[mode] || modes.spicy;
      tone.textContent = selected.tone;
      helper.textContent = selected.helper;
      buttons.forEach((button) => {
        const active = button.dataset.coachMode === mode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      if (save) {
        try {
          window.localStorage.setItem("matths-learning-mode", mode);
        } catch (_error) {
          // The selector remains usable when private browsing blocks storage.
        }
      }
    }

    let selectedMode = "spicy";
    try {
      const stored = window.localStorage.getItem("matths-learning-mode");
      if (stored && modes[stored]) selectedMode = stored;
    } catch (_error) {
      // Keep the default mode when storage is unavailable.
    }
    buttons.forEach((button) => {
      button.addEventListener("click", () => selectMode(button.dataset.coachMode, true));
    });
    selectMode(selectedMode, false);
  }

  function init() {
    initCoachModeSelector();
    const demo = document.querySelector(".visual-demo[data-demo-step]");
    if (!demo) return;

    const title = document.getElementById("intro-demo-title");
    const stepLabel = document.getElementById("intro-demo-step");
    const buttons = Array.from(demo.querySelectorAll(".intro-step-button"));
    const playbackButton = demo.querySelector(".intro-playback-button");
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let currentStep = 1;
    let paused = false;
    let manuallyPaused = motionPreference.matches;
    let timer;

    function renderPlaybackControl() {
      if (!playbackButton) return;
      const label = playbackButton.querySelector("b");
      const symbol = playbackButton.querySelector("span");
      playbackButton.setAttribute("aria-pressed", String(manuallyPaused));
      playbackButton.setAttribute(
        "aria-label",
        manuallyPaused ? "시각화 자동 진행 시작하기" : "시각화 자동 진행 멈추기",
      );
      if (label) label.textContent = manuallyPaused ? "재생" : "멈춤";
      // 아이콘은 글리프(▶ / 로마숫자 Ⅱ) 대신 CSS 도형으로 그린다.
      if (symbol) symbol.classList.toggle("is-play", manuallyPaused);
    }

    function render(step) {
      currentStep = step;
      demo.classList.remove("is-changing");
      void demo.offsetWidth;
      demo.dataset.demoStep = String(step);
      demo.classList.add("is-changing");
      title.textContent = steps[step - 1];
      stepLabel.textContent = `${step} / ${steps.length}단계`;

      buttons.forEach((button) => {
        const isActive = Number(button.dataset.step) === step;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });
    }

    function schedule() {
      window.clearTimeout(timer);
      if (motionPreference.matches || manuallyPaused || paused) return;
      timer = window.setTimeout(() => {
        render((currentStep % steps.length) + 1);
        schedule();
      }, 3200);
    }

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        render(Number(button.dataset.step));
        schedule();
      });
    });

    playbackButton?.addEventListener("click", () => {
      manuallyPaused = !manuallyPaused;
      renderPlaybackControl();
      if (manuallyPaused) {
        window.clearTimeout(timer);
        return;
      }
      schedule();
    });

    motionPreference.addEventListener?.("change", (event) => {
      if (!event.matches) return;
      manuallyPaused = true;
      window.clearTimeout(timer);
      renderPlaybackControl();
    });

    demo.addEventListener("pointerenter", () => {
      paused = true;
      window.clearTimeout(timer);
    });
    demo.addEventListener("pointerleave", () => {
      paused = false;
      schedule();
    });
    demo.addEventListener("focusin", () => {
      paused = true;
      window.clearTimeout(timer);
    });
    demo.addEventListener("focusout", () => {
      window.setTimeout(() => {
        if (!demo.contains(document.activeElement)) {
          paused = false;
          schedule();
        }
      }, 0);
    });

    render(1);
    renderPlaybackControl();
    schedule();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
