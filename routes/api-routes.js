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
const goatArenaController = require("../controllers/goatArenaController");
const {
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
  createUploadContentValidator,
} = require("../middleware/uploadContentValidation");
const {
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
const validateInlineSolutionBoard = createUploadContentValidator({
  maxTotalBytes: 10 * 1024 * 1024,
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

router.use(requireApiAuth);

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
// 운영자는 이동 중에도 학원 등록 병목만 즉시 해소한다. 긴 계약·구성원·출결 편집은
// 기존 관리자 포털이 담당하고, 이 세 경로는 정본 서비스의 admin 역할 검사를 재사용한다.
router.get("/academy/admin", ipadAcademyController.adminDashboard);
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

module.exports = router;
