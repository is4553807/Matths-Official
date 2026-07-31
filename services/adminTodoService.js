const mongoose = require("mongoose");
const {
  AdminTodo,
  CoachMessageSuggestion,
  CommunityReport,
  PrivateMockIntegrityCase,
  PrivateMockObjection,
  SupportInquiry,
  User,
} = require("../models/matthsModel");

const TODO_PAGE_SIZE = 20;
const SOURCE_SYNC_INTERVAL_MS =
  30 * 1000;
let lastSourceSyncAt = 0;

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function safeInternalHref(value) {
  const href = String(value || "").trim();
  return /^\/(?!\/)/.test(href)
    ? href
    : "/admin/todos";
}

function parseSeoulDay(value, endOfDay = false) {
  const day =
    String(value || "").trim();
  if (!day) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      day
    )
  ) {
    throw statusError(
      400,
      "날짜 필터 형식을 확인해주세요."
    );
  }
  return new Date(
    `${day}T${
      endOfDay
        ? "23:59:59.999"
        : "00:00:00.000"
    }+09:00`
  );
}

async function createAdminTodo({
  category,
  title,
  description = "",
  href,
  targetUserId = null,
  actorUserId = null,
  sourceType,
  sourceId,
  metadata = {},
  createdAt = null,
}) {
  if (!mongoose.isValidObjectId(sourceId)) {
    throw statusError(
      400,
      "관리자 할 일의 원본 정보를 확인할 수 없습니다."
    );
  }

  const update = {
    $setOnInsert: {
      category,
      title: String(title || "").trim().slice(0, 160),
      description: String(description || "").trim().slice(0, 1000),
      href: safeInternalHref(href),
      targetUserId,
      actorUserId,
      sourceType,
      sourceId,
      status: "pending",
      metadata,
      ...(createdAt
        ? {
            createdAt,
          }
        : {}),
    },
  };

  return AdminTodo.findOneAndUpdate(
    { sourceType, sourceId },
    update,
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  );
}

async function ensureAdminTodosFromSources() {
  if (
    Date.now() -
      lastSourceSyncAt <
    SOURCE_SYNC_INTERVAL_MS
  ) {
    return;
  }
  lastSourceSyncAt =
    Date.now();
  const [inquiries, reports, integrityCases, suggestions, objections] =
    await Promise.all([
      SupportInquiry.find({
        status: { $in: ["pending", "in_review"] },
      })
        .select("_id userId subject content createdAt")
        .lean(),
      CommunityReport.find({
        status: { $in: ["pending", "reviewing"] },
      })
        .select(
          "_id postId reporterUserId reportedUserId reason createdAt"
        )
        .lean(),
      PrivateMockIntegrityCase.find({
        status: { $in: ["SUBMITTED", "UNDER_REVIEW"] },
        "evidenceSubmissions.0": { $exists: true },
      })
        .select(
          "_id examId userId requestedQuestionNumbers evidenceSubmissions createdAt"
        )
        .lean(),
      CoachMessageSuggestion.find({
        status: "pending",
      })
        .select(
          "_id userId authorName message createdAt"
        )
        .lean(),
      PrivateMockObjection.find({
        status: {
          $in: [
            "pending",
            "reviewing",
          ],
        },
      })
        .select(
          "_id userId examTitle questionNumber issueDetail createdAt"
        )
        .lean(),
    ]);

  await Promise.all([
    ...inquiries.map((inquiry) =>
      createAdminTodo({
        category: "inquiry",
        title: `문의 확인 · ${inquiry.subject}`,
        description: inquiry.content,
        href: `/admin/inquiries#inquiry-${inquiry._id}`,
        targetUserId: inquiry.userId,
        actorUserId: inquiry.userId,
        sourceType: "SupportInquiry",
        sourceId: inquiry._id,
        createdAt: inquiry.createdAt,
      })
    ),
    ...reports.map((report) =>
      createAdminTodo({
        category: "community-report",
        title: "게시글 신고 접수",
        description: report.reason,
        href: `/admin/community?report=${report._id}#report-${report._id}`,
        targetUserId: report.reportedUserId,
        actorUserId: report.reporterUserId,
        sourceType: "CommunityReport",
        sourceId: report._id,
        createdAt: report.createdAt,
      })
    ),
    ...integrityCases.map((integrityCase) => {
      const latest =
        integrityCase.evidenceSubmissions[
          integrityCase.evidenceSubmissions.length - 1
        ];
      return createAdminTodo({
        category: "integrity",
        title: "Matths 주간 공식 모의고사 소명 자료 검토",
        description: `요청 문항 ${integrityCase.requestedQuestionNumbers.join(
          ", "
        )}번 · 접수번호 ${latest?.receiptId || "확인 필요"}`,
        href: `/admin/private-mock-exams/${integrityCase.examId}#integrity-${integrityCase._id}`,
        targetUserId: integrityCase.userId,
        actorUserId: integrityCase.userId,
        sourceType: "PrivateMockIntegrityCase",
        sourceId: integrityCase._id,
        createdAt: latest?.submittedAt || integrityCase.createdAt,
      });
    }),
    ...suggestions.map((suggestion) =>
      createAdminTodo({
        category: "other",
        title: "코치 문구 제안 검토",
        description: suggestion.message,
        href: `/admin/coach-suggestions#suggestion-${suggestion._id}`,
        targetUserId: suggestion.userId,
        actorUserId: suggestion.userId,
        sourceType:
          "CoachMessageSuggestion",
        sourceId: suggestion._id,
        createdAt:
          suggestion.createdAt,
      })
    ),
    ...objections.map((objection) =>
      createAdminTodo({
        category: "other",
        title:
          `Matths 주간 공식 모의고사 ${objection.questionNumber}번 이의신청`,
        description:
          `${objection.examTitle} · ${objection.issueDetail}`,
        href:
          `/admin/private-mock-objections/${objection._id}`,
        targetUserId:
          objection.userId,
        actorUserId:
          objection.userId,
        sourceType:
          "PrivateMockObjection",
        sourceId:
          objection._id,
        createdAt:
          objection.createdAt,
      })
    ),
  ]);
}

async function getAdminTodoSummary() {
  await ensureAdminTodosFromSources();
  const [pendingCount, items] = await Promise.all([
    AdminTodo.countDocuments({ status: "pending" }),
    AdminTodo.find({ status: "pending" })
      .sort({ createdAt: 1 })
      .limit(6)
      .populate("actorUserId", "name realName")
      .lean(),
  ]);

  return { pendingCount, items };
}

async function getAdminTodoData({
  category,
  status = "pending",
  page,
  dateFrom,
  dateTo,
  nickname,
}) {
  await ensureAdminTodosFromSources();
  const normalizedStatus =
    status === "completed" ? "completed" : "pending";
  const normalizedCategory = [
    "inquiry",
    "community-report",
    "integrity",
    "other",
  ].includes(category)
    ? category
    : "";
  const currentPage = Math.max(
    1,
    Number.parseInt(page, 10) || 1
  );
  const cleanNickname =
    String(nickname || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
  const fromDate =
    parseSeoulDay(dateFrom);
  const toDate =
    parseSeoulDay(
      dateTo,
      true
    );
  let matchingUserIds = [];
  if (cleanNickname) {
    const escaped =
      cleanNickname.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );
    const users = await User.find({
      $or: [
        {
          name: {
            $regex: escaped,
            $options: "i",
          },
        },
        {
          realName: {
            $regex: escaped,
            $options: "i",
          },
        },
      ],
    })
      .select("_id")
      .lean();
    matchingUserIds = users.map(
      (user) => user._id
    );
  }
  const dateField =
    normalizedStatus === "completed"
      ? "completedAt"
      : "createdAt";
  const filter = {
    status: normalizedStatus,
    ...(normalizedCategory
      ? { category: normalizedCategory }
      : {}),
    ...(fromDate || toDate
      ? {
          [dateField]: {
            ...(fromDate
              ? {
                  $gte: fromDate,
                }
              : {}),
            ...(toDate
              ? {
                  $lte: toDate,
                }
              : {}),
          },
        }
      : {}),
    ...(cleanNickname
      ? {
          $or: [
            {
              actorUserId: {
                $in:
                  matchingUserIds,
              },
            },
            {
              targetUserId: {
                $in:
                  matchingUserIds,
              },
            },
          ],
        }
      : {}),
  };
  const total = await AdminTodo.countDocuments(filter);
  const totalPages = Math.max(
    1,
    Math.ceil(total / TODO_PAGE_SIZE)
  );
  const safePage = Math.min(currentPage, totalPages);
  const items = await AdminTodo.find(filter)
    .sort(
      normalizedStatus === "pending"
        ? { createdAt: 1 }
        : { completedAt: -1 }
    )
    .skip((safePage - 1) * TODO_PAGE_SIZE)
    .limit(TODO_PAGE_SIZE)
    .populate("targetUserId", "name realName email")
    .populate("actorUserId", "name realName email")
    .populate("completedBy", "name realName")
    .lean();

  return {
    items,
    filter: {
      category: normalizedCategory,
      status: normalizedStatus,
      dateFrom:
        String(dateFrom || ""),
      dateTo:
        String(dateTo || ""),
      nickname:
        cleanNickname,
    },
    pagination: {
      page: safePage,
      total,
      totalPages,
      hasPrevious: safePage > 1,
      hasNext: safePage < totalPages,
    },
  };
}

async function completeAdminTodo({
  todoId,
  adminUserId,
}) {
  const todo = await AdminTodo.findOneAndUpdate(
    { _id: todoId, status: "pending" },
    {
      $set: {
        status: "completed",
        completedAt: new Date(),
        completedBy: adminUserId,
      },
    },
    { returnDocument: "after" }
  );
  if (!todo) {
    throw statusError(
      404,
      "완료할 관리자 할 일을 찾을 수 없습니다."
    );
  }
  return todo;
}

async function reopenAdminTodo({
  todoId,
  adminUserId,
}) {
  const reopenedAt = new Date();
  const todo = await AdminTodo.findOneAndUpdate(
    { _id: todoId, status: "completed" },
    {
      $set: {
        status: "pending",
        completedAt: null,
        completedBy: null,
        "metadata.reopenedAt":
          reopenedAt,
        "metadata.reopenedBy":
          adminUserId,
      },
    },
    { returnDocument: "after" }
  );
  if (!todo) {
    throw statusError(
      404,
      "재검토할 관리자 할 일을 찾을 수 없습니다."
    );
  }
  return todo;
}

async function completeAdminTodoBySource({
  sourceType,
  sourceId,
  adminUserId,
}) {
  return AdminTodo.findOneAndUpdate(
    { sourceType, sourceId, status: "pending" },
    {
      $set: {
        status: "completed",
        completedAt: new Date(),
        completedBy: adminUserId,
      },
    }
  );
}

module.exports = {
  TODO_PAGE_SIZE,
  completeAdminTodo,
  completeAdminTodoBySource,
  createAdminTodo,
  getAdminTodoData,
  getAdminTodoSummary,
  reopenAdminTodo,
};
