const {
  createSupportInquiry,
  getContactPageData,
} = require("../services/supportInquiryService");

function serializeInquiry(inquiry) {
  return {
    id: String(inquiry.id || ""),
    subject: String(inquiry.subject || ""),
    status: String(inquiry.status || "pending"),
    notificationStatus: String(inquiry.notificationStatus || "pending"),
    createdAt: inquiry.createdAt || null,
    repliedAt: inquiry.repliedAt || null,
  };
}

async function dashboardPayload(userId) {
  const data = await getContactPageData(userId);
  return {
    contact: {
      nickname: String(data.user.nickname || ""),
      realName: String(data.user.realName || ""),
      email: String(data.user.email || ""),
    },
    inquiries: data.inquiries.map(serializeInquiry),
  };
}

exports.dashboard = async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    return res.json(await dashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const result = await createSupportInquiry({
      userId: req.apiUser._id,
      requestId: req.get("idempotency-key") || req.body.requestId,
      subject: req.body.subject,
      content: req.body.content,
      // App Store 결제 환불은 Apple 결제 화면이 소유한다. 이 앱 경로는 일반 문의만
      // 접수해 웹의 Toss 환불 주문 ID를 모바일이 임의로 제출하지 못하게 한다.
      inquiryType: "GENERAL",
    });
    res.set("Cache-Control", "private, no-store");
    return res.status(201).json({
      ...(await dashboardPayload(req.apiUser._id)),
      submission: {
        emailStatus: result.emailStatus,
        emailDelivered: result.emailDelivered,
      },
    });
  } catch (error) {
    return next(error);
  }
};
