"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");
const contexts = new AsyncLocalStorage();

// Only the DB-validated admin middleware creates this request-scoped context.
// Never change the authenticated identity or fabricate teacher memberships.
function runWithAdminPageContext(context, next) {
  return contexts.run(context, next);
}

function adminPageContextFor(userId) {
  const context = contexts.getStore();
  return context && String(context.adminUserId) === String(userId) ? context : null;
}

module.exports = { adminPageContextFor, runWithAdminPageContext };
