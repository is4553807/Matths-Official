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

const MAX_CHANGE_EVENTS_PER_REQUEST = 200;
const MAX_SIGNAL_EVENTS_PER_REQUEST = 200;
const ATTEMPT_SCHEDULER_INTERVAL_MS = 10 * 1000;
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
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 200);
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
    (question, index) => ({
      number: currentIndex + index + 1,
      questionKey: question.questionKey,
      categoryLabel: "준킬러",
      courseId: question.courseId,
      prompt: question.prompt,
      inputMode: question.inputMode,
      choices: (question.choices || []).map(
        (choice) => ({
          key: choice.key,
          text: choice.text,
        })
      ),
      points: Number(question.points),
      savedAnswer:
        answerByKey.get(
          question.questionKey
        ) || "",
    })
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
          match.division === "MAIN"
            ? "Main Division은 일요일 14시 30분부터 새 경기 준비와 시작이 차단됩니다."
            : "Sub Division은 일요일 14시 30분부터 새 경기 준비와 시작이 차단됩니다.",
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
          match.division === "MAIN"
            ? "Main Division은 일요일 14시 30분부터 새 경기를 시작할 수 없습니다."
            : "Sub Division은 일요일 14시 30분부터 새 경기를 시작할 수 없습니다.",
          "SUNDAY_MATCH_START_LOCK"
        );
      }

      const startKey =
        `ARENA_START:${attempt._id}:${operationId}`;
      const solveStartedAt = new Date(
        now.getTime() + 2500
      );
      attempt.status = "IN_PROGRESS";
      attempt.startIdempotencyKey = startKey;
      attempt.startedAt = solveStartedAt;
      const regularAttemptDeadline = new Date(
        solveStartedAt.getTime() +
          Number(match.timeLimitMs)
      );
      const completionDeadline = match.completionDeadlineAt
        ? new Date(match.completionDeadlineAt)
        : null;
      attempt.deadlineAt = completionDeadline && completionDeadline < regularAttemptDeadline
        ? completionDeadline
        : regularAttemptDeadline;
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

function assertAttemptWritable(attempt, now) {
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
    !attempt.deadlineAt ||
    new Date(attempt.deadlineAt) <= now
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
      ).lean();
      if (replay) {
        result = {
          finalQuestion:
            Number(replay.metadata?.completedQuestionNumber) ===
            pack.questions.length,
          currentQuestionIndex: Number(attempt.currentQuestionIndex || 0),
          replayed: true,
        };
        return;
      }
      assertAttemptWritable(attempt, now);

      const currentIndex = Number(attempt.currentQuestionIndex || 0);
      const question = pack.questions[currentIndex];
      if (!question) {
        throw statusError(
          409,
          "현재 풀 문항을 확인할 수 없습니다.",
          "ARENA_CURRENT_QUESTION_NOT_FOUND"
        );
      }
      const change = normalizeAnswerChanges(
        [
          {
            questionKey: question.questionKey,
            value,
            clientAt: now,
          },
        ],
        [question.questionKey]
      );
      applyAnswerChanges({ attempt, changes: change, now });

      const timing = (attempt.questionTimings || []).find(
        (entry) => entry.questionKey === question.questionKey
      );
      if (timing && !timing.completedAt) {
        timing.completedAt = now;
        timing.responseTimeMs = Math.max(
          0,
          now.getTime() - new Date(timing.startedAt).getTime()
        );
      }

      const finalQuestion = currentIndex === pack.questions.length - 1;
      if (finalQuestion) {
        const submissionKey = `ARENA_SUBMIT:${attempt._id}:${operationId}`;
        attempt.status = "EVIDENCE_REQUIRED";
        attempt.currentQuestionIndex = pack.questions.length;
        attempt.submissionIdempotencyKey = submissionKey;
        attempt.submittedAt = now;
        attempt.submissionMode = "MANUAL";
        attempt.activeSolveTimeMs = Math.max(
          0,
          now.getTime() - new Date(attempt.startedAt).getTime()
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
        attempt.currentQuestionIndex = currentIndex + 1;
        attempt.questionTimings.push({
          questionKey: pack.questions[currentIndex + 1].questionKey,
          startedAt: now,
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
      type === "QUESTION_FOCUSED" &&
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
            pack.questions.map(
              (question) =>
                question.questionKey
            )
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
      attempt.activeSolveTimeMs = Math.max(
        0,
        Math.min(
          now.getTime(),
          new Date(attempt.deadlineAt).getTime()
        ) - new Date(attempt.startedAt).getTime()
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
    await submitArenaMatchAttempt({
      matchId: match._id,
      userId,
      requestId:
        `TIME_LIMIT:${attempt._id}:${new Date(
          attempt.deadlineAt
        ).getTime()}`,
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
  const revengeRight = match.status === "SETTLED" && match.matchType === "NORMAL"
    ? await ArenaRevengeRight.findOne({
        sourceMatchId: match._id,
        eligibleUserId: userId,
      }).lean()
    : null;
  return {
    id: String(match._id),
    matchStatus: match.status,
    matchStatusLabel:
      MATCH_STATUS_LABELS[match.status] ||
      "경기 처리 중",
    role,
    roleLabel:
      role === "CHALLENGER"
        ? "공격자"
        : "방어자",
    opponentName:
      String(opponent?.username || opponent?.name || "상대 사용자"),
    matchType: match.matchType,
    matchTitle: match.matchType === "REVENGE" ? "복수전" : "일반 쟁탈전",
    divisionLabel:
      match.division === "MAIN"
        ? "Main Division"
        : "Sub Division",
    division: match.division,
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
    serverNow: now.toISOString(),
    remainingMs,
    canPrepare:
      match.status === "MATCHED" &&
      !match.problemPackId &&
      !matchRequestLocked,
    canStart:
      attempt?.status === "READY" &&
      ["READY", "IN_PROGRESS"].includes(
        match.status
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
      await submitArenaMatchAttempt({
        matchId: attempt.matchId,
        userId: attempt.userId,
        requestId:
          `TIME_LIMIT:${attempt._id}:${new Date(
            attempt.deadlineAt
          ).getTime()}`,
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
        await Promise.all([
          submitExpiredArenaAttempts(),
          holdExpiredEvidence(),
          holdExpiredMatchStarts(),
          holdSundayCutoffMatches(),
          settleExpiredSubRevengeMatches(),
          settleExpiredMainRevengeMatches(),
        ]);
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
  advanceArenaMatchQuestion,
  applyAnswerChanges,
  chooseSealedProblemPack,
  formatTimeLimit,
  getArenaMatchPageData,
  initialAnswersForPack,
  normalizeAnswerChanges,
  normalizeOperationId,
  normalizeSignals,
  participantRole,
  prepareArenaMatch,
  publicQuestionsForAttempt,
  recordArenaMatchActivity,
  saveArenaMatchAnswers,
  startArenaMatchAttempt,
  startArenaMatchAttemptScheduler,
  submitArenaMatchAttempt,
  submitExpiredArenaAttempts,
};
