const crypto = require("crypto");
const {
  User,
} = require("../models/matthsModel");
const {
  createAdminTodo,
} = require("./adminTodoService");
const {
  normalizeRealName,
} = require("./userIdentityService");

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeBirthDate(value) {
  const dateKey = String(value || "").trim();
  const match = dateKey.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) {
    throw statusError(
      400,
      "생년월일을 정확히 입력해주세요."
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birthDate = new Date(
    Date.UTC(year, month - 1, day)
  );
  const today = new Date();

  if (
    birthDate.getUTCFullYear() !== year ||
    birthDate.getUTCMonth() !== month - 1 ||
    birthDate.getUTCDate() !== day ||
    year < 1900 ||
    birthDate.getTime() > today.getTime()
  ) {
    throw statusError(
      400,
      "생년월일을 정확히 입력해주세요."
    );
  }

  return {
    birthDate,
    dateKey,
  };
}

function identitySecret() {
  const secret = String(
    process.env.IDENTITY_MATCH_SECRET ||
      process.env.SECRET ||
      ""
  );

  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error(
      "IDENTITY_MATCH_SECRET 또는 SECRET 환경변수가 필요합니다."
    );
  }

  return secret || "matths-local-identity-match-key";
}

function buildIdentityMatchHash({
  realName,
  birthDate,
  schoolCode,
}) {
  const normalizedName = normalizeRealName(
    realName
  )
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLocaleLowerCase("ko-KR");
  const { dateKey } = normalizeBirthDate(
    birthDate instanceof Date
      ? birthDate.toISOString().slice(0, 10)
      : birthDate
  );
  const normalizedSchoolCode = String(
    schoolCode || ""
  )
    .normalize("NFKC")
    .trim()
    .toUpperCase();

  if (!normalizedSchoolCode) {
    throw statusError(
      400,
      "동일인 탐지 해시에는 고등학교 정보가 필요합니다."
    );
  }

  return crypto
    .createHmac("sha256", identitySecret())
    .update(
      [
        "name-birthdate-school-v1",
        normalizedName,
        dateKey,
        normalizedSchoolCode,
      ].join(":")
    )
    .digest("hex");
}

async function alertPotentialDuplicateIdentity(
  user
) {
  const schoolCode = String(
    user?.school?.code || ""
  ).trim();
  const identityMatchVersion = String(
    user?.identityMatchVersion || ""
  ).trim();

  if (
    !user?.identityMatchHash ||
    !user?._id ||
    !schoolCode ||
    identityMatchVersion !==
      "name-birthdate-school-v1"
  ) {
    return {
      duplicate: false,
      matches: [],
    };
  }

  const matches = await User.find({
    _id: { $ne: user._id },
    identityMatchHash:
      user.identityMatchHash,
    identityMatchVersion,
    "school.code": schoolCode,
    accountStatus: {
      $ne: "withdrawn",
    },
  })
    .select("_id name email accountStatus")
    .lean();

  if (!matches.length) {
    return {
      duplicate: false,
      matches: [],
    };
  }

  await Promise.all([
    User.updateMany(
      {
        _id: {
          $in: [
            user._id,
            ...matches.map(
              (match) => match._id
            ),
          ],
        },
      },
      {
        $set: {
          identityVerificationStatus:
            "review-required",
          identityDuplicateAlertedAt:
            new Date(),
        },
      }
    ),
    createAdminTodo({
      category: "other",
      title:
        "동일 실명·생년월일·고등학교 계정 검토 필요",
      description:
        "실명·생년월일·고등학교가 모두 일치하는 활성 계정 묶음이 발견되었습니다. 비교 계정 전체를 검토 대상으로 표시했으며, 페이백 또는 계좌 연결 전에 동일인 여부를 확인해주세요.",
      href: `/admin/users/${user._id}`,
      targetUserId: user._id,
      actorUserId: user._id,
      sourceType:
        "UserIdentityDuplicate",
      sourceId: user._id,
      metadata: {
        matchedUserIds:
          matches.map((match) =>
            String(match._id)
          ),
        matchedAccountCount:
          matches.length,
        matchedSchoolCode:
          schoolCode,
        identityMatchVersion:
          identityMatchVersion,
      },
    }),
  ]);

  return {
    duplicate: true,
    matches,
  };
}

module.exports = {
  alertPotentialDuplicateIdentity,
  buildIdentityMatchHash,
  normalizeBirthDate,
};
