const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  OVERSEAS_HIGH_SCHOOL_OPTION_CODE,
  buildOverseasSchool,
  getSchoolSelectData,
} = require("../services/schoolService");
const {
  OVERSEAS_UNIVERSITY_OPTION_CODE,
  buildOverseasUniversity,
  getUniversitySelectData,
} = require("../services/universityService");

const root = path.resolve(__dirname, "..");
const schoolOptions = getSchoolSelectData();
assert.equal(schoolOptions.해외[0].code, OVERSEAS_HIGH_SCHOOL_OPTION_CODE);

const firstSchool = buildOverseasSchool("  Singapore   American School ").school;
const secondSchool = buildOverseasSchool("Singapore American School").school;
assert.equal(firstSchool.name, "Singapore American School");
assert.equal(firstSchool.code, secondSchool.code);
assert.equal(firstSchool.isOverseas, true);
assert.equal(buildOverseasSchool("<script>").school, null);

assert.equal(
  getUniversitySelectData().at(-1).code,
  OVERSEAS_UNIVERSITY_OPTION_CODE
);
const university = buildOverseasUniversity(
  "National University of Singapore"
).university;
assert.equal(university.region, "해외");
assert.equal(university.isOverseas, true);

const webController = fs.readFileSync(
  path.join(root, "controllers", "matthsController.js"),
  "utf8"
);
const apiController = fs.readFileSync(
  path.join(root, "controllers", "apiController.js"),
  "utf8"
);
const registerView = fs.readFileSync(
  path.join(root, "views", "register.ejs"),
  "utf8"
);

[webController, apiController].forEach((source) => {
  assert.match(source, /buildOverseasSchool\(overseasSchoolName\)/);
  assert.match(source, /buildOverseasUniversity\(overseasUniversityName\)/);
});
assert.match(registerView, /name="overseasSchoolName"/);
assert.match(registerView, /name="overseasUniversityName"/);

console.log("Overseas institution verification passed.");
