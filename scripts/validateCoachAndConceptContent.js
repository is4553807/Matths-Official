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
  loadCoachMessages,
} = require(
  "../services/coachMessageService"
);

const coachContent =
  loadCoachMessages();

for (const mode of MODES) {
  for (const situation of
    SITUATIONS) {
    const messages =
      coachContent.modes[mode]
        .messages[situation];

    assert.ok(
      messages.length >= 10,
      `${mode}/${situation} 코치 문구는 10개 이상이어야 합니다.`
    );
  }
}

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
  `코치 문구 90개와 한국어 개념·유형 설명 ${validatedGuides}개 검증 완료`
);
