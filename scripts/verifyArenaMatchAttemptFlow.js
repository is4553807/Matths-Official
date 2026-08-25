const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const {
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchAttemptEvent,
  ArenaMatchEvidence,
  ArenaOutboxEvent,
  ArenaProblemPack,
} = require("../models/goatArenaModel");
const {
  assertArenaProblemPackIntegrity,
  buildGeneratedArenaProblemPackDraft,
  computeArenaProblemPackHash,
  sealArenaProblemPackDraft,
} = require("../services/arenaProblemPackService");
const {
  applyAnswerChanges,
  chooseSealedProblemPack,
  formatTimeLimit,
  initialAnswersForPack,
  normalizeAnswerChanges,
  normalizeOperationId,
  normalizeSignals,
  participantRole,
  publicQuestionsForAttempt,
  questionDeadlineAt,
  submitExpiredArenaAttempts,
} = require("../services/arenaMatchAttemptService");
const {
  compareArenaAttemptScores,
  scoreArenaAttempt,
} = require("../services/arenaMatchScoringService");
const {
  buildArenaMatchPreStartContract,
} = require("../services/arenaMatchPreStartContractService");

async function run() {
  const root = path.resolve(__dirname, "..");
  const startDeadlineAt = new Date("2026-08-26T06:00:00.000Z");
  const subNormalMatch = {
    division: "SUB",
    matchType: "NORMAL",
    startDeadlineAt,
    challenger: { stakeDays: 1 },
    defender: { stakeDays: 0 },
    economySnapshot: {
      challengerStakeDays: 1,
      defenderStakeDays: 0,
    },
  };
  const subChallengerContract = buildArenaMatchPreStartContract(
    subNormalMatch,
    "CHALLENGER"
  );
  assert.equal(
    subChallengerContract.stake,
    "페이백 점수 1점 · 매치 성립 시 예치 완료"
  );
  assert.match(subChallengerContract.win, /1점 반환.*상대 Arena 자리 획득/);
  assert.match(subChallengerContract.loss, /1점 상대에게 이전.*현재 Arena 자리 유지/);
  assert.equal(subChallengerContract.deadlineAt, startDeadlineAt);

  const subDefenderContract = buildArenaMatchPreStartContract(
    subNormalMatch,
    "DEFENDER"
  );
  assert.match(subDefenderContract.stake, /없음.*별도 예치하지 않음/);
  assert.match(subDefenderContract.win, /페이백 점수 1점 획득.*현재 Arena 자리 유지/);
  assert.match(subDefenderContract.loss, /예치 변동 없음.*Arena 자리 교환/);

  const mainInvitationDefenderContract = buildArenaMatchPreStartContract(
    {
      division: "MAIN",
      matchType: "NORMAL",
      startDeadlineAt,
      challenger: { stakeDays: 3 },
      defender: { stakeDays: 3 },
      economySnapshot: {
        challengerStakeDays: 3,
        defenderStakeDays: 3,
      },
    },
    "DEFENDER"
  );
  assert.match(mainInvitationDefenderContract.stake, /학습일수 3일/);
  assert.match(mainInvitationDefenderContract.win, /3일 반환.*3일 획득/);
  assert.match(mainInvitationDefenderContract.loss, /3일 상대에게 이전.*Arena 자리 교환/);
  const mainInvitationChallengerContract = buildArenaMatchPreStartContract(
    {
      division: "MAIN",
      matchType: "NORMAL",
      startDeadlineAt,
      challenger: { stakeDays: 3 },
      defender: { stakeDays: 3 },
      economySnapshot: {
        challengerStakeDays: 3,
        defenderStakeDays: 3,
      },
    },
    "CHALLENGER"
  );
  assert.match(mainInvitationChallengerContract.win, /3일 반환.*3일 획득.*Arena 자리 획득/);

  const revengeDeadlineAt = new Date("2026-08-27T06:00:00.000Z");
  const revengeContract = buildArenaMatchPreStartContract(
    {
      division: "MAIN",
      matchType: "REVENGE",
      startDeadlineAt: revengeDeadlineAt,
      completionDeadlineAt: revengeDeadlineAt,
      challenger: { stakeDays: 4 },
      defender: { stakeDays: 0 },
      economySnapshot: {
        challengerStakeDays: 4,
        defenderStakeDays: 0,
        feeDays: 1,
      },
    },
    "CHALLENGER"
  );
  assert.equal(revengeContract.deadlineLabel, "경기 완료 기한");
  assert.match(revengeContract.win, /학습일수 3일 반환.*1일 수수료/);
  assert.match(revengeContract.loss, /학습일수 3일 상대에게 이전.*1일 수수료/);

  const generatedAt = new Date("2026-08-01T00:00:00+09:00");
  const draft = buildGeneratedArenaProblemPackDraft({
    matchKey: "SUB:NORMAL:VERIFY-ATTEMPT-FLOW",
    generation: {
      pairKey: "EMERALD_DIAMOND",
      pairLabel: "에메랄드-다이아몬드",
      questions: Array.from({ length: 5 }, (_, index) => ({
        typeId: `VERIFY-TYPE-${index + 1}`,
        courseId: "COMMON-MATH",
        referenceFamily: `VERIFY-FAMILY-${index + 1}`,
        skillTags: [`verify-${index + 1}`],
        difficultyScore: 0.72 + index * 0.01,
        expectedTimeMs: 100000 + index * 5000,
        prompt: `검증용 주관식 문항 ${index + 1}`,
        answer: String(index + 1),
        solution: `검증 풀이 ${index + 1}`,
        design: {
          order: index + 1,
          courseId: "COMMON-MATH",
          difficultyPosition: ["LOW", "MID", "MID", "MID_HIGH", "HIGH"][index],
          slotRole: "REGULAR",
          sourcePositionBand: "Q27_28",
        },
        validation: {
          passed: true,
          solvable: true,
          uniqueAnswer: true,
          calculatorFree: true,
          answerMatches: true,
          checkedAt: generatedAt,
        },
      })),
    },
    generatedAt,
    scoringVersion:
      "ARENA-SCORING-TEST-V1",
  });
  assert.match(draft.version, /^SUB-AUTO-EMERALD_DIAMOND-/);
  assert.equal(draft.questions.length, 5);
  assert.equal(
    new Set(
      draft.questions.map(
        (question) => question.typeId
      )
    ).size,
    5
  );
  assert.equal(
    draft.questions.every(
      (question) =>
        question.category ===
          "semi-killer" &&
        question.validation.passed
    ),
    true
  );
  assert.equal(draft.totalPoints, 100);
  assert.equal(
    draft.timeLimitMs,
    10 * 60 * 1000
  );

  const sealed = sealArenaProblemPackDraft(
    draft,
    {
      sealedAt:
        "2026-08-01T01:00:00+09:00",
      autoValidated: true,
    }
  );
  assert.equal(sealed.status, "SEALED");
  assert.equal(
    sealed.contentHash,
    computeArenaProblemPackHash(sealed)
  );
  assert.equal(
    assertArenaProblemPackIntegrity(sealed),
    true
  );
  assert.equal(
    assertArenaProblemPackIntegrity({
      ...sealed,
      status: "RETIRED",
    }),
    true
  );
  assert.throws(
    () =>
      assertArenaProblemPackIntegrity({
        ...sealed,
        timeLimitMs: 11 * 60 * 1000,
      }),
    /제한 시간|무결성/
  );
  await assert.doesNotReject(() =>
    new ArenaProblemPack(sealed).validate()
  );

  assert.equal(
    formatTimeLimit(sealed.timeLimitMs),
    "10분"
  );
  const questionStartedAt =
    new Date(
      "2026-08-01T02:00:00+09:00"
    );
  assert.equal(
    questionDeadlineAt({
      startedAt:
        questionStartedAt,
      match: {
        completionDeadlineAt:
          null,
      },
    }).getTime() -
      questionStartedAt.getTime(),
    10 * 60 * 1000,
    "1대1 경기는 전체가 아니라 문항마다 10분이어야 합니다."
  );
  assert.equal(
    questionDeadlineAt({
      startedAt:
        questionStartedAt,
      match: {
        completionDeadlineAt:
          new Date(
            questionStartedAt.getTime() +
              3 * 60 * 1000
          ),
      },
    }).getTime() -
      questionStartedAt.getTime(),
    3 * 60 * 1000,
    "일요일·복수전 완료 마감은 현재 문항 제한보다 우선해야 합니다."
  );
  assert.equal(
    chooseSealedProblemPack(
      [sealed, { ...sealed, version: "B" }],
      "match-1"
    ),
    chooseSealedProblemPack(
      [sealed, { ...sealed, version: "B" }],
      "match-1"
    )
  );
  assert.equal(
    chooseSealedProblemPack([], "match-1"),
    null
  );

  const challengerUserId =
    new mongoose.Types.ObjectId();
  const defenderUserId =
    new mongoose.Types.ObjectId();
  const challengerStandingId =
    new mongoose.Types.ObjectId();
  const defenderStandingId =
    new mongoose.Types.ObjectId();
  const challengerCycleId =
    new mongoose.Types.ObjectId();
  const defenderCycleId =
    new mongoose.Types.ObjectId();
  const packId =
    new mongoose.Types.ObjectId();
  const matchId =
    new mongoose.Types.ObjectId();
  const attemptId =
    new mongoose.Types.ObjectId();
  const match = new ArenaMatch({
    _id: matchId,
    matchKey: `SUB:NORMAL:${matchId}`,
    division: "SUB",
    seasonKey: "2026",
    matchType: "NORMAL",
    requestInitiatorUserId:
      challengerUserId,
    tierPairKey: "EMERALD_DIAMOND",
    tierPairLabel: "에메랄드-다이아몬드",
    challenger: {
      userId: challengerUserId,
      standingId: challengerStandingId,
      accessCycleId: challengerCycleId,
      tupleBefore: {
        arenaRank: "에메랄드",
        arenaPosition: 2,
        arenaGp: 40,
      },
      stakeDays: 1,
    },
    defender: {
      userId: defenderUserId,
      standingId: defenderStandingId,
      accessCycleId: defenderCycleId,
      tupleBefore: {
        arenaRank: "다이아몬드",
        arenaPosition: 11,
        arenaGp: 70,
      },
      stakeDays: 0,
    },
    status: "READY",
    policyVersionCode:
      "ARENA-20260801-TEST",
    problemPackId: packId,
    problemPackVersion: sealed.version,
    scoringVersion:
      sealed.scoringVersion,
    timeLimitMs: sealed.timeLimitMs,
    requestedAt: new Date(),
    startDeadlineAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    readyAt: new Date(),
  });
  await assert.doesNotReject(() =>
    match.validate()
  );
  assert.equal(
    participantRole(match, challengerUserId),
    "CHALLENGER"
  );
  assert.equal(
    participantRole(match, defenderUserId),
    "DEFENDER"
  );
  assert.equal(
    participantRole(
      match,
      new mongoose.Types.ObjectId()
    ),
    null
  );
  const answers = initialAnswersForPack(
    sealed
  );
  assert.equal(answers.length, 5);
  const attempt = new ArenaMatchAttempt({
    _id: attemptId,
    matchId,
    userId: challengerUserId,
    role: "CHALLENGER",
    problemPackId: packId,
    problemPackVersion: sealed.version,
    variantCode: "COMMON",
    status: "IN_PROGRESS",
    answers,
    startedAt: new Date(),
    deadlineAt: new Date(
      Date.now() + sealed.timeLimitMs
    ),
  });
  const changes = normalizeAnswerChanges(
    [
      {
        questionKey: "Q1",
        value: "  12  ",
        clientAt:
          "2026-08-01T02:00:00+09:00",
      },
      {
        questionKey: "Q1",
        value: "13",
        clientAt:
          "2026-08-01T02:00:01+09:00",
      },
    ],
    sealed.questions.map(
      (question) => question.questionKey
    )
  );
  assert.deepEqual(
    changes.map((change) => change.value),
    ["12", "13"]
  );
  applyAnswerChanges({
    attempt,
    changes,
    now: new Date(),
  });
  assert.equal(attempt.answers[0].value, "13");
  assert.equal(attempt.answers[0].revision, 2);
  assert.equal(attempt.answerRevision, 2);
  await assert.doesNotReject(() =>
    attempt.validate()
  );
  assert.throws(
    () =>
      normalizeAnswerChanges(
        [
          {
            questionKey: "UNKNOWN",
            value: "1",
          },
        ],
        ["Q1"]
      ),
    /문항 정보/
  );

  const publicQuestions =
    publicQuestionsForAttempt(
      sealed,
      attempt
    );
  assert.equal(
    publicQuestions[0].savedAnswer,
    "13"
  );
  assert.match(publicQuestions[0].targetAccuracy.label, /%$/);
  assert.equal(
    Object.hasOwn(
      publicQuestions[0],
      "answer"
    ),
    false
  );

  attempt.answers[0].value = "1/2";
  sealed.questions[0].answer = "0.5";
  sealed.questions[0].answerKey = null;
  attempt.questionTimings = [
    {
      questionKey: sealed.questions[0].questionKey,
      startedAt: new Date(),
      completedAt: new Date(),
      responseTimeMs: 42000,
    },
  ];
  attempt.activeSolveTimeMs = 120000;
  const scoring = scoreArenaAttempt({ attempt, problemPack: sealed });
  assert.equal(scoring.questionResults[0].correct, true);
  assert.equal(scoring.correctAnswerSolveTimeMs, 42000);
  assert.equal(
    compareArenaAttemptScores(
      { score: 80, correctCount: 4, correctAnswerSolveTimeMs: 100000 },
      { score: 80, correctCount: 4, correctAnswerSolveTimeMs: 110000 }
    ),
    "CHALLENGER"
  );
  assert.equal(
    compareArenaAttemptScores(
      { score: 100, correctCount: 5, correctAnswerSolveTimeMs: 100000 },
      { score: 100, correctCount: 5, correctAnswerSolveTimeMs: 100000 }
    ),
    "DEFENDER"
  );
  assert.equal(
    Object.hasOwn(
      publicQuestions[0],
      "solution"
    ),
    false
  );

  assert.equal(
    normalizeOperationId(
      "12449be6-321b-4d48-b724-841454987304",
      "검증"
    ),
    "12449be6-321b-4d48-b724-841454987304"
  );
  assert.throws(
    () => normalizeOperationId("short", "검증"),
    /식별자/
  );
  assert.deepEqual(
    normalizeSignals([
      { type: "heartbeat" },
      {
        type: "focus_lost",
        clientAt:
          "2026-08-01T03:00:00+09:00",
      },
      {
        type: "page_exited",
        questionKey: "Q1",
      },
    ], ["Q1"]).map((signal) => signal.type),
    ["HEARTBEAT", "FOCUS_LOST", "PAGE_EXITED"]
  );
  assert.throws(
    () =>
      normalizeSignals(
        [
          {
            type: "QUESTION_FOCUSED",
            questionKey: "UNKNOWN",
          },
        ],
        ["Q1"]
      ),
    /문항 활동/
  );
  assert.deepEqual(
    await submitExpiredArenaAttempts({
      now: new Date(
        "2026-08-02T15:00:00+09:00"
      ),
    }),
    {
      scanned: 0,
      submitted: 0,
      divisionLocked: true,
    }
  );

  await assert.doesNotReject(() =>
    new ArenaMatchAttemptEvent({
      attemptId,
      matchId,
      userId: challengerUserId,
      idempotencyKey:
        "ARENA_SAVE:12449be6-321b-4d48-b724-841454987304",
      eventType: "ANSWERS_SAVED",
      answerChanges: changes,
      serverAt: new Date(),
    }).validate()
  );
  await assert.doesNotReject(() =>
    new ArenaMatchEvidence({
      attemptId,
      matchId,
      userId: challengerUserId,
      files: [
        {
          originalName: "proof.png",
          storedName: "proof.png",
          mimeType: "image/png",
          sizeBytes: 10000,
          sha256: "a".repeat(64),
        },
      ],
      deadlineAt: new Date(Date.now() + 60000),
      submittedAt: new Date(),
      status: "ON_TIME",
    }).validate()
  );
  for (const eventType of [
    "ArenaMatchReady",
    "ArenaAttemptStarted",
    "ArenaAttemptSubmitted",
    "ArenaMatchSubmitted",
  ]) {
    await assert.doesNotReject(() =>
      new ArenaOutboxEvent({
        eventType,
        aggregateType: "ArenaMatch",
        aggregateId: matchId,
        idempotencyKey:
          `${matchId}:${eventType}`,
      }).validate()
    );
  }

  const serviceSource = fs.readFileSync(
    path.join(
      root,
      "services/arenaMatchAttemptService.js"
    ),
    "utf8"
  );
  const routeSource = fs.readFileSync(
    path.join(
      root,
      "routes/goat-arena-routes.js"
    ),
    "utf8"
  );
  const viewSource = fs.readFileSync(
    path.join(
      root,
      "views/goat-arena-match.ejs"
    ),
    "utf8"
  );
  const clientSource = fs.readFileSync(
    path.join(
      root,
      "public/js/goat-arena-match.js"
    ),
    "utf8"
  );

  assert.equal(
    /ArenaStanding|AccessCycle|arenaGp\s*=/.test(
      serviceSource
    ),
    false,
    "응시 단계에서는 순위·GP·학습일 정산을 수행하면 안 됩니다."
  );
  assert.ok(
    serviceSource.includes(
      "assertArenaProblemPackIntegrity"
    ) &&
      serviceSource.includes(
        'match.status = "READY"'
      ) &&
      serviceSource.includes(
        'attempt.status = "IN_PROGRESS"'
      ) &&
      serviceSource.includes(
        'attempt.status = "EVIDENCE_REQUIRED"'
      ) &&
      serviceSource.includes(
        "ArenaMatchAttemptEvent.create"
      )
  );
  assert.ok(
    routeSource.includes(
      '"/goat-arena/matches/:matchId"'
    ) &&
      routeSource.includes(
        '"/api/goat-arena/matches/:matchId/answers"'
      ) &&
      routeSource.includes(
        '"/api/goat-arena/matches/:matchId/advance"'
      ) &&
      routeSource.includes(
        '"/goat-arena/matches/:matchId/evidence"'
      )
  );
  assert.ok(
    viewSource.includes(
      "두 참가자에게 같은 주관식 5문항"
    ) &&
      viewSource.includes(
        "서비스 닉네임입니다."
      ) &&
      viewSource.includes(
        "실명·학교·지역·연락처는 공개하지 않습니다."
      ) &&
      !viewSource.includes(
        "question.answer"
      ) &&
      !viewSource.includes(
        "question.solution"
      )
  );
  assert.ok(
    viewSource.includes("arena-prestart-contract") &&
      viewSource.includes("내가 걸게 되는 것") &&
      viewSource.includes("내가 이기면") &&
      viewSource.includes("내가 지면") &&
      viewSource.includes("formatKstDeadline"),
    "경기 시작 전 역할별 예치·승패·기한 요약을 렌더링해야 합니다."
  );
  assert.ok(
    clientSource.includes("/advance") &&
      clientSource.includes("TIME_LIMIT") &&
      clientSource.includes("visibilitychange") &&
      clientSource.includes('enqueueFocusSignal("FOCUS_LOST")') &&
      clientSource.includes('"pagehide"') &&
      clientSource.includes("lastFocusSignalAt") &&
      clientSource.includes('"beforeunload"') &&
      clientSource.includes("event.returnValue = true") &&
      clientSource.includes('"popstate"') &&
      clientSource.includes("window.history.pushState") &&
      clientSource.includes("confirmMatchExit") &&
      clientSource.includes("releaseNavigationGuard") &&
      clientSource.includes("historyGuardAlreadyInstalled") &&
      clientSource.includes('"pageshow"') &&
      clientSource.includes("event.persisted") &&
      clientSource.includes('"PAGE_EXITED"') &&
      clientSource.includes("enqueuePageExitSignal")
  );

  console.log(
    "Arena match problem-pack and attempt flow verification passed."
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
