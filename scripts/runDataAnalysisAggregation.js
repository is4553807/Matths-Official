const dotenv = require("dotenv");
const mongoose = require("mongoose");
const {
  getKstMonthKey,
  runMonthlyDataAnalysisAggregation,
} = require("../services/dataAnalysisAggregationService");

dotenv.config({ path: "./config.env" });

function requestedPeriod(argv = process.argv.slice(2)) {
  const explicit = argv.find((argument) => /^\d{4}-\d{2}$/.test(argument));
  return explicit || getKstMonthKey();
}

async function main() {
  if (!process.env.DB) {
    throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  }
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  const result = await runMonthlyDataAnalysisAggregation({
    periodKey: requestedPeriod(),
  });
  console.log(
    JSON.stringify({
      ok: true,
      periodKey: result.periodKey,
      observationCount: result.observationCount,
      sourceCounts: result.sourceCounts,
      writeResult: result.writeResult,
    })
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
