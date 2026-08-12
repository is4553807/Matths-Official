"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  assessmentSurfaceIssues,
  DEFINITIONS,
  generateArenaPdfTranscriptionProblem,
} = require("../services/arenaPdfTranscriptionGenerators");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(
  ROOT,
  "dataAnalysis/arenaPdfSkeletonImplementation/all-problem-preview.html"
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

function previewSample(definition) {
  if (definition.sourceFixture) {
    const parameters = definition.sourceFixture.parameters;
    const answer = definition.solve(parameters);
    const crossCheck = definition.crossCheck(parameters);
    if (answer !== definition.sourceFixture.answer || crossCheck !== answer) {
      throw new Error(`source fixture mismatch: ${definition.sourceReferenceId}`);
    }
    return {
      parameters,
      sampleMode: "PDF 원문 수치 고정 검수",
      problem: {
        ...definition.render(parameters, answer),
        answer: String(answer),
      },
    };
  }
  const generated = generateArenaPdfTranscriptionProblem(
    definition.id,
    `all-problem-preview:${definition.sourceReferenceId}`
  );
  if (generated.validation?.passed !== true) {
    throw new Error(`preview validation failed: ${definition.sourceReferenceId}`);
  }
  return {
    parameters: generated.parameters,
    sampleMode: "고정 seed 생성 샘플",
    problem: generated.problem,
  };
}

function renderCard(definition, index) {
  const sample = previewSample(definition);
  const problem = sample.problem;
  const surfaceIssues = assessmentSurfaceIssues(problem);
  if (surfaceIssues.length > 0) {
    throw new Error(`surface quality failed: ${definition.sourceReferenceId} ${JSON.stringify(surfaceIssues.slice(0, 5))}`);
  }
  const hasVisualization = Boolean(problem.visualization);
  const encodedVisualization = hasVisualization
    ? encodeURIComponent(JSON.stringify(problem.visualization))
    : "";
  const searchText = [
    definition.sourceReferenceId,
    definition.title,
    definition.implementationBatch,
    definition.canonicalStructureId,
    definition.familyId,
    problem.prompt,
  ].join(" ").toLowerCase();
  const visualBlock = hasVisualization
    ? `<figure class="arena-match-visualization" data-arena-visualization="${escapeHtml(encodedVisualization)}">
        <svg viewBox="0 0 760 440" role="img" aria-label="${escapeHtml(definition.title)}의 그래프 또는 도형"></svg>
      </figure>`
    : `<div class="text-only-notice">텍스트·수식형 문항</div>`;
  return `<article class="problem-card" id="problem-${index + 1}"
      data-batch="${escapeHtml(definition.implementationBatch)}"
      data-visual="${String(hasVisualization)}"
      data-search="${escapeHtml(searchText)}">
    <header class="card-header">
      <span class="number">${index + 1}</span>
      <div class="heading">
        <p>${escapeHtml(definition.sourceReferenceId)}</p>
        <h2>${escapeHtml(definition.title)}</h2>
      </div>
      <strong class="answer">답 ${escapeHtml(problem.answer)}</strong>
    </header>
    <div class="badges">
      <span>${escapeHtml(definition.implementationBatch)}</span>
      <span>${escapeHtml(sample.sampleMode)}</span>
      <span>${hasVisualization ? "그래프·도형형" : "텍스트형"}</span>
      <span>신규 1대1 경기 연결</span>
    </div>
    <p class="prompt">${escapeHtml(problem.prompt)}</p>
    ${visualBlock}
    <details class="solution"><summary>정답 및 검산 해설</summary><p>${escapeHtml(problem.solution || "해설 없음")}</p></details>
    <details class="metadata"><summary>스켈레톤·생성 정보</summary>
      <dl>
        <div><dt>typeId</dt><dd>${escapeHtml(definition.id)}</dd></div>
        <div><dt>canonicalStructureId</dt><dd>${escapeHtml(definition.canonicalStructureId)}</dd></div>
        <div><dt>generatorContractId</dt><dd>${escapeHtml(definition.generatorContractId)}</dd></div>
        <div><dt>familyId</dt><dd>${escapeHtml(definition.familyId)}</dd></div>
        <div><dt>visualContract</dt><dd>${escapeHtml(definition.visualContract)}</dd></div>
      </dl>
      <pre>${escapeHtml(JSON.stringify(sample.parameters, null, 2))}</pre>
    </details>
  </article>`;
}

function main() {
  const resolvedRendererPath = path.resolve(path.dirname(OUTPUT), PREVIEW_RENDERER_SRC);
  if (!fs.existsSync(resolvedRendererPath)) {
    throw new Error(`preview renderer not found: ${resolvedRendererPath}`);
  }
  if (DEFINITIONS.length !== 200) {
    throw new Error(`expected 200 definitions, got ${DEFINITIONS.length}`);
  }
  const cards = DEFINITIONS.map(renderCard).join("\n");
  const batches = [...new Set(DEFINITIONS.map((definition) => definition.implementationBatch))];
  const batchOptions = batches
    .map((batch) => `<option value="${escapeHtml(batch)}">${escapeHtml(batch)}</option>`)
    .join("");
  const visualCount = DEFINITIONS.filter((definition) => definition.visualContract !== "NONE").length;
  const rawTeXTokens = JSON.stringify(["\\(", "\\[", "\\frac", "\\sum", "\\sqrt"]);
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>GOAT Arena PDF 스켈레톤 전체 200문항 미리보기</title>
  <style>
    :root { color-scheme:dark; --bg:#070a11; --panel:#101621; --panel2:#151d2a; --line:#2b3548; --ink:#f5f7fb; --muted:#9ca8bd; --gold:#e7bd63; --blue:#72a7ff; }
    * { box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family:Inter,"Noto Sans KR","Apple SD Gothic Neo",sans-serif; }
    .top { position:sticky; top:0; z-index:20; border-bottom:1px solid var(--line); background:rgba(7,10,17,.96); backdrop-filter:blur(14px); }
    .top-inner { width:min(1320px,calc(100% - 32px)); margin:auto; padding:18px 0 14px; }
    .title-row { display:flex; justify-content:space-between; gap:20px; align-items:flex-end; }
    .eyebrow { margin:0; color:var(--gold); font-size:11px; font-weight:900; letter-spacing:.13em; }
    h1 { margin:5px 0 4px; font-size:26px; }
    .subtitle { margin:0; color:var(--muted); font-size:13px; }
    #render-audit { min-width:260px; padding:11px 14px; border:1px solid #574723; border-radius:10px; color:var(--gold); font-size:12px; font-weight:850; text-align:center; }
    #render-audit.failed { color:#fca5a5; border-color:#7f1d1d; }
    .controls { display:grid; grid-template-columns:minmax(220px,1fr) 190px auto auto auto; gap:9px; margin-top:14px; }
    input,select,button,label.toggle { min-height:38px; border:1px solid var(--line); border-radius:9px; background:#0d121c; color:var(--ink); font:inherit; font-size:12px; }
    input,select { padding:0 12px; }
    button,label.toggle { display:flex; align-items:center; justify-content:center; gap:7px; padding:0 12px; cursor:pointer; font-weight:750; }
    label.toggle input { min-height:0; accent-color:var(--gold); }
    main { width:min(1320px,calc(100% - 32px)); margin:0 auto; padding:24px 0 100px; }
    .summary { display:flex; justify-content:space-between; gap:15px; margin-bottom:16px; color:var(--muted); font-size:12px; }
    .summary strong { color:var(--gold); }
    .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; }
    .problem-card { display:flex; flex-direction:column; min-width:0; padding:22px; border:1px solid var(--line); border-radius:16px; background:linear-gradient(145deg,var(--panel2),var(--panel)); box-shadow:0 14px 35px rgba(0,0,0,.2); }
    .problem-card[hidden] { display:none; }
    .card-header { display:grid; grid-template-columns:38px minmax(0,1fr) auto; gap:12px; align-items:start; padding-bottom:14px; border-bottom:1px solid var(--line); }
    .number { display:grid; place-items:center; width:36px; height:36px; border-radius:10px; background:var(--gold); color:#1b1408; font-weight:950; }
    .heading p { margin:0 0 4px; color:var(--muted); font:700 10px/1.35 ui-monospace,SFMono-Regular,monospace; }
    h2 { margin:0; font-size:17px; line-height:1.45; }
    .answer { padding:8px 10px; border:1px solid #5a4925; border-radius:8px; color:var(--gold); white-space:nowrap; font-size:12px; }
    .badges { display:flex; flex-wrap:wrap; gap:6px; margin-top:13px; }
    .badges span { padding:5px 8px; border-radius:999px; background:#0b1019; color:#aeb9cb; font-size:10px; font-weight:750; }
    .prompt { margin:0; padding:18px 0; color:#eef1f7; font-family:"Noto Serif KR","AppleMyungjo",serif; font-size:15px; line-height:1.9; word-break:keep-all; }
    .arena-match-visualization { overflow:hidden; margin:0 0 14px; border:1px solid #d6dde8; border-radius:11px; background:#fff; }
    .arena-match-visualization > svg { display:block; width:100%; height:auto; aspect-ratio:760/440; }
    .arena-svg-math-label mjx-container { margin:0 !important; color:inherit !important; }
    .arena-svg-math-label mjx-container > svg { width:auto !important; min-height:0 !important; max-height:none !important; border:0 !important; background:transparent !important; }
    .text-only-notice { margin-top:auto; padding:11px 12px; border:1px dashed #344056; border-radius:9px; color:#7f8ba0; font-size:11px; text-align:center; }
    details { margin-top:10px; padding:12px 14px; border-radius:9px; background:#0a0f18; color:var(--muted); }
    summary { color:#dce2ed; cursor:pointer; font-size:12px; font-weight:850; }
    details p { margin:10px 0 0; line-height:1.75; }
    dl { margin:10px 0 0; }
    dl div { display:grid; grid-template-columns:150px minmax(0,1fr); gap:10px; padding:5px 0; border-bottom:1px solid #1e2736; }
    dt { color:#78869b; font-size:10px; }
    dd { margin:0; overflow-wrap:anywhere; color:#bcc6d7; font:10px/1.5 ui-monospace,SFMono-Regular,monospace; }
    pre { overflow:auto; margin:10px 0 0; padding:10px; border-radius:7px; background:#05080e; color:#9ebbe5; font:10px/1.55 ui-monospace,SFMono-Regular,monospace; }
    .empty { display:none; padding:70px 20px; color:var(--muted); text-align:center; }
    .empty.visible { display:block; }
    @media(max-width:900px) { .title-row { align-items:flex-start; flex-direction:column; } #render-audit { width:100%; } .controls { grid-template-columns:1fr 1fr; } .controls input[type="search"] { grid-column:1/-1; } .grid { grid-template-columns:1fr; } }
    @media(max-width:560px) { .top-inner,main { width:min(100% - 20px,760px); } .controls { grid-template-columns:1fr; } .controls input[type="search"] { grid-column:auto; } .card-header { grid-template-columns:36px minmax(0,1fr); } .answer { grid-column:2; justify-self:start; } }
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
  <div class="top">
    <div class="top-inner">
      <div class="title-row">
        <div><p class="eyebrow">GOAT ARENA 1대1 · ACTIVE POOL REVIEW</p><h1>PDF 스켈레톤 전체 200문항</h1><p class="subtitle">신규 1대1 경기에 연결된 200개 생성 스켈레톤의 고정 검수 샘플</p></div>
        <div id="render-audit">전체 렌더 검사 대기</div>
      </div>
      <div class="controls">
        <input id="search" type="search" placeholder="연도·문항·제목·구조 ID 검색" />
        <select id="batch"><option value="">전체 구현 배치</option>${batchOptions}</select>
        <label class="toggle"><input id="visual-only" type="checkbox" /> 그래프·도형만</label>
        <button id="open-solutions" type="button">해설 모두 열기</button>
        <button id="close-details" type="button">세부정보 닫기</button>
      </div>
    </div>
  </div>
  <main>
    <div class="summary"><span>구현 문항 <strong>${DEFINITIONS.length}</strong>개 · 텍스트형 ${DEFINITIONS.length - visualCount}개 · 그래프·도형형 ${visualCount}개</span><span id="visible-count">${DEFINITIONS.length}개 표시</span></div>
    <section class="grid">${cards}</section>
    <div id="empty" class="empty">조건에 맞는 문항이 없습니다.</div>
  </main>
  <script>
    const cards = [...document.querySelectorAll(".problem-card")];
    const search = document.querySelector("#search");
    const batch = document.querySelector("#batch");
    const visualOnly = document.querySelector("#visual-only");
    const visibleCount = document.querySelector("#visible-count");
    const empty = document.querySelector("#empty");
    function applyFilters() {
      const query = search.value.trim().toLowerCase();
      let visible = 0;
      cards.forEach((card) => {
        const show = (!query || card.dataset.search.includes(query)) &&
          (!batch.value || card.dataset.batch === batch.value) &&
          (!visualOnly.checked || card.dataset.visual === "true");
        card.hidden = !show;
        if (show) visible += 1;
      });
      visibleCount.textContent = visible + "개 표시";
      empty.classList.toggle("visible", visible === 0);
    }
    [search, batch, visualOnly].forEach((control) => control.addEventListener("input", applyFilters));
    document.querySelector("#open-solutions").addEventListener("click", () => {
      cards.filter((card) => !card.hidden).forEach((card) => { card.querySelector(".solution").open = true; });
    });
    document.querySelector("#close-details").addEventListener("click", () => {
      cards.forEach((card) => card.querySelectorAll("details").forEach((detail) => { detail.open = false; }));
    });
    window.addEventListener("load", async () => {
      let mathError = false;
      try {
        await window.MathJax?.startup?.promise;
        await window.MathJax?.typesetPromise?.([document.querySelector("main")]);
      } catch (_error) { mathError = true; }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const visualContainers = [...document.querySelectorAll("[data-arena-visualization]")];
      const renderedVisuals = visualContainers.filter((node) => !node.classList.contains("is-invalid") && node.querySelector("svg > *"));
      const invalidVisuals = visualContainers.filter((node) => node.classList.contains("is-invalid") || !node.querySelector("svg > *"));
      const rawTeXBlocks = [...document.querySelectorAll(".prompt, .solution p")]
        .filter((node) => ${rawTeXTokens}.some((token) => (node.textContent || "").includes(token)));
      const audit = document.querySelector("#render-audit");
      const invalid = cards.length !== ${DEFINITIONS.length} || renderedVisuals.length !== visualContainers.length || invalidVisuals.length > 0 || rawTeXBlocks.length > 0 || mathError;
      audit.textContent = "문항 " + cards.length + "/${DEFINITIONS.length} · 시각 " + renderedVisuals.length + "/" + visualContainers.length + " · 오류 " + (invalid ? 1 : 0);
      audit.dataset.cards = String(cards.length);
      audit.dataset.visuals = String(visualContainers.length);
      audit.dataset.renderedVisuals = String(renderedVisuals.length);
      audit.dataset.invalidVisuals = String(invalidVisuals.length);
      audit.dataset.rawTexBlocks = String(rawTeXBlocks.length);
      audit.dataset.mathError = String(mathError);
      audit.dataset.invalid = String(invalid);
      if (invalid) audit.classList.add("failed");
      window.allProblemPreviewAuditReady = true;
    });
  </script>
</body>
</html>`;
  fs.writeFileSync(OUTPUT, html, "utf8");
  console.log(`wrote ${path.relative(ROOT, OUTPUT)} (${DEFINITIONS.length} cards, ${visualCount} visuals)`);
}

main();
