const mongoose = require("mongoose");
const { User } = require("../models/matthsModel");

const ARENA_TUTORIAL_CHAPTERS = Object.freeze([
  "common",
  "unranked",
  "unranked_match",
  "ranked",
  "ranked_battle",
  "ranked_shop",
]);
const ARENA_TUTORIAL_STATUSES = Object.freeze([
  "NOT_REQUIRED",
  "PENDING",
  "COMPLETED",
  "SKIPPED",
]);
const ARENA_TUTORIAL_ACTIONS = Object.freeze([
  "RESTART",
  "COMPLETE",
  "SKIP",
]);
const ARENA_TUTORIAL_FIRST_PATH = Object.freeze({
  common: "/goat-arena",
  unranked: "/goat-arena/sub",
  unranked_match: "/goat-arena/sub/challenge",
  ranked: "/goat-arena/main",
  ranked_battle: "/goat-arena/main/battle",
  ranked_shop: "/goat-arena/main/shop",
});

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeDivision(division) {
  const normalized = String(division || "").trim().toUpperCase();
  return ["SUB", "MAIN"].includes(normalized) ? normalized : null;
}

function eligibleArenaTutorialChapters({ activeDivision } = {}) {
  const division = normalizeDivision(activeDivision);
  return [
    "common",
    ...(division === "SUB" ? ["unranked", "unranked_match"] : []),
    ...(division === "MAIN"
      ? ["ranked", "ranked_battle", "ranked_shop"]
      : []),
  ];
}

function availableArenaTutorialChapters({
  activeDivision,
  isAdminPreview = false,
} = {}) {
  if (isAdminPreview) {
    return [...ARENA_TUTORIAL_CHAPTERS];
  }
  return eligibleArenaTutorialChapters({ activeDivision });
}

function chapterView(record, eligible) {
  const candidate = String(record?.status || "").trim().toUpperCase();
  const storedStatus = ["PENDING", "COMPLETED", "SKIPPED"].includes(
    candidate
  )
    ? candidate
    : null;
  const status = storedStatus || (eligible ? "PENDING" : "NOT_REQUIRED");
  return {
    status,
    completedAt: record?.completedAt || null,
    skippedAt: record?.skippedAt || null,
  };
}

function arenaTutorialView(
  preferences = {},
  {
    activeDivision = null,
    isAdminPreview = false,
    suspendAutoStart = false,
  } = {}
) {
  const eligibleChapters = eligibleArenaTutorialChapters({ activeDivision });
  const availableChapters = availableArenaTutorialChapters({
    activeDivision,
    isAdminPreview,
  });
  const stored = preferences?.arenaTutorial || {};
  const chapters = Object.fromEntries(
    ARENA_TUTORIAL_CHAPTERS.map((chapter) => [
      chapter,
      chapterView(stored?.[chapter], eligibleChapters.includes(chapter)),
    ])
  );
  return {
    version: Number(stored?.version || 1),
    activeDivision: normalizeDivision(activeDivision),
    eligibleChapters,
    availableChapters,
    chapters,
    autoChapter: null,
    shouldAutoStart: false,
    suspended: Boolean(suspendAutoStart),
  };
}

async function updateArenaTutorial({
  userId,
  chapter,
  action,
  activeDivision = null,
  isAdminPreview = false,
}) {
  if (!mongoose.isValidObjectId(userId)) {
    throw statusError(404, "사용자 정보를 찾을 수 없습니다.");
  }

  const normalizedAction = String(action || "").trim().toUpperCase();
  if (!ARENA_TUTORIAL_ACTIONS.includes(normalizedAction)) {
    throw statusError(400, "올바른 튜토리얼 동작이 아닙니다.");
  }

  const normalizedChapter = String(chapter || "").trim().toLowerCase();
  const eligibleChapters = eligibleArenaTutorialChapters({ activeDivision });
  const availableChapters = availableArenaTutorialChapters({
    activeDivision,
    isAdminPreview,
  });
  let existingUser = null;
  if (normalizedChapter === "all" && normalizedAction === "SKIP") {
    existingUser = await User.findById(userId).select("preferences").lean();
    if (!existingUser) {
      throw statusError(404, "사용자 정보를 찾을 수 없습니다.");
    }
  }
  const targetChapters = normalizedChapter === "all"
    ? normalizedAction === "SKIP"
      ? eligibleChapters.filter((eligibleChapter) => {
          const storedStatus = String(
            existingUser?.preferences?.arenaTutorial?.[eligibleChapter]?.status || "PENDING"
          ).toUpperCase();
          return storedStatus === "PENDING";
        })
      : []
    : availableChapters.includes(normalizedChapter)
      ? [normalizedChapter]
      : [];

  if (
    normalizedChapter === "all" &&
    normalizedAction === "SKIP" &&
    !targetChapters.length
  ) {
    return arenaTutorialView(existingUser.preferences, {
      activeDivision,
      isAdminPreview,
    });
  }

  if (!targetChapters.length) {
    throw statusError(400, "현재 이용할 수 있는 튜토리얼 편이 아닙니다.");
  }

  const now = new Date();
  const status = normalizedAction === "RESTART"
    ? "PENDING"
    : normalizedAction === "COMPLETE"
      ? "COMPLETED"
      : "SKIPPED";
  const update = {
    $set: {
      "preferences.arenaTutorial.version": 1,
    },
    $unset: {},
  };

  targetChapters.forEach((targetChapter) => {
    const base = `preferences.arenaTutorial.${targetChapter}`;
    update.$set[`${base}.status`] = status;
    if (normalizedAction === "COMPLETE") {
      update.$set[`${base}.completedAt`] = now;
    } else {
      update.$unset[`${base}.completedAt`] = 1;
    }
    if (normalizedAction === "SKIP") {
      update.$set[`${base}.skippedAt`] = now;
    } else {
      update.$unset[`${base}.skippedAt`] = 1;
    }
  });

  const user = await User.findByIdAndUpdate(userId, update, {
    new: true,
    runValidators: true,
  })
    .select("preferences")
    .lean();

  if (!user) {
    throw statusError(404, "사용자 정보를 찾을 수 없습니다.");
  }

  return arenaTutorialView(user.preferences, {
    activeDivision,
    isAdminPreview,
  });
}

module.exports = {
  ARENA_TUTORIAL_ACTIONS,
  ARENA_TUTORIAL_CHAPTERS,
  ARENA_TUTORIAL_FIRST_PATH,
  ARENA_TUTORIAL_STATUSES,
  arenaTutorialView,
  availableArenaTutorialChapters,
  eligibleArenaTutorialChapters,
  updateArenaTutorial,
};
