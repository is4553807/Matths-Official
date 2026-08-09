(() => {
  const lab = document.querySelector("[data-common-math-concept]");
  if (!lab) return;

  const svg = lab.querySelector("#common-math-playground-visual");
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
  let mode = 0;

  const ns = "http://www.w3.org/2000/svg";
  const add = (tag, attributes = {}, text = "") => {
    const node = document.createElementNS(ns, tag);
    Object.entries(attributes).forEach(([key, item]) => node.setAttribute(key, item));
    if (text) node.textContent = text;
    svg.appendChild(node);
    return node;
  };
  const line = (x1, y1, x2, y2, color = "#3dd9ff", width = 3) => add("line", { x1, y1, x2, y2, stroke: color, "stroke-width": width, "stroke-linecap": "round" });
  const text = (x, y, content, color = "#eaf1ff", size = 18) => add("text", { x, y, fill: color, "font-size": size, "font-weight": 700, "text-anchor": "middle", "font-family": "SUIT, Pretendard, sans-serif" }, content);
  const circle = (cx, cy, r, fill = "#7558ff", opacity = 0.85) => add("circle", { cx, cy, r, fill, opacity });

  function base() {
    svg.innerHTML = "";
    add("rect", { x: 0, y: 0, width: 720, height: 430, rx: 24, fill: "#071127" });
  }

  function drawAxes() {
    line(70, 215, 660, 215, "#465677", 1.5);
    line(360, 35, 360, 390, "#465677", 1.5);
    for (let x = 120; x <= 620; x += 50) line(x, 210, x, 220, "#465677", 1);
    for (let y = 65; y <= 365; y += 50) line(355, y, 365, y, "#465677", 1);
  }

  function renderPolynomial(a, b) {
    drawAxes();
    const points = [];
    for (let px = -5; px <= 5; px += 0.1) {
      const py = 0.32 * a * px * px + b * px - 2;
      points.push(`${360 + px * 50},${215 - py * 28}`);
    }
    add("polyline", { points: points.join(" "), fill: "none", stroke: "#35d6ff", "stroke-width": 4 });
    text(520, 65, mode === 0 ? "항을 모아 구조를 봅니다" : mode === 1 ? "그래프로 값을 확인합니다" : "조건을 바꾸어 검산합니다", "#9db0d8", 16);
    value.textContent = `계수 a=${a}, b=${b}인 식의 변화`;
  }

  function renderCounting(a, b) {
    const columns = Math.max(2, Math.min(6, a));
    const rows = Math.max(2, Math.min(5, Math.abs(b) || 2));
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        circle(170 + col * 72, 115 + row * 62, 18, row % 2 ? "#34d3c4" : "#765bff");
        if (row < rows - 1) line(170 + col * 72, 133 + row * 62, 170 + col * 72, 159 + row * 62, "#57729d", 1.5);
      }
    }
    text(360, 55, `${columns}가지 선택 × ${rows}단계`, "#c8d7ff", 22);
    value.textContent = `기본 경우의 수 ${columns ** rows}가지`;
  }

  function renderMatrix(a, b) {
    const values = [[a, b], [b + 1, a + b]];
    line(230, 95, 210, 95, "#7e91bc", 4); line(210, 95, 210, 330, "#7e91bc", 4); line(210, 330, 230, 330, "#7e91bc", 4);
    line(490, 95, 510, 95, "#7e91bc", 4); line(510, 95, 510, 330, "#7e91bc", 4); line(510, 330, 490, 330, "#7e91bc", 4);
    values.forEach((row, r) => row.forEach((entry, c) => {
      add("rect", { x: 250 + c * 130, y: 125 + r * 105, width: 90, height: 70, rx: 14, fill: c === r ? "#233a79" : "#14264f", stroke: "#4edcff" });
      text(295 + c * 130, 170 + r * 105, String(entry), "#ffffff", 28);
    }));
    value.textContent = `2×2 행렬, 성분의 합 ${values.flat().reduce((sum, n) => sum + n, 0)}`;
  }

  function renderGeometry(a, b) {
    drawAxes();
    const x1 = 360 - a * 35, y1 = 215 + b * 24;
    const x2 = 360 + a * 35, y2 = 215 - b * 24;
    line(x1, y1, x2, y2, "#39d8ff", 4);
    circle(x1, y1, 10, "#ff6fcf"); circle(x2, y2, 10, "#54e4be");
    text(x1 - 24, y1 + 30, `A`, "#ff9ee0", 18); text(x2 + 24, y2 - 18, `B`, "#8ff5d7", 18);
    if (concept.includes("circle")) add("circle", { cx: 360, cy: 215, r: Math.max(55, a * 28), fill: "none", stroke: "#7c62ff", "stroke-width": 4 });
    value.textContent = `좌표 차 (${2 * a}, ${-2 * b})를 그림과 식으로 확인`;
  }

  function renderSets(a, b) {
    add("circle", { cx: 305, cy: 215, r: 125, fill: "#6a52ff", opacity: 0.5, stroke: "#a697ff", "stroke-width": 3 });
    add("circle", { cx: 415, cy: 215, r: 125, fill: "#23c9d8", opacity: 0.45, stroke: "#77eff7", "stroke-width": 3 });
    text(255, 120, "A", "#ffffff", 24); text(465, 120, "B", "#ffffff", 24);
    text(360, 220, mode === 0 ? "A∩B" : mode === 1 ? "A∪B" : "조건 p→q", "#ffffff", 24);
    value.textContent = `집합 A의 원소 ${a}개, 조건값 ${b}`;
  }

  function renderFunction(a, b) {
    drawAxes();
    const points = [];
    for (let px = -5; px <= 5; px += 0.08) {
      let py;
      if (concept === "rational-function") py = Math.abs(px - b / 2) < 0.15 ? null : a / (px - b / 2);
      else if (concept === "irrational-function") py = px >= b / 2 ? Math.sqrt(px - b / 2) * a / 2 : null;
      else py = (a / 4) * px + b / 2;
      if (py === null || Math.abs(py) > 7) { if (points.length) points.push(" "); continue; }
      points.push(`${360 + px * 50},${215 - py * 35}`);
    }
    add("polyline", { points: points.join(" "), fill: "none", stroke: "#34d8ff", "stroke-width": 4 });
    line(100, 350, 620, 80, "#735fff", 2);
    value.textContent = `입력과 출력의 대응을 그래프에서 확인`;
  }

  function render() {
    const a = Number(primary.value), b = Number(secondary.value);
    primaryOutput.value = a; secondaryOutput.value = b;
    state.textContent = `a=${a}, b=${b}, 관점 ${mode + 1}`;
    base();
    if (unit === "counting") renderCounting(a, b);
    else if (unit === "matrices") renderMatrix(a, b);
    else if (unit === "coordinate-geometry") renderGeometry(a, b);
    else if (unit === "sets-and-propositions") renderSets(a, b);
    else if (unit === "functions-and-graphs") renderFunction(a, b);
    else renderPolynomial(a, b);
    verdict.textContent = mode === 0 ? "정의가 어떤 대상을 연결하는지 확인했습니다." : mode === 1 ? "식과 그림이 같은 변화를 나타냅니다." : "바뀐 조건을 원래 정의에 대입해 검산했습니다.";
    if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise([lab]).catch(() => {});
  }

  buttons.forEach((button) => button.addEventListener("click", () => {
    mode = Number(button.dataset.commonMathMode || 0);
    buttons.forEach((item) => item.classList.toggle("active", item === button));
    render();
  }));
  primary.addEventListener("input", render);
  secondary.addEventListener("input", render);
  lab.querySelector("#rerun-common-math")?.addEventListener("click", render);
  render();
})();
