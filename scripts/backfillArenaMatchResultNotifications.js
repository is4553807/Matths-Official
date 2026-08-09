const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const { notifyArenaMatchResult } = require("../services/arenaNotificationService");

function argumentValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || "";
}

async function main() {
  const matchId = argumentValue("match");
  const refreshExisting = process.argv.includes("--refresh-existing");
  if (!matchId) {
    throw new Error("사용법: --match=<ArenaMatch ID>를 지정해주세요.");
  }
  if (!mongoose.isValidObjectId(matchId)) {
    throw new Error("유효한 ArenaMatch ID가 아닙니다.");
  }
  if (!process.env.DB) {
    throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  }

  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
  });
  try {
    const notifications = await notifyArenaMatchResult({ matchId, refreshExisting });
    console.log(JSON.stringify({
      ok: true,
      matchId,
      refreshExisting,
      recipientCount: notifications.filter(Boolean).length,
      notifications: notifications.filter(Boolean).map((notification) => ({
        id: String(notification._id),
        userId: String(notification.userId),
        title: notification.title,
        message: notification.message,
        href: notification.href,
      })),
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
