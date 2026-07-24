const {
  randomInteger,
  nonZeroInteger,
  round4,
  isCorrectAnswer,
  createAlgebraProblemType,
} = require("./helpers");

const problemTypes = [
  {
    id: "geo-nth",
    label: "유형 1 · 등비수열 일반항",
    difficulty: 2,

    generate() { const a1 = randomInteger(1, 4), r = randomInteger(2, 3), n = randomInteger(2, 5);
          return { prompt: `첫째항 ${a1}, 공비 ${r} 인 등비수열의 a_${n} 을 구하세요.`, inputMode: "short-answer", answer: a1 * r ** (n - 1),
            solution: `a_n=a₁r^(n−1)=${a1}×${r}^${n - 1}=${a1 * r ** (n - 1)}.` }; }
  },

  {
    id: "geo-ratio",
    label: "유형 2 · 공비 구하기",
    difficulty: 1,

    generate() { const a1 = randomInteger(1, 4), r = randomInteger(2, 4);
          return { prompt: `등비수열의 a₁=${a1}, a₂=${a1 * r} 일 때 공비 r 을 구하세요.`, inputMode: "short-answer", answer: r,
            solution: `r=a₂/a₁=${a1 * r}/${a1}=${r}.` }; }
  },

  {
    id: "geo-sum",
    label: "유형 3 · 등비수열의 합",
    difficulty: 2,

    generate() { const a1 = randomInteger(1, 4), r = 2, n = randomInteger(2, 6);
          let s = 0; for (let k = 0; k < n; k++) s += a1 * r ** k;
          return { prompt: `첫째항 ${a1}, 공비 ${r} 인 등비수열의 첫째항부터 제${n}항까지의 합을 구하세요.`, inputMode: "short-answer", answer: s,
            solution: `S_n=a₁(rⁿ−1)/(r−1)=${s}.` }; }
  },

  {
    id: "geo-mean",
    label: "유형 4 · 등비중항",
    difficulty: 2,

    generate() { const b = randomInteger(2, 6); const a = randomInteger(1, 4); const c = (b * b) / a;
          // ensure c integer: choose a divides b²
          const aa = 1; const bb = randomInteger(2, 6); // a=1, c=b² → mean b
          return { prompt: `세 양수 1, x, ${bb * bb} 가 등비수열을 이룰 때 양수 x 를 구하세요.`, inputMode: "short-answer", answer: bb,
            solution: `x²=1×${bb * bb} → x=${bb}.` }; }
  },

  {
    id: "geo-term-from",
    label: "유형 5 · 특정항으로 첫째항",
    difficulty: 3,

    generate() { const a1 = randomInteger(1, 4), r = randomInteger(2, 3), n = randomInteger(2, 4), an = a1 * r ** (n - 1);
          return { prompt: `공비 ${r} 인 등비수열에서 a_${n}=${an} 일 때 첫째항 a₁ 을 구하세요.`, inputMode: "short-answer", answer: a1,
            solution: `a₁=a_${n}/r^(${n}−1)=${an}/${r ** (n - 1)}=${a1}.` }; }
  },

  {
    id: "geo-ratio-two",
    label: "유형 6 · 두 항으로 공비",
    difficulty: 3,

    generate() { const a1 = randomInteger(1, 3), r = randomInteger(2, 3);
          return { prompt: `등비수열에서 a₁=${a1}, a₃=${a1 * r * r} 일 때 공비 r(양수) 을 구하세요.`, inputMode: "short-answer", answer: r,
            solution: `r²=a₃/a₁=${r * r} → r=${r}.` }; }
  },

  {
    id: "geo-sum-r3",
    label: "유형 7 · 등비합(공비 3)",
    difficulty: 2,

    generate() { const a1 = randomInteger(1, 3), r = 3, n = randomInteger(2, 5);
          let s = 0; for (let k = 0; k < n; k++) s += a1 * r ** k;
          return { prompt: `첫째항 ${a1}, 공비 ${r} 인 등비수열의 처음 ${n}개 항의 합을 구하세요.`, inputMode: "short-answer", answer: s,
            solution: `합=${s}.` }; }
  },

  {
    id: "geo-index",
    label: "유형 8 · 항 번호 찾기",
    difficulty: 3,

    generate() { const a1 = randomInteger(1, 3), r = 2, n = randomInteger(2, 6), an = a1 * r ** (n - 1);
          return { prompt: `첫째항 ${a1}, 공비 ${r} 인 등비수열에서 ${an} 은 제몇 항인가요?`, inputMode: "short-answer", answer: n,
            solution: `a₁·2^(n−1)=${an} → n=${n}.` }; }
  },

  {
    id: "geo-three",
    label: "유형 9 · 등비 세 수의 곱",
    difficulty: 2,

    generate() { const m = randomInteger(2, 5), r = randomInteger(2, 3);
          return { prompt: `연속된 세 등비항이 ${m}, ${m * r}, ${m * r * r} 일 때 가운데 항을 구하세요.`, inputMode: "short-answer", answer: m * r,
            solution: `가운데 항=${m}×${r}=${m * r}.` }; }
  },

  {
    id: "geo-first",
    label: "유형 10 · 공비와 항으로 첫째항",
    difficulty: 2,

    generate() { const a1 = randomInteger(1, 4), r = randomInteger(2, 3), a2 = a1 * r;
          return { prompt: `공비 ${r} 인 등비수열에서 a₂=${a2} 일 때 첫째항 a₁ 을 구하세요.`, inputMode: "short-answer", answer: a1,
            solution: `a₁=a₂/r=${a2}/${r}=${a1}.` }; }
  },
].map((problemType) =>
  createAlgebraProblemType(problemType, {
    conceptId: "algebra-03-03",
    conceptTitle: "등비수열",
  })
);

module.exports = {
  key: "algebra-geometric-sequences",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
