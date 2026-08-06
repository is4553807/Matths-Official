const assert = require("node:assert/strict");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "config.env" });

const {
  AssessmentAttempt,
  RankingProfile,
  User,
} = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaStanding,
} = require("../models/goatArenaModel");
const {
  getSubChallengeData,
  listSubDefenseCandidates,
} = require("../services/arenaMatchService");

const TEST_BATCH_KEY = "GOAT-ARENA-E2E-200-20260803";
const EXPECTED_TIER_COUNTS = {
  브론즈: 20,
  실버: 18,
  골드: 15,
  플래티넘: 13,
  에메랄드: 10,
  다이아몬드: 8,
  마스터: 6,
  그랜드마스터: 5,
  챌린저: 5,
};

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
  });
  try {
    const testUsers = await User.find({
      isTestAccount: true,
      testBatchKey: TEST_BATCH_KEY,
    })
      .select("_id name email role isTestAccount")
      .lean();
    const userIds = testUsers.map((user) => user._id);
    assert.equal(testUsers.length, 200, "테스트 계정은 200명이어야 합니다.");
    assert.equal(new Set(testUsers.map((user) => user.name)).size, 200);
    assert.equal(new Set(testUsers.map((user) => user.email)).size, 200);
    assert.ok(
      testUsers.every(
        (user) =>
          user.role === "student" &&
          user.isTestAccount === true
      ),
      "테스트 계정은 실제 학생 권한 경로를 사용하고 isTestAccount로 격리해야 합니다."
    );

    const [cycles, states, standings, profiles, placements, target] = await Promise.all([
      AccessCycle.find({ userId: { $in: userIds }, status: "ACTIVE" }).lean(),
      ArenaAccessState.find({ userId: { $in: userIds } }).lean(),
      ArenaStanding.find({ userId: { $in: userIds }, status: "ACTIVE" }).lean(),
      RankingProfile.find({ userId: { $in: userIds } }).lean(),
      AssessmentAttempt.find({
        userId: { $in: userIds },
        scopeType: "placement",
        status: "submitted",
      }).lean(),
      User.findOne({ nameNormalized: "REMOVED_FROM_HISTORY" })
        .select("_id name +arenaTestMatchEnabled")
        .lean(),
    ]);
    assert.equal(cycles.length, 200);
    assert.equal(states.length, 200);
    assert.equal(standings.length, 200);
    assert.equal(profiles.length, 200);
    assert.equal(placements.length, 200);
    assert.equal(cycles.filter((cycle) => cycle.division === "SUB").length, 100);
    assert.equal(cycles.filter((cycle) => cycle.division === "MAIN").length, 100);
    assert.ok(cycles.every((cycle) => Number(cycle.availableLearningDays || 0) > 0));
    assert.ok(states.every((state) => state.state === "PAID_ACTIVE"));
    assert.ok(states.every((state) => state.currentSeasonPlacementCompleted === true));
    assert.ok(
      states.every(
        (state) =>
          state.defensePoolEligible === true ||
          state.integrityStatus === "RESTRICTED" ||
          Number(state.automaticDefenseNoShowCount || 0) >= 5 ||
          Boolean(state.automaticDefenseSuspendedAt)
      ),
      "자동 방어 후보 제외 상태에는 현행 규칙상 사유가 있어야 합니다."
    );
    assert.ok(placements.every((attempt) => attempt.placementResult?.rankingStatus === "confirmed"));
    assert.ok(placements.every((attempt) => Number(attempt.placementResult?.initialMmr || 0) > 0));

    for (const division of ["SUB", "MAIN"]) {
      const divisionStandings = standings.filter(
        (standing) => standing.division === division
      );
      assert.equal(divisionStandings.length, 100);
      assert.ok(
        divisionStandings.every((standing) =>
          Object.prototype.hasOwnProperty.call(
            EXPECTED_TIER_COUNTS,
            standing.arenaRank
          )
        )
      );
      for (const tier of Object.keys(EXPECTED_TIER_COUNTS)) {
        const positions = divisionStandings
          .filter((standing) => standing.arenaRank === tier)
          .map((standing) => Number(standing.arenaPosition));
        assert.equal(
          new Set(positions).size,
          positions.length,
          `${division} ${tier} 티어 내부 순위가 중복되었습니다.`
        );
      }
    }

    assert.ok(target, "REMOVED_FROM_HISTORY 계정을 찾을 수 없습니다.");
    assert.equal(
      target.arenaTestMatchEnabled,
      true,
      "REMOVED_FROM_HISTORY의 테스트 계정 매칭 권한이 꺼져 있습니다. arena-test:prepare-sangyoon을 실행해주세요."
    );
    const [targetCycle, targetState, targetActiveStandings, targetProfiles, targetPlacements] =
      await Promise.all([
        AccessCycle.findOne({ userId: target._id, status: "ACTIVE" }).lean(),
        ArenaAccessState.findOne({ userId: target._id }).lean(),
        ArenaStanding.countDocuments({
          userId: target._id,
          status: { $in: ["ACTIVE", "LOCKED"] },
        }),
        RankingProfile.countDocuments({ userId: target._id }),
        AssessmentAttempt.countDocuments({ userId: target._id, scopeType: "placement" }),
      ]);
    assert.equal(targetCycle?.division, "SUB");
    const targetPlacementCompleted = targetPlacements > 0;
    if (targetPlacementCompleted) {
      assert.equal(targetState?.state, "PAID_ACTIVE");
      assert.equal(targetState?.currentSeasonPlacementCompleted, true);
      assert.equal(targetState?.defensePoolEligible, true);
      assert.ok(targetState?.standingId);
      assert.equal(targetActiveStandings, 1);
      assert.equal(targetProfiles, 1);
    } else {
      assert.equal(targetState?.state, "SEASON_PLACEMENT_REQUIRED");
      assert.equal(targetState?.standingId ?? null, null);
      assert.equal(targetState?.currentSeasonPlacementCompleted, false);
      assert.equal(targetActiveStandings, 0);
      assert.equal(targetProfiles, 0);
    }

    const candidateCountsByTier = {};
    for (const challengerTier of Object.keys(EXPECTED_TIER_COUNTS)) {
      const candidateResult = await listSubDefenseCandidates({
        challengerUserId: target._id,
        challengerArenaRank: challengerTier,
        limit: 100,
      });
      candidateCountsByTier[challengerTier] = candidateResult.candidates.length;
      assert.ok(
        candidateResult.candidates.length > 0,
        `${challengerTier} 배치 후 선택 가능한 테스트 방어 후보가 없습니다.`
      );
    }

    const sampleTestUser = testUsers.find(
      (user) => user.name === "test50"
    );
    assert.ok(sampleTestUser, "test50 계정을 찾을 수 없습니다.");
    const sampleChallengeData = await getSubChallengeData({
      userId: sampleTestUser._id,
    });
    assert.equal(sampleChallengeData.canRequest, true);
    assert.equal(sampleChallengeData.hasEligibleOpponent, true);
    assert.ok(
      sampleChallengeData.targetTiers.some(
        (tier) => Number(tier.candidateCount || 0) > 0
      ),
      "한국어 티어명을 사용하는 테스트 계정의 자동 매치 후보가 화면 데이터에 반영되지 않았습니다."
    );

    console.log(
      JSON.stringify({
        ok: true,
        database: mongoose.connection.name,
        testAccounts: testUsers.length,
        testPlacementAttempts: placements.length,
        subDefenseCandidates: states.filter(
          (state) =>
            state.currentCompetitiveDivision === "SUB" && state.defensePoolEligible === true
        ).length,
        mainDefenseCandidates: states.filter(
          (state) =>
            state.currentCompetitiveDivision === "MAIN" && state.defensePoolEligible === true
        ).length,
        target: {
          username: target.name,
          package: "29일 학습권 패키지",
          remainingLearningDays: Number(targetCycle?.availableLearningDays || 0),
          state: targetState?.state,
          activeTierOrGpRecords: targetActiveStandings,
          placementAttempts: targetPlacements,
          placementCompleted: targetPlacementCompleted,
          testMatchingEnabled: target.arenaTestMatchEnabled,
          candidateCountsByTier,
          sampleTestAccountCandidateCount:
            sampleChallengeData.targetTiers.reduce(
              (sum, tier) => sum + Number(tier.candidateCount || 0),
              0
            ),
        },
      })
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState) await mongoose.disconnect();
  process.exitCode = 1;
});
