(function () {
  "use strict";

  document.documentElement.classList.add("js-enabled");

  function initCourseTabs() {
    const tabs = Array.from(document.querySelectorAll(".course-tab[data-course]"));
    const panels = Array.from(document.querySelectorAll(".course-panel[data-course-panel]"));

    if (!tabs.length || !panels.length) return;

    function selectCourse(courseId, moveFocus = false) {
      tabs.forEach((tab) => {
        const active = tab.dataset.course === courseId;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;

        if (active && moveFocus) tab.focus();
      });

      panels.forEach((panel) => {
        const active = panel.dataset.coursePanel === courseId;
        panel.classList.toggle("active", active);
        panel.hidden = !active;
      });
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => {
        selectCourse(tab.dataset.course);
      });

      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          return;
        }

        event.preventDefault();
        let nextIndex = index;

        if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = tabs.length - 1;

        selectCourse(tabs[nextIndex].dataset.course, true);
      });
    });

    const initialTab =
      tabs.find(
        (tab) =>
          tab.getAttribute(
            "aria-selected"
          ) === "true" ||
          tab.classList.contains(
            "active"
          )
      ) || tabs[0];

    selectCourse(
      initialTab.dataset.course
    );
  }

  function initUnits() {
    document.querySelectorAll(".progress-unit").forEach((unit) => {
      const label = unit.querySelector(".unit-toggle i");

      unit.addEventListener("toggle", () => {
        if (label) {
          label.textContent = unit.open ? "소단원 닫기" : "소단원 보기";
        }
      });
    });
  }

  function init() {
    initCourseTabs();
    initUnits();
    window.requestAnimationFrame(() => {
      document.documentElement.classList.add("progress-ready");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
