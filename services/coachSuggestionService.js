const mongoose = require("mongoose");
const {
  AdminActionLog,
  CoachMessageSuggestion,
  CoachSuggestionQuota,
  User,
} = require("../models/matthsModel");
const {
  completeAdminTodoBySource,
  createAdminTodo,
} = require("./adminTodoService");
const {
  FEEDBACK_SITUATIONS: SITUATIONS,
  MODES,
  setCommunityCoachMessages,
} = require("./coachMessageService");
const {
  deliverModerationNotice,
} = require("./moderationNoticeService");

function isCoachAdmin(user) {
  return user?.role === "admin";
}

function sanitizeMessage(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

const DAILY_SUGGESTION_LIMIT = 10;

function getKoreanDayRange(
  value = new Date()
) {
  const koreaOffsetMs =
    9 * 60 * 60 * 1000;
  const koreaTime = new Date(
    value.getTime() + koreaOffsetMs
  );
  const start = new Date(
    Date.UTC(
      koreaTime.getUTCFullYear(),
      koreaTime.getUTCMonth(),
      koreaTime.getUTCDate()
    ) - koreaOffsetMs
  );
  const year = String(
    koreaTime.getUTCFullYear()
  );
  const month = String(
    koreaTime.getUTCMonth() + 1
  ).padStart(2, "0");
  const day = String(
    koreaTime.getUTCDate()
  ).padStart(2, "0");
  return {
    start,
    end: new Date(
      start.getTime() +
        24 * 60 * 60 * 1000
    ),
    dayKey: `${year}-${month}-${day}`,
  };
}

function dailySuggestionLimitError() {
  const error = new Error(
    `하루에는 문구를 ${DAILY_SUGGESTION_LIMIT}개까지 제안할 수 있습니다.`
  );
  error.status = 429;
  return error;
}

async function reserveSuggestionSlot(
  userId
) {
  const { start, end, dayKey } =
    getKoreanDayRange();
  const expiresAt = new Date(
    end.getTime() +
      2 * 24 * 60 * 60 * 1000
  );

  for (
    let attempt = 0;
    attempt < 6;
    attempt += 1
  ) {
    const quota =
      await CoachSuggestionQuota.findOneAndUpdate(
        {
          userId,
          dayKey,
          count: {
            $lt: DAILY_SUGGESTION_LIMIT,
          },
        },
        {
          $inc: { count: 1 },
          $set: { expiresAt },
        },
        {
          returnDocument: "after",
          runValidators: true,
        }
      ).lean();
    if (quota) return { dayKey };

    const existingCount =
      await CoachMessageSuggestion.countDocuments({
        userId,
        createdAt: {
          $gte: start,
          $lt: end,
        },
      });
    if (
      existingCount >=
      DAILY_SUGGESTION_LIMIT
    ) {
      throw dailySuggestionLimitError();
    }

    try {
      await CoachSuggestionQuota.create({
        userId,
        dayKey,
        count: existingCount + 1,
        expiresAt,
      });
      return { dayKey };
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
  }
  throw dailySuggestionLimitError();
}

async function releaseSuggestionSlot({
  userId,
  dayKey,
}) {
  await CoachSuggestionQuota.updateOne(
    {
      userId,
      dayKey,
      count: { $gt: 0 },
    },
    { $inc: { count: -1 } }
  );
}

function serializeSuggestion(item) {
  return {
    id: String(item._id),
    authorName: item.authorName,
    mode: item.mode,
    situation: item.situation,
    message: item.message,
    status: item.status,
    rejectionReason:
      item.rejectionReason || "",
    createdAt: item.createdAt,
    moderatedAt: item.moderatedAt,
  };
}

async function ensureSuggestionAdminTodo(
  suggestion
) {
  if (
    !suggestion ||
    suggestion.status !== "pending"
  ) {
    return null;
  }

  return createAdminTodo({
    category: "other",
    title: "코치 문구 제안 검토",
    description:
      suggestion.message,
    href: `/admin/coach-suggestions#suggestion-${suggestion._id}`,
    targetUserId:
      suggestion.userId,
    actorUserId:
      suggestion.userId,
    sourceType:
      "CoachMessageSuggestion",
    sourceId:
      suggestion._id,
  });
}

async function refreshCommunityCoachMessages() {
  const approved =
    await CoachMessageSuggestion.find({
      status: "approved",
    })
      .sort({
        moderatedAt: -1,
      })
      .limit(300)
      .lean();

  setCommunityCoachMessages(approved);
  return approved.length;
}

async function ensureCoachSuggestionIndexes() {
  await Promise.all([
    CoachMessageSuggestion.createIndexes(),
    CoachSuggestionQuota.createIndexes(),
  ]);
  return true;
}

async function getSuggestionBoardData(
  user
) {
  const admin = isCoachAdmin(user);
  const [approved, mine, pending] =
    await Promise.all([
      CoachMessageSuggestion.find({
        status: "approved",
      })
        .sort({
          moderatedAt: -1,
        })
        .limit(40)
        .lean(),
      CoachMessageSuggestion.find({
        userId: user.id,
      })
        .sort({
          createdAt: -1,
        })
        .limit(20)
        .lean(),
      admin
        ? CoachMessageSuggestion.find({
            status: "pending",
          })
            .sort({
              createdAt: 1,
            })
            .limit(100)
            .lean()
        : [],
    ]);

  return {
    isAdmin: admin,
    approved:
      approved.map(
        serializeSuggestion
      ),
    mine: mine.map(
      serializeSuggestion
    ),
    pending: pending.map(
      serializeSuggestion
    ),
  };
}

async function getAdminSuggestionData() {
  const [pending, approved, rejected] =
    await Promise.all([
      CoachMessageSuggestion.find({
        status: "pending",
      })
        .sort({ createdAt: 1 })
        .limit(200)
        .lean(),
      CoachMessageSuggestion.find({
        status: "approved",
      })
        .sort({
          moderatedAt: -1,
        })
        .limit(100)
        .lean(),
      CoachMessageSuggestion.find({
        status: "rejected",
      })
        .sort({
          moderatedAt: -1,
        })
        .limit(50)
        .lean(),
    ]);

  return {
    pending:
      pending.map(
        serializeSuggestion
      ),
    approved:
      approved.map(
        serializeSuggestion
      ),
    rejected:
      rejected.map(
        serializeSuggestion
      ),
    stats: {
      pending:
        pending.length,
      approved:
        await CoachMessageSuggestion.countDocuments({
          status: "approved",
        }),
      rejected:
        await CoachMessageSuggestion.countDocuments({
          status: "rejected",
        }),
    },
  };
}

async function createSuggestion({
  user,
  mode,
  situation,
  message,
  requestId,
}) {
  const cleanMessage =
    sanitizeMessage(message);
  const cleanRequestId = String(
    requestId || ""
  ).trim().slice(0, 100);

  if (cleanRequestId) {
    const existing =
      await CoachMessageSuggestion.findOne({
        userId: user.id,
        requestId: cleanRequestId,
      });
    if (existing) {
      await ensureSuggestionAdminTodo(
        existing
      );
      return serializeSuggestion(existing);
    }
  }

  if (!MODES.includes(mode)) {
    const error = new Error(
      "올바른 말투를 선택해주세요."
    );
    error.status = 400;
    throw error;
  }

  if (
    !SITUATIONS.includes(situation)
  ) {
    const error = new Error(
      "올바른 상황을 선택해주세요."
    );
    error.status = 400;
    throw error;
  }

  if (
    cleanMessage.length < 4 ||
    cleanMessage.length > 120
  ) {
    const error = new Error(
      "문구는 4자 이상 120자 이하로 작성해주세요."
    );
    error.status = 400;
    throw error;
  }

  if (
    /https?:\/\/|www\./i.test(
      cleanMessage
    )
  ) {
    const error = new Error(
      "문구에는 외부 링크를 넣을 수 없습니다."
    );
    error.status = 400;
    throw error;
  }

  const reservation =
    await reserveSuggestionSlot(user.id);
  let suggestion;
  try {
    suggestion =
      await CoachMessageSuggestion.create({
        userId: user.id,
        authorName:
          user.name || "학생",
        mode,
        situation,
        message: cleanMessage,
        requestId:
          cleanRequestId || null,
      });
  } catch (error) {
    await releaseSuggestionSlot({
      userId: user.id,
      dayKey: reservation.dayKey,
    });
    if (
      error?.code === 11000 &&
      cleanRequestId
    ) {
      const existing =
        await CoachMessageSuggestion.findOne({
          userId: user.id,
          requestId: cleanRequestId,
        });
      if (existing) {
        await ensureSuggestionAdminTodo(
          existing
        );
        return serializeSuggestion(existing);
      }
    }
    throw error;
  }

  await ensureSuggestionAdminTodo(
    suggestion
  );

  return serializeSuggestion(
    suggestion
  );
}

async function moderateSuggestion({
  adminUser,
  suggestionId,
  action,
  rejectionReason,
}) {
  if (!isCoachAdmin(adminUser)) {
    const error = new Error(
      "운영자만 문구를 검수할 수 있습니다."
    );
    error.status = 403;
    throw error;
  }

  if (
    !mongoose.isValidObjectId(
      suggestionId
    )
  ) {
    const error = new Error(
      "대기 중인 문구를 찾을 수 없습니다."
    );
    error.status = 404;
    throw error;
  }

  const approved =
    action === "approve";
  const rejected =
    action === "reject";

  if (!approved && !rejected) {
    const error = new Error(
      "승인 또는 반려를 선택해주세요."
    );
    error.status = 400;
    throw error;
  }

  const cleanRejectionReason =
    sanitizeMessage(
      rejectionReason
    ).slice(0, 200);

  if (
    rejected &&
    !cleanRejectionReason
  ) {
    const error = new Error(
      "반려 사유를 입력해주세요."
    );
    error.status = 400;
    throw error;
  }

  const suggestion =
    await CoachMessageSuggestion.findOneAndUpdate(
      {
        _id: suggestionId,
        status: "pending",
      },
      {
        $set: {
          status: approved
            ? "approved"
            : "rejected",
          moderatedBy:
            adminUser.id,
          moderatedAt:
            new Date(),
          rejectionReason: approved
            ? ""
            : cleanRejectionReason,
        },
      },
      {
        returnDocument: "after",
      }
    );

  if (!suggestion) {
    const error = new Error(
      "대기 중인 문구를 찾을 수 없습니다."
    );
    error.status = 404;
    throw error;
  }

  const targetUser =
    await User.findById(
      suggestion.userId
    )
      .select(
        "name realName email"
      )
      .lean();
  const noticeTitle = approved
    ? "제안한 코치 문구가 승인되었습니다."
    : "제안한 코치 문구가 반려되었습니다.";
  const noticeMessage = approved
    ? `제안 문구: ${suggestion.message}\n운영자 검수를 통과해 코치 문구에 반영되었습니다.`
    : `제안 문구: ${suggestion.message}\n반려 사유: ${cleanRejectionReason}`;
  let noticeResult = {
    notification: null,
    delivery: {
      delivered: false,
      error:
        "제안 사용자를 찾을 수 없습니다.",
    },
  };

  if (targetUser) {
    noticeResult =
      await deliverModerationNotice({
        user: targetUser,
        title: noticeTitle,
        message: noticeMessage,
        kind: "admin",
        href: "/coach-suggestions",
        createdBy:
          adminUser.id,
        emailSubject:
          noticeTitle,
        emailMessage:
          noticeMessage,
      });
  }

  await AdminActionLog.create({
    adminUserId:
      adminUser.id,
    targetUserId:
      suggestion.userId,
    action: approved
      ? "coach-suggestion.approve"
      : "coach-suggestion.reject",
    detail: approved
      ? `코치 문구 승인: ${suggestion.message}`
      : `코치 문구 반려: ${suggestion.message}`,
    metadata: {
      suggestionId:
        String(suggestion._id),
      mode: suggestion.mode,
      situation:
        suggestion.situation,
      moderationStatus:
        suggestion.status,
      rejectionReason: approved
        ? ""
        : cleanRejectionReason,
      siteNotificationId:
        noticeResult.notification
          ? String(
              noticeResult.notification
                ._id
            )
          : "",
      emailStatus:
        noticeResult.delivery
          ?.delivered
          ? "SENT"
          : "FAILED",
      emailProviderMessageId:
        noticeResult.delivery
          ?.providerMessageId || "",
      emailLastError:
        noticeResult.delivery
          ?.error || "",
    },
  });

  await completeAdminTodoBySource({
    sourceType:
      "CoachMessageSuggestion",
    sourceId:
      suggestion._id,
    adminUserId:
      adminUser.id,
  });

  await refreshCommunityCoachMessages();

  return serializeSuggestion(
    suggestion
  );
}

module.exports = {
  DAILY_SUGGESTION_LIMIT,
  createSuggestion,
  ensureCoachSuggestionIndexes,
  getSuggestionBoardData,
  getAdminSuggestionData,
  isCoachAdmin,
  moderateSuggestion,
  refreshCommunityCoachMessages,
  _testing: {
    getKoreanDayRange,
  },
};
