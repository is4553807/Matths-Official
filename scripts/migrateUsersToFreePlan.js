/*
 * 현재 사용자 플랜을 FREE/PRO 스키마로 전환합니다.
 *
 * 기본 실행은 읽기 전용 미리보기입니다. 실제 반영은 쓰기 중단과 백업을
 * 확인한 뒤 아래 두 옵션을 모두 명시해야 합니다.
 *   --apply --confirm=MIGRATE_ALL_NON_ADMIN_USERS_TO_FREE_V1
 *
 * 관리자 문서와 결제·환불 컬렉션은 수정하지 않습니다.
 */
const { createHash } = require("node:crypto");
const path = require("node:path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: path.join(__dirname, "..", "config.env"), quiet: true });
mongoose.set({ autoCreate: false, autoIndex: false });

const { User } = require("../models/matthsModel");
const { freePlanDraft } = require("../services/accountPlanService");

const CONFIRMATION = "MIGRATE_ALL_NON_ADMIN_USERS_TO_FREE_V1";
const FINANCIAL_COLLECTIONS = [
  "arenapackagepayments",
  "refundrequests",
];

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function collectionSummary(db, collectionName) {
  const exists = await db.listCollections({ name: collectionName }, { nameOnly: true }).hasNext();
  if (!exists) return { collectionName, count: 0, digest: digest([]) };
  const rows = await db
    .collection(collectionName)
    .find({}, { projection: { _id: 1, updatedAt: 1, status: 1, approvedAmount: 1, refundedAmount: 1 } })
    .sort({ _id: 1 })
    .toArray();
  return { collectionName, count: rows.length, digest: digest(rows) };
}

async function financialFingerprint(db) {
  const summaries = [];
  for (const collectionName of FINANCIAL_COLLECTIONS) {
    summaries.push(await collectionSummary(db, collectionName));
  }
  return { summaries, digest: digest(summaries) };
}

async function adminFingerprint() {
  const admins = await User.collection
    .find(
      { role: "admin" },
      { projection: { _id: 1, role: 1, accountPlan: 1, updatedAt: 1 } }
    )
    .sort({ _id: 1 })
    .toArray();
  return { count: admins.length, digest: digest(admins) };
}

async function audit() {
  const [totalUsers, administrators, nonAdministrators, freeUsers, proUsers, missingPlan] =
    await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: "admin" }),
      User.countDocuments({ role: { $ne: "admin" } }),
      User.countDocuments({ role: { $ne: "admin" }, "accountPlan.code": "FREE" }),
      User.countDocuments({ role: { $ne: "admin" }, "accountPlan.code": "PRO" }),
      User.countDocuments({ role: { $ne: "admin" }, accountPlan: { $exists: false } }),
    ]);
  return {
    totalUsers,
    administrators,
    nonAdministrators,
    freeUsers,
    proUsers,
    missingPlan,
    usersToReset: Math.max(0, nonAdministrators - freeUsers),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(["--apply", `--confirm=${CONFIRMATION}`]);
  const invalid = args.filter((arg) => !allowed.has(arg));
  if (invalid.length) throw new Error(`지원하지 않는 옵션: ${invalid.join(", ")}`);
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");

  const apply = args.includes("--apply");
  if (apply && !args.includes(`--confirm=${CONFIRMATION}`)) {
    throw new Error(`실제 반영에는 --confirm=${CONFIRMATION} 옵션이 필요합니다.`);
  }
  if (apply && process.env.ACCOUNT_PLAN_MIGRATION_WRITES_QUIESCED !== "1") {
    throw new Error("실제 반영 전 ACCOUNT_PLAN_MIGRATION_WRITES_QUIESCED=1이 필요합니다.");
  }

  await mongoose.connect(process.env.DB, { autoCreate: false, autoIndex: false });
  try {
    const db = mongoose.connection.db;
    const [before, adminBefore, financeBefore] = await Promise.all([
      audit(),
      adminFingerprint(),
      financialFingerprint(db),
    ]);
    console.log(JSON.stringify({ phase: "preflight", apply, users: before, adminBefore, financeBefore }));
    if (!apply) {
      console.log("미리보기만 완료했습니다. 사용자 문서는 변경하지 않았습니다.");
      return;
    }

    const migratedAt = new Date();
    const result = await User.collection.updateMany(
      { role: { $ne: "admin" } },
      {
        $set: {
          accountPlan: freePlanDraft({
            now: migratedAt,
            source: "MIGRATION",
            changeReason: "무료/Pro 단일 플랜 스키마 전환",
          }),
        },
      }
    );

    const [after, adminAfter, financeAfter] = await Promise.all([
      audit(),
      adminFingerprint(),
      financialFingerprint(db),
    ]);
    if (after.freeUsers !== after.nonAdministrators || after.proUsers !== 0 || after.missingPlan !== 0) {
      throw new Error("일부 비관리자 계정이 무료 플랜으로 전환되지 않았습니다.");
    }
    if (adminBefore.digest !== adminAfter.digest) {
      throw new Error("관리자 문서가 변경되어 마이그레이션 검증에 실패했습니다.");
    }
    if (financeBefore.digest !== financeAfter.digest) {
      throw new Error("금융 기록이 변경되어 초기화 검증에 실패했습니다.");
    }
    console.log(JSON.stringify({
      phase: "verified",
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      users: after,
      adminPreserved: true,
      financialRecordsPreserved: true,
    }));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(`계정 플랜 마이그레이션 중단: ${error.message}`);
  process.exitCode = 1;
});
