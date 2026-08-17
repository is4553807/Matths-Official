const express = require("express");
const apiController = require(
  "../controllers/apiController"
);
const paymentController = require("../controllers/paymentController");
const appCommerceController = require("../controllers/appCommerceController");
const ipadReadController = require("../controllers/ipadReadController");
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
const goatArenaController = require("../controllers/goatArenaController");
const {
  userIntegrityEvidenceUpload,
} = require("../middleware/archiveUpload");
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
router.post(
  "/auth/google/exchange",
  apiController.exchangeGoogleAuthCode
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

router.use(requireApiAuth);

router.get(
  "/commerce/storefront",
  appCommerceController.storefront
);
router.post(
  "/commerce/handoffs",
  appCommerceController.createHandoff
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

router.get(
  "/me",
  apiController.me
);
router.patch(
  "/me/school",
  apiController.updateSchool
);
router.patch(
  "/me/ranking-identity",
  apiController.updateRankingIdentity
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

module.exports = router;
