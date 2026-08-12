"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  DEFINITIONS,
} = require("../services/arenaPdfTranscriptionGenerators");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(
  ROOT,
  "dataAnalysis/arenaPdfSkeletonImplementation/visual-preview-wave3.html"
);
const PREVIEW_RENDERER_SRC = "../../public/js/arena-problem-visualization.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderCard(definition, index) {
  const fixture = definition.sourceFixture;
  if (!fixture) throw new Error(`missing source fixture: ${definition.sourceReferenceId}`);
  const answer = definition.solve(fixture.parameters);
  const crossCheck = definition.crossCheck(fixture.parameters);
  if (answer !== fixture.answer || crossCheck !== fixture.answer) {
    throw new Error(`source fixture mismatch: ${definition.sourceReferenceId}`);
  }
  const rendered = definition.render(fixture.parameters, answer);
  const problem = { ...rendered, answer: String(answer) };
  const encodedVisualization = encodeURIComponent(JSON.stringify(problem.visualization));
  return `<article class="problem-card" id="visual-${index + 1}" data-source-id="${escapeHtml(definition.sourceReferenceId)}">
    <header>
      <span class="number">${index + 1}</span>
      <div><p>${escapeHtml(definition.sourceReferenceId)}</p><h2>${escapeHtml(definition.title)}</h2></div>
      <strong>답 ${escapeHtml(problem.answer)}</strong>
    </header>
    <p class="prompt">${escapeHtml(problem.prompt)}</p>
    <div class="arena-match-visualization" data-arena-visualization="${escapeHtml(encodedVisualization)}">
      <svg role="img" aria-label="${escapeHtml(definition.title)}"></svg>
    </div>
    <details><summary>검산 해설</summary><p>${escapeHtml(problem.solution)}</p></details>
    <footer><code>${escapeHtml(definition.visualContract)}</code><span>GOAT Arena 1대1 · 신규 경기 연결</span></footer>
  </article>`;
}

function main() {
  const resolvedRendererPath = path.resolve(path.dirname(OUTPUT), PREVIEW_RENDERER_SRC);
  if (!fs.existsSync(resolvedRendererPath)) {
    throw new Error(`preview renderer not found: ${resolvedRendererPath}`);
  }
  const definitions = DEFINITIONS
    .filter((definition) => definition.implementationBatch === "wave3-batch1");
  if (definitions.length !== 15) throw new Error(`expected 15 Wave 3 definitions, got ${definitions.length}`);
  const cards = definitions.map(renderCard).join("\n");
  const rawTeXTokens = JSON.stringify(["\\(", "\\[", "\\frac", "\\sum", "\\sqrt"]);
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>GOAT Arena 1대1 PDF 시각형 15종 렌더 검수</title>
  <style>
    :root { color-scheme:dark; --bg:#080b12; --card:#111722; --line:#2b3447; --ink:#f6f7fb; --muted:#aab3c7; --accent:#e6bd65; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family:Inter,"Noto Sans KR","Apple SD Gothic Neo",sans-serif; }
    main { width:min(1500px,calc(100% - 40px)); margin:0 auto; padding:44px 0 90px; }
    .hero { display:grid; grid-template-columns:1fr auto; gap:24px; align-items:end; margin-bottom:26px; padding:28px 30px; border:1px solid var(--line); border-radius:20px; background:linear-gradient(135deg,#171e2d,#0d121c); }
    .hero small { color:var(--accent); font-weight:850; letter-spacing:.13em; }
    .hero h1 { margin:7px 0 9px; font-size:30px; }
    .hero p { margin:0; color:var(--muted); line-height:1.7; }
    #render-audit { min-width:190px; padding:13px 16px; border:1px solid #4c3f22; border-radius:12px; color:var(--accent); font-weight:800; text-align:center; }
    #render-audit.failed { border-color:#7f1d1d; color:#fca5a5; }
    .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:22px; }
    .problem-card { display:flex; flex-direction:column; min-height:680px; padding:24px; border:1px solid var(--line); border-radius:18px; background:var(--card); box-shadow:0 18px 38px rgba(0,0,0,.24); }
    header { display:grid; grid-template-columns:38px 1fr auto; gap:13px; align-items:start; padding-bottom:16px; border-bottom:1px solid var(--line); }
    .number { display:grid; place-items:center; width:36px; height:36px; border-radius:10px; background:var(--accent); color:#171109; font-weight:900; }
    header p { margin:0 0 4px; color:var(--muted); font:700 11px/1.3 ui-monospace,monospace; }
    h2 { margin:0; font-size:18px; line-height:1.45; }
    header strong { padding:8px 10px; border:1px solid #594a27; border-radius:9px; color:var(--accent); font-size:13px; }
    .prompt { margin:0; padding:18px 0; color:#e9ecf4; font-family:"Noto Serif KR","AppleMyungjo",serif; font-size:15px; line-height:1.82; word-break:keep-all; }
    .arena-match-visualization { overflow:hidden; margin:0 0 17px; border:1px solid #d7dde7; border-radius:12px; background:#fff; }
    .arena-match-visualization > svg { display:block; width:100%; height:auto; aspect-ratio:760/440; }
    .arena-svg-math-label mjx-container { margin:0 !important; color:inherit !important; }
    .arena-svg-math-label mjx-container > svg { width:auto; min-height:0; max-height:none; border:0; background:transparent; }
    .arena-match-visualization.is-invalid { min-height:300px; border:3px solid #dc2626; background:#fee2e2; }
    details { margin-top:auto; padding:13px 15px; border-radius:10px; background:#0b0f18; color:var(--muted); }
    details p { margin:9px 0 0; line-height:1.65; }
    summary { color:#dce1ec; cursor:pointer; font-weight:800; }
    footer { display:flex; justify-content:space-between; gap:10px; padding-top:16px; color:#7f899e; font-size:10px; }
    footer span { color:#c6aa6d; }
    @media(max-width:900px) { main { width:min(100% - 22px,760px); padding-top:20px; } .hero { grid-template-columns:1fr; } .grid { grid-template-columns:1fr; } }
  </style>
  <script>
    window.MathJax = {
      tex: { inlineMath: [["$", "$"], ["\\\\(", "\\\\)"]], displayMath: [["\\\\[", "\\\\]"]], processEscapes: true },
      options: { skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"] },
    };
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-svg.js" defer></script>
  <script src="${PREVIEW_RENDERER_SRC}" defer></script>
</head>
<body>
  <main>
    <section class="hero">
      <div><small>GOAT ARENA 1대1 · ISOLATED VISUAL QA</small><h1>PDF 시각형 스켈레톤 15종</h1><p>PDF 원문의 수치·정답과 그림·그래프 의존 구조를 데이터 기반 SVG로 실제 렌더링한다. 운영 출제 풀에는 연결하지 않았다.</p></div>
      <div id="render-audit">렌더 검사 대기</div>
    </section>
    <section class="grid">${cards}</section>
  </main>
  <script>
    window.addEventListener("load", async () => {
      let mathError = false;
      try {
        await window.MathJax?.startup?.promise;
        await window.MathJax?.typesetPromise?.([document.querySelector("main")]);
      } catch (_error) {
        mathError = true;
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const containers = [...document.querySelectorAll("[data-arena-visualization]")];
      const rendered = containers.filter((node) => !node.classList.contains("is-invalid") && node.querySelector("svg > *"));
      const invalid = containers.filter((node) => node.classList.contains("is-invalid") || !node.querySelector("svg > *"));
      const mathLabels = [...document.querySelectorAll(".arena-svg-math-label")];
      const typesetMathLabels = mathLabels.filter((node) => node.querySelector("mjx-container"));
      const rawTeXBlocks = [...document.querySelectorAll(".prompt, details p")]
        .filter((node) => ${rawTeXTokens}.some((token) => (node.textContent || "").includes(token)));
      const legendLabels = [...document.querySelectorAll('[data-label-placement="legend"]')];
      const invalidLegendLabels = legendLabels.filter((label) => {
        const band = label.closest("svg")?.querySelector("[data-graph-label-band]");
        const content = label.querySelector("mjx-container") || label;
        if (!band || !content) return true;
        const bandRect = band.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        return contentRect.left < bandRect.left - 1 || contentRect.right > bandRect.right + 1 ||
          contentRect.top < bandRect.top - 1 || contentRect.bottom > bandRect.bottom + 1;
      });
      const pointLabels = [...document.querySelectorAll('[data-label-placement="point"]')];
      const collidingPointLabels = pointLabels.filter((label) => {
        const svg = label.closest("svg");
        const content = label.querySelector("mjx-container") || label;
        const originX = Number(label.dataset.labelOriginX);
        const originY = Number(label.dataset.labelOriginY);
        if (!svg || !content || !Number.isFinite(originX) || !Number.isFinite(originY)) return true;
        const svgRect = svg.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        const pointX = svgRect.left + (originX / 760) * svgRect.width;
        const pointY = svgRect.top + (originY / 440) * svgRect.height;
        const dx = Math.max(contentRect.left - pointX, 0, pointX - contentRect.right);
        const dy = Math.max(contentRect.top - pointY, 0, pointY - contentRect.bottom);
        return Math.hypot(dx, dy) < 3;
      });
      const audit = document.querySelector("#render-audit");
      const layoutInvalid = invalidLegendLabels.length > 0 || collidingPointLabels.length > 0;
      const mathInvalid = mathError || rawTeXBlocks.length > 0 || typesetMathLabels.length !== mathLabels.length || layoutInvalid;
      const validLabelCount = legendLabels.length + pointLabels.length - invalidLegendLabels.length - collidingPointLabels.length;
      audit.textContent = "렌더 " + rendered.length + "/" + containers.length + " · 수식 " + typesetMathLabels.length + "/" + mathLabels.length + " · 라벨 " + validLabelCount + "/" + (legendLabels.length + pointLabels.length) + " · 오류 " + (invalid.length + (mathInvalid ? 1 : 0));
      audit.dataset.total = String(containers.length);
      audit.dataset.rendered = String(rendered.length);
      audit.dataset.invalid = String(invalid.length);
      audit.dataset.mathLabels = String(mathLabels.length);
      audit.dataset.typesetMathLabels = String(typesetMathLabels.length);
      audit.dataset.rawTexBlocks = String(rawTeXBlocks.length);
      audit.dataset.legendLabels = String(legendLabels.length);
      audit.dataset.invalidLegendLabels = String(invalidLegendLabels.length);
      audit.dataset.pointLabels = String(pointLabels.length);
      audit.dataset.collidingPointLabels = String(collidingPointLabels.length);
      audit.dataset.layoutInvalid = String(layoutInvalid);
      audit.dataset.mathInvalid = String(mathInvalid);
      if (invalid.length || mathInvalid) audit.classList.add("failed");
    });
  </script>
</body>
</html>`;
  fs.writeFileSync(OUTPUT, html, "utf8");
  console.log(`wrote ${path.relative(ROOT, OUTPUT)} (${definitions.length} visual cards)`);
}

main();
