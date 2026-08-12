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

function permutation(n, r) {
  return factorial(n) / factorial(n - r);
}

function enumeratePermutation(n, r) {
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

function makeAdjacentPairArrangement(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "특정 두 사람이 이웃하는 일렬배열"),
    build(random) {
      return { parameters: { count: randomInteger(random, 4, 6) } };
    },
    solve({ count }) {
      return 2 * factorial(count - 1);
    },
    crossCheck({ count }) {
      let valid = 0;
      const used = Array(count).fill(false);
      const order = [];
      function visit() {
        if (order.length === count) {
          if (Math.abs(order.indexOf(0) - order.indexOf(1)) === 1) valid += 1;
          return;
        }
        for (let value = 0; value < count; value += 1) {
          if (used[value]) continue;
          used[value] = true;
          order.push(value);
          visit();
          order.pop();
          used[value] = false;
        }
      }
      visit();
      return valid;
    },
    render(parameters, answer) {
      return {
        prompt: `서로 다른 학생 ${parameters.count}명을 한 줄로 세울 때, 두 학생 A와 B가 서로 이웃하도록 세우는 경우의 수를 구하여라.`,
        solution: `A와 B를 한 묶음으로 보고 묶음 안의 순서 2가지를 곱하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeMixedColorUrnProbability(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "서로 다른 두 색 공을 뽑을 확률"),
    build(random) {
      return {
        parameters: {
          white: randomInteger(random, 2, 7),
          red: randomInteger(random, 2, 8),
        },
      };
    },
    solve({ white, red }) {
      return positiveNumeratorDenominatorSum(
        rational(white * red, choose(white + red, 2))
      );
    },
    crossCheck({ white, red }) {
      const balls = [...Array(white).fill("W"), ...Array(red).fill("R")];
      let total = 0;
      let favorable = 0;
      for (let left = 0; left < balls.length; left += 1) {
        for (let right = left + 1; right < balls.length; right += 1) {
          total += 1;
          if (balls[left] !== balls[right]) favorable += 1;
        }
      }
      const divisor = Number(gcdBigInt(BigInt(favorable), BigInt(total)));
      return favorable / divisor + total / divisor;
    },
    render(parameters, answer) {
      return {
        prompt: `흰 공 ${parameters.white}개와 빨간 공 ${parameters.red}개가 든 주머니에서 동시에 2개를 뽑는다. 두 공의 색이 서로 다를 확률을 기약분수 \\(q/p\\)라 할 때 \\(p+q\\)를 구하여라.`,
        solution: `흰 공과 빨간 공을 하나씩 고르는 경우를 전체 두 공 선택의 수로 나누어 약분하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeCrossGroupPair(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "서로 다른 두 집단에서 한 명씩 선택"),
    build(random) {
      return {
        parameters: {
          firstGroup: randomInteger(random, 2, 9),
          secondGroup: randomInteger(random, 2, 9),
        },
      };
    },
    solve({ firstGroup, secondGroup }) {
      return firstGroup * secondGroup;
    },
    crossCheck({ firstGroup, secondGroup }) {
      let count = 0;
      for (let first = 0; first < firstGroup; first += 1) {
        for (let second = 0; second < secondGroup; second += 1) count += 1;
      }
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `A반 학생 ${parameters.firstGroup}명과 B반 학생 ${parameters.secondGroup}명 중에서 각 반의 학생을 한 명씩 뽑아 2명의 대표를 정하는 경우의 수를 구하여라.`,
        solution: `A반 대표와 B반 대표를 독립적으로 한 명씩 고르면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeCommitteeWithSpecialMember(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "특정 집단을 반드시 포함하는 위원회"),
    build(random) {
      const special = randomInteger(random, 2, 4);
      const ordinary = randomInteger(random, 4, 7);
      return {
        parameters: {
          special,
          ordinary,
          committeeSize: randomInteger(
            random,
            2,
            Math.min(4, special + ordinary - 1)
          ),
        },
      };
    },
    solve({ special, ordinary, committeeSize }) {
      return (
        choose(special + ordinary, committeeSize) -
        choose(ordinary, committeeSize)
      );
    },
    crossCheck({ special, ordinary, committeeSize }) {
      const total = special + ordinary;
      let count = 0;
      for (let mask = 0; mask < 1 << total; mask += 1) {
        let selected = 0;
        let includesSpecial = false;
        for (let index = 0; index < total; index += 1) {
          if ((mask & (1 << index)) === 0) continue;
          selected += 1;
          if (index < special) includesSpecial = true;
        }
        if (selected === committeeSize && includesSpecial) count += 1;
      }
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `특별회원 ${parameters.special}명과 일반회원 ${parameters.ordinary}명 중 ${parameters.committeeSize}명의 위원을 뽑을 때, 특별회원을 적어도 한 명 포함하는 경우의 수를 구하여라.`,
        solution: `전체 위원회에서 일반회원만으로 구성된 위원회를 제외하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeOrderedSelectionWithRequiredPerson(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "특정 대상을 포함하는 순서 있는 선택"),
    build(random) {
      const candidateCount = randomInteger(random, 4, 8);
      return {
        parameters: {
          candidateCount,
          positionCount: randomInteger(
            random,
            2,
            Math.min(4, candidateCount - 1)
          ),
        },
      };
    },
    solve({ candidateCount, positionCount }) {
      return positionCount * permutation(candidateCount - 1, positionCount - 1);
    },
    crossCheck({ candidateCount, positionCount }) {
      let count = 0;
      const used = Array(candidateCount).fill(false);
      function visit(depth, includesRequired) {
        if (depth === positionCount) {
          if (includesRequired) count += 1;
          return;
        }
        for (let value = 0; value < candidateCount; value += 1) {
          if (used[value]) continue;
          used[value] = true;
          visit(depth + 1, includesRequired || value === 0);
          used[value] = false;
        }
      }
      visit(0, false);
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `서로 다른 후보 ${parameters.candidateCount}명 중 ${parameters.positionCount}명을 뽑아 순서를 정할 때, 후보 A가 반드시 포함되는 경우의 수를 구하여라.`,
        solution: `A의 위치를 정한 뒤 나머지 자리에 다른 후보를 순서 있게 배치하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeNoAdjacentEqualSequence(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "이웃한 기호가 다른 순서열"),
    build(random) {
      return {
        parameters: {
          alphabetSize: randomInteger(random, 2, 4),
          length: randomInteger(random, 3, 5),
        },
      };
    },
    solve({ alphabetSize, length }) {
      return alphabetSize * (alphabetSize - 1) ** (length - 1);
    },
    crossCheck({ alphabetSize, length }) {
      let count = 0;
      function visit(depth, previous) {
        if (depth === length) {
          count += 1;
          return;
        }
        for (let value = 0; value < alphabetSize; value += 1) {
          if (value === previous) continue;
          visit(depth + 1, value);
        }
      }
      visit(0, -1);
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `${parameters.alphabetSize}개의 기호로 길이가 ${parameters.length}인 순서열을 만들 때, 이웃한 두 자리에 같은 기호가 오지 않는 경우의 수를 구하여라.`,
        solution: `첫 자리 뒤의 각 자리에서는 바로 앞 기호를 제외해야 하므로 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makePermutationCombinationSum(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "순열과 조합 값의 합"),
    build(random) {
      const pn = randomInteger(random, 4, 8);
      const cn = randomInteger(random, 4, 10);
      return { parameters: { pn, pr: randomInteger(random, 2, Math.min(4, pn)), cn, cr: randomInteger(random, 2, Math.min(4, cn - 1)) } };
    },
    solve({ pn, pr, cn, cr }) {
      return permutation(pn, pr) + choose(cn, cr);
    },
    crossCheck({ pn, pr, cn, cr }) {
      let combinationCount = 0;
      for (let mask = 0; mask < 1 << cn; mask += 1) {
        let bits = 0;
        for (let value = mask; value; value >>>= 1) bits += value & 1;
        if (bits === cr) combinationCount += 1;
      }
      return enumeratePermutation(pn, pr) + combinationCount;
    },
    render(parameters, answer) {
      return {
        prompt: `\\({}_{${parameters.pn}}P_{${parameters.pr}}+{}_{${parameters.cn}}C_{${parameters.cr}}\\)의 값을 구하여라.`,
        solution: `순열과 조합을 각각 계산해 더하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makePermutationCombinationEquation(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "순열·조합 방정식의 자연수 해"),
    build(random) {
      const answer = randomInteger(random, 3, 8);
      return {
        parameters: {
          countValue: permutation(answer, 2) + choose(answer, 2),
          answer,
        },
      };
    },
    solve({ countValue }) {
      const discriminant = 1 + (8 * countValue) / 3;
      const value = (1 + Math.sqrt(discriminant)) / 2;
      if (!Number.isInteger(value)) {
        throw new Error("permutation-combination equation is not integral");
      }
      return value;
    },
    crossCheck({ countValue }) {
      const answers = [];
      for (let value = 1; value <= 30; value += 1) {
        if (permutation(value, 2) + choose(value, 2) === countValue) {
          answers.push(value);
        }
      }
      if (answers.length !== 1) {
        throw new Error("permutation-combination equation is not unique");
      }
      return answers[0];
    },
    render(parameters, answer) {
      return {
        prompt: `자연수 \\(n\\)에 대하여 \\({}_nP_2+{}_nC_2=${parameters.countValue}\\)일 때 \\(n\\)의 값을 구하여라.`,
        solution: `순열과 조합을 \\(n\\)의 식으로 나타내어 이차방정식을 풀면 \\(n=${answer}\\)이다.`,
      };
    },
  };
}

function makeRepeatedCombination(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "중복조합의 계산"),
    build(random) {
      return { parameters: { types: randomInteger(random, 3, 9), selections: randomInteger(random, 2, 7) } };
    },
    solve({ types, selections }) {
      return choose(types + selections - 1, selections);
    },
    crossCheck({ types, selections }) {
      let count = 0;
      function visit(index, remaining) {
        if (index === types - 1) {
          count += 1;
          return;
        }
        for (let value = 0; value <= remaining; value += 1) visit(index + 1, remaining - value);
      }
      visit(0, selections);
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `${parameters.types}종류에서 중복을 허용하여 ${parameters.selections}개를 고르는 경우의 수 \\({}_{${parameters.types}}H_{${parameters.selections}}\\)를 구하여라.`,
        solution: `중복조합을 조합으로 바꾸면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeRepeatedCombinationInverse(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "중복조합 방정식의 자연수 해"),
    build(random) {
      const answer = randomInteger(random, 2, 12);
      return { parameters: { types: 3, countValue: choose(answer + 2, 2), answer } };
    },
    solve({ countValue }) {
      const discriminant = 1 + 8 * countValue;
      const value = (-3 + Math.sqrt(discriminant)) / 2;
      if (!Number.isInteger(value)) throw new Error("repeated-combination inverse is not integral");
      return value;
    },
    crossCheck({ types, countValue }) {
      const answers = [];
      for (let value = 1; value <= 50; value += 1) {
        if (choose(types + value - 1, value) === countValue) answers.push(value);
      }
      if (answers.length !== 1) throw new Error("repeated-combination inverse is not unique");
      return answers[0];
    },
    render(parameters, answer) {
      return {
        prompt: `자연수 \\(n\\)에 대하여 \\({}_3H_n=${parameters.countValue}\\)일 때 \\(n\\)의 값을 구하여라.`,
        solution: `\\({}_3H_n=\\binom{n+2}{2}\\)로 바꾸어 풀면 \\(n=${answer}\\)이다.`,
      };
    },
  };
}

function makeDisjointProbability(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "서로 배반인 사건의 확률"),
    build(random) {
      const eventA = randomInteger(random, 5, 60);
      const eventB = randomInteger(random, 5, 90 - eventA);
      return { parameters: { eventA, eventB, union: eventA + eventB, scale: 100 } };
    },
    solve({ union, eventA }) {
      return union - eventA;
    },
    crossCheck({ union, eventA, eventB }) {
      if (eventA + eventB !== union) throw new Error("disjoint additivity failed");
      return eventB;
    },
    render(parameters, answer) {
      return {
        prompt: `서로 배반인 두 사건 \\(A,B\\)에 대하여 \\(P(A\\cup B)=${(parameters.union / 100).toFixed(2)}\\), \\(P(A)=${(parameters.eventA / 100).toFixed(2)}\\), \\(P(B)=\\alpha\\)이다. \\(100\\alpha\\)를 구하여라.`,
        solution: `서로 배반이므로 확률을 빼면 \\(100\\alpha=${answer}\\)이다.`,
      };
    },
  };
}

function makeGeometricPartialDifference(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "등비수열의 연속 부분합 차"),
    build(random) {
      const first = randomInteger(random, 1, 5);
      const ratio = randomInteger(random, 2, 5);
      return { parameters: { first, ratio, coefficient: first * (1 + ratio + ratio ** 2), targetIndex: randomInteger(random, 3, 6) } };
    },
    solve({ coefficient, ratio, targetIndex }) {
      const first = coefficient / (1 + ratio + ratio ** 2);
      return first * ratio ** (targetIndex - 1);
    },
    crossCheck(parameters) {
      const terms = Array.from({ length: parameters.targetIndex + 3 }, (_, index) => parameters.first * parameters.ratio ** index);
      for (let n = 1; n <= parameters.targetIndex; n += 1) {
        const difference = terms[n - 1] + terms[n] + terms[n + 1];
        if (difference !== parameters.coefficient * parameters.ratio ** (n - 1)) throw new Error("partial-sum difference mismatch");
      }
      return terms[parameters.targetIndex - 1];
    },
    render(parameters, answer) {
      return {
        prompt: `등비수열 \\((a_n)\\)의 부분합을 \\(S_n\\)이라 하자. 모든 자연수 \\(n\\)에 대하여 \\(S_{n+3}-S_n=${parameters.coefficient}\\cdot${parameters.ratio}^{n-1}\\)일 때 \\(a_${parameters.targetIndex}\\)을 구하여라.`,
        solution: `연속한 세 항을 비교해 공비와 첫째항을 구하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function signedRecurrenceValues(first, second, limit) {
  const values = [first, second];
  while (values.length < limit) values.push(values.at(-1) - values.at(-2));
  return values;
}

function makeSignedRecurrenceCount(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "부호 점화수열의 절댓값 출현 횟수"),
    build(random) {
      const scale = randomInteger(random, 1, 9);
      return { parameters: { first: 3 * scale, second: scale, scale, limit: randomInteger(random, 30, 200) } };
    },
    solve({ first, second, scale, limit }) {
      const cycle = signedRecurrenceValues(first, second, 6);
      let count = 0;
      for (let index = 0; index < limit; index += 1) if (Math.abs(cycle[index % 6]) === scale) count += 1;
      return count;
    },
    crossCheck({ first, second, scale, limit }) {
      return signedRecurrenceValues(first, second, limit).filter((value) => Math.abs(value) === scale).length;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(a_1=${parameters.first}\\), \\(a_2=${parameters.second}\\), \\(a_{n+2}=a_{n+1}-a_n\\)이다. \\(1\\le k\\le${parameters.limit}\\)에서 \\(|a_k|=${parameters.scale}\\)인 자연수 \\(k\\)의 개수를 구하여라.`,
        solution: `길이 6의 부호 주기를 확인해 세면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeTelescopingRootSum(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "연속근을 이용한 제곱근 망원합"),
    build(random) {
      const root = randomInteger(random, 2, 24);
      return { parameters: { upper: root ** 2, root } };
    },
    solve({ root }) {
      return root;
    },
    crossCheck({ upper }) {
      let total = 0;
      for (let n = 1; n <= upper; n += 1) total += 1 / (Math.sqrt(n - 1) + Math.sqrt(n));
      return Math.round(total);
    },
    render(parameters, answer) {
      return {
        prompt: `이차방정식 \\(x^2-(2n-1)x+n(n-1)=0\\)의 두 근을 \\(\\alpha_n,\\beta_n\\)이라 하자. \\(\\sum_{n=1}^{${parameters.upper}}\\frac1{\\sqrt{\\alpha_n}+\\sqrt{\\beta_n}}\\)를 구하여라.`,
        solution: `근이 \\(n-1,n\\)이므로 각 항을 유리화하면 망원합이 되어 \\(${answer}\\)이다.`,
      };
    },
  };
}

function geometricSum(base, count, multiplier = 1) {
  let total = 0;
  for (let index = 0; index < count; index += 1) total += multiplier * base ** index;
  return total;
}

function admissibleSquareIndices(lower, upper) {
  const result = [];
  for (let n = 1; n * n < upper; n += 1) if (lower < n * n) result.push(n);
  return result;
}

function makeSquareBoundSolutions(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "기하급수 사이의 홀수합 제곱 부등식"),
    build(random) {
      const count = randomInteger(random, 3, 6);
      const lower = geometricSum(2, count);
      const upperBase = randomInteger(random, 3, 5);
      const upperMultiplier = randomInteger(random, 1, 3);
      const upper = geometricSum(upperBase, count, upperMultiplier);
      return { parameters: { count, lower, upperBase, upperMultiplier, upper } };
    },
    solve({ lower, upper }) {
      return admissibleSquareIndices(lower, upper).reduce((sum, value) => sum + value, 0);
    },
    crossCheck({ count, upperBase, upperMultiplier }) {
      const lower = geometricSum(2, count);
      const upper = geometricSum(upperBase, count, upperMultiplier);
      let sum = 0;
      for (let n = 1; n * n < upper; n += 1) {
        let oddSum = 0;
        for (let k = 1; k <= n; k += 1) oddSum += 2 * k - 1;
        if (lower < oddSum && oddSum < upper) sum += n;
      }
      return sum;
    },
    render(parameters, answer) {
      return {
        prompt: `자연수 \\(n\\)이 \\(\\sum_{k=1}^{${parameters.count}}2^{k-1}<\\sum_{k=1}^{n}(2k-1)<\\sum_{k=1}^{${parameters.count}}${parameters.upperMultiplier}\\cdot${parameters.upperBase}^{k-1}\\)을 만족한다. 가능한 모든 \\(n\\)의 합을 구하여라.`,
        solution: `가운데 합을 \\(n^2\\)으로 바꾸어 정수 범위를 찾으면 합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function oddDiceFavorable(rolls, target) {
  const values = [1, 3, 5];
  let count = 0;
  function visit(depth, sum) {
    if (depth === rolls) {
      if (sum === target) count += 1;
      return;
    }
    for (const value of values) visit(depth + 1, sum + value);
  }
  visit(0, 0);
  return count;
}

function makeOddDiceConditional(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "홀수 눈 조건부 주사위합 확률"),
    build(random) {
      const rolls = randomInteger(random, 3, 6);
      const target = randomInteger(random, rolls, 5 * rolls);
      return { parameters: { rolls, target } };
    },
    solve({ rolls, target }) {
      return positiveNumeratorDenominatorSum(rational(oddDiceFavorable(rolls, target), 3 ** rolls));
    },
    crossCheck({ rolls, target }) {
      const distribution = new Map([[0, 1]]);
      for (let index = 0; index < rolls; index += 1) {
        const next = new Map();
        for (const [sum, count] of distribution) {
          for (const value of [1, 3, 5]) next.set(sum + value, (next.get(sum + value) || 0) + count);
        }
        distribution.clear();
        for (const entry of next) distribution.set(...entry);
      }
      return positiveNumeratorDenominatorSum(rational(distribution.get(target) || 0, 3 ** rolls));
    },
    degeneracyReasons(parameters) {
      return oddDiceFavorable(parameters.rolls, parameters.target) === 0 ? ["zero favorable outcomes"] : [];
    },
    render(parameters, answer) {
      return {
        prompt: `서로 구별되는 공정한 주사위 ${parameters.rolls}개를 던진다. 모든 눈의 곱이 홀수라는 조건에서 눈의 합이 ${parameters.target}일 확률을 기약분수 \\(q/p\\)라 할 때 \\(p+q\\)를 구하여라.`,
        solution: `각 눈을 1,3,5로 제한하여 경우를 세고 기약분수로 줄이면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function compositionEventCounts(total, threshold) {
  let all = 0;
  let favorable = 0;
  for (let a = 0; a <= total; a += 1) {
    for (let b = 0; b <= total - a; b += 1) {
      const c = total - a - b;
      all += 1;
      if (a < threshold || b < threshold) favorable += 1;
      void c;
    }
  }
  return { all, favorable };
}

function makeCompositionConditional(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "비음이 아닌 정수해의 합사건 확률"),
    build(random) {
      return { parameters: { total: randomInteger(random, 5, 16), threshold: randomInteger(random, 1, 4) } };
    },
    solve({ total, threshold }) {
      const all = choose(total + 2, 2);
      let single = 0;
      let intersection = 0;
      for (let a = 0; a < threshold && a <= total; a += 1) single += total - a + 1;
      for (let a = 0; a < threshold; a += 1) {
        for (let b = 0; b < threshold; b += 1) if (a + b <= total) intersection += 1;
      }
      return positiveNumeratorDenominatorSum(rational(2 * single - intersection, all));
    },
    crossCheck({ total, threshold }) {
      const counts = compositionEventCounts(total, threshold);
      return positiveNumeratorDenominatorSum(rational(counts.favorable, counts.all));
    },
    render(parameters, answer) {
      return {
        prompt: `\\(a,b,c\\ge0\\), \\(a+b+c=${parameters.total}\\)인 순서쌍을 균등하게 고른다. \\(a<${parameters.threshold}\\) 또는 \\(b<${parameters.threshold}\\)일 확률을 기약분수 \\(q/p\\)라 할 때 \\(p+q\\)를 구하여라.`,
        solution: `별과 막대 및 포함배제로 확률을 구해 줄이면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function physicalBallCounts(parameters, useBitmask) {
  const white = Array.from({ length: parameters.whiteCount }, (_, index) => ({ color: "W", label: index + 1 }));
  const blackStart = parameters.whiteCount - parameters.overlap + 1;
  const black = Array.from({ length: parameters.blackCount }, (_, index) => ({ color: "B", label: blackStart + index }));
  const balls = [...white, ...black];
  let conditioned = 0;
  let favorable = 0;
  if (useBitmask) {
    for (let mask = 0; mask < 1 << balls.length; mask += 1) {
      const selected = balls.filter((_, index) => mask & (1 << index));
      if (selected.length !== parameters.drawCount) continue;
      const labels = new Set(selected.map((item) => item.label));
      if (labels.size === selected.length) continue;
      conditioned += 1;
      if (selected.filter((item) => item.color === "B").length === parameters.targetBlack) favorable += 1;
    }
    return { conditioned, favorable };
  }
  function visit(index, selected) {
    if (selected.length === parameters.drawCount) {
      const labels = new Set(selected.map((item) => item.label));
      if (labels.size === selected.length) return;
      conditioned += 1;
      if (selected.filter((item) => item.color === "B").length === parameters.targetBlack) favorable += 1;
      return;
    }
    for (let next = index; next < balls.length; next += 1) visit(next + 1, [...selected, balls[next]]);
  }
  visit(0, []);
  return { conditioned, favorable };
}

function makeLabelCollisionConditional(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "라벨 충돌 조건부 색상 개수 확률"),
    build(random) {
      const whiteCount = randomInteger(random, 3, 5);
      const blackCount = randomInteger(random, 3, 5);
      const drawCount = randomInteger(random, 3, Math.min(5, whiteCount + blackCount - 1));
      return { parameters: { whiteCount, blackCount, overlap: randomInteger(random, 1, Math.min(3, whiteCount, blackCount)), drawCount, targetBlack: randomInteger(random, 1, drawCount - 1) } };
    },
    solve(parameters) {
      const counts = physicalBallCounts(parameters, false);
      return positiveNumeratorDenominatorSum(rational(counts.favorable, counts.conditioned));
    },
    crossCheck(parameters) {
      const counts = physicalBallCounts(parameters, true);
      return positiveNumeratorDenominatorSum(rational(counts.favorable, counts.conditioned));
    },
    degeneracyReasons(parameters) {
      const counts = physicalBallCounts(parameters, true);
      return counts.conditioned === 0 || counts.favorable === 0 ? ["empty conditional event"] : [];
    },
    render(parameters, answer) {
      return {
        prompt: `흰 공 ${parameters.whiteCount}개와 검은 공 ${parameters.blackCount}개 중 ${parameters.drawCount}개를 고른다. 두 색 사이에 같은 라벨이 ${parameters.overlap}쌍 있다. 적어도 한 라벨이 겹친다는 조건에서 검은 공이 정확히 ${parameters.targetBlack}개일 확률을 기약분수 \\(q/p\\)라 할 때 \\(p+q\\)를 구하여라.`,
        solution: `물리적인 공의 부분집합을 세어 조건부확률을 줄이면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function countBoundedColorVectors(capacities, total, positiveTarget) {
  let count = 0;
  function visit(index, remaining, positives) {
    if (index === capacities.length) {
      if (remaining === 0 && positives === positiveTarget) count += 1;
      return;
    }
    for (let value = 0; value <= Math.min(capacities[index], remaining); value += 1) visit(index + 1, remaining - value, positives + (value > 0 ? 1 : 0));
  }
  visit(0, total, 0);
  return count;
}

function countBoundedColorVectorsDp(capacities, total, positiveTarget) {
  let dp = new Map([["0:0", 1]]);
  for (const capacity of capacities) {
    const next = new Map();
    for (const [key, count] of dp) {
      const [sum, positives] = key.split(":").map(Number);
      for (let value = 0; value <= capacity && sum + value <= total; value += 1) {
        const nextKey = `${sum + value}:${positives + (value > 0 ? 1 : 0)}`;
        next.set(nextKey, (next.get(nextKey) || 0) + count);
      }
    }
    dp = next;
  }
  return dp.get(`${total}:${positiveTarget}`) || 0;
}

function makeBoundedColorVectors(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "색별 상한이 있는 다중집합 선택"),
    build(random) {
      const colorCount = randomInteger(random, 4, 6);
      const capacities = Array.from({ length: colorCount }, () => randomInteger(random, 1, 5));
      return { parameters: { capacities, total: randomInteger(random, 4, Math.min(9, capacities.reduce((a, b) => a + b, 0))), positiveTarget: randomInteger(random, 2, Math.min(4, colorCount)) } };
    },
    solve({ capacities, total, positiveTarget }) {
      return countBoundedColorVectors(capacities, total, positiveTarget);
    },
    crossCheck({ capacities, total, positiveTarget }) {
      return countBoundedColorVectorsDp(capacities, total, positiveTarget);
    },
    degeneracyReasons(parameters, answer) {
      return answer === 0 ? ["no bounded color vector"] : [];
    },
    render(parameters, answer) {
      return {
        prompt: `색별 공의 개수가 \\((${parameters.capacities.join(",")})\\)이다. 순서를 고려하지 않고 공 ${parameters.total}개를 고르되 정확히 ${parameters.positiveTarget}가지 색이 나타나는 선택의 수를 구하여라.`,
        solution: `색별 선택 개수 벡터를 상한 아래에서 세면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function topologicalCount(nodeCount, predecessorMasks) {
  const size = 1 << nodeCount;
  const dp = Array(size).fill(0);
  dp[0] = 1;
  for (let mask = 0; mask < size; mask += 1) {
    for (let node = 0; node < nodeCount; node += 1) {
      if (mask & (1 << node)) continue;
      if ((predecessorMasks[node] & mask) !== predecessorMasks[node]) continue;
      dp[mask | (1 << node)] += dp[mask];
    }
  }
  return dp[size - 1];
}

function topologicalCountByPermutation(nodeCount, predecessorMasks) {
  let count = 0;
  const order = [];
  const used = Array(nodeCount).fill(false);
  function visit() {
    if (order.length === nodeCount) {
      const position = Array(nodeCount);
      order.forEach((node, index) => { position[node] = index; });
      for (let node = 0; node < nodeCount; node += 1) {
        for (let pred = 0; pred < nodeCount; pred += 1) if ((predecessorMasks[node] & (1 << pred)) && position[pred] > position[node]) return;
      }
      count += 1;
      return;
    }
    for (let node = 0; node < nodeCount; node += 1) {
      if (used[node]) continue;
      used[node] = true;
      order.push(node);
      visit();
      order.pop();
      used[node] = false;
    }
  }
  visit();
  return count;
}

function makePermutationPoset(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "순열의 두 사슬 순서조건"),
    build(random) {
      const firstChain = randomInteger(random, 2, 3);
      const secondChain = randomInteger(random, 2, 3);
      const free = randomInteger(random, 0, 1);
      const nodeCount = firstChain + secondChain + free;
      return { parameters: { firstChain, secondChain, free, nodeCount } };
    },
    solve(parameters) {
      const predecessors = Array(parameters.nodeCount).fill(0);
      for (let index = 1; index < parameters.firstChain; index += 1) predecessors[index] |= 1 << (index - 1);
      const start = parameters.firstChain;
      for (let index = 1; index < parameters.secondChain; index += 1) predecessors[start + index] |= 1 << (start + index - 1);
      return topologicalCount(parameters.nodeCount, predecessors);
    },
    crossCheck(parameters) {
      const predecessors = Array(parameters.nodeCount).fill(0);
      for (let index = 1; index < parameters.firstChain; index += 1) predecessors[index] |= 1 << (index - 1);
      const start = parameters.firstChain;
      for (let index = 1; index < parameters.secondChain; index += 1) predecessors[start + index] |= 1 << (start + index - 1);
      return topologicalCountByPermutation(parameters.nodeCount, predecessors);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(X=\\{1,\\ldots,${parameters.nodeCount}\\}\\)의 순열 \\(f\\)가 길이 ${parameters.firstChain}인 값의 증가 사슬과 길이 ${parameters.secondChain}인 서로 다른 값의 증가 사슬을 동시에 만족한다. 가능한 순열의 수를 구하여라.`,
        solution: `두 사슬이 만드는 부분순서의 선형확장 수를 세면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeFlowerVases(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "서로 다른 꽃종을 두 화병에 선택"),
    build(random) {
      const species = randomInteger(random, 3, 6);
      return { parameters: { capacities: Array.from({ length: species }, () => randomInteger(random, 3, 12)), largeAmount: randomInteger(random, 4, 9) } };
    },
    solve({ capacities, largeAmount }) {
      let count = 0;
      for (let small = 0; small < capacities.length; small += 1) {
        for (let large = 0; large < capacities.length; large += 1) if (small !== large && capacities[small] >= 1 && capacities[large] >= largeAmount) count += 1;
      }
      return count;
    },
    crossCheck({ capacities, largeAmount }) {
      return capacities.reduce((total, _, small) => total + capacities.filter((capacity, large) => large !== small && capacity >= largeAmount).length, 0);
    },
    degeneracyReasons(parameters, answer) {
      return answer === 0 ? ["no valid vase species"] : [];
    },
    render(parameters, answer) {
      return {
        prompt: `꽃종별 보유 수가 \\((${parameters.capacities.join(",")})\\)이다. 화병 A에는 한 송이, 화병 B에는 A와 다른 꽃종 ${parameters.largeAmount}송이를 꽂는 선택의 수를 구하여라.`,
        solution: `A의 꽃종을 정한 뒤 남은 꽃종의 보유량을 확인하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeScaledUrnProbability(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "같은색·다른색 확률 조건의 공 개수"),
    build(random) {
      const black = randomInteger(random, 2, 10);
      const white = 2 * black + 1;
      const total = white + black;
      const denominator = choose(total, 2);
      const scaleMultiplier = randomInteger(random, 1, 5);
      return { parameters: { black, white, total, scale: denominator * scaleMultiplier, scaleMultiplier } };
    },
    solve({ total, scale }) {
      const black = (total - 1) / 3;
      if (!Number.isInteger(black)) throw new Error("urn count is not integral");
      return scale * choose(black, 2) / choose(total, 2);
    },
    crossCheck(parameters) {
      if (choose(parameters.white, 2) !== parameters.white * parameters.black) throw new Error("p=q condition failed");
      return parameters.scaleMultiplier * choose(parameters.black, 2);
    },
    render(parameters, answer) {
      return {
        prompt: `흰 공 \\(W\\)개와 검은 공 \\(B\\)개가 있고 \\(W+B=${parameters.total}\\)이다. 두 공을 뽑을 때 흰-흰 확률과 흰-검 확률이 같다. 검은-검 확률을 \\(r\\)라 할 때 \\(${parameters.scale}r\\)을 구하여라.`,
        solution: `\\(\\binom W2=WB\\)와 전체 개수 조건을 풀어 확률을 계산하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeNormalScaledRatio(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "신뢰구간으로 모표준편차 비율 복원"),
    build(random) {
      const meanHundred = randomInteger(random, 100, 260);
      const halfWidthHundred = randomInteger(random, 1, 6);
      const sampleRoot = randomInteger(random, 5, 8);
      return { parameters: { meanHundred, halfWidthHundred, sampleRoot, sampleSize: sampleRoot ** 2, lowerHundred: meanHundred - halfWidthHundred, upperHundred: meanHundred + halfWidthHundred, answerScale: 49 * meanHundred } };
    },
    solve({ meanHundred, halfWidthHundred, sampleRoot, answerScale }) {
      const sigmaOverMean = rational(25 * halfWidthHundred * sampleRoot, 49 * meanHundred);
      const result = rational(BigInt(answerScale) * sigmaOverMean.n, sigmaOverMean.d);
      if (result.d !== 1n) throw new Error("scaled ratio is not integral");
      return Number(result.n);
    },
    crossCheck({ meanHundred, halfWidthHundred, sampleRoot }) {
      return 25 * halfWidthHundred * sampleRoot;
    },
    render(parameters, answer) {
      return {
        prompt: `정규모집단의 표본크기는 ${parameters.sampleSize}이고 모평균의 95% 신뢰구간이 \\([${(parameters.lowerHundred / 100).toFixed(2)},${(parameters.upperHundred / 100).toFixed(2)}]\\)이다. \\(1.96=49/25\\), \\(k=\\sigma/\\bar x\\)일 때 \\(${parameters.answerScale}k\\)를 구하여라.`,
        solution: `구간의 중심과 반폭을 이용해 \\(\\sigma\\)를 구하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function subsetSolutions(parameters, useMask) {
  const values = Array.from({ length: parameters.universeSize }, (_, index) => index + 1);
  const solutions = [];
  if (useMask) {
    for (let mask = 0; mask < 1 << values.length; mask += 1) {
      const selected = values.filter((_, index) => mask & (1 << index));
      if (selected.filter((value) => value <= parameters.coreSize).length !== parameters.coreSelected) continue;
      if (selected.reduce((a, b) => a + b, 0) === parameters.targetSum) solutions.push(selected);
    }
    return solutions;
  }
  function visit(index, selected, sum, coreCount) {
    if (index === values.length) {
      if (coreCount === parameters.coreSelected && sum === parameters.targetSum) solutions.push([...selected]);
      return;
    }
    visit(index + 1, selected, sum, coreCount);
    selected.push(values[index]);
    visit(index + 1, selected, sum + values[index], coreCount + (values[index] <= parameters.coreSize ? 1 : 0));
    selected.pop();
  }
  visit(0, [], 0, 0);
  return solutions;
}

function makeUniqueSubsetProduct(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "교집합 개수와 원소합으로 부분집합 복원"),
    build(random) {
      const universeSize = randomInteger(random, 6, 10);
      const coreSize = randomInteger(random, 2, Math.min(5, universeSize - 2));
      const coreSelected = randomInteger(random, 1, coreSize - 1);
      let mask = randomInteger(random, 1, (1 << universeSize) - 1);
      let selected = Array.from({ length: universeSize }, (_, index) => index + 1).filter((_, index) => mask & (1 << index));
      if (selected.filter((value) => value <= coreSize).length !== coreSelected || !selected.some((value) => value > coreSize)) {
        mask = (1 << coreSelected) - 1;
        mask |= 1 << coreSize;
        selected = Array.from({ length: universeSize }, (_, index) => index + 1).filter((_, index) => mask & (1 << index));
      }
      return { parameters: { universeSize, coreSize, coreSelected, targetSum: selected.reduce((a, b) => a + b, 0) } };
    },
    solve(parameters) {
      const solutions = subsetSolutions(parameters, true);
      if (solutions.length !== 1) throw new Error("subset is not unique");
      return solutions[0].filter((value) => value > parameters.coreSize).reduce((product, value) => product * value, 1);
    },
    crossCheck(parameters) {
      const solutions = subsetSolutions(parameters, false);
      if (solutions.length !== 1) throw new Error("recursive subset is not unique");
      return solutions[0].filter((value) => value > parameters.coreSize).reduce((product, value) => product * value, 1);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(A=\\{1,\\ldots,${parameters.coreSize}\\}\\), \\(B=\\{1,\\ldots,${parameters.universeSize}\\}\\)이다. \\(P\\subseteq B\\), \\(|P\\cap A|=${parameters.coreSelected}\\), \\(\\sum_{x\\in P}x=${parameters.targetSum}\\)일 때 \\(\\prod_{x\\in P\\setminus A}x\\)를 구하여라.`,
        solution: `조건을 만족하는 유일한 부분집합을 찾고 A 밖 원소를 곱하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeSignedPairMapping(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "양·음 입력쌍의 독립 함수값 조건"),
    build(random) {
      return { parameters: { magnitude: randomInteger(random, 2, 5), delta: randomInteger(random, 1, 4) } };
    },
    solve({ magnitude, delta }) {
      let perPair = 0;
      const codomain = [];
      for (let value = -magnitude; value <= magnitude; value += 1) if (value !== 0) codomain.push(value);
      for (const positiveImage of codomain.filter((value) => value > 0)) {
        for (const negativeInputImage of codomain) if (Math.abs(positiveImage + negativeInputImage) === delta) perPair += 1;
      }
      return perPair ** magnitude;
    },
    crossCheck(parameters) {
      const codomain = [];
      for (let value = -parameters.magnitude; value <= parameters.magnitude; value += 1) if (value !== 0) codomain.push(value);
      let perPair = 0;
      for (let positive = 1; positive <= parameters.magnitude; positive += 1) {
        for (const other of codomain) if (Math.abs(positive + other) === parameters.delta) perPair += 1;
      }
      let count = 1;
      for (let pair = 0; pair < parameters.magnitude; pair += 1) count *= perPair;
      return count;
    },
    degeneracyReasons(parameters, answer) {
      return answer === 0 ? ["no allowed image pair"] : [];
    },
    render(parameters, answer) {
      return {
        prompt: `\\(X=\\{-${parameters.magnitude},\\ldots,-1,1,\\ldots,${parameters.magnitude}\\}\\)이고 \\(f:X\\to X\\)이다. 모든 \\(x\\in X\\)에 대해 \\(|f(x)+f(-x)|=${parameters.delta}\\), \\(x>0\\Rightarrow f(x)>0\\)일 때 함수의 개수를 구하여라.`,
        solution: `각 양·음 입력쌍에서 허용되는 함수값쌍을 세고 독립적으로 곱하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

const wave1Batch2Definitions = [
  makeMixedColorUrnProbability("2016-09-KICE-GA-Q24"),
  makeCrossGroupPair("2016-09-KICE-NA-Q22"),
  makeCommitteeWithSpecialMember("2017-06-KICE-NA-Q22"),
  makeOrderedSelectionWithRequiredPerson("2017-09-KICE-GA-Q22"),
  makeAdjacentPairArrangement("2018-10-EDUCATION_OFFICE-GA-Q22"),
  makeNoAdjacentEqualSequence("2019-04-EDUCATION_OFFICE-GA-Q22"),
  makePermutationCombinationSum("2017-07-EDUCATION_OFFICE-NA-Q23"),
  makePermutationCombinationEquation("2018-09-KICE-GA-Q22"),
  makeRepeatedCombination("2019-10-EDUCATION_OFFICE-GA-Q22"),
  makeRepeatedCombinationInverse("2017-07-EDUCATION_OFFICE-GA-Q23"),
  makeDisjointProbability("2016-04-EDUCATION_OFFICE-GA-Q23"),
  makeGeometricPartialDifference("2020-09-KICE-GA-Q27"),
  makeSignedRecurrenceCount("2020-06-KICE-GA-Q24"),
  makeTelescopingRootSum("2019-09-KICE-NA-Q26"),
  makeSquareBoundSolutions("2022-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18"),
  makeOddDiceConditional("2026-06-KICE-PROBABILITY_STATISTICS-Q29"),
  makeCompositionConditional("2018-09-KICE-GA-Q28"),
  makeLabelCollisionConditional("2020-06-KICE-GA-Q27"),
  makeBoundedColorVectors("2019-10-EDUCATION_OFFICE-NA-Q26"),
  makePermutationPoset("2017-10-EDUCATION_OFFICE-GA-Q26"),
  makeFlowerVases("2016-10-EDUCATION_OFFICE-GA-Q26"),
  makeScaledUrnProbability("2024-06-KICE-PROBABILITY_STATISTICS-Q29"),
  makeNormalScaledRatio("2017-09-KICE-GA-Q26"),
  makeUniqueSubsetProduct("2016-03-EDUCATION_OFFICE-NA-Q29"),
  makeSignedPairMapping("2016-03-EDUCATION_OFFICE-GA-Q29"),
];

module.exports = { wave1Batch2Definitions };
