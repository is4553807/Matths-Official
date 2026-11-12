"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const ejs = require("ejs");
const mongoose = require("mongoose");

// Real service and DB, with outbound delivery isolated from operating systems.
require("../services/emailService").sendEmail = async () => ({ delivered: false });
require("../services/fileStorageService").signedStoredAssetUrl = async () => "https://fixture.invalid/problem.pdf";
const { User, ArchiveItem, PrivateMockExam, PrivateMockExamAttempt, PrivateMockWeeklyResult } = require("../models/matthsModel");
const servicePath = require.resolve("../services/privateMockExamService");
let service = require(servicePath);

const at = (value) => new Date(value);
const releaseAt = at("2026-10-18T06:00:00.000Z");
const closeAt = at("2026-10-24T03:00:00.000Z");
const beforeRelease = at("2026-10-18T05:59:59.999Z");
const beforeClose = at("2026-10-24T02:59:59.999Z");
const render = (file, locals) => ejs.renderFile(path.resolve(__dirname, "..", "views", file), locals);

function legacySchedule(release) {
  const close = new Date(release.getTime() + 100 * 60000);
  const publish = new Date(release);
  publish.setUTCHours(14, 0, 0, 0);
  return { releaseAt: release, closeAt: close, aggregationStartsAt: close,
    rankingPublishesAt: publish, reviewPublishesAt: publish, archiveAt: publish };
}

async function main() {
  assert.match(String(process.env.DB || ""), /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/matths_audit_/);
  await mongoose.connect(process.env.DB);
  try {
    await Promise.all([User.init(), ArchiveItem.init(), PrivateMockExam.init(), PrivateMockExamAttempt.init(), PrivateMockWeeklyResult.init()]);
    const users = await User.create(Array.from({ length: 5 }, (_, index) => ({
      name: `weekly-window-${index}`, email: `weekly-window-${index}@fixture.invalid`, role: index === 0 ? "admin" : "student", passwordHash: "unused",
    })));
    const [sundayUser, weekdayUser, lateUser, untouchedUser, submittedUser] = users;
    const item = await ArchiveItem.create({ title: "Weekly window problem paper", originalName: "weekly.pdf",
      storedName: "weekly-window-fixture.pdf", mimeType: "application/pdf", sizeBytes: 100, uploadedBy: sundayUser._id, isPublished: false });
    const fixture = { title: "주간 모의고사 일정 검증", durationMinutes: 100, questionCount: 2,
      questionModes: ["multiple-choice", "short-answer"], answerKey: ["1", "2"], points: [50, 50],
      archiveItemId: item._id, createdBy: sundayUser._id, notificationSentAt: at("2026-10-01T00:00:00Z") };
    const legacyExams = await PrivateMockExam.create(["A", "B", "C"].map((formCode, index) => ({
      ...fixture, ...legacySchedule(new Date(releaseAt.getTime() + index * 3 * 3600000)),
      archiveItemId: index === 0 ? item._id : new mongoose.Types.ObjectId(),
      weekKey: "2026-10-18", formCode, attemptNumber: index + 1, status: "scheduled",
    })));
    const historical = await PrivateMockExam.create({ ...fixture, ...legacySchedule(at("2026-10-11T06:00:00Z")),
      archiveItemId: new mongoose.Types.ObjectId(),
      weekKey: "2026-10-11", formCode: "A", attemptNumber: 1, status: "archived", archivedAt: at("2026-10-11T14:00:00Z") });

    await service.processPrivateMockSchedule(at("2026-10-15T00:00:00Z"));
    const examId = legacyExams[0]._id;
    const migrated = await PrivateMockExam.findById(examId).lean();
    assert.equal(migrated.formCode, "WEEKLY");
    assert.equal(migrated.releaseAt.toISOString(), releaseAt.toISOString());
    assert.equal(migrated.closeAt.toISOString(), closeAt.toISOString());
    assert.equal(await PrivateMockExam.countDocuments({ weekKey: "2026-10-18", status: "cancelled" }), 2);
    assert.equal(await PrivateMockExam.countDocuments(), 4, "retired reservations must retain their files and records");
    const history = await PrivateMockExam.findById(historical._id).lean();
    assert.equal(history.closeAt.toISOString(), historical.closeAt.toISOString());
    assert.equal(history.formCode, "A");

    // A completed CUSTOM on the same calendar date must never become the
    // official representative result, even when its performance is higher.
    const customRelease = at("2026-10-18T06:01:00Z");
    const custom = await PrivateMockExam.create({ ...fixture,
      ...service.buildPrivateMockSchedule(customRelease, 100, { isTest: true }),
      archiveItemId: new mongoose.Types.ObjectId(), weekKey: "2026-10-18", formCode: "CUSTOM", attemptNumber: 0,
      isTest: true, status: "locked", settlementCompletedAt: at("2026-10-18T07:41:00Z"),
    });
    await PrivateMockExamAttempt.create({ examId: custom._id, userId: submittedUser._id,
      weekKey: "2026-10-18", formCode: "CUSTOM", attemptNumber: 0, status: "submitted", answers: ["1", "2"],
      score: 100, startedAt: customRelease, submittedAt: at("2026-10-18T06:30:00Z"),
      standardMetrics: { calculatedAt: at("2026-10-18T07:41:00Z"), actualPerformance: 1 },
    });

    // Normalization is safe after a restart, including retired reservations.
    delete require.cache[servicePath];
    service = require(servicePath);
    await service.processPrivateMockSchedule(at("2026-10-15T00:00:00Z"));
    assert.equal(await PrivateMockExam.countDocuments({ weekKey: "2026-10-18", formCode: "WEEKLY" }), 1);
    const adminData = await service.getAdminPrivateMockExamData(beforeRelease);
    assert.deepEqual(adminData.formSchedules.map((row) => row.formCode), ["WEEKLY", "CUSTOM"]);
    const adminHtml = await render("admin-private-mock-exams.ejs", { user: sundayUser, examData: adminData, weeklyMockInsights: null, feedback: null, error: null });
    assert.match(adminHtml, /value="WEEKLY"/);
    assert.match(adminHtml, /value="CUSTOM"/);
    assert.doesNotMatch(adminHtml, /value="[ABC]"/);

    await assert.rejects(service.startPrivateMockAttempt({ userId: sundayUser._id, examId, now: beforeRelease }), { status: 409 });
    await assert.rejects(service.getPrivateMockExamFile({ userId: sundayUser._id, examId, now: beforeRelease }), { status: 404 });
    const ready = await service.getPrivateMockAttemptData({ userId: sundayUser._id, examId, now: beforeRelease });
    assert.equal(ready.canStart, false);

    await service.startPrivateMockAttempt({ userId: sundayUser._id, examId, now: releaseAt });
    const sunday = await service.getPrivateMockAttemptData({ userId: sundayUser._id, examId, now: releaseAt });
    assert.equal(sunday.deadline, "2026-10-18T07:40:00.000Z");
    await assert.rejects(service.savePrivateMockDraft({ userId: sundayUser._id, examId, answers: ["1", ""], now: at("2026-10-18T07:40:00Z") }), { status: 410 });

    const freeEligibility = await service.getPrivateMockEligibility(weekdayUser._id);
    assert.equal(freeEligibility.allowed, true);
    assert.equal(freeEligibility.status, "ready");
    assert.match(freeEligibility.message, /무료로 응시/);
    const weekdayStart = at("2026-10-21T05:00:00Z");
    await service.startPrivateMockAttempt({ userId: weekdayUser._id, examId, now: weekdayStart });
    const weekday = await service.getPrivateMockAttemptData({ userId: weekdayUser._id, examId, now: weekdayStart });
    assert.equal(weekday.deadline, "2026-10-21T06:40:00.000Z");
    await service.savePrivateMockDraft({ userId: weekdayUser._id, examId, answers: ["1", ""], now: at("2026-10-21T05:01:00Z") });

    await service.startPrivateMockAttempt({ userId: submittedUser._id, examId, now: weekdayStart });
    await service.submitPrivateMockAttempt({ userId: submittedUser._id, examId, answers: ["1", ""], now: at("2026-10-21T05:30:00Z") });
    const pending = await service.getPrivateMockAttemptData({ userId: submittedUser._id, examId, now: beforeClose });
    assert.equal(pending.pendingAggregation, true);
    assert.equal(pending.reviewAvailable, false);
    assert.deepEqual(pending.review, []);
    assert.equal(pending.result.rawScore, null);
    assert.equal((await ArchiveItem.findById(item._id).lean()).isPublished, false);

    const lateStart = at("2026-10-24T02:59:00Z");
    await service.startPrivateMockAttempt({ userId: lateUser._id, examId, now: lateStart });
    const late = await service.getPrivateMockAttemptData({ userId: lateUser._id, examId, now: lateStart });
    assert.equal(late.deadline, closeAt.toISOString(), "Saturday noon must cap the personal 100-minute timer");
    await service.savePrivateMockDraft({ userId: lateUser._id, examId, answers: ["1", ""], now: beforeClose });
    assert.ok(await service.getPrivateMockExamFile({ userId: lateUser._id, examId, now: beforeClose }));
    const pageData = await service.getPrivateMockExamPageData(lateUser._id, beforeClose);
    const studentHtml = await render("private-mock-exams.ejs", { user: lateUser, examData: pageData });
    assert.match(studentHtml, /일요일 15시 공개 · 토요일 12시 마감/);
    assert.doesNotMatch(studentHtml, /세 번의 도전|3회 제공|WEEKLY형/);

    await assert.rejects(service.startPrivateMockAttempt({ userId: untouchedUser._id, examId, now: closeAt }), { status: 409 });
    await assert.rejects(service.savePrivateMockDraft({ userId: lateUser._id, examId, answers: ["1", "2"], now: closeAt }), { status: 409 });
    await assert.rejects(service.submitPrivateMockAttempt({ userId: lateUser._id, examId, answers: ["1", "2"], now: closeAt }), { status: 410 });
    await assert.rejects(service.getPrivateMockExamFile({ userId: lateUser._id, examId, now: closeAt }), { status: 403 });
    assert.deepEqual((await PrivateMockExamAttempt.findOne({ userId: lateUser._id, examId }).lean()).answers, ["1", ""]);

    await service.processPrivateMockSchedule(at("2026-10-24T03:02:00Z"));
    const finished = await PrivateMockExam.findById(examId).lean();
    assert.equal(finished.status, "archived");
    const result = await service.getPrivateMockAttemptData({ userId: submittedUser._id, examId, now: at("2026-10-24T03:02:00Z") });
    assert.equal(result.pendingAggregation, false);
    assert.equal(result.reviewAvailable, true);
    assert.equal(result.selection.attemptCount, 1);
    assert.equal(result.selection.canChoose, false);
    assert.equal(result.selection.locked, true);
    assert.equal((await PrivateMockWeeklyResult.findOne({ userId: submittedUser._id, weekKey: "2026-10-18" }).lean()).attempts.length, 1);
    assert.equal((await PrivateMockExam.findById(custom._id).lean()).archivedAt, null);
    assert.equal((await ArchiveItem.findById(item._id).lean()).isPublished, true);
    console.log("Weekly mock window DB verification passed: migration, Sunday opening, weekday starts, exact Saturday cutoff, private timer, delayed results/archive, and admin/student views.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
