const {
  randomInteger,
  nonZeroInteger,
  round4,
  isCorrectAnswer,
  createAlgebraProblemType,
} = require("./helpers");

const problemTypes = [
  {
    id: "exp-eval",
    label: "유형 1 · 지수함수의 함숫값",
    difficulty: 1,

    generate() { const a = randomInteger(2, 4), x = randomInteger(0, 3);
          return { prompt: `f(x)=${a}^x 일 때 f(${x}) 를 구하세요.`, inputMode: "short-answer", answer: a ** x,
            solution: `${a}^${x}=${a ** x}.` }; }
  },

  {
    id: "log-eval",
    label: "유형 2 · 로그함수의 함숫값",
    difficulty: 1,

    generate() { const a = randomInteger(2, 4), k = randomInteger(1, 3);
          return { prompt: `g(x)=log_${a} x 일 때 g(${a ** k}) 를 구하세요.`, inputMode: "short-answer", answer: k,
            solution: `log_${a} ${a ** k}=${k}.` }; }
  },

  {
    id: "exp-through-point",
    label: "유형 3 · 지수함수가 지나는 점",
    difficulty: 2,

    generate() { const a = randomInteger(2, 4);
          return { prompt: `y=${a}^x 는 항상 점 (0, k) 를 지납니다. k 를 구하세요.`, inputMode: "short-answer", answer: 1,
            solution: `${a}^0=1 → (0,1).` }; }
  },

  {
    id: "log-through-point",
    label: "유형 4 · 로그함수가 지나는 점",
    difficulty: 2,

    generate() { const a = randomInteger(2, 4);
          return { prompt: `y=log_${a} x 는 항상 점 (k, 0) 를 지납니다. k 를 구하세요.`, inputMode: "short-answer", answer: 1,
            solution: `log_${a} 1=0 → (1,0).` }; }
  },

  {
    id: "inverse-relation",
    label: "유형 5 · 역함수 관계",
    difficulty: 2,

    generate() { const a = randomInteger(2, 4);
          return { prompt: `y=${a}^x 의 역함수는?`, inputMode: "multiple-choice",
            choices: [{ key: "log", text: `y=log_${a} x` }, { key: "exp", text: `y=${a}^(−x)` }], answer: "log",
            solution: `지수함수의 역함수는 같은 밑의 로그함수.` }; }
  },

  {
    id: "exp-negative-x",
    label: "유형 6 · 지수함수 f(−x)",
    difficulty: 2,

    generate() { const a = randomInteger(2, 4), x = randomInteger(1, 3);
          return { prompt: `f(x)=${a}^x 일 때 f(−${x}) 를 구하세요. (소수)`, inputMode: "short-answer", answer: 1 / a ** x,
            solution: `${a}^(−${x})=1/${a ** x}=${(1 / a ** x).toFixed(4)}.` }; }
  },

  {
    id: "domain-log",
    label: "유형 7 · 로그함수의 정의역",
    difficulty: 2,

    generate() {
      const shift = randomInteger(-3, 3);
      const inside =
        shift === 0
          ? "x"
          : shift > 0
            ? `x-${shift}`
            : `x+${Math.abs(shift)}`;

      return {
        prompt:
          `로그함수 y=log_a(${inside}) 의 정의역은?`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "correct",
            text: `x > ${shift}`,
          },
          {
            key: "opposite",
            text: `x < ${shift}`,
          },
          {
            key: "all",
            text: "모든 실수",
          },
        ],
        answer: "correct",
        solution:
          `진수 ${inside}>0 이어야 하므로 x>${shift}.`,
      };
    }
  },

  {
    id: "range-exp",
    label: "유형 8 · 지수함수의 치역",
    difficulty: 2,

    generate() {
      const base = randomInteger(2, 5);
      const shift = randomInteger(-3, 3);
      const shiftedTerm =
        shift === 0
          ? ""
          : shift > 0
            ? `+${shift}`
            : `${shift}`;

      return {
        prompt:
          `지수함수 y=${base}^x${shiftedTerm} 의 치역은?`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "correct",
            text: `y > ${shift}`,
          },
          {
            key: "opposite",
            text: `y < ${shift}`,
          },
          {
            key: "all",
            text: "모든 실수",
          },
        ],
        answer: "correct",
        solution:
          `${base}^x>0 이므로 y=${base}^x${shiftedTerm}>${shift}.`,
      };
    }
  },

  {
    id: "monotonic",
    label: "유형 9 · 증가·감소 판정",
    difficulty: 2,

    generate() { const inc = Math.random() < 0.5; const a = inc ? randomInteger(2, 4) : 0;
          return { prompt: `y=${inc ? a : "(1/2)"}^x (밑 ${inc ? ">1" : "<1"}) 는 증가함수입니까?`, inputMode: "multiple-choice",
            choices: [{ key: "inc", text: "증가함수" }, { key: "dec", text: "감소함수" }], answer: inc ? "inc" : "dec",
            solution: inc ? `밑>1이면 증가함수.` : `밑<1이면 감소함수.` }; }
  },

  {
    id: "exp-solve",
    label: "유형 10 · 함숫값으로 x 찾기",
    difficulty: 2,

    generate() { const a = randomInteger(2, 4), k = randomInteger(1, 3);
          return { prompt: `f(x)=${a}^x, f(x)=${a ** k} 일 때 x 를 구하세요.`, inputMode: "short-answer", answer: k,
            solution: `${a}^x=${a ** k} → x=${k}.` }; }
  },
].map((problemType) =>
  createAlgebraProblemType(problemType, {
    conceptId: "algebra-01-06",
    conceptTitle: "지수함수와 로그함수의 뜻",
  })
);

module.exports = {
  key: "algebra-exponential-and-logarithmic-functions",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
