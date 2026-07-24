const {
  randomInteger,
  nonZeroInteger,
  round4,
  isCorrectAnswer,
  createAlgebraProblemType,
} = require("./helpers");

const problemTypes = [
  {
    id: "law-sines-b",
    label: "유형 1 · 사인법칙(변 b)",
    difficulty: 2,

    generate() { const a = randomInteger(2, 8);
          return { prompt: `삼각형 ABC에서 A=30°, B=90°, a=${a} 일 때 b 를 구하세요.`, inputMode: "short-answer", answer: 2 * a,
            solution: `b=a·sinB/sinA=${a}×1÷(1/2)=${2 * a}.` }; }
  },

  {
    id: "law-sines-a",
    label: "유형 2 · 사인법칙(변 a)",
    difficulty: 2,

    generate() { const b = randomInteger(2, 8);
          return { prompt: `삼각형 ABC에서 A=90°, B=30°, b=${b} 일 때 a 를 구하세요.`, inputMode: "short-answer", answer: 2 * b,
            solution: `a=b·sinA/sinB=${b}×1÷(1/2)=${2 * b}.` }; }
  },

  {
    id: "circumradius",
    label: "유형 3 · 외접원의 반지름 R",
    difficulty: 3,

    generate() { const a = randomInteger(2, 8);
          return { prompt: `삼각형 ABC에서 A=30°, a=${a} 일 때 외접원의 반지름 R 을 구하세요.`, inputMode: "short-answer", answer: a,
            solution: `2R=a/sinA=${a}÷(1/2)=${2 * a} → R=${a}.` }; }
  },

  {
    id: "cosines-60",
    label: "유형 4 · 코사인법칙(A=60°)",
    difficulty: 3,

    generate() { const b = randomInteger(2, 7), c = randomInteger(2, 7);
          return { prompt: `삼각형에서 b=${b}, c=${c}, A=60° 일 때 a² 을 구하세요.`, inputMode: "short-answer", answer: b * b + c * c - b * c,
            solution: `a²=b²+c²−2bc·cos60°=${b}²+${c}²−${b}×${c}=${b * b + c * c - b * c}.` }; }
  },

  {
    id: "cosines-90",
    label: "유형 5 · 코사인법칙(A=90°, 피타고라스)",
    difficulty: 2,

    generate() { const b = randomInteger(2, 7), c = randomInteger(2, 7);
          return { prompt: `삼각형에서 b=${b}, c=${c}, A=90° 일 때 a² 을 구하세요.`, inputMode: "short-answer", answer: b * b + c * c,
            solution: `cos90°=0 이므로 a²=b²+c²=${b * b + c * c}.` }; }
  },

  {
    id: "cosines-120",
    label: "유형 6 · 코사인법칙(A=120°)",
    difficulty: 3,

    generate() { const b = randomInteger(2, 7), c = randomInteger(2, 7);
          return { prompt: `삼각형에서 b=${b}, c=${c}, A=120° 일 때 a² 을 구하세요.`, inputMode: "short-answer", answer: b * b + c * c + b * c,
            solution: `cos120°=−½ 이므로 a²=b²+c²+bc=${b * b + c * c + b * c}.` }; }
  },

  {
    id: "area-30",
    label: "유형 7 · 삼각형 넓이(C=30°)",
    difficulty: 2,

    generate() { const a = 2 * randomInteger(1, 5), b = 2 * randomInteger(1, 5);
          return { prompt: `두 변 a=${a}, b=${b}, 끼인각 C=30° 인 삼각형의 넓이를 구하세요.`, inputMode: "short-answer", answer: (a * b) / 4,
            solution: `S=½ab·sin30°=½×${a}×${b}×½=${(a * b) / 4}.` }; }
  },

  {
    id: "area-90",
    label: "유형 8 · 삼각형 넓이(C=90°)",
    difficulty: 1,

    generate() { const a = randomInteger(2, 8), b = randomInteger(2, 8);
          return { prompt: `두 변 a=${a}, b=${b}, 끼인각 C=90° 인 삼각형의 넓이를 구하세요.`, inputMode: "short-answer", answer: (a * b) / 2,
            solution: `S=½ab·sin90°=½×${a}×${b}=${(a * b) / 2}.` }; }
  },

  {
    id: "area-150",
    label: "유형 9 · 삼각형 넓이(C=150°)",
    difficulty: 3,

    generate() { const a = 2 * randomInteger(1, 5), b = 2 * randomInteger(1, 5);
          return { prompt: `두 변 a=${a}, b=${b}, 끼인각 C=150° 인 삼각형의 넓이를 구하세요.`, inputMode: "short-answer", answer: (a * b) / 4,
            solution: `sin150°=½ → S=½ab×½=${(a * b) / 4}.` }; }
  },

  {
    id: "cos-from-sides",
    label: "유형 10 · 세 변으로 cos 구하기",
    difficulty: 3,

    generate() { const T = [[4, 5, 6], [2, 3, 4], [3, 5, 7], [5, 6, 7]][randomInteger(0, 3)];
          const [a, b, c] = T; const cosA = (b * b + c * c - a * a) / (2 * b * c);
          return { prompt: `세 변이 a=${a}, b=${b}, c=${c} 인 삼각형에서 cosA 를 구하세요. (소수)`, inputMode: "short-answer", answer: Number(cosA.toFixed(4)),
            solution: `cosA=(b²+c²−a²)/(2bc)=(${b * b}+${c * c}−${a * a})/${2 * b * c}=${cosA.toFixed(4)}.` }; }
  },
].map((problemType) =>
  createAlgebraProblemType(problemType, {
    conceptId: "algebra-02-03",
    conceptTitle: "사인법칙과 코사인법칙",
  })
);

module.exports = {
  key: "algebra-sine-and-cosine-laws",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
