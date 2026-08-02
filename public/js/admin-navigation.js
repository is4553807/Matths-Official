document.addEventListener("DOMContentLoaded", () => {
  const menu = document.querySelector(
    "[data-admin-alert-menu]"
  );
  const toggle = menu?.querySelector(
    "[data-admin-alert-toggle]"
  );
  const panel = menu?.querySelector(
    "[data-admin-alert-panel]"
  );

  if (menu && toggle && panel) {
    const close = () => {
      panel.hidden = true;
      toggle.setAttribute(
        "aria-expanded",
        "false"
      );
    };

    toggle.addEventListener("click", () => {
      const willOpen = panel.hidden;
      panel.hidden = !willOpen;
      toggle.setAttribute(
        "aria-expanded",
        String(willOpen)
      );
    });
    document.addEventListener("click", (event) => {
      if (!menu.contains(event.target)) {
        close();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
  }

  const groups = [
    ...document.querySelectorAll(
      "[data-admin-nav-group]"
    ),
  ];
  const closeGroup = (group) => {
    group.classList.remove("is-open");
    group
      .querySelector("[data-admin-nav-toggle]")
      ?.setAttribute("aria-expanded", "false");
  };
  const closeGroups = (except = null) => {
    groups.forEach((group) => {
      if (group !== except) closeGroup(group);
    });
  };

  groups.forEach((group) => {
    const groupToggle = group.querySelector(
      "[data-admin-nav-toggle]"
    );
    if (!groupToggle) return;

    groupToggle.addEventListener("click", () => {
      const willOpen = !group.classList.contains(
        "is-open"
      );
      closeGroups(group);
      group.classList.toggle("is-open", willOpen);
      groupToggle.setAttribute(
        "aria-expanded",
        String(willOpen)
      );
    });
  });

  document.addEventListener("click", (event) => {
    if (
      !event.target.closest("[data-admin-nav-group]")
    ) {
      closeGroups();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeGroups();
    document
      .querySelector("[data-admin-nav-toggle]:focus")
      ?.blur();
  });
});
