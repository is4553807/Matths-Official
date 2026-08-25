const {
  User,
} = require("../models/matthsModel");

const ACCOUNT_STATUS_LABELS = {
  active: "활성",
  inactive: "비활성화",
  suspended: "정지",
  withdrawn: "탈퇴",
};
const ACCOUNT_ACCESS_SELECT = [
  "name realName email role",
  "tokenVersion school schoolGrade educationStatus university preferences",
  "currentStreak lastStudyDate totalConnectedSeconds",
  "isActive accountStatus accountStatusReason accountStatusChangedAt suspendedUntil",
].join(" ");

function normalizedAccountStatus(
  user
) {
  const stored =
    String(
      user?.accountStatus ||
        ""
    );

  if (
    Object.prototype.hasOwnProperty.call(
      ACCOUNT_STATUS_LABELS,
      stored
    )
  ) {
    return stored;
  }

  return user?.isActive === false
    ? "inactive"
    : "active";
}

async function synchronizeAccountAccess(
  userId
) {
  const user =
    await User.findById(userId)
      .select(
        ACCOUNT_ACCESS_SELECT
      );

  if (!user) {
    return null;
  }

  let status =
    normalizedAccountStatus(user);
  const suspensionEnded =
    status === "suspended" &&
    user.suspendedUntil &&
    user.suspendedUntil.getTime() <=
      Date.now();

  if (suspensionEnded) {
    user.accountStatus =
      "active";
    user.accountStatusReason =
      "정지 기간 만료";
    user.accountStatusChangedAt =
      new Date();
    user.suspendedUntil = null;
    user.isActive = true;
    user.tokenVersion =
      (Number(user.tokenVersion) ||
        0) + 1;
    await user.save();
    status = "active";
  }

  return {
    user,
    status,
    allowed:
      status === "active" &&
      user.isActive !== false,
  };
}

function accountBlockedMessage(
  status,
  reason = ""
) {
  const normalized =
    normalizedAccountStatus({
      accountStatus: status,
      isActive:
        status === "active",
    });
  const reasonText =
    String(reason || "").trim();
  const base = {
    inactive:
      "비활성화된 계정입니다.",
    suspended:
      "이용이 정지된 계정입니다.",
    withdrawn:
      "탈퇴 처리된 계정입니다.",
  }[normalized] ||
  "이용할 수 없는 계정입니다.";

  return reasonText
    ? `${base} 사유: ${reasonText}`
    : base;
}

module.exports = {
  ACCOUNT_STATUS_LABELS,
  accountBlockedMessage,
  normalizedAccountStatus,
  synchronizeAccountAccess,
};
