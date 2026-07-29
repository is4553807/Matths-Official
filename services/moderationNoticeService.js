const {
  UserNotification,
} = require("../models/matthsModel");
const {
  sendAdminUserEmail,
} = require("./emailService");
const {
  professionalNotice,
} = require("../content/email/moderation");

function safeInternalHref(value) {
  const href = String(
    value || ""
  ).trim();

  return /^\/(?!\/)/.test(href)
    ? href
    : "/notifications";
}

function buildProfessionalEmail({
  user,
  title,
  message,
}) {
  return professionalNotice({
    user,
    title,
    message,
  });
}

async function deliverModerationNotice({
  user,
  title,
  message,
  kind = "admin",
  href = "/notifications",
  createdBy = null,
  emailSubject = "",
  emailMessage = "",
}) {
  if (!user?._id || !user?.email) {
    const error = new Error(
      "알림을 받을 사용자 정보를 찾을 수 없습니다."
    );
    error.status = 404;
    throw error;
  }

  const notification =
    await UserNotification.create({
      userId: user._id,
      title,
      message,
      href:
        safeInternalHref(href),
      kind,
      createdBy,
    });

  let delivery = {
    delivered: false,
    preview: false,
  };

  try {
    delivery =
      await sendAdminUserEmail({
        to: user.email,
        subject:
          emailSubject || title,
        message:
          buildProfessionalEmail({
            user,
            title,
            message:
              emailMessage ||
              message,
          }),
      });
  } catch (error) {
    /*
     * 계정 제재와 사이트 우편 저장은 이메일 사업자 장애 때문에
     * 되돌아가면 안 됩니다. 실패는 기록하고 운영 화면의 제재는
     * 정상 완료되도록 합니다.
     */
    console.error(
      "[moderation-notice] 이메일 발송 실패",
      {
        userId:
          String(user._id),
        notificationId:
          String(
            notification._id
          ),
        message:
          error?.message || "",
      }
    );
    delivery = {
      delivered: false,
      preview: false,
      error:
        error?.message ||
        "이메일 발송 실패",
    };
  }

  return {
    notification,
    delivery,
  };
}

module.exports = {
  deliverModerationNotice,
  safeInternalHref,
};
