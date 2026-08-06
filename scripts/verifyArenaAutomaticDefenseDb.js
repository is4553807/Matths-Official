const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const {
  ArenaAccessState,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaOutboxEvent,
} = require("../models/goatArenaModel");
const {
  reactivateAutomaticDefenseAfterAttack,
  recordAutomaticDefenseNoShow,
} = require("../services/arenaAutomaticDefenseService");

dotenv.config({ path: "./config.env" });

async function run() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  const suffix = randomUUID().replace(/-/g, "");
  const challengerId = new mongoose.Types.ObjectId();
  const defenderId = new mongoose.Types.ObjectId();
  const matchId = new mongoose.Types.ObjectId();
  const now = new Date("2026-08-06T12:00:00+09:00");
  try {
    await ArenaAccessState.create({
      userId: defenderId,
      currentCompetitiveDivision: "SUB",
      state: "PAID_ACTIVE",
      currentSeasonPlacementCompleted: true,
      defensePoolEligible: true,
      automaticDefenseNoShowCount: 4,
      integrityStatus: "CLEAR",
    });
    await ArenaMatch.create({
      _id: matchId,
      matchKey: `E2E:AUTO-DEFENSE:${suffix}`,
      division: "SUB",
      seasonKey: "E2E",
      matchType: "NORMAL",
      matchOrigin: "SUB_UPWARD_AUTO_MATCH",
      requestInitiatorUserId: challengerId,
      targetTier: "GOLD",
      tierPairKey: "SILVER_GOLD",
      tierPairLabel: "실버-골드",
      challenger: {
        userId: challengerId,
        standingId: new mongoose.Types.ObjectId(),
        accessCycleId: new mongoose.Types.ObjectId(),
        tupleBefore: { arenaRank: "SILVER", arenaPosition: 2, arenaGp: 50 },
        stakeDays: 1,
      },
      defender: {
        userId: defenderId,
        standingId: new mongoose.Types.ObjectId(),
        accessCycleId: new mongoose.Types.ObjectId(),
        tupleBefore: { arenaRank: "GOLD", arenaPosition: 1, arenaGp: 70 },
        stakeDays: 0,
      },
      status: "SETTLED",
      policyVersionCode: "E2E",
      problemPackVersion: "E2E",
      scoringVersion: "E2E",
      startDeadlineAt: new Date(now.getTime() - 1000),
      settledAt: now,
      winnerRole: "CHALLENGER",
      integrityStatus: "CLEAR",
      resultSnapshot: {
        scoringPolicyVersion: "E2E",
        winnerRole: "CHALLENGER",
        settlementSummary: { automaticReason: "START_DEADLINE_NO_SHOW" },
        resolvedAt: now,
      },
    });
    await ArenaMatchAttempt.create({
      matchId,
      userId: defenderId,
      role: "DEFENDER",
      problemPackId: new mongoose.Types.ObjectId(),
      problemPackVersion: "E2E",
      status: "READY",
      answers: [],
    });

    const first = await recordAutomaticDefenseNoShow({ matchId, now });
    const processedMatch = await ArenaMatch.findById(matchId)
      .select("automaticDefenseNoShowRecordedAt")
      .lean();
    assert.equal(
      first.recorded || Boolean(processedMatch?.automaticDefenseNoShowRecordedAt),
      true,
      "실행 중인 자동 조정 스케줄러와 경합하더라도 방어 미응시 기록은 정확히 한 번 처리되어야 합니다."
    );
    const suspended = await ArenaAccessState.findOne({ userId: defenderId }).lean();
    assert.equal(
      first.recorded ? first.suspended : suspended.automaticDefenseNoShowCount >= 5,
      true
    );
    assert.equal(suspended.automaticDefenseNoShowCount, 5);
    assert.equal(suspended.defensePoolEligible, false);
    assert.ok(suspended.automaticDefenseSuspendedAt);

    const replay = await recordAutomaticDefenseNoShow({ matchId, now });
    assert.equal(replay.recorded, false);
    const unchanged = await ArenaAccessState.findOne({ userId: defenderId }).lean();
    assert.equal(unchanged.automaticDefenseNoShowCount, 5);

    const restored = await reactivateAutomaticDefenseAfterAttack({
      userId: defenderId,
      now: new Date(now.getTime() + 60_000),
    });
    assert.equal(restored.reactivated, true);
    const active = await ArenaAccessState.findOne({ userId: defenderId }).lean();
    assert.equal(active.automaticDefenseNoShowCount, 0);
    assert.equal(active.automaticDefenseSuspendedAt, null);
    assert.equal(active.defensePoolEligible, true);
    console.log(JSON.stringify({ ok: true, database: mongoose.connection.name }));
  } finally {
    await Promise.all([
      ArenaOutboxEvent.deleteMany({
        idempotencyKey: `${matchId}:ArenaAutomaticDefenseSuspended`,
      }),
      ArenaMatchAttempt.deleteMany({ matchId }),
      ArenaMatch.deleteOne({ _id: matchId }),
      ArenaAccessState.deleteOne({ userId: defenderId }),
    ]);
    await mongoose.disconnect();
  }
}

run().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exitCode = 1;
});
