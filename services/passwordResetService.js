const crypto = require("crypto");
const bcrypt = require("bcrypt");
const {
  PasswordResetCode,
  User,
} = require("../models/matthsModel");
const {
  sendPasswordResetCode,
} = require("./emailService");

const CODE_TTL_MS =
  10 * 60 * 1000;
const RESEND_WAIT_MS =
  60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 12;

function hashCode(userId, code) {
  return crypto
    .createHmac(
      "sha256",
      process.env
        .PASSWORD_RESET_SECRET ||
        process.env.SECRET
    )
    .update(`${userId}:${code}`)
    .digest("hex");
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

function validatePassword(password) {
  const value = String(password || "");

  if (
    value.length < 8 ||
    !/[A-Za-z]/.test(value) ||
    !/\d/.test(value)
  ) {
    const error = new Error(
      "비밀번호는 영문과 숫자를 포함해 8자 이상이어야 합니다."
    );
    error.status = 400;
    throw error;
  }

  return value;
}

async function requestPasswordReset(
  email
) {
  const normalizedEmail = String(
    email || ""
  )
    .trim()
    .toLowerCase();
  const user = await User.findOne({
    email: normalizedEmail,
    isActive: true,
  }).lean();

  if (!user) {
    return {
      requested: true,
      email: normalizedEmail,
      previewCode: null,
    };
  }

  const recent =
    await PasswordResetCode.findOne({
      userId: user._id,
      createdAt: {
        $gte: new Date(
          Date.now() -
            RESEND_WAIT_MS
        ),
      },
    }).lean();

  if (recent) {
    return {
      requested: true,
      email: normalizedEmail,
      previewCode: null,
    };
  }

  await PasswordResetCode.updateMany(
    {
      userId: user._id,
      status: {
        $in: [
          "pending",
          "verified",
        ],
      },
    },
    {
      $set: {
        status: "locked",
      },
    }
  );

  const code = String(
    crypto.randomInt(
      100000,
      1000000
    )
  );
  const reset =
    await PasswordResetCode.create({
      userId: user._id,
      codeHash: hashCode(
        user._id,
        code
      ),
      expiresAt: new Date(
        Date.now() + CODE_TTL_MS
      ),
    });

  try {
    const delivery =
      await sendPasswordResetCode({
        to: normalizedEmail,
        code,
      });

    return {
      requested: true,
      email: normalizedEmail,
      previewCode:
        delivery.preview &&
        process.env.NODE_ENV !==
          "production"
          ? code
          : null,
    };
  } catch (error) {
    await PasswordResetCode.deleteOne({
      _id: reset._id,
    });
    throw error;
  }
}

async function verifyPasswordResetCode({
  email,
  code,
}) {
  const normalizedEmail = String(
    email || ""
  )
    .trim()
    .toLowerCase();
  const user = await User.findOne({
    email: normalizedEmail,
    isActive: true,
  }).lean();

  if (!user) {
    const error = new Error(
      "인증코드가 올바르지 않거나 만료되었습니다."
    );
    error.status = 400;
    throw error;
  }

  const reset =
    await PasswordResetCode.findOne({
      userId: user._id,
      status: "pending",
    })
      .sort({
        createdAt: -1,
      })
      .select("+codeHash");

  if (
    !reset ||
    reset.expiresAt.getTime() <
      Date.now()
  ) {
    const error = new Error(
      "인증코드가 올바르지 않거나 만료되었습니다."
    );
    error.status = 400;
    throw error;
  }

  const matches = safeEqual(
    reset.codeHash,
    hashCode(user._id, code)
  );

  if (!matches) {
    reset.failedAttempts += 1;

    if (
      reset.failedAttempts >=
      MAX_FAILED_ATTEMPTS
    ) {
      reset.status = "locked";
    }

    await reset.save();

    const error = new Error(
      reset.status === "locked"
        ? "인증 시도 횟수를 초과했습니다. 새 코드를 요청해주세요."
        : "인증코드가 올바르지 않거나 만료되었습니다."
    );
    error.status = 400;
    throw error;
  }

  reset.status = "verified";
  reset.verifiedAt = new Date();
  await reset.save();

  return {
    resetId: String(reset._id),
    userId: String(user._id),
    email: normalizedEmail,
    expiresAt: reset.expiresAt,
  };
}

async function resetPassword({
  resetId,
  userId,
  password,
  passwordConfirm,
}) {
  const validatedPassword =
    validatePassword(password);

  if (
    validatedPassword !==
    String(passwordConfirm || "")
  ) {
    const error = new Error(
      "새 비밀번호가 서로 일치하지 않습니다."
    );
    error.status = 400;
    throw error;
  }

  const reset =
    await PasswordResetCode.findOne({
      _id: resetId,
      userId,
      status: "verified",
      expiresAt: {
        $gt: new Date(),
      },
    });

  if (!reset) {
    const error = new Error(
      "비밀번호 재설정 인증이 만료되었습니다."
    );
    error.status = 400;
    throw error;
  }

  const passwordHash =
    await bcrypt.hash(
      validatedPassword,
      BCRYPT_ROUNDS
    );

  await User.updateOne(
    {
      _id: userId,
      isActive: true,
    },
    {
      $set: {
        passwordHash,
      },
      $inc: {
        tokenVersion: 1,
      },
    }
  );

  reset.status = "used";
  reset.usedAt = new Date();
  await reset.save();

  await PasswordResetCode.updateMany(
    {
      userId,
      _id: {
        $ne: reset._id,
      },
      status: {
        $in: [
          "pending",
          "verified",
        ],
      },
    },
    {
      $set: {
        status: "locked",
      },
    }
  );

  return {
    reset: true,
  };
}

module.exports = {
  CODE_TTL_MS,
  requestPasswordReset,
  resetPassword,
  verifyPasswordResetCode,
};
