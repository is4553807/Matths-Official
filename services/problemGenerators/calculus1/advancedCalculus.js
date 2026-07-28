const {
  randomInteger,
  isCorrectAnswer,
  inlineMath,
  displayMath,
  signedNumber,
  xMinus,
  quadraticExpression,
  fractionTex,
} = require("./helpers");

function round4(value) {
  return Math.round(
    (Number(value) + Number.EPSILON) * 10000
  ) / 10000;
}

function choose(values) {
  return values[
    randomInteger(0, values.length - 1)
  ];
}

function nonZero(min = -5, max = 5) {
  let value = 0;
  while (value === 0) {
    value = randomInteger(min, max);
  }
  return value;
}

function sa(
  prompt,
  answer,
  solution,
  hintText,
  visualization
) {
  return {
    prompt,
    inputMode: "short-answer",
    answer: round4(answer),
    solution,
    hintText,
    visualization,
  };
}

function mc(
  prompt,
  choices,
  answerIndex,
  solution,
  hintText,
  visualization
) {
  const shuffled = choices.map(
    (text, index) => ({
      text,
      correct: index === answerIndex,
    })
  );

  for (
    let index = shuffled.length - 1;
    index > 0;
    index -= 1
  ) {
    const swapIndex = randomInteger(0, index);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  const normalized = shuffled.map(
    (choice, index) => ({
      key: String.fromCharCode(65 + index),
      ...choice,
    })
  );

  return {
    prompt,
    inputMode: "multiple-choice",
    choices: normalized.map(
      ({ key, text }) => ({ key, text })
    ),
    answer: normalized.find(
      (choice) => choice.correct
    ).key,
    solution,
    hintText,
    visualization,
  };
}

function calculusVisual(kind, data = {}) {
  return {
    kind: `calculus-${kind}`,
    ...data,
  };
}

function polynomialValue(
  coefficients,
  x
) {
  return coefficients.reduce(
    (sum, coefficient, index) =>
      sum + coefficient * x ** index,
    0
  );
}

function polynomialDerivativeValue(
  coefficients,
  x
) {
  return coefficients.reduce(
    (sum, coefficient, index) =>
      index === 0
        ? sum
        : sum +
          index *
            coefficient *
            x ** (index - 1),
    0
  );
}

function powerTerm(
  coefficient,
  exponent,
  variable = "x"
) {
  if (coefficient === 0) return "0";
  const magnitude = Math.abs(coefficient);
  const coefficientText =
    magnitude === 1 && exponent > 0
      ? ""
      : String(magnitude);
  const variableText =
    exponent === 0
      ? ""
      : exponent === 1
        ? variable
        : `${variable}^{${exponent}}`;

  return `${
    coefficient < 0 ? "-" : ""
  }${coefficientText}${variableText}`;
}

function signedTerm(
  coefficient,
  exponent,
  variable = "x"
) {
  if (coefficient === 0) return "";
  const term = powerTerm(
    Math.abs(coefficient),
    exponent,
    variable
  );
  return coefficient > 0
    ? `+${term}`
    : `-${term}`;
}

function derivativeCoefficientProblems() {
  const q = nonZero(1, 4);
  const l = nonZero(-5, 5);
  const c = randomInteger(-5, 5);
  const a = randomInteger(-3, 3);
  const b = a + randomInteger(1, 5);
  const cubic = nonZero(1, 3);
  const quadratic = nonZero(-4, 4);
  const fA = q * a ** 2 + l * a + c;
  const derivativeAtA = 2 * q * a + l;
  const averageRate =
    q * (a + b) + l;
  const definitionValue =
    2 * a + 1;

  return [
    sa(`${inlineMath(`f(x)=${quadraticExpression(q, l, c)}`)}의 구간 [${a},${b}]에서 평균변화율은?`, averageRate, `평균변화율은 ${inlineMath(`\\frac{f(${b})-f(${a})}{${b}-${a}}=${averageRate}`)}입니다.`, "두 끝의 함수값 차를 x의 변화량으로 나누세요.", calculusVisual("secant", { q, l, c, a, b })),
    sa(`${inlineMath(`f(x)=${quadraticExpression(q, l, c)}`)}일 때 ${inlineMath(`f'(${a})`)}는?`, derivativeAtA, `차분몫 ${inlineMath(`\\frac{f(${a}+h)-f(${a})}{h}`)}을 정리하고 ${inlineMath(`h\\to0`)}으로 보내면 ${derivativeAtA}입니다.`, "도함수 공식을 먼저 쓰지 말고 미분계수의 정의에 직접 대입하세요.", calculusVisual("tangent", { q, l, c, point: a })),
    mc(`${inlineMath(`x=${a}`)}에서 미분계수를 나타내는 식은?`, [
      `${inlineMath(`\\lim_{h\\to0}\\frac{f(${a}+h)-f(${a})}{h}`)}`,
      `${inlineMath(`\\lim_{h\\to0}\\frac{f(${a})-f(h)}{${a}}`)}`,
      `${inlineMath(`\\frac{f(${a})}{${a}}`)}`,
      `${inlineMath(`\\lim_{x\\to${a}}f(x)`)}`,
    ], 0, "미분계수는 한 점에서 차분몫의 극한입니다.", "분자는 함수값의 변화량, 분모는 x의 변화량이어야 합니다.", calculusVisual("definition", { point: a })),
    sa(`곡선 ${inlineMath(`y=${quadraticExpression(q, l, c)}`)} 위에서 ${inlineMath(`x=${a}`)}인 점의 접선 기울기는?`, derivativeAtA, `할선의 기울기를 나타내는 차분몫의 극한이 ${inlineMath(`f'(${a})=${derivativeAtA}`)}입니다.`, "접선 기울기를 미분계수의 정의로 바꾸어 계산하세요.", calculusVisual("tangent", { q, l, c, point: a })),
    sa(`${inlineMath(`\\lim_{h\\to0}\\frac{f(${a}+h)-f(${a})}{h}=${derivativeAtA}`)}일 때 ${inlineMath(`f'(${a})`)}는?`, derivativeAtA, "주어진 극한식 자체가 미분계수의 정의입니다.", "극한식에서 기준점과 함수값의 차를 읽으세요.", calculusVisual("definition", { point: a, slope: derivativeAtA })),
    sa(`${inlineMath(`f(x)=${l}x${signedNumber(c)}`)}의 모든 점에서 미분계수는?`, l, "일차함수의 접선은 함수 자신과 평행하므로 기울기는 항상 x의 계수입니다.", "일차함수의 기울기를 읽으세요.", calculusVisual("tangent", { q: 0, l, c, point: a })),
    sa(`상수함수 ${inlineMath(`f(x)=${c}`)}의 미분계수는?`, 0, "함수값의 변화량이 항상 0이므로 미분계수는 0입니다.", "수평선의 기울기를 생각하세요.", calculusVisual("tangent", { q: 0, l: 0, c, point: a })),
    sa(`${inlineMath(`f(x)=${quadraticExpression(q, l, c)}`)}에서 ${inlineMath(`h=0.1,0.01,0.001`)}로 줄인 차분몫이 가까워지는 값, 즉 ${inlineMath(`f'(${a})`)}는?`, derivativeAtA, `${inlineMath(`\\frac{f(${a}+h)-f(${a})}{h}`)}에서 h가 0으로 가까워질 때 남는 값은 ${derivativeAtA}입니다.`, "여러 할선 기울기의 공통 도착값을 읽으세요.", calculusVisual("secant", { q, l, c, a, b: a + 0.5 })),
    sa(`${inlineMath(`\\lim_{h\\to0}\\frac{(${a}+h)^2+(${a}+h)-(${a ** 2 + a})}{h}`)}의 값은?`, definitionValue, `${inlineMath(`f(x)=x^2+x`)}의 ${inlineMath(`x=${a}`)}에서의 미분계수이므로 ${definitionValue}입니다.`, "분자를 전개한 뒤 h를 약분하고 h를 0으로 보내세요.", calculusVisual("definition", { point: a, slope: definitionValue })),
    mc(`${inlineMath(`f'(${a})<0`)}이 뜻하는 그래프의 상태는?`, ["그 점에서 오른쪽으로 갈수록 내려간다.", "그 점에서 반드시 최솟값을 갖는다.", "그 점에서 함수값이 음수다.", "그 점에서 불연속이다."], 0, "미분계수의 부호는 접선의 기울기와 순간적인 증가·감소 방향을 나타냅니다.", "함수값의 부호가 아니라 접선 기울기의 부호를 읽으세요.", calculusVisual("definition", { point: a, slope: -Math.abs(derivativeAtA || 1) })),
  ];
}

function differentiabilityProblems() {
  const point = randomInteger(-4, 4);
  const slope = nonZero(-5, 5);
  const leftSlope = nonZero(-5, 5);
  const rightSlope =
    leftSlope + nonZero(1, 4);
  const value = randomInteger(-5, 5);

  return [
    mc(`${inlineMath(`x=${point}`)}에서 미분가능하면 반드시 참인 것은?`, ["그 점에서 연속이다.", "그 점에서 극대이다.", "함수값이 0이다.", "도함수가 양수이다."], 0, "미분가능한 함수는 그 점에서 반드시 연속입니다.", "미분가능성과 연속성의 한 방향 포함 관계를 기억하세요.", calculusVisual("differentiability", { point })),
    mc(`${inlineMath(`f(x)=|${xMinus(point)}|`)}는 ${inlineMath(`x=${point}`)}에서?`, ["연속이고 미분가능하다.", "연속이지만 미분가능하지 않다.", "불연속이지만 미분가능하다.", "함수값이 없다."], 1, "뾰족점에서 좌우 기울기가 -1과 1로 달라 미분가능하지 않습니다.", "그래프는 이어져 있어도 접선 기울기가 하나인지 확인하세요.", calculusVisual("cusp", { point })),
    sa(`${displayMath(`f(x)=\\begin{cases}${leftSlope}(${xMinus(point)})+${value},&x<${point}\\\\k(${xMinus(point)})+${value},&x\\ge${point}\\end{cases}`)}\n${inlineMath(`x=${point}`)}에서 미분가능할 때 k는?`, leftSlope, "연속성은 이미 맞고 좌우 기울기가 같아야 하므로 k는 왼쪽 기울기와 같습니다.", "좌미분계수와 우미분계수를 같게 놓으세요.", calculusVisual("piecewise-slope", { point, leftSlope, value })),
    mc(`좌미분계수가 ${leftSlope}, 우미분계수가 ${rightSlope}인 함수는 그 점에서?`, ["미분가능하다.", "미분가능하지 않다.", "반드시 불연속이다.", "반드시 극소이다."], 1, "양쪽 미분계수가 다르면 하나의 미분계수가 존재하지 않습니다.", "좌우 기울기를 먼저 비교하세요.", calculusVisual("piecewise-slope", { leftSlope, rightSlope })),
    mc(`다항함수 ${inlineMath(`f(x)=${slope}x^3${signedNumber(value)}`)}에 대한 옳은 설명은?`, ["모든 실수에서 미분가능하다.", "x=0에서만 미분가능하다.", "항상 불연속이다.", "양수 구간에서만 연속이다."], 0, "다항함수는 모든 실수에서 연속이고 미분가능합니다.", "다항함수의 기본 성질을 사용하세요.", calculusVisual("smooth", { slope, value })),
    mc(`함수가 x=${point}에서 불연속이면 미분가능성은?`, ["반드시 미분가능하다.", "미분가능하지 않다.", "도함수가 0이다.", "좌미분계수만 존재한다."], 1, "미분가능이면 연속이어야 하므로 그 대우에 의해 불연속이면 미분불가능입니다.", "미분가능 ⇒ 연속의 대우를 사용하세요.", calculusVisual("discontinuity", { point })),
    sa(`${displayMath(`f(x)=\\begin{cases}${leftSlope}x+k,&x<${point}\\\\${leftSlope}x${signedNumber(value)},&x\\ge${point}\\end{cases}`)}\n${inlineMath(`x=${point}`)}에서 연속이 되게 하는 k는?`, value, "양쪽 식의 x계수가 같으므로 상수항도 같아야 함수값과 극한이 일치합니다.", "경계점에서 두 식의 값을 같게 놓으세요.", calculusVisual("piecewise-value", { point, leftSlope })),
    mc(`x=${point}에서 연속이지만 좌우 접선 기울기가 다른 그래프의 특징은?`, ["그 점에서 미분가능하다.", "뾰족점이 생길 수 있다.", "함수값이 없다.", "극한이 존재하지 않는다."], 1, "연속이어도 뾰족점에서는 좌우 기울기가 달라 미분가능하지 않습니다.", "연속성과 매끄러움을 구분하세요.", calculusVisual("cusp", { point })),
    sa(`좌미분계수와 우미분계수가 모두 ${slope}일 때 그 점의 미분계수는?`, slope, "두 일방 미분계수가 같은 값으로 존재하므로 미분계수는 그 공통값입니다.", "두 값이 같으면 그 값을 그대로 씁니다.", calculusVisual("differentiability", { slope })),
    mc(`다음 중 연속이지만 ${inlineMath(`x=${point}`)}에서 미분가능하지 않은 함수는?`, [`${inlineMath(`|${xMinus(point)}|`)}`, `${inlineMath(`(${xMinus(point)})^2`)}`, `${inlineMath(`x${signedNumber(value)}`)}`, `${inlineMath(String(value))}`], 0, "절댓값 함수는 꼭짓점에서 좌우 기울기가 다릅니다.", "그래프에 뾰족점이 있는지 확인하세요.", calculusVisual("cusp", { point })),
  ];
}

function powerDerivativeProblems() {
  const n = randomInteger(2, 8);
  const coefficient = nonZero(-5, 5);
  const point = choose([-2, -1, 1, 2]);

  return [
    sa(`${inlineMath(`f(x)=x^{${n}}`)}일 때 ${inlineMath(`f'(${point})`)}는?`, n * point ** (n - 1), `${inlineMath(`f'(x)=${n}x^{${n - 1}}`)}입니다.`, "지수를 앞으로 내리고 지수를 1 줄이세요.", calculusVisual("power", { n, point })),
    sa(`${inlineMath(`(${coefficient}x^{${n}})'`)}의 x=${point}에서의 값은?`, coefficient * n * point ** (n - 1), `${inlineMath(`${coefficient * n}x^{${n - 1}}`)}에 x=${point}를 대입합니다.`, "상수배는 유지한 채 거듭제곱을 미분하세요.", calculusVisual("power", { coefficient, n, point })),
    mc(`${inlineMath(`(x^{${n}})'`)}와 같은 것은?`, [`${inlineMath(`${n}x^{${n - 1}}`)}`, `${inlineMath(`${n - 1}x^{${n}}`)}`, `${inlineMath(`x^{${n - 1}}`)}`, `${inlineMath(`${n}x^{${n}}`)}`], 0, "지수는 계수로 내려오고 1만큼 작아집니다.", "계수와 지수 변화 둘 다 확인하세요.", calculusVisual("power", { n })),
    sa(`${inlineMath(`f(x)=x^{${n}}`)}의 도함수에서 x의 지수는?`, n - 1, "미분하면 지수가 1 감소합니다.", "원래 지수에서 1을 빼세요.", calculusVisual("power", { n })),
    sa(`${inlineMath(`f'(x)=${n}x^{${n - 1}}`)}이고 ${inlineMath(`f(x)=x^m`)}일 때 m은?`, n, "거듭제곱함수의 미분 규칙에서 도함수의 계수는 원래 지수입니다.", "도함수 앞의 계수를 읽으세요.", calculusVisual("power", { n })),
    sa(`${inlineMath(`f(x)=x^{${n + 1}}`)}일 때 ${inlineMath(`f'(1)`)}은?`, n + 1, `${inlineMath(`f'(x)=${n + 1}x^{${n}}`)}이므로 x=1에서 ${n + 1}입니다.`, "1의 거듭제곱은 모두 1입니다.", calculusVisual("power", { n: n + 1, point: 1 })),
    sa(`${inlineMath(`f(x)=${coefficient}x^2`)}일 때 접선 기울기가 ${2 * coefficient * point}이 되는 x는?`, point, `${inlineMath(`f'(x)=${2 * coefficient}x`)}이므로 방정식을 풀면 x=${point}입니다.`, "도함수를 주어진 기울기와 같게 놓으세요.", calculusVisual("power", { coefficient, n: 2, point })),
    mc(`거듭제곱함수 미분의 올바른 순서는?`, ["지수를 계수로 내리고 지수를 1 줄인다.", "지수를 1 늘리고 그 수로 나눈다.", "계수만 제곱한다.", "지수만 0으로 만든다."], 0, "미분에서는 지수를 내린 뒤 1 줄입니다.", "적분 규칙과 혼동하지 마세요.", calculusVisual("power", { n })),
    sa(`${inlineMath(`\\frac{d}{dx}(${coefficient}x)`)}은?`, coefficient, `일차함수의 도함수는 x의 계수 ${coefficient}입니다.`, "일차함수의 기울기를 읽으세요.", calculusVisual("power", { coefficient, n: 1 })),
    sa(`${inlineMath(`\\frac{d}{dx}(${coefficient}x^{${n}}+${randomInteger(-5, 5)})`)}에서 최고차항의 계수는?`, coefficient * n, "상수항은 사라지고 최고차항의 계수에는 지수가 곱해집니다.", "최고차항만 미분해 계수를 보세요.", calculusVisual("power", { coefficient, n })),
  ];
}

function polynomialDerivativeProblems() {
  const a = nonZero(-4, 4);
  const b = nonZero(-6, 6);
  const c = randomInteger(-8, 8);
  const d = randomInteger(-8, 8);
  const point = choose([-2, -1, 0, 1, 2]);
  const derivativeAt =
    3 * a * point ** 2 +
    2 * b * point +
    c;

  return [
    sa(`${inlineMath(`f(x)=${powerTerm(a, 3)}${signedTerm(b, 2)}${signedTerm(c, 1)}${signedNumber(d)}`)}일 때 ${inlineMath(`f'(${point})`)}는?`, derivativeAt, "각 항을 미분한 뒤 x값을 대입합니다.", "상수항의 도함수는 0입니다.", calculusVisual("polynomial", { coefficients: [d, c, b, a], point })),
    sa(`${inlineMath(`(${powerTerm(a, 3)}${signedTerm(b, 2)})'`)}에서 x²의 계수는?`, 3 * a, "삼차항을 미분하면 계수에 3을 곱한 이차항이 됩니다.", "최고차항만 먼저 미분하세요.", calculusVisual("polynomial", { coefficients: [0, 0, b, a] })),
    sa(`${inlineMath(`f(x)=${quadraticExpression(a, b, c)}`)}의 도함수에서 상수항은?`, b, `${inlineMath(`f'(x)=${2 * a}x${signedNumber(b)}`)}입니다.`, "일차항을 미분하면 그 계수가 상수항이 됩니다.", calculusVisual("polynomial", { coefficients: [c, b, a] })),
    mc(`다항함수의 미분에 대한 옳은 설명은?`, ["각 항을 따로 미분해 더할 수 있다.", "합을 미분하면 항상 곱이 된다.", "상수항은 그대로 남는다.", "모든 계수는 사라진다."], 0, "미분은 합과 상수배에 대해 선형입니다.", "항별 미분이 가능한지 생각하세요.", calculusVisual("polynomial")),
    sa(`${inlineMath(`f(x)=${a}x^3${signedTerm(c, 1)}`)}일 때 ${inlineMath(`f'(0)`)}은?`, c, "삼차항의 도함수는 x=0에서 0이고 일차항의 계수만 남습니다.", "도함수를 구한 뒤 0을 대입하세요.", calculusVisual("polynomial", { coefficients: [0, c, 0, a], point: 0 })),
    sa(`${inlineMath(`f'(x)=${3 * a}x^2${signedTerm(2 * b, 1)}${signedNumber(c)}`)} 이고 f가 삼차함수일 때 f의 최고차항 계수는?`, a, "삼차항을 미분할 때 계수에 3이 곱해집니다.", "도함수의 x² 계수를 3으로 나누세요.", calculusVisual("polynomial", { coefficients: [d, c, b, a] })),
    sa(`${inlineMath(`g(x)=${quadraticExpression(a, b, c)}`)}일 때 ${inlineMath(`(2g)'(${point})`)}는?`, 2 * (2 * a * point + b), "상수배의 미분은 도함수에도 같은 상수배가 적용됩니다.", "먼저 g′을 구한 뒤 2를 곱하세요.", calculusVisual("polynomial", { coefficients: [2 * c, 2 * b, 2 * a], point })),
    sa(`${inlineMath(`f'(${point})=${derivativeAt}`)}일 때 ${inlineMath(`(-3f)'(${point})`)}는?`, -3 * derivativeAt, "상수배 -3은 미분 뒤에도 그대로 곱해집니다.", "주어진 미분계수에 -3을 곱하세요.", calculusVisual("polynomial", { point, slope: -3 * derivativeAt })),
    mc(`${inlineMath(`(${powerTerm(a, 2)}${signedNumber(c)})'`)}는?`, [`${inlineMath(powerTerm(2 * a, 1))}`, `${inlineMath(powerTerm(a, 1))}`, `${inlineMath(`${powerTerm(2 * a, 1)}+1`)}`, `${inlineMath(powerTerm(a, 2))}`], 0, "상수항은 사라지고 이차항은 일차항이 됩니다.", "각 항을 따로 미분하세요.", calculusVisual("polynomial", { coefficients: [c, 0, a] })),
    sa(`${inlineMath(`f(x)=${a}x^3${signedTerm(b, 2)}${signedTerm(c, 1)}${signedNumber(d)}`)}의 도함수 차수는?`, 2, "삼차다항함수의 최고차항을 미분하면 이차항이 됩니다.", "최고차항의 지수가 1 줄어듭니다.", calculusVisual("polynomial", { coefficients: [d, c, b, a] })),
  ];
}

function tangentProblems() {
  const q = nonZero(1, 4);
  const l = nonZero(-5, 5);
  const c = randomInteger(-6, 6);
  const point = randomInteger(-3, 3);
  const y = q * point ** 2 + l * point + c;
  const slope = 2 * q * point + l;
  const intercept = y - slope * point;

  return [
    sa(`곡선 ${inlineMath(`y=${quadraticExpression(q, l, c)}`)}의 x=${point}인 점에서 접선 기울기는?`, slope, `${inlineMath(`f'(x)=${2 * q}x${signedNumber(l)}`)}에 x=${point}를 대입합니다.`, "접선 기울기는 f′(a)입니다.", calculusVisual("tangent", { q, l, c, point })),
    sa(`곡선 ${inlineMath(`y=${quadraticExpression(q, l, c)}`)}의 x=${point}인 점에서 접선의 y절편은?`, intercept, `접점 (${point},${y})와 기울기 ${slope}를 이용하면 y=${slope}x${signedNumber(intercept)}입니다.`, "점-기울기식으로 접선을 만든 뒤 x=0을 대입하세요.", calculusVisual("tangent", { q, l, c, point })),
    sa(`기울기가 ${slope}이고 점 (${point},${y})를 지나는 직선의 y절편은?`, intercept, `${inlineMath(`y${signedNumber(-y)}=${slope}(${xMinus(point)})`)}를 정리합니다.`, `직선의 식 ${inlineMath("y=mx+b")}에 점을 대입해 상수항을 구하세요.`, calculusVisual("line", { point, y, slope })),
    mc(`곡선 y=f(x)의 x=${point}인 점에서 접선 방정식은?`, [
      `${inlineMath(`y-f(${point})=f'(${point})(${xMinus(point)})`)}`,
      `${inlineMath(`y=f(${point})x`)}`,
      `${inlineMath(`y-f'(${point})=f(${point})(${xMinus(point)})`)}`,
      `${inlineMath(`y=f(x)-f(${point})`)}`,
    ], 0, "접점과 그 점에서의 미분계수를 점-기울기식에 넣습니다.", "직선이 지나야 하는 점과 기울기를 확인하세요.", calculusVisual("tangent", { point })),
    sa(`${inlineMath(`f(${point})=${y},\\;f'(${point})=${slope}`)}일 때 접선의 x=${point + 1}에서의 y값은?`, y + slope, "접점에서 x가 1만큼 변하면 접선 위 y는 기울기만큼 변합니다.", "접선식에 x=a+1을 넣으세요.", calculusVisual("tangent", { point, y, slope })),
    sa(`곡선 ${inlineMath(`y=${q}x^2`)}에서 접선 기울기가 ${2 * q * point}인 점의 x좌표는?`, point, `${inlineMath(`y'=${2 * q}x`)}를 주어진 기울기와 같게 놓습니다.`, "도함수=접선 기울기 방정식을 푸세요.", calculusVisual("tangent", { q, point })),
    sa(`곡선 ${inlineMath(`y=${quadraticExpression(q, l, c)}`)} 위 x=${point}인 접점의 y좌표는?`, y, "원함수에 접점의 x좌표를 대입합니다.", "도함수가 아니라 원함수에 대입하세요.", calculusVisual("tangent", { q, l, c, point })),
    mc(`접선의 방정식을 구할 때 필요하지 않은 것은?`, ["곡선 전체의 넓이", "접점의 x좌표", "접점의 함수값", "접점에서의 미분계수"], 0, "접선은 한 점과 그 점에서의 기울기로 결정됩니다.", "점-기울기식에 들어가는 정보를 떠올리세요.", calculusVisual("tangent", { point })),
    sa(`${inlineMath(`f'(${point})=${slope}`)}일 때 그 점에서 접선과 평행한 직선의 기울기는?`, slope, "평행한 두 직선의 기울기는 같습니다.", "접선 기울기는 f′(a)입니다.", calculusVisual("line", { slope })),
    sa(`접선 ${inlineMath(`y=${slope}x${signedNumber(intercept)}`)}이 곡선과 만나는 접점의 x좌표가 ${point}일 때 접점의 y좌표는?`, y, `접선식에 x=${point}를 대입하면 y=${y}입니다.`, "접점은 접선 위에도 있습니다.", calculusVisual("tangent", { point, y, slope })),
  ];
}

function meanValueProblems() {
  const a = randomInteger(-4, 1);
  const b = a + randomInteger(2, 6);
  const q = nonZero(1, 4);
  const l = nonZero(-4, 4);
  const c = randomInteger(-5, 5);
  const average = q * (a + b) + l;
  const meanPoint = (a + b) / 2;

  return [
    sa(`${inlineMath(`f(x)=${quadraticExpression(q, l, c)}`)}에서 [${a},${b}]의 평균변화율은?`, average, `${inlineMath(`\\frac{f(${b})-f(${a})}{${b}-${a}}=${average}`)}입니다.`, "두 끝점을 잇는 할선 기울기를 구하세요.", calculusVisual("mvt", { q, l, c, a, b })),
    sa(`위 함수에서 평균값 정리를 만족하는 c는? ${inlineMath(`f(x)=${quadraticExpression(q, l, c)},\\;[${a},${b}]`)}`, meanPoint, `${inlineMath(`f'(c)=${2 * q}c${signedNumber(l)}=${average}`)}를 풀면 c=${meanPoint}입니다.`, "도함수를 평균변화율과 같게 놓으세요.", calculusVisual("mvt", { q, l, c, a, b, meanPoint })),
    mc(`평균값 정리를 [${a},${b}]에서 적용하기 위한 조건은?`, ["닫힌구간에서 연속, 열린구간에서 미분가능", "닫힌구간에서만 미분가능", "양 끝 함수값이 같음", "도함수가 항상 0"], 0, "닫힌구간 연속과 열린구간 미분가능이 핵심 조건입니다.", "끝점에서는 미분가능까지 요구하지 않습니다.", calculusVisual("mvt", { a, b })),
    sa(`함수의 [${a},${b}] 평균변화율이 ${average}라면 평균값 정리가 보장하는 어떤 c에서의 f′(c)는?`, average, "평균값 정리는 순간변화율이 평균변화율과 같은 점의 존재를 보장합니다.", "주어진 평균변화율을 그대로 사용하세요.", calculusVisual("mvt", { a, b, average })),
    mc(`평균값 정리의 기하적 의미는?`, ["할선과 평행한 접선이 적어도 하나 존재한다.", "모든 접선이 서로 평행하다.", "그래프가 직선이다.", "함수값이 항상 양수다."], 0, "같은 기울기를 갖는 할선과 접선은 평행합니다.", "평균변화율과 순간변화율을 직선 기울기로 해석하세요.", calculusVisual("mvt", { a, b })),
    sa(`일차함수 ${inlineMath(`f(x)=${l}x${signedNumber(c)}`)}의 임의 구간에서 평균변화율은?`, l, "일차함수는 모든 구간의 할선 기울기가 함수의 기울기와 같습니다.", "x의 계수를 읽으세요.", calculusVisual("mvt", { l, c, a, b })),
    mc(`${inlineMath(`f(x)=|${xMinus(meanPoint)}|`)}에 [${a},${b}]에서 평균값 정리를 바로 적용할 수 없는 이유는?`, ["구간 안의 뾰족점에서 미분가능하지 않다.", "함수가 연속이 아니다.", "구간이 닫혀 있지 않다.", "함수값이 모두 같다."], 0, "절댓값 함수는 꼭짓점에서 미분가능하지 않습니다.", "열린구간 안의 미분가능성을 확인하세요.", calculusVisual("cusp", { point: meanPoint })),
    sa(`${inlineMath(`f(${a})=${c},\\;f(${b})=${c + average * (b - a)}`)}일 때 [${a},${b}]의 평균변화율은?`, average, "함수값의 차를 구간 길이로 나눕니다.", "분자는 f(b)-f(a)입니다.", calculusVisual("secant", { a, b })),
    mc(`평균값 정리가 보장하는 c의 위치는?`, [`${inlineMath(`(${a},${b})`)}`, `${inlineMath(`[${a},${b}]`)}의 바깥`, "항상 a", "항상 b"], 0, "c는 열린구간 (a,b) 안에 존재합니다.", "정리의 결론에서 c의 범위를 확인하세요.", calculusVisual("mvt", { a, b })),
    sa(`평균변화율이 ${average}이고 어떤 c에서 ${inlineMath(`f'(c)=k`)}라 할 때 평균값 정리의 결론에 따른 k는?`, average, "평균값 정리에서 f′(c)는 평균변화율과 같습니다.", "두 기울기를 같게 놓으세요.", calculusVisual("mvt", { average })),
  ];
}

function extremaProblems() {
  const r = randomInteger(1, 4);
  const scale = nonZero(1, 3);
  const vertexX = randomInteger(-4, 4);
  const constant = randomInteger(-5, 5);
  const vertexValue = constant;
  const cubicAtNegative =
    2 * scale * r ** 3;
  const cubicAtPositive =
    -2 * scale * r ** 3;

  return [
    sa(`${inlineMath(`f(x)=${scale}(${xMinus(vertexX)})^2${signedNumber(constant)}`)}의 극소가 되는 x는?`, vertexX, "위로 열린 포물선의 꼭짓점에서 극소가 됩니다.", "꼭짓점형에서 x좌표를 읽으세요.", calculusVisual("extrema", { scale, vertexX, constant })),
    sa(`위 함수의 극솟값은? ${inlineMath(`f(x)=${scale}(${xMinus(vertexX)})^2${signedNumber(constant)}`)}`, vertexValue, "제곱항이 0일 때 함수값은 상수항입니다.", "꼭짓점의 y좌표를 읽으세요.", calculusVisual("extrema", { scale, vertexX, constant })),
    mc(`${inlineMath(`f'(x)>0`)}인 구간에서 f는?`, ["증가한다.", "감소한다.", "항상 0이다.", "불연속이다."], 0, "접선 기울기가 양수이면 x가 증가할수록 함수값이 증가합니다.", "도함수의 부호를 기울기로 해석하세요.", calculusVisual("sign-chart", { sign: 1 })),
    mc(`도함수의 부호가 +에서 -로 바뀌는 점은?`, ["극대점", "극소점", "항상 변곡점", "불연속점"], 0, "증가하다 감소하므로 봉우리인 극대가 됩니다.", "함수의 진행 방향 변화를 읽으세요.", calculusVisual("sign-chart", { signs: [1, -1] })),
    sa(`${inlineMath(`f'(x)=${scale}(x-${r})(x+${r})`)}의 임계점 중 양수인 것은?`, r, "도함수가 0이 되는 x는 ±r입니다.", "각 인자를 0으로 놓으세요.", calculusVisual("sign-chart", { roots: [-r, r], scale })),
    mc(`${inlineMath(`f'(x)=${scale > 0 ? "" : "-"}(x-${r})(x+${r})`)}에서 도함수의 부호가 바뀌는 지점의 개수는?`, ["2개", "1개", "0개", "무한히 많다"], 0, "서로 다른 두 단순근 ±r에서 부호가 각각 바뀝니다.", "도함수의 근과 중복도를 확인하세요.", calculusVisual("sign-chart", { roots: [-r, r], scale })),
    sa(`${inlineMath(`f(x)=${scale}x^3-${3 * scale * r ** 2}x`)}에서 x=-${r}일 때 함수값은?`, cubicAtNegative, "원함수에 x=-r을 대입합니다.", "극값의 위치를 찾은 뒤 원함수값을 계산하세요.", calculusVisual("extrema", { r, scale })),
    sa(`${inlineMath(`f(x)=${scale}x^3-${3 * scale * r ** 2}x`)}에서 x=${r}일 때 함수값은?`, cubicAtPositive, "원함수에 x=r을 대입합니다.", "도함수가 아니라 원함수에 대입하세요.", calculusVisual("extrema", { r, scale })),
    mc(`극값을 판정할 때 가장 직접적으로 필요한 것은?`, ["임계점 양쪽에서 도함수의 부호 변화", "함수식의 글자 수", "y절편만", "정의역의 길이만"], 0, "극대·극소는 임계점 주변의 증가·감소 변화로 판정합니다.", "도함수 부호표를 떠올리세요.", calculusVisual("sign-chart", { r })),
    sa(`${inlineMath(`f'(x)=2(${xMinus(vertexX)})`)}일 때 f가 감소하는 구간의 오른쪽 경계는?`, vertexX, `도함수는 ${inlineMath(`x<${vertexX}`)}에서 음수이므로 그 점까지 감소합니다.`, "도함수가 0보다 작은 부등식을 푸세요.", calculusVisual("sign-chart", { root: vertexX })),
  ];
}

function graphShapeProblems() {
  const r = randomInteger(1, 4);
  const scale = nonZero(1, 3);
  const shift = randomInteger(-4, 4);

  return [
    mc(`${inlineMath(`f'(x)=${scale > 0 ? "" : "-"}(${xMinus(shift)})`)}이고 ${scale > 0 ? "계수가 양수" : "계수가 음수"}일 때 f의 그래프는 x=${shift}에서?`, scale > 0 ? ["극소", "극대", "변화 없음", "불연속"] : ["극대", "극소", "변화 없음", "불연속"], 0, "도함수의 부호 변화로 꼭짓점의 종류를 판정합니다.", "임계점 좌우의 부호를 확인하세요.", calculusVisual("graph-shape", { shift, scale })),
    sa(`${inlineMath(`f(x)=${scale}(${xMinus(shift)})^2`)}의 대칭축은 x=?`, shift, `꼭짓점형 이차함수의 대칭축은 ${inlineMath(`x=${shift}`)}입니다.`, "제곱 안을 0으로 만드는 x를 찾으세요.", calculusVisual("graph-shape", { shift, scale })),
    mc(`삼차함수의 도함수가 서로 다른 두 실근을 가지면 가능한 그래프 모양은?`, ["극대와 극소를 각각 하나 가질 수 있다.", "항상 직선이다.", "극값이 절대 없다.", "정의역이 한 점이다."], 0, "도함수의 두 단순근에서 증가·감소가 바뀌면 두 극값이 생깁니다.", "임계점의 개수를 그래프 방향 전환과 연결하세요.", calculusVisual("graph-shape", { roots: [-r, r] })),
    sa(`${inlineMath(`f(x)=x^3-${3 * r ** 2}x`)}의 임계점 사이 구간 길이는?`, 2 * r, "도함수 3(x-r)(x+r)=0의 두 근은 -r,r입니다.", "두 임계점의 차를 구하세요.", calculusVisual("graph-shape", { roots: [-r, r] })),
    mc(`최고차항 계수가 양수인 삼차함수의 양 끝 방향은?`, ["왼쪽 아래, 오른쪽 위", "왼쪽 위, 오른쪽 아래", "양쪽 모두 위", "양쪽 모두 아래"], 0, "양의 삼차항은 x→-∞에서 -∞, x→∞에서 ∞입니다.", "최고차항만 보아 끝모양을 판단하세요.", calculusVisual("graph-shape", { degree: 3, leading: 1 })),
    mc(`최고차항 계수가 ${scale > 0 ? "양수" : "음수"}인 이차함수는?`, scale > 0 ? ["위로 열린다.", "아래로 열린다.", "항상 증가한다.", "직선이다."] : ["아래로 열린다.", "위로 열린다.", "항상 증가한다.", "직선이다."], 0, "이차항 계수의 부호가 포물선이 열리는 방향을 정합니다.", "최고차항 계수의 부호를 보세요.", calculusVisual("graph-shape", { degree: 2, leading: scale })),
    sa(`${inlineMath(`f'(x)=3(x-${r})(x+${r})`)}일 때 증가·감소 구간을 나누는 경계점의 개수는?`, 2, "도함수의 서로 다른 두 영점이 구간 경계가 됩니다.", "f′(x)=0의 실근 개수를 세세요.", calculusVisual("sign-chart", { roots: [-r, r] })),
    mc(`그래프 개형을 그릴 때 가장 먼저 확인할 정보로 적절한 것은?`, ["정의역과 절편, 끝모양", "정적분 상수만", "표본의 크기", "확률의 합"], 0, "그래프의 기본 위치와 전체 방향을 먼저 잡아야 합니다.", "미분 전에도 알 수 있는 정보를 찾으세요.", calculusVisual("graph-shape")),
    sa(`${inlineMath(`f(x)=(${xMinus(shift)})^2${signedNumber(r)}`)}의 꼭짓점 y좌표는?`, r, "제곱항이 0일 때 y=r입니다.", "꼭짓점형에서 상수항을 읽으세요.", calculusVisual("graph-shape", { shift, vertexY: r })),
    mc(`도함수가 모든 실수에서 양수인 함수의 그래프는?`, ["전체 구간에서 증가한다.", "전체 구간에서 감소한다.", "항상 x축 위다.", "항상 직선이다."], 0, "도함수 양수는 모든 점의 접선 기울기가 양수라는 뜻입니다.", "함수값의 부호와 기울기의 부호를 구분하세요.", calculusVisual("graph-shape", { derivativePositive: true })),
  ];
}

function equationInequalityProblems() {
  const shift = randomInteger(-5, 5);
  const minimum = randomInteger(-5, 5);
  const k = minimum + randomInteger(-3, 3);
  const r = randomInteger(1, 5);

  return [
    sa(`${inlineMath(`f(x)=(${xMinus(shift)})^2${signedNumber(minimum)}`)}의 최솟값은?`, minimum, "제곱항의 최솟값은 0입니다.", "꼭짓점의 y좌표를 읽으세요.", calculusVisual("equation", { shift, minimum })),
    mc(`${inlineMath(`(${xMinus(shift)})^2${signedNumber(minimum)}=${k}`)}의 실근 개수는?`, k > minimum ? ["2개", "1개", "0개", "무한히 많다"] : k === minimum ? ["1개", "2개", "0개", "무한히 많다"] : ["0개", "1개", "2개", "무한히 많다"], 0, `포물선의 최솟값 ${minimum}과 수평선 y=${k}를 비교합니다.`, "수평선과 그래프의 교점 수로 해석하세요.", calculusVisual("equation", { shift, minimum, k })),
    sa(`${inlineMath(`(${xMinus(shift)})^2\\ge${r ** 2}`)}의 경계 중 큰 값은?`, shift + r, `등호의 해는 ${inlineMath(`x=${shift}\\pm${r}`)}입니다.`, "제곱 부등식의 경계부터 구하세요.", calculusVisual("inequality", { shift, r })),
    sa(`${inlineMath(`(${xMinus(shift)})^2\\le${r ** 2}`)}의 해 구간 길이는?`, 2 * r, `해는 ${shift - r}≤x≤${shift + r}이므로 길이는 ${2 * r}입니다.`, "두 경계값의 차를 구하세요.", calculusVisual("inequality", { shift, r })),
    mc(`함수의 최솟값이 ${minimum}일 때 방정식 f(x)=${minimum - 1}의 실근은?`, ["없다.", "1개다.", "2개다.", "항상 3개다."], 0, "수평선이 그래프의 최솟값보다 아래에 있어 만나지 않습니다.", "함숫값의 가능한 범위를 확인하세요.", calculusVisual("equation", { minimum })),
    mc(`방정식 f(x)=k의 실근 개수를 그래프로 판단할 때 세는 것은?`, ["y=f(x)와 y=k의 교점", "f′(x)의 계수", "x축 눈금 수", "정의역의 글자 수"], 0, "방정식의 해는 두 그래프가 같은 y값을 갖는 x좌표입니다.", "등식을 두 그래프의 만남으로 바꾸세요.", calculusVisual("equation", { k })),
    sa(`${inlineMath(`f(x)=-(${xMinus(shift)})^2${signedNumber(minimum)}`)}의 최댓값은?`, minimum, "음의 제곱항은 0일 때 가장 큽니다.", "아래로 열린 포물선의 꼭짓점을 보세요.", calculusVisual("equation", { shift, maximum: minimum })),
    mc(`${inlineMath(`f'(x)=2(${xMinus(shift)})`)}일 때 f의 최솟값이 생기는 x는?`, [`${inlineMath(String(shift))}`, `${inlineMath(String(shift + 1))}`, `${inlineMath(String(shift - 1))}`, "존재하지 않음"], 0, `도함수가 음수에서 양수로 바뀌는 ${inlineMath(`x=${shift}`)}에서 극소입니다.`, "도함수가 0인 지점을 구하고 부호 변화를 보세요.", calculusVisual("sign-chart", { root: shift })),
    sa(`${inlineMath(`x^2-${2 * r}x+k`)}가 모든 실수 x에서 0 이상이 되기 위한 k의 최솟값은?`, r ** 2, `${inlineMath(`(x-${r})^2+k-${r ** 2}`)}의 최솟값이 0 이상이어야 합니다.`, "완전제곱식으로 바꾸어 최솟값을 구하세요.", calculusVisual("inequality", { r })),
    mc(`부등식 f(x)≥0의 해는 그래프에서?`, ["x축 위 또는 x축 위의 점에 해당하는 x", "y축 오른쪽의 모든 x", "도함수가 0인 점만", "그래프의 넓이"], 0, "함수값의 부호는 그래프가 x축보다 위인지 아래인지로 읽습니다.", "y=f(x)의 높이를 x축과 비교하세요.", calculusVisual("inequality")),
  ];
}

function motionProblems() {
  const a = nonZero(1, 4);
  const b = -randomInteger(1, 6);
  const c = randomInteger(-5, 5);
  const time = randomInteger(1, 5);
  const velocity = 2 * a * time + b;
  const acceleration = 2 * a;

  return [
    sa(`위치 ${inlineMath(`s(t)=${a}t^2${signedTerm(b, 1, "t")}${signedNumber(c)}`)}일 때 t=${time}의 속도는?`, velocity, `${inlineMath(`v(t)=s'(t)=${2 * a}t${signedNumber(b)}`)}입니다.`, "위치함수를 시간으로 한 번 미분하세요.", calculusVisual("motion", { a, b, c, time })),
    sa(`위 운동의 가속도는? ${inlineMath(`s(t)=${a}t^2${signedTerm(b, 1, "t")}${signedNumber(c)}`)}`, acceleration, `${inlineMath(`a(t)=s''(t)=${acceleration}`)}입니다.`, "위치함수를 두 번 미분하세요.", calculusVisual("motion", { a, b, c })),
    sa(`속도 ${inlineMath(`v(t)=${2 * a}t${signedNumber(b)}`)}일 때 t=${time}의 속력은?`, Math.abs(velocity), "속력은 속도의 절댓값입니다.", "방향을 나타내는 부호를 제거하세요.", calculusVisual("motion", { a, b, time })),
    sa(`위치 ${inlineMath(`s(t)=${a}t^2${signedTerm(b, 1, "t")}${signedNumber(c)}`)}에서 정지하는 시각이 양수라면 그 값은?`, round4(-b / (2 * a)), "v(t)=0을 풀어 정지 시각을 구합니다.", "위치함수를 미분한 뒤 속도를 0으로 놓으세요.", calculusVisual("motion", { a, b })),
    mc(`직선 운동에서 속도가 음수라는 뜻은?`, ["정한 양의 방향과 반대로 움직인다.", "반드시 느려진다.", "정지해 있다.", "가속도가 0이다."], 0, "속도의 부호는 운동 방향을 나타냅니다.", "속력과 속도를 구분하세요.", calculusVisual("motion")),
    mc(`속도와 가속도의 부호가 같을 때 물체의 속력은 일반적으로?`, ["증가한다.", "감소한다.", "항상 0이다.", "판단할 수 없다."], 0, "진행 방향과 같은 방향으로 가속되면 속력의 크기가 커집니다.", "속도 벡터와 가속도 방향을 비교하세요.", calculusVisual("motion", { sameSign: true })),
    sa(`속도 ${inlineMath(`v(t)=${a}t^2${signedTerm(b, 1, "t")}${signedNumber(c)}`)}일 때 t=${time}의 가속도는?`, 2 * a * time + b, `${inlineMath(`a(t)=v'(t)=${2 * a}t${signedNumber(b)}`)}입니다.`, "속도를 시간으로 미분하세요.", calculusVisual("motion", { a, b, c, time })),
    sa(`가속도가 일정하게 ${acceleration}이고 초기속도가 ${b}일 때 t=${time}의 속도는?`, acceleration * time + b, `${inlineMath(`v(t)=${b}+${acceleration}t`)}입니다.`, "초기속도에 가속도×시간을 더하세요.", calculusVisual("motion", { acceleration, initialVelocity: b, time })),
    mc(`위치·속도·가속도의 올바른 관계는?`, ["s를 미분하면 v, v를 미분하면 a", "s를 두 번 적분하면 v", "v를 미분하면 s", "a를 미분하면 v"], 0, "시간에 대한 미분 순서는 위치→속도→가속도입니다.", "변화율의 순서를 확인하세요.", calculusVisual("motion")),
    sa(`t=${time}에서 속도가 ${velocity}라면 그 순간 속력은?`, Math.abs(velocity), "속력은 속도의 크기이므로 절댓값을 취합니다.", "음수여도 이동의 빠르기는 양수입니다.", calculusVisual("motion", { time, velocity })),
  ];
}

function indefiniteIntegralProblems() {
  const n = randomInteger(1, 6);
  const coefficient = nonZero(-6, 6);
  const constant = randomInteger(-8, 8);

  return [
    sa(`${inlineMath(`\\int ${n + 1}x^{${n}}dx`)}에서 ${inlineMath(`x^{${n + 1}}`)}의 계수는?`, 1, `${inlineMath(`x^{${n + 1}}+C`)}입니다.`, "지수를 1 늘리고 새 지수로 나누세요.", calculusVisual("antiderivative", { n, coefficient: n + 1 })),
    sa(`${inlineMath(`\\int ${coefficient}dx`)}에서 x의 계수는?`, coefficient, `${inlineMath(`${coefficient}x+C`)}입니다.`, "상수함수의 원시함수는 일차함수입니다.", calculusVisual("antiderivative", { coefficient })),
    mc(`부정적분 결과에 +C를 붙이는 이유는?`, ["미분하면 모든 상수가 0이 되기 때문이다.", "적분값이 항상 양수이기 때문이다.", "x가 상수이기 때문이다.", "구간 길이를 나타내기 때문이다."], 0, "같은 도함수를 갖는 함수들은 상수만큼 차이 납니다.", "원시함수 하나가 아니라 전체 모음을 나타냅니다.", calculusVisual("antiderivative", { constant })),
    sa(`${inlineMath(`F'(x)=${coefficient}x`)}일 때 F의 x² 계수는?`, coefficient / 2, `${inlineMath(`F(x)=${fractionTex(coefficient, 2)}x^2+C`)}입니다.`, "x의 지수를 2로 늘리고 2로 나누세요.", calculusVisual("antiderivative", { coefficient, n: 1 })),
    sa(`${inlineMath(`F'(x)=0`)}이고 ${inlineMath(`F(${n})=${constant}`)}일 때 F(x)의 상수값은?`, constant, "도함수가 0인 함수는 모든 x에서 같은 상수값을 가집니다.", "변화가 없는 원시함수를 생각하세요.", calculusVisual("antiderivative", { coefficient: 0, constant })),
    mc(`${inlineMath(`\\int x^{${n}}dx`)}와 같은 것은?`, [
      `${inlineMath(`\\frac{x^{${n + 1}}}{${n + 1}}+C`)}`,
      `${inlineMath(`${n}x^{${n - 1}}+C`)}`,
      `${inlineMath(`x^{${n + 1}}+C`)}`,
      `${inlineMath(`\\frac{x^${n}}${n}+C`)}`,
    ], 0, "지수를 1 늘리고 그 새 지수로 나눕니다.", "미분 공식과 반대 방향입니다.", calculusVisual("antiderivative", { n })),
    sa(`${inlineMath(`F(x)=${coefficient}x${signedNumber(constant)}`)}일 때 F′(x)는?`, coefficient, "일차함수를 미분하면 x의 계수만 남습니다.", "적분 결과를 미분해 검산하세요.", calculusVisual("antiderivative", { coefficient, constant })),
    sa(`${inlineMath(`\\int ${2 * coefficient}x\\,dx`)}의 x² 계수는?`, coefficient, `지수 1을 2로 늘린 뒤 계수 ${2 * coefficient}을 2로 나눕니다.`, "새 지수 2로 나누세요.", calculusVisual("antiderivative", { coefficient, n: 1 })),
    mc(`서로 다른 두 원시함수 F,G에 대해 항상 일정한 것은?`, ["F(x)-G(x)", "F(x)G(x)", "F(x)/G(x)", "F(x)+G(x)의 기울기"], 0, "같은 함수를 미분 결과로 갖는 원시함수들은 상수만큼 차이 납니다.", "두 함수의 도함수 차가 0임을 이용하세요.", calculusVisual("antiderivative")),
    sa(`${inlineMath(`\\int ${coefficient * (n + 1)}x^{${n}}dx`)}에서 최고차항 계수는?`, coefficient, `새 지수 ${n + 1}로 계수를 나누면 ${coefficient}이 됩니다.`, "적분 전 계수를 새 지수로 나누세요.", calculusVisual("antiderivative", { coefficient, n })),
  ];
}

function polynomialIntegralProblems() {
  const a = nonZero(-5, 5);
  const b = nonZero(-6, 6);
  const c = randomInteger(-8, 8);
  const n = randomInteger(1, 5);

  return [
    sa(`${inlineMath(`\\int ${a * 3}x^2dx`)}에서 x³의 계수는?`, a, "지수를 3으로 늘리고 계수를 3으로 나눕니다.", "새 지수로 나누세요.", calculusVisual("antiderivative", { coefficients: [0, 0, 3 * a] })),
    sa(`${inlineMath(`\\int (${2 * a}x${signedNumber(b)})dx`)}에서 x²의 계수는?`, a, "2a를 새 지수 2로 나눕니다.", "항별로 적분하세요.", calculusVisual("antiderivative", { coefficients: [b, 2 * a] })),
    sa(`${inlineMath(`\\int (${2 * a}x${signedNumber(b)})dx`)}에서 x의 계수는?`, b, `상수항 ${b}의 원시함수는 ${inlineMath(`${b}x`)}입니다.`, "상수항도 적분하면 x가 붙습니다.", calculusVisual("antiderivative", { coefficients: [b, 2 * a] })),
    mc(`다항함수의 부정적분에 대한 옳은 설명은?`, ["각 항을 따로 적분해 더할 수 있다.", "상수항은 항상 사라진다.", "지수는 1 줄어든다.", "적분상수는 필요 없다."], 0, "적분은 합과 상수배에 대해 선형입니다.", "미분과 적분의 지수 변화를 구분하세요.", calculusVisual("antiderivative")),
    sa(`${inlineMath(`\\int ${a * (n + 1)}x^${n}dx`)}의 최고차항 계수는?`, a, "지수를 1 늘리고 새 지수 n+1로 나눕니다.", "계수와 새 지수를 약분하세요.", calculusVisual("antiderivative", { a, n })),
    sa(`${inlineMath(`F'(x)=${3 * a}x^2${signedTerm(2 * b, 1)}${signedNumber(c)}`)}일 때 F의 x³ 계수는?`, a, "x²항을 적분하면 계수를 3으로 나눕니다.", "최고차항만 역으로 미분하세요.", calculusVisual("antiderivative", { coefficients: [c, 2 * b, 3 * a] })),
    sa(`${inlineMath(`F'(x)=${2 * a}x${signedNumber(b)}`)}이고 F(0)=${c}일 때 적분상수 C는?`, c, `${inlineMath(`F(x)=${a}x^2${signedTerm(b, 1)}+C`)}에서 x=0을 넣습니다.`, "초기조건을 원시함수에 대입하세요.", calculusVisual("antiderivative", { a, b, c })),
    sa(`${inlineMath(`\\int (${a * 2}x+${b * 3}x^2)dx`)}에서 x³의 계수는?`, b, "3b x²을 적분하면 b x³입니다.", "각 항을 따로 적분하세요.", calculusVisual("antiderivative", { a, b })),
    mc(`${inlineMath(`\\int (f(x)-g(x))dx`)}는?`, ["∫f(x)dx-∫g(x)dx", "∫f(x)dx·∫g(x)dx", "f′(x)-g′(x)", "항상 0"], 0, "차의 적분은 적분의 차입니다.", "적분의 선형성을 적용하세요.", calculusVisual("antiderivative")),
    sa(`${inlineMath(`\\int ${a * 4}x^3dx`)}에서 x⁴의 계수는?`, a, "새 지수 4로 계수 4a를 나눕니다.", "지수+1, 새 지수로 나눔 순서입니다.", calculusVisual("antiderivative", { a, n: 3 })),
  ];
}

function definiteIntegralConceptProblems() {
  const a = randomInteger(-5, 1);
  const b = a + randomInteger(2, 7);
  const c = randomInteger(a + 1, b - 1);
  const height = nonZero(-5, 5);
  const value1 = randomInteger(-10, 10);
  const value2 = randomInteger(-10, 10);

  return [
    sa(`${inlineMath(`\\int_{${a}}^{${b}}${height}\\,dx`)}는?`, height * (b - a), "상수함수의 부호 있는 넓이는 높이×구간 길이입니다.", "직사각형의 넓이로 생각하세요.", calculusVisual("definite", { a, b, height })),
    sa(`${inlineMath(`\\int_{${a}}^{${b}}f(x)dx=${value1}`)}일 때 ${inlineMath(`\\int_{${b}}^{${a}}f(x)dx`)}는?`, -value1, "적분 구간의 순서를 바꾸면 부호가 바뀝니다.", "윗끝과 아랫끝 교환은 -1을 곱합니다.", calculusVisual("definite", { a, b, value: value1 })),
    sa(`${inlineMath(`\\int_{${a}}^{${c}}f(x)dx=${value1},\\;\\int_{${c}}^{${b}}f(x)dx=${value2}`)}일 때 ${inlineMath(`\\int_{${a}}^{${b}}f(x)dx`)}는?`, value1 + value2, "인접한 구간의 정적분을 더합니다.", "구간의 덧셈성을 사용하세요.", calculusVisual("definite", { a, c, b })),
    sa(`${inlineMath(`\\int_{${a}}^{${a}}f(x)dx`)}는?`, 0, "구간 길이가 0이므로 누적량도 0입니다.", "시작점과 끝점이 같습니다.", calculusVisual("definite", { a, b: a })),
    mc(`함수가 x축 아래에 있는 구간의 정적분은?`, ["음수가 될 수 있다.", "항상 실제 넓이와 같다.", "항상 0이다.", "정의되지 않는다."], 0, "정적분은 x축 아래의 넓이를 음수로 셉니다.", "정적분은 부호 있는 넓이입니다.", calculusVisual("area", { belowAxis: true })),
    sa(`${inlineMath(`\\int_{${a}}^{${b}}f(x)dx=${value1}`)}일 때 ${inlineMath(`\\int_{${a}}^{${b}}2f(x)dx`)}는?`, 2 * value1, "상수배는 적분 밖으로 나올 수 있습니다.", "적분의 선형성을 사용하세요.", calculusVisual("definite", { a, b, value: value1 })),
    sa(`${inlineMath(`\\int_{${a}}^{${b}}f(x)dx=${value1},\\;\\int_{${a}}^{${b}}g(x)dx=${value2}`)}일 때 ${inlineMath(`\\int_{${a}}^{${b}}(f+g)dx`)}는?`, value1 + value2, "합의 적분은 적분의 합입니다.", "같은 구간의 두 값을 더하세요.", calculusVisual("definite", { a, b })),
    mc(`정적분을 직사각형 합의 극한으로 볼 때 분할을 촘촘하게 한다는 뜻은?`, ["각 작은 구간의 폭이 0에 가까워진다.", "함수값을 모두 0으로 만든다.", "구간을 없앤다.", "적분상수를 크게 한다."], 0, "리만합에서 최대 구간 폭이 0으로 가까워집니다.", "직사각형의 폭 변화를 생각하세요.", calculusVisual("riemann", { a, b })),
    sa(`폭이 ${b - a}, 높이가 ${Math.abs(height)}인 직사각형 모양의 함수가 x축 위에 있을 때 정적분은?`, Math.abs(height) * (b - a), "x축 위에서는 정적분과 실제 넓이가 같습니다.", "가로×세로를 계산하세요.", calculusVisual("area", { width: b - a, height: Math.abs(height) })),
    mc(`${inlineMath(`\\int_{${a}}^{${b}}f(x)dx`)}가 나타내는 것은?`, ["구간에서의 부호 있는 누적량", "항상 도형의 실제 넓이", "한 점의 함수값", "접선의 기울기"], 0, "정적분은 위쪽과 아래쪽을 부호와 함께 합한 값입니다.", "넓이와 부호 있는 넓이를 구분하세요.", calculusVisual("definite", { a, b })),
  ];
}

function fundamentalTheoremProblems() {
  const a = randomInteger(-3, 1);
  const b = a + randomInteger(2, 5);
  const coefficient = nonZero(-4, 4);
  const constant = randomInteger(-5, 5);
  const upperValue =
    coefficient * b ** 2 + constant * b;
  const lowerValue =
    coefficient * a ** 2 + constant * a;

  return [
    sa(`${inlineMath(`\\int_{${a}}^{${b}}${2 * coefficient}x\\,dx`)}는?`, coefficient * (b ** 2 - a ** 2), `${inlineMath(`[${coefficient}x^2]_{${a}}^{${b}}`)}로 계산합니다.`, "원시함수에 윗끝과 아랫끝을 대입해 빼세요.", calculusVisual("fundamental", { a, b, coefficient })),
    sa(`${inlineMath(`F(x)=${coefficient}x^2${signedTerm(constant, 1)}`)}일 때 ${inlineMath(`F(${b})-F(${a})`)}는?`, upperValue - lowerValue, "각 끝값을 계산해 윗값에서 아랫값을 뺍니다.", "대입 순서를 바꾸지 마세요.", calculusVisual("fundamental", { a, b, coefficient, constant })),
    mc(`${inlineMath(`F'(x)=f(x)`)}일 때 정적분 공식은?`, [
      `${inlineMath(`\\int_a^b f(x)dx=F(b)-F(a)`)}`,
      `${inlineMath(`\\int_a^b f(x)dx=F(a)-F(b)`)}`,
      `${inlineMath(`\\int_a^b f(x)dx=f(b)-f(a)`)}`,
      `${inlineMath(`\\int_a^b f(x)dx=F(a)+F(b)`)}`,
    ], 0, "원시함수의 윗끝값에서 아랫끝값을 뺍니다.", "F와 f를 구분하세요.", calculusVisual("fundamental", { a, b })),
    sa(`${inlineMath(`\\int_{${a}}^{${b}}${constant}\\,dx`)}를 원시함수로 계산한 값은?`, constant * (b - a), `원시함수 ${constant}x의 끝값 차입니다.`, "상수의 원시함수에 양 끝을 대입하세요.", calculusVisual("fundamental", { a, b, constant })),
    sa(`${inlineMath(`\\int_{${a}}^{${b}}(${2 * coefficient}x${signedNumber(constant)})dx`)}는?`, coefficient * (b ** 2 - a ** 2) + constant * (b - a), "원시함수의 끝값 차를 계산합니다.", "항별로 원시함수를 구하세요.", calculusVisual("fundamental", { a, b, coefficient, constant })),
    mc(`정적분 계산에서 적분상수 C가 사라지는 이유는?`, ["F(b)+C와 F(a)+C의 차에서 소거된다.", "C가 항상 0이기 때문이다.", "구간 길이가 0이기 때문이다.", "미분을 하지 않기 때문이다."], 0, "같은 상수가 양 끝값 차에서 서로 없어집니다.", "끝값 차에 +C를 직접 써보세요.", calculusVisual("fundamental")),
    sa(`${inlineMath(`\\int_{0}^{${Math.abs(b) + 1}}${2 * coefficient}x\\,dx`)}는?`, coefficient * (Math.abs(b) + 1) ** 2, `원시함수 ${inlineMath(`${coefficient}x^2`)}에 양 끝을 대입합니다.`, "아랫끝 0에서의 값은 0입니다.", calculusVisual("fundamental", { a: 0, b: Math.abs(b) + 1, coefficient })),
    sa(`${inlineMath(`\\int_{${a}}^{${b}}f(x)dx=${upperValue - lowerValue}`)}이고 F(a)=${lowerValue}일 때 F(b)는?`, upperValue, "정적분=F(b)-F(a)이므로 F(b)=정적분+F(a)입니다.", "끝값 관계를 F(b)에 대해 푸세요.", calculusVisual("fundamental", { a, b })),
    mc(`정적분을 원시함수의 끝값 차로 계산하게 해 주는 핵심 연결은?`, ["미적분의 기본정리", "피타고라스 정리", "덧셈정리", "큰 수의 법칙"], 0, "미적분의 기본정리가 미분과 적분을 연결합니다.", "변화율과 누적량의 관계를 떠올리세요.", calculusVisual("fundamental")),
    sa(`${inlineMath(`F(${b})=${upperValue},\\;F(${a})=${lowerValue}`)}이고 F′=f일 때 ${inlineMath(`\\int_{${a}}^{${b}}f(x)dx`)}는?`, upperValue - lowerValue, "윗끝 원시함수값에서 아랫끝 원시함수값을 뺍니다.", "F(b)-F(a)를 계산하세요.", calculusVisual("fundamental", { a, b })),
  ];
}

function areaProblems() {
  const width = randomInteger(2, 7);
  const height = randomInteger(1, 6);
  const left = randomInteger(-4, 1);
  const right = left + width;
  const scale = randomInteger(1, 4);
  const root = randomInteger(1, 4);
  const parabolaArea =
    (4 / 3) * scale * root ** 3;

  return [
    sa(`구간 [${left},${right}]에서 함수 y=${height}와 x축 사이의 넓이는?`, width * height, "직사각형의 가로×세로입니다.", "함수가 x축 위에 있으므로 정적분과 넓이가 같습니다.", calculusVisual("area", { left, right, height })),
    sa(`구간 [${left},${right}]에서 함수 y=-${height}와 x축 사이의 실제 넓이는?`, width * height, "정적분은 음수지만 실제 넓이는 절댓값을 취합니다.", "x축 아래 영역도 넓이는 양수입니다.", calculusVisual("area", { left, right, height: -height })),
    sa(`${inlineMath(`y=${scale * 2}x`)}와 x축, x=${width}로 둘러싸인 삼각형의 넓이는?`, scale * width ** 2, `밑변 ${width}, 높이 ${2 * scale * width}인 삼각형 넓이입니다.`, "1/2×밑변×높이를 사용하세요.", calculusVisual("area", { slope: 2 * scale, left: 0, right: width })),
    sa(`${inlineMath(`y=${scale}(${root ** 2}-x^2)`)}와 x축 사이에서 -${root}≤x≤${root}인 넓이는?`, round4(parabolaArea), `${inlineMath(`\\int_{-${root}}^{${root}}${scale}(${root ** 2}-x^2)dx=${round4(parabolaArea)}`)}입니다.`, `짝함수의 대칭을 이용해 0부터 ${root}까지 적분한 값의 2배를 구하세요.`, calculusVisual("area", { scale, roots: [-root, root] })),
    mc(`두 곡선 사이 넓이를 구하는 기본 적분식은?`, ["∫(위 함수-아래 함수)dx", "∫(아래 함수-위 함수)dx를 그대로 사용", "두 함수의 곱", "두 도함수의 합"], 0, "각 구간에서 위 함수값에서 아래 함수값을 빼야 넓이가 양수가 됩니다.", "그래프의 위아래를 먼저 판정하세요.", calculusVisual("area")),
    sa(`두 곡선의 차가 구간 [${left},${right}]에서 항상 ${height}일 때 두 곡선 사이 넓이는?`, width * height, "세로 간격이 일정한 직사각형 영역입니다.", "함수 차×구간 길이입니다.", calculusVisual("area", { left, right, gap: height })),
    mc(`두 곡선의 위아래가 바뀌는 지점에서 해야 할 일은?`, ["적분 구간을 나누고 각 구간에서 위-아래를 다시 정한다.", "그 지점을 무시한다.", "전체 적분에 -1만 곱한다.", "도함수를 적분하지 않는다."], 0, "교점은 함수 차의 부호가 바뀔 수 있는 경계입니다.", "절댓값 적분을 구간별로 계산하세요.", calculusVisual("area", { crossing: true })),
    sa(`${inlineMath(`\\int_{${left}}^{${right}}f(x)dx=-${width * height}`)}이고 f≤0일 때 그래프와 x축 사이의 넓이는?`, width * height, "함수가 x축 아래에 있으므로 실제 넓이는 정적분의 절댓값입니다.", "음의 정적분에 -를 붙이세요.", calculusVisual("area", { left, right, integral: -width * height })),
    sa(`밑변 길이가 ${width}, 높이가 ${height}인 삼각형 영역의 넓이는?`, width * height / 2, "삼각형 넓이는 1/2×밑변×높이입니다.", "선형함수 아래 넓이를 기하적으로 보세요.", calculusVisual("area", { width, height, triangle: true })),
    mc(`정적분값과 실제 넓이가 항상 같지 않은 이유는?`, ["x축 아래 영역을 정적분은 음수로 세기 때문이다.", "넓이는 음수가 될 수 있기 때문이다.", "정적분에는 구간이 없기 때문이다.", "함수는 항상 불연속이기 때문이다."], 0, "정적분은 부호 있는 누적량이고 넓이는 음수가 아닙니다.", "x축 아래 영역을 비교하세요.", calculusVisual("area", { belowAxis: true })),
  ];
}

function velocityDistanceProblems() {
  const zero = randomInteger(1, 5);
  const scale = randomInteger(1, 4);
  const end = zero + randomInteger(1, 5);
  const initialPosition = randomInteger(-10, 10);
  const displacement =
    (scale / 2) *
    (end ** 2 - 2 * zero * end);
  const distance =
    (scale / 2) *
      zero ** 2 +
    (scale / 2) *
      (end - zero) ** 2;

  return [
    sa(`속도 ${inlineMath(`v(t)=${scale}(t-${zero})`)}일 때 t=${zero}에서 속도는?`, 0, `${inlineMath(`v(${zero})=0`)}이므로 그 순간 정지합니다.`, "속도식에 시간을 대입하세요.", calculusVisual("velocity-area", { zero, scale })),
    sa(`속도 ${inlineMath(`v(t)=${scale}(t-${zero})`)}일 때 0≤t≤${end}의 변위는?`, round4(displacement), `${inlineMath(`\\int_0^{${end}}${scale}(t-${zero})dt=${round4(displacement)}`)}입니다.`, "변위는 속도의 부호 있는 적분입니다.", calculusVisual("velocity-area", { zero, scale, end })),
    sa(`같은 운동에서 0≤t≤${end}의 이동거리는?`, round4(distance), `${inlineMath(`t=${zero}`)}에서 방향이 바뀌므로 음의 넓이와 양의 넓이의 크기를 더합니다.`, "속도가 0인 시각에서 구간을 나누어 속력의 넓이를 더하세요.", calculusVisual("velocity-area", { zero, scale, end, absolute: true })),
    sa(`초기 위치가 ${initialPosition}이고 변위가 ${round4(displacement)}일 때 마지막 위치는?`, round4(initialPosition + displacement), "마지막 위치=초기 위치+변위입니다.", "이동거리 대신 부호 있는 변위를 더하세요.", calculusVisual("velocity-area", { initialPosition, displacement })),
    mc(`속도를 적분해 얻는 것은?`, ["변위", "항상 이동거리", "가속도", "속력의 최댓값"], 0, "속도의 부호 있는 넓이는 위치의 변화량인 변위입니다.", "위치와 속도의 미분·적분 관계를 떠올리세요.", calculusVisual("velocity-area")),
    mc(`이동거리를 구할 때 적분해야 하는 것은?`, ["|v(t)|", "v′(t)", "s′′(t)만", "v(t)의 부호를 무시한 원시함수"], 0, "방향과 관계없이 이동한 길이를 더하려면 속력 |v|를 적분합니다.", "음의 속도 구간도 양의 길이로 세세요.", calculusVisual("velocity-area", { absolute: true })),
    sa(`0≤t≤${zero}에서 속도가 항상 -${scale}일 때 이동거리는?`, scale * zero, `속력은 ${scale}이고 시간은 ${zero}이므로 거리=속력×시간입니다.`, "음의 부호는 방향일 뿐 거리에는 절댓값을 씁니다.", calculusVisual("velocity-area", { velocity: -scale, end: zero })),
    sa(`0≤t≤${end}에서 속도가 항상 ${scale}일 때 변위는?`, scale * end, "일정한 속도의 변위는 속도×시간입니다.", "속도 그래프 아래 직사각형 넓이입니다.", calculusVisual("velocity-area", { velocity: scale, end })),
    mc(`변위가 0인데 이동거리는 양수일 수 있는 상황은?`, ["출발점에서 움직였다가 다시 돌아온 경우", "전혀 움직이지 않은 경우만", "속도가 항상 양수인 경우", "시간이 0인 경우"], 0, "서로 반대 방향의 변위가 상쇄되어도 이동한 길이는 남습니다.", "부호 있는 합과 절댓값 합을 비교하세요.", calculusVisual("velocity-area", { returnTrip: true })),
    sa(`위치 변화량이 ${round4(displacement)}이고 초기 위치가 ${initialPosition}일 때 최종 위치는?`, round4(initialPosition + displacement), "초기 위치에 변위를 더합니다.", "변위에는 방향을 나타내는 부호가 포함됩니다.", calculusVisual("velocity-area", { initialPosition, displacement })),
  ];
}

const definitions = [
  ["differentiation", "calculus-1-02-01", "미분계수", derivativeCoefficientProblems],
  ["differentiation", "calculus-1-02-02", "미분가능성과 연속성", differentiabilityProblems],
  ["differentiation", "calculus-1-02-03", "거듭제곱함수의 도함수", powerDerivativeProblems],
  ["differentiation", "calculus-1-02-04", "다항함수의 미분법", polynomialDerivativeProblems],
  ["differentiation", "calculus-1-02-05", "접선의 방정식", tangentProblems],
  ["differentiation", "calculus-1-02-06", "평균값 정리", meanValueProblems],
  ["differentiation", "calculus-1-02-07", "함수의 증가·감소와 극값", extremaProblems],
  ["differentiation", "calculus-1-02-08", "함수 그래프의 개형", graphShapeProblems],
  ["differentiation", "calculus-1-02-09", "미분과 방정식·부등식", equationInequalityProblems],
  ["differentiation", "calculus-1-02-10", "속도와 가속도", motionProblems],
  ["integration", "calculus-1-03-01", "부정적분", indefiniteIntegralProblems],
  ["integration", "calculus-1-03-02", "다항함수의 부정적분", polynomialIntegralProblems],
  ["integration", "calculus-1-03-03", "정적분의 개념과 성질", definiteIntegralConceptProblems],
  ["integration", "calculus-1-03-04", "부정적분과 정적분의 관계", fundamentalTheoremProblems],
  ["integration", "calculus-1-03-05", "정적분과 넓이", areaProblems],
  ["integration", "calculus-1-03-06", "적분과 속도·거리", velocityDistanceProblems],
];

const generators = definitions.map(
  ([unitId, conceptId, title, buildProblems]) => ({
    key: conceptId,
    courseId: "calculus-1",
    unitId,
    conceptId,
    requiredDistinctTypes: 5,
    problemTypes: Array.from(
      { length: 10 },
      (_, index) => ({
        id: `${conceptId}-type-${String(
          index + 1
        ).padStart(2, "0")}`,
        label: `유형 ${index + 1} · ${title}`,
        difficulty:
          index < 3 ? 1 : index < 7 ? 2 : 3,
        generate() {
          const generated =
            buildProblems()[index];

          if (!generated) {
            throw new Error(
              `${conceptId}의 ${index + 1}번 문제 유형이 없습니다.`
            );
          }

          return {
            ...generated,
            validityChecks: [
              {
                name: "calculus-answer",
                passed:
                  generated.answer !==
                    undefined &&
                  generated.answer !== null &&
                  String(
                    generated.answer
                  ).trim() !== "",
                message: "정답이 비어 있습니다.",
              },
            ],
          };
        },
      })
    ),
    isCorrectAnswer,
  })
);

const generatorMap = new Map(
  generators.map((generator) => [
    [
      generator.courseId,
      generator.unitId,
      generator.conceptId,
    ].join("/"),
    generator,
  ])
);

module.exports = {
  generators,
  generatorMap,
};
