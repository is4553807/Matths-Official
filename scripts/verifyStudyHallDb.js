const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

require("../models/matthsModel");
const { StudyHallContent, StudyHallProgress } = require("../models/studyHallModel");
const {
  archiveStudyHallContent,
  getStudyHallContent,
  listStudyHall,
  saveStudyHallAnswers,
  saveStudyHallContent,
} = require("../services/studyHallService");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function questions() {
  return Array.from({ length: 15 }, (_unused, index) => ({
    number: index + 1,
    stem: `DB 검증 문항 ${index + 1}`,
    choices: ["1", "2", "3", "4", "5"],
    correctAnswer: String((index % 5) + 1),
    explanation: `DB 검증 해설 ${index + 1}`,
  }));
}

async function run() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB);

  const User = mongoose.model("User");
  const user = await User.findOne({}).select("_id").lean();
  if (!user) throw new Error("실연결 검증에 사용할 기존 사용자 계정이 없습니다.");

  const testToken = `STUDY_HALL_DB_VERIFY_${Date.now()}`;
  let contentId = null;
  try {
    const baseInput = {
      contentType: "DAILY_HALF",
      series: "DB 검증",
      title: testToken,
      description: "자동 삭제되는 수험관 실연결 검증 콘텐츠",
      grade: "고3",
      subject: "수학",
      itemCount: 15,
      difficulty: "검증",
      timeLimitMinutes: 30,
      year: 2026,
      month: 8,
      week: 2,
      session: 3,
      sortOrder: 99999,
      questionsJson: JSON.stringify(questions()),
    };
    const draft = await saveStudyHallContent({
      input: { ...baseInput, status: "DRAFT" },
      files: {},
      adminUserId: user._id,
    });
    contentId = draft.id;
    assert(draft.status === "DRAFT", "초안 저장 상태가 올바르지 않습니다.");

    const published = await saveStudyHallContent({
      contentId,
      input: { ...baseInput, status: "PUBLISHED" },
      files: {},
      adminUserId: user._id,
    });
    assert(published.status === "PUBLISHED", "공개 전환이 저장되지 않았습니다.");

    const listing = await listStudyHall({ userId: user._id, tab: "DAILY_HALF" });
    assert(listing.items.some((item) => item.id === contentId), "공개 콘텐츠가 사용자 목록에 없습니다.");

    const beforeSubmit = await getStudyHallContent({ contentId, userId: user._id });
    assert(!Object.hasOwn(beforeSubmit.questions[0], "correctAnswer"), "제출 전 정답이 노출되었습니다.");

    const firstFive = questions().slice(0, 5).map((question) => ({ number: question.number, answer: question.correctAnswer }));
    const inProgress = await saveStudyHallAnswers({
      contentId,
      userId: user._id,
      input: { answersJson: JSON.stringify(firstFive) },
      submit: false,
    });
    assert(inProgress.progress.status === "IN_PROGRESS", "임시 저장 상태가 올바르지 않습니다.");
    assert(inProgress.progress.answeredCount === 5, "임시 저장 답안 수가 올바르지 않습니다.");

    const allAnswers = questions().map((question) => ({ number: question.number, answer: question.correctAnswer }));
    const submitted = await saveStudyHallAnswers({
      contentId,
      userId: user._id,
      input: { answersJson: JSON.stringify(allAnswers) },
      submit: true,
    });
    assert(submitted.progress.status === "SUBMITTED", "최종 제출 상태가 올바르지 않습니다.");
    assert(submitted.progress.correctCount === 15, "채점 결과가 올바르지 않습니다.");
    assert(submitted.progress.scorePercent === 100, "점수 계산이 올바르지 않습니다.");

    const afterSubmit = await getStudyHallContent({ contentId, userId: user._id });
    assert(afterSubmit.questions[0].correctAnswer === "1", "제출 후 정답이 열리지 않았습니다.");

    let duplicateBlocked = false;
    try {
      await saveStudyHallAnswers({
        contentId,
        userId: user._id,
        input: { answersJson: JSON.stringify(allAnswers) },
        submit: true,
      });
    } catch (error) {
      duplicateBlocked = Number(error.status) === 409;
    }
    assert(duplicateBlocked, "중복 최종 제출이 차단되지 않았습니다.");

    await archiveStudyHallContent(contentId, user._id);
    const hiddenListing = await listStudyHall({ userId: user._id, tab: "DAILY_HALF" });
    assert(!hiddenListing.items.some((item) => item.id === contentId), "보관 콘텐츠가 사용자 목록에 남아 있습니다.");

    console.log("Study Hall MongoDB E2E verified: draft, publish, list, save, score, duplicate block, archive.");
  } finally {
    if (contentId) {
      await StudyHallProgress.deleteMany({ contentId });
      await StudyHallContent.deleteMany({ _id: contentId });
    }
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
