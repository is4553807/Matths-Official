const crypto = require("crypto");
const mongoose = require("mongoose");
const {
  NicknameChangeRequest,
  User,
} = require("../models/matthsModel");
const {
  deliverModerationNotice,
} = require("./moderationNoticeService");
const nicknameEmailCopy =
  require("../content/email/nickname");

const REQUEST_VALID_MS =
  7 * 24 * 60 * 60 * 1000;

function statusError(
  status,
  message
) {
  const error =
    new Error(message);
  error.status = status;
  return error;
}

function normalizeNickname(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(
      /[\u0000-\u001f\u007f]+/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function nicknameKey(value) {
  return normalizeNickname(value)
    .toLocaleLowerCase(
      "ko-KR"
    );
}

function validateNickname(value) {
  const nickname =
    normalizeNickname(value);

  if (
    nickname.length < 2 ||
    nickname.length > 30
  ) {
    return {
      valid: false,
      nickname,
      message:
        "닉네임은 2자 이상 30자 이하로 입력해주세요.",
    };
  }

  if (
    /[<>]/.test(nickname)
  ) {
    return {
      valid: false,
      nickname,
      message:
        "닉네임에는 꺾쇠 문자를 사용할 수 없습니다.",
    };
  }

  return {
    valid: true,
    nickname,
    message: null,
  };
}

function tokenHash(token) {
  return crypto
    .createHash("sha256")
    .update(
      String(token || "")
    )
    .digest("hex");
}

function safeEqual(
  left,
  right
) {
  const leftBuffer =
    Buffer.from(
      String(left || ""),
      "utf8"
    );
  const rightBuffer =
    Buffer.from(
      String(right || ""),
      "utf8"
    );

  return (
    leftBuffer.length ===
      rightBuffer.length &&
    crypto.timingSafeEqual(
      leftBuffer,
      rightBuffer
    )
  );
}

function proofSecret() {
  return String(
    process.env
      .NICKNAME_CHECK_SECRET ||
      process.env
        .SESSION_SECRET ||
      process.env.SECRET ||
      "matths-local-nickname-check"
  );
}

function createAvailabilityProof({
  requestId,
  userId,
  nickname,
}) {
  return crypto
    .createHmac(
      "sha256",
      proofSecret()
    )
    .update(
      [
        requestId,
        userId,
        nicknameKey(nickname),
      ].join(":")
    )
    .digest("hex");
}

function publicBaseUrl(value) {
  return String(value || "")
    .replace(/\/+$/, "");
}

async function createNicknameChangeRequest({
  adminUserId,
  userId,
  reason,
  baseUrl,
}) {
  const cleanReason =
    String(reason || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);

  if (!cleanReason) {
    throw statusError(
      400,
      "닉네임 변경 요청 사유를 입력해주세요."
    );
  }

  const user =
    await User.findOne({
      _id: userId,
      role: {
        $ne: "admin",
      },
    });

  if (!user) {
    throw statusError(
      404,
      "닉네임 변경을 요청할 사용자를 찾을 수 없습니다."
    );
  }

  await NicknameChangeRequest.updateMany(
    {
      userId: user._id,
      status: "pending",
    },
    {
      $set: {
        status: "cancelled",
      },
    }
  );

  const rawToken =
    crypto
      .randomBytes(32)
      .toString("hex");
  const request =
    await NicknameChangeRequest.create({
      userId: user._id,
      requestedBy:
        adminUserId,
      reason: cleanReason,
      tokenHash:
        tokenHash(rawToken),
      expiresAt:
        new Date(
          Date.now() +
            REQUEST_VALID_MS
        ),
      previousName:
        user.name,
    });
  const relativeUrl =
    `/nickname-change?requestId=${encodeURIComponent(
      request._id
    )}&token=${encodeURIComponent(
      rawToken
    )}`;
  const absoluteUrl =
    `${publicBaseUrl(
      baseUrl
    )}${relativeUrl}`;
  const notice =
    nicknameEmailCopy.changeRequest({
      reason: cleanReason,
      absoluteUrl,
    });

  await deliverModerationNotice({
    user,
    title: notice.title,
    message: notice.message,
    href: relativeUrl,
    kind: "nickname",
    createdBy:
      adminUserId,
    emailSubject:
      notice.subject,
    emailMessage:
      notice.message,
  });

  return {
    requestId:
      String(request._id),
  };
}

async function findValidRequest({
  userId,
  requestId,
  token,
}) {
  if (
    !mongoose.isValidObjectId(
      requestId
    )
  ) {
    throw statusError(
      404,
      "유효한 닉네임 변경 요청을 찾을 수 없습니다."
    );
  }

  const request =
    await NicknameChangeRequest.findOne({
      _id: requestId,
      userId,
      status: "pending",
    })
      .select("+tokenHash")
      .lean();

  if (!request) {
    throw statusError(
      404,
      "유효한 닉네임 변경 요청을 찾을 수 없습니다."
    );
  }

  if (
    new Date(
      request.expiresAt
    ).getTime() <= Date.now()
  ) {
    await NicknameChangeRequest.updateOne(
      { _id: request._id },
      {
        $set: {
          status: "expired",
        },
      }
    );
    throw statusError(
      410,
      "닉네임 변경 링크의 유효기간이 지났습니다. 운영자에게 새 링크를 요청해주세요."
    );
  }

  if (
    !safeEqual(
      request.tokenHash,
      tokenHash(token)
    )
  ) {
    throw statusError(
      403,
      "닉네임 변경 링크가 올바르지 않습니다."
    );
  }

  return request;
}

async function findNicknameConflict({
  nickname,
  excludeUserId,
}) {
  const key =
    nicknameKey(nickname);
  const escaped =
    nickname.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  return User.exists({
    _id: {
      $ne: excludeUserId,
    },
    $or: [
      {
        nameNormalized:
          key,
      },
      {
        name: {
          $regex:
            `^${escaped}$`,
          $options: "i",
        },
      },
    ],
  });
}

async function getNicknameChangePageData({
  userId,
  requestId,
  token,
}) {
  const [request, user] =
    await Promise.all([
      findValidRequest({
        userId,
        requestId,
        token,
      }),
      User.findById(
        userId
      ).lean(),
    ]);

  if (!user) {
    throw statusError(
      404,
      "사용자 정보를 찾을 수 없습니다."
    );
  }

  return {
    request: {
      id:
        String(request._id),
      reason:
        request.reason,
      expiresAt:
        request.expiresAt,
    },
    currentName:
      user.name,
  };
}

async function checkNicknameAvailability({
  userId,
  requestId,
  token,
  nickname,
}) {
  await findValidRequest({
    userId,
    requestId,
    token,
  });

  const validation =
    validateNickname(
      nickname
    );

  if (!validation.valid) {
    throw statusError(
      400,
      validation.message
    );
  }

  const conflict =
    await findNicknameConflict({
      nickname:
        validation.nickname,
      excludeUserId:
        userId,
    });

  if (conflict) {
    return {
      available: false,
      nickname:
        validation.nickname,
      message:
        "이미 사용 중인 닉네임입니다.",
      proof: "",
    };
  }

  return {
    available: true,
    nickname:
      validation.nickname,
    message:
      "사용할 수 있는 닉네임입니다.",
    proof:
      createAvailabilityProof({
        requestId,
        userId,
        nickname:
          validation.nickname,
      }),
  };
}

async function completeNicknameChange({
  userId,
  requestId,
  token,
  nickname,
  proof,
}) {
  const request =
    await findValidRequest({
      userId,
      requestId,
      token,
    });
  const validation =
    validateNickname(
      nickname
    );

  if (!validation.valid) {
    throw statusError(
      400,
      validation.message
    );
  }

  const expectedProof =
    createAvailabilityProof({
      requestId,
      userId,
      nickname:
        validation.nickname,
    });

  if (
    !safeEqual(
      proof,
      expectedProof
    )
  ) {
    throw statusError(
      400,
      "닉네임 중복 확인을 다시 완료해주세요."
    );
  }

  const conflict =
    await findNicknameConflict({
      nickname:
        validation.nickname,
      excludeUserId:
        userId,
    });

  if (conflict) {
    throw statusError(
      409,
      "방금 다른 사용자가 이 닉네임을 사용하기 시작했습니다. 다른 닉네임을 확인해주세요."
    );
  }

  try {
    const user =
      await User.findOneAndUpdate(
        {
          _id: userId,
        },
        {
          $set: {
            name:
              validation.nickname,
            nameNormalized:
              nicknameKey(
                validation.nickname
              ),
          },
        },
        {
          returnDocument:
            "after",
          runValidators: true,
        }
      );

    if (!user) {
      throw statusError(
        404,
        "사용자 정보를 찾을 수 없습니다."
      );
    }

    await NicknameChangeRequest.updateOne(
      {
        _id: request._id,
        status: "pending",
      },
      {
        $set: {
          status: "completed",
          completedAt:
            new Date(),
          nextName:
            validation.nickname,
        },
      }
    );

    return user;
  } catch (error) {
    if (
      error?.code === 11000
    ) {
      throw statusError(
        409,
        "이미 사용 중인 닉네임입니다. 다른 닉네임을 확인해주세요."
      );
    }

    throw error;
  }
}

module.exports = {
  REQUEST_VALID_MS,
  checkNicknameAvailability,
  completeNicknameChange,
  createNicknameChangeRequest,
  getNicknameChangePageData,
  nicknameKey,
  normalizeNickname,
  validateNickname,
};
