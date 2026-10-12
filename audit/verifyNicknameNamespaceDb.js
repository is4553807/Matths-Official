"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");

const NicknameNamespace = require("../models/nicknameNamespaceModel");
const { User } = require("../models/matthsModel");
const { ArenaGuestIdentity } = require("../models/goatArenaModel");
const {
  bindGuestNicknameToUser,
  replaceUserNickname,
  reserveGuestNickname,
  reserveUserNickname,
} = require("../services/nicknameNamespaceService");

function secretHash() {
  return crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex");
}

async function createReservedUser({ userId, nickname, email }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await reserveUserNickname({ nickname, userId, session });
      await User.create([{
        _id: userId,
        name: nickname,
        nameNormalized: nickname.toLocaleLowerCase("ko-KR"),
        email,
        passwordHash: "audit-password-hash",
        termsAcceptedAt: new Date(),
      }], { session });
    });
  } finally {
    await session.endSession();
  }
}

async function createReservedGuest({ guestIdentityId, nickname }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await reserveGuestNickname({ nickname, guestIdentityId, session });
      await ArenaGuestIdentity.create([{
        _id: guestIdentityId,
        nickname,
        nicknameNormalized: nickname.toLocaleLowerCase("ko-KR"),
        claimSecretHash: secretHash(),
        birthDateHash: secretHash(),
        firstChallengeAcceptedAt: new Date(),
      }], { session });
    });
  } finally {
    await session.endSession();
  }
}

async function main() {
  assert.match(String(process.env.DB || ""), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB);
  try {
    await Promise.all([
      NicknameNamespace.init(),
      User.init(),
      ArenaGuestIdentity.init(),
    ]);

    const raceNickname = "동시선점검증";
    const userId = new mongoose.Types.ObjectId();
    const guestIdentityId = new mongoose.Types.ObjectId();
    const race = await Promise.allSettled([
      createReservedUser({
        userId,
        nickname: raceNickname,
        email: "nickname-race-user@example.invalid",
      }),
      createReservedGuest({ guestIdentityId, nickname: raceNickname }),
    ]);
    assert.equal(race.filter((entry) => entry.status === "fulfilled").length, 1);
    assert.equal(race.filter((entry) => entry.status === "rejected").length, 1);
    assert.equal(
      race.find((entry) => entry.status === "rejected").reason?.code,
      "NICKNAME_NAMESPACE_TAKEN"
    );
    assert.equal(await NicknameNamespace.countDocuments({ _id: "동시선점검증" }), 1);
    assert.equal(
      (await User.countDocuments({ nameNormalized: "동시선점검증" })) +
        (await ArenaGuestIdentity.countDocuments({ nicknameNormalized: "동시선점검증" })),
      1,
      "회원과 게스트 중 한 컬렉션만 실제 소유 문서를 커밋해야 한다"
    );

    const transferNickname = "게스트회원전환";
    const transferGuestId = new mongoose.Types.ObjectId();
    await createReservedGuest({
      guestIdentityId: transferGuestId,
      nickname: transferNickname,
    });
    const transferUserId = new mongoose.Types.ObjectId();
    const transferSession = await mongoose.startSession();
    try {
      await transferSession.withTransaction(async () => {
        await reserveUserNickname({
          nickname: transferNickname,
          userId: transferUserId,
          claimableGuestIdentityId: transferGuestId,
          session: transferSession,
        });
        await User.create([{
          _id: transferUserId,
          name: transferNickname,
          nameNormalized: transferNickname,
          email: "nickname-transfer-user@example.invalid",
          passwordHash: "audit-password-hash",
          termsAcceptedAt: new Date(),
        }], { session: transferSession });
        await ArenaGuestIdentity.updateOne(
          { _id: transferGuestId, claimedByUserId: null },
          { $set: { claimedByUserId: transferUserId, claimedAt: new Date() } },
          { session: transferSession }
        );
        await bindGuestNicknameToUser({
          nickname: transferNickname,
          guestIdentityId: transferGuestId,
          userId: transferUserId,
          session: transferSession,
        });
      });
    } finally {
      await transferSession.endSession();
    }
    const transferred = await NicknameNamespace.findById(transferNickname).lean();
    assert.equal(transferred.ownerKind, "USER");
    assert.equal(String(transferred.ownerId), String(transferUserId));
    assert.equal(String(transferred.linkedGuestIdentityId), String(transferGuestId));
    assert.ok(await User.exists({ _id: transferUserId, nameNormalized: transferNickname }));
    assert.ok(await ArenaGuestIdentity.exists({
      _id: transferGuestId,
      nicknameNormalized: transferNickname,
      claimedByUserId: transferUserId,
    }));

    await assert.rejects(
      reserveUserNickname({
        nickname: transferNickname,
        userId: new mongoose.Types.ObjectId(),
      }),
      (error) => error?.code === "NICKNAME_NAMESPACE_TAKEN"
    );

    const renamed = await replaceUserNickname({
      userId: transferUserId,
      nickname: "회원변경닉네임",
    });
    assert.equal(renamed.nameNormalized, "회원변경닉네임");
    assert.equal(await NicknameNamespace.exists({ _id: transferNickname }), null);
    assert.ok(await NicknameNamespace.exists({
      _id: "회원변경닉네임",
      ownerKind: "USER",
      ownerId: transferUserId,
    }));

    const memberNickname = "로그인회원참가";
    const memberUserId = new mongoose.Types.ObjectId();
    await createReservedUser({
      userId: memberUserId,
      nickname: memberNickname,
      email: "nickname-member-guest@example.invalid",
    });
    const memberGuestIdentityId = new mongoose.Types.ObjectId();
    const memberGuestSession = await mongoose.startSession();
    try {
      await memberGuestSession.withTransaction(async () => {
        await reserveUserNickname({
          nickname: memberNickname,
          userId: memberUserId,
          session: memberGuestSession,
        });
        await ArenaGuestIdentity.create([{
          _id: memberGuestIdentityId,
          nickname: memberNickname,
          nicknameNormalized: memberNickname,
          claimSecretHash: secretHash(),
          birthDateHash: secretHash(),
          firstChallengeAcceptedAt: new Date(),
          claimedByUserId: memberUserId,
          claimedAt: new Date(),
        }], { session: memberGuestSession });
        await bindGuestNicknameToUser({
          nickname: memberNickname,
          guestIdentityId: memberGuestIdentityId,
          userId: memberUserId,
          session: memberGuestSession,
        });
      });
    } finally {
      await memberGuestSession.endSession();
    }
    assert.ok(await NicknameNamespace.exists({
      _id: memberNickname,
      ownerKind: "USER",
      ownerId: memberUserId,
      linkedGuestIdentityId: memberGuestIdentityId,
    }));

    console.log(
      "Nickname namespace DB verification passed: concurrent member/guest claims have one winner; guest-to-member transfer preserves linked history; a logged-in member can bind its own guest identity; a different account is rejected; rename moves ownership atomically."
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
