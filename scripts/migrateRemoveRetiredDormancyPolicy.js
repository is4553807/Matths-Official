require("dotenv").config({ path: "config.env" });

const { MongoClient } = require("mongodb");

const APPLY = process.argv.includes("--apply");
const ACCESS_STATE_FIELDS = [
  "dormancyReturnRequiredAt",
  "dormancySourceLastLoginAt",
  "lastMainQualifyingActivityAt",
  "mainInactivityStartedAt",
  "mainInactivityStartAvailableDays",
  "mainDormancyStartedAt",
  "mainDormancyFrozenLearningDays",
  "mainDormancyFrozenArenaRank",
  "mainDormancyFrozenArenaGp",
  "mainDormancyFrozenArenaPosition",
  "mainDormancyAssessmentAttemptId",
  "mainDormancyAssessmentCompletedAt",
  "mainDormancyRecoveryMode",
];

async function stateFieldCount(db) {
  return db.collection("arenaaccessstates").countDocuments({
    $or: ACCESS_STATE_FIELDS.map((field) => ({
      [field]: { $exists: true },
    })),
  });
}

async function dropIndexIfPresent(collection, name) {
  const indexes = await collection.indexes();
  if (indexes.some((index) => index.name === name)) {
    await collection.dropIndex(name);
  }
}

async function migrate() {
  if (!process.env.DB) {
    throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  }
  const client = new MongoClient(process.env.DB);
  await client.connect();
  try {
    const db = client.db();
    const incompatible = {
      dormantStates: await db
        .collection("arenaaccessstates")
        .countDocuments({ state: "MAIN_DORMANT" }),
      dormancyAssessments: await db
        .collection("assessmentattempts")
        .countDocuments({ placementPurpose: "DORMANCY_RETURN" }),
      dormancyLedgers: await db.collection("arenalearningdayledgers").countDocuments({
        $or: [
          {
            eventType: {
              $in: [
                "MAIN_DORMANCY_RESERVE_HELD",
                "MAIN_DORMANCY_RESERVE_RESTORED",
              ],
            },
          },
          { sourceBucket: "MAIN_DORMANCY_RESTORE" },
        ],
      }),
      dormantFinalProfiles: await db
        .collection("livefinalrankingprofiles")
        .countDocuments({ status: "INACTIVE_DORMANT" }),
    };
    const before = {
      ...incompatible,
      accessStatesWithRetiredFields: await stateFieldCount(db),
      cyclesWithRetiredBucket: await db.collection("accesscycles").countDocuments({
        "learningDayBuckets.sourceType": "MAIN_DORMANCY_RESTORE",
      }),
      cyclesWithPausedConsumptionField: await db.collection("accesscycles").countDocuments({
        dailyConsumptionPausedAt: { $exists: true },
      }),
    };
    console.log(`정리 전: ${JSON.stringify(before)}`);

    if (Object.values(incompatible).some((count) => count > 0)) {
      throw new Error("실제 휴면 상태 또는 원장이 남아 있어 자동 삭제하지 않았습니다.");
    }
    if (!APPLY) {
      console.log("미리보기만 실행했습니다. 실제 반영은 --apply를 붙여 실행하세요.");
      return;
    }

    const unsetStateFields = Object.fromEntries(
      ACCESS_STATE_FIELDS.map((field) => [field, ""])
    );
    await db.collection("arenaaccessstates").updateMany(
      { $or: ACCESS_STATE_FIELDS.map((field) => ({ [field]: { $exists: true } })) },
      { $unset: unsetStateFields }
    );
    await db.collection("accesscycles").updateMany(
      {},
      {
        $pull: {
          learningDayBuckets: { sourceType: "MAIN_DORMANCY_RESTORE" },
        },
        $unset: { dailyConsumptionPausedAt: "" },
      }
    );

    const accessStates = db.collection("arenaaccessstates");
    const accessCycles = db.collection("accesscycles");
    for (const indexName of [
      "lastMainQualifyingActivityAt_1",
      "mainInactivityStartedAt_1",
      "mainDormancyStartedAt_1",
    ]) {
      await dropIndexIfPresent(accessStates, indexName);
    }
    await dropIndexIfPresent(accessCycles, "dailyConsumptionPausedAt_1");

    const after = {
      accessStatesWithRetiredFields: await stateFieldCount(db),
      cyclesWithRetiredBucket: await db.collection("accesscycles").countDocuments({
        "learningDayBuckets.sourceType": "MAIN_DORMANCY_RESTORE",
      }),
      cyclesWithPausedConsumptionField: await db.collection("accesscycles").countDocuments({
        dailyConsumptionPausedAt: { $exists: true },
      }),
    };
    console.log(`정리 후: ${JSON.stringify(after)}`);
    if (Object.values(after).some((count) => count > 0)) {
      throw new Error("폐기된 휴면 정책 데이터가 일부 남아 있습니다.");
    }
    console.log("폐기된 휴면 정책 필드·0잔액 버킷·인덱스 정리를 완료했습니다.");
  } finally {
    await client.close();
  }
}

migrate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
