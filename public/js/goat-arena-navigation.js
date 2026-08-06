(() => {
  const mailbox = document.querySelector("[data-arena-mailbox]");
  if (!mailbox) return;
  const toggle = mailbox.querySelector("[data-arena-mailbox-toggle]");
  const panel = mailbox.querySelector("[data-arena-mailbox-panel]");
  if (!toggle || !panel) return;

  const close = () => {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  };
  toggle.addEventListener("click", () => {
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    toggle.setAttribute("aria-expanded", String(willOpen));
  });
  document.addEventListener("click", (event) => {
    if (!mailbox.contains(event.target)) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
})();
