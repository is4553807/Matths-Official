(function () {
  "use strict";

  function init() {
    const form = document.getElementById("faq-search-form");
    const input = document.getElementById("faq-search-input");
    const clearButton = document.getElementById("faq-search-clear");
    const resetButton = document.getElementById("faq-reset");
    const count = document.getElementById("faq-result-count");
    const empty = document.getElementById("faq-empty");
    const items = Array.from(document.querySelectorAll(".faq-item"));
    const categoryButtons = Array.from(document.querySelectorAll(".category-button"));
    const quickLinks = Array.from(document.querySelectorAll('.popular-card[href^="#faq-"]'));
    let activeCategory = "all";

    function normalized(value) {
      return value.trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");
    }

    function updateCategory(category) {
      activeCategory = category;
      categoryButtons.forEach((button) => {
        const isActive = button.dataset.category === category;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });
    }

    function filterItems() {
      const query = normalized(input.value);
      let visibleCount = 0;

      items.forEach((item) => {
        const question = item.querySelector("summary strong")?.textContent || "";
        const answer = item.querySelector(".faq-answer")?.textContent || "";
        const searchText = `${item.dataset.search || ""} ${question} ${answer}`.toLocaleLowerCase("ko-KR");
        const matchesCategory = activeCategory === "all" || item.dataset.category === activeCategory;
        const matchesQuery = !query || query.split(" ").every((term) => searchText.includes(term));
        const isVisible = matchesCategory && matchesQuery;
        item.hidden = !isVisible;
        if (isVisible) visibleCount += 1;
        if (!isVisible) item.open = false;
      });

      count.textContent = `${visibleCount}개의 질문`;
      empty.hidden = visibleCount !== 0;
      clearButton.hidden = query.length === 0;
    }

    function resetAll() {
      input.value = "";
      updateCategory("all");
      filterItems();
      input.focus();
    }

    form.addEventListener("submit", (event) => event.preventDefault());
    input.addEventListener("input", filterItems);
    clearButton.addEventListener("click", resetAll);
    resetButton.addEventListener("click", resetAll);

    categoryButtons.forEach((button) => {
      button.addEventListener("click", () => {
        updateCategory(button.dataset.category);
        filterItems();
      });
    });

    items.forEach((item) => {
      item.addEventListener("toggle", () => {
        if (!item.open) return;
        items.forEach((other) => {
          if (other !== item) other.open = false;
        });
      });
    });

    quickLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        const target = document.querySelector(link.getAttribute("href"));
        if (!target) return;
        event.preventDefault();
        input.value = "";
        updateCategory("all");
        filterItems();
        target.open = true;
        target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      });
    });

    filterItems();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
