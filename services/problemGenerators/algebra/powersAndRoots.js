const {
  randomInteger,
  nonZeroInteger,
  round4,
  isCorrectAnswer,
  createAlgebraProblemType,
} = require("./helpers");

const problemTypes = [
  {
    id: "nth-root-value",
    label: "유형 1 · 거듭제곱근의 값",
    difficulty: 1,

    generate() { const b = randomInteger(2, 5), n = randomInteger(2, 3), v = b ** n;
          return { prompt: `${n}제곱근 ${v} 의 값(양의 실수)을 구하세요.`, inputMode: "short-answer", answer: b,
            solution: `${v}=${b}^${n} 이므로 값은 ${b}.` }; }
  },

  {
    id: "root-product",
    label: "유형 2 · 거듭제곱근의 곱",
    difficulty: 2,

    generate() { const m = randomInteger(2, 6), k = randomInteger(2, 6);
          return { prompt: `√${m * m} × √${k * k} 의 값을 구하세요.`, inputMode: "short-answer", answer: m * k,
            solution: `√${m * m}=${m}, √${k * k}=${k} → ${m}×${k}=${m * k}.` }; }
  },

  {
    id: "root-quotient",
    label: "유형 3 · 거듭제곱근의 나눗셈",
    difficulty: 2,

    generate() { const m = randomInteger(2, 6), k = randomInteger(2, 5), a = (m * k) ** 2, b = k * k;
          return { prompt: `√${a} ÷ √${b} 의 값을 구하세요.`, inputMode: "short-answer", answer: m,
            solution: `√${a}/√${b}=√(${a}/${b})=√${m * m}=${m}.` }; }
  },

  {
    id: "root-power",
    label: "유형 4 · 거듭제곱근의 거듭제곱",
    difficulty: 2,

    generate() { const b = randomInteger(2, 4), m = randomInteger(2, 3), a = b ** 3;
          return { prompt: `(∛${a})^${m} 의 값을 구하세요.`, inputMode: "short-answer", answer: b ** m,
            solution: `∛${a}=${b} 이므로 ${b}^${m}=${b ** m}.` }; }
  },

  {
    id: "root-of-root",
    label: "유형 5 · 이중근호",
    difficulty: 3,

    generate() { const b = randomInteger(2, 3), a = b ** 6;
          return { prompt: `√(∛${a}) 의 값을 구하세요.`, inputMode: "short-answer", answer: b,
            solution: `√(∛${a})=${a}^(1/6)=${b}.` }; }
  },

  {
    id: "exp-to-root",
    label: "유형 6 · 지수↔거듭제곱근",
    difficulty: 1,

    generate() { const b = randomInteger(2, 5), n = randomInteger(2, 3), a = b ** n;
          return { prompt: `${a}^(1/${n}) 의 값을 구하세요.`, inputMode: "short-answer", answer: b,
            solution: `${a}^(1/${n})=${n}제곱근 ${a}=${b}.` }; }
  },

  {
    id: "count-real-roots",
    label: "유형 7 · 실수인 거듭제곱근의 개수",
    difficulty: 2,

    generate() { const n = randomInteger(2, 5), even = n % 2 === 0;
          return { prompt: `양수 a 의 실수인 ${n}제곱근의 개수를 구하세요.`, inputMode: "short-answer", answer: even ? 2 : 1,
            solution: even ? `n이 짝수이고 a>0이면 실수인 거듭제곱근은 2개.` : `n이 홀수이면 실수인 거듭제곱근은 1개.` }; }
  },

  {
    id: "root-compare",
    label: "유형 8 · 거듭제곱근의 대소",
    difficulty: 2,

    generate() { const a = randomInteger(2, 5);
          return { prompt: `a=${a}(>1) 일 때 √a 와 ∛a 중 더 큰 값은?`, inputMode: "multiple-choice",
            choices: [{ key: "sqrt", text: "√a" }, { key: "cbrt", text: "∛a" }], answer: "sqrt",
            solution: `a>1이면 지수 1/2 > 1/3 이므로 √a가 더 큽니다.` }; }
  },

  {
    id: "cube-root",
    label: "유형 9 · 세제곱근 계산",
    difficulty: 1,

    generate() { const b = randomInteger(2, 6), a = b ** 3;
          return { prompt: `∛${a} 의 값을 구하세요.`, inputMode: "short-answer", answer: b,
            solution: `${b}³=${a} 이므로 ∛${a}=${b}.` }; }
  },

  {
    id: "root-combined",
    label: "유형 10 · 거듭제곱근 종합",
    difficulty: 3,

    generate() { const a = randomInteger(2, 4), b = randomInteger(2, 4);
          return { prompt: `∛(${a}³ × ${b}³) 의 값을 구하세요.`, inputMode: "short-answer", answer: a * b,
            solution: `∛(${a}³×${b}³)=${a}×${b}=${a * b}.` }; }
  },
].map((problemType) =>
  createAlgebraProblemType(problemType, {
    conceptId: "algebra-01-01",
    conceptTitle: "거듭제곱과 거듭제곱근",
  })
);

module.exports = {
  key: "algebra-powers-and-roots",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
