const crypto = require("node:crypto");
const fs = require("node:fs");

const COMMUNITY_REQUEST_INDEX = Object.freeze({
  name: "community_author_request_id_unique_v1",
  key: { authorId: 1, requestId: 1 },
  unique: true,
  partialFilterExpression: { requestId: { $type: "string" } },
});
const indexChecks = new WeakMap();

function requestError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function normalizeRequestId(value) {
  // Missing key keeps the existing web/client behavior. A supplied invalid key
  // is never silently discarded, because doing so could duplicate a retry.
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
    throw requestError(400, "COMMUNITY_REQUEST_INVALID", "요청 식별자가 올바르지 않습니다.");
  }
  return value;
}

async function ensureCommunityRequestIndex(model) {
  let pending = indexChecks.get(model);
  if (!pending) {
    pending = model.collection.createIndex(COMMUNITY_REQUEST_INDEX.key, {
      name: COMMUNITY_REQUEST_INDEX.name,
      unique: true,
      partialFilterExpression: COMMUNITY_REQUEST_INDEX.partialFilterExpression,
    }).catch((cause) => {
      indexChecks.delete(model);
      throw Object.assign(requestError(503, "COMMUNITY_IDEMPOTENCY_UNAVAILABLE",
        "중복 등록 방지 확인이 지연되고 있습니다. 같은 요청으로 다시 시도해주세요."), { cause });
    });
    indexChecks.set(model, pending);
  }
  await pending;
}

async function uploadedBytesHash(file) {
  // These are server-owned multer files, not client-supplied filesystem paths.
  // Hash before storage consumes/deletes the staged file. Do not trust a client
  // hash or only compare names and lengths (different bytes can share both).
  const digest = crypto.createHash("sha256");
  if (Buffer.isBuffer(file?.buffer)) digest.update(file.buffer);
  else if (file?.path) {
    for await (const chunk of fs.createReadStream(file.path)) digest.update(chunk);
  } else {
    throw requestError(400, "COMMUNITY_REQUEST_INVALID", "첨부파일 원본을 확인할 수 없습니다.");
  }
  return digest.digest("hex");
}

async function communityRequestIdentity({ requestId, payload, files = [] }) {
  const key = normalizeRequestId(requestId);
  if (!key) return null;
  const attachments = [];
  for (const file of files) {
    attachments.push({
      name: String(file.originalname || "").normalize("NFC"),
      mime: String(file.mimetype || ""),
      size: Number(file.size) || 0,
      sha256: await uploadedBytesHash(file),
    });
  }
  return {
    requestId: key,
    requestFingerprint: crypto.createHash("sha256")
      .update(JSON.stringify({ version: 1, payload, attachments })).digest("hex"),
  };
}

async function findCommunityRequestReplay(model, authorId, identity) {
  if (!identity) return null;
  await ensureCommunityRequestIndex(model);
  const record = await model.findOne({ authorId, requestId: identity.requestId });
  if (record && record.requestFingerprint !== identity.requestFingerprint) {
    throw requestError(409, "COMMUNITY_REQUEST_ID_CONFLICT",
      "이미 접수된 요청과 내용이 다릅니다. 기존 등록 결과를 확인해주세요.");
  }
  if (record && (record.status !== "published" || record.authorDeletedAt)) {
    // Never recreate an author-deleted or moderated write from an old request,
    // nor return a success DTO that would immediately fail the detail lookup.
    throw requestError(410, "COMMUNITY_REQUEST_NO_LONGER_VISIBLE",
      "이 요청으로 등록한 글 또는 댓글은 삭제되었거나 숨김 처리되었습니다.");
  }
  return record;
}

module.exports = {
  COMMUNITY_REQUEST_INDEX,
  communityRequestIdentity,
  ensureCommunityRequestIndex,
  findCommunityRequestReplay,
  normalizeRequestId,
};
