const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(
    __dirname,
    "..",
    "config.env"
  ),
});

const {
  ConceptLesson,
} = require("../models/matthsModel");
const {
  loadCurriculum,
} = require("../services/curriculumService");

const lessonDefinitions = require(
  "./seeds/calculus1/limits-and-continuity"
);

function lessonKey(lesson) {
  return [
    lesson.curriculumId,
    lesson.courseId,
    lesson.unitId,
    lesson.conceptId,
  ].join("/");
}

function getCurriculumConceptIds() {
  const curriculum = loadCurriculum();
  const course = curriculum.courses.find(
    (item) => item.id === "calculus-1"
  );
  const unit = course?.units.find(
    (item) =>
      item.id === "limits-and-continuity"
  );

  if (!unit) {
    throw new Error(
      "교육과정 YAML에서 미적분Ⅰ 함수의 극한과 연속 단원을 찾을 수 없습니다."
    );
  }

  return new Set(
    unit.concepts.map((concept) => concept.id)
  );
}

function validateLessonDefinitions() {
  const curriculumConceptIds =
    getCurriculumConceptIds();
  const registeredKeys = new Set();

  for (const lesson of lessonDefinitions) {
    const key = lessonKey(lesson);

    if (registeredKeys.has(key)) {
      throw new Error(
        `중복된 ConceptLesson seed가 있습니다: ${key}`
      );
    }

    registeredKeys.add(key);

    if (
      !curriculumConceptIds.has(
        lesson.conceptId
      )
    ) {
      throw new Error(
        `교육과정 YAML에 없는 개념입니다: ${lesson.conceptId}`
      );
    }

    if (
      !lesson.content?.summary ||
      !lesson.content?.keyTakeaway ||
      !lesson.content?.steps?.length
    ) {
      throw new Error(
        `학습 콘텐츠가 완성되지 않았습니다: ${lesson.conceptId}`
      );
    }

    lesson.content.steps.forEach(
      (step, index) => {
        if (step.order !== index + 1) {
          throw new Error(
            `Step 순서가 올바르지 않습니다: ${lesson.conceptId}`
          );
        }
      }
    );
  }

  if (
    registeredKeys.size !==
    curriculumConceptIds.size
  ) {
    const registeredConceptIds = new Set(
      lessonDefinitions.map(
        (lesson) => lesson.conceptId
      )
    );
    const missingConceptIds = [
      ...curriculumConceptIds,
    ].filter(
      (conceptId) =>
        !registeredConceptIds.has(conceptId)
    );

    throw new Error(
      `seed가 없는 개념이 있습니다: ${missingConceptIds.join(
        ", "
      )}`
    );
  }
}

async function seedCalculus1LimitsAndContinuity() {
  validateLessonDefinitions();

  await ConceptLesson.bulkWrite(
    lessonDefinitions.map((lesson) => ({
      updateOne: {
        filter: {
          curriculumId: lesson.curriculumId,
          courseId: lesson.courseId,
          unitId: lesson.unitId,
          conceptId: lesson.conceptId,
        },
        update: {
          $set: {
            curriculumId:
              lesson.curriculumId,
            courseId: lesson.courseId,
            unitId: lesson.unitId,
            conceptId: lesson.conceptId,
            ...lesson.content,
          },
        },
        upsert: true,
      },
    }))
  );

  const savedLessons = await ConceptLesson.find({
    curriculumId: "kr-2022",
    courseId: "calculus-1",
    unitId: "limits-and-continuity",
    conceptId: {
      $in: lessonDefinitions.map(
        (lesson) => lesson.conceptId
      ),
    },
  })
    .select(
      "conceptId estimatedMinutes isPublished"
    )
    .sort({ conceptId: 1 })
    .lean();

  return savedLessons;
}

async function run() {
  await mongoose.connect(process.env.DB);

  try {
    const savedLessons =
      await seedCalculus1LimitsAndContinuity();

    console.log(
      "미적분Ⅰ 함수의 극한과 연속 seed 완료:",
      savedLessons
        .map((lesson) => lesson.conceptId)
        .join(", ")
    );
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch(async (error) => {
    console.error(error);

    if (mongoose.connection.readyState) {
      await mongoose.disconnect();
    }

    process.exit(1);
  });
}

module.exports = {
  lessonDefinitions,
  validateLessonDefinitions,
  seedCalculus1LimitsAndContinuity,
};
