exports.isLoggedIn = (req, res, next) => {
    if (req.session?.user) {
        return next();
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