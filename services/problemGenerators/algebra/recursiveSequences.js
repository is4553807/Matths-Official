const {
  randomInteger,
  nonZeroInteger,
  round4,
  iterate,
  isCorrectAnswer,
  createAlgebraProblemType,
} = require("./helpers");

const problemTypes = [
  {
    id: "rec-add",
    label: "유형 1 · a_{n+1}=a_n+d",
    difficulty: 1,

    generate() { const a1 = randomInteger(1, 6), d = nonZeroInteger(-3, 4); const a3 = iterate(a1, (a) => a + d, 3);
          return { prompt: `a₁=${a1}, a_{n+1}=a_n+${d} 일 때 a₃ 을 구하세요.`, inputMode: "short-answer", answer: a3, solution: `a₂=${a1 + d}, a₃=${a3}.` }; }
  },

  {
    id: "rec-mult",
    label: "유형 2 · a_{n+1}=r·a_n",
    difficulty: 2,

    generate() { const a1 = randomInteger(1, 4), r = randomInteger(2, 3); const a3 = iterate(a1, (a) => a * r, 3);
          return { prompt: `a₁=${a1}, a_{n+1}=${r}·a_n 일 때 a₃ 을 구하세요.`, inputMode: "short-answer", answer: a3, solution: `a₂=${a1 * r}, a₃=${a3}.` }; }
  },

  {
    id: "rec-add-n",
    label: "유형 3 · a_{n+1}=a_n+2n",
    difficulty: 2,

    generate() { const a1 = randomInteger(1, 5); const a4 = iterate(a1, (a, n) => a + 2 * n, 4);
          return { prompt: `a₁=${a1}, a_{n+1}=a_n+2n 일 때 a₄ 를 구하세요.`, inputMode: "short-answer", answer: a4, solution: `순서대로 계산하면 a₄=${a4}.` }; }
  },

  {
    id: "rec-affine",
    label: "유형 4 · a_{n+1}=2a_n+1",
    difficulty: 2,

    generate() { const a1 = randomInteger(1, 4); const a3 = iterate(a1, (a) => 2 * a + 1, 3);
          return { prompt: `a₁=${a1}, a_{n+1}=2a_n+1 일 때 a₃ 을 구하세요.`, inputMode: "short-answer", answer: a3, solution: `a₂=${2 * a1 + 1}, a₃=${a3}.` }; }
  },

  {
    id: "rec-fib",
    label: "유형 5 · a_{n+2}=a_{n+1}+a_n",
    difficulty: 3,

    generate() { const a1 = randomInteger(1, 4), a2 = randomInteger(1, 5); const a4 = (a1 + a2) + a2; // a3=a2+a1, a4=a3+a2
          return { prompt: `a₁=${a1}, a₂=${a2}, a_{n+2}=a_{n+1}+a_n 일 때 a₄ 를 구하세요.`, inputMode: "short-answer", answer: a4, solution: `a₃=${a1 + a2}, a₄=${a4}.` }; }
  },

  {
    id: "rec-add5",
    label: "유형 6 · 다섯째항 구하기",
    difficulty: 2,

    generate() { const a1 = randomInteger(1, 5), d = nonZeroInteger(1, 4); const a5 = iterate(a1, (a) => a + d, 5);
          return { prompt: `a₁=${a1}, a_{n+1}=a_n+${d} 일 때 a₅ 를 구하세요.`, inputMode: "short-answer", answer: a5, solution: `a₅=${a5}.` }; }
  },

  {
    id: "rec-known-two",
    label: "유형 7 · 두 항 주어진 등차형",
    difficulty: 2,

    generate() { const a1 = randomInteger(1, 5), d = nonZeroInteger(1, 4); const a4 = iterate(a1, (a) => a + d, 4);
          return { prompt: `a₁=${a1}, a₂=${a1 + d}, 공차가 일정할 때 a₄ 를 구하세요.`, inputMode: "short-answer", answer: a4, solution: `공차 ${d} → a₄=${a4}.` }; }
  },

  {
    id: "rec-half",
    label: "유형 8 · a_{n+1}=a_n/2",
    difficulty: 2,

    generate() { const a1 = 8 * randomInteger(1, 3); const a3 = iterate(a1, (a) => a / 2, 3);
          return { prompt: `a₁=${a1}, a_{n+1}=a_n/2 일 때 a₃ 을 구하세요.`, inputMode: "short-answer", answer: a3, solution: `a₂=${a1 / 2}, a₃=${a3}.` }; }
  },

  {
    id: "rec-add-nsq",
    label: "유형 9 · a_{n+1}=a_n+n²",
    difficulty: 3,

    generate() { const a1 = randomInteger(1, 4); const a3 = iterate(a1, (a, n) => a + n * n, 3);
          return { prompt: `a₁=${a1}, a_{n+1}=a_n+n² 일 때 a₃ 을 구하세요.`, inputMode: "short-answer", answer: a3, solution: `a₂=${a1 + 1}, a₃=${a3}.` }; }
  },

  {
    id: "rec-triple",
    label: "유형 10 · a_{n+1}=3a_n",
    difficulty: 2,

    generate() { const a1 = randomInteger(1, 3); const a4 = iterate(a1, (a) => 3 * a, 4);
          return { prompt: `a₁=${a1}, a_{n+1}=3a_n 일 때 a₄ 를 구하세요.`, inputMode: "short-answer", answer: a4, solution: `a₄=${a4}.` }; }
  },
].map((problemType) =>
  createAlgebraProblemType(problemType, {
    conceptId: "algebra-03-06",
    conceptTitle: "수열의 귀납적 정의",
  })
);

module.exports = {
  key: "algebra-recursive-sequences",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
