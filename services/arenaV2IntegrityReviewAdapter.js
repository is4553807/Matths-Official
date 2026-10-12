"use strict";

const mongoose = require("mongoose");
const {
  ArenaAccessState,
  ArenaIntegrityRiskCase,
  ArenaIntegrityRiskProfile,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
} = require("../models/goatArenaModel");
const {
  AdminActionLog,
  AdminTodo,
  User,
} = require("../models/matthsModel");
const {
  ensureArenaNotification,
} = require("./arenaNotificationService");
const {
  cancelArenaV2Match,
  settleArenaV2Match,
} = require("./arenaV2SettlementService");

const REVIEW_DECISIONS = new Set([
  "NOTE",
  "CLEAR",
  "CHALLENGER_CHEATING",
  "DEFENDER_CHEATING",
  "BOTH_CHEATING",
]);

function id(value) {
  return String(value?._id || value || "");
}

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function completedAttempt(attempt) {
  return attempt?.status === "SUBMITTED" || (
    attempt?.status === "EVIDENCE_REQUIRED" &&
    Number(attempt?.currentQuestionIndex || 0) >= 5
  );
}

function hasOriginalEvidence(evidence, attempt) {
  return evidence.some((entry) =>
    id(entry.attemptId) === id(attempt?._id) &&
    entry.originalEvidenceSubmitted !== false &&
    Array.isArray(entry.files) &&
    entry.files.length > 0
  );
}

function cheatingRoleForDecision(decision) {
  if (decision === "CHALLENGER_CHEATING") return "CHALLENGER";
  if (decision === "DEFENDER_CHEATING") return "DEFENDER";
  if (decision === "BOTH_CHEATING") return "BOTH";
  return null;
}

function actionForDecision(decision) {
  return {
    NOTE: "arena.integrity.match.note",
    CLEAR: "arena.integrity.match.cleared",
    CHALLENGER_CHEATING: "arena.integrity.match.challenger_cheating",
    DEFENDER_CHEATING: "arena.integrity.match.defender_cheating",
    BOTH_CHEATING: "arena.integrity.match.both_cheating",
  }[decision];
}

async function notifyParticipants({
  match,
  decision,
  note,
  adminUserId,
}) {
  if (decision === "NOTE") return;
  const users = await User.find({
    _id: { $in: [match.challenger?.userId, match.defender?.userId].filter(Boolean) },
  }).select("email name").lean();
  const userById = new Map(users.map((user) => [id(user._id), user]));
  const participants = [
    { role: "CHALLENGER", userId: match.challenger?.userId },
    { role: "DEFENDER", userId: match.defender?.userId },
  ];
  await Promise.all(participants.map(({ role, userId }) => {
    const user = userById.get(id(userId));
    if (!user) return null;
    const penalized = decision === "BOTH_CHEATING" ||
      decision === `${role}_CHEATING`;
    const participantCleared = decision !== "CLEAR" && !penalized;
    const title = decision === "CLEAR"
      ? "GOAT Arena 2.0 검토 결과: 이상 없음"
      : penalized
        ? "GOAT Arena 2.0 부정행위 판정"
        : "GOAT Arena 2.0 검토 결과: 상대 부정행위 확인";
    const message = decision === "CLEAR"
      ? `운영자 검토 결과 이번 경기에서 부정행위가 확인되지 않았습니다. 경기 결과는 GOAT Arena 2.0 규정에 따라 처리되었습니다.${note ? ` 검토 메모: ${note}` : ""}`
      : decision === "BOTH_CHEATING"
        ? `운영자 검토 결과 양측 모두의 부정행위가 확인되어 경기가 취소되었습니다. XP와 MMR은 변하지 않으며 5일간 신규 매칭이 제한됩니다.${note ? ` 검토 메모: ${note}` : ""}`
        : penalized
          ? `운영자 검토 결과 부정행위가 확인되어 이번 경기는 패배로 판정되었습니다. XP는 지급되지 않으며 5일간 신규 매칭이 제한됩니다.${match.gameMode === "COMPETITIVE" ? " 경쟁전 MMR은 판정 결과에 따라 반영됩니다." : ""}${note ? ` 검토 메모: ${note}` : ""}`
          : `운영자 검토 결과 상대의 부정행위가 확인되어 이번 경기는 승리로 판정되었습니다. 운영 판정 경기에는 XP가 지급되지 않습니다.${match.gameMode === "COMPETITIVE" ? " 경쟁전 MMR은 판정 결과에 따라 반영됩니다." : ""}${note ? ` 검토 메모: ${note}` : ""}`;
    return ensureArenaNotification({
      user,
      dedupeKey: `arena2-integrity-review-result:${match._id}:${decision}:${userId}`,
      title,
      message,
      href: `/goat-arena/matches/${match._id}`,
      sourceType: "ArenaIntegrityReview",
      sourceId: match._id,
      kind: "integrity",
      tone: penalized ? "integrity-alert" : "review-cleared",
      metadata: {
        arenaVersion: "2.0",
        decision: participantCleared ? "PARTICIPANT_CLEARED" : decision,
        reviewedBy: id(adminUserId),
      },
      email: true,
      emailActionLabel: "경기 결과 확인",
    });
  }));
}

async function resolveArenaV2IntegrityAccess({
  userId,
  reviewedMatchId,
  cleared,
  adminUserId,
  now,
  session,
}) {
  if (!cleared) {
    const restrictedUntil = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    await ArenaAccessState.findOneAndUpdate(
      { userId },
      {
        $set: {
          integrityStatus: "RESTRICTED",
          matchmakingRestrictedUntil: restrictedUntil,
          integrityPenaltyStartedAt: now,
          integrityPenaltyReason: "CONFIRMED_MATCH_CHEATING",
          reasonCode: "INTEGRITY_PENALTY_5_DAYS",
        },
        $setOnInsert: { userId },
      },
      { upsert: true, setDefaultsOnInsert: true, session }
    );
    await ArenaIntegrityRiskProfile.findOneAndUpdate(
      { userId },
      {
        $set: {
          status: "RESTRICTED",
          reviewedAt: now,
          reviewedBy: adminUserId,
        },
        $setOnInsert: { userId },
      },
      { upsert: true, setDefaultsOnInsert: true, session }
    );
    await User.updateOne(
      { _id: userId },
      { $inc: { warningCount: 1 } },
      { session }
    );
    return { accessReleased: false, restrictedUntil };
  }

  const openRiskCaseCount = await ArenaIntegrityRiskCase.countDocuments({
    userId,
    status: "OPEN",
  }).session(session);
  const otherFlaggedEvidenceCount = await ArenaMatchEvidence.countDocuments({
    userId,
    matchId: { $ne: reviewedMatchId },
    status: "ANOMALY_FLAGGED",
  }).session(session);
  const accessReleased = openRiskCaseCount === 0 && otherFlaggedEvidenceCount === 0;
  const integrityStatus = accessReleased ? "CLEAR" : "REVIEW_REQUIRED";
  const accessFields = {
    integrityStatus,
    integrityCaseId: null,
    reasonCode: accessReleased
      ? "INTEGRITY_REVIEW_CLEARED"
      : "INTEGRITY_REVIEW_PENDING",
  };
  if (accessReleased) {
    Object.assign(accessFields, {
      matchmakingRestrictedUntil: null,
      integrityPenaltyStartedAt: null,
      integrityPenaltyReason: "",
    });
  }
  await ArenaAccessState.findOneAndUpdate(
    { userId },
    {
      $set: accessFields,
      $setOnInsert: { userId },
    },
    { upsert: true, setDefaultsOnInsert: true, session }
  );
  await ArenaIntegrityRiskProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        status: integrityStatus,
        currentCaseId: null,
        reviewedAt: now,
        reviewedBy: adminUserId,
      },
      $setOnInsert: { userId },
    },
    { upsert: true, setDefaultsOnInsert: true, session }
  );
  return { accessReleased };
}

async function reviewHeldAsyncCompetitiveMatch({
  matchId,
  adminUserId,
  decision,
  note,
  now,
}) {
  if (!["NOTE", "CLEAR", "CHALLENGER_CHEATING"].includes(decision)) {
    throw statusError(
      400,
      "비동기 경쟁전의 과거 기록 소유자는 이번 경기 판정 대상이 아닙니다. 도전자 검토 결과만 선택해주세요."
    );
  }
  const session = await mongoose.startSession();
  let result;
  let notification = null;
  try {
    await session.withTransaction(async () => {
      const match = await ArenaMatch.findOne({
        _id: matchId,
        arenaVersion: "2.0",
        "competitiveAsync.enabled": true,
        status: "HELD",
      }).session(session);
      if (!match) throw statusError(404, "검토 중인 비동기 경쟁전을 찾을 수 없습니다.");
      const evidence = await ArenaMatchEvidence.findOne({
        matchId: match._id,
        userId: match.challenger.userId,
        originalEvidenceSubmitted: true,
      }).session(session);
      if (!evidence?.files?.length) {
        throw statusError(409, "도전자의 원본 풀이 증거를 확인할 수 없습니다.");
      }
      await AdminActionLog.create([{
        adminUserId,
        targetUserId: match.challenger.userId,
        action: actionForDecision(decision),
        detail: note,
        metadata: {
          matchId: id(match),
          arenaVersion: "2.1",
          decision,
          asynchronous: true,
          anomalyFlags: evidence.anomalyFlags || [],
        },
      }], { session });
      if (decision === "NOTE") {
        result = { matchId: id(match), status: "HELD", decision };
        return;
      }
      evidence.status = "REVIEWED";
      evidence.reviewedAt = now;
      evidence.reviewedBy = adminUserId;
      evidence.retentionHoldReason = decision === "CLEAR"
        ? `운영자 검토 완료: ${note}`
        : `GOAT Arena 2.1 도전자 부정행위 확인: ${note}`;
      await evidence.save({ session });
      await resolveArenaV2IntegrityAccess({
        userId: match.challenger.userId,
        reviewedMatchId: match._id,
        cleared: decision === "CLEAR",
        adminUserId,
        now,
        session,
      });
      match.integrityReviewCompletedAt = now;
      match.integrityStatus = "CLEAR";
      match.status = decision === "CLEAR" ? "SUBMITTED" : "RESOLVED";
      await match.save({ session });
      const {
        cancelAsyncCompetitiveMatch,
        settleAsyncCompetitiveMatch,
      } = require("./arenaAsyncCompetitiveService");
      const settlement = decision === "CLEAR"
        ? await settleAsyncCompetitiveMatch({ matchId, now, session })
        : await cancelAsyncCompetitiveMatch({
            matchId,
            now,
            reason: "INTEGRITY_CONFIRMED_CHALLENGER_CHEATING",
            session,
          });
      await AdminTodo.updateMany(
        {
          category: "integrity",
          status: "pending",
          $or: [{ sourceId: match._id }, { "metadata.matchId": id(match) }],
        },
        { $set: { status: "completed", completedAt: now, completedBy: adminUserId } },
        { session }
      );
      result = { matchId: id(match), status: settlement.status, decision, settlement };
      notification = {
        userId: match.challenger.userId,
        decision,
        matchId: match._id,
      };
    });
  } finally {
    await session.endSession();
  }
  if (notification) {
    const user = await User.findById(notification.userId).select("email name").lean();
    if (user) {
      const cheating = notification.decision === "CHALLENGER_CHEATING";
      await ensureArenaNotification({
        user,
        dedupeKey: `arena21-integrity-review-result:${notification.matchId}:${notification.decision}`,
        title: cheating ? "GOAT Arena 경쟁전 부정행위 판정" : "GOAT Arena 경쟁전 검토 결과: 이상 없음",
        message: cheating
          ? `운영자 검토 결과 부정행위가 확인되어 경기가 무효 처리되고 신규 매칭이 5일간 제한됩니다. 상대 결과와 양쪽 MMR은 변경되지 않습니다.${note ? ` 검토 메모: ${note}` : ""}`
          : `운영자 검토 결과 이상이 확인되지 않아 경쟁전 결과가 확정되었습니다.${note ? ` 검토 메모: ${note}` : ""}`,
        href: `/goat-arena/matches/${notification.matchId}`,
        sourceType: "ArenaIntegrityReview",
        sourceId: notification.matchId,
        kind: "integrity",
        tone: cheating ? "integrity-alert" : "review-cleared",
        metadata: { arenaVersion: "2.1", decision: notification.decision, reviewedBy: id(adminUserId) },
        email: true,
        emailActionLabel: "경기 결과 확인",
      });
    }
  }
  return result;
}

async function reviewHeldArenaV2Match({
  matchId,
  adminUserId,
  decision,
  note = "",
  now = new Date(),
}) {
  const normalizedDecision = String(decision || "").trim().toUpperCase();
  if (!REVIEW_DECISIONS.has(normalizedDecision)) {
    throw statusError(400, "경기 검토 결과를 선택해주세요.");
  }
  const decisionNote = String(note || "").trim().slice(0, 1000);
  if (!decisionNote) {
    throw statusError(400, "운영자 판단 근거를 기록해주세요.");
  }
  const current = new Date(now);
  const matchKind = await ArenaMatch.findById(matchId)
    .select("normalAsync competitiveAsync")
    .lean();
  if (matchKind?.normalAsync?.enabled) {
    const error = statusError(
      409,
      "일반전은 자동 부정행위 검토 대상이 아닙니다. 비정상 상태는 경기 복구 절차에서 처리해주세요."
    );
    error.code = "ARENA_NORMAL_INTEGRITY_REVIEW_DISABLED";
    throw error;
  }
  if (matchKind?.competitiveAsync?.enabled) {
    return reviewHeldAsyncCompetitiveMatch({
      matchId,
      adminUserId,
      decision: normalizedDecision,
      note: decisionNote,
      now: current,
    });
  }
  const session = await mongoose.startSession();
  let reviewPlan = null;
  try {
    await session.withTransaction(async () => {
      const match = await ArenaMatch.findOne({
        _id: matchId,
        arenaVersion: "2.0",
        status: "HELD",
      }).session(session);
      if (!match) {
        throw statusError(404, "검토 중인 GOAT Arena 2.0 경기를 찾을 수 없습니다.");
      }
      const attempts = await ArenaMatchAttempt.find({ matchId: match._id }).session(session).lean();
      const evidence = await ArenaMatchEvidence.find({ matchId: match._id }).session(session).lean();
      const attemptsFinished = attempts.length === 2 && attempts.every(completedAttempt);
      const completeInputs = attemptsFinished && attempts.every((attempt) =>
        attempt.status === "SUBMITTED" && hasOriginalEvidence(evidence, attempt)
      );
      const hasExpiredMissingEvidence = attempts.some((attempt) =>
        completedAttempt(attempt) &&
        !hasOriginalEvidence(evidence, attempt) &&
        attempt.evidenceDeadlineAt &&
        new Date(attempt.evidenceDeadlineAt).getTime() <= current.getTime()
      );
      const activeSupplementalRequest = evidence.some((entry) =>
        entry.supplementalRequest?.status === "REQUESTED" &&
        entry.supplementalRequest?.deadlineAt &&
        new Date(entry.supplementalRequest.deadlineAt).getTime() > current.getTime()
      );
      if (normalizedDecision !== "NOTE" && activeSupplementalRequest) {
        throw statusError(
          409,
          "추가 소명 자료의 24시간 제출 기한이 진행 중입니다. 제출 완료 또는 기한 종료 후 최종 판정해주세요."
        );
      }
      const cheatingRole = cheatingRoleForDecision(normalizedDecision);
      if (cheatingRole && !attemptsFinished) {
        throw statusError(
          409,
          "양측이 5문제를 모두 끝낸 뒤 부정행위 확정 정산을 진행해주세요."
        );
      }
      const participantUserIds = [
        match.challenger?.userId,
        match.defender?.userId,
      ].filter(Boolean);
      const actionUserIds = cheatingRole === "CHALLENGER"
        ? [match.challenger?.userId]
        : cheatingRole === "DEFENDER"
          ? [match.defender?.userId]
          : participantUserIds;
      for (const targetUserId of actionUserIds.filter(Boolean)) {
        await AdminActionLog.create([{
          adminUserId,
          targetUserId,
          action: actionForDecision(normalizedDecision),
          detail: decisionNote,
          metadata: {
            matchId: id(match._id),
            arenaVersion: "2.0",
            decision: normalizedDecision,
            anomalyFlags: evidence
              .filter((entry) => id(entry.userId) === id(targetUserId))
              .flatMap((entry) => entry.anomalyFlags || []),
          },
        }], { session });
      }
      if (normalizedDecision === "NOTE") {
        reviewPlan = {
          match: match.toObject(),
          result: {
            matchId: id(match._id),
            status: "HELD",
            decision: normalizedDecision,
            attemptsFinished,
            completeInputs,
          },
          terminalAction: "NONE",
        };
        return;
      }
      if (evidence.length) {
        await ArenaMatchEvidence.updateMany(
          { _id: { $in: evidence.map((entry) => entry._id) } },
          {
            $set: {
              status: "REVIEWED",
              reviewedAt: current,
              reviewedBy: adminUserId,
              retentionHoldReason: normalizedDecision === "CLEAR"
                ? `운영자 검토 완료: ${decisionNote}`
                : `GOAT Arena 2.0 부정행위 확인: ${decisionNote}`,
            },
          },
          { session }
        );
      }
      for (const role of ["CHALLENGER", "DEFENDER"]) {
        const targetUserId = role === "CHALLENGER"
          ? match.challenger?.userId
          : match.defender?.userId;
        const penalized = cheatingRole === "BOTH" || cheatingRole === role;
        await resolveArenaV2IntegrityAccess({
          userId: targetUserId,
          reviewedMatchId: match._id,
          cleared: normalizedDecision === "CLEAR" || !penalized,
          adminUserId,
          now: current,
          session,
        });
      }
      match.integrityStatus = "CLEAR";
      match.integrityReviewCompletedAt = current;
      let terminalAction = "NONE";
      let forcedWinnerRole = null;
      let reason = "";
      if (normalizedDecision === "CLEAR") {
        if (completeInputs) {
          match.status = "SUBMITTED";
          terminalAction = "SETTLE";
        } else if (attemptsFinished || hasExpiredMissingEvidence) {
          match.status = "RESOLVED";
          terminalAction = "CANCEL";
          reason = hasExpiredMissingEvidence
            ? "INTEGRITY_CLEAR_EVIDENCE_DEADLINE_EXPIRED"
            : "INTEGRITY_CLEAR_UNSCORABLE";
        } else {
          const anyStarted = attempts.some((attempt) =>
            ["IN_PROGRESS", "EVIDENCE_REQUIRED", "SUBMITTED"].includes(attempt.status)
          );
          match.status = anyStarted ? "IN_PROGRESS" : "READY";
        }
      } else if (cheatingRole === "BOTH") {
        match.status = "RESOLVED";
        terminalAction = "CANCEL";
        reason = "INTEGRITY_CONFIRMED_BOTH_CHEATING";
      } else {
        match.status = "RESOLVED";
        terminalAction = "FORCED_SETTLE";
        forcedWinnerRole = cheatingRole === "CHALLENGER" ? "DEFENDER" : "CHALLENGER";
        reason = `INTEGRITY_CONFIRMED_${cheatingRole}_CHEATING`;
      }
      await match.save({ session });
      await AdminTodo.updateMany(
        {
          category: "integrity",
          status: "pending",
          $or: [
            { sourceId: match._id },
            { "metadata.matchId": id(match._id) },
          ],
        },
        {
          $set: {
            status: "completed",
            completedAt: current,
            completedBy: adminUserId,
          },
        },
        { session }
      );
      reviewPlan = {
        match: match.toObject(),
        terminalAction,
        forcedWinnerRole,
        reason,
        result: {
          matchId: id(match._id),
          status: match.status,
          decision: normalizedDecision,
          attemptsFinished,
          completeInputs,
        },
      };
      // The operator decision, warnings and result must commit together.
      // A scoring/storage error leaves the match HELD and the review retryable.
      if (terminalAction === "CANCEL") {
        reviewPlan.result.settlement = await cancelArenaV2Match({
          matchId,
          now: current,
          reason,
          session,
        });
      } else if (terminalAction !== "NONE") {
        reviewPlan.result.settlement = await settleArenaV2Match({
          matchId,
          now: current,
          forcedWinnerRole,
          automaticReason: reason,
          session,
        });
      }
    });
  } finally {
    await session.endSession();
  }

  if (!reviewPlan || normalizedDecision === "NOTE") return reviewPlan?.result;
  await notifyParticipants({
    match: reviewPlan.match,
    decision: normalizedDecision,
    note: decisionNote,
    adminUserId,
  });
  return reviewPlan.result;
}

module.exports = {
  reviewHeldArenaV2Match,
};
