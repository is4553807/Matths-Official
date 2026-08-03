const mongoose = require("mongoose");
const { AdminActionLog, User } = require("../models/matthsModel");
const { AccessCycle, ArenaAccessState, ArenaStanding } = require("../models/goatArenaModel");

const TEST_CLOCK_SET_ACTION = "test-control.clock-set";
const TEST_CLOCK_RESET_ACTION = "test-control.clock-reset";
const MAX_OFFSET_DAYS = 365;

function isTestControlEnabled() {
  return process.env.NODE_ENV !== "production";
}

async function latestClockAction() {
  return AdminActionLog.findOne({
    action: { $in: [TEST_CLOCK_SET_ACTION, TEST_CLOCK_RESET_ACTION] },
  })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
}

async function currentTestClock(realNow = new Date()) {
  const latest = await latestClockAction();
  const offsetDays = latest?.action === TEST_CLOCK_SET_ACTION
    ? Math.max(0, Math.min(MAX_OFFSET_DAYS, Number(latest.metadata?.offsetDays) || 0))
    : 0;
  return {
    enabled: isTestControlEnabled(),
    offsetDays,
    realNow: new Date(realNow),
    virtualNow: new Date(new Date(realNow).getTime() + offsetDays * 86_400_000),
    updatedAt: latest?.createdAt || null,
    updatedBy: latest?.adminUserId || null,
  };
}

async function setTestClock({ adminUserId, offsetDays, realNow = new Date() }) {
  if (!isTestControlEnabled()) {
    const error = new Error("운영 환경에서는 테스트 시간 리모콘을 사용할 수 없습니다.");
    error.status = 403;
    throw error;
  }
  if (!mongoose.isValidObjectId(adminUserId)) {
    const error = new Error("관리자 정보를 확인해주세요.");
    error.status = 400;
    throw error;
  }
  const normalized = Math.max(0, Math.min(MAX_OFFSET_DAYS, Math.trunc(Number(offsetDays) || 0)));
  const virtualNow = new Date(new Date(realNow).getTime() + normalized * 86_400_000);
  await AdminActionLog.create({
    adminUserId,
    action: normalized ? TEST_CLOCK_SET_ACTION : TEST_CLOCK_RESET_ACTION,
    detail: normalized
      ? `테스트 전용 가상 시간을 실제 시간보다 ${normalized}일 뒤로 설정`
      : "테스트 전용 가상 시간을 실제 시간으로 초기화",
    metadata: {
      offsetDays: normalized,
      realNow: new Date(realNow),
      virtualNow,
      scope: "TAGGED_TEST_ACCOUNTS_ONLY",
    },
  });
  return currentTestClock(realNow);
}

async function getAdminTestControlData(realNow = new Date()) {
  const clock = await currentTestClock(realNow);
  const testUsers = await User.find({ isTestAccount: true, testBatchKey: { $ne: "" } })
    .select("_id testBatchKey")
    .lean();
  const userIds = testUsers.map((user) => user._id);
  const [cycles, states, standings] = userIds.length
    ? await Promise.all([
        AccessCycle.find({ userId: { $in: userIds }, status: "ACTIVE" }).lean(),
        ArenaAccessState.find({ userId: { $in: userIds } }).lean(),
        ArenaStanding.find({ userId: { $in: userIds }, status: "ACTIVE" }).lean(),
      ])
    : [[], [], []];
  const virtualTime = clock.virtualNow.getTime();
  return {
    clock,
    counts: {
      users: testUsers.length,
      sub: states.filter((state) => state.currentCompetitiveDivision === "SUB").length,
      main: states.filter((state) => state.currentCompetitiveDivision === "MAIN").length,
      activeCycles: cycles.length,
      activeStandings: standings.length,
      cyclesExpiredAtVirtualTime: cycles.filter(
        (cycle) => new Date(cycle.expiresAt).getTime() <= virtualTime
      ).length,
    },
    recentActions: await AdminActionLog.find({
      action: { $in: [TEST_CLOCK_SET_ACTION, TEST_CLOCK_RESET_ACTION] },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  };
}

module.exports = {
  MAX_OFFSET_DAYS,
  currentTestClock,
  getAdminTestControlData,
  isTestControlEnabled,
  setTestClock,
};
