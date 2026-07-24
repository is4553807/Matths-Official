const {
  randomInteger,
  nonZeroInteger,
  round4,
  isCorrectAnswer,
  createAlgebraProblemType,
} = require("./helpers");

const problemTypes = [
  {
    id: "rad-to-deg",
    label: "유형 1 · 호도법 → 육십분법",
    difficulty: 1,

    generate() { const k = [2, 3, 4, 6][randomInteger(0, 3)];
          return { prompt: `π/${k} (라디안)을 도(°)로 나타내세요.`, inputMode: "short-answer", answer: 180 / k,
            solution: `π=180° 이므로 π/${k}=${180 / k}°.` }; }
  },

  {
    id: "deg-to-rad",
    label: "유형 2 · 육십분법 → 호도법",
    difficulty: 1,

    generate() { const d = [30, 45, 60, 90, 180][randomInteger(0, 4)]; const k = 180 / d;
          return { prompt: `${d}° 를 π/k 꼴의 호도법으로 나타낼 때 k 를 구하세요.`, inputMode: "short-answer", answer: k,
            solution: `${d}° = ${d}π/180 = π/${k}.` }; }
  },

  {
    id: "coterminal",
    label: "유형 3 · 동경이 같은 각",
    difficulty: 2,

    generate() { const base = randomInteger(0, 350); const n = randomInteger(1, 3); const ang = base + 360 * n;
          return { prompt: `${ang}° 와 동경이 같은 각 중 0°≤θ<360° 인 θ 를 구하세요.`, inputMode: "short-answer", answer: base,
            solution: `${ang}°−360°×${n}=${base}°.` }; }
  },

  {
    id: "arc-length",
    label: "유형 4 · 부채꼴의 호의 길이",
    difficulty: 1,

    generate() { const r = randomInteger(2, 8), t = randomInteger(1, 4);
          return { prompt: `반지름 ${r}, 중심각 ${t}(라디안)인 부채꼴의 호의 길이 l 을 구하세요.`, inputMode: "short-answer", answer: r * t,
            solution: `l=rθ=${r}×${t}=${r * t}.` }; }
  },

  {
    id: "sector-area",
    label: "유형 5 · 부채꼴의 넓이",
    difficulty: 2,

    generate() { const r = 2 * randomInteger(1, 4), t = randomInteger(1, 4);
          return { prompt: `반지름 ${r}, 중심각 ${t}(라디안)인 부채꼴의 넓이 S 를 구하세요.`, inputMode: "short-answer", answer: 0.5 * r * r * t,
            solution: `S=½r²θ=½×${r}²×${t}=${0.5 * r * r * t}.` }; }
  },

  {
    id: "sector-area-arc",
    label: "유형 6 · 호의 길이로 넓이",
    difficulty: 2,

    generate() { const r = 2 * randomInteger(1, 4), l = randomInteger(2, 8);
          return { prompt: `반지름 ${r}, 호의 길이 ${l} 인 부채꼴의 넓이 S 를 구하세요.`, inputMode: "short-answer", answer: 0.5 * r * l,
            solution: `S=½rl=½×${r}×${l}=${0.5 * r * l}.` }; }
  },

  {
    id: "central-angle",
    label: "유형 7 · 중심각 구하기(θ=l/r)",
    difficulty: 2,

    generate() { const r = randomInteger(2, 6), t = randomInteger(1, 5), l = r * t;
          return { prompt: `반지름 ${r}, 호의 길이 ${l} 인 부채꼴의 중심각(라디안)을 구하세요.`, inputMode: "short-answer", answer: t,
            solution: `θ=l/r=${l}/${r}=${t}.` }; }
  },

  {
    id: "quadrant-of-angle",
    label: "유형 8 · 각의 사분면",
    difficulty: 2,

    generate() { const q = randomInteger(1, 4); const ang = (q - 1) * 90 + randomInteger(10, 80);
          return { prompt: `${ang}° 는 제몇 사분면의 각인가요?`, inputMode: "multiple-choice",
            choices: [{ key: "1", text: "제1사분면" }, { key: "2", text: "제2사분면" }, { key: "3", text: "제3사분면" }, { key: "4", text: "제4사분면" }],
            answer: String(q), solution: `${ang}° 는 제${q}사분면.` }; }
  },

  {
    id: "perimeter",
    label: "유형 9 · 부채꼴의 둘레",
    difficulty: 2,

    generate() { const r = randomInteger(2, 6), t = randomInteger(1, 4), l = r * t;
          return { prompt: `반지름 ${r}, 중심각 ${t}(라디안)인 부채꼴의 둘레를 구하세요.`, inputMode: "short-answer", answer: 2 * r + l,
            solution: `둘레=2r+l=2×${r}+${l}=${2 * r + l}.` }; }
  },

  {
    id: "angle-from-area",
    label: "유형 10 · 넓이로 중심각",
    difficulty: 3,

    generate() { const r = 2 * randomInteger(1, 3), t = randomInteger(1, 4), S = 0.5 * r * r * t;
          return { prompt: `반지름 ${r}, 넓이 ${S} 인 부채꼴의 중심각(라디안)을 구하세요.`, inputMode: "short-answer", answer: t,
            solution: `θ=2S/r²=2×${S}/${r}²=${t}.` }; }
  },
].map((problemType) =>
  createAlgebraProblemType(problemType, {
    conceptId: "algebra-02-01",
    conceptTitle: "일반각과 호도법",
  })
);

module.exports = {
  key: "algebra-general-angles-and-radians",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
