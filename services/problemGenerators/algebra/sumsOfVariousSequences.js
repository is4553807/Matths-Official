const {
  randomInteger,
  nonZeroInteger,
  round4,
  isCorrectAnswer,
  createAlgebraProblemType,
} = require("./helpers");

const problemTypes = [
  {
    id: "tele-1",
    label: "유형 1 · Σ1/(k(k+1))",
    difficulty: 3,

    generate() { const n = randomInteger(3, 9); let s = 0; for (let k = 1; k <= n; k++) s += 1 / (k * (k + 1));
          return { prompt: `Σ_{k=1}^{${n}} 1/(k(k+1)) 를 구하세요. (소수)`, inputMode: "short-answer", answer: round4(s), solution: `1−1/${n + 1}=${round4(s)}.` }; }
  },

  {
    id: "tele-2",
    label: "유형 2 · Σ1/((2k−1)(2k+1))",
    difficulty: 3,

    generate() { const n = randomInteger(3, 8); let s = 0; for (let k = 1; k <= n; k++) s += 1 / ((2 * k - 1) * (2 * k + 1));
          return { prompt: `Σ_{k=1}^{${n}} 1/((2k−1)(2k+1)) 를 구하세요. (소수)`, inputMode: "short-answer", answer: round4(s), solution: `½(1−1/${2 * n + 1})=${round4(s)}.` }; }
  },

  {
    id: "tele-3",
    label: "유형 3 · Σ1/(k(k+2))",
    difficulty: 3,

    generate() { const n = randomInteger(3, 8); let s = 0; for (let k = 1; k <= n; k++) s += 1 / (k * (k + 2));
          return { prompt: `Σ_{k=1}^{${n}} 1/(k(k+2)) 를 구하세요. (소수)`, inputMode: "short-answer", answer: round4(s), solution: `부분분수로 망원합=${round4(s)}.` }; }
  },

  {
    id: "sum-kk1-closed",
    label: "유형 4 · Σk(k+1)의 값",
    difficulty: 2,

    generate() { const n = randomInteger(3, 7); let s = 0; for (let k = 1; k <= n; k++) s += k * (k + 1);
          return { prompt: `Σ_{k=1}^{${n}} k(k+1) 를 구하세요.`, inputMode: "short-answer", answer: s, solution: `n(n+1)(n+2)/3=${s}.` }; }
  },

  {
    id: "sum-2k1",
    label: "유형 5 · Σ(2k+1)",
    difficulty: 2,

    generate() { const n = randomInteger(3, 9); let s = 0; for (let k = 1; k <= n; k++) s += 2 * k + 1;
          return { prompt: `Σ_{k=1}^{${n}} (2k+1) 를 구하세요.`, inputMode: "short-answer", answer: s, solution: `n²+2n=${s}.` }; }
  },

  {
    id: "sum-partial-terms",
    label: "유형 6 · 부분합의 차",
    difficulty: 3,

    generate() { const n = randomInteger(3, 7); let s = 0; for (let k = 1; k <= n; k++) s += k * k;
          return { prompt: `Σ_{k=1}^{${n}} k² 의 값을 구하세요.`, inputMode: "short-answer", answer: s, solution: `n(n+1)(2n+1)/6=${s}.` }; }
  },

  {
    id: "sum-arith-geo-mix",
    label: "유형 7 · Σ(3k−2)",
    difficulty: 2,

    generate() { const n = randomInteger(3, 9); let s = 0; for (let k = 1; k <= n; k++) s += 3 * k - 2;
          return { prompt: `Σ_{k=1}^{${n}} (3k−2) 를 구하세요.`, inputMode: "short-answer", answer: s, solution: `3Σk−2n=${s}.` }; }
  },

  {
    id: "sum-square-diff",
    label: "유형 8 · Σ(k²−1)",
    difficulty: 2,

    generate() { const n = randomInteger(3, 8); let s = 0; for (let k = 1; k <= n; k++) s += k * k - 1;
          return { prompt: `Σ_{k=1}^{${n}} (k²−1) 를 구하세요.`, inputMode: "short-answer", answer: s, solution: `Σk²−n=${s}.` }; }
  },

  {
    id: "sum-tele-frac",
    label: "유형 9 · Σ(1/k − 1/(k+1))",
    difficulty: 3,

    generate() { const n = randomInteger(3, 9); const s = 1 - 1 / (n + 1);
          return { prompt: `Σ_{k=1}^{${n}} (1/k − 1/(k+1)) 를 구하세요. (소수)`, inputMode: "short-answer", answer: round4(s), solution: `망원합=1−1/${n + 1}=${round4(s)}.` }; }
  },

  {
    id: "sum-cubes-value",
    label: "유형 10 · Σk³ 값",
    difficulty: 2,

    generate() { const n = randomInteger(2, 6); let s = 0; for (let k = 1; k <= n; k++) s += k ** 3;
          return { prompt: `Σ_{k=1}^{${n}} k³ 를 구하세요.`, inputMode: "short-answer", answer: s, solution: `{n(n+1)/2}²=${s}.` }; }
  },
].map((problemType) =>
  createAlgebraProblemType(problemType, {
    conceptId: "algebra-03-05",
    conceptTitle: "여러 가지 수열의 합",
  })
);

module.exports = {
  key: "algebra-sums-of-various-sequences",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
