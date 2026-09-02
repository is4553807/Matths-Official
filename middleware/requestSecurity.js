const { createHash } = require("node:crypto");
const {
  consumeAuthRequestLimit,
} = require("../services/authRequestLimitService");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_MAX_BUCKETS = 20_000;

function statusError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizedOrigin(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    return url.origin;
  } catch (_error) {
    return "";
  }
}

function configuredOrigins() {
  return new Set(
    [process.env.APP_BASE_URL, process.env.PUBLIC_BASE_URL]
      .map(normalizedOrigin)
      .filter(Boolean)
  );
}

function requestOrigin(req) {
  const origin = String(req.get?.("origin") || "").trim();
  if (origin) return normalizedOrigin(origin);
  const referer = String(req.get?.("referer") || "").trim();
  return referer ? normalizedOrigin(referer) : "";
}

function currentRequestOrigin(req) {
  const protocol = String(req.protocol || "http").toLowerCase();
  const host = String(req.get?.("host") || "").trim();
  return normalizedOrigin(`${protocol}://${host}`);
}

function isApiRequest(req) {
  return String(req.originalUrl || req.url || "").startsWith("/api/v1/");
}

function isAppleOAuthCallback(req) {
  const pathname = String(req.path || req.originalUrl || req.url || "")
    .split("?")[0];
  return (
    String(req.method || "").toUpperCase() === "POST" &&
    pathname === "/auth/apple/callback" &&
    String(req.get?.("content-type") || "")
      .toLowerCase()
      .startsWith("application/x-www-form-urlencoded")
  );
}

function isInicisPaymentCallback(req) {
  const pathname = String(req.path || req.originalUrl || req.url || "")
    .split("?")[0];
  return (
    String(req.method || "").toUpperCase() === "POST" &&
    pathname === "/payments/inicis/return" &&
    String(req.get?.("content-type") || "")
      .toLowerCase()
      .startsWith("application/x-www-form-urlencoded")
  );
}

function sameOriginProtection(req, _res, next) {
  if (
    SAFE_METHODS.has(String(req.method || "GET").toUpperCase()) ||
    isApiRequest(req) ||
    isAppleOAuthCallback(req) ||
    isInicisPaymentCallback(req)
  ) {
    return next();
  }

  const fetchSite = String(req.get?.("sec-fetch-site") || "").toLowerCase();
  if (fetchSite === "cross-site") {
    return next(statusError(
      403,
      "다른 사이트에서 시작된 요청은 처리할 수 없습니다. Matths 페이지에서 다시 시도해주세요.",
      "CROSS_SITE_REQUEST_BLOCKED"
    ));
  }

  const suppliedOrigin = requestOrigin(req);
  if (!suppliedOrigin) {
    if (process.env.NODE_ENV !== "production") return next();
    return next(statusError(
      403,
      "요청 출처를 확인할 수 없습니다. Matths 페이지를 새로고침한 뒤 다시 시도해주세요.",
      "REQUEST_ORIGIN_REQUIRED"
    ));
  }

  const allowedOrigins = configuredOrigins();
  if (process.env.NODE_ENV !== "production") {
    const localOrigin = currentRequestOrigin(req);
    if (localOrigin) allowedOrigins.add(localOrigin);
  }

  if (!allowedOrigins.has(suppliedOrigin)) {
    return next(statusError(
      403,
      "요청 출처가 Matths 서비스 주소와 일치하지 않습니다.",
      "REQUEST_ORIGIN_MISMATCH"
    ));
  }
  return next();
}

function clientAddress(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown")
    .replace(/^::ffff:/, "")
    .slice(0, 120);
}

function identifierDigest(value) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .slice(0, 320);
  return normalized
    ? createHash("sha256").update(normalized).digest("base64url").slice(0, 22)
    : "none";
}

function authRequestKey(req) {
  const identifier =
    req.body?.identifier ||
    req.body?.email ||
    req.body?.username ||
    "";
  return `${clientAddress(req)}:${identifierDigest(identifier)}`;
}

function createRateLimit({
  name,
  limit,
  windowMs,
  key = authRequestKey,
  maxBuckets = DEFAULT_MAX_BUCKETS,
  consumer = null,
}) {
  if (!name || !Number.isSafeInteger(limit) || limit < 1 || !Number.isFinite(windowMs)) {
    throw new TypeError("요청 제한 설정을 확인해주세요.");
  }
  const buckets = new Map();
  let lastCleanupAt = 0;

  function cleanup(now) {
    if (now - lastCleanupAt < Math.min(windowMs, 60_000) && buckets.size <= maxBuckets) return;
    lastCleanupAt = now;
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
    while (buckets.size > maxBuckets) {
      buckets.delete(buckets.keys().next().value);
    }
  }

  function applyHeaders(
    res,
    count,
    resetAt
  ) {
    const resetAtMs = new Date(
      resetAt
    ).getTime();
    const remaining = Math.max(
      0,
      limit - count
    );
    res.set?.(
      "RateLimit-Limit",
      String(limit)
    );
    res.set?.(
      "RateLimit-Remaining",
      String(remaining)
    );
    res.set?.(
      "RateLimit-Reset",
      String(
        Math.ceil(
          resetAtMs / 1000
        )
      )
    );
    return resetAtMs;
  }

  function blockedError(
    res,
    resetAtMs,
    now
  ) {
    const retryAfterSeconds =
      Math.max(
        1,
        Math.ceil(
          (resetAtMs - now) /
            1000
        )
      );
    res.set?.(
      "Retry-After",
      String(retryAfterSeconds)
    );
    return statusError(
      429,
      "짧은 시간에 인증 요청이 너무 많이 발생했습니다. 잠시 후 다시 시도해주세요.",
      "AUTH_RATE_LIMITED"
    );
  }

  const middleware = (req, res, next) => {
    const now = Date.now();
    const bucketKey = `${name}:${key(req)}`;

    if (consumer) {
      return Promise.resolve(
        consumer({
          bucketKey,
          limit,
          windowMs,
          now: new Date(now),
        })
      )
        .then((result) => {
          const resetAtMs =
            applyHeaders(
              res,
              Number(
                result.count
              ) || 0,
              result.resetAt
            );
          if (result.limited) {
            return next(
              blockedError(
                res,
                resetAtMs,
                now
              )
            );
          }
          return next();
        })
        .catch(next);
    }

    cleanup(now);
    let bucket = buckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(bucketKey, bucket);
    }
    bucket.count += 1;
    const resetAtMs = applyHeaders(
      res,
      bucket.count,
      bucket.resetAt
    );

    if (bucket.count > limit) {
      return next(
        blockedError(
          res,
          resetAtMs,
          now
        )
      );
    }
    return next();
  };

  middleware.reset = () => buckets.clear();
  middleware.bucketCount = () => buckets.size;
  return middleware;
}

const loginRateLimit = createRateLimit({
  name: "login",
  limit: 10,
  windowMs: 15 * 60 * 1000,
  consumer:
    consumeAuthRequestLimit,
});
const loginIpRateLimit = createRateLimit({
  name: "login-ip",
  limit: 60,
  windowMs: 15 * 60 * 1000,
  key: clientAddress,
  consumer:
    consumeAuthRequestLimit,
});
const appleWebOAuthStartIpRateLimit =
  createRateLimit({
    name: "apple-web-oauth-start-ip",
    limit: 30,
    windowMs:
      15 * 60 * 1000,
    key: clientAddress,
    consumer:
      consumeAuthRequestLimit,
  });
const appleWebOAuthCallbackIpRateLimit =
  createRateLimit({
    name: "apple-web-oauth-callback-ip",
    limit: 60,
    windowMs:
      15 * 60 * 1000,
    key: clientAddress,
    consumer:
      consumeAuthRequestLimit,
  });
const registrationRateLimit = createRateLimit({
  name: "registration",
  limit: 5,
  windowMs: 60 * 60 * 1000,
  consumer:
    consumeAuthRequestLimit,
});
const registrationIpRateLimit =
  createRateLimit({
    name: "registration-ip",
    limit: 20,
    windowMs:
      60 * 60 * 1000,
    key: clientAddress,
    consumer:
      consumeAuthRequestLimit,
  });
const passwordResetRateLimit = createRateLimit({
  name: "password-reset",
  limit: 5,
  windowMs: 15 * 60 * 1000,
  consumer:
    consumeAuthRequestLimit,
});
const passwordResetIpRateLimit =
  createRateLimit({
    name: "password-reset-ip",
    limit: 30,
    windowMs:
      15 * 60 * 1000,
    key: clientAddress,
    consumer:
      consumeAuthRequestLimit,
  });

module.exports = {
  appleWebOAuthCallbackIpRateLimit,
  appleWebOAuthStartIpRateLimit,
  authRequestKey,
  configuredOrigins,
  createRateLimit,
  loginIpRateLimit,
  loginRateLimit,
  passwordResetIpRateLimit,
  passwordResetRateLimit,
  registrationIpRateLimit,
  registrationRateLimit,
  sameOriginProtection,
};
