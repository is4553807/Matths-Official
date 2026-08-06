const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const universityYamlPath = path.resolve(__dirname, "..", "kr-universities.yaml");
let cache = null;
let cacheMtime = null;

function loadUniversityYaml() {
  const stat = fs.statSync(universityYamlPath);
  if (cache && cacheMtime === stat.mtimeMs) return cache;
  const parsed = yaml.load(fs.readFileSync(universityYamlPath, "utf8"));
  if (!parsed || !Array.isArray(parsed.universities)) {
    throw new Error("대학교 YAML 형식이 올바르지 않습니다.");
  }
  cache = parsed;
  cacheMtime = stat.mtimeMs;
  return cache;
}

function getUniversitySelectData() {
  return loadUniversityYaml().universities.map((university) => ({
    code: String(university.code),
    name: String(university.name),
    campus: String(university.campus || ""),
    region: String(university.region || ""),
    institutionLevel: String(university.institution_level || ""),
    institutionType: String(university.institution_type || ""),
  }));
}

function findUniversity(code) {
  const university = loadUniversityYaml().universities.find(
    (item) => String(item.code) === String(code)
  );
  if (!university) return null;
  return {
    code: String(university.code),
    name: String(university.name),
    campus: String(university.campus || ""),
    region: String(university.region || ""),
    institutionLevel: String(university.institution_level || ""),
    institutionType: String(university.institution_type || ""),
    establishment: String(university.establishment || ""),
  };
}

module.exports = { loadUniversityYaml, getUniversitySelectData, findUniversity };
