const mongoose = require("mongoose");

const { User } = require("../models/matthsModel");
const { ensureArenaNotification } = require("../services/arenaNotificationService");

async function main() {
  await mongoose.connect(process.env.DB);
  const username = String(process.argv[2] || "").trim();
  const suffix = String(process.argv[3] || Date.now());
  const user = await User.findOne({ name: username }).select("_id email name").lean();
  if (!user) throw new Error(`감사 계정을 찾을 수 없습니다: ${username}`);

  const notification = await ensureArenaNotification({
    user,
    dedupeKey: `audit-mailbox-regression:${username}:${suffix}`,
    title: "우편함 읽음 수 회귀 검증",
    message: "상세 페이지를 여는 즉시 상단 미읽음 수가 줄어드는지 검증하는 격리 감사 알림입니다.",
    href: "/goat-arena/mailbox",
    sourceType: "AuditRegression",
    kind: "system",
    tone: "info",
  });
  console.log(JSON.stringify({ id: String(notification._id), username }));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
