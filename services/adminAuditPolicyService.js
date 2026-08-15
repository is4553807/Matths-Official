const USER_APPLIED_EXACT_ACTIONS = Object.freeze([
  "finance.payback-completed",
  "finance.payback-email-resent",
  "inquiry.reply",
  "coach-suggestion.approve",
  "coach-suggestion.reject",
]);

function isUserAppliedAdminAction(action) {
  const value = String(action || "").trim();
  if (!value || /^admin\.request\./.test(value)) return false;
  if (/^user\./.test(value)) return true;
  if (USER_APPLIED_EXACT_ACTIONS.includes(value)) return true;
  if (/^community\.(?:post|comment)-(?:hide|restore|delete|warning)$/.test(value)) {
    return true;
  }
  if (/^private-mock\.integrity-/.test(value)) return true;
  if (/^arena\.integrity\./.test(value) && !/\.note$/.test(value)) return true;
  return false;
}

const USER_APPLIED_ACTION_FILTER = Object.freeze({
  $or: [
    { action: /^user\./ },
    { action: { $in: USER_APPLIED_EXACT_ACTIONS } },
    { action: /^community\.(?:post|comment)-(?:hide|restore|delete|warning)$/ },
    { action: /^private-mock\.integrity-/ },
    {
      $and: [
        { action: /^arena\.integrity\./ },
        { action: { $not: /\.note$/ } },
      ],
    },
  ],
});

const USER_APPLIED_TARGET_FILTER = Object.freeze({
  $or: [
    { targetUserId: { $type: "objectId" } },
    {
      $and: [
        { action: "user.account-withdrawal" },
        { "metadata.targetAccountPurged": true },
      ],
    },
  ],
});

function createUserAppliedAdminAuditFilter(extraClauses = []) {
  return {
    $and: [
      USER_APPLIED_ACTION_FILTER,
      USER_APPLIED_TARGET_FILTER,
      ...extraClauses.filter(Boolean),
    ],
  };
}

module.exports = {
  USER_APPLIED_EXACT_ACTIONS,
  createUserAppliedAdminAuditFilter,
  isUserAppliedAdminAction,
};
