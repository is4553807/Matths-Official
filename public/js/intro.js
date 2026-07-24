(function () {
  "use strict";

  const steps = [
    "반지름이 r인 원에서 시작합니다.",
    "원을 같은 크기의 부채꼴로 나눕니다.",
    "조각을 번갈아 놓아 사각형에 가깝게 만듭니다.",
    "둘레 2πr의 절반이 밑변 πr이 됩니다.",
  ];

  function init() {
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
