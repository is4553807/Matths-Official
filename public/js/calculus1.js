(function () {
  "use strict";

  const configElement = document.getElementById(
    "concept-experience-config"
  );

  if (!configElement) return;

  const config = JSON.parse(
    configElement.textContent
  );
  const profile = config.calculusProfile;

  if (!profile) return;

  const SVG_NS = "http://www.w3.org/2000/svg";
  const conceptId = String(config.conceptId || "");
  const colors = {
    ink: "#11172a",
    muted: "#75809a",
    grid: "#dfe5f6",
    blue: "#3157f6",
    purple: "#7950e8",
    green: "#20a078",
    red: "#df6170",
    gold: "#d99a2b",
    fillBlue: "rgba(49, 87, 246, 0.15)",
    fillGreen: "rgba(32, 160, 120, 0.16)",
    fillRed: "rgba(223, 97, 112, 0.15)",
  };
  let clipSequence = 0;

  function round(value, digits = 2) {
    const factor = 10 ** digits;
    const result =
      Math.round(
        (Number(value) + Number.EPSILON) * factor
      ) / factor;

    return Object.is(result, -0) ? 0 : result;
  }

  function element(name, attributes = {}) {
    const node = document.createElementNS(
      SVG_NS,
      name
    );

    Object.entries(attributes).forEach(
      ([key, value]) => {
        node.setAttribute(key, String(value));
      }
    );

    return node;
  }

  function textNode(
    parent,
    text,
    x,
    y,
    attributes = {}
  ) {
    const node = element("text", {
      x,
      y,
      fill: colors.muted,
      "font-size": 11,
      "font-weight": 700,
      "text-anchor": "middle",
      ...attributes,
    });
    node.textContent = text;
    parent.append(node);
    return node;
  }

  function typesetMath(target) {
    if (!target || !window.MathJax?.typesetPromise) {
      return;
    }

    if (window.MathJax.typesetClear) {
      window.MathJax.typesetClear([target]);
    }

    window.MathJax
      .typesetPromise([target])
      .catch(() => {});
  }

  function setMath(target, value) {
    if (!target) return;
    target.textContent = value;
    typesetMath(target);
  }

  function niceStep(range, targetCount = 8) {
    const rough = Math.max(
      Number.EPSILON,
      range / targetCount
    );
    const exponent = Math.floor(
      Math.log10(rough)
    );
    const fraction = rough / 10 ** exponent;
    const niceFraction =
      fraction <= 1
        ? 1
        : fraction <= 2
          ? 2
          : fraction <= 5
            ? 5
            : 10;

    return niceFraction * 10 ** exponent;
  }

  function tickLabel(value) {
    const absolute = Math.abs(value);
    const digits =
      absolute > 0 && absolute < 1 ? 1 : 0;
    return String(round(value, digits));
  }

  function createPlot(
    svg,
    width,
    height,
    bounds,
    zoom = 1
  ) {
    const margin = {
      left: 58,
      right: 24,
      top: 34,
      bottom: 48,
    };
    const baseXMin = bounds.xMin;
    const baseXMax = bounds.xMax;
    const baseYMin = bounds.yMin;
    const baseYMax = bounds.yMax;
    const xCenter =
      bounds.xCenter ??
      (baseXMin + baseXMax) / 2;
    const yCenter =
      bounds.yCenter ??
      (baseYMin + baseYMax) / 2;
    const xHalf =
      (baseXMax - baseXMin) / (2 * zoom);
    const yHalf =
      (baseYMax - baseYMin) / (2 * zoom);
    const xMin = xCenter - xHalf;
    const xMax = xCenter + xHalf;
    const yMin = yCenter - yHalf;
    const yMax = yCenter + yHalf;
    const plotWidth =
      width - margin.left - margin.right;
    const plotHeight =
      height - margin.top - margin.bottom;
    const mapX = (x) =>
      margin.left +
      ((x - xMin) / (xMax - xMin)) *
        plotWidth;
    const mapY = (y) =>
      margin.top +
      ((yMax - y) / (yMax - yMin)) *
        plotHeight;
    const clipId =
      `calculus-plot-${clipSequence}`;
    clipSequence += 1;

    const definitions = element("defs");
    const clipPath = element("clipPath", {
      id: clipId,
    });
    clipPath.append(
      element("rect", {
        x: margin.left,
        y: margin.top,
        width: plotWidth,
        height: plotHeight,
      })
    );
    definitions.append(clipPath);
    svg.append(definitions);

    const grid = element("g", {
      "aria-hidden": "true",
    });
    const xStep = niceStep(xMax - xMin);
    const yStep = niceStep(yMax - yMin, 7);
    const xStart =
      Math.ceil(xMin / xStep) * xStep;
    const yStart =
      Math.ceil(yMin / yStep) * yStep;

    for (
      let value = xStart, count = 0;
      value <= xMax + xStep * 0.001 &&
      count < 30;
      value += xStep, count += 1
    ) {
      const normalized = round(value, 8);
      const isAxis = Math.abs(normalized) < 1e-8;
      grid.append(
        element("line", {
          x1: mapX(normalized),
          y1: margin.top,
          x2: mapX(normalized),
          y2: height - margin.bottom,
          stroke: isAxis
            ? colors.ink
            : colors.grid,
          "stroke-width": isAxis ? 1.7 : 1,
        })
      );

      if (!isAxis) {
        textNode(
          grid,
          tickLabel(normalized),
          mapX(normalized),
          height - margin.bottom + 20,
          { "font-size": 10 }
        );
      }
    }

    for (
      let value = yStart, count = 0;
      value <= yMax + yStep * 0.001 &&
      count < 30;
      value += yStep, count += 1
    ) {
      const normalized = round(value, 8);
      const isAxis = Math.abs(normalized) < 1e-8;
      grid.append(
        element("line", {
          x1: margin.left,
          y1: mapY(normalized),
          x2: width - margin.right,
          y2: mapY(normalized),
          stroke: isAxis
            ? colors.ink
            : colors.grid,
          "stroke-width": isAxis ? 1.7 : 1,
        })
      );

      if (!isAxis) {
        textNode(
          grid,
          tickLabel(normalized),
          margin.left - 12,
          mapY(normalized) + 4,
          {
            "font-size": 9,
            "text-anchor": "end",
          }
        );
      }
    }

    svg.append(grid);

    const layer = element("g", {
      "clip-path": `url(#${clipId})`,
    });
    svg.append(layer);

    return {
      margin,
      layer,
      mapX,
      mapY,
      xMin,
      xMax,
      yMin,
      yMax,
      plotWidth,
      plotHeight,
    };
  }

  function pathData(
    plot,
    evaluate,
    start = plot.xMin,
    end = plot.xMax,
    samples = 260
  ) {
    const parts = [];
    let drawing = false;

    for (
      let index = 0;
      index <= samples;
      index += 1
    ) {
      const x =
        start +
        ((end - start) * index) / samples;
      const y = Number(evaluate(x));

      if (!Number.isFinite(y)) {
        drawing = false;
        continue;
      }

      const mappedX = plot.mapX(x);
      const mappedY = plot.mapY(y);

      if (
        !Number.isFinite(mappedX) ||
        !Number.isFinite(mappedY) ||
        Math.abs(mappedX) > 1000000 ||
        Math.abs(mappedY) > 1000000
      ) {
        drawing = false;
        continue;
      }

      parts.push(
        `${drawing ? "L" : "M"} ` +
          `${mappedX.toFixed(2)} ` +
          `${mappedY.toFixed(2)}`
      );
      drawing = true;
    }

    return parts.join(" ");
  }

  function curve(
    plot,
    evaluate,
    color,
    options = {}
  ) {
    const path = element("path", {
      d: pathData(
        plot,
        evaluate,
        options.start,
        options.end,
        options.samples
      ),
      fill: "none",
      stroke: color,
      "stroke-width": options.width || 3.6,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "vector-effect": "non-scaling-stroke",
      ...(options.dashed
        ? { "stroke-dasharray": "8 7" }
        : {}),
      ...(options.opacity != null
        ? { opacity: options.opacity }
        : {}),
    });
    plot.layer.append(path);
    return path;
  }

  function line(
    plot,
    x1,
    y1,
    x2,
    y2,
    color,
    options = {}
  ) {
    const node = element("line", {
      x1: plot.mapX(x1),
      y1: plot.mapY(y1),
      x2: plot.mapX(x2),
      y2: plot.mapY(y2),
      stroke: color,
      "stroke-width": options.width || 2.6,
      "stroke-linecap": "round",
      "vector-effect": "non-scaling-stroke",
      ...(options.dashed
        ? { "stroke-dasharray": "7 6" }
        : {}),
    });
    plot.layer.append(node);
    return node;
  }

  function point(
    plot,
    x,
    y,
    color,
    options = {}
  ) {
    const node = element("circle", {
      cx: plot.mapX(x),
      cy: plot.mapY(y),
      r: options.radius || 6,
      fill: options.open ? "#fff" : color,
      stroke: color,
      "stroke-width": options.open ? 2.5 : 2,
      "vector-effect": "non-scaling-stroke",
    });
    plot.layer.append(node);
    return node;
  }

  function areaBetween(
    plot,
    upper,
    lower,
    start,
    end,
    fill,
    samples = 120
  ) {
    if (end <= start) return null;
    const coordinates = [];

    for (
      let index = 0;
      index <= samples;
      index += 1
    ) {
      const x =
        start +
        ((end - start) * index) / samples;
      coordinates.push([
        plot.mapX(x),
        plot.mapY(upper(x)),
      ]);
    }

    for (
      let index = samples;
      index >= 0;
      index -= 1
    ) {
      const x =
        start +
        ((end - start) * index) / samples;
      coordinates.push([
        plot.mapX(x),
        plot.mapY(lower(x)),
      ]);
    }

    const polygon = element("polygon", {
      points: coordinates
        .map(([x, y]) => `${x},${y}`)
        .join(" "),
      fill,
      stroke: "none",
    });
    plot.layer.prepend(polygon);
    return polygon;
  }

  function rectangles(
    plot,
    evaluate,
    start,
    end,
    count
  ) {
    const width = (end - start) / count;

    for (
      let index = 0;
      index < count;
      index += 1
    ) {
      const x = start + index * width;
      const nextX = x + width;
      const height = evaluate(nextX);
      const rectangle = element("rect", {
        x: plot.mapX(x),
        y: plot.mapY(Math.max(0, height)),
        width: Math.max(
          0.4,
          plot.mapX(nextX) - plot.mapX(x)
        ),
        height: Math.abs(
          plot.mapY(height) - plot.mapY(0)
        ),
        fill:
          height >= 0
            ? "rgba(49, 87, 246, 0.07)"
            : "rgba(223, 97, 112, 0.07)",
        stroke:
          height >= 0
            ? colors.blue
            : colors.red,
        "stroke-width": 0.75,
        "vector-effect": "non-scaling-stroke",
      });
      plot.layer.append(rectangle);
    }
  }

  function legend(svg, items) {
    const group = element("g", {
      "aria-hidden": "true",
    });
    let x = 70;

    items.forEach((item) => {
      group.append(
        element("line", {
          x1: x,
          y1: 19,
          x2: x + 18,
          y2: 19,
          stroke: item.color,
          "stroke-width": 3,
          "stroke-linecap": "round",
          ...(item.dashed
            ? { "stroke-dasharray": "5 4" }
            : {}),
        })
      );
      textNode(
        group,
        item.label,
        x + 24,
        23,
        {
          fill: item.color,
          "font-size": 10,
          "text-anchor": "start",
        }
      );
      x += 24 + item.label.length * 11;
    });

    svg.append(group);
  }

  function findRoots(evaluate, start, end) {
    const roots = [];
    const samples = 500;
    let previousX = start;
    let previousY = evaluate(start);

    for (
      let index = 1;
      index <= samples;
      index += 1
    ) {
      const x =
        start +
        ((end - start) * index) / samples;
      const y = evaluate(x);

      if (
        Number.isFinite(y) &&
        Number.isFinite(previousY) &&
        y * previousY <= 0
      ) {
        let left = previousX;
        let right = x;

        for (
          let iteration = 0;
          iteration < 28;
          iteration += 1
        ) {
          const middle = (left + right) / 2;
          const middleY = evaluate(middle);

          if (
            evaluate(left) * middleY <= 0
          ) {
            right = middle;
          } else {
            left = middle;
          }
        }

        const root = (left + right) / 2;
        if (
          !roots.some(
            (candidate) =>
              Math.abs(candidate - root) < 0.04
          )
        ) {
          roots.push(root);
        }
      }

      previousX = x;
      previousY = y;
    }

    return roots;
  }

  function canvas(svg, bounds, zoom) {
    svg.replaceChildren();
    const width =
      Number(svg.viewBox.baseVal.width) || 720;
    const height =
      Number(svg.viewBox.baseVal.height) || 430;
    const plot = createPlot(
      svg,
      width,
      height,
      bounds,
      zoom
    );

    return { width, height, plot };
  }

  function derivativeCoefficientScene(
    svg,
    coefficient,
    observation,
    view,
    zoom
  ) {
    const { plot } = canvas(
      svg,
      {
        xMin: -4,
        xMax: 4,
        yMin: -7,
        yMax: 10,
      },
      zoom
    );
    const evaluate = (x) =>
      0.5 * coefficient * x ** 2 + 0.4 * x;
    const derivative = (x) =>
      coefficient * x + 0.4;
    const h = [1.4, 0.35, 0.05][view] ?? 0.05;
    const x2 = observation + h;
    const y = evaluate(observation);
    const secantSlope =
      (evaluate(x2) - y) / h;
    const tangentSlope = derivative(observation);

    curve(plot, evaluate, colors.blue);
    curve(
      plot,
      (x) =>
        y + secantSlope * (x - observation),
      view === 2 ? colors.purple : colors.gold,
      { dashed: view < 2, width: 2.8 }
    );
    point(
      plot,
      observation,
      y,
      colors.blue
    );
    if (view < 2) {
      point(
        plot,
        x2,
        evaluate(x2),
        colors.gold
      );
    }
    if (view === 2) {
      curve(
        plot,
        derivative,
        colors.green,
        { width: 2.8 }
      );
    }
    legend(svg, [
      { label: "원함수", color: colors.blue },
      {
        label: view === 2 ? "접선" : "할선",
        color:
          view === 2
            ? colors.purple
            : colors.gold,
        dashed: view < 2,
      },
      ...(view === 2
        ? [{ label: "도함수", color: colors.green }]
        : []),
    ]);

    return {
      state:
        `a=${coefficient}, x=${observation}, h=${h}`,
      value:
        `할선 ${round(secantSlope)} → 접선 ` +
        `${round(tangentSlope)}`,
      verdict:
        view === 2
          ? "두 점이 겹치면 할선의 기울기가 접선의 기울기가 됩니다."
          : "h가 작아질수록 두 점을 잇는 할선이 접선에 가까워집니다.",
      formula:
        `\\(f(x)=${round(0.5 * coefficient)}x^2+0.4x,\\;` +
        `f'(${observation})=${round(tangentSlope)}\\)`,
      tip:
        "노란 두 점의 간격과 보라색 접선의 방향을 비교하세요.",
    };
  }

  function differentiabilityScene(
    svg,
    leftSlope,
    rightSlope,
    view,
    zoom
  ) {
    const { plot } = canvas(
      svg,
      {
        xMin: -4,
        xMax: 4,
        yMin: -8,
        yMax: 8,
      },
      zoom
    );
    const left = (x) => leftSlope * x;
    const right = (x) => rightSlope * x;
    const differentiable =
      Math.abs(leftSlope - rightSlope) < 1e-9;

    curve(
      plot,
      left,
      colors.blue,
      { start: plot.xMin, end: 0 }
    );
    curve(
      plot,
      right,
      colors.blue,
      { start: 0, end: plot.xMax }
    );
    point(plot, 0, 0, colors.blue);

    if (view >= 1) {
      curve(
        plot,
        () => leftSlope,
        colors.purple,
        {
          start: plot.xMin,
          end: -0.04,
          dashed: true,
          width: 2.7,
        }
      );
      curve(
        plot,
        () => rightSlope,
        colors.green,
        {
          start: 0.04,
          end: plot.xMax,
          dashed: true,
          width: 2.7,
        }
      );
      point(
        plot,
        0,
        leftSlope,
        colors.purple,
        { open: true, radius: 5 }
      );
      point(
        plot,
        0,
        rightSlope,
        colors.green,
        { open: true, radius: 5 }
      );
    }
    legend(svg, [
      { label: "연속 함수", color: colors.blue },
      ...(view >= 1
        ? [
            {
              label: "좌미분",
              color: colors.purple,
              dashed: true,
            },
            {
              label: "우미분",
              color: colors.green,
              dashed: true,
            },
          ]
        : []),
    ]);

    return {
      state:
        `좌기울기 ${leftSlope}, 우기울기 ${rightSlope}`,
      value: differentiable
        ? "좌미분계수 = 우미분계수"
        : "좌미분계수 ≠ 우미분계수",
      verdict: differentiable
        ? "그래프가 이어지고 좌우 기울기도 같아 미분가능합니다."
        : "그래프는 이어지지만 뾰족점에서 좌우 기울기가 달라 미분불가능합니다.",
      formula:
        `\\(f'_-(0)=${leftSlope},\\;f'_+(0)=${rightSlope}\\)`,
      tip:
        "연속인지와 매끄러운지는 다른 조건입니다. 원점 양쪽 방향을 비교하세요.",
    };
  }

  function powerScene(
    svg,
    coefficient,
    exponent,
    view,
    zoom
  ) {
    const { plot } = canvas(
      svg,
      {
        xMin: -2.7,
        xMax: 2.7,
        yMin: -10,
        yMax: 10,
      },
      zoom
    );
    const n = Math.round(exponent);
    const evaluate = (x) =>
      coefficient * x ** n;
    const derivative = (x) =>
      coefficient * n * x ** (n - 1);

    curve(plot, evaluate, colors.blue);
    if (view >= 1) {
      curve(
        plot,
        derivative,
        colors.green,
        { width: 2.9 }
      );
    }
    if (view === 2) {
      const x = 1;
      point(
        plot,
        x,
        evaluate(x),
        colors.blue
      );
      line(
        plot,
        x - 1.5,
        evaluate(x) -
          derivative(x) * 1.5,
        x + 1.5,
        evaluate(x) +
          derivative(x) * 1.5,
        colors.purple,
        { dashed: true }
      );
    }
    legend(svg, [
      { label: `x^${n}`, color: colors.blue },
      ...(view >= 1
        ? [{ label: `nx^${n - 1}`, color: colors.green }]
        : []),
    ]);

    return {
      state: `a=${coefficient}, n=${n}`,
      value:
        `x의 지수 ${n} → ${n - 1}, ` +
        `계수 ${round(coefficient * n)}`,
      verdict:
        n % 2 === 0
          ? "짝수 거듭제곱은 좌우가 대칭이고 도함수는 홀함수 모양입니다."
          : "홀수 거듭제곱은 원점을 지나며 도함수는 짝함수 모양입니다.",
      formula:
        `\\((${coefficient}x^{${n}})'=` +
        `${round(coefficient * n)}x^{${n - 1}}\\)`,
      tip:
        "파란 원함수와 초록 도함수의 대칭성과 차수를 비교하세요.",
    };
  }

  function polynomialDerivativeScene(
    svg,
    cubic,
    linear,
    view,
    zoom
  ) {
    const { plot } = canvas(
      svg,
      {
        xMin: -4,
        xMax: 4,
        yMin: -11,
        yMax: 11,
      },
      zoom
    );
    const cubicTerm = (x) =>
      0.35 * cubic * x ** 3;
    const linearTerm = (x) => linear * x;
    const evaluate = (x) =>
      cubicTerm(x) + linearTerm(x);
    const derivative = (x) =>
      1.05 * cubic * x ** 2 + linear;

    if (view === 0) {
      curve(
        plot,
        cubicTerm,
        colors.purple,
        { dashed: true, width: 2.5 }
      );
      curve(
        plot,
        linearTerm,
        colors.gold,
        { dashed: true, width: 2.5 }
      );
    }
    curve(plot, evaluate, colors.blue);
    if (view >= 1) {
      curve(
        plot,
        derivative,
        colors.green,
        { width: 2.9 }
      );
    }
    legend(svg, [
      { label: "다항함수", color: colors.blue },
      ...(view === 0
        ? [
            {
              label: "삼차항",
              color: colors.purple,
              dashed: true,
            },
            {
              label: "일차항",
              color: colors.gold,
              dashed: true,
            },
          ]
        : [{ label: "도함수", color: colors.green }]),
    ]);

    return {
      state: `a=${cubic}, b=${linear}`,
      value:
        `도함수: ${round(1.05 * cubic)}x²` +
        `${linear >= 0 ? "+" : ""}${linear}`,
      verdict:
        view === 0
          ? "각 항의 그래프를 더하면 파란 다항함수가 됩니다."
          : "삼차항은 이차항으로, 일차항은 상수항으로 미분됩니다.",
      formula:
        `\\(f(x)=${round(0.35 * cubic)}x^3` +
        `${linear >= 0 ? "+" : ""}${linear}x,\\;` +
        `f'(x)=${round(1.05 * cubic)}x^2` +
        `${linear >= 0 ? "+" : ""}${linear}\\)`,
      tip:
        "점선으로 분리한 각 항이 도함수에서 어떻게 바뀌는지 보세요.",
    };
  }

  function tangentScene(
    svg,
    coefficient,
    observation,
    view,
    zoom
  ) {
    const { plot } = canvas(
      svg,
      {
        xMin: -4,
        xMax: 4,
        yMin: -7,
        yMax: 10,
      },
      zoom
    );
    const evaluate = (x) =>
      0.5 * coefficient * x ** 2 - 2;
    const slope = coefficient * observation;
    const y = evaluate(observation);
    const tangent = (x) =>
      y + slope * (x - observation);

    curve(plot, evaluate, colors.blue);
    point(
      plot,
      observation,
      y,
      colors.blue
    );
    if (view >= 1) {
      curve(
        plot,
        tangent,
        colors.purple,
        { dashed: view === 1, width: 3 }
      );
    }
    if (view === 2) {
      line(
        plot,
        observation,
        0,
        observation,
        y,
        colors.muted,
        { dashed: true, width: 1.5 }
      );
    }
    legend(svg, [
      { label: "곡선", color: colors.blue },
      ...(view >= 1
        ? [
            {
              label: "접선",
              color: colors.purple,
              dashed: view === 1,
            },
          ]
        : []),
    ]);

    return {
      state:
        `접점 (${observation}, ${round(y)})`,
      value: `접선 기울기 ${round(slope)}`,
      verdict:
        "접선은 접점을 지나고 그 점의 미분계수를 기울기로 갖습니다.",
      formula:
        `\\(y-${round(y)}=${round(slope)}` +
        `(x-${observation})\\)`,
      tip:
        "접점을 움직여도 보라색 직선이 항상 곡선에 한 점에서 맞닿는지 보세요.",
    };
  }

  function meanValueScene(
    svg,
    coefficient,
    right,
    view,
    zoom
  ) {
    const left = -2;
    const { plot } = canvas(
      svg,
      {
        xMin: -4,
        xMax: 5,
        yMin: -5,
        yMax: 10,
      },
      zoom
    );
    const evaluate = (x) =>
      0.5 * coefficient * x ** 2 - 1;
    const meanSlope =
      (evaluate(right) - evaluate(left)) /
      (right - left);
    const c = (left + right) / 2;
    const tangent = (x) =>
      evaluate(c) +
      meanSlope * (x - c);

    curve(plot, evaluate, colors.blue);
    point(
      plot,
      left,
      evaluate(left),
      colors.blue
    );
    point(
      plot,
      right,
      evaluate(right),
      colors.blue
    );
    line(
      plot,
      left,
      evaluate(left),
      right,
      evaluate(right),
      colors.gold,
      { width: 3 }
    );
    if (view >= 1) {
      curve(
        plot,
        tangent,
        colors.purple,
        { dashed: true, width: 2.8 }
      );
      point(
        plot,
        c,
        evaluate(c),
        colors.purple
      );
    }
    legend(svg, [
      { label: "함수", color: colors.blue },
      { label: "할선", color: colors.gold },
      ...(view >= 1
        ? [
            {
              label: "평행한 접선",
              color: colors.purple,
              dashed: true,
            },
          ]
        : []),
    ]);

    return {
      state: `구간 [${left}, ${right}]`,
      value:
        `평균변화율 ${round(meanSlope)}, ` +
        `c=${round(c)}`,
      verdict:
        "구간 안의 보라색 접선이 양 끝점을 잇는 노란 할선과 평행합니다.",
      formula:
        `\\(f'(${round(c)})=` +
        `\\frac{f(${right})-f(${left})}` +
        `{${right}-${left}}=${round(meanSlope)}\\)`,
      tip:
        "노란 할선과 보라색 접선의 기울기가 같은지 비교하세요.",
    };
  }

  function extremaScene(
    svg,
    coefficient,
    radius,
    view,
    zoom
  ) {
    const { plot } = canvas(
      svg,
      {
        xMin: -4,
        xMax: 4,
        yMin: -9,
        yMax: 9,
      },
      zoom
    );
    const evaluate = (x) =>
      coefficient *
      (x ** 3 / 3 - radius ** 2 * x);
    const derivative = (x) =>
      coefficient * (x ** 2 - radius ** 2);

    curve(plot, evaluate, colors.blue);
    if (view >= 1) {
      curve(
        plot,
        derivative,
        colors.green,
        { width: 2.8 }
      );
      areaBetween(
        plot,
        () => Math.max(0, derivative(0)),
        () => 0,
        -radius,
        radius,
        colors.fillRed
      );
    }
    point(
      plot,
      -radius,
      evaluate(-radius),
      colors.purple
    );
    point(
      plot,
      radius,
      evaluate(radius),
      colors.gold
    );
    legend(svg, [
      { label: "원함수", color: colors.blue },
      ...(view >= 1
        ? [{ label: "도함수", color: colors.green }]
        : []),
      { label: "극대", color: colors.purple },
      { label: "극소", color: colors.gold },
    ]);

    return {
      state:
        `임계점 x=±${round(radius, 1)}`,
      value:
        `극대 ${round(evaluate(-radius))}, ` +
        `극소 ${round(evaluate(radius))}`,
      verdict:
        "도함수 부호가 +→−이면 극대, −→+이면 극소가 됩니다.",
      formula:
        `\\(f'(x)=${coefficient}` +
        `(x^2-${round(radius ** 2)})\\)`,
      tip:
        "초록 도함수가 x축을 지날 때 파란 함수의 방향이 바뀝니다.",
    };
  }

  function sketchScene(
    svg,
    leading,
    tilt,
    view,
    zoom
  ) {
    const { plot } = canvas(
      svg,
      {
        xMin: -4,
        xMax: 4,
        yMin: -8,
        yMax: 12,
      },
      zoom
    );
    const evaluate = (x) =>
      0.22 * leading * x ** 4 -
      1.3 * x ** 2 +
      0.5 * tilt * x;
    const derivative = (x) =>
      0.88 * leading * x ** 3 -
      2.6 * x +
      0.5 * tilt;
    const criticalPoints = findRoots(
      derivative,
      -4,
      4
    );

    curve(plot, evaluate, colors.blue);
    if (view >= 1) {
      curve(
        plot,
        derivative,
        colors.green,
        { width: 2.7 }
      );
    }
    if (view === 2) {
      criticalPoints.forEach((x, index) => {
        point(
          plot,
          x,
          evaluate(x),
          index % 2
            ? colors.gold
            : colors.purple
        );
      });
    }
    legend(svg, [
      { label: "사차함수", color: colors.blue },
      ...(view >= 1
        ? [{ label: "삼차 도함수", color: colors.green }]
        : []),
      ...(view === 2
        ? [{ label: "임계점", color: colors.purple }]
        : []),
    ]);

    return {
      state:
        `최고차항 ${round(0.22 * leading)}x⁴, ` +
        `기울임 ${tilt}`,
      value:
        `임계점 ${criticalPoints.length}개`,
      verdict:
        "사차함수의 양 끝 방향과 도함수의 영점을 함께 보면 W형 개형이 완성됩니다.",
      formula:
        `\\(f(x)=${round(0.22 * leading)}x^4` +
        `-1.3x^2${tilt >= 0 ? "+" : ""}` +
        `${round(0.5 * tilt)}x\\)`,
      tip:
        "최고차항이 정하는 양 끝 방향과 표시된 임계점을 연결하세요.",
    };
  }

  function equationScene(
    svg,
    scale,
    level,
    view,
    zoom
  ) {
    const { plot } = canvas(
      svg,
      {
        xMin: -4,
        xMax: 4,
        yMin: -7,
        yMax: 7,
      },
      zoom
    );
    const evaluate = (x) =>
      scale * (x ** 3 / 3 - 2 * x);
    const difference = (x) =>
      evaluate(x) - level;
    const roots = findRoots(
      difference,
      plot.xMin,
      plot.xMax
    );

    curve(plot, evaluate, colors.blue);
    curve(
      plot,
      () => level,
      colors.gold,
      { dashed: view < 2, width: 3 }
    );
    if (view >= 1) {
      roots.forEach((x) => {
        point(
          plot,
          x,
          level,
          colors.purple
        );
      });
    }
    legend(svg, [
      { label: "y=f(x)", color: colors.blue },
      {
        label: `y=${level}`,
        color: colors.gold,
        dashed: view < 2,
      },
      ...(view >= 1
        ? [{ label: "실근", color: colors.purple }]
        : []),
    ]);

    return {
      state: `세로 배율 ${scale}, k=${level}`,
      value: `교점 ${roots.length}개`,
      verdict:
        `f(x)=${level}의 서로 다른 실근은 ` +
        `그래프와 수평선의 교점 ${roots.length}개입니다.`,
      formula:
        `\\(${scale}(x^3/3-2x)=${level}\\)`,
      tip:
        "노란 수평선을 위아래로 움직여 교점 개수가 바뀌는 경계를 찾으세요.",
    };
  }

  function motionScene(
    svg,
    acceleration,
    time,
    view,
    zoom
  ) {
    const { plot } = canvas(
      svg,
      {
        xMin: 0,
        xMax: 6,
        yMin: -8,
        yMax: 12,
        xCenter: 3,
      },
      zoom
    );
    const position = (t) =>
      0.5 * acceleration * t ** 2 - 2 * t + 1;
    const velocity = (t) =>
      acceleration * t - 2;
    const currentPosition = position(time);
    const currentVelocity = velocity(time);

    curve(
      plot,
      position,
      colors.blue,
      { start: 0, end: 6 }
    );
    if (view >= 1) {
      curve(
        plot,
        velocity,
        colors.green,
        { start: 0, end: 6, width: 2.9 }
      );
    }
    if (view === 2) {
      curve(
        plot,
        () => acceleration,
        colors.purple,
        {
          start: 0,
          end: 6,
          dashed: true,
          width: 2.7,
        }
      );
    }
    point(
      plot,
      time,
      currentPosition,
      colors.blue
    );
    legend(svg, [
      { label: "위치 s", color: colors.blue },
      ...(view >= 1
        ? [{ label: "속도 v", color: colors.green }]
        : []),
      ...(view === 2
        ? [
            {
              label: "가속도 a",
              color: colors.purple,
              dashed: true,
            },
          ]
        : []),
    ]);

    return {
      state: `t=${time}, a=${acceleration}`,
      value:
        `s=${round(currentPosition)}, ` +
        `v=${round(currentVelocity)}`,
      verdict:
        currentVelocity > 0
          ? "속도가 양수이므로 물체가 양의 방향으로 움직입니다."
          : currentVelocity < 0
            ? "속도가 음수이므로 물체가 음의 방향으로 움직입니다."
            : "속도가 0이 되어 운동 방향이 바뀔 수 있는 순간입니다.",
      formula:
        `\\(s(t)=${round(0.5 * acceleration)}t^2` +
        `-2t+1,\\;v(t)=${acceleration}t-2,\\;` +
        `a(t)=${acceleration}\\)`,
      tip:
        "같은 시각에서 위치, 속도, 가속도 세 그래프의 높이를 비교하세요.",
    };
  }

  function antiderivativeScene(
    svg,
    slope,
    constant,
    view,
    zoom
  ) {
    const { plot } = canvas(
      svg,
      {
        xMin: -4,
        xMax: 4,
        yMin: -9,
        yMax: 9,
      },
      zoom
    );
    const integrand = (x) => slope * x;
    const antiderivative = (offset) => (x) =>
      0.5 * slope * x ** 2 + offset;

    curve(
      plot,
      integrand,
      colors.green,
      { dashed: true, width: 2.7 }
    );
    if (view >= 1) {
      curve(
        plot,
        antiderivative(constant),
        colors.blue
      );
    }
    if (view === 2) {
      curve(
        plot,
        antiderivative(constant + 2),
        colors.purple,
        { width: 2.5 }
      );
      curve(
        plot,
        antiderivative(constant - 2),
        colors.gold,
        { width: 2.5 }
      );
    }
    legend(svg, [
      {
        label: "f(x)",
        color: colors.green,
        dashed: true,
      },
      ...(view >= 1
        ? [{ label: "F(x)+C", color: colors.blue }]
        : []),
      ...(view === 2
        ? [{ label: "다른 C", color: colors.purple }]
        : []),
    ]);

    return {
      state: `a=${slope}, C=${constant}`,
      value:
        view === 2
          ? "세 곡선의 세로 간격은 달라도 기울기는 같습니다."
          : "원시함수의 기울기 = 피적분함수 값",
      verdict:
        "적분상수 C는 원시함수 그래프를 위아래로 평행이동시킵니다.",
      formula:
        `\\(\\int ${slope}x\\,dx=` +
        `${round(0.5 * slope)}x^2` +
        `${constant >= 0 ? "+" : ""}${constant}\\)`,
      tip:
        "C를 바꾸면 파란 곡선의 모양은 그대로이고 높이만 바뀝니다.",
    };
  }

  function polynomialIntegralScene(
    svg,
    coefficient,
    constant,
    view,
    zoom
  ) {
    const { plot } = canvas(
      svg,
      {
        xMin: -3.5,
        xMax: 3.5,
        yMin: -10,
        yMax: 10,
      },
      zoom
    );
    const integrand = (x) =>
      coefficient * x ** 2 - 2 * x + 1;
    const antiderivative = (x) =>
      (coefficient / 3) * x ** 3 -
      x ** 2 +
      x +
      constant;

    curve(
      plot,
      integrand,
      colors.green,
      { dashed: view === 0, width: 2.8 }
    );
    if (view >= 1) {
      curve(
        plot,
        antiderivative,
        colors.blue
      );
    }
    if (view === 2) {
      const x = 1;
      point(
        plot,
        x,
        antiderivative(x),
        colors.purple
      );
      line(
        plot,
        x - 1,
        antiderivative(x) - integrand(x),
        x + 1,
        antiderivative(x) + integrand(x),
        colors.purple,
        { dashed: true }
      );
    }
    legend(svg, [
      {
        label: "피적분함수",
        color: colors.green,
        dashed: view === 0,
      },
      ...(view >= 1
        ? [{ label: "원시함수", color: colors.blue }]
        : []),
    ]);

    return {
      state: `a=${coefficient}, C=${constant}`,
      value:
        `원시함수 최고차항 계수 ` +
        `${round(coefficient / 3)}`,
      verdict:
        "각 항의 지수를 1 늘리고 새 지수로 나누면 파란 원시함수가 됩니다.",
      formula:
        `\\(\\int(${coefficient}x^2-2x+1)dx=` +
        `${round(coefficient / 3)}x^3-x^2+x` +
        `${constant >= 0 ? "+" : ""}${constant}\\)`,
      tip:
        "초록 이차함수를 적분하면 차수가 하나 높은 파란 삼차함수가 됩니다.",
    };
  }

  function definiteIntegralScene(
    svg,
    scale,
    bound,
    view,
    zoom
  ) {
    const { plot } = canvas(
      svg,
      {
        xMin: -1,
        xMax: 5.5,
        yMin: -5,
        yMax: 7,
        xCenter: 2.25,
      },
      zoom
    );
    const evaluate = (x) =>
      scale * (0.55 * x - 1);
    const zero = 1 / 0.55;
    const integral =
      scale * (0.275 * bound ** 2 - bound);

    areaBetween(
      plot,
      evaluate,
      () => 0,
      0,
      Math.min(bound, zero),
      colors.fillRed
    );
    if (bound > zero) {
      areaBetween(
        plot,
        evaluate,
        () => 0,
        zero,
        bound,
        colors.fillBlue
      );
    }
    rectangles(
      plot,
      evaluate,
      0,
      bound,
      [6, 14, 28][view] || 28
    );
    curve(
      plot,
      evaluate,
      colors.blue,
      { start: -1, end: 5.5 }
    );
    line(
      plot,
      bound,
      0,
      bound,
      evaluate(bound),
      colors.green,
      { dashed: true }
    );
    legend(svg, [
      { label: "f(x)", color: colors.blue },
      { label: "음의 넓이", color: colors.red },
      { label: "양의 넓이", color: colors.blue },
    ]);

    return {
      state:
        `구간 [0, ${bound}], 분할 ` +
        `${[6, 14, 28][view] || 28}개`,
      value: `부호 있는 합 ${round(integral)}`,
      verdict:
        "x축 아래 넓이는 음수, 위 넓이는 양수로 더해 정적분을 만듭니다.",
      formula:
        `\\(\\int_0^{${bound}}${scale}` +
        `(0.55x-1)\\,dx=${round(integral)}\\)`,
      tip:
        "빨간 영역과 파란 영역이 서로 상쇄되는 양을 확인하세요.",
    };
  }

  function fundamentalTheoremScene(
    svg,
    coefficient,
    bound,
    view,
    zoom
  ) {
    const { plot } = canvas(
      svg,
      {
        xMin: -2,
        xMax: 5.5,
        yMin: -5,
        yMax: 13,
        xCenter: 1.75,
      },
      zoom
    );
    const integrand = (x) =>
      coefficient * (x + 1);
    const accumulated = (x) =>
      coefficient * (0.5 * x ** 2 + x);
    const integral = accumulated(bound);

    areaBetween(
      plot,
      integrand,
      () => 0,
      0,
      bound,
      colors.fillBlue
    );
    curve(
      plot,
      integrand,
      colors.green,
      { width: 2.9 }
    );
    if (view >= 1) {
      curve(
        plot,
        accumulated,
        colors.blue
      );
    }
    point(
      plot,
      bound,
      accumulated(bound),
      colors.purple
    );
    line(
      plot,
      bound,
      0,
      bound,
      accumulated(bound),
      colors.purple,
      { dashed: true }
    );
    legend(svg, [
      { label: "f(x)", color: colors.green },
      ...(view >= 1
        ? [{ label: "F(x)-F(0)", color: colors.blue }]
        : []),
      { label: "끝값", color: colors.purple },
    ]);

    return {
      state: `a=${coefficient}, b=${bound}`,
      value:
        `넓이 = 끝값 차 = ${round(integral)}`,
      verdict:
        "초록 함수 아래의 누적 넓이와 파란 원시함수의 끝값 차가 같습니다.",
      formula:
        `\\(\\int_0^{${bound}}${coefficient}` +
        `(x+1)dx=F(${bound})-F(0)=` +
        `${round(integral)}\\)`,
      tip:
        "채워진 넓이와 보라색 끝점의 높이가 같은 값인지 확인하세요.",
    };
  }

  function areaScene(
    svg,
    radius,
    height,
    view,
    zoom
  ) {
    const { plot } = canvas(
      svg,
      {
        xMin: -4,
        xMax: 4,
        yMin: -5,
        yMax: 6,
      },
      zoom
    );
    const upper = (x) =>
      height * (1 - (x / radius) ** 2);
    const lower = (x) =>
      -0.35 *
      height *
      (1 - (x / radius) ** 2);
    const area = 1.8 * height * radius;

    areaBetween(
      plot,
      upper,
      lower,
      -radius,
      radius,
      view === 0
        ? colors.fillBlue
        : colors.fillGreen
    );
    curve(plot, upper, colors.blue);
    curve(
      plot,
      lower,
      colors.purple,
      { width: 3 }
    );
    point(
      plot,
      -radius,
      0,
      colors.gold
    );
    point(
      plot,
      radius,
      0,
      colors.gold
    );
    if (view === 2) {
      line(
        plot,
        0,
        lower(0),
        0,
        upper(0),
        colors.green,
        { dashed: true }
      );
    }
    legend(svg, [
      { label: "위 함수", color: colors.blue },
      { label: "아래 함수", color: colors.purple },
      { label: "교점", color: colors.gold },
    ]);

    return {
      state:
        `교점 x=±${radius}, 높이 ${height}`,
      value: `두 곡선 사이 넓이 ${round(area)}`,
      verdict:
        "두 교점 사이에서 위 함수에서 아래 함수를 뺀 영역이 실제 넓이입니다.",
      formula:
        `\\(A=\\int_{-${radius}}^{${radius}}` +
        `(f(x)-g(x))dx=${round(area)}\\)`,
      tip:
        "파란 곡선과 보라색 곡선의 위아래가 바뀌는 교점을 먼저 보세요.",
    };
  }

  function velocityIntegralScene(
    svg,
    scale,
    turn,
    view,
    zoom
  ) {
    const end = 5;
    const { plot } = canvas(
      svg,
      {
        xMin: 0,
        xMax: 5.5,
        yMin: -7,
        yMax: 9,
        xCenter: 2.75,
      },
      zoom
    );
    const velocity = (time) =>
      scale * (time - turn);
    const position = (time) =>
      0.5 * scale * (time - turn) ** 2 -
      0.5 * scale * turn ** 2;
    const displacement =
      0.5 *
      scale *
      ((end - turn) ** 2 - turn ** 2);
    const distance =
      0.5 *
      scale *
      ((end - turn) ** 2 + turn ** 2);

    areaBetween(
      plot,
      velocity,
      () => 0,
      0,
      turn,
      colors.fillRed
    );
    areaBetween(
      plot,
      velocity,
      () => 0,
      turn,
      end,
      colors.fillGreen
    );
    curve(
      plot,
      velocity,
      colors.green,
      { start: 0, end: end }
    );
    if (view >= 1) {
      curve(
        plot,
        position,
        colors.blue,
        { start: 0, end: end, width: 2.9 }
      );
    }
    point(
      plot,
      turn,
      0,
      colors.gold
    );
    legend(svg, [
      { label: "속도 v", color: colors.green },
      ...(view >= 1
        ? [{ label: "위치 s", color: colors.blue }]
        : []),
      { label: "방향 전환", color: colors.gold },
    ]);

    return {
      state:
        `방향 전환 t=${turn}, 구간 [0, ${end}]`,
      value:
        view === 2
          ? `변위 ${round(displacement)}, 거리 ${round(distance)}`
          : `부호 있는 변위 ${round(displacement)}`,
      verdict:
        "빨간 음의 속도 영역은 변위에서 빼지만 이동거리에는 양수로 더합니다.",
      formula:
        `\\(\\int_0^5 v(t)dt=${round(displacement)},\\;` +
        `\\int_0^5|v(t)|dt=${round(distance)}\\)`,
      tip:
        "속도가 0이 되는 금색 점에서 구간을 나눠 부호를 바꾸세요.",
    };
  }

  const renderers = {
    "calculus-1-02-01":
      derivativeCoefficientScene,
    "calculus-1-02-02":
      differentiabilityScene,
    "calculus-1-02-03": powerScene,
    "calculus-1-02-04":
      polynomialDerivativeScene,
    "calculus-1-02-05": tangentScene,
    "calculus-1-02-06": meanValueScene,
    "calculus-1-02-07": extremaScene,
    "calculus-1-02-08": sketchScene,
    "calculus-1-02-09": equationScene,
    "calculus-1-02-10": motionScene,
    "calculus-1-03-01": antiderivativeScene,
    "calculus-1-03-02":
      polynomialIntegralScene,
    "calculus-1-03-03":
      definiteIntegralScene,
    "calculus-1-03-04":
      fundamentalTheoremScene,
    "calculus-1-03-05": areaScene,
    "calculus-1-03-06":
      velocityIntegralScene,
  };

  function renderScene(
    svg,
    primaryValue,
    secondaryValue,
    view,
    zoom = 1
  ) {
    const renderer =
      renderers[conceptId] ||
      (profile.mode === "derivative"
        ? derivativeCoefficientScene
        : definiteIntegralScene);

    return renderer(
      svg,
      primaryValue,
      secondaryValue,
      Math.min(2, Math.max(0, view)),
      zoom
    );
  }

  const playground = document.getElementById(
    "calculus-playground-visual"
  );
  const primary = document.getElementById(
    "calculus-primary"
  );
  const secondary = document.getElementById(
    "calculus-secondary"
  );
  const primaryOutput = document.getElementById(
    "calculus-primary-output"
  );
  const secondaryOutput = document.getElementById(
    "calculus-secondary-output"
  );
  const formula = document.getElementById(
    "calculus-formula"
  );
  const state = document.getElementById(
    "calculus-state"
  );
  const value = document.getElementById(
    "calculus-value"
  );
  const verdict = document.getElementById(
    "calculus-verdict"
  );
  const tip = document.getElementById(
    "calculus-tip"
  );
  const rerun = document.getElementById(
    "rerun-calculus-lab"
  );
  const zoomStatus = document.getElementById(
    "calculus-zoom-status"
  );
  const zoomButtons = Array.from(
    document.querySelectorAll(
      "[data-calculus-zoom]"
    )
  );
  const viewButtons = Array.from(
    document.querySelectorAll(
      "[data-calculus-view]"
    )
  );
  let view = 0;
  let zoom = 1;

  function renderPlayground() {
    if (!playground || !primary || !secondary) {
      return;
    }

    const primaryValue = Number(primary.value);
    const secondaryValue = Number(
      secondary.value
    );
    const result = renderScene(
      playground,
      primaryValue,
      secondaryValue,
      view,
      zoom
    );

    primaryOutput.textContent = String(primaryValue);
    secondaryOutput.textContent =
      String(secondaryValue);
    state.textContent = result.state;
    value.textContent = result.value;
    verdict.textContent = result.verdict;
    tip.textContent = result.tip;
    if (zoomStatus) {
      zoomStatus.textContent =
        `${Math.round(zoom * 100)}%`;
    }
    setMath(formula, result.formula);
  }

  function setZoom(nextZoom) {
    zoom = Math.min(
      4,
      Math.max(0.6, Number(nextZoom) || 1)
    );
    renderPlayground();
  }

  primary?.addEventListener(
    "input",
    renderPlayground
  );
  secondary?.addEventListener(
    "input",
    renderPlayground
  );
  rerun?.addEventListener("click", () => {
    view = (view + 1) % 3;
    viewButtons.forEach((button, index) => {
      button.classList.toggle(
        "active",
        index === view
      );
    });
    renderPlayground();
  });
  viewButtons.forEach((button, index) => {
    button.addEventListener("click", () => {
      view = index;
      viewButtons.forEach(
        (candidate, candidateIndex) => {
          candidate.classList.toggle(
            "active",
            candidateIndex === view
          );
        }
      );
      renderPlayground();
    });
  });

  zoomButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const action =
        button.dataset.calculusZoom;

      if (action === "in") {
        setZoom(zoom * 1.25);
      } else if (action === "out") {
        setZoom(zoom / 1.25);
      } else {
        setZoom(1);
      }
    });
  });

  playground?.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const factor = Math.exp(
        -event.deltaY * 0.0015
      );
      setZoom(zoom * factor);
    },
    { passive: false }
  );

  playground?.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "+" ||
        event.key === "="
      ) {
        event.preventDefault();
        setZoom(zoom * 1.25);
      } else if (event.key === "-") {
        event.preventDefault();
        setZoom(zoom / 1.25);
      } else if (event.key === "0") {
        event.preventDefault();
        setZoom(1);
      }
    }
  );

  const pointers = new Map();
  let pinchDistance = 0;
  let pinchZoom = 1;

  function pointerDistance() {
    const positions = Array.from(
      pointers.values()
    );

    if (positions.length < 2) return 0;
    return Math.hypot(
      positions[0].x - positions[1].x,
      positions[0].y - positions[1].y
    );
  }

  playground?.addEventListener(
    "pointerdown",
    (event) => {
      pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      try {
        playground.setPointerCapture(
          event.pointerId
        );
      } catch (_error) {
        // Some embedded browsers do not expose pointer capture.
      }

      if (pointers.size === 2) {
        pinchDistance = pointerDistance();
        pinchZoom = zoom;
      }
    }
  );

  playground?.addEventListener(
    "pointermove",
    (event) => {
      if (!pointers.has(event.pointerId)) {
        return;
      }

      pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (
        pointers.size === 2 &&
        pinchDistance > 0
      ) {
        event.preventDefault();
        setZoom(
          pinchZoom *
            (pointerDistance() / pinchDistance)
        );
      }
    }
  );

  function releasePointer(event) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) {
      pinchDistance = 0;
    }
  }

  playground?.addEventListener(
    "pointerup",
    releasePointer
  );
  playground?.addEventListener(
    "pointercancel",
    releasePointer
  );
  playground?.addEventListener(
    "dblclick",
    () => setZoom(1)
  );

  const motion = document.getElementById(
    "calculus-motion-visual"
  );
  const replay = document.getElementById(
    "replay-calculus-motion"
  );
  const caption = document.getElementById(
    "motion-caption-text"
  );
  let motionTimer = null;

  function renderMotion() {
    if (!motion) return;
    window.clearInterval(motionTimer);
    let stage = 0;
    replay.disabled = true;

    const drawStage = () => {
      const result = renderScene(
        motion,
        Number(profile.primary.value),
        Number(profile.secondary.value),
        Math.min(2, stage),
        1
      );

      if (
        caption &&
        Array.isArray(config.motionCaptions)
      ) {
        setMath(
          caption,
          config.motionCaptions[
            Math.min(
              stage,
              config.motionCaptions.length - 1
            )
          ] || result.verdict
        );
      }

      stage += 1;
      if (stage >= 3) {
        window.clearInterval(motionTimer);
        replay.disabled = false;
      }
    };

    drawStage();
    motionTimer = window.setInterval(
      drawStage,
      1100
    );
  }

  replay?.addEventListener(
    "click",
    renderMotion
  );

  renderPlayground();
  renderMotion();
})();
