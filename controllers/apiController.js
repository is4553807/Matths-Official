const bcrypt = require("bcrypt");
const {
  User,
} = require("../models/matthsModel");
const {
  findSchool,
  getSchoolSelectData,
} = require("../services/schoolService");
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
  normalizeRankingDisplayMode,
  validateRealName,
} = require("../services/userIdentityService");

const BCRYPT_ROUNDS = 12;

function serializeUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    realName: user.realName || "",
    email: user.email,
    role: user.role || "student",
    schoolGrade: user.schoolGrade,
    schoolGradeLabel: getGradeLabel(
      user.schoolGrade
    ),
    school: user.school
      ? {
          region: user.school.region,
          code: user.school.code,
          name: user.school.name,
        }
      : null,
    currentStreak:
      Number(user.currentStreak) || 0,
    longestStreak:
      Number(user.longestStreak) || 0,
    rankingDisplayMode:
      user.preferences
        ?.rankingDisplayMode ||
      "nickname",
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

exports.health = (req, res) =>
  res.json({
    service: "Matths API",
    version: "v1",
    status: "ok",
  });

exports.schools = (req, res) =>
  res.json({
    regions: getSchoolSelectData(),
  });

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
    const schoolGrade = Number(
      req.body.schoolGrade
    );
    const schoolRegion = String(
      req.body.schoolRegion || ""
    ).trim();
    const schoolCode = String(
      req.body.schoolCode || ""
    ).trim();
    const termsAccepted =
      req.body.termsAccepted === true;

    if (
      !realName ||
      !name ||
      !email ||
      !password ||
      !schoolRegion ||
      !schoolCode
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
      ![10, 11, 12].includes(
        schoolGrade
      )
    ) {
      return res.status(400).json({
        code: "INVALID_GRADE",
        message:
          "현재 고등학교 학년을 선택해주세요.",
      });
    }

    if (!termsAccepted) {
      return res.status(400).json({
        code: "TERMS_REQUIRED",
        message:
          "이용약관과 개인정보처리방침에 동의해주세요.",
      });
    }

    const school = findSchool(
      schoolRegion,
      schoolCode
    );

    if (!school) {
      return res.status(400).json({
        code: "INVALID_SCHOOL",
        message:
          "목록에서 고등학교를 선택해주세요.",
      });
    }

    const existing =
      await User.exists({
        email,
      });

    if (existing) {
      return res.status(409).json({
        code: "EMAIL_EXISTS",
        message:
          "이미 가입된 이메일입니다.",
      });
    }

    const now = new Date();
    const user = await User.create({
      realName,
      name,
      email,
      passwordHash:
        await bcrypt.hash(
          password,
          BCRYPT_ROUNDS
        ),
      schoolGrade,
      lastGradePromotionYear:
        getAcademicYear(now),
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
      termsAcceptedAt: now,
      termsVersion: "2026-07-28",
      privacyVersion: "2026-07-28",
    });

    return res
      .status(201)
      .json(authResponse(user));
  } catch (error) {
    if (
      error.code === 11000
    ) {
      return res.status(409).json({
        code: "EMAIL_EXISTS",
        message:
          "이미 가입된 이메일입니다.",
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
    const email = String(
      req.body.email || ""
    )
      .trim()
      .toLowerCase();
    const password = String(
      req.body.password || ""
    );
    const user = await User.findOne({
      email,
      isActive: true,
    }).select("+passwordHash");

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

    const synchronized =
      await synchronizeUserLifecycle(
        user._id
      );
    synchronized.lastLoginAt =
      new Date();
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

exports.updateRankingIdentity = async (
  req,
  res,
  next
) => {
  try {
    const realNameValidation =
      validateRealName(
        req.body.realName ??
          req.apiUser.realName
      );
    const rankingDisplayMode =
      normalizeRankingDisplayMode(
        req.body.rankingDisplayMode
      );

    if (!realNameValidation.valid) {
      return res.status(400).json({
        code: "INVALID_REAL_NAME",
        message:
          realNameValidation.message,
      });
    }

    if (!rankingDisplayMode) {
      return res.status(400).json({
        code:
          "INVALID_RANKING_DISPLAY_MODE",
        message:
          "랭킹 표시 방식은 nickname 또는 realName이어야 합니다.",
      });
    }

    const user =
      await User.findByIdAndUpdate(
        req.apiUser._id,
        {
          realName:
            realNameValidation.realName,
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
      const result =
        await requestPasswordReset(
          req.body.email
        );

      return res.json({
        message:
          "가입된 이메일이라면 인증코드를 발송했습니다.",
        previewCode:
          result.previewCode,
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
