"use strict";

const {
  pick,
  randomInteger,
  rational,
  rationalAdd,
  rationalMul,
  rationalSub,
} = require("./core");

function rationalTex(value) {
  return value.d === 1n
    ? String(value.n)
    : `\\frac{${value.n}}{${value.d}}`;
}

function polynomialTex(terms) {
  const rendered = [];
  for (const [coefficient, symbol] of terms) {
    if (coefficient.n === 0n) continue;
    const negative = coefficient.n < 0n;
    const absolute = rational(negative ? -coefficient.n : coefficient.n, coefficient.d);
    const magnitude = absolute.n === absolute.d && symbol ? "" : rationalTex(absolute);
    const body = `${magnitude}${symbol}` || "0";
    if (rendered.length === 0) rendered.push(`${negative ? "-" : ""}${body}`);
    else rendered.push(`${negative ? "-" : "+"}${body}`);
  }
  return rendered.join("") || "0";
}

function equalVelocityDistanceAnswer(parameters) {
  const distance = rational(
    Math.abs(parameters.leadingDifference) * parameters.equalTime ** 3,
    6
  );
  const scaled = rationalMul(rational(parameters.answerScale), distance);
  if (scaled.d !== 1n) throw new Error("scaled point distance is not integral");
  return Number(scaled.n);
}

function simpson(fn, lower, upper, segments = 120) {
  const count = segments % 2 === 0 ? segments : segments + 1;
  const width = (upper - lower) / count;
  let sum = fn(lower) + fn(upper);
  for (let index = 1; index < count; index += 1) {
    sum += (index % 2 === 0 ? 2 : 4) * fn(lower + index * width);
  }
  return (sum * width) / 3;
}

function equalVelocityDistanceCrossCheck(parameters) {
  const differenceVelocity = (t) =>
    parameters.leadingDifference * t ** 2 -
    parameters.leadingDifference * parameters.equalTime * t;
  const equalityResidual = differenceVelocity(parameters.equalTime);
  if (Math.abs(equalityResidual) > 1e-12) throw new Error("velocities do not meet");
  const signedDistance = simpson(differenceVelocity, 0, parameters.equalTime);
  return Math.round(parameters.answerScale * Math.abs(signedDistance));
}

function velocityParameterAnswer(parameters) {
  const numerator =
    (parameters.cubicVelocityCoefficient * parameters.observationTime ** 3) / 3 +
    (parameters.linearVelocityCoefficient * parameters.observationTime ** 2) / 2 -
    parameters.observedPosition;
  const value = numerator / parameters.observationTime;
  if (!Number.isInteger(value)) throw new Error("velocity parameter is not integral");
  return value;
}

function velocityParameterCrossCheck(parameters) {
  const candidate = velocityParameterAnswer(parameters);
  const position = simpson(
    (t) =>
      parameters.cubicVelocityCoefficient * t ** 2 +
      parameters.linearVelocityCoefficient * t -
      candidate,
    0,
    parameters.observationTime
  );
  if (Math.abs(position - parameters.observedPosition) > 1e-8) {
    throw new Error("position integral residual is nonzero");
  }
  return candidate;
}

function implicitTangentAnswer(parameters) {
  return 1 + parameters.power / parameters.exponentCoefficient;
}

function implicitTangentCrossCheck(parameters) {
  const a = 1;
  const y = 0;
  const residual = a ** parameters.power - y ** parameters.power - Math.exp(
    parameters.exponentCoefficient * a * y
  );
  if (Math.abs(residual) > 1e-12) throw new Error("declared implicit point is invalid");
  const fx = parameters.power * a ** (parameters.power - 1) -
    parameters.exponentCoefficient * y * Math.exp(parameters.exponentCoefficient * a * y);
  const fy = -parameters.power * y ** (parameters.power - 1) -
    parameters.exponentCoefficient * a * Math.exp(parameters.exponentCoefficient * a * y);
  const slope = -fx / fy;
  return Math.round(a + slope);
}

function shiftedCubicMinimumAnswer(parameters) {
  return parameters.maximumValue - 2 * parameters.criticalPoint ** 3;
}

function shiftedCubicMinimumCrossCheck(parameters) {
  const f = (x) =>
    x ** 3 - 3 * parameters.criticalPoint ** 2 * x + parameters.maximumValue;
  const candidates = [0, parameters.intervalEnd, parameters.criticalPoint];
  const values = candidates.map(f);
  const maximum = Math.max(...values);
  const minimum = Math.min(...values);
  if (maximum !== parameters.maximumValue) throw new Error("given maximum is inconsistent");
  return minimum;
}

function directionChangeAccelerationAnswer(parameters) {
  return (
    parameters.velocityScale *
    (parameters.directionChangeTime - parameters.touchTime) ** 2
  );
}

function positionCoefficients(parameters) {
  const scale = parameters.velocityScale;
  const r = parameters.touchTime;
  const s = parameters.directionChangeTime;
  return {
    fourth: rational(scale, 4),
    third: rational(-scale * (2 * r + s), 3),
    second: rational(scale * (r ** 2 + 2 * r * s), 2),
    first: rational(-scale * r ** 2 * s),
  };
}

function directionChangeAccelerationCrossCheck(parameters) {
  const r = parameters.touchTime;
  const s = parameters.directionChangeTime;
  const scale = parameters.velocityScale;
  const velocity = (t) => scale * (t - r) ** 2 * (t - s);
  const epsilon = 1e-5;
  if (velocity(s - epsilon) * velocity(s + epsilon) >= 0) {
    throw new Error("velocity does not change sign at the declared time");
  }
  if (velocity(r - epsilon) * velocity(r + epsilon) < 0) {
    throw new Error("double root incorrectly changes direction");
  }
  const acceleration =
    scale * (s - r) ** 2 + 2 * scale * (s - r) * (s - s);
  return acceleration;
}

function parabolaAreaAnswer(parameters) {
  const scaled = rational(
    parameters.areaScale * parameters.parabolaMagnitude * parameters.axisIntercept ** 3,
    3
  );
  if (scaled.d !== 1n) throw new Error("scaled parabolic area is not integral");
  return Number(scaled.n);
}

function parabolaAreaCrossCheck(parameters) {
  const area = simpson(
    (x) => parameters.parabolaMagnitude * (x - parameters.axisIntercept) ** 2,
    0,
    parameters.axisIntercept
  );
  return Math.round(parameters.areaScale * area);
}

function averageRateAnswer(parameters) {
  return (
    parameters.lowerX ** 2 +
    parameters.lowerX * parameters.upperX +
    parameters.upperX ** 2
  );
}

function averageRateCrossCheck(parameters) {
  const target = averageRateAnswer(parameters);
  const a = Math.sqrt(target / 3);
  const f = (x) => x ** 3 + a * x;
  const average =
    (f(parameters.upperX) - f(parameters.lowerX)) /
    (parameters.upperX - parameters.lowerX);
  const derivativeAtA = 3 * a ** 2 + a;
  if (Math.abs(average - derivativeAtA) > 1e-9) {
    throw new Error("average and instantaneous rates differ");
  }
  return Math.round(3 * a ** 2);
}

const calculusExpansionDefinitions = [
  {
    id: "ARENA_PDF_EXPANSION_EQUAL_VELOCITY_DISTANCE",
    sourceReferenceId: "2018-09-KICE-NA-Q28",
    canonicalStructureId: "STR-C1INTAREA-MOVING-BOUNDARY-AREA-DISTANCE-OR-LENGTH-B1-NONE-D7E15543",
    title: "두 점의 속도가 다시 같아지는 순간의 거리",
    courseId: "calculus-1",
    build(random) {
      const leadingDifference = randomInteger(random, 1, 5);
      const equalTime = randomInteger(random, 1, 7);
      const secondLeading = randomInteger(random, 1, 5);
      const secondLinear = randomInteger(random, 1, 10);
      return {
        parameters: {
          leadingDifference,
          equalTime,
          firstLeading: secondLeading + leadingDifference,
          secondLeading,
          firstLinear: secondLinear - leadingDifference * equalTime,
          secondLinear,
          answerScale: pick(random, [6, 12, 18]),
        },
      };
    },
    solve: equalVelocityDistanceAnswer,
    crossCheck: equalVelocityDistanceCrossCheck,
    degeneracyReasons(parameters, answer) {
      return answer > 999 ? ["answer overflow"] : [];
    },
    render(parameters) {
      return {
        prompt: `시각 \\(t=0\\)에 원점을 동시에 출발하여 수직선 위를 움직이는 두 점 \\(P,Q\\)의 속도가 각각 \\(v_P(t)=${parameters.firstLeading}t^2${parameters.firstLinear < 0 ? "" : "+"}${parameters.firstLinear}t\\), \\(v_Q(t)=${parameters.secondLeading}t^2+${parameters.secondLinear}t\\)이다. 출발 후 두 속도가 다시 같아지는 순간 두 점 사이의 거리를 \\(d\\)라 할 때 \\(${parameters.answerScale}d\\)를 구하여라.`,
        solution: "두 속도의 차가 0이 되는 양의 시각을 구하고, 그때까지 속도 차를 적분한 값의 절댓값을 취한다.",
      };
    },
  },
  {
    id: "ARENA_PDF_EXPANSION_VELOCITY_PARAMETER_FROM_POSITION",
    sourceReferenceId: "2022-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18",
    canonicalStructureId: "STR-C1INTAREA-MOVING-BOUNDARY-AREA-SCALAR-VALUE-B0-NONE-78215D96",
    title: "속도식과 특정 시각의 위치로 상수 복원",
    courseId: "calculus-1",
    build(random) {
      const observationTime = pick(random, [2, 3, 4, 6, 8]);
      const cubicVelocityCoefficient = randomInteger(random, 1, 6);
      const linearVelocityCoefficient = randomInteger(random, 1, 10);
      const desiredParameter = randomInteger(random, 1, 60);
      const observedPosition =
        (cubicVelocityCoefficient * observationTime ** 3) / 3 +
        (linearVelocityCoefficient * observationTime ** 2) / 2 -
        desiredParameter * observationTime;
      return {
        parameters: {
          observationTime,
          cubicVelocityCoefficient,
          linearVelocityCoefficient,
          observedPosition,
        },
      };
    },
    solve: velocityParameterAnswer,
    crossCheck: velocityParameterCrossCheck,
    render(parameters) {
      return {
        prompt: `시각 \\(t=0\\)에 원점을 출발하여 수직선 위를 움직이는 점 \\(P\\)의 속도가 \\(v(t)=${parameters.cubicVelocityCoefficient}t^2+${parameters.linearVelocityCoefficient}t-a\\)이다. 시각 \\(t=${parameters.observationTime}\\)에서 점 \\(P\\)의 위치가 \\(${parameters.observedPosition}\\)일 때 상수 \\(a\\)를 구하여라.`,
        solution: "초기 위치가 0이므로 속도를 0부터 주어진 시각까지 적분한 값을 위치와 같게 놓는다.",
      };
    },
  },
  {
    id: "ARENA_PDF_EXPANSION_IMPLICIT_TANGENT_SLOPE",
    sourceReferenceId: "2020-06-KICE-GA-Q25",
    canonicalStructureId: "STR-C1TANEXT-COMMON-OR-MOVING-TANGENT-SLOPE-B0-NONE-C8B84F27",
    title: "음함수 곡선의 축 위 점과 접선 기울기",
    courseId: "calculus-1",
    build(random) {
      const power = randomInteger(random, 2, 12);
      const divisors = Array.from({ length: power }, (_, index) => index + 1).filter(
        (value) => power % value === 0
      );
      return {
        parameters: {
          power,
          exponentCoefficient: pick(random, divisors),
        },
      };
    },
    solve: implicitTangentAnswer,
    crossCheck: implicitTangentCrossCheck,
    render(parameters) {
      return {
        prompt: `곡선 \\(x^{${parameters.power}}-y^{${parameters.power}}=e^{${parameters.exponentCoefficient}xy}\\) 위의 점 \\((a,0)\\)에서 접선의 기울기가 \\(b\\)일 때 \\(a+b\\)를 구하여라.`,
        solution: "먼저 축 위의 점 조건에서 실수 좌표를 구하고, 양변을 x에 대하여 음함수 미분하여 그 점의 기울기를 계산한다.",
      };
    },
  },
  {
    id: "ARENA_PDF_EXPANSION_CUBIC_EXTREMUM_BACKSOLVE",
    sourceReferenceId: "2026-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q19",
    canonicalStructureId: "STR-C1TANEXT-EXTREMUM-VALUE-BACKSOLVE-MAX-MIN-COMBINATION-B0-NONE-EF0D3D65",
    title: "닫힌구간 삼차함수의 최댓값에서 최솟값 복원",
    courseId: "calculus-1",
    build(random) {
      const criticalPoint = randomInteger(random, 2, 8);
      const maximumEnd = Math.floor(Math.sqrt(3) * criticalPoint);
      const intervalEnd = randomInteger(random, criticalPoint + 1, maximumEnd);
      const minimumValue = randomInteger(random, 1, 120);
      return {
        parameters: {
          criticalPoint,
          intervalEnd,
          maximumValue: minimumValue + 2 * criticalPoint ** 3,
        },
      };
    },
    solve: shiftedCubicMinimumAnswer,
    crossCheck: shiftedCubicMinimumCrossCheck,
    render(parameters) {
      return {
        prompt: `닫힌구간 \\([0,${parameters.intervalEnd}]\\)에서 정의된 함수 \\(f(x)=x^3-${3 * parameters.criticalPoint ** 2}x+k\\)의 최댓값이 \\(${parameters.maximumValue}\\)일 때 최솟값을 구하여라.`,
        solution: "도함수의 영점과 양 끝점에서 함수값을 비교하여 최댓값 조건으로 k를 정한 뒤 최솟값을 계산한다.",
      };
    },
  },
  {
    id: "ARENA_PDF_EXPANSION_DIRECTION_CHANGE_ACCELERATION",
    sourceReferenceId: "2023-05-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q19",
    canonicalStructureId: "STR-C1MOTION-DIRECTION-CHANGE-TIME-SPEED-OR-ACCELERATION-B0-NONE-39BB5B70",
    title: "중근이 있는 속도에서 방향 전환 순간의 가속도",
    courseId: "calculus-1",
    build(random) {
      const touchTime = randomInteger(random, 1, 4);
      return {
        parameters: {
          touchTime,
          directionChangeTime: touchTime + randomInteger(random, 1, 4),
          velocityScale: randomInteger(random, 2, 9),
        },
      };
    },
    solve: directionChangeAccelerationAnswer,
    crossCheck: directionChangeAccelerationCrossCheck,
    render(parameters) {
      const coefficients = positionCoefficients(parameters);
      const expression = polynomialTex([
        [coefficients.fourth, "t^4"],
        [coefficients.third, "t^3"],
        [coefficients.second, "t^2"],
        [coefficients.first, "t"],
      ]);
      return {
        prompt: `수직선 위를 움직이는 점 \\(P\\)의 시각 \\(t>0\\)에서의 위치가 \\(x(t)=${expression}\\)이다. 점 \\(P\\)의 운동 방향이 바뀌는 순간의 가속도를 구하여라.`,
        solution: "위치를 미분해 속도를 인수분해하고, 부호가 실제로 바뀌는 단순근에서 속도를 한 번 더 미분한다.",
      };
    },
  },
  {
    id: "ARENA_PDF_EXPANSION_PARABOLA_AXES_AREA",
    sourceReferenceId: "2022-04-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q17",
    canonicalStructureId: "STR-C1INTAREA-AREA-BETWEEN-CURVES-AREA-B0-NONE-F65ED970",
    title: "좌표축과 접하는 포물선 사이의 넓이",
    courseId: "calculus-1",
    build(random) {
      return {
        parameters: {
          parabolaMagnitude: randomInteger(random, 1, 5),
          axisIntercept: randomInteger(random, 1, 7),
          areaScale: 3 * randomInteger(random, 1, 8),
        },
      };
    },
    solve: parabolaAreaAnswer,
    crossCheck: parabolaAreaCrossCheck,
    degeneracyReasons(parameters, answer) {
      return answer > 999 ? ["answer overflow"] : [];
    },
    render(parameters) {
      return {
        prompt: `곡선 \\(y=-${parameters.parabolaMagnitude}(x-${parameters.axisIntercept})^2\\)과 \\(x\\)축 및 \\(y\\)축으로 둘러싸인 부분의 넓이를 \\(S\\)라 할 때 \\(${parameters.areaScale}S\\)의 값을 구하여라.`,
        solution: "0부터 x축과 만나는 점까지 곡선과 x축 사이의 높이 차를 적분한다.",
      };
    },
  },
  {
    id: "ARENA_PDF_EXPANSION_AVERAGE_INSTANTANEOUS_RATE",
    sourceReferenceId: "2021-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18",
    canonicalStructureId: "STR-C1DER-INSTANTANEOUS-RATE-SCALAR-VALUE-B0-NONE-DC3574FF",
    title: "평균변화율과 특정 점의 순간변화율 일치",
    courseId: "calculus-1",
    build(random) {
      const lowerX = randomInteger(random, 0, 8);
      return {
        parameters: {
          lowerX,
          upperX: lowerX + randomInteger(random, 1, 7),
        },
      };
    },
    solve: averageRateAnswer,
    crossCheck: averageRateCrossCheck,
    render(parameters) {
      return {
        prompt: `함수 \\(f(x)=x^3+ax\\)에서 \\(x\\)가 \\(${parameters.lowerX}\\)에서 \\(${parameters.upperX}\\)까지 변할 때의 평균변화율이 \\(f'(a)\\)와 같도록 하는 양수 \\(a\\)에 대하여 \\(3a^2\\)의 값을 구하여라.`,
        solution: "삼차식의 차를 인수분해해 평균변화율을 구하고 f'(a)와 같게 두면 a에 관한 항이 소거된다.",
      };
    },
  },
];

module.exports = {
  calculusExpansionDefinitions,
};
