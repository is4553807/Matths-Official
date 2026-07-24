const {
  randomInteger,
  nonZeroInteger,
  round4,
  isCorrectAnswer,
  createAlgebraProblemType,
} = require("./helpers");

const problemTypes = [
  {
    id: "log-def",
    label: "유형 1 · 로그의 정의",
    difficulty: 1,

    generate() { const a = randomInteger(2, 5), k = randomInteger(1, 4);
          return { prompt: `log_${a} ${a ** k} 의 값을 구하세요.`, inputMode: "short-answer", answer: k,
            solution: `${a}^${k}=${a ** k} → ${k}.` }; }
  },

  {
    id: "log-eq-def",
    label: "유형 2 · 로그의 정의(진수 구하기)",
    difficulty: 1,

    generate() { const a = randomInteger(2, 4), k = randomInteger(1, 4);
          return { prompt: `log_${a} x = ${k} 일 때 x 를 구하세요.`, inputMode: "short-answer", answer: a ** k,
            solution: `x=${a}^${k}=${a ** k}.` }; }
  },

  {
    id: "log-sum",
    label: "유형 3 · 로그의 합",
    difficulty: 2,

    generate() { const a = randomInteger(2, 3), m = randomInteger(1, 3), n = randomInteger(1, 3);
          return { prompt: `log_${a} ${a ** m} + log_${a} ${a ** n} 의 값을 구하세요.`, inputMode: "short-answer", answer: m + n,
            solution: `곱의 로그=합 → ${m}+${n}=${m + n}.` }; }
  },

  {
    id: "log-diff",
    label: "유형 4 · 로그의 차",
    difficulty: 2,

    generate() { const a = randomInteger(2, 3), m = randomInteger(3, 5), n = randomInteger(1, 2);
          return { prompt: `log_${a} ${a ** m} − log_${a} ${a ** n} 의 값을 구하세요.`, inputMode: "short-answer", answer: m - n,
            solution: `나눗셈의 로그=차 → ${m}−${n}=${m - n}.` }; }
  },

  {
    id: "log-power",
    label: "유형 5 · 로그와 지수(계수)",
    difficulty: 2,

    generate() { const a = randomInteger(2, 4), k = randomInteger(2, 4), p = randomInteger(2, 3);
          return { prompt: `log_${a} (${a ** k})^${p} 의 값을 구하세요.`, inputMode: "short-answer", answer: k * p,
            solution: `진수의 지수는 앞으로: ${p}×${k}=${k * p}.` }; }
  },

  {
    id: "log-one-zero",
    label: "유형 6 · log_a 1, log_a a",
    difficulty: 1,

    generate() { const a = randomInteger(2, 9), one = Math.random() < 0.5;
          return { prompt: `log_${a} ${one ? 1 : a} 의 값을 구하세요.`, inputMode: "short-answer", answer: one ? 0 : 1,
            solution: one ? `log_a 1 = 0.` : `log_a a = 1.` }; }
  },

  {
    id: "change-base",
    label: "유형 7 · 밑변환",
    difficulty: 3,

    generate() { const s = randomInteger(1, 3); let t = randomInteger(1, 4); while (t === s) t = randomInteger(1, 4);
          return { prompt: `log_${2 ** s} ${2 ** t} 의 값을 구하세요. (소수 가능)`, inputMode: "short-answer", answer: t / s,
            solution: `밑을 2로: (${t})/(${s})=${(t / s).toFixed(4)}.` }; }
  },

  {
    id: "log-value-combo",
    label: "유형 8 · 로그 성질 종합",
    difficulty: 3,

    generate() { const a = randomInteger(2, 3), m = randomInteger(1, 3), n = randomInteger(1, 3);
          return { prompt: `log_${a} ${a ** m} + log_${a} ${a ** n} − log_${a} ${a} 의 값을 구하세요.`, inputMode: "short-answer", answer: m + n - 1,
            solution: `${m}+${n}−1=${m + n - 1}.` }; }
  },

  {
    id: "log-inverse",
    label: "유형 9 · a^(log 값)",
    difficulty: 3,

    generate() { const a = randomInteger(2, 3), k = randomInteger(1, 3);
          return { prompt: `${a}^(log_${a} ${a ** k}) 의 값을 구하세요.`, inputMode: "short-answer", answer: a ** k,
            solution: `log_${a} ${a ** k}=${k} → ${a}^${k}=${a ** k}.` }; }
  },

  {
    id: "log-domain",
    label: "유형 10 · 로그의 정의 조건",
    difficulty: 2,

    generate() {
      const shift = randomInteger(-4, 4);
      const inside =
        shift === 0
          ? "x"
          : shift > 0
            ? `x-${shift}`
            : `x+${Math.abs(shift)}`;

      return {
        prompt:
          `log_a(${inside}) 가 정의되기 위한 x 의 조건은?`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "positive",
            text: `x > ${shift}`,
          },
          {
            key: "nonnegative",
            text: `x ≥ ${shift}`,
          },
          {
            key: "opposite",
            text: `x < ${shift}`,
          },
        ],
        answer: "positive",
        solution:
          `진수는 양수여야 하므로 ${inside}>0, 즉 x>${shift}.`,
      };
    }
  },
].map((problemType) =>
  createAlgebraProblemType(problemType, {
    conceptId: "algebra-01-04",
    conceptTitle: "로그의 뜻과 성질",
  })
);

module.exports = {
  key: "algebra-logarithm-definition-and-properties",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
