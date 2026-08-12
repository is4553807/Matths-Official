#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(
  root,
  "dataAnalysis/arenaOfficialMockTypeCatalog2016_2026.json"
);
const geometrySupplementPath = path.join(
  root,
  "tmp/pdfs/arena_short_answer_audit/geometry_records.json"
);
const outputPath = path.join(
  root,
  "dataAnalysis/arenaPdfSkeletonImplementation/source-ledger-v1.json"
);
const reportPath = path.join(
  root,
  "dataAnalysis/arenaPdfSkeletonImplementation/step-1-source-freeze.md"
);

const PDF_SOURCE = Object.freeze({
  fileName: "Matths_2016-2026_단답형_문항_정답률_티어_감사보고서 copy.pdf",
  sha256: "ec4109c3fc5c3dfbdf347564d064570b259833894aa22a0d9b66c7f1831a7893",
  pageCount: 994,
  auditedQuestionCount: 982,
});

const DIFFICULTY_ORDER = Object.freeze({
  KILLER: 0,
  SEMI_KILLER: 1,
  UPPER_GENERAL: 2,
  GENERAL: 3,
  BASIC_GENERAL: 4,
});

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function countBy(records, key) {
  return Object.fromEntries(
    [...records.reduce((counts, record) => {
      const value = String(record[key] ?? "").trim() || "UNSPECIFIED";
      counts.set(value, Number(counts.get(value) || 0) + 1);
      return counts;
    }, new Map())].sort(([left], [right]) =>
      left.localeCompare(right, "en")
    )
  );
}

function isShortAnswerRecord(record) {
  const year = Number(record.year);
  const questionNumber = Number(record.questionNumber);
  return (
    (year <= 2020 && questionNumber >= 22 && questionNumber <= 30) ||
    (year >= 2021 && (
      (questionNumber >= 16 && questionNumber <= 22) ||
      questionNumber === 29 ||
      questionNumber === 30
    ))
  );
}

function supplemented2016AprilRecords(catalogRecords) {
  const base = catalogRecords.find(
    (record) =>
      Number(record.year) === 2016 &&
      Number(record.sessionMonth) === 4 &&
      record.form === "NA" &&
      Number(record.questionNumber) === 23
  );
  if (!base) throw new Error("2016-04 수학 나형 보충 기준 문항을 찾지 못했습니다.");
  const sourceUrl =
    "https://www.ebsi.co.kr/ebs/xip/xipa/retrievePastGrdCutWrongAnswerRate.ebs?tab=2";
  const additions = [
    {
      questionNumber: 22,
      difficultyClass: "UNRESOLVED",
      difficultyTier: "",
      sourcePositionBand: "ACCURACY_UNRESOLVED",
      runtimeDifficultyEligible: false,
      evidence: {
        metricKind: "EBSI_TOP15_CENSORED_LOWER_BOUND",
        runtimeEligible: false,
        correctRatePercent: null,
        correctRateLowerBoundPercent: 67.5,
        correctRateUpperBoundPercent: 100,
        wrongRatePercent: null,
        wrongRateUpperBoundPercent: 32.5,
        points: 3,
        paperId: "5325838",
        itemId: null,
        sourceUrl,
        classificationConfidence: "UNRESOLVED",
      },
    },
    {
      questionNumber: 28,
      difficultyClass: "KILLER",
      difficultyTier: "T9",
      sourcePositionBand: "ACCURACY_KILLER",
      runtimeDifficultyEligible: true,
      evidence: {
        metricKind: "EBSI_OBSERVED_TOP15",
        runtimeEligible: true,
        correctRatePercent: 12.8,
        correctRateLowerBoundPercent: 12.8,
        correctRateUpperBoundPercent: 12.8,
        wrongRatePercent: 87.2,
        wrongRateUpperBoundPercent: 87.2,
        points: 4,
        paperId: "5325838",
        itemId: 10314879,
        sourceUrl,
        classificationConfidence: "EXACT",
      },
    },
  ];
  return additions.map((addition) => ({
    ...base,
    sourceId: `2016-04-EDUCATION_OFFICE-NA-Q${addition.questionNumber}`,
    questionNumber: addition.questionNumber,
    status: "ACTIVE_REFERENCE",
    exclusionReason: "",
    courseId: "probability-statistics",
    courseLabel: "확률과 통계",
    familyId: "PS-COUNTING",
    familyLabel: "순열·조합과 경우의 수",
    difficultyClass: addition.difficultyClass,
    difficultyTier: addition.difficultyTier,
    sourcePositionBand: addition.sourcePositionBand,
    runtimeDifficultyEligible: addition.runtimeDifficultyEligible,
    accuracyEvidence: addition.evidence,
  }));
}

function implementationWave(difficultyClass) {
  if (["KILLER", "SEMI_KILLER"].includes(difficultyClass)) {
    return "WAVE_1_HIGH_DIFFICULTY";
  }
  if (difficultyClass === "UPPER_GENERAL") {
    return "WAVE_2_UPPER_GENERAL";
  }
  return "WAVE_3_GENERAL_FOUNDATION";
}

function ledgerRecord(record, ledgerIndex) {
  const evidence = record.accuracyEvidence || {};
  return {
    ledgerIndex,
    implementationSourceId: `PDF-SOURCE-${record.sourceId}`,
    sourceId: record.sourceId,
    source: {
      authority: record.sourceAuthority,
      kind: record.sourceKind,
      archiveProvider: record.archiveProvider,
      year: Number(record.year),
      sessionMonth: Number(record.sessionMonth),
      administeredMonth: Number(record.administeredMonth),
      form: record.form,
      questionNumber: Number(record.questionNumber),
      problemUrl: record.problemUrl,
      solutionUrl: record.solutionUrl,
    },
    curriculum: {
      courseId: record.courseId,
      courseLabel: record.courseLabel,
      familyId: record.familyId,
      familyLabel: record.familyLabel,
    },
    difficulty: {
      difficultyClass: record.difficultyClass,
      difficultyTier: record.difficultyTier,
      sourcePositionBand: record.sourcePositionBand,
      policyVersion: record.difficultyPolicyVersion,
      basis: record.difficultyBasis,
      correctRatePercent: evidence.correctRatePercent ?? null,
      correctRateLowerBoundPercent:
        evidence.correctRateLowerBoundPercent ?? null,
      correctRateUpperBoundPercent:
        evidence.correctRateUpperBoundPercent ?? null,
      evidenceKind: evidence.metricKind || "",
      classificationConfidence: evidence.classificationConfidence || "",
    },
    observedStructureSignals: {
      solutionCharacterBand: record.structureMetrics?.solutionCharacterBand || "",
      solutionMayUseGraph: record.structureMetrics?.solutionMayUseGraph === true,
      hasCaseSignal: record.structureMetrics?.hasCaseSignal === true,
      hasInverseConditionSignal:
        record.structureMetrics?.hasInverseConditionSignal === true,
    },
    implementation: {
      wave: implementationWave(record.difficultyClass),
      status: "PENDING_STEP_2_DECOMPOSITION",
      canonicalStructureId: null,
      solverGroupId: null,
      parameterSchemaId: null,
      visualizationRequirement: "PENDING_REVIEW",
      manualScreenshotReviewRequired: true,
    },
  };
}

function markdownReport({ allRecords, selectedRecords, ledger }) {
  const byClass = countBy(selectedRecords, "difficultyClass");
  const byCourse = countBy(selectedRecords, "courseId");
  const byFamily = Object.entries(countBy(selectedRecords, "familyId"))
    .sort(([, left], [, right]) => right - left);
  const nonSelected = allRecords.filter(
    (record) =>
      record.status !== "ACTIVE_REFERENCE" ||
      record.difficultyClass === "UNRESOLVED" ||
      record.runtimeDifficultyEligible !== true
  );
  const activeUnresolved = nonSelected.filter(
    (record) =>
      record.status === "ACTIVE_REFERENCE" &&
      record.difficultyClass === "UNRESOLVED"
  ).length;
  const lines = [
    "# PDF 스켈레톤 구현 1단계 - 출처 원장 동결",
    "",
    `- 원본 PDF SHA-256: \`${PDF_SOURCE.sha256}\``,
    `- PDF 페이지: ${PDF_SOURCE.pageCount.toLocaleString("en-US")}쪽`,
    `- 감사 단답형 문항: ${allRecords.length.toLocaleString("en-US")}개`,
    `- 구현 대상 동결: ${selectedRecords.length.toLocaleString("en-US")}개`,
    `- 원장 콘텐츠 해시: \`${ledger.contentHash}\``,
    "",
    "## 구현 대상 선정 규칙",
    "",
    "다음 조건을 모두 만족한 문항만 2단계 구조 분해 대상으로 동결한다.",
    "",
    "1. `status === ACTIVE_REFERENCE`",
    "2. `difficultyClass !== UNRESOLVED`",
    "3. `runtimeDifficultyEligible === true`",
    "4. 2016-2020은 22-30번, 2021-2026은 16-22번과 29-30번 단답형 범위",
    "",
    "## 난이도별 구현 대상",
    "",
    "| 난이도 | 문항 수 | 구현 파동 |",
    "|---|---:|---|",
    `| 킬러 | ${byClass.KILLER || 0} | 1차 |`,
    `| 준킬러 | ${byClass.SEMI_KILLER || 0} | 1차 |`,
    `| 상위 일반 | ${byClass.UPPER_GENERAL || 0} | 2차 |`,
    `| 일반 | ${byClass.GENERAL || 0} | 3차 |`,
    `| 기초 일반 | ${byClass.BASIC_GENERAL || 0} | 3차 |`,
    "",
    "## 과목별 구현 대상",
    "",
    "| 과목 | 문항 수 |",
    "|---|---:|",
    `| 대수 | ${byCourse.algebra || 0} |`,
    `| 미적분 I | ${byCourse["calculus-1"] || 0} |`,
    `| 확률과 통계 | ${byCourse["probability-statistics"] || 0} |`,
    `| 공통수학 2 | ${byCourse["common-math-2"] || 0} |`,
    `| 공통수학 1 | ${byCourse["common-math-1"] || 0} |`,
    "",
    "## 이번 단계에서 보류한 문항",
    "",
    `- 활성 상태이나 정답률 구간 미확정: ${activeUnresolved}개`,
    `- 교과과정 또는 운영 범위 제외: ${allRecords.filter((record) => record.status === "EXCLUDED").length}개`,
    `- 추가 교과과정 검토 필요: ${allRecords.filter((record) => record.status === "REVIEW_REQUIRED").length}개`,
    "",
    "## 상위 구조 계열",
    "",
    "| 계열 ID | 문항 수 |",
    "|---|---:|",
    ...byFamily.map(([familyId, count]) => `| ${familyId} | ${count} |`),
    "",
    "## 2단계 입력 계약",
    "",
    "원장의 모든 문항은 아직 `canonicalStructureId`가 비어 있다. 2단계에서 PDF 문제 화면과 공식 풀이를 함께 검토해 목표값, 조건, 풀이 변환, 경우 분기, 매개변수, 퇴화 조건, 시각자료 요구를 기록한다.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const [catalogText, supplementText] = await Promise.all([
    readFile(catalogPath, "utf8"),
    readFile(geometrySupplementPath, "utf8"),
  ]);
  const catalog = JSON.parse(catalogText);
  const supplement = JSON.parse(supplementText);
  const records = catalog.records
    .filter(isShortAnswerRecord)
    .map((record) => ({ ...record }));
  const existingIds = new Set(records.map((record) => record.sourceId));
  for (const record of supplemented2016AprilRecords(catalog.records)) {
    if (!existingIds.has(record.sourceId)) {
      records.push(record);
      existingIds.add(record.sourceId);
    }
  }
  for (const record of supplement.records || []) {
    if (!existingIds.has(record.sourceId)) {
      records.push({ ...record });
      existingIds.add(record.sourceId);
    }
  }
  if (records.length !== PDF_SOURCE.auditedQuestionCount) {
    throw new Error(
      `PDF 감사 문항 수가 ${PDF_SOURCE.auditedQuestionCount}개가 아닙니다: ${records.length}`
    );
  }
  if (existingIds.size !== records.length) {
    throw new Error("PDF 감사 문항 sourceId가 중복되었습니다.");
  }
  const selected = records
    .filter(
      (record) =>
        record.status === "ACTIVE_REFERENCE" &&
        record.difficultyClass !== "UNRESOLVED" &&
        record.runtimeDifficultyEligible === true
    )
    .sort(
      (left, right) =>
        DIFFICULTY_ORDER[left.difficultyClass] -
          DIFFICULTY_ORDER[right.difficultyClass] ||
        left.courseId.localeCompare(right.courseId, "en") ||
        left.familyId.localeCompare(right.familyId, "en") ||
        Number(left.year) - Number(right.year) ||
        Number(left.sessionMonth) - Number(right.sessionMonth) ||
        left.form.localeCompare(right.form, "en") ||
        Number(left.questionNumber) - Number(right.questionNumber)
    );
  if (selected.length !== 629) {
    throw new Error(`구현 대상 문항 수가 629개가 아닙니다: ${selected.length}`);
  }
  const ledgerRecords = selected.map((record, index) =>
    ledgerRecord(record, index + 1)
  );
  const ledgerCore = {
    schemaVersion: "ARENA_PDF_SKELETON_SOURCE_LEDGER_V1",
    sourcePdf: PDF_SOURCE,
    sourceCatalog: {
      schemaVersion: catalog.schemaVersion,
      generatedAt: catalog.generatedAt,
      contentSha256: sha256(catalogText),
    },
    selectionPolicy: {
      requiredStatus: "ACTIVE_REFERENCE",
      excludedDifficultyClass: "UNRESOLVED",
      runtimeDifficultyEligible: true,
      auditedQuestionCount: records.length,
      selectedQuestionCount: ledgerRecords.length,
    },
    summary: {
      byDifficultyClass: countBy(selected, "difficultyClass"),
      byCourse: countBy(selected, "courseId"),
      byFamily: countBy(selected, "familyId"),
      byYear: countBy(selected, "year"),
      byImplementationWave: countBy(
        ledgerRecords.map((record) => ({ wave: record.implementation.wave })),
        "wave"
      ),
    },
    records: ledgerRecords,
  };
  const contentHash = sha256(JSON.stringify(canonicalize(ledgerCore)));
  const ledger = { ...ledgerCore, contentHash };
  await Promise.all([
    writeFile(outputPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8"),
    writeFile(
      reportPath,
      markdownReport({ allRecords: records, selectedRecords: selected, ledger }),
      "utf8"
    ),
  ]);
  console.log(
    `Arena PDF skeleton source ledger built: audited=${records.length} selected=${selected.length} hash=${contentHash}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
