(() => {
  document.querySelectorAll("[data-student-omr-question]").forEach((question) => {
    const toggle = question.querySelector("[data-student-omr-toggle]");
    const objective = question.querySelector("[data-student-omr-objective]");
    const subjective = question.querySelector("[data-student-omr-subjective]");
    const modeInput = question.querySelector("[data-student-omr-mode]");
    const choiceInputs = [...objective.querySelectorAll('input[type="radio"]')];
    const choiceCount = Number(question.dataset.choiceCount || 5);
    const locked = toggle.disabled;

    function setMode(nextMode, { carryAnswer = true } = {}) {
      const objectiveMode = nextMode === "MULTIPLE_CHOICE";
      if (carryAnswer && objectiveMode) {
        const typedChoice = Number.parseInt(subjective.value, 10);
        if (String(typedChoice) === subjective.value.trim() && typedChoice >= 1 && typedChoice <= choiceCount) {
          const matchingChoice = choiceInputs.find((input) => Number(input.value) === typedChoice);
          if (matchingChoice) matchingChoice.checked = true;
        }
      }
      if (carryAnswer && !objectiveMode) {
        const selectedChoice = choiceInputs.find((input) => input.checked)?.value;
        if (selectedChoice) subjective.value = selectedChoice;
      }

      objective.hidden = !objectiveMode;
      subjective.hidden = objectiveMode;
      choiceInputs.forEach((input) => {
        input.disabled = locked || !objectiveMode;
        input.required = !locked && objectiveMode;
      });
      subjective.disabled = locked || objectiveMode;
      subjective.required = !locked && !objectiveMode;
      modeInput.value = objectiveMode ? "MULTIPLE_CHOICE" : "SHORT_ANSWER";
      question.classList.toggle("is-mode-objective", objectiveMode);
      question.classList.toggle("is-mode-subjective", !objectiveMode);
      toggle.textContent = objectiveMode ? "주관식으로 바꾸기" : "객관식으로 바꾸기";
      toggle.setAttribute("aria-label", `${question.querySelector(".student-omr-question-heading span")?.textContent || "문항"}을 ${objectiveMode ? "주관식" : "객관식"}으로 바꾸기`);
    }

    setMode(modeInput.value, { carryAnswer: false });
    toggle.addEventListener("click", () => {
      if (locked) return;
      setMode(modeInput.value === "MULTIPLE_CHOICE" ? "SHORT_ANSWER" : "MULTIPLE_CHOICE");
    });
  });
})();
