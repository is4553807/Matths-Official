const express = require("express");
const academyController = require("../controllers/academyController");
const authMiddleware = require("../middleware/authMiddleware");
const {
  handleProfileAvatarUpload,
} = require("../middleware/profileAvatarUpload");

const router = express.Router();

router.get("/academy/join/:token", authMiddleware.isLoggedIn, academyController.inviteJoinPage);
router.post("/academy/join/:token", authMiddleware.isLoggedIn, academyController.acceptInvite);

router.get("/academy/setup", authMiddleware.isLoggedIn, authMiddleware.isTeacher, academyController.setupPage);
router.post("/academy/setup", authMiddleware.isLoggedIn, authMiddleware.isTeacher, academyController.createAcademy);
router.post("/academy/setup/join", authMiddleware.isLoggedIn, authMiddleware.isTeacher, academyController.requestAcademyJoin);
router.post("/academy/setup/join/cancel", authMiddleware.isLoggedIn, authMiddleware.isTeacher, academyController.cancelAcademyJoin);
router.get("/academy", authMiddleware.isLoggedIn, authMiddleware.isTeacher, academyController.portalPage);
router.get(
  "/academy/students/:membershipId",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.studentDetailPage
);
router.post(
  "/academy/requests/:membershipId/approve",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.approveStudent
);
router.post(
  "/academy/requests/:membershipId/reject",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.rejectStudent
);
router.post(
  "/academy/students/:membershipId/class",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.assignClass
);
router.post(
  "/academy/students/bulk",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.bulkManageStudents
);
router.get(
  "/academy/classes/:classId",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.classDetailPage
);
router.post("/academy/classes", authMiddleware.isLoggedIn, authMiddleware.isTeacher, academyController.createClass);
router.post("/academy/invites", authMiddleware.isLoggedIn, authMiddleware.isTeacher, academyController.createInvite);
router.post(
  "/academy/invites/:inviteId/revoke",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.revokeInvite
);
router.post(
  "/academy/staff/:staffId/approve",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.approveTeacher
);
router.post(
  "/academy/staff/:staffId/reject",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.rejectTeacher
);
router.post(
  "/academy/staff/:staffId/revoke",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.revokeTeacher
);
router.post(
  "/academy/profile-image",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  handleProfileAvatarUpload,
  academyController.changeAcademyProfileImage
);
router.post(
  "/academy/profile-image/remove",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.removeAcademyProfileImage
);

router.post("/profile/academy/request", authMiddleware.isLoggedIn, academyController.requestFromProfile);
router.post("/profile/academy/code", authMiddleware.isLoggedIn, academyController.requestByCodeFromProfile);
router.post("/profile/academy/leave", authMiddleware.isLoggedIn, academyController.leaveFromProfile);

module.exports = router;
