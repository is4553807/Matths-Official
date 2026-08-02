const {
  User,
  ConceptProgress,
  ConceptLesson,
} = require("../models/matthsModel");
const {getSchoolSelectData,findSchool,} = require('../services/schoolService');
const {getDashboardData, toggleDailyPlanTask, updateCoachMode,} = require('../services/dashboardService');
const {
  createPrivateMockExamBatch,
  createPrivateMockFormulaResource,
  createPrivateMockObjection,
  correctPrivateMockAnswers,
  deletePrivateMockExam,
  deletePrivateMockFormulaResource,
  getAdminPrivateMockIntegrityEvidenceFile,
  getAdminPrivateMockPdfFile,
  getAdminPrivateMockExamData,
  getAdminPrivateMockExamDetailData,
  getAdminPrivateMockObjection,
  getPrivateMockAttemptData,
  getPrivateMockExamFile,
  getPrivateMockExamPageData,
  getPrivateMockEligibility,
  getPrivateMockRestrictionData,
  getPrivateMockObjectionFormData,
  getPrivateMockFormulaFile,
  getUserIntegrityCase,
  requestPrivateMockIntegrityEvidenceByAdmin,
  acceptPrivateMockObjection,
  rejectPrivateMockObjection,
  reviewPrivateMockIntegrityCase,
  savePrivateMockDraft,
  selectPrivateMockWeeklyAttempt,
  startPrivateMockAttempt,
  submitPrivateMockIntegrityEvidence,
  submitPrivateMockAttempt,
} = require("../services/privateMockExamService");
const {loadCurriculum, buildLearningViewModel, findUnitView,} = require("../services/curriculumService");
const {getUserLearningData, updateTopicCompletion,} = require('../services/learningProgressService');
const {
  getWrongNoteData,
  getWrongNoteReviewData,
} = require("../services/wrongNoteService");
const {
  createNextProblem,
  submitProblem,
  changeCompletion,
  getReviewContext,
} = require("../services/practiceService");
const {
  formatAlgebraLesson,
  formatAlgebraMathText,
  formatAdminMath,
} = require("../services/mathTextService");
const {
  getConceptTypeGuides,
} = require("../services/conceptGuideService");
const {
  getAcademicYear,
  lifecycleSessionView,
  recordStudyActivity,
  synchronizeUserLifecycle,
} = require("../services/userLifecycleService");
const {
  synchronizeDormantArenaReturn,
} = require("../services/arenaDormancyService");
const {
  DIFFICULTY_LABELS,
  createAssessmentAttempt,
  expireAssessmentAttempt,
  getAssessmentAttempt,
  getAssessmentCenterData,
  saveAssessmentDraft,
  submitAssessmentAttempt,
} = require("../services/assessmentService");
const {
  getPlacementDashboardData,
  createPlacementAttempt,
  getPlacementAttempt,
  savePlacementDraft,
  expirePlacementAttempt,
  submitPlacementAttempt,
} = require("../services/placementExamService");
const {
  createQuickPracticeAttempt,
  expireQuickPracticeAttempt,
  getQuickPracticeCatalogSummary,
  getQuickPracticeStats,
  submitQuickPracticeAttempt,
} = require("../services/quickPracticeService");
const {
  createSuggestion,
  getAdminSuggestionData,
  getSuggestionBoardData,
  moderateSuggestion,
} = require("../services/coachSuggestionService");
const {
  requestPasswordReset,
  resetPassword,
  verifyPasswordResetCode,
  verifyPasswordResetLink,
} = require("../services/passwordResetService");
const {
  getRankingDisplayName,
  normalizeRankingDisplayMode,
  validateRealName,
} = require("../services/userIdentityService");
const {
  createSupportInquiry,
  getContactPageData,
} = require("../services/supportInquiryService");
const {
  createArchiveFolder,
  createArchiveItems,
  deleteArchiveFolder,
  deleteArchiveItem,
  deleteArchiveItems,
  discardArchiveUpload,
  getArchiveData,
  getArchiveDownload,
  moveArchiveItems,
  purgeArchiveItem,
  restoreArchiveItem,
  setArchiveFolderPinned,
  updateArchiveFolder,
} = require("../services/archiveService");
const {
  getRankingData,
} = require("../services/rankingService");
const {
  getPaidPackageAccess,
} = require("../services/paidFeatureAccessService");
const {
  updateAdminPackageAccess,
} = require("../services/adminPackageAccessService");
const {
  getAdminArenaEvidenceData,
  getAdminEvidenceFile,
} = require("../services/arenaMatchEvidenceService");
const {
  createAnnouncement,
  createDirectNotification,
  getAdminAssessmentDetail,
  getAdminDashboardData,
  getAdminRevenueMetrics,
  getAdminInquiryData,
  getAdminUserActivityData,
  getAdminUserDetail,
  getAdminUsersData,
  markNotificationRead,
  replyToInquiry,
  sendDirectUserEmail,
  sendUserPasswordReset,
  setUserActive,
  toggleAnnouncement,
  updateUserAccountStatus,
  updateInquiryStatus,
  updateUserNickname,
  updateUserRole,
  updateUserWarningCount,
} = require("../services/adminService");
const {
  dismissDashboardAnnouncement,
  dismissDashboardNotification,
  getNotificationDetail,
  getNotificationInbox,
  markAllNotificationsRead,
} = require("../services/notificationService");
const {
  accountBlockedMessage,
  synchronizeAccountAccess,
} = require("../services/accountAccessService");
const {
  withdrawOwnAccount,
} = require("../services/accountDeletionService");
const {
  checkNicknameAvailability,
  completeNicknameChange,
  getNicknameChangePageData,
  nicknameKey,
  validateNickname,
} = require("../services/nicknameService");
const {
  createCommunityNotice,
  createCommunityComment,
  createCommunityPost,
  getAdminCommunityData,
  getCommunityAnnouncement,
  getCommunityAttachment,
  getCommunityBoardData,
  getCommunityBoardRules,
  getCommunityNotice,
  getCommunityPost,
  getCommunityPostingAccess,
  moderateCommunityComment,
  moderateCommunityNotice,
  moderateCommunityPost,
  setCommunityPostPinned,
  setCommunityNoticePinned,
  updateCommunityNotice,
  updateCommunityPostByAdmin,
  warnCommunityComment,
  warnCommunityPost,
  voteCommunityPost,
  reportCommunityPost,
  reviewCommunityReport,
} = require("../services/communityService");
const {
  discardCommunityUploads,
} = require("../services/communityAttachmentService");
const {
  completeAdminTodo,
  getAdminTodoData,
  reopenAdminTodo,
} = require("../services/adminTodoService");
const {
  activateArenaPolicyVersion,
  activateMainDivisionPolicyVersion,
  createArenaPolicyVersion,
  createMainDivisionPolicyVersion,
  getActiveArenaPolicy,
  getArenaPolicyAdminData,
  retireArenaPolicyVersion,
  retireMainDivisionPolicyVersion,
  updateLearningPackagePrice,
} = require("../services/arenaPolicyService");
const {
  alertPotentialDuplicateIdentity,
  buildIdentityMatchHash,
  normalizeBirthDate,
} = require("../services/identityRiskService");
const {
  getActiveMockExamPackagePolicy,
  getMockExamPackageAdminData,
  updateMockExamPackagePrice,
} = require("../services/mockExamPackageService");
const {
  recordConnectionHeartbeat,
} = require("../services/connectionUsageService");
const {
  getAdminArenaIntegrityData,
  recordConnectionIntegritySignals,
  reviewArenaIntegrityCase,
} = require("../services/arenaIntegrityRiskService");
const {
  getMainShopPolicyAdminData,
  updateMainShopPolicy,
} = require("../services/arenaShopPolicyService");
const {
  getAdminProblemBankCatalog,
} = require("../services/problemBankCatalogService");
const {
  getArenaReconciliationAudit,
} = require("../services/arenaReconciliationService");
const {
  exportFinalRankingCsv,
  getRankingOperationsDashboard,
  rebuildFinalRankingByAdmin,
  runRankingMaintenanceTask,
} = require("../services/rankingOperationsService");
const {
  getDataAnalysisDashboard,
  getKstMonthKey,
  runMonthlyDataAnalysisAggregation,
} = require("../services/dataAnalysisAggregationService");
const bcrypt = require('bcrypt');
const BCRYPT_ROUNDS = 12;

exports.mainPage = (req,res) => {
    res.render('index', {
      user:
        req.session?.user ||
        null,
    });
}

exports.introPage = (req,res) => {
    res.render('intro', {
      user:
        req.session?.user ||
        null,
    });
}

exports.pricingPage = async (req, res, next) => {
  try {
    const [mockExamPolicy, learningPackagePolicy] = await Promise.all([
      getActiveMockExamPackagePolicy(),
      getActiveArenaPolicy(),
    ]);
    return res.render("pricing", {
      user: req.session?.user || null,
      activePage: "pricing",
      mockExamPolicy,
      learningPackagePolicy,
    });
  } catch (error) {
    return next(error);
  }
};

function paymentRoutePlaceholder(mode) {
  return (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const error = new Error(
      mode === "PARENT_REQUEST"
        ? "부모님 결제 요청 라우트가 준비되었습니다. 결제 요청 화면은 다음 구현 단계에서 연결합니다."
        : "본인 결제 라우트가 준비되었습니다. 결제 화면은 다음 구현 단계에서 연결합니다."
    );
    error.status = 501;
    error.code = "PAYMENT_FLOW_NOT_IMPLEMENTED";
    return next(error);
  };
}

exports.mockExamSelfPaymentEntry =
  paymentRoutePlaceholder("SELF");
exports.mockExamParentPaymentEntry =
  paymentRoutePlaceholder("PARENT_REQUEST");
exports.learningPackageSelfPaymentEntry =
  paymentRoutePlaceholder("SELF");
exports.learningPackageParentPaymentEntry =
  paymentRoutePlaceholder("PARENT_REQUEST");

exports.connectionHeartbeat = async (req, res, next) => {
  try {
    const [usage] = await Promise.all([
      recordConnectionHeartbeat({
        userId: req.session.user.id,
      }),
      recordConnectionIntegritySignals({
        userId: req.session.user.id,
        deviceToken: req.body?.deviceToken,
        ip: req.ip,
        userAgent: req.get("user-agent"),
        acceptLanguage: req.get("accept-language"),
      }).catch((error) => {
        console.error("접속 무결성 연관 신호 기록 실패:", error);
        return null;
      }),
    ]);
    return res.json({
      ok: true,
      ...usage,
    });
  } catch (error) {
    return next(error);
  }
};

exports.loginPage = (req,res) => {
    const blockedStatus =
      String(
        req.query.account || ""
      );
    res.render('login', {
      success:
        req.query.reset === "1"
          ? "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요."
          : req.query.withdrawn ===
              "1"
            ? "계정 탈퇴가 완료되었습니다. 개인정보는 제거되었고 학습 데이터는 익명으로 보존됩니다."
          : null,
      error:
        blockedStatus
          ? accountBlockedMessage(
              blockedStatus
            )
          : null,
      oldInput: {
        identifier: "",
      },
    });
}

exports.registerPage = (
  req,
  res,
  next
) => {
  try {
    const schoolRegions =
      getSchoolSelectData();

    return res.render("register", {
      schoolRegions,
      error: null,
      oldInput: {
        realName: "",
        birthDate: "",
        name: "",
        email: "",
        schoolGrade: 10,
        schoolRegion: "",
        schoolCode: "",
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.visualLearningPage = (req,res) => {
    res.render('visual-learning', {
      user:
        req.session?.user ||
        null,
    });
}

exports.learningFlowPage = (req,res) => {
    res.render('learning-flow', {
      user:
        req.session?.user ||
        null,
    });
}

exports.faqPage = (req,res) => {
    res.render('faq', {
      user:
        req.session?.user ||
        null,
    });
}

async function renderContactPage(
  req,
  res,
  {
    status = 200,
    feedback = null,
    oldInput = {},
  } = {}
) {
  const contactData =
    await getContactPageData(
      req.session.user.id
    );

  return res
    .status(status)
    .render("contact", {
      user: req.session.user,
      contactData,
      feedback,
      oldInput: {
        subject:
          String(
            oldInput.subject || ""
          ),
        content:
          String(
            oldInput.content || ""
          ),
      },
    });
}

exports.contactPage = async (
  req,
  res,
  next
) => {
  try {
    const feedback =
      req.session.contactFeedback ||
      null;

    if (
      req.session.contactFeedback
    ) {
      delete req.session
        .contactFeedback;
      await saveSession(req);
    }

    return await renderContactPage(
      req,
      res,
      {
        feedback,
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.submitContactInquiry =
  async (req, res, next) => {
    try {
      const result =
        await createSupportInquiry({
          userId:
            req.session.user.id,
          subject:
            req.body.subject,
          content:
            req.body.content,
        });

      req.session.contactFeedback = {
        type:
          result.emailStatus ===
          "failed"
            ? "warning"
            : "success",
        message:
          result.emailStatus ===
          "failed"
            ? "문의는 정상적으로 저장되었습니다. 관리자 이메일 알림 전송 상태를 확인하고 있습니다."
            : "문의가 접수되었습니다. 답변은 회원가입한 이메일로 전달됩니다.",
      };
      await saveSession(req);

      return res.redirect(
        "/contact"
      );
    } catch (error) {
      if (error.status) {
        return await renderContactPage(
          req,
          res,
          {
            status: error.status,
            feedback: {
              type: "error",
              message: error.message,
            },
            oldInput: {
              subject:
                req.body.subject,
              content:
                req.body.content,
            },
          }
        );
      }

      return next(error);
    }
  };

async function renderArchive(
  req,
  res,
  {
    status = 200,
    adminMode = false,
    feedback = null,
    oldInput = {},
  } = {}
) {
  const archiveData =
    await getArchiveData(
      req.session.user,
      {
        includeUnpublished:
          adminMode,
        folderId:
          req.query.folder,
      }
    );

  return res
    .status(status)
    .render(
      adminMode
        ? "admin-archive"
        : "archive-public",
      {
      user: req.session.user,
      archiveData,
      adminMode,
      feedback,
      oldInput: {
        title:
          String(
            oldInput.title || ""
          ),
        description:
          String(
            oldInput.description ||
              ""
          ),
        category:
          String(
            oldInput.category ||
              "문제지"
          ),
        folderId:
          String(
            oldInput.folderId ||
              req.query.folder ||
              ""
          ),
        folderName:
          String(
            oldInput.folderName ||
              ""
          ),
        folderDescription:
          String(
            oldInput.folderDescription ||
              ""
          ),
        folderAccessLevel:
          String(oldInput.folderAccessLevel || "AUTHENTICATED"),
        editFolderName:
          String(
            oldInput
              .editFolderName ??
              archiveData
                .selectedFolder
                ?.name ??
              ""
          ),
        editFolderDescription:
          String(
            oldInput
              .editFolderDescription ??
              archiveData
                .selectedFolder
                ?.description ??
              ""
          ),
        editFolderAccessLevel:
          String(
            oldInput.editFolderAccessLevel ??
              archiveData.selectedFolder?.accessLevel ??
              "AUTHENTICATED"
          ),
        parentFolderId:
          String(
            oldInput.parentFolderId ||
              req.query.folder ||
              ""
          ),
        notifyUsers:
          [
            "true",
            "1",
            "on",
          ].includes(
            String(
              oldInput.notifyUsers ||
                ""
            )
          ),
      },
      }
    );
}

exports.archivePage = async (
  req,
  res,
  next
) => {
  try {
    return await renderArchive(
      req,
      res,
      {
          feedback:
            Number(
              req.query.uploaded
            ) > 0
            ? {
                type: "success",
                message:
                  `아카이브에 자료 ${Number(req.query.uploaded)}개를 추가했습니다.`,
              }
            : null,
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.archiveAdminPage =
  async (req, res, next) => {
    try {
      return await renderArchive(
        req,
        res,
        {
          adminMode: true,
          feedback:
            req.query.folderCreated ===
            "1"
              ? {
                  type:
                    "success",
                  message:
                    "아카이브 폴더를 추가했습니다.",
                }
              : req.query
                  .folderUpdated ===
                "1"
              ? {
                  type:
                    "success",
                  message:
                    "폴더 이름과 설명을 수정했습니다.",
                }
              : req.query
                  .folderPinned ===
                "1"
              ? {
                  type:
                    "success",
                  message:
                    "폴더를 목록 상단에 고정했습니다.",
                }
              : req.query
                  .folderPinned ===
                "0"
              ? {
                  type:
                    "success",
                  message:
                    "폴더 상단 고정을 해제했습니다.",
                }
              : req.query
                  .folderDeleted ===
                "1"
              ? {
                  type:
                    "success",
                  message:
                    "빈 아카이브 폴더를 삭제했습니다.",
                }
              : Number(
                  req.query.uploaded
                ) > 0
              ? {
                  type:
                    req.query.notifyFailed ===
                    "1"
                      ? "error"
                      : "success",
                  message:
                    req.query.notifyFailed ===
                    "1"
                      ? `아카이브에 자료 ${Number(req.query.uploaded)}개는 추가했지만 회원 공지는 발송하지 못했습니다. 운영 현황에서 공지를 다시 등록해주세요.`
                      : `아카이브에 자료 ${Number(req.query.uploaded)}개를 추가했습니다.${req.query.notified === "1" ? " 회원 공지도 함께 발송했습니다." : ""}`,
                }
              : req.query.deleted ===
                "1"
              ? {
                  type:
                    "success",
                  message:
                    "아카이브 자료를 휴지통으로 이동했습니다. 30일 동안 복구할 수 있습니다.",
                }
              : Number(
                  req.query
                    .bulkDeleted
                ) > 0
              ? {
                  type:
                    "success",
                  message:
                    `선택한 아카이브 자료 ${Number(req.query.bulkDeleted)}개를 휴지통으로 이동했습니다.`,
                }
              : Number(
                  req.query
                    .bulkMoved
                ) > 0
              ? {
                  type:
                    "success",
                  message:
                    `선택한 아카이브 자료 ${Number(req.query.bulkMoved)}개를 이동했습니다.`,
                }
              : req.query.restored === "1"
              ? {
                  type: "success",
                  message: "휴지통 자료를 원래 위치로 복구했습니다.",
                }
              : req.query.purged === "1"
              ? {
                  type: "success",
                  message: "휴지통 자료와 저장 원본을 영구 삭제했습니다.",
                }
              : null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.uploadArchiveItem =
  async (req, res, next) => {
    try {
      const items =
        await createArchiveItems({
          user:
            req.session.user,
          files:
            req.files,
          description:
            req.body.description,
          category:
            req.body.category,
          folderId:
            req.body.folderId,
        });
      const shouldNotify =
        [
          "true",
          "1",
          "on",
        ].includes(
          String(
            req.body
              .notifyUsers ||
              ""
          )
        );

      let notificationFailed =
        false;

      if (shouldNotify) {
        try {
          await createAnnouncement({
            adminUserId:
              req.session.user.id,
            title:
              "아카이브 자료 업데이트",
            content:
              `아카이브에 새 자료 ${items.length}개가 등록되었습니다. 지금 확인해보세요.`,
            publishNow: true,
            href: "/archive",
          });
        } catch (error) {
          notificationFailed =
            true;
          console.error(
            "아카이브 업데이트 공지 발송 실패:",
            error
          );
        }
      }

      return res.redirect(
        `/archive/admin?uploaded=${items.length}${shouldNotify && !notificationFailed ? "&notified=1" : ""}${notificationFailed ? "&notifyFailed=1" : ""}`
      );
    } catch (error) {
      await Promise.all(
        (req.files || []).map(
          (file) =>
            discardArchiveUpload(
              file
            )
        )
      );

      if (error.status) {
        return await renderArchive(
          req,
          res,
          {
            status: error.status,
            adminMode: true,
            feedback: {
              type: "error",
              message:
                error.message,
            },
            oldInput:
              req.body,
          }
        );
      }

      return next(error);
    }
  };

exports.deleteArchiveItem =
  async (req, res, next) => {
    try {
      await deleteArchiveItem({
        itemId:
          req.params.itemId,
        user:
          req.session.user,
      });

      return res.redirect(
        `/archive/admin?deleted=1${req.body.folderId ? `&folder=${encodeURIComponent(req.body.folderId)}` : ""}`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.deleteArchiveItems =
  async (req, res, next) => {
    try {
      const result =
        await deleteArchiveItems({
          itemIds:
            req.body.itemIds,
          user:
            req.session.user,
        });

      return res.redirect(
        `/archive/admin?bulkDeleted=${result.deletedCount}${req.body.folderId ? `&folder=${encodeURIComponent(req.body.folderId)}` : ""}`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.restoreArchiveItem = async (req, res, next) => {
  try {
    await restoreArchiveItem({
      itemId: req.params.itemId,
      user: req.session.user,
    });
    return res.redirect("/archive/admin?restored=1#archive-trash");
  } catch (error) {
    return next(error);
  }
};

exports.purgeArchiveItem = async (req, res, next) => {
  try {
    await purgeArchiveItem({
      itemId: req.params.itemId,
      user: req.session.user,
    });
    return res.redirect("/archive/admin?purged=1#archive-trash");
  } catch (error) {
    return next(error);
  }
};

exports.moveArchiveItems =
  async (req, res, next) => {
    try {
      const result =
        await moveArchiveItems({
          itemIds:
            req.body.itemIds,
          destinationFolderId:
            req.body
              .destinationFolderId,
          user:
            req.session.user,
        });

      return res.redirect(
        `/archive/admin?bulkMoved=${result.movedCount}${req.body.folderId ? `&folder=${encodeURIComponent(req.body.folderId)}` : ""}`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.createArchiveFolder =
  async (req, res, next) => {
    try {
      await createArchiveFolder({
        user:
          req.session.user,
        name:
          req.body.folderName,
        description:
          req.body
            .folderDescription,
        parentFolderId:
          req.body
            .parentFolderId,
        accessLevel:
          req.body.folderAccessLevel,
      });

      return res.redirect(
        `/archive/admin?folderCreated=1${req.body.parentFolderId ? `&folder=${encodeURIComponent(req.body.parentFolderId)}` : ""}`
      );
    } catch (error) {
      if (error.status) {
        return await renderArchive(
          req,
          res,
          {
            status: error.status,
            adminMode: true,
            feedback: {
              type: "error",
              message:
                error.message,
            },
            oldInput:
              req.body,
          }
        );
      }

      return next(error);
    }
  };

exports.updateArchiveFolder =
  async (req, res, next) => {
    try {
      const folder =
        await updateArchiveFolder({
          user:
            req.session.user,
          folderId:
            req.params.folderId,
          name:
            req.body
              .editFolderName,
        description:
          req.body
            .editFolderDescription,
        accessLevel:
          req.body.editFolderAccessLevel,
        });

      return res.redirect(
        `/archive/admin?folderUpdated=1&folder=${encodeURIComponent(folder.id)}`
      );
    } catch (error) {
      if (
        [400, 409].includes(
          error.status
        )
      ) {
        req.query.folder =
          req.params.folderId;
        return await renderArchive(
          req,
          res,
          {
            status: error.status,
            adminMode: true,
            feedback: {
              type: "error",
              message:
                error.message,
            },
            oldInput:
              req.body,
          }
        );
      }

      return next(error);
    }
  };

exports.setArchiveFolderPinned =
  async (req, res, next) => {
    try {
      const folder =
        await setArchiveFolderPinned({
          user:
            req.session.user,
          folderId:
            req.params.folderId,
          pinned:
            req.body.pinned ===
            "true",
        });

      return res.redirect(
        `/archive/admin?folder=${encodeURIComponent(folder.id)}&folderPinned=${folder.isPinned ? "1" : "0"}`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.deleteArchiveFolder =
  async (req, res, next) => {
    try {
      const folder =
        await deleteArchiveFolder({
          user:
            req.session.user,
          folderId:
            req.params.folderId,
        });
      const parentQuery =
        folder.parentFolderId
          ? `&folder=${encodeURIComponent(folder.parentFolderId)}`
          : "";

      return res.redirect(
        `/archive/admin?folderDeleted=1${parentQuery}`
      );
    } catch (error) {
      if (error.status === 409) {
        req.query.folder =
          req.params.folderId;
        return await renderArchive(
          req,
          res,
          {
            status: error.status,
            adminMode: true,
            feedback: {
              type: "error",
              message:
                error.message,
            },
          }
        );
      }

      return next(error);
    }
  };

exports.downloadArchiveItem =
  async (req, res, next) => {
    try {
      const file =
        await getArchiveDownload({
          itemId:
            req.params.itemId,
          user:
            req.session.user,
        });

      if (file.cloudUrl) {
        res.set("Cache-Control", "private, no-store");
        return res.redirect(302, file.cloudUrl);
      }

      return res.download(
        file.path,
        file.name,
        {
          headers: {
            "Content-Type":
              file.mimeType,
          },
        }
      );
    } catch (error) {
      return next(error);
    }
  };

function adminFeedbackFromQuery(
  query
) {
  const messages = {
    announcement:
      "공지를 저장했습니다.",
    announcementStatus:
      "공지 공개 상태를 변경했습니다.",
    inquiryReply:
      "문의 답변을 가입 이메일로 전송했습니다.",
    inquiryStatus:
      "문의 상태를 변경했습니다.",
    nickname:
      "사용자에게 닉네임 변경 사유와 본인 확인 링크를 보냈습니다.",
    notification:
      "사용자에게 사이트 알림을 보냈습니다.",
    email:
      "사용자 이메일로 메시지를 전송했습니다.",
    passwordReset:
      "비밀번호 재설정 이메일 발송을 요청했습니다.",
    account:
      "사용자 계정 상태를 변경했습니다.",
    accountStatus:
      "사용자 계정 상태를 변경했습니다.",
    role:
      "사용자 역할을 변경했습니다.",
    warningCount:
      "사용자 경고 횟수를 변경했습니다.",
    packageAccess:
      "사용자의 패키지 권한을 변경했습니다.",
    communityEdit:
      "게시글을 수정했습니다.",
    communityModeration:
      "게시글 공개 상태를 변경했습니다.",
    communityPinned:
      "게시글을 목록 상단에 고정했습니다.",
    communityUnpinned:
      "게시글 상단 고정을 해제했습니다.",
    communityWarning:
      "게시글을 숨기고 작성자에게 경고를 부여했습니다.",
    communitySuspended:
      "게시글을 숨기고 작성자에게 세 번째 경고를 부여해 계정을 정지했습니다.",
    communityCommentModeration:
      "댓글 공개 상태를 변경했습니다.",
    communityCommentWarning:
      "댓글을 숨기고 작성자에게 경고를 부여했습니다.",
    communityCommentSuspended:
      "댓글을 숨기고 작성자에게 세 번째 경고를 부여해 계정을 정지했습니다.",
    communityReport:
      "게시글 신고 처리 상태를 저장했습니다.",
    communityNoticeCreated:
      "게시판 공지를 추가하고 상단에 고정했습니다.",
    communityNoticeUpdated:
      "게시판 공지를 수정했습니다.",
    communityNoticePinned:
      "게시판 공지를 상단에 고정했습니다.",
    communityNoticeUnpinned:
      "게시판 공지 고정을 해제했습니다.",
    communityNoticeModerated:
      "게시판 공지 공개 상태를 변경했습니다.",
  };

  return messages[
    String(query.done || "")
  ] || null;
}

exports.adminDashboardPage =
  async (req, res, next) => {
    try {
      return res.render(
        "admin-dashboard",
        {
          user:
            req.session.user,
          adminData:
            await getAdminDashboardData(),
          feedback:
            adminFeedbackFromQuery(
              req.query
            ),
          error: null,
          oldInput: null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminRevenueMetrics = async (_req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.json({
      ok: true,
      revenue: await getAdminRevenueMetrics(),
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminArenaMatchesPage = async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    const [evidenceEntries, integrityReview] = await Promise.all([
      getAdminArenaEvidenceData(),
      getAdminArenaIntegrityData(),
    ]);
    return res.render("admin-arena-matches", {
      user: req.session.user,
      evidenceEntries,
      integrityReview,
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminReviewArenaIntegrityCase = async (req, res, next) => {
  try {
    await reviewArenaIntegrityCase({
      caseId: req.params.caseId,
      adminUserId: req.session.user.id,
      decision: String(req.body.decision || "").trim().toUpperCase(),
      note: req.body.note,
    });
    return res.redirect("/admin/arena-matches#integrity-review");
  } catch (error) {
    return next(error);
  }
};

exports.adminArenaEvidenceFile = async (req, res, next) => {
  try {
    const file = await getAdminEvidenceFile({
      evidenceId: req.params.evidenceId,
      storedName: req.params.storedName,
    });
    res.set("Cache-Control", "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");
    res.type(file.mimeType);
    if (file.cloudUrl) {
      return res.redirect(302, file.cloudUrl);
    }
    return res.sendFile(file.absolutePath);
  } catch (error) {
    return next(error);
  }
};

exports.adminArenaAuditPage = async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    const [audit, rankingOperations] = await Promise.all([
      getArenaReconciliationAudit(),
      getRankingOperationsDashboard({ preview: req.query.preview === "1" }),
    ]);
    return res.render("admin-arena-audit", {
      user: req.session.user,
      audit,
      rankingOperations,
      operationFeedback:
        req.query.rebuilt === "1"
          ? "최종 종합 랭킹을 다시 계산하고 작업 이력을 남겼습니다."
          : req.query.task
            ? `${String(req.query.task)} 운영 작업을 실행했습니다.`
            : null,
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminRebuildFinalRanking = async (req, res, next) => {
  try {
    await rebuildFinalRankingByAdmin({ adminUserId: req.session.user.id });
    return res.redirect("/admin/arena-audit?rebuilt=1#ranking-operations");
  } catch (error) {
    return next(error);
  }
};

exports.adminRunRankingMaintenance = async (req, res, next) => {
  try {
    const task = String(req.body.task || "").trim().toUpperCase();
    await runRankingMaintenanceTask({
      adminUserId: req.session.user.id,
      task,
    });
    return res.redirect(
      `/admin/arena-audit?task=${encodeURIComponent(task)}#operations-status`
    );
  } catch (error) {
    return next(error);
  }
};

exports.adminExportFinalRanking = async (req, res, next) => {
  try {
    const csv = await exportFinalRankingCsv({ adminUserId: req.session.user.id });
    res.set("Cache-Control", "private, no-store");
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set(
      "Content-Disposition",
      `attachment; filename="matths-final-ranking-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return res.send(csv);
  } catch (error) {
    return next(error);
  }
};

exports.adminArenaAuditData = async (_req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.json({
      ok: true,
      audit: await getArenaReconciliationAudit(),
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminDataAnalysisPage = async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.render("admin-data-analysis", {
      user: req.session.user,
      analysis: await getDataAnalysisDashboard({
        periodKey: req.query.period || getKstMonthKey(),
      }),
      feedback:
        String(req.query.rebuilt || "") === "1"
          ? "선택한 월의 운영 지표를 권위 원장에서 다시 집계했습니다."
          : null,
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminRebuildDataAnalysis = async (req, res, next) => {
  try {
    const periodKey = String(req.body.periodKey || getKstMonthKey());
    await runMonthlyDataAnalysisAggregation({ periodKey });
    return res.redirect(
      `/admin/data-analysis?period=${encodeURIComponent(periodKey)}&rebuilt=1`
    );
  } catch (error) {
    return next(error);
  }
};

function arenaPolicyFeedbackFromQuery(query = {}) {
  if (String(query.learningPriceUpdated || "") === "1") {
    return "29일 학습 패키지의 새 가격 정책을 적용했습니다.";
  }
  if (String(query.mockPriceUpdated || "") === "1") {
    return "모의고사 전용 패키지의 새 월 가격 정책을 적용했습니다.";
  }
  if (String(query.created || "") === "1") {
    return "새 Arena 정책을 작성 중 상태로 저장했습니다.";
  }
  if (String(query.activated || "") === "1") {
    return "Arena 정책을 적용 일정에 등록했습니다.";
  }
  if (String(query.retired || "") === "1") {
    return "작성 중이거나 적용 예정이던 Arena 정책을 종료했습니다.";
  }
  if (String(query.mainCreated || "") === "1") {
    return "새 Main Division 정책을 작성 중 상태로 저장했습니다.";
  }
  if (String(query.mainActivated || "") === "1") {
    return "Main Division 정책을 적용 일정에 등록했습니다.";
  }
  if (String(query.mainRetired || "") === "1") {
    return "Main Division 정책을 종료했습니다.";
  }
  if (String(query.mainShopUpdated || "") === "1") {
    return "Main Division 상점의 새 가격·판매 정책을 실제 운영 정책으로 적용했습니다.";
  }
  return null;
}

async function renderArenaPolicyAdminPage(
  req,
  res,
  {
    status = 200,
    error = null,
    oldInput = null,
  } = {}
) {
  return res.status(status).render("admin-arena-policies", {
    user: req.session.user,
    policyData: {
      ...(await getArenaPolicyAdminData()),
      mockExamOnly: await getMockExamPackageAdminData(),
      mainShop: await getMainShopPolicyAdminData(),
    },
    feedback: arenaPolicyFeedbackFromQuery(req.query),
    error,
    oldInput,
  });
}

exports.adminArenaPoliciesPage =
  async (req, res, next) => {
    try {
      return await renderArenaPolicyAdminPage(req, res);
    } catch (error) {
      return next(error);
    }
  };

exports.adminUpdateMockExamPackagePrice = async (
  req,
  res,
  next
) => {
  try {
    await updateMockExamPackagePrice({
      adminUserId: req.session.user.id,
      monthlyPriceAmount: req.body.monthlyPriceAmount,
      changeSummary: req.body.changeSummary,
    });
    return res.redirect(
      "/admin/arena-policies?mockPriceUpdated=1#mock-exam-package"
    );
  } catch (error) {
    if ([400, 409].includes(Number(error.status))) {
      try {
        return await renderArenaPolicyAdminPage(req, res, {
          status: Number(error.status),
          error: error.message,
          oldInput: {
            policyDivision: "MOCK_EXAM_ONLY",
            ...req.body,
          },
        });
      } catch (renderError) {
        return next(renderError);
      }
    }
    return next(error);
  }
};

exports.adminUpdateLearningPackagePrice = async (
  req,
  res,
  next
) => {
  try {
    await updateLearningPackagePrice({
      adminUserId: req.session.user.id,
      priceAmount: req.body.priceAmount,
      changeSummary: req.body.changeSummary,
    });
    return res.redirect(
      "/admin/arena-policies?learningPriceUpdated=1#learning-package"
    );
  } catch (error) {
    if ([400, 409].includes(Number(error.status))) {
      try {
        return await renderArenaPolicyAdminPage(req, res, {
          status: Number(error.status),
          error: error.message,
          oldInput: {
            policyDivision: "LEARNING_PACKAGE",
            ...req.body,
          },
        });
      } catch (renderError) {
        return next(renderError);
      }
    }
    return next(error);
  }
};

exports.adminUpdateMainShopPolicy = async (req, res, next) => {
  try {
    const enabledItems = Array.isArray(req.body.enabledItems)
      ? req.body.enabledItems
      : req.body.enabledItems
        ? [req.body.enabledItems]
        : [];
    const itemPrices = Object.fromEntries(
      Object.entries(req.body)
        .filter(([key]) => key.startsWith("price_"))
        .map(([key, value]) => [key.slice("price_".length), value])
    );
    await updateMainShopPolicy({
      adminUserId: req.session.user.id,
      itemPrices,
      enabledItems,
      changeSummary: req.body.changeSummary,
    });
    return res.redirect("/admin/arena-policies?mainShopUpdated=1#main-shop-policy");
  } catch (error) {
    if ([400, 409].includes(Number(error.status))) {
      try {
        return await renderArenaPolicyAdminPage(req, res, {
          status: Number(error.status),
          error: error.message,
          oldInput: { policyDivision: "MAIN_SHOP", ...req.body },
        });
      } catch (renderError) {
        return next(renderError);
      }
    }
    return next(error);
  }
};

exports.adminProblemBanksPage = (req, res) =>
  res.render("admin-problem-banks", {
    user: req.session.user,
    catalog: getAdminProblemBankCatalog(),
  });

exports.adminCreateArenaPolicy =
  async (req, res, next) => {
    try {
      await createArenaPolicyVersion({
        adminUserId: req.session.user.id,
        input: req.body,
      });
      return res.redirect("/admin/arena-policies?created=1");
    } catch (error) {
      if ([400, 409].includes(Number(error.status))) {
        try {
          return await renderArenaPolicyAdminPage(req, res, {
            status: Number(error.status),
            error: error.message,
            oldInput: req.body,
          });
        } catch (renderError) {
          return next(renderError);
        }
      }
      return next(error);
    }
  };

exports.adminCreateMainArenaPolicy =
  async (req, res, next) => {
    try {
      await createMainDivisionPolicyVersion({
        adminUserId: req.session.user.id,
        input: req.body,
      });
      return res.redirect(
        "/admin/arena-policies?mainCreated=1#main-policy"
      );
    } catch (error) {
      if ([400, 409].includes(Number(error.status))) {
        try {
          return await renderArenaPolicyAdminPage(req, res, {
            status: Number(error.status),
            error: error.message,
            oldInput: {
              policyDivision: "MAIN",
              ...req.body,
            },
          });
        } catch (renderError) {
          return next(renderError);
        }
      }
      return next(error);
    }
  };

exports.adminActivateArenaPolicy =
  async (req, res, next) => {
    try {
      await activateArenaPolicyVersion({
        adminUserId: req.session.user.id,
        policyId: req.params.policyId,
      });
      return res.redirect("/admin/arena-policies?activated=1");
    } catch (error) {
      if ([400, 404, 409].includes(Number(error.status))) {
        try {
          return await renderArenaPolicyAdminPage(req, res, {
            status: Number(error.status),
            error: error.message,
          });
        } catch (renderError) {
          return next(renderError);
        }
      }
      return next(error);
    }
  };

exports.adminActivateMainArenaPolicy =
  async (req, res, next) => {
    try {
      await activateMainDivisionPolicyVersion({
        adminUserId: req.session.user.id,
        policyId: req.params.policyId,
      });
      return res.redirect(
        "/admin/arena-policies?mainActivated=1#main-policy"
      );
    } catch (error) {
      if ([400, 404, 409].includes(Number(error.status))) {
        try {
          return await renderArenaPolicyAdminPage(req, res, {
            status: Number(error.status),
            error: error.message,
          });
        } catch (renderError) {
          return next(renderError);
        }
      }
      return next(error);
    }
  };

exports.adminRetireArenaPolicy =
  async (req, res, next) => {
    try {
      await retireArenaPolicyVersion({
        adminUserId: req.session.user.id,
        policyId: req.params.policyId,
      });
      return res.redirect("/admin/arena-policies?retired=1");
    } catch (error) {
      if ([400, 404, 409].includes(Number(error.status))) {
        try {
          return await renderArenaPolicyAdminPage(req, res, {
            status: Number(error.status),
            error: error.message,
          });
        } catch (renderError) {
          return next(renderError);
        }
      }
      return next(error);
    }
  };

exports.adminRetireMainArenaPolicy =
  async (req, res, next) => {
    try {
      await retireMainDivisionPolicyVersion({
        adminUserId: req.session.user.id,
        policyId: req.params.policyId,
      });
      return res.redirect(
        "/admin/arena-policies?mainRetired=1#main-policy"
      );
    } catch (error) {
      if ([400, 404, 409].includes(Number(error.status))) {
        try {
          return await renderArenaPolicyAdminPage(req, res, {
            status: Number(error.status),
            error: error.message,
          });
        } catch (renderError) {
          return next(renderError);
        }
      }
      return next(error);
    }
  };

exports.adminCreateAnnouncement =
  async (req, res, next) => {
    try {
      await createAnnouncement({
        adminUserId:
          req.session.user.id,
        title: req.body.title,
        content:
          req.body.content,
        publishNow:
          req.body.publishNow,
        dashboardEndDate:
          req.body.dashboardEndDate,
        boardCategory:
          req.body.boardCategory,
      });

      return res.redirect(
        "/admin?done=announcement"
      );
    } catch (error) {
      if (
        Number(error.status) === 400
      ) {
        try {
          return res
            .status(400)
            .render(
              "admin-dashboard",
              {
                user:
                  req.session.user,
                adminData:
                  await getAdminDashboardData(),
                feedback: null,
                error:
                  error.message,
                oldInput:
                  req.body,
              }
            );
        } catch (renderError) {
          return next(renderError);
        }
      }

      return next(error);
    }
  };

exports.adminToggleAnnouncement =
  async (req, res, next) => {
    try {
      await toggleAnnouncement({
        adminUserId:
          req.session.user.id,
        announcementId:
          req.params
            .announcementId,
        publish:
          req.body.publish,
      });

      return res.redirect(
        "/admin?done=announcementStatus"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminInquiriesPage =
  async (req, res, next) => {
    try {
      return res.render(
        "admin-inquiries",
        {
          user:
            req.session.user,
          inquiryData:
            await getAdminInquiryData({
              status:
                req.query.status,
              page: req.query.page,
            }),
          feedback:
            adminFeedbackFromQuery(
              req.query
            ),
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminCoachSuggestionsPage =
  async (req, res, next) => {
    try {
      return res.render(
        "admin-coach-suggestions",
        {
          user:
            req.session.user,
          suggestionData:
            await getAdminSuggestionData(),
          feedback:
            req.query.moderated ===
            "1"
              ? "문구 검수 결과를 저장하고 실제 코치 문구 풀에 반영했습니다."
              : null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminReplyInquiry =
  async (req, res, next) => {
    try {
      await replyToInquiry({
        adminUserId:
          req.session.user.id,
        inquiryId:
          req.params.inquiryId,
        message:
          req.body.message,
      });

      return res.redirect(
        "/admin/inquiries?done=inquiryReply"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUpdateInquiryStatus =
  async (req, res, next) => {
    try {
      await updateInquiryStatus({
        adminUserId:
          req.session.user.id,
        inquiryId:
          req.params.inquiryId,
        status:
          req.body.status,
      });

      return res.redirect(
        "/admin/inquiries?done=inquiryStatus"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUsersPage =
  async (req, res, next) => {
    try {
      return res.render(
        "admin-users",
        {
          user:
            req.session.user,
          usersData:
            await getAdminUsersData({
              query:
                req.query.query,
              schoolCode:
                req.query.school,
              grade:
                req.query.grade,
              state:
                req.query.state,
              role:
                req.query.role,
              page:
                req.query.page,
              sort:
                req.query.sort,
            }),
          feedback:
            req.query.deleted === "1"
              ? "계정과 연결된 모든 학습·시험·Arena·게시판 데이터를 삭제했습니다."
              : null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUserDetailPage =
  async (req, res, next) => {
    try {
      return res.render(
        "admin-user-detail",
        {
          user:
            req.session.user,
          detail:
            await getAdminUserDetail(
              req.params.userId
            ),
          feedback:
            adminFeedbackFromQuery(
              req.query
            ),
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminAssessmentDetailPage =
  async (req, res, next) => {
    try {
      res.set(
        "Cache-Control",
        "no-store"
      );

      return res.render(
        "admin-assessment-detail",
        {
          user:
            req.session.user,
          detail:
            await getAdminAssessmentDetail({
              userId:
                req.params.userId,
              attemptId:
                req.params
                  .attemptId,
            }),
          formatAdminMath,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUserActivityPage =
  async (req, res, next) => {
    try {
      res.set(
        "Cache-Control",
        "no-store"
      );

      return res.render(
        "admin-user-activity",
        {
          user:
            req.session.user,
          activity:
            await getAdminUserActivityData({
              userId:
                req.params.userId,
              kind:
                req.query.kind,
              page:
                req.query.page,
              sort:
                req.query.sort,
            }),
          formatAdminMath,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUpdateUserNickname =
  async (req, res, next) => {
    try {
      await updateUserNickname({
        adminUserId:
          req.session.user.id,
        userId:
          req.params.userId,
        reason:
          req.body.reason,
        baseUrl:
          process.env.APP_BASE_URL ||
          `${req.protocol}://${req.get("host")}`,
      });

      return res.redirect(
        `/admin/users/${req.params.userId}?done=nickname`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminSendUserNotification =
  async (req, res, next) => {
    try {
      await createDirectNotification({
        adminUserId:
          req.session.user.id,
        userId:
          req.params.userId,
        title: req.body.title,
        message:
          req.body.message,
        href: req.body.href,
      });

      return res.redirect(
        `/admin/users/${req.params.userId}?done=notification`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminSendUserEmail =
  async (req, res, next) => {
    try {
      await sendDirectUserEmail({
        adminUserId:
          req.session.user.id,
        userId:
          req.params.userId,
        subject:
          req.body.subject,
        message:
          req.body.message,
      });

      return res.redirect(
        `/admin/users/${req.params.userId}?done=email`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminSendPasswordReset =
  async (req, res, next) => {
    try {
      await sendUserPasswordReset({
        adminUserId:
          req.session.user.id,
        userId:
          req.params.userId,
        baseUrl:
          process.env.APP_BASE_URL ||
          `${req.protocol}://${req.get("host")}`,
      });

      return res.redirect(
        `/admin/users/${req.params.userId}?done=passwordReset`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminSetUserActive =
  async (req, res, next) => {
    try {
      await setUserActive({
        adminUserId:
          req.session.user.id,
        userId:
          req.params.userId,
        active:
          req.body.active ===
          "true",
        reason:
          req.body.reason,
      });

      return res.redirect(
        `/admin/users/${req.params.userId}?done=account`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUpdateUserRole =
  async (req, res, next) => {
    try {
      await updateUserRole({
        adminUserId:
          req.session.user.id,
        userId:
          req.params.userId,
        role: req.body.role,
        reason:
          req.body.reason,
      });

      return res.redirect(
        `/admin/users/${req.params.userId}?done=role`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUpdateUserAccountStatus =
  async (req, res, next) => {
    try {
      await updateUserAccountStatus({
        adminUserId:
          req.session.user.id,
        userId:
          req.params.userId,
        status:
          req.body.status,
        reason:
          req.body.reason,
        suspensionDays:
          req.body
            .suspensionDays,
        retainAnonymousData:
          req.body
            .retainAnonymousData,
      });

      return res.redirect(
        `/admin/users/${req.params.userId}?done=accountStatus`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminDeleteUserAccount = async (req, res, next) => {
  try {
    if (String(req.body.confirmation || "").trim() !== "계정삭제") {
      const error = new Error("확인란에 ‘계정삭제’를 정확히 입력해주세요.");
      error.status = 400;
      throw error;
    }
    await updateUserAccountStatus({
      adminUserId: req.session.user.id,
      userId: req.params.userId,
      status: "withdrawn",
      reason: req.body.reason,
      retainAnonymousData: req.body.dataRetention,
    });
    const purged = String(req.body.dataRetention) === "purged";
    return purged
      ? res.redirect("/admin/users?deleted=1")
      : res.redirect(`/admin/users/${req.params.userId}?done=accountStatus`);
  } catch (error) {
    return next(error);
  }
};

exports.adminUpdateUserWarningCount =
  async (req, res, next) => {
    try {
      await updateUserWarningCount({
        adminUserId:
          req.session.user.id,
        userId:
          req.params.userId,
        warningCount:
          req.body.warningCount,
        reason:
          req.body.reason,
      });

      return res.redirect(
        `/admin/users/${req.params.userId}?done=warningCount`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUpdateUserPackageAccess =
  async (req, res, next) => {
    try {
      await updateAdminPackageAccess({
        adminUserId: req.session.user.id,
        userId: req.params.userId,
        packageType: req.body.packageType,
        reason: req.body.reason,
      });
      return res.redirect(
        `/admin/users/${req.params.userId}?done=packageAccess`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.openUserNotification =
  async (req, res, next) => {
    try {
      const href =
        await markNotificationRead({
          userId:
            req.session.user.id,
          notificationId:
            req.params
              .notificationId,
        });

      return res.redirect(href);
    } catch (error) {
      return next(error);
    }
  };

exports.notificationInboxPage =
  async (req, res, next) => {
    try {
      return res.render(
        "notifications",
        {
          user:
            req.session.user,
          inbox:
            await getNotificationInbox({
              userId:
                req.session.user.id,
              page: req.query.page,
            }),
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.notificationDetailPage =
  async (req, res, next) => {
    try {
      res.set(
        "Cache-Control",
        "no-store"
      );

      return res.render(
        "notification-detail",
        {
          user:
            req.session.user,
          notification:
            await getNotificationDetail({
              userId:
                req.session.user.id,
              notificationId:
                req.params
                  .notificationId,
            }),
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.markAllUserNotificationsRead =
  async (req, res, next) => {
    try {
      await markAllNotificationsRead(
        req.session.user.id
      );

      return res.redirect(
        "/notifications"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.dismissDashboardAnnouncement =
  async (req, res, next) => {
    try {
      return res.json(
        await dismissDashboardAnnouncement({
          userId:
            req.session.user.id,
          announcementId:
            req.params
              .announcementId,
        })
      );
    } catch (error) {
      return next(error);
    }
  };

exports.dismissDashboardNotification =
  async (req, res, next) => {
    try {
      return res.json(
        await dismissDashboardNotification({
          userId:
            req.session.user.id,
          notificationId:
            req.params
              .notificationId,
        })
      );
    } catch (error) {
      return next(error);
    }
  };

exports.curriculumPage = (req, res, next) => {
  try {
    const curriculumData = loadCurriculum();

    res.render('curriculum', {
      curriculumData,
      user:
        req.session?.user ||
        null,
    });
  } catch (error) {
    next(error);
  }
};

exports.main = async (req, res, next) => {
    try {
        const dashboardData =
            await getDashboardData(
                req.session.user.id
            );

        return res.render("main", {
            user: dashboardData.user,
            dashboardData,
        });
    } catch (error) {
        return next(error);
    }
};

exports.privateMockExamsPage = async (
  req,
  res,
  next
) => {
  try {
    const examData =
      await getPrivateMockExamPageData(
        req.session.user.id
      );
    if (
      examData.eligibility
        ?.status ===
      "integrity-restriction"
    ) {
      return res.redirect(
        "/account/private-mock-restriction"
      );
    }
    res.set(
      "Cache-Control",
      "private, no-store"
    );
    return res.render(
      "private-mock-exams",
      {
        user:
          req.session.user,
        examData,
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.privateMockRestrictionPage =
  async (req, res, next) => {
    try {
      const restrictionData =
        await getPrivateMockRestrictionData(
          req.session.user.id
        );
      res.set(
        "Cache-Control",
        "private, no-store"
      );
      return res.render(
        "private-mock-restriction",
        {
          user:
            restrictionData.user,
          restrictionData,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.privateMockExamPage =
  async (req, res, next) => {
    try {
      const examData =
        await getPrivateMockAttemptData({
          userId:
            req.session.user.id,
          examId:
            req.params.examId,
        });

      res.set(
        "Cache-Control",
        "private, no-store"
      );
      return res.render(
        "private-mock-exam",
        {
          user:
            req.session.user,
          examData,
        }
      );
    } catch (error) {
      if (error.eligibility) {
        return res.redirect(
          "/private-mock-exams"
        );
      }
      return next(error);
    }
  };

exports.privateMockExamFile =
  async (req, res, next) => {
    try {
      const file =
        await getPrivateMockExamFile({
          userId:
            req.session.user.id,
          examId:
            req.params.examId,
        });

      if (file.cloudUrl) {
        res.set("Cache-Control", "private, no-store");
        res.set("Referrer-Policy", "no-referrer");
        return res.redirect(302, file.cloudUrl);
      }

      return res.sendFile(
        file.path,
        {
          headers: {
            "Content-Type":
              file.mimeType,
            "Content-Disposition":
              `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            "Cache-Control":
              "private, no-store",
          },
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.startPrivateMockExam =
  async (req, res, next) => {
    try {
      return res.json(
        await startPrivateMockAttempt({
          userId:
            req.session.user.id,
          examId:
            req.params.examId,
        })
      );
    } catch (error) {
      return next(error);
    }
  };

exports.privateMockFormulaFile =
  async (req, res, next) => {
    try {
      const file =
        await getPrivateMockFormulaFile({
          userId:
            req.session.user.id,
        });

      return res.sendFile(
        file.path,
        {
          headers: {
            "Content-Type":
              file.mimeType,
            "Content-Disposition":
              `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            "Cache-Control":
              "private, no-store",
          },
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.savePrivateMockExamDraft =
  async (req, res, next) => {
    try {
      return res.json(
        await savePrivateMockDraft({
          userId:
            req.session.user.id,
          examId:
            req.params.examId,
          answers:
            req.body.answers,
          telemetryEvents:
            req.body
              .telemetryEvents,
        })
      );
    } catch (error) {
      return next(error);
    }
  };

exports.submitPrivateMockExam =
  async (req, res, next) => {
    try {
      const result =
        await submitPrivateMockAttempt({
          userId:
            req.session.user.id,
          examId:
            req.params.examId,
          answers:
            req.body.answers,
          telemetryEvents:
            req.body
              .telemetryEvents,
        });
      const activityUser =
        await recordStudyActivity(
          req.session.user.id,
          new Date(),
          result.elapsedMs
        );
      Object.assign(
        req.session.user,
        lifecycleSessionView(
          activityUser
        )
      );

      return res.json({
        submitted: true,
        result,
      });
    } catch (error) {
      return next(error);
    }
  };

exports.privateMockIntegrityCasePage =
  async (req, res, next) => {
    try {
      return res.render(
        "private-mock-integrity-case",
        {
          user:
            req.session.user,
          integrityCase:
            await getUserIntegrityCase({
              userId:
                req.session.user.id,
              caseId:
                req.params.caseId,
            }),
          feedback:
            req.query
              .submitted === "1"
              ? "풀이과정이 정상적으로 제출되었습니다. 검토 결과는 알림 우편함으로 안내합니다."
              : null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.submitPrivateMockIntegrityEvidence =
  async (req, res, next) => {
    try {
      await submitPrivateMockIntegrityEvidence({
        userId:
          req.session.user.id,
        caseId:
          req.params.caseId,
        files: req.files,
        note:
          req.body.note,
      });

      return res.redirect(
        `/integrity/cases/${req.params.caseId}?submitted=1`
      );
    } catch (error) {
      await Promise.all(
        (req.files || []).map(
          (file) =>
            discardArchiveUpload(
              file
            )
        )
      );
      return next(error);
    }
  };

exports.selectPrivateMockResult =
  async (req, res, next) => {
    try {
      return res.json({
        selected: true,
        result:
          await selectPrivateMockWeeklyAttempt({
            userId:
              req.session.user.id,
            weekKey:
              req.params.weekKey,
            attemptId:
              req.body.attemptId,
            defer:
              req.body.defer ===
                true ||
              req.body.defer ===
                "true",
          }),
      });
    } catch (error) {
      return next(error);
    }
  };

exports.adminPrivateMockExamsPage =
  async (req, res, next) => {
    try {
      return res.render(
        "admin-private-mock-exams",
        {
          user:
            req.session.user,
          examData:
            await getAdminPrivateMockExamData(),
          feedback:
            Number(
              req.query.created
            ) > 0
              ? {
                  type:
                    "success",
                  message:
                    `${Number(req.query.created)}개 회차를 등록하고 공개 예약을 확정했습니다.`,
                }
              : req.query
                    .deleted ===
                  "1"
                ? {
                    type:
                      "success",
                    message:
                      "예약된 Matths 주간 공식 모의고사를 삭제했습니다.",
                  }
              : req.query
                    .formulaUploaded ===
                  "1"
                ? {
                    type:
                      "success",
                    message:
                      "대기실 공식 암기 PDF를 등록했습니다.",
                  }
              : req.query
                    .formulaDeleted ===
                  "1"
                ? {
                    type:
                      "success",
                    message:
                      "공식 암기 PDF를 삭제했습니다.",
                  }
              : null,
          error: null,
          oldInput: {},
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminPrivateMockExamDetailPage =
  async (req, res, next) => {
    try {
      return res.render(
        "admin-private-mock-exam-detail",
        {
          user:
            req.session.user,
          detail:
            await getAdminPrivateMockExamDetailData({
              examId:
                req.params.examId,
            }),
          feedback:
            req.query
              .integrityRequested ===
            "1"
              ? {
                  type:
                    "success",
                  message:
                    "소명 자료 요청을 우편함과 이메일로 전송했습니다.",
                }
              : req.query
                    .integrityError
                ? {
                    type:
                      "error",
                    message:
                      String(
                        req.query
                          .integrityError
                      ),
                  }
                : req.query
                      .integrityReviewed ===
                    "1"
                  ? {
                      type:
                        "success",
                      message:
                        "소명 검토 상태와 페널티 결정을 저장했습니다.",
                    }
                  : req.query
                        .answerCorrected !==
                      undefined
                    ? {
                        type:
                          "success",
                        message:
                          `정답을 정정하고 ${Number(req.query.answerCorrected) || 0}개 응시 기록의 성적·랭킹·MMR을 다시 계산했습니다.`,
                      }
                : null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminPrivateMockExamPdfFile =
  async (req, res, next) => {
    try {
      const file =
        await getAdminPrivateMockPdfFile({
          examId:
            req.params.examId,
          fileType:
            req.params.fileType,
        });

      if (file.cloudUrl) {
        res.set("Cache-Control", "private, no-store");
        res.set("Referrer-Policy", "no-referrer");
        return res.redirect(302, file.cloudUrl);
      }

      return res.sendFile(
        file.path,
        {
          headers: {
            "Content-Type":
              file.mimeType,
            "Content-Disposition":
              `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            "Cache-Control":
              "private, no-store",
          },
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminPrivateMockIntegrityEvidenceFile =
  async (req, res, next) => {
    try {
      const file =
        await getAdminPrivateMockIntegrityEvidenceFile({
          caseId:
            req.params.caseId,
          archiveItemId:
            req.params.archiveItemId,
        });

      if (file.cloudUrl) {
        res.set("Cache-Control", "private, no-store");
        res.set("Referrer-Policy", "no-referrer");
        return res.redirect(302, file.cloudUrl);
      }

      return res.sendFile(
        file.path,
        {
          headers: {
            "Content-Type":
              file.mimeType,
            "Content-Disposition":
              `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            "Cache-Control":
              "private, no-store",
            "Content-Security-Policy":
              "sandbox; default-src 'none'",
            "X-Content-Type-Options":
              "nosniff",
            "Cross-Origin-Resource-Policy":
              "same-origin",
            "Referrer-Policy":
              "no-referrer",
          },
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminRequestPrivateMockIntegrityEvidence =
  async (req, res, next) => {
    try {
      await requestPrivateMockIntegrityEvidenceByAdmin({
        adminUserId:
          req.session.user.id,
        examId:
          req.params.examId,
        attemptId:
          req.params.attemptId,
        requestedQuestionNumbers:
          req.body
            .requestedQuestionNumbers,
        instructions:
          req.body.instructions,
      });

      return res.redirect(
        `/admin/private-mock-exams/${req.params.examId}?integrityRequested=1#attempt-${req.params.attemptId}`
      );
    } catch (error) {
      if (error.status) {
        return res.redirect(
          `/admin/private-mock-exams/${req.params.examId}?integrityError=${encodeURIComponent(error.message)}#attempt-${req.params.attemptId}`
        );
      }
      return next(error);
    }
  };

exports.adminReviewPrivateMockIntegrityCase =
  async (req, res, next) => {
    try {
      await reviewPrivateMockIntegrityCase({
        adminUserId:
          req.session.user.id,
        examId:
          req.params.examId,
        caseId:
          req.params.caseId,
        reviewStatus:
          req.body.reviewStatus,
        penaltyDecision:
          req.body.penaltyDecision,
        reason:
          req.body.reason,
      });
      return res.redirect(
        `/admin/private-mock-exams/${req.params.examId}?integrityReviewed=1#integrity-${req.params.caseId}`
      );
    } catch (error) {
      if (error.status) {
        return res.redirect(
          `/admin/private-mock-exams/${req.params.examId}?integrityError=${encodeURIComponent(error.message)}#integrity-${req.params.caseId}`
        );
      }
      return next(error);
    }
  };

exports.adminCorrectPrivateMockAnswers =
  async (req, res, next) => {
    try {
      const asArray = (
        value
      ) =>
        Array.isArray(value)
          ? value
          : value ===
                undefined ||
              value === null
            ? []
            : [value];
      const numbers =
        asArray(
          req.body
            .questionNumbers
        );
      const contents =
        asArray(
          req.body
            .questionContents
        );
      const answers =
        asArray(
          req.body
            .newAnswers
        );
      const result =
        await correctPrivateMockAnswers({
          adminUserId:
            req.session.user.id,
          examId:
            req.params.examId,
          corrections:
            numbers.map(
              (
                questionNumber,
                index
              ) => ({
                questionNumber,
                questionContent:
                  contents[
                    index
                  ],
                newAnswer:
                  answers[index],
              })
            ),
          reason:
            req.body.reason,
        });
      return res.redirect(
        `/admin/private-mock-exams/${req.params.examId}?answerCorrected=${result.affectedAttemptCount}`
      );
    } catch (error) {
      if (error.status) {
        return res.redirect(
          `/admin/private-mock-exams/${req.params.examId}?integrityError=${encodeURIComponent(error.message)}`
        );
      }
      return next(error);
    }
  };

exports.adminCreatePrivateMockExam =
  async (req, res, next) => {
    try {
      const files =
        req.files || {};
      const created =
        await createPrivateMockExamBatch({
        user:
          req.session.user,
        questionFiles:
          files.examFiles,
        answerKeyFiles:
          files.answerKeyFiles,
        answerSheetFiles:
          files.answerSheetFiles,
        titles:
          req.body.titles,
        examDates:
          req.body.examDates,
        formCodes:
          req.body.formCodes,
      });

      return res.redirect(
        `/admin/private-mock-exams?created=${created.length}`
      );
    } catch (error) {
      await Promise.all(
        Object.values(
          req.files || {}
        )
          .flat()
          .map((file) =>
            discardArchiveUpload(
              file
            )
          )
      );

      if (error.status) {
        return res
          .status(error.status)
          .render(
            "admin-private-mock-exams",
            {
              user:
                req.session.user,
              examData:
                await getAdminPrivateMockExamData(),
              feedback: null,
              error:
                error.message,
              oldInput:
                req.body,
            }
          );
      }

      return next(error);
    }
  };

exports.adminDeletePrivateMockExam =
  async (req, res, next) => {
    try {
      await deletePrivateMockExam({
        user:
          req.session.user,
        examId:
          req.params.examId,
      });

      return res.redirect(
        "/admin/private-mock-exams?deleted=1"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUploadPrivateMockFormula =
  async (req, res, next) => {
    try {
      await createPrivateMockFormulaResource({
        user:
          req.session.user,
        file: req.file,
        versionLabel:
          req.body
            .versionLabel,
      });
      return res.redirect(
        "/admin/private-mock-exams?formulaUploaded=1"
      );
    } catch (error) {
      await discardArchiveUpload(
        req.file
      );
      return next(error);
    }
  };

exports.adminDeletePrivateMockFormula =
  async (req, res, next) => {
    try {
      await deletePrivateMockFormulaResource({
        user:
          req.session.user,
        resourceId:
          req.params.resourceId,
      });
      return res.redirect(
        "/admin/private-mock-exams?formulaDeleted=1"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.warOfMastersPage = async (
  req,
  res,
  next
) => {
  try {
    const [
      user,
      placement,
      paidPackageAccess,
    ] = await Promise.all([
      User.findById(
        req.session.user.id
      ).lean(),
      getPlacementDashboardData(
        req.session.user.id
      ),
      getPaidPackageAccess(
        req.session.user.id
      ),
    ]);
    const privateMockEligibility =
      await getPrivateMockEligibility(
        req.session.user.id
      );

    if (!user) {
      throw createNotFoundError(
        "사용자 정보를 찾을 수 없습니다."
      );
    }

    if (
      privateMockEligibility.status ===
      "integrity-restriction"
    ) {
      return res.redirect(
        "/account/private-mock-restriction"
      );
    }

    const gradeLabels = {
      10: "고등학교 1학년",
      11: "고등학교 2학년",
      12: "고등학교 3학년",
      13: "N수생",
    };

    res.set("Cache-Control", "no-store");

    return res.render(
      "war-of-masters",
      {
        user,
        arenaUser: {
          nickname:
            String(user.name || "학생"),
          displayName:
            getRankingDisplayName(user),
          schoolName:
            String(
              user.school?.name ||
                "학교 미설정"
            ),
          gradeLabel:
            gradeLabels[
              Number(user.schoolGrade)
            ] || "학년 미설정",
          displayMode:
            user.preferences
              ?.rankingDisplayMode ===
            "realName"
              ? "실명"
              : "닉네임",
        },
        placement,
        paidPackageAccess,
        privateMockEligibility,
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.privateMockObjectionPage =
  async (req, res, next) => {
    try {
      return res.render(
        "private-mock-objection",
        {
          user:
            req.session.user,
          formData:
            await getPrivateMockObjectionFormData({
              userId:
                req.session.user.id,
            }),
          feedback:
            req.query.submitted ===
            "1"
              ? {
                  type:
                    "success",
                  message:
                    "문제 이의신청이 접수되었습니다. 운영팀 검토 결과는 이메일과 알림 우편함으로 안내드립니다.",
                }
              : null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.submitPrivateMockObjection =
  async (req, res, next) => {
    try {
      await createPrivateMockObjection({
        userId:
          req.session.user.id,
        examId:
          req.body.examId,
        questionNumber:
          req.body
            .questionNumber,
        issueDetail:
          req.body
            .issueDetail,
      });
      return res.redirect(
        "/war-of-masters/objections/new?submitted=1"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminPrivateMockObjectionPage =
  async (req, res, next) => {
    try {
      return res.render(
        "admin-private-mock-objection",
        {
          user:
            req.session.user,
          objection:
            await getAdminPrivateMockObjection({
              objectionId:
                req.params
                  .objectionId,
            }),
          feedback: null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminRejectPrivateMockObjection =
  async (req, res, next) => {
    try {
      await rejectPrivateMockObjection({
        adminUserId:
          req.session.user.id,
        objectionId:
          req.params
            .objectionId,
        reason:
          req.body.reason,
      });
      return res.redirect(
        "/admin/todos?done=1"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminAcceptPrivateMockObjection =
  async (req, res, next) => {
    try {
      await acceptPrivateMockObjection({
        adminUserId:
          req.session.user.id,
        objectionId:
          req.params
            .objectionId,
        newAnswer:
          req.body.newAnswer,
        questionContent:
          req.body
            .questionContent,
        reason:
          req.body.reason,
      });
      return res.redirect(
        "/admin/todos?done=1"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.warOfMastersRankingsPage =
  async (req, res, next) => {
    try {
      const [user, ranking] =
        await Promise.all([
          User.findById(
            req.session.user.id
          ).lean(),
          getRankingData(
            req.session.user.id
          ),
        ]);

      if (!user) {
        throw createNotFoundError(
          "사용자 정보를 찾을 수 없습니다."
        );
      }

      res.set(
        "Cache-Control",
        "no-store"
      );

      return res.render(
        "war-of-masters-rankings",
        {
          user,
          ranking,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.startPlacementExam = async (
  req,
  res,
  next
) => {
  try {
    const attempt =
      await createPlacementAttempt({
        userId:
          req.session.user.id,
      });

    return res.redirect(
      `/war-of-masters/placement/${attempt._id}`
    );
  } catch (error) {
    return next(error);
  }
};

exports.placementExamPage = async (
  req,
  res,
  next
) => {
  try {
    res.set(
      "Cache-Control",
      "no-store"
    );

    const attempt =
      await getPlacementAttempt({
        userId:
          req.session.user.id,
        attemptId:
          req.params.attemptId,
      });

    return res.render(
      "assessment-attempt",
      {
        user: req.session.user,
        attempt,
        difficultyLabels:
          DIFFICULTY_LABELS,
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.submitPlacementExam =
  async (req, res, next) => {
    try {
      const attempt =
        await submitPlacementAttempt({
          userId:
            req.session.user.id,
          attemptId:
            req.params.attemptId,
          answers:
            req.body?.answers || {},
          activeQuestionId:
            req.body
              ?.activeQuestionId ||
            "",
          currentQuestionIndex:
            Number(
              req.body
                ?.currentQuestionIndex
            ) || 0,
        });

      const activityUser =
        await recordStudyActivity(
          req.session.user.id,
          attempt.submittedAt ||
            new Date(),
          attempt.elapsedTimeMs
        );
      Object.assign(
        req.session.user,
        lifecycleSessionView(
          activityUser
        )
      );

      return res.redirect(
        `/war-of-masters/placement/${attempt._id}`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.savePlacementExamDraft =
  async (req, res, next) => {
    try {
      const result =
        await savePlacementDraft({
          userId:
            req.session.user.id,
          attemptId:
            req.params.attemptId,
          answers:
            req.body?.answers || {},
          activeQuestionId:
            req.body
              ?.activeQuestionId ||
            "",
          currentQuestionIndex:
            Number(
              req.body
                ?.currentQuestionIndex
            ) || 0,
          closeQuestionTiming:
            req.body
              ?.closeQuestionTiming ===
            true,
        });

      return res.json(result);
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .json({
            message:
              error.message,
          });
      }

      return next(error);
    }
  };

exports.expirePlacementExam =
  async (req, res, next) => {
    try {
      const attempt =
        await expirePlacementAttempt({
          userId:
            req.session.user.id,
          attemptId:
            req.params.attemptId,
          answers:
            req.body?.answers || {},
          activeQuestionId:
            req.body
              ?.activeQuestionId ||
            "",
          currentQuestionIndex:
            Number(
              req.body
                ?.currentQuestionIndex
            ) || 0,
        });

      return res.json({
        status: attempt.status,
        expired:
          attempt.status ===
          "disqualified",
        redirectUrl:
          `/war-of-masters/placement/${attempt._id}`,
      });
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .json({
            message:
              error.message,
            remainingTimeMs:
              error.remainingTimeMs,
          });
      }

      return next(error);
    }
  };

exports.togglePlanTask = async (
    req,
    res,
    next
) => {
    try {
        const plan =
            await toggleDailyPlanTask(
                req.session.user.id,
                req.params.taskId
            );

        if (!plan) {
            return res.status(404).json({
                message:
                    "오늘의 학습 계획을 찾을 수 없습니다.",
            });
        }

        return res.json({ plan });
    } catch (error) {
        return next(error);
    }
};

exports.changeCoachMode = async (
    req,
    res,
    next
) => {
    try {
        const coach =
            await updateCoachMode(
                req.session.user.id,
                req.body.mode,
                req.body.situation
            );

        if (!coach) {
            return res.status(400).json({
                message:
                    "올바른 코치 모드를 선택해주세요.",
            });
        }

        req.session.user.preferences = {
            ...(req.session.user.preferences ||
                {}),
            coachMode: coach.mode,
        };

        return req.session.save((error) => {
            if (error) {
                return next(error);
            }

            return res.json({ coach });
        });
    } catch (error) {
        return next(error);
    }
};

exports.changeProfileCoachMode = async (
    req,
    res,
    next
) => {
    try {
        const coach =
            await updateCoachMode(
                req.session.user.id,
                req.body.mode,
                "unanswered"
            );

        if (!coach) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "coach-mode",
                    type: "error",
                    message:
                        "올바른 학습 모드를 선택해주세요.",
                },
            });
        }

        req.session.user.preferences = {
            ...(req.session.user.preferences ||
                {}),
            coachMode: coach.mode,
        };
        await saveSession(req);

        return res.redirect(
            "/profile?coachModeUpdated=1#coach-mode-settings"
        );
    } catch (error) {
        return next(error);
    }
};

exports.myLearning = async (req, res, next) => {
  try {
    const { learningData } = await getUserLearningData(
      req.session.user.id
    );

    return res.render("my-learning", {
      learningData,
      user: req.session.user,
    });
  } catch (error) {
    return next(error);
  }
};

exports.unitLearning = async (
  req,
  res,
  next
) => {
  try {
    const { learningData } =
      await getUserLearningData(
        req.session.user.id
      );

    const unitView = findUnitView(
      learningData,
      req.params.courseId,
      req.params.unitId,
      req.params.conceptId
    );

    if (!unitView) {
      const error = new Error(
        "학습 단원을 찾을 수 없습니다."
      );

      error.status = 404;
      return next(error);
    }

    const conceptId =
      unitView.selectedConcept.id;

    const reviewAttemptId = String(
      req.query.reviewAttempt || ""
    ).trim();

    const [
      lesson,
      conceptProgress,
      reviewContext,
      assessmentData,
    ] =
      await Promise.all([
        ConceptLesson.findOne({
          curriculumId: "kr-2022",
          courseId: unitView.course.id,
          unitId: unitView.unit.id,
          conceptId,
          isPublished: true,
        }).lean(),

        ConceptProgress.findOne({
          userId: req.session.user.id,
          curriculumId: "kr-2022",
          courseId: unitView.course.id,
          unitId: unitView.unit.id,
          conceptId,
        }).lean(),

        reviewAttemptId
          ? getReviewContext({
              userId: req.session.user.id,
              reviewAttemptId,
              courseId: unitView.course.id,
              unitId: unitView.unit.id,
              conceptId,
            })
          : null,

        getAssessmentCenterData(
          req.session.user.id
        ),
      ]);

    const mastery =
      conceptProgress?.masteryGate || {
        requiredDistinctTypes:
          lesson?.practice
            ?.requiredDistinctTypes || 5,

        correctTypeIds: [],
        unlockedAt: null,
        userCompleted: false,
        completedAt: null,
      };

    const renderedLesson =
      formatAlgebraLesson(lesson);
    const conceptTypeGuides =
      getConceptTypeGuides({
        courseId: unitView.course.id,
        unitId: unitView.unit.id,
        conceptId,
      });
    const assessmentCourse =
      assessmentData.courses.find(
        (item) =>
          item.id ===
          unitView.course.id
      );
    const assessmentUnit =
      assessmentCourse?.units.find(
        (item) =>
          item.id ===
          unitView.unit.id
      );
    const subunitAssessment =
      assessmentUnit?.subunits.find(
        (item) =>
          item.concepts.some(
            (assessmentConcept) =>
              assessmentConcept.id ===
              conceptId
          )
      ) || null;

    return res.render("unit-learning", {
      learningData,
      unitView,
      lesson: renderedLesson,
      mastery,
      reviewContext,
      subunitAssessment,
      conceptTypeGuides,
      user: req.session.user,
    });
  } catch (error) {
    return next(error);
  }
};

function renderRegisterError(res, status, error, oldInput = {}) {
    return res.status(status).render("register", {
        schoolRegions: getSchoolSelectData(),
        error,
        oldInput: {
            realName: "",
            birthDate: "",
            name: "",
            email: "",
            schoolGrade: 10,
            schoolRegion: "",
            schoolCode: "",
            ...oldInput,
        },
    });
}

function createLoginSession(req, user) {
    return new Promise((resolve, reject) => {
        req.session.regenerate((regenerateError) => {
            if (regenerateError) {
                return reject(regenerateError);
            }

            req.session.user = {
                id: user._id.toString(),
                name: user.name,
                realName: user.realName || "",
                email: user.email,
                role: user.role || "student",
                tokenVersion:
                    Number(user.tokenVersion) || 0,
                schoolGrade: user.schoolGrade,
                educationStatus:
                    user.educationStatus ||
                    (Number(user.schoolGrade) === 13
                        ? "graduated"
                        : "enrolled"),
                ...lifecycleSessionView(user),
                preferences: {
                    coachMode:
                        user.preferences
                            ?.coachMode ||
                        "spicy",
                    rankingDisplayMode:
                        user.preferences
                            ?.rankingDisplayMode ||
                        "nickname",
                },

                school: user.school?.code
                    ? {
                          region: user.school.region,
                          code: user.school.code,
                          name: user.school.name,
                      }
                    : null,
            };

            req.session.save((saveError) => {
                if (saveError) {
                    return reject(saveError);
                }

                resolve();
            });
        });
    });
}

exports.register = async (req, res, next) => {
    try {
        const realNameValidation = validateRealName(
            req.body.realName
        );
        const realName = realNameValidation.realName;
        const name = String(req.body.name || "").trim();
        const email = String(req.body.email || "")
            .trim()
            .toLowerCase();
        const birthDateInput = String(
            req.body.birthDate || ""
        ).trim();

        const schoolGrade = Number(req.body.schoolGrade);
        const schoolRegion = String(req.body.schoolRegion || "").trim();
        const schoolCode = String(req.body.schoolCode || "").trim();

        const password = String(req.body.password || "");
        const passwordConfirm = String(req.body.passwordConfirm || "");

        const termsAccepted = ["true", "on", "1"].includes(
            String(req.body.termsAccepted || "")
        );

        // 비밀번호는 oldInput에 절대 포함하지 않는다.
        const oldInput = {
            realName,
            birthDate: birthDateInput,
            name,
            email,
            schoolGrade,
            schoolRegion,
            schoolCode,
        };

        if (
            !realName ||
            !birthDateInput ||
            !name ||
            !email ||
            (schoolGrade !== 13 &&
                (!schoolRegion || !schoolCode)) ||
            !password ||
            !passwordConfirm
        ) {
            return renderRegisterError(
                res,
                400,
                "필수 항목을 모두 입력해주세요.",
                oldInput
            );
        }

        if (!realNameValidation.valid) {
            return renderRegisterError(
                res,
                400,
                realNameValidation.message,
                oldInput
            );
        }

        if (name.length < 2 || name.length > 30) {
            return renderRegisterError(
                res,
                400,
                "닉네임은 2자 이상 30자 이하로 입력해주세요.",
                oldInput
            );
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(email)) {
            return renderRegisterError(
                res,
                400,
                "올바른 이메일 주소를 입력해주세요.",
                oldInput
            );
        }

        if (![10, 11, 12, 13].includes(schoolGrade)) {
            return renderRegisterError(
                res,
                400,
                "올바른 학년을 선택해주세요.",
                oldInput
            );
        }

        if (password.length < 8) {
            return renderRegisterError(
                res,
                400,
                "비밀번호는 8자 이상이어야 합니다.",
                oldInput
            );
        }

        if (Buffer.byteLength(password, "utf8") > 72) {
            return renderRegisterError(
                res,
                400,
                "비밀번호가 너무 깁니다.",
                oldInput
            );
        }

        if (password !== passwordConfirm) {
            return renderRegisterError(
                res,
                400,
                "비밀번호가 서로 일치하지 않습니다.",
                oldInput
            );
        }

        if (!termsAccepted) {
            return renderRegisterError(
                res,
                400,
                "이용약관에 동의해주세요.",
                oldInput
            );
        }

        let birthDate;
        try {
            birthDate = normalizeBirthDate(
                birthDateInput
            ).birthDate;
        } catch (error) {
            return renderRegisterError(
                res,
                400,
                error.message,
                oldInput
            );
        }

        /*
         * 브라우저가 보낸 학교 이름을 그대로 저장하지 않고,
         * YAML 데이터에서 학교 코드가 실제로 존재하는지 확인한다.
         */
        const selectedSchool =
            schoolGrade === 13
                ? null
                : findSchool(
                      schoolRegion,
                      schoolCode
                  );

        if (schoolGrade !== 13 && !selectedSchool) {
            return renderRegisterError(
                res,
                400,
                "올바른 고등학교를 선택해주세요.",
                oldInput
            );
        }

        const [existingUser, existingNickname] =
          await Promise.all([
            User.exists({
              email,
            }),
            User.exists({
              $or: [
                {
                  nameNormalized:
                    nicknameKey(
                      name
                    ),
                },
                {
                  name: {
                    $regex:
                      `^${name.replace(
                        /[.*+?^${}()|[\]\\]/g,
                        "\\$&"
                      )}$`,
                    $options: "i",
                  },
                },
              ],
            }),
          ]);

        if (existingUser) {
            return renderRegisterError(
                res,
                409,
                "이미 가입된 이메일입니다.",
                oldInput
            );
        }

        if (existingNickname) {
            return renderRegisterError(
                res,
                409,
                "이미 사용 중인 닉네임입니다.",
                oldInput
            );
        }

        const passwordHash = await bcrypt.hash(
            password,
            BCRYPT_ROUNDS
        );

        const user = await User.create({
            realName,
            name,
            nameNormalized:
              nicknameKey(name),
            email,
            passwordHash,
            birthDate,
            ...(selectedSchool
                ? {
                      identityMatchHash:
                          buildIdentityMatchHash({
                              realName,
                              birthDate,
                              schoolCode:
                                  selectedSchool.code,
                          }),
                      identityMatchVersion:
                          "name-birthdate-school-v1",
                  }
                : {}),
            schoolGrade,
            educationStatus:
                schoolGrade === 13
                    ? "graduated"
                    : "enrolled",
            lastGradePromotionYear:
                getAcademicYear(),
            lastLoginAt: new Date(),

            ...(selectedSchool
                ? {
                      school: {
                          region: selectedSchool.region,
                          code: selectedSchool.code,
                          name: selectedSchool.name,
                          roadAddress:
                              selectedSchool.roadAddress || "",
                          establishment:
                              selectedSchool.establishment || "",
                          highSchoolType:
                              selectedSchool.highSchoolType || "",
                      },
                  }
                : {}),

            termsAcceptedAt: new Date(),
            termsVersion: "2026-08-01",
            privacyVersion: "2026-08-01",
        });

        await alertPotentialDuplicateIdentity(
            user
        ).catch((error) => {
            console.error(
                "동일인 중복 계정 관리자 알림 생성 실패:",
                error
            );
        });

        // 회원가입 완료 후 바로 로그인 처리
        await createLoginSession(req, user);

        return res.redirect("/main");
    } catch (error) {
        // 동시에 같은 이메일로 가입 요청이 들어온 경우
        if (error.code === 11000 && error.keyPattern?.email) {
            return renderRegisterError(
                res,
                409,
                "이미 가입된 이메일입니다.",
                {
                    realName: validateRealName(
                        req.body.realName
                    ).realName,
                    birthDate: String(
                        req.body.birthDate || ""
                    ).trim(),
                    name: String(req.body.name || "").trim(),
                    email: String(req.body.email || "")
                        .trim()
                        .toLowerCase(),
                    schoolGrade: Number(req.body.schoolGrade) || 10,
                    schoolRegion: String(
                        req.body.schoolRegion || ""
                    ).trim(),
                    schoolCode: String(req.body.schoolCode || "").trim(),
                }
            );
        }

        if (
          error.code === 11000 &&
          error.keyPattern
            ?.nameNormalized
        ) {
          return renderRegisterError(
            res,
            409,
            "이미 사용 중인 닉네임입니다.",
            {
              realName:
                validateRealName(
                  req.body.realName
                ).realName,
              birthDate:
                String(
                  req.body.birthDate ||
                    ""
                ).trim(),
              name:
                String(
                  req.body.name ||
                    ""
                ).trim(),
              email:
                String(
                  req.body.email ||
                    ""
                )
                  .trim()
                  .toLowerCase(),
              schoolGrade:
                Number(
                  req.body
                    .schoolGrade
                ) || 10,
              schoolRegion:
                String(
                  req.body
                    .schoolRegion ||
                    ""
                ).trim(),
              schoolCode:
                String(
                  req.body
                    .schoolCode ||
                    ""
                ).trim(),
            }
          );
        }

        return next(error);
    }
};

function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate((error) => {
            if (error) {
                return reject(error);
            }

            resolve();
        });
    });
}

function saveSession(req) {
    return new Promise((resolve, reject) => {
        req.session.save((error) => {
            if (error) {
                return reject(error);
            }

            resolve();
        });
    });
}

function isSafeReturnPath(returnTo) {
    return (
        typeof returnTo === "string" &&
        returnTo.startsWith("/") &&
        !returnTo.startsWith("//")
    );
}

exports.login = async (req, res, next) => {
    try {
        const identifier = String(
            req.body.identifier ||
                req.body.email ||
                ""
        ).trim();
        const email = identifier.toLowerCase();

        const password = String(req.body.password || "");

        if (!identifier || !password) {
            return res.status(400).render("login", {
                error: "이메일 또는 닉네임과 비밀번호를 모두 입력해주세요.",
                oldInput: {
                    identifier,
                },
            });
        }

        /*
         * passwordHash가 Schema에서 select: false라면
         * 반드시 select("+passwordHash")를 사용해야 한다.
         */
        const escapedIdentifier =
            identifier.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );
        let user = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            identifier
        )
            ? await User.findOne({ email })
                  .select("+passwordHash")
                  .lean()
            : null;
        if (!user) {
            user = await User.findOne({
                $or: [
                    {
                        nameNormalized:
                            nicknameKey(identifier),
                    },
                    {
                        name: {
                            $regex:
                                `^${escapedIdentifier}$`,
                            $options: "i",
                        },
                    },
                ],
            })
                .select("+passwordHash")
                .lean();
        }

        /*
         * 이메일 존재 여부와 비밀번호 오류를 같은 문구로 처리한다.
         * 어떤 이메일이 가입되어 있는지 외부에 노출하지 않기 위해서다.
         */
        if (!user) {
            return res.status(401).render("login", {
                error: "이메일·닉네임 또는 비밀번호가 올바르지 않습니다.",
                oldInput: {
                    identifier,
                },
            });
        }

        const passwordMatched = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!passwordMatched) {
            return res.status(401).render("login", {
                error: "이메일·닉네임 또는 비밀번호가 올바르지 않습니다.",
                oldInput: {
                    identifier,
                },
            });
        }

        const access =
            await synchronizeAccountAccess(
                user._id
            );

        if (
            !access ||
            !access.allowed
        ) {
            return res.status(403).render(
                "login",
                {
                    error:
                        accountBlockedMessage(
                            access?.status,
                            access?.user
                                ?.accountStatusReason
                        ),
                    oldInput: {
                        identifier,
                    },
                }
            );
        }

        const synchronizedUser =
            await synchronizeUserLifecycle(
                access.user._id
            );
        const loginAt = new Date();
        await synchronizeDormantArenaReturn({
            userId: synchronizedUser._id,
            lastLoginAt: synchronizedUser.lastLoginAt,
            now: loginAt,
        });
        synchronizedUser.lastLoginAt =
            loginAt;
        await synchronizedUser.save();
        user =
            synchronizedUser.toObject();

        /*
         * 로그인 전에 사용자가 접근하려던 주소를 보관한다.
         * regenerate하면 기존 session 데이터가 사라지므로 먼저 꺼내야 한다.
         */
        const returnTo = req.session.returnTo;

        /*
         * 로그인 성공 시 Session ID를 새로 발급해서
         * 세션 고정 공격을 방지한다.
         */
        await regenerateSession(req);

        req.session.user = {
            id: user._id.toString(),
            name: user.name,
            realName: user.realName || "",
            email: user.email,
            role: user.role || "student",
            tokenVersion:
                Number(user.tokenVersion) || 0,
            schoolGrade: user.schoolGrade,
            educationStatus:
                user.educationStatus ||
                (Number(user.schoolGrade) === 13
                    ? "graduated"
                    : "enrolled"),
            ...lifecycleSessionView(user),
            preferences: {
                coachMode:
                    user.preferences
                        ?.coachMode ||
                    "spicy",
                rankingDisplayMode:
                    user.preferences
                        ?.rankingDisplayMode ||
                    "nickname",
            },

            school: user.school?.code
                ? {
                      region: user.school.region,
                      code: user.school.code,
                      name: user.school.name,
                  }
                : null,
        };

        await saveSession(req);

        const adminEmail =
            String(
                process.env.ADMIN_EMAIL ||
                    "admin@lsbproduction.com"
            )
                .trim()
                .toLowerCase();
        if (
            user.role === "admin" ||
            String(user.email || "")
                .trim()
                .toLowerCase() ===
                adminEmail
        ) {
            return res.redirect("/admin");
        }

        if (isSafeReturnPath(returnTo)) {
            return res.redirect(returnTo);
        }

        return res.redirect("/main");
    } catch (error) {
        return next(error);
    }
};

exports.logout = (req, res, next) => {
    req.session.destroy((error) => {
        if (error) {
            return next(error);
        }

        res.clearCookie("connect.sid");
        return res.redirect("/login");
    });
};

function createNotFoundError(message) {
    const error = new Error(message);
    error.status = 404;
    return error;
}

async function renderProfile(
    req,
    res,
    {
        status = 200,
        feedback = null,
        formValues = {},
    } = {}
) {
    const profileUser = await User.findById(
        req.session.user.id
    ).lean();

    if (!profileUser) {
        throw createNotFoundError(
            "사용자 정보를 찾을 수 없습니다."
        );
    }

    return res.status(status).render("profile", {
        profileUser,
        schoolRegions: getSchoolSelectData(),
        feedback,
        formValues,
    });
}

exports.profilePage = async (req, res, next) => {
    try {
        let feedback = null;

        if (
          req.query
            .nicknameUpdated ===
          "1"
        ) {
          feedback = {
            section: "nickname",
            type: "success",
            message:
              "닉네임을 변경했습니다.",
          };
        } else if (
          req.query
            .coachModeUpdated ===
          "1"
        ) {
          feedback = {
            section: "coach-mode",
            type: "success",
            message:
              "학습 모드를 변경했습니다.",
          };
        } else if (
          req.query
            .nicknameChanged ===
          "1"
        ) {
          feedback = {
            section: "nickname",
            type: "success",
            message:
              "닉네임 변경 요청을 완료했습니다.",
          };
        }

        return await renderProfile(
          req,
          res,
          {
            feedback,
          }
        );
    } catch (error) {
        return next(error);
    }
};

exports.withdrawOwnAccount = async (
    req,
    res,
    next
) => {
    try {
        await withdrawOwnAccount({
            userId:
                req.session.user.id,
            password:
                req.body.currentPassword,
            confirmation:
                req.body.confirmation,
            acknowledgeAnonymousRetention:
                req.body
                    .acknowledgeAnonymousRetention,
        });

        return req.session.destroy(
            (error) => {
                if (error) {
                    return next(error);
                }

                res.clearCookie(
                    "connect.sid"
                );
                return res.redirect(
                    "/login?withdrawn=1"
                );
            }
        );
    } catch (error) {
        if (
            Number(error.status) >=
                400 &&
            Number(error.status) <
                500
        ) {
            try {
                return await renderProfile(
                    req,
                    res,
                    {
                        status:
                            error.status,
                        feedback: {
                            section:
                                "withdrawal",
                            type: "error",
                            message:
                                error.message,
                        },
                    }
                );
            } catch (
                renderError
            ) {
                return next(
                    renderError
                );
            }
        }

        return next(error);
    }
};

exports.changeNickname = async (req, res, next) => {
    try {
        const validation =
          validateNickname(
            req.body.nickname
          );
        const nickname =
          validation.nickname;

        if (!validation.valid) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "nickname",
                    type: "error",
                    message:
                      validation.message,
                },
                formValues: { nickname },
            });
        }

        const duplicate =
          await User.exists({
            _id: {
              $ne:
                req.session.user.id,
            },
            $or: [
              {
                nameNormalized:
                  nicknameKey(
                    nickname
                  ),
              },
              {
                name: {
                  $regex:
                    `^${nickname.replace(
                      /[.*+?^${}()|[\]\\]/g,
                      "\\$&"
                    )}$`,
                  $options: "i",
                },
              },
            ],
          });

        if (duplicate) {
            return await renderProfile(req, res, {
                status: 409,
                feedback: {
                    section: "nickname",
                    type: "error",
                    message:
                        "이미 사용 중인 닉네임입니다.",
                },
                formValues: { nickname },
            });
        }

        const user = await User.findByIdAndUpdate(
            req.session.user.id,
            {
              name: nickname,
              nameNormalized:
                nicknameKey(
                  nickname
                ),
            },
            {
                new: true,
                runValidators: true,
            }
        ).lean();

        if (!user) {
            throw createNotFoundError(
                "사용자 정보를 찾을 수 없습니다."
            );
        }

        req.session.user.name = user.name;
        await saveSession(req);

        return res.redirect(
          "/profile?nicknameUpdated=1#nickname-settings"
        );
    } catch (error) {
        return next(error);
    }
};

async function renderNicknameChangePage(
  req,
  res,
  {
    status = 200,
    error = null,
    success = null,
    nickname = "",
  } = {}
) {
  const requestId =
    String(
      req.query.requestId ||
        req.body.requestId ||
        ""
    );
  const token =
    String(
      req.query.token ||
        req.body.token ||
        ""
    );
  const pageData =
    await getNicknameChangePageData({
      userId:
        req.session.user.id,
      requestId,
      token,
    });

  return res
    .status(status)
    .render(
      "nickname-change",
      {
        user:
          req.session.user,
        pageData,
        requestId,
        token,
        error,
        success,
        nickname,
      }
    );
}

exports.nicknameChangePage =
  async (req, res, next) => {
    try {
      return await renderNicknameChangePage(
        req,
        res
      );
    } catch (error) {
      return next(error);
    }
  };

exports.checkNicknameChange =
  async (req, res, next) => {
    try {
      return res.json(
        await checkNicknameAvailability({
          userId:
            req.session.user.id,
          requestId:
            req.body.requestId,
          token:
            req.body.token,
          nickname:
            req.body.nickname,
        })
      );
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .json({
            available: false,
            message:
              error.message,
            proof: "",
          });
      }

      return next(error);
    }
  };

exports.completeNicknameChange =
  async (req, res, next) => {
    try {
      const user =
        await completeNicknameChange({
          userId:
            req.session.user.id,
          requestId:
            req.body.requestId,
          token:
            req.body.token,
          nickname:
            req.body.nickname,
          proof:
            req.body.proof,
        });

      req.session.user.name =
        user.name;
      await saveSession(req);

      return res.redirect(
        "/profile?nicknameChanged=1"
      );
    } catch (error) {
      if (error.status) {
        try {
          return await renderNicknameChangePage(
            req,
            res,
            {
              status:
                error.status,
              error:
                error.message,
              nickname:
                req.body.nickname,
            }
          );
        } catch (
          renderError
        ) {
          return next(
            renderError
          );
        }
      }

      return next(error);
    }
  };

exports.changeRankingIdentity = async (
    req,
    res,
    next
) => {
    try {
        const rankingDisplayMode =
            normalizeRankingDisplayMode(
                req.body.rankingDisplayMode
            );
        const formValues = {
            rankingDisplayMode:
                rankingDisplayMode ||
                String(
                    req.body.rankingDisplayMode || ""
                ),
        };

        if (!rankingDisplayMode) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "ranking-identity",
                    type: "error",
                    message:
                        "랭킹에 표시할 이름 방식을 선택해주세요.",
                },
                formValues,
            });
        }

        const existingUser = await User.findById(
            req.session.user.id
        )
            .select("realName")
            .lean();

        if (!existingUser) {
            throw createNotFoundError(
                "사용자 정보를 찾을 수 없습니다."
            );
        }

        if (
            rankingDisplayMode === "realName" &&
            !String(existingUser.realName || "").trim()
        ) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "ranking-identity",
                    type: "error",
                    message:
                        "회원가입 때 등록한 실명이 없어 실명으로 표시할 수 없습니다.",
                },
                formValues,
            });
        }

        const user = await User.findByIdAndUpdate(
            req.session.user.id,
            {
                "preferences.rankingDisplayMode":
                    rankingDisplayMode,
            },
            {
                new: true,
                runValidators: true,
            }
        ).lean();

        if (!user) {
            throw createNotFoundError(
                "사용자 정보를 찾을 수 없습니다."
            );
        }

        req.session.user.realName =
            user.realName || "";
        req.session.user.preferences = {
            ...(req.session.user.preferences ||
                {}),
            rankingDisplayMode:
                user.preferences
                    ?.rankingDisplayMode ||
                "nickname",
        };
        await saveSession(req);

        return await renderProfile(req, res, {
            feedback: {
                section: "ranking-identity",
                type: "success",
                message:
                    rankingDisplayMode ===
                    "realName"
                        ? "랭킹에서 실명을 표시하도록 저장했습니다."
                        : "랭킹에서 닉네임을 표시하도록 저장했습니다.",
            },
        });
    } catch (error) {
        return next(error);
    }
};

exports.changeSchool = async (req, res, next) => {
    try {
        const schoolRegion = String(
            req.body.schoolRegion || ""
        ).trim();
        const schoolCode = String(
            req.body.schoolCode || ""
        ).trim();
        const formValues = {
            schoolRegion,
            schoolCode,
        };

        if (!schoolRegion || !schoolCode) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "school",
                    type: "error",
                    message:
                        "변경할 지역과 고등학교를 선택해주세요.",
                },
                formValues,
            });
        }

        const selectedSchool = findSchool(
            schoolRegion,
            schoolCode
        );

        if (!selectedSchool) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "school",
                    type: "error",
                    message:
                        "학교 목록에서 올바른 고등학교를 선택해주세요.",
                },
                formValues,
            });
        }

        const school = {
            region: selectedSchool.region,
            code: selectedSchool.code,
            name: selectedSchool.name,
            roadAddress:
                selectedSchool.roadAddress || "",
            establishment:
                selectedSchool.establishment || "",
            highSchoolType:
                selectedSchool.highSchoolType || "",
        };

        const user = await User.findByIdAndUpdate(
            req.session.user.id,
            { school },
            {
                new: true,
                runValidators: true,
            }
        ).lean();

        if (!user) {
            throw createNotFoundError(
                "사용자 정보를 찾을 수 없습니다."
            );
        }

        req.session.user.school = {
            region: user.school.region,
            code: user.school.code,
            name: user.school.name,
        };
        await saveSession(req);

        return await renderProfile(req, res, {
            feedback: {
                section: "school",
                type: "success",
                message: `${user.school.name}(으)로 변경했습니다.`,
            },
        });
    } catch (error) {
        return next(error);
    }
};

exports.changePassword = async (req, res, next) => {
    try {
        const currentPassword = String(
            req.body.currentPassword || ""
        );
        const newPassword = String(
            req.body.newPassword || ""
        );
        const newPasswordConfirm = String(
            req.body.newPasswordConfirm || ""
        );

        if (
            !currentPassword ||
            !newPassword ||
            !newPasswordConfirm
        ) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "password",
                    type: "error",
                    message:
                        "현재 비밀번호와 새 비밀번호를 모두 입력해주세요.",
                },
            });
        }

        if (newPassword.length < 8) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "password",
                    type: "error",
                    message:
                        "새 비밀번호는 8자 이상이어야 합니다.",
                },
            });
        }

        if (
            Buffer.byteLength(
                newPassword,
                "utf8"
            ) > 72
        ) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "password",
                    type: "error",
                    message:
                        "새 비밀번호가 너무 깁니다.",
                },
            });
        }

        if (newPassword !== newPasswordConfirm) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "password",
                    type: "error",
                    message:
                        "새 비밀번호와 비밀번호 확인이 일치하지 않습니다.",
                },
            });
        }

        const user = await User.findById(
            req.session.user.id
        ).select("+passwordHash");

        if (!user) {
            throw createNotFoundError(
                "사용자 정보를 찾을 수 없습니다."
            );
        }

        const currentPasswordMatched =
            await bcrypt.compare(
                currentPassword,
                user.passwordHash
            );

        if (!currentPasswordMatched) {
            return await renderProfile(req, res, {
                status: 401,
                feedback: {
                    section: "password",
                    type: "error",
                    message:
                        "현재 비밀번호가 올바르지 않습니다.",
                },
            });
        }

        const sameAsCurrent =
            await bcrypt.compare(
                newPassword,
                user.passwordHash
            );

        if (sameAsCurrent) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "password",
                    type: "error",
                    message:
                        "새 비밀번호는 현재 비밀번호와 다르게 설정해주세요.",
                },
            });
        }

        user.passwordHash = await bcrypt.hash(
            newPassword,
            BCRYPT_ROUNDS
        );
        user.tokenVersion =
            (Number(user.tokenVersion) || 0) + 1;
        await user.save();

        return await renderProfile(req, res, {
            feedback: {
                section: "password",
                type: "success",
                message: "비밀번호를 안전하게 변경했습니다.",
            },
        });
    } catch (error) {
        return next(error);
    }
};

exports.loggedCurriculumPage = async (req, res, next) => {
  try {
    const { learningData } = await getUserLearningData(
      req.session.user.id
    );

    return res.render("log-curriculum", {
      user: req.session.user,
      learningData,
    });
  } catch (error) {
    return next(error);
  }
};

exports.assessmentCenterPage = async (
  req,
  res,
  next
) => {
  try {
    res.set(
      "Cache-Control",
      "no-store"
    );

    const assessmentData =
      await getAssessmentCenterData(
        req.session.user.id
      );

    return res.render(
      "assessment-center",
      {
        user: req.session.user,
        assessmentData,
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.startAssessment = async (
  req,
  res,
  next
) => {
  try {
    const attempt =
      await createAssessmentAttempt({
        userId:
          req.session.user.id,
        scopeType: String(
          req.body?.scopeType || ""
        ),
        courseId: String(
          req.body?.courseId || ""
        ),
        unitId:
          String(
            req.body?.unitId || ""
          ) || null,
        subunitId:
          String(
            req.body?.subunitId || ""
          ) || null,
      });

    return res.redirect(
      `/assessments/${attempt._id}`
    );
  } catch (error) {
    return next(error);
  }
};

exports.assessmentAttemptPage = async (
  req,
  res,
  next
) => {
  try {
    res.set(
      "Cache-Control",
      "no-store"
    );

    const attempt =
      await getAssessmentAttempt({
        userId:
          req.session.user.id,
        attemptId:
          req.params.attemptId,
      });

    return res.render(
      "assessment-attempt",
      {
        user: req.session.user,
        attempt,
        difficultyLabels:
          DIFFICULTY_LABELS,
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.submitAssessment = async (
  req,
  res,
  next
) => {
  try {
    const attempt =
      await submitAssessmentAttempt({
        userId:
          req.session.user.id,
        attemptId:
          req.params.attemptId,
        answers:
          req.body?.answers || {},
      });

    const activityUser =
      await recordStudyActivity(
        req.session.user.id,
        attempt.submittedAt ||
          new Date(),
        attempt.elapsedTimeMs
      );
    Object.assign(
      req.session.user,
      lifecycleSessionView(activityUser)
    );

    return res.redirect(
      `/assessments/${attempt._id}`
    );
  } catch (error) {
    return next(error);
  }
};

exports.saveAssessmentDraft = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await saveAssessmentDraft({
        userId:
          req.session.user.id,
        attemptId:
          req.params.attemptId,
        answers:
          req.body?.answers || {},
      });

    return res.json(result);
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({
          message: error.message,
        });
    }

    return next(error);
  }
};

exports.expireAssessment = async (
  req,
  res,
  next
) => {
  try {
    const attempt =
      await expireAssessmentAttempt({
        userId:
          req.session.user.id,
        attemptId:
          req.params.attemptId,
        answers:
          req.body?.answers || {},
      });
    if (
      !attempt.$locals
        ?.wasAlreadyFinalized
    ) {
      const activityUser =
        await recordStudyActivity(
          req.session.user.id,
          attempt.submittedAt ||
            new Date(),
          attempt.elapsedTimeMs
        );
      Object.assign(
        req.session.user,
        lifecycleSessionView(
          activityUser
        )
      );
    }

    return res.json({
      status: attempt.status,
      expired:
        attempt.status ===
        "disqualified",
      redirectUrl:
        `/assessments/${attempt._id}`,
    });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({
          message: error.message,
          remainingTimeMs:
            error.remainingTimeMs,
        });
    }

    return next(error);
  }
};

exports.wrongNotesPage = async (req, res, next) => {
  try {
    const wrongNoteData = await getWrongNoteData(
      req.session.user.id,
      req.query
    );

    return res.render("wrong-notes", {
      user: req.session.user,
      wrongNoteData,
    });
  } catch (error) {
    return next(error);
  }
};

exports.wrongNoteReviewPage = async (
  req,
  res,
  next
) => {
  try {
    const reviewItem =
      await getWrongNoteReviewData({
        userId: req.session.user.id,
        attemptId: req.params.attemptId,
      });

    return res.render("wrong-note-review", {
      user: req.session.user,
      reviewItem,
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateTopicCompletion = async (req, res, next) => {
  try {
    const progress = await updateTopicCompletion({
      userId: req.session.user.id,
      courseId: req.params.courseId,
      unitId: req.params.unitId,
      conceptId: req.params.conceptId,
      topicIndex: req.params.topicIndex,
      completed: req.body.completed,
      sessionId: req.sessionID,
    });

    const activityUser =
      await recordStudyActivity(
        req.session.user.id
      );
    Object.assign(
      req.session.user,
      lifecycleSessionView(activityUser)
    );

    return res.json({ progress });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    return next(error);
  }
};

exports.nextPracticeProblem = async (
  req,
  res,
  next
) => {
  try {
    const result = await createNextProblem({
      req,
      userId: req.session.user.id,
      courseId: req.params.courseId,
      unitId: req.params.unitId,
      conceptId: req.params.conceptId,
      reviewAttemptId:
        req.query.reviewAttempt,
    });

    res.set("Cache-Control", "no-store");
    return res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    return next(error);
  }
};

exports.submitPracticeProblem = async (
  req,
  res,
  next
) => {
  try {
    const result = await submitProblem({
      req,
      userId: req.session.user.id,
      instanceId: req.body.instanceId,
      submittedAnswer: req.body.answer,
    });
    const activityDurationMs =
      Number(
        result.activityDurationMs
      ) || 0;
    delete result.activityDurationMs;

    const activityUser =
      await recordStudyActivity(
        req.session.user.id,
        new Date(),
        activityDurationMs
      );
    Object.assign(
      req.session.user,
      lifecycleSessionView(activityUser)
    );

    return res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    return next(error);
  }
};

exports.changeConceptCompletion = async (
  req,
  res,
  next
) => {
  try {
    if (typeof req.body.completed !== "boolean") {
      return res.status(400).json({
        message:
          "completed 값은 boolean이어야 합니다.",
      });
    }

    const mastery = await changeCompletion({
      userId: req.session.user.id,
      courseId: req.params.courseId,
      unitId: req.params.unitId,
      conceptId: req.params.conceptId,
      completed: req.body.completed,
      sessionId: req.sessionID,
    });

    const activityUser =
      await recordStudyActivity(
        req.session.user.id
      );
    Object.assign(
      req.session.user,
      lifecycleSessionView(activityUser)
    );

    return res.json({ mastery });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    return next(error);
  }
};

exports.quickPracticePage = async (
  req,
  res,
  next
) => {
  try {
    return res.render(
      "quick-practice",
      {
        user: req.session.user,
        catalog:
          getQuickPracticeCatalogSummary(),
        stats:
          await getQuickPracticeStats(
            req.session.user.id
          ),
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.startQuickPractice = async (
  req,
  res,
  next
) => {
  try {
    const attempt =
      await createQuickPracticeAttempt({
        userId:
          req.session.user.id,
        pointValue:
          req.body.pointValue,
      });

    res.set(
      "Cache-Control",
      "no-store"
    );
    return res.status(201).json({
      timeLimitMs: 40000,
      attempt,
    });
  } catch (error) {
    return next(error);
  }
};

exports.submitQuickPractice = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await submitQuickPracticeAttempt({
        userId:
          req.session.user.id,
        instanceId:
          req.params.instanceId,
        submittedAnswer:
          req.body.answer,
      });
    const activityUser =
      await synchronizeUserLifecycle(
        req.session.user.id
      );

    Object.assign(
      req.session.user,
      lifecycleSessionView(
        activityUser
      )
    );

    return res.json({
      result,
      stats:
        await getQuickPracticeStats(
          req.session.user.id
        ),
    });
  } catch (error) {
    return next(error);
  }
};

exports.expireQuickPractice = async (
  req,
  res,
  next
) => {
  try {
    return res.json({
      result:
        await expireQuickPracticeAttempt({
          userId:
            req.session.user.id,
          instanceId:
            req.params.instanceId,
        }),
      stats:
        await getQuickPracticeStats(
          req.session.user.id
        ),
    });
  } catch (error) {
    return next(error);
  }
};

exports.coachSuggestionBoard =
  async (req, res, next) => {
    try {
      return res.render(
        "coach-suggestions",
        {
          user: req.session.user,
          board:
            await getSuggestionBoardData(
              req.session.user
            ),
          submitted:
            req.query.submitted ===
            "1",
          moderated:
            req.query.moderated ===
            "1",
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.submitCoachSuggestion =
  async (req, res, next) => {
    try {
      await createSuggestion({
        user: req.session.user,
        mode: req.body.mode,
        situation:
          req.body.situation,
        message: req.body.message,
      });

      return res.redirect(
        "/coach-suggestions?submitted=1"
      );
    } catch (error) {
      if (error.status) {
        const board =
          await getSuggestionBoardData(
            req.session.user
          );

        return res
          .status(error.status)
          .render(
            "coach-suggestions",
            {
              user:
                req.session.user,
              board,
              submitted: false,
              moderated: false,
              error:
                error.message,
              oldInput: {
                mode:
                  req.body.mode,
                situation:
                  req.body
                    .situation,
                message:
                  req.body.message,
              },
            }
          );
      }

      return next(error);
    }
  };

exports.moderateCoachSuggestion =
  async (req, res, next) => {
    try {
      await moderateSuggestion({
        adminUser:
          req.session.user,
        suggestionId:
          req.params.suggestionId,
        action: req.body.action,
        rejectionReason:
          req.body.rejectionReason,
      });

      return res.redirect(
        req.body.returnTo ===
          "admin"
          ? "/admin/coach-suggestions?moderated=1"
          : "/coach-suggestions?moderated=1"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.forgotPasswordPage = (
  req,
  res
) =>
  res.render("password-reset", {
    step: "request",
    error: null,
    email: "",
    previewCode: null,
  });

exports.openPasswordResetLink =
  async (req, res, next) => {
    try {
      const verification =
        await verifyPasswordResetLink({
          resetId:
            req.query.resetId,
          token: req.query.token,
        });

      req.session.passwordReset = {
        resetId:
          verification.resetId,
        userId:
          verification.userId,
        expiresAt:
          verification.expiresAt,
      };
      await saveSession(req);
      res.set({
        "Cache-Control":
          "no-store",
        "Referrer-Policy":
          "no-referrer",
      });

      return res.render(
        "password-reset",
        {
          step: "reset",
          error: null,
          email: "",
          previewCode: null,
        }
      );
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .render(
            "password-reset",
            {
              step: "request",
              error:
                error.message,
              email: "",
              previewCode: null,
            }
          );
      }

      return next(error);
    }
  };

exports.requestPasswordReset =
  async (req, res, next) => {
    const email = String(
      req.body.email || ""
    )
      .trim()
      .toLowerCase();

    try {
      const result =
        await requestPasswordReset(
          email
        );

      return res.render(
        "password-reset",
        {
          step: "verify",
          error: null,
          email,
          previewCode:
            result.previewCode,
        }
      );
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .render(
            "password-reset",
            {
              step: "request",
              error:
                error.message,
              email,
              previewCode: null,
            }
          );
      }

      return next(error);
    }
  };

exports.verifyPasswordReset =
  async (req, res, next) => {
    const email = String(
      req.body.email || ""
    )
      .trim()
      .toLowerCase();

    try {
      const verification =
        await verifyPasswordResetCode(
          {
            email,
            code: req.body.code,
          }
        );

      req.session.passwordReset = {
        resetId:
          verification.resetId,
        userId:
          verification.userId,
        expiresAt:
          verification.expiresAt,
      };
      await saveSession(req);

      return res.render(
        "password-reset",
        {
          step: "reset",
          error: null,
          email,
          previewCode: null,
        }
      );
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .render(
            "password-reset",
            {
              step: "verify",
              error:
                error.message,
              email,
              previewCode: null,
            }
          );
      }

      return next(error);
    }
  };

exports.completePasswordReset =
  async (req, res, next) => {
    const authorization =
      req.session.passwordReset;

    try {
      if (
        !authorization ||
        new Date(
          authorization.expiresAt
        ).getTime() <= Date.now()
      ) {
        const error = new Error(
          "비밀번호 재설정 인증이 만료되었습니다."
        );
        error.status = 400;
        throw error;
      }

      await resetPassword({
        resetId:
          authorization.resetId,
        userId:
          authorization.userId,
        password:
          req.body.password,
        passwordConfirm:
          req.body.passwordConfirm,
      });

      return req.session.destroy(
        (sessionError) => {
          if (sessionError) {
            return next(
              sessionError
            );
          }

          res.clearCookie(
            "connect.sid"
          );
          return res.redirect(
            "/login?reset=1"
          );
        }
      );
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .render(
            "password-reset",
            {
              step: "reset",
              error:
                error.message,
              email: "",
              previewCode: null,
            }
          );
      }

      return next(error);
    }
  };

exports.termsPage = (req, res) =>
  res.render("terms", {
    user:
      req.session?.user ||
      null,
  });

exports.privacyPage = (req, res) =>
  res.render("privacy", {
    user:
      req.session?.user ||
      null,
  });

exports.communityPage =
  async (req, res, next) => {
    try {
      return res.render(
        "community",
        {
          boardData:
            await getCommunityBoardData({
              viewer:
                req.session?.user ||
                null,
              board:
                req.query.board ||
                (Number(
                  req.session?.user
                    ?.schoolGrade
                ) === 13
                  ? "retaker"
                  : "high-school"),
              search:
                req.query.search,
              page:
                req.query.page,
              sort:
                req.query.sort,
              category:
                req.query.category,
            }),
          user:
            req.session?.user ||
            null,
          feedback:
            req.query.created ===
            "1"
              ? "게시글을 등록했습니다."
              : null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.communityAnnouncementPage =
  async (req, res, next) => {
    try {
      return res.render(
        "community-announcement",
        {
          user:
            req.session?.user ||
            null,
          announcement:
            await getCommunityAnnouncement(
              req.params
                .announcementId
            ),
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.communityNoticePage =
  async (req, res, next) => {
    try {
      return res.render(
        "community-notice",
        {
          user:
            req.session?.user ||
            null,
          notice:
            await getCommunityNotice({
              noticeId:
                req.params.noticeId,
              viewerId:
                req.session?.user
                  ?.id || null,
            }),
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.communityRulesPage =
  async (req, res, next) => {
    try {
      const viewerSchool =
        req.session?.user
          ?.school;
      if (
        req.params.boardType ===
          "school" &&
        !viewerSchool?.code
      ) {
        const error = new Error(
          "학교 게시판 운영 규칙은 해당 고등학교 소속 학생만 열람할 수 있습니다."
        );
        error.status = 403;
        throw error;
      }
      if (
        req.params.boardType ===
          "retaker" &&
        Number(
          req.session?.user
            ?.schoolGrade
        ) !== 13 &&
        req.session?.user?.role !==
          "admin"
      ) {
        const error = new Error(
          "N수생 게시판 운영 규칙은 현재 N수생으로 등록된 회원만 열람할 수 있습니다."
        );
        error.status = 403;
        throw error;
      }
      const schoolCode =
        req.params.boardType ===
        "school"
          ? viewerSchool.code
          : "";
      const schoolName =
        req.params.boardType ===
        "school"
          ? viewerSchool.name
          : "";

      return res.render(
        "community-rules",
        {
          user:
            req.session?.user ||
            null,
          rules:
            getCommunityBoardRules({
              board:
                req.params
                  .boardType,
              schoolCode,
              schoolName,
            }),
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.communityNewPage =
  async (req, res, next) => {
    try {
      return res.render(
        "community-new",
        {
          user:
            req.session.user,
          error: null,
          postingAccess:
            await getCommunityPostingAccess(
              req.session.user.id
            ),
          oldInput: {
            board:
              req.query.board ||
              (Number(
                req.session.user
                  .schoolGrade
              ) === 13
                ? "retaker"
                : "high-school"),
            title: "",
            content: "",
            isAnonymous:
              false,
          },
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.submitCommunityPost =
  async (req, res, next) => {
    try {
      if (
        req.communityUploadError
      ) {
        const uploadError =
          req.communityUploadError;
        if (
          uploadError.code ===
          "LIMIT_FILE_SIZE"
        ) {
          uploadError.message =
            "첨부파일 한 개의 용량은 최대 10MB입니다.";
        } else if (
          uploadError.code ===
          "LIMIT_FILE_COUNT" ||
          uploadError.code ===
          "LIMIT_UNEXPECTED_FILE"
        ) {
          uploadError.message =
            "사진과 파일은 게시글 하나에 최대 5개까지 첨부할 수 있습니다.";
        }
        uploadError.status =
          uploadError.status ||
          400;
        throw uploadError;
      }

      const post =
        await createCommunityPost({
          userId:
            req.session.user.id,
          board:
            req.body.board,
          title:
            req.body.title,
          content:
            req.body.content,
          isAnonymous:
            req.body
              .isAnonymous,
          files:
            req.files || [],
        });

      return res.redirect(
        `/community/${post._id}?created=1`
      );
    } catch (error) {
      await discardCommunityUploads(
        req.files || []
      );
      if (error.status) {
        let postingAccess;
        try {
          postingAccess =
            await getCommunityPostingAccess(
              req.session.user.id
            );
        } catch (accessError) {
          return next(
            accessError
          );
        }
        return res
          .status(error.status)
          .render(
            "community-new",
            {
              user:
                req.session.user,
              error:
                error.message,
              postingAccess,
              oldInput: {
                board:
                  req.body.board,
                title:
                  req.body.title,
                content:
                  req.body.content,
                isAnonymous:
                  req.body
                    .isAnonymous ===
                  "on",
              },
            }
          );
      }

      return next(error);
    }
  };

exports.communityAttachmentFile =
  async (req, res, next) => {
    try {
      const attachment =
        await getCommunityAttachment({
          postId:
            req.params.postId,
          attachmentId:
            req.params
              .attachmentId,
          viewerId:
            req.session?.user
              ?.id || null,
        });
      const shouldDownload =
        req.query.download ===
          "1" ||
        !attachment.isImage;
      res.setHeader(
        "X-Content-Type-Options",
        "nosniff"
      );

      if (attachment.cloudUrl) {
        res.setHeader("Cache-Control", "private, no-store");
        return res.redirect(302, attachment.cloudUrl);
      }

      if (shouldDownload) {
        return res.download(
          attachment.filePath,
          attachment.originalName
        );
      }

      res.type(
        attachment.mimeType
      );
      res.setHeader(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(
          attachment.originalName
        )}`
      );
      return res.sendFile(
        attachment.filePath
      );
    } catch (error) {
      return next(error);
    }
  };

exports.communityPostPage =
  async (req, res, next) => {
    try {
      const detail =
        await getCommunityPost(
          req.params.postId,
          req.session?.user?.id ||
            null
        );

      return res.render(
        "community-post",
        {
          post: detail.post,
          comments:
            detail.comments,
          viewerVote:
            detail.viewerVote,
          viewerReported:
            detail.viewerReported,
          user:
            req.session?.user ||
            null,
          created:
            req.query.created ===
            "1",
          commentCreated:
            req.query.comment ===
            "created",
          reported:
            req.query.reported ===
            "1",
          commentError:
            null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.submitCommunityComment =
  async (req, res, next) => {
    try {
      await createCommunityComment({
        userId:
          req.session.user.id,
        postId:
          req.params.postId,
        content:
          req.body.content,
        isAnonymous:
          req.body
            .isAnonymous,
      });

      return res.redirect(
        `/community/${req.params.postId}?comment=created#comments`
      );
    } catch (error) {
      if (error.status) {
        try {
          const detail =
            await getCommunityPost(
              req.params.postId,
              req.session.user.id
            );

          return res
            .status(error.status)
            .render(
              "community-post",
              {
                post:
                  detail.post,
                comments:
                  detail.comments,
                viewerVote:
                  detail.viewerVote,
                viewerReported:
                  detail.viewerReported,
                user:
                  req.session.user,
                created: false,
                commentCreated:
                  false,
                commentError:
                  error.message,
                reported: false,
                commentDraft:
                  req.body.content,
                commentAnonymousDraft:
                  req.body
                    .isAnonymous ===
                  "on",
              }
            );
        } catch (
          renderError
        ) {
          return next(
            renderError
          );
        }
      }

      return next(error);
    }
  };

exports.submitCommunityVote =
  async (req, res, next) => {
    try {
      const result =
        await voteCommunityPost({
          userId:
            req.session.user.id,
          postId:
            req.params.postId,
          value:
            req.body.value,
        });

      if (
        req.accepts([
          "json",
          "html",
        ]) === "json"
      ) {
        return res.json(result);
      }

      return res.redirect(
        `/community/${req.params.postId}#post-votes`
      );
    } catch (error) {
      return next(error);
    }
  };

exports.submitCommunityReport =
  async (req, res, next) => {
    try {
      await reportCommunityPost({
        userId:
          req.session.user.id,
        postId:
          req.params.postId,
        reason:
          req.body.reason,
      });
      return res.redirect(
        `/community/${req.params.postId}?reported=1`
      );
    } catch (error) {
      return next(error);
    }
  };

function adminCommunityRedirect(
  done,
  reportId = ""
) {
  const cleanReportId =
    String(reportId || "").replace(
      /[^a-fA-F0-9]/g,
      ""
    );
  return `/admin/community?done=${encodeURIComponent(
    done
  )}${
    cleanReportId
      ? `#report-${cleanReportId}`
      : ""
  }`;
}

async function resolveModeratedCommunityReport({
  req,
  actionLabel,
}) {
  if (!req.body.reportId) {
    return;
  }
  await reviewCommunityReport({
    adminUserId:
      req.session.user.id,
    reportId:
      req.body.reportId,
    status: "resolved",
    resolution:
      `신고 검토 후 ${actionLabel}: ${String(
        req.body.reason || ""
      ).trim()}`,
  });
}

exports.adminCommunityPage =
  async (req, res, next) => {
    try {
      return res.render(
        "admin-community",
        {
          user:
            req.session.user,
          communityData:
            await getAdminCommunityData({
              board:
                req.query.board,
              status:
                req.query.status,
              search:
                req.query.search,
              page:
                req.query.page,
            }),
          feedback:
            adminFeedbackFromQuery(
              req.query
            ),
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminCreateCommunityNotice =
  async (req, res, next) => {
    try {
      await createCommunityNotice({
        adminUserId:
          req.session.user.id,
        board:
          req.body.board,
        schoolCode:
          req.body.schoolCode,
        schoolName:
          req.body.schoolName,
        title:
          req.body.title,
        content:
          req.body.content,
      });
      return res.redirect(
        adminCommunityRedirect(
          "communityNoticeCreated"
        )
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminUpdateCommunityNotice =
  async (req, res, next) => {
    try {
      await updateCommunityNotice({
        adminUserId:
          req.session.user.id,
        noticeId:
          req.params.noticeId,
        board:
          req.body.board,
        schoolCode:
          req.body.schoolCode,
        schoolName:
          req.body.schoolName,
        title:
          req.body.title,
        content:
          req.body.content,
      });
      return res.redirect(
        adminCommunityRedirect(
          "communityNoticeUpdated"
        )
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminSetCommunityNoticePinned =
  async (req, res, next) => {
    try {
      const notice =
        await setCommunityNoticePinned({
          adminUserId:
            req.session.user.id,
          noticeId:
            req.params.noticeId,
          pinned:
            req.body.pinned ===
            "true",
        });
      return res.redirect(
        adminCommunityRedirect(
          notice.isPinned
            ? "communityNoticePinned"
            : "communityNoticeUnpinned"
        )
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminModerateCommunityNotice =
  async (req, res, next) => {
    try {
      await moderateCommunityNotice({
        adminUserId:
          req.session.user.id,
        noticeId:
          req.params.noticeId,
        action:
          req.body.action,
      });
      return res.redirect(
        adminCommunityRedirect(
          "communityNoticeModerated"
        )
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminReviewCommunityReport =
  async (req, res, next) => {
    try {
      await reviewCommunityReport({
        adminUserId:
          req.session.user.id,
        reportId:
          req.params.reportId,
        status:
          req.body.status,
        resolution:
          req.body.resolution,
      });
      return res.redirect(
        adminCommunityRedirect(
          "communityReport",
          req.params.reportId
        )
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminTodosPage =
  async (req, res, next) => {
    try {
      return res.render(
        "admin-todos",
        {
          user:
            req.session.user,
          todoData:
            await getAdminTodoData({
              category:
                req.query.category,
              status:
                req.query.status,
              page:
                req.query.page,
              dateFrom:
                req.query.dateFrom,
              dateTo:
                req.query.dateTo,
              nickname:
                req.query.nickname,
            }),
          feedback:
            req.query.reopened ===
            "1"
              ? "선택한 할 일을 재검토 대상으로 되돌렸습니다."
              : req.query.done ===
                  "1"
              ? "선택한 할 일을 완료 처리했습니다."
              : null,
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminCompleteTodo =
  async (req, res, next) => {
    try {
      await completeAdminTodo({
        todoId:
          req.params.todoId,
        adminUserId:
          req.session.user.id,
      });
      return res.redirect(
        "/admin/todos?done=1"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminReopenTodo =
  async (req, res, next) => {
    try {
      await reopenAdminTodo({
        todoId:
          req.params.todoId,
        adminUserId:
          req.session.user.id,
      });
      return res.redirect(
        "/admin/todos?status=pending&reopened=1"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminEditCommunityPost =
  async (req, res, next) => {
    try {
      await updateCommunityPostByAdmin({
        adminUserId:
          req.session.user.id,
        postId:
          req.params.postId,
        title:
          req.body.title,
        content:
          req.body.content,
        reason:
          req.body.reason,
      });

      return res.redirect(
        adminCommunityRedirect(
          "communityEdit",
          req.body.reportId
        )
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminSetCommunityPostPinned =
  async (req, res, next) => {
    try {
      const result =
        await setCommunityPostPinned({
          adminUserId:
            req.session.user.id,
          postId:
            req.params.postId,
          pinned:
            req.body.pinned ===
            "true",
        });

      return res.redirect(
        adminCommunityRedirect(
          result.isPinned
            ? "communityPinned"
            : "communityUnpinned",
          req.body.reportId
        )
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminModerateCommunityPost =
  async (req, res, next) => {
    try {
      const action =
        req.body.action;
      await moderateCommunityPost({
        adminUserId:
          req.session.user.id,
        postId:
          req.params.postId,
        action,
        reason:
          req.body.reason,
      });

      if (
        req.body.reportId &&
        ["hide", "delete"].includes(
          action
        )
      ) {
        await resolveModeratedCommunityReport({
          req,
          actionLabel:
            action === "delete"
              ? "게시글 DB 삭제"
              : "게시글 숨김",
        });
      }

      return res.redirect(
        adminCommunityRedirect(
          "communityModeration",
          req.body.reportId
        )
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminWarnCommunityPost =
  async (req, res, next) => {
    try {
      const result =
        await warnCommunityPost({
          adminUserId:
            req.session.user.id,
          postId:
            req.params.postId,
          reason:
            req.body.reason,
        });

      await resolveModeratedCommunityReport({
        req,
        actionLabel:
          "게시글 숨김 및 작성자 경고 +1",
      });

      return res.redirect(
        adminCommunityRedirect(
          result.autoSuspended
            ? "communitySuspended"
            : "communityWarning",
          req.body.reportId
        )
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminModerateCommunityComment =
  async (req, res, next) => {
    try {
      await moderateCommunityComment({
        adminUserId:
          req.session.user.id,
        commentId:
          req.params.commentId,
        action:
          req.body.action,
        reason:
          req.body.reason,
      });

      return res.redirect(
        "/admin/community?done=communityCommentModeration#comments"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.adminWarnCommunityComment =
  async (req, res, next) => {
    try {
      const result =
        await warnCommunityComment({
          adminUserId:
            req.session.user.id,
          commentId:
            req.params.commentId,
          reason:
            req.body.reason,
        });

      return res.redirect(
        `/admin/community?done=${
          result.autoSuspended
            ? "communityCommentSuspended"
            : "communityCommentWarning"
        }#comments`
      );
    } catch (error) {
      return next(error);
    }
  };
