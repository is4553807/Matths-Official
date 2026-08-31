const crypto = require("node:crypto");
const mongoose = require("mongoose");
const {
  AppleCommerceAccountToken,
} = require("../models/goatArenaModel");

let indexPromise = null;

function statusError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeToken(value) {
  const token = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(token)
    ? token
    : "";
}

async function ensureIndexes() {
  if (!indexPromise) {
    indexPromise = AppleCommerceAccountToken.createIndexes().catch((error) => {
      indexPromise = null;
      throw error;
    });
  }
  await indexPromise;
}

function assertUserId(userId) {
  if (!mongoose.isValidObjectId(userId)) {
    throw statusError(
      400,
      "결제 대상 사용자를 확인해주세요.",
      "INVALID_USER_ID"
    );
  }
}

function ownerConflict() {
  return statusError(
    409,
    "이 App Store 결제는 다른 Matths 계정에서 시작되었습니다. 구매를 시작한 계정으로 로그인해주세요.",
    "APPLE_APP_ACCOUNT_OWNER_CONFLICT"
  );
}

/**
 * 결제 시트가 열리기 전에 appAccountToken을 현재 Bearer 사용자에게 고정한다.
 * 한 사용자는 여러 기기의 토큰을 가질 수 있지만, 같은 UUID는 한 사용자만 소유한다.
 */
async function issueAppleCommerceAccountToken({ userId, proposedToken }) {
  assertUserId(userId);
  await ensureIndexes();
  const proposed = String(proposedToken || "").trim();
  const normalizedProposed = normalizeToken(proposed);
  if (proposed && !normalizedProposed) {
    throw statusError(
      400,
      "App Store 결제 계정 식별자를 확인해주세요.",
      "APPLE_APP_ACCOUNT_TOKEN_INVALID"
    );
  }
  const token = normalizedProposed || crypto.randomUUID();
  const ownerId = String(userId);

  const existing = await AppleCommerceAccountToken.findOne({ token }).lean();
  if (existing) {
    if (String(existing.userId) !== ownerId) throw ownerConflict();
    return { token };
  }

  try {
    await AppleCommerceAccountToken.create({ userId, token });
    return { token };
  } catch (error) {
    // 두 요청이 같은 UUID를 동시에 등록해도 unique index가 한 명만 이기게 한다.
    if (error?.code !== 11000) throw error;
    const winner = await AppleCommerceAccountToken.findOne({ token }).lean();
    if (!winner || String(winner.userId) !== ownerId) throw ownerConflict();
    return { token };
  }
}

/**
 * JWS 안 appAccountToken의 소유자를 확인한다. 구버전에서 서버 선등록 없이 시작된
 * 거래는 최초 redeem 때만 현재 사용자에게 원자적으로 귀속하고 이후에는 바꿀 수 없다.
 */
async function assertAppleCommerceAccountTokenOwner({ userId, token }) {
  assertUserId(userId);
  const normalized = normalizeToken(token);
  if (!normalized) {
    throw statusError(
      409,
      "App Store 결제 계정 식별자가 없습니다. 구매 복원을 다시 시도해주세요.",
      "APPLE_APP_ACCOUNT_TOKEN_REQUIRED"
    );
  }
  await issueAppleCommerceAccountToken({
    userId,
    proposedToken: normalized,
  });
  return normalized;
}

/**
 * Apple 서버 통지는 Matths Bearer 없이 도착한다. 구매 전에 이미 귀속된 UUID만
 * 역조회하며, 통지 값만 보고 새 소유자를 만들지는 않는다. 그러면 앱이 꺼진 동안
 * SUBSCRIBED가 와도 원래 계정을 찾을 수 있고, 미등록 UUID를 공격자가 선점할 수 없다.
 */
async function findAppleCommerceAccountTokenOwner(token) {
  const normalized = normalizeToken(token);
  if (!normalized) return null;
  await ensureIndexes();
  const existing = await AppleCommerceAccountToken.findOne({ token: normalized })
    .select("userId")
    .lean();
  return existing?.userId ? String(existing.userId) : null;
}

module.exports = {
  issueAppleCommerceAccountToken,
  assertAppleCommerceAccountTokenOwner,
  findAppleCommerceAccountTokenOwner,
  _testing: {
    normalizeToken,
  },
};
