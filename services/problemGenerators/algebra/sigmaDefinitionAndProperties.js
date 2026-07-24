const {
  randomInteger,
  nonZeroInteger,
  round4,
  isCorrectAnswer,
  createAlgebraProblemType,
} = require("./helpers");

const problemTypes = [
  {
    id: "sigma-k",
    label: "유형 1 · Σk",
    difficulty: 1,

    generate() { const n = randomInteger(3, 12); let s = 0; for (let k = 1; k <= n; k++) s += k;
          return { prompt: `Σ_{k=1}^{${n}} k 를 구하세요.`, inputMode: "short-answer", answer: s, solution: `n(n+1)/2=${s}.` }; }
  },

  {
    id: "sigma-k2",
    label: "유형 2 · Σk²",
    difficulty: 2,

    generate() { const n = randomInteger(3, 9); let s = 0; for (let k = 1; k <= n; k++) s += k * k;
          return { prompt: `Σ_{k=1}^{${n}} k² 를 구하세요.`, inputMode: "short-answer", answer: s, solution: `n(n+1)(2n+1)/6=${s}.` }; }
  },

  {
    id: "sigma-k3",
    label: "유형 3 · Σk³",
    difficulty: 2,

    generate() { const n = randomInteger(2, 6); let s = 0; for (let k = 1; k <= n; k++) s += k ** 3;
          return { prompt: `Σ_{k=1}^{${n}} k³ 를 구하세요.`, inputMode: "short-answer", answer: s, solution: `{n(n+1)/2}²=${s}.` }; }
  },

  {
    id: "sigma-const",
    label: "유형 4 · Σ 상수",
    difficulty: 1,

    generate() { const n = randomInteger(3, 10), c = nonZeroInteger(-5, 5);
          return { prompt: `Σ_{k=1}^{${n}} ${c} 를 구하세요.`, inputMode: "short-answer", answer: c * n, solution: `${c}×${n}=${c * n}.` }; }
  },

  {
    id: "sigma-linear",
    label: "유형 5 · Σ(ak+b) 성질",
    difficulty: 2,

    generate() { const n = randomInteger(3, 8), a = randomInteger(2, 4), b = randomInteger(-3, 3); let s = 0; for (let k = 1; k <= n; k++) s += a * k + b;
          return { prompt: `Σ_{k=1}^{${n}} (${a}k + ${b}) 를 구하세요.`, inputMode: "short-answer", answer: s, solution: `${a}Σk+Σ${b}=${s}.` }; }
  },

  {
    id: "sigma-quad",
    label: "유형 6 · Σ(k²+k)",
    difficulty: 2,

    generate() { const n = randomInteger(3, 8); let s = 0; for (let k = 1; k <= n; k++) s += k * k + k;
          return { prompt: `Σ_{k=1}^{${n}} (k² + k) 를 구하세요.`, inputMode: "short-answer", answer: s, solution: `Σk²+Σk=${s}.` }; }
  },

  {
    id: "sigma-odd",
    label: "유형 7 · Σ(2k−1)=n²",
    difficulty: 2,

    generate() { const n = randomInteger(3, 10); let s = 0; for (let k = 1; k <= n; k++) s += 2 * k - 1;
          return { prompt: `Σ_{k=1}^{${n}} (2k−1) 를 구하세요.`, inputMode: "short-answer", answer: s, solution: `홀수의 합=n²=${s}.` }; }
  },

  {
    id: "sigma-product",
    label: "유형 8 · Σk(k+1)",
    difficulty: 3,

    generate() { const n = randomInteger(3, 7); let s = 0; for (let k = 1; k <= n; k++) s += k * (k + 1);
          return { prompt: `Σ_{k=1}^{${n}} k(k+1) 를 구하세요.`, inputMode: "short-answer", answer: s, solution: `Σk²+Σk=${s}.` }; }
  },

  {
    id: "sigma-shift",
    label: "유형 9 · Σ(k+상수)",
    difficulty: 2,

    generate() { const n = randomInteger(3, 9), c = randomInteger(1, 5); let s = 0; for (let k = 1; k <= n; k++) s += k + c;
          return { prompt: `Σ_{k=1}^{${n}} (k + ${c}) 를 구하세요.`, inputMode: "short-answer", answer: s, solution: `Σk + ${c}n = ${s}.` }; }
  },

  {
    id: "sigma-geo",
    label: "유형 10 · Σ 2ᵏ",
    difficulty: 3,

    generate() { const n = randomInteger(2, 8); let s = 0; for (let k = 1; k <= n; k++) s += 2 ** k;
          return { prompt: `Σ_{k=1}^{${n}} 2ᵏ 를 구하세요.`, inputMode: "short-answer", answer: s, solution: `2^(n+1)−2=${s}.` }; }
  },
].map((problemType) =>
  createAlgebraProblemType(problemType, {
    conceptId: "algebra-03-04",
    conceptTitle: "시그마(Σ)의 뜻과 성질",
  })
);

module.exports = {
  key: "algebra-sigma-definition-and-properties",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
