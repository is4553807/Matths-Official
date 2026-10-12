const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const {
  User,
  ConceptProgress,
  ConceptLesson,
} = require("../models/matthsModel");
const {
  ParentAccount,
} = require("../models/parentModel");
const {
  AcademyAccount,
} = require("../models/academyModel");
const {
  serviceUrl,
} = require("../services/serviceUrlService");
const { accountLinkMismatch } = require("../services/accountLinkAccessService");
const { createParentDirectNotification } = require("../services/parentNotificationService");
const AppleAuthCredential = require(
  "../models/appleAuthCredentialModel"
);
const {
  getStudentAcademyProfile,
} = require("../services/academyService");
const {
  OVERSEAS_HIGH_SCHOOL_OPTION_CODE,
  buildOverseasSchool,
  getSchoolSelectData,
  findSchool,
} = require('../services/schoolService');
const {
  OVERSEAS_UNIVERSITY_OPTION_CODE,
  buildOverseasUniversity,
  getUniversitySelectData,
  findUniversity,
} = require('../services/universityService');
const {getDashboardData, toggleDailyPlanTask, updateCoachMode,} = require('../services/dashboardService');
const {
  dashboardTutorialView,
  updateDashboardTutorial,
} = require("../services/dashboardTutorialService");
const {
  createPrivateMockExamBatch,
  createPrivateMockFormulaResource,
  createPrivateMockObjection,
  correctPrivateMockAnswers,
  deletePrivateMockExam,
  deletePrivateMockFormulaResource,
  getAdminPrivateMockIntegrityEvidenceFile,
  getAdminPrivateMockPdfFile,
  getAdminPrivateMockExamData,
  getAdminPrivateMockExamDetailData,
  getAdminPrivateMockObjection,
  getPrivateMockAttemptData,
  getPrivateMockExamFile,
  getPrivateMockExamPageData,
  getPrivateMockEligibility,
  getPrivateMockRestrictionData,
  getPrivateMockObjectionFormData,
  getPrivateMockFormulaFile,
  getUserIntegrityCase,
  requestPrivateMockIntegrityEvidenceByAdmin,
  acceptPrivateMockObjection,
  rejectPrivateMockObjection,
  reviewPrivateMockIntegrityCase,
  savePrivateMockDraft,
  selectPrivateMockWeeklyAttempt,
  startPrivateMockAttempt,
  submitPrivateMockIntegrityEvidence,
  submitPrivateMockAttempt,
} = require("../services/privateMockExamService");
const {loadCurriculum, buildLearningViewModel, findUnitView, isCourseAvailable,} = require("../services/curriculumService");
const {getUserLearningData, updateTopicCompletion,} = require('../services/learningProgressService');
const {
  getWrongNoteData,
  getWrongNoteReviewData,
} = require("../services/wrongNoteService");
const {
  createNextProblem,
  submitProblem,
  changeCompletion,
  getReviewContext,
} = require("../services/practiceService");
const {
  formatAlgebraLesson,
  formatAlgebraMathText,
  formatAdminMath,
} = require("../services/mathTextService");
const {
  getConceptTypeGuides,
} = require("../services/conceptGuideService");
const {
  getAcademicYear,
  lifecycleSessionView,
  recordStudyActivity,
  synchronizeUserLifecycle,
} = require("../services/userLifecycleService");
const {
  DIFFICULTY_LABELS,
  createAssessmentAttempt,
  expireAssessmentAttempt,
  getAssessmentAttempt,
  getAssessmentCenterData,
  saveAssessmentDraft,
  submitAssessmentAttempt,
} = require("../services/assessmentService");
const {
  getPlacementDashboardData,
  createPlacementAttempt,
  getPlacementAttempt,
  savePlacementDraft,
  expirePlacementAttempt,
  submitPlacementAttempt,
} = require("../services/placementExamService");
const {
  createQuickPracticeAttempt,
  expireQuickPracticeAttempt,
  getQuickPracticeCatalogSummary,
  getQuickPracticeStats,
  submitQuickPracticeAttempt,
} = require("../services/quickPracticeService");
const {
  createSuggestion,
  getAdminSuggestionData,
  getSuggestionBoardData,
  moderateSuggestion,
} = require("../services/coachSuggestionService");
const {
  requestPasswordReset,
  resetPassword,
  verifyPasswordResetCode,
  verifyPasswordResetLink,
} = require("../services/passwordResetService");
const {
  getRankingDisplayName,
  validateRealName,
} = require("../services/userIdentityService");
const {
  createSupportInquiry,
  getContactPageData,
} = require("../services/supportInquiryService");
const {
  getProductCatalog,
  getPricingProductAccess,
  isPaidCheckoutAllowedForEmail,
} = require("../services/checkoutService");
const {
  createArchiveFolder,
  createArchiveItems,
  deleteArchiveFolder,
  deleteArchiveItem,
  deleteArchiveItems,
  discardArchiveUpload,
  getArchiveData,
  getArchiveDownload,
  moveArchiveItems,
  purgeArchiveItem,
  restoreArchiveItem,
  setArchiveFolderPinned,
  updateArchiveFolder,
} = require("../services/archiveService");
const {
  getRankingData,
} = require("../services/rankingService");
const {
  ERROR_HELP_ITEMS,
} = require("../services/errorHelpService");
const {
  getPaidPackageAccess,
} = require("../services/paidFeatureAccessService");
const {
  updateAdminPackageAccess,
} = require("../services/adminPackageAccessService");
const {
  getAdminOperationsGuideData,
} = require("../services/adminOperationsGuideService");
const {
  recordBusinessWithdrawal,
  updateOtherUnpaidCosts,
} = require("../services/financeService");
const {
  calculateRefundRequest,
  completeRefundRequest,
  getAdminRefundData,
  rejectRefundRequest,
} = require("../services/refundService");
const {
  getAdminArenaEvidenceData,
  getAdminEvidenceFile,
} = require("../services/arenaMatchEvidenceService");
const {
  createAnnouncement,
  createDirectNotification,
  getAdminAssessmentDetail,
  getAdminDashboardData,
  getAdminAuditHistory,
  getAdminParentDetail,
  getAdminRevenueMetrics,
  getAdminSanctionHistory,
  getAdminInquiryData,
  getAdminUserActivityData,
  getAdminUserDetail,
  getAdminUsersData,
  markNotificationRead,
  replyToInquiry,
  sendDirectUserEmail,
  sendUserPasswordReset,
  setUserActive,
  toggleAnnouncement,
  updateUserAccountStatus,
  updateInquiryStatus,
  updateUserNickname,
  updateUserRole,
  updateUserWarningCount,
  updateAdminParentChildNotifications,
  updateAdminParentStatus,
  revokeAdminParentChildLink,
} = require("../services/adminService");
const {
  approveAcademyApplication,
  rejectAcademyApplication,
} = require("../services/academyService");
const {
  getWeeklyMockInsights,
} = require("../services/weeklyMockInsightService");
const {
  assignAdminAcademyMembershipClass,
  getAdminAcademyDetail,
  getAdminAcademyList,
  getAdminAcademyWeekFileDownload,
  regenerateAdminAcademyAttendanceCode,
  transferAdminAcademyClassHomeroom,
  transferAdminAcademyOwner,
  updateAdminAcademyAttendance,
  updateAdminAcademyClass,
  updateAdminAcademyClassOperations,
  updateAdminAcademyInvite,
  updateAdminAcademyMembership,
  updateAdminAcademyProfile,
  updateAdminAcademyContract,
  updateAdminAcademyStaff,
} = require("../services/adminAcademyService");
const {
  dismissDashboardAnnouncement,
  dismissDashboardNotification,
  getNotificationDetail,
  getNotificationInbox,
  markAllNotificationsRead,
} = require("../services/notificationService");
const {
  accountBlockedMessage,
  synchronizeAccountAccess,
} = require("../services/accountAccessService");
const {
  withdrawOwnAccount,
} = require("../services/accountDeletionService");
const {
  checkNicknameAvailability,
  completeNicknameChange,
  getNicknameChangePageData,
  nicknameKey,
  nicknameLinkOwner,
  validateNickname,
} = require("../services/nicknameService");
const {
  releaseNickname,
  replaceUserNickname,
  reserveUserNickname,
} = require("../services/nicknameNamespaceService");
const {
  blockCommunityUser,
  createCommunityNotice,
  createCommunityComment,
  createCommunityPost,
  deleteCommunityPostByAuthor,
  getAdminCommunityData,
  getCommunityAnnouncement,
  getCommunityAttachment,
  getCommunityBoardData,
  getCommunityBlockedUsers,
  getCommunityBoardRules,
  getCommunityNotice,
  getCommunityPost,
  getCommunityPostingAccess,
  moderateCommunityComment,
  moderateCommunityNotice,
  moderateCommunityPost,
  privateBoardForViewer,
  setCommunityPostPinned,
  setCommunityNoticePinned,
  updateCommunityNotice,
  updateCommunityPostByAdmin,
  unblockCommunityUser,
  warnCommunityComment,
  warnCommunityPost,
  voteCommunityPost,
  reportCommunityPost,
  reviewCommunityReport,
} = require("../services/communityService");
const {
  discardCommunityUploads,
} = require("../services/communityAttachmentService");
const {
  completeAdminTodo,
  getAdminTodoData,
  reopenAdminTodo,
} = require("../services/adminTodoService");
const {
  alertPotentialDuplicateIdentity,
  buildIdentityMatchHash,
  normalizeBirthDate,
} = require("../services/identityRiskService");
const {
  recordConnectionHeartbeat,
} = require("../services/connectionUsageService");
const {
  getAdminArenaIntegrityData,
  recordConnectionIntegritySignals,
  requestArenaSupplementalEvidence,
  reviewArenaIntegrityCase,
} = require("../services/arenaIntegrityRiskService");
const {
  reviewHeldArenaV2Match,
} = require("../services/arenaV2IntegrityReviewAdapter");
const { setMatchmakingPaused } = require("../services/arenaMatchmakingControlService");
const {
  getAdminArenaV2Overview,
  reviewNormalRecordIntegrity,
} = require("../services/adminArenaV2Service");
const {
  getAdminActiveArenaMatchesData,
} = require("../services/adminActiveArenaMatchesService");
const {
  getAdminArenaMatchHistoryData,
} = require("../services/adminArenaMatchHistoryService");
const {
  analyzeForensicTraceCode,
  analyzeForensicUpload,
  isPdfDownload,
  issuePersonalizedPdf,
} = require("../services/pdfWatermarkService");
const { allowSameOriginFraming } = require("../services/contentSecurityPolicyService");
const {
  getAdminProblemBankCatalog,
} = require("../services/problemBankCatalogService");
const {
  getAdminProblemTypeCatalog,
  reviseProblemTypeVersion,
  syncProblemTypeRegistry,
} = require("../services/problemTypeCatalogService");
const { getAdminArenaV2Audit } = require("../services/adminArenaV2Service");
const {
  getAdminCurrentMetricsDashboard,
  getKstMonthKey,
} = require("../services/adminCurrentMetricsService");
const {
  recordOperationalMetricEvent,
} = require("../services/operationalMetricEventService");
const {
  getArenaActivityLevel,
} = require("../services/arenaActivityLevelService");
const {
  ARENA_PROFILE_AVATARS,
} = require("../constants/arenaProfileAvatars");
const {
  resolveArenaProfileAvatar,
  updateArenaProfileAvatar,
  updateCustomProfileAvatar,
} = require("../services/arenaProfileAvatarService");
const {
  removeAcademyProfileImageAsAdmin,
  updateAcademyProfileImageAsAdmin,
} = require("../services/academyProfileImageService");
const {
  beginSocialAuthorization,
  clearPendingSocialRegistration,
  completeSocialAuthorization,
  getPendingSocialRegistration,
  publicProviderStatus,
  setPendingSocialRegistration,
  socialIdPath,
} = require("../services/socialAuthService");
const {
  beginAppleWebAuthorization,
  completeAppleWebAuthorization,
} = require("../services/appleWebAuthService");
const {
  issueMobileAuthGrant,
} = require(
  "../services/mobileSocialAuthGrantService"
);
const {
  issueSocialProof,
  verifyStartTicket,
} = require("../services/accountReauthenticationService");
const bcrypt = require('bcrypt');
const crypto = require("crypto");
const BCRYPT_ROUNDS = 12;
const SOCIAL_AUTH_SELECT =
  "+socialAuth.googleId +socialAuth.kakaoId +socialAuth.appleId";

exports.mainPage = (req, res) => {
  const user = req.session?.user || null;
  res.render("index", { user });
};

exports.introPage = (req,res) => {
    res.render('intro', {
      user:
        req.session?.user ||
        null,
    });
}

exports.pricingPage = async (req, res, next) => {
  try {
    let pricingUser = req.session?.user || null;
    if (pricingUser?.id) {
      const accountAccess = await synchronizeAccountAccess(pricingUser.id);
      if (!accountAccess?.allowed || !accountAccess?.user) {
        delete req.session.user;
        pricingUser = null;
        res.locals.user = null;
      }
    }
    const viewedAt = new Date();
    await recordOperationalMetricEvent({
      eventKey: `pricing-view:${req.sessionID || "anonymous"}:${viewedAt.toISOString().slice(0, 13)}`,
      eventType: "PRICING_VIEW",
      userId: pricingUser?.id || null,
      result: "VIEWED",
      occurredAt: viewedAt,
      metadata: { path: "/pricing" },
    });
    const [products, productAccess] = await Promise.all([
      getProductCatalog(),
      pricingUser?.id
        ? getPricingProductAccess(pricingUser.id, viewedAt)
        : Promise.resolve(null),
    ]);
    return res.render("pricing", {
      user: pricingUser,
      activePage: "pricing",
      products,
      productAccess,
      checkoutEnabled: isPaidCheckoutAllowedForEmail(pricingUser?.email),
    });
  } catch (error) {
    return next(error);
  }
};

exports.connectionHeartbeat = async (req, res, next) => {
  try {
    const [usage] = await Promise.all([
      recordConnectionHeartbeat({
        userId: req.session.user.id,
      }),
      recordConnectionIntegritySignals({
        userId: req.session.user.id,
        deviceToken: req.body?.deviceToken,
        ip: req.ip,
        userAgent: req.get("user-agent"),
        acceptLanguage: req.get("accept-language"),
      }).catch((error) => {
        console.error("접속 무결성 연관 신호 기록 실패:", error);
        return null;
      }),
    ]);
    return res.json({
      ok: true,
      ...usage,
    });
  } catch (error) {
    return next(error);
  }
};

function protectedPageLoginNotice(req) {
  return isSafeStudentReturnPath(req.session?.returnTo)
    ? "로그인이 필요한 페이지입니다. 로그인하면 요청하신 페이지로 바로 이동합니다."
    : null;
}

function publicLoginAccountType(value) {
  const accountType = String(value || "student").trim().toLowerCase();
  return ["student", "academy", "parent"].includes(accountType)
    ? accountType
    : "student";
}

exports.loginPage = (req,res) => {
    const unifiedLogin = req.authAccountType === "unified";
    const accountType = req.authAccountType === "admin"
      ? "admin"
      : unifiedLogin
        ? publicLoginAccountType(req.query.accountType)
        : "student";
    const blockedStatus =
      String(
        req.query.account || ""
      );
    const socialOAuthError = String(
      req.session?.socialOAuthError || ""
    );
    if (req.session) {
      delete req.session.socialOAuthError;
    }
    res.render('login', {
      accountType,
      unifiedLogin,
      socialAuthProviders: publicProviderStatus(),
      loginNotice: accountType === "student" || unifiedLogin ? protectedPageLoginNotice(req) : null,
      success:
        req.query.reset === "1"
          ? "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요."
          : req.query.withdrawn ===
              "1"
            ? "계정 탈퇴가 완료되었습니다. 개인정보는 제거되었고 학습 데이터는 익명으로 보존됩니다."
          : null,
      error:
        socialOAuthError || (blockedStatus
          ? accountBlockedMessage(
              blockedStatus
            )
          : null),
      oldInput: {
        email: "",
      },
      next:
        accountType === "admin" && isSafeAdminReturnPath(req.query.next)
          ? req.query.next
          : unifiedLogin && isSafeReturnPath(req.query.next)
            ? req.query.next
          : "",
    });
}

const ARENA_GUEST_REGISTRATION_CLAIM_TTL_MS = 30 * 60 * 1000;

function arenaGuestRegistrationClaimContextIsValid(context, now = new Date()) {
  return Boolean(
    context?.guestIdentityId &&
    context?.sourceAttemptId &&
    context?.confirmationNonce &&
    Number.isFinite(new Date(context.expiresAt).getTime()) &&
    new Date(context.expiresAt).getTime() > now.getTime()
  );
}

function arenaGuestRegistrationDateLabel(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function sameArenaGuestConfirmationNonce(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function getArenaGuestRegistrationClaimForRequest(
  req,
  { createIfMissing = false, strictExistingContext = false } = {}
) {
  if (!req.session) return null;
  const service = require("../services/arenaGuestChallengeService");
  const now = new Date();
  let context = req.session.arenaGuestRegistrationClaim || null;
  const hadContext = Boolean(context);
  if (!arenaGuestRegistrationClaimContextIsValid(context, now)) {
    delete req.session.arenaGuestRegistrationClaim;
    context = null;
  }

  let preview = context
    ? await service.getGuestRegistrationClaimPreview({
        cookieHeader: req.headers.cookie || "",
        expectedIdentityId: context.guestIdentityId,
        expectedAttemptId: context.sourceAttemptId,
      })
    : null;

  if (!preview && context) {
    delete req.session.arenaGuestRegistrationClaim;
    context = null;
  }
  if (!preview && createIfMissing && !(strictExistingContext && hadContext)) {
    preview = await service.getGuestRegistrationClaimPreview({
      cookieHeader: req.headers.cookie || "",
    });
  }
  if (!preview) return null;

  if (
    !context ||
    String(context.guestIdentityId) !== String(preview.guestIdentityId) ||
    String(context.sourceAttemptId) !== String(preview.sourceAttemptId)
  ) {
    context = {
      guestIdentityId: String(preview.guestIdentityId),
      sourceAttemptId: String(preview.sourceAttemptId),
      confirmationNonce: crypto.randomBytes(24).toString("base64url"),
      preparedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ARENA_GUEST_REGISTRATION_CLAIM_TTL_MS).toISOString(),
    };
    req.session.arenaGuestRegistrationClaim = context;
  }

  return {
    guestIdentityId: String(preview.guestIdentityId),
    sourceAttemptId: String(preview.sourceAttemptId),
    nickname: String(preview.nickname || ""),
    acceptedAt: preview.acceptedAt,
    acceptedDateLabel: arenaGuestRegistrationDateLabel(preview.acceptedAt),
    confirmationNonce: context.confirmationNonce,
  };
}

exports.registerPage = async (
  req,
  res,
  next
) => {
  try {
    const schoolRegions =
      getSchoolSelectData();
    const socialRegistration =
      getPendingSocialRegistration(req);

    if (socialRegistration && socialRegistration.accountType !== "student") {
      return res.redirect(require("../services/portalSocialAuthService").registrationUrl(socialRegistration));
    }

    const arenaGuestRegistrationClaim =
      await getArenaGuestRegistrationClaimForRequest(req, {
        createIfMissing: true,
        strictExistingContext: req.query.arenaReverse === "1",
      });
    if (arenaGuestRegistrationClaim || req.session?.arenaGuestRegistrationClaim) {
      await saveSession(req);
    }
    return res.render("register", {
      schoolRegions,
      universities: getUniversitySelectData(),
      socialRegistration,
      arenaGuestRegistrationClaim,
      error: null,
      oldInput: {
        realName: "",
        birthDate: "",
        name: arenaGuestRegistrationClaim?.nickname || socialRegistration?.displayName || "",
        email: socialRegistration?.email || "",
        schoolGrade: 10,
        schoolRegion: "",
        schoolCode: "",
        overseasSchoolName: "",
        universityCode: "",
        overseasUniversityName: "",
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.socialOAuthStart = async (req, res) => {
  try {
    const accountType = ["academy", "parent"].includes(req.query.accountType) ? req.query.accountType : "student";
    req.socialOAuthAccountType = accountType;
    res.set("Referrer-Policy", "no-referrer");
    const authorizationUrl = beginSocialAuthorization(
      req,
      req.params.provider,
      {
        mobile:
          req.socialOAuthMobile ===
          true,
        codeChallenge:
          req.socialOAuthCodeChallenge ||
          null,
        accountType,
        next: typeof req.query.next === "string" ? req.query.next : req.session?.returnTo,
        inviteToken: typeof req.query.invite === "string" ? req.query.invite : "",
        registrationFlow: req.query.path === "staff" ? "staff" : "new",
      }
    );
    // OAuth state를 공급자 페이지로 이동하기 전에 확실히 저장한다.
    await saveSession(req);
    return res.redirect(authorizationUrl);
  } catch (error) {
    return redirectSocialAuthError(
      req,
      res,
      error,
      req.socialOAuthMobile === true,
      req.params.provider
    );
  }
};

/* 앱(ASWebAuthenticationSession)이 여는 provider 공통 PKCE 진입점. */
exports.socialOAuthAppStart = (
  req,
  res,
  next
) => {
  const provider = String(
    req.params?.provider || "google"
  ).toLowerCase();
  const codeChallenge = String(
    req.query?.code_challenge || ""
  ).trim();

  if (
    !/^[A-Za-z0-9_-]{43}$/.test(
      codeChallenge
    )
  ) {
    const error = new Error(
      `${socialProviderLabel(provider)} 로그인을 안전하게 시작하지 못했습니다. 앱에서 다시 시도해주세요.`
    );
    error.code =
      "SOCIAL_AUTH_PKCE_REQUIRED";
    return redirectSocialAuthError(
      req,
      res,
      error,
      true,
      provider
    );
  }

  req.params.provider = provider;
  req.socialOAuthMobile = true;
  req.socialOAuthCodeChallenge =
    codeChallenge;
  return exports.socialOAuthStart(
    req,
    res,
    next
  );
};

/*
 * Bearer 토큰을 브라우저 주소에 싣지 않고 탈퇴 전용 Google 왕복을 시작한다.
 * API가 발급한 5분짜리 서명 ticket만 받아 세션 context로 옮긴다.
 */
exports.socialWithdrawalReauthenticationStart = async (req, res) => {
  const provider = String(req.params?.provider || "google").toLowerCase();
  try {
    const ticket = verifyStartTicket(req.query?.ticket);
    if (!ticket || ticket.provider !== provider) {
      const error = new Error("소셜 계정 본인 확인 요청이 만료되었습니다. 앱에서 다시 시도해주세요.");
      error.status = 400;
      error.code = "ACCOUNT_REAUTHENTICATION_TICKET_INVALID";
      throw error;
    }
    const authorizationUrl = beginSocialAuthorization(req, provider, {
      mobile: true,
      codeChallenge: ticket.codeChallenge,
      purpose: "account-withdrawal",
      userId: ticket.userId,
    });
    await saveSession(req);
    return res.redirect(authorizationUrl);
  } catch (error) {
    return redirectSocialAuthError(req, res, error, true, provider, true);
  }
};

function socialProviderLabel(provider) {
  switch (String(provider || "").toLowerCase()) {
    case "kakao":
      return "카카오";
    case "apple":
      return "Apple";
    default:
      return "Google";
  }
}

function mobileCallbackURL(provider, accountWithdrawal = false) {
  const key = String(provider || "google").toLowerCase();
  if (accountWithdrawal) {
    return new URL(`matths://oauth/${encodeURIComponent(`${key}-reauth`)}`);
  }
  return new URL(`matths://oauth/${encodeURIComponent(key)}`);
}

async function redirectSocialAuthError(
  req,
  res,
  error,
  mobile = false,
  provider = "google",
  accountWithdrawal = false
) {
  if (req.socialOAuthNativePortal === true || error?.context?.nativePortal === true) {
    return res.redirect(require("./nativePortalAuthController").callback({ error: "소셜 로그인을 완료하지 못했습니다. 계정 유형을 확인하고 다시 시도해 주세요." }));
  }
  const userSafeCodes = new Set([
    "SOCIAL_AUTH_NOT_CONFIGURED",
    "SOCIAL_AUTH_EMAIL_REQUIRED",
    "SOCIAL_AUTH_ACCOUNT_CONFLICT",
    "SOCIAL_AUTH_PARENT_ACCOUNT",
    "SOCIAL_AUTH_STUDENT_ACCOUNT_REQUIRED",
    "SOCIAL_AUTH_ACCOUNT_BLOCKED",
    "EMAIL_VERIFICATION_REQUIRED",
    "SOCIAL_AUTH_CANCELLED",
    "SOCIAL_AUTH_STATE_INVALID",
    "ACCOUNT_REAUTHENTICATION_TICKET_INVALID",
    "ACCOUNT_REAUTHENTICATION_ACCOUNT_MISMATCH",
  ]);
  const message =
    userSafeCodes.has(error?.code)
    ? error.message
    : "소셜 로그인을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.";

  if (mobile) {
    const url = mobileCallbackURL(provider, accountWithdrawal);
    url.searchParams.set(
      "error",
      message
    );
    return res.redirect(
      url.toString()
    );
  }

  if (error?.code === "EMAIL_VERIFICATION_REQUIRED") {
    req.session.pendingEmailVerification = { email: String(error.email || "") };
    await saveSession(req);
    return res.redirect(serviceUrl("public", "/verify-email"));
  }

  req.session.socialOAuthError =
    message;
  await saveSession(req);
  const accountType = ["academy", "parent"].includes(req.socialOAuthAccountType) ? req.socialOAuthAccountType : "student";
  return res.redirect(serviceUrl(accountType === "parent" ? "parents" : accountType === "academy" ? "academy" : "public", `/${accountType}/login`));
}

async function finishSocialLogin(
  req,
  res,
  user,
  mobile,
  codeChallenge = null,
  provider = "google"
) {
  if (mobile && !["student", "test"].includes(String(user?.role || "student"))) {
    const error = new Error("학생 계정은 학생 로그인에서만 이용할 수 있습니다.");
    error.code = "SOCIAL_AUTH_STUDENT_ACCOUNT_REQUIRED";
    throw error;
  }
  if (mobile) {
    const code =
      await issueMobileAuthGrant(
        user._id,
        { codeChallenge }
      );
    const url = mobileCallbackURL(provider);
    url.searchParams.set(
      "code",
      code
    );
    return res.redirect(
      url.toString()
    );
  }

  const returnTo = req.session?.returnTo;
  await createLoginSession(req, user);
  return res.redirect(postLoginUrl(user, returnTo));
}

exports.socialOAuthCallback = async (req, res) => {
  req.socialOAuthNativePortal = req.session?.socialOAuthState?.context?.nativePortal === true;
  req.socialOAuthAccountType = req.session?.socialOAuthState?.context?.accountType;
  let mobile =
    req.session
      ?.socialOAuthState
      ?.context
      ?.mobile === true;
  let accountWithdrawal =
    req.session?.socialOAuthState?.context?.purpose === "account-withdrawal";
  try {
    const completed = await completeSocialAuthorization(
      req,
      req.params.provider,
      {
        code: req.query.error
          ? null
          : req.query.code,
        state: req.query.state,
      }
    );
    const { profile, context } =
      completed;
    if (context.nativePortal === true) {
      const ticket = await require("../services/nativePortalSocialService").issuePortalProof(profile, context);
      return res.redirect(require("./nativePortalAuthController").callback({ ticket }));
    }
    mobile =
      context.mobile === true;
    const idPath = socialIdPath(profile.provider);

    if (context.purpose === "account-withdrawal") {
      accountWithdrawal = true;
      const providerUser = await User.findOne({
        [idPath]: profile.providerUserId,
      }).select(SOCIAL_AUTH_SELECT);
      if (
        !providerUser ||
        String(providerUser._id) !== String(context.userId || "")
      ) {
        const error = new Error(
          `현재 Matths 계정에 연결된 ${profile.provider === "kakao" ? "카카오" : "Google"} 계정으로 확인해주세요.`
        );
        error.status = 403;
        error.code = "ACCOUNT_REAUTHENTICATION_ACCOUNT_MISMATCH";
        error.context = context;
        throw error;
      }
      const proof = await issueSocialProof({
        userId: providerUser._id,
        codeChallenge: context.codeChallenge,
        provider: profile.provider,
      });
      const url = mobileCallbackURL(profile.provider, true);
      url.searchParams.set("code", proof);
      return res.redirect(url.toString());
    }

    if (!mobile) {
      const { resolveWebSocialAccount, registrationUrl } = require("../services/portalSocialAuthService");
      const { establishWebSession, loginDestination } = require("../services/webLoginService");
      const account = await resolveWebSocialAccount(profile);
      if (account) {
        const destination = loginDestination(account, context.next || req.session?.returnTo);
        clearPendingSocialRegistration(req);
        await establishWebSession(req, account);
        return res.redirect(destination);
      }
      setPendingSocialRegistration(req, profile, context);
      await saveSession(req);
      const type = context.accountType || "student";
      return res.redirect(serviceUrl(type === "parent" ? "parents" : type === "academy" ? "academy" : "public", registrationUrl(req.session.pendingSocialRegistration)));
    }

    const [providerUser, emailUser, parentAccount] = await Promise.all([
      User.findOne({ [idPath]: profile.providerUserId })
        .select(SOCIAL_AUTH_SELECT),
      User.findOne({ email: profile.email })
        .select(SOCIAL_AUTH_SELECT),
      ParentAccount.exists({ email: profile.email, isActive: true }),
    ]);

    if (
      providerUser &&
      emailUser &&
      String(providerUser._id) !== String(emailUser._id)
    ) {
      const error = new Error("소셜 계정 연결 정보가 다른 계정과 충돌합니다.");
      error.code = "SOCIAL_AUTH_ACCOUNT_CONFLICT";
      throw error;
    }

    const user = providerUser || emailUser;
    if (user) {
      if (user.emailVerificationRequiredAt && !user.emailVerifiedAt) {
        const error = new Error("이메일 인증이 필요합니다. 받은 메일의 계정 활성화 링크를 눌러주세요.");
        error.code = "EMAIL_VERIFICATION_REQUIRED";
        error.email = user.email;
        throw error;
      }
      const linkedId = String(user.get(idPath) || "");
      if (linkedId && linkedId !== profile.providerUserId) {
        const error = new Error("이미 다른 소셜 계정이 연결된 이메일입니다.");
        error.code = "SOCIAL_AUTH_ACCOUNT_CONFLICT";
        throw error;
      }
      user.set(idPath, profile.providerUserId);
      user.emailVerifiedAt = user.emailVerifiedAt || new Date();
      user.lastLoginAt = new Date();
      await user.save();

      const access = await synchronizeAccountAccess(user._id);
      if (!access?.allowed) {
        const error = new Error(
          accountBlockedMessage(access?.status, access?.user?.accountStatusReason)
        );
        error.code = "SOCIAL_AUTH_ACCOUNT_BLOCKED";
        throw error;
      }
      const synchronizedUser = await synchronizeUserLifecycle(access.user._id);
      synchronizedUser.lastLoginAt = new Date();
      await synchronizedUser.save();
      clearPendingSocialRegistration(
        req
      );
      return finishSocialLogin(
        req,
        res,
        synchronizedUser,
        mobile,
        context.codeChallenge ||
          null,
        profile.provider
      );
    }

    if (parentAccount) {
      const error = new Error(
        "같은 이메일의 학부모 계정이 있습니다. 학부모 로그인 방식을 이용해주세요."
      );
      error.code = "SOCIAL_AUTH_PARENT_ACCOUNT";
      throw error;
    }

    setPendingSocialRegistration(
      req,
      profile,
      context
    );
    await saveSession(req);
    return res.redirect(serviceUrl("public", "/student/register"));
  } catch (error) {
    mobile =
      mobile ||
      error?.context?.mobile ===
        true;
    return redirectSocialAuthError(
      req,
      res,
      error,
      mobile,
      req.params.provider,
      accountWithdrawal
    );
  }
};

exports.appleWebOAuthStart = (req, res) => {
  req.socialOAuthAccountType = ["academy", "parent"].includes(req.query.accountType) ? req.query.accountType : "student";
  try {
    return res.redirect(
      beginAppleWebAuthorization({
        accountType: req.socialOAuthAccountType,
        inviteToken: req.query.invite,
        registrationFlow: req.query.path,
        next: req.query.next,
      })
    );
  } catch (error) {
    return redirectSocialAuthError(
      req,
      res,
      error,
      false,
      "apple"
    );
  }
};

exports.appleWebOAuthCallback = async (req, res) => {
  try {
    const { profile, claims, context } = await completeAppleWebAuthorization({
      code: req.body?.code,
      identityToken: req.body?.id_token,
      state: req.body?.state,
      user: req.body?.user,
      error: req.body?.error,
    });

    req.socialOAuthAccountType = context.accountType;
    if (context.nativePortal === true) {
      req.socialOAuthNativePortal = true;
      const ticket = await require("../services/nativePortalSocialService").issuePortalProof(profile, context);
      return res.redirect(require("./nativePortalAuthController").callback({ ticket }));
    }
    const { resolveWebSocialAccount, registrationUrl, bindAppleAccount } = require("../services/portalSocialAuthService");
    const { establishWebSession, loginDestination } = require("../services/webLoginService");
    const account = await resolveWebSocialAccount(profile);
    if (account && (account.kind === "parent" || account.user.role !== "student")) {
      const destination = loginDestination(account, context.next || req.session?.returnTo);
      clearPendingSocialRegistration(req);
      await establishWebSession(req, account);
      return res.redirect(destination);
    }
    if (!account && ["academy", "parent"].includes(context.accountType)) {
      setPendingSocialRegistration(req, profile, context);
      await saveSession(req);
      return res.redirect(serviceUrl(context.accountType === "parent" ? "parents" : "academy", registrationUrl(req.session.pendingSocialRegistration)));
    }
    const { user } = account || await require("../services/appleAuthService").linkAppleIdentity({ claims, fullName: profile.displayName });
    if (!account) await bindAppleAccount(profile, { kind: "user", user });

    /*
     * 신규 학생만 기존 네이티브 신원 연결 경로로 최소 문서를 만든다. 학원·학부모는
     * 해당 저장소의 가입 폼에서 생성한다. 생년월일이 없는 학생은 추가정보와 실제
     * 약관 동의를 완료하기 전까지 로그인 세션을 발급하지 않는다.
     */
    const appleUser = await User.findById(user._id)
      .select(`+birthDate ${SOCIAL_AUTH_SELECT}`);
    if (!appleUser) {
      const error = new Error(
        "Apple 계정 정보를 확인하지 못했습니다. 다시 시도해주세요."
      );
      error.code = "SOCIAL_AUTH_ACCOUNT_CONFLICT";
      throw error;
    }
    if (!appleUser.birthDate) {
      const registrationEmail = String(
        claims.email || appleUser.email || ""
      )
        .trim()
        .toLowerCase();
      if (
        !registrationEmail ||
        /@appleid\.invalid$/i.test(registrationEmail) ||
        !(claims.emailVerified === true || appleUser.emailVerifiedAt)
      ) {
        const error = new Error(
          "Apple 계정에서 검증된 이메일을 확인하지 못했습니다. 이메일 제공 설정을 확인해주세요."
        );
        error.code = "SOCIAL_AUTH_EMAIL_REQUIRED";
        throw error;
      }
      // 최소 계정 생성 시 들어간 기본 약관 시각은 실제 동의가 아니다. 가입 폼에서
      // 체크박스를 제출한 순간에만 아래 register 경로가 다시 기록한다.
      appleUser.termsAcceptedAt = null;
      appleUser.termsVersion = "";
      appleUser.privacyVersion = "";
      await appleUser.save();
      setPendingSocialRegistration(
        req,
        {
          provider: "apple",
          providerUserId: claims.subject,
          email: registrationEmail,
          // Apple이 준 이름이나 서비스가 만든 임시 닉네임을 폼에 강제하지 않는다.
          displayName: "",
          provisionalUserId: appleUser._id,
        },
        { mobile: false }
      );
      await saveSession(req);
      return res.redirect(serviceUrl("public", "/student/register"));
    }

    const access = await synchronizeAccountAccess(appleUser._id);
    if (!access?.allowed) {
      const error = new Error(
        accountBlockedMessage(
          access?.status,
          access?.user?.accountStatusReason
        )
      );
      error.code = "SOCIAL_AUTH_ACCOUNT_BLOCKED";
      throw error;
    }

    const synchronizedUser = await synchronizeUserLifecycle(access.user._id);
    synchronizedUser.lastLoginAt = new Date();
    await synchronizedUser.save();
    clearPendingSocialRegistration(req);
    const returnTo = context.next || req.session?.returnTo;
    await createLoginSession(req, synchronizedUser);
    return res.redirect(postLoginUrl(synchronizedUser, returnTo));
  } catch (error) {
    if (error.context?.accountType) req.socialOAuthAccountType = error.context.accountType;
    return redirectSocialAuthError(
      req,
      res,
      error,
      false,
      "apple"
    );
  }
};

exports.visualLearningPage = (req,res) => {
    res.render('visual-learning', {
      user:
        req.session?.user ||
        null,
    });
}

exports.learningFlowPage = (req,res) => {
    res.render('learning-flow', {
      user:
        req.session?.user ||
        null,
    });
}

exports.faqPage = (req,res) => {
    res.render('faq', {
      user:
        req.session?.user ||
        null,
      errorHelpItems:
        ERROR_HELP_ITEMS,
    });
}

async function renderContactPage(
  req,
  res,
  {
    status = 200,
    feedback = null,
    oldInput = {},
  } = {}
) {
  const contactData =
    await getContactPageData(
      req.session.user.id
    );

  return res
    .status(status)
    .render("contact", {
      user: req.session.user,
      contactData,
      feedback,
      inquiryRequestId:
        String(oldInput.requestId || "") ||
        randomUUID(),
      oldInput: {
        requestId:
          String(oldInput.requestId || ""),
        inquiryType: String(oldInput.inquiryType || "GENERAL"),
        paymentId: String(oldInput.paymentId || ""),
        refundReasonType: String(oldInput.refundReasonType || "SIMPLE_CHANGE"),
        subject:
          String(
            oldInput.subject || ""
          ),
        content:
          String(
            oldInput.content || ""
          ),
      },
    });
}

exports.contactPage = async (
  req,
  res,
  next
) => {
  try {
    const feedback =
      req.session.contactFeedback ||
      null;

    if (
      req.session.contactFeedback
    ) {
      delete req.session
        .contactFeedback;
      await saveSession(req);
    }

    return await renderContactPage(
      req,
      res,
      {
        feedback,
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.submitContactInquiry =
  async (req, res, next) => {
    try {
      const result =
        await createSupportInquiry({
          userId:
            req.session.user.id,
          requestId:
            req.body.requestId,
          subject:
            req.body.subject,
          content:
            req.body.content,
          inquiryType: req.body.inquiryType,
          paymentId: req.body.paymentId,
          refundReasonType: req.body.refundReasonType,
        });

      req.session.contactFeedback = {
        type:
          result.emailStatus ===
          "failed"
            ? "warning"
            : "success",
        message:
          result.emailStatus ===
          "failed"
            ? "문의는 정상적으로 저장되었습니다. 관리자 이메일 알림 전송 상태를 확인하고 있습니다."
            : "문의가 접수되었습니다. 답변은 회원가입한 이메일로 전달됩니다.",
      };
      await saveSession(req);

      return res.redirect(
        "/contact"
      );
    } catch (error) {
      if (error.status) {
        return await renderContactPage(
          req,
          res,
          {
            status: error.status,
            feedback: {
              type: "error",
              message: error.message,
            },
            oldInput: {
              requestId:
                req.body.requestId,
              subject:
                req.body.subject,
              content:
                req.body.content,
              inquiryType: req.body.inquiryType,
              paymentId: req.body.paymentId,
              refundReasonType: req.body.refundReasonType,
            },
          }
        );
      }

      return next(error);
    }
  };

async function renderArchive(
  req,
  res,
  {
    status = 200,
    adminMode = false,
    feedback = null,
    oldInput = {},
  } = {}
) {
  const archiveData =
    await getArchiveData(
      req.session.user,
      {
        includeUnpublished:
          adminMode,
        folderId:
          req.query.folder,
      }
    );

  return res
    .status(status)
    .render(
      adminMode
        ? "admin-archive"
        : "archive-public",
      {
      user: req.session.user,
      archiveData,
      adminMode,
      feedback,
      oldInput: {
        title:
          String(
            oldInput.title || ""
          ),
        description:
          String(
            oldInput.description ||
              ""
          ),
        category:
          String(
            oldInput.category ||
              "문제지"
          ),
        folderId:
          String(
            oldInput.folderId ||
              req.query.folder ||
              ""
          ),
        folderName:
          String(
            oldInput.folderName ||
              ""
          ),
        folderDescription:
          String(
            oldInput.folderDescription ||
              ""
          ),
        folderAccessLevel:
          String(oldInput.folderAccessLevel || "AUTHENTICATED"),
        editFolderName:
          String(
            oldInput
              .editFolderName ??
              archiveData
                .selectedFolder
                ?.name ??
              ""
          ),
        editFolderDescription:
          String(
            oldInput
              .editFolderDescription ??
              archiveData
                .selectedFolder
                ?.description ??
              ""
          ),
        editFolderAccessLevel:
          String(
            oldInput.editFolderAccessLevel ??
              archiveData.selectedFolder?.accessLevel ??
              "AUTHENTICATED"
          ),
        parentFolderId:
          String(
            oldInput.parentFolderId ||
              req.query.folder ||
              ""
          ),
        notifyUsers:
          [
            "true",
            "1",
            "on",
          ].includes(
            String(
              oldInput.notifyUsers ||
                ""
            )
          ),
      },
      }
    );
}

exports.archivePage = async (
  req,
  res,
  next
) => {
  try {
    return await renderArchive(
      req,
      res,
      {
          feedback:
            Number(
              req.query.uploaded
            ) > 0
            ? {
                type: "success",
                message:
                  `아카이브에 자료 ${Number(req.query.uploaded)}개를 추가했습니다.`,
              }
            : null,
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.archiveAdminPage =
  async (req, res, next) => {
    try {
      return await renderArchive(
        req,
        res,
        {
          adminMode: true,
          feedback:
            req.query.folderCreated ===
            "1"
              ? {
                  type:
                    "success",
                  message:
                    "아카이브 폴더를 추가했습니다.",
                }
              : req.query
                  .folderUpdated ===
                "1"
              ? {
                  type:
                    "success",
                  message:
                    "폴더 이름·설명·접근 권한을 수정했습니다.",
                }
              : req.query
                  .folderPinned ===
                "1"
              ? {
                  type:
                    "success",
                  message:
                    "폴더를 목록 상단에 고정했습니다.",
                }
              : req.query
                  .folderPinned ===
                "0"
              ? {
                  type:
                    "success",
                  message:
                    "폴더 상단 고정을 해제했습니다.",
                }
              : req.query
                  .folderDeleted ===
                "1"
              ? {
                  type:
                    "success",
                  message:
                    "빈 아카이브 폴더를 삭제했습니다.",
                }
              : Number(
                  req.query.uploaded
                ) > 0
              ? {
                  type:
                    req.query.notifyFailed ===
                    "1"
                      ? "error"
                      : "success",
                  message:
                    req.query.notifyFailed ===
                    "1"
                      ? `아카이브에 자료 ${Number(req.query.uploaded)}개는 추가했지만 회원 공지는 발송하지 못했습니다. 운영 현황에서 공지를 다시 등록해주세요.`
                      : `아카이브에 자료 ${Number(req.query.uploaded)}개를 추가했습니다.${req.query.notified === "1" ? " 회원 공지도 함께 발송했습니다." : ""}`,
                }
              : req.query.deleted ===
                "1"
              ? {
                  type:
                    "success",
                  message:
                    "아카이브 자료를 휴지통으로 이동했습니다. 30일 동안 복구할 수 있습니다.",
                }
              : Number(
                  req.query
                    .bulkDeleted
                ) > 0
              ? {
                  type:
                    "success",
                  message:
                    `선택한 아카이브 자료 ${Number(req.query.bulkDeleted)}개를 휴지통으로 이동했습니다.`,
                }
              : Number(
                  req.query
                    .bulkMoved
                ) > 0
              ? {
                  type:
                    "success",
                  message:
                    `선택한 아카이브 자료 ${Number(req.query.bulkMoved)}개를 이동했습니다.`,
                }
              : req.query.restored === "1"
              ? {
                  type: "success",
                  message: "휴지통 자료를 원래 위치로 복구했습니다.",
                }
              : req.query.purged === "1"
              ? {
                  type: "success",
                  message: "휴지통 자료와 저장 원본을 영구 삭제했습니다.",
                }
              : null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.uploadArchiveItem =
  async (req, res, next) => {
    try {
      const items =
        await createArchiveItems({
          user:
            req.session.user,
          files:
            req.files,
          description:
            req.body.description,
          category:
            req.body.category,
          folderId:
            req.body.folderId,
        });
      const shouldNotify =
        [
          "true",
          "1",
          "on",
        ].includes(
          String(
            req.body
              .notifyUsers ||
              ""
          )
        );

      let notificationFailed =
        false;

      if (shouldNotify) {
        try {
          await createAnnouncement({
            adminUserId:
              req.session.user.id,
            title:
              "아카이브 자료 업데이트",
            content:
              `아카이브에 새 자료 ${items.length}개가 등록되었습니다. 지금 확인해보세요.`,
            publishNow: true,
            href: "/archive",
          });
        } catch (error) {
          notificationFailed =
            true;
          console.error(
            "아카이브 업데이트 공지 발송 실패:",
            error
          );
        }
      }

      return res.redirect(
        `/archive/admin?uploaded=${items.length}${shouldNotify && !notificationFailed ? "&notified=1" : ""}${notificationFailed ? "&notifyFailed=1" : ""}`
      );
    } catch (error) {
      await Promise.all(
        (req.files || []).map(
          (file) =>
            discardArchiveUpload(
              file
            )
        )
      );

      if (error.status) {
        return await renderArchive(
          req,
          res,
          {
            status: error.status,
            adminMode: true,
            feedback: {
              type: "error",
              message:
                error.message,
            },
            oldInput:
              req.body,
          }
        );
      }

      return next(error);
    }
  };

exports.deleteArchiveItem =
  async (req, res, next) => {
    try {
      await deleteArchiveItem({
        itemId:
          req.params.itemId,
        user:
          req.session.user,
      });

      return res.redirect(
        `/archive/admin?deleted=1${req.body.folderId ? `&folder=${encodeURIComponent(req.body.folderId)}` : ""}`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.deleteArchiveItems =
  async (req, res, next) => {
    try {
      const result =
        await deleteArchiveItems({
          itemIds:
            req.body.itemIds,
          user:
            req.session.user,
        });

      return res.redirect(
        `/archive/admin?bulkDeleted=${result.deletedCount}${req.body.folderId ? `&folder=${encodeURIComponent(req.body.folderId)}` : ""}`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.restoreArchiveItem = async (req, res, next) => {
  try {
    await restoreArchiveItem({
      itemId: req.params.itemId,
      user: req.session.user,
    });
    return res.redirect("/archive/admin?restored=1#archive-trash");
  } catch (error) {
    return next(error);
  }
};

exports.purgeArchiveItem = async (req, res, next) => {
  try {
    await purgeArchiveItem({
      itemId: req.params.itemId,
      user: req.session.user,
    });
    return res.redirect("/archive/admin?purged=1#archive-trash");
  } catch (error) {
    return next(error);
  }
};

exports.moveArchiveItems =
  async (req, res, next) => {
    try {
      const result =
        await moveArchiveItems({
          itemIds:
            req.body.itemIds,
          destinationFolderId:
            req.body
              .destinationFolderId,
          user:
            req.session.user,
        });

      return res.redirect(
        `/archive/admin?bulkMoved=${result.movedCount}${req.body.folderId ? `&folder=${encodeURIComponent(req.body.folderId)}` : ""}`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.createArchiveFolder =
  async (req, res, next) => {
    try {
      await createArchiveFolder({
        user:
          req.session.user,
        name:
          req.body.folderName,
        description:
          req.body
            .folderDescription,
        parentFolderId:
          req.body
            .parentFolderId,
        accessLevel:
          req.body.folderAccessLevel,
      });

      return res.redirect(
        `/archive/admin?folderCreated=1${req.body.parentFolderId ? `&folder=${encodeURIComponent(req.body.parentFolderId)}` : ""}`
      );
    } catch (error) {
      if (error.status) {
        return await renderArchive(
          req,
          res,
          {
            status: error.status,
            adminMode: true,
            feedback: {
              type: "error",
              message:
                error.message,
            },
            oldInput:
              req.body,
          }
        );
      }

      return next(error);
    }
  };

exports.updateArchiveFolder =
  async (req, res, next) => {
    try {
      const folder =
        await updateArchiveFolder({
          user:
            req.session.user,
          folderId:
            req.params.folderId,
          name:
            req.body
              .editFolderName,
        description:
          req.body
            .editFolderDescription,
        accessLevel:
          req.body.editFolderAccessLevel,
        });

      return res.redirect(
        `/archive/admin?folderUpdated=1&folder=${encodeURIComponent(folder.id)}`
      );
    } catch (error) {
      if (
        [400, 409].includes(
          error.status
        )
      ) {
        req.query.folder =
          req.params.folderId;
        return await renderArchive(
          req,
          res,
          {
            status: error.status,
            adminMode: true,
            feedback: {
              type: "error",
              message:
                error.message,
            },
            oldInput:
              req.body,
          }
        );
      }

      return next(error);
    }
  };

exports.setArchiveFolderPinned =
  async (req, res, next) => {
    try {
      const folder =
        await setArchiveFolderPinned({
          user:
            req.session.user,
          folderId:
            req.params.folderId,
          pinned:
            req.body.pinned ===
            "true",
        });

      return res.redirect(
        `/archive/admin?folder=${encodeURIComponent(folder.id)}&folderPinned=${folder.isPinned ? "1" : "0"}`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.deleteArchiveFolder =
  async (req, res, next) => {
    try {
      const folder =
        await deleteArchiveFolder({
          user:
            req.session.user,
          folderId:
            req.params.folderId,
        });
      const parentQuery =
        folder.parentFolderId
          ? `&folder=${encodeURIComponent(folder.parentFolderId)}`
          : "";

      return res.redirect(
        `/archive/admin?folderDeleted=1${parentQuery}`
      );
    } catch (error) {
      if (error.status === 409) {
        req.query.folder =
          req.params.folderId;
        return await renderArchive(
          req,
          res,
          {
            status: error.status,
            adminMode: true,
            feedback: {
              type: "error",
              message:
                error.message,
            },
          }
        );
      }

      return next(error);
    }
  };

exports.downloadArchiveItem =
  async (req, res, next) => {
    try {
      const file =
        await getArchiveDownload({
          itemId:
            req.params.itemId,
          user:
            req.session.user,
        });

      if (isPdfDownload({ mimeType: file.mimeType, name: file.name })) {
        const issued = await issuePersonalizedPdf({
          userId: req.session.user.id,
          examId: file.examId,
          sourceType: "ARCHIVE",
          sourceId: file.sourceId,
          originalName: file.name,
          storageRecord: file.sourceRecord,
          localPath: file.path,
        });
        const cleanup = () => issued.cleanup().catch(() => {});
        res.once("finish", cleanup);
        res.once("close", cleanup);
        res.set("Cache-Control", "private, no-store");
        return res.download(issued.filePath, issued.downloadName, (error) => {
          cleanup();
          if (error && !res.headersSent) return next(error);
          return undefined;
        });
      }

      if (file.cloudUrl) {
        res.set("Cache-Control", "private, no-store");
        return res.redirect(302, file.cloudUrl);
      }

      return res.download(
        file.path,
        file.name,
        {
          headers: {
            "Content-Type":
              file.mimeType,
          },
        }
      );
    } catch (error) {
      return next(error);
    }
  };

function adminFeedbackFromQuery(
  query
) {
  const messages = {
    announcement:
      "공지를 저장했습니다.",
    announcementStatus:
      "공지 공개 상태를 변경했습니다.",
    inquiryReply:
      "문의 답변을 가입 이메일로 전송했습니다.",
    inquiryStatus:
      "문의 상태를 변경했습니다.",
    nickname:
      "사용자에게 닉네임 변경 사유와 본인 확인 링크를 보냈습니다.",
    notification:
      "사용자에게 사이트 알림을 보냈습니다.",
    email:
      "사용자 이메일로 메시지를 전송했습니다.",
    passwordReset:
      "비밀번호 재설정 이메일 발송을 요청했습니다.",
    account:
      "사용자 계정 상태를 변경했습니다.",
    accountStatus:
      "사용자 계정 상태를 변경했습니다.",
    role:
      "사용자 역할을 변경했습니다.",
    warningCount:
      "사용자 경고 횟수를 변경했습니다.",
    packageAccess:
      "사용자의 패키지 권한을 변경했습니다.",
    parentAccountStatus:
      "학부모 계정 이용 상태를 변경했습니다.",
    parentNotificationSettings:
      "자녀별 학습 알림 설정을 저장했습니다.",
    parentChildUnlinked:
      "학부모와 자녀 계정 연결을 해제했습니다.",
    communityEdit:
      "게시글을 수정했습니다.",
    communityModeration:
      "게시글 공개 상태를 변경했습니다.",
    communityPinned:
      "게시글을 목록 상단에 고정했습니다.",
    communityUnpinned:
      "게시글 상단 고정을 해제했습니다.",
    communityWarning:
      "게시글을 숨기고 작성자에게 경고를 부여했습니다.",
    communitySuspended:
      "게시글을 숨기고 작성자에게 세 번째 경고를 부여해 계정을 정지했습니다.",
    communityCommentModeration:
      "댓글 공개 상태를 변경했습니다.",
    communityCommentWarning:
      "댓글을 숨기고 작성자에게 경고를 부여했습니다.",
    communityCommentSuspended:
      "댓글을 숨기고 작성자에게 세 번째 경고를 부여해 계정을 정지했습니다.",
    communityReport:
      "게시글 신고 처리 상태를 저장했습니다.",
    communityNoticeCreated:
      "게시판 공지를 추가하고 상단에 고정했습니다.",
    communityNoticeUpdated:
      "게시판 공지를 수정했습니다.",
    communityNoticePinned:
      "게시판 공지를 상단에 고정했습니다.",
    communityNoticeUnpinned:
      "게시판 공지 고정을 해제했습니다.",
    communityNoticeModerated:
      "게시판 공지 공개 상태를 변경했습니다.",
    financeWithdrawal:
      "사업자 출금 기록을 저장했습니다.",
    financeReserve:
      "기타 미지급 비용 준비금을 저장했습니다.",
    academyApproved:
      "학원 등록 요청을 승인했습니다. 이제 교사와 학생에게 학원이 표시됩니다.",
    academyRejected:
      "학원 등록 요청을 거절했습니다.",
  };

  return messages[
    String(query.done || "")
  ] || null;
}

exports.adminDashboardPage =
  async (req, res, next) => {
    try {
      return res.render(
        "admin-dashboard",
        {
          user:
            req.session.user,
          adminData:
            await getAdminDashboardData(),
          feedback:
            adminFeedbackFromQuery(
              req.query
            ),
          error: null,
          oldInput: null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

function adminAcademyFeedback(query) {
  const messages = {
    academyApproved: "학원 등록 요청을 승인했습니다.",
    academyRejected: "학원 등록 요청을 거절했습니다.",
    academyRenamed: "학원 이름을 변경했습니다.",
    academyPaused: "학원 운영을 중지했습니다.",
    academyActivated: "학원 운영을 재개했습니다.",
    academyReopened: "거절된 학원을 재검토 대기로 복구했습니다.",
    staffUpdated: "교사 소속 상태를 변경했습니다.",
    studentUpdated: "학생 소속 상태를 변경했습니다.",
    studentClassUpdated: "학생의 반 배정을 변경했습니다.",
    classUpdated: "반 사용 상태를 변경했습니다.",
    classOperationsUpdated: "반 일정과 출석 방식을 변경했습니다.",
    classHomeroomTransferred: "반 담임 선생님을 이전했습니다.",
    attendanceUpdated: "학생 출결 기록을 보정했습니다.",
    attendanceCodeRegenerated: "수업 회차의 출석 코드를 재발급했습니다.",
    inviteUpdated: "초대 사용 상태를 변경했습니다.",
    ownerTransferred: "학원 원장 권한을 이전했습니다.",
    academyProfileImageUpdated: "학원 프로필 사진을 변경했습니다.",
    academyProfileImageRemoved: "학원 프로필 사진을 기본 이미지로 되돌렸습니다.",
    academyContractUpdated: "학원 계약 만료일과 원장 교사 권한을 갱신했습니다.",
  };
  const error = String(query.error || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 240);
  return {
    message: messages[String(query.done || "")] || null,
    error: error || null,
  };
}

function safeAdminAcademyReturnPath(value, fallback) {
  const candidate = String(value || "").trim();
  return /^\/admin\/academies(?:\/[a-f\d]{24}(?:\/(?:overview|analytics|members|classes|attendance))?)?(?:\?[^\s#]*)?(?:#[a-z0-9-]+)?$/i.test(candidate)
    ? candidate
    : fallback;
}

function adminAcademyErrorRedirect(res, academyId, error, anchor = "") {
  const sectionByAnchor = {
    "academy-control": "overview",
    "academy-contract": "overview",
    "academy-statistics": "analytics",
    "academy-staff": "members",
    "academy-students": "members",
    "academy-classes": "classes",
    "academy-classwork": "classes",
    "academy-attendance": "attendance",
    "academy-invites": "members",
  };
  const section = sectionByAnchor[anchor] || "overview";
  const suffix = anchor ? `#${anchor}` : "";
  const message = encodeURIComponent(String(error.message || "학원 관리 작업을 처리하지 못했습니다.").slice(0, 240));
  return res.redirect(303, `/admin/academies/${academyId}/${section}?error=${message}${suffix}`);
}

exports.adminAcademiesPage = async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    return res.render("admin-academies", {
      user: req.session.user,
      academyData: await getAdminAcademyList({
        adminUserId: req.session.user.id,
        search: req.query.search,
        status: req.query.status,
        page: req.query.page,
      }),
      feedback: adminAcademyFeedback(req.query),
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminAcademyDetailPage = async (req, res, next) => {
  try {
    const availableSections = new Set(["overview", "analytics", "members", "classes", "attendance"]);
    const activeAcademySection = String(req.params.section || "overview").trim().toLowerCase();
    if (!availableSections.has(activeAcademySection)) {
      const sectionError = new Error("학원 관리 메뉴를 찾을 수 없습니다.");
      sectionError.status = 404;
      throw sectionError;
    }
    res.set("Cache-Control", "private, no-store");
    return res.render("admin-academy-detail", {
      user: req.session.user,
      detail: await getAdminAcademyDetail({
        adminUserId: req.session.user.id,
        academyId: req.params.academyId,
        periodKey: req.query.period,
        section: activeAcademySection,
      }),
      feedback: adminAcademyFeedback(req.query),
      activeAcademySection,
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminDownloadAcademyWeekFile = async (req, res, next) => {
  try {
    const download = await getAdminAcademyWeekFileDownload({
      adminUserId: req.session.user.id,
      academyId: req.params.academyId,
      weekId: req.params.weekId,
      fileId: req.params.fileId,
    });
    if (download.type === "REDIRECT") {
      res.set("Cache-Control", "private, no-store");
      return res.redirect(302, download.url);
    }
    const issued = download.issued;
    const cleanup = () => issued.cleanup().catch(() => {});
    res.once("finish", cleanup);
    res.once("close", cleanup);
    res.type("application/pdf");
    res.set("Cache-Control", "private, no-store");
    res.set("X-Matths-Trace", issued.traceCode);
    return res.download(issued.filePath, issued.downloadName, (error) => {
      cleanup();
      if (error && !res.headersSent) return next(error);
      return undefined;
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminUpdateAcademyProfile = async (req, res, next) => {
  try {
    const result = await updateAdminAcademyProfile({
      adminUserId: req.session.user.id,
      academyId: req.params.academyId,
      action: req.body.action,
      name: req.body.name,
    });
    const action = String(req.body.action).toUpperCase();
    const done = {
      RENAME: "academyRenamed",
      PAUSE: "academyPaused",
      ACTIVATE: "academyActivated",
      REOPEN: "academyReopened",
    }[action] || (result.status === "PAUSED" ? "academyPaused" : "academyActivated");
    return res.redirect(303, `/admin/academies/${result._id}/overview?done=${done}#academy-control`);
  } catch (error) {
    if ([400, 403, 404, 409].includes(Number(error.status))) {
      return adminAcademyErrorRedirect(res, req.params.academyId, error, "academy-control");
    }
    return next(error);
  }
};

exports.adminUpdateAcademyContract = async (req, res, next) => {
  try {
    const academy = await updateAdminAcademyContract({
      adminUserId: req.session.user.id,
      academyId: req.params.academyId,
      contractEndsAt: req.body.contractEndsAt,
    });
    return res.redirect(
      303,
      `/admin/academies/${academy._id}/overview?done=academyContractUpdated#academy-contract`
    );
  } catch (error) {
    if ([400, 403, 404, 409].includes(Number(error.status))) {
      return adminAcademyErrorRedirect(
        res,
        req.params.academyId,
        error,
        "academy-contract"
      );
    }
    return next(error);
  }
};

exports.adminUpdateAcademyProfileImage = async (req, res, next) => {
  try {
    if (req.profileAvatarUploadError) throw req.profileAvatarUploadError;
    const action = String(req.body.action || "UPDATE").trim().toUpperCase();
    if (action === "REMOVE") {
      await removeAcademyProfileImageAsAdmin({
        adminUserId: req.session.user.id,
        academyId: req.params.academyId,
      });
      return res.redirect(303, `/admin/academies/${req.params.academyId}/overview?done=academyProfileImageRemoved#academy-control`);
    }
    if (action !== "UPDATE") {
      const actionError = new Error("올바른 학원 프로필 사진 작업이 아닙니다.");
      actionError.status = 400;
      throw actionError;
    }
    await updateAcademyProfileImageAsAdmin({
      adminUserId: req.session.user.id,
      academyId: req.params.academyId,
      file: req.file,
    });
    req.file = undefined;
    return res.redirect(303, `/admin/academies/${req.params.academyId}/overview?done=academyProfileImageUpdated#academy-control`);
  } catch (error) {
    if ([400, 403, 404, 409, 413, 422, 503].includes(Number(error.status))) {
      return adminAcademyErrorRedirect(res, req.params.academyId, error, "academy-control");
    }
    return next(error);
  } finally {
    if (req.file?.path) {
      await require("node:fs").promises.unlink(req.file.path).catch(() => {});
      req.file = undefined;
    }
  }
};

exports.adminUpdateAcademyStaff = async (req, res, next) => {
  try {
    await updateAdminAcademyStaff({
      adminUserId: req.session.user.id,
      academyId: req.params.academyId,
      staffId: req.params.staffId,
      action: req.body.action,
    });
    return res.redirect(303, `/admin/academies/${req.params.academyId}/members?done=staffUpdated#academy-staff`);
  } catch (error) {
    if ([400, 403, 404, 409].includes(Number(error.status))) {
      return adminAcademyErrorRedirect(res, req.params.academyId, error, "academy-staff");
    }
    return next(error);
  }
};

exports.adminTransferAcademyOwner = async (req, res, next) => {
  try {
    await transferAdminAcademyOwner({
      adminUserId: req.session.user.id,
      academyId: req.params.academyId,
      newOwnerStaffId: req.body.newOwnerStaffId,
    });
    return res.redirect(303, `/admin/academies/${req.params.academyId}/members?done=ownerTransferred#academy-staff`);
  } catch (error) {
    if ([400, 403, 404, 409].includes(Number(error.status))) {
      return adminAcademyErrorRedirect(res, req.params.academyId, error, "academy-staff");
    }
    return next(error);
  }
};

exports.adminUpdateAcademyStudent = async (req, res, next) => {
  try {
    await updateAdminAcademyMembership({
      adminUserId: req.session.user.id,
      academyId: req.params.academyId,
      membershipId: req.params.membershipId,
      action: req.body.action,
    });
    return res.redirect(303, `/admin/academies/${req.params.academyId}/members?done=studentUpdated#academy-students`);
  } catch (error) {
    if ([400, 403, 404, 409].includes(Number(error.status))) {
      return adminAcademyErrorRedirect(res, req.params.academyId, error, "academy-students");
    }
    return next(error);
  }
};

exports.adminAssignAcademyStudentClass = async (req, res, next) => {
  try {
    await assignAdminAcademyMembershipClass({
      adminUserId: req.session.user.id,
      academyId: req.params.academyId,
      membershipId: req.params.membershipId,
      classId: String(req.body.classId || ""),
    });
    return res.redirect(303, `/admin/academies/${req.params.academyId}/members?done=studentClassUpdated#academy-students`);
  } catch (error) {
    if ([400, 403, 404, 409].includes(Number(error.status))) {
      return adminAcademyErrorRedirect(res, req.params.academyId, error, "academy-students");
    }
    return next(error);
  }
};

exports.adminUpdateAcademyClass = async (req, res, next) => {
  try {
    await updateAdminAcademyClass({
      adminUserId: req.session.user.id,
      academyId: req.params.academyId,
      classId: req.params.classId,
      action: req.body.action,
    });
    return res.redirect(303, `/admin/academies/${req.params.academyId}/classes?done=classUpdated#academy-classes`);
  } catch (error) {
    if ([400, 403, 404, 409].includes(Number(error.status))) {
      return adminAcademyErrorRedirect(res, req.params.academyId, error, "academy-classes");
    }
    return next(error);
  }
};

exports.adminUpdateAcademyClassOperations = async (req, res, next) => {
  try {
    await updateAdminAcademyClassOperations({
      adminUserId: req.session.user.id,
      academyId: req.params.academyId,
      classId: req.params.classId,
      weekdays: req.body.weekdays,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      effectiveFrom: req.body.effectiveFrom,
      attendanceMode: req.body.attendanceMode,
      opensBeforeMinutes: req.body.opensBeforeMinutes,
      lateAfterMinutes: req.body.lateAfterMinutes,
      closesAfterMinutes: req.body.closesAfterMinutes,
    });
    return res.redirect(303, `/admin/academies/${req.params.academyId}/classes?done=classOperationsUpdated#academy-classes`);
  } catch (error) {
    if ([400, 403, 404, 409].includes(Number(error.status))) {
      return adminAcademyErrorRedirect(res, req.params.academyId, error, "academy-classes");
    }
    return next(error);
  }
};

exports.adminTransferAcademyClassHomeroom = async (req, res, next) => {
  try {
    await transferAdminAcademyClassHomeroom({
      adminUserId: req.session.user.id,
      academyId: req.params.academyId,
      classId: req.params.classId,
      nextTeacherUserId: req.body.nextTeacherUserId,
      retainPreviousAsCoTeacher: req.body.retainPreviousAsCoTeacher === "true",
    });
    return res.redirect(303, `/admin/academies/${req.params.academyId}/classes?done=classHomeroomTransferred#academy-classes`);
  } catch (error) {
    if ([400, 403, 404, 409].includes(Number(error.status))) {
      return adminAcademyErrorRedirect(res, req.params.academyId, error, "academy-classes");
    }
    return next(error);
  }
};

exports.adminUpdateAcademyAttendance = async (req, res, next) => {
  try {
    await updateAdminAcademyAttendance({
      adminUserId: req.session.user.id,
      academyId: req.params.academyId,
      attendanceId: req.params.attendanceId,
      status: req.body.status,
      note: req.body.note,
    });
    return res.redirect(303, `/admin/academies/${req.params.academyId}/attendance?done=attendanceUpdated#academy-attendance`);
  } catch (error) {
    if ([400, 403, 404, 409].includes(Number(error.status))) {
      return adminAcademyErrorRedirect(res, req.params.academyId, error, "academy-attendance");
    }
    return next(error);
  }
};

exports.adminRegenerateAcademyAttendanceCode = async (req, res, next) => {
  try {
    await regenerateAdminAcademyAttendanceCode({
      adminUserId: req.session.user.id,
      academyId: req.params.academyId,
      sessionId: req.params.sessionId,
    });
    return res.redirect(303, `/admin/academies/${req.params.academyId}/attendance?done=attendanceCodeRegenerated#academy-attendance`);
  } catch (error) {
    if ([400, 403, 404, 409, 503].includes(Number(error.status))) {
      return adminAcademyErrorRedirect(res, req.params.academyId, error, "academy-attendance");
    }
    return next(error);
  }
};

exports.adminUpdateAcademyInvite = async (req, res, next) => {
  try {
    await updateAdminAcademyInvite({
      adminUserId: req.session.user.id,
      academyId: req.params.academyId,
      inviteId: req.params.inviteId,
      action: req.body.action,
    });
    return res.redirect(303, `/admin/academies/${req.params.academyId}/members?done=inviteUpdated#academy-invites`);
  } catch (error) {
    if ([400, 403, 404, 409].includes(Number(error.status))) {
      return adminAcademyErrorRedirect(res, req.params.academyId, error, "academy-invites");
    }
    return next(error);
  }
};

async function renderAdminAcademyReviewError(req, res, error) {
  return res.status(Number(error.status) || 400).render("admin-dashboard", {
    user: req.session.user,
    adminData: await getAdminDashboardData(),
    feedback: null,
    error: error.message,
    oldInput: null,
  });
}

exports.adminApproveAcademy = async (req, res, next) => {
  try {
    await approveAcademyApplication({
      adminUserId: req.session.user.id,
      academyId: req.params.academyId,
    });
    return res.redirect(303, safeAdminAcademyReturnPath(
      req.body.returnTo,
      "/admin?done=academyApproved#academy-applications"
    ));
  } catch (error) {
    if ([403, 404, 409].includes(Number(error.status))) {
      const returnTo = safeAdminAcademyReturnPath(req.body.returnTo, "");
      if (returnTo) {
        const basePath = returnTo.split(/[?#]/)[0];
        return res.redirect(303, `${basePath}?error=${encodeURIComponent(error.message)}#academy-control`);
      }
      return renderAdminAcademyReviewError(req, res, error);
    }
    return next(error);
  }
};

exports.adminRejectAcademy = async (req, res, next) => {
  try {
    await rejectAcademyApplication({
      adminUserId: req.session.user.id,
      academyId: req.params.academyId,
    });
    return res.redirect(303, safeAdminAcademyReturnPath(
      req.body.returnTo,
      "/admin?done=academyRejected#academy-applications"
    ));
  } catch (error) {
    if ([403, 404, 409].includes(Number(error.status))) {
      const returnTo = safeAdminAcademyReturnPath(req.body.returnTo, "");
      if (returnTo) {
        const basePath = returnTo.split(/[?#]/)[0];
        return res.redirect(303, `${basePath}?error=${encodeURIComponent(error.message)}#academy-control`);
      }
      return renderAdminAcademyReviewError(req, res, error);
    }
    return next(error);
  }
};

exports.adminRevenueMetrics = async (_req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.json({
      ok: true,
      revenue: await getAdminRevenueMetrics(),
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminRecordBusinessWithdrawal = async (req, res, next) => {
  try {
    await recordBusinessWithdrawal({
      adminUserId: req.session.user.id,
      amount: Number(req.body.amount),
      operatorNote: req.body.operatorNote,
    });
    return res.redirect("/admin?done=financeWithdrawal");
  } catch (error) {
    if ([400, 409, 503].includes(Number(error.status))) {
      return res.status(Number(error.status)).render("admin-dashboard", {
        user: req.session.user,
        adminData: await getAdminDashboardData(),
        feedback: null,
        error: error.message,
        oldInput: null,
        withdrawalInput: {
          amount: String(req.body.amount || ""),
          operatorNote: String(req.body.operatorNote || ""),
        },
      });
    }
    return next(error);
  }
};

exports.adminUpdateOtherUnpaidCosts = async (req, res, next) => {
  try {
    await updateOtherUnpaidCosts({
      adminUserId: req.session.user.id,
      amount: Number(req.body.amount),
      operatorNote: req.body.operatorNote,
    });
    return res.redirect("/admin?done=financeReserve");
  } catch (error) {
    if (Number(error.status) === 400) {
      return res.status(400).render("admin-dashboard", {
        user: req.session.user,
        adminData: await getAdminDashboardData(),
        feedback: null,
        error: error.message,
        oldInput: null,
        reserveInput: {
          amount: String(req.body.amount || ""),
          operatorNote: String(req.body.operatorNote || ""),
        },
      });
    }
    return next(error);
  }
};

exports.adminRefundsPage = async (req, res, next) => {
  try {
    const feedback = req.query.completed === "1"
      ? "환불 취소 거래와 권한 종료가 완료되었습니다."
      : req.query.rejected === "1"
        ? req.query.zero === "1"
          ? "환불 예정액 0원 건을 결제사 취소 없이 종결했습니다."
          : "환불 신청을 반려하고 사용자에게 처리 결과를 알렸습니다."
        : req.query.calculated === "1"
          ? "환불 예정액을 산정해 원장에 저장했습니다."
          : null;
    return res.render("admin-refunds", {
      user: req.session.user,
      refundData: await getAdminRefundData({
        page: req.query.page,
        status: req.query.status,
      }),
      feedback,
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminCalculateRefund = async (req, res, next) => {
  try {
    await calculateRefundRequest({
      adminUserId: req.session.user.id,
      refundRequestId: req.params.refundRequestId,
      paidFeatureUsed: req.body.paidFeatureUsed === "true",
    });
    return res.redirect("/admin/refunds?calculated=1");
  } catch (error) {
    return next(error);
  }
};

exports.adminCompleteRefund = async (req, res, next) => {
  try {
    await completeRefundRequest({
      adminUserId: req.session.user.id,
      refundRequestId: req.params.refundRequestId,
      approvedAmount: req.body.approvedAmount,
      cancellationMode: req.body.cancellationMode,
      providerCancellationTransactionKey: req.body.providerCancellationTransactionKey,
      providerCancelledAt: req.body.providerCancelledAt,
      operatorNote: req.body.operatorNote,
    });
    return res.redirect("/admin/refunds?completed=1");
  } catch (error) {
    return next(error);
  }
};

exports.adminRejectRefund = async (req, res, next) => {
  try {
    const result = await rejectRefundRequest({
      adminUserId: req.session.user.id,
      refundRequestId: req.params.refundRequestId,
      operatorNote: req.body.operatorNote,
    });
    return res.redirect(
      `/admin/refunds?rejected=1${result.zeroAmountClosure ? "&zero=1" : ""}`
    );
  } catch (error) {
    return next(error);
  }
};

exports.adminOperationsGuidePage = async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.render("admin-operations-guide", {
      user: req.session.user,
      guide: getAdminOperationsGuideData(),
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminArenaMatchesPage = async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    const reviewStatus = req.query.reviewStatus === "completed"
      ? "completed"
      : "pending";
    const [evidenceEntries, integrityReview] = await Promise.all([
      getAdminArenaEvidenceData(),
      getAdminArenaIntegrityData(),
    ]);
    return res.render("admin-arena-matches", {
      user: req.session.user,
      evidenceEntries,
      integrityReview,
      reviewStatus,
      adminNotice: ({
        supplementalRequested: "추가 소명자료 요청을 성공적으로 전송했습니다.\n요청 시각부터 24시간 타이머가 시작되었습니다.",
        reviewCompleted: "경기 검토 결과를 저장했습니다.\n알림 발송·매치메이킹 상태·경기 정산 처리가 완료되었습니다.",
        accountReviewCompleted: "계정 무결성 검토 결과를 저장했습니다. 관련 알림과 이용 상태를 갱신했습니다.",
        noteSaved: "운영 검토 메모를 저장했습니다.",
      })[String(req.query.notice || "")] || "",
      formatAdminMath,
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminActiveArenaMatchesPage = async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    return res.render("admin-arena-live-matches", {
      user: req.session.user,
      liveMatches: await getAdminActiveArenaMatchesData(),
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminArenaMatchHistoryPage = async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    return res.render("admin-arena-match-history", {
      user: req.session.user,
      history: await getAdminArenaMatchHistoryData({
        query: req.query.query,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        gameMode: req.query.gameMode,
        status: req.query.status,
        integrityStatus: req.query.integrityStatus,
        participantId: req.query.participant,
        page: req.query.page,
      }),
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminReviewArenaIntegrityCase = async (req, res, next) => {
  try {
    await reviewArenaIntegrityCase({
      caseId: req.params.caseId,
      adminUserId: req.session.user.id,
      decision: String(req.body.decision || "").trim().toUpperCase(),
      note: req.body.note,
    });
    return res.redirect(303, "/admin/arena-matches?reviewStatus=completed&notice=accountReviewCompleted#integrity-review");
  } catch (error) {
    return next(error);
  }
};

exports.adminReviewHeldArenaMatch = async (req, res, next) => {
  try {
    await reviewHeldArenaV2Match({
      matchId: req.params.matchId,
      adminUserId: req.session.user.id,
      decision: String(req.body.decision || "").trim().toUpperCase(),
      note: req.body.note,
    });
    const isNote = String(req.body.decision || "").trim().toUpperCase() === "NOTE";
    return res.redirect(303, `/admin/arena-matches?reviewStatus=${isNote ? "pending" : "completed"}&notice=${isNote ? "noteSaved" : "reviewCompleted"}#integrity-review`);
  } catch (error) {
    return next(error);
  }
};

exports.adminRequestArenaSupplementalEvidence = async (req, res, next) => {
  try {
    await requestArenaSupplementalEvidence({
      matchId: req.params.matchId,
      role: req.params.role,
      adminUserId: req.session.user.id,
      requestMessage: req.body.requestMessage,
    });
    return res.redirect(303, `/admin/arena-matches?reviewStatus=pending&notice=supplementalRequested#match-${req.params.matchId}`);
  } catch (error) {
    return next(error);
  }
};

exports.adminArenaEvidenceFile = async (req, res, next) => {
  try {
    const file = await getAdminEvidenceFile({
      evidenceId: req.params.evidenceId,
      storedName: req.params.storedName,
    });
    res.set("Cache-Control", "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");
    res.type(file.mimeType);
    if (file.cloudUrl) {
      return res.redirect(302, file.cloudUrl);
    }
    return res.sendFile(file.absolutePath);
  } catch (error) {
    return next(error);
  }
};

exports.adminArenaAuditPage = async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.render("admin-arena-audit", {
      user: req.session.user,
      audit: await getAdminArenaV2Audit(),
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminArenaAuditData = async (_req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.json({
      ok: true,
      audit: await getAdminArenaV2Audit(),
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminDataAnalysisPage = async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.render("admin-data-analysis", {
      user: req.session.user,
      analysis: await getAdminCurrentMetricsDashboard({
        periodKey: req.query.period || getKstMonthKey(),
      }),
      feedback:
        String(req.query.rebuilt || "") === "1"
          ? "선택한 월의 현행 운영 지표를 원본 데이터에서 새로 조회했습니다."
          : null,
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminRebuildDataAnalysis = async (req, res, next) => {
  try {
    const periodKey = String(req.body.periodKey || getKstMonthKey());
    await getAdminCurrentMetricsDashboard({ periodKey });
    return res.redirect(
      `/admin/data-analysis?period=${encodeURIComponent(periodKey)}&rebuilt=1`
    );
  } catch (error) {
    return next(error);
  }
};

function arenaPolicyFeedbackFromQuery(query = {}) {
  if (String(query.matchmakingPaused || "") === "1") {
    return "신규 GOAT Arena 매치메이킹을 일시정지했습니다. 이미 진행 중인 경기는 계속 완료할 수 있습니다.";
  }
  if (String(query.matchmakingResumed || "") === "1") {
    return "신규 GOAT Arena 매치메이킹을 다시 시작했습니다.";
  }
  if (String(query.placementReset || "") === "1") {
    return "검토 대상 사용자의 배치 시도를 승인된 운영 기록과 함께 초기화했습니다.";
  }
  if (String(query.normalRecordReviewed || "") === "1") {
    return "일반전 기록 검토를 완료했습니다. 사용자 불이익이나 이메일 발송은 적용되지 않았습니다.";
  }
  return null;
}

async function renderArenaPolicyAdminPage(
  req,
  res,
  {
    status = 200,
    error = null,
  } = {}
) {
  return res.status(status).render("admin-arena-policies", {
    user: req.session.user,
    policyData: await getAdminArenaV2Overview(),
    feedback: arenaPolicyFeedbackFromQuery(req.query),
    error,
  });
}

exports.adminArenaPoliciesPage =
  async (req, res, next) => {
    try {
      return await renderArenaPolicyAdminPage(req, res);
    } catch (error) {
      return next(error);
    }
  };

exports.adminSetArenaMatchmaking = async (req, res, next) => {
  try {
    const action = String(req.body.action || "").trim().toUpperCase();
    if (!["PAUSE", "RESUME"].includes(action)) {
      const error = new Error("매치메이킹 제어 명령을 확인해주세요.");
      error.status = 400;
      throw error;
    }
    await setMatchmakingPaused({
      adminUserId: req.session.user.id,
      paused: action === "PAUSE",
      reason: req.body.reason,
    });
    return res.redirect(
      `/admin/arena-policies?${action === "PAUSE" ? "matchmakingPaused" : "matchmakingResumed"}=1#matchmaking-control`
    );
  } catch (error) {
    if ([400, 403].includes(Number(error.status))) {
      return renderArenaPolicyAdminPage(req, res, {
        status: Number(error.status),
        error: error.message,
      });
    }
    return next(error);
  }
};

exports.adminReviewArenaNormalRecord = async (req, res, next) => {
  try {
    await reviewNormalRecordIntegrity({
      recordId: req.params.recordId,
      adminUserId: req.session.user.id,
      decision: req.body.decision,
      note: req.body.note,
    });
    return res.redirect("/admin/arena-policies?normalRecordReviewed=1#normal-record-review");
  } catch (error) {
    if ([400, 404, 409].includes(Number(error.status))) {
      return renderArenaPolicyAdminPage(req, res, {
        status: Number(error.status),
        error: error.message,
      });
    }
    return next(error);
  }
};

exports.adminPdfForensicsPage = async (req, res, next) => {
  try {
    return res.render("admin-pdf-forensics", {
      user: req.session.user,
      analysis: null,
      error: null,
      oldTraceCode: "",
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminAnalyzeForensicPdf = async (req, res, next) => {
  const uploadedPath = req.file?.path || "";
  const requestedTraceCode = String(req.body?.traceCode || "").trim();
  try {
    if (!uploadedPath && !requestedTraceCode) {
      const error = new Error("분석할 파일을 선택하거나 추적 코드를 입력해주세요.");
      error.status = 400;
      throw error;
    }
    if (uploadedPath && requestedTraceCode) {
      const error = new Error("파일과 추적 코드 중 한 가지만 선택해주세요.");
      error.status = 400;
      throw error;
    }
    const analysis = requestedTraceCode
      ? await analyzeForensicTraceCode(requestedTraceCode)
      : await analyzeForensicUpload(uploadedPath);
    return res.render("admin-pdf-forensics", {
      user: req.session.user,
      analysis,
      oldTraceCode: requestedTraceCode,
      error: analysis.matches.length
        ? null
        : analysis.validPayloads.length
          ? "PDF 안의 MATTHS 서명은 유효하지만 현재 DB의 사용자 발급 원장과 연결되지 않습니다. 계정 전체 삭제 또는 원장 보존 상태를 확인해주세요."
          : analysis.inputType === "TRACE_CODE"
            ? `입력한 추적 코드 ${analysis.manualTraceCode}와 일치하는 발급·경기 기록을 찾지 못했습니다.`
            : analysis.inputType === "IMAGE"
            ? analysis.traceCodes.length
              ? "스크린샷의 추적 코드는 읽었지만 현재 PDF 발급 또는 GOAT Arena 경기 기록과 연결되지 않습니다. 오래된 기록 보존 상태를 확인해주세요."
              : "스크린샷에서 PDF·GOAT Arena 추적 코드를 식별하지 못했습니다. 원본 해상도·자르기·덧칠·압축 상태를 확인하고, 가능하면 워터마크가 여러 번 보이는 넓은 영역을 다시 올려주세요."
            : "MATTHS 발급 기록을 찾지 못했습니다. 메타데이터 제거·전체 이미지화·과도한 편집 여부를 확인해주세요.",
    });
  } catch (error) {
    if ([400, 413, 422, 503].includes(Number(error.status))) {
      return res.status(Number(error.status)).render("admin-pdf-forensics", {
        user: req.session.user,
        analysis: null,
        error: error.message,
        oldTraceCode: requestedTraceCode,
      });
    }
    return next(error);
  } finally {
    if (uploadedPath) {
      await require("node:fs").promises.unlink(uploadedPath).catch(() => {});
    }
  }
};

async function renderAdminProblemBanksPage(
  req,
  res,
  { status = 200, error = "" } = {}
) {
  const typeCatalog = await getAdminProblemTypeCatalog({
    category: req.query.category || "CONCEPT_PRACTICE",
    query: req.query.q || "",
    inspectVersionId: req.query.inspect || "",
  });
  return res.status(status).render("admin-problem-banks", {
    user: req.session.user,
    catalog: getAdminProblemBankCatalog(),
    typeCatalog,
    error,
    query: req.query || {},
  });
}

exports.adminProblemBanksPage = async (req, res, next) => {
  try {
    return await renderAdminProblemBanksPage(req, res);
  } catch (error) {
    return next(error);
  }
};

exports.adminSyncProblemTypes = async (req, res, next) => {
  try {
    const result = await syncProblemTypeRegistry({
      adminUserId: req.session.user.id,
      activateSourceChanges: true,
    });
    const category = encodeURIComponent(
      req.body.category || "CONCEPT_PRACTICE"
    );
    return res.redirect(
      `/admin/problem-banks?category=${category}&typeSync=1&inserted=${result.inserted.length}&updated=${result.updated.length}#problem-type-catalog`
    );
  } catch (error) {
    if ([400, 409, 422].includes(Number(error.status))) {
      try {
        req.query.category = req.body.category || "CONCEPT_PRACTICE";
        return await renderAdminProblemBanksPage(req, res, {
          status: Number(error.status),
          error: error.message,
        });
      } catch (renderError) {
        return next(renderError);
      }
    }
    return next(error);
  }
};

exports.adminReviseProblemType = async (req, res, next) => {
  try {
    const created = await reviseProblemTypeVersion({
      adminUserId: req.session.user.id,
      versionId: req.params.versionId,
      input: req.body,
    });
    const category = encodeURIComponent(created.category);
    return res.redirect(
      `/admin/problem-banks?category=${category}&inspect=${created._id}&typeRevised=1#problem-type-catalog`
    );
  } catch (error) {
    if ([400, 404, 409, 422].includes(Number(error.status))) {
      try {
        req.query.category = req.body.category || "CONCEPT_PRACTICE";
        req.query.inspect = req.params.versionId;
        return await renderAdminProblemBanksPage(req, res, {
          status: Number(error.status),
          error: error.message,
        });
      } catch (renderError) {
        return next(renderError);
      }
    }
    return next(error);
  }
};

exports.adminCreateAnnouncement =
  async (req, res, next) => {
    try {
      await createAnnouncement({
        adminUserId:
          req.session.user.id,
        title: req.body.title,
        content:
          req.body.content,
        publishNow:
          req.body.publishNow,
        dashboardEndDate:
          req.body.dashboardEndDate,
        boardCategory:
          req.body.boardCategory,
      });

      return res.redirect(
        "/admin?done=announcement"
      );
    } catch (error) {
      if (
        Number(error.status) === 400
      ) {
        try {
          return res
            .status(400)
            .render(
              "admin-dashboard",
              {
                user:
                  req.session.user,
                adminData:
                  await getAdminDashboardData(),
                feedback: null,
                error:
                  error.message,
                oldInput:
                  req.body,
              }
            );
        } catch (renderError) {
          return next(renderError);
        }
      }

      return next(error);
    }
  };

exports.adminToggleAnnouncement =
  async (req, res, next) => {
    try {
      await toggleAnnouncement({
        adminUserId:
          req.session.user.id,
        announcementId:
          req.params
            .announcementId,
        publish:
          req.body.publish,
      });

      return res.redirect(
        "/admin?done=announcementStatus"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminInquiriesPage =
  async (req, res, next) => {
    try {
      return res.render(
        "admin-inquiries",
        {
          user:
            req.session.user,
          inquiryData:
            await getAdminInquiryData({
              status:
                req.query.status,
              page: req.query.page,
            }),
          feedback:
            adminFeedbackFromQuery(
              req.query
            ),
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminCoachSuggestionsPage =
  async (req, res, next) => {
    try {
      return res.render(
        "admin-coach-suggestions",
        {
          user:
            req.session.user,
          suggestionData:
            await getAdminSuggestionData(),
          feedback:
            req.query.moderated ===
            "1"
              ? "문구 검수 결과를 저장하고 실제 코치 문구 풀에 반영했습니다."
              : null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminReplyInquiry =
  async (req, res, next) => {
    try {
      await replyToInquiry({
        adminUserId:
          req.session.user.id,
        inquiryId:
          req.params.inquiryId,
        message:
          req.body.message,
      });

      return res.redirect(
        "/admin/inquiries?done=inquiryReply"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUpdateInquiryStatus =
  async (req, res, next) => {
    try {
      await updateInquiryStatus({
        adminUserId:
          req.session.user.id,
        inquiryId:
          req.params.inquiryId,
        status:
          req.body.status,
      });

      return res.redirect(
        "/admin/inquiries?done=inquiryStatus"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUsersPage =
  async (req, res, next) => {
    try {
      res.set(
        "Cache-Control",
        "no-store"
      );
      return res.render(
        "admin-users",
        {
          user:
            req.session.user,
          usersData:
            await getAdminUsersData({
              query:
                req.query.query,
              schoolCode:
                req.query.school,
              grade:
                req.query.grade,
              state:
                req.query.state,
              role:
                req.query.role,
              page:
                req.query.page,
              sort:
                req.query.sort,
            }),
          feedback:
            req.query.deleted === "1"
              ? "계정과 연결된 모든 학습·시험·Arena·게시판 데이터를 삭제했습니다."
              : null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUserSanctionsPage = async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.render("admin-user-sanctions", {
      user: req.session.user,
      sanctions: await getAdminSanctionHistory({ page: req.query.page }),
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminAuditLogPage = async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.render("admin-audit-log", {
      user: req.session.user,
      audit: await getAdminAuditHistory({
        page: req.query.page,
        adminUserId: req.query.admin,
        query: req.query.query,
      }),
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminUserDetailPage =
  async (req, res, next) => {
    try {
      const [detail, weeklyMockInsights] = await Promise.all([
        getAdminUserDetail(req.params.userId),
        getWeeklyMockInsights({ studentUserIds: [req.params.userId], scopeLabel: "개별 유저" }),
      ]);
      res.set(
        "Cache-Control",
        "no-store"
      );
      return res.render(
        "admin-user-detail",
        {
          user:
            req.session.user,
          detail,
          weeklyMockInsights,
          feedback:
            adminFeedbackFromQuery(
              req.query
            ),
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminParentDetailPage = async (req, res, next) => {
  try {
    return res.render("admin-parent-detail", {
      user: req.session.user,
      detail: await getAdminParentDetail(req.params.parentId),
      feedback: adminFeedbackFromQuery(req.query),
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminUpdateParentAccountStatus = async (req, res, next) => {
  try {
    await updateAdminParentStatus({
      adminUserId: req.session.user.id,
      parentId: req.params.parentId,
      isActive: req.body.isActive,
      reason: req.body.reason,
    });
    return res.redirect(`/admin/parents/${req.params.parentId}?done=parentAccountStatus`);
  } catch (error) {
    return next(error);
  }
};

exports.adminUpdateParentChildNotifications = async (req, res, next) => {
  try {
    await updateAdminParentChildNotifications({
      adminUserId: req.session.user.id,
      parentId: req.params.parentId,
      childUserId: req.params.childUserId,
      input: req.body,
    });
    return res.redirect(`/admin/parents/${req.params.parentId}?done=parentNotificationSettings#child-${req.params.childUserId}`);
  } catch (error) {
    return next(error);
  }
};

exports.adminRevokeParentChildLink = async (req, res, next) => {
  try {
    await revokeAdminParentChildLink({
      adminUserId: req.session.user.id,
      parentId: req.params.parentId,
      childUserId: req.params.childUserId,
      reason: req.body.reason,
    });
    return res.redirect(`/admin/parents/${req.params.parentId}?done=parentChildUnlinked`);
  } catch (error) {
    return next(error);
  }
};

exports.adminAssessmentDetailPage =
  async (req, res, next) => {
    try {
      res.set(
        "Cache-Control",
        "no-store"
      );

      return res.render(
        "admin-assessment-detail",
        {
          user:
            req.session.user,
          detail:
            await getAdminAssessmentDetail({
              userId:
                req.params.userId,
              attemptId:
                req.params
                  .attemptId,
            }),
          formatAdminMath,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUserActivityPage =
  async (req, res, next) => {
    try {
      res.set(
        "Cache-Control",
        "no-store"
      );

      return res.render(
        "admin-user-activity",
        {
          user:
            req.session.user,
          activity:
            await getAdminUserActivityData({
              userId:
                req.params.userId,
              kind:
                req.query.kind,
              page:
                req.query.page,
              sort:
                req.query.sort,
            }),
          formatAdminMath,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUpdateUserNickname =
  async (req, res, next) => {
    try {
      await updateUserNickname({
        adminUserId:
          req.session.user.id,
        userId:
          req.params.userId,
        reason:
          req.body.reason,
        baseUrl:
          process.env.APP_BASE_URL ||
          `${req.protocol}://${req.get("host")}`,
      });

      return res.redirect(
        `/admin/users/${req.params.userId}?done=nickname`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminSendUserNotification =
  async (req, res, next) => {
    try {
      await createDirectNotification({
        adminUserId:
          req.session.user.id,
        userId:
          req.params.userId,
        title: req.body.title,
        message:
          req.body.message,
        href: req.body.href,
      });

      return res.redirect(
        `/admin/users/${req.params.userId}?done=notification`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminSendParentNotification = async (req, res, next) => {
  try {
    await createParentDirectNotification({
      parentId: req.params.parentId,
      adminUserId: req.session.user.id,
      title: req.body.title,
      message: req.body.message,
      href: req.body.href,
    });
    return res.redirect(`/admin/parents/${req.params.parentId}?done=notification`);
  } catch (error) { return next(error); }
};

exports.adminSendUserEmail =
  async (req, res, next) => {
    try {
      await sendDirectUserEmail({
        adminUserId:
          req.session.user.id,
        userId:
          req.params.userId,
        subject:
          req.body.subject,
        message:
          req.body.message,
      });

      return res.redirect(
        `/admin/users/${req.params.userId}?done=email`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminSendPasswordReset =
  async (req, res, next) => {
    try {
      await sendUserPasswordReset({
        adminUserId:
          req.session.user.id,
        userId:
          req.params.userId,
        baseUrl:
          process.env.APP_BASE_URL ||
          `${req.protocol}://${req.get("host")}`,
      });

      return res.redirect(
        `/admin/users/${req.params.userId}?done=passwordReset`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminSetUserActive =
  async (req, res, next) => {
    try {
      await setUserActive({
        adminUserId:
          req.session.user.id,
        userId:
          req.params.userId,
        active:
          req.body.active ===
          "true",
        reason:
          req.body.reason,
      });

      return res.redirect(
        `/admin/users/${req.params.userId}?done=account`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUpdateUserRole =
  async (req, res, next) => {
    try {
      await updateUserRole({
        adminUserId:
          req.session.user.id,
        userId:
          req.params.userId,
        role: req.body.role,
        teacherAccessExpiresAt:
          req.body.teacherAccessExpiresAt,
        reason:
          req.body.reason,
      });

      return res.redirect(
        `/admin/users/${req.params.userId}?done=role`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUpdateUserAccountStatus =
  async (req, res, next) => {
    try {
      await updateUserAccountStatus({
        adminUserId:
          req.session.user.id,
        userId:
          req.params.userId,
        status:
          req.body.status,
        reason:
          req.body.reason,
        suspensionDays:
          req.body
            .suspensionDays,
        retainAnonymousData:
          req.body
            .retainAnonymousData,
      });

      return res.redirect(
        `/admin/users/${req.params.userId}?done=accountStatus`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminDeleteUserAccount = async (req, res, next) => {
  try {
    if (String(req.body.confirmation || "").trim() !== "계정삭제") {
      const error = new Error("확인란에 ‘계정삭제’를 정확히 입력해주세요.");
      error.status = 400;
      throw error;
    }
    await updateUserAccountStatus({
      adminUserId: req.session.user.id,
      userId: req.params.userId,
      status: "withdrawn",
      reason: req.body.reason,
      retainAnonymousData: req.body.dataRetention,
    });
    const purged = String(req.body.dataRetention) === "purged";
    return purged
      ? res.redirect("/admin/users?deleted=1")
      : res.redirect(`/admin/users/${req.params.userId}?done=accountStatus`);
  } catch (error) {
    return next(error);
  }
};

exports.adminUpdateUserWarningCount =
  async (req, res, next) => {
    try {
      await updateUserWarningCount({
        adminUserId:
          req.session.user.id,
        userId:
          req.params.userId,
        warningCount:
          req.body.warningCount,
        reason:
          req.body.reason,
      });

      return res.redirect(
        `/admin/users/${req.params.userId}?done=warningCount`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUpdateUserPackageAccess =
  async (req, res, next) => {
    try {
      await updateAdminPackageAccess({
        adminUserId: req.session.user.id,
        userId: req.params.userId,
        planCode: req.body.planCode,
        reason: req.body.reason,
      });
      return res.redirect(
        `/admin/users/${req.params.userId}?done=packageAccess`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.openUserNotification =
  async (req, res, next) => {
    try {
      const href =
        await markNotificationRead({
          userId:
            req.session.user.id,
          notificationId:
            req.params
              .notificationId,
        });

      return res.redirect(href);
    } catch (error) {
      return next(error);
    }
  };

exports.notificationInboxPage =
  async (req, res, next) => {
    try {
      return res.render(
        "notifications",
        {
          user:
            req.session.user,
          inbox:
            await getNotificationInbox({
              userId:
                req.session.user.id,
              page: req.query.page,
            }),
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.notificationDetailPage =
  async (req, res, next) => {
    try {
      res.set(
        "Cache-Control",
        "no-store"
      );

      return res.render(
        "notification-detail",
        {
          user:
            req.session.user,
          notification:
            await getNotificationDetail({
              userId:
                req.session.user.id,
              notificationId:
                req.params
                  .notificationId,
            }),
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.markAllUserNotificationsRead =
  async (req, res, next) => {
    try {
      await markAllNotificationsRead(
        req.session.user.id
      );

      return res.redirect(
        "/notifications"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.dismissDashboardAnnouncement =
  async (req, res, next) => {
    try {
      return res.json(
        await dismissDashboardAnnouncement({
          userId:
            req.session.user.id,
          announcementId:
            req.params
              .announcementId,
        })
      );
    } catch (error) {
      return next(error);
    }
  };

exports.dismissDashboardNotification =
  async (req, res, next) => {
    try {
      return res.json(
        await dismissDashboardNotification({
          userId:
            req.session.user.id,
          notificationId:
            req.params
              .notificationId,
        })
      );
    } catch (error) {
      return next(error);
    }
  };

exports.curriculumPage = (req, res, next) => {
  try {
    const curriculumData = loadCurriculum();

    res.render('curriculum', {
      curriculumData,
      user:
        req.session?.user ||
        null,
    });
  } catch (error) {
    next(error);
  }
};

function getRequestProfileAvatar(req) {
  return resolveArenaProfileAvatar(
    req.authenticatedUser?.preferences ||
      req.session?.user?.preferences ||
      {}
  );
}

function getRequestDashboardTutorial(req) {
  return dashboardTutorialView(
    req.authenticatedUser?.preferences ||
      req.session?.user?.preferences ||
      {}
  );
}

exports.main = async (req, res, next) => {
    try {
        const [dashboardData, arenaActivityLevel] =
          await Promise.all([
            getDashboardData(
                req.session.user.id,
                {
                    user:
                        req.authenticatedUser,
                }
            ),
            getArenaActivityLevel(
              req.session.user.id
            ),
          ]);

        res.set("Cache-Control", "private, no-store");
        return res.render("main", {
            user: dashboardData.user,
            dashboardData,
            arenaActivityLevel,
            arenaProfileAvatar: getRequestProfileAvatar(req),
            onboardingTutorial: getRequestDashboardTutorial(req),
        });
    } catch (error) {
        return next(error);
    }
};

exports.privateMockExamsPage = async (
  req,
  res,
  next
) => {
  try {
    const examData =
      await getPrivateMockExamPageData(
        req.session.user.id
      );
    if (
      examData.eligibility
        ?.status ===
      "integrity-restriction"
    ) {
      return res.redirect(
        "/account/private-mock-restriction"
      );
    }
    res.set(
      "Cache-Control",
      "private, no-store"
    );
    return res.render(
      "private-mock-exams",
      {
        user:
          req.session.user,
        examData,
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.privateMockRestrictionPage =
  async (req, res, next) => {
    try {
      const restrictionData =
        await getPrivateMockRestrictionData(
          req.session.user.id
        );
      res.set(
        "Cache-Control",
        "private, no-store"
      );
      return res.render(
        "private-mock-restriction",
        {
          user:
            restrictionData.user,
          restrictionData,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.privateMockExamPage =
  async (req, res, next) => {
    try {
      const examData =
        await getPrivateMockAttemptData({
          userId:
            req.session.user.id,
          examId:
            req.params.examId,
        });

      res.set(
        "Cache-Control",
        "private, no-store"
      );
      return res.render(
        "private-mock-exam",
        {
          user:
            req.session.user,
          examData,
        }
      );
    } catch (error) {
      if (error.eligibility) {
        return res.redirect(
          "/private-mock-exams"
        );
      }
      return next(error);
    }
  };

exports.privateMockExamFile =
  async (req, res, next) => {
    try {
      const file =
        await getPrivateMockExamFile({
          userId:
            req.session.user.id,
          examId:
            req.params.examId,
        });

      if (isPdfDownload({ mimeType: file.mimeType, name: file.name })) {
        const issued = await issuePersonalizedPdf({
          userId: req.session.user.id,
          examId: file.examId,
          sourceType: "WEEKLY_MOCK",
          sourceId: file.sourceId,
          originalName: file.name,
          storageRecord: file.sourceRecord,
          localPath: file.path,
        });
        allowSameOriginFraming(res);
        const cleanup = () => issued.cleanup().catch(() => {});
        res.once("finish", cleanup);
        res.once("close", cleanup);
        return res.sendFile(issued.filePath, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(issued.downloadName)}`,
            "Cache-Control": "private, no-store",
            "X-Matths-Trace": issued.traceCode,
          },
        }, (error) => {
          cleanup();
          if (error && !res.headersSent) return next(error);
          return undefined;
        });
      }

      if (file.cloudUrl) {
        res.set("Cache-Control", "private, no-store");
        res.set("Referrer-Policy", "no-referrer");
        return res.redirect(302, file.cloudUrl);
      }

      return res.sendFile(
        file.path,
        {
          headers: {
            "Content-Type":
              file.mimeType,
            "Content-Disposition":
              `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            "Cache-Control":
              "private, no-store",
          },
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.startPrivateMockExam =
  async (req, res, next) => {
    try {
      return res.json(
        await startPrivateMockAttempt({
          userId:
            req.session.user.id,
          examId:
            req.params.examId,
        })
      );
    } catch (error) {
      return next(error);
    }
  };

exports.privateMockFormulaFile =
  async (req, res, next) => {
    try {
      const file =
        await getPrivateMockFormulaFile({
          userId:
            req.session.user.id,
        });

      if (isPdfDownload({ mimeType: file.mimeType, name: file.name })) {
        const issued = await issuePersonalizedPdf({
          userId: req.session.user.id,
          examId: file.examId,
          sourceType: "FORMULA",
          sourceId: file.sourceId,
          assetId: file.assetId,
          originalName: file.name,
          storageRecord: file.sourceRecord,
          localPath: file.path,
        });
        allowSameOriginFraming(res);
        const cleanup = () => issued.cleanup().catch(() => {});
        res.once("finish", cleanup);
        res.once("close", cleanup);
        return res.sendFile(issued.filePath, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition":
              `inline; filename*=UTF-8''${encodeURIComponent(issued.downloadName)}`,
            "Cache-Control": "private, no-store",
            "X-Matths-Trace": issued.traceCode,
          },
        }, (error) => {
          cleanup();
          if (error && !res.headersSent) return next(error);
          return undefined;
        });
      }

      if (file.cloudUrl) {
        res.set("Cache-Control", "private, no-store");
        res.set("Referrer-Policy", "no-referrer");
        return res.redirect(302, file.cloudUrl);
      }

      return res.sendFile(
        file.path,
        {
          headers: {
            "Content-Type":
              file.mimeType,
            "Content-Disposition":
              `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            "Cache-Control":
              "private, no-store",
          },
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.savePrivateMockExamDraft =
  async (req, res, next) => {
    try {
      return res.json(
        await savePrivateMockDraft({
          userId:
            req.session.user.id,
          examId:
            req.params.examId,
          answers:
            req.body.answers,
          telemetryEvents:
            req.body
              .telemetryEvents,
        })
      );
    } catch (error) {
      return next(error);
    }
  };

exports.submitPrivateMockExam =
  async (req, res, next) => {
    try {
      const result =
        await submitPrivateMockAttempt({
          userId:
            req.session.user.id,
          examId:
            req.params.examId,
          answers:
            req.body.answers,
          telemetryEvents:
            req.body
              .telemetryEvents,
        });
      const activityUser =
        await recordStudyActivity(
          req.session.user.id,
          new Date(),
          result.elapsedMs
        );
      Object.assign(
        req.session.user,
        lifecycleSessionView(
          activityUser
        )
      );

      return res.json({
        submitted: true,
        result,
      });
    } catch (error) {
      return next(error);
    }
  };

exports.privateMockIntegrityCasePage =
  async (req, res, next) => {
    try {
      return res.render(
        "private-mock-integrity-case",
        {
          user:
            req.session.user,
          integrityCase:
            await getUserIntegrityCase({
              userId:
                req.session.user.id,
              caseId:
                req.params.caseId,
            }),
          feedback:
            req.query
              .submitted === "1"
              ? "풀이과정이 정상적으로 제출되었습니다. 검토 결과는 알림 우편함으로 안내합니다."
              : null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.submitPrivateMockIntegrityEvidence =
  async (req, res, next) => {
    try {
      await submitPrivateMockIntegrityEvidence({
        userId:
          req.session.user.id,
        caseId:
          req.params.caseId,
        files: req.files,
        note:
          req.body.note,
      });

      return res.redirect(
        `/integrity/cases/${req.params.caseId}?submitted=1`
      );
    } catch (error) {
      await Promise.all(
        (req.files || []).map(
          (file) =>
            discardArchiveUpload(
              file
            )
        )
      );
      return next(error);
    }
  };

exports.selectPrivateMockResult =
  async (req, res, next) => {
    try {
      return res.json({
        selected: true,
        result:
          await selectPrivateMockWeeklyAttempt({
            userId:
              req.session.user.id,
            weekKey:
              req.params.weekKey,
            attemptId:
              req.body.attemptId,
            defer:
              req.body.defer ===
                true ||
              req.body.defer ===
                "true",
          }),
      });
    } catch (error) {
      return next(error);
    }
  };

exports.adminPrivateMockExamsPage =
  async (req, res, next) => {
    try {
      const [examData, weeklyMockInsights] = await Promise.all([
        getAdminPrivateMockExamData(),
        getWeeklyMockInsights({ scopeLabel: "전체 유저" }),
      ]);
      return res.render(
        "admin-private-mock-exams",
        {
          user:
            req.session.user,
          examData,
          weeklyMockInsights,
          feedback:
            Number(
              req.query.created
            ) > 0
              ? {
                  type:
                    "success",
                  message:
                    `${Number(req.query.created)}개 회차를 등록하고 공개 예약을 확정했습니다.`,
                }
              : req.query
                    .deleted ===
                  "1"
                ? {
                    type:
                      "success",
                    message:
                      "예약된 Matths 주간 공식 모의고사를 삭제했습니다.",
                  }
              : req.query
                    .formulaUploaded ===
                  "1"
                ? {
                    type:
                      "success",
                    message:
                      "대기실 공식 암기 PDF를 등록했습니다.",
                  }
              : req.query
                    .formulaDeleted ===
                  "1"
                ? {
                    type:
                      "success",
                    message:
                      "공식 암기 PDF를 삭제했습니다.",
                  }
              : null,
          error: null,
          oldInput: {},
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminPrivateMockExamDetailPage =
  async (req, res, next) => {
    try {
      return res.render(
        "admin-private-mock-exam-detail",
        {
          user:
            req.session.user,
          detail:
            await getAdminPrivateMockExamDetailData({
              examId:
                req.params.examId,
            }),
          feedback:
            req.query
              .integrityRequested ===
            "1"
              ? {
                  type:
                    "success",
                  message:
                    "소명 자료 요청을 우편함과 이메일로 전송했습니다.",
                }
              : req.query
                    .integrityError
                ? {
                    type:
                      "error",
                    message:
                      String(
                        req.query
                          .integrityError
                      ),
                  }
                : req.query
                      .integrityReviewed ===
                    "1"
                  ? {
                      type:
                        "success",
                      message:
                        "소명 검토 상태와 페널티 결정을 저장했습니다.",
                    }
                  : req.query
                        .answerCorrected !==
                      undefined
                    ? {
                        type:
                          "success",
                        message:
                          `정답을 정정하고 ${Number(req.query.answerCorrected) || 0}개 응시 기록의 성적·시험 결과와 경쟁전 내부 실력 지표를 다시 계산했습니다.`,
                      }
                : null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminPrivateMockExamPdfFile =
  async (req, res, next) => {
    try {
      const file =
        await getAdminPrivateMockPdfFile({
          examId:
            req.params.examId,
          fileType:
            req.params.fileType,
        });

      if (file.cloudUrl) {
        res.set("Cache-Control", "private, no-store");
        res.set("Referrer-Policy", "no-referrer");
        return res.redirect(302, file.cloudUrl);
      }

      return res.sendFile(
        file.path,
        {
          headers: {
            "Content-Type":
              file.mimeType,
            "Content-Disposition":
              `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            "Cache-Control":
              "private, no-store",
          },
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminPrivateMockIntegrityEvidenceFile =
  async (req, res, next) => {
    try {
      const file =
        await getAdminPrivateMockIntegrityEvidenceFile({
          caseId:
            req.params.caseId,
          archiveItemId:
            req.params.archiveItemId,
        });

      if (file.cloudUrl) {
        res.set("Cache-Control", "private, no-store");
        res.set("Referrer-Policy", "no-referrer");
        return res.redirect(302, file.cloudUrl);
      }

      return res.sendFile(
        file.path,
        {
          headers: {
            "Content-Type":
              file.mimeType,
            "Content-Disposition":
              `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            "Cache-Control":
              "private, no-store",
            "Content-Security-Policy":
              "sandbox; default-src 'none'",
            "X-Content-Type-Options":
              "nosniff",
            "Cross-Origin-Resource-Policy":
              "same-origin",
            "Referrer-Policy":
              "no-referrer",
          },
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminRequestPrivateMockIntegrityEvidence =
  async (req, res, next) => {
    try {
      await requestPrivateMockIntegrityEvidenceByAdmin({
        adminUserId:
          req.session.user.id,
        examId:
          req.params.examId,
        attemptId:
          req.params.attemptId,
        requestedQuestionNumbers:
          req.body
            .requestedQuestionNumbers,
        instructions:
          req.body.instructions,
      });

      return res.redirect(
        `/admin/private-mock-exams/${req.params.examId}?integrityRequested=1#attempt-${req.params.attemptId}`
      );
    } catch (error) {
      if (error.status) {
        return res.redirect(
          `/admin/private-mock-exams/${req.params.examId}?integrityError=${encodeURIComponent(error.message)}#attempt-${req.params.attemptId}`
        );
      }
      return next(error);
    }
  };

exports.adminReviewPrivateMockIntegrityCase =
  async (req, res, next) => {
    try {
      await reviewPrivateMockIntegrityCase({
        adminUserId:
          req.session.user.id,
        examId:
          req.params.examId,
        caseId:
          req.params.caseId,
        reviewStatus:
          req.body.reviewStatus,
        penaltyDecision:
          req.body.penaltyDecision,
        reason:
          req.body.reason,
      });
      return res.redirect(
        `/admin/private-mock-exams/${req.params.examId}?integrityReviewed=1#integrity-${req.params.caseId}`
      );
    } catch (error) {
      if (error.status) {
        return res.redirect(
          `/admin/private-mock-exams/${req.params.examId}?integrityError=${encodeURIComponent(error.message)}#integrity-${req.params.caseId}`
        );
      }
      return next(error);
    }
  };

exports.adminCorrectPrivateMockAnswers =
  async (req, res, next) => {
    try {
      const asArray = (
        value
      ) =>
        Array.isArray(value)
          ? value
          : value ===
                undefined ||
              value === null
            ? []
            : [value];
      const numbers =
        asArray(
          req.body
            .questionNumbers
        );
      const contents =
        asArray(
          req.body
            .questionContents
        );
      const answers =
        asArray(
          req.body
            .newAnswers
        );
      const result =
        await correctPrivateMockAnswers({
          adminUserId:
            req.session.user.id,
          examId:
            req.params.examId,
          corrections:
            numbers.map(
              (
                questionNumber,
                index
              ) => ({
                questionNumber,
                questionContent:
                  contents[
                    index
                  ],
                newAnswer:
                  answers[index],
              })
            ),
          reason:
            req.body.reason,
        });
      return res.redirect(
        `/admin/private-mock-exams/${req.params.examId}?answerCorrected=${result.affectedAttemptCount}`
      );
    } catch (error) {
      if (error.status) {
        return res.redirect(
          `/admin/private-mock-exams/${req.params.examId}?integrityError=${encodeURIComponent(error.message)}`
        );
      }
      return next(error);
    }
  };

exports.adminCreatePrivateMockExam =
  async (req, res, next) => {
    try {
      const files =
        req.files || {};
      const created =
        await createPrivateMockExamBatch({
        user:
          req.session.user,
        questionFiles:
          files.examFiles,
        answerKeyFiles:
          files.answerKeyFiles,
        answerSheetFiles:
          files.answerSheetFiles,
        titles:
          req.body.titles,
        examDates:
          req.body.examDates,
        customReleaseAts:
          req.body.customReleaseAts,
        formCodes:
          req.body.formCodes,
      });

      return res.redirect(
        `/admin/private-mock-exams?created=${created.length}`
      );
    } catch (error) {
      await Promise.all(
        Object.values(
          req.files || {}
        )
          .flat()
          .map((file) =>
            discardArchiveUpload(
              file
            )
          )
      );

      if (error.status) {
        return res
          .status(error.status)
          .render(
            "admin-private-mock-exams",
            {
              user:
                req.session.user,
              examData:
                await getAdminPrivateMockExamData(),
              feedback: null,
              error:
                error.message,
              oldInput:
                req.body,
            }
          );
      }

      return next(error);
    }
  };

exports.adminDeletePrivateMockExam =
  async (req, res, next) => {
    try {
      await deletePrivateMockExam({
        user:
          req.session.user,
        examId:
          req.params.examId,
      });

      return res.redirect(
        "/admin/private-mock-exams?deleted=1"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUploadPrivateMockFormula =
  async (req, res, next) => {
    try {
      await createPrivateMockFormulaResource({
        user:
          req.session.user,
        file: req.file,
        versionLabel:
          req.body
            .versionLabel,
      });
      return res.redirect(
        "/admin/private-mock-exams?formulaUploaded=1"
      );
    } catch (error) {
      await discardArchiveUpload(
        req.file
      );
      return next(error);
    }
  };

exports.adminDeletePrivateMockFormula =
  async (req, res, next) => {
    try {
      await deletePrivateMockFormulaResource({
        user:
          req.session.user,
        resourceId:
          req.params.resourceId,
      });
      return res.redirect(
        "/admin/private-mock-exams?formulaDeleted=1"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.warOfMastersPage = async (
  req,
  res,
  next
) => {
  try {
    const [
      user,
      placement,
      paidPackageAccess,
    ] = await Promise.all([
      req.authenticatedUser
        ? Promise.resolve(
            typeof req.authenticatedUser.toObject === "function"
              ? req.authenticatedUser.toObject()
              : req.authenticatedUser
          )
        : User.findById(
            req.session.user.id
          ).lean(),
      getPlacementDashboardData(
        req.session.user.id
      ),
      getPaidPackageAccess(
        req.session.user.id
      ),
    ]);
    const privateMockEligibility =
      await getPrivateMockEligibility(
        req.session.user.id
      );

    if (!user) {
      throw createNotFoundError(
        "사용자 정보를 찾을 수 없습니다."
      );
    }

    if (
      privateMockEligibility.status ===
      "integrity-restriction"
    ) {
      return res.redirect(
        "/account/private-mock-restriction"
      );
    }

    const gradeLabels = {
      10: "고등학교 1학년",
      11: "고등학교 2학년",
      12: "고등학교 3학년",
      13: "N수생",
      14: "대학생",
      15: "직장인",
    };

    res.set("Cache-Control", "no-store");

    return res.render(
      "war-of-masters",
      {
        user,
        arenaUser: {
          nickname:
            String(user.name || "학생"),
          displayName:
            getRankingDisplayName(user),
          schoolName:
            String(
              Number(user.schoolGrade) === 14
                ? user.university?.name || "대학교 미설정"
                : Number(user.schoolGrade) === 15
                  ? "직장인"
                  : Number(user.schoolGrade) === 13
                    ? "N수생"
                    : user.school?.name || "학교 미설정"
            ),
          gradeLabel:
            gradeLabels[
              Number(user.schoolGrade)
            ] || "학년 미설정",
          displayMode: "닉네임",
        },
        placement,
        paidPackageAccess,
        privateMockEligibility,
        onboardingTutorial: getRequestDashboardTutorial(req),
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.privateMockObjectionPage =
  async (req, res, next) => {
    try {
      return res.render(
        "private-mock-objection",
        {
          user:
            req.session.user,
          formData:
            await getPrivateMockObjectionFormData({
              userId:
                req.session.user.id,
            }),
          feedback:
            req.query.submitted ===
            "1"
              ? {
                  type:
                    "success",
                  message:
                    "문제 이의신청이 접수되었습니다. 운영팀 검토 결과는 이메일과 알림 우편함으로 안내드립니다.",
                }
              : null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.submitPrivateMockObjection =
  async (req, res, next) => {
    try {
      await createPrivateMockObjection({
        userId:
          req.session.user.id,
        examId:
          req.body.examId,
        questionNumber:
          req.body
            .questionNumber,
        issueDetail:
          req.body
            .issueDetail,
      });
      return res.redirect(
        "/war-of-masters/objections/new?submitted=1"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminPrivateMockObjectionPage =
  async (req, res, next) => {
    try {
      return res.render(
        "admin-private-mock-objection",
        {
          user:
            req.session.user,
          objection:
            await getAdminPrivateMockObjection({
              objectionId:
                req.params
                  .objectionId,
            }),
          feedback: null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminRejectPrivateMockObjection =
  async (req, res, next) => {
    try {
      await rejectPrivateMockObjection({
        adminUserId:
          req.session.user.id,
        objectionId:
          req.params
            .objectionId,
        reason:
          req.body.reason,
      });
      return res.redirect(
        "/admin/todos?done=1"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminAcceptPrivateMockObjection =
  async (req, res, next) => {
    try {
      await acceptPrivateMockObjection({
        adminUserId:
          req.session.user.id,
        objectionId:
          req.params
            .objectionId,
        newAnswer:
          req.body.newAnswer,
        questionContent:
          req.body
            .questionContent,
        reason:
          req.body.reason,
      });
      return res.redirect(
        "/admin/todos?done=1"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.warOfMastersRankingsPage =
  async (req, res, next) => {
    try {
      const [user, ranking] =
        await Promise.all([
          req.authenticatedUser
            ? Promise.resolve(
                typeof req.authenticatedUser.toObject === "function"
                  ? req.authenticatedUser.toObject()
                  : req.authenticatedUser
              )
            : User.findById(
                req.session.user.id
              ).lean(),
          getRankingData(
            req.session.user.id
          ),
        ]);

      if (!user) {
        throw createNotFoundError(
          "사용자 정보를 찾을 수 없습니다."
        );
      }

      res.set(
        "Cache-Control",
        "no-store"
      );

      return res.render(
        "war-of-masters-rankings",
        {
          user,
          ranking,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.startPlacementExam = async (
  req,
  res,
  next
) => {
  try {
    const attempt =
      await createPlacementAttempt({
        userId:
          req.session.user.id,
      });

    return res.redirect(
      `/war-of-masters/placement/${attempt._id}`
    );
  } catch (error) {
    return next(error);
  }
};

exports.placementExamPage = async (
  req,
  res,
  next
) => {
  try {
    res.set(
      "Cache-Control",
      "no-store"
    );

    const attempt =
      await getPlacementAttempt({
        userId:
          req.session.user.id,
        attemptId:
          req.params.attemptId,
      });

    return res.render(
      "assessment-attempt",
      {
        user: req.session.user,
        attempt,
        difficultyLabels:
          DIFFICULTY_LABELS,
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.submitPlacementExam =
  async (req, res, next) => {
    try {
      const attempt =
        await submitPlacementAttempt({
          userId:
            req.session.user.id,
          attemptId:
            req.params.attemptId,
          answers:
            req.body?.answers || {},
          activeQuestionId:
            req.body
              ?.activeQuestionId ||
            "",
          currentQuestionIndex:
            Number(
              req.body
                ?.currentQuestionIndex
            ) || 0,
        });

      const activityUser =
        await recordStudyActivity(
          req.session.user.id,
          attempt.submittedAt ||
            new Date(),
          attempt.elapsedTimeMs
        );
      Object.assign(
        req.session.user,
        lifecycleSessionView(
          activityUser
        )
      );

      return res.redirect(
        `/war-of-masters/placement/${attempt._id}`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.savePlacementExamDraft =
  async (req, res, next) => {
    try {
      const result =
        await savePlacementDraft({
          userId:
            req.session.user.id,
          attemptId:
            req.params.attemptId,
          answers:
            req.body?.answers || {},
          activeQuestionId:
            req.body
              ?.activeQuestionId ||
            "",
          currentQuestionIndex:
            Number(
              req.body
                ?.currentQuestionIndex
            ) || 0,
          closeQuestionTiming:
            req.body
              ?.closeQuestionTiming ===
            true,
        });

      return res.json(result);
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .json({
            message:
              error.message,
          });
      }

      return next(error);
    }
  };

exports.expirePlacementExam =
  async (req, res, next) => {
    try {
      const attempt =
        await expirePlacementAttempt({
          userId:
            req.session.user.id,
          attemptId:
            req.params.attemptId,
          answers:
            req.body?.answers || {},
          activeQuestionId:
            req.body
              ?.activeQuestionId ||
            "",
          currentQuestionIndex:
            Number(
              req.body
                ?.currentQuestionIndex
            ) || 0,
        });

      if (
        !attempt.$locals
          ?.wasAlreadyFinalized
      ) {
        const activityUser =
          await recordStudyActivity(
            req.session.user.id,
            attempt.submittedAt ||
              new Date(),
            attempt.elapsedTimeMs
          );
        Object.assign(
          req.session.user,
          lifecycleSessionView(
            activityUser
          )
        );
      }

      return res.json({
        status: attempt.status,
        expired: true,
        autoSubmitted:
          attempt.status ===
          "submitted",
        redirectUrl:
          `/war-of-masters/placement/${attempt._id}`,
      });
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .json({
            message:
              error.message,
            remainingTimeMs:
              error.remainingTimeMs,
          });
      }

      return next(error);
    }
  };

exports.togglePlanTask = async (
    req,
    res,
    next
) => {
    try {
        const plan =
            await toggleDailyPlanTask(
                req.session.user.id,
                req.params.taskId
            );

        if (!plan) {
            return res.status(404).json({
                message:
                    "오늘의 학습 계획을 찾을 수 없습니다.",
            });
        }

        return res.json({ plan });
    } catch (error) {
        return next(error);
    }
};

exports.changeCoachMode = async (
    req,
    res,
    next
) => {
    try {
        const coach =
            await updateCoachMode(
                req.session.user.id,
                req.body.mode,
                req.body.situation
            );

        if (!coach) {
            return res.status(400).json({
                message:
                    "올바른 코치 모드를 선택해주세요.",
            });
        }

        req.session.user.preferences = {
            ...(req.session.user.preferences ||
                {}),
            coachMode: coach.mode,
        };

        return req.session.save((error) => {
            if (error) {
                return next(error);
            }

            return res.json({ coach });
        });
    } catch (error) {
        return next(error);
    }
};

exports.changeProfileCoachMode = async (
    req,
    res,
    next
) => {
    try {
        const coach =
            await updateCoachMode(
                req.session.user.id,
                req.body.mode,
                "unanswered"
            );

        if (!coach) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "coach-mode",
                    type: "error",
                    message:
                        "올바른 학습 모드를 선택해주세요.",
                },
            });
        }

        req.session.user.preferences = {
            ...(req.session.user.preferences ||
                {}),
            coachMode: coach.mode,
        };
        await saveSession(req);

        return res.redirect(
            "/profile?coachModeUpdated=1#coach-mode-settings"
        );
    } catch (error) {
        return next(error);
    }
};

exports.myLearning = async (req, res, next) => {
  try {
    const { learningData } = await getUserLearningData(
      req.session.user.id
    );

    res.set("Cache-Control", "private, no-store");
    return res.render("my-learning", {
      learningData,
      user: req.session.user,
      arenaProfileAvatar: getRequestProfileAvatar(req),
      onboardingTutorial: getRequestDashboardTutorial(req),
    });
  } catch (error) {
    return next(error);
  }
};

exports.unitLearning = async (
  req,
  res,
  next
) => {
  try {
    if (!isCourseAvailable(req.params.courseId)) {
      const error = new Error("현재 준비 중인 과목입니다. 제공이 시작되면 안내하겠습니다.");
      error.status = 423;
      error.code = "COURSE_IN_DEVELOPMENT";
      return next(error);
    }
    const { learningData } =
      await getUserLearningData(
        req.session.user.id
      );

    const unitView = findUnitView(
      learningData,
      req.params.courseId,
      req.params.unitId,
      req.params.conceptId
    );

    if (!unitView) {
      const error = new Error(
        "학습 단원을 찾을 수 없습니다."
      );

      error.status = 404;
      return next(error);
    }

    const conceptId =
      unitView.selectedConcept.id;

    const reviewAttemptId = String(
      req.query.reviewAttempt || ""
    ).trim();

    const [
      lesson,
      conceptProgress,
      reviewContext,
      assessmentData,
    ] =
      await Promise.all([
        ConceptLesson.findOne({
          curriculumId: "kr-2022",
          courseId: unitView.course.id,
          unitId: unitView.unit.id,
          conceptId,
          isPublished: true,
        }).lean(),

        ConceptProgress.findOne({
          userId: req.session.user.id,
          curriculumId: "kr-2022",
          courseId: unitView.course.id,
          unitId: unitView.unit.id,
          conceptId,
        }).lean(),

        reviewAttemptId
          ? getReviewContext({
              userId: req.session.user.id,
              reviewAttemptId,
              courseId: unitView.course.id,
              unitId: unitView.unit.id,
              conceptId,
            })
          : null,

        getAssessmentCenterData(
          req.session.user.id
        ),
      ]);

    const mastery =
      conceptProgress?.masteryGate || {
        requiredDistinctTypes:
          lesson?.practice
            ?.requiredDistinctTypes || 5,

        correctTypeIds: [],
        unlockedAt: null,
        userCompleted: false,
        completedAt: null,
      };

    const renderedLesson =
      formatAlgebraLesson(lesson);
    const conceptTypeGuides =
      getConceptTypeGuides({
        courseId: unitView.course.id,
        unitId: unitView.unit.id,
        conceptId,
      });
    const assessmentCourse =
      assessmentData.courses.find(
        (item) =>
          item.id ===
          unitView.course.id
      );
    const assessmentUnit =
      assessmentCourse?.units.find(
        (item) =>
          item.id ===
          unitView.unit.id
      );
    const subunitAssessment =
      assessmentUnit?.subunits.find(
        (item) =>
          item.concepts.some(
            (assessmentConcept) =>
              assessmentConcept.id ===
              conceptId
          )
      ) || null;

    res.set("Cache-Control", "private, no-store");
    return res.render("unit-learning", {
      learningData,
      unitView,
      lesson: renderedLesson,
      mastery,
      reviewContext,
      subunitAssessment,
      conceptTypeGuides,
      user: req.session.user,
      arenaProfileAvatar: getRequestProfileAvatar(req),
    });
  } catch (error) {
    return next(error);
  }
};

function renderRegisterError(res, status, error, oldInput = {}) {
    return res.status(status).render("register", {
        schoolRegions: getSchoolSelectData(),
        universities: getUniversitySelectData(),
        socialRegistration:
          res.locals.socialRegistration || null,
        arenaGuestRegistrationClaim:
          res.locals.arenaGuestRegistrationClaim || null,
        error,
        oldInput: {
            realName: "",
            birthDate: "",
            name: "",
            email: "",
            schoolGrade: 10,
            schoolRegion: "",
            schoolCode: "",
            overseasSchoolName: "",
            universityCode: "",
            overseasUniversityName: "",
            ...oldInput,
        },
    });
}

function createLoginSession(req, user) {
  return require("../services/webLoginService").establishWebSession(req, { kind: "user", user });
}

exports.register = async (req, res, next) => {
    try {
        const socialRegistration =
          getPendingSocialRegistration(req);

        if (socialRegistration && socialRegistration.accountType !== "student") {
          return res.redirect(require("../services/portalSocialAuthService").registrationUrl(socialRegistration));
        }
        res.locals.socialRegistration =
          socialRegistration;
        const pendingArenaGuestClaimContext =
          req.session?.arenaGuestRegistrationClaim || null;
        const arenaGuestReverseIntent = Boolean(
          pendingArenaGuestClaimContext?.sourceAttemptId &&
          String(req.session?.returnTo || "") ===
            `/goat-arena/guest-records/${encodeURIComponent(
              String(pendingArenaGuestClaimContext.sourceAttemptId)
            )}?reverse=1`
        );
        const arenaGuestRegistrationClaim =
          await getArenaGuestRegistrationClaimForRequest(req, {
            createIfMissing: false,
          });
        res.locals.arenaGuestRegistrationClaim =
          arenaGuestRegistrationClaim;
        const realNameValidation = validateRealName(
            req.body.realName
        );
        const realName = realNameValidation.realName;
        const name = String(req.body.name || "").trim();
        const email = String(
          socialRegistration?.email || req.body.email || ""
        )
            .trim()
            .toLowerCase();
        const appleRegistration =
          socialRegistration?.provider === "apple";
        let appleProvisionalUser = null;
        if (appleRegistration) {
          const provisionalUserId =
            socialRegistration.provisionalUserId;
          const [provisionalUser, appleCredential] = await Promise.all([
            User.findOne({
              _id: provisionalUserId,
              email,
            }).select(`+birthDate ${SOCIAL_AUTH_SELECT}`),
            AppleAuthCredential.exists({
              userId: provisionalUserId,
              appleSubject:
                socialRegistration.providerUserId,
            }),
          ]);
          if (!provisionalUser || !appleCredential) {
            clearPendingSocialRegistration(req);
            res.locals.socialRegistration = null;
            return renderRegisterError(
              res,
              400,
              "Apple 가입 인증이 만료되었거나 올바르지 않습니다. 로그인 화면에서 다시 시작해주세요."
            );
          }
          appleProvisionalUser = provisionalUser;
        }
        const birthDateInput = String(
            req.body.birthDate || ""
        ).trim();

        const schoolGrade = Number(req.body.schoolGrade);
        const schoolRegion = String(req.body.schoolRegion || "").trim();
        const schoolCode = String(req.body.schoolCode || "").trim();
        const overseasSchoolName = String(
            req.body.overseasSchoolName || ""
        );
        const universityCode = String(req.body.universityCode || "").trim();
        const overseasUniversityName = String(
            req.body.overseasUniversityName || ""
        );

        const password = String(req.body.password || "");
        const passwordConfirm = String(req.body.passwordConfirm || "");

        const termsAccepted = ["true", "on", "1"].includes(
            String(req.body.termsAccepted || "")
        );

        // 비밀번호는 oldInput에 절대 포함하지 않는다.
        const oldInput = {
            realName,
            birthDate: birthDateInput,
            name,
            email,
            schoolGrade,
            schoolRegion,
            schoolCode,
            overseasSchoolName,
            universityCode,
            overseasUniversityName,
        };

        if (
            !realName ||
            !birthDateInput ||
            !name ||
            !email ||
            ([10, 11, 12].includes(schoolGrade) &&
                (!schoolRegion || !schoolCode)) ||
            (schoolGrade === 14 && !universityCode) ||
            (!socialRegistration && !password) ||
            (!socialRegistration && !passwordConfirm)
        ) {
            return renderRegisterError(
                res,
                400,
                "필수 항목을 모두 입력해주세요.",
                oldInput
            );
        }

        if (!realNameValidation.valid) {
            return renderRegisterError(
                res,
                400,
                realNameValidation.message,
                oldInput
            );
        }

        if (name.length < 2 || name.length > 30) {
            return renderRegisterError(
                res,
                400,
                "닉네임은 2자 이상 30자 이하로 입력해주세요.",
                oldInput
            );
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(email)) {
            return renderRegisterError(
                res,
                400,
                "올바른 이메일 주소를 입력해주세요.",
                oldInput
            );
        }

        if (![10, 11, 12, 13, 14, 15].includes(schoolGrade)) {
            return renderRegisterError(
                res,
                400,
                "올바른 학습자 구분을 선택해주세요.",
                oldInput
            );
        }

        if (!socialRegistration && password.length < 8) {
            return renderRegisterError(
                res,
                400,
                "비밀번호는 8자 이상이어야 합니다.",
                oldInput
            );
        }

        if (!socialRegistration && Buffer.byteLength(password, "utf8") > 72) {
            return renderRegisterError(
                res,
                400,
                "비밀번호가 너무 깁니다.",
                oldInput
            );
        }

        if (!socialRegistration && password !== passwordConfirm) {
            return renderRegisterError(
                res,
                400,
                "비밀번호가 서로 일치하지 않습니다.",
                oldInput
            );
        }

        if (!termsAccepted) {
            return renderRegisterError(
                res,
                400,
                "이용약관에 동의해주세요.",
                oldInput
            );
        }

        let birthDate;
        try {
            birthDate = normalizeBirthDate(
                birthDateInput
            ).birthDate;
        } catch (error) {
            return renderRegisterError(
                res,
                400,
                error.message,
                oldInput
            );
        }

        /*
         * 브라우저가 보낸 학교 이름을 그대로 저장하지 않고,
         * YAML 데이터에서 학교 코드가 실제로 존재하는지 확인한다.
         */
        const selectedSchool =
            [10, 11, 12].includes(schoolGrade)
                ? schoolCode === OVERSEAS_HIGH_SCHOOL_OPTION_CODE
                    ? buildOverseasSchool(overseasSchoolName).school
                    : findSchool(
                          schoolRegion,
                          schoolCode
                      )
                : null;

        const selectedUniversity =
            schoolGrade === 14
                ? universityCode === OVERSEAS_UNIVERSITY_OPTION_CODE
                    ? buildOverseasUniversity(overseasUniversityName).university
                    : findUniversity(universityCode)
                : null;
        if (
            [10, 11, 12].includes(schoolGrade) &&
            schoolCode === OVERSEAS_HIGH_SCHOOL_OPTION_CODE &&
            !selectedSchool
        ) {
            return renderRegisterError(
                res,
                400,
                buildOverseasSchool(overseasSchoolName).error,
                oldInput
            );
        }
        if (
            schoolGrade === 14 &&
            universityCode === OVERSEAS_UNIVERSITY_OPTION_CODE &&
            !selectedUniversity
        ) {
            return renderRegisterError(
                res,
                400,
                buildOverseasUniversity(overseasUniversityName).error,
                oldInput
            );
        }

        if ([10, 11, 12].includes(schoolGrade) && !selectedSchool) {
            return renderRegisterError(
                res,
                400,
                "올바른 고등학교를 선택해주세요.",
                oldInput
            );
        }

        if (arenaGuestReverseIntent && !arenaGuestRegistrationClaim) {
          return renderRegisterError(
            res,
            409,
            "도전장 기록 연결 확인이 만료되었습니다. 완료한 도전장 결과에서 역도전장 제안을 다시 시작해 주세요.",
            oldInput
          );
        }
        if (schoolGrade === 14 && !selectedUniversity) {
            return renderRegisterError(
                res,
                400,
                "목록에서 재학 중인 대학교를 선택해주세요.",
                oldInput
            );
        }

        const socialIdentityPath = socialRegistration
          ? socialIdPath(socialRegistration.provider)
          : "";
        const socialIdentityField = socialIdentityPath.replace(
          /^socialAuth\./,
          ""
        );
        const socialIdentityQuery = socialRegistration
          ? {
              [socialIdentityPath]:
                socialRegistration.providerUserId,
              ...(appleProvisionalUser
                ? {
                    _id: {
                      $ne: appleProvisionalUser._id,
                    },
                  }
                : {}),
            }
          : { _id: null };
        const excludeAppleProvisional = appleProvisionalUser
          ? {
              _id: {
                $ne: appleProvisionalUser._id,
              },
            }
          : {};
        const [
          existingUser,
          existingNickname,
          existingSocialIdentity,
          existingParentAccount,
          existingAcademyAccount,
          guestNicknameStatus,
        ] =
          await Promise.all([
            User.exists({
              email,
              ...excludeAppleProvisional,
            }),
            User.exists({
              ...excludeAppleProvisional,
              $or: [
                {
                  nameNormalized:
                    nicknameKey(
                      name
                    ),
                },
                {
                  name: {
                    $regex:
                      `^${name.replace(
                        /[.*+?^${}()|[\]\\]/g,
                        "\\$&"
                      )}$`,
                    $options: "i",
                  },
                },
              ],
            }),
            User.exists(socialIdentityQuery),
            ParentAccount.exists({ email }),
            AcademyAccount.exists({ email }),
            require("../services/arenaGuestChallengeService").guestNicknameClaimStatus({
              nickname: name,
              cookieHeader: req.headers.cookie || "",
              birthDate: birthDateInput,
            }),
          ]);

        if (existingUser || existingParentAccount || existingAcademyAccount) {
            return renderRegisterError(
                res,
                409,
                "이미 가입된 이메일입니다.",
                oldInput
            );
        }

        if (existingNickname) {
            return renderRegisterError(
                res,
                409,
                "이미 사용 중인 닉네임입니다.",
                oldInput
            );
        }
        if (guestNicknameStatus.guestConflict) {
          const expectedGuestNickname = Boolean(
            arenaGuestRegistrationClaim &&
            nicknameKey(name) === nicknameKey(arenaGuestRegistrationClaim.nickname)
          );
          return renderRegisterError(
            res,
            409,
            expectedGuestNickname && guestNicknameStatus.birthDateMatches !== true
              ? "도전장 참가 때 사용한 생년월일과 일치하지 않습니다."
              : "이미 사용 중인 닉네임입니다.",
            oldInput
          );
        }

        const claimableGuestIdentity =
          guestNicknameStatus.claimableIdentity || null;
        const claimContextMatches = Boolean(
          claimableGuestIdentity &&
          arenaGuestRegistrationClaim &&
          String(claimableGuestIdentity._id) ===
            String(arenaGuestRegistrationClaim.guestIdentityId) &&
          nicknameKey(name) ===
            nicknameKey(arenaGuestRegistrationClaim.nickname) &&
          guestNicknameStatus.birthDateMatches === true
        );
        const guestClaimConfirmed = Boolean(
          claimContextMatches &&
          ["true", "on", "1"].includes(
            String(req.body.arenaGuestRegistrationConfirmed || "")
          ) &&
          sameArenaGuestConfirmationNonce(
            req.body.arenaGuestRegistrationNonce,
            arenaGuestRegistrationClaim.confirmationNonce
          )
        );

        if (claimableGuestIdentity?.claimedByUserId) {
          return renderRegisterError(
            res,
            409,
            "이 도전장 기록은 이미 다른 계정에 연결되어 있습니다.",
            oldInput
          );
        }
        if (
          (arenaGuestReverseIntent || claimableGuestIdentity) &&
          !claimContextMatches
        ) {
          return renderRegisterError(
            res,
            409,
            arenaGuestReverseIntent
              ? "역도전장을 만들려면 도전장 참가 때 사용한 닉네임과 생년월일을 그대로 입력해 주세요."
              : "도전장 참가 때 사용한 닉네임과 생년월일을 확인해 주세요.",
            oldInput
          );
        }
        if (
          (arenaGuestReverseIntent || claimableGuestIdentity) &&
          !guestClaimConfirmed
        ) {
          return renderRegisterError(
            res,
            400,
            "도전장 참가 기록이 본인의 기록인지 확인해 주세요.",
            oldInput
          );
        }

        if (existingSocialIdentity) {
            return renderRegisterError(
                res,
                409,
                "이미 연결된 소셜 계정입니다. 로그인 화면에서 다시 시도해주세요.",
                oldInput
            );
        }

        const registrationProfile = {
            realName,
            name,
            nameNormalized:
              nicknameKey(name),
            email,
            role: "student",
            birthDate,
            ...(selectedSchool
                ? {
                      identityMatchHash:
                          buildIdentityMatchHash({
                              realName,
                              birthDate,
                              schoolCode:
                                  selectedSchool.code,
                          }),
                      identityMatchVersion:
                          "name-birthdate-school-v1",
                  }
                : {}),
            schoolGrade,
            learnerType:
                schoolGrade === 13
                    ? "RETAKER"
                    : schoolGrade === 14
                      ? "UNIVERSITY"
                      : schoolGrade === 15
                        ? "WORKER"
                        : "HIGH_SCHOOL",
            educationStatus:
                [13, 15].includes(schoolGrade)
                    ? "graduated"
                    : "enrolled",
            lastGradePromotionYear:
                getAcademicYear(),
            lastLoginAt: null,
            emailVerificationRequiredAt: new Date(),

            ...(selectedSchool
                ? {
                      school: {
                          region: selectedSchool.region,
                          code: selectedSchool.code,
                          name: selectedSchool.name,
                          roadAddress:
                              selectedSchool.roadAddress || "",
                          establishment:
                              selectedSchool.establishment || "",
                          highSchoolType:
                              selectedSchool.highSchoolType || "",
                          isOverseas:
                              selectedSchool.isOverseas === true,
                      },
                  }
                : {}),
            ...(selectedUniversity
                ? { university: selectedUniversity }
                : {}),

            termsAcceptedAt: new Date(),
            termsVersion: "2026-08-13",
            privacyVersion: "2026-08-13",
            preferences: {
              coachMode: "mild",
              dashboardTutorialStatus: "PENDING",
            },
        };

        const passwordHash = appleProvisionalUser
          ? null
          : await bcrypt.hash(
              socialRegistration
                ? crypto.randomBytes(48).toString("base64url")
                : password,
              BCRYPT_ROUNDS
          );
        const registrationUserId = appleProvisionalUser?._id || new mongoose.Types.ObjectId();
        const previousProvisionalNickname = appleProvisionalUser
          ? nicknameKey(appleProvisionalUser.nameNormalized || appleProvisionalUser.name)
          : "";
        const persistRegisteredUser = async (session = null) => {
          await reserveUserNickname({
            nickname: name,
            nicknameNormalized: nicknameKey(name),
            userId: registrationUserId,
            claimableGuestIdentityId: guestClaimConfirmed
              ? claimableGuestIdentity?._id
              : null,
            session,
          });
          let persistedUser;
          if (appleProvisionalUser) {
            /*
             * Apple 신원 교환 때 만들어진 최소 사용자 문서를 지금 사용자가 입력한
             * 값으로 완성한다. 게스트 기록 연결이 필요한 경우 같은 트랜잭션 안에서
             * 기존 _id를 완성해 계정만 생기고 기록 연결이 빠지는 상태를 막는다.
             */
            const provisional = session
              ? await User.findById(appleProvisionalUser._id)
                  .select(`+birthDate ${SOCIAL_AUTH_SELECT}`)
                  .session(session)
              : appleProvisionalUser;
            if (!provisional) throw new Error("Apple 임시 사용자 정보를 찾을 수 없습니다.");
            provisional.set(registrationProfile);
            provisional.set(socialIdentityPath, socialRegistration.providerUserId);
            provisional.emailVerifiedAt = null;
            persistedUser = await provisional.save(session ? { session } : undefined);
          } else {
            const payload = {
              _id: registrationUserId,
              ...registrationProfile,
              passwordHash,
              ...(socialRegistration
                ? {
                    socialAuth: {
                      [socialIdentityField]: socialRegistration.providerUserId,
                    },
                  }
                : {}),
            };
            if (!session) persistedUser = await User.create(payload);
            else [persistedUser] = await User.create([payload], { session });
          }
          if (
            previousProvisionalNickname &&
            previousProvisionalNickname !== nicknameKey(name)
          ) {
            await releaseNickname({
              nicknameNormalized: previousProvisionalNickname,
              ownerKind: "USER",
              ownerId: registrationUserId,
              session,
            });
          }
          return persistedUser;
        };

        let user;
        if (guestClaimConfirmed) {
          const registrationSession = await mongoose.startSession();
          try {
            await registrationSession.withTransaction(async () => {
              user = await persistRegisteredUser(registrationSession);
              const claimResult = await require("../services/arenaGuestChallengeService").claimGuestRecordsForUser({
                userId: user._id,
                nickname: name,
                birthDate: birthDateInput,
                cookieHeader: req.headers.cookie || "",
                session: registrationSession,
              });
              if (claimResult.claimed !== true) {
                const claimError = new Error("게스트 신원 소유권을 다시 확인할 수 없습니다.");
                claimError.status = 409;
                claimError.code = "ARENA_GUEST_CLAIM_FAILED";
                throw claimError;
              }
            });
          } catch (error) {
            console.error("게스트 Arena 기록 포함 회원가입 트랜잭션 실패:", error);
            return renderRegisterError(
              res,
              [400, 409].includes(Number(error?.status)) ? Number(error.status) : 503,
              Number(error?.status) === 409
                ? error.message
                : "회원가입과 도전장 기록 연결을 함께 완료하지 못했습니다. 잠시 후 다시 시도해주세요.",
              oldInput
            );
          } finally {
            await registrationSession.endSession();
          }
          user?.$session?.(null);
          if (req.session?.arenaGuestRegistrationClaim) {
            delete req.session.arenaGuestRegistrationClaim;
          }
          res.clearCookie("matths_arena_guest", {
            path: "/",
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
          });
        } else {
          const registrationSession = await mongoose.startSession();
          try {
            await registrationSession.withTransaction(async () => {
              user = await persistRegisteredUser(registrationSession);
            });
          } finally {
            await registrationSession.endSession();
          }
          user?.$session?.(null);
        }

        await alertPotentialDuplicateIdentity(
            user
        ).catch((error) => {
            console.error(
                "동일인 중복 계정 관리자 알림 생성 실패:",
                error
            );
        });

        const mobileSocialRegistration =
          socialRegistration
            ?.mobile === true;
        clearPendingSocialRegistration(
          req
        );
        if (mobileSocialRegistration) {
          const delivery = await require("./emailVerificationController").sendRegistrationVerification({
            accountType: "user", accountId: user._id,
          });
          const url = mobileCallbackURL(socialRegistration.provider);
          url.searchParams.set("error", delivery.message);
          return res.redirect(url.toString());
        }
        return require("./emailVerificationController").finishRegistration(req, res, {
          accountType: "user", accountId: user._id, email,
        });
    } catch (error) {
        const pendingSocialRegistration =
          getPendingSocialRegistration(req);
        const submittedEmail = String(
          pendingSocialRegistration?.email || req.body.email || ""
        )
          .trim()
          .toLowerCase();
        // 동시에 같은 이메일로 가입 요청이 들어온 경우
        if (error.code === 11000 && error.keyPattern?.email) {
            return renderRegisterError(
                res,
                409,
                "이미 가입된 이메일입니다.",
                {
                    realName: validateRealName(
                        req.body.realName
                    ).realName,
                    birthDate: String(
                        req.body.birthDate || ""
                    ).trim(),
                    name: String(req.body.name || "").trim(),
                    email: submittedEmail,
                    schoolGrade: Number(req.body.schoolGrade) || 10,
                    schoolRegion: String(
                        req.body.schoolRegion || ""
                    ).trim(),
                    schoolCode: String(req.body.schoolCode || "").trim(),
                    universityCode: String(req.body.universityCode || "").trim(),
                }
            );
        }

        if (
          (error.code === 11000 &&
            error.keyPattern?.nameNormalized) ||
          error.code === "NICKNAME_NAMESPACE_TAKEN"
        ) {
          return renderRegisterError(
            res,
            409,
            "이미 사용 중인 닉네임입니다.",
            {
              realName:
                validateRealName(
                  req.body.realName
                ).realName,
              birthDate:
                String(
                  req.body.birthDate ||
                    ""
                ).trim(),
              name:
                String(
                  req.body.name ||
                    ""
                ).trim(),
              email: submittedEmail,
              schoolGrade:
                Number(
                  req.body
                    .schoolGrade
                ) || 10,
              schoolRegion:
                String(
                  req.body
                    .schoolRegion ||
                    ""
                ).trim(),
              schoolCode:
                String(
                  req.body
                    .schoolCode ||
                    ""
                ).trim(),
            }
          );
        }

        if (
          error.code === 11000 &&
          (
            error.keyPattern?.["socialAuth.googleId"] ||
            error.keyPattern?.["socialAuth.kakaoId"]
          )
        ) {
          return renderRegisterError(
            res,
            409,
            "이미 연결된 소셜 계정입니다. 로그인 화면에서 다시 시도해주세요.",
            {
              realName: validateRealName(req.body.realName).realName,
              birthDate: String(req.body.birthDate || "").trim(),
              name: String(req.body.name || "").trim(),
              email: submittedEmail,
              schoolGrade: Number(req.body.schoolGrade) || 10,
              schoolRegion: String(req.body.schoolRegion || "").trim(),
              schoolCode: String(req.body.schoolCode || "").trim(),
              universityCode: String(req.body.universityCode || "").trim(),
            }
          );
        }

        return next(error);
    }
};

function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate((error) => {
            if (error) {
                return reject(error);
            }

            resolve();
        });
    });
}

function saveSession(req) {
    return new Promise((resolve, reject) => {
        req.session.save((error) => {
            if (error) {
                return reject(error);
            }

            resolve();
        });
    });
}

function isSafeReturnPath(returnTo) {
    return (
        typeof returnTo === "string" &&
        returnTo.startsWith("/") &&
        !returnTo.startsWith("//")
    );
}

function isSafeStudentReturnPath(returnTo) {
    if (!isSafeReturnPath(returnTo)) {
        return false;
    }

    const pathname = String(returnTo).split(/[?#]/, 1)[0];
    if (/^\/academy\/join\/[^/]+$/.test(pathname)) {
        return true;
    }
    const blockedPrefixes = [
        "/admin",
        "/academy",
        "/parent",
        "/api",
    ];
    const blockedExactPaths = new Set([
        "/login",
        "/register",
        "/logout",
        "/forgot-password",
        "/reset-password",
    ]);

    return (
        !blockedExactPaths.has(pathname) &&
        !blockedPrefixes.some(
            (prefix) =>
                pathname === prefix ||
                pathname.startsWith(`${prefix}/`)
        )
    );
}

function isSafeAdminReturnPath(returnTo) {
    if (!isSafeReturnPath(returnTo)) return false;
    const pathname = String(returnTo).split(/[?#]/, 1)[0];
    return (
        pathname === "/admin" ||
        pathname.startsWith("/admin/") ||
        pathname === "/archive/admin" ||
        pathname.startsWith("/archive/admin/")
    );
}

function postLoginUrl(user, returnTo) {
    return require("../services/webLoginService").loginDestination({ kind: "user", user }, returnTo);
}

exports.login = async (req, res, next) => {
  try {
    return res.redirect(await require("../services/webLoginService").loginWebAccount(req));
  } catch (error) {
    if (error.code === "EMAIL_VERIFICATION_REQUIRED") return res.redirect("/verify-email");
    if ([400, 401, 403].includes(Number(error.status))) {
      const unifiedLogin = req.authAccountType === "unified";
      const accountType = req.authAccountType === "admin"
        ? "admin"
        : unifiedLogin
          ? publicLoginAccountType(req.body.accountType)
          : "student";
      return res.status(error.status).render("login", {
        accountType, unifiedLogin, error: error.message, loginNotice: protectedPageLoginNotice(req),
        oldInput: { email: String(req.body.email || "") },
        next: unifiedLogin && isSafeReturnPath(req.body.next) ? req.body.next : "",
        socialAuthProviders: accountType === "admin" ? [] : publicProviderStatus(),
      });
    }
    return next(error);
  }
};

exports.logout = (req, res, next) => {
    const loginPath = req.session?.user?.role === "admin"
        ? "/admin/login"
        : "/student/login";
    const loginSurface = req.session?.user?.role === "admin" ? "admin" : "public";
    req.session.destroy((error) => {
        if (error) {
            return next(error);
        }

        res.clearCookie("connect.sid", {
            path: "/",
            ...(process.env.SESSION_COOKIE_DOMAIN
                ? { domain: process.env.SESSION_COOKIE_DOMAIN }
                : {}),
        });
        return res.redirect(serviceUrl(loginSurface, loginPath));
    });
};

function createNotFoundError(message) {
    const error = new Error(message);
    error.status = 404;
    return error;
}

async function renderProfile(
    req,
    res,
    {
        status = 200,
        feedback = null,
        formValues = {},
    } = {}
) {
    const [profileUser, arenaActivityLevel, academyProfile] = await Promise.all([
      User.findById(
        req.session.user.id
      ).lean(),
      getArenaActivityLevel(
        req.session.user.id
      ),
      getStudentAcademyProfile(
        req.session.user.id
      ),
    ]);

    if (!profileUser) {
        throw createNotFoundError(
            "사용자 정보를 찾을 수 없습니다."
        );
    }

    res.set("Cache-Control", "private, no-store");
    return res.status(status).render("profile", {
        profileUser,
        arenaActivityLevel,
        arenaProfileAvatar: resolveArenaProfileAvatar(
          profileUser.preferences
        ),
        arenaProfileAvatars: ARENA_PROFILE_AVATARS,
        onboardingTutorial: dashboardTutorialView(
          profileUser.preferences
        ),
        schoolRegions: getSchoolSelectData(),
        academyProfile,
        feedback,
        formValues,
    });
}

exports.profilePage = async (req, res, next) => {
    try {
        const academyFlash = req.session.academyFlash || null;
        delete req.session.academyFlash;
        let feedback = academyFlash
          ? {
              section: "academy",
              type: academyFlash.type === "error" ? "error" : "success",
              message: academyFlash.message,
            }
          : null;

        if (!feedback &&
          req.query
            .nicknameUpdated ===
          "1"
        ) {
          feedback = {
            section: "nickname",
            type: "success",
            message:
              "닉네임을 변경했습니다.",
          };
        } else if (!feedback &&
          req.query
            .avatarUpdated ===
          "1"
        ) {
          feedback = {
            section: "avatar",
            type: "success",
            message:
              "프로필 이미지를 변경했습니다.",
          };
        } else if (!feedback &&
          req.query
            .coachModeUpdated ===
          "1"
        ) {
          feedback = {
            section: "coach-mode",
            type: "success",
            message:
              "학습 모드를 변경했습니다.",
          };
        } else if (!feedback &&
          req.query
            .nicknameChanged ===
          "1"
        ) {
          feedback = {
            section: "nickname",
            type: "success",
            message:
              "닉네임 변경 요청을 완료했습니다.",
          };
        }

        return await renderProfile(
          req,
          res,
          {
            feedback,
          }
        );
    } catch (error) {
        return next(error);
    }
};

function syncDashboardTutorialSession(req, tutorial) {
  const preferences = {
    ...(req.session.user.preferences || {}),
    dashboardTutorialStatus: tutorial.status,
  };

  if (tutorial.completedAt) {
    preferences.dashboardTutorialCompletedAt = tutorial.completedAt;
  } else {
    delete preferences.dashboardTutorialCompletedAt;
  }

  if (tutorial.skippedAt) {
    preferences.dashboardTutorialSkippedAt = tutorial.skippedAt;
  } else {
    delete preferences.dashboardTutorialSkippedAt;
  }

  req.session.user.preferences = preferences;
}

exports.restartDashboardTutorial = async (req, res, next) => {
  try {
    const tutorial = await updateDashboardTutorial({
      userId: req.session.user.id,
      action: "RESTART",
    });
    syncDashboardTutorialSession(req, tutorial);
    await saveSession(req);
    return res.redirect("/main?tutorialStep=0");
  } catch (error) {
    return next(error);
  }
};

exports.updateDashboardTutorial = async (req, res, next) => {
  try {
    const action = String(req.body?.action || "").trim().toUpperCase();
    if (!["COMPLETE", "SKIP"].includes(action)) {
      const error = new Error("올바른 튜토리얼 동작이 아닙니다.");
      error.status = 400;
      throw error;
    }

    const tutorial = await updateDashboardTutorial({
      userId: req.session.user.id,
      action,
    });
    syncDashboardTutorialSession(req, tutorial);
    await saveSession(req);
    res.set("Cache-Control", "private, no-store");
    return res.json({ tutorial });
  } catch (error) {
    return next(error);
  }
};

exports.changeProfileAvatar = async (req, res, next) => {
  try {
    if (req.profileAvatarUploadError) {
      throw req.profileAvatarUploadError;
    }

    const avatarChoice = String(
      req.body.avatarChoice || req.body.avatarCode || ""
    ).trim().toUpperCase();
    let avatar;
    if (avatarChoice === "CUSTOM") {
      if (req.file) {
        avatar = await updateCustomProfileAvatar({
          userId: req.session.user.id,
          file: req.file,
        });
        req.file = undefined;
      } else {
        const currentUser = await User.findById(req.session.user.id)
          .select("preferences")
          .lean();
        avatar = resolveArenaProfileAvatar(currentUser?.preferences);
        if (!avatar.isCustom) {
          const selectionError = new Error("기기에서 사용할 프로필 사진을 먼저 선택해 주세요.");
          selectionError.status = 400;
          throw selectionError;
        }
      }
    } else {
      if (req.file?.path) {
        await require("node:fs").promises.unlink(req.file.path).catch(() => {});
        req.file = undefined;
      }
      avatar = await updateArenaProfileAvatar({
        userId: req.session.user.id,
        avatarCode: avatarChoice,
      });
    }

    req.session.user.preferences = {
      ...(req.session.user.preferences || {}),
      arenaAvatarCode:
        avatar.isCustom
          ? req.session.user.preferences?.arenaAvatarCode
          : avatar.code,
      profileAvatarMode: avatar.isCustom ? "CUSTOM" : "PRESET",
    };
    await saveSession(req);
    return res.redirect("/profile?avatarUpdated=1#avatar-settings");
  } catch (error) {
    if (req.file?.path) {
      await require("node:fs").promises.unlink(req.file.path).catch(() => {});
      req.file = undefined;
    }
    if ([400, 413, 422, 503].includes(Number(error.status))) {
      try {
        return await renderProfile(req, res, {
          status: Number(error.status),
          feedback: {
            section: "avatar",
            type: "error",
            message: error.message,
          },
        });
      } catch (renderError) {
        return next(renderError);
      }
    }
    return next(error);
  }
};

exports.withdrawOwnAccount = async (
    req,
    res,
    next
) => {
    try {
        await withdrawOwnAccount({
            userId:
                req.session.user.id,
            password:
                req.body.currentPassword,
            confirmation:
                req.body.confirmation,
            acknowledgeAnonymousRetention:
                req.body
                    .acknowledgeAnonymousRetention,
        });

        return req.session.destroy(
            (error) => {
                if (error) {
                    return next(error);
                }

                res.clearCookie(
                    "connect.sid"
                );
                return res.redirect(
                    "/login?withdrawn=1"
                );
            }
        );
    } catch (error) {
        if (
            Number(error.status) >=
                400 &&
            Number(error.status) <
                500
        ) {
            try {
                return await renderProfile(
                    req,
                    res,
                    {
                        status:
                            error.status,
                        feedback: {
                            section:
                                "withdrawal",
                            type: "error",
                            message:
                                error.message,
                        },
                    }
                );
            } catch (
                renderError
            ) {
                return next(
                    renderError
                );
            }
        }

        return next(error);
    }
};

exports.changeNickname = async (req, res, next) => {
    try {
        const validation =
          validateNickname(
            req.body.nickname
          );
        const nickname =
          validation.nickname;

        if (!validation.valid) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "nickname",
                    type: "error",
                    message:
                      validation.message,
                },
                formValues: { nickname },
            });
        }

        const [duplicate, guestNicknameStatus] =
          await Promise.all([User.exists({
            _id: {
              $ne:
                req.session.user.id,
            },
            $or: [
              {
                nameNormalized:
                  nicknameKey(
                    nickname
                  ),
              },
              {
                name: {
                  $regex:
                    `^${nickname.replace(
                      /[.*+?^${}()|[\]\\]/g,
                      "\\$&"
                    )}$`,
                  $options: "i",
                },
              },
            ],
          }), require("../services/arenaGuestChallengeService").guestNicknameClaimStatus({
            nickname,
            cookieHeader: req.headers.cookie || "",
            userId: req.session.user.id,
          })]);

        const guestNicknameOwnedByUser =
          !guestNicknameStatus.claimableIdentity ||
          String(guestNicknameStatus.claimableIdentity.claimedByUserId || "") ===
            String(req.session.user.id);
        if (
          duplicate ||
          guestNicknameStatus.guestConflict ||
          !guestNicknameOwnedByUser
        ) {
            return await renderProfile(req, res, {
                status: 409,
                feedback: {
                    section: "nickname",
                    type: "error",
                    message:
                        "이미 사용 중인 닉네임입니다.",
                },
                formValues: { nickname },
            });
        }

        const user = await replaceUserNickname({
            userId: req.session.user.id,
            nickname,
            nicknameNormalized: nicknameKey(nickname),
        });

        if (!user) {
            throw createNotFoundError(
                "사용자 정보를 찾을 수 없습니다."
            );
        }

        req.session.user.name = user.name;
        await saveSession(req);

        return res.redirect(
          "/profile?nicknameUpdated=1#nickname-settings"
        );
    } catch (error) {
        if (error?.code === "NICKNAME_NAMESPACE_TAKEN") {
            return await renderProfile(req, res, {
                status: 409,
                feedback: {
                    section: "nickname",
                    type: "error",
                    message: "방금 다른 사용자가 이 닉네임을 사용하기 시작했습니다.",
                },
                formValues: {
                    nickname: String(req.body.nickname || "").trim(),
                },
            });
        }
        return next(error);
    }
};

async function renderNicknameChangePage(
  req,
  res,
  {
    status = 200,
    error = null,
    success = null,
    nickname = "",
  } = {}
) {
  const requestId =
    String(
      req.query.requestId ||
        req.body?.requestId ||
        ""
    );
  const token =
    String(
      req.query.token ||
        req.body?.token ||
        ""
    );
  const pageData =
    await getNicknameChangePageData({
      userId:
        req.session.user.id,
      requestId,
      token,
    });

  return res
    .status(status)
    .render(
      "nickname-change",
      {
        user:
          req.session.user,
        pageData,
        requestId,
        token,
        error,
        success,
        nickname,
      }
    );
}

exports.nicknameChangePage =
  async (req, res, next) => {
    try {
      return await renderNicknameChangePage(
        req,
        res
      );
    } catch (error) {
      return next(error);
    }
  };

exports.guardNicknameLinkSession = async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  try {
    if (!req.session?.user?.id && !req.session?.parent?.id) return next();
    const ownerId = await nicknameLinkOwner({ requestId: req.query.requestId, token: req.query.token });
    if (!ownerId) return next();
    const owner = await User.findById(ownerId).select("role").lean();
    if (!owner) return next();
    const mismatch = accountLinkMismatch(req.session, {
      userId: ownerId,
      accountType: owner.role === "teacher" ? "academy" : "student",
    });
    return next(mismatch || undefined);
  } catch (error) { return next(error); }
};

exports.checkNicknameChange =
  async (req, res, next) => {
    try {
      return res.json(
        await checkNicknameAvailability({
          userId:
            req.session.user.id,
          requestId:
            req.body.requestId,
          token:
            req.body.token,
          nickname:
            req.body.nickname,
        })
      );
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .json({
            available: false,
            message:
              error.message,
            proof: "",
          });
      }

      return next(error);
    }
  };

exports.completeNicknameChange =
  async (req, res, next) => {
    try {
      const user =
        await completeNicknameChange({
          userId:
            req.session.user.id,
          requestId:
            req.body.requestId,
          token:
            req.body.token,
          nickname:
            req.body.nickname,
          proof:
            req.body.proof,
        });

      req.session.user.name =
        user.name;
      await saveSession(req);

      return res.redirect(
        req.session.user.role === "teacher"
          ? serviceUrl("academy", "/academy?nicknameChanged=1")
          : "/profile?nicknameChanged=1"
      );
    } catch (error) {
      if (error.status) {
        try {
          return await renderNicknameChangePage(
            req,
            res,
            {
              status:
                error.status,
              error:
                error.message,
              nickname:
                req.body.nickname,
            }
          );
        } catch (
          renderError
        ) {
          return next(
            renderError
          );
        }
      }

      return next(error);
    }
  };

exports.changeSchool = async (req, res, next) => {
    try {
        const schoolRegion = String(
            req.body.schoolRegion || ""
        ).trim();
        const schoolCode = String(
            req.body.schoolCode || ""
        ).trim();
        const formValues = {
            schoolRegion,
            schoolCode,
        };

        if (!schoolRegion || !schoolCode) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "school",
                    type: "error",
                    message:
                        "변경할 지역과 고등학교를 선택해주세요.",
                },
                formValues,
            });
        }

        const selectedSchool = findSchool(
            schoolRegion,
            schoolCode
        );

        if (!selectedSchool) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "school",
                    type: "error",
                    message:
                        "학교 목록에서 올바른 고등학교를 선택해주세요.",
                },
                formValues,
            });
        }

        const school = {
            region: selectedSchool.region,
            code: selectedSchool.code,
            name: selectedSchool.name,
            roadAddress:
                selectedSchool.roadAddress || "",
            establishment:
                selectedSchool.establishment || "",
            highSchoolType:
                selectedSchool.highSchoolType || "",
        };

        const user = await User.findByIdAndUpdate(
            req.session.user.id,
            { school },
            {
                returnDocument: "after",
                runValidators: true,
            }
        ).lean();

        if (!user) {
            throw createNotFoundError(
                "사용자 정보를 찾을 수 없습니다."
            );
        }

        req.session.user.school = {
            region: user.school.region,
            code: user.school.code,
            name: user.school.name,
        };
        await saveSession(req);

        return await renderProfile(req, res, {
            feedback: {
                section: "school",
                type: "success",
                message: `${user.school.name}(으)로 변경했습니다.`,
            },
        });
    } catch (error) {
        return next(error);
    }
};

exports.changePassword = async (req, res, next) => {
    try {
        const currentPassword = String(
            req.body.currentPassword || ""
        );
        const newPassword = String(
            req.body.newPassword || ""
        );
        const newPasswordConfirm = String(
            req.body.newPasswordConfirm || ""
        );

        if (
            !currentPassword ||
            !newPassword ||
            !newPasswordConfirm
        ) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "password",
                    type: "error",
                    message:
                        "현재 비밀번호와 새 비밀번호를 모두 입력해주세요.",
                },
            });
        }

        if (newPassword.length < 8) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "password",
                    type: "error",
                    message:
                        "새 비밀번호는 8자 이상이어야 합니다.",
                },
            });
        }

        if (
            Buffer.byteLength(
                newPassword,
                "utf8"
            ) > 72
        ) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "password",
                    type: "error",
                    message:
                        "새 비밀번호가 너무 깁니다.",
                },
            });
        }

        if (newPassword !== newPasswordConfirm) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "password",
                    type: "error",
                    message:
                        "새 비밀번호와 비밀번호 확인이 일치하지 않습니다.",
                },
            });
        }

        const user = await User.findById(
            req.session.user.id
        ).select("+passwordHash");

        if (!user) {
            throw createNotFoundError(
                "사용자 정보를 찾을 수 없습니다."
            );
        }

        const currentPasswordMatched =
            await bcrypt.compare(
                currentPassword,
                user.passwordHash
            );

        if (!currentPasswordMatched) {
            return await renderProfile(req, res, {
                status: 401,
                feedback: {
                    section: "password",
                    type: "error",
                    message:
                        "현재 비밀번호가 올바르지 않습니다.",
                },
            });
        }

        const sameAsCurrent =
            await bcrypt.compare(
                newPassword,
                user.passwordHash
            );

        if (sameAsCurrent) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "password",
                    type: "error",
                    message:
                        "새 비밀번호는 현재 비밀번호와 다르게 설정해주세요.",
                },
            });
        }

        user.passwordHash = await bcrypt.hash(
            newPassword,
            BCRYPT_ROUNDS
        );
        user.tokenVersion =
            (Number(user.tokenVersion) || 0) + 1;
        await user.save();

        return await renderProfile(req, res, {
            feedback: {
                section: "password",
                type: "success",
                message: "비밀번호를 안전하게 변경했습니다.",
            },
        });
    } catch (error) {
        return next(error);
    }
};

exports.loggedCurriculumPage = async (req, res, next) => {
  try {
    const { learningData } = await getUserLearningData(
      req.session.user.id
    );

    return res.render("log-curriculum", {
      user: req.session.user,
      learningData,
      onboardingTutorial: getRequestDashboardTutorial(req),
    });
  } catch (error) {
    return next(error);
  }
};

exports.assessmentCenterPage = async (
  req,
  res,
  next
) => {
  try {
    res.set(
      "Cache-Control",
      "no-store"
    );

    const assessmentData =
      await getAssessmentCenterData(
        req.session.user.id
      );

    return res.render(
      "assessment-center",
      {
        user: req.session.user,
        assessmentData,
        onboardingTutorial: getRequestDashboardTutorial(req),
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.startAssessment = async (
  req,
  res,
  next
) => {
  try {
    const attempt =
      await createAssessmentAttempt({
        userId:
          req.session.user.id,
        scopeType: String(
          req.body?.scopeType || ""
        ),
        courseId: String(
          req.body?.courseId || ""
        ),
        unitId:
          String(
            req.body?.unitId || ""
          ) || null,
        subunitId:
          String(
            req.body?.subunitId || ""
          ) || null,
      });

    return res.redirect(
      `/assessments/${attempt._id}`
    );
  } catch (error) {
    return next(error);
  }
};

exports.assessmentAttemptPage = async (
  req,
  res,
  next
) => {
  try {
    res.set(
      "Cache-Control",
      "no-store"
    );

    const attempt =
      await getAssessmentAttempt({
        userId:
          req.session.user.id,
        attemptId:
          req.params.attemptId,
      });

    return res.render(
      "assessment-attempt",
      {
        user: req.session.user,
        attempt,
        difficultyLabels:
          DIFFICULTY_LABELS,
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.submitAssessment = async (
  req,
  res,
  next
) => {
  try {
    const attempt =
      await submitAssessmentAttempt({
        userId:
          req.session.user.id,
        attemptId:
          req.params.attemptId,
        answers:
          req.body?.answers || {},
      });

    const activityUser =
      await recordStudyActivity(
        req.session.user.id,
        attempt.submittedAt ||
          new Date(),
        attempt.elapsedTimeMs
      );
    Object.assign(
      req.session.user,
      lifecycleSessionView(activityUser)
    );

    return res.redirect(
      `/assessments/${attempt._id}`
    );
  } catch (error) {
    return next(error);
  }
};

exports.saveAssessmentDraft = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await saveAssessmentDraft({
        userId:
          req.session.user.id,
        attemptId:
          req.params.attemptId,
        answers:
          req.body?.answers || {},
      });

    return res.json(result);
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({
          message: error.message,
        });
    }

    return next(error);
  }
};

exports.expireAssessment = async (
  req,
  res,
  next
) => {
  try {
    const attempt =
      await expireAssessmentAttempt({
        userId:
          req.session.user.id,
        attemptId:
          req.params.attemptId,
        answers:
          req.body?.answers || {},
      });
    if (
      !attempt.$locals
        ?.wasAlreadyFinalized
    ) {
      const activityUser =
        await recordStudyActivity(
          req.session.user.id,
          attempt.submittedAt ||
            new Date(),
          attempt.elapsedTimeMs
        );
      Object.assign(
        req.session.user,
        lifecycleSessionView(
          activityUser
        )
      );
    }

    return res.json({
      status: attempt.status,
      expired:
        attempt.status ===
        "disqualified",
      redirectUrl:
        `/assessments/${attempt._id}`,
    });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({
          message: error.message,
          remainingTimeMs:
            error.remainingTimeMs,
        });
    }

    return next(error);
  }
};

exports.wrongNotesPage = async (req, res, next) => {
  try {
    const wrongNoteData = await getWrongNoteData(
      req.session.user.id,
      req.query
    );

    return res.render("wrong-notes", {
      user: req.session.user,
      wrongNoteData,
      onboardingTutorial: getRequestDashboardTutorial(req),
    });
  } catch (error) {
    return next(error);
  }
};

exports.wrongNoteReviewPage = async (
  req,
  res,
  next
) => {
  try {
    const reviewItem =
      await getWrongNoteReviewData({
        userId: req.session.user.id,
        attemptId: req.params.attemptId,
      });

    return res.render("wrong-note-review", {
      user: req.session.user,
      reviewItem,
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateTopicCompletion = async (req, res, next) => {
  try {
    const progress = await updateTopicCompletion({
      userId: req.session.user.id,
      courseId: req.params.courseId,
      unitId: req.params.unitId,
      conceptId: req.params.conceptId,
      topicIndex: req.params.topicIndex,
      completed: req.body.completed,
      sessionId: req.sessionID,
    });

    const activityUser =
      await recordStudyActivity(
        req.session.user.id
      );
    Object.assign(
      req.session.user,
      lifecycleSessionView(activityUser)
    );

    return res.json({ progress });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    return next(error);
  }
};

async function currentLearningProgress({
  userId,
  courseId,
  unitId,
  conceptId,
}) {
  const { learningData } = await getUserLearningData(userId);
  const course = learningData.courses.find(
    (item) => item.id === courseId
  );
  const unit = course?.units.find(
    (item) => item.id === unitId
  );
  const concept = unit?.concepts.find(
    (item) => item.id === conceptId
  );

  if (!course || !unit || !concept) {
    const error = new Error(
      "저장된 학습 진도 정보를 불러오지 못했습니다."
    );
    error.status = 404;
    throw error;
  }

  return {
    concept: {
      id: concept.id,
      progress: concept.progress,
      status: concept.status,
      completedTopics: concept.completedTopics,
      topicCount: concept.topics.length,
      completedTopicIndexes: concept.completedTopicIndexes,
    },
    unit: {
      id: unit.id,
      progress: unit.progress,
      completedConcepts: unit.completedConcepts,
      totalConcepts: unit.concepts.length,
    },
    course: {
      id: course.id,
      progress: course.progress,
      completedConcepts: course.completedConcepts,
      totalConcepts: course.totalConcepts,
    },
    overall: {
      progress: learningData.overallProgress,
      completedConcepts: learningData.completedConcepts,
      totalConcepts: learningData.totalConcepts,
    },
  };
}

exports.nextPracticeProblem = async (
  req,
  res,
  next
) => {
  try {
    const result = await createNextProblem({
      req,
      userId: req.session.user.id,
      courseId: req.params.courseId,
      unitId: req.params.unitId,
      conceptId: req.params.conceptId,
      reviewAttemptId:
        req.query.reviewAttempt,
    });

    res.set("Cache-Control", "no-store");
    return res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    return next(error);
  }
};

exports.submitPracticeProblem = async (
  req,
  res,
  next
) => {
  try {
    const result = await submitProblem({
      req,
      userId: req.session.user.id,
      instanceId: req.body.instanceId,
      submittedAnswer: req.body.answer,
    });
    const activityDurationMs =
      Number(
        result.activityDurationMs
      ) || 0;
    delete result.activityDurationMs;

    const activityUser =
      await recordStudyActivity(
        req.session.user.id,
        new Date(),
        activityDurationMs
      );
    Object.assign(
      req.session.user,
      lifecycleSessionView(activityUser)
    );

    result.progress = await currentLearningProgress({
      userId: req.session.user.id,
      courseId: req.params.courseId,
      unitId: req.params.unitId,
      conceptId: req.params.conceptId,
    });

    return res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    return next(error);
  }
};

exports.changeConceptCompletion = async (
  req,
  res,
  next
) => {
  try {
    if (typeof req.body.completed !== "boolean") {
      return res.status(400).json({
        message:
          "completed 값은 boolean이어야 합니다.",
      });
    }

    const mastery = await changeCompletion({
      userId: req.session.user.id,
      courseId: req.params.courseId,
      unitId: req.params.unitId,
      conceptId: req.params.conceptId,
      completed: req.body.completed,
      sessionId: req.sessionID,
    });

    const activityUser =
      await recordStudyActivity(
        req.session.user.id
      );
    Object.assign(
      req.session.user,
      lifecycleSessionView(activityUser)
    );

    const progress = await currentLearningProgress({
      userId: req.session.user.id,
      courseId: req.params.courseId,
      unitId: req.params.unitId,
      conceptId: req.params.conceptId,
    });

    return res.json({ mastery, progress });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    return next(error);
  }
};

exports.quickPracticePage = async (
  req,
  res,
  next
) => {
  try {
    return res.render(
      "quick-practice",
      {
        user: req.session.user,
        catalog:
          getQuickPracticeCatalogSummary(),
        stats:
          await getQuickPracticeStats(
            req.session.user.id
          ),
        onboardingTutorial: getRequestDashboardTutorial(req),
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.startQuickPractice = async (
  req,
  res,
  next
) => {
  try {
    const attempt =
      await createQuickPracticeAttempt({
        userId:
          req.session.user.id,
        pointValue:
          req.body.pointValue,
        coachMode:
          req.session.user.preferences
            ?.coachMode,
      });

    res.set(
      "Cache-Control",
      "no-store"
    );
    return res.status(201).json({
      timeLimitMs: 40000,
      attempt,
    });
  } catch (error) {
    return next(error);
  }
};

exports.submitQuickPractice = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await submitQuickPracticeAttempt({
        userId:
          req.session.user.id,
        instanceId:
          req.params.instanceId,
        submittedAnswer:
          req.body.answer,
        coachMode:
          req.session.user.preferences
            ?.coachMode,
      });
    const activityUser =
      await synchronizeUserLifecycle(
        req.session.user.id
      );

    Object.assign(
      req.session.user,
      lifecycleSessionView(
        activityUser
      )
    );

    return res.json({
      result,
      stats:
        await getQuickPracticeStats(
          req.session.user.id
        ),
    });
  } catch (error) {
    return next(error);
  }
};

exports.expireQuickPractice = async (
  req,
  res,
  next
) => {
  try {
    return res.json({
      result:
        await expireQuickPracticeAttempt({
          userId:
            req.session.user.id,
          instanceId:
            req.params.instanceId,
          coachMode:
            req.session.user.preferences
              ?.coachMode,
        }),
      stats:
        await getQuickPracticeStats(
          req.session.user.id
        ),
    });
  } catch (error) {
    return next(error);
  }
};

exports.coachSuggestionBoard =
  async (req, res, next) => {
    try {
      return res.render(
        "coach-suggestions",
        {
          user: req.session.user,
          board:
            await getSuggestionBoardData(
              req.session.user
            ),
          submitted:
            req.query.submitted ===
            "1",
          moderated:
            req.query.moderated ===
            "1",
          suggestionRequestId:
            randomUUID(),
          onboardingTutorial: getRequestDashboardTutorial(req),
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.submitCoachSuggestion =
  async (req, res, next) => {
    try {
      await createSuggestion({
        user: req.session.user,
        mode: req.body.mode,
        situation:
          req.body.situation,
        message: req.body.message,
        requestId:
          req.body.requestId,
      });

      return res.redirect(
        "/coach-suggestions?submitted=1"
      );
    } catch (error) {
      if (error.status) {
        const board =
          await getSuggestionBoardData(
            req.session.user
          );

        return res
          .status(error.status)
          .render(
            "coach-suggestions",
            {
              user:
                req.session.user,
              board,
              submitted: false,
              moderated: false,
              error:
                error.message,
              oldInput: {
                mode:
                  req.body.mode,
                situation:
                  req.body
                    .situation,
                message:
                  req.body.message,
              },
              suggestionRequestId:
                req.body.requestId ||
                randomUUID(),
            }
          );
      }

      return next(error);
    }
  };

exports.moderateCoachSuggestion =
  async (req, res, next) => {
    try {
      await moderateSuggestion({
        adminUser:
          req.session.user,
        suggestionId:
          req.params.suggestionId,
        action: req.body.action,
        rejectionReason:
          req.body.rejectionReason,
      });

      return res.redirect(
        req.body.returnTo ===
          "admin"
          ? "/admin/coach-suggestions?moderated=1"
          : "/coach-suggestions?moderated=1"
      );
    } catch (error) {
      return next(error);
    }
  };

function passwordResetAccountType(value) {
  const accountType = String(value || "student").trim().toLowerCase();
  return ["student", "academy", "parent", "admin"].includes(accountType)
    ? accountType
    : "student";
}

function passwordResetLoginUrl(accountType) {
  return {
    academy: serviceUrl("academy", "/academy/login?reset=1"),
    parent: serviceUrl("parents", "/parent/login?reset=1"),
    admin: serviceUrl("admin", "/admin/login?reset=1"),
    student: serviceUrl("public", "/student/login?reset=1"),
  }[passwordResetAccountType(accountType)];
}

exports.forgotPasswordPage = (req, res) =>
  res.render("password-reset", {
    step: "request",
    error: null,
    email: "",
    accountType: passwordResetAccountType(req.query.accountType),
  });

exports.openPasswordResetLink =
  async (req, res, next) => {
    try {
      const identity = await verifyPasswordResetLink({
        resetId: req.query.resetId,
        token: req.query.token,
        verifyOnly: true,
      });
      const mismatch = accountLinkMismatch(req.session, identity);
      if (mismatch) throw mismatch;
      const verification =
        await verifyPasswordResetLink({
          resetId:
            req.query.resetId,
          token: req.query.token,
        });

      req.session.passwordReset = {
        resetId:
          verification.resetId,
        userId:
          verification.userId,
        accountType:
          verification.accountType,
        expiresAt:
          verification.expiresAt,
      };
      await saveSession(req);
      res.set({
        "Cache-Control":
          "no-store",
        "Referrer-Policy":
          "no-referrer",
      });

      return res.render(
        "password-reset",
        {
          step: "reset",
          error: null,
          email: "",
          accountType:
            verification.accountType,
        }
      );
    } catch (error) {
      if (error.code === "ACCOUNT_LINK_SESSION_MISMATCH") return next(error);
      if (error.status) {
        return res
          .status(error.status)
          .render(
            "password-reset",
            {
              step: "request",
              error:
                error.message,
              email: "",
              accountType:
                passwordResetAccountType(req.query.accountType),
            }
          );
      }

      return next(error);
    }
  };

exports.requestPasswordReset =
  async (req, res, next) => {
    const email = String(
      req.body.email || ""
    )
      .trim()
      .toLowerCase();
    const accountType =
      passwordResetAccountType(req.body.accountType);

    try {
      await requestPasswordReset(email, { accountType });

      return res.render(
        "password-reset",
        {
          step: "verify",
          error: null,
          email,
          accountType,
        }
      );
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .render(
            "password-reset",
            {
              step: "request",
              error:
                error.message,
              email,
              accountType,
            }
          );
      }

      return next(error);
    }
  };

exports.verifyPasswordReset =
  async (req, res, next) => {
    const email = String(
      req.body.email || ""
    )
      .trim()
      .toLowerCase();
    const accountType =
      passwordResetAccountType(req.body.accountType);

    try {
      const identity = await verifyPasswordResetCode({
        email,
        code: req.body.code,
        accountType,
        verifyOnly: true,
      });
      const mismatch = accountLinkMismatch(req.session, identity);
      if (mismatch) throw mismatch;
      const verification =
        await verifyPasswordResetCode(
          {
            email,
            code: req.body.code,
            accountType,
          }
        );

      req.session.passwordReset = {
        resetId:
          verification.resetId,
        userId:
          verification.userId,
        accountType:
          verification.accountType,
        expiresAt:
          verification.expiresAt,
      };
      await saveSession(req);

      return res.render(
        "password-reset",
        {
          step: "reset",
          error: null,
          email,
          accountType:
            verification.accountType,
        }
      );
    } catch (error) {
      if (error.code === "ACCOUNT_LINK_SESSION_MISMATCH") return next(error);
      if (error.status) {
        return res
          .status(error.status)
          .render(
            "password-reset",
            {
              step: "verify",
              error:
                error.message,
              email,
              accountType,
            }
          );
      }

      return next(error);
    }
  };

exports.completePasswordReset =
  async (req, res, next) => {
    const authorization =
      req.session.passwordReset;

    try {
      if (
        !authorization ||
        new Date(
          authorization.expiresAt
        ).getTime() <= Date.now()
      ) {
        const error = new Error(
          "비밀번호 재설정 인증이 만료되었습니다."
        );
        error.status = 400;
        throw error;
      }

      const mismatch = accountLinkMismatch(req.session, authorization);
      if (mismatch) throw mismatch;

      await resetPassword({
        resetId:
          authorization.resetId,
        userId:
          authorization.userId,
        accountType:
          authorization.accountType,
        password:
          req.body.password,
        passwordConfirm:
          req.body.passwordConfirm,
      });

      return req.session.destroy(
        (sessionError) => {
          if (sessionError) {
            return next(
              sessionError
            );
          }

          res.clearCookie(
            "connect.sid"
          );
          return res.redirect(passwordResetLoginUrl(authorization.accountType));
        }
      );
    } catch (error) {
      if (error.code === "ACCOUNT_LINK_SESSION_MISMATCH") return next(error);
      if (error.status) {
        return res
          .status(error.status)
          .render(
            "password-reset",
            {
              step: "reset",
              error:
                error.message,
              email: "",
              accountType:
                passwordResetAccountType(authorization?.accountType),
            }
          );
      }

      return next(error);
    }
  };

exports.termsPage = (req, res) =>
  res.render("terms", {
    user:
      req.session?.user ||
      null,
  });

exports.privacyPage = (req, res) =>
  res.render("privacy", {
    user:
      req.session?.user ||
      null,
  });

exports.communityPage =
  async (req, res, next) => {
    try {
      return res.render(
        "community",
        {
          boardData:
            await getCommunityBoardData({
              viewer:
                req.session?.user ||
                null,
              board:
                req.query.board ||
                (req.session?.user
                  ? privateBoardForViewer(req.session.user)
                  : "high-school"),
              search:
                req.query.search,
              page:
                req.query.page,
              sort:
                req.query.sort,
              category:
                req.query.category,
            }),
          user:
            req.session?.user ||
            null,
          feedback:
            req.query.blocked ===
            "1"
              ? "사용자를 차단했습니다. 서로의 게시글과 댓글은 즉시 숨겨집니다."
              : req.query.created ===
            "1"
              ? "게시글을 등록했습니다."
              : req.query.deleted ===
                  "1"
                ? "게시글을 삭제했습니다. 운영 확인을 위한 기록은 안전하게 보관됩니다."
              : null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.communityBlockedUsersPage =
  async (req, res, next) => {
    try {
      return res.render(
        "community-blocked-users",
        {
          user: req.session.user,
          blocks:
            await getCommunityBlockedUsers({
              userId:
                req.session.user.id,
            }),
          unblocked:
            req.query.unblocked ===
            "1",
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.communityAnnouncementPage =
  async (req, res, next) => {
    try {
      return res.render(
        "community-announcement",
        {
          user:
            req.session?.user ||
            null,
          announcement:
            await getCommunityAnnouncement(
              req.params
                .announcementId
            ),
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.communityNoticePage =
  async (req, res, next) => {
    try {
      return res.render(
        "community-notice",
        {
          user:
            req.session?.user ||
            null,
          notice:
            await getCommunityNotice({
              noticeId:
                req.params.noticeId,
              viewerId:
                req.session?.user
                  ?.id || null,
            }),
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.communityRulesPage =
  async (req, res, next) => {
    try {
      const viewer = req.session?.user || null;
      const requestedBoard = String(req.params.boardType || "");
      if (
        ["school", "retaker", "university", "worker"].includes(requestedBoard) &&
        viewer?.role !== "admin" &&
        privateBoardForViewer(viewer) !== requestedBoard
      ) {
        const error = new Error("현재 학습자 구분에 해당하는 전용 게시판 규칙만 확인할 수 있습니다.");
        error.status = 403;
        throw error;
      }
      if (
        requestedBoard === "school" &&
        viewer?.role !== "admin" &&
        !viewer?.school?.code
      ) {
        const error = new Error("학교 게시판 운영 규칙은 해당 고등학교 소속 학생만 열람할 수 있습니다.");
        error.status = 403;
        throw error;
      }
      if (
        requestedBoard === "university" &&
        viewer?.role !== "admin" &&
        !viewer?.university?.code
      ) {
        const error = new Error("대학교 게시판 운영 규칙은 해당 대학교 소속 대학생만 열람할 수 있습니다.");
        error.status = 403;
        throw error;
      }
      const viewerSchool = viewer?.school;
      const viewerUniversity = viewer?.university;
      const schoolCode =
        requestedBoard === "school"
          ? viewerSchool?.code || ""
          : "";
      const schoolName =
        requestedBoard === "school"
          ? viewerSchool?.name || ""
          : "";

      return res.render(
        "community-rules",
        {
          user:
            req.session?.user ||
            null,
          rules:
            getCommunityBoardRules({
              board:
                requestedBoard,
              schoolCode,
              schoolName,
              universityCode:
                requestedBoard === "university" ? viewerUniversity?.code || "" : "",
              universityName:
                requestedBoard === "university" ? viewerUniversity?.name || "" : "",
            }),
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.communityNewPage =
  async (req, res, next) => {
    try {
      return res.render(
        "community-new",
        {
          user:
            req.session.user,
          error: null,
          postingAccess:
            await getCommunityPostingAccess(
              req.session.user.id
            ),
          oldInput: {
            board:
              req.query.board ||
              privateBoardForViewer(req.session.user),
            title: "",
            content: "",
            isAnonymous:
              false,
          },
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.submitCommunityPost =
  async (req, res, next) => {
    try {
      if (
        req.communityUploadError
      ) {
        const uploadError =
          req.communityUploadError;
        if (
          uploadError.code ===
          "LIMIT_FILE_SIZE"
        ) {
          uploadError.message =
            "첨부파일 한 개의 용량은 최대 10MB입니다.";
        } else if (
          uploadError.code ===
          "LIMIT_FILE_COUNT" ||
          uploadError.code ===
          "LIMIT_UNEXPECTED_FILE"
        ) {
          uploadError.message =
            "사진과 파일은 게시글 하나에 최대 5개까지 첨부할 수 있습니다.";
        }
        uploadError.status =
          uploadError.status ||
          400;
        throw uploadError;
      }

      const post =
        await createCommunityPost({
          userId:
            req.session.user.id,
          board:
            req.body.board,
          title:
            req.body.title,
          content:
            req.body.content,
          isAnonymous:
            req.body
              .isAnonymous,
          files:
            req.files || [],
        });

      return res.redirect(
        `/community/${post._id}?created=1`
      );
    } catch (error) {
      await discardCommunityUploads(
        req.files || []
      );
      if (error.status) {
        let postingAccess;
        try {
          postingAccess =
            await getCommunityPostingAccess(
              req.session.user.id
            );
        } catch (accessError) {
          return next(
            accessError
          );
        }
        return res
          .status(error.status)
          .render(
            "community-new",
            {
              user:
                req.session.user,
              error:
                error.message,
              postingAccess,
              oldInput: {
                board:
                  req.body.board,
                title:
                  req.body.title,
                content:
                  req.body.content,
                isAnonymous:
                  req.body
                    .isAnonymous ===
                  "on",
              },
            }
          );
      }

      return next(error);
    }
  };

exports.communityAttachmentFile =
  async (req, res, next) => {
    try {
      const attachment =
        await getCommunityAttachment({
          postId:
            req.params.postId,
          attachmentId:
            req.params
              .attachmentId,
          viewerId:
            req.session?.user
              ?.id || null,
        });
      const shouldDownload =
        req.query.download ===
          "1" ||
        !attachment.isImage;
      res.setHeader(
        "X-Content-Type-Options",
        "nosniff"
      );

      if (attachment.cloudUrl) {
        res.setHeader("Cache-Control", "private, no-store");
        return res.redirect(302, attachment.cloudUrl);
      }

      if (shouldDownload) {
        return res.download(
          attachment.filePath,
          attachment.originalName
        );
      }

      res.type(
        attachment.mimeType
      );
      res.setHeader(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(
          attachment.originalName
        )}`
      );
      return res.sendFile(
        attachment.filePath
      );
    } catch (error) {
      return next(error);
    }
  };

exports.communityPostPage =
  async (req, res, next) => {
    try {
      const detail =
        await getCommunityPost(
          req.params.postId,
          req.session?.user?.id ||
            null
        );

      return res.render(
        "community-post",
        {
          post: detail.post,
          comments:
            detail.comments,
          viewerVote:
            detail.viewerVote,
          viewerReported:
            detail.viewerReported,
          user:
            req.session?.user ||
            null,
          created:
            req.query.created ===
            "1",
          commentCreated:
            req.query.comment ===
            "created",
          commentAuthorBlocked:
            req.query.commentAuthorBlocked ===
            "1",
          reported:
            req.query.reported ===
            "1",
          commentError:
            null,
          reportError:
            null,
          reportDraft:
            "",
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.blockCommunityPostAuthor =
  async (req, res, next) => {
    try {
      const detail =
        await getCommunityPost(
          req.params.postId,
          req.session.user.id
        );
      await blockCommunityUser({
        userId:
          req.session.user.id,
        postId:
          req.params.postId,
      });
      const board = [
        "school",
        "retaker",
        "university",
        "worker",
      ].includes(detail.post.boardType)
        ? detail.post.boardType
        : "high-school";
      return res.redirect(
        `/community?board=${board}&blocked=1`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.blockCommunityCommentAuthor =
  async (req, res, next) => {
    try {
      const detail =
        await getCommunityPost(
          req.params.postId,
          req.session.user.id
        );
      const block =
        await blockCommunityUser({
          userId:
            req.session.user.id,
          postId:
            req.params.postId,
          commentId:
            req.params.commentId,
        });
      if (
        String(block.blockedUserId) ===
        String(detail.post.authorId)
      ) {
        const board = [
          "school",
          "retaker",
          "university",
          "worker",
        ].includes(detail.post.boardType)
          ? detail.post.boardType
          : "high-school";
        return res.redirect(
          `/community?board=${board}&blocked=1`
        );
      }
      return res.redirect(
        `/community/${req.params.postId}?commentAuthorBlocked=1#comments`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.unblockCommunityUser =
  async (req, res, next) => {
    try {
      await unblockCommunityUser({
        userId:
          req.session.user.id,
        blockedUserId:
          req.params.userId,
      });
      return res.redirect(
        "/community/blocked-users?unblocked=1"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.deleteOwnCommunityPost =
  async (req, res, next) => {
    try {
      const post =
        await deleteCommunityPostByAuthor(
          {
            userId:
              req.session.user.id,
            postId:
              req.params.postId,
          }
        );
      const board = [
        "school",
        "retaker",
        "university",
        "worker",
      ].includes(post.boardType)
        ? post.boardType
        : "high-school";

      return res.redirect(
        `/community?board=${board}&deleted=1`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.submitCommunityComment =
  async (req, res, next) => {
    try {
      await createCommunityComment({
        userId:
          req.session.user.id,
        postId:
          req.params.postId,
        content:
          req.body.content,
        isAnonymous:
          req.body
            .isAnonymous,
      });

      return res.redirect(
        `/community/${req.params.postId}?comment=created#comments`
      );
    } catch (error) {
      if (error.status) {
        try {
          const detail =
            await getCommunityPost(
              req.params.postId,
              req.session.user.id
            );

          return res
            .status(error.status)
            .render(
              "community-post",
              {
                post:
                  detail.post,
                comments:
                  detail.comments,
                viewerVote:
                  detail.viewerVote,
                viewerReported:
                  detail.viewerReported,
                user:
                  req.session.user,
                created: false,
                commentCreated:
                  false,
                commentError:
                  error.message,
                reported: false,
                reportError:
                  null,
                reportDraft:
                  "",
                commentDraft:
                  req.body.content,
                commentAnonymousDraft:
                  req.body
                    .isAnonymous ===
                  "on",
              }
            );
        } catch (
          renderError
        ) {
          return next(
            renderError
          );
        }
      }

      return next(error);
    }
  };

exports.submitCommunityVote =
  async (req, res, next) => {
    try {
      const result =
        await voteCommunityPost({
          userId:
            req.session.user.id,
          postId:
            req.params.postId,
          value:
            req.body.value,
        });

      if (
        req.accepts([
          "json",
          "html",
        ]) === "json"
      ) {
        return res.json(result);
      }

      return res.redirect(
        `/community/${req.params.postId}#post-votes`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.submitCommunityReport =
  async (req, res, next) => {
    try {
      await reportCommunityPost({
        userId:
          req.session.user.id,
        postId:
          req.params.postId,
        reason:
          req.body.reason,
      });
      return res.redirect(
        `/community/${req.params.postId}?reported=1`
      );
    } catch (error) {
      if (error.status) {
        try {
          const detail =
            await getCommunityPost(
              req.params.postId,
              req.session.user.id
            );

          return res
            .status(error.status)
            .render(
              "community-post",
              {
                post:
                  detail.post,
                comments:
                  detail.comments,
                viewerVote:
                  detail.viewerVote,
                viewerReported:
                  detail.viewerReported,
                user:
                  req.session.user,
                created: false,
                commentCreated:
                  false,
                commentError:
                  null,
                reported: false,
                reportError:
                  error.message,
                reportDraft:
                  req.body.reason,
              }
            );
        } catch (renderError) {
          return next(renderError);
        }
      }

      return next(error);
    }
  };

function adminCommunityRedirect(
  done,
  reportId = ""
) {
  const cleanReportId =
    String(reportId || "").replace(
      /[^a-fA-F0-9]/g,
      ""
    );
  return `/admin/community?done=${encodeURIComponent(
    done
  )}${
    cleanReportId
      ? `#report-${cleanReportId}`
      : ""
  }`;
}

async function resolveModeratedCommunityReport({
  req,
  actionLabel,
}) {
  if (!req.body.reportId) {
    return;
  }
  await reviewCommunityReport({
    adminUserId:
      req.session.user.id,
    reportId:
      req.body.reportId,
    status: "resolved",
    resolution:
      `신고 검토 후 ${actionLabel}: ${String(
        req.body.reason || ""
      ).trim()}`,
  });
}

exports.adminCommunityPage =
  async (req, res, next) => {
    try {
      return res.render(
        "admin-community",
        {
          user:
            req.session.user,
          communityData:
            await getAdminCommunityData({
              board:
                req.query.board,
              status:
                req.query.status,
              search:
                req.query.search,
              page:
                req.query.page,
            }),
          feedback:
            adminFeedbackFromQuery(
              req.query
            ),
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminCreateCommunityNotice =
  async (req, res, next) => {
    try {
      await createCommunityNotice({
        adminUserId:
          req.session.user.id,
        board:
          req.body.board,
        schoolCode:
          req.body.schoolCode,
        schoolName:
          req.body.schoolName,
        universityCode:
          req.body.universityCode,
        universityName:
          req.body.universityName,
        title:
          req.body.title,
        content:
          req.body.content,
      });
      return res.redirect(
        adminCommunityRedirect(
          "communityNoticeCreated"
        )
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUpdateCommunityNotice =
  async (req, res, next) => {
    try {
      await updateCommunityNotice({
        adminUserId:
          req.session.user.id,
        noticeId:
          req.params.noticeId,
        board:
          req.body.board,
        schoolCode:
          req.body.schoolCode,
        schoolName:
          req.body.schoolName,
        universityCode:
          req.body.universityCode,
        universityName:
          req.body.universityName,
        title:
          req.body.title,
        content:
          req.body.content,
      });
      return res.redirect(
        adminCommunityRedirect(
          "communityNoticeUpdated"
        )
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminSetCommunityNoticePinned =
  async (req, res, next) => {
    try {
      const notice =
        await setCommunityNoticePinned({
          adminUserId:
            req.session.user.id,
          noticeId:
            req.params.noticeId,
          pinned:
            req.body.pinned ===
            "true",
        });
      return res.redirect(
        adminCommunityRedirect(
          notice.isPinned
            ? "communityNoticePinned"
            : "communityNoticeUnpinned"
        )
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminModerateCommunityNotice =
  async (req, res, next) => {
    try {
      await moderateCommunityNotice({
        adminUserId:
          req.session.user.id,
        noticeId:
          req.params.noticeId,
        action:
          req.body.action,
      });
      return res.redirect(
        adminCommunityRedirect(
          "communityNoticeModerated"
        )
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminReviewCommunityReport =
  async (req, res, next) => {
    try {
      await reviewCommunityReport({
        adminUserId:
          req.session.user.id,
        reportId:
          req.params.reportId,
        status:
          req.body.status,
        resolution:
          req.body.resolution,
      });
      return res.redirect(
        adminCommunityRedirect(
          "communityReport",
          req.params.reportId
        )
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminTodosPage =
  async (req, res, next) => {
    try {
      return res.render(
        "admin-todos",
        {
          user:
            req.session.user,
          todoData:
            await getAdminTodoData({
              category:
                req.query.category,
              status:
                req.query.status,
              page:
                req.query.page,
              dateFrom:
                req.query.dateFrom,
              dateTo:
                req.query.dateTo,
              nickname:
                req.query.nickname,
            }),
          feedback:
            req.query.reopened ===
            "1"
              ? "선택한 할 일을 재검토 대상으로 되돌렸습니다."
              : req.query.done ===
                  "1"
              ? "선택한 할 일을 완료 처리했습니다."
              : null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminCompleteTodo =
  async (req, res, next) => {
    try {
      await completeAdminTodo({
        todoId:
          req.params.todoId,
        adminUserId:
          req.session.user.id,
      });
      return res.redirect(
        "/admin/todos?done=1"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminReopenTodo =
  async (req, res, next) => {
    try {
      await reopenAdminTodo({
        todoId:
          req.params.todoId,
        adminUserId:
          req.session.user.id,
      });
      return res.redirect(
        "/admin/todos?status=pending&reopened=1"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminEditCommunityPost =
  async (req, res, next) => {
    try {
      await updateCommunityPostByAdmin({
        adminUserId:
          req.session.user.id,
        postId:
          req.params.postId,
        title:
          req.body.title,
        content:
          req.body.content,
        reason:
          req.body.reason,
      });

      return res.redirect(
        adminCommunityRedirect(
          "communityEdit",
          req.body.reportId
        )
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminSetCommunityPostPinned =
  async (req, res, next) => {
    try {
      const result =
        await setCommunityPostPinned({
          adminUserId:
            req.session.user.id,
          postId:
            req.params.postId,
          pinned:
            req.body.pinned ===
            "true",
        });

      return res.redirect(
        adminCommunityRedirect(
          result.isPinned
            ? "communityPinned"
            : "communityUnpinned",
          req.body.reportId
        )
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminModerateCommunityPost =
  async (req, res, next) => {
    try {
      const action =
        req.body.action;
      await moderateCommunityPost({
        adminUserId:
          req.session.user.id,
        postId:
          req.params.postId,
        action,
        reason:
          req.body.reason,
      });

      if (
        req.body.reportId &&
        ["hide", "delete"].includes(
          action
        )
      ) {
        await resolveModeratedCommunityReport({
          req,
          actionLabel:
            action === "delete"
              ? "게시글 DB 삭제"
              : "게시글 숨김",
        });
      }

      return res.redirect(
        adminCommunityRedirect(
          "communityModeration",
          req.body.reportId
        )
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminWarnCommunityPost =
  async (req, res, next) => {
    try {
      const result =
        await warnCommunityPost({
          adminUserId:
            req.session.user.id,
          postId:
            req.params.postId,
          reason:
            req.body.reason,
        });

      await resolveModeratedCommunityReport({
        req,
        actionLabel:
          "게시글 숨김 및 작성자 경고 +1",
      });

      return res.redirect(
        adminCommunityRedirect(
          result.autoSuspended
            ? "communitySuspended"
            : "communityWarning",
          req.body.reportId
        )
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminModerateCommunityComment =
  async (req, res, next) => {
    try {
      await moderateCommunityComment({
        adminUserId:
          req.session.user.id,
        commentId:
          req.params.commentId,
        action:
          req.body.action,
        reason:
          req.body.reason,
      });

      return res.redirect(
        "/admin/community?done=communityCommentModeration#comments"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminWarnCommunityComment =
  async (req, res, next) => {
    try {
      const result =
        await warnCommunityComment({
          adminUserId:
            req.session.user.id,
          commentId:
            req.params.commentId,
          reason:
            req.body.reason,
        });

      return res.redirect(
        `/admin/community?done=${
          result.autoSuspended
            ? "communityCommentSuspended"
            : "communityCommentWarning"
        }#comments`
      );
    } catch (error) {
      return next(error);
    }
  };
