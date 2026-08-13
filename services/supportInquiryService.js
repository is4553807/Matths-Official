const mongoose = require("mongoose");
const {
  SupportInquiry,
  User,
} = require("../models/matthsModel");
const {
  ParentAccount,
  ParentChildLink,
} = require("../models/parentModel");
const {
  sendSupportInquiryNotification,
} = require("./emailService");
const {
  createAdminTodo,
} = require("./adminTodoService");
const {
  createRefundRequest,
  listRefundableOrders,
} = require("./refundService");

const SUBJECT_MIN_LENGTH = 2;
const SUBJECT_MAX_LENGTH = 120;
const CONTENT_MIN_LENGTH = 10;
const CONTENT_MAX_LENGTH = 5000;
const SUBMISSION_COOLDOWN_MS =
  60 * 1000;

function createStatusError(
  status,
  message
) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeSubject(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeContent(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function serializeInquiry(inquiry) {
  return {
    id: String(inquiry._id),
    subject: inquiry.subject,
    status: inquiry.status,
    notificationStatus:
      inquiry.emailNotification
        ?.status || "pending",
    createdAt: inquiry.createdAt,
    repliedAt:
      inquiry.adminReply
        ?.repliedAt || null,
  };
}

async function resolveParentInquiryContext({
  parentAccountId,
  userId,
}) {
  if (
    !mongoose.isValidObjectId(parentAccountId) ||
    !mongoose.isValidObjectId(userId)
  ) {
    throw createStatusError(
      404,
      "학부모와 자녀 연결 정보를 찾을 수 없습니다."
    );
  }

  const [parent, user, link] = await Promise.all([
    ParentAccount.findOne({
      _id: parentAccountId,
      isActive: true,
    }).lean(),
    User.findOne({
      _id: userId,
      isActive: true,
    }).lean(),
    ParentChildLink.findOne({
      parentAccountId,
      childUserId: userId,
      status: "ACTIVE",
    }).lean(),
  ]);

  if (!parent || !user || !link) {
    throw createStatusError(
      403,
      "연결된 자녀에 대해서만 문의할 수 있습니다."
    );
  }

  return { parent, user };
}

function parentContactSnapshot(parent, user) {
  const childName = String(
    user.realName || user.name || "학생"
  ).trim();
  return {
    nickname: String(
      parent.username || "학부모"
    ).slice(0, 30),
    realName: `${childName} 학생 학부모`.slice(0, 40),
    email: String(parent.email || "")
      .trim()
      .toLowerCase(),
    schoolName: String(
      user.school?.name ||
        user.university?.name ||
        ""
    ).slice(0, 120),
  };
}

async function getParentInquiryPageData({
  parentAccountId,
  userId,
}) {
  const { parent, user } =
    await resolveParentInquiryContext({
      parentAccountId,
      userId,
    });
  const inquiries = await SupportInquiry.find({
    parentAccountId: parent._id,
    userId: user._id,
    submittedByType: "PARENT",
  })
    .sort({ createdAt: -1 })
    .limit(12)
    .lean();

  return {
    contactEmail: String(parent.email || ""),
    inquiries: inquiries.map(serializeInquiry),
  };
}

async function getContactPageData(
  userId
) {
  const [user, inquiries, refundableOrders] =
    await Promise.all([
      User.findOne({
        _id: userId,
        isActive: true,
      }).lean(),
      SupportInquiry.find({
        userId,
        $or: [
          { submittedByType: "STUDENT" },
          { submittedByType: { $exists: false } },
        ],
      })
        .sort({
          createdAt: -1,
        })
        .limit(8)
        .lean(),
      listRefundableOrders(userId),
    ]);

  if (!user) {
    throw createStatusError(
      404,
      "사용자 정보를 찾을 수 없습니다."
    );
  }

  return {
    user: {
      id: String(user._id),
      nickname:
        String(user.name || "학생"),
      realName:
        String(user.realName || ""),
      email:
        String(user.email || ""),
      schoolName:
        String(
          user.school?.name ||
            "학교 미설정"
        ),
      schoolGrade:
        Number(user.schoolGrade) || null,
    },
    inquiries:
      inquiries.map(
        serializeInquiry
      ),
    refundableOrders,
  };
}

async function createSupportInquiry({
  userId,
  parentAccountId = null,
  subject,
  content,
  inquiryType = "GENERAL",
  paymentId = "",
  refundReasonType = "SIMPLE_CHANGE",
}) {
  const cleanSubject =
    normalizeSubject(subject);
  const cleanContent =
    normalizeContent(content);
  const normalizedType = String(inquiryType || "GENERAL").toUpperCase() === "REFUND"
    ? "REFUND"
    : "GENERAL";

  if (
    cleanSubject.length <
      SUBJECT_MIN_LENGTH ||
    cleanSubject.length >
      SUBJECT_MAX_LENGTH
  ) {
    throw createStatusError(
      400,
      `제목은 ${SUBJECT_MIN_LENGTH}자 이상 ${SUBJECT_MAX_LENGTH}자 이하로 작성해주세요.`
    );
  }

  if (
    cleanContent.length <
      CONTENT_MIN_LENGTH ||
    cleanContent.length >
      CONTENT_MAX_LENGTH
  ) {
    throw createStatusError(
      400,
      `내용은 ${CONTENT_MIN_LENGTH}자 이상 ${CONTENT_MAX_LENGTH}자 이하로 작성해주세요.`
    );
  }

  let user;
  let parent = null;
  if (parentAccountId) {
    const context =
      await resolveParentInquiryContext({
        parentAccountId,
        userId,
      });
    user = context.user;
    parent = context.parent;
  } else {
    user = await User.findOne({
      _id: userId,
      isActive: true,
    }).lean();
  }

  if (!user) {
    throw createStatusError(
      404,
      "사용자 정보를 찾을 수 없습니다."
    );
  }

  if (parent && normalizedType === "REFUND") {
    throw createStatusError(
      400,
      "환불 요청은 결제·환불 관리에서 주문별로 신청해주세요."
    );
  }

  const recentInquiry =
    await SupportInquiry.exists({
      userId,
      ...(parent
        ? {
            parentAccountId: parent._id,
            submittedByType: "PARENT",
          }
        : {
            $or: [
              { submittedByType: "STUDENT" },
              { submittedByType: { $exists: false } },
            ],
          }),
      createdAt: {
        $gte: new Date(
          Date.now() -
            SUBMISSION_COOLDOWN_MS
        ),
      },
    });

  if (recentInquiry) {
    throw createStatusError(
      429,
      "문의가 이미 접수되었습니다. 잠시 후 다시 작성해주세요."
    );
  }

  const contactUser = parent
    ? parentContactSnapshot(parent, user)
    : {
        nickname:
          String(user.name || "학생"),
        realName:
          String(user.realName || ""),
        email:
          String(user.email || "")
            .trim()
            .toLowerCase(),
        schoolName:
          String(user.school?.name || ""),
      };
  const session = await mongoose.startSession();
  let inquiry;
  try {
    await session.withTransaction(async () => {
      [inquiry] = await SupportInquiry.create([{
        userId: user._id,
        submittedByType: parent ? "PARENT" : "STUDENT",
        parentAccountId: parent?._id || null,
        authorNickname: contactUser.nickname,
        authorRealName: contactUser.realName,
        contactEmail: contactUser.email,
        schoolName: contactUser.schoolName,
        inquiryType: normalizedType,
        subject: cleanSubject,
        content: cleanContent,
      }], { session });
      if (normalizedType === "REFUND") {
        const refundRequest = await createRefundRequest({
          userId: user._id,
          paymentId,
          reasonType: refundReasonType,
          reasonDetail: cleanContent,
          supportInquiryId: inquiry._id,
          session,
        });
        inquiry.paymentId = refundRequest.paymentId;
        inquiry.refundRequestId = refundRequest._id;
        inquiry.orderReferenceSnapshot = refundRequest.orderReferenceSnapshot;
        await inquiry.save({ session });
      }
    });
  } finally {
    await session.endSession();
  }

  await createAdminTodo({
    category: "inquiry",
    title: `${normalizedType === "REFUND" ? "환불 신청" : "문의 확인"} · ${cleanSubject}`,
    description: cleanContent,
    href: `/admin/inquiries#inquiry-${inquiry._id}`,
    targetUserId: user._id,
    actorUserId: parent ? null : user._id,
    sourceType: "SupportInquiry",
    sourceId: inquiry._id,
  });

  let notification = {
    status: "pending",
    providerMessageId: "",
    errorMessage: "",
  };

  try {
    const delivery =
      await sendSupportInquiryNotification({
        inquiryId:
          String(inquiry._id),
        user: contactUser,
        subject: normalizedType === "REFUND" ? `[환불] ${cleanSubject}` : cleanSubject,
        content: normalizedType === "REFUND"
          ? `주문번호: ${inquiry.orderReferenceSnapshot}\n\n${cleanContent}`
          : cleanContent,
      });

    notification = {
      status:
        delivery.delivered
          ? "sent"
          : "failed",
      providerMessageId:
        delivery
          .providerMessageId || "",
      errorMessage: "",
    };
  } catch (error) {
    notification = {
      status: "failed",
      providerMessageId: "",
      errorMessage:
        String(
          error.message ||
            "이메일 알림 전송 실패"
        ).slice(0, 300),
    };
  }

  await SupportInquiry.updateOne(
    {
      _id: inquiry._id,
    },
    {
      $set: {
        "emailNotification.status":
          notification.status,
        "emailNotification.attemptedAt":
          new Date(),
        "emailNotification.providerMessageId":
          notification.providerMessageId,
        "emailNotification.errorMessage":
          notification.errorMessage,
      },
    }
  );

  return {
    inquiry: serializeInquiry({
      ...inquiry.toObject(),
      emailNotification:
        notification,
    }),
    emailDelivered:
      notification.status ===
      "sent",
    emailStatus:
      notification.status,
  };
}

module.exports = {
  CONTENT_MAX_LENGTH,
  CONTENT_MIN_LENGTH,
  SUBJECT_MAX_LENGTH,
  SUBJECT_MIN_LENGTH,
  SUBMISSION_COOLDOWN_MS,
  createSupportInquiry,
  getContactPageData,
  getParentInquiryPageData,
  normalizeContent,
  normalizeSubject,
  _testing: {
    parentContactSnapshot,
  },
};
