"use strict";

// LOCAL ONLY. No config.env/dotenv loading, production DB, live cloud stores, or
// externally reachable listener. Secrets are generated per run and written only
// to the owner-readable runtime manifest, never printed or checked in.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { fork } = require("node:child_process");
const manifestArgument = process.argv.find((argument) => argument.startsWith("--manifest="));
const MANIFEST = process.argv[2] === "--worker"
  ? process.env.NATIVE_FIXTURE_MANIFEST
  : manifestArgument?.slice("--manifest=".length) || "/tmp/matths-native-integration-0907.json";
const ROOT = path.resolve(__dirname, "..");

function fail(code) { const error = new Error(code); error.code = code; return error; }
function safeLoopbackUri(value) {
  const url = new URL(value);
  if (url.protocol !== "mongodb:" || url.hostname !== "127.0.0.1" || url.username || url.password ||
      !/^\/matths_native_fixture_[a-f0-9]{16}$/.test(url.pathname)) throw fail("FIXTURE_DB_NOT_ISOLATED");
  return value;
}
function loopbackNetworkOnly() {
  const net = require("node:net");
  const original = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    let candidate = args[0];
    if (Array.isArray(candidate)) candidate = candidate[0];
    const options = candidate && typeof candidate === "object" ? candidate : {
      port: candidate, host: typeof args[1] === "string" ? args[1] : "localhost",
    };
    if (options.path || !["127.0.0.1", "localhost", "::1"].includes(String(options.host || "localhost"))) {
      throw fail("FIXTURE_NON_LOOPBACK_NETWORK_BLOCKED");
    }
    return original.apply(this, args);
  };
}

async function controller() {
  if (process.argv.slice(2).some((argument) => argument !== manifestArgument) ||
      process.argv.slice(2).length > 1 || !/^\/tmp\/matths-native-integration-[a-z0-9-]{1,80}\.json$/.test(MANIFEST || "")) {
    throw fail("USAGE_NODE_AUDIT_RUN_NATIVE_INTEGRATION_FIXTURE_OPTIONAL_MANIFEST");
  }
  if (fs.existsSync(MANIFEST)) throw fail("EXISTING_FIXTURE_MANIFEST_STOP_PREVIOUS_RUN_FIRST");
  const { MongoMemoryReplSet } = require("mongodb-memory-server-core");
  const runId = crypto.randomBytes(8).toString("hex");
  const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "matths-native-fixture-"));
  let replicaSet, worker;
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    if (worker && worker.exitCode === null) {
      await new Promise((resolve) => {
        const timer = setTimeout(() => { worker.kill("SIGKILL"); resolve(); }, 10000);
        worker.once("exit", () => { clearTimeout(timer); resolve(); });
        if (worker.connected) worker.send({ stop: true });
        else worker.kill("SIGTERM");
      });
    }
    if (replicaSet) await replicaSet.stop();
    const manifest = JSON.parse(await fs.promises.readFile(MANIFEST, "utf8").catch(() => "{}"));
    if (manifest.runId === runId) await fs.promises.unlink(MANIFEST);
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
    console.log(JSON.stringify({ fixture: "stopped", runId }));
  };
  process.once("SIGTERM", () => { stop().then(() => process.exit(0)); });
  process.once("SIGINT", () => { stop().then(() => process.exit(0)); });
  try {
    replicaSet = await MongoMemoryReplSet.create({ binary: { version: "8.2.6" },
      replSet: { count: 1, ip: "127.0.0.1", storageEngine: "wiredTiger" } });
    const uri = safeLoopbackUri(replicaSet.getUri(`matths_native_fixture_${runId}`));
    // Explicit environment, not {...process.env}. No other project's API keys,
    // database settings, signing credentials or SMTP configuration are inherited.
    const environment = {
      PATH: process.env.PATH || "/usr/bin:/bin", TMPDIR: temporaryDirectory,
      NODE_ENV: "development", HOST: "127.0.0.1", PORT: "0", DB: uri,
      NATIVE_FIXTURE_WORKER: runId, NATIVE_FIXTURE_PARENT_PID: String(process.pid),
      NATIVE_FIXTURE_MANIFEST: MANIFEST,
      NATIVE_FIXTURE_DIR: temporaryDirectory,
      API_TOKEN_SECRET: crypto.randomBytes(48).toString("base64url"),
      SECRET: crypto.randomBytes(48).toString("base64url"),
      PASSWORD_RESET_SECRET: crypto.randomBytes(48).toString("base64url"),
      PAYBACK_ACCOUNT_ENCRYPTION_KEY: crypto.randomBytes(32).toString("hex"),
      DISABLE_SCHEDULERS: "1", ALLOW_TEST_DATA_MUTATION: "1",
      PAID_CHECKOUT_ENABLED: "false", PAYMENT_PROVIDER: "DISABLED",
      APP_BASE_URL: "http://127.0.0.1", PUBLIC_BASE_URL: "http://127.0.0.1",
      USER_CLOUD_UPLOAD_TEMP_DIR: path.join(temporaryDirectory, "uploads"),
      COMMUNITY_STORAGE_DIR: path.join(temporaryDirectory, "community"),
      STORAGE_DIR: path.join(temporaryDirectory, "storage"),
      FILE_STORAGE_PROVIDER: "local",
    };
    worker = fork(__filename, ["--worker"], { cwd: ROOT, env: environment,
      stdio: ["ignore", "ignore", "ignore", "ipc"] });
    worker.on("message", (message) => {
      if (message.ready) console.log(JSON.stringify({ fixture: "ready", host: "127.0.0.1",
        port: message.port, pid: process.pid, workerPid: worker.pid, runId,
        manifest: MANIFEST, accounts: ["student", "returningStudent", "teacher", "admin"],
        verification: message.verification }));
      if (message.failed) { console.error("Native fixture worker failed:", message.code); stop().then(() => { process.exitCode = 1; }); }
    });
    worker.once("exit", () => { if (!stopping) stop().then(() => { process.exitCode = 1; }); });
  } catch (error) { await stop(); throw error; }
}

async function worker() {
  const runId = process.env.NATIVE_FIXTURE_WORKER;
  if (!process.send || !/^[a-f0-9]{16}$/.test(runId || "") || !process.env.API_TOKEN_SECRET ||
      !/^\/tmp\/matths-native-integration-[a-z0-9-]{1,80}\.json$/.test(MANIFEST || "")) throw fail("FIXTURE_WORKER_REQUIRES_CONTROLLER");
  safeLoopbackUri(process.env.DB);
  loopbackNetworkOnly();
  // A dependency must not load a discovered config.env into this isolated run.
  const dotenv = require("dotenv");
  dotenv.config = () => ({ parsed: {} });
  dotenv.configDotenv = () => ({ parsed: {} });
  const mongoose = require("mongoose");
  const express = require("express");
  const bcrypt = require("bcrypt");
  const fixtureDirectory = process.env.NATIVE_FIXTURE_DIR;
  const storage = require("../services/fileStorageService");
  const mockAssets = new Map();
  // Storage is an explicitly fake, private local asset map; no provider API.
  storage.storeUploadedFile = async (file) => {
    const key = `native-fixture/${crypto.randomUUID()}`;
    const bytes = await fs.promises.readFile(file.path);
    mockAssets.set(key, bytes);
    file.storageAsset = { storageProvider: "CLOUDINARY", storagePurpose: "USER_COMMUNITY",
      cloudPublicId: key, cloudResourceType: "raw", cloudDeliveryType: "authenticated" };
    await fs.promises.unlink(file.path);
    return file.storageAsset;
  };
  storage.destroyStoredAsset = async (asset) => { mockAssets.delete(asset.cloudPublicId || asset.r2ObjectKey); };
  storage.signedCloudinaryUrl = () => null;
  storage.signedStoredAssetUrl = async () => null;
  const nodemailer = require("nodemailer");
  nodemailer.createTransport = () => ({ verify: async () => false,
    sendMail: async () => { throw fail("FIXTURE_EMAIL_DISABLED"); } });
  const models = require("../models/matthsModel");
  const academyModels = require("../models/academyModel");
  const router = require("../routes/api-routes");
  const { errorHandler } = require("../middleware/errorMiddleware");
  const { createAccessToken } = require("../services/mobileAuthService");
  const { loadCurriculum } = require("../services/curriculumService");
  const { buildAssessmentPaper } = require("../services/assessmentService");
  await mongoose.connect(process.env.DB, { autoIndex: false });
  const { User, CommunityPost, CommunityComment, CommunityPostingQuota, AssessmentAttempt } = models;
  const { Academy, AcademyStaff, AcademyClass, AcademyStudentMembership, AcademyClassWeek } = academyModels;
  // Only these freshly-created, isolated collections. Never syncIndexes/drop.
  await Promise.all([CommunityPostingQuota, Academy, AcademyStaff, AcademyClass, AcademyStudentMembership, AcademyClassWeek]
    .map((model) => model.createIndexes()));
  const now = new Date();
  const expiresAt = new Date(Date.now() + 365 * 86400000);
  const accounts = {};
  for (const [label, role, name] of [["student", "student", "로컬검증새학생"], ["returningStudent", "student", "로컬검증기존학생"],
    ["teacher", "teacher", "로컬검증선생님"], ["admin", "admin", "로컬검증관리자"]]) {
    const password = `Qa1!${crypto.randomBytes(24).toString("base64url")}`;
    const user = await User.create({ name, nameNormalized: name.toLowerCase(), realName: name,
      // Each isolated DB has new account IDs. Use fresh emails too so native
      // email-scoped local state cannot leak between independent fixture runs.
      email: `${label.toLowerCase()}-${runId}@qa.invalid`, passwordHash: await bcrypt.hash(password, 10),
      role, isActive: true, accountStatus: "active", isTestAccount: true, testBatchKey: `native-local-${runId}`,
      schoolGrade: 10, termsAcceptedAt: now,
      school: { code: "QA-NATIVE-LOCAL", name: "로컬 검증고등학교", region: "서울" },
      ...(role === "teacher" ? { teacherAccessExpiresAt: expiresAt } : {}),
      preferences: { dashboardTutorialStatus: label === "student" ? "PENDING" : "COMPLETED" } });
    accounts[label] = { role, label, email: user.email, userId: String(user._id), password,
      token: createAccessToken(user) };
  }
  const academy = await Academy.create({ name: "로컬 검증 수학학원", nameNormalized: "로컬 검증 수학학원",
    status: "ACTIVE", createdByUserId: accounts.teacher.userId, reviewedByUserId: accounts.admin.userId,
    approvedAt: now, contractStartsAt: now, contractEndsAt: expiresAt });
  await AcademyStaff.create({ academyId: academy._id, userId: accounts.teacher.userId, role: "OWNER",
    status: "ACTIVE", currentStaffKey: accounts.teacher.userId, joinedAt: now });
  const academyClass = await AcademyClass.create({ academyId: academy._id, name: "고1 기본반", nameNormalized: "고1 기본반",
    createdByUserId: accounts.teacher.userId, homeroomTeacherUserId: accounts.teacher.userId,
    schedule: { weekdays: [1, 4], startTime: "19:00", endTime: "20:30", effectiveFrom: now.toISOString().slice(0, 10), timezone: "Asia/Seoul" },
    attendancePolicy: { mode: "MANUAL", opensBeforeMinutes: 10, lateAfterMinutes: 5, closesAfterMinutes: 20 } });
  for (const label of ["student", "returningStudent"]) await AcademyStudentMembership.create({
    academyId: academy._id, studentUserId: accounts[label].userId, activeStudentKey: accounts[label].userId,
    status: "APPROVED", classId: academyClass._id, joinSource: "ADMIN_ASSIGNMENT",
    dataConsentAt: now, approvedAt: now, reviewedByUserId: accounts.teacher.userId });
  const curriculum = loadCurriculum();
  const course = curriculum.courses[0], unit = course.units[0], concept = unit.concepts[0];
  const week = await AcademyClassWeek.create({ academyId: academy._id, classId: academyClass._id,
    academicYear: now.getUTCFullYear(), weekNumber: 1, title: "첫 주: 다항식의 기본", lessonSummary: "로컬 fixture 데이터입니다. 운영 학습 기록과 분리됩니다.",
    concepts: [{ curriculumId: String(curriculum.curriculum || "2022"), courseId: course.id, courseTitle: course.officialTitle,
      unitId: unit.id, unitTitle: unit.title, conceptId: concept.id, conceptTitle: concept.title }],
    assignmentTitle: "다항식 개념 복습", assignmentInstructions: "개념을 읽고 확인 문제를 풀어보세요.",
    dueAt: new Date(Date.now() + 3 * 86400000), createdByUserId: accounts.teacher.userId, updatedByUserId: accounts.teacher.userId });
  const post = await CommunityPost.create({ authorId: accounts.student.userId, authorName: "로컬검증새학생", boardType: "high-school",
    title: "다항식 계산에서 부호를 자꾸 틀립니다", content: "로컬 UI 검증용 글입니다. 괄호를 풀 때 부호를 확인하는 방법을 함께 이야기해 주세요." });
  await CommunityComment.create({ postId: post._id, authorId: accounts.teacher.userId, authorName: "로컬검증선생님",
    content: "괄호 앞의 부호를 먼저 표시하고 한 항씩 정리해 보세요. 이 댓글도 합성 검증 데이터입니다." });
  await CommunityPost.create({ authorId: accounts.returningStudent.userId, authorName: "로컬검증기존학생", boardType: "school",
    schoolCode: "QA-NATIVE-LOCAL", schoolName: "로컬 검증고등학교", title: "이번 주 다항식 복습을 같이 해요",
    content: "학교 게시판 최소 화면을 위한 합성 데이터입니다. 운영 게시판과 관계가 없습니다." });
  const paper = buildAssessmentPaper({ scopeType: "subunit", courseId: "common-math-1", unitId: "polynomials", subunitId: "polynomial-arithmetic" });
  const attempt = await AssessmentAttempt.create({ userId: accounts.returningStudent.userId, ...paper });
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return res.sendStatus(403);
    res.set("X-Matths-Fixture", "isolated-local-not-production");
    return next();
  });
  app.use("/api/v1", router);
  app.use(errorHandler);
  const server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  process.env.APP_BASE_URL = origin; process.env.PUBLIC_BASE_URL = origin;
  const verification = [];
  for (const [label, endpoint] of [["student", "/me"], ["student", "/curriculum"], ["student", "/learning"],
    ["student", "/assessments"], ["returningStudent", "/assessments"], ["student", "/academy/student"],
    ["teacher", "/academy/teacher"], ["admin", "/academy/admin"], ["student", "/community"], ["student", "/mobile-capabilities"]]) {
    const response = await fetch(`${origin}/api/v1${endpoint}`, { headers: { Authorization: `Bearer ${accounts[label].token}` } });
    await response.arrayBuffer();
    verification.push({ account: label, endpoint, status: response.status });
    if (response.status !== 200) throw fail(`FIXTURE_SMOKE_FAILED_${label}_${endpoint.replace(/\W/g, "_")}_${response.status}`);
  }
  for (const account of Object.values(accounts)) {
    const response = await fetch(`${origin}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: account.email, password: account.password }) });
    const result = await response.json();
    if (response.status !== 200 || !result.accessToken) throw fail(`FIXTURE_LOGIN_FAILED_${account.label}`);
    account.token = result.accessToken;
  }
  // Also prove that the egress guard actually blocks a public destination.
  const net = require("node:net");
  let blocked = false;
  try { const socket = new net.Socket(); socket.connect({ host: "example.com", port: 443 }); }
  catch (error) { blocked = error.code === "FIXTURE_NON_LOOPBACK_NETWORK_BLOCKED"; }
  if (!blocked) throw fail("FIXTURE_EGRESS_GUARD_FAILED");
  const manifest = { schemaVersion: 1, fixtureOnly: true, runId, startedAt: new Date().toISOString(),
    origin, apiBaseURL: `${origin}/api/v1`, parentPid: Number(process.env.NATIVE_FIXTURE_PARENT_PID), workerPid: process.pid,
    accounts, fixtures: { academyId: String(academy._id), classId: String(academyClass._id), weekId: String(week._id),
      communityPostId: String(post._id), assessmentAttemptId: String(attempt._id), courseId: course.id, unitId: unit.id, conceptId: concept.id },
    verification, storage: "mock local memory only", productionEquivalent: false };
  const fd = await fs.promises.open(MANIFEST, "wx", 0o600);
  try { await fd.writeFile(JSON.stringify(manifest, null, 2)); await fd.sync(); } finally { await fd.close(); }
  await fs.promises.chmod(MANIFEST, 0o600);
  process.send({ ready: true, port, verification });
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    mockAssets.clear();
    if (process.connected) process.disconnect();
    process.exit(0);
  };
  process.on("message", (message) => { if (message?.stop) close(); });
  process.once("SIGTERM", close);
  process.once("SIGINT", close);
  process.once("disconnect", close);
}

(process.argv[2] === "--worker" ? worker() : controller()).catch((error) => {
  if (process.send) process.send({ failed: true, code: error.code || error.name || "FIXTURE_ERROR" });
  else console.error("Native fixture failed:", error.code || error.name || "FIXTURE_ERROR");
  process.exitCode = 1;
  if (process.argv[2] === "--worker") setTimeout(() => process.exit(1), 100).unref();
});
