const mongoose = require("mongoose");

const { seedCommonMath } = require("../scripts/seedCommonMath");
const { seedAlgebra } = require("../scripts/seedAlgebra");
const { seedCalculus1 } = require("../scripts/seedCalculus1");
const {
  seedProbabilityStatistics,
} = require("../scripts/seedProbabilityStatistics");

async function run() {
  if (!String(process.env.DB || "").includes("matths_audit_zero_assumption_20260815")) {
    throw new Error("학습 콘텐츠 seed는 격리 감사 DB에서만 실행할 수 있습니다.");
  }

  await mongoose.connect(process.env.DB);

  try {
    const commonMathCount = await seedCommonMath();
    const algebra = await seedAlgebra();
    const calculus = await seedCalculus1();
    const probability = await seedProbabilityStatistics();

    console.log(
      JSON.stringify({
        database: mongoose.connection.name,
        commonMath: commonMathCount,
        algebra: algebra.length,
        calculus1: calculus.length,
        probabilityStatistics: probability.length,
      })
    );
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
