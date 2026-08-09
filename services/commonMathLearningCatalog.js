const CONCEPT_DETAILS = {
  "polynomial-arithmetic": ["다항식의 사칙연산", "동류항을 모으고 분배법칙을 정확히 적용하면 복잡한 다항식도 한 항씩 안전하게 계산할 수 있습니다.", "(A+B)(C+D)=AC+AD+BC+BD"],
  "identity-remainder-theorem": ["항등식과 나머지정리", "항등식은 모든 문자 값에서 성립하고, 나머지정리는 다항식을 직접 나누지 않고도 나머지를 함수값으로 바꾸어 줍니다.", "P(x)=(x-a)Q(x)+P(a)"],
  "polynomial-factorization": ["다항식의 인수분해", "공통인수·곱셈공식·치환을 순서대로 살피면 전개된 다항식을 곱의 구조로 되돌릴 수 있습니다.", "a^2-b^2=(a-b)(a+b)"],
  "complex-numbers": ["복소수", "실수에서 풀리지 않는 이차방정식을 다루기 위해 i²=-1인 허수단위를 도입하고 실수부와 허수부를 각각 계산합니다.", String.raw`i^2=-1,\quad z=a+bi`],
  "quadratic-discriminant": ["이차방정식의 판별식", "판별식은 근을 실제로 구하지 않고도 실근의 개수와 중근 여부를 알려주는 핵심 지표입니다.", "D=b^2-4ac"],
  "quadratic-roots-and-coefficients": ["근과 계수의 관계", "두 근의 합과 곱을 계수에 연결하면 근을 직접 구하지 않고도 대칭식과 새로운 방정식을 계산할 수 있습니다.", String.raw`\alpha+\beta=-\frac ba,\quad \alpha\beta=\frac ca`],
  "quadratic-equation-and-function": ["이차방정식과 이차함수", "방정식의 실근은 포물선과 x축의 교점이므로 대수적 해와 그래프의 위치 관계를 같은 정보로 읽습니다.", String.raw`ax^2+bx+c=0\Longleftrightarrow y=ax^2+bx+c\text{의 x절편}`],
  "parabola-and-line": ["포물선과 직선", "포물선과 직선의 교점 개수는 두 식을 연립해 얻은 이차방정식의 판별식으로 판단합니다.", String.raw`f(x)=mx+n\Longrightarrow D\gtreqless0`],
  "quadratic-max-min-restricted": ["이차함수의 최대·최소", "꼭짓점과 구간의 양 끝을 함께 비교해야 제한된 구간에서의 최대·최소를 빠뜨리지 않습니다.", String.raw`x_v=-\frac b{2a}`],
  "cubic-and-quartic-equations": ["삼차·사차방정식", "인수정리로 한 근을 찾고 차수를 낮춘 뒤, 남은 이차식의 해를 구하는 것이 기본 전략입니다.", String.raw`P(a)=0\Longleftrightarrow(x-a)\mid P(x)`],
  "simultaneous-quadratic-equations": ["연립이차방정식", "한 식에서 치환 대상을 고른 뒤 다른 식에 대입하고, 얻은 해가 원래 두 식을 모두 만족하는지 검산합니다.", String.raw`\text{치환}\to\text{한 문자 방정식}\to\text{검산}`],
  "simultaneous-linear-inequalities": ["연립일차부등식", "각 부등식의 해를 수직선에 나타낸 뒤 공통부분만 취해야 연립부등식의 해가 됩니다.", String.raw`A\cap B`],
  "absolute-linear-inequalities": ["절댓값 일차부등식", "절댓값은 수직선에서의 거리이므로 |x-a|<r은 a에서 r보다 가까운 점, |x-a|>r은 더 먼 점을 뜻합니다.", String.raw`|x-a|<r\Longleftrightarrow a-r<x<a+r`],
  "quadratic-inequalities": ["이차부등식", "이차식의 근과 최고차항의 부호를 이용해 수직선의 부호가 바뀌는 구간을 판정합니다.", String.raw`a(x-\alpha)(x-\beta)\gtreqless0`],
  "addition-and-multiplication-principles": ["합의 법칙과 곱의 법칙", "서로 겹치지 않는 선택은 더하고, 연속된 단계의 선택은 곱하여 경우의 수를 셉니다.", String.raw`n(A\cup B)=n(A)+n(B),\quad n(A\times B)=n(A)n(B)`],
  "permutations": ["순열", "서로 다른 대상을 순서 있게 뽑아 배열하는 경우의 수는 첫 자리부터 가능한 선택 수를 곱해 계산합니다.", String.raw`{}_nP_r=\frac{n!}{(n-r)!}`],
  "combinations": ["조합", "순서를 구별하지 않는 선택은 같은 원소를 배열한 r!가지가 중복되므로 순열을 r!로 나눕니다.", String.raw`{}_nC_r=\frac{n!}{r!(n-r)!}`],
  "matrix-concept": ["행렬의 뜻", "행렬은 수를 행과 열에 맞추어 배열한 표이며, 위치가 같은 성분끼리 대응시켜 읽습니다.", String.raw`A=(a_{ij})_{m\times n}`],
  "matrix-operations": ["행렬의 연산", "덧셈은 같은 위치의 성분끼리, 곱셈은 앞 행렬의 행과 뒤 행렬의 열을 곱해 더합니다.", String.raw`(AB)_{ij}=\sum_k a_{ik}b_{kj}`],
  "distance-and-internal-division": ["두 점 사이의 거리와 내분점", "좌표의 차로 만든 직각삼각형에 피타고라스 정리를 적용하고, 내분점은 반대편 비를 가중치로 사용합니다.", String.raw`AB=\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}`],
  "parallel-and-perpendicular-lines": ["평행·수직인 두 직선", "기울기가 같으면 평행이고, 두 기울기의 곱이 -1이면 수직이라는 조건으로 미지수를 결정합니다.", String.raw`m_1=m_2,\quad m_1m_2=-1`],
  "point-line-distance": ["점과 직선 사이의 거리", "직선의 식을 한쪽으로 정리한 뒤 점의 좌표를 분자에 대입하고 법선벡터의 길이로 나눕니다.", String.raw`d=\frac{|ax_0+by_0+c|}{\sqrt{a^2+b^2}}`],
  "circle-equation": ["원의 방정식", "중심에서의 거리가 반지름과 같다는 정의를 거리 공식으로 나타내면 원의 표준형이 됩니다.", "(x-a)^2+(y-b)^2=r^2"],
  "circle-line-position": ["원과 직선의 위치 관계", "원의 중심과 직선 사이의 거리 d를 반지름 r과 비교하면 교점이 0개·1개·2개인지 판단할 수 있습니다.", "d<r,\ d=r,\ d>r"],
  "geometric-translation": ["평행이동", "도형을 (p,q)만큼 옮기면 점의 좌표에는 (p,q)를 더하고, 방정식에는 x-p와 y-q를 대입합니다.", "f(x-p,y-q)=0"],
  "geometric-reflection": ["대칭이동", "대칭축에 따라 좌표의 부호나 순서를 바꾸고, 방정식에도 같은 좌표 변환을 적용합니다.", String.raw`x\text{축}:(x,y)\mapsto(x,-y)`],
  "set-concept-and-representation": ["집합의 뜻과 표현", "조건이 명확한 대상의 모임을 집합이라 하며 원소나열법·조건제시법·벤다이어그램으로 같은 집합을 표현합니다.", "A=\{x\mid P(x)\}"],
  "set-inclusion": ["부분집합", "A의 모든 원소가 B에도 속하면 A는 B의 부분집합이며, 서로 포함하면 두 집합은 같습니다.", String.raw`A\subseteq B\Longleftrightarrow\forall x(x\in A\Rightarrow x\in B)`],
  "set-operations": ["집합의 연산", "합집합·교집합·여집합을 벤다이어그램의 영역과 연결하고 드모르간 법칙으로 복잡한 식을 정리합니다.", String.raw`(A\cup B)^c=A^c\cap B^c`],
  "proposition-and-condition": ["명제와 조건", "참과 거짓을 분명히 판별할 수 있는 문장을 명제라 하고, 조건의 진리집합으로 명제의 참·거짓을 판단합니다.", String.raw`p\Rightarrow q`],
  "converse-and-contrapositive": ["역과 대우", "p→q의 역은 q→p이고 대우는 ¬q→¬p이며, 원래 명제와 대우의 참·거짓은 항상 같습니다.", String.raw`p\Rightarrow q\Longleftrightarrow\neg q\Rightarrow\neg p`],
  "sufficient-and-necessary-conditions": ["충분조건과 필요조건", "p가 q를 보장하면 p는 충분조건이고 q는 필요조건이며, 양방향이 모두 성립하면 필요충분조건입니다.", String.raw`p\Rightarrow q,\quad p\Longleftrightarrow q`],
  "proof-by-contrapositive-and-contradiction": ["대우와 귀류법을 이용한 증명", "직접 증명이 어려우면 대우를 증명하거나 결론의 부정을 가정해 모순을 이끌어 냅니다.", String.raw`\neg q\Rightarrow\neg p`],
  "absolute-inequality": ["절대부등식", "문자의 모든 허용값에서 성립하는 부등식은 제곱의 비음수성·산술기하평균·코시형 구조로 증명합니다.", String.raw`a^2+b^2\ge2ab`],
  "function-concept-and-graph": ["함수의 뜻과 그래프", "정의역의 각 원소에 공역의 원소가 정확히 하나씩 대응할 때 함수이며 그래프는 그 순서쌍의 모임입니다.", String.raw`f:X\to Y`],
  "composite-function": ["합성함수", "안쪽 함수를 먼저 계산한 뒤 그 결과를 바깥 함수에 입력하며, 정의역 조건도 함께 확인합니다.", String.raw`(f\circ g)(x)=f(g(x))`],
  "inverse-function": ["역함수", "일대일 대응인 함수에서 입력과 출력을 바꾸면 역함수가 되며 두 그래프는 y=x에 대칭입니다.", String.raw`f^{-1}(f(x))=x`],
  "rational-function": ["유리함수", "분모가 0이 되는 값을 정의역에서 제외하고 점근선과 평행이동을 이용해 그래프의 위치를 읽습니다.", String.raw`y=\frac{a}{x-p}+q`],
  "irrational-function": ["무리함수", "근호 안이 0 이상이라는 정의역 조건을 먼저 세우고 기준 그래프의 이동과 대칭으로 개형을 파악합니다.", String.raw`y=a\sqrt{x-p}+q`],
};

function detailedSteps(concept, detail) {
  const topics = Array.isArray(concept.topics) && concept.topics.length
    ? concept.topics
    : [concept.title];
  const [title, takeaway, formula] = detail;
  const topicAt = (index) => topics[index % topics.length];
  return [
    ["정의와 출발점을 세웁니다", `${topicAt(0)}의 뜻을 말로 확인하고, 식이나 그림에서 각 기호가 나타내는 대상을 구분합니다.`],
    ["핵심 관계를 시각화합니다", `${topicAt(1)}을 수직선·좌표평면·표·영역 중 알맞은 표현으로 바꾸어 조건이 움직이는 모습을 관찰합니다.`],
    ["공식이 만들어지는 이유를 이해합니다", `${formula}를 외우기 전에 정의에서 어떤 계산을 거쳐 이 관계가 나오는지 한 단계씩 연결합니다.`],
    ["대표 유형을 풉니다", `${topicAt(2)}의 기본 조건을 식으로 번역하고, 계산 순서와 답의 범위를 동시에 확인합니다.`],
    ["조건이 바뀐 유형을 비교합니다", `${topicAt(3)}에서 부호·범위·순서가 달라질 때 사용할 성질과 결론이 어떻게 달라지는지 비교합니다.`],
    ["오류를 점검하고 종합합니다", `${title} 문제에서 자주 생기는 정의역 누락, 부호 오류, 중복 계산을 검산한 뒤 여러 조건을 결합한 문제로 마무리합니다.`],
  ].map(([stepTitle, description], index) => ({ order: index + 1, title: stepTitle, description }));
}

function buildCommonMathLessonDefinitions(curriculum) {
  return curriculum.courses
    .filter((course) => ["common-math-1", "common-math-2"].includes(course.id))
    .flatMap((course) => course.units.flatMap((unit) => unit.concepts.map((concept) => {
      const detail = CONCEPT_DETAILS[concept.id];
      if (!detail) throw new Error(`공통수학 상세 설명이 없습니다: ${concept.id}`);
      const [title, keyTakeaway, formula] = detail;
      return {
        curriculumId: curriculum.curriculum?.id || "kr-2022",
        courseId: course.id,
        unitId: unit.id,
        conceptId: concept.id,
        content: {
          estimatedMinutes: 28,
          summary: `${title}은(는) ${concept.achievementStandard || keyTakeaway} 개념의 정의, 시각적 의미, 계산 원리, 조건 변화와 실전 적용을 순서대로 학습합니다.`,
          keyTakeaway,
          steps: detailedSteps(concept, detail),
          motion: { assetUrl: null, posterUrl: null, durationSeconds: 18 },
          playgroundKey: `common-math-${concept.id}`,
          practice: { generatorKey: `common-math-${concept.id}`, requiredDistinctTypes: 10 },
          dashboardPreview: {
            type: "interactive",
            title,
            formula,
            blocks: [
              { label: "정의", tone: "secondary" },
              { label: "시각화", tone: "primary" },
              { label: "조건 변화", tone: "accent" },
            ],
          },
          isPublished: true,
        },
      };
    })));
}

module.exports = { CONCEPT_DETAILS, buildCommonMathLessonDefinitions };
