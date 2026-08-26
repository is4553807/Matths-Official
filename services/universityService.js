const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");
const crypto = require("node:crypto");

const OVERSEAS_UNIVERSITY_OPTION_CODE = "OVERSEAS_UNIVERSITY";
const CUSTOM_INSTITUTION_NAME_MAX_LENGTH = 120;

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
  return [
    ...loadUniversityYaml().universities.map((university) => ({
    code: String(university.code),
    name: String(university.name),
    campus: String(university.campus || ""),
    region: String(university.region || ""),
    institutionLevel: String(university.institution_level || ""),
    institutionType: String(university.institution_type || ""),
    })),
    {
      code: OVERSEAS_UNIVERSITY_OPTION_CODE,
      name: "해외소재대학교",
      campus: "",
      region: "해외",
      institutionLevel: "대학교",
      institutionType: "해외 교육기관",
      requiresCustomName: true,
    },
  ];
}

function normalizeCustomInstitutionName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function validateCustomInstitutionName(value) {
  const name = normalizeCustomInstitutionName(value);
  if (name.length < 2 || name.length > CUSTOM_INSTITUTION_NAME_MAX_LENGTH) {
    return {
      valid: false,
      name,
      message: `대학교 이름은 2자 이상 ${CUSTOM_INSTITUTION_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`,
    };
  }
  if (/[<>\u0000-\u001f\u007f]/u.test(name)) {
    return {
      valid: false,
      name,
      message: "대학교 이름에 사용할 수 없는 문자가 포함되어 있습니다.",
    };
  }
  return { valid: true, name, message: "" };
}

function buildOverseasUniversity(value) {
  const validation = validateCustomInstitutionName(value);
  if (!validation.valid) return { university: null, error: validation.message };
  const digest = crypto
    .createHash("sha256")
    .update(validation.name.toLocaleLowerCase("en"), "utf8")
    .digest("hex")
    .slice(0, 20)
    .toUpperCase();
  return {
    university: {
      code: `INTL-UNI-${digest}`,
      name: validation.name,
      campus: "",
      region: "해외",
      institutionLevel: "대학교",
      institutionType: "해외 교육기관",
      establishment: "",
      isOverseas: true,
    },
    error: "",
  };
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

module.exports = {
  OVERSEAS_UNIVERSITY_OPTION_CODE,
  loadUniversityYaml,
  getUniversitySelectData,
  findUniversity,
  normalizeCustomInstitutionName,
  validateCustomInstitutionName,
  buildOverseasUniversity,
};
