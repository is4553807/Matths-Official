const {
  randomInteger,
  nonZeroInteger,
  round4,
  isCorrectAnswer,
  createAlgebraProblemType,
} = require("./helpers");

const problemTypes = [
  {
    id: "exp-equation",
    label: "유형 1 · 지수방정식(밑 같게)",
    difficulty: 2,

    generate() { const a = randomInteger(2, 4), k = randomInteger(1, 4);
          return { prompt: `${a}^x = ${a ** k} 의 해 x 를 구하세요.`, inputMode: "short-answer", answer: k,
            solution: `밑이 같으므로 x=${k}.` }; }
  },

  {
    id: "exp-equation-base",
    label: "유형 2 · 지수방정식(밑 변형)",
    difficulty: 3,

    generate() { const n = randomInteger(1, 3); // 4^x=2^(2x)=2^k
          const k = randomInteger(1, 3) * 2;
          return { prompt: `4^x = 2^${k} 의 해 x 를 구하세요.`, inputMode: "short-answer", answer: k / 2,
            solution: `4=2² → 2^(2x)=2^${k} → x=${k / 2}.` }; }
  },

  {
    id: "log-equation",
    label: "유형 3 · 로그방정식",
    difficulty: 2,

    generate() { const a = randomInteger(2, 4), k = randomInteger(1, 4);
          return { prompt: `log_${a} x = ${k} 의 해 x 를 구하세요.`, inputMode: "short-answer", answer: a ** k,
            solution: `x=${a}^${k}=${a ** k}.` }; }
  },

  {
    id: "exp-inequality",
    label: "유형 4 · 지수부등식(밑>1)",
    difficulty: 3,

    generate() { const a = randomInteger(2, 4), k = randomInteger(1, 4);
          return { prompt: `${a}^x > ${a ** k} (밑>1) 의 해는 x > m 입니다. m 을 구하세요.`, inputMode: "short-answer", answer: k,
            solution: `밑>1이므로 부등호 방향 유지: x>${k}.` }; }
  },

  {
    id: "log-inequality",
    label: "유형 5 · 로그부등식",
    difficulty: 3,

    generate() { const a = randomInteger(2, 4), k = randomInteger(1, 3);
          return { prompt: `log_${a} x < ${k} (진수>0) 의 해는 0 < x < m 입니다. m 을 구하세요.`, inputMode: "short-answer", answer: a ** k,
            solution: `밑>1: x<${a ** k}, 진수조건 x>0 → 0<x<${a ** k}.` }; }
  },

  {
    id: "exp-sub",
    label: "유형 6 · 치환(지수)",
    difficulty: 3,

    generate() { const t = randomInteger(2, 4); // 2^x=t=perfect → x
          return { prompt: `2^x = ${2 ** t} 을 t=2^x 로 치환할 때 t 의 값을 구하세요.`, inputMode: "short-answer", answer: 2 ** t,
            solution: `t=2^x=${2 ** t}.` }; }
  },

  {
    id: "compound-growth",
    label: "유형 7 · 지수 성장 모델",
    difficulty: 2,

    generate() { const a = randomInteger(2, 3), n = randomInteger(1, 4);
          return { prompt: `초기값 1이 매 기간 ${a}배로 늘 때 ${n}기간 후의 값을 구하세요.`, inputMode: "short-answer", answer: a ** n,
            solution: `${a}^${n}=${a ** n}.` }; }
  },

  {
    id: "log-scale",
    label: "유형 8 · 로그 척도 활용",
    difficulty: 2,

    generate() { const a = randomInteger(2, 4), k = randomInteger(1, 3);
          return { prompt: `M = log_${a} x, x=${a ** k} 일 때 M 을 구하세요.`, inputMode: "short-answer", answer: k,
            solution: `M=log_${a} ${a ** k}=${k}.` }; }
  },

  {
    id: "exp-eq-two",
    label: "유형 9 · 지수방정식(공통밑 정리)",
    difficulty: 3,

    generate() { const a = randomInteger(2, 3), m = randomInteger(2, 4);
          return { prompt: `${a}^(x+1) = ${a ** m} 의 해 x 를 구하세요.`, inputMode: "short-answer", answer: m - 1,
            solution: `x+1=${m} → x=${m - 1}.` }; }
  },

  {
    id: "log-eq-two",
    label: "유형 10 · 로그방정식(진수 정리)",
    difficulty: 3,

    generate() { const a = randomInteger(2, 3), k = randomInteger(1, 3), c = randomInteger(1, 4);
          return { prompt: `log_${a} (x − ${c}) = ${k} 의 해 x 를 구하세요.`, inputMode: "short-answer", answer: a ** k + c,
            solution: `x−${c}=${a}^${k}=${a ** k} → x=${a ** k + c}.` }; }
  },
].map((problemType) =>
  createAlgebraProblemType(problemType, {
    conceptId: "algebra-01-08",
    conceptTitle: "지수함수와 로그함수의 활용",
  })
);

module.exports = {
  key: "algebra-exponential-and-logarithmic-applications",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
