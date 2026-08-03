import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SpreadsheetFile,
  Workbook,
} from "/Users/sangyoonlee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "outputs", "019fb1e7-d977-7813-80d6-e222909a9a87");
const sourcePath = path.join(outputDir, "arena-test-users-200.json");
const outputPath = path.join(outputDir, "Matths_GOAT_Arena_테스트계정_200명.xlsx");
const previewPath = path.join(outputDir, "Matths_GOAT_Arena_테스트계정_요약.png");

const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const accounts = source.accounts || [];
if (accounts.length !== 200) {
  throw new Error(`테스트 계정이 200명이 아닙니다: ${accounts.length}`);
}

const workbook = Workbook.create();
const summary = workbook.worksheets.add("요약");
const accountSheet = workbook.worksheets.add("테스트 계정");
summary.showGridLines = false;
accountSheet.showGridLines = false;

const headers = [
  "번호",
  "유저네임",
  "이메일",
  "공통 비밀번호",
  "실명",
  "Division",
  "티어",
  "티어 내 순위",
  "GP",
  "이용 상품",
  "남은 학습일수",
  "페이백 점수",
  "학교",
  "학년",
  "테스트 시나리오",
  "운영자 메모",
  "User ID",
];
const rows = accounts.map((account) => [
  account.number,
  account.username,
  account.email,
  account.password,
  account.realName,
  `${account.division === "SUB" ? "Sub" : "Main"} Division`,
  account.tier,
  account.tierRank,
  account.gp,
  account.package,
  account.learningDays,
  account.paybackScore,
  account.school,
  account.grade === 10 ? "고1" : account.grade === 11 ? "고2" : "고3",
  account.scenario,
  account.remark,
  account.userId,
]);

accountSheet.getRange("A1:Q201").values = [headers, ...rows];
const table = accountSheet.tables.add("A1:Q201", true, "ArenaTestAccounts");
table.style = "TableStyleMedium2";
table.showFilterButton = true;
table.showBandedRows = true;
accountSheet.freezePanes.freezeRows(1);
accountSheet.freezePanes.freezeColumns(2);

accountSheet.getRange("A1:Q1").format = {
  fill: "#171B3D",
  font: { bold: true, color: "#FFFFFF" },
  verticalAlignment: "center",
};
accountSheet.getRange("A1:Q1").format.rowHeight = 30;
accountSheet.getRange("A2:A201").format.numberFormat = "0";
accountSheet.getRange("H2:I201").format.numberFormat = "0";
accountSheet.getRange("K2:L201").format.numberFormat = "0";
accountSheet.getRange("A2:A201").format.horizontalAlignment = "center";
accountSheet.getRange("F2:I201").format.horizontalAlignment = "center";
accountSheet.getRange("K2:N201").format.horizontalAlignment = "center";
accountSheet.getRange("A2:Q201").format.verticalAlignment = "center";
accountSheet.getRange("A2:Q201").format.rowHeight = 23;
accountSheet.getRange("A:A").format.columnWidth = 7;
accountSheet.getRange("B:B").format.columnWidth = 14;
accountSheet.getRange("C:C").format.columnWidth = 23;
accountSheet.getRange("D:D").format.columnWidth = 16;
accountSheet.getRange("E:E").format.columnWidth = 14;
accountSheet.getRange("F:F").format.columnWidth = 16;
accountSheet.getRange("G:G").format.columnWidth = 15;
accountSheet.getRange("H:I").format.columnWidth = 12;
accountSheet.getRange("J:J").format.columnWidth = 20;
accountSheet.getRange("K:L").format.columnWidth = 14;
accountSheet.getRange("M:M").format.columnWidth = 20;
accountSheet.getRange("N:N").format.columnWidth = 9;
accountSheet.getRange("O:O").format.columnWidth = 20;
accountSheet.getRange("P:P").format.columnWidth = 11;
accountSheet.getRange("Q:Q").format.columnWidth = 28;
accountSheet.getRange("P2:P201").conditionalFormats.add("containsText", {
  text: "test",
  format: { fill: "#E7F8EE", font: { color: "#177245", bold: true } },
});

summary.getRange("A1:H1").merge();
summary.getRange("A1").values = [["Matths GOAT Arena 테스트 계정 현황"]];
summary.getRange("A1:H1").format = {
  fill: "#171B3D",
  font: { bold: true, color: "#FFFFFF", size: 20 },
  verticalAlignment: "center",
};
summary.getRange("A1:H1").format.rowHeight = 42;
summary.getRange("A2:H2").merge();
summary.getRange("A2").values = [[
  `생성 시각 ${new Date(source.generatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · DB ${source.database} · Batch ${source.batchKey}`,
]];
summary.getRange("A2:H2").format = {
  fill: "#EEF2FF",
  font: { color: "#59627D", size: 10 },
};

summary.getRange("A4:B4").merge();
summary.getRange("C4:D4").merge();
summary.getRange("E4:F4").merge();
summary.getRange("G4:H4").merge();
summary.getRange("A4").values = [["전체 계정"]];
summary.getRange("C4").values = [["Sub Division"]];
summary.getRange("E4").values = [["Main Division"]];
summary.getRange("G4").values = [["공통 비밀번호"]];
summary.getRange("A5:B6").merge();
summary.getRange("C5:D6").merge();
summary.getRange("E5:F6").merge();
summary.getRange("G5:H6").merge();
summary.getRange("A5").formulas = [["=COUNTA('테스트 계정'!$B$2:$B$201)"]];
summary.getRange("C5").formulas = [["=COUNTIF('테스트 계정'!$F$2:$F$201,\"Sub Division\")"]];
summary.getRange("E5").formulas = [["=COUNTIF('테스트 계정'!$F$2:$F$201,\"Main Division\")"]];
summary.getRange("G5").values = [[source.password]];
summary.getRange("A4:H4").format = {
  fill: "#3157F6",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
summary.getRange("A5:H6").format = {
  fill: "#F7F9FF",
  font: { bold: true, color: "#161C37", size: 18 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  borders: { preset: "outside", style: "thin", color: "#D9E1F2" },
};

summary.getRange("A8:C8").values = [["티어", "Sub Division", "Main Division"]];
const tierLabels = ["브론즈", "실버", "골드", "플래티넘", "에메랄드", "다이아몬드", "마스터", "그랜드마스터", "챌린저"];
summary.getRange("A9:A17").values = tierLabels.map((label) => [label]);
summary.getRange("B9").formulas = [["=COUNTIFS('테스트 계정'!$F$2:$F$201,\"Sub Division\",'테스트 계정'!$G$2:$G$201,A9)"]];
summary.getRange("B9:B17").fillDown();
summary.getRange("C9").formulas = [["=COUNTIFS('테스트 계정'!$F$2:$F$201,\"Main Division\",'테스트 계정'!$G$2:$G$201,A9)"]];
summary.getRange("C9:C17").fillDown();
summary.getRange("A8:C8").format = {
  fill: "#171B3D",
  font: { bold: true, color: "#FFFFFF" },
};
summary.getRange("A9:C17").format.borders = {
  insideHorizontal: { style: "thin", color: "#E4E8F2" },
  bottom: { style: "thin", color: "#CBD3E3" },
};
summary.getRange("B9:C17").format.numberFormat = "0";
summary.getRange("B9:C17").format.horizontalAlignment = "right";

summary.getRange("A19:H21").merge();
summary.getRange("A19").values = [[
  "안전한 삭제 기준: isTestAccount=true AND testBatchKey가 일치하는 계정만 시드 작업이 정리합니다. 실제 계정과 test1~test200 유저네임 또는 이메일이 충돌하면 작업은 삭제 전에 중단됩니다.",
]];
summary.getRange("A19:H21").format = {
  fill: "#FFF8E8",
  font: { color: "#76511B", size: 10 },
  wrapText: true,
  verticalAlignment: "center",
  borders: { preset: "outside", style: "thin", color: "#F0D69C" },
};

const chart = summary.charts.add("bar", summary.getRange("A8:C17"));
chart.title = "티어별 테스트 계정 분포";
chart.hasLegend = true;
chart.setPosition("E8", "L18");

summary.getRange("A:H").format.columnWidth = 15;
summary.getRange("A:A").format.columnWidth = 18;
summary.freezePanes.freezeRows(2);

await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({
  sheetName: "요약",
  autoCrop: "all",
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const workbookInspect = await workbook.inspect({
  kind: "workbook,sheet,table,formula",
  maxChars: 8000,
  tableMaxRows: 8,
  tableMaxCols: 18,
  options: { maxResults: 100 },
});
await fs.writeFile(`${outputDir}/arena-test-workbook-inspect.json`, workbookInspect.ndjson || String(workbookInspect));

const formulaErrorInspect = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  maxChars: 4000,
});
const errorText = formulaErrorInspect.ndjson || String(formulaErrorInspect);
if (/"matchCount"\s*:\s*[1-9]/.test(errorText) || /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/.test(errorText)) {
  throw new Error(`수식 오류가 발견되었습니다: ${errorText.slice(0, 1000)}`);
}

const exported = await SpreadsheetFile.exportXlsx(workbook);
await exported.save(outputPath);
console.log(JSON.stringify({ ok: true, outputPath, previewPath, accounts: accounts.length }));
