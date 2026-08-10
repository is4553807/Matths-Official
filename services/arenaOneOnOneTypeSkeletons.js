/*
 * GOAT Arena 1대1 문항 유형 골격.
 *
 * 기출 문항 자체를 복제하지 않고, 2016~2026 고3 3·5·6·7·9·10·11월
 * 전국연합학력평가·모의평가의
 * 공식 해설에서 반복되는 사고 구조만 추상화한다. 수능은 해설 원본을
 * 운영 기준으로 확보하지 않았으므로 조사 범위에서 제외한다.
 */

const {
  familiesForTier,
} = require("./arenaOfficialMockResearchCatalog");

const ARENA_SUPPORTED_COURSES = Object.freeze([
  "common-math-1",
  "common-math-2",
  "algebra",
  "probability-statistics",
  "calculus-1",
]);

const COURSE_LABELS = Object.freeze({
  "common-math-1": "공통수학Ⅰ",
  "common-math-2": "공통수학Ⅱ",
  algebra: "대수",
  "probability-statistics": "확률과 통계",
  "calculus-1": "미적분Ⅰ",
});

const COURSE_CODES = Object.freeze({
  "common-math-1": "CM1",
  "common-math-2": "CM2",
  algebra: "ALG",
  "probability-statistics": "PROB",
  "calculus-1": "CALC",
});

const COURSE_ASSESSMENT_SCOPES = Object.freeze({
  "common-math-1": "INDIRECT_FOUNDATION",
  "common-math-2": "INDIRECT_FOUNDATION",
  algebra: "DIRECT_2028_ASSESSMENT",
  "probability-statistics": "DIRECT_2028_ASSESSMENT",
  "calculus-1": "DIRECT_2028_ASSESSMENT",
});

const ASSESSMENT_BEHAVIOR_DOMAINS = Object.freeze([
  "CALCULATION",
  "UNDERSTANDING",
  "INFERENCE",
  "PROBLEM_SOLVING",
]);

const REGULAR_ARCHETYPES = Object.freeze({
  "common-math-1": Object.freeze([
    "다항식 항등식과 나머지 조건 역추적",
    "복수 방정식·부등식의 해 조건 결합",
    "경우의 수 제한 조건과 대칭성",
    "행렬 연산과 미정 성분 조건 추론",
  ]),
  "common-math-2": Object.freeze([
    "좌표도형의 교점·거리·넓이 결합",
    "집합과 명제의 필요충분조건 역추론",
    "유리·무리함수 그래프와 정수 조건",
    "합성함수·역함수와 그래프 대칭 조건",
  ]),
  algebra: Object.freeze([
    "지수·로그 그래프와 정수해 조건",
    "삼각함수 그래프·도형 조건 결합",
    "수열의 합과 일반항 역추적",
    "귀납 수열의 분기와 극값 추론",
  ]),
  "probability-statistics": Object.freeze([
    "제한 조건이 있는 순열·조합",
    "조건부확률과 여사건의 다단계 추론",
    "이산확률분포의 평균·분산 역추적",
    "표본평균·정규분포의 조건 역산",
  ]),
  "calculus-1": Object.freeze([
    "극한·연속 조건의 미정계수 역추적",
    "접선·극값·실근 개수의 그래프 추론",
    "구간 분할 정적분과 넓이 역문제",
    "속도 부호 변화와 이동거리 역추적",
  ]),
});

const FINAL_ARCHETYPES = Object.freeze({
  "common-math-1": "다항식·방정식·경우의 수를 결합한 최종 조건 결정",
  "common-math-2": "함수 합성·역함수·좌표도형을 결합한 최종값 추론",
  algebra: "수열·삼각함수·지수로그 조건을 결합한 다중 분기 역추론",
  "probability-statistics": "조건부확률·분포·제한 경우의 수를 결합한 완전 분류",
  "calculus-1": "접선·극값·정적분을 결합한 함수 조건 복원",
});

const TIER_PROFILES = Object.freeze({
  T1: Object.freeze({ sourceBand: "Q13_14", concepts: 2, transforms: 1, cases: 1, expectedMinutes: [4, 6] }),
  T2: Object.freeze({ sourceBand: "Q13_14", concepts: 2, transforms: 1, cases: 1, expectedMinutes: [5, 7] }),
  T3: Object.freeze({ sourceBand: "Q20_21", concepts: 2, transforms: 2, cases: 2, expectedMinutes: [5, 8] }),
  T4: Object.freeze({ sourceBand: "Q20_21", concepts: 2, transforms: 2, cases: 2, expectedMinutes: [6, 8] }),
  T5: Object.freeze({ sourceBand: "Q27_28", concepts: 3, transforms: 2, cases: 2, expectedMinutes: [6, 9] }),
  T6: Object.freeze({ sourceBand: "Q27_28", concepts: 3, transforms: 2, cases: 3, expectedMinutes: [7, 9] }),
  // T7도 DB에는 실제 문항 위치 대역만 저장한다. 29·30번의 영향도는
  // FINAL_29_30 슬롯과 별도 난이도 특성으로 표현하며 enum 값을 합성하지 않는다.
  T7: Object.freeze({ sourceBand: "Q27_28", concepts: 3, transforms: 3, cases: 3, expectedMinutes: [7, 10] }),
  // 내부 T8·T9는 기존 DB 골격을 찾기 위한 호환 프로필이다. 실제 신규
  // U7~U9·R7~R9의 다섯 슬롯은 난이도 정책이 FINAL_29_30으로 덮어쓴다.
  T8: Object.freeze({ sourceBand: "Q27_28", concepts: 3, transforms: 3, cases: 4, expectedMinutes: [8, 10] }),
  T9: Object.freeze({ sourceBand: "Q27_28", concepts: 4, transforms: 3, cases: 4, expectedMinutes: [8, 10] }),
});

function generatorContract(typeId) {
  return Object.freeze({
    status: "SKELETON",
    parameterSchema: `${typeId}.parameters`,
    buildProblem: `${typeId}.buildProblem(parameters)`,
    independentSolve: `${typeId}.independentSolve(parameters)`,
    validate: `${typeId}.validate(problem, solvedAnswer)`,
    activationRequirements: Object.freeze([
      "UNIQUE_NATURAL_NUMBER_ANSWER_1_TO_999",
      "INDEPENDENT_SOLUTION_MATCH",
      "CALCULATOR_FREE",
      "CURRICULUM_COMPLIANT",
      "EXPECTED_TIME_AT_MOST_10_MINUTES",
      "NO_SOURCE_TEXT_COPY",
    ]),
  });
}

function makeSkeleton({
  tier,
  courseId,
  slotRole,
  label,
  sourceBand,
  referenceFamilies = [],
}) {
  const typeId = `${tier}-${COURSE_CODES[courseId]}-${slotRole}`;
  const profile = TIER_PROFILES[tier];
  return Object.freeze({
    typeId,
    tier,
    courseId,
    courseLabel: COURSE_LABELS[courseId],
    assessmentScope: COURSE_ASSESSMENT_SCOPES[courseId],
    behaviorDomains: ASSESSMENT_BEHAVIOR_DOMAINS,
    category: "semi-killer",
    slotRole,
    label,
    sourcePositionBand: sourceBand,
    referenceFamilies: Object.freeze(
      referenceFamilies.map((family) => Object.freeze({
        familyId: family.familyId,
        familyLabel: family.familyLabel,
        basis: family.basis,
        referenceCount: Number(family.references || 0),
        tierReferenceCount: Number(family.tierReferences || 0),
        slotReferenceCount: Number(family.slotReferences || 0),
      }))
    ),
    concepts: profile.concepts,
    conditionTransformSteps: profile.transforms,
    caseBranches: profile.cases,
    expectedMinutes: profile.expectedMinutes,
    answerFormat: "NATURAL_NUMBER_1_TO_999",
    generatorContract: generatorContract(typeId),
  });
}

const ARENA_ONE_ON_ONE_TYPE_SKELETONS = Object.freeze(
  Object.fromEntries(
    Object.keys(TIER_PROFILES).flatMap((tier, tierIndex) =>
      ARENA_SUPPORTED_COURSES.flatMap((courseId, courseIndex) => {
        const regularFamilies = familiesForTier(tier, courseId, {
          slotRole: "REGULAR",
          limit: 4,
        });
        const finalFamilies = familiesForTier(tier, courseId, {
          slotRole: "FINAL_29_30",
          limit: 4,
        });
        const regularLabel = regularFamilies[0]?.familyLabel ||
          REGULAR_ARCHETYPES[courseId][(tierIndex + courseIndex) % REGULAR_ARCHETYPES[courseId].length];
        const finalLabel = finalFamilies[0]?.familyLabel || FINAL_ARCHETYPES[courseId];
        const regular = makeSkeleton({
          tier,
          courseId,
          slotRole: "REGULAR",
          label: regularLabel,
          sourceBand: TIER_PROFILES[tier].sourceBand,
          referenceFamilies: regularFamilies,
        });
        const final = makeSkeleton({
          tier,
          courseId,
          slotRole: "FINAL_29_30",
          label: finalLabel,
          sourceBand: "Q29_30_KILLER",
          referenceFamilies: finalFamilies,
        });
        return [
          [regular.typeId, regular],
          [final.typeId, final],
        ];
      })
    )
  )
);

function skeletonsForTier(tier, { slotRole = "" } = {}) {
  return Object.values(ARENA_ONE_ON_ONE_TYPE_SKELETONS).filter(
    (item) => item.tier === tier && (!slotRole || item.slotRole === slotRole)
  );
}

module.exports = {
  ASSESSMENT_BEHAVIOR_DOMAINS,
  ARENA_ONE_ON_ONE_TYPE_SKELETONS,
  ARENA_SUPPORTED_COURSES,
  COURSE_ASSESSMENT_SCOPES,
  COURSE_LABELS,
  TIER_PROFILES,
  skeletonsForTier,
};
