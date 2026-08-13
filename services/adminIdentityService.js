const { User } = require("../models/matthsModel");

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function getActiveAdminSender(adminUserId) {
  const admin = await User.findOne({
    _id: adminUserId,
    role: "admin",
    isActive: true,
    accountStatus: { $nin: ["inactive", "suspended", "withdrawn"] },
  })
    .select("name realName email lastLoginAt")
    .lean();

  if (!admin?.email) {
    throw statusError(403, "현재 로그인한 운영자 메일 계정을 확인할 수 없습니다.");
  }

  return {
    id: String(admin._id),
    name: String(admin.realName || admin.name || "운영자"),
    email: String(admin.email).trim().toLowerCase(),
    loginAt: admin.lastLoginAt || null,
  };
}

module.exports = { getActiveAdminSender };
