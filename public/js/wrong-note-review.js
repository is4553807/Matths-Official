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

    if (
      !targets.length ||
      !window.MathJax?.typesetPromise
    ) {
      return Promise.resolve();
    }

    return window.MathJax
      .typesetPromise(targets)
      .catch((error) => {
        console.error(
          "수식을 렌더링하지 못했습니다.",
          error
        );
      });
  }

  function setMath(element, content) {
    if (!element) return;

    if (window.MathJax?.typesetClear) {
      window.MathJax.typesetClear([element]);
    }

    element.textContent = content || "";
    typesetMath(element);
  }

  function setCompletedState(completed) {
    stateBadge?.classList.toggle(
      "completed",
      Boolean(completed)
    );

    if (stateBadge) {
      stateBadge.textContent = completed
        ? "복습 완료"
        : "1문제 정답 시 완료";
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
      hintEyebrow.textContent = "HINT";
    }
    if (hintTitle) {
      hintTitle.textContent =
        "이 문제의 첫 단계를 확인해보세요.";
    }
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
    input.autocomplete = "off";
    input.placeholder =
      "정수를 입력하거나 분수는 1/2처럼 입력하세요.";
    input.required = true;

    answerArea.append(label, input);
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
      problem.typeLabel || "SAME TYPE RETRY";
    setMath(prompt, problem.prompt);

    if (window.MathJax?.typesetClear) {
      window.MathJax.typesetClear([answerArea]);
    }

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

    feedback.hidden = true;
    feedback.className = "retry-feedback";
    feedback.replaceChildren();
    anotherButton.hidden = true;
    completeLink.hidden = true;
    submitButton.disabled = false;
    answerArea.disabled = false;
    setCompletedState(
      Boolean(review?.completed || config.completed)
    );

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

    if (result.correct) {
      strong.textContent = result.review?.completed
        ? "정답입니다. 이 오답의 복습이 완료됐어요."
        : "정답입니다.";
    } else {
      strong.textContent =
        "아직 같은 구조를 놓친 부분이 있어요.";
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
      feedback.textContent = "정답을 먼저 입력해주세요.";
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

      if (result.correct && result.review?.completed) {
        config.completed = true;
        setCompletedState(true);
        completeLink.hidden = false;
        anotherButton.hidden = true;
      } else {
        anotherButton.hidden = false;
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

  function renderGraph(visualization) {
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
        ? "VISUAL HINT"
        : "STEP HINT";
      hintTitle.textContent = drawn
        ? "현재 숫자로 그래프를 그려봤어요."
        : "현재 숫자를 식에 넣는 순서부터 볼게요.";
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

  setCompletedState(Boolean(config.completed));
  loadProblem();
})();
