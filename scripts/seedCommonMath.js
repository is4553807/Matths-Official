const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", "config.env") });

const { ConceptLesson } = require("../models/matthsModel");
const { loadCurriculum } = require("../services/curriculumService");
const { getProblemGenerator } = require("../services/problemGenerators");
const lessonDefinitions = require("./seeds/commonMath");

function validateDefinitions() {
  const curriculum = loadCurriculum();
  const expected = new Map(
    curriculum.courses
      .filter((course) => ["common-math-1", "common-math-2"].includes(course.id))
      .flatMap((course) => course.units.flatMap((unit) => unit.concepts.map((concept) => [
        `${course.id}/${unit.id}/${concept.id}`,
        concept.title,
      ])))
  );
  const seen = new Set();
  for (const lesson of lessonDefinitions) {
    const key = `${lesson.courseId}/${lesson.unitId}/${lesson.conceptId}`;
    if (!expected.has(key) || seen.has(key)) throw new Error(`공통수학 seed 경로 오류: ${key}`);
    seen.add(key);
    const generator = getProblemGenerator(lesson);
    if (!generator || generator.key !== lesson.content.practice.generatorKey || generator.problemTypes.length !== 10) {
      throw new Error(`공통수학 10유형 생성기 연결 오류: ${key}`);
    }
    if (lesson.content.steps.length < 6) throw new Error(`상세 설명 단계 부족: ${key}`);
  }
  const missing = [...expected.keys()].filter((key) => !seen.has(key));
  if (missing.length) throw new Error(`공통수학 seed 누락: ${missing.join(", ")}`);
  return true;
}

async function seedCommonMath() {
  validateDefinitions();
  await ConceptLesson.bulkWrite(lessonDefinitions.map((lesson) => ({
    updateOne: {
      filter: {
        curriculumId: lesson.curriculumId,
        courseId: lesson.courseId,
        unitId: lesson.unitId,
        conceptId: lesson.conceptId,
      },
      update: { $set: { ...lesson.content, curriculumId: lesson.curriculumId, courseId: lesson.courseId, unitId: lesson.unitId, conceptId: lesson.conceptId } },
      upsert: true,
    },
  })));
  return ConceptLesson.countDocuments({ curriculumId: "kr-2022", courseId: { $in: ["common-math-1", "common-math-2"] } });
}

async function run() {
  await mongoose.connect(process.env.DB);
  try {
    const count = await seedCommonMath();
    console.log(`공통수학 seed 완료: ${count}개 개념`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) run().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { validateDefinitions, seedCommonMath };
