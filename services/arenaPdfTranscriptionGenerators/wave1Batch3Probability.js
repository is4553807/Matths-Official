"use strict";

const {
  choose,
  positiveNumeratorDenominatorSum,
  randomInteger,
  rational,
  rationalAdd,
  rationalDiv,
  rationalMul,
} = require("../arenaPdfPilotGenerators/core");

function meta(sourceReferenceId, title) {
  return {
    id: `ARENA_PDF_TX_${sourceReferenceId.replaceAll("-", "_")}`,
    sourceReferenceId,
    title,
  };
}

function divisorCount(value) {
  let count = 0;
  for (let divisor = 1; divisor * divisor <= value; divisor += 1) {
    if (value % divisor !== 0) continue;
    count += divisor * divisor === value ? 1 : 2;
  }
  return count;
}

function makeDivisorProductCards(sourceReferenceId) {
  function aggregate(parameters) {
    let event = 0;
    let favorable = 0;
    for (let left = 1; left <= parameters.maxLabel; left += 1) {
      for (let right = left; right <= parameters.maxLabel; right += 1) {
        const weight = left === right ? choose(left, 2) : left * right;
        if (divisorCount(left * right) > parameters.divisorLimit) continue;
        event += weight;
        if ((left + right) % 2 === 0) favorable += weight;
      }
    }
    return rational(favorable, event);
  }
  return {
    ...meta(sourceReferenceId, "곱의 약수 개수로 거른 카드쌍의 조건부확률"),
    build(random) {
      return { parameters: { maxLabel: randomInteger(random, 4, 6), divisorLimit: randomInteger(random, 2, 5) } };
    },
    solve(parameters) {
      return positiveNumeratorDenominatorSum(aggregate(parameters));
    },
    crossCheck(parameters) {
      const cards = [];
      for (let label = 1; label <= parameters.maxLabel; label += 1) for (let copy = 0; copy < label; copy += 1) cards.push(label);
      let event = 0;
      let favorable = 0;
      for (let left = 0; left < cards.length; left += 1) {
        for (let right = left + 1; right < cards.length; right += 1) {
          if (divisorCount(cards[left] * cards[right]) > parameters.divisorLimit) continue;
          event += 1;
          if ((cards[left] + cards[right]) % 2 === 0) favorable += 1;
        }
      }
      return positiveNumeratorDenominatorSum(rational(favorable, event));
    },
    render(parameters, answer) {
      return {
        prompt: `숫자 \\(i\\)가 적힌 카드가 \\(i\\)장씩 있다 \\((1\\le i\\le${parameters.maxLabel})\\). 서로 다른 물리적 카드 2장을 동시에 뽑아 숫자를 \\(X,Y\\)라 하자. \\(XY\\)의 양의 약수 개수가 ${parameters.divisorLimit} 이하라는 조건에서 \\(X+Y\\)가 짝수일 확률을 \\(q/p\\)라 할 때 \\(p+q\\)를 구하여라.`,
        solution: `라벨쌍마다 실제 카드의 중복도를 곱해 조건부 표본공간을 세고 약분하면 성분의 합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeTripleGapConditional(sourceReferenceId) {
  function counts(parameters) {
    let event = 0;
    let favorable = 0;
    for (let a = 1; a <= parameters.maximum; a += 1) {
      for (let b = a + 1; b <= parameters.maximum; b += 1) {
        for (let c = b + 1; c <= parameters.maximum; c += 1) {
          if (b - a < parameters.minimumFirstGap) continue;
          event += 1;
          if (c - a >= parameters.minimumSpan) favorable += 1;
        }
      }
    }
    return { event, favorable };
  }
  return {
    ...meta(sourceReferenceId, "첫 간격 조건 아래 전체 폭의 조건부확률"),
    build(random) {
      const maximum = randomInteger(random, 9, 14);
      const minimumFirstGap = randomInteger(random, 3, Math.min(5, maximum - 4));
      return { parameters: { maximum, minimumFirstGap, minimumSpan: randomInteger(random, minimumFirstGap + 2, maximum - 1) } };
    },
    solve(parameters) {
      const { event, favorable } = counts(parameters);
      return positiveNumeratorDenominatorSum(rational(favorable, event));
    },
    crossCheck(parameters) {
      let event = 0;
      let favorable = 0;
      for (let firstGap = parameters.minimumFirstGap; firstGap <= parameters.maximum - 2; firstGap += 1) {
        for (let secondGap = 1; firstGap + secondGap <= parameters.maximum - 1; secondGap += 1) {
          const placements = parameters.maximum - firstGap - secondGap;
          event += placements;
          if (firstGap + secondGap >= parameters.minimumSpan) favorable += placements;
        }
      }
      return positiveNumeratorDenominatorSum(rational(favorable, event));
    },
    render(parameters, answer) {
      return {
        prompt: `\\(\\{1,\\ldots,${parameters.maximum}\\}\\)에서 \\(a<b<c\\)를 고른다. \\(b-a\\ge${parameters.minimumFirstGap}\\)라는 조건에서 \\(c-a\\ge${parameters.minimumSpan}\\)일 확률을 \\(q/p\\)라 할 때 \\(p+q\\)를 구하여라.`,
        solution: `두 간격을 기준으로 조건부 표본공간과 유리한 삼중항을 세어 약분하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function weightedBinaryCounts(parameters) {
  const totalLength = 2 * parameters.groupSize;
  let eventWeight = 0;
  let favorableWeight = 0;
  for (let mask = 0; mask < 1 << totalLength; mask += 1) {
    const values = [];
    let weight = 1;
    for (let index = 0; index < totalLength; index += 1) {
      const high = Boolean(mask & (1 << index));
      values.push(high ? parameters.high : parameters.low);
      if (high) weight *= parameters.highWeight;
    }
    const left = values.slice(0, parameters.groupSize).reduce((a, b) => a + b, 0);
    const right = values.slice(parameters.groupSize).reduce((a, b) => a + b, 0);
    if (left <= right) continue;
    eventWeight += weight;
    if (values[0] === parameters.low && values[parameters.groupSize] === parameters.low) favorableWeight += weight;
  }
  return rational(favorableWeight, eventWeight);
}

function makeWeightedBinaryConditional(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "서로 다른 확률을 갖는 두 값 수열의 조건부확률"),
    build(random) {
      return { parameters: { groupSize: randomInteger(random, 2, 4), low: 1, high: 2, highWeight: randomInteger(random, 2, 4) } };
    },
    solve(parameters) {
      return positiveNumeratorDenominatorSum(weightedBinaryCounts(parameters));
    },
    crossCheck(parameters) {
      const distribution = new Map();
      function group(firstForcedLow) {
        const result = new Map();
        const free = parameters.groupSize - (firstForcedLow ? 1 : 0);
        for (let highCount = 0; highCount <= free; highCount += 1) {
          const sum = parameters.low * (parameters.groupSize - highCount) + parameters.high * highCount;
          const weight = choose(free, highCount) * parameters.highWeight ** highCount;
          result.set(sum, (result.get(sum) || 0) + weight);
        }
        return result;
      }
      const all = group(false);
      let event = 0;
      for (const [leftSum, leftWeight] of all) for (const [rightSum, rightWeight] of all) if (leftSum > rightSum) event += leftWeight * rightWeight;
      const forced = group(true);
      let favorable = 0;
      for (const [leftSum, leftWeight] of forced) for (const [rightSum, rightWeight] of forced) if (leftSum > rightSum) favorable += leftWeight * rightWeight;
      return positiveNumeratorDenominatorSum(rational(favorable, event));
    },
    render(parameters, answer) {
      return {
        prompt: `독립인 \\(a_1,\\ldots,a_${2 * parameters.groupSize}\\)에 대해 \\(P(a_i=1)=1/${parameters.highWeight + 1}\\), \\(P(a_i=2)=${parameters.highWeight}/${parameters.highWeight + 1}\\)이다. 앞 ${parameters.groupSize}개 합이 뒤 ${parameters.groupSize}개 합보다 크다는 조건에서 \\(a_1=a_${parameters.groupSize + 1}=1\\)일 확률을 \\(q/p\\)라 할 때 \\(p+q\\)를 구하여라.`,
        solution: `두 묶음의 가중 합분포를 합성하고 조건부확률을 약분하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function combinations(values, count) {
  const result = [];
  const current = [];
  function visit(start) {
    if (current.length === count) {
      result.push([...current]);
      return;
    }
    for (let index = start; index < values.length; index += 1) {
      current.push(values[index]);
      visit(index + 1);
      current.pop();
    }
  }
  visit(0);
  return result;
}

function bagBranchCounts(bagA, bagB, drawCount, special) {
  let event = 0;
  let favorable = 0;
  const leftDraws = combinations(bagA, drawCount);
  const rightDraws = combinations(bagB, drawCount);
  for (const left of leftDraws) {
    for (const right of rightDraws) {
      if (!left.some((value) => right.includes(value))) continue;
      event += 1;
      if ([...left, ...right].filter((value) => value === special).length === 2) favorable += 1;
    }
  }
  return { event, favorable, total: leftDraws.length * rightDraws.length };
}

function makeBagDrawConditional(sourceReferenceId) {
  function probability(parameters) {
    const bagA = Array.from({ length: parameters.bagSize }, (_, i) => i + 1);
    const bagB = Array.from({ length: parameters.bagSize }, (_, i) => i + 2);
    let eventProbability = rational(0);
    let favorableProbability = rational(0);
    for (const branch of [{ drawCount: 1, weight: 2 }, { drawCount: 2, weight: 1 }]) {
      const counts = bagBranchCounts(bagA, bagB, branch.drawCount, parameters.special);
      const branchProbability = rational(branch.weight, 3);
      eventProbability = rationalAdd(eventProbability, rationalMul(branchProbability, rational(counts.event, counts.total)));
      favorableProbability = rationalAdd(favorableProbability, rationalMul(branchProbability, rational(counts.favorable, counts.total)));
    }
    return rationalDiv(favorableProbability, eventProbability);
  }
  return {
    ...meta(sourceReferenceId, "추첨 장수 분기가 있는 두 주머니 조건부확률"),
    build(random) {
      const bagSize = randomInteger(random, 4, 6);
      return { parameters: { bagSize, special: randomInteger(random, 2, bagSize) } };
    },
    solve(parameters) {
      return positiveNumeratorDenominatorSum(probability(parameters));
    },
    crossCheck(parameters) {
      const bagA = Array.from({ length: parameters.bagSize }, (_, i) => i + 1);
      const bagB = Array.from({ length: parameters.bagSize }, (_, i) => i + 2);
      const branches = [
        { drawCount: 1, branch: rational(2, 3) },
        { drawCount: 2, branch: rational(1, 3) },
      ];
      let event = rational(0);
      let favorable = rational(0);
      for (const { drawCount, branch } of branches) {
        const left = combinations(bagA, drawCount);
        const right = combinations(bagB, drawCount);
        const outcome = rationalDiv(branch, rational(left.length * right.length));
        for (const a of left) for (const b of right) {
          if (!a.some((value) => b.includes(value))) continue;
          event = rationalAdd(event, outcome);
          if ([...a, ...b].filter((value) => value === parameters.special).length === 2) favorable = rationalAdd(favorable, outcome);
        }
      }
      return positiveNumeratorDenominatorSum(rationalDiv(favorable, event));
    },
    render(parameters, answer) {
      return {
        prompt: `주머니 \\(A=\\{1,\\ldots,${parameters.bagSize}\\}\\), \\(B=\\{2,\\ldots,${parameters.bagSize + 1}\\}\\)가 있다. 확률 \\(1/3\\)로 각 주머니에서 2장씩, 확률 \\(2/3\\)로 1장씩 뽑는다. 두 주머니에서 같은 번호가 하나 이상 나온 조건에서 번호 ${parameters.special} 카드가 정확히 2장일 확률을 \\(q/p\\)라 할 때 \\(p+q\\)를 구하여라.`,
        solution: `추첨 장수별 확률을 가중해 교집합 사건을 센 뒤 약분하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function gameWins(high, threshold) {
  let aWins = 0;
  let bWins = 0;
  const bCards = Array.from({ length: high - 2 }, (_, index) => index + 2);
  for (const aCard of [1, high]) {
    for (const bCard of bCards) {
      const aPlaces = aCard === high;
      const bPlaces = bCard <= threshold;
      if (aPlaces && bPlaces) {
        if (aCard > bCard) aWins += 1;
        else bWins += 1;
      } else if (aPlaces) bWins += 1;
      else if (bPlaces) aWins += 1;
    }
  }
  return { aWins, bWins, total: 2 * bCards.length };
}

function makePlacementGame(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "카드 배치 여부에 따라 승자가 뒤집히는 확률게임"),
    build(random) {
      const admissibleHighs = [5, 8, 11, 14];
      return { parameters: { high: admissibleHighs[randomInteger(random, 0, admissibleHighs.length - 1)] } };
    },
    solve({ high }) {
      const solutions = [];
      for (let threshold = 2; threshold < high; threshold += 1) {
        const wins = gameWins(high, threshold);
        if (wins.aWins === wins.bWins) solutions.push({ threshold, ...wins });
      }
      if (solutions.length !== 1) throw new Error("placement game threshold is not unique");
      const selected = solutions[0];
      const scale = 2 * selected.total;
      return scale * selected.threshold + (scale * selected.aWins) / selected.total;
    },
    crossCheck({ high }) {
      for (let threshold = 2; threshold < high; threshold += 1) {
        const { aWins, bWins, total } = gameWins(high, threshold);
        if (aWins === bWins) return 2 * total * threshold + 2 * aWins;
      }
      throw new Error("placement game solution missing");
    },
    render(parameters, answer) {
      return {
        prompt: `A는 \\(\\{1,${parameters.high}\\}\\)에서 뽑아 ${parameters.high}일 때만 놓고, B는 \\(\\{2,\\ldots,${parameters.high - 1}\\}\\)에서 뽑아 \\(n\\) 이하일 때만 놓는다. 둘 다 놓으면 큰 수가, 한 명만 놓으면 놓지 않은 사람이 이긴다. 승리확률을 \\(p,q\\)라 할 때 \\(p=q\\)가 되는 \\(n\\)에 대하여 전체 등가능 결과 수를 \\(T\\)라 하자. \\(2T(n+p)\\)를 구하여라.`,
        solution: `배치 상태별 승자를 세어 두 승리확률이 같은 유일한 \\(n\\)을 찾으면 값은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function pairConditionalFraction(n, divisor) {
  let event = 0;
  let diagonal = 0;
  for (let b = divisor; b <= n; b += divisor) {
    event += b;
    diagonal += 1;
  }
  return rational(diagonal, event);
}

function makeFloorPairConditional(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "배수인 둘째 좌표 아래 대각선 조건부확률"),
    build(random) {
      const divisor = randomInteger(random, 2, 5);
      const selected = randomInteger(random, Math.max(3, divisor), 25);
      const target = pairConditionalFraction(selected, divisor);
      return { parameters: { divisor, selected, bound: 30, targetNumerator: Number(target.n), targetDenominator: Number(target.d) } };
    },
    solve(parameters) {
      let sum = 0;
      for (let n = 3; n <= parameters.bound; n += 1) {
        const value = pairConditionalFraction(n, parameters.divisor);
        if (value.n === BigInt(parameters.targetNumerator) && value.d === BigInt(parameters.targetDenominator)) sum += n;
      }
      return sum;
    },
    crossCheck(parameters) {
      let sum = 0;
      for (let n = 3; n <= parameters.bound; n += 1) {
        let event = 0;
        let favorable = 0;
        for (let x = 1; x <= n; x += 1) for (let y = x; y <= n; y += 1) if (y % parameters.divisor === 0) {
          event += 1;
          if (x === y) favorable += 1;
        }
        const reduced = rational(favorable, event);
        if (reduced.n === BigInt(parameters.targetNumerator) && reduced.d === BigInt(parameters.targetDenominator)) sum += n;
      }
      return sum;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(A_n=\\{(x,y):1\\le x\\le y\\le n\\}\\)에서 한 점을 고른다 \\((3\\le n\\le${parameters.bound})\\). \\(${parameters.divisor}\\mid y\\)라는 조건에서 \\(x=y\\)일 확률이 \\(${parameters.targetNumerator}/${parameters.targetDenominator}\\)가 되는 모든 \\(n\\)의 합을 구하여라.`,
        solution: `배수인 \\(y\\)마다 가능한 \\(x\\)의 수와 대각선 한 점을 세어 방정식을 풀면 합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function ballConditional(total, factor, a) {
  const ww = a * (total - factor * a);
  const bb = (total - a) * factor * a;
  return rational(ww, ww + bb);
}

function makeTwoBoxParameter(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "같은 색 조건부확률로 복원하는 상자 구성"),
    build(random) {
      const total = randomInteger(random, 20, 60);
      const factor = 2;
      const selected = randomInteger(random, 1, Math.floor((total - 1) / factor));
      const probability = ballConditional(total, factor, selected);
      return { parameters: { total, factor, selected, numerator: Number(probability.n), denominator: Number(probability.d) } };
    },
    solve(parameters) {
      const answers = [];
      for (let a = 1; parameters.factor * a < parameters.total; a += 1) {
        const value = ballConditional(parameters.total, parameters.factor, a);
        if (value.n === BigInt(parameters.numerator) && value.d === BigInt(parameters.denominator)) answers.push(a);
      }
      if (answers.length !== 1) throw new Error("box parameter is not unique");
      return answers[0];
    },
    crossCheck(parameters) {
      for (let a = 1; parameters.factor * a < parameters.total; a += 1) {
        let whiteWhite = 0;
        let blackBlack = 0;
        for (let left = 0; left < parameters.total; left += 1) {
          for (let right = 0; right < parameters.total; right += 1) {
            const leftWhite = left < a;
            const rightWhite = right < parameters.total - parameters.factor * a;
            if (leftWhite && rightWhite) whiteWhite += 1;
            if (!leftWhite && !rightWhite) blackBlack += 1;
          }
        }
        const direct = rational(whiteWhite, whiteWhite + blackBlack);
        if (direct.n === BigInt(parameters.numerator) && direct.d === BigInt(parameters.denominator)) return a;
      }
      throw new Error("box parameter solution missing");
    },
    render(parameters, answer) {
      return {
        prompt: `상자 A의 흰색·검은색 공은 \\((a,${parameters.total}-a)\\), 상자 B는 \\((${parameters.total}-${parameters.factor}a,${parameters.factor}a)\\)개이다. 각 상자에서 한 공씩 뽑았을 때 같은 색이라는 조건에서 모두 흰색일 확률이 \\(${parameters.numerator}/${parameters.denominator}\\)이다. 자연수 \\(a\\)를 구하여라.`,
        solution: `흰-흰과 검은-검은 결합확률의 비를 세워 자연수 범위에서 풀면 \\(a=${answer}\\)이다.`,
      };
    },
  };
}

function makeLunchDinnerBayes(sourceReferenceId) {
  function bayes(parameters) {
    const koreanAndWestern = rational(parameters.lunchK * parameters.westernGivenK, 10000);
    const western = rationalAdd(koreanAndWestern, rational((100 - parameters.lunchK) * parameters.westernGivenW, 10000));
    return rationalDiv(koreanAndWestern, western);
  }
  return {
    ...meta(sourceReferenceId, "두 단계 식사 선택표의 베이즈 확률"),
    build(random) {
      return { parameters: { lunchK: randomInteger(random, 25, 75), westernGivenK: randomInteger(random, 20, 80), westernGivenW: randomInteger(random, 20, 80) } };
    },
    solve(parameters) {
      return positiveNumeratorDenominatorSum(bayes(parameters));
    },
    crossCheck(parameters) {
      const koreanWestern = parameters.lunchK * parameters.westernGivenK;
      const westernWestern = (100 - parameters.lunchK) * parameters.westernGivenW;
      return positiveNumeratorDenominatorSum(rational(koreanWestern, koreanWestern + westernWestern));
    },
    render(parameters, answer) {
      return {
        prompt: `점심이 한식일 확률은 ${parameters.lunchK / 100}이고, 점심이 한식일 때 저녁이 양식일 확률은 ${parameters.westernGivenK / 100}, 점심이 양식일 때 저녁이 양식일 확률은 ${parameters.westernGivenW / 100}이다. 저녁이 양식일 때 점심이 한식일 확률을 \\(q/p\\)라 하면 \\(p+q\\)를 구하여라.`,
        solution: `점심-저녁 결합확률표에서 양식 저녁 열을 조건부 표본공간으로 잡아 약분하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

const wave1Batch3ProbabilityDefinitions = [
  makeDivisorProductCards("2021-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q29"),
  makeTripleGapConditional("2022-06-KICE-PROBABILITY_STATISTICS-Q30"),
  makeWeightedBinaryConditional("2022-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q30"),
  makeBagDrawConditional("2025-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q30"),
  makePlacementGame("2025-09-KICE-PROBABILITY_STATISTICS-Q30"),
  makeFloorPairConditional("2018-06-KICE-GA-Q28"),
  makeTwoBoxParameter("2016-06-KICE-NA-Q27"),
  makeLunchDinnerBayes("2019-10-EDUCATION_OFFICE-NA-Q28"),
];

module.exports = { wave1Batch3ProbabilityDefinitions };
