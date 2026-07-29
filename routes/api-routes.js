const express = require("express");
const apiController = require(
  "../controllers/apiController"
);
const {
  requireApiAuth,
} = require(
  "../middleware/apiAuthMiddleware"
);

const router = express.Router();

router.get(
  "/health",
  apiController.health
);
router.get(
  "/schools",
  apiController.schools
);
router.post(
  "/auth/register",
  apiController.register
);
router.post(
  "/auth/login",
  apiController.login
);
router.post(
  "/auth/password-reset/request",
  apiController.requestPasswordReset
);
router.post(
  "/auth/password-reset/verify",
  apiController.verifyPasswordReset
);
router.post(
  "/auth/password-reset/complete",
  apiController.resetPassword
);

router.use(requireApiAuth);

router.get(
  "/me",
  apiController.me
);
router.delete(
  "/me",
  apiController.withdrawMe
);
router.patch(
  "/me/ranking-identity",
  apiController.updateRankingIdentity
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
