const {
  randomInteger,
  choose,
  fraction,
  power,
  linearFactor,
  makeShortAnswer,
  defineAdvancedTemplates,
} = require("../shared");

const courseId =
  "probability-statistics";
const unitId = "statistics";
const requiredConceptIds = [
  "probability-statistics-03-01",
  "probability-statistics-03-02",
  "probability-statistics-03-03",
  "probability-statistics-03-04",
  "probability-statistics-03-05",
  "probability-statistics-03-06",
  "probability-statistics-03-07",
];

const families = [
  {
    id: "distribution-table-recovery",
    titles: [
      "확률합·기댓값에서 분포표의 미지확률 복원",
      "분포표 복원 후 분산까지 계산",
    ],
    sourcePattern:
      "확률의 총합과 기댓값 조건을 연립해 분포표를 완성한 뒤 분산 계산",
    estimatedMinutes: [11, 13],
    reasoningSteps: [
      [
        "확률의 합이 1인 식을 세운다.",
        "기댓값 식을 세운다.",
        "두 미지확률을 연립해 구한다.",
        "목표 확률을 계산한다.",
      ],
      [
        "분포표의 미지확률을 연립방정식으로 복원한다.",
        "E(X²)를 계산한다.",
        "V(X)=E(X²)-E(X)²를 적용한다.",
        "기약분수로 정리한다.",
      ],
    ],
    generate(mode) {
      const p = choose([
        [2, 10],
        [3, 10],
      ]);
      const q = choose([
        [3, 10],
        [4, 10],
      ]);
      const rNumerator =
        10 - p[0] - q[0];
      const expectationNumerator =
        q[0] +
        2 * rNumerator;
      const secondNumerator =
        q[0] +
        4 * rNumerator;
      const varianceNumerator =
        secondNumerator *
          10 -
        expectationNumerator ** 2;
      const answer =
        mode === 0
          ? fraction(
              rNumerator,
              10
            )
          : fraction(
              varianceNumerator,
              100
            );

      return makeShortAnswer({
        prompt:
          `확률변수 $X$가 0,1,2의 값을 가지며 $P(X=0)=\\frac{${p[0]}}{10}$, ` +
          `$P(X=1)=\\frac{${q[0]}}{10}$이다. ${
            mode === 0
              ? "P(X=2)"
              : "V(X)"
          }의 값을 구하시오. (기약분수로 입력)`,
        answer,
        independentAnswer:
          mode === 0
            ? fraction(
                rNumerator,
                10
              )
            : fraction(
                varianceNumerator,
                100
              ),
        solution:
          `확률의 합에서 $P(X=2)=${rNumerator}/10$. ` +
          `$E(X)=${expectationNumerator}/10$, $E(X^2)=${secondNumerator}/10$. ` +
          `${
            mode === 0
              ? `따라서 답은 ${answer}.`
              : `V(X)=E(X^2)-\\{E(X)\\}^2=${answer}.`
          }`,
        hintText:
          "먼저 확률의 합 1로 분포표를 완성한 뒤 E(X²)를 구하세요.",
      });
    },
  },
  {
    id: "linear-transform-mean-variance",
    titles: [
      "선형변환된 확률변수의 평균·분산 역추론",
      "두 선형변환 조건에서 원래 평균과 분산 복원",
    ],
    sourcePattern:
      "E(aX+b)=aE(X)+b와 V(aX+b)=a²V(X)를 구분해 연쇄 적용",
    estimatedMinutes: [10, 11],
    reasoningSteps: [
      [
        "평균의 선형성을 적용한다.",
        "상수 이동은 분산에 영향이 없음을 확인한다.",
        "상수배는 분산에 제곱으로 작용함을 적용한다.",
        "평균과 분산의 목표 결합값을 계산한다.",
      ],
      [
        "변환된 평균 식에서 E(X)를 구한다.",
        "변환된 분산 식에서 V(X)를 구한다.",
        "다른 선형변환의 평균을 계산한다.",
        "두 결과를 결합한다.",
      ],
    ],
    generate(mode) {
      const mean =
        randomInteger(-3, 6);
      const variance =
        randomInteger(1, 5);
      const a =
        choose([2, 3, -2]);
      const b =
        randomInteger(-4, 4);
      const transformedMean =
        a * mean + b;
      const transformedVariance =
        a ** 2 * variance;
      const answer =
        mode === 0
          ? transformedMean +
            transformedVariance
          : mean + variance;

      return makeShortAnswer({
        prompt:
          mode === 0
            ? `확률변수 $X$의 평균이 ${mean}, 분산이 ${variance}일 때, $E(${a}X${b >= 0 ? "+" : ""}${b})+V(${a}X${b >= 0 ? "+" : ""}${b})$를 구하시오.`
            : `확률변수 $X$에 대하여 $E(${a}X${b >= 0 ? "+" : ""}${b})=${transformedMean}$, ` +
              `$V(${a}X${b >= 0 ? "+" : ""}${b})=${transformedVariance}$일 때, $E(X)+V(X)$를 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? a * mean +
              b +
              a ** 2 *
                variance
            : mean + variance,
        solution:
          `$E(aX+b)=aE(X)+b$, $V(aX+b)=a^2V(X)$를 각각 적용한다. ` +
          `${
            mode === 0
              ? `두 값은 ${transformedMean}, ${transformedVariance}이므로 답은 ${answer}.`
              : `역으로 $E(X)=${mean},V(X)=${variance}$를 얻어 답은 ${answer}.`
          }`,
        hintText:
          "평균에는 a가, 분산에는 a²이 곱해진다는 차이를 구분하세요.",
      });
    },
  },
  {
    id: "binomial-mean-variance-inverse",
    titles: [
      "이항분포 평균·분산에서 n과 p 복원",
      "복원한 이항분포의 특정 확률 계산",
    ],
    sourcePattern:
      "E=np, V=np(1-p)에서 비를 취해 p를 먼저 구하고 n을 복원",
    estimatedMinutes: [11, 13],
    reasoningSteps: [
      [
        "평균과 분산 공식을 쓴다.",
        "V/E=1-p로 성공확률을 구한다.",
        "E=np에 대입해 시행횟수를 구한다.",
        "목표 결합값을 계산한다.",
      ],
      [
        "평균·분산의 비로 p를 구한다.",
        "시행횟수 n을 복원한다.",
        "이항확률 공식을 세운다.",
        "조합과 거듭제곱을 계산한다.",
      ],
    ],
    generate(mode) {
      const denominator =
        choose([2, 3, 4]);
      const pNumerator = 1;
      const multiplier =
        randomInteger(2, 4);
      const n =
        denominator ** 2 *
        multiplier;
      const mean =
        denominator *
        multiplier;
      const variance =
        (
          denominator - 1
        ) * multiplier;
      const zeroProbability =
        fraction(
          power(
            denominator - 1,
            n
          ),
          power(denominator, n)
        );
      const answer =
        mode === 0
          ? n
          : zeroProbability;

      return makeShortAnswer({
        prompt:
          `확률변수 $X$가 이항분포 $B(n,p)$를 따르고 $E(X)=${mean}$, $V(X)=${variance}$이다. ` +
          `$${ 
            mode === 0
              ? "n"
              : "P(X=0)"
          }$의 값을 구하시오.${mode === 1 ? " (기약분수로 입력)" : ""}`,
        answer,
        independentAnswer:
          mode === 0
            ? n
            : fraction(
                power(
                  denominator - 1,
                  n
                ),
                power(
                  denominator,
                  n
                )
              ),
        solution:
          `$V/E=1-p=${variance}/${mean}$이므로 $p=${pNumerator}/${denominator}$. ` +
          `$np=${mean}$에서 $n=${n}$. ${
            mode === 0
              ? ""
              : `$P(X=0)=(1-p)^n=${zeroProbability}$.`
          }`,
        hintText:
          "분산을 평균으로 나누면 1-p가 바로 남습니다.",
      });
    },
  },
  {
    id: "normal-standardization-chain",
    titles: [
      "정규분포의 두 경계 표준화와 대칭성",
      "확률 조건에서 원래 분포의 경계값 역산",
    ],
    sourcePattern:
      "평균과 표준편차로 표준화한 뒤 표준정규분포의 대칭 구간 또는 역변환 사용",
    estimatedMinutes: [11, 12],
    reasoningSteps: [
      [
        "분산에서 표준편차를 구한다.",
        "두 경계값을 z값으로 표준화한다.",
        "표준정규분포의 대칭성을 적용한다.",
        "주어진 표의 넓이를 조합한다.",
      ],
      [
        "주어진 확률을 표준정규분포의 z경계와 대응시킨다.",
        "z=(x-μ)/σ 식을 세운다.",
        "원래 경계값 x를 복원한다.",
        "다른 대칭 경계와 결합한다.",
      ],
    ],
    generate(mode) {
      const mean =
        randomInteger(40, 70);
      const sd =
        choose([5, 10]);
      const lower =
        mean - sd;
      const upper =
        mean + sd;
      const intervalProbability =
        0.6826;
      const boundary =
        mean + 2 * sd;
      const answer =
        mode === 0
          ? String(
              intervalProbability
            )
          : boundary;

      return makeShortAnswer({
        prompt:
          mode === 0
            ? `확률변수 $X$가 정규분포 $N(${mean},${sd ** 2})$를 따른다. ` +
              `$P(0\\le Z\\le1)=0.3413$일 때 $P(${lower}\\le X\\le${upper})$를 구하시오.`
            : `확률변수 $X$가 정규분포 $N(${mean},${sd ** 2})$를 따른다. ` +
              `$P(X\\le k)=0.9772$, $P(0\\le Z\\le2)=0.4772$일 때 $k$를 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? "0.6826"
            : mean + 2 * sd,
        solution:
          mode === 0
            ? `표준화하면 $-1\\le Z\\le1$이고 대칭성으로 $2\\times0.3413=0.6826$.`
            : `$0.9772=0.5+0.4772$이므로 경계는 $z=2$. 따라서 $k=${mean}+2\\cdot${sd}=${boundary}$.`,
        hintText:
          "먼저 X의 경계를 z=(X-μ)/σ로 바꾸세요.",
      });
    },
  },
  {
    id: "sampling-confidence-size",
    titles: [
      "표본평균 분포에서 표본크기 역산",
      "신뢰구간 길이 조건으로 필요한 표본크기 결정",
    ],
    sourcePattern:
      "표본평균의 표준편차 σ/√n 또는 신뢰구간 길이 공식을 역으로 풀어 n 결정",
    estimatedMinutes: [12, 13],
    reasoningSteps: [
      [
        "표본평균의 표준편차 공식을 쓴다.",
        "주어진 표준편차와 모표준편차를 대입한다.",
        "√n에 대한 식을 푼다.",
        "제곱해 표본크기를 구한다.",
      ],
      [
        "신뢰구간의 반길이를 식으로 나타낸다.",
        "전체 길이는 반길이의 두 배임을 반영한다.",
        "√n을 고립시킨다.",
        "자연수 표본크기로 제곱해 검산한다.",
      ],
    ],
    generate(mode) {
      const populationSd =
        choose([10, 15, 20]);
      const rootN =
        choose([5, 10]);
      const n = rootN ** 2;
      const sampleSd =
        populationSd / rootN;
      const confidenceLength =
        (
          2 *
          1.96 *
          populationSd
        ) / rootN;
      const answer = n;

      return makeShortAnswer({
        prompt:
          mode === 0
            ? `모표준편차가 ${populationSd}인 모집단에서 크기 $n$인 표본을 임의추출할 때 표본평균의 표준편차가 ${sampleSd}이다. $n$을 구하시오.`
            : `모표준편차가 ${populationSd}인 모집단의 모평균을 신뢰도 95%로 추정한다. ` +
              `신뢰구간의 길이가 ${confidenceLength.toFixed(
                3
              )}일 때 표본크기 $n$을 구하시오. ` +
              `(단, $P(|Z|\\le1.96)=0.95$)`,
        answer,
        independentAnswer:
          rootN ** 2,
        solution:
          mode === 0
            ? `$${populationSd}/\\sqrt n=${sampleSd}$에서 $\\sqrt n=${rootN}$, 따라서 $n=${n}$.`
            : `신뢰구간 길이는 $2\\times1.96\\times${populationSd}/\\sqrt n$. ` +
              `주어진 길이와 같게 두면 $\\sqrt n=${rootN}$, $n=${n}$.`,
        hintText:
          "표본평균의 표준편차에는 n이 아니라 √n이 분모에 옵니다.",
      });
    },
  },
  {
    id: "second-moment-recovery",
    titles: [
      "평균·분산에서 이차식의 기댓값 복원",
      "중심 이동한 제곱의 기댓값 계산",
    ],
    sourcePattern:
      "V(X)=E(X²)-E(X)²로 이차모멘트를 복원하고 목표 이차식을 선형성으로 계산",
    estimatedMinutes: [11, 12],
    reasoningSteps: [
      [
        "분산 공식에서 E(X²)를 고립시킨다.",
        "주어진 평균과 분산을 대입한다.",
        "목표 이차식을 전개한다.",
        "기댓값의 선형성을 적용해 계산한다.",
      ],
      [
        "E((X-c)²)를 분산과 평균의 차로 나타낸다.",
        "중심 이동량 μ-c를 구한다.",
        "V(X)+(μ-c)² 공식을 적용한다.",
        "직접 전개한 값과 비교해 검산한다.",
      ],
    ],
    generate(mode) {
      const mean = randomInteger(-3, 6);
      const variance = randomInteger(2, 8);
      const shift =
        mean + randomInteger(1, 4);
      const secondMoment =
        variance + mean ** 2;
      const answer =
        mode === 0
          ? secondMoment +
            2 * mean +
            1
          : variance +
            (mean - shift) ** 2;

      return makeShortAnswer({
        prompt:
          `확률변수 $X$에 대하여 $E(X)=${mean}$, $V(X)=${variance}$이다. ` +
          `$${mode === 0 ? "E(X^2+2X+1)" : `E\\{(${linearFactor(shift, "X")})^2\\}`}$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? variance +
              mean ** 2 +
              2 * mean +
              1
            : variance +
              (mean - shift) ** 2,
        solution:
          `$E(X^2)=V(X)+\\{E(X)\\}^2=${secondMoment}$. ` +
          `${mode === 0 ? "기댓값의 선형성을 적용하면" : "또는 V(X)+(E(X)-c)^2를 적용하면"} 답은 ${answer}이다.`,
        hintText:
          "분산 공식에서 E(X²)를 먼저 구하세요.",
      });
    },
  },
  {
    id: "independent-random-variable-sum",
    titles: [
      "독립확률변수의 합의 평균·분산",
      "독립확률변수의 선형결합 표준편차",
    ],
    sourcePattern:
      "독립인 확률변수의 합에서는 평균은 선형 결합되고 분산은 계수의 제곱을 곱해 더해짐을 적용",
    estimatedMinutes: [12, 13],
    reasoningSteps: [
      [
        "두 확률변수 평균의 선형결합을 계산한다.",
        "독립성으로 공분산항이 0임을 확인한다.",
        "분산을 계수 제곱과 함께 더한다.",
        "평균과 분산의 목표 결합값을 구한다.",
      ],
      [
        "선형결합의 각 계수를 확인한다.",
        "각 분산에 계수의 제곱을 곱한다.",
        "독립성을 이용해 분산을 합한다.",
        "양의 제곱근으로 표준편차를 구한다.",
      ],
    ],
    generate(mode) {
      const meanX = randomInteger(1, 5);
      const meanY = randomInteger(1, 5);
      const sdX = choose([1, 2, 3]);
      const sdY = choose([1, 2, 3]);
      const coefficient = 2;
      const sumMean =
        coefficient * meanX +
        meanY;
      const sumVariance =
        coefficient ** 2 *
          sdX ** 2 +
        sdY ** 2;
      const answer =
        mode === 0
          ? sumMean +
            sumVariance
          : sumVariance;

      return makeShortAnswer({
        prompt:
          `서로 독립인 확률변수 $X,Y$가 $E(X)=${meanX}$, $E(Y)=${meanY}$, ` +
          `$V(X)=${sdX ** 2}$, $V(Y)=${sdY ** 2}$를 만족한다. ` +
          `$Z=2X+Y$일 때, $${mode === 0 ? "E(Z)+V(Z)" : "V(Z)"}$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? 2 * meanX +
              meanY +
              4 * sdX ** 2 +
              sdY ** 2
            : 4 * sdX ** 2 +
              sdY ** 2,
        solution:
          `$E(Z)=2E(X)+E(Y)=${sumMean}$이고 독립이므로 ` +
          `$V(Z)=4V(X)+V(Y)=${sumVariance}$. 따라서 답은 ${answer}이다.`,
        hintText:
          "분산에서는 선형결합의 계수를 제곱해야 합니다.",
      });
    },
  },
  {
    id: "pooled-data-statistics",
    titles: [
      "두 집단을 합친 자료의 평균",
      "두 집단의 평균·분산에서 합친 분산 복원",
    ],
    sourcePattern:
      "집단별 인원수로 가중한 합과 제곱합을 복원해 전체 평균·분산 계산",
    estimatedMinutes: [12, 14],
    reasoningSteps: [
      [
        "각 집단의 총합을 인원수와 평균의 곱으로 구한다.",
        "두 총합과 인원수를 합한다.",
        "전체 평균을 계산한다.",
        "가중평균 범위 안에 있는지 검산한다.",
      ],
      [
        "각 집단에서 E(X²)=분산+평균²을 구한다.",
        "인원수로 가중한 전체 제곱평균을 계산한다.",
        "전체 평균의 제곱을 뺀다.",
        "전체 분산을 정리한다.",
      ],
    ],
    generate(mode) {
      const countA = choose([10, 20]);
      const countB = countA;
      const meanA = randomInteger(4, 8);
      const meanB =
        meanA + randomInteger(2, 6);
      const varianceA = choose([1, 4, 9]);
      const varianceB = choose([1, 4, 9]);
      const mean =
        (meanA + meanB) / 2;
      const secondMoment =
        (
          varianceA +
          meanA ** 2 +
          varianceB +
          meanB ** 2
        ) / 2;
      const variance =
        secondMoment -
        mean ** 2;
      const answer =
        mode === 0
          ? mean
          : String(variance);

      return makeShortAnswer({
        prompt:
          `A집단 ${countA}명의 평균은 ${meanA}, 분산은 ${varianceA}이고 B집단 ${countB}명의 평균은 ${meanB}, 분산은 ${varianceB}이다. ` +
          `두 집단을 합친 자료의 ${mode === 0 ? "평균" : "분산"}을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? (countA * meanA +
                countB * meanB) /
              (countA + countB)
            : String(
                (
                  countA *
                    (
                      varianceA +
                      meanA ** 2
                    ) +
                  countB *
                    (
                      varianceB +
                      meanB ** 2
                    )
                ) /
                  (countA +
                    countB) -
                  mean ** 2
              ),
        solution:
          mode === 0
            ? `전체 평균은 가중평균 $(${countA}\\cdot${meanA}+${countB}\\cdot${meanB})/${countA + countB}=${mean}$이다.`
            : `각 집단의 제곱평균은 분산+평균²이다. 이를 인원수로 가중해 합친 제곱평균을 구한 뒤 전체 평균²을 빼면 ${variance}이다.`,
        hintText:
          mode === 0
            ? "각 집단의 총합을 먼저 복원하세요."
            : "분산을 바로 평균내지 말고 각 집단의 제곱평균을 복원하세요.",
      });
    },
  },
  {
    id: "sample-mean-normal-probability",
    titles: [
      "정규모집단 표본평균의 구간확률",
      "표본평균의 꼬리확률에서 경계값 역산",
    ],
    sourcePattern:
      "표본평균을 평균 μ, 표준편차 σ/√n인 정규분포로 바꾸고 표준화해 확률 또는 경계 계산",
    estimatedMinutes: [12, 13],
    reasoningSteps: [
      [
        "표본평균의 평균을 확인한다.",
        "표본평균의 표준편차 σ/√n을 계산한다.",
        "구간 양 끝을 표준화한다.",
        "표준정규분포의 대칭 넓이를 이용한다.",
      ],
      [
        "주어진 꼬리확률을 z값과 대응시킨다.",
        "표본평균의 표준오차를 계산한다.",
        "z=(k-μ)/(σ/√n)을 세운다.",
        "원래 경계값 k를 복원한다.",
      ],
    ],
    generate(mode) {
      const mean = randomInteger(40, 70);
      const populationSd = choose([10, 15, 20]);
      const rootN = choose([5, 10]);
      const sampleSize =
        rootN ** 2;
      const standardError =
        populationSd / rootN;
      const boundary =
        mean + standardError;
      const answer =
        mode === 0
          ? "0.6826"
          : boundary;

      return makeShortAnswer({
        prompt:
          `정규분포 $N(${mean},${populationSd ** 2})$인 모집단에서 크기 ${sampleSize}인 표본을 임의추출하고 표본평균을 $\\overline X$라 한다. ` +
          `${mode === 0 ? `$P(${mean - standardError}\\le\\overline X\\le${mean + standardError})$` : "$P(\\overline X\\le k)=0.8413$일 때 $k$"}를 구하시오. ` +
          `(단, $P(0\\le Z\\le1)=0.3413$)`,
        answer,
        independentAnswer:
          mode === 0
            ? "0.6826"
            : mean +
              populationSd /
                rootN,
        solution:
          `표본평균은 평균 ${mean}, 표준편차 ${standardError}인 정규분포를 따른다. ` +
          `${mode === 0 ? "주어진 구간은 -1≤Z≤1이므로 확률은 0.6826이다." : `0.8413=0.5+0.3413이므로 z=1, 따라서 k=${boundary}이다.`}`,
        hintText:
          "표본평균의 표준편차는 모집단 표준편차를 √n으로 나눈 값입니다.",
      });
    },
  },
  {
    id: "confidence-interval-reverse",
    titles: [
      "신뢰구간 양 끝점에서 표본평균과 오차한계 복원",
      "신뢰구간 길이 변화에서 표본크기 비율 계산",
    ],
    sourcePattern:
      "신뢰구간의 중심과 반길이를 읽고 표본평균·표준오차 또는 표본크기 변화율을 역산",
    estimatedMinutes: [12, 13],
    reasoningSteps: [
      [
        "신뢰구간 양 끝점의 평균으로 중심을 구한다.",
        "전체 길이의 절반으로 오차한계를 구한다.",
        "중심이 표본평균임을 적용한다.",
        "표본평균과 오차한계의 결합값을 계산한다.",
      ],
      [
        "신뢰구간 길이가 1/√n에 비례함을 쓴다.",
        "두 길이의 비를 계산한다.",
        "제곱해 표본크기 비의 역수를 구한다.",
        "새 표본크기를 계산한다.",
      ],
    ],
    generate(mode) {
      const center = randomInteger(40, 70);
      const margin = choose([2, 3, 4]);
      const originalSize = choose([25, 36, 100]);
      const factor = choose([2, 3]);
      const newSize =
        originalSize * factor ** 2;
      const answer =
        mode === 0
          ? center + margin
          : newSize;

      return makeShortAnswer({
        prompt:
          mode === 0
            ? `모평균의 신뢰구간이 $[${center - margin},${center + margin}]$로 계산되었다. 표본평균을 $\\overline x$, 오차한계를 $E$라 할 때 $\\overline x+E$를 구하시오.`
            : `같은 신뢰도와 같은 모표준편차에서 표본크기 ${originalSize}으로 구한 신뢰구간의 길이를 $1/${factor}$배로 줄이려 한다. 필요한 새 표본크기를 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? center + margin
            : originalSize *
              factor ** 2,
        solution:
          mode === 0
            ? `구간의 중심은 $\\overline x=${center}$, 반길이는 $E=${margin}$이므로 답은 ${answer}이다.`
            : `신뢰구간 길이는 $1/\\sqrt n$에 비례한다. 길이를 $1/${factor}$배로 만들려면 표본크기는 ${factor ** 2}배이므로 ${newSize}이다.`,
        hintText:
          mode === 0
            ? "신뢰구간의 중심과 반길이를 각각 구하세요."
            : "신뢰구간 길이와 표본크기의 제곱근 관계를 사용하세요.",
      });
    },
  },
];

module.exports = {
  courseId,
  unitId,
  requiredConceptIds,
  minimumAppliedPoolSize: 16,
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
