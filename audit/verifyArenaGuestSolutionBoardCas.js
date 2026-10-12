"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const RAW_TOKEN = "guest-board-cas-token-that-is-long-enough";
const GUEST_SECRET = "guest-board-cas-secret";
const CHALLENGE_ID = "111111111111111111111111";
const IDENTITY_ID = "222222222222222222222222";
const ATTEMPT_ID = "333333333333333333333333";

const challenge = {
  _id: CHALLENGE_ID,
  tokenHash: crypto.createHash("sha256").update(RAW_TOKEN).digest("hex"),
  status: "OPEN",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
};
const identity = {
  _id: IDENTITY_ID,
  claimedByUserId: null,
  claimSecretHash: crypto.createHash("sha256").update(GUEST_SECRET).digest("hex"),
};
const attempt = {
  _id: ATTEMPT_ID,
  challengeId: CHALLENGE_ID,
  guestIdentityId: IDENTITY_ID,
  status: "IN_PROGRESS",
  currentQuestionIndex: 0,
  startedAt: new Date(),
};

function selectable(value) {
  const query = Promise.resolve(value);
  query.select = async () => value;
  return query;
}

function duplicateKeyError() {
  return Object.assign(new Error("duplicate guest board"), { code: 11000 });
}

function install(filename, exports) {
  const resolved = require.resolve(filename);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

let activeHarness = null;

const ArenaGuestChallenge = {
  findOne() {
    return selectable(challenge);
  },
};
const ArenaGuestIdentity = {
  findById() {
    return selectable(identity);
  },
};
const ArenaGuestChallengeAttempt = {
  findOne() {
    return { sort: async () => attempt };
  },
};
const ArenaGuestSolutionBoard = {
  findOneAndUpdate(filter, update) {
    return activeHarness.findOneAndUpdate(filter, update);
  },
  create(document) {
    return activeHarness.create(document);
  },
};

install("../models/matthsModel", { User: {} });
install("../models/goatArenaModel", {
  ArenaGuestChallenge,
  ArenaGuestChallengeAttempt,
  ArenaGuestIdentity,
  ArenaGuestSolutionBoard,
  ArenaMatch: {},
  ArenaMatchAttempt: {},
  ArenaMatchEvidence: {},
  ArenaProblemPack: {},
});
install("../services/arenaOneOnOneProblemBank", { ARENA_ONE_ON_ONE_TIME_LIMIT_MS: 1 });
install("../services/arenaCompetitiveScoringService", { compareCountThenTimePerformance() {} });
install("../services/arenaAsyncCompetitiveService", {
  exactSourceRates() { return []; },
  performanceForAttempt() { return {}; },
});
install("../services/arenaMatchEvidenceService", {
  async buildEvidenceFiles([file]) {
    const prepared = { ...file.prepared };
    activeHarness.liveAssets.add(prepared.cloudPublicId);
    return [prepared];
  },
  async discardArenaEvidenceFiles() {},
});
install("../services/fileStorageService", {
  async destroyStoredAsset(asset) {
    const key = asset?.cloudPublicId || asset?.r2ObjectKey;
    activeHarness.destroyedAssets.push(key);
    activeHarness.liveAssets.delete(key);
  },
  async signedStoredAssetUrl() { return null; },
});
install("../services/goatArenaV2Config", {
  GOAT_ARENA_V2_CONFIG: {
    guestChallenge: { completionGraceMs: 60 * 1000, linkTtlMs: 60 * 60 * 1000 },
  },
});
install("../services/nicknameService", {
  nicknameKey(value) { return String(value || "").toLowerCase(); },
  validateNickname(value) { return { valid: true, nickname: String(value || "") }; },
});
install("../services/schoolService", {
  OVERSEAS_HIGH_SCHOOL_OPTION_CODE: "OVERSEAS",
  buildOverseasSchool() { return { school: null }; },
  findSchool() { return null; },
});

const { GUEST_COOKIE_NAME, saveGuestSolutionBoard } = require("../services/arenaGuestChallengeService");
const cookieHeader = `${GUEST_COOKIE_NAME}=${IDENTITY_ID}.${GUEST_SECRET}`;

function copyBoard(board) {
  return board ? { ...board, file: { ...board.file } } : null;
}

function createHarness(firstInsertRevision) {
  let board = null;
  let initialUpdateCount = 0;
  let releaseInitialUpdates;
  let releaseFirstInsert;
  const initialUpdatesReached = new Promise((resolve) => { releaseInitialUpdates = resolve; });
  const firstInsertFinished = new Promise((resolve) => { releaseFirstInsert = resolve; });
  const updateCallsByRevision = new Map();

  return {
    liveAssets: new Set(),
    destroyedAssets: [],
    get board() { return copyBoard(board); },
    async findOneAndUpdate(filter, update) {
      const revision = Number(update?.$set?.revision);
      assert.equal(String(filter.attemptId), ATTEMPT_ID);
      assert.equal(filter.questionSlot, 1);
      assert.equal(filter.revision?.$lt, revision, "the CAS must only replace an older revision");
      const callCount = (updateCallsByRevision.get(revision) || 0) + 1;
      updateCallsByRevision.set(revision, callCount);
      if (callCount === 1) {
        initialUpdateCount += 1;
        if (initialUpdateCount === 2) releaseInitialUpdates();
        await initialUpdatesReached;
        return null;
      }
      if (!board || Number(board.revision) >= revision) return null;
      const replaced = copyBoard(board);
      board = { ...board, ...update.$set };
      return replaced;
    },
    async create(document) {
      const revision = Number(document.revision);
      if (revision !== firstInsertRevision) await firstInsertFinished;
      if (board) throw duplicateKeyError();
      board = copyBoard(document);
      releaseFirstInsert();
      return copyBoard(board);
    },
  };
}

function boardFile(label) {
  return {
    prepared: {
      originalName: `${label}.png`,
      storedName: `${label}.png`,
      mimeType: "image/png",
      sizeBytes: 128,
      sha256: crypto.createHash("sha256").update(label).digest("hex"),
      storageProvider: "CLOUDINARY",
      storagePurpose: "USER_ARENA_EVIDENCE",
      cloudPublicId: `audit/${label}`,
      cloudResourceType: "image",
      cloudDeliveryType: "authenticated",
    },
  };
}

function save(revision, label) {
  return saveGuestSolutionBoard({
    rawToken: RAW_TOKEN,
    cookieHeader,
    questionSlot: 1,
    revision,
    strokeCount: revision * 10,
    drawingDataBase64: Buffer.from(`drawing-${label}`).toString("base64"),
    file: boardFile(label),
  });
}

async function verifyRace({ firstInsertRevision, label }) {
  activeHarness = createHarness(firstInsertRevision);
  const outcomes = await Promise.allSettled([
    save(2, `${label}-newest`),
    save(1, `${label}-stale`),
  ]);
  const board = activeHarness.board;
  assert.equal(board.revision, 2, `${label}: a stale first save must not remain authoritative`);
  assert.equal(board.strokeCount, 20);
  assert.equal(board.file.cloudPublicId, `audit/${label}-newest`);
  assert.deepEqual(
    [...activeHarness.liveAssets],
    [`audit/${label}-newest`],
    `${label}: only the winning revision's stored asset may remain`
  );
  assert.deepEqual(
    activeHarness.destroyedAssets,
    [`audit/${label}-stale`],
    `${label}: the superseded or rejected stale asset must be destroyed exactly once`
  );
  assert.equal(outcomes[0].status, "fulfilled", `${label}: the newest revision must succeed`);
  if (firstInsertRevision === 1) {
    assert.equal(outcomes[1].status, "fulfilled", `${label}: the stale insert completed before replacement`);
  } else {
    assert.equal(outcomes[1].status, "rejected", `${label}: the stale losing insert must conflict`);
    assert.equal(outcomes[1].reason?.code, "ARENA_GUEST_BOARD_CONFLICT");
  }
}

(async () => {
  await verifyRace({ firstInsertRevision: 1, label: "stale-inserts-first" });
  await verifyRace({ firstInsertRevision: 2, label: "newest-inserts-first" });
  console.log("Guest solution-board first-save CAS and asset cleanup verified.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
