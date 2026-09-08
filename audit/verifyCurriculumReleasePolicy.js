"use strict";
const assert = require("node:assert/strict");
const { loadCurriculum, buildLearningViewModel, findUnitView, isCourseAvailable, conceptKey } = require("../services/curriculumService");
const expected = ["common-math-1", "common-math-2", "algebra", "calculus-1", "probability-statistics",
  "calculus-2", "geometry", "economics-math", "ai-math", "vocational-math", "math-and-culture",
  "practical-statistics", "math-research-project"];
const catalog = loadCurriculum();
assert.equal(catalog.availabilityPolicyRevision, 2);
assert.deepEqual(catalog.courses.map((course) => course.id), expected);
assert.equal(catalog.catalogStats.totalConcepts, 220);
const empty = buildLearningViewModel(catalog, {});
assert.equal(empty.totalConcepts, 39, "unused electives must not dilute the existing common-course denominator");
for (const course of catalog.courses) {
  assert.equal(isCourseAvailable(course.id), true);
  assert.equal(course.developmentLocked, false);
  assert.ok(course.units.length && course.conceptCount > 0, "released course must contain real curriculum content");
  for (const unit of course.units) for (const concept of unit.concepts) {
    assert.ok(concept.title && concept.standardCode && concept.achievementStandard && concept.topics.length);
    const route = findUnitView(empty, course.id, unit.id, concept.id);
    assert.equal(route.selectedConcept.id, concept.id);
    assert.equal(route.selectedConcept.href, `/learn/${course.id}/${unit.id}/${concept.id}`);
  }
  if (course.category !== "common") {
    const unit = course.units[0], concept = unit.concepts[0];
    const model = buildLearningViewModel(catalog, { concepts: { [conceptKey(course.id, unit.id, concept.id)]: { percent: 55 } } });
    assert.equal(model.continueConcept.id, concept.id, "released elective progress must remain resumable");
    assert.equal(model.totalConcepts, 39 + course.conceptCount);
  }
}
assert.equal(isCourseAvailable("not-authored"), false);
assert.equal(findUnitView(empty, "not-authored", "unit", "concept"), null);
assert.equal(findUnitView(empty, "geometry", "not-authored", "concept"), null);
console.log("PASS real curriculum service: 13 released courses/220 real concepts and exact routes, unknown content rejected, common denominator and elective continuation preserved; no DB/network used.");
