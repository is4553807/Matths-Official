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
  if (!menu || !toggle || !panel) return;

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
});
