const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

const {
  syncProblemTypeRegistry,
} = require("../services/problemTypeCatalogService");

async function main() {
  if (!process.env.DB) {
    throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  }
  await mongoose.connect(process.env.DB);
  const result = await syncProblemTypeRegistry({
    activateSourceChanges: process.argv.includes("--activate-source-changes"),
  });
  console.log(
    `Problem type catalog synced: total=${result.total}, new=${result.inserted.length}, updated=${result.updated.length}`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
