const mongoose = require("mongoose");
const { User } = require("../models/matthsModel");

function isSuperAdminUser(user) {
  return user?.role === "admin" && user?.accountStatus !== "withdrawn" && user?.isActive !== false;
}

async function isSuperAdminUserId(userId) {
  if (!mongoose.isValidObjectId(userId)) return false;
  const user = await User.findOne({
    _id: userId,
    role: "admin",
    isActive: { $ne: false },
    accountStatus: { $ne: "withdrawn" },
  })
    .select("_id")
    .lean();
  return Boolean(user);
}

function superAdminPackageAccess() {
  return {
    active: true,
    unlimited: true,
    noExpiry: true,
    reason: null,
    state: "SUPER_ADMIN_UNLIMITED",
    cycle: null,
    packageType: "SUPER_ADMIN",
  };
}

module.exports = {
  isSuperAdminUser,
  isSuperAdminUserId,
  superAdminPackageAccess,
};
