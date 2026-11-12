(() => {
  const filter = document.querySelector("[data-grade-filter]");
  filter?.elements.grade.addEventListener("change", () => filter.requestSubmit());
  for (const form of document.querySelectorAll("[data-schedule-form]")) {
    form.elements.examDate.addEventListener("input", () => {
      const date = form.elements.examDate.value;
      form.querySelector("[data-opening]").textContent = date ? `${date} ${form.dataset.openTime}` : form.dataset.openTime;
      if (date) form.elements.closeAt.min = `${date}T${form.dataset.openTime}`;
    });
  }
  for (const button of document.querySelectorAll("[data-confirm-void], [data-confirm-settle]")) {
    button.addEventListener("click", (event) => {
      const message = button.hasAttribute("data-confirm-void") ? "시장을 무효 처리하고 배정된 TP를 반환할까요?" : "등록한 평균 원점수로 시장을 정산할까요?";
      if (!window.confirm(message)) event.preventDefault();
    });
  }
})();
