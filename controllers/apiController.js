const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const {
  User,
} = require("../models/matthsModel");
const {
  findSchool,
  getSchoolSelectData,
} = require("../services/schoolService");
const {
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
  validateRealName,
} = require("../services/userIdentityService");
const {
  accountBlockedMessage,
  synchronizeAccountAccess,
} = require("../services/accountAccessService");
const {
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

const BCRYPT_ROUNDS = 12;

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
        }
      : null,
    university: user.university?.code
      ? {
          code: user.university.code,
          name: user.university.name,
          campus: user.university.campus,
          region: user.university.region,
        }
      : null,
    currentStreak:
      Number(user.currentStreak) || 0,
    longestStreak:
      Number(user.longestStreak) || 0,
    rankingDisplayMode: "nickname",
  };
}

function authResponse(user) {
  return {
    tokenType: "Bearer",
    accessToken:
      createAccessToken(user),
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
    const universityCode = String(
      req.body.universityCode || ""
    ).trim();
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
        ? findSchool(
            schoolRegion,
            schoolCode
          )
        : null;
    const university =
      schoolGrade === 14
        ? findUniversity(universityCode)
        : null;

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
    const escapedIdentifier =
      identifier.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );
    let user = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      identifier
    )
      ? await User.findOne({ email }).select(
          "+passwordHash"
        )
      : null;
    if (!user) {
      user = await User.findOne({
        $or: [
          {
            nameNormalized:
              nicknameKey(identifier),
          },
          {
            name: {
              $regex:
                `^${escapedIdentifier}$`,
              $options: "i",
            },
          },
        ],
      }).select("+passwordHash");
    }

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
          "이메일·닉네임 또는 비밀번호가 올바르지 않습니다.",
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

exports.me = (req, res) =>
  res.json({
    user: serializeUser(req.apiUser),
  });

exports.withdrawMe = async (
  req,
  res,
  next
) => {
  try {
    await withdrawOwnAccount({
      userId: req.apiUser._id,
      password:
        req.body.password,
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
