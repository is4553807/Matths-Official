(() => {
  const filter = document.querySelector("[data-grade-filter]");
  filter?.elements.grade.addEventListener("change", () => filter.requestSubmit());
  for (const form of document.querySelectorAll("[data-schedule-form]")) {
    const { examDate, closeAt } = form.elements;
    const setCloseMinimum = () => {
      closeAt.min = examDate.value ? `${examDate.value}T${form.dataset.openTime}` : "";
    };
    examDate.addEventListener("input", setCloseMinimum);
    setCloseMinimum();
  }
  for (const button of document.querySelectorAll("[data-confirm-void], [data-confirm-settle]")) {
    button.addEventListener("click", (event) => {
      const message = button.hasAttribute("data-confirm-void") ? "시장을 무효 처리하고 배정된 TP를 반환할까요?" : "등록한 평균 원점수로 시장을 정산할까요?";
      if (!window.confirm(message)) event.preventDefault();
    });
  }
})();
