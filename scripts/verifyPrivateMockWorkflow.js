const assert = require(
  "node:assert/strict"
);
const {
  buildPrivateMockSchedule,
  calculateWeeklyMmrPerformance,
  getIntegrityEvidenceDeadline,
  getPrivateMockPhase,
  getWeekSelectionLockAt,
  getUploadReminderWindow,
  parsePrivateMockExamDate,
  parseSeoulReleaseAt,
  privateMockAttemptNumber,
  privateMockWeekKey,
  privateMockWeekLabel,
  resolveWeeklyRepresentative,
  summarizePrivateMockRestrictionWeeks,
  validateAnswerKeyJson,
} = require(
  "../services/privateMockExamService"
);
const {
  calculateAbsencePenalty,
} = require(
  "../services/mmrService"
);

const answers = [
  "2", "4", "1", "3", "5",
  "2", "4", "1", "3", "5",
  "2", "4", "1", "3", "5",
  "2", "4", "1", "3", "5",
  "3", "56", "12", "440", "9",
  "48", "46", "13", "54", "10",
];
const points = [
  2, 2, 2, 3, 3,
  3, 3, 3, 3, 3,
  3, 3, 3, 4, 4,
  4, 4, 4, 4, 4,
  4, 3, 3, 3, 3,
  4, 4, 4, 4, 4,
];
const questionModes =
  answers.map(
    (_, index) =>
      index < 21
        ? "multiple-choice"
        : "short-answer"
  );

const parsed =
  validateAnswerKeyJson({
    answers,
    points,
    questionModes,
    explanations:
      answers.map(
        (_, index) => ({
          number: index + 1,
          concept:
            `$x_${index + 1}$`,
          steps: [
            `${index + 1}번 풀이`,
          ],
          summary:
            `${index + 1}번 정리`,
        })
      ),
  });

assert.equal(
  parsed.questionCount,
  30
);
assert.equal(
  parsed.totalPoints,
  100
);
assert.equal(
  parsed.questions[21].answer,
  "56"
);
assert.equal(
  parsed.questions[20].type,
  "multiple-choice"
);
assert.equal(
  parsed.questions[21].type,
  "short-answer"
);
assert.equal(
  parsed.questions[0]
    .explanation.concept,
  "$x_1$"
);
assert.deepEqual(
  parsed.questions[29]
    .explanation.steps,
  ["30번 풀이"]
);
assert.equal(
  validateAnswerKeyJson({
    questions:
      answers.map(
        (answer, index) => ({
          number: index + 1,
          answer,
          points:
            points[index],
        })
      ),
  }).questions[21].type,
  "short-answer"
);

const concepts = answers.map((_, index) => ({
  conceptId: `concept-${index + 1}`,
  conceptTitle: `${index + 1}번 핵심 개념`,
  courseTitle: "미적분",
  unitTitle: "수열의 극한",
}));
const parsedWithConcepts = validateAnswerKeyJson({
  schemaVersion: "matths-answer-key-v2",
  answers,
  points,
  questionModes,
  concepts,
}, { requireConcepts: true });
assert.equal(parsedWithConcepts.schemaVersion, "matths-answer-key-v2");
assert.equal(parsedWithConcepts.questions[0].concept.conceptId, "concept-1");
assert.equal(parsedWithConcepts.questions[29].concept.conceptTitle, "30번 핵심 개념");
assert.throws(
  () => validateAnswerKeyJson({ answers, points, questionModes }, { requireConcepts: true }),
  /문항의 개념 이름/
);

const releaseAt =
  parseSeoulReleaseAt(
    "2026-08-02T15:00"
  );
const schedule =
  buildPrivateMockSchedule(
    releaseAt
  );

assert.equal(
  releaseAt.toISOString(),
  "2026-08-02T06:00:00.000Z"
);
assert.equal(
  schedule.closeAt.toISOString(),
  "2026-08-02T07:40:00.000Z"
);
assert.equal(
  schedule.aggregationStartsAt.toISOString(),
  "2026-08-02T07:40:00.000Z"
);
assert.equal(
  schedule.rankingPublishesAt.toISOString(),
  "2026-08-02T14:00:00.000Z"
);
assert.equal(
  schedule.archiveAt.toISOString(),
  "2026-08-02T14:00:00.000Z"
);
assert.equal(
  schedule.reviewPublishesAt.toISOString(),
  "2026-08-02T14:00:00.000Z"
);
for (const [
  at,
  expected,
] of [
  [
    "2026-08-02T05:59:59.999Z",
    "scheduled",
  ],
  [
    "2026-08-02T06:00:00.000Z",
    "open",
  ],
  [
    "2026-08-02T07:40:00.000Z",
    "aggregating",
  ],
  [
    "2026-08-02T14:00:00.000Z",
    "archived",
  ],
]) {
  assert.equal(
    getPrivateMockPhase(
      schedule,
      new Date(at)
    ),
    expected
  );
}

const secondReleaseAt =
  parseSeoulReleaseAt(
    "2026-08-02T18:00"
  );
const thirdReleaseAt =
  parseSeoulReleaseAt(
    "2026-08-02T21:00"
  );
const fixedForm =
  parsePrivateMockExamDate(
    "2026-08-02",
    "B"
  );
const testForm =
  parsePrivateMockExamDate(
    "2026-07-29",
    "CUSTOM",
    "2026-07-29T19:00"
  );
const testSchedule =
  buildPrivateMockSchedule(
    testForm.releaseAt,
    100,
    {
      isTest: true,
    }
  );

assert.equal(
  fixedForm.releaseAt.toISOString(),
  "2026-08-02T09:00:00.000Z"
);
assert.equal(
  fixedForm.attemptNumber,
  2
);
assert.equal(
  fixedForm.scheduleLabel,
  "오후 6:00 ~ 오후 7:40"
);
assert.equal(
  testForm.releaseAt.toISOString(),
  "2026-07-29T10:00:00.000Z"
);
assert.equal(
  testForm.attemptNumber,
  0
);
assert.equal(
  testForm.isTest,
  true
);
assert.equal(
  testForm.isCustom,
  true
);
assert.equal(
  testSchedule.closeAt.toISOString(),
  "2026-07-29T11:40:00.000Z"
);
const thirdSchedule =
  buildPrivateMockSchedule(
    thirdReleaseAt
  );
assert.equal(
  thirdSchedule.closeAt.toISOString(),
  "2026-08-02T13:40:00.000Z"
);
assert.equal(
  thirdSchedule.aggregationStartsAt.toISOString(),
  "2026-08-02T13:41:00.000Z"
);
assert.equal(
  thirdSchedule.rankingPublishesAt.toISOString(),
  "2026-08-02T14:00:00.000Z"
);
assert.equal(
  getPrivateMockPhase(
    thirdSchedule,
    new Date(
      "2026-08-02T13:40:00.000Z"
    )
  ),
  "locked"
);
assert.equal(
  getPrivateMockPhase(
    thirdSchedule,
    new Date(
      "2026-08-02T13:41:00.000Z"
    )
  ),
  "aggregating"
);
assert.equal(
  privateMockWeekLabel(
    testForm.releaseAt
  ),
  "2026-07-29 (7월 4째주)"
);
assert.equal(
  getIntegrityEvidenceDeadline({
    releaseAt:
      thirdReleaseAt,
    requestedAt:
      new Date(
        "2026-08-02T13:41:00.000Z"
      ),
    source:
      "automatic",
  }).toISOString(),
  "2026-08-05T14:59:59.999Z"
);
assert.equal(
  getIntegrityEvidenceDeadline({
    releaseAt:
      thirdReleaseAt,
    requestedAt:
      new Date(
        "2026-08-04T01:30:00.000Z"
      ),
    source:
      "admin-manual",
  }).toISOString(),
  "2026-08-07T14:59:59.999Z"
);

assert.equal(
  privateMockWeekKey(
    releaseAt
  ),
  "2026-08-02"
);
assert.equal(
  privateMockWeekKey(
    secondReleaseAt
  ),
  "2026-08-02"
);
assert.equal(
  privateMockAttemptNumber(
    releaseAt
  ),
  1
);
assert.equal(
  privateMockAttemptNumber(
    secondReleaseAt
  ),
  2
);
assert.equal(
  privateMockAttemptNumber(
    thirdReleaseAt
  ),
  3
);
assert.equal(
  getWeekSelectionLockAt(
    releaseAt
  ).toISOString(),
  "2026-08-02T13:40:00.000Z"
);
assert.equal(
  calculateWeeklyMmrPerformance(
    [0.72]
  ),
  0.72
);
assert.equal(
  calculateWeeklyMmrPerformance(
    [0.72, 0.84]
  ),
  0.84 * 0.95 +
    0.72 * 0.05
);
assert.equal(
  calculateWeeklyMmrPerformance(
    [0.72, 0.84, 0.61]
  ),
  0.84 * 0.9 +
    0.72 * 0.1
);

const representativeAttempts = [
  {
    _id: "attempt-a",
    score: 88,
    elapsedMs: 5000,
    standardMetrics: {
      actualPerformance:
        0.78,
    },
  },
  {
    _id: "attempt-b",
    score: 92,
    elapsedMs: 7000,
    standardMetrics: {
      actualPerformance:
        0.84,
    },
  },
];
assert.equal(
  resolveWeeklyRepresentative({
    attempts:
      representativeAttempts,
    selectedAttemptId:
      "attempt-a",
  }).representative._id,
  "attempt-a"
);
assert.equal(
  resolveWeeklyRepresentative({
    attempts:
      representativeAttempts,
  }).representative._id,
  "attempt-b"
);
assert.equal(
  resolveWeeklyRepresentative({
    attempts: [
      representativeAttempts[0],
    ],
  }).selectionReason,
  "only-submission"
);
assert.equal(
  resolveWeeklyRepresentative({
    attempts: [],
  }).selectionReason,
  "no-submission"
);
assert.equal(
  calculateAbsencePenalty(1),
  -5
);
assert.equal(
  calculateAbsencePenalty(2),
  -5
);
assert.equal(
  calculateAbsencePenalty(3),
  -10
);
assert.equal(
  getUploadReminderWindow(
    new Date(
      "2026-07-30T05:59:59.000Z"
    )
  ).shouldRemind,
  false
);
assert.equal(
  getUploadReminderWindow(
    new Date(
      "2026-07-30T06:00:00.000Z"
    )
  ).shouldRemind,
  true
);
assert.equal(
  getUploadReminderWindow(
    new Date(
      "2026-08-02T06:00:00.000Z"
    )
  ).shouldRemind,
  false
);

const restrictionExams = [
  ["2026-08-02", "a1", "2026-08-02T07:40:00.000Z"],
  ["2026-08-02", "b1", "2026-08-02T10:40:00.000Z"],
  ["2026-08-02", "c1", "2026-08-02T13:40:00.000Z"],
  ["2026-08-09", "a2", "2026-08-09T07:40:00.000Z"],
  ["2026-08-09", "b2", "2026-08-09T10:40:00.000Z"],
  ["2026-08-09", "c2", "2026-08-09T13:40:00.000Z"],
  ["2026-08-16", "a3", "2026-08-16T07:40:00.000Z"],
  ["2026-08-16", "b3", "2026-08-16T10:40:00.000Z"],
  ["2026-08-16", "c3", "2026-08-16T13:40:00.000Z"],
].map(
  ([weekKey, _id, closeAt]) => ({
    weekKey,
    _id,
    closeAt:
      new Date(closeAt),
  })
);
const afterFirstRestrictedWeek =
  summarizePrivateMockRestrictionWeeks({
    exams:
      restrictionExams,
    now:
      new Date(
        "2026-08-02T14:00:00.000Z"
      ),
  });
assert.equal(
  afterFirstRestrictedWeek
    .remainingWeekCount,
  2
);
assert.deepEqual(
  afterFirstRestrictedWeek
    .servedWeekKeys,
  ["2026-08-02"]
);
assert.equal(
  afterFirstRestrictedWeek
    .servedExamIds.length,
  3,
  "같은 주 A·B·C는 제한 한 주로 계산되어야 합니다."
);
assert.equal(
  summarizePrivateMockRestrictionWeeks({
    exams:
      restrictionExams,
    now:
      new Date(
        "2026-08-16T14:00:00.000Z"
      ),
  }).active,
  false,
  "서로 다른 세 주가 끝난 뒤 제한이 해제되어야 합니다."
);

assert.throws(
  () =>
    parsePrivateMockExamDate(
      "2026-08-03",
      "A"
    ),
  /일요일/
);
assert.throws(
  () =>
    parseSeoulReleaseAt(
      "2026-08-03T15:00"
    ),
  /일요일 오후 3시·6시·9시/
);
assert.throws(
  () =>
    validateAnswerKeyJson(
      "{잘못된 JSON"
    ),
  /JSON 문법/
);
assert.throws(
  () =>
    validateAnswerKeyJson({
      answers:
        answers.slice(0, 29),
      points:
        points.slice(0, 29),
    }),
  /정확히 30문항/
);

console.log(
  "Matths 주간 공식 모의고사 JSON 답지·A/B/C 3회차·대표 성적·내부 실력 지표 안정성 보정·집계 시각 검증 완료"
);
