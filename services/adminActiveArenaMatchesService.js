"use strict";

const { ArenaMatch, ArenaMatchAttempt } = require("../models/goatArenaModel");
const { User } = require("../models/matthsModel");

const ACTIVE_MATCH_STATUSES = Object.freeze([
  "MATCHED",
  "READY",
  "IN_PROGRESS",
  "EVIDENCE_REQUIRED",
  "SUBMITTED",
  "HELD",
]);
const LIVE_HEARTBEAT_WINDOW_MS = 45 * 1000;
const ADMIN_ACTIVE_MATCH_LIMIT = 300;

function id(value) {
  return String(value?._id || value || "");
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
  if (!attempt) return null;
  const heartbeatAt = attempt.lastHeartbeatAt ? new Date(attempt.lastHeartbeatAt) : null;
  const heartbeatAgeMs = heartbeatAt
    ? Math.max(0, new Date(now).getTime() - heartbeatAt.getTime())
    : null;
  const status = String(attempt.status || "READY");
  const isLive = status === "IN_PROGRESS" && heartbeatAgeMs !== null && heartbeatAgeMs <= LIVE_HEARTBEAT_WINDOW_MS;
  return {
    id: id(attempt._id),
    role: String(attempt.role || ""),
    userId: id(attempt.userId),
    status,
    statusLabel: ({
      READY: "시작 대기",
      IN_PROGRESS: isLive ? "현재 풀이 중" : "풀이 중 · 연결 확인",
      EVIDENCE_REQUIRED: "풀이 업로드 대기",
      SUBMITTED: "제출 완료 · 결과 처리 대기",
    })[status] || status,
    isLive,
    heartbeatAgeMs,
    currentQuestion: status === "READY" ? 0 : Math.min(5, Math.max(1, Number(attempt.currentQuestionIndex || 0) + 1)),
    answeredCount: (attempt.answers || []).filter((answer) => String(answer?.value || "").trim()).length,
    focusState: String(attempt.focusState || "UNKNOWN"),
    startedAt: attempt.startedAt || null,
    deadlineAt: attempt.deadlineAt || null,
    evidenceDeadlineAt: attempt.evidenceDeadlineAt || null,
    lastHeartbeatAt: attempt.lastHeartbeatAt || null,
  };
}

function matchMode(match) {
  if (match.gameMode) return String(match.gameMode);
  if (match.matchType === "FRIENDLY") return "FRIENDLY";
  return "NORMAL";
}

function stageFor(match, attempts) {
  if (match.status === "HELD") return { key: "HELD", label: "운영 검토 대기", priority: 5 };
  if (match.status === "SUBMITTED") return { key: "SETTLEMENT", label: "결과 처리 대기", priority: 4 };
  if (attempts.some((attempt) => attempt?.status === "EVIDENCE_REQUIRED")) return { key: "EVIDENCE", label: "풀이 업로드 대기", priority: 3 };
  if (attempts.some((attempt) => attempt?.isLive)) return { key: "LIVE", label: "현재 풀이 중", priority: 1 };
  if (attempts.some((attempt) => attempt?.status === "IN_PROGRESS")) return { key: "STALE", label: "풀이 중 · 연결 확인", priority: 2 };
  return { key: "WAITING", label: "시작 대기", priority: 2 };
}

function relevantDeadline(match, attempts) {
  const evidence = attempts.find((attempt) => attempt?.status === "EVIDENCE_REQUIRED");
  if (evidence) return evidence.evidenceDeadlineAt || match.completionDeadlineAt || null;
  const solving = attempts.find((attempt) => attempt?.status === "IN_PROGRESS");
  if (solving) return solving.deadlineAt || match.completionDeadlineAt || null;
  return match.startDeadlineAt || null;
}

function buildAdminActiveArenaMatchesData({ matches = [], attempts = [], users = [], now = new Date(), limit = ADMIN_ACTIVE_MATCH_LIMIT } = {}) {
  const usersById = new Map(users.map((user) => [id(user._id), user]));
  const attemptsByMatch = new Map();
  for (const attempt of attempts) {
    const key = id(attempt.matchId);
    if (!attemptsByMatch.has(key)) attemptsByMatch.set(key, []);
    attemptsByMatch.get(key).push(attemptSummary(attempt, now));
  }

  const activeMatches = matches
    .filter((match) => ACTIVE_MATCH_STATUSES.includes(String(match.status || "")))
    .map((match) => {
      const matchId = id(match._id);
      const matchAttempts = attemptsByMatch.get(matchId) || [];
      const stage = stageFor(match, matchAttempts);
      const deadlineAt = relevantDeadline(match, matchAttempts);
      const asynchronous = match.normalAsync?.enabled === true || match.competitiveAsync?.enabled === true;
      return {
        id: matchId,
        mode: matchMode(match),
        asynchronous,
        status: String(match.status || ""),
        tierPairLabel: String(match.tierPairLabel || ""),
        stage,
        deadlineAt,
        deadlineOverdue: Boolean(deadlineAt) && new Date(deadlineAt).getTime() < new Date(now).getTime(),
        requestedAt: match.requestedAt || match.createdAt || null,
        startedAt: match.startedAt || null,
        updatedAt: match.updatedAt || null,
        currentPlayer: userSummary(usersById.get(id(match.challenger?.userId)), match.challenger?.userId),
        opponent: userSummary(usersById.get(id(match.defender?.userId)), match.defender?.userId),
        opponentKind: asynchronous ? "HISTORICAL_RECORD" : "LIVE_PLAYER",
        attempts: matchAttempts,
      };
    })
    .sort((left, right) => left.stage.priority - right.stage.priority || new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));

  const visible = activeMatches.slice(0, limit);
  return {
    generatedAt: new Date(now),
    refreshIntervalSeconds: 15,
    limit,
    truncated: activeMatches.length > visible.length,
    stats: {
      total: activeMatches.length,
      live: activeMatches.filter((match) => match.stage.key === "LIVE").length,
      waiting: activeMatches.filter((match) => match.stage.key === "WAITING").length,
      stale: activeMatches.filter((match) => match.stage.key === "STALE").length,
      evidence: activeMatches.filter((match) => match.stage.key === "EVIDENCE").length,
      held: activeMatches.filter((match) => match.stage.key === "HELD").length,
      settlement: activeMatches.filter((match) => match.stage.key === "SETTLEMENT").length,
    },
    matches: visible,
  };
}

async function getAdminActiveArenaMatchesData({ now = new Date() } = {}) {
  const matches = await ArenaMatch.find({ status: { $in: ACTIVE_MATCH_STATUSES } })
    .sort({ updatedAt: -1 })
    .limit(ADMIN_ACTIVE_MATCH_LIMIT)
    .lean();
  const matchIds = matches.map((match) => match._id);
  const attempts = matchIds.length
    ? await ArenaMatchAttempt.find({ matchId: { $in: matchIds } })
        .select("_id matchId userId role status answers startedAt deadlineAt evidenceDeadlineAt lastHeartbeatAt focusState currentQuestionIndex")
        .lean()
    : [];
  const userIds = [...new Set(matches.flatMap((match) => [id(match.challenger?.userId), id(match.defender?.userId)]).filter(Boolean))];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select("name username realName email").lean()
    : [];
  return buildAdminActiveArenaMatchesData({ matches, attempts, users, now });
}

module.exports = {
  ACTIVE_MATCH_STATUSES,
  ADMIN_ACTIVE_MATCH_LIMIT,
  LIVE_HEARTBEAT_WINDOW_MS,
  buildAdminActiveArenaMatchesData,
  getAdminActiveArenaMatchesData,
};
