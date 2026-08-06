const mongoose = require("mongoose");
const fs = require("node:fs");
const path = require("node:path");
const { PlatformControl } = require("../models/operationModel");
const {
  assertMatchmakingOpen,
  ensureMatchmakingControl,
  getMatchmakingControl,
  setMatchmakingPaused,
} = require("../services/arenaMatchmakingControlService");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function query(value) {
  return {
    session() { return this; },
    lean() { return Promise.resolve(value ? { ...value } : value); },
  };
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
  for (const relativePath of [
    "services/arenaMatchService.js",
    "services/mainArenaMatchService.js",
    "services/arenaRevengeService.js",
    "services/mainArenaRevengeService.js",
  ]) {
    assert(
      read(relativePath).includes("assertMatchmakingOpen"),
      `${relativePath}가 전체 매치메이킹 제어를 확인하지 않습니다.`
    );
  }
  const mainMatchSource = read("services/mainArenaMatchService.js");
  assert(
    (mainMatchSource.match(/assertMatchmakingOpen\(\{ session, claim: true, now \}\)/g) || []).length >= 3,
    "Ranked 경기·초대 생성·초대 후보 갱신의 원자적 정지 검사가 누락되었습니다."
  );
  assert(
    read("routes/matths-routes.js").includes('"/admin/arena-policies/matchmaking"'),
    "관리자 매치메이킹 제어 라우트가 없습니다."
  );

  const originalFindOne = PlatformControl.findOne;
  const originalFindOneAndUpdate = PlatformControl.findOneAndUpdate;
  let state = null;
  PlatformControl.findOne = () => query(state);
  PlatformControl.findOneAndUpdate = (filter, update, options = {}) => {
    if (filter.isPaused === false && state?.isPaused !== false) return query(null);
    if (!state && !options.upsert) return query(null);
    if (!state) state = { ...(update.$setOnInsert || {}) };
    if (update.$set) state = { ...state, ...update.$set };
    for (const [key, amount] of Object.entries(update.$inc || {})) {
      state[key] = Number(state[key] || 0) + Number(amount || 0);
    }
    return query(state);
  };

  try {
    const initial = await ensureMatchmakingControl();
    assert(initial.isPaused === false, "최초 상태는 운영 중이어야 합니다.");
    const adminUserId = new mongoose.Types.ObjectId();
    await setMatchmakingPaused({
      adminUserId,
      paused: true,
      reason: "문제 데이터 점검",
      now: new Date("2026-08-07T04:00:00.000Z"),
    });
    const paused = await getMatchmakingControl();
    assert(paused.isPaused === true, "일시정지 상태가 저장되지 않았습니다.");
    assert(paused.reason === "문제 데이터 점검", "정지 사유가 저장되지 않았습니다.");
    for (const claim of [false, true]) {
      let blocked = false;
      try {
        await assertMatchmakingOpen({ claim });
      } catch (error) {
        blocked = error.status === 423 && error.code === "ARENA_MATCHMAKING_GLOBALLY_PAUSED";
      }
      assert(blocked, `신규 매치 ${claim ? "원자적 생성" : "사전 검사"}가 차단되지 않았습니다.`);
    }
    await setMatchmakingPaused({
      adminUserId,
      paused: false,
      now: new Date("2026-08-07T04:05:00.000Z"),
    });
    const reopened = await assertMatchmakingOpen({ claim: true });
    assert(reopened.isPaused === false, "재개 뒤 신규 매치 허용이 복구되지 않았습니다.");
    assert(reopened.admissionSequence === 1, "재개 뒤 원자적 입장 순번이 기록되지 않았습니다.");
    console.log("Arena 전체 매치메이킹 일시정지·재개 검증 완료");
  } finally {
    PlatformControl.findOne = originalFindOne;
    PlatformControl.findOneAndUpdate = originalFindOneAndUpdate;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
