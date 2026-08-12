"use strict";

const {
  gcdBigInt,
  pick,
  positiveNumeratorDenominatorSum,
  randomInteger,
  rational,
  rationalAdd,
  rationalDiv,
  rationalMul,
  rationalSub,
} = require("../arenaPdfPilotGenerators/core");

function meta(sourceReferenceId, title) {
  return {
    id: `ARENA_PDF_TX_${sourceReferenceId.replaceAll("-", "_")}`,
    sourceReferenceId,
    title,
  };
}

function compareRational(left, right) {
  const difference = left.n * right.d - right.n * left.d;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function equalRational(left, right) {
  return left.n === right.n && left.d === right.d;
}

function negateRational(value) {
  return rational(-value.n, value.d);
}

function rationalFunctionF(x, n, p) {
  return rational(x + 2 * n, 2 * x - p);
}

function rationalFunctionG(x, n, q) {
  return rational(2n * x.n + BigInt(n) * x.d, x.n + BigInt(q) * x.d);
}

function exactRationalOrderCount(n) {
  let p = null;
  for (let candidate = 1; candidate <= 40; candidate += 1) {
    if ([1, 3, 5].some((x) => 2 * x === candidate)) continue;
    const f1 = rationalFunctionF(1, n, candidate);
    const f5 = rationalFunctionF(5, n, candidate);
    const f3 = rationalFunctionF(3, n, candidate);
    if (compareRational(f1, f5) < 0 && compareRational(f5, f3) < 0) {
      p = candidate;
      break;
    }
  }
  if (p === null) throw new Error("minimal p was not found");
  const f1 = rationalFunctionF(1, n, p);
  const f5 = rationalFunctionF(5, n, p);
  const f3 = rationalFunctionF(3, n, p);
  let count = 0;
  for (let q = 1; q <= 4 * n + 12; q += 1) {
    if ([f1, f3, f5].some((value) => value.n + BigInt(q) * value.d === 0n)) continue;
    const g5 = rationalFunctionG(f5, n, q);
    const g3 = rationalFunctionG(f3, n, q);
    const g1 = rationalFunctionG(f1, n, q);
    if (compareRational(g5, g3) < 0 && compareRational(g3, g1) < 0) count += 1;
  }
  return count;
}

function makeRationalOrderSequence(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "두 유리함수의 순서조건으로 정의되는 계수 수열"),
    build(random) {
      return { parameters: { horizon: randomInteger(random, 5, 25) } };
    },
    solve({ horizon }) {
      let sum = 0;
      for (let n = 1; n <= horizon; n += 1) sum += Math.ceil((3 * n) / 2);
      return sum;
    },
    crossCheck({ horizon }) {
      let sum = 0;
      for (let n = 1; n <= horizon; n += 1) sum += exactRationalOrderCount(n);
      return sum;
    },
    render(parameters, answer) {
      return {
        prompt: `자연수 \\(n\\)에 대해 \\(f(x)=\\frac{x+2n}{2x-p}\\)이고 \\(f(1)<f(5)<f(3)\\)을 만족시키는 최소 자연수 \\(p\\)를 택한다. \\(g(x)=\\frac{2x+n}{x+q}\\)라 할 때 \\(a_n\\)을 \\(g(f(5))<g(f(3))<g(f(1))\\)인 자연수 \\(q\\)의 개수라 하자. \\(\\sum_{n=1}^{${parameters.horizon}}a_n\\)을 구하여라.`,
        solution: `분모의 부호를 나누어 최소 \\(p\\)와 각 \\(q\\) 구간을 구하면 \\(a_n=\\lceil3n/2\\rceil\\)이고 합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function divisors(value) {
  const result = [];
  for (let divisor = 1; divisor <= value; divisor += 1) if (value % divisor === 0) result.push(divisor);
  return result;
}

function makeGeometricIndexSum(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "자연수 공비 등비수열에서 특정 항의 위치합"),
    build(random) {
      return { parameters: { exponent: randomInteger(random, 8, 60) } };
    },
    solve({ exponent }) {
      return divisors(exponent).reduce((sum, rootExponent) => sum + exponent / rootExponent + 1, 0);
    },
    crossCheck({ exponent }) {
      let sum = 0;
      for (let index = 2; index <= exponent + 1; index += 1) {
        if (exponent % (index - 1) !== 0) continue;
        const ratio = 2 ** (exponent / (index - 1));
        if (Number.isInteger(ratio) && ratio >= 2) sum += index;
      }
      return sum;
    },
    render(parameters, answer) {
      return {
        prompt: `첫째항이 3이고 공비가 2 이상인 자연수인 모든 등비수열을 생각하자. \\(3\\cdot2^{${parameters.exponent}}\\)가 그 수열의 \\(k\\)번째 항이 되는 모든 자연수 \\(k\\)의 합을 구하여라.`,
        solution: `공비를 \\(2^d\\)로 놓으면 \\(d(k-1)=${parameters.exponent}\\)이므로 약수를 순회한 위치합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function latticeSquareCount(n, width, curvature) {
  let count = 0;
  for (let x = 1; x <= width * n; x += 1) count += curvature * x * x;
  return count;
}

function makeParabolicLatticeLimit(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "포물선 띠 안의 격자 단위정사각형 개수 극한"),
    build(random) {
      return { parameters: { width: randomInteger(random, 1, 3), curvature: randomInteger(random, 1, 4) } };
    },
    solve({ width, curvature }) {
      return curvature * width ** 3;
    },
    crossCheck({ width, curvature }) {
      const difference = (n) => latticeSquareCount(n + 1, width, curvature) - latticeSquareCount(n, width, curvature);
      return (difference(2) - 2 * difference(1) + difference(0)) / 2;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(S_n\\)을 \\(1\\le x\\le${parameters.width}n\\)인 각 정수 열에서 \\(0<y<${parameters.curvature}x^2\\)인 포물선 영역에 놓이는 격자 단위정사각형의 개수라 하자. \\(\\lim_{n\\to\\infty}\\frac{S_{n+1}-S_n}{n^2}\\)을 구하여라.`,
        solution: `열별 개수의 제곱합에서 최고차항을 추출하면 극한은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function arithmeticAbsoluteTotal(m, d) {
  const first = -((3 * m - 2) * d) / 2;
  let total = 0;
  for (let index = m; index <= 2 * m; index += 1) total += Math.abs(first + (index - 1) * d);
  return { first, total };
}

function makeArithmeticAbsoluteSum(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "대칭 항과 절댓값합으로 정해지는 정수 등차수열"),
    build(random) {
      const m = pick(random, [3, 5, 7, 9]);
      const d = 2 * randomInteger(random, 1, 6);
      const { first, total } = arithmeticAbsoluteTotal(m, d);
      return { parameters: { m, selectedDifference: d, first, total } };
    },
    solve(parameters) {
      let sum = 0;
      for (let d = 1; d <= 30; d += 1) {
        const { first, total } = arithmeticAbsoluteTotal(parameters.m, d);
        if (!Number.isInteger(first) || total !== parameters.total) continue;
        let nonzero = true;
        for (let n = 1; n <= 3 * parameters.m; n += 1) if (first + (n - 1) * d === 0) nonzero = false;
        if (nonzero && first + (2 * parameters.m - 1) * d === -(first + (parameters.m - 1) * d)) sum += d;
      }
      return sum;
    },
    crossCheck(parameters) {
      const unit = arithmeticAbsoluteTotal(parameters.m, 2).total / 2;
      if (parameters.total % unit !== 0) throw new Error("absolute-sum difference is not integral");
      return parameters.total / unit;
    },
    render(parameters, answer) {
      return {
        prompt: `공차 \\(d\\)가 자연수인 정수 등차수열 \\((a_n)\\)이 모든 항이 0이 아니고 \\(a_{2m}=-a_m\\)인 자연수 \\(m=${parameters.m}\\)에 대해 \\(\\sum_{k=m}^{2m}|a_k|=${parameters.total}\\)을 만족한다. 가능한 모든 \\(d\\)의 합을 구하여라.`,
        solution: `대칭 조건으로 첫째항을 \\(m,d\\)로 나타내고 절댓값합을 계산하면 공차의 합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function weightedPartialSumTotal(first, difference) {
  let total = 0;
  let partial = 0;
  for (let k = 1; k <= 7; k += 1) {
    partial += first + (k - 1) * difference;
    total += partial;
  }
  return total;
}

function makeArithmeticDivisibility(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "가중 부분합과 특정 항의 합동조건을 갖는 자연수 등차수열"),
    build(random) {
      const modulus = randomInteger(random, 7, 13);
      const difference = randomInteger(random, 1, 4);
      const multiple = randomInteger(random, 2, 6);
      const first = modulus * multiple - 6 * difference;
      return { parameters: { modulus, total: weightedPartialSumTotal(first, difference), selectedFirst: first, selectedDifference: difference } };
    },
    solve(parameters) {
      const answers = new Set();
      for (let first = 1; first <= 100; first += 1) {
        for (let difference = 1; difference <= 20; difference += 1) {
          if ((first + 6 * difference) % parameters.modulus !== 0) continue;
          if (weightedPartialSumTotal(first, difference) === parameters.total) answers.add(first + difference);
        }
      }
      if (answers.size !== 1) throw new Error("arithmetic sequence is not unique");
      return [...answers][0];
    },
    crossCheck(parameters) {
      const answers = [];
      for (let d = 1; d <= 20; d += 1) {
        const numerator = parameters.total - 56 * d;
        if (numerator <= 0 || numerator % 28 !== 0) continue;
        const first = numerator / 28;
        if ((first + 6 * d) % parameters.modulus === 0) answers.push(first + d);
      }
      if (new Set(answers).size !== 1) throw new Error("closed-form arithmetic sequence is not unique");
      return answers[0];
    },
    render(parameters, answer) {
      return {
        prompt: `모든 항이 자연수인 등차수열 \\((a_n)\\)의 부분합을 \\(S_n\\)이라 하자. \\(a_7\\)은 ${parameters.modulus}의 배수이고 \\(\\sum_{k=1}^{7}S_k=${parameters.total}\\)일 때 \\(a_2\\)를 구하여라.`,
        solution: `가중 부분합을 첫째항과 공차로 나타내고 합동조건을 적용하면 \\(a_2=${answer}\\)이다.`,
      };
    },
  };
}

function makePiecewiseFixedReturn(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "부호별 제곱·일차 점화의 고정귀환"),
    build(random) {
      return { parameters: { multiplier: randomInteger(random, 2, 5), offset: randomInteger(random, 2, 9) } };
    },
    solve({ multiplier, offset }) {
      return positiveNumeratorDenominatorSum(rational(offset, multiplier + 1));
    },
    crossCheck({ multiplier, offset }) {
      const fixed = rational(offset, multiplier + 1);
      let value = fixed;
      const terms = [value];
      for (let n = 1; n < 5; n += 1) {
        value = value.n < 0n ? rationalMul(value, value) : rationalSub(rational(offset), rationalMul(rational(multiplier), value));
        terms.push(value);
      }
      if (terms.some((term) => term.n <= 0n) || !equalRational(terms[2], terms[4])) throw new Error("fixed-return branch check failed");
      return positiveNumeratorDenominatorSum(fixed);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(a_1,\\ldots,a_5>0\\)이고 \\(a_{n+1}=a_n^2\\;(a_n\\le0)\\), \\(a_{n+1}=-${parameters.multiplier}a_n+${parameters.offset}\\;(a_n>0)\\)이다. \\(a_3=a_5\\)를 만족하는 모든 \\(a_1\\)의 합을 기약분수 \\(q/p\\)라 할 때 \\(p+q\\)를 구하여라.`,
        solution: `양수 가지의 2회 합성 고정점을 구해 약분하면 성분의 합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function affineValue(expression, k) {
  return rationalAdd(rationalMul(expression.a, k), expression.b);
}

function affineNegate(expression) {
  return { a: negateRational(expression.a), b: negateRational(expression.b) };
}

function affineAddConstant(expression, value) {
  return { a: expression.a, b: rationalAdd(expression.b, rational(value)) };
}

function affineAddKAndConstant(expression, value) {
  return { a: rationalAdd(expression.a, rational(1)), b: rationalAdd(expression.b, rational(value)) };
}

function constraintSatisfied(constraint, value) {
  const evaluated = affineValue(constraint.expression, value);
  const sign = compareRational(evaluated, rational(0));
  return constraint.kind === "NEGATIVE" ? sign < 0 : sign >= 0;
}

function piecewiseAffinePaths(initial, decrement) {
  let states = [{ terms: [{ a: rational(0), b: rational(initial) }], constraints: [] }];
  for (let n = 1; n <= 4; n += 1) {
    const nextStates = [];
    for (const state of states) {
      const current = state.terms.at(-1);
      nextStates.push({
        terms: [...state.terms, affineAddKAndConstant(current, -decrement)],
        constraints: [...state.constraints, { expression: current, kind: "NONNEGATIVE" }],
      });
      const inside = affineAddConstant(current, n);
      nextStates.push({
        terms: [...state.terms, inside],
        constraints: [...state.constraints, { expression: current, kind: "NEGATIVE" }, { expression: inside, kind: "NONNEGATIVE" }],
      });
      nextStates.push({
        terms: [...state.terms, affineNegate(inside)],
        constraints: [...state.constraints, { expression: current, kind: "NEGATIVE" }, { expression: inside, kind: "NEGATIVE" }],
      });
    }
    states = nextStates;
  }
  return states;
}

function affineRoot(expression) {
  if (expression.a.n === 0n) return null;
  return rationalDiv(negateRational(expression.b), expression.a);
}

function piecewiseExtremaCandidates(initial, decrement) {
  const candidates = new Map();
  for (const state of piecewiseAffinePaths(initial, decrement)) {
    for (const index of [3, 4]) {
      const root = affineRoot(state.terms[index]);
      if (!root || !state.constraints.every((constraint) => constraintSatisfied(constraint, root))) continue;
      candidates.set(`${root.n}/${root.d}`, root);
    }
  }
  return [...candidates.values()];
}

function actualPiecewiseTerms(initial, decrement, k) {
  const terms = [rational(initial)];
  for (let n = 1; n <= 4; n += 1) {
    const current = terms.at(-1);
    if (current.n < 0n) {
      const inside = rationalAdd(current, rational(n));
      terms.push(inside.n < 0n ? negateRational(inside) : inside);
    } else {
      terms.push(rationalAdd(rationalSub(current, rational(decrement)), k));
    }
  }
  return terms;
}

function makePiecewiseParameterExtrema(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "절댓값 점화에서 영항을 만드는 매개변수의 양끝값"),
    build(random) {
      return { parameters: { initial: randomInteger(random, 2, 6), decrement: randomInteger(random, 6, 12) } };
    },
    solve(parameters) {
      const candidates = piecewiseExtremaCandidates(parameters.initial, parameters.decrement);
      if (candidates.length < 2) throw new Error("too few piecewise extrema candidates");
      candidates.sort(compareRational);
      const sum = rationalAdd(candidates[0], candidates.at(-1));
      return positiveNumeratorDenominatorSum(sum);
    },
    crossCheck(parameters) {
      const verified = piecewiseExtremaCandidates(parameters.initial, parameters.decrement).filter((k) => {
        const terms = actualPiecewiseTerms(parameters.initial, parameters.decrement, k);
        return terms[3].n === 0n || terms[4].n === 0n;
      });
      const unique = new Map(verified.map((value) => [`${value.n}/${value.d}`, value]));
      const values = [...unique.values()].sort(compareRational);
      if (values.length < 2) throw new Error("verified extrema candidates missing");
      return positiveNumeratorDenominatorSum(rationalAdd(values[0], values.at(-1)));
    },
    render(parameters, answer) {
      return {
        prompt: `실수 \\(k\\)에 대해 \\(a_1=${parameters.initial}\\), \\(a_{n+1}=|a_n+n|\\;(a_n<0)\\), \\(a_{n+1}=a_n-${parameters.decrement}+k\\;(a_n\\ge0)\\)이다. \\(a_4a_5=0\\)인 \\(k\\)의 최댓값 \\(M\\), 최솟값 \\(m\\)에 대해 \\(M+m=q/p\\)일 때 \\(p+q\\)를 구하여라.`,
        solution: `각 부호·절댓값 가지에서 \\(a_4=0\\) 또는 \\(a_5=0\\)을 풀고 양끝값을 합치면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function binaryValueCounts(target, baseOne, baseThree, evenOffset, oddOffset) {
  const counts = new Map([[baseOne, 1]]);
  counts.set(baseThree, (counts.get(baseThree) || 0) + 1);
  for (let value = Math.min(baseOne, baseThree) + 1; value <= target; value += 1) {
    let count = counts.get(value) || 0;
    count += counts.get(value - evenOffset) || 0;
    count += 2 * (counts.get(value - oddOffset) || 0);
    counts.set(value, count);
  }
  return counts.get(target) || 0;
}

function makeBinaryIndexRecurrence(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "지수의 이진 나머지 분해로 정의되는 수열의 역상 개수"),
    build(random) {
      const evenOffset = randomInteger(random, 1, 2);
      const oddOffset = randomInteger(random, 3, 5);
      const baseOne = 1;
      const baseThree = randomInteger(random, 3, 5);
      return { parameters: { evenOffset, oddOffset, baseOne, baseThree, target: randomInteger(random, 6, 10) } };
    },
    solve(parameters) {
      return binaryValueCounts(parameters.target, parameters.baseOne, parameters.baseThree, parameters.evenOffset, parameters.oddOffset);
    },
    crossCheck(parameters) {
      const nodes = new Map([[1, parameters.baseOne], [3, parameters.baseThree]]);
      let frontier = [1, 3];
      while (frontier.length) {
        const next = [];
        for (const index of frontier) {
          const value = nodes.get(index);
          for (const [child, childValue] of [
            [2 * index, value + parameters.evenOffset],
            [4 * index + 1, value + parameters.oddOffset],
            [4 * index + 3, value + parameters.oddOffset],
          ]) {
            if (childValue > parameters.target || nodes.has(child)) continue;
            nodes.set(child, childValue);
            next.push(child);
          }
        }
        frontier = next;
      }
      return [...nodes.values()].filter((value) => value === parameters.target).length;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(a_1=${parameters.baseOne},a_3=${parameters.baseThree}\\), \\(a_{2n}=a_n+${parameters.evenOffset}\\), \\(a_{4n+1}=a_{4n+3}=a_n+${parameters.oddOffset}\\)이다. \\(a_k=${parameters.target}\\)인 자연수 \\(k\\)의 개수를 구하여라.`,
        solution: `짝수·두 홀수 나머지의 역전이를 값별로 누적하면 \\(${answer}\\)개이다.`,
      };
    },
  };
}

function centroidYTerms(parameters, targetIndex) {
  const values = [parameters.q1y, parameters.q2y];
  for (let n = 1; values.length < targetIndex; n += 1) {
    const py = parameters.slope * n + parameters.intercept;
    values.push(3 * py - values[n - 1] - values[n]);
  }
  return values;
}

function makeCentroidRecurrence(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "연속한 세 점의 무게중심으로 정의되는 좌표 점화"),
    build(random) {
      return { parameters: { q1y: 0, q2y: randomInteger(random, -2, 2), slope: randomInteger(random, 1, 5), intercept: randomInteger(random, 1, 8), targetIndex: randomInteger(random, 8, 14) } };
    },
    solve(parameters) {
      const y = centroidYTerms(parameters, parameters.targetIndex).at(-1);
      return parameters.targetIndex - 1 + y;
    },
    crossCheck(parameters) {
      const values = centroidYTerms(parameters, parameters.targetIndex);
      for (let n = 1; n <= parameters.targetIndex - 2; n += 1) {
        if ((values[n - 1] + values[n] + values[n + 1]) / 3 !== parameters.slope * n + parameters.intercept) throw new Error("centroid recurrence mismatch");
      }
      return parameters.targetIndex - 1 + values.at(-1);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(P_n=(n,${parameters.slope}n+${parameters.intercept})\\)이고 \\(P_n\\)은 \\(Q_n,Q_{n+1},Q_{n+2}\\)의 무게중심이다. \\(Q_1=(0,${parameters.q1y})\\), \\(Q_2=(1,${parameters.q2y})\\), \\(Q_${parameters.targetIndex}=(p,q)\\)일 때 \\(p+q\\)를 구하여라.`,
        solution: `좌표별 무게중심 점화를 순서대로 적용하면 \\(p+q=${answer}\\)이다.`,
      };
    },
  };
}

function makeWeightedReciprocalProduct(sourceReferenceId) {
  function term(parameters, k) {
    const numerator = parameters.linear * k + parameters.constant;
    const difference = parameters.quadratic * (2 * k - 1) + parameters.partialLinear;
    return rational(numerator, difference);
  }
  return {
    ...meta(sourceReferenceId, "가중 역수 부분합 차분으로 얻는 수열항의 곱"),
    build(random) {
      const start = randomInteger(random, 3, 7);
      return { parameters: { linear: randomInteger(random, 2, 6), constant: randomInteger(random, -1, 3), quadratic: randomInteger(random, 1, 4), partialLinear: randomInteger(random, 2, 8), indices: [start, start + 2, start + 4] } };
    },
    solve(parameters) {
      let product = rational(1);
      for (const index of parameters.indices) product = rationalMul(product, term(parameters, index));
      return positiveNumeratorDenominatorSum(product);
    },
    crossCheck(parameters) {
      const sequence = [];
      const maximum = Math.max(...parameters.indices);
      let previous = 0;
      for (let k = 1; k <= maximum; k += 1) {
        const current = parameters.quadratic * k * k + parameters.partialLinear * k;
        sequence[k] = rational(parameters.linear * k + parameters.constant, current - previous);
        previous = current;
      }
      let product = rational(1);
      for (const index of parameters.indices) product = rationalMul(product, sequence[index]);
      return positiveNumeratorDenominatorSum(product);
    },
    render(parameters, answer) {
      return {
        prompt: `모든 자연수 \\(n\\)에 대해 \\(\\sum_{k=1}^{n}\\frac{${parameters.linear}k${parameters.constant >= 0 ? "+" : ""}${parameters.constant}}{a_k}=${parameters.quadratic}n^2+${parameters.partialLinear}n\\)이다. \\(a_${parameters.indices[0]}a_${parameters.indices[1]}a_${parameters.indices[2]}=q/p\\)일 때 \\(p+q\\)를 구하여라.`,
        solution: `연속한 부분합을 빼서 각 \\(a_k\\)를 구하고 곱을 약분하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function triangleCount(maximum) {
  let count = 0;
  for (let a = 1; a <= maximum; a += 1) for (let b = a + 1; b <= maximum; b += 1) for (let c = b + 1; c <= maximum; c += 1) if (a + b > c) count += 1;
  return count;
}

function makeTriangleTriples(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "서로 다른 세 자연수의 삼각부등식 개수"),
    build(random) {
      return { parameters: { maximum: randomInteger(random, 8, 22) } };
    },
    solve({ maximum }) {
      let count = 0;
      for (let c = 3; c <= maximum; c += 1) {
        for (let b = 2; b < c; b += 1) count += Math.max(0, b - Math.max(1, c - b + 1));
      }
      return count;
    },
    crossCheck({ maximum }) {
      return triangleCount(maximum);
    },
    render(parameters, answer) {
      return {
        prompt: `자연수 \\(a<b<c\\le${parameters.maximum}\\)이고 \\(a+b>c\\)인 순서쌍 \\((a,b,c)\\)의 개수를 구하여라.`,
        solution: `가장 큰 변 \\(c\\)와 둘째 변 \\(b\\)를 고정해 가능한 \\(a\\)를 세면 \\(${answer}\\)개이다.`,
      };
    },
  };
}

function iterateTranslation(initial, down, up, steps) {
  let value = initial;
  for (let step = 0; step < steps; step += 1) value = value >= 0 ? value - down : value + up;
  return value;
}

function makePiecewiseTranslationMinimum(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "두 평행이동 가지를 갖는 점화수열의 최소 초항"),
    build(random) {
      return { parameters: { down: randomInteger(random, 1, 3), up: randomInteger(random, 3, 7), targetIndex: randomInteger(random, 8, 18) } };
    },
    solve(parameters) {
      for (let first = 1; first <= 100; first += 1) if (iterateTranslation(first, parameters.down, parameters.up, parameters.targetIndex - 1) < 0) return first;
      throw new Error("negative target initial value missing");
    },
    crossCheck(parameters) {
      const candidates = [];
      for (let first = 1; first <= parameters.down + parameters.up + 20; first += 1) {
        let current = first;
        for (let n = 1; n < parameters.targetIndex; n += 1) current += current >= 0 ? -parameters.down : parameters.up;
        if (current < 0) candidates.push(first);
      }
      if (!candidates.length) throw new Error("translation candidate missing");
      return Math.min(...candidates);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(a_1\\)은 자연수이고 \\(a_{n+1}=a_n-${parameters.down}\\;(a_n\\ge0)\\), \\(a_{n+1}=a_n+${parameters.up}\\;(a_n<0)\\)이다. \\(a_${parameters.targetIndex}<0\\)이 되게 하는 최소 \\(a_1\\)을 구하여라.`,
        solution: `평행이동 점화를 한 주기 안의 잉여류별로 추적하면 최소 초항은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function piecewiseScaledStep(value) {
  return value.n < 0n ? rationalMul(rational(-2), value) : rationalSub(value, rational(2));
}

function makeScaledPiecewiseInitial(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "말항에서 역추적하는 구간 제한 조각점화"),
    build(random) {
      const scale = pick(random, [20, 30, 40, 50, 60]);
      const selectedNumerator = randomInteger(random, scale + 1, 2 * scale - 1);
      let value = rational(selectedNumerator, scale);
      for (let n = 1; n < 7; n += 1) value = piecewiseScaledStep(value);
      return { parameters: { scale, selectedNumerator, targetNumerator: Number(value.n), targetDenominator: Number(value.d) } };
    },
    solve(parameters) {
      const answers = [];
      for (let numerator = parameters.scale + 1; numerator < 2 * parameters.scale; numerator += 1) {
        let value = rational(numerator, parameters.scale);
        for (let n = 1; n < 7; n += 1) value = piecewiseScaledStep(value);
        if (value.n === BigInt(parameters.targetNumerator) && value.d === BigInt(parameters.targetDenominator)) answers.push(numerator);
      }
      if (answers.length !== 1) throw new Error("piecewise initial value is not unique");
      return answers[0];
    },
    crossCheck(parameters) {
      for (let numerator = parameters.scale + 1; numerator < 2 * parameters.scale; numerator += 1) {
        const terms = [rational(numerator, parameters.scale)];
        while (terms.length < 7) terms.push(terms.at(-1).n < 0n ? rationalMul(rational(-2), terms.at(-1)) : rationalAdd(terms.at(-1), rational(-2)));
        if (terms.at(-1).n === BigInt(parameters.targetNumerator) && terms.at(-1).d === BigInt(parameters.targetDenominator)) return numerator;
      }
      throw new Error("piecewise initial cross-check missing");
    },
    render(parameters, answer) {
      return {
        prompt: `\\(1<a_1<2\\), \\(a_{n+1}=-2a_n\\;(a_n<0)\\), \\(a_{n+1}=a_n-2\\;(a_n\\ge0)\\)이고 \\(a_7=${parameters.targetNumerator}/${parameters.targetDenominator}\\)이다. \\(${parameters.scale}a_1\\)을 구하여라.`,
        solution: `일곱째항에서 가지 조건을 확인하며 역추적하면 \\(${parameters.scale}a_1=${answer}\\)이다.`,
      };
    },
  };
}

function evenSequenceAnswers(pairSum, second, horizon) {
  let states = [[pairSum - second, second]];
  for (let n = 2; n < 2 * horizon; n += 1) {
    const nextStates = [];
    for (const sequence of states) {
      const previous = sequence.at(-1);
      for (const next of [previous - (2 * n - 1), previous + (2 * n - 1)]) {
        if ((n + 1) % 2 === 0 && previous + next !== pairSum) continue;
        nextStates.push([...sequence, next]);
      }
    }
    states = nextStates;
  }
  return states.map((sequence) => sequence.filter((_, index) => index % 2 === 1).reduce((sum, value) => sum + value, 0));
}

function makeEvenTermSum(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "짝수 부분합과 연속항 절댓값 차로 정해지는 수열"),
    build(random) {
      const pairSum = 2 * randomInteger(random, 5, 13) + 1;
      return { parameters: { pairSum, second: (pairSum + (randomInteger(random, 0, 1) ? 1 : -1)) / 2, horizon: randomInteger(random, 5, 10) } };
    },
    solve(parameters) {
      const answers = new Set(evenSequenceAnswers(parameters.pairSum, parameters.second, parameters.horizon));
      if (answers.size !== 1) throw new Error("even-term sum is not unique");
      return [...answers][0];
    },
    crossCheck(parameters) {
      const answers = evenSequenceAnswers(parameters.pairSum, parameters.second, parameters.horizon);
      if (!answers.length || !answers.every((value) => value === answers[0])) throw new Error("even-term cross-check is not unique");
      return answers[0];
    },
    render(parameters, answer) {
      return {
        prompt: `모든 자연수 \\(n\\)에 대해 \\(\\sum_{k=1}^{2n}a_k=${parameters.pairSum}n\\), \\(|a_{n+1}-a_n|=2n-1\\)이고 \\(a_2=${parameters.second}\\)이다. \\(\\sum_{n=1}^{${parameters.horizon}}a_{2n}\\)을 구하여라.`,
        solution: `각 인접한 홀짝 항의 합과 절댓값 차를 차례로 결합하면 짝수항의 합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function arithmeticPartial(first, difference, n) {
  return (n * (2 * first + (n - 1) * difference)) / 2;
}

function makeDoubleMinimumArithmetic(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "연속한 두 부분합 최솟값과 두 절댓값 조건의 등차수열"),
    build(random) {
      const difference = randomInteger(random, 1, 8);
      const minimumIndex = 7;
      const first = -minimumIndex * difference;
      const m = 9;
      return { parameters: { difference, minimumIndex, m, targetAbsolute: Math.abs(arithmeticPartial(first, difference, m)) } };
    },
    solve(parameters) {
      const difference = parameters.targetAbsolute / 27;
      if (!Number.isInteger(difference)) throw new Error("arithmetic difference is not integral");
      return 5 * difference;
    },
    crossCheck(parameters) {
      const answers = [];
      for (let difference = 1; difference <= 20; difference += 1) {
        const first = -parameters.minimumIndex * difference;
        if (Math.abs(arithmeticPartial(first, difference, parameters.m)) !== parameters.targetAbsolute) continue;
        if (Math.abs(arithmeticPartial(first, difference, 2 * parameters.m)) !== parameters.targetAbsolute) continue;
        answers.push(first + 12 * difference);
      }
      if (answers.length !== 1) throw new Error("double-minimum arithmetic solution is not unique");
      return answers[0];
    },
    render(parameters, answer) {
      return {
        prompt: `등차수열의 부분합 \\(S_n\\)이 \\(n=${parameters.minimumIndex},${parameters.minimumIndex + 1}\\)에서 모두 최소이고 \\(m=${parameters.m}\\)에 대해 \\(|S_m|=|S_{2m}|=${parameters.targetAbsolute}\\)이다. \\(a_{13}\\)을 구하여라.`,
        solution: `\\(a_${parameters.minimumIndex + 1}=0\\)과 두 절댓값 식을 적용하면 \\(a_{13}=${answer}\\)이다.`,
      };
    },
  };
}

function branchKPaths(k, shiftNumerator, terminalIndex) {
  let states = [[k]];
  const shift = rational(shiftNumerator, 3);
  for (let n = 1; n < terminalIndex; n += 1) {
    const next = [];
    for (const terms of states) {
      const current = terms.at(-1);
      next.push([...terms, rationalSub(current, rationalMul(shift, k))]);
      next.push([...terms, negateRational(rationalMul(k, current))]);
    }
    states = next;
  }
  return states;
}

function branchKSolutions(shiftNumerator, terminalIndex, denominatorLimit) {
  const solutions = new Map();
  for (let denominator = 1; denominator <= denominatorLimit; denominator += 1) {
    for (let numerator = 1; numerator <= 20 * denominator; numerator += 1) {
      if (gcdBigInt(BigInt(numerator), BigInt(denominator)) !== 1n) continue;
      const k = rational(numerator, denominator);
      if (branchKPaths(k, shiftNumerator, terminalIndex).some((terms) => terms.at(-1).n === 0n && terms[1].n * terms[2].n < 0n)) solutions.set(`${k.n}/${k.d}`, k);
    }
  }
  return [...solutions.values()];
}

function makeBranchProductRecurrence(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "두 인수 중 하나가 0인 점화의 매개변수 제곱합"),
    build(random) {
      return { parameters: { shiftNumerator: randomInteger(random, 1, 3), terminalIndex: randomInteger(random, 4, 6) } };
    },
    solve(parameters) {
      const values = branchKSolutions(parameters.shiftNumerator, parameters.terminalIndex, 12);
      let sum = rational(0);
      for (const value of values) sum = rationalAdd(sum, rationalMul(value, value));
      if (sum.d !== 1n) throw new Error("branch parameter square sum is not integral");
      return Number(sum.n);
    },
    crossCheck(parameters) {
      const values = branchKSolutions(parameters.shiftNumerator, parameters.terminalIndex, 20);
      let numerator = 0n;
      let denominator = 1n;
      for (const value of values) {
        const square = rationalMul(value, value);
        numerator = numerator * square.d + square.n * denominator;
        denominator *= square.d;
        const divisor = gcdBigInt(numerator, denominator);
        numerator /= divisor;
        denominator /= divisor;
      }
      if (denominator !== 1n) throw new Error("cross-checked square sum is not integral");
      return Number(numerator);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(k>0,a_1=k,a_2a_3<0\\)이고 \\(\\left(a_{n+1}-a_n+\\frac{${parameters.shiftNumerator}k}{3}\\right)(a_{n+1}+ka_n)=0\\)이다. \\(a_${parameters.terminalIndex}=0\\)이 되게 하는 모든 \\(k\\)의 제곱합을 구하여라.`,
        solution: `각 단계에서 두 점화 가지를 나누고 종착항과 부호조건을 만족하는 \\(k\\)를 모으면 제곱합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function rationalPartialTerm(n, numeratorScale, pole) {
  return rational(numeratorScale * n, 2 * n - pole);
}

function partialRationalSum(n, numeratorScale, pole) {
  let sum = rational(0);
  for (let index = 1; index <= n; index += 1) sum = rationalAdd(sum, rationalPartialTerm(index, numeratorScale, pole));
  return sum;
}

function ceilRational(value) {
  const quotient = value.n / value.d;
  return Number(value.n % value.d === 0n ? quotient : quotient + 1n);
}

function makeRationalPartialExtremum(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "극점을 지나는 유리수열 부분합의 마지막 허용 지수"),
    build(random) {
      const pole = pick(random, [7, 9, 11, 13, 15]);
      const numeratorScale = randomInteger(random, 6, 12);
      const selectedMaximum = randomInteger(random, Math.floor(pole / 2) + 3, Math.floor(pole / 2) + 12);
      const selectedSum = partialRationalSum(selectedMaximum, numeratorScale, pole);
      return { parameters: { pole, numeratorScale, selectedMaximum, threshold: ceilRational(selectedSum) } };
    },
    solve(parameters) {
      let maximum = 0;
      for (let m = 1; m <= 100; m += 1) {
        const sum = partialRationalSum(m, parameters.numeratorScale, parameters.pole);
        if (compareRational(sum, rational(parameters.threshold)) <= 0) maximum = m;
      }
      return maximum;
    },
    crossCheck(parameters) {
      let total = 0;
      let maximum = 0;
      for (let n = 1; n <= 100; n += 1) {
        total += (parameters.numeratorScale * n) / (2 * n - parameters.pole);
        if (total <= parameters.threshold + 1e-10) maximum = n;
      }
      return maximum;
    },
    degeneracyReasons(parameters, answer) {
      return answer !== parameters.selectedMaximum ? ["chosen threshold did not isolate the requested maximum"] : [];
    },
    render(parameters, answer) {
      return {
        prompt: `\\(a_n=\\frac{${parameters.numeratorScale}n}{2n-${parameters.pole}}\\)일 때 \\(\\sum_{n=1}^{m}a_n\\le${parameters.threshold}\\)을 만족하는 자연수 \\(m\\)의 최댓값을 구하여라.`,
        solution: `분모의 부호가 바뀌는 지점을 포함해 부분합을 정확히 비교하면 최댓값은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeTelescopingIntegerSequence(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "두 이차식 사이의 유일한 정수와 역수 망원합"),
    build(random) {
      return { parameters: { denominator: randomInteger(random, 2, 7), horizon: randomInteger(random, 20, 100) } };
    },
    solve({ horizon }) {
      return 2 * horizon + 1;
    },
    crossCheck(parameters) {
      let sum = rational(0);
      for (let n = 1; n <= parameters.horizon; n += 1) {
        const lower = n * n + n - 1 / parameters.denominator;
        const integer = Math.floor(lower) + 1;
        if (!(lower < integer && integer < lower + 1)) throw new Error("intermediate integer is not unique");
        sum = rationalAdd(sum, rational(1, integer));
      }
      return positiveNumeratorDenominatorSum(sum);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=x^2+x-1/${parameters.denominator}\\)이고 정수 \\(a_n\\)이 \\(f(n)<a_n<f(n)+1\\)을 만족한다. \\(\\sum_{n=1}^{${parameters.horizon}}1/a_n=q/p\\)일 때 \\(p+q\\)를 구하여라.`,
        solution: `유일한 정수는 \\(a_n=n(n+1)\\)이고 역수합을 망원합으로 줄이면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeLogOddSum(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "로그 부분합에서 홀수항만 고른 망원곱"),
    build(random) {
      const answer = randomInteger(random, 2, 5);
      return { parameters: { answer, horizon: 2 ** answer - 1 } };
    },
    solve({ answer }) {
      return answer;
    },
    crossCheck({ horizon }) {
      let numerator = 1n;
      let denominator = 1n;
      for (let n = 1; n <= horizon; n += 1) {
        numerator *= BigInt(2 * n + 2);
        denominator *= BigInt(2 * n);
        const divisor = gcdBigInt(numerator, denominator);
        numerator /= divisor;
        denominator /= divisor;
      }
      if (denominator !== 1n) throw new Error("logarithmic telescoping product is not integral");
      let value = numerator;
      let exponent = 0;
      while (value > 1n && value % 2n === 0n) {
        value /= 2n;
        exponent += 1;
      }
      if (value !== 1n) throw new Error("telescoping product is not a power of two");
      return exponent;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(\\sum_{k=1}^{n}a_k=\\log_2(n^2+n)\\)일 때 \\(\\sum_{n=1}^{${parameters.horizon}}a_{2n+1}\\)을 구하여라.`,
        solution: `부분합을 차분해 홀수항의 로그를 하나의 망원곱으로 합치면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function cubicRootCount(slope, constant) {
  const discriminant = 4 * slope ** 3 - 27 * constant ** 2;
  return discriminant > 0 ? 3 : discriminant === 0 ? 2 : 1;
}

function makeCubicIntersectionSum(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "삼차곡선과 정수기울기 직선의 교점 개수합"),
    build(random) {
      return { parameters: { constant: randomInteger(random, 1, 5), maximumSlope: randomInteger(random, 4, 12) } };
    },
    solve({ constant, maximumSlope }) {
      let total = 0;
      for (let slope = 1; slope <= maximumSlope; slope += 1) total += cubicRootCount(slope, constant);
      return total;
    },
    crossCheck({ constant, maximumSlope }) {
      let total = 0;
      for (let slope = 1; slope <= maximumSlope; slope += 1) {
        const critical = Math.sqrt(slope / 3);
        const leftValue = (-critical) ** 3 - slope * (-critical) + constant;
        const rightValue = critical ** 3 - slope * critical + constant;
        total += leftValue > 0 && rightValue < 0 ? 3 : leftValue === 0 || rightValue === 0 ? 2 : 1;
      }
      return total;
    },
    render(parameters, answer) {
      return {
        prompt: `곡선 \\(C:y=x^3+${parameters.constant}\\)와 직선 \\(\\ell_k:y=kx\\)의 교점 개수를 \\(f(k)\\)라 하자. \\(\\sum_{k=1}^{${parameters.maximumSlope}}f(k)\\)를 구하여라.`,
        solution: `\\(x^3-kx+${parameters.constant}=0\\)의 판별식 또는 두 극값으로 실근 개수를 분류해 합하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

const wave1Batch3SequenceDefinitions = [
  makeRationalOrderSequence("2018-03-EDUCATION_OFFICE-NA-Q30"),
  makeGeometricIndexSum("2019-03-EDUCATION_OFFICE-NA-Q29"),
  makeParabolicLatticeLimit("2019-03-EDUCATION_OFFICE-NA-Q30"),
  makeArithmeticAbsoluteSum("2022-04-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q21"),
  makeArithmeticDivisibility("2023-09-KICE-PROBABILITY_STATISTICS-Q21"),
  makePiecewiseFixedReturn("2025-05-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q22"),
  makePiecewiseParameterExtrema("2025-10-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q22"),
  makeBinaryIndexRecurrence("2026-06-KICE-PROBABILITY_STATISTICS-Q22"),
  makeCentroidRecurrence("2017-10-EDUCATION_OFFICE-NA-Q29"),
  makeWeightedReciprocalProduct("2020-06-KICE-NA-Q28"),
  makeTriangleTriples("2020-10-EDUCATION_OFFICE-GA-Q29"),
  makePiecewiseTranslationMinimum("2021-04-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q21"),
  makeScaledPiecewiseInitial("2022-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q20"),
  makeEvenTermSum("2022-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q21"),
  makeDoubleMinimumArithmetic("2023-05-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q20"),
  makeBranchProductRecurrence("2024-09-KICE-PROBABILITY_STATISTICS-Q22"),
  makeRationalPartialExtremum("2016-03-EDUCATION_OFFICE-NA-Q30"),
  makeTelescopingIntegerSequence("2017-03-EDUCATION_OFFICE-NA-Q27"),
  makeLogOddSum("2017-10-EDUCATION_OFFICE-NA-Q25"),
  makeCubicIntersectionSum("2017-10-EDUCATION_OFFICE-NA-Q26"),
];

module.exports = { wave1Batch3SequenceDefinitions };
