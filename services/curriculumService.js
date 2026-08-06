const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const CURRICULUM_DIRECTORY = path.resolve(
  __dirname,
  "..",
  "curriculum_folder"
);

const CATEGORY_DEFINITIONS = [
  {
    id: "common",
    title: "공통 과목",
    englishTitle: "COMMON",
    description: "고등학교 수학 학습의 공통 기반이 되는 필수 과목입니다.",
    order: 1,
  },
  {
    id: "general-elective",
    title: "일반 선택",
    englishTitle: "GENERAL ELECTIVE",
    description: "대학 학습과 진로의 기초가 되는 주요 선택 과목입니다.",
    order: 2,
  },
  {
    id: "career-elective",
    title: "진로 선택",
    englishTitle: "CAREER ELECTIVE",
    description: "관심 분야와 진로에 따라 깊이 있게 학습하는 과목입니다.",
    order: 3,
  },
  {
    id: "convergence-elective",
    title: "융합 선택",
    englishTitle: "CONVERGENCE ELECTIVE",
    description: "수학을 문화, 통계, 탐구 활동과 연결하는 과목입니다.",
    order: 4,
  },
];

const CATEGORY_BY_ID = new Map(
  CATEGORY_DEFINITIONS.map((category) => [category.id, category])
);

const COURSE_ORDER = new Map(
  [
    "common-math-1",
    "common-math-2",
    "algebra",
    "calculus-1",
    "probability-statistics",
    "calculus-2",
    "geometry",
    "economics-math",
    "ai-math",
    "vocational-math",
    "math-and-culture",
    "practical-statistics",
    "math-research-project",
  ].map((courseId, index) => [courseId, index + 1])
);

const AVAILABLE_COURSE_IDS = new Set([
  "common-math-1",
  "common-math-2",
  "algebra",
  "probability-statistics",
  "calculus-1",
]);

function isCourseAvailable(courseId) {
  return AVAILABLE_COURSE_IDS.has(String(courseId || ""));
}

function readCurriculumDocuments() {
  if (!fs.existsSync(CURRICULUM_DIRECTORY)) {
    throw new Error(
      `교육과정 폴더를 찾을 수 없습니다: ${CURRICULUM_DIRECTORY}`
    );
  }

  const fileNames = fs
    .readdirSync(CURRICULUM_DIRECTORY)
    .filter((fileName) => /^kr-2022-.*\.ya?ml$/i.test(fileName))
    .sort((left, right) => left.localeCompare(right, "en"));

  if (!fileNames.length) {
    throw new Error("불러올 2022 개정 수학과 교육과정 YAML이 없습니다.");
  }

  return fileNames.map((fileName) => {
    const filePath = path.join(CURRICULUM_DIRECTORY, fileName);

    try {
      const document = yaml.load(fs.readFileSync(filePath, "utf-8"));

      if (!document || !Array.isArray(document.courses)) {
        throw new Error("courses 배열이 없습니다.");
      }

      return { fileName, document };
    } catch (error) {
      throw new Error(
        `교육과정 YAML을 읽지 못했습니다 (${fileName}): ${error.message}`
      );
    }
  });
}

function resolveCategory(course, document) {
  if (CATEGORY_BY_ID.has(course.category)) {
    return CATEGORY_BY_ID.get(course.category);
  }

  const isCommonCourse =
    document.grade?.id === "high-school-1" ||
    String(course.id || "").startsWith("common-");

  return CATEGORY_BY_ID.get(
    isCommonCourse ? "common" : "general-elective"
  );
}

function getPlacementLabel(course, category) {
  if (category.id === "common" && Number.isFinite(Number(course.defaultSemester))) {
    return `${Number(course.defaultSemester)}학기 기본 순서`;
  }

  return "학교별 개설·편성";
}

function normalizeCourse(course, document, fileName) {
  if (!course?.id) {
    throw new Error(`${fileName}에 id가 없는 과목이 있습니다.`);
  }

  const category = resolveCategory(course, document);
  const recommendedGrades = Array.isArray(course.recommendedGrades)
    ? course.recommendedGrades
    : Array.isArray(document.grade?.recommendedGrades)
      ? document.grade.recommendedGrades
      : category.id === "common"
        ? [10]
        : [11, 12];

  const units = (Array.isArray(course.units) ? course.units : []).map(
    (unit, unitIndex) => {
      const concepts = Array.isArray(unit.concepts) ? unit.concepts : [];

      return {
        ...unit,
        order: Number(unit.order) || unitIndex + 1,
        concepts,
        conceptCount: concepts.length,
      };
    }
  );

  return {
    ...course,
    officialTitle: course.officialTitle || course.title || course.id,
    category: category.id,
    categoryTitle: category.title,
    categoryEnglishTitle: category.englishTitle,
    categoryDescription: category.description,
    categoryOrder: category.order,
    recommendedGrades,
    placementLabel: getPlacementLabel(course, category),
    conceptCount: units.reduce(
      (total, unit) => total + unit.concepts.length,
      0
    ),
    units,
    sourceFile: fileName,
    developmentLocked: !isCourseAvailable(course.id),
  };
}

function groupCoursesByCategory(courses) {
  return CATEGORY_DEFINITIONS.map((category) => ({
    ...category,
    courses: courses.filter((course) => course.category === category.id),
  })).filter((category) => category.courses.length > 0);
}

function loadCurriculum() {
  const documents = readCurriculumDocuments();
  const courseIds = new Set();
  const courses = [];

  for (const { fileName, document } of documents) {
    for (const rawCourse of document.courses) {
      const course = normalizeCourse(rawCourse, document, fileName);

      if (courseIds.has(course.id)) {
        throw new Error(`중복된 과목 id가 있습니다: ${course.id}`);
      }

      courseIds.add(course.id);
      courses.push(course);
    }
  }

  courses.sort((left, right) => {
    const categoryDifference = left.categoryOrder - right.categoryOrder;

    if (categoryDifference !== 0) {
      return categoryDifference;
    }

    const leftOrder = COURSE_ORDER.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = COURSE_ORDER.get(right.id) ?? Number.MAX_SAFE_INTEGER;

    return (
      leftOrder - rightOrder ||
      left.officialTitle.localeCompare(right.officialTitle, "ko")
    );
  });

  const baseDocument = documents[0].document;
  const categories = groupCoursesByCategory(courses);
  const totalUnits = courses.reduce(
    (total, course) => total + course.units.length,
    0
  );
  const totalConcepts = courses.reduce(
    (total, course) => total + course.conceptCount,
    0
  );

  return {
    schemaVersion: 1,
    curriculum: {
      ...(baseDocument.curriculum || {}),
      id: baseDocument.curriculum?.id || "kr-2022",
      title: baseDocument.curriculum?.title || "2022 개정 교육과정",
    },
    grade: {
      id: "high-school",
      title: "고등학교 수학 전 과정",
      levels: [
        { schoolGrade: 10, title: "고등학교 1학년", type: "common" },
        { schoolGrade: 11, title: "고등학교 2학년", type: "school-defined" },
        { schoolGrade: 12, title: "고등학교 3학년", type: "school-defined" },
        { schoolGrade: 13, title: "N수생", type: "school-defined" },
      ],
    },
    coursePlacementPolicy: {
      type: "school-defined",
      description:
        "공통수학1·2 이후 선택 과목의 실제 개설 학년과 학기는 학교 교육과정과 학생의 진로 선택에 따라 달라질 수 있습니다.",
    },
    categories,
    courses,
    catalogStats: {
      totalCategories: categories.length,
      totalCourses: courses.length,
      totalUnits,
      totalConcepts,
    },
    sourceFiles: documents.map(({ fileName }) => fileName),
  };
}

function conceptKey(courseId, unitId, conceptId) {
  return `${courseId}/${unitId}/${conceptId}`;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function normalizeCompletedIndexes(indexes, topicCount) {
  return [
    ...new Set(
      (Array.isArray(indexes) ? indexes : [])
        .map(Number)
        .filter(
          (index) =>
            Number.isInteger(index) &&
            index >= 0 &&
            index < topicCount
        )
    ),
  ].sort((left, right) => left - right);
}

function buildLearningViewModel(curriculumData, learningProgress = {}) {
  const progressByConcept = learningProgress.concepts || {};

  const courses = (curriculumData.courses || []).map((course) => {
    let courseProgressTotal = 0;
    let courseConceptTotal = 0;
    let courseCompleted = 0;
    let courseHasActivity = false;

    const units = (course.units || []).map((unit) => {
      let unitProgressTotal = 0;
      let unitCompleted = 0;

      const concepts = (unit.concepts || []).map((concept) => {
        const key = conceptKey(course.id, unit.id, concept.id);
        const hasSavedProgress = Object.prototype.hasOwnProperty.call(
          progressByConcept,
          key
        );
        const saved = progressByConcept[key] || {};
        const topics = Array.isArray(concept.topics) ? concept.topics : [];
        const completedTopicIndexes = normalizeCompletedIndexes(
          saved.completedTopicIndexes,
          topics.length
        );

        const completedTopics = completedTopicIndexes.length;
        const calculatedPercent = topics.length
          ? Math.round((completedTopics / topics.length) * 100)
          : 0;
        const percent = clamp(
          saved.percent === undefined ? calculatedPercent : saved.percent
        );
        const status =
          percent >= 100
            ? "completed"
            : percent > 0
              ? "in-progress"
              : "not-started";

        courseProgressTotal += percent;
        courseConceptTotal += 1;
        unitProgressTotal += percent;
        courseHasActivity ||= hasSavedProgress || percent > 0;

        if (percent >= 100) {
          courseCompleted += 1;
          unitCompleted += 1;
        }

        return {
          ...concept,
          topics,
          scopeNotes: Array.isArray(concept.scopeNotes)
            ? concept.scopeNotes
            : [],
          visualizationIdeas: Array.isArray(concept.visualizationIdeas)
            ? concept.visualizationIdeas
            : [],
          progress: percent,
          completedTopics,
          completedTopicIndexes,
          status,
          href: `/learn/${course.id}/${unit.id}/${concept.id}`,
        };
      });

      const progress = concepts.length
        ? Math.round(unitProgressTotal / concepts.length)
        : 0;
      const nextConcept =
        concepts.find((concept) => concept.progress < 100) || concepts[0];

      return {
        ...unit,
        concepts,
        progress,
        completedConcepts: unitCompleted,
        firstConceptHref: nextConcept ? nextConcept.href : "/my-learning",
      };
    });

    return {
      ...course,
      units,
      progress: courseConceptTotal
        ? Math.round(courseProgressTotal / courseConceptTotal)
        : 0,
      completedConcepts: courseCompleted,
      totalConcepts: courseConceptTotal,
      hasActivity: courseHasActivity,
    };
  });

  const allConcepts = courses
    .flatMap((course) => course.units)
    .flatMap((unit) => unit.concepts);

  /*
   * 학생이 실제로 선택하지 않은 선택 과목까지 전체 진도의 분모에 넣으면
   * 진도율이 왜곡됩니다. 따라서 공통 과목과 학습 기록이 생긴 선택 과목만
   * 개인 진도 계산 범위에 포함합니다.
   */
  const scopedCourses = courses.filter(
    (course) =>
      !course.developmentLocked &&
      (course.category === "common" || course.hasActivity)
  );
  const scopedConcepts = scopedCourses
    .flatMap((course) => course.units)
    .flatMap((unit) => unit.concepts);

  const totalProgress = scopedConcepts.reduce(
    (total, concept) => total + concept.progress,
    0
  );
  const completedConcepts = scopedConcepts.filter(
    (concept) => concept.progress >= 100
  ).length;

  const firstCurrentConcept =
    courses
      .filter((course) => !course.developmentLocked)
      .flatMap((course) => course.units)
      .flatMap((unit) => unit.concepts)
      .find(
      (concept) => concept.progress > 0 && concept.progress < 100
      ) ||
    courses
      .filter((course) => course.category === "common" && !course.developmentLocked)
      .flatMap((course) => course.units)
      .flatMap((unit) => unit.concepts)
      .find((concept) => concept.progress < 100) ||
    courses
      .filter((course) => !course.developmentLocked)
      .flatMap((course) => course.units)
      .flatMap((unit) => unit.concepts)
      .find((concept) => concept.progress < 100);

  return {
    curriculum: curriculumData.curriculum || {},
    grade: curriculumData.grade || {},
    coursePlacementPolicy: curriculumData.coursePlacementPolicy || {},
    categories: groupCoursesByCategory(courses),
    courses,
    catalogStats: curriculumData.catalogStats || {},
    catalogCompletedConcepts: allConcepts.filter(
      (concept) => concept.progress >= 100
    ).length,
    totalConcepts: scopedConcepts.length,
    completedConcepts,
    overallProgress: scopedConcepts.length
      ? Math.round(totalProgress / scopedConcepts.length)
      : 0,
    activeCourseCount: courses.filter((course) => course.hasActivity).length,
    continueConcept: firstCurrentConcept || null,
    continueHref: firstCurrentConcept
      ? firstCurrentConcept.href
      : "/log-curriculum",
  };
}

function findCurriculumConcept(curriculumData, courseId, unitId, conceptId) {
  const course = (curriculumData.courses || []).find(
    (item) => item.id === courseId
  );
  const unit = course?.units.find((item) => item.id === unitId);
  const concept = unit?.concepts.find((item) => item.id === conceptId);

  if (!course || !unit || !concept) return null;
  return { course, unit, concept };
}

function findUnitView(learningData, courseId, unitId, conceptId) {
  const course = learningData.courses.find((item) => item.id === courseId);
  if (!course) return null;

  const unit = course.units.find((item) => item.id === unitId);
  if (!unit || !unit.concepts.length) return null;

  const selectedConcept =
    unit.concepts.find((item) => item.id === conceptId) ||
    unit.concepts.find((item) => item.progress < 100) ||
    unit.concepts[0];

  const allConcepts = course.units.flatMap((courseUnit) =>
    courseUnit.concepts.map((concept) => ({ concept, unit: courseUnit }))
  );
  const selectedIndex = allConcepts.findIndex(
    (item) => item.concept.id === selectedConcept.id
  );

  return {
    course,
    unit,
    selectedConcept,
    previous: selectedIndex > 0 ? allConcepts[selectedIndex - 1] : null,
    next:
      selectedIndex < allConcepts.length - 1
        ? allConcepts[selectedIndex + 1]
        : null,
  };
}

module.exports = {
  loadCurriculum,
  conceptKey,
  buildLearningViewModel,
  findCurriculumConcept,
  findUnitView,
  isCourseAvailable,
};
