const assert = require("node:assert/strict");

const {
  AdminTodo,
  CoachMessageSuggestion,
} = require("../models/matthsModel");
const {
  ArenaMatch,
} = require("../models/goatArenaModel");
const {
  completeAdminTodo,
  reopenAdminTodo,
} = require("../services/adminTodoService");
const {
  moderateSuggestion,
} = require("../services/coachSuggestionService");
const { getAsyncNormalResult, getAsyncNormalEvidenceFile } = require("../services/arenaAsyncNormalService");
const { getAsyncCompetitiveResult, getAsyncCompetitiveEvidenceFile } = require("../services/arenaAsyncCompetitiveService");

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


async function run() {
  const originalSuggestionUpdate =
    CoachMessageSuggestion.findOneAndUpdate;
  const originalTodoUpdate =
    AdminTodo.findOneAndUpdate;
  const originalMatchFind =
    ArenaMatch.findById;
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
    ArenaMatch.findById =
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
    for (const read of [getAsyncNormalResult, getAsyncCompetitiveResult, getAsyncNormalEvidenceFile, getAsyncCompetitiveEvidenceFile]) {
      await expect404(() => read({ matchId: "malformed-id", userId: "64b000000000000000000001", side: "challenger", fileIndex: 1 }));
    }
  } finally {
    CoachMessageSuggestion.findOneAndUpdate =
      originalSuggestionUpdate;
    AdminTodo.findOneAndUpdate =
      originalTodoUpdate;
    ArenaMatch.findById =
      originalMatchFind;
  }

  console.log(
    "Malformed dynamic IDs verified: coach moderation, admin todos, normal/competitive results and evidence return controlled 404 errors before database casting."
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
