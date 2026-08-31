"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const view = fs.readFileSync(path.join(root, "views/main.ejs"), "utf8");
const script = fs.readFileSync(path.join(root, "public/js/main.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "public/css/main.css"), "utf8");
const dashboardStyles = fs.readFileSync(
  path.join(root, "public/css/main-dashboard-v0.css"),
  "utf8"
);
const dashboardService = fs.readFileSync(
  path.join(root, "services/dashboardService.js"),
  "utf8"
);
const coachService = fs.readFileSync(
  path.join(root, "services/coachMessageService.js"),
  "utf8"
);
const learningView = fs.readFileSync(
  path.join(root, "views/partials/concept-experience.ejs"),
  "utf8"
);
const learningScript = fs.readFileSync(
  path.join(root, "public/js/concept-experience.js"),
  "utf8"
);
const learningStyles = fs.readFileSync(
  path.join(root, "public/css/concept-experience.css"),
  "utf8"
);
const myLearningView = fs.readFileSync(
  path.join(root, "views/my-learning.ejs"),
  "utf8"
);
const unitLearningView = fs.readFileSync(
  path.join(root, "views/unit-learning.ejs"),
  "utf8"
);
const controller = fs.readFileSync(
  path.join(root, "controllers/matthsController.js"),
  "utf8"
);
const assetDirectory = path.join(root, "public/images/coach-characters");
const tones = ["mild", "spicy"];
const characters = ["goat", "pigeon", "llama"];

async function main() {
  assert.match(
    view,
    /\["mild", "spicy"\]\.includes\(data\.coach\.mode\)[\s\S]*data-dashboard-coach-character/,
    "순한맛과 매운맛 사용자에게 캐릭터가 렌더링되어야 합니다."
  );
  assert.match(
    view,
    /data-dashboard-coach-character-image/,
    "대시보드 코치 캐릭터 이미지 훅이 필요합니다."
  );
  assert.doesNotMatch(
    view,
    /data-character-static|\/images\/dashboard\/coach-mascot\.png/,
    "학습 홈에서 맛별 캐릭터 로직을 막는 정적 대체 이미지를 사용하면 안 됩니다."
  );
  assert.match(
    view,
    /\/images\/coach-characters\/<%= data\.coach\.mode === 'spicy' \? 'spicy' : 'mild' %>-goat-1\.webp/,
    "첫 화면부터 사용자 말투에 맞는 캐릭터 자산을 사용해야 합니다."
  );
  assert.match(
    script,
    /Math\.floor\(Math\.random\(\) \* coachCharacters\.length\)/,
    "코치 캐릭터는 무작위로 선택되어야 합니다."
  );
  assert.match(
    script,
    /stage\.dataset\.characterTone === "spicy" \? "spicy" : "mild"/,
    "사용자의 말투 설정에 맞는 캐릭터 세트를 선택해야 합니다."
  );
  assert.match(
    script,
    /setInterval\(showNextFrame, 2000\)/,
    "캐릭터 컷은 2초 간격으로 순환해야 합니다."
  );
  assert.match(
    script,
    /prefers-reduced-motion: reduce/,
    "모션 최소화 사용자에게 정적 화면을 제공해야 합니다."
  );
  assert.match(
    script,
    /visibilitychange/,
    "숨겨진 탭에서는 캐릭터 순환을 멈춰야 합니다."
  );
  assert.match(
    styles,
    /\.dashboard-coach-character\s*\{/,
    "캐릭터 스테이지 스타일이 필요합니다."
  );
  const dashboardCharacterRule = dashboardStyles.match(
    /\.dashboard-home \.dashboard-coach-character\s*\{([\s\S]*?)\}/
  )?.[1] || "";
  assert.match(
    dashboardCharacterRule,
    /overflow:\s*visible/,
    "학습 홈 캐릭터는 카드 밖으로 자연스럽게 돌출될 수 있어야 합니다."
  );
  assert.match(
    dashboardCharacterRule,
    /background:\s*transparent/,
    "학습 홈 캐릭터에 별도 배경 프레임을 넣으면 안 됩니다."
  );
  assert.doesNotMatch(
    dashboardCharacterRule,
    /brand-soft/,
    "학습 홈 캐릭터에 색상 프레임을 넣으면 안 됩니다."
  );
  assert.match(
    dashboardCharacterRule,
    /border-radius:\s*0(?:;|\s|$)/,
    "학습 홈 캐릭터에 둥근 사각형 프레임을 넣으면 안 됩니다."
  );
  assert.match(
    dashboardStyles,
    /\.dashboard-home \.dashboard-coach-character img\s*\{[\s\S]*?drop-shadow/,
    "투명 캐릭터에는 입체감을 위한 그림자가 필요합니다."
  );
  assert.match(
    coachService,
    /content_folder[\s\S]*coach-messages\.yaml[\s\S]*yaml\.load/,
    "코치 문구 서비스는 YAML 원본을 읽어야 합니다."
  );
  assert.match(
    dashboardService,
    /getCoachView\(\{[\s\S]*?situation:\s*coachSituation[\s\S]*?random:\s*true/,
    "학습 홈 문구는 코치 문구 서비스에서 무작위로 받아야 합니다."
  );
  assert.match(
    view,
    /<%= data\.coach\.message %>/,
    "학습 홈은 서비스가 전달한 코치 문구를 렌더링해야 합니다."
  );
  assert.doesNotMatch(
    `${view}\n${dashboardService}`,
    /공식만 외우면 숫자가 바뀌는 순간 막힙니다\.|또 화면만 켜놓고 공부한 척이냐/,
    "실제 학습 홈 경로에 코치 문구를 하드코딩하면 안 됩니다."
  );
  assert.match(
    learningView,
    /data-problem-coach-character[\s\S]*data-problem-coach-character-image/,
    "내 학습 문제 피드백에 코치 캐릭터 훅이 필요합니다."
  );
  assert.match(
    learningScript,
    /\["mild", "spicy"\]\.includes\(mode\)/,
    "내 학습 문제 피드백은 설정한 맛에 맞는 캐릭터를 골라야 합니다."
  );
  assert.match(
    learningScript,
    /Math\.random\(\) \* coachCharacterNames\.length/,
    "내 학습 코치 캐릭터도 무작위로 선택되어야 합니다."
  );
  assert.match(
    learningScript,
    /window\.setInterval\(\(\) => \{[\s\S]*?\}, 2000\)/,
    "내 학습 코치 캐릭터 컷은 2초 간격으로 순환해야 합니다."
  );
  assert.match(
    learningStyles,
    /\.problem-coach-message\s*\{[\s\S]*?font-size:\s*clamp\(19px/,
    "내 학습 독설 문구는 충분히 크게 보여야 합니다."
  );
  for (const learningSidebarView of [myLearningView, unitLearningView]) {
    assert.match(
      learningSidebarView,
      /profile-avatar profile-avatar-image[\s\S]*arenaProfileAvatar\.imageSrc/,
      "학습 사이드바는 프로필 페이지와 같은 아바타 이미지를 사용해야 합니다."
    );
  }
  assert.match(
    controller,
    /function getRequestProfileAvatar\(req\)[\s\S]*resolveArenaProfileAvatar/,
    "대시보드와 학습 화면은 한 아바타 해석 함수를 공유해야 합니다."
  );
  assert.equal(
    (controller.match(/arenaProfileAvatar: getRequestProfileAvatar\(req\)/g) || []).length,
    3,
    "학습 홈, 내 학습, 단원 학습 모두 같은 아바타를 전달해야 합니다."
  );

  const assetChecks = [];
  for (const tone of tones) {
    for (const character of characters) {
      for (let frame = 1; frame <= 3; frame += 1) {
        const name = `${tone}-${character}-${frame}.webp`;
        const filePath = path.join(assetDirectory, name);
        assert.ok(fs.existsSync(filePath), `${name} 파일이 필요합니다.`);
        assert.ok(
          fs.statSync(filePath).size < 100 * 1024,
          `${name}은 100KB 미만이어야 합니다.`
        );
        const metadata = await sharp(filePath).metadata();
        assert.equal(metadata.format, "webp", `${name}은 WebP여야 합니다.`);
        assert.equal(metadata.hasAlpha, true, `${name}은 투명 배경이어야 합니다.`);
        assert.equal(metadata.width, 360, `${name}의 너비는 360px이어야 합니다.`);
        assetChecks.push(name);
      }
    }
  }

  console.log(
    `Learning coach character and profile avatar verification passed (${assetChecks.length} shared frames).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
