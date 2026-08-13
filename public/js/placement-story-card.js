(() => {
  const canvas = document.getElementById("placement-story-canvas");
  const configNode = document.getElementById("placement-story-config");
  const downloadButton = document.getElementById("placement-story-download");
  const statusNode = document.getElementById("placement-story-status");
  if (!canvas || !configNode || !downloadButton || !statusNode) return;

  const config = JSON.parse(configNode.textContent || "{}");
  const context = canvas.getContext("2d", { alpha: false });
  const width = 1080;
  const height = 1920;

  function roundedRect(x, y, rectWidth, rectHeight, radius) {
    const safeRadius = Math.min(radius, rectWidth / 2, rectHeight / 2);
    context.beginPath();
    context.moveTo(x + safeRadius, y);
    context.arcTo(x + rectWidth, y, x + rectWidth, y + rectHeight, safeRadius);
    context.arcTo(
      x + rectWidth,
      y + rectHeight,
      x,
      y + rectHeight,
      safeRadius
    );
    context.arcTo(x, y + rectHeight, x, y, safeRadius);
    context.arcTo(x, y, x + rectWidth, y, safeRadius);
    context.closePath();
  }

  function fillTextFitted(text, x, y, maxWidth, initialSize, minimumSize, weight = 800) {
    let size = initialSize;
    do {
      context.font = `${weight} ${size}px "SUIT Variable", "Pretendard Variable", Pretendard, sans-serif`;
      if (context.measureText(text).width <= maxWidth) break;
      size -= 2;
    } while (size > minimumSize);
    context.fillText(text, x, y);
  }

  function drawTrimmedCrest(image, target) {
    const scratch = document.createElement("canvas");
    scratch.width = image.naturalWidth;
    scratch.height = image.naturalHeight;
    const scratchContext = scratch.getContext("2d", { willReadFrequently: true });
    scratchContext.drawImage(image, 0, 0);
    const pixels = scratchContext.getImageData(
      0,
      0,
      scratch.width,
      scratch.height
    ).data;
    let left = scratch.width;
    let top = scratch.height;
    let right = 0;
    let bottom = 0;
    for (let y = 0; y < scratch.height; y += 3) {
      for (let x = 0; x < scratch.width; x += 3) {
        if (pixels[(y * scratch.width + x) * 4 + 3] > 16) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }
    }
    const sourceWidth = Math.max(1, right - left);
    const sourceHeight = Math.max(1, bottom - top);
    const scale = Math.min(
      target.width / sourceWidth,
      target.height / sourceHeight
    );
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    context.drawImage(
      image,
      left,
      top,
      sourceWidth,
      sourceHeight,
      target.x + (target.width - drawWidth) / 2,
      target.y + (target.height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = source;
    });
  }

  function drawBackground() {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#070a18");
    gradient.addColorStop(0.48, "#121a3d");
    gradient.addColorStop(1, "#050714");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    const glow = context.createRadialGradient(540, 620, 80, 540, 620, 630);
    glow.addColorStop(0, "rgba(97, 116, 255, 0.45)");
    glow.addColorStop(0.5, "rgba(55, 65, 188, 0.16)");
    glow.addColorStop(1, "rgba(5, 7, 20, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, 1320);

    context.strokeStyle = "rgba(155, 166, 255, 0.1)";
    context.lineWidth = 2;
    for (let index = -4; index < 11; index += 1) {
      context.beginPath();
      context.moveTo(index * 150, 0);
      context.lineTo(index * 150 + 720, 1920);
      context.stroke();
    }
  }

  async function render() {
    await document.fonts.ready;
    const crest = await loadImage(`/images/ranks/${config.tierAsset}.png`);
    drawBackground();

    context.textAlign = "center";
    context.fillStyle = "#ffffff";
    context.font = '900 46px "SUIT Variable", "Pretendard Variable", Pretendard, sans-serif';
    context.fillText("MATTHS", 540, 116);
    context.fillStyle = "#9aa7d8";
    context.font = '750 25px "SUIT Variable", "Pretendard Variable", Pretendard, sans-serif';
    context.letterSpacing = "8px";
    context.fillText("GOAT ARENA · FIRST PLACEMENT", 540, 174);
    context.letterSpacing = "0px";

    context.save();
    context.shadowColor = "rgba(63, 102, 255, 0.58)";
    context.shadowBlur = 70;
    drawTrimmedCrest(crest, { x: 190, y: 260, width: 700, height: 740 });
    context.restore();

    context.fillStyle = "#aeb8e5";
    context.font = '800 30px "SUIT Variable", "Pretendard Variable", Pretendard, sans-serif';
    context.fillText("MY FIRST TIER", 540, 1060);
    context.fillStyle = "#ffffff";
    fillTextFitted(String(config.tier), 540, 1186, 900, 118, 72, 950);

    context.fillStyle = "#c6ceef";
    context.font = '650 35px "SUIT Variable", "Pretendard Variable", Pretendard, sans-serif';
    fillTextFitted(`${config.nickname}님의 첫 번째 티어`, 540, 1260, 900, 35, 26, 650);

    const cards = [
      {
        label: "PLACEMENT SCORE",
        value: `${config.correctCount} / ${config.totalCount}`,
        detail: "정답 문항",
      },
      {
        label: "ESTIMATED RANK · 10K",
        value:
          config.topPercent === null
            ? "위치 산정 중"
            : `${Number(config.estimatedRankPopulation || 10000).toLocaleString("ko-KR")}명 중 예상 ${Number(config.estimatedRank || 1).toLocaleString("ko-KR")}위`,
        detail:
          config.actualRankPublished === true
            ? `실응시 ${config.cohortSize}명 중 ${config.cohortRank}위`
            : config.usesMoeNineGradeReference === true
              ? "교육부 9등급 비율 준용"
              : "응시 당시 고정 기준분포",
      },
    ];

    cards.forEach((card, index) => {
      const x = 92 + index * 458;
      const y = 1350;
      roundedRect(x, y, 428, 238, 34);
      context.fillStyle = "rgba(255, 255, 255, 0.075)";
      context.fill();
      context.strokeStyle = "rgba(191, 201, 255, 0.2)";
      context.lineWidth = 2;
      context.stroke();
      context.textAlign = "left";
      context.fillStyle = "#929fd4";
      context.font = '800 20px "SUIT Variable", "Pretendard Variable", Pretendard, sans-serif';
      context.fillText(card.label, x + 34, y + 55);
      context.fillStyle = "#ffffff";
      fillTextFitted(card.value, x + 34, y + 132, 360, 50, 30, 900);
      context.fillStyle = "#aab4dd";
      context.font = '600 23px "SUIT Variable", "Pretendard Variable", Pretendard, sans-serif';
      context.fillText(card.detail, x + 34, y + 188);
    });

    context.textAlign = "center";
    context.fillStyle = "#ffffff";
    context.font = '850 34px "SUIT Variable", "Pretendard Variable", Pretendard, sans-serif';
    context.fillText("나의 수학 실력, 첫 좌표를 찍다.", 540, 1710);
    context.fillStyle = "#8996c8";
    context.font = '650 24px "SUIT Variable", "Pretendard Variable", Pretendard, sans-serif';
    context.fillText("www.matths.kr  ·  #Matths  #GOATArena", 540, 1782);

    context.fillStyle = "rgba(255, 255, 255, 0.18)";
    context.fillRect(92, 1840, 896, 2);
    context.fillStyle = "#7682b2";
    context.font = '600 19px "SUIT Variable", "Pretendard Variable", Pretendard, sans-serif';
    context.fillText("FIRST PLACEMENT RESULT", 540, 1884);

    downloadButton.disabled = false;
    statusNode.textContent = "스토리 카드가 준비되었습니다.";
  }

  downloadButton.addEventListener("click", () => {
    downloadButton.disabled = true;
    statusNode.textContent = "PNG 파일을 만들고 있습니다.";
    canvas.toBlob((blob) => {
      if (!blob) {
        statusNode.textContent = "이미지를 만들지 못했습니다. 다시 시도해주세요.";
        downloadButton.disabled = false;
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `matths-first-tier-${config.tierAsset}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      statusNode.textContent = "1080 × 1920 PNG를 다운로드했습니다.";
      downloadButton.disabled = false;
    }, "image/png");
  });

  render().catch(() => {
    statusNode.textContent = "스토리 카드를 불러오지 못했습니다. 페이지를 새로고침해주세요.";
  });
})();
