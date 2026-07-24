const {
  randomInteger,
  nonZeroInteger,
  round4,
  isCorrectAnswer,
  createAlgebraProblemType,
} = require("./helpers");

const problemTypes = [
  {
    id: "domino-idea",
    label: "유형 1 · 귀납법의 원리(도미노)",
    difficulty: 1,

    generate() {
      const start = randomInteger(1, 4);

      return {
        prompt:
          `P(${start})가 참이고, k≥${start}에서 P(k)가 참이면 ` +
          `P(k+1)도 참임을 보였습니다. 결론은?`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "all",
            text: `모든 자연수 n≥${start}에서 P(n)이 참`,
          },
          {
            key: "some",
            text: `n=${start}에서만 P(n)이 참`,
          },
        ],
        answer: "all",
        solution:
          `기초 단계 P(${start})와 귀납 단계가 모두 성립하므로 ` +
          `모든 자연수 n≥${start}에서 P(n)이 참입니다.`,
      };
    }
  },

  {
    id: "base-check-sum",
    label: "유형 2 · n=1 확인(합)",
    difficulty: 1,

    generate() {
      const variants = [
        "1+2+…+n=n(n+1)/2",
        "1+3+…+(2n-1)=n²",
        "1²+2²+…+n²=n(n+1)(2n+1)/6",
      ];
      const statement =
        variants[
          randomInteger(0, variants.length - 1)
        ];

      return {
        prompt:
          `등식 ${statement}의 기초 단계에서 n=1일 때 좌변의 값을 구하세요.`,
        inputMode: "short-answer",
        answer: 1,
        solution:
          `n=1이면 좌변에는 첫 번째 항 1만 남으므로 값은 1입니다.`,
      };
    }
  },

  {
    id: "hypothesis-step",
    label: "유형 3 · 가정 단계 개념",
    difficulty: 2,

    generate() {
      const statement =
        Math.random() < 0.5
          ? "1+2+…+n=n(n+1)/2"
          : "1+3+…+(2n-1)=n²";

      return {
        prompt:
          `명제 P(n): ${statement}을 귀납법으로 증명할 때 귀납 가정은?`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "ind",
            text: `P(k)가 참이라고 가정한다.`,
          },
          {
            key: "base",
            text: `P(k+1)가 참이라고 먼저 가정한다.`,
          },
        ],
        answer: "ind",
        solution:
          `귀납 단계에서는 P(k)가 참이라고 가정하고 P(k+1)을 증명합니다.`,
      };
    }
  },

  {
    id: "verify-kplus1",
    label: "유형 4 · n=k+1 좌변 값",
    difficulty: 2,

    generate() { const k = randomInteger(2, 6); let s = 0; for (let i = 1; i <= k + 1; i++) s += i;
          return { prompt: `1+2+…+n 에서 n=${k + 1} 일 때의 합을 구하세요.`, inputMode: "short-answer", answer: s, solution: `${k + 1}(${k + 2})/2=${s}.` }; }
  },

  {
    id: "sum-formula-value",
    label: "유형 5 · 등식 P(n) 좌변 값",
    difficulty: 1,

    generate() { const n = randomInteger(3, 8); let s = 0; for (let i = 1; i <= n; i++) s += i;
          return { prompt: `1+2+…+${n} 의 값을 구하세요.`, inputMode: "short-answer", answer: s, solution: `${n}(${n + 1})/2=${s}.` }; }
  },

  {
    id: "odd-sum-value",
    label: "유형 6 · 홀수합 P(n)=n²",
    difficulty: 2,

    generate() { const n = randomInteger(3, 9); return { prompt: `1+3+5+…+(2×${n}−1) 의 값을 구하세요.`, inputMode: "short-answer", answer: n * n, solution: `홀수 ${n}개의 합=${n}²=${n * n}.` }; }
  },

  {
    id: "step-order",
    label: "유형 7 · 증명 단계 순서",
    difficulty: 2,

    generate() {
      const start = randomInteger(1, 4);

      return {
        prompt:
          `n≥${start}에서 명제 P(n)을 귀납법으로 증명할 때 올바른 순서는?`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "ok",
            text:
              `① P(${start}) 확인 → ② P(k) 가정 → ③ P(k+1) 증명`,
          },
          {
            key: "no",
            text:
              `① P(k+1) 가정 → ② P(${start}) 생략`,
          },
        ],
        answer: "ok",
        solution:
          `기초 단계 P(${start})를 확인한 뒤 귀납 가정과 ` +
          `P(k+1)의 증명 순서로 진행합니다.`,
      };
    }
  },

  {
    id: "base-holds",
    label: "유형 8 · 기초단계 성립 판정",
    difficulty: 1,

    generate() {
      const offset =
        Math.random() < 0.5 ? 0 : 1;

      return {
        prompt:
          `등식 1+2+…+n=n(n+1)/2+${offset}에서 ` +
          `n=1일 때 좌변과 우변이 같습니까?`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "y",
            text: "같다(기초 단계 성립)",
          },
          {
            key: "n",
            text: "다르다(기초 단계 불성립)",
          },
        ],
        answer: offset === 0 ? "y" : "n",
        solution:
          `n=1일 때 좌변은 1, 우변은 ${1 + offset}이므로 ` +
          `${offset === 0 ? "같습니다." : "다릅니다."}`,
      };
    }
  },

  {
    id: "inequality-min",
    label: "유형 9 · 부등식 2ⁿ>n² 최소 n",
    difficulty: 3,

    generate() {
      const powers = [
        { exponent: 1, answer: 1 },
        { exponent: 2, answer: 5 },
        { exponent: 3, answer: 10 },
      ];
      const variant =
        powers[
          randomInteger(0, powers.length - 1)
        ];

      return {
        prompt:
          `n≥m인 모든 자연수에서 2ⁿ>n^${variant.exponent}이 ` +
          `성립하기 시작하는 최소 자연수 m을 구하세요.`,
        inputMode: "short-answer",
        answer: variant.answer,
        solution:
          `작은 자연수부터 비교하면 n=${variant.answer}부터 ` +
          `2ⁿ>n^${variant.exponent}이 계속 성립합니다.`,
      };
    }
  },

  {
    id: "odd-sum-check",
    label: "유형 10 · 홀수합 확인",
    difficulty: 2,

    generate() { const n = randomInteger(2, 7); let s = 0; for (let i = 1; i <= n; i++) s += 2 * i - 1;
          return { prompt: `1+3+…+(2×${n}−1) 이 ${n}² 과 같은지 확인하기 위해 좌변을 계산하세요.`, inputMode: "short-answer", answer: s, solution: `좌변=${s}=${n}².` }; }
  },
].map((problemType) =>
  createAlgebraProblemType(problemType, {
    conceptId: "algebra-03-07",
    conceptTitle: "수학적 귀납법",
  })
);

module.exports = {
  key: "algebra-mathematical-induction",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
