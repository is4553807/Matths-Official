require("dotenv").config({ path: "config.env" });

const { MongoClient } = require("mongodb");

const APPLY = process.argv.includes("--apply");
const LEGACY_FIELD = "minimumPaidNormalAttacks";
const LEGACY_DISQUALIFIER = "MINIMUM_PAID_ATTACKS_NOT_MET";
const RETIRED_MAIN_POLICY_FIELDS = [
  "unlimitedDailyAttacks",
  "unlimitedDailyDefenses",
  "dailyMatchLimitsByTier",
  "maximumNetGainPerCycle",
  "invitationRequestExpiresAt",
  "requiresServerRandomOpponent",
  "requiresOpponentDaysGreaterThanStake",
  "maximumUnresolvedOfficialMatches",
  "scoringPolicyVersion",
];

async function counts(db) {
  return {
    subscriptionPolicies: await db
      .collection("subscriptionpolicyversions")
      .countDocuments({ [`payback.${LEGACY_FIELD}`]: { $exists: true } }),
    cycleSnapshots: await db
      .collection("accesscycles")
      .countDocuments({
        [`policySnapshot.payback.${LEGACY_FIELD}`]: { $exists: true },
      }),
    cycleDisqualifiers: await db
      .collection("accesscycles")
      .countDocuments({ paybackDisqualifiers: LEGACY_DISQUALIFIER }),
    reviewInputs: await db
      .collection("arenapaybackreviews")
      .countDocuments({ [`evaluatedInputs.${LEGACY_FIELD}`]: { $exists: true } }),
    reviewDisqualifiers: await db
      .collection("arenapaybackreviews")
      .countDocuments({ disqualifiers: LEGACY_DISQUALIFIER }),
    legacyArenaPolicyDocuments: await db
      .collection("arenapolicyversions")
      .countDocuments({}),
    mainPoliciesWithRetiredLimits: await db
      .collection("maindivisionpolicyversions")
      .countDocuments({
        $or: RETIRED_MAIN_POLICY_FIELDS.map((field) => ({
          [field]: { $exists: true },
        })),
      }),
  };
}

async function migrate() {
  if (!process.env.DB) {
    throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  }

  const client = new MongoClient(process.env.DB);
  await client.connect();
  try {
    const db = client.db();
    const before = await counts(db);
    console.log(`정리 전: ${JSON.stringify(before)}`);

    if (!APPLY) {
      console.log("미리보기만 실행했습니다. 실제 반영은 --apply를 붙여 실행하세요.");
      return;
    }

    await db.collection("subscriptionpolicyversions").updateMany(
      { [`payback.${LEGACY_FIELD}`]: { $exists: true } },
      { $unset: { [`payback.${LEGACY_FIELD}`]: "" } }
    );
    await db.collection("accesscycles").updateMany(
      { [`policySnapshot.payback.${LEGACY_FIELD}`]: { $exists: true } },
      { $unset: { [`policySnapshot.payback.${LEGACY_FIELD}`]: "" } }
    );
    await db.collection("accesscycles").updateMany(
      { paybackDisqualifiers: LEGACY_DISQUALIFIER },
      { $pull: { paybackDisqualifiers: LEGACY_DISQUALIFIER } }
    );
    await db.collection("arenapaybackreviews").updateMany(
      { [`evaluatedInputs.${LEGACY_FIELD}`]: { $exists: true } },
      { $unset: { [`evaluatedInputs.${LEGACY_FIELD}`]: "" } }
    );
    await db.collection("arenapaybackreviews").updateMany(
      { disqualifiers: LEGACY_DISQUALIFIER },
      { $pull: { disqualifiers: LEGACY_DISQUALIFIER } }
    );
    await db.collection("maindivisionpolicyversions").updateMany(
      {
        $or: RETIRED_MAIN_POLICY_FIELDS.map((field) => ({
          [field]: { $exists: true },
        })),
      },
      {
        $unset: Object.fromEntries(
          RETIRED_MAIN_POLICY_FIELDS.map((field) => [field, ""])
        ),
      }
    );

    const collectionNames = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map(
        ({ name }) => name
      )
    );
    if (
      collectionNames.has("arenapolicyversions") &&
      before.legacyArenaPolicyDocuments === 0
    ) {
      await db.collection("arenapolicyversions").drop();
    }

    const after = await counts(db);
    console.log(`정리 후: ${JSON.stringify(after)}`);
    if (Object.values(after).some((value) => value !== 0)) {
      throw new Error("구형 정책 데이터가 일부 남아 있습니다.");
    }
    console.log("구형 최소 공격 조건, Ranked 사문화 상한, 빈 레거시 정책 컬렉션 정리를 완료했습니다.");
  } finally {
    await client.close();
  }
}

migrate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
