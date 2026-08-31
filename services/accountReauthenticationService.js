const crypto = require("crypto");
const AccountReauthenticationGrant = require(
  "../models/accountReauthenticationGrantModel"
);

const REAUTHENTICATION_TTL_MS = 5 * 60 * 1000;
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;
const SOCIAL_PROVIDERS = new Set(["google", "kakao"]);

const digest = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

const verifierChallenge = (value) =>
  crypto
    .createHash("sha256")
    .update(String(value))
    .digest("base64url");

function secret() {
  const value = process.env.API_TOKEN_SECRET || process.env.SECRET;
  if (!value) {
    throw new Error("API_TOKEN_SECRET 또는 SECRET 환경 변수가 필요합니다.");
  }
  return crypto
    .createHash("sha256")
    .update("matths-account-reauthentication-v1\0")
    .update(String(value))
    .digest();
}

function safeEqual(left, right) {
  const first = Buffer.from(String(left || ""));
  const second = Buffer.from(String(right || ""));
  return (
    first.length === second.length &&
    crypto.timingSafeEqual(first, second)
  );
}

function assertCodeChallenge(codeChallenge) {
  const normalized = String(codeChallenge || "").trim();
  if (!CODE_CHALLENGE_PATTERN.test(normalized)) {
    const error = new Error("본인 확인 요청 정보가 올바르지 않습니다.");
    error.status = 400;
    error.code = "ACCOUNT_REAUTHENTICATION_PKCE_REQUIRED";
    throw error;
  }
  return normalized;
}

function normalizeProvider(provider) {
  const normalized = String(provider || "").toLowerCase();
  if (!SOCIAL_PROVIDERS.has(normalized)) {
    const error = new Error("지원하지 않는 본인 확인 방식입니다.");
    error.status = 404;
    error.code = "ACCOUNT_REAUTHENTICATION_PROVIDER_NOT_FOUND";
    throw error;
  }
  return normalized;
}

function issueStartTicket({ userId, codeChallenge, provider, now = Date.now() }) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: String(userId),
      provider: normalizeProvider(provider),
      codeChallenge: assertCodeChallenge(codeChallenge),
      exp: now + REAUTHENTICATION_TTL_MS,
      nonce: crypto.randomBytes(16).toString("base64url"),
    })
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function verifyStartTicket(ticket, { now = Date.now() } = {}) {
  const [payload, signature, extra] = String(ticket || "").split(".");
  if (!payload || !signature || extra) return null;
  const expected = crypto
    .createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      !decoded.sub ||
      !SOCIAL_PROVIDERS.has(String(decoded.provider || "")) ||
      !CODE_CHALLENGE_PATTERN.test(String(decoded.codeChallenge || "")) ||
      !Number.isFinite(decoded.exp) ||
      decoded.exp <= now
    ) {
      return null;
    }
    return {
      userId: String(decoded.sub),
      provider: String(decoded.provider),
      codeChallenge: String(decoded.codeChallenge),
    };
  } catch {
    return null;
  }
}

async function issueSocialProof(
  { userId, codeChallenge, provider },
  { GrantModel = AccountReauthenticationGrant, now = Date.now() } = {}
) {
  const proof = crypto.randomBytes(32).toString("base64url");
  await GrantModel.create({
    tokenHash: digest(proof),
    codeChallenge: assertCodeChallenge(codeChallenge),
    userId,
    provider: normalizeProvider(provider),
    expiresAt: new Date(now + REAUTHENTICATION_TTL_MS),
  });
  return proof;
}

async function consumeSocialProof(
  { proof, codeVerifier, userId, provider },
  { GrantModel = AccountReauthenticationGrant, now = Date.now() } = {}
) {
  const normalizedProof = String(proof || "").trim();
  const verifier = String(codeVerifier || "").trim();
  if (!normalizedProof || !CODE_VERIFIER_PATTERN.test(verifier)) return false;

  const consumed = await GrantModel.findOneAndUpdate(
    {
      tokenHash: digest(normalizedProof),
      codeChallenge: verifierChallenge(verifier),
      userId,
      provider: normalizeProvider(provider),
      consumedAt: null,
      expiresAt: { $gt: new Date(now) },
    },
    { $set: { consumedAt: new Date(now) } },
    { new: true }
  );
  return Boolean(consumed);
}

module.exports = {
  REAUTHENTICATION_TTL_MS,
  assertCodeChallenge,
  consumeSocialProof,
  issueSocialProof,
  issueStartTicket,
  verifyStartTicket,
  _testing: {
    CODE_CHALLENGE_PATTERN,
    CODE_VERIFIER_PATTERN,
    verifierChallenge,
  },
};
