const express = require("express");
const academyController = require("../controllers/academyController");
const authMiddleware = require("../middleware/authMiddleware");
const {
  handleProfileAvatarUpload,
} = require("../middleware/profileAvatarUpload");
const {
  handleAcademyAssignmentUpload,
} = require("../middleware/academyAssignmentUpload");
const {
  handleAcademyForensicsUpload,
} = require("../middleware/pdfForensicsUpload");

const router = express.Router();

router.get("/academy/join/:token", authMiddleware.isLoggedIn, academyController.inviteJoinPage);
router.post("/academy/join/:token", authMiddleware.isLoggedIn, academyController.acceptInvite);
router.get("/my-academy", authMiddleware.isLoggedIn, academyController.studentAcademyPage);
router.get(
  "/my-academy/weeks/:weekId",
  authMiddleware.isLoggedIn,
  academyController.studentAcademyWeekPage
);
router.get(
  "/my-academy/weeks/:weekId/files/:fileId",
  authMiddleware.isLoggedIn,
  academyController.downloadStudentAcademyWeekFile
);
router.post(
  "/my-academy/weeks/:weekId/submission",
  authMiddleware.isLoggedIn,
  academyController.submitStudentAcademyAssignment
);

router.get("/academy/setup", authMiddleware.isLoggedIn, authMiddleware.isTeacher, academyController.setupPage);
router.post("/academy/setup", authMiddleware.isLoggedIn, authMiddleware.isTeacher, academyController.createAcademy);
router.post("/academy/setup/join", authMiddleware.isLoggedIn, authMiddleware.isTeacher, academyController.requestAcademyJoin);
router.post("/academy/setup/join/cancel", authMiddleware.isLoggedIn, authMiddleware.isTeacher, academyController.cancelAcademyJoin);
router.get("/academy", authMiddleware.isLoggedIn, authMiddleware.isTeacher, academyController.portalPage);
router.get(
  "/academy/forensics",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.academyForensicsPage
);
router.post(
  "/academy/forensics/analyze",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  handleAcademyForensicsUpload,
  academyController.analyzeAcademyForensics
);
router.post(
  "/academy/attendance",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.saveAttendance
);
router.post(
  "/academy/attendance/sessions/:sessionId/regenerate-code",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.regenerateAttendanceCode
);
router.post(
  "/api/academy/attendance/check-in",
  authMiddleware.isLoggedIn,
  academyController.studentAttendanceCheckIn
);
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
router.post(
  "/academy/classes/:classId/settings",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.updateClassSettings
);
router.post(
  "/academy/classes/:classId/weeks",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  handleAcademyAssignmentUpload,
  academyController.saveClassWeek
);
router.post(
  "/academy/classes/:classId/weeks/:weekId/files/:fileId/remove",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.removeClassWeekFile
);
router.post(
  "/academy/classes/:classId/weeks/:weekId/delete",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.deleteClassWeek
);
router.get(
  "/academy/classes/:classId/weeks/:weekId/files/:fileId",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.downloadClassWeekFile
);
router.post(
  "/academy/classes/:classId/archive",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.archiveClass
);
router.post(
  "/academy/classes/:classId/restore",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.restoreClass
);
router.post(
  "/academy/classes/:classId/co-teachers",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.addClassCoTeacher
);
router.post(
  "/academy/classes/:classId/co-teachers/:teacherUserId/remove",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.removeClassCoTeacher
);
router.post(
  "/academy/classes/:classId/homeroom-transfer",
  authMiddleware.isLoggedIn,
  authMiddleware.isTeacher,
  academyController.transferClassHomeroom
);
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
