const {
  randomInteger,
  nonZeroInteger,
  round4,
  isCorrectAnswer,
  createAlgebraProblemType,
} = require("./helpers");

const problemTypes = [
  {
    id: "law-mult",
    label: "유형 1 · 지수의 곱셈법칙",
    difficulty: 1,

    generate() { const b = randomInteger(2, 5), m = randomInteger(2, 5), n = randomInteger(2, 5);
          return { prompt: `${b}^${m} × ${b}^${n} = ${b}^k 일 때 k 를 구하세요.`, inputMode: "short-answer", answer: m + n,
            solution: `지수를 더함: ${m}+${n}=${m + n}.` }; }
  },

  {
    id: "law-div",
    label: "유형 2 · 지수의 나눗셈법칙",
    difficulty: 1,

    generate() { const b = randomInteger(2, 5), m = randomInteger(4, 8), n = randomInteger(1, 3);
          return { prompt: `${b}^${m} ÷ ${b}^${n} = ${b}^k 일 때 k 를 구하세요.`, inputMode: "short-answer", answer: m - n,
            solution: `지수를 뺌: ${m}−${n}=${m - n}.` }; }
  },

  {
    id: "law-power",
    label: "유형 3 · 지수의 거듭제곱법칙",
    difficulty: 1,

    generate() { const b = randomInteger(2, 4), m = randomInteger(2, 4), n = randomInteger(2, 4);
          return { prompt: `(${b}^${m})^${n} = ${b}^k 일 때 k 를 구하세요.`, inputMode: "short-answer", answer: m * n,
            solution: `지수를 곱함: ${m}×${n}=${m * n}.` }; }
  },

  {
    id: "law-product-base",
    label: "유형 4 · 곱의 거듭제곱",
    difficulty: 2,

    generate() { const a = randomInteger(2, 3), b = randomInteger(2, 3), n = randomInteger(2, 3);
          return { prompt: `(${a}×${b})^${n} 의 값을 구하세요.`, inputMode: "short-answer", answer: (a * b) ** n,
            solution: `(${a}×${b})^${n}=${a}^${n}×${b}^${n}=${(a * b) ** n}.` }; }
  },

  {
    id: "law-value",
    label: "유형 5 · 지수법칙 값 계산",
    difficulty: 2,

    generate() { const b = randomInteger(2, 3), m = randomInteger(1, 3), n = randomInteger(1, 3);
          return { prompt: `${b}^${m} × ${b}^${n} 의 값을 구하세요.`, inputMode: "short-answer", answer: b ** (m + n),
            solution: `${b}^${m + n}=${b ** (m + n)}.` }; }
  },

  {
    id: "law-neg-combine",
    label: "유형 6 · 음의 지수 포함 계산",
    difficulty: 2,

    generate() { const b = randomInteger(2, 4), m = randomInteger(3, 6), n = randomInteger(1, 2);
          return { prompt: `${b}^${m} × ${b}^(−${n}) 의 값을 구하세요.`, inputMode: "short-answer", answer: b ** (m - n),
            solution: `지수합 ${m}−${n}=${m - n} → ${b ** (m - n)}.` }; }
  },

  {
    id: "law-frac-exp",
    label: "유형 7 · 지수법칙과 유리수 지수",
    difficulty: 2,

    generate() { const b = randomInteger(2, 3), a = b ** 2;
          return { prompt: `${a}^(3/2) 의 값을 구하세요.`, inputMode: "short-answer", answer: b ** 3,
            solution: `(${b}^2)^(3/2)=${b}^3=${b ** 3}.` }; }
  },

  {
    id: "law-simplify-exp",
    label: "유형 8 · 지수 간단히(지수 구하기)",
    difficulty: 2,

    generate() { const b = randomInteger(2, 4), m = randomInteger(2, 4), n = randomInteger(2, 4), p = randomInteger(1, 3);
          return { prompt: `(${b}^${m})^${n} ÷ ${b}^${p} = ${b}^k 일 때 k 를 구하세요.`, inputMode: "short-answer", answer: m * n - p,
            solution: `${m}×${n}−${p}=${m * n - p}.` }; }
  },

  {
    id: "law-base-swap",
    label: "유형 9 · 밑이 거듭제곱인 경우",
    difficulty: 3,

    generate() { const n = randomInteger(2, 4); // 4^n = 2^(2n) → 지수 2n
          return { prompt: `4^${n} = 2^k 일 때 k 를 구하세요.`, inputMode: "short-answer", answer: 2 * n,
            solution: `4=2² 이므로 4^${n}=2^(2×${n})=2^${2 * n}.` }; }
  },

  {
    id: "law-mixed-value",
    label: "유형 10 · 지수법칙 종합",
    difficulty: 3,

    generate() { const b = randomInteger(2, 3); // b^2 * b^3 / b = b^4
          return { prompt: `${b}² × ${b}³ ÷ ${b} 의 값을 구하세요.`, inputMode: "short-answer", answer: b ** 4,
            solution: `지수합 2+3−1=4 → ${b}^4=${b ** 4}.` }; }
  },
].map((problemType) =>
  createAlgebraProblemType(problemType, {
    conceptId: "algebra-01-03",
    conceptTitle: "지수법칙",
  })
);

module.exports = {
  key: "algebra-exponent-laws",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
