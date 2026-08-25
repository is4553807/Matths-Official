const assert = require("node:assert/strict");
const Module = require("node:module");
const mongoose = require("mongoose");

process.env.APP_BASE_URL = "https://www.matths.kr";

const originalLoad = Module._load;
const registeredHandlers = new Map();
const notifications = new Map();
const sentEmails = [];
let currentMatch = null;
let currentUser = null;
let emailFailure = null;

function leanResult(value) {
  return {
    select() {
      return this;
    },
    lean: async () => value,
  };
}

const ArenaMatch = {
  findById() {
    return leanResult(currentMatch);
  },
};

const User = {
  findById() {
    return leanResult(currentUser);
  },
};

const UserNotification = {
  findOne({ dedupeKey }) {
    return leanResult(notifications.get(dedupeKey) || null);
  },
  findOneAndUpdate({ dedupeKey }, update) {
    const existing = notifications.get(dedupeKey);
    const notification = existing || {
      _id: new mongoose.Types.ObjectId(),
      ...update.$setOnInsert,
    };
    notifications.set(dedupeKey, notification);
    return leanResult(notification);
  },
};

Module._load = function loadWithArenaNotificationStubs(request, parent, isMain) {
  if (parent?.filename?.endsWith("services/arenaNotificationService.js")) {
    if (request === "../models/goatArenaModel") {
      return {
        ArenaAccessState: {},
        ArenaMatch,
        ArenaMatchAttempt: {},
        ArenaMatchEvidence: {},
        MainFriendlyInvitation: {},
        MainInvitationRequest: {},
      };
    }
    if (request === "../models/matthsModel") {
      return { User, UserNotification };
    }
    if (request === "./emailService") {
      return {
        async sendAdminUserEmail(message) {
          sentEmails.push(message);
          if (emailFailure) throw emailFailure;
          return { delivered: true, providerMessageId: "test-message" };
        },
      };
    }
    if (request === "./adminIdentityService") {
      return { getActiveAdminSender: async () => null };
    }
    if (request === "./arenaOutboxService") {
      return {
        registerArenaOutboxHandler(eventType, handler) {
          registeredHandlers.set(eventType, handler);
        },
      };
    }
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  notifyArenaMatchDefender,
  registerArenaNotificationOutboxHandlers,
} = require("../services/arenaNotificationService");
Module._load = originalLoad;

function setFixture({ matchType = "NORMAL", division = "SUB", email = "defender@example.com" } = {}) {
  const defenderId = new mongoose.Types.ObjectId();
  currentMatch = {
    _id: new mongoose.Types.ObjectId(),
    division,
    matchType,
    defender: { userId: defenderId },
  };
  currentUser = {
    _id: defenderId,
    name: "방어자",
    email,
  };
  return currentMatch;
}

async function main() {
  const normalMatch = setFixture();
  await notifyArenaMatchDefender({ matchId: normalMatch._id });
  assert.equal(sentEmails.length, 1, "자동 방어 배정은 이메일을 한 번 발송해야 합니다.");
  assert.equal(sentEmails[0].to, "defender@example.com");
  assert.equal(sentEmails[0].subject, "방어해야 할 경기가 배정되었습니다");
  assert.equal(sentEmails[0].actionLabel, "방어 경기 확인");
  assert.equal(
    sentEmails[0].actionUrl,
    `https://www.matths.kr/goat-arena/matches/${normalMatch._id}`
  );
  assert.equal(
    sentEmails[0].idempotencyKey,
    `arena-defense-assigned:${normalMatch._id}`
  );

  await notifyArenaMatchDefender({ matchId: normalMatch._id });
  assert.equal(sentEmails.length, 1, "같은 경기의 재처리는 이메일을 중복 발송하면 안 됩니다.");

  const revengeMatch = setFixture({ matchType: "REVENGE", division: "MAIN" });
  await notifyArenaMatchDefender({ matchId: revengeMatch._id });
  assert.equal(sentEmails.length, 2, "Ranked 복수전 방어 배정도 이메일을 발송해야 합니다.");
  assert.match(sentEmails[1].message, /Ranked 복수전이 자동 배정/);

  const friendlyMatch = setFixture({ matchType: "FRIENDLY", division: "MAIN" });
  await notifyArenaMatchDefender({ matchId: friendlyMatch._id });
  assert.equal(sentEmails.length, 2, "직접 수락한 친선전은 자동 방어 이메일에서 제외해야 합니다.");

  const failedMatch = setFixture();
  emailFailure = new Error("SMTP unavailable");
  const originalConsoleError = console.error;
  let loggedFailure = false;
  console.error = () => {
    loggedFailure = true;
  };
  try {
    await assert.doesNotReject(() =>
      notifyArenaMatchDefender({ matchId: failedMatch._id })
    );
  } finally {
    console.error = originalConsoleError;
    emailFailure = null;
  }
  assert.equal(loggedFailure, true, "이메일 공급자 오류는 운영 로그에 남겨야 합니다.");
  assert.ok(
    notifications.has(`arena-defense-assigned:${failedMatch._id}`),
    "이메일 발송 실패가 우편함 알림 생성을 되돌리면 안 됩니다."
  );

  registerArenaNotificationOutboxHandlers();
  assert.equal(typeof registeredHandlers.get("ArenaMatchCreated"), "function");
  assert.equal(typeof registeredHandlers.get("ArenaRevengeMatchCreated"), "function");

  console.log("Arena defense email notification verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
