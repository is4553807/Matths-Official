"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const {
  assessmentSurfaceIssues,
  DEFINITIONS,
  generateArenaPdfTranscriptionProblem,
  listArenaPdfTranscriptionDefinitions,
  normalizedTranscriptionProblem,
} = require("../services/arenaPdfTranscriptionGenerators");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "dataAnalysis/arenaPdfSkeletonImplementation");
const BATCH_ID = String(process.env.ARENA_PDF_GENERATOR_BATCH || "wave1-batch1");
const OUTPUT = path.join(DATA_DIR, `generator-verification-6c2-${BATCH_ID}.json`);
const REPORT = path.join(DATA_DIR, `step-6c2-${BATCH_ID}.md`);
const SAMPLE_COUNT = Math.max(
  1,
  Number(process.env.ARENA_PDF_TRANSCRIPTION_GENERATOR_SAMPLES || 200)
);
const PRODUCTION_BOUNDARY_FILES = [
  "services/arenaOneOnOneProblemBank.js",
  "services/arenaTierQuestionCatalogService.js",
  "services/arenaProblemPackService.js",
  "services/problemBankCatalogService.js",
];
const EXPECTED_BATCH_COUNTS = Object.freeze({
  "wave1-batch1": 25,
  "wave1-batch2": 25,
  "wave1-batch3": 43,
  "wave2-batch1": 25,
  "wave2-batch2": 25,
  "wave2-batch3": 25,
  "wave2-batch4": 17,
  "wave3-batch1": 15,
});
const EXPECTED_IMPLEMENTATION_WAVES = Object.freeze({
  "wave1-batch1": "6C-WAVE-1-DISCRETE-EXACT",
  "wave1-batch2": "6C-WAVE-1-DISCRETE-EXACT",
  "wave1-batch3": "6C-WAVE-1-DISCRETE-EXACT",
  "wave2-batch1": "6C-WAVE-2-SYMBOLIC-TEXT",
  "wave2-batch2": "6C-WAVE-2-SYMBOLIC-TEXT",
  "wave2-batch3": "6C-WAVE-2-SYMBOLIC-TEXT",
  "wave2-batch4": "6C-WAVE-2-SYMBOLIC-TEXT",
  "wave3-batch1": "6C-WAVE-3-VISUAL",
});

function visualizationPrimitiveCount(visualization) {
  return ["points", "segments", "circles", "polylines", "polygons", "rectangles", "texts"]
    .reduce((total, key) => total + (Array.isArray(visualization?.[key]) ? visualization[key].length : 0), 0);
}

function visualMathDetailIssues(visualization) {
  const issues = [];
  const graphPresentation = String(visualization?.visualContract || "").includes("GRAPH");
  for (const point of visualization?.points || []) {
    const label = String(point.label || "");
    const looksMathematical = /^[A-Za-z](?:_[A-Za-z0-9]+)?$/.test(label) || /^\([+\-0-9., ]+\)$/.test(label);
    if (looksMathematical && !String(point.mathTex || "").trim()) {
      issues.push(`point:${label}`);
    }
  }
  for (const item of visualization?.texts || []) {
    const label = String(item.text || "");
    const looksMathematical = label.includes("=") || /^[A-Za-z]$/.test(label) || /^L\d+$/.test(label) || label === "θ";
    if (looksMathematical && !String(item.mathTex || "").trim()) {
      issues.push(`text:${label}`);
    }
    const isGraphCurveLabel = /^y\s*=/.test(label) || /함수 가지$/.test(label);
    if (graphPresentation && isGraphCurveLabel && item.placement !== "legend") {
      issues.push(`graph-label-placement:${label}`);
    }
  }
  const mathSources = [
    ...(visualization?.points || []).map((point) => point.mathTex),
    ...(visualization?.texts || []).map((item) => item.mathTex),
  ].filter(Boolean).map(String);
  for (const mathSource of mathSources) {
    if (/\\\(|\\\)|\\\[|\\\]/.test(mathSource)) issues.push(`delimited:${mathSource}`);
    let depth = 0;
    for (const character of mathSource) {
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
      if (depth < 0) break;
    }
    if (depth !== 0) issues.push(`braces:${mathSource}`);
  }
  return issues;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function reportMarkdown(report) {
  const hasVisualizations = report.results.some((item) => item.visualizationVariantCount > 0);
  const lines = [
    `# PDF 스켈레톤 구현 6-C-2 - ${report.implementationBatch} 생성기 배치`,
    "",
    `- 구현 문항: ${report.definitionCount}개`,
    `- 문항별 검증 seed: ${report.sampleCountPerDefinition}개`,
    `- 총 생성·이중 검산: ${report.totalSamples}회`,
    `- 주 솔버/독립 검산 불일치: ${report.acceptance.oracleDisagreements}건`,
    `- 비결정적 재생성: ${report.acceptance.deterministicFailures}건`,
    `- 범위 밖 정답: ${report.acceptance.invalidAnswers}건`,
    `- 평가원형 표면 품질 오류: ${report.acceptance.surfaceQualityIssues}건`,
    `- 운영 연결: ${String(report.productionConnected).toLowerCase()}`,
    `- 검증 해시: \`${report.verificationHash}\``,
    "",
    "## 문항별 결과",
    "",
    hasVisualizations
      ? "| sourceId | 원문 정답 | seed | 매개변수 변형 | 정답 변형 | 시각자료 변형 | 상태 |"
      : "| sourceId | seed | 매개변수 변형 | 정답 변형 | 상태 |",
    hasVisualizations
      ? "|---|---:|---:|---:|---:|---:|---|"
      : "|---|---:|---:|---:|---|",
  ];
  for (const item of report.results) {
    lines.push(
      hasVisualizations
        ? `| \`${item.sourceReferenceId}\` | ${item.sourceFixtureAnswer} | ${item.samples} | ${item.parameterVariantCount} | ${item.answerVariantCount} | ${item.visualizationVariantCount} | \`PASSED\` |`
        : `| \`${item.sourceReferenceId}\` | ${item.samples} | ${item.parameterVariantCount} | ${item.answerVariantCount} | \`PASSED\` |`
    );
  }
  lines.push(
    "",
    "이 배치는 Arena 전용 어댑터를 통해 신규 1대1 경기에 연결된다. 평가센터와 기존 문제은행 경계 파일에는 직접 import가 없는지 함께 검사했다.",
    ""
  );
  return lines.join("\n");
}

function main() {
  const allDefinitions = listArenaPdfTranscriptionDefinitions();
  const definitions = allDefinitions.filter(
    (definition) => definition.implementationBatch === BATCH_ID
  );
  const blueprints = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "generator-blueprints-v1.json"), "utf8")
  );
  const blueprintBySource = new Map(
    blueprints.blueprints.map((item) => [item.sourceId, item])
  );
  const expectedBatchCount = EXPECTED_BATCH_COUNTS[BATCH_ID];
  const expectedImplementationWave = EXPECTED_IMPLEMENTATION_WAVES[BATCH_ID];
  const runtimeDefinitionById = new Map(DEFINITIONS.map((definition) => [definition.id, definition]));
  const implementationSignatureOwner = new Map();
  for (const definition of DEFINITIONS) {
    const signature = sha256(
      [definition.build, definition.solve, definition.crossCheck]
        .map((implementation) => implementation.toString())
        .join("\n---\n")
    );
    const existing = implementationSignatureOwner.get(signature);
    assert(
      !existing,
      `duplicate generator logic: ${existing} / ${definition.sourceReferenceId}`
    );
    implementationSignatureOwner.set(signature, definition.sourceReferenceId);
  }
  assert(Boolean(expectedBatchCount), `unknown implementation batch: ${BATCH_ID}`);
  assert(definitions.length === expectedBatchCount, `expected ${expectedBatchCount} definitions for ${BATCH_ID}, got ${definitions.length}`);
  assert(
    new Set(allDefinitions.map((item) => item.id)).size === allDefinitions.length,
    "duplicate definition id across implementation batches"
  );
  assert(
    new Set(allDefinitions.map((item) => item.sourceReferenceId)).size === allDefinitions.length,
    "duplicate source reference across implementation batches"
  );
  assert(new Set(definitions.map((item) => item.id)).size === expectedBatchCount, "duplicate definition id");
  assert(
    new Set(definitions.map((item) => item.sourceReferenceId)).size === expectedBatchCount,
    "duplicate source reference"
  );
  assert(
    new Set(definitions.map((item) => item.canonicalStructureId)).size === expectedBatchCount,
    "duplicate canonical structure"
  );
  for (const definition of definitions) {
    const blueprint = blueprintBySource.get(definition.sourceReferenceId);
    assert(Boolean(blueprint), `missing blueprint: ${definition.sourceReferenceId}`);
    assert(
      blueprint.implementationWave === expectedImplementationWave,
      `wrong implementation wave: ${definition.sourceReferenceId}`
    );
    assert(
      blueprint.canonicalStructureId === definition.canonicalStructureId,
      `canonical mismatch: ${definition.sourceReferenceId}`
    );
    assert(
      blueprint.generatorContractId === definition.generatorContractId,
      `generator contract mismatch: ${definition.sourceReferenceId}`
    );
    if (expectedImplementationWave === "6C-WAVE-3-VISUAL") {
      assert(definition.visualContract !== "NONE", `visual contract missing: ${definition.sourceReferenceId}`);
      const runtimeDefinition = runtimeDefinitionById.get(definition.id);
      const fixture = runtimeDefinition?.sourceFixture;
      assert(Boolean(fixture), `source fixture missing: ${definition.sourceReferenceId}`);
      const fixturePrimary = runtimeDefinition.solve(fixture.parameters);
      const fixtureCrossCheck = runtimeDefinition.crossCheck(fixture.parameters);
      assert(fixturePrimary === fixture.answer, `source answer mismatch: ${definition.sourceReferenceId}`);
      assert(fixtureCrossCheck === fixture.answer, `source cross-check mismatch: ${definition.sourceReferenceId}`);
      const fixtureRendered = runtimeDefinition.render(fixture.parameters, fixture.answer);
      assert(Boolean(fixtureRendered.visualization), `source fixture visualization missing: ${definition.sourceReferenceId}`);
      assert(fixtureRendered.visualization.visualContract === definition.visualContract, `source fixture visual contract mismatch: ${definition.sourceReferenceId}`);
    } else {
      assert(definition.visualContract === "NONE", `visual source entered text batch: ${definition.sourceReferenceId}`);
    }
    assert(definition.productionConnected === true, `production-disconnected definition: ${definition.sourceReferenceId}`);
  }
  for (const relativePath of PRODUCTION_BOUNDARY_FILES) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
    assert(
      !source.includes("arenaPdfTranscriptionGenerators"),
      `${relativePath} imports isolated transcription generators`
    );
  }

  const startedAt = Date.now();
  const results = [];
  for (const definition of definitions) {
    const parameterVariants = new Set();
    const answers = new Set();
    const visualizationVariants = new Set();
    const sampleHashes = [];
    for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
      const seed = `${definition.id}:6c2-${BATCH_ID}:${sample}`;
      const generated = generateArenaPdfTranscriptionProblem(definition.id, seed);
      const repeated = generateArenaPdfTranscriptionProblem(definition.id, seed);
      const normalized = normalizedTranscriptionProblem(generated);
      assert(
        normalized === normalizedTranscriptionProblem(repeated),
        `${definition.id} is not deterministic at seed ${sample}`
      );
      assert(generated.validation?.passed === true, `${definition.id} validation failed`);
      assert(
        generated.validation?.independentCrossCheck === true,
        `${definition.id} independent cross-check missing`
      );
      assert(
        generated.validation?.productionConnected === true,
        `${definition.id} generated disconnected state`
      );
      assert(
        generated.canonicalStructureId === definition.canonicalStructureId,
        `${definition.id} generated wrong canonical id`
      );
      const answer = Number(generated.problem?.answer);
      assert(
        Number.isInteger(answer) && answer >= 1 && answer <= 999,
        `${definition.id} invalid answer ${generated.problem?.answer}`
      );
      const prompt = String(generated.problem?.prompt || "");
      const solution = String(generated.problem?.solution || "");
      assert(prompt.length >= 20, `${definition.id} prompt too short`);
      assert(solution.length >= 10, `${definition.id} solution too short`);
      const surfaceIssues = assessmentSurfaceIssues(generated.problem);
      assert(surfaceIssues.length === 0, `${definition.id} surface quality failed: ${JSON.stringify(surfaceIssues.slice(0, 5))}`);
      const visualization = generated.problem?.visualization;
      if (expectedImplementationWave === "6C-WAVE-3-VISUAL") {
        assert(Boolean(visualization), `${definition.id} missing visualization`);
        assert(visualization.kind === "geometry", `${definition.id} wrong visualization kind`);
        assert(visualization.visualContract === definition.visualContract, `${definition.id} wrong visual contract`);
        assert(visualization.presentedInProblem === true, `${definition.id} visualization is not in problem stem`);
        assert(visualization.sourceRole === "PROBLEM_STEM", `${definition.id} wrong visualization source role`);
        assert(visualization.renderContractVersion === "ARENA_PDF_VISUAL_V1", `${definition.id} wrong render contract`);
        assert(visualizationPrimitiveCount(visualization) > 0, `${definition.id} empty visualization`);
        assert(!JSON.stringify(visualization).includes("null"), `${definition.id} contains a non-finite visual coordinate`);
        assert(/그림|그래프/.test(prompt), `${definition.id} prompt does not introduce its visualization`);
        const mathDetailIssues = visualMathDetailIssues(visualization);
        assert(mathDetailIssues.length === 0, `${definition.id} raw SVG math labels: ${mathDetailIssues.join(", ")}`);
        visualizationVariants.add(JSON.stringify(visualization));
      } else {
        assert(!visualization, `${definition.id} unexpected visualization`);
      }
      parameterVariants.add(JSON.stringify(generated.parameters));
      answers.add(answer);
      sampleHashes.push(sha256(normalized));
    }
    assert(parameterVariants.size >= 3, `${definition.id} has too few parameter variants`);
    assert(answers.size >= 2, `${definition.id} has too few answer variants`);
    results.push({
      typeId: definition.id,
      sourceReferenceId: definition.sourceReferenceId,
      canonicalStructureId: definition.canonicalStructureId,
      generatorContractId: definition.generatorContractId,
      samples: SAMPLE_COUNT,
      parameterVariantCount: parameterVariants.size,
      answerVariantCount: answers.size,
      visualizationVariantCount: visualizationVariants.size,
      sourceFixtureAnswer: runtimeDefinitionById.get(definition.id)?.sourceFixture?.answer ?? null,
      normalizedSampleSetHash: sha256(sampleHashes.join("\n")),
      oracleDisagreements: 0,
      deterministicFailures: 0,
      invalidAnswers: 0,
      surfaceQualityIssues: 0,
      productionConnected: true,
    });
    console.log(
      `${definition.sourceReferenceId}: samples=${SAMPLE_COUNT} parameters=${parameterVariants.size} answers=${answers.size}`
    );
  }

  const verificationHash = sha256(
    JSON.stringify(results.map(({ normalizedSampleSetHash, ...item }) => ({ ...item, normalizedSampleSetHash })))
  );
  const report = {
    schemaVersion: `ARENA_PDF_GENERATOR_VERIFICATION_6C2_${BATCH_ID.toUpperCase().replace(/-/g, "_")}_V1`,
    implementationBatch: BATCH_ID,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    sourceBlueprintHash: blueprints.contentHash,
    sampleCountPerDefinition: SAMPLE_COUNT,
    definitionCount: definitions.length,
    totalSamples: definitions.length * SAMPLE_COUNT,
    productionConnected: true,
    productionBoundaryChecked: PRODUCTION_BOUNDARY_FILES,
    acceptance: {
      oracleDisagreements: 0,
      deterministicFailures: 0,
      invalidAnswers: 0,
      surfaceQualityIssues: 0,
      passed: true,
    },
    verificationHash,
    results,
  };
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(REPORT, reportMarkdown(report), "utf8");
  console.log(`wrote ${path.relative(ROOT, OUTPUT)}`);
  console.log(`wrote ${path.relative(ROOT, REPORT)}`);
}

main();
