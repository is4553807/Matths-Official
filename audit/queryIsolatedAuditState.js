const mongoose = require("mongoose");

const {
  AssessmentAttempt,
  ConceptProgress,
  ProblemAttempt,
  User,
} = require("../models/matthsModel");

async function run() {
  if (!String(process.env.DB || "").includes("matths_audit_zero_assumption_20260815")) {
    throw new Error("감사 상태 조회는 격리 감사 DB에서만 실행할 수 있습니다.");
  }

  await mongoose.connect(process.env.DB);

  try {
    const username = String(
      process.env.AUDIT_QUERY_USER || "launchhsunrankeda"
    );
    const user = await User.findOne({ name: username }).select("_id name").lean();

    if (!user) throw new Error(`${username} 계정을 찾을 수 없습니다.`);

    const [assessments, concepts, problemAttempts] = await Promise.all([
      AssessmentAttempt.find({ userId: user._id })
        .select(
          "_id paperId scopeType courseId unitId subunitId status scorePercent passed startedAt submittedAt"
        )
        .sort({ startedAt: 1 })
        .lean(),
      ConceptProgress.find({ userId: user._id })
        .select(
          "courseId unitId conceptId completedTopics completionPercent status masteryGate"
        )
        .sort({ courseId: 1, unitId: 1, conceptId: 1 })
        .lean(),
      ProblemAttempt.find({ userId: user._id })
        .select(
          "_id courseId unitId conceptId isCorrect review.status review.attempts review.completedAt review.nextReviewAt submittedAt"
        )
        .sort({ submittedAt: 1 })
        .lean(),
    ]);

    console.log(
      JSON.stringify(
        {
          database: mongoose.connection.name,
          user: username,
          assessments,
          concepts,
          problemAttemptCount: problemAttempts.length,
          wrongProblemAttemptCount: problemAttempts.filter(
            (attempt) => !attempt.isCorrect
          ).length,
          reviewedProblemAttempts: problemAttempts.filter(
            (attempt) => attempt.review?.status !== "pending"
          ),
        },
        null,
        2
      )
    );
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
