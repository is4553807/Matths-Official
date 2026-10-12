const express =
  require("express");
const authMiddleware =
  require("../middleware/authMiddleware");
const goatArenaController =
  require("../controllers/goatArenaController");
const goatArenaV2Controller =
  require("../controllers/goatArenaV2Controller");
const arenaGuestChallengeController = require("../controllers/arenaGuestChallengeController");
const {
  arenaEvidenceUpload,
} = require("../middleware/arenaEvidenceUpload");
const {
  createUploadContentValidator,
} = require("../middleware/uploadContentValidation");
const {
  arenaGuestClaimIpRateLimit,
  arenaGuestEvidenceIpHardRateLimit,
  arenaGuestEvidenceIpRateLimit,
  arenaGuestPlayIpHardRateLimit,
  arenaGuestPlayIpRateLimit,
} = require("../middleware/requestSecurity");

const validateArenaEvidenceContent = createUploadContentValidator({
  maxTotalBytes: 30 * 1024 * 1024,
});

const router =
  express.Router();

// This router shares the root mount with admin, academy and public routes.
// Do not leave a student-only marker on requests handled by the next router.
router.use((req, res, next) => (
  /^\/(?:goat-arena|api\/goat-arena)(?:\/|$)/.test(req.path)
    ? authMiddleware.requireStudentAccount(req, res, next)
    : next()
));

router.get(
  "/goat-arena",
  authMiddleware.isLoggedIn,
  goatArenaController.startPage
);

router.get(
  "/goat-arena/mailbox",
  authMiddleware.isLoggedIn,
  goatArenaController.arenaMailboxPage
);

router.post(
  "/goat-arena/mailbox/read-all",
  authMiddleware.isLoggedIn,
  goatArenaController.markAllArenaMailboxRead
);

router.get(
  "/goat-arena/mailbox/:notificationId",
  authMiddleware.isLoggedIn,
  goatArenaController.arenaMailboxDetailPage
);

router.get(
  "/goat-arena/sub",
  authMiddleware.isLoggedIn,
  goatArenaController.subDivisionPage
);

router.post(
  "/goat-arena/sub/challenges",
  authMiddleware.isLoggedIn,
  (req, res, next) => {
    req.params.mode = "normal";
    return goatArenaV2Controller.joinMatchmaking(req, res, next);
  }
);

router.post(
  "/goat-arena/matchmaking/:mode/join",
  authMiddleware.isLoggedIn,
  goatArenaV2Controller.joinMatchmaking
);

router.post(
  "/goat-arena/competitive/solution-sharing-consent",
  authMiddleware.isLoggedIn,
  goatArenaV2Controller.acknowledgeCompetitiveSolutionSharing
);

router.post(
  "/goat-arena/matchmaking/cancel",
  authMiddleware.isLoggedIn,
  goatArenaV2Controller.cancelMatchmaking
);

router.get(
  "/api/goat-arena/matchmaking/status",
  authMiddleware.isLoggedIn,
  goatArenaV2Controller.matchmakingStatus
);
router.get(
  "/api/goat-arena/friends/status",
  authMiddleware.isLoggedIn,
  goatArenaV2Controller.friendStatus
);

router.post(
  "/goat-arena/placement/finalize",
  authMiddleware.isLoggedIn,
  goatArenaV2Controller.finalizePlacement
);

router.get(
  "/goat-arena/friends",
  authMiddleware.isLoggedIn,
  goatArenaV2Controller.friendsPage
);

router.post(
  "/goat-arena/friends/requests",
  authMiddleware.isLoggedIn,
  goatArenaV2Controller.sendFriendRequest
);

router.post(
  "/goat-arena/friends/requests/:requestId/respond",
  authMiddleware.isLoggedIn,
  goatArenaV2Controller.respondFriendRequest
);

router.post(
  "/goat-arena/friends/invitations",
  authMiddleware.isLoggedIn,
  goatArenaV2Controller.createFriendlyInvitation
);

router.post(
  "/goat-arena/friends/invitations/:invitationId/respond",
  authMiddleware.isLoggedIn,
  goatArenaV2Controller.respondFriendlyInvitation
);

router.post(
  "/goat-arena/friends/invitations/:invitationId/cancel",
  authMiddleware.isLoggedIn,
  goatArenaV2Controller.cancelFriendlyInvitation
);

router.get(
  "/goat-arena/matches/:matchId",
  authMiddleware.isLoggedIn,
  goatArenaController.arenaMatchPage
);
router.post(
  "/goat-arena/matches/:matchId/guest-invitations",
  authMiddleware.isLoggedIn,
  arenaGuestChallengeController.create
);
router.get(
  "/goat-arena/matches/:matchId/competitive-result",
  authMiddleware.isLoggedIn,
  goatArenaController.getAsyncCompetitiveResult
);
router.get(
  "/goat-arena/matches/:matchId/competitive-result/evidence/:side/:fileIndex",
  authMiddleware.isLoggedIn,
  goatArenaController.getAsyncCompetitiveEvidenceFile
);
router.get(
  "/goat-arena/matches/:matchId/normal-result",
  authMiddleware.isLoggedIn,
  goatArenaController.getAsyncNormalResult
);
router.get(
  "/goat-arena/matches/:matchId/normal-result/evidence/:side/:fileIndex",
  authMiddleware.isLoggedIn,
  goatArenaController.getAsyncNormalEvidenceFile
);
router.post(
  "/goat-arena/matches/:matchId/forfeit",
  authMiddleware.isLoggedIn,
  goatArenaV2Controller.forfeitMatch
);

router.post(
  "/goat-arena/matches/:matchId/prepare",
  authMiddleware.isLoggedIn,
  goatArenaController.prepareArenaMatch
);

router.post(
  "/goat-arena/matches/:matchId/start",
  authMiddleware.isLoggedIn,
  goatArenaController.startArenaMatch
);

router.post(
  "/api/goat-arena/matches/:matchId/answers",
  authMiddleware.isLoggedIn,
  goatArenaController.saveArenaMatchAnswers
);

router.post("/api/goat-arena/matches/:matchId/lock-question", authMiddleware.isLoggedIn, goatArenaController.lockArenaQuestionCompletion);

router.post(
  "/api/goat-arena/matches/:matchId/advance",
  authMiddleware.isLoggedIn,
  goatArenaController.advanceArenaMatchQuestion
);
router.get(
  "/api/goat-arena/matches/:matchId/solution-boards",
  authMiddleware.isLoggedIn,
  goatArenaController.getArenaInlineSolutionBoards
);
router.put(
  "/api/goat-arena/matches/:matchId/solution-boards/current",
  authMiddleware.isLoggedIn,
  arenaEvidenceUpload.single("solutionBoard"),
  validateArenaEvidenceContent,
  goatArenaController.saveArenaInlineSolutionBoard
);
router.post(
  "/api/goat-arena/matches/:matchId/solution-boards/finalize",
  authMiddleware.isLoggedIn,
  goatArenaController.finalizeArenaInlineSolutionBoards
);

router.post(
  "/api/goat-arena/matches/:matchId/activity",
  authMiddleware.isLoggedIn,
  goatArenaController.recordArenaMatchActivity
);

router.post(
  "/api/goat-arena/matches/:matchId/submit",
  authMiddleware.isLoggedIn,
  goatArenaController.submitArenaMatch
);

router.post(
  "/goat-arena/matches/:matchId/evidence",
  authMiddleware.isLoggedIn,
  (req, _res, next) => {
    req.arenaEvidenceReceivedAt =
      new Date();
    next();
  },
  arenaEvidenceUpload.array("evidenceFiles", 5),
  validateArenaEvidenceContent,
  (
    error,
    req,
    res,
    next
  ) =>
    goatArenaController.arenaMatchUploadError(
      error,
      req,
      res,
      next
    ),
  goatArenaController.submitArenaMatchEvidence
);

router.get(
  "/goat-arena/matches/:matchId/supplemental-evidence",
  authMiddleware.isLoggedIn,
  goatArenaController.arenaSupplementalEvidencePage
);

router.post(
  "/goat-arena/matches/:matchId/supplemental-evidence",
  authMiddleware.isLoggedIn,
  (req, _res, next) => {
    req.arenaEvidenceReceivedAt = new Date();
    next();
  },
  arenaEvidenceUpload.array("evidenceFiles", 5),
  validateArenaEvidenceContent,
  (error, req, res, next) =>
    goatArenaController.arenaSupplementalEvidenceUploadError(
      error,
      req,
      res,
      next
    ),
  goatArenaController.submitArenaSupplementalEvidence
);

router.post(
  "/api/goat-arena/tutorial",
  authMiddleware.isLoggedIn,
  goatArenaController.updateArenaTutorial
);

router.get(
  "/goat-arena/main",
  authMiddleware.isLoggedIn,
  goatArenaController.mainDivisionPage
);

router.post(
  "/goat-arena/main/challenges",
  authMiddleware.isLoggedIn,
  (req, res, next) => {
    req.params.mode = "competitive";
    return goatArenaV2Controller.joinMatchmaking(req, res, next);
  }
);

router.post(
  "/goat-arena/main/friendly-invitations",
  authMiddleware.isLoggedIn,
  goatArenaV2Controller.createFriendlyInvitation
);

router.post(
  "/goat-arena/main/friendly-invitations/:invitationId/respond",
  authMiddleware.isLoggedIn,
  goatArenaV2Controller.respondFriendlyInvitation
);

router.post(
  "/goat-arena/main/friendly-invitations/:invitationId/cancel",
  authMiddleware.isLoggedIn,
  goatArenaV2Controller.cancelFriendlyInvitation
);

router.get(
  "/goat-arena/rules",
  authMiddleware.isLoggedIn,
  goatArenaController.rulesPage
);

/* Public guest-friendly links deliberately live outside /goat-arena and
 * /api/goat-arena so the student-account gate above cannot force login. */
router.get(
  "/arena-invite/:token",
  arenaGuestPlayIpHardRateLimit,
  arenaGuestPlayIpRateLimit,
  arenaGuestChallengeController.page
);
router.post(
  "/api/arena-invite/:token/nickname-availability",
  arenaGuestPlayIpHardRateLimit,
  arenaGuestPlayIpRateLimit,
  arenaGuestChallengeController.nicknameAvailability
);
router.post(
  "/arena-invite/:token/claim",
  arenaGuestClaimIpRateLimit,
  arenaGuestChallengeController.claim
);
router.post(
  "/arena-invite/:token/reverse-challenge",
  arenaGuestClaimIpRateLimit,
  arenaGuestChallengeController.beginReverseChallengeRegistration
);
router.post(
  "/arena-invite/:token/start",
  arenaGuestPlayIpHardRateLimit,
  arenaGuestPlayIpRateLimit,
  arenaGuestChallengeController.start
);
router.post(
  "/api/arena-invite/:token/lock-question",
  arenaGuestPlayIpHardRateLimit,
  arenaGuestPlayIpRateLimit,
  arenaGuestChallengeController.lockQuestionCompletion
);
router.post(
  "/api/arena-invite/:token/advance",
  arenaGuestPlayIpHardRateLimit,
  arenaGuestPlayIpRateLimit,
  arenaGuestChallengeController.advance
);
router.get(
  "/api/arena-invite/:token/solution-boards",
  arenaGuestPlayIpHardRateLimit,
  arenaGuestPlayIpRateLimit,
  arenaGuestChallengeController.getBoards
);
router.put(
  "/api/arena-invite/:token/solution-board",
  arenaGuestEvidenceIpHardRateLimit,
  arenaGuestEvidenceIpRateLimit,
  arenaGuestChallengeController.authorizeBoardUpload,
  arenaEvidenceUpload.single("solutionBoard"),
  validateArenaEvidenceContent,
  arenaGuestChallengeController.saveBoard
);
router.post(
  "/api/arena-invite/:token/solution-boards/finalize",
  arenaGuestPlayIpHardRateLimit,
  arenaGuestPlayIpRateLimit,
  arenaGuestChallengeController.finalizeBoards
);
router.post(
  "/arena-invite/:token/evidence",
  arenaGuestEvidenceIpHardRateLimit,
  arenaGuestEvidenceIpRateLimit,
  arenaGuestChallengeController.authorizeEvidenceUpload,
  arenaEvidenceUpload.array("evidenceFiles", 5),
  validateArenaEvidenceContent,
  arenaGuestChallengeController.submitEvidence
);
router.get(
  "/arena-invite/:token/evidence/participants/:attemptId/:fileIndex",
  arenaGuestPlayIpHardRateLimit,
  arenaGuestPlayIpRateLimit,
  arenaGuestChallengeController.evidenceFile
);
router.get(
  "/arena-invite/:token/evidence/:side/:fileIndex",
  arenaGuestPlayIpHardRateLimit,
  arenaGuestPlayIpRateLimit,
  arenaGuestChallengeController.evidenceFile
);
router.use("/arena-invite/:token/evidence", arenaGuestChallengeController.uploadError);

router.get(
  "/goat-arena/rules/sub",
  authMiddleware.isLoggedIn,
  goatArenaController.subRulesPage
);

router.get(
  "/goat-arena/rules/main",
  authMiddleware.isLoggedIn,
  goatArenaController.mainRulesPage
);

router.get(
  "/goat-arena/profile",
  authMiddleware.isLoggedIn,
  goatArenaController.profilePage
);

router.get(
  "/goat-arena/guest-records/:attemptId",
  authMiddleware.isLoggedIn,
  arenaGuestChallengeController.claimedRecordPage
);

router.get(
  "/goat-arena/guest-records/:attemptId/evidence/:side/:fileIndex",
  authMiddleware.isLoggedIn,
  arenaGuestChallengeController.claimedEvidenceFile
);

router.post(
  "/goat-arena/guest-records/:attemptId/guest-invitations",
  authMiddleware.isLoggedIn,
  arenaGuestChallengeController.createReverseChallenge
);

router.post(
  "/goat-arena/profile/avatar",
  authMiddleware.isLoggedIn,
  goatArenaController.updateProfileAvatar
);

router.post(
  "/goat-arena/profile/tutorial/restart",
  authMiddleware.isLoggedIn,
  goatArenaController.restartArenaTutorial
);

module.exports = router;
