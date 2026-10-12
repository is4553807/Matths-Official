"use strict";

const mongoose = require("mongoose");

const NicknameNamespace = require("../models/nicknameNamespaceModel");
const { User } = require("../models/matthsModel");
const { ArenaGuestIdentity } = require("../models/goatArenaModel");

function statusError(status, message, code = "") {
  return Object.assign(new Error(message), { status, code });
}

function cleanKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ko-KR");
}

function querySession(query, session) {
  return session ? query.session(session) : query;
}

async function readConflicts({ userQuery, guestQuery, session }) {
  // MongoDB 드라이버는 한 ClientSession 안의 병렬 명령을 지원하지 않는다.
  // 트랜잭션 호출자는 반드시 순차 조회하고, 세션이 없는 사전 확인만 병렬화한다.
  if (session) {
    const userConflict = await querySession(userQuery, session);
    const guestConflict = await querySession(guestQuery, session);
    return [userConflict, guestConflict];
  }
  return Promise.all([userQuery, guestQuery]);
}

function isDuplicateKey(error) {
  return Number(error?.code) === 11000;
}

function nicknameTakenError() {
  return statusError(
    409,
    "이미 사용 중인 닉네임입니다.",
    "NICKNAME_NAMESPACE_TAKEN"
  );
}

async function reserveNamespaceDocument({
  nickname,
  nicknameNormalized,
  ownerKind,
  ownerId,
  linkedGuestIdentityId = null,
  session = null,
}) {
  const key = cleanKey(nicknameNormalized || nickname);
  if (!key || !mongoose.isValidObjectId(ownerId)) {
    throw statusError(400, "올바른 닉네임 소유권 정보가 필요합니다.", "NICKNAME_NAMESPACE_INVALID");
  }
  try {
    const reservation = await NicknameNamespace.findOneAndUpdate(
      {
        _id: key,
        ownerKind,
        ownerId,
      },
      {
        $setOnInsert: {
          displayName: String(nickname || key).trim(),
          linkedGuestIdentityId,
        },
      },
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
        session: session || undefined,
      }
    );
    if (!reservation) throw nicknameTakenError();
    return reservation;
  } catch (error) {
    if (isDuplicateKey(error)) throw nicknameTakenError();
    throw error;
  }
}

async function reserveGuestNickname({
  nickname,
  nicknameNormalized,
  guestIdentityId,
  session = null,
}) {
  const key = cleanKey(nicknameNormalized || nickname);
  const escaped = String(nickname || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const [userConflict, guestConflict] = await readConflicts({
    userQuery: User.exists({
      $or: [
        { nameNormalized: key },
        ...(escaped ? [{ name: { $regex: `^${escaped}$`, $options: "i" } }] : []),
      ],
    }),
    guestQuery: ArenaGuestIdentity.exists({
      nicknameNormalized: key,
      _id: { $ne: guestIdentityId },
    }),
    session,
  });
  if (userConflict || guestConflict) throw nicknameTakenError();
  return reserveNamespaceDocument({
    nickname,
    nicknameNormalized: key,
    ownerKind: "GUEST",
    ownerId: guestIdentityId,
    linkedGuestIdentityId: guestIdentityId,
    session,
  });
}

async function reserveUserNickname({
  nickname,
  nicknameNormalized,
  userId,
  claimableGuestIdentityId = null,
  session = null,
}) {
  const key = cleanKey(nicknameNormalized || nickname);
  const escaped = String(nickname || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const guestAllowance = [
    ...(claimableGuestIdentityId ? [{ _id: claimableGuestIdentityId }] : []),
    { claimedByUserId: userId },
  ];
  const [userConflict, guestConflict] = await readConflicts({
    userQuery: User.exists({
      _id: { $ne: userId },
      $or: [
        { nameNormalized: key },
        ...(escaped ? [{ name: { $regex: `^${escaped}$`, $options: "i" } }] : []),
      ],
    }),
    guestQuery: ArenaGuestIdentity.exists({
      nicknameNormalized: key,
      $nor: guestAllowance,
    }),
    session,
  });
  if (userConflict || guestConflict) throw nicknameTakenError();

  const alreadyClaimedGuest = claimableGuestIdentityId
    ? null
    : await querySession(ArenaGuestIdentity.findOne({
        nicknameNormalized: key,
        claimedByUserId: userId,
      }).select("_id"), session);
  const linkedGuestIdentityId =
    claimableGuestIdentityId || alreadyClaimedGuest?._id || null;

  if (linkedGuestIdentityId) {
    const transferred = await NicknameNamespace.findOneAndUpdate(
      {
        _id: key,
        ownerKind: "GUEST",
        ownerId: linkedGuestIdentityId,
      },
      {
        $set: {
          displayName: String(nickname || key).trim(),
          ownerKind: "USER",
          ownerId: userId,
          linkedGuestIdentityId,
        },
      },
      { returnDocument: "after", session: session || undefined }
    );
    if (transferred) return transferred;
  }

  return reserveNamespaceDocument({
    nickname,
    nicknameNormalized: key,
    ownerKind: "USER",
    ownerId: userId,
    linkedGuestIdentityId,
    session,
  });
}

async function bindGuestNicknameToUser({
  nickname,
  nicknameNormalized,
  guestIdentityId,
  userId,
  session = null,
}) {
  const key = cleanKey(nicknameNormalized || nickname);
  const transferred = await NicknameNamespace.findOneAndUpdate(
    {
      _id: key,
      $or: [
        { ownerKind: "GUEST", ownerId: guestIdentityId },
        { ownerKind: "USER", ownerId: userId },
      ],
    },
    {
      $set: {
        displayName: String(nickname || key).trim(),
        ownerKind: "USER",
        ownerId: userId,
        linkedGuestIdentityId: guestIdentityId,
      },
    },
    { returnDocument: "after", session: session || undefined }
  );
  if (transferred) return transferred;
  return reserveUserNickname({
    nickname,
    nicknameNormalized: key,
    userId,
    claimableGuestIdentityId: guestIdentityId,
    session,
  });
}

async function releaseNickname({
  nickname,
  nicknameNormalized,
  ownerKind,
  ownerId,
  session = null,
}) {
  const key = cleanKey(nicknameNormalized || nickname);
  if (!key || !mongoose.isValidObjectId(ownerId)) return false;
  const result = await NicknameNamespace.deleteOne(
    { _id: key, ownerKind, ownerId },
    { session: session || undefined }
  );
  return Number(result.deletedCount || 0) === 1;
}

async function unlinkGuestNicknameFromUser({
  nickname,
  nicknameNormalized,
  guestIdentityId,
  userId,
  session = null,
}) {
  const key = cleanKey(nicknameNormalized || nickname);
  if (!key) return false;
  const result = await NicknameNamespace.updateOne(
    {
      _id: key,
      ownerKind: "USER",
      ownerId: userId,
      linkedGuestIdentityId: guestIdentityId,
    },
    { $set: { linkedGuestIdentityId: null } },
    { session: session || undefined }
  );
  return Number(result.modifiedCount || 0) === 1;
}

async function replaceUserNickname({
  userId,
  nickname,
  nicknameNormalized,
  session = null,
}) {
  const run = async (mongoSession) => {
    const user = await User.findById(userId).session(mongoSession);
    if (!user) {
      throw statusError(404, "사용자 정보를 찾을 수 없습니다.", "USER_NOT_FOUND");
    }
    const previousKey = cleanKey(user.nameNormalized || user.name);
    const nextKey = cleanKey(nicknameNormalized || nickname);
    await reserveUserNickname({
      nickname,
      nicknameNormalized: nextKey,
      userId,
      session: mongoSession,
    });
    user.name = String(nickname || "").trim();
    user.nameNormalized = nextKey;
    await user.save({ session: mongoSession });
    if (previousKey && previousKey !== nextKey) {
      await releaseNickname({
        nicknameNormalized: previousKey,
        ownerKind: "USER",
        ownerId: userId,
        session: mongoSession,
      });
    }
    return user;
  };

  if (session) return run(session);
  const mongoSession = await mongoose.startSession();
  let user = null;
  try {
    await mongoSession.withTransaction(async () => {
      user = await run(mongoSession);
    });
    user?.$session?.(null);
    return user;
  } finally {
    await mongoSession.endSession();
  }
}

module.exports = {
  bindGuestNicknameToUser,
  cleanKey,
  nicknameTakenError,
  replaceUserNickname,
  releaseNickname,
  reserveGuestNickname,
  reserveUserNickname,
  unlinkGuestNicknameFromUser,
};
