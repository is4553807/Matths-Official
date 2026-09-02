const express = require("express");
const apiController = require(
  "../controllers/apiController"
);
const appleAuthController = require("../controllers/appleAuthController");
const paymentController = require("../controllers/paymentController");
const appCommerceController = require("../controllers/appCommerceController");
const appleCommerceController = require("../controllers/appleCommerceController");
const ipadReadController = require("../controllers/ipadReadController");
const ipadNotificationController = require(
  "../controllers/ipadNotificationController"
);
const ipadAcademyController = require(
  "../controllers/ipadAcademyController"
);
const ipadSupportController = require(
  "../controllers/ipadSupportController"
);
const ipadArchiveController = require(
  "../controllers/ipadArchiveController"
);
const ipadStudyHallController = require(
  "../controllers/ipadStudyHallController"
);
const ipadStoreCatalogController = require(
  "../controllers/ipadStoreCatalogController"
);
const ipadFaqController = require("../controllers/ipadFaqController");
const ipadAdminOperationsController = require(
  "../controllers/ipadAdminOperationsController"
);
const ipadAdminUsersController = require(
  "../controllers/ipadAdminUsersController"
);
const ipadAdminFinanceController = require(
  "../controllers/ipadAdminFinanceController"
);
const ipadAdminCommunityController = require(
  "../controllers/ipadAdminCommunityController"
);
const ipadAdminWeeklyMockController = require(
  "../controllers/ipadAdminWeeklyMockController"
);
const ipadAdminArchiveController = require(
  "../controllers/ipadAdminArchiveController"
);
const ipadAdminStoreController = require(
  "../controllers/ipadAdminStoreController"
);
const ipadAdminArenaController = require(
  "../controllers/ipadAdminArenaController"
);
const ipadAdminDataAnalysisController = require(
  "../controllers/ipadAdminDataAnalysisController"
);
const ipadAdminPdfForensicsController = require(
  "../controllers/ipadAdminPdfForensicsController"
);
const ipadAdminArenaPolicyController = require(
  "../controllers/ipadAdminArenaPolicyController"
);
const ipadAdminProblemBankController = require(
  "../controllers/ipadAdminProblemBankController"
);
const ipadAdminOperationsGuideController = require(
  "../controllers/ipadAdminOperationsGuideController"
);
const ipadCommunityController = require(
  "../controllers/ipadCommunityController"
);
const ipadLearningSyncController = require("../controllers/ipadLearningSyncController");
const ipadAssessmentController = require("../controllers/ipadAssessmentController");
const ipadPlacementController = require("../controllers/ipadPlacementController");
const ipadWeeklyMockController = require("../controllers/ipadWeeklyMockController");
const ipadLegacyArenaController = require(
  "../controllers/ipadLegacyArenaController"
);
const ipadArenaShopController = require(
  "../controllers/ipadArenaShopController"
);
const ipadGoatArenaCommandController = require(
  "../controllers/ipadGoatArenaCommandController"
);
const ipadGoatArenaActionController = require(
  "../controllers/ipadGoatArenaActionController"
);
const goatArenaController = require("../controllers/goatArenaController");
const {
  adminFormulaUpload,
  adminArchiveUpload,
  adminWeeklyMockUpload,
  userIntegrityEvidenceUpload,
} = require("../middleware/archiveUpload");
const {
  handleProfileAvatarUpload,
} = require("../middleware/profileAvatarUpload");
const {
  arenaEvidenceUpload,
} = require("../middleware/arenaEvidenceUpload");
const {
  handleAcademyAssignmentUpload,
} = require("../middleware/academyAssignmentUpload");
const {
  handleAcademyForensicsUpload,
} = require("../middleware/pdfForensicsUpload");
const {
  communityUpload,
  loadCommunityUploadAccess,
} = require("../middleware/communityUpload");
const { handleStoreUpload } = require("../middleware/storeUpload");
const {
  createUploadContentValidator,
} = require("../middleware/uploadContentValidation");
const {
  optionalApiAuth,
  requireApiAuth,
} = require(
  "../middleware/apiAuthMiddleware"
);
const {
  loginIpRateLimit,
  loginRateLimit,
  passwordResetIpRateLimit,
  passwordResetRateLimit,
  registrationIpRateLimit,
  registrationRateLimit,
} = require("../middleware/requestSecurity");

const router = express.Router();
const validateAdminWeeklyMockContent = createUploadContentValidator({ maxTotalBytes: 300 * 1024 * 1024 });
const validateAdminArchiveContent = createUploadContentValidator({ maxTotalBytes: 500 * 1024 * 1024 });
const validateAdminStoreContent = createUploadContentValidator({ maxTotalBytes: 500 * 1024 * 1024 });
const validateInlineSolutionBoard = createUploadContentValidator({
  maxTotalBytes: 10 * 1024 * 1024,
});
const validateArenaEvidence = createUploadContentValidator({
  maxTotalBytes: 30 * 1024 * 1024,
});
const validateCommunityUpload = createUploadContentValidator({
  maxTotalBytes: 50 * 1024 * 1024,
});

router.get(
  "/health",
  apiController.health
);
router.get(
  "/live",
  apiController.liveness
);
router.get(
  "/ready",
  apiController.readiness
);
router.post(
  "/payments/toss/webhook",
  paymentController.tossWebhook
);
router.get(
  "/schools",
  apiController.schools
);
router.get(
  "/universities",
  apiController.universities
);
router.post(
  "/auth/register",
  registrationIpRateLimit,
  registrationRateLimit,
  apiController.register
);
router.post(
  "/auth/login",
  loginIpRateLimit,
  loginRateLimit,
  apiController.login
);
router.get(
  "/auth/providers",
  apiController.socialAuthProviders
);
// 모바일 그랜트 교환은 **provider 를 보지 않는다.** consumeMobileAuthGrant 는
// code + codeVerifier 만 소비하고, 누가 발급했는지는 그랜트 안에 이미 들어 있다.
// 그래서 카카오도 같은 처리기를 쓴다 — 다만 카카오가 /auth/google/exchange 를
// 부르면 읽는 사람이 반드시 헷갈리므로 provider 중립 이름을 정본으로 둔다.
router.post(
  "/auth/social/exchange",
  apiController.exchangeSocialAuthCode
);
// 기존 앱 빌드가 이 주소를 쓴다. TestFlight 에 이미 나간 1.0(1) 이 여기로 오므로
// 지우면 그 빌드의 구글 로그인이 끊긴다.
router.post(
  "/auth/google/exchange",
  apiController.exchangeSocialAuthCode
);
router.post(
  "/auth/apple/exchange",
  appleAuthController.exchangeAppleIdentityToken
);
router.post(
  "/auth/password-reset/request",
  passwordResetIpRateLimit,
  passwordResetRateLimit,
  apiController.requestPasswordReset
);
router.post(
  "/auth/password-reset/verify",
  passwordResetIpRateLimit,
  passwordResetRateLimit,
  apiController.verifyPasswordReset
);
router.post(
  "/auth/password-reset/complete",
  passwordResetIpRateLimit,
  passwordResetRateLimit,
  apiController.resetPassword
);

// App Store Server Notifications V2 — **인증 경계 앞**에 둔다.
// 애플 서버가 우리 Bearer 토큰을 알 리 없다. 방어선은 signedPayload 의 서명이고,
// 그 검증은 컨트롤러가 아니라 서비스가 payload 를 읽기 **전에** 한다.
// 이 줄이 requireApiAuth 뒤로 내려가면 모든 통지가 401 로 떨어지고,
// 애플 환불이 서버에 영영 도달하지 않는다.
router.post(
  "/commerce/apple/notifications",
  appleCommerceController.notifications
);

// FAQ는 웹과 앱이 같은 공개 원문을 사용한다. 로그인 만료 오류를 설명하는 화면이므로
// Bearer 인증 경계 앞에 두어 401 상황에서도 열 수 있어야 한다.
router.get("/faq", ipadFaqController.list);

// 게시판 읽기는 웹과 같은 공개 범위를 유지한다. Bearer가 있으면 차단 관계와
// 학교·대학교 소속 권한을 적용하고, 없으면 통합/운영 공개 게시판만 읽는다.
router.get("/community", optionalApiAuth, ipadCommunityController.list);
router.get(
  "/community/posts/:postId",
  optionalApiAuth,
  ipadCommunityController.detail
);
router.get(
  "/community/notices/:noticeId",
  optionalApiAuth,
  ipadCommunityController.notice
);
router.get(
  "/community/announcements/:announcementId",
  optionalApiAuth,
  ipadCommunityController.announcement
);
router.get(
  "/community/posts/:postId/attachments/:attachmentId",
  optionalApiAuth,
  ipadCommunityController.attachment
);

router.use(requireApiAuth);

router.get("/community/posting-access", ipadCommunityController.postingAccess);
router.post(
  "/community/posts",
  loadCommunityUploadAccess,
  communityUpload.array("communityFiles", 5),
  validateCommunityUpload,
  ipadCommunityController.createPost
);
router.use("/community/posts", ipadCommunityController.uploadError);
router.delete("/community/posts/:postId", ipadCommunityController.deletePost);
router.post(
  "/community/posts/:postId/comments",
  ipadCommunityController.createComment
);
router.post("/community/posts/:postId/vote", ipadCommunityController.vote);
router.post("/community/posts/:postId/report", ipadCommunityController.report);
router.post("/community/posts/:postId/block", ipadCommunityController.block);
router.get("/community/blocked-users", ipadCommunityController.blockedUsers);
router.delete(
  "/community/blocked-users/:userId",
  ipadCommunityController.unblock
);

// 학생 학원 화면. 웹 세션판의 정본 서비스를 그대로 재사용하되, 앱에는 내부
// Mongo 문서가 아니라 최소 DTO만 내려준다. 가입·출석·자료 열기까지 Bearer 경계에서
// 끝나므로 학생이 앱을 나가거나 웹 로그인으로 다시 인증할 필요가 없다.
router.get("/academy/student", ipadAcademyController.dashboard);
router.get("/academy/student/weeks/:weekId", ipadAcademyController.week);
router.get(
  "/academy/student/weeks/:weekId/files/:fileId",
  ipadAcademyController.downloadWeekFile
);
router.post("/academy/student/join-code", ipadAcademyController.requestByCode);
router.post("/academy/student/join", ipadAcademyController.requestByAcademy);
router.post("/academy/student/leave", ipadAcademyController.leave);
router.post("/academy/student/attendance/check-in", ipadAcademyController.checkIn);
router.get("/academy/teacher", ipadAcademyController.teacherDashboard);
router.get("/academy/teacher/setup", ipadAcademyController.teacherSetup);
router.post("/academy/teacher/setup", ipadAcademyController.createTeacherAcademy);
router.post(
  "/academy/teacher/setup/join",
  ipadAcademyController.requestTeacherAcademyJoin
);
router.post(
  "/academy/teacher/setup/join/cancel",
  ipadAcademyController.cancelTeacherAcademyJoin
);
router.post(
  "/academy/teacher/profile-image",
  handleProfileAvatarUpload,
  ipadAcademyController.updateTeacherAcademyProfileImage
);
router.post(
  "/academy/teacher/profile-image/remove",
  ipadAcademyController.removeTeacherAcademyProfileImage
);
router.get("/academy/teacher/forensics", ipadAcademyController.teacherForensics);
router.post(
  "/academy/teacher/forensics/code",
  ipadAcademyController.analyzeTeacherForensicsCode
);
router.post(
  "/academy/teacher/forensics/file",
  handleAcademyForensicsUpload,
  ipadAcademyController.analyzeTeacherForensicsFile
);
router.get("/academy/teacher/analytics", ipadAcademyController.teacherAnalytics);
router.get("/academy/teacher/students", ipadAcademyController.teacherStudents);
router.get(
  "/academy/teacher/students/:membershipId",
  ipadAcademyController.teacherStudentDetail
);
router.post(
  "/academy/teacher/students/bulk",
  ipadAcademyController.bulkManageTeacherStudents
);
router.post(
  "/academy/teacher/requests/:membershipId/approve",
  ipadAcademyController.approveStudent
);
router.post(
  "/academy/teacher/requests/:membershipId/reject",
  ipadAcademyController.rejectStudent
);
router.post(
  "/academy/teacher/students/:membershipId/class",
  ipadAcademyController.assignStudentClass
);
router.post(
  "/academy/teacher/students/:membershipId/remove",
  ipadAcademyController.removeTeacherStudent
);
router.post("/academy/teacher/invites", ipadAcademyController.createInvite);
router.post(
  "/academy/teacher/invites/:inviteId/revoke",
  ipadAcademyController.revokeInvite
);
router.post(
  "/academy/teacher/staff/:staffId/approve",
  ipadAcademyController.approveTeacherStaff
);
router.post(
  "/academy/teacher/staff/:staffId/reject",
  ipadAcademyController.rejectTeacherStaff
);
router.post(
  "/academy/teacher/staff/:staffId/revoke",
  ipadAcademyController.revokeTeacherStaff
);
router.post("/academy/teacher/classes", ipadAcademyController.createTeacherClass);
router.post(
  "/academy/teacher/classes/:classId/settings",
  ipadAcademyController.updateTeacherClass
);
router.post(
  "/academy/teacher/classes/:classId/archive",
  ipadAcademyController.archiveTeacherClass
);
router.post(
  "/academy/teacher/classes/:classId/restore",
  ipadAcademyController.restoreTeacherClass
);
router.post(
  "/academy/teacher/classes/:classId/co-teachers",
  ipadAcademyController.addTeacherClassCoTeacher
);
router.post(
  "/academy/teacher/classes/:classId/co-teachers/:teacherUserId/remove",
  ipadAcademyController.removeTeacherClassCoTeacher
);
router.post(
  "/academy/teacher/classes/:classId/homeroom-transfer",
  ipadAcademyController.transferTeacherClassHomeroom
);
router.get(
  "/academy/teacher/attendance",
  ipadAcademyController.teacherAttendance
);
router.post(
  "/academy/teacher/attendance",
  ipadAcademyController.saveTeacherAttendance
);
router.post(
  "/academy/teacher/attendance/sessions/:sessionId/regenerate-code",
  ipadAcademyController.regenerateTeacherAttendanceCode
);
router.get(
  "/academy/teacher/classes/:classId/classwork",
  ipadAcademyController.teacherClasswork
);
router.post(
  "/academy/teacher/classes/:classId/classwork/weeks",
  handleAcademyAssignmentUpload,
  ipadAcademyController.saveTeacherClassWeek
);
router.post(
  "/academy/teacher/classes/:classId/classwork/weeks/:weekId/files/:fileId/remove",
  ipadAcademyController.removeTeacherClassWeekFile
);
router.post(
  "/academy/teacher/classes/:classId/classwork/weeks/:weekId/delete",
  ipadAcademyController.deleteTeacherClassWeek
);
router.get(
  "/academy/teacher/classes/:classId/classwork/weeks/:weekId/files/:fileId",
  ipadAcademyController.downloadTeacherClassWeekFile
);
// 운영자 네이티브 작업대는 승인 병목과 전체 학원 운영 상태를 함께 다룬다.
// 모든 경로는 정본 서비스의 admin 역할 검사와 범위 제한 직렬화를 재사용한다.
router.get("/academy/admin", ipadAcademyController.adminDashboard);
router.get("/academy/admin/list", ipadAcademyController.adminAcademyList);
router.get("/academy/admin/:academyId", ipadAcademyController.adminAcademyDetail);
router.post(
  "/academy/admin/:academyId/profile",
  ipadAcademyController.adminUpdateAcademyProfile
);
router.post(
  "/academy/admin/:academyId/profile-image",
  handleProfileAvatarUpload,
  ipadAcademyController.adminUpdateAcademyProfileImage
);
router.get(
  "/academy/admin/:academyId/weeks/:weekId/files/:fileId",
  ipadAcademyController.downloadAdminAcademyWeekFile
);
router.post(
  "/academy/admin/:academyId/contract",
  ipadAcademyController.adminUpdateAcademyContract
);
router.post(
  "/academy/admin/:academyId/staff/:staffId",
  ipadAcademyController.adminUpdateAcademyStaff
);
router.post(
  "/academy/admin/:academyId/owner",
  ipadAcademyController.adminTransferAcademyOwner
);
router.post(
  "/academy/admin/:academyId/students/:membershipId",
  ipadAcademyController.adminUpdateAcademyStudent
);
router.post(
  "/academy/admin/:academyId/students/:membershipId/class",
  ipadAcademyController.adminAssignAcademyStudentClass
);
router.post(
  "/academy/admin/:academyId/classes/:classId",
  ipadAcademyController.adminUpdateAcademyClass
);
router.post(
  "/academy/admin/:academyId/classes/:classId/operations",
  ipadAcademyController.adminUpdateAcademyClassOperations
);
router.post(
  "/academy/admin/:academyId/classes/:classId/homeroom",
  ipadAcademyController.adminTransferAcademyClassHomeroom
);
router.post(
  "/academy/admin/:academyId/invites/:inviteId",
  ipadAcademyController.adminUpdateAcademyInvite
);
router.post(
  "/academy/admin/:academyId/attendance/sessions/:sessionId/regenerate-code",
  ipadAcademyController.adminRegenerateAcademyAttendanceCode
);
router.post(
  "/academy/admin/:academyId/attendance/:attendanceId",
  ipadAcademyController.adminUpdateAcademyAttendance
);
router.post(
  "/academy/admin/applications/:academyId/approve",
  ipadAcademyController.approveAcademy
);
router.post(
  "/academy/admin/applications/:academyId/reject",
  ipadAcademyController.rejectAcademy
);

router.get(
  "/commerce/storefront",
  appCommerceController.storefront
);
router.post(
  "/commerce/handoffs",
  appCommerceController.createHandoff
);

// 앱이 애플 결제를 마치고 서명된 거래를 제출한다. 이 응답이 성공해야 앱이
// 애플에 거래 완료를 알리므로, 실패를 성공처럼 답하면 학생이 돈만 낸다.
router.post(
  "/commerce/apple/account-token",
  appleCommerceController.accountToken
);
router.post(
  "/commerce/apple/redeem",
  appleCommerceController.redeem
);

// iPad 주간 공식 모의고사. 정적 경로는 :examId보다 먼저 등록해
// integrity-cases/objections를 시험 ID로 오인하지 않게 한다.
router.get(
  "/weekly-mock-exams/integrity-cases",
  ipadWeeklyMockController.integrityCases
);
router.get(
  "/weekly-mock-exams/integrity-cases/:caseId",
  ipadWeeklyMockController.integrityCase
);
router.post(
  "/weekly-mock-exams/integrity-cases/:caseId/evidence",
  (req, res, next) => {
    userIntegrityEvidenceUpload.array("evidenceFiles", 10)(
      req,
      res,
      (error) => {
        if (error) {
          error.status = error.status || 400;
          return next(error);
        }
        return next();
      }
    );
  },
  ipadWeeklyMockController.submitEvidence
);
router.get(
  "/weekly-mock-exams/objections/options",
  ipadWeeklyMockController.objectionOptions
);
router.get(
  "/weekly-mock-exams/objections",
  ipadWeeklyMockController.objections
);
router.post(
  "/weekly-mock-exams/objections",
  ipadWeeklyMockController.createObjection
);
router.post(
  "/weekly-mock-exams/weeks/:weekKey/selection",
  ipadWeeklyMockController.selectRepresentative
);
router.get(
  "/weekly-mock-exams",
  ipadWeeklyMockController.dashboard
);
router.get(
  "/weekly-mock-exams/:examId/paper",
  ipadWeeklyMockController.paper
);
router.post(
  "/weekly-mock-exams/:examId/start",
  ipadWeeklyMockController.start
);
router.patch(
  "/weekly-mock-exams/:examId/draft",
  ipadWeeklyMockController.saveDraft
);
router.post(
  "/weekly-mock-exams/:examId/submit",
  ipadWeeklyMockController.submit
);
router.post(
  "/weekly-mock-exams/:examId/expire",
  ipadWeeklyMockController.expire
);
router.get(
  "/weekly-mock-exams/:examId",
  ipadWeeklyMockController.getAttempt
);

router.get(
  "/learning/progress",
  ipadReadController.getLearningProgress
);
router.post(
  "/learning/progress/reset",
  ipadLearningSyncController.resetLearningProgress
);
router.post("/events", ipadLearningSyncController.postEvents);
router.post(
  "/wrong-notes/bulk",
  ipadLearningSyncController.postWrongNotesBulk
);
router.get(
  "/wrong-notes/stuck-points",
  ipadLearningSyncController.getStuckPoints
);
router.post(
  "/wrong-notes/stuck-points",
  ipadLearningSyncController.postStuckPoint
);
router.post(
  "/wrong-notes/:attemptId/review-result",
  ipadLearningSyncController.postReviewResult
);
router.get("/wrong-notes", ipadLearningSyncController.getWrongNotes);
router.get(
  "/dashboard/activity",
  ipadReadController.getDashboardActivity
);

// iPad 알림함. 게시판 답글·전체 공지·관리자 개별 안내·경고가 한 목록으로 온다.
// 알림을 만드는 규칙과 읽음·긴급 분류는 웹 /notifications 와 **같은 서비스**를 쓴다 —
// 두 벌이 되면 같은 학생이 웹과 앱에서 다른 개수를 본다.
router.get("/notifications", ipadNotificationController.getInbox);
router.post("/notifications/read-all", ipadNotificationController.markAllRead);
// :notificationId 패턴은 read-all 보다 **뒤에** 등록해야 한다.
// 앞에 두면 "read-all" 이 알림 id 로 잡힌다.
router.post(
  "/notifications/:notificationId/read",
  ipadNotificationController.markRead
);

// iPad 평가센터. 채점·시간 제한·해금은 기존 assessmentService 정본을
// 그대로 사용하고 이 계층은 Bearer JSON 계약만 번역한다.
router.get("/assessments", ipadAssessmentController.list);
router.post("/assessments/start", ipadAssessmentController.start);
router.get("/assessments/:attemptId", ipadAssessmentController.get);
router.patch("/assessments/:attemptId/draft", ipadAssessmentController.saveDraft);
router.post("/assessments/:attemptId/submit", ipadAssessmentController.submit);
router.post("/assessments/:attemptId/expire", ipadAssessmentController.expire);

// iPad 배치고사. 웹 placementExamService의 같은 AssessmentAttempt 문서를
// 사용하므로 웹/앱 사이에 별도 사용자 DB나 시험 상태가 생기지 않는다.
router.get("/placement-exam/status", ipadPlacementController.getStatus);
router.post("/placement-exam/start", ipadPlacementController.start);
router.get("/placement-exam/:attemptId", ipadPlacementController.getAttempt);
router.patch("/placement-exam/:attemptId/draft", ipadPlacementController.saveDraft);
router.post("/placement-exam/:attemptId/submit", ipadPlacementController.submit);
router.post("/placement-exam/:attemptId/expire", ipadPlacementController.expire);

// 구형 RankArenaScreen이 아직 읽는 MMR 호환 표면. 계산을 새로 하지 않고
// 현행 RankingProfile/rankingService 정본을 iPad DTO로만 번역한다.
router.get("/arena", ipadLegacyArenaController.getArena);
router.get(
  "/arena/leaderboard",
  ipadLegacyArenaController.getArenaLeaderboard
);

router.get(
  "/goat-arena",
  goatArenaController.getGoatArena
);
router.get(
  "/goat-arena/rulebook",
  goatArenaController.getGoatArenaRulebook
);
router.get(
  "/goat-arena/main/shop",
  ipadArenaShopController.getShop
);
router.post(
  "/goat-arena/main/shop/purchases",
  ipadArenaShopController.purchase
);
router.get(
  "/goat-arena/main/shop/analyses/:effectId",
  ipadArenaShopController.getAnalysis
);
router.get(
  "/goat-arena/matches",
  goatArenaController.getGoatArenaMatches
);
router.get(
  "/goat-arena/matches/:matchId",
  goatArenaController.getGoatArenaMatch
);

// 상대 찾기·Ranked 초대 응답은 웹 EJS 폼과 같은 정본 매칭 서비스를 호출한다.
// 앱은 Bearer + JSON 경계만 다르며, 경기 생성·예치·티어 규칙을 복제하지 않는다.
router.post(
  "/goat-arena/matches/sub",
  ipadGoatArenaActionController.createUnrankedMatch
);
router.get(
  "/goat-arena/matches/main/options",
  ipadGoatArenaActionController.getMainActionOptions
);
router.post(
  "/goat-arena/matches/main/upward",
  ipadGoatArenaActionController.createMainUpwardMatch
);
router.post(
  "/goat-arena/matches/main/invitations",
  ipadGoatArenaActionController.createMainLowerInvitation
);
router.post(
  "/goat-arena/matches/main/invitations/:invitationId/cancel",
  ipadGoatArenaActionController.cancelSentMainInvitation
);
router.get(
  "/goat-arena/profile/payback-account",
  ipadGoatArenaActionController.getPaybackAccount
);
router.post(
  "/goat-arena/profile/payback-account/confirm",
  ipadGoatArenaActionController.confirmPaybackAccount
);
router.get(
  "/goat-arena/matches/main/friendly",
  ipadGoatArenaActionController.getMainFriendlyOptions
);
router.post(
  "/goat-arena/matches/main/friendly/invitations",
  ipadGoatArenaActionController.createFriendlyInvitation
);
router.post(
  "/goat-arena/matches/main/friendly/invitations/:invitationId/respond",
  ipadGoatArenaActionController.respondFriendlyInvitation
);
router.post(
  "/goat-arena/matches/main/friendly/invitations/:invitationId/cancel",
  ipadGoatArenaActionController.cancelFriendlyInvitation
);
router.get(
  "/goat-arena/revenge-rights/pending",
  ipadGoatArenaActionController.getRevengeRight
);
router.post(
  "/goat-arena/revenge-rights/:rightId/claim",
  ipadGoatArenaActionController.claimRevengeRight
);
router.post(
  "/goat-arena/revenge-rights/:rightId/forfeit",
  ipadGoatArenaActionController.forfeitRevengeRight
);
router.get(
  "/goat-arena/matches/:matchId/supplemental-evidence",
  ipadGoatArenaActionController.getSupplementalEvidence
);
router.post(
  "/goat-arena/matches/:matchId/supplemental-evidence",
  (req, _res, next) => {
    req.arenaEvidenceReceivedAt = new Date();
    next();
  },
  arenaEvidenceUpload.array("evidenceFiles", 5),
  validateArenaEvidence,
  ipadGoatArenaActionController.submitSupplementalEvidenceFiles
);
router.use(
  "/goat-arena/matches/:matchId/supplemental-evidence",
  ipadGoatArenaActionController.uploadError
);
router.post(
  "/goat-arena/matches/:matchId/accept",
  ipadGoatArenaActionController.acceptRankedInvitation
);
router.post(
  "/goat-arena/matches/:matchId/decline",
  ipadGoatArenaActionController.declineRankedInvitation
);
router.post(
  "/goat-arena/matches/:matchId/evidence",
  (req, _res, next) => {
    req.arenaEvidenceReceivedAt = new Date();
    next();
  },
  arenaEvidenceUpload.array("evidenceFiles", 5),
  validateArenaEvidence,
  ipadGoatArenaActionController.submitMatchEvidence
);
router.post(
  "/goat-arena/matches/:matchId/evidence/client-review",
  ipadGoatArenaActionController.submitClientReview
);
router.use(
  "/goat-arena/matches/:matchId/evidence",
  ipadGoatArenaActionController.uploadError
);

// iPad GOAT Arena 경기 명령.
//
// 경기 규칙은 웹과 **같은 arenaMatchAttemptService 정본**을 쓰고 이 경로들은 Bearer +
// JSON 계약만 번역한다. 아레나 룰·정산식·MMR·티어 정의를 여기서 재정의하지 않는다.
//
// 경기 진행 명령은 정산을 부르지 않는다. 마지막 문항 뒤 풀이판 finalize 경로만
// 저장된 5개 판을 원본 증거로 승격하고, 양쪽 증거가 갖춰졌을 때 기존 정산 정본을 부른다.
// 진행 명령과 증거 승격의 소유자를 섞으면 웹과 앱이 서로 다른 시점에 정산할 수 있다.
// (arenaMatchAttemptService.js 파일 전체에 정산·잠금·원장 참조가 0건임을 실측했다.)
//
// 경로끼리의 상대 순서는 무관하다 — 전부 :matchId 뒤에 고유한 정적 세그먼트가 붙어
// 서로 삼키지 않는다. 다만 위 GET /matches/:matchId 뒤에 두어 "정적 → 동적" 관례를 지킨다.
router.post(
  "/goat-arena/matches/:matchId/start",
  ipadGoatArenaCommandController.startMatch
);
router.post(
  "/goat-arena/matches/:matchId/answers",
  ipadGoatArenaCommandController.saveAnswer
);
router.post(
  "/goat-arena/matches/:matchId/advance",
  ipadGoatArenaCommandController.advanceQuestion
);
router.post(
  "/goat-arena/matches/:matchId/heartbeat",
  ipadGoatArenaCommandController.heartbeat
);
router.post(
  "/goat-arena/matches/:matchId/focus",
  ipadGoatArenaCommandController.recordQuestionFocus
);
router.post(
  "/goat-arena/matches/:matchId/network-state",
  ipadGoatArenaCommandController.recordNetworkState
);
router.post(
  "/goat-arena/matches/:matchId/submit",
  ipadGoatArenaCommandController.submitAttempt
);
router.get(
  "/goat-arena/matches/:matchId/questions",
  ipadGoatArenaCommandController.getQuestions
);
router.get(
  "/goat-arena/matches/:matchId/solution-boards",
  ipadGoatArenaCommandController.listSolutionBoards
);
router.put(
  "/goat-arena/matches/:matchId/solution-boards/current",
  arenaEvidenceUpload.single("solutionBoard"),
  validateInlineSolutionBoard,
  ipadGoatArenaCommandController.saveSolutionBoard
);
router.post(
  "/goat-arena/matches/:matchId/solution-boards/finalize",
  ipadGoatArenaCommandController.finalizeSolutionBoards
);

router.get(
  "/me",
  apiController.me
);
router.patch(
  "/me/avatar/preset",
  apiController.updateProfileAvatarPreset
);
router.post(
  "/me/avatar/custom",
  handleProfileAvatarUpload,
  apiController.updateProfileAvatarCustom
);
router.patch(
  "/me/coach-mode",
  apiController.updateCoachMode
);
router.patch(
  "/me/tutorials/dashboard",
  apiController.updateDashboardTutorial
);
router.patch(
  "/me/tutorials/arena",
  apiController.updateArenaTutorial
);
router.patch(
  "/me/school",
  apiController.updateSchool
);
router.patch(
  "/me/ranking-identity",
  apiController.updateRankingIdentity
);
router.get(
  "/me/withdrawal/options",
  apiController.withdrawalOptions
);
router.post(
  "/me/withdrawal/google/start",
  apiController.startGoogleWithdrawalReauthentication
);
router.post(
  "/me/withdrawal/kakao/start",
  apiController.startKakaoWithdrawalReauthentication
);
router.delete(
  "/me",
  apiController.withdrawMe
);
router.get(
  "/curriculum",
  apiController.curriculum
);
router.get(
  "/learning",
  apiController.learning
);
router.patch(
  "/learning/:courseId/:unitId/:conceptId/topics/:topicIndex",
  ipadLearningSyncController.updateTopic
);
router.patch(
  "/learning/:courseId/:unitId/:conceptId/mastery",
  ipadLearningSyncController.patchMastery
);
router.patch(
  "/learning/:courseId/:unitId/:conceptId/snapshot",
  ipadLearningSyncController.patchSnapshot
);

router.get(
  "/quick-practice/stats",
  apiController.quickPracticeStats
);
router.post(
  "/quick-practice/start",
  apiController.startQuickPractice
);
router.post(
  "/quick-practice/:instanceId/submit",
  apiController.submitQuickPractice
);
router.post(
  "/quick-practice/:instanceId/expire",
  apiController.expireQuickPractice
);

router.get(
  "/coach-suggestions",
  apiController.suggestionBoard
);
router.post(
  "/coach-suggestions",
  apiController.createSuggestion
);
router.patch(
  "/coach-suggestions/:suggestionId",
  apiController.moderateSuggestion
);
router.get("/support/inquiries", ipadSupportController.dashboard);
router.post("/support/inquiries", ipadSupportController.create);
router.get("/archive", ipadArchiveController.dashboard);
router.get("/archive/items/:itemId/download", ipadArchiveController.download);
// 웹 수험관의 정본 서비스와 같은 공개 시각·제출 잠금·해설 공개 규칙을 쓴다.
// 앱은 세션 웹뷰 없이 목록, 답안 저장, 채점 결과와 개인 워터마크 파일을 받는다.
router.get("/study-hall", ipadStudyHallController.list);
router.get("/study-hall/content/:contentId", ipadStudyHallController.detail);
router.put("/study-hall/content/:contentId/answers", ipadStudyHallController.save);
router.post("/study-hall/content/:contentId/submit", ipadStudyHallController.submit);
router.get(
  "/study-hall/content/:contentId/files/:assetId",
  ipadStudyHallController.download
);
router.get("/store-products", ipadStoreCatalogController.list);
router.get("/store-products/:slug", ipadStoreCatalogController.detail);
router.get(
  "/store-products/:slug/files/:assetId",
  ipadStoreCatalogController.download
);
router.get(
  "/store-products/:productId/media/:assetId",
  ipadStoreCatalogController.media
);
router.get("/admin/operations", ipadAdminOperationsController.dashboard);
router.get("/admin/todos", ipadAdminOperationsController.todos);
router.post(
  "/admin/todos/:todoId/complete",
  ipadAdminOperationsController.completeTodo
);
router.post(
  "/admin/todos/:todoId/reopen",
  ipadAdminOperationsController.reopenTodo
);
router.get("/admin/inquiries", ipadAdminOperationsController.inquiries);
router.post(
  "/admin/inquiries/:inquiryId/reply",
  ipadAdminOperationsController.replyToInquiry
);
router.post(
  "/admin/inquiries/:inquiryId/status",
  ipadAdminOperationsController.updateInquiryStatus
);
router.get("/admin/announcements", ipadAdminOperationsController.announcements);
router.post("/admin/announcements", ipadAdminOperationsController.createAnnouncement);
router.post(
  "/admin/announcements/:announcementId/status",
  ipadAdminOperationsController.updateAnnouncementStatus
);
router.get("/admin/users", ipadAdminUsersController.users);
router.get("/admin/users/:userId", ipadAdminUsersController.user);
router.get("/admin/users/:userId/activity", ipadAdminUsersController.activity);
router.get(
  "/admin/users/:userId/assessments/:attemptId",
  ipadAdminUsersController.assessment
);
router.get("/admin/parents/:parentId", ipadAdminUsersController.parent);
router.get("/admin/sanctions", ipadAdminUsersController.sanctions);
router.get("/admin/audit-log", ipadAdminUsersController.audit);
router.post(
  "/admin/users/:userId/nickname-request",
  ipadAdminUsersController.nicknameRequest
);
router.post(
  "/admin/users/:userId/notification",
  ipadAdminUsersController.notification
);
router.post("/admin/users/:userId/email", ipadAdminUsersController.email);
router.post(
  "/admin/users/:userId/password-reset",
  ipadAdminUsersController.passwordReset
);
router.post("/admin/users/:userId/role", ipadAdminUsersController.role);
router.post(
  "/admin/users/:userId/account-status",
  ipadAdminUsersController.accountStatus
);
router.post("/admin/users/:userId/withdraw", ipadAdminUsersController.withdraw);
router.post("/admin/users/:userId/warnings", ipadAdminUsersController.warnings);
router.post(
  "/admin/users/:userId/package-access",
  ipadAdminUsersController.packageAccess
);
router.post(
  "/admin/parents/:parentId/account-status",
  ipadAdminUsersController.parentStatus
);
router.post(
  "/admin/parents/:parentId/children/:childUserId/notifications",
  ipadAdminUsersController.parentChildNotifications
);
router.post(
  "/admin/parents/:parentId/children/:childUserId/unlink",
  ipadAdminUsersController.parentChildUnlink
);
router.get("/admin/finance", ipadAdminFinanceController.finance);
router.post("/admin/finance/withdrawals", ipadAdminFinanceController.withdraw);
router.post(
  "/admin/finance/other-unpaid-costs",
  ipadAdminFinanceController.otherUnpaidCosts
);
router.get("/admin/refunds", ipadAdminFinanceController.refunds);
router.post(
  "/admin/refunds/:refundRequestId/calculate",
  ipadAdminFinanceController.calculateRefund
);
router.post(
  "/admin/refunds/:refundRequestId/complete",
  ipadAdminFinanceController.completeRefund
);
router.post(
  "/admin/refunds/:refundRequestId/reject",
  ipadAdminFinanceController.rejectRefund
);
router.get("/admin/paybacks", ipadAdminFinanceController.paybacks);
router.post(
  "/admin/paybacks/:cycleId/complete",
  ipadAdminFinanceController.completePayback
);
router.post(
  "/admin/paybacks/history/:payoutRecordId/resend-email",
  ipadAdminFinanceController.resendPaybackEmail
);
router.get("/admin/community", ipadAdminCommunityController.dashboard);
router.post("/admin/community/notices", ipadAdminCommunityController.createNotice);
router.post(
  "/admin/community/notices/:noticeId",
  ipadAdminCommunityController.updateNotice
);
router.post(
  "/admin/community/notices/:noticeId/pin",
  ipadAdminCommunityController.pinNotice
);
router.post(
  "/admin/community/notices/:noticeId/status",
  ipadAdminCommunityController.moderateNotice
);
router.post(
  "/admin/community/reports/:reportId/review",
  ipadAdminCommunityController.reviewReport
);
router.post("/admin/community/posts/:postId", ipadAdminCommunityController.editPost);
router.post(
  "/admin/community/posts/:postId/pin",
  ipadAdminCommunityController.pinPost
);
router.post(
  "/admin/community/posts/:postId/status",
  ipadAdminCommunityController.moderatePost
);
router.post(
  "/admin/community/posts/:postId/warn",
  ipadAdminCommunityController.warnPost
);
router.post(
  "/admin/community/comments/:commentId/status",
  ipadAdminCommunityController.moderateComment
);
router.post(
  "/admin/community/comments/:commentId/warn",
  ipadAdminCommunityController.warnComment
);
router.get("/admin/weekly-mock-exams", ipadAdminWeeklyMockController.dashboard);
router.post(
  "/admin/weekly-mock-exams/upload",
  (req, res, next) => adminWeeklyMockUpload.fields([
    { name: "examFiles", maxCount: 10 },
    { name: "answerKeyFiles", maxCount: 10 },
    { name: "answerSheetFiles", maxCount: 10 },
  ])(req, res, (error) => { if (error) { error.status = error.status || 400; return next(error); } return next(); }),
  validateAdminWeeklyMockContent,
  ipadAdminWeeklyMockController.createExams
);
router.post(
  "/admin/weekly-mock-formulas/upload",
  (req, res, next) => adminFormulaUpload.single("formulaFile")(req, res, (error) => { if (error) { error.status = error.status || 400; return next(error); } return next(); }),
  validateAdminWeeklyMockContent,
  ipadAdminWeeklyMockController.createFormula
);
router.post(
  "/admin/weekly-mock-formulas/:resourceId/delete",
  ipadAdminWeeklyMockController.deleteFormula
);
router.get("/admin/weekly-mock-exams/:examId", ipadAdminWeeklyMockController.detail);
router.get(
  "/admin/weekly-mock-exams/:examId/files/:fileType",
  ipadAdminWeeklyMockController.examFile
);
router.get(
  "/admin/weekly-mock-integrity/:caseId/evidence/:archiveItemId",
  ipadAdminWeeklyMockController.evidenceFile
);
router.post(
  "/admin/weekly-mock-exams/:examId/attempts/:attemptId/integrity-request",
  ipadAdminWeeklyMockController.requestIntegrityEvidence
);
router.post(
  "/admin/weekly-mock-exams/:examId/integrity/:caseId/review",
  ipadAdminWeeklyMockController.reviewIntegrity
);
router.post(
  "/admin/weekly-mock-exams/:examId/answer-corrections",
  ipadAdminWeeklyMockController.correctAnswers
);
router.post(
  "/admin/weekly-mock-exams/:examId/delete",
  ipadAdminWeeklyMockController.deleteExam
);
router.get(
  "/admin/weekly-mock-objections/:objectionId",
  ipadAdminWeeklyMockController.objection
);
router.post(
  "/admin/weekly-mock-objections/:objectionId/reject",
  ipadAdminWeeklyMockController.rejectObjection
);
router.post(
  "/admin/weekly-mock-objections/:objectionId/accept",
  ipadAdminWeeklyMockController.acceptObjection
);
router.get("/admin/archive", ipadAdminArchiveController.dashboard);
router.post("/admin/archive/folders", ipadAdminArchiveController.createFolder);
router.post("/admin/archive/folders/:folderId", ipadAdminArchiveController.updateFolder);
router.post("/admin/archive/folders/:folderId/pin", ipadAdminArchiveController.pinFolder);
router.post("/admin/archive/folders/:folderId/delete", ipadAdminArchiveController.deleteFolder);
router.post(
  "/admin/archive/upload",
  (req, res, next) => adminArchiveUpload.array("archiveFiles", 20)(req, res, (error) => { if (error) { error.status = error.status || 400; return next(error); } return next(); }),
  validateAdminArchiveContent,
  ipadAdminArchiveController.upload
);
router.post("/admin/archive/items/bulk-delete", ipadAdminArchiveController.bulkDelete);
router.post("/admin/archive/items/bulk-move", ipadAdminArchiveController.moveItems);
router.post("/admin/archive/items/:itemId/delete", ipadAdminArchiveController.deleteItem);
router.post("/admin/archive/trash/:itemId/restore", ipadAdminArchiveController.restoreItem);
router.post("/admin/archive/trash/:itemId/purge", ipadAdminArchiveController.purgeItem);
router.get("/admin/store", ipadAdminStoreController.dashboard);
router.post(
  "/admin/store/study-hall",
  handleStoreUpload,
  validateAdminStoreContent,
  ipadAdminStoreController.saveStudyHall
);
router.post(
  "/admin/store/study-hall/:contentId",
  handleStoreUpload,
  validateAdminStoreContent,
  ipadAdminStoreController.saveStudyHall
);
router.post("/admin/store/study-hall/:contentId/archive", ipadAdminStoreController.archiveStudyHall);
router.post(
  "/admin/store/products",
  handleStoreUpload,
  validateAdminStoreContent,
  ipadAdminStoreController.saveProduct
);
router.post(
  "/admin/store/products/:productId",
  handleStoreUpload,
  validateAdminStoreContent,
  ipadAdminStoreController.saveProduct
);
router.post("/admin/store/products/:productId/delete", ipadAdminStoreController.deleteProduct);
router.post("/admin/store/categories", ipadAdminStoreController.createCategory);
router.post("/admin/store/categories/reorder", ipadAdminStoreController.reorderCategories);
router.post("/admin/store/categories/:categoryId", ipadAdminStoreController.updateCategory);
router.post("/admin/store/categories/:categoryId/delete", ipadAdminStoreController.deleteCategory);
router.get("/admin/arena", ipadAdminArenaController.dashboard);
router.post("/admin/arena/matches/:matchId/review", ipadAdminArenaController.reviewMatch);
router.post("/admin/arena/matches/:matchId/supplemental-evidence/:role/request", ipadAdminArenaController.requestEvidence);
router.post("/admin/arena/integrity/:caseId/review", ipadAdminArenaController.reviewCase);
router.post("/admin/arena/ranking/rebuild", ipadAdminArenaController.rebuildRanking);
router.post("/admin/arena/maintenance", ipadAdminArenaController.maintenance);
router.get("/admin/arena/ranking.csv", ipadAdminArenaController.rankingCsv);
router.get("/admin/arena/evidence/:evidenceId/:storedName", ipadAdminArenaController.evidenceFile);
router.get("/admin/data-analysis", ipadAdminDataAnalysisController.dashboard);
router.post("/admin/data-analysis/rebuild", ipadAdminDataAnalysisController.rebuild);
router.post(
  "/admin/pdf-forensics/analyze",
  handleAcademyForensicsUpload,
  ipadAdminPdfForensicsController.analyze
);
router.get("/admin/arena-policies", ipadAdminArenaPolicyController.dashboard);
router.post("/admin/arena-policies/matchmaking", ipadAdminArenaPolicyController.matchmaking);
router.post("/admin/arena-policies/learning-package", ipadAdminArenaPolicyController.learningPrice);
router.post("/admin/arena-policies/mock-exam", ipadAdminArenaPolicyController.mockPrice);
router.post("/admin/arena-policies/shop", ipadAdminArenaPolicyController.shop);
router.post("/admin/arena-policies/unranked", ipadAdminArenaPolicyController.createUnranked);
router.post("/admin/arena-policies/ranked", ipadAdminArenaPolicyController.createRanked);
router.post("/admin/arena-policies/:division/:policyId/activate", ipadAdminArenaPolicyController.activate);
router.post("/admin/arena-policies/:division/:policyId/retire", ipadAdminArenaPolicyController.retire);
router.get("/admin/problem-banks", ipadAdminProblemBankController.dashboard);
router.post("/admin/problem-banks/types/sync", ipadAdminProblemBankController.syncTypes);
router.post("/admin/problem-banks/types/:versionId/revise", ipadAdminProblemBankController.reviseType);
router.post("/admin/problem-banks/arena/types", ipadAdminProblemBankController.createTierType);
router.post("/admin/problem-banks/arena/data", ipadAdminProblemBankController.createProblemData);
router.post("/admin/problem-banks/arena/data/:versionId", ipadAdminProblemBankController.updateProblemData);
router.post("/admin/problem-banks/arena/data/:versionId/activate", ipadAdminProblemBankController.activateProblemData);
router.get("/admin/operations-guide", ipadAdminOperationsGuideController.dashboard);

module.exports = router;
