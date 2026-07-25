const {
    getKoreanDateKey,
    lifecycleSessionView,
    synchronizeUserLifecycle,
} = require("../services/userLifecycleService");

exports.isLoggedIn = async (req, res, next) => {
    if (req.session?.user) {
        try {
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

    return res.redirect("/main");
};
