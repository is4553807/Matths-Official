(function () {
  "use strict";

  const configElement = document.getElementById(
    "onboarding-tutorial-config"
  );
  const root = document.querySelector(
    "[data-onboarding-tutorial]"
  );

  if (!configElement || !root) return;

  let config;
  try {
    config = JSON.parse(configElement.textContent);
  } catch (_error) {
    return;
  }

  if (
    config.status !== "PENDING" ||
    !config.shouldAutoStart
  ) {
    return;
  }

  const steps = [
    {
      path: "/main",
      selector: '[data-tutorial-target="dashboard-welcome"]',
      title: "학습 홈에서 오늘 상태를 확인합니다.",
      message:
        "로그인하면 가장 먼저 보이는 화면입니다. 연속 학습일과 새 알림을 확인하고, 우측 알림 버튼에서 경기·학습 안내를 열 수 있습니다.",
    },
    {
      path: "/main",
      selector: '[data-tutorial-target="dashboard-coach"]',
      fallbackSelector: '[data-tutorial-target="dashboard-welcome"]',
      title: "오늘의 코치가 학습 시작을 돕습니다.",
      message:
        "프로필에서 선택한 순한맛·매운맛 설정에 맞춰 공부를 시작하게 만드는 문구가 표시됩니다. 화면을 새로 열 때마다 다른 문구와 캐릭터를 만날 수 있습니다.",
    },
    {
      path: "/main",
      selector: '[data-tutorial-target="usage-plan"]',
      title: "이용 중인 학습권을 확인합니다.",
      message:
        "남은 학습일수와 이용 기간, 지금 사용할 수 있는 기능이 이곳에 정리되어 있습니다.",
    },
    {
      path: "/main",
      selector: '[data-tutorial-target="weekly-record"]',
      title: "학습 기록은 자동으로 쌓입니다.",
      message:
        "최근 7일 학습 시간, 오늘 학습량, 푼 문제 수와 정답률이 자동으로 집계됩니다. 공부 흐름이 끊기거나 늘어난 시점을 여기서 확인합니다.",
    },
    {
      path: "/main",
      selector: '[data-tutorial-nav="my-learning"]',
      attention: true,
      title: "이제 ‘내 학습’으로 이동합니다.",
      message:
        "과목과 개념을 직접 공부하는 곳입니다. 아래 ‘다음’을 누르면 자동으로 이동합니다.",
    },
    {
      path: "/my-learning",
      selector: '[data-tutorial-target="learning-summary"]',
      title: "내 학습에서 실제 공부를 시작합니다.",
      message:
        "현재 과목 완성도와 완료·남은 개념 수를 확인합니다. ‘이어서 학습하기’를 누르면 마지막으로 공부하던 개념으로 바로 이동합니다.",
    },
    {
      path: "/my-learning",
      selector: '[data-tutorial-target="course-progress"]',
      fallbackSelector: '[data-tutorial-target="learning-summary"]',
      attention: true,
      title: "과목·대단원·개념 순서로 들어갑니다.",
      message:
        "위에서 과목을 고르고 대단원을 펼친 뒤 개념의 ‘학습 시작’ 또는 ‘이어서 학습’을 누릅니다. 체크한 학습 항목은 이 진도에 즉시 반영됩니다.",
    },
    {
      path: "/my-learning",
      selector: '[data-tutorial-nav="curriculum"]',
      attention: true,
      title: "‘교육과정’ 탭입니다.",
      message:
        "2022 개정 교육과정의 수학 과목과 과목 유형을 확인하고, 앞으로 학습할 과목을 찾을 수 있습니다.",
    },
    {
      path: "/log-curriculum",
      selector: '[data-tutorial-target="curriculum-overview"]',
      title: "교육과정 전체와 내 완성도를 확인합니다.",
      message:
        "공통수학부터 선택과목까지 전체 구조가 표시됩니다. 우측 원형 진도에서 완료 개념, 남은 개념과 전체 제공 과목 수를 확인합니다.",
    },
    {
      path: "/log-curriculum",
      selector: '[data-tutorial-target="curriculum-categories"]',
      attention: true,
      title: "과목 유형 바로가기로 원하는 영역을 찾습니다.",
      message:
        "공통·일반 선택·진로 선택·융합 선택 영역을 누르면 해당 과목 묶음으로 이동합니다. 각 카드에서 과목 수와 현재 진도를 함께 확인합니다.",
    },
    {
      path: "/log-curriculum",
      selector: '[data-tutorial-target="curriculum-course"]',
      fallbackSelector: '[data-tutorial-target="curriculum-categories"]',
      attention: true,
      title: "과목을 펼쳐 대단원과 개념을 선택합니다.",
      message:
        "과목별 진행률 아래에서 대단원을 펼치면 개념 카드가 나타납니다. 각 카드의 성취기준과 학습 주제를 확인한 뒤 학습을 시작합니다.",
    },
    {
      path: "/log-curriculum",
      selector: '[data-tutorial-nav="quick-practice"]',
      attention: true,
      title: "다음은 40초 눈풀이를 직접 살펴봅니다.",
      message:
        "짧은 시간 안에 기본 유형을 처리하는 훈련입니다. ‘다음’을 누르면 실제 선택 화면과 문제 영역으로 이동합니다.",
    },
    {
      path: "/quick-practice",
      selector: '[data-tutorial-target="quick-overview"]',
      title: "먼저 눈풀이 기록을 확인합니다.",
      message:
        "누적 풀이 수, 정답률과 평균 풀이 시간이 표시됩니다. 같은 유형도 숫자가 달라지므로 반복할수록 계산 속도를 비교할 수 있습니다.",
    },
    {
      path: "/quick-practice",
      selector: '[data-tutorial-target="quick-controls"]',
      attention: true,
      title: "배점을 선택하고 문제를 시작합니다.",
      message:
        "2점, 3점 또는 섞어서를 선택한 뒤 ‘문제 시작’을 누릅니다. 유형표를 펼치면 현재 출제되는 문제 구조도 미리 볼 수 있습니다.",
    },
    {
      path: "/quick-practice",
      selector: '[data-tutorial-target="quick-problem"]',
      attention: true,
      title: "문제가 열리면 40초 안에 답만 입력합니다.",
      message:
        "문제 시작과 동시에 타이머가 흐릅니다. 정답 제출 후 결과, 풀이와 코치 피드백을 확인하고 ‘다음 문제’로 반복합니다.",
    },
    {
      path: "/quick-practice",
      selector: '[data-tutorial-nav="assessments"]',
      attention: true,
      title: "이제 평가 센터의 응시 구조를 확인합니다.",
      message:
        "학습 완료 여부에 따라 평가가 순서대로 열립니다. ‘다음’을 누르면 실제 통과 기준과 응시 버튼을 보여드립니다.",
    },
    {
      path: "/assessments",
      selector: '[data-tutorial-target="assessment-overview"]',
      title: "평가는 배운 범위 안에서만 열립니다.",
      message:
        "개념 학습을 완료하면 소단원 평가부터 응시할 수 있습니다. 아직 조건을 충족하지 못한 과목은 잠금 상태와 필요한 학습 조건이 표시됩니다.",
    },
    {
      path: "/assessments",
      selector: '[data-tutorial-target="assessment-rules"]',
      title: "통과 기준을 충족해야 최종 완료됩니다.",
      message:
        "화면에 표시된 기준 점수 이상을 받아야 대단원과 과목이 완료로 기록됩니다. 미통과한 평가는 새 회차로 다시 응시할 수 있습니다.",
    },
    {
      path: "/assessments",
      selector: '[data-tutorial-target="assessment-course"]',
      fallbackSelector: '[data-tutorial-target="assessment-overview"]',
      attention: true,
      title: "과목을 펼쳐 응시 가능한 평가를 찾습니다.",
      message:
        "과목 제목을 펼치면 소단원 중간평가, 대단원 기말평가, 과목 종합평가가 순서대로 나타납니다. 진행 중인 시험은 ‘이어서 응시’로 돌아갑니다.",
    },
    {
      path: "/assessments",
      selector: '[data-tutorial-nav="wrong-notes"]',
      attention: true,
      title: "틀린 문제는 오답 노트에서 다시 봅니다.",
      message:
        "학습과 평가에서 생긴 오답이 어떻게 정리되는지 실제 화면으로 이동해 확인합니다.",
    },
    {
      path: "/wrong-notes",
      selector: '[data-tutorial-target="wrong-overview"]',
      title: "오답과 오늘 복습량이 자동으로 정리됩니다.",
      message:
        "전체 오답, 복습 대기, 예정, 완료 수와 지금 복습해야 할 문제 수가 요약됩니다. 우선 복습할 분량을 이 영역에서 판단합니다.",
    },
    {
      path: "/wrong-notes",
      selector: '[data-tutorial-target="wrong-status-tabs"]',
      attention: true,
      title: "복습 상태별로 문제를 나눠 봅니다.",
      message:
        "전체·복습 대기·복습 예정·복습 완료 탭을 눌러 필요한 문제만 볼 수 있습니다. 각 탭의 숫자는 해당 상태의 문제 수입니다.",
    },
    {
      path: "/wrong-notes",
      selector: '[data-tutorial-target="wrong-filter"]',
      attention: true,
      title: "과목·검색어·정렬 조건으로 좁힙니다.",
      message:
        "특정 과목이나 문제를 찾고, 복습 우선순위 또는 최근 오답 순으로 정렬한 뒤 ‘필터 적용’을 누릅니다.",
    },
    {
      path: "/wrong-notes",
      selector: '[data-tutorial-target="wrong-results"]',
      title: "문제별 기록과 복습 버튼을 확인합니다.",
      message:
        "각 오답에는 출처, 난이도, 이전 답안과 복습 상태가 표시됩니다. 저장된 문제가 있으면 ‘다시 풀기’로 복습하고, 없으면 학습을 시작하면 됩니다.",
    },
    {
      path: "/wrong-notes",
      selector: '[data-tutorial-nav="war-of-masters"]',
      attention: true,
      title: "다음은 GOAT Arena의 경쟁 기능입니다.",
      message:
        "1대1 매치뿐 아니라 배치고사, 공식 모의고사와 랭킹까지 실제 메뉴별로 살펴봅니다.",
    },
    {
      path: "/war-of-masters",
      selector: '[data-tutorial-target="arena-match"]',
      attention: true,
      title: "GOAT Arena에서 1대1 매치를 시작합니다.",
      message:
        "상대에게 도전하거나 받은 방어 매치에 응답하는 공간입니다. Arena 입장 버튼을 누르면 현재 티어와 매치 상태를 확인할 수 있습니다.",
    },
    {
      path: "/war-of-masters",
      selector: '[data-tutorial-target="arena-placement"]',
      attention: true,
      title: "배치고사로 초기 실력을 측정합니다.",
      message:
        "배치고사 이용 조건과 진행 상태가 표시됩니다. 응시할 수 있을 때 시작 버튼을 누르면 제한 시간과 규칙을 확인한 뒤 시험이 시작됩니다.",
    },
    {
      path: "/war-of-masters",
      selector: '[data-tutorial-target="arena-official-mock"]',
      attention: true,
      title: "주간 공식 모의고사에 응시합니다.",
      message:
        "운영 일정과 응시 가능 여부를 확인하는 곳입니다. 이용 조건을 충족하면 공식 모의고사 페이지로 이동할 수 있습니다.",
    },
    {
      path: "/war-of-masters",
      selector: '[data-tutorial-target="arena-ranking"]',
      attention: true,
      title: "랭킹에서 전체 경쟁 위치를 확인합니다.",
      message:
        "최종 종합 랭킹과 고등학교·N수생 랭킹을 확인합니다. 공개 화면에는 실명 대신 설정한 닉네임과 프로필 사진이 표시됩니다.",
    },
    {
      path: "/war-of-masters",
      selector: '[data-tutorial-target="arena-identity"]',
      attention: true,
      title: "공개 닉네임은 프로필에서 관리합니다.",
      message:
        "1대1 매치와 랭킹에서 사용할 닉네임을 확인하거나 변경합니다. 학교·실명 등 개인 정보는 상대에게 공개되지 않습니다.",
    },
    {
      path: "/war-of-masters",
      selector: '[data-tutorial-target="arena-objection"]',
      attention: true,
      title: "문제나 정답에 이상이 있으면 이의신청합니다.",
      message:
        "공식 모의고사 문항이나 정답이 잘못되었다고 판단되면 근거와 함께 접수합니다. 검토 결과는 이메일과 알림으로 안내됩니다.",
    },
    {
      path: "/war-of-masters",
      selector: '[data-tutorial-nav="store"]',
      attention: true,
      title: "이제 고2·고3 수험관으로 이동합니다.",
      message:
        "N제, 데일리 하프와 실전 콘텐츠를 고르고 진행 기록을 남기는 방법을 확인합니다.",
    },
    {
      path: "/store",
      selector: '[data-tutorial-target="store-overview"]',
      title: "수험관은 실전용 콘텐츠를 모아 둔 공간입니다.",
      message:
        "오늘 풀 문제부터 수능 직전 파이널까지 제공됩니다. 우측 현재 영역에서 선택한 콘텐츠 종류와 설명을 확인합니다.",
    },
    {
      path: "/store",
      selector: '[data-tutorial-target="store-tabs"]',
      attention: true,
      title: "콘텐츠 종류를 먼저 선택합니다.",
      message:
        "N제, 데일리 하프, 실전 모의고사와 파이널 등 원하는 탭을 누르면 해당 목록으로 전환됩니다.",
    },
    {
      path: "/store",
      selector: '[data-tutorial-target="store-continue"]',
      fallbackSelector: '[data-tutorial-target="store-catalog"]',
      attention: true,
      title: "진행 중인 콘텐츠는 바로 이어서 풉니다.",
      message:
        "저장된 학습이 있으면 마지막 문항과 진행률이 표시됩니다. ‘이어 하기’를 누르면 작성하던 지점으로 돌아갑니다.",
    },
    {
      path: "/store",
      selector: '[data-tutorial-target="store-catalog"]',
      attention: true,
      title: "콘텐츠 카드에서 구성과 진행률을 확인합니다.",
      message:
        "문항 수, 제한 시간, 권장 기간과 현재 진행률을 확인한 뒤 카드를 누릅니다. 풀던 콘텐츠와 제출한 콘텐츠의 상태도 계속 저장됩니다.",
    },
    {
      path: "/store",
      selector: '[data-tutorial-nav="coach-suggestions"]',
      attention: true,
      title: "마지막 탭은 문구 제안소입니다.",
      message:
        "코치가 실제로 사용할 학습 문구를 제안하고 검수 상태를 확인하는 방법을 살펴봅니다.",
    },
    {
      path: "/coach-suggestions",
      selector: '[data-tutorial-target="suggestion-overview"]',
      title: "문구 제안 원칙을 먼저 확인합니다.",
      message:
        "학습을 다시 시작하게 만드는 문장을 제안하는 곳입니다. 특정 학생 공격, 개인정보, 광고성 내용 등 승인되지 않는 기준도 함께 안내됩니다.",
    },
    {
      path: "/coach-suggestions",
      selector: '[data-tutorial-target="suggestion-form"]',
      attention: true,
      title: "모드와 노출 상황을 골라 문구를 작성합니다.",
      message:
        "순한맛·매운맛·무음 중 코치 모드와 정답·오답·미응답 상황을 선택하고 문구를 입력한 뒤 ‘검수 요청하기’를 누릅니다.",
    },
    {
      path: "/coach-suggestions",
      selector: '[data-tutorial-target="suggestion-status"]',
      title: "내가 제출한 문구의 상태를 확인합니다.",
      message:
        "검수 대기, 사용 중 또는 반려 상태가 표시됩니다. 반려된 문구에는 수정에 참고할 수 있는 사유가 함께 표시됩니다.",
    },
    {
      path: "/coach-suggestions",
      selector: '[data-tutorial-target="suggestion-approved"]',
      title: "승인된 문구는 실제 코치 피드백에 추가됩니다.",
      message:
        "학생이 만든 승인 문구와 작성자를 확인할 수 있습니다. 승인된 문구는 해당 모드와 상황의 피드백 후보로 사용됩니다.",
    },
    {
      path: "/coach-suggestions",
      selector: ".sidebar-profile",
      attention: true,
      title: "프로필에서 개인 설정과 튜토리얼을 관리합니다.",
      message:
        "프로필 사진, 닉네임, 코치 모드와 학교 정보를 변경할 수 있습니다. 나중에 다시 보고 싶으면 프로필의 ‘튜토리얼 시작하기’를 누르면 됩니다.",
    },
  ];

  const title = root.querySelector("[data-tutorial-title]");
  const message = root.querySelector("[data-tutorial-message]");
  const progress = root.querySelector("[data-tutorial-progress]");
  const status = root.querySelector("[data-tutorial-status]");
  const nextButton = root.querySelector("[data-tutorial-next]");
  const skipButton = root.querySelector("[data-tutorial-skip]");
  const spotlight = root.querySelector("[data-tutorial-spotlight]");
  const dialog = root.querySelector(".matths-tutorial-dialog");
  const character = root.querySelector("[data-tutorial-character]");
  const characterImage = root.querySelector(
    "[data-tutorial-character-image]"
  );
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  const characterNames = ["goat", "pigeon", "llama"];
  const characterName =
    characterNames[
      Math.floor(Math.random() * characterNames.length)
    ];
  const characterSources = [1, 2, 3].map(
    (frame) =>
      `/images/coach-characters/mild-${characterName}-${frame}.webp`
  );
  let characterFrame = 0;
  let characterTimer = null;
  let characterSwapTimer = null;
  let highlightedTarget = null;
  let currentIndex = -1;
  let tutorialOpenedSidebar = false;
  let tutorialExpandedSidebar = false;
  let resizeFrame = null;
  let revealRequest = 0;
  let tutorialScrollSpacer = null;
  let tutorialScrollTarget = null;

  characterSources.forEach((source) => {
    const image = new Image();
    image.src = source;
  });
  if (characterImage) characterImage.src = characterSources[0];

  function stopCharacter() {
    if (characterTimer) window.clearInterval(characterTimer);
    if (characterSwapTimer) window.clearTimeout(characterSwapTimer);
    characterTimer = null;
    characterSwapTimer = null;
    character?.classList.remove("is-switching");
  }

  function startCharacter() {
    stopCharacter();
    if (reducedMotion || document.hidden || !characterImage) return;

    characterTimer = window.setInterval(() => {
      character?.classList.add("is-switching");
      characterSwapTimer = window.setTimeout(() => {
        characterFrame =
          (characterFrame + 1) % characterSources.length;
        characterImage.src = characterSources[characterFrame];
        window.requestAnimationFrame(() => {
          character?.classList.remove("is-switching");
        });
      }, 120);
    }, 2000);
  }

  function restoreSidebar() {
    const sidebar = document.getElementById("dashboard-sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    if (!sidebar) return;

    if (tutorialOpenedSidebar) {
      sidebar.classList.remove("open");
      if (overlay) overlay.hidden = true;
      document.body.classList.remove("sidebar-visible");
      tutorialOpenedSidebar = false;
    }
    if (tutorialExpandedSidebar) {
      sidebar.classList.add("collapsed");
      document.body.classList.add("dashboard-sidebar-collapsed");
      tutorialExpandedSidebar = false;
    }
  }

  function prepareSidebar(target) {
    restoreSidebar();
    const sidebar = document.getElementById("dashboard-sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    if (!sidebar || !target || !sidebar.contains(target)) return;

    if (document.body.classList.contains("dashboard-sidebar-collapsed")) {
      tutorialExpandedSidebar = true;
      sidebar.classList.remove("collapsed");
      document.body.classList.remove("dashboard-sidebar-collapsed");
    }

    if (window.innerWidth <= 900 && !sidebar.classList.contains("open")) {
      tutorialOpenedSidebar = true;
      sidebar.classList.add("open");
      if (overlay) overlay.hidden = true;
      document.body.classList.add("sidebar-visible");
    }
  }

  function clearHighlight() {
    revealRequest += 1;
    if (tutorialScrollTarget) {
      tutorialScrollTarget.classList.remove(
        "matths-tutorial-scroll-target"
      );
      tutorialScrollTarget = null;
    }
    if (tutorialScrollSpacer) {
      tutorialScrollSpacer.remove();
      tutorialScrollSpacer = null;
    }
    if (highlightedTarget) {
      highlightedTarget.classList.remove("matths-tutorial-target");
    }
    spotlight?.classList.remove("matths-tutorial-spotlight--pulse");
    spotlight?.classList.remove("matths-tutorial-spotlight--reveal");
    if (spotlight) spotlight.hidden = true;
    highlightedTarget = null;
  }

  function resetTutorialDialogPosition() {
    if (!dialog) return;
    dialog.style.removeProperty("left");
    dialog.style.removeProperty("top");
    dialog.style.removeProperty("right");
    dialog.style.removeProperty("bottom");
    delete dialog.dataset.placement;
  }

  function spotlightPadding(target) {
    if (target.closest("#dashboard-sidebar")) {
      return { x: 8, y: 6, inset: 6 };
    }
    if (
      target.matches(
        '.topbar, [data-tutorial-target="dashboard-welcome"]'
      )
    ) {
      return { x: 10, y: 8, inset: 8 };
    }
    return { x: 11, y: 10, inset: 8 };
  }

  function overlapArea(left, top, width, height, targetRect) {
    const right = left + width;
    const bottom = top + height;
    const overlapWidth = Math.max(
      0,
      Math.min(right, targetRect.right) - Math.max(left, targetRect.left)
    );
    const overlapHeight = Math.max(
      0,
      Math.min(bottom, targetRect.bottom) - Math.max(top, targetRect.top)
    );
    return overlapWidth * overlapHeight;
  }

  function positionTutorialDialog(target) {
    if (!dialog) return;
    resetTutorialDialogPosition();
    if (!target || window.innerWidth <= 700) return;

    const margin = 20;
    const dialogWidth = dialog.offsetWidth;
    const dialogHeight = dialog.offsetHeight;
    const targetRect = target.getBoundingClientRect();
    const protectedTarget = {
      left: targetRect.left - 18,
      top: targetRect.top - 18,
      right: targetRect.right + 18,
      bottom: targetRect.bottom + 18,
    };
    const maxLeft = Math.max(
      margin,
      window.innerWidth - dialogWidth - margin
    );
    const maxTop = Math.max(
      margin,
      window.innerHeight - dialogHeight - margin
    );
    const candidates = [
      { placement: "bottom-right", left: maxLeft, top: maxTop },
      { placement: "bottom-left", left: margin, top: maxTop },
      { placement: "top-right", left: maxLeft, top: margin },
      { placement: "top-left", left: margin, top: margin },
    ];
    const targetCenterX = (targetRect.left + targetRect.right) / 2;
    const targetCenterY = (targetRect.top + targetRect.bottom) / 2;
    const selected = candidates
      .map((candidate) => {
        const dialogCenterX = candidate.left + dialogWidth / 2;
        const dialogCenterY = candidate.top + dialogHeight / 2;
        const distanceSquared =
          (dialogCenterX - targetCenterX) ** 2 +
          (dialogCenterY - targetCenterY) ** 2;
        return {
          ...candidate,
          score:
            overlapArea(
              candidate.left,
              candidate.top,
              dialogWidth,
              dialogHeight,
              protectedTarget
            ) * 1000000 - distanceSquared,
        };
      })
      .sort((left, right) => left.score - right.score)[0];

    dialog.style.left = `${selected.left}px`;
    dialog.style.top = `${selected.top}px`;
    dialog.style.right = "auto";
    dialog.style.bottom = "auto";
    dialog.dataset.placement = selected.placement;
  }

  function targetConflictsWithEveryDialogCorner(target) {
    if (!dialog || !target || window.innerWidth <= 700) return false;
    const margin = 20;
    const dialogWidth = dialog.offsetWidth;
    const dialogHeight = dialog.offsetHeight;
    const targetRect = target.getBoundingClientRect();
    const protectedTarget = {
      left: targetRect.left - 18,
      top: targetRect.top - 18,
      right: targetRect.right + 18,
      bottom: targetRect.bottom + 18,
    };
    const maxLeft = Math.max(
      margin,
      window.innerWidth - dialogWidth - margin
    );
    const maxTop = Math.max(
      margin,
      window.innerHeight - dialogHeight - margin
    );
    return [
      [maxLeft, maxTop],
      [margin, maxTop],
      [maxLeft, margin],
      [margin, margin],
    ].every(
      ([left, top]) =>
        overlapArea(
          left,
          top,
          dialogWidth,
          dialogHeight,
          protectedTarget
        ) > 0
    );
  }

  function positionSpotlight(target) {
    if (!spotlight || !target) return;

    const targetStyle = window.getComputedStyle(target);
    const rect = target.getBoundingClientRect();
    const padding = spotlightPadding(target);
    const gapX = padding.x;
    const gapY = padding.y;
    const viewportInset = padding.inset;
    const left = Math.max(viewportInset, rect.left - gapX);
    const top = Math.max(viewportInset, rect.top - gapY);
    const right = Math.min(
      window.innerWidth - viewportInset,
      rect.right + gapX
    );
    const bottom = Math.min(
      window.innerHeight - viewportInset,
      rect.bottom + gapY
    );
    const targetRadius = Number.parseFloat(targetStyle.borderTopLeftRadius) || 0;

    spotlight.style.left = `${left}px`;
    spotlight.style.top = `${top}px`;
    spotlight.style.width = `${Math.max(1, right - left)}px`;
    spotlight.style.height = `${Math.max(1, bottom - top)}px`;
    spotlight.style.setProperty(
      "--matths-spotlight-radius",
      `${Math.max(20, targetRadius + 10)}px`
    );
  }

  function prepareTargetAppearance(target, attention) {
    positionTutorialDialog(target);
    positionSpotlight(target);
    if (spotlight) {
      spotlight.hidden = false;
      spotlight.classList.remove("matths-tutorial-spotlight--reveal");
      void spotlight.offsetWidth;
      spotlight.classList.add("matths-tutorial-spotlight--reveal");
      spotlight.classList.toggle(
        "matths-tutorial-spotlight--pulse",
        Boolean(attention && !reducedMotion)
      );
    }
    target.classList.add("matths-tutorial-target");
  }

  function targetNeedsScroll(target) {
    const rect = target.getBoundingClientRect();
    const viewportMargin = 24;
    const mobileDialogHeight =
      window.innerWidth <= 700 && dialog
        ? dialog.getBoundingClientRect().height + 20
        : 0;
    return (
      targetConflictsWithEveryDialogCorner(target) ||
      rect.top < viewportMargin ||
      rect.left < viewportMargin ||
      rect.bottom >
        window.innerHeight - viewportMargin - mobileDialogHeight ||
      rect.right > window.innerWidth - viewportMargin
    );
  }

  function scrollTargetIntoView(target) {
    const conflictsWithDialog =
      targetConflictsWithEveryDialogCorner(target);
    const needsTopAlignment =
      window.innerWidth <= 700 || conflictsWithDialog;
    if (conflictsWithDialog && dialog) {
      tutorialScrollTarget = target;
      target.classList.add("matths-tutorial-scroll-target");
      tutorialScrollSpacer = document.createElement("div");
      tutorialScrollSpacer.className = "matths-tutorial-scroll-spacer";
      tutorialScrollSpacer.style.height = `${dialog.offsetHeight + 80}px`;
      tutorialScrollSpacer.setAttribute("aria-hidden", "true");
      document.body.append(tutorialScrollSpacer);
    }
    target.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: needsTopAlignment ? "start" : "center",
      inline: "nearest",
    });
  }

  function revealAfterViewportSettles(
    target,
    attention,
    requestId
  ) {
    let startedAt = performance.now();
    let previousX = window.scrollX;
    let previousY = window.scrollY;
    let previousRect = target.getBoundingClientRect();
    let stableFrames = 0;

    function checkViewport(now) {
      if (
        requestId !== revealRequest ||
        !target.isConnected ||
        root.hidden
      ) {
        return;
      }

      const rect = target.getBoundingClientRect();
      const isStable =
        Math.abs(window.scrollX - previousX) < 0.5 &&
        Math.abs(window.scrollY - previousY) < 0.5 &&
        Math.abs(rect.left - previousRect.left) < 0.5 &&
        Math.abs(rect.top - previousRect.top) < 0.5;

      stableFrames = isStable ? stableFrames + 1 : 0;
      previousX = window.scrollX;
      previousY = window.scrollY;
      previousRect = rect;

      if (
        stableFrames >= 2 &&
        !tutorialScrollSpacer &&
        targetConflictsWithEveryDialogCorner(target)
      ) {
        scrollTargetIntoView(target);
        startedAt = now;
        stableFrames = 0;
        window.requestAnimationFrame(checkViewport);
        return;
      }

      if (
        (stableFrames >= 4 && now - startedAt >= 96) ||
        now - startedAt >= 1200
      ) {
        document.body.classList.add("matths-tutorial-active");
        window.requestAnimationFrame(() => {
          if (requestId !== revealRequest || !target.isConnected) return;
          prepareTargetAppearance(target, attention);
          highlightedTarget = target;
          nextButton.disabled = false;
          window.setTimeout(() => nextButton.focus(), 40);
        });
        return;
      }

      window.requestAnimationFrame(checkViewport);
    }

    window.requestAnimationFrame(checkViewport);
  }

  function updateStepUrl(index) {
    const url = new URL(window.location.href);
    url.searchParams.set("tutorialStep", String(index));
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function renderStep(index) {
    const step = steps[index];
    if (!step) return;

    if (window.location.pathname !== step.path) {
      window.location.assign(`${step.path}?tutorialStep=${index}`);
      return;
    }

    clearHighlight();
    document.body.classList.remove("matths-tutorial-active");
    const target =
      document.querySelector(step.selector) ||
      (step.fallbackSelector
        ? document.querySelector(step.fallbackSelector)
        : null);
    currentIndex = index;
    title.textContent = step.title;
    message.textContent = step.message;
    progress.textContent = `MATTHS TOUR · ${index + 1} / ${steps.length}`;
    status.textContent = "";
    nextButton.innerHTML = index === steps.length - 1
      ? '튜토리얼 끝내기 <span aria-hidden="true">✓</span>'
      : '다음 <span aria-hidden="true">→</span>';
    nextButton.disabled = Boolean(target);
    root.hidden = false;
    updateStepUrl(index);
    startCharacter();

    prepareSidebar(target);

    if (target) {
      const requestId = revealRequest;
      if (targetNeedsScroll(target)) {
        scrollTargetIntoView(target);
      }
      revealAfterViewportSettles(target, step.attention, requestId);
    } else {
      document.body.classList.add("matths-tutorial-active");
      resetTutorialDialogPosition();
      nextButton.disabled = false;
      window.setTimeout(() => nextButton.focus(), 80);
    }
  }

  async function saveAction(action) {
    const response = await fetch("/api/dashboard-tutorial", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || "튜토리얼 상태를 저장하지 못했습니다.");
    }
    return result;
  }

  function removeTutorialQuery() {
    const url = new URL(window.location.href);
    url.searchParams.delete("tutorialStep");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function closeTutorial() {
    stopCharacter();
    clearHighlight();
    restoreSidebar();
    root.hidden = true;
    document.body.classList.remove("matths-tutorial-active");
    removeTutorialQuery();
  }

  async function finish(action) {
    nextButton.disabled = true;
    skipButton.disabled = true;
    status.textContent = action === "SKIP"
      ? "튜토리얼을 건너뛰는 중..."
      : "튜토리얼을 완료하는 중...";
    try {
      await saveAction(action);
      closeTutorial();
    } catch (error) {
      status.textContent = error.message;
      nextButton.disabled = false;
      skipButton.disabled = false;
    }
  }

  nextButton.addEventListener("click", () => {
    if (currentIndex >= steps.length - 1) {
      finish("COMPLETE");
      return;
    }
    renderStep(currentIndex + 1);
  });

  skipButton.addEventListener("click", () => finish("SKIP"));

  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finish("SKIP");
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = [skipButton, nextButton].filter(
      (button) => !button.disabled
    );
    if (!focusable.length) return;
    const current = focusable.indexOf(document.activeElement);
    const direction = event.shiftKey ? -1 : 1;
    const next = (current + direction + focusable.length) % focusable.length;
    event.preventDefault();
    focusable[next].focus();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopCharacter();
    else if (!root.hidden) startCharacter();
  });

  window.addEventListener("resize", () => {
    if (!highlightedTarget) return;
    if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      positionSpotlight(highlightedTarget);
      positionTutorialDialog(highlightedTarget);
      resizeFrame = null;
    });
  });

  const requestedStep = Number(
    new URLSearchParams(window.location.search).get("tutorialStep")
  );
  const hasRequestedStep = new URLSearchParams(
    window.location.search
  ).has("tutorialStep");
  const initialStep = hasRequestedStep && Number.isInteger(requestedStep)
    ? Math.min(Math.max(requestedStep, 0), steps.length - 1)
    : config.page === "main"
      ? 0
      : -1;

  if (initialStep >= 0) renderStep(initialStep);
})();
