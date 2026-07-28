const {
  randomInteger,
  nonZeroInteger,
  round4,
  isCorrectAnswer,
  createAlgebraProblemType,
} = require("./helpers");

const problemTypes = [
  {
    id: "common-def",
    label: "유형 1 · 상용로그의 값",
    difficulty: 1,

    generate() { const k = randomInteger(0, 5);
          return { prompt: `log 10^${k} 의 값을 구하세요. (밑 10)`, inputMode: "short-answer", answer: k,
            solution: `log 10^${k}=${k}.` }; }
  },

  {
    id: "characteristic",
    label: "유형 2 · 지표",
    difficulty: 2,

    generate() { const k = randomInteger(1, 6);
          return { prompt: `10^${k} ≤ N < 10^${k + 1} 인 자연수 N 에 대한 log N 의 지표를 구하세요.`, inputMode: "short-answer", answer: k,
            solution: `지표=${k}.` }; }
  },

  {
    id: "digits",
    label: "유형 3 · 자릿수",
    difficulty: 2,

    generate() { const k = randomInteger(1, 7);
          return { prompt: `log N 의 지표가 ${k} 인 자연수 N 의 자릿수를 구하세요.`, inputMode: "short-answer", answer: k + 1,
            solution: `자릿수=지표+1=${k + 1}.` }; }
  },

  {
    id: "leading-zeros",
    label: "유형 4 · 소수 부분의 위치",
    difficulty: 3,

    generate() { const k = randomInteger(1, 5);
          return { prompt: `양수 N 의 log N 의 지표가 −${k} 일 때, N 은 소수점 아래 몇째 자리에서 처음으로 0이 아닌 숫자가 나오나요?`, inputMode: "short-answer", answer: k,
            solution: `지표 −${k} 이면 소수 ${k}째 자리에서 처음 유효숫자 등장.` }; }
  },

  {
    id: "log-power-common",
    label: "유형 5 · 상용로그의 거듭제곱 계산",
    difficulty: 1,

    generate() { const a = randomInteger(1, 4), k = randomInteger(1, 4);
          return { prompt: `log 10^${a} + log 10^${k} 의 값을 구하세요.`, inputMode: "short-answer", answer: a + k,
            solution: `${a}+${k}=${a + k}.` }; }
  },

  {
    id: "sound-model",
    label: "유형 6 · 상용로그 활용(모델)",
    difficulty: 2,

    generate() { const k = randomInteger(1, 4);
          return { prompt: `어떤 양이 L = 10·log(10^${k}) 로 주어질 때 L 의 값을 구하세요.`, inputMode: "short-answer", answer: 10 * k,
            solution: `log(10^${k})=${k} → L=10×${k}=${10 * k}.` }; }
  },

  {
    id: "compare-common",
    label: "유형 7 · 상용로그 대소",
    difficulty: 2,

    generate() { let a = randomInteger(1, 5), b = randomInteger(1, 5); while (a === b) b = randomInteger(1, 5);
          return { prompt: `log 10^${a} 와 log 10^${b} 중 더 큰 값은?`, inputMode: "multiple-choice",
            choices: [{ key: "a", text: `log 10^${a}` }, { key: "b", text: `log 10^${b}` }], answer: a > b ? "a" : "b",
            solution: `지수가 큰 쪽이 큽니다.` }; }
  },

  {
    id: "digits-power",
    label: "유형 8 · 10의 거듭제곱 자릿수",
    difficulty: 2,

    generate() { const k = randomInteger(1, 6);
          return { prompt: `10^${k} 은 몇 자리 자연수인가요?`, inputMode: "short-answer", answer: k + 1,
            solution: `10^${k} 은 ${k + 1}자리.` }; }
  },

  {
    id: "log-add-common",
    label: "유형 9 · 상용로그의 합",
    difficulty: 2,

    generate() {
      const variants = [
        { left: 2, right: 5, power: 1 },
        { left: 4, right: 25, power: 2 },
        { left: 8, right: 125, power: 3 },
        { left: 20, right: 5, power: 2 },
        { left: 40, right: 25, power: 3 },
      ];
      const variant =
        variants[
          randomInteger(0, variants.length - 1)
        ];

      return {
        prompt:
          `log ${variant.left} + log ${variant.right} 의 값을 구하세요.`,
        inputMode: "short-answer",
        answer: variant.power,
        solution:
          `log ${variant.left}+log ${variant.right}` +
          `=log(${variant.left}×${variant.right})` +
          `=log 10^${variant.power}=${variant.power}.`,
      };
    }
  },

  {
    id: "log-value-known",
    label: "유형 10 · 주어진 로그값 활용",
    difficulty: 3,

    generate() { const n = randomInteger(2, 5);
          return { prompt: `log 2 = 0.3010 일 때 log 2^${n} 의 값을 구하세요. (소수)`, inputMode: "short-answer", answer: Number((0.3010 * n).toFixed(4)),
            solution: `log 2^${n}=${n}×0.3010=${(0.3010 * n).toFixed(4)}.` }; }
  },
].map((problemType) =>
  createAlgebraProblemType(problemType, {
    conceptId: "algebra-01-05",
    conceptTitle: "상용로그의 활용",
  })
);

module.exports = {
  key: "algebra-common-logarithm-applications",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
