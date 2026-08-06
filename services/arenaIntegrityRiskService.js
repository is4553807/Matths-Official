const crypto = require("node:crypto");
const net = require("node:net");
const mongoose = require("mongoose");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaIntegrityLinkSignal,
  ArenaIntegrityRiskCase,
  ArenaIntegrityRiskProfile,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
  ArenaProblemPack,
  ArenaStanding,
  ArenaStandingChangeLedger,
} = require("../models/goatArenaModel");
const {
  AdminActionLog,
  AdminTodo,
  User,
} = require("../models/matthsModel");
const { createAdminTodo } = require("./adminTodoService");
const { withSchedulerLease } = require("./schedulerLeaseService");
const { scoreArenaAttempt } = require("./arenaMatchScoringService");
const { settleArenaMatch } = require("./arenaMatchSettlementService");
const {
  addMatchTransfer,
  burnAvailable,
  settleLocked,
} = require("./mainLearningDayService");
const {
  finalizeExpiredAccessCycle,
} = require("./accessCycleDailyService");
const {
  createRankUpPresentationsForSettlement,
} = require("./arenaRankUpPresentationService");
const {
  notifyArenaIntegrityReviewOverdue,
  notifyArenaIntegrityReviewResult,
  notifyArenaSupplementalEvidenceRequested,
  placeUserUnderArenaIntegrityReview,
} = require("./arenaNotificationService");
const {
  mainNormalMatchStakes,
} = require("./mainNormalMatchEconomyService");
const {
  TIER_ORDER,
} = require("./arenaOneOnOneDifficultyPolicy");

const POLICY_VERSION = "ARENA-INTEGRITY-RISK-V1";
const REVIEW_THRESHOLD = 40;
const CRITICAL_THRESHOLD = 75;
const RISK_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const SUPPLEMENTAL_EVIDENCE_TARGET_MS = 24 * 60 * 60 * 1000;
const SIGNAL_TTL_DAYS = Object.freeze({
  DEVICE_TOKEN: 180,
  BROWSER_SIGNATURE: 90,
  NETWORK_ADDRESS: 30,
  NETWORK_BUCKET: 30,
  PAYMENT_INSTRUMENT: 730,
  PAYBACK_ACCOUNT: 730,
});
const TRUSTED_SIGNAL_TYPES = new Set([
  "PAYMENT_INSTRUMENT",
  "PAYBACK_ACCOUNT",
]);
const MATCH_STATUSES_FOR_RISK = [
  "SETTLED",
  "INSURED_CANCELLED",
  "HELD",
  "INVALID",
];
const SESSION_SIGNAL_WRITE_THROTTLE_MS = 10 * 60 * 1000;
const MAX_SIGNAL_WRITE_CACHE_ENTRIES = 10000;
const RAPID_SUBMISSION_THRESHOLD_MS = 5 * 60 * 1000;

let schedulerTimer = null;
let schedulerRunning = false;
const signalWriteCache = new Map();

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function isHigherArenaTier(leftRank, rightRank) {
  return TIER_ORDER.indexOf(String(leftRank || "").toUpperCase()) >
    TIER_ORDER.indexOf(String(rightRank || "").toUpperCase());
}

function integritySecret() {
  const secret = String(
    process.env.ARENA_INTEGRITY_SECRET || process.env.SECRET || ""
  );
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("ARENA_INTEGRITY_SECRET 또는 SECRET 환경변수가 필요합니다.");
  }
  return secret || "matths-local-arena-integrity-key";
}

function hashIntegritySignal(signalType, rawValue) {
  const normalized = String(rawValue || "").normalize("NFKC").trim();
  if (!normalized) return "";
  return crypto
    .createHmac("sha256", integritySecret())
    .update(`${POLICY_VERSION}:${signalType}:${normalized}`)
    .digest("hex");
}

function normalizeIp(value) {
  let ip = String(value || "").trim().toLowerCase();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") return "127.0.0.1";
  return net.isIP(ip) ? ip : "";
}

function networkBucket(value) {
  const ip = normalizeIp(value);
  if (!ip) return "";
  if (net.isIP(ip) === 4) return `${ip.split(".").slice(0, 3).join(".")}.0/24`;
  const parts = ip.split(":");
  return `${parts.slice(0, 4).join(":")}::/64`;
}

function validDeviceToken(value) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : "";
}

async function upsertIntegritySignal({
  userId,
  signalType,
  rawValue,
  sourceType,
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(userId) || !SIGNAL_TTL_DAYS[signalType]) return null;
  const signalHash = hashIntegritySignal(signalType, rawValue);
  if (!signalHash) return null;
  const current = new Date(now);
  const cacheKey = `${userId}:${signalType}:${signalHash}`;
  if (
    sourceType === "SESSION_HEARTBEAT" &&
    current.getTime() - Number(signalWriteCache.get(cacheKey) || 0) <
      SESSION_SIGNAL_WRITE_THROTTLE_MS
  ) {
    return { cached: true };
  }
  const expiresAt = new Date(
    current.getTime() + SIGNAL_TTL_DAYS[signalType] * DAY_MS
  );
  const signal = await ArenaIntegrityLinkSignal.findOneAndUpdate(
    { userId, signalType, signalHash },
    {
      $set: { lastSeenAt: current, expiresAt, sourceType },
      $setOnInsert: { firstSeenAt: current },
      $inc: { occurrences: 1 },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
  if (sourceType === "SESSION_HEARTBEAT") {
    signalWriteCache.set(cacheKey, current.getTime());
    if (signalWriteCache.size > MAX_SIGNAL_WRITE_CACHE_ENTRIES) {
      signalWriteCache.delete(signalWriteCache.keys().next().value);
    }
  }
  return signal;
}

async function recordConnectionIntegritySignals({
  userId,
  deviceToken,
  ip,
  userAgent,
  acceptLanguage,
  now = new Date(),
}) {
  const token = validDeviceToken(deviceToken);
  const address = normalizeIp(ip);
  const bucket = networkBucket(address);
  const browserParts = [
    String(userAgent || "").slice(0, 500),
    String(acceptLanguage || "").slice(0, 200),
  ];
  const browser = browserParts.some((part) => part.trim())
    ? browserParts.join("|")
    : "";
  const signals = [
    token && ["DEVICE_TOKEN", token],
    browser && ["BROWSER_SIGNATURE", browser],
    address && ["NETWORK_ADDRESS", address],
    bucket && ["NETWORK_BUCKET", bucket],
  ].filter(Boolean);
  await Promise.all(
    signals.map(([signalType, rawValue]) =>
      upsertIntegritySignal({
        userId,
        signalType,
        rawValue,
        sourceType: "SESSION_HEARTBEAT",
        now,
      })
    )
  );
  return { recordedSignalCount: signals.length };
}

async function recordTrustedIntegritySignal({
  userId,
  signalType,
  rawValue,
  sourceType = "TRUSTED_EXTERNAL_PROVIDER",
  now = new Date(),
}) {
  if (!TRUSTED_SIGNAL_TYPES.has(signalType)) {
    throw statusError(400, "신뢰 연동 신호 종류를 확인해주세요.", "INVALID_TRUSTED_SIGNAL_TYPE");
  }
  return upsertIntegritySignal({ userId, signalType, rawValue, sourceType, now });
}

function id(value) {
  return value == null ? "" : String(value);
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(id))];
}

function opponentFor(match, userId) {
  const subject = id(userId);
  if (id(match?.challenger?.userId) === subject) {
    return { opponentId: id(match?.defender?.userId), role: "CHALLENGER" };
  }
  if (id(match?.defender?.userId) === subject) {
    return { opponentId: id(match?.challenger?.userId), role: "DEFENDER" };
  }
  return null;
}

function normalizedAnswerSignature(attempt) {
  return (attempt?.answers || [])
    .map((answer) => String(answer?.value || "").normalize("NFKC").replace(/\s+/g, ""))
    .filter(Boolean);
}

function riskLevel(score) {
  if (score >= CRITICAL_THRESHOLD) return "CRITICAL";
  if (score >= REVIEW_THRESHOLD) return "HIGH";
  if (score >= 20) return "MEDIUM";
  return "LOW";
}

function calculateArenaIntegrityRisk({
  userId,
  matches = [],
  attempts = [],
  transfers = [],
  sharedSignals = [],
  identityLinkedUserIds = [],
  now = new Date(),
}) {
  const subject = id(userId);
  const attemptByMatchRole = new Map();
  for (const attempt of attempts) {
    attemptByMatchRole.set(`${id(attempt.matchId)}:${attempt.role}`, attempt);
  }
  const pairStats = new Map();
  let last24hVolume = 0;
  const nowMs = new Date(now).getTime();
  for (const match of matches) {
    const pairing = opponentFor(match, subject);
    if (!pairing?.opponentId) continue;
    const matchId = id(match._id || match.id);
    const stats = pairStats.get(pairing.opponentId) || {
      opponentId: pairing.opponentId,
      matchIds: [],
      noShows: 0,
      zeroScoreLosses: 0,
      identicalWrongPatterns: 0,
      rapidSubmissions: 0,
    };
    stats.matchIds.push(matchId);
    const matchTime = new Date(
      match.settledAt || match.resolvedAt || match.updatedAt || match.createdAt || 0
    ).getTime();
    if (Number.isFinite(matchTime) && nowMs - matchTime <= DAY_MS) last24hVolume += 1;
    if ([pairing.role, "BOTH"].includes(match.noShowRole)) stats.noShows += 1;
    const ownAttempt = attemptByMatchRole.get(`${matchId}:${pairing.role}`);
    const opponentRole = pairing.role === "CHALLENGER" ? "DEFENDER" : "CHALLENGER";
    const otherAttempt = attemptByMatchRole.get(`${matchId}:${opponentRole}`);
    if (
      Number(ownAttempt?.correctCount) === 0 &&
      match.winnerRole &&
      match.winnerRole !== pairing.role
    ) {
      stats.zeroScoreLosses += 1;
    }
    if (
      Number(ownAttempt?.activeSolveTimeMs) > 0 &&
      Number(ownAttempt.activeSolveTimeMs) < RAPID_SUBMISSION_THRESHOLD_MS
    ) {
      stats.rapidSubmissions += 1;
    }
    const ownAnswers = normalizedAnswerSignature(ownAttempt);
    const otherAnswers = normalizedAnswerSignature(otherAttempt);
    const equalAnswerCount = ownAnswers.filter(
      (answer, index) => answer && answer === otherAnswers[index]
    ).length;
    if (
      ownAnswers.length >= 4 &&
      otherAnswers.length >= 4 &&
      equalAnswerCount >= 4 &&
      Number(ownAttempt?.correctCount || 0) <= 1 &&
      Number(otherAttempt?.correctCount || 0) <= 1
    ) {
      stats.identicalWrongPatterns += 1;
    }
    pairStats.set(pairing.opponentId, stats);
  }

  const sharedByOpponent = new Map();
  for (const entry of sharedSignals) {
    sharedByOpponent.set(id(entry.opponentUserId), new Set(entry.signalTypes || []));
  }
  const reasons = [];
  const addReason = ({ code, label, description, points, count, opponentId, matchIds }) => {
    reasons.push({
      code,
      label,
      description,
      points,
      count: Number(count) || 0,
      relatedUserIds: opponentId ? [opponentId] : [],
      relatedMatchIds: unique(matchIds || []),
    });
  };

  for (const stats of pairStats.values()) {
    const count = stats.matchIds.length;
    if (count >= 5) {
      addReason({ code: "REPEATED_PAIR_MATCHES", label: "같은 상대와 반복 경기", description: `30일 동안 같은 상대와 ${count}회 경기했습니다.`, points: 20, count, opponentId: stats.opponentId, matchIds: stats.matchIds });
    } else if (count >= 3) {
      addReason({ code: "REPEATED_PAIR_MATCHES", label: "같은 상대와 반복 경기", description: `30일 동안 같은 상대와 ${count}회 경기했습니다.`, points: 10, count, opponentId: stats.opponentId, matchIds: stats.matchIds });
    }
    const signalTypes = sharedByOpponent.get(stats.opponentId) || new Set();
    if (signalTypes.has("PAYBACK_ACCOUNT") && count >= 1) {
      addReason({ code: "SHARED_PAYBACK_ACCOUNT", label: "같은 페이백 계좌 연관 신호", description: "상대 계정과 동일한 페이백 계좌 연관 신호가 확인되었습니다.", points: 45, count, opponentId: stats.opponentId, matchIds: stats.matchIds });
    }
    if (signalTypes.has("PAYMENT_INSTRUMENT") && count >= 1) {
      addReason({ code: "SHARED_PAYMENT_INSTRUMENT", label: "같은 결제수단 연관 신호", description: "상대 계정과 동일한 결제수단 연관 신호가 확인되었습니다.", points: 35, count, opponentId: stats.opponentId, matchIds: stats.matchIds });
    }
    if (signalTypes.has("DEVICE_TOKEN") && count >= 2) {
      addReason({ code: "SHARED_DEVICE", label: "같은 기기 연관 신호와 반복 경기", description: "같은 기기 연관 신호를 가진 상대와 반복 경기했습니다.", points: 30, count, opponentId: stats.opponentId, matchIds: stats.matchIds });
    }
    if (signalTypes.has("BROWSER_SIGNATURE") && count >= 3) {
      addReason({ code: "SHARED_BROWSER", label: "같은 브라우저 환경과 반복 경기", description: "같은 브라우저 환경 신호를 가진 상대와 반복 경기했습니다.", points: 15, count, opponentId: stats.opponentId, matchIds: stats.matchIds });
    }
    if (signalTypes.has("NETWORK_ADDRESS") && count >= 3) {
      addReason({ code: "SHARED_NETWORK", label: "같은 네트워크와 반복 경기", description: "같은 네트워크 연관 신호를 가진 상대와 반복 경기했습니다.", points: 15, count, opponentId: stats.opponentId, matchIds: stats.matchIds });
    } else if (signalTypes.has("NETWORK_BUCKET") && count >= 3) {
      addReason({ code: "SHARED_NETWORK_RANGE", label: "인접 네트워크와 반복 경기", description: "인접 네트워크 범위 신호를 가진 상대와 반복 경기했습니다.", points: 10, count, opponentId: stats.opponentId, matchIds: stats.matchIds });
    }
    if (identityLinkedUserIds.map(id).includes(stats.opponentId)) {
      addReason({ code: "SHARED_IDENTITY", label: "동일 신원 연관 계정과 경기", description: "실명·생년월일·고등학교 해시가 같은 계정과 경기했습니다.", points: 40, count, opponentId: stats.opponentId, matchIds: stats.matchIds });
    }
    if (stats.noShows >= 2) {
      addReason({ code: "REPEATED_NO_SHOW", label: "특정 상대 반복 미응답", description: `같은 상대 경기에서 ${stats.noShows}회 미응답이 확인되었습니다.`, points: 25, count: stats.noShows, opponentId: stats.opponentId, matchIds: stats.matchIds });
    }
    if (stats.zeroScoreLosses >= 3) {
      addReason({ code: "REPEATED_ZERO_SCORE_LOSS", label: "특정 상대 반복 무득점 패배", description: `같은 상대에게 정답 0개로 ${stats.zeroScoreLosses}회 패배했습니다.`, points: 20, count: stats.zeroScoreLosses, opponentId: stats.opponentId, matchIds: stats.matchIds });
    }
    if (stats.identicalWrongPatterns >= 2) {
      addReason({ code: "IDENTICAL_WRONG_ANSWERS", label: "반복되는 동일 오답 패턴", description: "두 계정의 낮은 정답률과 동일 답안 패턴이 반복되었습니다.", points: 15, count: stats.identicalWrongPatterns, opponentId: stats.opponentId, matchIds: stats.matchIds });
    }
    if (stats.rapidSubmissions >= 2) {
      addReason({ code: "REPEATED_RAPID_SUBMISSION", label: "반복되는 빠른 제출", description: `5분 미만 제출이 ${stats.rapidSubmissions}회 확인되어 관리자 검토가 필요합니다.`, points: 15, count: stats.rapidSubmissions, opponentId: stats.opponentId, matchIds: stats.matchIds });
    }
  }

  const transferByRecipient = new Map();
  for (const transfer of transfers) {
    const recipientId = id(transfer.recipientUserId || transfer.userId);
    if (!recipientId || recipientId === subject) continue;
    const current = transferByRecipient.get(recipientId) || { count: 0, days: 0, matchIds: [] };
    current.count += 1;
    current.days += Math.max(0, Number(transfer.days || transfer.availableLearningDaysDelta) || 0);
    if (transfer.matchId || transfer.sourceId) current.matchIds.push(id(transfer.matchId || transfer.sourceId));
    transferByRecipient.set(recipientId, current);
  }
  for (const [recipientId, stats] of transferByRecipient) {
    if (stats.count >= 3 && stats.days >= 3) {
      addReason({ code: "ONE_WAY_LEARNING_DAY_TRANSFER", label: "한 방향 학습일수 이전", description: `같은 상대에게 ${stats.count}회, 합계 ${stats.days}일이 이전되었습니다.`, points: 25, count: stats.count, opponentId: recipientId, matchIds: stats.matchIds });
    }
  }
  if (last24hVolume >= 20) {
    addReason({ code: "EXTREME_DAILY_MATCH_VOLUME", label: "비정상적으로 많은 단기 경기", description: `최근 24시간에 ${last24hVolume}경기가 확인되었습니다.`, points: 30, count: last24hVolume, matchIds: matches.map((match) => match._id || match.id) });
  } else if (last24hVolume >= 12) {
    addReason({ code: "HIGH_DAILY_MATCH_VOLUME", label: "많은 단기 경기", description: `최근 24시간에 ${last24hVolume}경기가 확인되었습니다.`, points: 15, count: last24hVolume, matchIds: matches.map((match) => match._id || match.id) });
  }

  const score = Math.min(100, reasons.reduce((sum, reason) => sum + reason.points, 0));
  return {
    riskScore: score,
    riskLevel: riskLevel(score),
    reviewRequired: score >= REVIEW_THRESHOLD,
    reasons,
    signalCodes: unique(reasons.map((reason) => reason.code)),
    linkedUserIds: unique(reasons.flatMap((reason) => reason.relatedUserIds)),
    relatedMatchIds: unique(reasons.flatMap((reason) => reason.relatedMatchIds)),
    windowStartedAt: new Date(nowMs - RISK_WINDOW_DAYS * DAY_MS),
    windowEndedAt: new Date(now),
    policyVersion: POLICY_VERSION,
  };
}

function stableEvidenceHash(result) {
  const stable = {
    policyVersion: result.policyVersion,
    riskScore: result.riskScore,
    reasons: result.reasons.map((reason) => ({
      code: reason.code,
      count: reason.count,
      points: reason.points,
      relatedUserIds: unique(reason.relatedUserIds).sort(),
      relatedMatchIds: unique(reason.relatedMatchIds).sort(),
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  };
  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

async function loadSharedSignals({ userId, opponentIds, now }) {
  if (!opponentIds.length) return [];
  const own = await ArenaIntegrityLinkSignal.find({ userId, expiresAt: { $gt: now } })
    .select("signalType +signalHash")
    .lean();
  if (!own.length) return [];
  const keys = own.map((entry) => ({ signalType: entry.signalType, signalHash: entry.signalHash }));
  const linked = await ArenaIntegrityLinkSignal.find({
    userId: { $in: opponentIds },
    expiresAt: { $gt: now },
    $or: keys,
  })
    .select("userId signalType")
    .lean();
  const byOpponent = new Map();
  for (const entry of linked) {
    const opponentId = id(entry.userId);
    const types = byOpponent.get(opponentId) || new Set();
    types.add(entry.signalType);
    byOpponent.set(opponentId, types);
  }
  return [...byOpponent].map(([opponentUserId, types]) => ({
    opponentUserId,
    signalTypes: [...types],
  }));
}

async function evaluateArenaIntegrityRiskForUser({ userId, now = new Date() }) {
  if (!mongoose.isValidObjectId(userId)) return null;
  const current = new Date(now);
  const since = new Date(current.getTime() - RISK_WINDOW_DAYS * DAY_MS);
  const matches = await ArenaMatch.find({
    status: { $in: MATCH_STATUSES_FOR_RISK },
    updatedAt: { $gte: since },
    $or: [{ "challenger.userId": userId }, { "defender.userId": userId }],
  }).lean();
  const matchIds = matches.map((match) => match._id);
  const opponentIds = unique(
    matches.map((match) => opponentFor(match, userId)?.opponentId)
  );
  const [attempts, transfers, sharedSignals, subject, opponents] = await Promise.all([
    matchIds.length
      ? ArenaMatchAttempt.find({ matchId: { $in: matchIds } }).lean()
      : [],
    matchIds.length
      ? ArenaLearningDayLedger.find({
          sourceId: { $in: matchIds },
          eventType: "MATCH_SETTLEMENT_TRANSFER",
          availableLearningDaysDelta: { $gt: 0 },
        })
          .select("userId sourceId availableLearningDaysDelta")
          .lean()
      : [],
    loadSharedSignals({ userId, opponentIds, now: current }),
    User.findById(userId).select("+identityMatchHash").lean(),
    opponentIds.length
      ? User.find({ _id: { $in: opponentIds } }).select("_id +identityMatchHash").lean()
      : [],
  ]);
  const identityLinkedUserIds = subject?.identityMatchHash
    ? opponents
        .filter((opponent) => opponent.identityMatchHash === subject.identityMatchHash)
        .map((opponent) => opponent._id)
    : [];
  const result = calculateArenaIntegrityRisk({
    userId,
    matches,
    attempts,
    transfers: transfers.map((entry) => ({
      recipientUserId: entry.userId,
      matchId: entry.sourceId,
      days: entry.availableLearningDaysDelta,
    })),
    sharedSignals,
    identityLinkedUserIds,
    now: current,
  });
  const evidenceHash = stableEvidenceHash(result);
  const existing = await ArenaIntegrityRiskProfile.findOne({ userId }).lean();
  let status = existing?.status || "CLEAR";
  let currentCaseId = existing?.currentCaseId || null;

  if (
    result.reviewRequired &&
    status !== "RESTRICTED" &&
    evidenceHash !== existing?.lastReviewedEvidenceHash
  ) {
    const riskCase = await ArenaIntegrityRiskCase.findOneAndUpdate(
      { activeCaseKey: `arena-integrity:${userId}` },
      {
        $set: {
          userId,
          status: "OPEN",
          riskScore: result.riskScore,
          riskLevel: result.riskLevel,
          reasons: result.reasons,
          linkedUserIds: result.linkedUserIds,
          relatedMatchIds: result.relatedMatchIds,
          windowStartedAt: result.windowStartedAt,
          windowEndedAt: result.windowEndedAt,
          policyVersion: POLICY_VERSION,
          evidenceHash,
        },
        $setOnInsert: { activeCaseKey: `arena-integrity:${userId}` },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    status = "REVIEW_REQUIRED";
    currentCaseId = riskCase._id;
    await Promise.all([
      ArenaAccessState.updateOne(
        { userId },
        {
          $set: {
            integrityStatus: "REVIEW_REQUIRED",
            integrityCaseId: riskCase._id,
          },
        }
      ),
      createAdminTodo({
        category: "integrity",
        title: "GOAT Arena 계정·경기 연관성 검토 필요",
        description: `장기 무결성 위험 점수 ${result.riskScore}점으로 관리자 검토가 필요합니다. 자동 제재는 적용되지 않았습니다.`,
        href: `/admin/arena-matches#integrity-case-${riskCase._id}`,
        targetUserId: userId,
        actorUserId: userId,
        sourceType: "ArenaIntegrityRiskCase",
        sourceId: riskCase._id,
        metadata: {
          policyVersion: POLICY_VERSION,
          riskScore: result.riskScore,
          signalCodes: result.signalCodes,
        },
      }),
    ]);
    await placeUserUnderArenaIntegrityReview({
      userId,
      reasonKey: id(riskCase._id),
    });
  }

  await ArenaIntegrityRiskProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        status,
        riskScore: result.riskScore,
        riskLevel: result.riskLevel,
        signalCodes: result.signalCodes,
        linkedUserIds: result.linkedUserIds,
        relatedMatchIds: result.relatedMatchIds,
        windowStartedAt: result.windowStartedAt,
        windowEndedAt: result.windowEndedAt,
        evaluatedAt: current,
        policyVersion: POLICY_VERSION,
        evidenceHash,
        currentCaseId,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
  return { ...result, evidenceHash, status, currentCaseId };
}

async function reviewArenaIntegrityCase({
  caseId,
  adminUserId,
  decision,
  note = "",
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(caseId)) {
    throw statusError(404, "무결성 검토 건을 찾을 수 없습니다.");
  }
  if (!["CLEAR", "RESTRICT"].includes(decision)) {
    throw statusError(400, "검토 결과를 선택해주세요.");
  }
  const decisionNote = String(note || "").trim().slice(0, 1000);
  if (!decisionNote) {
    throw statusError(400, "운영자 판단 근거를 기록해주세요.");
  }
  const riskCase = await ArenaIntegrityRiskCase.findOne({
    _id: caseId,
    status: "OPEN",
  });
  if (!riskCase) throw statusError(404, "진행 중인 무결성 검토 건을 찾을 수 없습니다.");
  const cleared = decision === "CLEAR";
  riskCase.status = cleared ? "CLEARED" : "CONFIRMED";
  riskCase.activeCaseKey = undefined;
  riskCase.reviewedAt = now;
  riskCase.reviewedBy = adminUserId;
  riskCase.decisionNote = decisionNote;
  await riskCase.save();

  const accessState = await ArenaAccessState.findOne({ userId: riskCase.userId }).lean();
  const [otherOpenRiskCase, unresolvedEvidenceCount] = cleared
    ? await Promise.all([
        ArenaIntegrityRiskCase.findOne({
          userId: riskCase.userId,
          status: "OPEN",
          _id: { $ne: riskCase._id },
        }).select("_id").lean(),
        ArenaMatchEvidence.countDocuments({
          userId: riskCase.userId,
          status: "ANOMALY_FLAGGED",
        }),
      ])
    : [null, 0];
  const accessReleased = Boolean(
    cleared && !otherOpenRiskCase && unresolvedEvidenceCount === 0
  );
  const restoreDefensePool = Boolean(
    accessReleased &&
      accessState?.state === "PAID_ACTIVE" &&
      accessState?.currentSeasonPlacementCompleted
  );
  const nextIntegrityStatus = cleared
    ? accessReleased
      ? "CLEAR"
      : "REVIEW_REQUIRED"
    : "RESTRICTED";
  await Promise.all([
    ArenaIntegrityRiskProfile.updateOne(
      { userId: riskCase.userId },
      {
        $set: {
          status: nextIntegrityStatus,
          lastReviewedEvidenceHash: riskCase.evidenceHash,
          currentCaseId: otherOpenRiskCase?._id || null,
          reviewedAt: now,
          reviewedBy: adminUserId,
        },
      }
    ),
    ArenaAccessState.updateOne(
      { userId: riskCase.userId },
      {
        $set: {
          integrityStatus: nextIntegrityStatus,
          integrityCaseId: otherOpenRiskCase?._id || null,
          defensePoolEligible: cleared
            ? accessReleased
              ? restoreDefensePool
              : Boolean(accessState?.defensePoolEligible)
            : false,
        },
      }
    ),
    AdminTodo.updateOne(
      { sourceType: "ArenaIntegrityRiskCase", sourceId: riskCase._id },
      {
        $set: {
          status: "completed",
          completedAt: now,
          completedBy: adminUserId,
        },
      }
    ),
  ]);
  await AdminActionLog.create({
    adminUserId,
    targetUserId: riskCase.userId,
    action: cleared ? "arena.integrity.case.cleared" : "arena.integrity.case.restricted",
    detail: riskCase.decisionNote || (cleared ? "이상 없음" : "무결성 위험 확인"),
    metadata: { caseId: id(riskCase._id), decision },
  });
  await notifyArenaIntegrityReviewResult({
    userId: riskCase.userId,
    sourceId: riskCase._id,
    decision,
    note: riskCase.decisionNote,
    accessReleased,
  });
  return {
    caseId: id(riskCase._id),
    status: riskCase.status,
    accessReleased,
  };
}

async function resolveIntegrityAccessAfterMatchReview({
  userId,
  reviewedMatchId,
  division,
  cleared,
  session,
  now,
  adminUserId,
}) {
  if (!mongoose.isValidObjectId(userId)) return;
  if (!cleared) {
    const restrictedUntil = new Date(now.getTime() + 5 * DAY_MS);
    const accessPenaltyUpdate = {
      $set: {
        integrityStatus: "RESTRICTED",
        defensePoolEligible: false,
        matchmakingRestrictedUntil: restrictedUntil,
        integrityPenaltyStartedAt: now,
        integrityPenaltyReason: "CONFIRMED_MATCH_CHEATING",
        reasonCode: "INTEGRITY_PENALTY_5_DAYS",
      },
    };
    if (String(division || "").toUpperCase() === "SUB") {
      accessPenaltyUpdate.$set.paybackDisqualifiedAt = now;
    } else {
      accessPenaltyUpdate.$unset = { paybackDisqualifiedAt: 1 };
    }
    await ArenaAccessState.updateOne(
      { userId },
      accessPenaltyUpdate,
      { session }
    );
    await ArenaIntegrityRiskProfile.updateOne(
      { userId },
      { $set: { status: "RESTRICTED", reviewedAt: now, reviewedBy: adminUserId } },
      { session }
    );
    return {
      accessReleased: false,
      restricted: true,
      restrictedUntil,
    };
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
  if (openRiskCaseCount || otherFlaggedEvidenceCount) {
    return {
      accessReleased: false,
      pendingReview: true,
      openRiskCaseCount,
      otherFlaggedEvidenceCount,
    };
  }

  const accessState = await ArenaAccessState.findOne({ userId }).session(session).lean();
  const restoreDefensePool = Boolean(
    accessState?.state === "PAID_ACTIVE" &&
    accessState?.currentSeasonPlacementCompleted
  );
  await ArenaAccessState.updateOne(
    { userId },
    {
      $set: {
        integrityStatus: "CLEAR",
        integrityCaseId: null,
        defensePoolEligible: restoreDefensePool,
        matchmakingRestrictedUntil: null,
        integrityPenaltyStartedAt: null,
        integrityPenaltyReason: "",
        reasonCode: "INTEGRITY_REVIEW_CLEARED",
      },
    },
    { session }
  );
  await ArenaIntegrityRiskProfile.updateOne(
    { userId },
    {
      $set: {
        status: "CLEAR",
        currentCaseId: null,
        reviewedAt: now,
        reviewedBy: adminUserId,
      },
    },
    { session }
  );
  return { accessReleased: true, pendingReview: false };
}

const INTEGRITY_SETTLEMENT_VERSION = "ARENA-INTEGRITY-SETTLEMENT-V1";
const INTEGRITY_CLEAR_CANCELLATION_VERSION =
  "ARENA-INTEGRITY-CLEAR-CANCELLATION-V1";

function arenaTuple(value) {
  return {
    arenaRank: String(value?.arenaRank || ""),
    arenaPosition: Number(value?.arenaPosition || 0),
    arenaGp: Number(value?.arenaGp || 0),
  };
}

function arenaTuplesEqual(left, right) {
  const a = arenaTuple(left);
  const b = arenaTuple(right);
  return a.arenaRank === b.arenaRank &&
    a.arenaPosition === b.arenaPosition &&
    a.arenaGp === b.arenaGp;
}

function cycleBalance(cycle) {
  return {
    availableLearningDays: Number(cycle.availableLearningDays || 0),
    paybackScoreDays: Number(cycle.paybackScoreDays || 0),
    lockedPaybackScoreDays: Number(cycle.lockedPaybackScoreDays || 0),
    lockedLearningDays: Number(cycle.lockedLearningDays || 0),
    reservedLearningDays: Number(cycle.reservedLearningDays || 0),
  };
}

function integrityPenaltyAmount(balance) {
  const normalized = Math.max(0, Number(balance || 0));
  // GP와 학습일수는 정수로만 관리한다. 1·2 단위 잔액도 제재를 회피하지
  // 않도록 1/3은 정수 단위로 올림해 적용한다.
  return normalized > 0 ? Math.ceil(normalized / 3) : 0;
}

async function compensateIntegrityPauseForRoles({
  match,
  evidence,
  roles,
  session,
  now,
}) {
  const compensatedRoles = unique(roles)
    .map((role) => String(role || "").toUpperCase())
    .filter((role) => ["CHALLENGER", "DEFENDER"].includes(role));
  if (!compensatedRoles.length) {
    return { compensationMs: 0, compensations: [], replayed: false };
  }
  if (match.integrityPauseCompensatedAt) {
    return {
      compensationMs: Number(match.integrityPauseCompensationMs || 0),
      compensations: compensatedRoles.map((role) => ({
        role,
        userId: id(
          role === "DEFENDER"
            ? match.defender?.userId
            : match.challenger?.userId
        ),
        compensationMs: Number(match.integrityPauseCompensationMs || 0),
      })),
      replayed: true,
    };
  }
  const screenedEvidence = evidence.find((entry) => entry.screenedAsWinner) ||
    evidence.find(
      (entry) => entry.status === "ANOMALY_FLAGGED" || entry.anomalyFlags?.length
    );
  const screenedAttempt = screenedEvidence
    ? await ArenaMatchAttempt.findById(screenedEvidence.attemptId)
        .select("role")
        .session(session)
        .lean()
    : null;
  const screenedRole = String(
    match.integrityScreenedRole || screenedAttempt?.role || ""
  ).toUpperCase();
  const reviewStartedAt = new Date(
    match.integrityReviewStartedAt ||
      screenedEvidence?.submittedAt ||
      match.updatedAt ||
      now
  );
  const compensationMs = Math.max(
    0,
    new Date(now).getTime() - reviewStartedAt.getTime()
  );
  if (!compensationMs) {
    if (["CHALLENGER", "DEFENDER"].includes(screenedRole)) {
      match.integrityScreenedRole = screenedRole;
    }
    match.integrityPauseCompensationMs = 0;
    match.integrityPauseCompensatedAt = now;
    return {
      compensationMs: 0,
      compensations: compensatedRoles.map((role) => ({
        role,
        userId: id(
          role === "DEFENDER"
            ? match.defender?.userId
            : match.challenger?.userId
        ),
        compensationMs: 0,
      })),
      replayed: false,
    };
  }
  const compensations = [];
  for (const role of compensatedRoles) {
    const userId = role === "DEFENDER"
      ? match.defender?.userId
      : match.challenger?.userId;
    const accessCycleId = role === "DEFENDER"
      ? match.defender?.accessCycleId
      : match.challenger?.accessCycleId;
    const cycle = await AccessCycle.findById(accessCycleId).session(session).lean();
    if (!cycle || cycle.evaluatedAt) {
      throw statusError(
        409,
        `${role === "DEFENDER" ? "방어자" : "공격자"}의 무혐의 검토 시간을 반영할 이용 주기를 확인할 수 없습니다.`
      );
    }
    const expiresAt = new Date(
      new Date(cycle.expiresAt).getTime() + compensationMs
    );
    const evaluationAt = new Date(
      new Date(cycle.evaluationAt).getTime() + compensationMs
    );
    const updatedCycle = await AccessCycle.findOneAndUpdate(
      {
        _id: cycle._id,
        status: { $in: ["ACTIVE", "EXPIRED"] },
        evaluatedAt: null,
        expiresAt: cycle.expiresAt,
        evaluationAt: cycle.evaluationAt,
      },
      {
        $set: {
          status: expiresAt > now ? "ACTIVE" : cycle.status,
          expiresAt,
          evaluationAt,
        },
        $inc: { integrityReviewCompensationMs: compensationMs },
      },
      { returnDocument: "after", session }
    ).lean();
    if (!updatedCycle) {
      throw statusError(
        409,
        `${role === "DEFENDER" ? "방어자" : "공격자"}의 무혐의 검토 시간 보상이 다른 이용 주기 변경과 충돌했습니다.`
      );
    }
    if (expiresAt > now) {
      await ArenaAccessState.updateOne(
        {
          userId,
          state: { $in: ["PAID_ACTIVE", "PAID_EXPIRED"] },
        },
        {
          $set: {
            state: "PAID_ACTIVE",
            accessCycleId: cycle._id,
          },
        },
        { session }
      );
    }
    await ArenaLearningDayLedger.findOneAndUpdate(
      {
        idempotencyKey:
          `${match._id}:INTEGRITY_REVIEW_TIME_COMPENSATION:${role}`,
      },
      {
        $setOnInsert: {
          userId,
          accessCycleId: cycle._id,
          idempotencyKey:
            `${match._id}:INTEGRITY_REVIEW_TIME_COMPENSATION:${role}`,
          eventType: "ADMIN_ADJUSTMENT",
          availableLearningDaysDelta: 0,
          paybackScoreDaysDelta: 0,
          lockedPaybackScoreDaysDelta: 0,
          lockedLearningDaysDelta: 0,
          reservedLearningDaysDelta: 0,
          sourceBucket: "ADMIN_GRANT",
          balanceAfter: cycleBalance(updatedCycle),
          sourceType: "ArenaIntegrityReviewTimeCompensation",
          sourceId: match._id,
          occurredAt: now,
          metadata: {
            role,
            compensationMs,
            reviewStartedAt,
            reviewCompletedAt: now,
            previousExpiresAt: cycle.expiresAt,
            extendedExpiresAt: expiresAt,
          },
        },
      },
      { upsert: true, returnDocument: "after", session }
    );
    compensations.push({ role, userId: id(userId), compensationMs });
  }
  if (["CHALLENGER", "DEFENDER"].includes(screenedRole)) {
    match.integrityScreenedRole = screenedRole;
  }
  match.integrityPauseCompensationMs = compensationMs;
  match.integrityPauseCompensatedAt = now;
  return { compensationMs, compensations, replayed: false };
}

async function swapIntegrityStandings({
  match,
  challengerStanding,
  defenderStanding,
  challengerBefore,
  defenderBefore,
  session,
}) {
  const highest = await ArenaStanding.findOne({
    division: match.division,
    seasonKey: match.seasonKey,
  })
    .sort({ arenaPosition: -1 })
    .select("arenaPosition")
    .session(session)
    .lean();
  const temporaryPosition = Math.max(
    Number(highest?.arenaPosition || 0),
    challengerBefore.arenaPosition,
    defenderBefore.arenaPosition
  ) + 1;
  const first = await ArenaStanding.updateOne(
    {
      _id: challengerStanding._id,
      arenaRank: challengerBefore.arenaRank,
      arenaPosition: challengerBefore.arenaPosition,
      arenaGp: challengerBefore.arenaGp,
    },
    { $set: { ...challengerBefore, arenaPosition: temporaryPosition } },
    { session }
  );
  const second = await ArenaStanding.updateOne(
    {
      _id: defenderStanding._id,
      arenaRank: defenderBefore.arenaRank,
      arenaPosition: defenderBefore.arenaPosition,
      arenaGp: defenderBefore.arenaGp,
    },
    { $set: challengerBefore },
    { session }
  );
  const third = await ArenaStanding.updateOne(
    {
      _id: challengerStanding._id,
      arenaRank: challengerBefore.arenaRank,
      arenaPosition: temporaryPosition,
      arenaGp: challengerBefore.arenaGp,
    },
    { $set: defenderBefore },
    { session }
  );
  if (!first.modifiedCount || !second.modifiedCount || !third.modifiedCount) {
    throw statusError(409, "부정행위 확정 정산 중 Arena 상태가 변경되었습니다.");
  }
}

async function writeMainIntegrityCycle({ cycle, state, session }) {
  const updated = await AccessCycle.findOneAndUpdate(
    {
      _id: cycle._id,
      status: "ACTIVE",
      availableLearningDays: Number(cycle.availableLearningDays || 0),
      reservedLearningDays: Number(cycle.reservedLearningDays || 0),
      lockedLearningDays: Number(cycle.lockedLearningDays || 0),
    },
    {
      $set: {
        learningDayBuckets: state.buckets,
        availableLearningDays: state.availableLearningDays,
        reservedLearningDays: state.reservedLearningDays,
        lockedLearningDays: state.lockedLearningDays,
      },
    },
    { returnDocument: "after", session }
  ).lean();
  if (!updated) {
    throw statusError(409, "부정행위 확정 학습일수 정산이 다른 요청과 충돌했습니다.");
  }
  return updated;
}

async function burnConfirmedCheatingAsset({
  match,
  role,
  userId,
  cycle,
  session,
  now,
}) {
  const isRanked = match.division === "MAIN";
  const assetKind = isRanked ? "LEARNING_DAYS" : "PAYBACK_SCORE";
  const balanceBefore = Math.max(
    0,
    Number(isRanked ? cycle?.availableLearningDays : cycle?.paybackScoreDays) || 0
  );
  const burnedAmount = integrityPenaltyAmount(balanceBefore);
  let cycleAfter = cycle;

  if (burnedAmount > 0) {
    if (isRanked) {
      const state = burnAvailable(cycle, burnedAmount);
      cycleAfter = await writeMainIntegrityCycle({
        cycle,
        state,
        session,
      });
    } else {
      cycleAfter = await AccessCycle.findOneAndUpdate(
        {
          _id: cycle._id,
          status: "ACTIVE",
          paybackScoreDays: balanceBefore,
        },
        { $inc: { paybackScoreDays: -burnedAmount } },
        { returnDocument: "after", session }
      ).lean();
      if (!cycleAfter) {
        throw statusError(409, "부정행위 제재 페이백 점수 소각이 다른 요청과 충돌했습니다.");
      }
    }
    const beforeBalance = cycleBalance(cycle);
    const afterBalance = cycleBalance(cycleAfter);
    await ArenaLearningDayLedger.create([
      {
        userId,
        accessCycleId: cycle._id,
        idempotencyKey: `${match._id}:INTEGRITY_PENALTY_BURN:${role}:ASSET`,
        eventType: "INTEGRITY_PENALTY_BURN",
        availableLearningDaysDelta:
          afterBalance.availableLearningDays - beforeBalance.availableLearningDays,
        paybackScoreDaysDelta:
          afterBalance.paybackScoreDays - beforeBalance.paybackScoreDays,
        lockedPaybackScoreDaysDelta: 0,
        lockedLearningDaysDelta: 0,
        reservedLearningDaysDelta: 0,
        sourceBucket: "UNSPECIFIED",
        balanceAfter: afterBalance,
        sourceType: "ArenaIntegrityPenalty",
        sourceId: match._id,
        occurredAt: now,
        metadata: {
          role,
          division: match.division,
          assetKind,
          penaltyRatio: "ONE_THIRD_CEILING",
          balanceBefore,
          burnedAmount,
        },
      },
    ], { session, ordered: true });
  }

  return {
    role,
    userId: id(userId),
    accessCycleId: id(cycle?._id),
    assetKind,
    balanceBefore,
    burnedAmount,
    cycleAfter,
  };
}

function completedArenaAttempt(attempt) {
  if (attempt?.status === "SUBMITTED") return true;
  return (
    attempt?.status === "EVIDENCE_REQUIRED" &&
    Number(attempt?.currentQuestionIndex || 0) >= 5
  );
}

function hasEvidenceForAttempt(evidence, attempt) {
  return evidence.some(
    (entry) =>
      id(entry.attemptId) === id(attempt?._id) &&
      entry.originalEvidenceSubmitted !== false &&
      Array.isArray(entry.files) &&
      entry.files.length > 0
  );
}

async function finalizeRankedCyclesAfterTerminalMatch({
  matchId,
  now,
}) {
  const match = await ArenaMatch.findById(matchId)
    .select("division challenger.accessCycleId defender.accessCycleId")
    .lean();
  if (!match || match.division !== "MAIN") return;
  const cycleIds = [
    match.challenger?.accessCycleId,
    match.defender?.accessCycleId,
  ].filter(Boolean);
  await Promise.all(
    cycleIds.map((cycleId) =>
      finalizeExpiredAccessCycle({ cycleId, now })
    )
  );
}

/**
 * 풀이 증거가 누락되어 정상 정산할 수 없는 경기를 운영자가 정상으로
 * 판단했을 때 사용한다. 경기 예치는 전액 원상 복구하고 참가자 잠금을
 * 해제한 뒤 경기를 취소 상태로 종료한다. 가짜 증거를 만들거나 증거 없이
 * 승패를 정산하지 않기 위한 복구 경로다.
 */
async function cancelClearedUnscorableMatch({
  match,
  session,
  now,
  reason,
}) {
  const [challengerCycle, defenderCycle] = await Promise.all([
    AccessCycle.findById(match.challenger.accessCycleId).session(session).lean(),
    AccessCycle.findById(match.defender.accessCycleId).session(session).lean(),
  ]);
  if (!challengerCycle || !defenderCycle) {
    throw statusError(409, "경기 예치를 반환할 이용 주기를 찾을 수 없습니다.");
  }

  const mainStakes =
    match.division === "MAIN" ? mainNormalMatchStakes(match) : null;
  const challengerStake = Number(
    mainStakes?.challengerStakeDays ??
      match.economySnapshot?.challengerStakeDays ??
      match.challenger?.stakeDays ??
      0
  );
  const defenderStake = Number(
    mainStakes?.defenderStakeDays ??
      match.economySnapshot?.defenderStakeDays ??
      match.defender?.stakeDays ??
      0
  );
  let challengerAfterCycle = challengerCycle;
  let defenderAfterCycle = defenderCycle;

  if (match.division === "SUB") {
    if (
      challengerStake > 0 &&
      Number(challengerCycle.lockedPaybackScoreDays || 0) < challengerStake
    ) {
      throw statusError(409, "공격자가 예치한 페이백 점수 원본이 변경되었습니다.");
    }
    if (
      defenderStake > 0 &&
      Number(defenderCycle.lockedPaybackScoreDays || 0) < defenderStake
    ) {
      throw statusError(409, "방어자의 기존 예치 원본이 변경되었습니다.");
    }
    if (challengerStake > 0) {
      challengerAfterCycle = await AccessCycle.findOneAndUpdate(
        {
          _id: challengerCycle._id,
          status: "ACTIVE",
          lockedPaybackScoreDays: Number(
            challengerCycle.lockedPaybackScoreDays || 0
          ),
          paybackScoreDays: Number(challengerCycle.paybackScoreDays || 0),
        },
        {
          $inc: {
            lockedPaybackScoreDays: -challengerStake,
            paybackScoreDays: challengerStake,
          },
        },
        { returnDocument: "after", session }
      ).lean();
    }
    if (defenderStake > 0) {
      defenderAfterCycle = await AccessCycle.findOneAndUpdate(
        {
          _id: defenderCycle._id,
          status: "ACTIVE",
          lockedPaybackScoreDays: Number(defenderCycle.lockedPaybackScoreDays || 0),
          paybackScoreDays: Number(defenderCycle.paybackScoreDays || 0),
        },
        {
          $inc: {
            lockedPaybackScoreDays: -defenderStake,
            paybackScoreDays: defenderStake,
          },
        },
        { returnDocument: "after", session }
      ).lean();
    }
  } else {
    if (
      challengerStake > 0 &&
      Number(challengerCycle.lockedLearningDays || 0) < challengerStake
    ) {
      throw statusError(409, "공격자가 예치한 학습일수 원본이 변경되었습니다.");
    }
    if (
      defenderStake > 0 &&
      Number(defenderCycle.lockedLearningDays || 0) < defenderStake
    ) {
      throw statusError(409, "방어자의 기존 경기 예치 원본이 변경되었습니다.");
    }
    if (challengerStake > 0) {
      challengerAfterCycle = await writeMainIntegrityCycle({
        cycle: challengerCycle,
        state: settleLocked(challengerCycle, {
          returnDays: challengerStake,
          removeDays: challengerStake,
        }),
        session,
      });
    }
    if (defenderStake > 0) {
      defenderAfterCycle = await writeMainIntegrityCycle({
        cycle: defenderCycle,
        state: settleLocked(defenderCycle, {
          returnDays: defenderStake,
          removeDays: defenderStake,
        }),
        session,
      });
    }
  }

  const ledgerRows = [
    {
      userId: match.challenger.userId,
      cycleBefore: challengerCycle,
      cycleAfter: challengerAfterCycle,
      role: "CHALLENGER",
      released: challengerStake,
    },
    {
      userId: match.defender.userId,
      cycleBefore: defenderCycle,
      cycleAfter: defenderAfterCycle,
      role: "DEFENDER",
      released: defenderStake,
    },
  ]
    .filter((entry) => entry.released > 0)
    .map((entry) => {
      const before = cycleBalance(entry.cycleBefore);
      const after = cycleBalance(entry.cycleAfter);
      return {
        userId: entry.userId,
        accessCycleId: entry.cycleBefore._id,
        idempotencyKey: `${match._id}:${INTEGRITY_CLEAR_CANCELLATION_VERSION}:${entry.role}:ASSET`,
        eventType: "MATCH_STAKE_RELEASED",
        availableLearningDaysDelta:
          after.availableLearningDays - before.availableLearningDays,
        paybackScoreDaysDelta:
          after.paybackScoreDays - before.paybackScoreDays,
        lockedPaybackScoreDaysDelta:
          after.lockedPaybackScoreDays - before.lockedPaybackScoreDays,
        lockedLearningDaysDelta:
          after.lockedLearningDays - before.lockedLearningDays,
        reservedLearningDaysDelta: 0,
        sourceBucket:
          match.division === "MAIN" ? "MAIN_MATCH_TRANSFER" : "UNSPECIFIED",
        balanceAfter: after,
        sourceType: "ArenaMatchIntegrityClearCancellation",
        sourceId: match._id,
        occurredAt: now,
        metadata: {
          reason: String(reason || "EVIDENCE_INCOMPLETE").slice(0, 200),
          releasedStake: entry.released,
        },
      };
    });
  if (ledgerRows.length) {
    await ArenaLearningDayLedger.create(ledgerRows, {
      session,
      ordered: true,
    });
  }

  match.status = "CANCELLED";
  match.integrityStatus = "CLEAR";
  match.noShowRole = null;
  match.resolvedAt = now;
  match.settlementIdempotencyKey =
    `${match._id}:${INTEGRITY_CLEAR_CANCELLATION_VERSION}`;
  match.resultSnapshot = {
    scoringPolicyVersion: match.scoringVersion,
    challenger: null,
    defender: null,
    tieBreakStep: "ADMIN_CLEAR_UNSCORABLE_CANCELLED",
    winnerRole: null,
    settlementSummary: {
      version: INTEGRITY_CLEAR_CANCELLATION_VERSION,
      integrityDecision: "CLEAR",
      cancellationReason: String(reason || "EVIDENCE_INCOMPLETE").slice(0, 200),
      challengerStakeReturned: challengerStake,
      defenderStakeReturned: defenderStake,
    },
    resolvedAt: now,
  };
  await match.save({ session });
  await ArenaMatchParticipantLock.deleteMany({ matchId: match._id }, { session });
  return {
    status: match.status,
    cancellationReason: reason,
    challengerStakeReturned: challengerStake,
    defenderStakeReturned: defenderStake,
  };
}

async function settleConfirmedMatchCheating({
  match,
  cheatingRole,
  attempts,
  problemPack,
  session,
  now,
}) {
  const role = String(cheatingRole || "").toUpperCase();
  if (!["CHALLENGER", "DEFENDER", "BOTH"].includes(role)) {
    throw statusError(400, "부정행위가 확인된 참가자를 선택해주세요.");
  }
  const [challengerStanding, defenderStanding, challengerCycle, defenderCycle] =
    await Promise.all([
      ArenaStanding.findById(match.challenger.standingId).session(session).lean(),
      ArenaStanding.findById(match.defender.standingId).session(session).lean(),
      AccessCycle.findById(match.challenger.accessCycleId).session(session).lean(),
      AccessCycle.findById(match.defender.accessCycleId).session(session).lean(),
    ]);
  const challengerBefore = arenaTuple(match.challenger.tupleBefore);
  const defenderBefore = arenaTuple(match.defender.tupleBefore);
  if (
    !challengerStanding || !defenderStanding || !challengerCycle || !defenderCycle ||
    !arenaTuplesEqual(challengerStanding, challengerBefore) ||
    !arenaTuplesEqual(defenderStanding, defenderBefore) ||
    challengerCycle.status !== "ACTIVE" || defenderCycle.status !== "ACTIVE"
  ) {
    throw statusError(409, "경기 생성 때 고정한 Arena 상태 또는 이용 주기가 변경되었습니다.");
  }

  const mainStakes =
    match.division === "MAIN" ? mainNormalMatchStakes(match) : null;
  const stake = Number(
    mainStakes?.challengerStakeDays ??
      match.economySnapshot?.challengerStakeDays ??
      0
  );
  const defenderStake = Number(
    mainStakes?.defenderStakeDays ??
      match.economySnapshot?.defenderStakeDays ??
      0
  );
  if (!Number.isSafeInteger(stake) || stake < 1) {
    throw statusError(409, "공격자가 예치한 자산을 확인할 수 없습니다.");
  }

  const challengerCheating = role === "CHALLENGER" || role === "BOTH";
  const defenderCheating = role === "DEFENDER" || role === "BOTH";
  const challengerIsUpperTier = isHigherArenaTier(
    challengerBefore.arenaRank,
    defenderBefore.arenaRank
  );
  // Ranked에서는 '부정행위자는 패배'를 기본으로 하되, 상위 티어가 공격한
  // 초대전은 상위 티어 공격자의 부정행위를 랭크 교체로 처리한다.
  const shouldSwap = match.division === "MAIN"
    ? role === "DEFENDER"
      ? !challengerIsUpperTier
      : role === "CHALLENGER"
        ? challengerIsUpperTier
        : false
    : role === "DEFENDER";
  const returnStakeToChallenger = role === "DEFENDER";
  const transferStakeToDefender = role === "CHALLENGER";
  const challengerAfter = shouldSwap ? defenderBefore : challengerBefore;
  const defenderAfter = shouldSwap ? challengerBefore : defenderBefore;
  if (shouldSwap) {
    await swapIntegrityStandings({
      match,
      challengerStanding,
      defenderStanding,
      challengerBefore,
      defenderBefore,
      session,
    });
  }

  let challengerAfterCycle;
  let defenderAfterCycle;
  if (match.division === "SUB") {
    if (Number(challengerCycle.lockedPaybackScoreDays || 0) < stake) {
      throw statusError(409, "공격자가 예치한 페이백 점수 원본이 변경되었습니다.");
    }
    challengerAfterCycle = await AccessCycle.findOneAndUpdate(
      {
        _id: challengerCycle._id,
        status: "ACTIVE",
        lockedPaybackScoreDays: Number(challengerCycle.lockedPaybackScoreDays || 0),
        paybackScoreDays: Number(challengerCycle.paybackScoreDays || 0),
      },
      {
        $inc: {
          lockedPaybackScoreDays: -stake,
          paybackScoreDays: returnStakeToChallenger ? stake : 0,
        },
      },
      { returnDocument: "after", session }
    ).lean();
    defenderAfterCycle = !transferStakeToDefender
      ? defenderCycle
      : await AccessCycle.findOneAndUpdate(
          { _id: defenderCycle._id, status: "ACTIVE" },
          { $inc: { paybackScoreDays: stake } },
          { returnDocument: "after", session }
        ).lean();
    if (!challengerAfterCycle || !defenderAfterCycle) {
      throw statusError(409, "페이백 점수 정산이 다른 요청과 충돌했습니다.");
    }
  } else {
    if (Number(challengerCycle.lockedLearningDays || 0) < stake) {
      throw statusError(409, "공격자가 예치한 학습일수 원본이 변경되었습니다.");
    }
    // Ranked의 양측 예치 경기는 방어자 부정행위 시 방어자 예치를 공격자에게,
    // 공격자 부정행위 시 공격자 예치를 방어자에게 이전한다. 양측 위반은
    // 어느 쪽에도 반환하지 않고 모두 서버에서 소각한다.
    const challengerReturnDays = defenderCheating && !challengerCheating
      ? stake
      : 0;
    const defenderReturnDays = challengerCheating && !defenderCheating
      ? defenderStake
      : 0;
    const challengerTransferToDefender = challengerCheating && !defenderCheating
      ? stake
      : 0;
    const defenderTransferToChallenger = defenderCheating && !challengerCheating
      ? defenderStake
      : 0;
    const challengerStateBase = settleLocked(challengerCycle, {
      returnDays: challengerReturnDays,
      removeDays: stake,
    });
    let challengerState = defenderTransferToChallenger > 0
      ? addMatchTransfer(challengerStateBase, defenderTransferToChallenger)
      : challengerStateBase;
    let defenderState = defenderCycle;
    if (defenderStake > 0) {
      if (Number(defenderCycle.lockedLearningDays || 0) < defenderStake) {
        throw statusError(409, "방어자의 기존 경기 예치 원본이 변경되었습니다.");
      }
      defenderState = settleLocked(defenderCycle, {
        returnDays: defenderReturnDays,
        removeDays: defenderStake,
      });
    }
    if (challengerTransferToDefender > 0) {
      defenderState = addMatchTransfer(defenderState, challengerTransferToDefender);
    }
    challengerAfterCycle = await writeMainIntegrityCycle({
      cycle: challengerCycle,
      state: challengerState,
      session,
    });
    defenderAfterCycle = await writeMainIntegrityCycle({
      cycle: defenderCycle,
      state: defenderState,
      session,
    });
  }

  await ArenaStandingChangeLedger.create(
    [
      {
        matchId: match._id,
        userId: match.challenger.userId,
        idempotencyKey: `${match._id}:${INTEGRITY_SETTLEMENT_VERSION}:CHALLENGER:TUPLE`,
        changeType: shouldSwap ? "TUPLE_SWAP" : "NO_TUPLE_WRITE",
        tupleBefore: challengerBefore,
        tupleAfter: challengerAfter,
        occurredAt: now,
      },
      {
        matchId: match._id,
        userId: match.defender.userId,
        idempotencyKey: `${match._id}:${INTEGRITY_SETTLEMENT_VERSION}:DEFENDER:TUPLE`,
        changeType: shouldSwap ? "TUPLE_SWAP" : "NO_TUPLE_WRITE",
        tupleBefore: defenderBefore,
        tupleAfter: defenderAfter,
        occurredAt: now,
      },
    ],
    { session, ordered: true }
  );
  await createRankUpPresentationsForSettlement({
    matchId: match._id,
    challengerUserId: match.challenger.userId,
    defenderUserId: match.defender.userId,
    challengerTupleBefore: challengerBefore,
    challengerTupleAfter: challengerAfter,
    defenderTupleBefore: defenderBefore,
    defenderTupleAfter: defenderAfter,
    occurredAt: now,
    session,
  });

  const challengerBeforeBalance = cycleBalance(challengerCycle);
  const defenderBeforeBalance = cycleBalance(defenderCycle);
  const challengerAfterBalance = cycleBalance(challengerAfterCycle);
  const defenderAfterBalance = cycleBalance(defenderAfterCycle);
  await ArenaLearningDayLedger.create(
    [
      {
        userId: match.challenger.userId,
        accessCycleId: challengerCycle._id,
        idempotencyKey: `${match._id}:${INTEGRITY_SETTLEMENT_VERSION}:CHALLENGER:ASSET`,
        eventType: match.division === "MAIN"
          ? role === "BOTH"
            ? "MATCH_SETTLEMENT_BURN"
            : "MATCH_SETTLEMENT_TRANSFER"
          : returnStakeToChallenger
            ? "MATCH_STAKE_RELEASED"
            : transferStakeToDefender
              ? "MATCH_SETTLEMENT_TRANSFER"
              : "MATCH_SETTLEMENT_BURN",
        availableLearningDaysDelta: challengerAfterBalance.availableLearningDays - challengerBeforeBalance.availableLearningDays,
        paybackScoreDaysDelta: challengerAfterBalance.paybackScoreDays - challengerBeforeBalance.paybackScoreDays,
        lockedPaybackScoreDaysDelta: challengerAfterBalance.lockedPaybackScoreDays - challengerBeforeBalance.lockedPaybackScoreDays,
        lockedLearningDaysDelta: challengerAfterBalance.lockedLearningDays - challengerBeforeBalance.lockedLearningDays,
        reservedLearningDaysDelta: 0,
        sourceBucket: match.division === "MAIN" ? "MAIN_MATCH_TRANSFER" : "UNSPECIFIED",
        balanceAfter: challengerAfterBalance,
        sourceType: "ArenaMatchIntegritySettlement",
        sourceId: match._id,
        occurredAt: now,
        metadata: {
          cheatingRole: role,
          returnedOwnStake: match.division === "MAIN" && role === "DEFENDER"
            ? stake
            : 0,
          transferredToDefender: match.division === "MAIN"
            ? role === "CHALLENGER" ? stake : 0
            : role === "CHALLENGER" ? stake : 0,
          receivedDefenderStake: match.division === "MAIN" && role === "DEFENDER"
            ? defenderStake
            : 0,
          burnedStake: match.division === "MAIN" && role === "BOTH" ? stake : 0,
        },
      },
      {
        userId: match.defender.userId,
        accessCycleId: defenderCycle._id,
        idempotencyKey: `${match._id}:${INTEGRITY_SETTLEMENT_VERSION}:DEFENDER:ASSET`,
        eventType: match.division === "MAIN"
          ? role === "BOTH"
            ? "MATCH_SETTLEMENT_BURN"
            : role === "DEFENDER"
              ? "MATCH_SETTLEMENT_BURN"
              : "MATCH_STAKE_RELEASED"
          : role === "CHALLENGER" ? "MATCH_SETTLEMENT_TRANSFER" : "MATCH_STAKE_RELEASED",
        availableLearningDaysDelta: defenderAfterBalance.availableLearningDays - defenderBeforeBalance.availableLearningDays,
        paybackScoreDaysDelta: defenderAfterBalance.paybackScoreDays - defenderBeforeBalance.paybackScoreDays,
        lockedPaybackScoreDaysDelta: defenderAfterBalance.lockedPaybackScoreDays - defenderBeforeBalance.lockedPaybackScoreDays,
        lockedLearningDaysDelta: defenderAfterBalance.lockedLearningDays - defenderBeforeBalance.lockedLearningDays,
        reservedLearningDaysDelta: 0,
        sourceBucket: match.division === "MAIN" ? "MAIN_MATCH_TRANSFER" : "UNSPECIFIED",
        balanceAfter: defenderAfterBalance,
        sourceType: "ArenaMatchIntegritySettlement",
        sourceId: match._id,
        occurredAt: now,
        metadata: {
          cheatingRole: role,
          returnedOwnStake: match.division === "MAIN" && role === "CHALLENGER"
            ? defenderStake
            : 0,
          receivedFromChallenger: role === "CHALLENGER" ? stake : 0,
          transferredToChallenger: match.division === "MAIN" && role === "DEFENDER"
            ? defenderStake
            : 0,
          burnedStake: match.division === "MAIN" && role === "BOTH" ? defenderStake : 0,
        },
      },
    ],
    { session, ordered: true }
  );

  // 경기 예치금 정산과 별개로, 확정된 위반자 본인의 현재 사용 가능
  // 자산에서 1/3을 제재 소각한다. 먼저 경기 정산을 끝내야 같은 자산을
  // 이중으로 세지 않으며, 양측 위반이면 각자에게 독립적으로 적용된다.
  const penaltyBurns = [];
  if (challengerCheating) {
    const penalty = await burnConfirmedCheatingAsset({
      match,
      role: "CHALLENGER",
      userId: match.challenger.userId,
      cycle: challengerAfterCycle,
      session,
      now,
    });
    challengerAfterCycle = penalty.cycleAfter;
    penaltyBurns.push(penalty);
  }
  if (defenderCheating) {
    const penalty = await burnConfirmedCheatingAsset({
      match,
      role: "DEFENDER",
      userId: match.defender.userId,
      cycle: defenderAfterCycle,
      session,
      now,
    });
    defenderAfterCycle = penalty.cycleAfter;
    penaltyBurns.push(penalty);
  }

  const violatingUserIds = [
    challengerCheating ? match.challenger.userId : null,
    defenderCheating ? match.defender.userId : null,
  ].filter(Boolean);
  const violatingCycleIds = [
    challengerCheating ? challengerCycle._id : null,
    defenderCheating ? defenderCycle._id : null,
  ].filter(Boolean);
  const penaltyWrites = [
    User.updateMany(
      { _id: { $in: violatingUserIds } },
      { $inc: { warningCount: 1 } },
      { session }
    ),
  ];
  if (match.division === "SUB") {
    penaltyWrites.push(AccessCycle.updateMany(
      { _id: { $in: violatingCycleIds } },
      {
        $set: {
          cashbackQualified: false,
          paybackRate: 0,
          paybackAmount: 0,
        },
        $addToSet: {
          paybackDisqualifiers: "INTEGRITY_VIOLATION_CONFIRMED",
        },
      },
      { session }
    ));
  }
  await Promise.all(penaltyWrites);

  const attemptByRole = new Map(attempts.map((attempt) => [attempt.role, attempt]));
  const challengerScore = problemPack
    ? scoreArenaAttempt({ attempt: attemptByRole.get("CHALLENGER"), problemPack })
    : null;
  const defenderScore = problemPack
    ? scoreArenaAttempt({ attempt: attemptByRole.get("DEFENDER"), problemPack })
    : null;
  match.status = "SETTLED";
  match.integrityStatus = "CONFIRMED";
  match.integrityReviewCompletedAt = now;
  match.winnerRole = role === "CHALLENGER"
    ? "DEFENDER"
    : role === "DEFENDER"
      ? "CHALLENGER"
      : null;
  match.resolvedAt = now;
  match.settledAt = now;
  match.settlementIdempotencyKey = `${match._id}:${INTEGRITY_SETTLEMENT_VERSION}:${role}`;
  match.resultSnapshot = {
    scoringPolicyVersion: match.scoringVersion,
    challenger: challengerScore,
    defender: defenderScore,
    tieBreakStep: "INTEGRITY_VIOLATION",
    winnerRole: match.winnerRole,
    settlementSummary: {
      version: INTEGRITY_SETTLEMENT_VERSION,
      integrityDecision: "CHEATING_CONFIRMED",
      cheatingRole: role,
      tupleAction: shouldSwap ? "SWAP" : "KEEP",
      challengerStakeAmount: stake,
      challengerStakeAction: match.division === "MAIN"
        ? role === "DEFENDER"
          ? "RETURNED"
          : role === "CHALLENGER"
            ? "TRANSFERRED_TO_DEFENDER"
            : "BURNED"
        : returnStakeToChallenger
          ? "RETURNED"
          : transferStakeToDefender
            ? "TRANSFERRED_TO_DEFENDER"
            : "BURNED",
      defenderStakeAction: match.division === "MAIN"
        ? role === "DEFENDER"
          ? "TRANSFERRED_TO_CHALLENGER"
          : role === "CHALLENGER"
            ? "RETURNED"
            : "BURNED"
        : "NOT_DEPOSITED",
      challengerWarningAdded: challengerCheating ? 1 : 0,
      defenderWarningAdded: defenderCheating ? 1 : 0,
      paybackDisqualifiedUserIds:
        match.division === "SUB" ? violatingUserIds.map(id) : [],
      integrityPenaltyRatio: "ONE_THIRD_CEILING",
      integrityPenaltyBurns: penaltyBurns.map((entry) => ({
        role: entry.role,
        userId: entry.userId,
        assetKind: entry.assetKind,
        balanceBefore: entry.balanceBefore,
        burnedAmount: entry.burnedAmount,
      })),
      challengerBalanceAfter: cycleBalance(challengerAfterCycle),
      defenderBalanceAfter: cycleBalance(defenderAfterCycle),
    },
    resolvedAt: now,
  };
  await match.save({ session });
  await ArenaMatchParticipantLock.deleteMany({ matchId: match._id }, { session });
  await ArenaOutboxEvent.findOneAndUpdate(
    { idempotencyKey: `${match._id}:ArenaMatchSettled` },
    {
      $setOnInsert: {
        eventType: "ArenaMatchSettled",
        aggregateType: "ArenaMatch",
        aggregateId: match._id,
        idempotencyKey: `${match._id}:ArenaMatchSettled`,
        payload: {
          division: match.division,
          matchType: match.matchType,
          winnerRole: match.winnerRole,
          tupleAction: shouldSwap ? "SWAP" : "KEEP",
          integrityDecision: "CHEATING_CONFIRMED",
          cheatingRole: role,
        },
      },
    },
    { upsert: true, setDefaultsOnInsert: true, session }
  );
  return {
    status: match.status,
    cheatingRole: role,
    winnerRole: match.winnerRole,
    tupleAction: shouldSwap ? "SWAP" : "KEEP",
    penaltyBurns: penaltyBurns.map((entry) => ({
      role: entry.role,
      userId: entry.userId,
      assetKind: entry.assetKind,
      balanceBefore: entry.balanceBefore,
      burnedAmount: entry.burnedAmount,
    })),
  };
}

async function reviewHeldArenaMatch({
  matchId,
  adminUserId,
  decision,
  note = "",
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(matchId)) {
    throw statusError(404, "검토할 Arena 경기를 찾을 수 없습니다.");
  }
  const normalizedDecision = String(decision || "").trim().toUpperCase();
  if (!["NOTE", "CLEAR", "CHALLENGER_CHEATING", "DEFENDER_CHEATING", "BOTH_CHEATING"].includes(normalizedDecision)) {
    throw statusError(400, "경기 검토 결과를 선택해주세요.");
  }
  const decisionNote = String(note || "").trim().slice(0, 1000);
  if (!decisionNote) {
    throw statusError(400, "운영자 판단 근거를 기록해주세요.");
  }

  const current = new Date(now);
  const session = await mongoose.startSession();
  let notificationUserIds = [];
  const penalizedNotificationUserIds = new Set();
  const accessReviewResults = new Map();
  const compensationByUserId = new Map();
  const penaltyBurnByUserId = new Map();
  let shouldSettle = false;
  let reviewedDivision = "";
  let result = null;
  try {
    await session.withTransaction(async () => {
      const match = await ArenaMatch.findOne({
        _id: matchId,
        status: "HELD",
      })
        .session(session);
      if (!match) {
        throw statusError(404, "검토 중인 Arena 경기를 찾을 수 없습니다.");
      }
      reviewedDivision = match.division;
      const attempts = await ArenaMatchAttempt.find({ matchId }).session(session).lean();
      const evidence = await ArenaMatchEvidence.find({ matchId }).session(session);
      const attemptsFinished =
        attempts.length === 2 &&
        attempts.every(completedArenaAttempt);
      const completeInputs =
        attemptsFinished &&
        attempts.every((attempt) =>
          attempt.status === "SUBMITTED" &&
          hasEvidenceForAttempt(evidence, attempt)
        );
      const hasExpiredMissingEvidence = attempts.some((attempt) =>
        completedArenaAttempt(attempt) &&
        !hasEvidenceForAttempt(evidence, attempt) &&
        attempt.evidenceDeadlineAt &&
        new Date(attempt.evidenceDeadlineAt).getTime() <= current.getTime()
      );
      const activeSupplementalRequest = evidence.find(
        (entry) =>
          entry.supplementalRequest?.status === "REQUESTED" &&
          entry.supplementalRequest?.deadlineAt &&
          new Date(entry.supplementalRequest.deadlineAt) > current
      );
      if (normalizedDecision !== "NOTE" && activeSupplementalRequest) {
        throw statusError(
          409,
          "추가 소명 자료의 24시간 제출 기한이 진행 중입니다. 제출 완료 또는 기한 종료 후 최종 판정해주세요."
        );
      }
      const cheatingRole = normalizedDecision === "CHALLENGER_CHEATING"
        ? "CHALLENGER"
        : normalizedDecision === "DEFENDER_CHEATING"
          ? "DEFENDER"
          : normalizedDecision === "BOTH_CHEATING"
            ? "BOTH"
          : null;
      if (cheatingRole && !attemptsFinished) {
        throw statusError(
          409,
          "양측이 5문제를 모두 끝낸 뒤 부정행위 확정 정산을 진행해주세요. 풀이 증거 미제출도 운영 판단 근거에 포함할 수 있습니다."
        );
      }
      const flaggedUserIds = unique(
        evidence
          .filter((entry) => entry.status === "ANOMALY_FLAGGED" || entry.anomalyFlags.length)
          .map((entry) => entry.userId)
      );
      const participantUserIds = unique([
        match.challenger?.userId,
        match.defender?.userId,
      ]);
      const penalizedUserIds = cheatingRole === "CHALLENGER"
        ? [id(match.challenger?.userId)]
        : cheatingRole === "DEFENDER"
          ? [id(match.defender?.userId)]
          : cheatingRole === "BOTH"
            ? participantUserIds
          : [];
      penalizedUserIds.forEach((userId) =>
        penalizedNotificationUserIds.add(id(userId))
      );
      notificationUserIds = normalizedDecision === "NOTE"
        ? (flaggedUserIds.length ? flaggedUserIds : participantUserIds)
        : participantUserIds;
      const actionUserIds = cheatingRole
        ? penalizedUserIds
        : notificationUserIds;

      const action = normalizedDecision === "NOTE"
        ? "arena.integrity.match.note"
        : normalizedDecision === "CLEAR"
          ? "arena.integrity.match.cleared"
          : cheatingRole === "CHALLENGER"
            ? "arena.integrity.match.challenger_cheating"
              : cheatingRole === "DEFENDER"
                ? "arena.integrity.match.defender_cheating"
                : cheatingRole === "BOTH"
                  ? "arena.integrity.match.both_cheating"
                : "arena.integrity.match.note";
      for (const targetUserId of actionUserIds) {
        await AdminActionLog.create([{
          adminUserId,
          targetUserId,
          action,
          detail: decisionNote,
          metadata: {
            matchId: id(match._id),
            decision: normalizedDecision,
            anomalyFlags: evidence
              .filter((entry) => id(entry.userId) === id(targetUserId))
              .flatMap((entry) => entry.anomalyFlags || []),
          },
        }], { session });
      }

      if (normalizedDecision === "NOTE") {
        result = { matchId: id(match._id), status: match.status, decision: "NOTE" };
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
                : `${cheatingRole === "CHALLENGER" ? "공격자" : cheatingRole === "DEFENDER" ? "방어자" : "양측"} 부정행위 확인: ${decisionNote}`,
            },
          },
          { session }
        );
      }

      const cleared = normalizedDecision === "CLEAR";
      if (cleared) {
        const compensation = await compensateIntegrityPauseForRoles({
          match,
          evidence,
          roles: ["CHALLENGER", "DEFENDER"],
          session,
          now: current,
        });
        compensation.compensations.forEach((entry) => {
          compensationByUserId.set(
            id(entry.userId),
            Number(entry.compensationMs || 0)
          );
        });
        match.integrityStatus = "CLEAR";
        match.integrityReviewCompletedAt = current;
        if (completeInputs) {
          match.status = "SUBMITTED";
          shouldSettle = true;
          await match.save({ session });
        } else if (attemptsFinished || hasExpiredMissingEvidence) {
          result = await cancelClearedUnscorableMatch({
            match,
            session,
            now: current,
            reason: hasExpiredMissingEvidence
              ? "풀이 증거 제출 기한 만료 후 운영자 이상 없음 판정"
              : "양측 풀이 완료 후 증거 누락으로 정산 불가",
          });
        } else if (match.status === "HELD" && flaggedUserIds.length) {
          const anyStarted = attempts.some((attempt) =>
            ["IN_PROGRESS", "EVIDENCE_REQUIRED", "SUBMITTED"].includes(attempt.status)
          );
          match.status = anyStarted ? "IN_PROGRESS" : "READY";
          await match.save({ session });
        } else {
          await match.save({ session });
        }
      } else {
        const innocentRoles = cheatingRole === "CHALLENGER"
          ? ["DEFENDER"]
          : cheatingRole === "DEFENDER"
            ? ["CHALLENGER"]
            : [];
        const compensation = await compensateIntegrityPauseForRoles({
          match,
          evidence,
          roles: innocentRoles,
          session,
          now: current,
        });
        compensation.compensations.forEach((entry) => {
          compensationByUserId.set(
            id(entry.userId),
            Number(entry.compensationMs || 0)
          );
        });
        const problemPack = match.problemPackId
          ? await ArenaProblemPack.findById(match.problemPackId)
              .select("+questions")
              .session(session)
              .lean()
          : null;
        result = await settleConfirmedMatchCheating({
          match,
          cheatingRole,
          attempts,
          problemPack,
          session,
          now: current,
        });
        (result.penaltyBurns || []).forEach((entry) => {
          penaltyBurnByUserId.set(id(entry.userId), entry);
        });
      }

      for (const targetUserId of notificationUserIds) {
        const userCleared = cleared || !penalizedUserIds.includes(id(targetUserId));
        const accessReviewResult = await resolveIntegrityAccessAfterMatchReview({
          userId: targetUserId,
          reviewedMatchId: match._id,
          division: match.division,
          cleared: userCleared,
          session,
          now: current,
          adminUserId,
        });
        accessReviewResults.set(id(targetUserId), accessReviewResult);
      }
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
      result = {
        ...(result || {}),
        matchId: id(match._id),
        status: result?.status || match.status,
        decision: normalizedDecision,
        attemptsFinished,
        completeInputs,
      };
    });
  } finally {
    await session.endSession();
  }

  if (normalizedDecision !== "NOTE") {
    for (const userId of notificationUserIds) {
      const isPenalized = penalizedNotificationUserIds.has(id(userId));
      await notifyArenaIntegrityReviewResult({
        userId,
        sourceId: matchId,
        division: reviewedDivision,
        decision: isPenalized
          ? normalizedDecision
          : normalizedDecision === "CLEAR"
            ? "CLEAR"
            : "PARTICIPANT_CLEARED",
        note: decisionNote,
        accessReleased: Boolean(
          accessReviewResults.get(id(userId))?.accessReleased
        ),
        restrictedUntil:
          accessReviewResults.get(id(userId))?.restrictedUntil || null,
        compensationMs: Number(compensationByUserId.get(id(userId)) || 0),
        assetPenaltyBurned: Number(
          penaltyBurnByUserId.get(id(userId))?.burnedAmount || 0
        ),
        assetPenaltyKind: penaltyBurnByUserId.get(id(userId))?.assetKind || "",
      });
    }
  }
  if (shouldSettle) {
    result.settlement = await settleArenaMatch({ matchId, now: current });
  }
  const terminalStatus = result?.settlement?.status || result?.status;
  if (
    reviewedDivision === "MAIN" &&
    ["SETTLED", "CANCELLED"].includes(terminalStatus)
  ) {
    // 검토 때문에 HELD였던 Ranked 경기 역시 결과 확정 뒤에만 만료를
    // 판단한다. 검토 중에는 잠긴 예치 자산을 근거로 이용을 종료하지 않는다.
    await finalizeRankedCyclesAfterTerminalMatch({
      matchId,
      now: current,
    });
  }
  return result;
}

async function requestArenaSupplementalEvidence({
  matchId,
  role,
  adminUserId,
  requestMessage = "",
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(matchId)) {
    throw statusError(404, "추가 소명을 요청할 경기를 찾을 수 없습니다.");
  }
  const normalizedRole = String(role || "").trim().toUpperCase();
  if (!["CHALLENGER", "DEFENDER"].includes(normalizedRole)) {
    throw statusError(400, "추가 소명을 요청할 참가자를 선택해주세요.");
  }
  const current = new Date(now);
  const deadlineAt = new Date(
    current.getTime() + SUPPLEMENTAL_EVIDENCE_TARGET_MS
  );
  const message = String(requestMessage || "").trim().slice(0, 500);
  const match = await ArenaMatch.findOne({ _id: matchId, status: "HELD" }).lean();
  if (!match) {
    throw statusError(409, "운영 검토 중인 경기에서만 추가 소명을 요청할 수 있습니다.");
  }
  const userId = normalizedRole === "CHALLENGER"
    ? match.challenger?.userId
    : match.defender?.userId;
  const attempt = await ArenaMatchAttempt.findOne({
    matchId,
    userId,
    role: normalizedRole,
  }).lean();
  if (!attempt) {
    throw statusError(404, "해당 참가자의 응시 기록을 찾을 수 없습니다.");
  }
  let evidence = await ArenaMatchEvidence.findOne({ attemptId: attempt._id }).lean();
  if (!evidence) {
    // 최초 증거가 누락돼도 운영자는 당사자에게 별도 소명을 요청할 수 있다.
    // 이 문서는 정산에서 최초 증거로 인정되지 않는다.
    try {
      [evidence] = await ArenaMatchEvidence.create([{
        attemptId: attempt._id,
        matchId: match._id,
        userId,
        originalEvidenceSubmitted: false,
        files: [],
        deadlineAt: attempt.evidenceDeadlineAt || null,
        submittedAt: null,
        status: "REVIEWED",
        retentionUntil: new Date(current.getTime() + 90 * 24 * 60 * 60 * 1000),
      }]);
      evidence = evidence.toObject();
    } catch (error) {
      if (Number(error?.code) !== 11000) throw error;
      evidence = await ArenaMatchEvidence.findOne({ attemptId: attempt._id }).lean();
    }
  }
  if (!evidence) {
    throw statusError(409, "추가 소명 자료 보존 문서를 만들지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
  const supplementalStatus = evidence.supplementalRequest?.status || "NONE";
  if (supplementalStatus !== "NONE") {
    const messageByStatus = {
      REQUESTED: "해당 참가자에게 보낸 추가 소명 요청이 이미 진행 중입니다.",
      SUBMITTED: "해당 참가자는 추가 소명 자료를 이미 제출했습니다.",
      EXPIRED: "해당 참가자의 24시간 추가 소명 기한이 종료되어 미제출로 확정되었습니다.",
    };
    throw statusError(409, messageByStatus[supplementalStatus] || "해당 참가자의 추가 소명 요청을 다시 시작할 수 없습니다.");
  }
  const updated = await ArenaMatchEvidence.findOneAndUpdate(
    { _id: evidence._id },
    {
      $set: {
        "supplementalRequest.status": "REQUESTED",
        "supplementalRequest.requestedAt": current,
        "supplementalRequest.deadlineAt": deadlineAt,
        "supplementalRequest.requestedBy": adminUserId,
        "supplementalRequest.requestMessage": message,
        "supplementalRequest.submittedAt": null,
        "supplementalRequest.submittedLate": false,
        "supplementalRequest.lateByMs": 0,
        "supplementalRequest.files": [],
      },
    },
    { returnDocument: "after" }
  ).lean();
  await AdminActionLog.create({
    adminUserId,
    targetUserId: userId,
    action: `arena.integrity.match.supplemental_requested.${normalizedRole.toLowerCase()}`,
    detail: message || "추가 풀이 소명 자료 요청",
    metadata: {
      matchId: id(matchId),
      role: normalizedRole,
      deadlineAt,
    },
  });
  await notifyArenaSupplementalEvidenceRequested({
    matchId,
    userId,
    role: normalizedRole,
    requestedAt: current,
    deadlineAt,
    requestMessage: message,
  });
  return {
    matchId: id(matchId),
    evidenceId: id(updated._id),
    role: normalizedRole,
    userId: id(userId),
    status: updated.supplementalRequest.status,
    requestedAt: current,
    deadlineAt,
  };
}

async function cancelHeldArenaMatchForAdminReset({
  matchId,
  adminUserId,
  note = "운영 테스트 상태 초기화",
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(matchId)) {
    throw statusError(404, "초기화할 Arena 경기를 찾을 수 없습니다.");
  }
  const current = new Date(now);
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const match = await ArenaMatch.findOne({
        _id: matchId,
        status: {
          $nin: ["SETTLED", "INVALID", "CANCELLED", "INSURED_CANCELLED"],
        },
        $or: [{ status: "HELD" }, { integrityStatus: "SUSPICIOUS" }],
      }).session(session);
      if (!match) {
        result = { matchId: id(matchId), skipped: true };
        return;
      }
      const evidence = await ArenaMatchEvidence.find({ matchId })
        .select("_id")
        .session(session)
        .lean();
      if (evidence.length) {
        await ArenaMatchEvidence.updateMany(
          { _id: { $in: evidence.map((entry) => entry._id) } },
          {
            $set: {
              status: "REVIEWED",
              reviewedAt: current,
              reviewedBy: adminUserId,
              retentionHoldReason: String(
                note || "운영 테스트 상태 초기화"
              ).slice(0, 300),
            },
          },
          { session }
        );
      }
      result = await cancelClearedUnscorableMatch({
        match,
        session,
        now: current,
        reason: note,
      });
      await AdminTodo.deleteMany(
        {
          category: "integrity",
          $or: [
            { sourceId: match._id },
            { "metadata.matchId": id(match._id) },
          ],
        },
        { session }
      );
      result = { ...result, matchId: id(match._id), skipped: false };
    });
  } finally {
    await session.endSession();
  }
  return result;
}

async function expireArenaSupplementalEvidenceRequests({ now = new Date() } = {}) {
  const result = await ArenaMatchEvidence.updateMany(
    {
      "supplementalRequest.status": "REQUESTED",
      "supplementalRequest.deadlineAt": { $lte: new Date(now) },
    },
    { $set: { "supplementalRequest.status": "EXPIRED" } }
  );
  return Number(result.modifiedCount || 0);
}

async function getAdminArenaIntegrityData() {
  await expireArenaSupplementalEvidenceRequests();
  const [cases, heldMatches, completedMatchActions, completedCases] = await Promise.all([
    ArenaIntegrityRiskCase.find({ status: "OPEN" })
      .sort({ riskScore: -1, createdAt: 1 })
      .limit(200)
      .lean(),
    ArenaMatch.find({ status: "HELD" })
      .sort({ updatedAt: -1 })
      .limit(300)
      .lean(),
    AdminActionLog.find({
      action: {
        $in: [
          "arena.integrity.match.cleared",
          "arena.integrity.match.challenger_cheating",
          "arena.integrity.match.defender_cheating",
          "arena.integrity.match.both_cheating",
        ],
      },
    })
      .sort({ createdAt: -1 })
      .limit(300)
      .lean(),
    ArenaIntegrityRiskCase.find({ status: { $in: ["CLEARED", "CONFIRMED"] } })
      .sort({ reviewedAt: -1, updatedAt: -1 })
      .limit(200)
      .lean(),
  ]);
  const heldMatchIds = heldMatches.map((match) => match._id);
  const heldMatchIdStrings = heldMatchIds.map(id);
  const problemPackIds = unique(heldMatches.map((match) => match.problemPackId));
  const [heldAttempts, heldEvidence, heldTodos, problemPacks] = heldMatchIds.length
    ? await Promise.all([
        ArenaMatchAttempt.find({ matchId: { $in: heldMatchIds } }).lean(),
        ArenaMatchEvidence.find({ matchId: { $in: heldMatchIds } }).lean(),
        AdminTodo.find({
          category: "integrity",
          status: "pending",
          $or: [
            { sourceId: { $in: heldMatchIds } },
            { "metadata.matchId": { $in: heldMatchIdStrings } },
          ],
        }).lean(),
        ArenaProblemPack.find({ _id: { $in: problemPackIds } })
          .select("+questions")
          .lean(),
      ])
    : [[], [], [], []];
  const userIds = unique([
    ...cases.flatMap((entry) => [
      entry.userId,
      ...(entry.linkedUserIds || []),
    ]),
    ...heldMatches.flatMap(
      (match) => [
        match.challenger?.userId,
        match.defender?.userId,
      ]
    ),
    ...completedMatchActions.flatMap((entry) => [entry.targetUserId, entry.adminUserId]),
    ...completedCases.flatMap((entry) => [entry.userId, entry.reviewedBy]),
  ]);
  const [users, caseHistory, actionHistory] = userIds.length
    ? await Promise.all([
        User.find({ _id: { $in: userIds } })
          .select("name realName email accountStatus warningCount")
          .lean(),
        ArenaIntegrityRiskCase.find({ userId: { $in: userIds } })
          .sort({ createdAt: -1 })
          .limit(500)
          .lean(),
        AdminActionLog.find({
          $or: [
            { targetUserId: { $in: userIds } },
            { "metadata.matchId": { $in: heldMatchIdStrings } },
          ],
        })
          .sort({ createdAt: -1 })
          .limit(500)
          .lean(),
      ])
    : [[], [], []];
  const usersById = new Map(users.map((user) => [id(user._id), user]));
  const packsById = new Map(problemPacks.map((pack) => [id(pack._id), pack]));
  const evidenceByAttemptId = new Map(
    heldEvidence.map((entry) => [id(entry.attemptId), entry])
  );
  const attemptsByMatchId = new Map();
  for (const attempt of heldAttempts) {
    const matchId = id(attempt.matchId);
    if (!attemptsByMatchId.has(matchId)) attemptsByMatchId.set(matchId, []);
    attemptsByMatchId.get(matchId).push(attempt);
  }
  const todoByMatchId = new Map();
  for (const todo of heldTodos) {
    const sourceMatchId = heldMatchIdStrings.includes(id(todo.sourceId))
      ? id(todo.sourceId)
      : "";
    const matchId = id(todo.metadata?.matchId || sourceMatchId);
    if (matchId && !todoByMatchId.has(matchId)) todoByMatchId.set(matchId, todo);
  }

  const historiesForUser = (userId) => ({
    riskCases: caseHistory
      .filter((entry) => id(entry.userId) === id(userId))
      .slice(0, 10),
    adminActions: actionHistory
      .filter((entry) => id(entry.targetUserId) === id(userId))
      .slice(0, 20),
  });

  const detailedAttempt = (attempt, problemPack) => {
    const score = problemPack
      ? scoreArenaAttempt({ attempt, problemPack })
      : { questionResults: [] };
    const resultByKey = new Map(
      (score.questionResults || []).map((entry) => [entry.questionKey, entry])
    );
    const answerByKey = new Map(
      (attempt.answers || []).map((entry) => [id(entry.questionKey), entry])
    );
    const timingByKey = new Map(
      (attempt.questionTimings || []).map((entry) => [id(entry.questionKey), entry])
    );
    const evidence = evidenceByAttemptId.get(id(attempt._id)) || null;
    return {
      ...attempt,
      id: id(attempt._id),
      user: usersById.get(id(attempt.userId)) || null,
      evidence,
      questions: (problemPack?.questions || []).map((question, index) => ({
        number: index + 1,
        questionKey: question.questionKey,
        typeId: question.typeId,
        prompt: question.prompt,
        correctAnswer: question.answer,
        solution: question.solution,
        submittedAnswer: answerByKey.get(id(question.questionKey))?.value || "",
        correct: resultByKey.get(id(question.questionKey))?.correct === true,
        responseTimeMs:
          timingByKey.get(id(question.questionKey))?.responseTimeMs ?? null,
      })),
    };
  };
  const completedMatchReviewByMatchId = new Map();
  for (const entry of completedMatchActions) {
    const matchId = id(entry.metadata?.matchId);
    if (!matchId || completedMatchReviewByMatchId.has(matchId)) continue;
    completedMatchReviewByMatchId.set(matchId, entry);
  }
  const completedMatchReviews = [...completedMatchReviewByMatchId.values()];

  return {
    openCount: cases.length,
    highCount: cases.filter((entry) => entry.riskLevel === "CRITICAL").length,
    heldCount: heldMatches.length,
    heldMatches: heldMatches.map((match) => {
      const pack = packsById.get(id(match.problemPackId)) || null;
      const matchAttempts = (attemptsByMatchId.get(id(match._id)) || [])
        .map((attempt) => detailedAttempt(attempt, pack));
      const participants = [
        { role: "CHALLENGER", userId: match.challenger?.userId },
        { role: "DEFENDER", userId: match.defender?.userId },
      ].map((participant) => {
        const user = usersById.get(id(participant.userId)) || null;
        return {
          ...participant,
          user,
          history: historiesForUser(participant.userId),
        };
      });
      return {
        ...match,
        id: id(match._id),
        challengerUser: usersById.get(id(match.challenger?.userId)) || null,
        defenderUser: usersById.get(id(match.defender?.userId)) || null,
        attempts: matchAttempts,
        participants,
        problemPack: pack
          ? { id: id(pack._id), version: pack.version, displayName: pack.displayName }
          : null,
        todo: todoByMatchId.get(id(match._id)) || null,
        reviewActions: actionHistory
          .filter((entry) => id(entry.metadata?.matchId) === id(match._id))
          .slice(0, 20),
      };
    }),
    cases: cases.map((entry) => ({
      ...entry,
      id: id(entry._id),
      user: usersById.get(id(entry.userId)) || null,
      linkedUsers: (entry.linkedUserIds || [])
        .map((userId) => usersById.get(id(userId)))
        .filter(Boolean),
    })),
    completedCount: completedMatchReviews.length + completedCases.length,
    completedReviews: [
      ...completedMatchReviews.map((entry) => ({
        id: id(entry._id),
        type: "MATCH",
        matchId: id(entry.metadata?.matchId),
        decision: String(entry.metadata?.decision || ""),
        action: entry.action,
        note: entry.detail || "",
        reviewedAt: entry.createdAt,
        user: usersById.get(id(entry.targetUserId)) || null,
        reviewer: usersById.get(id(entry.adminUserId)) || null,
      })),
      ...completedCases.map((entry) => ({
        id: id(entry._id),
        type: "CASE",
        caseId: id(entry._id),
        decision: entry.status,
        action: entry.status === "CLEARED"
          ? "arena.integrity.case.cleared"
          : "arena.integrity.case.restricted",
        note: entry.decisionNote || "",
        reviewedAt: entry.reviewedAt || entry.updatedAt,
        user: usersById.get(id(entry.userId)) || null,
        reviewer: usersById.get(id(entry.reviewedBy)) || null,
      })),
    ]
      .sort((left, right) => new Date(right.reviewedAt || 0) - new Date(left.reviewedAt || 0))
      .slice(0, 300),
  };
}

async function runArenaIntegrityRiskSchedule({ now = new Date(), limit = 300 } = {}) {
  const [releasedRestrictions, expiredSupplementalRequests] = await Promise.all([
    releaseExpiredMatchmakingRestrictions({ now }),
    expireArenaSupplementalEvidenceRequests({ now }),
  ]);
  const overdueReviews = await ArenaMatch.find({
    status: "HELD",
    integrityStatus: "SUSPICIOUS",
    integrityReviewDeadlineAt: { $lte: now },
  })
    .sort({ integrityReviewDeadlineAt: 1 })
    .limit(Math.max(1, Number(limit) || 300))
    .select("_id")
    .lean();
  for (const match of overdueReviews) {
    await notifyArenaIntegrityReviewOverdue({ matchId: match._id, now });
  }
  const since = new Date(new Date(now).getTime() - DAY_MS);
  const recent = await ArenaMatch.find({
    status: { $in: MATCH_STATUSES_FOR_RISK },
    updatedAt: { $gte: since },
  })
    .sort({ updatedAt: -1 })
    .limit(Math.max(1, Number(limit) || 300))
    .select("challenger.userId defender.userId")
    .lean();
  const userIds = unique(
    recent.flatMap((match) => [match.challenger?.userId, match.defender?.userId])
  );
  let evaluated = 0;
  for (const userId of userIds) {
    await evaluateArenaIntegrityRiskForUser({ userId, now });
    evaluated += 1;
  }
  return {
    matchCount: recent.length,
    userCount: userIds.length,
    evaluated,
    releasedRestrictions,
    expiredSupplementalRequests,
    overdueReviewAlerts: overdueReviews.length,
  };
}

async function releaseExpiredMatchmakingRestrictions({ now = new Date() } = {}) {
  const current = new Date(now);
  const states = await ArenaAccessState.find({
    integrityStatus: "RESTRICTED",
    reasonCode: "INTEGRITY_PENALTY_5_DAYS",
    matchmakingRestrictedUntil: { $lte: current },
  })
    .select("_id userId state currentSeasonPlacementCompleted")
    .lean();
  if (!states.length) return 0;

  await ArenaAccessState.bulkWrite(
    states.map((state) => ({
      updateOne: {
        filter: {
          _id: state._id,
          integrityStatus: "RESTRICTED",
          reasonCode: "INTEGRITY_PENALTY_5_DAYS",
          matchmakingRestrictedUntil: { $lte: current },
        },
        update: {
          $set: {
            integrityStatus: "CLEAR",
            integrityCaseId: null,
            defensePoolEligible: Boolean(
              state.state === "PAID_ACTIVE" &&
              state.currentSeasonPlacementCompleted
            ),
            matchmakingRestrictedUntil: null,
            integrityPenaltyReason: "",
            reasonCode: "INTEGRITY_PENALTY_COMPLETED",
          },
        },
      },
    })),
    { ordered: false }
  );
  await ArenaIntegrityRiskProfile.updateMany(
    { userId: { $in: states.map((state) => state.userId) }, status: "RESTRICTED" },
    {
      $set: {
        status: "CLEAR",
        currentCaseId: null,
        reviewedAt: current,
      },
    }
  );
  return states.length;
}

function startArenaIntegrityRiskScheduler({ intervalMs = 15 * 60 * 1000 } = {}) {
  if (schedulerTimer) return schedulerTimer;
  const run = async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try {
      await withSchedulerLease(
        { name: "ARENA_INTEGRITY_RISK", leaseMs: 10 * 60 * 1000 },
        () => runArenaIntegrityRiskSchedule()
      );
    } catch (error) {
      console.error("GOAT Arena 무결성 위험 점검 실패:", error);
    } finally {
      schedulerRunning = false;
    }
  };
  schedulerTimer = setInterval(run, intervalMs);
  schedulerTimer.unref?.();
  run();
  return schedulerTimer;
}

module.exports = {
  CRITICAL_THRESHOLD,
  POLICY_VERSION,
  RAPID_SUBMISSION_THRESHOLD_MS,
  REVIEW_THRESHOLD,
  calculateArenaIntegrityRisk,
  evaluateArenaIntegrityRiskForUser,
  expireArenaSupplementalEvidenceRequests,
  getAdminArenaIntegrityData,
  cancelHeldArenaMatchForAdminReset,
  hashIntegritySignal,
  networkBucket,
  normalizeIp,
  recordConnectionIntegritySignals,
  recordTrustedIntegritySignal,
  requestArenaSupplementalEvidence,
  reviewArenaIntegrityCase,
  reviewHeldArenaMatch,
  releaseExpiredMatchmakingRestrictions,
  runArenaIntegrityRiskSchedule,
  stableEvidenceHash,
  startArenaIntegrityRiskScheduler,
};
