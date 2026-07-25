(function () {
  "use strict";

  const configElement = document.getElementById(
    "concept-experience-config"
  );
  if (!configElement) return;

  const config = JSON.parse(configElement.textContent);
  const key = config.probabilityVisualKey;
  const profile = config.probabilityProfile || {};
  if (!key) return;

  const colors = {
    ink: "#17213b",
    muted: "#7b8499",
    grid: "#e4e8f2",
    blue: "#3157f6",
    green: "#20a078",
    purple: "#704bd7",
    red: "#e45f70",
    amber: "#d98b24",
    paleBlue: "#e7ecff",
    paleGreen: "#e1f5ef",
    palePurple: "#eee8ff",
    paleRed: "#fdecef",
  };

  function svgElement(name, attributes = {}) {
    const node = document.createElementNS(
      "http://www.w3.org/2000/svg",
      name
    );
    Object.entries(attributes).forEach(([attribute, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        node.setAttribute(attribute, String(value));
      }
    });
    return node;
  }

  function addText(svg, value, x, y, options = {}) {
    const node = svgElement("text", {
      x,
      y,
      fill: options.fill || colors.ink,
      "font-size": options.size || 16,
      "font-weight": options.weight || 700,
      "text-anchor": options.anchor || "middle",
      "font-family":
        "Pretendard, -apple-system, BlinkMacSystemFont, sans-serif",
    });
    node.textContent = value;
    svg.append(node);
    return node;
  }

  function addLine(svg, x1, y1, x2, y2, options = {}) {
    const line = svgElement("line", {
      x1,
      y1,
      x2,
      y2,
      stroke: options.stroke || colors.grid,
      "stroke-width": options.width || 2,
      "stroke-dasharray": options.dashed ? "7 7" : undefined,
      "stroke-linecap": "round",
    });
    svg.append(line);
    return line;
  }

  function addRect(svg, x, y, width, height, options = {}) {
    const rect = svgElement("rect", {
      x,
      y,
      width,
      height,
      rx: options.rx ?? 10,
      fill: options.fill || "#f5f7fb",
      stroke: options.stroke || colors.grid,
      "stroke-width": options.strokeWidth || 2,
      opacity: options.opacity,
    });
    svg.append(rect);
    return rect;
  }

  function title(svg, heading, note) {
    addText(svg, heading, 360, 35, { size: 18, weight: 800 });
    addText(svg, note, 360, 59, {
      size: 13,
      weight: 600,
      fill: colors.muted,
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function factorial(value) {
    let result = 1;
    for (let index = 2; index <= value; index += 1) {
      result *= index;
    }
    return result;
  }

  function binomialCoefficient(n, r) {
    if (r < 0 || r > n) return 0;
    let value = 1;
    const k = Math.min(r, n - r);
    for (let index = 1; index <= k; index += 1) {
      value = (value * (n - k + index)) / index;
    }
    return Math.round(value);
  }

  function seeded(seed) {
    let state = (seed + 1) * 104729;
    return function random() {
      state = (state * 48271) % 2147483647;
      return state / 2147483647;
    };
  }

  function drawCounting(svg, primary, secondary, phase) {
    const first = clamp(Math.round(primary), 2, 8);
    const second = clamp(Math.round(secondary), 1, 10);
    const mode = clamp(phase, 0, 2);

    if (mode === 0) {
      const choices = first;
      const slots = second;
      const shown = Math.min(slots, 8);
      const result = choices ** slots;
      title(
        svg,
        "자리를 채워도 선택지가 다시 열립니다.",
        `${choices}가지 선택 × ${slots}자리`
      );
      for (let index = 0; index < shown; index += 1) {
        const x = 90 + index * (540 / Math.max(1, shown - 1));
        addRect(svg, x - 25, 145, 50, 62, {
          rx: 13,
          fill: colors.paleBlue,
          stroke: colors.blue,
        });
        addText(svg, choices, x, 184, {
          size: 21,
          fill: colors.blue,
        });
        if (index < shown - 1) {
          addText(
            svg,
            "×",
            x + 270 / Math.max(1, shown - 1),
            184,
            { fill: colors.muted }
          );
        }
      }
      addText(svg, `${choices}^${slots} = ${result}`, 360, 285, {
        size: 30,
        fill: colors.blue,
      });
      addText(
        svg,
        "각 자리에서 같은 수의 선택이 반복됩니다.",
        360,
        329,
        { size: 14, fill: colors.muted }
      );
      return {
        state: `선택지 ${choices}가지 · 자리 ${slots}개`,
        value: `${result.toLocaleString("ko-KR")}가지`,
        verdict: "각 자리의 선택지 수를 곱합니다.",
        formula: `${choices}^{${slots}}=${result}`,
        tip: "첫 관점은 중복순열입니다. 한 자리를 채워도 선택지가 줄지 않는지 확인하세요.",
      };
    }

    const total = clamp(first, 3, 8);
    const same = clamp(second, 2, total - 1);
    const other = total - same;
    const twoGroups = mode === 2;
    const result = twoGroups
      ? factorial(total) / (factorial(same) * factorial(other))
      : factorial(total) / factorial(same);

    title(
      svg,
      twoGroups
        ? "같은 것끼리 바꾼 순서는 모두 접습니다."
        : "같은 것이 만든 중복 배열을 한 번만 셉니다.",
      twoGroups
        ? `전체 ${total}개 · 같은 것 ${same}개와 ${other}개`
        : `전체 ${total}개 · 같은 것 ${same}개`
    );
    const tokens = Array.from({ length: total }, (_, index) =>
      index < same ? "A" : twoGroups ? "B" : String(index - same + 1)
    );
    tokens.forEach((token, index) => {
      const x = 90 + index * (540 / Math.max(1, total - 1));
      addRect(svg, x - 22, 142, 44, 52, {
        rx: 22,
        fill:
          token === "A"
            ? colors.paleBlue
            : token === "B"
              ? colors.palePurple
              : "#f5f7fb",
        stroke:
          token === "A"
            ? colors.blue
            : token === "B"
              ? colors.purple
              : colors.grid,
      });
      addText(svg, token, x, 176, {
        size: 16,
        fill:
          token === "A"
            ? colors.blue
            : token === "B"
              ? colors.purple
              : colors.ink,
      });
    });
    addText(
      svg,
      twoGroups
        ? `${total}! ÷ (${same}! × ${other}!) = ${result}`
        : `${total}! ÷ ${same}! = ${result}`,
      360,
      277,
      { size: 27, fill: twoGroups ? colors.purple : colors.blue }
    );
    addText(
      svg,
      "같은 문자끼리의 자리 바꿈은 새 배열이 아닙니다.",
      360,
      326,
      { size: 14, fill: colors.muted }
    );
    return {
      state: twoGroups
        ? `전체 ${total}개 · A ${same}개 · B ${other}개`
        : `전체 ${total}개 · 같은 것 ${same}개`,
      value: `${result.toLocaleString("ko-KR")}가지`,
      verdict: "같은 것끼리 바꿔 생긴 중복만큼 나눕니다.",
      formula: twoGroups
        ? `\\frac{${total}!}{${same}!${other}!}=${result}`
        : `\\frac{${total}!}{${same}!}=${result}`,
      tip: "둘째·셋째 관점은 같은 것이 있는 순열입니다. 중복순열과 계산 원리가 다릅니다.",
    };
  }

  function drawStarsBars(svg, primary, secondary, phase, seed) {
    const types = clamp(Math.round(primary), 2, 7);
    const picks = clamp(Math.round(secondary), 1, 14);
    const random = seeded(seed + types * 19 + picks * 31);
    const cuts = Array.from({ length: types - 1 }, () =>
      Math.floor(random() * (picks + 1))
    ).sort((a, b) => a - b);
    const counts = [];
    let previous = 0;
    [...cuts, picks].forEach((cut) => {
      counts.push(cut - previous);
      previous = cut;
    });
    const tokens = [];
    counts.forEach((count, group) => {
      for (let index = 0; index < count; index += 1) tokens.push("★");
      if (group < counts.length - 1) tokens.push("|");
    });
    const totalSlots = picks + types - 1;
    const result = binomialCoefficient(totalSlots, picks);

    title(
      svg,
      "별은 선택 개수, 막대는 종류의 경계입니다.",
      `별 ${picks}개 · 막대 ${types - 1}개`
    );
    tokens.forEach((token, index) => {
      const x = 75 + index * (570 / Math.max(1, tokens.length - 1));
      addText(svg, token, x, 165, {
        size: token === "|" ? 34 : 22,
        fill: token === "|" ? colors.purple : colors.blue,
      });
    });
    addText(
      svg,
      counts.map((count, index) => `${index + 1}번:${count}`).join("  ·  "),
      360,
      225,
      { size: 14, fill: colors.muted }
    );
    addText(
      svg,
      `전체 ${totalSlots}자리 중 별 ${picks}자리 선택`,
      360,
      272,
      { size: 16 }
    );
    addText(svg, `C(${totalSlots}, ${picks}) = ${result}`, 360, 321, {
      size: 30,
      fill: colors.purple,
    });
    return {
      state: `${types}종류에서 중복을 허용해 ${picks}개`,
      value: `별 ${picks}개 · 막대 ${types - 1}개`,
      verdict: `${result.toLocaleString("ko-KR")}가지 중복조합`,
      formula: `{}_{${types}}H_{${picks}}=\\binom{${totalSlots}}{${picks}}=${result}`,
      tip: "막대는 종류 수보다 하나 적습니다. 다시 만들면 배분만 바뀌고 경우의 수는 같습니다.",
    };
  }

  function drawPascal(svg, primary, secondary) {
    const n = clamp(Math.round(primary), 2, 10);
    const r = clamp(Math.round(secondary), 0, n);
    const result = binomialCoefficient(n, r);
    title(
      svg,
      "파스칼 삼각형의 수가 이항계수입니다.",
      `${n}번째 행 · b를 ${r}번 선택`
    );
    for (let row = 0; row <= n; row += 1) {
      const y = 82 + row * (275 / n);
      for (let column = 0; column <= row; column += 1) {
        const x = 360 + (column - row / 2) * 52;
        const active = row === n && column === r;
        const circle = svgElement("circle", {
          cx: x,
          cy: y,
          r: active ? 22 : 16,
          fill: active ? colors.blue : "#f3f5fa",
          stroke: active ? colors.blue : colors.grid,
          "stroke-width": 2,
        });
        svg.append(circle);
        addText(svg, binomialCoefficient(row, column), x, y + 4, {
          size: active ? 14 : 11,
          fill: active ? "#fff" : colors.ink,
        });
      }
    }
    return {
      state: `n=${n}, r=${r}`,
      value: `${result.toLocaleString("ko-KR")}`,
      verdict: `a를 ${n - r}번, b를 ${r}번 고르는 항의 계수`,
      formula: `\\binom{${n}}{${r}}=${result}`,
      tip: "r이 n보다 크면 안 됩니다. 슬라이더가 커도 실제 항은 r=n에서 멈춥니다.",
    };
  }

  function drawFrequency(svg, primary, secondary, phase, seed) {
    const trials = clamp(Math.round(primary), 20, 500);
    const probability = clamp(secondary, 0.1, 0.9);
    const random = seeded(seed + trials * 7);
    let successes = 0;
    const points = [];
    for (let index = 1; index <= trials; index += 1) {
      if (random() < probability) successes += 1;
      if (index === 1 || index % Math.max(1, Math.floor(trials / 100)) === 0) {
        points.push([index, successes / index]);
      }
    }
    const observed = successes / trials;
    title(
      svg,
      "시행이 쌓이면 상대도수가 확률에 가까워집니다.",
      `이론적 확률 ${probability.toFixed(2)} · 시행 ${trials}회`
    );
    addLine(svg, 75, 340, 650, 340, { stroke: colors.muted });
    addLine(svg, 75, 90, 75, 340, { stroke: colors.muted });
    const theoryY = 340 - probability * 240;
    addLine(svg, 75, theoryY, 650, theoryY, {
      stroke: colors.red,
      width: 3,
      dashed: true,
    });
    addText(svg, `p=${probability.toFixed(2)}`, 642, theoryY - 10, {
      anchor: "end",
      size: 12,
      fill: colors.red,
    });
    const path = svgElement("path", {
      d: points
        .map(([xValue, yValue], index) => {
          const x = 75 + (xValue / trials) * 575;
          const y = 340 - yValue * 240;
          return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" "),
      fill: "none",
      stroke: colors.blue,
      "stroke-width": 4,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    });
    svg.append(path);
    addText(svg, "시행 횟수", 645, 373, {
      anchor: "end",
      size: 12,
      fill: colors.muted,
    });
    return {
      state: `${successes}번 성공 / ${trials}번 시행`,
      value: `상대도수 ${observed.toFixed(3)}`,
      verdict:
        phase === 2
          ? "모든 사건의 확률은 0 이상 1 이하입니다."
          : `이론값과의 차이 ${Math.abs(observed - probability).toFixed(3)}`,
      formula:
        phase === 2
          ? `0\\le P(A)\\le 1`
          : `\\frac{${successes}}{${trials}}=${observed.toFixed(3)}\\;\\longrightarrow\\;${probability.toFixed(2)}`,
      tip: "다시 실행하면 초반 경로는 달라져도 시행 횟수가 커질수록 이론값 주변으로 모입니다.",
    };
  }

  function drawVenn(svg, primary, secondary, phase) {
    const probabilityA = clamp(primary, 0.1, 0.9);
    const probabilityB = clamp(secondary, 0.1, 0.9);
    const lower = Math.max(0, probabilityA + probabilityB - 1);
    const upper = Math.min(probabilityA, probabilityB);
    const overlap = lower + (upper - lower) * 0.45;
    const union = probabilityA + probabilityB - overlap;
    title(
      svg,
      "두 사건을 더할 때 겹친 부분은 한 번 뺍니다.",
      `P(A)=${probabilityA.toFixed(2)} · P(B)=${probabilityB.toFixed(2)}`
    );
    addRect(svg, 65, 88, 590, 270, {
      rx: 24,
      fill: "#f8f9fc",
    });
    [
      [305, colors.blue, colors.paleBlue, "A"],
      [415, colors.purple, colors.palePurple, "B"],
    ].forEach(([cx, stroke, fill, label], index) => {
      const circle = svgElement("circle", {
        cx,
        cy: 220,
        r: 108,
        fill,
        "fill-opacity": phase === index ? 0.95 : 0.65,
        stroke,
        "stroke-width": phase === index ? 5 : 3,
      });
      svg.append(circle);
      addText(svg, label, cx + (index ? 48 : -48), 219, {
        fill: stroke,
        size: 22,
      });
    });
    addText(svg, `겹침 ${overlap.toFixed(2)}`, 360, 225, {
      size: 14,
    });
    addText(svg, `합집합 ${union.toFixed(2)}`, 360, 381, {
      size: 18,
      fill: colors.blue,
    });
    return {
      state: `P(A)=${probabilityA.toFixed(2)}, P(B)=${probabilityB.toFixed(2)}`,
      value: `P(A∩B)=${overlap.toFixed(2)}`,
      verdict: `P(A∪B)=${union.toFixed(2)}`,
      formula: `P(A\\cup B)=${probabilityA.toFixed(2)}+${probabilityB.toFixed(2)}-${overlap.toFixed(2)}=${union.toFixed(2)}`,
      tip: "원의 실제 넓이보다 식의 역할을 보세요. A와 B에 두 번 들어간 교집합을 한 번 뺍니다.",
    };
  }

  function drawComplement(svg, primary, secondary, phase, seed) {
    const trials = clamp(Math.round(primary), 1, 10);
    const probability = clamp(secondary, 0.1, 0.9);
    const none = (1 - probability) ** trials;
    const atLeastOne = 1 - none;
    const random = seeded(seed + trials * 43);
    const outcomes = Array.from(
      { length: trials },
      () => random() < probability
    );
    title(
      svg,
      "‘적어도 한 번’을 ‘한 번도 없음’으로 바꿉니다.",
      `${trials}번 독립시행 · 한 번 성공확률 ${probability.toFixed(2)}`
    );
    outcomes.forEach((success, index) => {
      const x = 95 + index * (530 / Math.max(1, trials - 1));
      addRect(svg, x - 24, 135, 48, 58, {
        rx: 14,
        fill: success ? colors.paleBlue : "#f2f4f8",
        stroke: success ? colors.blue : colors.grid,
      });
      addText(svg, success ? "성공" : "실패", x, 170, {
        size: 11,
        fill: success ? colors.blue : colors.muted,
      });
    });
    addText(svg, `한 번도 성공하지 않을 확률 ${(none).toFixed(4)}`, 360, 263, {
      size: 18,
      fill: colors.muted,
    });
    addText(svg, `1 − ${(none).toFixed(4)} = ${atLeastOne.toFixed(4)}`, 360, 316, {
      size: 28,
      fill: colors.blue,
    });
    return {
      state: `${trials}회 · p=${probability.toFixed(2)}`,
      value: `P(한 번도 없음)=${none.toFixed(4)}`,
      verdict: `P(적어도 한 번)=${atLeastOne.toFixed(4)}`,
      formula: `1-(1-${probability.toFixed(2)})^{${trials}}=${atLeastOne.toFixed(4)}`,
      tip: "화면의 시행 결과는 예시이고, 정확한 확률은 모든 가능한 결과를 여사건으로 계산한 값입니다.",
    };
  }

  function drawConditional(svg, primary, secondary, phase) {
    const groupA = clamp(Math.round(primary), 10, 100);
    const ratio = clamp(secondary, 0.1, 0.9);
    const intersection = Math.round(groupA * ratio);
    const outside = Math.max(10, Math.round(groupA * 0.5));
    title(
      svg,
      "조건 A가 새 표본공간이 됩니다.",
      `A 안의 ${groupA}명 중 B에도 속한 사람 ${intersection}명`
    );
    addRect(svg, 90, 105, 540, 225, {
      rx: 18,
      fill: "#f8f9fc",
    });
    const total = groupA + outside;
    const columns = 15;
    for (let index = 0; index < total; index += 1) {
      const inA = index < groupA;
      const inBoth = index < intersection;
      const x = 126 + (index % columns) * 34;
      const y = 135 + Math.floor(index / columns) * 30;
      const dot = svgElement("circle", {
        cx: x,
        cy: y,
        r: inBoth ? 9 : 7,
        fill: inBoth
          ? colors.purple
          : inA
            ? colors.paleBlue
            : "#dfe4ef",
        stroke: inA ? colors.blue : "none",
        "stroke-width": inBoth ? 2 : 1,
        opacity: !inA && phase > 0 ? 0.25 : 1,
      });
      svg.append(dot);
    }
    addText(svg, "조건 A", 110, 91, {
      anchor: "start",
      size: 13,
      fill: colors.blue,
    });
    addText(svg, "A∩B", 610, 91, {
      anchor: "end",
      size: 13,
      fill: colors.purple,
    });
    addText(svg, `${intersection} ÷ ${groupA} = ${(intersection / groupA).toFixed(3)}`, 360, 380, {
      size: 25,
      fill: colors.purple,
    });
    return {
      state: `조건 A: ${groupA}명`,
      value: `A∩B: ${intersection}명`,
      verdict: `P(B|A)=${(intersection / groupA).toFixed(3)}`,
      formula: `P(B\\mid A)=\\frac{P(A\\cap B)}{P(A)}=\\frac{${intersection}}{${groupA}}`,
      tip: "분모는 전체 인원이 아니라 조건 A에 남은 인원입니다.",
    };
  }

  function drawIndependence(svg, primary, secondary, phase, seed) {
    const probabilityA = clamp(primary, 0.1, 0.9);
    const probabilityB = clamp(secondary, 0.1, 0.9);
    const expected = probabilityA * probabilityB;
    const offsets = [-0.06, 0, 0.07];
    const observed = clamp(
      expected + offsets[seed % offsets.length],
      0,
      Math.min(probabilityA, probabilityB)
    );
    const independent = Math.abs(observed - expected) < 0.001;
    title(
      svg,
      "관측한 교집합과 두 확률의 곱을 비교합니다.",
      `독립 기준 P(A)P(B)=${expected.toFixed(2)}`
    );
    const values = [
      ["관측 P(A∩B)", observed, colors.purple],
      ["독립 기준 P(A)P(B)", expected, colors.blue],
    ];
    values.forEach(([label, value, color], index) => {
      const y = 145 + index * 105;
      addText(svg, label, 90, y, {
        anchor: "start",
        size: 14,
        fill: colors.muted,
      });
      addRect(svg, 90, y + 18, 520, 28, {
        rx: 14,
        fill: "#f1f3f8",
        stroke: "#f1f3f8",
      });
      addRect(svg, 90, y + 18, 520 * value, 28, {
        rx: 14,
        fill: color,
        stroke: color,
      });
      addText(svg, value.toFixed(2), 630, y + 40, {
        anchor: "end",
        size: 15,
        fill: color,
      });
    });
    addText(
      svg,
      independent ? "두 값이 같음 → 독립" : "두 값이 다름 → 독립 아님",
      360,
      365,
      {
        size: 22,
        fill: independent ? colors.green : colors.red,
      }
    );
    return {
      state: `P(A)=${probabilityA.toFixed(2)}, P(B)=${probabilityB.toFixed(2)}`,
      value: `관측 교집합 ${observed.toFixed(2)} · 곱 ${expected.toFixed(2)}`,
      verdict: independent ? "독립으로 판정" : "독립이 아님",
      formula: `P(A\\cap B)${independent ? "=" : "\\ne"}P(A)P(B)`,
      tip: "다시 실행해 관측 교집합을 바꾸고, 두 값이 같을 때만 독립인지 확인하세요.",
    };
  }

  function drawTree(svg, primary, secondary, phase) {
    const first = clamp(primary, 0.1, 0.9);
    const second = clamp(secondary, 0.1, 0.9);
    const result = first * second;
    title(
      svg,
      "한 경로 안에서는 가지 확률을 곱합니다.",
      `P(A)=${first.toFixed(2)} · P(B|A)=${second.toFixed(2)}`
    );
    const nodes = [
      [100, 220, "시작"],
      [340, 130, "A"],
      [340, 310, "Aᶜ"],
      [620, 95, "B"],
      [620, 165, "Bᶜ"],
      [620, 275, "B"],
      [620, 345, "Bᶜ"],
    ];
    [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]].forEach(
      ([from, to], index) => {
        const active = index === 0 || index === 2;
        addLine(
          svg,
          nodes[from][0] + 28,
          nodes[from][1],
          nodes[to][0] - 28,
          nodes[to][1],
          {
            stroke: active ? colors.blue : colors.grid,
            width: active ? 5 : 2,
          }
        );
      }
    );
    nodes.forEach(([x, y, label], index) => {
      const active = [0, 1, 3].includes(index);
      const circle = svgElement("circle", {
        cx: x,
        cy: y,
        r: 28,
        fill: active ? colors.paleBlue : "#f5f7fb",
        stroke: active ? colors.blue : colors.grid,
        "stroke-width": 2,
      });
      svg.append(circle);
      addText(svg, label, x, y + 5, { size: 13 });
    });
    addText(svg, first.toFixed(2), 220, 157, {
      size: 13,
      fill: colors.blue,
    });
    addText(svg, second.toFixed(2), 485, 108, {
      size: 13,
      fill: colors.blue,
    });
    addText(svg, `${first.toFixed(2)} × ${second.toFixed(2)} = ${result.toFixed(3)}`, 360, 400, {
      size: 24,
      fill: colors.blue,
    });
    return {
      state: `첫 가지 ${first.toFixed(2)} · 둘째 가지 ${second.toFixed(2)}`,
      value: `선택한 경로 ${result.toFixed(3)}`,
      verdict: "같은 결과의 다른 경로가 있으면 경로끼리는 더합니다.",
      formula: `P(A\\cap B)=P(A)P(B\\mid A)=${result.toFixed(3)}`,
      tip: "가지에서 가지로 이동할 때는 곱하고, 서로 다른 경로를 합칠 때는 더합니다.",
    };
  }

  function normalizedDistribution(maximum, skew) {
    const values = Array.from({ length: maximum + 1 }, (_, index) => {
      const position = index / maximum;
      return 0.2 + Math.exp((skew - 0.5) * 4 * position);
    });
    const sum = values.reduce((total, value) => total + value, 0);
    return values.map((value) => value / sum);
  }

  function drawDistribution(svg, primary, secondary) {
    const maximum = clamp(Math.round(primary), 2, 8);
    const skew = clamp(secondary, 0.1, 0.9);
    const probabilities = normalizedDistribution(maximum, skew);
    const sum = probabilities.reduce((total, value) => total + value, 0);
    title(
      svg,
      "가능한 값마다 확률을 하나씩 대응시킵니다.",
      `X=0,1,…,${maximum} · 확률의 합 ${sum.toFixed(2)}`
    );
    const maxProbability = Math.max(...probabilities);
    probabilities.forEach((probability, index) => {
      const width = 500 / probabilities.length;
      const height = (probability / maxProbability) * 220;
      addRect(svg, 110 + index * width, 335 - height, width - 10, height, {
        rx: 5,
        fill: colors.blue,
        stroke: colors.blue,
      });
      addText(svg, index, 110 + index * width + (width - 10) / 2, 363, {
        size: 12,
        fill: colors.muted,
      });
      addText(
        svg,
        probability.toFixed(2),
        110 + index * width + (width - 10) / 2,
        326 - height,
        { size: 10, fill: colors.blue }
      );
    });
    return {
      state: `X의 가능한 값: 0부터 ${maximum}`,
      value: `확률의 합 ${sum.toFixed(2)}`,
      verdict: "각 확률은 0 이상이고 전체 합은 1입니다.",
      formula: `\\sum_{x=0}^{${maximum}}P(X=x)=1`,
      tip: "막대 모양이 달라도 모든 확률분포는 확률이 음수가 아니고 합이 1이어야 합니다.",
    };
  }

  function drawExpectation(svg, primary, secondary, phase) {
    const outcome = clamp(Math.round(primary), 2, 12);
    const probability = clamp(secondary, 0.1, 0.9);
    const mean = outcome * probability;
    const variance =
      outcome ** 2 * probability - mean ** 2;
    const standardDeviation = Math.sqrt(variance);
    title(
      svg,
      "기댓값은 결과값에 확률을 단 무게중심입니다.",
      `P(X=0)=${(1 - probability).toFixed(2)} · P(X=${outcome})=${probability.toFixed(2)}`
    );
    addLine(svg, 95, 250, 625, 250, {
      stroke: colors.ink,
      width: 5,
    });
    const leftX = 115;
    const rightX = 605;
    const meanX = leftX + (mean / outcome) * (rightX - leftX);
    [
      [leftX, 0, 1 - probability, colors.purple],
      [rightX, outcome, probability, colors.blue],
    ].forEach(([x, value, weight, color]) => {
      const circle = svgElement("circle", {
        cx: x,
        cy: 250,
        r: 18 + weight * 35,
        fill: color,
        "fill-opacity": 0.85,
      });
      svg.append(circle);
      addText(svg, `X=${value}`, x, 335, { size: 14, fill: color });
      addText(svg, `무게 ${weight.toFixed(2)}`, x, 112, {
        size: 13,
        fill: color,
      });
    });
    addLine(svg, meanX, 125, meanX, 285, {
      stroke: colors.red,
      width: 4,
      dashed: true,
    });
    addText(svg, `E(X)=${mean.toFixed(2)}`, meanX, 105, {
      size: 18,
      fill: colors.red,
    });
    if (phase === 2) {
      addText(
        svg,
        `V(X)=${variance.toFixed(2)}  ·  σ=${standardDeviation.toFixed(2)}`,
        360,
        390,
        { size: 18, fill: colors.purple }
      );
    }
    return {
      state: `결과 0 또는 ${outcome}`,
      value: `기댓값 ${mean.toFixed(2)}`,
      verdict:
        phase === 2
          ? `분산 ${variance.toFixed(2)} · 표준편차 ${standardDeviation.toFixed(2)}`
          : "기댓값은 가장 자주 나오는 값이 아니라 장기 평균입니다.",
      formula:
        phase === 2
          ? `V(X)=E(X^2)-\\{E(X)\\}^2=${variance.toFixed(2)},\\quad \\sigma=${standardDeviation.toFixed(2)}`
          : `E(X)=0\\cdot${(1 - probability).toFixed(2)}+${outcome}\\cdot${probability.toFixed(2)}=${mean.toFixed(2)}`,
      tip: "확률이 큰 결과 쪽으로 무게중심이 이동하지만, 실제 한 번의 결과일 필요는 없습니다.",
    };
  }

  function binomialValues(n, probability) {
    return Array.from({ length: n + 1 }, (_, index) =>
      binomialCoefficient(n, index) *
      probability ** index *
      (1 - probability) ** (n - index)
    );
  }

  function drawBinomial(svg, primary, secondary, phase) {
    const n = clamp(Math.round(primary), 2, 20);
    const probability = clamp(secondary, 0.1, 0.9);
    const values = binomialValues(n, probability);
    const mean = n * probability;
    const variance = n * probability * (1 - probability);
    const standardDeviation = Math.sqrt(variance);
    const maxValue = Math.max(...values);
    title(
      svg,
      "성공 횟수의 확률이 이항분포를 만듭니다.",
      `${n}번 독립시행 · 성공확률 ${probability.toFixed(2)}`
    );
    values.forEach((value, index) => {
      const width = 540 / values.length;
      const height = (value / maxValue) * 225;
      addRect(svg, 90 + index * width, 340 - height, Math.max(4, width - 3), height, {
        rx: 3,
        fill: Math.abs(index - mean) < 0.75 ? colors.purple : colors.blue,
        stroke: "none",
        strokeWidth: 0,
      });
      if (values.length <= 12 || index % 2 === 0) {
        addText(svg, index, 90 + index * width + width / 2, 365, {
          size: 10,
          fill: colors.muted,
        });
      }
    });
    const meanX = 90 + (mean + 0.5) * (540 / values.length);
    addLine(svg, meanX, 90, meanX, 340, {
      stroke: colors.red,
      width: 3,
      dashed: true,
    });
    addText(svg, `np=${mean.toFixed(1)}`, meanX, 82, {
      size: 13,
      fill: colors.red,
    });
    return {
      state: `X~B(${n}, ${probability.toFixed(2)})`,
      value: `평균 np=${mean.toFixed(2)}`,
      verdict: `분산 ${variance.toFixed(2)} · 표준편차 ${standardDeviation.toFixed(2)}`,
      formula:
        phase === 2
          ? `E(X)=np=${mean.toFixed(2)},\\quad \\sigma=\\sqrt{npq}=${standardDeviation.toFixed(2)}`
          : `P(X=k)=\\binom{${n}}{k}${probability.toFixed(2)}^k${(1 - probability).toFixed(2)}^{${n}-k}`,
      tip: "n은 시행 횟수, p는 매 시행에서 일정한 성공확률입니다.",
    };
  }

  function normalDensity(x, mean, standardDeviation) {
    return Math.exp(
      -0.5 * ((x - mean) / standardDeviation) ** 2
    );
  }

  function drawNormalApproximation(svg, primary, secondary, phase) {
    const n = clamp(Math.round(primary), 10, 100);
    const probability = clamp(secondary, 0.1, 0.9);
    const mean = n * probability;
    const standardDeviation = Math.sqrt(
      n * probability * (1 - probability)
    );
    const values = binomialValues(n, probability);
    const maxValue = Math.max(...values);
    title(
      svg,
      "이항분포의 막대 위에 정규곡선을 겹칩니다.",
      `μ=np=${mean.toFixed(1)} · σ=√npq=${standardDeviation.toFixed(2)}`
    );
    const leftValue = Math.max(0, mean - 4 * standardDeviation);
    const rightValue = Math.min(n, mean + 4 * standardDeviation);
    const span = Math.max(1, rightValue - leftValue);
    values.forEach((value, index) => {
      if (index < leftValue || index > rightValue) return;
      const x = 80 + ((index - leftValue) / span) * 560;
      const width = Math.max(3, 560 / span - 2);
      const height = (value / maxValue) * 225;
      addRect(svg, x, 340 - height, width, height, {
        rx: 2,
        fill: phase === 0 ? colors.blue : colors.paleBlue,
        stroke: "none",
      });
    });
    const curvePoints = [];
    for (let index = 0; index <= 180; index += 1) {
      const xValue = leftValue + (span * index) / 180;
      curvePoints.push([
        80 + (560 * index) / 180,
        340 -
          225 *
            normalDensity(xValue, mean, standardDeviation),
      ]);
    }
    const path = svgElement("path", {
      d: curvePoints
        .map(([x, y], index) =>
          `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`
        )
        .join(" "),
      fill: "none",
      stroke: phase === 0 ? colors.muted : colors.purple,
      "stroke-width": phase === 0 ? 2 : 5,
      opacity: phase === 0 ? 0.45 : 1,
    });
    svg.append(path);
    const meanX = 80 + ((mean - leftValue) / span) * 560;
    addLine(svg, meanX, 90, meanX, 340, {
      stroke: colors.red,
      width: 3,
      dashed: true,
    });
    addText(svg, "연속성 보정: k±0.5", 360, 390, {
      size: 13,
      fill: phase === 2 ? colors.red : colors.muted,
    });
    return {
      state: `X~B(${n}, ${probability.toFixed(2)})`,
      value: `μ=${mean.toFixed(2)}, σ=${standardDeviation.toFixed(2)}`,
      verdict:
        n * probability >= 5 &&
        n * (1 - probability) >= 5
          ? "np와 nq가 충분히 커 정규근사가 적절합니다."
          : "한쪽 꼬리가 짧아 정규근사에 주의가 필요합니다.",
      formula:
        phase === 2
          ? `Z=\\frac{X-${mean.toFixed(2)}}{${standardDeviation.toFixed(2)}}`
          : `X\\approx N\\!\\left(${mean.toFixed(2)},${(standardDeviation ** 2).toFixed(2)}\\right)`,
      tip: "막대는 이항분포, 곡선은 정규근사입니다. 둘을 같은 분포처럼 단정하지 마세요.",
    };
  }

  function drawSampling(svg, primary, secondary, phase, seed) {
    const population = 60;
    const sampleSize = clamp(Math.round(primary), 5, 40);
    const bias = clamp(secondary, 0, 1);
    const random = seeded(seed + sampleSize * 47);
    const weighted = Array.from({ length: population }, (_, index) => ({
      index,
      score: random() + bias * (index / population) * 1.25,
    }))
      .sort((a, b) => a.score - b.score)
      .slice(0, sampleSize);
    const selected = new Set(weighted.map((item) => item.index));
    title(
      svg,
      bias > 0.05
        ? "선택 편향이 있으면 한쪽 집단이 과대표집됩니다."
        : "무작위 추출은 모집단 전체에 기회를 줍니다.",
      `모집단 ${population}명 · 표본 ${sampleSize}명 · 편향 ${bias.toFixed(1)}`
    );
    for (let index = 0; index < population; index += 1) {
      const column = index % 12;
      const row = Math.floor(index / 12);
      const chosen = selected.has(index);
      const circle = svgElement("circle", {
        cx: 118 + column * 44,
        cy: 112 + row * 53,
        r: chosen ? 13 : 9,
        fill: chosen ? colors.blue : "#dfe4ef",
        stroke: chosen ? "#fff" : "none",
        "stroke-width": 3,
      });
      svg.append(circle);
    }
    addText(svg, "왼쪽 집단", 100, 390, {
      anchor: "start",
      size: 12,
      fill: colors.muted,
    });
    addText(svg, "오른쪽 집단", 620, 390, {
      anchor: "end",
      size: 12,
      fill: colors.muted,
    });
    return {
      state: `모집단 ${population}명 · 표본 ${sampleSize}명`,
      value: `추출률 ${((sampleSize / population) * 100).toFixed(1)}%`,
      verdict:
        bias > 0.05
          ? "표본 크기가 커도 선택 편향은 남습니다."
          : "모든 위치에 비슷한 선택 기회가 있습니다.",
      formula: bias > 0.05
        ? "\\text{large sample}\\;\\not\\Rightarrow\\;\\text{unbiased sample}"
        : "\\text{population}\\;\\longrightarrow\\;\\text{random sample}",
      tip: "표본의 크기와 대표성은 별개입니다. 편향을 올려 뽑힌 위치가 치우치는지 보세요.",
    };
  }

  function drawSamplingDistribution(svg, primary, secondary) {
    const sampleSize = clamp(Math.round(primary), 4, 100);
    const populationSd = clamp(secondary, 2, 20);
    const standardError = populationSd / Math.sqrt(sampleSize);
    title(
      svg,
      "표본평균의 분포는 모평균을 중심으로 모입니다.",
      `n=${sampleSize} · σ=${populationSd} · 표준오차 ${standardError.toFixed(2)}`
    );
    addLine(svg, 70, 340, 650, 340, { stroke: colors.muted });
    const points = [];
    for (let index = 0; index <= 180; index += 1) {
      const z = -4 + (8 * index) / 180;
      points.push([
        80 + (560 * index) / 180,
        340 - 235 * Math.exp(-0.5 * z ** 2),
      ]);
    }
    const path = svgElement("path", {
      d: points
        .map(([x, y], index) =>
          `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`
        )
        .join(" "),
      fill: colors.paleBlue,
      "fill-opacity": 0.45,
      stroke: colors.blue,
      "stroke-width": 5,
    });
    svg.append(path);
    addLine(svg, 360, 92, 360, 340, {
      stroke: colors.red,
      width: 3,
      dashed: true,
    });
    addText(svg, "μ", 360, 375, {
      size: 18,
      fill: colors.red,
    });
    addText(
      svg,
      `μ−SE                 μ                 μ+SE`,
      360,
      405,
      { size: 12, fill: colors.muted }
    );
    return {
      state: `표본크기 n=${sampleSize} · 모표준편차 σ=${populationSd}`,
      value: `표준오차 ${standardError.toFixed(3)}`,
      verdict: "n이 커질수록 표본평균의 흔들림이 줄어듭니다.",
      formula: `SD(\\bar X)=\\frac{${populationSd}}{\\sqrt{${sampleSize}}}=${standardError.toFixed(3)}`,
      tip: "표본 자체의 퍼짐 σ와 표본평균의 퍼짐 σ/√n을 구분하세요.",
    };
  }

  function drawConfidence(svg, primary, secondary, phase, seed) {
    const sampleSize = clamp(Math.round(primary), 10, 200);
    const levelIndex = clamp(Math.round(secondary), 0, 2);
    const levels = [0.9, 0.95, 0.99];
    const criticals = [1.645, 1.96, 2.576];
    const level = levels[levelIndex];
    const critical = criticals[levelIndex];
    const populationSd = 10;
    const margin = critical * populationSd / Math.sqrt(sampleSize);
    const center = 50 + ((seed % 5) - 2) * 0.8;
    title(
      svg,
      "신뢰수준과 표본크기가 구간의 폭을 정합니다.",
      `${Math.round(level * 100)}% 신뢰수준 · n=${sampleSize}`
    );
    addLine(svg, 75, 230, 645, 230, {
      stroke: colors.muted,
      width: 3,
    });
    const scale = 32;
    const left = 360 - margin * scale;
    const right = 360 + margin * scale;
    addLine(svg, left, 230, right, 230, {
      stroke: colors.blue,
      width: 12,
    });
    [left, right].forEach((x) =>
      addLine(svg, x, 194, x, 266, {
        stroke: colors.blue,
        width: 4,
      })
    );
    const centerPoint = svgElement("circle", {
      cx: 360,
      cy: 230,
      r: 11,
      fill: colors.red,
    });
    svg.append(centerPoint);
    addText(svg, (center - margin).toFixed(2), left, 300, {
      size: 13,
      fill: colors.blue,
    });
    addText(svg, center.toFixed(2), 360, 183, {
      size: 16,
      fill: colors.red,
    });
    addText(svg, (center + margin).toFixed(2), right, 300, {
      size: 13,
      fill: colors.blue,
    });
    addText(svg, `오차한계 ${margin.toFixed(2)}`, 360, 370, {
      size: 19,
      fill: colors.blue,
    });
    return {
      state: `표본평균 ${center.toFixed(2)} · n=${sampleSize}`,
      value: `${Math.round(level * 100)}% 구간의 오차한계 ${margin.toFixed(2)}`,
      verdict: `[${(center - margin).toFixed(2)}, ${(center + margin).toFixed(2)}]`,
      formula: `\\bar x\\pm z^*\\frac{\\sigma}{\\sqrt n}=${center.toFixed(2)}\\pm${margin.toFixed(2)}`,
      tip: "표본크기가 커지면 좁아지고, 신뢰수준을 높이면 넓어집니다.",
    };
  }

  function render(svg, visualKey, primary, secondary, phase, seed) {
    svg.replaceChildren();
    const accessibleTitle = svgElement("title");
    accessibleTitle.textContent =
      "현재 설정을 반영한 확률과 통계 시각화";
    svg.append(accessibleTitle);

    const renderers = {
      counting: drawCounting,
      "stars-bars": drawStarsBars,
      pascal: drawPascal,
      frequency: drawFrequency,
      venn: drawVenn,
      complement: drawComplement,
      conditional: drawConditional,
      independence: drawIndependence,
      tree: drawTree,
      distribution: drawDistribution,
      expectation: drawExpectation,
      binomial: drawBinomial,
      normal: drawNormalApproximation,
      sampling: drawSampling,
      "sampling-distribution": drawSamplingDistribution,
      confidence: drawConfidence,
    };
    return renderers[visualKey](
      svg,
      primary,
      secondary,
      phase,
      seed
    );
  }

  function setMath(elementNode, value) {
    if (!elementNode) return;
    if (window.MathJax?.typesetClear) {
      window.MathJax.typesetClear([elementNode]);
    }
    elementNode.textContent = `\\(${value}\\)`;
    window.MathJax?.typesetPromise?.([elementNode]).catch(() => {});
  }

  function setTypesetText(elementNode, value) {
    if (!elementNode) return;
    if (window.MathJax?.typesetClear) {
      window.MathJax.typesetClear([elementNode]);
    }
    elementNode.textContent = value;
    window.MathJax?.typesetPromise?.([elementNode]).catch(() => {});
  }

  function controlValue(definition, input) {
    const raw = Number(input.value);
    if (Array.isArray(definition?.labels)) return raw;
    return raw * (definition?.scale ?? 1);
  }

  function formatControl(definition, input) {
    const raw = Number(input.value);
    if (Array.isArray(definition?.labels)) {
      return definition.labels[raw] ?? String(raw);
    }
    const value = raw * (definition?.scale ?? 1);
    if (definition?.digits !== undefined) {
      return value.toFixed(definition.digits);
    }
    return String(value);
  }

  function syncCountingControls(phase, primary, secondary) {
    if (key !== "counting") return;
    const primaryLabel = document.getElementById(
      "probability-primary-label"
    );
    const secondaryLabel = document.getElementById(
      "probability-secondary-label"
    );
    if (!primaryLabel || !secondaryLabel) return;
    if (phase === 0) {
      primaryLabel.textContent = "선택지의 수 n";
      secondaryLabel.textContent = "자리의 수 r";
      primary.min = String(profile.primary?.min ?? 2);
      secondary.max = String(profile.secondary?.max ?? 8);
    } else {
      primaryLabel.textContent = "전체 원소의 개수 n";
      secondaryLabel.textContent = "같은 것의 개수 p";
      primary.min = "3";
      if (Number(primary.value) < 3) primary.value = "3";
      secondary.max = String(
        Math.max(2, Number(primary.value) - 1)
      );
      if (Number(secondary.value) > Number(secondary.max)) {
        secondary.value = secondary.max;
      }
    }
  }

  function initMotion() {
    const svg = document.getElementById(
      "probability-motion-visual"
    );
    const replay = document.getElementById(
      "replay-probability-motion"
    );
    const caption = document.getElementById(
      "motion-caption-text"
    );
    if (!svg || !caption) return;

    const captions = Array.isArray(config.motionCaptions)
      ? config.motionCaptions
      : [];
    let timers = [];

    function play() {
      timers.forEach(window.clearTimeout);
      timers = [];
      for (let phase = 0; phase < 3; phase += 1) {
        timers.push(
          window.setTimeout(() => {
            const primary = Number(profile.primary?.value ?? 6);
            const secondary =
              Number(profile.secondary?.value ?? 5) *
              Number(profile.secondary?.scale ?? 1);
            render(svg, key, primary, secondary, phase, phase);
            setTypesetText(
              caption,
              captions[Math.min(phase, captions.length - 1)] ||
                "그림과 식이 같은 관계를 나타내는지 확인합니다."
            );
          }, phase * 1800)
        );
      }
    }

    replay?.addEventListener("click", play);
    play();
  }

  function initPlayground() {
    const svg = document.getElementById(
      "probability-playground-visual"
    );
    const primary = document.getElementById(
      "probability-primary"
    );
    const secondary = document.getElementById(
      "probability-secondary"
    );
    if (!svg || !primary || !secondary) return;

    const primaryOutput = document.getElementById(
      "probability-primary-output"
    );
    const secondaryOutput = document.getElementById(
      "probability-secondary-output"
    );
    const state = document.getElementById("probability-state");
    const value = document.getElementById("probability-value");
    const verdict = document.getElementById("probability-verdict");
    const formula = document.getElementById("probability-formula");
    const tip = document.getElementById("probability-tip");
    const rerun = document.getElementById(
      "rerun-probability-simulation"
    );
    const modeButtons = Array.from(
      document.querySelectorAll("[data-probability-mode]")
    );
    let phase = 0;
    let seed = 0;

    function update() {
      const primaryDefinition = profile.primary || {};
      const secondaryDefinition = profile.secondary || {};
      syncCountingControls(phase, primary, secondary);
      const primaryValue = controlValue(primaryDefinition, primary);
      const secondaryValue = controlValue(
        secondaryDefinition,
        secondary
      );
      if (primaryOutput) {
        primaryOutput.textContent = formatControl(
          primaryDefinition,
          primary
        );
      }
      if (secondaryOutput) {
        secondaryOutput.textContent = formatControl(
          secondaryDefinition,
          secondary
        );
      }
      const result = render(
        svg,
        key,
        primaryValue,
        secondaryValue,
        phase,
        seed
      );
      state.textContent = result.state;
      value.textContent = result.value;
      verdict.textContent = result.verdict;
      tip.textContent = result.tip;
      setMath(formula, result.formula);
    }

    primary.addEventListener("input", update);
    secondary.addEventListener("input", update);
    rerun?.addEventListener("click", () => {
      seed = (seed + 1) % 97;
      update();
    });
    modeButtons.forEach((button, index) => {
      button.addEventListener("click", () => {
        modeButtons.forEach((item) =>
          item.classList.toggle("active", item === button)
        );
        phase = index;
        update();
      });
    });
    update();
  }

  initMotion();
  initPlayground();
})();
