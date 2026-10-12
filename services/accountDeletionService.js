const mongoose = require("mongoose");
const { enqueueArenaAssetDeletion, processArenaAssetDeletionTasks } = require("./arenaAssetDeletionService");
const { ArenaNotificationEmailDelivery, ArenaNativeCommandReceipt } = require("../models/arenaDeliveryModel");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const path = require("node:path");
const {
  AdminActionLog,
  ArchiveItem,
  AssessmentAttempt,
  CoachMessageSuggestion,
  CoachSuggestionQuota,
  CommunityComment,
  CommunityPost,
  CommunityPostingQuota,
  CommunityReport,
  CommunityUserBlock,
  CommunityVote,
  ConceptProgress,
  DailyPlan,
  LearningEvent,
  NicknameChangeRequest,
  PasswordResetCode,
  PrivateMockExamAttempt,
  PrivateMockExamEvent,
  PrivateMockIntegrityCase,
  PrivateMockObjection,
  PrivateMockWeeklyResult,
  ProblemAttempt,
  QuickPracticeAttempt,
  RankingProfile,
  SupportInquiry,
  SupportInquirySubmissionGuard,
  User,
  UserNotification,
  AdminTodo,
} = require("../models/matthsModel");
const {
  ArenaAccessState,
  ArenaIntegrityLinkSignal,
  ArenaIntegrityRiskCase,
  ArenaIntegrityRiskProfile,
  ArenaGuestChallenge,
  ArenaGuestChallengeAttempt,
  ArenaGuestIdentity,
  ArenaGuestSolutionBoard,
  ArenaCompetitiveProfile,
  ArenaCompetitiveRecord,
  ArenaFriendRequest,
  ArenaFriendship,
  ArenaFriendlyInvitationV2,
  ArenaMatchmakingEntry,
  ArenaNormalBaselineAssignment,
  ArenaPlacementAttemptAdjustment,
  ArenaRatingSettlement,
  ArenaWeeklyMockRatingSettlement,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchAttemptEvent,
  ArenaMatchEvidence,
  ArenaInlineSolutionBoard,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
  AppleCommerceAccountToken,
  ArenaPackagePayment,
  ArenaProblemPack,
} = require("../models/goatArenaModel");
const { OperationalMetricEvent } = require("../models/operationModel");
const { PdfWatermarkIssuance } = require("../models/documentSecurityModel");
const {
  ParentAlertDelivery,
  ParentNotification,
  ParentAccount,
  ParentChildLink,
  ParentInvite,
  CheckoutIntent,
} = require("../models/parentModel");
const MobileAuthGrant = require("../models/mobileAuthGrantModel");
const NativeSocialRegistrationTicket = require(
  "../models/nativeSocialRegistrationTicketModel"
);
const {
  discardCommunityUploads,
} = require("./communityAttachmentService");
const {
  destroyStoredAsset,
} = require("./fileStorageService");
const {
  releaseNickname,
} = require("./nicknameNamespaceService");
const {
  ARENA_EVIDENCE_STORAGE_DIR,
} = require("../middleware/arenaEvidenceUpload");

const {
  revokeAppleTokens,
  forgetAppleCredential,
} = require("./appleAuthService");

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeRetentionChoice(value) {
  return [
    true,
    "true",
    "1",
    "on",
    "anonymous",
  ].includes(value);
}

function buildAnonymousAccountUpdate({
  user,
  initiatedBy,
  retainAnonymousData,
  now = new Date(),
}) {
  const userId = String(
    user?._id || ""
  );
  const anonymousEmail =
    `withdrawn.${userId}@anonymous.invalid`;
  const broadRegion =
    String(
      user?.school?.region || ""
    ).trim() || "지역 미상";

  return {
    $set: {
      name: "탈퇴회원",
      realName: "",
      email: anonymousEmail,
      passwordHash:
        crypto
          .randomBytes(48)
          .toString("base64url"),
      role: "student",
      "preferences.rankingDisplayMode":
        "nickname",
      "preferences.profileAvatarMode":
        "PRESET",
      termsAcceptedAt: null,
      termsVersion: "",
      privacyVersion: "",
      isActive: false,
      accountStatus: "withdrawn",
      accountStatusReason:
        "개인정보 제거 및 탈퇴 처리 완료",
      suspendedUntil: null,
      accountStatusChangedAt: now,
      tokenVersion:
        (Number(user?.tokenVersion) ||
          0) + 1,
      school: {
        region: broadRegion,
        code: "ANONYMIZED",
        name: "익명 처리",
        roadAddress: "",
        establishment: "",
        highSchoolType: "",
      },
      learnerType: "RETAKER",
      university: {
        code: "",
        name: "",
      },
      educationStatus:
        "graduated",
      identityVerificationStatus:
        "unverified",
      "withdrawal.anonymizedAt": now,
      "withdrawal.initiatedBy":
        initiatedBy,
      "withdrawal.dataRetention":
        retainAnonymousData
          ? "anonymous"
          : "purged",
    },
    $unset: {
      nameNormalized: 1,
      communityAnonymousNumber: 1,
      birthDate: 1,
      identityMatchHash: 1,
      identityMatchVersion: 1,
      identityDuplicateAlertedAt: 1,
      "preferences.profileAvatarAsset": 1,
    },
  };
}

async function removePrivateAccountData(
  userId
) {
  const childLinks = await ParentChildLink.find({ childUserId: userId })
    .select("_id parentAccountId")
    .lean();
  const parentIds = [...new Set(
    childLinks.map((link) => String(link.parentAccountId))
  )];
  const legacyParents = await ParentAccount.find({ childUserId: userId })
    .select("_id childUserId")
    .lean();
  for (const parent of legacyParents) {
    if (!parentIds.includes(String(parent._id))) parentIds.push(String(parent._id));
  }
  await Promise.all([
    ParentNotification.deleteMany({ childUserId: userId }),
    ParentAlertDelivery.deleteMany({
      $or: [
        { childUserId: userId },
        { parentChildLinkId: { $in: childLinks.map((link) => link._id) } },
      ],
    }),
    ParentChildLink.deleteMany({ childUserId: userId }),
  ]);
  for (const parentId of parentIds) {
    const parent = await ParentAccount.findById(parentId).select("childUserId");
    if (!parent || String(parent.childUserId) !== String(userId)) continue;
    const replacement = await ParentChildLink.findOne({
      parentAccountId: parent._id,
      status: "ACTIVE",
    }).sort({ linkedAt: 1, _id: 1 }).lean();
    if (replacement) {
      parent.childUserId = replacement.childUserId;
      await parent.save();
    } else {
      await Promise.all([
        ParentAccount.deleteOne({ _id: parent._id }),
        ParentAlertDelivery.deleteMany({ parentAccountId: parent._id }),
        ParentNotification.deleteMany({ parentAccountId: parent._id }),
        CheckoutIntent.deleteMany({ parentAccountId: parent._id }),
      ]);
    }
  }

  await Promise.all([
    ArenaNotificationEmailDelivery.deleteMany({ userId }),
    ArenaNativeCommandReceipt.deleteMany({ userId }),
    MobileAuthGrant.deleteMany({ userId }),
    NativeSocialRegistrationTicket.deleteMany({
      $or: [
        { userId },
        { existingUserId: userId },
      ],
    }),
    PasswordResetCode.deleteMany({
      userId,
    }),
    UserNotification.deleteMany({
      userId,
    }),
    // Financial ownership tokens contain only the opaque account id and token.
    // Preserve them with payment history so a withdrawn account's purchases
    // cannot later be attached to a newly registered account.
    NicknameChangeRequest.deleteMany({
      $or: [
        { userId },
        { requestedBy: userId },
      ],
    }),
    /*
     * 문의에는 이메일과 자유 서술식 개인정보가 포함될 수 있어
     * 학습 데이터 보존 여부와 관계없이 제거한다.
     */
    SupportInquiry.deleteMany({
      userId,
    }),
    PrivateMockIntegrityCase.deleteMany({ userId }),
    PrivateMockObjection.deleteMany({ userId }),
    CommunityReport.deleteMany({
      $or: [{ reporterUserId: userId }, { reportedUserId: userId }],
    }),
    CommunityUserBlock.deleteMany({
      $or: [{ blockerUserId: userId }, { blockedUserId: userId }],
    }),
    ParentInvite.deleteMany({ childUserId: userId }),
    CheckoutIntent.deleteMany({ studentUserId: userId }),
    /*
     * 작업의 종류와 시각은 감사용으로 남기되, 자유 입력 사유나 부가정보에
     * 식별정보가 섞였을 가능성이 있어 내용을 비식별화한다.
     */
    AdminActionLog.updateMany(
      {
        targetUserId: userId,
      },
      [
        {
          $set: {
            detail:
              "탈퇴 계정 관련 관리자 작업 기록",
            metadata: {
              anonymized: true,
              actorSnapshot:
                "$metadata.actorSnapshot",
            },
          },
        },
      ],
      { updatePipeline: true }
    ),
  ]);
}

async function destroyArenaEvidenceAsset(file) {
  if (!file) return;
  if (
    file.storageProvider === "CLOUDINARY" ||
    file.storageProvider === "R2"
  ) {
    await destroyStoredAsset(file).catch(() => {});
    return;
  }
  const storedName = path.basename(String(file.storedName || ""));
  if (!storedName) return;
  const absolutePath = path.resolve(ARENA_EVIDENCE_STORAGE_DIR, storedName);
  if (path.dirname(absolutePath) !== ARENA_EVIDENCE_STORAGE_DIR) return;
  await destroyStoredAsset({ ...file, path: absolutePath }).catch(() => {});
}

async function removeUserUploadedFiles(userId) {
  const [posts, evidence, archiveItems, profileUser] = await Promise.all([
    CommunityPost.find({ authorId: userId }).select("attachments").lean(),
    ArenaMatchEvidence.find({ userId }).select("files supplementalRequest.files").lean(),
    ArchiveItem.find({ uploadedBy: userId })
      .select("storedName storageProvider cloudPublicId cloudResourceType cloudDeliveryType r2ObjectKey r2Sha256 r2ETag")
      .lean(),
    User.findById(userId)
      .select("preferences.profileAvatarAsset")
      .lean(),
  ]);
  await discardCommunityUploads(posts.flatMap((post) => post.attachments || []));
  await Promise.all(
    evidence.flatMap((entry) => [
      ...(entry.files || []),
      ...(entry.supplementalRequest?.files || []),
    ]).map(destroyArenaEvidenceAsset)
  );
  await Promise.all(
    archiveItems.map(async (item) => {
      await destroyStoredAsset(item).catch(() => {});
    })
  );
  if (profileUser?.preferences?.profileAvatarAsset?.cloudPublicId) {
    await destroyStoredAsset(
      profileUser.preferences.profileAvatarAsset
    ).catch(() => {});
  }
  await Promise.all([
    CommunityPost.updateMany({ authorId: userId }, { $set: { attachments: [] } }),
    ArenaMatchEvidence.deleteMany({ userId }),
    ArchiveItem.deleteMany({ uploadedBy: userId }),
    User.updateOne(
      { _id: userId },
      {
        $set: { "preferences.profileAvatarMode": "PRESET" },
        $unset: { "preferences.profileAvatarAsset": 1 },
      }
    ),
  ]);
}

function anonymizedGuestNicknameKey() {
  return `withdrawn-${crypto.randomBytes(10).toString("hex")}`;
}

function guestStoredAssetKey(file) {
  const provider = String(file?.storageProvider || "");
  const remoteKey = String(file?.cloudPublicId || file?.r2ObjectKey || "");
  const storedName = String(file?.storedName || "");
  return [provider, remoteKey, storedName].join(":");
}

async function removeArenaGuestAccountData(userId, { now = new Date() } = {}) {
  const identities = await ArenaGuestIdentity.find({ claimedByUserId: userId })
    .select("_id")
    .lean();
  const identityIds = identities.map((identity) => identity._id);
  const attempts = await ArenaGuestChallengeAttempt.find({
    $or: [
      { claimedByUserId: userId },
      ...(identityIds.length ? [{ guestIdentityId: { $in: identityIds } }] : []),
    ],
  })
    .select("_id evidenceFiles")
    .lean();
  const attemptIds = attempts.map((attempt) => attempt._id);
  const boards = attemptIds.length || identityIds.length
    ? await ArenaGuestSolutionBoard.find({
        $or: [
          ...(attemptIds.length ? [{ attemptId: { $in: attemptIds } }] : []),
          ...(identityIds.length ? [{ guestIdentityId: { $in: identityIds } }] : []),
        ],
      })
        .select("file")
        .lean()
    : [];

  // A finalized mobile board and the attempt evidence can point at the same
  // object. Destroy each stored object once before removing its metadata.
  const assets = new Map();
  for (const file of [
    ...attempts.flatMap((attempt) => attempt.evidenceFiles || []),
    ...boards.map((board) => board.file).filter(Boolean),
  ]) {
    const key = guestStoredAssetKey(file);
    if (key !== "::" && !assets.has(key)) assets.set(key, file);
  }
  await Promise.all(
    [...assets.values()].map(destroyArenaEvidenceAsset)
  );

  if (attemptIds.length) {
    await Promise.all([
      ArenaGuestChallengeAttempt.updateMany(
        { _id: { $in: attemptIds } },
        {
          $set: {
            claimedByUserId: null,
            answers: [],
            questionTimings: [],
            evidenceFiles: [],
            evidenceSubmittedAt: null,
          },
        }
      ),
      ArenaGuestChallengeAttempt.updateMany(
        {
          _id: { $in: attemptIds },
          status: { $in: ["READY", "IN_PROGRESS", "EVIDENCE_REQUIRED"] },
        },
        { $set: { status: "ABANDONED" } }
      ),
      ArenaGuestSolutionBoard.deleteMany({
        $or: [
          { attemptId: { $in: attemptIds } },
          ...(identityIds.length ? [{ guestIdentityId: { $in: identityIds } }] : []),
        ],
      }),
    ]);
  } else if (identityIds.length) {
    await ArenaGuestSolutionBoard.deleteMany({ guestIdentityId: { $in: identityIds } });
  }

  for (const identity of identities) {
    // birthDateHash is immutable during normal product writes. Account erasure
    // is the deliberate exception, so use the native collection update to
    // remove it and invalidate any restorable guest proof.
    await ArenaGuestIdentity.collection.updateOne(
      { _id: identity._id, claimedByUserId: userId },
      {
        $set: {
          nickname: "탈퇴 참가자",
          nicknameNormalized: anonymizedGuestNicknameKey(),
          claimSecretHash: crypto.randomBytes(32).toString("hex"),
          claimedAt: null,
          anonymizedAt: now,
          lastSeenAt: null,
          updatedAt: now,
        },
        $unset: {
          claimedByUserId: "",
          birthDateHash: "",
          canonicalSchoolSnapshot: "",
        },
      }
    );
  }

  // A creator withdrawal must revoke account ownership without deleting the
  // shared challenge, leaderboard, or another participant's record.
  await ArenaGuestChallenge.updateMany(
    { creatorUserId: userId },
    {
      $set: {
        creatorUserId: null,
        creatorAnonymizedAt: now,
      },
    }
  );

  return {
    identityCount: identities.length,
    attemptCount: attempts.length,
    boardCount: boards.length,
  };
}

async function releaseUserNicknameReservation(user) {
  return releaseNickname({
    nickname: user?.name,
    nicknameNormalized: user?.nameNormalized,
    ownerKind: "USER",
    ownerId: user?._id,
  });
}

async function anonymizePublicActivity(
  userId
) {
  await Promise.all([
    OperationalMetricEvent.updateMany(
      { userId },
      { $set: { userId: null, metadata: { anonymized: true } } }
    ),
    RankingProfile.updateMany(
      { userId },
      {
        $set: {
          datasetOnly: true,
          overallRank: null,
        },
      }
    ),
    CoachMessageSuggestion.updateMany(
      { userId },
      {
        $set: {
          authorName: "탈퇴회원",
        },
      }
    ),
    CommunityPost.updateMany(
      { authorId: userId },
      {
        $set: {
          authorName: "탈퇴회원",
          isAnonymous: true,
          anonymousNumber: "",
          schoolCode: "",
          schoolName: "",
          // Keep only a tombstone for existing references, never the author's
          // free text or attachment metadata. Files are removed before this call.
          title: "삭제된 게시글",
          content: "작성자가 탈퇴하여 삭제된 게시글입니다.",
          attachments: [],
          moderationReason: "",
          status: "hidden",
        },
      }
    ),
    CommunityComment.updateMany(
      { authorId: userId },
      {
        $set: {
          authorName: "탈퇴회원",
          isAnonymous: true,
          anonymousNumber: "",
          content: "작성자가 탈퇴하여 삭제된 댓글입니다.",
          moderationReason: "",
          status: "hidden",
        },
      }
    ),
  ]);
}

async function purgeUserOwnedData(
  userId
) {
  const [ownedPosts, ownedPostIds] = await Promise.all([
    CommunityPost.find({ authorId: userId }).select("attachments").lean(),
    CommunityPost.distinct("_id", { authorId: userId }),
  ]);
  const postCascadeFilter =
    ownedPostIds.length
      ? {
          postId: {
            $in: ownedPostIds,
          },
        }
      : null;

  await Promise.all([
    AppleCommerceAccountToken.deleteMany({ userId }),
    ConceptProgress.deleteMany({
      userId,
    }),
    ProblemAttempt.deleteMany({
      userId,
    }),
    AssessmentAttempt.deleteMany({
      userId,
    }),
    LearningEvent.deleteMany({
      userId,
    }),
    DailyPlan.deleteMany({
      userId,
    }),
    QuickPracticeAttempt.deleteMany({
      userId,
    }),
    PrivateMockExamAttempt.deleteMany({
      userId,
    }),
    PrivateMockExamEvent.deleteMany({ userId }),
    PrivateMockIntegrityCase.deleteMany({ userId }),
    PrivateMockObjection.deleteMany({ userId }),
    PrivateMockWeeklyResult.deleteMany({
      userId,
    }),
    RankingProfile.deleteMany({
      userId,
    }),
    CoachMessageSuggestion.deleteMany({
      userId,
    }),
    CoachSuggestionQuota.deleteMany({
      userId,
    }),
    SupportInquirySubmissionGuard.deleteMany({
      userId,
    }),
    CommunityPost.deleteMany({
      authorId: userId,
    }),
    CommunityComment.deleteMany(
      postCascadeFilter
        ? {
            $or: [
              { authorId: userId },
              postCascadeFilter,
            ],
          }
        : {
            authorId: userId,
          }
    ),
    CommunityVote.deleteMany(
      postCascadeFilter
        ? {
            $or: [
              { userId },
              postCascadeFilter,
            ],
          }
        : {
            userId,
        }
    ),
    CommunityPostingQuota.deleteMany({ userId }),
    CommunityReport.deleteMany(
      postCascadeFilter
        ? {
            $or: [
              { reporterUserId: userId },
              { reportedUserId: userId },
              postCascadeFilter,
            ],
          }
        : {
            $or: [
              { reporterUserId: userId },
              { reportedUserId: userId },
            ],
          }
    ),
    CommunityUserBlock.deleteMany({
      $or: [{ blockerUserId: userId }, { blockedUserId: userId }],
    }),
    AdminTodo.deleteMany({
      $or: [{ targetUserId: userId }, { actorUserId: userId }],
    }),
    OperationalMetricEvent.deleteMany({ userId }),
    PdfWatermarkIssuance.deleteMany({ userId }),
  ]);

  await discardCommunityUploads(
    ownedPosts.flatMap((post) => post.attachments || [])
  );

  await purgeArenaUserData(userId);
}

async function purgeArenaUserDataWithinSession(userId, session) {
  // A historical opponent is a reference, not a second live participant. Keep
  // another challenger's match and the immutable source graph it depends on.
  const foreignReferences = await ArenaMatch.find({
    "challenger.userId": { $ne: userId },
    $or: [
      { "normalAsync.historicalOwnerUserId": userId },
      { "competitiveAsync.historicalOwnerUserId": userId },
    ],
  }).select("normalAsync.historicalRecordId competitiveAsync.historicalRecordId").session(session).lean();
  const protectedRecordIds = foreignReferences.flatMap((match) => [
    match.normalAsync?.historicalRecordId, match.competitiveAsync?.historicalRecordId,
  ]).filter(Boolean);
  const protectedRecords = await ArenaCompetitiveRecord.find({ _id: { $in: protectedRecordIds } })
    .select("sourceMatchId sourceEvidenceId sourceProblemPackId").session(session).lean();
  const ownedSourceMatches = await ArenaMatch.find({ "challenger.userId": userId }).select("_id").session(session).lean();
  const ownedSourceMatchIds = ownedSourceMatches.map((match) => match._id);
  const guestReferences = await ArenaGuestChallenge.find({ sourceMatchId: { $in: ownedSourceMatchIds } })
    .select("sourceMatchId sourceEvidenceId sourceProblemPackId").session(session).lean();
  const retainedSources = [...protectedRecords, ...guestReferences];
  const protectedMatchIds = retainedSources.map((source) => source.sourceMatchId).filter(Boolean);
  const protectedEvidenceIds = retainedSources.map((source) => source.sourceEvidenceId).filter(Boolean);
  const matches = await ArenaMatch.find({
    _id: { $nin: protectedMatchIds },
    $or: [
      { requestInitiatorUserId: userId },
      { "challenger.userId": userId },
      { "defender.userId": userId },
    ],
  }).select("_id problemPackId challenger.userId normalAsync.enabled competitiveAsync.enabled").session(session).lean();
  const deletableMatches = matches.filter((match) =>
    !(match.normalAsync?.enabled || match.competitiveAsync?.enabled) ||
    String(match.challenger?.userId) === String(userId));
  const matchIds = deletableMatches.map((entry) => entry._id);
  const problemPackIds = deletableMatches.map((entry) => entry.problemPackId).filter(Boolean);
  const protectedPackReferences = problemPackIds.length
    ? await ArenaGuestChallenge.find({ sourceProblemPackId: { $in: problemPackIds } })
        .select("sourceProblemPackId").session(session).lean()
    : [];
  const protectedProblemPackIds = protectedPackReferences.map((reference) => reference.sourceProblemPackId);
  const protectedProblemPackIdSet = new Set(
    [...protectedProblemPackIds, ...retainedSources.map((source) => source.sourceProblemPackId)].map(String)
  );
  const deletableProblemPackIds = problemPackIds.filter(
    (problemPackId) => !protectedProblemPackIdSet.has(String(problemPackId))
  );
  const aggregateIds = [...matchIds];
  const attempts = await ArenaMatchAttempt.find({
    matchId: { $nin: protectedMatchIds },
    $or: [{ userId }, ...(matchIds.length ? [{ matchId: { $in: matchIds } }] : [])],
  }).select("_id").session(session).lean();
  const attemptIds = attempts.map((entry) => entry._id);
  const evidence = await ArenaMatchEvidence.find({
    _id: { $nin: protectedEvidenceIds },
    matchId: { $nin: protectedMatchIds },
    $or: [{ userId }, ...(matchIds.length ? [{ matchId: { $in: matchIds } }] : [])],
  }).select("_id files supplementalRequest.files").session(session).lean();
  const evidenceIds = evidence.map((entry) => entry._id);
  const boards = await ArenaInlineSolutionBoard.find({ userId }).select("matchId file").session(session).lean();
  const protectedMatches = new Set(protectedMatchIds.map(String));
  const files = [
    ...evidence.flatMap((entry) => [...(entry.files || []), ...(entry.supplementalRequest?.files || [])]),
    ...boards.filter((board) => !protectedMatches.has(String(board.matchId))).map((board) => board.file),
  ];
  for (const file of files) await enqueueArenaAssetDeletion({ asset: { ...file,
    path: path.join(ARENA_EVIDENCE_STORAGE_DIR, path.basename(file.storedName || "")) }, referenceKey: `ACCOUNT_PURGE:${userId}`, session });

  const outboxAggregateIds = [
    ...aggregateIds,
    ...attemptIds,
    ...evidenceIds,
  ];

  const mutations = [
    ArenaPackagePayment.updateMany({ userId }, { $set: { accountDeletedAt: new Date() } }),
    ArenaInlineSolutionBoard.deleteMany({ userId }),
    ArenaCompetitiveProfile.deleteMany({ userId }),
    ArenaMatchmakingEntry.deleteMany({ userId }),
    ArenaPlacementAttemptAdjustment.deleteMany({ userId }),
    ArenaCompetitiveRecord.deleteMany({
      _id: { $nin: protectedRecordIds },
      $or: [
        { ownerUserId: userId },
        ...(matchIds.length ? [{ sourceMatchId: { $in: matchIds } }] : []),
      ],
    }),
    ArenaNormalBaselineAssignment.deleteMany({
      $or: [
        { challengerUserId: userId },
        ...(matchIds.length ? [{ matchId: { $in: matchIds } }] : []),
      ],
    }),
    ArenaRatingSettlement.deleteMany({
      matchId: { $in: matchIds },
    }),
    ArenaWeeklyMockRatingSettlement.deleteMany({ userId }),
    ArenaFriendRequest.deleteMany({
      $or: [{ requesterUserId: userId }, { recipientUserId: userId }],
    }),
    ArenaFriendship.deleteMany({
      $or: [{ userLowId: userId }, { userHighId: userId }],
    }),
    ArenaFriendlyInvitationV2.deleteMany({
      $or: [{ inviterUserId: userId }, { inviteeUserId: userId }],
    }),
    ArenaAccessState.deleteMany({ userId }),
    ArenaIntegrityLinkSignal.deleteMany({ userId }),
    ArenaIntegrityRiskProfile.deleteMany({ userId }),
    ArenaIntegrityRiskProfile.updateMany(
      { linkedUserIds: userId },
      { $pull: { linkedUserIds: userId } }
    ),
    ArenaIntegrityRiskCase.deleteMany({ userId }),
    ArenaIntegrityRiskCase.updateMany(
      { linkedUserIds: userId },
      { $pull: { linkedUserIds: userId } }
    ),
    ArenaMatchAttempt.deleteMany({
      matchId: { $nin: protectedMatchIds },
      $or: [{ userId }, ...(matchIds.length ? [{ matchId: { $in: matchIds } }] : [])],
    }),
    ArenaMatchAttemptEvent.deleteMany({
      $or: [{ userId }, ...(attemptIds.length ? [{ attemptId: { $in: attemptIds } }] : [])],
    }),
    ArenaMatchEvidence.deleteMany({
      _id: { $nin: protectedEvidenceIds },
      matchId: { $nin: protectedMatchIds },
      $or: [{ userId }, ...(matchIds.length ? [{ matchId: { $in: matchIds } }] : [])],
    }),
    ArenaMatchParticipantLock.deleteMany({
      $or: [{ userId }, ...(matchIds.length ? [{ matchId: { $in: matchIds } }] : [])],
    }),
    ArenaMatch.deleteMany({ _id: { $in: matchIds } }),
    ArenaProblemPack.deleteMany({ _id: { $in: deletableProblemPackIds } }),
    ArenaOutboxEvent.deleteMany(
      outboxAggregateIds.length
        ? { aggregateId: { $in: outboxAggregateIds } }
        : { _id: null }
    ),
  ];
  for (const mutation of mutations) await mutation.session(session);

}

async function purgeArenaUserData(userId) {
  const session = await mongoose.startSession();
  try { await session.withTransaction(() => purgeArenaUserDataWithinSession(userId, session)); }
  finally { await session.endSession(); }
  // Durable jobs were committed before the source metadata was removed.
  await processArenaAssetDeletionTasks({ referenceKey: `ACCOUNT_PURGE:${userId}` });
}

async function withdrawUserAccount({
  userId,
  initiatedBy,
  retainAnonymousData,
}) {
  const user =
    await User.findById(userId)
      .select(
        "+passwordHash role school tokenVersion accountStatus name nameNormalized"
      );

  if (!user) {
    throw statusError(
      404,
      "탈퇴할 계정을 찾을 수 없습니다."
    );
  }

  if (user.role === "admin") {
    throw statusError(
      400,
      "관리자 계정은 관리자 역할을 해제한 뒤 탈퇴할 수 있습니다."
    );
  }

  if (
    user.accountStatus === "withdrawn"
  ) {
    // 익명 보존 탈퇴 뒤에도 운영자가 동일 계정을 다시 열어 남은
    // 익명 활동 데이터까지 완전히 삭제할 수 있다.
    if (!retainAnonymousData) {
      await removePrivateAccountData(user._id);
      await removeUserUploadedFiles(user._id);
      await removeArenaGuestAccountData(user._id);
      await releaseUserNicknameReservation(user);
      await purgeUserOwnedData(user._id);
      // 애플 자격 증명을 남기면 유니크 인덱스가 같은 애플 ID 의 재가입을 막는다.
      await forgetAppleCredential(user._id);
      await User.deleteOne({ _id: user._id });
      return {
        user: { _id: user._id },
        dataRetention: "purged",
      };
    }
    throw statusError(
      409,
      "이미 탈퇴 처리된 계정입니다."
    );
  }

  const keepAnonymousData =
    Boolean(retainAnonymousData);

  /*
   * 애플 토큰 폐기. **심사 요구사항 5.1.1(v)** 이다 — Sign in with Apple 로 가입한
   * 계정을 지울 때 애플 쪽 토큰도 함께 폐기해야 한다. 하지 않으면 반려된다.
   *
   * 삭제보다 **먼저** 부른다. 자격 증명이 지워진 뒤에는 폐기에 쓸 refresh_token 이
   * 없다. 실패해도 탈퇴는 계속한다 — 사용자의 탈퇴 권리가 외부 API 가용성에
   * 매이면 안 된다. 실패 사유는 revokeAppleTokens 가 로그로 남긴다.
   */
  await revokeAppleTokens(user._id).catch((error) => {
    console.warn(
      `[account-deletion] 애플 토큰 폐기 실패 user=${user._id}: ${error?.message || error}`
    );
  });

  await removePrivateAccountData(
    user._id
  );
  await removeUserUploadedFiles(user._id);
  await removeArenaGuestAccountData(user._id);
  await releaseUserNicknameReservation(user);

  if (keepAnonymousData) {
    await anonymizePublicActivity(
      user._id
    );
  } else {
    await purgeUserOwnedData(
      user._id
    );
    await forgetAppleCredential(user._id);
    await User.deleteOne({ _id: user._id });
    return {
      user: { _id: user._id },
      dataRetention: "purged",
    };
  }

  const update =
    buildAnonymousAccountUpdate({
      user,
      initiatedBy,
      retainAnonymousData:
        keepAnonymousData,
    });

  const anonymizedUser =
    await User.findByIdAndUpdate(
      user._id,
      update,
      {
        returnDocument: "after",
        runValidators: true,
      }
    );

  if (!anonymizedUser) {
    throw statusError(
      404,
      "탈퇴할 계정을 찾을 수 없습니다."
    );
  }

  return {
    user: anonymizedUser,
    dataRetention:
      keepAnonymousData
        ? "anonymous"
        : "purged",
  };
}

async function withdrawOwnAccount({
  userId,
  password,
  reauthenticated = false,
  confirmation,
  acknowledgeAnonymousRetention,
}) {
  if (
    String(confirmation || "").trim() !==
    "탈퇴"
  ) {
    throw statusError(
      400,
      "확인란에 ‘탈퇴’를 정확히 입력해주세요."
    );
  }

  if (
    !normalizeRetentionChoice(
      acknowledgeAnonymousRetention
    )
  ) {
    throw statusError(
      400,
      "익명 학습 데이터 보존 안내를 확인해주세요."
    );
  }

  const user =
    await User.findById(userId)
      .select(
        "+passwordHash role accountStatus"
      );

  if (!user) {
    throw statusError(
      404,
      "탈퇴할 계정을 찾을 수 없습니다."
    );
  }

  const passwordMatches = reauthenticated === true || (
    Boolean(password) &&
    await bcrypt.compare(
      String(password),
      String(user.passwordHash || "")
    )
  );

  if (!passwordMatches) {
    throw statusError(
      401,
      "현재 비밀번호가 올바르지 않습니다."
    );
  }

  return withdrawUserAccount({
    userId: user._id,
    initiatedBy: "self",
    retainAnonymousData: true,
  });
}

module.exports = {
  anonymizePublicActivity,
  buildAnonymousAccountUpdate,
  normalizeRetentionChoice,
  purgeUserOwnedData,
  purgeArenaUserData,
  removeArenaGuestAccountData,
  removePrivateAccountData,
  removeUserUploadedFiles,
  withdrawOwnAccount,
  withdrawUserAccount,
};
