const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

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

  return Object.fromEntries(
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
  loadSchoolYaml,
  getSchoolSelectData,
  findSchool,
};