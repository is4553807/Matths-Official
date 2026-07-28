const {
  CoachMessageSuggestion,
} = require("../models/matthsModel");
const {
  MODES,
  SITUATIONS,
  setCommunityCoachMessages,
} = require("./coachMessageService");

const ADMIN_EMAIL =
  String(
    process.env.ADMIN_EMAIL ||
      "admin@lsbproduction.com"
  )
    .trim()
    .toLowerCase();

function isCoachAdmin(user) {
  return (
    user?.role === "admin" ||
    String(user?.email || "")
      .trim()
      .toLowerCase() ===
      ADMIN_EMAIL
  );
}

function sanitizeMessage(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
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

async function createSuggestion({
  user,
  mode,
  situation,
  message,
}) {
  const cleanMessage =
    sanitizeMessage(message);

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

  const recentCount =
    await CoachMessageSuggestion.countDocuments(
      {
        userId: user.id,
        createdAt: {
          $gte: new Date(
            Date.now() -
              24 * 60 * 60 * 1000
          ),
        },
      }
    );

  if (recentCount >= 10) {
    const error = new Error(
      "하루에는 문구를 10개까지 제안할 수 있습니다."
    );
    error.status = 429;
    throw error;
  }

  const suggestion =
    await CoachMessageSuggestion.create({
      userId: user.id,
      authorName:
        user.name || "학생",
      mode,
      situation,
      message: cleanMessage,
    });

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
            : sanitizeMessage(
                rejectionReason
              ).slice(0, 200),
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

  await refreshCommunityCoachMessages();

  return serializeSuggestion(
    suggestion
  );
}

module.exports = {
  ADMIN_EMAIL,
  createSuggestion,
  getSuggestionBoardData,
  isCoachAdmin,
  moderateSuggestion,
  refreshCommunityCoachMessages,
};
