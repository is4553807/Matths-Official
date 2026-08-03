const express =
  require("express");
const authMiddleware =
  require("../middleware/authMiddleware");
const goatArenaController =
  require("../controllers/goatArenaController");
const {
  arenaEvidenceUpload,
} = require("../middleware/arenaEvidenceUpload");

const router =
  express.Router();

router.get(
  "/goat-arena",
  authMiddleware.isLoggedIn,
  goatArenaController.startPage
);

router.get(
  "/goat-arena/rankings",
  authMiddleware.isLoggedIn,
  goatArenaController.rankingsPage
);

router.get(
  "/goat-arena/sub",
  authMiddleware.isLoggedIn,
  goatArenaController.subDivisionPage
);

router.get(
  "/goat-arena/sub/challenge",
  authMiddleware.isLoggedIn,
  goatArenaController.subChallengePage
);

router.post(
  "/goat-arena/sub/challenges",
  authMiddleware.isLoggedIn,
  goatArenaController.createSubChallenge
);

router.get(
  "/goat-arena/matches/:matchId",
  authMiddleware.isLoggedIn,
  goatArenaController.arenaMatchPage
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

router.post(
  "/api/goat-arena/matches/:matchId/advance",
  authMiddleware.isLoggedIn,
  goatArenaController.advanceArenaMatchQuestion
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
  arenaEvidenceUpload.array("evidenceFiles", 5),
  goatArenaController.submitArenaMatchEvidence
);

router.post(
  "/goat-arena/revenge-rights/:rightId/claim",
  authMiddleware.isLoggedIn,
  goatArenaController.claimSubRevenge
);

router.post(
  "/goat-arena/revenge-rights/:rightId/forfeit",
  authMiddleware.isLoggedIn,
  goatArenaController.forfeitSubRevenge
);

router.get(
  "/goat-arena/main",
  authMiddleware.isLoggedIn,
  goatArenaController.mainDivisionPage
);

router.get(
  "/goat-arena/main/battle",
  authMiddleware.isLoggedIn,
  goatArenaController.mainBattlePage
);

router.post(
  "/goat-arena/main/challenges",
  authMiddleware.isLoggedIn,
  goatArenaController.createMainUpwardChallenge
);

router.post(
  "/goat-arena/main/invitations",
  authMiddleware.isLoggedIn,
  goatArenaController.createMainLowerInvitation
);

router.post(
  "/goat-arena/main/invitation-offers/:offerId/respond",
  authMiddleware.isLoggedIn,
  goatArenaController.respondMainInvitation
);

router.post(
  "/goat-arena/main/invitations/:invitationId/cancel",
  authMiddleware.isLoggedIn,
  goatArenaController.cancelMainInvitation
);

router.get(
  "/goat-arena/main/shop",
  authMiddleware.isLoggedIn,
  goatArenaController.mainShopPage
);

router.post(
  "/goat-arena/main/shop/purchases",
  authMiddleware.isLoggedIn,
  goatArenaController.purchaseMainShopItem
);

router.get(
  "/goat-arena/main/shop/analyses/:effectId",
  authMiddleware.isLoggedIn,
  goatArenaController.mainShopAnalysisResultPage
);

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
  "/goat-arena/:division/features/:featureKey",
  authMiddleware.isLoggedIn,
  goatArenaController.divisionFeaturePage
);

router.get(
  "/goat-arena/profile",
  authMiddleware.isLoggedIn,
  goatArenaController.profilePage
);

module.exports = router;
