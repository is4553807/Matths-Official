const express = require('express');
const router = express.Router();
const matthsController = require('../controllers/matthsController');
const authMiddleware = require('../middleware/authMiddleware');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

const curriculumPath = path.resolve(__dirname, "..", "kr-2022-g10-math-curri.yaml");

router.get('/', matthsController.mainPage);
router.get('/intro', matthsController.introPage);
router.get('/visual-learning', matthsController.visualLearningPage);
router.get('/learning-flow', matthsController.learningFlowPage);
router.get("/curriculum", matthsController.curriculumPage);
router.get('/faq', matthsController.faqPage);
router.get(
  "/contact",
  authMiddleware.isLoggedIn,
  matthsController.contactPage
);
router.post(
  "/contact",
  authMiddleware.isLoggedIn,
  matthsController.submitContactInquiry
);
router.get('/terms', matthsController.termsPage);
router.get('/privacy', matthsController.privacyPage);

router.get(
  "/forgot-password",
  matthsController.forgotPasswordPage
);
router.post(
  "/forgot-password",
  matthsController.requestPasswordReset
);
router.post(
  "/forgot-password/verify",
  matthsController.verifyPasswordReset
);
router.post(
  "/forgot-password/reset",
  matthsController.completePasswordReset
);

router.get("/my-learning", authMiddleware.isLoggedIn, matthsController.myLearning);

router.get(
  "/learn/:courseId/:unitId",
  authMiddleware.isLoggedIn, 
  matthsController.unitLearning
);

router.get(
  "/learn/:courseId/:unitId/:conceptId",
  authMiddleware.isLoggedIn, 
  matthsController.unitLearning
);

router.get('/main', authMiddleware.isLoggedIn, matthsController.main);

router.get(
  "/war-of-masters",
  authMiddleware.isLoggedIn,
  matthsController.warOfMastersPage
);

router.get('/profile', authMiddleware.isLoggedIn, matthsController.profilePage);

router.post(
  '/profile/nickname',
  authMiddleware.isLoggedIn,
  matthsController.changeNickname
);

router.post(
  "/profile/ranking-identity",
  authMiddleware.isLoggedIn,
  matthsController.changeRankingIdentity
);

router.post(
  '/profile/school',
  authMiddleware.isLoggedIn,
  matthsController.changeSchool
);

router.post(
  '/profile/password',
  authMiddleware.isLoggedIn,
  matthsController.changePassword
);

router.get('/login', authMiddleware.isLoggedOut, matthsController.loginPage);

router.post('/login', authMiddleware.isLoggedOut, matthsController.login);

router.get('/register', matthsController.registerPage);

router.post('/register', matthsController.register);

router.post('/logout', authMiddleware.isLoggedIn, matthsController.logout);

router.get('/log-curriculum', authMiddleware.isLoggedIn, matthsController.loggedCurriculumPage);

router.get(
  "/assessments",
  authMiddleware.isLoggedIn,
  matthsController.assessmentCenterPage
);

router.post(
  "/assessments/start",
  authMiddleware.isLoggedIn,
  matthsController.startAssessment
);

router.get(
  "/assessments/:attemptId",
  authMiddleware.isLoggedIn,
  matthsController.assessmentAttemptPage
);

router.post(
  "/assessments/:attemptId/submit",
  authMiddleware.isLoggedIn,
  matthsController.submitAssessment
);

router.post(
  "/api/assessments/:attemptId/draft",
  authMiddleware.isLoggedIn,
  matthsController.saveAssessmentDraft
);

router.post(
  "/api/assessments/:attemptId/expire",
  authMiddleware.isLoggedIn,
  matthsController.expireAssessment
);

router.get('/wrong-notes', authMiddleware.isLoggedIn, matthsController.wrongNotesPage);

router.get(
  "/quick-practice",
  authMiddleware.isLoggedIn,
  matthsController.quickPracticePage
);
router.post(
  "/api/quick-practice/start",
  authMiddleware.isLoggedIn,
  matthsController.startQuickPractice
);
router.post(
  "/api/quick-practice/:instanceId/submit",
  authMiddleware.isLoggedIn,
  matthsController.submitQuickPractice
);
router.post(
  "/api/quick-practice/:instanceId/expire",
  authMiddleware.isLoggedIn,
  matthsController.expireQuickPractice
);

router.get(
  "/coach-suggestions",
  authMiddleware.isLoggedIn,
  matthsController.coachSuggestionBoard
);
router.post(
  "/coach-suggestions",
  authMiddleware.isLoggedIn,
  matthsController.submitCoachSuggestion
);
router.post(
  "/coach-suggestions/:suggestionId/moderate",
  authMiddleware.isLoggedIn,
  matthsController.moderateCoachSuggestion
);

router.get(
  "/wrong-notes/:attemptId/review",
  authMiddleware.isLoggedIn,
  matthsController.wrongNoteReviewPage
);

router.post('/api/dashboard/plan/:taskId/toggle', authMiddleware.isLoggedIn, matthsController.togglePlanTask);

router.patch('/api/preferences/coach-mode', authMiddleware.isLoggedIn, matthsController.changeCoachMode);

router.patch('/api/learning-progress/:courseId/:unitId/:conceptId/topics/:topicIndex', authMiddleware.isLoggedIn, matthsController.updateTopicCompletion);

router.get(
  "/api/practice/:courseId/:unitId/:conceptId/next",
  authMiddleware.isLoggedIn,
  matthsController.nextPracticeProblem
);

router.post(
  "/api/practice/:courseId/:unitId/:conceptId/attempt",
  authMiddleware.isLoggedIn,
  matthsController.submitPracticeProblem
);

router.patch(
  "/api/practice/:courseId/:unitId/:conceptId/completion",
  authMiddleware.isLoggedIn,
  matthsController.changeConceptCompletion
);

module.exports = router;
