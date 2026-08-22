(function (root) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  function readJson(document, id) {
    try {
      return JSON.parse(document.getElementById(id)?.textContent || "null");
    } catch (_error) {
      return null;
    }
  }

  function svg(document, name, attributes = {}) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, String(value));
    }
    return node;
  }

  function appendText(document, target, text, x, y, className) {
    const node = svg(document, "text", { x, y, class: className });
    node.textContent = text;
    target.append(node);
  }

  function compact(text, maximum = 34) {
    const value = String(text || "").trim();
    return value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value;
  }

  function appendBeatCopy(document, target, beat) {
    const expression = String(beat?.expression || "").trim();
    if (expression && expression.length <= 16) {
      appendText(document, target, expression, 752, 48, "motion-formula");
    }
    if (beat?.result) {
      appendText(document, target, compact(beat.result, 38), 752, 330, "motion-result");
    }
  }

  function drawEquation(document, target, scene, beat) {
    const tokens = [
      compact(beat?.expression || "조건", 18),
      compact(beat?.target || scene.focusToken, 18),
      compact(beat?.result || "결론", 18),
    ];
    tokens.forEach((token, index) => {
      const x = 84 + index * 230;
      target.append(svg(document, "rect", {
        x, y: index === 1 ? 135 : 118, width: 170, height: 78, rx: 12,
        class: index === 1 ? "motion-shape motion-shape-focus" : "motion-shape",
      }));
      appendText(document, target, token, x + 85, (index === 1 ? 135 : 118) + 46, "motion-label");
      if (index < tokens.length - 1) {
        target.append(svg(document, "path", {
          d: `M ${x + 178} 158 C ${x + 192} 158, ${x + 205} 158, ${x + 220} 158`,
          class: "motion-link",
        }));
      }
    });
  }

  function drawBlocks(document, target, beat) {
    const colors = ["focus", "focus", "quiet", "quiet", "result"];
    colors.forEach((kind, index) => {
      const width = index < 2 ? 105 : index < 4 ? 72 : 190;
      const x = index < 4 ? 76 + index * 125 : 526;
      const y = index < 4 ? 118 + (index % 2) * 86 : 144;
      target.append(svg(document, "rect", {
        x, y, width, height: 68, rx: 10,
        class: `motion-block motion-block-${kind}`,
      }));
    });
    target.append(svg(document, "path", { d: "M 455 178 L 505 178", class: "motion-link" }));
    appendText(document, target, "+", 478, 166, "motion-operator");
    if (beat?.action === "highlight" || beat?.action === "group") {
      target.append(svg(document, "rect", {
        x: 64, y: 104, width: 408, height: 168, rx: 18, class: "motion-group-focus",
      }));
    }
  }

  function drawGraph(document, target, beat) {
    target.append(svg(document, "path", { d: "M 90 285 L 90 55 M 55 250 L 745 250", class: "motion-axis" }));
    target.append(svg(document, "path", {
      d: "M 100 224 C 190 80, 295 82, 360 178 S 520 306, 710 72",
      class: "motion-curve",
    }));
    [220, 360, 540].forEach((x, index) => {
      target.append(svg(document, "circle", {
        cx: x, cy: [108, 178, 232][index], r: index === 1 ? 10 : 7,
        class: index === 1 ? "motion-point motion-point-focus" : "motion-point",
      }));
    });
    if (beat?.action === "point" || beat?.action === "highlight") {
      target.append(svg(document, "circle", {
        cx: 360, cy: 178, r: 24, class: "motion-target-ring",
      }));
    }
  }

  function drawGeometry(document, target, beat) {
    target.append(svg(document, "circle", { cx: 300, cy: 172, r: 102, class: "motion-geometry" }));
    target.append(svg(document, "path", { d: "M 118 276 L 690 72", class: "motion-geometry-line" }));
    [[300, 172], [236, 96], [466, 152]].forEach(([cx, cy], index) => {
      target.append(svg(document, "circle", {
        cx, cy, r: index === 0 ? 10 : 7,
        class: index === 0 ? "motion-point motion-point-focus" : "motion-point",
      }));
    });
    target.append(svg(document, "path", { d: "M 300 172 L 466 152", class: "motion-radius" }));
    if (beat?.action === "verify") {
      target.append(svg(document, "path", { d: "M 272 172 A 28 28 0 0 1 300 144", class: "motion-target-ring" }));
    }
  }

  function drawComplexPlane(document, target, beat) {
    target.append(svg(document, "path", {
      d: "M 82 186 L 718 186 M 400 310 L 400 62",
      class: "motion-axis",
    }));
    appendText(document, target, "실수", 700, 174, "motion-axis-label");
    appendText(document, target, "허수 i", 430, 78, "motion-axis-label");
    [[520, 186, "1"], [400, 116, "i"], [590, 92, "3+2i"]].forEach(([cx, cy, label], index) => {
      target.append(svg(document, "circle", {
        cx, cy, r: index === 2 ? 11 : 7,
        class: index === 2 ? "motion-point motion-point-focus" : "motion-point",
      }));
      appendText(document, target, label, cx + 14, cy - 12, "motion-axis-label");
    });
    target.append(svg(document, "path", {
      d: "M 400 186 L 590 186 L 590 92",
      class: "motion-link motion-link-guide",
    }));
    if (["point", "highlight", "transform"].includes(beat?.action)) {
      target.append(svg(document, "circle", {
        cx: 590, cy: 92, r: 27, class: "motion-target-ring",
      }));
    }
  }

  function drawIntersectionPlot(document, target, beat) {
    target.append(svg(document, "path", {
      d: "M 74 278 L 730 278 M 248 320 L 248 58",
      class: "motion-axis",
    }));
    target.append(svg(document, "ellipse", {
      cx: 365, cy: 190, rx: 146, ry: 103, class: "motion-geometry",
    }));
    target.append(svg(document, "path", {
      d: "M 130 292 L 664 74", class: "motion-geometry-line",
    }));
    [[282, 230], [526, 130]].forEach(([cx, cy]) => {
      target.append(svg(document, "circle", {
        cx, cy, r: 10, class: "motion-point motion-point-focus",
      }));
    });
    if (["group", "verify"].includes(beat?.action)) {
      target.append(svg(document, "path", {
        d: "M 270 244 C 350 304, 478 260, 538 142", class: "motion-reference-line",
      }));
    }
  }

  function drawNumberLine(document, target, scene, beat) {
    const outside = /outside|two-rays|sign-recall|system-intersection|simlinear|overlap|endpoints|negative-flip|common-band/u
      .test(scene.id);
    const splitOutside = /outside|two-rays|system-intersection/u.test(scene.id);
    target.append(svg(document, "path", {
      d: "M 76 210 L 724 210", class: "motion-axis",
    }));
    [250, 550].forEach((x, index) => {
      target.append(svg(document, "circle", {
        cx: x, cy: 210, r: 9,
        class: index === 0 || /≤|≥|포함/u.test(`${beat?.expression || ""} ${beat?.result || ""}`)
          ? "motion-point motion-point-focus"
          : "motion-point",
      }));
      appendText(document, target, index === 0 ? "왼쪽 경계" : "오른쪽 경계", x, 246, "motion-axis-label");
    });
    if (splitOutside) {
      target.append(svg(document, "path", { d: "M 84 210 L 238 210", class: "motion-number-band" }));
      target.append(svg(document, "path", { d: "M 562 210 L 716 210", class: "motion-number-band" }));
    } else if (outside) {
      target.append(svg(document, "path", { d: "M 250 210 L 550 210", class: "motion-number-band" }));
    } else {
      target.append(svg(document, "path", { d: "M 250 210 L 550 210", class: "motion-number-band" }));
    }
    appendText(
      document,
      target,
      splitOutside ? "두 경계 바깥" : "두 조건이 겹치는 구간",
      400,
      174,
      "motion-number-label",
    );
    if (["point", "highlight", "group"].includes(beat?.action)) {
      target.append(svg(document, "rect", {
        x: splitOutside ? 62 : 226,
        y: 174,
        width: splitOutside ? 676 : 348,
        height: 72,
        rx: 18,
        class: "motion-group-focus",
      }));
    }
  }

  function drawCountingTree(document, target, scene, beat) {
    if (scene.id === "counting-overlap") {
      target.append(svg(document, "circle", {
        cx: 330, cy: 185, r: 105, class: "motion-geometry",
      }));
      target.append(svg(document, "circle", {
        cx: 470, cy: 185, r: 105, class: "motion-geometry",
      }));
      appendText(document, target, "축구 8", 286, 132, "motion-label");
      appendText(document, target, "농구 6", 514, 132, "motion-label");
      appendText(document, target, "겹침 2", 400, 188, "motion-label");
      if (["point", "verify"].includes(beat?.action)) {
        target.append(svg(document, "ellipse", {
          cx: 400, cy: 185, rx: 42, ry: 98, class: "motion-target-ring",
        }));
      }
      return;
    }

    let rootLabel = "코드";
    let firstLabels = ["A", "B", "C"];
    let leafCounts = [4, 4, 4];
    if (scene.id === "counting-paths") {
      rootLabel = "출발";
      if (beat?.id === "follow-consecutive") {
        firstLabels = ["셔츠 1", "셔츠 2", "셔츠 3"];
        leafCounts = [2, 2, 2];
      } else if (beat?.id === "name-operation") {
        firstLabels = ["또는 +", "그리고 ×"];
        leafCounts = [1, 1];
      } else {
        firstLabels = ["버스 3", "지하철 2"];
        leafCounts = [3, 2];
      }
    } else if (scene.id === "counting-mixed-dessert") {
      rootLabel = "주문";
      firstLabels = ["케이크 2", "아이스 3"];
      leafCounts = [4, 4];
    } else if (scene.id === "counting-law-recall") {
      rootLabel = "판단";
      firstLabels = ["대안 +", "연속 ×", "겹침 −"];
      leafCounts = [1, 1, 1];
    }
    const firstY = firstLabels.length === 2 ? [118, 230] : [72, 156, 240];
    target.append(svg(document, "rect", {
      x: 60, y: 150, width: 104, height: 64, rx: 12, class: "motion-shape motion-shape-focus",
    }));
    appendText(document, target, rootLabel, 112, 190, "motion-label");
    firstLabels.forEach((label, index) => {
      const y = firstY[index];
      target.append(svg(document, "path", {
        d: `M 164 182 C 214 182, 222 ${y + 25}, 270 ${y + 25}`,
        class: "motion-link",
      }));
      target.append(svg(document, "rect", {
        x: 270, y, width: 122, height: 50, rx: 10, class: "motion-shape",
      }));
      appendText(document, target, label, 331, y + 32, "motion-label");
      const leaves = leafCounts[index];
      for (let leaf = 0; leaf < leaves; leaf += 1) {
        const leafX = 470 + leaf * 70;
        target.append(svg(document, "path", {
          d: `M 392 ${y + 25} L ${leafX} ${y + 25}`,
          class: "motion-link motion-link-guide",
        }));
        target.append(svg(document, "circle", {
          cx: leafX + 17, cy: y + 25, r: 12,
          class: leaf === leaves - 1 ? "motion-point motion-point-focus" : "motion-point",
        }));
        appendText(document, target, String(leaf + 1), leafX + 17, y + 30, "motion-axis-label");
      }
    });
  }

  function drawPermutationSlots(document, target, scene, beat) {
    const together = scene.id === "permutation-together-block";
    let labels = ["금", "은", "동"];
    let details = ["6가지", "5가지", "4가지"];
    if (scene.id === "permutation-seats") {
      labels = ["왼쪽", "오른쪽"];
      details = ["2가지", "1가지"];
    } else if (scene.id === "permutation-two-roles") {
      labels = ["회장", "부회장"];
      details = ["5가지", "4가지"];
    } else if (scene.id === "permutation-combination-trap") {
      labels = ["두 사람", "회장", "부회장"];
      details = ["10묶음", "2배치", "20결과"];
    } else if (together) {
      labels = ["AB묶음", "C", "D"];
      details = ["AB / BA", "책", "책"];
    }
    const positions = labels.length === 2 ? [175, 475] : [75, 325, 575];
    labels.forEach((label, index) => {
      const x = positions[index];
      target.append(svg(document, "rect", {
        x, y: 135, width: 150, height: 96, rx: 14,
        class: index === 0 ? "motion-shape motion-shape-focus" : "motion-shape",
      }));
      appendText(document, target, label, x + 75, 173, "motion-label");
      appendText(
        document,
        target,
        details[index],
        x + 75,
        208,
        "motion-axis-label",
      );
      if (index < labels.length - 1) {
        target.append(svg(document, "path", {
          d: `M ${x + 156} 183 L ${x + 208} 183`, class: "motion-link",
        }));
      }
    });
    if (["group", "transform", "verify"].includes(beat?.action)) {
      target.append(svg(document, "rect", {
        x: together ? 59 : labels.length === 2 ? 157 : 59,
        y: 116,
        width: together ? 182 : labels.length === 2 ? 486 : 682,
        height: 134,
        rx: 18,
        class: "motion-group-focus",
      }));
    }
  }

  function drawCombinationGroups(document, target, scene, beat) {
    const required = scene.id === "combination-required-person";
    const symmetry = scene.id === "combination-symmetry-recall";
    let cards = ["AB", "BA", "{A,B}"];
    if (scene.id === "combination-five-choose-two") {
      cards = ["순열 20", "2!씩 접기", "조합 10"];
    } else if (scene.id === "combination-divisor-trap") {
      cards = ["6개 순서", "3!씩 접기", "한 팀"];
    } else if (required) {
      cards = ["민아", "빈칸", "빈칸"];
    } else if (symmetry) {
      cards = ["고른 r명", "남은 n−r명"];
    }
    cards.forEach((label, index) => {
      const width = symmetry ? 220 : 150;
      const gap = symmetry ? 70 : 80;
      const start = symmetry ? 145 : 95;
      const x = start + index * (width + gap);
      target.append(svg(document, "rect", {
        x, y: 136, width, height: 100, rx: 16,
        class: index === cards.length - 1 || required && index === 0
          ? "motion-shape motion-shape-focus"
          : "motion-shape",
      }));
      appendText(document, target, label, x + width / 2, 194, "motion-label");
      if (index < cards.length - 1) {
        appendText(document, target, symmetry ? "↔" : index === 1 ? "=" : "+", x + width + gap / 2, 193, "motion-operator");
      }
    });
    if (["group", "transform", "verify"].includes(beat?.action)) {
      target.append(svg(document, "path", {
        d: required
          ? "M 170 254 C 260 306, 506 306, 610 254"
          : "M 116 264 C 270 322, 522 322, 682 264",
        class: "motion-reference-line",
      }));
    }
  }

  const COORDINATE_GEOMETRY_SCENES = new Set([
    "triangle-and-slider", "closer-side-question", "cross-weight-misread", "coordinate-route", "segment-recall",
    "road-directions", "two-lines-question", "axis-exception", "parameter-slope", "slope-recall",
    "shortest-rope", "distance-meter-question", "absolute-and-normalization", "parallel-gap", "perpendicular-recall",
    "compass-trace", "radius-from-point", "sign-and-square-trap", "complete-the-circle", "circle-recall",
    "fence-and-path", "moving-line-question", "compare-like-quantities", "position-decision", "radius-gate-recall",
    "transparent-sticker", "parabola-slide-question", "same-sign-error", "translate-equation", "translation-recall",
    "folding-paper", "coordinate-mirror-question", "axis-name-confusion", "reflect-circle", "mirror-recall",
  ]);

  const GEOMETRY_PARABOLA_SCENES = new Set([
    "equal-distance-trail", "square-emerges", "graph-shape-trap", "focus-two-example", "parabola-memory-hook",
  ]);
  const GEOMETRY_ELLIPSE_SCENES = new Set([
    "taut-string", "axes-and-focus", "ellipse-swap-trap", "ellipse-five-three", "ellipse-memory-route",
  ]);
  const GEOMETRY_HYPERBOLA_SCENES = new Set([
    "two-branches-one-rule", "outside-focus", "difference-and-asymptote-trap", "three-four-five-hyperbola", "hyperbola-memory-frame",
  ]);
  const GEOMETRY_TANGENT_SCENES = new Set([
    "sliding-line-boundary", "point-and-slope-question", "tangent-shortcuts-trap", "parabola-tangent-example", "tangent-memory-rhythm",
  ]);
  const GEOMETRY_SPACE_RELATION_SCENES = new Set([
    "room-lines-and-walls", "classify-by-sharing", "perspective-is-not-proof", "cube-relation-check", "space-relation-memory",
  ]);
  const GEOMETRY_THREE_PERPENDICULAR_SCENES = new Set([
    "lamp-shadow-right-angle", "three-perpendicular-links", "one-perpendicular-is-not-enough", "roof-edge-example", "height-shadow-recall",
  ]);
  const GEOMETRY_PROJECTION_SCENES = new Set([
    "vertical-light-shadow", "cosine-shrink", "wrong-angle-shadow", "ten-unit-rod", "projection-memory-test",
  ]);
  const GEOMETRY_SPACE_COORDINATE_SCENES = new Set([
    "three-direction-move", "opposite-weights", "coordinate-distance-traps", "six-root-three-example", "coordinate-memory-rhythm",
  ]);
  const GEOMETRY_SPHERE_SCENES = new Set([
    "fixed-radius-shell", "complete-three-squares", "sphere-versus-ball-trap", "sphere-general-example", "sphere-memory-shell",
  ]);
  const GEOMETRY_VECTOR_OPERATION_SCENES = new Set([
    "slide-the-arrow", "head-to-tail", "magnitude-addition-trap", "vector-operation-example", "vector-memory-arrow",
  ]);
  const GEOMETRY_POSITION_VECTOR_SCENES = new Set([
    "origin-as-anchor", "destination-minus-start", "point-vector-confusion", "position-vector-example", "position-vector-memory",
  ]);
  const GEOMETRY_DOT_PRODUCT_SCENES = new Set([
    "directional-shadow", "geometry-meets-components", "dot-product-is-scalar", "zero-dot-example", "dot-product-memory",
  ]);
  const GEOMETRY_LINE_SCENES = new Set([
    "bead-on-a-wire", "one-parameter-three-coordinates", "direction-normal-confusion", "line-through-two-points", "line-equation-memory",
  ]);
  const GEOMETRY_PLANE_SPHERE_SCENES = new Set([
    "normal-pins-the-plane", "linear-plane-quadratic-sphere", "normal-versus-in-plane", "plane-and-sphere-example", "plane-sphere-memory",
  ]);
  const GEOMETRY_COURSE_SCENES = new Set([
    ...GEOMETRY_PARABOLA_SCENES,
    ...GEOMETRY_ELLIPSE_SCENES,
    ...GEOMETRY_HYPERBOLA_SCENES,
    ...GEOMETRY_TANGENT_SCENES,
    ...GEOMETRY_SPACE_RELATION_SCENES,
    ...GEOMETRY_THREE_PERPENDICULAR_SCENES,
    ...GEOMETRY_PROJECTION_SCENES,
    ...GEOMETRY_SPACE_COORDINATE_SCENES,
    ...GEOMETRY_SPHERE_SCENES,
    ...GEOMETRY_VECTOR_OPERATION_SCENES,
    ...GEOMETRY_POSITION_VECTOR_SCENES,
    ...GEOMETRY_DOT_PRODUCT_SCENES,
    ...GEOMETRY_LINE_SCENES,
    ...GEOMETRY_PLANE_SPHERE_SCENES,
  ]);

  const PRACTICAL_VARIATION_SCENES = new Set([
    "bus-arrival-variation", "statistical-question-test", "single-case-certainty-trap", "route-choice-evidence", "variation-evidence-recall",
  ]);
  const PRACTICAL_INQUIRY_SCENES = new Set([
    "cafeteria-cycle-map", "operational-question-design", "method-first-trap", "waste-study-walkthrough", "cycle-diagnostic-recall",
    "decision-needs-evidence-chain", "decision-criterion-question", "popular-option-trap", "library-pilot-inquiry", "inquiry-decision-recall",
    "rewind-bike-route-study", "four-audit-gates", "desired-result-immunity-trap", "transparent-reanalysis-plan", "critical-reflection-recall",
  ]);
  const PRACTICAL_SAMPLING_SCENES = new Set([
    "city-soup-sample", "sampling-frame-choice", "bigger-biased-sample", "stratified-transit-plan", "population-sample-recall",
  ]);
  const PRACTICAL_SCALE_SCENES = new Set([
    "festival-data-labels", "four-scale-card-sort", "rating-average-trap", "festival-variable-dictionary", "scale-permission-recall",
  ]);
  const PRACTICAL_COLLECTION_SCENES = new Set([
    "collection-lens-choice", "cause-or-description-question", "leading-memory-trap", "sleep-study-protocol", "collection-method-recall",
  ]);
  const PRACTICAL_GRAPH_SCENES = new Set([
    "graph-as-camera-lens", "graph-selection-diagnosis", "cropped-axis-distortion", "commute-dashboard-solution", "honest-graph-recall",
  ]);
  const PRACTICAL_CENTER_SPREAD_SCENES = new Set([
    "same-mean-different-wait", "center-spread-pairing", "average-only-trap", "delivery-summary-comparison", "center-island-spread-sea",
  ]);
  const PRACTICAL_NORMAL_T_SCENES = new Set([
    "filling-bell-shape", "why-t-has-heavy-tails", "automatic-normality-trap", "distribution-tool-exploration", "normal-t-recall",
  ]);
  const PRACTICAL_INTERVAL_SCENES = new Set([
    "interval-net-for-mean", "confidence-width-tradeoff", "fixed-interval-probability-trap", "sleep-mean-interval-calculation", "mean-estimation-recall",
    "proportion-as-moving-share", "success-failure-condition", "margin-covers-bias-trap", "helmet-interval-calculation", "proportion-estimation-recall",
  ]);
  const PRACTICAL_HYPOTHESIS_SCENES = new Set([
    "null-world-simulation", "hypotheses-and-alpha", "p-value-meaning-trap", "checkout-t-test-solution", "hypothesis-test-recall",
  ]);
  const PRACTICAL_STATISTICS_SCENES = new Set([
    ...PRACTICAL_VARIATION_SCENES,
    ...PRACTICAL_INQUIRY_SCENES,
    ...PRACTICAL_SAMPLING_SCENES,
    ...PRACTICAL_SCALE_SCENES,
    ...PRACTICAL_COLLECTION_SCENES,
    ...PRACTICAL_GRAPH_SCENES,
    ...PRACTICAL_CENTER_SPREAD_SCENES,
    ...PRACTICAL_NORMAL_T_SCENES,
    ...PRACTICAL_INTERVAL_SCENES,
    ...PRACTICAL_HYPOTHESIS_SCENES,
  ]);

  const ECON_INDEX_SCENES = new Set([
    "dashboard-with-a-base", "index-or-growth-question", "rising-but-slowing", "basket-index-worked", "four-label-recall",
  ]);
  const ECON_EXCHANGE_SCENES = new Set([
    "currency-price-tag", "trip-budget-question", "reverse-quote-trap", "import-price-worked", "unit-arrow-recall",
  ]);
  const ECON_TAX_SCENES = new Set([
    "tax-base-lens", "included-vat-question", "marginal-rate-misread", "progressive-tax-worked", "three-box-tax-recall",
  ]);
  const ECON_INTEREST_SCENES = new Set([
    "interest-family-tree", "future-to-present-question", "rate-period-mismatch", "compare-loans-worked", "timeline-interest-recall",
  ]);
  const ECON_ANNUITY_SCENES = new Set([
    "cashflow-beads", "first-payment-question", "total-payment-trap", "three-payment-worked", "bring-each-home-recall",
  ]);
  const ECON_FUNCTION_SCENES = new Set([
    "economic-machine", "cost-rule-question", "association-is-not-rule", "food-truck-model", "input-output-recall",
  ]);
  const ECON_MARKET_LINE_SCENES = new Set([
    "two-market-lines", "read-demand-table", "axis-and-shift-confusion", "plot-two-curves", "price-slider-recall",
    "market-handshake", "solve-crossing-question", "fairness-and-coordinate-trap", "farmers-market-worked", "market-seesaw-recall",
    "move-the-whole-curve", "tax-wedge-question", "all-demand-rises-trap", "income-shift-worked", "cause-curve-equilibrium-recall",
  ]);
  const ECON_UTILITY_SCENES = new Set([
    "satisfaction-altimeter", "utility-increment-question", "utility-score-trap", "quadratic-utility-worked", "height-slope-recall",
  ]);
  const ECON_LINEAR_PROGRAM_SCENES = new Set([
    "overlapping-fences", "which-side-question", "boundary-is-not-optimum", "bakery-corners-worked", "fence-corners-recall",
  ]);
  const ECON_MATRIX_SCENES = new Set([
    "labeled-data-tray", "add-sales-question", "multiply-like-addition-trap", "store-revenue-worked", "labels-survive-recall",
    "undo-mixing-machine", "determinant-gate-question", "entry-reciprocal-trap", "two-bundles-worked", "undo-check-recall",
    "compress-and-recover", "ticket-system-question", "algebra-only-trap", "production-mix-worked", "encode-solve-interpret-recall",
  ]);
  const ECON_MARGINAL_SCENES = new Set([
    "marginal-speedometer", "marginal-cost-question", "average-versus-marginal", "revenue-derivative-worked", "total-to-margin-recall",
    "derivative-traffic-map", "u-cost-question", "zero-derivative-trap", "profit-shape-worked", "sign-road-recall",
  ]);
  const ECON_ELASTICITY_SCENES = new Set([
    "percentage-shock-absorber", "elasticity-at-price-question", "slope-equals-elasticity-trap", "revenue-response-worked", "normalized-ruler-recall",
  ]);
  const ECON_OPTIMUM_SCENES = new Set([
    "profit-hill", "where-stop-question", "stationary-only-trap", "pricing-production-worked", "objective-domain-recall",
  ]);
  const ECONOMICS_MATH_SCENES = new Set([
    ...ECON_INDEX_SCENES,
    ...ECON_EXCHANGE_SCENES,
    ...ECON_TAX_SCENES,
    ...ECON_INTEREST_SCENES,
    ...ECON_ANNUITY_SCENES,
    ...ECON_FUNCTION_SCENES,
    ...ECON_MARKET_LINE_SCENES,
    ...ECON_UTILITY_SCENES,
    ...ECON_LINEAR_PROGRAM_SCENES,
    ...ECON_MATRIX_SCENES,
    ...ECON_MARGINAL_SCENES,
    ...ECON_ELASTICITY_SCENES,
    ...ECON_OPTIMUM_SCENES,
  ]);

  const AI_LEARNING_SCENES = new Set([
    "feedback-shapes-learning", "choose-learning-signal", "understanding-mirage", "perceptron-update-rhythm", "learning-contract-recall",
    "questions-become-numbers", "perceptron-xor-turn", "single-hero-myth", "spam-history-lens", "history-four-lenses",
    "city-bus-stream", "useful-data-question", "more-data-trap", "cafeteria-data-audit", "big-data-four-questions",
  ]);
  const AI_TEXT_SCENES = new Set([
    "sentence-to-coordinates", "set-or-count", "order-disappears", "three-message-vectors", "vocabulary-coordinate-recall",
    "common-word-fades", "two-scales-one-weight", "rare-does-not-mean-useful", "four-document-weight", "inside-outside-recall",
    "direction-over-length", "similarity-or-sentiment", "shared-word-trap", "review-comparison-rhythm", "representation-context-recall",
  ]);
  const AI_IMAGE_SCENES = new Set([
    "pixel-tile-grid", "row-column-channel", "cell-is-not-object", "six-pixel-threshold", "grid-value-channel-recall",
    "editor-as-number-rule", "local-or-neighborhood", "overflow-and-operation-trap", "brightness-matrix-worked", "rule-range-result-recall",
    "nearest-labeled-picture", "distance-choice", "pixel-closeness-trap", "binary-image-distance", "represent-measure-check-recall",
  ]);
  const AI_PREDICTION_SCENES = new Set([
    "forecast-from-counts", "reference-group-choice", "probability-is-not-promise", "absence-risk-example", "count-divide-interpret-recall",
    "crowd-direction-line", "read-slope-intercept-domain", "perfect-line-myth", "temperature-demand-line", "direction-residual-range-recall",
    "scoreboard-for-errors", "why-square-errors", "training-loss-mirage", "constant-prediction-loss", "predict-measure-compare-recall",
    "dimmer-knob-descent", "slope-and-learning-rate", "biggest-step-trap", "quadratic-descent-steps", "slope-opposite-repeat-recall",
  ]);
  const AI_INQUIRY_SCENES = new Set([
    "goal-changes-choice", "rational-for-whom", "highest-score-is-not-fair", "cooling-policy-scores", "goal-constraint-impact-recall",
    "question-before-tool", "measurable-fair-question", "accuracy-only-project-trap", "school-energy-project", "inquiry-card-recall",
  ]);
  const AI_MATH_SCENES = new Set([
    ...AI_LEARNING_SCENES,
    ...AI_TEXT_SCENES,
    ...AI_IMAGE_SCENES,
    ...AI_PREDICTION_SCENES,
    ...AI_INQUIRY_SCENES,
  ]);

  const CULTURE_ART_SCENES = new Set([
    "monochord-ratio", "concert-a-question", "equal-hertz-trap", "build-a-chord", "music-ratio-recall",
    "window-perspective", "three-times-distance", "golden-ratio-myth", "tile-the-plane", "art-geometry-recall",
    "count-the-form", "five-beat-line", "meaning-by-counting", "refrain-map", "literature-pattern-recall",
    "film-as-numbers", "frame-and-crop", "resolution-speed-confusion", "edit-rhythm-study", "film-math-recall",
  ]);
  const CULTURE_LEISURE_SCENES = new Set([
    "court-measurements", "parabola-vertex", "forty-five-degree-myth", "compare-shot-records", "sports-model-recall",
    "rules-as-tree", "coin-expectation", "gambler-fallacy", "leave-multiples-of-four", "game-math-recall",
    "binary-switches", "grayscale-storage", "binary-does-not-compress", "parity-check", "digital-math-recall",
    "ballots-to-method", "three-way-profile", "method-neutrality-myth", "choose-a-voting-rule", "voting-recall",
  ]);
  const CULTURE_SOCIETY_SCENES = new Set([
    "many-mathematical-languages", "base-twenty-conversion", "primitive-number-system", "symmetry-field-study", "culture-math-recall",
    "six-dot-cell", "encode-dot-pattern", "sixty-four-letters", "accessible-label-design", "braille-recall",
    "define-media-sample", "headline-percentage", "frequency-means-opinion", "compare-comment-distributions", "media-data-recall",
    "values-into-criteria", "weighted-shoe-score", "objective-weight-myth", "weight-sensitivity", "value-choice-recall",
  ]);
  const CULTURE_ENVIRONMENT_SCENES = new Set([
    "common-food-unit", "waste-per-student", "total-versus-rate", "cafeteria-improvement", "food-analysis-recall",
    "air-time-series", "three-day-moving-average", "one-day-cause", "clean-air-action-study", "air-data-recall",
    "change-as-model", "five-year-growth", "forever-extrapolation", "intervention-scenario", "desertification-recall",
    "richness-and-evenness", "simpson-comparison", "index-is-whole-ecosystem", "habitat-monitoring-plan", "biodiversity-recall",
  ]);
  const MATH_CULTURE_SCENES = new Set([
    ...CULTURE_ART_SCENES,
    ...CULTURE_LEISURE_SCENES,
    ...CULTURE_SOCIETY_SCENES,
    ...CULTURE_ENVIRONMENT_SCENES,
  ]);

  const RESEARCH_FOUNDATION_SCENES = new Set([
    "fountain-question-lens", "claim-to-inquiry-test", "answer-hunt-misconception", "fountain-mini-inquiry", "inquiry-bridge-recall",
    "trust-chain-intuition", "ethical-decision-question", "clean-data-misconception", "ethical-crosswalk-protocol", "ethics-trace-recall",
  ]);
  const RESEARCH_METHOD_SCENES = new Set([
    "literature-map-intuition", "source-trace-question", "search-summary-misconception", "paper-ratio-literature-synthesis", "literature-chain-recall",
    "case-window-intuition", "case-selection-question", "anecdote-generalization-misconception", "cross-case-signal-matrix", "case-context-recall",
    "random-pattern-intuition", "experiment-variable-question", "desired-value-misconception", "buffon-trial-solution", "experiment-loop-recall",
    "artifact-cycle-intuition", "requirements-question", "first-prototype-misconception", "puzzle-generator-iteration", "development-evidence-recall",
  ]);
  const RESEARCH_EXECUTION_SCENES = new Set([
    "topic-funnel-intuition", "topic-matrix-question", "grand-topic-misconception", "daylight-project-plan", "plan-contract-recall",
    "execution-log-intuition", "checkpoint-question", "protocol-obedience-misconception", "battery-study-execution", "execution-trail-recall",
    "evidence-story-intuition", "audience-claim-question", "polished-slide-misconception", "shade-route-presentation", "presentation-trace-recall",
    "reflection-mirror-intuition", "rubric-evidence-question", "successful-result-misconception", "bridge-project-reflection", "reflection-cycle-recall",
  ]);
  const MATH_RESEARCH_SCENES = new Set([
    ...RESEARCH_FOUNDATION_SCENES,
    ...RESEARCH_METHOD_SCENES,
    ...RESEARCH_EXECUTION_SCENES,
  ]);

  const VOCATIONAL_NUMBER_SCENES = new Set([
    "work-order-number-tags", "operation-verbs-question", "unit-and-order-trap", "purchase-balance-solution", "role-unit-recall",
    "number-resolution-dashboard", "rounding-purpose-question", "automatic-rounding-trap", "budget-rounding-solution", "direction-label-recall",
    "unit-label-change", "conversion-bridge-question", "decimal-clock-trap", "batch-mass-solution", "unchanged-quantity-recall",
  ]);
  const VOCATIONAL_RELATION_SCENES = new Set([
    "recipe-shape-intuition", "corresponding-order-question", "ratio-total-trap", "catering-scale-solution", "same-scale-recall",
    "hundred-slot-scale", "baseline-question", "percent-point-trap", "discount-tax-solution", "hundred-percent-recall",
    "input-output-counter", "difference-ratio-question", "piecewise-rate-trap", "delivery-table-solution", "table-rule-recall",
    "production-monitor-intuition", "height-slope-question", "visual-steepness-trap", "cold-storage-solution", "graph-verbs-recall",
    "constraint-fence-intuition", "unknown-and-bound-question", "integer-and-sign-trap", "purchase-limit-solution", "target-zone-recall",
  ]);
  const VOCATIONAL_GEOMETRY_SCENES = new Set([
    "box-two-languages", "hinge-edge-question", "opposite-face-trap", "carton-net-solution", "folding-preview-recall",
    "three-camera-intuition", "height-grid-question", "silhouette-uniqueness-trap", "pallet-stack-solution", "projection-crosscheck-recall",
    "template-transform-intuition", "corresponding-side-question", "area-scale-trap", "floorplan-scale-solution", "move-or-scale-recall",
    "boundary-surface-intuition", "decompose-shape-question", "opening-and-unit-trap", "flooring-order-solution", "line-or-surface-recall",
    "skin-and-space-intuition", "base-layer-question", "capacity-dimension-trap", "shipping-carton-solution", "skin-space-recall",
  ]);
  const VOCATIONAL_DATA_SCENES = new Set([
    "choice-tree-intuition", "and-or-question", "restriction-double-count-trap", "uniform-order-solution", "path-count-recall",
    "frequency-gauge-intuition", "relevant-denominator-question", "certainty-small-sample-trap", "line-risk-solution", "chance-with-context-recall",
    "data-workbench-intuition", "chart-purpose-question", "dirty-category-trap", "weekly-sales-solution", "purpose-chart-recall",
    "chart-reading-order-intuition", "signal-question", "truncated-axis-causation-trap", "service-dashboard-solution", "evidence-reading-recall",
    "decision-compass-intuition", "criterion-measure-question", "single-metric-bias-trap", "supplier-choice-solution", "evidence-decision-recall",
  ]);
  const VOCATIONAL_MATH_SCENES = new Set([
    ...VOCATIONAL_NUMBER_SCENES,
    ...VOCATIONAL_RELATION_SCENES,
    ...VOCATIONAL_GEOMETRY_SCENES,
    ...VOCATIONAL_DATA_SCENES,
  ]);

  const SETS_PROPOSITIONS_SCENES = new Set([
    "objective-guest-list", "membership-question", "braces-do-not-decide", "representation-check", "set-recall",
    "nested-boxes", "divisor-box-question", "element-versus-subset", "two-way-equality", "inclusion-recall",
    "overlapping-spotlights", "numbers-under-ten", "demorgan-switch", "shade-from-outside", "logic-lights-recall",
    "truth-switchboard", "all-or-some-question", "quantifier-negation", "truth-set-solution", "verdict-recall",
    "one-way-arrow", "multiple-of-four", "converse-is-not-equivalent", "label-and-turn", "arrow-recall",
    "gate-and-requirement", "square-rectangle-question", "language-reversal", "interval-condition", "tail-head-recall",
    "two-detours", "even-square-question", "fake-contradiction", "irrational-root-two", "proof-route-recall",
    "square-floor", "two-numbers-question", "unsafe-division", "difference-to-square", "inequality-recall",
  ]);

  const FUNCTIONS_GRAPHS_SCENES = new Set([
    "vending-buttons", "mapping-question", "horizontal-test-error", "graph-from-rule", "function-recall",
    "assembly-line", "order-question", "missing-parentheses", "numeric-pipeline", "composition-recall",
    "undo-button", "linear-undo-question", "negative-one-is-not-reciprocal", "solve-swap-check", "inverse-recall",
    "forbidden-wall-horizon", "divide-to-see-question", "asymptote-is-not-graph", "rational-sketch", "rational-recall",
    "trailhead-boundary", "direction-question", "start-sign-error", "perfect-square-points", "radical-recall",
  ]);

  const ALGEBRA_POWER_EXPONENT_SCENES = new Set([
    "power-machine-and-rewind", "root-count-by-parity", "principal-root-trap", "root-calculation-route", "rewind-question-recall",
    "exponent-number-line-zoom", "fractional-exponent-meaning", "negative-base-extension-trap", "fractional-exponent-conversion", "dense-exponent-line-recall",
    "factor-ledger", "operation-diagnosis", "sum-power-trap", "exponent-law-layered-solution", "ledger-verbs-recall",
  ]);

  const ALGEBRA_LOG_FUNCTION_SCENES = new Set([
    "exponent-question-language", "log-domain-gates", "log-sum-trap", "log-expression-solution", "log-three-roles-recall",
    "powers-of-ten-elevator", "digit-count-question", "scale-difference-trap", "common-log-application-route", "magnitude-floor-recall",
    "forward-and-reverse-machines", "fixed-base-variable-place", "domain-range-swap-trap", "inverse-composition-solution", "two-machines-recall",
    "graph-mirror-and-anchors", "base-direction-switch", "asymptote-not-intercept", "graph-reconstruction-route", "graph-fingerprint-recall",
    "multiplicative-clock", "inverse-time-question", "model-and-domain-trap", "growth-model-solution", "exponential-model-recall",
  ]);

  const ALGEBRA_TRIGONOMETRY_SCENES = new Set([
    "arc-as-angle-ruler", "directed-turn-counter", "degree-radian-mixup", "sector-measure-solution", "radius-ruler-recall",
    "rotating-beacon-shadows", "wave-landmarks-question", "tangent-gap-trap", "transformed-wave-solution", "circle-wave-recall",
    "triangulation-measurement", "law-selection-question", "opposite-pair-trap", "triangulation-solution-route", "triangle-tool-recall",
  ]);

  const ALGEBRA_SEQUENCE_SCENES = new Set([
    "numbered-lockers", "term-rule-question", "index-value-confusion", "general-term-and-sum-solution", "address-map-recall",
    "constant-step-staircase", "n-minus-one-steps", "difference-ratio-and-offbyone", "paired-arithmetic-sum", "equal-stride-recall",
    "constant-zoom-lens", "n-minus-one-multiplications", "geometric-middle-sign-trap", "shifted-geometric-sum", "constant-scale-recall",
    "summation-conveyor", "inclusive-count-question", "false-product-linearity", "sigma-polynomial-solution", "summation-command-recall",
    "telescoping-zipper", "method-shape-question", "vanishing-endpoint-trap", "telescoping-sum-solution", "cancellation-fingerprint-recall",
    "starter-and-recipe", "required-history-question", "missing-initial-condition", "recursive-table-solution", "recipe-chain-recall",
    "domino-chain-proof", "why-assume-pk", "missing-base-or-link", "odd-sum-induction-solution", "induction-chain-recall",
  ]);

  const PROBABILITY_COUNTING_SCENES = new Set([
    "repeat-or-identical-objects", "counting-question-fork", "blind-division-trap", "aabbc-arrangement", "repeat-arrangement-recall",
    "cookie-stars-bars", "h-combination-question", "positive-share-trap", "flavor-scoop-solution", "stars-bars-recall",
    "term-choice-expansion", "general-term-question", "coefficient-sign-trap", "target-coefficient-solution", "binomial-recall",
  ]);

  const PROBABILITY_SET_SCENES = new Set([
    "possibility-map", "equally-likely-question", "unequal-outcome-trap", "two-coin-solution", "probability-map-recall",
    "club-overlap", "or-means-union", "mutually-exclusive-shortcut-trap", "survey-union-solution", "addition-rule-recall",
    "opposite-door", "name-the-complement", "exactly-one-confusion", "even-at-least-once", "complement-recall",
  ]);

  const PROBABILITY_CONDITIONAL_SCENES = new Set([
    "fence-the-room", "read-the-bar", "cause-and-order", "table-rhythm", "denominator-recall",
    "news-that-changes-odds", "independence-tests", "disjoint-independent-confusion", "replacement-comparison", "independence-recall",
    "shrinking-tree-path", "which-condition-after-a", "marginal-product-trap", "different-colors-tree", "multiply-paths-recall",
  ]);

  const PROBABILITY_DISTRIBUTION_SCENES = new Set([
    "heads-count-label", "distribution-validity-question", "outcome-variable-confusion", "die-payoff-distribution", "random-variable-recall",
    "weighted-balance-point", "distance-from-mean-question", "expected-value-certainty-trap", "same-mean-different-spread", "center-spread-recall",
    "free-throw-count", "binomial-four-conditions", "changing-p-trap", "free-throw-binomial-solution", "binomial-count-recall",
  ]);

  const PROBABILITY_NORMAL_SCENES = new Set([
    "bell-curve-balance", "binomial-to-normal-question", "continuity-gap-trap", "central-binomial-approximation", "normal-binomial-recall",
  ]);

  const PROBABILITY_INFERENCE_SCENES = new Set([
    "soup-taste-sample", "sampling-design-question", "large-convenience-sample", "stratified-school-sample", "sampling-recall",
    "many-sample-means", "sampling-center-spread", "sample-equals-population-trap", "mean-proportion-sampling", "statistic-parameter-recall",
    "flashlight-interval", "confidence-meaning-question", "confidence-certainty-trap", "tool-based-two-intervals", "estimation-recall",
  ]);

  const PROBABILITY_STATISTICS_SCENES = new Set([
    ...PROBABILITY_COUNTING_SCENES,
    ...PROBABILITY_SET_SCENES,
    ...PROBABILITY_CONDITIONAL_SCENES,
    ...PROBABILITY_DISTRIBUTION_SCENES,
    ...PROBABILITY_NORMAL_SCENES,
    ...PROBABILITY_INFERENCE_SCENES,
  ]);

  const CALCULUS_LIMIT_APPROACH_SCENES = new Set([
    "walk-toward-a", "both-sides", "substitution-trap", "hole-example", "three-questions-recall",
    "limit-building-blocks", "limit-law-check", "zero-denominator-warning", "factor-limit-example", "assemble-the-limit",
  ]);

  const CALCULUS_CONTINUITY_SCENES = new Set([
    "continuity-pencil-path", "three-continuity-tests", "defined-is-not-continuous", "piecewise-continuity-fit", "continuity-gate-memory",
    "continuous-mountain-trail", "root-between-endpoints", "sign-change-needs-continuity", "closed-interval-extrema", "continuity-guarantees",
  ]);

  const CALCULUS_DERIVATIVE_DEFINITION_SCENES = new Set([
    "secant-becomes-tangent", "square-at-two", "zero-increment-trap", "coefficient-from-definition", "derivative-coefficient-memory",
    "road-with-a-corner", "continuity-or-differentiability", "reverse-arrow-error", "piecewise-smooth-join", "one-way-smoothness",
  ]);

  const CALCULUS_DERIVATIVE_RULE_SCENES = new Set([
    "power-growth-layers", "cube-definition-proof", "power-rule-half-remembered", "fifth-power-slope", "power-rule-memory",
    "polynomial-change-parts", "termwise-polynomial", "product-of-derivatives-error", "polynomial-product-example", "polynomial-derivative-map",
    "tangent-point-direction", "parabola-tangent-at-one", "tangent-through-origin-error", "cubic-tangent-example", "tangent-two-clues",
    "average-speed-moment", "parabola-mean-value", "mean-value-condition-gap", "derivative-bound-change", "mean-value-bridge",
  ]);

  const CALCULUS_DERIVATIVE_GRAPH_SCENES = new Set([
    "slope-direction-arrows", "cubic-sign-chart", "stationary-not-extreme", "increase-decrease-example", "derivative-sign-memory",
    "graph-clue-map", "cubic-outline-clues", "dot-plot-graph-error", "draw-cubic-outline", "graph-outline-memory",
    "roots-as-crossings", "unique-root-by-growth", "derivative-root-confusion", "three-root-proof", "equation-inequality-graph",
    "motion-three-gauges", "motion-direction-times", "acceleration-direction-error", "motion-distance-example", "motion-derivative-chain",
  ]);

  const CALCULUS_ANTIDERIVATIVE_SCENES = new Set([
    "reverse-the-derivative", "antiderivative-family", "missing-integration-constant", "initial-value-selects-curve", "antiderivative-memory",
    "reverse-power-rule", "integrate-four-terms", "integration-power-slip", "polynomial-antiderivative-condition", "polynomial-integral-memory",
  ]);

  const CALCULUS_ACCUMULATION_SCENES = new Set([
    "signed-accumulation", "trapezoid-definite-integral", "integral-always-area-error", "split-signed-integral", "definite-integral-memory",
    "accumulation-endpoint-difference", "evaluate-linear-integral", "endpoint-order-error", "evaluate-polynomial-integral", "fundamental-link-memory",
  ]);

  const CALCULUS_AREA_MOTION_SCENES = new Set([
    "vertical-area-strips", "line-parabola-unit-area", "area-formula-order-error", "parabola-line-area", "area-top-minus-bottom",
    "velocity-signed-area", "velocity-crosses-zero", "displacement-equals-distance-error", "round-trip-from-velocity", "velocity-integral-memory",
  ]);

  const CALCULUS_ONE_SCENES = new Set([
    ...CALCULUS_LIMIT_APPROACH_SCENES,
    ...CALCULUS_CONTINUITY_SCENES,
    ...CALCULUS_DERIVATIVE_DEFINITION_SCENES,
    ...CALCULUS_DERIVATIVE_RULE_SCENES,
    ...CALCULUS_DERIVATIVE_GRAPH_SCENES,
    ...CALCULUS_ANTIDERIVATIVE_SCENES,
    ...CALCULUS_ACCUMULATION_SCENES,
    ...CALCULUS_AREA_MOTION_SCENES,
  ]);

  function drawProbabilityCounting(document, target, scene, beat) {
    const stars = scene.id.includes("star") || scene.id.includes("scoop") || scene.id.includes("share");
    const binomial = scene.id.includes("term") || scene.id.includes("coefficient") || scene.id.includes("binomial");
    const labels = stars
      ? ["★", "★", "|", "★", "|", "★", "★"]
      : binomial
        ? ["a", "b", "a", "b", "a"]
        : ["A", "A", "B", "B", "C"];
    labels.forEach((label, index) => {
      const x = 96 + index * 88;
      target.append(svg(document, "rect", {
        x, y: 132, width: 68, height: 76, rx: 14,
        class: label === "|" ? "motion-probability-divider" : index < 2 ? "motion-shape motion-shape-focus" : "motion-shape",
      }));
      appendText(document, target, label, x + 34, 179, "motion-label");
    });
    target.append(svg(document, "path", {
      d: "M 104 238 C 252 302, 548 302, 696 238",
      class: "motion-reference-line",
    }));
    appendText(
      document,
      target,
      stars ? "별의 수는 값, 막의 위치는 분배" : binomial ? "색칠한 b의 수가 r" : "같은 글자의 교환은 새 배열이 아님",
      400,
      286,
      "motion-number-label",
    );
    if (["highlight", "verify"].includes(beat?.action)) {
      target.append(svg(document, "rect", {
        x: 76, y: 112, width: 648, height: 118, rx: 20, class: "motion-group-focus",
      }));
    }
    appendBeatCopy(document, target, beat);
  }

  function drawProbabilitySets(document, target, scene, beat) {
    target.append(svg(document, "rect", {
      x: 74, y: 72, width: 652, height: 236, rx: 22, class: "motion-probability-space",
    }));
    const complement = scene.id.includes("complement") || scene.id.includes("opposite") || scene.id.includes("exactly-one");
    target.append(svg(document, "circle", {
      cx: 330, cy: 186, r: 104, class: "motion-probability-event motion-probability-event-a",
    }));
    target.append(svg(document, "circle", {
      cx: 470, cy: 186, r: 104,
      class: complement ? "motion-probability-event motion-probability-muted" : "motion-probability-event motion-probability-event-b",
    }));
    appendText(document, target, "A", 282, 124, "motion-label");
    appendText(document, target, complement ? "Aᶜ" : "B", 520, 124, "motion-label");
    if (!complement) appendText(document, target, "겹침", 400, 188, "motion-axis-label");
    if (["highlight", "transform", "verify"].includes(beat?.action)) {
      target.append(svg(document, "ellipse", {
        cx: complement ? 504 : 400, cy: 186, rx: complement ? 126 : 44, ry: 98, class: "motion-target-ring",
      }));
    }
    appendBeatCopy(document, target, beat);
  }

  function drawProbabilityConditional(document, target, scene, beat) {
    const tree = scene.id.includes("tree") || scene.id.includes("path") || scene.id.includes("colors");
    if (tree) {
      const branches = [[236, 112], [236, 250]];
      target.append(svg(document, "circle", { cx: 102, cy: 181, r: 22, class: "motion-point motion-point-focus" }));
      branches.forEach(([x, y], index) => {
        target.append(svg(document, "path", { d: `M 124 181 L ${x} ${y}`, class: "motion-link" }));
        appendText(document, target, index === 0 ? "A" : "Aᶜ", x + 8, y - 10, "motion-label");
        [[460, y - 44], [460, y + 44]].forEach(([endX, endY], child) => {
          target.append(svg(document, "path", {
            d: `M ${x + 30} ${y} L ${endX} ${endY}`,
            class: index === 0 && child === 0 ? "motion-link motion-probability-path" : "motion-link motion-link-guide",
          }));
          appendText(document, target, child === 0 ? "B|앞선 길" : "Bᶜ|앞선 길", endX + 74, endY + 5, "motion-axis-label");
        });
      });
      appendText(document, target, "한 경로 안은 곱하고, 같은 도착점 경로는 더한다", 400, 324, "motion-number-label");
    } else {
      target.append(svg(document, "rect", {
        x: 82, y: 72, width: 636, height: 236, rx: 20, class: "motion-probability-space",
      }));
      target.append(svg(document, "rect", {
        x: 238, y: 96, width: 386, height: 188, rx: 18, class: "motion-probability-condition",
      }));
      target.append(svg(document, "rect", {
        x: 382, y: 126, width: 166, height: 128, rx: 14, class: "motion-probability-intersection",
      }));
      appendText(document, target, "전체 Ω", 130, 112, "motion-axis-label");
      appendText(document, target, "새 전체 B", 320, 126, "motion-label");
      appendText(document, target, "A∩B", 465, 196, "motion-label");
      if (["highlight", "transform", "verify"].includes(beat?.action)) {
        target.append(svg(document, "rect", { x: 224, y: 82, width: 414, height: 216, rx: 24, class: "motion-target-ring" }));
      }
    }
    appendBeatCopy(document, target, beat);
  }

  function drawProbabilityDistribution(document, target, scene, beat) {
    target.append(svg(document, "path", { d: "M 82 286 L 726 286 M 82 286 L 82 68", class: "motion-axis" }));
    const heights = scene.id.includes("spread") ? [72, 112, 156, 112, 72] : [42, 100, 196, 100, 42];
    heights.forEach((height, index) => {
      const x = 146 + index * 112;
      target.append(svg(document, "rect", {
        x, y: 286 - height, width: 58, height, rx: 8,
        class: index === 2 ? "motion-probability-mass motion-probability-mass-focus" : "motion-probability-mass",
      }));
      appendText(document, target, String(index), x + 29, 312, "motion-axis-label");
    });
    target.append(svg(document, "path", { d: "M 399 82 L 399 296", class: "motion-reference-line" }));
    appendText(document, target, "확률의 무게중심 μ", 400, 58, "motion-number-label");
    if (["highlight", "verify"].includes(beat?.action)) {
      target.append(svg(document, "circle", { cx: 399, cy: 184, r: 28, class: "motion-target-ring" }));
    }
    appendBeatCopy(document, target, beat);
  }

  function drawProbabilityNormal(document, target, _scene, beat) {
    target.append(svg(document, "path", { d: "M 72 286 L 728 286", class: "motion-axis" }));
    [0, 1, 2, 3, 4, 5, 6].forEach((index) => {
      const height = [24, 66, 132, 186, 132, 66, 24][index];
      const x = 112 + index * 84;
      target.append(svg(document, "rect", {
        x, y: 286 - height, width: 56, height, rx: 5, class: "motion-probability-mass",
      }));
    });
    target.append(svg(document, "path", {
      d: "M 84 282 C 200 278, 254 86, 400 86 C 546 86, 600 278, 716 282",
      class: "motion-curve motion-probability-normal",
    }));
    target.append(svg(document, "path", { d: "M 344 286 L 344 104 M 456 286 L 456 104", class: "motion-reference-line" }));
    appendText(document, target, "−0.5", 344, 316, "motion-axis-label");
    appendText(document, target, "+0.5", 456, 316, "motion-axis-label");
    if (["transform", "verify"].includes(beat?.action)) {
      target.append(svg(document, "rect", { x: 330, y: 78, width: 140, height: 220, rx: 18, class: "motion-group-focus" }));
    }
    appendBeatCopy(document, target, beat);
  }

  function drawProbabilityInference(document, target, scene, beat) {
    const confidence = scene.id.includes("confidence") || scene.id.includes("interval") || scene.id.includes("estimation");
    target.append(svg(document, "path", { d: "M 90 184 L 710 184", class: "motion-axis" }));
    target.append(svg(document, "path", { d: "M 402 58 L 402 310", class: "motion-reference-line" }));
    appendText(document, target, confidence ? "참모수" : "모집단 중심 μ", 402, 44, "motion-number-label");
    const rows = confidence ? 6 : 5;
    for (let index = 0; index < rows; index += 1) {
      const y = 86 + index * 42;
      const center = [360, 430, 318, 488, 394, 548][index];
      const half = confidence ? [88, 90, 62, 116, 72, 62][index] : 12 + index * 3;
      if (confidence) {
        target.append(svg(document, "path", {
          d: `M ${center - half} ${y} L ${center + half} ${y}`,
          class: center - half <= 402 && center + half >= 402 ? "motion-confidence-hit" : "motion-confidence-miss",
        }));
      }
      target.append(svg(document, "circle", {
        cx: center, cy: y, r: confidence ? 7 : 10,
        class: "motion-sample-dot",
      }));
    }
    if (!confidence) {
      target.append(svg(document, "path", { d: "M 300 270 C 348 236, 454 236, 506 270", class: "motion-underline" }));
      appendText(document, target, "n이 커질수록 점구름이 중심으로 좁아짐", 400, 304, "motion-number-label");
    }
    if (["highlight", "verify"].includes(beat?.action)) {
      target.append(svg(document, "circle", { cx: 402, cy: 184, r: 32, class: "motion-target-ring" }));
    }
    appendBeatCopy(document, target, beat);
  }

  function drawProbabilityStatisticsScene(document, target, scene, beat) {
    if (PROBABILITY_COUNTING_SCENES.has(scene.id)) drawProbabilityCounting(document, target, scene, beat);
    else if (PROBABILITY_SET_SCENES.has(scene.id)) drawProbabilitySets(document, target, scene, beat);
    else if (PROBABILITY_CONDITIONAL_SCENES.has(scene.id)) drawProbabilityConditional(document, target, scene, beat);
    else if (PROBABILITY_DISTRIBUTION_SCENES.has(scene.id)) drawProbabilityDistribution(document, target, scene, beat);
    else if (PROBABILITY_NORMAL_SCENES.has(scene.id)) drawProbabilityNormal(document, target, scene, beat);
    else drawProbabilityInference(document, target, scene, beat);
  }

  function drawCoordinateAxes(document, target) {
    target.append(svg(document, "path", {
      d: "M 70 270 L 735 270 M 400 318 L 400 58",
      class: "motion-axis",
    }));
    appendText(document, target, "x", 720, 258, "motion-axis-label");
    appendText(document, target, "y", 418, 76, "motion-axis-label");
  }

  function drawSegmentGeometry(document, target, scene, beat) {
    drawCoordinateAxes(document, target);
    const a = { x: 180, y: 242 };
    const b = { x: 630, y: 92 };
    const ratioNearB = ["coordinate-route"].includes(scene.id);
    const p = ratioNearB ? { x: 480, y: 142 } : { x: 330, y: 192 };
    target.append(svg(document, "path", {
      d: `M ${a.x} ${a.y} L ${b.x} ${a.y} L ${b.x} ${b.y} Z`,
      class: "motion-reference-line",
    }));
    target.append(svg(document, "path", {
      d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
      class: "motion-geometry-line",
    }));
    [[a.x, a.y, "A"], [b.x, b.y, "B"], [p.x, p.y, "P"]].forEach(([cx, cy, label], index) => {
      target.append(svg(document, "circle", {
        cx, cy, r: index === 2 ? 10 : 8,
        class: index === 2 ? "motion-point motion-point-focus" : "motion-point",
      }));
      appendText(document, target, label, cx + 15, cy - 12, "motion-axis-label");
    });
    appendText(document, target, ratioNearB ? "AP:PB=2:1" : "AP:PB=1:2", 400, 306, "motion-number-label");
    if (/triangle|distance|differences/u.test(beat?.id || "")) {
      appendText(document, target, "Δx", 410, 258, "motion-axis-label");
      appendText(document, target, "Δy", 652, 170, "motion-axis-label");
    }
    if (["point", "highlight", "verify"].includes(beat?.action)) {
      target.append(svg(document, "circle", {
        cx: p.x, cy: p.y, r: 28, class: "motion-target-ring",
      }));
    }
  }

  function drawSlopeGeometry(document, target, scene, beat) {
    drawCoordinateAxes(document, target);
    const vertical = scene.id === "axis-exception";
    if (vertical) {
      target.append(svg(document, "path", { d: "M 285 70 L 285 300", class: "motion-geometry-line" }));
      target.append(svg(document, "path", { d: "M 92 180 L 710 180", class: "motion-curve" }));
      appendText(document, target, "x=2", 250, 92, "motion-axis-label");
      appendText(document, target, "y=5", 674, 166, "motion-axis-label");
      return;
    }
    target.append(svg(document, "path", { d: "M 105 280 L 610 78", class: "motion-geometry-line" }));
    target.append(svg(document, "path", { d: "M 102 218 L 607 16", class: "motion-reference-line" }));
    target.append(svg(document, "path", { d: "M 238 54 L 580 300", class: "motion-curve" }));
    appendText(document, target, "m=3", 594, 82, "motion-axis-label");
    appendText(document, target, "m=−1/3", 556, 290, "motion-axis-label");
    if (["point", "verify"].includes(beat?.action)) {
      target.append(svg(document, "rect", {
        x: 366, y: 151, width: 30, height: 30, class: "motion-group-focus",
      }));
    }
  }

  function drawPointLineDistanceGeometry(document, target, scene, beat) {
    drawCoordinateAxes(document, target);
    const lineY = scene.id === "parallel-gap" ? 214 : 232;
    target.append(svg(document, "path", {
      d: `M 100 ${lineY + 56} L 710 ${lineY - 128}`,
      class: "motion-geometry-line",
    }));
    if (scene.id === "parallel-gap") {
      target.append(svg(document, "path", {
        d: `M 100 ${lineY - 10} L 710 ${lineY - 194}`,
        class: "motion-reference-line",
      }));
    }
    const point = scene.id === "parallel-gap" ? { x: 300, y: 94 } : { x: 270, y: 82 };
    const foot = scene.id === "parallel-gap" ? { x: 325, y: 146 } : { x: 338, y: 198 };
    target.append(svg(document, "circle", {
      cx: point.x, cy: point.y, r: 10, class: "motion-point motion-point-focus",
    }));
    target.append(svg(document, "path", {
      d: `M ${point.x} ${point.y} L ${foot.x} ${foot.y}`,
      class: "motion-radius",
    }));
    appendText(document, target, "P", point.x + 16, point.y - 10, "motion-axis-label");
    appendText(document, target, "d ⟂ 직선", foot.x + 20, (point.y + foot.y) / 2, "motion-axis-label");
    if (/absolute|numerator|substitute/u.test(beat?.id || "")) {
      appendText(document, target, "|3·2+4·(−1)−12|=10", 400, 306, "motion-number-label");
    }
  }

  function drawCircleEquationGeometry(document, target, scene, beat) {
    drawCoordinateAxes(document, target);
    const center = { x: 430, y: 190 };
    const radius = scene.id === "sign-and-square-trap" ? 88 : 112;
    target.append(svg(document, "circle", {
      cx: center.x, cy: center.y, r: radius, class: "motion-geometry",
    }));
    target.append(svg(document, "circle", {
      cx: center.x, cy: center.y, r: 9, class: "motion-point motion-point-focus",
    }));
    target.append(svg(document, "path", {
      d: `M ${center.x} ${center.y} L ${center.x + radius * 0.8} ${center.y - radius * 0.6}`,
      class: "motion-radius",
    }));
    appendText(document, target, scene.id === "radius-from-point" ? "C(2,−1)" : "중심", center.x - 8, center.y + 28, "motion-axis-label");
    appendText(document, target, scene.id === "radius-from-point" ? "r=5" : "r", center.x + radius * 0.42, center.y - radius * 0.42, "motion-axis-label");
    if (/complete|collect/u.test(beat?.id || "")) {
      appendText(document, target, "(x−2)²+(y+3)²=25", 400, 310, "motion-number-label");
    }
  }

  function drawCircleLineGeometry(document, target, scene, beat) {
    drawCoordinateAxes(document, target);
    const center = { x: 390, y: 186 };
    const radius = 102;
    target.append(svg(document, "circle", {
      cx: center.x, cy: center.y, r: radius, class: "motion-geometry",
    }));
    target.append(svg(document, "circle", {
      cx: center.x, cy: center.y, r: 9, class: "motion-point motion-point-focus",
    }));
    let offset = /outside|no-intersection/u.test(beat?.id || "") ? 138
      : /tangent|boundary|set-tangent/u.test(beat?.id || "") ? 102
        : 62;
    if (scene.id === "position-decision") offset = 138;
    target.append(svg(document, "path", {
      d: `M 105 ${center.y - offset + 62} L 700 ${center.y - offset - 72}`,
      class: "motion-geometry-line",
    }));
    target.append(svg(document, "path", {
      d: `M ${center.x} ${center.y} L ${center.x + 22} ${center.y - offset}`,
      class: "motion-radius",
    }));
    appendText(document, target, `d ${offset < radius ? "<" : offset === radius ? "=" : ">"} r`, 555, 300, "motion-number-label");
    if (scene.id === "moving-line-question") {
      target.append(svg(document, "path", {
        d: `M 105 ${center.y + radius + 62} L 700 ${center.y + radius - 72}`,
        class: "motion-reference-line",
      }));
    }
  }

  function drawTranslationGeometry(document, target, scene, beat) {
    drawCoordinateAxes(document, target);
    const isCircle = scene.id === "translate-equation";
    if (isCircle) {
      target.append(svg(document, "circle", { cx: 310, cy: 212, r: 58, class: "motion-reference-line" }));
      target.append(svg(document, "circle", { cx: 235, cy: 108, r: 58, class: "motion-geometry" }));
      target.append(svg(document, "path", { d: "M 310 212 L 235 108", class: "motion-link" }));
      appendText(document, target, "(−1,3)", 264, 146, "motion-axis-label");
    } else {
      target.append(svg(document, "path", {
        d: "M 100 260 Q 220 88 340 260", class: "motion-reference-line",
      }));
      target.append(svg(document, "path", {
        d: "M 360 294 Q 480 122 600 294", class: "motion-curve",
      }));
      target.append(svg(document, "path", { d: "M 220 260 L 480 294", class: "motion-link" }));
      appendText(document, target, "+(3,−2)", 350, 258, "motion-axis-label");
    }
    if (["point", "verify"].includes(beat?.action)) {
      target.append(svg(document, "circle", { cx: isCircle ? 235 : 480, cy: isCircle ? 108 : 294, r: 25, class: "motion-target-ring" }));
    }
  }

  function drawReflectionGeometry(document, target, scene, beat) {
    drawCoordinateAxes(document, target);
    const diagonal = scene.id === "reflect-circle" || /diagonal/u.test(beat?.id || "");
    if (diagonal) {
      target.append(svg(document, "path", { d: "M 170 310 L 650 70", class: "motion-reference-line" }));
    }
    if (scene.id === "reflect-circle") {
      target.append(svg(document, "circle", { cx: 535, cy: 230, r: 55, class: "motion-reference-line" }));
      target.append(svg(document, "circle", { cx: 310, cy: 115, r: 55, class: "motion-geometry" }));
      target.append(svg(document, "path", { d: "M 535 230 L 310 115", class: "motion-link" }));
      appendText(document, target, "C(2,−1) → C′(−1,2)", 400, 310, "motion-number-label");
      return;
    }
    const p = { x: 565, y: 220 };
    let reflected = { x: 565, y: 320 };
    if (/y-axis/u.test(beat?.id || "")) reflected = { x: 235, y: 220 };
    if (/origin/u.test(beat?.id || "")) reflected = { x: 235, y: 320 };
    if (diagonal) reflected = { x: 310, y: 105 };
    target.append(svg(document, "circle", { cx: p.x, cy: p.y, r: 9, class: "motion-point" }));
    target.append(svg(document, "circle", { cx: reflected.x, cy: reflected.y, r: 10, class: "motion-point motion-point-focus" }));
    target.append(svg(document, "path", { d: `M ${p.x} ${p.y} L ${reflected.x} ${reflected.y}`, class: "motion-link motion-link-guide" }));
    appendText(document, target, "P", p.x + 14, p.y - 10, "motion-axis-label");
    appendText(document, target, "P′", reflected.x + 14, reflected.y - 10, "motion-axis-label");
  }

  function drawCoordinateGeometryScene(document, target, scene, beat) {
    if (["triangle-and-slider", "closer-side-question", "cross-weight-misread", "coordinate-route", "segment-recall"].includes(scene.id)) {
      drawSegmentGeometry(document, target, scene, beat);
    } else if (["road-directions", "two-lines-question", "axis-exception", "parameter-slope", "slope-recall"].includes(scene.id)) {
      drawSlopeGeometry(document, target, scene, beat);
    } else if (["shortest-rope", "distance-meter-question", "absolute-and-normalization", "parallel-gap", "perpendicular-recall"].includes(scene.id)) {
      drawPointLineDistanceGeometry(document, target, scene, beat);
    } else if (["compass-trace", "radius-from-point", "sign-and-square-trap", "complete-the-circle", "circle-recall"].includes(scene.id)) {
      drawCircleEquationGeometry(document, target, scene, beat);
    } else if (["fence-and-path", "moving-line-question", "compare-like-quantities", "position-decision", "radius-gate-recall"].includes(scene.id)) {
      drawCircleLineGeometry(document, target, scene, beat);
    } else if (["transparent-sticker", "parabola-slide-question", "same-sign-error", "translate-equation", "translation-recall"].includes(scene.id)) {
      drawTranslationGeometry(document, target, scene, beat);
    } else {
      drawReflectionGeometry(document, target, scene, beat);
    }
  }

  function drawSetCards(document, target, labels, activeIndexes = []) {
    labels.forEach((label, index) => {
      const x = 116 + index * 112;
      target.append(svg(document, "rect", {
        x, y: 142, width: 82, height: 58, rx: 12,
        class: activeIndexes.includes(index)
          ? "motion-shape motion-shape-focus"
          : "motion-shape",
      }));
      appendText(document, target, label, x + 41, 178, "motion-label");
    });
  }

  function drawSetDefinitionScene(document, target, scene, beat) {
    target.append(svg(document, "rect", {
      x: 84, y: 78, width: 632, height: 212, rx: 28, class: "motion-group-focus",
    }));
    target.append(svg(document, "path", {
      d: "M 400 82 L 400 286", class: "motion-reference-line",
    }));
    appendText(document, target, "판정 기준", 238, 116, "motion-axis-label");
    appendText(document, target, "집합 A", 560, 116, "motion-axis-label");
    const isRoster = ["membership-question", "representation-check", "set-recall"].includes(scene.id);
    const labels = isRoster ? ["1", "2", "3", "4", "5"] : ["2", "3", "4", "?", "✓"];
    drawSetCards(document, target, labels, isRoster ? [1, 3] : [0, 2, 4]);
    if (["group", "transform", "verify"].includes(beat?.action)) {
      target.append(svg(document, "path", { d: "M 350 226 C 400 262, 450 262, 500 226", class: "motion-link" }));
      appendText(document, target, isRoster ? "조건 ⇄ 명단" : "예 / 아니오", 400, 274, "motion-number-label");
    }
  }

  function drawInclusionScene(document, target, scene, beat) {
    target.append(svg(document, "ellipse", {
      cx: 410, cy: 184, rx: 260, ry: 126, class: "motion-geometry",
    }));
    target.append(svg(document, "ellipse", {
      cx: 340, cy: 184, rx: 132, ry: 76, class: "motion-group-focus",
    }));
    appendText(document, target, "B", 640, 94, "motion-axis-label");
    appendText(document, target, "A", 330, 126, "motion-axis-label");
    [[290, 174, "1"], [350, 204, "2"], [490, 155, "3"], [565, 210, "8"]].forEach(([cx, cy, label], index) => {
      const outsideSmall = index > 1;
      target.append(svg(document, "circle", {
        cx, cy, r: 22,
        class: outsideSmall ? "motion-point" : "motion-point motion-point-focus",
      }));
      appendText(document, target, label, cx, cy + 6, "motion-label");
    });
    if (scene.id === "two-way-equality" || /both|merge|reverse/u.test(beat?.id || "")) {
      target.append(svg(document, "path", { d: "M 276 294 C 340 328, 466 328, 530 294", class: "motion-link" }));
      target.append(svg(document, "path", { d: "M 530 310 C 466 344, 340 344, 276 310", class: "motion-reference-line" }));
      appendText(document, target, "A⊆B  ·  B⊆A", 403, 332, "motion-number-label");
    } else {
      appendText(document, target, scene.id === "element-versus-subset" ? "2∈A   {2}⊆A" : "A⊆B", 410, 326, "motion-number-label");
    }
  }

  function drawVennScene(document, target, scene, beat) {
    target.append(svg(document, "rect", {
      x: 58, y: 52, width: 684, height: 260, rx: 24, class: "motion-shape",
    }));
    target.append(svg(document, "circle", { cx: 330, cy: 184, r: 118, class: "motion-geometry" }));
    target.append(svg(document, "circle", { cx: 475, cy: 184, r: 118, class: "motion-reference-line" }));
    appendText(document, target, "A", 254, 92, "motion-axis-label");
    appendText(document, target, "B", 552, 92, "motion-axis-label");
    const complement = scene.id === "demorgan-switch" || /complement|negate/u.test(beat?.id || "");
    const intersection = scene.id === "numbers-under-ten" || /intersection|both|and|clip/u.test(beat?.id || "");
    if (complement) {
      target.append(svg(document, "path", {
        d: "M 70 64 H 730 V 300 H 70 Z M 330 66 A 118 118 0 1 0 330 302 A 118 118 0 1 0 330 66 M 475 66 A 118 118 0 1 0 475 302 A 118 118 0 1 0 475 66",
        class: "motion-group-focus",
        "fill-rule": "evenodd",
      }));
    } else if (intersection) {
      target.append(svg(document, "path", {
        d: "M 402 90 A 118 118 0 0 1 402 278 A 118 118 0 0 1 402 90",
        class: "motion-shape motion-shape-focus",
      }));
    }
    [[276, 168, "2"], [402, 184, "6"], [520, 168, "9"]].forEach(([cx, cy, label], index) => {
      target.append(svg(document, "circle", {
        cx, cy, r: 18, class: index === 1 ? "motion-point motion-point-focus" : "motion-point",
      }));
      appendText(document, target, label, cx, cy + 6, "motion-label");
    });
    appendText(document, target, complement ? "(A∪B)ᶜ = Aᶜ∩Bᶜ" : intersection ? "A∩B" : "A∪B", 400, 336, "motion-number-label");
  }

  function drawTruthScene(document, target, scene, beat) {
    const labels = scene.id === "truth-set-solution" ? ["−2", "−1", "0", "1", "2"] : ["P(1)", "P(2)", "P(3)", "P(4)"];
    appendText(document, target, /some|exist|witness/u.test(beat?.id || "") ? "어떤 ∃ · 증인 하나" : "모든 ∀ · 반례 하나", 400, 78, "motion-number-label");
    labels.forEach((label, index) => {
      const x = 118 + index * (labels.length === 5 ? 112 : 145);
      const active = scene.id === "truth-set-solution" ? [1, 3].includes(index) : index !== 2;
      target.append(svg(document, "rect", {
        x, y: 132, width: 86, height: 88, rx: 14,
        class: active ? "motion-shape motion-shape-focus" : "motion-shape",
      }));
      appendText(document, target, label, x + 43, 172, "motion-label");
      appendText(document, target, active ? "참" : "거짓", x + 43, 204, "motion-axis-label");
    });
    target.append(svg(document, "path", { d: "M 116 254 L 684 254", class: "motion-reference-line" }));
    appendText(document, target, scene.id === "quantifier-negation" ? "¬∀P  ⇔  ∃¬P" : "진리집합 T", 400, 300, "motion-number-label");
  }

  function drawArrowScene(document, target, scene, beat) {
    const isCondition = ["gate-and-requirement", "square-rectangle-question", "language-reversal", "interval-condition", "tail-head-recall"].includes(scene.id);
    target.append(svg(document, "rect", { x: 116, y: 122, width: 190, height: 104, rx: 18, class: "motion-shape motion-shape-focus" }));
    target.append(svg(document, "rect", { x: 494, y: 122, width: 190, height: 104, rx: 18, class: "motion-shape" }));
    appendText(document, target, isCondition ? "p · 충분" : "p", 211, 180, "motion-label");
    appendText(document, target, isCondition ? "q · 필요" : "q", 589, 180, "motion-label");
    target.append(svg(document, "path", { d: "M 326 174 C 376 132, 424 132, 474 174", class: "motion-link" }));
    appendText(document, target, "p → q", 400, 116, "motion-number-label");
    const contraposition = /contra|negate|contrapositive/u.test(beat?.id || "") || scene.id === "multiple-of-four";
    if (contraposition) {
      target.append(svg(document, "path", { d: "M 474 242 C 424 286, 376 286, 326 242", class: "motion-reference-line" }));
      appendText(document, target, "¬q → ¬p", 400, 302, "motion-number-label");
    } else if (!isCondition) {
      target.append(svg(document, "path", { d: "M 474 242 C 424 286, 376 286, 326 242", class: "motion-reference-line" }));
      appendText(document, target, "역 q → p는 별도", 400, 302, "motion-number-label");
    } else {
      appendText(document, target, "P ⊆ Q", 400, 294, "motion-number-label");
    }
  }

  function drawProofScene(document, target, scene, beat) {
    const nodes = scene.id === "irrational-root-two"
      ? ["√2=a/b", "a는 짝수", "b도 짝수", "서로소 모순"]
      : scene.id === "even-square-question"
        ? ["n=2k+1", "n²=4k²+4k+1", "2m+1", "대우 완료"]
        : ["p", "¬q", "R ∧ ¬R", "가정 기각"];
    nodes.forEach((label, index) => {
      const x = 58 + index * 188;
      target.append(svg(document, "rect", {
        x, y: 132, width: 150, height: 82, rx: 14,
        class: index === Math.min(3, /verify|clash|force-b/u.test(beat?.id || "") ? 3 : 1)
          ? "motion-shape motion-shape-focus"
          : "motion-shape",
      }));
      appendText(document, target, label, x + 75, 180, "motion-label");
      if (index < nodes.length - 1) target.append(svg(document, "path", { d: `M ${x + 154} 174 L ${x + 182} 174`, class: "motion-link" }));
    });
    appendText(document, target, scene.id === "fake-contradiction" ? "이상함 ≠ 모순" : "우회 증명 흐름", 400, 286, "motion-number-label");
  }

  function drawInequalityScene(document, target, scene, beat) {
    target.append(svg(document, "path", { d: "M 92 286 L 710 286", class: "motion-axis" }));
    appendText(document, target, "0 바닥", 104, 310, "motion-axis-label");
    const gap = scene.id === "two-numbers-question" ? 116 : 150;
    target.append(svg(document, "rect", {
      x: 245, y: 286 - gap, width: gap, height: gap, rx: 10,
      class: "motion-shape motion-shape-focus",
    }));
    appendText(document, target, "(a−b)²", 245 + gap / 2, 286 - gap / 2 + 6, "motion-label");
    target.append(svg(document, "rect", {
      x: 470, y: 222, width: 190, height: 64, rx: 12, class: "motion-shape",
    }));
    appendText(document, target, scene.id === "unsafe-division" ? "a>0 / a<0 / a=0" : "≥ 0", 565, 260, "motion-label");
    if (/equality|zero|record/u.test(beat?.id || "")) {
      target.append(svg(document, "path", { d: "M 320 142 L 320 286", class: "motion-reference-line" }));
      appendText(document, target, "a=b에서 0", 400, 330, "motion-number-label");
    }
  }

  function drawSetsPropositionsScene(document, target, scene, beat) {
    if (["objective-guest-list", "membership-question", "braces-do-not-decide", "representation-check", "set-recall"].includes(scene.id)) {
      drawSetDefinitionScene(document, target, scene, beat);
    } else if (["nested-boxes", "divisor-box-question", "element-versus-subset", "two-way-equality", "inclusion-recall"].includes(scene.id)) {
      drawInclusionScene(document, target, scene, beat);
    } else if (["overlapping-spotlights", "numbers-under-ten", "demorgan-switch", "shade-from-outside", "logic-lights-recall"].includes(scene.id)) {
      drawVennScene(document, target, scene, beat);
    } else if (["truth-switchboard", "all-or-some-question", "quantifier-negation", "truth-set-solution", "verdict-recall"].includes(scene.id)) {
      drawTruthScene(document, target, scene, beat);
    } else if (["one-way-arrow", "multiple-of-four", "converse-is-not-equivalent", "label-and-turn", "arrow-recall", "gate-and-requirement", "square-rectangle-question", "language-reversal", "interval-condition", "tail-head-recall"].includes(scene.id)) {
      drawArrowScene(document, target, scene, beat);
    } else if (["two-detours", "even-square-question", "fake-contradiction", "irrational-root-two", "proof-route-recall"].includes(scene.id)) {
      drawProofScene(document, target, scene, beat);
    } else {
      drawInequalityScene(document, target, scene, beat);
    }
  }

  function drawFunctionMappingScene(document, target, scene, beat) {
    const inputs = ["−1", "0", "1"];
    const outputs = scene.id === "horizontal-test-error" ? ["1", "0", "1"] : ["−1", "1", "3"];
    appendText(document, target, "입력 x", 180, 78, "motion-axis-label");
    appendText(document, target, "출력 f(x)", 620, 78, "motion-axis-label");
    inputs.forEach((label, index) => {
      const y = 112 + index * 82;
      target.append(svg(document, "circle", {
        cx: 180, cy: y, r: 28,
        class: index === 1 ? "motion-point motion-point-focus" : "motion-point",
      }));
      target.append(svg(document, "circle", {
        cx: 620, cy: y, r: 28,
        class: index === 1 ? "motion-point motion-point-focus" : "motion-point",
      }));
      appendText(document, target, label, 180, y + 6, "motion-label");
      appendText(document, target, outputs[index], 620, y + 6, "motion-label");
      target.append(svg(document, "path", {
        d: `M 212 ${y} C 330 ${y}, 470 ${y}, 588 ${y}`,
        class: index === 1 ? "motion-link" : "motion-link motion-link-guide",
      }));
    });
    if (scene.id === "horizontal-test-error") {
      target.append(svg(document, "path", { d: "M 505 110 L 505 278", class: "motion-reference-line" }));
      appendText(document, target, "세로선: x 하나에 y 하나", 400, 330, "motion-number-label");
    } else {
      appendText(document, target, "입력 하나 → 출력 하나", 400, 330, "motion-number-label");
    }
    if (["point", "highlight", "verify"].includes(beat?.action)) {
      target.append(svg(document, "rect", {
        x: 138, y: 160, width: 524, height: 64, rx: 18, class: "motion-group-focus",
      }));
    }
  }

  function drawCompositionPipelineScene(document, target, scene, beat) {
    const reversed = scene.id === "order-question" && /reverse|wrong|swap/u.test(beat?.id || "");
    const stages = reversed
      ? [["x", "3"], ["g", "×2"], ["f", "+1"], ["결과", "7"]]
      : [["x", "3"], ["f", "+1"], ["g", "×2"], ["결과", "8"]];
    stages.forEach(([title, value], index) => {
      const x = 40 + index * 192;
      target.append(svg(document, "rect", {
        x, y: 126, width: 146, height: 102, rx: 18,
        class: index === Math.min(3, /result|verify|finish|output/u.test(beat?.id || "") ? 3 : 1)
          ? "motion-shape motion-shape-focus"
          : "motion-shape",
      }));
      appendText(document, target, title, x + 73, 165, "motion-axis-label");
      appendText(document, target, value, x + 73, 204, "motion-label");
      if (index < stages.length - 1) {
        target.append(svg(document, "path", { d: `M ${x + 150} 177 L ${x + 186} 177`, class: "motion-link" }));
      }
    });
    appendText(
      document,
      target,
      scene.id === "missing-parentheses" ? "g(f(x))에서 안쪽 f부터" : "기계의 순서가 답을 바꿉니다",
      400,
      300,
      "motion-number-label",
    );
    if (["group", "highlight"].includes(beat?.action)) {
      target.append(svg(document, "path", { d: "M 210 246 C 326 302, 474 302, 590 246", class: "motion-reference-line" }));
    }
  }

  function drawInverseScene(document, target, scene, beat) {
    target.append(svg(document, "path", { d: "M 112 275 L 680 70", class: "motion-reference-line" }));
    appendText(document, target, "y=x", 654, 82, "motion-axis-label");
    const nodes = [[170, 218, "x=3"], [400, 135, "f(x)=7"], [630, 218, "f⁻¹(7)=3"]];
    nodes.forEach(([cx, cy, label], index) => {
      target.append(svg(document, "circle", {
        cx, cy, r: 48,
        class: index === 1 ? "motion-point motion-point-focus" : "motion-point",
      }));
      appendText(document, target, label, cx, cy + 6, "motion-label");
    });
    target.append(svg(document, "path", { d: "M 220 200 C 286 144, 318 136, 350 136", class: "motion-link" }));
    target.append(svg(document, "path", { d: "M 450 136 C 506 136, 546 164, 580 198", class: "motion-link" }));
    appendText(
      document,
      target,
      scene.id === "negative-one-is-not-reciprocal" ? "f⁻¹는 되돌리기, 1/f가 아님" : "입력과 출력을 바꾸고 다시 확인",
      400,
      320,
      "motion-number-label",
    );
    if (["transform", "verify", "highlight"].includes(beat?.action)) {
      target.append(svg(document, "path", { d: "M 580 236 C 474 300, 326 300, 220 236", class: "motion-reference-line" }));
    }
  }

  function drawRationalScene(document, target, scene, beat) {
    target.append(svg(document, "path", { d: "M 76 268 L 726 268 M 400 322 L 400 58", class: "motion-axis" }));
    target.append(svg(document, "path", { d: "M 292 60 L 292 320", class: "motion-reference-line" }));
    target.append(svg(document, "path", { d: "M 72 170 L 728 170", class: "motion-reference-line" }));
    target.append(svg(document, "path", {
      d: "M 82 146 C 150 142, 220 132, 268 82 M 316 314 C 342 244, 438 194, 718 177",
      class: "motion-curve",
    }));
    appendText(document, target, "x=−1", 292, 338, "motion-axis-label");
    appendText(document, target, "y=3", 748, 176, "motion-axis-label");
    if (scene.id === "asymptote-is-not-graph") {
      appendText(document, target, "점근선은 가까워지는 길, 그래프 자체가 아님", 400, 42, "motion-number-label");
    } else {
      appendText(document, target, "금지값과 이동한 중심을 먼저 표시", 400, 42, "motion-number-label");
    }
    if (["point", "highlight", "verify"].includes(beat?.action)) {
      target.append(svg(document, "circle", { cx: 292, cy: 170, r: 28, class: "motion-target-ring" }));
    }
  }

  function drawRadicalScene(document, target, scene, beat) {
    target.append(svg(document, "path", { d: "M 80 286 L 724 286 M 206 320 L 206 60", class: "motion-axis" }));
    target.append(svg(document, "path", {
      d: "M 206 252 C 240 190, 302 148, 382 124 C 480 94, 588 80, 704 72",
      class: "motion-curve",
    }));
    target.append(svg(document, "circle", { cx: 206, cy: 252, r: 11, class: "motion-point motion-point-focus" }));
    target.append(svg(document, "path", { d: "M 206 286 L 704 286", class: "motion-number-band" }));
    appendText(document, target, "시작점", 206, 234, "motion-axis-label");
    appendText(document, target, "루트 안 ≥ 0", 470, 318, "motion-number-label");
    if (scene.id === "perfect-square-points") {
      [[330, 141, "1"], [490, 92, "4"], [650, 76, "9"]].forEach(([cx, cy, label]) => {
        target.append(svg(document, "circle", { cx, cy, r: 8, class: "motion-point" }));
        appendText(document, target, label, cx, cy - 14, "motion-axis-label");
      });
    }
    if (["point", "highlight", "verify"].includes(beat?.action)) {
      target.append(svg(document, "circle", { cx: 206, cy: 252, r: 30, class: "motion-target-ring" }));
    }
  }

  function drawFunctionsGraphsScene(document, target, scene, beat) {
    if (["vending-buttons", "mapping-question", "horizontal-test-error", "graph-from-rule", "function-recall"].includes(scene.id)) {
      drawFunctionMappingScene(document, target, scene, beat);
    } else if (["assembly-line", "order-question", "missing-parentheses", "numeric-pipeline", "composition-recall"].includes(scene.id)) {
      drawCompositionPipelineScene(document, target, scene, beat);
    } else if (["undo-button", "linear-undo-question", "negative-one-is-not-reciprocal", "solve-swap-check", "inverse-recall"].includes(scene.id)) {
      drawInverseScene(document, target, scene, beat);
    } else if (["forbidden-wall-horizon", "divide-to-see-question", "asymptote-is-not-graph", "rational-sketch", "rational-recall"].includes(scene.id)) {
      drawRationalScene(document, target, scene, beat);
    } else {
      drawRadicalScene(document, target, scene, beat);
    }
  }

  function drawPowerRootMachine(document, target, scene, beat) {
    const nodes = [
      [92, 130, 160, 96, "입력", scene.id === "principal-root-trap" ? "−3, 3" : "a"],
      [320, 130, 160, 96, "거듭제곱", "× 자기 자신"],
      [548, 130, 160, 96, "결과", scene.id === "root-calculation-route" ? "16" : "a²"],
    ];
    nodes.forEach(([x, y, width, height, title, value], index) => {
      target.append(svg(document, "rect", {
        x, y, width, height, rx: 18,
        class: index === 1 ? "motion-shape motion-shape-focus" : "motion-shape",
      }));
      appendText(document, target, title, x + width / 2, y + 32, "motion-axis-label");
      appendText(document, target, value, x + width / 2, y + 70, "motion-label");
      if (index < nodes.length - 1) {
        target.append(svg(document, "path", {
          d: `M ${x + width + 8} ${y + height / 2} L ${x + width + 60} ${y + height / 2}`,
          class: "motion-link",
        }));
      }
    });
    target.append(svg(document, "path", {
      d: "M 630 246 C 630 306, 412 322, 176 252",
      class: "motion-reference-line",
    }));
    appendText(document, target, "제곱근은 결과에서 입력으로 되감기", 400, 300, "motion-number-label");
    if (["root-count-by-parity", "principal-root-trap"].includes(scene.id)) {
      appendText(document, target, "방정식 x²=9 → x=−3 또는 3", 400, 92, "motion-number-label");
    }
    if (["point", "highlight", "verify", "transform"].includes(beat?.action)) {
      target.append(svg(document, "rect", {
        x: 72, y: 112, width: 656, height: 132, rx: 22, class: "motion-group-focus",
      }));
    }
  }

  function drawFractionalExponentLine(document, target, scene, beat) {
    const y = 218;
    const ticks = [
      [112, "0"], [268, "1/3"], [400, "1/2"], [532, "2/3"], [688, "1"],
    ];
    target.append(svg(document, "path", { d: `M 78 ${y} L 722 ${y}`, class: "motion-axis" }));
    ticks.forEach(([x, label], index) => {
      target.append(svg(document, "path", { d: `M ${x} ${y - 13} L ${x} ${y + 13}`, class: "motion-axis" }));
      target.append(svg(document, "circle", {
        cx: x, cy: y, r: index === 2 ? 11 : 7,
        class: index === 2 ? "motion-point motion-point-focus" : "motion-point",
      }));
      appendText(document, target, label, x, y + 42, "motion-axis-label");
    });
    appendText(document, target, "a¹ᐟⁿ = ⁿ√a", 400, 112, "motion-number-label");
    appendText(document, target, "분모 n은 몇 제곱근인지 정합니다", 400, 304, "motion-number-label");
    if (scene.id === "negative-base-extension-trap") {
      target.append(svg(document, "rect", { x: 220, y: 72, width: 360, height: 82, rx: 18, class: "motion-shape motion-shape-focus" }));
      appendText(document, target, "음수 밑: 홀수 뿌리만 실수로 통과", 400, 122, "motion-label");
    }
    if (["point", "highlight", "group"].includes(beat?.action)) {
      target.append(svg(document, "rect", {
        x: 240, y: y - 42, width: 320, height: 84, rx: 18, class: "motion-group-focus",
      }));
    }
  }

  function drawExponentLedger(document, target, scene, beat) {
    if (scene.id === "sum-power-trap") {
      const cells = [
        [205, 90, "a²", "motion-block motion-block-focus"],
        [405, 90, "ab", "motion-block motion-block-quiet"],
        [205, 190, "ab", "motion-block motion-block-quiet"],
        [405, 190, "b²", "motion-block motion-block-result"],
      ];
      cells.forEach(([x, y, label, className]) => {
        target.append(svg(document, "rect", { x, y, width: 190, height: 90, rx: 12, class: className }));
        appendText(document, target, label, x + 95, y + 54, "motion-label");
      });
      appendText(document, target, "(a+b)² = a² + 2ab + b²", 400, 326, "motion-number-label");
      return;
    }
    const rows = [
      [86, 102, "aᵐ", "곱셈", "+", "aⁿ", "aᵐ⁺ⁿ"],
      [86, 222, "aᵐ", "나눗셈", "−", "aⁿ", "aᵐ⁻ⁿ"],
    ];
    rows.forEach(([x, y, left, verb, operation, right, result], rowIndex) => {
      const values = [[left, 122], [operation, 270], [right, 344], ["→", 492], [result, 592]];
      values.forEach(([label, position], index) => {
        if (index === 1 || index === 3) {
          appendText(document, target, label, position, y + 44, "motion-operator");
          return;
        }
        target.append(svg(document, "rect", {
          x: position - 58, y, width: 116, height: 68, rx: 12,
          class: index === 4 || rowIndex === 0 && index === 0 ? "motion-shape motion-shape-focus" : "motion-shape",
        }));
        appendText(document, target, label, position, y + 43, "motion-label");
      });
      appendText(document, target, verb, 708, y + 43, "motion-axis-label");
    });
    if (["highlight", "group", "verify"].includes(beat?.action)) {
      target.append(svg(document, "path", { d: "M 64 192 L 736 192", class: "motion-reference-line" }));
    }
  }

  function drawAlgebraPowerExponentScene(document, target, scene, beat) {
    if (["power-machine-and-rewind", "root-count-by-parity", "principal-root-trap", "root-calculation-route", "rewind-question-recall"].includes(scene.id)) {
      drawPowerRootMachine(document, target, scene, beat);
    } else if (["exponent-number-line-zoom", "fractional-exponent-meaning", "negative-base-extension-trap", "fractional-exponent-conversion", "dense-exponent-line-recall"].includes(scene.id)) {
      drawFractionalExponentLine(document, target, scene, beat);
    } else {
      drawExponentLedger(document, target, scene, beat);
    }
  }

  function drawLogTranslator(document, target, scene, beat) {
    if (scene.id === "log-sum-trap") {
      const cards = [[92, "logₐM"], [326, "+ logₐN"], [566, "logₐ(MN)"]];
      cards.forEach(([x, label], index) => {
        target.append(svg(document, "rect", {
          x, y: 132, width: 150, height: 92, rx: 16,
          class: index === 2 ? "motion-shape motion-shape-focus" : "motion-shape",
        }));
        appendText(document, target, label, x + 75, 188, "motion-label");
        if (index < 2) appendText(document, target, index === 0 ? "+" : "→", x + 192, 188, "motion-operator");
      });
      appendText(document, target, "바깥의 +는 진수 안에서 ×", 400, 290, "motion-number-label");
      return;
    }
    const labels = scene.id === "log-domain-gates"
      ? [["밑", "a>0"], ["관문", "a≠1"], ["진수", "b>0"]]
      : [["밑 버튼", "a"], ["횟수", "x"], ["도착값", "b"]];
    labels.forEach(([title, value], index) => {
      const x = 82 + index * 236;
      target.append(svg(document, "rect", {
        x, y: 128, width: 164, height: 100, rx: 18,
        class: index === 1 ? "motion-shape motion-shape-focus" : "motion-shape",
      }));
      appendText(document, target, title, x + 82, 164, "motion-axis-label");
      appendText(document, target, value, x + 82, 205, "motion-label");
      if (index < 2) target.append(svg(document, "path", { d: `M ${x + 172} 178 L ${x + 226} 178`, class: "motion-link" }));
    });
    appendText(
      document,
      target,
      scene.id === "log-expression-solution" ? "조건 → 묶기 → 지수 문장 검산" : "aˣ=b  ⇄  logₐb=x",
      400,
      294,
      "motion-number-label",
    );
    if (["point", "highlight", "verify"].includes(beat?.action)) {
      target.append(svg(document, "rect", { x: 64, y: 110, width: 672, height: 136, rx: 22, class: "motion-group-focus" }));
    }
  }

  function drawDecadeElevator(document, target, scene, beat) {
    const floors = [[76, "10⁰", "1"], [226, "10¹", "10"], [376, "10²", "100"], [526, "10³", "1000"]];
    floors.forEach(([x, power, value], index) => {
      const y = 248 - index * 52;
      target.append(svg(document, "rect", {
        x, y, width: 178, height: 44, rx: 9,
        class: index === 2 ? "motion-shape motion-shape-focus" : "motion-shape",
      }));
      appendText(document, target, `${power} = ${value}`, x + 89, y + 29, "motion-axis-label");
    });
    target.append(svg(document, "path", { d: "M 722 286 L 722 62", class: "motion-link" }));
    appendText(document, target, "10배", 720, 48, "motion-axis-label");
    appendText(
      document,
      target,
      scene.id === "digit-count-question" ? "층 번호 + 1 = 자릿수" : "로그 한 칸 = 원래 값 10배",
      400,
      326,
      "motion-number-label",
    );
    if (scene.id === "common-log-application-route") {
      appendText(document, target, "2.505 = 2층 + 층 안 3.2배", 400, 72, "motion-number-label");
    }
  }

  function drawInverseMachinePair(document, target, scene, beat) {
    const boxes = [[88, "실수 x", "지수 aˣ"], [548, "양수 y", "로그 logₐy"]];
    boxes.forEach(([x, title, detail], index) => {
      target.append(svg(document, "rect", {
        x, y: 124, width: 170, height: 112, rx: 20,
        class: index === 0 ? "motion-shape" : "motion-shape motion-shape-focus",
      }));
      appendText(document, target, title, x + 85, 164, "motion-label");
      appendText(document, target, detail, x + 85, 205, "motion-axis-label");
    });
    target.append(svg(document, "path", { d: "M 270 150 C 350 90, 450 90, 530 150", class: "motion-link" }));
    target.append(svg(document, "path", { d: "M 530 216 C 450 282, 350 282, 270 216", class: "motion-reference-line" }));
    appendText(document, target, "정방향", 400, 108, "motion-axis-label");
    appendText(document, target, "되감기", 400, 280, "motion-axis-label");
    if (scene.id === "domain-range-swap-trap") {
      appendText(document, target, "ℝ  ⇄  (0,∞)", 400, 328, "motion-number-label");
    } else {
      appendText(document, target, "logₐ(aˣ)=x", 400, 328, "motion-number-label");
    }
  }

  function drawLogGraphMirror(document, target, scene, beat) {
    target.append(svg(document, "path", { d: "M 72 270 L 728 270 M 400 324 L 400 54", class: "motion-axis" }));
    target.append(svg(document, "path", { d: "M 142 310 L 662 58", class: "motion-reference-line" }));
    target.append(svg(document, "path", {
      d: "M 92 252 C 250 246, 330 212, 402 160 C 486 99, 572 74, 708 62",
      class: "motion-curve",
    }));
    target.append(svg(document, "path", {
      d: "M 420 310 C 426 240, 448 190, 500 156 C 566 112, 636 92, 716 78",
      class: "motion-geometry-line",
    }));
    [[400, 218, "(0,1)"], [464, 270, "(1,0)"]].forEach(([cx, cy, label], index) => {
      target.append(svg(document, "circle", { cx, cy, r: 10, class: index ? "motion-point" : "motion-point motion-point-focus" }));
      appendText(document, target, label, cx + (index ? 30 : -32), cy - 18, "motion-axis-label");
    });
    appendText(document, target, "y=x", 648, 70, "motion-axis-label");
    appendText(
      document,
      target,
      scene.id === "asymptote-not-intercept" ? "축에 가까워져도 닿지 않음" : "한 점 · 한 점근선 · 한 방향",
      400,
      336,
      "motion-number-label",
    );
  }

  function drawGrowthClock(document, target, scene, beat) {
    const values = scene.id === "growth-model-solution"
      ? [["0h", "200"], ["4h", "160"], ["12h", "102.4"], ["16h", "81.92"]]
      : [["0", "A₀"], ["1주기", "A₀r"], ["2주기", "A₀r²"], ["3주기", "A₀r³"]];
    values.forEach(([time, value], index) => {
      const x = 70 + index * 190;
      target.append(svg(document, "circle", {
        cx: x + 45, cy: 180, r: 42,
        class: index === values.length - 1 ? "motion-point motion-point-focus" : "motion-point",
      }));
      appendText(document, target, value, x + 45, 188, "motion-label");
      appendText(document, target, time, x + 45, 244, "motion-axis-label");
      if (index < values.length - 1) target.append(svg(document, "path", { d: `M ${x + 91} 180 L ${x + 181} 180`, class: "motion-link" }));
    });
    appendText(
      document,
      target,
      scene.id === "inverse-time-question" ? "목표 ÷ 초기값 → 로그로 시간 되찾기" : "같은 양이 아니라 같은 배수를 반복",
      400,
      300,
      "motion-number-label",
    );
    if (scene.id === "growth-model-solution") {
      appendText(document, target, "연속 임계 12.43h · 4시간 관측 최초 16h", 400, 88, "motion-number-label");
    }
  }

  function drawAlgebraLogFunctionScene(document, target, scene, beat) {
    if (["exponent-question-language", "log-domain-gates", "log-sum-trap", "log-expression-solution", "log-three-roles-recall"].includes(scene.id)) {
      drawLogTranslator(document, target, scene, beat);
    } else if (["powers-of-ten-elevator", "digit-count-question", "scale-difference-trap", "common-log-application-route", "magnitude-floor-recall"].includes(scene.id)) {
      drawDecadeElevator(document, target, scene, beat);
    } else if (["forward-and-reverse-machines", "fixed-base-variable-place", "domain-range-swap-trap", "inverse-composition-solution", "two-machines-recall"].includes(scene.id)) {
      drawInverseMachinePair(document, target, scene, beat);
    } else if (["graph-mirror-and-anchors", "base-direction-switch", "asymptote-not-intercept", "graph-reconstruction-route", "graph-fingerprint-recall"].includes(scene.id)) {
      drawLogGraphMirror(document, target, scene, beat);
    } else {
      drawGrowthClock(document, target, scene, beat);
    }
  }

  function drawRadianWheel(document, target, scene, beat) {
    const center = { x: 310, y: 184 };
    const radius = 105;
    target.append(svg(document, "circle", {
      cx: center.x, cy: center.y, r: radius,
      class: "motion-reference-circle",
    }));
    target.append(svg(document, "path", {
      d: `M ${center.x} ${center.y} L ${center.x + radius} ${center.y}`,
      class: "motion-geometry-line",
    }));
    target.append(svg(document, "path", {
      d: `M ${center.x} ${center.y} L ${center.x + 54} ${center.y - 90}`,
      class: "motion-link",
    }));
    target.append(svg(document, "path", {
      d: `M ${center.x + radius} ${center.y} A ${radius} ${radius} 0 0 0 ${center.x + 54} ${center.y - 90}`,
      class: "motion-curve",
    }));
    appendText(document, target, "r", center.x + 52, center.y + 24, "motion-axis-label");
    appendText(document, target, "호 l", center.x + 112, center.y - 60, "motion-axis-label");
    appendText(document, target, "θ", center.x + 46, center.y - 23, "motion-label");
    const unitCopy = scene.id === "degree-radian-mixup"
      ? "180° = πrad"
      : scene.id === "sector-measure-solution"
        ? "150° → 5π/6 → l=5π · S=15π"
        : "θ = l/r · 한 바퀴 = 2π";
    target.append(svg(document, "rect", {
      x: 500, y: 108, width: 244, height: 142, rx: 18,
      class: "motion-shape motion-shape-focus",
    }));
    appendText(document, target, unitCopy, 622, 178, "motion-number-label");
    appendText(
      document,
      target,
      scene.id === "directed-turn-counter" ? "+ 반시계 · − 시계 · 2π마다 같은 동경" : "반지름 자로 원 위의 회전을 잽니다",
      400,
      314,
      "motion-number-label",
    );
    if (["point", "highlight", "verify"].includes(beat?.action)) {
      target.append(svg(document, "path", {
        d: "M 494 266 L 750 266",
        class: "motion-underline",
      }));
    }
  }

  function drawUnitCircleWave(document, target, scene, beat) {
    const center = { x: 208, y: 176 };
    const radius = 96;
    target.append(svg(document, "circle", { cx: center.x, cy: center.y, r: radius, class: "motion-reference-circle" }));
    target.append(svg(document, "path", { d: `M 78 ${center.y} L 338 ${center.y} M ${center.x} 58 L ${center.x} 294`, class: "motion-axis" }));
    const point = { x: center.x + 66, y: center.y - 70 };
    target.append(svg(document, "path", { d: `M ${center.x} ${center.y} L ${point.x} ${point.y}`, class: "motion-geometry-line" }));
    target.append(svg(document, "path", { d: `M ${point.x} ${point.y} L ${point.x} ${center.y} M ${point.x} ${point.y} L ${center.x} ${point.y}`, class: "motion-reference-line" }));
    target.append(svg(document, "circle", { cx: point.x, cy: point.y, r: 10, class: "motion-point motion-point-focus" }));
    appendText(document, target, "cosθ", point.x, center.y + 25, "motion-axis-label");
    appendText(document, target, "sinθ", center.x - 35, point.y, "motion-axis-label");

    target.append(svg(document, "path", { d: "M 380 176 L 750 176", class: "motion-axis" }));
    target.append(svg(document, "path", {
      d: "M 390 176 C 430 90, 480 90, 520 176 C 560 262, 610 262, 650 176 C 690 90, 725 104, 748 142",
      class: "motion-curve",
    }));
    [390, 480, 570, 660, 748].forEach((x, index) => {
      target.append(svg(document, "circle", {
        cx: x, cy: index % 2 ? index === 1 ? 94 : 258 : 176, r: 7,
        class: index === 1 ? "motion-point motion-point-focus" : "motion-point",
      }));
    });
    appendText(document, target, "0", 390, 205, "motion-axis-label");
    appendText(document, target, "π/2", 480, 205, "motion-axis-label");
    appendText(document, target, "π", 570, 205, "motion-axis-label");
    appendText(document, target, "2π", 744, 205, "motion-axis-label");
    const copy = scene.id === "tangent-gap-trap"
      ? "tanθ=sinθ/cosθ · cosθ=0에서 끊기"
      : scene.id === "transformed-wave-solution"
        ? "진폭 |A| · 주기 2π/|B| · 중심선 D"
        : "원 위의 그림자를 각도 축에 펼칩니다";
    appendText(document, target, copy, 400, 326, "motion-number-label");
  }

  function drawTriangulationTool(document, target, scene, beat) {
    const a = { x: 104, y: 264 };
    const b = { x: 660, y: 264 };
    const c = { x: 472, y: 74 };
    target.append(svg(document, "path", {
      d: `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y} Z`,
      class: "motion-geometry-line",
    }));
    [[a, "A"], [b, "B"], [c, "C"]].forEach(([point, label]) => {
      target.append(svg(document, "circle", { cx: point.x, cy: point.y, r: 10, class: "motion-point motion-point-focus" }));
      appendText(document, target, label, point.x, point.y - 22, "motion-label");
    });
    appendText(document, target, "a ↔ A", 574, 166, "motion-axis-label");
    appendText(document, target, "b ↔ B", 274, 166, "motion-axis-label");
    appendText(document, target, "기준선 c", 380, 292, "motion-axis-label");
    const useCosine = scene.id === "law-selection-question";
    target.append(svg(document, "rect", {
      x: 152, y: 302, width: 500, height: 54, rx: 12,
      class: "motion-shape motion-shape-focus",
    }));
    appendText(
      document,
      target,
      useCosine ? "두 변+끼인각 → 코사인법칙" : "맞은편 쌍 → a/sinA = b/sinB",
      402,
      336,
      "motion-number-label",
    );
    if (scene.id === "opposite-pair-trap") {
      target.append(svg(document, "path", { d: "M 548 146 L 610 92", class: "motion-pointer" }));
    }
    if (beat?.action === "verify") {
      target.append(svg(document, "path", { d: "M 144 370 L 660 370", class: "motion-underline" }));
    }
  }

  function drawAlgebraTrigonometryScene(document, target, scene, beat) {
    if (["arc-as-angle-ruler", "directed-turn-counter", "degree-radian-mixup", "sector-measure-solution", "radius-ruler-recall"].includes(scene.id)) {
      drawRadianWheel(document, target, scene, beat);
    } else if (["rotating-beacon-shadows", "wave-landmarks-question", "tangent-gap-trap", "transformed-wave-solution", "circle-wave-recall"].includes(scene.id)) {
      drawUnitCircleWave(document, target, scene, beat);
    } else {
      drawTriangulationTool(document, target, scene, beat);
    }
  }

  function drawSequenceAddressScale(document, target, scene, beat) {
    const arithmetic = ["constant-step-staircase", "n-minus-one-steps", "difference-ratio-and-offbyone", "paired-arithmetic-sum", "equal-stride-recall"].includes(scene.id);
    const geometric = ["constant-zoom-lens", "n-minus-one-multiplications", "geometric-middle-sign-trap", "shifted-geometric-sum", "constant-scale-recall"].includes(scene.id);
    const labels = arithmetic
      ? ["a₁", "a₁+d", "a₁+2d", "…", "a₁+(n−1)d"]
      : geometric
        ? ["a₁", "a₁r", "a₁r²", "…", "a₁rⁿ⁻¹"]
        : ["a₁", "a₂", "a₃", "…", "aₙ"];
    labels.forEach((label, index) => {
      const width = index === 4 ? 156 : 104;
      const x = 48 + index * 150;
      const height = geometric ? 56 + index * 12 : arithmetic ? 62 + index * 18 : 78;
      const y = 238 - height;
      target.append(svg(document, "rect", {
        x, y, width, height, rx: 12,
        class: index === 4 ? "motion-shape motion-shape-focus" : "motion-shape",
      }));
      appendText(document, target, label, x + width / 2, y + height / 2 + 7, "motion-label");
      appendText(document, target, String(index + 1), x + width / 2, 270, "motion-axis-label");
      if (index < labels.length - 1) {
        appendText(document, target, arithmetic ? "+d" : geometric ? "×r" : "→", x + width + 21, 190, "motion-axis-label");
      }
    });
    const copy = arithmetic
      ? "공차 d · 이동은 n−1번 · 합은 양끝 평균×n"
      : geometric
        ? "공비 r · 통과는 n−1번 · Sₙ과 rSₙ을 밀어 빼기"
        : "n은 주소 · aₙ은 그 칸의 값 · Sₙ은 그 칸까지 누적";
    appendText(document, target, copy, 400, 322, "motion-number-label");
    if (["highlight", "verify"].includes(beat?.action)) {
      target.append(svg(document, "path", { d: "M 44 286 L 754 286", class: "motion-underline" }));
    }
  }

  function drawSummationCancellation(document, target, scene, beat) {
    const telescope = ["telescoping-zipper", "method-shape-question", "vanishing-endpoint-trap", "telescoping-sum-solution", "cancellation-fingerprint-recall"].includes(scene.id);
    if (!telescope) {
      const cards = [["시작", "k=1"], ["끝", "n"], ["항식", "k²+2k+1"], ["출력", "Σ 항"]];
      cards.forEach(([title, value], index) => {
        const x = 54 + index * 188;
        target.append(svg(document, "rect", {
          x, y: 116, width: 146, height: 108, rx: 16,
          class: index === 2 ? "motion-shape motion-shape-focus" : "motion-shape",
        }));
        appendText(document, target, title, x + 73, 155, "motion-axis-label");
        appendText(document, target, value, x + 73, 198, "motion-label");
        if (index < 3) target.append(svg(document, "path", { d: `M ${x + 152} 170 L ${x + 180} 170`, class: "motion-link" }));
      });
      appendText(document, target, "항 수 = 끝−시작+1 · 합과 상수배만 선형 분리", 400, 304, "motion-number-label");
      return;
    }
    const terms = ["1−1/2", "1/2−1/3", "1/3−1/4", "…", "1/n−1/(n+1)"];
    terms.forEach((label, index) => {
      const x = 42 + index * 150;
      target.append(svg(document, "rect", {
        x, y: 128, width: 132, height: 72, rx: 12,
        class: index === 0 || index === 4 ? "motion-shape motion-shape-focus" : "motion-shape",
      }));
      appendText(document, target, label, x + 66, 172, "motion-axis-label");
      if (index > 0 && index < 4) {
        target.append(svg(document, "path", { d: `M ${x + 12} 118 L ${x + 118} 212`, class: "motion-reference-line" }));
      }
    });
    appendText(document, target, "가운데 소거 → 1−1/(n+1) 경계만 남음", 400, 290, "motion-number-label");
  }

  function drawRecurrenceMachine(document, target, scene, beat) {
    const nodes = [[70, "씨앗", "a₁"], [300, "레시피", "aₙ₊₁=f(aₙ)"], [575, "다음 항", "aₙ₊₁"]];
    nodes.forEach(([x, title, value], index) => {
      target.append(svg(document, "rect", {
        x, y: 120, width: index === 1 ? 210 : 160, height: 112, rx: 18,
        class: index === 1 ? "motion-shape motion-shape-focus" : "motion-shape",
      }));
      appendText(document, target, title, x + (index === 1 ? 105 : 80), 160, "motion-axis-label");
      appendText(document, target, value, x + (index === 1 ? 105 : 80), 205, "motion-label");
      if (index < 2) target.append(svg(document, "path", { d: `M ${x + (index === 1 ? 218 : 168)} 176 L ${x + (index === 1 ? 266 : 222)} 176`, class: "motion-link" }));
    });
    appendText(document, target, "초기 상태 + 필요한 과거 항 + 전이 규칙", 400, 296, "motion-number-label");
    if (scene.id === "required-history-question") appendText(document, target, "앞의 두 항을 쓰면 씨앗도 두 개", 400, 330, "motion-axis-label");
  }

  function drawInductionDominoes(document, target, scene, beat) {
    const labels = ["P(1)", "P(2)", "P(3)", "…", "P(k)", "P(k+1)"];
    labels.forEach((label, index) => {
      const x = 58 + index * 120;
      const tilt = beat?.action === "verify" && index < 3 ? 12 : 0;
      const attributes = {
        x, y: 120 + tilt, width: 68, height: 132, rx: 10,
        class: index === 0 || index >= 4 ? "motion-shape motion-shape-focus" : "motion-shape",
      };
      if (tilt) attributes.transform = `rotate(8 ${x + 34} ${186 + tilt})`;
      target.append(svg(document, "rect", attributes));
      appendText(document, target, label, x + 34, 190 + tilt, "motion-axis-label");
      if (index < labels.length - 1) target.append(svg(document, "path", { d: `M ${x + 76} 180 L ${x + 112} 180`, class: "motion-link" }));
    });
    appendText(document, target, "기초 P(1) + 임의의 k에서 P(k)⇒P(k+1)", 400, 306, "motion-number-label");
    if (scene.id === "odd-sum-induction-solution") appendText(document, target, "k²+(2k+1)=(k+1)²", 400, 342, "motion-axis-label");
  }

  function drawAlgebraSequenceScene(document, target, scene, beat) {
    if (["numbered-lockers", "term-rule-question", "index-value-confusion", "general-term-and-sum-solution", "address-map-recall", "constant-step-staircase", "n-minus-one-steps", "difference-ratio-and-offbyone", "paired-arithmetic-sum", "equal-stride-recall", "constant-zoom-lens", "n-minus-one-multiplications", "geometric-middle-sign-trap", "shifted-geometric-sum", "constant-scale-recall"].includes(scene.id)) {
      drawSequenceAddressScale(document, target, scene, beat);
    } else if (["summation-conveyor", "inclusive-count-question", "false-product-linearity", "sigma-polynomial-solution", "summation-command-recall", "telescoping-zipper", "method-shape-question", "vanishing-endpoint-trap", "telescoping-sum-solution", "cancellation-fingerprint-recall"].includes(scene.id)) {
      drawSummationCancellation(document, target, scene, beat);
    } else if (["starter-and-recipe", "required-history-question", "missing-initial-condition", "recursive-table-solution", "recipe-chain-recall"].includes(scene.id)) {
      drawRecurrenceMachine(document, target, scene, beat);
    } else {
      drawInductionDominoes(document, target, scene, beat);
    }
  }

  function drawCalculusAxes(document, target, { verticalAt = 400, horizontalAt = 255 } = {}) {
    target.append(svg(document, "path", {
      d: `M 54 ${horizontalAt} L 746 ${horizontalAt} M ${verticalAt} 314 L ${verticalAt} 54`,
      class: "motion-axis",
    }));
    appendText(document, target, "x", 728, horizontalAt - 14, "motion-axis-label");
    appendText(document, target, "y", verticalAt + 18, 70, "motion-axis-label");
  }

  function drawCalculusLimitApproach(document, target, scene, beat) {
    drawCalculusAxes(document, target);
    target.append(svg(document, "path", {
      d: "M 80 280 C 170 270, 245 210, 370 132",
      class: "motion-curve",
    }));
    target.append(svg(document, "path", {
      d: "M 430 132 C 555 210, 630 270, 720 280",
      class: "motion-curve",
    }));
    target.append(svg(document, "circle", {
      cx: 400, cy: 122, r: 12, class: "motion-point",
    }));
    target.append(svg(document, "circle", {
      cx: 400, cy: 218, r: 9, class: "motion-point motion-point-focus",
    }));
    target.append(svg(document, "path", {
      d: "M 282 165 L 365 132 M 518 165 L 435 132",
      class: "motion-reference-line",
    }));
    appendText(document, target, "x→a⁻", 280, 194, "motion-axis-label");
    appendText(document, target, "x→a⁺", 520, 194, "motion-axis-label");
    appendText(document, target, "L", 422, 116, "motion-number-label");
    appendText(document, target, "f(a)", 432, 226, "motion-axis-label");
    if (/zero|substitution|factor/u.test(scene.id)) {
      target.append(svg(document, "rect", {
        x: 90, y: 68, width: 176, height: 70, rx: 14, class: "motion-shape motion-shape-focus",
      }));
      appendText(document, target, /factor/u.test(scene.id) ? "인수분해 → 약분" : "0/0 = 정리 신호", 178, 110, "motion-label");
    }
    if (["highlight", "point", "verify"].includes(beat?.action)) {
      target.append(svg(document, "circle", {
        cx: 400, cy: 122, r: 34, class: "motion-target-ring",
      }));
      target.append(svg(document, "path", { d: "M 316 156 L 484 156", class: "motion-underline" }));
    }
  }

  function drawCalculusContinuity(document, target, scene, beat) {
    drawCalculusAxes(document, target, { verticalAt: 210, horizontalAt: 268 });
    const mountain = [
      "continuous-mountain-trail", "root-between-endpoints", "sign-change-needs-continuity",
      "closed-interval-extrema", "continuity-guarantees",
    ].includes(scene.id);
    if (mountain) {
      target.append(svg(document, "path", {
        d: "M 92 264 C 170 250, 210 185, 286 212 C 360 236, 405 74, 502 104 C 598 134, 636 208, 710 154",
        class: "motion-curve",
      }));
      target.append(svg(document, "path", { d: "M 84 190 L 718 190", class: "motion-reference-line" }));
      appendText(document, target, "중간 높이 k", 650, 176, "motion-axis-label");
      [[92, 264, "a"], [405, 74, "최고"], [710, 154, "b"]].forEach(([cx, cy, label], index) => {
        target.append(svg(document, "circle", { cx, cy, r: 9, class: index === 1 ? "motion-point motion-point-focus" : "motion-point" }));
        appendText(document, target, label, cx, cy - 18, "motion-axis-label");
      });
      appendText(document, target, "닫힌구간 [a,b] · 끝점도 후보", 400, 306, "motion-number-label");
      return;
    }
    const disconnected = scene.id === "defined-is-not-continuous";
    target.append(svg(document, "path", {
      d: disconnected
        ? "M 74 250 C 166 230, 248 176, 382 146 M 424 206 C 534 170, 626 118, 724 92"
        : "M 74 250 C 190 226, 286 174, 400 156 C 514 138, 612 116, 724 92",
      class: "motion-curve",
    }));
    target.append(svg(document, "circle", {
      cx: 400, cy: disconnected ? 226 : 156, r: 11,
      class: "motion-point motion-point-focus",
    }));
    if (disconnected) target.append(svg(document, "circle", { cx: 400, cy: 156, r: 12, class: "motion-point" }));
    const gates = [[104, "정의"], [294, "좌=우"], [520, "극한=점"]];
    gates.forEach(([x, label], index) => {
      target.append(svg(document, "rect", {
        x, y: 280, width: 146, height: 48, rx: 12,
        class: index === 2 ? "motion-shape motion-shape-focus" : "motion-shape",
      }));
      appendText(document, target, label, x + 73, 311, "motion-axis-label");
    });
  }

  function drawCalculusDerivativeDefinition(document, target, scene, beat) {
    drawCalculusAxes(document, target, { verticalAt: 128, horizontalAt: 274 });
    const corner = ["road-with-a-corner", "continuity-or-differentiability", "reverse-arrow-error", "piecewise-smooth-join", "one-way-smoothness"].includes(scene.id);
    if (corner) {
      target.append(svg(document, "path", { d: "M 86 246 L 390 104 L 714 230", class: "motion-curve" }));
      target.append(svg(document, "path", { d: "M 258 168 L 404 100 M 378 100 L 548 160", class: "motion-reference-line" }));
      target.append(svg(document, "circle", { cx: 390, cy: 104, r: 11, class: "motion-point motion-point-focus" }));
      appendText(document, target, "이어짐", 250, 286, "motion-number-label");
      appendText(document, target, "좌기울기 ≠ 우기울기", 550, 286, "motion-number-label");
      return;
    }
    target.append(svg(document, "path", { d: "M 90 264 C 220 252, 330 216, 432 160 C 544 98, 642 82, 714 92", class: "motion-curve" }));
    const a = { x: 300, y: 226 };
    const b = { x: beat?.action === "verify" ? 350 : 560, y: beat?.action === "verify" ? 204 : 90 };
    target.append(svg(document, "path", { d: `M ${a.x - 84} ${a.y + 40} L ${b.x + 86} ${b.y - 42}`, class: "motion-geometry-line" }));
    [[a.x, a.y, "a"], [b.x, b.y, "a+h"]].forEach(([cx, cy, label], index) => {
      target.append(svg(document, "circle", { cx, cy, r: 10, class: index === 0 ? "motion-point motion-point-focus" : "motion-point" }));
      appendText(document, target, label, cx, cy + 28, "motion-axis-label");
    });
    appendText(document, target, "h→0 : 할선 → 접선", 510, 304, "motion-number-label");
  }

  function drawCalculusDerivativeRule(document, target, scene, beat) {
    const meanValue = ["average-speed-moment", "parabola-mean-value", "mean-value-condition-gap", "derivative-bound-change", "mean-value-bridge"].includes(scene.id);
    if (meanValue) {
      drawCalculusAxes(document, target, { verticalAt: 120, horizontalAt: 278 });
      target.append(svg(document, "path", { d: "M 94 252 C 230 246, 310 98, 446 132 C 560 160, 632 226, 714 110", class: "motion-curve" }));
      target.append(svg(document, "path", { d: "M 112 242 L 702 112", class: "motion-reference-line" }));
      target.append(svg(document, "path", { d: "M 322 164 L 520 120", class: "motion-geometry-line" }));
      appendText(document, target, "할선 평균기울기", 230, 286, "motion-number-label");
      appendText(document, target, "평행한 내부 접선", 556, 82, "motion-number-label");
      return;
    }
    const tangent = ["tangent-point-direction", "parabola-tangent-at-one", "tangent-through-origin-error", "cubic-tangent-example", "tangent-two-clues"].includes(scene.id);
    if (tangent) {
      drawCalculusAxes(document, target, { verticalAt: 156, horizontalAt: 278 });
      target.append(svg(document, "path", { d: "M 90 270 C 220 250, 346 194, 482 94 C 574 28, 654 86, 718 172", class: "motion-curve" }));
      target.append(svg(document, "path", { d: "M 270 252 L 656 44", class: "motion-geometry-line" }));
      target.append(svg(document, "circle", { cx: 470, cy: 104, r: 11, class: "motion-point motion-point-focus" }));
      appendText(document, target, "점 (a,f(a))", 354, 92, "motion-number-label");
      appendText(document, target, "방향 f′(a)", 612, 78, "motion-number-label");
      return;
    }
    const product = ["polynomial-change-parts", "termwise-polynomial", "product-of-derivatives-error", "polynomial-product-example", "polynomial-derivative-map"].includes(scene.id);
    const cards = product
      ? [["f·g", "원래 곱"], ["f′g", "첫째 변화"], ["fg′", "둘째 변화"], ["더하기", "f′g+fg′"]]
      : [["xⁿ", "원래 층"], ["n", "앞으로"], ["n−1", "한 칸 아래"], ["nxⁿ⁻¹", "도함수"]];
    cards.forEach(([value, label], index) => {
      const x = 42 + index * 190;
      target.append(svg(document, "rect", {
        x, y: 118, width: 150, height: 108, rx: 16,
        class: index === 1 || index === 2 ? "motion-shape motion-shape-focus" : "motion-shape",
      }));
      appendText(document, target, value, x + 75, 166, "motion-label");
      appendText(document, target, label, x + 75, 202, "motion-axis-label");
      if (index < 3) target.append(svg(document, "path", { d: `M ${x + 158} 172 L ${x + 182} 172`, class: "motion-link" }));
    });
    appendText(document, target, product ? "곱은 한쪽씩 변한 두 효과의 합" : "지수를 내리고, 지수를 한 칸 낮춤", 400, 286, "motion-number-label");
  }

  function drawCalculusDerivativeGraph(document, target, scene, beat) {
    const motion = ["motion-three-gauges", "motion-direction-times", "acceleration-direction-error", "motion-distance-example", "motion-derivative-chain"].includes(scene.id);
    if (motion) {
      const rows = [["위치 s", "현재 장소"], ["속도 v=s′", "방향"], ["가속도 a=v′", "속도 변화"]];
      rows.forEach(([title, copy], index) => {
        const y = 66 + index * 88;
        target.append(svg(document, "rect", { x: 96, y, width: 610, height: 64, rx: 14, class: index === 1 ? "motion-shape motion-shape-focus" : "motion-shape" }));
        appendText(document, target, title, 220, y + 39, "motion-label");
        appendText(document, target, copy, 546, y + 39, "motion-axis-label");
      });
      appendText(document, target, "v=0에서 시간축을 나눠 실제 이동거리를 더함", 400, 326, "motion-number-label");
      return;
    }
    drawCalculusAxes(document, target, { verticalAt: 90, horizontalAt: 244 });
    target.append(svg(document, "path", { d: "M 92 230 C 190 96, 306 86, 380 170 C 454 254, 564 268, 714 88", class: "motion-curve" }));
    const points = [[260, "+ → −", "극대"], [492, "− → +", "극소"]];
    points.forEach(([x, signs, label], index) => {
      const y = index === 0 ? 118 : 234;
      target.append(svg(document, "circle", { cx: x, cy: y, r: 11, class: "motion-point motion-point-focus" }));
      target.append(svg(document, "path", { d: `M ${x} 84 L ${x} 286`, class: "motion-reference-line" }));
      appendText(document, target, signs, x, 304, "motion-axis-label");
      appendText(document, target, label, x, y - 22, "motion-number-label");
    });
    appendText(document, target, "f=0은 축 교점 · f′=0은 방향 전환 후보", 522, 54, "motion-number-label");
  }

  function drawCalculusAntiderivative(document, target, scene, beat) {
    const cards = [["도함수", "f(x)"], ["되감기", "∫ dx"], ["원시함수", "F(x)+C"]];
    cards.forEach(([title, value], index) => {
      const x = 70 + index * 250;
      target.append(svg(document, "rect", { x, y: 112, width: 174, height: 108, rx: 18, class: index === 1 ? "motion-shape motion-shape-focus" : "motion-shape" }));
      appendText(document, target, title, x + 87, 150, "motion-axis-label");
      appendText(document, target, value, x + 87, 194, "motion-label");
      if (index < 2) target.append(svg(document, "path", { d: `M ${x + 182} 166 L ${x + 238} 166`, class: "motion-link" }));
    });
    [0, 1, 2].forEach((index) => {
      const y = 262 + index * 24;
      target.append(svg(document, "path", { d: `M 470 ${y} C 530 ${y - 30}, 612 ${y - 30}, 680 ${y}`, class: index === 1 ? "motion-curve" : "motion-reference-line" }));
    });
    appendText(document, target, scene.id.includes("power") || scene.id.includes("integrate") ? "지수 +1 → 새 지수로 나누기" : "+C는 세로 위치가 다른 함수 가족", 390, 326, "motion-number-label");
  }

  function drawCalculusAccumulation(document, target, scene, beat) {
    drawCalculusAxes(document, target, { verticalAt: 100, horizontalAt: 210 });
    const points = [[100, 210], [190, 138], [280, 102], [370, 146], [460, 232], [550, 274], [650, 182], [720, 118]];
    const curve = points.map(([x, y], index) => `${index ? "L" : "M"} ${x} ${y}`).join(" ");
    target.append(svg(document, "path", { d: curve, class: "motion-curve" }));
    target.append(svg(document, "path", { d: "M 100 210 L 100 210 L 190 138 L 280 102 L 370 146 L 460 210 Z", class: "motion-area-positive" }));
    target.append(svg(document, "path", { d: "M 460 210 L 460 232 L 550 274 L 650 210 Z", class: "motion-area-negative" }));
    appendText(document, target, "+ 누적", 284, 178, "motion-number-label");
    appendText(document, target, "− 누적", 552, 256, "motion-axis-label");
    if (["accumulation-endpoint-difference", "evaluate-linear-integral", "endpoint-order-error", "evaluate-polynomial-integral", "fundamental-link-memory"].includes(scene.id)) {
      target.append(svg(document, "rect", { x: 232, y: 58, width: 336, height: 62, rx: 14, class: "motion-shape motion-shape-focus" }));
      appendText(document, target, "∫ₐᵇ f(x)dx = F(b) − F(a)", 400, 98, "motion-label");
    }
  }

  function drawCalculusAreaMotion(document, target, scene, beat) {
    drawCalculusAxes(document, target, { verticalAt: 90, horizontalAt: 248 });
    const velocity = ["velocity-signed-area", "velocity-crosses-zero", "displacement-equals-distance-error", "round-trip-from-velocity", "velocity-integral-memory"].includes(scene.id);
    if (velocity) {
      target.append(svg(document, "path", { d: "M 92 248 C 180 104, 298 96, 388 248 C 470 376, 598 318, 714 248", class: "motion-curve" }));
      target.append(svg(document, "path", { d: "M 92 248 C 180 104, 298 96, 388 248 Z", class: "motion-area-positive" }));
      target.append(svg(document, "path", { d: "M 388 248 C 470 376, 598 318, 714 248 Z", class: "motion-area-negative" }));
      appendText(document, target, "∫v = 변위", 254, 148, "motion-number-label");
      appendText(document, target, "∫|v| = 거리", 548, 306, "motion-number-label");
      return;
    }
    target.append(svg(document, "path", { d: "M 96 250 C 220 96, 390 84, 704 186", class: "motion-curve" }));
    target.append(svg(document, "path", { d: "M 96 268 C 236 252, 418 194, 704 104", class: "motion-geometry-line" }));
    [170, 250, 330, 410, 490, 570, 650].forEach((x) => {
      const topY = 122 + Math.abs(390 - x) * 0.18;
      const bottomY = 250 - (x - 96) * 0.25;
      target.append(svg(document, "rect", { x, y: Math.min(topY, bottomY), width: 22, height: Math.abs(bottomY - topY), class: "motion-area-strip" }));
    });
    appendText(document, target, "띠 높이 = 위 함수 − 아래 함수", 400, 308, "motion-number-label");
  }

  function drawCalculusOneScene(document, target, scene, beat) {
    if (CALCULUS_LIMIT_APPROACH_SCENES.has(scene.id)) drawCalculusLimitApproach(document, target, scene, beat);
    else if (CALCULUS_CONTINUITY_SCENES.has(scene.id)) drawCalculusContinuity(document, target, scene, beat);
    else if (CALCULUS_DERIVATIVE_DEFINITION_SCENES.has(scene.id)) drawCalculusDerivativeDefinition(document, target, scene, beat);
    else if (CALCULUS_DERIVATIVE_RULE_SCENES.has(scene.id)) drawCalculusDerivativeRule(document, target, scene, beat);
    else if (CALCULUS_DERIVATIVE_GRAPH_SCENES.has(scene.id)) drawCalculusDerivativeGraph(document, target, scene, beat);
    else if (CALCULUS_ANTIDERIVATIVE_SCENES.has(scene.id)) drawCalculusAntiderivative(document, target, scene, beat);
    else if (CALCULUS_ACCUMULATION_SCENES.has(scene.id)) drawCalculusAccumulation(document, target, scene, beat);
    else drawCalculusAreaMotion(document, target, scene, beat);
  }

  function drawMatrixCells(document, target, config) {
    const {
      x, y, rows, columns, values, label,
      highlightRow = -1, highlightColumn = -1, highlightCell = "",
      cellWidth = 70, cellHeight = 58,
    } = config;
    appendText(document, target, label, x + columns * cellWidth / 2, y - 20, "motion-axis-label");
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        const focused = row === highlightRow
          || column === highlightColumn
          || highlightCell === `${row},${column}`;
        target.append(svg(document, "rect", {
          x: x + column * cellWidth,
          y: y + row * cellHeight,
          width: cellWidth - 6,
          height: cellHeight - 6,
          rx: 8,
          class: focused ? "motion-shape motion-shape-focus" : "motion-shape",
        }));
        appendText(
          document,
          target,
          String(values[index] ?? ""),
          x + column * cellWidth + (cellWidth - 6) / 2,
          y + row * cellHeight + 34,
          "motion-label",
        );
      }
    }
  }

  function drawMatrixGrid(document, target, scene, beat) {
    const conceptScene = [
      "matrix-table",
      "matrix-size-entry",
      "matrix-shape-trap",
      "matrix-sales-model",
      "matrix-reading-recall",
    ].includes(scene.id);
    if (conceptScene) {
      let rows = 2;
      let columns = 3;
      let values = [12, 8, 6, 5, 10, 9];
      let label = "2행 × 3열";
      if (["matrix-table", "matrix-sales-model"].includes(scene.id)) {
        columns = 2;
        values = [30, 12, 25, 18];
        label = "행: 서울·부산 / 열: 연필·공책";
      }
      if (scene.id === "matrix-shape-trap" && beat?.id === "reflow-three-by-two") {
        rows = 3;
        columns = 2;
        values = [1, 2, 3, 4, 5, 6];
        label = "3행 × 2열";
      }
      const highlightCell = /a21|translate-a21/u.test(beat?.id || "") ? "1,0" : "";
      const highlightRow = /count-rows|read-entry/u.test(beat?.id || "") ? 1 : -1;
      const highlightColumn = /count-columns/u.test(beat?.id || "") ? 2 : -1;
      const width = columns * 92;
      drawMatrixCells(document, target, {
        x: 400 - width / 2,
        y: rows === 3 ? 92 : 118,
        rows,
        columns,
        values,
        label,
        highlightRow,
        highlightColumn,
        highlightCell,
        cellWidth: 92,
        cellHeight: rows === 3 ? 64 : 76,
      });
      return;
    }

    const isScale = scene.id === "matrix-add-scale" && beat?.id === "scale-a";
    const isProduct = ["matrix-elementwise-trap", "matrix-product-computed", "matrix-order-recall"]
      .includes(scene.id);
    const a = [1, 2, 3, 4];
    const b = isProduct ? [2, 0, 1, 5] : [5, "−1", 0, 2];
    const result = isScale ? [2, 4, 6, 8]
      : isProduct ? [4, 10, 10, 20]
        : [6, 1, 3, 6];
    const selectedRow = beat?.id === "finish-product" ? 1 : /product|row-column|trace/u.test(beat?.id || "") ? 0 : -1;
    const selectedColumn = beat?.id === "compute-first-row" ? 1 : /product|row-column|trace/u.test(beat?.id || "") ? 0 : -1;
    drawMatrixCells(document, target, {
      x: 56, y: 130, rows: 2, columns: 2, values: a, label: "A",
      highlightRow: selectedRow, cellWidth: 62, cellHeight: 62,
    });
    appendText(document, target, isScale ? "×2" : isProduct ? "×" : "+", 245, 190, "motion-operator");
    if (!isScale) {
      drawMatrixCells(document, target, {
        x: 310, y: 130, rows: 2, columns: 2, values: b, label: "B",
        highlightColumn: selectedColumn, cellWidth: 62, cellHeight: 62,
      });
    }
    appendText(document, target, "=", 494, 190, "motion-operator");
    drawMatrixCells(document, target, {
      x: 560, y: 130, rows: 2, columns: 2, values: result,
      label: isScale ? "2A" : isProduct ? "AB" : "A+B",
      highlightCell: selectedRow >= 0 && selectedColumn >= 0 ? `${selectedRow},${selectedColumn}` : "",
      cellWidth: 62,
      cellHeight: 62,
    });
  }

  function drawGeometryCourseConic(document, target, scene, beat) {
    if (GEOMETRY_PARABOLA_SCENES.has(scene.id)) {
      target.append(svg(document, "path", { d: "M 146 64 L 146 314", class: "motion-reference-line" }));
      target.append(svg(document, "path", {
        d: "M 250 44 C 560 92, 560 272, 250 320",
        class: "motion-curve",
      }));
      target.append(svg(document, "circle", { cx: 340, cy: 182, r: 10, class: "motion-point motion-point-focus" }));
      const moving = { x: 452, y: 102 };
      target.append(svg(document, "circle", { cx: moving.x, cy: moving.y, r: 9, class: "motion-point" }));
      target.append(svg(document, "path", { d: `M ${moving.x} ${moving.y} L 340 182 M ${moving.x} ${moving.y} L 146 ${moving.y}`, class: "motion-link motion-link-guide" }));
      appendText(document, target, "준선 x=−p", 146, 336, "motion-axis-label");
      appendText(document, target, "초점 F(p,0)", 340, 210, "motion-axis-label");
      appendText(document, target, "두 거리 = 같음", 600, 82, "motion-number-label");
      if (["highlight", "verify"].includes(beat?.action)) {
        target.append(svg(document, "path", { d: "M 302 224 L 520 224", class: "motion-underline" }));
      }
      return;
    }

    if (GEOMETRY_ELLIPSE_SCENES.has(scene.id)) {
      target.append(svg(document, "ellipse", { cx: 400, cy: 182, rx: 252, ry: 118, class: "motion-geometry" }));
      const point = { x: 500, y: 78 };
      [[280, "F₁"], [520, "F₂"]].forEach(([x, label]) => {
        target.append(svg(document, "circle", { cx: x, cy: 182, r: 9, class: "motion-point motion-point-focus" }));
        appendText(document, target, label, x, 210, "motion-axis-label");
        target.append(svg(document, "path", { d: `M ${point.x} ${point.y} L ${x} 182`, class: "motion-link motion-link-guide" }));
      });
      target.append(svg(document, "circle", { cx: point.x, cy: point.y, r: 9, class: "motion-point" }));
      appendText(document, target, "PF₁ + PF₂ = 2a", 400, 334, "motion-number-label");
      appendText(document, target, "c² = a² − b²", 620, 62, "motion-number-label");
      return;
    }

    if (GEOMETRY_HYPERBOLA_SCENES.has(scene.id)) {
      target.append(svg(document, "path", { d: "M 400 182 L 118 44 M 400 182 L 682 320 M 400 182 L 682 44 M 400 182 L 118 320", class: "motion-reference-line" }));
      target.append(svg(document, "path", { d: "M 74 62 C 190 92, 222 132, 254 182 C 222 232, 190 272, 74 302", class: "motion-curve" }));
      target.append(svg(document, "path", { d: "M 726 62 C 610 92, 578 132, 546 182 C 578 232, 610 272, 726 302", class: "motion-curve" }));
      [[226, "F₁"], [574, "F₂"]].forEach(([x, label]) => {
        target.append(svg(document, "circle", { cx: x, cy: 182, r: 9, class: "motion-point motion-point-focus" }));
        appendText(document, target, label, x, 210, "motion-axis-label");
      });
      appendText(document, target, "|PF₁ − PF₂| = 2a", 400, 338, "motion-number-label");
      appendText(document, target, "c² = a² + b²", 620, 54, "motion-number-label");
      return;
    }

    target.append(svg(document, "path", { d: "M 88 292 C 230 274, 332 208, 430 96", class: "motion-curve" }));
    const tangentY = beat?.action === "verify" ? 162 : 188;
    target.append(svg(document, "path", { d: `M 124 ${tangentY + 96} L 684 ${tangentY - 86}`, class: "motion-geometry-line" }));
    target.append(svg(document, "circle", { cx: 396, cy: 172, r: 10, class: "motion-point motion-point-focus" }));
    const cards = [["교점 2", "D>0"], ["접점 1", "D=0"], ["교점 0", "D<0"]];
    cards.forEach(([label, result], index) => {
      const x = 456 + index * 104;
      target.append(svg(document, "rect", { x, y: 244, width: 92, height: 68, rx: 11, class: index === 1 ? "motion-shape motion-shape-focus" : "motion-shape" }));
      appendText(document, target, label, x + 46, 270, "motion-axis-label");
      appendText(document, target, result, x + 46, 296, "motion-label");
    });
    appendText(document, target, "연립 → 한 문자 이차식 → 중근", 300, 54, "motion-number-label");
  }

  function drawGeometryCourseSpace(document, target, scene, beat) {
    if (GEOMETRY_SPACE_RELATION_SCENES.has(scene.id)) {
      const front = [[152, 126], [428, 126], [428, 292], [152, 292]];
      const back = front.map(([x, y]) => [x + 142, y - 72]);
      [front, back].forEach((face) => target.append(svg(document, "path", {
        d: `M ${face[0][0]} ${face[0][1]} L ${face[1][0]} ${face[1][1]} L ${face[2][0]} ${face[2][1]} L ${face[3][0]} ${face[3][1]} Z`,
        class: "motion-geometry-line",
      })));
      front.forEach(([x, y], index) => target.append(svg(document, "path", { d: `M ${x} ${y} L ${back[index][0]} ${back[index][1]}`, class: "motion-link motion-link-guide" })));
      target.append(svg(document, "path", { d: "M 152 126 L 428 126", class: "motion-underline" }));
      target.append(svg(document, "path", { d: "M 294 54 L 570 220", class: "motion-reference-line" }));
      appendText(document, target, "공유점? 같은 방향? 같은 평면?", 400, 334, "motion-number-label");
      appendText(document, target, "꼬인 위치", 650, 118, "motion-axis-label");
      return;
    }

    if (GEOMETRY_THREE_PERPENDICULAR_SCENES.has(scene.id)) {
      target.append(svg(document, "path", { d: "M 120 246 L 604 246 L 706 308 L 222 308 Z", class: "motion-geometry" }));
      const p = { x: 338, y: 64 }, h = { x: 338, y: 258 }, q = { x: 574, y: 258 };
      target.append(svg(document, "path", { d: `M ${p.x} ${p.y} L ${h.x} ${h.y} L ${q.x} ${q.y} M ${p.x} ${p.y} L ${q.x} ${q.y}`, class: "motion-geometry-line" }));
      target.append(svg(document, "path", { d: "M 574 258 L 674 304", class: "motion-reference-line" }));
      [[p, "P"], [h, "H"], [q, "Q"]].forEach(([point, label]) => {
        target.append(svg(document, "circle", { cx: point.x, cy: point.y, r: 8, class: "motion-point motion-point-focus" }));
        appendText(document, target, label, point.x - 18, point.y - 10, "motion-axis-label");
      });
      appendText(document, target, "PH ⟂ 평면 · HQ ⟂ l ⇒ PQ ⟂ l", 400, 336, "motion-number-label");
      return;
    }

    if (GEOMETRY_PROJECTION_SCENES.has(scene.id)) {
      target.append(svg(document, "path", { d: "M 94 270 L 690 270 L 742 314 L 146 314 Z", class: "motion-geometry" }));
      target.append(svg(document, "path", { d: "M 206 270 L 600 74", class: "motion-geometry-line" }));
      target.append(svg(document, "path", { d: "M 206 270 L 600 270 M 600 74 L 600 270", class: "motion-link motion-link-guide" }));
      appendText(document, target, "원래 길이 L", 470, 132, "motion-number-label");
      appendText(document, target, "정사영 L cosθ", 404, 296, "motion-number-label");
      appendText(document, target, "θ", 260, 246, "motion-label");
      if (["highlight", "verify"].includes(beat?.action)) target.append(svg(document, "path", { d: "M 214 282 L 594 282", class: "motion-underline" }));
      return;
    }

    if (GEOMETRY_SPACE_COORDINATE_SCENES.has(scene.id)) {
      const o = { x: 280, y: 250 };
      target.append(svg(document, "path", { d: `M ${o.x} ${o.y} L 704 250 M ${o.x} ${o.y} L 108 318 M ${o.x} ${o.y} L 280 52`, class: "motion-axis" }));
      appendText(document, target, "x", 690, 238, "motion-axis-label");
      appendText(document, target, "y", 118, 306, "motion-axis-label");
      appendText(document, target, "z", 298, 68, "motion-axis-label");
      const a = { x: 362, y: 218 }, b = { x: 594, y: 108 }, p = { x: 516, y: 145 };
      target.append(svg(document, "path", { d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, class: "motion-geometry-line" }));
      [[a, "A"], [p, "P"], [b, "B"]].forEach(([point, label], index) => {
        target.append(svg(document, "circle", { cx: point.x, cy: point.y, r: index === 1 ? 10 : 8, class: index === 1 ? "motion-point motion-point-focus" : "motion-point" }));
        appendText(document, target, label, point.x, point.y - 18, "motion-axis-label");
      });
      appendText(document, target, "거리: Δx²+Δy²+Δz²의 제곱근", 474, 326, "motion-number-label");
      appendText(document, target, "내분: 반대편 비로 가중", 554, 62, "motion-axis-label");
      return;
    }

    target.append(svg(document, "ellipse", { cx: 390, cy: 182, rx: 174, ry: 174, class: "motion-geometry" }));
    target.append(svg(document, "ellipse", { cx: 390, cy: 182, rx: 174, ry: 62, class: "motion-reference-line" }));
    target.append(svg(document, "ellipse", { cx: 390, cy: 182, rx: 62, ry: 174, class: "motion-reference-line" }));
    target.append(svg(document, "circle", { cx: 390, cy: 182, r: 9, class: "motion-point motion-point-focus" }));
    target.append(svg(document, "path", { d: "M 390 182 L 524 78", class: "motion-geometry-line" }));
    appendText(document, target, "중심 C(a,b,c)", 390, 214, "motion-axis-label");
    appendText(document, target, "반지름 r", 500, 116, "motion-axis-label");
    appendText(document, target, "(x−a)²+(y−b)²+(z−c)²=r²", 400, 336, "motion-number-label");
  }

  function drawGeometryCourseVector(document, target, scene, beat) {
    if (GEOMETRY_VECTOR_OPERATION_SCENES.has(scene.id)) {
      target.append(svg(document, "path", { d: "M 96 264 L 328 108 M 328 108 L 616 178 M 96 264 L 616 178", class: "motion-geometry-line" }));
      appendText(document, target, "a", 206, 168, "motion-label");
      appendText(document, target, "b", 474, 126, "motion-label");
      appendText(document, target, "a+b", 372, 238, "motion-number-label");
      appendText(document, target, "끝에 시작을 붙이고 처음→마지막", 400, 330, "motion-number-label");
      if (beat?.action === "verify") target.append(svg(document, "path", { d: "M 94 282 L 618 196", class: "motion-underline" }));
      return;
    }

    if (GEOMETRY_POSITION_VECTOR_SCENES.has(scene.id)) {
      const o = { x: 112, y: 280 }, a = { x: 344, y: 188 }, b = { x: 646, y: 82 };
      target.append(svg(document, "path", { d: `M ${o.x} ${o.y} L ${a.x} ${a.y} M ${o.x} ${o.y} L ${b.x} ${b.y} M ${a.x} ${a.y} L ${b.x} ${b.y}`, class: "motion-geometry-line" }));
      [[o, "O"], [a, "A"], [b, "B"]].forEach(([point, label]) => {
        target.append(svg(document, "circle", { cx: point.x, cy: point.y, r: 9, class: "motion-point motion-point-focus" }));
        appendText(document, target, label, point.x, point.y + 28, "motion-axis-label");
      });
      appendText(document, target, "AB = OB − OA = B − A", 430, 326, "motion-number-label");
      return;
    }

    if (GEOMETRY_DOT_PRODUCT_SCENES.has(scene.id)) {
      const o = { x: 136, y: 274 }, a = { x: 660, y: 274 }, b = { x: 488, y: 78 };
      target.append(svg(document, "path", { d: `M ${o.x} ${o.y} L ${a.x} ${a.y} M ${o.x} ${o.y} L ${b.x} ${b.y}`, class: "motion-geometry-line" }));
      target.append(svg(document, "path", { d: `M ${b.x} ${b.y} L ${b.x} ${o.y}`, class: "motion-link motion-link-guide" }));
      target.append(svg(document, "rect", { x: 470, y: 256, width: 18, height: 18, class: "motion-shape motion-shape-focus" }));
      appendText(document, target, "a 방향 그림자", 386, 310, "motion-number-label");
      appendText(document, target, "a·b = |a||b|cosθ", 430, 52, "motion-number-label");
      appendText(document, target, "θ", 206, 252, "motion-label");
      return;
    }

    if (GEOMETRY_LINE_SCENES.has(scene.id)) {
      target.append(svg(document, "path", { d: "M 90 292 L 710 72", class: "motion-geometry-line" }));
      const points = [[214, 248, "t=−1"], [400, 182, "P₀"], [586, 116, "t=1"]];
      points.forEach(([cx, cy, label], index) => {
        target.append(svg(document, "circle", { cx, cy, r: index === 1 ? 10 : 8, class: index === 1 ? "motion-point motion-point-focus" : "motion-point" }));
        appendText(document, target, label, cx, cy - 20, "motion-axis-label");
      });
      appendText(document, target, "X = P₀ + t d", 400, 330, "motion-number-label");
      appendText(document, target, "한 점 + 같은 방향의 배수", 400, 54, "motion-axis-label");
      return;
    }

    target.append(svg(document, "path", { d: "M 88 246 L 596 246 L 720 314 L 212 314 Z", class: "motion-geometry" }));
    const p = { x: 356, y: 270 };
    target.append(svg(document, "path", { d: `M ${p.x} ${p.y} L 494 76`, class: "motion-geometry-line" }));
    target.append(svg(document, "circle", { cx: p.x, cy: p.y, r: 9, class: "motion-point motion-point-focus" }));
    appendText(document, target, "법선 n=(a,b,c)", 520, 92, "motion-number-label");
    appendText(document, target, "n·(X−P)=0", 390, 338, "motion-number-label");
    target.append(svg(document, "ellipse", { cx: 628, cy: 180, rx: 76, ry: 76, class: "motion-reference-line" }));
    appendText(document, target, "고정 거리 r", 628, 184, "motion-axis-label");
  }

  function drawGeometryCourseScene(document, target, scene, beat) {
    if (
      GEOMETRY_PARABOLA_SCENES.has(scene.id)
      || GEOMETRY_ELLIPSE_SCENES.has(scene.id)
      || GEOMETRY_HYPERBOLA_SCENES.has(scene.id)
      || GEOMETRY_TANGENT_SCENES.has(scene.id)
    ) {
      drawGeometryCourseConic(document, target, scene, beat);
    } else if (
      GEOMETRY_SPACE_RELATION_SCENES.has(scene.id)
      || GEOMETRY_THREE_PERPENDICULAR_SCENES.has(scene.id)
      || GEOMETRY_PROJECTION_SCENES.has(scene.id)
      || GEOMETRY_SPACE_COORDINATE_SCENES.has(scene.id)
      || GEOMETRY_SPHERE_SCENES.has(scene.id)
    ) {
      drawGeometryCourseSpace(document, target, scene, beat);
    } else {
      drawGeometryCourseVector(document, target, scene, beat);
    }
  }

  function drawPracticalInquiry(document, target, scene, beat) {
    if (PRACTICAL_VARIATION_SCENES.has(scene.id)) {
      target.append(svg(document, "path", { d: "M 80 286 L 720 286", class: "motion-axis" }));
      const routes = [
        { y: 126, label: "노선 A", values: [126, 158, 192, 238, 274, 306, 350] },
        { y: 224, label: "노선 B", values: [164, 212, 258, 304, 350, 396, 442] },
      ];
      routes.forEach((route, row) => {
        appendText(document, target, route.label, 108, route.y + 6, "motion-axis-label");
        route.values.forEach((x, index) => target.append(svg(document, "circle", {
          cx: x + row * (index % 2) * 8,
          cy: route.y + ((index % 3) - 1) * (row ? 18 : 8),
          r: row ? 8 : 9,
          class: row ? "motion-sample-dot" : "motion-point motion-point-focus",
        })));
      });
      target.append(svg(document, "path", { d: "M 126 86 L 350 86 M 164 258 L 450 258", class: "motion-reference-line" }));
      appendText(document, target, "중심만 말고 흔들림까지 비교", 520, 324, "motion-number-label");
      return;
    }

    const reverse = scene.id.includes("rewind") || scene.id.includes("audit") || scene.id.includes("reflection");
    const labels = reverse ? ["결론", "분석", "자료", "질문"] : ["질문", "자료", "분석", "결정"];
    labels.forEach((label, index) => {
      const x = 42 + index * 190;
      target.append(svg(document, "rect", {
        x, y: 128, width: 146, height: 98, rx: 18,
        class: index === (beat?.action === "verify" ? 3 : 0) ? "motion-shape motion-shape-focus" : "motion-shape",
      }));
      appendText(document, target, String(index + 1), x + 28, 158, "motion-axis-label");
      appendText(document, target, label, x + 73, 190, "motion-label");
      if (index < labels.length - 1) target.append(svg(document, "path", { d: `M ${x + 152} 178 L ${x + 182} 178`, class: reverse ? "motion-reference-line" : "motion-link" }));
    });
    appendText(document, target, reverse ? "결론에서 질문까지 거꾸로 근거 확인" : "방법보다 질문이 먼저 · 결정 기준은 미리", 400, 300, "motion-number-label");
  }

  function drawPracticalDataDesign(document, target, scene, beat) {
    if (PRACTICAL_SCALE_SCENES.has(scene.id)) {
      const scales = [["명목", "분류"], ["서열", "순서"], ["등간", "차이"], ["비율", "비율"]];
      scales.forEach(([name, allowed], index) => {
        const x = 42 + index * 190;
        target.append(svg(document, "rect", {
          x, y: 112, width: 146, height: 132, rx: 18,
          class: index === 1 ? "motion-shape motion-shape-focus" : "motion-shape",
        }));
        appendText(document, target, name, x + 73, 160, "motion-label");
        appendText(document, target, `허용: ${allowed}`, x + 73, 210, "motion-axis-label");
      });
      appendText(document, target, "숫자 모양보다 척도가 허용하는 계산", 400, 302, "motion-number-label");
      return;
    }

    const lenses = [["관찰", "있는 그대로"], ["설문", "기억·표현"], ["실험", "원인 비교"]];
    lenses.forEach(([name, detail], index) => {
      const x = 104 + index * 218;
      target.append(svg(document, "circle", {
        cx: x, cy: 166, r: 66,
        class: index === 2 ? "motion-point motion-point-focus" : "motion-point",
      }));
      appendText(document, target, name, x, 160, "motion-label");
      appendText(document, target, detail, x, 196, "motion-axis-label");
    });
    target.append(svg(document, "path", { d: "M 78 270 L 722 270", class: "motion-reference-line" }));
    appendText(document, target, scene.id.includes("leading") ? "유도 질문·회상 편향을 먼저 제거" : "설명인가, 원인인가에 맞춰 렌즈 선택", 400, 306, "motion-number-label");
  }

  function drawPracticalDescriptive(document, target, scene, beat) {
    if (PRACTICAL_GRAPH_SCENES.has(scene.id)) {
      target.append(svg(document, "path", { d: "M 86 286 L 720 286 M 86 286 L 86 70", class: "motion-axis" }));
      [74, 132, 188, 112, 166].forEach((height, index) => {
        target.append(svg(document, "rect", {
          x: 132 + index * 108, y: 286 - height, width: 58, height, rx: 7,
          class: index === 2 ? "motion-bar motion-bar-focus" : "motion-bar",
        }));
      });
      if (scene.id === "cropped-axis-distortion") {
        target.append(svg(document, "path", { d: "M 74 240 L 98 226 L 74 212 L 98 198", class: "motion-reference-line" }));
        appendText(document, target, "0을 자르면 차이가 과장됨", 476, 60, "motion-number-label");
      } else appendText(document, target, "질문에 맞는 그래프 · 축과 단위 공개", 400, 326, "motion-number-label");
      return;
    }

    const rows = [
      { y: 128, values: [246, 278, 310, 342, 374, 406, 438, 470, 502, 534], label: "배달 A" },
      { y: 232, values: [144, 210, 272, 334, 400, 466, 528, 590, 652], label: "배달 B" },
    ];
    rows.forEach((row, rowIndex) => {
      appendText(document, target, row.label, 108, row.y + 6, "motion-axis-label");
      row.values.forEach((x) => target.append(svg(document, "circle", {
        cx: x, cy: row.y, r: 8,
        class: rowIndex ? "motion-sample-dot" : "motion-point motion-point-focus",
      })));
      target.append(svg(document, "path", { d: `M 400 ${row.y - 34} L 400 ${row.y + 34}`, class: "motion-reference-line" }));
    });
    appendText(document, target, "평균은 같아도 흩어짐은 다름", 400, 318, "motion-number-label");
  }

  function drawPracticalDistribution(document, target, _scene, _beat) {
    target.append(svg(document, "path", { d: "M 74 286 L 726 286", class: "motion-axis" }));
    target.append(svg(document, "path", {
      d: "M 82 282 C 220 280, 278 82, 400 82 C 522 82, 580 280, 718 282",
      class: "motion-curve",
    }));
    target.append(svg(document, "path", {
      d: "M 82 270 C 188 252, 252 118, 400 118 C 548 118, 612 252, 718 270",
      class: "motion-reference-line",
    }));
    appendText(document, target, "정규분포", 400, 62, "motion-number-label");
    appendText(document, target, "t분포: 꼬리가 더 두꺼움", 560, 236, "motion-axis-label");
    appendText(document, target, "표본이 작고 σ를 모르면 t", 400, 326, "motion-number-label");
  }

  function drawPracticalInterval(document, target, scene, beat) {
    const parameter = PRACTICAL_INTERVAL_SCENES.has(scene.id) && scene.id.includes("proportion") ? "모비율 p" : "모평균 μ";
    target.append(svg(document, "path", { d: "M 92 186 L 708 186", class: "motion-axis" }));
    target.append(svg(document, "path", { d: "M 402 54 L 402 310", class: "motion-reference-line" }));
    appendText(document, target, parameter, 402, 40, "motion-number-label");
    [
      [280, 492], [328, 468], [366, 446], [430, 566], [492, 622], [536, 682],
    ].forEach(([start, end], index) => {
      const y = 86 + index * 39;
      target.append(svg(document, "path", {
        d: `M ${start} ${y} L ${end} ${y}`,
        class: start <= 402 && end >= 402 ? "motion-confidence-hit" : "motion-confidence-miss",
      }));
      target.append(svg(document, "circle", { cx: (start + end) / 2, cy: y, r: 7, class: "motion-sample-dot" }));
    });
    appendText(document, target, beat?.action === "verify" ? "반복 표본의 구간들이 참값을 덮는 비율" : "추정값 ± 오차한계", 400, 326, "motion-number-label");
  }

  function drawPracticalHypothesis(document, target, _scene, beat) {
    target.append(svg(document, "path", { d: "M 74 286 L 726 286", class: "motion-axis" }));
    target.append(svg(document, "path", {
      d: "M 82 282 C 212 278, 276 92, 400 92 C 524 92, 588 278, 718 282",
      class: "motion-curve",
    }));
    target.append(svg(document, "path", { d: "M 590 286 L 590 154", class: "motion-reference-line" }));
    target.append(svg(document, "rect", { x: 590, y: 154, width: 128, height: 132, rx: 8, class: "motion-group-focus" }));
    target.append(svg(document, "circle", { cx: 624, cy: 236, r: 10, class: "motion-point motion-point-focus" }));
    appendText(document, target, "H₀가 맞는 세계", 400, 70, "motion-number-label");
    appendText(document, target, "관측값보다 극단적인 꼬리 = p값", 548, 324, "motion-number-label");
    if (beat?.action === "verify") appendText(document, target, "p≤α일 때만 H₀ 기각", 226, 128, "motion-label");
  }

  function drawPracticalStatisticsScene(document, target, scene, beat) {
    if (PRACTICAL_VARIATION_SCENES.has(scene.id) || PRACTICAL_INQUIRY_SCENES.has(scene.id)) drawPracticalInquiry(document, target, scene, beat);
    else if (PRACTICAL_SAMPLING_SCENES.has(scene.id) || PRACTICAL_INTERVAL_SCENES.has(scene.id)) {
      if (PRACTICAL_SAMPLING_SCENES.has(scene.id)) drawProbabilityInference(document, target, scene, beat);
      else drawPracticalInterval(document, target, scene, beat);
    } else if (PRACTICAL_SCALE_SCENES.has(scene.id) || PRACTICAL_COLLECTION_SCENES.has(scene.id)) drawPracticalDataDesign(document, target, scene, beat);
    else if (PRACTICAL_GRAPH_SCENES.has(scene.id) || PRACTICAL_CENTER_SPREAD_SCENES.has(scene.id)) drawPracticalDescriptive(document, target, scene, beat);
    else if (PRACTICAL_NORMAL_T_SCENES.has(scene.id)) drawPracticalDistribution(document, target, scene, beat);
    else drawPracticalHypothesis(document, target, scene, beat);
  }

  function drawEconomicsFinance(document, target, scene, beat) {
    if (ECON_INDEX_SCENES.has(scene.id)) {
      target.append(svg(document, "path", { d: "M 86 288 L 720 288 M 86 288 L 86 66", class: "motion-axis" }));
      [100, 118, 132, 140].forEach((value, index) => {
        const height = value * 1.35;
        target.append(svg(document, "rect", {
          x: 146 + index * 130, y: 288 - height, width: 76, height, rx: 9,
          class: index === 0 || index === 3 ? "motion-bar motion-bar-focus" : "motion-bar",
        }));
        appendText(document, target, String(value), 184 + index * 130, 310 - height, "motion-axis-label");
      });
      target.append(svg(document, "path", { d: "M 110 153 L 694 153", class: "motion-reference-line" }));
      appendText(document, target, "기준시점 = 100", 620, 142, "motion-number-label");
      appendText(document, target, "수준 · 변화량 · 변화율 · 기준시점", 400, 334, "motion-number-label");
      return;
    }

    if (ECON_EXCHANGE_SCENES.has(scene.id)) {
      const cards = [["1 USD", "₩1,350"], ["100 USD", "₩135,000"]];
      cards.forEach(([unit, value], index) => {
        const x = 96 + index * 392;
        target.append(svg(document, "rect", { x, y: 112, width: 216, height: 126, rx: 20, class: index ? "motion-shape motion-shape-focus" : "motion-shape" }));
        appendText(document, target, unit, x + 108, 154, "motion-axis-label");
        appendText(document, target, value, x + 108, 205, "motion-label");
      });
      target.append(svg(document, "path", { d: "M 326 175 L 468 175", class: "motion-link" }));
      appendText(document, target, "달러 × (원/달러) = 원", 400, 300, "motion-number-label");
      appendText(document, target, "단위 화살표를 먼저 맞춘다", 400, 334, "motion-axis-label");
      return;
    }

    if (ECON_TAX_SCENES.has(scene.id)) {
      const boxes = [["과세표준", "3,000"], ["세율 규칙", "구간별"], ["세액", "합산"]];
      boxes.forEach(([label, value], index) => {
        const x = 44 + index * 254;
        target.append(svg(document, "rect", { x, y: 122, width: 202, height: 112, rx: 18, class: index === 1 ? "motion-shape motion-shape-focus" : "motion-shape" }));
        appendText(document, target, label, x + 101, 158, "motion-axis-label");
        appendText(document, target, value, x + 101, 204, "motion-label");
        if (index < 2) target.append(svg(document, "path", { d: `M ${x + 208} 178 L ${x + 246} 178`, class: "motion-link" }));
      });
      appendText(document, target, "전체 금액 × 마지막 세율이 아니다", 400, 294, "motion-number-label");
      appendText(document, target, "표준 → 구간 규칙 → 세액", 400, 332, "motion-axis-label");
      return;
    }

    const annuity = ECON_ANNUITY_SCENES.has(scene.id);
    target.append(svg(document, "path", { d: "M 86 216 L 714 216", class: "motion-axis" }));
    [0, 1, 2, 3].forEach((period) => {
      const x = 118 + period * 172;
      target.append(svg(document, "path", { d: `M ${x} 198 L ${x} 234`, class: "motion-reference-line" }));
      appendText(document, target, `t=${period}`, x, 258, "motion-axis-label");
      if (annuity && period > 0) {
        target.append(svg(document, "circle", { cx: x, cy: 152, r: 24, class: "motion-point motion-point-focus" }));
        appendText(document, target, "C", x, 158, "motion-label");
      }
    });
    if (annuity) {
      [290, 462, 634].forEach((x) => target.append(svg(document, "path", { d: `M ${x} 146 C ${x - 72} 82, 176 82, 118 136`, class: "motion-reference-line" })));
      appendText(document, target, "각 현금흐름을 같은 시점으로 옮겨 더한다", 400, 318, "motion-number-label");
    } else {
      target.append(svg(document, "path", { d: "M 118 150 C 286 74, 500 74, 634 150", class: "motion-link" }));
      appendText(document, target, "현재가치 × (1+i)ⁿ = 미래가치", 400, 122, "motion-number-label");
      appendText(document, target, "이율과 기간 단위를 먼저 맞춘다", 400, 318, "motion-number-label");
    }
  }

  function drawEconomicsMarket(document, target, scene, beat) {
    if (ECON_FUNCTION_SCENES.has(scene.id)) {
      const cards = [["입력 q", "판매량"], ["규칙 C(q)", "고정비+변동비"], ["출력", "총비용"]];
      cards.forEach(([label, value], index) => {
        const x = 42 + index * 254;
        target.append(svg(document, "rect", { x, y: 120, width: 202, height: 118, rx: 18, class: index === 1 ? "motion-shape motion-shape-focus" : "motion-shape" }));
        appendText(document, target, label, x + 101, 158, "motion-axis-label");
        appendText(document, target, value, x + 101, 207, "motion-label");
        if (index < 2) target.append(svg(document, "path", { d: `M ${x + 208} 178 L ${x + 246} 178`, class: "motion-link" }));
      });
      appendText(document, target, "관련 있어 보임 ≠ 입력마다 하나의 출력 규칙", 400, 308, "motion-number-label");
      return;
    }

    target.append(svg(document, "path", { d: "M 92 294 L 714 294 M 92 294 L 92 54", class: "motion-axis" }));
    if (ECON_UTILITY_SCENES.has(scene.id)) {
      target.append(svg(document, "path", { d: "M 100 286 C 198 166, 340 98, 686 76", class: "motion-curve" }));
      const points = [[178, 206], [330, 126], [520, 88]];
      points.forEach(([x, y], index) => {
        target.append(svg(document, "circle", { cx: x, cy: y, r: 9, class: index === 1 ? "motion-point motion-point-focus" : "motion-point" }));
        target.append(svg(document, "path", { d: `M ${x - 54} ${y + 26} L ${x + 54} ${y - 26}`, class: "motion-reference-line" }));
      });
      appendText(document, target, "높이 = 총효용 · 접선 기울기 = 한계효용", 444, 326, "motion-number-label");
      return;
    }

    target.append(svg(document, "path", { d: "M 124 76 L 674 278", class: "motion-curve" }));
    target.append(svg(document, "path", { d: "M 126 278 L 672 80", class: "motion-geometry-line" }));
    const shifted = scene.id.includes("move") || scene.id.includes("tax") || scene.id.includes("income") || scene.id.includes("cause");
    if (shifted) target.append(svg(document, "path", { d: "M 190 278 L 736 80", class: "motion-reference-line" }));
    target.append(svg(document, "circle", { cx: shifted ? 444 : 400, cy: shifted ? 164 : 177, r: 11, class: "motion-point motion-point-focus" }));
    appendText(document, target, "가격 P", 80, 70, "motion-axis-label");
    appendText(document, target, "수량 Q", 700, 318, "motion-axis-label");
    appendText(document, target, shifted ? "원인이 바뀌면 곡선 전체가 이동" : "수요량=공급량인 좌표를 읽는다", 442, 330, "motion-number-label");
  }

  function drawEconomicsLinearMatrix(document, target, scene, beat) {
    if (ECON_LINEAR_PROGRAM_SCENES.has(scene.id)) {
      target.append(svg(document, "path", { d: "M 94 292 L 714 292 M 94 292 L 94 54", class: "motion-axis" }));
      target.append(svg(document, "path", { d: "M 108 268 L 622 78 M 108 112 L 624 268", class: "motion-geometry-line" }));
      target.append(svg(document, "path", { d: "M 108 268 L 108 112 L 366 182 L 510 226 Z", class: "motion-group-focus" }));
      [[108, 268], [108, 112], [366, 182], [510, 226]].forEach(([cx, cy], index) => {
        target.append(svg(document, "circle", { cx, cy, r: index === 2 ? 11 : 8, class: index === 2 ? "motion-point motion-point-focus" : "motion-point" }));
      });
      appendText(document, target, "가능영역의 꼭짓점에서 목적함수 비교", 430, 330, "motion-number-label");
      return;
    }

    const cells = [["서울", "30", "12"], ["부산", "25", "18"]];
    cells.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
      const x = 126 + columnIndex * 150;
      const y = 110 + rowIndex * 92;
      target.append(svg(document, "rect", { x, y, width: 134, height: 76, rx: 12, class: columnIndex === 0 ? "motion-shape" : rowIndex === 0 ? "motion-shape motion-shape-focus" : "motion-shape" }));
      appendText(document, target, value, x + 67, y + 45, columnIndex === 0 ? "motion-axis-label" : "motion-label");
    }));
    appendText(document, target, "행·열 이름을 계산 끝까지 보존", 520, 114, "motion-number-label");
    appendText(document, target, ECON_MATRIX_SCENES.has(scene.id) && (scene.id.includes("undo") || scene.id.includes("determinant") || scene.id.includes("recover")) ? "역행렬: 섞은 규칙을 되돌리는 문" : "행×열은 원래 단위의 의미를 연결", 500, 294, "motion-number-label");
    if (["undo-mixing-machine", "compress-and-recover"].includes(scene.id)) target.append(svg(document, "path", { d: "M 580 170 L 706 170 M 676 150 L 706 170 L 676 190", class: "motion-link" }));
  }

  function drawEconomicsMarginal(document, target, scene, beat) {
    target.append(svg(document, "path", { d: "M 88 294 L 718 294 M 88 294 L 88 54", class: "motion-axis" }));
    target.append(svg(document, "path", { d: "M 104 274 C 224 246, 322 92, 448 112 C 564 132, 642 232, 704 280", class: "motion-curve" }));
    if (ECON_ELASTICITY_SCENES.has(scene.id)) {
      target.append(svg(document, "path", { d: "M 208 238 L 612 134", class: "motion-geometry-line" }));
      target.append(svg(document, "path", { d: "M 330 246 L 330 208 L 482 208", class: "motion-reference-line" }));
      appendText(document, target, "탄력성 = 수량 변화율 ÷ 가격 변화율", 438, 328, "motion-number-label");
      appendText(document, target, "기울기만 보면 단위에 속는다", 544, 80, "motion-axis-label");
      return;
    }

    if (ECON_OPTIMUM_SCENES.has(scene.id)) {
      target.append(svg(document, "path", { d: "M 446 294 L 446 106", class: "motion-reference-line" }));
      target.append(svg(document, "circle", { cx: 446, cy: 112, r: 11, class: "motion-point motion-point-focus" }));
      appendText(document, target, "MR = MC", 446, 80, "motion-label");
      appendText(document, target, "정지점 + 정의역 + 끝점까지 비교", 430, 330, "motion-number-label");
      return;
    }

    const x = beat?.action === "verify" ? 526 : 348;
    const y = beat?.action === "verify" ? 156 : 128;
    target.append(svg(document, "path", { d: `M ${x - 100} ${y + 54} L ${x + 100} ${y - 54}`, class: "motion-geometry-line" }));
    target.append(svg(document, "circle", { cx: x, cy: y, r: 10, class: "motion-point motion-point-focus" }));
    appendText(document, target, "한계량 = 총량 곡선의 그 점 접선 기울기", 444, 328, "motion-number-label");
  }

  function drawEconomicsMathScene(document, target, scene, beat) {
    if (ECON_INDEX_SCENES.has(scene.id) || ECON_EXCHANGE_SCENES.has(scene.id) || ECON_TAX_SCENES.has(scene.id) || ECON_INTEREST_SCENES.has(scene.id) || ECON_ANNUITY_SCENES.has(scene.id)) drawEconomicsFinance(document, target, scene, beat);
    else if (ECON_FUNCTION_SCENES.has(scene.id) || ECON_MARKET_LINE_SCENES.has(scene.id) || ECON_UTILITY_SCENES.has(scene.id)) drawEconomicsMarket(document, target, scene, beat);
    else if (ECON_LINEAR_PROGRAM_SCENES.has(scene.id) || ECON_MATRIX_SCENES.has(scene.id)) drawEconomicsLinearMatrix(document, target, scene, beat);
    else drawEconomicsMarginal(document, target, scene, beat);
  }

  function drawAiLearning(document, target, scene, beat) {
    if (scene.id.includes("history") || scene.id.includes("xor") || scene.id.includes("spam") || scene.id.includes("hero")) {
      target.append(svg(document, "path", { d: "M 92 204 L 708 204", class: "motion-axis" }));
      [[128, "규칙"], [286, "퍼셉트론"], [444, "데이터"], [626, "맥락"]].forEach(([x, label], index) => {
        target.append(svg(document, "circle", { cx: x, cy: 204, r: 18, class: index === 1 ? "motion-point motion-point-focus" : "motion-point" }));
        appendText(document, target, label, x, 250, "motion-axis-label");
      });
      appendText(document, target, "도구 영웅담보다 질문→수학 표현→한계", 400, 314, "motion-number-label");
      return;
    }
    if (scene.id.includes("data") || scene.id.includes("bus") || scene.id.includes("cafeteria") || scene.id.includes("more")) {
      const windows = [["수집", "누가 빠졌나"], ["표현", "무엇을 셌나"], ["맥락", "언제·어디서"], ["영향", "누가 손해나"]];
      windows.forEach(([label, question], index) => {
        const x = 30 + index * 194;
        target.append(svg(document, "rect", { x, y: 112, width: 158, height: 130, rx: 18, class: index === 1 ? "motion-shape motion-shape-focus" : "motion-shape" }));
        appendText(document, target, label, x + 79, 158, "motion-label");
        appendText(document, target, question, x + 79, 207, "motion-axis-label");
      });
      appendText(document, target, "크기보다 먼저 어떤 세계를 담았는지 확인", 400, 312, "motion-number-label");
      return;
    }
    target.append(svg(document, "path", { d: "M 98 286 L 702 286 M 400 74 L 400 286", class: "motion-axis" }));
    [[244, 132, "+"], [564, 230, "−"], [296, 230, "+"], [524, 116, "−"]].forEach(([cx, cy, label], index) => {
      target.append(svg(document, "circle", { cx, cy, r: 15, class: index === 1 ? "motion-point motion-point-focus" : "motion-point" }));
      appendText(document, target, label, cx, cy + 6, "motion-axis-label");
    });
    target.append(svg(document, "path", { d: beat?.action === "verify" ? "M 170 248 L 630 108" : "M 178 220 L 624 150", class: "motion-geometry-line" }));
    appendText(document, target, "오답 방향만큼 경계를 조금 이동", 400, 326, "motion-number-label");
  }

  function drawAiText(document, target, scene, beat) {
    if (scene.id.includes("similarity") || scene.id.includes("direction") || scene.id.includes("sentiment") || scene.id.includes("review") || scene.id.includes("context")) {
      const origin = { x: 174, y: 282 };
      target.append(svg(document, "path", { d: `M ${origin.x} ${origin.y} L 656 92 M ${origin.x} ${origin.y} L 606 142 M ${origin.x} ${origin.y} L 344 74`, class: "motion-geometry-line" }));
      appendText(document, target, "문장 A", 660, 82, "motion-axis-label");
      appendText(document, target, "문장 B", 610, 134, "motion-axis-label");
      appendText(document, target, "문장 C", 350, 64, "motion-axis-label");
      appendText(document, target, "길이보다 방향의 각도 = 코사인 유사도", 430, 328, "motion-number-label");
      return;
    }
    const words = ["수학", "재미", "어려움", "추천"];
    words.forEach((word, index) => {
      const x = 68 + index * 178;
      const value = scene.id.includes("weight") || scene.id.includes("common") || scene.id.includes("rare") ? [0.08, 0.62, 0.74, 0.31][index] : [2, 1, 0, 1][index];
      const height = Number(value) <= 1 ? Number(value) * 150 : Number(value) * 58;
      target.append(svg(document, "rect", { x, y: 276 - height, width: 104, height, rx: 10, class: index === 2 ? "motion-bar motion-bar-focus" : "motion-bar" }));
      appendText(document, target, word, x + 52, 304, "motion-axis-label");
      appendText(document, target, String(value), x + 52, 260 - height, "motion-number-label");
    });
    appendText(document, target, scene.id.includes("weight") || scene.id.includes("common") || scene.id.includes("rare") ? "문서 안 빈도 × 문서 밖 희소성" : "단어를 축으로 바꾸면 문장이 좌표가 된다", 400, 338, "motion-number-label");
  }

  function drawAiImage(document, target, scene, beat) {
    const values = [32, 84, 168, 220, 52, 124, 196, 244, 18, 72, 154, 232];
    values.forEach((value, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const x = 162 + column * 104;
      const y = 70 + row * 82;
      target.append(svg(document, "rect", { x, y, width: 90, height: 68, rx: 8, fill: `rgb(${value} ${value} ${value})`, class: index === 6 ? "motion-shape-focus" : "" }));
      appendText(document, target, String(value), x + 45, y + 41, value > 150 ? "motion-axis-label motion-on-dark" : "motion-axis-label");
    });
    if (scene.id.includes("editor") || scene.id.includes("brightness") || scene.id.includes("operation") || scene.id.includes("range")) {
      target.append(svg(document, "path", { d: "M 606 104 L 704 104", class: "motion-link" }));
      appendText(document, target, "+40", 656, 88, "motion-label");
      appendText(document, target, "연산 뒤 0~255 범위를 다시 확인", 400, 338, "motion-number-label");
    } else if (scene.id.includes("distance") || scene.id.includes("nearest") || scene.id.includes("closeness") || scene.id.includes("represent")) {
      appendText(document, target, "픽셀 거리와 모양의 닮음은 같은 질문이 아니다", 400, 338, "motion-number-label");
    } else appendText(document, target, "행 · 열 · 채널 · 값", 400, 338, "motion-number-label");
  }

  function drawAiPrediction(document, target, scene, beat) {
    if (scene.id.includes("forecast") || scene.id.includes("reference") || scene.id.includes("probability") || scene.id.includes("absence") || scene.id.includes("count-divide")) {
      target.append(svg(document, "rect", { x: 120, y: 112, width: 560, height: 112, rx: 20, class: "motion-shape" }));
      target.append(svg(document, "rect", { x: 120, y: 112, width: 364, height: 112, rx: 20, class: "motion-group-focus" }));
      appendText(document, target, "해당 65", 302, 176, "motion-label");
      appendText(document, target, "전체 100", 570, 176, "motion-axis-label");
      appendText(document, target, "과거 비율은 가능성이지 개인의 약속이 아니다", 400, 306, "motion-number-label");
      return;
    }
    target.append(svg(document, "path", { d: "M 88 292 L 718 292 M 88 292 L 88 60", class: "motion-axis" }));
    if (scene.id.includes("loss") || scene.id.includes("square") || scene.id.includes("scoreboard") || scene.id.includes("compare") || scene.id.includes("descent") || scene.id.includes("slope") || scene.id.includes("step") || scene.id.includes("dimmer")) {
      target.append(svg(document, "path", { d: "M 126 76 C 224 318, 578 318, 684 76", class: "motion-curve" }));
      const x = beat?.action === "verify" ? 426 : 562;
      const y = beat?.action === "verify" ? 262 : 214;
      target.append(svg(document, "circle", { cx: x, cy: y, r: 11, class: "motion-point motion-point-focus" }));
      target.append(svg(document, "path", { d: `M ${x + 84} ${y - 56} L ${x + 14} ${y - 8}`, class: "motion-link" }));
      appendText(document, target, "기울기 반대 방향 × 학습률", 400, 328, "motion-number-label");
      return;
    }
    const points = [[144, 246], [220, 220], [278, 214], [344, 166], [420, 184], [494, 126], [566, 144], [650, 88]];
    points.forEach(([cx, cy], index) => target.append(svg(document, "circle", { cx, cy, r: 8, class: index === 4 ? "motion-point motion-point-focus" : "motion-sample-dot" })));
    target.append(svg(document, "path", { d: "M 126 266 L 672 82", class: "motion-geometry-line" }));
    appendText(document, target, "선의 방향 · 잔차 · 적용 범위를 함께 읽는다", 430, 328, "motion-number-label");
  }

  function drawAiInquiry(document, target, scene, beat) {
    const labels = scene.id.includes("question") || scene.id.includes("project") || scene.id.includes("inquiry")
      ? [["질문", "측정 가능"], ["자료", "대표성"], ["평가", "정확도+공정"], ["결정", "한계 공개"]]
      : [["정확도", "40%"], ["공정성", "25%"], ["비용", "20%"], ["영향", "15%"]];
    labels.forEach(([label, value], index) => {
      const x = 30 + index * 194;
      target.append(svg(document, "rect", { x, y: 112, width: 158, height: 130, rx: 18, class: index === 1 ? "motion-shape motion-shape-focus" : "motion-shape" }));
      appendText(document, target, label, x + 79, 158, "motion-label");
      appendText(document, target, value, x + 79, 207, "motion-axis-label");
    });
    appendText(document, target, "목표·제약·영향을 공개해야 합리성을 검토할 수 있다", 400, 312, "motion-number-label");
  }

  function drawAiMathScene(document, target, scene, beat) {
    if (AI_LEARNING_SCENES.has(scene.id)) drawAiLearning(document, target, scene, beat);
    else if (AI_TEXT_SCENES.has(scene.id)) drawAiText(document, target, scene, beat);
    else if (AI_IMAGE_SCENES.has(scene.id)) drawAiImage(document, target, scene, beat);
    else if (AI_PREDICTION_SCENES.has(scene.id)) drawAiPrediction(document, target, scene, beat);
    else drawAiInquiry(document, target, scene, beat);
  }

  function drawCultureArt(document, target, scene, beat) {
    if (scene.id.includes("monochord") || scene.id.includes("concert") || scene.id.includes("hertz") || scene.id.includes("chord") || scene.id.includes("music")) {
      [118, 224].forEach((y, index) => {
        target.append(svg(document, "path", { d: `M 104 ${y} L 696 ${y}`, class: index ? "motion-geometry-line" : "motion-reference-line" }));
        [0, 1, 2, 3].forEach((part) => target.append(svg(document, "path", { d: `M ${104 + part * (592 / (index ? 3 : 4))} ${y - 18} L ${104 + part * (592 / (index ? 3 : 4))} ${y + 18}`, class: "motion-axis" })));
      });
      appendText(document, target, "줄 길이의 간단한 비가 음정의 비를 만든다", 400, 316, "motion-number-label");
      return;
    }
    if (scene.id.includes("perspective") || scene.id.includes("distance") || scene.id.includes("ratio") || scene.id.includes("tile") || scene.id.includes("geometry")) {
      target.append(svg(document, "path", { d: "M 74 304 L 400 74 L 726 304 M 152 304 L 400 74 L 648 304 M 236 304 L 400 74 L 564 304", class: "motion-reference-line" }));
      [122, 168, 222, 282].forEach((y) => target.append(svg(document, "path", { d: `M ${160 + y * 0.25} ${y} L ${640 - y * 0.25} ${y}`, class: "motion-geometry-line" })));
      appendText(document, target, "소실점 · 비례 · 반복 타일", 400, 332, "motion-number-label");
      return;
    }
    if (scene.id.includes("film") || scene.id.includes("frame") || scene.id.includes("resolution") || scene.id.includes("edit")) {
      [0, 1, 2, 3, 4].forEach((index) => {
        const x = 64 + index * 144;
        target.append(svg(document, "rect", { x, y: 108, width: 120, height: 116, rx: 10, class: index === 2 ? "motion-shape motion-shape-focus" : "motion-shape" }));
        appendText(document, target, String(index + 1), x + 60, 172, "motion-label");
      });
      appendText(document, target, "프레임 수 · 좌표 · crop · 편집 간격", 400, 310, "motion-number-label");
      return;
    }
    [5, 7, 5, 7, 5].forEach((beats, index) => {
      const x = 70 + index * 142;
      target.append(svg(document, "rect", { x, y: 110, width: 106, height: 38 + beats * 12, rx: 10, class: index === 2 ? "motion-bar motion-bar-focus" : "motion-bar" }));
      appendText(document, target, `${beats}박`, x + 53, 282, "motion-axis-label");
    });
    appendText(document, target, "수열은 리듬을 보이게 하지만 의미를 대신하지 않는다", 400, 330, "motion-number-label");
  }

  function drawCultureLeisure(document, target, scene, beat) {
    if (scene.id.includes("court") || scene.id.includes("parabola") || scene.id.includes("shot") || scene.id.includes("sports") || scene.id.includes("degree")) {
      target.append(svg(document, "path", { d: "M 88 294 L 714 294 M 88 294 L 88 64", class: "motion-axis" }));
      target.append(svg(document, "path", { d: "M 116 278 C 274 44, 520 44, 680 278", class: "motion-curve" }));
      target.append(svg(document, "circle", { cx: 398, cy: 102, r: 11, class: "motion-point motion-point-focus" }));
      appendText(document, target, "꼭짓점 · 발사 조건 · 실제 기록 비교", 420, 328, "motion-number-label");
      return;
    }
    if (scene.id.includes("binary") || scene.id.includes("grayscale") || scene.id.includes("parity") || scene.id.includes("digital") || scene.id.includes("compress")) {
      [1, 0, 1, 1, 0, 1, 0, 1].forEach((bit, index) => {
        const x = 42 + index * 91;
        target.append(svg(document, "rect", { x, y: 128, width: 70, height: 84, rx: 12, class: bit ? "motion-shape motion-shape-focus" : "motion-shape" }));
        appendText(document, target, String(bit), x + 35, 181, "motion-label");
      });
      appendText(document, target, "자료 비트 + 오류검사 비트", 400, 274, "motion-number-label");
      appendText(document, target, "표현 방식과 압축·무결성은 다른 문제", 400, 320, "motion-axis-label");
      return;
    }
    if (scene.id.includes("ballot") || scene.id.includes("profile") || scene.id.includes("voting") || scene.id.includes("method")) {
      [["A>B>C", "4표"], ["B>C>A", "3표"], ["C>A>B", "2표"]].forEach(([rank, count], index) => {
        const x = 94 + index * 232;
        target.append(svg(document, "rect", { x, y: 112, width: 180, height: 128, rx: 18, class: index === 1 ? "motion-shape motion-shape-focus" : "motion-shape" }));
        appendText(document, target, rank, x + 90, 158, "motion-label");
        appendText(document, target, count, x + 90, 207, "motion-axis-label");
      });
      appendText(document, target, "같은 선호표도 규칙에 따라 당선자가 달라진다", 400, 312, "motion-number-label");
      return;
    }
    const nodes = [[400, 62, "시작"], [250, 150, "앞"], [550, 150, "뒤"], [168, 258, "승"], [332, 258, "패"], [468, 258, "승"], [632, 258, "패"]];
    [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]].forEach(([a, b]) => target.append(svg(document, "path", { d: `M ${nodes[a][0]} ${nodes[a][1]} L ${nodes[b][0]} ${nodes[b][1]}`, class: "motion-link" })));
    nodes.forEach(([cx, cy, label], index) => { target.append(svg(document, "circle", { cx, cy, r: 28, class: index === 3 || index === 5 ? "motion-point motion-point-focus" : "motion-point" })); appendText(document, target, label, cx, cy + 6, "motion-axis-label"); });
    appendText(document, target, "규칙을 나무로 펼쳐 확률·기댓값·필승 수를 확인", 400, 334, "motion-number-label");
  }

  function drawCultureSociety(document, target, scene, beat) {
    if (scene.id.includes("braille") || scene.id.includes("dot") || scene.id.includes("accessible") || scene.id.includes("letters")) {
      const active = new Set([0, 3, 4]);
      [0, 1, 2, 3, 4, 5].forEach((index) => {
        const column = index >= 3 ? 1 : 0;
        const row = index % 3;
        target.append(svg(document, "circle", { cx: 324 + column * 152, cy: 88 + row * 96, r: 24, class: active.has(index) ? "motion-point motion-point-focus" : "motion-point" }));
      });
      appendText(document, target, "6개 점의 조합 → 64개 패턴", 400, 332, "motion-number-label");
      return;
    }
    if (scene.id.includes("media") || scene.id.includes("headline") || scene.id.includes("frequency") || scene.id.includes("comment")) {
      [0.18, 0.54, 0.31, 0.68, 0.42].forEach((value, index) => {
        const x = 98 + index * 126;
        target.append(svg(document, "rect", { x, y: 286 - value * 250, width: 76, height: value * 250, rx: 8, class: index === 3 ? "motion-bar motion-bar-focus" : "motion-bar" }));
      });
      target.append(svg(document, "path", { d: "M 76 286 L 724 286", class: "motion-axis" }));
      appendText(document, target, "분모·표본·분포를 함께 공개", 400, 328, "motion-number-label");
      return;
    }
    if (scene.id.includes("values") || scene.id.includes("weighted") || scene.id.includes("weight") || scene.id.includes("choice")) {
      [["가격", "35"], ["환경", "30"], ["내구", "20"], ["접근", "15"]].forEach(([label, score], index) => {
        const x = 28 + index * 194;
        target.append(svg(document, "rect", { x, y: 114, width: 160, height: 128, rx: 18, class: index === 1 ? "motion-shape motion-shape-focus" : "motion-shape" }));
        appendText(document, target, label, x + 80, 158, "motion-label");
        appendText(document, target, `${score}%`, x + 80, 207, "motion-axis-label");
      });
      appendText(document, target, "가중치는 객관적 진리가 아니라 공개할 가치 선택", 400, 312, "motion-number-label");
      return;
    }
    ["10진", "20진", "대칭", "무늬"].forEach((label, index) => {
      const x = 42 + index * 190;
      target.append(svg(document, "rect", { x, y: 118, width: 146, height: 124, rx: 18, class: index === 2 ? "motion-shape motion-shape-focus" : "motion-shape" }));
      appendText(document, target, label, x + 73, 184, "motion-label");
    });
    appendText(document, target, "셈법과 무늬는 문화의 질문을 수학 구조로 번역", 400, 312, "motion-number-label");
  }

  function drawCultureEnvironment(document, target, scene, beat) {
    target.append(svg(document, "path", { d: "M 86 292 L 720 292 M 86 292 L 86 58", class: "motion-axis" }));
    if (scene.id.includes("air") || scene.id.includes("moving") || scene.id.includes("day")) {
      const points = [[104, 226], [188, 146], [272, 204], [356, 118], [440, 190], [524, 134], [608, 172], [692, 106]];
      target.append(svg(document, "path", { d: points.map(([x, y], index) => `${index ? "L" : "M"} ${x} ${y}`).join(" "), class: "motion-geometry-line" }));
      points.forEach(([cx, cy], index) => target.append(svg(document, "circle", { cx, cy, r: 7, class: index === 3 ? "motion-point motion-point-focus" : "motion-sample-dot" })));
      target.append(svg(document, "path", { d: "M 104 198 C 300 166, 500 158, 692 138", class: "motion-reference-line" }));
      appendText(document, target, "원자료와 이동평균을 겹쳐 흐름을 읽는다", 430, 330, "motion-number-label");
      return;
    }
    if (scene.id.includes("model") || scene.id.includes("growth") || scene.id.includes("extrapolation") || scene.id.includes("intervention") || scene.id.includes("desert")) {
      target.append(svg(document, "path", { d: "M 104 270 L 688 88", class: "motion-curve" }));
      target.append(svg(document, "path", { d: "M 420 172 C 520 194, 604 226, 688 268", class: "motion-reference-line" }));
      target.append(svg(document, "circle", { cx: 420, cy: 172, r: 10, class: "motion-point motion-point-focus" }));
      appendText(document, target, "과거 추세", 276, 168, "motion-axis-label");
      appendText(document, target, "개입 시나리오", 572, 236, "motion-axis-label");
      appendText(document, target, "모형의 범위 밖을 영원히 외삽하지 않는다", 430, 330, "motion-number-label");
      return;
    }
    if (scene.id.includes("richness") || scene.id.includes("simpson") || scene.id.includes("ecosystem") || scene.id.includes("habitat") || scene.id.includes("biodiversity")) {
      [0.72, 0.18, 0.06, 0.04].forEach((value, index) => {
        const x = 120 + index * 150;
        target.append(svg(document, "rect", { x, y: 286 - value * 240, width: 86, height: value * 240, rx: 9, class: index === 0 ? "motion-bar motion-bar-focus" : "motion-bar" }));
      });
      appendText(document, target, "종 수(풍부도) + 고른 분포(균등도)", 400, 330, "motion-number-label");
      return;
    }
    ["총량", "학생 수", "1인당", "전후 비교"].forEach((label, index) => {
      const x = 36 + index * 192;
      target.append(svg(document, "rect", { x, y: 118, width: 154, height: 120, rx: 18, class: index === 2 ? "motion-shape motion-shape-focus" : "motion-shape" }));
      appendText(document, target, label, x + 77, 182, "motion-label");
    });
    appendText(document, target, "공통 단위로 나눈 뒤 개선 전후를 비교", 400, 312, "motion-number-label");
  }

  function drawMathCultureScene(document, target, scene, beat) {
    if (CULTURE_ART_SCENES.has(scene.id)) drawCultureArt(document, target, scene, beat);
    else if (CULTURE_LEISURE_SCENES.has(scene.id)) drawCultureLeisure(document, target, scene, beat);
    else if (CULTURE_SOCIETY_SCENES.has(scene.id)) drawCultureSociety(document, target, scene, beat);
    else drawCultureEnvironment(document, target, scene, beat);
  }

  function drawResearchFoundation(document, target, scene, beat) {
    const ethical = scene.id.includes("trust") || scene.id.includes("ethical") || scene.id.includes("clean") || scene.id.includes("ethics");
    const steps = ethical
      ? [["동의", "참여자"], ["수집", "최소 자료"], ["분석", "변경 기록"], ["공개", "한계"]]
      : [["불편", "현상"], ["질문", "측정 가능"], ["자료", "판정 기준"], ["답", "범위"]];
    steps.forEach(([label, detail], index) => {
      const x = 28 + index * 194;
      target.append(svg(document, "rect", { x, y: 112, width: 160, height: 132, rx: 18, class: index === 1 ? "motion-shape motion-shape-focus" : "motion-shape" }));
      appendText(document, target, label, x + 80, 158, "motion-label");
      appendText(document, target, detail, x + 80, 207, "motion-axis-label");
      if (index < 3) target.append(svg(document, "path", { d: `M ${x + 166} 178 L ${x + 188} 178`, class: "motion-link" }));
    });
    appendText(document, target, ethical ? "결과보다 오래 남는 것은 정직한 의사결정 흔적" : "답을 정해 놓지 말고 반증 가능한 질문으로", 400, 314, "motion-number-label");
  }

  function drawResearchMethod(document, target, scene, beat) {
    if (scene.id.includes("literature") || scene.id.includes("source") || scene.id.includes("paper") || scene.id.includes("search")) {
      [[160, 114, "출처 A"], [400, 72, "핵심 주장"], [640, 114, "출처 B"], [268, 250, "방법"], [532, 250, "한계"]].forEach(([cx, cy, label], index) => {
        target.append(svg(document, "rect", { x: cx - 74, y: cy - 34, width: 148, height: 68, rx: 14, class: index === 1 ? "motion-shape motion-shape-focus" : "motion-shape" }));
        appendText(document, target, label, cx, cy + 6, "motion-axis-label");
      });
      [[160,114,400,72],[640,114,400,72],[160,114,268,250],[640,114,532,250],[400,72,268,250],[400,72,532,250]].forEach(([x1,y1,x2,y2]) => target.append(svg(document, "path", { d: `M ${x1} ${y1} L ${x2} ${y2}`, class: "motion-reference-line" })));
      appendText(document, target, "요약 목록이 아니라 주장·방법·한계의 논증 지도", 400, 332, "motion-number-label");
      return;
    }
    if (scene.id.includes("case") || scene.id.includes("anecdote") || scene.id.includes("cross")) {
      [["사례 A", "맥락1"], ["사례 B", "맥락2"], ["공통", "신호"], ["차이", "조건"]].forEach(([label, detail], index) => {
        const x = 28 + index * 194;
        target.append(svg(document, "rect", { x, y: 112, width: 160, height: 132, rx: 18, class: index === 2 ? "motion-shape motion-shape-focus" : "motion-shape" }));
        appendText(document, target, label, x + 80, 158, "motion-label");
        appendText(document, target, detail, x + 80, 207, "motion-axis-label");
      });
      appendText(document, target, "사례 하나의 인상을 일반화하지 않고 같은 질문으로 비교", 400, 314, "motion-number-label");
      return;
    }
    const development = scene.id.includes("artifact") || scene.id.includes("prototype") || scene.id.includes("puzzle") || scene.id.includes("requirements") || scene.id.includes("development");
    const labels = development ? ["요구", "시제품", "시험", "수정"] : ["가설", "무작위", "반복", "비율"];
    labels.forEach((label, index) => {
      const angle = -Math.PI / 2 + index * Math.PI / 2;
      const cx = 400 + Math.cos(angle) * 190;
      const cy = 182 + Math.sin(angle) * 110;
      target.append(svg(document, "circle", { cx, cy, r: 48, class: index === 2 ? "motion-point motion-point-focus" : "motion-point" }));
      appendText(document, target, label, cx, cy + 6, "motion-axis-label");
      const nextAngle = -Math.PI / 2 + ((index + 1) % 4) * Math.PI / 2;
      target.append(svg(document, "path", { d: `M ${cx} ${cy} L ${400 + Math.cos(nextAngle) * 190} ${182 + Math.sin(nextAngle) * 110}`, class: "motion-reference-line" }));
    });
    appendText(document, target, development ? "첫 결과가 아니라 반복마다 남긴 변경 근거" : "원하는 값이 아니라 반복 결과의 분포", 400, 338, "motion-number-label");
  }

  function drawResearchExecution(document, target, scene, beat) {
    if (scene.id.includes("topic") || scene.id.includes("plan") || scene.id.includes("grand") || scene.id.includes("daylight")) {
      const widths = [620, 480, 340, 210];
      ["관심", "가치×가능", "측정 질문", "실행 계획"].forEach((label, index) => {
        const width = widths[index];
        const x = 400 - width / 2;
        const y = 58 + index * 62;
        target.append(svg(document, "rect", { x, y, width, height: 46, rx: 12, class: index === 3 ? "motion-shape motion-shape-focus" : "motion-shape" }));
        appendText(document, target, label, 400, y + 30, "motion-axis-label");
      });
      appendText(document, target, "큰 주제를 오늘 실행 가능한 질문으로 좁힌다", 400, 330, "motion-number-label");
      return;
    }
    const reflection = scene.id.includes("reflection") || scene.id.includes("mirror") || scene.id.includes("rubric") || scene.id.includes("successful") || scene.id.includes("bridge");
    const presentation = scene.id.includes("evidence-story") || scene.id.includes("audience") || scene.id.includes("slide") || scene.id.includes("shade-route") || scene.id.includes("presentation");
    const labels = reflection ? ["기대", "증거", "차이", "다음 질문"] : presentation ? ["주장", "근거", "경로", "한계"] : ["계획", "실행", "변경", "체크포인트"];
    labels.forEach((label, index) => {
      const x = 34 + index * 192;
      target.append(svg(document, "rect", { x, y: 118, width: 152, height: 120, rx: 18, class: index === 2 ? "motion-shape motion-shape-focus" : "motion-shape" }));
      appendText(document, target, String(index + 1), x + 26, 148, "motion-axis-label");
      appendText(document, target, label, x + 76, 190, "motion-label");
    });
    appendText(document, target, reflection ? "성공 여부보다 근거로 다음 질문을 만든다" : presentation ? "청중이 근거의 길을 다시 걸을 수 있게" : "계획과 현실이 만난 변경 이유를 기록", 400, 312, "motion-number-label");
  }

  function drawMathResearchScene(document, target, scene, beat) {
    if (RESEARCH_FOUNDATION_SCENES.has(scene.id)) drawResearchFoundation(document, target, scene, beat);
    else if (RESEARCH_METHOD_SCENES.has(scene.id)) drawResearchMethod(document, target, scene, beat);
    else drawResearchExecution(document, target, scene, beat);
  }

  function drawVocationalNumber(document, target, scene, beat) {
    if (scene.id.includes("rounding") || scene.id.includes("resolution") || scene.id.includes("direction")) {
      target.append(svg(document, "path", { d: "M 96 190 L 704 190", class: "motion-axis" }));
      [0, 1, 2, 3, 4, 5].forEach((index) => {
        const x = 126 + index * 108;
        target.append(svg(document, "path", { d: `M ${x} 170 L ${x} 210`, class: "motion-reference-line" }));
        appendText(document, target, ["1", "10", "100", "1천", "1만", "10만"][index], x, 238, "motion-axis-label");
      });
      target.append(svg(document, "rect", { x: 428, y: 130, width: 116, height: 120, rx: 12, class: "motion-group-focus" }));
      appendText(document, target, "예산은 보수적으로 · 재고는 방향까지", 400, 310, "motion-number-label");
      return;
    }
    if (scene.id.includes("unit") || scene.id.includes("conversion") || scene.id.includes("decimal") || scene.id.includes("mass") || scene.id.includes("quantity")) {
      [["2.5 kg", "×1000"], ["2500 g", "÷1000"], ["같은 양", "단위만 변경"]].forEach(([label, detail], index) => {
        const x = 42 + index * 254;
        target.append(svg(document, "rect", { x, y: 118, width: 202, height: 126, rx: 18, class: index === 2 ? "motion-shape motion-shape-focus" : "motion-shape" }));
        appendText(document, target, label, x + 101, 160, "motion-label");
        appendText(document, target, detail, x + 101, 210, "motion-axis-label");
      });
      appendText(document, target, "숫자와 단위를 한 묶음으로 이동", 400, 312, "motion-number-label");
      return;
    }
    [["수량", "12개"], ["단가", "₩3,500"], ["곱하기", "총액"], ["빼기", "잔액"]].forEach(([label, value], index) => {
      const x = 28 + index * 194;
      target.append(svg(document, "rect", { x, y: 112, width: 160, height: 132, rx: 18, class: index === 2 ? "motion-shape motion-shape-focus" : "motion-shape" }));
      appendText(document, target, label, x + 80, 158, "motion-label");
      appendText(document, target, value, x + 80, 207, "motion-axis-label");
    });
    appendText(document, target, "역할 · 단위 · 연산 순서", 400, 312, "motion-number-label");
  }

  function drawVocationalRelation(document, target, scene, beat) {
    if (scene.id.includes("recipe") || scene.id.includes("corresponding") || scene.id.includes("ratio") || scene.id.includes("catering") || scene.id.includes("scale-recall")) {
      [["밀가루", 3], ["물", 2], ["소금", 1]].forEach(([label, count], index) => {
        const x = 128 + index * 230;
        for (let unit = 0; unit < count; unit += 1) target.append(svg(document, "circle", { cx: x + unit * 34, cy: 166, r: 15, class: index === 0 ? "motion-point motion-point-focus" : "motion-point" }));
        appendText(document, target, `${label} ${count}`, x + 34, 222, "motion-axis-label");
      });
      appendText(document, target, "대응 순서를 지키고 모두 같은 배수로", 400, 304, "motion-number-label");
      return;
    }
    if (scene.id.includes("hundred") || scene.id.includes("baseline") || scene.id.includes("percent") || scene.id.includes("discount")) {
      for (let index = 0; index < 10; index += 1) {
        const x = 108 + index * 60;
        target.append(svg(document, "rect", { x, y: 132, width: 46, height: 90, rx: 7, class: index < 7 ? "motion-bar motion-bar-focus" : "motion-bar" }));
      }
      appendText(document, target, "70 / 100 = 70%", 400, 276, "motion-number-label");
      appendText(document, target, "% 변화와 %p 차이를 구분", 400, 320, "motion-axis-label");
      return;
    }
    if (scene.id.includes("monitor") || scene.id.includes("height") || scene.id.includes("steepness") || scene.id.includes("storage") || scene.id.includes("graph")) {
      target.append(svg(document, "path", { d: "M 86 292 L 718 292 M 86 292 L 86 58", class: "motion-axis" }));
      target.append(svg(document, "path", { d: "M 104 250 L 286 210 L 438 110 L 686 154", class: "motion-geometry-line" }));
      target.append(svg(document, "circle", { cx: 438, cy: 110, r: 10, class: "motion-point motion-point-focus" }));
      appendText(document, target, "높이=상태 · 기울기=변화 속도", 430, 330, "motion-number-label");
      return;
    }
    if (scene.id.includes("constraint") || scene.id.includes("unknown") || scene.id.includes("integer") || scene.id.includes("purchase") || scene.id.includes("target")) {
      target.append(svg(document, "path", { d: "M 88 292 L 718 292 M 88 292 L 88 58", class: "motion-axis" }));
      target.append(svg(document, "path", { d: "M 108 256 L 620 76 M 108 112 L 630 264", class: "motion-geometry-line" }));
      target.append(svg(document, "path", { d: "M 108 256 L 108 112 L 360 178 L 508 226 Z", class: "motion-group-focus" }));
      appendText(document, target, "부호 · 정수 · 상한/하한을 가능영역에 표시", 430, 330, "motion-number-label");
      return;
    }
    [["0~5km", "₩3,000"], ["5~10km", "+₩800/km"], ["10km+", "+₩600/km"]].forEach(([range, rate], index) => {
      const x = 76 + index * 232;
      target.append(svg(document, "rect", { x, y: 112, width: 184, height: 128, rx: 18, class: index === 1 ? "motion-shape motion-shape-focus" : "motion-shape" }));
      appendText(document, target, range, x + 92, 158, "motion-label");
      appendText(document, target, rate, x + 92, 207, "motion-axis-label");
    });
    appendText(document, target, "구간을 고른 뒤 그 구간의 요율 규칙 적용", 400, 312, "motion-number-label");
  }

  function drawVocationalGeometry(document, target, scene, beat) {
    if (scene.id.includes("box") || scene.id.includes("hinge") || scene.id.includes("opposite") || scene.id.includes("carton") || scene.id.includes("folding")) {
      const cells = [[2,0],[1,1],[2,1],[3,1],[2,2],[2,3]];
      cells.forEach(([column,row], index) => {
        const x = 250 + column * 72;
        const y = 42 + row * 72;
        target.append(svg(document, "rect", { x, y, width: 68, height: 68, rx: 8, class: index === 2 ? "motion-shape motion-shape-focus" : "motion-shape" }));
      });
      appendText(document, target, "맞닿는 모서리와 마주 보는 면을 접기 전에 확인", 400, 338, "motion-number-label");
      return;
    }
    if (scene.id.includes("camera") || scene.id.includes("height-grid") || scene.id.includes("silhouette") || scene.id.includes("pallet") || scene.id.includes("projection")) {
      [["정면", [[0,1,2],[1,2,3]]], ["평면", [[2,1,0],[1,2,1]]], ["측면", [[1,2,2],[0,1,3]]]].forEach(([label, raw], viewIndex) => {
        const values = raw;
        const startX = 64 + viewIndex * 244;
        values.flat().forEach((value, index) => {
          const x = startX + (index % 3) * 48;
          const y = 110 + Math.floor(index / 3) * 48;
          target.append(svg(document, "rect", { x, y, width: 44, height: 44, rx: 5, class: value ? "motion-shape motion-shape-focus" : "motion-shape" }));
          appendText(document, target, String(value), x + 22, y + 28, "motion-axis-label");
        });
        appendText(document, target, label, startX + 70, 232, "motion-axis-label");
      });
      appendText(document, target, "정면·평면·측면을 교차 확인해 한 입체로", 400, 312, "motion-number-label");
      return;
    }
    if (scene.id.includes("template") || scene.id.includes("corresponding") || scene.id.includes("area-scale") || scene.id.includes("floorplan") || scene.id.includes("move-or-scale")) {
      target.append(svg(document, "rect", { x: 112, y: 138, width: 164, height: 112, rx: 12, class: "motion-shape" }));
      target.append(svg(document, "rect", { x: 452, y: 82, width: 246, height: 168, rx: 12, class: "motion-shape motion-shape-focus" }));
      target.append(svg(document, "path", { d: "M 292 194 L 430 164", class: "motion-link" }));
      appendText(document, target, "길이 ×1.5", 368, 150, "motion-axis-label");
      appendText(document, target, "넓이 ×(1.5)²", 572, 292, "motion-number-label");
      return;
    }
    const volume = scene.id.includes("skin") || scene.id.includes("space") || scene.id.includes("capacity") || scene.id.includes("shipping") || scene.id.includes("base-layer");
    target.append(svg(document, "rect", { x: 180, y: 102, width: 360, height: 190, rx: 14, class: "motion-shape" }));
    target.append(svg(document, "path", { d: "M 540 102 L 650 56 L 650 244 L 540 292 M 180 102 L 290 56 L 650 56", class: "motion-geometry-line" }));
    appendText(document, target, volume ? "겉넓이 = 포장할 면 · 부피 = 담을 공간" : "둘레 = 테두리 · 넓이 = 덮을 바닥", 420, 330, "motion-number-label");
  }

  function drawVocationalData(document, target, scene, beat) {
    if (scene.id.includes("tree") || scene.id.includes("and-or") || scene.id.includes("restriction") || scene.id.includes("order") || scene.id.includes("path")) {
      const nodes = [[400,62,"시작"],[250,150,"A"],[550,150,"B"],[168,258,"1"],[332,258,"2"],[468,258,"1"],[632,258,"2"]];
      [[0,1],[0,2],[1,3],[1,4],[2,5],[2,6]].forEach(([a,b]) => target.append(svg(document, "path", { d: `M ${nodes[a][0]} ${nodes[a][1]} L ${nodes[b][0]} ${nodes[b][1]}`, class: "motion-link" })));
      nodes.forEach(([cx,cy,label], index) => { target.append(svg(document, "circle", { cx, cy, r: 26, class: index === 3 || index === 6 ? "motion-point motion-point-focus" : "motion-point" })); appendText(document, target, label, cx, cy + 6, "motion-axis-label"); });
      appendText(document, target, "연속 선택은 가지를 따라 × · 대안은 경로를 +", 400, 334, "motion-number-label");
      return;
    }
    if (scene.id.includes("frequency") || scene.id.includes("denominator") || scene.id.includes("certainty") || scene.id.includes("risk") || scene.id.includes("chance")) {
      target.append(svg(document, "rect", { x: 120, y: 116, width: 560, height: 112, rx: 20, class: "motion-shape" }));
      target.append(svg(document, "rect", { x: 120, y: 116, width: 168, height: 112, rx: 20, class: "motion-group-focus" }));
      appendText(document, target, "불량 30", 204, 180, "motion-label");
      appendText(document, target, "관련 생산 100", 520, 180, "motion-axis-label");
      appendText(document, target, "관련 분모와 표본 수를 함께 본다", 400, 306, "motion-number-label");
      return;
    }
    if (scene.id.includes("decision") || scene.id.includes("criterion") || scene.id.includes("metric") || scene.id.includes("supplier") || scene.id.includes("evidence-decision")) {
      [["품질","35"],["납기","30"],["가격","20"],["위험","15"]].forEach(([label,score], index) => {
        const x = 28 + index * 194;
        target.append(svg(document, "rect", { x, y: 112, width: 160, height: 132, rx: 18, class: index === 1 ? "motion-shape motion-shape-focus" : "motion-shape" }));
        appendText(document, target, label, x + 80, 158, "motion-label");
        appendText(document, target, `${score}%`, x + 80, 207, "motion-axis-label");
      });
      appendText(document, target, "한 지표가 아니라 기준·측정·위험을 함께", 400, 312, "motion-number-label");
      return;
    }
    target.append(svg(document, "path", { d: "M 86 292 L 720 292 M 86 292 L 86 58", class: "motion-axis" }));
    [0.24,0.54,0.36,0.70,0.46].forEach((value,index) => { const x=116+index*118; target.append(svg(document,"rect",{x,y:292-value*250,width:72,height:value*250,rx:8,class:index===3?"motion-bar motion-bar-focus":"motion-bar"})); });
    if (scene.id.includes("truncated")) target.append(svg(document, "path", { d: "M 74 240 L 98 226 L 74 212 L 98 198", class: "motion-reference-line" }));
    appendText(document, target, "질문→표/그래프 선택→축·단위→수치→결론", 400, 330, "motion-number-label");
  }

  function drawVocationalMathScene(document, target, scene, beat) {
    if (VOCATIONAL_NUMBER_SCENES.has(scene.id)) drawVocationalNumber(document, target, scene, beat);
    else if (VOCATIONAL_RELATION_SCENES.has(scene.id)) drawVocationalRelation(document, target, scene, beat);
    else if (VOCATIONAL_GEOMETRY_SCENES.has(scene.id)) drawVocationalGeometry(document, target, scene, beat);
    else drawVocationalData(document, target, scene, beat);
  }

  function drawPlot(document, target, scene, beat) {
    if (PROBABILITY_STATISTICS_SCENES.has(scene.id)) {
      drawProbabilityStatisticsScene(document, target, scene, beat);
      return;
    }
    if (CALCULUS_ONE_SCENES.has(scene.id)) {
      drawCalculusOneScene(document, target, scene, beat);
      return;
    }
    if (ALGEBRA_SEQUENCE_SCENES.has(scene.id)) {
      drawAlgebraSequenceScene(document, target, scene, beat);
      return;
    }
    if (ALGEBRA_TRIGONOMETRY_SCENES.has(scene.id)) {
      drawAlgebraTrigonometryScene(document, target, scene, beat);
      return;
    }
    if (ALGEBRA_LOG_FUNCTION_SCENES.has(scene.id)) {
      drawAlgebraLogFunctionScene(document, target, scene, beat);
      return;
    }
    if (ALGEBRA_POWER_EXPONENT_SCENES.has(scene.id)) {
      drawAlgebraPowerExponentScene(document, target, scene, beat);
      return;
    }
    if (COORDINATE_GEOMETRY_SCENES.has(scene.id)) {
      drawCoordinateGeometryScene(document, target, scene, beat);
      return;
    }
    if (SETS_PROPOSITIONS_SCENES.has(scene.id)) {
      drawSetsPropositionsScene(document, target, scene, beat);
      return;
    }
    if (FUNCTIONS_GRAPHS_SCENES.has(scene.id)) {
      drawFunctionsGraphsScene(document, target, scene, beat);
      return;
    }
    if (scene.id.startsWith("matrix-")) {
      drawMatrixGrid(document, target, scene, beat);
      return;
    }
    if (scene.id.startsWith("counting-")) {
      drawCountingTree(document, target, scene, beat);
      return;
    }
    if (scene.id.startsWith("permutation-")) {
      drawPermutationSlots(document, target, scene, beat);
      return;
    }
    if (scene.id.startsWith("combination-")) {
      drawCombinationGroups(document, target, scene, beat);
      return;
    }
    if (scene.id.startsWith("complex-")) {
      drawComplexPlane(document, target, beat);
      return;
    }
    if (scene.id.startsWith("simquad-")) {
      drawIntersectionPlot(document, target, beat);
      return;
    }
    if (
      scene.id.startsWith("simlinear-")
      || scene.id.startsWith("absolute-")
      || scene.id.startsWith("quadineq-")
    ) {
      drawNumberLine(document, target, scene, beat);
      return;
    }
    const values = [80, 132, 196, 118, 234, 164];
    values.forEach((height, index) => {
      target.append(svg(document, "rect", {
        x: 95 + index * 100, y: 290 - height, width: 56, height, rx: 7,
        class: index === 4 ? "motion-bar motion-bar-focus" : "motion-bar",
      }));
    });
    target.append(svg(document, "path", { d: "M 70 290 L 735 290", class: "motion-axis" }));
    if (beat?.action === "group") {
      target.append(svg(document, "path", { d: "M 70 182 L 735 182", class: "motion-reference-line" }));
    }
  }

  function drawVisual(document, target, scene, beat = scene.beats?.[0]) {
    target.replaceChildren();
    const grid = svg(document, "g", { class: "motion-grid" });
    for (let x = 0; x <= 800; x += 40) grid.append(svg(document, "path", { d: `M ${x} 0 L ${x} 360` }));
    for (let y = 0; y <= 360; y += 40) grid.append(svg(document, "path", { d: `M 0 ${y} L 800 ${y}` }));
    target.append(grid);

    if (VOCATIONAL_MATH_SCENES.has(scene.id)) drawVocationalMathScene(document, target, scene, beat);
    else if (MATH_RESEARCH_SCENES.has(scene.id)) drawMathResearchScene(document, target, scene, beat);
    else if (MATH_CULTURE_SCENES.has(scene.id)) drawMathCultureScene(document, target, scene, beat);
    else if (AI_MATH_SCENES.has(scene.id)) drawAiMathScene(document, target, scene, beat);
    else if (ECONOMICS_MATH_SCENES.has(scene.id)) drawEconomicsMathScene(document, target, scene, beat);
    else if (PRACTICAL_STATISTICS_SCENES.has(scene.id)) drawPracticalStatisticsScene(document, target, scene, beat);
    else if (GEOMETRY_COURSE_SCENES.has(scene.id)) drawGeometryCourseScene(document, target, scene, beat);
    else if (scene.visualMode === "blocks") drawBlocks(document, target, beat);
    else if (scene.visualMode === "graph") drawGraph(document, target, beat);
    else if (scene.visualMode === "geometry") drawGeometry(document, target, beat);
    else if (scene.visualMode === "plot") drawPlot(document, target, scene, beat);
    else drawEquation(document, target, scene, beat);
    appendBeatCopy(document, target, beat);
  }

  function speakReexplanation(browserWindow, text, rate) {
    const synth = browserWindow.speechSynthesis;
    const Utterance = browserWindow.SpeechSynthesisUtterance;
    if (!synth || !Utterance || !text) return;
    synth.cancel();
    const utterance = new Utterance(text);
    utterance.lang = "ko-KR";
    utterance.rate = rate;
    const preferred = root.MatthsCurriculumNarration?.preferredKoreanVoice?.(synth.getVoices());
    if (preferred) utterance.voice = preferred;
    synth.speak(utterance);
  }

  function mountCurriculumMotionLesson(document, browserWindow) {
    const rootNode = document.querySelector("[data-curriculum-motion-lesson]");
    const stage = document.querySelector("[data-curriculum-teacher-stage]");
    const lesson = readJson(document, "curriculum-motion-data");
    const story = readJson(document, "curriculum-narration-data");
    if (!rootNode || !stage || !lesson?.scenes?.length || !story?.scenes?.length) return null;

    const nodes = {
      kind: stage.querySelector("[data-motion-kind]"),
      progress: stage.querySelector("[data-motion-progress]"),
      visual: stage.querySelector("[data-motion-visual]"),
      focus: stage.querySelector("[data-motion-focus]"),
      idea: stage.querySelector("[data-motion-visual-idea]"),
      kindCopy: stage.querySelector("[data-motion-kind-copy]"),
      title: stage.querySelector("[data-motion-title]"),
      subtitle: stage.querySelector("[data-motion-subtitle]"),
      source: stage.querySelector("[data-motion-source]"),
      sourceToggle: stage.querySelector("[data-motion-source-toggle]"),
      reexplain: rootNode.querySelector("[data-motion-reexplain]"),
      check: rootNode.querySelector("[data-motion-check]"),
      checkPrompt: rootNode.querySelector("[data-motion-check-prompt]"),
      choices: rootNode.querySelector("[data-motion-check-choices]"),
      feedback: rootNode.querySelector("[data-motion-check-feedback]"),
      dots: [...rootNode.querySelectorAll("[data-motion-scene-index]")],
    };
    const kindLabels = {
      intuition: "직관", question: "질문", misconception: "오개념",
      solution: "풀이 리듬", recall: "회상",
    };
    let index = 0;
    let misses = 0;
    let beatIndex = 0;
    let beatTimer = null;
    let advanceTimer = null;
    const reduceMotion = browserWindow.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

    function narrationSession() {
      return document.getElementById("curriculum-narration-data")?.curriculumNarrationSession || null;
    }

    function clearBeatTimer() {
      if (beatTimer !== null) browserWindow.clearTimeout(beatTimer);
      beatTimer = null;
    }

    function clearAdvanceTimer() {
      if (advanceTimer !== null) browserWindow.clearTimeout(advanceTimer);
      advanceTimer = null;
    }

    function advanceFromCheck() {
      if (index < lesson.scenes.length - 1) {
        renderScene(index + 1);
        stage.focus?.({ preventScroll: true });
        return;
      }
      const practice = document.querySelector("[data-concept-experience], .concept-experience");
      if (practice) practice.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
      nodes.feedback.textContent = "설명을 마쳤습니다. 바로 아래 문제에서 확인해 보세요.";
    }

    function scheduleAdvance() {
      clearAdvanceTimer();
      advanceTimer = browserWindow.setTimeout(advanceFromCheck, reduceMotion ? 350 : 900);
    }

    function renderBeat(nextBeatIndex, { schedule = true } = {}) {
      const scene = lesson.scenes[index];
      const beats = scene.beats?.length ? scene.beats : [{
        target: scene.focusToken,
        caption: scene.visualIdea,
        durationMs: 2200,
      }];
      clearBeatTimer();
      beatIndex = Math.max(0, Math.min(beats.length - 1, Number(nextBeatIndex) || 0));
      const beat = beats[beatIndex];
      nodes.focus.textContent = beat.target || scene.focusToken;
      nodes.idea.textContent = beat.caption || scene.visualIdea;
      stage.dataset.motionBeat = String(beatIndex + 1);
      stage.dataset.motionAction = beat.action || "highlight";
      stage.classList.remove("is-drawn");
      drawVisual(document, nodes.visual, scene, beat);
      nodes.visual.setAttribute("aria-label", beat.caption || scene.visualIdea);
      if (typeof browserWindow.requestAnimationFrame === "function") {
        browserWindow.requestAnimationFrame(() => stage.classList.add("is-drawn"));
      } else {
        stage.classList.add("is-drawn");
      }
      nodes.progress.textContent = `${index + 1}/${lesson.scenes.length} · 동작 ${beatIndex + 1}/${beats.length}`;
      if (schedule && !reduceMotion && beatIndex < beats.length - 1) {
        beatTimer = browserWindow.setTimeout(
          () => renderBeat(beatIndex + 1),
          beat.durationMs,
        );
      }
    }

    function renderScene(nextIndex, { fromNarration = false } = {}) {
      clearAdvanceTimer();
      index = Math.max(0, Math.min(lesson.scenes.length - 1, Number(nextIndex) || 0));
      const scene = lesson.scenes[index];
      const rawScene = story.scenes.find((entry) => entry.id === scene.id) || story.scenes[index];
      misses = 0;
      stage.dataset.visualMode = scene.visualMode;
      stage.dataset.motionAuthored = String(scene.authored === true);
      nodes.kind.textContent = kindLabels[scene.kind] || "장면";
      nodes.kindCopy.textContent = kindLabels[scene.kind] || "장면";
      nodes.progress.textContent = `${index + 1} / ${lesson.scenes.length}`;
      nodes.title.textContent = scene.title;
      nodes.subtitle.textContent = scene.subtitle;
      nodes.source.textContent = rawScene?.narration || "";
      nodes.source.hidden = true;
      nodes.sourceToggle.setAttribute("aria-expanded", "false");
      nodes.reexplain.hidden = true;
      nodes.check.hidden = false;
      nodes.feedback.textContent = "";
      nodes.dots.forEach((dot, dotIndex) => {
        if (dotIndex === index) dot.setAttribute("aria-current", "step");
        else dot.removeAttribute("aria-current");
      });
      renderBeat(reduceMotion ? Math.max(0, (scene.beats?.length || 1) - 1) : 0);
      showCheck({ pauseNarration: false });
      if (!fromNarration) narrationSession()?.pause?.();
    }

    function showCheck({ pauseNarration = true } = {}) {
      const scene = lesson.scenes[index];
      if (pauseNarration) {
        narrationSession()?.pause?.();
        clearBeatTimer();
      }
      nodes.check.hidden = false;
      nodes.checkPrompt.textContent = scene.check.prompt;
      nodes.choices.replaceChildren();
      nodes.feedback.textContent = "";
      scene.check.choices.forEach((choice, choiceIndex) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = choice;
        button.addEventListener("click", () => {
          narrationSession()?.pause?.();
          clearBeatTimer();
          const correct = choiceIndex === scene.check.answerIndex;
          if (correct) {
            nodes.feedback.textContent = `${scene.check.correctFeedback} ${
              index < lesson.scenes.length - 1
                ? "다음 장면으로 이어집니다."
                : "아래 연습 문제로 이어집니다."
            }`;
            nodes.feedback.dataset.result = "correct";
            nodes.choices.querySelectorAll("button").forEach((item) => { item.disabled = true; });
            scheduleAdvance();
          } else {
            misses += 1;
            nodes.feedback.textContent = scene.check.retryFeedback;
            nodes.feedback.dataset.result = "retry";
            button.disabled = true;
            if (misses >= 2) explain("mild");
          }
        });
        nodes.choices.append(button);
      });
    }

    function explain(mode) {
      const scene = lesson.scenes[index];
      narrationSession()?.pause?.();
      clearBeatTimer();
      const mild = mode !== "spicy" || misses >= 2;
      const copy = mild ? scene.mildExplanation : scene.spicyExplanation;
      nodes.reexplain.hidden = false;
      nodes.reexplain.dataset.mode = mild ? "mild" : "spicy";
      nodes.reexplain.textContent = `${mild ? "순한맛" : "매운맛"} · ${copy}`;
      stage.dataset.explanationMode = mild ? "mild" : "spicy";
      stage.classList.remove("is-drawn");
      if (typeof browserWindow.requestAnimationFrame === "function") {
        browserWindow.requestAnimationFrame(() => stage.classList.add("is-drawn"));
      } else {
        stage.classList.add("is-drawn");
      }
      speakReexplanation(browserWindow, copy, mild ? 0.58 : 0.78);
    }

    nodes.sourceToggle.addEventListener("click", () => {
      nodes.source.hidden = !nodes.source.hidden;
      nodes.sourceToggle.setAttribute("aria-expanded", String(!nodes.source.hidden));
    });
    rootNode.querySelectorAll("[data-motion-explain]").forEach((button) => {
      button.addEventListener("click", () => explain(button.dataset.motionExplain));
    });
    nodes.dots.forEach((dot) => {
      dot.addEventListener("click", () => renderScene(Number(dot.dataset.motionSceneIndex)));
    });
    document.addEventListener("matths:curriculum-narration-state", (event) => {
      const sceneId = event.detail?.chunk?.sceneId;
      const nextIndex = lesson.scenes.findIndex((scene) => scene.id === sceneId);
      if (nextIndex >= 0 && nextIndex !== index) renderScene(nextIndex, { fromNarration: true });
    });
    browserWindow.addEventListener?.("pagehide", () => {
      clearBeatTimer();
      clearAdvanceTimer();
    }, { once: true });

    renderScene(0, { fromNarration: true });
    return { renderScene, renderBeat, showCheck, explain };
  }

  root.MatthsCurriculumMotion = { drawVisual, mountCurriculumMotionLesson };
  const start = () => mountCurriculumMotionLesson(root.document, root);
  if (root.document?.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", start, { once: true });
  } else if (root.document) {
    start();
  }
})(typeof window !== "undefined" ? window : globalThis);
