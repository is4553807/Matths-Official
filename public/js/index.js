document.addEventListener("DOMContentLoaded", () => {
  const lessonWindow = document.querySelector(".lesson-window[data-current-step]");

  if (!lessonWindow) return;

  const stepButtons = Array.from(
    lessonWindow.querySelectorAll(".step-button[data-step]")
  );
  const stepLabel = document.getElementById("lesson-step-label");
  const stepTitle = document.getElementById("lesson-step-title");
  const formula = document.getElementById("lesson-formula");
  const formulaHint = document.getElementById("lesson-formula-hint");
  const pointLabel = document.getElementById("lesson-point-label");
  const coachTitle = document.getElementById("lesson-coach-title");
  const coachBody = document.getElementById("lesson-coach-body");

  const steps = [
    {
      title: "먼저, 기본 그래프를 확인합니다.",
      formula: "y = x²",
      formulaHint: "꼭짓점은 (0, 0)",
      pointLabel: "(0, 0)",
      coachTitle: "출발점을 먼저 기억하세요.",
      coachBody: "y = x²의 꼭짓점은 원점입니다.",
    },
    {
      title: "x 대신 x − 2가 들어가면?",
      formula: "y = (x − 2)²",
      formulaHint: "그래프가 오른쪽으로 2 이동",
      pointLabel: "(2, 0)",
      coachTitle: "x의 변화부터 확인하세요.",
      coachBody: "x − 2는 그래프를 오른쪽으로 2만큼 옮깁니다.",
    },
    {
      title: "+1은 그래프를 어디로 옮길까요?",
      formula: "y = (x − 2)² + 1",
      formulaHint: "그래프가 위로 1 이동",
      pointLabel: "(2, 1)",
      coachTitle: "이제 식 전체에 +1이 붙습니다.",
      coachBody: "그래프의 모든 점이 위로 1만큼 움직입니다.",
    },
    {
      title: "그래프의 꼭짓점을 확인합니다.",
      formula: "y = (x − 2)² + 1",
      formulaHint: "최종 꼭짓점은 (2, 1)",
      pointLabel: "(2, 1)",
      coachTitle: "식의 변화를 확인하세요.",
      coachBody: "오른쪽으로 2, 위로 1만큼 이동하므로 꼭짓점은 (2, 1)입니다.",
    },
  ];

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let currentStep = 1;
  let autoplayTimer = null;
  let isPaused = false;

  const renderStep = (step) => {
    const safeStep = Math.min(Math.max(Number(step) || 1, 1), steps.length);
    const content = steps[safeStep - 1];

    currentStep = safeStep;
    lessonWindow.dataset.currentStep = String(safeStep);
    stepLabel.textContent = `STEP ${safeStep} / ${steps.length}`;
    stepTitle.textContent = content.title;
    formula.textContent = content.formula;
    formulaHint.textContent = content.formulaHint;
    pointLabel.textContent = content.pointLabel;
    coachTitle.textContent = content.coachTitle;
    coachBody.textContent = content.coachBody;

    stepButtons.forEach((button) => {
      const isActive = Number(button.dataset.step) === safeStep;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  };

  const stopAutoplay = () => {
    window.clearTimeout(autoplayTimer);
    autoplayTimer = null;
  };

  const scheduleAutoplay = () => {
    stopAutoplay();

    if (isPaused || reduceMotion.matches || document.hidden) return;

    autoplayTimer = window.setTimeout(() => {
      renderStep((currentStep % steps.length) + 1);
      scheduleAutoplay();
    }, 3200);
  };

  stepButtons.forEach((button) => {
    button.addEventListener("click", () => {
      renderStep(button.dataset.step);
      scheduleAutoplay();
    });
  });

  lessonWindow.addEventListener("mouseenter", () => {
    isPaused = true;
    stopAutoplay();
  });

  lessonWindow.addEventListener("mouseleave", () => {
    isPaused = false;
    scheduleAutoplay();
  });

  lessonWindow.addEventListener("focusin", () => {
    isPaused = true;
    stopAutoplay();
  });

  lessonWindow.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!lessonWindow.contains(document.activeElement)) {
        isPaused = false;
        scheduleAutoplay();
      }
    }, 0);
  });

  document.addEventListener("visibilitychange", scheduleAutoplay);
  reduceMotion.addEventListener?.("change", scheduleAutoplay);

  renderStep(1);
  scheduleAutoplay();
});
