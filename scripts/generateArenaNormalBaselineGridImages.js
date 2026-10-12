#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const { spawn } = require("child_process");
const sharp = require("sharp");
const noteGrid = require("../public/js/matths-note-grid.js");

const projectRoot = path.resolve(__dirname, "..");
const manifestPath = path.join(
  projectRoot,
  "audit",
  "GOAT_ARENA_NORMAL_BASELINE_CAPTURE_PLAN.json"
);
const outputDirectory = path.join(
  projectRoot,
  "audit",
  "GOAT_ARENA_NORMAL_BASELINE_GRID_IMAGES"
);
const previewPath = path.join(
  projectRoot,
  "audit",
  "GOAT_ARENA_NORMAL_BASELINE_GRID_PREVIEW.png"
);
const chromePath =
  process.env.GOAT_ARENA_CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const mathJaxPath = path.join(projectRoot, "node_modules", "mathjax", "tex-svg.js");

const PAGE_WIDTH = 1200;
const HEADER_HEIGHT = 700;
const BOARD_HEIGHT = 900;
const PAGE_HEIGHT = HEADER_HEIGHT + BOARD_HEIGHT;
const CONCURRENCY = Math.max(
  1,
  Math.min(8, Number(process.env.GOAT_ARENA_RENDER_CONCURRENCY || 4))
);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(Number(milliseconds || 0) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}분 ${String(remainder).padStart(2, "0")}초`;
}

function renderHtml(entry) {
  const outcomeLabel = entry.baselineCorrect ? "정답 기록" : "의도 오답 기록";
  const outcomeClass = entry.baselineCorrect ? "correct" : "incorrect";
  const prompt = escapeHtml(entry.question?.prompt || "");
  const promptLength = String(entry.question?.prompt || "").length;
  const promptFontSize =
    promptLength > 160 ? 23 : promptLength > 120 ? 25 : promptLength > 90 ? 27 : 29;
  const mathJaxUrl = pathToFileURL(mathJaxPath).href;
  const visualization = entry.question?.visualization;
  const visualizationScriptUrl = pathToFileURL(path.join(projectRoot, "public", "js", "arena-problem-visualization.js")).href;
  const noteGridScriptUrl = pathToFileURL(path.join(projectRoot, "public", "js", "matths-note-grid.js")).href;

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${PAGE_WIDTH}, initial-scale=1">
  <title>${escapeHtml(entry.baselineKey)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      width: ${PAGE_WIDTH}px;
      height: ${PAGE_HEIGHT}px;
      margin: 0;
      overflow: hidden;
      background: ${noteGrid.spec.paperColor};
      color: #17233c;
      font-family: "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
    }
    body { opacity: 0; }
    body.ready { opacity: 1; }
    .problem {
      width: ${PAGE_WIDTH}px;
      height: ${HEADER_HEIGHT}px;
      padding: 42px 54px 34px;
      border-bottom: 2px solid #b7c7df;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      gap: 23px;
    }
    .meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      min-height: 48px;
    }
    .identity {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }
    .key {
      font-size: 27px;
      line-height: 1;
      font-weight: 850;
      letter-spacing: 0.01em;
      white-space: nowrap;
    }
    .tier {
      padding: 9px 14px 8px;
      border-radius: 999px;
      background: #eef4ff;
      color: #365a97;
      font-size: 18px;
      line-height: 1;
      font-weight: 750;
      white-space: nowrap;
    }
    .answer {
      display: flex;
      align-items: baseline;
      gap: 12px;
      padding: 11px 16px 10px;
      border: 1px solid #c8d5e8;
      border-radius: 12px;
      background: #f7f9fc;
      white-space: nowrap;
    }
    .answer small {
      color: #60708c;
      font-size: 15px;
      font-weight: 700;
    }
    .answer strong {
      color: #17233c;
      font-size: 24px;
      font-weight: 850;
    }
    .answer em {
      font-size: 15px;
      font-style: normal;
      font-weight: 800;
    }
    .answer.correct em { color: #18794e; }
    .answer.incorrect em { color: #b54708; }
    .prompt {
      flex: 1;
      display: flex;
      align-items: center;
      min-height: 0;
      overflow: hidden;
    }
    .prompt-content {
      width: 100%;
      font-family: "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
      font-size: ${promptFontSize}px;
      line-height: 1.6;
      font-weight: 620;
      letter-spacing: -0.015em;
      word-break: keep-all;
      overflow-wrap: anywhere;
    }
    .prompt-content mjx-container { margin: 0 0.08em !important; }
    .prompt.with-visualization { flex-direction: column; gap: 12px; }
    .problem-figure { width: 100%; max-width: 640px; height: 240px; margin: 0 auto; flex-shrink: 0; }
    .problem-figure > svg { width: 100%; height: 100%; }
    .guide {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      color: #61708b;
      font-size: 15px;
      line-height: 1.2;
      font-weight: 650;
    }
    .guide b { color: #365a97; }
    #board {
      display: block;
      width: ${PAGE_WIDTH}px;
      height: ${BOARD_HEIGHT}px;
      touch-action: none;
      background: #ffffff;
    }
  </style>
  <script>
    window.MathJax = {
      tex: { inlineMath: [["\\\\(", "\\\\)"], ["$", "$"]] },
      svg: { fontCache: "local" },
      startup: {
        ready() {
          MathJax.startup.defaultReady();
          MathJax.startup.promise.then(() => {
            document.body.classList.add("ready");
          });
        }
      }
    };
  </script>
  <script defer src="${mathJaxUrl}"></script>
  <script defer src="${visualizationScriptUrl}"></script>
  <script src="${noteGridScriptUrl}"></script>
</head>
<body>
  <section class="problem">
    <div class="meta">
      <div class="identity">
        <span class="key">${escapeHtml(entry.baselineKey)}</span>
        <span class="tier">${escapeHtml(entry.tierLabel)} · ${escapeHtml(entry.difficultyCode)} · MMR ${escapeHtml(entry.targetMmr)}</span>
      </div>
      <div class="answer ${outcomeClass}">
        <small>기준 제출 답안</small>
        <strong>${escapeHtml(entry.baselineSubmittedAnswer)}</strong>
        <em>${outcomeLabel}</em>
      </div>
    </div>
    <div class="prompt${visualization ? " with-visualization" : ""}"><div class="prompt-content">${prompt}</div>${visualization ? `<figure class="problem-figure" data-arena-visualization="${escapeHtml(encodeURIComponent(JSON.stringify(visualization)))}"><svg role="img" aria-label="문제의 필수 시각자료"></svg></figure>` : ""}</div>
    <div class="guide">
      <span><b>손풀이 작성용</b> · 아래 격자에 풀이과정을 작성하세요.</span>
      <span>가정 풀이 시간 ${formatDuration(entry.baselineSolveTimeMs)}</span>
    </div>
  </section>
  <canvas id="board" width="${PAGE_WIDTH}" height="${BOARD_HEIGHT}" aria-label="격자 풀이판"></canvas>
  <script>
    (() => {
      const canvas = document.getElementById("board");
      const context = canvas.getContext("2d");
      const scale = window.MatthsNoteGrid.spec.exportScale;
      window.MatthsNoteGrid.draw(context, { logicalWidth: canvas.width / scale, logicalHeight: canvas.height / scale, scale });
      setTimeout(() => document.body.classList.add("ready"), 1800);
    })();
  </script>
</body>
</html>`;
}

function runChrome(entry, htmlPath, pngPath, profileDirectory) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let lastSize = 0;
    let stableChecks = 0;
    const child = spawn(
      chromePath,
      [
        "--headless=new",
        "--hide-scrollbars",
        "--disable-gpu",
        "--no-sandbox",
        "--allow-file-access-from-files",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-sync",
        "--metrics-recording-only",
        "--mute-audio",
        `--user-data-dir=${profileDirectory}`,
        `--window-size=${PAGE_WIDTH},${PAGE_HEIGHT}`,
        "--force-device-scale-factor=1",
        "--virtual-time-budget=2500",
        `--screenshot=${pngPath}`,
        pathToFileURL(htmlPath).href,
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let standardError = "";
    child.stderr.on("data", (chunk) => {
      standardError += chunk.toString();
    });
    const poll = setInterval(() => {
      let size = 0;
      try {
        size = fs.statSync(pngPath).size;
      } catch (_error) {
        return;
      }
      stableChecks = size > 10_000 && size === lastSize ? stableChecks + 1 : 0;
      lastSize = size;
      if (stableChecks < 2 || settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timeout);
      child.kill("SIGTERM");
      resolve();
    }, 250);
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      child.kill("SIGKILL");
      reject(
        new Error(
          `${entry.baselineKey} 렌더링 시간 초과\n${standardError.slice(-2000)}`
        )
      );
    }, 20_000);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timeout);
      if (code !== 0 || !fs.existsSync(pngPath)) {
        reject(
          new Error(
            `${entry.baselineKey} 렌더링 실패 (exit ${code})\n${standardError.slice(-2000)}`
          )
        );
        return;
      }
      resolve();
    });
  });
}

async function mapWithConcurrency(items, limit, worker) {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function buildContactSheet(entries) {
  const columns = 7;
  const rows = Math.ceil(entries.length / columns);
  const cellWidth = 300;
  const thumbHeight = Math.round((cellWidth * PAGE_HEIGHT) / PAGE_WIDTH);
  const cellHeight = thumbHeight + 10;
  const composites = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const buffer = await sharp(
      path.join(outputDirectory, entry.expectedSolutionFileName)
    )
      .resize(cellWidth, thumbHeight)
      .png()
      .toBuffer();
    composites.push({
      input: buffer,
      left: (index % columns) * cellWidth,
      top: Math.floor(index / columns) * cellHeight,
    });
  }

  await sharp({
    create: {
      width: columns * cellWidth,
      height: rows * cellHeight,
      channels: 3,
      background: "#dfe7f3",
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(previewPath);
}

async function main() {
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Chrome 실행 파일을 찾을 수 없습니다: ${chromePath}`);
  }
  if (!fs.existsSync(mathJaxPath)) {
    throw new Error(`MathJax 번들을 찾을 수 없습니다: ${mathJaxPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const entries = Array.isArray(manifest.questions) ? manifest.questions : [];
  if (entries.length !== 63) {
    throw new Error(`63문항이어야 하지만 ${entries.length}문항이 확인되었습니다.`);
  }

  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const entry of entries) {
    fs.rmSync(path.join(outputDirectory, entry.expectedSolutionFileName), {
      force: true,
    });
  }
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "goat-arena-grid-"));

  try {
    await mapWithConcurrency(entries, CONCURRENCY, async (entry, index) => {
      const htmlPath = path.join(temporaryRoot, `${entry.baselineKey}.html`);
      const profileDirectory = path.join(temporaryRoot, `chrome-${index}`);
      const pngPath = path.join(outputDirectory, entry.expectedSolutionFileName);
      fs.writeFileSync(htmlPath, renderHtml(entry), "utf8");
      await runChrome(entry, htmlPath, pngPath, profileDirectory);
      const metadata = await sharp(pngPath).metadata();
      if (metadata.width !== PAGE_WIDTH || metadata.height !== PAGE_HEIGHT) {
        throw new Error(
          `${entry.baselineKey} 이미지 크기 불일치: ${metadata.width}x${metadata.height}`
        );
      }
      process.stdout.write(`완료 ${String(index + 1).padStart(2, "0")}/${entries.length} ${entry.baselineKey}\n`);
    });

    await buildContactSheet(entries);
    fs.writeFileSync(
      path.join(outputDirectory, "README.txt"),
      [
        "GOAT Arena 일반전 기준 기록 손풀이 이미지 63장",
        "",
        `배치: ${manifest.batchKey}`,
        `이미지: ${PAGE_WIDTH}x${PAGE_HEIGHT}px (문제 영역 ${HEADER_HEIGHT}px + 실제 격자 풀이판 ${PAGE_WIDTH}x${BOARD_HEIGHT}px)`,
        `격자: 앱과 같은 ${noteGrid.spec.spacing}pt 단일 격자, 선 ${noteGrid.spec.lineWidth}pt, PNG ${noteGrid.spec.exportScale}배 (간격 ${noteGrid.spec.spacing * noteGrid.spec.exportScale}px)`,
        "",
        "각 PNG의 격자에 풀이과정을 작성하고 원래 파일명을 유지해 주세요.",
        "상단의 기준 제출 답안이 오답 기록인 문항은 그 답에 이르는 계산 실수가 풀이에 드러나야 합니다.",
        "",
      ].join("\n"),
      "utf8"
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }

  process.stdout.write(`63장 저장: ${outputDirectory}\n`);
  process.stdout.write(`전체 미리보기: ${previewPath}\n`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
