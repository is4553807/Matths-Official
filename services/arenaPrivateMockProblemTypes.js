/*
 * 공개 사설 모의고사에서 확인한 난이도·추상 사고 구조를 바탕으로 만든
 * GOAT Arena 자체 생성 유형이다. 원문 문장·수치·정답·해설은 복제하지
 * 않으며, 모든 수치와 풀이 과정은 서버가 새로 생성한다.
 */

function pick(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function structuredShortAnswer({ prompt, answer, solutionProcess, finalCheck }) {
  const steps = solutionProcess.map((step, index) => ({
    step: index + 1,
    title: String(step.title || `${index + 1}단계`),
    expression: String(step.expression || ""),
    explanation: String(step.explanation || ""),
  }));
  return {
    prompt,
    inputMode: "short-answer",
    choices: [],
    answer: String(answer),
    solutionProcess: steps,
    finalCheck: String(finalCheck || ""),
    solution: steps
      .map(
        (step) =>
          `${step.step}. ${step.title}${step.expression ? `: ${step.expression}` : ""}${
            step.explanation ? ` — ${step.explanation}` : ""
          }`
      )
      .concat(finalCheck ? [`검산: ${finalCheck}`] : [])
      .join("\n"),
  };
}

function generatePrivateAdjacentProductRecurrence() {
  const setting = pick([
    { difference: 1, firstReciprocal: 12, from: 2, to: 5, target: 7 },
    { difference: 1, firstReciprocal: 15, from: 3, to: 6, target: 8 },
    { difference: 2, firstReciprocal: 18, from: 2, to: 4, target: 7 },
    { difference: 2, firstReciprocal: 20, from: 3, to: 5, target: 8 },
  ]);
  const count = setting.to - setting.from + 1;
  const indexSum = Array.from(
    { length: count },
    (_unused, index) => setting.from - 1 + index
  ).reduce((sum, value) => sum + value, 0);
  const reciprocalSum =
    count * setting.firstReciprocal - setting.difference * indexSum;
  const targetReciprocal =
    setting.firstReciprocal - setting.difference * (setting.target - 1);
  const answer = setting.firstReciprocal + targetReciprocal;

  return {
    problem: structuredShortAnswer({
      prompt:
        `0이 아닌 실수로 이루어진 수열 $\\{a_n\\}$이 모든 자연수 $n$에 대하여 ` +
        `$a_{n+1}-a_n=${setting.difference}a_na_{n+1}$을 만족한다. ` +
        `$\\displaystyle\\sum_{k=${setting.from}}^{${setting.to}}\\frac{1}{a_k}=${reciprocalSum}$일 때, ` +
        `$\\displaystyle\\frac{1}{a_1}+\\frac{1}{a_${setting.target}}$의 값을 구하시오.`,
      answer,
      solutionProcess: [
        {
          title: "인접한 두 항의 곱으로 나누기",
          expression:
            `$\\dfrac{1}{a_n}-\\dfrac{1}{a_{n+1}}=${setting.difference}$`,
          explanation: "각 항이 0이 아니므로 주어진 식을 $a_na_{n+1}$로 나눌 수 있습니다.",
        },
        {
          title: "역수 수열로 치환하기",
          expression:
            `$b_n=\\dfrac{1}{a_n}$이면 $b_n=${setting.firstReciprocal}-${setting.difference}(n-1)$`,
          explanation:
            `$b_{n+1}=b_n-${setting.difference}$인 등차수열이고, 주어진 합 ${reciprocalSum}에서 $b_1=${setting.firstReciprocal}$을 얻습니다.`,
        },
        {
          title: "요구한 두 항 계산하기",
          expression:
            `$b_1+b_${setting.target}=${setting.firstReciprocal}+${targetReciprocal}=${answer}$`,
          explanation: "원래 식의 역수 합을 다시 $b_n$으로 바꾸어 계산합니다.",
        },
      ],
      finalCheck:
        `$b_${setting.from}$부터 $b_${setting.to}$까지의 합은 ${reciprocalSum}이고 모든 필요한 항은 0이 아닙니다.`,
    }),
    parameters: {
      ...setting,
      count,
      indexSum,
      reciprocalSum,
      targetReciprocal,
      answer,
    },
    operationCount: 24,
    maxInteger: Math.max(reciprocalSum, answer),
  };
}

function validatePrivateAdjacentProductRecurrence(generated) {
  const setting = generated.parameters || {};
  const count = Number(setting.to) - Number(setting.from) + 1;
  const indexSum = Array.from(
    { length: count },
    (_unused, index) => Number(setting.from) - 1 + index
  ).reduce((sum, value) => sum + value, 0);
  const firstReciprocal =
    (Number(setting.reciprocalSum) + Number(setting.difference) * indexSum) /
    count;
  const targetReciprocal =
    firstReciprocal - Number(setting.difference) * (Number(setting.target) - 1);
  const solvedAnswer = firstReciprocal + targetReciprocal;
  return {
    solvable:
      Number.isInteger(firstReciprocal) &&
      targetReciprocal !== 0 &&
      Number.isFinite(solvedAnswer),
    uniqueAnswer: true,
    calculatorFree:
      Number.isInteger(solvedAnswer) && solvedAnswer >= 1 && solvedAnswer <= 999,
    solvedAnswer: String(solvedAnswer),
  };
}

function generatePrivateInverseFunctionSubstitution() {
  const setting = pick([
    { inverseAt: 2, coefficient: 1, multiplier: 2 },
    { inverseAt: 2, coefficient: 3, multiplier: 3 },
    { inverseAt: 4, coefficient: 1, multiplier: 2 },
    { inverseAt: 4, coefficient: 2, multiplier: 3 },
  ]);
  const y = setting.inverseAt ** 3 + setting.coefficient * setting.inverseAt;
  const firstIntegral =
    setting.inverseAt ** 4 / 4 +
    (setting.coefficient * setting.inverseAt ** 2) / 2;
  const inverseIntegral = setting.inverseAt * y - firstIntegral;
  const answer = setting.multiplier * firstIntegral + inverseIntegral;

  return {
    problem: structuredShortAnswer({
      prompt:
        `양수 $c$에 대하여 $g_c(x)=x^3+cx$라 하고, $f_c$를 $g_c$의 역함수라 하자. ` +
        `$f_c(${y})=${setting.inverseAt}$일 때, ` +
        `$${setting.multiplier}\\displaystyle\\int_0^{${y}}xf_c'(x)\\,dx+` +
        `\\displaystyle\\int_0^{${y}}f_c(x)\\,dx$의 값을 구하시오.`,
      answer,
      solutionProcess: [
        {
          title: "역함수 조건으로 매개변수 정하기",
          expression:
            `$g_c(${setting.inverseAt})=${y}$이므로 $c=${setting.coefficient}$`,
          explanation: "$f_c(y)=a$와 $g_c(a)=y$가 서로 동치임을 사용합니다.",
        },
        {
          title: "첫 번째 적분을 원함수 변수로 치환하기",
          expression:
            `$A=\\displaystyle\\int_0^{${y}}xf_c'(x)\\,dx=` +
            `\\displaystyle\\int_0^{${setting.inverseAt}}g_c(t)\\,dt=${firstIntegral}$`,
          explanation:
            "$x=g_c(t)$로 두면 $f_c'(g_c(t))g_c'(t)=1$이므로 적분이 단순해집니다.",
        },
        {
          title: "역함수 넓이 관계 사용하기",
          expression:
            `$B=\\displaystyle\\int_0^{${y}}f_c(x)\\,dx=` +
            `${setting.inverseAt}\\cdot${y}-${firstIntegral}=${inverseIntegral}$`,
          explanation: "서로 역함수인 두 그래프가 만드는 직사각형 넓이 관계를 사용합니다.",
        },
        {
          title: "두 적분 결합하기",
          expression:
            `$${setting.multiplier}A+B=${setting.multiplier}\\cdot${firstIntegral}+${inverseIntegral}=${answer}$`,
          explanation: "앞 단계에서 계산한 값을 원래 식에 대입합니다.",
        },
      ],
      finalCheck:
        `$g_c'(x)=3x^2+${setting.coefficient}>0$이므로 역함수가 존재하고, 계산한 답은 3자리 이하 자연수입니다.`,
    }),
    parameters: {
      ...setting,
      y,
      firstIntegral,
      inverseIntegral,
      answer,
    },
    operationCount: 31,
    maxInteger: Math.max(y, answer),
  };
}

function validatePrivateInverseFunctionSubstitution(generated) {
  const setting = generated.parameters || {};
  const inverseAt = Number(setting.inverseAt);
  const y = Number(setting.y);
  const coefficient = (y - inverseAt ** 3) / inverseAt;
  const firstIntegral =
    inverseAt ** 4 / 4 + (coefficient * inverseAt ** 2) / 2;
  const inverseIntegral = inverseAt * y - firstIntegral;
  const solvedAnswer = Number(setting.multiplier) * firstIntegral + inverseIntegral;
  return {
    solvable:
      Number.isInteger(coefficient) &&
      coefficient > 0 &&
      Number.isFinite(solvedAnswer),
    uniqueAnswer: true,
    calculatorFree:
      Number.isInteger(solvedAnswer) && solvedAnswer >= 1 && solvedAnswer <= 999,
    solvedAnswer: String(solvedAnswer),
  };
}

const PRIVATE_MOCK_ABSTRACT_TYPES = Object.freeze({
  "killer-private-adjacent-product-recurrence": {
    label: "인접항 곱으로 단순화하는 점화식 역추론",
    category: "killer",
    arenaNaturalAnswerEligible: true,
    courseId: "algebra",
    referenceFamily: "sequence-recurrence",
    skillTags: ["점화식", "역수 수열", "등차수열", "매개변수 역추론"],
    difficultyScore: 0.96,
    expectedTimeMs: 10 * 60 * 1000,
    reasoningDepth: 5,
    similarGroupId: "private-abstract-adjacent-product-recurrence",
    researchCalibration: {
      sourceId: "PRIVATE-ARKE-2027-SEPTEMBER",
      sourceQuestionNumber: 29,
      usage: "ABSTRACT_STRUCTURE_AND_ACCURACY_ONLY",
    },
    generate: generatePrivateAdjacentProductRecurrence,
    validate: validatePrivateAdjacentProductRecurrence,
  },
  "killer-private-inverse-function-substitution": {
    label: "역함수 조건과 치환적분의 결합 추론",
    category: "killer",
    arenaNaturalAnswerEligible: true,
    courseId: "calculus-1",
    referenceFamily: "integral-defined-area",
    skillTags: ["역함수", "치환적분", "역함수 넓이", "매개변수 역추론"],
    difficultyScore: 0.98,
    expectedTimeMs: 10 * 60 * 1000,
    reasoningDepth: 5,
    similarGroupId: "private-abstract-inverse-function-substitution",
    researchCalibration: {
      sourceId: "PRIVATE-ARKE-2027-SEPTEMBER",
      sourceQuestionNumber: 30,
      usage: "ABSTRACT_STRUCTURE_AND_ACCURACY_ONLY",
    },
    generate: generatePrivateInverseFunctionSubstitution,
    validate: validatePrivateInverseFunctionSubstitution,
  },
});

module.exports = {
  PRIVATE_MOCK_ABSTRACT_TYPES,
  generatePrivateAdjacentProductRecurrence,
  generatePrivateInverseFunctionSubstitution,
  validatePrivateAdjacentProductRecurrence,
  validatePrivateInverseFunctionSubstitution,
};
