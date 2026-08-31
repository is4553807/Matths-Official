const express = require('express');
const router = express.Router();
const matthsController = require('../controllers/matthsController');
const storeController = require('../controllers/storeController');
const checkoutController = require('../controllers/checkoutController');
const paymentController = require('../controllers/paymentController');
const appCommerceController = require('../controllers/appCommerceController');
const authMiddleware = require('../middleware/authMiddleware');
const {
  adminArchiveUpload,
  adminFormulaUpload,
  adminWeeklyMockUpload,
  userIntegrityEvidenceUpload,
} = require("../middleware/archiveUpload");
const {
  handleStoreUpload,
} = require("../middleware/storeUpload");
const {
  pdfForensicsUpload,
} = require("../middleware/pdfForensicsUpload");
const {
  communityUpload,
  loadCommunityUploadAccess,
} = require("../middleware/communityUpload");
const {
  handleProfileAvatarUpload,
} = require("../middleware/profileAvatarUpload");
const {
  COMMUNITY_ATTACHMENT_LIMIT,
  discardCommunityUploads,
} = require("../services/communityAttachmentService");
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const {
  getAdminTodoSummary,
} = require("../services/adminTodoService");
const {
  assertPlacementExamAccess,
} = require("../services/placementExamService");
const {
  appleWebOAuthCallbackIpRateLimit,
  appleWebOAuthStartIpRateLimit,
  loginIpRateLimit,
  loginRateLimit,
  passwordResetIpRateLimit,
  passwordResetRateLimit,
  registrationIpRateLimit,
  registrationRateLimit,
} = require("../middleware/requestSecurity");
const {
  createUploadContentValidator,
  discardRequestUploads,
  validateRequestUploads,
} = require("../middleware/uploadContentValidation");

const validateAdminArchiveContent = createUploadContentValidator({
  maxTotalBytes: 500 * 1024 * 1024,
});
const validateAdminExamContent = createUploadContentValidator({
  maxTotalBytes: 300 * 1024 * 1024,
});
const validateForensicContent = createUploadContentValidator({
  maxTotalBytes: 50 * 1024 * 1024,
});
const validateIntegrityEvidenceContent = createUploadContentValidator({
  maxTotalBytes: 100 * 1024 * 1024,
});
const validateStoreContent = createUploadContentValidator({
  maxTotalBytes: 500 * 1024 * 1024,
});

const curriculumPath = path.resolve(__dirname, "..", "kr-2022-g10-math-curri.yaml");

function handleCommunityUpload(
  req,
  res,
  next
) {
  communityUpload.array(
    "communityFiles",
    COMMUNITY_ATTACHMENT_LIMIT
  )(
    req,
    res,
    async (error) => {
      if (error) {
        await discardCommunityUploads(
          req.files || []
        );
        req.files = [];
        req.communityUploadError =
          error;
      } else {
        try {
          await validateRequestUploads(req, {
            maxTotalBytes: 50 * 1024 * 1024,
          });
        } catch (validationError) {
          await discardRequestUploads(req);
          req.files = [];
          req.communityUploadError = validationError;
        }
      }
      return next();
    }
  );
}

async function requirePlacementExamAccess(req, _res, next) {
  try {
    await assertPlacementExamAccess({
      userId: req.session?.user?.id,
      attemptId: req.params?.attemptId || "",
    });
    return next();
  } catch (error) {
    return next(error);
  }
}

router.get('/', matthsController.mainPage);
router.get('/intro', matthsController.introPage);
router.get('/pricing', matthsController.pricingPage);
router.get('/app/commerce/:token', appCommerceController.consumeHandoff);
router.get('/payments/toss/success', paymentController.tossSuccess);
router.get('/payments/toss/fail', paymentController.tossFailure);
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
  "/community",
  matthsController.communityPage
);
router.get(
  "/community/new",
  authMiddleware.isLoggedIn,
  matthsController.communityNewPage
);
router.post(
  "/community",
  authMiddleware.isLoggedIn,
  loadCommunityUploadAccess,
  handleCommunityUpload,
  matthsController.submitCommunityPost
);
router.get(
  "/community/operations/:announcementId",
  matthsController.communityAnnouncementPage
);
router.get(
  "/community/notices/:noticeId",
  matthsController.communityNoticePage
);
router.get(
  "/community/rules/:boardType",
  matthsController.communityRulesPage
);
router.get(
  "/community/blocked-users",
  authMiddleware.isLoggedIn,
  matthsController.communityBlockedUsersPage
);
router.post(
  "/community/blocked-users/:userId/unblock",
  authMiddleware.isLoggedIn,
  matthsController.unblockCommunityUser
);
router.get(
  "/community/:postId/attachments/:attachmentId",
  matthsController.communityAttachmentFile
);
router.get(
  "/community/:postId",
  matthsController.communityPostPage
);
router.post(
  "/community/:postId/block-author",
  authMiddleware.isLoggedIn,
  matthsController.blockCommunityPostAuthor
);
router.post(
  "/community/:postId/comments/:commentId/block-author",
  authMiddleware.isLoggedIn,
  matthsController.blockCommunityCommentAuthor
);
router.post(
  "/community/:postId/delete",
  authMiddleware.isLoggedIn,
  matthsController.deleteOwnCommunityPost
);
router.post(
  "/community/:postId/comments",
  authMiddleware.isLoggedIn,
  matthsController.submitCommunityComment
);
router.post(
  "/community/:postId/vote",
  authMiddleware.isLoggedIn,
  matthsController.submitCommunityVote
);
router.post(
  "/community/:postId/report",
  authMiddleware.isLoggedIn,
  matthsController.submitCommunityReport
);

router.use(async (req, res, next) => {
  res.locals.adminTodoSummary = {
    pendingCount: 0,
    items: [],
  };
  if (
    req.session?.user?.role !==
    "admin"
  ) {
    return next();
  }
  try {
    res.locals.adminTodoSummary =
      await getAdminTodoSummary();
  } catch (error) {
    console.error(
      "관리자 할 일 요약 조회 실패:",
      error
    );
  }
  return next();
});

router.get(
  "/archive",
  authMiddleware.isLoggedIn,
  matthsController.archivePage
);
router.get(
  "/archive/admin",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.archiveAdminPage
);
router.post(
  "/archive/admin/folders",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.createArchiveFolder
);
router.post(
  "/archive/admin/folders/:folderId/update",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.updateArchiveFolder
);
router.post(
  "/archive/admin/folders/:folderId/pin",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.setArchiveFolderPinned
);
router.post(
  "/archive/admin/folders/:folderId/delete",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.deleteArchiveFolder
);
router.post(
  "/archive/admin/upload",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  (req, res, next) => {
    adminArchiveUpload.array(
      "archiveFiles",
      20
    )(
      req,
      res,
      (error) => {
        if (error) {
          error.status =
            error.status || 400;
          return next(error);
        }

        return next();
      }
    );
  },
  validateAdminArchiveContent,
  matthsController.uploadArchiveItem
);
router.post(
  "/archive/admin/items/bulk-delete",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.deleteArchiveItems
);
router.post(
  "/archive/admin/items/bulk-move",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.moveArchiveItems
);
router.post(
  "/archive/admin/items/:itemId/delete",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.deleteArchiveItem
);
router.post(
  "/archive/admin/trash/:itemId/restore",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.restoreArchiveItem
);
router.post(
  "/archive/admin/trash/:itemId/purge",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.purgeArchiveItem
);
router.get(
  "/archive/:itemId/download",
  authMiddleware.isLoggedIn,
  matthsController.downloadArchiveItem
);

// Matths 교재 상점은 GOAT Arena 상점과 별개의 현금 상품 카탈로그입니다.
router.get(
  "/store",
  authMiddleware.isLoggedIn,
  storeController.storePage
);
router.get(
  "/store/content/:contentId",
  authMiddleware.isLoggedIn,
  storeController.studyHallContentPage
);
router.post(
  "/store/content/:contentId/save",
  authMiddleware.isLoggedIn,
  storeController.saveStudyHallProgress
);
router.post(
  "/store/content/:contentId/submit",
  authMiddleware.isLoggedIn,
  storeController.submitStudyHallProgress
);
router.get(
  "/store/content/:contentId/files/:assetId",
  authMiddleware.isLoggedIn,
  storeController.downloadStudyHallAsset
);
router.get(
  "/store/products/:slug",
  authMiddleware.isLoggedIn,
  storeController.storeProductPage
);
router.get(
  "/store/products/:slug/download/:assetId",
  authMiddleware.isLoggedIn,
  storeController.downloadFreeStoreProduct
);
router.get(
  "/store/media/:productId/:assetId",
  authMiddleware.isLoggedIn,
  storeController.storeMedia
);
router.get(
  "/admin/store",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  storeController.adminStorePage
);
router.post(
  "/admin/store/content",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  handleStoreUpload,
  validateStoreContent,
  storeController.createStudyHallContent
);
router.post(
  "/admin/store/content/:contentId",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  handleStoreUpload,
  validateStoreContent,
  storeController.updateStudyHallContent
);
router.post(
  "/admin/store/content/:contentId/archive",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  storeController.archiveStudyHallContent
);
router.post(
  "/admin/store/products",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  handleStoreUpload,
  validateStoreContent,
  storeController.createStoreProduct
);
router.post(
  "/admin/store/products/:productId",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  handleStoreUpload,
  validateStoreContent,
  storeController.updateStoreProduct
);
router.post(
  "/admin/store/products/:productId/delete",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  storeController.deleteStoreProduct
);
router.post(
  "/admin/store/categories",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  storeController.createStoreCategory
);
router.post(
  "/admin/store/categories/reorder",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  storeController.reorderStoreCategories
);
router.post(
  "/admin/store/categories/:categoryId",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  storeController.updateStoreCategory
);
router.post(
  "/admin/store/categories/:categoryId/delete",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  storeController.deleteStoreCategory
);

router.get(
  "/admin",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminDashboardPage
);
router.get(
  "/admin/academies",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminAcademiesPage
);
router.get(
  "/admin/academies/:academyId",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminAcademyDetailPage
);
router.get(
  "/admin/academies/:academyId/weeks/:weekId/files/:fileId",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminDownloadAcademyWeekFile
);
router.post(
  "/admin/academies/:academyId/approve",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminApproveAcademy
);
router.post(
  "/admin/academies/:academyId/reject",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminRejectAcademy
);
router.post(
  "/admin/academies/:academyId/profile",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateAcademyProfile
);
router.post(
  "/admin/academies/:academyId/contract",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateAcademyContract
);
router.post(
  "/admin/academies/:academyId/profile-image",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  handleProfileAvatarUpload,
  matthsController.adminUpdateAcademyProfileImage
);
router.post(
  "/admin/academies/:academyId/staff/:staffId",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateAcademyStaff
);
router.post(
  "/admin/academies/:academyId/owner",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminTransferAcademyOwner
);
router.post(
  "/admin/academies/:academyId/students/:membershipId",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateAcademyStudent
);
router.post(
  "/admin/academies/:academyId/students/:membershipId/class",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminAssignAcademyStudentClass
);
router.post(
  "/admin/academies/:academyId/classes/:classId",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateAcademyClass
);
router.post(
  "/admin/academies/:academyId/classes/:classId/operations",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateAcademyClassOperations
);
router.post(
  "/admin/academies/:academyId/classes/:classId/homeroom",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminTransferAcademyClassHomeroom
);
router.post(
  "/admin/academies/:academyId/attendance/:attendanceId",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateAcademyAttendance
);
router.post(
  "/admin/academies/:academyId/attendance/sessions/:sessionId/regenerate-code",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminRegenerateAcademyAttendanceCode
);
router.post(
  "/admin/academies/:academyId/invites/:inviteId",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateAcademyInvite
);
router.get(
  "/api/admin/revenue",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminRevenueMetrics
);
router.post(
  "/admin/finance/withdrawals",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminRecordBusinessWithdrawal
);
router.post(
  "/admin/finance/other-unpaid-costs",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateOtherUnpaidCosts
);
router.get(
  "/admin/paybacks",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminPaybacksPage
);
router.get(
  "/admin/refunds",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminRefundsPage
);
router.post(
  "/admin/refunds/:refundRequestId/calculate",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminCalculateRefund
);
router.post(
  "/admin/refunds/:refundRequestId/complete",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminCompleteRefund
);
router.post(
  "/admin/refunds/:refundRequestId/reject",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminRejectRefund
);
router.post(
  "/admin/paybacks/:cycleId/complete",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminCompletePayback
);
router.post(
  "/admin/paybacks/payouts/:payoutRecordId/resend-email",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminResendPaybackEmail
);
router.get(
  "/admin/operations-guide",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminOperationsGuidePage
);
router.get(
  "/admin/pdf-forensics",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminPdfForensicsPage
);
router.post(
  "/admin/pdf-forensics/analyze",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  pdfForensicsUpload.single("forensicFile"),
  validateForensicContent,
  matthsController.adminAnalyzeForensicPdf
);
router.get(
  "/admin/arena-policies",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminArenaPoliciesPage
);
router.post(
  "/admin/arena-policies/matchmaking",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminSetArenaMatchmaking
);
router.get(
  "/admin/problem-banks",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminProblemBanksPage
);
router.post(
  "/admin/problem-banks/types/sync",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminSyncProblemTypes
);
router.post(
  "/admin/problem-banks/types/:versionId/revise",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminReviseProblemType
);
router.post(
  "/admin/problem-banks/arena/types",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminCreateArenaTierCatalogType
);
router.post(
  "/admin/problem-banks/arena/data",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminCreateArenaProblemData
);
router.post(
  "/admin/problem-banks/arena/data/:versionId",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateArenaProblemData
);
router.post(
  "/admin/problem-banks/arena/data/:versionId/activate",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminActivateArenaProblemData
);
router.get(
  "/admin/arena-live-matches",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminActiveArenaMatchesPage
);
router.get(
  "/admin/arena-match-history",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminArenaMatchHistoryPage
);
router.get(
  "/admin/arena-matches",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminArenaMatchesPage
);
router.get(
  "/admin/arena-matches/evidence/:evidenceId/:storedName",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminArenaEvidenceFile
);
router.post(
  "/admin/arena-matches/:matchId/review",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminReviewHeldArenaMatch
);
router.post(
  "/admin/arena-matches/:matchId/supplemental-evidence/:role/request",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminRequestArenaSupplementalEvidence
);
router.post(
  "/admin/arena-integrity/:caseId/review",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminReviewArenaIntegrityCase
);
router.get(
  "/admin/arena-audit",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminArenaAuditPage
);
router.get(
  "/api/admin/arena-audit",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminArenaAuditData
);
router.post(
  "/admin/arena-audit/ranking/rebuild",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminRebuildFinalRanking
);
router.post(
  "/admin/arena-audit/maintenance",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminRunRankingMaintenance
);
router.get(
  "/admin/arena-audit/ranking.csv",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminExportFinalRanking
);
router.get(
  "/admin/data-analysis",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminDataAnalysisPage
);
router.post(
  "/admin/data-analysis/rebuild",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminRebuildDataAnalysis
);
router.post(
  "/admin/arena-policies",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminCreateArenaPolicy
);
router.post(
  "/admin/arena-policies/sub",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminCreateArenaPolicy
);
router.post(
  "/admin/arena-policies/main",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminCreateMainArenaPolicy
);
router.post(
  "/admin/arena-policies/mock-exam-only/price",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateMockExamPackagePrice
);
router.post(
  "/admin/arena-policies/learning-package/price",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateLearningPackagePrice
);
router.post(
  "/admin/arena-policies/main-shop",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateMainShopPolicy
);
router.post(
  "/admin/arena-policies/:policyId/activate",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminActivateArenaPolicy
);
router.post(
  "/admin/arena-policies/sub/:policyId/activate",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminActivateArenaPolicy
);
router.post(
  "/admin/arena-policies/main/:policyId/activate",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminActivateMainArenaPolicy
);
router.post(
  "/admin/arena-policies/:policyId/retire",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminRetireArenaPolicy
);
router.post(
  "/admin/arena-policies/sub/:policyId/retire",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminRetireArenaPolicy
);
router.post(
  "/admin/arena-policies/main/:policyId/retire",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminRetireMainArenaPolicy
);
router.post(
  "/admin/announcements",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminCreateAnnouncement
);
router.post(
  "/admin/announcements/:announcementId/status",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminToggleAnnouncement
);
router.get(
  "/admin/private-mock-exams",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminPrivateMockExamsPage
);
router.post(
  "/admin/private-mock-exams",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  (req, res, next) => {
    adminWeeklyMockUpload.fields([
      {
        name: "examFiles",
        maxCount: 10,
      },
      {
        name:
          "answerKeyFiles",
        maxCount: 10,
      },
      {
        name:
          "answerSheetFiles",
        maxCount: 10,
      },
    ])(
      req,
      res,
      (error) => {
        if (error) {
          error.status =
            error.status || 400;
          return next(error);
        }

        return next();
      }
    );
  },
  validateAdminExamContent,
  matthsController.adminCreatePrivateMockExam
);
router.post(
  "/admin/private-mock-exams/:examId/delete",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminDeletePrivateMockExam
);
router.get(
  "/admin/private-mock-exams/:examId/files/:fileType",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminPrivateMockExamPdfFile
);
router.get(
  "/admin/integrity-cases/:caseId/evidence/:archiveItemId/preview",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminPrivateMockIntegrityEvidenceFile
);
router.post(
  "/admin/private-mock-exams/:examId/attempts/:attemptId/integrity-request",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminRequestPrivateMockIntegrityEvidence
);
router.post(
  "/admin/private-mock-exams/:examId/integrity/:caseId/review",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminReviewPrivateMockIntegrityCase
);
router.post(
  "/admin/private-mock-exams/:examId/answer-corrections",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminCorrectPrivateMockAnswers
);
router.get(
  "/admin/private-mock-exams/:examId",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminPrivateMockExamDetailPage
);
router.get(
  "/admin/private-mock-objections/:objectionId",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminPrivateMockObjectionPage
);
router.post(
  "/admin/private-mock-objections/:objectionId/reject",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminRejectPrivateMockObjection
);
router.post(
  "/admin/private-mock-objections/:objectionId/accept",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminAcceptPrivateMockObjection
);
router.post(
  "/admin/private-mock-exams/resources/formula",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  (req, res, next) => {
    adminFormulaUpload.single(
      "formulaFile"
    )(req, res, (error) => {
      if (error) {
        error.status =
          error.status || 400;
        return next(error);
      }
      return next();
    });
  },
  validateAdminExamContent,
  matthsController.adminUploadPrivateMockFormula
);
router.post(
  "/admin/private-mock-exams/resources/formula/:resourceId/delete",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminDeletePrivateMockFormula
);
router.get(
  "/admin/inquiries",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminInquiriesPage
);
router.get(
  "/admin/todos",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminTodosPage
);
router.post(
  "/admin/todos/:todoId/complete",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminCompleteTodo
);
router.post(
  "/admin/todos/:todoId/reopen",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminReopenTodo
);
router.get(
  "/admin/community",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminCommunityPage
);
router.post(
  "/admin/community/notices",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminCreateCommunityNotice
);
router.post(
  "/admin/community/notices/:noticeId/update",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateCommunityNotice
);
router.post(
  "/admin/community/notices/:noticeId/pin",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminSetCommunityNoticePinned
);
router.post(
  "/admin/community/notices/:noticeId/status",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminModerateCommunityNotice
);
router.get(
  "/admin/coach-suggestions",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminCoachSuggestionsPage
);
router.post(
  "/admin/coach-suggestions/:suggestionId/moderate",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.moderateCoachSuggestion
);
router.post(
  "/admin/community/:postId/pin",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminSetCommunityPostPinned
);
router.post(
  "/admin/community/:postId/edit",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminEditCommunityPost
);
router.post(
  "/admin/community/:postId/status",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminModerateCommunityPost
);
router.post(
  "/admin/community/:postId/warn",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminWarnCommunityPost
);
router.post(
  "/admin/community/reports/:reportId/review",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminReviewCommunityReport
);
router.post(
  "/admin/community/comments/:commentId/status",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminModerateCommunityComment
);
router.post(
  "/admin/community/comments/:commentId/warn",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminWarnCommunityComment
);
router.post(
  "/admin/inquiries/:inquiryId/reply",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminReplyInquiry
);
router.post(
  "/admin/inquiries/:inquiryId/status",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateInquiryStatus
);
router.get(
  "/admin/users",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUsersPage
);
router.get(
  "/admin/users/sanctions",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUserSanctionsPage
);
router.get(
  "/admin/audit-log",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminAuditLogPage
);
router.get(
  "/admin/parents/:parentId",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminParentDetailPage
);
router.post(
  "/admin/parents/:parentId/account-status",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateParentAccountStatus
);
router.post(
  "/admin/parents/:parentId/children/:childUserId/notifications",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateParentChildNotifications
);
router.post(
  "/admin/parents/:parentId/children/:childUserId/unlink",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminRevokeParentChildLink
);
router.get(
  "/admin/users/:userId/activity",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUserActivityPage
);
router.get(
  "/admin/users/:userId/assessments/:attemptId",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminAssessmentDetailPage
);
router.get(
  "/admin/users/:userId",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUserDetailPage
);
router.post(
  "/admin/users/:userId/nickname",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateUserNickname
);
router.post(
  "/admin/users/:userId/notification",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminSendUserNotification
);
router.post(
  "/admin/users/:userId/email",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminSendUserEmail
);
router.post(
  "/admin/users/:userId/password-reset",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminSendPasswordReset
);
router.post(
  "/admin/users/:userId/account",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminSetUserActive
);
router.post(
  "/admin/users/:userId/role",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateUserRole
);
router.post(
  "/admin/users/:userId/account-status",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateUserAccountStatus
);
router.post(
  "/admin/users/:userId/delete",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminDeleteUserAccount
);
router.post(
  "/admin/users/:userId/warnings",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateUserWarningCount
);
router.post(
  "/admin/users/:userId/package-access",
  authMiddleware.isLoggedIn,
  authMiddleware.isAdmin,
  matthsController.adminUpdateUserPackageAccess
);
router.get(
  "/notifications",
  authMiddleware.isLoggedIn,
  matthsController.notificationInboxPage
);
router.post(
  "/notifications/read-all",
  authMiddleware.isLoggedIn,
  matthsController.markAllUserNotificationsRead
);
router.post(
  "/announcements/:announcementId/dismiss",
  authMiddleware.isLoggedIn,
  matthsController.dismissDashboardAnnouncement
);
router.post(
  "/notifications/:notificationId/dashboard-dismiss",
  authMiddleware.isLoggedIn,
  matthsController.dismissDashboardNotification
);
router.get(
  "/notifications/:notificationId",
  authMiddleware.isLoggedIn,
  matthsController.notificationDetailPage
);
router.get(
  "/notifications/:notificationId/open",
  authMiddleware.isLoggedIn,
  matthsController.openUserNotification
);

router.get(
  "/forgot-password",
  matthsController.forgotPasswordPage
);
router.get(
  "/forgot-password/link",
  matthsController.openPasswordResetLink
);
router.post(
  "/forgot-password",
  passwordResetIpRateLimit,
  passwordResetRateLimit,
  matthsController.requestPasswordReset
);
router.post(
  "/forgot-password/verify",
  passwordResetIpRateLimit,
  passwordResetRateLimit,
  matthsController.verifyPasswordReset
);
router.post(
  "/forgot-password/reset",
  passwordResetIpRateLimit,
  passwordResetRateLimit,
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

router.post(
  "/api/dashboard-tutorial",
  authMiddleware.isLoggedIn,
  matthsController.updateDashboardTutorial
);

router.get(
  "/war-of-masters",
  authMiddleware.isLoggedIn,
  matthsController.warOfMastersPage
);

router.get(
  "/war-of-masters/rankings",
  authMiddleware.isLoggedIn,
  matthsController.warOfMastersRankingsPage
);
router.get(
  "/war-of-masters/objections/new",
  authMiddleware.isLoggedIn,
  matthsController.privateMockObjectionPage
);
router.post(
  "/war-of-masters/objections",
  authMiddleware.isLoggedIn,
  matthsController.submitPrivateMockObjection
);

router.post(
  "/war-of-masters/placement/start",
  authMiddleware.isLoggedIn,
  requirePlacementExamAccess,
  matthsController.startPlacementExam
);

router.get(
  "/war-of-masters/placement/:attemptId",
  authMiddleware.isLoggedIn,
  requirePlacementExamAccess,
  matthsController.placementExamPage
);

router.post(
  "/war-of-masters/placement/:attemptId/submit",
  authMiddleware.isLoggedIn,
  requirePlacementExamAccess,
  matthsController.submitPlacementExam
);

router.post(
  "/api/war-of-masters/placement/:attemptId/draft",
  authMiddleware.isLoggedIn,
  requirePlacementExamAccess,
  matthsController.savePlacementExamDraft
);

router.post(
  "/api/war-of-masters/placement/:attemptId/expire",
  authMiddleware.isLoggedIn,
  requirePlacementExamAccess,
  matthsController.expirePlacementExam
);

router.get('/profile', authMiddleware.isLoggedIn, matthsController.profilePage);
router.get(
  "/pricing/:product/self",
  authMiddleware.isLoggedIn,
  checkoutController.selfCheckoutPage
);
router.post(
  "/pricing/:product/self/minor-payment-consent",
  authMiddleware.isLoggedIn,
  checkoutController.acceptMinorPaymentNotice
);
router.post(
  "/pricing/:product/self",
  authMiddleware.isLoggedIn,
  checkoutController.prepareSelfCheckout
);
router.get(
  "/pricing/:product/parent-request",
  authMiddleware.isLoggedIn,
  checkoutController.parentRequestPage
);
router.post(
  "/pricing/:product/parent-request",
  authMiddleware.isLoggedIn,
  checkoutController.sendParentRequest
);
router.post(
  "/api/session/heartbeat",
  authMiddleware.isLoggedIn,
  matthsController.connectionHeartbeat
);
router.get(
  "/account/private-mock-restriction",
  authMiddleware.isLoggedIn,
  matthsController.privateMockRestrictionPage
);
router.get(
  "/private-mock-exams",
  authMiddleware.isLoggedIn,
  matthsController.privateMockExamsPage
);
router.get(
  "/private-mock-exams/resources/formula/file",
  authMiddleware.isLoggedIn,
  matthsController.privateMockFormulaFile
);
router.get(
  "/private-mock-exams/:examId",
  authMiddleware.isLoggedIn,
  matthsController.privateMockExamPage
);
router.get(
  "/private-mock-exams/:examId/file",
  authMiddleware.isLoggedIn,
  matthsController.privateMockExamFile
);
router.post(
  "/api/private-mock-exams/:examId/start",
  authMiddleware.isLoggedIn,
  matthsController.startPrivateMockExam
);
router.post(
  "/api/private-mock-exams/:examId/draft",
  authMiddleware.isLoggedIn,
  matthsController.savePrivateMockExamDraft
);
router.post(
  "/api/private-mock-exams/:examId/submit",
  authMiddleware.isLoggedIn,
  matthsController.submitPrivateMockExam
);
router.post(
  "/api/private-mock-exams/weeks/:weekKey/selection",
  authMiddleware.isLoggedIn,
  matthsController.selectPrivateMockResult
);
router.get(
  "/integrity/cases/:caseId",
  authMiddleware.isLoggedIn,
  matthsController.privateMockIntegrityCasePage
);
router.post(
  "/integrity/cases/:caseId/evidence",
  authMiddleware.isLoggedIn,
  (req, res, next) => {
    userIntegrityEvidenceUpload.array(
      "evidenceFiles",
      10
    )(req, res, (error) => {
      if (error) {
        error.status =
          error.status || 400;
        return next(error);
      }
      return next();
    });
  },
  validateIntegrityEvidenceContent,
  matthsController.submitPrivateMockIntegrityEvidence
);
router.get(
  "/nickname-change",
  authMiddleware.isLoggedIn,
  matthsController.nicknameChangePage
);
router.post(
  "/nickname-change/check",
  authMiddleware.isLoggedIn,
  matthsController.checkNicknameChange
);
router.post(
  "/nickname-change",
  authMiddleware.isLoggedIn,
  matthsController.completeNicknameChange
);

router.post(
  '/profile/nickname',
  authMiddleware.isLoggedIn,
  matthsController.changeNickname
);

router.post(
  "/profile/avatar",
  authMiddleware.isLoggedIn,
  handleProfileAvatarUpload,
  matthsController.changeProfileAvatar
);

router.post(
  "/profile/coach-mode",
  authMiddleware.isLoggedIn,
  matthsController.changeProfileCoachMode
);

router.post(
  "/profile/tutorial/restart",
  authMiddleware.isLoggedIn,
  matthsController.restartDashboardTutorial
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

router.post(
  "/profile/withdraw",
  authMiddleware.isLoggedIn,
  matthsController.withdrawOwnAccount
);

router.get('/login', authMiddleware.isLoggedOut, matthsController.loginPage);

router.post(
  '/login',
  authMiddleware.isLoggedOut,
  loginIpRateLimit,
  loginRateLimit,
  matthsController.login
);

// iPad ASWebAuthenticationSession의 공개 PKCE 진입점. API Bearer 경계와
// 분리해 로그인 전에도 Google 왕복을 시작할 수 있게 한다.
router.get(
  "/auth/google/app",
  matthsController.socialOAuthAppStart
);

// 앱 API가 발급한 서명 ticket으로만 여는 탈퇴 전용 Google 본인 확인.
// Bearer 토큰은 브라우저 주소나 쿠키로 넘기지 않는다.
router.get(
  "/auth/google/reauth",
  (req, res) => {
    req.params.provider = "google";
    return matthsController.socialWithdrawalReauthenticationStart(req, res);
  }
);

router.get(
  "/auth/google",
  authMiddleware.isLoggedOut,
  (req, res, next) => {
    req.params.provider = "google";
    return matthsController.socialOAuthStart(req, res, next);
  }
);
router.get(
  "/auth/google/callback",
  authMiddleware
    .isSocialOAuthCallbackAllowed,
  (req, res) => {
    req.params.provider = "google";
    return matthsController.socialOAuthCallback(req, res);
  }
);

// 카카오 앱도 Google과 같은 PKCE 왕복을 사용하되 결과는
// matths://oauth/kakao 로 돌려보낸다. 앱 경로에는 웹 세션 가드를 걸지 않는다.
router.get(
  "/auth/kakao/app",
  (req, res, next) => {
    req.params.provider = "kakao";
    return matthsController.socialOAuthAppStart(req, res, next);
  }
);

router.get(
  "/auth/kakao/reauth",
  (req, res) => {
    req.params.provider = "kakao";
    return matthsController.socialWithdrawalReauthenticationStart(req, res);
  }
);

router.get(
  "/auth/kakao",
  authMiddleware.isLoggedOut,
  (req, res, next) => {
    req.params.provider = "kakao";
    return matthsController.socialOAuthStart(req, res, next);
  }
);
router.get(
  "/auth/kakao/callback",
  authMiddleware.isSocialOAuthCallbackAllowed,
  (req, res) => {
    req.params.provider = "kakao";
    return matthsController.socialOAuthCallback(req, res);
  }
);

// Apple 웹 로그인은 scope(name/email)를 요청하므로 Apple이 form_post 로 콜백한다.
// SameSite=Lax 세션 쿠키에 의존하지 않고 서명된 state + nonce를 컨트롤러에서 검증한다.
router.get(
  "/auth/apple",
  authMiddleware.isLoggedOut,
  appleWebOAuthStartIpRateLimit,
  matthsController.appleWebOAuthStart
);
router.post(
  "/auth/apple/callback",
  appleWebOAuthCallbackIpRateLimit,
  matthsController.appleWebOAuthCallback
);

router.get('/register', matthsController.registerPage);

router.post(
  '/register',
  registrationIpRateLimit,
  registrationRateLimit,
  matthsController.register
);

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
