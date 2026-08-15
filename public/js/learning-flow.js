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
        title: "필요한 수를 더하고 뺍니다.",
        body: "−4x의 절반인 −2를 제곱하면 4입니다.",
        input: "x² − 4x + 7",
        output: "x² − 4x + 4 + 3",
      },
      {
        title: "앞의 세 항을 묶습니다.",
        body: "x² − 4x + 4는 (x − 2)²입니다.",
        input: "x² − 4x + 4 + 3",
        output: "(x − 2)² + 3",
      },
      {
        title: "이제 그래프의 최솟값을 확인합니다.",
        body: "제곱식은 0 이상이므로 최솟값은 3입니다.",
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
        tone: "조금 헷갈렸습니다. 함께 다시 확인합니다.",
        helper: "괜찮습니다. Step 2부터 천천히 그림으로 다시 설명합니다.",
      },
      spicy: {
        label: "매운맛 모드",
        tone: "공식만 외우면 숫자가 바뀌는 순간 막힙니다.",
        helper: "바로 다시 확인합니다. 원리까지 이해하면 다음 숫자 변화에도 흔들리지 않습니다.<br />막힌 Step 2부터 다시 확인하세요.",
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

  function initProblemDemo() {
    const screen = document.querySelector(".problem-screen");
    const button = screen?.querySelector("[data-problem-check]");
    const feedback = document.getElementById("problem-demo-feedback");
    const correctAnswer = screen?.querySelector("[data-correct-answer]");

    if (!screen || !button || !feedback || !correctAnswer) return;

    button.addEventListener("click", () => {
      screen.classList.add("is-checked");
      correctAnswer.classList.add("is-correct");
      feedback.hidden = false;
      button.textContent = "정답입니다 ✓";
      button.disabled = true;
    });
  }

  function init() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    initFlowNavigation(reduceMotion);
    initJourneyAnimations();
    initReviewDemo(reduceMotion);
    initModeSelector();
    initProblemDemo();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
