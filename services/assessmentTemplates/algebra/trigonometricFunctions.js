const {
  randomInteger,
  choose,
  fraction,
  makeShortAnswer,
  defineAdvancedTemplates,
} = require("../shared");

const courseId = "algebra";
const unitId =
  "trigonometric-functions";
const requiredConceptIds = [
  "algebra-02-01",
  "algebra-02-02",
  "algebra-02-03",
];

const families = [
  {
    id: "graph-parameter-recovery",
    titles: [
      "최대·최소·주기에서 삼각함수 식 복원",
      "그래프 정보에서 진폭·주기계수 결합값 복원",
    ],
    sourcePattern:
      "삼각함수 그래프의 최댓값·최솟값·주기를 역으로 읽어 식의 계수를 결정",
    estimatedMinutes: [10, 10],
    reasoningSteps: [
      [
        "최댓값과 최솟값의 차로 진폭을 구한다.",
        "두 값의 평균으로 평행이동량을 구한다.",
        "최소 양의 주기로 x의 계수를 구한다.",
        "요구한 계수 결합값을 계산한다.",
      ],
      [
        "그래프의 중심선을 찾는다.",
        "진폭을 복원한다.",
        "주기 공식으로 각속도 계수를 구한다.",
        "세 매개변수의 결합값을 계산한다.",
      ],
    ],
    generate(mode) {
      const amplitude =
        randomInteger(2, 5);
      const frequency =
        randomInteger(2, 4);
      const shift =
        randomInteger(-3, 3);
      const maximum =
        shift + amplitude;
      const minimum =
        shift - amplitude;
      const answer =
        mode === 0
          ? amplitude +
            frequency +
            shift
          : amplitude *
              frequency -
            shift;

      return makeShortAnswer({
        prompt:
          `함수 $f(x)=a\\sin(bx)+c$에서 $a>0,b>0$이다. ` +
          `최댓값이 ${maximum}, 최솟값이 ${minimum}, 최소 양의 주기가 ` +
          `$\\dfrac{2\\pi}{${frequency}}$일 때, $${ 
            mode === 0
              ? "a+b+c"
              : "ab-c"
          }$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? amplitude +
              frequency +
              shift
            : amplitude *
                frequency -
              shift,
        solution:
          `$a=(${maximum}-(${minimum}))/2=${amplitude}$, ` +
          `$c=(${maximum}+(${minimum}))/2=${shift}$이다. ` +
          `$2\\pi/b=2\\pi/${frequency}$에서 $b=${frequency}$. 따라서 답은 ${answer}이다.`,
        hintText:
          "최댓값·최솟값의 평균과 차, 그리고 주기 공식을 각각 사용하세요.",
        visualization: {
          kind: "algebra-trig",
          functionName: "sin",
          amplitude,
          frequency,
          verticalShift: shift,
          xUnit: "radian",
          minimum,
          maximum,
          periodNumerator: 2,
          periodDenominator: frequency,
          note:
            "그래프의 최댓값·최솟값과 한 주기의 길이를 문제의 조건과 함께 확인하세요.",
        },
      });
    },
  },
  {
    id: "sum-identity-quadrant",
    titles: [
      "삼각함수 합과 사분면에서 곱 복원",
      "삼각함수 합과 대소 조건에서 탄젠트 복원",
    ],
    sourcePattern:
      "(sinθ+cosθ)^2 항등식과 사분면·대소 조건을 함께 사용",
    estimatedMinutes: [10, 11],
    reasoningSteps: [
      [
        "주어진 합을 제곱한다.",
        "sin²θ+cos²θ=1을 대입한다.",
        "sinθcosθ를 고립시킨다.",
        "사분면 조건과 부호가 맞는지 검산한다.",
      ],
      [
        "합의 제곱으로 곱을 구한다.",
        "합과 곱으로 sinθ,cosθ의 이차방정식을 만든다.",
        "대소·사분면 조건으로 두 값을 구분한다.",
        "비를 취해 tanθ를 계산한다.",
      ],
    ],
    generate(mode) {
      const swapped =
        randomInteger(0, 1) === 1;
      const sinNumerator =
        swapped ? 4 : 3;
      const cosNumerator =
        swapped ? 3 : 4;
      const sum =
        sinNumerator +
        cosNumerator;
      const product = fraction(
        sinNumerator *
          cosNumerator,
        25
      );
      const tangent = fraction(
        sinNumerator,
        cosNumerator
      );

      return makeShortAnswer({
        prompt:
          `제1사분면의 각 $\\theta$가 $\\sin\\theta+\\cos\\theta=\\dfrac{${sum}}5$를 만족한다. ` +
          `$\\sin\\theta ${
            sinNumerator >
            cosNumerator
              ? ">"
              : "<"
          }\\cos\\theta$일 때, $${ 
            mode === 0
              ? "\\sin\\theta\\cos\\theta"
              : "\\tan\\theta"
          }$의 값을 구하시오. (기약분수로 입력)`,
        answer:
          mode === 0
            ? product
            : tangent,
        independentAnswer:
          mode === 0
            ? fraction(12, 25)
            : fraction(
                sinNumerator,
                cosNumerator
              ),
        solution:
          `합을 제곱하면 $\\dfrac{${sum ** 2}}{25}=1+2\\sin\\theta\\cos\\theta$이므로 ` +
          `$\\sin\\theta\\cos\\theta=\\dfrac{12}{25}$. 두 값은 $3/5,4/5$이고 ` +
          `대소 조건으로 $\\sin\\theta=${sinNumerator}/5$, $\\cos\\theta=${cosNumerator}/5$이다. ` +
          `따라서 답은 ${mode === 0 ? product : tangent}이다.`,
        hintText:
          "(sinθ+cosθ)²을 전개한 뒤 두 값을 근으로 갖는 이차방정식을 생각하세요.",
      });
    },
  },
  {
    id: "triangle-three-invariants",
    titles: [
      "세 변에서 넓이와 외접원의 반지름 연쇄 계산",
      "코사인법칙·넓이·사인법칙 결합",
    ],
    sourcePattern:
      "코사인법칙으로 각을 찾고 넓이와 확장 사인법칙까지 이어지는 삼각형 유형",
    estimatedMinutes: [12, 12],
    reasoningSteps: [
      [
        "가장 긴 변에 대한 코사인법칙을 적용한다.",
        "끼인각을 판정한다.",
        "두 변과 사잇각으로 넓이를 구한다.",
        "확장 사인법칙으로 외접반지름을 구해 결합한다.",
      ],
      [
        "세 변으로 한 각의 코사인을 구한다.",
        "삼각함수 항등식으로 사인을 구한다.",
        "넓이를 계산한다.",
        "사인법칙으로 외접원의 지름을 구한다.",
      ],
    ],
    generate(mode) {
      const scale =
        randomInteger(1, 4);
      const area =
        6 * scale ** 2;
      const diameter = 5 * scale;
      const answer =
        mode === 0
          ? area + diameter
          : area - diameter;

      return makeShortAnswer({
        prompt:
          `삼각형 ABC의 세 변의 길이가 각각 $${3 * scale},${4 * scale},${5 * scale}$이다. ` +
          `삼각형의 넓이를 $K$, 외접원의 지름을 $D$라 할 때, $${ 
            mode === 0
              ? "K+D"
              : "K-D"
          }$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? 6 * scale ** 2 +
              5 * scale
            : 6 * scale ** 2 -
              5 * scale,
        solution:
          `코사인법칙에서 $(${5 * scale})^2=(${3 * scale})^2+(${4 * scale})^2$이므로 ` +
          `가장 긴 변의 대각은 $90^\\circ$이다. $K=\\frac12\\cdot${3 * scale}\\cdot${4 * scale}=${area}$이고, ` +
          `확장 사인법칙에서 빗변이 외접원의 지름이므로 $D=${diameter}$. 답은 ${answer}이다.`,
        hintText:
          "먼저 코사인법칙으로 직각삼각형인지 확인한 뒤 넓이와 확장 사인법칙을 쓰세요.",
      });
    },
  },
  {
    id: "sector-reverse-chain",
    titles: [
      "호의 길이에서 반지름과 부채꼴 넓이 역산",
      "부채꼴 정보와 삼각함수 값 결합",
    ],
    sourcePattern:
      "호도법의 호의 길이·넓이 공식을 역으로 적용한 뒤 특수각 값을 연결",
    estimatedMinutes: [10, 11],
    reasoningSteps: [
      [
        "호도법으로 중심각을 확인한다.",
        "l=rθ에서 반지름을 구한다.",
        "S=1/2 r²θ로 넓이를 구한다.",
        "π의 계수를 요구한 형식으로 정리한다.",
      ],
      [
        "호의 길이로 반지름을 복원한다.",
        "중심각의 삼각함수 값을 구한다.",
        "부채꼴 넓이를 계산한다.",
        "두 결과를 결합한다.",
      ],
    ],
    generate(mode) {
      const angle = choose([
        {
          denominator: 2,
          sin: 1,
        },
        {
          denominator: 6,
          sin: 0.5,
        },
      ]);
      const radius =
        angle.denominator === 2
          ? randomInteger(2, 6)
          : 6;
      const arcCoefficient =
        radius /
        angle.denominator;
      const areaCoefficient =
        radius ** 2 /
        (
          2 *
          angle.denominator
        );
      const answer =
        mode === 0
          ? areaCoefficient
          : areaCoefficient +
            radius *
              angle.sin;

      return makeShortAnswer({
        prompt:
          `중심각의 크기가 $\\dfrac{\\pi}{${angle.denominator}}$이고 호의 길이가 ` +
          `$${arcCoefficient}\\pi$인 부채꼴의 반지름을 $r$, 넓이를 $S$라 하자. ` +
          `$${ 
            mode === 0
              ? "S/\\pi"
              : `S/\\pi+r\\sin\\dfrac{\\pi}{${angle.denominator}}`
          }$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? radius ** 2 /
              (
                2 *
                angle.denominator
              )
            : radius ** 2 /
                (
                  2 *
                  angle.denominator
                ) +
              radius *
                angle.sin,
        solution:
          `$r\\cdot\\pi/${angle.denominator}=${arcCoefficient}\\pi$에서 $r=${radius}$. ` +
          `$S/\\pi=\\frac12r^2/${angle.denominator}=${areaCoefficient}$. ` +
          `${
            mode === 0
              ? ""
              : `또한 $r\\sin(\\pi/${angle.denominator})=${radius * angle.sin}$이다. `
          }따라서 답은 ${answer}이다.`,
        hintText:
          "호의 길이 공식 l=rθ로 반지름을 먼저 복원하세요.",
      });
    },
  },
  {
    id: "isosceles-cosine-sine-chain",
    titles: [
      "이등변삼각형에서 높이·넓이·외접반지름 결합",
      "코사인법칙으로 각을 복원한 뒤 사인법칙 적용",
    ],
    sourcePattern:
      "이등변삼각형의 세 변 조건을 코사인법칙·넓이·사인법칙으로 연쇄 해석",
    estimatedMinutes: [12, 13],
    reasoningSteps: [
      [
        "코사인법칙으로 꼭짓각의 코사인을 구한다.",
        "사인값 또는 높이를 구한다.",
        "삼각형의 넓이를 계산한다.",
        "확장 사인법칙으로 외접반지름을 구해 결합한다.",
      ],
      [
        "세 변을 코사인법칙에 대입한다.",
        "sin²+cos²=1로 사인을 구한다.",
        "넓이로 계산을 검산한다.",
        "사인법칙으로 외접반지름을 구한다.",
      ],
    ],
    generate(mode) {
      const scale =
        randomInteger(1, 3);
      const equalSide = 5 * scale;
      const base = 6 * scale;
      const height = 4 * scale;
      const area =
        12 * scale ** 2;
      const radius =
        fraction(
          25 * scale,
          8
        );
      const answer =
        mode === 0
          ? area + height
          : radius;

      return makeShortAnswer({
        prompt:
          `이등변삼각형 ABC에서 $AB=AC=${equalSide}$, $BC=${base}$이다. ` +
          `$K$를 넓이, $h$를 A에서 BC에 내린 높이, $R$을 외접원의 반지름이라 할 때, $${ 
            mode === 0
              ? "K+h"
              : "R"
          }$의 값을 구하시오.${mode === 1 ? " (기약분수로 입력)" : ""}`,
        answer,
        independentAnswer:
          mode === 0
            ? 12 * scale ** 2 +
              4 * scale
            : fraction(
                25 * scale,
                8
              ),
        solution:
          `높이는 밑변을 이등분하므로 $h=\\sqrt{${equalSide}^2-${3 * scale}^2}=${height}$. ` +
          `$K=\\frac12\\cdot${base}\\cdot${height}=${area}$. ` +
          `또 $K=abc/(4R)$에서 $R=${radius}$. 따라서 답은 ${answer}이다.`,
        hintText:
          "이등변삼각형의 높이가 밑변을 이등분한다는 점에서 시작하세요.",
      });
    },
  },
  {
    id: "trigonometric-equation-root-count",
    titles: [
      "주기와 영점으로 삼각방정식의 해 개수 계산",
      "끝점 포함 여부를 구분하는 삼각방정식 해 개수",
    ],
    sourcePattern:
      "삼각함수의 영점 간격을 구한 뒤 주어진 구간의 양 끝점 포함 여부까지 세는 유형",
    estimatedMinutes: [11, 12],
    reasoningSteps: [
      [
        "sin(kx)=0의 일반해를 구한다.",
        "해 사이의 간격을 계산한다.",
        "일반해가 주어진 닫힌구간에 속하는 조건을 푼다.",
        "정수 매개변수의 개수를 센다.",
      ],
      [
        "cos(kx)=0의 일반해를 구한다.",
        "구간 양 끝점이 해인지 각각 검사한다.",
        "허용되는 정수 지표의 범위를 구한다.",
        "끝점을 제외한 해의 개수를 계산한다.",
      ],
    ],
    generate(mode) {
      const frequency = randomInteger(2, 5);
      const length = randomInteger(2, 4);
      const answer =
        mode === 0
          ? frequency * length + 1
          : frequency * length;

      return makeShortAnswer({
        prompt:
          mode === 0
            ? `방정식 $\\sin(${frequency}x)=0$이 닫힌구간 $[0,${length}\\pi]$에서 갖는 서로 다른 실근의 개수를 구하시오.`
            : `방정식 $\\cos(${frequency}x)=0$이 열린구간 $(0,${length}\\pi)$에서 갖는 서로 다른 실근의 개수를 구하시오.`,
        answer,
        independentAnswer:
          frequency * length +
          (mode === 0 ? 1 : 0),
        solution:
          mode === 0
            ? `$x=n\\pi/${frequency}$이고 $0\\le n\\le${frequency * length}$이므로 해는 ${answer}개이다.`
            : `$x=(2n+1)\\pi/(2${frequency})$이다. $(0,${length}\\pi)$ 안에 ${frequency * length}개의 해가 있으므로 답은 ${answer}이다.`,
        hintText:
          "일반해를 먼저 쓴 뒤 정수 n의 범위를 세세요.",
      });
    },
  },
  {
    id: "phase-shift-extrema",
    titles: [
      "위상이 이동한 코사인함수의 첫 최댓값 위치",
      "위상이 이동한 사인함수의 첫 최솟값 위치",
    ],
    sourcePattern:
      "평행이동한 삼각함수의 위상이 특정 각이 되는 첫 양의 위치를 주기와 함께 결정",
    estimatedMinutes: [10, 11],
    reasoningSteps: [
      [
        "최댓값이 되는 코사인의 위상을 찾는다.",
        "위상에 2π의 정수배를 더한 일반해를 쓴다.",
        "양수인 해 중 가장 작은 값을 고른다.",
        "기약분수의 분자와 분모를 결합한다.",
      ],
      [
        "사인함수가 최솟값을 갖는 위상을 찾는다.",
        "평행이동량을 반영한 일반해를 세운다.",
        "최소 양의 해를 구한다.",
        "π의 유리수 배를 기약분수로 정리한다.",
      ],
    ],
    generate(mode) {
      const denominator = choose([3, 4, 6]);
      const shiftNumerator = 1;
      const numerator =
        mode === 0
          ? shiftNumerator
          : 3 * denominator +
            2 * shiftNumerator;
      const reduced =
        fraction(
          numerator,
          2 * denominator
        ).split("/");
      const top = Number(reduced[0]);
      const bottom = Number(
        reduced[1] || 1
      );
      const answer = top + bottom;

      return makeShortAnswer({
        prompt:
          mode === 0
            ? `함수 $f(x)=3\\cos(2x-\\dfrac{\\pi}{${denominator}})+1$이 최댓값을 갖는 가장 작은 양수 $x$를 $\\dfrac{p}{q}\\pi$라 하자. 서로소인 자연수 $p,q$에 대하여 $p+q$를 구하시오.`
            : `함수 $g(x)=2\\sin(2x-\\dfrac{\\pi}{${denominator}})-3$이 최솟값을 갖는 가장 작은 양수 $x$를 $\\dfrac{p}{q}\\pi$라 하자. 서로소인 자연수 $p,q$에 대하여 $p+q$를 구하시오.`,
        answer,
        independentAnswer:
          top + bottom,
        solution:
          mode === 0
            ? `최댓값은 $2x-\\pi/${denominator}=0$에서 처음 나타나므로 $x=\\pi/${2 * denominator}$. 따라서 $p+q=${answer}$이다.`
            : `최솟값은 $2x-\\pi/${denominator}=3\\pi/2$에서 처음 나타난다. 따라서 $x=${fraction(numerator, 2 * denominator)}\\pi$이고 $p+q=${answer}$이다.`,
        hintText:
          "코사인의 최대 위상은 0, 사인의 최소 위상은 3π/2입니다.",
      });
    },
  },
  {
    id: "included-angle-triangle",
    titles: [
      "끼인각의 코사인에서 제3변과 넓이 결합",
      "두 변과 끼인각에서 넓이·둘레 연쇄 계산",
    ],
    sourcePattern:
      "한 각의 사인·코사인과 두 인접변을 이용해 코사인법칙과 넓이 공식을 함께 적용",
    estimatedMinutes: [12, 13],
    reasoningSteps: [
      [
        "주어진 코사인으로 사인값을 복원한다.",
        "코사인법칙으로 제3변을 구한다.",
        "두 변과 끼인각으로 넓이를 계산한다.",
        "제3변과 넓이를 결합한다.",
      ],
      [
        "코사인법칙에 두 변과 끼인각을 대입한다.",
        "제3변의 양의 길이를 선택한다.",
        "사인값으로 넓이를 계산한다.",
        "넓이와 둘레의 차를 구한다.",
      ],
    ],
    generate(mode) {
      const scale = randomInteger(1, 3);
      const sideA = 3 * scale;
      const sideB = 4 * scale;
      const sideC = 5 * scale;
      const area = 6 * scale ** 2;
      const perimeter =
        12 * scale;
      const answer =
        mode === 0
          ? sideC + area
          : area + perimeter;

      return makeShortAnswer({
        prompt:
          `삼각형에서 두 변의 길이가 $${sideA},${sideB}$이고 그 끼인각을 $\\theta$라 하자. ` +
          `$\\cos\\theta=0$일 때 제3변의 길이를 $c$, 넓이를 $K$라 하면 ` +
          `${mode === 0 ? "$c+K$" : "둘레를 $P$라 할 때 $K+P$"}의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? 5 * scale +
              6 * scale ** 2
            : 6 * scale ** 2 +
              12 * scale,
        solution:
          `$\\theta=90^\\circ$이므로 코사인법칙에서 $c=${sideC}$이고 ` +
          `$K=\\frac12\\cdot${sideA}\\cdot${sideB}=${area}$. ` +
          `${mode === 0 ? "" : `둘레는 ${perimeter}이므로 `}답은 ${answer}이다.`,
        hintText:
          "cosθ=0이면 끼인각이 직각입니다. 코사인법칙과 넓이 공식을 차례로 쓰세요.",
      });
    },
  },
  {
    id: "sine-law-two-triangle-chain",
    titles: [
      "공유변을 가진 두 삼각형의 사인법칙 연쇄",
      "한 삼각형에서 구한 변을 다음 삼각형에 전달",
    ],
    sourcePattern:
      "첫 삼각형의 확장 사인법칙으로 공유변을 구한 뒤 두 번째 삼각형의 사인법칙에 대입",
    estimatedMinutes: [13, 14],
    reasoningSteps: [
      [
        "첫 삼각형에서 확장 사인법칙으로 공유변을 구한다.",
        "두 번째 삼각형에서 주어진 각의 사인값을 확인한다.",
        "공유변을 두 번째 사인법칙에 대입한다.",
        "목표 변과 공유변을 결합한다.",
      ],
      [
        "첫 삼각형의 외접원 지름을 계산한다.",
        "공유변의 대각을 이용해 길이를 구한다.",
        "두 번째 삼각형에서 다시 사인법칙을 적용한다.",
        "두 단계에서 얻은 길이의 차를 계산한다.",
      ],
    ],
    generate(mode) {
      const scale = randomInteger(2, 6);
      const shared = scale;
      const target = 2 * scale;
      const answer =
        mode === 0
          ? shared + target
          : target - shared;

      return makeShortAnswer({
        prompt:
          `삼각형 ABC에서 $\\angle A=30^\\circ$이고 외접원의 지름이 $${2 * scale}$이다. ` +
          `선분 BC를 공유하는 삼각형 BCD에서 $\\angle C=90^\\circ$, $\\angle D=30^\\circ$이다. ` +
          `$${mode === 0 ? "BC+BD" : "BD-BC"}$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? 3 * scale
            : scale,
        solution:
          `확장 사인법칙에서 첫 삼각형의 $BC=2R\\sin30^\\circ=${scale}$이다. ` +
          `두 번째 삼각형에서 $BC=BD\\sin30^\\circ$이므로 $BD=${target}$. ` +
          `따라서 답은 ${answer}이다.`,
        hintText:
          "각 변은 외접원의 지름과 그 대각의 사인의 곱입니다.",
      });
    },
  },
  {
    id: "chord-sector-coefficient",
    titles: [
      "현의 길이와 부채꼴 넓이의 계수 결합",
      "중심각에서 현·호·부채꼴을 함께 계산",
    ],
    sourcePattern:
      "중심각을 이용해 이등변삼각형의 현과 부채꼴 넓이를 각각 구한 뒤 계수를 결합",
    estimatedMinutes: [11, 12],
    reasoningSteps: [
      [
        "중심각 60도인 삼각형의 세 변을 판정한다.",
        "현의 길이를 구한다.",
        "부채꼴 넓이 공식에 중심각을 대입한다.",
        "π의 계수와 현의 길이를 결합한다.",
      ],
      [
        "호도법으로 중심각을 변환한다.",
        "호의 길이와 부채꼴 넓이를 계산한다.",
        "코사인법칙으로 현의 길이를 확인한다.",
        "요구한 세 양의 계수를 합한다.",
      ],
    ],
    generate(mode) {
      const radius =
        6 * randomInteger(1, 3);
      const sectorCoefficient =
        radius ** 2 / 6;
      const arcCoefficient =
        radius / 3;
      const answer =
        mode === 0
          ? radius +
            sectorCoefficient
          : radius +
            sectorCoefficient +
            arcCoefficient;

      return makeShortAnswer({
        prompt:
          `반지름이 ${radius}이고 중심각이 $60^\\circ$인 부채꼴에서 현의 길이를 $c$, ` +
          `호의 길이를 $a\\pi$, 넓이를 $b\\pi$라 하자. ` +
          `$${mode === 0 ? "b+c" : "a+b+c"}$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? radius +
              radius ** 2 / 6
            : radius / 3 +
              radius ** 2 / 6 +
              radius,
        solution:
          `중심각이 $60^\\circ$이므로 두 반지름과 현이 이루는 삼각형은 정삼각형이라 $c=${radius}$. ` +
          `또 $a=${arcCoefficient}$, $b=${sectorCoefficient}$이므로 답은 ${answer}이다.`,
        hintText:
          "중심각이 60도이면 두 반지름과 현으로 이루어진 삼각형을 살펴보세요.",
      });
    },
  },
];

module.exports = {
  courseId,
  unitId,
  requiredConceptIds,
  minimumAppliedPoolSize: 15,
  appliedPolicy: {
    includeBankTypes: true,
    minimumLocalDifficulty: 3,
  },
  advancedTemplates:
    defineAdvancedTemplates({
      courseId,
      unitId,
      requiredConceptIds,
      families,
    }),
};
