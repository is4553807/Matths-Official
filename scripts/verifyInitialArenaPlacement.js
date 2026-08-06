const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const {
  AssessmentAttempt,
} = require("../models/matthsModel");
const {
  ArenaAccessState,
  ArenaCohortRevision,
  ArenaOutboxEvent,
  ArenaStanding,
} = require("../models/goatArenaModel");
const {
  INITIAL_ARENA_SEED_POLICY_VERSION,
  LIFECYCLE_OWNED_ACCESS_STATES,
  compareStandingForLayout,
  computeArenaCohortLayout,
  initialArenaGpFromPlacement,
  initialArenaTupleFromPlacement,
  kstSeasonKey,
  temporaryPositionBaseByTier,
} = require("../services/arenaStandingService");
const {
  arenaTierGuide,
  arenaTupleFromLegacyGp,
  localGpFromLegacyGp,
  resolveArenaTier,
} = require("../services/arenaTierPolicy");

function syntheticStandings(
  count,
  arenaGp = 99
) {
  return Array.from(
    { length: count },
    (_, index) => ({
      _id: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      arenaRank: "챌린저",
      arenaGp,
      reachedCurrentGpAt: new Date(
        Date.UTC(2026, 7, 1, 0, 0, index)
      ),
    })
  );
}

async function run() {
  const root = path.resolve(__dirname, "..");

  assert.ok(
    arenaTierGuide().every(
      (tier) => tier.gpRange === "0–99 GP"
    ),
    "모든 공개 Arena 티어는 0~99 GP를 사용해야 합니다."
  );
  assert.deepEqual(
    arenaTupleFromLegacyGp(1520),
    { arenaRank: "챌린저", arenaGp: 0 }
  );
  assert.equal(localGpFromLegacyGp(1519, "GRANDMASTER"), 99);
  assert.equal(localGpFromLegacyGp(800, "SILVER"), 0);

  assert.equal(
    initialArenaGpFromPlacement({
      placementResult: {
        initialRating: 1234.49,
        initialMmr: 999,
      },
    }),
    20
  );
  assert.equal(
    initialArenaGpFromPlacement({
      placementResult: {
        initialMmr: 1001.6,
      },
    }),
    77
  );
  assert.deepEqual(
    initialArenaTupleFromPlacement({
      placementResult: { initialRating: 1234.49 },
    }),
    { arenaRank: "다이아몬드", arenaGp: 20 }
  );
  assert.throws(
    () =>
      initialArenaGpFromPlacement({
        placementResult: {},
      }),
    /최초 GP/
  );

  assert.equal(
    kstSeasonKey(
      "2026-12-31T14:59:59.999Z"
    ),
    "2026"
  );
  assert.equal(
    kstSeasonKey(
      "2026-12-31T15:00:00.000Z"
    ),
    "2027"
  );
  assert.ok(
    LIFECYCLE_OWNED_ACCESS_STATES.includes(
      "SUB_ACCESS_EXPIRED_LOCKED"
    ) &&
      LIFECYCLE_OWNED_ACCESS_STATES.includes(
        "PAID_PENDING_RENEWAL_ASSESSMENT"
      )
  );

  const earlier = {
    _id: new mongoose.Types.ObjectId(),
    arenaRank: "에메랄드",
    arenaGp: 88,
    reachedCurrentGpAt: new Date(
      "2026-08-01T00:00:00.000Z"
    ),
  };
  const later = {
    _id: new mongoose.Types.ObjectId(),
    arenaRank: "에메랄드",
    arenaGp: 88,
    reachedCurrentGpAt: new Date(
      "2026-08-02T00:00:00.000Z"
    ),
  };
  assert.ok(
    compareStandingForLayout(
      earlier,
      later
    ) < 0
  );

  const placementTieBase = {
    arenaRank: "에메랄드",
    arenaGp: 88,
    sourcePlacementAttemptId:
      new mongoose.Types.ObjectId(),
    seededAt: new Date(
      "2026-08-02T00:00:00.000Z"
    ),
    reachedCurrentGpAt: new Date(
      "2026-08-02T00:00:00.000Z"
    ),
  };
  const higherPlacementScore = {
    ...placementTieBase,
    _id: new mongoose.Types.ObjectId(),
    seedPlacementScore: 90,
    seedPlacementElapsedTimeMs: 600000,
    seedPlacementMmr: 1000,
    seedPlacementStartedAt: new Date(
      "2026-08-02T02:00:00.000Z"
    ),
  };
  const fasterLowerScore = {
    ...placementTieBase,
    _id: new mongoose.Types.ObjectId(),
    sourcePlacementAttemptId:
      new mongoose.Types.ObjectId(),
    seedPlacementScore: 89,
    seedPlacementElapsedTimeMs: 300000,
    seedPlacementMmr: 1100,
    seedPlacementStartedAt: new Date(
      "2026-08-02T01:00:00.000Z"
    ),
  };
  assert.ok(
    compareStandingForLayout(
      higherPlacementScore,
      fasterLowerScore
    ) < 0
  );
  assert.ok(
    compareStandingForLayout(
      { ...higherPlacementScore, seedPlacementScore: 89 },
      fasterLowerScore
    ) > 0
  );
  assert.ok(
    compareStandingForLayout(
      {
        ...higherPlacementScore,
        seedPlacementScore: 89,
        seedPlacementElapsedTimeMs: 300000,
        seedPlacementMmr: 1200,
      },
      fasterLowerScore
    ) < 0
  );

  const mixedLayout =
    computeArenaCohortLayout([
      {
        ...later,
        userId:
          new mongoose.Types.ObjectId(),
      },
      {
        ...earlier,
        userId:
          new mongoose.Types.ObjectId(),
      },
      {
        _id: new mongoose.Types.ObjectId(),
        userId:
          new mongoose.Types.ObjectId(),
        arenaRank: "실버",
        arenaGp: 70,
        reachedCurrentGpAt: new Date(
          "2026-08-03T00:00:00.000Z"
        ),
      },
    ]);
  assert.equal(
    String(mixedLayout[0]._id),
    String(earlier._id)
  );
  assert.deepEqual(
    mixedLayout.map((entry) => [
      entry.arenaRank,
      entry.arenaPosition,
    ]),
    [
      ["에메랄드", 1],
      ["에메랄드", 2],
      ["실버", 1],
    ]
  );

  const temporaryBases =
    temporaryPositionBaseByTier(
      [
        {
          arenaRank: "다이아몬드",
          arenaPosition: 8,
        },
        {
          arenaRank: "마스터",
          arenaPosition: 6,
        },
      ],
      [
        {
          arenaRank: "다이아몬드",
          arenaPosition: 14,
        },
        {
          arenaRank: "마스터",
          arenaPosition: 2,
        },
      ]
    );
  assert.equal(
    temporaryBases.get("다이아몬드"),
    14,
    "티어 이동 재정렬의 임시 순위는 최종 최대 순위 뒤에서 시작해야 합니다."
  );

  const smallLayout =
    computeArenaCohortLayout(
      syntheticStandings(99)
    );
  assert.ok(
    smallLayout.every(
      (entry) =>
        entry.arenaRank === "마스터"
    )
  );
  assert.equal(
    smallLayout[98].arenaPosition,
    99
  );

  const mediumLayout =
    computeArenaCohortLayout(
      syntheticStandings(100)
    );
  assert.deepEqual(
    mediumLayout.slice(0, 6).map(
      (entry) => entry.arenaRank
    ),
    [
      "챌린저",
      "그랜드마스터",
      "그랜드마스터",
      "마스터",
      "마스터",
      "다이아몬드",
    ]
  );
  assert.equal(
    mediumLayout[1].arenaPosition,
    1
  );
  assert.equal(
    mediumLayout[2].arenaPosition,
    2
  );

  assert.equal(
    resolveArenaTier({
      rank: "챌린저",
      gp: 99,
      activeRankerCount: 300,
      topPercentile: 0.006,
    }).label,
    "그랜드마스터"
  );
  assert.equal(
    resolveArenaTier({
      rank: "챌린저",
      gp: 99,
      activeRankerCount: 300,
      topPercentile: 0.051,
    }).label,
    "다이아몬드"
  );

  const userId = new mongoose.Types.ObjectId();
  const attemptId =
    new mongoose.Types.ObjectId();
  const standingDocument = new ArenaStanding({
    userId,
    division: "SUB",
    seasonKey: "2026",
    sourcePlacementAttemptId: attemptId,
    seedPolicyVersion:
      INITIAL_ARENA_SEED_POLICY_VERSION,
    seedPlacementScore: 84.5,
    seededAt: new Date(),
    arenaRank: "다이아몬드",
    arenaPosition: 1,
    arenaGp: 34,
    status: "LOCKED",
  });
  await assert.doesNotReject(() =>
    standingDocument.validate()
  );
  const accessStateDocument =
    new ArenaAccessState({
      userId,
      currentCompetitiveDivision: "SUB",
      standingId: standingDocument._id,
      state: "PAYMENT_REQUIRED",
      currentSeasonPlacementCompleted:
        true,
    });
  await assert.doesNotReject(() =>
    accessStateDocument.validate()
  );
  await assert.doesNotReject(() =>
    new ArenaCohortRevision({
      seasonKey: "2026",
      division: "SUB",
      revision: 1,
    }).validate()
  );
  await assert.doesNotReject(() =>
    new ArenaOutboxEvent({
      eventType:
        "ArenaPlacementCompleted",
      aggregateType: "ArenaStanding",
      aggregateId: standingDocument._id,
      idempotencyKey:
        `${attemptId}:ArenaPlacementCompleted`,
    }).validate()
  );
  await assert.doesNotReject(() =>
    new AssessmentAttempt({
      userId,
      paperId: `season-placement-${attemptId}`,
      scopeType: "placement",
      placementPurpose: "SEASON",
      placementContextKey: "SEASON:2027:MAIN",
      courseId: "placement",
      title: "시즌 배치고사",
      totalPoints: 100,
    }).validate()
  );

  const standingSource = fs.readFileSync(
    path.join(
      root,
      "services/arenaStandingService.js"
    ),
    "utf8"
  );
  const placementSource = fs.readFileSync(
    path.join(
      root,
      "services/placementExamService.js"
    ),
    "utf8"
  );
  const accessCycleSource = fs.readFileSync(
    path.join(
      root,
      "services/accessCycleService.js"
    ),
    "utf8"
  );
  assert.equal(
    /mmrService/.test(standingSource),
    false,
    "Arena 순위 서비스는 Skill MMR 서비스를 참조하면 안 됩니다."
  );
  assert.ok(
    standingSource.includes(
      "ArenaCohortRevision"
    ) &&
      standingSource.includes(
        "ArenaPlacementCompleted"
      ) &&
      standingSource.includes(
        "withTransaction"
      ) &&
      standingSource.includes(
        "ACCESS_LIFECYCLE_STATE_OWNS_REENTRY"
      ) &&
      standingSource.includes(
        "HISTORICAL_PLACEMENT_CANNOT_OPEN_CURRENT_SEASON"
      )
  );
  assert.ok(
    (
      placementSource.match(
        /syncInitialArenaPlacement\(/g
      ) || []
    ).length >= 3
  );
  assert.ok(
    placementSource.includes('purpose: "SEASON"') &&
      placementSource.includes('purpose: "RENEWAL_RANK_ASSESSMENT"') &&
      placementSource.includes("placementContextKey") &&
      placementSource.includes("shouldUpdateSkillMmr")
  );
  assert.ok(
    standingSource.includes('placementDivision === "MAIN"') &&
      standingSource.includes("ANNUAL_MAIN_SEASON_PLACEMENT")
  );
  assert.ok(
    accessCycleSource.includes(
      "activateStandingForPaidPlacement"
    ) &&
      accessCycleSource.includes(
        "placementStanding"
      ) &&
      accessCycleSource.includes(
        "kstSeasonKey"
      ) &&
      accessCycleSource.includes(
        '"SEASON_PLACEMENT_REQUIRED"'
      )
  );

  console.log(
    "Initial Arena placement verification passed."
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
