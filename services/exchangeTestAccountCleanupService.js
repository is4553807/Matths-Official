"use strict";

const { User, ArchiveItem, CommunityPost, PrivateMockExamAttempt } = require("../models/matthsModel");
const { WebSession } = require("../models/sessionModel");
const { ExchangeWallet, ExchangeAccount, ExchangeOrder, ExchangePosition } = require("../models/exchangeModel");
const { AcademyStudentMembership } = require("../models/academyModel");
const { ParentAccount, ParentChildLink } = require("../models/parentModel");
const { ArenaMatch } = require("../models/goatArenaModel");

const EXCHANGE_TEST_BATCH = "exchange-operations-test";
const generatedEmails = Array.from({ length: 30 }, (_, index) =>
  `${EXCHANGE_TEST_BATCH}-${String(index + 1).padStart(2, "0")}@matths.invalid`);
const generatedAccount = {
  role: "test", isTestAccount: true, testBatchKey: EXCHANGE_TEST_BATCH, email: { $in: generatedEmails },
};
const unusedAccount = { isActive: false, accountStatus: "inactive", lastLoginAt: null };

async function previewExchangeTestAccountCleanup({ session } = {}) {
  const accounts = await User.find(generatedAccount)
    .select("_id email role isActive accountStatus lastLoginAt")
    .sort({ email: 1 }).session(session ?? null).lean();
  const blockers = [];
  if (!accounts.length) return { accounts, count: 0, blockers };

  if (accounts.some((row) => row.isActive !== false || row.accountStatus !== "inactive" || row.lastLoginAt != null)) {
    blockers.push("used-account");
  }
  const ids = { $in: accounts.map((row) => row._id) };
  const guards = [
    [ExchangeWallet, { $or: [{ _id: ids }, { parentWalletId: ids }] }],
    [ExchangeAccount, { userId: ids }],
    [ExchangeOrder, { userId: ids }],
    [ExchangePosition, { userId: ids }],
    [PrivateMockExamAttempt, { userId: ids }],
    [AcademyStudentMembership, { studentUserId: ids }],
    [ParentAccount, { childUserId: ids }],
    [ParentChildLink, { childUserId: ids }],
    [ArenaMatch, { $or: [{ "challenger.userId": ids }, { "defender.userId": ids }, { requestInitiatorUserId: ids }] }],
    [ArchiveItem, { uploadedBy: ids }],
    [CommunityPost, { authorId: ids }],
  ];
  // MongoDB does not allow parallel operations inside one transaction.
  for (const [model, filter] of guards) {
    if (await model.exists(filter).session(session ?? null)) blockers.push(model.modelName);
  }
  return { accounts, count: accounts.length, blockers };
}

async function cleanupExchangeTestAccounts({ session, expectedIds }) {
  if (!session?.inTransaction() || !Array.isArray(expectedIds)) {
    throw new Error("Exchange test account cleanup requires a transaction and reviewed account IDs.");
  }
  const { accounts, blockers } = await previewExchangeTestAccountCleanup({ session });
  const actualIds = accounts.map((row) => String(row._id));
  const reviewed = new Set(expectedIds.map(String));
  if (reviewed.size !== expectedIds.length || actualIds.length !== reviewed.size || actualIds.some((id) => !reviewed.has(id))) {
    throw new Error("Exchange test account candidates changed after review.");
  }
  if (blockers.length) throw new Error(`Exchange test accounts have activity or balances: ${blockers.join(", ")}.`);
  if (!accounts.length) return { removed: 0, removedSessions: 0 };

  const { deletedCount: removed } = await User.deleteMany({
    ...generatedAccount, ...unusedAccount, _id: { $in: actualIds },
  }, { session });
  if (removed !== accounts.length) throw new Error("Exchange test accounts changed during cleanup.");

  const { deletedCount: removedSessions } = await WebSession.deleteMany({
    "session.user.id": { $in: actualIds },
    "session.parent": null,
  }, { session });
  return { removed, removedSessions };
}

module.exports = { cleanupExchangeTestAccounts, previewExchangeTestAccountCleanup };
