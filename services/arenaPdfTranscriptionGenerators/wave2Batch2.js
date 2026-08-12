"use strict";

const {
  gcdBigInt,
  pick,
  positiveNumeratorDenominatorSum,
  randomInteger,
  rational,
  rationalAdd,
  rationalMul,
  rationalNumber,
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

function integratePolynomial(coefficients, left, right) {
  const degree = coefficients.length - 1;
  let total = 0;
  for (let index = 0; index < coefficients.length; index += 1) {
    const power = degree - index + 1;
    total += coefficients[index] * (right ** power - left ** power) / power;
  }
  return total;
}

function subtractedRationalTerm(value, variable) {
  if (value.n === 0n) return "";
  const absoluteNumerator = value.n < 0n ? -value.n : value.n;
  const coefficient = value.d === 1n
    ? (absoluteNumerator === 1n ? "" : String(absoluteNumerator))
    : `\\frac{${absoluteNumerator}}{${value.d}}`;
  return `${value.n > 0n ? "-" : "+"}${coefficient}${variable}`;
}

function makeTrigCommonIntersection(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "사인·코사인 공통값으로 정해지는 주기매개변수"),
    build(random) {
      return { parameters: { amplitudeScale: randomInteger(random, 1, 8) } };
    },
    solve({ amplitudeScale }) {
      return 8 + 3 * amplitudeScale ** 2;
    },
    crossCheck({ amplitudeScale }) {
      const k = amplitudeScale / 2;
      const t = 4 / (3 * amplitudeScale);
      const phase = t * Math.PI * k;
      const f = Math.sqrt(3) * amplitudeScale * Math.sin(phase);
      const g = -3 * amplitudeScale * Math.cos(phase);
      if (Math.abs(f - 3 * k) > 1e-9 || Math.abs(g - 3 * k) > 1e-9) throw new Error("trig common intersection mismatch");
      return Math.round(6 * amplitudeScale * (t + k));
    },
    render(parameters, answer) {
      return {
        prompt: `\\(0\\le x\\le2/t\\), \\(f(x)=\\sqrt3\\cdot${parameters.amplitudeScale}\\sin(t\\pi x)\\), \\(g(x)=-3\\cdot${parameters.amplitudeScale}\\cos(t\\pi x)\\)이다. \\(0<k<2/t\\), \\(f(k)=g(k)=3k\\)일 때 \\(${6 * parameters.amplitudeScale}(t+k)\\)를 구하여라.`,
        solution: `공통 위상은 제2사분면의 \\(2\\pi/3\\)이고 공통값에서 \\(k\\)를 정하면 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function distanceForLinearVelocity(slope, intercept, endTime) {
  const zero = intercept / slope;
  const primitive = (t) => -slope * t * t / 2 + intercept * t;
  if (zero <= 0 || zero >= endTime) return Math.abs(primitive(endTime));
  return primitive(zero) - primitive(0) + Math.abs(primitive(endTime) - primitive(zero));
}

function makeLinearVelocityDistance(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "속도 부호변화를 반영한 이동거리"),
    build(random) {
      const slope = 2 * randomInteger(random, 1, 5);
      const zeroTime = randomInteger(random, 1, 5);
      const endTime = zeroTime + randomInteger(random, 1, 5);
      return { parameters: { slope, intercept: slope * zeroTime, zeroTime, endTime } };
    },
    solve(parameters) {
      return distanceForLinearVelocity(parameters.slope, parameters.intercept, parameters.endTime);
    },
    crossCheck(parameters) {
      let distance = 0;
      const steps = 20000;
      const dt = parameters.endTime / steps;
      for (let index = 0; index < steps; index += 1) {
        const t = (index + 0.5) * dt;
        distance += Math.abs(-parameters.slope * t + parameters.intercept) * dt;
      }
      return Math.round(distance);
    },
    render(parameters, answer) {
      return {
        prompt: `점의 속도가 \\(v(t)=-${parameters.slope}t+${parameters.intercept}\\;(t\\ge0)\\)일 때 \\(0\\le t\\le${parameters.endTime}\\)에서 움직인 거리를 구하여라.`,
        solution: `속도가 0인 \\(t=${parameters.zeroTime}\\)에서 구간을 나누어 절댓값을 적분하면 거리는 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeRiemannQuadraticArea(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "리만합으로 계수를 정하는 두 이차곡선 사이 넓이"),
    build(random) {
      const differenceScale = 3 * randomInteger(random, 1, 4);
      const radius = randomInteger(random, 1, 4);
      return {
        parameters: {
          differenceScale,
          radius,
          fAtOne: 1 + differenceScale * (radius ** 2 - 1),
          riemannLimit: (differenceScale / 3) * (3 * radius ** 2 - 1),
        },
      };
    },
    solve({ differenceScale, radius }) {
      return 4 * differenceScale * radius ** 3 / 3;
    },
    crossCheck(parameters) {
      const steps = 10000;
      let limit = 0;
      for (let k = 1; k <= steps; k += 1) {
        const x = k / steps;
        limit += parameters.differenceScale * (parameters.radius ** 2 - x * x) / steps;
      }
      if (Math.abs(limit - parameters.riemannLimit) > 1e-3) throw new Error("Riemann limit mismatch");
      return Math.round(integratePolynomial([-parameters.differenceScale, 0, parameters.differenceScale * parameters.radius ** 2], -parameters.radius, parameters.radius));
    },
    render(parameters, answer) {
      return {
        prompt: `짝함수인 이차함수 \\(f\\)와 \\(g(x)=x^2\\)가 \\(f(1)=${parameters.fAtOne}\\), \\(\\lim_{n\\to\\infty}\\frac1n\\sum_{k=1}^n\\{f(k/n)-g(k/n)\\}=${parameters.riemannLimit}\\)를 만족한다. 두 곡선으로 둘러싸인 넓이를 구하여라.`,
        solution: `리만합을 적분으로 바꾸어 \\(f-g\\)를 정하고 두 교점 사이를 적분하면 넓이는 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeInverseAreaIdentity(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "역함수 넓이항등식과 오목성으로 정하는 절댓값 넓이"),
    build(random) {
      const inverse13 = randomInteger(random, 1, 6);
      const area37 = randomInteger(random, 1, 20);
      const integral13 = 8 - inverse13;
      const totalIntegral = integral13 + 20 + area37;
      const scale = randomInteger(random, 2, 12);
      return { parameters: { inverse13, area37, totalIntegral, scale } };
    },
    solve({ area37, scale }) {
      return scale * area37;
    },
    crossCheck(parameters) {
      const integral13 = 3 * 3 - 1 * 1 - parameters.inverse13;
      const integral37 = parameters.totalIntegral - integral13;
      return parameters.scale * Math.abs(integral37 - 20);
    },
    render(parameters, answer) {
      return {
        prompt: `증가함수 \\(f\\)와 역함수 \\(g\\)가 \\(f(1)=1,f(3)=3,f(7)=7\\), 구간별로 엄격히 오목하고 \\(\\int_1^7f=${parameters.totalIntegral}\\), \\(\\int_1^3g=${parameters.inverse13}\\)를 만족한다. \\(${parameters.scale}\\int_3^7|f(x)-x|dx\\)를 구하여라.`,
        solution: `역함수 넓이항등식으로 \\(1\\)부터 \\(3\\)까지의 적분을 구하고 오목성으로 부호를 정하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeHorizontalDoubleRootCubic(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "수평선과 두 점에서 만나는 삼차함수의 중근"),
    build(random) {
      const doubleRoot = 2 * randomInteger(random, 1, 4);
      const total = doubleRoot ** 3 / 2;
      const constant = randomInteger(random, 1, Math.max(1, total - 1));
      const lineDepth = total - constant;
      const target = doubleRoot + randomInteger(random, 1, 5);
      return { parameters: { doubleRoot, constant, lineDepth, target, otherRoot: -doubleRoot / 2 } };
    },
    solve(parameters) {
      return (parameters.target - parameters.doubleRoot) ** 2 * (parameters.target - parameters.otherRoot) - parameters.lineDepth;
    },
    crossCheck(parameters) {
      const f = (x) => (x - parameters.doubleRoot) ** 2 * (x - parameters.otherRoot) - parameters.lineDepth;
      const derivativeAtZero = parameters.doubleRoot ** 2 + 2 * parameters.doubleRoot * parameters.otherRoot;
      if (f(0) !== parameters.constant || derivativeAtZero !== 0) throw new Error("cubic limit anchors mismatch");
      return f(parameters.target);
    },
    render(parameters, answer) {
      return {
        prompt: `최고차항 계수가 1인 삼차함수 \\(f\\)가 \\(\\lim_{x\\to0}\\frac{f(x)-${parameters.constant}}x=0\\)이고 직선 \\(y=-${parameters.lineDepth}\\)와 정확히 두 점에서 만난다. 중근이 양수일 때 \\(f(${parameters.target})\\)를 구하여라.`,
        solution: `극한에서 \\(f(0),f'(0)\\)를 얻고 수평선 교점의 중근 인수분해를 적용하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeCentroidIntersectionLimit(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "이차곡선·직선 교점삼각형 무게중심의 극한"),
    build(random) {
      return { parameters: { curveShift: randomInteger(random, 2, 8), constantNumerator: randomInteger(random, 1, 8), lineIntercept: randomInteger(random, 1, 12), scaleMultiplier: randomInteger(random, 1, 20) } };
    },
    solve({ lineIntercept, scaleMultiplier }) {
      return 2 * lineIntercept * scaleMultiplier;
    },
    crossCheck(parameters) {
      const n = 100000000;
      const sumX = parameters.curveShift + 2 / n;
      const centroidY = (sumX / n + 2 * parameters.lineIntercept) / 3;
      return Math.round(3 * parameters.scaleMultiplier * centroidY);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(C_n:y=x^2-(${parameters.curveShift}+1/n)x+${parameters.constantNumerator}/n\\), \\(\\ell_n:y=x/n+${parameters.lineIntercept}\\)의 두 교점을 \\(P_n,Q_n\\)이라 한다. 삼각형 \\(OP_nQ_n\\)의 무게중심 y좌표를 \\(a_n\\)이라 할 때 \\(${3 * parameters.scaleMultiplier}\\lim_{n\\to\\infty}a_n\\)을 구하여라.`,
        solution: `교점 x좌표의 합을 Vieta 정리로 구해 직선식에 대입하면 극한값은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeFiniteBijectionInverse(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "유한집합 전단사와 합성·역함수 조건"),
    build(random) {
      return { parameters: { targetScale: randomInteger(random, 1, 20) } };
    },
    solve({ targetScale }) {
      return 12 * targetScale;
    },
    crossCheck({ targetScale }) {
      const values = [2, 4, 6, 8];
      let answer = null;
      function permute(current, remaining) {
        if (!remaining.length) {
          if (current[0] === 2 || current[1] !== 4 || current[3] !== 8) return;
          const inverseOf2 = current.indexOf(2) + 1;
          answer = targetScale * current[1] * inverseOf2;
          return;
        }
        for (let i = 0; i < remaining.length; i += 1) permute([...current, remaining[i]], [...remaining.slice(0, i), ...remaining.slice(i + 1)]);
      }
      permute([], values);
      if (answer === null) throw new Error("finite bijection missing");
      return answer;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(X=\\{1,2,3,4\\}\\), \\(Y=\\{2,4,6,8\\}\\)이고 \\(f:X\\to Y\\)는 전단사이다. \\(f(1)\\ne2\\)이며 \\(\\frac12f(a)=(f\\circ f^{-1})(a)\\)인 \\(a\\in X\\)가 정확히 2개이다. \\(${parameters.targetScale}f(2)f^{-1}(2)\\)를 구하여라.`,
        solution: `합성이 정의되는 공통 원소 2와 4에서 조건을 강제해 전단사를 완성하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeCubicAsymptoticExtrema(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "멀리 떨어진 세 근을 갖는 삼차함수 극값의 점근비"),
    build(random) {
      return { parameters: { nearScale: randomInteger(random, 1, 5), farScale: randomInteger(random, 1, 6) } };
    },
    solve({ nearScale, farScale }) {
      return positiveNumeratorDenominatorSum(rational(nearScale * farScale, 2));
    },
    crossCheck(parameters) {
      const n = 1000000;
      const sumRoots = parameters.nearScale * n + parameters.farScale * n * n;
      const pairSum = parameters.nearScale * parameters.farScale * n ** 3;
      const discriminant = 4 * sumRoots ** 2 - 12 * pairSum;
      const a = (2 * sumRoots - Math.sqrt(discriminant)) / 6;
      const b = sumRoots - 2 * a;
      const limit = a * b / n ** 3;
      return positiveNumeratorDenominatorSum(rational(Math.round(2 * limit), 2));
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f_n(x)=x(x-${parameters.nearScale}n)(x-${parameters.farScale}n^2)\\)의 극댓값 위치를 \\(a_n\\), 그와 같은 함숫값을 갖는 다른 점을 \\(b_n\\)이라 하자. \\(\\lim_{n\\to\\infty}a_nb_n/n^3=q/p\\)일 때 \\(p+q\\)를 구하여라.`,
        solution: `작은 도함수 근과 이중근 인수분해에서 각각의 최고차 점근항을 구하면 성분 합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeExponentialCurveIntersection(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "지수곡선과 회전직선 교점의 음함수 미분"),
    build(random) {
      return { parameters: { targetScale: randomInteger(random, 1, 20) } };
    },
    solve({ targetScale }) {
      return 5 * targetScale;
    },
    crossCheck({ targetScale }) {
      const p = 1;
      const q = -2;
      return targetScale * (p * p + q * q);
    },
    render(parameters, answer) {
      return {
        prompt: `양의 기울기로 \\((0,1)\\)을 지나는 직선과 \\(C_a:y=e^{x/a}-1\\)의 제1사분면 교점 x좌표를 \\(f(\\theta)\\)라 하자. \\(f(\\pi/4)=a\\)이고 \\(\\sqrt{f'(\\pi/4)}=pe+q\\;(p,q\\in\\mathbb Z)\\)일 때 \\(${parameters.targetScale}(p^2+q^2)\\)을 구하여라.`,
        solution: `교점식에서 \\(a=e-2\\)를 얻고 음함수 미분하면 \\(p=1,q=-2\\)이므로 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeHarmonicSequence(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "망원급수 부분합에서 복원하는 조화수열"),
    build(random) {
      const firstIndex = randomInteger(random, 1, 12);
      const secondIndex = randomInteger(random, firstIndex + 1, 20);
      return { parameters: { firstIndex, secondIndex } };
    },
    solve({ firstIndex, secondIndex }) {
      return positiveNumeratorDenominatorSum(rational(firstIndex + secondIndex, firstIndex * secondIndex));
    },
    crossCheck(parameters) {
      const first = rational(1, parameters.firstIndex);
      const second = rational(1, parameters.secondIndex);
      return positiveNumeratorDenominatorSum(rationalAdd(first, second));
    },
    render(parameters, answer) {
      return {
        prompt: `\\(S_m=\\sum_{n=1}^{\\infty}\\frac{m+1}{n(n+m+1)}\\), \\(a_m=S_m-S_{m-1}\\)이다. \\(a_${parameters.firstIndex}+a_${parameters.secondIndex}=q/p\\)일 때 \\(p+q\\)를 구하여라.`,
        solution: `무한급수를 망원합으로 바꾸면 \\(S_m\\)은 조화부분합이고 \\(a_m=1/m\\)이므로 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeLogProductCancellation(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "로그 밑변환에서 공통로그가 소거되는 곱"),
    build(random) {
      return { parameters: { exponent: randomInteger(random, 2, 10) } };
    },
    solve({ exponent }) {
      return 2 * (exponent - 1);
    },
    crossCheck({ exponent }) {
      const logA = Math.log10(3.7);
      const logB = exponent * logA;
      return Math.round((logB - logA) * (2 / logA));
    },
    render(parameters, answer) {
      return {
        prompt: `\\(a,b>0\\), \\(a,b\\ne1\\), \\(\\log_a b=${parameters.exponent}\\)일 때 \\(\\log(b/a)\\cdot\\log_a100\\)을 구하여라.`,
        solution: `\\(b=a^{${parameters.exponent}}\\)로 바꾸고 밑변환하면 공통로그가 소거되어 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeCubicSecantParameter(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "원점 할선기울기와 도함숫값을 같게 하는 양의 매개변수"),
    build(random) {
      const selectedA = randomInteger(random, 2, 12);
      const derivativePoint = randomInteger(random, 1, 6);
      if (selectedA === 2 * derivativePoint) throw new Error("degenerate secant parameter");
      const numerator = selectedA ** 2 - 3 * derivativePoint ** 2;
      const denominator = selectedA - 2 * derivativePoint;
      return {
        parameters: {
          selectedA,
          derivativePoint,
          quadraticCoefficient: rational(numerator, denominator),
          linearCoefficient: randomInteger(random, 1, 10),
        },
      };
    },
    solve(parameters) {
      const quadraticCoefficient = rationalNumber(parameters.quadraticCoefficient);
      const answers = [];
      for (let a = 1; a <= 30; a += 1) {
        const secant = a * a - quadraticCoefficient * a + parameters.linearCoefficient;
        const derivative = 3 * parameters.derivativePoint ** 2 - 2 * quadraticCoefficient * parameters.derivativePoint + parameters.linearCoefficient;
        if (Math.abs(secant - derivative) < 1e-9) answers.push(a);
      }
      if (answers.length !== 1) throw new Error("positive secant parameter is not unique");
      return answers[0];
    },
    crossCheck(parameters) {
      const quadraticCoefficient = rationalNumber(parameters.quadraticCoefficient);
      const a = parameters.selectedA;
      const left = a * a - quadraticCoefficient * a + parameters.linearCoefficient;
      const right = 3 * parameters.derivativePoint ** 2 - 2 * quadraticCoefficient * parameters.derivativePoint + parameters.linearCoefficient;
      if (Math.abs(left - right) > 1e-9) throw new Error("secant derivative mismatch");
      return a;
    },
    render(parameters, answer) {
      const quadraticTerm = subtractedRationalTerm(parameters.quadraticCoefficient, "x^2");
      const linearTerm = parameters.linearCoefficient === 1 ? "+x" : `+${parameters.linearCoefficient}x`;
      return {
        prompt: `\\(f(x)=x^3${quadraticTerm}${linearTerm}\\), \\(a>0\\)이고 \\(\\frac{f(a)-f(0)}a=f'(${parameters.derivativePoint})\\)이다. 유일한 양수 \\(a\\)를 구하여라.`,
        solution: `할선기울기와 도함숫값을 계산해 이차방정식을 인수분해하면 \\(a=${answer}\\)이다.`,
      };
    },
  };
}

function makeIntegerSineLevels(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "한 개의 사인 봉우리에서 정수 높이 격자점 개수"),
    build(random) {
      return { parameters: { amplitude: randomInteger(random, 2, 20) } };
    },
    solve({ amplitude }) {
      return 2 * amplitude + 1;
    },
    crossCheck({ amplitude }) {
      let count = 2;
      for (let y = 1; y < amplitude; y += 1) count += 2;
      count += 1;
      return count;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(0\\le x\\le2\\)에서 \\(y=${parameters.amplitude}\\sin(\\pi x/2)\\)이고 \\(y\\)가 정수인 곡선 위 점의 개수를 구하여라.`,
        solution: `높이 0은 양 끝점, 최고점은 한 점, 중간 정수 높이는 각각 두 점이므로 \\(${answer}\\)개이다.`,
      };
    },
  };
}

function makeTrigIntersectionTriangle(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "사인·코사인 세 교점이 만드는 삼각형 넓이"),
    build(random) {
      const m = randomInteger(random, 1, 15);
      return { parameters: { m, area: 2 * m } };
    },
    solve({ m }) {
      return 2 * m * m;
    },
    crossCheck(parameters) {
      const amplitude = Math.sqrt(2) * parameters.m;
      const base = 2;
      const height = Math.sqrt(2) * amplitude;
      if (Math.abs(base * height / 2 - parameters.area) > 1e-9) throw new Error("intersection triangle area mismatch");
      return Math.round(amplitude ** 2);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(0\\le x\\le3\\)에서 \\(f(x)=a\\sin\\pi x\\), \\(g(x)=a\\cos\\pi x\\;(a>0)\\)의 세 교점이 만드는 삼각형 넓이가 ${parameters.area}이다. \\(a^2\\)을 구하여라.`,
        solution: `세 교점의 x간격과 번갈아 나타나는 y좌표로 밑변과 높이를 구하면 \\(a^2=${answer}\\)이다.`,
      };
    },
  };
}

function makeTangentIntercept(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "삼차곡선 한 점에서 그은 접선의 y절편"),
    build(random) {
      return { parameters: { quadraticCoefficient: randomInteger(random, 1, 10), constant: randomInteger(random, 1, 20), pointX: randomInteger(random, 1, 6) } };
    },
    solve({ quadraticCoefficient, constant, pointX }) {
      return constant - 2 * pointX ** 3 + quadraticCoefficient * pointX ** 2;
    },
    crossCheck(parameters) {
      const f = (x) => x ** 3 - parameters.quadraticCoefficient * x ** 2 + parameters.constant;
      const slope = 3 * parameters.pointX ** 2 - 2 * parameters.quadraticCoefficient * parameters.pointX;
      return f(parameters.pointX) - slope * parameters.pointX;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=x^3-${parameters.quadraticCoefficient}x^2+${parameters.constant}\\)의 \\(x=${parameters.pointX}\\)인 점에서의 접선이 y축과 만나는 좌표를 구하여라.`,
        solution: `점접선식의 상수항 \\(f(c)-cf'(c)\\)를 계산하면 y절편은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeCubicLineDoubleIntersection(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "삼차곡선과 직선이 두 점에서 만나는 절편매개변수 곱"),
    build(random) {
      const firstRoot = randomInteger(random, -4, 1);
      const secondRoot = firstRoot + 2 * randomInteger(random, 1, 4);
      const slope = randomInteger(random, -3, 6);
      const constant = randomInteger(random, -8, 8);
      return { parameters: { firstRoot, secondRoot, slope, constant } };
    },
    solve(parameters) {
      const sum = parameters.firstRoot + parameters.secondRoot;
      const product = parameters.firstRoot * parameters.secondRoot;
      const f = (x) => x ** 3 - 1.5 * sum * x ** 2 + (3 * product + parameters.slope) * x + parameters.constant;
      const k1 = f(parameters.firstRoot) - parameters.slope * parameters.firstRoot;
      const k2 = f(parameters.secondRoot) - parameters.slope * parameters.secondRoot;
      return k1 * k2;
    },
    crossCheck(parameters) {
      const sum = parameters.firstRoot + parameters.secondRoot;
      const product = parameters.firstRoot * parameters.secondRoot;
      const difference = (x) => x ** 3 - 1.5 * sum * x ** 2 + 3 * product * x + parameters.constant;
      return difference(parameters.firstRoot) * difference(parameters.secondRoot);
    },
    render(parameters, answer) {
      const sum = parameters.firstRoot + parameters.secondRoot;
      const product = parameters.firstRoot * parameters.secondRoot;
      return {
        prompt: `\\(C:y=x^3-${1.5 * sum}x^2+${3 * product + parameters.slope}x${parameters.constant >= 0 ? "+" : ""}${parameters.constant}\\), \\(\\ell_k:y=${parameters.slope}x+k\\)가 정확히 두 점에서 만나게 하는 모든 \\(k\\)의 곱을 구하여라.`,
        solution: `차이 삼차식이 중근을 가질 때이므로 도함수의 두 근에서 절편매개변수를 구해 곱하면 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeIntegralIdentityProduct(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "두 번 미분하는 지수형 적분항등식"),
    build(random) {
      return { parameters: { exponentRate: randomInteger(random, 1, 8), linearTerm: randomInteger(random, 1, 12) } };
    },
    solve({ exponentRate, linearTerm }) {
      return (exponentRate * linearTerm) ** 2;
    },
    crossCheck(parameters) {
      const a = parameters.linearTerm / parameters.exponentRate;
      const b = -a;
      const f = (x) => parameters.linearTerm * parameters.exponentRate * Math.exp(parameters.exponentRate * x);
      return Math.round(f(a) * f(b));
    },
    render(parameters, answer) {
      return {
        prompt: `연속함수 \\(f\\)와 실수 \\(a,b\\)가 \\(x\\int_0^xf(t)dt-\\int_0^xtf(t)dt=ae^{${parameters.exponentRate}x}-${parameters.linearTerm}x+b\\)를 만족한다. \\(f(a)f(b)\\)를 구하여라.`,
        solution: `x=0과 두 번의 미분으로 \\(a,b,f\\)를 정하면 지수항이 상쇄되어 곱은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function sumSquares(n) {
  return n * (n + 1) * (2 * n + 1) / 6;
}

function makeLogIntegralMaximumSum(sourceReferenceId) {
  const horizons = [3, 4, 7, 8, 11, 12, 15, 16];
  return {
    ...meta(sourceReferenceId, "로그치환으로 얻는 오목이차식 최댓값의 합"),
    build(random) {
      return { parameters: { horizon: pick(random, horizons) } };
    },
    solve({ horizon }) {
      return sumSquares(horizon) / 2;
    },
    crossCheck({ horizon }) {
      let sum = 0;
      for (let n = 1; n <= horizon; n += 1) {
        const u = n;
        sum += n * u - u * u / 2;
      }
      return sum;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f_n(x)=\\int_1^x\\frac{n-\\ln t}{t}dt\\;(x>0)\\), \\(g(n)=\\max_{x>0}f_n(x)\\)이다. \\(\\sum_{n=1}^{${parameters.horizon}}g(n)\\)을 구하여라.`,
        solution: `\\(u=\\ln x\\)이면 \\(f_n=nu-u^2/2\\), 따라서 \\(g(n)=n^2/2\\)이고 합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeInverseDerivativeIntegral(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "역함수 미분공식으로 계산하는 유리함수형 적분"),
    build(random) {
      const leftValue = randomInteger(random, 1, 5);
      const rightValue = randomInteger(random, leftValue + 1, 12);
      const coefficient = leftValue * rightValue * randomInteger(random, 1, 10);
      return { parameters: { leftX: 1, rightX: 5, leftValue, rightValue, coefficient } };
    },
    solve(parameters) {
      return parameters.coefficient * (1 / parameters.leftValue - 1 / parameters.rightValue);
    },
    crossCheck(parameters) {
      return parameters.coefficient * (parameters.rightValue - parameters.leftValue) / (parameters.leftValue * parameters.rightValue);
    },
    render(parameters, answer) {
      return {
        prompt: `미분가능한 일대일함수 \\(f\\)의 역함수를 \\(g\\)라 하고 \\(g(${parameters.leftValue})=${parameters.leftX}\\), \\(g(${parameters.rightValue})=${parameters.rightX}\\)이다. \\(\\int_${parameters.leftX}^${parameters.rightX}\\frac{${parameters.coefficient}}{g'(f(x))\\{f(x)\\}^2}dx\\)를 구하여라.`,
        solution: `\\(1/g'(f(x))=f'(x)\\)를 대입하면 \\(-${parameters.coefficient}/f(x)\\)의 정확미분이므로 값은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function integrateCubicAbsolute(cubicScale, absoluteScale, left, split, right) {
  const cubic = (a, b) => cubicScale * (b ** 4 - a ** 4) / 4;
  const absPart = absoluteScale * ((split - left) ** 2 + (right - split) ** 2) / 2;
  return cubic(left, right) + absPart;
}

function makeAbsolutePolynomialIntegrals(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "절댓값 분할이 필요한 두 다항적분의 차"),
    build(random) {
      const left = -randomInteger(random, 2, 6);
      const right = randomInteger(random, 1, 5);
      return { parameters: { cubicScale: randomInteger(random, 1, 6), absoluteScale: 2 * randomInteger(random, 1, 6), left, right, subLeft: left, subRight: -1 } };
    },
    solve(parameters) {
      const first = integrateCubicAbsolute(parameters.cubicScale, parameters.absoluteScale, parameters.left, 0, parameters.right);
      const second = integratePolynomial([parameters.cubicScale, 0, -parameters.absoluteScale, 0], parameters.subLeft, parameters.subRight);
      return first - second;
    },
    crossCheck(parameters) {
      const primitiveCubic = (x) => parameters.cubicScale * x ** 4 / 4;
      const first = primitiveCubic(parameters.right) - primitiveCubic(parameters.left) + parameters.absoluteScale * (parameters.left ** 2 + parameters.right ** 2) / 2;
      const second = integratePolynomial([parameters.cubicScale, 0, -parameters.absoluteScale, 0], parameters.subLeft, parameters.subRight);
      return first - second;
    },
    render(parameters, answer) {
      return {
        prompt: `\\(I_1=\\int_${parameters.left}^{${parameters.right}}(${parameters.cubicScale}x^3+${parameters.absoluteScale}|x|)dx\\), \\(I_2=\\int_${parameters.subLeft}^{${parameters.subRight}}(${parameters.cubicScale}x^3-${parameters.absoluteScale}x)dx\\)일 때 \\(I_1-I_2\\)를 구하여라.`,
        solution: `첫 적분을 0에서 나누고 두 다항식의 원시함수를 계산하면 차는 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeReflectedIntegralQuadratic(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "반사된 적분항등식으로 계수를 정하는 이차함수"),
    build(random) {
      const leading = 3 * randomInteger(random, 1, 5);
      const linear = randomInteger(random, -8, 12);
      const target = randomInteger(random, 2, 6);
      return { parameters: { leading, linear, cubicCoefficient: 2 * leading / 3, fAtOne: leading + linear, target } };
    },
    solve(parameters) {
      return parameters.leading * parameters.target ** 2 + parameters.linear * parameters.target;
    },
    crossCheck(parameters) {
      const left = (x) => parameters.leading * x ** 3 / 3 + parameters.linear * x ** 2 / 2;
      const x = 2.3;
      if (Math.abs(left(x) - (parameters.cubicCoefficient * x ** 3 + left(-x))) > 1e-9) throw new Error("reflected integral identity mismatch");
      return parameters.leading * parameters.target ** 2 + parameters.linear * parameters.target;
    },
    render(parameters, answer) {
      return {
        prompt: `최고차항 계수가 ${parameters.leading}인 이차함수 \\(f\\)가 \\(\\int_0^xf(t)dt=${parameters.cubicCoefficient}x^3+\\int_0^{-x}f(t)dt\\), \\(f(1)=${parameters.fAtOne}\\)을 만족한다. \\(f(${parameters.target})\\)를 구하여라.`,
        solution: `양변의 홀수·짝수 계수를 비교하고 \\(f(1)\\)을 사용하면 목표값은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeNonnegativeSineZeros(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "전구간 비음수인 사인함수의 영점 개수"),
    build(random) {
      const amplitude = randomInteger(random, 1, 20);
      const frequency = randomInteger(random, 1, 12);
      return { parameters: { amplitude, frequency, verticalConstant: 2 * amplitude } };
    },
    solve({ amplitude, frequency }) {
      return amplitude + frequency;
    },
    crossCheck(parameters) {
      let zeros = 0;
      for (let index = 0; index < parameters.frequency; index += 1) zeros += 1;
      if (zeros !== parameters.frequency) throw new Error("sine minimum count mismatch");
      return parameters.verticalConstant / 2 + zeros;
    },
    render(parameters, answer) {
      return {
        prompt: `자연수 \\(a,b\\)에 대해 \\(f(x)=a\\sin(bx)+${parameters.verticalConstant}-a\\)가 모든 실수에서 0 이상이고 \\([0,2\\pi)\\)의 영점 개수가 ${parameters.frequency}개이다. \\(a+b\\)를 구하여라.`,
        solution: `최솟값이 0이므로 \\(a=${parameters.amplitude}\\)이고 사인의 최솟점 개수에서 \\(b=${parameters.frequency}\\)이므로 답은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeInjectivePiecewise(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "두 가지의 치역을 분리해 일대일성을 만드는 조각함수"),
    build(random) {
      const join = randomInteger(random, 3, 9);
      const gap = randomInteger(random, 1, 4);
      const leftFloor = randomInteger(random, 1, 8);
      const vertexHeight = leftFloor + gap ** 2;
      return { parameters: { join, gap, leftFloor, vertexHeight } };
    },
    solve({ join, gap }) {
      return join - gap;
    },
    crossCheck(parameters) {
      const maximumA = parameters.join - Math.sqrt(parameters.vertexHeight - parameters.leftFloor);
      return Math.floor(maximumA);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(f(x)=\\sqrt{${parameters.join}-x}+${parameters.leftFloor}\\;(x<${parameters.join})\\), \\(f(x)=-(x-a)^2+${parameters.vertexHeight}\\;(x\\ge${parameters.join})\\)이다. \\(f\\)가 일대일이 되게 하는 정수 \\(a\\)의 최댓값을 구하여라.`,
        solution: `오른쪽 가지가 단조이고 두 가지의 치역이 겹치지 않게 하는 경계값을 적용하면 \\(a=${answer}\\)이다.`,
      };
    },
  };
}

function makeQuadraticDiscontinuities(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "유리함수 불연속점과 근에서의 극한으로 정하는 이차함수"),
    build(random) {
      const firstRoot = randomInteger(random, 1, 5);
      const secondRoot = firstRoot + randomInteger(random, 1, 5);
      const leading = randomInteger(random, 1, 8);
      const target = secondRoot + randomInteger(random, 1, 5);
      return { parameters: { firstRoot, secondRoot, limit: leading * (secondRoot - firstRoot), leading, target } };
    },
    solve(parameters) {
      return parameters.leading * (parameters.target - parameters.firstRoot) * (parameters.target - parameters.secondRoot);
    },
    crossCheck(parameters) {
      const recoveredLeading = parameters.limit / (parameters.secondRoot - parameters.firstRoot);
      return recoveredLeading * (parameters.target - parameters.firstRoot) * (parameters.target - parameters.secondRoot);
    },
    render(parameters, answer) {
      return {
        prompt: `이차함수 \\(f\\)에 대해 \\(x/f(x)\\)가 \\(x=${parameters.firstRoot},${parameters.secondRoot}\\)에서 불연속이고 \\(\\lim_{x\\to${parameters.secondRoot}}f(x)/(x-${parameters.secondRoot})=${parameters.limit}\\)이다. \\(f(${parameters.target})\\)를 구하여라.`,
        solution: `두 불연속점이 이차함수의 근이고 극한이 최고차항 계수를 정하므로 값은 \\(${answer}\\)이다.`,
      };
    },
  };
}

function makeWeightedReciprocalLogs(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "로그비와 역수로그의 정수가중합"),
    build(random) {
      const first = randomInteger(random, 1, 5);
      const second = first + randomInteger(random, 1, 5);
      const leftMultiplier = randomInteger(random, 1, 8);
      const rightMultiplier = randomInteger(random, 1, 8);
      return { parameters: { first, second, leftWeight: leftMultiplier * first, rightWeight: rightMultiplier * second, leftMultiplier, rightMultiplier } };
    },
    solve(parameters) {
      return parameters.leftMultiplier * parameters.second + parameters.rightMultiplier * parameters.first;
    },
    crossCheck(parameters) {
      const logAB = parameters.second / parameters.first;
      const logBA = parameters.first / parameters.second;
      return Math.round(parameters.leftWeight * logAB + parameters.rightWeight * logBA);
    },
    render(parameters, answer) {
      return {
        prompt: `\\(a,b,c>1\\), \\(\\log_ca:\\log_cb=${parameters.first}:${parameters.second}\\)일 때 \\(${parameters.leftWeight}\\log_ab+${parameters.rightWeight}\\log_ba\\)를 구하여라.`,
        solution: `두 로그를 각각 \\(${parameters.second}/${parameters.first}\\), \\(${parameters.first}/${parameters.second}\\)로 바꾸면 가중합은 \\(${answer}\\)이다.`,
      };
    },
  };
}

const wave2Batch2Definitions = [
  makeTrigCommonIntersection("2025-05-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q20"),
  makeLinearVelocityDistance("2020-05-EDUCATION_OFFICE-NA-Q26"),
  makeRiemannQuadraticArea("2016-07-EDUCATION_OFFICE-NA-Q28"),
  makeInverseAreaIdentity("2017-03-EDUCATION_OFFICE-GA-Q28"),
  makeHorizontalDoubleRootCubic("2019-10-EDUCATION_OFFICE-NA-Q27"),
  makeCentroidIntersectionLimit("2016-03-EDUCATION_OFFICE-NA-Q26"),
  makeFiniteBijectionInverse("2018-10-EDUCATION_OFFICE-NA-Q28"),
  makeCubicAsymptoticExtrema("2021-03-EDUCATION_OFFICE-CALCULUS-Q30"),
  makeExponentialCurveIntersection("2024-10-EDUCATION_OFFICE-CALCULUS-Q29"),
  makeHarmonicSequence("2024-09-KICE-CALCULUS-Q29"),
  makeLogProductCancellation("2019-10-EDUCATION_OFFICE-NA-Q23"),
  makeCubicSecantParameter("2020-06-KICE-NA-Q26"),
  makeIntegerSineLevels("2018-04-EDUCATION_OFFICE-GA-Q24"),
  makeTrigIntersectionTriangle("2024-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q19"),
  makeTangentIntercept("2020-06-KICE-NA-Q24"),
  makeCubicLineDoubleIntersection("2019-09-KICE-NA-Q27"),
  makeIntegralIdentityProduct("2018-03-EDUCATION_OFFICE-GA-Q27"),
  makeLogIntegralMaximumSum("2018-04-EDUCATION_OFFICE-GA-Q27"),
  makeInverseDerivativeIntegral("2019-04-EDUCATION_OFFICE-GA-Q27"),
  makeAbsolutePolynomialIntegrals("2022-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q17"),
  makeReflectedIntegralQuadratic("2024-05-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18"),
  makeNonnegativeSineZeros("2023-06-KICE-PROBABILITY_STATISTICS-Q19"),
  makeInjectivePiecewise("2017-04-EDUCATION_OFFICE-NA-Q26"),
  makeQuadraticDiscontinuities("2018-06-KICE-NA-Q28"),
  makeWeightedReciprocalLogs("2016-07-EDUCATION_OFFICE-NA-Q24"),
];

module.exports = { wave2Batch2Definitions };
