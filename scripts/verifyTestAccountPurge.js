"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server-core");
const { preview, backup, applyDeletion } = require("./purgeTestAccounts");
const { User, UserNotification, RankingProfile } = require("../models/matthsModel");
const { ArenaMatch } = require("../models/goatArenaModel");
const { AcademyStudentMembership, AcademyAttendance, AcademyAssignmentSubmission } = require("../models/academyModel");
const { WebSession } = require("../models/sessionModel");
process.env.NODE_ENV = "test";
process.env.DISABLE_SCHEDULERS = "1";
let memory, directory;
async function main() {
  memory = await MongoMemoryServer.create();
  await mongoose.connect(memory.getUri(), { dbName: "test_account_purge_verify" });
  const db = mongoose.connection.db;
  const marked = await User.create({ name: "가상 학생", email: "virtual@qa.invalid", passwordHash: "unused", role: "student", isTestAccount: true, testBatchKey: "ISOLATED-TEST" });
  const testRole = await User.create({ name: "테스트 역할", email: "role@qa.invalid", passwordHash: "unused", role: "test" });
  const real = await User.create({ name: "일반 학생", email: "contains-test@qa.invalid", passwordHash: "unused", role: "student" });
  const admin = await User.create({ name: "일반 운영자", email: "admin@qa.invalid", passwordHash: "unused", role: "admin" });
  for (const user of [marked, testRole, real]) {
    await UserNotification.create({ userId: user._id, title: "삭제 경계 검증", message: "검증용 알림" });
    await RankingProfile.create({ userId: user._id });
    for (const model of [AcademyStudentMembership, AcademyAttendance, AcademyAssignmentSubmission]) await db.collection(model.collection.name).insertOne({ studentUserId: user._id, academyId: new mongoose.Types.ObjectId() });
    await db.collection(WebSession.collection.name).insertOne({ sid: String(user._id), session: { user: { id: String(user._id) } }, expiresAt: new Date(Date.now() + 600000) });
  }
  await User.updateOne({ _id: admin._id }, { $set: { isTestAccount: true } });
  await assert.rejects(preview(db), /Marked admin/);
  await User.updateOne({ _id: admin._id }, { $set: { isTestAccount: false } });
  const mixed = await db.collection(ArenaMatch.collection.name).insertOne({ challenger: { userId: marked._id }, defender: { userId: real._id } });
  await assert.rejects(preview(db), /Mixed real-user matches/);
  await db.collection(ArenaMatch.collection.name).deleteOne({ _id: mixed.insertedId });
  const state = await preview(db);
  assert.equal(state.users.length, 2, "Emails or display names alone must not select real users");
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "matths-test-purge-verify-"));
  const saved = await backup(db, state, directory);
  const manifest = JSON.parse(await fs.readFile(path.join(saved, "manifest.json"), "utf8"));
  assert.equal(manifest.userIds.length, 2);
  assert.equal(manifest.collections.find(c => c.name === User.collection.name).count, 2);
  assert.equal(await applyDeletion(db, state), 2);
  assert.equal(await User.countDocuments({ _id: { $in: state.ids } }), 0);
  assert.equal(await User.countDocuments({ _id: { $in: [real._id, admin._id] } }), 2);
  for (const model of [UserNotification, RankingProfile]) assert.equal(await model.countDocuments({ userId: real._id }), 1);
  for (const model of [AcademyStudentMembership, AcademyAttendance, AcademyAssignmentSubmission]) assert.equal(await model.countDocuments({ studentUserId: real._id }), 1);
  assert.equal(await WebSession.countDocuments({ "session.user.id": String(real._id) }), 1);
  assert.equal((await preview(db)).users.length, 0);
  console.log("Test account purge verified: explicit test markers only, protected admins and mixed real-user history, private lossless backup, account/owned-data/session removal and untouched normal users.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await mongoose.disconnect(); if (memory) await memory.stop();
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});
