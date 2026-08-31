const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const {
  User,
} = require("../models/matthsModel");
const {
  OVERSEAS_HIGH_SCHOOL_OPTION_CODE,
  buildOverseasSchool,
  findSchool,
  getSchoolSelectData,
} = require("../services/schoolService");
const {
  OVERSEAS_UNIVERSITY_OPTION_CODE,
  buildOverseasUniversity,
  findUniversity,
  getUniversitySelectData,
} = require("../services/universityService");
const {
  loadCurriculum,
} = require("../services/curriculumService");
const {
  getUserLearningData,
  updateTopicCompletion,
} = require("../services/learningProgressService");
const {
  createAccessToken,
  verifyAccessToken,
  ACCESS_TOKEN_TTL_SECONDS,
} = require("../services/mobileAuthService");
const {
  getAcademicYear,
  getGradeLabel,
  synchronizeUserLifecycle,
} = require("../services/userLifecycleService");
const {
  createQuickPracticeAttempt,
  expireQuickPracticeAttempt,
  getQuickPracticeStats,
  submitQuickPracticeAttempt,
} = require("../services/quickPracticeService");
const {
  createSuggestion,
  getSuggestionBoardData,
  moderateSuggestion,
} = require("../services/coachSuggestionService");
const {
  requestPasswordReset,
  resetPassword,
  verifyPasswordResetCode,
} = require("../services/passwordResetService");
const {
  normalizeRankingDisplayMode,
  validateRealName,
} = require("../services/userIdentityService");
const {
  accountBlockedMessage,
  synchronizeAccountAccess,
} = require("../services/accountAccessService");
const {
  normalizeRetentionChoice,
  withdrawOwnAccount,
} = require("../services/accountDeletionService");
const {
  nicknameKey,
} = require("../services/nicknameService");
const {
  alertPotentialDuplicateIdentity,
  buildIdentityMatchHash,
  normalizeBirthDate,
} = require("../services/identityRiskService");
const {
  consumeMobileAuthGrant,
  resolveMobileAuthGrantResult,
} = require(
  "../services/mobileSocialAuthGrantService"
);
const {
  publicProviderStatus,
} = require(
  "../services/socialAuthService"
);
const AppleAuthCredential = require("../models/appleAuthCredentialModel");
const {
  verifyAppleIdentityToken,
} = require("../services/appleAuthService");
const {
  REAUTHENTICATION_TTL_MS,
  assertCodeChallenge,
  consumeSocialProof,
  issueStartTicket,
} = require("../services/accountReauthenticationService");
const {
  ArenaAccessState,
} = require("../models/goatArenaModel");
const {
  resolveArenaProfileAvatar,
  updateArenaProfileAvatar,
  updateCustomProfileAvatar,
} = require("../services/arenaProfileAvatarService");
const {
  getArenaActivityLevel,
} = require("../services/arenaActivityLevelService");
const {
  dashboardTutorialView,
  updateDashboardTutorial,
} = require("../services/dashboardTutorialService");
const {
  arenaTutorialView,
  updateArenaTutorial,
} = require("../services/arenaTutorialService");
const {
  updateCoachMode,
} = require("../services/dashboardService");

const BCRYPT_ROUNDS = 12;

exports.socialAuthProviders = (
  _req,
  res
) =>
  res.json({
    providers:
      publicProviderStatus(),
  });

function serializeUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    realName: user.realName || "",
    email: user.email,
    role: user.role || "student",
    schoolGrade: user.schoolGrade,
    educationStatus:
      user.educationStatus ||
      ([13, 15].includes(Number(user.schoolGrade))
        ? "graduated"
        : "enrolled"),
    schoolGradeLabel: getGradeLabel(
      user.schoolGrade
    ),
    school: user.school?.code
      ? {
          region: user.school.region,
          code: user.school.code,
          name: user.school.name,
          isOverseas: user.school.isOverseas === true,
        }
      : null,
    university: user.university?.code
      ? {
          code: user.university.code,
          name: user.university.name,
          campus: user.university.campus,
          region: user.university.region,
          isOverseas: user.university.isOverseas === true,
        }
      : null,
    currentStreak:
      Number(user.currentStreak) || 0,
    longestStreak:
      Number(user.longestStreak) || 0,
    rankingDisplayMode: "nickname",
  };
}

async function serializeIpadUser(user) {
  const [activityLevel, accessState] = await Promise.all([
    getArenaActivityLevel(user._id),
    ArenaAccessState.findOne({ userId: user._id })
      .select("currentCompetitiveDivision")
      .lean(),
  ]);
  const activeDivision = ["SUB", "MAIN"].includes(
    String(accessState?.currentCompetitiveDivision || "").toUpperCase()
  )
    ? String(accessState.currentCompetitiveDivision).toUpperCase()
    : null;

  return {
    ...serializeUser(user),
    coachMode: user.preferences?.coachMode || "spicy",
    reducedMotion: user.preferences?.reducedMotion === true,
    profileAvatar: resolveArenaProfileAvatar(user.preferences),
    arenaActivityLevel: activityLevel,
    dashboardTutorial: dashboardTutorialView(user.preferences),
    arenaTutorial: arenaTutorialView(user.preferences, {
      activeDivision,
      isAdminPreview: user.role === "admin",
    }),
  };
}

function authResponse(
  user,
  { issuedAtSeconds } = {}
) {
  return {
    tokenType: "Bearer",
    accessToken:
      createAccessToken(user, {
        issuedAtSeconds,
      }),
    expiresIn:
      ACCESS_TOKEN_TTL_SECONDS,
    user: serializeUser(user),
  };
}

exports.liveness = (_req, res) =>
  res.json({
    service: "Matths API",
    version: "v1",
    status: "ok",
  });

exports.readiness = async (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  if (!connected) {
    return res.status(503).json({
      service: "Matths API",
      version: "v1",
      status: "not_ready",
    });
  }

  try {
    await mongoose.connection.db.admin().ping();
    return res.json({
      service: "Matths API",
      version: "v1",
      status: "ready",
    });
  } catch (_error) {
    return res.status(503).json({
      service: "Matths API",
      version: "v1",
      status: "not_ready",
    });
  }
};

exports.health = exports.readiness;

exports.schools = (req, res) =>
  res.json({
    regions: getSchoolSelectData(),
  });

exports.universities = (_req, res) =>
  res.json({ universities: getUniversitySelectData() });

exports.register = async (
  req,
  res,
  next
) => {
  try {
    const realNameValidation =
      validateRealName(
        req.body.realName
      );
    const realName =
      realNameValidation.realName;
    const name = String(
      req.body.name || ""
    ).trim();
    const email = String(
      req.body.email || ""
    )
      .trim()
      .toLowerCase();
    const password = String(
      req.body.password || ""
    );
    const birthDateInput = String(
      req.body.birthDate || ""
    ).trim();
    const schoolGrade = Number(
      req.body.schoolGrade
    );
    const schoolRegion = String(
      req.body.schoolRegion || ""
    ).trim();
    const schoolCode = String(
      req.body.schoolCode || ""
    ).trim();
    const overseasSchoolName = String(
      req.body.overseasSchoolName || ""
    );
    const universityCode = String(
      req.body.universityCode || ""
    ).trim();
    const overseasUniversityName = String(
      req.body.overseasUniversityName || ""
    );
    const termsAccepted =
      req.body.termsAccepted === true;

    if (
      !realName ||
      !name ||
      !email ||
      !password ||
      !birthDateInput ||
      ([10, 11, 12].includes(schoolGrade) &&
        (!schoolRegion || !schoolCode))
      || (schoolGrade === 14 && !universityCode)
    ) {
      return res.status(400).json({
        code: "INVALID_INPUT",
        message:
          "필수 가입 정보를 모두 입력해주세요.",
      });
    }

    if (!realNameValidation.valid) {
      return res.status(400).json({
        code: "INVALID_REAL_NAME",
        message:
          realNameValidation.message,
      });
    }

    if (
      name.length < 2 ||
      name.length > 30
    ) {
      return res.status(400).json({
        code: "INVALID_NICKNAME",
        message:
          "닉네임은 2자 이상 30자 이하로 입력해주세요.",
      });
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
      )
    ) {
      return res.status(400).json({
        code: "INVALID_EMAIL",
        message:
          "올바른 이메일 주소를 입력해주세요.",
      });
    }

    if (
      password.length < 8 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      return res.status(400).json({
        code: "WEAK_PASSWORD",
        message:
          "비밀번호는 영문과 숫자를 포함해 8자 이상이어야 합니다.",
      });
    }

    if (
      ![10, 11, 12, 13, 14, 15].includes(
        schoolGrade
      )
    ) {
      return res.status(400).json({
        code: "INVALID_GRADE",
        message:
          "현재 학습자 구분을 선택해주세요.",
      });
    }

    if (!termsAccepted) {
      return res.status(400).json({
        code: "TERMS_REQUIRED",
        message:
          "이용약관과 개인정보처리방침에 동의해주세요.",
      });
    }

    let birthDate;
    try {
      birthDate = normalizeBirthDate(
        birthDateInput
      ).birthDate;
    } catch (error) {
      return res.status(400).json({
        code: "INVALID_BIRTH_DATE",
        message: error.message,
      });
    }

    const school =
      [10, 11, 12].includes(schoolGrade)
        ? schoolCode === OVERSEAS_HIGH_SCHOOL_OPTION_CODE
          ? buildOverseasSchool(overseasSchoolName).school
          : findSchool(
              schoolRegion,
              schoolCode
            )
        : null;
    const university =
      schoolGrade === 14
        ? universityCode === OVERSEAS_UNIVERSITY_OPTION_CODE
          ? buildOverseasUniversity(overseasUniversityName).university
          : findUniversity(universityCode)
        : null;

    if (
      [10, 11, 12].includes(schoolGrade) &&
      schoolCode === OVERSEAS_HIGH_SCHOOL_OPTION_CODE &&
      !school
    ) {
      return res.status(400).json({
        code: "INVALID_OVERSEAS_SCHOOL_NAME",
        message: buildOverseasSchool(overseasSchoolName).error,
      });
    }
    if (
      schoolGrade === 14 &&
      universityCode === OVERSEAS_UNIVERSITY_OPTION_CODE &&
      !university
    ) {
      return res.status(400).json({
        code: "INVALID_OVERSEAS_UNIVERSITY_NAME",
        message: buildOverseasUniversity(overseasUniversityName).error,
      });
    }

    if ([10, 11, 12].includes(schoolGrade) && !school) {
      return res.status(400).json({
        code: "INVALID_SCHOOL",
        message:
          "목록에서 고등학교를 선택해주세요.",
      });
    }
    if (schoolGrade === 14 && !university) {
      return res.status(400).json({
        code: "INVALID_UNIVERSITY",
        message: "목록에서 대학교를 선택해주세요.",
      });
    }

    const [
      existing,
      existingNickname,
    ] = await Promise.all([
      User.exists({
        email,
      }),
      User.exists({
        $or: [
          {
            nameNormalized:
              nicknameKey(name),
          },
          {
            name: {
              $regex:
                `^${name.replace(
                  /[.*+?^${}()|[\]\\]/g,
                  "\\$&"
                )}$`,
              $options: "i",
            },
          },
        ],
      }),
    ]);

    if (existing) {
      return res.status(409).json({
        code: "EMAIL_EXISTS",
        message:
          "이미 가입된 이메일입니다.",
      });
    }

    if (existingNickname) {
      return res.status(409).json({
        code:
          "NICKNAME_EXISTS",
        message:
          "이미 사용 중인 닉네임입니다.",
      });
    }

    const now = new Date();
    const user = await User.create({
      realName,
      name,
      nameNormalized:
        nicknameKey(name),
      email,
      passwordHash:
        await bcrypt.hash(
          password,
          BCRYPT_ROUNDS
        ),
      birthDate,
      ...(school
        ? {
            identityMatchHash:
              buildIdentityMatchHash({
                realName,
                birthDate,
                schoolCode:
                  school.code,
              }),
            identityMatchVersion:
              "name-birthdate-school-v1",
          }
        : {}),
      schoolGrade,
      learnerType:
        schoolGrade === 13
          ? "RETAKER"
          : schoolGrade === 14
            ? "UNIVERSITY"
            : schoolGrade === 15
              ? "WORKER"
              : "HIGH_SCHOOL",
      educationStatus:
        [13, 15].includes(schoolGrade)
          ? "graduated"
          : "enrolled",
      lastGradePromotionYear:
        getAcademicYear(now),
      ...(school
        ? {
            school: {
              region: school.region,
              code: school.code,
              name: school.name,
              roadAddress:
                school.roadAddress || "",
              establishment:
                school.establishment || "",
              highSchoolType:
                school.highSchoolType || "",
              isOverseas:
                school.isOverseas === true,
            },
          }
        : {}),
      ...(university
        ? { university }
        : {}),
      termsAcceptedAt: now,
      termsVersion: "2026-08-13",
      privacyVersion: "2026-08-13",
    });

    await alertPotentialDuplicateIdentity(
      user
    ).catch((error) => {
      console.error(
        "동일인 중복 계정 관리자 알림 생성 실패:",
        error
      );
    });

    return res
      .status(201)
      .json(authResponse(user));
  } catch (error) {
    if (
      error.code === 11000
    ) {
      return res.status(409).json({
        code:
          error.keyPattern
            ?.nameNormalized
            ? "NICKNAME_EXISTS"
            : "EMAIL_EXISTS",
        message:
          error.keyPattern
            ?.nameNormalized
            ? "이미 사용 중인 닉네임입니다."
            : "이미 가입된 이메일입니다.",
      });
    }

    return next(error);
  }
};

exports.login = async (
  req,
  res,
  next
) => {
  try {
    const identifier = String(
      req.body.identifier ||
        req.body.email ||
        ""
    ).trim();
    const email = identifier.toLowerCase();
    const password = String(
      req.body.password || ""
    );
    const user = await User.findOne({ email }).select(
      "+passwordHash"
    );

    if (
      !user ||
      !(await bcrypt.compare(
        password,
        user.passwordHash
      ))
    ) {
      return res.status(401).json({
        code: "INVALID_CREDENTIALS",
        message:
          "이메일 또는 비밀번호가 올바르지 않습니다.",
      });
    }

    const access =
      await synchronizeAccountAccess(
        user._id
      );

    if (
      !access ||
      !access.allowed
    ) {
      return res.status(403).json({
        code:
          "ACCOUNT_BLOCKED",
        message:
          accountBlockedMessage(
            access?.status,
            access?.user
              ?.accountStatusReason
          ),
      });
    }

    const synchronized =
      await synchronizeUserLifecycle(
        access.user._id
      );
    const loginAt = new Date();
    synchronized.lastLoginAt =
      loginAt;
    await synchronized.save();

    return res.json(
      authResponse(synchronized)
    );
  } catch (error) {
    return next(error);
  }
};

/*
 * 앱이 소셜 왕복을 끝내고 받은 1회용 코드를 토큰으로 바꾼다.
 *
 * **provider 를 받지 않는다.** 그랜트가 발급될 때 이미 어느 사용자인지 확정돼
 * 있고, 여기서는 code + codeVerifier(PKCE) 만 검증하면 된다. 구글·카카오가
 * 같은 처리기를 쓰는 이유이고, 그래서 문구도 provider 이름을 넣지 않는다.
 *
 * 이름은 exchangeGoogleAuthCode 였다. 카카오가 붙으면서 거짓말이 되어 고쳤다.
 */
exports.exchangeSocialAuthCode = async (
  req,
  res,
  next
) => {
  try {
    const consumption =
      await consumeMobileAuthGrant(
        req.body?.code,
        {
          codeVerifier:
            req.body?.codeVerifier,
        }
      );

    if (!consumption) {
      return res.status(401).json({
        code:
          "SOCIAL_AUTH_GRANT_INVALID",
        message:
          "로그인 확인 코드가 만료되었거나 이미 사용되었습니다. 다시 시도해주세요.",
      });
    }

    const access =
      await synchronizeAccountAccess(
        consumption.grant.userId
      );
    if (!access?.allowed) {
      return res.status(403).json({
        code: "ACCOUNT_BLOCKED",
        message:
          accountBlockedMessage(
            access?.status,
            access?.user
              ?.accountStatusReason
          ),
      });
    }

    const user =
      await synchronizeUserLifecycle(
        access.user._id
      );
    if (!consumption.replayed) {
      user.lastLoginAt = new Date();
      await user.save();
    }

    const candidateResponse =
      authResponse(user, {
        issuedAtSeconds:
          consumption
            .accessTokenIssuedAtSeconds,
      });
    const stableResponse =
      await resolveMobileAuthGrantResult(
        consumption.grant._id,
        candidateResponse
      );

    if (!stableResponse) {
      return res.status(401).json({
        code:
          "SOCIAL_AUTH_GRANT_INVALID",
        message:
          "소셜 로그인 확인 코드가 만료되었습니다. 다시 로그인해주세요.",
      });
    }

    const stableTokenPayload =
      verifyAccessToken(
        stableResponse.accessToken
      );
    if (
      !stableTokenPayload ||
      String(
        stableTokenPayload.sub || ""
      ) !== String(user._id) ||
      Number(
        stableTokenPayload.ver || 0
      ) !==
        Number(
          user.tokenVersion || 0
        )
    ) {
      return res.status(401).json({
        code: "TOKEN_REVOKED",
        message:
          "로그인이 만료되었습니다. 다시 로그인해주세요.",
      });
    }

    return res.json(stableResponse);
  } catch (error) {
    return next(error);
  }
};

exports.me = async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    return res.json({
      user: await serializeIpadUser(req.apiUser),
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateProfileAvatarPreset = async (req, res, next) => {
  try {
    const profileAvatar = await updateArenaProfileAvatar({
      userId: req.apiUser._id,
      avatarCode: req.body?.avatarCode,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json({ profileAvatar });
  } catch (error) {
    return next(error);
  }
};

exports.updateProfileAvatarCustom = async (req, res, next) => {
  try {
    if (req.profileAvatarUploadError) throw req.profileAvatarUploadError;
    if (!req.file) {
      const error = new Error("프로필 사진을 선택해 주세요.");
      error.status = 400;
      error.code = "PROFILE_AVATAR_FILE_REQUIRED";
      throw error;
    }
    const profileAvatar = await updateCustomProfileAvatar({
      userId: req.apiUser._id,
      file: req.file,
    });
    req.file = undefined;
    res.set("Cache-Control", "private, no-store");
    return res.json({ profileAvatar });
  } catch (error) {
    if (req.file?.path) {
      await require("node:fs").promises.unlink(req.file.path).catch(() => {});
      req.file = undefined;
    }
    return next(error);
  }
};

exports.updateCoachMode = async (req, res, next) => {
  try {
    const coach = await updateCoachMode(
      req.apiUser._id,
      req.body?.mode,
      req.body?.situation || "unanswered"
    );
    if (!coach) {
      const error = new Error("올바른 코치 모드를 선택해주세요.");
      error.status = 400;
      throw error;
    }
    return res.json({ coach });
  } catch (error) {
    return next(error);
  }
};

exports.updateDashboardTutorial = async (req, res, next) => {
  try {
    const tutorial = await updateDashboardTutorial({
      userId: req.apiUser._id,
      action: req.body?.action,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json({ tutorial });
  } catch (error) {
    return next(error);
  }
};

exports.updateArenaTutorial = async (req, res, next) => {
  try {
    const accessState = await ArenaAccessState.findOne({
      userId: req.apiUser._id,
    })
      .select("currentCompetitiveDivision")
      .lean();
    const tutorial = await updateArenaTutorial({
      userId: req.apiUser._id,
      chapter: req.body?.chapter,
      action: req.body?.action,
      activeDivision: accessState?.currentCompetitiveDivision || null,
      isAdminPreview: req.apiUser.role === "admin",
    });
    res.set("Cache-Control", "private, no-store");
    return res.json({ tutorial });
  } catch (error) {
    return next(error);
  }
};

// 웹 프로필과 iPad가 같은 학교 정본을 사용하도록 서버 카탈로그에서
// 선택값을 다시 검증한 뒤 인증된 사용자 문서만 갱신한다.
exports.updateSchool = async (
  req,
  res,
  next
) => {
  try {
    const schoolRegion = String(
      req.body?.schoolRegion || ""
    ).trim();
    const schoolCode = String(
      req.body?.schoolCode || ""
    ).trim();
    const selectedSchool =
      schoolRegion && schoolCode
        ? findSchool(
            schoolRegion,
            schoolCode
          )
        : null;

    if (!selectedSchool) {
      return res.status(400).json({
        code: "INVALID_SCHOOL",
        message:
          "학교 목록에서 올바른 고등학교를 선택해주세요.",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.apiUser._id,
      {
        school: {
          region: selectedSchool.region,
          code: selectedSchool.code,
          name: selectedSchool.name,
          roadAddress:
            selectedSchool.roadAddress || "",
          establishment:
            selectedSchool.establishment || "",
          highSchoolType:
            selectedSchool.highSchoolType || "",
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!user) {
      return res.status(404).json({
        code: "USER_NOT_FOUND",
        message:
          "사용자 정보를 찾을 수 없습니다.",
      });
    }

    return res.json({
      user: serializeUser(user),
    });
  } catch (error) {
    return next(error);
  }
};

// 공개 랭킹 이름 정책은 웹과 앱에서 동일하다. 현재 허용되는 공개 모드는
// nickname 하나뿐이며 realName은 이 API로 바꾸거나 공개하지 않는다.
exports.updateRankingIdentity = async (
  req,
  res,
  next
) => {
  try {
    const rankingDisplayMode =
      normalizeRankingDisplayMode(
        req.body?.rankingDisplayMode
      );

    if (!rankingDisplayMode) {
      return res.status(400).json({
        code:
          "INVALID_RANKING_DISPLAY_MODE",
        message:
          "공개 랭킹에는 닉네임만 사용할 수 있습니다.",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.apiUser._id,
      {
        "preferences.rankingDisplayMode":
          rankingDisplayMode,
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!user) {
      return res.status(404).json({
        code: "USER_NOT_FOUND",
        message:
          "사용자 정보를 찾을 수 없습니다.",
      });
    }

    return res.json({
      user: serializeUser(user),
    });
  } catch (error) {
    return next(error);
  }
};

exports.withdrawMe = async (
  req,
  res,
  next
) => {
  try {
    // 1회용 소셜 proof를 잘못된 확인 문구 때문에 먼저 소모하지 않는다.
    if (String(req.body?.confirmation || "").trim() !== "탈퇴") {
      return res.status(400).json({
        code: "ACCOUNT_WITHDRAWAL_CONFIRMATION_REQUIRED",
        message: "확인란에 ‘탈퇴’를 정확히 입력해주세요.",
      });
    }
    if (!normalizeRetentionChoice(req.body?.acknowledgeAnonymousRetention)) {
      return res.status(400).json({
        code: "ACCOUNT_WITHDRAWAL_RETENTION_ACK_REQUIRED",
        message: "익명 학습 데이터 보존 안내를 확인해주세요.",
      });
    }

    let reauthenticated = false;

    if (req.body?.reauthenticationProof || req.body?.codeVerifier) {
      const reauthenticationProvider = String(
        req.body?.reauthenticationProvider || "google"
      ).toLowerCase();
      reauthenticated = await consumeSocialProof({
        proof: req.body?.reauthenticationProof,
        codeVerifier: req.body?.codeVerifier,
        userId: req.apiUser._id,
        provider: reauthenticationProvider,
      });
      if (!reauthenticated) {
        return res.status(401).json({
          code: "ACCOUNT_REAUTHENTICATION_INVALID",
          message: "소셜 계정 본인 확인이 만료되었거나 올바르지 않습니다. 다시 확인해주세요.",
        });
      }
    } else if (req.body?.appleIdentityToken || req.body?.appleNonce) {
      const claims = await verifyAppleIdentityToken({
        identityToken: req.body?.appleIdentityToken,
        nonce: req.body?.appleNonce,
      });
      const credential = await AppleAuthCredential.findOne({
        appleSubject: claims.subject,
        userId: req.apiUser._id,
      }).select("+appleSubject");
      if (!credential) {
        return res.status(403).json({
          code: "ACCOUNT_REAUTHENTICATION_ACCOUNT_MISMATCH",
          message: "현재 Matths 계정에 연결된 Apple 계정으로 확인해주세요.",
        });
      }
      reauthenticated = true;
    }

    await withdrawOwnAccount({
      userId: req.apiUser._id,
      password:
        req.body.password,
      reauthenticated,
      confirmation:
        req.body.confirmation,
      acknowledgeAnonymousRetention:
        req.body
          .acknowledgeAnonymousRetention,
    });

    return res.json({
      withdrawn: true,
      dataRetention: "anonymous",
      message:
        "개인정보는 제거되었고 학습 데이터는 익명으로 보존됩니다.",
    });
  } catch (error) {
    return next(error);
  }
};

exports.withdrawalOptions = async (req, res, next) => {
  try {
    const [user, appleCredential] = await Promise.all([
      User.findById(req.apiUser._id).select(
        "+socialAuth.googleId +socialAuth.kakaoId"
      ),
      AppleAuthCredential.exists({ userId: req.apiUser._id }),
    ]);
    if (!user) {
      return res.status(404).json({
        code: "USER_NOT_FOUND",
        message: "사용자 정보를 찾을 수 없습니다.",
      });
    }
    const providers = publicProviderStatus();
    const googleConfigured = providers.some(
      (provider) => provider.key === "google" && provider.configured === true
    );
    const appleConfigured = providers.some(
      (provider) => provider.key === "apple" && provider.configured === true
    );
    res.set("Cache-Control", "private, no-store");
    return res.json({
      passwordAccepted: true,
      googleReauthentication: {
        linked: Boolean(user.socialAuth?.googleId),
        available: Boolean(user.socialAuth?.googleId) && googleConfigured,
      },
      kakaoReauthentication: {
        linked: Boolean(user.socialAuth?.kakaoId),
        available:
          Boolean(user.socialAuth?.kakaoId) &&
          providers.some(
            (provider) => provider.key === "kakao" && provider.configured === true
          ),
      },
      appleReauthentication: {
        linked: Boolean(appleCredential),
        available: Boolean(appleCredential) && appleConfigured,
      },
    });
  } catch (error) {
    return next(error);
  }
};

async function startSocialWithdrawalReauthentication(req, res, next, provider) {
  try {
    const codeChallenge = assertCodeChallenge(req.body?.codeChallenge);
    const user = await User.findById(req.apiUser._id).select(
      `+socialAuth.${provider}Id`
    );
    if (!user?.socialAuth?.[`${provider}Id`]) {
      return res.status(409).json({
        code: "ACCOUNT_REAUTHENTICATION_NOT_LINKED",
        message: `현재 계정에 연결된 ${provider === "kakao" ? "카카오" : "Google"} 계정이 없습니다.`,
      });
    }
    const configured = publicProviderStatus().some(
      (entry) => entry.key === provider && entry.configured === true
    );
    if (!configured) {
      return res.status(503).json({
        code: "SOCIAL_AUTH_NOT_CONFIGURED",
        message: `${provider === "kakao" ? "카카오" : "Google"} 본인 확인이 아직 설정되지 않았습니다.`,
      });
    }
    const ticket = issueStartTicket({
      userId: user._id,
      codeChallenge,
      provider,
    });
    const authorizationUrl = new URL(
      `/auth/${provider}/reauth`,
      `${req.protocol}://${req.get("host")}`
    );
    authorizationUrl.searchParams.set("ticket", ticket);
    res.set("Cache-Control", "private, no-store");
    return res.json({
      authorizationUrl: authorizationUrl.toString(),
      expiresAt: new Date(Date.now() + REAUTHENTICATION_TTL_MS).toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

exports.startGoogleWithdrawalReauthentication = (req, res, next) =>
  startSocialWithdrawalReauthentication(req, res, next, "google");

exports.startKakaoWithdrawalReauthentication = (req, res, next) =>
  startSocialWithdrawalReauthentication(req, res, next, "kakao");

exports.curriculum = (
  req,
  res
) =>
  res.json({
    curriculum: loadCurriculum(),
  });

exports.learning = async (
  req,
  res,
  next
) => {
  try {
    const data =
      await getUserLearningData(
        req.apiUser._id
      );

    return res.json({
      learning:
        data.learningData,
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateTopic = async (
  req,
  res,
  next
) => {
  try {
    const progress =
      await updateTopicCompletion({
        userId: req.apiUser._id,
        courseId:
          req.params.courseId,
        unitId: req.params.unitId,
        conceptId:
          req.params.conceptId,
        topicIndex:
          req.params.topicIndex,
        completed:
          req.body.completed,
        sessionId: `ipad-${req.apiUser._id}`,
      });

    return res.json({
      progress,
    });
  } catch (error) {
    return next(error);
  }
};

exports.quickPracticeStats =
  async (req, res, next) => {
    try {
      return res.json({
        stats:
          await getQuickPracticeStats(
            req.apiUser._id
          ),
      });
    } catch (error) {
      return next(error);
    }
  };

exports.startQuickPractice =
  async (req, res, next) => {
    try {
      const attempt =
        await createQuickPracticeAttempt({
          userId: req.apiUser._id,
          pointValue:
            req.body.pointValue,
          coachMode:
            req.apiUser.preferences
              ?.coachMode,
        });

      return res
        .status(201)
        .json({
          timeLimitMs: 40000,
          attempt,
        });
    } catch (error) {
      return next(error);
    }
  };

exports.submitQuickPractice =
  async (req, res, next) => {
    try {
      return res.json({
        result:
          await submitQuickPracticeAttempt(
            {
              userId:
                req.apiUser._id,
              instanceId:
                req.params.instanceId,
              submittedAnswer:
                req.body.answer,
              coachMode:
                req.apiUser.preferences
                  ?.coachMode,
            }
          ),
      });
    } catch (error) {
      return next(error);
    }
  };

exports.expireQuickPractice =
  async (req, res, next) => {
    try {
      const result =
        await expireQuickPracticeAttempt({
          userId: req.apiUser._id,
          instanceId:
            req.params.instanceId,
          coachMode:
            req.apiUser.preferences
              ?.coachMode,
        });

      return res.json({
        result,
      });
    } catch (error) {
      return next(error);
    }
  };

exports.suggestionBoard = async (
  req,
  res,
  next
) => {
  try {
    return res.json({
      board:
        await getSuggestionBoardData({
          ...req.apiUser,
          id: String(
            req.apiUser._id
          ),
        }),
    });
  } catch (error) {
    return next(error);
  }
};

exports.createSuggestion = async (
  req,
  res,
  next
) => {
  try {
    const suggestion =
      await createSuggestion({
        user: {
          ...req.apiUser,
          id: String(
            req.apiUser._id
          ),
        },
        mode: req.body.mode,
        situation:
          req.body.situation,
        message: req.body.message,
        requestId:
          req.get("idempotency-key") ||
          req.body.requestId,
      });

    return res
      .status(201)
      .json({ suggestion });
  } catch (error) {
    return next(error);
  }
};

exports.moderateSuggestion =
  async (req, res, next) => {
    try {
      return res.json({
        suggestion:
          await moderateSuggestion({
            adminUser: {
              ...req.apiUser,
              id: String(
                req.apiUser._id
              ),
            },
            suggestionId:
              req.params.suggestionId,
            action:
              req.body.action,
            rejectionReason:
              req.body
                .rejectionReason,
          }),
      });
    } catch (error) {
      return next(error);
    }
  };

exports.requestPasswordReset =
  async (req, res, next) => {
    try {
      await requestPasswordReset(
        req.body.email
      );

      return res.json({
        message:
          "가입된 이메일이라면 인증코드를 발송했습니다.",
      });
    } catch (error) {
      return next(error);
    }
  };

exports.verifyPasswordReset =
  async (req, res, next) => {
    try {
      const verification =
        await verifyPasswordResetCode(
          {
            email:
              req.body.email,
            code: req.body.code,
          }
        );

      return res.json({
        resetAuthorization: {
          resetId:
            verification.resetId,
          userId:
            verification.userId,
          expiresAt:
            verification.expiresAt,
        },
      });
    } catch (error) {
      return next(error);
    }
  };

exports.resetPassword = async (
  req,
  res,
  next
) => {
  try {
    await resetPassword({
      resetId:
        req.body.resetId,
      userId: req.body.userId,
      password: req.body.password,
      passwordConfirm:
        req.body.passwordConfirm,
    });

    return res.json({
      reset: true,
      message:
        "비밀번호가 변경되었습니다.",
    });
  } catch (error) {
    return next(error);
  }
};
