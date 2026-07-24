const {
  randomInteger,
  nonZeroInteger,
  round4,
  isCorrectAnswer,
  createAlgebraProblemType,
} = require("./helpers");

const problemTypes = [
  {
    id: "exp-shift-point",
    label: "유형 1 · 지수함수 평행이동 점",
    difficulty: 2,

    generate() { const a = randomInteger(2, 3), c = randomInteger(1, 4);
          return { prompt: `y=${a}^x + ${c} 의 그래프가 지나는 점 (0, k) 의 k 를 구하세요.`, inputMode: "short-answer", answer: 1 + c,
            solution: `${a}^0+${c}=1+${c}=${1 + c}.` }; }
  },

  {
    id: "asymptote-exp",
    label: "유형 2 · 지수함수의 점근선",
    difficulty: 2,

    generate() { const c = randomInteger(-3, 3);
          return { prompt: `y=2^x + ${c} 의 점근선 y=k 의 k 를 구하세요.`, inputMode: "short-answer", answer: c,
            solution: `수평점근선은 y=${c}.` }; }
  },

  {
    id: "asymptote-log",
    label: "유형 3 · 로그함수의 점근선",
    difficulty: 2,

    generate() { const c = randomInteger(-3, 3);
          return { prompt: `y=log_2 (x − ${c}) 의 수직점근선 x=k 의 k 를 구하세요.`, inputMode: "short-answer", answer: c,
            solution: `진수>0: x>${c} → 점근선 x=${c}.` }; }
  },

  {
    id: "symmetry-yx",
    label: "유형 4 · y=x 대칭(역함수 그래프)",
    difficulty: 2,

    generate() { const a = randomInteger(2, 4), p = randomInteger(1, 3);
          return { prompt: `y=${a}^x 위의 점 (${p}, ${a ** p}) 을 y=x 에 대칭시킨 점의 x좌표를 구하세요.`, inputMode: "short-answer", answer: a ** p,
            solution: `(p,q)→(q,p): x좌표=${a ** p}.` }; }
  },

  {
    id: "exp-max-interval",
    label: "유형 5 · 구간에서의 최댓값(지수)",
    difficulty: 2,

    generate() { const a = randomInteger(2, 3), b = randomInteger(2, 3);
          return { prompt: `0≤x≤${b} 에서 y=${a}^x 의 최댓값을 구하세요.`, inputMode: "short-answer", answer: a ** b,
            solution: `증가함수이므로 x=${b}에서 최대: ${a ** b}.` }; }
  },

  {
    id: "log-max-interval",
    label: "유형 6 · 구간에서의 최댓값(로그)",
    difficulty: 2,

    generate() { const a = randomInteger(2, 3), k = randomInteger(2, 3);
          return { prompt: `1≤x≤${a ** k} 에서 y=log_${a} x 의 최댓값을 구하세요.`, inputMode: "short-answer", answer: k,
            solution: `증가함수이므로 x=${a ** k}에서 최대: ${k}.` }; }
  },

  {
    id: "reflect-exp",
    label: "유형 7 · y축 대칭",
    difficulty: 2,

    generate() { const a = randomInteger(2, 4);
          return { prompt: `y=${a}^x 를 y축에 대칭시킨 그래프의 식은?`, inputMode: "multiple-choice",
            choices: [{ key: "negx", text: `y=${a}^(−x)` }, { key: "neg", text: `y=−${a}^x` }], answer: "negx",
            solution: `y축 대칭은 x→−x → y=${a}^(−x).` }; }
  },

  {
    id: "graph-increasing",
    label: "유형 8 · 그래프의 증가/감소",
    difficulty: 1,

    generate() { const big = Math.random() < 0.5; const a = big ? randomInteger(2, 5) : 0;
          return { prompt: `y=${big ? a : "(1/3)"}^x 의 그래프는 증가/감소 중 무엇인가요?`, inputMode: "multiple-choice",
            choices: [{ key: "inc", text: "증가" }, { key: "dec", text: "감소" }], answer: big ? "inc" : "dec",
            solution: big ? `밑>1 → 증가.` : `밑<1 → 감소.` }; }
  },

  {
    id: "log-min-interval",
    label: "유형 9 · 구간에서의 최솟값(로그)",
    difficulty: 2,

    generate() { const a = randomInteger(2, 3);
          return { prompt: `${a}≤x≤${a ** 3} 에서 y=log_${a} x 의 최솟값을 구하세요.`, inputMode: "short-answer", answer: 1,
            solution: `증가함수이므로 x=${a}에서 최소: log_${a} ${a}=1.` }; }
  },

  {
    id: "exp-min-interval",
    label: "유형 10 · 구간에서의 최솟값(지수)",
    difficulty: 2,

    generate() { const a = randomInteger(2, 3), b = randomInteger(2, 3);
          return { prompt: `0≤x≤${b} 에서 y=${a}^x 의 최솟값을 구하세요.`, inputMode: "short-answer", answer: 1,
            solution: `증가함수이므로 x=0에서 최소: ${a}^0=1.` }; }
  },
].map((problemType) =>
  createAlgebraProblemType(problemType, {
    conceptId: "algebra-01-07",
    conceptTitle: "지수함수와 로그함수의 그래프",
  })
);

module.exports = {
  key: "algebra-exponential-and-logarithmic-graphs",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
