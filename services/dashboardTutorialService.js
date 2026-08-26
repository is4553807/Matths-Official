const mongoose = require("mongoose");
const { User } = require("../models/matthsModel");

const DASHBOARD_TUTORIAL_STATUSES = Object.freeze([
  "NOT_REQUIRED",
  "PENDING",
  "COMPLETED",
  "SKIPPED",
]);

const DASHBOARD_TUTORIAL_ACTIONS = Object.freeze([
  "RESTART",
  "COMPLETE",
  "SKIP",
]);

function dashboardTutorialView(preferences = {}) {
  const candidate = String(
    preferences?.dashboardTutorialStatus || "NOT_REQUIRED"
  ).toUpperCase();
  const status = DASHBOARD_TUTORIAL_STATUSES.includes(candidate)
    ? candidate
    : "NOT_REQUIRED";

  return {
    status,
    shouldAutoStart: status === "PENDING",
    completedAt: preferences?.dashboardTutorialCompletedAt || null,
    skippedAt: preferences?.dashboardTutorialSkippedAt || null,
  };
}

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function updateDashboardTutorial({ userId, action }) {
  if (!mongoose.isValidObjectId(userId)) {
    throw statusError(404, "사용자 정보를 찾을 수 없습니다.");
  }

  const normalizedAction = String(action || "").trim().toUpperCase();
  if (!DASHBOARD_TUTORIAL_ACTIONS.includes(normalizedAction)) {
    throw statusError(400, "올바른 튜토리얼 동작이 아닙니다.");
  }

  const now = new Date();
  const status = normalizedAction === "RESTART"
    ? "PENDING"
    : normalizedAction === "COMPLETE"
      ? "COMPLETED"
      : "SKIPPED";
  const update = {
    $set: {
      "preferences.dashboardTutorialStatus": status,
      ...(normalizedAction === "COMPLETE"
        ? { "preferences.dashboardTutorialCompletedAt": now }
        : normalizedAction === "SKIP"
          ? { "preferences.dashboardTutorialSkippedAt": now }
          : {}),
    },
    $unset: {},
  };

  if (normalizedAction !== "COMPLETE") {
    update.$unset["preferences.dashboardTutorialCompletedAt"] = 1;
  }
  if (normalizedAction !== "SKIP") {
    update.$unset["preferences.dashboardTutorialSkippedAt"] = 1;
  }

  const user = await User.findByIdAndUpdate(userId, update, {
    new: true,
    runValidators: true,
  })
    .select("preferences")
    .lean();

  if (!user) {
    throw statusError(404, "사용자 정보를 찾을 수 없습니다.");
  }

  return dashboardTutorialView(user.preferences);
}

module.exports = {
  DASHBOARD_TUTORIAL_ACTIONS,
  DASHBOARD_TUTORIAL_STATUSES,
  dashboardTutorialView,
  updateDashboardTutorial,
};
