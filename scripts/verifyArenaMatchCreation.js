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
  isSundayDivisionLocked,
  isSundayMatchRequestLocked,
  matchKeyForRequest,
  normalStakeDaysFromCycle,
  normalizeRequestId,
  subMatchStartDeadline,
} = require("../services/arenaMatchService");
const {
  SUB_TIER_PAIR_CONFIG,
  isAllowedSubTierChallenge,
} = require("../services/arenaOneOnOneProblemBank");

async function run() {
  const root = path.resolve(__dirname, "..");

  assert.equal(
    isSundayDivisionLocked(
      "2026-08-02T14:59:59+09:00"
    ),
    false
  );
  assert.equal(
    isSundayMatchRequestLocked(
      "2026-08-02T14:29:59+09:00"
    ),
    false
  );
  assert.equal(
    isSundayMatchRequestLocked(
      "2026-08-02T14:30:00+09:00"
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
    new Date("2026-08-02T14:30:00+09:00").toISOString()
  );
  assert.equal(SUB_TIER_PAIR_CONFIG.length, 10);
  assert.equal(isAllowedSubTierChallenge("브론즈", "브론즈"), true);
  assert.equal(isAllowedSubTierChallenge("브론즈", "실버"), true);
  assert.equal(isAllowedSubTierChallenge("실버", "골드"), true);
  assert.equal(isAllowedSubTierChallenge("실버", "실버"), false);
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
  assert.deepEqual(
    arenaTupleFromStanding({
      arenaRank: "에메랄드",
      arenaPosition: 8,
      arenaGp: 1180,
    }),
    {
      arenaRank: "에메랄드",
      arenaPosition: 8,
      arenaGp: 1180,
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
          arenaGp: 1300,
        },
        {
          _id: busyStandingId,
          userId: busyUserId,
          arenaRank: "에메랄드",
          arenaPosition: 1,
          arenaGp: 1200,
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
        arenaGp: 1180,
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
        arenaGp: 1260,
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
      availableLearningDaysDelta: -1,
      lockedLearningDaysDelta: 1,
      balanceAfter: {
        availableLearningDays: 9,
        paybackScoreDays: 29,
        lockedLearningDays: 1,
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
    viewSource.includes(
      'name="targetTier"'
    ) &&
      viewSource.includes(
        "무작위로 선정해 자동 매치"
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
