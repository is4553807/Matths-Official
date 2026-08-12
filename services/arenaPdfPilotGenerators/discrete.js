"use strict";

const {
  gcdBigInt,
  randomInteger,
  rational,
  shuffle,
} = require("./core");

function countDigitsByDp({ minimumDigits, maximumDigits, digitSum, parity }) {
  let totalCount = 0;
  for (let length = minimumDigits; length <= maximumDigits; length += 1) {
    const memo = new Map();
    function visit(position, accumulated) {
      const key = `${position}:${accumulated}`;
      if (memo.has(key)) return memo.get(key);
      if (position === length) return accumulated === digitSum ? 1 : 0;
      let count = 0;
      const minimumDigit = position === 0 ? 1 : 0;
      for (let digit = minimumDigit; digit <= 9; digit += 1) {
        if (position === length - 1) {
          const requiredParity = parity === "ODD" ? 1 : 0;
          if (digit % 2 !== requiredParity) continue;
        }
        if (accumulated + digit > digitSum) continue;
        count += visit(position + 1, accumulated + digit);
      }
      memo.set(key, count);
      return count;
    }
    totalCount += visit(0, 0);
  }
  return totalCount;
}

function countDigitsByScan(parameters) {
  const lower = 10 ** (parameters.minimumDigits - 1);
  const upper = 10 ** parameters.maximumDigits - 1;
  const requiredParity = parameters.parity === "ODD" ? 1 : 0;
  let count = 0;
  for (let value = lower; value <= upper; value += 1) {
    if (value % 2 !== requiredParity) continue;
    const sum = String(value)
      .split("")
      .reduce((result, digit) => result + Number(digit), 0);
    if (sum === parameters.digitSum) count += 1;
  }
  return count;
}

function walkCountsByDp(parameters) {
  let states = new Map([["0:null", 1n]]);
  for (let trial = 1; trial <= parameters.trialCount; trial += 1) {
    const next = new Map();
    for (const [key, ways] of states) {
      const [coordinateText, maximumText] = key.split(":");
      const coordinate = Number(coordinateText);
      const previousMaximum = maximumText === "null" ? null : Number(maximumText);
      for (const step of parameters.stepMap) {
        const nextCoordinate = coordinate + step;
        const anchored = parameters.anchoredCoordinates[trial];
        if (anchored !== undefined && nextCoordinate !== anchored) continue;
        const nextMaximum =
          previousMaximum === null
            ? nextCoordinate
            : Math.max(previousMaximum, nextCoordinate);
        const nextKey = `${nextCoordinate}:${nextMaximum}`;
        next.set(nextKey, (next.get(nextKey) || 0n) + ways);
      }
    }
    states = next;
  }
  let denominator = 0n;
  let numerator = 0n;
  for (const [key, ways] of states) {
    denominator += ways;
    const maximum = Number(key.split(":")[1]);
    if (maximum === parameters.targetMaximum) numerator += ways;
  }
  return { numerator, denominator };
}

function walkCountsByEnumeration(parameters) {
  let numerator = 0n;
  let denominator = 0n;
  function visit(trial, coordinate, maximum) {
    if (trial > parameters.trialCount) {
      denominator += 1n;
      if (maximum === parameters.targetMaximum) numerator += 1n;
      return;
    }
    for (let face = 0; face < 6; face += 1) {
      const nextCoordinate = coordinate + parameters.stepMap[face];
      const anchored = parameters.anchoredCoordinates[trial];
      if (anchored !== undefined && nextCoordinate !== anchored) continue;
      const nextMaximum = maximum === null ? nextCoordinate : Math.max(maximum, nextCoordinate);
      visit(trial + 1, nextCoordinate, nextMaximum);
    }
  }
  visit(1, 0, null);
  return { numerator, denominator };
}

function probabilityAnswerFromCounts({ numerator, denominator }) {
  if (numerator <= 0n || denominator <= numerator) {
    throw new Error("conditional maximum event must be nonempty and proper");
  }
  const divisor = gcdBigInt(numerator, denominator);
  const reduced = rational(numerator / divisor, denominator / divisor);
  return Number(reduced.n + reduced.d);
}

function walkProbabilityAnswer(parameters) {
  return probabilityAnswerFromCounts(walkCountsByDp(parameters));
}

function walkProbabilityCrossCheck(parameters) {
  return probabilityAnswerFromCounts(walkCountsByEnumeration(parameters));
}

const discreteDefinitions = [
  {
    id: "ARENA_PDF_PILOT_DIGIT_SUM_PARITY",
    sourceReferenceId: "2016-03-EDUCATION_OFFICE-GA-Q27",
    canonicalStructureId: "STR-PSCNT-DIGIT-INTEGER-CONSTRUCTION-COUNT-B1-NONE-A70A9C69",
    title: "자릿수 합과 홀짝 조건을 갖는 자연수 개수",
    courseId: "probability-statistics",
    build(random) {
      const minimumDigits = randomInteger(random, 2, 3);
      const maximumDigits = randomInteger(random, Math.max(3, minimumDigits), 4);
      return {
        parameters: {
          minimumDigits,
          maximumDigits,
          digitSum: randomInteger(random, 5, Math.min(22, 7 * maximumDigits)),
          parity: randomInteger(random, 0, 1) === 0 ? "EVEN" : "ODD",
        },
      };
    },
    solve: countDigitsByDp,
    crossCheck: countDigitsByScan,
    degeneracyReasons(parameters, answer) {
      return answer < 2 ? ["fewer than two admissible integers"] : [];
    },
    render(parameters) {
      const lower = 10 ** (parameters.minimumDigits - 1);
      const upper = 10 ** parameters.maximumDigits - 1;
      const parity = parameters.parity === "ODD" ? "홀수" : "짝수";
      return {
        prompt: `\\(${lower}\\) 이상 \\(${upper}\\) 이하의 ${parity}인 자연수 \\(N\\) 중에서 각 자리 숫자의 합이 \\(${parameters.digitSum}\\)인 \\(N\\)의 개수를 구하여라.`,
        solution: "자릿수, 현재까지의 숫자 합, 마지막 자리의 홀짝을 상태로 하는 자릿수 DP로 센다.",
      };
    },
  },
  {
    id: "ARENA_PDF_PILOT_CONDITIONED_DIE_WALK",
    sourceReferenceId: "2026-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q30",
    canonicalStructureId: "STR-PSAXM-REPEATED-TRIAL-STATE-TRANSITION-PROBABILITY-B0-NONE-D3470457",
    title: "조건부 종점이 있는 유한상태 주사위 보행",
    courseId: "probability-statistics",
    build(random) {
      const upFaceCount = randomInteger(random, 1, 2);
      const downFaceCount = randomInteger(random, 1, 2);
      const stepMap = shuffle(random, [
        ...Array(upFaceCount).fill(1),
        ...Array(downFaceCount).fill(-1),
        ...Array(6 - upFaceCount - downFaceCount).fill(0),
      ]);
      const trialCount = randomInteger(random, 5, 6);
      return {
        parameters: {
          trialCount,
          stepMap,
          anchoredCoordinates: { 1: 0, [trialCount]: 1 },
          targetMaximum: 2,
        },
      };
    },
    solve: walkProbabilityAnswer,
    crossCheck: walkProbabilityCrossCheck,
    render(parameters) {
      const positiveFaces = parameters.stepMap
        .map((step, index) => (step === 1 ? index + 1 : null))
        .filter(Boolean);
      const negativeFaces = parameters.stepMap
        .map((step, index) => (step === -1 ? index + 1 : null))
        .filter(Boolean);
      return {
        prompt: `수직선의 원점에 점 \\(P\\)가 있다. 주사위를 던져 ${positiveFaces.join(", ")} 중 하나가 나오면 \\(+1\\), ${negativeFaces.join(", ")} 중 하나가 나오면 \\(-1\\)만큼 이동하고 나머지 눈에서는 움직이지 않는다. 이를 \\(${parameters.trialCount}\\)번 반복하고 \\(n\\)번째 시행 후 좌표를 \\(a_n\\)이라 하자. \\(a_1=0,\\ a_${parameters.trialCount}=1\\)일 때, \\(a_1,\\ldots,a_${parameters.trialCount}\\)의 최댓값이 \\(${parameters.targetMaximum}\\)일 조건부확률을 \\(q/p\\)라 하자. \\(p,q\\)가 서로소일 때 \\(p+q\\)를 구하여라.`,
        solution: "시행 횟수, 현재 좌표, 지금까지의 최댓값을 상태로 두고 끝점 조건을 만족하는 전체 경로와 목표 사건 경로를 각각 센다.",
      };
    },
  },
];

module.exports = {
  countDigitsByDp,
  countDigitsByScan,
  discreteDefinitions,
  walkCountsByDp,
  walkCountsByEnumeration,
  walkProbabilityAnswer,
  walkProbabilityCrossCheck,
};
