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
  getAcademicYear,
  lifecycleSessionView,
  recordStudyActivity,
  synchronizeUserLifecycle,
} = require("../services/userLifecycleService");
const {
  DIFFICULTY_LABELS,
  createAssessmentAttempt,
  getAssessmentAttempt,
  getAssessmentCenterData,
  submitAssessmentAttempt,
} = require("../services/assessmentService");
const bcrypt = require('bcrypt');
const BCRYPT_ROUNDS = 12;

exports.mainPage = (req,res) => {
    res.render('index');
}

exports.introPage = (req,res) => {
    res.render('intro');
}

exports.loginPage = (req,res) => {
    res.render('login');
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
                req.body.mode
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
                email: user.email,
                schoolGrade: user.schoolGrade,
                ...lifecycleSessionView(user),

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
            name,
            email,
            schoolGrade,
            schoolRegion,
            schoolCode,
        };

        if (
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

        if (name.length < 2 || name.length > 30) {
            return renderRegisterError(
                res,
                400,
                "이름은 2자 이상 30자 이하로 입력해주세요.",
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
            email: user.email,
            schoolGrade: user.schoolGrade,
            ...lifecycleSessionView(user),

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
