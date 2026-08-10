(() => {
  const lab = document.querySelector("[data-common-math-concept]");
  if (!lab) return;

  const svg = lab.querySelector("#common-math-playground-visual");
  const formulaVisual = lab.querySelector("#common-math-formula-visual");
  const primary = lab.querySelector("#common-math-primary");
  const secondary = lab.querySelector("#common-math-secondary");
  const primaryOutput = lab.querySelector("#common-math-primary-output");
  const secondaryOutput = lab.querySelector("#common-math-secondary-output");
  const state = lab.querySelector("#common-math-state");
  const value = lab.querySelector("#common-math-value");
  const verdict = lab.querySelector("#common-math-verdict");
  const buttons = [...lab.querySelectorAll("[data-common-math-mode]")];
  const unit = lab.dataset.commonMathUnit;
  const concept = lab.dataset.commonMathConcept;
  const visualMode = lab.dataset.commonMathVisual || "formula";
  let mode = 0;

  if (!primary || !secondary || !state || !value || !verdict) return;

  const ns = "http://www.w3.org/2000/svg";
  const add = (tag, attributes = {}, content = "") => {
    if (!svg) return null;
    const node = document.createElementNS(ns, tag);
    Object.entries(attributes).forEach(([key, item]) => node.setAttribute(key, item));
    if (content) node.textContent = content;
    svg.appendChild(node);
    return node;
  };
  const line = (x1, y1, x2, y2, color = "#3157f6", width = 3, dash = "") =>
    add("line", {
      x1,
      y1,
      x2,
      y2,
      stroke: color,
      "stroke-width": width,
      "stroke-linecap": "round",
      ...(dash ? { "stroke-dasharray": dash } : {}),
    });
  const label = (x, y, content, color = "#26324b", size = 18, anchor = "middle") =>
    add("text", {
      x,
      y,
      fill: color,
      "font-size": size,
      "font-weight": 750,
      "text-anchor": anchor,
      "font-family": "SUIT, Pretendard, sans-serif",
    }, content);
  const dot = (cx, cy, r, fill = "#7558ff", opacity = 0.9) =>
    add("circle", { cx, cy, r, fill, opacity });

  function base() {
    if (!svg) return;
    svg.innerHTML = "";
    add("rect", { x: 0, y: 0, width: 720, height: 430, rx: 24, fill: "#f7f9ff" });
  }

  function drawAxes() {
    for (let x = 110; x <= 610; x += 50) line(x, 45, x, 385, "#e2e7f3", 1);
    for (let y = 65; y <= 365; y += 50) line(70, y, 660, y, "#e2e7f3", 1);
    line(70, 215, 660, 215, "#8290aa", 1.5);
    line(360, 35, 360, 390, "#8290aa", 1.5);
    label(650, 205, "x", "#6e7890", 14);
    label(374, 50, "y", "#6e7890", 14, "start");
  }

  function polylineFrom(fn, color = "#3157f6") {
    const segments = [];
    let current = [];
    for (let px = -5.5; px <= 5.5; px += 0.08) {
      const py = fn(px);
      if (!Number.isFinite(py) || Math.abs(py) > 6.5) {
        if (current.length > 1) segments.push(current);
        current = [];
        continue;
      }
      current.push(`${360 + px * 50},${215 - py * 28}`);
    }
    if (current.length > 1) segments.push(current);
    segments.forEach((points) => add("polyline", {
      points: points.join(" "),
      fill: "none",
      stroke: color,
      "stroke-width": 4,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }));
  }

  function renderQuadraticGraph(a, b) {
    drawAxes();
    const scale = Math.max(1, Math.min(4, a));
    const shift = b / 2;
    polylineFrom((x) => 0.22 * scale * (x - shift) ** 2 - 3.1);
    if (concept === "parabola-and-line") {
      polylineFrom((x) => 0.55 * x + b / 3, "#20a87d");
      label(560, 82, "포물선과 직선의 교점", "#3157f6", 16);
    } else if (concept === "quadratic-max-min-restricted") {
      line(180, 365, 540, 365, "#e09a2d", 5);
      line(180, 355, 180, 375, "#e09a2d", 3);
      line(540, 355, 540, 375, "#e09a2d", 3);
      label(360, 402, "구간의 끝점과 꼭짓점을 함께 비교", "#8a6427", 15);
    } else {
      label(535, 72, "방정식의 근 = x축과의 교점", "#3157f6", 16);
    }
    value.textContent = "식의 해와 그래프의 교점 정보를 같은 기준으로 읽습니다.";
  }

  function renderGeometry(a, b) {
    drawAxes();
    const x1 = 360 - a * 30;
    const y1 = 215 + b * 23;
    const x2 = 360 + a * 30;
    const y2 = 215 - b * 23;

    if (concept.includes("circle")) {
      const radius = Math.max(62, a * 25);
      add("circle", { cx: 360, cy: 215, r: radius, fill: "#3157f610", stroke: "#3157f6", "stroke-width": 4 });
      dot(360, 215, 7, "#3157f6");
      line(360, 215, 360 + radius, 215, "#3157f6", 3);
      label(390 + radius / 2, 201, "r", "#3157f6", 15);
      if (concept === "circle-line-position") {
        line(120, 305 - b * 10, 600, 115 - b * 10, "#20a87d", 4);
        label(535, 105, "중심과 직선 사이 거리 d", "#168466", 15);
      }
      value.textContent = concept === "circle-line-position"
        ? "중심과 직선 사이 거리 d를 반지름 r과 비교합니다."
        : "중심에서 같은 거리에 있는 점들의 모임을 확인합니다.";
      return;
    }

    line(x1, y1, x2, y2, "#3157f6", 4);
    dot(x1, y1, 9, "#e24ca6");
    dot(x2, y2, 9, "#20a87d");
    label(x1 - 18, y1 + 29, "A", "#b43685", 16);
    label(x2 + 18, y2 - 16, "B", "#168466", 16);
    if (concept.includes("translation") || concept.includes("reflection")) {
      line(x1 + 80, y1 - 55, x2 + 80, y2 - 55, "#8b72f2", 3, "8 7");
      label(570, 82, concept.includes("reflection") ? "대칭된 도형" : "이동한 도형", "#7658db", 16);
    }
    value.textContent = "좌표의 변화와 도형의 변화를 같은 화면에서 확인합니다.";
  }

  function renderFunction(a, b) {
    drawAxes();
    if (concept === "rational-function") {
      const p = b / 2;
      line(360 + p * 50, 40, 360 + p * 50, 390, "#e09a2d", 2, "8 7");
      polylineFrom((x) => Math.abs(x - p) < 0.08 ? NaN : a / (x - p));
      value.textContent = "정의역에서 제외되는 값과 점근선을 함께 확인합니다.";
    } else if (concept === "irrational-function") {
      const p = b / 2;
      polylineFrom((x) => x < p ? NaN : (a / 2) * Math.sqrt(x - p));
      dot(360 + p * 50, 215, 8, "#3157f6");
      value.textContent = "근호 안이 0 이상인 구간에서만 그래프가 시작됩니다.";
    } else if (concept === "inverse-function") {
      polylineFrom((x) => (a / 4) * x + b / 2);
      polylineFrom((x) => (4 / a) * (x - b / 2), "#20a87d");
      polylineFrom((x) => x, "#a4aec2");
      value.textContent = "함수와 역함수는 y=x를 기준으로 서로 대칭입니다.";
    } else {
      polylineFrom((x) => (a / 4) * x + b / 2);
      value.textContent = "입력 하나에 출력 하나가 대응되는 모습을 확인합니다.";
    }
  }

  function renderNumberLine(a, b) {
    line(95, 220, 625, 220, "#73809a", 3);
    for (let index = -4; index <= 4; index += 1) {
      const x = 360 + index * 58;
      line(x, 208, x, 232, "#73809a", 2);
      label(x, 258, String(index), "#6c7690", 14);
    }
    const left = Math.max(128, 360 - Math.abs(a) * 38);
    const right = Math.min(592, 360 + Math.abs(b || 2) * 38);
    line(left, 220, right, 220, "#3157f6", 10);
    add("circle", { cx: left, cy: 220, r: 9, fill: "#fff", stroke: "#3157f6", "stroke-width": 4 });
    add("circle", { cx: right, cy: 220, r: 9, fill: mode === 2 ? "#3157f6" : "#fff", stroke: "#3157f6", "stroke-width": 4 });
    label(360, 105, "해가 되는 공통 구간", "#26324b", 22);
    value.textContent = "각 조건의 해를 구한 뒤 수직선의 공통부분만 남깁니다.";
  }

  function renderCounting(a, b) {
    const columns = Math.max(2, Math.min(6, a));
    const rows = Math.max(2, Math.min(4, Math.abs(b) || 2));
    label(360, 64, `${columns}가지 선택 · ${rows}단계`, "#26324b", 22);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const x = 360 - ((columns - 1) * 58) / 2 + col * 58;
        const y = 130 + row * 70;
        dot(x, y, 15, row % 2 ? "#20a87d" : "#7658db");
        if (row < rows - 1) line(x, y + 17, x, y + 52, "#bdc6d8", 1.5);
      }
    }
    value.textContent = concept === "combinations"
      ? "순서를 구별하지 않는 같은 선택은 한 번만 셉니다."
      : concept === "permutations"
        ? "같은 대상을 뽑아도 순서가 다르면 다른 배열입니다."
        : "겹치지 않는 선택은 더하고 연속된 단계는 곱합니다.";
  }

  function renderMatrix(a, b) {
    const values = [[a, b], [b + 1, a + b]];
    label(360, 68, concept === "matrix-operations" ? "행 × 열의 대응" : "행과 열로 위치 읽기", "#26324b", 22);
    line(230, 110, 210, 110, "#73809a", 4);
    line(210, 110, 210, 340, "#73809a", 4);
    line(210, 340, 230, 340, "#73809a", 4);
    line(490, 110, 510, 110, "#73809a", 4);
    line(510, 110, 510, 340, "#73809a", 4);
    line(510, 340, 490, 340, "#73809a", 4);
    values.forEach((row, r) => row.forEach((entry, c) => {
      add("rect", { x: 250 + c * 130, y: 135 + r * 100, width: 90, height: 66, rx: 14, fill: c === r ? "#e6ebff" : "#f0f3fa", stroke: c === r ? "#3157f6" : "#c8d0df" });
      label(295 + c * 130, 177 + r * 100, String(entry), "#25314a", 26);
    }));
    value.textContent = "성분의 위치를 먼저 확인한 뒤 연산 규칙을 적용합니다.";
  }

  function renderSets(a, b) {
    add("circle", { cx: 305, cy: 225, r: 122, fill: "#6a52ff", opacity: 0.28, stroke: "#7658db", "stroke-width": 3 });
    add("circle", { cx: 415, cy: 225, r: 122, fill: "#23c9d8", opacity: 0.25, stroke: "#20a87d", "stroke-width": 3 });
    label(255, 125, "A", "#5840c6", 24);
    label(465, 125, "B", "#168466", 24);
    label(360, 232, mode === 0 ? "A∩B" : mode === 1 ? "A∪B" : "Aᶜ", "#26324b", 24);
    value.textContent = "집합의 연산을 필요한 영역만 남기는 방식으로 읽습니다.";
  }

  function renderMapping(a, b) {
    label(210, 68, "입력", "#26324b", 19);
    label(510, 68, "출력", "#26324b", 19);
    const count = Math.max(3, Math.min(5, a));
    for (let index = 0; index < count; index += 1) {
      const y = 120 + index * 60;
      dot(210, y, 15, "#7658db");
      dot(510, y, 15, "#20a87d");
      line(230, y, 490, 120 + ((index + Math.abs(b)) % count) * 60, "#8090b2", 2);
    }
    label(360, 395, "안쪽 함수의 출력을 바깥 함수의 입력으로 연결", "#566179", 15);
    value.textContent = "합성 순서를 바꾸면 입력과 출력의 연결도 달라집니다.";
  }

  function formulaSteps(a, b) {
    const products = {
      "polynomial-arithmetic": [`(${a}x+${b})+(${b}x-${a})`, `${a + b}x+(${b - a})`, "동류항끼리 계산"],
      "identity-remainder-theorem": [`P(x)=(x-${a})Q(x)+r`, `P(${a})=r`, "나머지를 함수값으로 확인"],
      "polynomial-factorization": [`x²+${a + b}x+${a * b}`, `(x+${a})(x+${b})`, "전개해 원래 식과 검산"],
      "complex-numbers": [`(${a}+${b}i)+(${b}-${a}i)`, `${a + b}+${b - a}i`, "실수부와 허수부를 따로 계산"],
      "quadratic-discriminant": [`${a}x²+${b}x-1=0`, `D=${b}²+4·${a}`, "D의 부호로 실근 개수 판단"],
      "quadratic-roots-and-coefficients": [`${a}x²+${b}x+1=0`, `α+β=-${b}/${a}, αβ=1/${a}`, "근을 직접 구하지 않고 대칭식 계산"],
      "cubic-and-quartic-equations": [`P(${a})=0`, `(x-${a})가 P(x)의 인수`, "차수를 낮춘 뒤 남은 방정식 해결"],
      "simultaneous-quadratic-equations": [`x+y=${a}`, `xy=${b}`, "대칭식 또는 치환으로 한 문자 식 만들기"],
      "proposition-and-condition": [`p → q`, `P ⊆ Q`, "진리집합의 포함으로 참·거짓 판단"],
      "converse-and-contrapositive": [`p → q`, `¬q → ¬p`, "원래 명제와 대우의 진리값 비교"],
      "sufficient-and-necessary-conditions": [`p → q`, "p는 충분, q는 필요", "양방향이면 필요충분조건"],
      "proof-by-contrapositive-and-contradiction": ["결론의 부정을 가정", "모순 도출", "처음 결론이 참임을 확인"],
      "absolute-inequality": [`(${a}-${b})² ≥ 0`, `${a}²+${b}² ≥ 2·${a}·${b}`, "등호 성립 조건까지 확인"],
    };
    return products[concept] || [`조건 a=${a}, b=${b}`, "정의에 대입", "원래 조건으로 검산"];
  }

  function renderFormula(a, b) {
    if (!formulaVisual) return;
    formulaVisual.innerHTML = "";
    formulaSteps(a, b).forEach((entry, index) => {
      const card = document.createElement("article");
      const badge = document.createElement("b");
      const content = document.createElement(index === 2 ? "p" : "strong");
      badge.textContent = String(index + 1).padStart(2, "0");
      content.textContent = entry;
      card.append(badge, content);
      formulaVisual.appendChild(card);
      if (index < 2) {
        const arrow = document.createElement("span");
        arrow.textContent = "→";
        arrow.setAttribute("aria-hidden", "true");
        formulaVisual.appendChild(arrow);
      }
    });
    value.textContent = formulaSteps(a, b)[2];
  }

  function render() {
    const a = Number(primary.value);
    const b = Number(secondary.value);
    primaryOutput.value = a;
    secondaryOutput.value = b;
    state.textContent = `a=${a}, b=${b} · ${buttons[mode]?.textContent.trim() || "조건 확인"}`;

    if (visualMode === "formula") {
      renderFormula(a, b);
    } else {
      base();
      if (visualMode === "graph") {
        if (unit === "coordinate-geometry") renderGeometry(a, b);
        else if (unit === "functions-and-graphs") renderFunction(a, b);
        else renderQuadraticGraph(a, b);
      } else if (["simultaneous-linear-inequalities", "absolute-linear-inequalities", "quadratic-inequalities"].includes(concept)) {
        renderNumberLine(a, b);
      } else if (unit === "counting") renderCounting(a, b);
      else if (unit === "matrices") renderMatrix(a, b);
      else if (unit === "sets-and-propositions") renderSets(a, b);
      else if (concept === "composite-function") renderMapping(a, b);
    }

    verdict.textContent = mode === 0
      ? "정의와 기준 대상을 먼저 확인했습니다."
      : mode === 1
        ? "바뀐 조건이 관계에 미치는 영향을 비교했습니다."
        : "결과를 원래 정의와 조건에 다시 대입해 검산했습니다.";
  }

  buttons.forEach((button, index) => button.addEventListener("click", () => {
    mode = index;
    buttons.forEach((item) => item.classList.toggle("active", item === button));
    render();
  }));
  primary.addEventListener("input", render);
  secondary.addEventListener("input", render);
  lab.querySelector("#rerun-common-math")?.addEventListener("click", render);
  render();
})();
