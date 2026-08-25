"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const view = fs.readFileSync(path.join(root, "views/main.ejs"), "utf8");
const script = fs.readFileSync(path.join(root, "public/js/main.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "public/css/main.css"), "utf8");
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
