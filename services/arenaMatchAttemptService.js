const mongoose = require("mongoose");
const {
  createHash,
} = require("node:crypto");
const {
  User,
} = require("../models/matthsModel");
const {
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchAttemptEvent,
  ArenaRevengeRight,
  ArenaOutboxEvent,
  ArenaProblemPack,
} = require("../models/goatArenaModel");
const {
  assertArenaProblemPackIntegrity,
} = require("./arenaProblemPackService");
const {
  isSundayDivisionLocked,
  isSundayMatchRequestLocked,
} = require("./arenaMatchService");
const {
  ARENA_ONE_ON_ONE_EVIDENCE_LIMIT_MS,
  ARENA_ONE_ON_ONE_TIME_LIMIT_MS,
} = require("./arenaOneOnOneProblemBank");
const {
  assertNaturalNumberMaxThreeDigits,
  targetAccuracyRangeForSlot,
} = require("./arenaOneOnOneDifficultyPolicy");
const {
  SOURCE_DIFFICULTY_BANDS,
} = require("./arenaMatchDifficultyPlan");
const {
  arenaPdfSourceMetadataForReferenceId,
} = require("./arenaPdfOneOnOneQuestionPool");
const {
  holdExpiredEvidence,
  holdExpiredMatchStarts,
  holdSundayCutoffMatches,
} = require("./arenaMatchEvidenceService");
const {
  settleExpiredSubRevengeMatches,
} = require("./arenaMatchSettlementService");
const {
  settleExpiredMainRevengeMatches,
} = require("./mainArenaRevengeService");
const {
  buildArenaMatchPreStartContract,
} = require("./arenaMatchPreStartContractService");
const {
  buildArenaMatchIntegrityWatermark,
} = require("./contentProtectionWatermarkPolicy");
const { withSchedulerLease } = require("./schedulerLeaseService");

const MAX_CHANGE_EVENTS_PER_REQUEST = 200;
const MAX_SIGNAL_EVENTS_PER_REQUEST = 200;
const MATCH_START_INTRO_DELAY_MS = 3650;
const QUESTION_INTRO_DELAY_MS = 1700;
const ATTEMPT_SCHEDULER_INTERVAL_MS = 10 * 1000;
const TIMEOUT_ADVANCE_RECONCILIATION_MS =
  ATTEMPT_SCHEDULER_INTERVAL_MS + 5 * 1000;
let attemptScheduleTimer = null;
let attemptScheduleRunning = false;

const MATCH_STATUS_LABELS = {
  MATCHED: "문제 배정 대기",
  READY: "경기 준비 완료",
  IN_PROGRESS: "경기 진행 중",
  SUBMITTED: "양측 제출 완료",
  RESOLVED: "결과 확인 중",
  HELD: "운영 검토 중",
  INVALID: "경기 무효 검토",
  SETTLED: "경기 정산 완료",
  CANCELLED: "경기 취소",
  INSURED_CANCELLED: "방어 일정 보호로 종료",
};

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function queryWithSession(query, session) {
  return session ? query.session(session) : query;
}

function normalizeOperationId(value, label) {
  const id = String(value || "").trim();
  if (
    id.length < 16 ||
    id.length > 160 ||
    !/^[A-Za-z0-9._:-]+$/.test(id)
  ) {
    throw statusError(
      400,
      `${label} 식별자를 확인해주세요.`,
      "INVALID_ARENA_OPERATION_ID"
    );
  }
  return id;
}

function cleanAnswer(value) {
  const answer = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  if (answer && !/^[0-9]{1,3}$/.test(answer)) {
    throw statusError(
      400,
      "답은 3자리 이하 자연수로 입력해주세요.",
      "INVALID_ARENA_ANSWER_FORMAT"
    );
  }
  return answer;
}

function timeoutAdvanceOperationId({
  attemptId,
  deadlineAt,
}) {
  const cleanAttemptId = String(
    attemptId || ""
  ).trim();
  const deadlineMs = new Date(
    deadlineAt
  ).getTime();
  if (
    !cleanAttemptId ||
    !Number.isFinite(deadlineMs)
  ) {
    throw statusError(
      409,
      "제한 시간 제출 정보를 확인할 수 없습니다.",
      "ARENA_TIMEOUT_OPERATION_NOT_AVAILABLE"
    );
  }
  return `QUESTION_TIME_LIMIT:${cleanAttemptId}:${deadlineMs}`;
}

function resolveAdvanceAnswer({
  submissionMode = "MANUAL",
  value,
  savedAnswer = "",
}) {
  const timedOut =
    submissionMode === "TIME_LIMIT";
  const hasLatestAnswer =
    value !== undefined && value !== null;
  const normalizedSavedAnswer =
    cleanAnswer(savedAnswer);
  const finalAnswer = cleanAnswer(
    timedOut && !hasLatestAnswer
      ? normalizedSavedAnswer
      : value
  );
  return {
    timedOut,
    finalAnswer,
    // 스케줄러처럼 value를 보내지 않는 기존 TIME_LIMIT 호출은 이미 저장된
    // 답을 그대로 사용한다. 웹이 value(빈 문자열 포함)를 명시한 경우에만
    // 현재 문항 답을 advance 트랜잭션 안에서 원자적으로 갱신한다.
    shouldApplyAnswer:
      !timedOut ||
      (
        hasLatestAnswer &&
        finalAnswer !== normalizedSavedAnswer
      ),
  };
}

function safeClientDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function participantRole(match, userId) {
  if (
    String(match?.challenger?.userId) ===
    String(userId)
  ) {
    return "CHALLENGER";
  }
  if (
    String(match?.defender?.userId) ===
    String(userId)
  ) {
    return "DEFENDER";
  }
  return null;
}

function assertMatchParticipant(match, userId) {
  const role = participantRole(match, userId);
  if (!role) {
    throw statusError(
      403,
      "이 경기에 참가한 사용자만 열람할 수 있습니다.",
      "ARENA_MATCH_PARTICIPANT_REQUIRED"
    );
  }
  return role;
}

function chooseSealedProblemPack(
  packs,
  matchId
) {
  if (!Array.isArray(packs) || !packs.length) {
    return null;
  }
  const digest = createHash("sha256")
    .update(String(matchId), "utf8")
    .digest();
  const cursor = digest.readUInt32BE(0);
  return packs[cursor % packs.length];
}

function initialAnswersForPack(pack) {
  return (pack.questions || []).map(
    (question) => ({
      questionKey: question.questionKey,
      value: "",
      revision: 0,
      lastChangedAt: null,
    })
  );
}

function formatAccuracyPercent(value) {
  const percentage = Number(value) * 100;
  if (!Number.isFinite(percentage)) return "";
  return Number.isInteger(percentage)
    ? String(percentage)
    : percentage.toFixed(1).replace(/\.0$/, "");
}

function formatSourceCorrectRatePercent(value) {
  const percentage = Number(value);
  if (!Number.isFinite(percentage)) return "";
  return Number.isInteger(percentage)
    ? String(percentage)
    : percentage.toFixed(1).replace(/\.0$/, "");
}

function publicSourceAccuracyForQuestion(question) {
  const source = arenaPdfSourceMetadataForReferenceId(
    question?.sourceTypeId
  );
  if (!source) return null;
  const band = SOURCE_DIFFICULTY_BANDS[source.sourceDifficultyCode];
  if (!band) return null;

  const exact = source.correctRatePercent === null
    ? null
    : Number(source.correctRatePercent);
  if (exact !== null && Number.isFinite(exact)) {
    return {
      min: exact / 100,
      max: exact / 100,
      label: `${formatSourceCorrectRatePercent(exact)}%`,
      basisLabel: "원문 정답률",
      rangeLabel: `${source.sourceDifficultyCode} · ${band.rangeLabel}`,
      sourceDifficultyCode: source.sourceDifficultyCode,
      evidenceKind: "EXACT",
    };
  }

  const lower = source.correctRateLowerBoundPercent === null
    ? null
    : Number(source.correctRateLowerBoundPercent);
  if (lower !== null && Number.isFinite(lower)) {
    return {
      min: lower / 100,
      max: source.correctRateUpperBoundPercent !== null &&
        Number.isFinite(Number(source.correctRateUpperBoundPercent))
        ? Number(source.correctRateUpperBoundPercent) / 100
        : 1,
      label: `${formatSourceCorrectRatePercent(lower)}% 이상`,
      basisLabel: "원문 정답률 하한",
      rangeLabel: `${source.sourceDifficultyCode} · ${band.rangeLabel}`,
      sourceDifficultyCode: source.sourceDifficultyCode,
      evidenceKind: "CENSORED_BOUND",
    };
  }
  return null;
}

function publicTargetAccuracyForQuestion(pack, question, order) {
  const sourceAccuracy = publicSourceAccuracyForQuestion(question);
  if (sourceAccuracy) return sourceAccuracy;
  const hasStoredValues =
    question?.targetAccuracyMin !== null &&
    question?.targetAccuracyMin !== undefined &&
    question?.targetAccuracyMax !== null &&
    question?.targetAccuracyMax !== undefined;
  const storedRange = [
    Number(question?.targetAccuracyMin),
    Number(question?.targetAccuracyMax),
  ];
  const hasStoredRange =
    hasStoredValues &&
    storedRange.every(Number.isFinite) &&
    storedRange[0] >= 0 &&
    storedRange[1] >= storedRange[0] &&
    storedRange[1] <= 1;
  const range = hasStoredRange
    ? storedRange
    : targetAccuracyRangeForSlot({
        difficultyCode: pack?.difficultyCode,
        order,
        division: pack?.division,
      });
  if (!range) return null;
  return {
    min: range[0],
    max: range[1],
    label: `${formatAccuracyPercent(range[0])}~${formatAccuracyPercent(range[1])}%`,
    basisLabel: "목표 정답률 구간",
    rangeLabel: "",
    sourceDifficultyCode: "",
    evidenceKind: "TARGET_RANGE",
  };
}

const QUESTION_CATEGORY_LABELS = Object.freeze({
  "basic-general": "기초 일반",
  general: "일반",
  "upper-general": "상위 일반",
  "semi-killer": "준킬러",
  killer: "킬러",
});

function publicCategoryLabelForQuestion(question) {
  return QUESTION_CATEGORY_LABELS[question?.category] || "일반";
}

function publicQuestionsForAttempt(pack, attempt) {
  const answerByKey = new Map(
    (attempt?.answers || []).map(
      (answer) => [
        answer.questionKey,
        answer.value || "",
      ]
    )
  );
  const currentIndex = Math.max(
    0,
    Number(attempt?.currentQuestionIndex || 0)
  );
  return (pack?.questions || []).slice(currentIndex, currentIndex + 1).map(
    (question, index) => {
      const number = currentIndex + index + 1;
      const targetAccuracy = publicTargetAccuracyForQuestion(
        pack,
        question,
        number
      );
      return {
        number,
        questionKey: question.questionKey,
        sourceDifficultyCode:
          targetAccuracy?.sourceDifficultyCode || "",
        categoryLabel: publicCategoryLabelForQuestion(question),
        courseId: question.courseId,
        prompt: question.prompt,
        visualization: question.visualization || null,
        inputMode: question.inputMode,
        choices: (question.choices || []).map(
          (choice) => ({
            key: choice.key,
            text: choice.text,
          })
        ),
        points: Number(question.points),
        targetAccuracy,
        savedAnswer:
          answerByKey.get(
            question.questionKey
          ) || "",
      };
    }
  );
}

function formatTimeLimit(timeLimitMs) {
  const totalSeconds = Math.max(
    1,
    Math.round(Number(timeLimitMs) / 1000)
  );
  if (totalSeconds % 60 === 0) {
    return `${totalSeconds / 60}분`;
  }
  return `${Math.floor(totalSeconds / 60)}분 ${
    totalSeconds % 60
  }초`;
}

function questionDeadlineAt({
  startedAt,
  match,
}) {
  const regularDeadline = new Date(
    new Date(startedAt).getTime() +
      ARENA_ONE_ON_ONE_TIME_LIMIT_MS
  );
  const completionDeadline =
    match?.completionDeadlineAt
      ? new Date(
          match.completionDeadlineAt
        )
      : null;
  return completionDeadline &&
    completionDeadline <
      regularDeadline
    ? completionDeadline
    : regularDeadline;
}

function completedSolveTimeMs(
  attempt
) {
  return (attempt.questionTimings || []).reduce(
    (total, timing) =>
      total +
      Math.max(
        0,
        Number(
          timing.responseTimeMs
        ) || 0
      ),
    0
  );
}

async function loadMatch(matchId, session = null) {
  if (!mongoose.isValidObjectId(matchId)) {
    throw statusError(
      400,
      "경기 정보를 확인해주세요.",
      "INVALID_ARENA_MATCH_ID"
    );
  }
  const match = await queryWithSession(
    ArenaMatch.findById(matchId),
    session
  );
  if (!match) {
    throw statusError(
      404,
      "경기를 찾을 수 없습니다.",
      "ARENA_MATCH_NOT_FOUND"
    );
  }
  return match;
}

async function loadPackWithQuestions(
  problemPackId,
  session = null
) {
  const pack = await queryWithSession(
    ArenaProblemPack.findById(
      problemPackId
    ).select("+questions +contentHash"),
    session
  ).lean();
  if (!pack) {
    throw statusError(
      409,
      "경기에 고정된 문제 팩을 찾을 수 없습니다.",
      "ARENA_PROBLEM_PACK_NOT_FOUND"
    );
  }
  assertArenaProblemPackIntegrity(pack);
  return pack;
}

async function prepareArenaMatch({
  matchId,
  userId,
  now = new Date(),
}) {
  const session = await mongoose.startSession();
  let preparedMatch = null;
  try {
    await session.withTransaction(async () => {
      const match = await loadMatch(
        matchId,
        session
      );
      assertMatchParticipant(match, userId);

      if (
        match.problemPackId &&
        match.problemPackVersion !==
          "PENDING_ASSIGNMENT"
      ) {
        preparedMatch = match;
        return;
      }
      if (match.status !== "MATCHED") {
        throw statusError(
          409,
          "현재 상태에서는 경기 문제를 준비할 수 없습니다.",
          "ARENA_MATCH_NOT_MATCHED"
        );
      }
      if (
        isSundayMatchRequestLocked(
          now,
          match.division
        )
      ) {
        throw statusError(
          423,
          match.matchType === "FRIENDLY"
            ? "GOAT Arena 친선 경기는 일요일 14시부터 새 경기 준비와 시작이 차단됩니다."
            : match.division === "MAIN"
              ? "Ranked는 일요일 14시부터 새 경기 준비와 시작이 차단됩니다."
              : "Unranked는 일요일 14시부터 새 경기 준비와 시작이 차단됩니다.",
          "SUNDAY_MATCH_START_LOCK"
        );
      }

      const packs = await queryWithSession(
        ArenaProblemPack.find({
          status: "SEALED",
          division: match.division,
          matchType: match.matchType,
          tierPairKey: match.tierPairKey,
          generationMode: "AUTO_ON_CHALLENGE",
          generatedForMatchKey: match.matchKey,
          timeLimitMs: ARENA_ONE_ON_ONE_TIME_LIMIT_MS,
          availableFrom: { $lte: now },
          $or: [
            { availableUntil: null },
            { availableUntil: { $gt: now } },
          ],
        })
          .select("+questions +contentHash")
          .sort({ availableFrom: 1, version: 1 }),
        session
      ).lean();
      const pack = chooseSealedProblemPack(
        packs,
        match._id
      );
      if (!pack) {
        throw statusError(
          409,
          "해당 티어 조합의 자동 검증 문제 유형이 아직 연결되지 않았습니다.",
          "NO_SEALED_ARENA_PROBLEM_PACK"
        );
      }
      assertArenaProblemPackIntegrity(pack);
      const answers = initialAnswersForPack(pack);
      await ArenaMatchAttempt.create(
        [
          {
            matchId: match._id,
            userId: match.challenger.userId,
            role: "CHALLENGER",
            problemPackId: pack._id,
            problemPackVersion: pack.version,
            variantCode: "COMMON",
            status: "READY",
            answers,
          },
          {
            matchId: match._id,
            userId: match.defender.userId,
            role: "DEFENDER",
            problemPackId: pack._id,
            problemPackVersion: pack.version,
            variantCode: "COMMON",
            status: "READY",
            answers,
          },
        ],
        { session, ordered: true }
      );
      match.problemPackId = pack._id;
      match.problemPackVersion = pack.version;
      match.scoringVersion = pack.scoringVersion;
      match.timeLimitMs = pack.timeLimitMs;
      match.status = "READY";
      match.readyAt = now;
      await match.save({ session });
      await ArenaOutboxEvent.create(
        [
          {
            eventType: "ArenaMatchReady",
            aggregateType: "ArenaMatch",
            aggregateId: match._id,
            idempotencyKey:
              `${match._id}:ArenaMatchReady`,
            payload: {
              problemPackVersion:
                pack.version,
              scoringVersion:
                pack.scoringVersion,
              timeLimitMs:
                pack.timeLimitMs,
            },
          },
        ],
        { session, ordered: true }
      );
      preparedMatch = match;
    });
    return {
      matchId: String(preparedMatch._id),
      status: preparedMatch.status,
    };
  } finally {
    await session.endSession();
  }
}

async function startArenaMatchAttempt({
  matchId,
  userId,
  requestId,
  now = new Date(),
}) {
  const operationId = normalizeOperationId(
    requestId,
    "경기 시작"
  );
  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(async () => {
      const match = await loadMatch(
        matchId,
        session
      );
      assertMatchParticipant(match, userId);
      const attempt = await queryWithSession(
        ArenaMatchAttempt.findOne({
          matchId: match._id,
          userId,
        }),
        session
      );
      if (!attempt) {
        throw statusError(
          409,
          "경기 문제 준비를 먼저 완료해주세요.",
          "ARENA_ATTEMPT_NOT_READY"
        );
      }
      if (
        ["IN_PROGRESS", "EVIDENCE_REQUIRED", "SUBMITTED"].includes(
          attempt.status
        )
      ) {
        result = {
          attempt,
          replayed: true,
        };
        return;
      }
      if (match.status === "HELD" && match.integrityStatus === "CLEAR") {
        const matchAttempts = await queryWithSession(
          ArenaMatchAttempt.find({ matchId: match._id }).select("status"),
          session
        );
        const anotherParticipantStarted = matchAttempts.some((entry) =>
          ["IN_PROGRESS", "EVIDENCE_REQUIRED", "SUBMITTED"].includes(entry.status)
        );
        match.status = anotherParticipantStarted ? "IN_PROGRESS" : "READY";
        await match.save({ session });
      }
      if (
        !["READY", "IN_PROGRESS"].includes(
          match.status
        )
      ) {
        throw statusError(
          409,
          "현재 경기 상태에서는 응시를 시작할 수 없습니다.",
          "ARENA_MATCH_NOT_READY"
        );
      }
      if (
        !match.startDeadlineAt ||
        new Date(match.startDeadlineAt) < now
      ) {
        throw statusError(
          410,
          "경기 요청 후 24시간의 시작 기한이 끝났습니다.",
          "ARENA_MATCH_START_DEADLINE_EXPIRED"
        );
      }
      if (
        isSundayMatchRequestLocked(
          now,
          match.division
        )
      ) {
        throw statusError(
          423,
          match.matchType === "FRIENDLY"
            ? "GOAT Arena 친선 경기는 일요일 14시부터 새 경기를 시작할 수 없습니다."
            : match.division === "MAIN"
              ? "Ranked는 일요일 14시부터 새 경기를 시작할 수 없습니다."
              : "Unranked는 일요일 14시부터 새 경기를 시작할 수 없습니다.",
          "SUNDAY_MATCH_START_LOCK"
        );
      }

      const startKey =
        `ARENA_START:${attempt._id}:${operationId}`;
      const solveStartedAt = new Date(
        now.getTime() +
          MATCH_START_INTRO_DELAY_MS
      );
      attempt.status = "IN_PROGRESS";
      attempt.startIdempotencyKey = startKey;
      attempt.startedAt = solveStartedAt;
      attempt.deadlineAt =
        questionDeadlineAt({
          startedAt:
            solveStartedAt,
          match,
        });
      attempt.lastHeartbeatAt = now;
      attempt.focusState = "FOCUSED";
      attempt.currentQuestionIndex = 0;
      attempt.questionTimings = [
        {
          questionKey: attempt.answers[0].questionKey,
          startedAt: solveStartedAt,
          completedAt: null,
          responseTimeMs: null,
        },
      ];
      await attempt.save({ session });

      if (match.status === "READY") {
        match.status = "IN_PROGRESS";
      }
      if (!match.startedAt) {
        match.startedAt = solveStartedAt;
      }
      await match.save({ session });
      await ArenaMatchAttemptEvent.create(
        [
          {
            attemptId: attempt._id,
            matchId: match._id,
            userId,
            idempotencyKey: startKey,
            eventType: "ATTEMPT_STARTED",
            serverAt: now,
          },
        ],
        { session, ordered: true }
      );
      await ArenaOutboxEvent.create(
        [
          {
            eventType: "ArenaAttemptStarted",
            aggregateType: "ArenaMatchAttempt",
            aggregateId: attempt._id,
            idempotencyKey:
              `${attempt._id}:ArenaAttemptStarted`,
            payload: {
              matchId: String(match._id),
              deadlineAt:
                attempt.deadlineAt,
            },
          },
        ],
        { session, ordered: true }
      );
      result = { attempt, replayed: false };
    });
    return {
      attemptId: String(result.attempt._id),
      status: result.attempt.status,
      deadlineAt:
        result.attempt.deadlineAt,
      replayed: result.replayed,
    };
  } finally {
    await session.endSession();
  }
}

function normalizeAnswerChanges(
  changes,
  allowedQuestionKeys
) {
  const allowed = new Set(
    allowedQuestionKeys
  );
  const source = Array.isArray(changes)
    ? changes.slice(
        -MAX_CHANGE_EVENTS_PER_REQUEST
      )
    : [];
  return source.map((change) => {
    const questionKey = String(
      change?.questionKey || ""
    ).trim();
    if (!allowed.has(questionKey)) {
      throw statusError(
        400,
        "저장할 문항 정보를 확인해주세요.",
        "INVALID_ARENA_QUESTION_KEY"
      );
    }
    return {
      questionKey,
      value: cleanAnswer(change?.value),
      clientAt: safeClientDate(
        change?.clientAt
      ),
    };
  });
}

function resolveTimeoutReplayReconciliation({
  attempt,
  pack,
  replay,
  operationId,
  submissionMode,
  value,
  now,
}) {
  const metadata =
    replay?.metadata || {};
  const hasLatestAnswer =
    value !== undefined &&
    value !== null;
  if (
    submissionMode !== "TIME_LIMIT" ||
    metadata.submissionMode !==
      "TIME_LIMIT" ||
    metadata.latestValueProvided ===
      true ||
    !hasLatestAnswer
  ) {
    return null;
  }

  let expectedOperationId;
  try {
    expectedOperationId =
      timeoutAdvanceOperationId({
        attemptId: attempt?._id,
        deadlineAt:
          metadata.questionDeadlineAt,
      });
  } catch (_error) {
    return null;
  }
  if (
    operationId !==
      expectedOperationId ||
    metadata.timeoutOperationId !==
      expectedOperationId
  ) {
    return null;
  }

  const eventAt = new Date(
    replay.serverAt
  ).getTime();
  const requestAt = new Date(
    now
  ).getTime();
  // A client transaction can start first, lose the Mongo write race, and then
  // be retried after the scheduler event commits. Its captured server `now`
  // is then slightly earlier than replay.serverAt, so compare the bounded
  // distance rather than requiring one commit order.
  const distanceFromFallback =
    Math.abs(requestAt - eventAt);
  if (
    !Number.isFinite(eventAt) ||
    !Number.isFinite(requestAt) ||
    distanceFromFallback >
      TIMEOUT_ADVANCE_RECONCILIATION_MS
  ) {
    return null;
  }

  const completedQuestionNumber =
    Number(
      metadata.completedQuestionNumber
    );
  const questionCount = Number(
    pack?.questions?.length || 0
  );
  const completedFinalQuestion =
    completedQuestionNumber ===
    questionCount;
  const attemptStillAtReplayBoundary =
    completedFinalQuestion
      ? attempt?.status ===
          "EVIDENCE_REQUIRED" &&
        Number(
          attempt.currentQuestionIndex
        ) === questionCount &&
        !attempt.evidenceSubmittedAt
      : attempt?.status ===
          "IN_PROGRESS" &&
        Number(
          attempt.currentQuestionIndex
        ) === completedQuestionNumber;
  if (
    !completedQuestionNumber ||
    !questionCount ||
    !attemptStillAtReplayBoundary
  ) {
    return null;
  }

  const questionKey = String(
    replay.answerChanges?.[0]
      ?.questionKey || ""
  ).trim();
  const question =
    pack.questions[
      completedQuestionNumber - 1
    ];
  if (
    !questionKey ||
    question?.questionKey !==
      questionKey
  ) {
    return null;
  }

  const savedAnswer =
    attempt.answers.find(
      (answer) =>
        answer.questionKey ===
        questionKey
    )?.value || "";
  const {
    finalAnswer,
    shouldApplyAnswer,
  } = resolveAdvanceAnswer({
    submissionMode,
    value,
    savedAnswer,
  });
  if (finalAnswer) {
    assertNaturalNumberMaxThreeDigits(
      finalAnswer
    );
  }
  const change =
    normalizeAnswerChanges(
      [
        {
          questionKey,
          value: finalAnswer,
          clientAt: now,
        },
      ],
      [questionKey]
    );
  return {
    change,
    finalAnswer,
    shouldApplyAnswer,
  };
}

function applyAnswerChanges({
  attempt,
  changes,
  now,
}) {
  const answerByKey = new Map(
    attempt.answers.map((answer) => [
      answer.questionKey,
      answer,
    ])
  );
  changes.forEach((change) => {
    const answer = answerByKey.get(
      change.questionKey
    );
    answer.value = change.value;
    answer.revision =
      Number(answer.revision || 0) + 1;
    answer.lastChangedAt = now;
  });
  attempt.markModified("answers");
  attempt.answerRevision =
    Number(attempt.answerRevision || 0) +
    changes.length;
  attempt.lastSavedAt = now;
}

async function loadWritableAttempt({
  matchId,
  userId,
  session,
}) {
  const match = await loadMatch(
    matchId,
    session
  );
  assertMatchParticipant(match, userId);
  const attempt = await queryWithSession(
    ArenaMatchAttempt.findOne({
      matchId: match._id,
      userId,
    }),
    session
  );
  if (!attempt) {
    throw statusError(
      409,
      "경기 응시 정보를 찾을 수 없습니다.",
      "ARENA_ATTEMPT_NOT_FOUND"
    );
  }
  const pack = await loadPackWithQuestions(
    attempt.problemPackId,
    session
  );
  return { match, attempt, pack };
}

function assertAttemptWritable(
  attempt,
  now,
  { allowExpired = false } = {}
) {
  if (isSundayDivisionLocked(now)) {
    throw statusError(
      423,
      "일요일 15시부터 월요일 0시까지 공식 경기가 잠깁니다.",
      "SUNDAY_DIVISION_LOCK"
    );
  }
  if (attempt.status !== "IN_PROGRESS") {
    throw statusError(
      409,
      "진행 중인 경기에서만 답안을 저장할 수 있습니다.",
      "ARENA_ATTEMPT_NOT_IN_PROGRESS"
    );
  }
  if (
    (
      !allowExpired &&
      (
        !attempt.deadlineAt ||
        new Date(
          attempt.deadlineAt
        ) <= now
      )
    )
  ) {
    throw statusError(
      410,
      "제한 시간이 끝나 답안을 더 변경할 수 없습니다.",
      "ARENA_ATTEMPT_TIME_LIMIT"
    );
  }
}

async function saveArenaMatchAnswers({
  matchId,
  userId,
  requestId,
  changes,
  now = new Date(),
}) {
  const operationId = normalizeOperationId(
    requestId,
    "답안 저장"
  );
  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(async () => {
      const { match, attempt, pack } =
        await loadWritableAttempt({
          matchId,
          userId,
          session,
        });
      const eventKey =
        `ARENA_SAVE:${operationId}`;
      const replay = await queryWithSession(
        ArenaMatchAttemptEvent.findOne({
          attemptId: attempt._id,
          idempotencyKey: eventKey,
        }),
        session
      ).lean();
      if (replay) {
        result = {
          attempt,
          replayed: true,
        };
        return;
      }
      assertAttemptWritable(attempt, now);
      const normalized = normalizeAnswerChanges(
        changes,
        [pack.questions[attempt.currentQuestionIndex]?.questionKey].filter(Boolean)
      );
      if (!normalized.length) {
        result = {
          attempt,
          replayed: false,
        };
        return;
      }
      applyAnswerChanges({
        attempt,
        changes: normalized,
        now,
      });
      await attempt.save({ session });
      await ArenaMatchAttemptEvent.create(
        [
          {
            attemptId: attempt._id,
            matchId: match._id,
            userId,
            idempotencyKey: eventKey,
            eventType: "ANSWERS_SAVED",
            answerChanges: normalized,
            serverAt: now,
          },
        ],
        { session, ordered: true }
      );
      result = {
        attempt,
        replayed: false,
      };
    });
    return {
      savedAt:
        result.attempt.lastSavedAt || now,
      answerRevision:
        result.attempt.answerRevision,
      replayed: result.replayed,
    };
  } finally {
    await session.endSession();
  }
}

async function advanceArenaMatchQuestion({
  matchId,
  userId,
  requestId,
  value,
  submissionMode = "MANUAL",
  now = new Date(),
}) {
  const operationId = normalizeOperationId(
    requestId,
    "다음 문항"
  );
  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(async () => {
      const { match, attempt, pack } = await loadWritableAttempt({
        matchId,
        userId,
        session,
      });
      const eventKey = `ARENA_ADVANCE:${attempt._id}:${operationId}`;
      const replay = await queryWithSession(
        ArenaMatchAttemptEvent.findOne({
          attemptId: attempt._id,
          idempotencyKey: eventKey,
        }),
        session
      );
      if (replay) {
        const reconciliation =
          resolveTimeoutReplayReconciliation({
            attempt,
            pack,
            replay,
            operationId,
            submissionMode,
            value,
            now,
          });
        if (reconciliation) {
          if (
            reconciliation.shouldApplyAnswer
          ) {
            applyAnswerChanges({
              attempt,
              changes:
                reconciliation.change,
              now,
            });
            await attempt.save({
              session,
            });
          }
          replay.answerChanges =
            reconciliation.change;
          replay.metadata = {
            ...(replay.metadata || {}),
            latestValueProvided: true,
            latestValueReconciled: true,
            latestValueReconciledAt:
              now,
          };
          replay.markModified(
            "answerChanges"
          );
          replay.markModified("metadata");
          await replay.save({ session });
        }
        result = {
          finalQuestion:
            Number(replay.metadata?.completedQuestionNumber) ===
            pack.questions.length,
          currentQuestionIndex: Number(attempt.currentQuestionIndex || 0),
          evidenceDeadlineAt:
            attempt.evidenceDeadlineAt ||
            null,
          replayed: true,
          latestValueReconciled:
            Boolean(reconciliation),
        };
        return;
      }
      const timedOut =
        submissionMode ===
        "TIME_LIMIT";
      assertAttemptWritable(
        attempt,
        now,
        { allowExpired: timedOut }
      );
      if (
        timedOut &&
        (
          !attempt.deadlineAt ||
          new Date(
            attempt.deadlineAt
          ) > now
        )
      ) {
        throw statusError(
          409,
          "현재 문항의 제한 시간이 아직 남아 있습니다.",
          "ARENA_QUESTION_TIME_REMAINS"
        );
      }
      const completedQuestionDeadlineAt =
        attempt.deadlineAt
          ? new Date(
              attempt.deadlineAt
            )
          : null;
      if (
        timedOut &&
        operationId !==
          timeoutAdvanceOperationId({
            attemptId: attempt._id,
            deadlineAt:
              completedQuestionDeadlineAt,
          })
      ) {
        throw statusError(
          409,
          "제한 시간 제출 번호가 현재 문항과 일치하지 않습니다.",
          "ARENA_TIMEOUT_OPERATION_MISMATCH"
        );
      }

      const currentIndex = Number(attempt.currentQuestionIndex || 0);
      const question = pack.questions[currentIndex];
      if (!question) {
        throw statusError(
          409,
          "현재 풀 문항을 확인할 수 없습니다.",
          "ARENA_CURRENT_QUESTION_NOT_FOUND"
        );
      }
      const savedAnswer =
        attempt.answers.find(
          (answer) =>
            answer.questionKey ===
            question.questionKey
        )?.value || "";
      const {
        finalAnswer,
        shouldApplyAnswer,
      } = resolveAdvanceAnswer({
        submissionMode,
        value,
        savedAnswer,
      });
      const latestValueProvided =
        value !== undefined &&
        value !== null;
      if (finalAnswer) {
        assertNaturalNumberMaxThreeDigits(finalAnswer);
      }
      const change = normalizeAnswerChanges(
        [
          {
            questionKey: question.questionKey,
            value: finalAnswer,
            clientAt: now,
          },
        ],
        [question.questionKey]
      );
      if (shouldApplyAnswer) {
        applyAnswerChanges({
          attempt,
          changes: change,
          now,
        });
      }

      const timing = (attempt.questionTimings || []).find(
        (entry) => entry.questionKey === question.questionKey
      );
      if (timing && !timing.completedAt) {
        timing.completedAt = timedOut
          ? new Date(
              attempt.deadlineAt
            )
          : now;
        timing.responseTimeMs = Math.max(
          0,
          new Date(
            timing.completedAt
          ).getTime() -
            new Date(
              timing.startedAt
            ).getTime()
        );
      }

      const finalQuestion = currentIndex === pack.questions.length - 1;
      if (finalQuestion) {
        const submissionKey = `ARENA_SUBMIT:${attempt._id}:${operationId}`;
        attempt.status = "EVIDENCE_REQUIRED";
        attempt.currentQuestionIndex = pack.questions.length;
        attempt.submissionIdempotencyKey = submissionKey;
        attempt.submittedAt = now;
        attempt.submissionMode = timedOut
          ? "TIME_LIMIT"
          : "MANUAL";
        attempt.activeSolveTimeMs =
          completedSolveTimeMs(
            attempt
          );
        attempt.evidenceDeadlineAt = new Date(
          now.getTime() + ARENA_ONE_ON_ONE_EVIDENCE_LIMIT_MS
        );
        match.set(
          attempt.role === "CHALLENGER"
            ? "challenger.submittedAt"
            : "defender.submittedAt",
          now
        );
      } else {
        const nextQuestionStartedAt =
          new Date(
            now.getTime() +
              QUESTION_INTRO_DELAY_MS
          );
        attempt.currentQuestionIndex = currentIndex + 1;
        attempt.deadlineAt =
          questionDeadlineAt({
            startedAt:
              nextQuestionStartedAt,
            match,
          });
        attempt.questionTimings.push({
          questionKey: pack.questions[currentIndex + 1].questionKey,
          startedAt:
            nextQuestionStartedAt,
          completedAt: null,
          responseTimeMs: null,
        });
      }
      await attempt.save({ session });
      await match.save({ session });
      await ArenaMatchAttemptEvent.create(
        [
          {
            attemptId: attempt._id,
            matchId: match._id,
            userId,
            idempotencyKey: eventKey,
            eventType: "QUESTION_ADVANCED",
            answerChanges: change,
            serverAt: now,
            metadata: {
              completedQuestionNumber: currentIndex + 1,
              finalQuestion,
              submissionMode:
                timedOut
                  ? "TIME_LIMIT"
                  : "MANUAL",
              latestValueProvided,
              questionDeadlineAt:
                completedQuestionDeadlineAt,
              timeoutOperationId:
                timedOut
                  ? operationId
                  : null,
              evidenceDeadlineAt: attempt.evidenceDeadlineAt || null,
            },
          },
        ],
        { session, ordered: true }
      );
      result = {
        finalQuestion,
        currentQuestionIndex: Number(attempt.currentQuestionIndex),
        evidenceDeadlineAt: attempt.evidenceDeadlineAt || null,
        replayed: false,
      };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

function normalizeSignals(
  signals,
  allowedQuestionKeys = []
) {
  const allowed = new Set([
    "HEARTBEAT",
    "FOCUS_GAINED",
    "FOCUS_LOST",
    "QUESTION_FOCUSED",
    "PAGE_EXITED",
  ]);
  const allowedQuestions = new Set(
    allowedQuestionKeys
  );
  return (
    Array.isArray(signals)
      ? signals.slice(
          -MAX_SIGNAL_EVENTS_PER_REQUEST
        )
      : []
  ).map((signal) => {
    const type = String(
      signal?.type || ""
    ).toUpperCase();
    if (!allowed.has(type)) {
      throw statusError(
        400,
        "경기 활동 기록을 확인해주세요.",
        "INVALID_ARENA_ACTIVITY_SIGNAL"
      );
    }
    const questionKey = String(
      signal?.questionKey || ""
    )
      .trim()
      .slice(0, 40);
    if (
      [
        "QUESTION_FOCUSED",
        "PAGE_EXITED",
      ].includes(type) &&
      !allowedQuestions.has(questionKey)
    ) {
      throw statusError(
        400,
        "현재 문항 활동 기록을 확인해주세요.",
        "INVALID_ARENA_ACTIVITY_QUESTION"
      );
    }
    return {
      type,
      questionKey,
      clientAt: safeClientDate(
        signal?.clientAt
      ),
    };
  });
}

async function recordArenaMatchActivity({
  matchId,
  userId,
  requestId,
  signals,
  now = new Date(),
}) {
  const operationId = normalizeOperationId(
    requestId,
    "활동 기록"
  );
  const session = await mongoose.startSession();
  if (!Array.isArray(signals) || !signals.length) {
    await session.endSession();
    return { recorded: 0, replayed: false };
  }
  let replayed = false;
  let recordedCount = 0;
  try {
    await session.withTransaction(async () => {
      const { match, attempt, pack } =
        await loadWritableAttempt({
          matchId,
          userId,
          session,
        });
      assertAttemptWritable(attempt, now);
      const normalized = normalizeSignals(
        signals,
        pack.questions.map(
          (question) =>
            question.questionKey
        )
      );
      recordedCount = normalized.length;
      const eventKey =
        `ARENA_ACTIVITY:${operationId}`;
      const replay = await queryWithSession(
        ArenaMatchAttemptEvent.findOne({
          attemptId: attempt._id,
          idempotencyKey: eventKey,
        }),
        session
      ).lean();
      if (replay) {
        replayed = true;
        return;
      }
      attempt.lastHeartbeatAt = now;
      const lastFocusSignal = [...normalized]
        .reverse()
        .find((signal) =>
          [
            "FOCUS_GAINED",
            "FOCUS_LOST",
          ].includes(signal.type)
        );
      if (lastFocusSignal) {
        attempt.focusState =
          lastFocusSignal.type ===
          "FOCUS_GAINED"
            ? "FOCUSED"
            : "BLURRED";
      }
      await attempt.save({ session });
      await ArenaMatchAttemptEvent.create(
        [
          {
            attemptId: attempt._id,
            matchId: match._id,
            userId,
            idempotencyKey: eventKey,
            eventType: "ACTIVITY_RECORDED",
            signals: normalized,
            serverAt: now,
          },
        ],
        { session, ordered: true }
      );
    });
    return {
      recorded: replayed
        ? 0
        : recordedCount,
      replayed,
    };
  } finally {
    await session.endSession();
  }
}

async function submitArenaMatchAttempt({
  matchId,
  userId,
  requestId,
  changes = [],
  submissionMode = "MANUAL",
  now = new Date(),
}) {
  const operationId = normalizeOperationId(
    requestId,
    "답안 제출"
  );
  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(async () => {
      const { match, attempt, pack } =
        await loadWritableAttempt({
          matchId,
          userId,
          session,
        });
      if (["EVIDENCE_REQUIRED", "SUBMITTED"].includes(attempt.status)) {
        result = {
          attempt,
          match,
          replayed: true,
        };
        return;
      }
      if (attempt.status !== "IN_PROGRESS") {
        throw statusError(
          409,
          "시작한 경기만 제출할 수 있습니다.",
          "ARENA_ATTEMPT_NOT_IN_PROGRESS"
        );
      }
      if (isSundayDivisionLocked(now)) {
        throw statusError(
          423,
          "일요일 15시부터 월요일 0시까지 공식 경기가 잠깁니다.",
          "SUNDAY_DIVISION_LOCK"
        );
      }
      const currentQuestionIndex =
        Number(
          attempt.currentQuestionIndex ||
            0
        );
      if (
        currentQuestionIndex !==
        pack.questions.length - 1
      ) {
        throw statusError(
          409,
          "현재 문항을 확정한 뒤 순서대로 다음 문제로 이동해주세요.",
          "ARENA_QUESTION_SEQUENCE_REQUIRED"
        );
      }
      const deadlineReached =
        !attempt.deadlineAt ||
        new Date(attempt.deadlineAt) <= now;
      const effectiveMode =
        deadlineReached ||
        submissionMode === "TIME_LIMIT"
          ? "TIME_LIMIT"
          : "MANUAL";
      const normalized = deadlineReached
        ? []
        : normalizeAnswerChanges(
            changes,
            [
              pack.questions[
                currentQuestionIndex
              ]?.questionKey,
            ].filter(Boolean)
          );
      if (normalized.length) {
        applyAnswerChanges({
          attempt,
          changes: normalized,
          now,
        });
      }
      const submissionKey =
        `ARENA_SUBMIT:${attempt._id}:${operationId}`;
      attempt.status = "EVIDENCE_REQUIRED";
      attempt.submissionIdempotencyKey =
        submissionKey;
      attempt.submittedAt = now;
      attempt.submissionMode = effectiveMode;
      attempt.lastSavedAt = now;
      attempt.currentQuestionIndex = 5;
      const currentTiming =
        (attempt.questionTimings || []).find(
          (timing) =>
            timing.questionKey ===
            pack.questions[
              currentQuestionIndex
            ]?.questionKey
        );
      if (
        currentTiming &&
        !currentTiming.completedAt
      ) {
        currentTiming.completedAt =
          deadlineReached
            ? new Date(
                attempt.deadlineAt
              )
            : now;
        currentTiming.responseTimeMs =
          Math.max(
            0,
            new Date(
              currentTiming.completedAt
            ).getTime() -
              new Date(
                currentTiming.startedAt
              ).getTime()
          );
      }
      attempt.activeSolveTimeMs =
        completedSolveTimeMs(
          attempt
        );
      attempt.evidenceDeadlineAt = new Date(
        now.getTime() + ARENA_ONE_ON_ONE_EVIDENCE_LIMIT_MS
      );
      await attempt.save({ session });

      const participantPath =
        attempt.role === "CHALLENGER"
          ? "challenger.submittedAt"
          : "defender.submittedAt";
      match.set(participantPath, now);
      await match.save({ session });

      await ArenaMatchAttemptEvent.create(
        [
          {
            attemptId: attempt._id,
            matchId: match._id,
            userId,
            idempotencyKey: submissionKey,
            eventType: "ATTEMPT_SUBMITTED",
            answerChanges: normalized,
            serverAt: now,
            metadata: {
              submissionMode:
                effectiveMode,
              answerRevision:
                attempt.answerRevision,
            },
          },
        ],
        { session, ordered: true }
      );
      const outboxEvents = [
        {
          eventType:
            "ArenaAttemptSubmitted",
          aggregateType:
            "ArenaMatchAttempt",
          aggregateId: attempt._id,
          idempotencyKey:
            `${attempt._id}:ArenaAttemptSubmitted`,
          payload: {
            matchId: String(match._id),
            submissionMode:
              effectiveMode,
          },
        },
      ];
      await ArenaOutboxEvent.create(
        outboxEvents,
        { session, ordered: true }
      );
      result = {
        attempt,
        match,
        replayed: false,
      };
    });
    return {
      attemptId: String(result.attempt._id),
      status: result.attempt.status,
      matchStatus: result.match.status,
      replayed: result.replayed,
    };
  } finally {
    await session.endSession();
  }
}

async function getArenaMatchPageData({
  matchId,
  userId,
  now = new Date(),
}) {
  let autoAdvancedQuestionNumber = 0;
  let match = await loadMatch(matchId);
  const role = assertMatchParticipant(
    match,
    userId
  );
  let attempt =
    await ArenaMatchAttempt.findOne({
      matchId: match._id,
      userId,
    }).lean();
  const divisionLocked =
    isSundayDivisionLocked(now);
  const matchRequestLocked =
    isSundayMatchRequestLocked(
      now,
      match.division
    );
  if (
    !divisionLocked &&
    attempt?.status === "IN_PROGRESS" &&
    attempt.deadlineAt &&
    new Date(attempt.deadlineAt) <= now
  ) {
    await advanceArenaMatchQuestion({
      matchId: match._id,
      userId,
      requestId:
        timeoutAdvanceOperationId({
          attemptId: attempt._id,
          deadlineAt:
            attempt.deadlineAt,
        }),
      submissionMode: "TIME_LIMIT",
      now,
    });
    [match, attempt] = await Promise.all([
      ArenaMatch.findById(match._id),
      ArenaMatchAttempt.findOne({
        matchId: match._id,
        userId,
      }).lean(),
    ]);
    if (
      attempt?.status ===
      "IN_PROGRESS"
    ) {
      autoAdvancedQuestionNumber =
        Number(
          attempt.currentQuestionIndex
        ) + 1;
    }
  }

  const opponentUserId =
    role === "CHALLENGER"
      ? match.defender.userId
      : match.challenger.userId;
  const opponent = await User.findById(
    opponentUserId
  )
    .select("username name")
    .lean();
  const pack = match.problemPackId
    ? await loadPackWithQuestions(
        match.problemPackId
      )
    : null;
  const showQuestions =
    !divisionLocked &&
    attempt?.status === "IN_PROGRESS";
  const remainingMs = showQuestions
    ? Math.max(
        0,
        new Date(attempt.deadlineAt).getTime() -
          now.getTime()
      )
    : 0;
  const roleResultKey = role === "CHALLENGER" ? "challenger" : "defender";
  const opponentResultKey = role === "CHALLENGER" ? "defender" : "challenger";
  const resultSnapshot = match.resultSnapshot || null;
  const isFriendlyMatch = match.matchType === "FRIENDLY";
  const revengeRight = match.status === "SETTLED" && match.matchType === "NORMAL"
    ? await ArenaRevengeRight.findOne({
        sourceMatchId: match._id,
        eligibleUserId: userId,
      }).lean()
    : null;
  const integrityWatermark = showQuestions
    ? buildArenaMatchIntegrityWatermark({
        matchId: match._id,
        userId,
        attemptId: attempt?._id,
        matchType: match.matchType,
        role,
      })
    : null;
  return {
    id: String(match._id),
    matchStatus: match.status,
    matchStatusLabel:
      MATCH_STATUS_LABELS[match.status] ||
      "경기 처리 중",
    role,
    roleLabel:
      isFriendlyMatch
        ? (role === "CHALLENGER" ? "초대한 사용자" : "초대 수락 사용자")
        : (role === "CHALLENGER" ? "공격자" : "방어자"),
    opponentName:
      String(opponent?.name || opponent?.username || "닉네임 확인 중"),
    matchType: match.matchType,
    matchTitle:
      match.matchType === "REVENGE"
        ? "복수전"
        : match.matchType === "FRIENDLY"
          ? "친선 경기"
          : "일반 쟁탈전",
    divisionLabel:
      isFriendlyMatch
        ? "Ranked"
        : match.division === "MAIN"
          ? "Ranked"
          : "Unranked",
    division: match.division,
    preStartContract:
      buildArenaMatchPreStartContract(
        match,
        role
      ),
    canUseDefenseScheduleProtection:
      match.division === "MAIN" &&
      match.matchType === "NORMAL" &&
      match.matchOrigin === "MAIN_UPWARD_AUTO_MATCH" &&
      role === "DEFENDER" &&
      match.status === "READY" &&
      attempt?.status === "READY" &&
      !attempt?.startedAt &&
      new Date(now).getTime() -
        new Date(match.readyAt || match.createdAt).getTime() <=
        3 * 60 * 60 * 1000,
    problemPack: pack
      ? {
          version: pack.version,
          questionCount:
            pack.questionCount,
          totalPoints:
            pack.totalPoints,
          timeLimitMs:
            pack.timeLimitMs,
          timeLimitLabel:
            formatTimeLimit(
              pack.timeLimitMs
            ),
          curriculumCoverage:
            pack.curriculumCoverage,
        }
      : null,
    attempt: attempt
      ? {
          id: String(attempt._id),
          status: attempt.status,
          startedAt: attempt.startedAt,
          deadlineAt: attempt.deadlineAt,
          submittedAt:
            attempt.submittedAt,
          currentQuestionIndex:
            attempt.currentQuestionIndex,
          timeoutOperationId:
            attempt.status ===
              "IN_PROGRESS" &&
            attempt.deadlineAt
              ? timeoutAdvanceOperationId({
                  attemptId:
                    attempt._id,
                  deadlineAt:
                    attempt.deadlineAt,
                })
              : null,
          evidenceDeadlineAt:
            attempt.evidenceDeadlineAt,
          evidenceSubmittedAt:
            attempt.evidenceSubmittedAt,
          submissionMode:
            attempt.submissionMode,
          answerRevision:
            attempt.answerRevision,
        }
      : null,
    questions: showQuestions
      ? publicQuestionsForAttempt(
          pack,
          attempt
        )
      : [],
    integrityWatermark,
    serverNow: now.toISOString(),
    remainingMs,
    autoAdvancedQuestionNumber,
    canPrepare:
      match.status === "MATCHED" &&
      !match.problemPackId &&
      !matchRequestLocked,
    canStart:
      attempt?.status === "READY" &&
      (
        ["READY", "IN_PROGRESS"].includes(match.status) ||
        (match.status === "HELD" && match.integrityStatus === "CLEAR")
      ) &&
      !matchRequestLocked,
    inProgress: showQuestions,
    submitted:
      attempt?.status === "SUBMITTED",
    evidenceRequired:
      attempt?.status === "EVIDENCE_REQUIRED",
    matchRequestLocked,
    divisionLocked,
    settled: match.status === "SETTLED",
    held: match.status === "HELD",
    didWin:
      match.status === "SETTLED" &&
      match.winnerRole === role,
    winnerRole: match.winnerRole || null,
    result: resultSnapshot
      ? {
          myScore: resultSnapshot[roleResultKey] || null,
          opponentScore: resultSnapshot[opponentResultKey] || null,
          tieBreakStep: resultSnapshot.tieBreakStep || "",
          tupleAction:
            resultSnapshot.settlementSummary?.tupleAction || "KEEP",
          stakeOutcome:
            resultSnapshot.settlementSummary?.challengerStakeOutcome || "",
        }
      : null,
    revengeRight: revengeRight
      ? {
          id: String(revengeRight._id),
          // 결과 화면의 복수전 오버레이가 Unranked 페이백 점수와
          // Ranked 학습일수를 정확히 구분하도록 원경기 Division을 함께 전달한다.
          division: match.division,
          status: revengeRight.status,
          canClaim: revengeRight.status === "AVAILABLE",
          revengeMatchId: revengeRight.revengeMatchId
            ? String(revengeRight.revengeMatchId)
            : null,
          stakeDays: Number(revengeRight.revengeStakeDays),
          feeDays: Number(revengeRight.feeDays),
        }
      : null,
  };
}

async function submitExpiredArenaAttempts({
  now = new Date(),
  limit = 100,
} = {}) {
  if (isSundayDivisionLocked(now)) {
    return {
      scanned: 0,
      submitted: 0,
      divisionLocked: true,
    };
  }
  const attempts =
    await ArenaMatchAttempt.find({
      status: "IN_PROGRESS",
      deadlineAt: { $lte: now },
    })
      .select("_id matchId userId deadlineAt")
      .limit(Math.max(1, Math.min(500, limit)))
      .lean();
  let submitted = 0;
  for (const attempt of attempts) {
    try {
      await advanceArenaMatchQuestion({
        matchId: attempt.matchId,
        userId: attempt.userId,
        requestId:
          timeoutAdvanceOperationId({
            attemptId: attempt._id,
            deadlineAt:
              attempt.deadlineAt,
          }),
        submissionMode: "TIME_LIMIT",
        now,
      });
      submitted += 1;
    } catch (error) {
      if (
        ![
          "ARENA_ATTEMPT_NOT_IN_PROGRESS",
        ].includes(error.code)
      ) {
        console.error(
          "Arena 제한 시간 제출 실패:",
          error
        );
      }
    }
  }
  return { scanned: attempts.length, submitted };
}

function startArenaMatchAttemptScheduler() {
  if (attemptScheduleTimer) {
    return attemptScheduleTimer;
  }
  attemptScheduleTimer = setInterval(
    async () => {
      if (attemptScheduleRunning) return;
      attemptScheduleRunning = true;
      try {
        await withSchedulerLease(
          { name: "ARENA_MATCH_TIMERS", leaseMs: 2 * 60 * 1000 },
          () => Promise.all([
            submitExpiredArenaAttempts(),
            holdExpiredEvidence(),
            holdExpiredMatchStarts(),
            holdSundayCutoffMatches(),
            settleExpiredSubRevengeMatches(),
            settleExpiredMainRevengeMatches(),
          ])
        );
      } finally {
        attemptScheduleRunning = false;
      }
    },
    ATTEMPT_SCHEDULER_INTERVAL_MS
  );
  attemptScheduleTimer.unref?.();
  return attemptScheduleTimer;
}

module.exports = {
  ATTEMPT_SCHEDULER_INTERVAL_MS,
  MATCH_START_INTRO_DELAY_MS,
  QUESTION_INTRO_DELAY_MS,
  TIMEOUT_ADVANCE_RECONCILIATION_MS,
  advanceArenaMatchQuestion,
  applyAnswerChanges,
  chooseSealedProblemPack,
  formatTimeLimit,
  completedSolveTimeMs,
  questionDeadlineAt,
  getArenaMatchPageData,
  initialAnswersForPack,
  normalizeAnswerChanges,
  normalizeOperationId,
  normalizeSignals,
  participantRole,
  prepareArenaMatch,
  publicCategoryLabelForQuestion,
  publicQuestionsForAttempt,
  publicSourceAccuracyForQuestion,
  resolveAdvanceAnswer,
  resolveTimeoutReplayReconciliation,
  recordArenaMatchActivity,
  saveArenaMatchAnswers,
  startArenaMatchAttempt,
  startArenaMatchAttemptScheduler,
  submitArenaMatchAttempt,
  submitExpiredArenaAttempts,
  timeoutAdvanceOperationId,
};
