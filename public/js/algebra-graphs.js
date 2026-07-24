(function () {
  "use strict";

  const configElement = document.getElementById(
    "concept-experience-config"
  );

  if (!configElement) return;

  const config = JSON.parse(
    configElement.textContent
  );
  const graphKey = config.algebraGraphKey;

  if (!graphKey) return;

  const WIDTH = 760;
  const HEIGHT = 400;
  const PLOT = {
    left: 58,
    right: 26,
    top: 30,
    bottom: 48,
  };

  function round(value, digits = 2) {
    const factor = 10 ** digits;
    const result =
      Math.round(Number(value) * factor) /
      factor;

    return Object.is(result, -0)
      ? 0
      : result;
  }

  function formatNumber(value, digits = 2) {
    const result = round(value, digits);
    return Number.isInteger(result)
      ? String(result)
      : String(result);
  }

  function typesetMath(element, content) {
    if (!element) return;

    if (window.MathJax?.typesetClear) {
      window.MathJax.typesetClear([element]);
    }

    element.textContent = content || "";

    if (window.MathJax?.typesetPromise) {
      window.MathJax
        .typesetPromise([element])
        .catch((error) => {
          console.error(
            "그래프 수식을 렌더링하지 못했습니다.",
            error
          );
        });
    }
  }

  function sampleFunction(
    evaluate,
    xMin,
    xMax,
    yLimit,
    count = 260
  ) {
    const segments = [];
    let segment = [];

    for (
      let index = 0;
      index <= count;
      index += 1
    ) {
      const x =
        xMin +
        ((xMax - xMin) * index) / count;
      const y = Number(evaluate(x));

      if (
        !Number.isFinite(y) ||
        Math.abs(y) > yLimit
      ) {
        if (segment.length > 1) {
          segments.push(segment);
        }

        segment = [];
        continue;
      }

      segment.push({ x, y });
    }

    if (segment.length > 1) {
      segments.push(segment);
    }

    return segments;
  }

  function cartesianMarkup({
    svg,
    xMin,
    xMax,
    yMin,
    yMax,
    curves = [],
    points = [],
    guides = [],
    areas = [],
    labels = [],
    description,
    xAxisLabel = "x",
    yAxisLabel = "y",
  }) {
    const plotWidth =
      WIDTH - PLOT.left - PLOT.right;
    const plotHeight =
      HEIGHT - PLOT.top - PLOT.bottom;
    const mapX = (value) =>
      PLOT.left +
      ((value - xMin) /
        (xMax - xMin || 1)) *
        plotWidth;
    const mapY = (value) =>
      PLOT.top +
      ((yMax - value) /
        (yMax - yMin || 1)) *
        plotHeight;
    const clipId =
      `${svg.id || "algebra"}-clip`;
    const grid = [];

    for (let index = 0; index <= 8; index += 1) {
      const x =
        PLOT.left +
        (plotWidth * index) / 8;

      grid.push(
        `<line x1="${x}" y1="${PLOT.top}" ` +
          `x2="${x}" y2="${PLOT.top + plotHeight}" />`
      );
    }

    for (let index = 0; index <= 6; index += 1) {
      const y =
        PLOT.top +
        (plotHeight * index) / 6;

      grid.push(
        `<line x1="${PLOT.left}" y1="${y}" ` +
          `x2="${PLOT.left + plotWidth}" y2="${y}" />`
      );
    }

    const areaMarkup = areas
      .map((area) => {
        const x1 = mapX(
          Math.max(xMin, area.xMin)
        );
        const x2 = mapX(
          Math.min(xMax, area.xMax)
        );

        return (
          `<rect x="${Math.min(x1, x2)}" ` +
          `y="${PLOT.top}" ` +
          `width="${Math.abs(x2 - x1)}" ` +
          `height="${plotHeight}" ` +
          `class="algebra-graph-area" />`
        );
      })
      .join("");

    const guideMarkup = guides
      .map((guide) => {
        const x1 = mapX(guide.x1);
        const x2 = mapX(guide.x2);
        const y1 = mapY(guide.y1);
        const y2 = mapY(guide.y2);

        return (
          `<line x1="${x1}" y1="${y1}" ` +
          `x2="${x2}" y2="${y2}" ` +
          `class="algebra-graph-guide ${guide.className || ""}" />`
        );
      })
      .join("");

    const curveMarkup = curves
      .map((curve, curveIndex) =>
        (curve.segments || [])
          .map((segment) => {
            const path = segment
              .map(
                (point, pointIndex) =>
                  `${pointIndex ? "L" : "M"} ` +
                  `${mapX(point.x).toFixed(2)} ` +
                  `${mapY(point.y).toFixed(2)}`
              )
              .join(" ");

            return (
              `<path d="${path}" ` +
              `class="algebra-graph-curve ` +
              `${curve.className || `series-${curveIndex + 1}`}" />`
            );
          })
          .join("")
      )
      .join("");

    const pointMarkup = points
      .filter(
        (point) =>
          point.x >= xMin &&
          point.x <= xMax &&
          point.y >= yMin &&
          point.y <= yMax
      )
      .map(
        (point) =>
          `<circle cx="${mapX(point.x)}" ` +
          `cy="${mapY(point.y)}" ` +
          `r="${point.radius || 6}" ` +
          `class="algebra-graph-point ${point.className || "series-1"}" />`
      )
      .join("");

    const labelMarkup = labels
      .filter(
        (label) =>
          label.x >= xMin &&
          label.x <= xMax &&
          label.y >= yMin &&
          label.y <= yMax
      )
      .map(
        (label) =>
          `<text x="${mapX(label.x) + (label.dx || 0)}" ` +
          `y="${mapY(label.y) + (label.dy || 0)}" ` +
          `class="algebra-graph-label ${label.className || ""}">` +
          `${label.text}</text>`
      )
      .join("");

    const xAxisVisible =
      yMin <= 0 && yMax >= 0;
    const yAxisVisible =
      xMin <= 0 && xMax >= 0;
    const xAxisY = mapY(0);
    const yAxisX = mapX(0);

    svg.innerHTML = `
      <title>${config.conceptTitle} 그래프</title>
      <desc>${description}</desc>

      <defs>
        <clipPath id="${clipId}">
          <rect
            x="${PLOT.left}"
            y="${PLOT.top}"
            width="${plotWidth}"
            height="${plotHeight}"
            rx="7"
          />
        </clipPath>
      </defs>

      <rect
        x="${PLOT.left}"
        y="${PLOT.top}"
        width="${plotWidth}"
        height="${plotHeight}"
        rx="7"
        class="algebra-graph-background"
      />

      <g class="algebra-graph-grid">
        ${grid.join("")}
      </g>

      <g class="algebra-graph-axes">
        ${
          xAxisVisible
            ? `<line x1="${PLOT.left}" y1="${xAxisY}" ` +
              `x2="${PLOT.left + plotWidth}" y2="${xAxisY}" />`
            : ""
        }
        ${
          yAxisVisible
            ? `<line x1="${yAxisX}" y1="${PLOT.top}" ` +
              `x2="${yAxisX}" y2="${PLOT.top + plotHeight}" />`
            : ""
        }
      </g>

      <g clip-path="url(#${clipId})">
        ${areaMarkup}
        ${guideMarkup}
        ${curveMarkup}
        ${pointMarkup}
      </g>

      <g>
        ${labelMarkup}
        <text
          x="${PLOT.left + plotWidth - 5}"
          y="${xAxisVisible ? xAxisY - 9 : PLOT.top + plotHeight - 9}"
          class="algebra-graph-axis-label"
        >${xAxisLabel}</text>
        <text
          x="${yAxisVisible ? yAxisX + 10 : PLOT.left + 10}"
          y="${PLOT.top + 16}"
          class="algebra-graph-axis-label"
        >${yAxisLabel}</text>
      </g>
    `;
  }

  function renderExpLog(
    svg,
    state
  ) {
    const magnitude = state.primary;
    const base =
      state.mode === "decay"
        ? 1 / magnitude
        : magnitude;
    const shift = state.secondary;
    const halfRange = 6 / state.zoom;
    const xMin = shift - halfRange;
    const xMax = shift + halfRange;
    const yMin = shift - halfRange;
    const yMax = shift + halfRange;
    const exponential = (x) =>
      base ** (x - shift) + shift;
    const logarithm = (x) =>
      x > shift
        ? Math.log(x - shift) /
            Math.log(base) +
          shift
        : NaN;
    const firstPoint = {
      x: shift + 1,
      y: shift + base,
    };
    const inversePoint = {
      x: firstPoint.y,
      y: firstPoint.x,
    };

    cartesianMarkup({
      svg,
      xMin,
      xMax,
      yMin,
      yMax,
      description:
        `밑 ${formatNumber(base)}인 지수함수와 로그함수, ` +
        "직선 y=x와 두 점근선을 함께 표시합니다.",
      curves: [
        {
          className: "series-1",
          segments: sampleFunction(
            exponential,
            xMin,
            xMax,
            Math.max(30, yMax * 5)
          ),
        },
        {
          className: "series-2",
          segments: sampleFunction(
            logarithm,
            xMin,
            xMax,
            Math.max(30, Math.abs(yMin) * 5)
          ),
        },
        {
          className: "series-reference",
          segments: [
            [
              { x: xMin, y: xMin },
              { x: xMax, y: xMax },
            ],
          ],
        },
      ],
      guides: [
        {
          x1: xMin,
          y1: shift,
          x2: xMax,
          y2: shift,
          className: "asymptote",
        },
        {
          x1: shift,
          y1: yMin,
          x2: shift,
          y2: yMax,
          className: "asymptote",
        },
      ],
      points: [
        {
          ...firstPoint,
          className: "series-1",
        },
        {
          ...inversePoint,
          className: "series-2",
        },
      ],
      labels: [
        {
          x: shift + 1.3,
          y: exponential(shift + 1.3),
          text: "지수함수",
          dx: 8,
          dy: -10,
          className: "series-1-label",
        },
        {
          x:
            shift +
            Math.max(1.4, magnitude),
          y: logarithm(
            shift +
              Math.max(1.4, magnitude)
          ),
          text: "로그함수",
          dx: 8,
          dy: 18,
          className: "series-2-label",
        },
        {
          x: xMax - 1.1,
          y: xMax - 1.1,
          text: "y=x",
          dx: -4,
          dy: -9,
        },
      ],
    });

    return {
      formula:
        `\\(f(x)=a^{x-h}+h,\\quad ` +
        `f^{-1}(x)=\\log_a(x-h)+h\\)`,
      state:
        `a=${formatNumber(base)}, h=${formatNumber(shift)}`,
      value:
        `(${formatNumber(firstPoint.x)}, ${formatNumber(firstPoint.y)})` +
        ` ↔ (${formatNumber(inversePoint.x)}, ${formatNumber(inversePoint.y)})`,
      verdict:
        state.mode === "decay"
          ? "두 함수는 모두 감소하지만 y=x 대칭은 유지됩니다."
          : "두 함수는 모두 증가하며 서로의 입력과 출력이 뒤바뀝니다.",
      tip:
        "같은 색 점 두 개가 y=x를 사이에 두고 좌표를 바꾸는지 확인하세요.",
    };
  }

  function renderExpSolver(
    svg,
    state
  ) {
    const base = state.primary;
    const solution = state.secondary;
    const target = base ** solution;
    const halfRange = 4 / state.zoom;
    const xMin = solution - halfRange;
    const xMax = solution + halfRange;
    const yMin = -0.5;
    const yMax =
      Math.max(5, target * 1.75);
    const exponential = (x) =>
      base ** x;
    const area =
      state.mode === "equation"
        ? []
        : [
            state.mode === "greater"
              ? {
                  xMin: solution,
                  xMax,
                }
              : {
                  xMin,
                  xMax: solution,
                },
          ];
    const relation =
      state.mode === "equation"
        ? "="
        : state.mode === "greater"
          ? ">"
          : "<";

    cartesianMarkup({
      svg,
      xMin,
      xMax,
      yMin,
      yMax,
      description:
        `지수함수 y=${formatNumber(base)}^x와 ` +
        `수평선 y=${formatNumber(target)}의 교점과 해의 범위를 표시합니다.`,
      curves: [
        {
          className: "series-1",
          segments: sampleFunction(
            exponential,
            xMin,
            xMax,
            yMax * 2
          ),
        },
        {
          className: "series-2",
          segments: [
            [
              { x: xMin, y: target },
              { x: xMax, y: target },
            ],
          ],
        },
      ],
      areas: area,
      guides: [
        {
          x1: solution,
          y1: yMin,
          x2: solution,
          y2: target,
          className: "solution",
        },
      ],
      points: [
        {
          x: solution,
          y: target,
          radius: 7,
          className: "solution",
        },
      ],
      labels: [
        {
          x: solution,
          y: target,
          text:
            `(${formatNumber(solution)}, ${formatNumber(target)})`,
          dx: 10,
          dy: -12,
          className: "solution-label",
        },
      ],
    });

    const solutionText =
      state.mode === "equation"
        ? `x=${formatNumber(solution)}`
        : state.mode === "greater"
          ? `x>${formatNumber(solution)}`
          : `x<${formatNumber(solution)}`;

    return {
      formula:
        `\\(${formatNumber(base)}^x ${relation} ` +
        `${formatNumber(target)}\\)`,
      state:
        `a=${formatNumber(base)}, b=${formatNumber(target)}`,
      value:
        `경계값 ${solutionText}`,
      verdict:
        state.mode === "equation"
          ? "두 그래프가 만나는 점의 x좌표가 방정식의 해입니다."
          : "색칠된 쪽에서 지수함수와 수평선의 대소관계가 성립합니다.",
      tip:
        "교점은 등식의 해이고, 교점 양쪽의 높이 비교가 부등식의 해입니다.",
    };
  }

  function renderTrigonometric(
    svg,
    state
  ) {
    const theta =
      (state.primary * Math.PI) / 180;
    const amplitude = state.secondary;
    const mode = state.mode;
    const circle = {
      x: 140,
      y: 200,
      radius: 88,
    };
    const graph = {
      left: 318,
      right: 732,
      top: 48,
      bottom: 350,
    };
    const clipId =
      `${svg.id || "algebra"}-trig-clip`;
    const halfRange =
      Math.PI / state.zoom;
    const xMin = theta - halfRange;
    const xMax = theta + halfRange;
    const yLimit =
      mode === "tan"
        ? Math.max(3, amplitude * 2.5)
        : Math.max(1.5, amplitude * 1.35);
    const evaluate =
      mode === "cos"
        ? (value) =>
            amplitude * Math.cos(value)
        : mode === "tan"
          ? (value) => {
              const cosine =
                Math.cos(value);

              return Math.abs(cosine) < 0.025
                ? NaN
                : amplitude *
                    Math.tan(value);
            }
          : (value) =>
              amplitude * Math.sin(value);
    const currentValue = evaluate(theta);
    const mapX = (value) =>
      graph.left +
      ((value - xMin) /
        (xMax - xMin || 1)) *
        (graph.right - graph.left);
    const mapY = (value) =>
      graph.top +
      ((yLimit - value) /
        (2 * yLimit)) *
        (graph.bottom - graph.top);
    const segments = sampleFunction(
      evaluate,
      xMin,
      xMax,
      yLimit * 1.05,
      360
    );
    const paths = segments
      .map((segment) => {
        const path = segment
          .map(
            (point, index) =>
              `${index ? "L" : "M"} ` +
              `${mapX(point.x).toFixed(2)} ` +
              `${mapY(point.y).toFixed(2)}`
          )
          .join(" ");

        return `<path d="${path}" class="algebra-graph-curve series-1" />`;
      })
      .join("");
    const unitX =
      circle.x +
      circle.radius * Math.cos(theta);
    const unitY =
      circle.y -
      circle.radius * Math.sin(theta);
    const graphPoint =
      Number.isFinite(currentValue)
        ? `
          <line
            x1="${mapX(theta)}"
            y1="${mapY(0)}"
            x2="${mapX(theta)}"
            y2="${mapY(currentValue)}"
            class="algebra-graph-guide solution"
          />
          <circle
            cx="${mapX(theta)}"
            cy="${mapY(currentValue)}"
            r="7"
            class="algebra-graph-point solution"
          />
        `
        : "";
    const functionName =
      mode === "cos"
        ? "cos"
        : mode === "tan"
          ? "tan"
          : "sin";

    svg.innerHTML = `
      <title>${config.conceptTitle} 단위원과 그래프</title>
      <desc>
        ${formatNumber(state.primary, 0)}도에서 단위원 위 점과
        ${functionName} 그래프의 대응하는 값을 표시합니다.
      </desc>
      <defs>
        <clipPath id="${clipId}">
          <rect
            x="${graph.left}"
            y="${graph.top}"
            width="${graph.right - graph.left}"
            height="${graph.bottom - graph.top}"
            rx="7"
          />
        </clipPath>
      </defs>

      <g class="unit-circle-view">
        <circle
          cx="${circle.x}"
          cy="${circle.y}"
          r="${circle.radius}"
          class="unit-circle"
        />
        <line
          x1="${circle.x - circle.radius - 20}"
          y1="${circle.y}"
          x2="${circle.x + circle.radius + 20}"
          y2="${circle.y}"
          class="algebra-graph-axis"
        />
        <line
          x1="${circle.x}"
          y1="${circle.y - circle.radius - 20}"
          x2="${circle.x}"
          y2="${circle.y + circle.radius + 20}"
          class="algebra-graph-axis"
        />
        <path
          d="M ${circle.x + 34} ${circle.y}
             A 34 34 0 ${theta > Math.PI ? 1 : 0} 0
             ${circle.x + 34 * Math.cos(theta)}
             ${circle.y - 34 * Math.sin(theta)}"
          class="angle-arc"
        />
        <line
          x1="${circle.x}"
          y1="${circle.y}"
          x2="${unitX}"
          y2="${unitY}"
          class="radius-line"
        />
        <line
          x1="${unitX}"
          y1="${circle.y}"
          x2="${unitX}"
          y2="${unitY}"
          class="projection-line"
        />
        <circle
          cx="${unitX}"
          cy="${unitY}"
          r="7"
          class="algebra-graph-point series-2"
        />
        <text
          x="${unitX + 9}"
          y="${unitY - 9}"
          class="algebra-graph-label series-2-label"
        >θ</text>
        <text
          x="${circle.x}"
          y="${circle.y + circle.radius + 36}"
          class="algebra-graph-label circle-caption"
        >단위원</text>
      </g>

      <g class="trig-graph-view">
        <rect
          x="${graph.left}"
          y="${graph.top}"
          width="${graph.right - graph.left}"
          height="${graph.bottom - graph.top}"
          rx="7"
          class="algebra-graph-background"
        />
        <g class="algebra-graph-grid">
          ${[0, 1, 2, 3, 4]
            .map((index) => {
              const x =
                graph.left +
                ((graph.right -
                  graph.left) *
                  index) /
                  4;

              return `<line x1="${x}" y1="${graph.top}" x2="${x}" y2="${graph.bottom}" />`;
            })
            .join("")}
          ${[-1, 0, 1]
            .map((value) => {
              const y = mapY(
                value * Math.min(1, yLimit)
              );

              return `<line x1="${graph.left}" y1="${y}" x2="${graph.right}" y2="${y}" />`;
            })
            .join("")}
        </g>
        <line
          x1="${graph.left}"
          y1="${mapY(0)}"
          x2="${graph.right}"
          y2="${mapY(0)}"
          class="algebra-graph-axis"
        />
        <g clip-path="url(#${clipId})">
          ${paths}
          ${graphPoint}
        </g>
        <text
          x="${graph.right - 6}"
          y="${mapY(0) - 9}"
          class="algebra-graph-axis-label"
        >θ</text>
        <text
          x="${graph.left + 10}"
          y="${graph.top + 18}"
          class="algebra-graph-label series-1-label"
        >y=A ${functionName} θ</text>
      </g>
    `;

    const valueText =
      Number.isFinite(currentValue)
        ? formatNumber(currentValue)
        : "정의되지 않음";

    return {
      formula:
        `\\(y=${formatNumber(amplitude)}\\` +
        `${functionName}\\theta\\)`,
      state:
        `θ=${formatNumber(state.primary, 0)}°, A=${formatNumber(amplitude)}`,
      value:
        `${functionName} 값 ${valueText}`,
      verdict:
        Number.isFinite(currentValue)
          ? "단위원에서 읽은 좌표가 그래프의 현재 높이와 연결됩니다."
          : "tan은 cos θ=0인 각에서 정의되지 않아 그래프가 끊어집니다.",
      tip:
        "각도를 움직이며 원 위 점의 좌표와 그래프의 표시점이 함께 움직이는지 보세요.",
    };
  }

  function sequenceValues(
    key,
    state
  ) {
    const count = Math.round(
      state.primary
    );
    const parameter =
      state.secondary;
    const values = [];
    let formula = "";
    let ruleLabel = "";

    if (key === "sequence") {
      for (let n = 1; n <= count; n += 1) {
        const value =
          state.mode === "quadratic"
            ? parameter * n * n
            : state.mode === "alternating"
              ? parameter *
                (n % 2 ? -1 : 1)
              : parameter * n + 1;

        values.push(value);
      }

      formula =
        state.mode === "quadratic"
          ? `\\(a_n=${formatNumber(parameter)}n^2\\)`
          : state.mode === "alternating"
            ? `\\(a_n=${formatNumber(parameter)}(-1)^n\\)`
            : `\\(a_n=${formatNumber(parameter)}n+1\\)`;
      ruleLabel = "일반항";
    } else if (key === "arithmetic-sequence") {
      const difference =
        state.mode === "constant"
          ? 0
          : state.mode === "decrease"
            ? -parameter
            : parameter;

      for (let n = 1; n <= count; n += 1) {
        values.push(
          2 +
            (n - 1) *
              difference
        );
      }

      formula =
        `\\(a_n=2+(n-1)(${formatNumber(difference)})\\)`;
      ruleLabel =
        `공차 d=${formatNumber(difference)}`;
    } else if (key === "geometric-sequence") {
      const ratio =
        state.mode === "decay"
          ? 1 / parameter
          : state.mode === "alternating"
            ? -parameter
            : parameter;

      for (let n = 1; n <= count; n += 1) {
        values.push(
          ratio ** (n - 1)
        );
      }

      formula =
        `\\(a_n=(${formatNumber(ratio)})^{n-1}\\)`;
      ruleLabel =
        `공비 r=${formatNumber(ratio)}`;
    } else {
      values.push(1);

      for (let n = 1; n < count; n += 1) {
        const previous =
          values[values.length - 1];
        const next =
          state.mode === "multiply"
            ? previous * parameter
            : state.mode === "affine"
              ? previous +
                parameter * n
              : previous + parameter;

        values.push(next);
      }

      formula =
        state.mode === "multiply"
          ? `\\(a_1=1,\\ a_{n+1}=${formatNumber(parameter)}a_n\\)`
          : state.mode === "affine"
            ? `\\(a_1=1,\\ a_{n+1}=a_n+${formatNumber(parameter)}n\\)`
            : `\\(a_1=1,\\ a_{n+1}=a_n+${formatNumber(parameter)}\\)`;
      ruleLabel = "점화 규칙";
    }

    return {
      values,
      formula,
      ruleLabel,
    };
  }

  function renderSequence(
    svg,
    state
  ) {
    const generated =
      sequenceValues(graphKey, state);
    const values = generated.values;
    const minimum = Math.min(0, ...values);
    const maximum = Math.max(0, ...values);
    const padding = Math.max(
      1,
      (maximum - minimum) * 0.14
    );
    const yCenter =
      (maximum + minimum) / 2;
    const yHalfRange =
      Math.max(
        2,
        (maximum - minimum + padding * 2) /
          2 /
          state.zoom
      );
    const xCenter =
      (values.length + 1) / 2;
    const xHalfRange =
      Math.max(
        2.5,
        (values.length + 1) /
          2 /
          state.zoom
      );
    const points = values.map(
      (value, index) => ({
        x: index + 1,
        y: value,
        radius: 6,
        className:
          index === values.length - 1
            ? "solution"
            : "series-1",
      })
    );
    const segments = [
      values.map((value, index) => ({
        x: index + 1,
        y: value,
      })),
    ];
    const lastValue =
      values[values.length - 1];

    cartesianMarkup({
      svg,
      xMin: xCenter - xHalfRange,
      xMax: xCenter + xHalfRange,
      yMin: yCenter - yHalfRange,
      yMax: yCenter + yHalfRange,
      description:
        `${values.length}개 항을 자연수 위치의 점으로 나타내고 ` +
        `${generated.ruleLabel}에 따른 변화를 표시합니다.`,
      xAxisLabel: "n",
      yAxisLabel: "aₙ",
      curves: [
        {
          className: "series-discrete",
          segments,
        },
      ],
      points,
      labels: [
        {
          x: values.length,
          y: lastValue,
          text:
            `a${values.length}=${formatNumber(lastValue)}`,
          dx: -6,
          dy: -13,
          className: "solution-label end-label",
        },
      ],
    });

    const verdicts = {
      sequence:
        "수열은 자연수 n에서만 값이 정해지는 이산적인 점 그래프입니다.",
      "arithmetic-sequence":
        "점들이 일정한 기울기의 직선 위에 놓이면 공차가 일정합니다.",
      "geometric-sequence":
        "같은 비율을 반복해 곱하므로 항 사이의 세로 간격이 일정하지 않습니다.",
      "recursive-sequence":
        "각 점의 값이 같은 점화 규칙을 통해 다음 점을 만듭니다.",
    };

    return {
      formula: generated.formula,
      state:
        `N=${values.length}, ${generated.ruleLabel}`,
      value:
        `마지막 항 a${values.length}=${formatNumber(lastValue)}`,
      verdict: verdicts[graphKey],
      tip:
        graphKey === "arithmetic-sequence"
          ? "점 사이의 세로 변화량이 매번 같은지 확인하세요."
          : graphKey === "geometric-sequence"
            ? "앞 항에서 다음 항으로 갈 때 값의 비율을 확인하세요."
            : graphKey === "recursive-sequence"
              ? "첫째항부터 화살표를 따라 다음 항이 만들어지는 순서를 보세요."
              : "선 전체가 아니라 자연수 위치의 점들만 수열의 항입니다.",
    };
  }

  function drawGraph(
    svg,
    state
  ) {
    if (
      graphKey === "exp-log-inverse"
    ) {
      return renderExpLog(
        svg,
        state
      );
    }

    if (
      graphKey === "exp-log-solver"
    ) {
      return renderExpSolver(
        svg,
        state
      );
    }

    if (
      graphKey === "trigonometric"
    ) {
      return renderTrigonometric(
        svg,
        state
      );
    }

    return renderSequence(
      svg,
      state
    );
  }

  function defaultState() {
    if (
      graphKey === "exp-log-inverse"
    ) {
      return {
        mode: "growth",
        primary: 2,
        secondary: 0,
        zoom: 1,
      };
    }

    if (
      graphKey === "exp-log-solver"
    ) {
      return {
        mode: "equation",
        primary: 2,
        secondary: 2,
        zoom: 1,
      };
    }

    if (
      graphKey === "trigonometric"
    ) {
      return {
        mode: "sin",
        primary: 45,
        secondary: 1,
        zoom: 1,
      };
    }

    const modes = {
      sequence: "linear",
      "arithmetic-sequence": "increase",
      "geometric-sequence": "growth",
      "recursive-sequence": "add",
    };

    return {
      mode: modes[graphKey],
      primary:
        graphKey === "geometric-sequence" ||
        graphKey === "recursive-sequence"
          ? 7
          : 8,
      secondary:
        graphKey === "geometric-sequence"
          ? 1.5
          : graphKey === "recursive-sequence"
            ? 1.5
            : 2,
      zoom: 1,
    };
  }

  function algebraMotionFrames() {
    const base = defaultState();

    if (graphKey === "exp-log-inverse") {
      return [
        base,
        { ...base, mode: "decay" },
        { ...base, primary: 3 },
        { ...base, primary: 3, secondary: 0.5 },
      ];
    }

    if (graphKey === "exp-log-solver") {
      return [
        base,
        { ...base, mode: "greater" },
        { ...base, mode: "less" },
        { ...base, primary: 3, secondary: 1 },
      ];
    }

    if (graphKey === "trigonometric") {
      return [
        { ...base, primary: 0 },
        { ...base, primary: 90 },
        { ...base, primary: 180 },
        { ...base, mode: "cos", primary: 90 },
      ];
    }

    const sequenceFrames = {
      sequence: [
        base,
        { ...base, mode: "quadratic" },
        { ...base, mode: "alternating" },
        { ...base, mode: "linear", secondary: 3 },
      ],
      "arithmetic-sequence": [
        base,
        { ...base, mode: "decrease" },
        { ...base, mode: "constant" },
        { ...base, mode: "increase", secondary: 3 },
      ],
      "geometric-sequence": [
        base,
        { ...base, mode: "decay" },
        { ...base, mode: "alternating" },
        { ...base, mode: "growth", secondary: 2 },
      ],
      "recursive-sequence": [
        base,
        { ...base, mode: "multiply", secondary: 1.5 },
        { ...base, mode: "affine", secondary: 1 },
        { ...base, mode: "add", secondary: 2.5 },
      ],
    };

    return sequenceFrames[graphKey] || [base];
  }

  function initAlgebraMotion() {
    const motionGraph = document.getElementById(
      "algebra-motion-graph"
    );
    const caption = document.getElementById(
      "motion-caption-text"
    );
    const replayButton = document.getElementById(
      "replay-algebra-motion"
    );

    if (!motionGraph) return;

    const captions = Array.isArray(config.motionCaptions)
      ? config.motionCaptions
      : [];
    const frames = algebraMotionFrames();
    const reduceMotion = Boolean(
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    );
    let timers = [];

    function clearTimers() {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers = [];
    }

    function renderFrame(index, replaying) {
      const frame = frames[index] || frames[0];
      const result = drawGraph(motionGraph, frame);

      if (caption) {
        caption.textContent =
          captions[index] || result.verdict;
      }

      if (!replaying || reduceMotion) return;

      motionGraph.classList.remove("is-replaying");
      void motionGraph.getBoundingClientRect();
      motionGraph.classList.add("is-replaying");
    }

    function playFromStart() {
      clearTimers();
      renderFrame(0, true);

      if (reduceMotion) return;

      frames.slice(1).forEach((_, index) => {
        const timer = window.setTimeout(
          () => renderFrame(index + 1, true),
          (index + 1) * 1850
        );

        timers.push(timer);
      });
    }

    replayButton?.addEventListener("click", playFromStart);
    playFromStart();
  }

  function initGraphExperience() {
    const playground = document.getElementById(
      "algebra-playground-graph"
    );

    initAlgebraMotion();

    if (!playground) return;

    const primaryInput =
      document.getElementById(
        "algebra-graph-primary"
      );
    const secondaryInput =
      document.getElementById(
        "algebra-graph-secondary"
      );
    const primaryOutput =
      document.getElementById(
        "algebra-graph-primary-output"
      );
    const secondaryOutput =
      document.getElementById(
        "algebra-graph-secondary-output"
      );
    const formula = document.getElementById(
      "algebra-graph-formula"
    );
    const stateOutput =
      document.getElementById(
        "algebra-graph-state"
      );
    const valueOutput =
      document.getElementById(
        "algebra-graph-value"
      );
    const verdict =
      document.getElementById(
        "algebra-graph-verdict"
      );
    const tip = document.getElementById(
      "algebra-graph-tip"
    );
    const zoomOutput =
      document.getElementById(
        "algebra-graph-zoom-output"
      );
    const modeButtons = Array.from(
      document.querySelectorAll(
        "[data-algebra-graph-mode]"
      )
    );
    const state = defaultState();

    state.mode =
      modeButtons[0]?.dataset
        .algebraGraphMode ||
      state.mode;
    state.primary = Number(
      primaryInput.value
    );
    state.secondary = Number(
      secondaryInput.value
    );

    function render() {
      const result = drawGraph(
        playground,
        state
      );

      primaryOutput.value =
        formatNumber(
          state.primary,
          graphKey === "trigonometric"
            ? 0
            : 2
        );
      secondaryOutput.value =
        formatNumber(
          state.secondary,
          2
        );
      stateOutput.textContent =
        result.state;
      valueOutput.textContent =
        result.value;
      verdict.textContent =
        result.verdict;
      tip.textContent = result.tip;
      typesetMath(
        formula,
        result.formula
      );
    }

    modeButtons.forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          state.mode =
            button.dataset
              .algebraGraphMode;

          modeButtons.forEach(
            (item) => {
              item.classList.toggle(
                "active",
                item === button
              );
            }
          );

          render();
        }
      );
    });

    primaryInput.addEventListener(
      "input",
      () => {
        state.primary = Number(
          primaryInput.value
        );
        render();
      }
    );
    secondaryInput.addEventListener(
      "input",
      () => {
        state.secondary = Number(
          secondaryInput.value
        );
        render();
      }
    );

    let zoomFrame = null;

    playground.addEventListener(
      "wheel",
      (event) => {
        const modeMultiplier =
          event.deltaMode === 1
            ? 18
            : event.deltaMode === 2
              ? 100
              : 1;
        const delta = Math.max(
          -80,
          Math.min(
            80,
            event.deltaY *
              modeMultiplier
          )
        );
        const nextZoom = Math.max(
          0.75,
          Math.min(
            3,
            state.zoom *
              Math.exp(
                -delta * 0.0008
              )
          )
        );

        if (
          Math.abs(
            nextZoom - state.zoom
          ) < 0.0001
        ) {
          return;
        }

        event.preventDefault();
        state.zoom = nextZoom;
        zoomOutput.value =
          `${Math.round(state.zoom * 100)}%`;

        if (zoomFrame) return;

        zoomFrame =
          window.requestAnimationFrame(
            () => {
              zoomFrame = null;
              render();
            }
          );
      },
      { passive: false }
    );

    render();
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initGraphExperience,
      { once: true }
    );
  } else {
    initGraphExperience();
  }
})();
