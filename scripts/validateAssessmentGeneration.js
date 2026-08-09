const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const {
  ASSESSMENT_CATALOG,
  DIFFICULTY_LABELS,
  PAPER_PLANS,
  buildAssessmentPaper,
  normalizeExamMath,
} = require("../services/assessmentService");
const {
  MOCK_EXAM_SESSIONS,
  MOCK_EXAM_PAPERS,
  UNIT_REFERENCE_RULES,
  getUnitReferenceAnalysis,
} = require(
  "../services/assessmentReferences/mockExamCatalog"
);
const {
  unitConfigs,
  assertAssessmentTemplateCatalog,
} = require(
  "../services/assessmentTemplates"
);
const {
  selectDeepestLearnedStage,
} = require(
  "../services/assessmentTemplates/shared"
);
const {
  generateValidProblem,
} = require(
  "../services/problemGenerators/utils"
);

function assertAdvancedMathFormatting(
  template,
  problem
) {
  for (const [
    field,
    rawValue,
  ] of Object.entries({
    prompt: problem.prompt,
    solution: problem.solution,
    hintText: problem.hintText,
  })) {
    const value = String(
      rawValue || ""
    );
    const dollarCount = (
      value.match(/\$/g) || []
    ).length;

    assert.equal(
      dollarCount % 2,
      0,
      `${template.id}/${field}: 수식 구분자($)가 닫히지 않았습니다.`
    );
    assert.doesNotMatch(
      value,
      /\+\-|--|\+\+/,
      `${template.id}/${field}: 비정상적인 연산 부호가 있습니다.`
    );

    const outsideMath = value
      .replace(/\$[^$]*\$/g, "")
      .replace(/\\\([\s\S]*?\\\)/g, "")
      .replace(/\\\[[\s\S]*?\\\]/g, "");

    assert.doesNotMatch(
      outsideMath,
      /\\(?:frac|dfrac|lim|sum|int|sqrt|binom|begin|overline|alpha|beta|pi|theta)/,
      `${template.id}/${field}: 수식 구분자 밖에 TeX 명령이 있습니다.`
    );
  }
}

function assertUniqueTypes(paper) {
  const courseConfig =
    ASSESSMENT_CATALOG.find(
      (course) =>
        course.courseId ===
        paper.courseId
    );
  const allowedUnitIds = new Set(
    courseConfig.units.map(
      (unit) => unit.unitId
    )
  );
  const sourceTypeIds =
    paper.questions.flatMap(
      (question) =>
        question.sourceTypeIds || []
    );

  assert.equal(
    paper.questions.length,
    PAPER_PLANS[
      paper.scopeType
    ].questionCount,
    `${paper.title}: 문항 수가 평가 계획과 다릅니다.`
  );
  assert.equal(
    sourceTypeIds.length,
    new Set(sourceTypeIds).size,
    `${paper.title}: 같은 문제 유형이 한 평가 안에서 재사용됐습니다.`
  );
  assert.equal(
    paper.questions.length,
    new Set(
      paper.questions.map(
        (question) =>
          question.typeId
      )
    ).size,
    `${paper.title}: 최종 문항 typeId가 중복됐습니다.`
  );
  assert.equal(
    paper.questions.some(
      (question) =>
        question.prompt.includes(
          "보기의 영문자"
        )
    ),
    false,
    `${paper.title}: 심화 문항 안내에 영문 보기 입력이 남아 있습니다.`
  );

  for (const question of
    paper.questions) {
    assert.equal(
      question.sourceCourseId,
      paper.courseId,
      `${paper.title}: 문항의 과목 출처가 평가 범위와 다릅니다.`
    );
    assert.ok(
      allowedUnitIds.has(
        question.sourceUnitId
      ),
      `${paper.title}: 문항이 현재 과목 밖의 단원을 사용합니다.`
    );

    if (
      paper.scopeType === "unit"
    ) {
      assert.equal(
        question.sourceUnitId,
        paper.unitId,
        `${paper.title}: 아직 배우지 않은 다른 대단원 문항이 섞였습니다.`
      );
    }

    if (
      question.difficulty ===
      "mid-high"
    ) {
      continue;
    }

    assert.ok(
      question.referenceExamIds
        .length >= 1,
      `${paper.title}: ${question.typeId}에 모의고사 레퍼런스가 없습니다.`
    );
    assert.ok(
      question.sourcePattern,
      `${paper.title}: ${question.typeId}에 분석한 출제 패턴이 없습니다.`
    );

    if (
      question.difficulty ===
      "advanced"
    ) {
      assert.ok(
        question.estimatedMinutes >=
          10,
        `${paper.title}: ${question.typeId}의 예상 풀이시간이 10분 미만입니다.`
      );
      assert.ok(
        question.reasoningSteps
          .length >= 3,
        `${paper.title}: ${question.typeId}의 풀이 단계가 3개 미만입니다.`
      );
      assert.equal(
        /두 답을 순서대로|객관식은 보기 번호/.test(
          question.prompt
        ),
        false,
        `${paper.title}: 독립 문항을 이어 붙인 기존 심화 형식이 남아 있습니다.`
      );
    }
  }
}

assert.equal(
  MOCK_EXAM_SESSIONS.length,
  64,
  "최근 5개년 모의고사 회차는 64회여야 합니다."
);
assert.equal(
  MOCK_EXAM_PAPERS.length,
  92,
  "선택과목을 포함한 최근 5개년 모의고사 문제지는 92개여야 합니다."
);
assert.deepEqual(
  [
    ...new Set(
      MOCK_EXAM_PAPERS.map(
        (paper) => paper.year
      )
    ),
  ],
  [
    2022,
    2023,
    2024,
    2025,
    2026,
  ],
  "모의고사 코퍼스 연도 범위가 다릅니다."
);
assert.deepEqual(
  [
    ...new Set(
      MOCK_EXAM_PAPERS.map(
        (paper) => paper.grade
      )
    ),
  ],
  [1, 2, 3],
  "고1·고2·고3 모의고사가 모두 포함되어야 합니다."
);
assertAssessmentTemplateCatalog();
assert.equal(
  unitConfigs.length,
  16,
  "공개 5개 과목의 16개 대단원별 기말평가 설정이 모두 있어야 합니다."
);
assert.equal(
  unitConfigs.reduce(
    (sum, config) =>
      sum +
      config.advancedTemplates
        .length,
    0
  ),
  320,
  "심화 문제 유형은 전체 320개여야 합니다."
);

let validatedAdvancedProblems = 0;

for (const config of unitConfigs) {
  assert.equal(
    config.advancedTemplates.length,
    20,
    `${config.courseId}/${config.unitId}: 심화 유형은 정확히 20개여야 합니다.`
  );

  for (const template of
    config.advancedTemplates) {
    for (
      let run = 0;
      run < 10;
      run += 1
    ) {
      const problem =
        generateValidProblem(
          template,
          30
        );

      assertAdvancedMathFormatting(
        template,
        problem
      );
      validatedAdvancedProblems += 1;
    }
  }
}

const analyzedPaperIds = new Set();

for (const key of Object.keys(
  UNIT_REFERENCE_RULES
)) {
  const [courseId, ...unitParts] =
    key.split("/");
  const analysis =
    getUnitReferenceAnalysis(
      courseId,
      unitParts.join("/")
    );

  analysis.paperIds.forEach(
    (paperId) =>
      analyzedPaperIds.add(paperId)
  );
}

assert.equal(
  analyzedPaperIds.size,
  MOCK_EXAM_PAPERS.length,
  "92개 모의고사 문제지가 모두 적어도 한 단원 분석에 포함되어야 합니다."
);

const stagedExample = [
  {
    id: "derivative-only",
    requiredConceptIds: [
      "differentiate",
    ],
  },
  {
    id: "derivative-and-integral",
    requiredConceptIds: [
      "differentiate",
      "integrate",
    ],
  },
];

assert.equal(
  selectDeepestLearnedStage(
    stagedExample,
    ["differentiate"]
  ).id,
  "derivative-only",
  "적분을 배우기 전에는 모의고사 원형을 미분 단계에서 잘라야 합니다."
);
assert.equal(
  selectDeepestLearnedStage(
    stagedExample,
    [
      "differentiate",
      "integrate",
    ]
  ).id,
  "derivative-and-integral",
  "적분을 배운 뒤에는 미분·적분 전체 단계를 사용할 수 있어야 합니다."
);

const integrationConfig =
  unitConfigs.find(
    (config) =>
      config.courseId ===
        "calculus-1" &&
      config.unitId ===
        "integration"
  );
const integrationWithoutPriorUnit =
  buildAssessmentPaper({
    scopeType: "unit",
    courseId: "calculus-1",
    unitId: "integration",
    learnedConceptIds:
      integrationConfig.requiredConceptIds,
  });

assert.equal(
  integrationWithoutPriorUnit.questions.some(
    (question) =>
      question.typeId.includes(
        "tangent-and-enclosed-area"
      )
  ),
  false,
  "미분을 완료하지 않은 학생에게 접선 미분이 필요한 적분 심화 유형을 내면 안 됩니다."
);

const motionProgression =
  unitConfigs.flatMap(
    (config) =>
      config.advancedTemplates
  ).filter(
    (template) =>
      template.referenceArchetypeId ===
      "motion-derivative-integral-progression"
  );

assert.ok(
  motionProgression.some(
    (template) =>
      template.stages.some(
        (stage) =>
          stage.id ===
          "differentiate-before-integrating"
      )
  ) &&
    motionProgression.some(
      (template) =>
        template.stages.some(
          (stage) =>
            stage.id ===
            "differentiate-and-integrate"
        )
    ),
  "같은 운동 원형이 미분 단계와 미분·적분 전체 단계로 이어져야 합니다."
);

function buildAllPapers() {
  const papers = [];

  for (const course of ASSESSMENT_CATALOG) {
    papers.push(
      buildAssessmentPaper({
        scopeType: "course",
        courseId: course.courseId,
      })
    );

    for (const unit of course.units) {
      papers.push(
        buildAssessmentPaper({
          scopeType: "unit",
          courseId:
            course.courseId,
          unitId: unit.unitId,
        })
      );

      for (const subunit of unit.subunits) {
        papers.push(
          buildAssessmentPaper({
            scopeType:
              "subunit",
            courseId:
              course.courseId,
            unitId:
              unit.unitId,
            subunitId:
              subunit.id,
          })
        );
      }
    }
  }

  return papers;
}

const expectedTimeLimits = {
  subunit: 10 * 60 * 1000,
  unit: 30 * 60 * 1000,
  course: 60 * 60 * 1000,
};

for (const paper of buildAllPapers()) {
  assert.equal(
    paper.timeLimitMs,
    expectedTimeLimits[
      paper.scopeType
    ],
    `${paper.title}: 평가 범위별 제한 시간이 올바르지 않습니다.`
  );
}

function typeIdsByDifficulty(
  paper,
  difficulty
) {
  return new Set(
    paper.questions
      .filter(
        (question) =>
          question.difficulty ===
          difficulty
      )
      .map(
        (question) =>
          question.typeId
      )
  );
}

function intersectionSize(
  left,
  right
) {
  return [
    ...left,
  ].filter((value) =>
    right.has(value)
  ).length;
}

for (const course of
  ASSESSMENT_CATALOG) {
  for (const unit of
    course.units) {
    const recentPapers = [];

    for (
      let round = 0;
      round < 4;
      round += 1
    ) {
      const avoided = new Set(
        recentPapers
          .slice(-3)
          .flatMap((paper) =>
            paper.questions.flatMap(
              (question) =>
                question.sourceTypeIds
            )
          )
      );
      const paper =
        buildAssessmentPaper({
          scopeType: "unit",
          courseId:
            course.courseId,
          unitId: unit.unitId,
          avoidedTypeIds: avoided,
        });

      for (const prior of
        recentPapers.slice(-3)) {
        const advancedOverlap =
          intersectionSize(
            typeIdsByDifficulty(
              prior,
              "advanced"
            ),
            typeIdsByDifficulty(
              paper,
              "advanced"
            )
          );

        assert.equal(
          advancedOverlap,
          0,
          `${course.courseId}/${unit.unitId}: 최근 3회 이내 기말평가의 심화 유형이 겹칩니다.`
        );
      }

      if (round === 1) {
        const appliedOverlap =
          intersectionSize(
            typeIdsByDifficulty(
              recentPapers[0],
              "applied"
            ),
            typeIdsByDifficulty(
              paper,
              "applied"
            )
          );

        assert.ok(
          appliedOverlap <= 1,
          `${course.courseId}/${unit.unitId}: 연속 두 기말평가의 응용 유형이 지나치게 겹칩니다.`
        );
      }

      recentPapers.push(paper);
    }
  }
}

const normalizedLimit = normalizeExamMath(
  "\\(\\lim_{x\\to 3^-}f(x)=1\\)"
);

assert.match(
  normalizedLimit,
  /\\displaystyle\\lim_/,
  "평가의 극한 기호가 displaystyle로 정규화되지 않았습니다."
);

const requestedRuns = Number(
  process.argv[2] || 5
);
const generationRuns =
  Number.isInteger(requestedRuns) &&
  requestedRuns > 0
    ? requestedRuns
    : 5;
const papers = Array.from(
  { length: generationRuns },
  () => buildAllPapers()
).flat();
papers.forEach(assertUniqueTypes);

const templatePath = path.join(
    __dirname,
    "..",
    "views",
    "assessment-attempt.ejs"
  );
const template = fs.readFileSync(
  templatePath,
  "utf8"
);
const samplePaper = papers.find(
  (paper) =>
    paper.questions.some(
      (question) =>
        question.inputMode ===
        "multiple-choice"
    )
);
const html = ejs.render(template, {
  attempt: {
    ...samplePaper,
    _id: "validation-attempt",
    status: "in-progress",
  },
  difficultyLabels:
    DIFFICULTY_LABELS,
}, {
  filename: templatePath,
});
const visibleChoiceMarkers = Array.from(
  html.matchAll(
    /<span class="choice-key">\s*([^<\s]+)\s*<\/span>/g
  ),
  (match) => match[1]
);

assert.ok(
  visibleChoiceMarkers.length > 0,
  "평가 화면에서 객관식 선지 번호를 찾지 못했습니다."
);
assert.ok(
  visibleChoiceMarkers.every(
    (marker) =>
      /^[①②③④⑤⑥⑦⑧⑨⑩]$/.test(
        marker
      )
  ),
  "평가 화면에 내부 영문 선지 키가 노출됩니다."
);

console.log(
  `평가 ${papers.length}개 시험지·심화 ${validatedAdvancedProblems}문제 생성 검증 완료: 모든 시험의 유형 중복 없음`
);
