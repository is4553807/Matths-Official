(function () {
  "use strict";

  const configElement = document.getElementById("arena-tutorial-config");
  const root = document.querySelector("[data-arena-tour]");
  if (!configElement || !root) return;

  let config;
  try {
    config = JSON.parse(configElement.textContent);
  } catch (_error) {
    return;
  }

  const chapterLabels = {
    common: "기본 안내",
    normal: "일반전",
    competitive: "경쟁전",
    friends: "친구",
  };
  const pageChapters = {
    "/goat-arena/sub": "normal",
    "/goat-arena/main": "competitive",
    "/goat-arena/friends": "friends",
  };
  const stepsByChapter = {
    common: [
      {
        path: "/goat-arena",
        selector: '[data-arena-tutorial-target="navigation"]',
        title: "일반전과 경쟁전을 선택합니다.",
        message: "일반전은 바로 시작하는 1대1 대결이고, 경쟁전은 레이팅과 티어를 겨루는 경기입니다.",
      },
      {
        path: "/goat-arena",
        selector: '[data-arena-tutorial-target="arena-home-hero"]',
        title: "다섯 문제로 실력을 겨룹니다.",
        message: "문항마다 10분 동안 문제를 풀고 풀이과정을 제출하면 상대와의 경기 결과를 확인할 수 있습니다.",
      },
      {
        path: "/goat-arena",
        selector: '[data-arena-tutorial-target="arena-seed-card"]',
        title: "경기 방식과 내 정보를 확인합니다.",
        message: "문항 수와 제한 시간을 확인하고 일반전 또는 경쟁전 메뉴에서 플레이를 시작할 수 있습니다.",
      },
    ],
    normal: [
      {
        path: "/goat-arena/sub",
        selector: '[data-arena-tutorial-target="division-hero"]',
        title: "일반전은 비슷한 실력의 유저와 대결합니다.",
        message: "비슷한 난도로 구성된 다섯 문제를 풀고 상대와 실력을 겨룹니다.",
      },
      {
        path: "/goat-arena/sub",
        selector: '[data-arena-tutorial-target="division-status"]',
        title: "승리 기준을 확인합니다.",
        message: "정오답과 문제 난도를 함께 반영한 내부 평가를 비교하고, 결과가 근소하면 풀이 시간이 짧은 쪽이 승리합니다.",
      },
    ],
    competitive: [
      {
        path: "/goat-arena/main",
        selector: '[data-arena-tutorial-target="division-hero"]',
        title: "경쟁전은 레이팅과 티어를 겨룹니다.",
        message: "비슷한 실력의 유저와 대결하고, 확정된 결과가 내 레이팅과 티어에 반영됩니다.",
      },
      {
        path: "/goat-arena/main",
        selector: '[data-arena-tutorial-target="division-status"]',
        title: "경쟁전 참가 과정을 확인합니다.",
        message: "유효한 일반전 세 경기와 배치고사를 완료하면 첫 레이팅과 티어가 정해집니다.",
      },
    ],
    friends: [
      {
        path: "/goat-arena/friends",
        selector: '[data-arena-tutorial-target="main-friendly"]',
        title: "친구와 부담 없이 대결합니다.",
        message: "친구를 닉네임으로 초대하거나 단체 도전장 링크를 공유해 같은 5문제의 순위를 만들 수 있습니다.",
      },
    ],
  };

  const params = new URLSearchParams(window.location.search);
  const explicitChapter = String(params.get("arenaTutorial") || "").toLowerCase();
  const explicitStep = Number.parseInt(params.get("arenaTutorialStep") || "0", 10);
  const available = Array.isArray(config.availableChapters)
    ? config.availableChapters
    : [];
  const pageChapter = pageChapters[window.location.pathname] || null;
  const pageChapterPending = pageChapter &&
    config.chapters?.[pageChapter]?.status === "PENDING";
  let chapter = null;

  if (
    stepsByChapter[explicitChapter] &&
    available.includes(explicitChapter) &&
    !config.suspended
  ) {
    chapter = explicitChapter;
  } else if (
    pageChapter &&
    pageChapterPending &&
    available.includes(pageChapter) &&
    !config.suspended
  ) {
    chapter = pageChapter;
  }
  if (!chapter) return;

  const steps = stepsByChapter[chapter];
  let stepIndex = explicitChapter === chapter && Number.isFinite(explicitStep)
    ? Math.max(0, Math.min(explicitStep, steps.length - 1))
    : 0;
  if (!document.querySelector(steps[stepIndex]?.selector)) return;
  let activeTarget = null;
  let frameTimer = null;
  let spotlightTrackingFrame = null;
  let lastTrackedRect = null;
  let characterFrame = 0;
  let busy = false;

  const spotlight = root.querySelector("[data-arena-tour-spotlight]");
  const dialog = root.querySelector("[data-arena-tour-dialog]");
  const progress = root.querySelector("[data-arena-tour-progress]");
  const title = root.querySelector("[data-arena-tour-title]");
  const message = root.querySelector("[data-arena-tour-message]");
  const status = root.querySelector("[data-arena-tour-status]");
  const nextButton = root.querySelector("[data-arena-tour-next]");
  const closeButton = root.querySelector("[data-arena-tour-close]");
  const character = root.querySelector("[data-arena-tour-character]");
  const characterImage = root.querySelector("[data-arena-tour-character-image]");
  const shades = Object.fromEntries(
    ["top", "right", "bottom", "left"].map((side) => [
      side,
      root.querySelector(`[data-arena-tour-shade="${side}"]`),
    ])
  );

  const characterNames = ["lumi", "max", "obi", "pi"];
  const characterName = characterNames[Math.floor(Math.random() * characterNames.length)];
  const characterFrames = [1, 2, 3].map(
    (frame) => `/images/coach-characters/${characterName}-talking-${frame}.webp`
  );
  characterFrames.forEach((src) => {
    const image = new Image();
    image.src = src;
  });

  function startCharacter() {
    characterImage.src = characterFrames[0];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    frameTimer = window.setInterval(() => {
      characterFrame = (characterFrame + 1) % characterFrames.length;
      character.classList.add("is-switching");
      window.setTimeout(() => {
        characterImage.src = characterFrames[characterFrame];
        character.classList.remove("is-switching");
      }, 90);
    }, 2000);
  }

  function clearTarget() {
    if (activeTarget) activeTarget.classList.remove("arena-tour-target");
    activeTarget = null;
    lastTrackedRect = null;
  }

  function setShade(element, values) {
    Object.entries(values).forEach(([property, value]) => {
      element.style[property] = `${Math.max(0, value)}px`;
    });
  }

  function positionDialog(rect) {
    dialog.classList.remove("is-left", "is-top");
    if (window.innerWidth <= 720) return;
    if (rect.right > window.innerWidth * 0.57 && rect.bottom > window.innerHeight * 0.55) {
      dialog.classList.add("is-left");
    }
    if (rect.top > window.innerHeight * 0.48) {
      dialog.classList.add("is-top");
    }
  }

  function positionSpotlight(target, attention) {
    const rect = target.getBoundingClientRect();
    const padding = window.innerWidth <= 720 ? 10 : 18;
    const left = Math.max(8, rect.left - padding);
    const top = Math.max(8, rect.top - padding);
    const right = Math.min(window.innerWidth - 8, rect.right + padding);
    const bottom = Math.min(window.innerHeight - 8, rect.bottom + padding);
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);

    setShade(shades.top, { left: 0, top: 0, width: window.innerWidth, height: top });
    setShade(shades.bottom, { left: 0, top: bottom, width: window.innerWidth, height: window.innerHeight - bottom });
    setShade(shades.left, { left: 0, top, width: left, height });
    setShade(shades.right, { left: right, top, width: window.innerWidth - right, height });

    Object.assign(spotlight.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      borderRadius: `${Math.min(30, Math.max(16, Math.round(Math.min(width, height) * 0.12)))}px`,
    });
    spotlight.classList.toggle("is-pulsing", Boolean(attention));
    spotlight.hidden = false;
    positionDialog({ left, top, right, bottom });
  }

  function trackedRect(target) {
    const rect = target.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    };
  }

  function rectChanged(previous, current) {
    if (!previous) return true;
    return ["left", "top", "right", "bottom"].some(
      (key) => Math.abs(previous[key] - current[key]) >= 0.5
    );
  }

  function trackSpotlight() {
    if (
      activeTarget &&
      !root.hidden &&
      !spotlight.hidden &&
      !root.classList.contains("is-positioning")
    ) {
      const currentRect = trackedRect(activeTarget);
      if (rectChanged(lastTrackedRect, currentRect)) {
        lastTrackedRect = currentRect;
        positionSpotlight(
          activeTarget,
          steps[stepIndex]?.attention !== false
        );
      }
    }
    spotlightTrackingFrame = window.requestAnimationFrame(trackSpotlight);
  }

  function waitForScroll() {
    return new Promise((resolve) => {
      const startedAt = performance.now();
      let lastMovementAt = startedAt;
      let previousY = window.scrollY;
      function inspect(now) {
        const currentY = window.scrollY;
        if (Math.abs(currentY - previousY) >= 1) {
          previousY = currentY;
          lastMovementAt = now;
        }
        if (
          (now - startedAt >= 180 && now - lastMovementAt >= 140) ||
          now - startedAt >= 1800
        ) {
          resolve();
          return;
        }
        window.requestAnimationFrame(inspect);
      }
      window.requestAnimationFrame(inspect);
    });
  }

  async function revealStep() {
    const step = steps[stepIndex];
    if (!step || window.location.pathname !== step.path) return;

    root.classList.add("is-positioning");
    clearTarget();
    spotlight.hidden = true;
    const target = document.querySelector(step.selector);
    if (!target) {
      closeTutorial();
      return;
    }

    const targetRect = target.getBoundingClientRect();
    const dialogReserve = window.innerWidth <= 720 ? 250 : 290;
    const visibleTop = targetRect.top >= 78;
    const visibleBottom = targetRect.bottom <= window.innerHeight - dialogReserve;
    if (!visibleTop || !visibleBottom) {
      target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
      });
      await waitForScroll();
    } else {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    }

    activeTarget = target;
    target.classList.add("arena-tour-target");
    lastTrackedRect = trackedRect(target);
    progress.textContent = `GOAT ARENA TOUR · ${chapterLabels[chapter]} · ${stepIndex + 1} / ${steps.length}`;
    title.textContent = step.title;
    message.textContent = step.message;
    status.textContent = "";
    nextButton.innerHTML = stepIndex === steps.length - 1
      ? '완료 <span aria-hidden="true">✓</span>'
      : '다음 <span aria-hidden="true">→</span>';
    positionSpotlight(target, step.attention !== false);
    window.requestAnimationFrame(() => root.classList.remove("is-positioning"));
  }

  async function postTutorial(action, targetChapter) {
    const response = await fetch("/api/goat-arena/tutorial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, chapter: targetChapter }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "튜토리얼 상태를 저장하지 못했습니다.");
    }
    return payload.tutorial || null;
  }

  function closeTutorial() {
    clearTarget();
    if (frameTimer) window.clearInterval(frameTimer);
    if (spotlightTrackingFrame) {
      window.cancelAnimationFrame(spotlightTrackingFrame);
      spotlightTrackingFrame = null;
    }
    root.hidden = true;
    root.classList.remove("is-positioning");
    document.body.classList.remove("arena-tour-active");
    const url = new URL(window.location.href);
    url.searchParams.delete("arenaTutorial");
    url.searchParams.delete("arenaTutorialStep");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async function finishChapter() {
    await postTutorial("COMPLETE", chapter);
    closeTutorial();
  }

  nextButton.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    nextButton.disabled = true;
    closeButton.disabled = true;
    try {
      if (stepIndex >= steps.length - 1) {
        await finishChapter();
        return;
      }
      stepIndex += 1;
      await revealStep();
    } catch (error) {
      status.textContent = error.message;
      root.classList.remove("is-positioning");
    } finally {
      busy = false;
      nextButton.disabled = false;
      closeButton.disabled = false;
    }
  });

  async function skipTutorial() {
    if (busy) return;
    busy = true;
    nextButton.disabled = true;
    closeButton.disabled = true;
    try {
      await postTutorial("SKIP", chapter);
      closeTutorial();
    } catch (error) {
      status.textContent = error.message;
      root.classList.remove("is-positioning");
      busy = false;
      nextButton.disabled = false;
      closeButton.disabled = false;
    }
  }

  closeButton.addEventListener("click", skipTutorial);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") skipTutorial();
  });
  window.addEventListener("resize", () => {
    if (activeTarget && !spotlight.hidden && !root.classList.contains("is-positioning")) {
      positionSpotlight(activeTarget, steps[stepIndex]?.attention !== false);
    }
  });

  root.hidden = false;
  root.classList.add("is-positioning");
  document.body.classList.add("arena-tour-active");
  startCharacter();
  spotlightTrackingFrame = window.requestAnimationFrame(trackSpotlight);
  revealStep();
})();
