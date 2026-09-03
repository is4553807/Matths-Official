/* Offline-only comparison harness. Never accepts a database URI. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");
const { performance } = require("node:perf_hooks");
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("=");
  return [arg.slice(0, at).replace(/^--/, ""), arg.slice(at + 1)];
}));
const root = path.resolve(args.root || path.join(__dirname, "../.."));
const output = path.resolve(args.output || path.join(__dirname, "../../outputs/performance", `${args.label || "run"}.json`));
const requireApp = createRequire(path.join(root, "package.json"));
const dotenv = requireApp("dotenv");
// Block dotenv from injecting any real credentials, including keys unknown to this harness.
const config = path.join(root, "config.env");
if (fs.existsSync(config)) for (const key of Object.keys(dotenv.parse(fs.readFileSync(config)))) process.env[key] = "";
for (const key of Object.keys(process.env)) {
  if (/SMTP|CLOUDINARY|R2_|OAUTH|APPLE_|INICIS|PAYPAL|STRIPE|GMAIL|OPENAI|GEMINI/.test(key)) process.env[key] = "";
}
Object.assign(process.env, {
  NODE_ENV: "test", DISABLE_SCHEDULERS: "1", PAID_CHECKOUT_MODE: "disabled",
  PRIVATE_MOCK_STORAGE_DRIVER: "local", SECRET: "isolated-performance-session-secret-2026",
  JWT_SECRET: "isolated-performance-jwt-secret-2026", MATTHS_ASSET_VERSION: "performance-fixture",
  ATTENDANCE_CODE_SECRET: "isolated-performance-attendance-secret-2026",
});
process.chdir(root);
const mongoose = requireApp("mongoose");
const { MongoMemoryReplSet } = requireApp("mongodb-memory-server-core");
const NOW = new Date("2026-09-04T03:00:00.000Z");
const PASSWORD = "Isolated-performance-2026!";
const STUDENTS = 96;
const CLASSES = 12;
const CONCEPTS = 60;
const RUNS = Number(args.runs || 15);
const id = (key) => new mongoose.Types.ObjectId(crypto.createHash("sha256").update(`performance:${key}`).digest("hex").slice(0, 24));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
// Date values/HTTP nonces are recorded in snapshots but not compared by the timing harness.
// Targeted equivalence tests separately assert calculation and ordering contracts.
function serialize(value) {
  return JSON.stringify(value, (_key, item) => item instanceof Map ? [...item] : item);
}
function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { min: sorted[0], p50: sorted[Math.ceil(sorted.length * 0.5) - 1], p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted.at(-1), mean: values.reduce((a, b) => a + b, 0) / values.length };
}

async function seed() {
  const M = requireApp("./models/matthsModel");
  const A = requireApp("./models/academyModel");
  const P = requireApp("./models/parentModel");
  const passwordHash = await requireApp("bcrypt").hash(PASSWORD, 12);
  const admin = await M.User.create({ _id: id("admin"), name: "성능운영자", email: "admin@performance.test", passwordHash, role: "admin" });
  const teacher = await M.User.create({ _id: id("teacher"), name: "성능선생님", email: "teacher@performance.test", passwordHash, role: "teacher", teacherAccessExpiresAt: new Date("2030-01-01") });
  const students = await M.User.create(Array.from({ length: STUDENTS }, (_, n) => ({
    _id: id(`student-${n}`), name: `성능학생${String(n).padStart(3, "0")}`, realName: `학생${n}`,
    email: `student${n}@performance.test`, passwordHash, role: "student", schoolGrade: 10,
    birthDate: new Date("2010-01-01"), lastLoginAt: NOW,
  })));
  const academy = await A.Academy.create({ _id: id("academy"), name: "성능검증학원", nameNormalized: "성능검증학원", status: "ACTIVE", createdByUserId: teacher._id, accessStartsAt: new Date("2025-01-01"), accessEndsAt: new Date("2030-01-01") });
  await A.AcademyStaff.create({ academyId: academy._id, userId: teacher._id, role: "OWNER", status: "ACTIVE" });
  const classes = await A.AcademyClass.create(Array.from({ length: CLASSES }, (_, n) => ({ _id: id(`class-${n}`), academyId: academy._id, name: `성능반${String(n).padStart(2, "0")}`, nameNormalized: `성능반${String(n).padStart(2, "0")}`, createdByUserId: teacher._id, homeroomTeacherUserId: teacher._id })));
  await A.AcademyStudentMembership.create(students.map((student, n) => ({ _id: id(`membership-${n}`), academyId: academy._id, studentUserId: student._id, classId: classes[n % CLASSES]._id, status: "APPROVED", approvedAt: new Date("2025-01-01"), dataConsentAt: new Date("2025-01-01") })));
  const parent = await P.ParentAccount.create({ _id: id("parent"), username: "성능학부모", usernameNormalized: "성능학부모", email: "parent@performance.test", passwordHash, childUserId: students[0]._id });
  await P.ParentChildLink.create({ parentAccountId: parent._id, childUserId: students[0]._id });
  const curriculum = requireApp("./services/curriculumService").loadCurriculum();
  const concepts = curriculum.courses.flatMap((course) => course.units.flatMap((unit) => unit.concepts.map((concept) => ({ ...concept, courseId: course.id, courseTitle: course.officialTitle, unitId: unit.id, unitTitle: unit.title })))).slice(0, CONCEPTS);
  const problems = concepts.flatMap((concept, c) => Array.from({ length: 5 }, (_, n) => ({ _id: id(`problem-${c}-${n}`), externalId: `performance-${c}-${n}`, primaryConceptId: concept.id, courseId: concept.courseId, unitId: concept.unitId, difficulty: n + 1, questionType: "multiple-choice", tags: [`type-${n}`] })));
  // Raw historical attempts avoid grading side effects during fixture setup; fields used
  // by the measured queries are deterministic. This is identical for both revisions.
  await M.Problem.collection.insertMany(problems);
  const attempts = students.flatMap((student, s) => concepts.flatMap((concept, c) => Array.from({ length: 5 }, (_, n) => ({
    _id: id(`attempt-${s}-${c}-${n}`), userId: student._id, problemId: id(`problem-${c}-${n}`),
    conceptId: concept.id, courseId: concept.courseId, unitId: concept.unitId,
    reviewSourceAttemptId: null, attemptNumber: 1, isCorrect: (s + c + n) % 3 !== 0,
    responseTimeMs: 20000 + n * 1000, submittedAt: new Date(NOW.getTime() - (n + 1) * 86400000),
    problemSnapshot: { typeId: `type-${n}`, difficulty: n + 1 },
  }))));
  await M.ProblemAttempt.collection.insertMany(attempts);
  const exams = await Promise.all(Array.from({ length: 12 }, async (_, n) => {
    const releaseAt = new Date(NOW.getTime() - (n + 1) * 7 * 86400000);
    const endedAt = new Date(releaseAt.getTime() + 3 * 3600000);
    const exam = new M.PrivateMockExam({
      _id: id(`exam-${n}`), archiveItemId: id(`archive-${n}`), title: `성능시험 ${n}`,
      weekKey: `fixture-${n}`, attemptNumber: 1, formCode: "CUSTOM", createdBy: admin._id,
      status: "archived", isTest: false, releaseAt, closeAt: endedAt,
      aggregationStartsAt: endedAt, rankingPublishesAt: endedAt, archiveAt: endedAt,
      reviewPublishesAt: endedAt, questionCount: 20, questionNumbers: Array.from({ length: 20 }, (_, q) => q + 1),
      questionConcepts: concepts.slice(0, 20).map((c, q) => ({ _id: id(`exam-concept-${n}-${q}`), conceptId: c.id, conceptTitle: c.title, courseTitle: c.courseTitle, unitTitle: c.unitTitle })),
    });
    await exam.validate();
    return exam.toObject();
  }));
  await M.PrivateMockExam.collection.insertMany(exams);
  await M.PrivateMockExamAttempt.collection.insertMany(students.flatMap((student, s) => exams.map((exam, e) => ({ _id: id(`exam-attempt-${s}-${e}`), userId: student._id, examId: exam._id, status: "submitted", integrityStatus: "CLEAR", submissionFinalization: { status: "completed" }, submittedAt: exam.releaseAt, score: (s * 7 + e) % 101, correctByQuestion: Array.from({ length: 20 }, (_, q) => (s + e + q) % 3 !== 0) }))));
  return { students, academy, classes, concepts, counts: { students: STUDENTS, classes: CLASSES, concepts: CONCEPTS, problemAttempts: attempts.length, exams: exams.length, examAttempts: STUDENTS * exams.length } };
}

async function main() {
  const memory = await MongoMemoryReplSet.create({ binary: { version: "8.2.6" }, replSet: { count: 1, storageEngine: "wiredTiger" } });
  let listener;
  const report = { label: args.label, fixtureVersion: 2, commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), node: process.version, mongo: "8.2.6", runs: RUNS, environment: "isolated localhost replica set; test env; EJS view cache enabled; schedulers/external providers excluded", results: [] };
  try {
    process.env.DB = memory.getUri("matths_performance");
    assert.match(process.env.DB, /^mongodb:\/\/127\.0\.0\.1:/);
    await mongoose.connect(process.env.DB, { monitorCommands: true });
    const { server } = requireApp("./server");
    server.enable("view cache");
    console.log("Initializing schema indexes on isolated MongoDB...");
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    console.log("Seeding deterministic fixture...");
    const fixture = await seed();
    report.fixture = fixture.counts;
    listener = server.listen(0, "127.0.0.1");
    await new Promise((resolve) => listener.once("listening", resolve));
    const base = `http://127.0.0.1:${listener.address().port}`;
    process.env.APP_BASE_URL = base;
    process.env.PUBLIC_BASE_URL = base;
    const cookies = {};
    const tokens = {};
    async function request(route, role = "public", body) {
      return new Promise((resolve, reject) => {
        const started = performance.now();
        const req = http.request(`${base}${route}`, { method: body ? "POST" : "GET", headers: { "accept-encoding": "gzip", ...(cookies[role] ? { cookie: cookies[role] } : {}), ...(tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}), ...(body ? { "content-type": "application/x-www-form-urlencoded", origin: base } : {}) } }, (res) => {
          const ttfb = performance.now() - started;
          const chunks = [];
          if (res.headers["set-cookie"]) cookies[role] = res.headers["set-cookie"].map((item) => item.split(";")[0]).join("; ");
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const wire = Buffer.concat(chunks);
            const bytes = res.headers["content-encoding"] === "gzip" ? require("node:zlib").gunzipSync(wire) : wire;
            resolve({ status: res.statusCode, location: res.headers.location, ttfb, wireBytes: wire.length, body: bytes.toString() });
          });
        });
        req.on("error", reject);
        req.setTimeout(60000, () => req.destroy(new Error(`Timeout ${route}`)));
        req.end(body ? new URLSearchParams(body).toString() : undefined);
      });
    }
    for (const role of ["admin", "teacher", "student", "parent"]) {
      const login = await request("/login", role, { email: `${role === "student" ? "student0" : role}@performance.test`, password: PASSWORD });
      assert.equal(login.status, 302, `Real ${role} login failed: ${login.body.slice(0, 600)}`);
      assert.ok(cookies[role], `Missing ${role} session`);
    }
    if (args.surface === "api") {
      for (const role of ["admin", "teacher", "student"]) {
        const login = await request("/api/v1/auth/login", role, { email: `${role === "student" ? "student0" : role}@performance.test`, password: PASSWORD });
        assert.equal(login.status, 200, `Real API ${role} login failed`);
        tokens[role] = JSON.parse(login.body).accessToken;
        assert.ok(tokens[role]);
      }
      assert.equal((await request("/api/v1/me")).status, 401);
      assert.equal((await request("/api/v1/academy/admin/list", "student")).status, 403);
      report.authorizationChecks = ["anonymous API access: 401", "student admin access: 403"];
    }
    let active = null;
    const commands = new Map();
    const client = mongoose.connection.getClient();
    client.on("commandStarted", (event) => {
      if (!active || !["find", "aggregate", "count", "distinct", "getMore", "insert", "update", "delete", "findAndModify"].includes(event.commandName)) return;
      active.queries++;
      const collection = event.command[event.commandName] || event.command.collection;
      const key = `${event.commandName}:${collection}`;
      active.commands[key] = (active.commands[key] || 0) + 1;
      commands.set(event.requestId, active);
    });
    client.on("commandSucceeded", (event) => {
      const metric = commands.get(event.requestId);
      if (metric) metric.dbMs += event.duration;
      commands.delete(event.requestId);
    });
    async function measure(name, run, kind) {
      const samples = [];
      let firstOutput;
      for (let n = 0; n <= RUNS; n++) {
        active = { queries: 0, dbMs: 0, commands: {} };
        const cpu = process.cpuUsage();
        const start = performance.now();
        const value = await run();
        const ms = performance.now() - start;
        const cpuUsed = process.cpuUsage(cpu);
        const metric = { ...active, ms, cpuMs: (cpuUsed.user + cpuUsed.system) / 1000 };
        active = null;
        const body = kind === "http" ? value.body : serialize(value);
        Object.assign(metric, { bytes: Buffer.byteLength(body), ...(kind === "http" ? { status: value.status, ttfb: value.ttfb, wireBytes: value.wireBytes, location: value.location } : {}) });
        if (n === 0) firstOutput = body;
        samples.push(metric);
      }
      const warm = samples.slice(1);
      const result = { name, kind, cold: samples[0], warm: Object.fromEntries(["ms", "cpuMs", "dbMs", "queries", "bytes", ...(kind === "http" ? ["ttfb", "wireBytes"] : [])].map((key) => [key, summarize(warm.map((s) => s[key]))])), samples, firstOutputHash: hash(firstOutput) };
      report.results.push(result);
      const snapshotPath = path.join(path.dirname(output), `${args.label || "run"}-snapshots`, `${name.replace(/[^a-z0-9_-]+/gi, "_")}.txt`);
      fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
      fs.writeFileSync(snapshotPath, firstOutput);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, JSON.stringify(report, null, 2));
      console.log(`${name}: ${result.warm.ms.p50.toFixed(1)}ms p50, ${result.warm.ms.p95.toFixed(1)}ms p95, ${result.warm.queries.p50} DB commands${kind === "http" ? `, HTTP ${samples[0].status}` : ""}`);
    }
    const pages = args.surface === "api" ? {
      student: ["/api/v1/me", "/api/v1/curriculum", "/api/v1/learning", "/api/v1/dashboard/activity", "/api/v1/notifications", "/api/v1/assessments", "/api/v1/wrong-notes", "/api/v1/academy/student", "/api/v1/weekly-mock-exams", "/api/v1/goat-arena", "/api/v1/archive", "/api/v1/study-hall"],
      teacher: ["/api/v1/academy/teacher", "/api/v1/academy/teacher/analytics", "/api/v1/academy/teacher/students"],
      admin: ["/api/v1/academy/admin/list", `/api/v1/academy/admin/${id("academy")}`, "/api/admin/revenue"],
    } : {
      public: ["/", "/intro", "/pricing", "/curriculum", "/faq", "/community"],
      student: ["/main", "/my-learning", "/log-curriculum", "/wrong-notes", "/assessments", "/profile", "/notifications", "/my-academy", "/private-mock-exams", "/war-of-masters", "/war-of-masters/rankings", "/goat-arena", "/store"],
      teacher: ["/academy", "/academy?tab=students", "/academy?tab=classes", "/academy?tab=attendance", `/academy/classes/${id("class-0")}`, `/academy/students/${id("membership-0")}`],
      parent: ["/parent", "/parent/notifications", "/parent/pricing", "/parent/payments"],
      admin: ["/admin", "/admin/academies", ...["overview", "analytics", "members", "classes", "attendance"].map((section) => `/admin/academies/${id("academy")}/${section}`), "/admin/users", `/admin/users/${id("student-0")}`, "/admin/private-mock-exams", "/admin/community", "/admin/arena-policies", "/admin/problem-banks", "/admin/arena-audit", "/admin/data-analysis", "/api/admin/revenue"],
    };
    for (const [role, routes] of Object.entries(pages)) for (const route of routes) {
      if (!args.filter || `${role} ${route}`.includes(args.filter)) await measure(`${role} ${route}`, () => request(route, role), "http");
    }
    const userIds = fixture.students.map((student) => student._id);
    for (const [name, run] of [
      ["weekly-academy", () => requireApp("./services/weeklyMockInsightService").getAcademyWeeklyMockInsights({ academyId: fixture.academy._id, now: NOW })],
      ["math-map-class", () => requireApp("./services/mathMapService").getClassMathMap({ studentUserIds: userIds })],
      ["math-map-student", () => requireApp("./services/mathMapService").getStudentMathMap({ studentUserId: userIds[0] })],
      ["monthly-academy", () => requireApp("./services/academyStatisticsService").getAcademyMonthlyStatistics({ studentUserIds: userIds, now: NOW })],
      ["date-keys-1000", () => Array.from({ length: 1000 }, (_, n) => requireApp("./services/userLifecycleService").getKoreanDateKey(new Date(NOW.getTime() - n * 86400000)))],
    ]) if (args.surface !== "api" && (!args.filter || name.includes(args.filter))) await measure(name, run, "service");
    const explain = await requireApp("./models/matthsModel").User.findOne({ email: "student0@performance.test" }).explain("executionStats");
    report.userLookupExplain = { plan: explain.queryPlanner.winningPlan, nReturned: explain.executionStats.nReturned, keysExamined: explain.executionStats.totalKeysExamined, docsExamined: explain.executionStats.totalDocsExamined };
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(`Saved ${output}`);
  } finally {
    if (listener) await new Promise((resolve) => listener.close(resolve));
    await mongoose.disconnect();
    await memory.stop();
  }
}
module.exports = { seed, id, NOW };
if (require.main === module) main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
