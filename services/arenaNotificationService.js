const mongoose = require("mongoose");
const {
  ArenaAccessState,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
  MainFriendlyInvitation,
  MainInvitationRequest,
} = require("../models/goatArenaModel");
const {
  User,
  UserNotification,
} = require("../models/matthsModel");
const { sendAdminUserEmail } = require("./emailService");
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

function safeInternalHref(value) {
  const href = String(value || "").trim();
  return /^\/(?!\/)/.test(href) ? href : "/goat-arena";
}

function absoluteAppUrl(href) {
  const baseUrl = String(
    process.env.APP_BASE_URL ||
      process.env.PUBLIC_BASE_URL ||
      (process.env.NODE_ENV === "production"
        ? ""
        : `http://localhost:${Number(process.env.PORT) || 8000}`)
  ).replace(/\/$/, "");
  const internalHref = safeInternalHref(href);
  return baseUrl ? `${baseUrl}${internalHref}` : "";
}

function formatDurationKo(milliseconds) {
  const totalMinutes = Math.max(0, Math.ceil(Number(milliseconds || 0) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}시간 ${minutes}분`;
  if (hours) return `${hours}시간`;
  return `${minutes}분`;
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

  if (email && !existing && user.email) {
    try {
      await sendAdminUserEmail({
        to: user.email,
        subject: title,
        message,
        idempotencyKey: dedupeKey,
        actionLabel: emailActionLabel,
        actionUrl: emailActionUrl,
      });
    } catch (error) {
      // 이메일 공급자 장애가 사이트 우편 생성이나 경기 상태를 되돌리면 안 됩니다.
      console.error("[arena-notification] 이메일 발송 실패", {
        userId: id(user._id),
        dedupeKey,
        message: error?.message || "",
      });
    }
  }
  return notification;
}

async function notifyArenaMatchDefender({ matchId }) {
  if (!mongoose.isValidObjectId(matchId)) return null;
  const match = await ArenaMatch.findById(matchId)
    .select("division matchType defender.userId")
    .lean();
  const defenderId = match?.defender?.userId;
  if (!defenderId) return null;
  const user = await User.findById(defenderId).select("email name").lean();
  if (!user) return null;
  return ensureArenaNotification({
    user,
    dedupeKey: `arena-defense-assigned:${match._id}`,
    title: match.matchType === "FRIENDLY" ? "친선 경기가 성립되었습니다" : "방어해야 할 경기가 배정되었습니다",
    message: match.matchType === "FRIENDLY"
      ? "친선 경기 수락이 완료되었습니다. 양측의 이용 수수료 1일이 차감되었으며, 티어·순위·학습일수 이전 없이 경기를 진행합니다."
      : `${match.division === "MAIN" ? "Ranked" : "Unranked"} ${match.matchType === "REVENGE" ? "복수전" : "쟁탈전"}이 자동 배정되었습니다. 제한시간 안에 경기를 확인해주세요.`,
    href: `/goat-arena/matches/${match._id}`,
    sourceType: "ArenaMatch",
    sourceId: match._id,
    kind: "system",
  });
}

function arenaMatchTypeLabel(matchType) {
  if (matchType === "FRIENDLY") return "친선 경기";
  if (matchType === "REVENGE") return "복수전";
  return "쟁탈전";
}

function arenaDivisionLabel(division) {
  return division === "MAIN" ? "Ranked" : "Unranked";
}

function arenaMatchRoleLabel({ matchType, role }) {
  if (matchType === "FRIENDLY") {
    return role === "CHALLENGER" ? "친선 초대 사용자" : "초대 수락 사용자";
  }
  if (matchType === "REVENGE") {
    return role === "CHALLENGER" ? "복수전 신청자" : "복수전 상대";
  }
  return role === "CHALLENGER" ? "공격자" : "방어자";
}

function arenaMatchResultSummary(match) {
  if (match.matchType === "FRIENDLY") {
    return "친선 경기는 수락 시 차감된 양쪽 이용 수수료 1일 외에 티어·순위·학습일수 이전이 없습니다.";
  }
  const tupleAction = String(
    match.resultSnapshot?.settlementSummary?.tupleAction || ""
  ).toUpperCase();
  if (tupleAction === "SWAP") {
    return "이번 경기 결과에 따라 티어와 티어 내 순위가 반영되었습니다.";
  }
  return "이번 경기의 정산 결과가 반영되었습니다. 상세 규정과 정산 내역은 경기 기록에서 확인할 수 있습니다.";
}

/**
 * 모든 최종 정산 경기의 결과를 양쪽 참가자에게 한 번씩 전달한다.
 *
 * 결과 정산은 트랜잭션 안에서 끝나고 outbox가 이를 비동기로 전달한다.
 * 따라서 새로고침, 정산 재시도, outbox 재시도 중 어느 경우에도
 * 경기·수신자 조합의 dedupeKey가 같은 우편을 한 번만 남긴다.
 */
async function notifyArenaMatchResult({ matchId, refreshExisting = false }) {
  if (!mongoose.isValidObjectId(matchId)) return [];
  const match = await ArenaMatch.findOne({ _id: matchId, status: "SETTLED" })
    .select([
      "division",
      "matchType",
      "winnerRole",
      "challenger.userId",
      "defender.userId",
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
  const matchLabel = `${arenaDivisionLabel(match.division)} ${arenaMatchTypeLabel(match.matchType)}`;
  const friendly = match.matchType === "FRIENDLY";
  const matchEndSubject = friendly ? `${matchLabel}가` : `${matchLabel}이`;
  const settlementNote = arenaMatchResultSummary(match);

  return Promise.all([
    { role: "CHALLENGER", userId: challengerId, opponentId: defenderId },
    { role: "DEFENDER", userId: defenderId, opponentId: challengerId },
  ].map(async ({ role, userId, opponentId }) => {
    const user = userById.get(id(userId));
    if (!user) return null;
    const opponentName = userById.get(id(opponentId))?.name || "상대 이용자";
    const won = match.winnerRole === role;
    const lost = ["CHALLENGER", "DEFENDER"].includes(match.winnerRole) && !won;
    const resultLabel = won ? "승리" : lost ? "패배" : "결과 확정";
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
        divisionLabel: arenaDivisionLabel(match.division),
        matchType: match.matchType,
        matchLabel,
        role,
        roleLabel: arenaMatchRoleLabel({ matchType: match.matchType, role }),
        opponentName,
        outcome: won ? "WIN" : lost ? "LOSS" : "FINALIZED",
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

async function notifyMainFriendlyInvitation({ invitationId }) {
  if (!mongoose.isValidObjectId(invitationId)) return null;
  const invitation = await MainFriendlyInvitation.findById(invitationId)
    .select("inviterUserId inviteeUserId status expiresAt")
    .lean();
  if (!invitation || invitation.status !== "PENDING") return null;
  const [inviter, invitee] = await Promise.all([
    User.findById(invitation.inviterUserId).select("name username").lean(),
    User.findById(invitation.inviteeUserId).select("email name").lean(),
  ]);
  if (!invitee) return null;
  const inviterName = String(inviter?.name || inviter?.username || "친구");
  return ensureArenaNotification({
    user: invitee,
    dedupeKey: `main-friendly-invitation:${invitation._id}`,
    title: "GOAT Arena 친선 경기 초대가 도착했습니다",
    message: `${inviterName}님이 친선 경기를 초대했습니다. 수락 시 양쪽에서 1일씩 차감되며, 티어·순위·학습일수 이전은 없습니다.`,
    href: "/goat-arena/main/battle#main-friendly-match",
    sourceType: "MainFriendlyInvitation",
    sourceId: invitation._id,
    kind: "system",
    email: true,
    emailActionLabel: "친선 경기 초대 확인",
    emailActionUrl: absoluteAppUrl("/goat-arena/main/battle#main-friendly-match"),
  });
}

async function notifyMainInvitationOffered({ invitationId, candidateUserId }) {
  if (
    !mongoose.isValidObjectId(invitationId) ||
    !mongoose.isValidObjectId(candidateUserId)
  ) {
    return null;
  }
  const [invitation, user] = await Promise.all([
    MainInvitationRequest.findById(invitationId)
      .select("initiatorArenaTier targetTier stakeDays status")
      .lean(),
    User.findById(candidateUserId).select("email name").lean(),
  ]);
  if (!invitation || !user || !["OFFERED", "SEARCHING"].includes(invitation.status)) {
    return null;
  }
  const stakeDays = Number(invitation.stakeDays || 0);
  return ensureArenaNotification({
    user,
    dedupeKey: `arena-main-invitation-offered:${invitation._id}:${user._id}`,
    title: "Ranked 초대전이 도착했습니다",
    message: `${invitation.initiatorArenaTier} 사용자가 ${invitation.targetTier} 티어에 초대전을 보냈습니다. 수락하면 양측이 각각 ${stakeDays}일을 예치합니다. 경기 조건을 확인한 뒤 수락하거나 불이익 없이 거절할 수 있습니다.`,
    href: "/goat-arena/main/battle#main-invitations",
    sourceType: "MainInvitationRequest",
    sourceId: invitation._id,
    kind: "system",
  });
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
  division = "",
  note = "",
  accessReleased = ["CLEAR", "PARTICIPANT_CLEARED"].includes(decision),
  restrictedUntil = null,
  compensationMs = 0,
  assetPenaltyBurned = 0,
  assetPenaltyKind = "",
}) {
  if (!mongoose.isValidObjectId(userId)) return null;
  const user = await User.findById(userId).select("email name").lean();
  if (!user) return null;
  const participantCleared = decision === "PARTICIPANT_CLEARED";
  const cleared = decision === "CLEAR" || participantCleared;
  const challengerCheating = decision === "CHALLENGER_CHEATING";
  const defenderCheating = decision === "DEFENDER_CHEATING";
  const bothCheating = decision === "BOTH_CHEATING";
  const isRanked = String(division || "").toUpperCase() === "MAIN";
  const clearedWithPendingReview = cleared && !accessReleased;
  const reason = String(note || "").trim();
  const decisionReason = reason ? `\n\n판정 근거: ${reason}` : "";
  const paybackPenalty = isRanked
    ? ""
    : " 해당 이용 주기의 페이백 심사에서도 즉시 탈락 처리됩니다.";
  const packageValidity = isRanked
    ? " 이용 권한의 유효기간은 유지됩니다."
    : " 구매한 29일 학습권 패키지의 유효기간은 유지됩니다.";
  const penaltyAssetLabel = assetPenaltyKind === "LEARNING_DAYS"
    ? "사용 가능한 학습일수"
    : "페이백 점수";
  const assetPenaltyNotice = Number(assetPenaltyBurned) > 0
    ? ` 추가 제재로 현재 ${penaltyAssetLabel}의 1/3(정수 단위 올림)인 ${Number(assetPenaltyBurned)}${assetPenaltyKind === "LEARNING_DAYS" ? "일" : "점"}을 소각했습니다.`
    : "";
  const compensationNotice = cleared && Number(compensationMs) > 0
    ? ` 매치메이킹이 일시정지된 ${formatDurationKo(compensationMs)}만큼 현재 이용 주기의 만료·평가 시각을 연장했습니다.`
    : "";
  const restrictedUntilLabel = restrictedUntil
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(restrictedUntil))
    : "판정 시점부터 5일 뒤";
  return ensureArenaNotification({
    user,
    dedupeKey: `arena-integrity-review-result:${sourceId}:${decision}:${userId}`,
    title: cleared
      ? participantCleared
        ? "GOAT Arena 경기 검토 완료: 계정 이상 없음"
        : clearedWithPendingReview
          ? "GOAT Arena 경기 검토 결과: 이상 없음"
          : "GOAT Arena 검토 결과: 이상 없음"
      : challengerCheating
        ? "GOAT Arena 부정행위 확정 및 제재 통보"
        : defenderCheating
          ? "GOAT Arena 부정행위 확정 및 제재 통보"
          : bothCheating
            ? "GOAT Arena 부정행위 확정 및 제재 통보"
            : "GOAT Arena 검토 결과: 이용 제한",
    message: cleared
      ? participantCleared
        ? clearedWithPendingReview
          ? `운영자 확인 결과 이번 경기의 회원님 기록에서는 부정행위가 확인되지 않았습니다.${compensationNotice} 다만 다른 검토 건이 남아 있어 신규 매치메이킹 제한은 유지됩니다.${reason ? ` 검토 메모: ${reason}` : ""}`
          : `운영자 확인 결과 회원님의 기록에서는 부정행위가 확인되지 않았습니다. 회원님에게 적용된 신규 매치메이킹 제한을 해제했으며, 경기 결과와 자산은 운영 검토 판정에 따라 처리되었습니다.${compensationNotice}${reason ? ` 검토 메모: ${reason}` : ""}`
        : clearedWithPendingReview
          ? `검토에 협조해주셔서 감사합니다. 이번 경기에서는 부정행위가 확인되지 않았습니다.${compensationNotice} 다만 다른 검토 건이 남아 있어 신규 매치메이킹 제한은 유지됩니다.${reason ? ` 검토 메모: ${reason}` : ""}`
          : `검토에 협조해주셔서 감사합니다. 운영자 확인 결과 이번 경기에서는 부정행위가 확인되지 않았습니다. 신규 매치메이킹 제한을 해제했으며, 경기 자산은 기존 1대1 경기 규정에 따라 처리됩니다.${compensationNotice}${reason ? ` 검토 메모: ${reason}` : ""}`
      : challengerCheating
        ? `운영자 검토 결과 공격자 부정행위가 확정되었습니다. 이는 공정한 경쟁을 훼손하는 중대한 위반입니다. 경고 1회가 부여되었고, 공격자가 예치한 ${isRanked ? "학습일수" : "페이백 점수"} 전부는 방어자에게 이전되며, ${restrictedUntilLabel}까지 모든 GOAT Arena 매치메이킹이 금지됩니다.${assetPenaltyNotice}${paybackPenalty}${packageValidity}${decisionReason}`
        : defenderCheating
          ? `운영자 검토 결과 방어자 부정행위가 확정되었습니다. 이는 공정한 경쟁을 훼손하는 중대한 위반입니다. 공격자가 예치한 ${isRanked ? "학습일수" : "페이백 점수"}는 공격자에게 전부 반환되고 Arena 상태는 공격자 승리 기준으로 처리됩니다. 방어자에게 경고 1회가 부여되며, ${restrictedUntilLabel}까지 모든 GOAT Arena 매치메이킹이 금지됩니다.${assetPenaltyNotice}${paybackPenalty}${packageValidity}${decisionReason}`
          : bothCheating
            ? `운영자 검토 결과 공격자와 방어자 모두의 부정행위가 확정되었습니다. 양측 모두 경고 1회가 부여되고 ${restrictedUntilLabel}까지 GOAT Arena 매치메이킹이 금지됩니다.${assetPenaltyNotice}${paybackPenalty} Arena 상태는 유지되고 공격자가 예치한 ${isRanked ? "학습일수" : "페이백 점수"}는 전부 소각됩니다.${packageValidity}${decisionReason}`
            : `운영자 검토 결과 경기 무결성 위반이 확인되어 신규 매치메이킹 제한이 유지됩니다.${reason ? ` 검토 메모: ${reason}` : ""}`,
    href: "/goat-arena/profile",
    sourceType: "ArenaIntegrityReview",
    sourceId,
    kind: "integrity",
    // 이상 없음 결과는 경고성 빨간 표시가 아닌, 검토 완료를 알리는
    // 주황 표시로 Arena 우편함에 보여준다.
    tone: cleared ? "review-cleared" : "integrity-alert",
    email: true,
  });
}

async function notifyArenaMatchIntegrityReviewStarted({
  matchId,
  screenedRole = "",
}) {
  if (!mongoose.isValidObjectId(matchId)) return null;
  const match = await ArenaMatch.findById(matchId)
    .select("division matchType challenger.userId defender.userId integrityStatus")
    .lean();
  if (!match || match.integrityStatus !== "SUSPICIOUS") return null;
  let normalizedRole = String(screenedRole || "").toUpperCase();
  // 배포 전에 생성됐거나 재처리되는 구형 outbox 이벤트에는 screenedRole이
  // 없을 수 있습니다. 그 경우에도 실제 DB에 기록된 잠정 승자 검사 결과를
  // 기준으로 알림 대상을 복구합니다.
  if (!["CHALLENGER", "DEFENDER"].includes(normalizedRole)) {
    const screenedEvidence = await ArenaMatchEvidence.findOne({
      matchId: match._id,
      screenedAsWinner: true,
    })
      .select("attemptId")
      .lean();
    if (screenedEvidence?.attemptId) {
      const screenedAttempt = await ArenaMatchAttempt.findById(
        screenedEvidence.attemptId
      )
        .select("role")
        .lean();
      normalizedRole = String(screenedAttempt?.role || "").toUpperCase();
    }
  }
  const participantIds = [
    match.challenger?.userId,
    match.defender?.userId,
  ].filter(Boolean);
  if (participantIds.length !== 2) return null;
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
        defensePoolEligible: false,
        reasonCode: "MATCH_INTEGRITY_REVIEW",
      },
    }
  );
  await Promise.all(
    participants.map((user) => ensureArenaNotification({
      user,
      dedupeKey: `arena-match-integrity-review-started:${match._id}:${user._id}`,
      title: "GOAT Arena 경기 검토가 시작되었습니다",
      message:
        "양측의 5문항 응시와 필수 풀이 증거 제출이 모두 끝난 뒤, 해당 경기에서 운영 확인이 필요한 신호가 감지되었습니다. 이는 어느 참가자의 부정행위도 확정한 것이 아니며, 운영자가 원칙적으로 24시간 안에 양측의 답안·풀이시간·필수 증거와 소명 자료를 함께 확인합니다. 검토가 끝날 때까지 양측의 새로운 매치메이킹과 이 경기의 Arena 상태·예치 자산 정산은 일시정지됩니다. 이상 없음으로 판정된 참가자에게는 실제 일시정지 시간만큼 현재 이용 주기의 만료·심사 시각을 연장합니다.",
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
      message: `${match.division === "MAIN" ? "Ranked" : "Unranked"} ${match.matchType === "REVENGE" ? "복수전" : "쟁탈전"}의 양측 풀이와 증거 제출이 끝났습니다. 양측 기록을 함께 검토해주세요. 내부 자동 신호 확인 대상은 ${normalizedRole === "DEFENDER" ? "방어자" : "공격자"}입니다.`,
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
    .select("division matchType integrityReviewDeadlineAt integrityScreenedRole")
    .lean();
  if (!match) return null;
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
      message: `${match.division === "MAIN" ? "Ranked" : "Unranked"} 경기의 운영 검토가 24시간 목표를 넘겼습니다. 양측 참가자에게 적용된 일시정지 시간이 계속 누적되고 있으며, 위반이 확인되지 않은 참가자에게는 실제 정지 시간 전체가 이용 기간에 보상됩니다. 즉시 검토해주세요.`,
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

async function notifyAutomaticDefenseSuspended(event) {
  const userId = event?.payload?.userId;
  if (!mongoose.isValidObjectId(userId)) return null;
  const user = await User.findById(userId).select("email name").lean();
  if (!user) return null;
  const occurrenceId = mongoose.isValidObjectId(event?.payload?.matchId)
    ? event.payload.matchId
    : event.aggregateId;
  return ensureArenaNotification({
    user,
    // 같은 사용자가 공격으로 복구된 뒤 다시 5회 미응시할 수 있으므로
    // AccessState가 아니라 제한을 발생시킨 경기별로 알림을 멱등 처리한다.
    dedupeKey: `arena-automatic-defense-suspended:${occurrenceId}`,
    title: "GOAT Arena 자동 방어 배정이 중지되었습니다",
    message:
      "자동 배정된 방어전을 5회 시작하지 않아 자동 방어 후보에서 제외되었습니다. 학습일수는 기존 이용 규정대로 매일 차감됩니다. 참가 가능한 공격을 한 번 정상적으로 신청하면 미응시 누적이 초기화되고 자동 방어 배정이 다시 활성화됩니다.",
    href: "/goat-arena",
    sourceType: "ArenaMatch",
    sourceId: occurrenceId,
    kind: "warning",
    tone: "warning",
    email: true,
  });
}

function registerArenaNotificationOutboxHandlers() {
  registerArenaOutboxHandler("ArenaMatchCreated", (event) =>
    notifyArenaMatchDefender({ matchId: event.aggregateId })
  );
  registerArenaOutboxHandler("MainFriendlyInvitationCreated", (event) =>
    notifyMainFriendlyInvitation({ invitationId: event.aggregateId })
  );
  registerArenaOutboxHandler("ArenaRevengeMatchCreated", (event) =>
    notifyArenaMatchDefender({ matchId: event.aggregateId })
  );
  registerArenaOutboxHandler("ArenaMatchSettled", (event) =>
    notifyArenaMatchResult({ matchId: event.aggregateId })
  );
  registerArenaOutboxHandler("MainInvitationOffered", (event) =>
    notifyMainInvitationOffered({
      invitationId: event.aggregateId,
      candidateUserId: event.payload?.candidateUserId,
    })
  );
  registerArenaOutboxHandler(
    "ArenaMatchIntegrityReviewStarted",
    handleMatchIntegrityReviewStarted
  );
  registerArenaOutboxHandler(
    "ArenaAutomaticDefenseSuspended",
    notifyAutomaticDefenseSuspended
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
        { "defender.userId": userId },
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
  notifyArenaMatchDefender,
  notifyArenaMatchResult,
  notifyMainFriendlyInvitation,
  notifyMainInvitationOffered,
  notifyArenaSupplementalEvidenceRequested,
  placeUserUnderArenaIntegrityReview,
  registerArenaNotificationOutboxHandlers,
};
