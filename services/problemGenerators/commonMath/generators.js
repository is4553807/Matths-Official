const { loadCurriculum } = require("../../curriculumService");
const { CONCEPT_DETAILS } = require("../../commonMathLearningCatalog");
const { formatAlgebraMathText } = require("../../mathTextService");
const { isCorrectAnswer } = require("../utils");

const TYPE_BLUEPRINTS = [
  ["core-definition", "핵심 정의 판별", 1],
  ["formula-meaning", "대표 관계식 해석", 2],
  ["condition-reading", "조건과 범위 확인", 2],
  ["visual-representation", "그림·그래프·표로 표현", 2],
  ["calculation-plan", "계산 순서 설계", 3],
  ["reverse-reasoning", "결론에서 조건 역추론", 3],
  ["error-diagnosis", "잘못된 풀이 진단", 3],
  ["parameter-change", "조건 변화 비교", 4],
  ["application-model", "실생활·도형 상황 모델링", 4],
  ["integrated-reasoning", "복합 조건 종합", 5],
];

function shuffled(values) {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function finalConsonantIndex(value) {
  const lastCharacter = Array.from(String(value || "").trim()).at(-1) || "";
  const codePoint = lastCharacter.codePointAt(0);
  if (codePoint < 0xac00 || codePoint > 0xd7a3) return 0;
  return (codePoint - 0xac00) % 28;
}

function objectParticle(value) {
  return finalConsonantIndex(value) ? "을" : "를";
}

function withObjectParticle(value) {
  return `${value}${objectParticle(value)}`;
}

function withDirectionalParticle(value) {
  const consonant = finalConsonantIndex(value);
  return `${value}${consonant && consonant !== 8 ? "으로" : "로"}`;
}

function multipleChoice({ prompt, correct, distractors, solution, hintText, visualization }) {
  const candidates = unique([correct, ...distractors]).slice(0, 4);
  while (candidates.length < 4) candidates.push(`조건 ${candidates.length + 1}만 확인한다.`);
  const choices = shuffled(candidates.map((text, originalIndex) => ({ text, isCorrect: originalIndex === 0 })))
    .map((choice, index) => ({
      key: ["a", "b", "c", "d"][index],
      text: formatAlgebraMathText(choice.text),
      isCorrect: choice.isCorrect,
    }));
  return {
    prompt: formatAlgebraMathText(prompt),
    inputMode: "multiple-choice",
    choices,
    answer: choices.find((choice) => choice.isCorrect).key,
    solution: formatAlgebraMathText(solution),
    hintText: formatAlgebraMathText(hintText),
    visualization: visualization || null,
    validityChecks: [{ name: "common-math-choice", passed: choices.length === 4 }],
  };
}

function makeProblem({ concept, unitConcepts, variant, detail }) {
  const [title, takeaway, formula] = detail;
  const topics = concept.topics?.length ? concept.topics : [title];
  const visuals = concept.visualizationIdeas?.length
    ? concept.visualizationIdeas
    : [`${title}의 조건을 식과 그림으로 함께 나타내기`];
  const otherDetails = unitConcepts
    .filter((item) => item.id !== concept.id)
    .map((item) => CONCEPT_DETAILS[item.id])
    .filter(Boolean);
  const otherTakeaways = otherDetails.map((item) => item[1]);
  const otherFormulas = otherDetails.map((item) => item[2]);
  const topic = topics[variant % topics.length];

  const sharedDistractors = [
    "정의역과 조건은 확인하지 않고 마지막 계산값만 비교한다.",
    "모든 기호를 같은 값으로 두면 언제나 성립한다고 본다.",
    "식의 모양이 비슷하면 조건과 관계없이 같은 공식을 사용한다.",
  ];

  switch (variant) {
    case 0:
      return multipleChoice({
        prompt: `${title}의 핵심 의미로 가장 알맞은 것을 고르세요.`,
        correct: takeaway,
        distractors: otherTakeaways.concat(sharedDistractors),
        solution: `${title}에서는 ${takeaway}`,
        hintText: "계산보다 먼저 정의가 어떤 대상을 연결하는지 확인하세요.",
      });
    case 1:
      return multipleChoice({
        prompt: `${withObjectParticle(title)} 설명하는 대표 관계식으로 가장 알맞은 것을 고르세요.`,
        correct: formula,
        distractors: otherFormulas.concat(["x=0", "a+b=ab"]),
        solution: `대표 관계는 ${formula}입니다. 각 기호의 조건까지 함께 기억해야 합니다.`,
        hintText: `${title}의 정의를 식으로 옮긴 관계를 찾으세요.`,
      });
    case 2:
      return multipleChoice({
        prompt: `${title} 문제에서 ‘${topic}’${objectParticle(topic)} 다룰 때 가장 먼저 할 일은 무엇인가요?`,
        correct: "주어진 대상의 범위와 성립 조건을 표시한다.",
        distractors: sharedDistractors,
        solution: "조건과 범위를 먼저 표시해야 이후의 식 변형과 계산이 허용되는지 판단할 수 있습니다.",
        hintText: "답을 계산하기 전에 무엇이 허용되는지 먼저 확인하세요.",
      });
    case 3:
      return multipleChoice({
        prompt: `${title}의 ‘${topic}’${objectParticle(topic)} 시각적으로 확인하는 방법으로 가장 적절한 것은 무엇인가요?`,
        correct: visuals[variant % visuals.length],
        distractors: ["조건과 무관한 장식용 그래프를 그린다.", "모든 값을 한 점에 겹쳐 표시한다.", "계산 결과만 적고 관계는 나타내지 않는다."],
        solution: `${visuals[variant % visuals.length]} 방식은 조건과 결과가 함께 변하는 모습을 보여줍니다.`,
        hintText: "문제의 조건이 변할 때 그림의 어느 부분이 함께 움직이는지 생각하세요.",
        visualization: { kind: "common-math-concept", conceptId: concept.id, focus: topic },
      });
    case 4:
      return multipleChoice({
        prompt: `${title} 계산을 가장 안전하게 진행하는 순서를 고르세요.`,
        correct: "정의 확인 → 조건 표시 → 관계식 적용 → 계산 → 원래 조건으로 검산",
        distractors: ["계산 → 공식 선택 → 조건 생략 → 답", "공식 암기 → 숫자 대입 → 정의 확인", "답 추측 → 조건 변경 → 계산 생략"],
        solution: "정의와 조건을 먼저 확인하고 계산 후 원래 조건에 대입해 검산해야 불필요한 해와 부호 오류를 막을 수 있습니다.",
        hintText: "계산 전과 계산 후에 각각 확인할 항목을 찾으세요.",
      });
    case 5:
      return multipleChoice({
        prompt: `${title}에서 결론이 주어졌을 때 조건을 역으로 찾는 올바른 방법은 무엇인가요?`,
        correct: "결론을 대표 관계식에 대입하고, 역과 원래 명제가 모두 성립하는지 검산한다.",
        distractors: sharedDistractors,
        solution: "역추론에서는 역이 항상 참인 것이 아니므로 얻은 후보를 반드시 원래 조건에 다시 대입해야 합니다.",
        hintText: "필요조건으로 얻은 후보와 실제 해를 구분하세요.",
      });
    case 6:
      return multipleChoice({
        prompt: `${title} 풀이에서 가장 먼저 수정해야 할 잘못된 접근을 고르세요.`,
        correct: "정의역·부호·중복 가능성을 확인하지 않고 식의 모양만 보고 공식을 적용한다.",
        distractors: ["기호의 뜻을 먼저 적는다.", "계산 뒤 원래 조건에 대입한다.", "식과 그림의 결과를 서로 비교한다."],
        solution: "공식은 성립 조건 안에서만 사용할 수 있으므로 정의역, 부호, 중복 여부를 먼저 점검해야 합니다.",
        hintText: "공식 자체보다 공식이 성립하는 조건을 보세요.",
      });
    case 7:
      return multipleChoice({
        prompt: `${title}에서 수나 조건 하나가 바뀌었을 때 가장 타당한 대응은 무엇인가요?`,
        correct: "바뀐 조건이 정의·부호·범위에 미치는 영향을 먼저 확인한 뒤 같은 해결 절차를 다시 적용한다.",
        distractors: sharedDistractors,
        solution: "조건 변화는 답만 바꾸는 것이 아니라 사용할 수 있는 성질과 해의 범위를 바꿀 수 있습니다.",
        hintText: "변한 숫자보다 그 숫자가 맡은 역할을 확인하세요.",
      });
    case 8:
      return multipleChoice({
        prompt: `실제 상황을 ${withDirectionalParticle(title)} 모델링할 때 가장 알맞은 첫 단계는 무엇인가요?`,
        correct: "상황의 대상과 조건을 변수·집합·좌표·경우 중 알맞은 수학적 대상으로 번역한다.",
        distractors: sharedDistractors,
        solution: "모델링은 문장 속 대상과 제한을 수학적 기호와 조건으로 정확히 번역하는 것에서 시작합니다.",
        hintText: "문장 속 무엇을 변수로 둘지 먼저 정하세요.",
      });
    default:
      return multipleChoice({
        prompt: `${title}의 ‘${topic}’${objectParticle(topic)} 포함한 종합 문제를 해결할 때 반드시 지켜야 할 원칙을 고르세요.`,
        correct: `${takeaway} 그리고 계산 결과가 원래 조건과 학습 범위를 모두 만족하는지 검산한다.`,
        distractors: sharedDistractors.concat(otherTakeaways),
        solution: `${title}의 핵심은 ${takeaway} 마지막에는 원래 조건과 학습 범위를 모두 만족하는지 확인합니다.`,
        hintText: "핵심 관계와 최종 검산 조건을 동시에 포함한 선택지를 찾으세요.",
      });
  }
}

function buildGeneratorMap() {
  const curriculum = loadCurriculum();
  const map = new Map();
  for (const course of curriculum.courses.filter((item) => ["common-math-1", "common-math-2"].includes(item.id))) {
    for (const unit of course.units) {
      for (const concept of unit.concepts) {
        const detail = CONCEPT_DETAILS[concept.id];
        if (!detail) throw new Error(`공통수학 문제 메타데이터가 없습니다: ${concept.id}`);
        const problemTypes = TYPE_BLUEPRINTS.map(([id, label, difficulty], variant) => ({
          id: `${concept.id}-${id}`,
          label: `유형 ${variant + 1} · ${label}`,
          difficulty,
          generate: () => makeProblem({ concept, unitConcepts: unit.concepts, variant, detail }),
        }));
        map.set([course.id, unit.id, concept.id].join("/"), {
          key: `common-math-${concept.id}`,
          requiredDistinctTypes: 5,
          problemTypes,
          isCorrectAnswer,
        });
      }
    }
  }
  return map;
}

const generatorMap = buildGeneratorMap();

module.exports = { TYPE_BLUEPRINTS, generatorMap };
