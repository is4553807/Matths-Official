(() => {
  const builder = document.querySelector("[data-academy-omr-builder]");
  if (!builder) return;

  const form = builder.closest("form");
  const classworkLayout = builder.closest(".academy-classwork-layout");
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
  let questionTypes = Array.from({ length: questionCount }, (_unused, index) => {
    const questionNumber = index + 1;
    const section = initialSections.find((item) => (
      questionNumber >= Number(item.startNumber) && questionNumber <= Number(item.endNumber)
    ));
    return section?.answerType === "SHORT_ANSWER" ? "SHORT_ANSWER" : defaultAnswerType;
  });

  function readAnswerInputs() {
    answerGrid.querySelectorAll("[data-academy-omr-answer]").forEach((input) => {
      const index = Number(input.dataset.academyOmrAnswer) - 1;
      const previousAnswer = String(answers[index] || "");
      const previousAnswerIsAnOption = input instanceof HTMLSelectElement
        && [...input.options].some((option) => option.value === previousAnswer);
      if (input.value || !previousAnswer || previousAnswerIsAnOption || !(input instanceof HTMLSelectElement)) {
        answers[index] = input.value;
      }
    });
  }

  function renderAnswers() {
    answerGrid.replaceChildren();
    answerGrid.classList.toggle("is-long", questionCount > 40);
    countLabel.textContent = `${questionCount}문항`;
    for (let number = 1; number <= questionCount; number += 1) {
      const index = number - 1;
      const answerType = questionTypes[index] || defaultAnswerType;
      const card = document.createElement("div");
      card.className = `academy-omr-answer-card ${answerType === "MULTIPLE_CHOICE" ? "is-objective" : "is-subjective"}`;
      const heading = document.createElement("div");
      heading.className = "academy-omr-answer-card-heading";
      const numberLabel = document.createElement("span");
      numberLabel.textContent = `${number}번`;
      const typeButton = document.createElement("button");
      typeButton.type = "button";
      typeButton.textContent = answerType === "MULTIPLE_CHOICE" ? "주관식으로" : "객관식으로";
      typeButton.setAttribute("aria-label", `${number}번을 ${answerType === "MULTIPLE_CHOICE" ? "주관식" : "객관식"}으로 바꾸기`);
      typeButton.addEventListener("click", () => {
        readAnswerInputs();
        questionTypes[index] = answerType === "MULTIPLE_CHOICE" ? "SHORT_ANSWER" : "MULTIPLE_CHOICE";
        renderAnswers();
      });
      heading.append(numberLabel, typeButton);

      let input;
      if (answerType === "MULTIPLE_CHOICE") {
        input = document.createElement("input");
        input.type = "hidden";
        input.value = answers[index] || "";
        const bubbles = document.createElement("div");
        bubbles.className = "academy-omr-answer-bubbles";
        bubbles.setAttribute("role", "group");
        bubbles.setAttribute("aria-label", `${number}번 객관식 정답`);
        for (let choice = 1; choice <= choiceCount; choice += 1) {
          const choiceButton = document.createElement("button");
          choiceButton.type = "button";
          choiceButton.textContent = String(choice);
          choiceButton.setAttribute("aria-pressed", String(input.value === String(choice)));
          choiceButton.setAttribute("aria-label", `${number}번 정답 ${choice}번`);
          choiceButton.addEventListener("click", () => {
            input.value = String(choice);
            answers[index] = String(choice);
            bubbles.querySelectorAll("button").forEach((button) => {
              button.setAttribute("aria-pressed", String(button === choiceButton));
            });
          });
          bubbles.append(choiceButton);
        }
        input.dataset.academyOmrAnswer = String(number);
        input.setAttribute("aria-label", `${number}번 교사 정답`);
        card.append(heading, bubbles, input);
      } else {
        input = document.createElement("input");
        input.type = "text";
        input.maxLength = 80;
        input.placeholder = "정답 입력";
        input.dataset.academyOmrAnswer = String(number);
        input.value = answers[index] || "";
        input.setAttribute("aria-label", `${number}번 교사 정답`);
        card.append(heading, input);
      }
      answerGrid.append(card);
    }
  }

  function renderSetup() {
    questionCountInput.value = String(questionCount);
    defaultTypeSelect.value = defaultAnswerType;
    choiceCountInput.value = String(choiceCount);
  }

  function sectionsFromQuestionTypes() {
    const sections = [];
    questionTypes.slice(0, questionCount).forEach((answerType, index) => {
      const questionNumber = index + 1;
      const previous = sections.at(-1);
      if (previous?.answerType === answerType) {
        previous.endNumber = questionNumber;
        return;
      }
      sections.push({
        startNumber: questionNumber,
        endNumber: questionNumber,
        answerType,
        choiceCount: answerType === "MULTIPLE_CHOICE" ? choiceCount : 5,
      });
    });
    return sections;
  }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled;
    editor.hidden = !enabled;
    builder.classList.toggle("is-open", enabled);
    classworkLayout?.classList.toggle("has-open-omr", enabled);
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
    questionTypes = Array.from(
      { length: nextCount },
      (_unused, index) => questionTypes[index] || defaultAnswerType
    );
    questionCount = nextCount;
    answers = answers.slice(0, questionCount);
    renderAnswers();
  });

  defaultTypeSelect.addEventListener("change", () => {
    readAnswerInputs();
    defaultAnswerType = defaultTypeSelect.value === "SHORT_ANSWER"
      ? "SHORT_ANSWER"
      : "MULTIPLE_CHOICE";
    questionTypes = Array(questionCount).fill(defaultAnswerType);
    renderAnswers();
  });

  choiceCountInput.addEventListener("change", () => {
    readAnswerInputs();
    const nextCount = Number.parseInt(choiceCountInput.value, 10);
    if (!Number.isInteger(nextCount) || nextCount < 2 || nextCount > 9) return;
    choiceCount = nextCount;
    renderAnswers();
  });

  toggleButton.addEventListener("click", () => setEnabled(true));
  disableButton.addEventListener("click", () => {
    enabled = false;
    editor.hidden = true;
    builder.classList.remove("is-open");
    classworkLayout?.classList.remove("has-open-omr");
    toggleButton.textContent = "답안지 만들기";
    if (payloadInput) payloadInput.value = JSON.stringify({ enabled: false });
  });

  form?.addEventListener("submit", (event) => {
    if (!enabled) return;
    readAnswerInputs();
    questionCount = Number.parseInt(questionCountInput.value, 10);
    choiceCount = Number.parseInt(choiceCountInput.value, 10);
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 100) {
      event.preventDefault();
      window.alert("총 문항 수를 1개부터 100개 사이로 입력해 주세요.");
      return;
    }
    if (!Number.isInteger(choiceCount) || choiceCount < 2 || choiceCount > 9) {
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
      choiceCount,
      sections: sectionsFromQuestionTypes(),
      answers: normalizedAnswers,
    });
  });

  setEnabled(enabled);
})();
