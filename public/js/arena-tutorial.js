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
    unranked: "UNRANKED 전장",
    unranked_match: "UNRANKED 1대1",
    ranked: "RANKED 전장",
    ranked_battle: "RANKED 경기",
    ranked_shop: "RANKED 상점",
  };
  const pageChapters = {
    "/goat-arena/sub": "unranked",
    "/goat-arena/sub/challenge": "unranked_match",
    "/goat-arena/main": "ranked",
    "/goat-arena/main/battle": "ranked_battle",
    "/goat-arena/main/shop": "ranked_shop",
  };
  const stepsByChapter = {
    common: [
      {
        path: "/goat-arena",
        selector: '[data-arena-tutorial-target="navigation"]',
        title: "현재 내 전장에서 플레이를 시작합니다.",
        message: "Unranked와 Ranked는 서로 다른 전장입니다. 현재 내 Division 메뉴로 들어가면 실제로 이용할 수 있는 경기 기능만 볼 수 있습니다.",
      },
      {
        path: "/goat-arena",
        selector: '[data-arena-tutorial-target="arena-home-hero"]',
        title: "공식 1대1은 같은 다섯 문제로 겨룹니다.",
        message: "양쪽 사용자가 같은 문제를 문항당 10분 안에 풀고, 경기 결과에 따라 공개 티어·티어 안 순위·GP가 움직입니다.",
      },
      {
        path: "/goat-arena",
        selector: '[data-arena-tutorial-target="arena-seed-card"]',
        title: "내 현재 Arena 상태를 확인합니다.",
        message: "티어, 티어 안 순위, GP와 현재 Division이 표시됩니다. 다음 플레이는 상단의 현재 Division 메뉴에서 시작하면 됩니다.",
      },
    ],
    unranked: [
      {
        path: "/goat-arena/sub",
        selector: '[data-arena-tutorial-target="division-hero"]',
        title: "Unranked는 자동 배정 방식입니다.",
        message: "같은 티어의 내 위 순위를 먼저 찾고, 후보가 없을 때만 바로 위 티어까지 탐색합니다. 상대 닉네임을 직접 선택하지는 않습니다.",
      },
      {
        path: "/goat-arena/sub",
        selector: '[data-arena-tutorial-target="division-status"]',
        title: "신청 전에 내 이용 상태를 확인합니다.",
        message: "현재 이용 가능 여부, 내 티어 안 순위와 남은 학습 가능 일수가 표시됩니다. 기능이 잠겼다면 이곳에서 먼저 원인을 확인합니다.",
      },
      {
        path: "/goat-arena/sub",
        selector: '[data-arena-tutorial-target="division-group-battle"]',
        title: "여기서 일반 쟁탈전을 시작합니다.",
        message: "‘일반 쟁탈전 신청’을 누르면 자동 매치 화면으로 이동합니다. 이미 잡힌 공격·방어 경기는 ‘진행 중 경기’에서 이어서 풀고, 복수전 권리도 여기서 확인합니다.",
      },
      {
        path: "/goat-arena/sub",
        selector: '[data-arena-tutorial-target="division-group-record"]',
        title: "끝난 경기는 기록으로 남습니다.",
        message: "경기 상대와 승패, 경기 뒤 티어·순위·GP 변동을 다시 확인합니다. 정산이 확정된 기록만 표시됩니다.",
      },
      {
        path: "/goat-arena/sub",
        selector: '[data-arena-tutorial-target="division-group-progress"]',
        title: "페이백 점수와 공격 출석을 따로 확인합니다.",
        message: "경기에서 움직이는 페이백 점수와 이용 주기의 공격 출석일은 별도 조건입니다. 현재 수치와 남은 조건을 이 묶음에서 확인합니다.",
      },
    ],
    unranked_match: [
      {
        path: "/goat-arena/sub/challenge",
        selector: '[data-arena-tutorial-target="sub-challenge-hero"]',
        title: "서버가 가장 가까운 상위 후보를 찾습니다.",
        message: "같은 티어의 상위 순위를 우선 탐색하고 없으면 바로 위 티어로 넓힙니다. 최근 방어 부담도 고려해 한 명을 자동 배정합니다.",
      },
      {
        path: "/goat-arena/sub/challenge",
        selector: '[data-arena-tutorial-target="sub-challenge-status"]',
        title: "신청 전에 예치와 오늘의 참가 범위를 봅니다.",
        message: "내 Arena 상태, 이번 경기에서 거는 페이백 점수와 탐색 가능한 티어가 표시됩니다. 신청 제한 중이면 정확한 사유도 이 아래에 나옵니다.",
      },
      {
        path: "/goat-arena/sub/challenge",
        selector: '[data-arena-tutorial-target="sub-match-action"]',
        title: "가능한 행동 하나만 선택하면 됩니다.",
        message: "신청 가능할 때 ‘자동 매치 신청’을 누르면 상대 확정과 예치가 처리됩니다. 진행 중 경기가 있으면 이 자리의 버튼으로 경기 화면에 복귀합니다.",
      },
    ],
    ranked: [
      {
        path: "/goat-arena/main",
        selector: '[data-arena-tutorial-target="division-hero"]',
        title: "Ranked에서는 학습일수를 직접 운용합니다.",
        message: "상향 쟁탈전과 하위 티어 초대전에서 목표 티어와 학습일수를 정합니다. 특정 상대의 닉네임을 직접 고르는 방식은 아닙니다.",
      },
      {
        path: "/goat-arena/main",
        selector: '[data-arena-tutorial-target="division-status"]',
        title: "사용 가능한 학습일수부터 확인합니다.",
        message: "새 경기나 상점에 쓸 수 있는 일수만 표시됩니다. 초대 예약이나 진행 중 경기 예치분은 사용 가능 수치에서 빠집니다.",
      },
      {
        path: "/goat-arena/main",
        selector: '[data-arena-tutorial-target="division-group-battle"]',
        title: "경기 지휘에서 플레이 방식을 고릅니다.",
        message: "상향 쟁탈전·하위 티어 초대전·복수전·친선 경기 중 원하는 방식을 선택하고, 이미 시작된 경기는 ‘진행 중 경기’에서 이어서 풉니다.",
      },
      {
        path: "/goat-arena/main",
        selector: '[data-arena-tutorial-target="division-group-operations"]',
        title: "초대와 학습일수 이동을 관리합니다.",
        message: "받은 초대와 보낸 예약을 처리하고, 사용 가능·예약·경기 예치 학습일수와 이동 기록을 확인합니다.",
      },
      {
        path: "/goat-arena/main",
        selector: '[data-arena-tutorial-target="division-group-support"]',
        title: "확보한 학습일수는 상점에서도 사용합니다.",
        message: "경기 분석, 일정 보호와 프로필 효과가 필요하면 Ranked 상점으로 들어갑니다. 상점은 처음 들어갈 때 별도로 짧게 안내합니다.",
      },
    ],
    ranked_battle: [
      {
        path: "/goat-arena/main/battle",
        selector: '[data-arena-tutorial-target="main-battle-status"]',
        title: "새 경기 전에 현재 이용 가능 상태를 봅니다.",
        message: "진행 중 공식 경기, 부족한 학습일수나 이용 제한이 있으면 작전 카드가 잠기고 이 영역에 이유가 표시됩니다.",
      },
      {
        path: "/goat-arena/main/battle",
        selector: '[data-arena-tutorial-target="main-upward-operation"]',
        title: "상향 쟁탈전은 목표 티어를 정해 도전합니다.",
        message: "최대 세 티어 위까지 목표와 예치량을 선택하면 서버가 적격 상대를 무작위 배정합니다. 상대는 자동으로 경기에 참가합니다.",
      },
      {
        path: "/goat-arena/main/battle",
        selector: '[data-arena-tutorial-target="main-invite-operation"]',
        title: "하위 티어 초대전은 먼저 예약을 만듭니다.",
        message: "목표 하위 티어에 일괄 초대하고, 먼저 수락한 한 명과만 경기합니다. 수락이 완료되면 양쪽이 같은 학습일수를 예치합니다.",
      },
      {
        path: "/goat-arena/main/battle",
        selector: '[data-arena-tutorial-target="main-friendly"]',
        title: "친선전은 랭크 부담 없이 연습합니다.",
        message: "Ranked 사용자를 닉네임으로 초대하지만 티어·GP·학습일수는 이동하지 않습니다. 공식전과 별도로 관리됩니다.",
      },
      {
        path: "/goat-arena/main/battle",
        selector: '[data-arena-tutorial-target="main-invitations"]',
        title: "받은 초대와 보낸 예약을 여기서 처리합니다.",
        message: "받은 초대는 조건을 확인한 뒤 수락하거나 거절하고, 보낸 예약은 상대가 수락하기 전까지 상태와 취소 가능 여부를 확인합니다.",
      },
    ],
    ranked_shop: [
      {
        path: "/goat-arena/main/shop",
        selector: '[data-arena-tutorial-target="ranked-shop-wallet"]',
        title: "상점은 사용 가능한 학습일수로 이용합니다.",
        message: "초대 예약이나 경기 예치 중인 일수는 쓸 수 없습니다. 아이템을 고르기 전에 현재 사용 가능 잔액을 확인합니다.",
      },
      {
        path: "/goat-arena/main/shop",
        selector: '[data-arena-tutorial-target="ranked-shop-grid"]',
        title: "필요한 효과의 카드를 선택합니다.",
        message: "경기 분석·일정 보호·프로필 효과 등의 가격과 적용 범위를 확인하고 동의한 뒤 사용합니다. 적용된 효과는 화면 아래 기록에 남습니다.",
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

  const characterNames = ["goat", "pigeon", "llama"];
  const characterName = characterNames[Math.floor(Math.random() * characterNames.length)];
  const characterFrames = [1, 2, 3].map(
    (frame) => `/images/coach-characters/mild-${characterName}-${frame}.webp`
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
  revealStep();
})();
