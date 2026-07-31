const bcrypt = require("bcrypt");
const crypto = require("crypto");
const {
  AdminActionLog,
  AssessmentAttempt,
  CoachMessageSuggestion,
  CommunityComment,
  CommunityPost,
  CommunityVote,
  ConceptProgress,
  DailyPlan,
  LearningEvent,
  NicknameChangeRequest,
  PasswordResetCode,
  PrivateMockExamAttempt,
  PrivateMockWeeklyResult,
  ProblemAttempt,
  QuickPracticeAttempt,
  RankingProfile,
  SupportInquiry,
  User,
  UserNotification,
} = require("../models/matthsModel");

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
    },
  };
}

async function removePrivateAccountData(
  userId
) {
  await Promise.all([
    PasswordResetCode.deleteMany({
      userId,
    }),
    UserNotification.deleteMany({
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
    /*
     * 작업의 종류와 시각은 감사용으로 남기되, 자유 입력 사유나 부가정보에
     * 식별정보가 섞였을 가능성이 있어 내용을 비식별화한다.
     */
    AdminActionLog.updateMany(
      {
        targetUserId: userId,
      },
      {
        $set: {
          detail:
            "탈퇴 계정 관련 관리자 작업 기록",
          metadata: {
            anonymized: true,
          },
        },
      }
    ),
  ]);
}

async function anonymizePublicActivity(
  userId
) {
  await Promise.all([
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
  ]);
}

async function purgeUserOwnedData(
  userId
) {
  const ownedPostIds =
    await CommunityPost.distinct(
      "_id",
      {
        authorId: userId,
      }
    );
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
    PrivateMockWeeklyResult.deleteMany({
      userId,
    }),
    RankingProfile.deleteMany({
      userId,
    }),
    CoachMessageSuggestion.deleteMany({
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
  ]);
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

  if (keepAnonymousData) {
    await anonymizePublicActivity(
      user._id
    );
  } else {
    await purgeUserOwnedData(
      user._id
    );
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
        new: true,
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
  removePrivateAccountData,
  withdrawOwnAccount,
  withdrawUserAccount,
};
