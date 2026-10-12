const { nativeArenaEvidenceHref } = require("../services/arenaPublicResponseService");
const { randomUUID } = require("node:crypto");
const { User } = require("../models/matthsModel");
const {
  ArenaGuestChallengeAttempt,
  ArenaMatch,
  ArenaMatchParticipantLock,
} = require("../models/goatArenaModel");
const {
  cancelArenaV2Queue,
  getArenaV2QueueState,
  joinArenaV2Queue,
} = require("../services/arenaV2MatchmakingService");
const {
  finalizeArenaV2Placement,
  profileView,
  syncArenaV2PlacementProfile,
} = require("../services/arenaV2ProfileService");
const {
  cancelArenaFriendlyInvitation,
  createArenaFriendlyInvitation,
  getArenaFriendData,
  respondArenaFriendRequest,
  respondArenaFriendlyInvitation,
  sendArenaFriendRequest,
} = require("../services/arenaFriendService");
const { forfeitArenaV2Match } = require("../services/arenaV2SettlementService");
const {
  acknowledgeCompetitiveSolutionSharing,
  getAsyncCompetitiveEvidenceFile,
  getAsyncCompetitiveResult,
} = require("../services/arenaAsyncCompetitiveService");
const {
  getAsyncNormalEvidenceFile,
  getAsyncNormalResult,
} = require("../services/arenaAsyncNormalService");
const { ARENA_PROFILE_AVATARS } = require("../constants/arenaProfileAvatars");
const { resolveArenaProfileAvatar } = require("../services/arenaProfileAvatarService");
const { GOAT_ARENA_V2_CONFIG } = require("../services/goatArenaV2Config");

function userId(req) {
  return req.session.user.id;
}

function encodedRedirect(base, key, value) {
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${key}=${encodeURIComponent(String(value || ""))}`;
}

async function activeMatchForUser(id) {
  const lock = await ArenaMatchParticipantLock.findOne({ userId: id }).lean();
  if (!lock) return null;
  const match = await ArenaMatch.findById(lock.matchId)
    .populate("challenger.userId", "name")
    .populate("defender.userId", "name")
    .lean();
  if (!match) return null;
  const challenger = String(match.challenger?.userId?._id || match.challenger?.userId);
  const opponent = challenger === String(id)
    ? match.defender?.userId
    : match.challenger?.userId;
  return {
    id: String(match._id),
    href: `/goat-arena/matches/${match._id}`,
    mode: match.gameMode || (match.matchType === "FRIENDLY" ? "FRIENDLY" : match.division === "MAIN" ? "COMPETITIVE" : "NORMAL"),
    modeLabel:
      match.gameMode === "COMPETITIVE"
        ? "경쟁전"
        : match.gameMode === "FRIENDLY"
          ? "친선전"
          : "일반전",
    status: match.status,
    opponentName: String(opponent?.name || "상대"),
  };
}

async function dashboardContext(req, { activeArenaPage = "" } = {}) {
  const id = userId(req);
  const [user, profile, queue, friends] = await Promise.all([
    req.authenticatedUser
      ? Promise.resolve(
          typeof req.authenticatedUser.toObject === "function"
            ? req.authenticatedUser.toObject()
            : req.authenticatedUser
        )
      : User.findById(id).lean(),
    syncArenaV2PlacementProfile(id),
    getArenaV2QueueState({ userId: id }),
    getArenaFriendData({ userId: id, query: req.query.q || "" }),
  ]);
  if (!user) {
    const error = new Error("사용자 정보를 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }
  return {
    user,
    arenaUser: {
      nickname: String(user.name || "학생"),
      activityLevel: { level: profile.accountLevel },
      avatar: resolveArenaProfileAvatar(user.preferences),
    },
    profileAvatars: ARENA_PROFILE_AVATARS,
    selectedAvatar: resolveArenaProfileAvatar(user.preferences),
    arenaProfile: profileView(profile),
    claimedGuestRecordCount: await ArenaGuestChallengeAttempt.countDocuments({
      claimedByUserId: id,
      status: "SETTLED",
    }),
    competitiveEnabled: GOAT_ARENA_V2_CONFIG.asyncCompetitive.enabled,
    queue: queue
      ? {
          id: String(queue._id),
          mode: queue.mode,
          modeLabel: queue.mode === "COMPETITIVE" ? "경쟁전" : "일반전",
          status: queue.status,
          joinedAt: queue.joinedAt,
          matchId: queue.matchId ? String(queue.matchId) : null,
        }
      : null,
    activeMatch: await activeMatchForUser(id),
    friends,
    requestId: randomUUID(),
    notice: String(req.query.notice || ""),
    errorMessage: String(req.query.error || ""),
    activeArenaPage: String(activeArenaPage || req.query.page || "home"),
  };
}

exports.friendsPage = async (req, res, next) => {
  try {
    const context = await dashboardContext(req, { activeArenaPage: "friends" });
    res.set("Cache-Control", "no-store");
    return res.render("goat-arena-friends", context);
  } catch (error) {
    return next(error);
  }
};

function pageAction(action, redirectTo = "/goat-arena") {
  return async (req, res, next) => {
    const redirectBase = typeof redirectTo === "function"
      ? redirectTo(req)
      : redirectTo;
    try {
      const result = await action(req);
      const matchId = result?.match?._id || result?.match?._doc?._id;
      if (matchId) return res.redirect(`/goat-arena/matches/${matchId}`);
      return res.redirect(encodedRedirect(redirectBase, "notice", "요청을 처리했습니다."));
    } catch (error) {
      if ([400, 403, 404, 409, 410, 422, 423, 428, 503].includes(Number(error.status))) {
        return res.redirect(encodedRedirect(redirectBase, "error", error.message));
      }
      return next(error);
    }
  };
}

exports.joinMatchmaking = pageAction(async (req) => {
  const result = await joinArenaV2Queue({
    userId: userId(req),
    mode: req.params.mode,
  });
  return result.match ? { match: result.match } : result;
}, (req) => String(req.params.mode || "").toUpperCase() === "COMPETITIVE"
  ? "/goat-arena/main"
  : "/goat-arena/sub");

exports.acknowledgeCompetitiveSolutionSharing = pageAction(async (req) => {
  if (!GOAT_ARENA_V2_CONFIG.asyncCompetitive.enabled) {
    const error = new Error("경쟁전은 현재 공개되지 않았습니다.");
    error.status = 404;
    error.code = "ARENA_COMPETITIVE_NOT_RELEASED";
    throw error;
  }
  await acknowledgeCompetitiveSolutionSharing({
    userId: userId(req),
    accepted: req.body.accepted === true || req.body.accepted === "true" || req.body.accepted === "1" || req.body.accepted === "on",
  });
  return {};
}, "/goat-arena/main");

exports.cancelMatchmaking = pageAction(
  (req) => cancelArenaV2Queue({ userId: userId(req) })
);

exports.forfeitMatch = async (req, res, next) => {
  try {
    await forfeitArenaV2Match({ matchId: req.params.matchId, userId: userId(req) });
    return res.redirect(`/goat-arena/matches/${req.params.matchId}`);
  } catch (error) {
    if ([400, 403, 404, 409].includes(Number(error.status))) {
      return res.redirect(encodedRedirect(`/goat-arena/matches/${req.params.matchId}`, "matchError", error.message));
    }
    return next(error);
  }
};

exports.apiForfeitMatch = async (req, res, next) => {
  try {
    const result = await forfeitArenaV2Match({ matchId: req.params.matchId, userId: req.apiUser._id });
    res.set("Cache-Control", "no-store");
    return res.json({ match: { id: req.params.matchId, ...result } });
  } catch (error) {
    return next(error);
  }
};

exports.matchmakingStatus = async (req, res, next) => {
  try {
    const queue = await getArenaV2QueueState({ userId: userId(req) });
    if (!queue) return res.json({ status: "IDLE" });
    return res.json({
      status: queue.status,
      mode: queue.mode,
      matchId: queue.matchId ? String(queue.matchId) : null,
      matchHref: queue.matchId ? `/goat-arena/matches/${queue.matchId}` : null,
    });
  } catch (error) {
    return next(error);
  }
};

exports.friendStatus = async (req, res, next) => {
  try {
    const friends = await getArenaFriendData({ userId: userId(req) });
    res.set("Cache-Control", "no-store");
    return res.json({
      friends: friends.friends,
      incomingCount: friends.receivedRequests.length + friends.receivedInvites.length,
      activeMatch: await activeMatchForUser(userId(req)),
    });
  } catch (error) {
    return next(error);
  }
};

exports.apiJoinMatchmaking = async (req, res, next) => {
  try {
    const result = await joinArenaV2Queue({
      userId: req.apiUser._id,
      mode: req.params.mode,
    });
    res.set("Cache-Control", "no-store");
    return res.json({
      matchmaking: {
        status: result.match ? "MATCHED" : result.entry?.status || "WAITING",
        mode: result.entry?.mode || String(req.params.mode || "").toUpperCase(),
        queueId: result.entry?._id ? String(result.entry._id) : null,
        allowedRatingGap: result.allowedRatingGap,
      },
      match: result.match
        ? { id: String(result.match._id), status: result.match.status }
        : null,
    });
  } catch (error) {
    return next(error);
  }
};

exports.apiAcknowledgeCompetitiveSolutionSharing = async (req, res, next) => {
  try {
    const consent = await acknowledgeCompetitiveSolutionSharing({
      userId: req.apiUser._id,
      accepted: req.body.accepted === true,
    });
    res.set("Cache-Control", "no-store");
    return res.json({ consent });
  } catch (error) {
    return next(error);
  }
};

exports.apiCompetitiveResult = async (req, res, next) => {
  try {
    const result = await getAsyncCompetitiveResult({
      matchId: req.params.matchId,
      userId: req.apiUser._id,
    });
    const withApiEvidenceLinks = (competitor) => ({
      ...competitor,
      solutions: competitor.solutions.map((file) => ({
        ...file,
        href: nativeArenaEvidenceHref({ matchId: req.params.matchId, mode: "competitive", side: file.side, fileIndex: file.fileIndex }),
      })),
    });
    res.set("Cache-Control", "no-store");
    return res.json({
      result: {
        ...result,
        challenger: withApiEvidenceLinks(result.challenger),
        historicalOpponent: withApiEvidenceLinks(result.historicalOpponent),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.apiCompetitiveEvidenceFile = async (req, res, next) => {
  try {
    const file = await getAsyncCompetitiveEvidenceFile({
      matchId: req.params.matchId,
      userId: req.apiUser._id,
      side: req.params.side,
      fileIndex: req.params.fileIndex,
    });
    res.set("Cache-Control", "no-store");
    return res.redirect(302, file.url);
  } catch (error) {
    return next(error);
  }
};

exports.apiNormalResult = async (req, res, next) => {
  try {
    const result = await getAsyncNormalResult({
      matchId: req.params.matchId,
      userId: req.apiUser._id,
    });
    const withApiEvidenceLinks = (competitor, side) => competitor
      ? {
          ...competitor,
          solutions: competitor.solutions.map((file) => ({
            ...file,
            side,
            fileIndex: Number(file.fileIndex || file.index),
            href: nativeArenaEvidenceHref({ matchId: req.params.matchId, mode: "normal", side, fileIndex: Number(file.fileIndex || file.index) }),
          })),
        }
      : null;
    res.set("Cache-Control", "no-store");
    return res.json({
      result: {
        ...result,
        challenger: withApiEvidenceLinks(result.challenger, "challenger"),
        historicalOpponent: withApiEvidenceLinks(
          result.historicalOpponent,
          "historical"
        ),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.apiNormalEvidenceFile = async (req, res, next) => {
  try {
    const file = await getAsyncNormalEvidenceFile({
      matchId: req.params.matchId,
      userId: req.apiUser._id,
      side: req.params.side,
      fileIndex: req.params.fileIndex,
    });
    res.set("Cache-Control", "no-store");
    return res.redirect(302, file.url);
  } catch (error) {
    return next(error);
  }
};

exports.apiCancelMatchmaking = async (req, res, next) => {
  try {
    const entry = await cancelArenaV2Queue({ userId: req.apiUser._id });
    res.set("Cache-Control", "no-store");
    return res.json({ matchmaking: { id: String(entry._id), status: entry.status } });
  } catch (error) {
    return next(error);
  }
};

exports.apiMatchmakingStatus = async (req, res, next) => {
  try {
    const entry = await getArenaV2QueueState({ userId: req.apiUser._id });
    res.set("Cache-Control", "no-store");
    return res.json({
      matchmaking: {
        status: entry?.status || "IDLE",
        mode: entry?.mode || null,
        queueId: entry?._id ? String(entry._id) : null,
      },
      match: entry?.matchId ? { id: String(entry.matchId) } : null,
    });
  } catch (error) {
    return next(error);
  }
};

exports.apiFriends = async (req, res, next) => {
  try {
    const friends = await getArenaFriendData({
      userId: req.apiUser._id,
      query: req.query.q || "",
    });
    res.set("Cache-Control", "no-store");
    return res.json({ friends });
  } catch (error) {
    return next(error);
  }
};

exports.apiSendFriendRequest = async (req, res, next) => {
  try {
    const request = await sendArenaFriendRequest({
      requesterUserId: req.apiUser._id,
      recipientUserId: req.body.recipientUserId,
    });
    return res.status(201).json({ request });
  } catch (error) {
    return next(error);
  }
};

exports.apiRespondFriendRequest = async (req, res, next) => {
  try {
    const result = await respondArenaFriendRequest({
      requestId: req.params.requestId,
      userId: req.apiUser._id,
      response: req.body.response,
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

exports.apiCreateFriendlyInvitation = async (req, res, next) => {
  try {
    const invitation = await createArenaFriendlyInvitation({
      inviterUserId: req.apiUser._id,
      inviteeUserId: req.body.inviteeUserId,
      requestId: req.arenaNativeIdempotencyKey || req.body.requestId,
    });
    return res.status(201).json({ invitation });
  } catch (error) {
    return next(error);
  }
};

exports.apiRespondFriendlyInvitation = async (req, res, next) => {
  try {
    const result = await respondArenaFriendlyInvitation({
      invitationId: req.params.invitationId,
      userId: req.apiUser._id,
      response: req.body.response,
    });
    return res.json({
      invitation: result.invitation,
      match: result.match ? { id: String(result.match._id), status: result.match.status } : null,
    });
  } catch (error) {
    return next(error);
  }
};

exports.apiCancelFriendlyInvitation = async (req, res, next) => {
  try {
    const invitation = await cancelArenaFriendlyInvitation({
      invitationId: req.params.invitationId,
      userId: req.apiUser._id,
    });
    return res.json({ invitation });
  } catch (error) {
    return next(error);
  }
};

exports.finalizePlacement = pageAction(async (req) => {
  await finalizeArenaV2Placement(userId(req));
  return {};
});

exports.sendFriendRequest = pageAction(
  (req) =>
    sendArenaFriendRequest({
      requesterUserId: userId(req),
      recipientUserId: req.body.recipientUserId,
    }),
  "/goat-arena/friends"
);

exports.respondFriendRequest = pageAction(
  (req) =>
    respondArenaFriendRequest({
      requestId: req.params.requestId,
      userId: userId(req),
      response: req.body.response,
    }),
  "/goat-arena/friends"
);

exports.createFriendlyInvitation = pageAction(
  (req) =>
    createArenaFriendlyInvitation({
      inviterUserId: userId(req),
      inviteeUserId: req.body.inviteeUserId,
      requestId: req.body.requestId,
    }),
  "/goat-arena/friends"
);

exports.respondFriendlyInvitation = pageAction(
  (req) =>
    respondArenaFriendlyInvitation({
      invitationId: req.params.invitationId,
      userId: userId(req),
      response: req.body.response,
    }),
  "/goat-arena/friends"
);

exports.cancelFriendlyInvitation = pageAction(
  (req) =>
    cancelArenaFriendlyInvitation({
      invitationId: req.params.invitationId,
      userId: userId(req),
    }),
  "/goat-arena/friends"
);

// Canonical routes and aliases share the same durable native command boundary.
const { arenaNativeMutation } = require("../middleware/arenaNativeMutation");
for (const operation of ["apiForfeitMatch", "apiJoinMatchmaking", "apiAcknowledgeCompetitiveSolutionSharing", "apiSendFriendRequest", "apiRespondFriendRequest", "apiCreateFriendlyInvitation", "apiRespondFriendlyInvitation", "apiCancelFriendlyInvitation"]) {
  exports[operation] = arenaNativeMutation(operation, exports[operation]);
}
