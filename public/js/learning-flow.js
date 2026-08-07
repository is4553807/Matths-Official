(function () {
  "use strict";

  document.documentElement.classList.add("js-enabled");

  function initFlowNavigation(reduceMotion) {
    const flow = document.querySelector(".orbit-flow");
    const steps = flow ? Array.from(flow.querySelectorAll(".flow-step")) : [];
    if (!flow || !steps.length) return;

    let current = 0;
    let timer;
    let paused = false;

    function activate(index, shouldScroll) {
      current = index;
      steps.forEach((step, stepIndex) => {
        const isActive = stepIndex === index;
        step.classList.toggle("active", isActive);
        step.setAttribute("aria-pressed", String(isActive));
      });

      if (shouldScroll) {
        const target = document.getElementById(steps[index].dataset.target);
        target?.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "start",
        });
      }
    }

    function schedule() {
      window.clearTimeout(timer);
      if (reduceMotion || paused) return;
      timer = window.setTimeout(() => {
        activate((current + 1) % steps.length, false);
        schedule();
      }, 2600);
    }

    steps.forEach((step, index) => {
      step.addEventListener("click", () => {
        activate(index, true);
        schedule();
      });
      step.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activate(index, true);
        schedule();
      });
    });

    flow.addEventListener("pointerenter", () => {
      paused = true;
      window.clearTimeout(timer);
    });
    flow.addEventListener("pointerleave", () => {
      paused = false;
      schedule();
    });
    flow.addEventListener("focusin", () => {
      paused = true;
      window.clearTimeout(timer);
    });
    flow.addEventListener("focusout", () => {
      window.setTimeout(() => {
        if (!flow.contains(document.activeElement)) {
          paused = false;
          schedule();
        }
      }, 0);
    });

    activate(0, false);
    schedule();
  }

  function initJourneyAnimations() {
    const items = Array.from(document.querySelectorAll(".journey-item"));
    if (!("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -8%" },
    );

    items.forEach((item) => observer.observe(item));
  }

  function initReviewDemo(reduceMotion) {
    const review = document.querySelector(".review-screen");
    if (!review) return;

    const title = document.getElementById("review-title");
    const body = document.getElementById("review-body");
    const input = document.getElementById("review-input");
    const output = document.getElementById("review-output");
    const buttons = Array.from(review.querySelectorAll(".review-step-button"));
    const content = [
      {
        title: "필요한 수를 더하고 빼자.",
        body: "−4x의 절반인 −2를 제곱하면 4야.",
        input: "x² − 4x + 7",
        output: "x² − 4x + 4 + 3",
      },
      {
        title: "앞의 세 항을 묶어볼게.",
        body: "x² − 4x + 4는 (x − 2)²이야.",
        input: "x² − 4x + 4 + 3",
        output: "(x − 2)² + 3",
      },
      {
        title: "이제 그래프의 최솟값을 읽자.",
        body: "제곱식은 0 이상이므로 최솟값은 3이야.",
        input: "(x − 2)² + 3",
        output: "최솟값 3",
      },
    ];
    let current = 1;
    let timer;
    let paused = false;

    function render(step) {
      current = step;
      const value = content[step - 1];
      review.classList.remove("is-changing");
      void review.offsetWidth;
      review.dataset.reviewStep = String(step);
      review.classList.add("is-changing");
      title.textContent = value.title;
      body.textContent = value.body;
      input.textContent = value.input;
      output.textContent = value.output;

      buttons.forEach((button) => {
        const isActive = Number(button.dataset.reviewStep) === step;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });
    }

    function schedule() {
      window.clearTimeout(timer);
      if (reduceMotion || paused) return;
      timer = window.setTimeout(() => {
        render((current % content.length) + 1);
        schedule();
      }, 3000);
    }

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        render(Number(button.dataset.reviewStep));
        schedule();
      });
    });
    review.addEventListener("pointerenter", () => {
      paused = true;
      window.clearTimeout(timer);
    });
    review.addEventListener("pointerleave", () => {
      paused = false;
      schedule();
    });
    review.addEventListener("focusin", () => {
      paused = true;
      window.clearTimeout(timer);
    });
    review.addEventListener("focusout", () => {
      window.setTimeout(() => {
        if (!review.contains(document.activeElement)) {
          paused = false;
          schedule();
        }
      }, 0);
    });

    render(1);
    schedule();
  }

  function initModeSelector() {
    const card = document.querySelector(".coach-card[data-mode]");
    if (!card) return;

    const label = document.getElementById("coach-mode-label");
    const tone = document.getElementById("coach-tone-message");
    const helper = document.getElementById("coach-helper-message");
    const buttons = Array.from(card.querySelectorAll(".mode-button"));
    const modes = {
      mild: {
        label: "순한맛 모드",
        tone: "조금 헷갈렸네. 같이 다시 확인해 보자.",
        helper: "괜찮아. Step 2부터 천천히 그림으로 다시 설명해 줄게.",
      },
      spicy: {
        label: "매운맛 모드",
        tone: "공식만 외운 거, 숫자 바뀌자마자 들켰네.",
        helper: "바로 다시 잡자. 원리까지 이해하면 다음 숫자 변화에도 흔들리지 않아.<br />네가 막힌 Step 2부터 다시 보자.",
      },
      silent: {
        label: "무음 모드",
        tone: "",
        helper: "Step 2부터 시각적 풀이를 시작합니다.",
      },
    };

    function selectMode(mode, save) {
      const content = modes[mode] || modes.spicy;
      card.dataset.mode = mode;
      label.textContent = content.label;
      tone.textContent = content.tone;
      helper.innerHTML = content.helper;

      buttons.forEach((button) => {
        const isActive = button.dataset.mode === mode;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });

      if (save) {
        try {
          window.localStorage.setItem("matths-learning-mode", mode);
        } catch (error) {
          // Storage can be unavailable in privacy mode; the selector still works.
        }
      }
    }

    let savedMode = "spicy";
    try {
      const stored = window.localStorage.getItem("matths-learning-mode");
      if (stored && modes[stored]) savedMode = stored;
    } catch (error) {
      // Use the default mode when storage is unavailable.
    }

    buttons.forEach((button) => {
      button.addEventListener("click", () => selectMode(button.dataset.mode, true));
    });
    selectMode(savedMode, false);
  }

  function init() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    initFlowNavigation(reduceMotion);
    initJourneyAnimations();
    initReviewDemo(reduceMotion);
    initModeSelector();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
