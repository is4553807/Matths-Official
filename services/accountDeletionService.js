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
  AccessCycle,
  AccessCycleExpiryReminder,
  ArenaAccessState,
  ArenaIntegrityLinkSignal,
  ArenaIntegrityRiskCase,
  ArenaIntegrityRiskProfile,
  ArenaAchievementBadge,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchAttemptEvent,
  ArenaMatchEvidence,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
  ArenaOpponentSelectionAudit,
  ArenaPackagePayment,
  ArenaPaybackReview,
  ArenaProblemPack,
  ArenaRevengeRight,
  ArenaSnapshot,
  ArenaStanding,
  ArenaStandingChangeLedger,
  LiveFinalRankingProfile,
  MainInvitationOffer,
  MainInvitationRequest,
  MainShopEffect,
  MainShopPurchase,
  MainToSubConversionResult,
  MockExamSubscription,
  PolicyChangeDelivery,
  RenewalRankAssessment,
} = require("../models/goatArenaModel");
const { OperationalMetricEvent } = require("../models/operationModel");
const { PdfWatermarkIssuance } = require("../models/documentSecurityModel");
const {
  ParentAlertDelivery,
  ParentAccount,
  ParentChildLink,
  ParentInvite,
  CheckoutIntent,
} = require("../models/parentModel");
const { PaybackPayoutRecord } = require("../models/paybackModel");
const {
  discardCommunityUploads,
} = require("./communityAttachmentService");
const {
  destroyStoredAsset,
} = require("./fileStorageService");
const {
  ARENA_EVIDENCE_STORAGE_DIR,
} = require("../middleware/arenaEvidenceUpload");

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
      paybackAccount: 1,
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
        CheckoutIntent.deleteMany({ parentAccountId: parent._id }),
      ]);
    }
  }

  await Promise.all([
    PasswordResetCode.deleteMany({
      userId,
    }),
    UserNotification.deleteMany({
      userId,
    }),
    AccessCycleExpiryReminder.deleteMany({
      userId,
    }),
    PolicyChangeDelivery.deleteMany({
      userId,
    }),
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

async function removeUserUploadedFiles(userId) {
  const [posts, evidence, archiveItems] = await Promise.all([
    CommunityPost.find({ authorId: userId }).select("attachments").lean(),
    ArenaMatchEvidence.find({ userId }).select("files").lean(),
    ArchiveItem.find({ uploadedBy: userId })
      .select("storedName storageProvider cloudPublicId cloudResourceType cloudDeliveryType r2ObjectKey r2Sha256 r2ETag")
      .lean(),
  ]);
  await discardCommunityUploads(posts.flatMap((post) => post.attachments || []));
  await Promise.all(
    evidence.flatMap((entry) => entry.files || []).map(async (file) => {
      const storedName = path.basename(String(file?.storedName || ""));
      if (!storedName) return;
      const absolutePath = path.resolve(ARENA_EVIDENCE_STORAGE_DIR, storedName);
      if (path.dirname(absolutePath) !== ARENA_EVIDENCE_STORAGE_DIR) return;
      await destroyStoredAsset({ ...file, path: absolutePath }).catch(() => {});
    })
  );
  await Promise.all(
    archiveItems.map(async (item) => {
      await destroyStoredAsset(item).catch(() => {});
    })
  );
  await Promise.all([
    CommunityPost.updateMany({ authorId: userId }, { $set: { attachments: [] } }),
    ArenaMatchEvidence.deleteMany({ userId }),
    ArchiveItem.deleteMany({ uploadedBy: userId }),
  ]);
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
          /*
           * 자유 서술식 본문에는 작성자가 직접 적은 개인정보가 남아 있을
           * 수 있으므로 공개 화면에서는 내리고 DB에만 익명 자료로 보존한다.
           */
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
          status: "hidden",
        },
      }
    ),
    PaybackPayoutRecord.updateMany(
      { userId },
      {
        $set: {
          bankName: "탈퇴회원",
          accountNumberLast4: "****",
          operatorNote: "탈퇴 계정의 지급 기록",
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

async function purgeArenaUserData(userId) {
  const [matches, cycles, invitations, shopPurchases] = await Promise.all([
    ArenaMatch.find({
      $or: [
        { requestInitiatorUserId: userId },
        { "challenger.userId": userId },
        { "defender.userId": userId },
      ],
    }).select("_id problemPackId").lean(),
    AccessCycle.find({ userId }).select("_id").lean(),
    MainInvitationRequest.find({
      $or: [
        { initiatorUserId: userId },
        { selectedCandidateId: userId },
        { acceptedCandidateId: userId },
        { candidatePoolSnapshot: userId },
      ],
    }).select("_id").lean(),
    MainShopPurchase.find({ userId }).select("_id").lean(),
  ]);
  const matchIds = matches.map((entry) => entry._id);
  const problemPackIds = matches.map((entry) => entry.problemPackId).filter(Boolean);
  const cycleIds = cycles.map((entry) => entry._id);
  const invitationIds = invitations.map((entry) => entry._id);
  const shopPurchaseIds = shopPurchases.map((entry) => entry._id);
  const aggregateIds = [...matchIds, ...cycleIds, ...invitationIds, ...shopPurchaseIds];
  const attempts = await ArenaMatchAttempt.find({
    $or: [{ userId }, ...(matchIds.length ? [{ matchId: { $in: matchIds } }] : [])],
  }).select("_id").lean();
  const attemptIds = attempts.map((entry) => entry._id);
  const evidence = await ArenaMatchEvidence.find({
    $or: [{ userId }, ...(matchIds.length ? [{ matchId: { $in: matchIds } }] : [])],
  }).select("_id files").lean();
  const evidenceIds = evidence.map((entry) => entry._id);
  const outboxAggregateIds = [
    ...aggregateIds,
    ...attemptIds,
    ...evidenceIds,
  ];

  await Promise.all([
    ArenaPackagePayment.deleteMany({ userId }),
    PaybackPayoutRecord.deleteMany({
      $or: [
        { userId },
        ...(cycleIds.length ? [{ cycleId: { $in: cycleIds } }] : []),
      ],
    }),
    MockExamSubscription.deleteMany({ userId }),
    AccessCycle.deleteMany({ userId }),
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
    ArenaAchievementBadge.deleteMany({ userId }),
    ArenaStanding.deleteMany({ userId }),
    ArenaLearningDayLedger.deleteMany({
      $or: [{ userId }, ...(cycleIds.length ? [{ accessCycleId: { $in: cycleIds } }] : [])],
    }),
    ArenaMatchAttempt.deleteMany({
      $or: [{ userId }, ...(matchIds.length ? [{ matchId: { $in: matchIds } }] : [])],
    }),
    ArenaMatchAttemptEvent.deleteMany({
      $or: [{ userId }, ...(attemptIds.length ? [{ attemptId: { $in: attemptIds } }] : [])],
    }),
    ArenaMatchEvidence.deleteMany({
      $or: [{ userId }, ...(matchIds.length ? [{ matchId: { $in: matchIds } }] : [])],
    }),
    ArenaMatchParticipantLock.deleteMany({
      $or: [{ userId }, ...(matchIds.length ? [{ matchId: { $in: matchIds } }] : [])],
    }),
    ArenaStandingChangeLedger.deleteMany({
      $or: [{ userId }, ...(matchIds.length ? [{ matchId: { $in: matchIds } }] : [])],
    }),
    ArenaRevengeRight.deleteMany({
      $or: [
        { eligibleUserId: userId },
        { opponentUserId: userId },
        ...(matchIds.length
          ? [{ sourceMatchId: { $in: matchIds } }, { revengeMatchId: { $in: matchIds } }]
          : []),
      ],
    }),
    ArenaMatch.deleteMany({ _id: { $in: matchIds } }),
    ArenaProblemPack.deleteMany({ _id: { $in: problemPackIds } }),
    ArenaPaybackReview.deleteMany({
      $or: [{ userId }, ...(cycleIds.length ? [{ cycleId: { $in: cycleIds } }] : [])],
    }),
    ArenaSnapshot.deleteMany({ userId }),
    MainToSubConversionResult.deleteMany({ userId }),
    RenewalRankAssessment.deleteMany({
      $or: [{ userId }, ...(cycleIds.length ? [{ cycleId: { $in: cycleIds } }] : [])],
    }),
    LiveFinalRankingProfile.deleteMany({ userId }),
    MainShopEffect.deleteMany({
      $or: [
        { userId },
        ...(matchIds.length ? [{ relatedMatchId: { $in: matchIds } }] : []),
        ...(shopPurchaseIds.length ? [{ purchaseId: { $in: shopPurchaseIds } }] : []),
      ],
    }),
    MainShopPurchase.deleteMany({ userId }),
    MainInvitationOffer.deleteMany({
      $or: [
        { candidateUserId: userId },
        ...(invitationIds.length ? [{ invitationRequestId: { $in: invitationIds } }] : []),
      ],
    }),
    MainInvitationRequest.deleteMany({ _id: { $in: invitationIds } }),
    ArenaOpponentSelectionAudit.deleteMany({
      $or: [
        { requesterUserId: userId },
        { candidateUserIds: userId },
        { selectedUserIds: userId },
      ],
    }),
    ArenaOutboxEvent.deleteMany(
      outboxAggregateIds.length
        ? { aggregateId: { $in: outboxAggregateIds } }
        : { _id: null }
    ),
  ]);

  await Promise.all(
    evidence.flatMap((entry) => entry.files || []).map(async (file) => {
      const storedName = path.basename(String(file?.storedName || ""));
      if (!storedName) return;
      const absolutePath = path.resolve(ARENA_EVIDENCE_STORAGE_DIR, storedName);
      if (path.dirname(absolutePath) !== ARENA_EVIDENCE_STORAGE_DIR) return;
      await destroyStoredAsset({ ...file, path: absolutePath }).catch(() => {});
    })
  );
}

async function withdrawUserAccount({
  userId,
  initiatedBy,
  retainAnonymousData,
}) {
  const user =
    await User.findById(userId)
      .select(
        "+passwordHash role school tokenVersion accountStatus"
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
      await purgeUserOwnedData(user._id);
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

  await removePrivateAccountData(
    user._id
  );
  await removeUserUploadedFiles(user._id);

  if (keepAnonymousData) {
    await anonymizePublicActivity(
      user._id
    );
  } else {
    await purgeUserOwnedData(
      user._id
    );
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

  const passwordMatches =
    Boolean(password) &&
    await bcrypt.compare(
      String(password),
      String(user.passwordHash || "")
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
  removePrivateAccountData,
  removeUserUploadedFiles,
  withdrawOwnAccount,
  withdrawUserAccount,
};
