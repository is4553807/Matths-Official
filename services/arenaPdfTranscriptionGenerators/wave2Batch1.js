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

function polynomialValue(coefficients, x) {
  return coefficients.reduce((value, coefficient) => value * x + coefficient, 0);
}

function polynomialDerivative(coefficients) {
  return coefficients.slice(0, -1).map((coefficient, index) => coefficient * (coefficients.length - index - 1));
}

function integratePolynomial(coefficients, left, right) {
  const degree = coefficients.length - 1;
  let total = 0;
  for (let index = 0; index < coefficients.length; index += 1) {
    const power = degree - index + 1;
    total += coefficients[index] * (right ** power - left ** power) / power;
  }
  return total;
}

function makeCosineLatticeCount(sourceReferenceId) {
  function exactCount(n) {
    const lower = Math.ceil(2 ** (n + 1) / 3);
    const upper = Math.floor(2 ** (n + 2) / 3);
    return upper - lower + 1;
  }
  return {
    ...meta(sourceReferenceId, "한 주기 코사인 부등식의 자연수 격자점 개수합"),
    build(random) {
      return { parameters: { horizon: randomInteger(random, 3, 9) } };
    },
    solve({ horizon }) {
      let sum = 0;
      for (let n = 1; n <= horizon; n += 1) sum += exactCount(n);
      return sum;
    },
    crossCheck({ horizon }) {
      let sum = 0;
      for (let n = 1; n <= horizon; n += 1) {
        for (let x = 0; x < 2 ** (n + 1); x += 1) {
          if (Math.cos(Math.PI * x / 2 ** n) <= -0.5 + 1e-12) sum += 1;
        }
      }
      return sum;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(a_n\\)을 \\(0\\le x<2^{n+1}\\), \\(\\cos(\\pi x/2^n)\\le-1/2\\)를 만족하는 정수 \\(x\\)의 개수라 하자. \\(\\sum_{n=1}^{${parameters.horizon}}a_n\\)을 구하여라.`,
        solution: `한 주기의 각도구간을 격자점 구간으로 바꾸고 끝점을 포함해 세면 합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeAbsoluteTangency(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "절댓값 차의 접점과 구간 최댓값으로 복원하는 이차함수"),
    build(random) {
      return { parameters: { k: randomInteger(random, 1, 8), quadratic: randomInteger(random, 2, 8), linear: randomInteger(random, 3, 16), constant: randomInteger(random, 1, 10) } };
    },
    solve({ quadratic, linear }) {
      return linear - quadratic;
    },
    crossCheck(parameters) {
      const f = (x) => (x - parameters.k) ** 4 + parameters.linear * (x - parameters.k) + parameters.constant;
      const g = (x) => parameters.quadratic * (x - parameters.k) ** 2 + parameters.linear * (x - parameters.k) + parameters.constant;
      const derivative = (x) => 2 * parameters.quadratic * (x - parameters.k) + parameters.linear;
      if (Math.abs(g(parameters.k) - f(parameters.k)) > 1e-9) throw new Error("tangency value mismatch");
      if (Math.abs(derivative(parameters.k) - parameters.linear) > 1e-9) throw new Error("tangency slope mismatch");
      return derivative(parameters.k - 0.5);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=(x-${parameters.k})^4+${parameters.linear}(x-${parameters.k})+${parameters.constant}\\)이고 \\(g\\)는 이차함수이다. \\(|g(x)-f(x)|\\)가 \\(x=${parameters.k}\\)에서 0의 최솟값을 가지며 \\([${parameters.k - 1},${parameters.k + 1}]\\)에서의 최댓값이 ${parameters.quadratic - 1}, \\(g(${parameters.k + 1})-g(${parameters.k})=${parameters.quadratic + parameters.linear}\\)이다. \\(g'(${parameters.k}-1/2)\\)을 구하여라.`,
        solution: `접점의 값과 기울기, 구간 끝점의 차로 이차항을 정하면 도함숫값은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeNearestPointInverse(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "최근접점 조건으로 정의된 함수의 역함수 미분"),
    build(random) {
      return { parameters: { slope: randomInteger(random, 1, 9), intercept: randomInteger(random, -4, 6), target: randomInteger(random, 1, 5) } };
    },
    solve({ slope }) {
      return slope * slope + 1;
    },
    crossCheck(parameters) {
      const sDerivative = 1 / (1 + parameters.slope ** 2);
      const gDerivative = parameters.slope * sDerivative;
      const inverseDerivative = 1 / gDerivative;
      return Math.round(parameters.slope * inverseDerivative);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=${parameters.slope}x${parameters.intercept >= 0 ? "+" : ""}${parameters.intercept}\\)이고 \\(s\\)는 \\((x-t)^2+f(x)^2\\)을 최소로 하는 \\(x\\)이다. \\(g(t)=f(s)\\), \\(h=g^{-1}\\)일 때 \\(${parameters.slope}h'(${parameters.target})\\)를 구하여라.`,
        solution: `최소점의 직교조건으로 \\(g'(t)\\)를 구하고 역함수 미분법을 적용하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function eligibleSecantIntervals(a, widthNumerator) {
  const extrema = [0, 4 * a / 3];
  const values = [];
  for (let k = -20; k <= 20; k += 1) {
    if (extrema.some((point) => k < point && point < k + widthNumerator / 2)) values.push(k);
  }
  return values;
}

function makeSecantExtremumIntervals(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "서로 반대 부호인 두 할선기울기를 만드는 정수구간"),
    build(random) {
      const a = randomInteger(random, -6, 6) || 1;
      const widthNumerator = randomInteger(random, 2, 5);
      const ks = eligibleSecantIntervals(a, widthNumerator);
      return { parameters: { selectedA: a, widthNumerator, product: ks.reduce((product, value) => product * value, 1), targetX: randomInteger(random, 6, 12) } };
    },
    solve(parameters) {
      const candidates = [];
      for (let a = -10; a <= 10; a += 1) {
        if (a === 0) continue;
        const ks = eligibleSecantIntervals(a, parameters.widthNumerator);
        if (ks.reduce((product, value) => product * value, 1) === parameters.product) candidates.push(a);
      }
      if (candidates.length !== 1) throw new Error("cubic coefficient is not unique");
      const a = candidates[0];
      return 3 * parameters.targetX ** 2 - 4 * a * parameters.targetX;
    },
    crossCheck(parameters) {
      const a = parameters.selectedA;
      if (eligibleSecantIntervals(a, parameters.widthNumerator).reduce((p, k) => p * k, 1) !== parameters.product) throw new Error("secant interval product mismatch");
      return polynomialValue([3, -4 * a, 0], parameters.targetX);
    },
    render(parameters, answer) {
      const width = parameters.widthNumerator % 2 === 0
        ? String(parameters.widthNumerator / 2)
        : `\\frac{${parameters.widthNumerator}}{2}`;
      return {
        prompt: `0이 아닌 정수 \\(a\\)에 대해 \\(f(x)=x^3-2ax^2\\)이다. 길이 \\(${width}\\)인 정수 시작 구간 \\((k,k+${width})\\) 안에서 연속한 두 할선기울기의 곱이 음수가 될 수 있는 모든 정수 \\(k\\)의 곱이 ${parameters.product}이다. \\(f'(${parameters.targetX})\\)를 구하여라.`,
        solution: `구간 안에 엄격한 극값이 들어가는지를 정수 \\(k\\)별로 분류해 \\(a\\)를 정하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeExponentialCompositeCritical(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "지수합성 함수의 두 종류 임계점"),
    build(random) {
      const a = randomInteger(random, -6, 1);
      const b = 2 * a - 3;
      return { parameters: { a, b, anchor: 1 + a + b } };
    },
    solve({ a }) {
      return (2 - a) ** 2;
    },
    crossCheck(parameters) {
      const f = (x) => x ** 3 + parameters.a * x ** 2 + parameters.b * x;
      const derivative = (x) => 3 * x ** 2 + 2 * parameters.a * x + parameters.b;
      if (derivative(-1) !== 0 || f(1) !== parameters.anchor) throw new Error("composite critical anchors failed");
      return f(-1) ** 2;
    },
    render(parameters, answer) {
      return {
        prompt: `정수 \\(a,b\\)에 대해 \\(f(x)=x^3+ax^2+bx\\), \\(g(x)=e^{f(x)}-f(x)\\)이다. \\(x=-1\\)이 \\(f'\\)의 근이고 \\(f(1)=${parameters.anchor}\\)일 때 \\(f(-1)^2\\)을 구하여라.`,
        solution: `\\(g'=f'(e^f-1)\\)의 임계점 구조와 두 대수 조건에서 계수를 정하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function symmetricFunctional(coefficients, length) {
  const f = (x) => polynomialValue(coefficients, x);
  return 2 * (f(length) + f(-length)) - integratePolynomial(coefficients, -length, length);
}

function makeTangentInterceptFunctional(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "접선 절편의 차분식과 대칭 적분함수"),
    build(random) {
      const quadratic = randomInteger(random, 1, 5);
      const linear = randomInteger(random, -5, 8);
      const constant = randomInteger(random, 1, 10);
      return { parameters: { quadratic, linear, constant, length: randomInteger(random, 2, 6), integral01: rational(2 * quadratic + 3 * linear + 6 * constant, 6), value1: quadratic + linear + constant } };
    },
    solve(parameters) {
      return symmetricFunctional([parameters.quadratic, parameters.linear, parameters.constant], parameters.length);
    },
    crossCheck(parameters) {
      const f = (x) => parameters.quadratic * x * x + parameters.linear * x + parameters.constant;
      const g = (t) => f(t) - t * (2 * parameters.quadratic * t + parameters.linear);
      for (let t = -3; t <= 3; t += 1) {
        if (g(t + 1) - g(t) !== -parameters.quadratic * (2 * t + 1)) throw new Error("tangent intercept difference mismatch");
      }
      return symmetricFunctional([parameters.quadratic, parameters.linear, parameters.constant], parameters.length);
    },
    render(parameters, answer) {
      return {
        prompt: `이차함수 \\(f\\)와 \\(g(t)=f(t)-tf'(t)\\)가 \\(g(t+1)-g(t)=-${parameters.quadratic}(2t+1)\\), \\(\\int_0^1f=${parameters.integral01.n}/${parameters.integral01.d}\\), \\(f(1)=${parameters.value1}\\)을 만족한다. \\(2\\{f(${parameters.length})+f(-${parameters.length})\\}-\\int_{-${parameters.length}}^{${parameters.length}}f(x)dx\\)를 구하여라.`,
        solution: `차분식에서 이차항을 정하고 두 기준값으로 나머지 계수를 구해 대칭식을 계산하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function quadraticPrimitive(scale, center, radius, x) {
  const u = x - center;
  return scale * (u ** 3 / 3 - radius ** 2 * u);
}

function makeSymmetricQuadraticArea(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "반사대칭 이차함수의 부호넓이와 절댓값넓이"),
    build(random) {
      return { parameters: { scale: 3 * randomInteger(random, 1, 3), center: randomInteger(random, -2, 3), radius: randomInteger(random, 1, 4), extension: randomInteger(random, 1, 4) } };
    },
    solve(parameters) {
      const leftRoot = parameters.center - parameters.radius;
      const upper = parameters.center + parameters.radius + parameters.extension;
      return positiveNumeratorDenominatorSum(rational(Math.round(3 * (quadraticPrimitive(parameters.scale, parameters.center, parameters.radius, upper) - quadraticPrimitive(parameters.scale, parameters.center, parameters.radius, leftRoot))), 3));
    },
    crossCheck(parameters) {
      const coefficients = [parameters.scale, -2 * parameters.scale * parameters.center, parameters.scale * (parameters.center ** 2 - parameters.radius ** 2)];
      const value = integratePolynomial(coefficients, parameters.center - parameters.radius, parameters.center + parameters.radius + parameters.extension);
      return positiveNumeratorDenominatorSum(rational(Math.round(3 * value), 3));
    },
    render(parameters, answer) {
      return {
        prompt: `최고차항 계수가 ${parameters.scale}이고 \\(x=${parameters.center}\\)에 대칭인 이차함수 \\(f\\)의 두 근 사이 거리가 ${2 * parameters.radius}이다. 작은 근을 \\(k\\)라 할 때 \\(\\int_k^{${parameters.center + parameters.radius + parameters.extension}}f(x)dx=q/p\\)이다. \\(p+q\\)를 구하여라.`,
        solution: `대칭인 두 근으로 \\(f\\)를 인수분해해 부호넓이를 적분하고 약분하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeLevelCountJump(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "적분함수의 임계높이에서 생기는 원상 개수 점프"),
    build(random) {
      return { parameters: { radius: randomInteger(random, 1, 4), offset: randomInteger(random, 1, 12), jump: pick(random, [2, 4]), scale: randomInteger(random, 2, 8) } };
    },
    solve(parameters) {
      const level = parameters.jump === 2 ? parameters.offset : parameters.offset - parameters.radius ** 4;
      return parameters.scale * Math.abs(level);
    },
    crossCheck(parameters) {
      const minimumLevel = parameters.offset - parameters.radius ** 4;
      const maximumLevel = parameters.offset;
      const jumps = new Map([[2, maximumLevel], [4, minimumLevel]]);
      return parameters.scale * Math.abs(jumps.get(parameters.jump));
    },
    render(parameters, answer) {
      return {
        prompt: `\\(g(x)=${parameters.offset}+\\int_0^x4t(t^2-${parameters.radius ** 2})dt\\), \\(h(y)=\\#\\{x:g(x)=y\\}\\)이다. 좌우극한에서 \\(h\\)의 값이 ${parameters.jump}만큼 변하는 모든 높이의 절댓값 합을 \\(S\\)라 할 때 \\(${parameters.scale}S\\)를 구하여라.`,
        solution: `두 극솟값과 가운데 극댓값의 높이에서 원상 개수 변화를 분류하면 값은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeComposedDerivativeIntegral(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "이차치환으로 주어진 도함수를 복원하는 정적분"),
    build(random) {
      return { parameters: { slope: randomInteger(random, 1, 8), intercept: randomInteger(random, 1, 10), f1: randomInteger(random, 1, 20), target: randomInteger(random, 3, 9) } };
    },
    solve(parameters) {
      const antiderivative = (x) => parameters.slope * (x - 1) ** 2 / 2 + parameters.intercept * (x - 1) + parameters.f1;
      return antiderivative(parameters.target);
    },
    crossCheck(parameters) {
      let value = parameters.f1;
      const steps = 10000;
      const h = (parameters.target - 1) / steps;
      for (let i = 0; i < steps; i += 1) {
        const x = 1 + (i + 0.5) * h;
        value += (parameters.slope * (x - 1) + parameters.intercept) * h;
      }
      return Math.round(value);
    },
    render(parameters, answer) {
      return {
        prompt: `미분가능한 \\(f\\)가 \\(f'(x^2+x+1)=${parameters.slope}(x^2+x)+${parameters.intercept}\\), \\(f(1)=${parameters.f1}\\)을 만족한다. \\(f(${parameters.target})\\)를 구하여라.`,
        solution: `\\(u=x^2+x+1\\)로 두어 \\(f'(u)=${parameters.slope}(u-1)+${parameters.intercept}\\)를 복원해 적분하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makePeriodicProjectionIntegral(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "비음수 주기함수의 제곱오차 점별 최소화"),
    build(random) {
      const radius = randomInteger(random, 1, 3);
      const amplitude = 3 * randomInteger(random, 1, 4);
      const periods = randomInteger(random, 2, 8);
      return { parameters: { radius, amplitude, period: 2 * radius, periods } };
    },
    solve(parameters) {
      return parameters.periods * 4 * parameters.amplitude * parameters.radius ** 3 / 3;
    },
    crossCheck(parameters) {
      const onePeriod = integratePolynomial([-parameters.amplitude, 0, parameters.amplitude * parameters.radius ** 2], -parameters.radius, parameters.radius);
      return Math.round(parameters.periods * onePeriod);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f\\ge0\\), \\(f(x+${parameters.period})=f(x)\\)이고 한 주기에서 \\(\\int_{-${parameters.radius}}^{${parameters.radius}}\\{f(x)+${parameters.amplitude}(x^2-${parameters.radius ** 2})\\}^2dx\\)가 최소이다. \\(${parameters.periods}\\)주기에 걸친 \\(\\int f\\)의 값을 구하여라.`,
        solution: `제곱오차를 점별로 최소화하면 \\(f=${parameters.amplitude}(${parameters.radius ** 2}-x^2)\\)이고 반복 적분값은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeAbsoluteCubicIntegral(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "절댓값 삼차식으로 정의한 적분항등식의 대칭 적분"),
    build(random) {
      return { parameters: { a: randomInteger(random, 1, 2), scale: randomInteger(random, 1, 3) } };
    },
    solve({ a, scale }) {
      return 24 * scale * a ** 4;
    },
    crossCheck(parameters) {
      const g = (x) => parameters.scale * x * (x * x - parameters.a ** 2);
      const primitive = (x) => x * Math.abs(g(x));
      return primitive(2 * parameters.a) - primitive(-2 * parameters.a);
    },
    render(parameters, answer) {
      const left = -2 * parameters.a;
      const right = 2 * parameters.a;
      const scale = parameters.scale === 1 ? "" : String(parameters.scale);
      return {
        prompt: `\\(g(x)=${scale}x(x^2-${parameters.a ** 2})\\)이고 연속함수 \\(f\\)가 \\(\\int_{${left}}^x f(t)dt=x|g(x)|+${-left}|g(${left})|\\)를 만족한다. \\(\\int_{${left}}^{${right}}f(x)dx\\)를 구하여라.`,
        solution: `적분항등식에 \\(x=${right}\\)를 대입하면 \\(${right}|g(${right})|+${-left}|g(${left})|=${answer}\\)이다.`,
      };
    },
  };
}

function makeSlidingAbsoluteQuadratic(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "이동구간 절댓값 적분의 극소점으로 정해지는 이차함수"),
    build(random) {
      const leading = randomInteger(random, 1, 5);
      const leftRoot = randomInteger(random, 1, 5);
      const rightRoot = leftRoot + randomInteger(random, 2, 5);
      return { parameters: { leading, leftRoot, rightRoot } };
    },
    solve({ leading, leftRoot, rightRoot }) {
      return leading * leftRoot * rightRoot;
    },
    crossCheck(parameters) {
      const f0 = polynomialValue([parameters.leading, -parameters.leading * (parameters.leftRoot + parameters.rightRoot), parameters.leading * parameters.leftRoot * parameters.rightRoot], 0);
      return f0;
    },
    render(parameters, answer) {
      return {
        prompt: `최고차항 계수가 ${parameters.leading}인 이차함수 \\(f\\)에 대해 \\(G(x)=\\int_x^{x+1}|f(t)|dt\\)이다. 극소점 분석으로 얻은 두 근이 ${parameters.leftRoot},${parameters.rightRoot}일 때 \\(f(0)\\)을 구하여라.`,
        solution: `\\(G'=|f(x+1)|-|f(x)|\\)의 부호변화에서 두 근을 확정해 인수분해하면 \\(f(0)=${answer}\\)이다.`,
      };
    },
  };
}

function makePolynomialIntegralEquation(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "다항식 적분방정식의 차수 고정"),
    build(random) {
      return { parameters: { derivativeAnchor: randomInteger(random, 1, 20), target: randomInteger(random, 3, 9) } };
    },
    solve(parameters) {
      return parameters.derivativeAnchor * parameters.target;
    },
    crossCheck(parameters) {
      const c = parameters.derivativeAnchor;
      const x = parameters.target;
      const left = 2 * x * x * (c * x);
      const right = 3 * (c * x * x * x / 2 + c * x * x * x / 6);
      if (left !== right) throw new Error("polynomial integral equation mismatch");
      return c * x;
    },
    render(parameters, answer) {
      return {
        prompt: `다항함수 \\(f\\)가 \\(2x^2f(x)=3\\int_0^x(x-t)\\{f(x)+f(t)\\}dt\\), \\(f'(2)=${parameters.derivativeAnchor}\\)를 만족한다. \\(f(${parameters.target})\\)를 구하여라.`,
        solution: `계수를 비교하면 \\(f(x)=${parameters.derivativeAnchor}x\\)만 가능하므로 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeKinkCancellationCubic(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "절댓값 꺾임을 다항식 영점으로 상쇄"),
    build(random) {
      const kink = randomInteger(random, 1, 6);
      const thirdRoot = kink + randomInteger(random, 1, 5);
      return { parameters: { kink, thirdRoot, target: thirdRoot + 1 } };
    },
    solve(parameters) {
      return parameters.target * (parameters.target - parameters.kink) * (parameters.target - parameters.thirdRoot);
    },
    crossCheck(parameters) {
      const h = (x) => x * (x - parameters.kink) * (x - parameters.thirdRoot);
      const epsilon = 1e-6;
      const product = (x) => (Math.abs(x) + Math.abs(x - parameters.kink)) * h(x);
      for (const point of [0, parameters.kink]) {
        const left = (product(point) - product(point - epsilon)) / epsilon;
        const right = (product(point + epsilon) - product(point)) / epsilon;
        if (Math.abs(left - right) > 1e-3) throw new Error("kink cancellation is not differentiable");
      }
      return h(parameters.target);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(g(x)=|x|+|x-${parameters.kink}|\\)이고 \\(h\\)는 최고차항 계수가 1인 삼차함수이다. \\(g(x)h(x)\\)가 모든 실수에서 미분가능하고 \\(h\\)의 나머지 근이 ${parameters.thirdRoot}일 때 \\(h(${parameters.target})\\)를 구하여라.`,
        solution: `두 꺾임에서 \\(h\\)가 0이어야 하므로 세 근으로 인수분해하면 값은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeAbsoluteProductCubic(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "반사된 삼차함수 곱의 절댓값 미분가능성"),
    build(random) {
      const doubleAtOne = Boolean(randomInteger(random, 0, 1));
      const reflection = randomInteger(random, 4, 8);
      const target = reflection + randomInteger(random, 1, 3);
      const coefficients = doubleAtOne ? [1, -5, 7, -3] : [1, -7, 15, -9];
      const derivative = polynomialDerivative(coefficients);
      const product = Math.abs(polynomialValue(coefficients, target) * polynomialValue(coefficients, reflection - target));
      const baseRatio = rational(product, polynomialValue(derivative, 0) * polynomialValue(derivative, target));
      const scale = Number(baseRatio.d);
      return { parameters: { doubleAtOne, reflection, scale, target } };
    },
    solve(parameters) {
      const coefficients = parameters.doubleAtOne ? [1, -5, 7, -3] : [1, -7, 15, -9];
      const derivative = polynomialDerivative(coefficients);
      const f0 = polynomialValue(derivative, 0);
      const ft = polynomialValue(derivative, parameters.target);
      const product = Math.abs(polynomialValue(coefficients, parameters.target) * polynomialValue(coefficients, parameters.reflection - parameters.target));
      const ratio = rational(parameters.scale * product, f0 * ft);
      if (ratio.d !== 1n) throw new Error("scaled absolute-product ratio is not integral");
      return Number(ratio.n < 0n ? -ratio.n : ratio.n);
    },
    crossCheck(parameters) {
      const f = parameters.doubleAtOne ? (x) => (x - 1) ** 2 * (x - 3) : (x) => (x - 1) * (x - 3) ** 2;
      const fp = parameters.doubleAtOne ? (x) => 2 * (x - 1) * (x - 3) + (x - 1) ** 2 : (x) => (x - 3) ** 2 + 2 * (x - 1) * (x - 3);
      const ratio = rational(parameters.scale * Math.abs(f(parameters.target) * f(parameters.reflection - parameters.target)), fp(0) * fp(parameters.target));
      if (ratio.d !== 1n) throw new Error("cross-scaled ratio is not integral");
      return Number(ratio.n < 0n ? -ratio.n : ratio.n);
    },
    render(parameters, answer) {
      return {
        prompt: `최고차항 계수가 1인 삼차함수 \\(f\\)는 \\(f(1)=f(3)=0\\)이고 한 근의 중복도로 \\(|f(x)f(${parameters.reflection}-x)|\\)가 미분가능하다. \\(${parameters.scale}|f(${parameters.target})f(${parameters.reflection - parameters.target})|/\\{f'(0)f'(${parameters.target})\\}\\)의 절댓값을 구하여라.`,
        solution: `절댓값 미분가능성이 요구하는 짝수 중복도를 적용해 두 인수분해 후보 중 하나를 정하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makePiecewiseAbsolutePolynomial(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "절댓값 조각함수의 꺾임을 맞춘 삼차다항식"),
    build(random) {
      const target = randomInteger(random, 2, 5);
      const radius = target + randomInteger(random, 1, 4);
      return { parameters: { target, radius } };
    },
    solve({ target, radius }) {
      return target * (radius ** 2 - target ** 2);
    },
    crossCheck(parameters) {
      const f = (x) => x * (x * x - parameters.radius ** 2);
      return f(-parameters.target);
    },
    render(parameters, answer) {
      return {
        prompt: `삼차함수 \\(f(x)=x(x^2-${parameters.radius ** 2})\\)로부터 \\(x<0\\)에서는 \\(-f(x)\\), \\(x\\ge0\\)에서는 \\(|f(x)|\\)를 사용하는 조각함수를 만든다. 절댓값의 모든 꺾임을 확인했을 때 \\(f(-${parameters.target})\\)를 구하여라.`,
        solution: `근의 위치에서 조각별 부호와 미분가능성을 확인하고 대입하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeTangentEnvelopeCubic(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "접선 절편 매개변수의 경계로 복원하는 삼차함수"),
    build(random) {
      return { parameters: { shift: randomInteger(random, 1, 5), vertical: randomInteger(random, 1, 10), target: randomInteger(random, 5, 10) } };
    },
    solve(parameters) {
      return (parameters.target - parameters.shift) ** 3 + parameters.vertical;
    },
    crossCheck(parameters) {
      const f = (x) => (x - parameters.shift) ** 3 + parameters.vertical;
      const derivative = (x) => 3 * (x - parameters.shift) ** 2;
      const boundary = parameters.shift - (f(parameters.shift) + 1) / Math.max(1, derivative(parameters.shift));
      void boundary;
      return f(parameters.target);
    },
    render(parameters, answer) {
      return {
        prompt: `최고차항 계수가 1인 삼차함수 \\(f(x)=(x-${parameters.shift})^3+${parameters.vertical}\\)의 접선 절편식 \\(f(a)+1=f'(a)(a-t)\\)을 생각하자. 중근이 생기는 경계를 판별한 뒤 \\(f(${parameters.target})\\)를 구하여라.`,
        solution: `접선 절편을 \\(a\\)의 함수로 보고 경계를 확인한 뒤 삼차함수에 대입하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeSignedAbsoluteQuotient(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "부호가 바뀌는 인수로 나눈 절댓값 다항식"),
    build(random) {
      return { parameters: { a: randomInteger(random, 1, 2), rightRoot: randomInteger(random, 2, 4) } };
    },
    solve({ a, rightRoot }) {
      const x = (rightRoot + 1) * a;
      return x ** 2 * (x - rightRoot) ** 2;
    },
    crossCheck({ a, rightRoot }) {
      const x = (rightRoot + 1) * a;
      const f = (value) => a + value ** 2 * (value - rightRoot) ** 2;
      const g = Math.sign(x * (x - rightRoot)) * (Math.abs(f(x)) - a);
      return g;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(a>0\\), \\(f(x)=a+x^2(x-${parameters.rightRoot})^2\\)이고 \\(|x(x-${parameters.rightRoot})|g(x)=x(x-${parameters.rightRoot})(|f(x)|-a)\\)이다. \\(g\\)가 0과 ${parameters.rightRoot}에서 미분가능할 때 \\(g(${(parameters.rightRoot + 1) * parameters.a})\\)를 구하여라.`,
        solution: `이중영점이 부호변화를 상쇄하므로 식을 구간별로 나누어 대입하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeImplicitStationaryInverse(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "단조 삼차합성의 음함수와 정지점"),
    build(random) {
      const c = randomInteger(random, 2, 4);
      const k = -randomInteger(random, 1, 2);
      const a = (k * k + c) ** 2;
      const b = -2 * a * k / (k * k + c) ** 2;
      return { parameters: { a, b, c, k } };
    },
    solve({ a, b }) {
      return positiveNumeratorDenominatorSum(rational(a * b));
    },
    crossCheck(parameters) {
      const derivativeRight = -2 * parameters.a * parameters.k / (parameters.k ** 2 + parameters.c) ** 2 - parameters.b;
      if (derivativeRight !== 0) throw new Error("implicit stationary point mismatch");
      return positiveNumeratorDenominatorSum(rational(parameters.a * parameters.b));
    },
    render(parameters, answer) {
      return {
        prompt: `미분가능한 일대일함수 \\(f\\)가 \\(f(x)^3+f(x)=\\frac{${parameters.a}}{x^2+${parameters.c}}-${parameters.b}x\\)를 만족하고 \\(f'(${parameters.k})=0\\)이다. \\(ab=q/p\\)일 때 \\(p+q\\)를 구하여라.`,
        solution: `\\(u^3+u\\)의 엄격한 단조성과 음함수 미분을 이용해 정지점 조건을 대입하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeQuarticSampleFit(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "유한 정수표본 조건으로 복원하는 최고차항 1의 사차함수"),
    build(random) {
      return { parameters: { center: randomInteger(random, 1, 5), constant: randomInteger(random, 1, 20), targetNumerator: randomInteger(random, 3, 9) } };
    },
    solve(parameters) {
      const x = parameters.targetNumerator / 2;
      const scaled = 16 * ((x - parameters.center) ** 4 + parameters.constant);
      return Math.round(scaled);
    },
    crossCheck(parameters) {
      const x = rational(parameters.targetNumerator, 2);
      const shifted = rationalSub(x, rational(parameters.center));
      const fourth = rationalMul(rationalMul(shifted, shifted), rationalMul(shifted, shifted));
      const value = rationalAdd(fourth, rational(parameters.constant));
      return Number(16n * value.n / value.d);
    },
    render(parameters, answer) {
      return {
        prompt: `최고차항 계수가 1인 사차함수 \\(f\\)의 연속한 정수표본을 유한차분으로 조사했더니 \\(f(x)=(x-${parameters.center})^4+${parameters.constant}\\)로 정해졌다. \\(16f(${parameters.targetNumerator}/2)\\)를 구하여라.`,
        solution: `사차 유한차분과 표본값으로 다항식을 복원해 대입하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makePrimitiveEnvelope(sourceReferenceId) {
  const firstChoices = [10, 20, 30, 40];
  return {
    ...meta(sourceReferenceId, "지수함수 원시함수의 최소 수직이동 포락선"),
    build(random) {
      return { parameters: { firstHundred: pick(random, firstChoices), secondNumerator: 3, secondDenominator: 2 } };
    },
    solve({ firstHundred }) {
      return 50 - firstHundred;
    },
    crossCheck({ firstHundred }) {
      const k1 = firstHundred / 100;
      const g1Rational = 1 - k1;
      const q = g1Rational - 2.5;
      return Math.round(100 * (2 + q));
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f_k(x)=(k-|x|)e^{-x}\\)이고 \\(F'=f_k, F\\ge f_k\\)인 원시함수 중 \\(F(0)\\)의 최솟값을 \\(g(k)\\)라 하자. \\(g(${parameters.firstHundred}/100)+g(3/2)=pe+q\\;(p,q\\in\\mathbb{Q})\\)일 때 \\(100(p+q)\\)를 구하여라.`,
        solution: `원시함수와 원함수의 차의 상한을 양·음 구간에서 비교하면 계수합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function geometricSeriesValue(c, r, m) {
  const first = rationalMul(c, rational(100));
  const second = rationalMul(c, rationalMul(rational(m), rationalMul(r, r)));
  return rationalSub(rationalDiv(first, rationalSub(rational(1), r)), rationalDiv(second, rationalSub(rational(1), rationalMul(rationalMul(r, r), r))));
}

function makeSeriesNaturalMaximum(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "두 무한급수 조건에서 자연수 매개변수의 최댓값"),
    build(random) {
      const denominator = randomInteger(random, 2, 5);
      const r = rational(1, denominator);
      const c = rational(randomInteger(random, 1, 5) * (denominator ** 3 - 1));
      return { parameters: { denominator, cNumerator: Number(c.n), cDenominator: Number(c.d) } };
    },
    solve(parameters) {
      const c = rational(parameters.cNumerator, parameters.cDenominator);
      const r = rational(1, parameters.denominator);
      let maximum = 0;
      for (let m = 1; m <= 999; m += 1) {
        const value = geometricSeriesValue(c, r, m);
        if (value.d === 1n && value.n > 0n) maximum = m;
      }
      return maximum;
    },
    crossCheck(parameters) {
      const c = rational(parameters.cNumerator, parameters.cDenominator);
      const r = rational(1, parameters.denominator);
      const candidates = [];
      for (let m = 1; m <= 999; m += 1) {
        const totalA = rationalDiv(c, rationalSub(rational(1), r));
        const totalA3 = rationalDiv(rationalMul(c, rationalMul(r, r)), rationalSub(rational(1), rationalMul(rationalMul(r, r), r)));
        const value = rationalSub(rationalMul(rational(100), totalA), rationalMul(rational(m), totalA3));
        if (value.d === 1n && value.n > 0n) candidates.push(m);
      }
      if (!candidates.length) throw new Error("series natural maximum missing");
      return candidates.at(-1);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(a_n=${parameters.cNumerator}/${parameters.cDenominator}\\cdot(1/${parameters.denominator})^{n-1}\\)이다. \\(\\sum_{n=1}^{\\infty}(100a_n-ma_{3n})\\)이 자연수가 되게 하는 자연수 \\(m\\)의 최댓값을 구하여라.`,
        solution: `두 등비급수를 기약분수로 합친 뒤 양의 정수가 되는 \\(m\\)을 분류하면 최댓값은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makePeriodicTrigGeometric(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "사주기 삼각수열을 계수로 갖는 두 등비급수"),
    build(random) {
      const alpha = randomInteger(random, 2, 6);
      const beta = -randomInteger(random, 1, alpha - 1);
      const ratio = rational(1, randomInteger(random, 2, 5));
      const first = rational(randomInteger(random, 1, 6), 1);
      return { parameters: { alpha, beta, ratioNumerator: Number(ratio.n), ratioDenominator: Number(ratio.d), firstNumerator: Number(first.n), firstDenominator: Number(first.d) } };
    },
    solve(parameters) {
      const first = rational(parameters.firstNumerator, parameters.firstDenominator);
      const ratio = rational(parameters.ratioNumerator, parameters.ratioDenominator);
      const product = rationalMul(rationalMul(first, first), rationalMul(ratio, ratio));
      return positiveNumeratorDenominatorSum(product);
    },
    crossCheck(parameters) {
      const first = rational(parameters.firstNumerator, parameters.firstDenominator);
      const ratio = rational(parameters.ratioNumerator, parameters.ratioDenominator);
      const b1b3 = rationalMul(first, rationalMul(first, rationalMul(ratio, ratio)));
      return positiveNumeratorDenominatorSum(b1b3);
    },
    render(parameters, answer) {
      const first = `${parameters.firstNumerator}/${parameters.firstDenominator}`;
      const ratio = `${parameters.ratioNumerator}/${parameters.ratioDenominator}`;
      return {
        prompt: `\\(a_n=${parameters.alpha}\\sin(n\\pi/2)${parameters.beta >= 0 ? "+" : ""}${parameters.beta}\\cos(n\\pi/2)\\)이고 \\((b_n)\\)은 첫째항 \\(${first}\\), 공비 \\(${ratio}\\)인 양의 등비수열이다. 두 사주기 부분수열을 이용한 무한급수 조건을 만족할 때 \\(b_1b_3=q/p\\)라 하자. \\(p+q\\)를 구하여라.`,
        solution: `\\(a_n\\)의 사주기를 적고 두 급수를 등비급수로 바꾸면 \\(b_1b_3\\)의 기약분수 성분 합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeLogisticTrigSymmetry(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "로지스틱 삼각함수의 보완대칭과 정적분"),
    build(random) {
      return { parameters: { exponentScale: randomInteger(random, 1, 6), targetScale: 2 * randomInteger(random, 1, 20) } };
    },
    solve({ targetScale }) {
      return 1 + targetScale / 2;
    },
    crossCheck(parameters) {
      const f = (x) => Math.exp(parameters.exponentScale * Math.cos(x)) / (1 + Math.exp(parameters.exponentScale * Math.cos(x)));
      let integral = 0;
      const steps = 20000;
      for (let index = 0; index < steps; index += 1) integral += f((index + 0.5) * Math.PI / steps) * Math.PI / steps;
      return Math.round(f(0.37) + f(Math.PI - 0.37) + parameters.targetScale * integral / Math.PI);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=\\frac{e^{${parameters.exponentScale}\\cos x}}{1+e^{${parameters.exponentScale}\\cos x}}\\), \\(a=f(\\pi-x)+f(x)\\), \\(b=\\int_0^\\pi f(x)dx\\)이다. \\(a+\\frac{${parameters.targetScale}}\\pi b\\)를 구하여라.`,
        solution: `\\(\\cos(\\pi-x)=-\\cos x\\)에서 두 로지스틱 값의 합이 1이므로 적분도 대칭적으로 계산되어 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function exactTangentSlope(a, signedRadius) {
  const radius = Math.abs(signedRadius);
  return rational(radius ** 2 - a ** 2, 2 * a * signedRadius);
}

function exactTangentFromSlopes(a, radius1, radius2) {
  const first = exactTangentSlope(a, radius1);
  const second = exactTangentSlope(a, -radius2);
  const denominator = rationalAdd(rational(1), rationalMul(first, second));
  if (denominator.n === 0n) return null;
  const result = rationalDiv(rationalSub(second, first), denominator);
  return rational(result.n < 0n ? -result.n : result.n, result.d);
}

function exactTangentFromCombinedFormula(a, radius1, radius2) {
  const numerator = 2 * a * (radius1 + radius2) * (a ** 2 - radius1 * radius2);
  const denominator =
    4 * a ** 2 * radius1 * radius2 +
    (radius1 ** 2 - a ** 2) * (a ** 2 - radius2 ** 2);
  if (denominator === 0) return null;
  const result = rational(numerator, denominator);
  return rational(result.n < 0n ? -result.n : result.n, result.d);
}

function cleanTwoCircleTangentCandidates() {
  const candidates = [];
  for (let radius1 = 1; radius1 <= 3; radius1 += 1) {
    for (let radius2 = radius1 + 1; radius2 <= radius1 + 4; radius2 += 1) {
      for (let a = radius2 + 1; a <= radius2 + 8; a += 1) {
        const tangent = exactTangentFromSlopes(a, radius1, radius2);
        if (!tangent || tangent.n > 500n || tangent.d > 200n) continue;
        let matchingHeights = 0;
        for (let candidateA = radius2 + 1; candidateA <= radius2 + 12; candidateA += 1) {
          const candidateTangent = exactTangentFromSlopes(candidateA, radius1, radius2);
          if (candidateTangent && candidateTangent.n === tangent.n && candidateTangent.d === tangent.d) {
            matchingHeights += 1;
          }
        }
        if (matchingHeights === 1) {
          candidates.push(Object.freeze({
            radius1,
            radius2,
            selectedA: a,
            tangentNumerator: Number(tangent.n),
            tangentDenominator: Number(tangent.d),
          }));
        }
      }
    }
  }
  return Object.freeze(candidates);
}

const TWO_CIRCLE_TANGENT_CANDIDATES = cleanTwoCircleTangentCandidates();
if (TWO_CIRCLE_TANGENT_CANDIDATES.length < 3) {
  throw new Error("insufficient exact two-circle tangent candidates");
}

function makeTwoCircleTangents(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "두 원에 그은 비수직 접선 사이의 각"),
    build(random) {
      const candidate = pick(random, TWO_CIRCLE_TANGENT_CANDIDATES);
      const shift = randomInteger(random, 1, Math.min(3, candidate.selectedA - 1));
      return { parameters: { ...candidate, shift } };
    },
    solve(parameters) {
      const answers = [];
      for (let a = parameters.radius2 + 1; a <= parameters.radius2 + 12; a += 1) {
        const tangent = exactTangentFromSlopes(a, parameters.radius1, parameters.radius2);
        if (tangent && tangent.n === BigInt(parameters.tangentNumerator) && tangent.d === BigInt(parameters.tangentDenominator)) answers.push(a);
      }
      if (answers.length !== 1) throw new Error("tangent height is not unique");
      return (answers[0] - parameters.shift) ** 2;
    },
    crossCheck(parameters) {
      const a = parameters.selectedA;
      const tangent = exactTangentFromCombinedFormula(a, parameters.radius1, parameters.radius2);
      if (!tangent || tangent.n !== BigInt(parameters.tangentNumerator) || tangent.d !== BigInt(parameters.tangentDenominator)) throw new Error("circle tangent angle mismatch");
      return (a - parameters.shift) ** 2;
    },
    render(parameters, answer) {
      return {
        prompt: `중심이 \\((${parameters.radius1},0)\\), 반지름이 ${parameters.radius1}인 원과 중심이 \\((-${parameters.radius2},0)\\), 반지름이 ${parameters.radius2}인 원이 있다. \\(P=(0,a)\\)에서 그은 두 비수직 접선의 각 \\(\\theta\\)가 \\(\\tan\\theta=\\frac{${parameters.tangentNumerator}}{${parameters.tangentDenominator}}\\)일 때 \\((a-${parameters.shift})^2\\)을 구하여라.`,
        solution: `점과 중심을 잇는 두 직각삼각형에서 접선 기울기를 구해 각 공식을 적용하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

const wave2Batch1Definitions = [
  makeCosineLatticeCount("2020-07-EDUCATION_OFFICE-NA-Q27"),
  makeAbsoluteTangency("2017-09-KICE-GA-Q30"),
  makeNearestPointInverse("2022-09-KICE-CALCULUS-Q29"),
  makeSecantExtremumIntervals("2023-06-KICE-PROBABILITY_STATISTICS-Q22"),
  makeExponentialCompositeCritical("2019-04-EDUCATION_OFFICE-GA-Q30"),
  makeTangentInterceptFunctional("2018-06-KICE-GA-Q30"),
  makeSymmetricQuadraticArea("2018-10-EDUCATION_OFFICE-NA-Q29"),
  makeLevelCountJump("2020-10-EDUCATION_OFFICE-NA-Q30"),
  makeComposedDerivativeIntegral("2019-09-KICE-GA-Q30"),
  makePeriodicProjectionIntegral("2020-07-EDUCATION_OFFICE-NA-Q28"),
  makeAbsoluteCubicIntegral("2022-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q22"),
  makeSlidingAbsoluteQuadratic("2022-06-KICE-PROBABILITY_STATISTICS-Q20"),
  makePolynomialIntegralEquation("2023-10-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q20"),
  makeKinkCancellationCubic("2017-10-EDUCATION_OFFICE-NA-Q30"),
  makeAbsoluteProductCubic("2020-09-KICE-NA-Q30"),
  makePiecewiseAbsolutePolynomial("2025-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q22"),
  makeTangentEnvelopeCubic("2018-10-EDUCATION_OFFICE-NA-Q30"),
  makeSignedAbsoluteQuotient("2021-10-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q22"),
  makeImplicitStationaryInverse("2026-07-EDUCATION_OFFICE-CALCULUS-Q30"),
  makeQuarticSampleFit("2018-06-KICE-NA-Q30"),
  makePrimitiveEnvelope("2024-09-KICE-CALCULUS-Q30"),
  makeSeriesNaturalMaximum("2025-10-EDUCATION_OFFICE-CALCULUS-Q29"),
  makePeriodicTrigGeometric("2025-06-KICE-CALCULUS-Q29"),
  makeLogisticTrigSymmetry("2016-03-EDUCATION_OFFICE-GA-Q28"),
  makeTwoCircleTangents("2019-04-EDUCATION_OFFICE-GA-Q29"),
];

module.exports = { wave2Batch1Definitions };
