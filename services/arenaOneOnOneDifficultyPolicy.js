/*
 * GOAT Arena 1대1 U/R 난이도 설계 정책 v5.
 *
 * 이 파일은 Unranked·Ranked가 함께 사용하는 문제 설계의 단일 원본이다.
 * 실제 문항 생성기는 arenaOneOnOneProblemTypes.js에 독립적으로 두며,
 * 공식 모의평가 조사 카탈로그의 사고 유형과 아래 typeId를 연결한다.
 */

const {
  ARENA_ONE_ON_ONE_TYPE_SKELETONS,
  ARENA_SUPPORTED_COURSES,
} = require("./arenaOneOnOneTypeSkeletons");
const {
  calibrationEvidenceForAccuracyRange,
} = require("./arenaPrivateMockResearchCatalog");

const ARENA_QUESTION_DESIGN_POLICY_VERSION =
  "GOAT_ARENA_U_R_DIFFICULTY_V5";
const ARENA_LEGACY_CONTENT_VERSION =
  "LEGACY_PLACEMENT_COPY_V1";
const ARENA_FINAL_CONTENT_VERSION =
  "GOAT_ARENA_OFFICIAL_MOCK_TYPES_V3";

const ARENA_SOURCE_POSITION_BANDS = Object.freeze([
  "Q13_14",
  "Q20_21",
  "Q27_28",
  "MIXED_SEMI_KILLER",
  "Q29_30_KILLER",
]);

const TIER_TYPE_SKELETON_CATALOG = Object.freeze(
  Object.fromEntries(
    Array.from({ length: 9 }, (_unused, index) => `T${index + 1}`).map((tier) => [
      tier,
      Object.freeze(
        Object.values(ARENA_ONE_ON_ONE_TYPE_SKELETONS).filter(
          (definition) => definition.tier === tier
        )
      ),
    ])
  )
);

const TIER_ORDER = Object.freeze([
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
]);

const TIER_LABELS = Object.freeze({
  BRONZE: "브론즈",
  SILVER: "실버",
  GOLD: "골드",
  PLATINUM: "플래티넘",
  EMERALD: "에메랄드",
  DIAMOND: "다이아몬드",
  MASTER: "마스터",
  GRANDMASTER: "그랜드마스터",
  CHALLENGER: "챌린저",
});

const TIER_CODE_ALIASES = Object.freeze(
  Object.fromEntries(
    Object.entries(TIER_LABELS).flatMap(([code, label]) => [
      [code, code],
      [label, code],
    ])
  )
);

const TIER_SPECS = Object.freeze({
  T1: Object.freeze({ anchor: "BRONZE", defenderAccuracy: [0.6, 0.68], challengerAccuracy: [0.6, 0.68], concepts: 2, conditions: 1, interpretationDepth: 0, cases: 0, graphSupport: "FULL" }),
  T2: Object.freeze({ anchor: "SILVER", defenderAccuracy: [0.58, 0.65], challengerAccuracy: [0.42, 0.5], concepts: 2, conditions: 1, interpretationDepth: 0, cases: 1, graphSupport: "FULL" }),
  T3: Object.freeze({ anchor: "GOLD", defenderAccuracy: [0.56, 0.63], challengerAccuracy: [0.4, 0.48], concepts: 2, conditions: 2, interpretationDepth: 1, cases: 1, graphSupport: "FULL" }),
  T4: Object.freeze({ anchor: "PLATINUM", defenderAccuracy: [0.54, 0.61], challengerAccuracy: [0.38, 0.46], concepts: 2, conditions: 2, interpretationDepth: 1, cases: 2, graphSupport: "FULL" }),
  T5: Object.freeze({ anchor: "EMERALD", defenderAccuracy: [0.52, 0.59], challengerAccuracy: [0.36, 0.44], concepts: 2.5, conditions: 2, interpretationDepth: 1, cases: 2, graphSupport: "PARTIAL" }),
  T6: Object.freeze({ anchor: "DIAMOND", defenderAccuracy: [0.5, 0.57], challengerAccuracy: [0.34, 0.42], concepts: 3, conditions: 2, interpretationDepth: 2, cases: 3, graphSupport: "PARTIAL" }),
  T7: Object.freeze({ anchor: "MASTER", defenderAccuracy: [0.48, 0.55], challengerAccuracy: [0.32, 0.4], concepts: 3, conditions: 2.5, interpretationDepth: 2, cases: 3, graphSupport: "PARTIAL" }),
  T8: Object.freeze({ anchor: "GRANDMASTER", defenderAccuracy: [0.46, 0.53], challengerAccuracy: [0.3, 0.38], concepts: 3, conditions: 3, interpretationDepth: 2, cases: 3, graphSupport: "MINIMAL" }),
  T9: Object.freeze({ anchor: "CHALLENGER", defenderAccuracy: [0.44, 0.52], challengerAccuracy: [0.28, 0.36], concepts: 3, conditions: 3, interpretationDepth: 2, cases: 4, graphSupport: "NONE" }),
});

const DEFENDER_TIER_TO_DIFFICULTY = Object.freeze(
  Object.fromEntries(
    Object.entries(TIER_SPECS).map(([difficultyTier, spec]) => [
      spec.anchor,
      difficultyTier,
    ])
  )
);

// T 코드는 기존 ACTIVE DB를 읽기 위한 내부 호환 키다. 공개 난이도는
// U1~U9·R1~R9이며, 같은 번호에서는 Ranked가 Unranked보다 어렵다.
// R3부터는 T9 생성기 안에서 조건 수·경우 분류·난도 점수를 추가 보정한다.
const RANKED_DEFENDER_TIER_TO_DIFFICULTY = Object.freeze({
  BRONZE: "T8",
  SILVER: "T9",
  GOLD: "T9",
  PLATINUM: "T9",
  EMERALD: "T9",
  DIAMOND: "T9",
  MASTER: "T9",
  GRANDMASTER: "T9",
  CHALLENGER: "T9",
});

// T 코드는 기존 DB 카탈로그와의 호환을 위한 내부 보정 키다. 사용자와
// 운영 화면에는 Division별 절대 난이도인 U1~U9, R1~R9만 노출한다.
const UNRANKED_DEFENDER_TIER_TO_DIFFICULTY_CODE = Object.freeze(
  Object.fromEntries(TIER_ORDER.map((tier, index) => [tier, `U${index + 1}`]))
);
const RANKED_DEFENDER_TIER_TO_DIFFICULTY_CODE = Object.freeze(
  Object.fromEntries(TIER_ORDER.map((tier, index) => [tier, `R${index + 1}`]))
);
const PUBLIC_DIFFICULTY_TO_CATALOG_TIER = Object.freeze({
  ...Object.fromEntries(Array.from({ length: 9 }, (_unused, index) => [`U${index + 1}`, `T${index + 1}`])),
  R1: "T8",
  R2: "T9",
  R3: "T9",
  R4: "T9",
  R5: "T9",
  R6: "T9",
  R7: "T9",
  R8: "T9",
  R9: "T9",
});

// 공개 난이도별 목표 정답률. `defenderAccuracy`와 `challengerAccuracy`는
// 기존 경기 문서 스키마와의 호환 필드이며, 실제 출제 목표는 역할이 아니라
// Division·공개 난이도·문항 위치로 결정한다.
const PUBLIC_DIFFICULTY_SPECS = Object.freeze({
  U1: Object.freeze({ ...TIER_SPECS.T1, defenderAccuracy: [0.35, 0.399], challengerAccuracy: [0.35, 0.399], regularAccuracy: [0.35, 0.399] }),
  U2: Object.freeze({ ...TIER_SPECS.T2, defenderAccuracy: [0.33, 0.38], challengerAccuracy: [0.33, 0.38], regularAccuracy: [0.33, 0.38] }),
  U3: Object.freeze({ ...TIER_SPECS.T3, defenderAccuracy: [0.31, 0.36], challengerAccuracy: [0.31, 0.36], regularAccuracy: [0.31, 0.36] }),
  U4: Object.freeze({ ...TIER_SPECS.T4, defenderAccuracy: [0.29, 0.34], challengerAccuracy: [0.29, 0.34], regularAccuracy: [0.29, 0.34] }),
  U5: Object.freeze({ ...TIER_SPECS.T5, defenderAccuracy: [0.27, 0.32], challengerAccuracy: [0.27, 0.32], regularAccuracy: [0.27, 0.32] }),
  U6: Object.freeze({ ...TIER_SPECS.T6, defenderAccuracy: [0.25, 0.3], challengerAccuracy: [0.25, 0.3], regularAccuracy: [0.25, 0.3] }),
  U7: Object.freeze({ ...TIER_SPECS.T7, defenderAccuracy: [0.23, 0.28], challengerAccuracy: [0.23, 0.28], regularAccuracy: [0.23, 0.28], finalAccuracy: [0.06, 0.09] }),
  U8: Object.freeze({ ...TIER_SPECS.T8, defenderAccuracy: [0.21, 0.26], challengerAccuracy: [0.21, 0.26], regularAccuracy: [0.21, 0.26], finalAccuracy: [0.04, 0.07] }),
  U9: Object.freeze({ ...TIER_SPECS.T9, defenderAccuracy: [0.19, 0.24], challengerAccuracy: [0.19, 0.24], regularAccuracy: [0.19, 0.24], finalAccuracy: [0.025, 0.05] }),
  R1: Object.freeze({ ...TIER_SPECS.T8, defenderAccuracy: [0.28, 0.34], challengerAccuracy: [0.28, 0.34], regularAccuracy: [0.28, 0.34], finalAccuracy: [0.08, 0.099], absoluteBurden: 8.5 }),
  R2: Object.freeze({ ...TIER_SPECS.T9, defenderAccuracy: [0.26, 0.32], challengerAccuracy: [0.26, 0.32], regularAccuracy: [0.26, 0.32], finalAccuracy: [0.07, 0.09], absoluteBurden: 9 }),
  R3: Object.freeze({ ...TIER_SPECS.T9, defenderAccuracy: [0.24, 0.3], challengerAccuracy: [0.24, 0.3], regularAccuracy: [0.24, 0.3], finalAccuracy: [0.06, 0.08], concepts: 3.25, conditions: 3.25, cases: 4.25, absoluteBurden: 9.5 }),
  R4: Object.freeze({ ...TIER_SPECS.T9, defenderAccuracy: [0.22, 0.28], challengerAccuracy: [0.22, 0.28], regularAccuracy: [0.22, 0.28], finalAccuracy: [0.05, 0.07], concepts: 3.5, conditions: 3.5, cases: 4.5, absoluteBurden: 10 }),
  R5: Object.freeze({ ...TIER_SPECS.T9, defenderAccuracy: [0.2, 0.26], challengerAccuracy: [0.2, 0.26], regularAccuracy: [0.2, 0.26], finalAccuracy: [0.04, 0.06], concepts: 3.75, conditions: 3.75, cases: 4.75, absoluteBurden: 10.5 }),
  R6: Object.freeze({ ...TIER_SPECS.T9, defenderAccuracy: [0.18, 0.24], challengerAccuracy: [0.18, 0.24], regularAccuracy: [0.18, 0.24], finalAccuracy: [0.03, 0.05], concepts: 4, conditions: 4, cases: 5, absoluteBurden: 11 }),
  R7: Object.freeze({ ...TIER_SPECS.T9, defenderAccuracy: [0.16, 0.22], challengerAccuracy: [0.16, 0.22], regularAccuracy: [0.16, 0.22], finalAccuracy: [0.025, 0.045], concepts: 4.25, conditions: 4.25, cases: 5.25, absoluteBurden: 11.5 }),
  R8: Object.freeze({ ...TIER_SPECS.T9, defenderAccuracy: [0.13, 0.19], challengerAccuracy: [0.13, 0.19], regularAccuracy: [0.13, 0.19], finalAccuracy: [0.015, 0.035], concepts: 4.5, conditions: 4.5, cases: 5.5, absoluteBurden: 12 }),
  R9: Object.freeze({ ...TIER_SPECS.T9, defenderAccuracy: [0.1, 0.15], challengerAccuracy: [0.1, 0.15], regularAccuracy: [0.1, 0.15], finalAccuracy: [0.01, 0.025], concepts: 5, conditions: 5, cases: 6, absoluteBurden: 13 }),
});

function privateMockCalibrationForDifficulty(
  difficultyCode,
  { slotRole = "REGULAR", limit = 4 } = {}
) {
  const spec = PUBLIC_DIFFICULTY_SPECS[String(difficultyCode || "").toUpperCase()];
  if (!spec) return [];
  const targetAccuracy = slotRole === "FINAL_29_30"
    ? spec.finalAccuracy
    : spec.regularAccuracy;
  if (!targetAccuracy) return [];
  return calibrationEvidenceForAccuracyRange(targetAccuracy, { slotRole, limit });
}

const SUB_MATCH_TO_DIFFICULTY = Object.freeze({
  BRONZE_BRONZE: "T1",
  BRONZE_SILVER: "T2",
  SILVER_GOLD: "T3",
  GOLD_PLATINUM: "T4",
  PLATINUM_EMERALD: "T5",
  EMERALD_DIAMOND: "T6",
  DIAMOND_MASTER: "T7",
  MASTER_GRANDMASTER: "T8",
  GRANDMASTER_CHALLENGER: "T9",
  CHALLENGER_CHALLENGER: "T9",
});

const PACK_CURVE = Object.freeze(["LOW", "MID", "MID", "MID_HIGH", "HIGH"]);
const CHALLENGER_PACK_CURVE = Object.freeze(["MID", "MID", "HIGH", "HIGH", "HIGH"]);
const PACK_COURSE_SLOTS = Object.freeze([
  "algebra",
  "calculus-1",
  "probability-statistics",
  "algebra",
  "calculus-1",
]);

const PACK_RULES = Object.freeze({
  items: 5,
  perItemPoints: 20,
  totalScore: 100,
  timeLimitMinutes: 10,
  unitMix: Object.freeze({
    "calculus-1": 2,
    algebra: 2,
    "probability-statistics": 1,
  }),
  // 그래프는 풀이 편의를 위해 강제하지 않는다. 문제 본문 자체가 그래프·표를
  // 제시하고 정확한 라벨 데이터가 있을 때만 화면에 렌더링한다.
  minimumGraphItems: 0,
  maximumGraphItemsFromT5: 2,
  maximumSameUnit: 2,
  banRecentTypeIdsForMatches: 3,
  calculationLoad: "LOW",
  answerFormat: "NATURAL_NUMBER_MAX_3_DIGITS",
  minimumCombinedConcepts: 2,
  minimumConditionTransformSteps: 1,
  expectedTimePerItemMs: 10 * 60 * 1000,
});

function type(typeId, courseId, label, composition) {
  return Object.freeze({ typeId, courseId, label, composition });
}

// 과거 v2 설계 기록. 런타임과 관리자 카탈로그에는 노출하지 않는다.
const LEGACY_V2_TIER_TYPE_CATALOG = Object.freeze({
  T1: Object.freeze([
    type("T1-ALG-ARITHMETIC-SEQUENCE-SUM", "algebra", "등차수열 일반항 + 부분합 결합", "일반항을 구한 뒤 합 공식에 대입"),
    type("T1-ALG-GEOMETRIC-SEQUENCE-SUM", "algebra", "등비수열 항 + 합 결합", "공비를 찾은 뒤 합 계산"),
    type("T1-ALG-EXPONENT-LOG-DEFINITION", "algebra", "지수법칙 + 로그 정의 결합", "밑을 통일한 뒤 로그값 계산"),
    type("T1-CALC-ONE-SIDED-LIMIT-GRAPH", "calculus-1", "그래프에서 좌·우극한 판독 후 계산", "완전 제공 그래프에서 두 값의 합 또는 차"),
    type("T1-CALC-TANGENT-EQUATION", "calculus-1", "접선의 기울기 → 접선 방정식", "미분 후 한 점 대입"),
    type("T1-CALC-ONE-INTERVAL-AREA", "calculus-1", "정적분 한 구간 → 넓이", "부호가 바뀌지 않는 구간"),
    type("T1-PROB-CHOOSE-AND-ARRANGE", "probability-statistics", "순열·조합 2단계", "뽑고 나열"),
    type("T1-PROB-BINOMIAL-EV", "probability-statistics", "이항분포 평균·분산", "공식 두 개 연속 적용"),
  ]),
  T2: Object.freeze([
    type("T2-ALG-RECURSIVE-ARITHMETIC", "algebra", "귀납적 정의 순차 계산", "4~5항까지 전개"),
    type("T2-ALG-SIGMA-K-K2", "algebra", "시그마 기본 공식 결합", "Σk와 Σk² 결합"),
    type("T2-ALG-TRIG-SECTOR", "algebra", "삼각함수 특수각 + 부채꼴 넓이", "각에서 호길이와 넓이로 연결"),
    type("T2-CALC-QUARTIC-MINIMUM", "calculus-1", "사차함수 극솟값", "미분·근·대입"),
    type("T2-CALC-VELOCITY-DISPLACEMENT", "calculus-1", "속도 → 위치의 변화량", "적분 후 구간 계산"),
    type("T2-CALC-INTEGRAL-COEFFICIENT", "calculus-1", "정적분 값 → 계수", "한 단계 역추적"),
    type("T2-PROB-COMPLEMENT-TWO-STEP", "probability-statistics", "여사건 확률 2단계", "전체에서 반대 사건 제외"),
    type("T2-PROB-LINEAR-RV-EV", "probability-statistics", "확률변수 일차변환 평균·분산", "변환 공식 적용"),
  ]),
  T3: Object.freeze([
    type("T3-ALG-TELESCOPING-SIGMA", "algebra", "시그마 변형", "부분분수 뒤 망원합"),
    type("T3-ALG-TRIG-PERIOD-SHIFT", "algebra", "삼각함수 주기·평행이동 → 계수", "그래프 조건으로 계수 특정"),
    type("T3-ALG-EXP-LOG-INTERSECTION", "algebra", "지수·로그 그래프 교점·대칭", "두 곡선의 교점 좌표"),
    type("T3-ALG-SEQUENCE-MEANS", "algebra", "등차중항·등비중항 조건 결합", "세 항 관계식"),
    type("T3-CALC-EXTREMA-TWO-COEFFICIENTS", "calculus-1", "극값 조건 → 미정계수 2개", "두 미분 조건 결합"),
    type("T3-CALC-CONTINUITY-COEFFICIENT", "calculus-1", "미정계수로 연속 만들기", "좌극한·우극한·함숫값 일치"),
    type("T3-CALC-AREA-COEFFICIENT", "calculus-1", "넓이 → 계수", "한 구간 적분식 역추적"),
    type("T3-PROB-NORMAL-STANDARDIZATION", "probability-statistics", "정규분포 표준화", "표준화 후 확률 판독"),
    type("T3-PROB-CONDITIONAL-ONE-STEP", "probability-statistics", "조건부확률 1단계", "표 또는 트리"),
  ]),
  T4: Object.freeze([
    type("T4-ALG-ARITHMETIC-SUM-MAX", "algebra", "등차수열 부분합의 최댓값", "부호가 바뀌는 지점 탐색"),
    type("T4-ALG-TRIG-LINE-INTERSECTIONS", "algebra", "삼각함수 그래프·직선 교점의 합", "대칭성 활용"),
    type("T4-ALG-SINE-COSINE-GEOMETRY", "algebra", "사인·코사인법칙 + 도형", "외접원·넓이 연계"),
    type("T4-ALG-LOG-INEQUALITY-INTEGERS", "algebra", "로그 부등식 → 정수해 개수", "진수 조건과 부등식 결합"),
    type("T4-CALC-CURVE-LINE-AREA-COEFFICIENT", "calculus-1", "곡선·직선 넓이 → 계수", "적분 결과 역추적"),
    type("T4-CALC-CUBIC-EXTREMA-GRAPH", "calculus-1", "삼차함수 그래프 개형 + 극값", "판별식과 부호"),
    type("T4-CALC-BETWEEN-CURVES-AREA", "calculus-1", "두 곡선 사이 넓이", "교점 계산 뒤 적분"),
    type("T4-PROB-IDENTICAL-PERMUTATION-COMPLEMENT", "probability-statistics", "같은 것이 있는 순열 + 여사건", "중복 처리 뒤 제외"),
    type("T4-PROB-BINOMIAL-INVERSE", "probability-statistics", "이항분포 역추적", "분산에서 n 복원 뒤 평균"),
  ]),
  T5: Object.freeze([
    type("T5-ALG-TRIG-EXTREMA-SUBSTITUTION", "algebra", "삼각함수 최대·최소 + 치환", "삼각함수를 이차함수로 치환"),
    type("T5-ALG-SUM-TO-SEQUENCE", "algebra", "수열의 합 → 일반항", "S(n)-S(n-1)과 n=1 예외"),
    type("T5-ALG-EXP-LOG-SUBSTITUTION", "algebra", "지수·로그 방정식 치환형", "치환 뒤 근 조건"),
    type("T5-CALC-SPLIT-SIGNED-AREA", "calculus-1", "구간 분할 넓이", "절댓값과 부호에 따라 분할"),
    type("T5-CALC-CUBIC-ROOT-COUNT", "calculus-1", "삼차함수 실근 개수 → 정수 계수", "극값과 매개변수 비교"),
    type("T5-CALC-VELOCITY-DISTANCE-DISPLACEMENT", "calculus-1", "속도 그래프 → 이동거리·변위", "속도 부호 구분"),
    type("T5-PROB-MULTISET-SUBSTITUTION", "probability-statistics", "중복조합 + 변수 치환", "조건을 새 변수로 변환"),
    type("T5-PROB-CONDITIONAL-TWO-STEP", "probability-statistics", "조건부확률 2단계", "두 층 트리"),
    type("T5-PROB-SAMPLE-MEAN-INTERVAL", "probability-statistics", "표본평균 분포 + 구간", "표준화 두 번"),
  ]),
  T6: Object.freeze([
    type("T6-ALG-TRIG-ROOT-COUNT", "algebra", "삼각방정식 해의 개수", "그래프 교점 수로 범위 결정"),
    type("T6-ALG-RECURRENCE-BRANCH", "algebra", "수열 귀납 + 경우분해", "곱이 0인 형태에서 매 항 분기"),
    type("T6-ALG-LOG-DOMAIN-BASE", "algebra", "로그 진수·밑 조건", "정의역 제약 두 개 동시 적용"),
    type("T6-CALC-PIECEWISE-DIFFERENTIABILITY", "calculus-1", "구간별 함수 연속·미분가능", "경계 조건 두 개"),
    type("T6-CALC-TANGENT-THROUGH-POINT", "calculus-1", "한 점을 지나는 접선 → 접점", "접점을 미지수로 역추적"),
    type("T6-CALC-EQUAL-AREAS-COEFFICIENT", "calculus-1", "같은 넓이 → 계수", "두 넓이 방정식"),
    type("T6-PROB-TWO-STAGE-URN", "probability-statistics", "주머니 이동 2단계", "상태 변화 추적"),
    type("T6-PROB-FUNCTION-COUNT-BASIC", "probability-statistics", "조건을 만족하는 함수 개수", "대응 규칙 세기"),
  ]),
  T7: Object.freeze([
    type("T7-ALG-CONDITIONED-SEQUENCE", "algebra", "조건 나열형 수열", "두 조건의 교집합"),
    type("T7-ALG-TRIG-GEOMETRY-MAX", "algebra", "삼각함수 + 도형 최댓값", "각 변수를 하나로 통일"),
    type("T7-ALG-GEOMETRIC-INEQUALITY", "algebra", "등비수열 + 부등식", "공비 범위 분류"),
    type("T7-CALC-CONDITIONED-CUBIC", "calculus-1", "조건 나열형 삼차함수", "함숫값과 미분 조건 동시 적용"),
    type("T7-CALC-DISTANCE-INVERSE", "calculus-1", "속도·거리 역문제", "거리에서 시각 복원"),
    type("T7-CALC-TANGENT-ENCLOSED-AREA", "calculus-1", "접선과 곡선으로 둘러싸인 넓이", "접점 미지수와 적분"),
    type("T7-PROB-FUNCTION-COUNT-CONSTRAINED", "probability-statistics", "단조·전사 조건 함수 개수", "조건별 경우분류"),
    type("T7-PROB-RV-MOMENTS", "probability-statistics", "확률변수 모멘트 결합", "평균·분산 동시 조건"),
  ]),
  T8: Object.freeze([
    type("T8-ALG-RECURRENCE-EXTREMA", "algebra", "귀납 수열 + 최대·최소", "분기 뒤 극단값 탐색"),
    type("T8-ALG-CIRCLE-TRIG-AREA", "algebra", "외접원·삼각함수·넓이", "도형 관계 두 단계"),
    type("T8-ALG-LOG-GRAPH-GEOMETRY", "algebra", "로그 그래프 + 도형 넓이", "교점 좌표로 도형 구성"),
    type("T8-CALC-INTEGRAL-FUNCTION-DIFFERENTIABILITY", "calculus-1", "적분 정의 함수의 미분가능성", "미분과 경계 조건"),
    type("T8-CALC-CUBIC-THREE-TANGENT-CONDITIONS", "calculus-1", "삼차함수 접선 3조건", "접점 개수 경우분류"),
    type("T8-CALC-EXTREMA-CHORD-AREA", "calculus-1", "극값·현으로 둘러싸인 넓이", "극값 좌표 뒤 적분"),
    type("T8-PROB-REPEATED-CONDITIONAL", "probability-statistics", "반복 조건부확률", "3회 이상 상태 전이"),
    type("T8-PROB-MULTISET-TWO-CONSTRAINTS", "probability-statistics", "중복조합 + 제한 조건 2개", "여사건 두 번"),
  ]),
  T9: Object.freeze([
    type("T9-ALG-SEQUENCE-ABSOLUTE-EXTREMA", "algebra", "수열 + 절댓값·최대최소", "네 개 이상 분기"),
    type("T9-ALG-COMPOSITE-TRIG-ROOT-INVERSE", "algebra", "삼각함수 합성 + 해 개수 역조건", "매개변수 범위 역추적"),
    type("T9-CALC-ABSOLUTE-PIECEWISE-DIFFERENTIABILITY", "calculus-1", "절댓값·구간분할 함수의 미분가능", "다중 경계 조건"),
    type("T9-CALC-TANGENT-INTEGRAL-EXTREMA", "calculus-1", "접선·적분·극값 3중 결합", "세 개념 동시 적용"),
    type("T9-CALC-INTEGRAL-FUNCTION-TANGENT-INVERSE", "calculus-1", "적분함수 접선 역문제", "조건에서 함수 복원"),
    type("T9-CALC-SIGNED-VELOCITY-DISTANCE-INVERSE", "calculus-1", "속도 부호 전환 거리 역문제", "구간 분할과 방향"),
    type("T9-PROB-SUBSET-INCLUSION-EXCLUSION", "probability-statistics", "부분집합 조건 세기", "포함배제"),
    type("T9-PROB-ONTO-RESTRICTED-DISTRIBUTION", "probability-statistics", "전사함수·제한된 분포", "경우 완전 분류"),
  ]),
});

const QUESTION_REVIEW_CHECKLIST = Object.freeze([
  "SEMI_KILLER_TWO_CONCEPTS_AND_TRANSFORM",
  "UNIQUE_ANSWER",
  "NATURAL_NUMBER_MAX_3_DIGITS",
  "CURRICULUM_COMMON_MATH1_COMMON_MATH2_ALGEBRA_PROBABILITY_STATISTICS_CALCULUS1",
  "NO_MISSING_OR_CONFLICTING_CONDITION",
  "INDEPENDENT_SOLUTION_MATCHES_ANSWER",
  "TIER_BURDEN_MATCHES",
  "SOLVABLE_WITHIN_TEN_MINUTES",
  "LOGIC_NOT_CALCULATION_LOAD",
  "NO_EXCESSIVE_SOURCE_COPYING",
]);

const CALIBRATION_RULES = Object.freeze({
  minimumMatchesPerType: 30,
  defenderHighMargin: 0.08,
  defenderLowMargin: 0.08,
  minimumTierGapSignal: 0.08,
  maximumTierGapSignal: 0.25,
  perfectScoreRateMaximum: 0.15,
  zeroScoreRateMaximum: 0.1,
  completeTieRateMaximum: 0.2,
});

function normalizeTierCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return TIER_CODE_ALIASES[normalized] || normalized;
}

function resolveArenaDifficultyTier(
  _challengerTier,
  defenderTier,
  { division = "SUB" } = {}
) {
  const normalizedDefender = normalizeTierCode(defenderTier);
  const normalizedDivision = String(division || "SUB").trim().toUpperCase();
  const mapping = normalizedDivision === "MAIN"
    ? RANKED_DEFENDER_TIER_TO_DIFFICULTY
    : DEFENDER_TIER_TO_DIFFICULTY;
  const difficultyTier = mapping[normalizedDefender];
  if (!difficultyTier) {
    const error = new Error("방어자 티어에 맞는 Arena 문제 난이도를 찾을 수 없습니다.");
    error.status = 409;
    error.code = "ARENA_DEFENDER_DIFFICULTY_NOT_CONFIGURED";
    throw error;
  }
  return difficultyTier;
}

function resolveArenaDifficultyCode(
  _challengerTier,
  defenderTier,
  { division = "SUB" } = {}
) {
  const normalizedDefender = normalizeTierCode(defenderTier);
  const normalizedDivision = String(division || "SUB").trim().toUpperCase();
  const mapping = normalizedDivision === "MAIN"
    ? RANKED_DEFENDER_TIER_TO_DIFFICULTY_CODE
    : UNRANKED_DEFENDER_TIER_TO_DIFFICULTY_CODE;
  const difficultyCode = mapping[normalizedDefender];
  if (!difficultyCode) {
    const error = new Error("방어자 티어에 맞는 공개 Arena 난이도를 찾을 수 없습니다.");
    error.status = 409;
    error.code = "ARENA_PUBLIC_DIFFICULTY_NOT_CONFIGURED";
    throw error;
  }
  return difficultyCode;
}

function packCurveForPair(challengerTier, defenderTier) {
  const challenger = normalizeTierCode(challengerTier);
  const defender = normalizeTierCode(defenderTier);
  return challenger === "CHALLENGER" && defender === "CHALLENGER"
    ? [...CHALLENGER_PACK_CURVE]
    : [...PACK_CURVE];
}

function targetAccuracyRangeForSlot({
  difficultyCode,
  order,
  division = "SUB",
} = {}) {
  const normalizedCode = String(difficultyCode || "").trim().toUpperCase();
  const normalizedOrder = Math.max(1, Math.min(5, Number(order) || 1));
  const publicSpec = PUBLIC_DIFFICULTY_SPECS[normalizedCode];
  if (!publicSpec) return null;
  const isRanked = String(division || "SUB").trim().toUpperCase() === "MAIN";
  const slotRole = expectedSlotRole({
    difficultyCode: normalizedCode,
    division: isRanked ? "MAIN" : "SUB",
    index: normalizedOrder - 1,
  });
  if (slotRole === "FINAL_29_30" && publicSpec.finalAccuracy) {
    const [min, max] = publicSpec.finalAccuracy.map(Number);
    const weights = [1, 0.75, 0.5, 0.25, 0];
    const target = min + (max - min) * weights[normalizedOrder - 1];
    const spread = Math.min(0.006, Math.max(0.003, (max - min) / 5));
    return [
      Number(Math.max(min, target - spread).toFixed(3)),
      Number(Math.min(max, target + spread).toFixed(3)),
    ];
  }
  const regularRange = publicSpec.regularAccuracy || publicSpec.defenderAccuracy;
  if (!regularRange) return null;
  const slotAccuracyWeights = isRanked
    ? [0.83, 0.55, 0.28, 0, 0]
    : [1, 0.75, 0.5, 0.25, 0];
  const min = Number(regularRange[0] || 0);
  const max = Number(regularRange[1] || min);
  const target = min + (max - min) * slotAccuracyWeights[normalizedOrder - 1];
  const spread = Math.min(0.01, Math.max(0.005, (max - min) / 4));
  return [
    Number(Math.max(min, target - spread).toFixed(3)),
    Number(Math.min(max, target + spread).toFixed(3)),
  ];
}

function publicDifficultyLevel(difficultyCode = "") {
  return Math.max(
    1,
    Math.min(9, Number(String(difficultyCode || "").replace(/^[UR]/i, "")) || 1)
  );
}

function isAllKillerDifficultyCode(difficultyCode = "") {
  return publicDifficultyLevel(difficultyCode) >= 7;
}

function expectedSlotRole({
  difficultyCode = "",
  division = "SUB",
  index = 0,
  questionCount = PACK_RULES.items,
} = {}) {
  const normalizedDivision = String(division || "SUB").trim().toUpperCase();
  return isAllKillerDifficultyCode(difficultyCode) ||
    (normalizedDivision === "MAIN" && Number(index) === Number(questionCount) - 1)
    ? "FINAL_29_30"
    : "REGULAR";
}

function difficultyGateForQuestion({
  difficultyCode,
  order,
  slotRole = "REGULAR",
} = {}) {
  const normalizedCode = String(difficultyCode || "").trim().toUpperCase();
  const level = Math.max(
    1,
    Math.min(9, Number(normalizedCode.replace(/^[UR]/, "")) || 1)
  );
  const isRanked = normalizedCode.startsWith("R");
  const isFinal = String(slotRole || "REGULAR").toUpperCase() === "FINAL_29_30";
  const minimumCombinedConcepts = isFinal
    ? 5
    : isRanked
      ? Math.min(5, 3 + Math.floor((level - 1) / 3))
      : Math.min(4, 2 + Math.floor((level - 1) / 4));
  const minimumConditionTransformSteps = isFinal
    ? 5
    : isRanked
      ? Math.min(5, 3 + Math.floor((level - 1) / 3))
      : Math.min(4, 3 + Math.floor((level - 1) / 6));
  return Object.freeze({
    minimumCombinedConcepts,
    minimumConditionTransformSteps,
    minimumReasoningSteps: isFinal ? 5 : 4,
    minimumGeneratorDifficulty: 4,
    minimumDifficultyScore: isFinal ? 0.9 : isRanked ? 0.75 : 0.68,
    order: Math.max(1, Math.min(5, Number(order) || 1)),
  });
}

function plannedPackSlots(challengerTier, defenderTier, options = {}) {
  const difficultyTier = resolveArenaDifficultyTier(
    challengerTier,
    defenderTier,
    options
  );
  const difficultyCode = resolveArenaDifficultyCode(
    challengerTier,
    defenderTier,
    options
  );
  const curve = packCurveForPair(challengerTier, defenderTier);
  const isRanked = String(options.division || "SUB").trim().toUpperCase() === "MAIN";
  return PACK_COURSE_SLOTS.map((courseId, index) => {
    const slotRole = expectedSlotRole({
      difficultyCode,
      division: isRanked ? "MAIN" : "SUB",
      index,
      questionCount: PACK_COURSE_SLOTS.length,
    });
    const skeleton = Object.values(ARENA_ONE_ON_ONE_TYPE_SKELETONS).find(
      (item) =>
        item.tier === difficultyTier &&
        item.courseId === courseId &&
        item.slotRole === slotRole
    );
    return {
      order: index + 1,
      policyVersion: ARENA_QUESTION_DESIGN_POLICY_VERSION,
      courseId,
      difficultyPosition: curve[index],
      difficultyTier,
      difficultyCode,
      slotRole,
      typeSkeletonId: skeleton?.typeId || "",
      sourcePositionBand: skeleton?.sourcePositionBand || (
        slotRole === "FINAL_29_30"
          ? "Q29_30_KILLER"
          : index === PACK_COURSE_SLOTS.length - 1
            ? "Q27_28"
            : "MIXED_SEMI_KILLER"
      ),
      difficultyClass: slotRole === "FINAL_29_30" ? "KILLER" : "SEMI_KILLER",
      targetAccuracy: targetAccuracyRangeForSlot({
        difficultyCode,
        order: index + 1,
        division: isRanked ? "MAIN" : "SUB",
      }),
      referenceFamilies: skeleton?.referenceFamilies || [],
    };
  });
}

function isNaturalNumberMaxThreeDigits(value) {
  return /^[1-9][0-9]{0,2}$/.test(String(value ?? "").trim());
}

function assertNaturalNumberMaxThreeDigits(value, { allowBlank = false } = {}) {
  const normalized = String(value ?? "").trim();
  if (allowBlank && !normalized) return "";
  if (!isNaturalNumberMaxThreeDigits(normalized)) {
    const error = new Error("답은 1부터 999까지의 자연수로 입력해주세요.");
    error.status = 400;
    error.code = "INVALID_ARENA_NATURAL_NUMBER_ANSWER";
    throw error;
  }
  return normalized;
}

function assertActiveQuestionDesign(question, options = {}) {
  const validCourses = new Set(ARENA_SUPPORTED_COURSES);
  const review = question?.validation || {};
  const withinTimeLimit =
    review.tenMinuteSolvable === true || review.twoMinuteSolvable === true;
  const difficultyCode = String(options.difficultyCode || "").toUpperCase();
  const gate = difficultyCode
    ? difficultyGateForQuestion({
        difficultyCode,
        order: options.order || question?.designSlot,
        slotRole: question?.slotRole,
      })
    : null;
  const difficultyGatePassed = !gate || (
    Number(question?.combinedConceptCount) >= gate.minimumCombinedConcepts &&
    Number(question?.conditionTransformSteps) >= gate.minimumConditionTransformSteps &&
    Number(question?.reasoningStepCount) >= gate.minimumReasoningSteps &&
    Number(question?.generatorDifficulty) >= gate.minimumGeneratorDifficulty &&
    Number(question?.difficultyScore) >= gate.minimumDifficultyScore
  );
  const valid =
    isNaturalNumberMaxThreeDigits(question?.answer) &&
    validCourses.has(String(question?.courseId || "")) &&
    Number(question?.combinedConceptCount) >= PACK_RULES.minimumCombinedConcepts &&
    Number(question?.conditionTransformSteps) >=
      PACK_RULES.minimumConditionTransformSteps &&
    Number(question?.expectedTimeMs) > 0 &&
    Number(question?.expectedTimeMs) <= PACK_RULES.expectedTimePerItemMs &&
    question?.calculationLoad === PACK_RULES.calculationLoad &&
    review.passed === true &&
    review.solvable === true &&
    review.uniqueAnswer === true &&
    review.calculatorFree === true &&
    review.answerMatches === true &&
    review.semiKillerCertified === true &&
    review.curriculumCompliant === true &&
    review.conditionsConsistent === true &&
    review.tierBurdenMatches === true &&
    withinTimeLimit &&
    review.originalityChecked === true &&
    difficultyGatePassed;
  if (!valid) {
    const error = new Error(
      "활성 Arena 문항이 난이도·교육과정·풀이시간·자연수 답 검수 기준을 통과하지 못했습니다."
    );
    error.status = 422;
    error.code = "INVALID_ACTIVE_ARENA_QUESTION_DESIGN";
    throw error;
  }
  return true;
}

function assertActivePackDesign(
  pack,
  { recentTypeIdsByMatch = [] } = {}
) {
  const questions = Array.isArray(pack?.questions) ? pack.questions : [];
  if (questions.length !== PACK_RULES.items) {
    throw new Error("활성 Arena 문제 팩은 정확히 5문항이어야 합니다.");
  }
  questions.forEach((question, index) =>
    assertActiveQuestionDesign(question, {
      difficultyCode: pack?.difficultyCode,
      order: index + 1,
    })
  );
  const courseCounts = questions.reduce((counts, question) => {
    counts[question.courseId] = Number(counts[question.courseId] || 0) + 1;
    return counts;
  }, {});
  const courseMixValid = Object.entries(PACK_RULES.unitMix).every(
    ([courseId, count]) => Number(courseCounts[courseId] || 0) === count
  );
  const graphCount = questions.filter((question) => question.graphItem === true).length;
  const activeTierNumber = Number(String(pack?.difficultyTier || "").replace("T", ""));
  const graphValid =
    graphCount >= PACK_RULES.minimumGraphItems &&
    (activeTierNumber < 5 || graphCount <= PACK_RULES.maximumGraphItemsFromT5);
  const recentMatches = recentTypeIdsByMatch
    .slice(0, PACK_RULES.banRecentTypeIdsForMatches)
    .flat();
  const recentTypeSet = new Set(recentMatches.map(String));
  const historyValid = questions.every(
    (question) =>
      !recentTypeSet.has(String(question.sourceTypeId || question.typeId)) &&
      !recentTypeSet.has(String(question.typeId))
  );
  const curveValid =
    Array.isArray(pack?.packCurve) &&
    pack.packCurve.length === PACK_RULES.items &&
    questions.every(
      (question, index) =>
        question.difficultyPosition === pack.packCurve[index]
    );
  const division = String(pack?.division || "SUB").trim().toUpperCase();
  const compositionValid = questions.every((question, index) => {
    const expectedRole = expectedSlotRole({
      difficultyCode: pack?.difficultyCode,
      division,
      index,
      questionCount: questions.length,
    });
    const expectedClass = expectedRole === "FINAL_29_30"
      ? "KILLER"
      : "SEMI_KILLER";
    return (
      String(question?.slotRole || "").toUpperCase() === expectedRole &&
      String(question?.difficultyClass || expectedClass).toUpperCase() === expectedClass
    );
  });
  if (!courseMixValid || !graphValid || !historyValid || !curveValid || !compositionValid) {
    const error = new Error(
      "활성 Arena 문제 팩이 단원 2·2·1, Division별 준킬러·킬러 구성, 시각자료, 난이도 곡선 또는 최근 유형 제외 기준을 통과하지 못했습니다."
    );
    error.status = 422;
    error.code = "INVALID_ACTIVE_ARENA_PACK_DESIGN";
    throw error;
  }
  return true;
}

function evaluateDifficultyCalibration({
  difficultyTier,
  sampleMatches,
  defenderAccuracy,
  challengerAccuracy,
  perfectScoreMatchRate,
  zeroScoreMatchRate,
  completeTieRate,
} = {}) {
  const spec = TIER_SPECS[difficultyTier];
  if (!spec) throw new Error("보정할 난이도 등급을 확인해주세요.");
  const sampleCount = Number(sampleMatches || 0);
  if (sampleCount < CALIBRATION_RULES.minimumMatchesPerType) {
    return { ready: false, minimumRequired: CALIBRATION_RULES.minimumMatchesPerType, actions: [] };
  }
  const actions = [];
  const [defenderMin, defenderMax] = spec.defenderAccuracy;
  if (Number(defenderAccuracy) > defenderMax + CALIBRATION_RULES.defenderHighMargin) {
    actions.push("INCREASE_CASES_OR_REDUCE_GRAPH_SUPPORT");
  }
  if (Number(defenderAccuracy) < defenderMin - CALIBRATION_RULES.defenderLowMargin) {
    actions.push("REDUCE_CONDITIONS_OR_INCREASE_GRAPH_SUPPORT");
  }
  const accuracyGap = Number(defenderAccuracy) - Number(challengerAccuracy);
  if (accuracyGap < CALIBRATION_RULES.minimumTierGapSignal) {
    actions.push("RAISE_HIGH_SLOT_ONE_TIER");
  }
  if (accuracyGap > CALIBRATION_RULES.maximumTierGapSignal) {
    actions.push("LOWER_LOW_SLOT_ONE_TIER");
  }
  if (Number(perfectScoreMatchRate) > CALIBRATION_RULES.perfectScoreRateMaximum) {
    actions.push("RAISE_SLOT_FIVE");
  }
  if (Number(zeroScoreMatchRate) > CALIBRATION_RULES.zeroScoreRateMaximum) {
    actions.push("LOWER_SLOT_ONE");
  }
  if (Number(completeTieRate) > CALIBRATION_RULES.completeTieRateMaximum) {
    actions.push("USE_LOW_MID_MID_HIGH_HIGH_CURVE");
  }
  return { ready: true, policyVersion: ARENA_QUESTION_DESIGN_POLICY_VERSION, actions };
}

module.exports = {
  ARENA_FINAL_CONTENT_VERSION,
  ARENA_LEGACY_CONTENT_VERSION,
  ARENA_QUESTION_DESIGN_POLICY_VERSION,
  ARENA_ONE_ON_ONE_TYPE_SKELETONS,
  ARENA_SOURCE_POSITION_BANDS,
  ARENA_SUPPORTED_COURSES,
  CALIBRATION_RULES,
  CHALLENGER_PACK_CURVE,
  DEFENDER_TIER_TO_DIFFICULTY,
  RANKED_DEFENDER_TIER_TO_DIFFICULTY,
  UNRANKED_DEFENDER_TIER_TO_DIFFICULTY_CODE,
  RANKED_DEFENDER_TIER_TO_DIFFICULTY_CODE,
  PUBLIC_DIFFICULTY_TO_CATALOG_TIER,
  PUBLIC_DIFFICULTY_SPECS,
  PACK_COURSE_SLOTS,
  PACK_CURVE,
  PACK_RULES,
  QUESTION_REVIEW_CHECKLIST,
  SUB_MATCH_TO_DIFFICULTY,
  TIER_LABELS,
  TIER_ORDER,
  TIER_SPECS,
  TIER_TYPE_CATALOG: TIER_TYPE_SKELETON_CATALOG,
  assertActivePackDesign,
  assertActiveQuestionDesign,
  assertNaturalNumberMaxThreeDigits,
  evaluateDifficultyCalibration,
  isNaturalNumberMaxThreeDigits,
  normalizeTierCode,
  packCurveForPair,
  plannedPackSlots,
  targetAccuracyRangeForSlot,
  difficultyGateForQuestion,
  expectedSlotRole,
  isAllKillerDifficultyCode,
  publicDifficultyLevel,
  privateMockCalibrationForDifficulty,
  resolveArenaDifficultyTier,
  resolveArenaDifficultyCode,
};
