const express = require("express");
const apiController = require(
  "../controllers/apiController"
);
const paymentController = require("../controllers/paymentController");
const appCommerceController = require("../controllers/appCommerceController");
const ipadReadController = require("../controllers/ipadReadController");
const goatArenaController = require("../controllers/goatArenaController");
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

router.get(
  "/learning/progress",
  ipadReadController.getLearningProgress
);
router.get(
  "/dashboard/activity",
  ipadReadController.getDashboardActivity
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
  apiController.updateTopic
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
