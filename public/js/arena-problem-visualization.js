(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const WIDTH = 760;
  const HEIGHT = 440;
  const PLOT = Object.freeze({ left: 68, right: 704, top: 46, bottom: 374 });
  const CURVE_COLORS = Object.freeze(["#111827", "#2563eb", "#0f766e", "#b45309"]);

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function element(name, attributes = {}) {
    const node = document.createElementNS(NS, name);
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== undefined && value !== null) node.setAttribute(key, String(value));
    });
    return node;
  }

  function text(svg, value, x, y, options = {}) {
    const node = element("text", {
      x,
      y,
      fill: options.fill || "#111827",
      "font-size": options.size || 12,
      "font-weight": options.weight || 650,
      "text-anchor": options.anchor || "middle",
      "font-family": "Pretendard, Noto Sans KR, Arial, sans-serif",
    });
    node.textContent = String(value);
    svg.append(node);
    return node;
  }

  function cleanNumber(value) {
    if (Math.abs(value) < 1e-8) return "0";
    if (Math.abs(value - Math.round(value)) < 1e-8) return String(Math.round(value));
    return String(Number(value.toFixed(2)));
  }

  function signedTerm(value, variable = "") {
    if (!value) return "";
    const sign = value > 0 ? "+" : "−";
    const magnitude = Math.abs(value);
    const coefficient = magnitude === 1 && variable ? "" : cleanNumber(magnitude);
    return `${sign}${coefficient}${variable}`;
  }

  function polynomialFormula(coefficients = {}, name = "f") {
    const cubic = finite(coefficients.cubic, 0);
    const quadratic = finite(coefficients.quadratic, finite(coefficients.a, 0));
    const linear = finite(coefficients.linear, finite(coefficients.b, 0));
    const constant = finite(coefficients.constant, finite(coefficients.c, 0));
    const terms = [
      [cubic, "x³"],
      [quadratic, "x²"],
      [linear, "x"],
      [constant, ""],
    ].filter(([coefficient]) => coefficient !== 0);
    if (!terms.length) return `y=${name}(x)=0`;
    const expression = terms.map(([coefficient, variable], index) => {
      const magnitude = Math.abs(coefficient);
      const number = magnitude === 1 && variable ? "" : cleanNumber(magnitude);
      const term = `${number}${variable}`;
      if (index === 0) return coefficient < 0 ? `−${term}` : term;
      return `${coefficient < 0 ? "−" : "+"}${term}`;
    }).join("");
    return `y=${name}(x)=${expression}`;
  }

  function sampleFunction(start, end, evaluator, count = 260) {
    const points = [];
    for (let index = 0; index <= count; index += 1) {
      const x = start + ((end - start) * index) / count;
      const y = evaluator(x);
      points.push({ x, y: Number.isFinite(y) && Math.abs(y) < 1e5 ? y : NaN });
    }
    return points;
  }

  function descriptorFor(model, index = 0) {
    const kind = String(model.kind || model.type || "").trim().toLowerCase();
    const domain = Array.isArray(model.domain) && model.domain.length === 2
      ? model.domain.map(Number)
      : null;
    if (kind === "polynomial") {
      const coefficients = model.coefficients || {};
      const cubic = finite(coefficients.cubic, 0);
      const quadratic = finite(coefficients.quadratic, finite(coefficients.a, 0));
      const linear = finite(coefficients.linear, finite(coefficients.b, 0));
      const constant = finite(coefficients.constant, finite(coefficients.c, 0));
      return {
        label: model.label || polynomialFormula(coefficients, model.functionLabel || (index ? `f${index + 1}` : "f")),
        color: model.color || CURVE_COLORS[index % CURVE_COLORS.length],
        domain: domain || [finite(model.focusX, 0) - 6, finite(model.focusX, 0) + 6],
        evaluate: (x) => cubic * x ** 3 + quadratic * x ** 2 + linear * x + constant,
      };
    }
    if (kind === "algebra-trig" || kind === "trigonometric") {
      const amplitude = finite(model.amplitude, 1);
      const frequency = Math.max(0.01, finite(model.frequency, 1));
      const shift = finite(model.verticalShift, 0);
      const functionName = String(model.functionName || "sin").toLowerCase().includes("cos") ? "cos" : "sin";
      const radians = String(model.xUnit || "radian").toLowerCase() !== "degree";
      const argument = frequency === 1 ? "x" : `${cleanNumber(frequency)}x`;
      const amplitudeText = amplitude === 1 ? "" : amplitude === -1 ? "−" : cleanNumber(amplitude);
      return {
        label: model.label || `y=${amplitudeText}${functionName}(${argument})${signedTerm(shift)}`,
        color: model.color || CURVE_COLORS[index % CURVE_COLORS.length],
        domain: domain || (radians ? [-2 * Math.PI, 2 * Math.PI] : [-360, 360]),
        evaluate: (x) => amplitude * (functionName === "cos" ? Math.cos : Math.sin)(frequency * (radians ? x : x * Math.PI / 180)) + shift,
      };
    }
    if (kind === "algebra-exp-log" || kind === "exponential" || kind === "logarithmic") {
      const base = Math.max(1.01, finite(model.base, 2));
      const shiftX = finite(model.shiftX, 0);
      const shiftY = finite(model.shiftY, 0);
      const logMode = kind === "logarithmic" || String(model.focusFunction || model.functionType || "").includes("log");
      return {
        label: model.label || (logMode
          ? `y=log_${cleanNumber(base)}(x${signedTerm(-shiftX)})${signedTerm(shiftY)}`
          : `y=${cleanNumber(base)}^(x${signedTerm(-shiftX)})${signedTerm(shiftY)}`),
        color: model.color || CURVE_COLORS[index % CURVE_COLORS.length],
        domain: domain || (logMode ? [shiftX + 0.025, shiftX + 8] : [-5, 5]),
        evaluate: (x) => logMode
          ? (x <= shiftX ? NaN : Math.log(x - shiftX) / Math.log(base) + shiftY)
          : Math.pow(base, x - shiftX) + shiftY,
      };
    }
    if (["inverse-square", "rational-continuity", "rational"].includes(kind)) {
      const numerator = finite(model.numeratorConstant, finite(model.numerator, 1));
      const shiftX = finite(model.shiftX, 0);
      const shiftY = finite(model.shiftY, 0);
      return {
        label: model.label || `y=${cleanNumber(numerator)}/(x${signedTerm(-shiftX)})${signedTerm(shiftY)}`,
        color: model.color || CURVE_COLORS[index % CURVE_COLORS.length],
        domain: domain || [-6, 6],
        evaluate: (x) => Math.abs(x - shiftX) < 0.02 ? NaN : numerator / (x - shiftX) + shiftY,
      };
    }
    if (kind === "hole-linear") {
      const focusX = finite(model.focusX, 0);
      return {
        label: model.label || "y=x+a",
        color: model.color || CURVE_COLORS[index % CURVE_COLORS.length],
        domain: domain || [focusX - 5, focusX + 5],
        evaluate: (x) => x + focusX,
        holes: [{ x: focusX, y: 2 * focusX, label: model.holeLabel || `(${cleanNumber(focusX)}, ${cleanNumber(2 * focusX)})` }],
      };
    }
    return null;
  }

  function graphDescriptors(model) {
    const children = Array.isArray(model.curves)
      ? model.curves
      : Array.isArray(model.functions)
        ? model.functions
        : [model];
    return children.map(descriptorFor).filter(Boolean);
  }

  function explicitPoints(model) {
    const values = Array.isArray(model.labeledPoints)
      ? model.labeledPoints
      : Array.isArray(model.points)
        ? model.points
        : [];
    return values.map((point, index) => ({
      x: finite(point.x),
      y: finite(point.y),
      label: point.label || point.name || String.fromCharCode(65 + index),
      coordinateLabel: point.coordinateLabel || "",
      showCoordinates: point.showCoordinates === true,
      showGuides: point.showGuides === true,
      open: point.open === true,
    }));
  }

  function computedBounds(points, model) {
    const valid = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    const explicitX = model.xRange || model.domain;
    const explicitY = model.yRange || model.range;
    let minX = Array.isArray(explicitX) ? finite(explicitX[0], -5) : Math.min(...valid.map((point) => point.x), -1);
    let maxX = Array.isArray(explicitX) ? finite(explicitX[1], 5) : Math.max(...valid.map((point) => point.x), 1);
    let minY = Array.isArray(explicitY) ? finite(explicitY[0], -5) : Math.min(...valid.map((point) => point.y), -1);
    let maxY = Array.isArray(explicitY) ? finite(explicitY[1], 5) : Math.max(...valid.map((point) => point.y), 1);
    if (minX === maxX) { minX -= 1; maxX += 1; }
    if (minY === maxY) { minY -= 1; maxY += 1; }
    if (!Array.isArray(explicitX)) {
      const pad = Math.max(0.5, (maxX - minX) * 0.1); minX -= pad; maxX += pad;
    }
    if (!Array.isArray(explicitY)) {
      const pad = Math.max(0.5, (maxY - minY) * 0.12); minY -= pad; maxY += pad;
    }
    return { minX, maxX, minY, maxY };
  }

  function coordinateSystem(svg, points, model) {
    const range = computedBounds(points, model);
    const mapX = (value) => PLOT.left + ((value - range.minX) / (range.maxX - range.minX)) * (PLOT.right - PLOT.left);
    const mapY = (value) => PLOT.bottom - ((value - range.minY) / (range.maxY - range.minY)) * (PLOT.bottom - PLOT.top);
    svg.append(element("rect", { x: 0, y: 0, width: WIDTH, height: HEIGHT, fill: "#ffffff" }));
    svg.append(element("rect", { x: PLOT.left, y: PLOT.top, width: PLOT.right - PLOT.left, height: PLOT.bottom - PLOT.top, fill: "#ffffff", stroke: "#cbd5e1", "stroke-width": 1 }));
    for (let step = 0; step <= 8; step += 1) {
      const x = PLOT.left + ((PLOT.right - PLOT.left) * step) / 8;
      svg.append(element("line", { x1: x, x2: x, y1: PLOT.top, y2: PLOT.bottom, stroke: "#eef2f7", "stroke-width": 1 }));
    }
    for (let step = 0; step <= 6; step += 1) {
      const y = PLOT.top + ((PLOT.bottom - PLOT.top) * step) / 6;
      svg.append(element("line", { x1: PLOT.left, x2: PLOT.right, y1: y, y2: y, stroke: "#eef2f7", "stroke-width": 1 }));
    }
    const axisY = range.minY <= 0 && range.maxY >= 0 ? mapY(0) : PLOT.bottom;
    const axisX = range.minX <= 0 && range.maxX >= 0 ? mapX(0) : PLOT.left;
    svg.append(element("line", { x1: PLOT.left, x2: PLOT.right + 7, y1: axisY, y2: axisY, stroke: "#111827", "stroke-width": 1.7 }));
    svg.append(element("path", { d: `M ${PLOT.right + 7} ${axisY} l -8 -4 l 0 8 Z`, fill: "#111827" }));
    svg.append(element("line", { x1: axisX, x2: axisX, y1: PLOT.bottom, y2: PLOT.top - 7, stroke: "#111827", "stroke-width": 1.7 }));
    svg.append(element("path", { d: `M ${axisX} ${PLOT.top - 7} l -4 8 l 8 0 Z`, fill: "#111827" }));
    text(svg, model.xAxisLabel || "x", PLOT.right + 14, axisY + 17, { anchor: "start", size: 12, weight: 750 });
    text(svg, model.yAxisLabel || "y", axisX + 10, PLOT.top - 10, { anchor: "start", size: 12, weight: 750 });
    if (range.minX <= 0 && range.maxX >= 0 && range.minY <= 0 && range.maxY >= 0) {
      text(svg, "O", axisX - 8, axisY + 16, { anchor: "end", size: 11, weight: 600 });
    }
    const xTicks = Array.isArray(model.xTicks) ? model.xTicks.map(Number) : [];
    const yTicks = Array.isArray(model.yTicks) ? model.yTicks.map(Number) : [];
    xTicks.filter(Number.isFinite).forEach((value) => {
      const x = mapX(value);
      svg.append(element("line", { x1: x, x2: x, y1: axisY - 4, y2: axisY + 4, stroke: "#111827" }));
      text(svg, cleanNumber(value), x, axisY + 17, { size: 10, weight: 550 });
    });
    yTicks.filter(Number.isFinite).forEach((value) => {
      const y = mapY(value);
      svg.append(element("line", { x1: axisX - 4, x2: axisX + 4, y1: y, y2: y, stroke: "#111827" }));
      text(svg, cleanNumber(value), axisX - 8, y + 4, { anchor: "end", size: 10, weight: 550 });
    });
    return { range, mapX, mapY, axisX, axisY };
  }

  function pathSegments(points, mapX, mapY) {
    const segments = [];
    let current = [];
    points.forEach((point) => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        if (current.length > 1) segments.push(current);
        current = [];
      } else {
        current.push(point);
      }
    });
    if (current.length > 1) segments.push(current);
    return segments.map((segment) => segment.map((point, index) => `${index ? "L" : "M"} ${mapX(point.x).toFixed(2)} ${mapY(point.y).toFixed(2)}`).join(" "));
  }

  function drawLabeledPoint(svg, point, system, options = {}) {
    const x = system.mapX(point.x);
    const y = system.mapY(point.y);
    if (point.showGuides) {
      svg.append(element("line", { x1: x, x2: x, y1: y, y2: system.axisY, stroke: "#64748b", "stroke-dasharray": "5 4" }));
      svg.append(element("line", { x1: x, x2: system.axisX, y1: y, y2: y, stroke: "#64748b", "stroke-dasharray": "5 4" }));
    }
    svg.append(element("circle", { cx: x, cy: y, r: 4.5, fill: point.open ? "#ffffff" : options.color || "#111827", stroke: options.color || "#111827", "stroke-width": 2 }));
    const coordinate = point.coordinateLabel || (point.showCoordinates ? `(${cleanNumber(point.x)}, ${cleanNumber(point.y)})` : "");
    const label = [point.label, coordinate].filter(Boolean).join(" ");
    if (label) text(svg, label, x + 8, y - 10, { anchor: "start", size: 11, weight: 750, fill: options.color || "#111827" });
  }

  function renderGraph(svg, model) {
    const descriptors = graphDescriptors(model);
    if (!descriptors.length) return false;
    const sampled = descriptors.map((descriptor) => ({
      ...descriptor,
      points: sampleFunction(descriptor.domain[0], descriptor.domain[1], descriptor.evaluate),
    }));
    const labeledPoints = explicitPoints(model);
    const allPoints = sampled.flatMap((descriptor) => descriptor.points).concat(labeledPoints);
    const system = coordinateSystem(svg, allPoints, model);

    (Array.isArray(model.regions) ? model.regions : []).forEach((region) => {
      const points = Array.isArray(region.points) ? region.points : [];
      if (points.length < 3) return;
      svg.append(element("polygon", {
        points: points.map((point) => `${system.mapX(finite(point.x))},${system.mapY(finite(point.y))}`).join(" "),
        fill: region.fill || "rgba(37, 99, 235, 0.14)",
        stroke: region.stroke || "none",
      }));
      if (region.label) {
        const centerX = points.reduce((sum, point) => sum + finite(point.x), 0) / points.length;
        const centerY = points.reduce((sum, point) => sum + finite(point.y), 0) / points.length;
        text(svg, region.label, system.mapX(centerX), system.mapY(centerY), { size: 11, weight: 800 });
      }
    });

    const lines = Array.isArray(model.lines) ? [...model.lines] : [];
    if (Number.isFinite(Number(model.comparisonLineY))) {
      lines.push({ slope: 0, intercept: Number(model.comparisonLineY), label: `y=${cleanNumber(Number(model.comparisonLineY))}`, dashed: true });
    }
    if (model.showInverseLine === true) lines.push({ slope: 1, intercept: 0, label: "y=x", dashed: true });
    lines.forEach((line, index) => {
      const color = line.color || "#7c3aed";
      const x1 = Number.isFinite(Number(line.x1)) ? Number(line.x1) : system.range.minX;
      const x2 = Number.isFinite(Number(line.x2)) ? Number(line.x2) : system.range.maxX;
      const slope = finite(line.slope, 0);
      const intercept = finite(line.intercept, finite(line.y, 0));
      const y1 = Number.isFinite(Number(line.y1)) ? Number(line.y1) : slope * x1 + intercept;
      const y2 = Number.isFinite(Number(line.y2)) ? Number(line.y2) : slope * x2 + intercept;
      svg.append(element("line", { x1: system.mapX(x1), x2: system.mapX(x2), y1: system.mapY(y1), y2: system.mapY(y2), stroke: color, "stroke-width": 2.2, "stroke-dasharray": line.dashed ? "8 6" : "" }));
      if (line.label) text(svg, line.label, system.mapX(x2) - 5, system.mapY(y2) - 8 - index * 12, { anchor: "end", fill: color, size: 11, weight: 750 });
    });

    sampled.forEach((descriptor, index) => {
      pathSegments(descriptor.points, system.mapX, system.mapY).forEach((path) => {
        svg.append(element("path", { d: path, fill: "none", stroke: descriptor.color, "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" }));
      });
      const labelPoint = descriptor.points.filter((point) => Number.isFinite(point.y))[Math.floor(descriptor.points.length * (0.7 - index * 0.08))];
      if (labelPoint && descriptor.label) {
        text(svg, descriptor.label, system.mapX(labelPoint.x), system.mapY(labelPoint.y) - 10, { anchor: "start", fill: descriptor.color, size: 11, weight: 800 });
      }
      (descriptor.holes || []).forEach((point) => drawLabeledPoint(svg, { ...point, open: true }, system, { color: descriptor.color }));
    });
    labeledPoints.forEach((point) => drawLabeledPoint(svg, point, system));

    if (!labeledPoints.length && Number.isFinite(Number(model.focusX))) {
      const focusX = Number(model.focusX);
      const focusY = sampled[0]?.evaluate(focusX);
      if (Number.isFinite(focusY)) {
        drawLabeledPoint(svg, { x: focusX, y: focusY, label: model.focusLabel || "P", showCoordinates: true, showGuides: true }, system, { color: sampled[0].color });
      }
    }
    return true;
  }

  function renderSequence(svg, model) {
    const xValues = Array.isArray(model.xValues) ? model.xValues.map(Number) : [];
    const yValues = Array.isArray(model.yValues) ? model.yValues.map(Number) : [];
    const values = Array.isArray(model.values) ? model.values.map(Number) : [];
    const points = values.length ? values.map((value, index) => ({ x: index + 1, y: value })) : xValues.map((x, index) => ({ x, y: yValues[index] }));
    if (!points.length || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return false;
    const system = coordinateSystem(svg, points, model);
    points.forEach((point, index) => drawLabeledPoint(svg, {
      ...point,
      label: model.pointLabels?.[index] || `a${index + 1}`,
      showCoordinates: model.showCoordinates === true,
      showGuides: index + 1 === Number(model.focusIndex),
    }, system, { color: index + 1 === Number(model.focusIndex) ? "#7c3aed" : "#2563eb" }));
    return true;
  }

  function renderProbability(svg, model) {
    if (!String(model.kind || "").startsWith("probability-")) return false;
    svg.append(element("rect", { x: 0, y: 0, width: WIDTH, height: HEIGHT, fill: "#ffffff" }));
    text(svg, model.title || "문제에 제시된 확률 자료", 52, 54, { anchor: "start", size: 17, weight: 850 });
    const entries = Object.entries(model)
      .filter(([key, value]) => !["kind", "note", "title"].includes(key) && (typeof value === "number" || typeof value === "string" || Array.isArray(value)))
      .slice(0, 10);
    entries.forEach(([key, value], index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 52 + column * 334;
      const y = 82 + row * 58;
      svg.append(element("rect", { x, y, width: 306, height: 48, rx: 3, fill: index % 2 ? "#f8fafc" : "#ffffff", stroke: "#cbd5e1" }));
      text(svg, key, x + 12, y + 19, { anchor: "start", size: 10, fill: "#64748b", weight: 650 });
      text(svg, (Array.isArray(value) ? value.join(", ") : String(value)).slice(0, 42), x + 12, y + 38, { anchor: "start", size: 12, weight: 750 });
    });
    return entries.length > 0;
  }

  function renderGeometry(svg, model) {
    if (String(model.kind || "") !== "geometry") return false;
    const points = explicitPoints(model);
    if (!points.length) return false;
    const system = coordinateSystem(svg, points, model);
    (Array.isArray(model.segments) ? model.segments : []).forEach((segment) => {
      const start = points.find((point) => point.label === segment.from) || segment.from;
      const end = points.find((point) => point.label === segment.to) || segment.to;
      if (!start || !end) return;
      svg.append(element("line", { x1: system.mapX(finite(start.x)), y1: system.mapY(finite(start.y)), x2: system.mapX(finite(end.x)), y2: system.mapY(finite(end.y)), stroke: segment.color || "#111827", "stroke-width": segment.width || 2 }));
    });
    (Array.isArray(model.circles) ? model.circles : []).forEach((circle) => {
      svg.append(element("circle", { cx: system.mapX(finite(circle.cx)), cy: system.mapY(finite(circle.cy)), r: Math.abs(system.mapX(finite(circle.cx) + finite(circle.radius, 1)) - system.mapX(finite(circle.cx))), fill: "none", stroke: circle.color || "#111827", "stroke-width": 2 }));
    });
    points.forEach((point) => drawLabeledPoint(svg, point, system));
    return true;
  }

  function renderInto(svg, model) {
    if (!svg || !model || typeof model !== "object") return false;
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
    const titleNode = element("title");
    titleNode.textContent = "문제의 식과 좌표로 정확히 생성된 그래프 또는 자료";
    svg.append(titleNode);
    return renderGraph(svg, model) ||
      (["algebra-sequence", "table-points"].includes(String(model.kind)) && renderSequence(svg, model)) ||
      renderProbability(svg, model) ||
      renderGeometry(svg, model);
  }

  function boot() {
    document.querySelectorAll("[data-arena-visualization]").forEach((container) => {
      try {
        const model = JSON.parse(decodeURIComponent(container.dataset.arenaVisualization || ""));
        if (!renderInto(container.querySelector("svg"), model)) container.classList.add("is-invalid");
      } catch (_error) {
        container.classList.add("is-invalid");
      }
    });
  }

  window.ArenaProblemVisualization = Object.freeze({ renderInto });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
