const {
  ArenaMatch,
  ArenaMatchAttempt,
} = require("../models/goatArenaModel");
const { User } = require("../models/matthsModel");

const ACTIVE_MATCH_STATUSES = ["MATCHED", "READY", "IN_PROGRESS"];
const ACTIVE_DEFENDER_ATTEMPT_STATUSES = [
  "READY",
  "IN_PROGRESS",
  "EVIDENCE_REQUIRED",
];
const LIVE_HEARTBEAT_WINDOW_MS = 45 * 1000;
const ADMIN_ACTIVE_MATCH_LIMIT = 300;

function id(value) {
  return String(value?._id || value || "");
}

function uniqueIds(values) {
  return [...new Set(values.map(id).filter(Boolean))];
}

function userSummary(user, fallbackId) {
  return {
    id: id(user?._id || fallbackId),
    nickname: String(user?.name || user?.username || "").trim(),
    realName: String(user?.realName || "").trim(),
    email: String(user?.email || "").trim(),
  };
}

function attemptSummary(attempt, now) {
  if (!attempt) {
    return {
      id: "",
      status: "NOT_PREPARED",
      statusLabel: "응시 준비 전",
      isLive: false,
      heartbeatAgeMs: null,
      currentQuestion: 0,
      answeredCount: 0,
      focusState: "UNKNOWN",
      startedAt: null,
      deadlineAt: null,
      evidenceDeadlineAt: null,
      lastHeartbeatAt: null,
      activeSolveTimeMs: null,
    };
  }

  const heartbeatAt = attempt.lastHeartbeatAt
    ? new Date(attempt.lastHeartbeatAt)
    : null;
  const heartbeatAgeMs = heartbeatAt
    ? Math.max(0, new Date(now).getTime() - heartbeatAt.getTime())
    : null;
  const status = String(attempt.status || "READY");
  const isLive =
    status === "IN_PROGRESS" &&
    heartbeatAgeMs !== null &&
    heartbeatAgeMs <= LIVE_HEARTBEAT_WINDOW_MS;

  return {
    id: id(attempt._id),
    status,
    statusLabel: ({
      READY: "시작 대기",
      IN_PROGRESS: isLive ? "현재 풀이 중" : "풀이 중 · 연결 확인",
      EVIDENCE_REQUIRED: "풀이 완료 · 증거 제출 대기",
      SUBMITTED: "제출 완료",
    })[status] || status,
    isLive,
    heartbeatAgeMs,
    currentQuestion:
      status === "READY"
        ? 0
        : Math.min(5, Math.max(1, Number(attempt.currentQuestionIndex || 0) + 1)),
    answeredCount: (attempt.answers || []).filter((answer) =>
      String(answer?.value || "").trim()
    ).length,
    focusState: String(attempt.focusState || "UNKNOWN"),
    startedAt: attempt.startedAt || null,
    deadlineAt: attempt.deadlineAt || null,
    evidenceDeadlineAt: attempt.evidenceDeadlineAt || null,
    lastHeartbeatAt: attempt.lastHeartbeatAt || null,
    activeSolveTimeMs:
      attempt.activeSolveTimeMs === null || attempt.activeSolveTimeMs === undefined
        ? null
        : Number(attempt.activeSolveTimeMs),
  };
}

function defenderStage(match, attempt) {
  if (!attempt) {
    return match.status === "MATCHED"
      ? { key: "PREPARING", label: "경기 준비 대기", priority: 2 }
      : { key: "WAITING", label: "방어자 응답 대기", priority: 2 };
  }
  if (attempt.status === "READY") {
    return { key: "WAITING", label: "방어자 응답 대기", priority: 2 };
  }
  if (attempt.status === "IN_PROGRESS") {
    return attempt.isLive
      ? { key: "LIVE", label: "방어자 현재 풀이 중", priority: 1 }
      : { key: "STALE", label: "방어자 풀이 중 · 연결 확인", priority: 3 };
  }
  return {
    key: "EVIDENCE",
    label: "방어자 풀이 완료 · 증거 제출 대기",
    priority: 4,
  };
}

function relevantDeadline(match, defenderAttempt) {
  if (!defenderAttempt || defenderAttempt.status === "READY") {
    return match.startDeadlineAt || null;
  }
  if (defenderAttempt.status === "IN_PROGRESS") {
    return defenderAttempt.deadlineAt || match.completionDeadlineAt || null;
  }
  if (defenderAttempt.status === "EVIDENCE_REQUIRED") {
    return defenderAttempt.evidenceDeadlineAt || match.completionDeadlineAt || null;
  }
  return null;
}

function buildAdminActiveArenaMatchesData({
  matches = [],
  attempts = [],
  users = [],
  now = new Date(),
  limit = ADMIN_ACTIVE_MATCH_LIMIT,
} = {}) {
  const usersById = new Map(users.map((user) => [id(user._id), user]));
  const attemptsByMatchAndRole = new Map();
  for (const attempt of attempts) {
    attemptsByMatchAndRole.set(
      `${id(attempt.matchId)}:${String(attempt.role || "")}`,
      attempt
    );
  }

  const activeMatches = matches
    .filter((match) => ACTIVE_MATCH_STATUSES.includes(String(match.status || "")))
    .map((match) => {
      const matchId = id(match._id);
      const rawChallengerAttempt = attemptsByMatchAndRole.get(
        `${matchId}:CHALLENGER`
      );
      const rawDefenderAttempt = attemptsByMatchAndRole.get(
        `${matchId}:DEFENDER`
      );
      if (
        rawDefenderAttempt &&
        !ACTIVE_DEFENDER_ATTEMPT_STATUSES.includes(rawDefenderAttempt.status)
      ) {
        return null;
      }
      const challengerAttempt = attemptSummary(rawChallengerAttempt, now);
      const defenderAttempt = attemptSummary(rawDefenderAttempt, now);
      const stage = defenderStage(match, rawDefenderAttempt ? defenderAttempt : null);
      const deadlineAt = relevantDeadline(match, rawDefenderAttempt);
      return {
        id: matchId,
        division: String(match.division || ""),
        matchType: String(match.matchType || ""),
        matchOrigin: String(match.matchOrigin || ""),
        status: String(match.status || ""),
        tierPairLabel: String(match.tierPairLabel || ""),
        stage,
        deadlineAt,
        deadlineOverdue:
          Boolean(deadlineAt) && new Date(deadlineAt).getTime() < new Date(now).getTime(),
        requestedAt: match.requestedAt || match.createdAt || null,
        readyAt: match.readyAt || null,
        startedAt: match.startedAt || null,
        updatedAt: match.updatedAt || null,
        challenger: userSummary(
          usersById.get(id(match.challenger?.userId)),
          match.challenger?.userId
        ),
        defender: userSummary(
          usersById.get(id(match.defender?.userId)),
          match.defender?.userId
        ),
        challengerAttempt,
        defenderAttempt,
      };
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        left.stage.priority - right.stage.priority ||
        new Date(right.updatedAt || 0).getTime() -
          new Date(left.updatedAt || 0).getTime()
    );

  const visibleMatches = activeMatches.slice(0, limit);
  return {
    generatedAt: new Date(now),
    refreshIntervalSeconds: 15,
    limit,
    truncated: activeMatches.length > visibleMatches.length,
    stats: {
      total: activeMatches.length,
      live: activeMatches.filter((match) => match.stage.key === "LIVE").length,
      waiting: activeMatches.filter((match) =>
        ["PREPARING", "WAITING"].includes(match.stage.key)
      ).length,
      stale: activeMatches.filter((match) => match.stage.key === "STALE").length,
      evidence: activeMatches.filter((match) => match.stage.key === "EVIDENCE").length,
    },
    matches: visibleMatches,
  };
}

async function getAdminActiveArenaMatchesData({ now = new Date() } = {}) {
  const matches = await ArenaMatch.find({
    status: { $in: ACTIVE_MATCH_STATUSES },
  })
    .sort({ updatedAt: -1 })
    .limit(ADMIN_ACTIVE_MATCH_LIMIT)
    .lean();
  const matchIds = matches.map((match) => match._id);
  const attempts = matchIds.length
    ? await ArenaMatchAttempt.find({ matchId: { $in: matchIds } })
        .select(
          "_id matchId userId role status answers startedAt deadlineAt evidenceDeadlineAt lastHeartbeatAt focusState activeSolveTimeMs currentQuestionIndex"
        )
        .lean()
    : [];
  const userIds = uniqueIds(
    matches.flatMap((match) => [
      match.challenger?.userId,
      match.defender?.userId,
    ])
  );
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } })
        .select("name username realName email")
        .lean()
    : [];

  return buildAdminActiveArenaMatchesData({ matches, attempts, users, now });
}

module.exports = {
  ACTIVE_DEFENDER_ATTEMPT_STATUSES,
  ACTIVE_MATCH_STATUSES,
  ADMIN_ACTIVE_MATCH_LIMIT,
  LIVE_HEARTBEAT_WINDOW_MS,
  buildAdminActiveArenaMatchesData,
  getAdminActiveArenaMatchesData,
};
