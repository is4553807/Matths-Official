const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const {
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
} = require("../models/goatArenaModel");
const {
  NORMAL_MATCH_PROBLEM_PACK_PENDING,
  NORMAL_MATCH_SCORING_PENDING,
  arenaTupleFromStanding,
  buildEligibleDefenseCandidates,
  eligibleSubDefenseCandidates,
  isEligibleSubDefenseDirection,
  isSundayDivisionLocked,
  isSundayMatchRequestLocked,
  matchKeyForRequest,
  normalStakeDaysFromCycle,
  normalizeRequestId,
  sameTestAccountCohort,
  selectRandomSubDefenseCandidate,
  subDailyEligibilityReasons,
  subDailyLimitState,
  subMatchStartDeadline,
} = require("../services/arenaMatchService");
const {
  SUB_TIER_PAIR_CONFIG,
  isAllowedSubTierChallenge,
} = require("../services/arenaOneOnOneProblemBank");

async function run() {
  const root = path.resolve(__dirname, "..");

  assert.equal(sameTestAccountCohort({}, {}), true);
  assert.equal(sameTestAccountCohort({ isTestAccount: true }, { isTestAccount: true }), true);
  assert.equal(sameTestAccountCohort({ isTestAccount: true }, { isTestAccount: false }), false);
  assert.equal(sameTestAccountCohort({ isTestAccount: false }, { isTestAccount: true }), false);
  assert.equal(
    sameTestAccountCohort(
      { isTestAccount: false, arenaTestMatchEnabled: true },
      { isTestAccount: true }
    ),
    true
  );
  assert.equal(
    sameTestAccountCohort(
      { isTestAccount: true },
      { isTestAccount: false, arenaTestMatchEnabled: true }
    ),
    true
  );

  assert.equal(
    isSundayDivisionLocked(
      "2026-08-02T14:59:59+09:00"
    ),
    false
  );
  assert.equal(
    isSundayMatchRequestLocked(
      "2026-08-02T13:59:59+09:00"
    ),
    false
  );
  assert.equal(
    isSundayMatchRequestLocked(
      "2026-08-02T14:00:00+09:00"
    ),
    true
  );
  assert.equal(
    isSundayMatchRequestLocked(
      "2026-08-02T14:59:59+09:00",
      "MAIN"
    ),
    true
  );
  assert.equal(
    isSundayMatchRequestLocked(
      "2026-08-02T15:00:00+09:00",
      "MAIN"
    ),
    true
  );
  assert.equal(
    subMatchStartDeadline(
      "2026-08-01T20:00:00+09:00"
    ).toISOString(),
    new Date("2026-08-02T14:00:00+09:00").toISOString()
  );
  assert.equal(SUB_TIER_PAIR_CONFIG.length, 17);
  assert.equal(isAllowedSubTierChallenge("브론즈", "브론즈"), true);
  assert.equal(isAllowedSubTierChallenge("브론즈", "실버"), true);
  assert.equal(isAllowedSubTierChallenge("실버", "골드"), true);
  assert.equal(isAllowedSubTierChallenge("실버", "실버"), true);
  assert.equal(isAllowedSubTierChallenge("실버", "플래티넘"), false);
  assert.equal(isAllowedSubTierChallenge("챌린저", "챌린저"), true);
  assert.equal(
    isSundayDivisionLocked(
      "2026-08-02T15:00:00+09:00"
    ),
    true
  );
  assert.equal(
    isSundayDivisionLocked(
      "2026-08-02T23:59:59+09:00"
    ),
    true
  );
  assert.equal(
    isSundayDivisionLocked(
      "2026-08-03T00:00:00+09:00"
    ),
    false
  );

  const requestId =
    "2f741ecc-4c91-45f7-b40c-e72a11901162";
  assert.equal(
    normalizeRequestId(requestId),
    requestId
  );
  assert.throws(
    () => normalizeRequestId("short"),
    /요청 식별자/
  );
  assert.throws(
    () => normalizeRequestId("a".repeat(161)),
    /요청 식별자/
  );

  const challengerUserId =
    new mongoose.Types.ObjectId();
  const defenderUserId =
    new mongoose.Types.ObjectId();
  const challengerStandingId =
    new mongoose.Types.ObjectId();
  const defenderStandingId =
    new mongoose.Types.ObjectId();
  const challengerCycleId =
    new mongoose.Types.ObjectId();
  const defenderCycleId =
    new mongoose.Types.ObjectId();
  const matchId =
    new mongoose.Types.ObjectId();
  const matchKey = matchKeyForRequest({
    challengerUserId,
    requestId,
  });
  assert.equal(
    matchKey,
    matchKeyForRequest({
      challengerUserId,
      requestId,
    })
  );
  assert.notEqual(
    matchKey,
    matchKeyForRequest({
      challengerUserId:
        defenderUserId,
      requestId,
    })
  );
  assert.ok(matchKey.length <= 200);

  assert.equal(
    normalStakeDaysFromCycle({
      policySnapshot: {
        matchStakeDays: {
          normal: 3,
        },
      },
    }),
    1
  );
  assert.equal(
    normalStakeDaysFromCycle({}),
    1
  );
  const bronzeDaily = subDailyLimitState({
    cycle: {},
    standing: { arenaRank: "브론즈" },
    usage: { attackCount: 3, defenseCount: 0, challengerWin: false },
  });
  assert.deepEqual(
    {
      attackLimit: bronzeDaily.attackLimit,
      defenseLimit: bronzeDaily.defenseLimit,
      attackRemaining: bronzeDaily.attackRemaining,
      defenseRemaining: bronzeDaily.defenseRemaining,
    },
    { attackLimit: 3, defenseLimit: 1, attackRemaining: 0, defenseRemaining: 1 }
  );
  assert.deepEqual(
    subDailyEligibilityReasons({
      daily: { ...bronzeDaily, attackCount: 3 },
      role: "CHALLENGER",
    }),
    ["SUB_DAILY_ATTACK_LIMIT_REACHED"]
  );
  assert.deepEqual(
    subDailyEligibilityReasons({
      daily: { ...bronzeDaily, challengerWin: true },
      role: "DEFENDER",
    }),
    ["SUB_DAILY_LOCK_AFTER_CHALLENGER_WIN"]
  );
  assert.deepEqual(
    arenaTupleFromStanding({
      arenaRank: "에메랄드",
      arenaPosition: 8,
      arenaGp: 40,
    }),
    {
      arenaRank: "에메랄드",
      arenaPosition: 8,
      arenaGp: 40,
    }
  );

  const eligibleUserId =
    new mongoose.Types.ObjectId();
  const busyUserId =
    new mongoose.Types.ObjectId();
  const eligibleStandingId =
    new mongoose.Types.ObjectId();
  const busyStandingId =
    new mongoose.Types.ObjectId();
  const eligibleCycleId =
    new mongoose.Types.ObjectId();
  const busyCycleId =
    new mongoose.Types.ObjectId();
  const candidateLayout =
    buildEligibleDefenseCandidates({
      standings: [
        {
          _id: eligibleStandingId,
          userId: eligibleUserId,
          arenaRank: "다이아몬드",
          arenaPosition: 2,
          arenaGp: 80,
        },
        {
          _id: busyStandingId,
          userId: busyUserId,
          arenaRank: "에메랄드",
          arenaPosition: 1,
          arenaGp: 50,
        },
      ],
      accessStates: [
        {
          userId: eligibleUserId,
          standingId:
            eligibleStandingId,
          accessCycleId:
            eligibleCycleId,
        },
        {
          userId: busyUserId,
          standingId: busyStandingId,
          accessCycleId: busyCycleId,
        },
      ],
      users: [
        {
          _id: eligibleUserId,
          name: "적격방어자",
        },
        {
          _id: busyUserId,
          name: "경기중방어자",
        },
      ],
      cycles: [
        {
          _id: eligibleCycleId,
          userId: eligibleUserId,
        },
        {
          _id: busyCycleId,
          userId: busyUserId,
        },
      ],
      busyUserIds: [busyUserId],
      challengerArenaRank: "에메랄드",
      limit: 50,
    });
  assert.deepEqual(
    candidateLayout.candidates.map(
      (candidate) =>
        candidate.displayName.startsWith(
          "방어자 "
        )
    ),
    [true]
  );
  assert.equal(
    candidateLayout.hasMore,
    false
  );

  const fairSelection = selectRandomSubDefenseCandidate({
    candidates: [
      { userId: "already-defended", arenaRank: "실버", dailyDefenseCount: 1 },
      { userId: "not-defended-a", arenaRank: "실버", dailyDefenseCount: 0 },
      { userId: "not-defended-b", arenaRank: "실버", dailyDefenseCount: 0 },
    ],
    targetTier: "SILVER",
    randomSelectionSeed: "fair-defense-distribution",
  });
  assert.ok(
    ["not-defended-a", "not-defended-b"].includes(fairSelection.userId)
  );

  const bronzeChallenger = {
    arenaRank: "브론즈",
    arenaPosition: 20,
    arenaGp: 0,
  };
  assert.equal(
    isEligibleSubDefenseDirection({
      challengerStanding: bronzeChallenger,
      candidate: { arenaRank: "브론즈", arenaPosition: 19, arenaGp: 0 },
    }),
    true
  );
  assert.equal(
    isEligibleSubDefenseDirection({
      challengerStanding: { arenaRank: "골드", arenaPosition: 8 },
      candidate: { arenaRank: "골드", arenaPosition: 7 },
    }),
    true
  );
  assert.equal(
    isEligibleSubDefenseDirection({
      challengerStanding: { arenaRank: "골드", arenaPosition: 8 },
      candidate: { arenaRank: "골드", arenaPosition: 9 },
    }),
    false
  );
  assert.equal(
    isEligibleSubDefenseDirection({
      challengerStanding: bronzeChallenger,
      candidate: { arenaRank: "브론즈", arenaPosition: 21, arenaGp: 0 },
    }),
    false
  );
  assert.equal(
    isEligibleSubDefenseDirection({
      challengerStanding: bronzeChallenger,
      candidate: { arenaRank: "실버", arenaPosition: 50, arenaGp: 0 },
    }),
    true
  );
  assert.deepEqual(
    eligibleSubDefenseCandidates({
      challengerStanding: bronzeChallenger,
      candidates: [
        { userId: "higher-bronze", arenaRank: "브론즈", arenaPosition: 19 },
        { userId: "lower-bronze", arenaRank: "브론즈", arenaPosition: 21 },
        { userId: "silver", arenaRank: "실버", arenaPosition: 50 },
      ],
    }).map((candidate) => candidate.userId),
    ["higher-bronze", "silver"]
  );

  const match = new ArenaMatch({
    _id: matchId,
    matchKey,
    division: "SUB",
    seasonKey: "2026",
    matchType: "NORMAL",
    requestInitiatorUserId:
      challengerUserId,
    tierPairKey: "EMERALD_DIAMOND",
    tierPairLabel: "에메랄드-다이아몬드",
    challenger: {
      userId: challengerUserId,
      standingId:
        challengerStandingId,
      accessCycleId:
        challengerCycleId,
      tupleBefore: {
        arenaRank: "에메랄드",
        arenaPosition: 8,
        arenaGp: 40,
      },
      stakeDays: 1,
    },
    defender: {
      userId: defenderUserId,
      standingId: defenderStandingId,
      accessCycleId: defenderCycleId,
      tupleBefore: {
        arenaRank: "다이아몬드",
        arenaPosition: 15,
        arenaGp: 70,
      },
      stakeDays: 0,
    },
    status: "MATCHED",
    policyVersionCode:
      "ARENA-20260801-TEST",
    problemPackVersion:
      NORMAL_MATCH_PROBLEM_PACK_PENDING,
    scoringVersion:
      NORMAL_MATCH_SCORING_PENDING,
    requestedAt: new Date(),
    startDeadlineAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  await assert.doesNotReject(() =>
    match.validate()
  );
  await assert.doesNotReject(() =>
    new ArenaMatchParticipantLock({
      userId: challengerUserId,
      matchId,
    }).validate()
  );
  await assert.doesNotReject(() =>
    new ArenaLearningDayLedger({
      userId: challengerUserId,
      accessCycleId:
        challengerCycleId,
      idempotencyKey:
        `${matchId}:NORMAL_STAKE_LOCKED`,
      eventType:
        "MATCH_STAKE_LOCKED",
      availableLearningDaysDelta: 0,
      paybackScoreDaysDelta: -1,
      lockedPaybackScoreDaysDelta: 1,
      lockedLearningDaysDelta: 0,
      balanceAfter: {
        availableLearningDays: 10,
        paybackScoreDays: 28,
        lockedPaybackScoreDays: 1,
        lockedLearningDays: 0,
      },
      sourceType: "ArenaMatch",
      sourceId: matchId,
    }).validate()
  );
  await assert.doesNotReject(() =>
    new ArenaOutboxEvent({
      eventType: "ArenaMatchCreated",
      aggregateType: "ArenaMatch",
      aggregateId: matchId,
      idempotencyKey:
        `${matchId}:ArenaMatchCreated`,
    }).validate()
  );

  const serviceSource = fs.readFileSync(
    path.join(
      root,
      "services/arenaMatchService.js"
    ),
    "utf8"
  );
  const routeSource = fs.readFileSync(
    path.join(
      root,
      "routes/goat-arena-routes.js"
    ),
    "utf8"
  );
  const controllerSource =
    fs.readFileSync(
      path.join(
        root,
        "controllers/goatArenaController.js"
      ),
      "utf8"
    );
  const mainServiceSource = fs.readFileSync(
    path.join(root, "services/mainArenaMatchService.js"),
    "utf8"
  );
  const viewSource = fs.readFileSync(
    path.join(
      root,
      "views/goat-arena-sub-challenge.ejs"
    ),
    "utf8"
  );

  assert.equal(
    /mmrService|LiveFinalRankingProfile|RankingProfile/.test(
      serviceSource
    ),
    false,
    "일반 쟁탈전 생성은 내부 실력 지표와 최종 종합 랭킹을 참조하면 안 됩니다."
  );
  assert.ok(
    serviceSource.includes(
      "withTransaction"
    ) &&
      serviceSource.includes(
        "ArenaMatchParticipantLock.create"
      ) &&
      serviceSource.includes(
        '"MATCH_STAKE_LOCKED"'
      ) &&
      serviceSource.includes(
        '"ArenaMatchCreated"'
      ) &&
      serviceSource.includes(
        "subscriptionPolicyVersionCode"
      ) &&
      serviceSource.includes(
        "idempotencyKey"
      )
  );
  assert.ok(
    mainServiceSource.includes(
      "mandatoryDefense ? { defensePoolEligible: true } : {}"
    ),
    "Ranked 자동 방어 후보에서도 5회 미응시 제외 상태를 적용해야 합니다."
  );
  assert.ok(
    routeSource.includes(
      '"/goat-arena/sub/challenge"'
    ) &&
      routeSource.includes(
        '"/goat-arena/sub/challenges"'
      ) &&
      controllerSource.includes(
        "createSubNormalChallenge"
      )
  );
  assert.ok(
    !viewSource.includes(
      'name="targetTier"'
    ) &&
      viewSource.includes(
        "같은 티어의 더 높은 순위"
      ) &&
      !viewSource.includes(
        'name="defenderStandingId"'
      )
  );

  console.log(
    "Arena normal challenge creation verification passed."
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
