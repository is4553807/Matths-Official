(function () {
  "use strict";

  const configElement = document.getElementById(
    "wrong-note-review-config"
  );

  if (!configElement) return;

  const config = JSON.parse(configElement.textContent);
  const loading = document.getElementById("retry-loading");
  const problemPanel = document.getElementById("retry-problem");
  const errorPanel = document.getElementById("retry-error");
  const errorMessage = document.getElementById(
    "retry-error-message"
  );
  const prompt = document.getElementById("retry-prompt");
  const typeLabel = document.getElementById(
    "retry-type-label"
  );
  const answerForm = document.getElementById(
    "retry-answer-form"
  );
  const answerArea = document.getElementById(
    "retry-answer-area"
  );
  const submitButton = document.getElementById(
    "submit-retry-answer"
  );
  const hintButton = document.getElementById(
    "show-graph-hint"
  );
  const hintPanel = document.getElementById(
    "graph-hint-panel"
  );
  const closeHintButton = document.getElementById(
    "close-graph-hint"
  );
  const hintText = document.getElementById(
    "graph-hint-text"
  );
  const hintEyebrow = document.getElementById(
    "hint-panel-eyebrow"
  );
  const hintTitle = document.getElementById(
    "graph-hint-title"
  );
  const graphWrap = document.getElementById(
    "function-graph-wrap"
  );
  const graph = document.getElementById(
    "function-hint-graph"
  );
  const graphZoomOutput = document.getElementById(
    "hint-graph-zoom-output"
  );
  const noGraphMessage = document.getElementById(
    "no-graph-message"
  );
  const coachHintMessage =
    document.getElementById(
      "review-coach-message"
    );
  const conceptGuide =
    document.getElementById(
      "review-concept-guide"
    );
  const guideOrder =
    document.getElementById(
      "review-guide-order"
    );
  const guideTitle =
    document.getElementById(
      "review-guide-title"
    );
  const guideHint =
    document.getElementById(
      "review-guide-hint"
    );
  const guideSolution =
    document.getElementById(
      "review-guide-solution"
    );
  const feedback = document.getElementById(
    "retry-feedback"
  );
  const anotherButton = document.getElementById(
    "another-retry-problem"
  );
  const completeLink = document.getElementById(
    "review-complete-link"
  );
  const stateBadge = document.getElementById(
    "retry-state-badge"
  );
  const originalStatusBadge = document.getElementById(
    "original-review-status"
  );

  let currentProblem = null;
  let hintWasDrawn = false;
  let graphZoom = 1;
  let graphZoomFrame = null;

  const route = [
    config.courseId,
    config.unitId,
    config.conceptId,
  ]
    .map((value) => encodeURIComponent(value))
    .join("/");

  const reviewQuery =
    `reviewAttempt=${encodeURIComponent(config.attemptId)}`;

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options.headers || {}),
      },
      ...options,
    });

    let result = {};

    try {
      result = await response.json();
    } catch (error) {
      result = {};
    }

    if (!response.ok) {
      throw new Error(
        result.message ||
          "요청을 처리하지 못했습니다."
      );
    }

    return result;
  }

  function typesetMath(elements) {
    const targets = (
      Array.isArray(elements) ? elements : [elements]
    ).filter(Boolean);

    return targets.length
      ? window.MatthsMath?.render(targets) || Promise.resolve()
      : Promise.resolve();
  }

  function setMath(element, content) {
    if (!element) return;
    if (window.MatthsMath) {
      window.MatthsMath.setText(element, content || "");
    } else {
      element.textContent = content || "";
    }
  }

  function formatScheduledDate(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "long",
      day: "numeric",
    }).format(date);
  }

  function setReviewState(review = {}) {
    const status = review.status ||
      (review.completed ? "completed" : "") ||
      (review.scheduled ? "scheduled" : "") ||
      config.reviewStatus ||
      (config.completed ? "completed" : "pending");
    const scheduledAt = review.scheduledAt || config.scheduledAt || null;
    const scheduledDate = formatScheduledDate(scheduledAt);

    config.reviewStatus = status;
    config.completed = status === "completed";
    config.scheduledAt = status === "scheduled" ? scheduledAt : null;

    [stateBadge, originalStatusBadge].forEach((badge) => {
      if (!badge) return;
      badge.classList.toggle("completed", status === "completed");
      badge.classList.toggle("scheduled", status === "scheduled");
    });

    if (stateBadge) {
      stateBadge.textContent = status === "completed"
        ? "복습 완료"
        : status === "scheduled"
          ? `${scheduledDate || "내일"} 복습 예정`
          : "1문제 정답 시 완료";
    }

    if (originalStatusBadge) {
      originalStatusBadge.textContent = status === "completed"
        ? "복습 완료"
        : status === "scheduled"
          ? "복습 예정"
          : "복습 대기";
      originalStatusBadge.title = status === "scheduled" && scheduledDate
        ? `${scheduledDate}에 다시 복습합니다.`
        : "";
    }
  }

  function resetHint() {
    hintWasDrawn = false;
    graphZoom = 1;

    if (graphZoomFrame) {
      window.cancelAnimationFrame(
        graphZoomFrame
      );
      graphZoomFrame = null;
    }

    if (graphZoomOutput) {
      graphZoomOutput.value = "100%";
    }

    if (hintPanel) hintPanel.hidden = true;
    if (hintButton) {
      hintButton.disabled = false;
      hintButton.setAttribute(
        "aria-expanded",
        "false"
      );
    }

    if (graphWrap) graphWrap.hidden = false;
    if (noGraphMessage) noGraphMessage.hidden = true;
    if (hintEyebrow) {
      hintEyebrow.textContent =
        "문제 힌트";
    }
    if (hintTitle) {
      hintTitle.textContent =
        "이 문제의 첫 단계를 확인해 보세요.";
    }
    if (coachHintMessage) {
      coachHintMessage.hidden = true;
      coachHintMessage.textContent = "";
    }
    if (conceptGuide) {
      conceptGuide.hidden = true;
    }
  }

  function renderProblemGuide(problem) {
    const guide =
      problem?.conceptGuide;

    if (!guide || !conceptGuide) {
      return;
    }

    if (guideOrder) {
      guideOrder.textContent =
        `유형 ${guide.order || 1}`;
    }
    if (guideTitle) {
      guideTitle.textContent =
        String(guide.title || "")
          .replace(
            /^유형\s*\d+\s*·?\s*/,
            ""
          );
    }
    setMath(
      guideHint,
      guide.hint ||
        problem.hintText
    );
    setMath(
      guideSolution,
      guide.solution
    );
  }

  function createShortAnswerInput() {
    const label = document.createElement("label");
    label.className = "sr-only";
    label.htmlFor = "retry-short-answer";
    label.textContent = "정답";

    const input = document.createElement("input");
    input.id = "retry-short-answer";
    input.name = "answer";
    input.type = "text";
    input.inputMode = "text";
    input.dataset.mathInput = "";
    input.autocomplete = "off";
    input.placeholder =
      "정수를 입력하거나 분수는 1/2처럼 입력하세요.";
    input.required = true;

    answerArea.append(label, input);
    window.MatthsMathKeyboard?.attach(
      input
    );
  }

  function createChoiceInputs(choices) {
    choices.forEach((choice, index) => {
      const label = document.createElement("label");
      label.className = "answer-choice math-content";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "answer";
      input.value = String(choice.key);
      input.required = true;

      const key = document.createElement("b");
      key.textContent = String(index + 1);

      const text = document.createElement("span");
      text.textContent = String(choice.text || "");

      label.append(input, key, text);
      answerArea.append(label);
    });
  }

  function renderProblem(problem, review) {
    currentProblem = problem;
    typeLabel.textContent =
      problem.typeLabel ||
      "같은 유형 다시 풀기";
    setMath(prompt, problem.prompt);

    window.MatthsMath?.clear(answerArea);
    answerArea.replaceChildren();

    if (
      problem.inputMode === "multiple-choice" &&
      Array.isArray(problem.choices)
    ) {
      createChoiceInputs(problem.choices);
    } else {
      createShortAnswerInput();
    }

    typesetMath(answerArea);
    resetHint();
    renderProblemGuide(problem);

    feedback.hidden = true;
    feedback.className = "retry-feedback";
    feedback.replaceChildren();
    anotherButton.hidden = true;
    anotherButton.textContent = "같은 유형 다시 풀기";
    completeLink.hidden = true;
    submitButton.disabled = false;
    answerArea.disabled = false;
    setReviewState(review);

    loading.hidden = true;
    errorPanel.hidden = true;
    problemPanel.hidden = false;

    window.setTimeout(() => {
      answerArea.querySelector("input")?.focus();
    }, 0);
  }

  function showLoadError(error) {
    loading.hidden = true;
    problemPanel.hidden = true;
    errorPanel.hidden = false;
    errorMessage.textContent = error.message;
  }

  async function loadProblem() {
    loading.hidden = false;
    problemPanel.hidden = true;
    errorPanel.hidden = true;
    currentProblem = null;

    if (!config.retryAvailable) {
      showLoadError(
        new Error(
          "이전 형식으로 저장된 오답이라 같은 유형 생성 정보가 없습니다. 개념 페이지에서 새 문제를 풀어주세요."
        )
      );
      return;
    }

    try {
      const result = await requestJson(
        `/api/practice/${route}/next?${reviewQuery}`
      );

      renderProblem(result.problem, result.review);
    } catch (error) {
      showLoadError(error);
    }
  }

  function selectedAnswer() {
    const checked = answerArea.querySelector(
      'input[name="answer"]:checked'
    );

    if (checked) return checked.value;

    return (
      answerArea.querySelector(
        'input[name="answer"]'
      )?.value || ""
    ).trim();
  }

  function feedbackContent(result) {
    const strong = document.createElement("strong");
    const body = document.createElement("div");
    body.className = "math-content";
    const coachMessage = String(
      result.coachFeedback?.message || ""
    ).trim();

    if (coachMessage) {
      strong.textContent = coachMessage;
    } else if (result.correct) {
      strong.textContent = result.review?.completed
        ? "정답입니다. 이 오답의 복습이 완료됐습니다."
        : "정답입니다.";
    } else {
      strong.textContent =
        "아직 같은 구조를 놓친 부분이 있습니다.";
    }

    body.textContent = result.solution || "";
    feedback.replaceChildren(strong, body);
    feedback.hidden = false;
    feedback.className = `retry-feedback ${
      result.correct ? "correct" : "wrong"
    }`;
    typesetMath(body);
  }

  async function submitAnswer(event) {
    event.preventDefault();

    if (!currentProblem || submitButton.disabled) {
      return;
    }

    const answer = selectedAnswer();

    if (!answer) {
      feedback.hidden = false;
      feedback.className = "retry-feedback wrong";
      feedback.textContent =
        currentProblem.coachPrompt
          ?.message ||
        "정답을 먼저 입력해 주세요.";
      answerArea.querySelector("input")?.focus();
      return;
    }

    submitButton.disabled = true;

    try {
      const result = await requestJson(
        `/api/practice/${route}/attempt`,
        {
          method: "POST",
          body: JSON.stringify({
            instanceId: currentProblem.instanceId,
            answer,
          }),
        }
      );

      answerArea.disabled = true;
      hintButton.disabled = false;
      feedbackContent(result);
      setReviewState(result.review);
      completeLink.hidden = !result.review?.completed;

      if (result.correct && result.review?.completed) {
        anotherButton.hidden = true;
      } else {
        anotherButton.hidden = false;
        anotherButton.textContent = result.review?.scheduled
          ? "지금 한 번 더 풀기"
          : "같은 유형 다시 풀기";
      }
    } catch (error) {
      submitButton.disabled = false;
      feedback.hidden = false;
      feedback.className = "retry-feedback wrong";
      feedback.textContent = error.message;
    }
  }

  const SVG_NS = "http://www.w3.org/2000/svg";
  const GRAPH_WIDTH = 720;
  const GRAPH_HEIGHT = 400;
  const MINIMUM_GRAPH_ZOOM = 0.75;
  const MAXIMUM_GRAPH_ZOOM = 3;
  const GRAPH_WHEEL_SENSITIVITY = 0.0008;
  const PLOT = {
    left: 66,
    right: 24,
    top: 28,
    bottom: 54,
  };

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(
      SVG_NS,
      name
    );

    Object.entries(attributes).forEach(
      ([key, value]) => {
        element.setAttribute(key, String(value));
      }
    );

    return element;
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number)
      ? number
      : fallback;
  }

  function sampleRange(
    start,
    end,
    evaluate,
    count = 180,
    maximumAbsoluteY = 120
  ) {
    const values = [];

    for (let index = 0; index <= count; index += 1) {
      const x =
        start + ((end - start) * index) / count;
      const y = Number(evaluate(x));

      if (
        Number.isFinite(y) &&
        Math.abs(y) <= maximumAbsoluteY
      ) {
        values.push({ x, y });
      }
    }

    return values;
  }

  function sampleDiscontinuousRange(
    start,
    end,
    evaluate,
    count = 260,
    maximumAbsoluteY = 12
  ) {
    const segments = [];
    let current = [];

    for (let index = 0; index <= count; index += 1) {
      const x =
        start + ((end - start) * index) / count;
      const y = Number(evaluate(x));

      if (
        !Number.isFinite(y) ||
        Math.abs(y) > maximumAbsoluteY
      ) {
        if (current.length > 1) {
          segments.push(current);
        }
        current = [];
        continue;
      }

      current.push({ x, y });
    }

    if (current.length > 1) {
      segments.push(current);
    }

    return segments;
  }

  function buildGraphModel(
    visualization,
    zoomLevel = 1
  ) {
    const kind = visualization.kind;
    let focusX = finiteNumber(
      visualization.focusX
    );
    const halfRange = 4 / zoomLevel;
    let xMin = focusX - halfRange;
    let xMax = focusX + halfRange;
    const segments = [];
    const points = [];
    const guides = [];
    let note = "";
    let yClipLimit = 120;
    let xAxisLabel = "x";
    let yAxisLabel = "y";

    if (kind === "polynomial") {
      const coefficients =
        visualization.coefficients || {};
      const quadratic = finiteNumber(
        coefficients.quadratic
      );
      const linear = finiteNumber(
        coefficients.linear
      );
      const constant = finiteNumber(
        coefficients.constant
      );

      segments.push({
        color: "#3157f6",
        values: sampleRange(
          xMin,
          xMax,
          (x) =>
            quadratic * x * x +
            linear * x +
            constant
        ),
      });

      points.push({
        x: focusX,
        y:
          quadratic * focusX * focusX +
          linear * focusX +
          constant,
        open: false,
        color: "#3157f6",
      });
    } else if (kind === "hole-linear") {
      const slope = finiteNumber(
        visualization.slope,
        1
      );
      const intercept = finiteNumber(
        visualization.intercept
      );
      const evaluate = (x) =>
        slope * x + intercept;

      segments.push({
        color: "#3157f6",
        values: sampleRange(
          xMin,
          focusX - 0.015,
          evaluate
        ),
      });
      segments.push({
        color: "#3157f6",
        values: sampleRange(
          focusX + 0.015,
          xMax,
          evaluate
        ),
      });
      points.push({
        x: focusX,
        y: evaluate(focusX),
        open: true,
        color: "#3157f6",
      });
      note = "빈 점의 높이가 극한값입니다.";
    } else if (kind === "rationalized-root") {
      const root = Math.max(
        0.1,
        finiteNumber(visualization.root, 1)
      );
      xMin = Math.max(
        0,
        focusX - halfRange
      );
      xMax = focusX + halfRange;
      const evaluate = (x) =>
        1 / (Math.sqrt(Math.max(0, x)) + root);

      segments.push({
        color: "#3157f6",
        values: sampleRange(
          xMin,
          Math.max(xMin, focusX - 0.015),
          evaluate
        ),
      });
      segments.push({
        color: "#3157f6",
        values: sampleRange(
          focusX + 0.015,
          xMax,
          evaluate
        ),
      });
      points.push({
        x: focusX,
        y: evaluate(focusX),
        open: true,
        color: "#3157f6",
      });
      note = "유리화하면 같은 곡선의 빈 점을 읽을 수 있습니다.";
    } else if (kind === "piecewise-linear") {
      const left = visualization.left || {};
      const right = visualization.right || {};
      const leftEvaluate = (x) =>
        finiteNumber(left.slope, 1) * x +
        finiteNumber(left.constant);
      const rightEvaluate = (x) =>
        finiteNumber(right.slope, 1) * x +
        finiteNumber(right.constant);

      segments.push({
        color: "#20a078",
        width:
          visualization.focusSide === "left"
            ? 5
            : 3,
        values: sampleRange(
          xMin,
          focusX - 0.015,
          leftEvaluate
        ),
      });
      segments.push({
        color: "#704bd7",
        width:
          visualization.focusSide === "right"
            ? 5
            : 3,
        values: sampleRange(
          focusX,
          xMax,
          rightEvaluate
        ),
      });
      points.push({
        x: focusX,
        y: leftEvaluate(focusX),
        open: true,
        color: "#20a078",
      });
      points.push({
        x: focusX,
        y: rightEvaluate(focusX),
        open: false,
        color: "#704bd7",
      });
      note =
        visualization.focusSide === "left"
          ? "초록색 왼쪽 조각만 따라가세요."
          : "보라색 오른쪽 조각만 따라가세요.";
    } else if (kind === "one-sided-limits") {
      const leftLimit = finiteNumber(
        visualization.leftLimit
      );
      const rightLimit = finiteNumber(
        visualization.rightLimit
      );

      segments.push({
        color: "#20a078",
        width: 5,
        values: sampleRange(
          xMin,
          focusX - 0.015,
          (x) =>
            leftLimit +
            0.08 * Math.pow(x - focusX, 2)
        ),
      });
      segments.push({
        color: "#704bd7",
        width: 5,
        values: sampleRange(
          focusX + 0.015,
          xMax,
          (x) =>
            rightLimit -
            0.08 * Math.pow(x - focusX, 2)
        ),
      });
      points.push({
        x: focusX,
        y: leftLimit,
        open: true,
        color: "#20a078",
      });
      points.push({
        x: focusX,
        y: rightLimit,
        open: true,
        color: "#704bd7",
      });
      note =
        "주어진 좌극한·우극한 조건을 만족하는 예시 그래프입니다.";
    } else if (kind === "limit-point-example") {
      const limitValue = finiteNumber(
        visualization.limitValue
      );
      const pointValue = finiteNumber(
        visualization.pointValue
      );
      const evaluate = (x) =>
        limitValue +
        0.12 * Math.pow(x - focusX, 2);

      segments.push({
        color: "#3157f6",
        values: sampleRange(
          xMin,
          focusX - 0.015,
          evaluate
        ),
      });
      segments.push({
        color: "#3157f6",
        values: sampleRange(
          focusX + 0.015,
          xMax,
          evaluate
        ),
      });
      points.push({
        x: focusX,
        y: limitValue,
        open: true,
        color: "#3157f6",
      });
      points.push({
        x: focusX,
        y: pointValue,
        open: false,
        color: "#e45f70",
      });
      note =
        "조건을 만족하는 예시입니다. 빈 점과 실제 함수값을 구분하세요.";
    } else if (kind === "inverse-square") {
      const coefficient = Math.max(
        0.1,
        finiteNumber(
          visualization.coefficient,
          1
        )
      );
      const epsilon = 0.16;
      const evaluate = (x) =>
        coefficient /
        Math.pow(x - focusX, 2);

      segments.push({
        color: "#3157f6",
        width: 4,
        values: sampleRange(
          xMin,
          focusX - epsilon,
          evaluate,
          220
        ),
      });
      segments.push({
        color: "#3157f6",
        width: 4,
        values: sampleRange(
          focusX + epsilon,
          xMax,
          evaluate,
          220
        ),
      });
      note =
        "점선에 가까워질수록 양쪽 그래프가 모두 위로 뻗습니다.";
    } else if (kind === "table-points") {
      const xValues = Array.isArray(
        visualization.xValues
      )
        ? visualization.xValues.map((value) =>
            finiteNumber(value)
          )
        : [];
      const yValues = Array.isArray(
        visualization.yValues
      )
        ? visualization.yValues.map((value) =>
            finiteNumber(value)
          )
        : [];

      const values = xValues
        .map((x, index) => ({
          x,
          y: yValues[index],
        }))
        .filter((point) =>
          Number.isFinite(point.y)
        );

      const baseXMin = Math.min(
        focusX - 0.14,
        ...xValues
      );
      const baseXMax = Math.max(
        focusX + 0.14,
        ...xValues
      );
      const centerX =
        (baseXMin + baseXMax) / 2;
      const tableHalfRange =
        (baseXMax - baseXMin) /
        2 /
        zoomLevel;

      xMin = centerX - tableHalfRange;
      xMax = centerX + tableHalfRange;
      segments.push({
        color: "#3157f6",
        width: 2,
        dashed: true,
        values,
      });
      values.forEach((point) => {
        points.push({
          ...point,
          open: false,
          color:
            point.x < focusX
              ? "#20a078"
              : "#704bd7",
        });
      });
      note =
        "표의 값들을 점으로 옮긴 그림입니다.";
    } else if (
      kind === "limit-law-combination"
    ) {
      const fLimit = finiteNumber(
        visualization.fLimit
      );
      const gLimit = finiteNumber(
        visualization.gLimit
      );
      const fEvaluate = (x) =>
        fLimit +
        0.1 * Math.pow(x - focusX, 2);
      const gEvaluate = (x) =>
        gLimit -
        0.08 * Math.pow(x - focusX, 2);

      segments.push({
        color: "#3157f6",
        width: 4,
        values: sampleRange(
          xMin,
          xMax,
          fEvaluate
        ),
      });
      segments.push({
        color: "#704bd7",
        width: 4,
        values: sampleRange(
          xMin,
          xMax,
          gEvaluate
        ),
      });
      points.push(
        {
          x: focusX,
          y: fLimit,
          open: true,
          color: "#3157f6",
        },
        {
          x: focusX,
          y: gLimit,
          open: true,
          color: "#704bd7",
        }
      );
      guides.push(
        {
          axis: "y",
          value: fLimit,
          color: "#3157f6",
          label: `f→${roundGraphNumber(
            fLimit
          )}`,
        },
        {
          axis: "y",
          value: gLimit,
          color: "#704bd7",
          label: `g→${roundGraphNumber(
            gLimit
          )}`,
        }
      );
      note =
        visualization.note ||
        "두 함수가 각각 향하는 높이를 먼저 읽고 식의 계수대로 결합하세요.";
    } else if (
      kind === "rational-continuity"
    ) {
      const pole = finiteNumber(
        visualization.pole
      );
      const numeratorConstant =
        finiteNumber(
          visualization.numeratorConstant
        );
      const usesConstantNumerator =
        visualization.numeratorMode ===
        "constant";
      const numeratorValue =
        finiteNumber(
          visualization.numeratorValue,
          1
        );
      const evaluate = (x) => {
        const denominator = x - pole;

        if (
          Math.abs(denominator) < 0.025
        ) {
          return Number.NaN;
        }

        return (
          (usesConstantNumerator
            ? numeratorValue
            : x + numeratorConstant) /
          denominator
        );
      };

      const center =
        Math.abs(focusX - pole) <= 4
          ? (focusX + pole) / 2
          : focusX;
      xMin = center - halfRange;
      xMax = center + halfRange;
      yClipLimit = 80;
      sampleDiscontinuousRange(
        xMin,
        xMax,
        evaluate,
        320,
        yClipLimit
      ).forEach((values) => {
        segments.push({
          color: "#3157f6",
          width: 4,
          values,
        });
      });
      guides.push({
        axis: "x",
        value: pole,
        color: "#e45f70",
        label: `x=${roundGraphNumber(
          pole
        )}`,
      });

      if (
        Math.abs(focusX - pole) > 0.025
      ) {
        points.push({
          x: focusX,
          y: evaluate(focusX),
          open: false,
          color: "#20a078",
        });
      }

      const safeInterval =
        visualization.safeInterval;

      if (
        Array.isArray(safeInterval) &&
        safeInterval.length === 2
      ) {
        safeInterval.forEach(
          (value, index) => {
            guides.push({
              axis: "x",
              value: finiteNumber(value),
              color:
                index === 0
                  ? "#20a078"
                  : "#704bd7",
              label:
                index === 0
                  ? "구간 시작"
                  : "구간 끝",
            });
          }
        );
      }

      note =
        visualization.note ||
        "분모가 0이 되는 점에서는 유리함수의 그래프가 끊깁니다.";
    } else if (
      kind === "continuous-interval"
    ) {
      const left = finiteNumber(
        visualization.left,
        focusX - 2
      );
      const right = finiteNumber(
        visualization.right,
        focusX + 2
      );
      const midpoint = finiteNumber(
        visualization.midpoint,
        (left + right) / 2
      );
      const leftValue = finiteNumber(
        visualization.leftValue,
        -1
      );
      const rightValue = finiteNumber(
        visualization.rightValue,
        1
      );
      const midpointValue = finiteNumber(
        visualization.midpointValue,
        (leftValue + rightValue) / 2
      );
      const coefficients = Array.isArray(
        visualization.coefficients
      )
        ? visualization.coefficients.map(
            (value) => finiteNumber(value)
          )
        : null;
      const evaluate = coefficients?.length
        ? (x) =>
            coefficients.reduce(
              (sum, coefficient, index) =>
                sum +
                coefficient * x ** index,
              0
            )
        : (x) => {
            const firstDenominator =
              (left - midpoint) *
              (left - right);
            const middleDenominator =
              (midpoint - left) *
              (midpoint - right);
            const lastDenominator =
              (right - left) *
              (right - midpoint);

            return (
              leftValue *
                ((x - midpoint) *
                  (x - right)) /
                firstDenominator +
              midpointValue *
                ((x - left) *
                  (x - right)) /
                middleDenominator +
              rightValue *
                ((x - left) *
                  (x - midpoint)) /
                lastDenominator
            );
          };
      const padding = Math.max(
        0.6,
        (right - left) * 0.08
      );
      const visibleHalfRange =
        (right - left + 2 * padding) /
        2 /
        zoomLevel;
      const center = (left + right) / 2;

      xMin = center - visibleHalfRange;
      xMax = center + visibleHalfRange;
      const curveValues = sampleRange(
        left,
        right,
        evaluate,
        320,
        100000
      );
      segments.push({
        color: "#3157f6",
        width: 4,
        values: curveValues,
      });
      points.push(
        {
          x: left,
          y: evaluate(left),
          open: false,
          color: "#3157f6",
        },
        {
          x: right,
          y: evaluate(right),
          open: false,
          color: "#704bd7",
        }
      );

      if (
        Number.isFinite(
          Number(visualization.midpoint)
        )
      ) {
        points.push({
          x: midpoint,
          y: evaluate(midpoint),
          open: false,
          color: "#20a078",
        });
      }

      if (
        Number.isFinite(
          Number(visualization.target)
        )
      ) {
        const target = Number(
          visualization.target
        );
        guides.push({
          axis: "y",
          value: target,
          color: "#e45f70",
          label: `y=${roundGraphNumber(
            target
          )}`,
        });
        const closestPoint =
          curveValues.reduce(
            (closest, point) =>
              Math.abs(point.y - target) <
              Math.abs(
                closest.y - target
              )
                ? point
                : closest,
            curveValues[0]
          );

        if (closestPoint) {
          points.push({
            ...closestPoint,
            open: false,
            color: "#e45f70",
          });
        }
      }

      const selectedInterval =
        visualization.selectedInterval;

      if (
        Array.isArray(selectedInterval) &&
        selectedInterval.length === 2
      ) {
        selectedInterval.forEach(
          (value, index) => {
            guides.push({
              axis: "x",
              value: finiteNumber(value),
              color: "#20a078",
              label:
                index === 0
                  ? "선택 시작"
                  : "선택 끝",
            });
          }
        );
      }

      yClipLimit = 100000;
      note =
        visualization.note ||
        "연속인 곡선이 두 끝 높이 사이의 값을 빠짐없이 지나는지 확인하세요.";
    } else if (kind === "algebra-exp-log") {
      const rawBase = finiteNumber(
        visualization.base,
        2
      );
      const base =
        rawBase > 0 &&
        Math.abs(rawBase - 1) > 0.0001
          ? rawBase
          : 2;
      const shiftX = finiteNumber(
        visualization.shiftX
      );
      const shiftY = finiteNumber(
        visualization.shiftY
      );
      const exponentOffset = finiteNumber(
        visualization.exponentOffset
      );
      const functionType =
        visualization.functionType || "exp";
      const evaluateExponential = (x) =>
        base **
          (
            (visualization.reflectY ? -1 : 1) *
              (x - shiftX) +
            exponentOffset
          ) +
        shiftY;
      const evaluateLogarithm = (x) =>
        x > shiftX
          ? Math.log(x - shiftX) /
              Math.log(base) +
            shiftY
          : Number.NaN;

      yClipLimit = 2000;

      if (
        functionType === "exp" ||
        functionType === "both"
      ) {
        segments.push({
          color: "#3157f6",
          width: 4,
          values: sampleRange(
            xMin,
            xMax,
            evaluateExponential,
            260,
            yClipLimit
          ),
        });
        guides.push({
          axis: "y",
          value: shiftY,
          color: "#e05b6f",
          label: `y=${shiftY}`,
        });
      }

      if (
        functionType === "log" ||
        functionType === "both"
      ) {
        segments.push({
          color: "#20a078",
          width: 4,
          values: sampleRange(
            Math.max(xMin, shiftX + 0.002),
            xMax,
            evaluateLogarithm,
            280,
            yClipLimit
          ),
        });
        guides.push({
          axis: "x",
          value: shiftX,
          color: "#e05b6f",
          label: `x=${shiftX}`,
        });
      }

      if (visualization.showInverseLine) {
        segments.push({
          color: "#9aa4ba",
          width: 2,
          dashed: true,
          values: [
            { x: xMin, y: xMin },
            { x: xMax, y: xMax },
          ],
        });
      }

      const focusFunction =
        visualization.focusFunction ||
        (functionType === "log" ? "log" : "exp");
      const focusY =
        focusFunction === "log"
          ? evaluateLogarithm(focusX)
          : evaluateExponential(focusX);

      if (Number.isFinite(focusY)) {
        points.push({
          x: focusX,
          y: focusY,
          open: false,
          color:
            focusFunction === "log"
              ? "#20a078"
              : "#3157f6",
        });
      }

      if (
        Number.isFinite(
          Number(visualization.targetY)
        )
      ) {
        const targetY = Number(
          visualization.targetY
        );
        guides.push({
          axis: "y",
          value: targetY,
          color: "#704bd7",
          label: `y=${roundGraphNumber(targetY)}`,
        });
      }

      note =
        visualization.note ||
        "표시한 점과 점근선을 문제의 식과 함께 확인하세요.";
    } else if (kind === "algebra-trig") {
      const functionName =
        ["sin", "cos", "tan"].includes(
          visualization.functionName
        )
          ? visualization.functionName
          : "sin";
      const amplitude = finiteNumber(
        visualization.amplitude,
        1
      );
      const frequency = Math.max(
        0.1,
        Math.abs(
          finiteNumber(
            visualization.frequency,
            1
          )
        )
      );
      const verticalShift = finiteNumber(
        visualization.verticalShift
      );
      const focusDegree = finiteNumber(
        visualization.focusDegree,
        90
      );
      const degreeHalfRange = 180 / zoomLevel;

      xMin = focusDegree - degreeHalfRange;
      xMax = focusDegree + degreeHalfRange;
      xAxisLabel = "x°";

      const evaluate = (degree) => {
        const radians =
          (frequency * degree * Math.PI) /
          180;

        if (functionName === "cos") {
          return (
            amplitude * Math.cos(radians) +
            verticalShift
          );
        }

        if (functionName === "tan") {
          const cosine = Math.cos(radians);

          return Math.abs(cosine) < 0.025
            ? Number.NaN
            : amplitude * Math.tan(radians) +
                verticalShift;
        }

        return (
          amplitude * Math.sin(radians) +
          verticalShift
        );
      };

      if (functionName === "tan") {
        sampleDiscontinuousRange(
          xMin,
          xMax,
          evaluate,
          320,
          Math.max(8, Math.abs(amplitude) * 5)
        ).forEach((values) => {
          segments.push({
            color: "#3157f6",
            width: 4,
            values,
          });
        });
      } else {
        segments.push({
          color: "#3157f6",
          width: 4,
          values: sampleRange(
            xMin,
            xMax,
            evaluate,
            300
          ),
        });
      }

      const focusY = evaluate(focusDegree);

      if (Number.isFinite(focusY)) {
        points.push({
          x: focusDegree,
          y: focusY,
          open: false,
          color: "#20a078",
        });
      }

      guides.push({
        axis: "y",
        value: verticalShift,
        color: "#9aa4ba",
        label: `y=${verticalShift}`,
      });
      note =
        visualization.note ||
        "표시한 각에서 그래프의 높이가 삼각함수 값입니다.";
    } else if (kind === "algebra-sequence") {
      const values = Array.isArray(
        visualization.values
      )
        ? visualization.values
            .map((value) => Number(value))
            .filter(Number.isFinite)
            .slice(0, 10)
        : [];

      if (!values.length) return null;

      const focusIndex = Math.max(
        1,
        Math.min(
          values.length,
          Math.round(
            finiteNumber(
              visualization.focusIndex,
              values.length
            )
          )
        )
      );
      const baseHalfRange = Math.max(
        3,
        (values.length + 1) / 2
      );
      const visibleHalfRange =
        baseHalfRange / zoomLevel;

      xMin = focusIndex - visibleHalfRange;
      xMax = focusIndex + visibleHalfRange;
      segments.push({
        color: "#94a0bd",
        width: 2,
        dashed: true,
        values: values.map((value, index) => ({
          x: index + 1,
          y: value,
        })),
      });
      values.forEach((value, index) => {
        points.push({
          x: index + 1,
          y: value,
          open: false,
          color:
            index + 1 === focusIndex
              ? "#20a078"
              : "#3157f6",
        });
      });
      focusX = focusIndex;
      yClipLimit = 100000;
      xAxisLabel = "n";
      yAxisLabel = "aₙ";
      note =
        visualization.note ||
        "자연수 위치에 찍힌 점들의 규칙을 확인하세요.";
    } else if (
      String(kind).startsWith("calculus-")
    ) {
      const coefficients = Array.isArray(
        visualization.coefficients
      )
        ? visualization.coefficients.map(
            (value) => finiteNumber(value)
          )
        : null;
      const quadratic = finiteNumber(
        visualization.q,
        finiteNumber(
          visualization.scale,
          1
        )
      );
      const linear = finiteNumber(
        visualization.l,
        finiteNumber(
          visualization.slope
        )
      );
      const constant = finiteNumber(
        visualization.c,
        finiteNumber(
          visualization.constant
        )
      );
      focusX = finiteNumber(
        visualization.point,
        finiteNumber(
          visualization.time,
          finiteNumber(
            visualization.root,
            finiteNumber(
              visualization.shift,
              finiteNumber(
                visualization.vertexX
              )
            )
          )
        )
      );
      xMin = focusX - halfRange;
      xMax = focusX + halfRange;

      const hasFunctionModel =
        Boolean(coefficients?.length) ||
        [
          visualization.q,
          visualization.l,
          visualization.c,
          visualization.scale,
          visualization.constant,
          visualization.vertexX,
        ].some(
          (value) =>
            Number.isFinite(
              Number(value)
            )
        );
      const suppliedSlope =
        finiteNumber(
          visualization.slope,
          0
        );
      const suppliedPointValue =
        finiteNumber(
          visualization.value,
          finiteNumber(
            visualization.fA,
            finiteNumber(
              visualization.y,
              0
            )
          )
        );
      const evaluate = !hasFunctionModel &&
        [
          "calculus-tangent",
          "calculus-definition",
          "calculus-line",
        ].includes(kind)
        ? (x) =>
            suppliedPointValue +
            suppliedSlope *
              (x - focusX)
        : coefficients?.length
        ? (x) =>
            coefficients.reduce(
              (sum, coefficient, index) =>
                sum +
                coefficient * x ** index,
              0
            )
        : Number.isFinite(
              Number(visualization.vertexX)
            )
          ? (x) =>
              quadratic *
                (
                  x -
                  finiteNumber(
                    visualization.vertexX
                  )
                ) **
                  2 +
              constant
          : (x) =>
              quadratic * x * x +
              linear * x +
              constant;
      const derivative = coefficients?.length
        ? (x) =>
            coefficients.reduce(
              (sum, coefficient, index) =>
                index === 0
                  ? sum
                  : sum +
                    index *
                      coefficient *
                      x ** (index - 1),
              0
            )
        : (x) =>
            2 * quadratic * x + linear;

      segments.push({
        color: "#3157f6",
        width: 4,
        values: sampleRange(
          xMin,
          xMax,
          evaluate
        ),
      });

      if (
        [
          "calculus-tangent",
          "calculus-line",
          "calculus-secant",
          "calculus-mvt",
        ].includes(kind) &&
        hasFunctionModel
      ) {
        const pointY = evaluate(focusX);
        const tangentSlope = finiteNumber(
          visualization.slope,
          derivative(focusX)
        );
        segments.push({
          color: "#704bd7",
          width: 3,
          dashed: true,
          values: sampleRange(
            xMin,
            xMax,
            (x) =>
              pointY +
              tangentSlope * (x - focusX)
          ),
        });
      }

      points.push({
        x: focusX,
        y: evaluate(focusX),
        open: false,
        color: "#20a078",
      });

      const left = finiteNumber(
        visualization.left,
        finiteNumber(visualization.a, NaN)
      );
      const right = finiteNumber(
        visualization.right,
        finiteNumber(
          visualization.b,
          finiteNumber(
            visualization.end,
            NaN
          )
        )
      );

      if (Number.isFinite(left)) {
        guides.push({
          axis: "x",
          value: left,
          color: "#9aa4ba",
          label: `x=${left}`,
        });
      }
      if (Number.isFinite(right)) {
        guides.push({
          axis: "x",
          value: right,
          color: "#20a078",
          label: `x=${right}`,
        });
      }

      note =
        !hasFunctionModel &&
        [
          "calculus-tangent",
          "calculus-definition",
          "calculus-line",
        ].includes(kind)
          ? "문제에서 정해진 한 점과 기울기만 표시했습니다. 원함수 전체 모양은 조건만으로 결정되지 않습니다."
          :
        kind.includes("area") ||
        kind.includes("definite") ||
        kind.includes("integral") ||
        kind.includes("velocity")
          ? "경계와 함수의 부호를 확인한 뒤 누적된 넓이를 읽으세요."
          : "파란 곡선의 변화와 초록 점에서의 기울기를 함께 읽으세요.";
      yClipLimit = 1000;
      xAxisLabel =
        kind.includes("motion") ||
        kind.includes("velocity")
          ? "t"
          : "x";
    } else {
      return null;
    }

    return {
      focusX,
      xMin,
      xMax,
      segments,
      points,
      guides,
      note,
      yClipLimit,
      xAxisLabel,
      yAxisLabel,
    };
  }

  function roundGraphNumber(value) {
    const rounded =
      Math.round(Number(value) * 1000) /
      1000;

    return Object.is(rounded, -0)
      ? 0
      : rounded;
  }

  function drawText(parent, text, x, y, options = {}) {
    const label = svgElement("text", {
      x,
      y,
      fill: options.fill || "#7b8499",
      "font-size": options.size || 12,
      "font-weight": options.weight || 700,
      "text-anchor": options.anchor || "middle",
      "font-family":
        "Pretendard, -apple-system, BlinkMacSystemFont, sans-serif",
    });

    label.textContent = text;
    parent.append(label);
    return label;
  }

  function renderProbabilityVisualization(
    visualization
  ) {
    const kind = String(
      visualization?.kind || ""
    );

    if (!kind.startsWith("probability-")) {
      return false;
    }

    graph.replaceChildren();
    const title = svgElement("title", {
      id: "probability-hint-title",
    });
    title.textContent =
      "현재 확률과 통계 문제의 조건을 나타낸 시각 힌트";
    graph.append(title);

    const headingByKind = {
      "probability-counting":
        "자리와 선택지를 나누어 세어보세요.",
      "probability-venn":
        "사건의 영역과 겹침을 구분하세요.",
      "probability-tree":
        "한 경로의 가지 확률을 곱하세요.",
      "probability-distribution":
        "막대의 위치와 높이를 함께 읽으세요.",
      "probability-binomial":
        "성공 횟수별 확률을 비교하세요.",
      "probability-normal":
        "평균과 표준편차를 기준으로 넓이를 읽으세요.",
      "probability-sampling":
        "모집단과 선택된 표본을 구분하세요.",
      "probability-confidence":
        "중심에서 오차한계만큼 양쪽으로 이동하세요.",
      "probability-concept":
        "주어진 수를 개념의 핵심 관계에 표시하세요.",
    };

    drawText(
      graph,
      headingByKind[kind] ||
        "그림의 영역과 문제의 수를 연결해 보세요.",
      360,
      35,
      {
        size: 17,
        weight: 800,
        fill: "#17213b",
      }
    );

    if (kind === "probability-venn") {
      const circles = [
        {
          cx: 300,
          stroke: "#3157f6",
          fill: "#e7ecff",
          label: "A",
        },
        {
          cx: 420,
          stroke: "#704bd7",
          fill: "#eee8ff",
          label: "B",
        },
      ];
      const frame = svgElement("rect", {
        x: 65,
        y: 75,
        width: 590,
        height: 280,
        rx: 24,
        fill: "#f7f8fc",
        stroke: "#dfe4ef",
        "stroke-width": 2,
      });
      graph.append(frame);
      circles.forEach((item) => {
        graph.append(
          svgElement("circle", {
            cx: item.cx,
            cy: 215,
            r: 112,
            fill: item.fill,
            "fill-opacity": 0.7,
            stroke: item.stroke,
            "stroke-width": 3,
          })
        );
        drawText(
          graph,
          item.label,
          item.cx + (item.label === "A" ? -50 : 50),
          220,
          {
            size: 23,
            fill: item.stroke,
          }
        );
      });
      drawText(
        graph,
        visualization.conditional
          ? `조건: ${visualization.conditional}`
          : "A ∩ B",
        360,
        220,
        {
          size: 15,
          fill: "#17213b",
        }
      );
    } else if (kind === "probability-tree") {
      const nodes = [
        [95, 215, "시작"],
        [335, 125, "A"],
        [335, 305, "Aᶜ"],
        [620, 92, "B"],
        [620, 158, "Bᶜ"],
        [620, 272, "B"],
        [620, 338, "Bᶜ"],
      ];
      [
        [0, 1],
        [0, 2],
        [1, 3],
        [1, 4],
        [2, 5],
        [2, 6],
      ].forEach(([from, to], index) => {
        graph.append(
          svgElement("line", {
            x1: nodes[from][0] + 26,
            y1: nodes[from][1],
            x2: nodes[to][0] - 26,
            y2: nodes[to][1],
            stroke:
              index === 0 || index === 2
                ? "#3157f6"
                : "#dfe4ef",
            "stroke-width":
              index === 0 || index === 2 ? 4 : 2,
          })
        );
      });
      nodes.forEach(([x, y, label], index) => {
        graph.append(
          svgElement("circle", {
            cx: x,
            cy: y,
            r: 27,
            fill:
              [0, 1, 3].includes(index)
                ? "#e7ecff"
                : "#f5f7fb",
            stroke:
              [0, 1, 3].includes(index)
                ? "#3157f6"
                : "#dfe4ef",
            "stroke-width": 2,
          })
        );
        drawText(graph, label, x, y + 5, {
          size: 13,
          fill: "#17213b",
        });
      });
      const first = finiteNumber(
        visualization.first,
        finiteNumber(
          visualization.probability,
          0.5
        )
      );
      const conditional = finiteNumber(
        visualization.conditional,
        first
      );
      drawText(
        graph,
        `${roundGraphNumber(first)} × ${roundGraphNumber(
          conditional
        )} = ${roundGraphNumber(
          first * conditional
        )}`,
        360,
        400,
        {
          size: 22,
          fill: "#3157f6",
        }
      );
    } else if (
      kind === "probability-distribution" ||
      kind === "probability-binomial"
    ) {
      let values = Array.isArray(
        visualization.probabilities
      )
        ? visualization.probabilities
            .map(Number)
            .filter(Number.isFinite)
        : [];

      if (!values.length) {
        const n = Math.max(
          3,
          Math.min(
            12,
            Math.round(
              finiteNumber(visualization.n, 6)
            )
          )
        );
        const p = Math.max(
          0.05,
          Math.min(
            0.95,
            finiteNumber(visualization.p, 0.5)
          )
        );
        const choose = (total, selected) => {
          let value = 1;
          const count = Math.min(
            selected,
            total - selected
          );
          for (
            let index = 1;
            index <= count;
            index += 1
          ) {
            value =
              (value *
                (total - count + index)) /
              index;
          }
          return value;
        };
        values = Array.from(
          { length: n + 1 },
          (_, index) =>
            choose(n, index) *
            p ** index *
            (1 - p) ** (n - index)
        );
      }

      const maximum = Math.max(...values, 0.01);
      const width = 520 / values.length;
      values.forEach((value, index) => {
        const height = (value / maximum) * 245;
        graph.append(
          svgElement("rect", {
            x: 100 + index * width + 3,
            y: 350 - height,
            width: Math.max(7, width - 6),
            height,
            rx: 5,
            fill:
              index ===
              Math.round(
                finiteNumber(
                  visualization.focus,
                  -1
                )
              )
                ? "#20a078"
                : "#3157f6",
          })
        );
        drawText(
          graph,
          index,
          100 + index * width + width / 2,
          375,
          {
            size: 11,
            fill: "#7b8499",
          }
        );
      });
    } else if (kind === "probability-normal") {
      const points = [];
      for (let index = 0; index <= 180; index += 1) {
        const z = -4 + (8 * index) / 180;
        points.push({
          x: 80 + (560 * index) / 180,
          y: 345 - 245 * Math.exp(-0.5 * z * z),
        });
      }
      graph.append(
        svgElement("line", {
          x1: 70,
          y1: 345,
          x2: 650,
          y2: 345,
          stroke: "#7b8499",
          "stroke-width": 2,
        })
      );
      graph.append(
        svgElement("path", {
          d: points
            .map(
              (point, index) =>
                `${index ? "L" : "M"}${point.x.toFixed(
                  2
                )},${point.y.toFixed(2)}`
            )
            .join(" "),
          fill: "none",
          stroke: "#3157f6",
          "stroke-width": 5,
        })
      );
      graph.append(
        svgElement("line", {
          x1: 360,
          y1: 90,
          x2: 360,
          y2: 345,
          stroke: "#e45f70",
          "stroke-width": 3,
          "stroke-dasharray": "7 7",
        })
      );
      drawText(
        graph,
        `μ=${roundGraphNumber(
          finiteNumber(visualization.mean)
        )}`,
        360,
        382,
        {
          size: 14,
          fill: "#e45f70",
        }
      );
    } else if (
      kind === "probability-sampling"
    ) {
      const sample = Math.max(
        5,
        Math.min(
          25,
          Math.round(
            finiteNumber(
              visualization.sample,
              visualization.sampleSize || 12
            )
          )
        )
      );
      for (let index = 0; index < 60; index += 1) {
        const selected =
          (index * 17 + 5) % 60 < sample;
        graph.append(
          svgElement("circle", {
            cx: 118 + (index % 12) * 44,
            cy:
              105 + Math.floor(index / 12) * 58,
            r: selected ? 13 : 9,
            fill: selected
              ? "#3157f6"
              : "#dfe4ef",
          })
        );
      }
      drawText(
        graph,
        `모집단 60명 중 표본 ${sample}명`,
        360,
        400,
        {
          size: 17,
          fill: "#3157f6",
        }
      );
    } else if (
      kind === "probability-confidence"
    ) {
      const center = finiteNumber(
        visualization.center,
        50
      );
      const margin = Math.max(
        0.2,
        Math.abs(
          finiteNumber(
            visualization.margin,
            2
          )
        )
      );
      const scale = Math.min(80, 210 / margin);
      const left = 360 - margin * scale;
      const right = 360 + margin * scale;
      graph.append(
        svgElement("line", {
          x1: 80,
          y1: 225,
          x2: 640,
          y2: 225,
          stroke: "#7b8499",
          "stroke-width": 3,
        })
      );
      graph.append(
        svgElement("line", {
          x1: left,
          y1: 225,
          x2: right,
          y2: 225,
          stroke: "#3157f6",
          "stroke-width": 13,
          "stroke-linecap": "round",
        })
      );
      [left, right].forEach((x) => {
        graph.append(
          svgElement("line", {
            x1: x,
            y1: 185,
            x2: x,
            y2: 265,
            stroke: "#3157f6",
            "stroke-width": 4,
          })
        );
      });
      graph.append(
        svgElement("circle", {
          cx: 360,
          cy: 225,
          r: 11,
          fill: "#e45f70",
        })
      );
      drawText(
        graph,
        roundGraphNumber(center - margin),
        left,
        300,
        {
          size: 14,
          fill: "#3157f6",
        }
      );
      drawText(
        graph,
        roundGraphNumber(center),
        360,
        170,
        {
          size: 15,
          fill: "#e45f70",
        }
      );
      drawText(
        graph,
        roundGraphNumber(center + margin),
        right,
        300,
        {
          size: 14,
          fill: "#3157f6",
        }
      );
    } else {
      const slots = Math.max(
        3,
        Math.min(
          8,
          Math.round(
            finiteNumber(
              visualization.slots,
              visualization.items || 5
            )
          )
        )
      );
      for (let index = 0; index < slots; index += 1) {
        const x =
          100 +
          index *
            (520 / Math.max(1, slots - 1));
        graph.append(
          svgElement("rect", {
            x: x - 28,
            y: 155,
            width: 56,
            height: 70,
            rx: 14,
            fill: "#e7ecff",
            stroke: "#3157f6",
            "stroke-width": 2,
          })
        );
        drawText(graph, index + 1, x, 198, {
          size: 18,
          fill: "#3157f6",
        });
      }
      drawText(
        graph,
        "각 칸·막대·표본이 무엇을 뜻하는지 문제에 표시해 보세요.",
        360,
        310,
        {
          size: 16,
          fill: "#7b8499",
        }
      );
    }

    return true;
  }

  function renderGraph(visualization) {
    if (
      renderProbabilityVisualization(
        visualization || {}
      )
    ) {
      return true;
    }

    const model = buildGraphModel(
      visualization || {},
      graphZoom
    );

    if (!model) return false;

    const baseModel =
      Math.abs(graphZoom - 1) < 0.0001
        ? model
        : buildGraphModel(
            visualization || {},
            1
          );

    const title = svgElement("title", {
      id: "function-graph-title",
    });
    title.textContent =
      "현재 문제의 조건을 나타낸 함수 그래프";

    const description = svgElement("desc", {
      id: "function-graph-description",
    });
    description.textContent =
      `현재 문제의 함수, 핵심 점, 점근선과 기준선을 표시한 좌표평면입니다. 현재 확대율은 ${Math.round(
        graphZoom * 100
      )}퍼센트입니다.`;

    graph.replaceChildren(title, description);

    const yClipLimit =
      Number(baseModel.yClipLimit) > 0
        ? Number(baseModel.yClipLimit)
        : 120;
    const allY = [
      0,
      ...baseModel.segments.flatMap((segment) =>
        segment.values.map((point) => point.y)
      ),
      ...baseModel.points.map((point) => point.y),
      ...baseModel.guides
        .filter((guide) => guide.axis === "y")
        .map((guide) => guide.value),
    ].filter(
      (value) =>
        Number.isFinite(value) &&
        Math.abs(value) <= yClipLimit
    );

    let yMin = Math.min(...allY);
    let yMax = Math.max(...allY);

    if (yMax - yMin < 2) {
      yMin -= 1;
      yMax += 1;
    }

    const yPadding = (yMax - yMin) * 0.14;
    yMin -= yPadding;
    yMax += yPadding;

    const focusPoints = baseModel.points.filter(
      (point) =>
        Math.abs(
          point.x - baseModel.focusX
        ) < 0.0001
    );
    const referencePoints = focusPoints.length
      ? focusPoints
      : baseModel.points;
    const yCenter = referencePoints.length
      ? referencePoints.reduce(
          (sum, point) => sum + point.y,
          0
        ) / referencePoints.length
      : (yMin + yMax) / 2;
    const visibleYHalfRange =
      (yMax - yMin) / 2 / graphZoom;

    yMin = yCenter - visibleYHalfRange;
    yMax = yCenter + visibleYHalfRange;

    if (graphZoomOutput) {
      graphZoomOutput.value = `${Math.round(
        graphZoom * 100
      )}%`;
    }

    const plotWidth =
      GRAPH_WIDTH - PLOT.left - PLOT.right;
    const plotHeight =
      GRAPH_HEIGHT - PLOT.top - PLOT.bottom;
    const mapX = (x) =>
      PLOT.left +
      ((x - model.xMin) /
        (model.xMax - model.xMin || 1)) *
        plotWidth;
    const mapY = (y) =>
      PLOT.top +
      ((yMax - y) / (yMax - yMin || 1)) *
        plotHeight;

    const defs = svgElement("defs");
    const clipPath = svgElement("clipPath", {
      id: "review-graph-clip",
    });
    clipPath.append(
      svgElement("rect", {
        x: PLOT.left,
        y: PLOT.top,
        width: plotWidth,
        height: plotHeight,
        rx: 8,
      })
    );
    defs.append(clipPath);
    graph.append(defs);

    graph.append(
      svgElement("rect", {
        x: PLOT.left,
        y: PLOT.top,
        width: plotWidth,
        height: plotHeight,
        rx: 8,
        fill: "#fbfcff",
        stroke: "#e3e8f3",
      })
    );

    const grid = svgElement("g", {
      stroke: "#e7ebf5",
      "stroke-width": 1,
    });

    for (let index = 0; index <= 8; index += 1) {
      const x =
        PLOT.left + (plotWidth * index) / 8;
      grid.append(
        svgElement("line", {
          x1: x,
          y1: PLOT.top,
          x2: x,
          y2: PLOT.top + plotHeight,
        })
      );
    }

    for (let index = 0; index <= 6; index += 1) {
      const y =
        PLOT.top + (plotHeight * index) / 6;
      grid.append(
        svgElement("line", {
          x1: PLOT.left,
          y1: y,
          x2: PLOT.left + plotWidth,
          y2: y,
        })
      );
    }

    graph.append(grid);

    const axes = svgElement("g", {
      stroke: "#8b93a8",
      "stroke-width": 1.5,
    });
    const hasXAxis =
      yMin <= 0 && yMax >= 0;
    const hasYAxis =
      model.xMin <= 0 &&
      model.xMax >= 0;
    const xAxisY = hasXAxis
      ? mapY(0)
      : PLOT.top + plotHeight;
    const yAxisX = hasYAxis
      ? mapX(0)
      : PLOT.left;

    if (hasXAxis) {
      axes.append(
        svgElement("line", {
          x1: PLOT.left,
          y1: xAxisY,
          x2: PLOT.left + plotWidth,
          y2: xAxisY,
        })
      );
    }

    if (hasYAxis) {
      axes.append(
        svgElement("line", {
          x1: yAxisX,
          y1: PLOT.top,
          x2: yAxisX,
          y2: PLOT.top + plotHeight,
        })
      );
    }

    graph.append(axes);

    if (hasXAxis) {
      drawText(
        graph,
        model.xAxisLabel || "x",
        PLOT.left + plotWidth + 9,
        xAxisY + 4,
        { size: 12 }
      );
    }

    if (hasYAxis) {
      drawText(
        graph,
        model.yAxisLabel || "y",
        yAxisX + 9,
        PLOT.top - 10,
        { size: 12 }
      );
    }

    const guideLayer = svgElement("g", {
      "clip-path": "url(#review-graph-clip)",
    });

    model.guides.forEach((guide) => {
      const value = Number(guide.value);

      if (!Number.isFinite(value)) return;

      if (
        guide.axis === "x" &&
        value >= model.xMin &&
        value <= model.xMax
      ) {
        const x = mapX(value);

        guideLayer.append(
          svgElement("line", {
            x1: x,
            y1: PLOT.top,
            x2: x,
            y2: PLOT.top + plotHeight,
            stroke: guide.color || "#e05b6f",
            "stroke-width": 2,
            "stroke-dasharray": "5 6",
          })
        );
        drawText(
          guideLayer,
          guide.label || `x=${roundGraphNumber(value)}`,
          x + 7,
          PLOT.top + 17,
          {
            fill: guide.color || "#e05b6f",
            size: 11,
            weight: 800,
            anchor: "start",
          }
        );
      } else if (
        guide.axis === "y" &&
        value >= yMin &&
        value <= yMax
      ) {
        const y = mapY(value);

        guideLayer.append(
          svgElement("line", {
            x1: PLOT.left,
            y1: y,
            x2: PLOT.left + plotWidth,
            y2: y,
            stroke: guide.color || "#704bd7",
            "stroke-width": 2,
            "stroke-dasharray": "5 6",
          })
        );
        drawText(
          guideLayer,
          guide.label || `y=${roundGraphNumber(value)}`,
          PLOT.left + plotWidth - 8,
          Math.max(PLOT.top + 14, y - 7),
          {
            fill: guide.color || "#704bd7",
            size: 11,
            weight: 800,
            anchor: "end",
          }
        );
      }
    });

    graph.append(guideLayer);

    const focusXPosition = mapX(model.focusX);
    graph.append(
      svgElement("line", {
        x1: focusXPosition,
        y1: PLOT.top,
        x2: focusXPosition,
        y2: PLOT.top + plotHeight,
        stroke: "#8da1ff",
        "stroke-width": 2,
        "stroke-dasharray": "6 6",
        "clip-path": "url(#review-graph-clip)",
      })
    );
    drawText(
      graph,
      `x = ${model.focusX}`,
      focusXPosition,
      PLOT.top + plotHeight + 24,
      {
        fill: "#3157f6",
        size: 11,
        weight: 800,
      }
    );

    const curves = svgElement("g", {
      "clip-path": "url(#review-graph-clip)",
      fill: "none",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });

    model.segments.forEach((segment) => {
      if (!segment.values.length) return;

      const data = segment.values
        .map(
          (point, index) =>
            `${index ? "L" : "M"} ${mapX(
              point.x
            ).toFixed(2)} ${mapY(
              point.y
            ).toFixed(2)}`
        )
        .join(" ");

      curves.append(
        svgElement("path", {
          d: data,
          stroke: segment.color || "#3157f6",
          "stroke-width": segment.width || 4,
          ...(segment.dashed
            ? { "stroke-dasharray": "6 6" }
            : {}),
        })
      );
    });

    graph.append(curves);

    const pointLayer = svgElement("g", {
      "clip-path": "url(#review-graph-clip)",
    });

    model.points.forEach((point) => {
      const circle = svgElement("circle", {
        cx: mapX(point.x),
        cy: mapY(point.y),
        r: point.open ? 7 : 6,
        fill: point.open ? "#fff" : point.color,
        stroke: point.color,
        "stroke-width": point.open ? 4 : 2,
      });
      pointLayer.append(circle);
    });

    graph.append(pointLayer);

    if (model.note) {
      const note = drawText(
        graph,
        model.note,
        PLOT.left,
        GRAPH_HEIGHT - 12,
        {
          fill: "#69738a",
          size: 11,
          weight: 750,
          anchor: "start",
        }
      );
      note.setAttribute(
        "aria-hidden",
        "true"
      );
    }

    return true;
  }

  function openHint() {
    if (!currentProblem || !hintPanel) return;

    if (!hintWasDrawn) {
      setMath(
        hintText,
        currentProblem.hintText ||
          "식에서 접근점과 함수값의 방향을 먼저 확인하세요."
      );

      const drawn = renderGraph(
        currentProblem.visualization
      );

      graphWrap.hidden = !drawn;
      noGraphMessage.hidden = drawn;
      hintEyebrow.textContent = drawn
        ? "그래프 힌트"
        : "단계 힌트";
      hintTitle.textContent = drawn
        ? "현재 숫자로 그래프를 그려봤어요."
        : "현재 숫자를 식에 넣는 순서부터 볼게요.";
      if (coachHintMessage) {
        coachHintMessage.textContent =
          currentProblem.coachPrompt
            ?.message || "";
        coachHintMessage.hidden =
          !coachHintMessage.textContent;
      }
      if (conceptGuide) {
        conceptGuide.hidden =
          !currentProblem.conceptGuide;
      }
      hintWasDrawn = true;
    }

    hintPanel.hidden = false;
    hintButton.setAttribute("aria-expanded", "true");
    hintPanel.scrollIntoView({
      behavior: window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches
        ? "auto"
        : "smooth",
      block: "nearest",
    });
  }

  function closeHint() {
    hintPanel.hidden = true;
    hintButton.setAttribute("aria-expanded", "false");
    hintButton.focus();
  }

  graph?.addEventListener(
    "wheel",
    (event) => {
      if (
        !currentProblem?.visualization ||
        graphWrap.hidden
      ) {
        return;
      }

      const modeMultiplier =
        event.deltaMode === 1
          ? 18
          : event.deltaMode === 2
            ? 100
            : 1;
      const normalizedDelta = Math.max(
        -80,
        Math.min(
          80,
          event.deltaY * modeMultiplier
        )
      );
      const nextZoom = Math.max(
        MINIMUM_GRAPH_ZOOM,
        Math.min(
          MAXIMUM_GRAPH_ZOOM,
          graphZoom *
            Math.exp(
              -normalizedDelta *
                GRAPH_WHEEL_SENSITIVITY
            )
        )
      );

      if (
        Math.abs(nextZoom - graphZoom) <
        0.0001
      ) {
        return;
      }

      event.preventDefault();
      graphZoom = nextZoom;

      if (graphZoomFrame) return;

      graphZoomFrame =
        window.requestAnimationFrame(() => {
          graphZoomFrame = null;
          renderGraph(
            currentProblem.visualization
          );
        });
    },
    { passive: false }
  );

  answerForm?.addEventListener(
    "submit",
    submitAnswer
  );
  hintButton?.addEventListener("click", openHint);
  closeHintButton?.addEventListener(
    "click",
    closeHint
  );
  anotherButton?.addEventListener(
    "click",
    loadProblem
  );

  setReviewState(config);
  loadProblem();
})();
