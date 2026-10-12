const mongoose = require("mongoose");
const {
  ArenaAccessState,
  ArenaMatch,
  ArenaMatchAttempt,
} = require("../models/goatArenaModel");
const {
  User,
  UserNotification,
} = require("../models/matthsModel");
const { enqueueArenaNotificationEmail, processArenaNotificationEmails } = require("./arenaNotificationEmailService");
const { getActiveAdminSender } = require("./adminIdentityService");
const { registerArenaOutboxHandler } = require("./arenaOutboxService");

const ACTIVE_MATCH_STATUSES = Object.freeze([
  "REQUESTED",
  "MATCHED",
  "READY",
  "IN_PROGRESS",
  "SUBMITTED",
  "HELD",
]);

function id(value) {
  return value == null ? "" : String(value);
}

function isAsyncHistoricalRecordMatch(match) {
  return Boolean(
    match?.normalAsync?.enabled || match?.competitiveAsync?.enabled
  );
}

function isCompetitiveIntegrityMatch(match) {
  return Boolean(
    match &&
    String(match.matchType || "").toUpperCase() !== "FRIENDLY" &&
    String(match.gameMode || "").toUpperCase() === "COMPETITIVE" &&
    match.competitiveAsync?.enabled === true
  );
}

function safeInternalHref(value) {
  const href = String(value || "").trim();
  return /^\/(?!\/)/.test(href) ? href : "/goat-arena";
}

function absoluteAppUrl(href) {
  const baseUrl = String(
    process.env.APP_BASE_URL ||
      process.env.PUBLIC_BASE_URL ||
      ""
  ).replace(/\/$/, "");
  const internalHref = safeInternalHref(href);
  return baseUrl ? `${baseUrl}${internalHref}` : "";
}

async function ensureArenaNotification({
  user,
  dedupeKey,
  title,
  message,
  href = "/goat-arena",
  sourceType = "GOAT_ARENA",
  sourceId = null,
  kind = "system",
  tone = "",
  metadata = {},
  email = false,
  emailActionLabel = "",
  emailActionUrl = "",
  fromAddress = "",
}) {
  if (!user?._id || !dedupeKey) return null;
  const existing = await UserNotification.findOne({ dedupeKey }).lean();
  const notification = existing || await UserNotification.findOneAndUpdate(
    { dedupeKey },
    {
      $setOnInsert: {
        userId: user._id,
        title,
        message,
        href: safeInternalHref(href),
        kind,
        tone: String(tone || "").slice(0, 32),
        metadata: metadata && typeof metadata === "object" ? metadata : {},
        dedupeKey,
        sourceType,
        sourceId: mongoose.isValidObjectId(sourceId) ? sourceId : null,
        readAt: null,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();

  if (email && user.email) {
    await enqueueArenaNotificationEmail({ userId: user._id, dedupeKey, payload: {
      to: user.email, subject: title, message, idempotencyKey: dedupeKey,
      actionLabel: emailActionLabel, actionUrl: emailActionUrl, fromAddress,
    } });
    // Delivery failure cannot roll back an inbox notification or settled match.
    // Durable RETRY/UNKNOWN state is processed independently by the scheduler.
    await processArenaNotificationEmails({ dedupeKey, limit: 1 });
  }
  return notification;
}

function arenaMatchRoleLabel({ gameMode, role }) {
  if (gameMode === "FRIENDLY") {
    return role === "CHALLENGER" ? "친선 초대 사용자" : "초대 수락 사용자";
  }
  return role === "CHALLENGER" ? "현재 도전자" : "상대";
}

function arenaMatchResultSummary(match) {
  const summary = match.resultSnapshot?.settlementSummary || {};
  if (match.gameMode === "FRIENDLY") return "친선전은 XP와 경쟁전 점수에 영향을 주지 않습니다.";
  const xpNote = summary.xpAwarded
    ? "계정 XP가 지급되었습니다."
    : "운영 판정 경기에는 XP가 지급되지 않습니다.";
  return match.gameMode === "COMPETITIVE"
    ? `경쟁전 결과가 점수와 티어에 반영되었습니다. ${xpNote}`
    : `일반전은 공개 경쟁전 점수와 티어에 영향을 주지 않습니다. ${xpNote}`;
}

/**
 * 최종 정산 결과를 실제 응시자에게 한 번씩 전달한다. 비동기 과거 기록전의
 * 기록 소유자는 이번 경기의 응시자가 아니므로 수신자에서 제외한다.
 *
 * 결과 정산은 트랜잭션 안에서 끝나고 outbox가 이를 비동기로 전달한다.
 * 따라서 새로고침, 정산 재시도, outbox 재시도 중 어느 경우에도
 * 경기·수신자 조합의 dedupeKey가 같은 우편을 한 번만 남긴다.
 */
async function notifyArenaMatchResult({ matchId, refreshExisting = false }) {
  if (!mongoose.isValidObjectId(matchId)) return [];
  const match = await ArenaMatch.findOne({ _id: matchId, status: "SETTLED" })
    .select([
      "gameMode",
      "division",
      "matchType",
      "winnerRole",
      "challenger.userId",
      "defender.userId",
      "normalAsync.enabled",
      "competitiveAsync.enabled",
      "resultSnapshot.challenger",
      "resultSnapshot.defender",
      "resultSnapshot.tieBreakStep",
      "resultSnapshot.settlementSummary",
    ].join(" "))
    .lean();
  if (!match) return [];

  const challengerId = match.challenger?.userId;
  const defenderId = match.defender?.userId;
  if (!challengerId || !defenderId) return [];

  const participants = await User.find({
    _id: { $in: [challengerId, defenderId] },
  }).select("name email").lean();
  const userById = new Map(participants.map((user) => [id(user._id), user]));
  const matchLabel = match.gameMode === "COMPETITIVE"
    ? "경쟁전"
    : match.gameMode === "FRIENDLY"
      ? "친선전"
      : "일반전";
  const friendly = match.gameMode === "FRIENDLY";
  const matchEndSubject = friendly ? `${matchLabel}가` : `${matchLabel}이`;
  const settlementNote = arenaMatchResultSummary(match);

  const recipients = isAsyncHistoricalRecordMatch(match)
    ? [{ role: "CHALLENGER", userId: challengerId, opponentId: defenderId }]
    : [
        { role: "CHALLENGER", userId: challengerId, opponentId: defenderId },
        { role: "DEFENDER", userId: defenderId, opponentId: challengerId },
      ];
  return Promise.all(recipients.map(async ({ role, userId, opponentId }) => {
    const user = userById.get(id(userId));
    if (!user) return null;
    const opponentName = userById.get(id(opponentId))?.name || "상대 이용자";
    const won = match.winnerRole === role;
    const lost = ["CHALLENGER", "DEFENDER"].includes(match.winnerRole) && !won;
    const resultLabel = won ? "승리" : lost ? "패배" : "무승부";
    const myScore = role === "CHALLENGER"
      ? match.resultSnapshot?.challenger
      : match.resultSnapshot?.defender;
    const opponentScore = role === "CHALLENGER"
      ? match.resultSnapshot?.defender
      : match.resultSnapshot?.challenger;
    const resultMetadata = {
      arenaMatchResult: {
        version: 1,
        matchId: id(match._id),
        division: match.division,
        divisionLabel: matchLabel,
        matchType: match.matchType,
        matchLabel,
        role,
        roleLabel: arenaMatchRoleLabel({ gameMode: match.gameMode, role }),
        opponentName,
        outcome: won ? "WIN" : lost ? "LOSS" : "DRAW",
        outcomeLabel: resultLabel,
        matchStatusLabel: "경기 정산 완료",
        myScore: myScore || null,
        opponentScore: opponentScore || null,
        tieBreakStep: String(match.resultSnapshot?.tieBreakStep || ""),
        settlementNote,
      },
    };
    const notification = await ensureArenaNotification({
      user,
      dedupeKey: `arena-match-result:${match._id}:${user._id}`,
      title: `GOAT Arena 경기 결과 · ${resultLabel}`,
      message: `${matchEndSubject} 종료되었습니다. ${opponentName}님과의 경기 결과는 ${resultLabel}입니다. ${settlementNote}`,
      href: `/goat-arena/matches/${match._id}`,
      sourceType: "ArenaMatch",
      sourceId: match._id,
      kind: "system",
      tone: won ? "match-victory" : lost ? "match-defeat" : "match-result",
      metadata: resultMetadata,
    });
    if (!refreshExisting || !notification?._id) return notification;
    return UserNotification.findByIdAndUpdate(
      notification._id,
      {
        $set: {
          title: `GOAT Arena 경기 결과 · ${resultLabel}`,
          message: `${matchEndSubject} 종료되었습니다. ${opponentName}님과의 경기 결과는 ${resultLabel}입니다. ${settlementNote}`,
          href: `/goat-arena/matches/${match._id}`,
          kind: "system",
          tone: won ? "match-victory" : lost ? "match-defeat" : "match-result",
          metadata: resultMetadata,
        },
      },
      { returnDocument: "after" }
    ).lean();
  }));
}

async function placeUserUnderArenaIntegrityReview({
  userId,
  matchId = null,
  evidenceId = null,
  reasonKey = "risk",
}) {
  if (!mongoose.isValidObjectId(userId)) return null;
  const user = await User.findById(userId).select("email name").lean();
  if (!user) return null;
  await ArenaAccessState.updateOne(
    { userId },
    { $set: { integrityStatus: "REVIEW_REQUIRED" } }
  );
  return ensureArenaNotification({
    user,
    dedupeKey: `arena-integrity-review-started:${reasonKey}:${userId}`,
    title: "GOAT Arena 경기 검토가 시작되었습니다",
    message: "부정행위가 의심되는 기록이 감지되어 운영자가 검토 중입니다. 검토는 24시간 안에 이루어집니다. 현재 배정된 경기는 끝까지 진행할 수 있지만, 검토가 끝날 때까지 신규 매치메이킹은 제한됩니다.",
    href: matchId ? `/goat-arena/matches/${matchId}` : "/goat-arena/profile",
    sourceType: evidenceId ? "ArenaMatchEvidence" : "ArenaIntegrityRiskCase",
    sourceId: evidenceId || matchId,
    kind: "integrity",
    tone: "integrity-alert",
    email: true,
  });
}

async function notifyArenaIntegrityReviewResult({
  userId,
  sourceId,
  decision,
  note = "",
  accessReleased = decision === "CLEAR",
  adminUserId = null,
}) {
  if (!mongoose.isValidObjectId(userId)) return null;
  const user = await User.findById(userId).select("email name").lean();
  if (!user) return null;
  const cleared = decision === "CLEAR";
  const clearedWithPendingReview = cleared && !accessReleased;
  const reason = String(note || "").trim();
  const sender = adminUserId ? await getActiveAdminSender(adminUserId) : null;
  return ensureArenaNotification({
    user,
    dedupeKey: `arena-integrity-review-result:${sourceId}:${decision}:${userId}`,
    title: cleared
      ? "GOAT Arena 검토 결과: 이상 없음"
      : "GOAT Arena 검토 결과: 이용 제한",
    message: cleared
      ? clearedWithPendingReview
        ? `운영자 확인 결과 부정행위가 확인되지 않았습니다. 다만 다른 검토 건이 남아 있어 신규 매치메이킹 제한은 유지됩니다.${reason ? ` 검토 메모: ${reason}` : ""}`
        : `운영자 확인 결과 부정행위가 확인되지 않았으며 신규 매치메이킹 제한을 해제했습니다.${reason ? ` 검토 메모: ${reason}` : ""}`
      : `운영자 검토 결과 무결성 위반이 확인되어 신규 매치메이킹 제한이 유지됩니다.${reason ? ` 검토 메모: ${reason}` : ""}`,
    href: "/goat-arena/profile",
    sourceType: "ArenaIntegrityReview",
    sourceId,
    kind: "integrity",
    // 이상 없음 결과는 경고성 빨간 표시가 아닌, 검토 완료를 알리는
    // 주황 표시로 Arena 우편함에 보여준다.
    tone: cleared ? "review-cleared" : "integrity-alert",
    email: true,
    fromAddress: sender?.email || "",
  });
}

async function notifyArenaMatchIntegrityReviewStarted({
  matchId,
  screenedRole = "",
}) {
  if (!mongoose.isValidObjectId(matchId)) return null;
  const match = await ArenaMatch.findById(matchId)
    .select(
      "arenaVersion gameMode division matchType challenger.userId defender.userId integrityStatus normalAsync.enabled competitiveAsync.enabled"
    )
    .lean();
  if (!match || match.integrityStatus !== "SUSPICIOUS") return null;
  // General, member-friendly, and guest-friendly play never opens an
  // automated cheating review or sends its related participant/admin email.
  if (!isCompetitiveIntegrityMatch(match)) return null;
  let normalizedRole = String(screenedRole || "").toUpperCase();
  if (!["CHALLENGER", "DEFENDER"].includes(normalizedRole)) normalizedRole = "CHALLENGER";
  const participantIds = [match.challenger?.userId].filter(Boolean);
  if (participantIds.length !== 1) return null;
  const [participants, admins] = await Promise.all([
    User.find({ _id: { $in: participantIds } })
      .select("email name")
      .lean(),
    User.find({ role: "admin", accountStatus: "active", isActive: { $ne: false } })
      .select("email name")
      .lean(),
  ]);
  await ArenaAccessState.updateMany(
    { userId: { $in: participantIds } },
    {
      $set: {
        integrityStatus: "REVIEW_REQUIRED",
        reasonCode: "MATCH_INTEGRITY_REVIEW",
      },
    }
  );
  await Promise.all(
    participants.map((user) => ensureArenaNotification({
      user,
      dedupeKey: `arena-match-integrity-review-started:${match._id}:${user._id}`,
      title: "GOAT Arena 경기 검토가 시작되었습니다",
      message: "회원님의 5문항 답안과 필수 풀이에서 운영 확인이 필요한 신호가 감지되었습니다. 부정행위가 확정된 것은 아닙니다. 검토가 끝날 때까지 새 경기 시작과 이번 경기의 정산만 보류됩니다.",
      href: `/goat-arena/matches/${match._id}`,
      sourceType: "ArenaMatch",
      sourceId: match._id,
      kind: "integrity",
      email: true,
    }))
  );
  await Promise.all(
    admins.map((admin) => ensureArenaNotification({
      user: admin,
      dedupeKey: `admin-arena-match-integrity-review:${match._id}:${admin._id}`,
      title: "GOAT Arena 종료 경기 검토가 필요합니다",
      message: `경쟁전 현재 응시자의 풀이에서 확인이 필요한 신호가 감지되었습니다. 과거 기록 소유자는 판정 대상이 아닙니다. 내부 자동 신호 확인 대상은 ${normalizedRole === "DEFENDER" ? "상대" : "현재 도전자"}입니다.`,
      href: `/admin/arena-matches#match-${match._id}`,
      sourceType: "ArenaMatch",
      sourceId: match._id,
      kind: "integrity",
      email: true,
    }))
  );
  return { matchId: id(match._id), participantCount: participants.length };
}

async function notifyArenaSupplementalEvidenceRequested({
  matchId,
  userId,
  role,
  requestedAt,
  deadlineAt,
  requestMessage = "",
  adminUserId = null,
}) {
  if (!mongoose.isValidObjectId(matchId) || !mongoose.isValidObjectId(userId)) {
    return null;
  }
  const user = await User.findById(userId).select("email name").lean();
  if (!user) return null;
  const href = `/goat-arena/matches/${matchId}/supplemental-evidence`;
  const deadlineLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(deadlineAt));
  const reason = String(requestMessage || "").trim();
  const sender = adminUserId ? await getActiveAdminSender(adminUserId) : null;
  return ensureArenaNotification({
    user,
    dedupeKey: `arena-supplemental-evidence:${matchId}:${role}:${new Date(requestedAt).getTime()}`,
    title: "GOAT Arena 추가 소명 자료 요청",
    message: `운영자가 경기 기록 확인을 위해 추가 소명 자료를 요청했습니다. 요청 시점부터 24시간인 ${deadlineLabel}까지 실제 풀이과정을 확인할 수 있는 사진을 제출해주세요. 24시간 안에 응답이 없으면 추가 소명 자료가 없는 것으로 처리되며, 기한이 끝난 뒤에는 제출할 수 없습니다.${reason ? `\n\n요청 사유: ${reason}` : ""}`,
    href,
    sourceType: "ArenaMatch",
    sourceId: matchId,
    kind: "integrity",
    email: true,
    emailActionLabel: "소명 자료 업로드하기",
    emailActionUrl: absoluteAppUrl(href),
    fromAddress: sender?.email || "",
  });
}

async function notifyArenaIntegrityReviewOverdue({ matchId, now = new Date() }) {
  if (!mongoose.isValidObjectId(matchId)) return null;
  const match = await ArenaMatch.findOne({
    _id: matchId,
    status: "HELD",
    integrityStatus: "SUSPICIOUS",
    integrityReviewDeadlineAt: { $lte: now },
  })
    .select("gameMode division matchType integrityReviewDeadlineAt integrityScreenedRole normalAsync.enabled competitiveAsync.enabled")
    .lean();
  if (!match || !isCompetitiveIntegrityMatch(match)) return null;
  const admins = await User.find({
    role: "admin",
    accountStatus: "active",
    isActive: { $ne: false },
  })
    .select("email name")
    .lean();
  await Promise.all(
    admins.map((admin) => ensureArenaNotification({
      user: admin,
      dedupeKey: `admin-arena-integrity-review-overdue:${match._id}:${admin._id}`,
      title: "GOAT Arena 경기 검토 24시간 목표 초과",
      message: "경쟁전 현재 응시자의 운영 검토가 24시간 목표를 넘겼습니다. 현재 응시자의 신규 매칭과 경기 정산이 계속 보류되고 있으니 즉시 검토해주세요.",
      href: `/admin/arena-matches#match-${match._id}`,
      sourceType: "ArenaMatch",
      sourceId: match._id,
      kind: "integrity",
      email: true,
    }))
  );
  return { matchId: id(match._id), adminCount: admins.length };
}

async function handleMatchIntegrityReviewStarted(event) {
  return notifyArenaMatchIntegrityReviewStarted({
    matchId: event.aggregateId,
    screenedRole: event.payload?.screenedRole,
  });
}

function registerArenaNotificationOutboxHandlers() {
  registerArenaOutboxHandler("ArenaMatchSettled", (event) =>
    notifyArenaMatchResult({ matchId: event.aggregateId })
  );
  registerArenaOutboxHandler(
    "ArenaMatchIntegrityReviewStarted",
    handleMatchIntegrityReviewStarted
  );
}

async function getArenaNotificationSummary({
  userId,
  limit = 5,
  hrefBase = "/notifications",
}) {
  const notificationHrefBase =
    hrefBase === "/goat-arena/mailbox"
      ? "/goat-arena/mailbox"
      : "/notifications";
  if (!mongoose.isValidObjectId(userId)) {
    return {
      unreadCount: 0,
      notifications: [],
      defenseByDivision: { SUB: 0, MAIN: 0 },
      actionByDivision: { SUB: 0, MAIN: 0 },
    };
  }
  const [unreadCount, notifications, participantMatches] = await Promise.all([
    UserNotification.countDocuments({ userId, readAt: null }),
    UserNotification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(Math.max(1, Math.min(10, Number(limit) || 5)))
      .lean(),
    ArenaMatch.find({
      $or: [
        { "challenger.userId": userId },
        {
          $and: [
            { "defender.userId": userId },
            { "normalAsync.enabled": { $ne: true } },
            { "competitiveAsync.enabled": { $ne: true } },
          ],
        },
      ],
      status: { $in: ACTIVE_MATCH_STATUSES },
    })
      .select("_id division status defender.userId")
      .lean(),
  ]);
  const matchIds = participantMatches.map((match) => match._id);
  const attempts = matchIds.length
    ? await ArenaMatchAttempt.find({
        userId,
        matchId: { $in: matchIds },
      }).select("matchId status").lean()
    : [];
  const attemptByMatchId = new Map(
    attempts.map((attempt) => [id(attempt.matchId), attempt])
  );
  const defenseByDivision = { SUB: 0, MAIN: 0 };
  const actionByDivision = { SUB: 0, MAIN: 0 };
  for (const match of participantMatches) {
    const attempt = attemptByMatchId.get(id(match._id));
    // 상태가 SUBMITTED여도 상대방의 진행·증거 제출을 기다리는 쪽에는
    // 아직 확인할 경기가 남아 있을 수 있다. 경기 카드와 상단 메뉴의
    // 알림 점을 같은 기준으로 계산한다.
    const needsAction =
      ["MATCHED", "READY", "IN_PROGRESS", "SUBMITTED"].includes(match.status) &&
      (!attempt || ["READY", "IN_PROGRESS", "EVIDENCE_REQUIRED"].includes(attempt.status));
    if (needsAction && actionByDivision[match.division] != null) {
      actionByDivision[match.division] += 1;
    }
    if (
      id(match.defender?.userId) === id(userId) &&
      attempt?.status !== "SUBMITTED" &&
      defenseByDivision[match.division] != null
    ) {
      defenseByDivision[match.division] += 1;
    }
  }
  return {
    unreadCount,
    defenseByDivision,
    actionByDivision,
    notifications: notifications.map((notification) => ({
      id: id(notification._id),
      title: notification.title,
      message: notification.message,
      href: `${notificationHrefBase}/${notification._id}`,
      createdAt: notification.createdAt,
      unread: !notification.readAt,
      tone: notification.tone || "",
    })),
  };
}

module.exports = {
  ensureArenaNotification,
  getArenaNotificationSummary,
  notifyArenaIntegrityReviewOverdue,
  notifyArenaIntegrityReviewResult,
  notifyArenaMatchIntegrityReviewStarted,
  notifyArenaMatchResult,
  notifyArenaSupplementalEvidenceRequested,
  placeUserUnderArenaIntegrityReview,
  registerArenaNotificationOutboxHandlers,
};
