const { randomUUID } = require("node:crypto");
const {
  FIRST_MONTH_ASSUMPTIONS,
  FIRST_MONTH_METRICS,
} = require("../dataAnalysis/metricCatalog");
const { DataAnalysis } = require("../dataAnalysis/dataAnalysisModel");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaPackagePayment,
  ArenaPaybackReview,
  ArenaRevengeRight,
  ArenaSnapshot,
  ArenaStanding,
  MainInvitationOffer,
  MainInvitationRequest,
  MainToSubConversionResult,
  RenewalRankAssessment,
} = require("../models/goatArenaModel");
const {
  AUTOMATIC_MONTHLY_SOURCE,
  seedFirstMonthCatalog,
  upsertMonthlyObservations,
} = require("./dataAnalysisService");

const CALCULATION_VERSION = "MONTHLY_LEDGER_V1";
const SCHEDULER_INTERVAL_MS = 15 * 60 * 1000;
const DASHBOARD_CACHE_TTL_MS = 2 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TIER_ORDER = [
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
];
const TIER_ALIASES = {
  BRONZE: "BRONZE",
  브론즈: "BRONZE",
  SILVER: "SILVER",
  실버: "SILVER",
  GOLD: "GOLD",
  골드: "GOLD",
  PLATINUM: "PLATINUM",
  플래티넘: "PLATINUM",
  EMERALD: "EMERALD",
  에메랄드: "EMERALD",
  DIAMOND: "DIAMOND",
  다이아몬드: "DIAMOND",
  MASTER: "MASTER",
  마스터: "MASTER",
  GRANDMASTER: "GRANDMASTER",
  그랜드마스터: "GRANDMASTER",
  CHALLENGER: "CHALLENGER",
  챌린저: "CHALLENGER",
};
const TIER_LABELS = {
  BRONZE: "브론즈",
  SILVER: "실버",
  GOLD: "골드",
  PLATINUM: "플래티넘",
  EMERALD: "에메랄드",
  DIAMOND: "다이아몬드",
  MASTER: "마스터",
  GRANDMASTER: "그랜드마스터",
  CHALLENGER: "챌린저",
};
const CATEGORY_LABELS = {
  payment: "결제",
  "access-cycle": "학습권 이용 주기",
  conversion: "전환",
  support: "고객 지원",
  renewal: "재구매",
  division: "Division 이동",
  "main-division": "Main Division 체류",
  "main-match-liquidity": "Main Division 경기 성립",
  "main-economy": "Main Division 학습일수",
  "main-invitation": "Main Division 초대",
  "main-revenge": "Main Division 복수전",
  integrity: "경기 무결성",
  operations: "운영",
  payback: "페이백",
  "match-liquidity": "경기 상대 풀",
  simulation: "출시 전 가정 비교",
};
const METRIC_BY_KEY = new Map([
  ...FIRST_MONTH_METRICS.map((metric) => [metric.key, metric]),
  ...FIRST_MONTH_ASSUMPTIONS.map((metric) => [
    metric.key,
    { ...metric, category: "simulation" },
  ]),
]);

let schedulerTimer = null;
let schedulerRunning = false;
const dashboardCache = new Map();

function identifier(value) {
  return String(value?._id || value || "");
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

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
  if (!match) throw Object.assign(new Error("집계 월 형식을 확인해주세요."), { status: 400 });
  if (Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw Object.assign(new Error("집계 월 형식을 확인해주세요."), { status: 400 });
  }
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getKstMonthPeriod(periodKey = getKstMonthKey()) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(periodKey || ""));
  if (!match) throw Object.assign(new Error("집계 월 형식을 확인해주세요."), { status: 400 });
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw Object.assign(new Error("집계 월 형식을 확인해주세요."), { status: 400 });
  }
  return {
    periodKey: `${year}-${String(month).padStart(2, "0")}`,
    startAt: new Date(Date.UTC(year, month - 1, 1, -9)),
    endAt: new Date(Date.UTC(year, month, 1, -9)),
  };
}

function percent(numerator, denominator) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function average(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length
    ? finite.reduce((sum, value) => sum + value, 0) / finite.length
    : null;
}

function normalizeTier(value) {
  return TIER_ALIASES[String(value || "").trim().toUpperCase()] ||
    TIER_ALIASES[String(value || "").trim()] ||
    String(value || "").trim().toUpperCase();
}

function tierGap(sourceTier, targetTier) {
  const sourceIndex = TIER_ORDER.indexOf(normalizeTier(sourceTier));
  const targetIndex = TIER_ORDER.indexOf(normalizeTier(targetTier));
  return sourceIndex >= 0 && targetIndex >= 0
    ? Math.abs(targetIndex - sourceIndex)
    : 0;
}

function policyContext(documents = []) {
  const codes = [...new Set(
    documents
      .map((document) => String(document?.policyVersionCode || "").trim())
      .filter(Boolean)
  )].sort();
  return {
    policyVersionCode:
      codes.length === 1
        ? codes[0]
        : codes.length > 1
          ? "MULTIPLE_POLICY_VERSIONS"
          : "",
    note: codes.length
      ? `집계에 포함된 정책 버전 수: ${codes.length}`
      : "정책 표본 없음",
  };
}

function observation(metricKey, values = {}) {
  const definition = METRIC_BY_KEY.get(metricKey);
  if (!definition) throw new Error(`정의되지 않은 운영 지표입니다: ${metricKey}`);
  return {
    metricKey,
    label: definition.label,
    category: definition.category,
    unit: definition.unit,
    dimensionNames: definition.dimensions || [],
    numericValue: values.numericValue,
    numerator: values.numerator ?? null,
    denominator: values.denominator ?? null,
    sampleSize: values.sampleSize ?? values.denominator ?? 0,
    dimensions: values.dimensions || {},
    policyVersionCode: values.policyVersionCode || "",
    note: values.note || "",
  };
}

function groupBy(items, keyFactory) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFactory(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function learningDayBucket(days) {
  if (days <= 4) return "0~4일";
  if (days <= 9) return "5~9일";
  if (days <= 14) return "10~14일";
  return "15일 이상";
}

function rankBucket(position) {
  if (numeric(position) <= 20) return "1~20위";
  if (numeric(position) <= 50) return "21~50위";
  return "51위 이하";
}

function resultLabel(status) {
  return {
    ACCEPTED: "수락",
    DECLINED: "거절",
    SUPERSEDED: "다른 사용자 선착순 수락",
    INELIGIBLE: "응답 시점 자격 없음",
  }[status] || "기타 종료";
}

function releaseReasonLabel(invitation) {
  const reason = String(invitation.cancelReason || "").trim();
  if (!reason) return invitation.status === "INVALID" ? "자격 검증 실패" : "직접 취소";
  if (/balance|learning|day|잔액|학습/i.test(reason)) return "학습일수 부족";
  if (/admin|operator|관리/i.test(reason)) return "운영자 처리";
  if (/cancel|취소/i.test(reason)) return "직접 취소";
  return "기타 사유";
}

function calculateMonthlyObservations({
  now,
  period,
  payments = [],
  paidCycles = [],
  depletedCycles = [],
  renewalCycles = [],
  renewalAssessments = [],
  mainStartedCycles = [],
  conversions = [],
  paybackReviews = [],
  paybackCycles = [],
  matchesCreated = [],
  matchesConcluded = [],
  invitations = [],
  invitationOffers = [],
  revengeRights = [],
  mainEntryLedgers = [],
  activeDefenders = [],
  includeCurrentSnapshot = true,
}) {
  const rows = [];
  const measuredUntil = Math.min(new Date(now).getTime(), period.endAt.getTime());
  const paymentPolicy = policyContext(payments);
  const cyclePolicy = policyContext(paidCycles);
  const matchPolicy = policyContext(matchesCreated);

  const validPayments = payments.filter((payment) =>
    ["APPROVED", "APPLIED"].includes(payment.status)
  );
  const reversedPayments = payments.filter((payment) =>
    ["CANCELLED", "REFUNDED"].includes(payment.status)
  );
  rows.push(
    observation("payment.successful_count", {
      numericValue: validPayments.length,
      numerator: validPayments.length,
      denominator: payments.length,
      sampleSize: payments.length,
      ...paymentPolicy,
    }),
    observation("payment.net_approved_amount", {
      numericValue: validPayments.reduce(
        (sum, payment) => sum + numeric(payment.approvedAmount),
        0
      ),
      sampleSize: validPayments.length,
      ...paymentPolicy,
    }),
    observation("payment.refund_cancel_rate", {
      numericValue: percent(reversedPayments.length, payments.length),
      numerator: reversedPayments.length,
      denominator: payments.length,
      sampleSize: payments.length,
      ...paymentPolicy,
    })
  );

  const depletedPaidCycles = paidCycles.filter(
    (cycle) => cycle.depletedAt && new Date(cycle.depletedAt).getTime() <= measuredUntil
  );
  const depletionDays = depletedPaidCycles.map((cycle) =>
    Math.max(
      1,
      Math.floor(
        (new Date(cycle.depletedAt).getTime() - new Date(cycle.startsAt).getTime()) /
          DAY_MS
      ) + 1
    )
  );
  const sameDayCycles = paidCycles.filter((cycle) => cycle.firstDayMode === "SAME_DAY");
  const nextDayCycles = paidCycles.filter((cycle) => cycle.firstDayMode === "NEXT_DAY");
  const cycleNote = `${cyclePolicy.note} · 해당 월 결제 학습권 이용 주기 코호트 기준`;
  rows.push(
    observation("access.zero_balance_rate", {
      numericValue: percent(depletedPaidCycles.length, paidCycles.length),
      numerator: depletedPaidCycles.length,
      denominator: paidCycles.length,
      sampleSize: paidCycles.length,
      policyVersionCode: cyclePolicy.policyVersionCode,
      note: cycleNote,
    }),
    observation("access.average_depletion_day", {
      numericValue: average(depletionDays),
      numerator: depletionDays.reduce((sum, value) => sum + value, 0),
      denominator: depletionDays.length,
      sampleSize: depletionDays.length,
      policyVersionCode: cyclePolicy.policyVersionCode,
      note: cycleNote,
    }),
    observation("access.first_use_before_20_share", {
      numericValue: percent(sameDayCycles.length, paidCycles.length),
      numerator: sameDayCycles.length,
      denominator: paidCycles.length,
      sampleSize: paidCycles.length,
      policyVersionCode: cyclePolicy.policyVersionCode,
      note: cycleNote,
    }),
    observation("access.first_use_after_20_share", {
      numericValue: percent(nextDayCycles.length, paidCycles.length),
      numerator: nextDayCycles.length,
      denominator: paidCycles.length,
      sampleSize: paidCycles.length,
      policyVersionCode: cyclePolicy.policyVersionCode,
      note: cycleNote,
    })
  );

  const renewalsByUser = groupBy(renewalCycles, (cycle) => identifier(cycle.userId));
  const renewalOutcomes = depletedCycles.map((cycle) => {
    const depletedAt = new Date(cycle.depletedAt).getTime();
    const nextCycle = (renewalsByUser.get(identifier(cycle.userId)) || [])
      .filter(
        (candidate) =>
          identifier(candidate._id) !== identifier(cycle._id) &&
          new Date(candidate.paidAt).getTime() > depletedAt
      )
      .sort((left, right) => new Date(left.paidAt) - new Date(right.paidAt))[0];
    return {
      cycle,
      elapsedSinceDepletion: new Date(now).getTime() - depletedAt,
      renewalDelay: nextCycle
        ? new Date(nextCycle.paidAt).getTime() - depletedAt
        : null,
    };
  });
  const eligible24 = renewalOutcomes.filter(
    (outcome) =>
      outcome.elapsedSinceDepletion >= DAY_MS ||
      (outcome.renewalDelay !== null && outcome.renewalDelay <= DAY_MS)
  );
  const eligible72 = renewalOutcomes.filter(
    (outcome) =>
      outcome.elapsedSinceDepletion >= 3 * DAY_MS ||
      (outcome.renewalDelay !== null && outcome.renewalDelay <= 3 * DAY_MS)
  );
  const within24 = eligible24.filter(
    (outcome) => outcome.renewalDelay !== null && outcome.renewalDelay <= DAY_MS
  );
  const within72 = eligible72.filter(
    (outcome) => outcome.renewalDelay !== null && outcome.renewalDelay <= 3 * DAY_MS
  );
  const lateRenewals = eligible72.filter(
    (outcome) => outcome.renewalDelay !== null && outcome.renewalDelay > 3 * DAY_MS
  );
  const renewalPolicy = policyContext(depletedCycles);
  rows.push(
    observation("renewal.within_24h_rate", {
      numericValue: percent(within24.length, eligible24.length),
      numerator: within24.length,
      denominator: eligible24.length,
      sampleSize: eligible24.length,
      ...renewalPolicy,
    }),
    observation("renewal.within_72h_rate", {
      numericValue: percent(within72.length, eligible72.length),
      numerator: within72.length,
      denominator: eligible72.length,
      sampleSize: eligible72.length,
      ...renewalPolicy,
    }),
    observation("renewal.late_rate", {
      numericValue: percent(lateRenewals.length, eligible72.length),
      numerator: lateRenewals.length,
      denominator: eligible72.length,
      sampleSize: eligible72.length,
      ...renewalPolicy,
    })
  );

  const completedAssessments = renewalAssessments.filter(
    (assessment) => assessment.status === "COMPLETED"
  );
  rows.push(
    observation("renewal.assessment_completion_rate", {
      numericValue: percent(completedAssessments.length, renewalAssessments.length),
      numerator: completedAssessments.length,
      denominator: renewalAssessments.length,
      sampleSize: renewalAssessments.length,
      note: "해당 월에 생성된 랭크 탈환 배치고사 기준",
    }),
    observation("renewal.late_success_rate", {
      numericValue: percent(completedAssessments.length, renewalAssessments.length),
      numerator: completedAssessments.length,
      denominator: renewalAssessments.length,
      sampleSize: renewalAssessments.length,
      note: "72시간 이후 재구매로 생성된 랭크 탈환 배치고사 완료 기준",
    })
  );

  const mainDepletedCycles = depletedCycles.filter((cycle) => cycle.division === "MAIN");
  const convertedCycleIds = new Set(
    conversions.map((item) => identifier(item.sourceAccessCycleId)).filter(Boolean)
  );
  const convertedMainCycles = mainDepletedCycles.filter((cycle) =>
    convertedCycleIds.has(identifier(cycle._id))
  );
  rows.push(
    observation("main.expiry_to_sub_rate", {
      numericValue: percent(convertedMainCycles.length, mainDepletedCycles.length),
      numerator: convertedMainCycles.length,
      denominator: mainDepletedCycles.length,
      sampleSize: mainDepletedCycles.length,
      ...policyContext(mainDepletedCycles),
    }),
    observation("main.average_active_days_before_demotion", {
      numericValue: average(
        mainDepletedCycles.map((cycle) =>
          Math.max(
            0,
            (new Date(cycle.depletedAt).getTime() - new Date(cycle.startsAt).getTime()) /
              DAY_MS
          )
        )
      ),
      sampleSize: mainDepletedCycles.length,
      ...policyContext(mainDepletedCycles),
    })
  );
  const conversionGroups = groupBy(
    conversions,
    (conversion) => normalizeTier(conversion.referenceSubRank) || "UNKNOWN"
  );
  if (!conversionGroups.size) {
    rows.push(
      observation("main.expiry_to_sub_tier_distribution", {
        numericValue: 0,
        sampleSize: 0,
        note: "해당 월 Main Division 전환 표본 없음",
      })
    );
  } else {
    for (const [tier, items] of conversionGroups) {
      rows.push(
        observation("main.expiry_to_sub_tier_distribution", {
          numericValue: items.length,
          numerator: items.length,
          sampleSize: conversions.length,
          dimensions: { tier },
          note: "Main Division 만료 시 저장된 Sub Division 변환 기준",
        })
      );
    }
  }

  const entryDaysByCycle = new Map();
  for (const ledger of mainEntryLedgers) {
    const cycleId = identifier(ledger.accessCycleId);
    entryDaysByCycle.set(
      cycleId,
      numeric(entryDaysByCycle.get(cycleId)) +
        Math.max(0, numeric(ledger.availableLearningDaysDelta))
    );
  }
  const mainEntryValues = mainStartedCycles.map((cycle) => ({
    cycle,
    days: numeric(entryDaysByCycle.get(identifier(cycle._id))),
  }));
  const entryGroups = groupBy(mainEntryValues, (entry) => learningDayBucket(entry.days));
  if (!entryGroups.size) {
    rows.push(
      observation("main.entry_learning_days_distribution", {
        numericValue: 0,
        sampleSize: 0,
        note: "해당 월 Main Division 진입 표본 없음",
      })
    );
  } else {
    for (const [bucket, items] of entryGroups) {
      rows.push(
        observation("main.entry_learning_days_distribution", {
          numericValue: items.length,
          numerator: items.length,
          sampleSize: mainEntryValues.length,
          dimensions: { learningDayBucket: bucket },
          ...policyContext(items.map((item) => item.cycle)),
        })
      );
    }
  }

  const mainMatches = matchesCreated.filter((match) => match.division === "MAIN");
  const stakeGroups = groupBy(mainMatches, (match) =>
    JSON.stringify({
      matchType: match.matchType,
      tierGap: tierGap(match.challenger?.tupleBefore?.arenaRank, match.defender?.tupleBefore?.arenaRank),
      stakeDays: numeric(match.challenger?.stakeDays || match.economySnapshot?.challengerStakeDays),
    })
  );
  if (!stakeGroups.size) {
    rows.push(
      observation("main.stake_days_distribution", {
        numericValue: 0,
        sampleSize: 0,
        note: "해당 월 Main Division 경기 생성 표본 없음",
      })
    );
  } else {
    for (const [key, items] of stakeGroups) {
      rows.push(
        observation("main.stake_days_distribution", {
          numericValue: items.length,
          numerator: items.length,
          sampleSize: mainMatches.length,
          dimensions: JSON.parse(key),
          ...matchPolicy,
        })
      );
    }
  }

  const invitationGroups = groupBy(invitations, (invitation) =>
    JSON.stringify({
      sourceTier: normalizeTier(invitation.initiatorArenaTier),
      targetTier: normalizeTier(invitation.targetTier),
      tierGap: tierGap(invitation.initiatorArenaTier, invitation.targetTier),
    })
  );
  if (!invitationGroups.size) {
    rows.push(
      observation("main.invitation_acceptance_rate", {
        numericValue: null,
        sampleSize: 0,
        note: "해당 월 Main Division 초대 표본 없음",
      })
    );
  } else {
    for (const [key, items] of invitationGroups) {
      const accepted = items.filter((invitation) => invitation.status === "MATCHED");
      rows.push(
        observation("main.invitation_acceptance_rate", {
          numericValue: percent(accepted.length, items.length),
          numerator: accepted.length,
          denominator: items.length,
          sampleSize: items.length,
          dimensions: JSON.parse(key),
          ...policyContext(items),
        })
      );
    }
  }

  const respondedOffers = invitationOffers.filter(
    (offer) => offer.respondedAt && offer.offeredAt
  );
  const offerGroups = groupBy(respondedOffers, (offer) => resultLabel(offer.status));
  if (!offerGroups.size) {
    rows.push(
      observation("main.invitation_response_time", {
        numericValue: null,
        sampleSize: 0,
        note: "해당 월 초대 응답 표본 없음",
      })
    );
  } else {
    for (const [result, items] of offerGroups) {
      rows.push(
        observation("main.invitation_response_time", {
          numericValue: average(
            items.map(
              (offer) =>
                (new Date(offer.respondedAt).getTime() -
                  new Date(offer.offeredAt).getTime()) /
                60000
            )
          ),
          sampleSize: items.length,
          dimensions: { result },
        })
      );
    }
  }
  const offersByInvitation = groupBy(
    invitationOffers,
    (offer) => identifier(offer.invitationRequestId)
  );
  const reselections = invitations.map((invitation) =>
    Math.max(0, (offersByInvitation.get(identifier(invitation._id)) || []).length - 1)
  );
  rows.push(
    observation("main.invitation_reselection_count", {
      numericValue: average(reselections),
      numerator: reselections.reduce((sum, value) => sum + value, 0),
      denominator: invitations.length,
      sampleSize: invitations.length,
      note: "초대 한 건당 첫 후보 이후 추가 발송 횟수 평균",
    })
  );
  const releasedInvitations = invitations.filter((invitation) =>
    ["CANCELLED", "INVALID"].includes(invitation.status)
  );
  const releaseGroups = groupBy(releasedInvitations, releaseReasonLabel);
  if (!releaseGroups.size) {
    rows.push(
      observation("main.invitation_release_reason_distribution", {
        numericValue: 0,
        sampleSize: 0,
        note: "해당 월 초대 예약 해제 표본 없음",
      })
    );
  } else {
    for (const [reasonCode, items] of releaseGroups) {
      rows.push(
        observation("main.invitation_release_reason_distribution", {
          numericValue: items.length,
          numerator: items.length,
          sampleSize: releasedInvitations.length,
          dimensions: { reasonCode },
        })
      );
    }
  }

  const mainRevengeRights = revengeRights.filter((right) => right.division === "MAIN");
  const usedRevengeRights = mainRevengeRights.filter((right) =>
    ["CLAIMED", "CONSUMED"].includes(right.status)
  );
  rows.push(
    observation("main.revenge_usage_rate", {
      numericValue: percent(usedRevengeRights.length, mainRevengeRights.length),
      numerator: usedRevengeRights.length,
      denominator: mainRevengeRights.length,
      sampleSize: mainRevengeRights.length,
    })
  );

  const concludedMainMatches = matchesConcluded.filter(
    (match) => match.division === "MAIN"
  );
  const heldMainMatches = concludedMainMatches.filter(
    (match) =>
      ["HELD", "INVALID"].includes(match.status) ||
      ["SUSPICIOUS", "INVALID"].includes(match.integrityStatus)
  );
  rows.push(
    observation("main.integrity_hold_rate", {
      numericValue: percent(heldMainMatches.length, concludedMainMatches.length),
      numerator: heldMainMatches.length,
      denominator: concludedMainMatches.length,
      sampleSize: concludedMainMatches.length,
      ...policyContext(concludedMainMatches),
    })
  );

  const reviewCycleById = new Map(
    paybackCycles.map((cycle) => [identifier(cycle._id), cycle])
  );
  const qualifiedReviews = paybackReviews.filter((review) => review.status === "QUALIFIED");
  rows.push(
    observation("payback.recipient_rate", {
      numericValue: percent(qualifiedReviews.length, paybackReviews.length),
      numerator: qualifiedReviews.length,
      denominator: paybackReviews.length,
      sampleSize: paybackReviews.length,
      ...policyContext(paybackCycles),
    })
  );
  const reviewedPaymentAmount = paybackReviews.reduce(
    (sum, review) => sum + numeric(reviewCycleById.get(identifier(review.cycleId))?.pricePaid),
    0
  );
  const paidPaybackAmount = paybackReviews.reduce((sum, review) => {
    const cycle = reviewCycleById.get(identifier(review.cycleId));
    return sum +
      (cycle?.paybackPayoutStatus === "COMPLETED" ? numeric(cycle.paybackAmount) : 0);
  }, 0);
  rows.push(
    observation("payback.payout_rate", {
      numericValue: percent(paidPaybackAmount, reviewedPaymentAmount),
      numerator: paidPaybackAmount,
      denominator: reviewedPaymentAmount,
      sampleSize: paybackReviews.length,
      ...policyContext(paybackCycles),
      note: "실제 지급 완료 상태인 페이백 금액만 분자에 포함",
    })
  );
  const bandGroups = groupBy(qualifiedReviews, (review) =>
    String(numeric(review.result?.paybackRate))
  );
  if (!bandGroups.size) {
    rows.push(
      observation("payback.band_distribution", {
        numericValue: 0,
        sampleSize: 0,
        note: "해당 월 페이백 수령 표본 없음",
      })
    );
  } else {
    for (const [ratePercent, items] of bandGroups) {
      rows.push(
        observation("payback.band_distribution", {
          numericValue: items.length,
          numerator: items.length,
          sampleSize: qualifiedReviews.length,
          dimensions: { ratePercent },
        })
      );
    }
  }
  const reviewedAttackCounts = paybackReviews.map((review) =>
    numeric(
      review.evaluatedInputs?.paidNormalAttacksCompleted ??
        reviewCycleById.get(identifier(review.cycleId))?.paidNormalAttacksCompleted
    )
  );
  rows.push(
    observation("payback.average_paid_attacks", {
      numericValue: average(reviewedAttackCounts),
      numerator: reviewedAttackCounts.reduce((sum, value) => sum + value, 0),
      denominator: reviewedAttackCounts.length,
      sampleSize: reviewedAttackCounts.length,
    })
  );
  const failureReasons = paybackReviews.flatMap((review) => {
    if (review.status !== "NOT_QUALIFIED") return [];
    const cycle = reviewCycleById.get(identifier(review.cycleId));
    return review.result?.disqualifiers || cycle?.paybackDisqualifiers || [];
  });
  const failureGroups = groupBy(failureReasons, (reason) => String(reason || "기타 사유"));
  if (!failureGroups.size) {
    rows.push(
      observation("payback.failure_reason_distribution", {
        numericValue: 0,
        sampleSize: 0,
        note: "해당 월 페이백 미달 사유 표본 없음",
      })
    );
  } else {
    for (const [reasonCode, items] of failureGroups) {
      rows.push(
        observation("payback.failure_reason_distribution", {
          numericValue: items.length,
          numerator: items.length,
          sampleSize: failureReasons.length,
          dimensions: { reasonCode },
        })
      );
    }
  }

  const settledMatches = matchesConcluded.filter((match) => match.status === "SETTLED");
  const challengerWins = settledMatches.filter((match) => match.winnerRole === "CHALLENGER");
  rows.push(
    observation("simulation.challenger_win_rate", {
      numericValue: percent(challengerWins.length, settledMatches.length),
      numerator: challengerWins.length,
      denominator: settledMatches.length,
      sampleSize: settledMatches.length,
      ...policyContext(settledMatches),
      note: "출시 전 승률 가정과 비교하는 실제 정산 경기값",
    })
  );
  const bronzeChallengerWins = challengerWins.filter(
    (match) => normalizeTier(match.challenger?.tupleBefore?.arenaRank) === "BRONZE"
  );
  const bronzeReturns = bronzeChallengerWins.filter(
    (match) => numeric(match.resultSnapshot?.settlementSummary?.returnedLearningDays) > 0
  );
  rows.push(
    observation("simulation.bronze_self_return_rate", {
      numericValue: percent(bronzeReturns.length, bronzeChallengerWins.length),
      numerator: bronzeReturns.length,
      denominator: bronzeChallengerWins.length,
      sampleSize: bronzeChallengerWins.length,
      note: "브론즈 도전자 승리 경기 중 예치 학습일수 반환 비율",
    })
  );

  if (includeCurrentSnapshot) {
    const defenderGroups = groupBy(activeDefenders, (defender) =>
      JSON.stringify({
        division: defender.division,
        tier: normalizeTier(defender.arenaRank),
        rankBucket: rankBucket(defender.arenaPosition),
      })
    );
    if (!defenderGroups.size) {
      rows.push(
        observation("match.active_defenders_by_tier", {
          numericValue: 0,
          sampleSize: 0,
          note: "집계 시점 활성 방어자 없음",
        })
      );
    } else {
      for (const [key, items] of defenderGroups) {
        rows.push(
          observation("match.active_defenders_by_tier", {
            numericValue: items.length,
            numerator: items.length,
            sampleSize: activeDefenders.length,
            dimensions: JSON.parse(key),
            note: "월 누계가 아닌 최근 집계 시점 스냅샷",
          })
        );
      }
    }
  }

  return rows;
}

async function loadMonthlySourceData({ period, now }) {
  const range = { $gte: period.startAt, $lt: period.endAt };
  const [
    payments,
    paidCycles,
    depletedCycles,
    renewalAssessments,
    mainStartedCycles,
    conversions,
    paybackReviews,
    matchesCreated,
    matchesConcluded,
    invitations,
    revengeRights,
    mainEntryLedgers,
    activeAccessStates,
  ] = await Promise.all([
    ArenaPackagePayment.find({ approvedAt: range })
      .select("status approvedAmount policyVersionCode approvedAt")
      .lean(),
    AccessCycle.find({ paidAt: range })
      .select("userId division policyVersionCode paidAt startsAt depletedAt firstDayMode")
      .lean(),
    AccessCycle.find({ depletedAt: range })
      .select("userId division policyVersionCode paidAt startsAt depletedAt")
      .lean(),
    RenewalRankAssessment.find({ createdAt: range })
      .select("status createdAt submittedAt")
      .lean(),
    AccessCycle.find({ division: "MAIN", startsAt: range })
      .select("userId division policyVersionCode startsAt")
      .lean(),
    MainToSubConversionResult.find({ createdAt: range })
      .select("userId sourceMainSnapshotId referenceSubRank createdAt")
      .lean(),
    ArenaPaybackReview.find({ evaluatedAt: range })
      .select("cycleId status evaluatedInputs result evaluatedAt")
      .lean(),
    ArenaMatch.find({ createdAt: range })
      .select("division matchType policyVersionCode challenger defender economySnapshot createdAt")
      .lean(),
    ArenaMatch.find({
      $or: [
        { settledAt: range },
        { status: { $in: ["HELD", "INVALID"] }, updatedAt: range },
      ],
    })
      .select("division matchType status winnerRole policyVersionCode challenger defender integrityStatus resultSnapshot settledAt updatedAt")
      .lean(),
    MainInvitationRequest.find({ createdAt: range })
      .select("initiatorArenaTier targetTier status policyVersionCode cancelReason createdAt")
      .lean(),
    ArenaRevengeRight.find({ createdAt: range })
      .select("division status createdAt")
      .lean(),
    ArenaLearningDayLedger.find({
      occurredAt: range,
      eventType: { $in: ["MAIN_CARRYOVER_GRANTED", "MAIN_ENTRY_BONUS_GRANTED"] },
    })
      .select("accessCycleId availableLearningDaysDelta occurredAt")
      .lean(),
    ArenaAccessState.find({ defensePoolEligible: true })
      .select("userId currentCompetitiveDivision standingId")
      .lean(),
  ]);

  const depletedUserIds = [...new Set(depletedCycles.map((cycle) => identifier(cycle.userId)))];
  const earliestDepletion = depletedCycles.reduce(
    (earliest, cycle) => Math.min(earliest, new Date(cycle.depletedAt).getTime()),
    new Date(now).getTime()
  );
  const invitationIds = invitations.map((invitation) => invitation._id);
  const paybackCycleIds = paybackReviews.map((review) => review.cycleId);
  const standingIds = activeAccessStates.map((state) => state.standingId).filter(Boolean);
  const conversionSnapshotIds = conversions
    .map((conversion) => conversion.sourceMainSnapshotId)
    .filter(Boolean);
  const [
    renewalCycles,
    invitationOffers,
    paybackCycles,
    standings,
    conversionSnapshots,
  ] = await Promise.all([
    depletedUserIds.length
      ? AccessCycle.find({
          userId: { $in: depletedUserIds },
          paidAt: { $gt: new Date(earliestDepletion), $lte: new Date(now) },
        })
          .select("userId division policyVersionCode paidAt")
          .lean()
      : [],
    invitationIds.length
      ? MainInvitationOffer.find({ invitationRequestId: { $in: invitationIds } })
          .select("invitationRequestId status offeredAt respondedAt")
          .lean()
      : [],
    paybackCycleIds.length
      ? AccessCycle.find({ _id: { $in: paybackCycleIds } })
          .select("policyVersionCode pricePaid paybackAmount paybackPayoutStatus paybackDisqualifiers paidNormalAttacksCompleted")
          .lean()
      : [],
    standingIds.length
      ? ArenaStanding.find({ _id: { $in: standingIds }, status: "ACTIVE" })
          .select("division arenaRank arenaPosition")
          .lean()
      : [],
    conversionSnapshotIds.length
      ? ArenaSnapshot.find({ _id: { $in: conversionSnapshotIds } })
          .select("accessCycleId")
          .lean()
      : [],
  ]);
  const standingById = new Map(standings.map((standing) => [identifier(standing._id), standing]));
  const activeDefenders = activeAccessStates.flatMap((state) => {
    const standing = standingById.get(identifier(state.standingId));
    if (!standing) return [];
    return [{
      division: state.currentCompetitiveDivision || standing.division,
      arenaRank: standing.arenaRank,
      arenaPosition: standing.arenaPosition,
    }];
  });
  const conversionSnapshotById = new Map(
    conversionSnapshots.map((snapshot) => [identifier(snapshot._id), snapshot])
  );
  const conversionsWithCycle = conversions.map((conversion) => ({
    ...conversion,
    sourceAccessCycleId:
      conversionSnapshotById.get(identifier(conversion.sourceMainSnapshotId))
        ?.accessCycleId || null,
  }));
  return {
    payments,
    paidCycles,
    depletedCycles,
    renewalCycles,
    renewalAssessments,
    mainStartedCycles,
    conversions: conversionsWithCycle,
    paybackReviews,
    paybackCycles,
    matchesCreated,
    matchesConcluded,
    invitations,
    invitationOffers,
    revengeRights,
    mainEntryLedgers,
    activeDefenders,
  };
}

function invalidateDashboardCache(periodKey = null) {
  if (periodKey) dashboardCache.delete(periodKey);
  else dashboardCache.clear();
}

async function runMonthlyDataAnalysisAggregation({
  periodKey = getKstMonthKey(),
  now = new Date(),
} = {}) {
  const period = getKstMonthPeriod(periodKey);
  const measuredAt = new Date(now);
  if (period.startAt > measuredAt) {
    throw Object.assign(new Error("아직 시작하지 않은 월은 집계할 수 없습니다."), {
      status: 400,
    });
  }
  const sourceData = await loadMonthlySourceData({ period, now: measuredAt });
  const observations = calculateMonthlyObservations({
    ...sourceData,
    now: measuredAt,
    period,
    includeCurrentSnapshot: period.periodKey === getKstMonthKey(measuredAt),
  });
  await seedFirstMonthCatalog();
  const aggregationRunId = `${period.periodKey}:${measuredAt.toISOString()}:${randomUUID()}`;
  const result = await upsertMonthlyObservations({
    observations,
    periodKey: period.periodKey,
    aggregationRunId,
    calculationVersion: CALCULATION_VERSION,
    periodStartedAt: period.startAt,
    periodEndedAt: period.endAt,
    periodClosed: period.endAt <= measuredAt,
    measuredAt,
  });
  invalidateDashboardCache(period.periodKey);
  return {
    periodKey: period.periodKey,
    aggregationRunId,
    observationCount: observations.length,
    sourceCounts: Object.fromEntries(
      Object.entries(sourceData).map(([key, value]) => [key, value.length])
    ),
    writeResult: {
      matchedCount: numeric(result.matchedCount),
      modifiedCount: numeric(result.modifiedCount),
      upsertedCount: numeric(result.upsertedCount),
    },
  };
}

function dimensionValueLabel(key, value) {
  if (key === "division") {
    return value === "MAIN" ? "Main Division" : value === "SUB" ? "Sub Division" : value;
  }
  if (["tier", "sourceTier", "targetTier"].includes(key)) {
    return TIER_LABELS[normalizeTier(value)] || value;
  }
  if (key === "matchType") return value === "REVENGE" ? "복수전" : "일반 쟁탈전";
  if (key === "tierGap") return `${value}티어 차이`;
  if (key === "stakeDays") return `${value}일 예치`;
  if (key === "ratePercent") return `${value}% 구간`;
  if (key === "reasonCode") {
    return {
      MINIMUM_STREAK_NOT_MET: "연속 학습일수 미달",
      MINIMUM_PAID_ATTACKS_NOT_MET: "유료 일반 쟁탈전 횟수 미달",
      MINIMUM_PAYBACK_SCORE_NOT_MET: "페이백 점수 미달",
      INTEGRITY_NOT_CLEAR: "경기 무결성 확인 필요",
    }[value] || (String(value || "").includes("_") ? "기타 사유" : value);
  }
  return value;
}

function formatMetricValue(value, unit) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "표본 없음";
  }
  const number = Number(value);
  if (unit === "percent") return `${number.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
  if (unit === "day") return `${number.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}일`;
  if (unit === "minute") return `${number.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}분`;
  if (unit === "won") return `${Math.round(number).toLocaleString("ko-KR")}원`;
  return number.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function viewObservation(row) {
  const dimensions = Object.entries(row.dimensions || {}).map(([key, value]) =>
    dimensionValueLabel(key, value)
  );
  return {
    valueLabel: formatMetricValue(row.numericValue, row.unit),
    numerator: row.numerator,
    denominator: row.denominator,
    sampleSize: numeric(row.sampleSize),
    dimensionsLabel: dimensions.join(" · "),
    note: row.note,
  };
}

async function getDataAnalysisDashboard({
  periodKey = getKstMonthKey(),
  now = new Date(),
  ensureObservation = true,
} = {}) {
  const period = getKstMonthPeriod(periodKey);
  const cached = dashboardCache.get(period.periodKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  await seedFirstMonthCatalog();
  const [definitions, assumptions, latestRun, existingPeriods] = await Promise.all([
    DataAnalysis.find({ kind: "METRIC_DEFINITION", periodKey: "CATALOG" })
      .sort({ category: 1, label: 1 })
      .lean(),
    DataAnalysis.find({ kind: "ASSUMPTION", periodKey: "LAUNCH_BASELINE" })
      .sort({ label: 1 })
      .lean(),
    DataAnalysis.findOne({
      kind: "OBSERVATION",
      source: AUTOMATIC_MONTHLY_SOURCE,
      periodKey: period.periodKey,
    })
      .sort({ measuredAt: -1, _id: -1 })
      .lean(),
    DataAnalysis.distinct("periodKey", {
      kind: "OBSERVATION",
      source: AUTOMATIC_MONTHLY_SOURCE,
    }),
  ]);
  if (!latestRun && ensureObservation) {
    await runMonthlyDataAnalysisAggregation({
      periodKey: period.periodKey,
      now,
    });
    return getDataAnalysisDashboard({
      periodKey: period.periodKey,
      now,
      ensureObservation: false,
    });
  }
  const observations = latestRun
    ? await DataAnalysis.find({
        kind: "OBSERVATION",
        source: AUTOMATIC_MONTHLY_SOURCE,
        periodKey: period.periodKey,
        aggregationRunId: latestRun.aggregationRunId,
      })
        .sort({ category: 1, label: 1, dimensionKey: 1 })
        .lean()
    : [];
  const rowsByMetric = groupBy(observations, (row) => row.metricKey);
  const categories = new Map();
  for (const definition of definitions) {
    const rows = rowsByMetric.get(definition.metricKey) || [];
    const category = definition.category || "operations";
    if (!categories.has(category)) {
      categories.set(category, {
        key: category,
        label: CATEGORY_LABELS[category] || "기타 운영 지표",
        metrics: [],
      });
    }
    const sampleSize = rows.reduce((max, row) => Math.max(max, numeric(row.sampleSize)), 0);
    categories.get(category).metrics.push({
      label: definition.label,
      unit: definition.unit,
      status: rows.length ? (sampleSize >= numeric(definition.minimumSampleSize || 100) ? "reliable" : sampleSize > 0 ? "collecting" : "empty") : "unavailable",
      statusLabel: rows.length
        ? sampleSize >= numeric(definition.minimumSampleSize || 100)
          ? "판단 가능"
          : sampleSize > 0
            ? "표본 수집 중"
            : "표본 없음"
        : "원본 연결 대기",
      minimumSampleSize: numeric(definition.minimumSampleSize || 100),
      observations: rows.map(viewObservation),
    });
  }
  const assumptionViews = assumptions.map((assumption) => {
    const actualRows = rowsByMetric.get(assumption.metricKey) || [];
    const actual = actualRows[0] || null;
    return {
      label: assumption.label.replace(/ 가정$/, ""),
      assumptionLabel: formatMetricValue(assumption.numericValue, assumption.unit),
      actualLabel: actual ? formatMetricValue(actual.numericValue, actual.unit) : "아직 측정 불가",
      sampleSize: actual ? numeric(actual.sampleSize) : 0,
      ready: actual ? numeric(actual.sampleSize) >= numeric(assumption.minimumSampleSize) : false,
      minimumSampleSize: numeric(assumption.minimumSampleSize),
    };
  });
  const recentPeriodKeys = Array.from({ length: 12 }, (_, index) =>
    shiftMonthKey(getKstMonthKey(now), -index)
  );
  const periodOptions = [...new Set([...recentPeriodKeys, ...existingPeriods])]
    .filter((key) => /^\d{4}-\d{2}$/.test(key))
    .sort()
    .reverse()
    .map((key) => ({ key, label: `${key.slice(0, 4)}년 ${Number(key.slice(5))}월` }));
  const definitionKeys = new Set(definitions.map((definition) => definition.metricKey));
  const observedMetricCount = new Set(
    observations
      .map((row) => row.metricKey)
      .filter((metricKey) => definitionKeys.has(metricKey))
  ).size;
  const reliableMetricCount = [...categories.values()]
    .flatMap((category) => category.metrics)
    .filter((metric) => metric.status === "reliable").length;
  const value = {
    period: {
      ...period,
      label: `${period.periodKey.slice(0, 4)}년 ${Number(period.periodKey.slice(5))}월`,
    },
    periodOptions,
    generatedAt: latestRun?.measuredAt || null,
    periodClosed: Boolean(latestRun?.periodClosed),
    summary: {
      catalogMetricCount: definitions.length,
      observedMetricCount,
      waitingMetricCount: Math.max(0, definitions.length - observedMetricCount),
      reliableMetricCount,
      observationRowCount: observations.length,
    },
    categories: [...categories.values()].filter((category) => category.metrics.length),
    assumptions: assumptionViews,
  };
  dashboardCache.set(period.periodKey, {
    value,
    expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
  });
  return value;
}

async function runScheduledDataAnalysisAggregation({ includePrevious = false } = {}) {
  if (schedulerRunning) return null;
  schedulerRunning = true;
  try {
    const now = new Date();
    const currentPeriod = getKstMonthKey(now);
    const results = [await runMonthlyDataAnalysisAggregation({ periodKey: currentPeriod, now })];
    if (includePrevious) {
      results.push(
        await runMonthlyDataAnalysisAggregation({
          periodKey: shiftMonthKey(currentPeriod, -1),
          now,
        })
      );
    }
    return results;
  } finally {
    schedulerRunning = false;
  }
}

function startDataAnalysisScheduler() {
  if (schedulerTimer) return schedulerTimer;
  runScheduledDataAnalysisAggregation({ includePrevious: true }).catch((error) => {
    console.error("dataAnalysis 초기 월별 집계 실패:", error);
  });
  schedulerTimer = setInterval(() => {
    runScheduledDataAnalysisAggregation().catch((error) => {
      console.error("dataAnalysis 월별 자동 집계 실패:", error);
    });
  }, SCHEDULER_INTERVAL_MS);
  schedulerTimer.unref?.();
  return schedulerTimer;
}

module.exports = {
  CALCULATION_VERSION,
  CATEGORY_LABELS,
  SCHEDULER_INTERVAL_MS,
  calculateMonthlyObservations,
  formatMetricValue,
  getDataAnalysisDashboard,
  getKstMonthKey,
  getKstMonthPeriod,
  runMonthlyDataAnalysisAggregation,
  runScheduledDataAnalysisAggregation,
  shiftMonthKey,
  startDataAnalysisScheduler,
};
