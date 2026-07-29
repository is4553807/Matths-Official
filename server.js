const express = require('express');
const server = express();
const path = require('path');
const session = require('express-session');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({path: './config.env'});
const {
    getCoachView,
} = require("./services/coachMessageService");

server.use(express.static("public"));
server.set('view engine', 'ejs');
server.use(express.urlencoded({extended:true}));
server.use(express.json());

const secret = process.env.SECRET;
server.use(session({
    secret: secret,
    resave: false,
    saveUninitialized: false
}));
server.use((req, res, next) => {
    res.locals.user = req.session?.user || null;
    res.locals.coach = getCoachView({
        mode:
            req.session?.user?.preferences
                ?.coachMode,
        situation: "unanswered",
        seed:
            req.session?.user?.id ||
            req.sessionID,
    });
    next();
});

const maathsRoutes = require('./routes/matths-routes');
const apiRoutes = require("./routes/api-routes");

server.use("/api/v1", apiRoutes);
server.use("/", maathsRoutes);

server.use((error, req, res, next) => {
    console.error(error);

    const status = Number(error.status) || 500;

    if (req.originalUrl.startsWith("/api/")) {
        return res.status(status).json({
            message:
                status >= 500
                    ? "서버에서 요청을 처리하지 못했습니다."
                    : error.message,
        });
    }

    return res.status(status).send(
        status >= 500
            ? "서버 오류가 발생했습니다."
            : error.message
    );
});

async function connectDB() {
    try {
        await mongoose.connect(process.env.DB);
        console.log("MongoDB Connected Successfully");

        const {
            refreshCommunityCoachMessages,
        } = require("./services/coachSuggestionService");
        await refreshCommunityCoachMessages();

        const {
            startPrivateMockExamScheduler,
        } = require("./services/privateMockExamService");
        startPrivateMockExamScheduler();
    } catch (error) {
        console.error("MongoDB Connection Failed:", error);
        process.exit(1);
    }
};

function startServer() {
    const port =
        Number(process.env.PORT) || 8000;
    const hostname =
        process.env.HOST || "0.0.0.0";

    server.listen(port, hostname, () => {
        console.log(
            `Server running at http://${hostname}:${port}/`
        );
    })
}

connectDB().then(startServer);
