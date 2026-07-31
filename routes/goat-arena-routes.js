const express =
  require("express");
const authMiddleware =
  require("../middleware/authMiddleware");
const goatArenaController =
  require("../controllers/goatArenaController");

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
  "/goat-arena/main",
  authMiddleware.isLoggedIn,
  goatArenaController.mainDivisionPage
);

router.get(
  "/goat-arena/profile",
  authMiddleware.isLoggedIn,
  goatArenaController.profilePage
);

module.exports = router;
