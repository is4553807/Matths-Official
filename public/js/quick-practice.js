document.addEventListener(
  "DOMContentLoaded",
  () => {
    const root =
      document.querySelector(
        "[data-quick-practice]"
      );

    if (!root) return;

    const pointButtons = [
      ...root.querySelectorAll(
        "[data-point-value]"
      ),
    ];
    const startButton =
      document.getElementById(
        "quick-start"
      );
    const nextButton =
      document.getElementById(
        "quick-next"
      );
    const form =
      document.getElementById(
        "quick-answer-form"
      );
    const answer =
      document.getElementById(
        "quick-answer"
      );
    const empty =
      document.getElementById(
        "quick-empty"
      );
    const question =
      document.getElementById(
        "quick-question"
      );
    const result =
      document.getElementById(
        "quick-result"
      );
    const prompt =
      document.getElementById(
        "quick-prompt-content"
      ) || document.getElementById(
        "quick-prompt"
      );
    const timer =
      document.getElementById(
        "quick-timer"
      );
    const seconds =
      document.getElementById(
        "timer-seconds"
      );
    const progress =
      document.getElementById(
        "timer-progress"
      );
    const circumference =
      2 * Math.PI * 52;
    let selectedPoint = "2";
    let currentAttempt = null;
    let timerId = null;
    let expiring = false;

    progress.style.strokeDasharray =
      String(circumference);

    function setMath(element, value) {
      if (!element) return;
      if (window.MatthsMath) {
        window.MatthsMath.setText(element, value);
      } else {
        element.textContent = value || "";
      }
    }

    function pointValue() {
      if (
        selectedPoint === "mixed"
      ) {
        return Math.random() < 0.5
          ? 2
          : 3;
      }

      return Number(selectedPoint);
    }

    function selectPoint(button) {
      selectedPoint =
        button.dataset.pointValue;

      pointButtons.forEach(
        (candidate) => {
          const active =
            candidate === button;
          candidate.classList.toggle(
            "active",
            active
          );
          candidate.setAttribute(
            "aria-pressed",
            String(active)
          );
        }
      );
    }

    pointButtons.forEach((button) =>
      button.addEventListener(
        "click",
        () => selectPoint(button)
      )
    );

    async function request(
      url,
      options = {}
    ) {
      const response = await fetch(
        url,
        {
          ...options,
          headers: {
            "Content-Type":
              "application/json",
            ...options.headers,
          },
        }
      );
      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "요청을 처리하지 못했습니다."
        );
      }

      return data;
    }

    function stopTimer() {
      window.clearInterval(timerId);
      timerId = null;
    }

    function updateStats(stats) {
      if (!stats) return;

      document.getElementById(
        "quick-total"
      ).textContent = stats.total;
      document.getElementById(
        "quick-accuracy"
      ).textContent = stats.accuracy;
      document.getElementById(
        "quick-average"
      ).textContent = (
        stats.averageMs / 1000
      ).toFixed(1);
    }

    function showResult(
      payload,
      stats
    ) {
      stopTimer();
      question.hidden = true;
      empty.hidden = true;
      result.hidden = false;
      timer.classList.remove(
        "warning"
      );

      const title =
        document.getElementById(
          "quick-result-title"
        );
      const copy =
        document.getElementById(
          "quick-result-copy"
        );
      const icon =
        document.getElementById(
          "quick-result-icon"
        );
      const solution =
        document.getElementById(
          "quick-solution"
        );
      const coachFeedback =
        document.getElementById(
          "quick-coach-feedback"
        );
      const coachLabel =
        document.getElementById(
          "quick-coach-label"
        );
      const coachMessage =
        document.getElementById(
          "quick-coach-message"
        );

      if (payload.expired) {
        result.dataset.state =
          "expired";
        icon.textContent = "⌛";
        title.textContent =
          "40초가 끝났습니다.";
        copy.textContent = `정답은 ${payload.answer}입니다.`;
      } else if (
        payload.correct
      ) {
        result.dataset.state =
          "correct";
        icon.textContent = "✓";
        title.textContent =
          "눈으로 정확히 풀었습니다.";
        copy.textContent = `${(
          payload.responseTimeMs /
          1000
        ).toFixed(1)}초 만에 해결했습니다.`;
      } else {
        result.dataset.state = "wrong";
        icon.textContent = "×";
        title.textContent =
          "정답까지 한 번 더 확인하세요.";
        copy.textContent = `정답은 ${payload.answer}입니다.`;
      }

      setMath(
        solution,
        payload.solution || ""
      );
      const feedback =
        payload.coachFeedback;
      const feedbackMessage =
        String(feedback?.message || "").trim();

      if (coachFeedback) {
        coachFeedback.hidden = !feedbackMessage;
        coachFeedback.dataset.mode =
          feedback?.mode || "mild";
      }
      if (coachLabel) {
        coachLabel.textContent =
          feedback?.label
            ? `Matths 코치 · ${feedback.label}`
            : "Matths 코치";
      }
      if (coachMessage) {
        coachMessage.textContent = feedbackMessage;
      }
      updateStats(stats);
    }

    async function expire() {
      if (
        !currentAttempt ||
        expiring
      ) {
        return;
      }

      expiring = true;

      try {
        const data = await request(
          `/api/quick-practice/${currentAttempt.instanceId}/expire`,
          {
            method: "POST",
            body: "{}",
          }
        );

        if (
          data.result?.pending
        ) {
          currentAttempt.deadlineAt =
            data.result.deadlineAt;
          tick();
          timerId =
            window.setInterval(
              tick,
              100
            );
          return;
        }

        showResult(
          data.result || {
            expired: true,
            answer: "",
            solution: "",
          },
          data.stats
        );
      } catch (error) {
        showMessage(error.message);
      } finally {
        expiring = false;
      }
    }

    function tick() {
      if (!currentAttempt) return;

      const remaining = Math.max(
        0,
        new Date(
          currentAttempt.deadlineAt
        ).getTime() - Date.now()
      );
      const wholeSeconds =
        Math.ceil(remaining / 1000);
      const ratio =
        remaining / 40000;

      seconds.textContent =
        wholeSeconds;
      progress.style.strokeDashoffset =
        String(
          circumference *
            (1 - ratio)
        );
      timer.classList.toggle(
        "warning",
        remaining <= 10000
      );

      if (remaining <= 0) {
        stopTimer();
        expire();
      }
    }

    function showMessage(message) {
      stopTimer();
      empty.hidden = false;
      question.hidden = true;
      result.hidden = true;
      empty.querySelector("h3")
        .textContent = message;
      empty.querySelector("p")
        .textContent =
          "잠시 후 다시 시도해 주세요.";
    }

    async function start() {
      stopTimer();
      expiring = false;
      startButton.disabled = true;
      nextButton.disabled = true;

      try {
        const data = await request(
          "/api/quick-practice/start",
          {
            method: "POST",
            body: JSON.stringify({
              pointValue:
                pointValue(),
            }),
          }
        );

        currentAttempt =
          data.attempt;
        empty.hidden = true;
        result.hidden = true;
        question.hidden = false;
        document.getElementById(
          "quick-point-label"
        ).textContent =
          `${currentAttempt.pointValue}점`;
        document.getElementById(
          "quick-topic-label"
        ).textContent =
          currentAttempt.variantLabel
            ? `${currentAttempt.topicLabel} · ${currentAttempt.variantLabel}`
            : currentAttempt.topicLabel;
        setMath(
          prompt,
          currentAttempt.prompt
        );
        answer.value = "";
        answer.disabled = false;
        form.querySelector(
          "button"
        ).disabled = false;
        answer.focus();
        tick();
        timerId =
          window.setInterval(
            tick,
            100
          );
      } catch (error) {
        showMessage(error.message);
      } finally {
        startButton.disabled = false;
        nextButton.disabled = false;
      }
    }

    form.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        if (
          !currentAttempt ||
          !answer.value.trim()
        ) {
          answer.focus();
          return;
        }

        answer.disabled = true;
        form.querySelector(
          "button"
        ).disabled = true;

        try {
          const data = await request(
            `/api/quick-practice/${currentAttempt.instanceId}/submit`,
            {
              method: "POST",
              body: JSON.stringify({
                answer:
                  answer.value,
              }),
            }
          );

          showResult(
            data.result,
            data.stats
          );
        } catch (error) {
          showMessage(error.message);
        }
      }
    );

    startButton.addEventListener(
      "click",
      start
    );
    nextButton.addEventListener(
      "click",
      start
    );
  }
);
