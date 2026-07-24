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
const {
  getProblemGenerator,
} = require("../services/problemGenerators");

const lessonDefinitions = require(
  "./seeds/algebra"
);

function lessonKey(lesson) {
  return [
    lesson.curriculumId,
    lesson.courseId,
    lesson.unitId,
    lesson.conceptId,
  ].join("/");
}

function getAlgebraConceptMap() {
  const curriculum = loadCurriculum();
  const course = curriculum.courses.find(
    (item) => item.id === "algebra"
  );

  if (!course) {
    throw new Error(
      "교육과정 YAML에서 대수 과목을 찾을 수 없습니다."
    );
  }

  return new Map(
    course.units.flatMap((unit) =>
      unit.concepts.map((concept) => [
        concept.id,
        {
          unitId: unit.id,
          title: concept.title,
        },
      ])
    )
  );
}

function validateLessonDefinitions() {
  const curriculumConcepts =
    getAlgebraConceptMap();
  const registeredKeys = new Set();
  const registeredConceptIds = new Set();

  for (const lesson of lessonDefinitions) {
    const key = lessonKey(lesson);
    const curriculumConcept =
      curriculumConcepts.get(
        lesson.conceptId
      );

    if (registeredKeys.has(key)) {
      throw new Error(
        `중복된 ConceptLesson seed가 있습니다: ${key}`
      );
    }

    registeredKeys.add(key);
    registeredConceptIds.add(
      lesson.conceptId
    );

    if (!curriculumConcept) {
      throw new Error(
        `교육과정 YAML에 없는 개념입니다: ${lesson.conceptId}`
      );
    }

    if (
      lesson.curriculumId !== "kr-2022" ||
      lesson.courseId !== "algebra" ||
      lesson.unitId !==
        curriculumConcept.unitId
    ) {
      throw new Error(
        `교육과정 경로가 올바르지 않습니다: ${key}`
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

    if (
      !lesson.content.playgroundKey
    ) {
      throw new Error(
        `수학 놀이터 키가 없습니다: ${lesson.conceptId}`
      );
    }

    const generator = getProblemGenerator({
      courseId: lesson.courseId,
      unitId: lesson.unitId,
      conceptId: lesson.conceptId,
    });

    if (
      !generator ||
      generator.key !==
        lesson.content.practice?.generatorKey ||
      generator.problemTypes?.length !== 10
    ) {
      throw new Error(
        `문제 생성기 연결이 올바르지 않습니다: ${lesson.conceptId}`
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

  const missingConceptIds = [
    ...curriculumConcepts.keys(),
  ].filter(
    (conceptId) =>
      !registeredConceptIds.has(conceptId)
  );

  if (missingConceptIds.length) {
    throw new Error(
      `seed가 없는 대수 개념이 있습니다: ${missingConceptIds.join(
        ", "
      )}`
    );
  }
}

async function seedAlgebra() {
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

  return ConceptLesson.find({
    curriculumId: "kr-2022",
    courseId: "algebra",
    conceptId: {
      $in: lessonDefinitions.map(
        (lesson) => lesson.conceptId
      ),
    },
  })
    .select(
      "unitId conceptId estimatedMinutes isPublished"
    )
    .sort({
      unitId: 1,
      conceptId: 1,
    })
    .lean();
}

async function run() {
  await mongoose.connect(process.env.DB);

  try {
    const savedLessons =
      await seedAlgebra();

    console.log(
      `대수 seed 완료: ${savedLessons.length}개 개념`
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
  seedAlgebra,
};
