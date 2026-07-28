const crypto = require("crypto");

const ACCESS_TOKEN_TTL_SECONDS =
  Math.max(
    60,
    Number(
      process.env.API_TOKEN_TTL_SECONDS
    ) ||
      30 * 24 * 60 * 60
  );

function tokenSecret() {
  const secret =
    process.env.API_TOKEN_SECRET ||
    process.env.SECRET;

  if (!secret) {
    throw new Error(
      "API_TOKEN_SECRET 또는 SECRET 환경 변수가 필요합니다."
    );
  }

  return secret;
}

function encode(value) {
  return Buffer.from(
    JSON.stringify(value)
  ).toString("base64url");
}

function sign(unsignedToken) {
  return crypto
    .createHmac(
      "sha256",
      tokenSecret()
    )
    .update(unsignedToken)
    .digest("base64url");
}

function createAccessToken(user) {
  const now = Math.floor(
    Date.now() / 1000
  );
  const header = encode({
    alg: "HS256",
    typ: "MATTHS",
  });
  const payload = encode({
    sub: String(user._id || user.id),
    email: user.email,
    role: user.role || "student",
    ver:
      Number(user.tokenVersion) || 0,
    iat: now,
    exp:
      now +
      ACCESS_TOKEN_TTL_SECONDS,
  });
  const unsignedToken = `${header}.${payload}`;

  return `${unsignedToken}.${sign(
    unsignedToken
  )}`;
}

function safeEqual(first, second) {
  const left = Buffer.from(
    String(first || "")
  );
  const right = Buffer.from(
    String(second || "")
  );

  return (
    left.length === right.length &&
    crypto.timingSafeEqual(left, right)
  );
}

function verifyAccessToken(token) {
  const parts = String(token || "")
    .split(".");

  if (parts.length !== 3) {
    return null;
  }

  const unsignedToken = `${parts[0]}.${parts[1]}`;

  if (
    !safeEqual(
      parts[2],
      sign(unsignedToken)
    )
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(
        parts[1],
        "base64url"
      ).toString("utf8")
    );
    const now = Math.floor(
      Date.now() / 1000
    );

    if (
      !payload.sub ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= now
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

module.exports = {
  ACCESS_TOKEN_TTL_SECONDS,
  createAccessToken,
  verifyAccessToken,
};
