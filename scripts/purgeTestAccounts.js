"use strict";

// Cloudinary reads CLOUDINARY_URL at module initialization, before signing assets.
if (require.main === module) require("dotenv").config({ path: "config.env", quiet: true });

// Preview by default. Explicit marked IDs only; a lossless backup precedes every write.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const { MongoClient, BSON } = require("mongodb");
const { User, ArchiveItem, CommunityPost } = require("../models/matthsModel");
const { ArenaMatch, AccessCycle, ArenaMatchAttempt, ArenaMatchEvidence, MainInvitationRequest, MainShopPurchase } = require("../models/goatArenaModel");
const { ParentAccount, ParentChildLink } = require("../models/parentModel");
const { AcademyStaff } = require("../models/academyModel");
const { WebSession } = require("../models/sessionModel");
const { withdrawUserAccount } = require("../services/accountDeletionService");
const { signedStoredAssetUrl } = require("../services/fileStorageService");

const MODEL_FILES = ["documentSecurityModel", "appCommerceHandoffModel", "mobileAuthGrantModel", "problemTypeModel", "accountReauthenticationGrantModel", "studyHallModel", "appleAuthCredentialModel", "operationModel", "storeModel", "refundModel", "paybackDailyLearningModel", "paybackModel"];
for (const file of MODEL_FILES) require(`../models/${file}`);
const testFilter = () => ({ $or: [{ isTestAccount: true }, { role: "test" }] });
const digest = ids => crypto.createHash("sha256").update(ids.map(String).sort().join("\n")).digest("hex");
const values = ids => ids.flatMap(id => [id, String(id)]);

function references(schema, prefix = "", result = []) {
  schema.eachPath((key, field) => {
    const full = prefix + key;
    const ref = field.options.ref || field.caster?.options.ref || field.$embeddedSchemaType?.options.ref;
    if (typeof ref === "string") result.push({ path: full, ref });
    if (field.schema) references(field.schema, full + ".", result);
  });
  return result;
}

async function preview(db) {
  const users = await db.collection(User.collection.name).find(testFilter()).sort({ _id: 1 }).toArray();
  if (users.some(u => u.role === "admin" || !["student", "test"].includes(u.role))) throw new Error("Marked admin/teacher accounts require a separate reviewed deletion plan.");
  const ids = users.map(u => u._id), idSet = new Set(ids.map(String));
  const matches = await db.collection(ArenaMatch.collection.name).find({ $or: [{ "challenger.userId": { $in: ids } }, { "defender.userId": { $in: ids } }, { requestInitiatorUserId: { $in: ids } }] }).toArray();
  if (matches.some(m => [m.challenger?.userId, m.defender?.userId, m.requestInitiatorUserId].filter(Boolean).some(id => !idSet.has(String(id))))) throw new Error("Mixed real-user matches exist; refusing to remove another user's history.");
  const guards = [[ParentAccount, "childUserId"], [ParentChildLink, "childUserId"], [AcademyStaff, "userId"], [ArchiveItem, "uploadedBy"], [CommunityPost, "authorId"]];
  for (const [model, key] of guards) if (await db.collection(model.collection.name).countDocuments({ [key]: { $in: ids } })) throw new Error(`${model.modelName} has nontrivial relationships; a separately reviewed deletion plan is required.`);
  const invitations = await db.collection(MainInvitationRequest.collection.name).find({ $or: ["initiatorUserId", "selectedCandidateId", "acceptedCandidateId", "candidatePoolSnapshot"].map(key => ({ [key]: { $in: ids } })) }).toArray();
  if (invitations.some(r => [r.initiatorUserId, r.selectedCandidateId, r.acceptedCandidateId, ...(r.candidatePoolSnapshot || [])].filter(Boolean).some(value => !idSet.has(String(value.userId || value))))) throw new Error("Mixed real-user invitations exist; refusing to delete them.");
  const related = new Map([["User", ids], ["ArenaMatch", matches.map(m => m._id)], ["ArenaProblemPack", matches.map(m => m.problemPackId).filter(Boolean)], ["MainInvitationRequest", invitations.map(r => r._id)]]);
  for (const model of [AccessCycle, ArenaMatchAttempt, ArenaMatchEvidence, MainShopPurchase]) {
    const rows = await db.collection(model.collection.name).find({ userId: { $in: ids } }).toArray();
    related.set(model.modelName, rows.map(r => r._id));
  }
  const plan = [];
  for (const model of Object.values(mongoose.models)) {
    const clauses = [];
    if (related.has(model.modelName)) clauses.push({ _id: { $in: related.get(model.modelName) } });
    for (const field of references(model.schema)) if (related.get(field.ref)?.length) clauses.push({ [field.path]: { $in: values(related.get(field.ref)) } });
    if (model === WebSession) clauses.push({ "session.user.id": { $in: ids.map(String) } });
    if (!clauses.length) continue;
    const filter = { $or: clauses };
    const count = await db.collection(model.collection.name).countDocuments(filter);
    if (count) plan.push({ model, filter, count });
  }
  return { users, ids, related, plan, digest: digest(ids) };
}

async function backup(db, state, directory = path.resolve(__dirname, "..", "backups")) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = await fs.mkdtemp(path.join(directory, `test-account-purge-${new Date().toISOString().replace(/[:.]/g, "-")}-`));
  const collections = [];
  let assetCount = 0;
  for (const item of state.plan) {
    const records = await db.collection(item.model.collection.name).find(item.filter).toArray();
    await fs.writeFile(path.join(destination, `${item.model.collection.name}.ejson`), BSON.EJSON.stringify(records, { relaxed: false }), { mode: 0o600, flag: "wx" });
    collections.push({ name: item.model.collection.name, count: records.length });
    if (item.model === ArenaMatchEvidence) for (const record of records) for (const file of record.files || []) {
      const url = await signedStoredAssetUrl(file);
      if (!url) throw new Error("Cannot back up a test evidence asset; no deletion performed.");
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Evidence backup returned HTTP ${response.status}; no deletion performed.`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) throw new Error("Empty evidence backup; no deletion performed.");
      assetCount += 1;
      await fs.writeFile(path.join(destination, `evidence-${record._id}-${assetCount}-${path.basename(file.storedName || "asset")}`), bytes, { mode: 0o600, flag: "wx" });
    }
  }
  await fs.writeFile(path.join(destination, "manifest.json"), JSON.stringify({ createdAt: new Date(), userIds: state.ids.map(String), targetDigest: state.digest, collections, assetCount, warning: "Private credentials included. Keep this backup private; restoration requires operator action." }, null, 2), { mode: 0o600, flag: "wx" });
  return destination;
}

async function applyDeletion(db, state) {
  // Stop new activity before removing the already backed-up test-only records.
  await db.collection(User.collection.name).updateMany({ _id: { $in: state.ids }, ...testFilter() }, { $set: { isActive: false, accountStatus: "inactive", accountStatusReason: "운영자 요청으로 테스트 계정 삭제 중" }, $inc: { tokenVersion: 1 } });
  let deleted = 0;
  for (let offset = 0; offset < state.ids.length; offset += 4) {
    await Promise.all(state.ids.slice(offset, offset + 4).map(async userId => {
      await withdrawUserAccount({ userId, initiatedBy: "admin", retainAnonymousData: false });
      deleted += 1;
    }));
    console.log(JSON.stringify({ deleted, total: state.ids.length }));
  }
  for (const model of Object.values(mongoose.models)) {
    const owned = ["userId", "studentUserId"].filter(key => model.schema.path(key)?.options.ref === "User");
    if (owned.length) await db.collection(model.collection.name).deleteMany({ $or: owned.map(key => ({ [key]: { $in: values(state.ids) } })) });
  }
  await db.collection(WebSession.collection.name).deleteMany({ "session.user.id": { $in: state.ids.map(String) } });
  if (await db.collection(User.collection.name).countDocuments({ _id: { $in: state.ids } })) throw new Error("Some targeted test accounts remain.");
  for (const model of Object.values(mongoose.models)) {
    const owned = ["userId", "studentUserId"].filter(key => model.schema.path(key)?.options.ref === "User");
    if (owned.length && await db.collection(model.collection.name).countDocuments({ $or: owned.map(key => ({ [key]: { $in: values(state.ids) } })) })) throw new Error(`Owned test data remains in ${model.modelName}.`);
  }
  return deleted;
}

async function main() {
  process.env.DISABLE_SCHEDULERS = "1";
  if (!process.env.DB) throw new Error("DB is not configured.");
  const client = new MongoClient(process.env.DB, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect(); const db = client.db(); const state = await preview(db);
    console.log(JSON.stringify({ testUsers: state.users.length, targetDigest: state.digest, collections: state.plan.map(p => ({ name: p.model.collection.name, count: p.count })) }));
    if (!process.argv.includes("--apply")) return;
    if (!process.argv.includes("--confirm=DELETE_MARKED_TEST_ACCOUNTS") || !process.argv.includes(`--expected-count=${state.users.length}`)) throw new Error("Explicit confirmation and the exact reviewed account count are required.");
    if (!state.ids.length) return;
    const protectedIds = await db.collection(User.collection.name).find({ _id: { $nin: state.ids } }, { projection: { _id: 1 } }).toArray();
    const destination = await backup(db, state);
    const fresh = await preview(db);
    const counts = s => JSON.stringify(s.plan.map(p => [p.model.modelName, p.count]));
    if (fresh.digest !== state.digest || counts(fresh) !== counts(state)) throw new Error("Targets or associated data changed after backup; refusing deletion.");
    console.log(JSON.stringify({ backup: destination }));
    await mongoose.connect(process.env.DB, { autoIndex: false, serverSelectionTimeoutMS: 15000 });
    const deleted = await applyDeletion(db, state);
    const protectedUsersRemaining = await db.collection(User.collection.name).countDocuments({ _id: { $in: protectedIds.map(u => u._id) } });
    if (protectedUsersRemaining !== protectedIds.length) throw new Error("A non-target account changed during cleanup; operator review required.");
    console.log(JSON.stringify({ completed: true, deleted, remainingMarkedTestAccounts: await db.collection(User.collection.name).countDocuments(testFilter()), protectedUsersPreserved: protectedUsersRemaining, backup: destination }));
  } finally { await mongoose.disconnect(); await client.close(); }
}
if (require.main === module) main().catch(error => { console.error(error.name + ": " + error.message); process.exitCode = 1; });
module.exports = { applyDeletion, backup, preview, references, testFilter };
