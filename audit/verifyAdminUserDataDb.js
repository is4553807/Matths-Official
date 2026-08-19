const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const {
  AssessmentAttempt,
  User,
} = require("../models/matthsModel");
const {
  getAdminAssessmentDetail,
  getAdminUserDetail,
  getAdminUsersData,
} = require("../services/adminService");

const userId =
  new mongoose.Types.ObjectId();
const submittedAttemptId =
  new mongoose.Types.ObjectId();
const overduePlacementId =
  new mongoose.Types.ObjectId();
const overdueUnitId =
  new mongoose.Types.ObjectId();
const suffix = String(userId);

async function cleanup() {
  await AssessmentAttempt.deleteMany({
    userId,
  });
  await User.deleteOne({
    _id: userId,
  });
}

async function main() {
  assert.match(
    String(process.env.DB || ""),
    /matths_audit_zero_assumption_20260815/,
    "관리자 DB 검증은 격리 감사 DB에서만 실행할 수 있습니다."
  );
  await mongoose.connect(
    process.env.DB
  );

  try {
    await cleanup();
    await User.create({
      _id: userId,
      name: `관리자검증${suffix.slice(-6)}`,
      email: `admin-user-audit-${suffix}@example.test`,
      passwordHash:
        "isolated-audit-password-hash",
      role: "student",
      totalStudySeconds: 754,
      lastStudyDate:
        new Date(
          "2026-08-18T09:00:00+09:00"
        ),
      lastLoginAt:
        new Date(
          "2026-08-19T08:30:00+09:00"
        ),
    });

    await AssessmentAttempt.create([
      {
        _id: submittedAttemptId,
        userId,
        paperId:
          `ADMIN-AUDIT-SUBMITTED-${suffix}`,
        scopeType: "placement",
        placementPurpose: "INITIAL",
        courseId: "common-math-1",
        title: "제출 완료 배치고사",
        totalPoints: 100,
        earnedPoints: 73,
        scorePercent: 73,
        status: "submitted",
        startedAt:
          new Date(
            "2026-08-16T01:00:00+09:00"
          ),
        submittedAt:
          new Date(
            "2026-08-16T02:00:00+09:00"
          ),
        elapsedTimeMs:
          60 * 60 * 1000,
        timeLimitMs:
          100 * 60 * 1000,
      },
      {
        _id: overduePlacementId,
        userId,
        paperId:
          `ADMIN-AUDIT-OVERDUE-PLACEMENT-${suffix}`,
        scopeType: "placement",
        placementPurpose: "SEASON",
        courseId: "common-math-1",
        title: "시간 초과 배치고사",
        totalPoints: 100,
        status: "in-progress",
        startedAt:
          new Date(
            Date.now() -
              3 * 60 * 60 * 1000
          ),
        timeLimitMs:
          10 * 60 * 1000,
        questions: [
          {
            questionId: "P1",
            typeId: "audit-placement-1",
            difficulty: "mid-high",
            sourceCourseId: "common-math-1",
            sourceUnitId: "polynomials",
            sourceSubunitId: "polynomial-arithmetic",
            prompt: "1+1",
            inputMode: "short-answer",
            answer: "2",
            submittedAnswer: "2",
            points: 3,
          },
        ],
      },
      {
        _id: overdueUnitId,
        userId,
        paperId:
          `ADMIN-AUDIT-OVERDUE-UNIT-${suffix}`,
        scopeType: "unit",
        courseId: "common-math-1",
        unitId: "polynomials",
        title: "시간 초과 단원 평가",
        totalPoints: 10,
        status: "in-progress",
        startedAt:
          new Date(
            Date.now() -
              2 * 60 * 60 * 1000
          ),
        timeLimitMs:
          10 * 60 * 1000,
      },
    ]);

    const detail =
      await getAdminUserDetail(
        String(userId)
      );
    const [placementAfter, unitAfter] =
      await Promise.all([
        AssessmentAttempt.findById(
          overduePlacementId
        ).lean(),
        AssessmentAttempt.findById(
          overdueUnitId
        ).lean(),
      ]);

    assert.equal(
      placementAfter.status,
      "submitted"
    );
    assert.equal(
      placementAfter.disqualifiedReason,
      null
    );
    assert.equal(
      placementAfter.earnedPoints,
      3
    );
    assert.equal(
      placementAfter.scorePercent,
      3
    );
    assert.equal(
      unitAfter.status,
      "disqualified"
    );
    assert.equal(
      detail.placement.completedCount,
      2
    );
    assert.equal(
      String(
        detail.placement
          .latestCompleted._id
      ),
      String(overduePlacementId)
    );
    assert.equal(
      detail.placement
        .latestTerminal,
      null
    );
    assert.equal(
      detail.assessments.find(
        (attempt) =>
          String(attempt._id) ===
          String(overduePlacementId)
      ).answeredCount,
      1
    );

    const list =
      await getAdminUsersData({
        query:
          `admin-user-audit-${suffix}@example.test`,
        role: "student",
        page: 1,
      });
    assert.equal(
      list.total,
      1
    );
    assert.equal(
      String(list.users[0]._id),
      String(userId)
    );
    assert.equal(
      list.users[0]
        .totalStudySeconds,
      754
    );

    const attemptDetail =
      await getAdminAssessmentDetail({
        userId:
          String(userId),
        attemptId:
          String(overduePlacementId),
      });
    assert.equal(
      attemptDetail.attempt
        .displayStatus,
      "submitted"
    );
    assert.equal(
      attemptDetail.attempt
        .hasFinalScore,
      true
    );

    console.log(
      "관리자 유저 목록·상세 DB 검증 완료: 목록 필드, 배치고사 자동 제출·채점, 일반평가 만료 확정, 완료 기록·답안 수 집계 PASS"
    );
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
