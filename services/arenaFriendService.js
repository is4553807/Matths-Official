const mongoose = require("mongoose");
const { randomUUID } = require("node:crypto");
const { User } = require("../models/matthsModel");
const {
  ArenaCompetitiveProfile,
  ArenaFriendRequest,
  ArenaFriendlyInvitationV2,
  ArenaFriendship,
  ArenaMatch,
  ArenaMatchParticipantLock,
  ArenaMatchmakingEntry,
} = require("../models/goatArenaModel");
const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");
const { createArenaV2Match } = require("./arenaV2MatchmakingService");
const { ensureArenaV2Profile, profileView } = require("./arenaV2ProfileService");

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function pairFor(left, right) {
  const ids = [String(left), String(right)].sort();
  return {
    pairKey: `${ids[0]}:${ids[1]}`,
    userLowId: ids[0],
    userHighId: ids[1],
  };
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function friendshipExists(left, right) {
  return ArenaFriendship.exists({ pairKey: pairFor(left, right).pairKey });
}

async function searchArenaUsers({ userId, query }) {
  const value = String(query || "").trim();
  if (value.length < 2) return [];
  const byEmail = value.includes("@");
  const users = await User.find({
    _id: { $ne: userId },
    accountStatus: "active",
    isActive: { $ne: false },
    ...(byEmail
      ? { email: value.toLowerCase() }
      : {
          $or: [
            { nameNormalized: value.toLowerCase() },
            { name: { $regex: `^${escapeRegex(value)}$`, $options: "i" } },
          ],
        }),
  })
    .select("name email lastConnectedAt")
    .limit(byEmail ? 1 : 12)
    .lean();
  const friendships = await ArenaFriendship.find({
    pairKey: { $in: users.map((user) => pairFor(userId, user._id).pairKey) },
  }).lean();
  const friendPairs = new Set(friendships.map((friendship) => friendship.pairKey));
  const pending = await ArenaFriendRequest.find({
    pairKey: { $in: users.map((user) => pairFor(userId, user._id).pairKey) },
    status: "PENDING",
  }).lean();
  const requestByPair = new Map(pending.map((request) => [request.pairKey, request]));
  return users.map((user) => {
    const pair = pairFor(userId, user._id);
    const request = requestByPair.get(pair.pairKey);
    return {
      userId: String(user._id),
      username: String(user.name || "사용자"),
      emailMatched: byEmail,
      friendshipStatus: friendPairs.has(pair.pairKey)
        ? "FRIEND"
        : request
          ? String(request.requesterUserId) === String(userId)
            ? "REQUEST_SENT"
            : "REQUEST_RECEIVED"
          : "NONE",
    };
  });
}

async function sendArenaFriendRequest({ requesterUserId, recipientUserId }) {
  if (
    !mongoose.isValidObjectId(recipientUserId) ||
    String(requesterUserId) === String(recipientUserId)
  ) {
    throw statusError(400, "친구 요청 상대를 확인해주세요.", "FRIEND_RECIPIENT_INVALID");
  }
  const recipient = await User.findOne({
    _id: recipientUserId,
    accountStatus: "active",
    isActive: { $ne: false },
  }).select("_id").lean();
  if (!recipient) throw statusError(404, "친구 요청 상대를 찾을 수 없습니다.");
  const pair = pairFor(requesterUserId, recipientUserId);
  if (await ArenaFriendship.exists({ pairKey: pair.pairKey })) {
    throw statusError(409, "이미 친구로 등록된 사용자입니다.", "ALREADY_FRIENDS");
  }
  const reverse = await ArenaFriendRequest.findOne({
    pairKey: pair.pairKey,
    requesterUserId: recipientUserId,
    recipientUserId: requesterUserId,
    status: "PENDING",
  });
  if (reverse) {
    return respondArenaFriendRequest({
      requestId: reverse._id,
      userId: requesterUserId,
      response: "ACCEPT",
    });
  }
  try {
    return await ArenaFriendRequest.create({
      pairKey: pair.pairKey,
      requesterUserId,
      recipientUserId,
      status: "PENDING",
    });
  } catch (error) {
    if (Number(error?.code) === 11000) {
      return ArenaFriendRequest.findOne({ pairKey: pair.pairKey, status: "PENDING" });
    }
    throw error;
  }
}

async function respondArenaFriendRequest({ requestId, userId, response, now = new Date() }) {
  if (!mongoose.isValidObjectId(requestId)) {
    throw statusError(400, "친구 요청 정보를 확인해주세요.", "FRIEND_REQUEST_ID_INVALID");
  }
  const normalized = String(response || "").trim().toUpperCase();
  if (!["ACCEPT", "DECLINE"].includes(normalized)) {
    throw statusError(400, "친구 요청 응답을 확인해주세요.");
  }
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const request = await ArenaFriendRequest.findOne({
        _id: requestId,
        recipientUserId: userId,
      }).session(session);
      if (!request) throw statusError(404, "친구 요청을 찾을 수 없습니다.");
      if (request.status !== "PENDING") {
        result = { request, replayed: true };
        return;
      }
      request.status = normalized === "ACCEPT" ? "ACCEPTED" : "DECLINED";
      request.respondedAt = now;
      await request.save({ session });
      let friendship = null;
      if (normalized === "ACCEPT") {
        const pair = pairFor(request.requesterUserId, request.recipientUserId);
        friendship = await ArenaFriendship.findOneAndUpdate(
          { pairKey: pair.pairKey },
          {
            $setOnInsert: {
              ...pair,
              acceptedRequestId: request._id,
              acceptedAt: now,
            },
          },
          { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, session }
        );
      }
      result = { request, friendship, replayed: false };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function activeGameState(userIds) {
  const [locks, queues] = await Promise.all([
    ArenaMatchParticipantLock.find({ userId: { $in: userIds } }).lean(),
    ArenaMatchmakingEntry.find({
      userId: { $in: userIds },
      status: { $in: ["WAITING", "MATCHING"] },
    }).lean(),
  ]);
  const matches = await ArenaMatch.find({ _id: { $in: locks.map((lock) => lock.matchId) } })
    .select("gameMode challenger.userId defender.userId")
    .lean();
  const state = new Map();
  for (const queue of queues) state.set(String(queue.userId), "대기 중");
  for (const match of matches) {
    const label =
      match.gameMode === "COMPETITIVE"
        ? "경쟁전 중"
        : match.gameMode === "FRIENDLY"
          ? "친선전 중"
          : "일반전 중";
    state.set(String(match.challenger.userId), label);
    state.set(String(match.defender.userId), label);
  }
  return state;
}

async function listArenaFriends(userId, now = new Date()) {
  const friendships = await ArenaFriendship.find({
    $or: [{ userLowId: userId }, { userHighId: userId }],
  }).lean();
  const friendIds = friendships.map((friendship) =>
    String(friendship.userLowId) === String(userId)
      ? friendship.userHighId
      : friendship.userLowId
  );
  const [users, profiles, gameState] = await Promise.all([
    User.find({ _id: { $in: friendIds } })
      .select("name lastConnectedAt accountStatus isActive")
      .lean(),
    Promise.all(friendIds.map((friendId) => ensureArenaV2Profile(friendId))),
    activeGameState(friendIds),
  ]);
  const profileByUser = new Map(
    profiles.map((profile) => [String(profile.userId), profileView(profile)])
  );
  return users
    .filter((user) => user.accountStatus === "active" && user.isActive !== false)
    .map((user) => {
      const profile = profileByUser.get(String(user._id));
      const connectedAt = user.lastConnectedAt ? new Date(user.lastConnectedAt) : null;
      const online = Boolean(
        connectedAt && now.getTime() - connectedAt.getTime() <= GOAT_ARENA_V2_CONFIG.friends.onlineWindowMs
      );
      return {
        userId: String(user._id),
        username: String(user.name || "사용자"),
        level: profile?.accountLevel || 1,
        tierLabel: profile?.placementFinalized ? profile.tierLabel : "미배치",
        online,
        gameStatus: gameState.get(String(user._id)) || (online ? "대기 가능" : "오프라인"),
        canInvite: !gameState.has(String(user._id)),
      };
    })
    .sort((left, right) => Number(right.online) - Number(left.online) || left.username.localeCompare(right.username, "ko"));
}

async function getArenaFriendData({ userId, query = "", now = new Date() }) {
  await ArenaFriendlyInvitationV2.updateMany(
    { status: "PENDING", expiresAt: { $lte: now } },
    { $set: { status: "EXPIRED", respondedAt: now } }
  );
  const [friends, searchResults, receivedRequests, sentRequests, receivedInvites, sentInvites] =
    await Promise.all([
      listArenaFriends(userId, now),
      String(query || "").trim().length >= 2
        ? searchArenaUsers({ userId, query })
        : Promise.resolve([]),
      ArenaFriendRequest.find({ recipientUserId: userId, status: "PENDING" })
        .populate("requesterUserId", "name")
        .sort({ createdAt: -1 })
        .lean(),
      ArenaFriendRequest.find({ requesterUserId: userId, status: "PENDING" })
        .populate("recipientUserId", "name")
        .sort({ createdAt: -1 })
        .lean(),
      ArenaFriendlyInvitationV2.find({ inviteeUserId: userId, status: "PENDING" })
        .populate("inviterUserId", "name")
        .sort({ createdAt: -1 })
        .lean(),
      ArenaFriendlyInvitationV2.find({ inviterUserId: userId, status: "PENDING" })
        .populate("inviteeUserId", "name")
        .sort({ createdAt: -1 })
        .lean(),
    ]);
  return {
    query: String(query || "").trim(),
    friends,
    searchResults,
    receivedRequests,
    sentRequests,
    receivedInvites,
    sentInvites,
  };
}

async function createArenaFriendlyInvitation({
  inviterUserId,
  inviteeUserId,
  requestId = randomUUID(),
  now = new Date(),
}) {
  if (
    !mongoose.isValidObjectId(inviteeUserId) ||
    String(inviterUserId) === String(inviteeUserId)
  ) {
    throw statusError(400, "친선전 상대를 확인해주세요.", "FRIENDLY_INVITEE_INVALID");
  }
  if (!(await friendshipExists(inviterUserId, inviteeUserId))) {
    throw statusError(403, "친구에게만 친선전을 신청할 수 있습니다.", "FRIENDSHIP_REQUIRED");
  }
  const normalizedRequestId = String(requestId);
  const replay = await ArenaFriendlyInvitationV2.findOne({
    inviterUserId,
    requestId: normalizedRequestId,
  });
  if (replay) {
    if (String(replay.inviteeUserId) !== String(inviteeUserId)) {
      throw statusError(409, "같은 요청 식별자를 다른 친구 초대에 사용할 수 없습니다.");
    }
    return replay;
  }
  const [active, queued] = await Promise.all([
    ArenaMatchParticipantLock.exists({
      userId: { $in: [inviterUserId, inviteeUserId] },
    }),
    ArenaMatchmakingEntry.exists({
      userId: { $in: [inviterUserId, inviteeUserId] },
      status: { $in: ["WAITING", "MATCHING"] },
    }),
  ]);
  if (active || queued) {
    throw statusError(409, "진행 중인 경기나 매칭 대기가 있는 친구에게는 친선전을 신청할 수 없습니다.");
  }
  const pending = await ArenaFriendlyInvitationV2.exists({
    status: "PENDING",
    $or: [
      { inviterUserId: { $in: [inviterUserId, inviteeUserId] } },
      { inviteeUserId: { $in: [inviterUserId, inviteeUserId] } },
    ],
  });
  if (pending) throw statusError(409, "이미 처리 중인 친선전 초대가 있습니다.");
  return ArenaFriendlyInvitationV2.findOneAndUpdate(
    { inviterUserId, requestId: normalizedRequestId },
    {
      $setOnInsert: {
        requestId: normalizedRequestId,
        inviterUserId,
        inviteeUserId,
        status: "PENDING",
        expiresAt: new Date(now.getTime() + GOAT_ARENA_V2_CONFIG.friends.invitationTtlMs),
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
}

async function respondArenaFriendlyInvitation({
  invitationId,
  userId,
  response,
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(invitationId)) {
    throw statusError(400, "친선전 초대 정보를 확인해주세요.", "FRIENDLY_INVITATION_ID_INVALID");
  }
  const normalized = String(response || "").trim().toUpperCase();
  if (!["ACCEPT", "DECLINE"].includes(normalized)) {
    throw statusError(400, "친선전 초대 응답을 확인해주세요.");
  }
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const invitation = await ArenaFriendlyInvitationV2.findOne({
        _id: invitationId,
        inviteeUserId: userId,
      }).session(session);
      if (!invitation) throw statusError(404, "친선전 초대를 찾을 수 없습니다.");
      if (invitation.status !== "PENDING") {
        result = {
          invitation,
          match: invitation.matchId ? await ArenaMatch.findById(invitation.matchId).session(session) : null,
          replayed: true,
        };
        return;
      }
      if (invitation.expiresAt <= now) {
        invitation.status = "EXPIRED";
        invitation.respondedAt = now;
        await invitation.save({ session });
        result = { invitation, expired: true, match: null };
        return;
      }
      if (normalized === "DECLINE") {
        invitation.status = "DECLINED";
        invitation.respondedAt = now;
        await invitation.save({ session });
        result = { invitation, match: null };
        return;
      }
      if (!(await ArenaFriendship.exists({
        pairKey: pairFor(invitation.inviterUserId, invitation.inviteeUserId).pairKey,
      }).session(session))) {
        throw statusError(403, "현재 친구 관계를 확인할 수 없습니다.");
      }
      const participants = [invitation.inviterUserId, invitation.inviteeUserId];
      const active = await ArenaMatchParticipantLock.exists({
        userId: { $in: participants },
      }).session(session);
      const queued = await ArenaMatchmakingEntry.exists({
        userId: { $in: participants },
        status: { $in: ["WAITING", "MATCHING"] },
      }).session(session);
      if (active || queued) {
        throw statusError(409, "진행 중인 경기나 매칭 대기가 있어 친선전을 시작할 수 없습니다.");
      }
      const match = await createArenaV2Match({
        challengerUserId: invitation.inviterUserId,
        defenderUserId: invitation.inviteeUserId,
        mode: "FRIENDLY",
        sourceId: invitation._id,
        now,
        session,
      });
      invitation.status = "ACCEPTED";
      invitation.respondedAt = now;
      invitation.matchId = match._id;
      await invitation.save({ session });
      result = { invitation, match, replayed: false };
    });
    if (result?.expired) throw statusError(410, "친선전 초대가 만료되었습니다.");
    return result;
  } finally {
    await session.endSession();
  }
}

async function cancelArenaFriendlyInvitation({ invitationId, userId, now = new Date() }) {
  if (!mongoose.isValidObjectId(invitationId)) {
    throw statusError(400, "친선전 초대 정보를 확인해주세요.", "FRIENDLY_INVITATION_ID_INVALID");
  }
  const invitation = await ArenaFriendlyInvitationV2.findOneAndUpdate(
    { _id: invitationId, inviterUserId: userId, status: "PENDING" },
    { $set: { status: "CANCELLED", cancelledAt: now } },
    { returnDocument: "after" }
  );
  if (!invitation) throw statusError(409, "취소할 친선전 초대를 찾을 수 없습니다.");
  return invitation;
}

module.exports = {
  cancelArenaFriendlyInvitation,
  createArenaFriendlyInvitation,
  getArenaFriendData,
  listArenaFriends,
  pairFor,
  respondArenaFriendRequest,
  respondArenaFriendlyInvitation,
  searchArenaUsers,
  sendArenaFriendRequest,
};
