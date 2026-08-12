"use strict";

const {
  pick,
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
} = require("./core");

function rationalTex(value) {
  return value.d === 1n
    ? String(value.n)
    : `\\frac{${value.n}}{${value.d}}`;
}

function evaluateMonicQuadraticCubic({ cubic, quadratic, linear, constant }, x) {
  return rationalAdd(
    rationalAdd(rationalMul(cubic, rationalPow(x, 3)), rationalMul(quadratic, rationalPow(x, 2))),
    rationalAdd(rationalMul(linear, x), constant)
  );
}

function inverseCompositeAnswer(parameters) {
  const argument = rationalAdd(parameters.cubicCoefficient, parameters.linearCoefficient);
  const value = evaluateMonicQuadraticCubic(
    {
      cubic: parameters.cubicCoefficient,
      quadratic: rational(1),
      linear: parameters.linearCoefficient,
      constant: rational(parameters.joinLength),
    },
    argument
  );
  return positiveNumeratorDenominatorSum(value);
}

function inverseCompositeCrossCheck(parameters) {
  const r = rational(parameters.rootScale);
  const join = rational(parameters.joinLength);
  const derivedLinear = {
    n: BigInt(parameters.rootScale ** 2 + 3 * parameters.joinLength),
    d: BigInt(4 * parameters.rootScale),
  };
  const derivedCubic = {
    n: BigInt(3 * parameters.rootScale ** 2 + parameters.joinLength),
    d: BigInt(4 * parameters.rootScale ** 3),
  };
  const normalizedLinear = rational(derivedLinear.n, derivedLinear.d);
  const normalizedCubic = rational(derivedCubic.n, derivedCubic.d);
  if (
    rationalText(normalizedLinear) !== rationalText(parameters.linearCoefficient) ||
    rationalText(normalizedCubic) !== rationalText(parameters.cubicCoefficient)
  ) {
    throw new Error("join equations do not recover the generated coefficients");
  }
  const gAtNegativeRoot = evaluateMonicQuadraticCubic(
    {
      cubic: normalizedCubic,
      quadratic: rational(1),
      linear: normalizedLinear,
      constant: join,
    },
    rational(-parameters.rootScale)
  );
  if (gAtNegativeRoot.n !== 0n) throw new Error("left inverse join is invalid");
  const derivativeAtNegativeRoot = rationalAdd(
    rationalAdd(
      rationalMul(rational(3), rationalMul(normalizedCubic, rationalPow(r, 2))),
      rational(-2 * parameters.rootScale)
    ),
    normalizedLinear
  );
  if (
    rationalText(derivativeAtNegativeRoot) !==
    rationalText(rationalMul(rational(2), normalizedLinear))
  ) {
    throw new Error("one-sided derivative join is invalid");
  }
  const argument = rationalAdd(normalizedCubic, normalizedLinear);
  const hornerValue = rationalAdd(
    rationalMul(
      rationalAdd(
        rationalMul(
          rationalAdd(rationalMul(normalizedCubic, argument), rational(1)),
          argument
        ),
        normalizedLinear
      ),
      argument
    ),
    join
  );
  return positiveNumeratorDenominatorSum(hornerValue);
}

function commonTangentAnswer(parameters) {
  return (
    parameters.baseVerticalShift -
    4 * parameters.cubicLeadingCoefficient * parameters.knownTangencyX ** 3
  );
}

function commonTangentCrossCheck(parameters) {
  const secondTangencyX = -parameters.knownTangencyX;
  const slopeAtFirst =
    3 * parameters.cubicLeadingCoefficient * parameters.knownTangencyX ** 2;
  const slopeAtSecond =
    3 * parameters.cubicLeadingCoefficient * secondTangencyX ** 2;
  if (slopeAtFirst !== slopeAtSecond) throw new Error("tangent slopes differ");
  const firstIntercept =
    parameters.baseVerticalShift -
    2 * parameters.cubicLeadingCoefficient * parameters.knownTangencyX ** 3;
  const recoveredShift =
    firstIntercept + 2 * parameters.cubicLeadingCoefficient * secondTangencyX ** 3;
  return recoveredShift;
}

function expLogEP(parameters) {
  const ratio = BigInt(parameters.valueRatio);
  return rational(2n * ratio * ratio, (ratio - 1n) * (ratio - 1n));
}

function expLogAnswer(parameters) {
  const value = rationalMul(
    rational(parameters.answerScale),
    rationalMul(parameters.kernelOffset, expLogEP(parameters))
  );
  if (value.d !== 1n) throw new Error("scaled exp-log answer is not integral");
  return Number(value.n);
}

function expLogCrossCheck(parameters) {
  const offset = rationalNumber(parameters.kernelOffset);
  const ratio = parameters.valueRatio;
  const extremumLocation = Math.log(1 + offset);
  const derivativeResidual = Math.log(Math.exp(extremumLocation) - offset);
  if (Math.abs(derivativeResidual) > 1e-12) {
    throw new Error("extremum derivative residual is nonzero");
  }
  const p = Math.log((2 * ratio ** 2) / (ratio - 1) ** 2);
  return Math.round(parameters.answerScale * offset * Math.exp(p));
}

function thresholdG(parameters, t) {
  const normalized =
    t / (parameters.quadraticMagnitude * parameters.windowLength);
  if (normalized < 1) {
    return (
      (parameters.windowLength * (1 - Math.sqrt(2 * normalized - 1))) / 2
    );
  }
  return (parameters.windowLength * (normalized - 1)) / 2;
}

function thresholdNormalizedIntegral(parameters) {
  const lower = parameters.normalizedLowerBound;
  const upper = parameters.normalizedUpperBound;
  const lowPart = rationalSub(lower, rationalPow(lower, 2));
  const shiftedUpper = rationalSub(upper, rational(2));
  const highPart = rationalMul(
    rational(1, 3),
    rationalAdd(rationalPow(shiftedUpper, 3), rational(1))
  );
  return rationalAdd(lowPart, highPart);
}

function thresholdAnswer(parameters) {
  const integral = rationalMul(
    rational(parameters.quadraticMagnitude ** 3 * parameters.windowLength),
    thresholdNormalizedIntegral(parameters)
  );
  const result = rationalMul(rational(parameters.answerScale), integral);
  if (result.d !== 1n) throw new Error("scaled threshold integral is not integral");
  return Number(result.n);
}

function simpson(fn, lower, upper, segmentCount = 240) {
  const evenCount = segmentCount % 2 === 0 ? segmentCount : segmentCount + 1;
  const width = (upper - lower) / evenCount;
  let sum = fn(lower) + fn(upper);
  for (let index = 1; index < evenCount; index += 1) {
    sum += (index % 2 === 0 ? 2 : 4) * fn(lower + index * width);
  }
  return (sum * width) / 3;
}

function thresholdCrossCheck(parameters) {
  const scaleT = parameters.quadraticMagnitude * parameters.windowLength;
  const lower = scaleT * rationalNumber(parameters.normalizedLowerBound);
  const split = scaleT;
  const upper = scaleT * rationalNumber(parameters.normalizedUpperBound);
  const integrand = (t) => {
    const g = thresholdG(parameters, t);
    return (
      2 * parameters.quadraticMagnitude * g / parameters.windowLength -
      parameters.quadraticMagnitude
    ) ** 2;
  };
  const numeric =
    simpson(integrand, lower, split) + simpson(integrand, split, upper);
  return Math.round(parameters.answerScale * numeric);
}

function absoluteTangentH(parameters, x) {
  const value = typeof x === "number" ? rational(x) : x;
  const k = rational(parameters.horizontalTangencyRoot);
  const a = parameters.cubicLeadingCoefficient;
  const halfKSquare = rational(parameters.horizontalTangencyRoot ** 2, 2);
  const polynomialFactor = rationalAdd(
    rationalSub(rationalPow(value, 2), rationalMul(rational(2), rationalMul(k, value))),
    halfKSquare
  );
  const f = rationalMul(a, rationalMul(value, polynomialFactor));
  const tangent = rationalMul(parameters.originTangentSlope, value);
  const absoluteF = rational(f.n < 0n ? -f.n : f.n, f.d);
  return rationalAdd(absoluteF, tangent);
}

function absoluteTangentAnswer(parameters) {
  const atK = absoluteTangentH(parameters, parameters.horizontalTangencyRoot);
  const atNearRoot = absoluteTangentH(parameters, parameters.evaluationX);
  const result = rationalMul(
    rational(parameters.horizontalTangencyRoot),
    rationalSub(atK, atNearRoot)
  );
  if (result.d !== 1n) throw new Error("absolute tangent target is not integral");
  return Number(result.n);
}

function absoluteTangentCrossCheck(parameters) {
  const expected = (parameters.largestRoot - 1) ** 2;
  const calibration = absoluteTangentH(parameters, parameters.calibrationX);
  if (rationalText(calibration) !== rationalText(parameters.calibrationValue)) {
    throw new Error("calibration point does not match");
  }
  const atLargestRoot = absoluteTangentH(parameters, parameters.largestRoot);
  if (atLargestRoot.n !== 0n) throw new Error("declared largest root is not a root");
  return expected;
}

const calculusDefinitions = [
  {
    id: "ARENA_PDF_PILOT_INVERSE_COMPOSITE_BRIDGE",
    sourceReferenceId: "2021-07-EDUCATION_OFFICE-CALCULUS-Q29",
    canonicalStructureId: "STR-C1TRDER-INVERSE-COMPOSITE-DIFFERENTIATION-SCALAR-VALUE-B0-NONE-22BF5E70",
    title: "역함수 합성과 삼각 브리지의 미분가능성 매칭",
    courseId: "calculus-1",
    build(random) {
      const [rootScale, joinLength] = pick(random, [
        [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [2, 4], [2, 20],
      ]);
      const cubicCoefficient = rational(
        3 * rootScale ** 2 + joinLength,
        4 * rootScale ** 3
      );
      const linearCoefficient = rational(
        rootScale ** 2 + 3 * joinLength,
        4 * rootScale
      );
      return {
        parameters: {
          rootScale,
          joinLength,
          cubicCoefficient,
          linearCoefficient,
          bridgeDerivativeScale: rational(rootScale ** 2, 1),
        },
      };
    },
    solve: inverseCompositeAnswer,
    crossCheck: inverseCompositeCrossCheck,
    degeneracyReasons(parameters) {
      const discriminant = rationalSub(
        rational(4),
        rationalMul(
          rational(12),
          rationalMul(parameters.cubicCoefficient, parameters.linearCoefficient)
        )
      );
      return discriminant.n >= 0n ? ["inverse cubic is not globally increasing"] : [];
    },
    render(parameters) {
      const r = parameters.rootScale;
      const d = parameters.joinLength;
      const a = rationalTex(parameters.cubicCoefficient);
      const b = rationalTex(parameters.linearCoefficient);
      const amplitude = rationalTex(
        rationalDiv(rational(d * r ** 2), parameters.linearCoefficient)
      );
      const outerLinearTerm = r ** 2 === 1 ? "x" : `${r ** 2}x`;
      return {
        prompt: `\\(f(x)=x^3-${outerLinearTerm}\\)이고, 역함수가 존재하는 삼차함수 \\(g(x)=ax^3+x^2+bx+${d}\\)가 있다. \\(g\\)의 역함수를 \\(g^{-1}\\)이라 할 때, \\(x<0\\) 또는 \\(x>${d}\\)에서 \\(h(x)=(f\\circ g^{-1})(x)\\), \\(0\\le x\\le ${d}\\)에서 \\(h(x)=\\frac{${amplitude}}{\\pi}\\sin\\frac{\\pi x}{${d}}\\)로 정의한다. \\(h\\)가 실수 전체에서 미분가능할 때 \\(g(a+b)=p/q\\)라 하자. \\(p,q\\)가 서로소인 자연수일 때 \\(p+q\\)를 구하여라.`,
        solution: `양 끝점의 연속성과 미분계수를 맞추면 \\(a=${a},\\ b=${b}\\)가 된다. 이를 \\(g(a+b)\\)에 대입해 기약분수의 분자와 분모를 더한다.`,
      };
    },
  },
  {
    id: "ARENA_PDF_PILOT_COMMON_CUBIC_TANGENT",
    sourceReferenceId: "2023-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q19",
    canonicalStructureId: "STR-C1TANEXT-COMMON-OR-MOVING-TANGENT-SCALAR-VALUE-B0-NONE-9FE76009",
    title: "수직이동한 삼차곡선 사이의 공통접선 복원",
    courseId: "calculus-1",
    build(random) {
      return {
        parameters: {
          cubicLeadingCoefficient: randomInteger(random, 1, 3),
          baseVerticalShift: randomInteger(random, -8, 4),
          knownTangencyX: -randomInteger(random, 1, 4),
        },
      };
    },
    solve: commonTangentAnswer,
    crossCheck: commonTangentCrossCheck,
    degeneracyReasons(parameters, answer) {
      return [
        ...(answer <= 0 ? ["unknown vertical shift is not positive"] : []),
        ...(answer === parameters.baseVerticalShift ? ["two curves coincide"] : []),
      ];
    },
    render(parameters) {
      const coefficient = parameters.cubicLeadingCoefficient === 1
        ? ""
        : String(parameters.cubicLeadingCoefficient);
      const base = parameters.baseVerticalShift >= 0
        ? `+${parameters.baseVerticalShift}`
        : String(parameters.baseVerticalShift);
      return {
        prompt: `곡선 \\(y=${coefficient}x^3${base}\\) 위의 \\(x=${parameters.knownTangencyX}\\)인 점에서의 접선과 곡선 \\(y=${coefficient}x^3+k\\) 위의 한 점에서의 접선이 일치한다. 양수 \\(k\\)의 값을 구하여라.`,
        solution: "두 접점의 미분계수를 같게 하면 두 x좌표는 서로 반대이고, 접선의 y절편을 같게 하여 수직이동량을 결정한다.",
      };
    },
  },
  {
    id: "ARENA_PDF_PILOT_ABSOLUTE_EXP_LOG_INTEGRAL",
    sourceReferenceId: "2024-07-EDUCATION_OFFICE-CALCULUS-Q30",
    canonicalStructureId: "STR-C1TRINT-ABSOLUTE-EXP-LOG-INTEGRAL-EXTREMUM-SCALAR-VALUE-B0-NONE-4579A109",
    title: "절댓값 지수·로그 적분함수의 극값과 적분 역산",
    courseId: "calculus-1",
    build(random) {
      const kernelOffset = pick(random, [
        rational(1, 3),
        rational(1, 2),
        rational(2, 3),
        rational(3, 4),
      ]);
      const valueRatio = randomInteger(random, 3, 8);
      const product = rationalMul(kernelOffset, expLogEP({ valueRatio }));
      const denominator = Number(product.d);
      const minimumFactor = Math.max(1, Math.ceil(10 / denominator));
      const factor = minimumFactor * randomInteger(random, 1, 3);
      return {
        parameters: {
          kernelOffset,
          valueRatio,
          answerScale: denominator * factor,
        },
      };
    },
    solve: expLogAnswer,
    crossCheck: expLogCrossCheck,
    render(parameters) {
      const offset = rationalText(parameters.kernelOffset);
      const location = rationalText(
        rationalAdd(rational(1), parameters.kernelOffset)
      );
      return {
        prompt: `\\(0<a<1\\)이고 \\(f(x)=\\int_0^x\\ln(e^{|t|}-a)\\,dt\\)라 하자. \\(f\\)는 \\(x=\\ln(${location})\\)에서 극값을 가지며, 어떤 상수 \\(k\\)에 대하여 \\(f(-\\ln(${location}))=f(k)/${parameters.valueRatio}\\)이다. \\(\\int_0^k\\frac{|f'(x)|}{f(x)-f(-k)}\\,dx=p\\)일 때, \\(${parameters.answerScale}ae^p\\)의 값을 구하여라.`,
        solution: `극값 조건에서 \\(a=${offset}\\)이다. \\(f\\)는 홀함수이고 극솟값을 \\(m\\)이라 두면 \\(f(k)=-${parameters.valueRatio}m\\)이다. 극값에서 적분을 나누어 로그로 치환하면 \\(e^p=2R^2/(R-1)^2\\), \\(R=${parameters.valueRatio}\\)가 된다.`,
      };
    },
  },
  {
    id: "ARENA_PDF_PILOT_INTERVAL_EXTREMA_THRESHOLD",
    sourceReferenceId: "2020-07-EDUCATION_OFFICE-NA-Q30",
    canonicalStructureId: "STR-C1INTDEF-INTERVAL-EXTREMA-THRESHOLD-INTEGRAL-INTEGRAL-VALUE-B0-NONE-67DA61E2",
    title: "구간별 극값 임계함수의 적분",
    courseId: "calculus-1",
    build(random) {
      const quadraticMagnitude = randomInteger(random, 2, 5);
      const windowLength = randomInteger(random, 1, 2);
      const normalizedLowerBound = pick(random, [rational(2, 3), rational(3, 4), rational(4, 5)]);
      const normalizedUpperBound = pick(random, [rational(5, 4), rational(4, 3), rational(3, 2)]);
      const rawIntegral = rationalMul(
        rational(quadraticMagnitude ** 3 * windowLength),
        thresholdNormalizedIntegral({ normalizedLowerBound, normalizedUpperBound })
      );
      const denominator = Number(rawIntegral.d);
      const factor = randomInteger(random, 1, 3);
      return {
        parameters: {
          quadraticMagnitude,
          windowLength,
          normalizedLowerBound,
          normalizedUpperBound,
          answerScale: denominator * factor,
        },
      };
    },
    solve: thresholdAnswer,
    crossCheck: thresholdCrossCheck,
    render(parameters) {
      const A = parameters.quadraticMagnitude;
      const w = parameters.windowLength;
      const lower = rationalText(
        rationalMul(rational(A * w), parameters.normalizedLowerBound)
      );
      const upper = rationalText(
        rationalMul(rational(A * w), parameters.normalizedUpperBound)
      );
      return {
        prompt: `\\(t\\ge ${A * w}(2-\\sqrt2)\\)에서 \\(f_t(x)=${A}x^2+tx\\ (x<0)\\), \\(f_t(x)=-${A}x^2+tx\\ (x\\ge0)\\)라 하자. \\([k-${w},k]\\)에서 \\(f_t\\)가 \\(x=k\\)에서 최댓값을 갖고 \\([k,k+${w}]\\)에서 \\(x=k+${w}\\)에서 최솟값을 갖게 하는 실수 \\(k\\)의 최솟값을 \\(g(t)\\)라 한다. \\(${parameters.answerScale}\\int_{${lower}}^{${upper}}\\{\\frac{2\\cdot${A}}{${w}}g(t)-${A}\\}^2dt\\)의 값을 구하여라.`,
        solution: "두 포물선 조각의 꼭짓점과 구간 끝값을 비교하면 g(t)는 제곱근 가지와 일차 가지로 나뉜다. 분기점에서 적분을 나누면 제곱근이 사라져 유리식 적분이 된다.",
      };
    },
  },
  {
    id: "ARENA_PDF_PILOT_ABSOLUTE_TANGENT_ROOT",
    sourceReferenceId: "2022-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q22",
    canonicalStructureId: "STR-C1TANEXT-ABSOLUTE-TANGENT-ROOT-RECOVERY-SCALAR-VALUE-B1-NONE-8E3C7A19",
    title: "절댓값 삼차함수의 접선·실근 조건 복원",
    courseId: "calculus-1",
    build(random) {
      const largestRoot = 2 * randomInteger(random, 3, 10);
      const horizontalTangencyRoot = largestRoot / 2;
      const cubicLeadingCoefficient = rational(-1, horizontalTangencyRoot);
      const originTangentSlope = rational(-horizontalTangencyRoot, 2);
      const calibrationX = rational(horizontalTangencyRoot, 2);
      const calibrationValue = rational(-(horizontalTangencyRoot ** 2), 8);
      return {
        parameters: {
          largestRoot,
          horizontalTangencyRoot,
          cubicLeadingCoefficient,
          originTangentSlope,
          calibrationX,
          calibrationValue,
          evaluationX: largestRoot - 1,
        },
      };
    },
    solve: absoluteTangentAnswer,
    crossCheck: absoluteTangentCrossCheck,
    render(parameters) {
      return {
        prompt: `삼차함수 \\(f\\)의 그래프가 원점을 지나고, 원점에서의 접선을 \\(y=g(x)\\)라 하자. \\(h(x)=|f(x)|+g(x)\\)라 할 때, \\(h\\)는 \\((k,0)\\), \\(k\\ne0\\)에서 접선 \\(y=0\\)을 가지며 \\(h(x)=0\\)의 가장 큰 실근은 \\(${parameters.largestRoot}\\)이다. 또한 \\(h(${rationalTex(parameters.calibrationX)})=${rationalTex(parameters.calibrationValue)}\\)이다. \\(k\\{h(k)-h(${parameters.evaluationX})\\}\\)의 값을 구하여라.`,
        solution: "두 절댓값 부호 가지를 각각 인수분해하면 가장 큰 근은 2k가 된다. 원점 접선과 보정값으로 삼차항 계수를 정한 뒤 두 함수값을 계산한다.",
      };
    },
  },
];

module.exports = {
  absoluteTangentAnswer,
  absoluteTangentCrossCheck,
  calculusDefinitions,
  commonTangentAnswer,
  commonTangentCrossCheck,
  expLogAnswer,
  expLogCrossCheck,
  inverseCompositeAnswer,
  inverseCompositeCrossCheck,
  thresholdAnswer,
  thresholdCrossCheck,
};
