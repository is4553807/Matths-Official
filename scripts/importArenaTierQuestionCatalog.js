const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

const {
  syncProblemTypeRegistry,
} = require("../services/problemTypeCatalogService");
const {
  importAndActivateArenaTierCatalog,
} = require("../services/arenaTierQuestionCatalogService");

async function main() {
  const sourcePath = path.resolve(process.argv[2] || "");
  if (!process.argv[2]) {
    throw new Error("가져올 T1~T9 JSON 파일 경로가 필요합니다.");
  }
  if (!process.env.DB) {
    throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  }
  const sourceText = fs.readFileSync(sourcePath, "utf8");
  const raw = JSON.parse(sourceText);

  await mongoose.connect(process.env.DB);
  await syncProblemTypeRegistry({ activateSourceChanges: true });
  const created = await importAndActivateArenaTierCatalog({
    raw,
    sourceText,
    sourceFileName: path.basename(sourcePath),
  });

  console.log(
    [
      "Arena tier catalog activated",
      `code=${created.code}`,
      `status=${created.status}`,
      `types=${created.validationReport?.typeCount || 0}`,
      `tiers=${created.tierConfigurations?.length || 0}`,
      `references=${created.validationReport?.referenceQuestionCount || 0}`,
      `answers=${created.validationReport?.answeredReferenceQuestionCount || 0}`,
      `solutions=${created.validationReport?.solutionProcessReferenceCount || 0}`,
      `choices=${created.validationReport?.multipleChoiceReferenceCount || 0}`,
      `naturals=${created.validationReport?.naturalNumberReferenceCount || 0}`,
      `engines=${created.validationReport?.mappedEngineCount || 0}`,
      `contentHash=${created.contentHash}`,
    ].join(" ")
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
