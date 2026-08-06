require("dotenv").config({ path: "config.env" });

const { MongoClient } = require("mongodb");

const APPLY = process.argv.includes("--apply");
const RETIRED_INDEXES = Object.freeze({
  archivefolders: [
    "isPublished_1_name_1",
    "isPublished_1_parentFolderId_1_name_1",
  ],
  archiveitems: ["accessLevel_1"],
  arenaaccessstates: ["accessStatus_1"],
  arenastandings: [
    "division_1_seasonKey_1_tier_1_arenaGp_-1_reachedCurrentGpAt_1",
    "division_1_seasonKey_1_competitivePool_1_arenaRank_1_arenaGp_-1_reachedCurrentGpAt_1",
    "division_1_seasonKey_1_competitivePool_1_arenaRank_1_arenaPosition_1",
  ],
  communityposts: ["boardType_1_schoolCode_1_status_1_createdAt_-1"],
  maininvitationrequests: ["requestId_1"],
  mainshopeffects: ["userId_1_relatedMatchId_1_itemCode_1"],
  users: [
    "identityMatchHash_1_accountStatus_1",
    "identityMatchHash_1_school.code_1_accountStatus_1",
  ],
});

async function presentRetiredIndexes(db) {
  const collectionNames = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(
      ({ name }) => name
    )
  );
  const present = [];
  for (const [collectionName, indexNames] of Object.entries(RETIRED_INDEXES)) {
    if (!collectionNames.has(collectionName)) continue;
    const actualNames = new Set(
      (await db.collection(collectionName).listIndexes().toArray()).map(
        ({ name }) => name
      )
    );
    for (const indexName of indexNames) {
      if (actualNames.has(indexName)) {
        present.push({ collectionName, indexName });
      }
    }
  }
  return present;
}

async function migrate() {
  if (!process.env.DB) {
    throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  }
  const client = new MongoClient(process.env.DB);
  await client.connect();
  try {
    const db = client.db();
    const before = await presentRetiredIndexes(db);
    console.log(`정리 대상: ${JSON.stringify(before)}`);
    if (!APPLY) {
      console.log("미리보기만 실행했습니다. 실제 반영은 --apply를 붙여 실행하세요.");
      return;
    }
    for (const { collectionName, indexName } of before) {
      await db.collection(collectionName).dropIndex(indexName);
    }
    const after = await presentRetiredIndexes(db);
    console.log(`정리 후 잔여 대상: ${JSON.stringify(after)}`);
    if (after.length) {
      throw new Error("폐기 인덱스가 일부 남아 있습니다.");
    }
    console.log(`${before.length}개의 폐기·중복 인덱스를 제거했습니다.`);
  } finally {
    await client.close();
  }
}

migrate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
