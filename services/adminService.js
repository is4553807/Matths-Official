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
const {
  ArenaPackagePayment,
} = require("../models/goatArenaModel");
const {
  sendAdminUserEmail,
  sendSupportReply,
} = require("./emailService");
const {
  getRankingData,
} = require("./rankingService");
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
  getUserArenaBadges,
} = require("./arenaBadgeService");
const accountEmailCopy =
  require("../content/email/account");

const USERS_PER_PAGE = 20;
const INQUIRIES_PER_PAGE = 20;
const USER_ACTIVITY_PAGE_SIZE = 50;

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
  await AdminActionLog.create({
    adminUserId,
    targetUserId,
    action,
    detail:
      cleanSingleLine(detail, 1000),
    metadata,
  });
}

async function getAdminDashboardData() {
  const [
    activeUsers,
    pendingInquiries,
    publishedAnnouncements,
    archiveItems,
    archiveFolders,
    inquiries,
    announcements,
    revenue,
  ] = await Promise.all([
    User.countDocuments({
      isActive: true,
      role: "student",
    }),
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
  ]);

  return {
    stats: {
      activeUsers,
      pendingInquiries,
      publishedAnnouncements,
      archiveItems,
      archiveFolders,
    },
    inquiries,
    announcements,
    revenue,
  };
}

function startOfKstDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)])
  );
  return new Date(Date.UTC(values.year, values.month - 1, values.day, -9));
}

async function getAdminRevenueMetrics(now = new Date()) {
  const today = startOfKstDay(now);
  const rows = await ArenaPackagePayment.aggregate([
    {
      $group: {
        _id: null,
        grossApproved: { $sum: "$approvedAmount" },
        refunded: {
          $sum: { $cond: [{ $eq: ["$status", "REFUNDED"] }, "$approvedAmount", 0] },
        },
        cancelled: {
          $sum: { $cond: [{ $eq: ["$status", "CANCELLED"] }, "$approvedAmount", 0] },
        },
        todayNet: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ["$approvedAt", today] },
                  { $in: ["$status", ["APPROVED", "APPLIED"]] },
                ],
              },
              "$approvedAmount",
              0,
            ],
          },
        },
        successfulPayments: {
          $sum: { $cond: [{ $in: ["$status", ["APPROVED", "APPLIED"]] }, 1, 0] },
        },
      },
    },
  ]);
  const value = rows[0] || {};
  const grossApproved = Number(value.grossApproved || 0);
  const refunded = Number(value.refunded || 0);
  const cancelled = Number(value.cancelled || 0);
  return {
    currency: "KRW",
    grossApproved,
    refunded,
    cancelled,
    netRevenue: grossApproved - refunded - cancelled,
    todayRevenue: Number(value.todayNet || 0),
    successfulPayments: Number(value.successfulPayments || 0),
    updatedAt: new Date(),
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

  const delivery =
    await sendSupportReply({
      to: inquiry.contactEmail,
      subject: inquiry.subject,
      message: cleanMessage,
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
    ]);

  if (
    allowedRoles.has(role)
  ) {
    filter.role = role;
  }

  const currentPage =
    safePage(page);
  const total =
    await User.countDocuments(
      filter
    );
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
  const [users, schools] =
    await Promise.all([
      User.find(filter)
        .select(
          "name realName email role school university schoolGrade isActive accountStatus accountStatusReason suspendedUntil warningCount totalStudySeconds currentStreak lastLoginAt createdAt"
        )
        .sort({
          createdAt: -1,
        })
        .skip(
          (safeCurrentPage - 1) *
            USERS_PER_PAGE
        )
        .limit(USERS_PER_PAGE)
        .lean(),
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
              $first:
                "$school.name",
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
        allowedRoles.has(role)
          ? role
          : "",
    },
    page: safeCurrentPage,
    total,
    totalPages,
    perPage: USERS_PER_PAGE,
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
    arenaBadges,
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
        "title scopeType status scorePercent elapsedTimeMs submittedAt createdAt placementResult.placementScore placementResult.initialMmr placementResult.tier"
      )
      .sort({
        createdAt: -1,
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
      ? Promise.resolve([])
      : getUserArenaBadges(userId),
  ]);
  const stats =
    problemStats[0] || {
      total: 0,
      correct: 0,
      averageResponseTimeMs: 0,
    };

  return {
    user,
    learning: {
      progress,
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
    assessments,
    inquiries,
    notifications,
    ranking:
      ranking.current,
    actionLogs,
    communityPosts,
    identityMatches,
    packageAccess,
    arenaBadges,
  };
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
    attempt,
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
      createdBy:
        adminUserId,
    });

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
        "관리자에 의한 계정 탈퇴 처리",
      metadata: {
        previousStatus,
        nextStatus: "withdrawn",
        dataRetention:
          withdrawal.dataRetention,
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

  const delivery =
    await sendAdminUserEmail({
      to: user.email,
      subject: cleanSubject,
      message: cleanMessage,
    });

  await logAdminAction({
    adminUserId,
    targetUserId: user._id,
    action: "user.email",
    detail: cleanSubject,
    metadata: {
      delivered:
        delivery.delivered,
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

  const result =
    await requestPasswordResetLink({
      email: user.email,
      baseUrl,
    });

  await logAdminAction({
    adminUserId,
    targetUserId: user._id,
    action:
      "user.password-reset",
    detail:
      "비밀번호 재설정 링크 발송",
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
  getAdminRevenueMetrics,
  getAdminInquiryData,
  getAdminAssessmentDetail,
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
  updateUserAccountStatus,
  updateUserNickname,
  updateUserRole,
  updateUserWarningCount,
};
