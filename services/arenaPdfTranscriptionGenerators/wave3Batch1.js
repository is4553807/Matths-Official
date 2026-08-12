"use strict";

const {
  factorial,
  pick,
  randomInteger,
} = require("../arenaPdfPilotGenerators/core");

function meta(sourceReferenceId, title) {
  return {
    id: `ARENA_PDF_TX_${sourceReferenceId.replaceAll("-", "_")}`,
    sourceReferenceId,
    title,
  };
}

function visual(visualContract, model) {
  return {
    kind: "geometry",
    renderContractVersion: "ARENA_PDF_VISUAL_V1",
    visualContract,
    presentedInProblem: true,
    sourceRole: "PROBLEM_STEM",
    showGrid: model.showGrid !== false,
    showAxes: model.showAxes !== false,
    ...model,
  };
}

function sampledPoints(evaluate, start, end, count = 80) {
  return Array.from({ length: count + 1 }, (_, index) => {
    const x = start + ((end - start) * index) / count;
    return { x, y: evaluate(x) };
  });
}

function integerGcd(left, right) {
  let a = Math.abs(Math.round(left));
  let b = Math.abs(Math.round(right));
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function combinations(values, size) {
  const result = [];
  const chosen = [];
  function visit(start) {
    if (chosen.length === size) {
      result.push([...chosen]);
      return;
    }
    for (let index = start; index < values.length; index += 1) {
      chosen.push(values[index]);
      visit(index + 1);
      chosen.pop();
    }
  }
  visit(0);
  return result;
}

function halfStepTeX(value) {
  const doubled = Math.round(Number(value) * 2);
  return doubled % 2 === 0 ? String(doubled / 2) : `\\frac{${doubled}}{2}`;
}

function scaledTeX(multiplier, expression) {
  return Number(multiplier) === 1 ? expression : `${multiplier}(${expression})`;
}

function ratioTeX(numerator, denominator) {
  const divisor = integerGcd(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;
  return reducedDenominator === 1
    ? String(reducedNumerator)
    : `\\frac{${reducedNumerator}}{${reducedDenominator}}`;
}

function makeLatticeTriangleCount(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "접선과 두 직선이 만드는 삼각형의 격자점 누적"),
    build(random) {
      return {
        parameters: {
          upperIndex: randomInteger(random, 3, 10),
          diagramIndex: randomInteger(random, 1, 6),
        },
      };
    },
    solve({ upperIndex }) {
      const sum1 = (upperIndex * (upperIndex + 1)) / 2;
      const sum2 = (upperIndex * (upperIndex + 1) * (2 * upperIndex + 1)) / 6;
      return (3 * sum2 + 5 * sum1 + 2 * upperIndex) / 2;
    },
    crossCheck({ upperIndex }) {
      let total = 0;
      for (let n = 1; n <= upperIndex; n += 1) {
        for (let x = -n; x <= 0; x += 1) {
          const lower = -2 * (x + n);
          const upper = x + n;
          for (let y = lower; y <= upper; y += 1) total += 1;
        }
      }
      return total;
    },
    render(parameters, answer) {
      const n = Math.min(parameters.diagramIndex, parameters.upperIndex);
      return {
        prompt: `다음 그림은 자연수 \\(n\\)에 대하여 원 \\(x^2+y^2=n^2/2\\)와 기울기가 1인 양의 \\(y\\)절편 접선, 그리고 그 \\(x\\)절편을 지나며 기울기가 -2인 직선을 나타낸 것이다. 세 직선의 교점이 만드는 삼각형과 그 내부에서 두 좌표가 모두 정수인 점의 개수를 \\(a_n\\)이라 할 때 \\(\\sum_{n=1}^{${parameters.upperIndex}}a_n\\)을 구하여라.`,
        solution: `세 꼭짓점은 \\((-n,0),(0,n),(0,-2n)\\)이다. 각 세로 격자 단면을 세거나 픽의 정리를 적용해 누적하면 답은 \\(${answer}\\)이다.`,
        visualization: visual("GEO", {
          equalScale: true,
          xRange: [-1.35 * n, 0.9 * n],
          yRange: [-2.35 * n, 1.35 * n],
          xAxisLabel: "x",
          yAxisLabel: "y",
          points: [
            { x: -n, y: 0, label: `A_${n}`, mathTex: `A_{${n}}` },
            { x: 0, y: n, label: `B_${n}`, mathTex: `B_{${n}}` },
            { x: 0, y: -2 * n, label: `C_${n}`, mathTex: `C_{${n}}` },
            { x: 0, y: 0, label: "O", mathTex: "O" },
          ],
          segments: [
            { from: `A_${n}`, to: `B_${n}` },
            { from: `A_${n}`, to: `C_${n}` },
            { from: `B_${n}`, to: `C_${n}` },
          ],
          circles: [{ cx: 0, cy: 0, radius: n / Math.SQRT2, color: "#2563eb" }],
          note: `n=${n}인 경우의 구조를 나타낸 그림`,
        }),
      };
    },
  };
}

function staircasePosition(distance) {
  const segment = Math.floor(distance + 1e-10);
  const remainder = distance - segment;
  const level = Math.floor(segment / 2);
  return segment % 2 === 0
    ? { x: level + remainder, y: level }
    : { x: level + 1, y: level + remainder };
}

function makeStaircaseDiagonalHit(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "교대 계단 경로와 대각선의 순서 있는 교점"),
    build(random) {
      return {
        parameters: {
          denominator: randomInteger(random, 2, 10),
          ordinal: randomInteger(random, 1, 6),
        },
      };
    },
    solve({ ordinal }) {
      return 2 * ordinal ** 2;
    },
    crossCheck(parameters) {
      let found = 0;
      for (let n = 1; n <= 2 * parameters.denominator * parameters.ordinal; n += 1) {
        const point = staircasePosition(n ** 2 / parameters.denominator ** 2);
        if (Math.abs(point.x - point.y) < 1e-9) {
          found += 1;
          if (found === parameters.ordinal) return Math.round(point.x);
        }
      }
      throw new Error("diagonal staircase hit was not found");
    },
    render(parameters, answer) {
      const target = answer;
      const path = [{ x: 0, y: 0 }];
      for (let level = 0; level <= target; level += 1) {
        path.push({ x: level + 1, y: level });
        path.push({ x: level + 1, y: level + 1 });
      }
      return {
        prompt: `다음 그림처럼 원점에서 출발하여 길이가 1인 수평선분과 수직선분을 번갈아 따라가는 경로가 있다. \\(A_0\\)은 원점이고, \\(A_{n-1}\\)에서 \\(A_n\\)까지 경로를 따라 이동한 거리가 \\((2n-1)/${parameters.denominator ** 2}\\)이다. \\(y=x\\) 위의 \\(A_n\\)을 원점에서 가까운 순서로 나열할 때 ${parameters.ordinal}번째 점의 \\(x\\)좌표를 구하여라.`,
        solution: `원점에서 \\(A_n\\)까지 누적 경로 길이는 \\(n^2/${parameters.denominator ** 2}\\)이다. 대각선과 만나는 계단 꼭짓점을 순서대로 찾으면 답은 \\(${answer}\\)이다.`,
        visualization: visual("GEO+GRAPH", {
          xRange: [-0.5, target + 1.5],
          yRange: [-0.5, target + 1.5],
          polylines: [
            { points: path, color: "#111827", width: 2.4 },
            { points: [{ x: 0, y: 0 }, { x: target + 1, y: target + 1 }], color: "#7c3aed", dashed: true },
          ],
          points: [{ x: target, y: target, label: `제${parameters.ordinal}교점`, color: "#dc2626" }],
          texts: [{ x: target * 0.78, y: target * 0.84, text: "y=x", mathTex: "y=x", color: "#7c3aed", dashed: true, placement: "legend" }],
        }),
      };
    },
  };
}

function makeEpigraphSquareDerivative(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "절댓값 지수그래프 위 정사각형 중심의 최소높이"),
    build(random) {
      return { parameters: { highBase: randomInteger(random, 4, 9) } };
    },
    solve({ highBase }) {
      return 26 + 9 * highBase;
    },
    crossCheck({ highBase }) {
      const numerator = 17 + 9 * highBase;
      const denominator = 9;
      const divisor = integerGcd(numerator, denominator);
      return numerator / divisor + denominator / divisor;
    },
    render(parameters, answer) {
      const side = Math.log(2);
      const left = Math.log(4 / 3);
      const bottom = 2 / 3;
      const xmax = Math.log(parameters.highBase) + 0.7;
      return {
        prompt: `다음 그래프가 나타내는 영역 \\(D=\\{(x,y):x\\ge0,\\ y\\ge|e^x-2|\\}\\) 안에 네 꼭짓점이 놓이고 한 변이 \\(x\\)축과 평행한 한 변의 길이 \\(t\\)인 정사각형을 생각하자. 대각선 교점의 최소 \\(y\\)좌표를 \\(f(t)\\)라 할 때 \\(f'(\\ln2)+f'(\\ln${parameters.highBase})=q/p\\)이다. 서로소인 자연수 \\(p,q\\)에 대하여 \\(p+q\\)를 구하여라.`,
        solution: `아래 두 꼭짓점에서 \\(|e^x-2|\\)의 큰 값을 최소화한다. \\(t=\\ln2\\)에서는 양쪽 접촉, \\(t=\\ln${parameters.highBase}\\)에서는 \\(x=0\\) 경계가 활성화되어 답은 \\(${answer}\\)이다.`,
        visualization: visual("GRAPH", {
          xRange: [-0.2, xmax],
          yRange: [-0.2, Math.max(3.4, parameters.highBase - 1)],
          polylines: [{
            points: sampledPoints((x) => Math.abs(Math.exp(x) - 2), 0, xmax, 100),
            color: "#111827",
            width: 3,
          }],
          rectangles: [{ x: left, y: bottom, width: side, height: side, stroke: "#2563eb", fill: "rgba(37,99,235,0.10)" }],
          texts: [
            { x: xmax * 0.72, y: Math.min(parameters.highBase - 1, 2.8), text: "y=|eˣ−2|", mathTex: "y=\\lvert e^x-2\\rvert", placement: "legend" },
            { x: left + side / 2, y: bottom + side / 2, text: "정사각형", color: "#2563eb" },
          ],
        }),
      };
    },
  };
}

function makeParabolaTrapezoidOptimization(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "포물선 아래 절편함수 사다리꼴의 넓이 최적화"),
    build(random) {
      return {
        parameters: {
          supportLength: randomInteger(random, 1, 6),
          targetMultiplier: randomInteger(random, 1, 20),
        },
      };
    },
    solve(parameters) {
      return 5 * parameters.supportLength * parameters.targetMultiplier;
    },
    crossCheck(parameters) {
      const length = parameters.supportLength;
      const a = length / 3;
      const b = (2 * length) / 3;
      const k = b;
      return Math.round(3 * parameters.targetMultiplier * (k + a + b));
    },
    render(parameters, answer) {
      const length = parameters.supportLength;
      const a = length / 3;
      const b = (2 * length) / 3;
      const k = b;
      return {
        prompt: `다음 그래프와 같이 \\(f(x)=0\\ (x\\le0),\\ f(x)=x\\ (x>0)\\), \\(g(x)=x(${length}-x)\\ (0\\le x\\le${length})\\)이고 그 밖에서는 \\(g(x)=0\\)이다. \\(0<a<b<${length}\\), \\(k>0\\)에 대하여 \\(h(x)=k\\{f(x)-f(x-a)-f(x-b)+f(x-${length})\\}\\)라 하자. \\(0\\le h(x)\\le g(x)\\)이고 \\(\\int_0^{${length}}(g-h)dx\\)가 최소일 때 \\(${3 * parameters.targetMultiplier}(k+a+b)\\)를 구하여라.`,
        solution: `그래프 밖에서 \\(h=0\\)이므로 \\(a+b=${length}\\)이고, 포물선과의 접촉에서 \\(k=b\\)이다. \\(kab\\)를 최대화하면 \\(a=\\frac{${length}}{3},b=\\frac{${2 * length}}{3}\\)이므로 답은 \\(${answer}\\)이다.`,
        visualization: visual("GRAPH", {
          xRange: [-0.2, length + 0.2],
          yRange: [-0.2, length ** 2 / 4 + 0.5],
          polylines: [
            { points: sampledPoints((x) => x * (length - x), 0, length, 100), color: "#111827", width: 3 },
            { points: [{ x: 0, y: 0 }, { x: a, y: k * a }, { x: b, y: k * a }, { x: length, y: 0 }], color: "#2563eb", width: 3 },
          ],
          texts: [
            { x: length * 0.52, y: length ** 2 / 4 + 0.18, text: "y=g(x)", mathTex: "y=g(x)", placement: "legend" },
            { x: length * 0.5, y: k * a - 0.12, text: "y=h(x)", mathTex: "y=h(x)", color: "#2563eb", placement: "legend" },
          ],
        }),
      };
    },
  };
}

function makePeriodicTrigInverseBranch(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "주기적 역함수 가지와 정적분의 교대합"),
    build(random) {
      return {
        parameters: {
          targetMultiplier: randomInteger(random, 1, 50),
          plottedPeriods: randomInteger(random, 3, 6),
        },
      };
    },
    solve({ targetMultiplier }) {
      return 12 * targetMultiplier;
    },
    crossCheck(parameters) {
      const p = -19 / 3;
      const q = 17 / 3;
      return Math.round(parameters.targetMultiplier * (q - p));
    },
    render(parameters, answer) {
      const end = parameters.plottedPeriods * 2 * Math.PI;
      return {
        prompt: `다음 그래프의 함수는 \\(f(x)=a\\sin^3x+b\\sin x\\)이고 \\(f(\\pi/4)=3\\sqrt2,\\ f(\\pi/3)=5\\sqrt3\\)이다. \\(1<t<14\\)에서 \\(f(x_n)=t\\)인 양의 해를 순서대로 나열하고 \\(c_n=\\int_{3\\sqrt2}^{5\\sqrt3}t/f'(x_n)\\,dt\\)라 하자. \\(\\sum_{n=1}^{101}c_n=p+q\\sqrt2\\)일 때 \\(${scaledTeX(parameters.targetMultiplier, "q-p")}\\)를 구하여라.`,
        solution: `조건에서 \\(a=16,b=-2\\)이다. 주기와 대칭에 의해 \\(c_1+c_2=\\cdots=c_{99}+c_{100}=0\\)이고 역함수 적분으로 \\(q-p=12\\)를 얻으므로 답은 \\(${answer}\\)이다.`,
        visualization: visual("GRAPH", {
          xRange: [-0.2, end],
          yRange: [-15, 15],
          xAxisLabel: "x",
          yAxisLabel: "f(x)",
          polylines: [{
            points: sampledPoints((x) => 16 * Math.sin(x) ** 3 - 2 * Math.sin(x), 0, end, 360),
            color: "#111827",
            width: 2.5,
          }],
          lines: [],
          texts: [{ x: end * 0.72, y: 12, text: "y=16sin³x−2sinx", mathTex: "y=16\\sin^3x-2\\sin x", width: 230, placement: "legend" }],
        }),
      };
    },
  };
}

function cubicBranch(x) {
  return x ** 3 - 9 * x ** 2 + 24 * x - 17;
}

function piecewiseCubicRational(x) {
  return x < 1 ? (3 * x - 9) / (x - 1) : cubicBranch(x);
}

function makePiecewiseIntersectionComposition(sourceReferenceId) {
  const inputs = [0, -1, -2];
  return {
    ...meta(sourceReferenceId, "수평선 교점 개수로 복원한 조각함수의 합성값"),
    build(random) {
      return { parameters: { input: pick(random, inputs) } };
    },
    solve({ input }) {
      const inner = 3 + 6 / (1 - input);
      return cubicBranch(inner);
    },
    crossCheck({ input }) {
      return piecewiseCubicRational(piecewiseCubicRational(input));
    },
    render(parameters, answer) {
      return {
        prompt: `다음 그래프의 함수는 \\(f\\)가 최고차항 계수 1인 삼차함수이고 \\(f(2)=3\\)일 때 \\(g(x)=(ax-9)/(x-1)\\ (x<1),\\ g(x)=f(x)\\ (x\\ge1)\\)이다. \\(y=g(x)\\)와 \\(y=t\\)가 서로 다른 두 점에서만 만나는 \\(t\\)의 집합이 \\(\\{-1\\}\\cup[3,\\infty)\\)일 때 \\((g\\circ g)(${parameters.input})\\)을 구하여라.`,
        solution: `왼쪽 가지의 치역과 오른쪽 삼차함수의 극값을 맞추면 \\(a=3\\), \\(f(x)=x^3-9x^2+24x-17\\)이다. 합성하면 답은 \\(${answer}\\)이다.`,
        visualization: visual("GRAPH", {
          xRange: [-3.2, 6.3],
          yRange: [-3, 24],
          polylines: [
            { points: sampledPoints((x) => (3 * x - 9) / (x - 1), -3, 0.82, 100), color: "#2563eb", width: 3 },
            { points: sampledPoints(cubicBranch, 1, 6.1, 140), color: "#111827", width: 3 },
          ],
          points: [
            { x: 2, y: 3, label: "(2,3)", mathTex: "(2,3)" },
            { x: 4, y: -1, label: "극솟값 −1" },
          ],
          texts: [
            { x: -1.2, y: 7.5, text: "유리함수 가지", color: "#2563eb", placement: "legend" },
            { x: 5.2, y: 7, text: "삼차함수 가지", placement: "legend" },
          ],
        }),
      };
    },
  };
}

function makeDistanceEnvelopeNondifferentiability(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "두 점까지 거리제곱의 하포락선 미분불능점"),
    build(random) {
      return { parameters: { targetMultiplier: randomInteger(random, 1, 5) } };
    },
    solve({ targetMultiplier }) {
      return 186 * targetMultiplier;
    },
    crossCheck(parameters) {
      const p = -3 / 10 + 21 / 8;
      return Math.round(80 * parameters.targetMultiplier * p);
    },
    render(parameters, answer) {
      return {
        prompt: `다음 그래프의 \\(f(x)=x+1\\ (x<1),\\ f(x)=-2x+4\\ (x\\ge1)\\)와 두 점 \\(A=(-1,-1),B=(1,2)\\)를 생각하자. \\((x,f(x))\\)에서 두 점까지 거리의 제곱 중 작은 값을 \\(g(x)\\)라 하고, \\(g\\)가 미분가능하지 않은 모든 \\(x\\)좌표의 합을 \\(p\\)라 할 때 \\(${80 * parameters.targetMultiplier}p\\)를 구하여라.`,
        solution: `각 직선 가지에서 두 거리제곱을 비교하면 하포락선의 전환점은 \\(-3/10,21/8\\)이고 \\(x=1\\)에서는 미분계수가 이어진다. 따라서 답은 \\(${answer}\\)이다.`,
        visualization: visual("GRAPH", {
          xRange: [-2.2, 3.4],
          yRange: [-2.2, 3.4],
          polylines: [{
            points: [{ x: -2, y: -1 }, { x: 1, y: 2 }, { x: 3.2, y: -2.4 }],
            color: "#111827",
            width: 3,
          }],
          points: [
            { x: -1, y: -1, label: "A", mathTex: "A", showGuides: true },
            { x: 1, y: 2, label: "B", mathTex: "B", showGuides: true },
          ],
          texts: [{ x: 2.15, y: 0.2, text: "y=f(x)", mathTex: "y=f(x)", placement: "legend" }],
        }),
      };
    },
  };
}

function makeParameterRegionExtremum(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "유리함수 조건이 만드는 매개변수 영역의 거리 최댓값"),
    build(random) {
      return { parameters: { targetMultiplier: randomInteger(random, 1, 6) } };
    },
    solve({ targetMultiplier }) {
      return 153 * targetMultiplier;
    },
    crossCheck(parameters) {
      const maximum = (9 / 10) ** 2 + (3 / 2) ** 2;
      return Math.round(50 * parameters.targetMultiplier * maximum);
    },
    render(parameters, answer) {
      return {
        prompt: `다음 그림은 \\((a,b)\\)평면의 조건 영역 \\(R\\)이다. \\(f(x)=ax+b\\), \\(g(x)=1/(ax+b-2)+3\\), \\(a\\ne0\\)이고, \\(x>0\\)이면 \\(1<g(x)<3\\)이며 \\(y=f(x)\\)와 \\(y=1/(x-2)+3\\)이 제4사분면에서 만나지 않는다. \\(M=\\max_{(a,b)\\in R}(a^2+b^2)\\)일 때 \\(${50 * parameters.targetMultiplier}M\\)을 구하여라.`,
        solution: `조건을 정리하면 \\(-9/10\\le a<0\\), \\(-5a/3\\le b\\le3/2\\)이고 최대점은 \\((-9/10,3/2)\\)이다. 따라서 답은 \\(${answer}\\)이다.`,
        visualization: visual("GRAPH", {
          xRange: [-1.15, 0.25],
          yRange: [-0.2, 1.8],
          xAxisLabel: "a",
          yAxisLabel: "b",
          polygons: [{
            points: [{ x: -0.9, y: 1.5 }, { x: 0, y: 1.5 }, { x: 0, y: 0 }],
            fill: "rgba(37,99,235,0.16)",
            stroke: "#2563eb",
          }],
          points: [{ x: -0.9, y: 1.5, label: "최대 후보", color: "#dc2626" }],
          texts: [{ x: -0.28, y: 1.18, text: "R", mathTex: "R", color: "#2563eb", size: 18 }],
        }),
      };
    },
  };
}

const LOCKERS = Object.freeze([
  { id: "L11", x: 1, y: 1 }, { id: "L21", x: 2, y: 1 }, { id: "L31", x: 3, y: 1 },
  { id: "L12", x: 1, y: 2 }, { id: "L22", x: 2, y: 2 },
  { id: "L13", x: 1, y: 3 }, { id: "L23", x: 2, y: 3 },
]);

function oppositeAdjacent(left, right) {
  return left.y === right.y && Math.abs(left.x - right.x) === 1;
}

function lockerCountByGenderSubsets(maleCount, femaleCount) {
  let patterns = 0;
  for (const male of combinations(LOCKERS, maleCount)) {
    const maleIds = new Set(male.map((item) => item.id));
    const remaining = LOCKERS.filter((item) => !maleIds.has(item.id));
    for (const female of combinations(remaining, femaleCount)) {
      if (male.some((boy) => female.some((girl) => oppositeAdjacent(boy, girl)))) continue;
      patterns += 1;
    }
  }
  return patterns * factorial(maleCount) * factorial(femaleCount);
}

function lockerCountByLabeledAssignments(maleCount, femaleCount) {
  const actors = [
    ...Array.from({ length: maleCount }, (_, index) => ({ id: `B${index + 1}`, gender: "M" })),
    ...Array.from({ length: femaleCount }, (_, index) => ({ id: `G${index + 1}`, gender: "F" })),
  ];
  let count = 0;
  const assigned = [];
  function visit(index, available) {
    if (index === actors.length) {
      count += 1;
      return;
    }
    for (const locker of available) {
      const actor = actors[index];
      const conflicts = assigned.some((item) =>
        item.actor.gender !== actor.gender && oppositeAdjacent(item.locker, locker)
      );
      if (conflicts) continue;
      assigned.push({ actor, locker });
      visit(index + 1, available.filter((item) => item.id !== locker.id));
      assigned.pop();
    }
  }
  visit(0, LOCKERS);
  return count;
}

function makeLockerAssignment(sourceReferenceId) {
  const cases = [[1, 1], [2, 1], [1, 2], [2, 2], [3, 1], [1, 3], [3, 2]];
  return {
    ...meta(sourceReferenceId, "층별 사물함 배치와 이성 인접 금지"),
    build(random) {
      const [maleCount, femaleCount] = pick(random, cases);
      return { parameters: { maleCount, femaleCount } };
    },
    solve(parameters) {
      return lockerCountByGenderSubsets(parameters.maleCount, parameters.femaleCount);
    },
    crossCheck(parameters) {
      return lockerCountByLabeledAssignments(parameters.maleCount, parameters.femaleCount);
    },
    render(parameters, answer) {
      return {
        prompt: `다음 그림과 같은 7개의 사물함 중 ${parameters.maleCount + parameters.femaleCount}개를 골라 서로 다른 남학생 ${parameters.maleCount}명과 서로 다른 여학생 ${parameters.femaleCount}명에게 하나씩 배정한다. 같은 층에서 남학생 사물함과 여학생 사물함이 서로 이웃하지 않도록 배정하는 경우의 수를 구하여라.`,
        solution: `층과 열 좌표로 사물함을 나타내고 성별 배치 모양을 먼저 센 뒤 남학생과 여학생의 순열을 곱한다. 답은 \\(${answer}\\)이다.`,
        visualization: visual("LAYOUT", {
          showAxes: false,
          showGrid: false,
          xRange: [0, 4.2],
          yRange: [0.45, 3.65],
          rectangles: LOCKERS.map((locker) => ({ x: locker.x - 0.43, y: locker.y - 0.38, width: 0.86, height: 0.76, rx: 3, fill: "#f8fafc" })),
          texts: [
            ...LOCKERS.map((locker) => ({ x: locker.x, y: locker.y, text: locker.id, mathTex: `L_{${locker.id.slice(1)}}`, size: 11, color: "#475569", width: 80 })),
            { x: 0.25, y: 1, text: "1층" },
            { x: 0.25, y: 2, text: "2층" },
            { x: 0.25, y: 3, text: "3층" },
          ],
        }),
      };
    },
  };
}

function makeAbsoluteLogChordDistance(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "절댓값 로그그래프의 등거리 수평현"),
    build(random) {
      return {
        parameters: {
          heightFactorHalf: randomInteger(random, 1, 3),
          targetMultiplier: randomInteger(random, 1, 10),
        },
      };
    },
    solve(parameters) {
      return parameters.targetMultiplier * (4 ** parameters.heightFactorHalf - 1);
    },
    crossCheck(parameters) {
      const k = 1 / Math.SQRT2;
      const a = Math.pow(Math.SQRT2, 1 / k);
      const height = 2 * parameters.heightFactorHalf * k;
      const distance = a ** height - a ** (-height);
      const scale = 2 ** parameters.heightFactorHalf * parameters.targetMultiplier;
      return Math.round(scale * distance);
    },
    render(parameters, answer) {
      const k = 1 / Math.SQRT2;
      const a = Math.pow(Math.SQRT2, 1 / k);
      const height = 2 * parameters.heightFactorHalf * k;
      const left = a ** (-height);
      const right = a ** height;
      const xmax = right + 0.8;
      return {
        prompt: `다음 그래프에서 \\(a>1\\), \\(y=|\\log_a x|\\)와 \\(y=k\\ (k>0)\\)의 두 교점을 \\(A,B\\), \\(y=k\\)와 \\(y\\)축의 교점을 \\(C\\)라 하자. \\(OC=CA=AB\\)이고, \\(y=${2 * parameters.heightFactorHalf}k\\)와 곡선의 두 교점 사이 거리가 \\(d\\)일 때 \\(${2 ** parameters.heightFactorHalf * parameters.targetMultiplier}d\\)를 구하여라.`,
        solution: `\\(a^{-k}=k\\), \\(a^k-a^{-k}=k\\)에서 \\(a^k=\\sqrt2\\)이다. 높이 \\(${2 * parameters.heightFactorHalf}k\\)의 두 가로좌표 차를 계산하면 답은 \\(${answer}\\)이다.`,
        visualization: visual("GRAPH", {
          xRange: [-0.15, xmax],
          yRange: [-0.15, Math.max(height + 0.6, 2.2)],
          polylines: [{
            points: sampledPoints((x) => Math.abs(Math.log(x) / Math.log(a)), 0.04, xmax, 160),
            color: "#111827",
            width: 3,
          }],
          segments: [
            { from: { x: 0, y: k }, to: { x: Math.pow(a, k), y: k }, color: "#2563eb" },
            { from: { x: left, y: height }, to: { x: right, y: height }, color: "#7c3aed" },
          ],
          points: [
            { x: Math.pow(a, -k), y: k, label: "A", mathTex: "A" },
            { x: Math.pow(a, k), y: k, label: "B", mathTex: "B" },
            { x: 0, y: k, label: "C", mathTex: "C" },
            { x: left, y: height, label: "P", mathTex: "P" },
            { x: right, y: height, label: "Q", mathTex: "Q" },
          ],
        }),
      };
    },
  };
}

function makeLineSampledArithmeticSequence(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "직선의 정수 세로단면으로 정의한 등차수열 합"),
    build(random) {
      const firstTerm = randomInteger(random, 2, 20) / 2;
      const difference = randomInteger(random, 1, 8) / 2;
      const firstIndex = randomInteger(random, 2, 5);
      const secondIndex = randomInteger(random, firstIndex + 2, 10);
      const upperIndex = randomInteger(random, 10, 25);
      return { parameters: { firstTerm, difference, firstIndex, secondIndex, upperIndex } };
    },
    solve(parameters) {
      return parameters.upperIndex * (2 * parameters.firstTerm + (parameters.upperIndex - 1) * parameters.difference) / 2;
    },
    crossCheck(parameters) {
      let total = 0;
      for (let n = 1; n <= parameters.upperIndex; n += 1) {
        total += parameters.firstTerm + (n - 1) * parameters.difference;
      }
      return total;
    },
    render(parameters, answer) {
      const valueAt = (n) => parameters.firstTerm + (n - 1) * parameters.difference;
      return {
        prompt: `다음 그림과 같이 직선 \\(l\\)과 \\(x=n\\)의 교점의 \\(y\\)좌표를 \\(a_n\\)이라 하자. \\(a_${parameters.firstIndex}=${halfStepTeX(valueAt(parameters.firstIndex))}\\), \\(a_${parameters.secondIndex}=${halfStepTeX(valueAt(parameters.secondIndex))}\\)일 때 \\(\\sum_{k=1}^{${parameters.upperIndex}}a_k\\)를 구하여라.`,
        solution: `정수 간격의 세로선에서 읽은 높이는 등차수열이다. 두 항으로 첫째항과 공차를 정해 합 공식을 적용하면 답은 \\(${answer}\\)이다.`,
        visualization: visual("GEO+GRAPH", {
          xRange: [-0.5, parameters.upperIndex + 1],
          yRange: [-0.5, valueAt(parameters.upperIndex) + 4],
          polylines: [{ points: [{ x: 0, y: parameters.firstTerm - parameters.difference }, { x: parameters.upperIndex + 0.5, y: valueAt(parameters.upperIndex + 0.5) }], color: "#111827", width: 3 }],
          points: [
            { x: parameters.firstIndex, y: valueAt(parameters.firstIndex), label: `a_${parameters.firstIndex}`, mathTex: `a_{${parameters.firstIndex}}`, showGuides: true },
            { x: parameters.secondIndex, y: valueAt(parameters.secondIndex), label: `a_${parameters.secondIndex}`, mathTex: `a_{${parameters.secondIndex}}`, showGuides: true },
          ],
          texts: [{ x: parameters.upperIndex * 0.78, y: valueAt(parameters.upperIndex * 0.78) + 2, text: "l", mathTex: "\\ell" }],
        }),
      };
    },
  };
}

function makeTwoTangentsCircleAngle(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "두 접선의 기울기와 접점 반지름 사이각"),
    build(random) {
      const u = randomInteger(random, 1, 5);
      const v = randomInteger(random, 1, 5);
      const p = randomInteger(random, 1, 5);
      const q = randomInteger(random, 1, 5);
      const dot = u * p - v * q;
      const targetMultiplier = randomInteger(random, 1, 8);
      if (dot === 0 || dot ** 2 * targetMultiplier > 999) throw new Error("degenerate tangent directions");
      return { parameters: { u, v, p, q, dot, targetMultiplier } };
    },
    solve(parameters) {
      return parameters.dot ** 2 * parameters.targetMultiplier;
    },
    crossCheck(parameters) {
      const denominator = (parameters.u ** 2 + parameters.v ** 2) * (parameters.p ** 2 + parameters.q ** 2);
      const cosineSquared = parameters.dot ** 2 / denominator;
      return Math.round(denominator * parameters.targetMultiplier * cosineSquared);
    },
    render(parameters, answer) {
      const normA = Math.hypot(parameters.u, parameters.v);
      const normB = Math.hypot(parameters.p, parameters.q);
      const A = { x: parameters.u / normA, y: parameters.v / normA };
      const B = { x: parameters.p / normB, y: -parameters.q / normB };
      const tangentA = { x: parameters.v / normA, y: -parameters.u / normA };
      const tangentB = { x: parameters.q / normB, y: parameters.p / normB };
      const scale = (parameters.u ** 2 + parameters.v ** 2) * (parameters.p ** 2 + parameters.q ** 2) * parameters.targetMultiplier;
      const slopeL = ratioTeX(parameters.u, parameters.v);
      const slopeM = ratioTeX(parameters.p, parameters.q);
      return {
        prompt: `다음 그림과 같이 기울기가 \\(-${slopeL}\\)인 직선 \\(l\\)이 단위원에 제1사분면의 점 \\(A\\)에서 접하고, 기울기가 \\(${slopeM}\\)인 직선 \\(m\\)이 제4사분면의 점 \\(B\\)에서 접한다. 원점을 \\(O\\)라 할 때 \\(${scale}\\cos^2\\angle AOB\\)를 구하여라.`,
        solution: `접점의 반지름은 접선에 수직이므로 방향벡터를 각각 \\((u,v),(p,-q)\\)로 둘 수 있다. 내적으로 코사인제곱을 계산하면 답은 \\(${answer}\\)이다.`,
        visualization: visual("GEO", {
          equalScale: true,
          xRange: [-1.8, 2.2],
          yRange: [-1.8, 1.8],
          circles: [{ cx: 0, cy: 0, radius: 1, color: "#111827" }],
          points: [
            { x: 0, y: 0, label: "O", mathTex: "O" },
            { ...A, label: "A", mathTex: "A" },
            { ...B, label: "B", mathTex: "B" },
          ],
          segments: [
            { from: "O", to: "A", color: "#2563eb" },
            { from: "O", to: "B", color: "#2563eb" },
            { from: { x: A.x - 1.2 * tangentA.x, y: A.y - 1.2 * tangentA.y }, to: { x: A.x + 1.2 * tangentA.x, y: A.y + 1.2 * tangentA.y } },
            { from: { x: B.x - 1.2 * tangentB.x, y: B.y - 1.2 * tangentB.y }, to: { x: B.x + 1.2 * tangentB.x, y: B.y + 1.2 * tangentB.y } },
          ],
          texts: [{ x: A.x + 0.8 * tangentA.x, y: A.y + 0.8 * tangentA.y, text: "l", mathTex: "\\ell" }, { x: B.x - 0.8 * tangentB.x, y: B.y - 0.8 * tangentB.y, text: "m", mathTex: "m" }],
        }),
      };
    },
  };
}

function makeAsymptoticGeometryRatio(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "중점·평행선·길이비가 결합된 도형의 점근 전개"),
    build(random) {
      return {
        parameters: {
          targetMultiplier: randomInteger(random, 1, 50),
          diagramN: randomInteger(random, 1, 8),
        },
      };
    },
    solve({ targetMultiplier }) {
      return 11 * targetMultiplier;
    },
    crossCheck(parameters) {
      const numerator = 4;
      const denominator = 7;
      return parameters.targetMultiplier * (numerator + denominator);
    },
    render(parameters, answer) {
      const n = parameters.diagramN;
      return {
        prompt: `다음 그림과 같이 \\(AC=BC=4n+2\\)인 사각형 \\(ABCD\\)에서 \\(P,Q\\)는 각각 \\(AB,BC\\)의 중점이고 \\(R=DQ\\cap AC\\)이다. \\(\\angle CAB=\\angle PQR\\), \\(CP=\\sqrt{15n^2+16n+4}\\), \\(DR:DC=1:2\\)이다. \\(\\lim_{n\\to\\infty}(DR-4n/3)=q/p\\)일 때 서로소인 자연수 \\(p,q\\)에 대하여 \\(${scaledTeX(parameters.targetMultiplier, "p+q")}\\)를 구하여라.`,
        solution: `중점정리와 엇각으로 \\(AB\\parallel DQ\\), \\(RQ=n\\)을 얻고 코사인법칙으로 \\(DR=(n+\\sqrt{49n^2+48n+12})/6\\)을 구한다. 극한은 \\(4/7\\)이므로 답은 \\(${answer}\\)이다.`,
        visualization: visual("GEO", {
          showAxes: false,
          showGrid: false,
          xRange: [-0.5, 7],
          yRange: [-0.4, 4.6],
          points: [
            { x: 0.6, y: 3.2, label: "A", mathTex: "A" }, { x: 0.2, y: 0, label: "B", mathTex: "B" }, { x: 6.2, y: 0, label: "C", mathTex: "C" },
            { x: 3.5, y: 4, label: "D", mathTex: "D" }, { x: 0.4, y: 1.6, label: "P", mathTex: "P" }, { x: 3.2, y: 0, label: "Q", mathTex: "Q" },
            { x: 3.55, y: 1.55, label: "R", mathTex: "R" },
          ],
          segments: [
            { from: "A", to: "B" }, { from: "B", to: "C" }, { from: "C", to: "D" }, { from: "D", to: "A" },
            { from: "A", to: "C", color: "#2563eb" }, { from: "D", to: "Q", color: "#2563eb" },
            { from: "P", to: "Q", color: "#64748b" }, { from: "P", to: "C", color: "#64748b" },
          ],
          texts: [{ x: 5.0, y: 0.3, text: `AC=BC=${4 * n + 2}`, mathTex: `AC=BC=${4 * n + 2}`, color: "#475569" }],
        }),
      };
    },
  };
}

function makeTangentDiameterCircleLimit(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "직각삼각형 속 지름원 접선 조건의 삼차극한"),
    build(random) {
      return {
        parameters: {
          answerMultiplier: randomInteger(random, 1, 200),
          diagramThetaHundredths: randomInteger(random, 20, 60),
        },
      };
    },
    solve({ answerMultiplier }) {
      return answerMultiplier;
    },
    crossCheck(parameters) {
      const theta = 1e-4;
      const cd = Math.sin(theta) * (1 - Math.cos(theta)) / (1 + Math.cos(theta));
      const k = cd / theta ** 3;
      return Math.round(4 * parameters.answerMultiplier * k);
    },
    render(parameters, answer) {
      const theta = parameters.diagramThetaHundredths / 100;
      const cosine = Math.cos(theta);
      const sine = Math.sin(theta);
      const A = { x: cosine ** 2, y: sine * cosine };
      const C = { x: 1, y: 0 };
      const ratio = (2 * cosine) / (1 + cosine);
      const D = { x: A.x + ratio * (C.x - A.x), y: A.y + ratio * (C.y - A.y) };
      const center = { x: (A.x + D.x) / 2, y: (A.y + D.y) / 2 };
      const radius = Math.hypot(A.x - D.x, A.y - D.y) / 2;
      return {
        prompt: `다음 그림과 같이 \\(BC=1\\), \\(\\angle A=\\pi/2\\), \\(\\angle B=\\theta\\ (0<\\theta<\\pi/2)\\)인 삼각형 \\(ABC\\)가 있다. \\(D\\in AC\\)이고 지름이 \\(AD\\)인 원이 \\(BC\\)에 접한다. \\(k=\\lim_{\\theta\\to0+}CD/\\theta^3\\)일 때 \\(${4 * parameters.answerMultiplier}k\\)를 구하여라.`,
        solution: `접점에 내린 수선을 이용하면 \\(CD=\\sin\\theta(1-\\cos\\theta)/(1+\\cos\\theta)\\)이다. 표준극한으로 \\(k=1/4\\)이므로 답은 \\(${answer}\\)이다.`,
        visualization: visual("GEO", {
          showAxes: false,
          showGrid: false,
          equalScale: true,
          xRange: [-0.1, 1.1],
          yRange: [-0.08, 0.72],
          points: [{ x: 0, y: 0, label: "B", mathTex: "B" }, { ...A, label: "A", mathTex: "A" }, { ...C, label: "C", mathTex: "C" }, { ...D, label: "D", mathTex: "D" }],
          segments: [{ from: "B", to: "A" }, { from: "A", to: "C" }, { from: "C", to: "B" }],
          circles: [{ cx: center.x, cy: center.y, radius, color: "#2563eb" }],
          texts: [{ x: 0.12, y: 0.08, text: "θ", mathTex: "\\theta", width: 70 }],
        }),
      };
    },
  };
}

function makeTilingWithLabeledPieces(sourceReferenceId) {
  return {
    ...meta(sourceReferenceId, "직각이등변삼각형 조각과 정사각형 조각의 타일링"),
    build(random) {
      return { parameters: { restrictionLevel: randomInteger(random, 0, 2) } };
    },
    solve({ restrictionLevel }) {
      return [960, 240, 80][restrictionLevel];
    },
    crossCheck({ restrictionLevel }) {
      const diamondChoices = restrictionLevel >= 1 ? 1 : 4;
      const circleCellChoices = restrictionLevel >= 2 ? 1 : 3;
      const circleOrientationChoices = 4;
      const remainingTriangleWays = 20;
      return diamondChoices * circleCellChoices * circleOrientationChoices * remainingTriangleWays;
    },
    render(parameters, answer) {
      const extra = parameters.restrictionLevel === 0
        ? ""
        : parameters.restrictionLevel === 1
          ? " 그림에서 파란색으로 표시한 칸에는 반드시 ◇ 조각을 놓는다."
          : " 그림에서 파란색 칸에는 ◇ 조각을, 보라색 칸에는 ○ 조각 두 개를 놓는다.";
      const cells = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }];
      return {
        prompt: `다음 그림처럼 빗변이 \\(\\sqrt2\\)인 직각이등변삼각형 조각 6개와 한 변이 1인 정사각형 조각 1개로 네 정사각형 도형을 빈틈없이 채운다. 삼각형 표시는 ○ 1개, ☆ 1개, ◎ 4개이고 정사각형 표시는 ◇이며 ◎ 조각끼리는 구별하지 않고 조각은 뒤집지 않는다.${extra} 가능한 타일링의 수를 구하여라.`,
        solution: `◇와 ○가 들어갈 칸 및 ○ 조각의 방향을 정한 뒤 ☆와 네 ◎ 조각을 배치한다. 주어진 고정 조건을 반영하면 답은 \\(${answer}\\)이다.`,
        visualization: visual("GEO", {
          showAxes: false,
          showGrid: false,
          xRange: [-0.4, 6.8],
          yRange: [-0.5, 3.4],
          rectangles: [
            ...cells.map((cell, index) => ({
              ...cell,
              width: 1,
              height: 1,
              fill: parameters.restrictionLevel >= 1 && index === 1
                ? "rgba(37,99,235,0.16)"
                : parameters.restrictionLevel >= 2 && index === 0
                  ? "rgba(124,58,237,0.16)"
                  : "#ffffff",
            })),
            { x: 5.2, y: 1.7, width: 1, height: 1, fill: "#f8fafc" },
          ],
          polygons: [
            { points: [{ x: 4, y: 0 }, { x: 5, y: 0 }, { x: 4, y: 1 }], fill: "#ffffff" },
            { points: [{ x: 5.2, y: 0 }, { x: 6.2, y: 0 }, { x: 5.2, y: 1 }], fill: "#ffffff" },
            { points: [{ x: 4, y: 1.7 }, { x: 5, y: 1.7 }, { x: 4, y: 2.7 }], fill: "#ffffff" },
          ],
          polylines: cells.filter((_, index) => index !== 1).map((cell) => ({ points: [{ x: cell.x, y: cell.y }, { x: cell.x + 1, y: cell.y + 1 }], color: "#64748b", width: 1.5 })),
          texts: [
            { x: 1.5, y: 0.5, text: parameters.restrictionLevel >= 1 ? "◇ 고정" : "목표 도형", color: "#2563eb" },
            ...(parameters.restrictionLevel >= 2 ? [{ x: 0.5, y: 0.5, text: "○ 고정", color: "#7c3aed" }] : []),
            { x: 4.32, y: 0.32, text: "○" }, { x: 5.52, y: 0.32, text: "☆" }, { x: 4.32, y: 2.02, text: "◎×4" }, { x: 5.7, y: 2.2, text: "◇" },
          ],
        }),
      };
    },
  };
}

const SOURCE_FIXTURES = Object.freeze({
  "2016-04-EDUCATION_OFFICE-NA-Q29": { parameters: { upperIndex: 10, diagramIndex: 3 }, answer: 725 },
  "2018-09-KICE-NA-Q29": { parameters: { denominator: 5, ordinal: 2 }, answer: 8 },
  "2016-04-EDUCATION_OFFICE-GA-Q30": { parameters: { highBase: 5 }, answer: 71 },
  "2017-09-KICE-NA-Q30": { parameters: { supportLength: 2, targetMultiplier: 20 }, answer: 200 },
  "2019-06-KICE-GA-Q30": { parameters: { targetMultiplier: 1, plottedPeriods: 4 }, answer: 12 },
  "2019-06-KICE-NA-Q30": { parameters: { input: -1 }, answer: 19 },
  "2016-06-KICE-NA-Q29": { parameters: { targetMultiplier: 1 }, answer: 186 },
  "2019-04-EDUCATION_OFFICE-NA-Q30": { parameters: { targetMultiplier: 2 }, answer: 306 },
  "2017-03-EDUCATION_OFFICE-GA-Q29": { parameters: { maleCount: 3, femaleCount: 2 }, answer: 528 },
  "2020-05-EDUCATION_OFFICE-GA-Q28": { parameters: { heightFactorHalf: 2, targetMultiplier: 5 }, answer: 75 },
  "2018-03-EDUCATION_OFFICE-NA-Q28": { parameters: { firstTerm: 2, difference: 0.5, firstIndex: 4, secondIndex: 7, upperIndex: 25 }, answer: 200 },
  "2016-03-EDUCATION_OFFICE-GA-Q26": { parameters: { u: 1, v: 3, p: 1, q: 1, dot: -2, targetMultiplier: 5 }, answer: 20 },
  "2026-03-EDUCATION_OFFICE-CALCULUS-Q29": { parameters: { targetMultiplier: 1, diagramN: 3 }, answer: 11 },
  "2016-10-EDUCATION_OFFICE-GA-Q28": { parameters: { answerMultiplier: 25, diagramThetaHundredths: 40 }, answer: 25 },
  "2019-10-EDUCATION_OFFICE-GA-Q28": { parameters: { restrictionLevel: 0 }, answer: 960 },
});

const wave3Batch1Definitions = [
  makeLatticeTriangleCount("2016-04-EDUCATION_OFFICE-NA-Q29"),
  makeStaircaseDiagonalHit("2018-09-KICE-NA-Q29"),
  makeEpigraphSquareDerivative("2016-04-EDUCATION_OFFICE-GA-Q30"),
  makeParabolaTrapezoidOptimization("2017-09-KICE-NA-Q30"),
  makePeriodicTrigInverseBranch("2019-06-KICE-GA-Q30"),
  makePiecewiseIntersectionComposition("2019-06-KICE-NA-Q30"),
  makeDistanceEnvelopeNondifferentiability("2016-06-KICE-NA-Q29"),
  makeParameterRegionExtremum("2019-04-EDUCATION_OFFICE-NA-Q30"),
  makeLockerAssignment("2017-03-EDUCATION_OFFICE-GA-Q29"),
  makeAbsoluteLogChordDistance("2020-05-EDUCATION_OFFICE-GA-Q28"),
  makeLineSampledArithmeticSequence("2018-03-EDUCATION_OFFICE-NA-Q28"),
  makeTwoTangentsCircleAngle("2016-03-EDUCATION_OFFICE-GA-Q26"),
  makeAsymptoticGeometryRatio("2026-03-EDUCATION_OFFICE-CALCULUS-Q29"),
  makeTangentDiameterCircleLimit("2016-10-EDUCATION_OFFICE-GA-Q28"),
  makeTilingWithLabeledPieces("2019-10-EDUCATION_OFFICE-GA-Q28"),
].map((definition) => ({
  ...definition,
  sourceFixture: SOURCE_FIXTURES[definition.sourceReferenceId],
}));

module.exports = {
  lockerCountByGenderSubsets,
  lockerCountByLabeledAssignments,
  wave3Batch1Definitions,
};
