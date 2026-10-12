/*
 * GOAT Arena 문제지 시각자료 검증 전용 정책.
 * 평가센터의 그래프 렌더링·문제 생성 코드와 의존성을 공유하지 않는다.
 */

const ARENA_GRAPH_VISUALIZATION_KINDS = new Set([
  "polynomial",
  "algebra-trig",
  "trigonometric",
  "algebra-exp-log",
  "exponential",
  "logarithmic",
  "inverse-square",
  "rational-continuity",
  "rational",
  "hole-linear",
]);

function validFinitePair(values) {
  return (
    Array.isArray(values) &&
    values.length >= 2 &&
    values.every((value) => Number.isFinite(Number(value)))
  );
}

function validLabeledPoints(value) {
  const points = Array.isArray(value?.labeledPoints)
    ? value.labeledPoints
    : Array.isArray(value?.points)
      ? value.points
      : [];
  return (
    points.length > 0 &&
    points.every(
      (point) =>
        point &&
        Number.isFinite(Number(point.x)) &&
        Number.isFinite(Number(point.y))
    )
  );
}

function hasRenderableGraphDescriptor(value) {
  const kind = String(value?.kind || value?.type || "").trim().toLowerCase();
  if (!ARENA_GRAPH_VISUALIZATION_KINDS.has(kind)) return false;
  if (kind === "polynomial") {
    return Boolean(value?.coefficients && typeof value.coefficients === "object");
  }
  if (["algebra-trig", "trigonometric"].includes(kind)) {
    return Number.isFinite(Number(value?.frequency ?? 1));
  }
  if (["algebra-exp-log", "exponential", "logarithmic"].includes(kind)) {
    return Number(value?.base ?? 2) > 0 && Number(value?.base ?? 2) !== 1;
  }
  if (["inverse-square", "rational-continuity", "rational"].includes(kind)) {
    return Number.isFinite(
      Number(value?.numeratorConstant ?? value?.numerator ?? 1)
    );
  }
  return kind === "hole-linear" && Number.isFinite(Number(value?.focusX));
}

function hasRenderableArenaVisualization(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const kind = String(value.kind || "").trim().toLowerCase();
  const curveDescriptors = Array.isArray(value.curves)
    ? value.curves
    : Array.isArray(value.functions)
      ? value.functions
      : [];
  if (curveDescriptors.length) {
    return curveDescriptors.every(hasRenderableGraphDescriptor);
  }
  if (hasRenderableGraphDescriptor(value)) return true;
  if (["algebra-sequence", "table-points"].includes(kind)) {
    const values = Array.isArray(value.values) ? value.values : [];
    return (
      values.length > 0 &&
      values.every((entry) => Number.isFinite(Number(entry)))
    ) || (
      validFinitePair(value.xValues) &&
      validFinitePair(value.yValues) &&
      value.xValues.length === value.yValues.length
    );
  }
  if (kind.startsWith("probability-") && kind !== "probability-concept") {
    return Object.entries(value).some(
      ([key, entry]) =>
        !["kind", "note", "title"].includes(key) &&
        (typeof entry === "number" ||
          (typeof entry === "string" && entry.trim()) ||
          (Array.isArray(entry) && entry.length > 0))
    );
  }
  if (kind !== "geometry") return false;
  if (validLabeledPoints(value)) return true;
  const point = (entry) => entry && Number.isFinite(Number(entry.x)) && Number.isFinite(Number(entry.y));
  const shapes = [
    ...(value.rectangles || []).map((entry) => point(entry) && Number(entry.width) > 0 && Number(entry.height) > 0),
    ...(value.polygons || []).map((entry) => entry.points?.length >= 3 && entry.points.every(point)),
    ...(value.polylines || []).map((entry) => entry.points?.length >= 2 && entry.points.every(point)),
  ];
  return shapes.length > 0 && shapes.every(Boolean) &&
    (!value.texts || value.texts.every((entry) => point(entry) && typeof entry.text === "string"));
}

function plainPrompt(value) {
  return String(value || "")
    .replace(/\\\[[\s\S]*?\\\]/g, " 수식 ")
    .replace(/\$[^$]*\$/g, " 수식 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isVisualizationPresentedInProblem(problem) {
  const visualization = problem?.visualization;
  if (!hasRenderableArenaVisualization(visualization)) return false;
  const explicitDescriptor =
    visualization?.presentedInProblem === true ||
    String(visualization?.sourceRole || "").toUpperCase() === "PROBLEM_STEM" ||
    problem?.visualizationPresentedInProblem === true;
  if (!explicitDescriptor) return false;
  return /(?:다음|아래|주어진).{0,28}(?:그래프|그림|표)|(?:그래프|그림|표).{0,28}(?:같다|주어|나타내|제시)/.test(
    plainPrompt(problem?.prompt)
  );
}

function problemWithVerifiedVisualization(problem) {
  if (!problem || typeof problem !== "object") return problem;
  if (!isVisualizationPresentedInProblem(problem)) {
    if (problem.visualizationRequired === true ||
        /(?:다음|아래|주어진).{0,28}(?:그림|그래프|표)/.test(plainPrompt(problem.prompt))) {
      throw Object.assign(new Error("필수 시각자료를 보존할 수 없는 문항입니다."), {
        code: "ARENA_REQUIRED_VISUALIZATION_INVALID", status: 422,
      });
    }
    return { ...problem, visualization: null };
  }
  return {
    ...problem,
    visualization: {
      ...problem.visualization,
      presentedInProblem: true,
      sourceRole: "PROBLEM_STEM",
    },
  };
}

module.exports = {
  hasRenderableArenaVisualization,
  isVisualizationPresentedInProblem,
  problemWithVerifiedVisualization,
};
