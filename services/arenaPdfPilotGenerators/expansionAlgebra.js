"use strict";

const {
  pick,
  randomInteger,
  rational,
  rationalAdd,
  rationalDiv,
  rationalMul,
  rationalText,
} = require("./core");

function rationalTex(value) {
  return value.d === 1n
    ? String(value.n)
    : `\\frac{${value.n}}{${value.d}}`;
}

function arithmeticIntegerSolutions(parameters, useClosedForm) {
  const solutions = [];
  for (let difference = -40; difference <= 40; difference += 1) {
    const secondThirdSum = 2 * parameters.firstTerm + 3 * difference;
    if (
      !(parameters.lowerSecondThirdSum < secondThirdSum) ||
      !(secondThirdSum <= parameters.upperSecondThirdSum)
    ) {
      continue;
    }
    if (useClosedForm) {
      for (let index = 1; index <= 60; index += 1) {
        const sum =
          (index * (2 * parameters.firstTerm + (index - 1) * difference)) / 2;
        if (sum === parameters.targetSum) {
          solutions.push({ difference, index, value: parameters.firstTerm + (index - 1) * difference });
        }
      }
      continue;
    }
    let sum = 0;
    let term = parameters.firstTerm;
    for (let index = 1; index <= 60; index += 1) {
      sum += term;
      if (sum === parameters.targetSum) {
        solutions.push({ difference, index, value: term });
      }
      term += difference;
    }
  }
  return solutions;
}

function arithmeticIntegerAnswer(parameters) {
  const solutions = arithmeticIntegerSolutions(parameters, false);
  if (solutions.length !== 1) throw new Error("arithmetic conditions are not unique");
  return solutions[0].value;
}

function arithmeticIntegerCrossCheck(parameters) {
  const solutions = arithmeticIntegerSolutions(parameters, true);
  if (solutions.length !== 1) throw new Error("closed-form arithmetic conditions are not unique");
  return solutions[0].value;
}

function divisorsByFactorPairs(value) {
  const result = new Set();
  for (let divisor = 1; divisor * divisor <= value; divisor += 1) {
    if (value % divisor !== 0) continue;
    result.add(divisor);
    result.add(value / divisor);
  }
  return [...result].sort((left, right) => left - right);
}

function naturalPowerConditionAnswer(parameters) {
  return divisorsByFactorPairs(parameters.radicalExponent)
    .filter((value) => value >= 2 && value % parameters.requiredMultiple === 0)
    .reduce((sum, value) => sum + value, 0);
}

function naturalPowerConditionCrossCheck(parameters) {
  let sum = 0;
  for (let n = 2; n <= parameters.radicalExponent; n += 1) {
    const firstExponent = n / parameters.requiredMultiple;
    const secondExponent = parameters.radicalExponent / n;
    if (Number.isInteger(firstExponent) && Number.isInteger(secondExponent)) sum += n;
  }
  return sum;
}

function expLogTrapezoidVertices(parameters) {
  const b = parameters.base;
  const u = parameters.lowerLevel;
  const k = u + 1;
  const multiplier = b ** 2;
  return [
    [b ** u / multiplier, u],
    [b ** u, u],
    [b ** k, k],
    [b ** k / multiplier, k],
  ];
}

function expLogTrapezoidAnswer(parameters) {
  const vertices = expLogTrapezoidVertices(parameters);
  const bottom = vertices[1][0] - vertices[0][0];
  const top = vertices[2][0] - vertices[3][0];
  const scaledArea = (parameters.areaScale * (bottom + top)) / 2;
  if (!Number.isInteger(scaledArea)) throw new Error("scaled trapezoid area is not integral");
  return scaledArea;
}

function expLogTrapezoidCrossCheck(parameters) {
  const vertices = expLogTrapezoidVertices(parameters);
  let doubledArea = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const [x1, y1] = vertices[index];
    const [x2, y2] = vertices[(index + 1) % vertices.length];
    doubledArea += x1 * y2 - y1 * x2;
  }
  return Math.round((parameters.areaScale * Math.abs(doubledArea)) / 2);
}

function arithmeticReciprocalAnswer(parameters) {
  const difference = rationalDiv(parameters.fourthSixthDifference, rational(2));
  const firstTerm = rationalDiv(
    rationalAdd(parameters.secondThirdSum, rationalMul(rational(-3), difference)),
    rational(2)
  );
  const reciprocal = rationalDiv(rational(1), firstTerm);
  if (reciprocal.d !== 1n) throw new Error("reciprocal is not integral");
  return Number(reciprocal.n);
}

function arithmeticReciprocalCrossCheck(parameters) {
  const difference = parameters.generatedDifference;
  const terms = Array.from({ length: 6 }, (_, index) =>
    rationalAdd(parameters.generatedFirstTerm, rational(index * difference))
  );
  const secondThird = rationalAdd(terms[1], terms[2]);
  const fourthSixth = rationalAdd(terms[5], rationalMul(rational(-1), terms[3]));
  if (
    rationalText(secondThird) !== rationalText(parameters.secondThirdSum) ||
    rationalText(fourthSixth) !== rationalText(parameters.fourthSixthDifference)
  ) {
    throw new Error("generated sequence does not satisfy its conditions");
  }
  return Number(rationalDiv(rational(1), terms[0]).n);
}

function exponentialRootAnswer(parameters) {
  return parameters.horizontalShift + parameters.reciprocalExponent;
}

function exponentialRootCrossCheck(parameters) {
  const x = exponentialRootAnswer(parameters);
  const left = parameters.base ** (-x + parameters.horizontalShift);
  const right = parameters.base ** (-parameters.reciprocalExponent);
  if (Math.abs(left - right) > 1e-12) throw new Error("exponential residual is nonzero");
  return x;
}

const algebraExpansionDefinitions = [
  {
    id: "ARENA_PDF_EXPANSION_ARITHMETIC_SUM_INDEX",
    sourceReferenceId: "2019-06-KICE-NA-Q28",
    canonicalStructureId: "STR-ALGSEQSUM-ARITHMETIC-GEOMETRIC-SUM-INTEGER-PARAMETER-B0-NONE-9884CE4C",
    title: "정수 공차 범위와 부분합으로 등차수열 항 복원",
    courseId: "algebra",
    build(random) {
      const firstTerm = randomInteger(random, 2, 8);
      const chosenDifference = randomInteger(random, 1, 6);
      const chosenIndex = randomInteger(random, 5, 18);
      const minimumDifference = Math.max(1, chosenDifference - 1);
      const maximumDifference = chosenDifference + 1;
      return {
        parameters: {
          firstTerm,
          lowerSecondThirdSum: 2 * firstTerm + 3 * minimumDifference - 1,
          upperSecondThirdSum: 2 * firstTerm + 3 * maximumDifference,
          targetSum:
            (chosenIndex * (2 * firstTerm + (chosenIndex - 1) * chosenDifference)) /
            2,
        },
      };
    },
    solve: arithmeticIntegerAnswer,
    crossCheck: arithmeticIntegerCrossCheck,
    degeneracyReasons(parameters, answer) {
      return answer > 999 ? ["answer overflow"] : [];
    },
    render(parameters) {
      return {
        prompt: `첫째항이 \\(${parameters.firstTerm}\\)이고 공차가 정수인 등차수열 \\(\\{a_n\\}\\)과 자연수 \\(m\\)이 \\(${parameters.lowerSecondThirdSum}<a_2+a_3\\le ${parameters.upperSecondThirdSum}\\), \\(\\sum_{k=1}^{m}a_k=${parameters.targetSum}\\)을 만족시킨다. \\(a_m\\)을 구하여라.`,
        solution: "부등식으로 가능한 정수 공차를 좁힌 뒤 각 공차의 부분합 식을 대입하여 유일한 자연수 지수를 찾는다.",
      };
    },
  },
  {
    id: "ARENA_PDF_EXPANSION_NATURAL_POWER_DIVISORS",
    sourceReferenceId: "2018-04-EDUCATION_OFFICE-NA-Q27",
    canonicalStructureId: "STR-ALGELEQ-EXP-LOG-INEQUALITY-INTEGER-SUM-B0-NONE-BCEA7AF0",
    title: "거듭제곱과 근호가 자연수가 되는 지수의 합",
    courseId: "algebra",
    build(random) {
      const requiredMultiple = pick(random, [2, 3, 4, 5, 6, 8]);
      const multiplier = randomInteger(random, 6, 24);
      return {
        parameters: {
          base: pick(random, [2, 3, 5, 7]),
          requiredMultiple,
          radicalExponent: requiredMultiple * multiplier,
        },
      };
    },
    solve: naturalPowerConditionAnswer,
    crossCheck: naturalPowerConditionCrossCheck,
    degeneracyReasons(parameters, answer) {
      return [
        ...(answer < 2 ? ["no admissible exponent"] : []),
        ...(answer > 999 ? ["answer overflow"] : []),
      ];
    },
    render(parameters) {
      const b = parameters.base;
      const l = parameters.requiredMultiple;
      return {
        prompt: `\\(2\\) 이상의 자연수 \\(n\\)에 대하여 \\((${b}^{n})^{1/${l}}\\)과 \\(\\sqrt[n]{${b}^{${parameters.radicalExponent}}}\\)이 모두 자연수가 되도록 하는 모든 \\(n\\)의 값의 합을 구하여라.`,
        solution: `두 식의 지수가 각각 자연수여야 하므로 \\(${l}\\mid n\\)이고 \\(n\\mid ${parameters.radicalExponent}\\)인 약수를 찾는다.`,
      };
    },
  },
  {
    id: "ARENA_PDF_EXPANSION_EXP_LOG_TRAPEZOID",
    sourceReferenceId: "2019-03-EDUCATION_OFFICE-GA-Q27",
    canonicalStructureId: "STR-ALGELGR-EXP-LOG-INTERSECTION-COUNT-AREA-B1-GEO-25ADA780",
    title: "평행한 로그곡선 절편으로 만든 사다리꼴 넓이",
    courseId: "algebra",
    build(random) {
      return {
        parameters: {
          base: pick(random, [2, 3]),
          lowerLevel: randomInteger(random, 1, 4),
          areaScale: pick(random, [2, 4, 6, 8, 10, 12]),
        },
      };
    },
    solve: expLogTrapezoidAnswer,
    crossCheck: expLogTrapezoidCrossCheck,
    degeneracyReasons(parameters, answer) {
      return answer > 999 ? ["answer overflow"] : [];
    },
    render(parameters) {
      const b = parameters.base;
      const u = parameters.lowerLevel;
      return {
        prompt: `두 곡선 \\(y=\\log_{${b}}(${b ** 2}x)\\), \\(y=\\log_{${b}}x\\)와 직선 \\(y=${u}\\)의 교점을 각각 \\(A,B\\)라 하자. 직선 \\(y=k\\;(k>${u})\\)와의 교점을 각각 \\(C,D\\)라 한다. \\(B\\)를 지나는 수직선이 \\(CD\\)를 \\(1:${b}\\)로 내분할 때, 사각형 \\(ABDC\\)의 넓이를 \\(S\\)라 하자. \\(${parameters.areaScale}S\\)를 구하여라.`,
        solution: "내분점 조건에서 윗변의 높이가 아래 높이보다 1 큼을 구하고, 두 수평 절편의 길이로 사다리꼴 넓이를 계산한다.",
        visualization: {
          kind: "EXP_LOG_TRAPEZOID",
          base: b,
          lowerLevel: u,
        },
      };
    },
  },
  {
    id: "ARENA_PDF_EXPANSION_ARITHMETIC_RECIPROCAL",
    sourceReferenceId: "2019-03-EDUCATION_OFFICE-NA-Q27",
    canonicalStructureId: "STR-ALGSEQSUM-ARITHMETIC-GEOMETRIC-SUM-SCALAR-VALUE-B0-NONE-A5D57327",
    title: "두 등차수열 조건에서 첫째항의 역수 복원",
    courseId: "algebra",
    build(random) {
      const reciprocalAnswer = randomInteger(random, 2, 35);
      const generatedFirstTerm = rational(1, reciprocalAnswer);
      const generatedDifference = randomInteger(random, 1, 9);
      return {
        parameters: {
          generatedFirstTerm,
          generatedDifference,
          secondThirdSum: rationalAdd(
            rationalMul(rational(2), generatedFirstTerm),
            rational(3 * generatedDifference)
          ),
          fourthSixthDifference: rational(2 * generatedDifference),
        },
      };
    },
    solve: arithmeticReciprocalAnswer,
    crossCheck: arithmeticReciprocalCrossCheck,
    render(parameters) {
      return {
        prompt: `모든 항이 실수인 등차수열 \\(\\{a_n\\}\\)이 \\(a_2+a_3=${rationalTex(parameters.secondThirdSum)}\\), \\(a_6-a_4=${rationalTex(parameters.fourthSixthDifference)}\\)를 만족시킬 때 \\(\\frac{1}{a_1}\\)의 값을 구하여라.`,
        solution: "둘째 식에서 공차를 구하고 첫째 식에 대입하여 첫째항을 복원한 뒤 역수를 취한다.",
      };
    },
  },
  {
    id: "ARENA_PDF_EXPANSION_EXPONENTIAL_ROOT",
    sourceReferenceId: "2016-06-KICE-GA-Q25",
    canonicalStructureId: "STR-ALGELEQ-EXP-LOG-ROOT-EQUATION-SCALAR-VALUE-B0-NONE-379FCD4E",
    title: "밑이 같은 지수방정식의 해",
    courseId: "algebra",
    build(random) {
      return {
        parameters: {
          base: pick(random, [2, 3, 4, 5, 7]),
          horizontalShift: randomInteger(random, -5, 12),
          reciprocalExponent: randomInteger(random, 1, 12),
        },
      };
    },
    solve: exponentialRootAnswer,
    crossCheck: exponentialRootCrossCheck,
    degeneracyReasons(parameters, answer) {
      return answer < 1 ? ["nonpositive Arena answer"] : [];
    },
    render(parameters) {
      return {
        prompt: `방정식 \\(${parameters.base}^{-x${parameters.horizontalShift < 0 ? "" : "+"}${parameters.horizontalShift}}=\\frac{1}{${parameters.base}^{${parameters.reciprocalExponent}}}\\)을 만족시키는 실수 \\(x\\)의 값을 구하여라.`,
        solution: "양변의 밑이 같고 1이 아니므로 지수를 서로 같게 놓아 일차방정식을 푼다.",
      };
    },
  },
];

module.exports = {
  algebraExpansionDefinitions,
};
