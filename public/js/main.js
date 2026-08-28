(function () {
  "use strict";

  const statusRegion = document.getElementById("dashboard-status");

  function announce(message) {
    if (!statusRegion) return;
    statusRegion.textContent = "";
    window.setTimeout(() => {
      statusRegion.textContent = message;
    }, 20);
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });

    let result = {};

    try {
      result = await response.json();
    } catch (error) {
      result = {};
    }

    if (!response.ok) {
      throw new Error(result.message || "요청을 처리하지 못했습니다.");
    }

    return result;
  }

  function initSidebar() {
    const sidebar = document.getElementById("dashboard-sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    const openButton = document.getElementById("sidebar-open");
    const closeButton = document.getElementById("sidebar-close");
    const desktopViewport = window.matchMedia("(min-width: 901px)");
    const collapsedStorageKey = "matths-dashboard-sidebar-collapsed";

    if (!sidebar || !overlay || !openButton || !closeButton) return;

    let collapsedPreference = false;
    try {
      collapsedPreference =
        window.localStorage.getItem(collapsedStorageKey) === "true";
    } catch (error) {
      collapsedPreference = false;
    }

    function persistCollapsedPreference() {
      try {
        window.localStorage.setItem(
          collapsedStorageKey,
          String(collapsedPreference)
        );
      } catch (error) {
        // 저장소를 사용할 수 없어도 현재 화면의 메뉴 축소는 유지합니다.
      }
    }

    function renderCloseButton() {
      if (!desktopViewport.matches) {
        closeButton.textContent = "×";
        closeButton.classList.remove("sidebar-toggle-collapsed");
        closeButton.setAttribute("aria-label", "메뉴 닫기");
        closeButton.title = "메뉴 닫기";
        return;
      }

      closeButton.textContent = "";
      closeButton.classList.toggle(
        "sidebar-toggle-collapsed",
        collapsedPreference
      );
      closeButton.setAttribute(
        "aria-label",
        collapsedPreference ? "왼쪽 메뉴 펼치기" : "왼쪽 메뉴 숨기기"
      );
      closeButton.title = collapsedPreference ? "메뉴 펼치기" : "메뉴 숨기기";
    }

    function applyCollapsedPreference({ persist = false } = {}) {
      document.body.classList.toggle(
        "dashboard-sidebar-collapsed",
        desktopViewport.matches && collapsedPreference
      );
      sidebar.classList.toggle(
        "collapsed",
        desktopViewport.matches && collapsedPreference
      );
      renderCloseButton();
      if (persist) persistCollapsedPreference();
    }

    function setOpen(open) {
      sidebar.classList.toggle("open", open);
      overlay.hidden = !open;
      document.body.classList.toggle("sidebar-visible", open);
      openButton.setAttribute("aria-expanded", String(open));

      if (open) {
        closeButton.focus();
      } else if (document.activeElement === closeButton) {
        openButton.focus();
      }
    }

    openButton.addEventListener("click", () => setOpen(true));
    closeButton.addEventListener("click", () => {
      if (!desktopViewport.matches) {
        setOpen(false);
        return;
      }
      collapsedPreference = !collapsedPreference;
      applyCollapsedPreference({ persist: true });
    });
    overlay.addEventListener("click", () => setOpen(false));

    sidebar.addEventListener("click", (event) => {
      if (window.innerWidth > 900 || !event.target.closest("a")) return;
      setOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && sidebar.classList.contains("open")) {
        setOpen(false);
      }
    });

    const syncViewport = () => {
      if (desktopViewport.matches) setOpen(false);
      applyCollapsedPreference();
    };
    if (typeof desktopViewport.addEventListener === "function") {
      desktopViewport.addEventListener("change", syncViewport);
    } else if (typeof desktopViewport.addListener === "function") {
      desktopViewport.addListener(syncViewport);
    }
    applyCollapsedPreference();
  }

  function initDate() {
    const label = document.getElementById("today-label");
    if (!label) return;

    const date = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(new Date());

    label.textContent = `${date} · 오늘의 학습`;
  }

  function initNotifications() {
    const button = document.getElementById("notification-button");
    const panel = document.getElementById("notification-panel");
    const closeButton = document.getElementById("notification-close");

    if (!button || !panel || !closeButton) return;

    function setOpen(open, restoreFocus = false) {
      panel.hidden = !open;
      button.setAttribute("aria-expanded", String(open));

      if (open) {
        closeButton.focus();
      } else if (restoreFocus) {
        button.focus();
      }
    }

    button.addEventListener("click", () => setOpen(panel.hidden));
    closeButton.addEventListener("click", () => setOpen(false, true));

    document.addEventListener("click", (event) => {
      if (!panel.hidden && !event.target.closest(".notification-wrap")) {
        setOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !panel.hidden) {
        setOpen(false, true);
      }
    });
  }

  function initAnnouncementDismiss() {
    const container =
      document.querySelector(
        ".dashboard-announcements"
      );

    if (!container) return;

    container.addEventListener(
      "click",
      async (event) => {
        const button =
          event.target.closest(
            "[data-dismiss-dashboard-notice]"
          );

        if (!button) return;
        const dismissUrl =
          button.dataset
            .dismissDashboardNotice;
        const card =
          button.closest(
            "[data-dashboard-notice]"
          );
        button.disabled = true;

        try {
          await requestJson(
            dismissUrl,
            {
              method: "POST",
            }
          );
          card?.remove();
          if (
            !container.querySelector(
              "[data-dashboard-notice]"
            )
          ) {
            container.remove();
          }
          announce(
            "대시보드에서 공지를 닫았습니다. 알림 우편함에는 그대로 보관됩니다."
          );
        } catch (error) {
          button.disabled =
            false;
          announce(error.message);
        }
      }
    );
  }

  function initCharts() {
    const chart = document.querySelector(".weekly-chart");
    if (!chart) return;

    if (!("IntersectionObserver" in window)) {
      chart.classList.add("visible");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        chart.classList.add("visible");
        observer.disconnect();
      },
      { threshold: 0.25 }
    );

    observer.observe(chart);
  }

  function initAccessRenewalDialog() {
    const dialog = document.querySelector("[data-access-renewal-dialog]");
    if (!dialog) return;
    if (typeof dialog.showModal === "function" && !dialog.open) {
      dialog.showModal();
    } else if (!dialog.open) {
      dialog.setAttribute("open", "");
    }

    const countdown = dialog.querySelector("[data-renewal-countdown]");
    const deadlineValue = dialog.dataset.graceDeadline;
    if (!countdown || !deadlineValue) return;
    const deadline = new Date(deadlineValue).getTime();

    function renderCountdown() {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        countdown.textContent = "종료됨 · 재구매 후 랭크 복귀전 필요";
        return false;
      }
      const totalMinutes = Math.ceil(remainingMs / 60000);
      const days = Math.floor(totalMinutes / 1440);
      const hours = Math.floor((totalMinutes % 1440) / 60);
      const minutes = totalMinutes % 60;
      countdown.textContent = [
        days ? `${days}일` : "",
        `${hours}시간`,
        `${minutes}분`,
      ].filter(Boolean).join(" ");
      return true;
    }

    if (!renderCountdown()) return;
    const timer = window.setInterval(() => {
      if (!renderCountdown()) window.clearInterval(timer);
    }, 30000);
  }

  function initDashboardCoachCharacter() {
    const stage = document.querySelector(
      "[data-dashboard-coach-character]"
    );
    const image = stage?.querySelector(
      "[data-dashboard-coach-character-image]"
    );

    if (!stage || !image) return;

    const characterTone =
      stage.dataset.characterTone === "spicy" ? "spicy" : "mild";
    const assetPrefix = `/images/coach-characters/${characterTone}`;
    const coachCharacters = [
      {
        id: "goat",
        frames: [
          `${assetPrefix}-goat-1.webp`,
          `${assetPrefix}-goat-2.webp`,
          `${assetPrefix}-goat-3.webp`,
        ],
      },
      {
        id: "pigeon",
        frames: [
          `${assetPrefix}-pigeon-1.webp`,
          `${assetPrefix}-pigeon-2.webp`,
          `${assetPrefix}-pigeon-3.webp`,
        ],
      },
      {
        id: "llama",
        frames: [
          `${assetPrefix}-llama-1.webp`,
          `${assetPrefix}-llama-2.webp`,
          `${assetPrefix}-llama-3.webp`,
        ],
      },
    ];
    const character =
      coachCharacters[Math.floor(Math.random() * coachCharacters.length)];
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    let frameIndex = 0;
    let frameTimer = null;
    let swapTimer = null;

    const revealCharacter = () => {
      stage.dataset.character = character.id;
    };
    image.addEventListener("load", revealCharacter, { once: true });
    image.src = character.frames[frameIndex];
    if (image.complete) revealCharacter();

    character.frames.forEach((frameSource) => {
      const preloadImage = new Image();
      preloadImage.src = frameSource;
    });

    function showNextFrame() {
      frameIndex = (frameIndex + 1) % character.frames.length;
      stage.classList.add("is-switching");
      window.clearTimeout(swapTimer);
      swapTimer = window.setTimeout(() => {
        image.src = character.frames[frameIndex];
        window.requestAnimationFrame(() => {
          stage.classList.remove("is-switching");
        });
      }, 120);
    }

    function stopFrameRotation() {
      if (frameTimer) window.clearInterval(frameTimer);
      frameTimer = null;
    }

    function startFrameRotation() {
      if (reducedMotion || frameTimer || document.hidden) return;
      frameTimer = window.setInterval(showNextFrame, 2000);
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopFrameRotation();
      } else {
        startFrameRotation();
      }
    });

    startFrameRotation();
  }

  function initStudentAttendance() {
    const card = document.querySelector("[data-student-attendance-card]");
    if (!card) return;
    const sessionId = String(card.dataset.sessionId || "");
    const attendanceMode = String(card.dataset.attendanceMode || "");
    const opensAt = new Date(card.dataset.opensAt || "").getTime();
    const lateAt = new Date(card.dataset.lateAt || "").getTime();
    const closesAt = new Date(card.dataset.closesAt || "").getTime();
    const serverNow = new Date(card.dataset.serverNow || "").getTime();
    const clockOffset = Number.isFinite(serverNow) ? serverNow - Date.now() : 0;
    const form = card.querySelector("[data-student-attendance-form]");
    const input = form?.querySelector("input[name='code']");
    const label = card.querySelector("[data-attendance-window-label]");
    const countdown = card.querySelector("[data-attendance-countdown]");
    const feedback = card.querySelector("[data-attendance-feedback]");
    const alertButton = card.querySelector("[data-enable-attendance-alerts]");
    const notificationKey = `matths-attendance-notified:${sessionId}`;

    function currentTime() {
      return Date.now() + clockOffset;
    }

    function durationLabel(milliseconds) {
      const minutes = Math.max(0, Math.ceil(milliseconds / 60000));
      if (minutes < 60) return `${minutes}분`;
      const hours = Math.floor(minutes / 60);
      const remainder = minutes % 60;
      return remainder ? `${hours}시간 ${remainder}분` : `${hours}시간`;
    }

    function showAttendanceNotification() {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      try {
        if (window.localStorage.getItem(notificationKey) === "1") return;
        new Notification("Matths 출석 체크", {
          body: "수업 출석 코드 입력 시간이 시작되었습니다.",
          icon: "/images/favicon-64.png",
          tag: `matths-attendance-${sessionId}`,
        });
        window.localStorage.setItem(notificationKey, "1");
      } catch (_error) {
        // 알림 또는 로컬 저장소를 사용할 수 없어도 화면 출석은 계속 동작합니다.
      }
    }

    function renderWindow() {
      if (attendanceMode !== "SELF_CODE" || !Number.isFinite(opensAt) || !Number.isFinite(closesAt)) return false;
      const now = currentTime();
      if (now < opensAt) {
        card.className = "dashboard-attendance-card is-scheduled";
        if (label) label.textContent = "출석 시작 전";
        if (countdown) countdown.textContent = `${durationLabel(opensAt - now)} 후 코드 입력이 시작됩니다.`;
        if (form) form.hidden = true;
        return true;
      }
      if (now <= closesAt) {
        card.className = `dashboard-attendance-card ${now > lateAt ? "is-late" : "is-open"}`;
        if (label) label.textContent = now > lateAt ? "지각 출석 입력 중" : "출석 입력 중";
        if (countdown) countdown.textContent = `${durationLabel(closesAt - now)} 후 입력이 마감됩니다.`;
        if (form) form.hidden = false;
        if (alertButton) alertButton.hidden = true;
        showAttendanceNotification();
        return true;
      }
      card.className = "dashboard-attendance-card is-closed";
      if (label) label.textContent = "출석 입력 종료";
      if (countdown) countdown.textContent = "담당 선생님에게 출결 상태를 확인해 주세요.";
      if (form) form.hidden = true;
      if (alertButton) alertButton.hidden = true;
      return false;
    }

    alertButton?.addEventListener("click", async () => {
      if (!("Notification" in window)) {
        if (feedback) feedback.textContent = "이 브라우저는 알림을 지원하지 않습니다.";
        return;
      }
      const permission = await Notification.requestPermission();
      if (feedback) feedback.textContent = permission === "granted"
        ? "이 화면이 열려 있으면 출석 시작 시간에 알림을 보냅니다."
        : "브라우저 알림 권한이 허용되지 않았습니다.";
      if (permission === "granted") alertButton.textContent = "수업 알림 설정됨";
    });

    input?.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 6);
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = form.querySelector("button[type='submit']");
      if (!input || input.value.length !== 6) {
        if (feedback) feedback.textContent = "6자리 출석 코드를 입력해 주세요.";
        input?.focus();
        return;
      }
      if (submitButton) submitButton.disabled = true;
      if (feedback) feedback.textContent = "출석을 확인하고 있습니다.";
      try {
        const result = await requestJson("/api/academy/attendance/check-in", {
          method: "POST",
          body: JSON.stringify({ sessionId, code: input.value }),
        });
        const action = card.querySelector(".dashboard-attendance-action");
        if (action) {
          action.innerHTML = `<strong data-attendance-result>${result.attendance.status === "LATE" ? "지각" : "출석"} 완료</strong><small>${result.message}</small>`;
        }
        card.className = `dashboard-attendance-card is-${String(result.attendance.status || "present").toLowerCase()}`;
        announce(result.message);
      } catch (error) {
        if (feedback) feedback.textContent = error.message;
        if (submitButton) submitButton.disabled = false;
        input.select();
      }
    });

    if (!renderWindow()) return;
    const timer = window.setInterval(() => {
      if (!renderWindow()) window.clearInterval(timer);
    }, 1000);
  }

  function init() {
    initSidebar();
    initDate();
    initNotifications();
    initAnnouncementDismiss();
    initCharts();
    initAccessRenewalDialog();
    initDashboardCoachCharacter();
    initStudentAttendance();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
