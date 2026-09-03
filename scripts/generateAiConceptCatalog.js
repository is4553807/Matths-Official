#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const {
  conceptKey,
  isCourseAvailable,
  loadCurriculum,
} = require("../services/curriculumService");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(
  PROJECT_ROOT,
  "dataAnalysis",
  "AI_CONCEPT_CATALOG.md"
);
const PUBLIC_OUTPUT_PATH = path.join(
  PROJECT_ROOT,
  "public",
  "templates",
  "matths-ai-concept-catalog.md"
);
const CHECK_ONLY = process.argv.includes("--check");

function text(value) {
  return String(value || "").trim();
}

function textList(value) {
  return (Array.isArray(value) ? value : []).map(text).filter(Boolean);
}

function buildConceptRecord(curriculum, course, unit, concept) {
  return {
    curriculumId: text(curriculum.curriculum.id),
    curriculumTitle: text(curriculum.curriculum.title),
    categoryId: text(course.category),
    categoryTitle: text(course.categoryTitle),
    courseId: text(course.id),
    courseTitle: text(course.officialTitle),
    recommendedGrades: (course.recommendedGrades || [])
      .map(Number)
      .filter(Number.isFinite),
    unitId: text(unit.id),
    unitTitle: text(unit.title),
    unitOrder: Number(unit.order) || 0,
    conceptId: text(concept.id),
    conceptTitle: text(concept.title),
    conceptOrder: Number(concept.order) || 0,
    conceptKey: conceptKey(course.id, unit.id, concept.id),
    standardCode: text(concept.standardCode),
    achievementStandard: text(concept.achievementStandard),
    topics: textList(concept.topics),
    scopeNotes: textList(concept.scopeNotes),
    visualizationIdeas: textList(concept.visualizationIdeas),
    available: isCourseAvailable(course.id),
    sourceFile: text(course.sourceFile),
  };
}

function validateRecords(records) {
  assert.ok(records.length > 0, "개념 카탈로그가 비어 있습니다.");

  const requiredTextFields = [
    "curriculumId",
    "curriculumTitle",
    "categoryId",
    "categoryTitle",
    "courseId",
    "courseTitle",
    "unitId",
    "unitTitle",
    "conceptId",
    "conceptTitle",
    "conceptKey",
    "standardCode",
    "achievementStandard",
    "sourceFile",
  ];
  const conceptIds = new Set();
  const conceptKeys = new Set();

  for (const record of records) {
    for (const field of requiredTextFields) {
      assert.ok(record[field], `${record.conceptKey || "알 수 없는 개념"}: ${field}가 비어 있습니다.`);
    }

    assert.ok(
      !conceptIds.has(record.conceptId),
      `중복 conceptId가 있습니다: ${record.conceptId}`
    );
    assert.ok(
      !conceptKeys.has(record.conceptKey),
      `중복 conceptKey가 있습니다: ${record.conceptKey}`
    );
    conceptIds.add(record.conceptId);
    conceptKeys.add(record.conceptKey);
  }
}

function buildDocument(curriculum, records) {
  const availableCount = records.filter((record) => record.available).length;
  const lockedCount = records.length - availableCount;
  const sourceFiles = curriculum.sourceFiles.map((fileName) => `\`${fileName}\``).join(", ");
  const lines = [
    "<!-- 이 파일은 scripts/generateAiConceptCatalog.js가 생성합니다. 직접 수정하지 마세요. -->",
    "",
    "# AI 주간 모의고사 개념 카탈로그",
    "",
    "주간 모의고사와 답안지 생성 AI가 실제 Matths 교육과정 식별자만 사용하도록 만든 기준 문서입니다. 개념 목록의 원본은 DB가 아니라 `curriculum_folder/kr-2022-*.yaml`이며, DB의 학습·과제·모의고사 문서는 이 식별자를 참조합니다.",
    "",
    "## AI 사용 규칙",
    "",
    "1. 아래 레코드에 있는 식별자와 제목을 정확히 복사하고, `conceptId`나 제목을 새로 만들거나 번역하지 않습니다.",
    "2. 개념을 선택할 때 `courseId` → `unitId` → `conceptId`의 전체 경로를 함께 확인합니다.",
    "3. 현재 `conceptId`는 전체 카탈로그에서 중복되지 않지만, 저장·검증에는 `conceptKey`를 우선 사용합니다.",
    "4. 실제 서비스에 바로 출제할 때는 `available: true`인 개념만 사용합니다. `available: false`는 교육과정에는 있으나 현재 서비스에서 준비 중인 과목입니다.",
    "5. 요청한 개념을 찾을 수 없으면 임의 ID를 만들지 말고 `concept: null`과 검토가 필요한 이유를 반환합니다.",
    "6. 문제 하나가 여러 개념을 포함하더라도 `conceptId`에는 출제 의도를 가장 잘 설명하는 주개념 하나를 넣습니다.",
    "",
    "## 모의고사 v3 JSON의 concept 형식",
    "",
    "`matths-answer-key-v3`의 각 `questions[]` 안에는 아래 `concept` 객체를 넣습니다. 한 레코드의 값을 섞지 않고 그대로 복사해야 하며, 서버가 전체 식별자와 제목을 카탈로그에 대조합니다.",
    "",
    "```json",
    "{",
    '  "curriculumId": "kr-2022",',
    '  "courseId": "common-math-1",',
    '  "courseTitle": "공통수학1",',
    '  "unitId": "polynomials",',
    '  "unitTitle": "다항식",',
    '  "conceptId": "polynomial-arithmetic",',
    '  "conceptTitle": "다항식의 사칙연산",',
    '  "conceptKey": "common-math-1/polynomials/polynomial-arithmetic"',
    "}",
    "```",
    "",
    "## 카탈로그 현황",
    "",
    `- 교육과정: ${curriculum.curriculum.title} (\`${curriculum.curriculum.id}\`)`,
    `- 전체: ${curriculum.courses.length}개 과목 · ${curriculum.catalogStats.totalUnits}개 단원 · ${records.length}개 개념`,
    `- 현재 사용 가능: ${availableCount}개 개념`,
    `- 준비 중: ${lockedCount}개 개념`,
    `- 원본 파일: ${sourceFiles}`,
    "",
    "| 상태 | 과목 ID | 과목명 | 단원 수 | 개념 수 |",
    "| --- | --- | --- | ---: | ---: |",
  ];

  for (const course of curriculum.courses) {
    lines.push(
      `| ${isCourseAvailable(course.id) ? "사용 가능" : "준비 중"} | \`${course.id}\` | ${course.officialTitle} | ${course.units.length} | ${course.conceptCount} |`
    );
  }

  lines.push(
    "",
    "## 전체 개념 레코드",
    "",
    "아래는 한 줄에 한 개념을 담은 JSON Lines 형식입니다. 각 줄은 독립적으로 복사해 사용할 수 있습니다. `achievementStandard`, `topics`, `scopeNotes`는 AI가 출제 범위를 벗어나지 않도록 돕는 참고 정보입니다.",
    ""
  );

  for (const course of curriculum.courses) {
    const courseRecords = records.filter((record) => record.courseId === course.id);
    lines.push(
      `### ${course.officialTitle} (\`${course.id}\`)`,
      "",
      `상태: **${isCourseAvailable(course.id) ? "사용 가능" : "준비 중"}** · ${course.units.length}개 단원 · ${courseRecords.length}개 개념`,
      ""
    );

    for (const unit of course.units) {
      const unitRecords = courseRecords.filter((record) => record.unitId === unit.id);
      lines.push(
        `#### ${unit.title} (\`${unit.id}\`)`,
        "",
        "```jsonl",
        ...unitRecords.map((record) => JSON.stringify(record)),
        "```",
        ""
      );
    }
  }

  lines.push(
    "## 갱신 방법",
    "",
    "교육과정 YAML을 수정한 뒤 다음 명령으로 이 문서를 다시 생성합니다.",
    "",
    "```bash",
    "npm run ai-concept-catalog:build",
    "```",
    "",
    "문서가 최신 상태인지 확인하려면 다음 명령을 사용합니다.",
    "",
    "```bash",
    "npm run ai-concept-catalog:verify",
    "```",
    ""
  );

  return lines.join("\n");
}

function main() {
  const curriculum = loadCurriculum();
  const records = curriculum.courses.flatMap((course) =>
    course.units.flatMap((unit) =>
      unit.concepts.map((concept) =>
        buildConceptRecord(curriculum, course, unit, concept)
      )
    )
  );

  validateRecords(records);
  assert.equal(
    records.length,
    curriculum.catalogStats.totalConcepts,
    "교육과정 통계와 생성된 개념 수가 다릅니다."
  );

  const document = buildDocument(curriculum, records);

  if (CHECK_ONLY) {
    for (const outputPath of [OUTPUT_PATH, PUBLIC_OUTPUT_PATH]) {
      assert.ok(fs.existsSync(outputPath), `AI 개념 카탈로그 문서가 없습니다: ${outputPath}`);
      assert.equal(
        fs.readFileSync(outputPath, "utf8"),
        document,
        "AI 개념 카탈로그가 교육과정 원본과 다릅니다. npm run ai-concept-catalog:build를 실행하세요."
      );
    }
    console.log(`AI concept catalog verified: ${records.length} concepts.`);
    return;
  }

  for (const outputPath of [OUTPUT_PATH, PUBLIC_OUTPUT_PATH]) {
    fs.writeFileSync(outputPath, document, "utf8");
  }
  console.log(
    `AI concept catalog generated: ${records.length} concepts -> ${OUTPUT_PATH}, ${PUBLIC_OUTPUT_PATH}`
  );
}

main();
