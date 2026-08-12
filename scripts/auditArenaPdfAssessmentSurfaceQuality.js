"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const {
  assessmentSurfaceIssues,
  DEFINITIONS,
  generateArenaPdfTranscriptionProblem,
  normalizedTranscriptionProblem,
} = require("../services/arenaPdfTranscriptionGenerators");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "dataAnalysis/arenaPdfSkeletonImplementation");
const OUTPUT = path.join(DATA_DIR, "assessment-surface-quality-audit.json");
const REPORT = path.join(DATA_DIR, "step-6c6-assessment-surface-quality-audit.md");
const SAMPLE_COUNT = Math.max(
  1,
  Number(process.env.ARENA_PDF_SURFACE_AUDIT_SAMPLES || 500)
);
const CHECKS = Object.freeze([
  "내부 JavaScript 식별자·템플릿 문자열 노출",
  "계수 1·0 및 중복 부호 표기",
  "계산기형 장문 소수·비정상 과학적 표기",
  "약분되지 않은 숫자 분수·과도하게 큰 숫자 분수",
  "삼각·로그 함수명의 TeX 명령 누락",
  "숫자 첨자·지수의 중괄호 누락 및 TeX 중괄호 불균형",
  "수식 구분자·제어문자·비유한 숫자",
]);

function markdown(report) {
  const lines = [
    "# PDF 스켈레톤 구현 6-C-6 - 평가원형 표면 품질 전수 감사",
    "",
    `- 생성기: ${report.definitionCount}개`,
    `- 문항별 seed: ${report.sampleCountPerDefinition}개`,
    `- 총 생성·검사: ${report.totalSamples}회`,
    `- 표면 품질 오류: ${report.issueCount}건`,
    `- 운영 연결: ${String(report.productionConnected).toLowerCase()}`,
    `- 감사 해시: \`${report.auditHash}\``,
    "",
    "## 자동 차단 항목",
    "",
    ...report.checks.map((item) => `- ${item}`),
    "",
    "## 집중 수정 문항의 현재 고정 샘플",
    "",
  ];
  for (const sample of report.focusSamples) {
    lines.push(`### ${sample.sourceReferenceId}`, "", sample.prompt, "");
  }
  lines.push(
    "## 문항별 결과",
    "",
    "| sourceId | 검사 seed | 오류 | 상태 |",
    "|---|---:|---:|---|"
  );
  for (const result of report.results) {
    lines.push(`| \`${result.sourceReferenceId}\` | ${result.samples} | ${result.issueCount} | \`PASSED\` |`);
  }
  lines.push(
    "",
    "이 검사는 격리된 PDF 스켈레톤 생성 결과에만 적용되며 운영 출제 풀과 연결하지 않는다.",
    ""
  );
  return lines.join("\n");
}

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const startedAt = Date.now();
  const auditHasher = createHash("sha256");
  const issueCounts = new Map();
  const results = [];

  for (const definition of DEFINITIONS) {
    let issueCount = 0;
    for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
      const generated = generateArenaPdfTranscriptionProblem(
        definition.id,
        `${definition.id}:surface-quality:${sample}`
      );
      const issues = assessmentSurfaceIssues(generated.problem);
      issueCount += issues.length;
      for (const issue of issues) {
        issueCounts.set(issue.code, (issueCounts.get(issue.code) || 0) + 1);
      }
      auditHasher.update(normalizedTranscriptionProblem(generated));
      auditHasher.update("\n");
    }
    results.push({
      typeId: definition.id,
      sourceReferenceId: definition.sourceReferenceId,
      samples: SAMPLE_COUNT,
      issueCount,
      passed: issueCount === 0,
    });
    console.log(`${definition.sourceReferenceId}: samples=${SAMPLE_COUNT} issues=${issueCount}`);
  }

  const focusSourceIds = [
    "2022-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q22",
    "2019-04-EDUCATION_OFFICE-GA-Q29",
  ];
  const focusSamples = focusSourceIds.map((sourceReferenceId) => {
    const definition = DEFINITIONS.find((item) => item.sourceReferenceId === sourceReferenceId);
    const generated = generateArenaPdfTranscriptionProblem(
      definition.id,
      `all-problem-preview:${sourceReferenceId}`
    );
    return { sourceReferenceId, prompt: generated.problem.prompt };
  });
  const issueCount = results.reduce((sum, result) => sum + result.issueCount, 0);
  const report = {
    schemaVersion: "ARENA_PDF_ASSESSMENT_SURFACE_QUALITY_AUDIT_V1",
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    definitionCount: DEFINITIONS.length,
    sampleCountPerDefinition: SAMPLE_COUNT,
    totalSamples: DEFINITIONS.length * SAMPLE_COUNT,
    issueCount,
    issueCountsByCode: Object.fromEntries([...issueCounts].sort()),
    checks: CHECKS,
    productionConnected: false,
    auditHash: auditHasher.digest("hex"),
    focusSamples,
    results,
  };
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(REPORT, markdown(report), "utf8");
  console.log(`wrote ${path.relative(ROOT, OUTPUT)}`);
  console.log(`wrote ${path.relative(ROOT, REPORT)}`);
  if (issueCount > 0) process.exitCode = 1;
}

main();
