const {
  randomInteger,
  nonZeroInteger,
  round4,
  isCorrectAnswer,
  createAlgebraProblemType,
} = require("./helpers");

const problemTypes = [
  {
    id: "arith-nth",
    label: "유형 1 · 등차수열 일반항",
    difficulty: 1,

    generate() { const a1 = randomInteger(-5, 5), d = nonZeroInteger(-4, 4), n = randomInteger(3, 10);
          return { prompt: `첫째항 ${a1}, 공차 ${d} 인 등차수열의 a_${n} 을 구하세요.`, inputMode: "short-answer", answer: a1 + (n - 1) * d,
            solution: `a_n=a₁+(n−1)d=${a1}+${n - 1}×${d}=${a1 + (n - 1) * d}.` }; }
  },

  {
    id: "arith-common-diff",
    label: "유형 2 · 공차 구하기",
    difficulty: 1,

    generate() { const a1 = randomInteger(-4, 4), d = nonZeroInteger(-4, 4);
          return { prompt: `등차수열의 a₁=${a1}, a₂=${a1 + d} 일 때 공차 d 를 구하세요.`, inputMode: "short-answer", answer: d,
            solution: `d=a₂−a₁=${a1 + d}−${a1}=${d}.` }; }
  },

  {
    id: "arith-sum",
    label: "유형 3 · 등차수열의 합",
    difficulty: 2,

    generate() { const a1 = randomInteger(-3, 5), d = nonZeroInteger(-3, 3), n = randomInteger(3, 10);
          let s = 0; for (let k = 0; k < n; k++) s += a1 + k * d;
          return { prompt: `첫째항 ${a1}, 공차 ${d} 인 등차수열의 첫째항부터 제${n}항까지의 합 S_${n} 을 구하세요.`, inputMode: "short-answer", answer: s,
            solution: `S_n=n(2a₁+(n−1)d)/2=${s}.` }; }
  },

  {
    id: "arith-first-from",
    label: "유형 4 · 특정항으로 첫째항",
    difficulty: 2,

    generate() { const a1 = randomInteger(-4, 4), d = nonZeroInteger(-3, 3), n = randomInteger(3, 8), an = a1 + (n - 1) * d;
          return { prompt: `공차 ${d} 인 등차수열에서 a_${n}=${an} 일 때 첫째항 a₁ 을 구하세요.`, inputMode: "short-answer", answer: a1,
            solution: `a₁=a_${n}−(${n}−1)×${d}=${an}−${(n - 1) * d}=${a1}.` }; }
  },

  {
    id: "arith-d-from-two",
    label: "유형 5 · 두 항으로 공차",
    difficulty: 3,

    generate() { const a1 = randomInteger(-4, 4), d = nonZeroInteger(-3, 3), m = randomInteger(2, 4), n = m + randomInteger(2, 4);
          return { prompt: `등차수열에서 a_${m}=${a1 + (m - 1) * d}, a_${n}=${a1 + (n - 1) * d} 일 때 공차 d 를 구하세요.`, inputMode: "short-answer", answer: d,
            solution: `d=(a_${n}−a_${m})/(${n}−${m})=${d}.` }; }
  },

  {
    id: "arith-mean",
    label: "유형 6 · 등차중항",
    difficulty: 1,

    generate() { const a = randomInteger(-6, 6), c = a + 2 * nonZeroInteger(1, 5);
          return { prompt: `세 수 ${a}, x, ${c} 가 등차수열을 이룰 때 x 를 구하세요.`, inputMode: "short-answer", answer: (a + c) / 2,
            solution: `x=(${a}+${c})/2=${(a + c) / 2}.` }; }
  },

  {
    id: "arith-sum-endpoints",
    label: "유형 7 · 합(첫째항·끝항)",
    difficulty: 2,

    generate() { const a1 = randomInteger(1, 5), d = randomInteger(1, 4), n = randomInteger(4, 10), an = a1 + (n - 1) * d;
          return { prompt: `첫째항 ${a1}, 제${n}항 ${an} 인 등차수열의 첫째항부터 제${n}항까지의 합을 구하세요.`, inputMode: "short-answer", answer: (n * (a1 + an)) / 2,
            solution: `S=n(a₁+a_n)/2=${n}×(${a1}+${an})/2=${(n * (a1 + an)) / 2}.` }; }
  },

  {
    id: "arith-index",
    label: "유형 8 · 항 번호 찾기",
    difficulty: 2,

    generate() { const a1 = randomInteger(-3, 3), d = nonZeroInteger(1, 4), n = randomInteger(3, 10), an = a1 + (n - 1) * d;
          return { prompt: `첫째항 ${a1}, 공차 ${d} 인 등차수열에서 ${an} 은 제몇 항인가요?`, inputMode: "short-answer", answer: n,
            solution: `a₁+(n−1)d=${an} → n=${n}.` }; }
  },

  {
    id: "arith-partial",
    label: "유형 9 · 부분합 계산",
    difficulty: 2,

    generate() { const a1 = randomInteger(1, 4), d = randomInteger(1, 3), n = randomInteger(3, 8);
          let s = 0; for (let k = 0; k < n; k++) s += a1 + k * d;
          return { prompt: `첫째항 ${a1}, 공차 ${d} 인 등차수열의 처음 ${n}개 항의 합을 구하세요.`, inputMode: "short-answer", answer: s,
            solution: `합=${s}.` }; }
  },

  {
    id: "arith-three",
    label: "유형 10 · 등차 세 수",
    difficulty: 2,

    generate() { const m = randomInteger(2, 8), d = nonZeroInteger(1, 4);
          return { prompt: `연속된 세 등차항이 ${m - d}, ${m}, ${m + d} 일 때 가운데 항을 확인하고 세 항의 합을 구하세요.`, inputMode: "short-answer", answer: 3 * m,
            solution: `세 항의 합=3×(가운데 항)=3×${m}=${3 * m}.` }; }
  },
].map((problemType) =>
  createAlgebraProblemType(problemType, {
    conceptId: "algebra-03-02",
    conceptTitle: "등차수열",
  })
);

module.exports = {
  key: "algebra-arithmetic-sequences",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
