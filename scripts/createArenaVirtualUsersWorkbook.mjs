import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const [manifestPath, outputPath] = process.argv.slice(2);

if (!manifestPath || !outputPath) {
  throw new Error("사용법: node scripts/createArenaVirtualUsersWorkbook.mjs <manifest.json> <output.xlsx>");
}

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const accounts = Array.isArray(manifest.accounts) ? manifest.accounts : [];
if (accounts.length !== 200) {
  throw new Error(`가상 유저 200명 명세가 필요합니다. 현재 ${accounts.length}명입니다.`);
}

const divisionName = (division) => (division === "SUB" ? "UNRANKED" : "RANKED");
const workbook = Workbook.create();
const summary = workbook.worksheets.add("요약");
const sheet = workbook.worksheets.add("로그인 계정");

for (const target of [summary, sheet]) target.showGridLines = false;

summary.getRange("A1:F1").merge();
summary.getRange("A1").values = [["GOAT Arena 가상 유저 · 운영 테스트 계정"]];
summary.getRange("A2:F2").merge();
summary.getRange("A2").values = [["Unranked 100명 · Ranked 100명 | 실제 학생 데이터가 아닌 가상 테스트 계정입니다."]];
summary.getRange("A4:F4").values = [["생성 일시", "배치 키", "공통 비밀번호", "Unranked", "Ranked", "총계"]];
summary.getRange("A5:F5").values = [[
  new Date(manifest.generatedAt),
  manifest.batchKey,
  manifest.password,
  null,
  null,
  null,
]];
summary.getRange("D5").formulas = [["=COUNTIF('로그인 계정'!$B$8:$B$207,\"UNRANKED\")"]];
summary.getRange("E5").formulas = [["=COUNTIF('로그인 계정'!$B$8:$B$207,\"RANKED\")"]];
summary.getRange("F5").formulas = [["=COUNTA('로그인 계정'!$A$8:$A$207)"]];
summary.getRange("A7:F7").merge();
summary.getRange("A7").values = [["보안 안내 · 이 파일에는 테스트 로그인 비밀번호가 포함되어 있습니다. 테스트 완료 후 보관·공유 범위를 제한하세요."]];

summary.getRange("A1:F1").format = {
  fill: "#151B4D",
  font: { bold: true, color: "#FFFFFF", size: 18 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
summary.getRange("A2:F2").format = {
  fill: "#EAF0FF",
  font: { color: "#415172", italic: true, size: 10 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
summary.getRange("A4:F4").format = {
  fill: "#4F46E5",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
summary.getRange("A5:F5").format = {
  fill: "#F7F8FC",
  font: { color: "#172033", bold: true },
  borders: { preset: "all", style: "thin", color: "#D7DDEC" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
summary.getRange("A7:F7").format = {
  fill: "#FFF7E8",
  font: { color: "#8A5A16", size: 10 },
  wrapText: true,
  verticalAlignment: "center",
};
summary.getRange("A1:F1").format.rowHeight = 34;
summary.getRange("A2:F2").format.rowHeight = 24;
summary.getRange("A4:F5").format.rowHeight = 24;
summary.getRange("A7:F7").format.rowHeight = 34;
summary.getRange("A5").setNumberFormat("yyyy-mm-dd hh:mm");
for (const [column, width] of Object.entries({ A: 145, B: 430, C: 175, D: 90, E: 90, F: 90 })) {
  summary.getRange(`${column}:${column}`).format.columnWidthPx = width;
}

const headers = [[
  "번호",
  "Division",
  "DB Division",
  "티어",
  "티어 내 순위",
  "GP",
  "닉네임",
  "로그인 이메일",
  "비밀번호",
  "실명(가상)",
  "배치고사 점수",
  "MMR",
  "정기권 잔여 일수",
  "페이백 점수",
  "소속 학교",
  "학년",
  "사용자 ID",
  "비고",
]];
sheet.getRange("A1:R1").merge();
sheet.getRange("A1").values = [["GOAT Arena 가상 유저 로그인 목록"]];
sheet.getRange("A2:R2").merge();
sheet.getRange("A2").values = [["공통 비밀번호는 생성 명세에서 불러옵니다. | 계정은 Unranked 100명, Ranked 100명으로 균등 배치되어 있습니다."]];
sheet.getRange("A4:R5").merge();
sheet.getRange("A4").values = [["로그인 방법: 닉네임 또는 이메일과 공통 비밀번호를 사용합니다. 실제 서비스 회원과 구분되는 가상 계정이며, 운영 테스트 전용입니다."]];
sheet.getRange("A7:R7").values = headers;
const values = accounts.map((account) => [
  account.number,
  divisionName(account.division),
  account.division,
  account.tier,
  account.tierRank,
  account.gp,
  account.username,
  account.email,
  account.password,
  account.realName,
  account.placementScore,
  account.initialMmr,
  account.learningDays,
  account.paybackScore,
  account.school,
  account.grade,
  account.userId,
  account.remark,
]);
sheet.getRange(`A8:R${accounts.length + 7}`).values = values;

sheet.getRange("A1:R1").format = {
  fill: "#151B4D",
  font: { bold: true, color: "#FFFFFF", size: 18 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
sheet.getRange("A2:R2").format = {
  fill: "#EAF0FF",
  font: { color: "#415172", italic: true, size: 10 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
sheet.getRange("A4:R5").format = {
  fill: "#FFF7E8",
  font: { color: "#8A5A16", size: 10 },
  wrapText: true,
  verticalAlignment: "center",
};
sheet.getRange("A7:R7").format = {
  fill: "#4F46E5",
  font: { bold: true, color: "#FFFFFF", size: 10 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
};
sheet.getRange(`A8:R${accounts.length + 7}`).format = {
  font: { color: "#1F2937", size: 10 },
  borders: { insideHorizontal: { style: "thin", color: "#E7EAF2" } },
  verticalAlignment: "center",
};
sheet.getRange(`A8:A${accounts.length + 7}`).format.horizontalAlignment = "center";
sheet.getRange(`B8:F${accounts.length + 7}`).format.horizontalAlignment = "center";
sheet.getRange(`K8:P${accounts.length + 7}`).format.horizontalAlignment = "center";
sheet.getRange(`A8:R${accounts.length + 7}`).format.rowHeight = 21;
sheet.getRange("A1:R1").format.rowHeight = 34;
sheet.getRange("A2:R2").format.rowHeight = 24;
sheet.getRange("A4:R5").format.rowHeight = 25;
sheet.getRange("A7:R7").format.rowHeight = 30;
sheet.getRange(`A8:A${accounts.length + 7}`).setNumberFormat("#,##0");
sheet.getRange(`E8:F${accounts.length + 7}`).setNumberFormat("#,##0");
sheet.getRange(`K8:P${accounts.length + 7}`).setNumberFormat("#,##0");
for (const [column, width] of Object.entries({
  A: 55, B: 95, C: 90, D: 90, E: 85, F: 55, G: 150, H: 230, I: 170,
  J: 105, K: 100, L: 80, M: 110, N: 95, O: 150, P: 60, Q: 190, R: 105,
})) {
  sheet.getRange(`${column}:${column}`).format.columnWidthPx = width;
}
sheet.freezePanes.freezeRows(7);
sheet.freezePanes.freezeColumns(2);

const keyCheck = await workbook.inspect({
  kind: "table",
  range: "로그인 계정!A1:R12",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 18,
});
const errorCheck = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "formula error scan",
});

const outputDir = path.dirname(outputPath);
await fs.mkdir(outputDir, { recursive: true });
const summaryPreview = await workbook.render({ sheetName: "요약", range: "A1:F7", scale: 2, format: "png" });
const accountsPreview = await workbook.render({ sheetName: "로그인 계정", range: "A1:R20", scale: 1.5, format: "png" });
await fs.writeFile(path.join(outputDir, "GOAT_Arena_가상유저_요약_미리보기.png"), new Uint8Array(await summaryPreview.arrayBuffer()));
await fs.writeFile(path.join(outputDir, "GOAT_Arena_가상유저_목록_미리보기.png"), new Uint8Array(await accountsPreview.arrayBuffer()));

const file = await SpreadsheetFile.exportXlsx(workbook);
await file.save(outputPath);
console.log(JSON.stringify({
  ok: true,
  outputPath,
  accounts: accounts.length,
  inspect: keyCheck.ndjson,
  formulaErrors: errorCheck.ndjson,
}, null, 2));
