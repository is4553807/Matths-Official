(() => {
  const builder = document.querySelector("[data-academy-omr-builder]");
  if (!builder) return;

  const form = builder.closest("form");
  const payloadInput = form?.querySelector("[data-academy-omr-payload]");
  const editor = builder.querySelector("[data-academy-omr-editor]");
  const toggleButton = builder.querySelector("[data-academy-omr-toggle]");
  const disableButton = builder.querySelector("[data-academy-omr-disable]");
  const questionCountInput = builder.querySelector("[data-academy-omr-question-count]");
  const defaultTypeSelect = builder.querySelector("[data-academy-omr-default-type]");
  const choiceCountInput = builder.querySelector("[data-academy-omr-choice-count]");
  const answerGrid = builder.querySelector("[data-academy-omr-answers]");
  const countLabel = builder.querySelector("[data-academy-omr-count]");
  const initialElement = builder.querySelector("[data-academy-omr-initial]");

  let initial = { enabled: false };
  try {
    initial = JSON.parse(initialElement?.textContent || "{}");
  } catch (_error) {
    initial = { enabled: false };
  }

  const initialSections = Array.isArray(initial.sections) ? initial.sections : [];
  const initialDefault = initialSections.find((section) => Number(section.startNumber) === 1)
    || initialSections[0]
    || {};
  const initialQuestionCount = Number(initial.questionCount)
    || Math.max(0, ...initialSections.map((section) => Number(section.endNumber) || 0))
    || (Array.isArray(initial.answers) ? initial.answers.length : 0)
    || 30;

  let enabled = initial.enabled === true;
  let questionCount = Math.min(100, Math.max(1, initialQuestionCount));
  let defaultAnswerType = initialDefault.answerType === "SHORT_ANSWER"
    ? "SHORT_ANSWER"
    : "MULTIPLE_CHOICE";
  let choiceCount = Math.min(9, Math.max(2, Number(initialDefault.choiceCount) || 5));
  let answers = Array.isArray(initial.answers) ? initial.answers.map(String) : [];

  function readAnswerInputs() {
    answerGrid.querySelectorAll("[data-academy-omr-answer]").forEach((input) => {
      answers[Number(input.dataset.academyOmrAnswer) - 1] = input.value;
    });
  }

  function renderAnswers() {
    answerGrid.replaceChildren();
    countLabel.textContent = `${questionCount}문항`;
    for (let number = 1; number <= questionCount; number += 1) {
      const label = document.createElement("label");
      const numberLabel = document.createElement("span");
      numberLabel.textContent = `${number}번`;
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 80;
      input.placeholder = "정답";
      input.dataset.academyOmrAnswer = String(number);
      input.value = answers[number - 1] || "";
      input.setAttribute("aria-label", `${number}번 교사 정답`);
      label.append(numberLabel, input);
      answerGrid.append(label);
    }
  }

  function renderSetup() {
    questionCountInput.value = String(questionCount);
    defaultTypeSelect.value = defaultAnswerType;
    choiceCountInput.value = String(choiceCount);
    choiceCountInput.disabled = defaultAnswerType !== "MULTIPLE_CHOICE";
  }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled;
    editor.hidden = !enabled;
    builder.classList.toggle("is-open", enabled);
    toggleButton.textContent = enabled ? "답안지 사용 중" : "답안지 만들기";
    if (enabled) {
      renderSetup();
      renderAnswers();
    }
  }

  questionCountInput.addEventListener("change", () => {
    readAnswerInputs();
    const nextCount = Number.parseInt(questionCountInput.value, 10);
    if (!Number.isInteger(nextCount) || nextCount < 1 || nextCount > 100) return;
    questionCount = nextCount;
    answers = answers.slice(0, questionCount);
    renderAnswers();
  });

  defaultTypeSelect.addEventListener("change", () => {
    defaultAnswerType = defaultTypeSelect.value === "SHORT_ANSWER"
      ? "SHORT_ANSWER"
      : "MULTIPLE_CHOICE";
    choiceCountInput.disabled = defaultAnswerType !== "MULTIPLE_CHOICE";
  });

  choiceCountInput.addEventListener("change", () => {
    const nextCount = Number.parseInt(choiceCountInput.value, 10);
    if (Number.isInteger(nextCount) && nextCount >= 2 && nextCount <= 9) choiceCount = nextCount;
  });

  toggleButton.addEventListener("click", () => setEnabled(true));
  disableButton.addEventListener("click", () => {
    enabled = false;
    editor.hidden = true;
    builder.classList.remove("is-open");
    toggleButton.textContent = "답안지 만들기";
    if (payloadInput) payloadInput.value = JSON.stringify({ enabled: false });
  });

  form?.addEventListener("submit", (event) => {
    if (!enabled) return;
    readAnswerInputs();
    questionCount = Number.parseInt(questionCountInput.value, 10);
    defaultAnswerType = defaultTypeSelect.value === "SHORT_ANSWER"
      ? "SHORT_ANSWER"
      : "MULTIPLE_CHOICE";
    choiceCount = Number.parseInt(choiceCountInput.value, 10);
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 100) {
      event.preventDefault();
      window.alert("총 문항 수를 1개부터 100개 사이로 입력해 주세요.");
      return;
    }
    if (
      defaultAnswerType === "MULTIPLE_CHOICE"
      && (!Number.isInteger(choiceCount) || choiceCount < 2 || choiceCount > 9)
    ) {
      event.preventDefault();
      window.alert("객관식 선택지 수를 2개부터 9개 사이로 입력해 주세요.");
      return;
    }
    const normalizedAnswers = Array.from(
      { length: questionCount },
      (_unused, index) => String(answers[index] || "")
    );
    const missing = normalizedAnswers.findIndex((answer) => !answer.trim());
    if (missing >= 0) {
      event.preventDefault();
      window.alert(`${missing + 1}번 교사 정답을 입력해 주세요.`);
      return;
    }
    payloadInput.value = JSON.stringify({
      enabled: true,
      questionCount,
      defaultAnswerType,
      choiceCount: defaultAnswerType === "MULTIPLE_CHOICE" ? choiceCount : 5,
      answers: normalizedAnswers,
    });
  });

  setEnabled(enabled);
})();
