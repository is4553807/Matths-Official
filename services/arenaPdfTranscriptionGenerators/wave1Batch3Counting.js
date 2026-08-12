"use strict";

const {
  choose,
  factorial,
  randomInteger,
  pick,
} = require("../arenaPdfPilotGenerators/core");

function meta(sourceReferenceId, title) {
  return {
    id: `ARENA_PDF_TX_${sourceReferenceId.replaceAll("-", "_")}`,
    sourceReferenceId,
    title,
  };
}

function visitTuples(length, alphabetSize, callback) {
  const tuple = Array(length).fill(0);
  function visit(index) {
    if (index === length) {
      callback(tuple);
      return;
    }
    for (let value = 1; value <= alphabetSize; value += 1) {
      tuple[index] = value;
      visit(index + 1);
    }
  }
  visit(0);
}

function visitNondecreasing(length, values, callback) {
  const tuple = Array(length).fill(values[0]);
  function visit(index, start) {
    if (index === length) {
      callback(tuple);
      return;
    }
    for (let position = start; position < values.length; position += 1) {
      tuple[index] = values[position];
      visit(index + 1, position);
    }
  }
  visit(0, 0);
}

function makeStableImageMapping(sourceReferenceId) {
  function valid(mapping, maxImage) {
    if (mapping.some((value, index) => value === index + 1)) return false;
    const image = new Set(mapping);
    if (image.size > maxImage) return false;
    const secondImage = new Set([...image].map((value) => mapping[value - 1]));
    return image.size === secondImage.size;
  }
  return {
    ...meta(sourceReferenceId, "상집합이 안정되는 고정점 없는 함수"),
    build(random) {
      const size = randomInteger(random, 4, 5);
      return { parameters: { size, maxImage: randomInteger(random, 2, Math.min(3, size - 1)) } };
    },
    solve({ size, maxImage }) {
      let count = 0;
      for (let code = 0; code < size ** size; code += 1) {
        let value = code;
        const mapping = [];
        for (let index = 0; index < size; index += 1) {
          mapping.push((value % size) + 1);
          value = Math.floor(value / size);
        }
        if (valid(mapping, maxImage)) count += 1;
      }
      return count;
    },
    crossCheck({ size, maxImage }) {
      let count = 0;
      visitTuples(size, size, (mapping) => {
        if (valid([...mapping], maxImage)) count += 1;
      });
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(X=\\{1,\\ldots,${parameters.size}\\}\\)이고 \\(f:X\\to X\\)이다. \\(A=f(X)\\), \\(B=f(A)\\), \\(|A|\\le${parameters.maxImage}\\), \\(|A|=|B|\\), \\(f(x)\\ne x\\)를 모두 만족하는 함수의 개수를 구하여라.`,
        solution: `함수의 상집합이 \\(f\\) 아래에서 안정되는 경우를 고정점 없이 세면 \\(${answer}\\)개이다.`,
      };
    },
  };
}

function allPermutations(values, callback) {
  const used = Array(values.length).fill(false);
  const current = [];
  function visit() {
    if (current.length === values.length) {
      callback(current);
      return;
    }
    for (let index = 0; index < values.length; index += 1) {
      if (used[index]) continue;
      used[index] = true;
      current.push(values[index]);
      visit();
      current.pop();
      used[index] = false;
    }
  }
  visit();
}

function upDownShape(permutation, firstValue, peakValue) {
  const size = permutation.length;
  if (permutation[0] !== firstValue) return 0;
  let count = 0;
  for (let p = 1; p < size - 1; p += 1) {
    if (permutation[p] !== peakValue) continue;
    for (let q = p + 1; q < size; q += 1) {
      let valid = true;
      for (let index = 0; index < p; index += 1) valid &&= permutation[index] < permutation[index + 1];
      for (let index = p; index < q; index += 1) valid &&= permutation[index] > permutation[index + 1];
      for (let index = q; index < size - 1; index += 1) valid &&= permutation[index] < permutation[index + 1];
      if (valid) count += 1;
    }
  }
  return count;
}

function makeUpDownPermutation(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "고정된 첫 항과 봉우리를 갖는 증가-감소-증가 순열"),
    build(random) {
      const size = randomInteger(random, 6, 8);
      return { parameters: { size, firstValue: randomInteger(random, 1, 2), peakValue: size - 1 } };
    },
    solve(parameters) {
      let count = 0;
      allPermutations(Array.from({ length: parameters.size }, (_, index) => index + 1), (permutation) => {
        count += upDownShape(permutation, parameters.firstValue, parameters.peakValue);
      });
      return count;
    },
    crossCheck(parameters) {
      const remaining = Array.from({ length: parameters.size }, (_, index) => index + 1).filter(
        (value) => value !== parameters.firstValue
      );
      let count = 0;
      allPermutations(remaining, (tail) => {
        count += upDownShape([parameters.firstValue, ...tail], parameters.firstValue, parameters.peakValue);
      });
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `\\((a_1,\\ldots,a_${parameters.size})\\)가 \\(\\{1,\\ldots,${parameters.size}\\}\\)의 순열이고 \\(a_1=${parameters.firstValue}\\)이다. \\(1<p<q<${parameters.size}\\), \\(a_p=${parameters.peakValue}\\)이며 \\(p\\) 전에는 증가, \\(p\\)부터 \\(q\\)까지 감소, 이후 증가하는 \\((p,q,a_1,\\ldots,a_${parameters.size})\\)의 개수를 구하여라.`,
        solution: `두 꺾이는 위치와 각 구간에 들어갈 원소를 함께 세면 \\(${answer}\\)개이다.`,
      };
    },
  };
}

function enumerateBoundedBaskets(parameters) {
  let count = 0;
  const red = Array(parameters.baskets).fill(0);
  const blue = Array(parameters.baskets).fill(0);
  function chooseRed(index, remaining) {
    if (index === parameters.baskets) {
      if (remaining !== 0) return;
      function chooseBlue(position, left) {
        if (position === parameters.baskets) {
          if (left === 0) count += 1;
          return;
        }
        const minimum = red[position] ? 0 : 1;
        const maximum = parameters.capacity - red[position];
        for (let value = minimum; value <= Math.min(maximum, left); value += 1) {
          blue[position] = value;
          chooseBlue(position + 1, left - value);
        }
      }
      chooseBlue(0, parameters.blue);
      return;
    }
    for (let value = 0; value <= Math.min(1, remaining); value += 1) {
      red[index] = value;
      chooseRed(index + 1, remaining - value);
    }
  }
  chooseRed(0, parameters.red);
  return count;
}

function makeBoundedBaskets(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "색 공을 용량 제한이 있는 바구니에 분배"),
    build(random) {
      const baskets = randomInteger(random, 4, 6);
      const capacity = randomInteger(random, 2, 3);
      const red = randomInteger(random, 2, baskets - 1);
      const minBlue = baskets - red;
      const maxBlue = baskets * capacity - red;
      return { parameters: { baskets, capacity, red, blue: randomInteger(random, minBlue, Math.min(maxBlue, minBlue + 5)) } };
    },
    solve(parameters) {
      return enumerateBoundedBaskets(parameters);
    },
    crossCheck(parameters) {
      const states = new Map([["0,0", 1]]);
      for (let basket = 0; basket < parameters.baskets; basket += 1) {
        const next = new Map();
        for (const [key, ways] of states) {
          const [redUsed, blueUsed] = key.split(",").map(Number);
          for (let r = 0; r <= 1; r += 1) {
            for (let b = 0; b <= parameters.capacity - r; b += 1) {
              if (r + b === 0) continue;
              const nr = redUsed + r;
              const nb = blueUsed + b;
              if (nr > parameters.red || nb > parameters.blue) continue;
              const state = `${nr},${nb}`;
              next.set(state, (next.get(state) || 0) + ways);
            }
          }
        }
        states.clear();
        for (const [key, value] of next) states.set(key, value);
      }
      return states.get(`${parameters.red},${parameters.blue}`) || 0;
    },
    render(parameters, answer) {
      return {
        prompt: `같은 빨간 공 ${parameters.red}개와 같은 파란 공 ${parameters.blue}개를 서로 다른 바구니 ${parameters.baskets}개에 넣는다. 각 바구니에는 1개 이상 ${parameters.capacity}개 이하가 들어가고 빨간 공은 바구니마다 최대 1개이다. 분배 방법의 수를 구하여라.`,
        solution: `빨간 공을 받을 바구니를 정한 뒤 남은 용량에 파란 공을 분배하면 \\(${answer}\\)가지이다.`,
      };
    },
  };
}

function makeTupleCountSum(sourceReferenceId) {
  const horizons = [2, 7, 8, 9, 11, 12, 16, 17, 18];
  return {
    ...meta(sourceReferenceId, "순서제약 정수튜플 개수의 가중합"),
    build(random) {
      return { parameters: { horizon: pick(random, horizons) } };
    },
    solve({ horizon }) {
      return (horizon * (horizon + 1) * (horizon + 2)) / 9;
    },
    crossCheck({ horizon }) {
      let numerator = 0;
      for (let n = 1; n <= horizon; n += 1) {
        let count = 0;
        for (let x1 = 0; x1 <= n; x1 += 1) {
          for (let x2 = x1; x2 <= n; x2 += 1) {
            const x3 = x1 + 1;
            if (x2 > x3 || x3 > n) continue;
            for (let x4 = x3; x4 <= n; x4 += 1) {
              for (let x5 = x4; x5 <= n; x5 += 1) count += 1;
            }
          }
        }
        numerator += count / (n + 2);
      }
      return numerator;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(a_n\\)을 \\(0\\le x_1\\le\\cdots\\le x_5\\le n\\), \\(x_3=x_1+1\\)인 정수 5-튜플의 개수라 하자. \\(\\sum_{n=1}^{${parameters.horizon}}\\frac{a_n}{n+2}\\)의 값을 구하여라.`,
        solution: `\\(a_n=\\frac{n(n+1)(n+2)}3\\)을 대입해 합하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeResidueMapping(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "함숫값 부호합의 나머지 조건"),
    build(random) {
      return { parameters: { domainSize: randomInteger(random, 3, 5), codomainSize: randomInteger(random, 4, 6), modulus: randomInteger(random, 2, 4) } };
    },
    solve(parameters) {
      const coefficients = [...Array(parameters.domainSize - 1).fill(1), -1];
      let states = Array(parameters.modulus).fill(0);
      states[0] = 1;
      for (const coefficient of coefficients) {
        const next = Array(parameters.modulus).fill(0);
        for (let residue = 0; residue < parameters.modulus; residue += 1) {
          for (let value = 1; value <= parameters.codomainSize; value += 1) {
            const target = ((residue + coefficient * value) % parameters.modulus + parameters.modulus) % parameters.modulus;
            next[target] += states[residue];
          }
        }
        states = next;
      }
      return states[0];
    },
    crossCheck(parameters) {
      let count = 0;
      visitTuples(parameters.domainSize, parameters.codomainSize, (mapping) => {
        const signed = mapping.slice(0, -1).reduce((sum, value) => sum + value, 0) - mapping.at(-1);
        if (signed % parameters.modulus === 0) count += 1;
      });
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(X=\\{1,\\ldots,${parameters.domainSize}\\}\\), \\(Y=\\{1,\\ldots,${parameters.codomainSize}\\}\\)이고 \\(f:X\\to Y\\)이다. \\(f(1)+\\cdots+f(${parameters.domainSize - 1})-f(${parameters.domainSize})\\)가 ${parameters.modulus}의 배수인 함수의 개수를 구하여라.`,
        solution: `각 함숫값의 나머지를 합성해 나머지가 0인 경우를 세면 \\(${answer}\\)개이다.`,
      };
    },
  };
}

function hasDistinctZeroPair(values) {
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      if (values[left] + values[right] === 0) return true;
    }
  }
  return false;
}

function makeNondecreasingZeroPair(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "합이 0인 서로 다른 위치를 갖는 비감소 함수"),
    build(random) {
      const radius = randomInteger(random, 2, 3);
      return { parameters: { length: randomInteger(random, 4, 6), radius } };
    },
    solve(parameters) {
      const values = Array.from({ length: 2 * parameters.radius + 1 }, (_, index) => index - parameters.radius);
      let count = 0;
      visitNondecreasing(parameters.length, values, (mapping) => {
        if (hasDistinctZeroPair(mapping)) count += 1;
      });
      return count;
    },
    crossCheck(parameters) {
      const values = Array.from({ length: 2 * parameters.radius + 1 }, (_, index) => index - parameters.radius);
      let count = 0;
      const tuple = Array(parameters.length).fill(0);
      function visit(index) {
        if (index === parameters.length) {
          if (tuple.every((value, i) => i === 0 || tuple[i - 1] <= value) && hasDistinctZeroPair(tuple)) count += 1;
          return;
        }
        for (const value of values) {
          tuple[index] = value;
          visit(index + 1);
        }
      }
      visit(0);
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(X=\\{1,\\ldots,${parameters.length}\\}\\), \\(Y=\\{-${parameters.radius},\\ldots,${parameters.radius}\\}\\)이고 \\(f:X\\to Y\\)이다. \\(f(1)\\le\\cdots\\le f(${parameters.length})\\)이며 서로 다른 \\(a,b\\)에 대해 \\(f(a)+f(b)=0\\)인 함수의 개수를 구하여라.`,
        solution: `비감소 함숫값을 중복조합으로 나열하고 합이 0인 두 위치가 있는 경우를 남기면 \\(${answer}\\)개이다.`,
      };
    },
  };
}

function makeSecondIterateMapping(sourceReferenceId) {
  function valid(mapping, target) {
    return mapping[mapping[0] - 1] === target && mapping[0] <= mapping[2] && mapping[2] <= mapping.at(-1);
  }
  return {
    ...meta(sourceReferenceId, "두 번 합성값과 세 위치의 순서 조건을 갖는 함수"),
    build(random) {
      const size = randomInteger(random, 4, 5);
      return { parameters: { size, target: randomInteger(random, 2, size) } };
    },
    solve(parameters) {
      let count = 0;
      visitTuples(parameters.size, parameters.size, (mapping) => {
        if (valid(mapping, parameters.target)) count += 1;
      });
      return count;
    },
    crossCheck(parameters) {
      let count = 0;
      for (let code = 0; code < parameters.size ** parameters.size; code += 1) {
        let value = code;
        const mapping = [];
        for (let index = 0; index < parameters.size; index += 1) {
          mapping.push((value % parameters.size) + 1);
          value = Math.floor(value / parameters.size);
        }
        if (valid(mapping, parameters.target)) count += 1;
      }
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(X=\\{1,\\ldots,${parameters.size}\\}\\), \\(f:X\\to X\\)이고 \\(f(f(1))=${parameters.target}\\), \\(f(1)\\le f(3)\\le f(${parameters.size})\\)이다. 가능한 함수의 개수를 구하여라.`,
        solution: `\\(f(1)\\)을 고정하여 합성 조건과 세 함숫값의 순서를 함께 세면 \\(${answer}\\)개이다.`,
      };
    },
  };
}

function makeCappedNondecreasing(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "위치별 상한이 있는 비감소 함수"),
    build(random) {
      const codomain = randomInteger(random, 5, 7);
      return { parameters: { length: 4, codomain, firstCap: randomInteger(random, 2, 4), thirdOffset: randomInteger(random, 2, 4) } };
    },
    solve(parameters) {
      let count = 0;
      visitNondecreasing(parameters.length, Array.from({ length: parameters.codomain }, (_, i) => i + 1), (values) => {
        if (values[0] <= parameters.firstCap && values[2] <= values[0] + parameters.thirdOffset) count += 1;
      });
      return count;
    },
    crossCheck(parameters) {
      let count = 0;
      visitTuples(parameters.length, parameters.codomain, (values) => {
        if (values.every((v, i) => i === 0 || values[i - 1] <= v) && values[0] <= parameters.firstCap && values[2] <= values[0] + parameters.thirdOffset) count += 1;
      });
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f:\\{1,2,3,4\\}\\to\\{1,\\ldots,${parameters.codomain}\\}\\)가 비감소이고 \\(f(1)\\le${parameters.firstCap}\\), \\(f(3)\\le f(1)+${parameters.thirdOffset}\\)이다. 함수의 개수를 구하여라.`,
        solution: `첫 함숫값별로 상한을 만족하는 비감소 꼬리를 세면 \\(${answer}\\)개이다.`,
      };
    },
  };
}

function makeProductCappedNondecreasing(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "끝 두 값의 곱이 제한된 비감소 함수"),
    build(random) {
      const size = randomInteger(random, 4, 6);
      return { parameters: { size, length: 5, secondMinimum: randomInteger(random, 2, 3), productCap: randomInteger(random, Math.max(8, size + 3), size * size) } };
    },
    solve(parameters) {
      let count = 0;
      visitNondecreasing(parameters.length, Array.from({ length: parameters.size }, (_, i) => i + 1), (values) => {
        if (values[1] >= parameters.secondMinimum && values[3] * values[4] < parameters.productCap) count += 1;
      });
      return count;
    },
    crossCheck(parameters) {
      let count = 0;
      visitTuples(parameters.length, parameters.size, (values) => {
        if (values.every((v, i) => i === 0 || values[i - 1] <= v) && values[1] >= parameters.secondMinimum && values[3] * values[4] < parameters.productCap) count += 1;
      });
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f:\\{1,\\ldots,5\\}\\to\\{1,\\ldots,${parameters.size}\\}\\)가 비감소이고 \\(f(2)\\ge${parameters.secondMinimum}\\), \\(f(4)f(5)<${parameters.productCap}\\)이다. 함수의 개수를 구하여라.`,
        solution: `비감소 5-튜플 중 두 추가 조건을 만족하는 것을 세면 \\(${answer}\\)개이다.`,
      };
    },
  };
}

function makeParityChainMapping(sourceReferenceId) {
  function valid(values, parameters) {
    for (let index = 0; index + 2 < values.length; index += 1) if (values[index] > values[index + 2]) return false;
    if (values.at(-1) - values[0] !== parameters.endpointDelta) return false;
    if (Math.abs(values[1] - values[0]) === 0 || Math.abs(values[1] - values[0]) % parameters.divisor !== 0) return false;
    const oddSum = values.filter((_, index) => index % 2 === 0).reduce((sum, value) => sum + value, 0);
    return oddSum % parameters.divisor === 0;
  }
  return {
    ...meta(sourceReferenceId, "홀짝 위치별 단조성과 합동 조건을 갖는 함수"),
    build(random) {
      const size = randomInteger(random, 5, 6);
      return { parameters: { size, endpointDelta: randomInteger(random, 2, Math.min(3, size - 1)), divisor: randomInteger(random, 2, 3) } };
    },
    solve(parameters) {
      const oddLength = Math.ceil(parameters.size / 2);
      const evenLength = Math.floor(parameters.size / 2);
      const values = Array.from({ length: parameters.size }, (_, i) => i + 1);
      let count = 0;
      visitNondecreasing(oddLength, values, (odd) => {
        visitNondecreasing(evenLength, values, (even) => {
          const mapping = [];
          for (let index = 0; index < parameters.size; index += 1) mapping.push(index % 2 ? even[(index - 1) / 2] : odd[index / 2]);
          if (valid(mapping, parameters)) count += 1;
        });
      });
      return count;
    },
    crossCheck(parameters) {
      let count = 0;
      visitTuples(parameters.size, parameters.size, (values) => {
        if (valid(values, parameters)) count += 1;
      });
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f:\\{1,\\ldots,${parameters.size}\\}\\to\\{1,\\ldots,${parameters.size}\\}\\)가 \\(f(n)\\le f(n+2)\\), \\(f(${parameters.size})-f(1)=${parameters.endpointDelta}\\)를 만족한다. 또한 \\(|f(2)-f(1)|/${parameters.divisor}\\)와 홀수 위치 함숫값의 합/${parameters.divisor}가 자연수일 때 함수의 개수를 구하여라.`,
        solution: `홀수 위치와 짝수 위치의 비감소 수열을 따로 만든 뒤 합동 조건을 적용하면 \\(${answer}\\)개이다.`,
      };
    },
  };
}

function containsTwoCycle(mapping) {
  for (let a = 1; a <= mapping.length; a += 1) {
    const b = mapping[a - 1];
    if (a !== b && mapping[b - 1] === a) return true;
  }
  return false;
}

function makeTwoCycleMapping(sourceReferenceId) {
  function valid(values) {
    return values[0] <= values[1] && values[1] <= values[2] && 1 < values[4] && values[4] < values[3] && containsTwoCycle(values);
  }
  return {
    ...meta(sourceReferenceId, "부분 순서와 2-순환을 동시에 갖는 함수"),
    build(random) {
      return { parameters: { size: 5, lower: randomInteger(random, 0, 2) } };
    },
    solve(parameters) {
      let count = 0;
      visitTuples(parameters.size, parameters.size, (values) => {
        if (values[0] <= values[1] && values[1] <= values[2] && parameters.lower < values[4] && values[4] < values[3] && containsTwoCycle(values)) count += 1;
      });
      return count;
    },
    crossCheck(parameters) {
      let count = 0;
      for (let code = 0; code < parameters.size ** parameters.size; code += 1) {
        let value = code;
        const mapping = [];
        for (let i = 0; i < parameters.size; i += 1) {
          mapping.push((value % parameters.size) + 1);
          value = Math.floor(value / parameters.size);
        }
        if (mapping[0] <= mapping[1] && mapping[1] <= mapping[2] && parameters.lower < mapping[4] && mapping[4] < mapping[3] && containsTwoCycle(mapping)) count += 1;
      }
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f:\\{1,\\ldots,5\\}\\to\\{1,\\ldots,5\\}\\)가 \\(f(1)\\le f(2)\\le f(3)\\), \\(${parameters.lower}<f(5)<f(4)\\)이고 서로 다른 \\(a,b\\)에 대해 \\(f(a)=b,f(b)=a\\)이다. 함수의 개수를 구하여라.`,
        solution: `부분 순서를 먼저 적용하고 함수 그래프에 길이 2인 순환이 있는 경우를 세면 \\(${answer}\\)개이다.`,
      };
    },
  };
}

function makeBoundedNonincreasing(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "입력과 함숫값 합의 범위를 갖는 비증가 함수"),
    build(random) {
      const radius = randomInteger(random, 1, 2);
      return { parameters: { radius, sumRadius: randomInteger(random, Math.max(0, radius - 1), radius) } };
    },
    solve({ radius, sumRadius }) {
      const inputs = Array.from({ length: 2 * radius + 1 }, (_, i) => i - radius);
      let states = new Map();
      for (const value of inputs.filter((value) => Math.abs(inputs[0] + value) <= sumRadius)) states.set(value, 1);
      for (let index = 1; index < inputs.length; index += 1) {
        const next = new Map();
        for (const value of inputs) {
          if (Math.abs(inputs[index] + value) > sumRadius) continue;
          let ways = 0;
          for (const [previous, count] of states) if (previous >= value) ways += count;
          if (ways) next.set(value, ways);
        }
        states = next;
      }
      return [...states.values()].reduce((sum, value) => sum + value, 0);
    },
    crossCheck({ radius, sumRadius }) {
      const values = Array.from({ length: 2 * radius + 1 }, (_, i) => i - radius);
      let count = 0;
      const mapping = Array(values.length).fill(0);
      function visit(index) {
        if (index === values.length) {
          count += 1;
          return;
        }
        for (const value of values) {
          if (Math.abs(values[index] + value) > sumRadius) continue;
          if (index && mapping[index - 1] < value) continue;
          mapping[index] = value;
          visit(index + 1);
        }
      }
      visit(0);
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(X=\\{-${parameters.radius},\\ldots,${parameters.radius}\\}\\), \\(f:X\\to X\\)이고 모든 \\(x\\in X\\)에 대해 \\(-${parameters.sumRadius}\\le x+f(x)\\le${parameters.sumRadius}\\), \\(f(x)\\ge f(x+1)\\)이다. 함수의 개수를 구하여라.`,
        solution: `각 입력에서 허용되는 함숫값 구간을 만들고 비증가 조건으로 동적계획하면 \\(${answer}\\)개이다.`,
      };
    },
  };
}

function makeShiftedInequalityMapping(sourceReferenceId) {
  function valid(values) {
    return values[0] <= values[1] && values[1] <= values[0] + values[2] && values[2] <= values[3] && (values[0] + values[1]) % 2 === 0;
  }
  return {
    ...meta(sourceReferenceId, "이동된 부등식 사슬과 짝수합 조건의 함수"),
    build(random) {
      return { parameters: { codomain: randomInteger(random, 4, 7) } };
    },
    solve(parameters) {
      let count = 0;
      for (let a = 1; a <= parameters.codomain; a += 1) {
        for (let b = a; b <= parameters.codomain; b += 1) {
          if ((a + b) % 2) continue;
          for (let c = 1; c <= parameters.codomain; c += 1) {
            for (let d = c; d <= parameters.codomain; d += 1) if (b <= a + c) count += 1;
          }
        }
      }
      return count;
    },
    crossCheck(parameters) {
      let count = 0;
      visitTuples(4, parameters.codomain, (values) => {
        if (valid(values)) count += 1;
      });
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f:\\{1,2,3,4\\}\\to\\{1,\\ldots,${parameters.codomain}\\}\\)가 \\(f(1)\\le f(2)\\le f(1)+f(3)\\le f(1)+f(4)\\)이고 \\(f(1)+f(2)\\)가 짝수이다. 함수의 개수를 구하여라.`,
        solution: `\\(f(1),f(2)\\)의 짝수합을 고정하고 가능한 \\((f(3),f(4))\\)를 세면 \\(${answer}\\)개이다.`,
      };
    },
  };
}

function isPrime(value) {
  if (value < 2) return false;
  for (let divisor = 2; divisor * divisor <= value; divisor += 1) if (value % divisor === 0) return false;
  return true;
}

function makeDivisibilityPoset(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "나눗셈 부분순서와 소수 상한을 갖는 전단사"),
    build(random) {
      return { parameters: { size: randomInteger(random, 5, 7) } };
    },
    solve({ size }) {
      const full = (1 << size) - 1;
      const memo = new Map();
      function count(mask) {
        if (mask === full) return 1;
        if (memo.has(mask)) return memo.get(mask);
        const label = bitCount(mask) + 1;
        let total = 0;
        for (let node = 1; node <= size; node += 1) {
          const bit = 1 << (node - 1);
          if (mask & bit) continue;
          let ready = true;
          for (let divisor = 1; divisor < node; divisor += 1) {
            if (node % divisor === 0 && !(mask & (1 << (divisor - 1)))) ready = false;
          }
          if (!ready || (isPrime(node) && label > node)) continue;
          total += count(mask | bit);
        }
        memo.set(mask, total);
        return total;
      }
      return count(0);
    },
    crossCheck({ size }) {
      let count = 0;
      allPermutations(Array.from({ length: size }, (_, i) => i + 1), (mapping) => {
        for (let input = 2; input <= size; input += 1) if (isPrime(input) && mapping[input - 1] > input) return;
        for (let a = 1; a <= size; a += 1) {
          for (let b = a + 1; b <= size; b += 1) if (b % a === 0 && mapping[a - 1] >= mapping[b - 1]) return;
        }
        count += 1;
      });
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(X=\\{1,\\ldots,${parameters.size}\\}\\)이고 \\(f:X\\to X\\)는 전단사이다. 소수 \\(p\\)에는 \\(f(p)\\le p\\), \\(a<b\\)이고 \\(a\\mid b\\)이면 \\(f(a)<f(b)\\)를 만족한다. 함수의 개수를 구하여라.`,
        solution: `나눗셈 부분순서의 선형확장을 소수 위치의 상한과 함께 세면 \\(${answer}\\)개이다.`,
      };
    },
  };
}

function bitCount(value) {
  let count = 0;
  for (let current = value; current; current >>>= 1) count += current & 1;
  return count;
}

function multisetPlacements(oneCopies, twoCopies, windowStart, targetSum) {
  const types = [
    { color: 0, label: 1 },
    { color: 1, label: 1 },
    { color: 0, label: 2 },
    { color: 1, label: 2 },
  ];
  const counts = [oneCopies, oneCopies, twoCopies, twoCopies];
  const placement = [];
  let count = 0;
  function visit() {
    if (placement.length === 2 * oneCopies + 2 * twoCopies) {
      const window = placement.slice(windowStart, windowStart + 3);
      if (window.every((type) => type.color === window[0].color) && window.reduce((sum, type) => sum + type.label, 0) === targetSum) count += 1;
      return;
    }
    for (let index = 0; index < types.length; index += 1) {
      if (!counts[index]) continue;
      counts[index] -= 1;
      placement.push(types[index]);
      visit();
      placement.pop();
      counts[index] += 1;
    }
  }
  visit();
  return count;
}

function makeColoredBallPlacements(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "같은 색 세 공의 번호합을 고정한 중복물체 배열"),
    build(random) {
      const oneCopies = 2;
      const twoCopies = randomInteger(random, 1, 2);
      const positions = 2 * oneCopies + 2 * twoCopies;
      return { parameters: { oneCopies, twoCopies, positions, windowStart: randomInteger(random, 1, positions - 4), targetSum: randomInteger(random, 4, 5) } };
    },
    solve(parameters) {
      return multisetPlacements(parameters.oneCopies, parameters.twoCopies, parameters.windowStart, parameters.targetSum);
    },
    crossCheck(parameters) {
      const neededOnes = parameters.targetSum === 4 ? 2 : 1;
      const neededTwos = 3 - neededOnes;
      if (neededOnes > parameters.oneCopies || neededTwos > parameters.twoCopies) return 0;
      const remaining = parameters.positions - 3;
      const arrangementsInWindow = factorial(3) / (factorial(neededOnes) * factorial(neededTwos));
      const remainingArrangements = factorial(remaining) /
        (factorial(parameters.oneCopies - neededOnes) * factorial(parameters.twoCopies - neededTwos) * factorial(parameters.oneCopies) * factorial(parameters.twoCopies));
      return 2 * arrangementsInWindow * remainingArrangements;
    },
    render(parameters, answer) {
      const left = parameters.windowStart + 1;
      return {
        prompt: `흰색·검은색 각각에 번호 1인 공은 ${parameters.oneCopies}개, 번호 2인 공은 ${parameters.twoCopies}개씩 있다. 공을 ${parameters.positions}개의 칸에 하나씩 넣을 때 ${left},${left + 1},${left + 2}번 칸의 공은 같은 색이고 번호합이 ${parameters.targetSum}이다. 넣는 방법의 수를 구하여라.`,
        solution: `가운데 세 칸의 공 종류를 정한 뒤 남은 중복물체를 배열하면 \\(${answer}\\)가지이다.`,
      };
    },
  };
}

const wave1Batch3CountingDefinitions = [
  makeStableImageMapping("2022-09-KICE-PROBABILITY_STATISTICS-Q30"),
  makeUpDownPermutation("2016-10-EDUCATION_OFFICE-GA-Q30"),
  makeBoundedBaskets("2016-10-EDUCATION_OFFICE-NA-Q28"),
  makeTupleCountSum("2017-04-EDUCATION_OFFICE-NA-Q30"),
  makeResidueMapping("2018-04-EDUCATION_OFFICE-GA-Q29"),
  makeNondecreasingZeroPair("2022-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q29"),
  makeSecondIterateMapping("2022-06-KICE-PROBABILITY_STATISTICS-Q29"),
  makeProductCappedNondecreasing("2023-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q30"),
  makeParityChainMapping("2023-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q30"),
  makeTwoCycleMapping("2024-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q30"),
  makeBoundedNonincreasing("2024-06-KICE-PROBABILITY_STATISTICS-Q30"),
  makeShiftedInequalityMapping("2024-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q30"),
  makeDivisibilityPoset("2019-07-EDUCATION_OFFICE-NA-Q28"),
  makeCappedNondecreasing("2022-10-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q29"),
  makeColoredBallPlacements("2017-04-EDUCATION_OFFICE-GA-Q28"),
];

module.exports = { wave1Batch3CountingDefinitions };
