document.addEventListener(
  "DOMContentLoaded",
  () => {
    const form =
      document.querySelector(
        "#assessment-paper"
      );
    const questions = [
      ...document.querySelectorAll(
        "[data-question]"
      ),
    ];
    const count =
      document.querySelector(
        "#answered-count"
      );
    const progress =
      document.querySelector(
        "#answered-progress"
      );

    if (
      !form ||
      !questions.length ||
      !count ||
      !progress
    ) {
      return;
    }

    const questionAnswered = (
      question
    ) => {
      const checked =
        question.querySelector(
          "input[type='radio']:checked"
        );
      const shortAnswer =
        question.querySelector(
          "input[type='text']"
        );

      return Boolean(
        checked ||
          shortAnswer?.value.trim()
      );
    };

    const updateProgress = () => {
      const answered =
        questions.filter(
          questionAnswered
        ).length;
      const percent =
        (answered /
          questions.length) *
        100;

      count.textContent =
        String(answered);
      progress.style.width =
        `${percent}%`;
    };

    form.addEventListener(
      "input",
      updateProgress
    );
    form.addEventListener(
      "change",
      updateProgress
    );
    form.addEventListener(
      "submit",
      (event) => {
        const unanswered =
          questions.filter(
            (question) =>
              !questionAnswered(
                question
              )
          ).length;

        if (
          unanswered > 0 &&
          !window.confirm(
            `아직 ${unanswered}문항에 답하지 않았습니다. 그대로 제출할까요?`
          )
        ) {
          event.preventDefault();
        }
      }
    );

    updateProgress();
  }
);
