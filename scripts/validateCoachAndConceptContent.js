const assert = require(
  "node:assert/strict"
);

const {
  ASSESSMENT_CATALOG,
} = require(
  "../services/assessmentService"
);
const {
  getProblemGenerator,
} = require(
  "../services/problemGenerators"
);
const {
  generateValidProblem,
} = require(
  "../services/problemGenerators/utils"
);
const {
  buildProblemTypeGuide,
} = require(
  "../services/conceptGuideService"
);
const {
  MODES,
  SITUATIONS,
  getCoachView,
  loadCoachMessages,
  setCommunityCoachMessages,
} = require(
  "../services/coachMessageService"
);

const coachContent =
  loadCoachMessages();
let validatedCoachMessages = 0;

for (const mode of MODES) {
  for (const situation of
    SITUATIONS) {
    const messages =
      coachContent.modes[mode]
        .messages[situation];

    if (
      mode === "silent" &&
      situation === "study_prompt"
    ) {
      assert.equal(
        messages.length,
        0,
        "무음 모드의 학습 독려 문구는 비어 있어야 합니다."
      );
    } else {
      assert.ok(
        messages.length >= 10,
        `${mode}/${situation} 코치 문구는 10개 이상이어야 합니다.`
      );
    }

    validatedCoachMessages +=
      messages.length;
  }
}

const approvedMessageMarker =
  "승인된 학생 문구 실사용 검증";
setCommunityCoachMessages([
  {
    mode: "spicy",
    situation: "incorrect",
    message: approvedMessageMarker,
  },
]);
assert.equal(
  getCoachView({
    mode: "spicy",
    situation: "incorrect",
    seed: "approved-message-check",
  }).message,
  approvedMessageMarker,
  "승인된 학생 문구가 실제 코치 피드백보다 우선 사용되어야 합니다."
);
setCommunityCoachMessages([]);

const officialStudyPrompt =
  getCoachView({
    mode: "spicy",
    situation: "study_prompt",
    seed: "official-study-prompt-check",
  });
assert.equal(
  officialStudyPrompt.source,
  "curated",
  "대시보드 학습 독려 문구는 공식 YAML 문구만 사용해야 합니다."
);
assert.ok(
  officialStudyPrompt.message,
  "대시보드 학습 독려 문구가 비어 있습니다."
);

const originalRandom = Math.random;
let firstRandomStudyPrompt;
let lastRandomStudyPrompt;
try {
  Math.random = () => 0;
  firstRandomStudyPrompt =
    getCoachView({
      mode: "spicy",
      situation: "study_prompt",
      random: true,
    }).message;
  Math.random = () => 0.999999;
  lastRandomStudyPrompt =
    getCoachView({
      mode: "spicy",
      situation: "study_prompt",
      random: true,
    }).message;
} finally {
  Math.random = originalRandom;
}
assert.notEqual(
  firstRandomStudyPrompt,
  lastRandomStudyPrompt,
  "대시보드 학습 독려 문구의 무작위 선택이 작동하지 않습니다."
);

function proseOutsideMath(value) {
  return String(value || "")
    .replace(
      /\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$[^$]*\$/g,
      " "
    );
}

let validatedGuides = 0;

for (const course of
  ASSESSMENT_CATALOG) {
  for (const unit of course.units) {
    for (const subunit of
      unit.subunits) {
      for (const conceptId of
        subunit.conceptIds) {
        const generator =
          getProblemGenerator({
            courseId:
              course.courseId,
            unitId: unit.unitId,
            conceptId,
          });

        for (const [
          index,
          problemType,
        ] of (
          generator?.problemTypes ||
          []
        ).entries()) {
          for (
            let sampleIndex = 0;
            sampleIndex < 3;
            sampleIndex += 1
          ) {
            const problem =
              generateValidProblem(
                problemType
              );
            const guide =
              buildProblemTypeGuide({
                courseId:
                  course.courseId,
                problemType,
                problem,
                order: index + 1,
              });

            for (const [
              field,
              value,
            ] of Object.entries({
              title: guide.title,
              hint: guide.hint,
              solution:
                guide.solution,
            })) {
              assert.doesNotMatch(
                proseOutsideMath(
                  value
                ),
                /[A-Za-z]{2,}/,
                `${conceptId}/${problemType.id}/${field}: 개념·유형 설명에 영문 단어가 남아 있습니다.`
              );
            }

            validatedGuides += 1;
          }
        }
      }
    }
  }
}

console.log(
  `코치 문구 ${validatedCoachMessages}개와 한국어 개념·유형 설명 ${validatedGuides}개 검증 완료`
);
