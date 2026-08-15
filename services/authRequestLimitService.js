const {
  createHash,
} = require("node:crypto");
const {
  AuthRequestLimitBucket,
} = require("../models/matthsModel");

const MAX_RESERVATION_RETRIES = 6;

async function ensureAuthRequestLimitIndexes() {
  await AuthRequestLimitBucket.createIndexes();
  return true;
}

function bucketDocumentId(value) {
  return createHash("sha256")
    .update(String(value || ""))
    .digest("hex");
}

function normalizedResult(
  bucket,
  limit,
  limited = false
) {
  return {
    count: Math.max(
      0,
      Number(bucket?.count) || 0
    ),
    limit,
    limited,
    resetAt: new Date(
      bucket.resetAt
    ),
  };
}

async function consumeAuthRequestLimit({
  bucketKey,
  limit,
  windowMs,
  now = new Date(),
}) {
  const safeLimit = Number(limit);
  const safeWindowMs =
    Number(windowMs);
  if (
    !bucketKey ||
    !Number.isSafeInteger(safeLimit) ||
    safeLimit < 1 ||
    !Number.isFinite(safeWindowMs) ||
    safeWindowMs < 1
  ) {
    throw new TypeError(
      "공용 인증 요청 제한 설정을 확인해주세요."
    );
  }

  const observedAt = new Date(now);
  if (
    Number.isNaN(
      observedAt.getTime()
    )
  ) {
    throw new TypeError(
      "인증 요청 시각을 확인해주세요."
    );
  }

  const _id =
    bucketDocumentId(bucketKey);
  const nextResetAt = new Date(
    observedAt.getTime() +
      safeWindowMs
  );

  for (
    let attempt = 0;
    attempt <
    MAX_RESERVATION_RETRIES;
    attempt += 1
  ) {
    const active =
      await AuthRequestLimitBucket.findOneAndUpdate(
        {
          _id,
          resetAt: {
            $gt: observedAt,
          },
          count: {
            $lt: safeLimit,
          },
        },
        {
          $inc: {
            count: 1,
          },
        },
        {
          returnDocument: "after",
          runValidators: true,
        }
      ).lean();

    if (active) {
      return normalizedResult(
        active,
        safeLimit
      );
    }

    const current =
      await AuthRequestLimitBucket.findById(
        _id
      ).lean();

    if (
      current &&
      new Date(
        current.resetAt
      ) > observedAt
    ) {
      if (
        Number(current.count) >=
        safeLimit
      ) {
        return normalizedResult(
          current,
          safeLimit,
          true
        );
      }
      continue;
    }

    if (current) {
      const rotated =
        await AuthRequestLimitBucket.findOneAndUpdate(
          {
            _id,
            resetAt: {
              $lte: observedAt,
            },
          },
          {
            $set: {
              count: 1,
              resetAt:
                nextResetAt,
            },
          },
          {
            returnDocument:
              "after",
            runValidators: true,
          }
        ).lean();
      if (rotated) {
        return normalizedResult(
          rotated,
          safeLimit
        );
      }
      continue;
    }

    try {
      const created =
        await AuthRequestLimitBucket.create({
          _id,
          count: 1,
          resetAt:
            nextResetAt,
        });
      return normalizedResult(
        created,
        safeLimit
      );
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
  }

  const error = new Error(
    "인증 요청 제한 상태가 동시에 변경되었습니다. 잠시 후 다시 시도해주세요."
  );
  error.status = 409;
  error.code =
    "AUTH_RATE_LIMIT_CONFLICT";
  throw error;
}

module.exports = {
  bucketDocumentId,
  consumeAuthRequestLimit,
  ensureAuthRequestLimitIndexes,
};
