const assert = require("node:assert/strict");
const path = require("node:path");
const dotenv = require("dotenv");
const ejs = require("ejs");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const {
  getActiveMainDivisionPolicy,
  invalidateMainDivisionPolicyCache,
  mainPolicySnapshot,
} = require("../services/arenaPolicyService");
const {
  getArenaRulebook,
} = require("../services/arenaRulebookViewService");

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  try {
    invalidateMainDivisionPolicyCache();
    const now = new Date();
    const activePolicy = await getActiveMainDivisionPolicy(now);
    if (!activePolicy) {
      const rulebook = getArenaRulebook("MAIN", { mainPolicy: null });
      const html = await ejs.renderFile(
        path.resolve(__dirname, "../views/goat-arena-rules.ejs"),
        {
          rulebook,
          activeArenaPage: "rules",
          arenaUser: { nickname: "Atlas 검증" },
        }
      );
      assert.equal(rulebook.mainPolicy, null);
      assert.ok(html.includes("Main Division 신규 경기가 잠시 중단되었습니다."));
      assert.ok(html.includes("현재 적용 중인 Main Division 운영 정책이 없습니다."));
      console.log(
        JSON.stringify({
          ok: true,
          activePolicy: false,
          failClosedRulebookRendered: true,
          databaseMutation: false,
        })
      );
      return;
    }
    const snapshot = mainPolicySnapshot(activePolicy);
    const rulebook = getArenaRulebook("MAIN", { mainPolicy: activePolicy });
    assert.equal(
      rulebook.mainPolicy.maximumTargetTierGap,
      snapshot.maximumTargetTierGap
    );
    assert.deepEqual(
      rulebook.mainPolicy.stakeDaysByTierGap,
      snapshot.stakeDaysByTierGap
        .map((band) => ({
          tierGap: Number(band.tierGap),
          stakeDays: Number(band.stakeDays),
        }))
        .sort((left, right) => left.tierGap - right.tierGap)
    );
    assert.equal(
      rulebook.mainPolicy.effectiveFrom.toISOString(),
      new Date(snapshot.effectiveFrom).toISOString()
    );

    const html = await ejs.renderFile(
      path.resolve(__dirname, "../views/goat-arena-rules.ejs"),
      {
        rulebook,
        activeArenaPage: "rules",
        arenaUser: { nickname: "Atlas 검증" },
      }
    );
    assert.ok(html.includes("Main 경기 예치 기준"));
    assert.ok(html.includes(`최대 티어 차이는 ${snapshot.maximumTargetTierGap}단계`));
    for (const band of snapshot.stakeDaysByTierGap) {
      assert.ok(html.includes(`${Number(band.tierGap)}단계 차이`));
      assert.ok(html.includes(`최소 ${Number(band.stakeDays)}일 예치`));
    }
    assert.ok(!html.includes(String(snapshot.code)));
    console.log(
      JSON.stringify({
        ok: true,
        displayName: rulebook.mainPolicy.displayName,
        maximumTargetTierGap: rulebook.mainPolicy.maximumTargetTierGap,
        stakeDaysByTierGap: rulebook.mainPolicy.stakeDaysByTierGap,
        effectiveFrom: rulebook.mainPolicy.effectiveFrom.toISOString(),
        internalPolicyVersionBound: Boolean(rulebook.mainPolicy.policyVersionCode),
        internalCodeHiddenFromUserHtml: true,
      })
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
