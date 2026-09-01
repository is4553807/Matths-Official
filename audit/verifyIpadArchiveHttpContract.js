const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "routes/api-routes.js"), "utf8");
const controller = fs.readFileSync(
  path.join(root, "controllers/ipadArchiveController.js"),
  "utf8"
);

function requireText(source, value, message) {
  if (!source.includes(value)) throw new Error(message);
}

const authIndex = routes.indexOf("router.use(requireApiAuth)");
const listIndex = routes.indexOf('router.get("/archive"');
const downloadIndex = routes.indexOf('router.get("/archive/items/:itemId/download"');
if (!(authIndex >= 0 && listIndex > authIndex && downloadIndex > authIndex)) {
  throw new Error("자료함 API는 Bearer 인증 뒤에 있어야 합니다.");
}

requireText(controller, "getArchiveData", "자료함 정본 목록 서비스를 재사용해야 합니다.");
requireText(controller, "getArchiveDownload", "자료함 정본 다운로드 서비스를 재사용해야 합니다.");
requireText(controller, "issuePersonalizedPdf", "PDF 개인 워터마크 발급을 유지해야 합니다.");
requireText(controller, 'sourceType: "ARCHIVE"', "PDF 감사 sourceType이 누락됐습니다.");
requireText(controller, 'res.set("Cache-Control", "private, no-store")', "개인 자료 캐시 차단이 필요합니다.");
if (controller.includes("trashItems") || controller.includes("folderOptions")) {
  throw new Error("앱 목록 DTO에 운영자 휴지통·전체 폴더 관리 정보가 노출되면 안 됩니다.");
}

console.log("iPad 자료함 HTTP 계약 통과");
