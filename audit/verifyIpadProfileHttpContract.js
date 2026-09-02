"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");

process.env.NODE_ENV = "development";
process.env.HOST = "127.0.0.1";
mongoose.set("bufferCommands", false);

const PROFILE_ROUTES = [
  ["GET", "/me"],
  ["PATCH", "/me/nickname"],
  ["PATCH", "/me/avatar/preset"],
  ["POST", "/me/avatar/custom"],
  ["PATCH", "/me/coach-mode"],
  ["PATCH", "/me/tutorials/dashboard"],
  ["PATCH", "/me/tutorials/arena"],
];

function verifyRegistration() {
  const router = require("../routes/api-routes");
  const found = new Map();
  let behindAuth = false;
  for (const layer of router.stack) {
    if ((layer.name || layer.handle?.name) === "requireApiAuth") behindAuth = true;
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      found.set(`${method.toUpperCase()} ${layer.route.path}`, behindAuth);
    }
  }
  for (const [method, path] of PROFILE_ROUTES) {
    assert.equal(found.get(`${method} ${path}`), true, `${method} ${path} must be behind Bearer auth`);
  }
}

function verifyCanonicalViews() {
  const { resolveArenaProfileAvatar } = require("../services/arenaProfileAvatarService");
  const { buildArenaActivityLevel } = require("../services/arenaActivityLevelService");
  const { dashboardTutorialView } = require("../services/dashboardTutorialService");
  const { arenaTutorialView } = require("../services/arenaTutorialService");
  assert.equal(resolveArenaProfileAvatar({ arenaAvatarCode: "NOVA_GOAT" }).code, "NOVA_GOAT");
  assert.equal(buildArenaActivityLevel(15).level, 3);
  assert.equal(dashboardTutorialView({ dashboardTutorialStatus: "PENDING" }).shouldAutoStart, true);
  assert.deepEqual(
    arenaTutorialView({}, { activeDivision: "SUB" }).availableChapters,
    ["common", "unranked", "unranked_match"]
  );
}

function verifyLeaderboardProfileContract() {
  const source = fs.readFileSync(
    path.join(__dirname, "../controllers/ipadLegacyArenaController.js"),
    "utf8"
  );
  assert.match(source, /getArenaActivityLevels/);
  assert.match(source, /profileAvatar:/);
  assert.match(source, /arenaActivityLevel:/);
}

function verifyNicknameContract() {
  const source = fs.readFileSync(
    path.join(__dirname, "../controllers/apiController.js"),
    "utf8"
  );
  assert.match(source, /exports\.updateNickname/);
  assert.match(source, /validateNickname\(req\.body\?\.nickname\)/);
  assert.match(source, /nameNormalized: nicknameKey\(nickname\)/);
  assert.match(source, /NICKNAME_TAKEN/);
  assert.doesNotMatch(
    source.slice(source.indexOf("exports.updateNickname"), source.indexOf("exports.updateNickname") + 1800),
    /realName\s*:/
  );
}

async function main() {
  verifyRegistration();
  verifyCanonicalViews();
  verifyLeaderboardProfileContract();
  verifyNicknameContract();
  console.log("iPad profile API verified: Bearer routes, nickname, avatar, activity level, coach, tutorials and leaderboard profile fields.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
