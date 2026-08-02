const {
    getKoreanDateKey,
    lifecycleSessionView,
    synchronizeUserLifecycle,
} = require("../services/userLifecycleService");
const {
    synchronizeAccountAccess,
} = require("../services/accountAccessService");

function isAdminSessionUser(user) {
    const adminEmail = String(
        process.env.ADMIN_EMAIL ||
            "admin@lsbproduction.com"
    )
        .trim()
        .toLowerCase();

    return (
        user?.role === "admin" ||
        String(user?.email || "")
            .trim()
            .toLowerCase() ===
            adminEmail
    );
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
                        (Number(account.schoolGrade) === 13
                            ? "graduated"
                            : "enrolled"),
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
