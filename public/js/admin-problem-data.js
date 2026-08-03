document.querySelectorAll(".problem-data-tier-card").forEach((card) => {
  const counter = card.querySelector("[data-problem-type-count]");
  const inputs = [...card.querySelectorAll('input[type="checkbox"]')];
  const refresh = () => {
    const count = inputs.filter((input) => input.checked).length;
    if (counter) counter.textContent = String(count);
    card.classList.toggle("has-too-few-types", count < 5);
  };
  inputs.forEach((input) => input.addEventListener("change", refresh));
  refresh();
});

document.querySelectorAll("[data-problem-type-enabled]").forEach((toggle) => {
  const typeId = toggle.dataset.problemTypeEnabled;
  const settingCard = toggle.closest("[data-problem-setting-card]");
  const tierInputs = [
    ...document.querySelectorAll(`[data-tier-problem-type="${CSS.escape(typeId)}"]`),
  ];
  const refreshAvailability = () => {
    settingCard?.classList.toggle("is-disabled", !toggle.checked);
    tierInputs.forEach((input) => {
      input.disabled = !toggle.checked;
      if (!toggle.checked) input.checked = false;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  toggle.addEventListener("change", refreshAvailability);
  refreshAvailability();
});
