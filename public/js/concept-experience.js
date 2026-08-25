(function () {
  "use strict";

  const configElement = document.getElementById(
    "concept-experience-config"
  );

  if (!configElement) return;

  const config = JSON.parse(configElement.textContent);

  function typesetMath(elements) {
    const targets = (
      Array.isArray(elements) ? elements : [elements]
    ).filter(Boolean);

    return targets.length
      ? window.MatthsMath?.render(targets) || Promise.resolve()
      : Promise.resolve();
  }

  function setMath(element, tex) {
    if (!element) return;
    if (window.MatthsMath) {
      window.MatthsMath.setText(element, tex);
    } else {
      element.textContent = tex;
    }
  }

  function initNavigation() {
    const buttons = Array.from(
      document.querySelectorAll("[data-jump-to]")
    );

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        document
          .getElementById(button.dataset.jumpTo)
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      });
    });
  }

  function initMotionOpening() {
    const canvas = document.getElementById(
      "limit-opening-canvas"
    );

    const replayButton = document.getElementById(
      "replay-motion"
    );

    const caption = document.getElementById(
      "motion-caption-text"
    );

    const finalFormula = document.getElementById(
      "motion-final-formula"
    );

    if (!canvas || !caption) return;

    const context = canvas.getContext("2d");
    const duration = 9000;
    const motionKey =
      config.playgroundKey || "limit-intuition";

    const captionsByKey = {
      "limit-intuition": [
        "x가 a에 가까워질 때 함수값의 움직임을 관찰합니다.",
        "왼쪽과 오른쪽에서 점을 하나씩 출발시킵니다.",
        "두 점이 가까워질수록 함수값도 같은 곳을 향합니다.",
        "양쪽 함수값이 같은 L에 가까워지면 극한값은 L입니다.",
      ],
      "limit-calculation": [
        "먼저 x = a를 대입하여 식의 형태를 확인합니다.",
        "0/0이 나타나면 공통 구조를 찾습니다.",
        "인수분해나 유리화로 막고 있던 인자를 없앱니다.",
        "단순해진 식에 다시 대입하면 극한값이 드러납니다.",
      ],
      "continuity-builder": [
        "x = a에서 실제 함수값이 있는지 확인합니다.",
        "왼쪽과 오른쪽 그래프가 같은 높이로 향하는지 봅니다.",
        "공통 극한값과 실제 함수값을 한 점에 겹칩니다.",
        "세 값이 모두 같아지면 그래프가 끊김 없이 이어집니다.",
      ],
      "continuous-properties": [
        "닫힌구간에서 끊기지 않는 그래프를 확인합니다.",
        "양 끝 함수값 사이에 높이 k를 선택합니다.",
        "수평선 y = k가 그래프를 만나는 위치를 찾습니다.",
        "연속인 그래프에는 f(c) = k인 점이 반드시 존재합니다.",
      ],
    };

    const captions =
      (motionKey.startsWith("algebra-") ||
        motionKey.startsWith("common-math-")) &&
      Array.isArray(config.motionCaptions) &&
      config.motionCaptions.length
        ? config.motionCaptions
        : captionsByKey[motionKey] ||
          captionsByKey["limit-intuition"];

    let animationFrame = null;
    let startedAt = null;
    let lastCaptionIndex = -1;

    function resize() {
      const width = canvas.clientWidth || 800;
      const height = canvas.clientHeight || 430;
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        2
      );

      canvas.width = width * ratio;
      canvas.height = height * ratio;

      context.setTransform(
        ratio,
        0,
        0,
        ratio,
        0,
        0
      );
    }

    function drawGrid(width, height) {
      context.strokeStyle = "#dfe5f6";
      context.lineWidth = 1;

      for (let x = 25; x < width; x += 35) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }

      for (let y = 25; y < height; y += 35) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }
    }

    function drawRoundedRect(
      x,
      y,
      width,
      height,
      radius
    ) {
      context.beginPath();
      context.roundRect(
        x,
        y,
        width,
        height,
        radius
      );
    }

    function drawLimitMotion(
      width,
      height,
      progress
    ) {
      const centerX = width / 2;
      const centerY = height / 2 + 12;
      const eased =
        1 - Math.pow(1 - progress, 3);
      const distance = Math.max(
        12,
        width * 0.3 * (1 - eased)
      );
      const curveY = (x) =>
        centerY -
        60 -
        Math.pow((x - centerX) / 55, 2) * 8;

      context.strokeStyle = "#8690a8";
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(35, centerY);
      context.lineTo(width - 35, centerY);
      context.stroke();
      context.beginPath();
      context.moveTo(centerX, 35);
      context.lineTo(centerX, height - 35);
      context.stroke();

      context.strokeStyle = "#3157f6";
      context.lineWidth = 4;
      context.beginPath();

      for (
        let x = Math.max(40, centerX - 230);
        x <= Math.min(width - 40, centerX + 230);
        x += 4
      ) {
        const y = curveY(x);

        if (x === Math.max(40, centerX - 230)) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }

      context.stroke();

      [centerX - distance, centerX + distance].forEach(
        (x, index) => {
          context.fillStyle =
            index === 0 ? "#20a078" : "#704bd7";
          context.beginPath();
          context.arc(
            x,
            curveY(x),
            7,
            0,
            Math.PI * 2
          );
          context.fill();
        }
      );

      context.fillStyle = "#fff";
      context.strokeStyle = "#3157f6";
      context.lineWidth = 4;
      context.beginPath();
      context.arc(
        centerX,
        curveY(centerX),
        9,
        0,
        Math.PI * 2
      );
      context.fill();
      context.stroke();
    }

    function drawCalculationMotion(
      width,
      height,
      elapsed
    ) {
      const labels = [
        ["직접 대입", "0 / 0"],
        ["인수분해 · 약분", "(x-a)(x+a)"],
        ["다시 대입", "2a"],
      ];
      const activeIndex = Math.min(
        2,
        Math.floor(elapsed / 2500)
      );
      const gap = Math.min(26, width * 0.025);
      const cardWidth = Math.min(
        210,
        (width - 80 - gap * 2) / 3
      );
      const totalWidth =
        cardWidth * 3 + gap * 2;
      const startX = (width - totalWidth) / 2;
      const cardY = height / 2 - 72;

      labels.forEach((item, index) => {
        const x =
          startX + index * (cardWidth + gap);
        const visible = index <= activeIndex;

        context.fillStyle = visible
          ? index === activeIndex
            ? "#3157f6"
            : "#e8edff"
          : "#f1f3f8";
        drawRoundedRect(
          x,
          cardY,
          cardWidth,
          145,
          18
        );
        context.fill();

        context.textAlign = "center";
        context.fillStyle =
          index === activeIndex
            ? "#fff"
            : visible
              ? "#3157f6"
              : "#9ca4b7";
        context.font =
          "800 13px system-ui, sans-serif";
        context.fillText(
          item[0],
          x + cardWidth / 2,
          cardY + 42
        );
        context.font =
          "700 24px Georgia, serif";
        context.fillText(
          visible ? item[1] : "?",
          x + cardWidth / 2,
          cardY + 91
        );

        if (index < labels.length - 1) {
          context.fillStyle = "#7e8bab";
          context.font =
            "700 22px system-ui, sans-serif";
          context.fillText(
            "→",
            x + cardWidth + gap / 2,
            cardY + 79
          );
        }
      });
    }

    function drawAlgebraMotion(
      width,
      height,
      elapsed
    ) {
      const labels = (
        Array.isArray(config.motionStageLabels)
          ? config.motionStageLabels
          : []
      )
        .slice(0, 3)
        .map((label, index) => [
          label,
          ["정의", "관계", "완성"][index],
        ]);

      while (labels.length < 3) {
        const index = labels.length;
        labels.push([
          ["정의 확인", "성질 연결", "계산 완성"][
            index
          ],
          ["정의", "관계", "완성"][index],
        ]);
      }

      const activeIndex = Math.min(
        2,
        Math.floor(elapsed / 2500)
      );
      const gap = Math.min(26, width * 0.025);
      const cardWidth = Math.min(
        210,
        (width - 80 - gap * 2) / 3
      );
      const totalWidth =
        cardWidth * 3 + gap * 2;
      const startX = (width - totalWidth) / 2;
      const cardY = height / 2 - 72;

      labels.forEach((item, index) => {
        const x =
          startX + index * (cardWidth + gap);
        const visible = index <= activeIndex;

        context.fillStyle = visible
          ? index === activeIndex
            ? "#3157f6"
            : "#e8edff"
          : "#f1f3f8";
        drawRoundedRect(
          x,
          cardY,
          cardWidth,
          145,
          18
        );
        context.fill();

        context.textAlign = "center";
        context.fillStyle =
          index === activeIndex
            ? "#fff"
            : visible
              ? "#3157f6"
              : "#9ca4b7";
        context.font =
          "800 13px system-ui, sans-serif";
        context.fillText(
          item[0],
          x + cardWidth / 2,
          cardY + 42
        );
        context.font =
          "800 22px system-ui, sans-serif";
        context.fillText(
          visible ? item[1] : "?",
          x + cardWidth / 2,
          cardY + 91
        );

        if (index < labels.length - 1) {
          context.fillStyle = "#7e8bab";
          context.font =
            "700 22px system-ui, sans-serif";
          context.fillText(
            "→",
            x + cardWidth + gap / 2,
            cardY + 79
          );
        }
      });
    }

    function drawContinuityMotion(
      width,
      height,
      progress
    ) {
      const centerX = width / 2;
      const centerY = height / 2;
      const plotLeft = 55;
      const plotRight = width - 55;
      const plotTop = 45;
      const plotBottom = height - 52;
      const targetY = centerY - 45;
      const pointY =
        targetY + 110 * (1 - progress);

      context.strokeStyle = "#8690a8";
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(plotLeft, centerY + 90);
      context.lineTo(plotRight, centerY + 90);
      context.stroke();
      context.beginPath();
      context.moveTo(centerX, plotTop);
      context.lineTo(centerX, plotBottom);
      context.stroke();

      context.strokeStyle = "#3157f6";
      context.lineWidth = 4;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(plotLeft, targetY + 95);
      context.quadraticCurveTo(
        centerX - 100,
        targetY + 20,
        centerX,
        targetY
      );
      context.moveTo(centerX, targetY);
      context.quadraticCurveTo(
        centerX + 100,
        targetY - 20,
        plotRight,
        targetY - 85
      );
      context.stroke();

      context.fillStyle = "#fff";
      context.strokeStyle = "#3157f6";
      context.lineWidth = 4;
      context.beginPath();
      context.arc(
        centerX,
        targetY,
        10,
        0,
        Math.PI * 2
      );
      context.fill();
      context.stroke();

      context.fillStyle = "#e45f70";
      context.beginPath();
      context.arc(
        centerX,
        pointY,
        8,
        0,
        Math.PI * 2
      );
      context.fill();

      context.strokeStyle = "#e45f70";
      context.lineWidth = 2;
      context.setLineDash([5, 5]);
      context.beginPath();
      context.moveTo(centerX, pointY);
      context.lineTo(centerX, targetY);
      context.stroke();
      context.setLineDash([]);
    }

    function drawPropertyMotion(
      width,
      height,
      progress
    ) {
      const plotLeft = 60;
      const plotRight = width - 60;
      const plotTop = 48;
      const plotBottom = height - 55;
      const mapX = (x) =>
        plotLeft +
        ((x + 4) / 8) *
          (plotRight - plotLeft);
      const mapY = (y) =>
        plotBottom -
        ((y + 4.5) / 9) *
          (plotBottom - plotTop);
      const evaluate = (x) =>
        0.08 * x * x * x +
        0.55 * x +
        0.5;
      const target = -2.5 + 5.5 * progress;

      context.strokeStyle = "#8690a8";
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(plotLeft, mapY(0));
      context.lineTo(plotRight, mapY(0));
      context.stroke();
      context.beginPath();
      context.moveTo(mapX(0), plotTop);
      context.lineTo(mapX(0), plotBottom);
      context.stroke();

      context.strokeStyle = "#3157f6";
      context.lineWidth = 4;
      context.lineCap = "round";
      context.beginPath();

      for (let x = -4; x <= 4; x += 0.05) {
        const px = mapX(x);
        const py = mapY(evaluate(x));

        if (x === -4) {
          context.moveTo(px, py);
        } else {
          context.lineTo(px, py);
        }
      }

      context.stroke();

      context.strokeStyle = "#20a078";
      context.lineWidth = 2;
      context.setLineDash([7, 6]);
      context.beginPath();
      context.moveTo(plotLeft, mapY(target));
      context.lineTo(plotRight, mapY(target));
      context.stroke();
      context.setLineDash([]);

      let low = -4;
      let high = 4;

      for (let index = 0; index < 32; index += 1) {
        const middle = (low + high) / 2;

        if (evaluate(middle) < target) {
          low = middle;
        } else {
          high = middle;
        }
      }

      const c = (low + high) / 2;
      context.fillStyle = "#20a078";
      context.beginPath();
      context.arc(
        mapX(c),
        mapY(target),
        8,
        0,
        Math.PI * 2
      );
      context.fill();
    }

    function drawFrame(now) {
      if (!startedAt) startedAt = now;

      const elapsed = Math.min(now - startedAt, duration);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      context.clearRect(0, 0, width, height);

      const captionIndex = Math.min(
        captions.length - 1,
        Math.floor(elapsed / 2250)
      );

      if (captionIndex !== lastCaptionIndex) {
        lastCaptionIndex = captionIndex;
        caption.textContent = captions[captionIndex];
      }

      const approachProgress = Math.max(
        0,
        Math.min(1, (elapsed - 500) / 6200)
      );

      drawGrid(width, height);

      if (
        motionKey.startsWith("algebra-") ||
        motionKey.startsWith("common-math-")
      ) {
        drawAlgebraMotion(
          width,
          height,
          elapsed
        );
      } else if (motionKey === "limit-calculation") {
        drawCalculationMotion(
          width,
          height,
          elapsed
        );
      } else if (motionKey === "continuity-builder") {
        drawContinuityMotion(
          width,
          height,
          approachProgress
        );
      } else if (motionKey === "continuous-properties") {
        drawPropertyMotion(
          width,
          height,
          approachProgress
        );
      } else {
        drawLimitMotion(
          width,
          height,
          approachProgress
        );
      }

      finalFormula?.classList.toggle(
        "visible",
        elapsed >= 6800
      );

      if (elapsed < duration) {
        animationFrame =
          window.requestAnimationFrame(drawFrame);
      } else if (replayButton) {
        replayButton.disabled = false;
      }
    }

    function replay() {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }

      resize();
      startedAt = null;
      lastCaptionIndex = -1;
      finalFormula?.classList.remove("visible");

      if (replayButton) replayButton.disabled = true;

      animationFrame =
        window.requestAnimationFrame(drawFrame);
    }

    replayButton?.addEventListener("click", replay);
    window.addEventListener("resize", replay);

    replay();
  }

  function initLimitPlayground() {
    const svg = document.getElementById("limit-graph");
    if (!svg) return;

    const aInput = document.getElementById("limit-a");
    const distanceInput = document.getElementById(
      "limit-distance"
    );
    const pointValueInput = document.getElementById(
      "point-value"
    );

    const aOutput = document.getElementById(
      "limit-a-output"
    );

    const distanceOutput = document.getElementById(
      "limit-distance-output"
    );

    const pointValueOutput = document.getElementById(
      "point-value-output"
    );

    const formula = document.getElementById(
      "limit-formula"
    );

    const leftValue = document.getElementById(
      "left-limit-value"
    );

    const rightValue = document.getElementById(
      "right-limit-value"
    );

    const verdict = document.getElementById(
      "limit-verdict"
    );

    const pointValueControl = document.getElementById(
      "point-value-control"
    );

    const playButton = document.getElementById(
      "play-limit-approach"
    );

    const zoomOutput = document.getElementById(
      "limit-zoom-output"
    );

    const modeButtons = Array.from(
      document.querySelectorAll("[data-limit-mode]")
    );

    let mode = "hole";
    let animationFrame = null;
    let lastFormulaTex = "";

    const width = 720;
    const height = 430;
    const padding = 42;
    const minimumZoom = 0.75;
    const maximumZoom = 3;
    const wheelSensitivity = 0.0008;
    let zoom = 1;
    let zoomRenderFrame = null;

    function viewBounds() {
      const halfRange = 5 / zoom;
      const a = Number(aInput.value);
      const focusWeight =
        zoom > 1
          ? (zoom - 1) / (maximumZoom - 1)
          : 0;
      const focusY =
        mode === "hole"
          ? 2 * a
          : mode === "jump"
            ? 2 * a + 1
            : 2.5;
      const centerX = a * focusWeight;
      const centerY = focusY * focusWeight;

      return {
        xMin: centerX - halfRange,
        xMax: centerX + halfRange,
        yMin: centerY - halfRange,
        yMax: centerY + halfRange,
      };
    }

    function mapX(x) {
      const bounds = viewBounds();

      return (
        padding +
        ((x - bounds.xMin) /
          (bounds.xMax - bounds.xMin)) *
          (width - padding * 2)
      );
    }

    function mapY(y) {
      const bounds = viewBounds();

      return (
        height -
        padding -
        ((y - bounds.yMin) /
          (bounds.yMax - bounds.yMin)) *
          (height - padding * 2)
      );
    }

    function distanceFromSlider(value) {
      return Math.pow(10, 0.3 - Number(value) * 0.025);
    }

    function evaluate(x, a) {
      if (mode === "hole") return x + a;
      if (mode === "jump") {
        return x < a ? x + a : x + a + 2;
      }

      return 1 / Math.pow(x - a, 2);
    }

    function pathForRange(start, end, a) {
      const points = [];
      const step = Math.max(
        0.008,
        (end - start) / 260
      );

      for (let x = start; x <= end; x += step) {
        const y = evaluate(x, a);

        if (!Number.isFinite(y) || Math.abs(y) > 20) {
          continue;
        }

        points.push(
          `${points.length ? "L" : "M"} ${mapX(x).toFixed(
            2
          )} ${mapY(y).toFixed(2)}`
        );
      }

      return points.join(" ");
    }

    function render() {
      const a = Number(aInput.value);
      const pointValue = Number(pointValueInput.value);
      const bounds = viewBounds();

      const distance = distanceFromSlider(
        distanceInput.value
      );

      const leftX = a - distance;
      const rightX = a + distance;

      const leftY = evaluate(leftX, a);
      const rightY = evaluate(rightX, a);

      aOutput.value = a;
      pointValueOutput.value = pointValue;
      distanceOutput.value = distance.toFixed(3);

      pointValueControl.hidden = mode !== "hole";

      if (zoomOutput) {
        zoomOutput.value = `${Math.round(
          zoom * 100
        )}%`;
      }

      svg.setAttribute(
        "aria-label",
        `함수의 극한을 확인하는 좌표평면. 현재 확대율 ${Math.round(
          zoom * 100
        )}퍼센트입니다. 마우스 휠로 확대하거나 축소할 수 있습니다.`
      );

      const shiftedX =
        a >= 0
          ? `x-${a}`
          : `x+${Math.abs(a)}`;

      const leftExpression =
        a >= 0
          ? `x+${a}`
          : `x-${Math.abs(a)}`;

      const rightConstant = a + 2;

      const rightExpression =
        rightConstant >= 0
          ? `x+${rightConstant}`
          : `x-${Math.abs(rightConstant)}`;

      let nextFormulaTex = "";

      if (mode === "hole") {
        nextFormulaTex =
          `\\(\\dfrac{x^2-${a ** 2}}{${shiftedX}},` +
          `\\quad x\\ne ${a}\\)`;
      } else if (mode === "jump") {
        nextFormulaTex =
          "\\(f(x)=\\begin{cases}" +
          `${leftExpression},&x<${a}\\\\` +
          `${rightExpression},&x\\ge ${a}` +
          "\\end{cases}\\)";
      } else {
        nextFormulaTex =
          `\\(f(x)=\\dfrac{1}{(${shiftedX})^2}\\)`;
      }

      if (nextFormulaTex !== lastFormulaTex) {
        lastFormulaTex = nextFormulaTex;
        setMath(formula, nextFormulaTex);
      }

      leftValue.textContent = Number.isFinite(leftY)
        ? leftY.toFixed(3)
        : "∞";

      rightValue.textContent = Number.isFinite(rightY)
        ? rightY.toFixed(3)
        : "∞";

      if (mode === "hole") {
        verdict.textContent =
          `양쪽 모두 ${2 * a}에 가까워집니다.`;
      } else if (mode === "jump") {
        verdict.textContent =
          "좌우가 다른 값을 향해 극한이 존재하지 않습니다.";
      } else {
        verdict.textContent =
          "양쪽 모두 +∞ 방향으로 커집니다.";
      }

      const gridLines = [];
      const gridStep =
        zoom >= 2.2
          ? 0.5
          : zoom >= 1
            ? 1
            : 2;
      const firstGridX =
        Math.ceil(bounds.xMin / gridStep) *
        gridStep;
      const firstGridY =
        Math.ceil(bounds.yMin / gridStep) *
        gridStep;

      for (
        let value = firstGridX;
        value <= bounds.xMax;
        value += gridStep
      ) {
        gridLines.push(`
          <line
            x1="${mapX(value)}"
            y1="${padding}"
            x2="${mapX(value)}"
            y2="${height - padding}"
          />
        `);
      }

      for (
        let value = firstGridY;
        value <= bounds.yMax;
        value += gridStep
      ) {
        gridLines.push(`
          <line
            x1="${padding}"
            y1="${mapY(value)}"
            x2="${width - padding}"
            y2="${mapY(value)}"
          />
        `);
      }

      const split = Math.max(
        0.008,
        0.035 / zoom
      );

      const leftPath = pathForRange(
        bounds.xMin,
        a - split,
        a
      );

      const rightPath = pathForRange(
        a + split,
        bounds.xMax,
        a
      );

      const targetY =
        mode === "hole"
          ? 2 * a
          : mode === "jump"
            ? 2 * a
            : 5;

      svg.innerHTML = `
        <defs>
          <clipPath id="limit-plot-clip">
            <rect
              x="${padding}"
              y="${padding}"
              width="${width - padding * 2}"
              height="${height - padding * 2}"
            />
          </clipPath>
        </defs>

        <g
          stroke="#e3e7f2"
          stroke-width="1"
        >
          ${gridLines.join("")}
        </g>

        <g
          stroke="#8992a8"
          stroke-width="1.6"
        >
          ${
            bounds.yMin <= 0 &&
            bounds.yMax >= 0
              ? `
                <line
                  x1="${padding}"
                  y1="${mapY(0)}"
                  x2="${width - padding}"
                  y2="${mapY(0)}"
                />
              `
              : ""
          }
          ${
            bounds.xMin <= 0 &&
            bounds.xMax >= 0
              ? `
                <line
                  x1="${mapX(0)}"
                  y1="${padding}"
                  x2="${mapX(0)}"
                  y2="${height - padding}"
                />
              `
              : ""
          }
        </g>

        <g clip-path="url(#limit-plot-clip)">
          <line
            x1="${mapX(a)}"
            y1="${padding}"
            x2="${mapX(a)}"
            y2="${height - padding}"
            stroke="#a9b5f5"
            stroke-width="2"
            stroke-dasharray="7 7"
          />

          <path
            d="${leftPath}"
            fill="none"
            stroke="#3157f6"
            stroke-width="4"
            stroke-linecap="round"
          />

          <path
            d="${rightPath}"
            fill="none"
            stroke="#3157f6"
            stroke-width="4"
            stroke-linecap="round"
          />

          <line
            x1="${mapX(leftX)}"
            y1="${mapY(0)}"
            x2="${mapX(leftX)}"
            y2="${mapY(leftY)}"
            stroke="#20a078"
            stroke-width="2"
            stroke-dasharray="5 5"
          />

          <line
            x1="${mapX(rightX)}"
            y1="${mapY(0)}"
            x2="${mapX(rightX)}"
            y2="${mapY(rightY)}"
            stroke="#704bd7"
            stroke-width="2"
            stroke-dasharray="5 5"
          />

          <circle
            cx="${mapX(leftX)}"
            cy="${mapY(leftY)}"
            r="7"
            fill="#20a078"
            stroke="#fff"
            stroke-width="3"
          />

          <circle
            cx="${mapX(rightX)}"
            cy="${mapY(rightY)}"
            r="7"
            fill="#704bd7"
            stroke="#fff"
            stroke-width="3"
          />

          ${
            mode === "hole"
              ? `
                <circle
                  cx="${mapX(a)}"
                  cy="${mapY(targetY)}"
                  r="9"
                  fill="#fff"
                  stroke="#3157f6"
                  stroke-width="4"
                />

                <circle
                  cx="${mapX(a)}"
                  cy="${mapY(pointValue)}"
                  r="8"
                  fill="#e45f70"
                  stroke="#fff"
                  stroke-width="3"
                />
              `
              : ""
          }
        </g>
      `;
    }

    function playApproach() {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }

      const startedAt = performance.now();
      const startValue = Number(distanceInput.value);
      const duration = 2200;

      function animate(now) {
        const progress = Math.min(
          1,
          (now - startedAt) / duration
        );

        const eased =
          1 - Math.pow(1 - progress, 3);

        distanceInput.value =
          startValue + (100 - startValue) * eased;

        render();

        if (progress < 1) {
          animationFrame =
            requestAnimationFrame(animate);
        }
      }

      animationFrame =
        requestAnimationFrame(animate);
    }

    modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        mode = button.dataset.limitMode;

        modeButtons.forEach((item) => {
          item.classList.toggle(
            "active",
            item === button
          );
        });

        render();
      });
    });

    [aInput, distanceInput, pointValueInput].forEach(
      (input) => {
        input.addEventListener("input", render);
      }
    );

    playButton.addEventListener(
      "click",
      playApproach
    );

    svg.addEventListener(
      "wheel",
      (event) => {
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
          minimumZoom,
          Math.min(
            maximumZoom,
            zoom *
              Math.exp(
                -normalizedDelta *
                  wheelSensitivity
              )
          )
        );

        if (Math.abs(nextZoom - zoom) < 0.0001) {
          return;
        }

        event.preventDefault();
        zoom = nextZoom;

        if (zoomRenderFrame) return;

        zoomRenderFrame =
          window.requestAnimationFrame(() => {
            zoomRenderFrame = null;
            render();
          });
      },
      { passive: false }
    );

    render();
  }

  function initCalculationPlayground() {
    const formula = document.getElementById(
      "calculation-formula"
    );

    if (!formula) return;

    const aInput = document.getElementById(
      "calculation-a"
    );
    const aOutput = document.getElementById(
      "calculation-a-output"
    );
    const advanceButton = document.getElementById(
      "advance-calculation"
    );
    const tip = document.getElementById(
      "calculation-tip"
    );
    const stepOutput = document.getElementById(
      "calculation-step-output"
    );
    const methodOutput = document.getElementById(
      "calculation-method-output"
    );
    const verdict = document.getElementById(
      "calculation-verdict"
    );
    const stageElements = [0, 1, 2].map(
      (index) =>
        document.getElementById(
          `calculation-stage-${index}`
        )
    );
    const stageCards = Array.from(
      document.querySelectorAll(
        "[data-calculation-stage]"
      )
    );
    const modeButtons = Array.from(
      document.querySelectorAll(
        "[data-calculation-mode]"
      )
    );

    let mode = "factor";
    let stage = 0;

    function exampleForMode() {
      const a = Number(aInput.value);

      if (mode === "rationalize") {
        return {
          formula:
            `\\(\\displaystyle\\lim_{x\\to ${a ** 2}}` +
            `\\frac{\\sqrt{x}-${a}}{x-${a ** 2}}\\)`,
          stages: [
            "\\(\\displaystyle\\frac{0}{0}\\)",
            `\\(\\displaystyle\\frac{1}{\\sqrt{x}+${a}}\\)`,
            `\\(\\displaystyle\\frac{1}{${2 * a}}\\)`,
          ],
          methods: [
            "직접 대입",
            "켤레식으로 유리화",
            "다시 대입",
          ],
          verdicts: [
            "0/0이므로 원래 식에 바로 대입할 수 없습니다.",
            "켤레식을 이용하면 분모의 공통 인자가 사라집니다.",
            `극한값은 1/${2 * a}입니다.`,
          ],
          tip:
            "제곱근의 차가 보이면 켤레식을 곱해 " +
            "차의 제곱 구조로 바꿔보세요.",
        };
      }

      if (mode === "infinity") {
        return {
          formula:
            "\\(\\displaystyle\\lim_{x\\to\\infty}" +
            `\\frac{${a}x^2+2x-1}{2x^2-x+3}\\)`,
          stages: [
            "\\(\\displaystyle\\frac{\\infty}{\\infty}\\)",
            `\\(\\displaystyle\\frac{${a}+\\frac{2}{x}-\\frac{1}{x^2}}{2-\\frac{1}{x}+\\frac{3}{x^2}}\\)`,
            `\\(\\displaystyle\\frac{${a}}{2}\\)`,
          ],
          methods: [
            "차수 확인",
            "\\(x^2\\)으로 나누기",
            "사라지는 항 정리",
          ],
          verdicts: [
            "분자와 분모의 최고차수가 같습니다.",
            "모든 항을 최고차항 x²으로 나눕니다.",
            `극한값은 최고차항 계수의 비 ${a}/2입니다.`,
          ],
          tip:
            "x가 무한히 커질 때는 가장 빠르게 커지는 " +
            "최고차항이 전체 식의 움직임을 결정합니다.",
        };
      }

      return {
        formula:
          `\\(\\displaystyle\\lim_{x\\to ${a}}` +
          `\\frac{x^2-${a ** 2}}{x-${a}}\\)`,
        stages: [
          "\\(\\displaystyle\\frac{0}{0}\\)",
          `\\(\\displaystyle\\frac{(x-${a})(x+${a})}{x-${a}}=x+${a}\\)`,
          `\\(\\displaystyle ${2 * a}\\)`,
        ],
        methods: [
          "직접 대입",
          "인수분해와 약분",
          "다시 대입",
        ],
        verdicts: [
          "0/0은 극한값이 0이라는 뜻이 아닙니다.",
          "x ≠ a인 주변에서는 공통 인자를 약분할 수 있습니다.",
          `단순해진 식에 x = ${a}를 넣으면 ${2 * a}입니다.`,
        ],
        tip:
          "분자에 x = a를 대입해 0이 된다면 " +
          "x - a가 인수인지 먼저 확인해 보세요.",
      };
    }

    function render() {
      const example = exampleForMode();

      aOutput.value = aInput.value;
      tip.textContent = example.tip;
      stepOutput.textContent = `${stage + 1} / 3`;
      methodOutput.textContent =
        example.methods[stage];
      verdict.textContent =
        example.verdicts[stage];

      setMath(formula, example.formula);

      stageElements.forEach((element, index) => {
        setMath(
          element,
          index <= stage
            ? example.stages[index]
            : "\\(?\\)"
        );
      });

      stageCards.forEach((card, index) => {
        card.classList.toggle(
          "active",
          index === stage
        );
        card.classList.toggle(
          "done",
          index < stage
        );
      });

      advanceButton.textContent =
        stage >= 2
          ? "처음 단계부터 다시 보기"
          : "다음 계산 단계 보기";
    }

    modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        mode = button.dataset.calculationMode;
        stage = 0;

        modeButtons.forEach((item) => {
          item.classList.toggle(
            "active",
            item === button
          );
        });

        render();
      });
    });

    aInput.addEventListener("input", () => {
      stage = 0;
      render();
    });

    advanceButton.addEventListener("click", () => {
      stage = stage >= 2 ? 0 : stage + 1;
      render();
    });

    render();
  }

  function attachGraphZoom({
    svg,
    zoomOutput,
    getZoom,
    setZoom,
    render,
  }) {
    if (!svg) return;

    const minimumZoom = 0.75;
    const maximumZoom = 3;
    const sensitivity = 0.0008;
    let scheduledFrame = null;

    svg.addEventListener(
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
            event.deltaY * modeMultiplier
          )
        );
        const nextZoom = Math.max(
          minimumZoom,
          Math.min(
            maximumZoom,
            getZoom() *
              Math.exp(-delta * sensitivity)
          )
        );

        if (
          Math.abs(nextZoom - getZoom()) <
          0.0001
        ) {
          return;
        }

        event.preventDefault();
        setZoom(nextZoom);

        if (zoomOutput) {
          zoomOutput.value =
            `${Math.round(nextZoom * 100)}%`;
        }

        if (scheduledFrame) return;

        scheduledFrame =
          window.requestAnimationFrame(() => {
            scheduledFrame = null;
            render();
          });
      },
      { passive: false }
    );
  }

  function initContinuityPlayground() {
    const svg = document.getElementById(
      "continuity-graph"
    );

    if (!svg) return;

    const leftInput = document.getElementById(
      "continuity-left"
    );
    const rightInput = document.getElementById(
      "continuity-right"
    );
    const pointInput = document.getElementById(
      "continuity-point"
    );
    const leftOutput = document.getElementById(
      "continuity-left-output"
    );
    const rightOutput = document.getElementById(
      "continuity-right-output"
    );
    const pointOutput = document.getElementById(
      "continuity-point-output"
    );
    const formula = document.getElementById(
      "continuity-formula"
    );
    const limitCheck = document.getElementById(
      "continuity-limit-check"
    );
    const verdict = document.getElementById(
      "continuity-verdict"
    );
    const zoomOutput = document.getElementById(
      "continuity-zoom-output"
    );
    const presetButtons = Array.from(
      document.querySelectorAll(
        "[data-continuity-preset]"
      )
    );

    const width = 720;
    const height = 430;
    const padding = 43;
    let zoom = 1;
    let lastFormula = "";

    function bounds() {
      const halfRange = 5 / zoom;
      const average =
        (Number(leftInput.value) +
          Number(rightInput.value) +
          Number(pointInput.value)) /
        3;
      const focus =
        zoom > 1
          ? average *
            ((zoom - 1) / 2)
          : 0;

      return {
        xMin: -halfRange,
        xMax: halfRange,
        yMin: focus - halfRange,
        yMax: focus + halfRange,
      };
    }

    function mapX(value) {
      const view = bounds();

      return (
        padding +
        ((value - view.xMin) /
          (view.xMax - view.xMin)) *
          (width - padding * 2)
      );
    }

    function mapY(value) {
      const view = bounds();

      return (
        height -
        padding -
        ((value - view.yMin) /
          (view.yMax - view.yMin)) *
          (height - padding * 2)
      );
    }

    function pathForSide(side, target) {
      const view = bounds();
      const start =
        side === "left" ? view.xMin : 0.04;
      const end =
        side === "left" ? -0.04 : view.xMax;
      const points = [];
      const slope = side === "left" ? 0.38 : 0.3;

      for (
        let x = start;
        x <= end;
        x += Math.max(0.03, (end - start) / 160)
      ) {
        const y =
          target +
          slope * x +
          0.045 * x * x * (side === "left" ? 1 : -1);

        points.push(
          `${points.length ? "L" : "M"} ${mapX(x).toFixed(
            2
          )} ${mapY(y).toFixed(2)}`
        );
      }

      return points.join(" ");
    }

    function render() {
      const left = Number(leftInput.value);
      const right = Number(rightInput.value);
      const point = Number(pointInput.value);
      const continuous =
        left === right && right === point;
      const sameLimits = left === right;
      const view = bounds();

      leftOutput.value = left;
      rightOutput.value = right;
      pointOutput.value = point;
      limitCheck.textContent = sameLimits
        ? `같음 (${left})`
        : `다름 (${left}, ${right})`;
      verdict.textContent = continuous
        ? "x = 0에서 연속입니다."
        : sameLimits
          ? "극한값과 함수값이 달라 불연속입니다."
          : "양쪽 극한이 달라 불연속입니다.";

      const nextFormula =
        `\\(\\lim_{x\\to0^-}f(x)=${left},\\quad` +
        `\\lim_{x\\to0^+}f(x)=${right},\\quad` +
        `\\,f(0)=${point}\\)`;

      if (nextFormula !== lastFormula) {
        lastFormula = nextFormula;
        setMath(formula, nextFormula);
      }

      const grid = [];
      const step = zoom >= 2 ? 0.5 : 1;

      for (
        let value = Math.ceil(view.xMin / step) * step;
        value <= view.xMax;
        value += step
      ) {
        grid.push(`
          <line
            x1="${mapX(value)}"
            y1="${padding}"
            x2="${mapX(value)}"
            y2="${height - padding}"
          />
        `);
      }

      for (
        let value = Math.ceil(view.yMin / step) * step;
        value <= view.yMax;
        value += step
      ) {
        grid.push(`
          <line
            x1="${padding}"
            y1="${mapY(value)}"
            x2="${width - padding}"
            y2="${mapY(value)}"
          />
        `);
      }

      const limitPoints =
        left === right
          ? `
            <circle
              cx="${mapX(0)}"
              cy="${mapY(left)}"
              r="10"
              fill="#fff"
              stroke="#3157f6"
              stroke-width="4"
            />
          `
          : `
            <circle
              cx="${mapX(0)}"
              cy="${mapY(left)}"
              r="9"
              fill="#fff"
              stroke="#20a078"
              stroke-width="4"
            />
            <circle
              cx="${mapX(0)}"
              cy="${mapY(right)}"
              r="9"
              fill="#fff"
              stroke="#704bd7"
              stroke-width="4"
            />
          `;

      svg.innerHTML = `
        <defs>
          <clipPath id="continuity-plot-clip">
            <rect
              x="${padding}"
              y="${padding}"
              width="${width - padding * 2}"
              height="${height - padding * 2}"
            />
          </clipPath>
        </defs>

        <g stroke="#e3e7f2" stroke-width="1">
          ${grid.join("")}
        </g>

        <g stroke="#8992a8" stroke-width="1.6">
          ${
            view.yMin <= 0 && view.yMax >= 0
              ? `<line x1="${padding}" y1="${mapY(0)}" x2="${width - padding}" y2="${mapY(0)}" />`
              : ""
          }
          <line
            x1="${mapX(0)}"
            y1="${padding}"
            x2="${mapX(0)}"
            y2="${height - padding}"
          />
        </g>

        <g clip-path="url(#continuity-plot-clip)">
          <path
            d="${pathForSide("left", left)}"
            fill="none"
            stroke="#20a078"
            stroke-width="4"
            stroke-linecap="round"
          />
          <path
            d="${pathForSide("right", right)}"
            fill="none"
            stroke="#704bd7"
            stroke-width="4"
            stroke-linecap="round"
          />
          ${limitPoints}
          <circle
            cx="${mapX(0)}"
            cy="${mapY(point)}"
            r="7"
            fill="#e45f70"
            stroke="#fff"
            stroke-width="3"
          />
        </g>
      `;
    }

    function applyPreset(name) {
      if (name === "hole") {
        leftInput.value = 2;
        rightInput.value = 2;
        pointInput.value = -1;
      } else if (name === "jump") {
        leftInput.value = 1;
        rightInput.value = 3;
        pointInput.value = 3;
      } else {
        leftInput.value = 2;
        rightInput.value = 2;
        pointInput.value = 2;
      }

      render();
    }

    presetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        presetButtons.forEach((item) => {
          item.classList.toggle(
            "active",
            item === button
          );
        });
        applyPreset(button.dataset.continuityPreset);
      });
    });

    [leftInput, rightInput, pointInput].forEach(
      (input) => {
        input.addEventListener("input", () => {
          presetButtons.forEach((button) => {
            button.classList.remove("active");
          });
          render();
        });
      }
    );

    attachGraphZoom({
      svg,
      zoomOutput,
      getZoom: () => zoom,
      setZoom: (value) => {
        zoom = value;
      },
      render,
    });

    render();
  }

  function initContinuousPropertiesPlayground() {
    const svg = document.getElementById(
      "continuous-property-graph"
    );

    if (!svg) return;

    const targetInput = document.getElementById(
      "property-target"
    );
    const targetOutput = document.getElementById(
      "property-target-output"
    );
    const targetControl = document.getElementById(
      "property-target-control"
    );
    const animateButton = document.getElementById(
      "animate-property"
    );
    const formula = document.getElementById(
      "property-formula"
    );
    const rangeOutput = document.getElementById(
      "property-range-output"
    );
    const cOutput = document.getElementById(
      "property-c-output"
    );
    const verdict = document.getElementById(
      "property-verdict"
    );
    const zoomOutput = document.getElementById(
      "property-zoom-output"
    );
    const modeButtons = Array.from(
      document.querySelectorAll(
        "[data-property-mode]"
      )
    );

    const width = 720;
    const height = 430;
    const padding = 43;
    const a = -4;
    const b = 4;
    const vertexX = 0.7;
    const minimumValue = -2.5;
    const evaluate = (x) =>
      0.38 * Math.pow(x - vertexX, 2) +
      minimumValue;
    const leftValue = evaluate(a);
    const rightValue = evaluate(b);
    const maximumValue = Math.max(
      leftValue,
      rightValue
    );
    let mode = "intermediate";
    let zoom = 1;
    let animationFrame = null;
    let lastFormula = "";

    function bounds() {
      return {
        xMin: -5 / zoom,
        xMax: 5 / zoom,
        yMin: -4 / zoom,
        yMax: 7 / zoom,
      };
    }

    function mapX(value) {
      const view = bounds();

      return (
        padding +
        ((value - view.xMin) /
          (view.xMax - view.xMin)) *
          (width - padding * 2)
      );
    }

    function mapY(value) {
      const view = bounds();

      return (
        height -
        padding -
        ((value - view.yMin) /
          (view.yMax - view.yMin)) *
          (height - padding * 2)
      );
    }

    function findLeftIntersection(target) {
      let low = a;
      let high = vertexX;

      for (let index = 0; index < 45; index += 1) {
        const middle = (low + high) / 2;

        if (evaluate(middle) > target) {
          low = middle;
        } else {
          high = middle;
        }
      }

      return (low + high) / 2;
    }

    function curvePath() {
      const points = [];

      for (let x = a; x <= b; x += 0.035) {
        points.push(
          `${points.length ? "L" : "M"} ${mapX(x).toFixed(
            2
          )} ${mapY(evaluate(x)).toFixed(2)}`
        );
      }

      return points.join(" ");
    }

    function render() {
      const target = Number(targetInput.value);
      const c = findLeftIntersection(target);
      const view = bounds();
      const isIntermediate =
        mode === "intermediate";

      targetControl.hidden = !isIntermediate;
      targetOutput.value = target.toFixed(2);
      rangeOutput.textContent =
        `${minimumValue.toFixed(1)} ≤ f(x) ≤ ` +
        maximumValue.toFixed(1);
      cOutput.textContent = isIntermediate
        ? `c ≈ ${c.toFixed(2)}`
        : `최솟값 위치 x = ${vertexX}`;
      verdict.textContent = isIntermediate
        ? "연속인 그래프가 y = k를 적어도 한 번 지납니다."
        : "닫힌구간에서 최댓값과 최솟값을 모두 가집니다.";

      const nextFormula = isIntermediate
        ? `\\(f(${a})=${leftValue.toFixed(
            1
          )},\\quad f(${b})=${rightValue.toFixed(
            1
          )},\\quad f(c)=${target.toFixed(2)}\\)`
        : "\\(f\\text{가 }[-4,4]\\text{에서 연속}\\Rightarrow\\max f,\\min f\\text{ 존재}\\)";

      if (nextFormula !== lastFormula) {
        lastFormula = nextFormula;
        setMath(formula, nextFormula);
      }

      const grid = [];
      const gridStep = zoom >= 2 ? 0.5 : 1;

      for (
        let value =
          Math.ceil(view.xMin / gridStep) *
          gridStep;
        value <= view.xMax;
        value += gridStep
      ) {
        grid.push(`
          <line
            x1="${mapX(value)}"
            y1="${padding}"
            x2="${mapX(value)}"
            y2="${height - padding}"
          />
        `);
      }

      for (
        let value =
          Math.ceil(view.yMin / gridStep) *
          gridStep;
        value <= view.yMax;
        value += gridStep
      ) {
        grid.push(`
          <line
            x1="${padding}"
            y1="${mapY(value)}"
            x2="${width - padding}"
            y2="${mapY(value)}"
          />
        `);
      }

      const highlight = isIntermediate
        ? `
          <line
            x1="${padding}"
            y1="${mapY(target)}"
            x2="${width - padding}"
            y2="${mapY(target)}"
            stroke="#20a078"
            stroke-width="2.5"
            stroke-dasharray="8 7"
          />
          <line
            x1="${mapX(c)}"
            y1="${mapY(target)}"
            x2="${mapX(c)}"
            y2="${mapY(0)}"
            stroke="#20a078"
            stroke-width="2"
            stroke-dasharray="5 5"
          />
          <circle
            cx="${mapX(c)}"
            cy="${mapY(target)}"
            r="8"
            fill="#20a078"
            stroke="#fff"
            stroke-width="3"
          />
        `
        : `
          <circle
            cx="${mapX(vertexX)}"
            cy="${mapY(minimumValue)}"
            r="8"
            fill="#704bd7"
            stroke="#fff"
            stroke-width="3"
          />
          <circle
            cx="${mapX(a)}"
            cy="${mapY(maximumValue)}"
            r="8"
            fill="#e45f70"
            stroke="#fff"
            stroke-width="3"
          />
        `;

      svg.innerHTML = `
        <defs>
          <clipPath id="property-plot-clip">
            <rect
              x="${padding}"
              y="${padding}"
              width="${width - padding * 2}"
              height="${height - padding * 2}"
            />
          </clipPath>
        </defs>

        <g stroke="#e3e7f2" stroke-width="1">
          ${grid.join("")}
        </g>

        <g stroke="#8992a8" stroke-width="1.6">
          ${
            view.yMin <= 0 && view.yMax >= 0
              ? `<line x1="${padding}" y1="${mapY(0)}" x2="${width - padding}" y2="${mapY(0)}" />`
              : ""
          }
          ${
            view.xMin <= 0 && view.xMax >= 0
              ? `<line x1="${mapX(0)}" y1="${padding}" x2="${mapX(0)}" y2="${height - padding}" />`
              : ""
          }
        </g>

        <g clip-path="url(#property-plot-clip)">
          <path
            d="${curvePath()}"
            fill="none"
            stroke="#3157f6"
            stroke-width="4"
            stroke-linecap="round"
          />
          ${highlight}
        </g>
      `;
    }

    modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        mode = button.dataset.propertyMode;

        modeButtons.forEach((item) => {
          item.classList.toggle(
            "active",
            item === button
          );
        });

        animateButton.textContent =
          mode === "intermediate"
            ? "교점이 생기는 장면 보기"
            : "최대·최소 위치 다시 보기";
        render();
      });
    });

    targetInput.addEventListener("input", render);

    animateButton.addEventListener("click", () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }

      if (mode === "extreme") {
        mode = "intermediate";
        modeButtons.forEach((button) => {
          button.classList.toggle(
            "active",
            button.dataset.propertyMode ===
              "intermediate"
          );
        });
      }

      const startedAt = performance.now();
      const start = Number(targetInput.value);
      const destination =
        start > 3 ? 2 : 4.5;

      function animate(now) {
        const progress = Math.min(
          1,
          (now - startedAt) / 1500
        );
        const eased =
          1 - Math.pow(1 - progress, 3);

        targetInput.value =
          start +
          (destination - start) * eased;
        render();

        if (progress < 1) {
          animationFrame =
            requestAnimationFrame(animate);
        }
      }

      animationFrame =
        requestAnimationFrame(animate);
    });

    attachGraphZoom({
      svg,
      zoomOutput,
      getZoom: () => zoom,
      setZoom: (value) => {
        zoom = value;
      },
      render,
    });

    render();
  }

  function initAlgebraPlayground() {
    const formula = document.getElementById(
      "algebra-formula"
    );

    if (!formula) return;

    const valueInput = document.getElementById(
      "algebra-value"
    );
    const valueOutput = document.getElementById(
      "algebra-value-output"
    );
    const advanceButton = document.getElementById(
      "advance-algebra"
    );
    const tip = document.getElementById(
      "algebra-tip"
    );
    const stepOutput = document.getElementById(
      "algebra-step-output"
    );
    const methodOutput = document.getElementById(
      "algebra-method-output"
    );
    const verdict = document.getElementById(
      "algebra-verdict"
    );
    const stageElements = [0, 1, 2].map(
      (index) =>
        document.getElementById(
          `algebra-stage-${index}`
        )
    );
    const stageCards = Array.from(
      document.querySelectorAll(
        "[data-algebra-stage]"
      )
    );
    const modeButtons = Array.from(
      document.querySelectorAll(
        "[data-algebra-mode]"
      )
    );

    let stage = 0;
    let modeIndex = 0;

    function createExample() {
      const value = Number(valueInput.value);

      switch (config.conceptId) {
        case "algebra-01-01": {
          const square = value ** 2;

          return {
            formula:
              `\\(x^2=${square}\\)에서 ` +
              "\\(x\\)의 양의 값을 찾습니다.",
            stages: [
              `\\(${value}^2=${square}\\)`,
              `\\(x^2=${square}\\)`,
              `\\(x=\\sqrt{${square}}=${value}\\)`,
            ],
            result:
              `양의 제곱근은 \\(${value}\\)입니다.`,
            tip:
              "거듭제곱과 거듭제곱근은 서로 반대 방향의 계산입니다.",
          };
        }

        case "algebra-01-02": {
          const square = value ** 2;
          const cube = value ** 3;

          return {
            formula:
              `\\(${square}^{3/2}\\)의 값을 구합니다.`,
            stages: [
              `\\(${square}= ${value}^2\\)`,
              `\\(${square}^{3/2}=(${value}^2)^{3/2}\\)`,
              `\\(=${value}^3=${cube}\\)`,
            ],
            result:
              `계산 결과는 \\(${cube}\\)입니다.`,
            tip:
              "유리수 지수는 근호로 바꾸거나 밑을 거듭제곱 꼴로 바꾸어 계산합니다.",
          };
        }

        case "algebra-01-03": {
          const answer = value + 2;

          return {
            formula:
              `\\(2^{${value}}\\cdot2^2\\)를 한 거듭제곱으로 나타냅니다.`,
            stages: [
              "같은 밑 \\(2\\)를 확인합니다.",
              `지수를 더해 \\(${value}+2\\)`,
              `\\(2^{${answer}}\\)`,
            ],
            result:
              `합쳐진 지수는 \\(${answer}\\)입니다.`,
            tip:
              "같은 밑의 곱은 지수를 더하고, 나눗셈은 지수를 뺍니다.",
          };
        }

        case "algebra-01-04": {
          const power = 2 ** value;

          return {
            formula:
              `\\(\\log_2 ${power}\\)의 값을 구합니다.`,
            stages: [
              `\\(${power}=2^{${value}}\\)`,
              `\\(\\log_2 2^{${value}}\\)`,
              `\\(=${value}\\)`,
            ],
            result:
              `로그값은 지수 \\(${value}\\)입니다.`,
            tip:
              "로그는 밑을 몇 번 거듭제곱해야 진수가 되는지를 나타냅니다.",
          };
        }

        case "algebra-01-05": {
          const number = 10 ** value;

          return {
            formula:
              `\\(N=10^{${value}}=${number}\\)의 자릿수를 확인합니다.`,
            stages: [
              `\\(\\log N=${value}\\)`,
              `지표는 \\(${value}\\)`,
              `자릿수는 \\(${value}+1=${value + 1}\\)`,
            ],
            result:
              `\\(${number}\\)은 \\(${value + 1}\\)자리 자연수입니다.`,
            tip:
              "자연수의 자릿수는 상용로그 지표에 1을 더해 구합니다.",
          };
        }

        case "algebra-01-06": {
          const output = value ** 2;

          return {
            formula:
              `\\(y=${value}^x\\)와 그 역함수를 연결합니다.`,
            stages: [
              `\\(x=2\\Rightarrow y=${output}\\)`,
              `\\(y=${value}^x\\Rightarrow x=\\log_${value}y\\)`,
              `\\(\\log_${value}${output}=2\\)`,
            ],
            result:
              "입력과 출력을 바꾸면 두 함수가 서로 역함수가 됩니다.",
            tip:
              "지수함수의 입력과 출력을 바꾸면 로그함수의 관계가 됩니다.",
          };
        }

        case "algebra-01-07":
          return {
            formula:
              `\\(y=${value}^x\\)와 \\(y=\\log_${value}x\\)의 그래프를 비교합니다.`,
            stages: [
              "지수함수는 \\((0,1)\\)을 지납니다.",
              "로그함수는 \\((1,0)\\)을 지납니다.",
              "두 그래프는 \\(y=x\\)에 대칭입니다.",
            ],
            result:
              `\\(${value}>1\\)이므로 두 함수 모두 각 정의역에서 증가합니다.`,
            tip:
              "역함수의 두 그래프는 직선 y=x에 대하여 대칭입니다.",
          };

        case "algebra-01-08": {
          const power = value ** 3;

          return {
            formula:
              `\\(${value}^x=${power}\\)을 풉니다.`,
            stages: [
              `\\(${power}=${value}^3\\)`,
              `\\(${value}^x=${value}^3\\)`,
              "\\(x=3\\)",
            ],
            result: "방정식의 해는 3입니다.",
            tip:
              "지수방정식은 양변의 밑을 같게 만든 뒤 지수를 비교합니다.",
          };
        }

        case "algebra-02-01": {
          const degrees = value * 30;

          return {
            formula:
              `\\(${degrees}^{\\circ}\\)를 호도법으로 바꿉니다.`,
            stages: [
              "\\(180^{\\circ}=\\pi\\,\\mathrm{rad}\\)",
              `\\(${degrees}^{\\circ}\\times\\frac{\\pi}{180^{\\circ}}\\)`,
              `\\(\\frac{${value}\\pi}{6}\\,\\mathrm{rad}\\)`,
            ],
            result:
              `결과는 \\(\\frac{${value}\\pi}{6}\\) 라디안입니다.`,
            tip:
              "각도에 π/180을 곱하면 육십분법을 호도법으로 바꿀 수 있습니다.",
          };
        }

        case "algebra-02-02":
          return {
            formula:
              `\\(y=${value}\\sin x\\)의 범위를 확인합니다.`,
            stages: [
              "\\(-1\\leq\\sin x\\leq1\\)",
              `\\(-${value}\\leq${value}\\sin x\\leq${value}\\)`,
              `최댓값 \\(${value}\\), 최솟값 \\(-${value}\\)`,
            ],
            result:
              `진폭은 \\(${value}\\), 주기는 \\(2\\pi\\)입니다.`,
            tip:
              "sin x의 값의 범위에 계수를 곱하면 최댓값과 최솟값이 보입니다.",
          };

        case "algebra-02-03": {
          const sideB = value + 1;
          const sideC = value + 2;
          const square =
            sideB ** 2 +
            sideC ** 2 -
            sideB * sideC;

          return {
            formula:
              `\\(b=${sideB},\\ c=${sideC},\\ A=60^{\\circ}\\)일 때 \\(a\\)를 구합니다.`,
            stages: [
              "\\(a^2=b^2+c^2-2bc\\cos A\\)",
              `\\(a^2=${sideB ** 2}+${sideC ** 2}-${sideB * sideC}\\)`,
              `\\(a=\\sqrt{${square}}\\)`,
            ],
            result:
              `변 \\(a\\)의 길이는 \\(\\sqrt{${square}}\\)입니다.`,
            tip:
              "두 변과 그 끼인각을 알면 코사인법칙으로 나머지 변을 구합니다.",
          };
        }

        case "algebra-03-01": {
          const answer = 2 * value + 1;

          return {
            formula:
              `\\(a_n=2n+1\\)에서 \\(a_${value}\\)을 구합니다.`,
            stages: [
              `일반항에 \\(n=${value}\\) 대입`,
              `\\(a_${value}=2\\cdot${value}+1\\)`,
              `\\(a_${value}=${answer}\\)`,
            ],
            result:
              `제\\(${value}\\)항은 \\(${answer}\\)입니다.`,
            tip:
              "일반항은 항 번호 n을 넣으면 원하는 항의 값을 알려주는 식입니다.",
          };
        }

        case "algebra-03-02": {
          const answer = 1 + 4 * value;

          return {
            formula:
              `\\(a_1=1,\\ d=${value}\\)인 등차수열의 \\(a_5\\)를 구합니다.`,
            stages: [
              "\\(a_n=a_1+(n-1)d\\)",
              `\\(a_5=1+4\\cdot${value}\\)`,
              `\\(a_5=${answer}\\)`,
            ],
            result:
              `제\\(5\\)항은 \\(${answer}\\)입니다.`,
            tip:
              "등차수열에서는 첫째항에 공차를 n-1번 더합니다.",
          };
        }

        case "algebra-03-03": {
          const answer = value ** 3;

          return {
            formula:
              `\\(a_1=1,\\ r=${value}\\)인 등비수열의 \\(a_4\\)를 구합니다.`,
            stages: [
              "\\(a_n=a_1r^{n-1}\\)",
              `\\(a_4=1\\cdot${value}^3\\)`,
              `\\(a_4=${answer}\\)`,
            ],
            result:
              `제\\(4\\)항은 \\(${answer}\\)입니다.`,
            tip:
              "등비수열에서는 첫째항에 공비를 n-1번 곱합니다.",
          };
        }

        case "algebra-03-04": {
          const answer =
            (value * (value + 1)) / 2;

          return {
            formula:
              `\\(\\displaystyle\\sum_{k=1}^{${value}}k\\)를 계산합니다.`,
            stages: [
              "\\(\\displaystyle\\sum_{k=1}^{n}k=\\frac{n(n+1)}{2}\\)",
              `\\(\\frac{${value}(${value}+1)}{2}\\)`,
              `\\(=${answer}\\)`,
            ],
            result:
              `합은 \\(${answer}\\)입니다.`,
            tip:
              "시그마의 위끝과 아래끝을 먼저 확인한 뒤 알맞은 합 공식을 사용합니다.",
          };
        }

        case "algebra-03-05":
          return {
            formula:
              `\\(\\displaystyle\\sum_{k=1}^{${value}}\\frac{1}{k(k+1)}\\)을 계산합니다.`,
            stages: [
              "\\(\\frac{1}{k(k+1)}=\\frac1k-\\frac1{k+1}\\)",
              "이웃한 중간 항들이 서로 소거됩니다.",
              `\\(1-\\frac1{${value + 1}}=\\frac{${value}}{${value + 1}}\\)`,
            ],
            result:
              `합은 \\(\\frac{${value}}{${value + 1}}\\)입니다.`,
            tip:
              "부분분수로 분해하면 중간 항이 사라지고 처음과 끝 항만 남습니다.",
          };

        case "algebra-03-06": {
          const answer = 1 + 3 * value;

          return {
            formula:
              `\\(a_1=1,\\ a_{n+1}=a_n+${value}\\)에서 \\(a_4\\)를 구합니다.`,
            stages: [
              `\\(a_2=1+${value}\\)`,
              `\\(a_3=1+2\\cdot${value}\\)`,
              `\\(a_4=1+3\\cdot${value}=${answer}\\)`,
            ],
            result:
              `제\\(4\\)항은 \\(${answer}\\)입니다.`,
            tip:
              "점화식은 첫째항부터 다음 항을 차례대로 만들어 가는 규칙입니다.",
          };
        }

        case "algebra-03-07": {
          const answer =
            (value * (value + 1)) / 2;

          return {
            formula:
              `\\(1+2+\\cdots+${value}=\\frac{${value}(${value}+1)}2\\)를 확인합니다.`,
            stages: [
              "\\(P(1)\\)이 성립하는지 확인",
              "\\(P(k)\\)가 참이라고 가정",
              "\\(P(k+1)\\)을 증명",
            ],
            result:
              `\\(n=${value}\\)일 때 양변은 모두 \\(${answer}\\)입니다.`,
            tip:
              "기초 단계와 귀납 단계를 모두 확인해야 모든 자연수에 대한 결론을 얻습니다.",
          };
        }

        default:
          return {
            formula:
              config.conceptTitle ||
              "대수 개념 예제",
            stages: [
              "정의를 확인합니다.",
              "성질을 적용합니다.",
              "계산을 완성합니다.",
            ],
            result:
              "핵심 관계를 단계별로 확인했습니다.",
            tip:
              "값이 달라져도 같은 정의와 성질이 적용되는지 확인해 보세요.",
          };
      }
    }

    function render() {
      const example = createExample();
      const activeMode =
        modeButtons[modeIndex];

      valueOutput.value = valueInput.value;
      tip.textContent = example.tip;
      stepOutput.textContent = `${stage + 1} / 3`;
      methodOutput.textContent =
        activeMode?.textContent.trim() ||
        "핵심 관계";
      setMath(
        verdict,
        stage >= 2
          ? example.result
          : "다음 단계를 눌러 계산 과정을 이어보세요."
      );

      setMath(formula, example.formula);

      stageElements.forEach((element, index) => {
        setMath(
          element,
          index <= stage
            ? example.stages[index]
            : "\\(?\\)"
        );
      });

      stageCards.forEach((card, index) => {
        card.classList.toggle(
          "active",
          index === stage
        );
        card.classList.toggle(
          "done",
          index < stage
        );
      });

      modeButtons.forEach((button, index) => {
        button.classList.toggle(
          "active",
          index === modeIndex
        );
      });

      advanceButton.textContent =
        stage >= 2
          ? "처음 단계부터 다시 보기"
          : "다음 계산 단계 보기";
    }

    valueInput.addEventListener("input", () => {
      stage = 0;
      render();
    });

    advanceButton.addEventListener(
      "click",
      () => {
        stage = stage >= 2 ? 0 : stage + 1;
        render();
      }
    );

    modeButtons.forEach((button, index) => {
      button.addEventListener("click", () => {
        modeIndex = index;
        stage = index;
        render();
      });
    });

    render();
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });

    const body = await response.json();

    if (!response.ok) {
      throw new Error(
        body.message || "요청을 처리하지 못했습니다."
      );
    }

    return body;
  }

  function initPractice() {
    const form = document.getElementById(
      "problem-answer-form"
    );

    if (!form) return;

    const prompt = document.getElementById(
      "problem-prompt"
    );

    const typeLabel = document.getElementById(
      "problem-type-label"
    );

    const answerArea = document.getElementById(
      "problem-answer-area"
    );

    const feedback = document.getElementById(
      "problem-feedback"
    );

    const feedbackCopy = feedback?.querySelector(
      "[data-problem-feedback-copy]"
    );

    const coachCharacterStage = feedback?.querySelector(
      "[data-problem-coach-character]"
    );

    const coachCharacterImage = feedback?.querySelector(
      "[data-problem-coach-character-image]"
    );

    const submitButton = document.getElementById(
      "submit-answer"
    );

    const nextButton = document.getElementById(
      "next-problem"
    );

    const checkbox = document.getElementById(
      "concept-complete-checkbox"
    );

    const checkboxLabel = document.getElementById(
      "concept-complete-label"
    );

    const completionMessage = document.getElementById(
      "completion-message"
    );

    const countElement = document.getElementById(
      "correct-type-count"
    );

    const dots = Array.from(
      document.querySelectorAll("#mastery-dots i")
    );

    const reviewBanner = document.getElementById(
      "review-mode-banner"
    );

    const reviewIcon = reviewBanner?.querySelector(
      ".review-mode-icon"
    );

    const reviewTitle = document.getElementById(
      "review-mode-title"
    );

    const reviewMessage = document.getElementById(
      "review-mode-message"
    );

    const reviewReturn = document.getElementById(
      "review-return"
    );

    const isReviewMode = Boolean(
      config.review?.attemptId
    );

    const baseUrl = [
      "/api/practice",
      encodeURIComponent(config.courseId),
      encodeURIComponent(config.unitId),
      encodeURIComponent(config.conceptId),
    ].join("/");

    let currentProblem = null;
    let answerSubmitted = false;
    let coachCharacterTimer = null;
    let coachCharacterSwapTimer = null;
    let coachCharacterName = "";
    let coachCharacterTone = "";
    let coachCharacterFrame = 0;

    const coachCharacterNames = [
      "goat",
      "pigeon",
      "llama",
    ];

    const reduceCoachMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    function coachCharacterSource(frame) {
      return `/images/coach-characters/${coachCharacterTone}-${coachCharacterName}-${frame}.webp`;
    }

    function stopCoachCharacter() {
      if (coachCharacterTimer) {
        window.clearInterval(coachCharacterTimer);
      }
      if (coachCharacterSwapTimer) {
        window.clearTimeout(coachCharacterSwapTimer);
      }
      coachCharacterTimer = null;
      coachCharacterSwapTimer = null;
      coachCharacterStage?.classList.remove("is-switching");
    }

    function startCoachCharacter() {
      stopCoachCharacter();

      if (
        !coachCharacterImage ||
        !coachCharacterName ||
        !coachCharacterTone ||
        reduceCoachMotion.matches ||
        document.hidden ||
        feedback?.hidden
      ) {
        return;
      }

      coachCharacterTimer = window.setInterval(() => {
        coachCharacterStage?.classList.add("is-switching");
        window.clearTimeout(coachCharacterSwapTimer);
        coachCharacterSwapTimer = window.setTimeout(() => {
          coachCharacterFrame =
            (coachCharacterFrame % 3) + 1;
          coachCharacterImage.src =
            coachCharacterSource(coachCharacterFrame);
          window.requestAnimationFrame(() => {
            coachCharacterStage?.classList.remove("is-switching");
          });
        }, 120);
      }, 2000);
    }

    function showCoachCharacter(mode) {
      const tone = ["mild", "spicy"].includes(mode)
        ? mode
        : "";

      if (
        !tone ||
        !coachCharacterStage ||
        !coachCharacterImage
      ) {
        stopCoachCharacter();
        coachCharacterStage?.setAttribute("hidden", "");
        feedback?.classList.add("without-coach-character");
        return;
      }

      if (!coachCharacterName || coachCharacterTone !== tone) {
        coachCharacterName =
          coachCharacterNames[
            Math.floor(
              Math.random() * coachCharacterNames.length
            )
          ];
        coachCharacterFrame = 1;
      }

      coachCharacterTone = tone;
      coachCharacterFrame = 1;
      coachCharacterStage.dataset.characterTone = tone;
      coachCharacterImage.src = coachCharacterSource(1);
      coachCharacterStage.removeAttribute("hidden");
      feedback?.classList.remove("without-coach-character");

      for (let frame = 2; frame <= 3; frame += 1) {
        const image = new Image();
        image.src = coachCharacterSource(frame);
      }

      startCoachCharacter();
    }

    function hideProblemFeedback({ resetCharacter = false } = {}) {
      if (feedback) feedback.hidden = true;
      stopCoachCharacter();

      if (resetCharacter) {
        coachCharacterName = "";
        coachCharacterTone = "";
        coachCharacterFrame = 0;
      }
    }

    function appendFeedbackText(
      className,
      text,
      tagName = "p",
      renderMath = false
    ) {
      if (!feedbackCopy || !text) return null;

      const element = document.createElement(tagName);
      element.className = className;
      feedbackCopy.appendChild(element);

      if (renderMath) {
        setMath(element, text);
      } else {
        element.textContent = text;
      }

      return element;
    }

    function renderProblemFeedback({
      state = "wrong",
      title = "",
      coach = null,
      solution = "",
      message = "",
    } = {}) {
      if (!feedback || !feedbackCopy) return;

      window.MatthsMath?.clear(feedbackCopy);
      feedbackCopy.replaceChildren();
      feedback.className = `problem-feedback ${state}`;

      appendFeedbackText(
        "problem-feedback-status",
        title,
        "strong"
      );
      appendFeedbackText(
        "problem-coach-message",
        coach?.message || message,
        "blockquote"
      );
      appendFeedbackText(
        "problem-feedback-solution",
        solution,
        "div",
        true
      );

      feedback.hidden = false;
      showCoachCharacter(
        coach?.message ? coach.mode : "silent"
      );
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopCoachCharacter();
      } else {
        startCoachCharacter();
      }
    });

    function renderReview(review) {
      if (!isReviewMode || !review) return;

      const completed = Boolean(
        review.completed
      );

      reviewBanner?.classList.toggle(
        "completed",
        completed
      );

      if (reviewIcon) {
        reviewIcon.textContent = completed
          ? "✓"
          : "↻";
      }

      if (reviewTitle) {
        reviewTitle.textContent = completed
          ? "오답 복습을 완료했습니다."
          : "이 오답의 복습을 진행하고 있습니다.";
      }

      if (reviewMessage) {
        reviewMessage.textContent = completed
          ? "같은 유형의 재도전 문제를 정확히 해결했습니다."
          : review.scheduled
            ? "이번 재도전에서 다시 틀려 내일 복습 예정으로 예약됐습니다."
            : "새로 저장된 오답이라 지금 바로 복습할 수 있습니다.";
      }

      if (reviewReturn) {
        reviewReturn.hidden = !completed;
      }
    }

    function renderMastery(mastery) {
      const count = mastery.correctTypeIds.length;

      countElement.textContent = count;

      dots.forEach((dot, index) => {
        const done = index < count;
        dot.classList.toggle("done", done);
        dot.textContent = done ? "✓" : index + 1;
      });

      checkbox.disabled = !mastery.unlocked;
      checkbox.checked = mastery.userCompleted;

      checkboxLabel.classList.toggle(
        "unlocked",
        mastery.unlocked
      );

      checkboxLabel.classList.toggle(
        "locked",
        !mastery.unlocked
      );

      completionMessage.textContent = mastery.unlocked
        ? "완료 표시를 선택하거나 취소할 수 있습니다."
        : `${mastery.required - count}개의 새로운 유형을 더 맞혀야 합니다.`;
    }

    function renderLearningProgress(progress) {
      if (!progress) return;

      window.dispatchEvent(
        new CustomEvent("matths:learning-progress", {
          detail: progress,
        })
      );
    }

    function renderAnswerInput(problem) {
      window.MatthsMath?.clear(answerArea);
      answerArea.innerHTML = "";

      if (problem.inputMode === "multiple-choice") {
        problem.choices.forEach((choice) => {
          const label = document.createElement("label");
          label.className = "choice-answer";

          const input = document.createElement("input");
          input.type = "radio";
          input.name = "answer";
          input.value = choice.key;
          input.required = true;
          input.setAttribute(
            "aria-label",
            String(choice.text || "선택지")
              .replace(/^\\\(|\\\)$/g, "")
              .trim()
          );

          const text = document.createElement("span");
          text.textContent = choice.text;

          label.append(input, text);
          answerArea.appendChild(label);
        });

        typesetMath(answerArea);
        return;
      }

      const input = document.createElement("input");
      input.className = "short-answer-input";
      input.name = "answer";
      input.dataset.mathInput = "";
      input.placeholder =
        "정답을 입력하세요. 분수는 1/2처럼 입력할 수 있습니다.";
      input.autocomplete = "off";
      input.required = true;

      answerArea.appendChild(input);
      window.MatthsMathKeyboard?.attach(
        input
      );
    }

    async function loadProblem() {
      answerSubmitted = false;
      submitButton.disabled = true;
      submitButton.textContent =
        "정답 확인";
      nextButton.hidden = true;
      hideProblemFeedback({ resetCharacter: true });

      prompt.textContent = "문제를 준비하고 있습니다.";
      typeLabel.textContent = "LOADING";

      try {
        const nextProblemUrl = isReviewMode
          ? `${baseUrl}/next?reviewAttempt=${encodeURIComponent(
              config.review.attemptId
            )}`
          : `${baseUrl}/next`;

        const result = await requestJson(
          nextProblemUrl
        );

        currentProblem = result.problem;

        typeLabel.textContent = isReviewMode
          ? `${currentProblem.typeLabel} · 오답 재도전`
          : currentProblem.typeLabel;

        setMath(prompt, currentProblem.prompt);

        renderAnswerInput(currentProblem);
        renderMastery(result.mastery);
        renderReview(result.review);

        submitButton.disabled = false;
      } catch (error) {
        prompt.textContent = error.message;
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (
        !currentProblem ||
        answerSubmitted
      ) {
        return;
      }

      const formData = new FormData(form);
      const answer = formData.get("answer");

      if (
        answer === null ||
        String(answer).trim() === ""
      ) {
        renderProblemFeedback({
          state: "wrong",
          title: "답안이 비어 있습니다.",
          coach: currentProblem.coachPrompt,
          message: "정답을 먼저 입력해 주세요.",
        });
        answerArea
          .querySelector("input")
          ?.focus();
        return;
      }

      submitButton.disabled = true;

      try {
        const result = await requestJson(
          `${baseUrl}/attempt`,
          {
            method: "POST",
            body: JSON.stringify({
              instanceId: currentProblem.instanceId,
              answer,
            }),
          }
        );

        answerSubmitted = true;
        submitButton.disabled = true;
        submitButton.textContent =
          "채점 완료";
        answerArea
          .querySelectorAll("input")
          .forEach((input) => {
            input.disabled = true;
          });

        const reviewCompleted = Boolean(
          isReviewMode &&
          result.correct &&
          result.review?.completed
        );

        const feedbackTitle = reviewCompleted
          ? "정답입니다. 오답 복습이 완료되었습니다."
          : result.correct
            ? "정답입니다."
            : isReviewMode
              ? "아쉽습니다. 내일 복습 예정으로 예약했습니다."
              : "아쉽습니다.";

        renderProblemFeedback({
          state: result.correct ? "correct" : "wrong",
          title: feedbackTitle,
          coach: result.coachFeedback,
          solution: result.solution,
        });
        renderMastery(result.mastery);
        renderLearningProgress(result.progress);
        renderReview(result.review);

        nextButton.hidden = reviewCompleted;

        if (reviewReturn && reviewCompleted) {
          reviewReturn.hidden = false;
        }
      } catch (error) {
        answerSubmitted = false;
        renderProblemFeedback({
          state: "wrong",
          title: "채점하지 못했습니다.",
          message: error.message,
        });
        submitButton.disabled = false;
      }
    });

    nextButton.addEventListener(
      "click",
      loadProblem
    );

    checkbox.addEventListener("change", async () => {
      const previousValue = !checkbox.checked;

      checkbox.disabled = true;

      try {
        const result = await requestJson(
          `${baseUrl}/completion`,
          {
            method: "PATCH",
            body: JSON.stringify({
              completed: checkbox.checked,
            }),
          }
        );

        renderMastery(result.mastery);
        renderLearningProgress(result.progress);
      } catch (error) {
        checkbox.checked = previousValue;
        completionMessage.textContent = error.message;
        checkbox.disabled = false;
      }
    });

    renderMastery({
      ...config.initialMastery,
      required: config.requiredDistinctTypes,
    });

    renderReview(config.review);
    loadProblem();
  }

  function init() {
    initNavigation();
    initMotionOpening();
    initLimitPlayground();
    initCalculationPlayground();
    initContinuityPlayground();
    initContinuousPropertiesPlayground();
    initAlgebraPlayground();
    initPractice();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );
  } else {
    init();
  }
})();
