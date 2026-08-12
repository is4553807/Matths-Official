"use strict";

const {
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

function makeLogRatioProduct(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "서로 역수인 두 로그비로 구하는 두 양수의 곱"),
    build(random) {
      const product = randomInteger(random, 2, 80);
      const denominator = randomInteger(random, 1, 4);
      const numerator = randomInteger(random, 1, 5);
      const firstScale = randomInteger(random, 1, 6);
      const secondScale = numerator ** 2 * firstScale * product;
      return { parameters: { product, numerator, denominator, firstScale: denominator ** 2 * firstScale, secondScale } };
    },
    solve({ product }) {
      return product;
    },
    crossCheck(parameters) {
      const c = parameters.numerator / parameters.denominator;
      return Math.round(parameters.secondScale / (c * c * parameters.firstScale));
    },
    render(parameters, answer) {
      return {
        prompt: `\\(a,b>0\\), \\(a,b\\ne1\\)이고 \\(\\frac{\\log_ab}{${parameters.firstScale}a}=\\frac{${parameters.secondScale}\\log_ba}{b}=${parameters.numerator}/${parameters.denominator}\\)이다. \\(ab\\)를 구하여라.`,
        solution: `두 등식에서 얻은 로그들을 곱해 \\(\\log_ab\\log_ba=1\\)을 적용하면 \\(ab=${answer}\\)이다.`,
      };
    },
  };
}

function makeCombinedLogs(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "로그 곱셈법칙으로 합치는 두 로그"),
    build(random) {
      const base = randomInteger(random, 2, 9);
      const exponent = randomInteger(random, 2, 8);
      const divisor = randomInteger(random, 2, 12);
      return { parameters: { base, exponent, divisor, leftNumerator: base ** exponent, rightNumerator: divisor } };
    },
    solve({ exponent }) {
      return exponent;
    },
    crossCheck(parameters) {
      const left = Math.log(parameters.leftNumerator / parameters.divisor) / Math.log(parameters.base);
      const right = Math.log(parameters.rightNumerator) / Math.log(parameters.base);
      return Math.round(left + right);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(\\log_{${parameters.base}}\\frac{${parameters.base}^{${parameters.exponent}}}{${parameters.divisor}}+\\log_{${parameters.base}}${parameters.divisor}\\)의 값을 구하여라.`,
        solution: `진수의 곱이 \\(${parameters.base}^{${parameters.exponent}}\\)이므로 값은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeFtcDerivativeLimit(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "적분으로 정의한 함수의 미분계수 극한"),
    build(random) {
      return { parameters: { quadratic: randomInteger(random, 1, 9), constant: randomInteger(random, 1, 20), point: randomInteger(random, 1, 8) } };
    },
    solve(parameters) {
      return parameters.quadratic * parameters.point ** 2 + parameters.constant;
    },
    crossCheck(parameters) {
      const primitive = (x) => parameters.quadratic * x ** 3 / 3 + parameters.constant * x;
      const epsilon = 1e-6;
      return Math.round((primitive(parameters.point + epsilon) - primitive(parameters.point)) / epsilon);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=\\int_0^x(${parameters.quadratic}t^2+${parameters.constant})dt\\)일 때 \\(\\lim_{x\\to${parameters.point}}\\frac{f(x)-f(${parameters.point})}{x-${parameters.point}}\\)를 구하여라.`,
        solution: `미분계수의 정의와 미적분학의 기본정리를 적용하면 값은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeGeometricLogParameters(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "등비중항 관계와 로그방정식의 두 매개변수 합"),
    build(random) {
      const root = randomInteger(random, 2, 5);
      const exponent = randomInteger(random, 1, 5);
      const first = root ** 2;
      const b = first ** exponent;
      const a = root ** (exponent + 1);
      return { parameters: { root, exponent, first, logTotal: exponent + 2, selectedA: a, selectedB: b } };
    },
    solve({ selectedA, selectedB }) {
      return selectedA + selectedB;
    },
    crossCheck(parameters) {
      const b = parameters.first ** (parameters.logTotal - 2);
      const a = Math.sqrt(parameters.first * b);
      if (!Number.isInteger(a)) throw new Error("geometric logarithm middle term is not integral");
      return a + b;
    },
    render(parameters, answer) {
      return {
        prompt: `${parameters.first},a,b가 이 순서로 등비수열이고 \\(\\log_a(${parameters.first}b)+\\log_${parameters.first}b=${parameters.logTotal}\\)이다. \\(a+b\\)를 구하여라.`,
        solution: `\\(a^2=${parameters.first}b\\)에서 첫 로그가 2이므로 나머지 로그를 풀면 합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeCosineRuleSquared(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "코사인법칙으로 구하는 맞은편 변의 제곱"),
    build(random) {
      return { parameters: { side1: randomInteger(random, 3, 15), side2: randomInteger(random, 3, 15), cosineNumerator: -randomInteger(random, 1, 3), cosineDenominator: 4 } };
    },
    solve(parameters) {
      return parameters.side1 ** 2 + parameters.side2 ** 2 - 2 * parameters.side1 * parameters.side2 * parameters.cosineNumerator / parameters.cosineDenominator;
    },
    crossCheck(parameters) {
      const cosine = parameters.cosineNumerator / parameters.cosineDenominator;
      return Math.round(parameters.side1 ** 2 + parameters.side2 ** 2 - 2 * parameters.side1 * parameters.side2 * cosine);
    },
    render(parameters, answer) {
      return {
        prompt: `삼각형 \\(ABC\\)에서 \\(AB=${parameters.side1}\\), \\(AC=${parameters.side2}\\), \\(\\cos A=${parameters.cosineNumerator}/${parameters.cosineDenominator}\\)이다. \\(BC^2\\)을 구하여라.`,
        solution: `각 A에 코사인법칙을 적용하면 \\(BC^2=${answer}\\)이다.`,
      };
    },
  };
}

function makeSineLimit(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "사인 표준극한으로 계산하는 유리식 극한"),
    build(random) {
      const coefficient = randomInteger(random, 1, 10);
      const scale = randomInteger(random, 2, 20);
      return { parameters: { coefficient, scale } };
    },
    solve({ coefficient, scale }) {
      return coefficient * scale;
    },
    crossCheck(parameters) {
      const theta = 1e-8;
      const f = 1 - 1 / (1 + parameters.coefficient * Math.sin(theta));
      return Math.round(parameters.scale * f / theta);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(\\theta)=1-\\frac1{1+${parameters.coefficient}\\sin\\theta}\\)일 때 \\(\\lim_{\\theta\\to0}\\frac{${parameters.scale}f(\\theta)}\\theta\\)를 구하여라.`,
        solution: `사인 인수를 분리하고 \\(\\sin\\theta/\\theta\\to1\\)을 적용하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeParametricSpeed(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "매개곡선의 한 시각에서 속력"),
    build(random) {
      const multiplier = randomInteger(random, 1, 20);
      const baseX = randomInteger(random, 1, 3);
      const sineAmplitude = 3 * multiplier - baseX;
      return { parameters: { multiplier, baseX, sineAmplitude, logCoefficient: 2 * multiplier, cosineAmplitude: randomInteger(random, 1, 8) } };
    },
    solve({ multiplier }) {
      return 5 * multiplier;
    },
    crossCheck(parameters) {
      const t = 0.5;
      const vx = parameters.baseX + parameters.sineAmplitude * Math.sin(Math.PI * t);
      const vy = parameters.logCoefficient / t - parameters.cosineAmplitude * Math.cos(Math.PI * t);
      return Math.round(Math.hypot(vx, vy));
    },
    render(parameters, answer) {
      return {
        prompt: `\\(x(t)=${parameters.baseX}t-\\frac{${parameters.sineAmplitude}}\\pi\\cos\\pi t\\), \\(y(t)=${parameters.logCoefficient}\\ln t-\\frac{${parameters.cosineAmplitude}}\\pi\\sin\\pi t\\)이다. \\(t=1/2\\)에서 속력을 구하여라.`,
        solution: `두 좌표를 미분해 \\(t=1/2\\)를 대입하고 벡터의 크기를 구하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeSupplementaryTrigIdentity(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "보각·여각 공식으로 단순화하는 삼각식"),
    build(random) {
      const denominator = randomInteger(random, 2, 10);
      const numerator = randomInteger(random, 1, denominator - 1);
      const scaleMultiplier = randomInteger(random, 1, 20);
      return { parameters: { numerator, denominator, scale: denominator * scaleMultiplier } };
    },
    solve(parameters) {
      return parameters.scale * (parameters.denominator + parameters.numerator) / parameters.denominator;
    },
    crossCheck(parameters) {
      const sine = -parameters.numerator / parameters.denominator;
      return Math.round(parameters.scale * (1 - sine));
    },
    render(parameters, answer) {
      return {
        prompt: `\\(\\sin(\\pi/2+\\theta)\\tan(\\pi-\\theta)=${parameters.numerator}/${parameters.denominator}\\)일 때 \\(${parameters.scale}(1-\\sin\\theta)\\)를 구하여라.`,
        solution: `여각·보각 공식을 적용하면 왼쪽은 \\(-\\sin\\theta\\)이므로 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeTangentDerivative(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "탄젠트 합성함수의 도함숫값"),
    build(random) {
      return { parameters: { amplitude: randomInteger(random, 1, 20), innerScale: randomInteger(random, 1, 8) } };
    },
    solve({ amplitude, innerScale }) {
      return 4 * amplitude * innerScale;
    },
    crossCheck(parameters) {
      const point = Math.PI / (3 * parameters.innerScale);
      const value = parameters.amplitude * parameters.innerScale / Math.cos(parameters.innerScale * point) ** 2;
      return Math.round(value);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=${parameters.amplitude}\\tan(${parameters.innerScale}x)\\)일 때 \\(f'(\\pi/${3 * parameters.innerScale})\\)을 구하여라.`,
        solution: `연쇄법칙과 \\(\\sec^2(\\pi/3)=4\\)를 적용하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeRationalDerivativeInterval(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "유리함수 도함수 부호구간의 두 경계 제곱합"),
    build(random) {
      const root = randomInteger(random, 2, 15);
      const linear = randomInteger(random, -root + 1, root - 1);
      return { parameters: { root, linear, constant: root ** 2 } };
    },
    solve({ root }) {
      return 2 * root ** 2;
    },
    crossCheck(parameters) {
      const alpha = -parameters.root;
      const beta = parameters.root;
      if (parameters.constant - parameters.linear ** 2 / 4 <= 0) throw new Error("rational denominator is not positive");
      return alpha ** 2 + beta ** 2;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=\\frac{x}{x^2${parameters.linear >= 0 ? "+" : ""}${parameters.linear}x+${parameters.constant}}\\)이고 \\(f'(x)>0\\iff\\alpha<x<\\beta\\)이다. \\(\\alpha^2+\\beta^2\\)을 구하여라.`,
        solution: `도함수의 분자는 \\(${parameters.constant}-x^2\\)이므로 두 경계를 구하면 합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeLogIntegralParameter(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "두 로그미분 적분을 하나의 로그로 합치기"),
    build(random) {
      return { parameters: { upper: randomInteger(random, 2, 30) } };
    },
    solve({ upper }) {
      return upper * (upper + 1) / 2;
    },
    crossCheck({ upper }) {
      const logarithm = Math.log(upper + 1) - Math.log(2) + Math.log(upper);
      return Math.round(Math.exp(logarithm));
    },
    render(parameters, answer) {
      return {
        prompt: `\\(\\int_1^{${parameters.upper}}\\left(\\frac1{x+1}+\\frac1x\\right)dx=\\ln\\alpha\\)일 때 \\(\\alpha\\)를 구하여라.`,
        solution: `두 로그의 끝점 값을 합쳐 지수화하면 \\(\\alpha=${answer}\\)이다.`,
      };
    },
  };
}

function makePolynomialDefiniteIntegral(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "이차다항식의 정적분"),
    build(random) {
      const upper = 3 * randomInteger(random, 1, 4);
      return { parameters: { quadratic: randomInteger(random, 1, 5), linear: randomInteger(random, -8, 8), constant: randomInteger(random, 1, 20), upper } };
    },
    solve(parameters) {
      return parameters.quadratic * parameters.upper ** 3 / 3 + parameters.linear * parameters.upper ** 2 / 2 + parameters.constant * parameters.upper;
    },
    crossCheck(parameters) {
      let sum = 0;
      const steps = 30000;
      const dx = parameters.upper / steps;
      for (let index = 0; index < steps; index += 1) {
        const x = (index + 0.5) * dx;
        sum += (parameters.quadratic * x * x + parameters.linear * x + parameters.constant) * dx;
      }
      return Math.round(sum);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(\\int_0^{${parameters.upper}}(${parameters.quadratic}x^2${parameters.linear >= 0 ? "+" : ""}${parameters.linear}x+${parameters.constant})dx\\)를 구하여라.`,
        solution: `다항식의 원시함수를 양 끝점에 대입하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeCosineCubicIntegral(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "코사인 일차항과 삼차항의 정적분"),
    build(random) {
      return { parameters: { cubicCoefficient: 3 * randomInteger(random, 1, 20) } };
    },
    solve({ cubicCoefficient }) {
      return 1 + 2 * cubicCoefficient / 3;
    },
    crossCheck(parameters) {
      const steps = 20000;
      const dx = Math.PI / 2 / steps;
      let total = 0;
      for (let index = 0; index < steps; index += 1) {
        const x = (index + 0.5) * dx;
        total += (Math.cos(x) + parameters.cubicCoefficient * Math.cos(x) ** 3) * dx;
      }
      return Math.round(total);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(\\int_0^{\\pi/2}(\\cos x+${parameters.cubicCoefficient}\\cos^3x)dx\\)를 구하여라.`,
        solution: `\\(\\cos^3x=\\cos x(1-\\sin^2x)\\)로 바꾸어 적분하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeIntegralIdentityLowerLimit(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "적분 하한 대입으로 정하는 다항함수값"),
    build(random) {
      const lower = randomInteger(random, 1, 9);
      const cubicScale = randomInteger(random, 1, 5);
      return { parameters: { lower, cubicScale, constant: cubicScale * lower ** 3 } };
    },
    solve({ lower, cubicScale }) {
      return 3 * cubicScale * lower ** 2;
    },
    crossCheck(parameters) {
      const f = (x) => 3 * parameters.cubicScale * x * x;
      const integralAtLower = parameters.cubicScale * parameters.lower ** 3 - parameters.constant;
      if (integralAtLower !== 0) throw new Error("integral lower limit mismatch");
      return f(parameters.lower);
    },
    render(parameters, answer) {
      return {
        prompt: `다항함수 \\(f\\)와 실수 \\(a\\)가 \\(\\int_a^xf(t)dt=${parameters.cubicScale}x^3-${parameters.constant}\\)를 만족하고 \\(a>0\\)이다. \\(f(a)\\)를 구하여라.`,
        solution: `미분해 \\(f\\)를 얻고 \\(x=a\\)를 대입해 하한을 구하면 값은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeIntegralConstantFunction(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "함수식 안의 정적분 상수를 되먹임해 결정"),
    build(random) {
      return { parameters: { targetInteger: randomInteger(random, 2, 80) } };
    },
    solve({ targetInteger }) {
      return targetInteger + 2;
    },
    crossCheck(parameters) {
      const integralTExp = 1;
      const integralT = 0.5;
      const constant = integralTExp / (1 - integralT);
      return parameters.targetInteger + constant;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=e^x+\\int_0^1tf(t)dt\\)일 때 \\(f(\\ln${parameters.targetInteger})\\)를 구하여라.`,
        solution: `정적분을 상수로 두고 식에 다시 대입하면 그 값이 2이므로 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeIntegralDifferentialIdentity(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "적분항등식 미분으로 구하는 도함수 정적분"),
    build(random) {
      return { parameters: { target: randomInteger(random, 1, 20) } };
    },
    solve({ target }) {
      return 2 * target ** 2;
    },
    crossCheck({ target }) {
      let total = 0;
      const steps = 10000;
      const dx = target / steps;
      for (let index = 0; index < steps; index += 1) total += 4 * (index + 0.5) * dx * dx;
      return Math.round(total);
    },
    render(parameters, answer) {
      return {
        prompt: `다항함수 \\(f\\)가 \\(\\int_0^x\\{f(t)+t^2\\}dt=xf(x)-x^3\\)을 만족한다. \\(\\int_0^{${parameters.target}}f'(x)dx\\)를 구하여라.`,
        solution: `양변을 미분하면 \\(f'(x)=4x\\)이므로 적분값은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makePiecewiseDifferentiability(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "조각다항함수 접합점의 미분가능성"),
    build(random) {
      const quarticScale = randomInteger(random, 1, 20);
      return { parameters: { quarticScale, constant: quarticScale } };
    },
    solve({ quarticScale }) {
      return 2 * quarticScale;
    },
    crossCheck(parameters) {
      const a = 2 * parameters.quarticScale;
      const leftValue = a + parameters.constant;
      const rightValue = parameters.quarticScale + a;
      const leftDerivative = 2 * a;
      const rightDerivative = 4 * parameters.quarticScale;
      if (leftValue !== rightValue || leftDerivative !== rightDerivative) throw new Error("piecewise differentiability mismatch");
      return a;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=ax^2+${parameters.constant}\\;(x<1)\\), \\(f(x)=${parameters.quarticScale}x^4+a\\;(x\\ge1)\\)가 \\(x=1\\)에서 미분가능하다. \\(a\\)를 구하여라.`,
        solution: `좌우 함숫값과 도함숫값을 맞추면 \\(a=${answer}\\)이다.`,
      };
    },
  };
}

function makeTwoLimitsParameters(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "무한대 최고차항비와 약분극한의 매개변수 합"),
    build(random) {
      const point = randomInteger(random, 1, 8);
      const firstLimit = 2 * point * randomInteger(random, 1, 20);
      return { parameters: { point, firstLimit } };
    },
    solve({ point, firstLimit }) {
      return firstLimit + firstLimit / (2 * point);
    },
    crossCheck(parameters) {
      const a = parameters.firstLimit;
      const b = a / (2 * parameters.point);
      return a + b;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(\\lim_{x\\to\\infty}\\frac{ax^2}{x^2-${parameters.point ** 2}}=${parameters.firstLimit}\\), \\(\\lim_{x\\to${parameters.point}}\\frac{a(x-${parameters.point})}{x^2-${parameters.point ** 2}}=b\\)일 때 \\(a+b\\)를 구하여라.`,
        solution: `첫 극한에서 \\(a\\), 둘째 극한에서 약분한 값을 구하면 합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeQuarticTangencyParameter(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "사차곡선과 직선의 접점에서 구하는 수직매개변수"),
    build(random) {
      const quarticScale = randomInteger(random, 1, 5);
      const tangentPoint = randomInteger(random, 1, 5);
      const linearCurve = randomInteger(random, -8, 8);
      const lineSlope = 4 * quarticScale * tangentPoint ** 3 + linearCurve;
      const lineIntercept = randomInteger(random, 1, 20);
      return { parameters: { quarticScale, tangentPoint, linearCurve, lineSlope, lineIntercept } };
    },
    solve(parameters) {
      return parameters.lineSlope * parameters.tangentPoint + parameters.lineIntercept - parameters.quarticScale * parameters.tangentPoint ** 4 - parameters.linearCurve * parameters.tangentPoint;
    },
    crossCheck(parameters) {
      const k = parameters.lineIntercept + (parameters.lineSlope - parameters.linearCurve) * parameters.tangentPoint - parameters.quarticScale * parameters.tangentPoint ** 4;
      const derivative = 4 * parameters.quarticScale * parameters.tangentPoint ** 3 + parameters.linearCurve;
      if (derivative !== parameters.lineSlope) throw new Error("quartic tangent slope mismatch");
      return k;
    },
    render(parameters, answer) {
      return {
        prompt: `직선 \\(y=${parameters.lineSlope}x+${parameters.lineIntercept}\\)가 곡선 \\(y=${parameters.quarticScale}x^4${parameters.linearCurve >= 0 ? "+" : ""}${parameters.linearCurve}x+k\\)에 접한다. \\(k\\)를 구하여라.`,
        solution: `접점에서 함숫값과 기울기가 모두 같다는 조건을 적용하면 \\(k=${answer}\\)이다.`,
      };
    },
  };
}

function makePiecewiseCompositionParameter(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "합성함수 방정식의 조각조건 검증"),
    build(random) {
      const join = randomInteger(random, 1, 8);
      const selectedA = join + randomInteger(random, 1, 12);
      return { parameters: { join, selectedA, target: selectedA ** 2 + selectedA - join } };
    },
    solve(parameters) {
      const discriminant = 1 + 4 * (parameters.target + parameters.join);
      const answer = (-1 + Math.sqrt(discriminant)) / 2;
      if (!Number.isInteger(answer) || answer < parameters.join) throw new Error("composition branch is inconsistent");
      return answer;
    },
    crossCheck(parameters) {
      const g = (x) => x < parameters.join ? x - parameters.join : x ** 2;
      const f = (x) => x + parameters.selectedA;
      const value = f(g(0)) + g(f(0));
      if (value !== parameters.target) throw new Error("composition equation mismatch");
      return parameters.selectedA;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=x+a\\), \\(g(x)=x-${parameters.join}\\;(x<${parameters.join})\\), \\(g(x)=x^2\\;(x\\ge${parameters.join})\\)이고 \\((f\\circ g)(0)+(g\\circ f)(0)=${parameters.target}\\)이다. 양수 \\(a\\)를 구하여라.`,
        solution: `\\(a\\ge${parameters.join}\\)인 가지에서 합성값을 계산하고 해가 가지조건을 만족하는지 확인하면 \\(a=${answer}\\)이다.`,
      };
    },
  };
}

function makeEvenQuarticMinimum(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "짝사차함수의 극소점과 최솟값으로 구하는 계수합"),
    build(random) {
      const point = randomInteger(random, 1, 8);
      const minimum = randomInteger(random, 1, 30);
      return { parameters: { point, minimum } };
    },
    solve({ point, minimum }) {
      const a = -2 * point ** 2;
      const b = minimum + point ** 4;
      return a + b;
    },
    crossCheck(parameters) {
      const a = -2 * parameters.point ** 2;
      const b = parameters.minimum + parameters.point ** 4;
      const derivative = 4 * parameters.point ** 3 + 2 * a * parameters.point;
      const value = parameters.point ** 4 + a * parameters.point ** 2 + b;
      if (derivative !== 0 || value !== parameters.minimum) throw new Error("quartic minimum mismatch");
      return a + b;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=x^4+ax^2+b\\)가 \\(x=${parameters.point}\\)에서 극소이고 전구간 최솟값이 ${parameters.minimum}이다. \\(a+b\\)를 구하여라.`,
        solution: `도함수 조건으로 \\(a\\), 최솟값 조건으로 \\(b\\)를 정하면 합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeCompositionDerivativeParameter(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "지수함수와 이차함수 합성의 연쇄법칙"),
    build(random) {
      const exponentRate = randomInteger(random, 1, 6);
      const shift = randomInteger(random, 1, 5);
      const linear = randomInteger(random, 1, 8);
      const selectedK = randomInteger(random, 1, 20);
      const anchor = (2 * selectedK * (1 + shift) - linear) * exponentRate;
      return { parameters: { exponentRate, shift, linear, selectedK, anchor } };
    },
    solve(parameters) {
      return (parameters.anchor / parameters.exponentRate + parameters.linear) / (2 * (1 + parameters.shift));
    },
    crossCheck(parameters) {
      const g0 = 1 + parameters.shift;
      const gPrime0 = parameters.exponentRate;
      const hPrime = (2 * parameters.selectedK * g0 - parameters.linear) * gPrime0;
      if (hPrime !== parameters.anchor) throw new Error("composition derivative anchor mismatch");
      return parameters.selectedK;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=kx^2-${parameters.linear}x\\), \\(g(x)=e^{${parameters.exponentRate}x}+${parameters.shift}\\), \\(h=f\\circ g\\)이고 \\(h'(0)=${parameters.anchor}\\)이다. \\(k\\)를 구하여라.`,
        solution: `연쇄법칙으로 \\(f'(g(0))g'(0)\\)을 계산하면 \\(k=${answer}\\)이다.`,
      };
    },
  };
}

function makeLogAsymptoteSquare(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "로그함수 수평이동과 수직점근선 좌표의 제곱"),
    build(random) {
      return { parameters: { base: randomInteger(random, 2, 10), shift: randomInteger(random, 1, 25) } };
    },
    solve({ shift }) {
      return shift ** 2;
    },
    crossCheck({ shift }) {
      const asymptote = -shift;
      return asymptote ** 2;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(y=\\log_${parameters.base}(x+${parameters.shift})\\)의 수직점근선이 \\(x=k\\)일 때 \\(k^2\\)을 구하여라.`,
        solution: `진수가 0이 되는 경계가 \\(x=-${parameters.shift}\\)이므로 \\(k^2=${answer}\\)이다.`,
      };
    },
  };
}

function makeExponentialIntegralLog(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "지수함수 정적분 뒤 자연로그 계산"),
    build(random) {
      const rate = randomInteger(random, 1, 8);
      const lower = randomInteger(random, 0, 5);
      const width = randomInteger(random, 1, 8);
      return { parameters: { rate, lower, upper: lower + width, shift: rate * lower } };
    },
    solve(parameters) {
      return parameters.rate * (parameters.upper - parameters.lower);
    },
    crossCheck(parameters) {
      const k = Math.exp(parameters.rate * parameters.upper - parameters.shift) - Math.exp(parameters.rate * parameters.lower - parameters.shift);
      return Math.round(Math.log(k + 1));
    },
    render(parameters, answer) {
      return {
        prompt: `\\(k=\\int_${parameters.lower}^{${parameters.upper}}${parameters.rate}e^{${parameters.rate}x-${parameters.shift}}dx\\)일 때 \\(\\ln(k+1)\\)을 구하여라.`,
        solution: `지수함수를 적분하면 아래끝 값이 1이어서 \\(k+1\\)이 하나의 지수값이 되므로 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeShiftedLogParameters(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "로그함수 점근선과 한 점으로 구하는 이동매개변수 합"),
    build(random) {
      const base = randomInteger(random, 2, 9);
      const a = randomInteger(random, 1, 20);
      const exponent = randomInteger(random, 1, 5);
      const targetY = randomInteger(random, exponent + 1, exponent + 15);
      return { parameters: { base, a, exponent, targetX: a + base ** exponent, targetY } };
    },
    solve(parameters) {
      return parameters.a + parameters.targetY - parameters.exponent;
    },
    crossCheck(parameters) {
      const b = parameters.targetY - Math.log(parameters.targetX - parameters.a) / Math.log(parameters.base);
      return Math.round(parameters.a + b);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=\\log_${parameters.base}(x-a)+b\\)의 수직점근선이 \\(x=${parameters.a}\\)이고 \\(f(${parameters.targetX})=${parameters.targetY}\\)이다. \\(a+b\\)를 구하여라.`,
        solution: `점근선에서 \\(a\\)를 읽고 주어진 점을 대입해 \\(b\\)를 구하면 합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

const wave2Batch3Definitions = [
  makeLogRatioProduct("2016-10-EDUCATION_OFFICE-NA-Q25"),
  makeCombinedLogs("2017-06-KICE-NA-Q25"),
  makeFtcDerivativeLimit("2017-07-EDUCATION_OFFICE-NA-Q25"),
  makeGeometricLogParameters("2019-04-EDUCATION_OFFICE-NA-Q27"),
  makeCosineRuleSquared("2026-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18"),
  makeSineLimit("2017-03-EDUCATION_OFFICE-GA-Q23"),
  makeParametricSpeed("2020-07-EDUCATION_OFFICE-GA-Q25"),
  makeSupplementaryTrigIdentity("2020-10-EDUCATION_OFFICE-GA-Q24"),
  makeTangentDerivative("2016-07-EDUCATION_OFFICE-GA-Q23"),
  makeRationalDerivativeInterval("2018-04-EDUCATION_OFFICE-GA-Q25"),
  makeLogIntegralParameter("2016-04-EDUCATION_OFFICE-GA-Q25"),
  makePolynomialDefiniteIntegral("2016-09-KICE-NA-Q23"),
  makeCosineCubicIntegral("2018-09-KICE-GA-Q25"),
  makeIntegralIdentityLowerLimit("2018-10-EDUCATION_OFFICE-NA-Q25"),
  makeIntegralConstantFunction("2017-07-EDUCATION_OFFICE-GA-Q27"),
  makeIntegralDifferentialIdentity("2025-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q19"),
  makePiecewiseDifferentiability("2016-09-KICE-NA-Q25"),
  makeTwoLimitsParameters("2019-04-EDUCATION_OFFICE-NA-Q26"),
  makeQuarticTangencyParameter("2023-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q17"),
  makePiecewiseCompositionParameter("2018-04-EDUCATION_OFFICE-NA-Q26"),
  makeEvenQuarticMinimum("2022-06-KICE-PROBABILITY_STATISTICS-Q19"),
  makeCompositionDerivativeParameter("2017-07-EDUCATION_OFFICE-GA-Q25"),
  makeLogAsymptoteSquare("2016-09-KICE-GA-Q23"),
  makeExponentialIntegralLog("2017-06-KICE-GA-Q24"),
  makeShiftedLogParameters("2017-07-EDUCATION_OFFICE-GA-Q24"),
];

module.exports = { wave2Batch3Definitions };
