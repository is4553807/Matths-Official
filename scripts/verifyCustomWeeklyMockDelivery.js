"use strict";

// Isolated Mongo + local PDF only: no operating DB, cloud downloads, or email.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const mongoose = require("mongoose");
const { PDFDocument } = require("pdf-lib");
const { MongoMemoryServer } = require("mongodb-memory-server-core");

process.env.NODE_ENV = "test";
process.env.DOCUMENT_WATERMARK_SECRET = "custom-weekly-mock-isolated-watermark-secret";
require("../services/emailService").sendEmail = async () => ({ delivered: false });
require("../services/fileStorageService").signedStoredAssetUrl = async () => "https://fixture.invalid/problem.pdf";

const { User, ArchiveItem, PrivateMockExam, PrivateMockExamAttempt } = require("../models/matthsModel");
const servicePath = require.resolve("../services/privateMockExamService");
let service = require(servicePath);

async function main() {
  let memoryServer;
  let listener;
  let fixtureDirectory;
  try {
    memoryServer = await MongoMemoryServer.create({ instance: { dbName: "custom_weekly_mock_delivery" } });
    await mongoose.connect(memoryServer.getUri());
    await Promise.all([User.init(), ArchiveItem.init(), PrivateMockExam.init(), PrivateMockExamAttempt.init()]);

    fixtureDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "matths-custom-mock-fixture-"));
    const sourcePath = path.join(fixtureDirectory, "problem.pdf");
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText("CUSTOM weekly mock problem paper", { x: 50, y: 750 });
    const bytes = await pdf.save();
    await fs.writeFile(sourcePath, bytes);
    const user = await User.create({ name: "custom-mock-fixture", email: "custom-mock@fixture.invalid", role: "admin", passwordHash: "unused" });
    const item = await ArchiveItem.create({ title: "CUSTOM problem paper", originalName: "problem.pdf", storedName: "custom-fixture-problem.pdf", mimeType: "application/pdf", sizeBytes: bytes.length, uploadedBy: user._id, isPublished: false });
    const startedAt = new Date();
    const releaseAt = new Date(startedAt.getTime() - 20 * 60000);
    const schedule = service.buildPrivateMockSchedule(releaseAt, 100, { isTest: true });
    const originalCloseAt = schedule.closeAt;
    const exam = await PrivateMockExam.create({ ...schedule, weekKey: service.privateMockWeekKey(releaseAt), attemptNumber: 0, formCode: "CUSTOM", isTest: true, title: "CUSTOM late-start fixture", durationMinutes: 100, questionCount: 2, questionModes: ["multiple-choice", "short-answer"], answerKey: ["1", "2"], points: [50, 50], archiveItemId: item._id, createdBy: user._id });

    await service.startPrivateMockAttempt({ userId: user._id, examId: exam._id, now: startedAt });
    const expectedDeadline = new Date(startedAt.getTime() + 100 * 60000);
    assert.equal((await PrivateMockExam.findById(exam._id).lean()).closeAt.toISOString(), expectedDeadline.toISOString());
    const initialData = await service.getPrivateMockAttemptData({ userId: user._id, examId: exam._id, now: startedAt });
    assert.equal(new Date(initialData.deadline) - new Date(initialData.serverNow), 100 * 60000);

    // A fresh server must not normalize the extended CUSTOM close back to release + 100m.
    delete require.cache[servicePath];
    service = require(servicePath);
    await service.processPrivateMockSchedule(startedAt);
    assert.equal((await PrivateMockExam.findById(exam._id).lean()).closeAt.toISOString(), expectedDeadline.toISOString());
    const afterOriginalClose = new Date(originalCloseAt.getTime() + 5 * 60000);
    await service.startPrivateMockAttempt({ userId: user._id, examId: exam._id, now: afterOriginalClose });
    assert.equal((await PrivateMockExam.findById(exam._id).lean()).closeAt.toISOString(), expectedDeadline.toISOString(), "repeated Start must not reset the original 100-minute timer");
    await service.savePrivateMockDraft({ userId: user._id, examId: exam._id, answers: ["1", ""], telemetryEvents: [], now: afterOriginalClose });
    const resumedData = await service.getPrivateMockAttemptData({ userId: user._id, examId: exam._id, now: afterOriginalClose });
    assert.equal(resumedData.deadline, expectedDeadline.toISOString());
    assert.equal(resumedData.attempt.answers[0], "1");
    const authorizedFile = await service.getPrivateMockExamFile({ userId: user._id, examId: exam._id, now: afterOriginalClose });
    assert.equal(authorizedFile.sourceId, String(item._id));

    const realFileLookup = service.getPrivateMockExamFile;
    service.getPrivateMockExamFile = async (input) => ({ ...await realFileLookup(input), path: sourcePath, sourceRecord: null });
    const controller = require("../controllers/matthsController");
    const app = express();
    app.set("view engine", "ejs");
    app.set("views", path.resolve(__dirname, "..", "views"));
    app.use(express.static(path.resolve(__dirname, "..", "public")));
    app.use((req, res, next) => {
      req.session = { user: { id: String(user._id), role: "admin", name: user.name } };
      res.locals.assetVersion = "fixture";
      res.set("X-Frame-Options", "DENY");
      res.set("Content-Security-Policy", "default-src 'self'; frame-src 'self'; frame-ancestors 'none'; object-src 'none'");
      next();
    });
    app.get("/private-mock-exams/:examId", controller.privateMockExamPage);
    app.get("/private-mock-exams/:examId/file", controller.privateMockExamFile);
    app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
    listener = await new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
    const origin = `http://127.0.0.1:${listener.address().port}`;
    const page = await fetch(`${origin}/private-mock-exams/${exam._id}`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("x-frame-options"), "DENY", "ordinary exam HTML must retain clickjacking protection");
    const html = await page.text();
    assert.ok(html.includes(`src="/private-mock-exams/${exam._id}/file#toolbar=1&navpanes=0"`));
    assert.ok(html.includes("문제지 새 창에서 열기"));
    assert.ok(html.includes(`data-deadline="${expectedDeadline.toISOString()}"`));
    const file = await fetch(`${origin}/private-mock-exams/${exam._id}/file`);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.match(file.headers.get("content-security-policy"), /frame-ancestors 'self'/);
    assert.doesNotMatch(file.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.match(file.headers.get("content-disposition"), /^inline;/);
    assert.equal(file.headers.get("content-type"), "application/pdf");
    assert.equal(Buffer.from(await file.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
    assert.ok(file.headers.get("x-matths-trace"), "problem paper remains personalized and traceable");

    const submittedAt = new Date(expectedDeadline.getTime() - 1000);
    const requestId = "custom-weekly-mock-late-submit-fixture-0001";
    const submission = await service.submitPrivateMockAttempt({ userId: user._id, examId: exam._id, answers: ["1", "2"], telemetryEvents: [], requestId, capturedAt: submittedAt.toISOString(), now: submittedAt });
    assert.equal(submission.receiptId, requestId);
    assert.equal(submission.acceptedAt, submittedAt.toISOString());
    assert.equal(submission.elapsedMs, 100 * 60000 - 1000);
    const submittedAttempt = await PrivateMockExamAttempt.findOne({ examId: exam._id, userId: user._id }).lean();
    assert.equal(submittedAttempt.status, "submitted");
    assert.equal(submittedAttempt.score, 100);

    console.log("CUSTOM weekly mock verified: full 100-minute late start, restart/resume/draft/late-submission safety, authorized personalized inline PDF, and same-origin-only framing.");
  } finally {
    if (listener) await new Promise((resolve) => listener.close(resolve));
    await mongoose.disconnect();
    if (memoryServer) await memoryServer.stop();
    if (fixtureDirectory) await fs.rm(fixtureDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
