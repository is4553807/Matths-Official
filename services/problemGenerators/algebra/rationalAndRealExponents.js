const {
  randomInteger,
  nonZeroInteger,
  round4,
  isCorrectAnswer,
  createAlgebraProblemType,
} = require("./helpers");

const problemTypes = [
  {
    id: "rational-exp",
    label: "유형 1 · 유리수 지수의 값",
    difficulty: 2,

    generate() { const b = randomInteger(2, 3), n = randomInteger(2, 3), m = randomInteger(1, 2), a = b ** n;
          return { prompt: `${a}^(${m}/${n}) 의 값을 구하세요.`, inputMode: "short-answer", answer: b ** m,
            solution: `${a}=${b}^${n} → (${b}^${n})^(${m}/${n})=${b}^${m}=${b ** m}.` }; }
  },

  {
    id: "negative-exp",
    label: "유형 2 · 음의 지수",
    difficulty: 1,

    generate() { const b = randomInteger(2, 5), n = randomInteger(1, 3);
          return { prompt: `${b}^(−${n}) 의 값을 구하세요. (소수로 입력)`, inputMode: "short-answer", answer: 1 / b ** n,
            solution: `${b}^(−${n})=1/${b ** n}=${(1 / b ** n).toFixed(4)}.` }; }
  },

  {
    id: "rational-notation",
    label: "유형 3 · 유리수 지수 ↔ 근호 표현",
    difficulty: 2,

    generate() { const p = randomInteger(2, 3), q = randomInteger(2, 3);
          return { prompt: `a^(${p}/${q}) 를 근호로 바르게 나타낸 것은?`, inputMode: "multiple-choice",
            choices: [{ key: "ok", text: `${q}제곱근 (a^${p})` }, { key: "no", text: `${p}제곱근 (a^${q})` }], answer: "ok",
            solution: `a^(m/n)=n제곱근(a^m) 이므로 ${q}제곱근(a^${p}).` }; }
  },

  {
    id: "product-rational",
    label: "유형 4 · 유리수 지수의 곱",
    difficulty: 2,

    generate() { const b = randomInteger(2, 4), a = b ** 2;
          return { prompt: `${a}^(1/2) × ${a}^(1/2) 의 값을 구하세요.`, inputMode: "short-answer", answer: a,
            solution: `지수를 더하면 ${a}^1=${a}.` }; }
  },

  {
    id: "power-of-power",
    label: "유형 5 · 유리수 지수의 거듭제곱",
    difficulty: 2,

    generate() { const b = randomInteger(2, 3), a = b ** 2;
          return { prompt: `(${a}^(1/2))^4 의 값을 구하세요.`, inputMode: "short-answer", answer: a ** 2,
            solution: `지수를 곱하면 ${a}^2=${a ** 2}.` }; }
  },

  {
    id: "eighth",
    label: "유형 6 · a^(m/n) 계산",
    difficulty: 2,

    generate() { const b = randomInteger(2, 3), n = randomInteger(2, 3), a = b ** n, m = randomInteger(2, 3);
          return { prompt: `${a}^(${m}/${n}) 의 값을 구하세요.`, inputMode: "short-answer", answer: b ** m,
            solution: `(${b}^${n})^(${m}/${n})=${b}^${m}=${b ** m}.` }; }
  },

  {
    id: "reciprocal-neg",
    label: "유형 7 · (1/a)^(−n)",
    difficulty: 2,

    generate() { const a = randomInteger(2, 4), n = randomInteger(1, 3);
          return { prompt: `(1/${a})^(−${n}) 의 값을 구하세요.`, inputMode: "short-answer", answer: a ** n,
            solution: `(1/${a})^(−${n})=${a}^${n}=${a ** n}.` }; }
  },

  {
    id: "compare-rational",
    label: "유형 8 · 유리수 지수 대소",
    difficulty: 2,

    generate() { const a = randomInteger(2, 4);
          return { prompt: `a=${a}(>1) 일 때 a^(2/3) 와 a^(1/2) 중 큰 값은?`, inputMode: "multiple-choice",
            choices: [{ key: "a", text: "a^(2/3)" }, { key: "b", text: "a^(1/2)" }], answer: "a",
            solution: `2/3 > 1/2 이고 밑>1 이므로 a^(2/3)가 큽니다.` }; }
  },

  {
    id: "zero-exp",
    label: "유형 9 · 지수 0",
    difficulty: 1,

    generate() { const a = nonZeroInteger(2, 9);
          return { prompt: `${a}^0 의 값을 구하세요.`, inputMode: "short-answer", answer: 1,
            solution: `0이 아닌 수의 0제곱은 항상 1.` }; }
  },

  {
    id: "root-exp-mix",
    label: "유형 10 · 근호·지수 혼합",
    difficulty: 3,

    generate() { const b = randomInteger(2, 3), a = b ** 6;
          return { prompt: `${a}^(1/6) × ${a}^(1/3) 의 값을 구하세요.`, inputMode: "short-answer", answer: b ** 3,
            solution: `지수합 1/6+1/3=1/2 → ${a}^(1/2)=${b ** 3}.` }; }
  },
].map((problemType) =>
  createAlgebraProblemType(problemType, {
    conceptId: "algebra-01-02",
    conceptTitle: "유리수·실수 지수로의 확장",
  })
);

module.exports = {
  key: "algebra-rational-and-real-exponents",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
