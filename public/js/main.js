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

    if (!sidebar || !overlay || !openButton || !closeButton) return;

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
    closeButton.addEventListener("click", () => setOpen(false));
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

  function init() {
    initSidebar();
    initDate();
    initNotifications();
    initAnnouncementDismiss();
    initCharts();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
