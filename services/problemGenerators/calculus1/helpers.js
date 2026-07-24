const {
  randomInteger,
  nonZeroInteger,
  isCorrectAnswer,
} = require("../utils");

function inlineMath(tex) {
  return `\\(${tex}\\)`;
}

function displayMath(tex) {
  return `\\[${tex}\\]`;
}

function signedNumber(value) {
  if (value === 0) return "";

  return value > 0
    ? `+${value}`
    : `-${Math.abs(value)}`;
}

function xMinus(value) {
  if (value === 0) return "x";

  return value > 0
    ? `x-${value}`
    : `x+${Math.abs(value)}`;
}

function linearExpression(
  slope,
  constant,
  variable = "x"
) {
  const variableTerm =
    slope === 1
      ? variable
      : slope === -1
        ? `-${variable}`
        : `${slope}${variable}`;

  return `${variableTerm}${signedNumber(constant)}`;
}

function quadraticExpression(
  quadratic,
  linear,
  constant,
  variable = "x"
) {
  const quadraticTerm =
    quadratic === 1
      ? `${variable}^2`
      : quadratic === -1
        ? `-${variable}^2`
        : `${quadratic}${variable}^2`;

  const linearTerm =
    linear === 0
      ? ""
      : linear === 1
        ? `+${variable}`
        : linear === -1
          ? `-${variable}`
          : linear > 0
            ? `+${linear}${variable}`
            : `-${Math.abs(linear)}${variable}`;

  return `${quadraticTerm}${linearTerm}${signedNumber(
    constant
  )}`;
}

function greatestCommonDivisor(first, second) {
  let a = Math.abs(first);
  let b = Math.abs(second);

  while (b) {
    [a, b] = [b, a % b];
  }

  return a || 1;
}

function fractionTex(numerator, denominator) {
  if (denominator === 0) {
    throw new Error("분모는 0일 수 없습니다.");
  }

  let normalizedNumerator = numerator;
  let normalizedDenominator = denominator;

  if (normalizedDenominator < 0) {
    normalizedNumerator *= -1;
    normalizedDenominator *= -1;
  }

  const divisor = greatestCommonDivisor(
    normalizedNumerator,
    normalizedDenominator
  );

  normalizedNumerator /= divisor;
  normalizedDenominator /= divisor;

  if (normalizedDenominator === 1) {
    return String(normalizedNumerator);
  }

  return `\\frac{${normalizedNumerator}}{${normalizedDenominator}}`;
}

function linearCombinationTex(terms) {
  return terms
    .filter(({ coefficient }) => coefficient !== 0)
    .map(({ coefficient, expression }, index) => {
      const magnitude = Math.abs(coefficient);
      const coefficientText =
        magnitude === 1 ? "" : String(magnitude);
      const term = `${coefficientText}${expression}`;

      if (index === 0) {
        return coefficient < 0 ? `-${term}` : term;
      }

      return coefficient < 0
        ? `-${term}`
        : `+${term}`;
    })
    .join("");
}

module.exports = {
  randomInteger,
  nonZeroInteger,
  isCorrectAnswer,
  inlineMath,
  displayMath,
  signedNumber,
  xMinus,
  linearExpression,
  quadraticExpression,
  fractionTex,
  linearCombinationTex,
};
