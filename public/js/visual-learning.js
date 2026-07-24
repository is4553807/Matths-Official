(function () {
  "use strict";

  const steps = [
    {
      topic: "먼저, 원 하나를 확인합니다.",
      footer: "반지름이 r인 원에서 시작합니다.",
    },
    {
      topic: "원을 같은 크기의 부채꼴로 나눕니다.",
      footer: "조각이 많아질수록 재배열이 정교해져요.",
    },
    {
      topic: "조각을 번갈아 재배열합니다.",
      footer: "원의 조각이 직사각형에 가까워져요.",
    },
    {
      topic: "원의 둘레가 왜 밑변 πr이 되는지 확인합니다.",
      footer: "둘레 2πr의 절반이 밑변 πr, 반지름 r이 높이가 됩니다.",
    },
  ];

  function init() {
    const demo = document.querySelector(".demo-window");
    if (!demo) return;

    const topic = document.getElementById("demo-topic");
    const stepLabel = document.getElementById("demo-step-label");
    const footer = document.getElementById("demo-footer-text");
    const buttons = Array.from(demo.querySelectorAll(".demo-step-button"));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let currentStep = 1;
    let timer;
    let paused = false;

    function render(step) {
      currentStep = step;
      const content = steps[step - 1];

      demo.classList.remove("is-changing");
      void demo.offsetWidth;
      demo.dataset.currentStep = String(step);
      demo.classList.add("is-changing");

      topic.textContent = content.topic;
      stepLabel.textContent = `STEP ${step} / ${steps.length}`;
      footer.textContent = content.footer;

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
