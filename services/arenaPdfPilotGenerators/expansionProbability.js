"use strict";

const {
  choose,
  gcdBigInt,
  pick,
  randomInteger,
  rational,
  rationalAdd,
  rationalMul,
  rationalSub,
  rationalText,
} = require("./core");

function rationalTex(value) {
  return value.d === 1n
    ? String(value.n)
    : `\\frac{${value.n}}{${value.d}}`;
}

function transformedDistributionAnswer(parameters) {
  const meanY = rationalAdd(
    rationalMul(rational(parameters.transformScale), parameters.meanX),
    rational(parameters.transformShift)
  );
  const varianceX = rationalSub(
    parameters.secondMomentX,
    rationalMul(parameters.meanX, parameters.meanX)
  );
  const result = rationalAdd(
    meanY,
    rationalMul(rational(parameters.transformScale ** 2), varianceX)
  );
  if (result.d !== 1n) throw new Error("distribution target is not integral");
  return Number(result.n);
}

function transformedDistributionCrossCheck(parameters) {
  let meanY = rational(0);
  let secondMomentY = rational(0);
  for (let index = 0; index < parameters.supportX.length; index += 1) {
    const y =
      parameters.transformScale * parameters.supportX[index] +
      parameters.transformShift;
    meanY = rationalAdd(
      meanY,
      rationalMul(rational(y), parameters.probabilities[index])
    );
    secondMomentY = rationalAdd(
      secondMomentY,
      rationalMul(rational(y * y), parameters.probabilities[index])
    );
  }
  const varianceY = rationalSub(
    secondMomentY,
    rationalMul(meanY, meanY)
  );
  const result = rationalAdd(meanY, varianceY);
  if (result.d !== 1n) throw new Error("enumerated distribution target is not integral");
  return Number(result.n);
}

function normalMeanAnswer(parameters) {
  return parameters.symmetryOffset + parameters.zScore * parameters.standardDeviation;
}

function normalMeanCrossCheck(parameters) {
  const mean = normalMeanAnswer(parameters);
  const k = parameters.symmetryOffset / 2 + parameters.zScore * parameters.standardDeviation;
  const leftZ = (k - mean) / parameters.standardDeviation;
  const mirroredZ =
    (parameters.symmetryOffset + k - mean) / parameters.standardDeviation;
  const tailZ = (2 * k - mean) / parameters.standardDeviation;
  if (Math.abs(leftZ + mirroredZ) > 1e-12) {
    throw new Error("normal symmetry condition failed");
  }
  if (Math.abs(tailZ - parameters.zScore) > 1e-12) {
    throw new Error("normal tail standardization failed");
  }
  return mean;
}

function countFunctionsByImageSet(parameters) {
  const n = parameters.domainSize;
  const targetImageSize = parameters.imageSize;
  const targetFixedPoints = parameters.fixedPointCount;
  let count = 0;
  for (let imageMask = 0; imageMask < 1 << n; imageMask += 1) {
    if (popcount(imageMask) !== targetImageSize) continue;
    const imageValues = Array.from({ length: n }, (_, index) => index).filter(
      (index) => imageMask & (1 << index)
    );
    function visit(domainIndex, hitMask, fixedPoints) {
      if (fixedPoints > targetFixedPoints) return;
      if (domainIndex === n) {
        if (hitMask === imageMask && fixedPoints === targetFixedPoints) count += 1;
        return;
      }
      for (const value of imageValues) {
        visit(
          domainIndex + 1,
          hitMask | (1 << value),
          fixedPoints + (value === domainIndex ? 1 : 0)
        );
      }
    }
    visit(0, 0, 0);
  }
  return count;
}

function countFunctionsByFullEnumeration(parameters) {
  const n = parameters.domainSize;
  let count = 0;
  const values = Array(n).fill(0);
  function visit(index) {
    if (index === n) {
      if (new Set(values).size !== parameters.imageSize) return;
      const fixed = values.reduce(
        (sum, value, position) => sum + (value === position ? 1 : 0),
        0
      );
      if (fixed === parameters.fixedPointCount) count += 1;
      return;
    }
    for (let value = 0; value < n; value += 1) {
      values[index] = value;
      visit(index + 1);
    }
  }
  visit(0);
  return count;
}

function popcount(value) {
  let remaining = value;
  let count = 0;
  while (remaining) {
    count += remaining & 1;
    remaining >>>= 1;
  }
  return count;
}

function combinationSelectionAnswer(parameters) {
  return (
    choose(parameters.firstGroupSize, parameters.firstSelection) *
    choose(parameters.secondGroupSize, parameters.secondSelection)
  );
}

function combinationSelectionCrossCheck(parameters) {
  const total = parameters.firstGroupSize + parameters.secondGroupSize;
  let count = 0;
  for (let mask = 0; mask < 1 << total; mask += 1) {
    let first = 0;
    let second = 0;
    for (let index = 0; index < total; index += 1) {
      if (!(mask & (1 << index))) continue;
      if (index < parameters.firstGroupSize) first += 1;
      else second += 1;
    }
    if (
      first === parameters.firstSelection &&
      second === parameters.secondSelection
    ) {
      count += 1;
    }
  }
  return count;
}

function binomialCoefficientAnswer(parameters) {
  return (
    choose(parameters.power, parameters.targetDegree) +
    parameters.linearCoefficient *
      choose(parameters.power, parameters.targetDegree - 1)
  );
}

function binomialCoefficientCrossCheck(parameters) {
  let coefficients = [1];
  for (let step = 0; step < parameters.power; step += 1) {
    const next = Array(coefficients.length + 1).fill(0);
    coefficients.forEach((coefficient, degree) => {
      next[degree] += coefficient;
      next[degree + 1] += coefficient;
    });
    coefficients = next;
  }
  const multiplied = Array(coefficients.length + 1).fill(0);
  coefficients.forEach((coefficient, degree) => {
    multiplied[degree] += coefficient;
    multiplied[degree + 1] += parameters.linearCoefficient * coefficient;
  });
  return multiplied[parameters.targetDegree] || 0;
}

function binomialVarianceAnswer(parameters) {
  const recoveredP = rational(
    parameters.affineExpectation - parameters.expectationShift,
    parameters.expectationScale * parameters.trialCount
  );
  const variance = rationalMul(
    rational(parameters.varianceScale ** 2 * parameters.trialCount),
    rationalMul(recoveredP, rationalSub(rational(1), recoveredP))
  );
  if (variance.d !== 1n) throw new Error("binomial variance is not integral");
  return Number(variance.n);
}

function binomialVarianceCrossCheck(parameters) {
  let expectation = rational(0);
  let secondMoment = rational(0);
  const p = parameters.probability;
  const q = rationalSub(rational(1), p);
  for (let successes = 0; successes <= parameters.trialCount; successes += 1) {
    const probability = rationalMul(
      rational(choose(parameters.trialCount, successes)),
      rationalMul(
        rational(p.n ** BigInt(successes), p.d ** BigInt(successes)),
        rational(q.n ** BigInt(parameters.trialCount - successes), q.d ** BigInt(parameters.trialCount - successes))
      )
    );
    const transformed =
      parameters.varianceScale * successes + parameters.varianceShift;
    expectation = rationalAdd(
      expectation,
      rationalMul(rational(transformed), probability)
    );
    secondMoment = rationalAdd(
      secondMoment,
      rationalMul(rational(transformed ** 2), probability)
    );
  }
  const variance = rationalSub(
    secondMoment,
    rationalMul(expectation, expectation)
  );
  if (variance.d !== 1n) throw new Error("enumerated binomial variance is not integral");
  return Number(variance.n);
}

function repeatedLetterAnswer(parameters) {
  let excluded = 0;
  for (let count = 0; count < parameters.minimumDesignatedCount; count += 1) {
    excluded +=
      choose(parameters.wordLength, count) *
      (parameters.alphabetSize - 1) ** (parameters.wordLength - count);
  }
  return parameters.alphabetSize ** parameters.wordLength - excluded;
}

function repeatedLetterCrossCheck(parameters) {
  let count = 0;
  const word = Array(parameters.wordLength).fill(0);
  function visit(index) {
    if (index === parameters.wordLength) {
      if (word.filter((value) => value === 0).length >= parameters.minimumDesignatedCount) {
        count += 1;
      }
      return;
    }
    for (let letter = 0; letter < parameters.alphabetSize; letter += 1) {
      word[index] = letter;
      visit(index + 1);
    }
  }
  visit(0);
  return count;
}

function disjointSubsetAnswer(parameters) {
  return 2 ** (parameters.universeSize - parameters.forbiddenSize);
}

function disjointSubsetCrossCheck(parameters) {
  let count = 0;
  const forbiddenMask = (1 << parameters.forbiddenSize) - 1;
  for (let mask = 0; mask < 1 << parameters.universeSize; mask += 1) {
    if ((mask & forbiddenMask) === 0) count += 1;
  }
  return count;
}

const probabilityExpansionDefinitions = [
  {
    id: "ARENA_PDF_EXPANSION_DISTRIBUTION_TABLE_AFFINE",
    sourceReferenceId: "2020-09-KICE-NA-Q27",
    canonicalStructureId: "STR-PSRV-DISTRIBUTION-TABLE-SCALAR-VALUE-B1-NONE-2A9FC2A1",
    title: "이산확률분포표의 선형변환 평균과 분산",
    courseId: "probability-statistics",
    build(random) {
      const weights = pick(random, [
        [1, 2, 3, 4],
        [2, 1, 4, 3],
        [3, 2, 1, 4],
        [4, 1, 2, 3],
        [1, 4, 2, 3],
      ]);
      const denominator = weights.reduce((sum, value) => sum + value, 0);
      const supportX = [1, 2, 3, 4];
      const probabilities = weights.map((weight) => rational(weight, denominator));
      const meanX = supportX.reduce(
        (sum, value, index) =>
          rationalAdd(sum, rationalMul(rational(value), probabilities[index])),
        rational(0)
      );
      const secondMomentX = supportX.reduce(
        (sum, value, index) =>
          rationalAdd(sum, rationalMul(rational(value ** 2), probabilities[index])),
        rational(0)
      );
      return {
        parameters: {
          supportX,
          probabilities,
          meanX,
          secondMomentX,
          transformScale: randomInteger(random, 2, 9),
          transformShift: randomInteger(random, 1, 8),
        },
      };
    },
    solve: transformedDistributionAnswer,
    crossCheck: transformedDistributionCrossCheck,
    render(parameters) {
      const yValues = parameters.supportX.map(
        (value) => parameters.transformScale * value + parameters.transformShift
      );
      return {
        prompt: `두 이산확률변수 \\(X,Y\\)가 같은 확률 \\(p_1,p_2,p_3,p_4\\)로 각각 \\(X=${parameters.supportX.join(",")}\\), \\(Y=${yValues.join(",")}\\)의 값을 갖는다. \\(E(X)=${rationalTex(parameters.meanX)},\\ E(X^2)=${rationalTex(parameters.secondMomentX)}\\)일 때 \\(E(Y)+V(Y)\\)를 구하여라.`,
        solution: `\\(Y=${parameters.transformScale}X+${parameters.transformShift}\\)이므로 평균의 선형성과 \\(V(aX+b)=a^2V(X)\\)를 적용한다.`,
      };
    },
  },
  {
    id: "ARENA_PDF_EXPANSION_NORMAL_SYMMETRY_STANDARDIZATION",
    sourceReferenceId: "2018-07-EDUCATION_OFFICE-NA-Q28",
    canonicalStructureId: "STR-PSNORM-NORMAL-STANDARDIZATION-SCALAR-VALUE-B0-TABLE-D7AB4FB4",
    title: "정규분포의 대칭성과 표준화로 평균 복원",
    courseId: "probability-statistics",
    build(random) {
      const zScore = pick(random, [0.5, 1, 1.5, 2]);
      const standardDeviation = randomInteger(random, 2, 12) * 2;
      const symmetryOffset = randomInteger(random, 10, 80) * 2;
      return { parameters: { zScore, standardDeviation, symmetryOffset } };
    },
    solve: normalMeanAnswer,
    crossCheck: normalMeanCrossCheck,
    render(parameters) {
      const k = parameters.symmetryOffset / 2 + parameters.zScore * parameters.standardDeviation;
      const tail = { 0.5: "0.3085", 1: "0.1587", 1.5: "0.0668", 2: "0.0228" }[
        parameters.zScore
      ];
      return {
        prompt: `확률변수 \\(X\\)가 평균 \\(m\\), 표준편차 \\(${parameters.standardDeviation}\\)인 정규분포를 따른다. \\(P(X\\le k)+P(X\\le ${parameters.symmetryOffset}+k)=1\\), \\(P(X\\ge 2k)=${tail}\\)이고 \\(k=${k}\\)일 때 \\(m\\)을 구하여라. (표준정규분포표의 해당 값은 \\(z=${parameters.zScore}\\)이다.)`,
        solution: "첫 조건에서 두 경계의 중점이 평균이고, 둘째 조건을 표준화하여 평균을 결정한다.",
        visualization: {
          kind: "NORMAL_TABLE",
          rows: [
            ["0.5", "0.1915"],
            ["1.0", "0.3413"],
            ["1.5", "0.4332"],
            ["2.0", "0.4772"],
          ],
        },
      };
    },
  },
  {
    id: "ARENA_PDF_EXPANSION_FUNCTION_IMAGE_FIXED_POINTS",
    sourceReferenceId: "2019-06-KICE-GA-Q25",
    canonicalStructureId: "STR-PSCNT-MONOTONE-RANGE-CARDINALITY-FUNCTION-COUNT-B0-NONE-CF3D9E9A",
    title: "치역 원소 수와 고정점 수를 지정한 함수 개수",
    courseId: "probability-statistics",
    build(random) {
      const domainSize = randomInteger(random, 3, 5);
      return {
        parameters: {
          domainSize,
          imageSize: randomInteger(random, 1, domainSize),
          fixedPointCount: randomInteger(random, 0, domainSize),
        },
      };
    },
    solve: countFunctionsByImageSet,
    crossCheck: countFunctionsByFullEnumeration,
    degeneracyReasons(parameters, answer) {
      return [
        ...(answer < 2 ? ["fewer than two functions"] : []),
        ...(answer > 999 ? ["answer overflow"] : []),
      ];
    },
    render(parameters) {
      return {
        prompt: `집합 \\(X=\\{1,2,\\ldots,${parameters.domainSize}\\}\\)에 대하여 함수 \\(f:X\\to X\\) 중 치역의 원소 수가 \\(${parameters.imageSize}\\)이고 \\(f(a)=a\\)인 원소 \\(a\\)의 개수가 \\(${parameters.fixedPointCount}\\)인 함수의 개수를 구하여라.`,
        solution: "가능한 치역을 먼저 고른 뒤, 치역을 모두 사용하면서 지정된 수의 고정점만 갖는 대응을 센다.",
      };
    },
  },
  {
    id: "ARENA_PDF_EXPANSION_GROUP_COMBINATION_SELECTION",
    sourceReferenceId: "2016-06-KICE-GA-Q24",
    canonicalStructureId: "STR-PSCNT-COMBINATION-SELECTION-COUNT-B1-NONE-77E808AA",
    title: "두 집단에서 인원 수를 지정한 조합 선택",
    courseId: "probability-statistics",
    build(random) {
      return {
        parameters: {
          firstGroupSize: randomInteger(random, 4, 8),
          secondGroupSize: randomInteger(random, 3, 7),
          firstSelection: randomInteger(random, 1, 4),
          secondSelection: randomInteger(random, 1, 3),
        },
      };
    },
    solve: combinationSelectionAnswer,
    crossCheck: combinationSelectionCrossCheck,
    degeneracyReasons(parameters, answer) {
      return [
        ...(parameters.firstSelection > parameters.firstGroupSize ||
        parameters.secondSelection > parameters.secondGroupSize
          ? ["selection exceeds group"]
          : []),
        ...(answer > 999 ? ["answer overflow"] : []),
      ];
    },
    render(parameters) {
      return {
        prompt: `어느 동아리에 1학년이 ${parameters.firstGroupSize}명, 2학년이 ${parameters.secondGroupSize}명 있다. 이 중 1학년 ${parameters.firstSelection}명과 2학년 ${parameters.secondSelection}명을 뽑는 경우의 수를 구하여라.`,
        solution: `두 학년에서 독립적으로 뽑으므로 \\(\\binom{${parameters.firstGroupSize}}{${parameters.firstSelection}}\\binom{${parameters.secondGroupSize}}{${parameters.secondSelection}}\\)을 계산한다.`,
      };
    },
  },
  {
    id: "ARENA_PDF_EXPANSION_BINOMIAL_PRODUCT_COEFFICIENT",
    sourceReferenceId: "2018-06-KICE-NA-Q26",
    canonicalStructureId: "STR-PSCNT-BINOMIAL-COEFFICIENT-COEFFICIENT-B0-NONE-C39EE8B4",
    title: "일차식과 이항식의 곱에서 특정 차수 계수",
    courseId: "probability-statistics",
    build(random) {
      const power = randomInteger(random, 4, 9);
      return {
        parameters: {
          power,
          linearCoefficient: randomInteger(random, 1, 5),
          targetDegree: randomInteger(random, 2, power),
        },
      };
    },
    solve: binomialCoefficientAnswer,
    crossCheck: binomialCoefficientCrossCheck,
    degeneracyReasons(parameters, answer) {
      return answer > 999 ? ["answer overflow"] : [];
    },
    render(parameters) {
      return {
        prompt: `다항식 \\((1+${parameters.linearCoefficient}x)(1+x)^{${parameters.power}}\\)의 전개식에서 \\(x^{${parameters.targetDegree}}\\)의 계수를 구하여라.`,
        solution: "첫 인자에서 상수항을 고르는 경우와 일차항을 고르는 경우의 계수를 더한다.",
      };
    },
  },
  {
    id: "ARENA_PDF_EXPANSION_BINOMIAL_AFFINE_VARIANCE",
    sourceReferenceId: "2019-07-EDUCATION_OFFICE-GA-Q24",
    canonicalStructureId: "STR-PSRV-BINOMIAL-DISTRIBUTION-SCALAR-VALUE-B0-NONE-A8CBD9FB",
    title: "이항분포의 선형변환 평균에서 분산 복원",
    courseId: "probability-statistics",
    build(random) {
      const denominator = pick(random, [2, 3, 4, 5]);
      const numerator = randomInteger(random, 1, denominator - 1);
      const trialCount = randomInteger(random, 4, 18) * denominator;
      const expectationScale = randomInteger(random, 1, 4);
      const expectationShift = randomInteger(random, -6, 6);
      const varianceScale = randomInteger(random, 1, 5) * denominator;
      const varianceShift = randomInteger(random, -5, 5);
      const probability = rational(numerator, denominator);
      const affineExpectation =
        expectationScale * trialCount * Number(probability.n) / Number(probability.d) +
        expectationShift;
      return {
        parameters: {
          trialCount,
          probability,
          expectationScale,
          expectationShift,
          affineExpectation,
          varianceScale,
          varianceShift,
        },
      };
    },
    solve: binomialVarianceAnswer,
    crossCheck: binomialVarianceCrossCheck,
    degeneracyReasons(parameters, answer) {
      return answer > 999 ? ["answer overflow"] : [];
    },
    render(parameters) {
      return {
        prompt: `이항분포 \\(B(${parameters.trialCount},p)\\)를 따르는 확률변수 \\(X\\)에 대하여 \\(E(${parameters.expectationScale}X${parameters.expectationShift < 0 ? "" : "+"}${parameters.expectationShift})=${parameters.affineExpectation}\\)이다. \\(V(${parameters.varianceScale}X${parameters.varianceShift < 0 ? "" : "+"}${parameters.varianceShift})\\)의 값을 구하여라.`,
        solution: "평균 조건에서 \\(p\\)를 구한 뒤 \\(V(aX+b)=a^2np(1-p)\\)를 적용한다.",
      };
    },
  },
  {
    id: "ARENA_PDF_EXPANSION_REPEATED_LETTER_ARRANGEMENT",
    sourceReferenceId: "2018-06-KICE-GA-Q27",
    canonicalStructureId: "STR-PSCNT-PERMUTATION-ARRANGEMENT-COUNT-B1-NONE-05AA42B7",
    title: "중복 허용 문자열에서 지정 문자의 최소 출현 횟수",
    courseId: "probability-statistics",
    build(random) {
      return {
        parameters: {
          alphabetSize: randomInteger(random, 3, 5),
          wordLength: randomInteger(random, 3, 6),
          minimumDesignatedCount: randomInteger(random, 2, 3),
        },
      };
    },
    solve: repeatedLetterAnswer,
    crossCheck: repeatedLetterCrossCheck,
    degeneracyReasons(parameters, answer) {
      return [
        ...(parameters.minimumDesignatedCount > parameters.wordLength
          ? ["impossible multiplicity"]
          : []),
        ...(answer > 999 ? ["answer overflow"] : []),
      ];
    },
    render(parameters) {
      const letters = "abcde".slice(0, parameters.alphabetSize).split("").join(", ");
      return {
        prompt: `문자 ${letters} 중에서 중복을 허락하여 ${parameters.wordLength}개를 택해 일렬로 나열할 때, 문자 \\(a\\)가 ${parameters.minimumDesignatedCount}번 이상 나오는 경우의 수를 구하여라.`,
        solution: "전체 문자열 수에서 지정 문자의 출현 횟수가 기준보다 작은 경우를 이항계수로 세어 뺀다.",
      };
    },
  },
  {
    id: "ARENA_PDF_EXPANSION_DISJOINT_SUBSET_COUNT",
    sourceReferenceId: "2017-06-KICE-NA-Q24",
    canonicalStructureId: "STR-CM2SET-SET-OPERATION-COUNT-COUNT-B0-NONE-730F061E",
    title: "고정 부분집합과 서로소인 부분집합 개수",
    courseId: "common-math-2",
    build(random) {
      const universeSize = randomInteger(random, 5, 12);
      return {
        parameters: {
          universeSize,
          forbiddenSize: randomInteger(random, Math.max(1, universeSize - 9), universeSize - 1),
        },
      };
    },
    solve: disjointSubsetAnswer,
    crossCheck: disjointSubsetCrossCheck,
    render(parameters) {
      const forbidden = Array.from(
        { length: parameters.forbiddenSize },
        (_, index) => index + 1
      ).join(",");
      return {
        prompt: `전체집합 \\(U=\\{1,2,\\ldots,${parameters.universeSize}\\}\\)의 부분집합 \\(A\\) 중 \\(\\{${forbidden}\\}\\cap A=\\varnothing\\)을 만족시키는 \\(A\\)의 개수를 구하여라.`,
        solution: "금지된 원소를 제외한 각 원소는 포함하거나 포함하지 않는 두 선택을 독립적으로 갖는다.",
      };
    },
  },
];

module.exports = {
  probabilityExpansionDefinitions,
};
