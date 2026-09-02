(() => {
  const builder = document.querySelector("[data-academy-omr-builder]");
  if (!builder) return;

  const form = builder.closest("form");
  const payloadInput = form?.querySelector("[data-academy-omr-payload]");
  const editor = builder.querySelector("[data-academy-omr-editor]");
  const toggleButton = builder.querySelector("[data-academy-omr-toggle]");
  const disableButton = builder.querySelector("[data-academy-omr-disable]");
  const addSectionButton = builder.querySelector("[data-academy-omr-add-section]");
  const sectionList = builder.querySelector("[data-academy-omr-sections]");
  const answerGrid = builder.querySelector("[data-academy-omr-answers]");
  const countLabel = builder.querySelector("[data-academy-omr-count]");
  const initialElement = builder.querySelector("[data-academy-omr-initial]");
  let initial = { enabled: false };
  try {
    initial = JSON.parse(initialElement?.textContent || "{}");
  } catch (_error) {
    initial = { enabled: false };
  }
  let enabled = initial.enabled === true;
  let sections = enabled && Array.isArray(initial.sections) && initial.sections.length
    ? initial.sections.map((section) => ({
        startNumber: Number(section.startNumber),
        endNumber: Number(section.endNumber),
        answerType: String(section.answerType || "MULTIPLE_CHOICE"),
        choiceCount: Number(section.choiceCount || 5),
      }))
    : [
        { startNumber: 1, endNumber: 20, answerType: "MULTIPLE_CHOICE", choiceCount: 5 },
        { startNumber: 21, endNumber: 30, answerType: "SHORT_ANSWER", choiceCount: 5 },
      ];
  let answers = Array.isArray(initial.answers) ? initial.answers.map(String) : [];

  const sectionFor = (number) => sections.find(
    (section) => number >= section.startNumber && number <= section.endNumber
  );

  function readAnswerInputs() {
    const next = [];
    answerGrid.querySelectorAll("[data-academy-omr-answer]").forEach((input) => {
      next[Number(input.dataset.academyOmrAnswer) - 1] = input.value;
    });
    answers = next;
  }

  function readSectionInputs() {
    sections = [...sectionList.querySelectorAll("[data-academy-omr-section]")].map((row) => ({
      startNumber: Number(row.querySelector("[data-omr-start]").value || 0),
      endNumber: Number(row.querySelector("[data-omr-end]").value || 0),
      answerType: row.querySelector("[data-omr-type]").value,
      choiceCount: Number(row.querySelector("[data-omr-choices]").value || 5),
    }));
  }

  function renderAnswers() {
    answerGrid.replaceChildren();
    const questionCount = Math.max(0, ...sections.map((section) => Number(section.endNumber) || 0));
    countLabel.textContent = `${questionCount}문항`;
    for (let number = 1; number <= questionCount; number += 1) {
      const section = sectionFor(number);
      if (!section) continue;
      const label = document.createElement("label");
      label.className = section.answerType === "MULTIPLE_CHOICE" ? "is-objective" : "is-subjective";
      const numberLabel = document.createElement("span");
      numberLabel.textContent = `${number}번`;
      let input;
      if (section.answerType === "MULTIPLE_CHOICE") {
        input = document.createElement("select");
        input.append(new Option("정답", ""));
        for (let choice = 1; choice <= section.choiceCount; choice += 1) {
          input.append(new Option(String(choice), String(choice)));
        }
      } else {
        input = document.createElement("input");
        input.type = "text";
        input.maxLength = 80;
        input.placeholder = "정답";
      }
      input.dataset.academyOmrAnswer = String(number);
      input.value = answers[number - 1] || "";
      input.setAttribute("aria-label", `${number}번 교사 정답`);
      label.append(numberLabel, input);
      answerGrid.append(label);
    }
  }

  function renderSections() {
    sectionList.replaceChildren();
    sections.forEach((section, index) => {
      const row = document.createElement("div");
      row.className = "academy-omr-section-row";
      row.dataset.academyOmrSection = "";
      row.innerHTML = `
        <label><span>시작</span><input type="number" min="1" max="100" value="${section.startNumber}" data-omr-start></label>
        <label><span>끝</span><input type="number" min="1" max="100" value="${section.endNumber}" data-omr-end></label>
        <label><span>유형</span><select data-omr-type><option value="MULTIPLE_CHOICE">객관식</option><option value="SHORT_ANSWER">주관식</option></select></label>
        <label><span>선택지</span><input type="number" min="2" max="9" value="${section.choiceCount || 5}" data-omr-choices></label>
        <button type="button" aria-label="${index + 1}번째 문항 구간 삭제" data-omr-remove>삭제</button>`;
      row.querySelector("[data-omr-type]").value = section.answerType;
      const choices = row.querySelector("[data-omr-choices]");
      choices.disabled = section.answerType !== "MULTIPLE_CHOICE";
      row.querySelector("[data-omr-type]").addEventListener("change", (event) => {
        readAnswerInputs();
        readSectionInputs();
        choices.disabled = event.currentTarget.value !== "MULTIPLE_CHOICE";
        renderAnswers();
      });
      row.querySelectorAll("input").forEach((input) => input.addEventListener("change", () => {
        readAnswerInputs();
        readSectionInputs();
        renderAnswers();
      }));
      row.querySelector("[data-omr-remove]").addEventListener("click", () => {
        if (sections.length === 1) return;
        readAnswerInputs();
        sections.splice(index, 1);
        renderSections();
        renderAnswers();
      });
      sectionList.append(row);
    });
  }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled;
    editor.hidden = !enabled;
    builder.classList.toggle("is-open", enabled);
    toggleButton.textContent = enabled ? "답안지 사용 중" : "답안지 만들기";
    if (enabled) {
      renderSections();
      renderAnswers();
    }
  }

  toggleButton.addEventListener("click", () => setEnabled(true));
  disableButton.addEventListener("click", () => {
    enabled = false;
    editor.hidden = true;
    builder.classList.remove("is-open");
    toggleButton.textContent = "답안지 만들기";
    if (payloadInput) payloadInput.value = JSON.stringify({ enabled: false });
  });
  addSectionButton.addEventListener("click", () => {
    readAnswerInputs();
    readSectionInputs();
    const lastEnd = Math.max(0, ...sections.map((section) => section.endNumber || 0));
    if (lastEnd >= 100 || sections.length >= 20) return;
    sections.push({
      startNumber: lastEnd + 1,
      endNumber: Math.min(100, lastEnd + 5),
      answerType: "SHORT_ANSWER",
      choiceCount: 5,
    });
    renderSections();
    renderAnswers();
  });

  form?.addEventListener("submit", (event) => {
    if (!enabled) return;
    readAnswerInputs();
    readSectionInputs();
    const sorted = [...sections].sort((left, right) => left.startNumber - right.startNumber);
    let expected = 1;
    const invalid = sorted.some((section) => {
      const isInvalid = section.startNumber !== expected || section.endNumber < section.startNumber;
      expected = section.endNumber + 1;
      return isInvalid;
    });
    const questionCount = Math.max(0, ...sorted.map((section) => section.endNumber));
    const missing = Array.from({ length: questionCount }, (_unused, index) => answers[index] || "")
      .findIndex((answer) => !String(answer).trim());
    if (invalid || !questionCount || missing >= 0) {
      event.preventDefault();
      window.alert(invalid ? "문항 구간을 1번부터 빈 번호 없이 이어서 설정해 주세요." : `${missing + 1}번 교사 정답을 입력해 주세요.`);
      return;
    }
    payloadInput.value = JSON.stringify({ enabled: true, sections: sorted, answers });
  });

  setEnabled(enabled);
})();
