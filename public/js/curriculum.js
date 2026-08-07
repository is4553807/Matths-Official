(function () {
  "use strict";

  function initCourseCategoryButtons() {
    const buttons = Array.from(document.querySelectorAll(".course-category-button[data-course-category]"));
    if (!buttons.length) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function selectCategory(id, moveFocus) {
      const section = document.getElementById(`category-${id}`);
      if (!section) return;

      buttons.forEach((button) => {
        const active = button.dataset.courseCategory === id;
        button.classList.toggle("current", active);
        button.setAttribute("aria-pressed", String(active));
      });

      section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      if (moveFocus) {
        window.setTimeout(() => {
          const heading = section.querySelector("h2[id]");
          if (!heading) return;
          heading.setAttribute("tabindex", "-1");
          heading.focus({ preventScroll: true });
        }, reduceMotion ? 0 : 450);
      }
    }

    buttons.forEach((button) => {
      button.addEventListener("click", () => selectCategory(button.dataset.courseCategory, true));
    });

    if (!("IntersectionObserver" in window)) return;
    const sections = buttons
      .map((button) => document.getElementById(`category-${button.dataset.courseCategory}`))
      .filter(Boolean);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const id = visible.target.id.replace(/^category-/, "");
        buttons.forEach((button) => {
          const active = button.dataset.courseCategory === id;
          button.classList.toggle("current", active);
          button.setAttribute("aria-pressed", String(active));
        });
      },
      { rootMargin: "-28% 0px -56% 0px", threshold: [0.05, 0.2, 0.45] }
    );
    sections.forEach((section) => observer.observe(section));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCourseCategoryButtons, { once: true });
  } else {
    initCourseCategoryButtons();
  }
})();
