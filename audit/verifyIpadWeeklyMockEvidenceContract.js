"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");

const repoRoot = path.resolve(__dirname, "..");
const resolveFromRoot = (relativePath) =>
  require.resolve(path.join(repoRoot, relativePath));
const stub = (relativePath, exports) => {
  const filename = resolveFromRoot(relativePath);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
  };
};

const USER_ID = "64d000000000000000000031";
const CASE_ID = "64d000000000000000000032";
const EXAM_ID = "64d000000000000000000033";
const NOW = new Date("2026-08-18T02:00:00.000Z");
const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "matths-weekly-evidence-contract-")
);

const archiveItems = new Map();
const discardedUploads = [];
const adminTodos = [];
let archiveSequence = 0;
let storageCalls = 0;
let releaseStorageBarrier;
const storageBarrier = new Promise((resolve) => {
  releaseStorageBarrier = resolve;
});

const integrityCase = {
  _id: CASE_ID,
  userId: USER_ID,
  examId: EXAM_ID,
  status: "EVIDENCE_REQUIRED",
  reviewStatus: "unreviewed",
  evidenceRequest: {
    deadlineAt: new Date("2026-08-19T02:00:00.000Z"),
  },
  evidenceSubmissions: [],
  requestedQuestionNumbers: [3, 17],
  async save() {
    return this;
  },
};

const PrivateMockIntegrityCase = {
  async findOne(query) {
    if (
      String(query._id) !== CASE_ID ||
      String(query.userId) !== USER_ID
    ) {
      return null;
    }
    const receiptId = query["evidenceSubmissions.receiptId"];
    if (
      receiptId &&
      !integrityCase.evidenceSubmissions.some(
        (submission) => submission.receiptId === receiptId
      )
    ) {
      return null;
    }
    return integrityCase;
  },

  async updateOne(query, update) {
    const receiptId = update.$push.evidenceSubmissions.receiptId;
    const active = query.status.$in.includes(integrityCase.status);
    const beforeDeadline =
      integrityCase.evidenceRequest.deadlineAt >
      query["evidenceRequest.deadlineAt"].$gt;
    const duplicate = integrityCase.evidenceSubmissions.some(
      (submission) => submission.receiptId === receiptId
    );
    if (!active || !beforeDeadline || duplicate) {
      return { matchedCount: 0, modifiedCount: 0 };
    }
    integrityCase.evidenceSubmissions.push(
      update.$push.evidenceSubmissions
    );
    Object.assign(integrityCase, update.$set);
    return { matchedCount: 1, modifiedCount: 1 };
  },
};

const ArchiveItem = {
  async create(document) {
    archiveSequence += 1;
    const item = {
      _id: `64d0000000000000000001${String(archiveSequence).padStart(2, "0")}`,
      ...document,
    };
    archiveItems.set(String(item._id), item);
    return item;
  },

  async deleteMany(query) {
    const ids = query?._id?.$in || [];
    for (const id of ids) archiveItems.delete(String(id));
    return { deletedCount: ids.length };
  },
};

async function discardArchiveUpload(file) {
  discardedUploads.push(file);
  if (file?.path) {
    await fs.promises.unlink(file.path).catch(() => {});
  }
}

stub("models/matthsModel.js", {
  ArchiveItem,
  PrivateMockIntegrityCase,
});
stub("models/goatArenaModel.js", {});
stub("services/archiveService.js", {
  discardArchiveUpload,
  repairUploadFilename(value) {
    return path.basename(String(value || "evidence.png"));
  },
});
stub("services/adminService.js", {});
stub("services/mmrService.js", {});
stub("services/emailService.js", {});
stub("services/userIdentityService.js", {});
stub("services/moderationNoticeService.js", {});
stub("services/adminIdentityService.js", {});
stub("services/adminTodoService.js", {
  async createAdminTodo(input) {
    adminTodos.push(input);
    return input;
  },
});
stub("services/paidFeatureAccessService.js", {});
stub("services/operationalMetricEventService.js", {});
stub("services/fileStorageService.js", {
  STORAGE_PURPOSES: {
    USER_PRIVATE_MOCK_INTEGRITY: "USER_PRIVATE_MOCK_INTEGRITY",
  },
  async storeUploadedFile(file) {
    storageCalls += 1;
    if (storageCalls === 2) releaseStorageBarrier();
    await storageBarrier;
    const asset = {
      storageProvider: "TEST",
      storagePurpose: "USER_PRIVATE_MOCK_INTEGRITY",
      storedName: path.basename(file.path),
    };
    file.storageAsset = asset;
    await fs.promises.unlink(file.path).catch(() => {});
    return asset;
  },
  storageFields(asset) {
    return asset;
  },
});
stub("content/email/privateMock.js", {});

delete require.cache[resolveFromRoot("services/privateMockExamService.js")];
const privateMockExamService = require(resolveFromRoot(
  "services/privateMockExamService.js"
));

function pngUpload(name) {
  const filePath = path.join(
    tempRoot,
    `${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`
  );
  const contents = Buffer.alloc(32);
  Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
  ]).copy(contents);
  fs.writeFileSync(filePath, contents);
  return {
    path: filePath,
    filename: path.basename(filePath),
    originalname: name,
    mimetype: "image/png",
    size: contents.length,
  };
}

async function verifyServiceIdempotency() {
  const firstUpload = pngUpload("first.png");
  const concurrentUpload = pngUpload("concurrent.png");
  const input = {
    userId: USER_ID,
    caseId: CASE_ID,
    note: "풀이과정입니다.",
    submissionId: "weekly-evidence-operation-1",
    now: NOW,
  };
  const results = await Promise.all([
    privateMockExamService.submitPrivateMockIntegrityEvidence({
      ...input,
      files: [firstUpload],
    }),
    privateMockExamService.submitPrivateMockIntegrityEvidence({
      ...input,
      files: [concurrentUpload],
    }),
  ]);

  assert.deepEqual(
    results.map((result) => result.replayed).sort(),
    [false, true],
    "동시 동일 submissionId 중 한 요청만 최초 제출이어야 합니다."
  );
  assert.equal(results[0].receiptId, results[1].receiptId);
  assert.equal(results[0].submitted, true);
  assert.equal(results[0].submittedAt, NOW.toISOString());
  assert.equal(integrityCase.evidenceSubmissions.length, 1);
  assert.equal(archiveItems.size, 1, "패배 요청의 아카이브는 제거해야 합니다.");
  assert.equal(adminTodos.length, 1, "관리자 할 일은 최초 제출에서만 만들어야 합니다.");
  assert.equal(storageCalls, 2, "동시 요청은 저장 후 원자 claim으로 경합합니다.");
  assert.equal(discardedUploads.length, 1, "패배 요청 저장물은 폐기해야 합니다.");

  const retryUpload = pngUpload("retry.png");
  const replay =
    await privateMockExamService.submitPrivateMockIntegrityEvidence({
      ...input,
      files: [retryUpload],
    });
  assert.equal(replay.replayed, true);
  assert.equal(replay.receiptId, results[0].receiptId);
  assert.equal(storageCalls, 2, "완료된 재시도는 다시 영구 저장하면 안 됩니다.");
  assert.equal(discardedUploads.length, 2);
  assert.equal(fs.existsSync(retryUpload.path), false);
}

async function verifyHttpContractAndCleanup() {
  delete require.cache[resolveFromRoot("controllers/ipadWeeklyMockController.js")];
  const { createIpadWeeklyMockController } = require(resolveFromRoot(
    "controllers/ipadWeeklyMockController.js"
  ));
  const serviceCalls = [];
  let failNext = false;
  let queuedFiles = [];
  const httpDiscarded = [];
  const controller = createIpadWeeklyMockController({
    service: {
      async submitPrivateMockIntegrityEvidence(input) {
        serviceCalls.push(input);
        if (failNext) {
          const error = new Error("현재 제출할 수 없습니다.");
          error.status = 409;
          throw error;
        }
        return {
          submitted: true,
          replayed: false,
          receiptId: "receipt-http-1",
          submittedAt: NOW.toISOString(),
        };
      },
    },
    async discardUpload(file) {
      httpDiscarded.push(file);
      await fs.promises.unlink(file.path).catch(() => {});
    },
  });

  const app = express();
  app.use(express.json());
  app.post(
    "/api/v1/weekly-mock-exams/integrity-cases/:caseId/evidence",
    (req, res, next) => {
      req.apiUser = { _id: USER_ID };
      req.files = queuedFiles;
      queuedFiles = [];
      next();
    },
    controller.submitEvidence
  );
  app.use((error, req, res, next) => {
    void req;
    void next;
    res.status(error.status || 500).json({ message: error.message });
  });

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const endpoint =
    `http://127.0.0.1:${server.address().port}` +
    `/api/v1/weekly-mock-exams/integrity-cases/${CASE_ID}/evidence`;

  try {
    let response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "weekly-http-operation-1",
      },
      body: JSON.stringify({ note: "HTTP contract" }),
    });
    assert.equal(response.status, 200);
    let payload = await response.json();
    assert.deepEqual(payload.evidence, {
      submitted: true,
      replayed: false,
      receiptId: "receipt-http-1",
      submittedAt: NOW.toISOString(),
    });
    assert.equal(
      serviceCalls[0].submissionId,
      "weekly-http-operation-1",
      "Idempotency-Key를 서비스 submissionId로 전달해야 합니다."
    );

    const failedUpload = pngUpload("http-failure.png");
    queuedFiles = [failedUpload];
    failNext = true;
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "weekly-http-operation-2",
      },
      body: JSON.stringify({ note: "failure cleanup" }),
    });
    payload = await response.json();
    assert.equal(response.status, 409);
    assert.match(payload.message, /제출할 수 없습니다/);
    assert.equal(httpDiscarded.length, 1);
    assert.equal(fs.existsSync(failedUpload.path), false);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function run() {
  try {
    await verifyServiceIdempotency();
    await verifyHttpContractAndCleanup();
    console.log(
      "iPad weekly evidence HTTP cleanup and service idempotency contract verified"
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
