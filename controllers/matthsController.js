const {
  User,
  ConceptProgress,
  ConceptLesson,
} = require("../models/matthsModel");
const {getSchoolSelectData,findSchool,} = require('../services/schoolService');
const {getDashboardData, toggleDailyPlanTask, updateCoachMode,} = require('../services/dashboardService');
const {loadCurriculum, buildLearningViewModel, findUnitView,} = require("../services/curriculumService");
const {getUserLearningData, updateTopicCompletion,} = require('../services/learningProgressService');
const {
  getWrongNoteData,
  getWrongNoteReviewData,
} = require("../services/wrongNoteService");
const {
  createNextProblem,
  submitProblem,
  changeCompletion,
  getReviewContext,
} = require("../services/practiceService");
const {
  formatAlgebraLesson,
} = require("../services/mathTextService");
const {
  getConceptTypeGuides,
} = require("../services/conceptGuideService");
const {
  getAcademicYear,
  lifecycleSessionView,
  recordStudyActivity,
  synchronizeUserLifecycle,
} = require("../services/userLifecycleService");
const {
  DIFFICULTY_LABELS,
  createAssessmentAttempt,
  expireAssessmentAttempt,
  getAssessmentAttempt,
  getAssessmentCenterData,
  saveAssessmentDraft,
  submitAssessmentAttempt,
} = require("../services/assessmentService");
const {
  createQuickPracticeAttempt,
  expireQuickPracticeAttempt,
  getQuickPracticeCatalogSummary,
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
  getRankingDisplayName,
  normalizeRankingDisplayMode,
  validateRealName,
} = require("../services/userIdentityService");
const {
  createSupportInquiry,
  getContactPageData,
} = require("../services/supportInquiryService");
const bcrypt = require('bcrypt');
const BCRYPT_ROUNDS = 12;

exports.mainPage = (req,res) => {
    res.render('index');
}

exports.introPage = (req,res) => {
    res.render('intro');
}

exports.loginPage = (req,res) => {
    res.render('login', {
      success:
        req.query.reset === "1"
          ? "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요."
          : null,
    });
}

exports.registerPage = (
  req,
  res,
  next
) => {
  try {
    const schoolRegions =
      getSchoolSelectData();

    return res.render("register", {
      schoolRegions,
      error: null,
      oldInput: {
        realName: "",
        name: "",
        email: "",
        schoolGrade: 10,
        schoolRegion: "",
        schoolCode: "",
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.visualLearningPage = (req,res) => {
    res.render('visual-learning');
}

exports.learningFlowPage = (req,res) => {
    res.render('learning-flow');
}

exports.faqPage = (req,res) => {
    res.render('faq');
}

async function renderContactPage(
  req,
  res,
  {
    status = 200,
    feedback = null,
    oldInput = {},
  } = {}
) {
  const contactData =
    await getContactPageData(
      req.session.user.id
    );

  return res
    .status(status)
    .render("contact", {
      user: req.session.user,
      contactData,
      feedback,
      oldInput: {
        subject:
          String(
            oldInput.subject || ""
          ),
        content:
          String(
            oldInput.content || ""
          ),
      },
    });
}

exports.contactPage = async (
  req,
  res,
  next
) => {
  try {
    const feedback =
      req.session.contactFeedback ||
      null;

    if (
      req.session.contactFeedback
    ) {
      delete req.session
        .contactFeedback;
      await saveSession(req);
    }

    return await renderContactPage(
      req,
      res,
      {
        feedback,
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.submitContactInquiry =
  async (req, res, next) => {
    try {
      const result =
        await createSupportInquiry({
          userId:
            req.session.user.id,
          subject:
            req.body.subject,
          content:
            req.body.content,
        });

      req.session.contactFeedback = {
        type:
          result.emailStatus ===
          "failed"
            ? "warning"
            : "success",
        message:
          result.emailStatus ===
          "failed"
            ? "문의는 정상적으로 저장되었습니다. 관리자 이메일 알림 전송 상태를 확인하고 있습니다."
            : "문의가 접수되었습니다. 답변은 회원가입한 이메일로 전달됩니다.",
      };
      await saveSession(req);

      return res.redirect(
        "/contact"
      );
    } catch (error) {
      if (error.status) {
        return await renderContactPage(
          req,
          res,
          {
            status: error.status,
            feedback: {
              type: "error",
              message: error.message,
            },
            oldInput: {
              subject:
                req.body.subject,
              content:
                req.body.content,
            },
          }
        );
      }

      return next(error);
    }
  };

exports.curriculumPage = (req, res, next) => {
  try {
    const curriculumData = loadCurriculum();

    res.render('curriculum', {curriculumData});
  } catch (error) {
    next(error);
  }
};

exports.main = async (req, res, next) => {
    try {
        const dashboardData =
            await getDashboardData(
                req.session.user.id
            );

        return res.render("main", {
            user: dashboardData.user,
            dashboardData,
        });
    } catch (error) {
        return next(error);
    }
};

exports.warOfMastersPage = async (
  req,
  res,
  next
) => {
  try {
    const user = await User.findById(
      req.session.user.id
    ).lean();

    if (!user) {
      throw createNotFoundError(
        "사용자 정보를 찾을 수 없습니다."
      );
    }

    const gradeLabels = {
      10: "고등학교 1학년",
      11: "고등학교 2학년",
      12: "고등학교 3학년",
      13: "N수생",
    };

    const tiers = [
      ["B", "브론즈", "0–999"],
      ["S", "실버", "1,000–1,249"],
      ["G", "골드", "1,250–1,499"],
      ["P", "플래티넘", "1,500–1,749"],
      ["E", "에메랄드", "1,750–1,899"],
      ["D", "다이아몬드", "1,900–2,049"],
      ["M", "마스터", "2,050–2,199"],
      ["GM", "그랜드마스터", "2,200–2,349"],
      ["C", "챌린저", "2,350+"],
    ];

    res.set("Cache-Control", "no-store");

    return res.render(
      "war-of-masters",
      {
        user,
        arenaUser: {
          nickname:
            String(user.name || "학생"),
          displayName:
            getRankingDisplayName(user),
          schoolName:
            String(
              user.school?.name ||
                "학교 미설정"
            ),
          gradeLabel:
            gradeLabels[
              Number(user.schoolGrade)
            ] || "학년 미설정",
          displayMode:
            user.preferences
              ?.rankingDisplayMode ===
            "realName"
              ? "실명"
              : "닉네임",
        },
        tiers,
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.togglePlanTask = async (
    req,
    res,
    next
) => {
    try {
        const plan =
            await toggleDailyPlanTask(
                req.session.user.id,
                req.params.taskId
            );

        if (!plan) {
            return res.status(404).json({
                message:
                    "오늘의 학습 계획을 찾을 수 없습니다.",
            });
        }

        return res.json({ plan });
    } catch (error) {
        return next(error);
    }
};

exports.changeCoachMode = async (
    req,
    res,
    next
) => {
    try {
        const coach =
            await updateCoachMode(
                req.session.user.id,
                req.body.mode,
                req.body.situation
            );

        if (!coach) {
            return res.status(400).json({
                message:
                    "올바른 코치 모드를 선택해주세요.",
            });
        }

        req.session.user.preferences = {
            ...(req.session.user.preferences ||
                {}),
            coachMode: coach.mode,
        };

        return req.session.save((error) => {
            if (error) {
                return next(error);
            }

            return res.json({ coach });
        });
    } catch (error) {
        return next(error);
    }
};

exports.myLearning = async (req, res, next) => {
  try {
    const { learningData } = await getUserLearningData(
      req.session.user.id
    );

    return res.render("my-learning", {
      learningData,
      user: req.session.user,
    });
  } catch (error) {
    return next(error);
  }
};

exports.unitLearning = async (
  req,
  res,
  next
) => {
  try {
    const { learningData } =
      await getUserLearningData(
        req.session.user.id
      );

    const unitView = findUnitView(
      learningData,
      req.params.courseId,
      req.params.unitId,
      req.params.conceptId
    );

    if (!unitView) {
      const error = new Error(
        "학습 단원을 찾을 수 없습니다."
      );

      error.status = 404;
      return next(error);
    }

    const conceptId =
      unitView.selectedConcept.id;

    const reviewAttemptId = String(
      req.query.reviewAttempt || ""
    ).trim();

    const [
      lesson,
      conceptProgress,
      reviewContext,
      assessmentData,
    ] =
      await Promise.all([
        ConceptLesson.findOne({
          curriculumId: "kr-2022",
          courseId: unitView.course.id,
          unitId: unitView.unit.id,
          conceptId,
          isPublished: true,
        }).lean(),

        ConceptProgress.findOne({
          userId: req.session.user.id,
          curriculumId: "kr-2022",
          courseId: unitView.course.id,
          unitId: unitView.unit.id,
          conceptId,
        }).lean(),

        reviewAttemptId
          ? getReviewContext({
              userId: req.session.user.id,
              reviewAttemptId,
              courseId: unitView.course.id,
              unitId: unitView.unit.id,
              conceptId,
            })
          : null,

        getAssessmentCenterData(
          req.session.user.id
        ),
      ]);

    const mastery =
      conceptProgress?.masteryGate || {
        requiredDistinctTypes:
          lesson?.practice
            ?.requiredDistinctTypes || 5,

        correctTypeIds: [],
        unlockedAt: null,
        userCompleted: false,
        completedAt: null,
      };

    const renderedLesson =
      formatAlgebraLesson(lesson);
    const conceptTypeGuides =
      getConceptTypeGuides({
        courseId: unitView.course.id,
        unitId: unitView.unit.id,
        conceptId,
      });
    const assessmentCourse =
      assessmentData.courses.find(
        (item) =>
          item.id ===
          unitView.course.id
      );
    const assessmentUnit =
      assessmentCourse?.units.find(
        (item) =>
          item.id ===
          unitView.unit.id
      );
    const subunitAssessment =
      assessmentUnit?.subunits.find(
        (item) =>
          item.concepts.some(
            (assessmentConcept) =>
              assessmentConcept.id ===
              conceptId
          )
      ) || null;

    return res.render("unit-learning", {
      learningData,
      unitView,
      lesson: renderedLesson,
      mastery,
      reviewContext,
      subunitAssessment,
      conceptTypeGuides,
      user: req.session.user,
    });
  } catch (error) {
    return next(error);
  }
};

function renderRegisterError(res, status, error, oldInput = {}) {
    return res.status(status).render("register", {
        schoolRegions: getSchoolSelectData(),
        error,
        oldInput: {
            realName: "",
            name: "",
            email: "",
            schoolGrade: 10,
            schoolRegion: "",
            schoolCode: "",
            ...oldInput,
        },
    });
}

function createLoginSession(req, user) {
    return new Promise((resolve, reject) => {
        req.session.regenerate((regenerateError) => {
            if (regenerateError) {
                return reject(regenerateError);
            }

            req.session.user = {
                id: user._id.toString(),
                name: user.name,
                realName: user.realName || "",
                email: user.email,
                role: user.role || "student",
                schoolGrade: user.schoolGrade,
                ...lifecycleSessionView(user),
                preferences: {
                    coachMode:
                        user.preferences
                            ?.coachMode ||
                        "spicy",
                    rankingDisplayMode:
                        user.preferences
                            ?.rankingDisplayMode ||
                        "nickname",
                },

                school: user.school
                    ? {
                          region: user.school.region,
                          code: user.school.code,
                          name: user.school.name,
                      }
                    : null,
            };

            req.session.save((saveError) => {
                if (saveError) {
                    return reject(saveError);
                }

                resolve();
            });
        });
    });
}

exports.register = async (req, res, next) => {
    try {
        const realNameValidation = validateRealName(
            req.body.realName
        );
        const realName = realNameValidation.realName;
        const name = String(req.body.name || "").trim();
        const email = String(req.body.email || "")
            .trim()
            .toLowerCase();

        const schoolGrade = Number(req.body.schoolGrade);
        const schoolRegion = String(req.body.schoolRegion || "").trim();
        const schoolCode = String(req.body.schoolCode || "").trim();

        const password = String(req.body.password || "");
        const passwordConfirm = String(req.body.passwordConfirm || "");

        const termsAccepted = ["true", "on", "1"].includes(
            String(req.body.termsAccepted || "")
        );

        // 비밀번호는 oldInput에 절대 포함하지 않는다.
        const oldInput = {
            realName,
            name,
            email,
            schoolGrade,
            schoolRegion,
            schoolCode,
        };

        if (
            !realName ||
            !name ||
            !email ||
            !schoolRegion ||
            !schoolCode ||
            !password ||
            !passwordConfirm
        ) {
            return renderRegisterError(
                res,
                400,
                "필수 항목을 모두 입력해주세요.",
                oldInput
            );
        }

        if (!realNameValidation.valid) {
            return renderRegisterError(
                res,
                400,
                realNameValidation.message,
                oldInput
            );
        }

        if (name.length < 2 || name.length > 30) {
            return renderRegisterError(
                res,
                400,
                "닉네임은 2자 이상 30자 이하로 입력해주세요.",
                oldInput
            );
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(email)) {
            return renderRegisterError(
                res,
                400,
                "올바른 이메일 주소를 입력해주세요.",
                oldInput
            );
        }

        if (![10, 11, 12].includes(schoolGrade)) {
            return renderRegisterError(
                res,
                400,
                "올바른 학년을 선택해주세요.",
                oldInput
            );
        }

        if (password.length < 8) {
            return renderRegisterError(
                res,
                400,
                "비밀번호는 8자 이상이어야 합니다.",
                oldInput
            );
        }

        if (Buffer.byteLength(password, "utf8") > 72) {
            return renderRegisterError(
                res,
                400,
                "비밀번호가 너무 깁니다.",
                oldInput
            );
        }

        if (password !== passwordConfirm) {
            return renderRegisterError(
                res,
                400,
                "비밀번호가 서로 일치하지 않습니다.",
                oldInput
            );
        }

        if (!termsAccepted) {
            return renderRegisterError(
                res,
                400,
                "이용약관에 동의해주세요.",
                oldInput
            );
        }

        /*
         * 브라우저가 보낸 학교 이름을 그대로 저장하지 않고,
         * YAML 데이터에서 학교 코드가 실제로 존재하는지 확인한다.
         */
        const selectedSchool = findSchool(schoolRegion, schoolCode);

        if (!selectedSchool) {
            return renderRegisterError(
                res,
                400,
                "올바른 고등학교를 선택해주세요.",
                oldInput
            );
        }

        const existingUser = await User.exists({ email });

        if (existingUser) {
            return renderRegisterError(
                res,
                409,
                "이미 가입된 이메일입니다.",
                oldInput
            );
        }

        const passwordHash = await bcrypt.hash(
            password,
            BCRYPT_ROUNDS
        );

        const user = await User.create({
            realName,
            name,
            email,
            passwordHash,
            schoolGrade,
            lastGradePromotionYear:
                getAcademicYear(),

            school: {
                region: selectedSchool.region,
                code: selectedSchool.code,
                name: selectedSchool.name,
                roadAddress: selectedSchool.roadAddress || "",
                establishment: selectedSchool.establishment || "",
                highSchoolType: selectedSchool.highSchoolType || "",
            },

            termsAcceptedAt: new Date(),
            termsVersion: "2026-07-28",
            privacyVersion: "2026-07-28",
        });

        // 회원가입 완료 후 바로 로그인 처리
        await createLoginSession(req, user);

        return res.redirect("/main");
    } catch (error) {
        // 동시에 같은 이메일로 가입 요청이 들어온 경우
        if (error.code === 11000 && error.keyPattern?.email) {
            return renderRegisterError(
                res,
                409,
                "이미 가입된 이메일입니다.",
                {
                    realName: validateRealName(
                        req.body.realName
                    ).realName,
                    name: String(req.body.name || "").trim(),
                    email: String(req.body.email || "")
                        .trim()
                        .toLowerCase(),
                    schoolGrade: Number(req.body.schoolGrade) || 10,
                    schoolRegion: String(
                        req.body.schoolRegion || ""
                    ).trim(),
                    schoolCode: String(req.body.schoolCode || "").trim(),
                }
            );
        }

        return next(error);
    }
};

function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate((error) => {
            if (error) {
                return reject(error);
            }

            resolve();
        });
    });
}

function saveSession(req) {
    return new Promise((resolve, reject) => {
        req.session.save((error) => {
            if (error) {
                return reject(error);
            }

            resolve();
        });
    });
}

function isSafeReturnPath(returnTo) {
    return (
        typeof returnTo === "string" &&
        returnTo.startsWith("/") &&
        !returnTo.startsWith("//")
    );
}

exports.login = async (req, res, next) => {
    try {
        const email = String(req.body.email || "")
            .trim()
            .toLowerCase();

        const password = String(req.body.password || "");

        if (!email || !password) {
            return res.status(400).render("login", {
                error: "이메일과 비밀번호를 모두 입력해주세요.",
                oldInput: {
                    email,
                },
            });
        }

        /*
         * passwordHash가 Schema에서 select: false라면
         * 반드시 select("+passwordHash")를 사용해야 한다.
         */
        let user = await User.findOne({ email })
            .select("+passwordHash")
            .lean();

        /*
         * 이메일 존재 여부와 비밀번호 오류를 같은 문구로 처리한다.
         * 어떤 이메일이 가입되어 있는지 외부에 노출하지 않기 위해서다.
         */
        if (!user) {
            return res.status(401).render("login", {
                error: "이메일 또는 비밀번호가 올바르지 않습니다.",
                oldInput: {
                    email,
                },
            });
        }

        const passwordMatched = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!passwordMatched) {
            return res.status(401).render("login", {
                error: "이메일 또는 비밀번호가 올바르지 않습니다.",
                oldInput: {
                    email,
                },
            });
        }

        user = (
            await synchronizeUserLifecycle(
                user._id
            )
        ).toObject();

        /*
         * 로그인 전에 사용자가 접근하려던 주소를 보관한다.
         * regenerate하면 기존 session 데이터가 사라지므로 먼저 꺼내야 한다.
         */
        const returnTo = req.session.returnTo;

        /*
         * 로그인 성공 시 Session ID를 새로 발급해서
         * 세션 고정 공격을 방지한다.
         */
        await regenerateSession(req);

        req.session.user = {
            id: user._id.toString(),
            name: user.name,
            realName: user.realName || "",
            email: user.email,
            role: user.role || "student",
            schoolGrade: user.schoolGrade,
            ...lifecycleSessionView(user),
            preferences: {
                coachMode:
                    user.preferences
                        ?.coachMode ||
                    "spicy",
                rankingDisplayMode:
                    user.preferences
                        ?.rankingDisplayMode ||
                    "nickname",
            },

            school: user.school
                ? {
                      region: user.school.region,
                      code: user.school.code,
                      name: user.school.name,
                  }
                : null,
        };

        await saveSession(req);

        if (isSafeReturnPath(returnTo)) {
            return res.redirect(returnTo);
        }

        return res.redirect("/main");
    } catch (error) {
        return next(error);
    }
};

exports.logout = (req, res, next) => {
    req.session.destroy((error) => {
        if (error) {
            return next(error);
        }

        res.clearCookie("connect.sid");
        return res.redirect("/login");
    });
};

function createNotFoundError(message) {
    const error = new Error(message);
    error.status = 404;
    return error;
}

async function renderProfile(
    req,
    res,
    {
        status = 200,
        feedback = null,
        formValues = {},
    } = {}
) {
    const profileUser = await User.findById(
        req.session.user.id
    ).lean();

    if (!profileUser) {
        throw createNotFoundError(
            "사용자 정보를 찾을 수 없습니다."
        );
    }

    return res.status(status).render("profile", {
        profileUser,
        schoolRegions: getSchoolSelectData(),
        feedback,
        formValues,
    });
}

exports.profilePage = async (req, res, next) => {
    try {
        return await renderProfile(req, res);
    } catch (error) {
        return next(error);
    }
};

exports.changeNickname = async (req, res, next) => {
    try {
        const nickname = String(
            req.body.nickname || ""
        ).trim();

        if (!nickname) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "nickname",
                    type: "error",
                    message: "새 닉네임을 입력해주세요.",
                },
                formValues: { nickname },
            });
        }

        if (
            nickname.length < 2 ||
            nickname.length > 30
        ) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "nickname",
                    type: "error",
                    message:
                        "닉네임은 2자 이상 30자 이하로 입력해주세요.",
                },
                formValues: { nickname },
            });
        }

        const user = await User.findByIdAndUpdate(
            req.session.user.id,
            { name: nickname },
            {
                new: true,
                runValidators: true,
            }
        ).lean();

        if (!user) {
            throw createNotFoundError(
                "사용자 정보를 찾을 수 없습니다."
            );
        }

        req.session.user.name = user.name;
        await saveSession(req);

        return await renderProfile(req, res, {
            feedback: {
                section: "nickname",
                type: "success",
                message: "닉네임을 변경했습니다.",
            },
        });
    } catch (error) {
        return next(error);
    }
};

exports.changeRankingIdentity = async (
    req,
    res,
    next
) => {
    try {
        const realNameValidation =
            validateRealName(req.body.realName);
        const rankingDisplayMode =
            normalizeRankingDisplayMode(
                req.body.rankingDisplayMode
            );
        const formValues = {
            realName: realNameValidation.realName,
            rankingDisplayMode:
                rankingDisplayMode ||
                String(
                    req.body.rankingDisplayMode || ""
                ),
        };

        if (!realNameValidation.valid) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "ranking-identity",
                    type: "error",
                    message:
                        realNameValidation.message,
                },
                formValues,
            });
        }

        if (!rankingDisplayMode) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "ranking-identity",
                    type: "error",
                    message:
                        "랭킹에 표시할 이름 방식을 선택해주세요.",
                },
                formValues,
            });
        }

        const user = await User.findByIdAndUpdate(
            req.session.user.id,
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
        ).lean();

        if (!user) {
            throw createNotFoundError(
                "사용자 정보를 찾을 수 없습니다."
            );
        }

        req.session.user.realName =
            user.realName || "";
        req.session.user.preferences = {
            ...(req.session.user.preferences ||
                {}),
            rankingDisplayMode:
                user.preferences
                    ?.rankingDisplayMode ||
                "nickname",
        };
        await saveSession(req);

        return await renderProfile(req, res, {
            feedback: {
                section: "ranking-identity",
                type: "success",
                message:
                    rankingDisplayMode ===
                    "realName"
                        ? "랭킹에서 실명을 표시하도록 저장했습니다."
                        : "랭킹에서 닉네임을 표시하도록 저장했습니다.",
            },
        });
    } catch (error) {
        return next(error);
    }
};

exports.changeSchool = async (req, res, next) => {
    try {
        const schoolRegion = String(
            req.body.schoolRegion || ""
        ).trim();
        const schoolCode = String(
            req.body.schoolCode || ""
        ).trim();
        const formValues = {
            schoolRegion,
            schoolCode,
        };

        if (!schoolRegion || !schoolCode) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "school",
                    type: "error",
                    message:
                        "변경할 지역과 고등학교를 선택해주세요.",
                },
                formValues,
            });
        }

        const selectedSchool = findSchool(
            schoolRegion,
            schoolCode
        );

        if (!selectedSchool) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "school",
                    type: "error",
                    message:
                        "학교 목록에서 올바른 고등학교를 선택해주세요.",
                },
                formValues,
            });
        }

        const school = {
            region: selectedSchool.region,
            code: selectedSchool.code,
            name: selectedSchool.name,
            roadAddress:
                selectedSchool.roadAddress || "",
            establishment:
                selectedSchool.establishment || "",
            highSchoolType:
                selectedSchool.highSchoolType || "",
        };

        const user = await User.findByIdAndUpdate(
            req.session.user.id,
            { school },
            {
                new: true,
                runValidators: true,
            }
        ).lean();

        if (!user) {
            throw createNotFoundError(
                "사용자 정보를 찾을 수 없습니다."
            );
        }

        req.session.user.school = {
            region: user.school.region,
            code: user.school.code,
            name: user.school.name,
        };
        await saveSession(req);

        return await renderProfile(req, res, {
            feedback: {
                section: "school",
                type: "success",
                message: `${user.school.name}(으)로 변경했습니다.`,
            },
        });
    } catch (error) {
        return next(error);
    }
};

exports.changePassword = async (req, res, next) => {
    try {
        const currentPassword = String(
            req.body.currentPassword || ""
        );
        const newPassword = String(
            req.body.newPassword || ""
        );
        const newPasswordConfirm = String(
            req.body.newPasswordConfirm || ""
        );

        if (
            !currentPassword ||
            !newPassword ||
            !newPasswordConfirm
        ) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "password",
                    type: "error",
                    message:
                        "현재 비밀번호와 새 비밀번호를 모두 입력해주세요.",
                },
            });
        }

        if (newPassword.length < 8) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "password",
                    type: "error",
                    message:
                        "새 비밀번호는 8자 이상이어야 합니다.",
                },
            });
        }

        if (
            Buffer.byteLength(
                newPassword,
                "utf8"
            ) > 72
        ) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "password",
                    type: "error",
                    message:
                        "새 비밀번호가 너무 깁니다.",
                },
            });
        }

        if (newPassword !== newPasswordConfirm) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "password",
                    type: "error",
                    message:
                        "새 비밀번호와 비밀번호 확인이 일치하지 않습니다.",
                },
            });
        }

        const user = await User.findById(
            req.session.user.id
        ).select("+passwordHash");

        if (!user) {
            throw createNotFoundError(
                "사용자 정보를 찾을 수 없습니다."
            );
        }

        const currentPasswordMatched =
            await bcrypt.compare(
                currentPassword,
                user.passwordHash
            );

        if (!currentPasswordMatched) {
            return await renderProfile(req, res, {
                status: 401,
                feedback: {
                    section: "password",
                    type: "error",
                    message:
                        "현재 비밀번호가 올바르지 않습니다.",
                },
            });
        }

        const sameAsCurrent =
            await bcrypt.compare(
                newPassword,
                user.passwordHash
            );

        if (sameAsCurrent) {
            return await renderProfile(req, res, {
                status: 400,
                feedback: {
                    section: "password",
                    type: "error",
                    message:
                        "새 비밀번호는 현재 비밀번호와 다르게 설정해주세요.",
                },
            });
        }

        user.passwordHash = await bcrypt.hash(
            newPassword,
            BCRYPT_ROUNDS
        );
        user.tokenVersion =
            (Number(user.tokenVersion) || 0) + 1;
        await user.save();

        return await renderProfile(req, res, {
            feedback: {
                section: "password",
                type: "success",
                message: "비밀번호를 안전하게 변경했습니다.",
            },
        });
    } catch (error) {
        return next(error);
    }
};

exports.loggedCurriculumPage = async (req, res, next) => {
  try {
    const { learningData } = await getUserLearningData(
      req.session.user.id
    );

    return res.render("log-curriculum", {
      user: req.session.user,
      learningData,
    });
  } catch (error) {
    return next(error);
  }
};

exports.assessmentCenterPage = async (
  req,
  res,
  next
) => {
  try {
    res.set(
      "Cache-Control",
      "no-store"
    );

    const assessmentData =
      await getAssessmentCenterData(
        req.session.user.id
      );

    return res.render(
      "assessment-center",
      {
        user: req.session.user,
        assessmentData,
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.startAssessment = async (
  req,
  res,
  next
) => {
  try {
    const attempt =
      await createAssessmentAttempt({
        userId:
          req.session.user.id,
        scopeType: String(
          req.body?.scopeType || ""
        ),
        courseId: String(
          req.body?.courseId || ""
        ),
        unitId:
          String(
            req.body?.unitId || ""
          ) || null,
        subunitId:
          String(
            req.body?.subunitId || ""
          ) || null,
      });

    return res.redirect(
      `/assessments/${attempt._id}`
    );
  } catch (error) {
    return next(error);
  }
};

exports.assessmentAttemptPage = async (
  req,
  res,
  next
) => {
  try {
    res.set(
      "Cache-Control",
      "no-store"
    );

    const attempt =
      await getAssessmentAttempt({
        userId:
          req.session.user.id,
        attemptId:
          req.params.attemptId,
      });

    return res.render(
      "assessment-attempt",
      {
        user: req.session.user,
        attempt,
        difficultyLabels:
          DIFFICULTY_LABELS,
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.submitAssessment = async (
  req,
  res,
  next
) => {
  try {
    const attempt =
      await submitAssessmentAttempt({
        userId:
          req.session.user.id,
        attemptId:
          req.params.attemptId,
        answers:
          req.body?.answers || {},
      });

    const activityUser =
      await recordStudyActivity(
        req.session.user.id
      );
    Object.assign(
      req.session.user,
      lifecycleSessionView(activityUser)
    );

    return res.redirect(
      `/assessments/${attempt._id}`
    );
  } catch (error) {
    return next(error);
  }
};

exports.saveAssessmentDraft = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await saveAssessmentDraft({
        userId:
          req.session.user.id,
        attemptId:
          req.params.attemptId,
        answers:
          req.body?.answers || {},
      });

    return res.json(result);
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({
          message: error.message,
        });
    }

    return next(error);
  }
};

exports.expireAssessment = async (
  req,
  res,
  next
) => {
  try {
    const attempt =
      await expireAssessmentAttempt({
        userId:
          req.session.user.id,
        attemptId:
          req.params.attemptId,
        answers:
          req.body?.answers || {},
      });

    return res.json({
      status: attempt.status,
      expired:
        attempt.status ===
        "disqualified",
      redirectUrl:
        `/assessments/${attempt._id}`,
    });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({
          message: error.message,
          remainingTimeMs:
            error.remainingTimeMs,
        });
    }

    return next(error);
  }
};

exports.wrongNotesPage = async (req, res, next) => {
  try {
    const wrongNoteData = await getWrongNoteData(
      req.session.user.id,
      req.query
    );

    return res.render("wrong-notes", {
      user: req.session.user,
      wrongNoteData,
    });
  } catch (error) {
    return next(error);
  }
};

exports.wrongNoteReviewPage = async (
  req,
  res,
  next
) => {
  try {
    const reviewItem =
      await getWrongNoteReviewData({
        userId: req.session.user.id,
        attemptId: req.params.attemptId,
      });

    return res.render("wrong-note-review", {
      user: req.session.user,
      reviewItem,
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateTopicCompletion = async (req, res, next) => {
  try {
    const progress = await updateTopicCompletion({
      userId: req.session.user.id,
      courseId: req.params.courseId,
      unitId: req.params.unitId,
      conceptId: req.params.conceptId,
      topicIndex: req.params.topicIndex,
      completed: req.body.completed,
      sessionId: req.sessionID,
    });

    const activityUser =
      await recordStudyActivity(
        req.session.user.id
      );
    Object.assign(
      req.session.user,
      lifecycleSessionView(activityUser)
    );

    return res.json({ progress });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    return next(error);
  }
};

exports.nextPracticeProblem = async (
  req,
  res,
  next
) => {
  try {
    const result = await createNextProblem({
      req,
      userId: req.session.user.id,
      courseId: req.params.courseId,
      unitId: req.params.unitId,
      conceptId: req.params.conceptId,
      reviewAttemptId:
        req.query.reviewAttempt,
    });

    res.set("Cache-Control", "no-store");
    return res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    return next(error);
  }
};

exports.submitPracticeProblem = async (
  req,
  res,
  next
) => {
  try {
    const result = await submitProblem({
      req,
      userId: req.session.user.id,
      instanceId: req.body.instanceId,
      submittedAnswer: req.body.answer,
    });

    const activityUser =
      await recordStudyActivity(
        req.session.user.id
      );
    Object.assign(
      req.session.user,
      lifecycleSessionView(activityUser)
    );

    return res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    return next(error);
  }
};

exports.changeConceptCompletion = async (
  req,
  res,
  next
) => {
  try {
    if (typeof req.body.completed !== "boolean") {
      return res.status(400).json({
        message:
          "completed 값은 boolean이어야 합니다.",
      });
    }

    const mastery = await changeCompletion({
      userId: req.session.user.id,
      courseId: req.params.courseId,
      unitId: req.params.unitId,
      conceptId: req.params.conceptId,
      completed: req.body.completed,
      sessionId: req.sessionID,
    });

    const activityUser =
      await recordStudyActivity(
        req.session.user.id
      );
    Object.assign(
      req.session.user,
      lifecycleSessionView(activityUser)
    );

    return res.json({ mastery });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    return next(error);
  }
};

exports.quickPracticePage = async (
  req,
  res,
  next
) => {
  try {
    return res.render(
      "quick-practice",
      {
        user: req.session.user,
        catalog:
          getQuickPracticeCatalogSummary(),
        stats:
          await getQuickPracticeStats(
            req.session.user.id
          ),
      }
    );
  } catch (error) {
    return next(error);
  }
};

exports.startQuickPractice = async (
  req,
  res,
  next
) => {
  try {
    const attempt =
      await createQuickPracticeAttempt({
        userId:
          req.session.user.id,
        pointValue:
          req.body.pointValue,
      });

    res.set(
      "Cache-Control",
      "no-store"
    );
    return res.status(201).json({
      timeLimitMs: 40000,
      attempt,
    });
  } catch (error) {
    return next(error);
  }
};

exports.submitQuickPractice = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await submitQuickPracticeAttempt({
        userId:
          req.session.user.id,
        instanceId:
          req.params.instanceId,
        submittedAnswer:
          req.body.answer,
      });
    const activityUser =
      await synchronizeUserLifecycle(
        req.session.user.id
      );

    Object.assign(
      req.session.user,
      lifecycleSessionView(
        activityUser
      )
    );

    return res.json({
      result,
      stats:
        await getQuickPracticeStats(
          req.session.user.id
        ),
    });
  } catch (error) {
    return next(error);
  }
};

exports.expireQuickPractice = async (
  req,
  res,
  next
) => {
  try {
    return res.json({
      result:
        await expireQuickPracticeAttempt({
          userId:
            req.session.user.id,
          instanceId:
            req.params.instanceId,
        }),
      stats:
        await getQuickPracticeStats(
          req.session.user.id
        ),
    });
  } catch (error) {
    return next(error);
  }
};

exports.coachSuggestionBoard =
  async (req, res, next) => {
    try {
      return res.render(
        "coach-suggestions",
        {
          user: req.session.user,
          board:
            await getSuggestionBoardData(
              req.session.user
            ),
          submitted:
            req.query.submitted ===
            "1",
          moderated:
            req.query.moderated ===
            "1",
        }
      );
    } catch (error) {
      return next(error);
    }
  };

exports.submitCoachSuggestion =
  async (req, res, next) => {
    try {
      await createSuggestion({
        user: req.session.user,
        mode: req.body.mode,
        situation:
          req.body.situation,
        message: req.body.message,
      });

      return res.redirect(
        "/coach-suggestions?submitted=1"
      );
    } catch (error) {
      if (error.status) {
        const board =
          await getSuggestionBoardData(
            req.session.user
          );

        return res
          .status(error.status)
          .render(
            "coach-suggestions",
            {
              user:
                req.session.user,
              board,
              submitted: false,
              moderated: false,
              error:
                error.message,
              oldInput: {
                mode:
                  req.body.mode,
                situation:
                  req.body
                    .situation,
                message:
                  req.body.message,
              },
            }
          );
      }

      return next(error);
    }
  };

exports.moderateCoachSuggestion =
  async (req, res, next) => {
    try {
      await moderateSuggestion({
        adminUser:
          req.session.user,
        suggestionId:
          req.params.suggestionId,
        action: req.body.action,
        rejectionReason:
          req.body.rejectionReason,
      });

      return res.redirect(
        "/coach-suggestions?moderated=1"
      );
    } catch (error) {
      return next(error);
    }
  };

exports.forgotPasswordPage = (
  req,
  res
) =>
  res.render("password-reset", {
    step: "request",
    error: null,
    email: "",
    previewCode: null,
  });

exports.requestPasswordReset =
  async (req, res, next) => {
    const email = String(
      req.body.email || ""
    )
      .trim()
      .toLowerCase();

    try {
      const result =
        await requestPasswordReset(
          email
        );

      return res.render(
        "password-reset",
        {
          step: "verify",
          error: null,
          email,
          previewCode:
            result.previewCode,
        }
      );
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .render(
            "password-reset",
            {
              step: "request",
              error:
                error.message,
              email,
              previewCode: null,
            }
          );
      }

      return next(error);
    }
  };

exports.verifyPasswordReset =
  async (req, res, next) => {
    const email = String(
      req.body.email || ""
    )
      .trim()
      .toLowerCase();

    try {
      const verification =
        await verifyPasswordResetCode(
          {
            email,
            code: req.body.code,
          }
        );

      req.session.passwordReset = {
        resetId:
          verification.resetId,
        userId:
          verification.userId,
        expiresAt:
          verification.expiresAt,
      };
      await saveSession(req);

      return res.render(
        "password-reset",
        {
          step: "reset",
          error: null,
          email,
          previewCode: null,
        }
      );
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .render(
            "password-reset",
            {
              step: "verify",
              error:
                error.message,
              email,
              previewCode: null,
            }
          );
      }

      return next(error);
    }
  };

exports.completePasswordReset =
  async (req, res, next) => {
    const authorization =
      req.session.passwordReset;

    try {
      if (
        !authorization ||
        new Date(
          authorization.expiresAt
        ).getTime() <= Date.now()
      ) {
        const error = new Error(
          "비밀번호 재설정 인증이 만료되었습니다."
        );
        error.status = 400;
        throw error;
      }

      await resetPassword({
        resetId:
          authorization.resetId,
        userId:
          authorization.userId,
        password:
          req.body.password,
        passwordConfirm:
          req.body.passwordConfirm,
      });

      return req.session.destroy(
        (sessionError) => {
          if (sessionError) {
            return next(
              sessionError
            );
          }

          res.clearCookie(
            "connect.sid"
          );
          return res.redirect(
            "/login?reset=1"
          );
        }
      );
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .render(
            "password-reset",
            {
              step: "reset",
              error:
                error.message,
              email: "",
              previewCode: null,
            }
          );
      }

      return next(error);
    }
  };

exports.termsPage = (req, res) =>
  res.render("terms");

exports.privacyPage = (req, res) =>
  res.render("privacy");
