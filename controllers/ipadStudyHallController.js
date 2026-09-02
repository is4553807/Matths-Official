const {
  getStudyHallAsset,
  getStudyHallContent,
  listStudyHall,
  saveStudyHallAnswers,
} = require("../services/studyHallService");
const {
  isPdfDownload,
  issuePersonalizedPdf,
} = require("../services/pdfWatermarkService");

const SCHEMA_VERSION = "STUDY_HALL_NATIVE_V1";

function noStore(res) {
  res.set("Cache-Control", "private, no-store");
}

function answerInput(body) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  if (Object.keys(source).some((key) => key !== "answers")) {
    const error = new Error("요청에 허용되지 않은 값이 포함되어 있습니다.");
    error.status = 400;
    error.code = "STUDY_HALL_REQUEST_INVALID";
    throw error;
  }
  if (!Array.isArray(source.answers) || source.answers.length > 500) {
    const error = new Error("답안 목록 형식을 확인해주세요.");
    error.status = 400;
    error.code = "STUDY_HALL_ANSWERS_INVALID";
    throw error;
  }
  const seen = new Set();
  const answers = source.answers.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      const error = new Error("답안 항목 형식을 확인해주세요.");
      error.status = 400;
      error.code = "STUDY_HALL_ANSWER_INVALID";
      throw error;
    }
    if (Object.keys(row).some((key) => key !== "number" && key !== "answer")) {
      const error = new Error("답안 항목에 허용되지 않은 값이 포함되어 있습니다.");
      error.status = 400;
      error.code = "STUDY_HALL_ANSWER_INVALID";
      throw error;
    }
    const number = Number(row.number);
    if (!Number.isInteger(number) || number < 1 || number > 500 || seen.has(number)) {
      const error = new Error("답안 문항 번호를 확인해주세요.");
      error.status = 400;
      error.code = "STUDY_HALL_ANSWER_NUMBER_INVALID";
      throw error;
    }
    seen.add(number);
    return {
      number,
      answer: String(row.answer || "").trim().slice(0, 100),
    };
  });
  return { answersJson: JSON.stringify(answers) };
}

exports.list = async (req, res, next) => {
  try {
    const hall = await listStudyHall({
      userId: req.apiUser._id,
      tab: req.query.tab,
    });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, hall });
  } catch (error) {
    return next(error);
  }
};

exports.detail = async (req, res, next) => {
  try {
    const content = await getStudyHallContent({
      contentId: req.params.contentId,
      userId: req.apiUser._id,
    });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, content });
  } catch (error) {
    return next(error);
  }
};

async function updateProgress(req, res, next, submit) {
  try {
    const content = await saveStudyHallAnswers({
      contentId: req.params.contentId,
      userId: req.apiUser._id,
      input: answerInput(req.body),
      submit,
    });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, content });
  } catch (error) {
    return next(error);
  }
}

exports.save = (req, res, next) => updateProgress(req, res, next, false);
exports.submit = (req, res, next) => updateProgress(req, res, next, true);

exports.download = async (req, res, next) => {
  try {
    const result = await getStudyHallAsset({
      contentId: req.params.contentId,
      assetId: req.params.assetId,
      userId: req.apiUser._id,
      admin: req.apiUser.role === "admin",
    });
    if (
      result.asset.kind !== "THUMBNAIL" &&
      isPdfDownload({
        mimeType: result.asset.mimeType,
        name: result.asset.originalName,
      })
    ) {
      const issued = await issuePersonalizedPdf({
        userId: req.apiUser._id,
        examId: result.examId,
        sourceType: "STUDY_HALL",
        sourceId: result.sourceId,
        assetId: result.assetId,
        originalName: result.asset.originalName,
        storageRecord: result.storageRecord,
      });
      const cleanup = () => issued.cleanup().catch(() => {});
      res.once("finish", cleanup);
      res.once("close", cleanup);
      res.type("application/pdf");
      res.set("Cache-Control", "private, no-store");
      res.set("X-Matths-Trace", issued.traceCode);
      return res.download(issued.filePath, issued.downloadName, (error) => {
        cleanup();
        if (error && !res.headersSent) return next(error);
        return undefined;
      });
    }
    noStore(res);
    return res.redirect(302, result.signedUrl);
  } catch (error) {
    return next(error);
  }
};
