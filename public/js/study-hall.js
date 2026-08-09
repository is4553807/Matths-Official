(() => {
  const form = document.querySelector("[data-study-hall-form]");
  if (!form || form.dataset.submitted === "1") return;
  const hidden = form.querySelector("[data-answers-json]");
  const count = form.querySelector("[data-answered-count]");
  const status = form.querySelector("[data-save-status]");
  const saveButton = form.querySelector("[data-save-progress]");

  const collectAnswers = () => Array.from(form.querySelectorAll("[data-question-number]")).map((row) => {
    const number = Number(row.dataset.questionNumber);
    const answerInput = row.querySelector(`input[name="answer-${number}"]:checked`)
      || row.querySelector(`input[name="answer-${number}"]:not([type="radio"])`);
    const value = answerInput?.value?.trim() || "";
    const state = row.querySelector("[data-question-state]");
    if (state) state.textContent = value ? "입력 완료" : "미입력";
    return { number, answer: value };
  });

  const sync = () => {
    const answers = collectAnswers();
    hidden.value = JSON.stringify(answers);
    count.textContent = String(answers.filter((row) => row.answer).length);
    return answers;
  };

  const markChanged = () => {
    sync();
    status.textContent = "답안이 변경되었습니다. 임시 저장하면 다른 기기에서도 이어서 풀 수 있습니다.";
  };
  form.addEventListener("change", markChanged);
  form.addEventListener("input", (event) => {
    if (event.target.matches('input[type="text"]')) markChanged();
  });

  saveButton?.addEventListener("click", async () => {
    sync();
    saveButton.disabled = true;
    status.textContent = "임시 저장 중입니다…";
    try {
      const response = await fetch(`/store/content/${form.dataset.contentId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ answersJson: hidden.value }),
      });
      if (!response.ok) throw new Error("임시 저장에 실패했습니다.");
      status.textContent = "임시 저장했습니다. 언제든 이어서 풀 수 있습니다.";
    } catch (error) {
      status.textContent = error.message || "임시 저장에 실패했습니다.";
    } finally {
      saveButton.disabled = false;
    }
  });

  form.addEventListener("submit", (event) => {
    sync();
    if (!window.confirm("최종 제출하면 답안을 다시 바꿀 수 없습니다. 제출할까요?")) {
      event.preventDefault();
      return;
    }
    form.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  });

  sync();
})();
