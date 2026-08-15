const {
  ConceptProgress,
} = require("../models/matthsModel");
const {
  canonicalProgressView,
} = require("../services/progressTypeIdService");
const {
  getDashboardActivity,
} = require("../services/dashboardActivityService");

const CURRICULUM_ID = "kr-2022";

/**
 * iPad가 서버 진도를 내려받는 전용 읽기 경계.
 * 웹 `/learning` 응답과 경로를 분리해 앱의 `{ progress: [...] }` 계약을 보존한다.
 */
exports.getLearningProgress = async (req, res, next) => {
  try {
    const rows = await ConceptProgress.find({
      userId: req.apiUser._id,
      curriculumId: CURRICULUM_ID,
    })
      .sort({ lastStudiedAt: -1 })
      .limit(1000)
      .lean();

    const progress = rows.map((row) => {
      const normalized = canonicalProgressView(row);
      return {
        courseId: row.courseId,
        unitId: row.unitId,
        conceptId: row.conceptId,
        completedTopicIndexes: normalized.completedTopicIndexes,
        completionPercent: normalized.completionPercent,
        masteryGate: {
          requiredDistinctTypes: normalized.requiredDistinctTypes,
          correctTypeIds: normalized.correctTypeIds,
          userCompleted: normalized.userCompleted,
        },
        lastStudiedAt: row.lastStudiedAt || null,
      };
    });

    res.set("Cache-Control", "no-store");
    return res.json({ progress });
  } catch (error) {
    return next(error);
  }
};

/** 웹 홈과 같은 14일 집계 정본을 iPad가 그대로 소비한다. */
exports.getDashboardActivity = async (req, res, next) => {
  try {
    const dashboard = await getDashboardActivity(req.apiUser._id);
    res.set("Cache-Control", "no-store");
    return res.json({ dashboard });
  } catch (error) {
    return next(error);
  }
};
