const {
  AdminActionLog,
  Announcement,
  ArchiveFolder,
  ArchiveItem,
  AssessmentAttempt,
  ConceptProgress,
  CommunityPost,
  LearningEvent,
  ProblemAttempt,
  QuickPracticeAttempt,
  SupportInquiry,
  User,
  UserNotification,
} = require("../models/matthsModel");
const mongoose = require("mongoose");
const { Academy } = require("../models/academyModel");
const {
  CheckoutIntent,
  ParentAccount,
  ParentAlertDelivery,
  ParentChildLink,
} = require("../models/parentModel");
const {
  updateParentNotificationSettings,
} = require("./parentFamilyService");
const {
  sendAdminUserEmail,
  sendSupportReply,
} = require("./emailService");
const {
  getRankingData,
} = require("./rankingService");
const {
  getDashboardData,
} = require("./dashboardService");
const {
  requestPasswordResetLink,
} = require("./passwordResetService");
const {
  deliverModerationNotice,
} = require("./moderationNoticeService");
const {
  createNicknameChangeRequest,
} = require("./nicknameService");
const {
  normalizeRetentionChoice,
  withdrawUserAccount,
} = require("./accountDeletionService");
const {
  completeAdminTodoBySource,
} = require("./adminTodoService");
const {
  getAdminPackageAccessSummary,
} = require("./adminPackageAccessService");
const {
  getWeeklyMockExamAccess,
} = require("./paidFeatureAccessService");
const {
  getUserArenaBadges,
} = require("./arenaBadgeService");
const {
  getActiveAdminSender,
} = require("./adminIdentityService");
const {
  createUserAppliedAdminAuditFilter,
} = require("./adminAuditPolicyService");
const {
  getFinanceDashboardData,
} = require("./financeService");
const {
  findCurriculumConcept,
  loadCurriculum,
} = require("./curriculumService");
const {
  expireOverdueAssessmentAttempts,
} = require("./assessmentService");
const {
  expireOverduePlacementAttempts,
} = require("./placementExamService");
const {
  getEffectiveStreak,
} = require("./userLifecycleService");
const {
  getArenaActivityLevel,
  getArenaActivityLevels,
} = require("./arenaActivityLevelService");
const {
  getAdminUserRecentArenaMatches,
} = require("./adminArenaMatchHistoryService");
const accountEmailCopy =
  require("../content/email/account");

const USERS_PER_PAGE = 20;
const INQUIRIES_PER_PAGE = 20;
const USER_ACTIVITY_PAGE_SIZE = 50;
const SANCTIONS_PER_PAGE = 20;
const ADMIN_AUDIT_PER_PAGE = 20;

const SANCTION_ACTION_FILTER = {
  $or: [
    {
      action: {
        $in: [
          "user.deactivate",
          "user.restore",
          "user.account-status",
          "user.account-withdrawal",
          "user.warning-count",
          "user.nickname-request",
        ],
      },
    },
    { action: /^community\.(?:post|comment)-(?:hide|restore|delete|warning)$/ },
    { action: /^arena\.integrity\./ },
    { action: /^private-mock\.integrity-/ },
  ],
};

function sanctionActionLabel(action) {
  const exact = {
    "user.deactivate": "계정 비활성화",
    "user.restore": "계정 복구",
    "user.account-status": "계정 상태 변경",
    "user.account-withdrawal": "관리자 계정 탈퇴 처리",
    "user.warning-count": "경고 횟수 변경",
    "user.nickname-request": "닉네임 변경 요청",
    "community.post-hide": "게시글 숨김",
    "community.post-restore": "게시글 복구",
    "community.post-delete": "게시글 삭제",
    "community.post-warning": "게시글 경고",
    "community.comment-hide": "댓글 숨김",
    "community.comment-restore": "댓글 복구",
    "community.comment-delete": "댓글 삭제",
    "community.comment-warning": "댓글 경고",
    "private-mock.integrity-penalty": "공식 모의고사 무결성 제재",
    "private-mock.integrity-review": "공식 모의고사 무결성 재검토",
  };
  if (exact[action]) return exact[action];
  if (/^arena\.integrity\./.test(action)) {
    if (/cleared$/.test(action)) return "Arena 무결성 제재 해제";
    if (/supplemental_requested/.test(action)) return "Arena 추가 소명 요청";
    if (/note$/.test(action)) return "Arena 무결성 검토 기록";
    return "Arena 무결성 제재";
  }
  return action;
}

function adminAuditActionLabel(action) {
  const exact = {
    "finance.payback-completed": "페이백 지급 완료",
    "finance.payback-email-resent": "페이백 이메일 재발송",
    "finance.business-withdrawal": "사업자 출금 기록",
    "finance.other-unpaid-costs": "기타 미지급 비용 변경",
    "user.email": "사용자 이메일 발송",
    "user.password-reset": "비밀번호 재설정 발송",
    "user.notification": "우편함 알림 발송",
    "user.package-access": "이용권·Division 권한 변경",
    "user.role": "회원 역할 변경",
    "academy.application-approved": "학원 등록 승인",
    "academy.application-rejected": "학원 등록 거절",
    "inquiry.reply": "문의 답변",
    "coach-suggestion.approve": "코치 문구 제안 승인",
    "coach-suggestion.reject": "코치 문구 제안 반려",
  };
  if (exact[action]) return exact[action];
  const sanctionLabel = sanctionActionLabel(action);
  if (sanctionLabel !== action) return sanctionLabel;
  if (/^user\./.test(action)) return "사용자 관리";
  if (/^academy\./.test(action)) return "학원 관리";
  if (/^community\./.test(action)) return "게시판 관리";
  if (/^arena\./.test(action)) return "GOAT Arena 관리";
  if (/^private-mock\./.test(action)) return "공식 모의고사 관리";
  if (/^(archive|store|problem)/.test(action)) return "콘텐츠 관리";
  return action;
}

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanSingleLine(
  value,
  maxLength = 200
) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanMultiline(
  value,
  maxLength = 5000
) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function escapeRegex(value) {
  return String(value || "").replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function safePage(value) {
  return Math.max(
    1,
    Number.parseInt(value, 10) || 1
  );
}

function safeInternalHref(value) {
  const href = cleanSingleLine(
    value,
    500
  );

  return /^\/(?!\/)/.test(href)
    ? href
    : "/main";
}

function getKstDateKey(
  date = new Date()
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(date);
  const values =
    Object.fromEntries(
      parts.map((part) => [
        part.type,
        part.value,
      ])
    );

  return [
    values.year,
    values.month,
    values.day,
  ].join("-");
}

function parseDashboardEndDate(
  value,
  now = new Date()
) {
  const dateKey =
    String(value || "").trim();

  if (!dateKey) {
    return null;
  }

  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      dateKey
    );

  if (!match) {
    throw statusError(
      400,
      "공지 노출 종료 날짜를 확인해주세요."
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarCheck =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  if (
    calendarCheck.getUTCFullYear() !==
      year ||
    calendarCheck.getUTCMonth() !==
      month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) {
    throw statusError(
      400,
      "존재하지 않는 날짜입니다. 공지 노출 종료 날짜를 다시 선택해주세요."
    );
  }

  if (
    dateKey < getKstDateKey(now)
  ) {
    throw statusError(
      400,
      "공지 노출 종료일은 한국시간 기준 오늘 또는 이후 날짜만 선택할 수 있습니다."
    );
  }

  // 선택한 날짜의 23:59:59.999(KST)까지 대시보드에 노출합니다.
  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      14,
      59,
      59,
      999
    )
  );
}

async function logAdminAction({
  adminUserId,
  targetUserId = null,
  action,
  detail = "",
  metadata = {},
}) {
  const actor = await getActiveAdminSender(adminUserId);
  await AdminActionLog.create({
    adminUserId,
    targetUserId,
    action,
    detail:
      cleanSingleLine(detail, 1000),
    metadata: {
      ...metadata,
      actorSnapshot: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
        loginAt: actor.loginAt,
      },
    },
  });
}

async function getAdminDashboardData() {
  const [
    activeUsers,
    activeParents,
    pendingInquiries,
    publishedAnnouncements,
    archiveItems,
    archiveFolders,
    inquiries,
    announcements,
    revenue,
    pendingAcademyCount,
    academyApplications,
  ] = await Promise.all([
    User.countDocuments({
      isActive: true,
      role: "student",
    }),
    ParentAccount.countDocuments({ isActive: true }),
    SupportInquiry.countDocuments({
      status: {
        $in: [
          "pending",
          "in_review",
        ],
      },
    }),
    Announcement.countDocuments({
      isPublished: true,
    }),
    ArchiveItem.countDocuments(),
    ArchiveFolder.countDocuments(),
    SupportInquiry.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    Announcement.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    getAdminRevenueMetrics(),
    Academy.countDocuments({ status: "PENDING" }),
    Academy.find({ status: "PENDING" })
      .sort({ createdAt: 1, _id: 1 })
      .limit(25)
      .populate("createdByUserId", "name realName email role isActive accountStatus")
      .lean(),
  ]);

  return {
    stats: {
      activeUsers,
      activeParents,
      pendingInquiries,
      publishedAnnouncements,
      archiveItems,
      archiveFolders,
      pendingAcademies: pendingAcademyCount,
    },
    academyApplications: academyApplications.filter((academy) => academy.createdByUserId),
    inquiries,
    announcements,
    revenue,
  };
}

async function getAdminRevenueMetrics(now = new Date()) {
  const finance = await getFinanceDashboardData({ now });
  return {
    ...finance,
    grossApproved: finance.grossPayments,
    netRevenue: finance.netCollected,
    updatedAt: finance.lastReconciledAt || now,
  };
}

async function deliverAnnouncementToInboxes(
  announcement
) {
  if (
    !announcement ||
    announcement.deliveredAt
  ) {
    return 0;
  }

  const recipients =
    await User.find({
      isActive: true,
      accountStatus: {
        $in: [
          "active",
          null,
        ],
      },
    })
      .select("_id")
      .lean();

  if (recipients.length) {
    await UserNotification.bulkWrite(
      recipients.map(
        (recipient) => ({
          updateOne: {
            filter: {
              userId:
                recipient._id,
              announcementId:
                announcement._id,
            },
            update: {
              $setOnInsert: {
                title:
                  String(
                    announcement.title ||
                      ""
                  ).slice(0, 100),
                message:
                  String(
                    announcement.content ||
                      ""
                  ).slice(
                    0,
                    1000
                  ),
                href:
                  safeInternalHref(
                    announcement.href
                  ),
                kind:
                  "announcement",
                createdBy:
                  announcement.createdBy,
                readAt: null,
              },
            },
            upsert: true,
          },
        })
      ),
      {
        ordered: false,
      }
    );
  }

  announcement.deliveredAt =
    new Date();
  await announcement.save();

  return recipients.length;
}

async function createAnnouncement({
  adminUserId,
  title,
  content,
  publishNow,
  href = "",
  dashboardEndDate = "",
  boardCategory = "notice",
}) {
  const rawTitle =
    cleanSingleLine(title, 120);
  const cleanContent =
    cleanMultiline(content, 5000);

  if (
    rawTitle.length < 2 ||
    cleanContent.length < 5
  ) {
    throw statusError(
      400,
      "공지 제목은 2자, 내용은 5자 이상 입력해주세요."
    );
  }

  const isPublished =
    String(publishNow) === "true" ||
    String(publishNow) === "on";
  const now = new Date();
  const datePrefix =
    new Intl.DateTimeFormat(
      "ko-KR",
      {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    )
      .format(now)
      .replace(/\s/g, "")
      .replace(/\.$/, "")
      .replace(/\./g, ".");
  const cleanTitle =
    `[${datePrefix}] - ${rawTitle}`.slice(
      0,
      120
    );
  const normalizedBoardCategory =
    [
      "notice",
      "rules",
      "policies",
      "manuals",
      "inquiry-rules",
    ].includes(
      String(
        boardCategory || ""
      )
    )
      ? String(boardCategory)
      : "notice";
  const dashboardEndsAt =
    parseDashboardEndDate(
      dashboardEndDate,
      now
    );
  const announcementId =
    new mongoose.Types.ObjectId();
  const announcement =
    await Announcement.create({
      _id: announcementId,
      title: cleanTitle,
      content: cleanContent,
      boardCategory:
        normalizedBoardCategory,
      href:
        String(href || "").trim()
          ? safeInternalHref(
              href
            )
          : `/community/operations/${announcementId}`,
      isPublished,
      publishedAt:
        isPublished
          ? now
          : null,
      dashboardEndsAt,
      createdBy: adminUserId,
    });

  if (isPublished) {
    await deliverAnnouncementToInboxes(
      announcement
    );
  }

  await logAdminAction({
    adminUserId,
    action:
      "announcement.create",
    detail: cleanTitle,
    metadata: {
      announcementId:
        String(
          announcement._id
        ),
      isPublished,
    },
  });

  return announcement;
}

async function toggleAnnouncement({
  adminUserId,
  announcementId,
  publish,
}) {
  const announcement =
    await Announcement.findById(
      announcementId
    );

  if (!announcement) {
    throw statusError(
      404,
      "공지를 찾을 수 없습니다."
    );
  }

  const isPublished =
    String(publish) === "true";
  announcement.isPublished =
    isPublished;
  announcement.publishedAt =
    isPublished
      ? announcement.publishedAt ||
        new Date()
      : null;
  if (!isPublished) {
    await UserNotification.deleteMany({
      announcementId:
        announcement._id,
    });
    announcement.deliveredAt =
      null;
  }
  await announcement.save();

  if (
    isPublished &&
    !announcement.deliveredAt
  ) {
    await deliverAnnouncementToInboxes(
      announcement
    );
  }

  await logAdminAction({
    adminUserId,
    action:
      isPublished
        ? "announcement.publish"
        : "announcement.unpublish",
    detail: announcement.title,
    metadata: {
      announcementId:
        String(
          announcement._id
      ),
    },
  });
}

async function getAdminInquiryData({
  status,
  page,
}) {
  const allowedStatuses = new Set([
    "pending",
    "in_review",
    "replied",
    "closed",
  ]);
  const normalizedStatus =
    String(status || "") ===
    "all"
      ? ""
      : allowedStatuses.has(
            String(status || "")
          )
        ? String(status)
        : "pending";
  const currentPage =
    safePage(page);
  const filter =
    normalizedStatus
      ? {
          status:
            normalizedStatus,
        }
      : {};
  const total =
    await SupportInquiry.countDocuments(
      filter
    );
  const totalPages = Math.max(
    1,
    Math.ceil(
      total /
        INQUIRIES_PER_PAGE
    )
  );
  const safeCurrentPage =
    Math.min(
      currentPage,
      totalPages
    );
  const inquiries =
    await SupportInquiry.find(filter)
      .sort({ createdAt: -1 })
      .skip(
        (safeCurrentPage - 1) *
          INQUIRIES_PER_PAGE
      )
      .limit(INQUIRIES_PER_PAGE)
      .lean();

  return {
    inquiries,
    status: normalizedStatus,
    page: safeCurrentPage,
    total,
    totalPages,
  };
}

async function replyToInquiry({
  adminUserId,
  inquiryId,
  message,
}) {
  const cleanMessage =
    cleanMultiline(message, 5000);

  if (cleanMessage.length < 5) {
    throw statusError(
      400,
      "답변은 5자 이상 입력해주세요."
    );
  }

  const inquiry =
    await SupportInquiry.findById(
      inquiryId
    );

  if (!inquiry) {
    throw statusError(
      404,
      "문의를 찾을 수 없습니다."
    );
  }

  const sender = await getActiveAdminSender(adminUserId);

  const delivery =
    await sendSupportReply({
      to: inquiry.contactEmail,
      subject: inquiry.subject,
      message: cleanMessage,
      fromAddress: sender.email,
    });

  inquiry.status = "replied";
  inquiry.adminReply = {
    message: cleanMessage,
    sentTo:
      inquiry.contactEmail,
    repliedAt: new Date(),
    repliedBy: adminUserId,
  };
  await inquiry.save();

  await logAdminAction({
    adminUserId,
    targetUserId:
      inquiry.userId,
    action: "inquiry.reply",
    detail: inquiry.subject,
    metadata: {
      inquiryId:
        String(inquiry._id),
      delivered:
        delivery.delivered,
      senderEmail: delivery.fromAddress,
      actingAdminEmail: sender.email,
      providerMessageId: delivery.providerMessageId || "",
    },
  });
  await completeAdminTodoBySource({
    sourceType:
      "SupportInquiry",
    sourceId:
      inquiry._id,
    adminUserId,
  });

  return delivery;
}

async function updateInquiryStatus({
  adminUserId,
  inquiryId,
  status,
}) {
  const allowed = new Set([
    "pending",
    "in_review",
    "replied",
    "closed",
  ]);

  if (!allowed.has(status)) {
    throw statusError(
      400,
      "변경할 수 없는 문의 상태입니다."
    );
  }

  const inquiry =
    await SupportInquiry.findByIdAndUpdate(
      inquiryId,
      {
        $set: { status },
      },
      {
        returnDocument: "after",
      }
    );

  if (!inquiry) {
    throw statusError(
      404,
      "문의를 찾을 수 없습니다."
    );
  }

  await logAdminAction({
    adminUserId,
    targetUserId:
      inquiry.userId,
    action: "inquiry.status",
    detail: status,
    metadata: {
      inquiryId:
        String(inquiry._id),
    },
  });
  if (
    ["replied", "closed"].includes(
      status
    )
  ) {
    await completeAdminTodoBySource({
      sourceType:
        "SupportInquiry",
      sourceId:
        inquiry._id,
      adminUserId,
    });
  }
}

function adminParentFilter({ cleanQuery, state, allowedStates }) {
  const filter = {};
  if (cleanQuery) {
    const expression = new RegExp(escapeRegex(cleanQuery), "i");
    filter.$or = [
      { username: expression },
      { email: expression },
    ];
  }
  if (allowedStates.has(state)) {
    if (state === "active") filter.isActive = true;
    else if (state === "inactive" || state === "withdrawn") {
      filter.isActive = false;
    } else {
      filter._id = null;
    }
  }
  return filter;
}

function adminParentRow(parent, linkCountByParent = new Map()) {
  return {
    _id: parent._id,
    adminEntityType: "PARENT",
    name: parent.username,
    email: parent.email,
    role: "parent",
    accountStatus: parent.isActive ? "active" : "inactive",
    isActive: parent.isActive,
    parentChildCount:
      linkCountByParent.get(String(parent._id)) || 0,
    lastLoginAt: parent.lastLoginAt,
    createdAt: parent.createdAt,
  };
}

function compareAdminUsersByCreatedAt(left, right) {
  const createdDifference =
    new Date(right?.createdAt || 0).getTime() -
    new Date(left?.createdAt || 0).getTime();
  if (createdDifference !== 0) return createdDifference;
  return String(right?._id || "").localeCompare(String(left?._id || ""));
}

async function getAdminUsersData({
  query,
  schoolCode,
  grade,
  state,
  role,
  page,
}) {
  const filter = {};
  const cleanQuery =
    cleanSingleLine(query, 100);

  if (cleanQuery) {
    const expression =
      new RegExp(
        escapeRegex(cleanQuery),
        "i"
      );
    filter.$or = [
      { name: expression },
      { realName: expression },
      { email: expression },
    ];
  }

  if (schoolCode) {
    filter["school.code"] =
      cleanSingleLine(
        schoolCode,
        80
      );
  }

  const gradeNumber =
    Number(grade);

  if (
    [10, 11, 12, 13, 14, 15].includes(
      gradeNumber
    )
  ) {
    filter.schoolGrade =
      gradeNumber;
  }

  const allowedStates =
    new Set([
      "active",
      "inactive",
      "suspended",
      "withdrawn",
    ]);

  if (
    allowedStates.has(state)
  ) {
    if (state === "active") {
      filter.$and = [
        {
          $or: [
            {
              accountStatus:
                "active",
            },
            {
              accountStatus: {
                $exists: false,
              },
              isActive: true,
            },
          ],
        },
      ];
    } else if (
      state === "inactive"
    ) {
      filter.$and = [
        {
          $or: [
            {
              accountStatus:
                "inactive",
            },
            {
              accountStatus: {
                $exists: false,
              },
              isActive: false,
            },
          ],
        },
      ];
    } else {
      filter.accountStatus =
        state;
    }
  }

  const allowedRoles =
    new Set([
      "student",
      "teacher",
      "admin",
      "test",
      "parent",
    ]);

  const isParentRole = role === "parent";
  const parentFilter = adminParentFilter({
    cleanQuery,
    state,
    allowedStates,
  });

  if (isParentRole) {
    const currentPage = safePage(page);
    const total = await ParentAccount.countDocuments(parentFilter);
    const totalPages = Math.max(1, Math.ceil(total / USERS_PER_PAGE));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const parents = await ParentAccount.find(parentFilter)
      .select("username email childUserId isActive lastLoginAt createdAt")
      .sort({ createdAt: -1 })
      .skip((safeCurrentPage - 1) * USERS_PER_PAGE)
      .limit(USERS_PER_PAGE)
      .lean();
    const parentIds = parents.map((parent) => parent._id);
    const links = parentIds.length
      ? await ParentChildLink.aggregate([
          { $match: { parentAccountId: { $in: parentIds }, status: "ACTIVE" } },
          { $group: { _id: "$parentAccountId", count: { $sum: 1 } } },
        ])
      : [];
    const linkCountByParent = new Map(
      links.map((entry) => [String(entry._id), Number(entry.count) || 0])
    );

    return {
      users: parents.map((parent) =>
        adminParentRow(parent, linkCountByParent)
      ),
      schools: [],
      filters: {
        query: cleanQuery,
        schoolCode: "",
        grade: "",
        state: allowedStates.has(state) ? state : "",
        role: "parent",
      },
      page: safeCurrentPage,
      total,
      totalPages,
      perPage: USERS_PER_PAGE,
    };
  }

  if (
    allowedRoles.has(role)
  ) {
    filter.role = role;
  }

  const hasEducationFilter = Boolean(
    schoolCode ||
      [10, 11, 12, 13, 14, 15].includes(gradeNumber)
  );
  const normalizedRole = allowedRoles.has(role) ? role : "";
  const includeParents = !normalizedRole && !hasEducationFilter;
  const currentPage = safePage(page);
  const [studentTotal, parentTotal, schools] = await Promise.all([
    User.countDocuments(filter),
    includeParents
      ? ParentAccount.countDocuments(parentFilter)
      : Promise.resolve(0),
    User.aggregate([
      {
        $match: {
          "school.code": {
            $type: "string",
          },
        },
      },
      {
        $group: {
          _id: "$school.code",
          name: {
            $first: "$school.name",
          },
        },
      },
      {
        $sort: {
          name: 1,
        },
      },
    ]),
  ]);
  const total = studentTotal + parentTotal;
  const totalPages = Math.max(
    1,
    Math.ceil(
      total / USERS_PER_PAGE
    )
  );
  const safeCurrentPage =
    Math.min(
      currentPage,
      totalPages
    );
  const pageOffset = (safeCurrentPage - 1) * USERS_PER_PAGE;
  const mergeLimit = safeCurrentPage * USERS_PER_PAGE;
  const studentQuery = User.find(filter)
    .select(
      "name realName email role school university schoolGrade isActive accountStatus accountStatusReason suspendedUntil warningCount totalStudySeconds currentStreak longestStreak lastStudyDate lastLoginAt createdAt"
    )
    .sort({ createdAt: -1, _id: -1 });
  if (includeParents) {
    studentQuery.limit(mergeLimit);
  } else {
    studentQuery.skip(pageOffset).limit(USERS_PER_PAGE);
  }
  const [studentRows, parentRows] = await Promise.all([
    studentQuery.lean(),
    includeParents
      ? ParentAccount.find(parentFilter)
          .select("username email childUserId isActive lastLoginAt createdAt")
          .sort({ createdAt: -1, _id: -1 })
          .limit(mergeLimit)
          .lean()
      : Promise.resolve([]),
  ]);
  const parentIds = parentRows.map((parent) => parent._id);
  const [parentLinkCounts, arenaActivityLevels] = await Promise.all([
    parentIds.length
      ? ParentChildLink.aggregate([
          {
            $match: {
              parentAccountId: { $in: parentIds },
              status: "ACTIVE",
            },
          },
          {
            $group: {
              _id: "$parentAccountId",
              count: { $sum: 1 },
            },
          },
        ])
      : Promise.resolve([]),
    getArenaActivityLevels(studentRows.map((student) => student._id)),
  ]);
  const linkCountByParent = new Map(
    parentLinkCounts.map((entry) => [
      String(entry._id),
      Number(entry.count) || 0,
    ])
  );
  const studentUsers = studentRows.map((student) => ({
    ...student,
    currentStreak: getEffectiveStreak(student),
    longestStreak: Math.max(0, Number(student.longestStreak) || 0),
    lastStudyDate: student.lastStudyDate || null,
    arenaActivityLevel:
      arenaActivityLevels.get(String(student._id)) ||
      null,
  }));
  const users = includeParents
    ? [
        ...studentUsers,
        ...parentRows.map((parent) =>
          adminParentRow(parent, linkCountByParent)
        ),
      ]
        .sort(compareAdminUsersByCreatedAt)
        .slice(pageOffset, pageOffset + USERS_PER_PAGE)
    : studentUsers;

  return {
    users,
    schools: schools.map(
      (school) => ({
        code: school._id,
        name: school.name,
      })
    ),
    filters: {
      query: cleanQuery,
      schoolCode:
        String(
          schoolCode || ""
        ),
      grade:
        [10, 11, 12, 13, 14, 15].includes(
          gradeNumber
        )
          ? gradeNumber
          : "",
      state:
        allowedStates.has(state)
          ? state
          : "",
      role:
        normalizedRole,
    },
    page: safeCurrentPage,
    total,
    totalPages,
    perPage: USERS_PER_PAGE,
  };
}

async function getAdminSanctionHistory({ page } = {}) {
  const requestedPage = safePage(page);
  const total = await AdminActionLog.countDocuments(SANCTION_ACTION_FILTER);
  const totalPages = Math.max(1, Math.ceil(total / SANCTIONS_PER_PAGE));
  const currentPage = Math.min(requestedPage, totalPages);
  const logs = await AdminActionLog.find(SANCTION_ACTION_FILTER)
    .sort({ createdAt: -1, _id: -1 })
    .skip((currentPage - 1) * SANCTIONS_PER_PAGE)
    .limit(SANCTIONS_PER_PAGE)
    .populate("adminUserId", "name realName email")
    .populate("targetUserId", "name realName email accountStatus")
    .lean();

  return {
    rows: logs.map((log) => ({
      ...log,
      actionLabel: sanctionActionLabel(log.action),
      actor: log.adminUserId || log.metadata?.actorSnapshot || null,
      target: log.targetUserId || null,
    })),
    pagination: {
      page: currentPage,
      perPage: SANCTIONS_PER_PAGE,
      total,
      totalPages,
    },
  };
}

async function getAdminAuditHistory({ page, adminUserId, query } = {}) {
  const requestedPage = safePage(page);
  const cleanQuery = cleanSingleLine(query, 120);
  const extraClauses = [];
  if (mongoose.isValidObjectId(adminUserId)) {
    extraClauses.push({ adminUserId });
  }
  if (cleanQuery) {
    const expression = new RegExp(escapeRegex(cleanQuery), "i");
    const matchingUsers = await User.find({
      $or: [
        { email: expression },
        { name: expression },
        { realName: expression },
      ],
    })
      .select("_id")
      .limit(200)
      .lean();
    const matchingUserIds = matchingUsers.map((user) => user._id);
    extraClauses.push({
      $or: [
        { action: expression },
        { detail: expression },
        { "metadata.actorSnapshot.email": expression },
        { "metadata.actorSnapshot.name": expression },
        ...(matchingUserIds.length
          ? [
              { adminUserId: { $in: matchingUserIds } },
              { targetUserId: { $in: matchingUserIds } },
            ]
          : []),
      ],
    });
  }
  const filter = createUserAppliedAdminAuditFilter(extraClauses);
  const [total, admins] = await Promise.all([
    AdminActionLog.countDocuments(filter),
    User.find({ role: "admin" })
      .select("name realName email isActive accountStatus")
      .sort({ isActive: -1, name: 1 })
      .lean(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_AUDIT_PER_PAGE));
  const currentPage = Math.min(requestedPage, totalPages);
  const logs = await AdminActionLog.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((currentPage - 1) * ADMIN_AUDIT_PER_PAGE)
    .limit(ADMIN_AUDIT_PER_PAGE)
    .lean();
  const relatedUserIds = [
    ...new Set(
      logs
        .flatMap((log) => [log.adminUserId, log.targetUserId])
        .filter(Boolean)
        .map(String)
    ),
  ];
  const relatedUsers = relatedUserIds.length
    ? await User.find({ _id: { $in: relatedUserIds } })
        .select("name realName email accountStatus")
        .lean()
    : [];
  const relatedUserMap = new Map(
    relatedUsers.map((relatedUser) => [String(relatedUser._id), relatedUser])
  );
  return {
    rows: logs.map((log) => ({
      ...log,
      actionLabel: adminAuditActionLabel(log.action),
      actor:
        relatedUserMap.get(String(log.adminUserId || "")) ||
        log.metadata?.actorSnapshot ||
        null,
      target: log.targetUserId
        ? relatedUserMap.get(String(log.targetUserId)) || {
            id: String(log.targetUserId),
            name: "탈퇴·삭제 사용자",
            email: "",
          }
        : log.metadata?.targetAccountPurged
          ? { name: "탈퇴·삭제 사용자", email: "" }
          : null,
    })),
    admins,
    filters: {
      adminUserId: mongoose.isValidObjectId(adminUserId) ? String(adminUserId) : "",
      query: cleanQuery,
    },
    pagination: {
      page: currentPage,
      perPage: ADMIN_AUDIT_PER_PAGE,
      total,
      totalPages,
    },
  };
}

function adminLearningProgressView(item, curriculumData) {
  if (!item) return null;
  const curriculumConcept = findCurriculumConcept(
    curriculumData,
    item.courseId,
    item.unitId,
    item.conceptId
  );

  return {
    ...item,
    courseTitle:
      curriculumConcept?.course?.officialTitle ||
      curriculumConcept?.course?.title ||
      item.courseId,
    unitTitle:
      curriculumConcept?.unit?.title || item.unitId,
    conceptTitle:
      curriculumConcept?.concept?.title || item.conceptId,
    href: `/learn/${encodeURIComponent(item.courseId)}/${encodeURIComponent(item.unitId)}/${encodeURIComponent(item.conceptId)}`,
  };
}

function selectCurrentLearningConcept({
  currentProgressRecord = null,
  progress = [],
  curriculumData,
}) {
  const current = adminLearningProgressView(
    currentProgressRecord,
    curriculumData
  );
  if (current) return current;
  const fallback =
    progress.find((item) => item.status !== "completed") ||
    progress[0] ||
    null;
  return adminLearningProgressView(fallback, curriculumData);
}

function assessmentAnsweredCount(attempt) {
  const verification =
    attempt?.placementResult
      ?.verification;
  const questions =
    verification?.result ===
      "pending"
      ? verification.questions || []
      : attempt?.questions || [];

  return questions.filter(
    (question) => {
      const answer =
        question?.submittedAnswer ??
        question?.selectedAnswer;
      return (
        answer !== null &&
        answer !== undefined &&
        String(answer).trim() !== ""
      );
    }
  ).length;
}

function adminAssessmentView(
  attempt,
  now = new Date()
) {
  if (!attempt) return null;
  const verification =
    attempt.placementResult
      ?.verification;
  const verificationPending =
    attempt.scopeType ===
      "placement" &&
    attempt.status ===
      "submitted" &&
    verification?.result ===
      "pending";
  const startedAt =
    verificationPending
      ? verification.startedAt
      : attempt.startedAt;
  const timeLimitMs =
    Number(
      verificationPending
        ? verification.timeLimitMs
        : attempt.timeLimitMs
    ) || 0;
  const startedMs =
    startedAt
      ? new Date(
          startedAt
        ).getTime()
      : 0;
  const deadlineAt =
    startedMs && timeLimitMs
      ? new Date(
          startedMs +
            timeLimitMs
        )
      : null;
  const remainingTimeMs =
    deadlineAt
      ? Math.max(
          0,
          deadlineAt.getTime() -
            new Date(now).getTime()
        )
      : null;
  const displayStatus =
    verificationPending
      ? "verification-required"
      : attempt.status;
  const disqualifiedReason =
    attempt.disqualifiedReason ||
    null;

  return {
    ...attempt,
    displayStatus,
    disqualifiedReason,
    deadlineAt,
    remainingTimeMs,
    answeredCount:
      assessmentAnsweredCount(
        attempt
      ),
    hasFinalScore:
      displayStatus ===
      "submitted",
  };
}

function buildAdminPlacementSummary({
  assessments = [],
  ranking = null,
} = {}) {
  const attempts =
    assessments.filter(
      (attempt) =>
        attempt.scopeType ===
        "placement"
    );
  const completed =
    attempts.filter(
      (attempt) =>
        attempt.displayStatus ===
        "submitted"
    );
  const active =
    attempts.find((attempt) =>
      [
        "in-progress",
        "verification-required",
      ].includes(
        attempt.displayStatus
      )
    ) || null;
  const latestTerminal =
    attempts.find((attempt) =>
      [
        "abandoned",
        "disqualified",
      ].includes(
        attempt.displayStatus
      )
    ) || null;

  return {
    attemptCount:
      attempts.length,
    completedCount:
      completed.length,
    latestAttempt:
      attempts[0] || null,
    latestCompleted:
      completed[0] || null,
    active,
    latestTerminal,
    ranking,
  };
}

async function synchronizeAdminAssessmentStatuses(
  userId
) {
  const [assessmentExpired, placementExpired] =
    await Promise.all([
      expireOverdueAssessmentAttempts(
        userId
      ),
      expireOverduePlacementAttempts(
        userId
      ),
    ]);

  return {
    assessmentExpired,
    placementExpired,
  };
}

async function getAdminUserDetail(
  userId
) {
  const user =
    await User.findById(
      userId
    )
      .select(
        "+identityMatchHash +identityMatchVersion"
      )
      .lean();

  if (!user) {
    throw statusError(
      404,
      "사용자를 찾을 수 없습니다."
    );
  }

  const identityMatchHash =
    user.identityMatchHash;
  const identityMatchVersion =
    user.identityMatchVersion;
  delete user.identityMatchHash;
  delete user.identityMatchVersion;
  const identitySchoolCode = String(
    user.school?.code || ""
  ).trim();
  const isAdminProfile = user.role === "admin";
  if (!isAdminProfile) {
    await synchronizeAdminAssessmentStatuses(
      userId
    );
  }
  const identityMatches =
    !isAdminProfile &&
    identityMatchHash &&
    identitySchoolCode
      ? await User.find({
          _id: { $ne: user._id },
          identityMatchHash,
          identityMatchVersion,
          "school.code":
            identitySchoolCode,
          accountStatus: {
            $ne: "withdrawn",
          },
        })
          .select(
            "name realName email accountStatus school schoolGrade educationStatus"
          )
          .lean()
      : [];

  const [
    progress,
    currentProgressRecord,
    progressCount,
    completedCount,
    problemStats,
    assessments,
    inquiries,
    notifications,
    ranking,
    actionLogs,
    communityPosts,
    packageAccess,
    weeklyMockAccess,
    arenaBadges,
    arenaActivityLevel,
    arenaRecentMatches,
  ] = await Promise.all([
    isAdminProfile
      ? Promise.resolve([])
      : ConceptProgress.find({
      userId,
    })
      .sort({
        lastStudiedAt: -1,
      })
      .limit(30)
      .lean(),
    isAdminProfile
      ? Promise.resolve(null)
      : ConceptProgress.findOne({
          userId,
          status: "in-progress",
        })
          .sort({ lastStudiedAt: -1 })
          .lean(),
    isAdminProfile
      ? Promise.resolve(0)
      : ConceptProgress.countDocuments({
      userId,
    }),
    isAdminProfile
      ? Promise.resolve(0)
      : ConceptProgress.countDocuments({
      userId,
      status: "completed",
    }),
    isAdminProfile
      ? Promise.resolve([])
      : ProblemAttempt.aggregate([
      {
        $match: {
          userId: user._id,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          correct: {
            $sum: {
              $cond: [
                "$isCorrect",
                1,
                0,
              ],
            },
          },
          averageResponseTimeMs: {
            $avg:
              "$responseTimeMs",
          },
        },
      },
    ]),
    isAdminProfile
      ? Promise.resolve([])
      : AssessmentAttempt.find({
      userId,
    })
      .select(
        "title scopeType placementPurpose status scorePercent earnedPoints totalPoints passed startedAt submittedAt elapsedTimeMs timeLimitMs disqualifiedReason questions.submittedAnswer questions.selectedAnswer createdAt placementResult"
      )
      .sort({
        createdAt: -1,
        // insertMany나 동시 요청은 같은 밀리초 createdAt을 가질 수 있다. 보조 정렬이
        // 없으면 관리자 화면의 "최근 배치고사"가 조회마다 뒤집힌다.
        _id: -1,
      })
      .limit(100)
      .lean(),
    isAdminProfile
      ? Promise.resolve([])
      : SupportInquiry.find({
      userId,
    })
      .sort({
        createdAt: -1,
      })
      .limit(8)
      .lean(),
    isAdminProfile
      ? Promise.resolve([])
      : UserNotification.find({
      userId,
    })
      .sort({
        createdAt: -1,
      })
      .limit(8)
      .lean(),
    isAdminProfile
      ? Promise.resolve({ current: null })
      : getRankingData(userId),
    AdminActionLog.find({
      targetUserId:
        user._id,
    })
      .sort({
        createdAt: -1,
      })
      .limit(50)
      .lean(),
    isAdminProfile
      ? Promise.resolve([])
      : CommunityPost.find({
      authorId:
        user._id,
    })
      .sort({
        createdAt: -1,
      })
      .limit(20)
      .lean(),
    isAdminProfile
      ? Promise.resolve(null)
      : getAdminPackageAccessSummary(userId),
    isAdminProfile
      ? Promise.resolve(null)
      : getWeeklyMockExamAccess(userId),
    isAdminProfile
      ? Promise.resolve([])
      : getUserArenaBadges(userId),
    isAdminProfile
      ? Promise.resolve(null)
      : getArenaActivityLevel(userId),
    isAdminProfile
      ? Promise.resolve([])
      : getAdminUserRecentArenaMatches(userId, 5),
  ]);
  const stats =
    problemStats[0] || {
      total: 0,
      correct: 0,
      averageResponseTimeMs: 0,
    };
  const curriculumData = isAdminProfile ? null : loadCurriculum();
  const enrichedProgress = progress.map((item) =>
    adminLearningProgressView(item, curriculumData)
  );
  const currentConcept = selectCurrentLearningConcept({
    currentProgressRecord,
    progress,
    curriculumData,
  });
  const assessmentViews =
    assessments.map((attempt) =>
      adminAssessmentView(
        attempt
      )
    );
  const placement =
    buildAdminPlacementSummary({
      assessments:
        assessmentViews,
      ranking:
        ranking.current,
    });

  return {
    user,
    streak: isAdminProfile
      ? null
      : {
          current: getEffectiveStreak(user),
          longest: Math.max(0, Number(user.longestStreak) || 0),
          lastStudyDate: user.lastStudyDate || null,
        },
    learning: {
      progress: enrichedProgress,
      currentConcept,
      progressCount,
      completedCount,
      totalAttempts:
        stats.total || 0,
      correctAttempts:
        stats.correct || 0,
      correctRate:
        stats.total
          ? Math.round(
              (
                stats.correct /
                stats.total
              ) * 100
            )
          : 0,
      averageResponseTimeMs:
        Math.round(
          stats.averageResponseTimeMs ||
            0
        ),
    },
    assessments:
      assessmentViews,
    placement,
    inquiries,
    notifications,
    ranking:
      ranking.current,
    actionLogs,
    communityPosts,
    identityMatches,
    packageAccess,
    weeklyMockAccess,
    arenaBadges,
    arenaActivityLevel,
    arenaRecentMatches,
  };
}

async function getAdminParentDetail(parentId) {
  if (!mongoose.isValidObjectId(parentId)) {
    throw statusError(404, "학부모 계정을 찾을 수 없습니다.");
  }
  const parent = await ParentAccount.findById(parentId)
    .select("username email childUserId isActive lastLoginAt acceptedTermsAt createdAt updatedAt")
    .lean();
  if (!parent) {
    throw statusError(404, "학부모 계정을 찾을 수 없습니다.");
  }

  const [links, checkoutIntents, alertDeliveries, actionLogs] = await Promise.all([
    ParentChildLink.find({ parentAccountId: parent._id })
      .sort({ status: 1, linkedAt: 1 })
      .populate("childUserId", "name realName email school schoolGrade university educationStatus isActive accountStatus lastLoginAt")
      .lean(),
    CheckoutIntent.find({ parentAccountId: parent._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    ParentAlertDelivery.find({ parentAccountId: parent._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    AdminActionLog.find({ "metadata.parentAccountId": String(parent._id) })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);

  const activeLinks = links.filter((link) => link.status === "ACTIVE" && link.childUserId);
  const children = await Promise.all(activeLinks.map(async (link) => {
    const child = link.childUserId;
    const [dashboard, ranking, packageAccess] = await Promise.all([
      getDashboardData(child._id),
      getRankingData(child._id),
      getAdminPackageAccessSummary(child._id),
    ]);
    return {
      link,
      child,
      dashboard: dashboard.stats || {},
      ranking: ranking.current || null,
      packageAccess,
    };
  }));

  return {
    parent,
    links,
    children,
    checkoutIntents,
    alertDeliveries,
    actionLogs,
  };
}

async function updateAdminParentStatus({
  adminUserId,
  parentId,
  isActive,
  reason,
}) {
  const parent = await ParentAccount.findById(parentId);
  if (!parent) throw statusError(404, "학부모 계정을 찾을 수 없습니다.");
  const nextActive = isActive === true || String(isActive) === "true" || String(isActive) === "1";
  const cleanReason = cleanSingleLine(reason, 500);
  if (!cleanReason) throw statusError(400, "변경 사유를 입력해주세요.");
  parent.isActive = nextActive;
  await parent.save();
  await logAdminAction({
    adminUserId,
    action: "parent.account-status",
    detail: cleanReason,
    metadata: { parentAccountId: String(parent._id), isActive: nextActive },
  });
  return parent.toObject();
}

async function updateAdminParentChildNotifications({
  adminUserId,
  parentId,
  childUserId,
  input,
}) {
  const link = await ParentChildLink.findOne({
    parentAccountId: parentId,
    childUserId,
    status: "ACTIVE",
  }).lean();
  if (!link) throw statusError(404, "활성 자녀 연결을 찾을 수 없습니다.");
  const updated = await updateParentNotificationSettings({
    parentAccountId: parentId,
    childUserId,
    input,
  });
  await logAdminAction({
    adminUserId,
    action: "parent.notification-settings",
    detail: "학부모 자녀별 학습 알림 설정 변경",
    metadata: { parentAccountId: String(parentId), childUserId: String(childUserId) },
  });
  return updated;
}

async function revokeAdminParentChildLink({
  adminUserId,
  parentId,
  childUserId,
  reason,
}) {
  const cleanReason = cleanSingleLine(reason, 500);
  if (!cleanReason) throw statusError(400, "연결 해제 사유를 입력해주세요.");
  const link = await ParentChildLink.findOneAndUpdate(
    { parentAccountId: parentId, childUserId, status: "ACTIVE" },
    { $set: { status: "REVOKED" } },
    { returnDocument: "after" }
  ).lean();
  if (!link) throw statusError(404, "해제할 활성 자녀 연결을 찾을 수 없습니다.");
  await logAdminAction({
    adminUserId,
    action: "parent.child-unlink",
    detail: cleanReason,
    metadata: { parentAccountId: String(parentId), childUserId: String(childUserId) },
  });
  return link;
}

async function getAdminAssessmentDetail({
  userId,
  attemptId,
}) {
  if (
    !mongoose.isValidObjectId(
      userId
    ) ||
    !mongoose.isValidObjectId(
      attemptId
    )
  ) {
    throw statusError(
      404,
      "시험 기록을 찾을 수 없습니다."
    );
  }

  await synchronizeAdminAssessmentStatuses(
    userId
  );

  const [user, attempt] =
    await Promise.all([
      User.findById(userId)
        .select(
          "name realName email school schoolGrade role accountStatus isActive"
        )
        .lean(),
      AssessmentAttempt.findOne({
        _id: attemptId,
        userId,
      }).lean(),
    ]);

  if (!user || !attempt) {
    throw statusError(
      404,
      "시험 기록을 찾을 수 없습니다."
    );
  }

  return {
    user,
    attempt:
      adminAssessmentView(
        attempt
      ),
  };
}

async function getAdminUserActivityData({
  userId,
  kind,
  page,
}) {
  if (
    !mongoose.isValidObjectId(userId)
  ) {
    throw statusError(
      404,
      "사용자를 찾을 수 없습니다."
    );
  }

  const user =
    await User.findById(userId)
      .select(
        "name realName email role school schoolGrade warningCount accountStatus isActive"
      )
      .lean();

  if (!user) {
    throw statusError(
      404,
      "사용자를 찾을 수 없습니다."
    );
  }

  const allowedKinds =
    new Set([
      "learning",
      "problems",
      "quick",
      "assessments",
      "community",
      "moderation",
    ]);
  const normalizedKind =
    allowedKinds.has(kind)
      ? kind
      : "learning";
  if (
    normalizedKind ===
    "assessments"
  ) {
    await synchronizeAdminAssessmentStatuses(
      user._id
    );
  }
  const currentPage = safePage(page);
  const filter = {
    userId: user._id,
  };
  let model = LearningEvent;
  let sort = {
    occurredAt: -1,
    createdAt: -1,
  };
  let queryFactory = () =>
    LearningEvent.find(filter)
      .select(
        "eventType courseId unitId conceptId topicIndex problemId attemptId stepNumber durationMs correct metadata occurredAt createdAt sessionId"
      )
      .lean();

  if (
    normalizedKind === "problems"
  ) {
    model = ProblemAttempt;
    sort = {
      submittedAt: -1,
      createdAt: -1,
    };
    queryFactory = () =>
      ProblemAttempt.find(filter)
        .select(
          "problemId reviewSourceAttemptId courseId unitId conceptId attemptNumber submittedAnswer problemSnapshot isCorrect score maxScore responseTimeMs hintsUsed visualizationReplayCount stoppedAtStep review submittedAt createdAt"
        )
        .populate({
          path: "problemId",
          select:
            "stem +correctAnswer source questionType difficulty tags",
        })
        .lean();
  } else if (
    normalizedKind === "quick"
  ) {
    model =
      QuickPracticeAttempt;
    sort = {
      submittedAt: -1,
      startedAt: -1,
    };
    queryFactory = () =>
      QuickPracticeAttempt.find(
        filter
      )
        .select(
          "+answer instanceId pointValue topicKey topicLabel variantKey variantLabel prompt solution status startedAt deadlineAt submittedAnswer responseTimeMs submittedAt createdAt"
        )
        .lean();
  } else if (
    normalizedKind ===
    "assessments"
  ) {
    model =
      AssessmentAttempt;
    sort = {
      createdAt: -1,
    };
    queryFactory = () =>
      AssessmentAttempt.find(
        filter
      )
        .select(
          "title scopeType courseId unitId subunitId status score scorePercent passed elapsedTimeMs submittedAt createdAt placementResult"
        )
        .lean();
  } else if (
    normalizedKind ===
    "community"
  ) {
    model = CommunityPost;
    delete filter.userId;
    filter.authorId =
      user._id;
    sort = {
      createdAt: -1,
    };
    queryFactory = () =>
      CommunityPost.find(filter)
        .select(
          "boardType schoolCode schoolName title content status viewCount warningIssued moderationReason moderatedAt editedAt createdAt"
        )
        .lean();
  } else if (
    normalizedKind ===
    "moderation"
  ) {
    model = AdminActionLog;
    delete filter.userId;
    filter.targetUserId =
      user._id;
    sort = {
      createdAt: -1,
    };
    queryFactory = () =>
      AdminActionLog.find(filter)
        .select(
          "adminUserId action detail metadata createdAt"
        )
        .populate({
          path: "adminUserId",
          select: "name email",
        })
        .lean();
  }

  const total =
    await model.countDocuments(
      filter
    );
  const totalPages = Math.max(
    1,
    Math.ceil(
      total /
        USER_ACTIVITY_PAGE_SIZE
    )
  );
  const safeCurrentPage =
    Math.min(
      currentPage,
      totalPages
    );
  const items =
    await queryFactory()
      .sort(sort)
      .skip(
        (safeCurrentPage - 1) *
          USER_ACTIVITY_PAGE_SIZE
      )
      .limit(
        USER_ACTIVITY_PAGE_SIZE
      );

  return {
    user,
    kind: normalizedKind,
    items,
    pagination: {
      page: safeCurrentPage,
      total,
      totalPages,
      hasPrevious:
        safeCurrentPage > 1,
      hasNext:
        safeCurrentPage <
        totalPages,
    },
  };
}

async function updateUserNickname({
  adminUserId,
  userId,
  reason,
  baseUrl,
}) {
  const cleanReason =
    cleanSingleLine(reason, 500);

  if (!cleanReason) {
    throw statusError(
      400,
      "닉네임 변경 요청 사유를 입력해주세요."
    );
  }

  const request =
    await createNicknameChangeRequest({
      adminUserId,
      userId,
      reason: cleanReason,
      baseUrl,
    });

  await logAdminAction({
    adminUserId,
    targetUserId: userId,
    action:
      "user.nickname-request",
    detail: cleanReason,
    metadata: {
      requestId:
        request.requestId,
    },
  });

  return request;
}

async function setUserActive({
  adminUserId,
  userId,
  active,
  reason,
}) {
  if (
    String(adminUserId) ===
    String(userId)
  ) {
    throw statusError(
      400,
      "현재 로그인한 관리자 계정은 비활성화할 수 없습니다."
    );
  }

  const cleanReason =
    cleanSingleLine(reason, 300);

  if (!cleanReason) {
    throw statusError(
      400,
      "계정 상태 변경 사유를 입력해주세요."
    );
  }

  const user =
    await User.findOne({
      _id: userId,
      role: {
        $ne: "admin",
      },
    });

  if (!user) {
    throw statusError(
      404,
      "변경할 사용자를 찾을 수 없습니다."
    );
  }

  user.isActive = Boolean(
    active
  );
  user.accountStatus =
    active
      ? "active"
      : "inactive";
  user.accountStatusReason =
    cleanReason;
  user.accountStatusChangedAt =
    new Date();
  user.suspendedUntil = null;
  user.tokenVersion =
    (Number(user.tokenVersion) || 0) +
    1;
  await user.save();

  await logAdminAction({
    adminUserId,
    targetUserId: user._id,
    action:
      active
        ? "user.restore"
        : "user.deactivate",
    detail: cleanReason,
  });

  const notice =
    accountEmailCopy.activationChanged({
      active,
      reason: cleanReason,
    });

  await deliverModerationNotice({
    user,
    title: notice.title,
    message: notice.message,
    href: "/notifications",
    kind: "account",
    createdBy:
      adminUserId,
  });
}

async function updateUserRole({
  adminUserId,
  userId,
  role,
  reason,
}) {
  const allowedRoles =
    new Set([
      "student",
      "teacher",
      "admin",
    ]);
  const normalizedRole =
    String(role || "");
  const cleanReason =
    cleanSingleLine(
      reason,
      300
    );

  if (
    !allowedRoles.has(
      normalizedRole
    ) ||
    !cleanReason
  ) {
    throw statusError(
      400,
      "역할과 변경 사유를 입력해주세요."
    );
  }

  if (
    String(adminUserId) ===
    String(userId)
  ) {
    throw statusError(
      400,
      "현재 로그인한 관리자 본인의 역할은 변경할 수 없습니다."
    );
  }

  const user =
    await User.findById(userId);

  if (!user) {
    throw statusError(
      404,
      "변경할 사용자를 찾을 수 없습니다."
    );
  }

  const previousRole =
    user.role;
  user.role = normalizedRole;
  user.tokenVersion =
    (Number(user.tokenVersion) ||
      0) + 1;
  await user.save();

  await logAdminAction({
    adminUserId,
    targetUserId: user._id,
    action: "user.role",
    detail: cleanReason,
    metadata: {
      previousRole,
      nextRole:
        normalizedRole,
    },
  });

  const notice =
    accountEmailCopy.roleChanged({
      previousRole,
      nextRole:
        normalizedRole,
      reason: cleanReason,
    });

  await deliverModerationNotice({
    user,
    title: notice.title,
    message: notice.message,
    href: "/notifications",
    kind: "account",
    createdBy:
      adminUserId,
  });
}

async function updateUserAccountStatus({
  adminUserId,
  userId,
  status,
  reason,
  suspensionDays,
  retainAnonymousData,
}) {
  const allowedStatuses =
    new Set([
      "active",
      "inactive",
      "suspended",
      "withdrawn",
    ]);
  const normalizedStatus =
    String(status || "");
  const cleanReason =
    cleanSingleLine(
      reason,
      500
    );

  if (
    !allowedStatuses.has(
      normalizedStatus
    ) ||
    !cleanReason
  ) {
    throw statusError(
      400,
      "계정 상태와 처리 사유를 입력해주세요."
    );
  }

  if (
    String(adminUserId) ===
    String(userId)
  ) {
    throw statusError(
      400,
      "현재 로그인한 관리자 본인의 상태는 변경할 수 없습니다."
    );
  }

  const user =
    await User.findById(userId);

  if (!user) {
    throw statusError(
      404,
      "변경할 사용자를 찾을 수 없습니다."
    );
  }

  const days =
    Number.parseInt(
      suspensionDays,
      10
    );
  const suspendedUntil =
    normalizedStatus ===
      "suspended" &&
    Number.isFinite(days) &&
    days > 0
      ? new Date(
          Date.now() +
            Math.min(
              days,
              3650
            ) *
              24 *
              60 *
              60 *
              1000
        )
      : null;
  const previousStatus =
    user.accountStatus ||
    (
      user.isActive
        ? "active"
        : "inactive"
    );

  if (
    previousStatus === "withdrawn" &&
    normalizedStatus !== "withdrawn"
  ) {
    throw statusError(
      409,
      "개인정보가 제거된 탈퇴 계정은 다시 활성화할 수 없습니다."
    );
  }

  if (
    normalizedStatus === "withdrawn"
  ) {
    const keepAnonymousData =
      normalizeRetentionChoice(
        retainAnonymousData
      );
    // 익명 보존 계정의 두 번째 삭제는 남아 있는 익명 데이터를
    // 완전히 제거하는 작업이다. 이미 개인정보와 수신 주소가 제거된
    // 계정이므로 별도 안내 발송 없이 즉시 처리한다.
    if (previousStatus !== "withdrawn") {
      const notice =
        accountEmailCopy.withdrawn({
          reason: cleanReason,
          keepAnonymousData,
        });

      await deliverModerationNotice({
        user,
        title: notice.title,
        message: notice.message,
        href: "/notifications",
        kind: "account",
        createdBy: adminUserId,
      });
    }

    const withdrawal =
      await withdrawUserAccount({
        userId: user._id,
        initiatedBy: "admin",
        retainAnonymousData:
          keepAnonymousData,
      });

    await logAdminAction({
      adminUserId,
      targetUserId:
        withdrawal.dataRetention === "purged"
          ? null
          : user._id,
      action:
        "user.account-withdrawal",
      detail:
        previousStatus === "withdrawn"
          ? "익명 보존 계정의 모든 데이터 영구 삭제"
          : "관리자에 의한 계정 탈퇴 처리",
      metadata: {
        previousStatus,
        nextStatus: "withdrawn",
        dataRetention:
          withdrawal.dataRetention,
        targetAccountPurged:
          withdrawal.dataRetention === "purged",
      },
    });

    return withdrawal;
  }

  user.accountStatus =
    normalizedStatus;
  user.accountStatusReason =
    cleanReason;
  user.accountStatusChangedAt =
    new Date();
  user.suspendedUntil =
    suspendedUntil;
  user.isActive =
    normalizedStatus ===
    "active";
  user.tokenVersion =
    (Number(user.tokenVersion) ||
      0) + 1;
  await user.save();

  await logAdminAction({
    adminUserId,
    targetUserId: user._id,
    action:
      "user.account-status",
    detail: cleanReason,
    metadata: {
      previousStatus,
      nextStatus:
        normalizedStatus,
      suspendedUntil,
    },
  });

  const suspensionText =
    suspendedUntil
      ? `정지 종료 예정: ${new Intl.DateTimeFormat(
          "ko-KR",
          {
            timeZone:
              "Asia/Seoul",
            dateStyle:
              "long",
          }
        ).format(suspendedUntil)}`
      : normalizedStatus ===
          "suspended"
        ? "정지 기간: 무기한"
        : "";
  const notice =
    accountEmailCopy.statusChanged({
      status: normalizedStatus,
      reason: cleanReason,
      suspendedUntilText:
        suspensionText,
    });

  await deliverModerationNotice({
    user,
    title: notice.title,
    message: notice.message,
    href: "/notifications",
    kind: "account",
    createdBy:
      adminUserId,
  });
}

async function updateUserWarningCount({
  adminUserId,
  userId,
  warningCount,
  reason,
}) {
  const count =
    Number.parseInt(
      warningCount,
      10
    );
  const cleanReason =
    cleanSingleLine(
      reason,
      500
    );

  if (
    !Number.isInteger(count) ||
    count < 0 ||
    count > 999 ||
    !cleanReason
  ) {
    throw statusError(
      400,
      "경고 횟수와 수정 사유를 확인해주세요."
    );
  }

  const user =
    await User.findById(userId);

  if (!user) {
    throw statusError(
      404,
      "변경할 사용자를 찾을 수 없습니다."
    );
  }

  if (
    user.role === "admin" &&
    count >= 3
  ) {
    throw statusError(
      400,
      "관리자 계정은 경고 누적으로 자동 정지할 수 없습니다."
    );
  }

  const previousCount =
    Number(user.warningCount) ||
    0;
  user.warningCount = count;
  const wasWarningSuspension =
    user.accountStatus ===
      "suspended" &&
    [
      "경고 3회 누적",
      "게시판 경고 3회 누적",
    ].includes(
      String(
        user.accountStatusReason ||
          ""
      )
    );
  const autoReactivated =
    count < 3 &&
    wasWarningSuspension;

  if (
    count >= 3 &&
    user.accountStatus !==
      "suspended"
  ) {
    user.accountStatus =
      "suspended";
    user.accountStatusReason =
      "경고 3회 누적";
    user.accountStatusChangedAt =
      new Date();
    user.suspendedUntil = null;
    user.isActive = false;
    user.tokenVersion =
      (Number(
        user.tokenVersion
      ) || 0) + 1;
  } else if (autoReactivated) {
    user.accountStatus =
      "active";
    user.accountStatusReason =
      "";
    user.accountStatusChangedAt =
      new Date();
    user.suspendedUntil = null;
    user.isActive = true;
    user.tokenVersion =
      (Number(
        user.tokenVersion
      ) || 0) + 1;
  }

  await user.save();
  await logAdminAction({
    adminUserId,
    targetUserId: user._id,
    action:
      "user.warning-count",
    detail: cleanReason,
    metadata: {
      previousCount,
      nextCount: count,
      autoSuspended:
        count >= 3,
      autoReactivated,
    },
  });

  const autoSuspended =
    count >= 3 &&
    user.role !== "admin";
  const notice =
    accountEmailCopy.warningChanged({
      count,
      previousCount,
      reason: cleanReason,
      autoSuspended,
    });

  await deliverModerationNotice({
    user,
    title: notice.title,
    message: notice.message,
    href: "/notifications",
    kind: "warning",
    createdBy:
      adminUserId,
  });
}

async function createDirectNotification({
  adminUserId,
  userId,
  title,
  message,
  href,
}) {
  const cleanTitle =
    cleanSingleLine(title, 100);
  const cleanMessage =
    cleanMultiline(message, 1000);

  if (
    cleanTitle.length < 2 ||
    cleanMessage.length < 2
  ) {
    throw statusError(
      400,
      "알림 제목과 내용을 입력해주세요."
    );
  }

  const user =
    await User.findOne({
      _id: userId,
      isActive: true,
    }).lean();

  if (!user) {
    throw statusError(
      404,
      "활성 사용자를 찾을 수 없습니다."
    );
  }

  const notification =
    await UserNotification.create({
      userId: user._id,
      title: cleanTitle,
      message: cleanMessage,
      href:
        safeInternalHref(href),
      kind: "admin",
      createdBy: adminUserId,
    });

  await logAdminAction({
    adminUserId,
    targetUserId: user._id,
    action:
      "user.notification",
    detail: cleanTitle,
    metadata: {
      notificationId:
        String(
          notification._id
        ),
    },
  });
}

async function sendDirectUserEmail({
  adminUserId,
  userId,
  subject,
  message,
}) {
  const cleanSubject =
    cleanSingleLine(subject, 120);
  const cleanMessage =
    cleanMultiline(message, 5000);

  if (
    cleanSubject.length < 2 ||
    cleanMessage.length < 5
  ) {
    throw statusError(
      400,
      "이메일 제목은 2자, 내용은 5자 이상 입력해주세요."
    );
  }

  const user =
    await User.findOne({
      _id: userId,
      isActive: true,
    }).lean();

  if (!user) {
    throw statusError(
      404,
      "활성 사용자를 찾을 수 없습니다."
    );
  }

  const sender = await getActiveAdminSender(adminUserId);

  const delivery =
    await sendAdminUserEmail({
      to: user.email,
      subject: cleanSubject,
      message: cleanMessage,
      fromAddress: sender.email,
    });

  await logAdminAction({
    adminUserId,
    targetUserId: user._id,
    action: "user.email",
    detail: cleanSubject,
    metadata: {
      delivered:
        delivery.delivered,
      senderEmail: delivery.fromAddress,
      actingAdminEmail: sender.email,
      providerMessageId: delivery.providerMessageId || "",
    },
  });

  return delivery;
}

async function sendUserPasswordReset({
  adminUserId,
  userId,
  baseUrl,
}) {
  const user =
    await User.findOne({
      _id: userId,
      isActive: true,
    }).lean();

  if (!user) {
    throw statusError(
      404,
      "활성 사용자를 찾을 수 없습니다."
    );
  }

  const sender = await getActiveAdminSender(adminUserId);

  const result =
    await requestPasswordResetLink({
      email: user.email,
      baseUrl,
      fromAddress: sender.email,
    });

  await logAdminAction({
    adminUserId,
    targetUserId: user._id,
    action:
      "user.password-reset",
    detail:
      "비밀번호 재설정 링크 발송",
    metadata: {
      senderEmail: result.fromAddress,
      actingAdminEmail: sender.email,
    },
  });

  return result;
}

async function markNotificationRead({
  userId,
  notificationId,
}) {
  const notification =
    await UserNotification.findOneAndUpdate(
      {
        _id: notificationId,
        userId,
      },
      {
        $set: {
          readAt: new Date(),
          dashboardDismissedAt:
            new Date(),
        },
      },
      {
        returnDocument: "after",
      }
    ).lean();

  if (!notification) {
    throw statusError(
      404,
      "알림을 찾을 수 없습니다."
    );
  }

  return safeInternalHref(
    notification.href
  );
}

module.exports = {
  INQUIRIES_PER_PAGE,
  USERS_PER_PAGE,
  USER_ACTIVITY_PAGE_SIZE,
  createAnnouncement,
  createDirectNotification,
  getAdminDashboardData,
  getAdminAuditHistory,
  getAdminRevenueMetrics,
  getAdminSanctionHistory,
  getAdminInquiryData,
  getAdminAssessmentDetail,
  getAdminParentDetail,
  getAdminUserActivityData,
  getAdminUserDetail,
  getAdminUsersData,
  markNotificationRead,
  replyToInquiry,
  sendDirectUserEmail,
  sendUserPasswordReset,
  setUserActive,
  toggleAnnouncement,
  updateInquiryStatus,
  updateAdminParentChildNotifications,
  updateAdminParentStatus,
  revokeAdminParentChildLink,
  updateUserAccountStatus,
  updateUserNickname,
  updateUserRole,
  updateUserWarningCount,
  _testing: {
    adminAssessmentView,
    adminLearningProgressView,
    buildAdminPlacementSummary,
    selectCurrentLearningConcept,
    synchronizeAdminAssessmentStatuses,
  },
};
