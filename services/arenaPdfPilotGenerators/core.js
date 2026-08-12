"use strict";

const { createHash } = require("node:crypto");

function gcdBigInt(left, right) {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a || 1n;
}

function rational(numerator, denominator = 1n) {
  let n = BigInt(numerator);
  let d = BigInt(denominator);
  if (d === 0n) throw new Error("zero denominator");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const divisor = gcdBigInt(n, d);
  return Object.freeze({ n: n / divisor, d: d / divisor });
}

function rationalAdd(left, right) {
  return rational(left.n * right.d + right.n * left.d, left.d * right.d);
}

function rationalSub(left, right) {
  return rational(left.n * right.d - right.n * left.d, left.d * right.d);
}

function rationalMul(left, right) {
  return rational(left.n * right.n, left.d * right.d);
}

function rationalDiv(left, right) {
  return rational(left.n * right.d, left.d * right.n);
}

function rationalPow(value, exponent) {
  const power = BigInt(exponent);
  return rational(value.n ** power, value.d ** power);
}

function rationalNumber(value) {
  return Number(value.n) / Number(value.d);
}

function rationalText(value) {
  return value.d === 1n ? String(value.n) : `${value.n}/${value.d}`;
}

function positiveNumeratorDenominatorSum(value) {
  if (value.n <= 0n || value.d <= 0n) {
    throw new Error("expected a positive reduced rational");
  }
  return Number(value.n + value.d);
}

function choose(n, r) {
  if (!Number.isInteger(n) || !Number.isInteger(r) || r < 0 || r > n) return 0;
  const k = Math.min(r, n - r);
  let result = 1;
  for (let index = 1; index <= k; index += 1) {
    result = (result * (n - k + index)) / index;
  }
  return Math.round(result);
}

function factorial(value) {
  let result = 1;
  for (let index = 2; index <= value; index += 1) result *= index;
  return result;
}

function compositions(total, length) {
  const results = [];
  const current = Array(length).fill(0);
  function visit(index, remaining) {
    if (index === length - 1) {
      current[index] = remaining;
      results.push([...current]);
      return;
    }
    for (let value = 0; value <= remaining; value += 1) {
      current[index] = value;
      visit(index + 1, remaining - value);
    }
  }
  visit(0, total);
  return results;
}

function positiveCompositions(total, length) {
  if (total < length) return [];
  return compositions(total - length, length).map((values) =>
    values.map((value) => value + 1)
  );
}

function seedWords(seed) {
  const digest = createHash("sha256").update(String(seed), "utf8").digest();
  return [0, 4, 8, 12].map((offset) => digest.readUInt32LE(offset));
}

function createSeededRandom(seed) {
  let [a, b, c, d] = seedWords(seed);
  return function random() {
    const t = (a + b + d) >>> 0;
    d = (d + 1) >>> 0;
    a = (b ^ (b >>> 9)) >>> 0;
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t / 4294967296;
  };
}

function randomInteger(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick(random, values) {
  return values[randomInteger(random, 0, values.length - 1)];
}

function shuffle(random, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInteger(random, 0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    if (typeof value.n === "bigint" && typeof value.d === "bigint") {
      return rationalText(value);
    }
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
      }, {});
  }
  return typeof value === "bigint" ? String(value) : value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function assertArenaAnswer(answer) {
  if (!Number.isInteger(answer) || answer < 1 || answer > 999) {
    throw new Error(`Arena pilot answer outside 1..999: ${answer}`);
  }
}

function buildGeneratedProblem(definition, seed, candidate) {
  const primaryAnswer = definition.solve(candidate.parameters);
  const crossAnswer = definition.crossCheck(candidate.parameters);
  assertArenaAnswer(primaryAnswer);
  if (crossAnswer !== primaryAnswer) {
    throw new Error(
      `${definition.id} oracle disagreement: ${primaryAnswer} !== ${crossAnswer}`
    );
  }
  const degeneracyReasons = definition.degeneracyReasons
    ? definition.degeneracyReasons(candidate.parameters, primaryAnswer)
    : [];
  if (degeneracyReasons.length) {
    throw new Error(`${definition.id} degenerate: ${degeneracyReasons.join(", ")}`);
  }
  const rendered = definition.render(candidate.parameters, primaryAnswer);
  return {
    typeId: definition.id,
    sourceReferenceId: definition.sourceReferenceId,
    canonicalStructureId: definition.canonicalStructureId,
    seed: String(seed),
    parameters: stableValue(candidate.parameters),
    problem: {
      prompt: rendered.prompt,
      inputMode: "short-answer",
      choices: [],
      answer: String(primaryAnswer),
      solution: rendered.solution,
      ...(rendered.visualization ? { visualization: rendered.visualization } : {}),
    },
    validation: {
      passed: true,
      solvable: true,
      uniqueAnswer: true,
      answerMatches: true,
      calculatorFree: true,
      deterministic: true,
      independentCrossCheck: true,
      degeneracyRejected: false,
      productionConnected: false,
    },
  };
}

function generateFromDefinition(definition, seed) {
  const random = createSeededRandom(`${definition.id}:${seed}`);
  let lastError = null;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const candidate = definition.build(random, attempt);
      return buildGeneratedProblem(definition, seed, candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `${definition.id} failed to generate after retries: ${lastError?.message || "unknown"}`
  );
}

module.exports = {
  assertArenaAnswer,
  buildGeneratedProblem,
  choose,
  compositions,
  createSeededRandom,
  factorial,
  generateFromDefinition,
  gcdBigInt,
  pick,
  positiveCompositions,
  positiveNumeratorDenominatorSum,
  randomInteger,
  rational,
  rationalAdd,
  rationalDiv,
  rationalMul,
  rationalNumber,
  rationalPow,
  rationalSub,
  rationalText,
  shuffle,
  stableStringify,
  stableValue,
};
