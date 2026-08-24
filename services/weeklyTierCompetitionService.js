const mongoose = require("mongoose");
const {
  PrivateMockWeeklyResult,
  RankingProfile,
  UserNotification,
  WeeklyTierBoundarySettlement,
} = require("../models/matthsModel");
const {
  ArenaAccessState,
  ArenaCohortRevision,
  ArenaStanding,
} = require("../models/goatArenaModel");
const {
  ARENA_TIER_CONFIG,
  arenaTierByValue,
} = require("./arenaTierPolicy");

const WEEKLY_TIER_COMPETITION_VERSION =
  "WEEKLY-TIER-BOUNDARY-V3";
const WEEKLY_PROMOTION_TOP_RATE = 0.2;
const WEEKLY_PROMOTION_MIN_CANDIDATES = 1;
const WEEKLY_PROMOTION_MAX_CANDIDATES = 5;
const WEEKLY_PROMOTION_SKILL_STREAK = 2;
/* 2026-08-23 00:00 KST. 과거 공개 주차를 배포 시점에 소급 정산하지 않는다. */
const WEEKLY_TIER_COMPETITION_START_AT = new Date(
  "2026-08-22T15:00:00.000Z"
);
const WEEKLY_TIER_RESULT_INDEX = Object.freeze({
  weekKey: 1,
  "tierCompetition.division": 1,
  "tierCompetition.tierAtStart": 1,
  "tierCompetition.tierRank": 1,
});
const WEEKLY_TIER_SETTLEMENT_INDEX = Object.freeze({
  weekKey: 1,
  seasonKey: 1,
  division: 1,
  lowerTier: 1,
  upperTier: 1,
  slotNumber: 1,
});
const LEGACY_WEEKLY_TIER_SETTLEMENT_INDEX = Object.freeze({
  weekKey: 1,
  seasonKey: 1,
  division: 1,
  lowerTier: 1,
  upperTier: 1,
});
let weeklyTierIndexPromise = null;

function sameIndexKeys(left = {}, right = {}) {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(
      ([key, value], index) =>
        rightEntries[index]?.[0] === key &&
        rightEntries[index]?.[1] === value
    )
  );
}

async function ensureWeeklyTierSettlementIndex() {
  const collection = WeeklyTierBoundarySettlement.collection;
  try {
    await WeeklyTierBoundarySettlement.createCollection();
  } catch (error) {
    if (![48, 17399].includes(Number(error?.code))) throw error;
  }
  const indexes = await collection.indexes();
  const legacyIndex = indexes.find(
    (index) =>
      index.unique === true &&
      sameIndexKeys(index.key, LEGACY_WEEKLY_TIER_SETTLEMENT_INDEX)
  );
  if (legacyIndex?.name) {
    try {
      await collection.dropIndex(legacyIndex.name);
    } catch (error) {
      if (![26, 27].includes(Number(error?.code))) throw error;
    }
  }
  await collection.updateMany(
    { slotNumber: { $exists: false } },
    { $set: { slotNumber: 1 } }
  );
  return collection.createIndex(WEEKLY_TIER_SETTLEMENT_INDEX, {
    name: "weekKey_1_seasonKey_1_division_1_lowerTier_1_upperTier_1_slotNumber_1",
    unique: true,
  });
}

async function ensureWeeklyTierCompetitionIndexes() {
  if (weeklyTierIndexPromise) return weeklyTierIndexPromise;
  weeklyTierIndexPromise = Promise.all([
    PrivateMockWeeklyResult.collection.createIndex(
      WEEKLY_TIER_RESULT_INDEX,
      {
        name: "weekKey_1_tierCompetition.division_1_tierCompetition.tierAtStart_1_tierCompetition.tierRank_1",
      }
    ),
    ensureWeeklyTierSettlementIndex(),
  ]).catch((error) => {
    weeklyTierIndexPromise = null;
    throw error;
  });
  return weeklyTierIndexPromise;
}

function isWeeklyTierCompetitionWeek(releaseAt) {
  const value = new Date(releaseAt);
  return (
    !Number.isNaN(value.getTime()) &&
    value >= WEEKLY_TIER_COMPETITION_START_AT
  );
}

function identifier(value) {
  return String(value?._id || value || "");
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/* 음수면 left가 더 좋은 주간 대표 성적이다. */
function compareWeeklyBoundaryScore(left, right) {
  const performanceDifference =
    finiteNumber(right?.representativePerformance) -
    finiteNumber(left?.representativePerformance);
  if (performanceDifference !== 0) return performanceDifference;

  const scoreDifference =
    finiteNumber(right?.representativeRawScore) -
    finiteNumber(left?.representativeRawScore);
  if (scoreDifference !== 0) return scoreDifference;

  const elapsedDifference =
    finiteNumber(left?.representativeElapsedMs, Number.MAX_SAFE_INTEGER) -
    finiteNumber(right?.representativeElapsedMs, Number.MAX_SAFE_INTEGER);
  if (elapsedDifference !== 0) return elapsedDifference;

  return 0;
}

function compareWeeklyTierResults(left, right) {
  const scoreDifference = compareWeeklyBoundaryScore(left, right);
  if (scoreDifference !== 0) return scoreDifference;

  const createdDifference =
    new Date(left?.createdAt || 0).getTime() -
    new Date(right?.createdAt || 0).getTime();
  if (createdDifference !== 0) return createdDifference;

  return identifier(left?.userId).localeCompare(identifier(right?.userId));
}

function tierGroupKey(division, tier) {
  return `${String(division || "").toUpperCase()}:${arenaTierByValue(tier).code}`;
}

function hasConsecutiveSkillThreshold(entry, threshold) {
  const competitiveHistory = (
    Array.isArray(entry?.skillHistory) ? entry.skillHistory : []
  ).filter((event) => ["weekly-exam", "absence"].includes(event?.eventType));
  const recent = competitiveHistory.slice(-WEEKLY_PROMOTION_SKILL_STREAK);
  return (
    recent.length === WEEKLY_PROMOTION_SKILL_STREAK &&
    recent.every(
      (event) =>
        event.eventType === "weekly-exam" &&
        finiteNumber(event.newMmr, -1) >= threshold
    )
  );
}

function weeklyPromotionCandidates(lower, upperTier) {
  const topCount = Math.min(
    WEEKLY_PROMOTION_MAX_CANDIDATES,
    Math.max(
      WEEKLY_PROMOTION_MIN_CANDIDATES,
      Math.ceil(lower.length * WEEKLY_PROMOTION_TOP_RATE)
    )
  );
  const candidates = [];
  const selectedUserIds = new Set();
  const append = (entry, candidateReason) => {
    const userId = identifier(entry?.result?.userId);
    if (!userId || selectedUserIds.has(userId)) return;
    selectedUserIds.add(userId);
    candidates.push({ entry, candidateReason });
  };

  lower.slice(0, topCount).forEach((entry) =>
    append(entry, "WEEKLY_TOP_PERCENT")
  );
  lower
    .filter((entry) =>
      hasConsecutiveSkillThreshold(entry, upperTier.legacyMinGp)
    )
    .forEach((entry) => append(entry, "SKILL_INDEX_STREAK"));

  return candidates.slice(0, WEEKLY_PROMOTION_MAX_CANDIDATES);
}

function buildWeeklyTierCompetitionPlan(entries = []) {
  const groups = new Map();
  const rankings = [];

  for (const entry of entries) {
    if (!entry?.standing || !entry?.result) continue;
    const division = String(
      entry.division || entry.standing.division || ""
    ).toUpperCase();
    if (!["SUB", "MAIN"].includes(division)) continue;
    const tier = arenaTierByValue(
      entry.tierAtStart || entry.standing.arenaRank
    );
    const normalized = {
      ...entry,
      division,
      tierAtStart: tier.label,
      tierCode: tier.code,
    };
    const key = tierGroupKey(division, tier.code);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(normalized);
  }

  for (const group of groups.values()) {
    group.sort((left, right) =>
      compareWeeklyTierResults(left.result, right.result)
    );
    group.forEach((entry, index) => {
      entry.tierRank = index + 1;
      entry.tierParticipantCount = group.length;
      rankings.push(entry);
    });
  }

  const boundaries = [];
  for (const division of ["SUB", "MAIN"]) {
    const usedUserIds = new Set();
    for (
      let lowerIndex = ARENA_TIER_CONFIG.length - 2;
      lowerIndex >= 0;
      lowerIndex -= 1
    ) {
      const lowerTier = ARENA_TIER_CONFIG[lowerIndex];
      const upperTier = ARENA_TIER_CONFIG[lowerIndex + 1];
      const lower = groups.get(tierGroupKey(division, lowerTier.code)) || [];
      const upper = groups.get(tierGroupKey(division, upperTier.code)) || [];
      if (!lower.length || !upper.length) continue;

      const candidates = weeklyPromotionCandidates(lower, upperTier)
        .filter(({ entry }) => !usedUserIds.has(identifier(entry.result.userId)));
      const defenders = [...upper]
        .reverse()
        .filter((entry) => !usedUserIds.has(identifier(entry.result.userId)));
      const pairCount = Math.min(candidates.length, defenders.length);
      for (let slotIndex = 0; slotIndex < pairCount; slotIndex += 1) {
        const candidate = candidates[slotIndex];
        const challenger = candidate.entry;
        const defender = defenders[slotIndex];
        const challengerId = identifier(challenger.result.userId);
        const defenderId = identifier(defender.result.userId);
        if (!challengerId || !defenderId || challengerId === defenderId) continue;

        usedUserIds.add(challengerId);
        usedUserIds.add(defenderId);
        challenger.promotionCandidate = true;
        challenger.candidateReason = candidate.candidateReason;
        challenger.boundarySlot = slotIndex + 1;
        boundaries.push({
          division,
          lowerTier: lowerTier.label,
          upperTier: upperTier.label,
          slotNumber: slotIndex + 1,
          candidateReason: candidate.candidateReason,
          challenger,
          defender,
          shouldPromote:
            compareWeeklyBoundaryScore(
              challenger.result,
              defender.result
            ) < 0,
        });
      }
    }
  }

  return { rankings, boundaries };
}

function scoreSnapshot(entry) {
  return {
    performance: finiteNumber(entry.result.representativePerformance),
    rawScore: finiteNumber(entry.result.representativeRawScore),
    elapsedMs: Math.max(
      0,
      finiteNumber(entry.result.representativeElapsedMs)
    ),
    tierRank: Math.max(1, Number(entry.tierRank) || 1),
  };
}

function standingTuple(standing) {
  return {
    arenaRank: String(standing.arenaRank),
    qualifiedArenaRank: String(
      standing.qualifiedArenaRank || standing.arenaRank
    ),
    arenaPosition: Number(standing.arenaPosition),
    arenaGp: Number(standing.arenaGp),
    gpScaleVersion: String(
      standing.gpScaleVersion || "TIER_LOCAL_0_99_V1"
    ),
  };
}

function tupleUpdate(tuple, now) {
  return {
    arenaRank: tuple.arenaRank,
    qualifiedArenaRank: tuple.qualifiedArenaRank,
    arenaPosition: tuple.arenaPosition,
    arenaGp: tuple.arenaGp,
    reachedCurrentGpAt: now,
  };
}

async function writeStandingTupleSwap({
  challenger,
  defender,
  challengerBefore,
  defenderBefore,
  challengerAfter,
  defenderAfter,
  division,
  seasonKey,
  now,
  session,
}) {
  /*
   * 활성 standing의 (division, season, tier, position)은 unique다. 두 문서를
   * 바로 맞바꾸면 첫 write가 상대 자리와 충돌하므로, 1대1 정산과 동일하게
   * 도전자를 임시 위치로 옮긴 뒤 세 단계로 교환한다.
   */
  const challengerWasActive = challenger.status === "ACTIVE";
  const defenderWasActive = defender.status === "ACTIVE";

  if (challengerWasActive && defenderWasActive) {
    const highest = await ArenaStanding.findOne({ division, seasonKey })
      .sort({ arenaPosition: -1 })
      .select("arenaPosition")
      .session(session)
      .lean();
    const temporaryPosition =
      Math.max(
        finiteNumber(highest?.arenaPosition),
        finiteNumber(challengerBefore.arenaPosition),
        finiteNumber(defenderBefore.arenaPosition)
      ) + 1;
    const temporaryTuple = {
      ...tupleUpdate(challengerBefore, now),
      arenaPosition: temporaryPosition,
    };

    const temporaryWrite = await ArenaStanding.updateOne(
      {
        _id: challenger._id,
        status: "ACTIVE",
        arenaRank: challengerBefore.arenaRank,
        arenaPosition: challengerBefore.arenaPosition,
        arenaGp: challengerBefore.arenaGp,
      },
      { $set: temporaryTuple },
      { session }
    );
    const defenderWrite = await ArenaStanding.updateOne(
      {
        _id: defender._id,
        status: "ACTIVE",
        arenaRank: defenderBefore.arenaRank,
        arenaPosition: defenderBefore.arenaPosition,
        arenaGp: defenderBefore.arenaGp,
      },
      { $set: tupleUpdate(defenderAfter, now) },
      { session }
    );
    const challengerWrite = await ArenaStanding.updateOne(
      {
        _id: challenger._id,
        status: "ACTIVE",
        arenaRank: challengerBefore.arenaRank,
        arenaPosition: temporaryPosition,
        arenaGp: challengerBefore.arenaGp,
      },
      { $set: tupleUpdate(challengerAfter, now) },
      { session }
    );

    if (
      Number(temporaryWrite.modifiedCount) !== 1 ||
      Number(defenderWrite.modifiedCount) !== 1 ||
      Number(challengerWrite.modifiedCount) !== 1
    ) {
      throw new Error("주간 티어 정산 중 Arena 상태가 변경되었습니다.");
    }
    return { challengerAfter, defenderAfter };
  }

  /*
   * 모의고사 전용 이용권 사용자의 standing은 Arena 경기 권한이 없어
   * LOCKED다. 티어 정본에는 계속 참여시키되, ACTIVE 문서에만 적용되는
   * 티어 내 위치 unique 제약을 침범하지 않도록 활성 참가자를 잠시 잠그고
   * 교환한 뒤 새 티어의 마지막 활성 위치로 복원한다.
   */
  const swaps = [
    {
      standing: challenger,
      before: challengerBefore,
      after: { ...challengerAfter },
      wasActive: challengerWasActive,
    },
    {
      standing: defender,
      before: defenderBefore,
      after: { ...defenderAfter },
      wasActive: defenderWasActive,
    },
  ];
  for (const swap of swaps) {
    const write = await ArenaStanding.updateOne(
      {
        _id: swap.standing._id,
        status: swap.standing.status,
        arenaRank: swap.before.arenaRank,
        arenaPosition: swap.before.arenaPosition,
        arenaGp: swap.before.arenaGp,
      },
      {
        $set: {
          ...tupleUpdate(swap.after, now),
          status: "LOCKED",
        },
      },
      { session }
    );
    if (Number(write.modifiedCount) !== 1) {
      throw new Error("주간 티어 정산 중 Arena 상태가 변경되었습니다.");
    }
  }

  for (const swap of swaps.filter((entry) => entry.wasActive)) {
    const lastActive = await ArenaStanding.findOne({
      division,
      seasonKey,
      arenaRank: swap.after.arenaRank,
      status: "ACTIVE",
    })
      .sort({ arenaPosition: -1 })
      .select("arenaPosition")
      .session(session)
      .lean();
    swap.after.arenaPosition = finiteNumber(lastActive?.arenaPosition) + 1;
    const restore = await ArenaStanding.updateOne(
      {
        _id: swap.standing._id,
        status: "LOCKED",
        arenaRank: swap.after.arenaRank,
        arenaGp: swap.after.arenaGp,
      },
      {
        $set: {
          ...tupleUpdate(swap.after, now),
          status: "ACTIVE",
        },
      },
      { session }
    );
    if (Number(restore.modifiedCount) !== 1) {
      throw new Error("주간 티어 정산 중 Arena 활성 상태를 복원하지 못했습니다.");
    }
  }

  return {
    challengerAfter: swaps[0].after,
    defenderAfter: swaps[1].after,
  };
}

async function settleWeeklyTierBoundary({
  weekKey,
  boundary,
  now,
}) {
  const challengerStanding = boundary.challenger.standing;
  const defenderStanding = boundary.defender.standing;
  const seasonKey = String(challengerStanding.seasonKey || "");
  const identity = {
    weekKey,
    seasonKey,
    division: boundary.division,
    lowerTier: boundary.lowerTier,
    upperTier: boundary.upperTier,
    slotNumber: Math.max(1, Number(boundary.slotNumber) || 1),
  };

  if (await WeeklyTierBoundarySettlement.exists(identity)) {
    return { replayed: true };
  }

  const session = await mongoose.startSession();
  let output = null;
  try {
    await session.withTransaction(async () => {
      const replay = await WeeklyTierBoundarySettlement.findOne(identity)
        .session(session)
        .lean();
      if (replay) {
        output = { replayed: true, settlement: replay };
        return;
      }

      const [challenger, defender] = await Promise.all([
        ArenaStanding.findById(challengerStanding._id).session(session),
        ArenaStanding.findById(defenderStanding._id).session(session),
      ]);
      if (!challenger || !defender) {
        throw new Error("주간 티어 경계 참가자의 Arena 상태를 찾을 수 없습니다.");
      }

      const challengerBefore = standingTuple(challenger);
      const defenderBefore = standingTuple(defender);
      const standingChanged =
        !["ACTIVE", "LOCKED"].includes(challenger.status) ||
        !["ACTIVE", "LOCKED"].includes(defender.status) ||
        challenger.division !== boundary.division ||
        defender.division !== boundary.division ||
        String(challenger.seasonKey || "") !== seasonKey ||
        String(defender.seasonKey || "") !== seasonKey ||
        arenaTierByValue(challenger.arenaRank).label !== boundary.lowerTier ||
        arenaTierByValue(defender.arenaRank).label !== boundary.upperTier;
      const promoted = boundary.shouldPromote && !standingChanged;
      let challengerAfter = promoted ? defenderBefore : challengerBefore;
      let defenderAfter = promoted ? challengerBefore : defenderBefore;
      const outcome = standingChanged
        ? "STANDING_CHANGED"
        : promoted
          ? "PROMOTED"
          : "DEFENDED";

      if (promoted) {
        const swapped = await writeStandingTupleSwap({
          challenger,
          defender,
          challengerBefore,
          defenderBefore,
          challengerAfter,
          defenderAfter,
          division: boundary.division,
          seasonKey,
          now,
          session,
        });
        challengerAfter = swapped.challengerAfter;
        defenderAfter = swapped.defenderAfter;

        await ArenaCohortRevision.findOneAndUpdate(
          { seasonKey, division: boundary.division },
          {
            $inc: { revision: 1 },
            $set: { recalculatedAt: now },
            $setOnInsert: { seasonKey, division: boundary.division },
          },
          { upsert: true, session, setDefaultsOnInsert: true }
        );

        await Promise.all([
          RankingProfile.updateOne(
            { userId: boundary.challenger.result.userId },
            {
              $set: {
                tier: arenaTierByValue(challengerAfter.arenaRank).code,
                rankPoint: challengerAfter.arenaGp,
              },
            },
            { session }
          ),
          RankingProfile.updateOne(
            { userId: boundary.defender.result.userId },
            {
              $set: {
                tier: arenaTierByValue(defenderAfter.arenaRank).code,
                rankPoint: defenderAfter.arenaGp,
              },
            },
            { session }
          ),
        ]);
      }

      const [settlement] = await WeeklyTierBoundarySettlement.create(
        [
          {
            ...identity,
            challengerUserId: boundary.challenger.result.userId,
            defenderUserId: boundary.defender.result.userId,
            challengerWeeklyResultId: boundary.challenger.result._id,
            defenderWeeklyResultId: boundary.defender.result._id,
            challengerScore: scoreSnapshot(boundary.challenger),
            defenderScore: scoreSnapshot(boundary.defender),
            candidateReason: boundary.candidateReason,
            outcome,
            challengerTupleBefore: challengerBefore,
            challengerTupleAfter: challengerAfter,
            defenderTupleBefore: defenderBefore,
            defenderTupleAfter: defenderAfter,
            settledAt: now,
          },
        ],
        { session }
      );

      const sharedResultUpdate = {
        settlementId: settlement._id,
        settledAt: now,
      };
      await Promise.all([
        PrivateMockWeeklyResult.updateOne(
          { _id: boundary.challenger.result._id },
          {
            $set: {
              "tierCompetition.outcome": promoted
                ? "PROMOTED"
                : standingChanged
                  ? "STAYED"
                  : "CHALLENGE_LOST",
              "tierCompetition.promotionCandidate": true,
              "tierCompetition.candidateReason": boundary.candidateReason,
              "tierCompetition.boundarySlot": identity.slotNumber,
              "tierCompetition.opponentUserId":
                boundary.defender.result.userId,
              "tierCompetition.opponentTier": boundary.upperTier,
              "tierCompetition.settlementId": sharedResultUpdate.settlementId,
              "tierCompetition.settledAt": sharedResultUpdate.settledAt,
            },
          },
          { session }
        ),
        PrivateMockWeeklyResult.updateOne(
          { _id: boundary.defender.result._id },
          {
            $set: {
              "tierCompetition.outcome": promoted
                ? "DEMOTED"
                : standingChanged
                  ? "STAYED"
                  : "DEFENDED",
              "tierCompetition.opponentUserId":
                boundary.challenger.result.userId,
              "tierCompetition.opponentTier": boundary.lowerTier,
              "tierCompetition.settlementId": sharedResultUpdate.settlementId,
              "tierCompetition.settledAt": sharedResultUpdate.settledAt,
            },
          },
          { session }
        ),
      ]);

      if (!standingChanged) {
        await UserNotification.create(
          [
            {
              userId: boundary.challenger.result.userId,
              title: promoted
                ? "주간 모의고사 티어 승급"
                : "주간 모의고사 승급 경계 결과",
              message: promoted
                ? `${boundary.lowerTier} 승급 후보로 ${boundary.upperTier} 경계 경쟁에서 승리해 승급했습니다.`
                : `${boundary.lowerTier} 승급 후보로 경계 경쟁에 참여했지만 이번 주에는 현재 티어를 유지합니다.`,
              href: "/private-mock-exams",
              kind: "system",
              createdBy: null,
            },
            {
              userId: boundary.defender.result.userId,
              title: promoted
                ? "주간 모의고사 티어 경계 결과"
                : "주간 모의고사 티어 방어 성공",
              message: promoted
                ? `${boundary.upperTier} 경계 경쟁 결과 ${boundary.lowerTier} 티어로 이동했습니다.`
                : `${boundary.upperTier} 티어 경계 경쟁에서 현재 티어를 지켰습니다.`,
              href: "/private-mock-exams",
              kind: "system",
              createdBy: null,
            },
          ],
          { session, ordered: true }
        );
      }

      output = { replayed: false, promoted, settlement };
    });
  } catch (error) {
    if (Number(error?.code) === 11000) {
      const replay = await WeeklyTierBoundarySettlement.findOne(identity).lean();
      if (replay) {
        return { replayed: true, settlement: replay };
      }
    }
    throw error;
  } finally {
    await session.endSession();
  }
  return output;
}

async function processWeeklyTierCompetition({
  weekKey,
  now = new Date(),
}) {
  await ensureWeeklyTierCompetitionIndexes();
  const results = await PrivateMockWeeklyResult.find({
    weekKey,
    status: { $in: ["locked", "published"] },
    representativeAttemptId: { $ne: null },
  }).lean();
  if (!results.length) return { rankings: 0, boundaries: 0, settlements: [] };

  const userIds = results.map((result) => result.userId);
  const accessStates = await ArenaAccessState.find({
    userId: { $in: userIds },
    standingId: { $ne: null },
  })
    .select("userId standingId currentCompetitiveDivision")
    .lean();
  const accessByUserId = new Map(
    accessStates.map((state) => [identifier(state.userId), state])
  );
  const standings = await ArenaStanding.find({
    _id: { $in: accessStates.map((state) => state.standingId) },
    status: { $in: ["ACTIVE", "LOCKED"] },
  }).lean();
  const standingById = new Map(
    standings.map((standing) => [identifier(standing._id), standing])
  );
  const rankingProfiles = await RankingProfile.find({
    userId: { $in: userIds },
  })
    .select("userId mmrHistory")
    .lean();
  const rankingProfileByUserId = new Map(
    rankingProfiles.map((profile) => [identifier(profile.userId), profile])
  );

  const entries = results
    .map((result) => {
      const access = accessByUserId.get(identifier(result.userId));
      const standing = standingById.get(identifier(access?.standingId));
      if (!access || !standing) return null;
      return {
        result,
        standing,
        division:
          result.tierCompetition?.division ||
          access.currentCompetitiveDivision ||
          standing.division,
        tierAtStart:
          result.tierCompetition?.tierAtStart || standing.arenaRank,
        skillHistory:
          rankingProfileByUserId.get(identifier(result.userId))?.mmrHistory || [],
      };
    })
    .filter(Boolean);
  const plan = buildWeeklyTierCompetitionPlan(entries);

  if (plan.rankings.length) {
    await PrivateMockWeeklyResult.bulkWrite(
      plan.rankings.map((entry) => {
        const settled = Boolean(entry.result.tierCompetition?.settledAt);
        return {
          updateOne: {
            filter: { _id: entry.result._id },
            update: {
              $set: {
                "tierCompetition.division": entry.division,
                "tierCompetition.tierAtStart": entry.tierAtStart,
                "tierCompetition.tierRank": entry.tierRank,
                "tierCompetition.participantCount":
                  entry.tierParticipantCount,
                "tierCompetition.promotionCandidate":
                  entry.promotionCandidate === true,
                "tierCompetition.candidateReason":
                  entry.candidateReason || "",
                "tierCompetition.boundarySlot":
                  entry.boundarySlot || null,
                ...(!settled
                  ? { "tierCompetition.outcome": "STAYED" }
                  : {}),
              },
            },
          },
        };
      }),
      { ordered: false }
    );
  }

  const settlements = [];
  for (const boundary of plan.boundaries) {
    settlements.push(
      await settleWeeklyTierBoundary({ weekKey, boundary, now })
    );
  }

  /*
   * 레거시 RankingProfile의 숫자 레이팅이 자체 임계값으로 티어를 덮지
   * 않도록, 매주 정산 뒤 모든 참가자의 표시 티어를 ArenaStanding 정본과
   * 다시 맞춘다. LOCKED는 경기 권한만 잠긴 상태이며 티어는 유효하다.
   */
  const latestStandings = await ArenaStanding.find({
    _id: { $in: entries.map((entry) => entry.standing._id) },
    status: { $in: ["ACTIVE", "LOCKED"] },
  })
    .select("userId arenaRank arenaGp")
    .lean();
  if (latestStandings.length) {
    await RankingProfile.bulkWrite(
      latestStandings.map((standing) => ({
        updateOne: {
          filter: { userId: standing.userId },
          update: {
            $set: {
              tier: arenaTierByValue(standing.arenaRank).code,
              rankPoint: finiteNumber(standing.arenaGp),
            },
          },
        },
      })),
      { ordered: false }
    );
  }

  return {
    version: WEEKLY_TIER_COMPETITION_VERSION,
    rankings: plan.rankings.length,
    boundaries: plan.boundaries.length,
    settlements,
  };
}

module.exports = {
  WEEKLY_TIER_COMPETITION_START_AT,
  WEEKLY_TIER_COMPETITION_VERSION,
  WEEKLY_PROMOTION_MAX_CANDIDATES,
  WEEKLY_PROMOTION_TOP_RATE,
  buildWeeklyTierCompetitionPlan,
  compareWeeklyBoundaryScore,
  compareWeeklyTierResults,
  ensureWeeklyTierCompetitionIndexes,
  hasConsecutiveSkillThreshold,
  isWeeklyTierCompetitionWeek,
  processWeeklyTierCompetition,
};
