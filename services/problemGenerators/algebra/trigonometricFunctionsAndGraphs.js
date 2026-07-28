const {
  randomInteger,
  nonZeroInteger,
  round4,
  isCorrectAnswer,
  createAlgebraProblemType,
} = require("./helpers");

const problemTypes = [
  {
    id: "special-value",
    label: "유형 1 · 특수각의 삼각함수 값",
    difficulty: 2,

    generate() { const table = [["sin", 30, 0.5], ["sin", 90, 1], ["sin", 0, 0], ["cos", 0, 1], ["cos", 60, 0.5], ["cos", 90, 0], ["tan", 45, 1], ["tan", 0, 0]];
          const [f, d, v] = table[randomInteger(0, table.length - 1)];
          return { prompt: `${f} ${d}° 의 값을 구하세요. (소수/정수)`, inputMode: "short-answer", answer: v,
            solution: `${f}${d}°=${v}.` }; }
  },

  {
    id: "quadrant-sign",
    label: "유형 2 · 삼각함수의 부호",
    difficulty: 2,

    generate() { const q = randomInteger(1, 4); const f = ["sin", "cos", "tan"][randomInteger(0, 2)];
          const s = { sin: [1, 1, -1, -1], cos: [1, -1, -1, 1], tan: [1, -1, 1, -1] }[f][q - 1] > 0;
          return { prompt: `θ가 제${q}사분면의 각일 때 ${f}θ 의 부호는?`, inputMode: "multiple-choice",
            choices: [{ key: "p", text: "양수(+)" }, { key: "n", text: "음수(−)" }], answer: s ? "p" : "n",
            solution: `제${q}사분면에서 ${f}θ 는 ${s ? "양" : "음"}수.` }; }
  },

  {
    id: "identity-cos",
    label: "유형 3 · 삼각함수의 기본 관계",
    difficulty: 2,

    generate() { const T = [[3, 4, 5], [5, 12, 13], [8, 15, 17]][randomInteger(0, 2)];
          return { prompt: `제1사분면 각 θ에서 sinθ=${T[0]}/${T[2]} 일 때 cosθ 를 구하세요. (소수)`, inputMode: "short-answer", answer: T[1] / T[2],
            solution: `cosθ=${T[1]}/${T[2]}=${(T[1] / T[2]).toFixed(4)}.` }; }
  },

  {
    id: "tan-from-triple",
    label: "유형 4 · 삼각함수 사이의 관계",
    difficulty: 2,

    generate() { const T = [[3, 4, 5], [5, 12, 13], [8, 15, 17]][randomInteger(0, 2)];
          return { prompt: `제1사분면 각 θ에서 sinθ=${T[0]}/${T[2]}, cosθ=${T[1]}/${T[2]} 일 때 tanθ 를 구하세요. (소수)`, inputMode: "short-answer", answer: T[0] / T[1],
            solution: `tanθ=${T[0]}/${T[1]}=${(T[0] / T[1]).toFixed(4)}.` }; }
  },

  {
    id: "graph-max",
    label: "유형 5 · 그래프의 최댓값",
    difficulty: 2,

    generate() { const A = randomInteger(2, 5), c = randomInteger(-3, 3);
          return { prompt: `y=${A}sin x + ${c} 의 최댓값을 구하세요.`, inputMode: "short-answer", answer: A + c,
            solution: `최댓값=${A}×1+${c}=${A + c}.` }; }
  },

  {
    id: "graph-min",
    label: "유형 6 · 그래프의 최솟값",
    difficulty: 2,

    generate() { const A = randomInteger(2, 5), c = randomInteger(-3, 3);
          return { prompt: `y=${A}sin x + ${c} 의 최솟값을 구하세요.`, inputMode: "short-answer", answer: -A + c,
            solution: `최솟값=${A}×(−1)+${c}=${-A + c}.` }; }
  },

  {
    id: "period",
    label: "유형 7 · 주기",
    difficulty: 2,

    generate() { const b = randomInteger(2, 6);
          return { prompt: `y=sin(${b}x) 의 주기는 2π/k 입니다. k 를 구하세요.`, inputMode: "short-answer", answer: b,
            solution: `주기=2π/${b} 이므로 k=${b}.` }; }
  },

  {
    id: "amplitude",
    label: "유형 8 · 진폭",
    difficulty: 1,

    generate() { const A = nonZeroInteger(-5, 5);
          return { prompt: `y=${A}sin x 의 진폭을 구하세요.`, inputMode: "short-answer", answer: Math.abs(A),
            solution: `진폭=|${A}|=${Math.abs(A)}.` }; }
  },

  {
    id: "transform-value",
    label: "유형 9 · 여러 각의 삼각함수",
    difficulty: 3,

    generate() { const table = [[150, "sin", 0.5], [120, "sin", Math.round(Math.sin(Math.PI * 120 / 180) * 1000) / 1000], [180, "cos", -1], [90, "cos", 0]];
          const pick = [[150, 0.5, "sin(180°−30°)=sin30°"], [0, 0, "sin0°"], [180, 0, "sin180°=0"]][randomInteger(0, 2)];
          return { prompt: `sin ${pick[0]}° 의 값을 구하세요.`, inputMode: "short-answer", answer: pick[1],
            solution: `${pick[2]}=${pick[1]}.` }; }
  },

  {
    id: "simple-equation",
    label: "유형 10 · 간단한 삼각방정식",
    difficulty: 2,

    generate() { const cases = [["sin", 1, 90], ["cos", 1, 0], ["sin", 0, 0], ["cos", 0, 90]]; const c = cases[randomInteger(0, cases.length - 1)];
          return { prompt: `0°≤x≤90° 에서 ${c[0]} x = ${c[1]} 을 만족하는 x(°) 를 구하세요.`, inputMode: "short-answer", answer: c[2],
            solution: `${c[0]}${c[2]}°=${c[1]} → x=${c[2]}°.` }; }
  },
].map((problemType) =>
  createAlgebraProblemType(problemType, {
    conceptId: "algebra-02-02",
    conceptTitle: "삼각함수와 그래프",
  })
);

module.exports = {
  key: "algebra-trigonometric-functions-and-graphs",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
