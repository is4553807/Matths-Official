const mongoose = require("mongoose");
const dotenv = require("dotenv");
const {
  buildArenaProblemPackDraft,
  saveArenaProblemPack,
  sealArenaProblemPackDraft,
} = require("../services/arenaProblemPackService");

dotenv.config({ path: "./config.env" });

function argumentsByName(argv) {
  const values = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.add(token.slice(2));
      continue;
    }
    values.set(token.slice(2), next);
    index += 1;
  }
  return { values, flags };
}

async function run() {
  const { values, flags } =
    argumentsByName(process.argv.slice(2));
  const version = values.get("version");
  const timeLimitMinutes = values.get(
    "time-minutes"
  );
  const scoringVersion = values.get(
    "scoring-version"
  );

  if (
    !version ||
    !timeLimitMinutes ||
    !scoringVersion
  ) {
    throw new Error(
      "사용법: node scripts/createArenaProblemPack.js --version SUB-NORMAL-2026-001 --time-minutes <확정값> --scoring-version <확정코드> [--display-name 이름] [--available-from ISO] [--available-until ISO] [--seal --review-confirmed --reviewer-user-id 운영자ID]"
    );
  }
  if (
    flags.has("seal") &&
    (
      !flags.has("review-confirmed") ||
      !values.get("reviewer-user-id")
    )
  ) {
    throw new Error(
      "봉인하려면 문항·정답·배점·제한 시간·채점 정책을 운영자가 직접 확인한 뒤 --review-confirmed와 --reviewer-user-id를 함께 입력해야 합니다."
    );
  }
  if (!process.env.DB) {
    throw new Error(
      "config.env의 DB 연결 정보를 확인해주세요."
    );
  }

  const draft = buildArenaProblemPackDraft({
    version,
    displayName:
      values.get("display-name") || version,
    timeLimitMinutes,
    scoringVersion,
    availableFrom:
      values.get("available-from") ||
      new Date(),
    availableUntil:
      values.get("available-until") || null,
  });
  const definition = flags.has("seal")
    ? sealArenaProblemPackDraft(draft, {
        sealedBy: values.get(
          "reviewer-user-id"
        ),
      })
    : draft;

  await mongoose.connect(process.env.DB);
  const saved = await saveArenaProblemPack(
    definition
  );
  console.log(
    `${saved.version} 경기 문제 팩을 ${
      saved.status === "SEALED"
        ? "검토 확인 후 봉인"
        : "초안 저장"
    }했습니다.`
  );
}

run()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
