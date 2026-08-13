const assert = require(
  "node:assert/strict"
);
const {
  auditPlacementBank,
  buildPlacementPaper,
  buildPlacementVerificationQuestions,
  candidateTypesForBlueprint,
  PLACEMENT_QUESTION_BLUEPRINTS,
} = require(
  "../services/placementExamBank"
);
const {
  _testing,
} = require(
  "../services/placementExamService"
);

const SAMPLES_PER_TYPE = 25;
const PAPER_SAMPLES = 300;
const MIN_TYPES_PER_NUMBER = 5;
const generatedTypesByNumber =
  Array.from(
    { length: 30 },
    () => new Set()
  );
const audit = auditPlacementBank(
  SAMPLES_PER_TYPE
);

if (audit.failures.length) {
  throw new Error(
    `배치고사 유형 검증 실패: ${audit.failures.join(", ")}`
  );
}

for (const blueprint of
  PLACEMENT_QUESTION_BLUEPRINTS) {
  const probabilityTotal =
    candidateTypesForBlueprint(
      blueprint
    ).reduce(
      (sum, candidate) =>
        sum +
        candidate.weight,
      0
    );

  if (
    Math.abs(
      probabilityTotal - 100
    ) > 0.001
  ) {
    throw new Error(
      `${blueprint.number}번 유형 확률 합이 ${probabilityTotal}%입니다.`
    );
  }
}

for (
  let index = 0;
  index < PAPER_SAMPLES;
  index += 1
) {
  const paper =
    buildPlacementPaper();
  paper.questions.forEach(
    (question, questionIndex) => {
      generatedTypesByNumber[
        questionIndex
      ].add(question.typeId);
    }
  );
  const prompts = new Set(
    paper.questions.map(
      (question) =>
        question.prompt
    )
  );
  const uniqueTypeIdentities =
    new Set(
      paper.questions.map(
        (question) =>
          question.semanticTypeId ||
          question.similarGroupId
      )
    );
  const verificationQuestions =
    buildPlacementVerificationQuestions({
      excludedTypeIds:
        paper.questions.map(
          (question) =>
            question.typeId
        ),
      excludedSemanticTypeIds:
        [
          ...uniqueTypeIdentities,
        ],
    });
  const allSemanticTypes =
    new Set([
      ...uniqueTypeIdentities,
      ...verificationQuestions.map(
        (question) =>
          question.semanticTypeId ||
          question.similarGroupId
      ),
    ]);
  const threePointCount =
    paper.questions.filter(
      (question) =>
        question.points === 3
    ).length;
  const fourPointCount =
    paper.questions.filter(
      (question) =>
        question.points === 4
    ).length;
  const categoryCounts =
    paper.questions.reduce(
      (counts, question) => {
        const category =
          question.placementCategory;
        counts[category] =
          (
            counts[category] || 0
          ) + 1;
        return counts;
      },
      {}
    );
  const advancedTypeIds =
    paper.questions
      .filter(
        (question) =>
          [
            "semi-killer",
            "killer",
          ].includes(
            question.placementCategory
          )
      )
      .map(
        (question) =>
          question.typeId
      );
  const validated =
    paper.questions.every(
      (question) =>
        question.validation
          ?.passed &&
        question.validation
          ?.solvable &&
        question.validation
          ?.uniqueAnswer &&
        question.validation
          ?.calculatorFree &&
        question.validation
          ?.answerMatches
    );

  if (
    paper.questions.length !== 30 ||
    paper.totalPoints !== 100 ||
    prompts.size !== 30 ||
    uniqueTypeIdentities.size !== 30 ||
    verificationQuestions.length !== 4 ||
    allSemanticTypes.size !== 34 ||
    threePointCount !== 20 ||
    fourPointCount !== 10 ||
    categoryCounts[
      "semi-killer"
    ] !== 2 ||
    categoryCounts.killer !== 2 ||
    new Set(
      advancedTypeIds
    ).size !== 4 ||
    !validated
  ) {
    throw new Error(
      `배치고사 ${index + 1}회차 구성 검산에 실패했습니다.`
    );
  }
}

generatedTypesByNumber.forEach(
  (types, index) => {
    if (
      types.size <
      MIN_TYPES_PER_NUMBER
    ) {
      throw new Error(
        `${index + 1}번이 ${PAPER_SAMPLES}회 생성 동안 ${MIN_TYPES_PER_NUMBER}개 유형을 확보하지 못했습니다: ${[
          ...types,
        ].join(", ")}`
      );
    }
  }
);

const profilePaper =
  buildPlacementPaper();
profilePaper.questions.forEach(
  (question, index) => {
    question.isCorrect =
      index % 3 !== 0;
    question.submittedAnswer =
      question.isCorrect
        ? question.answer
        : "검산용 오답";
    question.responseTimeMs =
      Math.round(
        (
          Number(
            question.expectedTimeMs
          ) || 120000
        ) * 0.7
      );
  }
);
const profileKeyQuestions =
  [20, 21, 28, 30].map(
    (questionNumber) => {
      const question =
        profilePaper.questions[
          questionNumber - 1
        ];

      return {
        questionNumber,
        answered: true,
        correct:
          question.isCorrect,
        category:
          question.placementCategory,
        difficultyScore:
          question.difficultyScore,
        skillTags:
          question.skillTags,
        responseTimeMs:
          question.responseTimeMs,
      };
    }
  );
const profile =
  _testing.placementProfile({
    attempt: profilePaper,
    totalPercentile: 0.58,
    threePointCorrect:
      profilePaper.questions
        .slice(0, 20)
        .filter(
          (question) =>
            question.isCorrect
        ).length,
    fourPointCorrect:
      profilePaper.questions
        .slice(20)
        .filter(
          (question) =>
            question.isCorrect
        ).length,
    keyQuestions:
      profileKeyQuestions,
    answered: 30,
  });
assert.equal(
  _testing.stableTotalPercentile(
    4,
    [{ scorePercent: 4 }]
  ),
  0.019,
  "소표본 배치 점수는 더미 모집단이 아니라 고정 기준분포 백분위를 사용해야 합니다."
);
const oneCorrectPaper =
  buildPlacementPaper();
oneCorrectPaper.questions.forEach(
  (question, index) => {
    question.isCorrect =
      index === 0;
    question.submittedAnswer =
      question.isCorrect
        ? question.answer
        : "검산용 오답";
  }
);
const oneCorrectProfile =
  _testing.placementProfile({
    attempt: oneCorrectPaper,
    totalPercentile:
      _testing.stableTotalPercentile(
        3,
        []
      ),
    threePointCorrect: 1,
    fourPointCorrect: 0,
    keyQuestions:
      [20, 21, 28, 30].map(
        (questionNumber) => ({
          questionNumber,
          answered: true,
          correct: false,
          category:
            oneCorrectPaper
              .questions[
                questionNumber - 1
              ].placementCategory,
          skillTags:
            oneCorrectPaper
              .questions[
                questionNumber - 1
              ].skillTags,
        })
      ),
    answered: 30,
  });
const oneCorrectStanding =
  _testing.standingFromScores(
    oneCorrectProfile
      .placementScore,
    [
      {
        placementResult: {
          placementScore:
            oneCorrectProfile
              .placementScore,
        },
      },
    ]
  );
assert.equal(
  oneCorrectStanding.initialTier,
  "브론즈",
  "1/30 수준의 배치 결과가 중상위 티어로 산정되면 안 됩니다."
);
const lowStanding =
  _testing.standingFromScores(
    10,
    [
      {
        placementResult: {
          placementScore: 10,
        },
      },
    ]
  );
assert.equal(
  lowStanding.initialTier,
  "브론즈"
);
assert.equal(
  lowStanding.calibrationPolicyVersion,
  "PLACEMENT_REFERENCE_V2_MOE_NINE_GRADE"
);
assert.equal(lowStanding.referenceGrade, 9);
assert.equal(lowStanding.estimatedRankPopulation, 10000);
assert.equal(lowStanding.estimatedRank, 9910);
assert.equal(
  lowStanding.cohortRank,
  1
);
assert.equal(lowStanding.actualRankPublished, false);
assert.equal(lowStanding.actualRankMinimumCohortSize, 100);
assert.equal(
  _testing.actualStandingFromScores(
    50,
    Array.from({ length: 100 }, (_, index) => ({
      placementResult: { placementScore: index },
    }))
  ).actualRankPublished,
  true,
  "실제 응시자 순위는 유효 응시자 100명부터 공개해야 합니다."
);
const refreshedActualStanding =
  _testing.actualStandingFromScores(
    10,
    [
      { placementResult: { placementScore: 80 } },
      { placementResult: { placementScore: 10 } },
      { placementResult: { placementScore: 5 } },
    ]
  );
const frozenStanding =
  _testing.frozenStandingView(
    {
      ...lowStanding,
      calibratedAt:
        new Date("2026-08-14T00:00:00.000Z"),
    },
    refreshedActualStanding
  );
assert.equal(
  frozenStanding.initialMmr,
  lowStanding.initialMmr,
  "실제 응시자가 늘어나도 확정된 초기 MMR은 바뀌면 안 됩니다."
);
assert.equal(
  frozenStanding.initialTier,
  "브론즈",
  "실제 응시자가 늘어나도 확정된 최초 티어는 바뀌면 안 됩니다."
);
assert.equal(
  frozenStanding.cohortRank,
  2,
  "실제 응시자 순위만 최신 제출 기록으로 갱신되어야 합니다."
);
const standing =
  _testing.standingFromScores(
    profile.placementScore,
    [
      {
        placementResult: {
          placementScore: 42,
        },
      },
      {
        placementResult: {
          placementScore: 58,
        },
      },
      {
        placementResult: {
          placementScore: 73,
        },
      },
    ]
  );
const timingAttempt = {
  scopeType: "placement",
  activeQuestionId: "q1",
  currentQuestionIndex: 0,
  questionTimingLastSeenAt:
    new Date(1000),
  questions: [
    {
      questionId: "q1",
      responseTimeMs: 0,
      enteredAt: new Date(1000),
      visitCount: 1,
    },
    {
      questionId: "q2",
      responseTimeMs: 0,
      enteredAt: null,
      visitCount: 0,
    },
  ],
};
_testing.touchQuestionTiming(
  timingAttempt,
  {
    activeQuestionId: "q2",
    currentQuestionIndex: 1,
    now: new Date(6000),
  }
);

if (
  !Number.isFinite(
    profile.placementScore
  ) ||
  !Number.isFinite(
    profile.abilityProfile
      .placementConfidence
  ) ||
  !Number.isFinite(
    standing.initialMmr
  ) ||
  standing.rankingStatus !==
    "provisional" ||
  standing.positionBasis !==
    "MOE_NINE_GRADE_REFERENCE_DISTRIBUTION" ||
  timingAttempt.questions[0]
    .responseTimeMs !== 5000 ||
  timingAttempt.questions[1]
    .visitCount !== 1
) {
  throw new Error(
    "배치 랭킹 프로필 검산에 실패했습니다."
  );
}

console.log(
  [
    `과거 세부 유형 ${audit.historicalTypeCount}개`,
    `번호별 기준형 ${audit.targetTypeCount}개`,
    `번호 청사진 ${audit.questionBlueprintCount}개`,
    `준킬러 생성형 ${audit.semiKillerTypeCount}개`,
    `킬러 생성형 ${audit.killerTypeCount}개`,
    `참고 구조군 ${audit.advancedReferenceFamilyCount}개`,
    `무작위 시험지 ${PAPER_SAMPLES}회`,
    `번호별 생성 유형 최소 ${Math.min(
      ...generatedTypesByNumber.map(
        (types) =>
          types.size
      )
    )}종`,
    "검증 완료",
  ].join(" · ")
);
