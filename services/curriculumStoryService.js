"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildCurriculumMotionLesson,
} = require("./curriculumMotionLessonService");

const CONTENT_DIRECTORY = path.resolve(__dirname, "..", "content_folder");
const POLICY_PATH = path.join(CONTENT_DIRECTORY, "curriculum-story-policy.json");
const INDEX_PATH = path.join(CONTENT_DIRECTORY, "curriculum-stories-index.json");

const GENERIC_COPY_PATTERNS = Object.freeze([
  /핵심 의미와 원리/,
  /적용과 문제 해결/,
  /개념의 정의를 이해/,
  /핵심 개념을 확인/,
  /차근차근 살펴/,
  /그림과 수식을 연결해 핵심 원리를 확인/,
]);
const NUMBERED_SCREEN_COPY_PATTERN =
  /^\s*(?:(?:step|단계)\s*\d+|\d+\s*(?:단계|번째)|(?:첫째|둘째|셋째|넷째|다섯째)[,.])/iu;
const STUDIO_TAG_PATTERN = /\[([^\]\n]{1,40})\]/gu;
const STUDENT_STUDIO_TAG_PATTERN = /\[[^\]\n]{1,40}\]/u;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

function stripStudioTags(value) {
  return normalizeWhitespace(String(value || "").replace(STUDIO_TAG_PATTERN, " "));
}

function studioTags(value) {
  return [...String(value || "").matchAll(STUDIO_TAG_PATTERN)].map(
    (match) => match[1].trim(),
  );
}

function compileStudioScript(studioScript, policy = getCurriculumStoryCatalog().policy) {
  const aliases = policy?.providerPolicy?.studioTagAliases || {};
  return String(studioScript || "").replace(STUDIO_TAG_PATTERN, (_match, rawAlias) => {
    const alias = rawAlias.trim();
    const providerTag = aliases[alias];
    if (!providerTag) throw new Error(`지원하지 않는 studio 편집 태그입니다: [${alias}]`);
    return `[${providerTag}]`;
  });
}

function storyKey(courseId, unitId, conceptId) {
  return [courseId, unitId, conceptId].map((value) => String(value || "").trim()).join("/");
}

function splitOversizeChunk(text, maximumCharacters) {
  const chunks = [];
  let remaining = normalizeWhitespace(text);

  while (remaining.length > maximumCharacters) {
    const window = remaining.slice(0, maximumCharacters + 1);
    const preferredBreak = Math.max(
      window.lastIndexOf(", "),
      window.lastIndexOf("; "),
      window.lastIndexOf(" "),
    );
    const breakIndex = preferredBreak >= Math.floor(maximumCharacters * 0.55)
      ? preferredBreak + 1
      : maximumCharacters;
    chunks.push(remaining.slice(0, breakIndex).trim());
    remaining = remaining.slice(breakIndex).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitNarrationIntoChunks(text, maximumCharacters = 180) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  let sentences;
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("ko", { granularity: "sentence" });
    sentences = [...segmenter.segment(normalized)].map(({ segment }) => segment.trim());
  } else {
    sentences = normalized.match(/[^.!?。！？…]+(?:[.!?。！？]+|…+|$)/gu) || [normalized];
  }

  return sentences
    .filter(Boolean)
    .flatMap((sentence) => splitOversizeChunk(sentence, maximumCharacters));
}

function validateText(label, value, issues, { minimum = 1, maximum = 2000 } = {}) {
  const text = normalizeWhitespace(value);
  if (text.length < minimum || text.length > maximum) {
    issues.push(`${label} 길이는 ${minimum}~${maximum}자여야 합니다.`);
  }
  return text;
}

const MOTION_MODES = new Set(["equation", "blocks", "graph", "geometry", "plot"]);
const MOTION_ACTIONS = new Set(["place", "group", "point", "highlight", "transform", "verify"]);

function validateSceneMotion(motion, prefix, issues) {
  if (motion === undefined) return;
  if (!motion || typeof motion !== "object" || Array.isArray(motion)) {
    issues.push(`${prefix}.motion은 객체여야 합니다.`);
    return;
  }
  if (motion.version !== 1) issues.push(`${prefix}.motion.version은 1이어야 합니다.`);
  if (!MOTION_MODES.has(motion.mode)) issues.push(`${prefix}.motion.mode가 지원 범위가 아닙니다.`);

  const studentCopy = [
    validateText(`${prefix}.motion.focus`, motion.focus, issues, { minimum: 2, maximum: 48 }),
    validateText(`${prefix}.motion.instruction`, motion.instruction, issues, { minimum: 15, maximum: 140 }),
    validateText(`${prefix}.motion.mild.explanation`, motion.mild?.explanation, issues, { minimum: 30, maximum: 260 }),
    validateText(`${prefix}.motion.spicy.explanation`, motion.spicy?.explanation, issues, { minimum: 25, maximum: 220 }),
    validateText(`${prefix}.motion.check.prompt`, motion.check?.prompt, issues, { minimum: 12, maximum: 110 }),
    validateText(`${prefix}.motion.check.correctFeedback`, motion.check?.correctFeedback, issues, { minimum: 12, maximum: 180 }),
    validateText(`${prefix}.motion.check.retryFeedback`, motion.check?.retryFeedback, issues, { minimum: 12, maximum: 200 }),
  ];

  const beats = Array.isArray(motion.beats) ? motion.beats : [];
  if (beats.length < 3 || beats.length > 5) {
    issues.push(`${prefix}.motion.beats는 3~5개여야 합니다.`);
  }
  const beatIDs = new Set();
  beats.forEach((beat, beatIndex) => {
    const beatPrefix = `${prefix}.motion.beats[${beatIndex}]`;
    const id = validateText(`${beatPrefix}.id`, beat?.id, issues, { minimum: 2, maximum: 50 });
    if (beatIDs.has(id)) issues.push(`${beatPrefix}.id가 중복입니다.`);
    beatIDs.add(id);
    if (!MOTION_ACTIONS.has(beat?.action)) issues.push(`${beatPrefix}.action이 지원 범위가 아닙니다.`);
    studentCopy.push(
      validateText(`${beatPrefix}.target`, beat?.target, issues, { minimum: 1, maximum: 60 }),
      validateText(`${beatPrefix}.expression`, beat?.expression, issues, { minimum: 1, maximum: 110 }),
      validateText(`${beatPrefix}.caption`, beat?.caption, issues, { minimum: 12, maximum: 150 }),
    );
    if (beat?.result !== undefined) {
      studentCopy.push(validateText(`${beatPrefix}.result`, beat.result, issues, { minimum: 1, maximum: 110 }));
    }
    if (!Number.isInteger(beat?.durationMs) || beat.durationMs < 650 || beat.durationMs > 5000) {
      issues.push(`${beatPrefix}.durationMs는 650~5000 정수여야 합니다.`);
    }
  });

  const choices = Array.isArray(motion.check?.choices) ? motion.check.choices : [];
  if (choices.length !== 3) issues.push(`${prefix}.motion.check.choices는 정확히 3개여야 합니다.`);
  choices.forEach((choice, choiceIndex) => {
    studentCopy.push(validateText(
      `${prefix}.motion.check.choices[${choiceIndex}]`,
      choice,
      issues,
      { minimum: 4, maximum: 100 },
    ));
  });
  if (
    !Number.isInteger(motion.check?.answerIndex)
    || motion.check.answerIndex < 0
    || motion.check.answerIndex >= choices.length
  ) {
    issues.push(`${prefix}.motion.check.answerIndex가 선택지 범위를 벗어났습니다.`);
  }
  if (studentCopy.some((value) => STUDENT_STUDIO_TAG_PATTERN.test(value))) {
    issues.push(`${prefix}.motion 학생 문구에 studio 태그가 있습니다.`);
  }
}

function validateStory(story, shardCourseId, policy) {
  const issues = [];
  const key = storyKey(story?.courseId, story?.unitId, story?.conceptId);
  const quality = policy.qualityPolicy;
  const allowedTags = new Set(Object.keys(policy.providerPolicy.studioTagAliases || {}));

  if (!story || typeof story !== "object" || Array.isArray(story)) {
    return { key, issues: ["story가 객체가 아닙니다."] };
  }
  if (story.courseId !== shardCourseId) {
    issues.push(`courseId가 shard(${shardCourseId})와 다릅니다.`);
  }
  for (const field of ["courseId", "unitId", "conceptId"]) {
    if (!normalizeWhitespace(story[field])) issues.push(`${field}가 비어 있습니다.`);
  }
  if (!["draft", "published"].includes(story.status)) {
    issues.push("status는 draft 또는 published여야 합니다.");
  }
  if (!Number.isInteger(story.revision) || story.revision < 1) {
    issues.push("revision은 1 이상의 정수여야 합니다.");
  }
  if (
    !Number.isInteger(story.estimatedSeconds)
    || story.estimatedSeconds < quality.minimumEstimatedSeconds
    || story.estimatedSeconds > quality.maximumEstimatedSeconds
  ) {
    issues.push(
      `estimatedSeconds는 ${quality.minimumEstimatedSeconds}~${quality.maximumEstimatedSeconds}초여야 합니다.`,
    );
  }

  const title = validateText("title", story.title, issues, { minimum: 8, maximum: 80 });
  const openingQuestion = validateText("openingQuestion", story.openingQuestion, issues, {
      minimum: 12,
      maximum: 100,
    });
  const screenCopy = [title, openingQuestion];
  if ([title, openingQuestion].some((value) => STUDENT_STUDIO_TAG_PATTERN.test(value))) {
    issues.push("학생 projection 상단 문구에 studio 태그가 있습니다.");
  }
  if (!/[?？]$/u.test(normalizeWhitespace(story.openingQuestion))) {
    issues.push("openingQuestion은 질문형 문장이어야 합니다.");
  }
  validateText("source.standardCode", story.source?.standardCode, issues, {
    minimum: 4,
    maximum: 40,
  });
  validateText("source.basis", story.source?.basis, issues, {
    minimum: 20,
    maximum: 300,
  });

  const scenes = Array.isArray(story.scenes) ? story.scenes : [];
  if (scenes.length < quality.minimumScenes || scenes.length > quality.maximumScenes) {
    issues.push(`scene은 ${quality.minimumScenes}~${quality.maximumScenes}개여야 합니다.`);
  }

  const seenSceneIds = new Set();
  const seenKinds = new Set();
  let narrationCharacters = 0;

  scenes.forEach((scene, index) => {
    const prefix = `scenes[${index}]`;
    const id = normalizeWhitespace(scene?.id);
    if (!id || seenSceneIds.has(id)) issues.push(`${prefix}.id가 비었거나 중복입니다.`);
    seenSceneIds.add(id);
    seenKinds.add(scene?.kind);

    const title = validateText(`${prefix}.title`, scene?.title, issues, {
      minimum: 6,
      maximum: 70,
    });
    const subtitle = validateText(`${prefix}.subtitle`, scene?.subtitle, issues, {
      minimum: 15,
      maximum: 100,
    });
    const narration = validateText(`${prefix}.narration`, scene?.narration, issues, {
      minimum: 240,
      maximum: 620,
    });
    const studioScript = validateText(`${prefix}.studioScript`, scene?.studioScript, issues, {
      minimum: 245,
      maximum: 700,
    });
    narrationCharacters += narration.length;
    screenCopy.push(title, subtitle);

    if ([title, subtitle, narration].some((value) => STUDENT_STUDIO_TAG_PATTERN.test(value))) {
      issues.push(`${prefix} 학생 화면 문구에 studio 태그가 있습니다.`);
    }

    const tags = studioTags(studioScript);
    if (!tags.length) issues.push(`${prefix}.studioScript에 감정 태그가 없습니다.`);
    for (const tag of tags) {
      if (!allowedTags.has(tag)) issues.push(`${prefix}.studioScript에 허용되지 않은 태그 [${tag}]가 있습니다.`);
    }
    if (stripStudioTags(studioScript) !== normalizeWhitespace(narration)) {
      issues.push(`${prefix}.studioScript는 태그를 빼면 narration과 같아야 합니다.`);
    }

    validateSceneMotion(scene?.motion, prefix, issues);

    const chunks = splitNarrationIntoChunks(
      narration,
      quality.maximumSpeechChunkCharacters,
    );
    if (!chunks.length || chunks.some((chunk) => chunk.length > quality.maximumSpeechChunkCharacters)) {
      issues.push(`${prefix}.narration을 안전한 문장 chunk로 나눌 수 없습니다.`);
    }
  });

  for (const requiredKind of quality.requiredSceneKinds) {
    if (!seenKinds.has(requiredKind)) issues.push(`필수 scene kind ${requiredKind}가 없습니다.`);
  }
  if (
    narrationCharacters < quality.minimumNarrationCharacters
    || narrationCharacters > quality.maximumNarrationCharacters
  ) {
    issues.push(
      `전체 narration은 ${quality.minimumNarrationCharacters}~${quality.maximumNarrationCharacters}자여야 합니다.`,
    );
  }

  for (const copy of screenCopy) {
    if (NUMBERED_SCREEN_COPY_PATTERN.test(copy)) {
      issues.push(`교과서식 번호 나열 문구를 사용할 수 없습니다: ${copy}`);
    }
    for (const pattern of GENERIC_COPY_PATTERNS) {
      if (pattern.test(copy)) issues.push(`상투적인 자동 문구를 사용할 수 없습니다: ${copy}`);
    }
  }

  return { key, issues: [...new Set(issues)] };
}

function validateStoryCurriculumAuthority(story, canonicalConcept) {
  if (!canonicalConcept) {
    return ["현재 2022 개정 커리큘럼에 없는 course/unit/concept 조합입니다."];
  }

  const issues = [];
  const expectedStandardCode = normalizeWhitespace(canonicalConcept.standardCode);
  const actualStandardCode = normalizeWhitespace(story?.source?.standardCode);
  if (expectedStandardCode && actualStandardCode !== expectedStandardCode) {
    issues.push(
      `source.standardCode가 커리큘럼 정본과 다릅니다: ${actualStandardCode || "비어 있음"}`,
    );
  }
  return issues;
}

function loadPolicy() {
  const policy = readJson(POLICY_PATH);
  if (policy.schemaVersion !== "MATTHS_CURRICULUM_STORY_V1") {
    throw new Error("지원하지 않는 curriculum story policy입니다.");
  }
  return policy;
}

function loadCatalogFromDisk() {
  const policy = loadPolicy();
  const index = readJson(INDEX_PATH);
  const { loadCurriculum } = require("./curriculumService");
  const curriculum = loadCurriculum();
  const canonicalConceptByKey = new Map();
  for (const course of curriculum.courses || []) {
    for (const unit of course.units || []) {
      for (const concept of unit.concepts || []) {
        canonicalConceptByKey.set(storyKey(course.id, unit.id, concept.id), concept);
      }
    }
  }
  const catalogIssues = [];
  const issuesByKey = new Map();
  const rawStoryByKey = new Map();
  const publishedStoryByKey = new Map();
  const seenScreenCopy = new Map();
  const shardByCourse = new Map((index.shards || []).map((shard) => [shard.courseId, shard]));

  if (index.schemaVersion !== policy.schemaVersion || index.curriculumId !== policy.curriculumId) {
    throw new Error("curriculum story index와 policy 버전이 다릅니다.");
  }

  for (const courseId of policy.courseIds) {
    const shardIndex = shardByCourse.get(courseId);
    if (!shardIndex) {
      catalogIssues.push(`${courseId}: generated index에 shard가 없습니다.`);
      continue;
    }

    const shardPath = path.resolve(CONTENT_DIRECTORY, shardIndex.file);
    if (!shardPath.startsWith(`${CONTENT_DIRECTORY}${path.sep}`)) {
      catalogIssues.push(`${courseId}: shard 경로가 content_folder 밖을 가리킵니다.`);
      continue;
    }

    let raw;
    let shard;
    try {
      raw = fs.readFileSync(shardPath, "utf8");
      if (sha256(raw) !== shardIndex.sha256) {
        throw new Error("SHA-256이 generated index와 다릅니다.");
      }
      shard = JSON.parse(raw);
    } catch (error) {
      catalogIssues.push(`${courseId}: ${error.message}`);
      continue;
    }

    if (
      shard.schemaVersion !== policy.schemaVersion
      || shard.curriculumId !== policy.curriculumId
      || shard.courseId !== courseId
      || !Array.isArray(shard.stories)
    ) {
      catalogIssues.push(`${courseId}: shard 메타데이터가 policy와 다릅니다.`);
      continue;
    }

    for (const story of shard.stories) {
      const result = validateStory(story, courseId, policy);
      const issues = [
        ...result.issues,
        ...validateStoryCurriculumAuthority(
          story,
          canonicalConceptByKey.get(result.key),
        ),
      ];
      if (rawStoryByKey.has(result.key)) issues.push("concept story key가 중복입니다.");

      for (const scene of story.scenes || []) {
        for (const [field, copy] of [["title", scene.title], ["subtitle", scene.subtitle]]) {
          const fingerprint = normalizeWhitespace(copy).toLocaleLowerCase("ko");
          const previous = seenScreenCopy.get(`${field}:${fingerprint}`);
          if (previous && previous !== result.key) {
            issues.push(`다른 개념과 ${field} 문구가 완전히 같습니다: ${previous}`);
          } else if (fingerprint) {
            seenScreenCopy.set(`${field}:${fingerprint}`, result.key);
          }
        }
      }

      rawStoryByKey.set(result.key, story);
      if (issues.length) issuesByKey.set(result.key, [...new Set(issues)]);
      if (story.status === "published" && !issues.length) {
        publishedStoryByKey.set(result.key, story);
      }
    }
  }

  return Object.freeze({
    policy,
    index,
    catalogIssues: Object.freeze(catalogIssues),
    issuesByKey,
    rawStoryByKey,
    publishedStoryByKey,
  });
}

let catalogCache;

function getCurriculumStoryCatalog({ reload = false } = {}) {
  if (!catalogCache || reload) catalogCache = loadCatalogFromDisk();
  return catalogCache;
}

function getPublishedCurriculumStory({ courseId, unitId, conceptId }) {
  return getCurriculumStoryCatalog().publishedStoryByKey.get(
    storyKey(courseId, unitId, conceptId),
  ) || null;
}

function resolveStudentCurriculumStory({
  courseId,
  unitId,
  conceptId,
  visualizationIdeas = [],
}) {
  try {
    const catalog = getCurriculumStoryCatalog();
    const key = storyKey(courseId, unitId, conceptId);
    const published = catalog.publishedStoryByKey.get(key);
    if (published) {
      const story = toStudentCurriculumStory(published);
      return {
        story,
        motionLesson: buildCurriculumMotionLesson(story, visualizationIdeas),
        status: "published",
      };
    }
    const raw = catalog.rawStoryByKey.get(key);
    return {
      story: null,
      motionLesson: null,
      status: !raw ? "missing" : raw.status === "draft" ? "draft" : "invalid",
    };
  } catch (error) {
    console.error("[curriculum-story] catalog unavailable", error.message);
    return { story: null, status: "unavailable" };
  }
}

function toStudentCurriculumStory(story) {
  if (!story) return null;
  return {
    id: story.conceptId,
    revision: story.revision,
    title: story.title,
    openingQuestion: story.openingQuestion,
    estimatedSeconds: story.estimatedSeconds,
    scenes: story.scenes.map((scene) => ({
      id: scene.id,
      kind: scene.kind,
      title: scene.title,
      subtitle: scene.subtitle,
      narration: scene.narration,
      motion: scene.motion || null,
    })),
  };
}

function buildCurriculumStoryEditorialQueue(curriculumData) {
  const catalog = getCurriculumStoryCatalog();
  const queue = [];
  const knownKeys = new Set();

  for (const course of curriculumData.courses || []) {
    for (const unit of course.units || []) {
      for (const concept of unit.concepts || []) {
        const key = storyKey(course.id, unit.id, concept.id);
        knownKeys.add(key);
        const story = catalog.rawStoryByKey.get(key);
        const issues = catalog.issuesByKey.get(key) || [];
        if (catalog.publishedStoryByKey.has(key)) continue;
        queue.push({
          courseId: course.id,
          courseTitle: course.officialTitle || course.title,
          unitId: unit.id,
          unitTitle: unit.title,
          conceptId: concept.id,
          conceptTitle: concept.title,
          status: !story ? "missing" : story.status === "draft" ? "draft" : "invalid",
          reasons: !story ? ["검수된 5분 story가 없습니다."] : issues,
        });
      }
    }
  }

  const orphanedStories = [...catalog.rawStoryByKey.keys()]
    .filter((key) => !knownKeys.has(key))
    .map((key) => ({ key, reasons: ["현재 커리큘럼에 없는 concept key입니다."] }));

  return { queue, orphanedStories, catalogIssues: catalog.catalogIssues };
}

module.exports = {
  buildCurriculumStoryEditorialQueue,
  compileStudioScript,
  getCurriculumStoryCatalog,
  getPublishedCurriculumStory,
  normalizeWhitespace,
  splitNarrationIntoChunks,
  resolveStudentCurriculumStory,
  storyKey,
  stripStudioTags,
  toStudentCurriculumStory,
  validateStory,
  validateStoryCurriculumAuthority,
};
