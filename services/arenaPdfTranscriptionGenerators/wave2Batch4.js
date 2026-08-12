"use strict";

const {
  randomInteger,
  rational,
  rationalAdd,
  rationalDiv,
  rationalMul,
  rationalNumber,
  rationalSub,
  rationalText,
} = require("../arenaPdfPilotGenerators/core");

function meta(sourceReferenceId, title) {
  return {
    id: `ARENA_PDF_TX_${sourceReferenceId.replaceAll("-", "_")}`,
    sourceReferenceId,
    title,
  };
}

function signedTerm(coefficient, variable = "") {
  const sign = coefficient >= 0 ? "+" : "-";
  return `${sign}${Math.abs(coefficient)}${variable}`;
}

function makeBasicTrigLimit(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "사인과 코사인의 표준극한"),
    build(random) {
      return {
        parameters: {
          sineFrequency: randomInteger(random, 1, 40),
          cosineFrequency: randomInteger(random, 1, 10),
        },
      };
    },
    solve({ sineFrequency }) {
      return sineFrequency;
    },
    crossCheck(parameters) {
      const epsilon = 1e-7;
      return Math.round(
        Math.sin(parameters.sineFrequency * epsilon) /
          (epsilon * Math.cos(parameters.cosineFrequency * epsilon))
      );
    },
    render(parameters, answer) {
      return {
        prompt: `\\(\\displaystyle \\lim_{x\\to0}\\frac{\\sin ${parameters.sineFrequency}x}{x\\cos ${parameters.cosineFrequency}x}\\)의 값을 구하여라.`,
        solution: `\\(\\sin ${parameters.sineFrequency}x/(${parameters.sineFrequency}x)\\to1\\), \\(\\cos ${parameters.cosineFrequency}x\\to1\\)을 적용하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeTangentSubtraction(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "탄젠트 차 공식으로 구하는 각의 탄젠트"),
    build(random) {
      const tanBeta = randomInteger(random, 1, 6);
      const tanAlpha = randomInteger(random, tanBeta + 1, 24);
      const tanDifference = rational(
        tanAlpha - tanBeta,
        1 + tanAlpha * tanBeta
      );
      return { parameters: { tanAlpha, tanBeta, tanDifference } };
    },
    solve(parameters) {
      const numerator = rationalAdd(
        parameters.tanDifference,
        rational(parameters.tanBeta)
      );
      const denominator = rationalSub(
        rational(1),
        rationalMul(parameters.tanDifference, rational(parameters.tanBeta))
      );
      const value = rationalDiv(numerator, denominator);
      if (value.d !== 1n) throw new Error("tangent result is not integral");
      return Number(value.n);
    },
    crossCheck(parameters) {
      const difference = rationalNumber(parameters.tanDifference);
      return Math.round(
        (difference + parameters.tanBeta) /
          (1 - difference * parameters.tanBeta)
      );
    },
    render(parameters, answer) {
      return {
        prompt: `제1사분면의 두 각 \\(\\alpha>\\beta\\)에 대하여 \\(\\tan(\\alpha-\\beta)=${rationalText(parameters.tanDifference)}\\), \\(\\tan\\beta=${parameters.tanBeta}\\)이다. \\(\\tan\\alpha\\)의 값을 구하여라.`,
        solution: `탄젠트 차 공식을 \\(\\tan\\alpha\\)에 대해 정리하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeReciprocalCosineIdentity(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "코사인으로 단순화하는 코시컨트·탄젠트 곱"),
    build(random) {
      return { parameters: { reciprocalCosine: randomInteger(random, 2, 50) } };
    },
    solve({ reciprocalCosine }) {
      return reciprocalCosine;
    },
    crossCheck({ reciprocalCosine }) {
      const cosine = 1 / reciprocalCosine;
      const sine = Math.sqrt(1 - cosine ** 2);
      return Math.round((1 / sine) * (sine / cosine));
    },
    render(parameters, answer) {
      return {
        prompt: `제1사분면의 각 \\(\\theta\\)에 대하여 \\(\\cos\\theta=1/${parameters.reciprocalCosine}\\)이다. \\(\\csc\\theta\\tan\\theta\\)의 값을 구하여라.`,
        solution: `\\(\\csc\\theta\\tan\\theta=1/\\cos\\theta\\)이므로 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeScaledSineCosineSum(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "사인·코사인 곱으로 구하는 합의 배수"),
    build(random) {
      const denominator = randomInteger(random, 3, 20);
      const maxIncrement = Math.max(
        1,
        Math.floor((Math.SQRT2 - 1) * denominator)
      );
      const numerator = denominator + randomInteger(random, 1, maxIncrement);
      const product = rational(
        numerator ** 2 - denominator ** 2,
        2 * denominator ** 2
      );
      return { parameters: { denominator, numerator, product } };
    },
    solve({ numerator }) {
      return numerator;
    },
    crossCheck(parameters) {
      const sum = Math.sqrt(1 + 2 * rationalNumber(parameters.product));
      return Math.round(parameters.denominator * sum);
    },
    render(parameters, answer) {
      return {
        prompt: `제1사분면의 각 \\(\\theta\\)에 대하여 \\(\\sin\\theta\\cos\\theta=${rationalText(parameters.product)}\\)이다. \\(${parameters.denominator}(\\sin\\theta+\\cos\\theta)\\)의 값을 구하여라.`,
        solution: `\\((\\sin\\theta+\\cos\\theta)^2=1+2\\sin\\theta\\cos\\theta\\)이고 합이 양수이므로 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeCubicDerivative(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "삼차다항함수의 도함숫값"),
    build(random) {
      return {
        parameters: {
          cubic: randomInteger(random, 1, 5),
          linear: randomInteger(random, -10, 10),
          constant: randomInteger(random, -20, 20),
          point: randomInteger(random, 1, 6),
        },
      };
    },
    solve(parameters) {
      return 3 * parameters.cubic * parameters.point ** 2 + parameters.linear;
    },
    crossCheck(parameters) {
      const f = (x) =>
        parameters.cubic * x ** 3 +
        parameters.linear * x +
        parameters.constant;
      const epsilon = 1e-5;
      return Math.round(
        (f(parameters.point + epsilon) - f(parameters.point - epsilon)) /
          (2 * epsilon)
      );
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=${parameters.cubic}x^3${signedTerm(parameters.linear, "x")}${signedTerm(parameters.constant)}\\)일 때 \\(f'(${parameters.point})\\)의 값을 구하여라.`,
        solution: `\\(f'(x)=${3 * parameters.cubic}x^2${signedTerm(parameters.linear)}\\)이므로 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeNegativeReciprocalPowerDerivative(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "음의 거듭제곱함수의 도함숫값"),
    build(random) {
      return {
        parameters: {
          coefficient: randomInteger(random, 1, 3),
          power: randomInteger(random, 1, 3),
          denominator: randomInteger(random, 2, 3),
        },
      };
    },
    solve(parameters) {
      return (
        parameters.coefficient *
        parameters.power *
        parameters.denominator ** (parameters.power + 1)
      );
    },
    crossCheck(parameters) {
      const point = 1 / parameters.denominator;
      const f = (x) => -parameters.coefficient / x ** parameters.power;
      const epsilon = 1e-7;
      return Math.round((f(point + epsilon) - f(point - epsilon)) / (2 * epsilon));
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=-\\dfrac{${parameters.coefficient}}{x^{${parameters.power}}}\\)일 때 \\(f'(1/${parameters.denominator})\\)의 값을 구하여라.`,
        solution: `거듭제곱 미분법을 적용하여 \\(x=1/${parameters.denominator}\\)을 대입하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeParametricDerivative(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "매개변수로 나타낸 곡선의 미분계수"),
    build(random) {
      const halfRootCoefficient = randomInteger(random, 1, 5);
      const multiplier = randomInteger(random, 1, 40);
      return {
        parameters: {
          rootCoefficient: 2 * halfRootCoefficient,
          yCoefficient: (halfRootCoefficient + 1) * multiplier,
        },
      };
    },
    solve(parameters) {
      return (
        (3 * parameters.yCoefficient) /
        (1 + parameters.rootCoefficient / 2)
      );
    },
    crossCheck(parameters) {
      const x = (t) => t + parameters.rootCoefficient * Math.sqrt(t);
      const y = (t) => parameters.yCoefficient * t ** 3;
      const epsilon = 1e-6;
      const dx = x(1 + epsilon) - x(1 - epsilon);
      const dy = y(1 + epsilon) - y(1 - epsilon);
      return Math.round(dy / dx);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(x=t+${parameters.rootCoefficient}\\sqrt t\\), \\(y=${parameters.yCoefficient}t^3\\)으로 나타낸 곡선에서 \\(t=1\\)일 때 \\(dy/dx\\)를 구하여라.`,
        solution: `\\(dy/dx=(dy/dt)/(dx/dt)\\)에 \\(t=1\\)을 대입하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeSquareRootCubicDerivative(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "제곱근 합성함수의 도함숫값"),
    build(random) {
      const point = randomInteger(random, 1, 6);
      const answer = randomInteger(random, 1, Math.min(20, 4 * point));
      const insideRoot = 3 * point ** 2;
      const cubicCoefficient = 2 * answer;
      const constant = insideRoot ** 2 - cubicCoefficient * point ** 3;
      return {
        parameters: { point, cubicCoefficient, constant, insideRoot },
      };
    },
    solve(parameters) {
      return (
        (3 * parameters.cubicCoefficient * parameters.point ** 2) /
        (2 * parameters.insideRoot)
      );
    },
    crossCheck(parameters) {
      const f = (x) =>
        Math.sqrt(parameters.cubicCoefficient * x ** 3 + parameters.constant);
      const epsilon = 1e-6;
      return Math.round(
        (f(parameters.point + epsilon) - f(parameters.point - epsilon)) /
          (2 * epsilon)
      );
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=\\sqrt{${parameters.cubicCoefficient}x^3${signedTerm(parameters.constant)}}\\)일 때 \\(f'(${parameters.point})\\)의 값을 구하여라.`,
        solution: `연쇄법칙으로 미분하고 주어진 점에서 근호의 값을 계산하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeOddPolynomialDerivative(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "대칭차분 극한으로 구하는 미분계수"),
    build(random) {
      return {
        parameters: {
          fifth: randomInteger(random, 1, 5),
          cubic: randomInteger(random, 1, 10),
          linear: randomInteger(random, 1, 20),
          point: randomInteger(random, 1, 2),
        },
      };
    },
    solve(parameters) {
      return (
        5 * parameters.fifth * parameters.point ** 4 +
        3 * parameters.cubic * parameters.point ** 2 +
        parameters.linear
      );
    },
    crossCheck(parameters) {
      const f = (x) =>
        parameters.fifth * x ** 5 +
        parameters.cubic * x ** 3 +
        parameters.linear * x;
      const epsilon = 1e-5;
      return Math.round(
        (f(parameters.point + epsilon) - f(parameters.point - epsilon)) /
          (2 * epsilon)
      );
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=${parameters.fifth}x^5+${parameters.cubic}x^3+${parameters.linear}x\\)일 때 \\(\\displaystyle\\lim_{h\\to0}\\frac{f(${parameters.point}+h)-f(${parameters.point}-h)}{2h}\\)의 값을 구하여라.`,
        solution: `대칭차분을 전개하면 짝수 차수의 \\(h\\)항이 소거되고 극한은 \\(f'(${parameters.point})=${answer}\\)이다.`,
      };
    },
  };
}

function makeExponentialDerivative(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "지수 합성함수의 도함숫값"),
    build(random) {
      return {
        parameters: {
          coefficient: randomInteger(random, 1, 50),
          rate: randomInteger(random, 1, 10),
          point: randomInteger(random, 0, 5),
        },
      };
    },
    solve(parameters) {
      return parameters.coefficient * parameters.rate;
    },
    crossCheck(parameters) {
      const f = (x) =>
        parameters.coefficient *
        Math.exp(parameters.rate * (x - parameters.point));
      const epsilon = 1e-6;
      return Math.round(
        (f(parameters.point + epsilon) - f(parameters.point - epsilon)) /
          (2 * epsilon)
      );
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=${parameters.coefficient}e^{${parameters.rate}(x-${parameters.point})}\\)일 때 \\(f'(${parameters.point})\\)의 값을 구하여라.`,
        solution: `지수함수와 지수의 일차식을 함께 미분하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeParametricLogDerivativeLimit(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "로그 매개곡선 미분계수의 무한대 극한"),
    build(random) {
      const xCoefficient = randomInteger(random, 1, 5);
      const quotient = randomInteger(random, 1, 30);
      return {
        parameters: {
          xCoefficient,
          yCoefficient: xCoefficient * quotient,
          power: randomInteger(random, 1, 5),
          constant: randomInteger(random, 1, 10),
        },
      };
    },
    solve(parameters) {
      return (
        (parameters.yCoefficient * parameters.power) /
        parameters.xCoefficient
      );
    },
    crossCheck(parameters) {
      const t = 1e6;
      const tPower = t ** parameters.power;
      const ratio =
        (parameters.yCoefficient * parameters.power * tPower) /
        ((tPower + parameters.constant) * parameters.xCoefficient);
      return Math.round(ratio);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(x=${parameters.xCoefficient}\\ln t\\), \\(y=${parameters.yCoefficient}\\ln(t^{${parameters.power}}+${parameters.constant})\\)일 때 \\(\\displaystyle\\lim_{t\\to\\infty}dy/dx\\)를 구하여라.`,
        solution: `각 좌표를 \\(t\\)로 미분해 비를 만든 뒤 최고차항의 비를 취하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeCubicPlusRootDerivative(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "다항함수와 제곱근함수 합의 도함숫값"),
    build(random) {
      const root = randomInteger(random, 1, 3);
      const rootDerivative = randomInteger(random, 1, 20);
      return {
        parameters: {
          cubicCoefficient: randomInteger(random, 1, 3),
          rootCoefficient: 2 * root * rootDerivative,
          point: root ** 2,
        },
      };
    },
    solve(parameters) {
      return (
        3 * parameters.cubicCoefficient * parameters.point ** 2 +
        parameters.rootCoefficient / (2 * Math.sqrt(parameters.point))
      );
    },
    crossCheck(parameters) {
      const f = (x) =>
        parameters.cubicCoefficient * x ** 3 +
        parameters.rootCoefficient * Math.sqrt(x);
      const epsilon = 1e-5;
      return Math.round(
        (f(parameters.point + epsilon) - f(parameters.point - epsilon)) /
          (2 * epsilon)
      );
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=${parameters.cubicCoefficient}x^3+${parameters.rootCoefficient}\\sqrt x\\)일 때 \\(f'(${parameters.point})\\)의 값을 구하여라.`,
        solution: `다항항과 제곱근항을 각각 미분하여 대입하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeProductLogDerivative(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "일차식의 로그를 곱한 함수의 도함숫값"),
    build(random) {
      const coefficient = randomInteger(random, 1, 10);
      const point = randomInteger(random, 1, 8);
      return {
        parameters: {
          coefficient,
          point,
          constant: 1 - coefficient * point,
        },
      };
    },
    solve(parameters) {
      return parameters.point * parameters.coefficient;
    },
    crossCheck(parameters) {
      const f = (x) =>
        x * Math.log(parameters.coefficient * x + parameters.constant);
      const epsilon = 1e-7;
      return Math.round(
        (f(parameters.point + epsilon) - f(parameters.point - epsilon)) /
          (2 * epsilon)
      );
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=x\\ln(${parameters.coefficient}x${signedTerm(parameters.constant)})\\)일 때 \\(f'(${parameters.point})\\)의 값을 구하여라.`,
        solution: `곱의 미분법을 적용하면 주어진 점에서 로그의 진수가 1이므로 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeQuadraticDerivativeParameter(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "이차함수의 도함숫값으로 구하는 계수"),
    build(random) {
      const selectedParameter = randomInteger(random, 1, 50);
      const quadratic = randomInteger(random, 1, 10);
      const point = randomInteger(random, 1, 5);
      return {
        parameters: {
          quadratic,
          point,
          derivativeValue: 2 * quadratic * point + selectedParameter,
        },
      };
    },
    solve(parameters) {
      return (
        parameters.derivativeValue -
        2 * parameters.quadratic * parameters.point
      );
    },
    crossCheck(parameters) {
      const selectedParameter =
        parameters.derivativeValue -
        2 * parameters.quadratic * parameters.point;
      const derivative =
        2 * parameters.quadratic * parameters.point + selectedParameter;
      if (derivative !== parameters.derivativeValue) {
        throw new Error("quadratic derivative condition mismatch");
      }
      return selectedParameter;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=${parameters.quadratic}x^2+ax\\)이고 \\(f'(${parameters.point})=${parameters.derivativeValue}\\)일 때 \\(a\\)의 값을 구하여라.`,
        solution: `\\(f'(x)=${2 * parameters.quadratic}x+a\\)에 조건을 대입하면 \\(a=${answer}\\)이다.`,
      };
    },
  };
}

function makeDerivativeAndInitialValue(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "도함수와 초깃값으로 구하는 함수값"),
    build(random) {
      return {
        parameters: {
          cubicPrimitive: randomInteger(random, 1, 5),
          constantDerivative: randomInteger(random, 1, 20),
          initialValue: randomInteger(random, 1, 30),
          point: randomInteger(random, 1, 4),
        },
      };
    },
    solve(parameters) {
      return (
        parameters.initialValue +
        parameters.cubicPrimitive * parameters.point ** 3 +
        parameters.constantDerivative * parameters.point
      );
    },
    crossCheck(parameters) {
      const derivativeQuadratic = 3 * parameters.cubicPrimitive;
      const integral =
        (derivativeQuadratic * parameters.point ** 3) / 3 +
        parameters.constantDerivative * parameters.point;
      return parameters.initialValue + integral;
    },
    render(parameters, answer) {
      return {
        prompt: `다항함수 \\(f\\)가 \\(f'(x)=${3 * parameters.cubicPrimitive}x^2+${parameters.constantDerivative}\\), \\(f(0)=${parameters.initialValue}\\)를 만족한다. \\(f(${parameters.point})\\)의 값을 구하여라.`,
        solution: `도함수를 0부터 ${parameters.point}까지 적분한 값을 \\(f(0)\\)에 더하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeCompositionTangentLimit(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "합성함수 접선 조건으로 구하는 극한계수의 제곱"),
    build(random) {
      const multiplier = randomInteger(random, 1, 100);
      return { parameters: { multiplier, scale: 3 * multiplier } };
    },
    solve({ multiplier }) {
      return multiplier;
    },
    crossCheck(parameters) {
      const functionValue = Math.sin(Math.PI / 6);
      const tangentSlope = functionValue;
      const k = tangentSlope / Math.cos(Math.PI / 6);
      return Math.round(parameters.scale * k ** 2);
    },
    render(parameters, answer) {
      return {
        prompt: `미분가능한 함수 \\(f\\)와 \\(h(x)=\\sin(f(x))\\)에 대하여 \\(\\displaystyle\\lim_{x\\to1}\\frac{f(x)-\\pi/6}{x-1}=k\\)이다. 곡선 \\(y=h(x)\\) 위의 점 \\((1,h(1))\\)에서의 접선이 원점을 지날 때 \\(${parameters.scale}k^2\\)을 구하여라.`,
        solution: `\\(f(1)=\\pi/6\\)이고 접선의 기울기는 \\(h(1)=1/2\\)이다. 연쇄법칙으로 \\(k=1/\\sqrt3\\)이므로 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeAffineInverseValue(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "일차함수의 역함숫값"),
    build(random) {
      const slope = randomInteger(random, 1, 10);
      const intercept = randomInteger(random, -20, 20);
      const targetX = randomInteger(random, 1, 50);
      return {
        parameters: {
          slope,
          intercept,
          inputValue: slope * targetX + intercept,
        },
      };
    },
    solve(parameters) {
      return (parameters.inputValue - parameters.intercept) / parameters.slope;
    },
    crossCheck(parameters) {
      const inverseValue =
        (parameters.inputValue - parameters.intercept) / parameters.slope;
      if (
        parameters.slope * inverseValue + parameters.intercept !==
        parameters.inputValue
      ) {
        throw new Error("inverse substitution mismatch");
      }
      return inverseValue;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=${parameters.slope}x${signedTerm(parameters.intercept)}\\)일 때 \\(f^{-1}(${parameters.inputValue})\\)의 값을 구하여라.`,
        solution: `\\(f(x)=${parameters.inputValue}\\)을 만족하는 \\(x\\)를 구하면 \\(f^{-1}(${parameters.inputValue})=${answer}\\)이다.`,
      };
    },
  };
}

const wave2Batch4Definitions = [
  makeBasicTrigLimit("2016-06-KICE-GA-Q22"),
  makeTangentSubtraction("2018-07-EDUCATION_OFFICE-GA-Q25"),
  makeReciprocalCosineIdentity("2019-06-KICE-GA-Q23"),
  makeScaledSineCosineSum("2021-04-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q17"),
  makeCubicDerivative("2016-06-KICE-NA-Q23"),
  makeNegativeReciprocalPowerDerivative("2017-04-EDUCATION_OFFICE-GA-Q23"),
  makeParametricDerivative("2017-04-EDUCATION_OFFICE-GA-Q24"),
  makeSquareRootCubicDerivative("2017-06-KICE-GA-Q23"),
  makeOddPolynomialDerivative("2017-06-KICE-NA-Q23"),
  makeExponentialDerivative("2018-10-EDUCATION_OFFICE-GA-Q23"),
  makeParametricLogDerivativeLimit("2018-10-EDUCATION_OFFICE-GA-Q25"),
  makeCubicPlusRootDerivative("2019-04-EDUCATION_OFFICE-GA-Q23"),
  makeProductLogDerivative("2020-09-KICE-GA-Q23"),
  makeQuadraticDerivativeParameter("2021-04-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q16"),
  makeDerivativeAndInitialValue("2026-06-KICE-PROBABILITY_STATISTICS-Q17"),
  makeCompositionTangentLimit("2018-09-KICE-GA-Q26"),
  makeAffineInverseValue("2016-09-KICE-NA-Q24"),
];

module.exports = { wave2Batch4Definitions };
