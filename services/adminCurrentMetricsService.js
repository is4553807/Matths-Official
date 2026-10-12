"use strict";

const {
  ArenaCompetitiveProfile,
  ArenaCompetitiveRecord,
  ArenaGuestChallenge,
  ArenaGuestChallengeAttempt,
  ArenaMatch,
  ArenaPackagePayment,
  ArenaRatingSettlement,
} = require("../models/goatArenaModel");
const {
  PrivateMockExamAttempt,
  PrivateMockWeeklyResult,
  User,
} = require("../models/matthsModel");
const { RefundRequest } = require("../models/refundModel");
const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");
const { ACTIVE_MATCH_STATUSES } = require("./arenaActiveMatchService");

function getKstMonthKey(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
    })
      .formatToParts(new Date(now))
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}`;
}

function shiftMonthKey(periodKey, delta) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(periodKey || ""));
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw Object.assign(new Error("집계 월 형식을 확인해주세요."), { status: 400 });
  }
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getKstMonthPeriod(periodKey = getKstMonthKey()) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(periodKey || ""));
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw Object.assign(new Error("집계 월 형식을 확인해주세요."), { status: 400 });
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  return {
    periodKey: `${year}-${String(month).padStart(2, "0")}`,
    startAt: new Date(Date.UTC(year, month - 1, 1, -9)),
    endAt: new Date(Date.UTC(year, month, 1, -9)),
    label: `${year}년 ${month}월`,
  };
}

function countRows(rows, keyName = "status") {
  return new Map(
    (rows || []).map((row) => [
      String(row?._id?.[keyName] || row?._id || "UNKNOWN"),
      Number(row.count || 0),
    ])
  );
}

function observation({ label = "전체", value, unit = "건", sampleSize, note = "" }) {
  return {
    dimensionsLabel: label,
    valueLabel: `${Number(value || 0).toLocaleString("ko-KR")}${unit}`,
    sampleSize: Number(sampleSize ?? value ?? 0),
    numerator: null,
    denominator: null,
    note,
  };
}

function metric(label, observations, { minimumSampleSize = 1 } = {}) {
  const sampleSize = Math.max(
    0,
    ...(observations || []).map((row) => Number(row.sampleSize || 0))
  );
  return {
    label,
    minimumSampleSize,
    status: sampleSize >= minimumSampleSize ? "reliable" : sampleSize > 0 ? "collecting" : "empty",
    statusLabel: sampleSize >= minimumSampleSize ? "확인 가능" : sampleSize > 0 ? "표본 수집 중" : "기록 없음",
    observations,
  };
}

function category(key, label, metrics) {
  return { key, label, metrics };
}

async function getAdminCurrentMetricsDashboard({
  periodKey = getKstMonthKey(),
  now = new Date(),
} = {}) {
  const period = getKstMonthPeriod(periodKey);
  const withinPeriod = { $gte: period.startAt, $lt: period.endAt };
  const [
    planRows,
    proStarts,
    paymentRows,
    refundRows,
    settledMatchRows,
    activeMatchRows,
    ratingSettlements,
    recordRows,
    placedProfiles,
    unlockedAwaitingPlacement,
    exhaustedPlacements,
    guestRows,
    guestParticipants,
    guestSettledAttempts,
    mockAttempts,
    mockRatedResults,
    heldIntegrity,
  ] = await Promise.all([
    User.aggregate([
      { $match: { role: { $ne: "admin" } } },
      { $group: { _id: { $ifNull: ["$accountPlan.code", "FREE"] }, count: { $sum: 1 } } },
    ]),
    User.countDocuments({
      role: { $ne: "admin" },
      "accountPlan.code": "PRO",
      "accountPlan.startsAt": withinPeriod,
    }),
    ArenaPackagePayment.aggregate([
      {
        $match: {
          productCode: "PRO_MONTHLY",
          approvedAt: withinPeriod,
          status: { $in: ["APPROVED", "APPLIED", "PARTIALLY_REFUNDED"] },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          approvedAmount: { $sum: "$approvedAmount" },
          refundedAmount: { $sum: "$refundedAmount" },
        },
      },
    ]),
    RefundRequest.aggregate([
      { $match: { productCode: "PRO_MONTHLY", requestedAt: withinPeriod } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    ArenaMatch.aggregate([
      {
        $match: {
          gameMode: { $in: ["NORMAL", "COMPETITIVE", "FRIENDLY"] },
          status: "SETTLED",
          settledAt: withinPeriod,
        },
      },
      { $group: { _id: "$gameMode", count: { $sum: 1 } } },
    ]),
    ArenaMatch.aggregate([
      {
        $match: {
          gameMode: { $in: ["NORMAL", "COMPETITIVE", "FRIENDLY"] },
          status: { $in: ACTIVE_MATCH_STATUSES },
        },
      },
      { $group: { _id: "$gameMode", count: { $sum: 1 } } },
    ]),
    ArenaRatingSettlement.countDocuments({
      mode: "COMPETITIVE",
      settledAt: withinPeriod,
    }),
    ArenaCompetitiveRecord.aggregate([
      {
        $group: {
          _id: { mode: "$recordMode", status: "$status" },
          count: { $sum: 1 },
        },
      },
    ]),
    ArenaCompetitiveProfile.countDocuments({ placementFinalizedAt: withinPeriod }),
    ArenaCompetitiveProfile.countDocuments({
      normalMatchesCompleted: { $gte: GOAT_ARENA_V2_CONFIG.requiredNormalMatches },
      placementFinalizedAt: null,
    }),
    ArenaCompetitiveProfile.countDocuments({
      placementAttemptsUsed: { $gte: GOAT_ARENA_V2_CONFIG.placement.maximumAttempts },
      placementFinalizedAt: null,
    }),
    ArenaGuestChallenge.aggregate([
      { $match: { createdAt: withinPeriod } },
      {
        $project: {
          effectiveStatus: {
            $cond: [
              { $eq: ["$status", "REVOKED"] },
              "REVOKED",
              { $cond: [{ $lte: ["$expiresAt", now] }, "EXPIRED", "OPEN"] },
            ],
          },
        },
      },
      { $group: { _id: "$effectiveStatus", count: { $sum: 1 } } },
    ]),
    ArenaGuestChallengeAttempt.countDocuments({
      attemptNumber: 1,
      createdAt: withinPeriod,
    }),
    ArenaGuestChallengeAttempt.countDocuments({
      status: "SETTLED",
      settledAt: withinPeriod,
    }),
    PrivateMockExamAttempt.countDocuments({
      submittedAt: withinPeriod,
      status: "submitted",
    }),
    PrivateMockWeeklyResult.countDocuments({
      publishedAt: withinPeriod,
      "mmrResult.deltaMmr": { $ne: null },
    }),
    ArenaMatch.countDocuments({
      gameMode: { $in: ["NORMAL", "COMPETITIVE"] },
      status: "HELD",
    }),
  ]);

  const plans = countRows(planRows);
  const payments = paymentRows[0] || {};
  const refunds = countRows(refundRows);
  const settledMatches = countRows(settledMatchRows);
  const activeMatches = countRows(activeMatchRows);
  const guests = countRows(guestRows);
  const records = new Map(
    recordRows.map((row) => [
      `${String(row._id?.mode || "UNKNOWN")}:${String(row._id?.status || "UNKNOWN")}`,
      Number(row.count || 0),
    ])
  );

  const categories = [
    category("plans", "계정 플랜", [
      metric("현재 플랜 분포", [
        observation({ label: "무료", value: plans.get("FREE") || 0, unit: "명" }),
        observation({ label: "Pro", value: plans.get("PRO") || 0, unit: "명" }),
      ]),
      metric("월간 Pro 시작", [observation({ value: proStarts, unit: "명" })]),
    ]),
    category("payments", "Pro 결제·환불", [
      metric("승인된 Pro 결제", [
        observation({ label: "결제", value: payments.count || 0 }),
        observation({ label: "승인 금액", value: payments.approvedAmount || 0, unit: "원" }),
        observation({ label: "환불 반영 금액", value: payments.refundedAmount || 0, unit: "원" }),
      ]),
      metric("Pro 환불 요청", [
        observation({ label: "요청", value: refunds.get("REQUESTED") || 0 }),
        observation({ label: "계산 완료", value: refunds.get("CALCULATED") || 0 }),
        observation({ label: "처리 완료", value: refunds.get("COMPLETED") || 0 }),
        observation({ label: "반려", value: refunds.get("REJECTED") || 0 }),
      ]),
    ]),
    category("arena", "GOAT Arena", [
      metric("월간 정산 경기", [
        observation({ label: "일반전", value: settledMatches.get("NORMAL") || 0 }),
        observation({ label: "경쟁전", value: settledMatches.get("COMPETITIVE") || 0 }),
        observation({ label: "친선전", value: settledMatches.get("FRIENDLY") || 0 }),
      ]),
      metric("현재 진행 경기", [
        observation({ label: "일반전", value: activeMatches.get("NORMAL") || 0 }),
        observation({ label: "경쟁전", value: activeMatches.get("COMPETITIVE") || 0 }),
        observation({ label: "친선전", value: activeMatches.get("FRIENDLY") || 0 }),
      ]),
      metric("과거 기록 풀", [
        observation({ label: "일반전 사용 가능", value: records.get("NORMAL:AVAILABLE") || 0, note: "현재 시점 재고" }),
        observation({ label: "일반전 예약", value: records.get("NORMAL:RESERVED") || 0, note: "현재 시점 재고" }),
        observation({ label: "경쟁전 사용 가능", value: records.get("COMPETITIVE:AVAILABLE") || 0, note: "현재 시점 재고" }),
        observation({ label: "경쟁전 예약", value: records.get("COMPETITIVE:RESERVED") || 0, note: "현재 시점 재고" }),
      ]),
      metric("경쟁전 MMR 정산", [observation({ value: ratingSettlements })]),
      metric("배치 상태", [
        observation({ label: "이번 달 확정", value: placedProfiles, unit: "명" }),
        observation({ label: "3경기 해금 후 미배치", value: unlockedAwaitingPlacement, unit: "명", note: "현재 시점" }),
        observation({ label: "운영자 검토 필요", value: exhaustedPlacements, unit: "명", note: "5회 소진·유효 결과 없음" }),
      ]),
      metric("무결성 보류", [
        observation({ value: heldIntegrity, note: "일반전·경쟁전만 집계" }),
      ]),
    ]),
    category("guest", "게스트 친선전", [
      metric("월간 도전장 링크", [
        observation({ label: "대기", value: guests.get("OPEN") || 0 }),
        observation({ label: "만료", value: guests.get("EXPIRED") || 0 }),
        observation({ label: "취소", value: guests.get("REVOKED") || 0 }),
      ]),
      metric("월간 도전장 참여", [
        observation({ label: "참가자", value: guestParticipants, unit: "명" }),
        observation({ label: "완료 기록", value: guestSettledAttempts }),
      ]),
    ]),
    category("weekly-mock", "주간 모의고사", [
      metric("월간 제출", [observation({ value: mockAttempts })]),
      metric("MMR 반영", [
        observation({ value: mockRatedResults, note: "응시자만 반영하며 미응시자는 0점 변동" }),
      ]),
    ]),
  ];

  const metrics = categories.flatMap((entry) => entry.metrics);
  const observedMetricCount = metrics.filter((entry) => entry.status !== "empty").length;
  return {
    period,
    periodOptions: Array.from({ length: 12 }, (_, index) => {
      const key = shiftMonthKey(getKstMonthKey(now), -index);
      return { key, label: `${key.slice(0, 4)}년 ${Number(key.slice(5))}월` };
    }),
    generatedAt: new Date(now),
    periodClosed: period.endAt <= now,
    summary: {
      catalogMetricCount: metrics.length,
      observedMetricCount,
      waitingMetricCount: metrics.length - observedMetricCount,
      reliableMetricCount: metrics.filter((entry) => entry.status === "reliable").length,
      observationRowCount: metrics.reduce((sum, entry) => sum + entry.observations.length, 0),
    },
    categories,
    assumptions: [],
  };
}

module.exports = {
  getAdminCurrentMetricsDashboard,
  getKstMonthKey,
  getKstMonthPeriod,
};
