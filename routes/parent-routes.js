const express = require("express");
const parentController = require("../controllers/parentController");
const { isParentLoggedIn, isParentLoggedOut } = require("../middleware/parentAuthMiddleware");
const {
  loginRateLimit,
  registrationRateLimit,
} = require("../middleware/requestSecurity");

const router = express.Router();

router.get("/parent/invite/:token", parentController.inviteSignupPage);
router.post(
  "/parent/invite/:token",
  registrationRateLimit,
  parentController.completeInviteSignup
);
router.post(
  "/parent/invite/:token/link",
  isParentLoggedIn,
  parentController.acceptExistingParentInvite
);
router.get("/parent/login", isParentLoggedOut, parentController.loginPage);
router.post(
  "/parent/login",
  isParentLoggedOut,
  loginRateLimit,
  parentController.login
);
router.post("/parent/logout", isParentLoggedIn, parentController.logout);
router.get("/parent", isParentLoggedIn, parentController.dashboardPage);
router.post(
  "/parent/children/select",
  isParentLoggedIn,
  parentController.selectChild
);
router.get(
  "/parent/notifications",
  isParentLoggedIn,
  parentController.notificationSettingsPage
);
router.post(
  "/parent/notifications",
  isParentLoggedIn,
  parentController.updateNotificationSettings
);
router.get("/parent/pricing", isParentLoggedIn, parentController.pricingPage);
router.get(
  "/parent/checkout/:productCode",
  isParentLoggedIn,
  parentController.checkoutPage
);
router.post(
  "/parent/checkout/:productCode",
  isParentLoggedIn,
  parentController.prepareCheckout
);

module.exports = router;
