const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(
    path.join(root, relativePath),
    "utf8"
  );
const size = (relativePath) =>
  fs.statSync(
    path.join(root, relativePath)
  ).size;

function main() {
  const packageData = JSON.parse(
    read("package.json")
  );
  assert.ok(
    packageData.dependencies?.compression,
    "응답 압축 의존성이 필요합니다."
  );

  const serverSource = read("server.js");
  assert.match(
    serverSource,
    /server\.use\(compression\(/,
    "Express 응답 압축 미들웨어가 필요합니다."
  );
  assert.match(
    serverSource,
    /staticAssetFingerprint/,
    "정적 자산 내용 기반 버전이 필요합니다."
  );
  assert.match(
    serverSource,
    /max-age=31536000, immutable/,
    "버전이 붙은 정적 자산은 장기 캐시해야 합니다."
  );
  assert.match(
    serverSource,
    /versionStaticAssetReferences/,
    "렌더링된 CSS·JS URL에 자산 버전을 붙여야 합니다."
  );

  const dashboardSource = read(
    "services/dashboardService.js"
  );
  assert.match(
    dashboardSource,
    /\$facet:\s*\{/,
    "대시보드 알림 조회는 한 번의 facet 집계로 합쳐야 합니다."
  );
  assert.match(
    dashboardSource,
    /DASHBOARD_ANNOUNCEMENT_CACHE_TTL_MS/,
    "공용 대시보드 공지 캐시가 필요합니다."
  );

  const {
    clearCurriculumCache,
    loadCurriculum,
  } = require("../services/curriculumService");
  clearCurriculumCache();
  const firstCurriculum = loadCurriculum();
  assert.equal(
    loadCurriculum(),
    firstCurriculum,
    "교육과정 반복 파싱을 막는 메모리 캐시가 필요합니다."
  );

  const navigationSource = read(
    "public/js/navigation-performance.js"
  );
  new vm.Script(navigationSource);
  assert.match(
    navigationSource,
    /rel = "prefetch"/,
    "메뉴 의도 기반 사전 로딩이 필요합니다."
  );
  assert.match(
    navigationSource,
    /matths-is-navigating/,
    "메뉴 이동 피드백이 필요합니다."
  );

  for (const partial of [
    "views/partials/home-public-navigation.ejs",
    "views/partials/dashboard-navigation.ejs",
    "views/partials/goat-arena-navigation.ejs",
    "views/partials/admin-navigation.ejs",
    "views/partials/parent-navigation.ejs",
  ]) {
    assert.match(
      read(partial),
      /\/js\/navigation-performance\.js/,
      `${partial}에서 메뉴 성능 런타임을 불러와야 합니다.`
    );
  }

  const arenaView = read("views/goat-arena.ejs");
  assert.match(
    arenaView,
    /preload="metadata"/,
    "Arena 영상은 초기 화면을 막지 않도록 metadata만 먼저 읽어야 합니다."
  );
  assert.match(
    arenaView,
    /goatArena-mobile\.mp4/,
    "모바일 전용 Arena 영상이 필요합니다."
  );
  assert.match(
    arenaView,
    /goatArena-desktop\.mp4/,
    "데스크톱 전용 Arena 영상이 필요합니다."
  );

  assert.ok(
    size("public/videos/goatArena-desktop.mp4") <
      9 * 1024 * 1024,
    "데스크톱 Arena 영상은 9MB 미만이어야 합니다."
  );
  assert.ok(
    size("public/videos/goatArena-mobile.mp4") <
      3 * 1024 * 1024,
    "모바일 Arena 영상은 3MB 미만이어야 합니다."
  );
  assert.ok(
    size("public/images/goat-arena/arena-hero.webp") <
      200 * 1024,
    "Arena 포스터는 200KB 미만이어야 합니다."
  );

  assert.equal(
    fs.existsSync(
      path.join(root, "public/videos/goatArena.mp4")
    ),
    false,
    "사용하지 않는 대용량 Arena 원본을 배포 대상에 남기지 않습니다."
  );
  assert.equal(
    fs.existsSync(
      path.join(root, "public/images/goat-arena/arena-hero.jpg")
    ),
    false,
    "사용하지 않는 Arena JPG 포스터를 배포 대상에 남기지 않습니다."
  );

  const rankNames = [
    "bronze",
    "silver",
    "gold",
    "platinum",
    "emerald",
    "diamond",
    "master",
    "grandmaster",
    "challenger",
  ];
  const rankWebpBytes = rankNames.reduce(
    (total, name) =>
      total +
      size(
        `public/images/ranks/${name}.webp`
      ),
    0
  );
  assert.ok(
    rankWebpBytes < 1.5 * 1024 * 1024,
    "Arena 티어 이미지 전체는 1.5MB 미만이어야 합니다."
  );
  for (const name of rankNames) {
    assert.equal(
      fs.existsSync(
        path.join(
          root,
          `public/images/ranks/${name}.png`
        )
      ),
      false,
      `${name} PNG 원본을 배포 대상에 남기지 않습니다.`
    );
  }
  assert.match(
    read("views/index.ejs"),
    /images\/ranks\/[\s\S]*?loading="lazy"[\s\S]*?decoding="async"/,
    "홈 랭킹 휘장은 첫 화면과 경쟁하지 않도록 지연 로딩해야 합니다."
  );

  const rankMotionFiles = [
    "bronze-rank-up.v6.mp4",
    "silver-rank-up.v6.mp4",
    "gold-rank-up.v6.mp4",
    "platinum-rank-up.v7.mp4",
    "emerald-rank-up.v6.mp4",
    "diamond-rank-up.v6.mp4",
    "master-rank-up.v6.mp4",
    "grandmaster-rank-up.v6.mp4",
    "challenger-rank-up.v12.mp4",
  ];
  const rankMotionBytes = rankMotionFiles.reduce(
    (total, fileName) =>
      total +
      size(
        `public/media/rank-motion/${fileName}`
      ),
    0
  );
  assert.ok(
    rankMotionBytes < 20 * 1024 * 1024,
    "승급 연출 영상 전체는 20MB 미만이어야 합니다."
  );
  assert.match(
    read("views/partials/rank-motion-dialog.ejs"),
    /preload="none"/,
    "승급 연출은 실제 표시 전까지 영상을 미리 받지 않아야 합니다."
  );

  assert.ok(
    size("public/images/store/store-hero-bg.webp") <
      100 * 1024,
    "수험관 히어로 이미지는 100KB 미만이어야 합니다."
  );
  assert.equal(
    fs.existsSync(
      path.join(
        root,
        "public/images/store/store-hero-bg.png"
      )
    ),
    false,
    "사용하지 않는 수험관 PNG 원본을 배포 대상에 남기지 않습니다."
  );

  console.log(
    "Navigation performance optimizations verified: compression, caches, intent prefetch, loading feedback, and responsive Arena media."
  );
}

main();
