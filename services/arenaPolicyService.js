const {
  MainDivisionPolicyVersion,
  SubscriptionPolicyVersion,
} = require("../models/goatArenaModel");
const {
  AdminActionLog,
} = require("../models/matthsModel");
const mongoose = require("mongoose");
const {
  randomUUID,
} = require("crypto");
const {
  TtlCache,
} = require("./ttlCacheService");

const policyCache = new TtlCache({
  maxEntries: 5,
});
const ACTIVE_POLICY_CACHE_KEY =
  "arena-policy:active";
const ACTIVE_MAIN_POLICY_CACHE_KEY =
  "arena-policy:main:active";
const ACTIVE_POLICY_TTL_MS =
  30 * 1000;

const DEFAULT_PAYBACK_BANDS = [
  {
    minScoreDays: 0,
    maxScoreDays: 29,
    ratePercent: 0,
  },
  {
    minScoreDays: 30,
    maxScoreDays: 34,
    ratePercent: 50,
  },
  {
    minScoreDays: 35,
    maxScoreDays: 39,
    ratePercent: 80,
  },
  {
    minScoreDays: 40,
    maxScoreDays: null,
    ratePercent: 100,
  },
];

const DEFAULT_LEARNING_PACKAGE_PRICE_AMOUNT = 29000;
const DEFAULT_LEARNING_PACKAGE_DAYS = 29;
const DEFAULT_LEARNING_POLICY_CODE = "ARENA-LEARNING-29D-20260802";
const FULL_ATTENDANCE_POLICY_CODE =
  "ARENA-LEARNING-29D-FULL-ATTENDANCE-20260803";
const DEFAULT_LEARNING_POLICY_EFFECTIVE_FROM =
  new Date("2026-08-02T00:00:00+09:00");

const DEFAULT_MAIN_STAKE_BANDS = [
  { tierGap: 1, stakeDays: 1 },
  { tierGap: 2, stakeDays: 2 },
  { tierGap: 3, stakeDays: 3 },
];

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanSingleLine(value, maxLength = 200) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function integerValue(
  value,
  {
    label,
    minimum = 0,
    maximum = Number.MAX_SAFE_INTEGER,
    fallback,
  }
) {
  const source =
    value === "" || value === null || value === undefined
      ? fallback
      : value;
  const number = Number(source);
  if (
    !Number.isSafeInteger(number) ||
    number < minimum ||
    number > maximum
  ) {
    throw statusError(
      400,
      `${label} 값을 확인해주세요.`
    );
  }
  return number;
}

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const values = Array.isArray(value)
    ? value
    : [value];
  return values.some((entry) =>
    ["true", "1", "on", "yes"].includes(
      String(entry).toLowerCase()
    )
  );
}

function parseKstDateTime(value) {
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) {
      return new Date(value);
    }
    throw statusError(400, "정책 적용 시각을 확인해주세요.");
  }

  const source = String(value || "").trim();
  const localMatch =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(
      source
    );
  const date = localMatch
    ? new Date(`${source}:00.000+09:00`)
    : new Date(source);

  if (Number.isNaN(date.getTime())) {
    throw statusError(400, "정책 적용 시각을 확인해주세요.");
  }

  if (localMatch) {
    const rendered = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .reduce((result, part) => {
        if (part.type !== "literal") {
          result[part.type] = part.value;
        }
        return result;
      }, {});
    const normalized = `${rendered.year}-${rendered.month}-${rendered.day}T${rendered.hour}:${rendered.minute}`;
    if (normalized !== source) {
      throw statusError(400, "존재하지 않는 정책 적용 시각입니다.");
    }
  }
  return date;
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function validatePaybackBands(bands) {
  if (!Array.isArray(bands) || !bands.length) {
    throw statusError(400, "페이백 점수 구간을 한 개 이상 입력해주세요.");
  }

  let previousMax = null;
  let previousRate = -1;
  bands.forEach((band, index) => {
    const min = integerValue(band.minScoreDays, {
      label: `${index + 1}번째 페이백 구간 시작 점수`,
      minimum: 0,
    });
    const max =
      band.maxScoreDays === null ||
      band.maxScoreDays === "" ||
      band.maxScoreDays === undefined
        ? null
        : integerValue(band.maxScoreDays, {
            label: `${index + 1}번째 페이백 구간 종료 점수`,
            minimum: min,
          });
    const rate = integerValue(band.ratePercent, {
      label: `${index + 1}번째 페이백 비율`,
      minimum: 0,
      maximum: 100,
    });

    if (index === 0 && min !== 0) {
      throw statusError(400, "첫 페이백 구간은 0점부터 시작해야 합니다.");
    }
    if (
      index > 0 &&
      (!Number.isInteger(previousMax) || min !== previousMax + 1)
    ) {
      throw statusError(400, "페이백 점수 구간은 빈틈이나 중복 없이 이어져야 합니다.");
    }
    if (rate < previousRate) {
      throw statusError(400, "점수가 높아질수록 페이백 비율이 낮아질 수 없습니다.");
    }
    if (index < bands.length - 1 && max === null) {
      throw statusError(400, "마지막 구간을 제외한 구간에는 종료 점수가 필요합니다.");
    }
    if (index === bands.length - 1 && max !== null) {
      throw statusError(400, "마지막 페이백 구간의 종료 점수는 비워주세요.");
    }

    previousMax = max;
    previousRate = rate;
  });

  return bands.map((band) => ({
    minScoreDays: Number(band.minScoreDays),
    maxScoreDays:
      band.maxScoreDays === null ||
      band.maxScoreDays === "" ||
      band.maxScoreDays === undefined
        ? null
        : Number(band.maxScoreDays),
    ratePercent: Number(band.ratePercent),
  }));
}

function normalizePaybackBands(input) {
  if (Array.isArray(input?.payback?.bands)) {
    return validatePaybackBands(input.payback.bands);
  }

  const minimums = arrayValue(input?.bandMinScores);
  const maximums = arrayValue(input?.bandMaxScores);
  const rates = arrayValue(input?.bandRates);
  if (!minimums.length && !maximums.length && !rates.length) {
    return validatePaybackBands(DEFAULT_PAYBACK_BANDS);
  }
  if (
    minimums.length !== maximums.length ||
    minimums.length !== rates.length
  ) {
    throw statusError(400, "페이백 점수 구간 입력 개수가 일치하지 않습니다.");
  }
  return validatePaybackBands(
    minimums.map((minScoreDays, index) => ({
      minScoreDays,
      maxScoreDays: maximums[index],
      ratePercent: rates[index],
    }))
  );
}

function normalizePolicyDraftInput(input = {}) {
  const displayName = cleanSingleLine(
    input.displayName,
    120
  );
  if (displayName.length < 2) {
    throw statusError(400, "정책 이름을 2자 이상 입력해주세요.");
  }
  const paymentDayCutoffKst = String(
    input.paymentDayCutoffKst || "20:00"
  ).trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(paymentDayCutoffKst)) {
    throw statusError(400, "첫날 차감 기준 시각을 확인해주세요.");
  }

  const paybackBands = normalizePaybackBands(input);
  const initialLearningDays = integerValue(input.initialLearningDays, {
    label: "정기권 학습 가능 일수 초깃값",
    minimum: 1,
    fallback: DEFAULT_LEARNING_PACKAGE_DAYS,
  });
  const minimumStreakDays = integerValue(
    input.minimumStreakDays ?? input.payback?.minimumStreakDays,
    {
      label: "페이백 최소 연속 학습일",
      minimum: 1,
      fallback: initialLearningDays,
    }
  );
  if (minimumStreakDays !== initialLearningDays) {
    throw statusError(
      400,
      "페이백 연속 학습일은 정기권 전체 학습일과 같아야 합니다. 29일 학습 패키지는 29일 모두 학습해야 합니다."
    );
  }
  const minimumScoreDays = integerValue(
    input.minimumScoreDays ?? input.payback?.minimumScoreDays,
    {
      label: "페이백 최소 점수",
      minimum: 0,
      fallback: 30,
    }
  );
  if (
    !paybackBands.some(
      (band) =>
        minimumScoreDays >= band.minScoreDays &&
        (band.maxScoreDays === null ||
          minimumScoreDays <= band.maxScoreDays) &&
        band.ratePercent > 0
    )
  ) {
    throw statusError(400, "페이백 최소 점수는 지급률이 0%보다 큰 구간에 있어야 합니다.");
  }

  return {
    displayName,
    effectiveFrom: parseKstDateTime(input.effectiveFrom),
    currency: "KRW",
    timezone: "Asia/Seoul",
    priceAmount: integerValue(input.priceAmount, {
      label: "학습권 패키지 가격",
      minimum: 0,
    }),
    initialLearningDays,
    initialPaybackScoreDays: integerValue(input.initialPaybackScoreDays, {
      label: "페이백 점수 초깃값",
      minimum: 0,
      fallback: 29,
    }),
    paymentDayCutoffKst,
    renewalGraceHours: integerValue(input.renewalGraceHours, {
      label: "재구매 유예 시간",
      minimum: 0,
      fallback: 72,
    }),
    packagePurchaseRequiresZeroBalance: booleanValue(
      input.packagePurchaseRequiresZeroBalance,
      true
    ),
    packagePurchaseRequiresZeroLockedBalance: booleanValue(
      input.packagePurchaseRequiresZeroLockedBalance,
      true
    ),
    lateRenewalTierPenalty: integerValue(input.lateRenewalTierPenalty, {
      label: "랭크 복귀전 티어 하향 단계",
      minimum: 1,
      fallback: 1,
    }),
    matchStakeDays: {
      normal: 1,
      revenge: 2,
    },
    payback: {
      minimumStreakDays,
      minimumPaidNormalAttacks: integerValue(input.minimumPaidNormalAttacks, {
        label: "페이백 최소 유료 일반 쟁탈전 횟수",
        minimum: 0,
        fallback: 2,
      }),
      minimumScoreDays,
      bands: paybackBands,
    },
    changeSummary: cleanSingleLine(input.changeSummary, 1000),
  };
}

function normalizeMainStakeBands(input = {}) {
  const gaps = arrayValue(input.mainTierGaps);
  const stakes = arrayValue(input.mainMinimumStakeDays);
  const source =
    gaps.length || stakes.length
      ? gaps.map((tierGap, index) => ({
          tierGap,
          stakeDays: stakes[index],
        }))
      : DEFAULT_MAIN_STAKE_BANDS;
  if (
    !source.length ||
    (gaps.length || stakes.length) && gaps.length !== stakes.length
  ) {
    throw statusError(
      400,
      "Main Division 티어 차이와 최소 예치 일수 입력 개수를 확인해주세요."
    );
  }
  const normalized = source
    .map((band) => ({
      tierGap: integerValue(band.tierGap, {
        label: "Main Division 티어 차이",
        minimum: 1,
      }),
      stakeDays: integerValue(band.stakeDays, {
        label: "Main Division 최소 예치 일수",
        minimum: 1,
      }),
    }))
    .sort((left, right) => left.tierGap - right.tierGap);
  if (
    new Set(normalized.map((band) => band.tierGap)).size !==
    normalized.length
  ) {
    throw statusError(
      400,
      "Main Division 티어 차이를 중복 입력할 수 없습니다."
    );
  }
  return normalized;
}

function normalizeMainPolicyDraftInput(input = {}) {
  const displayName = cleanSingleLine(input.displayName, 120);
  if (displayName.length < 2) {
    throw statusError(
      400,
      "Main Division 정책 이름을 2자 이상 입력해주세요."
    );
  }
  const stakeDaysByTierGap = normalizeMainStakeBands(input);
  const maximumTargetTierGap = integerValue(
    input.maximumTargetTierGap,
    {
      label: "Main Division 최대 티어 차이",
      minimum: 1,
      fallback: 3,
    }
  );
  const expectedGaps = Array.from(
    { length: maximumTargetTierGap },
    (_unused, index) => index + 1
  );
  if (
    stakeDaysByTierGap.length !== expectedGaps.length ||
    !stakeDaysByTierGap.every(
      (band, index) => band.tierGap === expectedGaps[index]
    )
  ) {
    throw statusError(
      400,
      "Main Division 최소 예치 기준표는 1부터 최대 티어 차이까지 빠짐없이 입력해야 합니다."
    );
  }
  const batchInput = String(
    input.invitationOfferBatchSize ?? ""
  ).trim();
  return {
    displayName,
    effectiveFrom: parseKstDateTime(input.effectiveFrom),
    effectiveUntil: null,
    timezone: "Asia/Seoul",
    mainEntryBonusDays: integerValue(input.mainEntryBonusDays, {
      label: "Main Division 진입 보너스",
      minimum: 0,
      fallback: 2,
    }),
    mainCarryoverBaseDays: integerValue(
      input.mainCarryoverBaseDays,
      {
        label: "Main Division 이월 차감 기준",
        minimum: 0,
        fallback: 29,
      }
    ),
    stakeDaysByTierGap,
    maximumTargetTierGap,
    unlimitedDailyAttacks: true,
    unlimitedDailyDefenses: true,
    maximumNetGainPerCycle: null,
    invitationRequestExpiresAt: null,
    invitationOfferBatchSize:
      batchInput === ""
        ? null
        : integerValue(batchInput, {
            label: "하위 티어 초대 동시 발송 인원",
            minimum: 1,
          }),
    invitationCancellationFeeDays: integerValue(
      input.invitationCancellationFeeDays,
      {
        label: "초대 자동 취소 수수료",
        minimum: 0,
        fallback: 1,
      }
    ),
    manualInvitationCancellationAllowed: true,
    manualInvitationCancellationFeeDays: 0,
    repeatOpponentExclusionDays: integerValue(
      input.repeatOpponentExclusionDays,
      {
        label: "최근 상대 제외 기간",
        minimum: 0,
        fallback: 7,
      }
    ),
    maximumActiveInvitationReservationsPerTargetTier:
      integerValue(
        input.maximumActiveInvitationReservationsPerTargetTier,
        {
          label: "목표 티어별 활성 초대 예약 상한",
          minimum: 1,
          maximum: 1,
          fallback: 1,
        }
      ),
    requiresServerRandomOpponent: true,
    requiresOpponentDaysGreaterThanStake: true,
    revengeStakeMultiplier: integerValue(
      input.revengeStakeMultiplier,
      {
        label: "Main Division 복수전 예치 배수",
        minimum: 1,
        fallback: 2,
      }
    ),
    revengeFeeDays: integerValue(input.revengeFeeDays, {
      label: "Main Division 복수전 수수료",
      minimum: 0,
      fallback: 1,
    }),
    maximumUnresolvedOfficialMatches: 1,
    scoringPolicyVersion: "SUB-STANDARD-V1",
    changeSummary: cleanSingleLine(input.changeSummary, 1000),
  };
}

function buildPolicyCode(effectiveFrom) {
  const timestamp = new Date(effectiveFrom)
    .toISOString()
    .slice(0, 16)
    .replace(/[-:T]/g, "");
  return `ARENA-${timestamp}-${randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;
}

function buildMainPolicyCode(effectiveFrom) {
  const timestamp = new Date(effectiveFrom)
    .toISOString()
    .slice(0, 16)
    .replace(/[-:T]/g, "");
  return `MAIN-${timestamp}-${randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;
}

function defaultLearningPackagePolicyDefinition({
  effectiveFrom = DEFAULT_LEARNING_POLICY_EFFECTIVE_FROM,
  priceAmount = DEFAULT_LEARNING_PACKAGE_PRICE_AMOUNT,
  changeSummary = "29일 학습 패키지 기본 정책",
} = {}) {
  return {
    displayName: "29일 학습 패키지",
    effectiveFrom: new Date(effectiveFrom),
    currency: "KRW",
    timezone: "Asia/Seoul",
    priceAmount: Number(priceAmount),
    initialLearningDays: DEFAULT_LEARNING_PACKAGE_DAYS,
    initialPaybackScoreDays: 29,
    paymentDayCutoffKst: "20:00",
    renewalGraceHours: 72,
    packagePurchaseRequiresZeroBalance: true,
    packagePurchaseRequiresZeroLockedBalance: true,
    lateRenewalTierPenalty: 1,
    matchStakeDays: {
      normal: 1,
      revenge: 2,
    },
    payback: {
      minimumStreakDays: DEFAULT_LEARNING_PACKAGE_DAYS,
      minimumPaidNormalAttacks: 2,
      minimumScoreDays: 30,
      bands: DEFAULT_PAYBACK_BANDS.map((band) => ({ ...band })),
    },
    changeSummary: cleanSingleLine(changeSummary, 1000),
  };
}

function learningPackagePolicyView(policy) {
  const source = policy
    ? typeof policy.toObject === "function"
      ? policy.toObject()
      : policy
    : {
        ...defaultLearningPackagePolicyDefinition(),
        code: DEFAULT_LEARNING_POLICY_CODE,
        status: "ACTIVE",
        createdAt: DEFAULT_LEARNING_POLICY_EFFECTIVE_FROM,
        updatedAt: DEFAULT_LEARNING_POLICY_EFFECTIVE_FROM,
        activatedAt: DEFAULT_LEARNING_POLICY_EFFECTIVE_FROM,
      };
  return {
    ...source,
    _id: source._id || null,
    isFallback: !policy,
    priceAmount: Number(source.priceAmount),
    initialLearningDays: Number(source.initialLearningDays),
    initialPaybackScoreDays: Number(source.initialPaybackScoreDays),
  };
}

function policySnapshot(policy) {
  if (!policy) return null;
  const source = typeof policy.toObject === "function"
    ? policy.toObject()
    : policy;

  return {
    code: source.code,
    displayName: source.displayName || "",
    currency: source.currency,
    priceAmount: source.priceAmount,
    timezone:
      source.timezone || "Asia/Seoul",
    initialLearningDays:
      source.initialLearningDays,
    initialPaybackScoreDays:
      source.initialPaybackScoreDays,
    paymentDayCutoffKst:
      source.paymentDayCutoffKst,
    renewalGraceHours:
      source.renewalGraceHours,
    packagePurchaseRequiresZeroBalance:
      source.packagePurchaseRequiresZeroBalance,
    packagePurchaseRequiresZeroLockedBalance:
      source.packagePurchaseRequiresZeroLockedBalance,
    lateRenewalTierPenalty:
      source.lateRenewalTierPenalty,
    matchStakeDays: JSON.parse(
      JSON.stringify(
        source.matchStakeDays || {
          normal: 1,
          revenge: 2,
        }
      )
    ),
    payback: JSON.parse(
      JSON.stringify(source.payback || {})
    ),
    effectiveFrom:
      source.effectiveFrom,
    effectiveUntil:
      source.effectiveUntil || null,
  };
}

function mainPolicySnapshot(policy) {
  if (!policy) return null;
  const source =
    typeof policy.toObject === "function"
      ? policy.toObject()
      : policy;
  return {
    id: source._id || null,
    code: source.code,
    displayName: source.displayName || "",
    timezone: source.timezone || "Asia/Seoul",
    mainEntryBonusDays: Number(source.mainEntryBonusDays),
    mainCarryoverBaseDays: Number(source.mainCarryoverBaseDays),
    stakeDaysByTierGap: JSON.parse(
      JSON.stringify(source.stakeDaysByTierGap || [])
    ),
    maximumTargetTierGap: Number(source.maximumTargetTierGap),
    invitationOfferBatchSize:
      source.invitationOfferBatchSize ?? null,
    invitationCancellationFeeDays: Number(
      source.invitationCancellationFeeDays ?? 1
    ),
    manualInvitationCancellationAllowed:
      source.manualInvitationCancellationAllowed !== false,
    manualInvitationCancellationFeeDays: Number(
      source.manualInvitationCancellationFeeDays ?? 0
    ),
    repeatOpponentExclusionDays: Number(
      source.repeatOpponentExclusionDays ?? 7
    ),
    maximumActiveInvitationReservationsPerTargetTier: Number(
      source.maximumActiveInvitationReservationsPerTargetTier ?? 1
    ),
    requiresServerRandomOpponent:
      source.requiresServerRandomOpponent !== false,
    requiresOpponentDaysGreaterThanStake:
      source.requiresOpponentDaysGreaterThanStake !== false,
    revengeStakeMultiplier: Number(
      source.revengeStakeMultiplier ?? 2
    ),
    revengeFeeDays: Number(source.revengeFeeDays ?? 1),
    maximumUnresolvedOfficialMatches: Number(
      source.maximumUnresolvedOfficialMatches ?? 1
    ),
    scoringPolicyVersion:
      source.scoringPolicyVersion || "SUB-STANDARD-V1",
    effectiveFrom: source.effectiveFrom,
    effectiveUntil: source.effectiveUntil || null,
  };
}

function minimumMainStakeDaysForTierGap(policy, tierGap) {
  const gap = integerValue(tierGap, {
    label: "Main Division 티어 차이",
    minimum: 1,
  });
  const snapshot = mainPolicySnapshot(policy);
  if (!snapshot || gap > snapshot.maximumTargetTierGap) {
    throw statusError(
      409,
      "Main Division에서는 정책상 허용된 최대 티어 차이까지만 신청할 수 있습니다."
    );
  }
  const band = snapshot.stakeDaysByTierGap.find(
    (entry) => Number(entry.tierGap) === gap
  );
  if (!band) {
    throw statusError(
      409,
      "Main Division 티어 차이별 최소 예치 정책이 활성화되지 않았습니다."
    );
  }
  return Number(band.stakeDays);
}

function planPolicyActivation({
  candidate,
  activePolicies = [],
}) {
  if (!candidate?._id || !candidate.effectiveFrom) {
    throw statusError(400, "활성화할 정책 정보를 확인해주세요.");
  }
  const candidateStart = new Date(candidate.effectiveFrom);
  if (Number.isNaN(candidateStart.getTime())) {
    throw statusError(400, "정책 적용 시각을 확인해주세요.");
  }

  const others = activePolicies
    .filter(
      (policy) =>
        String(policy._id) !== String(candidate._id)
    )
    .sort(
      (left, right) =>
        new Date(left.effectiveFrom) -
        new Date(right.effectiveFrom)
    );
  const sameStart = others.find(
    (policy) =>
      new Date(policy.effectiveFrom).getTime() ===
      candidateStart.getTime()
  );
  if (sameStart) {
    throw statusError(409, "같은 적용 시각에 이미 활성 정책이 있습니다.");
  }

  const previous = [...others]
    .reverse()
    .find(
      (policy) =>
        new Date(policy.effectiveFrom) < candidateStart
    );
  const next = others.find(
    (policy) =>
      new Date(policy.effectiveFrom) > candidateStart
  );

  return {
    previousPolicyId: previous?._id || null,
    closePrevious:
      Boolean(previous) &&
      (!previous.effectiveUntil ||
        new Date(previous.effectiveUntil) > candidateStart),
    candidateEffectiveUntil:
      next?.effectiveFrom || null,
    nextPolicyId: next?._id || null,
  };
}

async function getActiveArenaPolicy(
  now = new Date()
) {
  const cached = policyCache.get(
    ACTIVE_POLICY_CACHE_KEY
  );
  if (
    cached &&
    new Date(cached.effectiveFrom) <= now &&
    (!cached.effectiveUntil ||
      new Date(cached.effectiveUntil) > now)
  ) {
    return cached;
  }

  const policy = await SubscriptionPolicyVersion.findOne({
    status: "ACTIVE",
    effectiveFrom: { $lte: now },
    $or: [
      { effectiveUntil: null },
      { effectiveUntil: { $gt: now } },
    ],
  })
    .sort({ effectiveFrom: -1 })
    .lean();

  if (policy) {
    policyCache.set(
      ACTIVE_POLICY_CACHE_KEY,
      policy,
      ACTIVE_POLICY_TTL_MS
    );
  }
  return policy;
}

async function getActiveMainDivisionPolicy(
  now = new Date(),
  { bypassCache = false } = {}
) {
  const cached = policyCache.get(
    ACTIVE_MAIN_POLICY_CACHE_KEY
  );
  if (
    !bypassCache &&
    cached &&
    new Date(cached.effectiveFrom) <= now &&
    (!cached.effectiveUntil ||
      new Date(cached.effectiveUntil) > now)
  ) {
    return cached;
  }
  const policy = await MainDivisionPolicyVersion.findOne({
    status: "ACTIVE",
    effectiveFrom: { $lte: now },
    $or: [
      { effectiveUntil: null },
      { effectiveUntil: { $gt: now } },
    ],
  })
    .sort({ effectiveFrom: -1 })
    .lean();
  if (policy && !bypassCache) {
    policyCache.set(
      ACTIVE_MAIN_POLICY_CACHE_KEY,
      policy,
      ACTIVE_POLICY_TTL_MS
    );
  }
  return policy;
}

async function getArenaPolicyAdminData(
  now = new Date()
) {
  const [
    policies,
    activePolicy,
    mainPolicies,
    activeMainPolicy,
  ] = await Promise.all([
    SubscriptionPolicyVersion.find()
      .sort({ effectiveFrom: -1, createdAt: -1 })
      .lean(),
    getActiveArenaPolicy(now),
    MainDivisionPolicyVersion.find()
      .sort({ effectiveFrom: -1, createdAt: -1 })
      .lean(),
    getActiveMainDivisionPolicy(now),
  ]);
  return {
    policies,
    activePolicy,
    sub: {
      policies,
      activePolicy,
    },
    learningPackage: {
      policies,
      activePolicy:
        learningPackagePolicyView(activePolicy),
    },
    main: {
      policies: mainPolicies,
      activePolicy: activeMainPolicy,
    },
    now,
  };
}

async function ensureDefaultLearningPackagePolicy(
  now = new Date()
) {
  const current = await SubscriptionPolicyVersion.findOne({
    status: "ACTIVE",
    effectiveFrom: { $lte: now },
    $or: [
      { effectiveUntil: null },
      { effectiveUntil: { $gt: now } },
    ],
  })
    .sort({ effectiveFrom: -1 })
    .lean();
  if (current) return learningPackagePolicyView(current);

  const existing = await SubscriptionPolicyVersion.findOne({
    code: DEFAULT_LEARNING_POLICY_CODE,
  }).lean();
  if (existing) return learningPackagePolicyView(existing);

  const effectiveFrom = new Date(
    Math.min(
      new Date(now).getTime(),
      DEFAULT_LEARNING_POLICY_EFFECTIVE_FROM.getTime()
    )
  );
  const nextPolicy = await SubscriptionPolicyVersion.findOne({
    status: "ACTIVE",
    effectiveFrom: { $gt: effectiveFrom },
  })
    .sort({ effectiveFrom: 1 })
    .lean();
  try {
    const created = await SubscriptionPolicyVersion.create({
      ...defaultLearningPackagePolicyDefinition({ effectiveFrom }),
      code: DEFAULT_LEARNING_POLICY_CODE,
      status: "ACTIVE",
      effectiveUntil: nextPolicy?.effectiveFrom || null,
      activatedAt: new Date(now),
    });
    invalidateArenaPolicyCache();
    return learningPackagePolicyView(created);
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return learningPackagePolicyView(
      await SubscriptionPolicyVersion.findOne({
        code: DEFAULT_LEARNING_POLICY_CODE,
      }).lean()
    );
  }
}

async function ensureFullAttendanceLearningPackagePolicy(now = new Date()) {
  const effectiveFrom = new Date(now);
  const current = await SubscriptionPolicyVersion.findOne({
    status: "ACTIVE",
    effectiveFrom: { $lte: effectiveFrom },
    $or: [
      { effectiveUntil: null },
      { effectiveUntil: { $gt: effectiveFrom } },
    ],
  })
    .sort({ effectiveFrom: -1 })
    .lean();

  if (!current) {
    return ensureDefaultLearningPackagePolicy(effectiveFrom);
  }
  if (
    Number(current.initialLearningDays) === DEFAULT_LEARNING_PACKAGE_DAYS &&
    Number(current.payback?.minimumStreakDays) === DEFAULT_LEARNING_PACKAGE_DAYS
  ) {
    return learningPackagePolicyView(current);
  }

  const migrationPolicyCode =
    `${FULL_ATTENDANCE_POLICY_CODE}-${String(current._id).slice(-8).toUpperCase()}`;

  const session = await mongoose.startSession();
  let created = null;
  try {
    await session.withTransaction(async () => {
      // MongoDB 드라이버는 같은 트랜잭션 세션에서 병렬 작업을 지원하지
      // 않는다. Atlas가 두 명령을 서로 다른 트랜잭션 시작으로 오인하지
      // 않도록 정책 조회를 반드시 순차 실행한다.
      const transactionCurrent =
        await SubscriptionPolicyVersion.findOne({
          status: "ACTIVE",
          effectiveFrom: { $lte: effectiveFrom },
          $or: [
            { effectiveUntil: null },
            { effectiveUntil: { $gt: effectiveFrom } },
          ],
        })
          .sort({ effectiveFrom: -1 })
          .session(session)
          .lean();
      const nextPolicy =
        await SubscriptionPolicyVersion.findOne({
          status: "ACTIVE",
          effectiveFrom: { $gt: effectiveFrom },
        })
          .sort({ effectiveFrom: 1 })
          .session(session)
          .lean();
      if (!transactionCurrent) {
        throw statusError(409, "현재 적용 중인 학습권 정책을 찾을 수 없습니다.");
      }
      if (
        Number(transactionCurrent.initialLearningDays) ===
          DEFAULT_LEARNING_PACKAGE_DAYS &&
        Number(transactionCurrent.payback?.minimumStreakDays) ===
          DEFAULT_LEARNING_PACKAGE_DAYS
      ) {
        created = transactionCurrent;
        return;
      }
      const base = policySnapshot(transactionCurrent);
      await SubscriptionPolicyVersion.updateOne(
        { _id: transactionCurrent._id, status: "ACTIVE" },
        { $set: { effectiveUntil: effectiveFrom } },
        { session }
      );
      created = new SubscriptionPolicyVersion({
        ...base,
        code: migrationPolicyCode,
        status: "ACTIVE",
        effectiveFrom,
        effectiveUntil: nextPolicy?.effectiveFrom || null,
        initialLearningDays: DEFAULT_LEARNING_PACKAGE_DAYS,
        payback: {
          ...(base.payback || {}),
          minimumStreakDays: DEFAULT_LEARNING_PACKAGE_DAYS,
        },
        changeSummary:
          "페이백 자격에 29일 전일 연속 학습 조건 적용",
        activatedAt: effectiveFrom,
        activatedBy: null,
      });
      await created.save({ session });
    });
    invalidateArenaPolicyCache();
    return learningPackagePolicyView(created);
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return learningPackagePolicyView(
      await SubscriptionPolicyVersion.findOne({
        code: migrationPolicyCode,
      }).lean()
    );
  } finally {
    await session.endSession();
  }
}

async function updateLearningPackagePrice({
  adminUserId,
  priceAmount,
  changeSummary = "",
  now = new Date(),
}) {
  const price = integerValue(priceAmount, {
    label: "29일 학습 패키지 가격",
    minimum: 0,
    maximum: 1000000,
  });
  if (!mongoose.isValidObjectId(adminUserId)) {
    throw statusError(400, "관리자 정보를 확인해주세요.");
  }

  const effectiveFrom = new Date(now);
  const session = await mongoose.startSession();
  let created = null;
  try {
    await session.withTransaction(async () => {
      const activePolicies = await SubscriptionPolicyVersion.find({
        status: "ACTIVE",
      })
        .sort({ effectiveFrom: 1 })
        .session(session)
        .lean();
      const current = [...activePolicies]
        .reverse()
        .find(
          (policy) =>
            new Date(policy.effectiveFrom) <= effectiveFrom &&
            (!policy.effectiveUntil ||
              new Date(policy.effectiveUntil) > effectiveFrom)
        );
      const base = current
        ? policySnapshot(current)
        : defaultLearningPackagePolicyDefinition({ effectiveFrom });
      const candidateId = new mongoose.Types.ObjectId();
      const plan = planPolicyActivation({
        candidate: {
          _id: candidateId,
          effectiveFrom,
        },
        activePolicies,
      });
      if (plan.closePrevious) {
        await SubscriptionPolicyVersion.updateOne(
          {
            _id: plan.previousPolicyId,
            status: "ACTIVE",
          },
          { $set: { effectiveUntil: effectiveFrom } },
          { session }
        );
      }
      created = new SubscriptionPolicyVersion({
        ...base,
        _id: candidateId,
        code: buildPolicyCode(effectiveFrom),
        displayName: "29일 학습 패키지",
        status: "ACTIVE",
        effectiveFrom,
        effectiveUntil: plan.candidateEffectiveUntil,
        priceAmount: price,
        initialLearningDays: DEFAULT_LEARNING_PACKAGE_DAYS,
        changeSummary:
          cleanSingleLine(changeSummary, 1000) ||
          `29일 학습 패키지 가격을 ${price.toLocaleString("ko-KR")}원으로 변경`,
        createdBy: adminUserId,
        activatedBy: adminUserId,
        activatedAt: effectiveFrom,
      });
      await created.save({ session });
      await AdminActionLog.create(
        [
          {
            adminUserId,
            action: "arena.learning-package-price-update",
            detail: created.changeSummary,
            metadata: {
              policyId: String(created._id),
              priceAmount: price,
              initialLearningDays: DEFAULT_LEARNING_PACKAGE_DAYS,
            },
          },
        ],
        { session, ordered: true }
      );
    });
  } finally {
    await session.endSession();
  }
  invalidateArenaPolicyCache();
  return created;
}

async function createArenaPolicyVersion({
  adminUserId,
  input,
}) {
  const normalized = normalizePolicyDraftInput(input);
  const policy = new SubscriptionPolicyVersion({
    ...normalized,
    code: buildPolicyCode(normalized.effectiveFrom),
    status: "DRAFT",
    effectiveUntil: null,
    createdBy: adminUserId,
  });
  await policy.save();
  await AdminActionLog.create({
    adminUserId,
    action: "arena.policy-create",
    detail: policy.displayName,
    metadata: {
      policyId: String(policy._id),
      effectiveFrom: policy.effectiveFrom,
    },
  });
  return policy;
}

async function createMainDivisionPolicyVersion({
  adminUserId,
  input,
}) {
  const normalized = normalizeMainPolicyDraftInput(input);
  const policy = new MainDivisionPolicyVersion({
    ...normalized,
    code: buildMainPolicyCode(normalized.effectiveFrom),
    status: "DRAFT",
    createdBy: adminUserId,
  });
  await policy.save();
  await AdminActionLog.create({
    adminUserId,
    action: "arena.main-policy-create",
    detail: policy.displayName,
    metadata: {
      policyId: String(policy._id),
      effectiveFrom: policy.effectiveFrom,
    },
  });
  return policy;
}

async function activateArenaPolicyVersion({
  adminUserId,
  policyId,
  now = new Date(),
}) {
  const session = await mongoose.startSession();
  let activatedPolicy = null;
  try {
    await session.withTransaction(async () => {
      const candidate = await SubscriptionPolicyVersion.findById(
        policyId
      ).session(session);
      if (!candidate) {
        throw statusError(404, "활성화할 Arena 정책을 찾을 수 없습니다.");
      }
      if (candidate.status !== "DRAFT") {
        throw statusError(409, "작성 중인 정책만 활성화할 수 있습니다.");
      }

      const activePolicies = await SubscriptionPolicyVersion.find({
        status: "ACTIVE",
      })
        .sort({ effectiveFrom: 1 })
        .session(session)
        .lean();
      const plan = planPolicyActivation({
        candidate,
        activePolicies,
      });

      if (plan.closePrevious) {
        await SubscriptionPolicyVersion.updateOne(
          { _id: plan.previousPolicyId, status: "ACTIVE" },
          { $set: { effectiveUntil: candidate.effectiveFrom } },
          { session }
        );
      }

      candidate.status = "ACTIVE";
      candidate.effectiveUntil = plan.candidateEffectiveUntil;
      candidate.activatedAt = now;
      candidate.activatedBy = adminUserId;
      await candidate.save({ session });

      await AdminActionLog.create(
        [
          {
            adminUserId,
            action: "arena.policy-activate",
            detail: candidate.displayName,
            metadata: {
              policyId: String(candidate._id),
              effectiveFrom: candidate.effectiveFrom,
              effectiveUntil: candidate.effectiveUntil,
            },
          },
        ],
        { session }
      );
      activatedPolicy = candidate;
    });
  } finally {
    await session.endSession();
  }
  invalidateArenaPolicyCache();
  return activatedPolicy;
}

async function activateMainDivisionPolicyVersion({
  adminUserId,
  policyId,
  now = new Date(),
}) {
  const session = await mongoose.startSession();
  let activatedPolicy = null;
  try {
    await session.withTransaction(async () => {
      const candidate =
        await MainDivisionPolicyVersion.findById(
          policyId
        ).session(session);
      if (!candidate) {
        throw statusError(
          404,
          "활성화할 Main Division 정책을 찾을 수 없습니다."
        );
      }
      if (candidate.status !== "DRAFT") {
        throw statusError(
          409,
          "작성 중인 Main Division 정책만 활성화할 수 있습니다."
        );
      }
      await candidate.validate();
      const activePolicies =
        await MainDivisionPolicyVersion.find({
          status: "ACTIVE",
        })
          .sort({ effectiveFrom: 1 })
          .session(session)
          .lean();
      const plan = planPolicyActivation({
        candidate,
        activePolicies,
      });
      if (plan.closePrevious) {
        await MainDivisionPolicyVersion.updateOne(
          {
            _id: plan.previousPolicyId,
            status: "ACTIVE",
          },
          {
            $set: {
              effectiveUntil: candidate.effectiveFrom,
            },
          },
          { session }
        );
      }
      candidate.status = "ACTIVE";
      candidate.effectiveUntil =
        plan.candidateEffectiveUntil;
      candidate.activatedAt = now;
      candidate.activatedBy = adminUserId;
      await candidate.save({ session });
      await AdminActionLog.create(
        [
          {
            adminUserId,
            action: "arena.main-policy-activate",
            detail: candidate.displayName,
            metadata: {
              policyId: String(candidate._id),
              effectiveFrom: candidate.effectiveFrom,
              effectiveUntil: candidate.effectiveUntil,
            },
          },
        ],
        { session }
      );
      activatedPolicy = candidate;
    });
  } finally {
    await session.endSession();
  }
  invalidateMainDivisionPolicyCache();
  return activatedPolicy;
}

async function retireArenaPolicyVersion({
  adminUserId,
  policyId,
  now = new Date(),
}) {
  const session = await mongoose.startSession();
  let retiredPolicy = null;
  try {
    await session.withTransaction(async () => {
      const policy = await SubscriptionPolicyVersion.findById(
        policyId
      ).session(session);
      if (!policy) {
        throw statusError(404, "종료할 Arena 정책을 찾을 수 없습니다.");
      }
      const startsAt = new Date(policy.effectiveFrom);
      const endsAt = policy.effectiveUntil
        ? new Date(policy.effectiveUntil)
        : null;
      const isCurrent =
        policy.status === "ACTIVE" &&
        startsAt <= now &&
        (!endsAt || endsAt > now);
      const isHistorical =
        policy.status === "ACTIVE" &&
        endsAt &&
        endsAt <= now;
      if (isCurrent) {
        throw statusError(409, "현재 적용 중인 정책은 바로 종료할 수 없습니다. 후속 정책을 먼저 활성화해주세요.");
      }
      if (isHistorical || policy.status === "RETIRED") {
        throw statusError(409, "이미 종료되었거나 적용 이력이 있는 정책은 변경할 수 없습니다.");
      }

      if (policy.status === "ACTIVE" && startsAt > now) {
        const activePolicies = await SubscriptionPolicyVersion.find({
          status: "ACTIVE",
          _id: { $ne: policy._id },
        })
          .sort({ effectiveFrom: 1 })
          .session(session)
          .lean();
        const previous = [...activePolicies]
          .reverse()
          .find((entry) => new Date(entry.effectiveFrom) < startsAt);
        const next = activePolicies.find(
          (entry) => new Date(entry.effectiveFrom) > startsAt
        );
        if (
          previous &&
          previous.effectiveUntil &&
          new Date(previous.effectiveUntil).getTime() === startsAt.getTime()
        ) {
          await SubscriptionPolicyVersion.updateOne(
            { _id: previous._id, status: "ACTIVE" },
            { $set: { effectiveUntil: next?.effectiveFrom || null } },
            { session }
          );
        }
      }

      policy.status = "RETIRED";
      policy.retiredAt = now;
      policy.retiredBy = adminUserId;
      await policy.save({ session });
      await AdminActionLog.create(
        [
          {
            adminUserId,
            action: "arena.policy-retire",
            detail: policy.displayName,
            metadata: { policyId: String(policy._id) },
          },
        ],
        { session }
      );
      retiredPolicy = policy;
    });
  } finally {
    await session.endSession();
  }
  invalidateArenaPolicyCache();
  return retiredPolicy;
}

async function retireMainDivisionPolicyVersion({
  adminUserId,
  policyId,
  now = new Date(),
}) {
  const session = await mongoose.startSession();
  let retiredPolicy = null;
  try {
    await session.withTransaction(async () => {
      const policy =
        await MainDivisionPolicyVersion.findById(
          policyId
        ).session(session);
      if (!policy) {
        throw statusError(
          404,
          "종료할 Main Division 정책을 찾을 수 없습니다."
        );
      }
      const startsAt = new Date(policy.effectiveFrom);
      const endsAt = policy.effectiveUntil
        ? new Date(policy.effectiveUntil)
        : null;
      const isCurrent =
        policy.status === "ACTIVE" &&
        startsAt <= now &&
        (!endsAt || endsAt > now);
      const isHistorical =
        policy.status === "ACTIVE" &&
        endsAt &&
        endsAt <= now;
      if (isCurrent) {
        throw statusError(
          409,
          "현재 적용 중인 Main Division 정책은 후속 정책을 먼저 활성화해야 합니다."
        );
      }
      if (isHistorical || policy.status === "RETIRED") {
        throw statusError(
          409,
          "이미 종료되었거나 적용 이력이 있는 Main Division 정책은 변경할 수 없습니다."
        );
      }
      if (policy.status === "ACTIVE" && startsAt > now) {
        const activePolicies =
          await MainDivisionPolicyVersion.find({
            status: "ACTIVE",
            _id: { $ne: policy._id },
          })
            .sort({ effectiveFrom: 1 })
            .session(session)
            .lean();
        const previous = [...activePolicies]
          .reverse()
          .find(
            (entry) =>
              new Date(entry.effectiveFrom) < startsAt
          );
        const next = activePolicies.find(
          (entry) =>
            new Date(entry.effectiveFrom) > startsAt
        );
        if (
          previous &&
          previous.effectiveUntil &&
          new Date(previous.effectiveUntil).getTime() ===
            startsAt.getTime()
        ) {
          await MainDivisionPolicyVersion.updateOne(
            { _id: previous._id, status: "ACTIVE" },
            {
              $set: {
                effectiveUntil:
                  next?.effectiveFrom || null,
              },
            },
            { session }
          );
        }
      }
      policy.status = "RETIRED";
      policy.retiredAt = now;
      policy.retiredBy = adminUserId;
      await policy.save({ session });
      await AdminActionLog.create(
        [
          {
            adminUserId,
            action: "arena.main-policy-retire",
            detail: policy.displayName,
            metadata: {
              policyId: String(policy._id),
            },
          },
        ],
        { session }
      );
      retiredPolicy = policy;
    });
  } finally {
    await session.endSession();
  }
  invalidateMainDivisionPolicyCache();
  return retiredPolicy;
}

function hasMaterialRenewalChange(
  previousSnapshot,
  nextPolicy
) {
  if (!previousSnapshot || !nextPolicy) {
    return false;
  }
  const nextSnapshot = policySnapshot(nextPolicy);
  return (
    Number(previousSnapshot.priceAmount) !==
      Number(nextSnapshot.priceAmount) ||
    JSON.stringify(previousSnapshot.payback || {}) !==
      JSON.stringify(nextSnapshot.payback || {})
  );
}

function invalidateArenaPolicyCache() {
  policyCache.delete(ACTIVE_POLICY_CACHE_KEY);
}

function invalidateMainDivisionPolicyCache() {
  policyCache.delete(ACTIVE_MAIN_POLICY_CACHE_KEY);
}

module.exports = {
  DEFAULT_LEARNING_PACKAGE_DAYS,
  DEFAULT_LEARNING_PACKAGE_PRICE_AMOUNT,
  activateMainDivisionPolicyVersion,
  activateArenaPolicyVersion,
  createMainDivisionPolicyVersion,
  createArenaPolicyVersion,
  defaultLearningPackagePolicyDefinition,
  ensureDefaultLearningPackagePolicy,
  ensureFullAttendanceLearningPackagePolicy,
  getActiveArenaPolicy,
  getActiveMainDivisionPolicy,
  getArenaPolicyAdminData,
  hasMaterialRenewalChange,
  invalidateArenaPolicyCache,
  invalidateMainDivisionPolicyCache,
  learningPackagePolicyView,
  mainPolicySnapshot,
  minimumMainStakeDaysForTierGap,
  normalizeMainPolicyDraftInput,
  normalizePolicyDraftInput,
  parseKstDateTime,
  planPolicyActivation,
  policySnapshot,
  retireMainDivisionPolicyVersion,
  retireArenaPolicyVersion,
  updateLearningPackagePrice,
  validatePaybackBands,
};
