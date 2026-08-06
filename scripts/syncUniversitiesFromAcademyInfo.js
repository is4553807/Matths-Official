const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const YEAR = Number(process.argv[2]) || 2026;
const ENDPOINT =
  "https://m.academyinfo.go.kr/intro/intro0350/selectSchlListAll.do";
const outputPath = path.resolve(__dirname, "..", "kr-universities.yaml");

async function fetchPage(pageindex) {
  const body = new URLSearchParams({
    svy_yr: String(YEAR),
    pageindex: String(pageindex),
    pbnf_area_cd: "",
    searchVal: "",
  });
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body,
  });
  if (!response.ok) {
    throw new Error(`대학알리미 조회 실패: HTTP ${response.status}`);
  }
  return response.json();
}

async function main() {
  const first = await fetchPage(1);
  const totalPages = Number(first.paginationInfo?.totalPageCount) || 1;
  const rows = [...(first.resultList || [])];
  for (let page = 2; page <= totalPages; page += 1) {
    const data = await fetchPage(page);
    rows.push(...(data.resultList || []));
  }
  const universities = rows
    .map((row) => ({
      code: String(row.schl_id || ""),
      name: String(row.schl_nm || "").trim(),
      campus: String(row.psbs_div_nm || "").trim(),
      region: String(row.pbnf_area_nm || "").trim(),
      institution_level: String(row.schl_div_nm || "").trim(),
      institution_type: String(row.schl_knd_nm || "").trim(),
      establishment: String(row.schl_estb_div_nm || "").trim(),
    }))
    .filter((row) => row.code && row.name)
    .sort((left, right) =>
      left.name.localeCompare(right.name, "ko") ||
      left.campus.localeCompare(right.campus, "ko") ||
      left.code.localeCompare(right.code)
    );
  const document = {
    source: {
      name: "대학알리미 공시대상대학",
      organization: "한국대학교육협의회 대학정보공시센터",
      url: "https://m.academyinfo.go.kr/intro/intro0350/intro.do",
      disclosure_year: YEAR,
      synced_at: new Date().toISOString(),
    },
    universities,
  };
  fs.writeFileSync(
    outputPath,
    yaml.dump(document, {
      noRefs: true,
      lineWidth: 120,
      quotingType: '"',
      forceQuotes: false,
    }),
    "utf8"
  );
  console.log(`대학알리미 ${YEAR}년 공시대상 ${universities.length}개 항목 저장: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
