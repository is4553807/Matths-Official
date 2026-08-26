const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const crypto = require("node:crypto");

const OVERSEAS_HIGH_SCHOOL_REGION = "해외";
const OVERSEAS_HIGH_SCHOOL_OPTION_CODE = "OVERSEAS_HIGH_SCHOOL";
const CUSTOM_INSTITUTION_NAME_MAX_LENGTH = 120;

const schoolYamlPath = path.resolve(
  __dirname,
  "..",
  "kr-high-schools.yaml"
);

let cachedSchoolData = null;
let cachedModifiedTime = null;

function loadSchoolYaml() {
  const fileStat =
    fs.statSync(schoolYamlPath);

  if (
    cachedSchoolData &&
    cachedModifiedTime === fileStat.mtimeMs
  ) {
    return cachedSchoolData;
  }

  const yamlText =
    fs.readFileSync(
      schoolYamlPath,
      "utf-8"
    );

  const parsedData =
    yaml.load(yamlText);

  if (
    !parsedData ||
    !parsedData.regions
  ) {
    throw new Error(
      "고등학교 YAML 형식이 올바르지 않습니다."
    );
  }

  cachedSchoolData = parsedData;
  cachedModifiedTime = fileStat.mtimeMs;

  return parsedData;
}

/**
 * EJS에 전달할 최소 데이터
 *
 * 상세 주소, 학교 유형 등의 전체 원본을
 * 브라우저에 전달할 필요는 없습니다.
 */
function getSchoolSelectData() {
  const data = loadSchoolYaml();
  const regions = Object.fromEntries(
    Object.entries(data.regions).map(
      ([regionName, regionData]) => {
        const schools =
          (regionData.schools || [])
            .map((school) => ({
              code: String(school.code),
              name: school.name,
              roadAddress:
                school.road_address || "",
              establishment:
                school.establishment || "",
              highSchoolType:
                school.high_school_type || "",
            }))
            .sort((a, b) =>
              a.name.localeCompare(
                b.name,
                "ko"
              )
            );

        return [
          regionName,
          schools,
        ];
      }
    )
  );

  regions[OVERSEAS_HIGH_SCHOOL_REGION] = [
    {
      code: OVERSEAS_HIGH_SCHOOL_OPTION_CODE,
      name: "해외소재고등학교",
      roadAddress: "학교명을 직접 입력합니다.",
      establishment: "",
      highSchoolType: "",
      requiresCustomName: true,
    },
  ];

  return regions;
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
      message: `학교 이름은 2자 이상 ${CUSTOM_INSTITUTION_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`,
    };
  }
  if (/[<>\u0000-\u001f\u007f]/u.test(name)) {
    return {
      valid: false,
      name,
      message: "학교 이름에 사용할 수 없는 문자가 포함되어 있습니다.",
    };
  }
  return { valid: true, name, message: "" };
}

function customInstitutionCode(prefix, name) {
  const digest = crypto
    .createHash("sha256")
    .update(name.toLocaleLowerCase("en"), "utf8")
    .digest("hex")
    .slice(0, 20)
    .toUpperCase();
  return `${prefix}-${digest}`;
}

function buildOverseasSchool(value) {
  const validation = validateCustomInstitutionName(value);
  if (!validation.valid) return { school: null, error: validation.message };
  return {
    school: {
      region: OVERSEAS_HIGH_SCHOOL_REGION,
      educationOfficeCode: "",
      educationOfficeName: "",
      code: customInstitutionCode("INTL-HS", validation.name),
      name: validation.name,
      establishment: "",
      highSchoolType: "OVERSEAS",
      generalVocationalType: "",
      roadAddress: "",
      isOverseas: true,
    },
    error: "",
  };
}

/**
 * 회원가입 POST에서 학교를 검증할 때 사용
 */
function findSchool(
  regionName,
  schoolCode
) {
  const data = loadSchoolYaml();

  const region =
    data.regions?.[regionName];

  if (!region) {
    return null;
  }

  const school =
    (region.schools || []).find(
      (item) =>
        String(item.code) ===
        String(schoolCode)
    );

  if (!school) {
    return null;
  }

  return {
    region: regionName,
    educationOfficeCode:
      region.education_office_code,
    educationOfficeName:
      region.education_office_name,
    code: String(school.code),
    name: school.name,
    establishment:
      school.establishment,
    highSchoolType:
      school.high_school_type,
    generalVocationalType:
      school.general_vocational_type,
    roadAddress:
      school.road_address,
  };
}

module.exports = {
  OVERSEAS_HIGH_SCHOOL_REGION,
  OVERSEAS_HIGH_SCHOOL_OPTION_CODE,
  loadSchoolYaml,
  getSchoolSelectData,
  findSchool,
  normalizeCustomInstitutionName,
  validateCustomInstitutionName,
  buildOverseasSchool,
};
