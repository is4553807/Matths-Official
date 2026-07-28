const {
  randomInteger,
  nonZeroInteger,
  round4,
  isCorrectAnswer,
  createAlgebraProblemType,
} = require("./helpers");

const problemTypes = [
  {
    id: "nth-term-linear",
    label: "유형 1 · 일반항 대입(일차)",
    difficulty: 1,

    generate() { const p = nonZeroInteger(-4, 4), q = randomInteger(-5, 5), n = randomInteger(2, 9);
          return { prompt: `수열의 일반항이 a_n=${p}n+${q} 일 때 a_${n} 을 구하세요.`, inputMode: "short-answer", answer: p * n + q,
            solution: `a_${n}=${p}×${n}+${q}=${p * n + q}.` }; }
  },

  {
    id: "nth-term-square",
    label: "유형 2 · 일반항 대입(제곱)",
    difficulty: 1,

    generate() { const n = randomInteger(2, 8);
          return { prompt: `a_n=n² 일 때 a_${n} 을 구하세요.`, inputMode: "short-answer", answer: n * n,
            solution: `a_${n}=${n}²=${n * n}.` }; }
  },

  {
    id: "first-term",
    label: "유형 3 · 첫째항 구하기",
    difficulty: 1,

    generate() { const p = nonZeroInteger(-4, 4), q = randomInteger(-5, 5);
          return { prompt: `a_n=${p}n+${q} 인 수열의 첫째항 a₁ 을 구하세요.`, inputMode: "short-answer", answer: p + q,
            solution: `a₁=${p}+${q}=${p + q}.` }; }
  },

  {
    id: "nth-term-product",
    label: "유형 4 · 일반항 n(n+1)",
    difficulty: 2,

    generate() { const n = randomInteger(2, 7);
          return { prompt: `a_n=n(n+1) 일 때 a_${n} 을 구하세요.`, inputMode: "short-answer", answer: n * (n + 1),
            solution: `a_${n}=${n}×${n + 1}=${n * (n + 1)}.` }; }
  },

  {
    id: "term-index",
    label: "유형 5 · 항 번호 찾기",
    difficulty: 2,

    generate() { const p = randomInteger(2, 5), q = randomInteger(-3, 3), n = randomInteger(3, 10), v = p * n + q;
          return { prompt: `a_n=${p}n+${q} 일 때 a_n=${v} 를 만족하는 n 을 구하세요.`, inputMode: "short-answer", answer: n,
            solution: `${p}n+${q}=${v} → n=${n}.` }; }
  },

  {
    id: "alternating",
    label: "유형 6 · 교대수열",
    difficulty: 2,

    generate() { const n = randomInteger(2, 8); const v = (n % 2 === 0 ? 1 : -1) * n;
          return { prompt: `a_n=(−1)ⁿ·n 일 때 a_${n} 을 구하세요.`, inputMode: "short-answer", answer: v,
            solution: `(−1)^${n}×${n}=${v}.` }; }
  },

  {
    id: "power-term",
    label: "유형 7 · 일반항 2ⁿ",
    difficulty: 2,

    generate() { const n = randomInteger(2, 8);
          return { prompt: `a_n=2ⁿ 일 때 a_${n} 을 구하세요.`, inputMode: "short-answer", answer: 2 ** n,
            solution: `2^${n}=${2 ** n}.` }; }
  },

  {
    id: "next-term-pattern",
    label: "유형 8 · 규칙 찾아 다음 항",
    difficulty: 1,

    generate() { const a1 = randomInteger(1, 5), d = randomInteger(2, 5); const seq = [a1, a1 + d, a1 + 2 * d, a1 + 3 * d];
          return { prompt: `수열 ${seq[0]}, ${seq[1]}, ${seq[2]}, ${seq[3]}, ... 의 다음 항을 구하세요.`, inputMode: "short-answer", answer: a1 + 4 * d,
            solution: `공차 ${d}씩 증가 → ${a1 + 4 * d}.` }; }
  },

  {
    id: "an-from-Sn",
    label: "유형 9 · S_n − S_{n-1} = a_n",
    difficulty: 3,

    generate() { const n = randomInteger(2, 7); const S = (k) => k * k; // S_n=n² → a_n=2n-1
          return { prompt: `수열의 부분합이 S_n=n² 일 때 a_${n} 을 구하세요. (단 n≥2, a_n=S_n−S_{n−1})`, inputMode: "short-answer", answer: S(n) - S(n - 1),
            solution: `a_${n}=S_${n}−S_${n - 1}=${S(n)}−${S(n - 1)}=${S(n) - S(n - 1)}.` }; }
  },

  {
    id: "nth-term-value",
    label: "유형 10 · 일반항의 값 계산",
    difficulty: 1,

    generate() { const A = nonZeroInteger(-5, 5), B = randomInteger(-5, 5), n = randomInteger(2, 9);
          return { prompt: `a_n=${A}n+${B} 일 때 a_${n} 을 구하세요.`, inputMode: "short-answer", answer: A * n + B,
            solution: `${A}×${n}+${B}=${A * n + B}.` }; }
  },
].map((problemType) =>
  createAlgebraProblemType(problemType, {
    conceptId: "algebra-03-01",
    conceptTitle: "수열의 뜻",
  })
);

module.exports = {
  key: "algebra-sequence-basics",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
