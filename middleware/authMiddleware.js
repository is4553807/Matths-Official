const {
    getKoreanDateKey,
    lifecycleSessionView,
    synchronizeUserLifecycle,
} = require("../services/userLifecycleService");
const {
    synchronizeAccountAccess,
} = require("../services/accountAccessService");

function isAdminSessionUser(user) {
    return user?.role === "admin";
}

exports.isLoggedIn = async (req, res, next) => {
    if (req.session?.user) {
        try {
            const access =
                await synchronizeAccountAccess(
                    req.session.user.id
                );
            const account =
                access?.user;

            if (
                !account ||
                !access.allowed ||
                (
                    req.session.user
                        .tokenVersion !==
                        undefined &&
                    Number(
                        req.session.user
                            .tokenVersion
                    ) !==
                        Number(
                            account.tokenVersion
                        )
                )
            ) {
                const state =
                    access?.status ||
                    "inactive";
                return req.session.destroy(
                    () =>
                        res.redirect(
                            `/login?account=${encodeURIComponent(state)}`
                        )
                );
            }

            Object.assign(
                req.session.user,
                {
                    name: account.name,
                    realName:
                        account.realName ||
                        "",
                    email: account.email,
                    role:
                        account.role ||
                        "student",
                    tokenVersion:
                        Number(
                            account.tokenVersion
                        ) || 0,
                    school:
                        account.school,
                    schoolGrade:
                        account.schoolGrade,
                    educationStatus:
                        account.educationStatus ||
                        ([13, 15].includes(Number(account.schoolGrade))
                            ? "graduated"
                            : "enrolled"),
                    university:
                        account.university,
                    preferences:
                        account.preferences,
                }
            );
            const todayKey =
                getKoreanDateKey();

            if (
                req.session.user
                    .lifecycleDateKey !==
                todayKey
            ) {
                const user =
                    await synchronizeUserLifecycle(
                        req.session.user.id
                    );

                Object.assign(
                    req.session.user,
                    lifecycleSessionView(user)
                );
            }

            return next();
        } catch (error) {
            return next(error);
        }
    }

    if (req.method === "GET" && req.session) {
        req.session.returnTo = req.originalUrl;
    }

    return res.redirect("/login");
};

exports.isLoggedOut = (req, res, next) => {
    if (!req.session?.user) {
        return next();
    }

    return res.redirect(
        isAdminSessionUser(
            req.session.user
        )
            ? "/admin"
            : "/main"
    );
};

// ASWebAuthenticationSession은 기존 Safari 로그인 쿠키를 재사용할 수 있다.
// 앱이 시작한 OAuth state가 맞다면 웹 로그인 여부와 무관하게 callback을 끝내
// matths://oauth/google 로 복귀시킨다. 일반 웹 OAuth는 기존 logged-out 계약을
// 그대로 유지한다.
exports.isSocialOAuthCallbackAllowed = (
    req,
    res,
    next
) => {
    if (
        req.session
            ?.socialOAuthState
            ?.context
            ?.mobile === true
    ) {
        return next();
    }

    return exports.isLoggedOut(
        req,
        res,
        next
    );
};

exports.isAdmin = (
    req,
    res,
    next
) => {
    const user =
        req.session?.user;
    const authorized =
        isAdminSessionUser(user);

    if (authorized) {
        return next();
    }

    const error = new Error(
        "운영자만 접근할 수 있습니다."
    );
    error.status = 403;
    error.code = "ADMIN_ACCESS_REQUIRED";
    return next(error);
};
