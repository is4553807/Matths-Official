const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

const {
  seedFirstMonthCatalog,
} = require("../services/dataAnalysisService");

async function main() {
  if (!process.env.DB) {
    throw new Error(
      "config.env의 DB 연결 문자열이 필요합니다."
    );
  }
  await mongoose.connect(process.env.DB);
  const result = await seedFirstMonthCatalog();
  console.log(
    `dataAnalysis 카탈로그 반영 완료: ${
      result?.upsertedCount || 0
    }개 추가, ${
      result?.modifiedCount || 0
    }개 수정`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) {
      await mongoose.disconnect();
    }
  });

