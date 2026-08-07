(function () {
  "use strict";

  const steps = [
    "반지름이 r인 원에서 시작합니다.",
    "원을 같은 크기의 부채꼴로 나눕니다.",
    "조각을 번갈아 놓아 사각형에 가깝게 만듭니다.",
    "둘레 2πr의 절반이 밑변 πr이 됩니다.",
  ];

  function initCoachModeSelector() {
    const buttons = Array.from(document.querySelectorAll(".intro-coach-mode[data-coach-mode]"));
    const tone = document.getElementById("intro-coach-tone");
    const helper = document.getElementById("intro-coach-helper");
    if (!buttons.length || !tone || !helper) return;

    const modes = {
      mild: {
        tone: "조금 헷갈렸네. 조건부터 다시 확인해 보자.",
        helper: "괜찮아. 막힌 Step부터 그림으로 다시 보여줄게.",
      },
      spicy: {
        tone: "공식만 외운 거, 숫자 바뀌자마자 들켰네.",
        helper: "바로 다시 잡자. 원리까지 이해하면 다음 숫자 변화에도 흔들리지 않아.",
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
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let currentStep = 1;
    let paused = false;
    let timer;

    function render(step) {
      currentStep = step;
      demo.classList.remove("is-changing");
      void demo.offsetWidth;
      demo.dataset.demoStep = String(step);
      demo.classList.add("is-changing");
      title.textContent = steps[step - 1];
      stepLabel.textContent = `STEP ${step} / ${steps.length}`;

      buttons.forEach((button) => {
        const isActive = Number(button.dataset.step) === step;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });
    }

    function schedule() {
      window.clearTimeout(timer);
      if (reduceMotion || paused) return;
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
    schedule();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
