(() => {
  const form = document.querySelector("[data-study-hall-admin-form]");
  if (!form) return;
  const builder = form.querySelector("[data-question-builder]");
  const list = builder.querySelector("[data-question-list]");
  const output = builder.querySelector("[data-questions-json]");
  const itemCount = form.querySelector('[name="itemCount"]');
  let initial = [];
  try { initial = JSON.parse(form.dataset.initialQuestions || "[]"); } catch (_error) { initial = []; }

  const createQuestion = (question = {}) => {
    const row = document.createElement("article");
    row.className = "study-hall-question-editor";
    row.innerHTML = `
      <header><strong>문항 <span data-row-number></span></strong><button type="button" data-remove-question>삭제</button></header>
      <div class="study-hall-question-editor-grid">
        <label><span>문항 번호</span><input type="number" data-field="number" min="1" max="500" required /></label>
        <label><span>정답</span><input data-field="correctAnswer" maxlength="100" required /></label>
        <label class="wide"><span>문제 본문</span><textarea data-field="stem" rows="3" maxlength="10000"></textarea></label>
        <label class="wide"><span>선택지 1~5</span><input data-field="choices" placeholder="선택지 1 | 선택지 2 | 선택지 3 | 선택지 4 | 선택지 5" /></label>
        <label class="wide"><span>해설</span><textarea data-field="explanation" rows="4" maxlength="20000"></textarea></label>
      </div>`;
    const suggestedNumber = list.children.length + 1;
    row.querySelector('[data-field="number"]').value = question.number || suggestedNumber;
    row.querySelector('[data-field="correctAnswer"]').value = question.correctAnswer || "";
    row.querySelector('[data-field="stem"]').value = question.stem || "";
    row.querySelector('[data-field="choices"]').value = Array.isArray(question.choices) ? question.choices.join(" | ") : "";
    row.querySelector('[data-field="explanation"]').value = question.explanation || "";
    row.querySelector("[data-row-number]").textContent = String(question.number || suggestedNumber);
    row.querySelector('[data-field="number"]').addEventListener("input", (event) => { row.querySelector("[data-row-number]").textContent = event.target.value || "?"; });
    row.querySelector("[data-remove-question]").addEventListener("click", () => row.remove());
    list.append(row);
  };

  const serialize = () => Array.from(list.querySelectorAll(".study-hall-question-editor")).map((row) => ({
    number: Number(row.querySelector('[data-field="number"]').value),
    stem: row.querySelector('[data-field="stem"]').value,
    choices: row.querySelector('[data-field="choices"]').value.split("|").map((value) => value.trim()).filter(Boolean).slice(0, 5),
    correctAnswer: row.querySelector('[data-field="correctAnswer"]').value.trim(),
    explanation: row.querySelector('[data-field="explanation"]').value,
  })).filter((question) => question.number && question.correctAnswer);

  initial.forEach(createQuestion);
  builder.querySelector("[data-add-question]").addEventListener("click", () => createQuestion({}));
  form.addEventListener("submit", () => {
    const questions = serialize();
    output.value = JSON.stringify(questions);
    if (!Number(itemCount.value) && questions.length) itemCount.value = String(questions.length);
  });
})();
