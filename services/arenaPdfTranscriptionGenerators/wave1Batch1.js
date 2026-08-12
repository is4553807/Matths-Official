"use strict";

const {
  choose,
  factorial,
  gcdBigInt,
  positiveNumeratorDenominatorSum,
  randomInteger,
  rational,
} = require("../arenaPdfPilotGenerators/core");

function meta(sourceReferenceId, title) {
  return {
    id: `ARENA_PDF_TX_${sourceReferenceId.replaceAll("-", "_")}`,
    sourceReferenceId,
    title,
  };
}

function sumSquares(n) {
  return (n * (n + 1) * (2 * n + 1)) / 6;
}

function sumNaturals(n) {
  return (n * (n + 1)) / 2;
}

function integerPower(base, exponent) {
  return base ** exponent;
}

function countPermutationsBySearch(n, r) {
  let count = 0;
  const used = Array(n).fill(false);
  function visit(depth) {
    if (depth === r) {
      count += 1;
      return;
    }
    for (let value = 0; value < n; value += 1) {
      if (used[value]) continue;
      used[value] = true;
      visit(depth + 1);
      used[value] = false;
    }
  }
  visit(0);
  return count;
}

function countCombinationsByMask(n, r) {
  let count = 0;
  for (let mask = 0; mask < 1 << n; mask += 1) {
    let bits = 0;
    for (let value = mask; value; value >>>= 1) bits += value & 1;
    if (bits === r) count += 1;
  }
  return count;
}

function makePartialSumLinear(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "일차식 부분합에서 일반항 복원"),
    build(random) {
      return { parameters: { slope: randomInteger(random, 2, 30), offset: randomInteger(random, -5, 8), targetIndex: randomInteger(random, 3, 25) } };
    },
    solve(parameters) {
      return parameters.slope;
    },
    crossCheck(parameters) {
      const sum = (n) => parameters.slope * n + parameters.offset;
      return sum(parameters.targetIndex) - sum(parameters.targetIndex - 1);
    },
    render(parameters, answer) {
      return {
        prompt: `수열 \\((a_n)\\)이 모든 자연수 \\(n\\)에 대하여 \\(\\sum_{k=1}^{n}a_k=${parameters.slope}n${parameters.offset >= 0 ? "+" : ""}${parameters.offset}\\)을 만족한다. \\(a_{${parameters.targetIndex}}\\)의 값을 구하여라.`,
        solution: `연속한 두 부분합을 빼면 \\(a_{${parameters.targetIndex}}=${answer}\\)이다.`,
      };
    },
  };
}

function makeFiniteSquareSum(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "제곱합과 상수항의 유한합"),
    build(random) {
      return { parameters: { termCount: randomInteger(random, 3, 10), constant: randomInteger(random, 1, 15) } };
    },
    solve({ termCount, constant }) {
      return sumSquares(termCount) + termCount * constant;
    },
    crossCheck({ termCount, constant }) {
      let total = 0;
      for (let k = 1; k <= termCount; k += 1) total += k * k + constant;
      return total;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(\\sum_{k=1}^{${parameters.termCount}}(k^2+${parameters.constant})\\)의 값을 구하여라.`,
        solution: `제곱합과 상수항의 합을 분리하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makePermutation(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "서로 다른 대상의 순서 있는 선택"),
    build(random) {
      const n = randomInteger(random, 4, 8);
      return { parameters: { n, r: randomInteger(random, 2, Math.min(4, n)) } };
    },
    solve({ n, r }) {
      return factorial(n) / factorial(n - r);
    },
    crossCheck({ n, r }) {
      return countPermutationsBySearch(n, r);
    },
    render(parameters, answer) {
      return {
        prompt: `서로 다른 ${parameters.n}개 중 ${parameters.r}개를 뽑아 순서 있게 나열하는 경우의 수 \\({}_{${parameters.n}}P_{${parameters.r}}\\)를 구하여라.`,
        solution: `곱셈원리에 따라 경우의 수는 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeCombination(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "서로 다른 대상의 조합"),
    build(random) {
      const n = randomInteger(random, 5, 12);
      return { parameters: { n, r: randomInteger(random, 2, Math.min(5, n - 1)) } };
    },
    solve({ n, r }) {
      return choose(n, r);
    },
    crossCheck({ n, r }) {
      return countCombinationsByMask(n, r);
    },
    render(parameters, answer) {
      return {
        prompt: `서로 다른 ${parameters.n}개 중 ${parameters.r}개를 순서 없이 고르는 경우의 수 \\({}_{${parameters.n}}C_{${parameters.r}}\\)를 구하여라.`,
        solution: `조합의 정의로부터 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeBoundedSubsetCount(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "크기가 제한된 부분집합의 개수"),
    build(random) {
      return {
        parameters: {
          elementCount: randomInteger(random, 5, 8),
          maximumSize: randomInteger(random, 2, 3),
        },
      };
    },
    solve({ elementCount, maximumSize }) {
      let total = 0;
      for (let size = 0; size <= maximumSize; size += 1) {
        total += choose(elementCount, size);
      }
      return total;
    },
    crossCheck({ elementCount, maximumSize }) {
      let count = 0;
      for (let mask = 0; mask < 1 << elementCount; mask += 1) {
        let bits = 0;
        for (let value = mask; value; value >>>= 1) bits += value & 1;
        if (bits <= maximumSize) count += 1;
      }
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `${parameters.elementCount}개의 원소를 갖는 집합의 부분집합 중 원소의 개수가 ${parameters.maximumSize}개 이하인 것의 개수를 구하여라.`,
        solution: `크기가 0인 경우부터 ${parameters.maximumSize}인 경우까지의 조합 수를 더하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeRepeatedSelection(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "중복을 허용한 순서 있는 선택"),
    build(random) {
      return { parameters: { alphabetSize: randomInteger(random, 2, 6), length: randomInteger(random, 2, 5) } };
    },
    solve({ alphabetSize, length }) {
      return integerPower(alphabetSize, length);
    },
    crossCheck({ alphabetSize, length }) {
      let count = 0;
      function visit(depth) {
        if (depth === length) {
          count += 1;
          return;
        }
        for (let value = 0; value < alphabetSize; value += 1) visit(depth + 1);
      }
      visit(0);
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `${parameters.alphabetSize}개의 기호에서 중복을 허용하여 길이가 ${parameters.length}인 순서열을 만드는 경우의 수를 구하여라.`,
        solution: `각 자리마다 ${parameters.alphabetSize}가지 선택이 있으므로 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeUrnProbability(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "두 색 공 추출확률의 기약분수 성분 합"),
    build(random) {
      return { parameters: { white: randomInteger(random, 2, 7), red: randomInteger(random, 2, 9) } };
    },
    solve({ white, red }) {
      return positiveNumeratorDenominatorSum(rational(choose(white, 2), choose(white + red, 2)));
    },
    crossCheck({ white, red }) {
      let total = 0;
      let favorable = 0;
      const balls = [...Array(white).fill("W"), ...Array(red).fill("R")];
      for (let left = 0; left < balls.length; left += 1) {
        for (let right = left + 1; right < balls.length; right += 1) {
          total += 1;
          if (balls[left] === "W" && balls[right] === "W") favorable += 1;
        }
      }
      const divisor = Number(gcdBigInt(BigInt(favorable), BigInt(total)));
      return favorable / divisor + total / divisor;
    },
    render(parameters, answer) {
      return {
        prompt: `흰 공 ${parameters.white}개와 빨간 공 ${parameters.red}개가 든 주머니에서 동시에 2개를 뽑는다. 두 공이 모두 흰색일 확률을 기약분수 \\(q/p\\)라 할 때 \\(p+q\\)를 구하여라.`,
        solution: `전체 조합과 흰 공 조합의 비를 기약분수로 줄이면 성분의 합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeWeightedPartialSum(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "가중 부분합의 차분으로 일반항 복원"),
    build(random) {
      return { parameters: { cubicScale: randomInteger(random, 1, 3), intercept: randomInteger(random, 0, 8), targetIndex: randomInteger(random, 5, 24) } };
    },
    solve({ cubicScale, intercept, targetIndex }) {
      return 6 * cubicScale * targetIndex + intercept;
    },
    crossCheck(parameters) {
      const total = (n) => parameters.cubicScale * n * (n + 1) * (4 * n - 1) + parameters.intercept * n * n;
      return (total(parameters.targetIndex) - total(parameters.targetIndex - 1)) / (2 * parameters.targetIndex - 1);
    },
    render(parameters, answer) {
      return {
        prompt: `모든 자연수 \\(n\\)에 대하여 \\(\\sum_{k=1}^{n}(2k-1)a_k=${parameters.cubicScale}n(n+1)(4n-1)+${parameters.intercept}n^2\\)이다. \\(a_{${parameters.targetIndex}}\\)의 값을 구하여라.`,
        solution: `두 식을 차분한 뒤 \\(2n-1\\)로 나누면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function ontoByInclusionExclusion(objects, bags) {
  let count = 0;
  for (let omitted = 0; omitted <= bags; omitted += 1) {
    count += (omitted % 2 ? -1 : 1) * choose(bags, omitted) * integerPower(bags - omitted, objects);
  }
  return count;
}

function ontoByEnumeration(objects, bags) {
  let count = 0;
  const used = Array(bags).fill(0);
  function visit(index) {
    if (index === objects) {
      if (used.every(Boolean)) count += 1;
      return;
    }
    for (let bag = 0; bag < bags; bag += 1) {
      used[bag] += 1;
      visit(index + 1);
      used[bag] -= 1;
    }
  }
  visit(0);
  return count;
}

function makeOntoDistribution(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "서로 다른 물건의 전사 배분"),
    build(random) {
      const bags = randomInteger(random, 2, 4);
      return { parameters: { bags, objects: randomInteger(random, bags + 1, Math.min(7, bags + 4)) } };
    },
    solve({ objects, bags }) {
      return ontoByInclusionExclusion(objects, bags);
    },
    crossCheck({ objects, bags }) {
      return ontoByEnumeration(objects, bags);
    },
    render(parameters, answer) {
      return {
        prompt: `서로 다른 인형 ${parameters.objects}개를 서로 다른 가방 ${parameters.bags}개에 나누어 넣되 모든 가방에 적어도 하나씩 넣는 경우의 수를 구하여라.`,
        solution: `포함배제로 빈 가방이 있는 배치를 제외하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeWeightedSequenceProduct(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "가중 곱 부분합에서 보조수열 복원"),
    build(random) {
      return { parameters: { first: randomInteger(random, 2, 8), difference: randomInteger(random, 1, 4), slope: randomInteger(random, 1, 5), intercept: randomInteger(random, 1, 8), targetIndex: randomInteger(random, 3, 9) } };
    },
    solve(parameters) {
      return parameters.slope * parameters.targetIndex + parameters.intercept;
    },
    crossCheck(parameters) {
      const a = (k) => parameters.first + (k - 1) * parameters.difference;
      const b = (k) => parameters.slope * k + parameters.intercept;
      const total = (n) => {
        let value = 0;
        for (let k = 1; k <= n; k += 1) value += a(k) * b(k);
        return value;
      };
      return (total(parameters.targetIndex) - total(parameters.targetIndex - 1)) / a(parameters.targetIndex);
    },
    render(parameters, answer) {
      const constant = parameters.first - parameters.difference;
      return {
        prompt: `\\(a_n=${parameters.first}+${parameters.difference}(n-1)\\)이고 \\(\\sum_{k=1}^{n}a_kb_k=\\sum_{k=1}^{n}(${parameters.difference}k${constant >= 0 ? "+" : ""}${constant})(${parameters.slope}k+${parameters.intercept})\\)이다. \\(b_{${parameters.targetIndex}}\\)를 구하여라.`,
        solution: `가중 부분합을 차분하여 \\(a_nb_n\\)을 얻으면 \\(b_{${parameters.targetIndex}}=${answer}\\)이다.`,
      };
    },
  };
}

function integerPartitionCount(total, parts) {
  const dp = Array.from({ length: total + 1 }, () => Array(parts + 1).fill(0));
  dp[0][0] = 1;
  for (let value = 1; value <= total; value += 1) {
    for (let sum = value; sum <= total; sum += 1) {
      for (let count = 1; count <= parts; count += 1) dp[sum][count] += dp[sum - value][count - 1];
    }
  }
  return dp[total][parts];
}

function stirlingSecond(total, parts) {
  const dp = Array.from({ length: total + 1 }, () => Array(parts + 1).fill(0));
  dp[0][0] = 1;
  for (let n = 1; n <= total; n += 1) {
    for (let r = 1; r <= parts; r += 1) dp[n][r] = dp[n - 1][r - 1] + r * dp[n - 1][r];
  }
  return dp[total][parts];
}

function integerPartitionEnumeration(total, parts) {
  let count = 0;
  function visit(remaining, left, minimum) {
    if (left === 0) {
      if (remaining === 0) count += 1;
      return;
    }
    for (let value = minimum; value <= Math.floor(remaining / left); value += 1) visit(remaining - value, left - 1, value);
  }
  visit(total, parts, 1);
  return count;
}

function setPartitionEnumeration(total, parts) {
  let count = 0;
  const labels = Array(total).fill(0);
  function visit(index, maximum) {
    if (index === total) {
      if (maximum + 1 === parts) count += 1;
      return;
    }
    for (let label = 0; label <= Math.min(maximum + 1, parts - 1); label += 1) {
      labels[index] = label;
      visit(index + 1, Math.max(maximum, label));
    }
  }
  labels[0] = 0;
  visit(1, 0);
  return count;
}

function makePartitionPair(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "정수분할과 집합분할의 합"),
    build(random) {
      const total = randomInteger(random, 5, 8);
      return { parameters: { total, parts: randomInteger(random, 2, Math.min(4, total - 1)) } };
    },
    solve({ total, parts }) {
      return integerPartitionCount(total, parts) + stirlingSecond(total, parts);
    },
    crossCheck({ total, parts }) {
      return integerPartitionEnumeration(total, parts) + setPartitionEnumeration(total, parts);
    },
    render(parameters, answer) {
      return {
        prompt: `자연수 ${parameters.total}을 ${parameters.parts}개의 양의 정수로 분할하는 방법의 수를 \\(P\\), ${parameters.total}원소 집합을 ${parameters.parts}개의 공집합이 아닌 부분집합으로 분할하는 방법의 수를 \\(S\\)라 하자. \\(P+S\\)를 구하여라.`,
        solution: `정수분할과 제2종 Stirling 수를 각각 계산해 더하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeConvergentPartialSum(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "수렴하는 부분합과 일반항의 극한"),
    build(random) {
      return { parameters: { limit: randomInteger(random, 2, 30), termCoefficient: randomInteger(random, 1, 6), sumCoefficient: randomInteger(random, 1, 12) } };
    },
    solve({ limit, sumCoefficient }) {
      return limit * sumCoefficient;
    },
    crossCheck(parameters) {
      const n = 1000000;
      const sum = (index) => parameters.limit - 1 / index;
      const term = sum(n) - sum(n - 1);
      return Math.round(parameters.termCoefficient * term + parameters.sumCoefficient * sum(n));
    },
    render(parameters, answer) {
      return {
        prompt: `부분합 \\(S_n=\\sum_{k=1}^{n}a_k\\)가 \\(\\lim_{n\\to\\infty}S_n=${parameters.limit}\\)을 만족한다. \\(\\lim_{n\\to\\infty}(${parameters.termCoefficient}a_n+${parameters.sumCoefficient}S_n)\\)을 구하여라.`,
        solution: `부분합이 수렴하므로 \\(a_n\\to0\\)이고, 극한은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeArithmeticRecovery(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "등차수열의 부분합 차 조건"),
    build(random) {
      const first = randomInteger(random, 1, 10);
      const difference = randomInteger(random, 1, 8);
      const knownIndex = 2;
      const pairStart = randomInteger(random, 5, 8);
      return { parameters: { first, difference, knownIndex, knownValue: first + difference, pairStart, pairSum: 2 * first + (2 * pairStart - 1) * difference, targetIndex: randomInteger(random, pairStart + 2, pairStart + 6) } };
    },
    solve(parameters) {
      const difference = (parameters.pairSum - 2 * parameters.knownValue) / (2 * (parameters.pairStart - parameters.knownIndex) + 1);
      const first = parameters.knownValue - (parameters.knownIndex - 1) * difference;
      return first + (parameters.targetIndex - 1) * difference;
    },
    crossCheck(parameters) {
      const answers = [];
      for (let first = 1; first <= 60; first += 1) {
        for (let difference = 1; difference <= 20; difference += 1) {
          const term = (n) => first + (n - 1) * difference;
          if (term(parameters.knownIndex) === parameters.knownValue && term(parameters.pairStart) + term(parameters.pairStart + 1) === parameters.pairSum) answers.push(term(parameters.targetIndex));
        }
      }
      if (answers.length !== 1) throw new Error("arithmetic recovery is not unique");
      return answers[0];
    },
    render(parameters, answer) {
      return {
        prompt: `등차수열 \\((a_n)\\)이 \\(a_${parameters.knownIndex}=${parameters.knownValue}\\), \\(a_${parameters.pairStart}+a_${parameters.pairStart + 1}=${parameters.pairSum}\\)을 만족한다. \\(a_${parameters.targetIndex}\\)을 구하여라.`,
        solution: `두 조건으로 첫째항과 공차를 구하면 목표항은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeBallsIntoBoxes(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "같은 공을 상자에 분배하기"),
    build(random) {
      const boxes = randomInteger(random, 3, 5);
      return { parameters: { boxes, balls: randomInteger(random, boxes + 1, 12) } };
    },
    solve({ boxes, balls }) {
      return boxes * choose(balls - 1, boxes - 2);
    },
    crossCheck({ boxes, balls }) {
      let count = 0;
      const values = Array(boxes).fill(0);
      function visit(index, remaining) {
        if (index === boxes - 1) {
          values[index] = remaining;
          if (values.filter((value) => value === 0).length === 1) count += 1;
          return;
        }
        for (let value = 0; value <= remaining; value += 1) {
          values[index] = value;
          visit(index + 1, remaining - value);
        }
      }
      visit(0, balls);
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `같은 공 ${parameters.balls}개를 서로 다른 상자 ${parameters.boxes}개에 나누어 넣을 때, 정확히 한 상자만 비어 있는 경우의 수를 구하여라.`,
        solution: `빈 상자를 고르고 나머지 상자에 양의 정수 분할을 적용하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeGeometricMiddle(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "양의 등비수열의 중간항 복원"),
    build(random) {
      const first = randomInteger(random, 1, 5);
      const ratio = randomInteger(random, 2, 4);
      const leftIndex = randomInteger(random, 3, 5);
      const term = (n) => first * ratio ** (n - 1);
      return { parameters: { first, ratio, leftIndex, rightIndex: leftIndex + 2, leftValue: term(leftIndex), rightValue: term(leftIndex + 2), targetIndex: leftIndex + 1 } };
    },
    solve({ leftValue, rightValue }) {
      return Math.sqrt(leftValue * rightValue);
    },
    crossCheck(parameters) {
      return parameters.first * parameters.ratio ** (parameters.targetIndex - 1);
    },
    render(parameters, answer) {
      return {
        prompt: `양의 등비수열 \\((a_n)\\)에서 \\(a_${parameters.leftIndex}=${parameters.leftValue}\\), \\(a_${parameters.rightIndex}=${parameters.rightValue}\\)이다. \\(a_${parameters.targetIndex}\\)을 구하여라.`,
        solution: `중간항의 제곱은 양옆 항의 곱이므로 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeSecondOrderRecovery(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "이차 점화식의 초기항 복원"),
    build(random) {
      const first = randomInteger(random, 1, 20);
      const second = randomInteger(random, 1, 30);
      return { parameters: { first, fourth: first + 2 * second } };
    },
    solve({ first, fourth }) {
      return (fourth - first) / 2;
    },
    crossCheck({ first, fourth }) {
      const answers = [];
      for (let second = 1; second <= 100; second += 1) {
        const third = first + second;
        if (second + third === fourth) answers.push(second);
      }
      if (answers.length !== 1) throw new Error("second initial term is not unique");
      return answers[0];
    },
    render(parameters, answer) {
      return {
        prompt: `수열이 \\(a_1=${parameters.first}\\), \\(a_{n+2}=a_{n+1}+a_n\\), \\(a_4=${parameters.fourth}\\)를 만족한다. \\(a_2\\)를 구하여라.`,
        solution: `\\(a_4=a_1+2a_2\\)이므로 \\(a_2=${answer}\\)이다.`,
      };
    },
  };
}

function makeKnownSequenceSum(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "주어진 수열합과 자연수합의 결합"),
    build(random) {
      return { parameters: { termCount: randomInteger(random, 5, 20), knownSum: randomInteger(random, 5, 250) } };
    },
    solve({ termCount, knownSum }) {
      return sumNaturals(termCount) + knownSum;
    },
    crossCheck({ termCount, knownSum }) {
      let total = knownSum;
      for (let k = 1; k <= termCount; k += 1) total += k;
      return total;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(\\sum_{k=1}^{${parameters.termCount}}a_k=${parameters.knownSum}\\)일 때 \\(\\sum_{k=1}^{${parameters.termCount}}(k+a_k)\\)를 구하여라.`,
        solution: `자연수의 합과 주어진 수열합을 더하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeRepeatedRootGeometric(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "중근 조건으로 정해지는 등비수열"),
    build(random) {
      const first = randomInteger(random, 1, 4);
      const rootScale = randomInteger(random, 1, 2);
      return { parameters: { first, rootScale, ratio: 2 * rootScale, termCount: randomInteger(random, 3, 7) } };
    },
    solve({ first, ratio, termCount }) {
      return first * (ratio ** termCount - 1) / (ratio - 1);
    },
    crossCheck(parameters) {
      let term = parameters.first;
      let total = 0;
      for (let n = 1; n <= parameters.termCount; n += 1) {
        total += term;
        const next = parameters.ratio * term;
        const discriminant = next ** 2 - 4 * parameters.rootScale ** 2 * term ** 2;
        if (discriminant !== 0) throw new Error("quadratic does not have a repeated root");
        term = next;
      }
      return total;
    },
    render(parameters, answer) {
      return {
        prompt: `양의 수열 \\((a_n)\\)에서 \\(a_1=${parameters.first}\\)이고, 모든 자연수 \\(n\\)에 대해 \\(a_nx^2-a_{n+1}x+${parameters.rootScale ** 2}a_n=0\\)이 중근을 갖는다. \\(\\sum_{k=1}^{${parameters.termCount}}a_k\\)를 구하여라.`,
        solution: `판별식이 0이므로 공비는 ${parameters.ratio}이고, 등비수열의 합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function geometricPolynomialValue(base, termCount) {
  return base === 1 ? termCount : (base ** termCount - 1) / (base - 1);
}

function makePolynomialGeometricRatio(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "유한등비합 다항식의 값"),
    build(random) {
      return { parameters: { termCount: randomInteger(random, 4, 16), base: randomInteger(random, 2, 4) } };
    },
    solve({ termCount, base }) {
      const numerator = geometricPolynomialValue(base, termCount);
      const denominator = (termCount - 1) * (termCount + 1);
      if (numerator % denominator !== 0) throw new Error("geometric ratio is not integral");
      return numerator / denominator;
    },
    crossCheck({ termCount, base }) {
      let numerator = 0;
      for (let exponent = 0; exponent < termCount; exponent += 1) numerator += base ** exponent;
      const f1 = termCount;
      if (numerator % ((f1 - 1) * (f1 + 1)) !== 0) throw new Error("expanded ratio is not integral");
      return numerator / ((f1 - 1) * (f1 + 1));
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=1+x+x^2+\\cdots+x^{${parameters.termCount - 1}}\\)일 때 \\(\\frac{f(${parameters.base})}{\\{f(1)-1\\}\\{f(1)+1\\}}\\)의 값을 구하여라.`,
        solution: `유한등비합으로 정리하여 계산하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makePartialSumRecurrence(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "부분합 곱 관계의 수열"),
    build(random) {
      const first = randomInteger(random, 1, 4);
      const ratioSeed = randomInteger(random, 1, 3);
      return { parameters: { first, second: first * ratioSeed, ratioSeed, targetIndex: randomInteger(random, 3, 6) } };
    },
    solve({ first, ratioSeed, targetIndex }) {
      return first * (1 + ratioSeed) ** (targetIndex - 1);
    },
    crossCheck(parameters) {
      const terms = [parameters.first, parameters.second];
      const sums = [parameters.first, parameters.first + parameters.second];
      for (let n = 2; n < parameters.targetIndex; n += 1) {
        const next = terms[n - 1] * sums[n - 1] / sums[n - 2];
        if (!Number.isInteger(next)) throw new Error("partial-sum recurrence lost integrality");
        terms.push(next);
        sums.push(sums[n - 1] + next);
      }
      return sums[parameters.targetIndex - 1];
    },
    render(parameters, answer) {
      return {
        prompt: `\\(S_n=\\sum_{k=1}^{n}a_k\\), \\(a_1=${parameters.first}\\), \\(a_2=${parameters.second}\\)이고 \\(a_{n+1}S_n=a_nS_{n+1}\\;(n\\ge2)\\)이다. \\(S_${parameters.targetIndex}\\)를 구하여라.`,
        solution: `관계를 차례로 적용하면 목표 부분합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeLinearAggregate(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "두 수열합의 연립일차식"),
    build(random) {
      const termCount = randomInteger(random, 5, 12);
      const sumA = randomInteger(random, 10, 80);
      const sumB = randomInteger(random, termCount + 1, 80);
      const firstWeight = randomInteger(random, 1, 4);
      const secondWeight = randomInteger(random, 1, 4);
      return { parameters: { termCount, sumA, sumB, firstWeight, secondWeight, firstTotal: sumA + firstWeight * sumB, secondTotal: sumA - secondWeight * sumB, offset: 1 } };
    },
    solve(parameters) {
      const sumB = (parameters.firstTotal - parameters.secondTotal) / (parameters.firstWeight + parameters.secondWeight);
      return sumB - parameters.termCount * parameters.offset;
    },
    crossCheck(parameters) {
      const candidates = [];
      for (let a = 0; a <= 120; a += 1) {
        for (let b = 0; b <= 120; b += 1) {
          if (a + parameters.firstWeight * b === parameters.firstTotal && a - parameters.secondWeight * b === parameters.secondTotal) candidates.push(b - parameters.termCount * parameters.offset);
        }
      }
      if (candidates.length !== 1) throw new Error("aggregate sums are not unique");
      return candidates[0];
    },
    render(parameters, answer) {
      return {
        prompt: `\\(\\sum_{k=1}^{${parameters.termCount}}(a_k+${parameters.firstWeight}b_k)=${parameters.firstTotal}\\), \\(\\sum_{k=1}^{${parameters.termCount}}(a_k-${parameters.secondWeight}b_k)=${parameters.secondTotal}\\)이다. \\(\\sum_{k=1}^{${parameters.termCount}}(b_k-${parameters.offset})\\)를 구하여라.`,
        solution: `두 수열의 합을 미지수로 두고 연립하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeShiftedSquareDifference(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "지수 이동 제곱합의 차"),
    build(random) {
      return { parameters: { upper: randomInteger(random, 4, 10), plusShift: randomInteger(random, 0, 3), minusShift: randomInteger(random, 0, 2) } };
    },
    solve({ upper, plusShift, minusShift }) {
      const left = sumSquares(upper) + 2 * plusShift * sumNaturals(upper) + upper * plusShift ** 2;
      const m = upper - 1;
      const right = sumSquares(m) - 2 * minusShift * sumNaturals(m) + m * minusShift ** 2;
      return left - right;
    },
    crossCheck({ upper, plusShift, minusShift }) {
      let total = 0;
      for (let k = 1; k <= upper; k += 1) total += (k + plusShift) ** 2;
      for (let k = 1; k < upper; k += 1) total -= (k - minusShift) ** 2;
      return total;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(\\sum_{k=1}^{${parameters.upper}}(k+${parameters.plusShift})^2-\\sum_{k=1}^{${parameters.upper - 1}}(k-${parameters.minusShift})^2\\)의 값을 구하여라.`,
        solution: `공통 제곱항을 정리하거나 직접 합하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeVietaSum(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "매개변수 이차방정식의 근과 유한합"),
    build(random) {
      const rootLeft = randomInteger(random, 1, 4);
      const rootRight = randomInteger(random, rootLeft + 1, 6);
      return { parameters: { rootLeft, rootRight, constant: randomInteger(random, 8, 24), upper: randomInteger(random, 2, 5) } };
    },
    solve({ rootLeft, rootRight, constant, upper }) {
      const rootSumScale = rootLeft + rootRight;
      const rootProductScale = rootLeft * rootRight;
      let total = 0;
      for (let n = 1; n <= upper; n += 1) total += constant ** 2 - constant * rootSumScale * n + rootProductScale * n ** 2;
      return total;
    },
    crossCheck({ rootLeft, rootRight, constant, upper }) {
      let total = 0;
      for (let n = 1; n <= upper; n += 1) total += (constant - rootLeft * n) * (constant - rootRight * n);
      return total;
    },
    render(parameters, answer) {
      return {
        prompt: `이차방정식 \\(x^2-${parameters.rootLeft + parameters.rootRight}nx+${parameters.rootLeft * parameters.rootRight}n^2=0\\)의 두 근을 \\(\\alpha_n,\\beta_n\\)이라 하자. \\(\\sum_{n=1}^{${parameters.upper}}(${parameters.constant}-\\alpha_n)(${parameters.constant}-\\beta_n)\\)을 구하여라.`,
        solution: `Vieta 정리로 각 항을 정리해 합하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeMomentExpansion(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "일차·이차 모멘트로 이차식 합 계산"),
    build(random) {
      const count = randomInteger(random, 4, 8);
      const values = Array.from({ length: count }, () => randomInteger(random, 0, 6));
      const leftShift = randomInteger(random, 1, 4);
      const rightShift = -randomInteger(random, 0, 2);
      return { parameters: { count, values, sum: values.reduce((a, b) => a + b, 0), squareSum: values.reduce((a, b) => a + b * b, 0), leftShift, rightShift } };
    },
    solve(parameters) {
      return parameters.squareSum + (parameters.leftShift + parameters.rightShift) * parameters.sum + parameters.count * parameters.leftShift * parameters.rightShift;
    },
    crossCheck(parameters) {
      return parameters.values.reduce((total, value) => total + (value + parameters.leftShift) * (value + parameters.rightShift), 0);
    },
    render(parameters, answer) {
      return {
        prompt: `실수 \\(a_1,\\ldots,a_${parameters.count}\\)에 대하여 \\(\\sum a_k=${parameters.sum}\\), \\(\\sum a_k^2=${parameters.squareSum}\\)이다. \\(\\sum_{k=1}^{${parameters.count}}(a_k+${parameters.leftShift})(a_k${parameters.rightShift >= 0 ? "+" : ""}${parameters.rightShift})\\)를 구하여라.`,
        solution: `곱을 전개하고 두 모멘트를 대입하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeShiftedProductAggregate(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "평행이동된 곱의 합 복원"),
    build(random) {
      const count = randomInteger(random, 3, 8);
      const shift = randomInteger(random, 1, 4);
      const left = Array.from({ length: count }, () => randomInteger(random, 1, 8));
      const right = Array.from({ length: count }, () => randomInteger(random, 1, 8));
      const shiftedProductSum = left.reduce((total, value, index) => total + (value - shift) * (right[index] - shift), 0);
      const linearSum = left.reduce((a, b) => a + b, 0) + right.reduce((a, b) => a + b, 0);
      return { parameters: { count, shift, left, right, shiftedProductSum, linearSum } };
    },
    solve(parameters) {
      return parameters.shiftedProductSum + parameters.shift * parameters.linearSum - parameters.count * parameters.shift ** 2;
    },
    crossCheck(parameters) {
      return parameters.left.reduce((total, value, index) => total + value * parameters.right[index], 0);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(\\sum_{n=1}^{${parameters.count}}(a_n-${parameters.shift})(b_n-${parameters.shift})=${parameters.shiftedProductSum}\\), \\(\\sum_{n=1}^{${parameters.count}}(a_n+b_n)=${parameters.linearSum}\\)이다. \\(\\sum_{n=1}^{${parameters.count}}a_nb_n\\)을 구하여라.`,
        solution: `이동된 곱을 전개하여 정리하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

const wave1Batch1Definitions = [
  makePartialSumLinear("2016-03-EDUCATION_OFFICE-NA-Q23"),
  makeFiniteSquareSum("2016-04-EDUCATION_OFFICE-NA-Q23"),
  makePermutation("2016-06-KICE-NA-Q22"),
  makeCombination("2016-09-KICE-GA-Q22"),
  makeUrnProbability("2016-09-KICE-NA-Q26"),
  makeRepeatedSelection("2017-04-EDUCATION_OFFICE-GA-Q22"),
  makeWeightedPartialSum("2017-04-EDUCATION_OFFICE-NA-Q27"),
  makeBoundedSubsetCount("2017-06-KICE-GA-Q22"),
  makeOntoDistribution("2017-07-EDUCATION_OFFICE-GA-Q26"),
  makeWeightedSequenceProduct("2017-07-EDUCATION_OFFICE-NA-Q26"),
  makePartitionPair("2018-03-EDUCATION_OFFICE-GA-Q24"),
  makeConvergentPartialSum("2018-03-EDUCATION_OFFICE-NA-Q24"),
  makeArithmeticRecovery("2018-07-EDUCATION_OFFICE-NA-Q25"),
  makeBallsIntoBoxes("2018-07-EDUCATION_OFFICE-NA-Q26"),
  makeGeometricMiddle("2018-09-KICE-NA-Q26"),
  makeSecondOrderRecovery("2019-03-EDUCATION_OFFICE-NA-Q25"),
  makeKnownSequenceSum("2019-04-EDUCATION_OFFICE-NA-Q25"),
  makeRepeatedRootGeometric("2019-07-EDUCATION_OFFICE-NA-Q26"),
  makePolynomialGeometricRatio("2020-10-EDUCATION_OFFICE-NA-Q25"),
  makePartialSumRecurrence("2021-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q19"),
  makeLinearAggregate("2021-09-KICE-PROBABILITY_STATISTICS-Q18"),
  makeShiftedSquareDifference("2022-10-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18"),
  makeVietaSum("2023-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18"),
  makeMomentExpansion("2025-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18"),
  makeShiftedProductAggregate("2025-10-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18"),
];

module.exports = {
  wave1Batch1Definitions,
  sharedFactories: {
    makeCombination,
    makePermutation,
    makeRepeatedSelection,
    makeUrnProbability,
  },
};
