const crypto = require("node:crypto");
const net = require("node:net");
const mongoose = require("mongoose");
const {
  ArenaAccessState,
  ArenaIntegrityLinkSignal,
  ArenaIntegrityRiskCase,
  ArenaIntegrityRiskProfile,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaMatchAttempt,
} = require("../models/goatArenaModel");
const {
  AdminTodo,
  User,
  UserNotification,
} = require("../models/matthsModel");
const { createAdminTodo } = require("./adminTodoService");

const POLICY_VERSION = "ARENA-INTEGRITY-RISK-V1";
const REVIEW_THRESHOLD = 40;
const CRITICAL_THRESHOLD = 75;
const RISK_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
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

let schedulerTimer = null;
let schedulerRunning = false;
const signalWriteCache = new Map();

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
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
    if (Number(ownAttempt?.activeSolveTimeMs) > 0 && Number(ownAttempt.activeSolveTimeMs) < 60000) {
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
      addReason({ code: "REPEATED_RAPID_SUBMISSION", label: "반복되는 비정상 빠른 제출", description: `60초 미만 제출이 ${stats.rapidSubmissions}회 확인되었습니다.`, points: 15, count: stats.rapidSubmissions, opponentId: stats.opponentId, matchIds: stats.matchIds });
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
            defensePoolEligible: false,
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
  riskCase.decisionNote = String(note || "").trim().slice(0, 1000);
  await riskCase.save();

  const accessState = await ArenaAccessState.findOne({ userId: riskCase.userId }).lean();
  const restoreDefensePool = Boolean(
    cleared &&
      accessState?.state === "PAID_ACTIVE" &&
      accessState?.currentSeasonPlacementCompleted
  );
  await Promise.all([
    ArenaIntegrityRiskProfile.updateOne(
      { userId: riskCase.userId },
      {
        $set: {
          status: cleared ? "CLEAR" : "RESTRICTED",
          lastReviewedEvidenceHash: riskCase.evidenceHash,
          currentCaseId: null,
          reviewedAt: now,
          reviewedBy: adminUserId,
        },
      }
    ),
    ArenaAccessState.updateOne(
      { userId: riskCase.userId },
      {
        $set: {
          integrityStatus: cleared ? "CLEAR" : "RESTRICTED",
          integrityCaseId: null,
          defensePoolEligible: restoreDefensePool,
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
    UserNotification.findOneAndUpdate(
      { dedupeKey: `arena-integrity-review:${riskCase._id}:${decision}` },
      {
        $setOnInsert: {
          userId: riskCase.userId,
          title: cleared
            ? "GOAT Arena 무결성 검토 완료"
            : "GOAT Arena 이용 제한 안내",
          message: cleared
            ? "관리자 검토 결과 이상이 확인되지 않아 신규 경기 참가 보류가 해제되었습니다."
            : "관리자 검토 결과 계정·경기 무결성 위험이 확인되어 신규 경기 참가가 제한되었습니다. 자세한 내용은 고객센터로 문의해주세요.",
          href: "/goat-arena/profile",
          kind: "integrity",
          sourceType: "ArenaIntegrityRiskCase",
          sourceId: riskCase._id,
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    ),
  ]);
  return { caseId: id(riskCase._id), status: riskCase.status };
}

async function getAdminArenaIntegrityData() {
  const cases = await ArenaIntegrityRiskCase.find({ status: "OPEN" })
    .sort({ riskScore: -1, createdAt: 1 })
    .limit(200)
    .lean();
  const userIds = unique(cases.flatMap((entry) => [entry.userId, ...(entry.linkedUserIds || [])]));
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select("name realName email accountStatus").lean()
    : [];
  const usersById = new Map(users.map((user) => [id(user._id), user]));
  return {
    openCount: cases.length,
    highCount: cases.filter((entry) => entry.riskLevel === "CRITICAL").length,
    cases: cases.map((entry) => ({
      ...entry,
      id: id(entry._id),
      user: usersById.get(id(entry.userId)) || null,
      linkedUsers: (entry.linkedUserIds || [])
        .map((userId) => usersById.get(id(userId)))
        .filter(Boolean),
    })),
  };
}

async function runArenaIntegrityRiskSchedule({ now = new Date(), limit = 300 } = {}) {
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
  return { matchCount: recent.length, userCount: userIds.length, evaluated };
}

function startArenaIntegrityRiskScheduler({ intervalMs = 15 * 60 * 1000 } = {}) {
  if (schedulerTimer) return schedulerTimer;
  const run = async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try {
      await runArenaIntegrityRiskSchedule();
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
  REVIEW_THRESHOLD,
  calculateArenaIntegrityRisk,
  evaluateArenaIntegrityRiskForUser,
  getAdminArenaIntegrityData,
  hashIntegritySignal,
  networkBucket,
  normalizeIp,
  recordConnectionIntegritySignals,
  recordTrustedIntegritySignal,
  reviewArenaIntegrityCase,
  runArenaIntegrityRiskSchedule,
  stableEvidenceHash,
  startArenaIntegrityRiskScheduler,
};
