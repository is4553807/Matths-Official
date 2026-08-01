const arenaHero =
  document.querySelector(
    ".arena-hero"
  );
const reduceMotion =
  window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );
const arenaVideo =
  document.querySelector(
    ".arena-hero-video"
  );
const arenaSoundToggle =
  document.querySelector(
    "[data-arena-sound-toggle]"
  );
const arenaSoundLabel =
  document.querySelector(
    "[data-arena-sound-label]"
  );
const arenaRankingCardRevealTime =
  20;

function revealArenaRankingCard() {
  if (!arenaHero) return;

  arenaHero.classList.add(
    "is-ranking-card-visible"
  );

  if (arenaVideo) {
    arenaVideo.removeEventListener(
      "timeupdate",
      revealArenaRankingCardOnTime
    );
  }
}

function revealArenaRankingCardOnTime() {
  if (
    arenaVideo &&
    arenaVideo.currentTime >=
      arenaRankingCardRevealTime
  ) {
    revealArenaRankingCard();
  }
}

function finishArenaIntroVideo() {
  if (!arenaHero) return;

  revealArenaRankingCard();
  arenaHero.classList.remove(
    "is-video-pending"
  );
  arenaHero.classList.add(
    "is-video-complete"
  );

  if (arenaSoundToggle) {
    arenaSoundToggle.hidden =
      true;
  }
}

function updateArenaSoundControl() {
  if (
    !arenaVideo ||
    !arenaSoundToggle
  ) {
    return;
  }

  const soundIsOn =
    !arenaVideo.muted;
  arenaSoundToggle.classList.toggle(
    "is-muted",
    !soundIsOn
  );
  arenaSoundToggle.setAttribute(
    "aria-pressed",
    String(soundIsOn)
  );
  arenaSoundToggle.setAttribute(
    "aria-label",
    soundIsOn
      ? "GOAT Arena 영상 소리 끄기"
      : "GOAT Arena 영상 소리 켜기"
  );

  if (arenaSoundLabel) {
    arenaSoundLabel.textContent =
      soundIsOn
        ? "소리 끄기"
        : "소리 켜기";
  }
}

async function startArenaIntroVideo() {
  if (!arenaVideo) return;

  if (reduceMotion.matches) {
    arenaVideo.pause();
    arenaVideo.muted = true;
    finishArenaIntroVideo();
    return;
  }

  arenaVideo.loop = false;
  try {
    arenaVideo.currentTime = 0;
  } catch (_error) {
    // 메타데이터가 아직 준비되지 않은 브라우저는 기본 시작점(0초)을 사용한다.
  }
  arenaVideo.volume = 1;
  arenaVideo.muted = false;
  updateArenaSoundControl();

  try {
    await arenaVideo.play();
  } catch (_error) {
    // 소리가 있는 자동재생을 막는 브라우저에서는 영상은 계속 보여주고,
    // 사용자가 버튼을 눌러 소리를 켤 수 있게 한다.
    arenaVideo.muted = true;
    updateArenaSoundControl();

    try {
      await arenaVideo.play();
    } catch (_mutedError) {
      finishArenaIntroVideo();
    }
  }
}

if (arenaVideo) {
  arenaVideo.addEventListener(
    "timeupdate",
    revealArenaRankingCardOnTime
  );
  arenaVideo.addEventListener(
    "ended",
    finishArenaIntroVideo,
    { once: true }
  );
  arenaVideo.addEventListener(
    "error",
    finishArenaIntroVideo,
    { once: true }
  );
  startArenaIntroVideo().catch(
    finishArenaIntroVideo
  );
}

if (
  arenaVideo &&
  arenaSoundToggle
) {
  arenaSoundToggle.addEventListener(
    "click",
    async () => {
      arenaVideo.muted =
        !arenaVideo.muted;

      if (
        !arenaVideo.paused &&
        !arenaVideo.ended
      ) {
        updateArenaSoundControl();
        return;
      }

      try {
        await arenaVideo.play();
      } catch (_error) {
        arenaVideo.muted = true;
      }
      updateArenaSoundControl();
    }
  );
}

if (
  arenaHero &&
  !reduceMotion.matches
) {
  let frameId = null;

  arenaHero.addEventListener(
    "pointermove",
    (event) => {
      if (frameId) {
        cancelAnimationFrame(
          frameId
        );
      }

      frameId =
        requestAnimationFrame(
          () => {
            const bounds =
              arenaHero
                .getBoundingClientRect();
            const x =
              (
                event.clientX -
                bounds.left
              ) /
              bounds.width;
            const y =
              (
                event.clientY -
                bounds.top
              ) /
              bounds.height;

            arenaHero.style.setProperty(
              "--pointer-x",
              `${Math.round(
                x * 100
              )}%`
            );
            arenaHero.style.setProperty(
              "--pointer-y",
              `${Math.round(
                y * 100
              )}%`
            );
          }
        );
    }
  );
}

const arenaPageRail =
  document.querySelector(
    "[data-arena-page-rail]"
  );
const arenaRailLinks = [
  ...document.querySelectorAll(
    "[data-arena-rail-link]"
  ),
];
const arenaRailSections =
  arenaRailLinks
    .map((link) =>
      document.querySelector(
        link.getAttribute(
          "href"
        )
      )
    )
    .filter(Boolean);

function setActiveArenaSection(
  activeIndex
) {
  if (!arenaPageRail) return;

  arenaPageRail.style.setProperty(
    "--arena-rail-index",
    String(activeIndex)
  );
  arenaRailLinks.forEach(
    (link, index) => {
      const isActive =
        index === activeIndex;
      link.classList.toggle(
        "active",
        isActive
      );

      if (isActive) {
        link.setAttribute(
          "aria-current",
          "true"
        );
      } else {
        link.removeAttribute(
          "aria-current"
        );
      }
    }
  );
}

if (
  arenaPageRail &&
  arenaRailSections.length
) {
  let railFrameId = null;

  const updateArenaSection =
    () => {
      railFrameId = null;
      const focusLine =
        window.innerHeight *
        0.46;
      let activeIndex = 0;
      let closestDistance =
        Number.POSITIVE_INFINITY;

      arenaRailSections.forEach(
        (section, index) => {
          const bounds =
            section
              .getBoundingClientRect();
          const sectionCenter =
            bounds.top +
            bounds.height / 2;
          const distance =
            Math.abs(
              sectionCenter -
              focusLine
            );

          if (
            distance <
            closestDistance
          ) {
            closestDistance =
              distance;
            activeIndex = index;
          }
        }
      );

      setActiveArenaSection(
        activeIndex
      );
    };

  const requestRailUpdate =
    () => {
      if (railFrameId) return;

      railFrameId =
        requestAnimationFrame(
          updateArenaSection
        );
    };

  window.addEventListener(
    "scroll",
    requestRailUpdate,
    { passive: true }
  );
  window.addEventListener(
    "resize",
    requestRailUpdate
  );

  arenaRailLinks.forEach(
    (link, index) => {
      link.addEventListener(
        "click",
        () =>
          setActiveArenaSection(
            index
          )
      );
    }
  );

  updateArenaSection();
}

const arenaFeatureButtons = [
  ...document.querySelectorAll(
    "[data-arena-feature]"
  ),
];
const arenaFeatureStatus =
  document.querySelector(
    "[data-arena-feature-status]"
  );

arenaFeatureButtons.forEach(
  (button) => {
    button.addEventListener(
      "click",
      () => {
        const featureName =
          button.dataset
            .featureName ||
          "선택한 기능";
        arenaFeatureButtons.forEach(
          (item) =>
            item.setAttribute(
              "aria-pressed",
              String(
                item === button
              )
            )
        );

        if (arenaFeatureStatus) {
          arenaFeatureStatus.textContent =
            `${featureName} 기능은 현재 규칙과 화면 골격만 준비되어 있으며, 세부 정책값이 확정된 뒤 실제 동작이 연결됩니다.`;
        }
      }
    );
  }
);
