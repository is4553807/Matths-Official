const assert = require("node:assert/strict");

const {
  AdminTodo,
  CoachMessageSuggestion,
} = require("../models/matthsModel");
const {
  ArenaRevengeRight,
} = require("../models/goatArenaModel");
const {
  completeAdminTodo,
  reopenAdminTodo,
} = require("../services/adminTodoService");
const {
  moderateSuggestion,
} = require("../services/coachSuggestionService");
const goatArenaController = require(
  "../controllers/goatArenaController"
);

async function expect404(action) {
  await assert.rejects(
    action,
    (error) => {
      assert.equal(error.status, 404);
      assert.doesNotMatch(
        error.message,
        /Cast to ObjectId/i
      );
      return true;
    }
  );
}

async function controllerError(
  handler
) {
  let captured = null;
  await handler(
    {
      params: {
        rightId: "malformed-id",
      },
      body: {
        requestId:
          "audit-malformed-id-request",
      },
      session: {
        user: {
          id: "64b000000000000000000001",
        },
      },
    },
    {},
    (error) => {
      captured = error;
    }
  );
  assert.ok(captured);
  assert.equal(captured.status, 404);
  assert.doesNotMatch(
    captured.message,
    /Cast to ObjectId/i
  );
}

async function run() {
  const originalSuggestionUpdate =
    CoachMessageSuggestion.findOneAndUpdate;
  const originalTodoUpdate =
    AdminTodo.findOneAndUpdate;
  const originalRevengeFind =
    ArenaRevengeRight.findById;
  try {
    const unexpectedQuery = () => {
      throw new Error(
        "잘못된 ID가 DB 조회까지 도달했습니다."
      );
    };
    CoachMessageSuggestion.findOneAndUpdate =
      unexpectedQuery;
    AdminTodo.findOneAndUpdate =
      unexpectedQuery;
    ArenaRevengeRight.findById =
      unexpectedQuery;

    await expect404(() =>
      moderateSuggestion({
        adminUser: {
          id: "64b000000000000000000001",
          role: "admin",
        },
        suggestionId:
          "malformed-id",
        action: "approve",
        rejectionReason: "",
      })
    );
    await expect404(() =>
      completeAdminTodo({
        todoId: "malformed-id",
        adminUserId:
          "64b000000000000000000001",
      })
    );
    await expect404(() =>
      reopenAdminTodo({
        todoId: "malformed-id",
        adminUserId:
          "64b000000000000000000001",
      })
    );
    await controllerError(
      goatArenaController.claimSubRevenge
    );
    await controllerError(
      goatArenaController.forfeitSubRevenge
    );
  } finally {
    CoachMessageSuggestion.findOneAndUpdate =
      originalSuggestionUpdate;
    AdminTodo.findOneAndUpdate =
      originalTodoUpdate;
    ArenaRevengeRight.findById =
      originalRevengeFind;
  }

  console.log(
    "Malformed dynamic IDs verified: coach moderation, admin todos, and revenge actions return controlled 404 errors before database casting."
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
