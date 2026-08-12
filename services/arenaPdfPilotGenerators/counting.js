"use strict";

const {
  choose,
  compositions,
  factorial,
  pick,
  positiveCompositions,
  randomInteger,
} = require("./core");

function countTwoColorByDynamicProgramming({
  whiteCount,
  blackCount,
  boxCount,
  minimumPerBox,
}) {
  let states = new Map([["0:0", 1]]);
  for (let box = 0; box < boxCount; box += 1) {
    const next = new Map();
    for (const [key, ways] of states) {
      const [usedWhite, usedBlack] = key.split(":").map(Number);
      for (let white = 0; usedWhite + white <= whiteCount; white += 1) {
        for (let black = 0; usedBlack + black <= blackCount; black += 1) {
          if (white + black < minimumPerBox) continue;
          const nextKey = `${usedWhite + white}:${usedBlack + black}`;
          next.set(nextKey, Number(next.get(nextKey) || 0) + ways);
        }
      }
    }
    states = next;
  }
  return Number(states.get(`${whiteCount}:${blackCount}`) || 0);
}

function enumerateTwoColorDistributions(parameters) {
  const whiteVectors = compositions(parameters.whiteCount, parameters.boxCount);
  const blackVectors = compositions(parameters.blackCount, parameters.boxCount);
  let count = 0;
  for (const white of whiteVectors) {
    for (const black of blackVectors) {
      if (
        white.every(
          (value, index) => value + black[index] >= parameters.minimumPerBox
        )
      ) {
        count += 1;
      }
    }
  }
  return count;
}

function feasibleTotalProfileCount(parameters) {
  const profiles = new Set();
  for (const white of compositions(parameters.whiteCount, parameters.boxCount)) {
    for (const black of compositions(parameters.blackCount, parameters.boxCount)) {
      const totals = white.map((value, index) => value + black[index]);
      if (totals.every((value) => value >= parameters.minimumPerBox)) {
        profiles.add(totals.join(","));
      }
    }
  }
  return profiles.size;
}

function countRecipientBoundsDp({ colorCounts, recipientTotalBounds }) {
  const [whiteCount, blackCount] = colorCounts;
  let states = new Map([["0:0", 1]]);
  for (const [lower, upper] of recipientTotalBounds) {
    const next = new Map();
    for (const [key, ways] of states) {
      const [usedWhite, usedBlack] = key.split(":").map(Number);
      for (let white = 0; usedWhite + white <= whiteCount; white += 1) {
        for (let black = 0; usedBlack + black <= blackCount; black += 1) {
          const total = white + black;
          if (total < lower || total > upper) continue;
          const nextKey = `${usedWhite + white}:${usedBlack + black}`;
          next.set(nextKey, Number(next.get(nextKey) || 0) + ways);
        }
      }
    }
    states = next;
  }
  return Number(states.get(`${whiteCount}:${blackCount}`) || 0);
}

function enumerateRecipientBounds(parameters) {
  const [whiteCount, blackCount] = parameters.colorCounts;
  const whiteVectors = compositions(whiteCount, 3);
  const blackVectors = compositions(blackCount, 3);
  let count = 0;
  for (const white of whiteVectors) {
    for (const black of blackVectors) {
      if (
        parameters.recipientTotalBounds.every(([lower, upper], index) => {
          const total = white[index] + black[index];
          return lower <= total && total <= upper;
        })
      ) {
        count += 1;
      }
    }
  }
  return count;
}

function positiveTupleCount(total, length) {
  if (length === 0) return total === 0 ? 1 : 0;
  return total >= length ? choose(total - 1, length - 1) : 0;
}

function excludedValueInclusionExclusion({ tupleLength, targetSum, excludedValue }) {
  let result = 0;
  for (let fixed = 0; fixed <= tupleLength; fixed += 1) {
    const term =
      choose(tupleLength, fixed) *
      positiveTupleCount(targetSum - fixed * excludedValue, tupleLength - fixed);
    result += fixed % 2 === 0 ? term : -term;
  }
  return result;
}

function excludedValueEnumeration(parameters) {
  return positiveCompositions(parameters.targetSum, parameters.tupleLength).filter(
    (tuple) => tuple.every((value) => value !== parameters.excludedValue)
  ).length;
}

function residueFormula({ tupleLength, targetSum, modulus, residueMultiplicity }) {
  const baseSum = residueMultiplicity.reduce(
    (sum, count, residue) => sum + count * (residue === 0 ? modulus : residue),
    0
  );
  const remainder = targetSum - baseSum;
  if (remainder < 0 || remainder % modulus !== 0) return 0;
  const quotientSum = remainder / modulus;
  const assignments =
    factorial(tupleLength) /
    residueMultiplicity.reduce((product, count) => product * factorial(count), 1);
  return Math.round(assignments * choose(quotientSum + tupleLength - 1, tupleLength - 1));
}

function residueEnumeration(parameters) {
  return positiveCompositions(parameters.targetSum, parameters.tupleLength).filter(
    (tuple) => {
      const counts = Array(parameters.modulus).fill(0);
      tuple.forEach((value) => {
        counts[value % parameters.modulus] += 1;
      });
      return counts.every(
        (count, residue) => count === parameters.residueMultiplicity[residue]
      );
    }
  ).length;
}

function isFemale(actor) {
  return String(actor).startsWith("F");
}

function circularCountDp(parameters, options = {}) {
  const actors = parameters.actors;
  const anchorIndex = 0;
  const required = new Set(parameters.requiredAdjacentPair);
  const forbiddenActor = parameters.forbiddenFemaleNeighborActor;
  const requirePair = options.requirePair !== false;
  const forbidFemale = options.forbidFemale !== false;
  const edgeAllowed = (leftIndex, rightIndex) => {
    const left = actors[leftIndex];
    const right = actors[rightIndex];
    if (!forbidFemale) return true;
    if (left === forbiddenActor && isFemale(right) && right !== forbiddenActor) return false;
    if (right === forbiddenActor && isFemale(left) && left !== forbiddenActor) return false;
    return true;
  };
  const requiredEdge = (leftIndex, rightIndex) =>
    required.has(actors[leftIndex]) && required.has(actors[rightIndex]);
  const fullMask = (1 << actors.length) - 1;
  const memo = new Map();
  function visit(mask, lastIndex, adjacencyMet) {
    const key = `${mask}:${lastIndex}:${adjacencyMet ? 1 : 0}`;
    if (memo.has(key)) return memo.get(key);
    if (mask === fullMask) {
      if (!edgeAllowed(lastIndex, anchorIndex)) return 0;
      const met = adjacencyMet || requiredEdge(lastIndex, anchorIndex);
      return !requirePair || met ? 1 : 0;
    }
    let count = 0;
    for (let nextIndex = 1; nextIndex < actors.length; nextIndex += 1) {
      if (mask & (1 << nextIndex)) continue;
      if (!edgeAllowed(lastIndex, nextIndex)) continue;
      count += visit(
        mask | (1 << nextIndex),
        nextIndex,
        adjacencyMet || requiredEdge(lastIndex, nextIndex)
      );
    }
    memo.set(key, count);
    return count;
  }
  return visit(1 << anchorIndex, anchorIndex, false);
}

function circularCountByPermutation(parameters) {
  const [anchor, ...remaining] = parameters.actors;
  const required = new Set(parameters.requiredAdjacentPair);
  const forbiddenActor = parameters.forbiddenFemaleNeighborActor;
  let count = 0;
  const order = [anchor];
  const used = Array(remaining.length).fill(false);
  function validEdge(left, right) {
    if (left === forbiddenActor && isFemale(right) && right !== forbiddenActor) return false;
    if (right === forbiddenActor && isFemale(left) && left !== forbiddenActor) return false;
    return true;
  }
  function visit() {
    if (order.length === parameters.actors.length) {
      if (!validEdge(order.at(-1), anchor)) return;
      const edges = order.map((actor, index) => [actor, order[(index + 1) % order.length]]);
      const adjacent = edges.some(
        ([left, right]) => required.has(left) && required.has(right)
      );
      if (adjacent) count += 1;
      return;
    }
    for (let index = 0; index < remaining.length; index += 1) {
      if (used[index]) continue;
      const actor = remaining[index];
      if (!validEdge(order.at(-1), actor)) continue;
      used[index] = true;
      order.push(actor);
      visit();
      order.pop();
      used[index] = false;
    }
  }
  visit();
  return count;
}

const countingDefinitions = [
  {
    id: "ARENA_PDF_PILOT_TWO_COLOR_BOX_MINIMUM",
    sourceReferenceId: "2020-09-KICE-GA-Q29",
    canonicalStructureId: "STR-PSCNT-DISTRIBUTION-PARTITION-COUNT-BM-NONE-AC32573A",
    title: "두 색 공을 최소 수량 조건으로 상자에 분배",
    courseId: "probability-statistics",
    build(random) {
      return {
        parameters: {
          whiteCount: randomInteger(random, 4, 8),
          blackCount: randomInteger(random, 4, 8),
          boxCount: randomInteger(random, 3, 4),
          minimumPerBox: randomInteger(random, 2, 3),
        },
      };
    },
    solve: countTwoColorByDynamicProgramming,
    crossCheck: enumerateTwoColorDistributions,
    degeneracyReasons(parameters, answer) {
      const unrestricted =
        choose(parameters.whiteCount + parameters.boxCount - 1, parameters.boxCount - 1) *
        choose(parameters.blackCount + parameters.boxCount - 1, parameters.boxCount - 1);
      return [
        ...(answer >= unrestricted ? ["minimum condition is redundant"] : []),
        ...(feasibleTotalProfileCount(parameters) < 2 ? ["single total profile"] : []),
      ];
    },
    render(parameters) {
      const labels = "ABCDE".slice(0, parameters.boxCount).split("").join(", ");
      return {
        prompt: `서로 구별하지 않는 흰 공 ${parameters.whiteCount}개와 검은 공 ${parameters.blackCount}개를 서로 다른 ${parameters.boxCount}개의 상자 ${labels}에 남김없이 나누어 넣는다. 각 상자에 공이 ${parameters.minimumPerBox}개 이상 들어가도록 하는 경우의 수를 구하여라.`,
        solution: "색별 분배 벡터를 만든 뒤, 각 상자의 두 색 공 개수 합이 하한을 만족하는 벡터쌍만 센다.",
      };
    },
  },
  {
    id: "ARENA_PDF_PILOT_RECIPIENT_COLOR_BOUNDS",
    sourceReferenceId: "2024-09-KICE-PROBABILITY_STATISTICS-Q30",
    canonicalStructureId: "STR-PSCNT-DISTRIBUTION-PARTITION-COUNT-B1-NONE-28C68A12",
    title: "두 색 공의 수령인별 상하한 분배",
    courseId: "probability-statistics",
    build(random) {
      const white = randomInteger(random, 4, 7);
      const black = randomInteger(random, 4, 7);
      const total = white + black;
      const upperA = randomInteger(random, 2, 4);
      const lowerB = randomInteger(random, 2, Math.min(5, total - upperA));
      return {
        parameters: {
          colorCounts: [white, black],
          recipientLabels: ["A", "B", "C"],
          recipientTotalBounds: [[0, upperA], [lowerB, total], [0, total]],
        },
      };
    },
    solve: countRecipientBoundsDp,
    crossCheck: enumerateRecipientBounds,
    degeneracyReasons(parameters, answer) {
      const [white, black] = parameters.colorCounts;
      const unrestricted = choose(white + 2, 2) * choose(black + 2, 2);
      return answer >= unrestricted ? ["recipient bounds are redundant"] : [];
    },
    render(parameters) {
      const [[, upperA], [lowerB]] = parameters.recipientTotalBounds;
      return {
        prompt: `서로 구별하지 않는 흰 공 ${parameters.colorCounts[0]}개와 검은 공 ${parameters.colorCounts[1]}개를 세 학생 A, B, C에게 남김없이 나누어 준다. A가 받는 공은 ${upperA}개 이하이고 B가 받는 공은 ${lowerB}개 이상일 때, 나누어 주는 경우의 수를 구하여라. 공을 받지 못하는 학생이 있을 수 있다.`,
        solution: "두 색의 약한 분할을 각각 만들고, 학생별 전체 수량의 상한과 하한을 동시에 검사한다.",
      };
    },
  },
  {
    id: "ARENA_PDF_PILOT_POSITIVE_SUM_EXCLUSION",
    sourceReferenceId: "2020-10-EDUCATION_OFFICE-NA-Q27",
    canonicalStructureId: "STR-PSCNT-POSITIVE-INTEGER-SUM-EXCLUSION-COUNT-B0-NONE-4B3D126D",
    title: "양의 정수 순서쌍의 합과 제외값 조건",
    courseId: "probability-statistics",
    build(random) {
      const tupleLength = randomInteger(random, 3, 4);
      return {
        parameters: {
          tupleLength,
          targetSum: randomInteger(random, tupleLength + 8, tupleLength + 20),
          excludedValue: randomInteger(random, 2, 5),
        },
      };
    },
    solve: excludedValueInclusionExclusion,
    crossCheck: excludedValueEnumeration,
    degeneracyReasons(parameters, answer) {
      const unrestricted = positiveTupleCount(parameters.targetSum, parameters.tupleLength);
      return answer >= unrestricted ? ["excluded value never occurs"] : [];
    },
    render(parameters) {
      const variables = "abcdef".slice(0, parameters.tupleLength).split("");
      return {
        prompt: `양의 정수 \\(${variables.join(", ")}\\)가 \\(${variables.join("+")}=${parameters.targetSum}\\)을 만족하고, 모든 성분이 \\(${parameters.excludedValue}\\)와 다르다. 가능한 순서쌍 \\((${variables.join(", ")})\\)의 개수를 구하여라.`,
        solution: "별과 막대로 전체를 센 뒤, 한 개 이상의 성분이 제외값과 같은 사건을 포함배제로 뺀다.",
      };
    },
  },
  {
    id: "ARENA_PDF_PILOT_RESIDUE_MULTIPLICITY",
    sourceReferenceId: "2016-04-EDUCATION_OFFICE-GA-Q28",
    canonicalStructureId: "STR-PSCNT-INTEGER-SUM-RESIDUE-CONSTRAINT-COUNT-B0-NONE-9E08ACB5",
    title: "고정합 순서쌍의 나머지 개수 조건",
    courseId: "probability-statistics",
    build(random) {
      const modulus = randomInteger(random, 3, 4);
      const tupleLength = randomInteger(random, 4, 5);
      const residueMultiplicity = Array(modulus).fill(0);
      for (let index = 0; index < tupleLength; index += 1) {
        residueMultiplicity[randomInteger(random, 0, modulus - 1)] += 1;
      }
      if (residueMultiplicity.filter((count) => count > 0).length < 2) {
        throw new Error("residue restriction collapsed to one class");
      }
      const baseSum = residueMultiplicity.reduce(
        (sum, count, residue) => sum + count * (residue === 0 ? modulus : residue),
        0
      );
      return {
        parameters: {
          tupleLength,
          modulus,
          residueMultiplicity,
          targetSum: baseSum + modulus * randomInteger(random, 2, 5),
        },
      };
    },
    solve: residueFormula,
    crossCheck: residueEnumeration,
    render(parameters) {
      const variables = "abcdefg".slice(0, parameters.tupleLength).split("");
      const residueText = parameters.residueMultiplicity
        .map((count, residue) => `나머지가 ${residue}인 수 ${count}개`)
        .join(", ");
      return {
        prompt: `자연수 \\(${variables.join(", ")}\\)의 합은 \\(${parameters.targetSum}\\)이다. 이들을 \\(${parameters.modulus}\\)로 나누었을 때 ${residueText}가 되도록 하는 순서쌍 \\((${variables.join(", ")})\\)의 개수를 구하여라.`,
        solution: "나머지별 위치를 먼저 선택하고, 각 수에서 최소 양의 대표를 뺀 몫들의 합을 별과 막대로 센다.",
      };
    },
  },
  {
    id: "ARENA_PDF_PILOT_CIRCULAR_ADJACENCY",
    sourceReferenceId: "2021-04-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q29",
    canonicalStructureId: "STR-PSCNT-CIRCULAR-ADJACENCY-ARRANGEMENT-COUNT-B1-LAYOUT-7142B77A",
    title: "회전동치 원순열의 인접·비인접 조건",
    courseId: "probability-statistics",
    build(random) {
      const [maleCount, femaleCount] = pick(random, [
        [3, 3], [3, 4], [3, 5], [3, 6], [4, 3], [4, 4], [5, 3],
      ]);
      const males = Array.from({ length: maleCount }, (_, index) => `M${index + 1}`);
      const females = Array.from({ length: femaleCount }, (_, index) => `F${index + 1}`);
      return {
        parameters: {
          maleCount,
          femaleCount,
          actors: [...males, ...females],
          requiredAdjacentPair: ["M1", "M2"],
          forbiddenFemaleNeighborActor: "F1",
        },
      };
    },
    solve: circularCountDp,
    crossCheck: circularCountByPermutation,
    degeneracyReasons(parameters, answer) {
      const withoutRequired = circularCountDp(parameters, { requirePair: false });
      const withoutForbidden = circularCountDp(parameters, { forbidFemale: false });
      return [
        ...(answer >= withoutRequired ? ["required adjacency has no effect"] : []),
        ...(answer >= withoutForbidden ? ["forbidden neighbor condition has no effect"] : []),
      ];
    },
    render(parameters) {
      return {
        prompt: `서로 다른 남학생 ${parameters.maleCount}명 M1, M2, …와 서로 다른 여학생 ${parameters.femaleCount}명 F1, F2, …가 일정한 간격으로 원탁에 앉는다. M1과 M2는 이웃하고, F1은 다른 여학생과 이웃하지 않도록 앉는 경우의 수를 구하여라. 회전하여 일치하는 것은 같은 것으로 본다.`,
        solution: "한 사람을 고정해 회전동치를 제거한 뒤, 양옆 관계를 순환 조건으로 검사한다.",
        visualization: {
          kind: "CIRCULAR_SEATING",
          seatCount: parameters.maleCount + parameters.femaleCount,
          requiredAdjacentPair: parameters.requiredAdjacentPair,
          forbiddenNeighborActor: parameters.forbiddenFemaleNeighborActor,
        },
      };
    },
  },
];

module.exports = {
  circularCountByPermutation,
  circularCountDp,
  countingDefinitions,
  countRecipientBoundsDp,
  countTwoColorByDynamicProgramming,
  enumerateRecipientBounds,
  enumerateTwoColorDistributions,
  excludedValueEnumeration,
  excludedValueInclusionExclusion,
  residueEnumeration,
  residueFormula,
};
