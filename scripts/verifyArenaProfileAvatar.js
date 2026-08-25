const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const {
  ARENA_PROFILE_AVATARS,
  ARENA_PROFILE_AVATAR_CODES,
  DEFAULT_ARENA_PROFILE_AVATAR_CODE,
  getArenaProfileAvatar,
} = require("../constants/arenaProfileAvatars");
const {
  createSquareProfileAvatarFile,
  PROFILE_AVATAR_SIZE,
} = require("../services/arenaProfileAvatarService");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

assert.equal(ARENA_PROFILE_AVATARS.length, 6);
assert.equal(
  new Set(ARENA_PROFILE_AVATAR_CODES).size,
  ARENA_PROFILE_AVATAR_CODES.length
);
assert.ok(ARENA_PROFILE_AVATAR_CODES.includes(DEFAULT_ARENA_PROFILE_AVATAR_CODE));
assert.equal(getArenaProfileAvatar("COMET_FOX").code, "COMET_FOX");
assert.equal(
  getArenaProfileAvatar("NOT_ALLOWED").code,
  DEFAULT_ARENA_PROFILE_AVATAR_CODE
);

ARENA_PROFILE_AVATARS.forEach((avatar) => {
  assert.match(avatar.code, /^[A-Z][A-Z0-9_]+$/);
  assert.ok(avatar.label);
  assert.ok(avatar.description);
  const relativeImagePath = avatar.imageSrc.replace(/^\//, "public/");
  const svg = read(relativeImagePath);
  assert.match(svg, /^<svg/);
  assert.match(svg, /viewBox="0 0 128 128"/);
});

const modelSource = read("models/matthsModel.js");
const serviceSource = read("services/arenaProfileAvatarService.js");
const routeSource = read("routes/goat-arena-routes.js");
const learningRouteSource = read("routes/matths-routes.js");
const controllerSource = read("controllers/goatArenaController.js");
const learningControllerSource = read("controllers/matthsController.js");
const navigationView = read("views/partials/goat-arena-navigation.ejs");
const profileView = read("views/goat-arena-profile.ejs");
const learningProfileView = read("views/profile.ejs");
const dashboardView = read("views/main.ejs");
const myLearningView = read("views/my-learning.ejs");
const unitLearningView = read("views/unit-learning.ejs");
const rankingService = read("services/rankingService.js");
const rankingPlayerView = read("views/partials/ranking-player.ejs");
const tierRankingView = read("views/partials/tier-ranking-pools.ejs");
const arenaRankingView = read("views/goat-arena-rankings.ejs");
const finalRankingView = read("views/war-of-masters-rankings.ejs");
const arenaCss = read("public/css/goat-arena.css");
const learningCss = read("public/css/profile.css");
const dashboardCss = read("public/css/main.css");
const profileJs = read("public/js/profile.js");
const uploadMiddleware = read("middleware/profileAvatarUpload.js");
const storageService = read("services/fileStorageService.js");
const accountDeletionService = read("services/accountDeletionService.js");

assert.match(modelSource, /arenaAvatarCode/);
assert.match(modelSource, /enum:\s*ARENA_PROFILE_AVATAR_CODES/);
assert.match(modelSource, /profileAvatarMode/);
assert.match(modelSource, /profileAvatarAssetSchema/);
assert.match(serviceSource, /preferences\.arenaAvatarCode/);
assert.match(serviceSource, /ARENA_PROFILE_AVATAR_CODES\.includes/);
assert.match(serviceSource, /resolveArenaProfileAvatar/);
assert.match(serviceSource, /updateCustomProfileAvatar/);
assert.match(serviceSource, /\.resize\(\{/);
assert.match(routeSource, /"\/goat-arena\/profile\/avatar"/);
assert.match(controllerSource, /exports\.updateProfileAvatar/);
assert.match(navigationView, /arena-level-plate/);
assert.match(navigationView, /arenaUser\.avatar\?\.imageSrc/);
assert.match(profileView, /action="\/goat-arena\/profile\/avatar"/);
assert.match(profileView, /arenaProfileAvatars\.forEach/);
assert.match(arenaCss, /\.arena-avatar-picker/);
assert.match(arenaCss, /\.arena-avatar-unit--hero/);
assert.match(learningRouteSource, /"\/profile\/avatar"/);
assert.match(learningRouteSource, /handleProfileAvatarUpload/);
assert.match(learningControllerSource, /exports\.changeProfileAvatar/);
assert.match(
  learningControllerSource,
  /function getRequestProfileAvatar\(req\)[\s\S]*resolveArenaProfileAvatar\(\s*req\.authenticatedUser\?\.preferences/
);
assert.doesNotMatch(
  learningControllerSource,
  /resolveArenaProfileAvatar\(\s*dashboardData\.user\.preferences/
);
assert.equal(
  (
    learningControllerSource.match(
      /arenaProfileAvatar:\s*getRequestProfileAvatar\(req\)/g
    ) || []
  ).length,
  3
);
assert.match(learningProfileView, /action="\/profile\/avatar"/);
assert.match(learningProfileView, /enctype="multipart\/form-data"/);
assert.match(learningProfileView, /name="profileImage"/);
assert.match(learningProfileView, /value="CUSTOM"/);
assert.match(learningProfileView, /data-profile-avatar-crop-canvas/);
assert.match(learningProfileView, /profile-avatar-crop-grid/);
assert.match(learningCss, /\.profile-avatar-crop-dialog/);
assert.match(learningCss, /\.profile-avatar-crop-grid/);
assert.match(profileJs, /URL\.createObjectURL/);
assert.match(profileJs, /canvas\.toBlob/);
assert.match(profileJs, /new DataTransfer\(\)/);
assert.match(profileJs, /data-profile-avatar-crop-rotate/);
assert.match(profileJs, /data-profile-avatar-file/);
assert.match(uploadMiddleware, /5 \* 1024 \* 1024/);
assert.match(uploadMiddleware, /validateRequestUploads/);
assert.match(storageService, /USER_PROFILE_AVATAR/);
assert.match(accountDeletionService, /preferences\.profileAvatarAsset/);
assert.match(dashboardView, /profile-avatar-with-level/);
assert.match(dashboardView, /arenaActivityLevel\.level/);
assert.match(dashboardView, /arenaProfileAvatar\.imageSrc/);
assert.match(myLearningView, /profile-avatar-image/);
assert.match(myLearningView, /arenaProfileAvatar\.imageSrc/);
assert.match(unitLearningView, /profile-avatar-image/);
assert.match(unitLearningView, /arenaProfileAvatar\.imageSrc/);
assert.match(dashboardCss, /\.profile-avatar-with-level/);
assert.match(dashboardCss, /\.profile-avatar\.profile-avatar-image/);
assert.match(rankingService, /resolveArenaProfileAvatar/);
assert.match(rankingService, /profileAvatarByUserId/);
assert.match(rankingService, /warningCount preferences/);
assert.match(rankingPlayerView, /ranking-profile-avatar/);
assert.match(rankingPlayerView, /rankerAvatar\.imageSrc/);
assert.match(tierRankingView, /include\("ranking-player"/);
assert.match(arenaRankingView, /include\("partials\/ranking-player"/);
assert.match(finalRankingView, /include\("partials\/ranking-player"/);
assert.match(read("public/css/tier-rankings.css"), /\.ranking-profile-avatar/);

async function verifySquareCustomAvatarProcessing() {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "matths-profile-avatar-test-")
  );
  const inputPath = path.join(temporaryDirectory, "wide-photo.png");
  let outputPath = "";
  try {
    await sharp({
      create: {
        width: 900,
        height: 450,
        channels: 3,
        background: { r: 52, g: 82, b: 214 },
      },
    })
      .png()
      .toFile(inputPath);
    const inputStats = fs.statSync(inputPath);
    const prepared = await createSquareProfileAvatarFile({
      path: inputPath,
      originalname: "wide-photo.png",
      mimetype: "image/png",
      size: inputStats.size,
      contentValidated: true,
    });
    outputPath = prepared.path;
    const metadata = await sharp(prepared.path).metadata();
    assert.equal(metadata.width, PROFILE_AVATAR_SIZE);
    assert.equal(metadata.height, PROFILE_AVATAR_SIZE);
    assert.equal(metadata.format, "webp");
  } finally {
    if (outputPath) fs.unlinkSync(outputPath);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

verifySquareCustomAvatarProcessing()
  .then(() => {
    console.log("커스텀 사진 업로드·정사각형 변환·아바타 표시 검증을 통과했습니다.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
