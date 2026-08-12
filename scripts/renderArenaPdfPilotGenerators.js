"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  generateAllArenaPdfPilotProblems,
  listArenaPdfPilotDefinitions,
} = require("../services/arenaPdfPilotGenerators");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(
  ROOT,
  "dataAnalysis/arenaPdfSkeletonImplementation/pilot-render-v2.html"
);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function circularDiagram(visualization) {
  if (visualization?.kind !== "CIRCULAR_SEATING") return "";
  const seatCount = Number(visualization.seatCount || 0);
  const seats = Array.from({ length: seatCount }, (_, index) => {
    const angle = (2 * Math.PI * index) / seatCount - Math.PI / 2;
    const x = 110 + 78 * Math.cos(angle);
    const y = 110 + 78 * Math.sin(angle);
    return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="13" />`;
  }).join("");
  return `<div class="visual"><svg viewBox="0 0 220 220" role="img" aria-label="${seatCount}개 원형 좌석"><circle class="table" cx="110" cy="110" r="50" />${seats}</svg></div>`;
}

function normalTable(visualization) {
  if (visualization?.kind !== "NORMAL_TABLE") return "";
  const rows = (visualization.rows || [])
    .map(
      ([z, probability]) =>
        `<tr><td>${escapeHtml(z)}</td><td>${escapeHtml(probability)}</td></tr>`
    )
    .join("");
  return `<div class="visual normal-table"><table><thead><tr><th>z</th><th>P(0 ≤ Z ≤ z)</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function expLogDiagram(visualization) {
  if (visualization?.kind !== "EXP_LOG_TRAPEZOID") return "";
  return `<div class="visual exp-log"><svg viewBox="0 0 320 210" role="img" aria-label="평행한 두 로그곡선과 사다리꼴">
    <path class="axis" d="M28 184H302M46 198V18" />
    <path class="curve" d="M52 174C62 126 92 82 154 52C205 28 254 21 296 18" />
    <path class="curve muted" d="M73 184C84 144 113 108 171 80C219 56 262 47 299 43" />
    <path class="region" d="M83 135L157 135L235 73L116 73Z" />
    <path class="guide" d="M83 135H157M116 73H235M157 135V73" />
    <text x="65" y="151">A</text><text x="158" y="151">B</text><text x="104" y="65">C</text><text x="238" y="65">D</text>
  </svg></div>`;
}

function renderVisualization(visualization) {
  return (
    circularDiagram(visualization) ||
    normalTable(visualization) ||
    expLogDiagram(visualization)
  );
}

function renderCard(problem, definition, index) {
  const visualization = renderVisualization(problem.problem.visualization);
  return `<article class="problem-card" data-type-id="${escapeHtml(problem.typeId)}">
    <header>
      <span class="number">${index + 1}</span>
      <div>
        <p>${escapeHtml(definition.sourceReferenceId)}</p>
        <h2>${escapeHtml(definition.title)}</h2>
      </div>
      <strong>${escapeHtml(problem.problem.answer)}</strong>
    </header>
    <div class="prompt">${escapeHtml(problem.problem.prompt)}</div>${visualization ? `
    ${visualization}` : ""}
    <details open>
      <summary>독립 검산 해설</summary>
      <p>${escapeHtml(problem.problem.solution)}</p>
    </details>
    <footer>
      <code>${escapeHtml(problem.canonicalStructureId)}</code>
      <span>운영 미연결 파일럿</span>
    </footer>
  </article>`;
}

function main() {
  const definitions = listArenaPdfPilotDefinitions();
  const problems = generateAllArenaPdfPilotProblems("render-v2");
  const cards = problems
    .map((problem, index) => renderCard(problem, definitions[index], index))
    .join("\n");
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>GOAT Arena PDF 스켈레톤 구현 32종</title>
  <script>window.MathJax={tex:{inlineMath:[["\\\\(","\\\\)"]]},svg:{fontCache:"global"}};</script>
  <script src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-svg.js" defer></script>
  <style>
    :root { color-scheme: dark; --ink:#f6f7fb; --muted:#aeb6cb; --line:#2a3348; --accent:#e4b85c; }
    * { box-sizing:border-box; }
    body { margin:0; background:#080b12; color:var(--ink); font-family:Inter,"Noto Sans KR","Apple SD Gothic Neo",sans-serif; }
    main { width:min(1500px,calc(100% - 40px)); margin:0 auto; padding:56px 0 90px; }
    .hero { margin-bottom:30px; padding:28px 30px; border:1px solid var(--line); border-radius:22px; background:linear-gradient(135deg,#141a29,#0c1019); }
    .hero p { margin:0 0 8px; color:var(--accent); font-size:13px; font-weight:800; letter-spacing:.14em; }
    .hero h1 { margin:0 0 12px; font-size:32px; }
    .hero span { color:var(--muted); line-height:1.7; }
    .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:22px; }
    .problem-card { min-height:460px; padding:26px; border:1px solid var(--line); border-radius:20px; background:#101520; box-shadow:0 18px 40px rgba(0,0,0,.24); }
    header { display:grid; grid-template-columns:42px 1fr auto; gap:14px; align-items:start; padding-bottom:18px; border-bottom:1px solid var(--line); }
    .number { display:grid; place-items:center; width:38px; height:38px; border-radius:12px; background:var(--accent); color:#16110a; font-weight:900; }
    header p { margin:0 0 4px; color:var(--muted); font:700 11px/1.3 ui-monospace,monospace; }
    h2 { margin:0; font-size:19px; line-height:1.4; }
    header strong { min-width:42px; padding:8px 10px; border:1px solid #564725; border-radius:10px; color:var(--accent); text-align:center; }
    .prompt { padding:22px 0 18px; font-family:"Noto Serif KR","AppleMyungjo",serif; font-size:17px; line-height:1.95; white-space:normal; word-break:keep-all; }
    .visual { display:grid; place-items:center; margin:0 0 18px; }
    .visual svg { width:170px; height:170px; }
    .visual circle { fill:#101520; stroke:#dfe3ee; stroke-width:2; }
    .visual .table { fill:#171e2d; stroke:#67718a; }
    .normal-table table { width:min(420px,100%); border-collapse:collapse; color:#dfe3ee; text-align:center; }
    .normal-table th,.normal-table td { padding:8px 16px; border:1px solid #46516a; }
    .normal-table th { background:#171e2d; color:var(--accent); }
    .exp-log svg { width:min(420px,100%); height:auto; }
    .exp-log .axis,.exp-log .guide { fill:none; stroke:#66718a; stroke-width:1.5; }
    .exp-log .curve { fill:none; stroke:#dfe3ee; stroke-width:2.5; }
    .exp-log .curve.muted { stroke:#919bb0; }
    .exp-log .region { fill:rgba(228,184,92,.18); stroke:var(--accent); stroke-width:2; }
    .exp-log text { fill:#dfe3ee; font:700 12px sans-serif; }
    details { margin-top:auto; padding:14px 16px; border-radius:12px; background:#0b0f18; color:var(--muted); }
    summary { cursor:pointer; color:#d8ddea; font-weight:800; }
    details p { margin:10px 0 0; line-height:1.7; }
    footer { display:flex; justify-content:space-between; gap:12px; margin-top:18px; color:#7f899f; font-size:10px; }
    footer code { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    footer span { flex:none; color:#c7a965; }
    @media (max-width:900px) { .grid { grid-template-columns:1fr; } main { width:min(100% - 24px,760px); padding-top:24px; } }
    @media print { body { background:#fff; color:#111; } main { width:100%; padding:0; } .hero { color:#111; background:#fff; } .grid { display:block; } .problem-card { break-after:page; min-height:0; margin:0; color:#111; background:#fff; box-shadow:none; } details { background:#f5f5f5; } }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p>GOAT ARENA · STAGE 6-A · ISOLATED EXPANSION</p>
      <h1>PDF 원문 구조 기반 구현 32종</h1>
      <span>각 카드는 실제 생성 결과다. 정답은 1~999 자연수이며, 주 검산기와 독립 검산기가 일치한 문항만 표시한다. 평가센터와 운영 1대1에는 연결되어 있지 않다.</span>
    </section>
    <section class="grid">${cards}</section>
  </main>
</body>
</html>`;
  fs.writeFileSync(OUTPUT, html, "utf8");
  console.log(`wrote ${path.relative(ROOT, OUTPUT)} (${problems.length} cards)`);
}

main();
