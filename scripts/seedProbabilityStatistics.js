const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(__dirname, "..", "config.env"),
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

const rawLessonDefinitions = require(
  "./seeds/probabilityStatistics"
);

const lessonDefinitions = rawLessonDefinitions.map(
  (lesson) => {
    const generator = getProblemGenerator({
      courseId: lesson.courseId,
      unitId: lesson.unitId,
      conceptId: lesson.conceptId,
    });

    return {
      ...lesson,
      content: {
        ...lesson.content,
        playgroundKey: generator?.key || null,
        practice: {
          generatorKey: generator?.key || null,
          requiredDistinctTypes: 5,
        },
      },
    };
  }
);

function getCurriculumConceptMap() {
  const curriculum = loadCurriculum();
  const course = curriculum.courses.find(
    (item) =>
      item.id === "probability-statistics"
  );

  if (!course) {
    throw new Error(
      "교육과정 YAML에서 확률과 통계 과목을 찾을 수 없습니다."
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
    getCurriculumConceptMap();
  const registeredConceptIds = new Set();

  for (const lesson of lessonDefinitions) {
    const curriculumConcept =
      curriculumConcepts.get(lesson.conceptId);
    const generator = getProblemGenerator({
      courseId: lesson.courseId,
      unitId: lesson.unitId,
      conceptId: lesson.conceptId,
    });

    if (registeredConceptIds.has(lesson.conceptId)) {
      throw new Error(
        `중복된 확통 seed입니다: ${lesson.conceptId}`
      );
    }
    registeredConceptIds.add(lesson.conceptId);

    if (
      !curriculumConcept ||
      curriculumConcept.unitId !== lesson.unitId
    ) {
      throw new Error(
        `교육과정 경로가 올바르지 않습니다: ${lesson.conceptId}`
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
      !generator ||
      generator.key !==
        lesson.content.practice?.generatorKey ||
      generator.problemTypes?.length !== 10
    ) {
      throw new Error(
        `문제 생성기 연결이 올바르지 않습니다: ${lesson.conceptId}`
      );
    }

    lesson.content.steps.forEach((step, index) => {
      if (step.order !== index + 1) {
        throw new Error(
          `Step 순서가 올바르지 않습니다: ${lesson.conceptId}`
        );
      }
    });
  }

  const missingConceptIds = [
    ...curriculumConcepts.keys(),
  ].filter(
    (conceptId) =>
      !registeredConceptIds.has(conceptId)
  );

  if (missingConceptIds.length) {
    throw new Error(
      `seed가 없는 확통 개념이 있습니다: ${missingConceptIds.join(
        ", "
      )}`
    );
  }
}

async function seedProbabilityStatistics() {
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
            curriculumId: lesson.curriculumId,
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
    courseId: "probability-statistics",
  })
    .select(
      "unitId conceptId estimatedMinutes isPublished"
    )
    .sort({ unitId: 1, conceptId: 1 })
    .lean();
}

async function run() {
  await mongoose.connect(process.env.DB);
  try {
    const savedLessons =
      await seedProbabilityStatistics();
    console.log(
      `확률과 통계 seed 완료: ${savedLessons.length}개 개념`
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
  seedProbabilityStatistics,
};
